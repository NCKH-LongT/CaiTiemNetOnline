import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web');
const output = path.join(root, '.next/standalone/apps/web');
cpSync(path.join(root, '.next/static'), path.join(output, '.next/static'), { recursive: true });
if (existsSync(path.join(root, 'public'))) {
  cpSync(path.join(root, 'public'), path.join(output, 'public'), { recursive: true });
}
