'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { api, readImage, type ArtImage } from '@/lib/api';

type State = { wallpaper_url?: string; browser_url?: string };
type Props = {
  stationId: number;
  seconds: number;
  onNotice: (text: string) => void;
  onStand: () => void;
};
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
function embeddableUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') throw new Error('Chỉ hỗ trợ URL HTTPS.');
  const videoId =
    parsed.hostname === 'youtu.be'
      ? parsed.pathname.slice(1)
      : ['youtube.com', 'www.youtube.com'].includes(parsed.hostname) && parsed.pathname === '/watch'
        ? parsed.searchParams.get('v')
        : null;
  if (videoId && /^[\w-]{11}$/.test(videoId))
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  return parsed.href;
}

export default function PcDesktop({ stationId, seconds, onNotice, onStand }: Props) {
  const [tab, setTab] = useState<'desktop' | 'browser' | 'album' | 'top'>('desktop');
  const [state, setState] = useState<State>({});
  const [images, setImages] = useState<ArtImage[]>([]);
  const [top, setTop] = useState<ArtImage[]>([]);
  const [url, setUrl] = useState('https://www.wikipedia.org');
  const [title, setTitle] = useState('');
  const [drawing, setDrawing] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);

  const refresh = async () => {
    const result = await api<{ state: State; images: ArtImage[] }>(`/api/pc/${stationId}`);
    setState(result.state);
    setImages(result.images);
    setUrl(result.state.browser_url || 'https://www.wikipedia.org');
  };
  useEffect(() => {
    api<{ state: State; images: ArtImage[] }>(`/api/pc/${stationId}`)
      .then((result) => {
        setState(result.state);
        setImages(result.images);
        setUrl(result.state.browser_url || 'https://www.wikipedia.org');
      })
      .catch(() => onNotice('Không tải được dữ liệu PC.'));
  }, [stationId, onNotice]);
  useEffect(() => {
    if (tab === 'top')
      api<{ art: ArtImage[] }>('/api/leaderboard')
        .then((result) => setTop(result.art))
        .catch(() => {});
  }, [tab]);
  useEffect(() => {
    if (!drawing || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    context.fillStyle = '#282247';
    context.fillRect(0, 0, 960, 540);
    context.strokeStyle = '#92f2d5';
    context.lineWidth = 6;
    context.lineCap = 'round';
  }, [drawing]);

  const uploadWallpaper = async (file: File) => {
    try {
      await api(`/api/pc/${stationId}`, { wallpaper: await readImage(file) });
      await refresh();
      onNotice('Đã lưu hình nền cho máy này.');
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const uploadArt = async (file: File) => {
    try {
      await api('/api/art/upload', { stationId, title, image: await readImage(file) });
      setTitle('');
      await refresh();
      onNotice('Đã đăng ảnh vào album của máy.');
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const vote = async (id: string, value: number) => {
    try {
      await api('/api/art/vote', { imageId: id, vote: value });
      await refresh();
      if (tab === 'top') setTop((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const navigate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const destination = embeddableUrl(url);
      await api(`/api/pc/${stationId}`, { browserUrl: destination });
      setState((current) => ({ ...current, browser_url: destination }));
      setUrl(destination);
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const target = event.currentTarget;
    const bounds = target.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) * target.width) / bounds.width;
    const y = ((event.clientY - bounds.top) * target.height) / bounds.height;
    const context = target.getContext('2d');
    if (!context) return;
    if (!painting.current) {
      context.beginPath();
      context.moveTo(x, y);
      painting.current = true;
    } else {
      context.lineTo(x, y);
      context.stroke();
    }
  };
  const saveDrawing = async () => {
    if (!canvas.current) return;
    try {
      await api(`/api/pc/${stationId}`, { wallpaper: canvas.current.toDataURL('image/png') });
      await refresh();
      setDrawing(false);
      onNotice('Đã lưu tranh làm hình nền.');
    } catch (error) {
      onNotice((error as Error).message);
    }
  };

  const gallery = (items: ArtImage[]) => (
    <div className="gallery-grid">
      {items.map((image) => (
        <article className="gallery-item" key={image.id}>
          <Image
            unoptimized
            src={image.image_url}
            alt={image.title || 'Tranh trong phòng'}
            width={320}
            height={240}
          />
          <div>
            <strong>{image.title || 'Không tên'}</strong>
            <small>
              {image.avatar_url && (
                <Image unoptimized src={image.avatar_url} alt="" width={18} height={18} />
              )}{' '}
              {image.nickname} · {image.likes} lượt thích
            </small>
          </div>
          <div className="vote-actions">
            <button onClick={() => vote(image.id, 1)}>♥ Thích</button>
            <button onClick={() => vote(image.id, -1)}>× Không thích</button>
          </div>
        </article>
      ))}
      {!items.length && <p>Chưa có ảnh nào.</p>}
    </div>
  );

  return (
    <section className="pc-panel" aria-label={`Máy tính số ${stationId}`}>
      <div className="pc-header">
        <div>
          <span className="pc-icon">⌘</span>
          <span>
            <small>NETVERSE / PC DESKTOP</small>
            <strong>
              Máy #{String(stationId).padStart(3, '0')} · còn {formatTime(seconds)}
            </strong>
          </span>
        </div>
        <button onClick={onStand}>ĐỨNG DẬY ×</button>
      </div>
      <nav className="pc-tabs" aria-label="Ứng dụng máy tính">
        {(['desktop', 'browser', 'album', 'top'] as const).map((item) => (
          <button
            key={item}
            className={tab === item ? 'selected' : ''}
            onClick={() => setTab(item)}
          >
            {{ desktop: 'DESKTOP', browser: 'TRÌNH DUYỆT', album: 'ALBUM', top: 'TOP TRANH' }[item]}
          </button>
        ))}
      </nav>
      {tab === 'desktop' && (
        <div
          className="desktop-screen"
          style={
            state.wallpaper_url ? { backgroundImage: `url(${state.wallpaper_url})` } : undefined
          }
        >
          <div className="desktop-icons">
            <button onClick={() => setTab('browser')}>
              <span>◉</span>Trình duyệt
            </button>
            <button onClick={() => setTab('album')}>
              <span>▧</span>Album
            </button>
            <button onClick={() => setTab('top')}>
              <span>★</span>Top tranh
            </button>
          </div>
          <div className="desktop-tools">
            <h2>NETVERSE OS</h2>
            <p>Hình nền này sẽ ở lại máy khi bạn rời ghế.</p>
            <label className="action-button">
              Tải ảnh làm hình nền
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  event.target.files?.[0] && uploadWallpaper(event.target.files[0])
                }
              />
            </label>
            <button onClick={() => setDrawing(true)}>Vẽ hình nền</button>
          </div>
          <div className="desktop-taskbar">
            <strong>NETVERSE</strong>
            <span>
              Máy #{stationId} · còn {formatTime(seconds)}
            </span>
          </div>
        </div>
      )}
      {tab === 'browser' && (
        <div className="browser-view">
          <form onSubmit={navigate}>
            <input
              aria-label="Địa chỉ HTTPS"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button>Đi</button>
          </form>
          <p>
            Chỉ hiển thị trang cho phép nhúng. Một số website hoặc dịch vụ phim có thể chặn iframe.
          </p>
          {state.browser_url && (
            <iframe
              title="Trình duyệt NETVERSE"
              src={state.browser_url}
              sandbox="allow-forms allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      )}
      {tab === 'album' && (
        <div className="album-view">
          <div className="album-upload">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 80))}
              placeholder="Tên bức tranh"
              maxLength={80}
            />
            <label className="action-button">
              Đăng ảnh vào album
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => event.target.files?.[0] && uploadArt(event.target.files[0])}
              />
            </label>
          </div>
          {gallery(images)}
        </div>
      )}
      {tab === 'top' && (
        <div className="album-view">
          <h3>Top 10 tranh của quán</h3>
          {gallery(top)}
        </div>
      )}
      {drawing && (
        <div className="drawing-modal">
          <div>
            <h3>Vẽ hình nền</h3>
            <canvas
              ref={canvas}
              width={960}
              height={540}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                draw(event);
              }}
              onPointerMove={(event) => {
                if (event.buttons) draw(event);
              }}
              onPointerUp={() => {
                painting.current = false;
              }}
            />
            <div>
              <button onClick={() => setDrawing(false)}>Hủy</button>
              <button onClick={saveDrawing}>Lưu lên PC</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
