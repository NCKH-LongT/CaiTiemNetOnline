import http from 'node:http';
import { createClient } from 'redis';
import { WebSocket, WebSocketServer } from 'ws';
import { pairKey, selectNearbyPeers } from './proximity.mjs';

const port = Number(process.env.PORT || 2570);
const radius = 12;
const maxPeers = 6;
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (error) => console.error('Voice Redis:', error.message));
await redis.connect();

const clients = new Map();
const allowed = new Set();
const send = (socket, message) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};
const server = http.createServer((request, response) => {
  if (request.url === '/ready') {
    response.writeHead(redis.isReady ? 200 : 503, { 'content-type': 'text/plain' });
    response.end(redis.isReady ? 'ok\n' : 'unavailable\n');
  } else { response.writeHead(404); response.end(); }
});
const wsServer = new WebSocketServer({ noServer: true, maxPayload: 16_384 });
server.on('upgrade', (request, socket, head) => {
  try {
    if (request.url !== '/' || !request.headers.origin ||
      new URL(request.headers.origin).host !== request.headers.host) throw new Error('invalid_origin');
    wsServer.handleUpgrade(request, socket, head, (ws) => wsServer.emit('connection', ws));
  } catch { socket.destroy(); }
});

wsServer.on('connection', (socket) => {
  let userId = null;
  let signals = 0;
  let interval = setInterval(() => { signals = 0; }, 1000);
  const timeout = setTimeout(() => { if (!userId) socket.close(4401, 'auth_required'); }, 5000);
  socket.on('message', async (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { socket.close(4400, 'invalid_json'); return; }
    if (!userId) {
      if (message?.type !== 'auth' || !/^[A-Za-z0-9_-]{43}$/.test(message.ticket || '')) {
        socket.close(4401, 'invalid_ticket'); return;
      }
      try {
        const id = await redis.getDel(`netverse:voice-ticket:${message.ticket}`);
        if (!id || !(await redis.exists(`netverse:online:${id}`))) { socket.close(4401, 'invalid_ticket'); return; }
        userId = id;
        clients.get(id)?.close(4409, 'replaced');
        clients.set(id, socket);
        clearTimeout(timeout);
        send(socket, { type: 'ready', id, radius, maxPeers });
      } catch { socket.close(1011, 'auth_error'); }
      return;
    }
    if (++signals > 40) { socket.close(4408, 'rate_limit'); return; }
    if (!['offer', 'answer', 'ice'].includes(message?.type) || typeof message.to !== 'string' ||
      !allowed.has(pairKey(userId, message.to))) return;
    if (message.type === 'ice' && (!message.payload || typeof message.payload.candidate !== 'string')) return;
    if (['offer', 'answer'].includes(message.type) && (!message.payload || typeof message.payload.sdp !== 'string')) return;
    send(clients.get(message.to), { type: message.type, from: userId, payload: message.payload });
  });
  socket.on('close', () => {
    clearTimeout(timeout);
    clearInterval(interval);
    if (userId && clients.get(userId) === socket) clients.delete(userId);
  });
});

async function refreshProximity() {
  if (!clients.size) return;
  const ids = [...clients.keys()];
  const values = await redis.mGet(ids.map((id) => `netverse:online:${id}`));
  const positions = new Map();
  for (let i = 0; i < ids.length; i++) {
    try {
      const position = JSON.parse(values[i]);
      if (Number.isFinite(position.x) && Number.isFinite(position.z)) positions.set(ids[i], position);
      else clients.get(ids[i])?.close(4404, 'game_offline');
    } catch { clients.get(ids[i])?.close(4404, 'game_offline'); }
  }
  const selection = selectNearbyPeers(positions, radius, maxPeers);
  allowed.clear();
  for (const pair of selection.allowed) allowed.add(pair);
  for (const [id, socket] of clients) {
    send(socket, { type: 'peers', peers: selection.rosters.get(id) || [] });
  }
}
setInterval(() => refreshProximity().catch((error) => console.error('Voice proximity:', error)), 2000);
server.listen(port, '0.0.0.0', () => console.log(`Voice signaling listening on ${port}`));
