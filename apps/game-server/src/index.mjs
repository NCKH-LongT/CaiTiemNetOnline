import { Room, defineRoom, defineServer } from 'colyseus';
import pg from 'pg';
import { createClient } from 'redis';
import world from '../../../shared/world.json' with { type: 'json' };

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;
const redis = process.env.REDIS_URL ? createClient({ url: process.env.REDIS_URL }) : null;
redis?.on('error', (error) => console.error('Redis:', error));
const STATION_COUNT = world.stations.length;
const seatAnchor = (stationId) => {
  const station = world.stations[stationId - 1];
  return { x: station.seatX, z: station.z };
};

export class CafeRoom extends Room {
  maxClients = 250;
  players = new Map();
  seats = new Map();

  async onAuth(_client, options) {
    if (!pool) return true;
    if (
      typeof options?.ticket !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(options.ticket) ||
      !redis
    )
      throw new Error('login_required');
    const playerId = await redis.getDel(`netverse:ticket:${options.ticket}`);
    if (!playerId) throw new Error('invalid_ticket');
    const result = await pool.query(
      `SELECT p.id,p.nickname,p.fullname,p.avatar_url,p.x,p.z,p.balance_seconds,p.online_seconds,
        (SELECT name FROM artist_levels WHERE min_uploads <=
          (SELECT count(*) FROM art_images WHERE player_id=p.id) AND min_likes <=
          (SELECT count(*) FROM art_votes v JOIN art_images a ON a.id=v.image_id WHERE a.player_id=p.id AND v.vote=1)
          ORDER BY level DESC LIMIT 1) AS badge
        FROM players p WHERE p.id=$1`,
      [playerId],
    );
    if (!result.rowCount) throw new Error('invalid_session');
    if ([...this.players.values()].some((player) => player.userId === result.rows[0].id))
      throw new Error('already_online');
    return result.rows[0];
  }

  async charge(player) {
    if (!pool || !player?.seatedAt || !player.userId) return;
    if (player.charging) return;
    player.charging = true;
    try {
      const elapsed = Math.floor((Date.now() - player.lastCharged) / 1000);
      if (elapsed <= 0) return;
      const result = await pool.query(
        'UPDATE players SET balance_seconds=GREATEST(balance_seconds-$1,0) WHERE id=$2 RETURNING balance_seconds',
        [elapsed, player.userId],
      );
      player.lastCharged += elapsed * 1000;
      player.balanceSeconds = result.rows[0]?.balance_seconds ?? 0;
      const client = this.clients.find((item) => item.sessionId === player.id);
      client?.send('time', { seconds: player.balanceSeconds });
      if (player.balanceSeconds <= 0) {
        if (redis) await redis.del(`netverse:seat:${player.seatedAt}`);
        this.seats.delete(player.seatedAt);
        player.seatedAt = null;
        player.x = 0;
        player.z = 29;
        client?.send('expired', { x: 0, z: 29 });
        this.sendSnapshot();
      }
    } finally {
      player.charging = false;
    }
  }

  async trackOnline(player) {
    if (!pool || !player?.userId || player.trackingOnline) return;
    const elapsed = Math.floor((Date.now() - player.lastOnlineAt) / 1000);
    if (elapsed < 1) return;
    player.trackingOnline = true;
    try {
      const result = await pool.query(
        'UPDATE players SET online_seconds=online_seconds+$1 WHERE id=$2 RETURNING online_seconds',
        [elapsed, player.userId],
      );
      player.lastOnlineAt += elapsed * 1000;
      player.onlineSeconds = result.rows[0]?.online_seconds ?? player.onlineSeconds;
      this.broadcast('player-presence', {
        id: player.id,
        onlineSeconds: player.onlineSeconds,
        balanceSeconds: player.balanceSeconds,
      });
    } finally {
      player.trackingOnline = false;
    }
  }

  onCreate() {
    this.clock.setInterval(() => {
      for (const player of this.players.values())
        if (player.seatedAt) this.charge(player).catch((error) => console.error('Timer:', error));
      for (const player of this.players.values())
        this.trackOnline(player).catch((error) => console.error('Online timer:', error));
      if (redis)
        for (const player of this.players.values())
          if (player.seatedAt && player.userId)
            redis
              .set(`netverse:seat:${player.seatedAt}`, player.userId, { EX: 30 })
              .catch((error) => console.error('Seat refresh:', error));
      if (pool)
        for (const player of this.players.values())
          if (!player.seatedAt && player.userId)
            pool
              .query('SELECT balance_seconds FROM players WHERE id=$1', [player.userId])
              .then((result) => {
                const next = result.rows[0]?.balance_seconds;
                if (next !== undefined && next !== player.balanceSeconds) {
                  player.balanceSeconds = next;
                  this.clients
                    .find((item) => item.sessionId === player.id)
                    ?.send('time', { seconds: next });
                }
              })
              .catch(() => {});
    }, 5000);
    this.onMessage('sync', (client) => client.send('snapshot', this.snapshot()));
    this.onMessage('move', (client, data) => {
      const player = this.players.get(client.sessionId);
      if (!player || player.seatedAt || typeof data?.x !== 'number' || typeof data?.z !== 'number')
        return;
      if (
        !Number.isFinite(data.x) ||
        !Number.isFinite(data.z) ||
        Math.abs(data.x) > world.width / 2 - 0.9 ||
        Math.abs(data.z) > world.length / 2 - 0.9
      )
        return;
      if (player.balanceSeconds <= 0 && data.z < 25) return;
      const distance = Math.hypot(data.x - player.x, data.z - player.z);
      const elapsed = Math.min(1, (Date.now() - player.lastMove) / 1000);
      if (distance > 5.5 * elapsed + 0.45) return;
      player.x = data.x;
      player.z = data.z;
      player.lastMove = Date.now();
      const nearbyPlayers = [];
      for (const peer of this.clients) {
        const nearby = this.players.get(peer.sessionId);
        if (
          nearby &&
          peer.sessionId !== client.sessionId &&
          Math.hypot(nearby.x - player.x, nearby.z - player.z) < 20
        ) {
          peer.send('player-move', { id: player.id, x: player.x, z: player.z });
          nearbyPlayers.push({ id: nearby.id, x: nearby.x, z: nearby.z });
        }
      }
      const cell = `${Math.floor(player.x / 4)}:${Math.floor(player.z / 4)}`;
      if (cell !== player.lastNearbyCell) {
        player.lastNearbyCell = cell;
        client.send('nearby-players', nearbyPlayers);
      }
    });
    this.onMessage('sit', async (client, data) => {
      const player = this.players.get(client.sessionId);
      const stationId = Number(data?.stationId);
      if (!player || !Number.isInteger(stationId) || stationId < 1 || stationId > STATION_COUNT)
        return;
      if (player.balanceSeconds <= 0) {
        client.send('notice', { text: 'Hết giờ chơi. Hãy xin phút ở khu vực ngoài quán.' });
        return;
      }
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
      player.lastCharged = Date.now();
      this.seats.set(stationId, client.sessionId);
      if (pool && player.userId) {
        try {
          await pool.query(
            'INSERT INTO pc_visitors (station_id,player_id,visited_at) VALUES ($1,$2,now()) ON CONFLICT (station_id,player_id) DO UPDATE SET visited_at=now()',
            [stationId, player.userId],
          );
          if (redis) await redis.set(`netverse:seat:${stationId}`, player.userId, { EX: 30 });
        } catch (error) {
          this.seats.delete(stationId);
          player.seatedAt = null;
          client.send('notice', { text: 'Không lưu được phiên sử dụng máy.' });
          throw error;
        }
      }
      client.send('seat', { stationId });
      client.send('time', { seconds: player.balanceSeconds });
      this.sendSnapshot();
    });
    this.onMessage('stand', async (client) => {
      const player = this.players.get(client.sessionId);
      if (!player?.seatedAt) return;
      await this.charge(player);
      if (!player.seatedAt) return;
      const anchor = seatAnchor(player.seatedAt);
      if (redis) await redis.del(`netverse:seat:${player.seatedAt}`);
      player.x = anchor.x;
      player.z = anchor.z;
      this.seats.delete(player.seatedAt);
      player.seatedAt = null;
      client.send('seat', { stationId: null });
      this.sendSnapshot();
    });
    this.onMessage('chat', (client, data) => {
      const player = this.players.get(client.sessionId);
      const text = typeof data?.text === 'string' ? data.text.trim().slice(0, 240) : '';
      const image =
        typeof data?.image === 'string' &&
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data.image) &&
        data.image.length < 180000
          ? data.image
          : null;
      if (!player || (!text && !image) || Date.now() - (player.lastChat ?? 0) < 1000) return;
      player.lastChat = Date.now();
      const target =
        typeof data?.to === 'string'
          ? this.clients.find((peer) => peer.sessionId === data.to)
          : null;
      if (data?.to && !target) return;
      const targetPlayer = target ? this.players.get(target.sessionId) : null;
      const message = {
        id: `${Date.now()}-${client.sessionId}`,
        from: player.id,
        fromUserId: player.userId,
        to: target?.sessionId ?? null,
        toUserId: targetPlayer?.userId ?? null,
        name: player.name,
        avatarUrl: player.avatarUrl,
        text,
        image,
        time: Date.now(),
      };
      if (target) {
        target.send('chat', message);
        client.send('chat', message);
      } else this.broadcast('chat', message);
    });
    this.onMessage('profile-refresh', async (client) => {
      const player = this.players.get(client.sessionId);
      if (!pool || !player?.userId) return;
      const result = await pool.query(
        `SELECT p.nickname,p.fullname,p.avatar_url,
          (SELECT name FROM artist_levels WHERE min_uploads <=
            (SELECT count(*) FROM art_images WHERE player_id=p.id) AND min_likes <=
            (SELECT count(*) FROM art_votes v JOIN art_images a ON a.id=v.image_id WHERE a.player_id=p.id AND v.vote=1)
            ORDER BY level DESC LIMIT 1) AS badge
          FROM players p WHERE p.id=$1`,
        [player.userId],
      );
      if (!result.rowCount) return;
      player.name = result.rows[0].nickname;
      player.fullname = result.rows[0].fullname;
      player.avatarUrl = result.rows[0].avatar_url;
      player.badge = result.rows[0].badge;
      this.sendSnapshot();
    });
  }

  onJoin(client, options, auth) {
    const name =
      auth?.nickname || (typeof options?.name === 'string' ? options.name.trim().slice(0, 24) : '');
    this.players.set(client.sessionId, {
      id: client.sessionId,
      userId: auth?.id ?? null,
      name: name || 'Khách',
      fullname: auth?.fullname ?? '',
      avatarUrl: auth?.avatar_url ?? null,
      x: auth?.balance_seconds <= 0 ? 0 : (auth?.x ?? world.spawn[0]),
      z: auth?.balance_seconds <= 0 ? 29 : (auth?.z ?? world.spawn[2]),
      seatedAt: null,
      balanceSeconds: auth?.balance_seconds ?? 3600,
      onlineSeconds: auth?.online_seconds ?? 0,
      badge: auth?.badge ?? null,
      lastOnlineAt: Date.now(),
      lastMove: Date.now(),
    });
    this.broadcast('snapshot', this.snapshot(), { except: client });
  }

  async onLeave(client) {
    const player = this.players.get(client.sessionId);
    if (player?.seatedAt) await this.charge(player);
    if (player) await this.trackOnline(player);
    if (player?.seatedAt && redis) await redis.del(`netverse:seat:${player.seatedAt}`);
    if (player?.seatedAt) this.seats.delete(player.seatedAt);
    this.players.delete(client.sessionId);
    this.sendSnapshot();
  }

  sendSnapshot() {
    this.broadcast('snapshot', this.snapshot());
  }

  snapshot() {
    return {
      players: [...this.players.values()].map(
        ({ id, userId, name, fullname, avatarUrl, x, z, seatedAt, balanceSeconds, onlineSeconds, badge }) => ({
          id,
          userId,
          name,
          fullname,
          avatarUrl,
          x,
          z,
          seatedAt,
          balanceSeconds,
          onlineSeconds,
          badge,
        }),
      ),
      seats: Object.fromEntries(this.seats),
    };
  }
}

const server = defineServer({
  rooms: { cafe: defineRoom(CafeRoom) },
  express: (app) => {
    app.get('/ready', (_request, response) => response.json({ status: 'ok', service: 'game' }));
  },
});

if (redis) await redis.connect();
await server.listen(Number(process.env.PORT || 2567));
