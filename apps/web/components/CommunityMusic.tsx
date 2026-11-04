'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Track = { id: string; title: string; file_url: string; started_at: string };

export default function CommunityMusic() {
  const [track, setTrack] = useState<Track | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [showPlayer, setShowPlayer] = useState(true);
  const [youtubeStart, setYoutubeStart] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const serverOffset = useRef(0);
  const trackKey = useRef('');

  useEffect(() => {
    queueMicrotask(() => setEnabled(localStorage.getItem('netverse-music-enabled') !== 'false'));
    const refresh = () => api<{ track: Track | null; serverTime: string }>('/api/music/current')
      .then((result) => {
        serverOffset.current = Date.parse(result.serverTime) - Date.now();
        const key = `${result.track?.id || ''}:${result.track?.started_at || ''}`;
        if (key !== trackKey.current) {
          trackKey.current = key;
          setYoutubeStart(result.track ? Math.max(0, Math.floor((Date.now() + serverOffset.current - Date.parse(result.track.started_at)) / 1000)) : 0);
        }
        setTrack((previous) => previous?.id === result.track?.id && previous?.started_at === result.track?.started_at
          ? previous : result.track);
      }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);

  const youtubeId = track?.file_url.match(/^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/)?.[1];
  useEffect(() => {
    const element = audio.current;
    if (!element || youtubeId) return;
    if (!track || !enabled) { element.pause(); return; }
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
  }, [track, enabled, youtubeId]);

  const toggle = () => {
    if (enabled && needsGesture && audio.current) {
      audio.current.play().then(() => setNeedsGesture(false)).catch(() => {});
      return;
    }
    const next = !enabled;
    localStorage.setItem('netverse-music-enabled', String(next));
    setEnabled(next);
    if (next && audio.current && !youtubeId)
      audio.current.play().then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
  };

  return (
    <div className="community-music" aria-label="Nhạc cộng đồng">
      {!youtubeId && <audio ref={audio} src={track?.file_url || undefined} loop preload="metadata" />}
      <span>♫ {track ? track.title : 'Chưa có nhạc chung'}</span>
      {youtubeId && enabled && <button type="button" onClick={() => setShowPlayer((current) => !current)}>{showPlayer ? 'ẨN VIDEO' : 'XEM VIDEO'}</button>}
      <button type="button" onClick={toggle} disabled={!track}>
        {enabled && !needsGesture ? 'TẮT NHẠC' : 'BẬT NHẠC'}
      </button>
      {youtubeId && enabled && <div className={`music-player ${showPlayer ? 'open' : ''}`}>
        <iframe title={`Nhạc cộng đồng: ${track?.title || ''}`} src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&start=${youtubeStart}&playsinline=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        <small>Nếu trình duyệt chặn tự phát, bấm phát trong video.</small>
      </div>}
    </div>
  );
}
