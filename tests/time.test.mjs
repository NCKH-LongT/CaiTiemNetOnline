import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDuration } from '../apps/web/lib/time.ts';

test('game durations carry across days, hours and seconds', () => {
  assert.equal(formatDuration(0), '0d 00:00:00');
  assert.equal(formatDuration(97931), '1d 03:12:11');
  assert.equal(formatDuration(172800), '2d 00:00:00');
  assert.equal(formatDuration(-1), '0d 00:00:00');
});
