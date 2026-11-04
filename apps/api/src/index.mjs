import http from 'node:http';
import pg from 'pg';
import { createClient } from 'redis';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (error) => console.error('Redis connection error:', error.message));

const server = http.createServer(async (request, response) => {
  if (request.url !== '/api/ready' || request.method !== 'GET') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  try {
    const [database] = await Promise.all([pool.query('SELECT 1'), redis.ping()]);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'api', database: database.rowCount === 1 }));
  } catch {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'unavailable', service: 'api' }));
  }
});

await redis.connect();
server.listen(Number(process.env.PORT || 4000), '0.0.0.0');
process.on('SIGTERM', async () => {
  server.close();
  await Promise.all([redis.quit(), pool.end()]);
});
