import assert from 'node:assert/strict';
import test from 'node:test';
import world from '../shared/world.json' with { type: 'json' };

test('shared world contains 200 unique, reachable PC seats', () => {
  assert.equal(world.stations.length, 200);
  const ids = new Set();
  const seats = new Set();
  for (const station of world.stations) {
    assert.ok(station.id >= 1 && station.id <= 200);
    assert.ok(Math.abs(station.x) < world.width / 2);
    assert.ok(Math.abs(station.z) < world.length / 2);
    assert.ok(Math.hypot(station.seatX - station.x, 0) < 1.2);
    ids.add(station.id);
    seats.add(`${station.seatX}:${station.z}`);
  }
  assert.equal(ids.size, 200);
  assert.equal(seats.size, 200);
});
