'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Track = { id: string; title: string; file_url: string; started_at: string };
const isLegacyVideo = (url: string) => /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(url);

export default function CommunityMusic() {
  const [track, setTrack] = useState<Track | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [playError, setPlayError] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [volume, setVolume] = useState(65);
  const audio = useRef<HTMLAudioElement>(null);
  const serverOffset = useRef(0);

  useEffect(() => {
    queueMicrotask(() => {
      setEnabled(localStorage.getItem('netverse-music-enabled') !== 'false');
      setVolume(Math.min(100, Math.max(0, Number(localStorage.getItem('netverse-music-volume') ?? 65) || 0)));
    });
    const refresh = () => api<{ track: Track | null; serverTime: string }>('/api/music/current')
      .then((result) => {
        serverOffset.current = Date.parse(result.serverTime) - Date.now();
        setTrack((previous) => previous?.id === result.track?.id && previous?.started_at === result.track?.started_at ? previous : result.track);
      }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);

  const playable = Boolean(track && !isLegacyVideo(track.file_url));
  useEffect(() => {
    if (audio.current) {
      audio.current.volume = volume / 100;
      if (!enabled || !playable) audio.current.pause();
    }
  }, [volume, enabled, playable]);

  useEffect(() => {
    const element = audio.current;
    if (!element || !track || !enabled || !playable) return;
    const sync = () => {
      if (!Number.isFinite(element.duration) || element.duration <= 0) return;
      const target = Math.max(0, (Date.now() + serverOffset.current - Date.parse(track.started_at)) / 1000) % element.duration;
      if (Math.abs(element.currentTime - target) > 2) element.currentTime = target;
    };
    element.addEventListener('loadedmetadata', sync);
    sync();
    element.play().then(() => { setNeedsGesture(false); setPlayError(false); }).catch(() => setNeedsGesture(true));
    const timer = setInterval(sync, 5000);
    return () => { element.removeEventListener('loadedmetadata', sync); clearInterval(timer); };
  }, [track, enabled, playable]);

  const toggle = (next: boolean) => {
    localStorage.setItem('netverse-music-enabled', String(next));
    setEnabled(next);
    setNeedsGesture(false);
    if (!next) audio.current?.pause();
    else audio.current?.play().then(() => { setNeedsGesture(false); setPlayError(false); }).catch(() => setNeedsGesture(true));
  };
  const unavailable = Boolean(track && !playable);
  const title = unavailable ? 'Bài YouTube cũ không thể phát ẩn. Admin hãy chọn URL âm thanh trực tiếp.' : playError ? 'Nguồn âm thanh không phát được. Admin hãy kiểm tra URL.' : track?.title || 'Chưa có nhạc chung';
  return <div className="community-music" aria-label="Nhạc cộng đồng" title={title}>
    <audio ref={audio} src={playable ? track?.file_url : undefined} loop preload="metadata" onError={() => { setPlayError(true); setNeedsGesture(false); }} />
    <label className="music-toggle"><input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} /><span>Nhạc</span></label>
    <label className="music-volume"><input type="range" min="0" max="100" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); localStorage.setItem('netverse-music-volume', String(next)); }} aria-label="Âm lượng nhạc chung" /><output>{volume}%</output></label>
    {(unavailable || playError) && <button type="button" className="music-warning" onClick={() => setShowWarning((current) => !current)} aria-label={title} aria-expanded={showWarning}>⚠</button>}
    {showWarning && (unavailable || playError) && <span className="music-warning-note" role="status">{title}</span>}
    {needsGesture && playable && enabled && !playError && <button type="button" className="music-resume" onClick={() => audio.current?.play().then(() => setNeedsGesture(false)).catch(() => {})}>Phát nhạc</button>}
  </div>;
}
