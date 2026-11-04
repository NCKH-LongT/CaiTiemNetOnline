import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Original procedural layout: five aisles, twenty rows and two desks per row.
const stations = [];
const round = (value) => Number(value.toFixed(2));
for (let aisle = 0; aisle < 5; aisle += 1) {
  const aisleX = (aisle - 2) * 6;
  for (let row = 0; row < 20; row += 1) {
    const z = round(-20 + row * 2.1);
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
writeFileSync(output, JSON.stringify({ width: 34, length: 66, spawn: [0, 0, 23], stations }, null, 2) + '\n');
