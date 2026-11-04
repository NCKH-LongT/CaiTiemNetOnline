'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { api, type ArtImage, type PublicProfile } from '@/lib/api';
import { compressDesktopImage } from '@/lib/desktop-image';
import { embeddableUrl } from '@/lib/embed-url';

type State = { wallpaper_url?: string; browser_url?: string };
type Props = {
  stationId: number;
  seconds: number;
  viewerId: string;
  onlinePlayers: { userId?: string }[];
  onAlbumChange: () => void;
  onPrivateChat: (userId: string) => void;
  onStand: () => void;
};
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
export default function PcDesktop({ stationId, seconds, viewerId, onlinePlayers, onAlbumChange, onPrivateChat, onStand }: Props) {
  const [tab, setTab] = useState<'desktop' | 'browser' | 'album' | 'top'>('desktop');
  const [state, setState] = useState<State>({});
  const [images, setImages] = useState<ArtImage[]>([]);
  const [top, setTop] = useState<ArtImage[]>([]);
  const [url, setUrl] = useState('https://www.wikipedia.org');
  const [title, setTitle] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedImage, setSelectedImage] = useState<ArtImage | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileError, setProfileError] = useState('');
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
      .catch(() => setNotice('Không tải được dữ liệu PC.'));
  }, [stationId]);
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
  useEffect(() => {
    if (!profileId) return;
    let active = true;
    api<{ profile: PublicProfile }>(`/api/players/${profileId}`)
      .then((result) => {
        if (active) setProfile(result.profile);
      })
      .catch((error) => {
        if (active) setProfileError((error as Error).message);
      });
    return () => { active = false; };
  }, [profileId]);
  useEffect(() => {
    if (!selectedImage && !profileId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (profileId) setProfileId(null);
      else setSelectedImage(null);
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [selectedImage, profileId]);

  const showProfile = (userId: string) => {
    setProfile(null);
    setProfileError('');
    setProfileId(userId);
  };

  const uploadWallpaper = async (file: File) => {
    try {
      await api(`/api/pc/${stationId}`, {
        wallpaper: await compressDesktopImage(file),
        albumTitle: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Hình nền PC',
      });
      await refresh();
      onAlbumChange();
      setNotice('Đã nén ảnh, lưu hình nền và thêm vào album của máy.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const uploadArt = async (file: File) => {
    try {
      await api('/api/art/upload', { stationId, title, image: await compressDesktopImage(file) });
      setTitle('');
      await refresh();
      onAlbumChange();
      setNotice('Đã nén và đăng ảnh vào album của máy.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const vote = async (id: string, value: number) => {
    try {
      await api('/api/art/vote', { imageId: id, vote: value });
      await refresh();
      if (tab === 'top') setTop((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setNotice((error as Error).message);
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
      setNotice((error as Error).message);
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
      await api(`/api/pc/${stationId}`, {
        wallpaper: canvas.current.toDataURL('image/webp', 0.82),
        albumTitle: 'Tranh vẽ trên PC',
      });
      await refresh();
      setDrawing(false);
      onAlbumChange();
      setNotice('Đã lưu tranh làm hình nền và thêm vào album.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const gallery = (items: ArtImage[]) => (
    <div className="gallery-grid">
      {items.map((image) => (
        <article className="gallery-item" key={image.id}>
          <button className="gallery-zoom" onClick={() => setSelectedImage(image)} aria-label={`Xem ảnh ${image.title || 'Không tên'} ở kích thước lớn`}>
            <Image
              unoptimized
              src={image.image_url}
              alt={image.title || 'Tranh trong phòng'}
              width={320}
              height={240}
            />
            <span>XEM ẢNH ⤢</span>
          </button>
          <div>
            <strong>{image.title || 'Không tên'}</strong>
            <button className="gallery-author" onClick={() => showProfile(image.player_id)} aria-label={`Xem profile của ${image.nickname}`}>
              {image.avatar_url && (
                <Image unoptimized src={image.avatar_url} alt="" width={18} height={18} />
              )}
              <span>{image.nickname}</span>
            </button>
            <small>{image.likes} lượt thích</small>
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
      {notice && (
        <div className="pc-notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Đóng thông báo PC">×</button>
        </div>
      )}
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
            <p>Hình nền sẽ ở lại máy và ảnh tự động xuất hiện trong album PC.</p>
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
            Dán link video YouTube/TikTok để phát trong PC. Báo điện tử chỉ hiện nếu trang cho phép
            nhúng. Nếu màn hình trống hoặc báo chặn, dùng nút Mở ngoài.
          </p>
          {state.browser_url && (
            <a className="browser-external" href={state.browser_url} target="_blank" rel="noopener noreferrer">
              Mở ngoài ↗
            </a>
          )}
          {state.browser_url && (
            <iframe
              title="Trình duyệt NETVERSE"
              src={state.browser_url}
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
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
      {selectedImage && createPortal(
        <div className="art-overlay" onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedImage(null);
        }}>
          <section className="art-lightbox" role="dialog" aria-modal="true" aria-label={`Ảnh ${selectedImage.title || 'Không tên'}`}>
            <button className="art-close" onClick={() => setSelectedImage(null)} aria-label="Đóng ảnh" autoFocus>×</button>
            <div className="art-lightbox-image">
              <Image unoptimized fill sizes="100vw" src={selectedImage.image_url} alt={selectedImage.title || 'Tranh trong phòng'} style={{ objectFit: 'contain' }} />
            </div>
            <div className="art-lightbox-info">
              <div>
                <strong>{selectedImage.title || 'Không tên'}</strong>
                <small>Máy #{String(selectedImage.station_id).padStart(3, '0')} · {selectedImage.likes} lượt thích</small>
              </div>
              <button className="gallery-author" onClick={() => showProfile(selectedImage.player_id)} aria-label={`Xem profile của ${selectedImage.nickname}`}>
                {selectedImage.avatar_url && <Image unoptimized src={selectedImage.avatar_url} alt="" width={26} height={26} />}
                <span>{selectedImage.nickname} ↗</span>
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {profileId && createPortal(
        <div className="art-overlay art-profile-overlay" onClick={(event) => {
          if (event.target === event.currentTarget) setProfileId(null);
        }}>
          <section className="art-profile" role="dialog" aria-modal="true" aria-label="Profile tác giả">
            <button className="art-close" onClick={() => setProfileId(null)} aria-label="Đóng profile" autoFocus>×</button>
            {profile ? (
              <>
                <div className="art-profile-heading">
                  <div className="art-profile-avatar">
                    {profile.avatar_url ? <Image unoptimized src={profile.avatar_url} alt="" width={76} height={76} /> : profile.nickname.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h2>{profile.nickname}</h2>
                    <p>{profile.fullname}</p>
                    {profile.badge && profile.badge !== 'Tân binh' && <span className="art-badge">✦ {profile.badge}</span>}
                  </div>
                </div>
                <div className="art-profile-stats">
                  <span><b>{profile.uploads}</b> tranh hiện có</span>
                  <span><b>{profile.likes}</b> lượt thích</span>
                  <span><b>{Math.floor(profile.online_seconds / 3600)}h {Math.floor(profile.online_seconds % 3600 / 60)}p</b> online</span>
                </div>
                <p className="art-profile-since">Tham gia từ {new Date(profile.created_at).toLocaleDateString('vi-VN')}</p>
                {profile.id === viewerId ? (
                  <p>Đây là profile của bạn.</p>
                ) : onlinePlayers.some((item) => item.userId === profile.id) ? (
                  <button className="art-chat" onClick={() => onPrivateChat(profile.id)}>CHAT RIÊNG ↗</button>
                ) : (
                  <p>Người này đang offline. Chat riêng chỉ mở khi cả hai cùng online.</p>
                )}
              </>
            ) : <p>{profileError || 'Đang tải profile...'}</p>}
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
