import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@colyseus/sdk';

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function waitFor(check, timeout = 7000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await delay(40);
  }
  assert.fail('Timed out waiting for game state');
}

test('two clients cannot occupy one station; leaving frees it', { timeout: 15000 }, async () => {
  const port = await freePort();
  const server = spawn(process.execPath, ['apps/game-server/src/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  let a;
  let b;
  try {
    await waitFor(async () => {
      try { return (await fetch(`http://127.0.0.1:${port}/ready`)).ok; } catch { return false; }
    });
    const client = new Client(`http://127.0.0.1:${port}`);
    a = await client.joinOrCreate('cafe', { name: 'A' });
    let snapshotA;
    let snapshotB;
    let rejected = false;
    a.onMessage('snapshot', (value) => { snapshotA = value; });
    a.onMessage('seat', () => {});
    b = await client.joinOrCreate('cafe', { name: 'B' });
    b.onMessage('snapshot', (value) => { snapshotB = value; });
    b.onMessage('seat', () => {});
    b.onMessage('notice', () => { rejected = true; });
    a.send('sync');
    b.send('sync');
    await waitFor(() => snapshotA?.players.length === 2 && snapshotB?.players.length === 2);

    // Move both players close to station 5 in small, valid increments.
    for (let step = 1; step <= 4; step += 1) {
      const x = -2.13 * step / 4;
      const z = 5.7 - 1.1 * step / 4;
      a.send('move', { x, z });
      b.send('move', { x, z });
      await delay(125);
    }
    await waitFor(() => snapshotA?.players.every((player) => Math.abs(player.x + 2.13) < 0.02));
    a.send('sit', { stationId: 5 });
    await waitFor(() => snapshotA?.seats[5] === a.sessionId);
    b.send('sit', { stationId: 5 });
    await waitFor(() => rejected);
    assert.equal(snapshotB.seats[5], a.sessionId);
    a.send('stand');
    await waitFor(() => !snapshotB?.seats[5]);
    b.send('sit', { stationId: 5 });
    await waitFor(() => snapshotB?.seats[5] === b.sessionId);
  } finally {
    await Promise.allSettled([a?.leave(), b?.leave()]);
    server.kill('SIGTERM');
  }
});
