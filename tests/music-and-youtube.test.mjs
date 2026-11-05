import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { adminRoutes } from '../apps/api/src/admin.mjs';
import { playerRoutes } from '../apps/api/src/service.mjs';

function request(method, route, payload, admin = false) {
  const stream = Readable.from(payload ? [Buffer.from(JSON.stringify(payload))] : []);
  return Object.assign(stream, { method, url: route, headers: { cookie: `${admin ? 'netverse_admin' : 'netverse_session'}=test-token` }, socket: { remoteAddress: '127.0.0.1' } });
}

function response() {
  return { status: 0, data: null, writeHead(status) { this.status = status; }, end(value) { this.data = JSON.parse(value); } };
}

test('admin stores reference-only songs but cannot select them as hidden community audio', async () => {
  const queries = [];
  const pool = { async query(sql, params) {
    queries.push({ sql, params });
    if (sql.includes('FROM admin_sessions')) return { rowCount: 1, rows: [{}] };
    if (sql.includes('INSERT INTO music_tracks')) return { rowCount: 1, rows: [{ id: params[0], title: params[1], file_url: params[2], youtube_url: params[3], spotify_url: params[4] }] };
    if (sql.includes('SELECT file_url FROM music_tracks')) return { rowCount: 1, rows: [{ file_url: null }] };
    return { rowCount: 0, rows: [] };
  } };
  const saved = response();
  await adminRoutes(pool, {}, request('POST', '/api/admin/music', { title: 'Bài tham khảo', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', spotifyUrl: 'https://open.spotify.com/track/1234567890' }, true), saved, '/api/admin/music');
  assert.equal(saved.status, 201);
  assert.equal(saved.data.track.file_url, null);
  assert.equal(queries.some(({ sql }) => sql.includes('UPDATE music_state')), false);
  await assert.rejects(() => adminRoutes(pool, {}, request('POST', '/api/admin/music/play', { trackId: saved.data.track.id }, true), response(), '/api/admin/music/play'), { message: 'music_audio_required' });
});

test('YouTube search returns embeddable video results without sending API key to the browser', async () => {
  const oldKey = process.env.YOUTUBE_API_KEY;
  const oldFetch = globalThis.fetch;
  const cache = new Map();
  const redis = {
    async get(key) { return cache.get(key) || null; },
    async incr(key) { const count = Number(cache.get(key) || 0) + 1; cache.set(key, count); return count; },
    async expire() {},
    async set(key, value) { cache.set(key, value); },
  };
  const pool = { async query() { return { rows: [{ id: 'player-1' }] }; } };
  let calls = 0;
  try {
    process.env.YOUTUBE_API_KEY = 'private-test-key';
    globalThis.fetch = async (url) => {
      calls++;
      assert.equal(url.searchParams.get('q'), 'nhạc chill');
      assert.equal(url.searchParams.get('videoEmbeddable'), 'true');
      return new Response(JSON.stringify({ items: [{ id: { videoId: 'dQw4w9WgXcQ' }, snippet: { title: 'Test video', channelTitle: 'Test channel' } }, { id: { videoId: 'invalid' } }] }), { status: 200 });
    };
    const first = response();
    await playerRoutes(pool, redis, request('GET', '/api/youtube/search?q=nh%E1%BA%A1c%20chill'), first, '/api/youtube/search');
    assert.equal(first.status, 200);
    assert.deepEqual(first.data.videos.map((item) => item.id), ['dQw4w9WgXcQ']);
    assert.equal(JSON.stringify(first.data).includes('private-test-key'), false);
    const second = response();
    await playerRoutes(pool, redis, request('GET', '/api/youtube/search?q=nh%E1%BA%A1c%20chill'), second, '/api/youtube/search');
    assert.equal(calls, 1);
  } finally {
    if (oldKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = oldKey;
    globalThis.fetch = oldFetch;
  }
});
