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
    a.onMessage('player-move', () => {});
    a.onMessage('nearby-players', () => {});
    a.onMessage('time', () => {});
    b = await client.joinOrCreate('cafe', { name: 'B' });
    b.onMessage('snapshot', (value) => { snapshotB = value; });
    b.onMessage('seat', () => {});
    b.onMessage('player-move', () => {});
    b.onMessage('nearby-players', () => {});
    b.onMessage('time', () => {});
    b.onMessage('notice', () => { rejected = true; });
    a.send('sync');
    b.send('sync');
    await waitFor(() => snapshotA?.players.length === 2 && snapshotB?.players.length === 2);

    // Move both players close to station 120 in small, valid increments.
    for (let step = 1; step <= 8; step += 1) {
      const x = 0.68 * step / 8;
      const z = 23 - 3.1 * step / 8;
      a.send('move', { x, z });
      b.send('move', { x, z });
      await delay(100);
    }
    await waitFor(() => snapshotA?.players.length === 2);
    a.send('sit', { stationId: 120 });
    await waitFor(() => snapshotA?.seats[120] === a.sessionId);
    b.send('sit', { stationId: 120 });
    await waitFor(() => rejected);
    assert.equal(snapshotB.seats[120], a.sessionId);
    a.send('stand');
    await waitFor(() => !snapshotB?.seats[120]);
    b.send('sit', { stationId: 120 });
    await waitFor(() => snapshotB?.seats[120] === b.sessionId);
  } finally {
    await Promise.allSettled([a?.leave(), b?.leave()]);
    server.kill('SIGTERM');
  }
});

test('private chat reaches only online peers and snapshots contain no chat history', { timeout: 15000 }, async () => {
  const port = await freePort();
  const server = spawn(process.execPath, ['apps/game-server/src/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  const rooms = [];
  try {
    await waitFor(async () => {
      try { return (await fetch(`http://127.0.0.1:${port}/ready`)).ok; } catch { return false; }
    });
    const client = new Client(`http://127.0.0.1:${port}`);
    const received = [[], [], []];
    for (const [index, name] of ['A', 'B', 'C'].entries()) {
      const room = await client.joinOrCreate('cafe', { name });
      rooms.push(room);
      room.onMessage('chat', (message) => received[index].push(message));
      room.onMessage('snapshot', () => {});
    }
    const [a, b] = rooms;
    a.send('chat', { to: b.sessionId, text: 'private' });
    await waitFor(() => received[0].length === 1 && received[1].length === 1);
    assert.equal(received[2].length, 0);
    assert.equal(received[1][0].to, b.sessionId);

    let lateSnapshot;
    const d = await client.joinOrCreate('cafe', { name: 'D' });
    rooms.push(d);
    d.onMessage('snapshot', (value) => { lateSnapshot = value; });
    const lateMessages = [];
    d.onMessage('chat', (message) => lateMessages.push(message));
    d.send('sync');
    await waitFor(() => lateSnapshot?.players.length === 4);
    assert.equal('messages' in lateSnapshot, false);
    assert.equal(lateMessages.length, 0);
    await delay(1100);
    a.send('chat', { text: 'public' });
    await waitFor(() => received[2].length === 1);
    assert.equal(received[2][0].text, 'public');
    await waitFor(() => lateMessages.length === 1);
    assert.equal(lateMessages[0].text, 'public');
  } finally {
    await Promise.allSettled(rooms.map((room) => room.leave()));
    server.kill('SIGTERM');
  }
});
