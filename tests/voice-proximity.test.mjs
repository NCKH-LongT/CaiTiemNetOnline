import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNearbyPeers, pairKey } from '../apps/voice-server/src/proximity.mjs';

test('voice includes only mutual nearby peers and caps connections', () => {
  const positions = new Map([
    ['center', { x: 0, z: 0 }],
    ...Array.from({ length: 8 }, (_, i) => [`near${i}`, { x: i + 1, z: 0 }]),
    ['far', { x: 30, z: 0 }],
  ]);
  const { allowed, rosters } = selectNearbyPeers(positions, 12, 6);
  assert.ok(rosters.get('center').length > 0 && rosters.get('center').length <= 6);
  assert.deepEqual(rosters.get('far'), []);
  assert.equal(allowed.has(pairKey('center', 'far')), false);
  for (const [id, peers] of rosters) {
    assert.ok(peers.length <= 6);
    for (const peer of peers) {
      assert.ok(rosters.get(peer.id).some((other) => other.id === id));
      assert.ok(peer.distance <= 12);
    }
  }
});
