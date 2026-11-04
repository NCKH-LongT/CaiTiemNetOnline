'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Track = { id: string; title: string; file_url: string; started_at: string };
type YTPlayer = {
  destroy(): void; playVideo(): void; pauseVideo(): void; seekTo(seconds: number, ahead: boolean): void;
  getCurrentTime(): number; getDuration(): number; setVolume(value: number): void;
};
type YTApi = { Player: new (node: HTMLElement, options: { videoId: string; host: string; playerVars: Record<string, string | number>; events: { onReady: (event: { target: YTPlayer }) => void } }) => YTPlayer };
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
  const [enabled, setEnabled] = useState(true);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [volume, setVolume] = useState(65);
  const audio = useRef<HTMLAudioElement>(null);
  const youtubeNode = useRef<HTMLDivElement>(null);
  const youtubePlayer = useRef<YTPlayer | null>(null);
  const serverOffset = useRef(0);
  const enabledRef = useRef(enabled);
  const volumeRef = useRef(volume);
  const showRef = useRef(showPlayer);
  useEffect(() => { enabledRef.current = enabled; volumeRef.current = volume; showRef.current = showPlayer; }, [enabled, volume, showPlayer]);

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

  const youtubeId = track?.file_url.match(/^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/)?.[1];
  const startedAt = track?.started_at;
  useEffect(() => {
    if (!youtubeId || !startedAt || !youtubeNode.current) return;
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
        videoId: youtubeId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 0, playsinline: 1, controls: 1, origin: window.location.origin, loop: 1, playlist: youtubeId },
        events: { onReady: ({ target }) => {
          target.setVolume(volumeRef.current);
          sync(target);
          if (enabledRef.current && showRef.current) target.playVideo(); else target.pauseVideo();
          timer = setInterval(() => { if (showRef.current) sync(target); }, 5000);
        } },
      });
    }).catch(() => setNeedsGesture(true));
    return () => { active = false; if (timer) clearInterval(timer); youtubePlayer.current?.destroy(); youtubePlayer.current = null; };
  }, [youtubeId, startedAt]);

  useEffect(() => {
    if (youtubePlayer.current) {
      youtubePlayer.current.setVolume(volume);
      if (enabled && showPlayer) youtubePlayer.current.playVideo(); else youtubePlayer.current.pauseVideo();
    }
    if (audio.current) { audio.current.volume = volume / 100; if (!enabled) audio.current.pause(); }
  }, [volume, enabled, showPlayer]);

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
    element.play().then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
    const timer = setInterval(sync, 5000);
    return () => { element.removeEventListener('loadedmetadata', sync); clearInterval(timer); };
  }, [track, enabled, youtubeId]);

  const toggle = () => {
    if (needsGesture) {
      if (showPlayer) youtubePlayer.current?.playVideo();
      audio.current?.play().then(() => setNeedsGesture(false)).catch(() => {});
      setNeedsGesture(false);
      return;
    }
    const next = !enabled;
    localStorage.setItem('netverse-music-enabled', String(next));
    setEnabled(next);
  };
  return <div className="community-music" aria-label="Nhạc cộng đồng">
    {!youtubeId && <audio ref={audio} src={track?.file_url || undefined} loop preload="metadata" />}
    <span>♫ {track ? track.title : 'Chưa có nhạc chung'}</span>
    {youtubeId && <button type="button" onClick={() => setShowPlayer((current) => !current)}>{showPlayer ? 'ẨN VIDEO · DỪNG' : 'MỞ VIDEO · PHÁT'}</button>}
    <label className="music-volume">Âm lượng <input type="range" min="0" max="100" value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); localStorage.setItem('netverse-music-volume', String(next)); }} aria-label="Âm lượng nhạc chung" />{volume}%</label>
    <button type="button" onClick={toggle} disabled={!track}>{enabled && !needsGesture ? 'TẮT NHẠC' : 'BẬT NHẠC'}</button>
    {youtubeId && <div className={`music-player ${showPlayer ? 'open' : ''}`}><div ref={youtubeNode} /><small>Nhạc đồng bộ theo giờ máy chủ.</small></div>}
  </div>;
}
