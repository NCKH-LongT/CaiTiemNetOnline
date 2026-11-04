'use client';

import { Client, type Room } from '@colyseus/sdk';
import { useCallback, useEffect, useRef, useState } from 'react';
import NetverseScene, { type RemotePlayer } from './NetverseScene';
import { nearestStation, stations, type Point3 } from '@/lib/stations';

type Message = { id: string; name: string; text: string; time: number };
type Snapshot = { players: RemotePlayer[]; seats: Record<number, string>; messages: Message[] };

export default function NetverseApp() {
  const [entered, setEntered] = useState(false);
  const [nickname, setNickname] = useState('Khách 001');
  const [seatedAt, setSeatedAt] = useState<number | null>(null);
  const [nearbyId, setNearbyId] = useState<number | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const [seats, setSeats] = useState<Record<number, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<'pc' | 'community'>('pc');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const position = useRef<Point3>([0, 0, 5.7]);
  const keys = useRef(new Set<string>());
  const room = useRef<Room | null>(null);

  const sit = useCallback((stationId: number) => {
    const station = stations[stationId - 1];
    if (!station || nearestStation(position.current[0], position.current[2])?.stationId !== stationId) {
      setNotice('Hãy đến gần ghế để sử dụng máy.');
      return;
    }
    if (seats[stationId] && seats[stationId] !== sessionId) {
      setNotice('Máy này đang có người sử dụng.');
      return;
    }
    setNotice('');
    if (room.current) {
      room.current.send('move', { x: position.current[0], z: position.current[2] });
      room.current.send('sit', { stationId });
    }
    else setSeatedAt(stationId);
  }, [seats, sessionId]);

  const stand = useCallback(() => {
    room.current?.send('stand');
    setSeatedAt(null);
    setTab('pc');
  }, []);

  useEffect(() => {
    if (!entered) return;
    let cancelled = false;
    const endpoint = process.env.NEXT_PUBLIC_GAME_URL || (location.port === '3000' ? 'http://localhost:2567' : `${location.origin}/socket`);
    const client = new Client(endpoint);
    client.joinOrCreate('cafe', { name: nickname }).then((joined) => {
      if (cancelled) { joined.leave(); return; }
      room.current = joined;
      setSessionId(joined.sessionId);
      setConnection('online');
      joined.onMessage('snapshot', (snapshot: Snapshot) => {
        setPlayers(snapshot.players);
        setSeats(snapshot.seats);
        setMessages(snapshot.messages);
      });
      joined.onMessage('seat', (message: { stationId: number }) => setSeatedAt(message.stationId));
      joined.onMessage('notice', (message: { text: string }) => setNotice(message.text));
      joined.send('sync');
      joined.onLeave(() => {
        room.current = null;
        setSessionId(null);
        setConnection('offline');
        setSeatedAt(null);
        setSeats({});
      });
    }).catch(() => { if (!cancelled) setConnection('offline'); });
    return () => {
      cancelled = true;
      room.current?.leave();
      room.current = null;
    };
  }, [entered, nickname]);

  useEffect(() => {
    if (!entered) return;
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
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

  const onMove = useCallback((x: number, z: number) => room.current?.send('move', { x, z }), []);
  const onPositionChange = useCallback((x: number, z: number) => { position.current = [x, 0, z]; }, []);
  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim().slice(0, 240);
    if (text && room.current) room.current.send('chat', { text });
    setDraft('');
  };

  return (
    <main className="app-shell">
      <div className="scene-wrap">
        <NetverseScene
          heldKeys={keys}
          seatedAt={seatedAt}
          occupiedSeats={seats}
          remotePlayers={players}
          sessionId={sessionId}
          onNearbyChange={setNearbyId}
          onPositionChange={onPositionChange}
          onMove={onMove}
          onScreenClick={sit}
        />
      </div>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">N<span>·</span></span><span><strong>NETVERSE</strong><small>INTERNET CAFÉ / 3D WORLD</small></span></div>
        <div className="topbar-right"><span className="room-tag">PHÒNG 01 <i /> 10 MÁY</span><span className={`connection ${connection}`}><i />{connection === 'online' ? 'TRỰC TUYẾN' : connection === 'connecting' ? 'ĐANG KẾT NỐI' : 'CHƠI THỬ'}</span></div>
      </header>
      <div className="scene-label"><span>KHÔNG GIAN / 01</span><strong>Quán net tương lai</strong></div>
      {entered ? (
        <>
          <aside className="hud-left"><span className="eyebrow">NHÂN VẬT</span><div className="player-avatar">N</div><strong>{nickname}</strong><small>{seatedAt ? `Đang dùng máy #${String(seatedAt).padStart(2, '0')}` : 'Đang khám phá quán'}</small><div className="hud-divider" /><span className="eyebrow">TRẠNG THÁI</span><div className="stat-row"><span>Máy đang dùng</span><b>{Object.keys(seats).length}/10</b></div><div className="stat-row"><span>Người chơi</span><b>{connection === 'online' ? players.length : 1}</b></div></aside>
          <div className="controls"><span className="eyebrow">ĐIỀU KHIỂN</span><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Di chuyển</span></div><div><kbd>SHIFT</kbd><span>Chạy</span></div><div><kbd>E</kbd><span>Ngồi / đứng dậy</span></div></div>
          {nearbyId && !seatedAt ? <button className="interaction" onClick={() => sit(nearbyId)}><kbd>E</kbd><span>Ngồi vào <b>máy #{String(nearbyId).padStart(2, '0')}</b></span></button> : null}
          {notice ? <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></div> : null}
          {seatedAt ? (
            <section className="pc-panel" aria-label={`Giao diện máy ${seatedAt}`}>
              <div className="pc-header"><div><span className="pc-icon">⌘</span><span><small>NETVERSE / STATION</small><strong>Máy #{String(seatedAt).padStart(2, '0')}</strong></span></div><button onClick={stand} aria-label="Đứng dậy và đóng máy">ĐỨNG DẬY <span>×</span></button></div>
              <div className="pc-tabs"><button className={tab === 'pc' ? 'selected' : ''} onClick={() => setTab('pc')}>AI DESK</button><button className={tab === 'community' ? 'selected' : ''} onClick={() => setTab('community')}>CỘNG ĐỒNG</button></div>
              {tab === 'pc' ? <div className="pc-body"><div className="ai-orb">✦</div><span className="eyebrow">COMING NEXT</span><h2>Trợ lý AI<br />đang được chuẩn bị.</h2><p>Đây là vùng tương tác của màn hình PC. Phiên AI riêng và bảo vệ quota sẽ được tích hợp ở giai đoạn tiếp theo.</p><div className="feature-pills"><span>OpenAI / Gemini</span><span>Phiên riêng</span><span>Streaming</span></div></div> : <div className="community-body"><div className="messages">{messages.length ? messages.map((message) => <div className="message" key={message.id}><b>{message.name}</b><span>{message.text}</span></div>) : <p>Chưa có tin nhắn nào trong phòng.</p>}</div><form onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={240} placeholder={connection === 'online' ? 'Nhắn cho mọi người...' : 'Cần kết nối game server để trò chuyện'} disabled={connection !== 'online'} aria-label="Tin nhắn cộng đồng" /><button disabled={connection !== 'online' || !draft.trim()} aria-label="Gửi tin nhắn">→</button></form></div>}
            </section>
          ) : null}
        </>
      ) : <div className="intro-backdrop"><section className="intro-card"><span className="eyebrow">WELCOME TO THE NEXT SPACE</span><h1>Một quán net.<br /><em>Vô vàn kết nối.</em></h1><p>Dạo quanh không gian 3D, chọn một trong 10 máy và cùng khám phá trải nghiệm NETVERSE.</p><label htmlFor="nickname">TÊN HIỂN THỊ</label><input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 24))} maxLength={24} /><button onClick={() => setEntered(true)} disabled={!nickname.trim()}>BƯỚC VÀO QUÁN <span>↗</span></button><small>WASD di chuyển · E tương tác · Shift chạy</small></section></div>}
      <footer className="footer"><span>NETVERSE 3D <i>×</i> EARLY ACCESS</span><span>LOW POLY WORLD · V0.1</span></footer>
    </main>
  );
}
