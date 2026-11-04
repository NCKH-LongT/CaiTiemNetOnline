'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { api, type ArtImage, type PublicProfile } from '@/lib/api';
import { compressDesktopImage } from '@/lib/desktop-image';
import { embeddableUrl } from '@/lib/embed-url';
import { formatDuration } from '@/lib/time';

type State = { wallpaper_url?: string; browser_url?: string };
type Shortcut = { id: string; title: string; url: string; player_id: string; nickname: string; likes: number; dislikes: number; my_vote: number | null };
const presetShortcuts = [
  { title: 'YouTube', url: 'https://www.youtube.com/', icon: 'https://www.youtube.com/favicon.ico' },
  { title: 'TikTok', url: 'https://www.tiktok.com/', icon: 'https://www.tiktok.com/favicon.ico' },
  { title: 'VnExpress', url: 'https://vnexpress.net/', icon: 'https://www.google.com/s2/favicons?domain=vnexpress.net&sz=64' },
];
type Props = {
  stationId: number;
  seconds: number;
  viewerId: string;
  onlinePlayers: { userId?: string }[];
  onAlbumChange: () => void;
  onViewChange: (tab: 'desktop' | 'browser' | 'album' | 'top' | 'drawing', preview?: string) => void;
  onPrivateChat: (userId: string) => void;
  onStand: () => void;
};
const formatTime = formatDuration;
export default function PcDesktop({ stationId, seconds, viewerId, onlinePlayers, onAlbumChange, onViewChange, onPrivateChat, onStand }: Props) {
  const [tab, setTab] = useState<'desktop' | 'browser' | 'album' | 'top'>('desktop');
  const [state, setState] = useState<State>({});
  const [images, setImages] = useState<ArtImage[]>([]);
  const [top, setTop] = useState<ArtImage[]>([]);
  const [url, setUrl] = useState('https://www.wikipedia.org');
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [shortcutTitle, setShortcutTitle] = useState('');
  const [shortcutUrl, setShortcutUrl] = useState('');
  const [title, setTitle] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedImage, setSelectedImage] = useState<ArtImage | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  useEffect(() => {
    const view = drawing ? 'drawing' : tab;
    const report = () => {
      let preview: string | undefined;
      if (drawing && canvas.current) {
        const thumbnail = document.createElement('canvas');
        thumbnail.width = 480;
        thumbnail.height = 270;
        thumbnail.getContext('2d')?.drawImage(canvas.current, 0, 0, 480, 270);
        const data = thumbnail.toDataURL('image/webp', 0.5);
        if (data.length < 170_000) preview = data;
      }
      onViewChange(view, preview);
    };
    report();
    const timer = setInterval(report, drawing ? 2000 : 10000);
    return () => clearInterval(timer);
  }, [tab, drawing, onViewChange]);

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
  const refreshShortcuts = () => api<{ shortcuts: Shortcut[] }>('/api/shortcuts')
    .then((result) => setShortcuts(result.shortcuts))
    .catch(() => setNotice('Không tải được shortcut.'));
  useEffect(() => {
    if (tab !== 'browser') return;
    void refreshShortcuts();
    const timer = setInterval(refreshShortcuts, 10000);
    return () => clearInterval(timer);
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
  const openShortcut = async (destination: string) => {
    window.open(destination, '_blank', 'noopener,noreferrer');
    try {
      const embedded = embeddableUrl(destination);
      await api(`/api/pc/${stationId}`, { browserUrl: embedded });
      setState((current) => ({ ...current, browser_url: embedded }));
      setUrl(destination);
    } catch (cause) { setNotice((cause as Error).message); }
  };
  const createShortcut = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api('/api/shortcuts', { title: shortcutTitle, url: shortcutUrl });
      setShortcutTitle('');
      setShortcutUrl('');
      await refreshShortcuts();
    } catch (cause) { setNotice((cause as Error).message); }
  };
  const voteShortcut = async (id: string, vote: number) => {
    try {
      await api('/api/shortcuts/vote', { shortcutId: id, vote });
      await refreshShortcuts();
    } catch (cause) { setNotice((cause as Error).message); }
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
            <strong>Máy PC #{String(image.station_id).padStart(3, '0')}</strong>
            <button className="gallery-author" onClick={() => showProfile(image.player_id)} aria-label={`Xem profile của ${image.nickname}`}>
              {image.avatar_url && (
                <Image unoptimized src={image.avatar_url} alt="" width={18} height={18} />
              )}
              <span>{image.nickname}</span>
            </button>
            {image.player_id !== viewerId && <button className="gallery-chat" onClick={() => onPrivateChat(image.player_id)} disabled={!onlinePlayers.some((item) => item.userId === image.player_id)} aria-label={`Chat với ${image.nickname}`} title={onlinePlayers.some((item) => item.userId === image.player_id) ? 'Chat riêng' : 'Tác giả đang offline'}>✉</button>}
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
          <div className="browser-shortcuts">
            <h3>Truy cập nhanh</h3>
            <div className="shortcut-grid">
              {presetShortcuts.map((shortcut) => <button key={shortcut.title} type="button" onClick={() => openShortcut(shortcut.url)}>
                <Image unoptimized src={shortcut.icon} alt="" width={24} height={24} />{shortcut.title}
              </button>)}
            </div>
            {shortcuts.length > 0 && <><h3>Shortcut cộng đồng</h3><div className="shortcut-list">
              {shortcuts.map((shortcut) => <div className="shortcut-item" key={shortcut.id}>
                <button type="button" onClick={() => openShortcut(shortcut.url)} title={shortcut.url}>
                  <Image unoptimized src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(shortcut.url).hostname)}&sz=64`} alt="" width={22} height={22} />
                  <span>{shortcut.title}<small>#{shortcut.nickname}</small></span>
                </button>
                <button type="button" disabled={shortcut.player_id === viewerId} className={shortcut.my_vote === 1 ? 'selected' : ''} onClick={() => voteShortcut(shortcut.id, 1)} aria-label={`Thích ${shortcut.title}`}>♥ {shortcut.likes}</button>
                <button type="button" disabled={shortcut.player_id === viewerId} className={shortcut.my_vote === -1 ? 'selected' : ''} onClick={() => voteShortcut(shortcut.id, -1)} aria-label={`Không thích ${shortcut.title}`}>× {shortcut.dislikes}</button>
              </div>)}
            </div><small>Shortcut sẽ ẩn khi có ít nhất 5 lượt không thích và số này gấp hơn hai lần lượt thích.</small></>}
            <form onSubmit={createShortcut} className="shortcut-create">
              <input aria-label="Tên shortcut" placeholder="Tên trang" value={shortcutTitle} maxLength={60} onChange={(event) => setShortcutTitle(event.target.value)} required />
              <input aria-label="Địa chỉ shortcut HTTPS" placeholder="https://..." value={shortcutUrl} onChange={(event) => setShortcutUrl(event.target.value)} required />
              <button>+ THÊM</button>
            </form>
          </div>
          <form onSubmit={navigate}>
            <input
              aria-label="Địa chỉ HTTPS"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button>Đi</button>
          </form>
          <p>
            Shortcut mở trang ở tab mới và lưu link vào PC. Video YouTube/TikTok có thể phát trong PC;
            báo điện tử chỉ hiện nếu trang cho phép nhúng. Nếu màn hình trống, dùng nút Mở ngoài.
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
                <strong>Máy PC #{String(selectedImage.station_id).padStart(3, '0')}</strong>
                <small>Máy #{String(selectedImage.station_id).padStart(3, '0')} · {selectedImage.likes} lượt thích</small>
              </div>
              <button className="gallery-author" onClick={() => showProfile(selectedImage.player_id)} aria-label={`Xem profile của ${selectedImage.nickname}`}>
                {selectedImage.avatar_url && <Image unoptimized src={selectedImage.avatar_url} alt="" width={26} height={26} />}
                <span>{selectedImage.nickname} ↗</span>
              </button>
              {selectedImage.player_id !== viewerId && <button className="gallery-chat" onClick={() => onPrivateChat(selectedImage.player_id)} disabled={!onlinePlayers.some((item) => item.userId === selectedImage.player_id)} aria-label={`Chat với ${selectedImage.nickname}`}>✉</button>}
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
                    {profile.badge_url && <Image unoptimized src={profile.badge_url} alt={`Huy hiệu ${profile.badge || ''}`} width={40} height={40} />}
                    {profile.badge && profile.badge !== 'Tân binh' && <span className="art-badge">✦ {profile.badge}</span>}
                  </div>
                </div>
                <div className="art-profile-stats">
                  <span><b>{profile.uploads}</b> tranh hiện có</span>
                  <span><b>{profile.likes}</b> lượt thích</span>
                  <span><b>{formatDuration(profile.online_seconds)}</b> online</span>
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
