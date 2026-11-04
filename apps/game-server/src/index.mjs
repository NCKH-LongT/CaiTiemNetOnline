import { Room, defineRoom, defineServer } from 'colyseus';

const STATION_COUNT = 10;
const seatAnchor = (stationId) => {
  const index = stationId - 1;
  const side = index < 5 ? -1 : 1;
  return { x: side * 2.13, z: -4.6 + (index % 5) * 2.3 };
};

export class CafeRoom extends Room {
  maxClients = 30;
  players = new Map();
  seats = new Map();
  messages = [];

  onCreate() {
    this.onMessage('sync', (client) => client.send('snapshot', this.snapshot()));
    this.onMessage('move', (client, data) => {
      const player = this.players.get(client.sessionId);
      if (!player || player.seatedAt || typeof data?.x !== 'number' || typeof data?.z !== 'number') return;
      if (!Number.isFinite(data.x) || !Number.isFinite(data.z) || Math.abs(data.x) > 5.65 || Math.abs(data.z) > 6.35) return;
      const distance = Math.hypot(data.x - player.x, data.z - player.z);
      const elapsed = Math.min(1, (Date.now() - player.lastMove) / 1000);
      if (distance > 5.5 * elapsed + 0.45) return;
      player.x = data.x;
      player.z = data.z;
      player.lastMove = Date.now();
      this.sendSnapshot();
    });
    this.onMessage('sit', (client, data) => {
      const player = this.players.get(client.sessionId);
      const stationId = Number(data?.stationId);
      if (!player || !Number.isInteger(stationId) || stationId < 1 || stationId > STATION_COUNT) return;
      const anchor = seatAnchor(stationId);
      if (Math.hypot(player.x - anchor.x, player.z - anchor.z) > 1.6) {
        client.send('notice', { text: 'Hãy đến gần ghế để sử dụng máy.' });
        return;
      }
      const occupant = this.seats.get(stationId);
      if (occupant && occupant !== client.sessionId) {
        client.send('notice', { text: 'Máy này đang có người sử dụng.' });
        return;
      }
      if (player.seatedAt) this.seats.delete(player.seatedAt);
      player.seatedAt = stationId;
      this.seats.set(stationId, client.sessionId);
      client.send('seat', { stationId });
      this.sendSnapshot();
    });
    this.onMessage('stand', (client) => {
      const player = this.players.get(client.sessionId);
      if (!player?.seatedAt) return;
      const anchor = seatAnchor(player.seatedAt);
      player.x = anchor.x;
      player.z = anchor.z;
      this.seats.delete(player.seatedAt);
      player.seatedAt = null;
      this.sendSnapshot();
    });
    this.onMessage('chat', (client, data) => {
      const player = this.players.get(client.sessionId);
      const text = typeof data?.text === 'string' ? data.text.trim().slice(0, 240) : '';
      if (!player || !text || Date.now() - (player.lastChat ?? 0) < 1000) return;
      player.lastChat = Date.now();
      this.messages.push({ id: `${Date.now()}-${client.sessionId}`, name: player.name, text, time: Date.now() });
      if (this.messages.length > 50) this.messages.shift();
      this.sendSnapshot();
    });
  }

  onJoin(client, options) {
    const name = typeof options?.name === 'string' ? options.name.trim().slice(0, 24) : '';
    this.players.set(client.sessionId, { id: client.sessionId, name: name || 'Khách', x: 0, z: 5.7, seatedAt: null, lastMove: Date.now() });
    this.broadcast('snapshot', this.snapshot(), { except: client });
  }

  onLeave(client) {
    const player = this.players.get(client.sessionId);
    if (player?.seatedAt) this.seats.delete(player.seatedAt);
    this.players.delete(client.sessionId);
    this.sendSnapshot();
  }

  sendSnapshot() {
    this.broadcast('snapshot', this.snapshot());
  }

  snapshot() {
    return {
      players: [...this.players.values()].map(({ id, name, x, z, seatedAt }) => ({ id, name, x, z, seatedAt })),
      seats: Object.fromEntries(this.seats),
      messages: this.messages,
    };
  }
}

const server = defineServer({
  rooms: { cafe: defineRoom(CafeRoom) },
  express: (app) => {
    app.get('/ready', (_request, response) => response.json({ status: 'ok', service: 'game' }));
  },
});

await server.listen(Number(process.env.PORT || 2567));
