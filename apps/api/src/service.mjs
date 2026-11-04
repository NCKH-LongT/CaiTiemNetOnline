import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  cookie,
  hashPassword,
  hashToken,
  newToken,
  setCookie,
  verifyPassword,
} from './security.mjs';

const dataDir = process.env.DATA_DIR || '/app/data';
const playerFields = 'id,username,nickname,fullname,avatar_url,x,z,balance_seconds,donated_seconds,online_seconds';
const error = (message, status = 400) => Object.assign(new Error(message), { status });
export function json(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
}
export async function body(request, max = 3_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > max) throw error('payload_too_large', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw error('invalid_json');
  }
}
export function checkOrigin(request) {
  const origin = request.headers.origin;
  if (origin && new URL(origin).host !== request.headers.host) throw error('invalid_origin', 403);
}
export async function session(pool, request) {
  const token = cookie(request, 'netverse_session');
  if (!token) return null;
  const result = await pool.query(
    `SELECT ${playerFields} FROM player_sessions s JOIN players p ON p.id=s.player_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}
export async function adminSession(pool, request) {
  const token = cookie(request, 'netverse_admin');
  if (!token) return false;
  const result = await pool.query(
    'SELECT 1 FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()',
    [hashToken(token)],
  );
  return result.rowCount > 0;
}
export async function createSession(pool, response, playerId) {
  const token = newToken();
  await pool.query("INSERT INTO player_sessions VALUES ($1,$2,now()+interval '30 days')", [
    hashToken(token),
    playerId,
  ]);
  setCookie(response, 'netverse_session', token, 30 * 24 * 3600);
}
export async function storeImage(dataUrl, kind) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!match) throw error('invalid_image');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 2_000_000) throw error('image_size');
  const mime = match[1];
  const valid =
    mime === 'png'
      ? buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : mime === 'jpeg'
        ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
        : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw error('invalid_image');
  const filename = `${kind}-${randomUUID()}.${mime === 'jpeg' ? 'jpg' : mime}`;
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, filename), buffer, { flag: 'wx' });
  return `/api/media/${filename}`;
}
export async function serveMedia(response, filename) {
  if (!/^[a-z]+-[0-9a-f-]+\.(png|jpg|webp|glb|gltf)$/.test(filename))
    return json(response, 404, { error: 'not_found' });
  try {
    const file = await readFile(path.join(dataDir, filename));
    const ext = filename.split('.').at(-1);
    response.writeHead(200, {
      'content-type': {
        png: 'image/png',
        jpg: 'image/jpeg',
        webp: 'image/webp',
        glb: 'model/gltf-binary',
        gltf: 'model/gltf+json',
      }[ext],
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
    });
    response.end(file);
  } catch {
    json(response, 404, { error: 'not_found' });
  }
}
export async function playerRoutes(pool, redis, request, response, route) {
  const method = request.method;
  if (route === '/api/auth/register' && method === 'POST') {
    const data = await body(request);
    const username = String(data.username || '').trim();
    const nickname = String(data.nickname || '').trim();
    const fullname = String(data.fullname || '').trim();
    const password = String(data.password || '');
    if (
      !/^[a-zA-Z0-9_]{3,24}$/.test(username) ||
      nickname.length < 2 ||
      nickname.length > 24 ||
      fullname.length < 2 ||
      fullname.length > 80 ||
      password.length < 8 ||
      password.length > 128
    )
      throw error('invalid_registration');
    const id = randomUUID();
    try {
      await pool.query(
        'INSERT INTO players (id,username,nickname,fullname,password_hash,balance_seconds) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          id,
          username,
          nickname,
          fullname,
          await hashPassword(password),
          Number(process.env.INITIAL_MINUTES || 60) * 60,
        ],
      );
    } catch (cause) {
      if (cause.code === '23505') throw error('username_or_nickname_taken', 409);
      throw cause;
    }
    await createSession(pool, response, id);
    const result = await pool.query(`SELECT ${playerFields} FROM players WHERE id=$1`, [id]);
    return json(response, 201, { player: result.rows[0] });
  }
  if (route === '/api/auth/login' && method === 'POST') {
    const data = await body(request);
    const result = await pool.query('SELECT * FROM players WHERE lower(username)=lower($1)', [
      String(data.username || '').trim(),
    ]);
    const player = result.rows[0];
    if (!player || !(await verifyPassword(String(data.password || ''), player.password_hash)))
      throw error('invalid_credentials', 401);
    await createSession(pool, response, player.id);
    delete player.password_hash;
    return json(response, 200, { player });
  }
  if (route === '/api/auth/logout' && method === 'POST') {
    const token = cookie(request, 'netverse_session');
    if (token)
      await pool.query('DELETE FROM player_sessions WHERE token_hash=$1', [hashToken(token)]);
    setCookie(response, 'netverse_session', '', 0);
    return json(response, 200, { ok: true });
  }
  if (route === '/api/auth/me' && method === 'GET')
    return json(response, 200, { player: await session(pool, request) });
  if (route === '/api/auth/ticket' && method === 'GET') {
    const player = await session(pool, request);
    if (!player) throw error('login_required', 401);
    const ticket = newToken();
    await redis.set(`netverse:ticket:${ticket}`, player.id, { EX: 30 });
    return json(response, 200, { ticket, player });
  }
  const player = await session(pool, request);
  if (route === '/api/player/artist' && method === 'GET') {
    if (!player) throw error('login_required', 401);
    const [uploads, likes] = await Promise.all([
      pool.query('SELECT count(*)::int AS total FROM art_images WHERE player_id=$1', [player.id]),
      pool.query(
        'SELECT count(*)::int AS total FROM art_votes v JOIN art_images a ON a.id=v.image_id WHERE a.player_id=$1 AND v.vote=1',
        [player.id],
      ),
    ]);
    const level = await pool.query(
      'SELECT level,name FROM artist_levels WHERE min_uploads <= $1 AND min_likes <= $2 ORDER BY level DESC LIMIT 1',
      [uploads.rows[0].total, likes.rows[0].total],
    );
    return json(response, 200, {
      uploads: uploads.rows[0].total,
      likes: likes.rows[0].total,
      level: level.rows[0] || null,
    });
  }
  if (route === '/api/player/save' && method === 'POST') {
    if (!player) throw error('login_required', 401);
    const data = await body(request);
    const x = Number(data.x),
      z = Number(data.z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 16.1 || Math.abs(z) > 32.1)
      throw error('invalid_position');
    await pool.query('UPDATE players SET x=$1,z=$2 WHERE id=$3', [x, z, player.id]);
    return json(response, 200, { saved: true });
  }
  if (route === '/api/player/profile' && method === 'POST') {
    if (!player) throw error('login_required', 401);
    const data = await body(request);
    const fullname = String(data.fullname || '').trim();
    const nickname = String(data.nickname || '').trim();
    if (fullname.length < 2 || fullname.length > 80 || nickname.length < 2 || nickname.length > 24)
      throw error('invalid_profile');
    const avatar = data.image ? await storeImage(data.image, 'avatar') : player.avatar_url;
    try {
      const result = await pool.query(
        `UPDATE players SET fullname=$1,nickname=$2,avatar_url=$3 WHERE id=$4 RETURNING ${playerFields}`,
        [fullname, nickname, avatar, player.id],
      );
      return json(response, 200, { player: result.rows[0] });
    } catch (cause) {
      if (cause.code === '23505') throw error('nickname_taken', 409);
      throw cause;
    }
  }
  if (route === '/api/player/gift' && method === 'POST') {
    if (!player) throw error('login_required', 401);
    const data = await body(request);
    const minutes = Number(data.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw error('invalid_minutes');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const recipient = await client.query(
        'SELECT id FROM players WHERE lower(nickname)=lower($1)',
        [String(data.nickname || '').trim()],
      );
      if (!recipient.rowCount || recipient.rows[0].id === player.id)
        throw error('invalid_recipient');
      const debit = await client.query(
        'UPDATE players SET balance_seconds=balance_seconds-$1,donated_seconds=donated_seconds+$1 WHERE id=$2 AND balance_seconds >= $1 RETURNING id',
        [minutes * 60, player.id],
      );
      if (!debit.rowCount) throw error('insufficient_minutes', 409);
      await client.query('UPDATE players SET balance_seconds=balance_seconds+$1 WHERE id=$2', [
        minutes * 60,
        recipient.rows[0].id,
      ]);
      await client.query('INSERT INTO gift_log VALUES ($1,$2,$3,$4)', [
        randomUUID(),
        player.id,
        recipient.rows[0].id,
        minutes * 60,
      ]);
      await client.query('COMMIT');
      return json(response, 200, { gifted: minutes });
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
  }
  return false;
}

async function requireSeat(redis, playerId, stationId) {
  if ((await redis.get(`netverse:seat:${stationId}`)) !== playerId)
    throw error('station_session_required', 403);
}

export async function contentRoutes(pool, redis, request, response, route) {
  const method = request.method;
  if (route === '/api/leaderboard' && method === 'GET') {
    const [rich, donors, art, board] = await Promise.all([
      pool.query(
        'SELECT nickname,avatar_url,balance_seconds FROM players ORDER BY balance_seconds DESC LIMIT 10',
      ),
      pool.query(
        'SELECT nickname,avatar_url,donated_seconds FROM players ORDER BY donated_seconds DESC LIMIT 5',
      ),
      pool.query(
        `SELECT a.id,a.image_url,a.title,a.station_id,p.nickname,p.avatar_url,count(v.player_id) FILTER (WHERE v.vote=1)::int AS likes FROM art_images a JOIN players p ON p.id=a.player_id LEFT JOIN art_votes v ON v.image_id=a.id WHERE a.deleted_at IS NULL GROUP BY a.id,p.id ORDER BY likes DESC,a.created_at DESC LIMIT 10`,
      ),
      pool.query('SELECT background_url,background_color FROM board_settings WHERE id=1'),
    ]);
    return json(response, 200, { rich: rich.rows, donors: donors.rows, art: art.rows, board: board.rows[0] });
  }
  const pcMatch = /^\/api\/pc\/(\d+)$/.exec(route);
  if (pcMatch) {
    const stationId = Number(pcMatch[1]);
    if (stationId < 1 || stationId > 200) throw error('not_found', 404);
    if (method === 'GET') {
      const [state, images] = await Promise.all([
        pool.query('SELECT wallpaper_url,browser_url FROM pc_states WHERE station_id=$1', [
          stationId,
        ]),
        pool.query(
          `SELECT a.id,a.image_url,a.title,a.created_at,p.nickname,p.avatar_url,count(v.player_id) FILTER (WHERE v.vote=1)::int AS likes,count(v.player_id) FILTER (WHERE v.vote=-1)::int AS unlikes FROM art_images a JOIN players p ON p.id=a.player_id LEFT JOIN art_votes v ON v.image_id=a.id WHERE a.station_id=$1 AND a.deleted_at IS NULL GROUP BY a.id,p.id ORDER BY a.created_at DESC`,
          [stationId],
        ),
      ]);
      return json(response, 200, { state: state.rows[0] || {}, images: images.rows });
    }
    if (method === 'POST') {
      const player = await session(pool, request);
      if (!player) throw error('login_required', 401);
      await requireSeat(redis, player.id, stationId);
      const data = await body(request);
      const wallpaper = data.wallpaper ? await storeImage(data.wallpaper, 'wallpaper') : null;
      const browser = data.browserUrl == null ? null : String(data.browserUrl).trim();
      if (browser && (!/^https:\/\//i.test(browser) || browser.length > 2048))
        throw error('invalid_url');
      if (browser && new URL(browser).host === request.headers.host)
        throw error('own_site_not_allowed');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO pc_states (station_id,wallpaper_url,browser_url,updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT (station_id) DO UPDATE SET wallpaper_url=COALESCE(EXCLUDED.wallpaper_url,pc_states.wallpaper_url),browser_url=COALESCE(EXCLUDED.browser_url,pc_states.browser_url),updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [stationId, wallpaper, browser, player.id],
        );
        if (wallpaper)
          await client.query(
            'INSERT INTO art_images (id,station_id,player_id,image_url,title) VALUES ($1,$2,$3,$4,$5)',
            [randomUUID(), stationId, player.id, wallpaper, String(data.albumTitle || 'Hình nền PC').trim().slice(0, 80)],
          );
        await client.query('COMMIT');
      } catch (cause) {
        await client.query('ROLLBACK');
        if (wallpaper) await unlink(path.join(dataDir, path.basename(wallpaper))).catch(() => {});
        throw cause;
      } finally {
        client.release();
      }
      return json(response, 200, { saved: true });
    }
  }
  const player = await session(pool, request);
  if (route === '/api/art/upload' && method === 'POST') {
    if (!player) throw error('login_required', 401);
    const data = await body(request);
    const stationId = Number(data.stationId);
    if (!Number.isInteger(stationId) || stationId < 1 || stationId > 200)
      throw error('invalid_station');
    await requireSeat(redis, player.id, stationId);
    const image = await storeImage(data.image, 'art');
    const id = randomUUID();
    await pool.query(
      'INSERT INTO art_images (id,station_id,player_id,image_url,title) VALUES ($1,$2,$3,$4,$5)',
      [
        id,
        stationId,
        player.id,
        image,
        String(data.title || '')
          .trim()
          .slice(0, 80),
      ],
    );
    return json(response, 201, { id, image_url: image });
  }
  if (route === '/api/art/vote' && method === 'POST') {
    if (!player) throw error('login_required', 401);
    const data = await body(request);
    const vote = Number(data.vote);
    if (![-1, 1].includes(vote)) throw error('invalid_vote');
    const client = await pool.connect();
    let deleted = false;
    let imageUrl;
    try {
      await client.query('BEGIN');
      const image = await client.query(
        'SELECT id,station_id,player_id,image_url,created_at FROM art_images WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
        [data.imageId],
      );
      if (!image.rowCount || image.rows[0].player_id === player.id) throw error('invalid_image');
      imageUrl = image.rows[0].image_url;
      if (vote === -1) {
        const visited = await client.query(
          'SELECT 1 FROM pc_visitors WHERE station_id=$1 AND player_id=$2 AND visited_at >= $3',
          [image.rows[0].station_id, player.id, image.rows[0].created_at],
        );
        if (!visited.rowCount) throw error('visit_pc_before_unlike', 403);
      }
      const inserted = await client.query(
        'INSERT INTO art_votes VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING vote',
        [data.imageId, player.id, vote],
      );
      if (!inserted.rowCount) throw error('already_voted', 409);
      if (vote === 1)
        await client.query('UPDATE players SET balance_seconds=balance_seconds+600 WHERE id=$1', [
          image.rows[0].player_id,
        ]);
      const visitors = await client.query(
        'SELECT count(*)::int AS total FROM pc_visitors WHERE station_id=$1 AND visited_at >= $2',
        [image.rows[0].station_id, image.rows[0].created_at],
      );
      const unlikes = await client.query(
        'SELECT count(*)::int AS total FROM art_votes WHERE image_id=$1 AND vote=-1',
        [data.imageId],
      );
      deleted = visitors.rows[0].total >= 5 && unlikes.rows[0].total * 2 > visitors.rows[0].total;
      if (deleted)
        await client.query('UPDATE art_images SET deleted_at=now() WHERE id=$1', [data.imageId]);
      await client.query('COMMIT');
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
    if (deleted) {
      const wallpaper = await pool.query('SELECT 1 FROM pc_states WHERE wallpaper_url=$1 LIMIT 1', [imageUrl]);
      if (!wallpaper.rowCount)
        await unlink(path.join(dataDir, path.basename(imageUrl))).catch((cause) =>
          console.error('Art file cleanup failed:', cause),
        );
    }
    return json(response, 200, { accepted: true, deleted });
  }
  return false;
}
