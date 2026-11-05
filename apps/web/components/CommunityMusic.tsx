'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Track = { id: string; title: string; file_url: string; started_at: string };
type YTPlayer = {
  destroy(): void; playVideo(): void; pauseVideo(): void; seekTo(seconds: number, ahead: boolean): void;
  getCurrentTime(): number; getDuration(): number; setVolume(value: number): void;
};
type YTApi = { Player: new (node: HTMLElement, options: { width: number; height: number; videoId: string; host: string; playerVars: Record<string, string | number>; events: { onReady: (event: { target: YTPlayer }) => void; onAutoplayBlocked: () => void; onStateChange: (event: { data: number }) => void } }) => YTPlayer };
declare global { interface Window { YT?: YTApi; onYouTubeIframeAPIReady?: () => void } }
let ytPromise: Promise<YTApi> | null = null;
function loadYouTube(): Promise<YTApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytPromise) ytPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT!); };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return ytPromise;
}

export default function CommunityMusic() {
  const [track, setTrack] = useState<Track | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [volume, setVolume] = useState(65);
  const audio = useRef<HTMLAudioElement>(null);
  const youtubeNode = useRef<HTMLDivElement>(null);
  const youtubePlayer = useRef<YTPlayer | null>(null);
  const serverOffset = useRef(0);
  const enabledRef = useRef(enabled);
  const volumeRef = useRef(volume);
  useEffect(() => { enabledRef.current = enabled; volumeRef.current = volume; }, [enabled, volume]);

  useEffect(() => {
    queueMicrotask(() => {
      setEnabled(localStorage.getItem('netverse-music-enabled') === 'true');
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

  const youtubeId = track?.file_url.match(/^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/)?.[1];
  const startedAt = track?.started_at;
  useEffect(() => {
    if (!enabled || !youtubeId || !startedAt || !youtubeNode.current) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const node = youtubeNode.current;
    const sync = (player: YTPlayer) => {
      const duration = player.getDuration();
      if (!Number.isFinite(duration) || duration <= 0) return;
      const target = Math.max(0, (Date.now() + serverOffset.current - Date.parse(startedAt)) / 1000) % duration;
      if (Math.abs(player.getCurrentTime() - target) > 2.5) player.seekTo(target, true);
    };
    loadYouTube().then((YT) => {
      if (!active) return;
      youtubePlayer.current = new YT.Player(node, {
        width: 220,
        height: 220,
        videoId: youtubeId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 0, playsinline: 1, controls: 1, origin: window.location.origin, loop: 1, playlist: youtubeId },
        events: { onReady: ({ target }) => {
          target.setVolume(volumeRef.current);
          sync(target);
          if (enabledRef.current) target.playVideo();
          timer = setInterval(() => sync(target), 5000);
        }, onAutoplayBlocked: () => setNeedsGesture(true), onStateChange: ({ data }) => { if (data === 1) setNeedsGesture(false); } },
      });
    }).catch(() => setNeedsGesture(true));
    return () => { active = false; if (timer) clearInterval(timer); youtubePlayer.current?.destroy(); youtubePlayer.current = null; };
  }, [youtubeId, startedAt, enabled]);

  useEffect(() => {
    if (youtubePlayer.current) {
      youtubePlayer.current.setVolume(volume);
      if (!enabled) youtubePlayer.current.pauseVideo();
    }
    if (audio.current) { audio.current.volume = volume / 100; if (!enabled) audio.current.pause(); }
  }, [volume, enabled]);

  useEffect(() => {
    const element = audio.current;
    if (!element || youtubeId || !track || !enabled) return;
    const sync = () => {
      if (!Number.isFinite(element.duration) || element.duration <= 0) return;
      const target = Math.max(0, (Date.now() + serverOffset.current - Date.parse(track.started_at)) / 1000) % element.duration;
      if (Math.abs(element.currentTime - target) > 2) element.currentTime = target;
    };
    element.addEventListener('loadedmetadata', sync);
    sync();
    element.play().then(() => setNeedsGesture(false)).catch(() => {
      setNeedsGesture(true);
      setEnabled(false);
      localStorage.setItem('netverse-music-enabled', 'false');
    });
    const timer = setInterval(sync, 5000);
    return () => { element.removeEventListener('loadedmetadata', sync); clearInterval(timer); };
  }, [track, enabled, youtubeId]);

  const toggle = (next: boolean) => {
    localStorage.setItem('netverse-music-enabled', String(next));
    setNeedsGesture(false);
    setEnabled(next);
    if (next) audio.current?.play().then(() => setNeedsGesture(false)).catch(() => {
      setNeedsGesture(true);
      setEnabled(false);
      localStorage.setItem('netverse-music-enabled', 'false');
    });
    else { audio.current?.pause(); youtubePlayer.current?.pauseVideo(); }
  };
  return <div className="community-music" aria-label="Nhạc cộng đồng" title={track?.title || 'Chưa có nhạc chung'}>
    {!youtubeId && <audio ref={audio} src={track?.file_url || undefined} loop preload="metadata" />}
    <label className="music-toggle"><input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} disabled={!track} /><span>Nhạc</span></label>
    <label className="music-volume"><input type="range" min="0" max="100" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); localStorage.setItem('netverse-music-volume', String(next)); }} aria-label="Âm lượng nhạc chung" /><output>{volume}%</output></label>
    {youtubeId && enabled && <div className="music-player"><div ref={youtubeNode} /><small>{needsGesture ? 'Chạm video để phát nhạc.' : `♫ ${track?.title}`}</small></div>}
  </div>;
}
