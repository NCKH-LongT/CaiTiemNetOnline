import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('image backup uploads active images to the configured Drive folder once', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'netverse-media-test-'));
  const original = {
    DATA_DIR: process.env.DATA_DIR,
    GOOGLE_DRIVE_CLIENT_ID: process.env.GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    GOOGLE_DRIVE_REFRESH_TOKEN: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  };
  const originalFetch = globalThis.fetch;
  const filename = 'chat-12345678-1234-1234-1234-123456789abc.webp';
  const folderId = 'testFolder123';
  const backups = [];
  const requests = [];
  try {
    await writeFile(path.join(directory, filename), Buffer.from('RIFF0000WEBP'));
    process.env.DATA_DIR = directory;
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'test-refresh';
    const { startImageBackup, imageInventory } = await import('../apps/api/src/media-manager.mjs');
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      if (url.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'test-access' }), { status: 200 });
      return new Response(JSON.stringify({ id: 'drive-file-1' }), { status: 200 });
    };
    const pool = {
      async query(sql, params) {
        if (sql.includes('SELECT avatar_url AS url')) return { rows: [{ url: `/api/media/${filename}`, usage: 'Ảnh chat' }] };
        if (sql.includes('SELECT folder_id,last_run_at,last_error')) return { rows: [{ folder_id: folderId, last_run_at: null, last_error: null }] };
        if (sql.includes('SELECT folder_id FROM')) return { rows: [{ folder_id: folderId }] };
        if (sql.includes('SELECT filename,drive_file_id,backed_at')) return { rows: backups.map((item) => ({ filename: item[0], drive_file_id: item[2], backed_at: new Date().toISOString() })) };
        if (sql.includes('INSERT INTO media_backups')) { backups.push(params); return { rows: [] }; }
        return { rows: [] };
      },
    };
    assert.equal(startImageBackup(pool), true);
    for (let i = 0; i < 100 && backups.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(backups, [[filename, folderId, 'drive-file-1']]);
    assert.equal(requests.length, 2);
    assert.match(requests[1].url, /uploadType=multipart/);
    assert.match(requests[1].options.body.toString(), /"parents":\["testFolder123"\]/);
    assert.equal((await imageInventory(pool)).pendingCount, 0);
    for (let i = 0; i < 100 && (await imageInventory(pool)).drive.running; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
