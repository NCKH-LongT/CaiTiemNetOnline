import assert from 'node:assert/strict';
import test from 'node:test';
import { embeddableUrl } from '../apps/web/lib/embed-url.ts';

test('video URLs become official embeddable players; ordinary HTTPS URLs remain intact', () => {
  assert.equal(
    embeddableUrl('https://www.youtube.com/watch?v=M7lc1UVf-VE'),
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
  );
  assert.equal(
    embeddableUrl('https://www.youtube.com/shorts/M7lc1UVf-VE'),
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
  );
  assert.equal(
    embeddableUrl('https://www.tiktok.com/@scout2015/video/6718335390845095173'),
    'https://www.tiktok.com/player/v1/6718335390845095173',
  );
  assert.equal(embeddableUrl('https://example.com/news'), 'https://example.com/news');
  assert.throws(() => embeddableUrl('http://example.com/news'), /HTTPS/);
});
