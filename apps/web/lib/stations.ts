export type Point3 = [number, number, number];

export type Station = {
  stationId: number;
  position: Point3;
  seatAnchor: Point3;
  screenAnchor: Point3;
  interactionRadius: number;
};

export const stations: Station[] = Array.from({ length: 10 }, (_, index) => {
  const side = index < 5 ? -1 : 1;
  const row = index % 5;
  const x = side * 3.25;
  const z = -4.6 + row * 2.3;
  return {
    stationId: index + 1,
    position: [x, 0, z],
    seatAnchor: [x - side * 1.12, 0, z],
    screenAnchor: [x - side * 0.1, 1.36, z],
    interactionRadius: 1.6,
  };
});

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
  if (Math.abs(x) > 5.65 || Math.abs(z) > 6.35) return false;
  // Desk footprints are colliders; the aisle and chair approach stay open.
  return !stations.some((station) =>
    Math.abs(x - station.position[0]) < 0.81 &&
    Math.abs(z - station.position[2]) < 0.64,
  );
}
