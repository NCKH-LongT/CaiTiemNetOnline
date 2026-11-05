import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import characters from '../../../shared/characters.json' with { type: 'json' };
import world from '../../../shared/world.json' with { type: 'json' };
import {
  cookie,
  hashPassword,
  hashToken,
  newToken,
  setCookie,
  verifyPassword,
} from './security.mjs';

const dataDir = process.env.DATA_DIR || '/app/data';
const playerFields = 'id,username,nickname,fullname,avatar_url,character_id,x,z,balance_seconds,donated_seconds,online_seconds';
const characterIds = new Set(characters.map((item) => item.id));
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
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!match) throw error('invalid_image');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 2_000_000) throw error('image_size');
  const mime = match[1];
  if (mime === 'gif' && kind !== 'badge') throw error('invalid_image');
  if (kind === 'badge' && !['png', 'gif'].includes(mime)) throw error('invalid_image');
  const valid =
    mime === 'png'
      ? buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : mime === 'gif'
        ? ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))
        : mime === 'jpeg'
          ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
          : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw error('invalid_image');
  const filename = `${kind}-${randomUUID()}.${mime === 'jpeg' ? 'jpg' : mime}`;
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, filename), buffer, { flag: 'wx' });
  return `/api/media/${filename}`;
}
export async function serveMedia(response, filename, request) {
  if (!/^[a-z]+-[0-9a-f-]+\.(png|jpg|webp|gif|glb|gltf|mp3)$/.test(filename))
    return json(response, 404, { error: 'not_found' });
  try {
    const file = await readFile(path.join(dataDir, filename));
    const ext = filename.split('.').at(-1);
    const range = ext === 'mp3' && /^bytes=(\d+)-(\d*)$/.exec(request?.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), file.length - 1) : file.length - 1;
    if (start >= file.length || end < start) {
      response.writeHead(416, { 'content-range': `bytes */${file.length}` });
      response.end();
      return;
    }
    response.writeHead(range ? 206 : 200, {
      'content-type': {
        png: 'image/png',
        jpg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        glb: 'model/gltf-binary',
        gltf: 'model/gltf+json',
        mp3: 'audio/mpeg',
      }[ext],
      'cache-control': filename.startsWith('chat-') ? 'private, no-store' : 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-length': end - start + 1,
      ...(ext === 'mp3' ? { 'accept-ranges': 'bytes' } : {}),
      ...(range ? { 'content-range': `bytes ${start}-${end}/${file.length}` } : {}),
    });
    response.end(file.subarray(start, end + 1));
  } catch {
    json(response, 404, { error: 'not_found' });
  }
}
export async function playerRoutes(pool, redis, request, response, route) {
  const method = request.method;
  if (route === '/api/chat/image' && method === 'POST') {
    const player = await session(pool, request);
    if (!player) throw error('login_required', 401);
    const data = await body(request);
    const imageUrl = await storeImage(data.image, 'chat');
    try {
      await pool.query('INSERT INTO chat_images (id,player_id,image_url) VALUES ($1,$2,$3)', [randomUUID(), player.id, imageUrl]);
    } catch (cause) {
      await unlink(path.join(dataDir, path.basename(imageUrl))).catch(() => {});
      throw cause;
    }
    return json(response, 201, { imageUrl });
  }
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
  if (route === '/api/voice/ticket' && method === 'GET') {
    const player = await session(pool, request);
    if (!player) throw error('login_required', 401);
    const ticket = newToken();
    await redis.set(`netverse:voice-ticket:${ticket}`, player.id, { EX: 30 });
    const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    if (process.env.VOICE_TURN_URL && process.env.VOICE_TURN_SECRET) {
      const username = `${Math.floor(Date.now() / 1000) + 3600}:${player.id}`;
      iceServers.push({
        urls: process.env.VOICE_TURN_URL,
        username,
        credential: createHmac('sha1', process.env.VOICE_TURN_SECRET).update(username).digest('base64'),
      });
    }
    return json(response, 200, { ticket, iceServers });
  }
  const player = await session(pool, request);
  if (route === '/api/youtube/search' && method === 'GET') {
    if (!player) throw error('login_required', 401);
    if (!process.env.YOUTUBE_API_KEY) throw error('youtube_search_not_configured', 503);
    const query = new URL(request.url, 'http://localhost').searchParams.get('q')?.trim() || '';
    if (query.length < 2 || query.length > 100) throw error('invalid_search_query');
    const cacheKey = `netverse:youtube-search:${createHash('sha256').update(query.toLocaleLowerCase()).digest('hex')}`;
    const cached = await redis.get(cacheKey);
    if (cached) return json(response, 200, JSON.parse(cached));
    const rateKey = `netverse:youtube-search-rate:${player.id}`;
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 60);
    if (count > 20) throw error('search_rate_limited', 429);
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({
      part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '12',
      safeSearch: 'moderate', regionCode: 'VN', relevanceLanguage: 'vi', q: query,
      key: process.env.YOUTUBE_API_KEY,
    }).toString();
    const result = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!result.ok) throw error('youtube_search_unavailable', 502);
    const data = await result.json();
    const videos = (data.items || [])
      .filter((item) => /^[A-Za-z0-9_-]{11}$/.test(item?.id?.videoId || ''))
      .map((item) => ({
        id: item.id.videoId,
        title: String(item.snippet?.title || '').slice(0, 160),
        channel: String(item.snippet?.channelTitle || '').slice(0, 80),
        thumbnail: `https://i.ytimg.com/vi/${item.id.videoId}/mqdefault.jpg`,
      }));
    const payload = { videos };
    await redis.set(cacheKey, JSON.stringify(payload), { EX: 3600 });
    return json(response, 200, payload);
  }
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
      'SELECT level,name,badge_url FROM artist_levels WHERE min_uploads <= $1 AND min_likes <= $2 ORDER BY level DESC LIMIT 1',
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
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > world.width / 2 - 0.9 || Math.abs(z) > world.length / 2 - 0.9)
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
    const characterId = data.characterId === undefined ? player.character_id : String(data.characterId);
    if (!characterIds.has(characterId)) throw error('invalid_character');
    try {
      const result = await pool.query(
        `UPDATE players SET fullname=$1,nickname=$2,avatar_url=$3,character_id=$4 WHERE id=$5 RETURNING ${playerFields}`,
        [fullname, nickname, avatar, characterId, player.id],
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
  const publicProfile = /^\/api\/players\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(route);
  if (publicProfile && method === 'GET') {
    const result = await pool.query(
      `SELECT p.id,p.nickname,p.fullname,p.avatar_url,p.online_seconds,p.created_at,
        (SELECT count(*)::int FROM art_images a WHERE a.player_id=p.id AND a.deleted_at IS NULL) AS uploads,
        (SELECT count(*)::int FROM art_votes v JOIN art_images a ON a.id=v.image_id WHERE a.player_id=p.id AND v.vote=1) AS likes,
        (SELECT name FROM artist_levels WHERE min_uploads <=
          (SELECT count(*) FROM art_images a WHERE a.player_id=p.id) AND min_likes <=
          (SELECT count(*) FROM art_votes v JOIN art_images a ON a.id=v.image_id WHERE a.player_id=p.id AND v.vote=1)
          ORDER BY level DESC LIMIT 1) AS badge,
        (SELECT badge_url FROM artist_levels WHERE min_uploads <=
          (SELECT count(*) FROM art_images a WHERE a.player_id=p.id) AND min_likes <=
          (SELECT count(*) FROM art_votes v JOIN art_images a ON a.id=v.image_id WHERE a.player_id=p.id AND v.vote=1)
          ORDER BY level DESC LIMIT 1) AS badge_url
       FROM players p WHERE p.id=$1`,
      [publicProfile[1]],
    );
    if (!result.rowCount) throw error('player_not_found', 404);
    return json(response, 200, { profile: result.rows[0] });
  }
  if (route === '/api/leaderboard' && method === 'GET') {
    const [rich, donors, art, board] = await Promise.all([
      pool.query(
        'SELECT nickname,avatar_url,balance_seconds FROM players ORDER BY balance_seconds DESC LIMIT 10',
      ),
      pool.query(
        'SELECT nickname,avatar_url,donated_seconds FROM players ORDER BY donated_seconds DESC LIMIT 5',
      ),
      pool.query(
        `SELECT a.id,a.player_id,a.image_url,a.title,a.station_id,p.nickname,p.avatar_url,count(v.player_id) FILTER (WHERE v.vote=1)::int AS likes FROM art_images a JOIN players p ON p.id=a.player_id LEFT JOIN art_votes v ON v.image_id=a.id WHERE a.deleted_at IS NULL GROUP BY a.id,p.id ORDER BY likes DESC,a.created_at DESC LIMIT 10`,
      ),
      pool.query('SELECT background_url,background_color FROM board_settings WHERE id=1'),
    ]);
    return json(response, 200, { rich: rich.rows, donors: donors.rows, art: art.rows, board: board.rows[0] });
  }
  const pcMatch = /^\/api\/pc\/(\d+)$/.exec(route);
  if (pcMatch) {
    const stationId = Number(pcMatch[1]);
    if (stationId < 1 || stationId > world.stations.length) throw error('not_found', 404);
    if (method === 'GET') {
      const [state, images] = await Promise.all([
        pool.query('SELECT wallpaper_url,browser_url FROM pc_states WHERE station_id=$1', [
          stationId,
        ]),
        pool.query(
          `SELECT a.id,a.player_id,a.station_id,a.image_url,a.title,a.created_at,p.nickname,p.avatar_url,count(v.player_id) FILTER (WHERE v.vote=1)::int AS likes,count(v.player_id) FILTER (WHERE v.vote=-1)::int AS unlikes FROM art_images a JOIN players p ON p.id=a.player_id LEFT JOIN art_votes v ON v.image_id=a.id WHERE a.station_id=$1 AND a.deleted_at IS NULL GROUP BY a.id,p.id ORDER BY a.created_at DESC`,
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
  if (route === '/api/shortcuts' && method === 'GET') {
    if (!player) throw error('login_required', 401);
    const result = await pool.query(`SELECT s.id,s.title,s.url,s.player_id,p.nickname,
      count(v.player_id) FILTER (WHERE v.vote=1)::int AS likes,
      count(v.player_id) FILTER (WHERE v.vote=-1)::int AS dislikes,
      max(v.vote) FILTER (WHERE v.player_id=$1) AS my_vote
      FROM web_shortcuts s JOIN players p ON p.id=s.player_id
      LEFT JOIN web_shortcut_votes v ON v.shortcut_id=s.id
      WHERE s.deleted_at IS NULL GROUP BY s.id,p.id ORDER BY s.created_at DESC LIMIT 100`, [player.id]);
    return json(response, 200, { shortcuts: result.rows });
  }
  if (route === '/api/shortcuts' && method === 'POST') {
    if (!player) throw error('login_required', 401);
    const data = await body(request);
    const title = String(data.title || '').trim().slice(0, 60);
    let url;
    try { url = new URL(String(data.url || '').trim()); } catch { throw error('invalid_url'); }
    if (!title || url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password ||
      url.href.length > 2048 || url.host === request.headers.host) throw error('invalid_shortcut');
    url.hash = '';
    const result = await pool.query('INSERT INTO web_shortcuts (id,player_id,title,url) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
      [randomUUID(), player.id, title, url.href]);
    if (!result.rowCount) throw error('shortcut_exists', 409);
    return json(response, 201, { id: result.rows[0].id });
  }
  if (route === '/api/shortcuts/vote' && method === 'POST') {
    if (!player) throw error('login_required', 401);
    const data = await body(request);
    if (![-1, 1].includes(data.vote) || !/^[0-9a-f-]{36}$/i.test(String(data.shortcutId || '')))
      throw error('invalid_vote');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const shortcut = await client.query('SELECT player_id FROM web_shortcuts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [data.shortcutId]);
      if (!shortcut.rowCount || shortcut.rows[0].player_id === player.id) throw error('invalid_shortcut', 403);
      await client.query(`INSERT INTO web_shortcut_votes (shortcut_id,player_id,vote) VALUES ($1,$2,$3)
        ON CONFLICT (shortcut_id,player_id) DO UPDATE SET vote=EXCLUDED.vote`, [data.shortcutId, player.id, data.vote]);
      const counts = await client.query(`SELECT count(*) FILTER (WHERE vote=1)::int AS likes,
        count(*) FILTER (WHERE vote=-1)::int AS dislikes FROM web_shortcut_votes WHERE shortcut_id=$1`, [data.shortcutId]);
      const { likes, dislikes } = counts.rows[0];
      const deleted = dislikes >= 5 && dislikes > likes * 2;
      if (deleted) await client.query('UPDATE web_shortcuts SET deleted_at=now() WHERE id=$1', [data.shortcutId]);
      await client.query('COMMIT');
      return json(response, 200, { likes, dislikes, deleted });
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally { client.release(); }
  }
  if (route === '/api/art/wall' && method === 'GET') {
    const [total, images] = await Promise.all([
      pool.query('SELECT count(*)::int AS total FROM art_images WHERE deleted_at IS NULL'),
      pool.query(`SELECT a.id,a.station_id,a.image_url,a.title,p.nickname FROM art_images a
        JOIN players p ON p.id=a.player_id WHERE a.deleted_at IS NULL
        ORDER BY md5(a.id::text || current_date::text) LIMIT 48`),
    ]);
    return json(response, 200, { total: total.rows[0].total, images: images.rows });
  }
  if (route === '/api/art/upload' && method === 'POST') {
    if (!player) throw error('login_required', 401);
    const data = await body(request);
    const stationId = Number(data.stationId);
    if (!Number.isInteger(stationId) || stationId < 1 || stationId > world.stations.length)
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
