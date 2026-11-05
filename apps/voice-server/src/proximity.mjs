export const pairKey = (a, b) => [a, b].sort().join(':');

export function selectNearbyPeers(positions, radius = 12, maxPeers = 6) {
  const cells = new Map();
  for (const [id, position] of positions) {
    const key = `${Math.floor(position.x / radius)}:${Math.floor(position.z / radius)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(id);
  }
  const nearest = new Map();
  for (const [id, position] of positions) {
    const x = Math.floor(position.x / radius);
    const z = Math.floor(position.z / radius);
    const peers = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
      for (const candidate of cells.get(`${x + dx}:${z + dz}`) || []) {
        if (candidate === id) continue;
        const other = positions.get(candidate);
        const distance = Math.hypot(position.x - other.x, position.z - other.z);
        if (distance <= radius) peers.push({ id: candidate, distance: Math.round(distance * 10) / 10 });
      }
    nearest.set(id, peers.sort((a, b) => a.distance - b.distance).slice(0, maxPeers));
  }
  const allowed = new Set();
  for (const [id, peers] of nearest)
    for (const peer of peers)
      if (nearest.get(peer.id)?.some((other) => other.id === id)) allowed.add(pairKey(id, peer.id));
  const rosters = new Map();
  for (const [id, peers] of nearest)
    rosters.set(id, peers.filter((peer) => allowed.has(pairKey(id, peer.id))));
  return { allowed, rosters };
}
