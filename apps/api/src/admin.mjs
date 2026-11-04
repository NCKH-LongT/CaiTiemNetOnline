import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { adminSession, body, json, storeImage } from './service.mjs';
import { cookie, hashToken, newToken, setCookie } from './security.mjs';

const dataDir = process.env.DATA_DIR || '/app/data';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const safeEqual = (left, right) => {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
};

async function verifyTurnstile(token) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  return Boolean(result.success);
}

function validateObject(data) {
  const x = Number(data.x),
    y = Number(data.y),
    z = Number(data.z),
    rotation = Number(data.rotation || 0),
    scale = Number(data.scale);
  if (
    ![x, y, z, rotation, scale].every(Number.isFinite) ||
    Math.abs(x) > 16 ||
    Math.abs(z) > 32 ||
    y < -1 ||
    y > 10 ||
    scale < 0.05 ||
    scale > 10
  )
    throw fail('invalid_transform');
  return { x, y, z, rotation, scale };
}

function validateGltfDocument(model) {
  if (model?.asset?.version !== '2.0') throw fail('invalid_gltf');
  const inspect = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (
        key === 'uri' &&
        typeof item === 'string' &&
        !/^data:(application\/octet-stream|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/.test(
          item,
        )
      )
        throw fail('gltf_external_files_not_supported');
      inspect(item);
    }
  };
  inspect(model);
}

export async function adminRoutes(pool, redis, request, response, route) {
  const method = request.method;
  if (route === '/api/admin/config' && method === 'GET')
    return json(response, 200, {
      sitekey: process.env.TURNSTILE_SITEKEY || null,
      configured: Boolean(
        process.env.ADMIN_USERNAME &&
          process.env.ADMIN_PASSWORD &&
          process.env.TURNSTILE_SITEKEY &&
          process.env.TURNSTILE_SECRET_KEY,
      ),
      gemini: Boolean(process.env.GEMINI_API_KEY),
    });
  if (route === '/api/admin/login' && method === 'POST') {
    if (
      !process.env.ADMIN_USERNAME ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.TURNSTILE_SITEKEY ||
      !process.env.TURNSTILE_SECRET_KEY
    )
      throw fail('admin_not_configured', 503);
    const key = `admin-login:${request.headers['x-real-ip'] || request.socket.remoteAddress}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, 900);
    if (attempts > 8) throw fail('too_many_attempts', 429);
    const data = await body(request);
    if (!(await verifyTurnstile(data.turnstileToken))) throw fail('captcha_failed', 403);
    if (
      !safeEqual(String(data.username || ''), process.env.ADMIN_USERNAME) ||
      !safeEqual(String(data.password || ''), process.env.ADMIN_PASSWORD)
    )
      throw fail('invalid_credentials', 401);
    await redis.del(key);
    const token = newToken();
    await pool.query("INSERT INTO admin_sessions VALUES ($1,now()+interval '8 hours')", [
      hashToken(token),
    ]);
    setCookie(response, 'netverse_admin', token, 8 * 3600);
    return json(response, 200, { ok: true });
  }
  if (route === '/api/admin/logout' && method === 'POST') {
    const token = cookie(request, 'netverse_admin');
    if (token)
      await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1', [hashToken(token)]);
    setCookie(response, 'netverse_admin', '', 0);
    return json(response, 200, { ok: true });
  }
  if (route === '/api/admin/me' && method === 'GET')
    return json(response, 200, { admin: await adminSession(pool, request) });
  if (route === '/api/world' && method === 'GET') {
    const result = await pool.query(
      'SELECT id,asset_url,x,y,z,rotation,scale FROM world_objects WHERE published=true ORDER BY created_at',
    );
    return json(response, 200, { objects: result.rows });
  }
  if (!route.startsWith('/api/admin/')) return false;
  if (!(await adminSession(pool, request))) throw fail('admin_required', 401);
  if (route === '/api/admin/board' && method === 'GET') {
    const result = await pool.query('SELECT background_url,background_color FROM board_settings WHERE id=1');
    return json(response, 200, { board: result.rows[0] });
  }
  if (route === '/api/admin/board' && method === 'POST') {
    const data = await body(request);
    const color = String(data.backgroundColor || '');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw fail('invalid_board_color');
    const previous = await pool.query('SELECT background_url FROM board_settings WHERE id=1');
    const image = data.image ? await storeImage(data.image, 'board') : null;
    let result;
    try {
      result = await pool.query(
        `UPDATE board_settings SET background_color=$1,background_url=CASE WHEN $2::boolean THEN NULL ELSE COALESCE($3,background_url) END WHERE id=1 RETURNING background_url,background_color`,
        [color, data.removeImage === true, image],
      );
    } catch (cause) {
      if (image) await unlink(path.join(dataDir, path.basename(image))).catch(() => {});
      throw cause;
    }
    const oldImage = previous.rows[0]?.background_url;
    if (oldImage && oldImage !== result.rows[0].background_url)
      await unlink(path.join(dataDir, path.basename(oldImage))).catch(() => {});
    return json(response, 200, { board: result.rows[0] });
  }
  if (route === '/api/admin/assets' && method === 'GET') {
    const result = await pool.query('SELECT * FROM asset_catalog ORDER BY created_at DESC');
    return json(response, 200, { assets: result.rows });
  }
  if (route === '/api/admin/assets' && method === 'POST') {
    const data = await body(request, 18_000_000);
    const name = String(data.name || '')
      .trim()
      .slice(0, 100);
    const license = String(data.license || '')
      .trim()
      .slice(0, 180);
    const kind = String(data.kind || '').toLowerCase();
    if (!name || !license || !['glb', 'gltf'].includes(kind) || typeof data.content !== 'string')
      throw fail('invalid_asset');
    const binary = Buffer.from(data.content, 'base64');
    if (binary.length < 20 || binary.length > 10_000_000) throw fail('asset_size');
    if (kind === 'glb') {
      if (
        binary.toString('ascii', 0, 4) !== 'glTF' ||
        binary.readUInt32LE(4) !== 2 ||
        binary.readUInt32LE(8) !== binary.length
      )
        throw fail('invalid_glb');
      const jsonLength = binary.readUInt32LE(12);
      if (binary.toString('ascii', 16, 20) !== 'JSON' || jsonLength > binary.length - 20)
        throw fail('invalid_glb');
      let model;
      try {
        model = JSON.parse(binary.toString('utf8', 20, 20 + jsonLength));
      } catch {
        throw fail('invalid_glb');
      }
      validateGltfDocument(model);
    } else {
      let model;
      try {
        model = JSON.parse(binary.toString('utf8'));
      } catch {
        throw fail('invalid_gltf');
      }
      validateGltfDocument(model);
    }
    const id = randomUUID();
    const filename = `asset-${id}.${kind}`;
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, filename), binary, { flag: 'wx' });
    const result = await pool.query(
      'INSERT INTO asset_catalog (id,name,asset_url,license,kind) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [id, name, `/api/media/${filename}`, license, kind],
    );
    return json(response, 201, { asset: result.rows[0] });
  }
  const assetMatch = /^\/api\/admin\/assets\/([0-9a-f-]{36})$/.exec(route);
  if (assetMatch && method === 'POST') {
    const result = await pool.query(
      'DELETE FROM asset_catalog a WHERE a.id=$1 AND NOT EXISTS (SELECT 1 FROM world_objects o WHERE o.asset_url=a.asset_url) RETURNING asset_url',
      [assetMatch[1]],
    );
    if (!result.rowCount) throw fail('asset_in_use_or_missing', 409);
    await unlink(path.join(dataDir, path.basename(result.rows[0].asset_url))).catch(() => {});
    return json(response, 200, { deleted: true });
  }
  if (route === '/api/admin/world' && method === 'GET') {
    const result = await pool.query('SELECT * FROM world_objects ORDER BY created_at');
    return json(response, 200, { objects: result.rows });
  }
  if (route === '/api/admin/world' && method === 'POST') {
    const data = await body(request);
    const transform = validateObject(data);
    const asset = await pool.query('SELECT asset_url,license FROM asset_catalog WHERE id=$1', [
      data.assetId,
    ]);
    if (!asset.rowCount) throw fail('asset_not_found', 404);
    const id = randomUUID();
    const result = await pool.query(
      'INSERT INTO world_objects (id,asset_url,license,x,y,z,rotation,scale,published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false) RETURNING *',
      [
        id,
        asset.rows[0].asset_url,
        asset.rows[0].license,
        transform.x,
        transform.y,
        transform.z,
        transform.rotation,
        transform.scale,
      ],
    );
    return json(response, 201, { object: result.rows[0] });
  }
  const objectMatch = /^\/api\/admin\/world\/([0-9a-f-]{36})$/.exec(route);
  if (objectMatch && method === 'POST') {
    const data = await body(request);
    if (data.delete === true) {
      await pool.query('DELETE FROM world_objects WHERE id=$1', [objectMatch[1]]);
      return json(response, 200, { deleted: true });
    }
    const transform = validateObject(data);
    const result = await pool.query(
      'UPDATE world_objects SET x=$1,y=$2,z=$3,rotation=$4,scale=$5,published=$6 WHERE id=$7 RETURNING *',
      [
        transform.x,
        transform.y,
        transform.z,
        transform.rotation,
        transform.scale,
        Boolean(data.published),
        objectMatch[1],
      ],
    );
    if (!result.rowCount) throw fail('object_not_found', 404);
    return json(response, 200, { object: result.rows[0] });
  }
  if (route === '/api/admin/levels' && method === 'GET') {
    const result = await pool.query('SELECT * FROM artist_levels ORDER BY level');
    return json(response, 200, { levels: result.rows });
  }
  if (route === '/api/admin/levels' && method === 'POST') {
    const data = await body(request);
    if (!Array.isArray(data.levels) || data.levels.length < 1 || data.levels.length > 10)
      throw fail('invalid_levels');
    const ordered = [...data.levels].sort((a, b) => a.level - b.level);
    if (
      ordered[0].level !== 1 ||
      ordered[0].min_uploads !== 0 ||
      ordered[0].min_likes !== 0 ||
      ordered.some(
        (item, index) =>
          index > 0 &&
          (item.level !== ordered[index - 1].level + 1 ||
            item.min_uploads < ordered[index - 1].min_uploads ||
            item.min_likes < ordered[index - 1].min_likes),
      )
    )
      throw fail('invalid_level_thresholds');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM artist_levels');
      for (const item of data.levels) {
        if (
          !Number.isInteger(item.level) ||
          !Number.isInteger(item.min_uploads) ||
          !Number.isInteger(item.min_likes) ||
          item.level < 1 ||
          item.min_uploads < 0 ||
          item.min_likes < 0 ||
          !String(item.name || '').trim()
        )
          throw fail('invalid_levels');
        await client.query('INSERT INTO artist_levels VALUES ($1,$2,$3,$4)', [
          item.level,
          String(item.name).slice(0, 60),
          item.min_uploads,
          item.min_likes,
        ]);
      }
      await client.query('COMMIT');
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    } finally {
      client.release();
    }
    return json(response, 200, { saved: true });
  }
  if (route === '/api/admin/arrange' && method === 'POST') {
    if (!process.env.GEMINI_API_KEY) throw fail('gemini_not_configured', 503);
    const data = await body(request);
    const prompt = String(data.prompt || '')
      .trim()
      .slice(0, 2000);
    if (!prompt) throw fail('prompt_required');
    const assets = await pool.query(
      'SELECT id,name FROM asset_catalog ORDER BY created_at DESC LIMIT 30',
    );
    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-3.8-flash'}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Sắp xếp tối đa 12 vật thể cho quán net 200 máy, tọa độ x từ -16 đến 16, z từ -32 đến 32, tránh đè lên dãy máy tại x gần -13.8,-10.2,-7.8,-4.2,-1.8,1.8,4.2,7.8,10.2,13.8 và z -20 đến 20. Danh sách asset: ${JSON.stringify(assets.rows)}. Yêu cầu: ${prompt}. Chỉ dùng assetId có trong danh sách.`,
                },
              ],
            },
          ],
          generationConfig: {
            responseFormat: {
              text: {
                mimeType: 'APPLICATION_JSON',
                schema: {
                  type: 'object',
                  properties: {
                    objects: {
                      type: 'array',
                      maxItems: 12,
                      items: {
                        type: 'object',
                        properties: {
                          assetId: { type: 'string' },
                          x: { type: 'number' },
                          y: { type: 'number' },
                          z: { type: 'number' },
                          rotation: { type: 'number' },
                          scale: { type: 'number' },
                        },
                        required: ['assetId', 'x', 'y', 'z', 'rotation', 'scale'],
                      },
                    },
                  },
                  required: ['objects'],
                },
              },
            },
          },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!result.ok) throw fail('gemini_request_failed', 502);
    const output = await result.json();
    const text = output.candidates?.[0]?.content?.parts?.[0]?.text;
    const proposal = JSON.parse(text || '{}');
    const permitted = new Set(assets.rows.map((item) => item.id));
    const objects = (proposal.objects || [])
      .slice(0, 12)
      .filter((item) => permitted.has(item.assetId))
      .map((item) => ({ assetId: item.assetId, ...validateObject(item) }));
    return json(response, 200, { proposal: objects });
  }
  return false;
}
