import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from 'redis';
import { checkOrigin, contentRoutes, json, playerRoutes, serveMedia } from './service.mjs';
import { adminRoutes } from './admin.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (error) => console.error('Redis connection error:', error.message));

const schema = await readFile(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'),
  'utf8',
);
const server = http.createServer((request, response) => {
  const route = new URL(request.url, 'http://localhost').pathname;
  (async () => {
    if (!['GET', 'HEAD'].includes(request.method)) checkOrigin(request);
    if (route === '/api/ready' && request.method === 'GET') {
      await Promise.all([pool.query('SELECT 1'), redis.ping()]);
      return json(response, 200, { status: 'ok', service: 'api' });
    }
    if (route.startsWith('/api/media/') && request.method === 'GET') {
      if (route.startsWith('/api/media/art-')) {
        const exists = await pool.query(
          'SELECT 1 FROM art_images WHERE image_url=$1 AND deleted_at IS NULL',
          [route],
        );
        if (!exists.rowCount) return json(response, 404, { error: 'not_found' });
      }
      if (route.startsWith('/api/media/asset-')) {
        const exists = await pool.query('SELECT 1 FROM asset_catalog WHERE asset_url=$1', [route]);
        if (!exists.rowCount) return json(response, 404, { error: 'not_found' });
      }
      return serveMedia(response, route.slice('/api/media/'.length));
    }
    await adminRoutes(pool, redis, request, response, route);
    if (response.writableEnded) return;
    await playerRoutes(pool, redis, request, response, route);
    if (response.writableEnded) return;
    await contentRoutes(pool, redis, request, response, route);
    if (!response.writableEnded) json(response, 404, { error: 'not_found' });
  })().catch((error) => {
    console.error('API error:', error);
    if (!response.headersSent)
      json(response, error.status || 500, {
        error: error.status ? error.message : 'internal_error',
      });
  });
});

await redis.connect();
await pool.query(schema);
server.listen(Number(process.env.PORT || 4000), '0.0.0.0');
process.on('SIGTERM', async () => {
  server.close();
  await Promise.all([redis.quit(), pool.end()]);
});
