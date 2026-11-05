import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../apps/web/lib/api.ts';

test('API reports an HTML gateway error without exposing a JSON parse exception', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!DOCTYPE html><title>Bad gateway</title>', {
    status: 502,
    headers: { 'content-type': 'text/html' },
  });
  try {
    await assert.rejects(api('/api/admin/overview'), /HTTP 502/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API still accepts a normal JSON response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ admin: true });
  try {
    assert.deepEqual(await api('/api/admin/me'), { admin: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
