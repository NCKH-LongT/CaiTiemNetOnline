import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ten aisles, twenty-five rows, with two desks facing each aisle.
const stations = [];
const round = (value) => Number(value.toFixed(2));
for (let aisle = 0; aisle < 10; aisle += 1) {
  const aisleX = (aisle - 4.5) * 7.2;
  for (let row = 0; row < 25; row += 1) {
    const z = round(-36 + row * 3);
    for (const side of [-1, 1]) {
      const x = round(aisleX + side * 1.8);
      stations.push({
        id: stations.length + 1,
        zone: aisle + 1,
        x,
        z,
        side,
        seatX: round(aisleX + side * 0.68),
        screenX: round(x - side * 0.1),
      });
    }
  }
}

const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../shared/world.json');
writeFileSync(output, JSON.stringify({ width: 74, length: 94, entranceZ: 39, spawn: [0, 0, 42], stations }, null, 2) + '\n');
