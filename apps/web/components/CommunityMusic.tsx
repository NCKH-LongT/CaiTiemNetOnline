'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Track = { id: string; title: string; file_url: string; started_at: string };

export default function CommunityMusic() {
  const [track, setTrack] = useState<Track | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [needsGesture, setNeedsGesture] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const serverOffset = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem('netverse-music-enabled') !== 'false';
    queueMicrotask(() => setEnabled(saved));
    const refresh = () => api<{ track: Track | null; serverTime: string }>('/api/music/current')
      .then((result) => {
        serverOffset.current = Date.parse(result.serverTime) - Date.now();
        setTrack((previous) =>
        previous?.id === result.track?.id && previous?.started_at === result.track?.started_at
          ? previous : result.track);
      })
      .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    if (!track || !enabled) {
      element.pause();
      return;
    }
    const sync = () => {
      if (!Number.isFinite(element.duration) || element.duration <= 0) return;
      const elapsed = Math.max(0, (Date.now() + serverOffset.current - Date.parse(track.started_at)) / 1000);
      const target = elapsed % element.duration;
      if (Math.abs(element.currentTime - target) > 2) element.currentTime = target;
    };
    element.addEventListener('loadedmetadata', sync);
    sync();
    element.play().then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
    return () => element.removeEventListener('loadedmetadata', sync);
  }, [track, enabled]);

  const toggle = () => {
    if (enabled && needsGesture && audio.current) {
      audio.current.play().then(() => setNeedsGesture(false)).catch(() => {});
      return;
    }
    const next = !enabled;
    localStorage.setItem('netverse-music-enabled', String(next));
    setEnabled(next);
    if (next && audio.current) audio.current.play().then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
  };

  return (
    <div className="community-music" aria-label="Nhạc cộng đồng">
      <audio ref={audio} src={track?.file_url || undefined} loop preload="metadata" />
      <span>♫ {track ? track.title : 'Chưa có nhạc chung'}</span>
      <button type="button" onClick={toggle} disabled={!track}>
        {enabled && !needsGesture ? 'TẮT NHẠC' : 'BẬT NHẠC'}
      </button>
    </div>
  );
}
