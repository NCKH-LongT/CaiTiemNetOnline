import assert from 'node:assert/strict';
import test from 'node:test';
import world from '../shared/world.json' with { type: 'json' };

test('shared world contains 500 unique, reachable PC seats', () => {
  assert.equal(world.stations.length, 500);
  const ids = new Set();
  const seats = new Set();
  for (const station of world.stations) {
    assert.ok(station.id >= 1 && station.id <= 500);
    assert.ok(Math.abs(station.x) < world.width / 2);
    assert.ok(Math.abs(station.z) < world.length / 2);
    assert.ok(Math.hypot(station.seatX - station.x, 0) < 1.2);
    ids.add(station.id);
    seats.add(`${station.seatX}:${station.z}`);
  }
  assert.equal(ids.size, 500);
  assert.equal(seats.size, 500);
  let nearestDesk = Infinity;
  for (const [index, station] of world.stations.entries())
    for (const other of world.stations.slice(index + 1))
      nearestDesk = Math.min(nearestDesk, Math.hypot(station.x - other.x, station.z - other.z));
  assert.ok(nearestDesk >= 2.9, 'PC desks have walking space between them');
});
