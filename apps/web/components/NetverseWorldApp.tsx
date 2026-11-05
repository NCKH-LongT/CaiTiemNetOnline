'use client';

import { Client, type Room } from '@colyseus/sdk';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import NetverseScene, { type RemotePlayer } from './NetverseScene';
import PcDesktop from './PcDesktop';
import CommunityMusic from './CommunityMusic';
import VoiceChat from './VoiceChat';
import { api, readImage, type ArtImage, type Player } from '@/lib/api';
import { loadChatMessages, saveChatMessage, type LocalChatMessage } from '@/lib/local-chat';
import { compressChatImage } from '@/lib/chat-image';
import { characters } from '@/lib/characters';
import { formatDuration } from '@/lib/time';
import { entranceZ } from '@/lib/stations';
import { nearestStation, spawn, stations, type Point3 } from '@/lib/stations';

type ChatMessage = LocalChatMessage;
const CharacterPreview = dynamic(() => import('./CharacterPreview'), { ssr: false, loading: () => <div className="character-preview" aria-label="Đang tải nhân vật" /> });
type Snapshot = { players: RemotePlayer[]; seats: Record<number, string> };
type Leaderboard = {
  rich: { nickname: string; balance_seconds: number }[];
  donors: { nickname: string; donated_seconds: number }[];
  art: ArtImage[];
  board?: { background_url: string | null; background_color: string };
};
const formatMinutes = formatDuration;

function MobileMovementControls({ heldKeys }: { heldKeys: React.RefObject<Set<string>> }) {
  const joystickPointer = useRef<number | null>(null);
  const runPointer = useRef<number | null>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const clearDirection = () => {
    for (const key of ['w', 'a', 's', 'd']) heldKeys.current.delete(key);
    setThumb({ x: 0, y: 0 });
  };
  const moveJoystick = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== joystickPointer.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = bounds.width * 0.34;
    const dx = (event.clientX - bounds.left - bounds.width / 2) / radius;
    const dy = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const scale = Math.max(1, Math.hypot(dx, dy));
    const x = dx / scale;
    const y = dy / scale;
    for (const key of ['w', 'a', 's', 'd']) heldKeys.current.delete(key);
    if (y < -0.28) heldKeys.current.add('w');
    if (y > 0.28) heldKeys.current.add('s');
    if (x < -0.28) heldKeys.current.add('a');
    if (x > 0.28) heldKeys.current.add('d');
    setThumb({ x, y });
  };
  const releaseJoystick = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== joystickPointer.current) return;
    joystickPointer.current = null;
    clearDirection();
  };
  const releaseRun = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== runPointer.current) return;
    runPointer.current = null;
    heldKeys.current.delete('shift');
  };
  useEffect(() => {
    const keys = heldKeys.current;
    const stop = () => {
      for (const key of ['w', 'a', 's', 'd', 'shift']) keys.delete(key);
      joystickPointer.current = null;
      runPointer.current = null;
      setThumb({ x: 0, y: 0 });
    };
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('blur', stop);
      for (const key of ['w', 'a', 's', 'd', 'shift']) keys.delete(key);
    };
  }, [heldKeys]);
  return (
    <div className="mobile-movement" aria-label="Điều khiển di chuyển">
      <button
        type="button"
        className="mobile-joystick"
        aria-label="Kéo cần điều khiển để di chuyển nhân vật"
        onPointerDown={(event) => {
          event.preventDefault();
          if (joystickPointer.current !== null) return;
          joystickPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveJoystick(event);
        }}
        onPointerMove={moveJoystick}
        onPointerUp={releaseJoystick}
        onPointerCancel={releaseJoystick}
        onLostPointerCapture={releaseJoystick}
      >
        <span className="mobile-joystick-ring" />
        <span className="mobile-joystick-thumb" style={{ transform: `translate(${thumb.x * 35}px, ${thumb.y * 35}px)` }} />
      </button>
      <button
        type="button"
        className="mobile-run"
        aria-label="Giữ để chạy"
        onPointerDown={(event) => {
          event.preventDefault();
          if (runPointer.current !== null) return;
          runPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          heldKeys.current.add('shift');
        }}
        onPointerUp={releaseRun}
        onPointerCancel={releaseRun}
        onLostPointerCapture={releaseRun}
      >
        CHẠY
      </button>
    </div>
  );
}

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
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const [seats, setSeats] = useState<Record<number, string>>({});
  const [seconds, setSeconds] = useState(3600);
  const [onlineSeconds, setOnlineSeconds] = useState(0);
  const [notice, setNotice] = useState('');
  const [mainTab, setMainTab] = useState<'world' | 'community' | 'rankings'>('world');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<{
    sessionId: string | null;
    userId: string;
    name: string;
    avatarUrl?: string | null;
  } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readAt, setReadAt] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard>({ rich: [], donors: [], art: [] });
  const [artist, setArtist] = useState<{
    uploads: number;
    likes: number;
    level: { name: string; badge_url: string | null } | null;
  } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileNick, setProfileNick] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileCharacter, setProfileCharacter] = useState(characters[0].id);
  const [giftNick, setGiftNick] = useState('');
  const [giftMinutes, setGiftMinutes] = useState(10);
  const [kneeling, setKneeling] = useState(false);
  const position = useRef<Point3>([...spawn]);
  const keys = useRef(new Set<string>());
  const room = useRef<Room | null>(null);
  const activeChat = useRef<{ tab: string; userId: string | null }>({ tab: 'world', userId: null });
  const playerId = player?.id;

  useEffect(() => {
    activeChat.current = { tab: mainTab, userId: chatTarget?.userId || null };
  }, [mainTab, chatTarget]);

  useEffect(() => {
    api<{ player: Player | null }>('/api/auth/me')
      .then(({ player: found }) => {
        if (found) {
          setPlayer(found);
          setSeconds(found.balance_seconds);
          setOnlineSeconds(found.online_seconds);
          try { setReadAt(JSON.parse(localStorage.getItem(`netverse-chat-read:${found.id}`) || '{}')); }
          catch { setReadAt({}); }
          position.current = found.balance_seconds > 0 ? [found.x, 0, found.z] : [0, 0, entranceZ + 3];
          setSceneStart([...position.current]);
          setSceneKey((current) => current + 1);
          setEntered(true);
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
      if (message.to && message.fromUserId !== playerId &&
        (activeChat.current.tab !== 'community' || activeChat.current.userId !== message.fromUserId))
        setNotice(`Tin nhắn riêng mới từ ${message.name}`);
      if (playerId && message.to && message.fromUserId && activeChat.current.tab === 'community' && activeChat.current.userId === message.fromUserId)
        setReadAt((current) => {
          const next = { ...current, [message.fromUserId!]: Math.max(current[message.fromUserId!] || 0, message.time) };
          localStorage.setItem(`netverse-chat-read:${playerId}`, JSON.stringify(next));
          return next;
        });
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
      api<{ uploads: number; likes: number; level: { name: string; badge_url: string | null } | null }>('/api/player/artist')
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
      player.balance_seconds > 0 ? player.z : entranceZ + 3,
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
    let retry: ReturnType<typeof setTimeout> | null = null;
    let healthTimer: ReturnType<typeof setInterval> | null = null;
    let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    let positionSynced = false;
    let verifyConnection = () => {};
    (async () => {
      const { ticket } = await api<{ ticket: string }>('/api/auth/ticket');
      if (cancelled) return;
      setConnection('connecting');
      const endpoint =
        process.env.NEXT_PUBLIC_GAME_URL ||
        (location.port === '3000' ? 'http://localhost:2567' : `${location.origin}/socket`);
      const client = new Client(endpoint);
      joined = await client.joinOrCreate('cafe', { ticket });
      if (cancelled) {
        joined.leave();
        return;
      }
      // A fresh ticket and room are needed after a long background suspension.
      joined.reconnection.enabled = false;
      room.current = joined;
      setSessionId(joined.sessionId);
      setConnection('online');
      joined.onMessage('snapshot', (snapshot: Snapshot) => {
        if (snapshotTimer) clearTimeout(snapshotTimer);
        snapshotTimer = null;
        if (!positionSynced) {
          const self = snapshot.players.find((item) => item.id === joined?.sessionId);
          if (self) {
            positionSynced = true;
            if (typeof self.balanceSeconds === 'number') setSeconds(self.balanceSeconds);
            if (typeof self.onlineSeconds === 'number') setOnlineSeconds(self.onlineSeconds);
            if (Math.hypot(position.current[0] - self.x, position.current[2] - self.z) > 0.05) {
              position.current = [self.x, 0, self.z];
              setSceneStart([self.x, 0, self.z]);
              setSceneKey((current) => current + 1);
            }
          }
        }
        setPlayers(snapshot.players);
        setSeats(snapshot.seats);
      });
      joined.onMessage('player-move', ({ id, x, z, heading }: { id: string; x: number; z: number; heading: number }) =>
        setPlayers((current) => current.map((item) => (item.id === id ? { ...item, x, z, heading } : item))),
      );
      joined.onMessage('nearby-players', (nearby: { id: string; x: number; z: number; heading: number }[]) =>
        setPlayers((current) =>
          current.map((item) => {
            const fresh = nearby.find((peer) => peer.id === item.id);
            return fresh ? { ...item, x: fresh.x, z: fresh.z, heading: fresh.heading } : item;
          }),
        ),
      );
      joined.onMessage('seat', ({ stationId, x, z }: { stationId: number | null; x?: number; z?: number }) => {
        setSeatedAt(stationId);
        if (stationId === null && Number.isFinite(x) && Number.isFinite(z)) {
          position.current = [x!, 0, z!];
          setSceneStart([x!, 0, z!]);
          setSceneKey((current) => current + 1);
        }
      });
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
      joined.onMessage('chat-heart', ({ messageId, userId, hearted }: { messageId: string; userId: string; hearted: boolean }) => {
        setMessages((current) => current.map((message) => {
          if (message.id !== messageId) return message;
          const next = { ...message, heartedBy: hearted
            ? [...new Set([...(message.heartedBy || []), userId])]
            : (message.heartedBy || []).filter((id) => id !== userId) };
          if (playerId) saveChatMessage(playerId, next).catch(() => {});
          return next;
        }));
      });
      verifyConnection = () => {
        if (cancelled || document.visibilityState !== 'visible' || !navigator.onLine || room.current !== joined) return;
        if (!joined!.connection.isOpen) {
          setConnectionAttempt((current) => current + 1);
          return;
        }
        if (snapshotTimer) clearTimeout(snapshotTimer);
        joined!.send('sync');
        snapshotTimer = setTimeout(() => {
          setConnection('connecting');
          setConnectionAttempt((current) => current + 1);
        }, 10000);
      };
      joined.onDrop(() => setConnection('connecting'));
      document.addEventListener('visibilitychange', verifyConnection);
      window.addEventListener('online', verifyConnection);
      window.addEventListener('pageshow', verifyConnection);
      healthTimer = setInterval(verifyConnection, 20000);
      verifyConnection();
      joined.onLeave((code) => {
        if (cancelled) return;
        room.current = null;
        setConnection('offline');
        setSessionId(null);
        setSeatedAt(null);
        setSeats({});
        setPlayers([]);
        if (code === 4409) {
          setNotice('Tài khoản đã mở quán ở tab khác. Làm mới trang này để tiếp tục tại đây.');
          return;
        }
        retry = setTimeout(() => setConnectionAttempt((current) => current + 1), 2000);
      });
    })().catch((error) => {
      if (!cancelled) {
        setConnection('offline');
        setNotice(`Không kết nối được game server: ${(error as Error).message}`);
        retry = setTimeout(() => setConnectionAttempt((current) => current + 1), 3000);
      }
    });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      if (healthTimer) clearInterval(healthTimer);
      if (snapshotTimer) clearTimeout(snapshotTimer);
      document.removeEventListener('visibilitychange', verifyConnection);
      window.removeEventListener('online', verifyConnection);
      window.removeEventListener('pageshow', verifyConnection);
      joined?.leave();
      room.current = null;
    };
  }, [entered, playerId, appendMessage, connectionAttempt]);

  const sit = useCallback(
    (stationId: number) => {
      if (!room.current?.connection.isOpen) {
        setConnection('connecting');
        setConnectionAttempt((current) => current + 1);
        setNotice('Đang kết nối lại game server. Hãy thử lại sau vài giây.');
        return;
      }
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
      room.current.send('move', { x: position.current[0], z: position.current[2] });
      room.current.send('sit', { stationId });
    },
    [seconds, seats, sessionId],
  );
  const stand = useCallback(() => {
    room.current?.send('stand');
  }, []);
  const reportDesktopView = useCallback((tab: 'desktop' | 'browser' | 'album' | 'top' | 'drawing', preview?: string, browserUrl?: string | null) => {
    room.current?.send('desktop-view', { tab, preview, browserUrl });
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
      try { setReadAt(JSON.parse(localStorage.getItem(`netverse-chat-read:${result.player.id}`) || '{}')); }
      catch { setReadAt({}); }
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
    setMobileMenuOpen(false);
  };
  const openProfile = () => {
    if (!player) return;
    setProfileName(player.fullname);
    setProfileNick(player.nickname);
    setProfileImage(null);
    setProfileCharacter(player.character_id || characters[0].id);
    setMobileMenuOpen(false);
    setProfileOpen(true);
  };
  const saveProfile = async () => {
    try {
      const result = await api<{ player: Player }>('/api/player/profile', {
        fullname: profileName,
        nickname: profileNick,
        image: profileImage,
        characterId: profileCharacter,
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
    const liveTarget = chatTarget && players.find((item) => item.userId === chatTarget.userId && item.id !== sessionId);
    if (chatTarget && !liveTarget) {
      setNotice('Người nhận đang offline. Tin nhắn riêng chỉ gửi khi cả hai online.');
      return;
    }
    room.current.send('chat', {
      to: liveTarget?.id ?? null,
      text: draft.trim().slice(0, 240),
      image: pendingImage,
    });
    setDraft('');
    setPendingImage(null);
  };
  const sendImage = async (file: File) => {
    try {
      const data = await compressChatImage(file);
      setPendingImage(data);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const reactHeart = (message: ChatMessage) => {
    if (!playerId || !room.current) return;
    const hearted = !(message.heartedBy || []).includes(playerId);
    const peerId = message.fromUserId === playerId ? message.toUserId : message.fromUserId;
    const target = peerId ? players.find((item) => item.userId === peerId) : undefined;
    if (message.to && !target) {
      setNotice('Người kia đang offline; hãy thả tim khi họ online.');
      return;
    }
    room.current.send('chat-heart', { messageId: message.id, hearted, to: message.to ? target?.id : null });
  };
  const conversations = new Map<string, { userId: string; name: string; avatarUrl: string | null; sessionId: string | null; lastTime: number; preview: string }>();
  for (const item of players) {
    if (item.id === sessionId || !item.userId) continue;
    conversations.set(item.userId, { userId: item.userId, name: item.name, avatarUrl: item.avatarUrl || null, sessionId: item.id, lastTime: 0, preview: 'Đang online' });
  }
  for (const message of messages) {
    if (!message.to) continue;
    const peerId = message.fromUserId === playerId ? message.toUserId : message.fromUserId;
    if (!peerId) continue;
    const old = conversations.get(peerId);
    if (!old || message.time >= old.lastTime) {
      const incoming = message.fromUserId === peerId;
      conversations.set(peerId, {
        userId: peerId,
        name: old?.name || (incoming ? message.name : message.toName) || `Người chơi ${peerId.slice(0, 6)}`,
        avatarUrl: old?.avatarUrl || (incoming ? message.avatarUrl : message.toAvatarUrl) || null,
        sessionId: old?.sessionId || null,
        lastTime: message.time,
        preview: message.text || (message.image ? 'Đã gửi ảnh' : ''),
      });
    }
  }
  const chatRooms = [...conversations.values()].sort((a, b) => b.lastTime - a.lastTime);
  const unreadCount = (userId: string) => messages.filter((message) =>
    message.to && message.fromUserId === userId && message.toUserId === playerId && message.time > (readAt[userId] || 0)).length;
  const unreadTotal = chatRooms.reduce((sum, item) => sum + unreadCount(item.userId), 0);
  const markRead = (userId: string, time = Date.now()) => {
    if (!playerId) return;
    setReadAt((current) => {
      const next = { ...current, [userId]: Math.max(current[userId] || 0, time) };
      localStorage.setItem(`netverse-chat-read:${playerId}`, JSON.stringify(next));
      return next;
    });
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
          localCharacterId={player?.character_id}
          localBalanceSeconds={seconds}
          localOnlineSeconds={onlineSeconds}
          localBadge={artist?.level?.name}
          localBadgeUrl={artist?.level?.badge_url}
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
        {entered && player && <div className="header-audio"><CommunityMusic /><VoiceChat active={connection === 'online'} /></div>}
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
        {entered && player && <button type="button" className="mobile-menu-toggle" onClick={() => setMobileMenuOpen((current) => !current)} aria-expanded={mobileMenuOpen} aria-controls="mobile-player-menu" aria-label="Mở menu người chơi">☰</button>}
      </header>
      {entered && player ? (
        <>
          {mobileMenuOpen && (
            <aside className="mobile-player-menu" id="mobile-player-menu" aria-label="Menu người chơi">
              <div><strong>{player.nickname}</strong><small>Còn {formatMinutes(seconds)} · {connection === 'online' ? 'Trực tuyến' : 'Đang kết nối'}</small></div>
              <button type="button" onClick={() => { setMobileMenuOpen(false); void save(); }}>Lưu game</button>
              <button type="button" onClick={openProfile}>Nhân vật / Profile</button>
              <button type="button" onClick={() => { void logout(); }}>Đăng xuất</button>
            </aside>
          )}
          <nav className="main-tabs" aria-label="Màn hình chính">
            <button
              className={mainTab === 'world' ? 'selected' : ''}
              onClick={() => { setMainTab('world'); setMobileMenuOpen(false); }}
            >
              <span className="nav-icon" aria-hidden="true">◈</span><span>THẾ GIỚI</span>
            </button>
            <button
              className={mainTab === 'community' ? 'selected' : ''}
              onClick={() => { setMainTab('community'); setMobileMenuOpen(false); }}
            >
              <span className="nav-icon" aria-hidden="true">♧</span><span>CỘNG ĐỒNG <span className="nav-online-count">({players.length})</span></span> {unreadTotal > 0 && <span className="unread-badge">{unreadTotal}</span>}
            </button>
            <button
              className={mainTab === 'rankings' ? 'selected' : ''}
              onClick={() => { setMainTab('rankings'); setMobileMenuOpen(false); }}
            >
              <span className="nav-icon" aria-hidden="true">★</span><span>BẢNG VÀNG</span>
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
              <b>{formatDuration(onlineSeconds)}</b>
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
              onClick={openProfile}
            >
              ĐỔI NHÂN VẬT / PROFILE
            </button>
            <button className="hud-action" onClick={logout}>
              ĐĂNG XUẤT
            </button>
          </aside>
          {mainTab === 'world' && !seatedAt && <MobileMovementControls heldKeys={keys} />}
          {nearbyId && !seatedAt && seconds > 0 && mainTab === 'world' && (
            <button type="button" className="interaction" onClick={() => sit(nearbyId)} aria-label={`Ngồi vào máy số ${nearbyId}`}>
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
              viewerId={player.id}
              onlinePlayers={players}
              onViewChange={reportDesktopView}
              onPrivateChat={(userId) => {
                const target = players.find((item) => item.userId === userId && item.id !== sessionId);
                if (!target || connection !== 'online') {
                  setNotice('Người này vừa offline. Hãy thử lại khi họ online.');
                  return;
                }
                setChatTarget({ sessionId: target.id, userId, name: target.name, avatarUrl: target.avatarUrl });
                setMainTab('community');
                markRead(userId);
              }}
              onAlbumChange={() => {
                room.current?.send('profile-refresh');
                window.dispatchEvent(new Event('netverse:art-updated'));
                api<{ uploads: number; likes: number; level: { name: string; badge_url: string | null } | null }>('/api/player/artist')
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
                  {chatRooms.map((item) => (
                      <button
                        key={item.userId}
                        className={`${chatTarget?.userId === item.userId ? 'selected' : ''} ${unreadCount(item.userId) ? 'unread' : ''}`}
                        onClick={() => { setChatTarget(item); markRead(item.userId); }}
                      >
                        {item.avatarUrl ? <Image unoptimized src={item.avatarUrl} alt="" width={25} height={25} /> : <span className="chat-avatar">{item.name[0]}</span>}
                        <span className="chat-room-label"><strong>{item.name}</strong><small>{item.preview}</small></span>
                        {unreadCount(item.userId) > 0 && <span className="unread-badge">{unreadCount(item.userId)}</span>}
                      </button>
                    ))}
                </div>
                <div className="chat-view">
                  <h3>
                    {chatTarget ? `Chat riêng với ${chatTarget.name}` : 'Tin nhắn phòng chung'}
                  </h3>
                  <div className="chat-messages">
                    {visibleMessages.map((message) => (
                      <article key={message.id} className={message.fromUserId === player.id ? 'chat-own' : 'chat-other'}>
                        <b>{message.avatarUrl ? <Image unoptimized src={message.avatarUrl} alt="" width={25} height={25} /> : <span className="chat-avatar">{message.name[0]}</span>}{' '}{message.name}</b>
                        <time dateTime={new Date(message.time).toISOString()}>{new Date(message.time).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</time>
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
                        <button type="button" className={`heart-button ${(message.heartedBy || []).includes(player.id) ? 'selected' : ''}`} onClick={() => reactHeart(message)} aria-label="Thả tim tin nhắn">♥ {message.heartedBy?.length || ''}</button>
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
                    <button disabled={connection !== 'online' || Boolean(chatTarget && !players.some((item) => item.userId === chatTarget.userId))}>GỬI</button>
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
            <section className="ranking-panel" style={{ backgroundColor: leaderboard.board?.background_color || '#231c3c', backgroundImage: leaderboard.board?.background_url ? `linear-gradient(#100e20b0,#100e20df),url(${leaderboard.board.background_url})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
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
                <fieldset className="character-picker">
                  <legend>Nhân vật đã tải · chọn để đổi</legend>
                  <CharacterPreview characterId={profileCharacter} />
                  <div>{characters.map((item) => <button key={item.id} type="button" className={profileCharacter === item.id ? 'selected' : ''} onClick={() => setProfileCharacter(item.id)} aria-pressed={profileCharacter === item.id}>{item.name}</button>)}</div>
                </fieldset>
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
              <em>{stations.length} máy, nhiều kết nối.</em>
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
            <small className="keyboard-help">W tiến · S lùi · A trái · D phải · E tương tác · Shift chạy</small>
            <small className="touch-help">Trên điện thoại: kéo cần điều khiển để đi, giữ CHẠY để chạy và chạm nút ngồi máy khi đến gần ghế.</small>
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
