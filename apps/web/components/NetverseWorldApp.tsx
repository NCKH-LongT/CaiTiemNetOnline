'use client';

import { Client, type Room } from '@colyseus/sdk';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import NetverseScene, { type RemotePlayer } from './NetverseScene';
import PcDesktop from './PcDesktop';
import { api, readImage, type ArtImage, type Player } from '@/lib/api';
import { loadChatMessages, saveChatMessage, type LocalChatMessage } from '@/lib/local-chat';
import { nearestStation, spawn, stations, type Point3 } from '@/lib/stations';

type ChatMessage = LocalChatMessage;
type Snapshot = { players: RemotePlayer[]; seats: Record<number, string> };
type Leaderboard = {
  rich: { nickname: string; balance_seconds: number }[];
  donors: { nickname: string; donated_seconds: number }[];
  art: ArtImage[];
  board?: { background_url: string | null; background_color: string };
};
const formatMinutes = (seconds: number) => `${Math.floor(seconds / 60)} phút`;

export default function NetverseWorldApp() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', password: '', nickname: '', fullname: '' });
  const [entered, setEntered] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [sceneStart, setSceneStart] = useState<Point3>([...spawn]);
  const [seatedAt, setSeatedAt] = useState<number | null>(null);
  const [nearbyId, setNearbyId] = useState<number | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('offline');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const [seats, setSeats] = useState<Record<number, string>>({});
  const [seconds, setSeconds] = useState(3600);
  const [onlineSeconds, setOnlineSeconds] = useState(0);
  const [notice, setNotice] = useState('');
  const [mainTab, setMainTab] = useState<'world' | 'community' | 'rankings'>('world');
  const [chatTarget, setChatTarget] = useState<{
    sessionId: string;
    userId: string;
    name: string;
  } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard>({ rich: [], donors: [], art: [] });
  const [artist, setArtist] = useState<{
    uploads: number;
    likes: number;
    level: { name: string } | null;
  } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileNick, setProfileNick] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [giftNick, setGiftNick] = useState('');
  const [giftMinutes, setGiftMinutes] = useState(10);
  const [kneeling, setKneeling] = useState(false);
  const position = useRef<Point3>([...spawn]);
  const keys = useRef(new Set<string>());
  const room = useRef<Room | null>(null);
  const playerId = player?.id;

  useEffect(() => {
    api<{ player: Player | null }>('/api/auth/me')
      .then(({ player: found }) => {
        if (found) {
          setPlayer(found);
          setSeconds(found.balance_seconds);
          setOnlineSeconds(found.online_seconds);
          position.current = [found.x, 0, found.z];
          loadChatMessages(found.id)
            .then(setMessages)
            .catch(() => setMessages([]));
        }
      })
      .catch(() => setNotice('API chưa sẵn sàng.'))
      .finally(() => setAuthReady(true));
  }, []);
  const appendMessage = useCallback(
    (message: ChatMessage) => {
      if (playerId) saveChatMessage(playerId, message).catch(() => {});
      setMessages((previous) => [...previous, message].slice(-100));
    },
    [playerId],
  );
  const refreshLeaderboard = useCallback(
    () =>
      api<Leaderboard>('/api/leaderboard')
        .then(setLeaderboard)
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    if (entered || mainTab === 'rankings') refreshLeaderboard();
  }, [entered, mainTab, refreshLeaderboard]);
  useEffect(() => {
    if (!entered) return;
    const timer = setInterval(refreshLeaderboard, 30000);
    return () => clearInterval(timer);
  }, [entered, refreshLeaderboard]);
  useEffect(() => {
    if (!entered) return;
    const refresh = () =>
      api<{ uploads: number; likes: number; level: { name: string } | null }>('/api/player/artist')
        .then(setArtist)
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [entered]);

  const enter = () => {
    if (!player) return;
    position.current = [
      player.balance_seconds > 0 ? player.x : 0,
      0,
      player.balance_seconds > 0 ? player.z : 29,
    ];
    setSceneStart([...position.current]);
    setSceneKey((current) => current + 1);
    setEntered(true);
    setConnection('connecting');
  };
  useEffect(() => {
    if (!entered || !playerId) return;
    let cancelled = false;
    let joined: Room | null = null;
    (async () => {
      const { ticket } = await api<{ ticket: string }>('/api/auth/ticket');
      const endpoint =
        process.env.NEXT_PUBLIC_GAME_URL ||
        (location.port === '3000' ? 'http://localhost:2567' : `${location.origin}/socket`);
      const client = new Client(endpoint);
      joined = await client.joinOrCreate('cafe', { ticket });
      if (cancelled) {
        joined.leave();
        return;
      }
      room.current = joined;
      setSessionId(joined.sessionId);
      setConnection('online');
      joined.onMessage('snapshot', (snapshot: Snapshot) => {
        setPlayers(snapshot.players);
        setSeats(snapshot.seats);
      });
      joined.onMessage('player-move', ({ id, x, z }: { id: string; x: number; z: number }) =>
        setPlayers((current) => current.map((item) => (item.id === id ? { ...item, x, z } : item))),
      );
      joined.onMessage('nearby-players', (nearby: { id: string; x: number; z: number }[]) =>
        setPlayers((current) =>
          current.map((item) => {
            const fresh = nearby.find((peer) => peer.id === item.id);
            return fresh ? { ...item, x: fresh.x, z: fresh.z } : item;
          }),
        ),
      );
      joined.onMessage('seat', ({ stationId }: { stationId: number | null }) =>
        setSeatedAt(stationId),
      );
      joined.onMessage('time', ({ seconds: amount }: { seconds: number }) => {
        setSeconds(amount);
        if (amount > 0) setKneeling(false);
      });
      joined.onMessage('player-presence', ({ id, onlineSeconds: total, balanceSeconds }: { id: string; onlineSeconds: number; balanceSeconds: number }) => {
        setPlayers((current) => current.map((item) => item.id === id ? { ...item, onlineSeconds: total, balanceSeconds } : item));
        if (id === joined?.sessionId) setOnlineSeconds(total);
      });
      joined.onMessage('expired', ({ x, z }: { x: number; z: number }) => {
        position.current = [x, 0, z];
        setSceneStart([x, 0, z]);
        setSeatedAt(null);
        setSeconds(0);
        setSceneKey((current) => current + 1);
        setMainTab('community');
        setNotice('Đã hết giờ. Bạn đang ở ngoài quán; hãy xin người chơi khác tặng phút.');
      });
      joined.onMessage('notice', ({ text }: { text: string }) => setNotice(text));
      joined.onMessage('chat', (message: ChatMessage) => appendMessage(message));
      joined.send('sync');
      joined.onLeave(() => {
        room.current = null;
        setConnection('offline');
        setSessionId(null);
        setSeatedAt(null);
        setSeats({});
      });
    })().catch((error) => {
      if (!cancelled) {
        setConnection('offline');
        setNotice(`Không kết nối được game server: ${(error as Error).message}`);
      }
    });
    return () => {
      cancelled = true;
      joined?.leave();
      room.current = null;
    };
  }, [entered, playerId, appendMessage]);

  const sit = useCallback(
    (stationId: number) => {
      if (seconds <= 0) {
        setNotice('Bạn đã hết giờ. Hãy xin thêm phút ở ngoài quán.');
        return;
      }
      if (nearestStation(position.current[0], position.current[2])?.stationId !== stationId) {
        setNotice('Hãy đến gần ghế.');
        return;
      }
      if (seats[stationId] && seats[stationId] !== sessionId) {
        setNotice('Máy đang có người sử dụng.');
        return;
      }
      room.current?.send('move', { x: position.current[0], z: position.current[2] });
      room.current?.send('sit', { stationId });
    },
    [seconds, seats, sessionId],
  );
  const stand = useCallback(() => {
    room.current?.send('stand');
  }, []);
  useEffect(() => {
    if (!entered) return;
    const down = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLButtonElement
      )
        return;
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key))
        event.preventDefault();
      keys.current.add(key);
      if (event.repeat) return;
      if (key === 'e') {
        if (seatedAt) stand();
        else if (nearbyId) sit(nearbyId);
      }
      if (key === 'escape' && seatedAt) stand();
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [entered, nearbyId, seatedAt, sit, stand]);
  useEffect(() => {
    if (!seatedAt) return;
    const timer = setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [seatedAt]);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const result = await api<{ player: Player }>(`/api/auth/${authMode}`, form);
      setPlayer(result.player);
      setSeconds(result.player.balance_seconds);
      setOnlineSeconds(result.player.online_seconds);
      position.current = [result.player.x, 0, result.player.z];
      loadChatMessages(result.player.id)
        .then(setMessages)
        .catch(() => setMessages([]));
      setNotice('');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const save = async () => {
    try {
      await api('/api/player/save', { x: position.current[0], z: position.current[2] });
      setNotice('Đã lưu vị trí nhân vật.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const logout = async () => {
    room.current?.leave();
    await api('/api/auth/logout', {}).catch(() => {});
    setEntered(false);
    setPlayer(null);
    setMessages([]);
    setSeatedAt(null);
    setSessionId(null);
    setPlayers([]);
    setConnection('offline');
    setMainTab('world');
  };
  const saveProfile = async () => {
    try {
      const result = await api<{ player: Player }>('/api/player/profile', {
        fullname: profileName,
        nickname: profileNick,
        image: profileImage,
      });
      setPlayer(result.player);
      room.current?.send('profile-refresh');
      setProfileOpen(false);
      setNotice('Đã lưu profile.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const gift = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api('/api/player/gift', { nickname: giftNick, minutes: giftMinutes });
      const result = await api<{ player: Player }>('/api/auth/me');
      setPlayer(result.player);
      setSeconds(result.player.balance_seconds);
      setNotice(`Đã tặng ${giftMinutes} phút cho ${giftNick}.`);
      refreshLeaderboard();
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const sendChat = (event: React.FormEvent) => {
    event.preventDefault();
    if ((!draft.trim() && !pendingImage) || !room.current) return;
    room.current.send('chat', {
      to: chatTarget?.sessionId ?? null,
      text: draft.trim().slice(0, 240),
      image: pendingImage,
    });
    setDraft('');
    setPendingImage(null);
  };
  const sendImage = async (file: File) => {
    try {
      const data = await readImage(file);
      if (data.length > 180000) throw new Error('Ảnh chat cần nhỏ hơn 130 KB.');
      setPendingImage(data);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const visibleMessages = messages.filter((message) =>
    chatTarget
      ? (message.fromUserId === chatTarget.userId || message.toUserId === chatTarget.userId) &&
        message.to !== null
      : message.to === null,
  );

  return (
    <main className="app-shell">
      <div className="scene-wrap">
        <NetverseScene
          key={sceneKey}
          heldKeys={keys}
          seatedAt={seatedAt}
          occupiedSeats={seats}
          remotePlayers={players}
          sessionId={sessionId}
          startPosition={sceneStart}
          kneeling={kneeling}
          canEnterCafe={seconds > 0}
          cameraEnabled={entered && mainTab === 'world' && !seatedAt}
          localName={player?.nickname}
          localFullname={player?.fullname}
          localAvatarUrl={player?.avatar_url}
          localBalanceSeconds={seconds}
          localOnlineSeconds={onlineSeconds}
          localBadge={artist?.level?.name}
          leaderboard={leaderboard}
          onNearbyChange={setNearbyId}
          onPositionChange={(x, z) => {
            position.current = [x, 0, z];
          }}
          onMove={(x, z) => room.current?.send('move', { x, z })}
          onScreenClick={sit}
        />
      </div>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            N<span>·</span>
          </span>
          <span>
            <strong>NETVERSE</strong>
            <small>INTERNET CAFÉ / 3D WORLD</small>
          </span>
        </div>
        <div className="topbar-right">
          <span className="room-tag">
            {stations.length} MÁY <i /> {players.length} ONLINE
          </span>
          <span className={`connection ${connection}`}>
            <i />
            {connection === 'online'
              ? 'TRỰC TUYẾN'
              : connection === 'connecting'
                ? 'ĐANG KẾT NỐI'
                : 'NGOẠI TUYẾN'}
          </span>
        </div>
      </header>
      {entered && player ? (
        <>
          <nav className="main-tabs" aria-label="Màn hình chính">
            <button
              className={mainTab === 'world' ? 'selected' : ''}
              onClick={() => setMainTab('world')}
            >
              THẾ GIỚI
            </button>
            <button
              className={mainTab === 'community' ? 'selected' : ''}
              onClick={() => setMainTab('community')}
            >
              CỘNG ĐỒNG ({players.length})
            </button>
            <button
              className={mainTab === 'rankings' ? 'selected' : ''}
              onClick={() => setMainTab('rankings')}
            >
              BẢNG VÀNG
            </button>
          </nav>
          <aside className="hud-left">
            <span className="eyebrow">NHÂN VẬT</span>
            <div className="player-avatar">
              {player.avatar_url ? (
                <Image unoptimized src={player.avatar_url} alt="Avatar" width={54} height={54} />
              ) : (
                player.nickname[0]
              )}
            </div>
            <strong>{player.nickname}</strong>
            <small>{player.fullname}</small>
            <small>
              {artist?.level?.name || 'Tân binh'} · {artist?.uploads || 0} tranh /{' '}
              {artist?.likes || 0} lượt thích
            </small>
            <div className="hud-divider" />
            <div className="stat-row">
              <span>Thời gian</span>
              <b>{formatMinutes(seconds)}</b>
            </div>
            <div className="stat-row">
              <span>Đã online</span>
              <b>{Math.floor(onlineSeconds / 3600)}h {Math.floor(onlineSeconds % 3600 / 60)}p</b>
            </div>
            <div className="stat-row">
              <span>Máy đang dùng</span>
              <b>
                {Object.keys(seats).length}/{stations.length}
              </b>
            </div>
            <button className="hud-action" onClick={save}>
              LƯU GAME
            </button>
            <button
              className="hud-action"
              onClick={() => {
                setProfileName(player.fullname);
                setProfileNick(player.nickname);
                setProfileImage(null);
                setProfileOpen(true);
              }}
            >
              PROFILE
            </button>
            <button className="hud-action" onClick={logout}>
              ĐĂNG XUẤT
            </button>
          </aside>
          {mainTab === 'world' && !seatedAt && (
            <div className="controls">
              <span className="eyebrow">ĐIỀU KHIỂN</span>
              <div>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd>
                <span>Di chuyển</span>
              </div>
              <div>
                <kbd>SHIFT</kbd>
                <span>Chạy</span>
              </div>
              <div>
                <kbd>CHUỘT</kbd>
                <span>Nhấp vào game để xoay góc nhìn · Esc để thả</span>
              </div>
              <div>
                <kbd>E</kbd>
                <span>Ngồi / đứng</span>
              </div>
            </div>
          )}
          {nearbyId && !seatedAt && seconds > 0 && mainTab === 'world' && (
            <button className="interaction" onClick={() => sit(nearbyId)}>
              <kbd>E</kbd>
              <span>
                Ngồi vào <b>máy #{String(nearbyId).padStart(3, '0')}</b>
              </span>
            </button>
          )}
          {seconds <= 0 && !seatedAt && (
            <div className="begging-actions">
              <strong>HẾT GIỜ CHƠI</strong>
              <p>Ra ngoài quán và xin người khác tặng phút.</p>
              <button onClick={() => setKneeling((current) => !current)}>
                {kneeling ? 'ĐỨNG DẬY' : 'QUỲ XIN PHÚT'}
              </button>
            </div>
          )}
          {seatedAt && mainTab === 'world' && (
            <PcDesktop
              stationId={seatedAt}
              seconds={seconds}
              onAlbumChange={() => {
                room.current?.send('profile-refresh');
                api<{ uploads: number; likes: number; level: { name: string } | null }>('/api/player/artist')
                  .then(setArtist)
                  .catch(() => {});
              }}
              onStand={stand}
            />
          )}
          {mainTab === 'community' && (
            <section className="social-panel">
              <h2>
                Cộng đồng <small>{players.length} người online</small>
              </h2>
              <div className="social-layout">
                <div className="online-list">
                  <button
                    className={!chatTarget ? 'selected' : ''}
                    onClick={() => setChatTarget(null)}
                  >
                    # Phòng chung
                  </button>
                  {players
                    .filter((item) => item.id !== sessionId)
                    .map((item) => (
                      <button
                        key={item.id}
                        className={chatTarget?.sessionId === item.id ? 'selected' : ''}
                        onClick={() =>
                          setChatTarget({
                            sessionId: item.id,
                            userId: item.userId || item.id,
                            name: item.name,
                          })
                        }
                      >
                        {item.avatarUrl && (
                          <Image unoptimized src={item.avatarUrl} alt="" width={25} height={25} />
                        )}
                        {item.name}
                        <small>Chat riêng</small>
                      </button>
                    ))}
                </div>
                <div className="chat-view">
                  <h3>
                    {chatTarget ? `Chat riêng với ${chatTarget.name}` : 'Tin nhắn phòng chung'}
                  </h3>
                  <div className="chat-messages">
                    {visibleMessages.map((message) => (
                      <article key={message.id}>
                        <b>
                          {message.avatarUrl && (
                            <Image
                              unoptimized
                              src={message.avatarUrl}
                              alt=""
                              width={18}
                              height={18}
                            />
                          )}{' '}
                          {message.name}
                        </b>
                        <span>{message.text}</span>
                        {message.image && (
                          <Image
                            unoptimized
                            src={message.image}
                            alt="Ảnh chat"
                            width={240}
                            height={180}
                          />
                        )}
                      </article>
                    ))}
                    {!visibleMessages.length && <p>Chưa có tin nhắn trên máy này.</p>}
                  </div>
                  {pendingImage && (
                    <div className="pending-image">
                      Đã chọn ảnh <button onClick={() => setPendingImage(null)}>×</button>
                    </div>
                  )}
                  <form onSubmit={sendChat}>
                    <label>
                      ＋
                      <input
                        hidden
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) =>
                          event.target.files?.[0] && sendImage(event.target.files[0])
                        }
                      />
                    </label>
                    <input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Nhắn cho người đang online..."
                      maxLength={240}
                    />
                    <button disabled={connection !== 'online'}>GỬI</button>
                  </form>
                </div>
              </div>
              <form className="gift-form" onSubmit={gift}>
                <strong>Tặng phút chơi</strong>
                <input
                  placeholder="Nickname người nhận"
                  value={giftNick}
                  onChange={(event) => setGiftNick(event.target.value)}
                  required
                />
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={giftMinutes}
                  onChange={(event) => setGiftMinutes(Number(event.target.value))}
                />
                <button>TẶNG</button>
              </form>
            </section>
          )}
          {mainTab === 'rankings' && (
            <section className="ranking-panel">
              <h2>Bảng vàng phòng net</h2>
              <div>
                <article>
                  <h3>Đại gia phút chơi</h3>
                  {leaderboard.rich.map((item, index) => (
                    <p key={item.nickname}>
                      <b>
                        {index + 1}. {item.nickname}
                      </b>
                      <span>{formatMinutes(item.balance_seconds)}</span>
                    </p>
                  ))}
                </article>
                <article>
                  <h3>Top 5 người cứu net</h3>
                  {leaderboard.donors.map((item, index) => (
                    <p key={item.nickname}>
                      <b>
                        {index + 1}. {item.nickname}
                      </b>
                      <span>{formatMinutes(item.donated_seconds)}</span>
                    </p>
                  ))}
                </article>
              </div>
            </section>
          )}
          {profileOpen && (
            <div className="modal-backdrop">
              <section className="profile-modal">
                <h2>Profile</h2>
                <label>
                  Họ tên
                  <input
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                  />
                </label>
                <label>
                  Nickname
                  <input
                    value={profileNick}
                    onChange={(event) => setProfileNick(event.target.value)}
                  />
                </label>
                <label>
                  Ảnh avatar
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) =>
                      event.target.files?.[0] &&
                      readImage(event.target.files[0])
                        .then(setProfileImage)
                        .catch((error) => setNotice(error.message))
                    }
                  />
                </label>
                <div>
                  <button onClick={() => setProfileOpen(false)}>HỦY</button>
                  <button onClick={saveProfile}>LƯU</button>
                </div>
              </section>
            </div>
          )}
        </>
      ) : (
        <div className="intro-backdrop">
          <section className="intro-card">
            <span className="eyebrow">WELCOME TO NETVERSE</span>
            <h1>
              Một quán net.
              <br />
              <em>200 máy, nhiều kết nối.</em>
            </h1>
            {!authReady ? (
              <p>Đang tải tài khoản...</p>
            ) : player ? (
              <>
                <p>
                  Chào {player.nickname}. Bạn còn {formatMinutes(player.balance_seconds)} chơi net.
                </p>
                <button onClick={enter}>
                  BƯỚC VÀO QUÁN <span>↗</span>
                </button>
              </>
            ) : (
              <>
                <div className="auth-switch">
                  <button
                    className={authMode === 'login' ? 'selected' : ''}
                    onClick={() => setAuthMode('login')}
                  >
                    Đăng nhập
                  </button>
                  <button
                    className={authMode === 'register' ? 'selected' : ''}
                    onClick={() => setAuthMode('register')}
                  >
                    Tạo tài khoản
                  </button>
                </div>
                <form onSubmit={submitAuth}>
                  <label>
                    USERNAME
                    <input
                      value={form.username}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, username: event.target.value }))
                      }
                      required
                    />
                  </label>
                  {authMode === 'register' && (
                    <>
                      <label>
                        NICKNAME DUY NHẤT
                        <input
                          value={form.nickname}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, nickname: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label>
                        HỌ VÀ TÊN
                        <input
                          value={form.fullname}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, fullname: event.target.value }))
                          }
                          required
                        />
                      </label>
                    </>
                  )}
                  <label>
                    MẬT KHẨU
                    <input
                      type="password"
                      minLength={8}
                      value={form.password}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, password: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <button>
                    {authMode === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN'} <span>↗</span>
                  </button>
                </form>
              </>
            )}
            <small>Nhấp vào game để xoay camera · WASD di chuyển · E tương tác · Shift chạy</small>
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="Đóng thông báo">
            ×
          </button>
        </div>
      )}
      <footer className="footer">
        <span>
          NETVERSE 3D <i>×</i> OPEN WORLD
        </span>
        <span>
          <a href="/admin">ADMIN</a> · {stations.length} STATIONS
        </span>
      </footer>
    </main>
  );
}
