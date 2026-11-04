import world from '../../../shared/world.json';

export type Point3 = [number, number, number];

export type Station = {
  stationId: number;
  zone: number;
  side: number;
  position: Point3;
  seatAnchor: Point3;
  screenAnchor: Point3;
  interactionRadius: number;
};

export const stations: Station[] = world.stations.map((item) => {
  return {
    stationId: item.id,
    zone: item.zone,
    side: item.side,
    position: [item.x, 0, item.z],
    seatAnchor: [item.seatX, 0, item.z],
    screenAnchor: [item.screenX, 1.36, item.z],
    interactionRadius: 1.6,
  };
});

export const spawn: Point3 = [world.spawn[0], world.spawn[1], world.spawn[2]];
export const worldBounds = { halfWidth: world.width / 2 - 0.9, halfLength: world.length / 2 - 0.9 };

export function nearestStation(x: number, z: number): Station | null {
  let nearest: Station | null = null;
  let distance = Infinity;
  for (const station of stations) {
    const delta = Math.hypot(x - station.seatAnchor[0], z - station.seatAnchor[2]);
    if (delta < station.interactionRadius && delta < distance) {
      nearest = station;
      distance = delta;
    }
  }
  return nearest;
}

export function canMoveTo(x: number, z: number): boolean {
  if (Math.abs(x) > worldBounds.halfWidth || Math.abs(z) > worldBounds.halfLength) return false;
  // Desk footprints are colliders; the aisle and chair approach stay open.
  return !stations.some((station) =>
    Math.abs(x - station.position[0]) < 0.81 &&
    Math.abs(z - station.position[2]) < 0.64,
  );
}
