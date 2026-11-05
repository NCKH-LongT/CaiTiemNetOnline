'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Peer = { id: string; distance: number };
type Signal = { type: 'ready' | 'peers' | 'offer' | 'answer' | 'ice'; id?: string; peers?: Peer[]; from?: string; payload?: RTCSessionDescriptionInit | RTCIceCandidateInit };
type Connection = { pc: RTCPeerConnection; audio: HTMLAudioElement; distance: number };
const radius = 12;

export default function VoiceChat({ active }: { active: boolean }) {
  const [listening, setListening] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState('');
  const socket = useRef<WebSocket | null>(null);
  const peers = useRef(new Map<string, Connection>());
  const micStream = useRef<MediaStream | null>(null);
  useEffect(() => { micStream.current?.getAudioTracks().forEach((track) => { track.enabled = micOn; }); }, [micOn]);

  useEffect(() => {
    if (!active || !listening) return;
    let stopped = false;
    let selfId = '';
    let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    const peerMap = peers.current;
    const closePeer = (id: string) => {
      const entry = peerMap.get(id);
      if (!entry) return;
      entry.pc.close();
      entry.audio.pause();
      entry.audio.srcObject = null;
      entry.audio.remove();
      peerMap.delete(id);
    };
    const send = (message: object) => { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message)); };
    const ensurePeer = (id: string, distance = radius) => {
      const previous = peerMap.get(id);
      if (previous) return previous;
      const pc = new RTCPeerConnection({ iceServers });
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      const entry = { pc, audio, distance };
      peerMap.set(id, entry);
      const sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
      const track = micStream.current?.getAudioTracks()[0];
      if (track) void sender.replaceTrack(track);
      pc.onicecandidate = (event) => { if (event.candidate) send({ type: 'ice', to: id, payload: event.candidate.toJSON() }); };
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        audio.volume = Math.max(0, (1 - entry.distance / radius) ** 2);
        void audio.play().catch(() => setStatus('Chạm lại nút nghe để phát âm thanh.'));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') { closePeer(id); setStatus('Một kết nối voice thất bại; hãy thử bật lại tiếng cộng đồng.'); }
      };
      return entry;
    };
    const handleSignal = async (message: Signal) => {
      if (message.type === 'ready' && message.id) { selfId = message.id; setStatus(''); return; }
      if (message.type === 'peers' && message.peers && selfId) {
        const current = new Set(message.peers.map((item) => item.id));
        for (const id of peerMap.keys()) if (!current.has(id)) closePeer(id);
        setCount(message.peers.length);
        for (const item of message.peers) {
          const existed = peerMap.has(item.id);
          const entry = ensurePeer(item.id, item.distance);
          entry.distance = item.distance;
          entry.audio.volume = Math.max(0, (1 - item.distance / radius) ** 2);
          if (!existed && selfId < item.id) {
            const offer = await entry.pc.createOffer();
            await entry.pc.setLocalDescription(offer);
            send({ type: 'offer', to: item.id, payload: offer });
          }
        }
        return;
      }
      if (!message.from || !message.payload) return;
      const entry = ensurePeer(message.from);
      if (message.type === 'offer') {
        await entry.pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        send({ type: 'answer', to: message.from, payload: answer });
      } else if (message.type === 'answer') await entry.pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      else if (message.type === 'ice') await entry.pc.addIceCandidate(message.payload as RTCIceCandidateInit);
    };
    api<{ ticket: string; iceServers: RTCIceServer[] }>('/api/voice/ticket').then(({ ticket, iceServers: configured }) => {
      if (stopped) return;
      iceServers = configured;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/voice/`);
      socket.current = ws;
      ws.onopen = () => send({ type: 'auth', ticket });
      let processing = Promise.resolve();
      ws.onmessage = (event) => {
        processing = processing.then(() => handleSignal(JSON.parse(event.data))).catch(() => setStatus('Không kết nối được một người chơi gần bạn.'));
      };
      ws.onclose = () => { if (!stopped) setStatus('Voice mất kết nối. Tắt rồi bật lại nút nghe.'); };
      ws.onerror = () => { if (!stopped) setStatus('Không kết nối được voice server.'); };
    }).catch(() => { if (!stopped) setStatus('Không lấy được quyền truy cập voice.'); });
    return () => {
      stopped = true;
      socket.current?.close();
      socket.current = null;
      for (const id of peerMap.keys()) closePeer(id);
      micStream.current?.getTracks().forEach((track) => track.stop());
      micStream.current = null;
      setMicOn(false);
      setCount(0);
    };
  }, [active, listening]);

  const toggleMic = async () => {
    if (micOn) {
      await Promise.allSettled([...peers.current.values()].map((entry) => entry.pc.getSenders().find((sender) => sender.track?.kind === 'audio')?.replaceTrack(null)));
      micStream.current?.getTracks().forEach((track) => track.stop());
      micStream.current = null;
      setMicOn(false);
      return;
    }
    try {
      if (!micStream.current) micStream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const track = micStream.current.getAudioTracks()[0];
      track.enabled = true;
      await Promise.allSettled([...peers.current.values()].map((entry) => entry.pc.getSenders().find((sender) => sender.track?.kind === 'audio' || sender.track === null)?.replaceTrack(track)));
      setMicOn(true);
      setStatus('');
    } catch { setStatus('Không truy cập được micro. Hãy cấp quyền micro cho trình duyệt.'); }
  };

  return <div className="voice-controls" aria-label="Voice chat" title={status || `Nghe tối đa 6 người trong bán kính ${radius}m`}>
    <button type="button" className={listening ? 'selected' : ''} onClick={() => { setListening(!listening); if (listening) { setMicOn(false); setCount(0); } }} aria-pressed={listening} disabled={!active}>{listening ? `🔊 ${count}` : '🔇 Nghe'}</button>
    <button type="button" className={micOn ? 'selected' : ''} onClick={() => { void toggleMic(); }} aria-pressed={micOn} disabled={!active || !listening}>{micOn ? '🎙️ Mic' : '🎤 Mic'}</button>
    {status && <span className="voice-status" role="status">{status}</span>}
  </div>;
}
