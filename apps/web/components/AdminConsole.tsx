'use client';

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import Link from 'next/link';
import Image from 'next/image';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from '@/lib/api';
import { compressDesktopImage } from '@/lib/desktop-image';
import { stations, worldBounds } from '@/lib/stations';
import { formatDuration } from '@/lib/time';
import AssetErrorBoundary from './AssetErrorBoundary';

type Asset = { id: string; name: string; asset_url: string; license: string; kind: string };
type Object3D = {
  id: string;
  asset_url: string;
  license: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  published: boolean;
  assetId?: string;
};
type Level = { level: number; name: string; min_uploads: number; min_likes: number; badge_url: string | null };
type Proposal = {
  assetId: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
};
type Config = { sitekey: string | null; configured: boolean; gemini: boolean };
type Board = { background_url: string | null; background_color: string };
type MusicTrack = { id: string; title: string; file_url: string; created_at: string };
type ManagedImage = { filename: string; url: string; bytes: number; createdAt: string; usage: string[]; backedAt: string | null };
type MediaInventory = { images: ManagedImage[]; totalBytes: number; orphanCount: number; pendingCount: number; drive: { folderId: string; configured: boolean; running: boolean; lastRunAt: string | null; lastError: string | null } };
type AdminPlayer = { id: string; username: string; nickname: string; fullname: string; avatar_url: string | null; balance_seconds: number; online_seconds: number; donated_seconds: number; pc_count: number; art_count: number; created_at: string; live: { sessionId: string; seatedAt: number | null; onlineSeconds: number; seatedSeconds: number } | null };
type AdminPc = { stationId: number; wallpaper_url?: string | null; browser_url?: string | null; userId: string | null; nickname: string | null; desktop: { tab: string; browserUrl?: string | null; updatedAt: number } | null };
type AdminArt = { id: string; title: string; image_url: string; nickname: string };
type TurnstileApi = {
  render: (
    target: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void },
  ) => string;
  reset: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function ModelPreview({
  asset,
  scale,
  onSize,
}: {
  asset: Asset;
  scale: number;
  onSize: (size: number) => void;
}) {
  const gltf = useLoader(GLTFLoader, asset.asset_url);
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    onSize(Math.max(size.x, size.y, size.z));
  }, [gltf.scene, onSize]);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.22;
  });
  return (
    <group ref={group} scale={scale}>
      <primitive object={gltf.scene.clone()} />
    </group>
  );
}

function PreviewControls() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(0, 0, 0);
    controls.enableZoom = false;
    controls.update();
    return () => controls.dispose();
  }, [camera, gl]);
  return null;
}

function PlacedModel({ object }: { object: Object3D }) {
  const gltf = useLoader(GLTFLoader, object.asset_url);
  return <group position={[object.x, object.y, object.z]} rotation={[0, object.rotation, 0]} scale={object.scale}>
    <primitive object={gltf.scene.clone()} />
  </group>;
}

function WorldPreview({ objects }: { objects: Object3D[] }) {
  return <div className="admin-world-preview"><Canvas camera={{ position: [worldBounds.halfWidth * .65, worldBounds.halfLength * 1.3, worldBounds.halfLength * 1.35], fov: 48 }}>
    <color attach="background" args={['#171625']} />
    <ambientLight intensity={1.7} />
    <directionalLight position={[12, 30, 10]} intensity={2} />
    <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[worldBounds.halfWidth * 2 + 1.8, worldBounds.halfLength * 2 + 1.8]} /><meshStandardMaterial color="#29263d" /></mesh>
    <gridHelper args={[Math.max(worldBounds.halfWidth, worldBounds.halfLength) * 2, 40, '#5e517c', '#40394f']} position={[0, 0.02, 0]} />
    {stations.map((station) => <mesh key={station.stationId} position={[station.position[0], 0.28, station.position[2]]}>
      <boxGeometry args={[0.5, 0.55, 0.7]} /><meshStandardMaterial color="#8f78d5" />
    </mesh>)}
    <Suspense fallback={null}>{objects.map((object) => <AssetErrorBoundary key={object.id}><PlacedModel object={object} /></AssetErrorBoundary>)}</Suspense>
    <PreviewControls />
  </Canvas></div>;
}

export default function AdminConsole() {
  const [config, setConfig] = useState<Config | null>(null);
  const [admin, setAdmin] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [notice, setNotice] = useState('');
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [musicTitle, setMusicTitle] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [media, setMedia] = useState<MediaInventory | null>(null);
  const [driveFolder, setDriveFolder] = useState('');
  const driveFolderLoaded = useRef(false);
  const [adminPlayers, setAdminPlayers] = useState<AdminPlayer[]>([]);
  const [playerFilter, setPlayerFilter] = useState<'all' | 'online' | 'seated'>('all');
  const [playerSearch, setPlayerSearch] = useState('');
  const [adminPcs, setAdminPcs] = useState<AdminPc[]>([]);
  const [selectedPcId, setSelectedPcId] = useState<number | null>(null);
  const [pcFilter, setPcFilter] = useState<'all' | 'active'>('all');
  const [pcDetail, setPcDetail] = useState<{ images: AdminArt[]; top: AdminArt[]; preview: string | null }>({ images: [], top: [], preview: null });
  const [board, setBoard] = useState<Board>({ background_url: null, background_color: '#231c3c' });
  const [boardFile, setBoardFile] = useState<File | null>(null);
  const [boardPreview, setBoardPreview] = useState<string | null>(null);
  const [removeBoardImage, setRemoveBoardImage] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [objects, setObjects] = useState<Object3D[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedObject, setSelectedObject] = useState<Object3D | null>(null);
  const [assetName, setAssetName] = useState('');
  const [assetLicense, setAssetLicense] = useState('');
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [modelSize, setModelSize] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const map = useRef<HTMLDivElement>(null);
  const dragPosition = useRef<{ x: number; z: number } | null>(null);
  const captchaBox = useRef<HTMLDivElement>(null);
  const captchaWidget = useRef<string | null>(null);
  useEffect(() => () => {
    if (boardPreview) URL.revokeObjectURL(boardPreview);
  }, [boardPreview]);

  useEffect(() => {
    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const loadConfig = () => api<Config>('/api/admin/config')
      .then((result) => {
        if (!active) return;
        setConfig(result);
        setNotice((current) => current === 'Không tải được cấu hình admin. Đang thử lại...' ? '' : current);
      })
      .catch(() => {
        if (!active) return;
        setNotice('Không tải được cấu hình admin. Đang thử lại...');
        retry = setTimeout(loadConfig, 5000);
      });
    void loadConfig();
    api<{ admin: boolean }>('/api/admin/me')
      .then((result) => setAdmin(result.admin))
      .catch(() => {});
    return () => { active = false; if (retry) clearTimeout(retry); };
  }, []);
  useEffect(() => {
    if (!admin) return;
    let active = true;
    const refresh = () => api<MediaInventory>('/api/admin/media')
      .then((result) => {
        if (!active) return;
        setMedia(result);
        if (!driveFolderLoaded.current) {
          setDriveFolder(result.drive.folderId);
          driveFolderLoaded.current = true;
        }
      })
      .catch((error) => { if (active) setNotice(`Không tải được ảnh: ${(error as Error).message}`); });
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [admin]);
  useEffect(() => {
    if (!admin) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const loadAdminData = () => Promise.all([
      api<{ assets: Asset[] }>('/api/admin/assets'),
      api<{ objects: Object3D[] }>('/api/admin/world'),
      api<{ levels: Level[] }>('/api/admin/levels'),
      api<{ board: Board }>('/api/admin/board'),
      api<{ tracks: MusicTrack[] }>('/api/admin/music'),
      api<{ track: { id: string } | null }>('/api/music/current'),
    ])
      .then(([assetResult, worldResult, levelResult, boardResult, musicResult, playingResult]) => {
        if (!active) return;
        setAssets(assetResult.assets);
        setObjects(worldResult.objects);
        setLevels(levelResult.levels);
        setBoard(boardResult.board);
        setMusicTracks(musicResult.tracks);
        setPlayingTrack(playingResult.track?.id || null);
        setNotice((current) => current.startsWith('Không tải được dữ liệu quản trị:') ? '' : current);
      })
      .catch((error) => {
        if (!active) return;
        if ((error as Error).message === 'admin_required') {
          setAdmin(false);
          setNotice('Phiên quản trị đã hết hạn. Hãy đăng nhập lại.');
          return;
        }
        setNotice(`Không tải được dữ liệu quản trị: ${(error as Error).message}`);
        retry = setTimeout(loadAdminData, 5000);
      });
    void loadAdminData();
    return () => { active = false; if (retry) clearTimeout(retry); };
  }, [admin]);
  useEffect(() => {
    if (!admin || !selectedPcId) return;
    let active = true;
    const refresh = () => api<{ images: AdminArt[]; top: AdminArt[]; preview: string | null }>(`/api/admin/pc/${selectedPcId}`)
      .then((result) => { if (active) setPcDetail(result); })
      .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [admin, selectedPcId]);
  useEffect(() => {
    if (!admin) return;
    const refresh = () => api<{ players: AdminPlayer[]; pcs: AdminPc[] }>('/api/admin/overview')
      .then((result) => {
        setAdminPlayers(result.players);
        setAdminPcs(result.pcs);
        setNotice((current) => current.startsWith('Không tải được trạng thái phòng máy:') ? '' : current);
      })
      .catch((error) => setNotice(`Không tải được trạng thái phòng máy: ${(error as Error).message}`));
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [admin]);
  useEffect(() => {
    if (admin || !config?.sitekey || !captchaBox.current) return;
    const render = () => {
      if (window.turnstile && captchaBox.current && !captchaWidget.current)
        captchaWidget.current = window.turnstile.render(captchaBox.current, {
          sitekey: config.sitekey!,
          callback: setCaptcha,
        });
    };
    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
    return () => {
      script.onload = null;
    };
  }, [admin, config]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api('/api/admin/login', { username, password, turnstileToken: captcha });
      setAdmin(true);
      setNotice('Đã đăng nhập admin.');
    } catch (error) {
      setNotice((error as Error).message);
      setCaptcha('');
      window.turnstile?.reset(captchaWidget.current || undefined);
    }
  };
  const uploadMusic = async (event: React.FormEvent) => {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    try {
      let audio: string | undefined;
      if (musicFile) {
        if (musicFile.size > 8_000_000 || !musicFile.name.toLowerCase().endsWith('.mp3')) throw new Error('MP3 phải nhỏ hơn 8 MB.');
        audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;base64,/, 'data:audio/mpeg;base64,'));
          reader.onerror = () => reject(new Error('Không đọc được MP3.'));
          reader.readAsDataURL(musicFile);
        });
      }
      const result = await api<{ track: MusicTrack }>('/api/admin/music', { title: musicTitle, audioUrl: musicUrl || undefined, audio });
      setMusicTracks((current) => [result.track, ...current]);
      setPlayingTrack(result.track.id);
      setMusicTitle('');
      setMusicUrl('');
      setMusicFile(null);
      formElement.reset();
      setNotice('Đã thêm và phát nhạc cho cộng đồng.');
    } catch (error) {
      const message = (error as Error).message;
      setNotice(message === 'invalid_audio_url' ? 'Hãy dùng URL HTTPS dẫn trực tiếp tới âm thanh; link trang YouTube/Spotify không phát ẩn được.' : message);
    }
  };
  const playMusic = async (trackId: string | null) => {
    try {
      await api('/api/admin/music/play', { trackId });
      setPlayingTrack(trackId);
      setNotice(trackId ? 'Đang phát nhạc cho cộng đồng.' : 'Đã dừng nhạc chung.');
    } catch (error) { setNotice((error as Error).message); }
  };
  const deleteMusic = async (track: MusicTrack) => {
    try {
      await api(`/api/admin/music/${track.id}`, {});
      setMusicTracks((current) => current.filter((item) => item.id !== track.id));
      if (playingTrack === track.id) setPlayingTrack(null);
      setNotice('Đã xóa bài nhạc.');
    } catch (error) { setNotice((error as Error).message); }
  };
  const refreshMedia = async () => setMedia(await api<MediaInventory>('/api/admin/media'));
  const saveDriveFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api('/api/admin/media/drive', { folderId: driveFolder });
      await refreshMedia();
      setNotice('Đã lưu thư mục Drive.');
    } catch (error) { setNotice((error as Error).message); }
  };
  const backupImages = async () => {
    try {
      await api('/api/admin/media/backup', {});
      await refreshMedia();
      setNotice('Đã bắt đầu sao lưu ảnh lên Google Drive.');
    } catch (error) { setNotice((error as Error).message); }
  };
  const deleteImage = async (image: ManagedImage) => {
    if (!window.confirm(`Xóa ${image.filename} khỏi server? Ảnh chat đã gửi sẽ không còn hiển thị.`)) return;
    try {
      await api(`/api/admin/media/${image.filename}`, {});
      await refreshMedia();
      setNotice('Đã xóa ảnh khỏi server.');
    } catch (error) { setNotice((error as Error).message); }
  };
  const uploadAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assetFile) return;
    try {
      if (assetFile.size > 10_000_000) throw new Error('File vượt quá 10 MB.');
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Không đọc được file.'));
        reader.readAsDataURL(assetFile);
      });
      const kind = assetFile.name.toLowerCase().endsWith('.glb')
        ? 'glb'
        : assetFile.name.toLowerCase().endsWith('.gltf')
          ? 'gltf'
          : '';
      if (!kind) throw new Error('Chỉ hỗ trợ GLB hoặc GLTF.');
      const result = await api<{ asset: Asset }>('/api/admin/assets', {
        name: assetName || assetFile.name,
        license: assetLicense,
        kind,
        content,
      });
      setAssets((current) => [result.asset, ...current]);
      setSelectedAsset(result.asset);
      setAssetFile(null);
      setAssetName('');
      setAssetLicense('');
      setNotice('Đã tải asset. Hãy xem trước và cân chỉnh kích thước.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const addObject = async (
    item:
      | Proposal
      | { assetId: string; x: number; y: number; z: number; rotation: number; scale: number },
  ) => {
    try {
      const result = await api<{ object: Object3D }>('/api/admin/world', item);
      setObjects((current) => [...current, result.object]);
      setSelectedObject(result.object);
      setNotice('Đã thêm vật thể vào bản nháp.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const deleteAsset = async (asset: Asset) => {
    try {
      await api(`/api/admin/assets/${asset.id}`, {});
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setSelectedAsset(null);
      setNotice('Đã xóa asset chưa sử dụng.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const updateObject = async (object: Object3D) => {
    try {
      const result = await api<{ object: Object3D }>(`/api/admin/world/${object.id}`, object);
      setObjects((current) =>
        current.map((item) => (item.id === object.id ? result.object : item)),
      );
      setSelectedObject(result.object);
      setNotice('Đã lưu vị trí vật thể.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const deleteObject = async (object: Object3D) => {
    try {
      await api(`/api/admin/world/${object.id}`, { delete: true });
      setObjects((current) => current.filter((item) => item.id !== object.id));
      setSelectedObject(null);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const arrange = async () => {
    try {
      const result = await api<{ proposal: Proposal[] }>('/api/admin/arrange', { prompt });
      setProposals(result.proposal);
      setNotice('Gemini đã đề xuất bố cục. Hãy duyệt từng vật thể.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const mapPosition = (event: React.PointerEvent<HTMLElement>) => {
    const bounds = map.current!.getBoundingClientRect();
    return {
      x: Math.max(
        -worldBounds.halfWidth,
        Math.min(
          worldBounds.halfWidth,
          Math.round((((event.clientX - bounds.left) / bounds.width) * (worldBounds.halfWidth * 2 + 1.8) - (worldBounds.halfWidth + .9)) * 10) / 10,
        ),
      ),
      z: Math.max(
        -worldBounds.halfLength,
        Math.min(
          worldBounds.halfLength,
          Math.round((((event.clientY - bounds.top) / bounds.height) * (worldBounds.halfLength * 2 + 1.8) - (worldBounds.halfLength + .9)) * 10) / 10,
        ),
      ),
    };
  };
  const saveLevels = async () => {
    try {
      await api('/api/admin/levels', { levels });
      setNotice('Đã lưu cấu hình cấp nghệ sĩ.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const uploadBadge = async (level: number, file: File) => {
    const kind = file.name.toLowerCase().endsWith('.gif') ? 'gif' : file.name.toLowerCase().endsWith('.png') ? 'png' : null;
    if (!kind || file.size > 2_000_000) {
      setNotice('Huy hiệu phải là PNG/GIF dưới 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const image = String(reader.result).replace(/^data:[^;]*;base64,/, `data:image/${kind};base64,`);
        const result = await api<{ badgeUrl: string }>('/api/admin/levels/badge', { image });
        setLevels((current) => current.map((item) => item.level === level ? { ...item, badge_url: result.badgeUrl } : item));
        setNotice('Đã tải huy hiệu. Nhấn LƯU CẤP BẬC để áp dụng.');
      } catch (cause) { setNotice((cause as Error).message); }
    };
    reader.readAsDataURL(file);
  };
  const saveBoard = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const result = await api<{ board: Board }>('/api/admin/board', {
        backgroundColor: board.background_color,
        image: boardFile ? await compressDesktopImage(boardFile) : null,
        removeImage: removeBoardImage && !boardFile,
      });
      setBoard(result.board);
      setBoardFile(null);
      setBoardPreview(null);
      setRemoveBoardImage(false);
      setNotice('Đã cập nhật nền bảng vàng.');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const selectedPc = adminPcs.find((item) => item.stationId === selectedPcId);

  return (
    <main className="admin-shell">
      <header>
        <Link href="/">← NETVERSE</Link>
        <h1>World Admin</h1>
        {admin && (
          <button
            onClick={() =>
              api('/api/admin/logout', {}).then(() => {
                captchaWidget.current = null;
                setAdmin(false);
              })
            }
          >
            Đăng xuất
          </button>
        )}
      </header>
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      {!config ? (
        <p>Đang tải...</p>
      ) : !config.configured ? (
        <section className="admin-card">
          <h2>Chưa cấu hình admin</h2>
          <p>
            Thiết lập ADMIN_USERNAME, ADMIN_PASSWORD và cặp TURNSTILE_SITEKEY / TURNSTILE_SECRET_KEY
            trong `.env`, rồi khởi động lại API.
          </p>
        </section>
      ) : !admin ? (
        <form className="admin-card admin-login" onSubmit={login}>
          <h2>Đăng nhập quản trị</h2>
          <label>
            Tài khoản
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <div ref={captchaBox} />
          <button disabled={!captcha}>Đăng nhập</button>
        </form>
      ) : (
        <div className="admin-grid">
          <section className="admin-card admin-media">
            <h2>Quản lý ảnh và dung lượng</h2>
            {media ? <>
              <p>{media.images.length} ảnh · {(media.totalBytes / 1024 / 1024).toFixed(2)} MB · {media.orphanCount} ảnh không còn sử dụng · {media.pendingCount} ảnh chưa sao lưu vào thư mục hiện tại</p>
              <form className="admin-drive-form" onSubmit={saveDriveFolder}>
                <label htmlFor="drive-folder">ID thư mục Google Drive để sao lưu</label>
                <input id="drive-folder" value={driveFolder} onChange={(event) => setDriveFolder(event.target.value)} placeholder="ID trong đường dẫn drive.google.com/drive/folders/..." />
                <button type="submit">LƯU THƯ MỤC</button>
                <button type="button" onClick={backupImages} disabled={!media.drive.configured || !media.drive.folderId || media.drive.running}>SAO LƯU NGAY</button>
              </form>
              {!media.drive.configured && <p>Để bật sao lưu, cấu hình GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET và GOOGLE_DRIVE_REFRESH_TOKEN trên máy API. Sau đó nhập ID thư mục Drive ở đây.</p>}
              {media.drive.running && <p>Đang sao lưu tối đa 10 ảnh mỗi lượt...</p>}
              {media.drive.lastError && <p role="alert">Lỗi sao lưu: {media.drive.lastError}</p>}
              {media.drive.lastRunAt && <small>Lần chạy gần nhất: {new Date(media.drive.lastRunAt).toLocaleString('vi-VN')}</small>}
              <div className="admin-image-list">
                {media.images.map((image) => <div key={image.filename} className="admin-image-row">
                  {image.usage.length ? <Image unoptimized src={image.url} alt="" width={54} height={54} /> : <span className="admin-image-orphan">Ảnh cũ</span>}
                  <span><strong>{image.usage.join(', ') || 'Không còn sử dụng'}</strong><small>{image.filename} · {(image.bytes / 1024).toFixed(1)} KB · {new Date(image.createdAt).toLocaleDateString('vi-VN')}</small></span>
                  <small>{image.backedAt ? 'Đã sao lưu' : 'Chưa sao lưu'}</small>
                  {(!image.usage.length || (image.usage.length === 1 && image.usage[0] === 'Ảnh chat')) && <button type="button" onClick={() => deleteImage(image)}>XÓA</button>}
                </div>)}
              </div>
            </> : <p>Đang tải danh sách ảnh...</p>}
          </section>
          <section className="admin-card admin-overview">
            <h2>Người chơi ({adminPlayers.length})</h2>
            <p>{adminPlayers.filter((item) => item.live).length} người online · nhấn người chơi đang sử dụng PC để xem desktop.</p>
            <div className="admin-player-filters">
              <input aria-label="Tìm theo nickname" placeholder="Tìm nickname" value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} />
              <select aria-label="Lọc người chơi" value={playerFilter} onChange={(event) => setPlayerFilter(event.target.value as 'all' | 'online' | 'seated')}>
                <option value="all">Tất cả</option><option value="online">Đang online</option><option value="seated">Đang ở PC</option>
              </select>
            </div>
            <div className="admin-player-list">
              {adminPlayers.filter((item) => item.nickname.toLocaleLowerCase().includes(playerSearch.trim().toLocaleLowerCase()) &&
                (playerFilter === 'all' || (playerFilter === 'online' && item.live) || (playerFilter === 'seated' && item.live?.seatedAt))).map((item) => <button key={item.id} type="button" onClick={() => setSelectedPcId(item.live?.seatedAt || null)}>
                {item.avatar_url ? <Image unoptimized src={item.avatar_url} alt="" width={32} height={32} /> : <span className="admin-avatar">{item.nickname[0]}</span>}
                <span><strong>{item.nickname}</strong><small>@{item.username} · {item.fullname}</small></span>
                <span className={item.live ? 'admin-online' : ''}>{item.live ? item.live.seatedAt ? `Đang dùng PC #${item.live.seatedAt}` : 'Online' : 'Offline'}</span>
                <small>Online {formatDuration(item.live?.onlineSeconds ?? item.online_seconds)} · Ngồi PC {formatDuration(item.live?.seatedSeconds ?? 0)} · Còn {formatDuration(item.balance_seconds)} · {item.pc_count} PC · {item.art_count} tranh</small>
              </button>)}
            </div>
          </section>
          <section className="admin-card admin-overview">
            <h2>Phòng máy ({adminPcs.filter((item) => item.userId).length}/{stations.length} hoạt động)</h2>
            <div className="pc-filters"><button className={pcFilter === 'all' ? 'selected' : ''} onClick={() => setPcFilter('all')}>TẤT CẢ</button><button className={pcFilter === 'active' ? 'selected' : ''} onClick={() => setPcFilter('active')}>ĐANG DÙNG</button></div>
            <div className="admin-pc-grid">
              {adminPcs.filter((item) => pcFilter === 'all' || item.userId).map((item) => <button key={item.stationId} className={`${item.userId ? 'active' : ''} ${selectedPcId === item.stationId ? 'selected' : ''}`} onClick={() => setSelectedPcId(item.stationId)} title={item.nickname || 'Máy trống'}>#{item.stationId}<small>{item.nickname || 'Trống'}</small></button>)}
            </div>
            {selectedPc && <div className="admin-desktop-view">
              <h3>Desktop PC #{selectedPc.stationId} · {selectedPc.nickname || 'Không có người sử dụng'}</h3>
              <p>Ứng dụng hiện tại: <b>{({ desktop: 'Desktop', browser: 'Trình duyệt', album: 'Album', top: 'Top tranh', drawing: 'Đang vẽ' } as Record<string, string>)[selectedPc.desktop?.tab || 'desktop']}</b></p>
              <div className="admin-desktop-screen" style={selectedPc.wallpaper_url ? { backgroundImage: `url(${selectedPc.wallpaper_url})` } : undefined}>
                <strong>NETVERSE OS</strong>
                {selectedPc.desktop?.tab === 'browser' && (selectedPc.desktop.browserUrl
                  ? <iframe title={`Trình duyệt PC ${selectedPc.stationId}`} src={selectedPc.desktop.browserUrl} sandbox="allow-forms allow-scripts allow-same-origin allow-popups" referrerPolicy="strict-origin-when-cross-origin" />
                  : <span>Trình duyệt đang ở tab mới.</span>)}
                {selectedPc.desktop?.tab === 'drawing' && (pcDetail.preview ? <Image unoptimized className="admin-drawing-preview" src={pcDetail.preview} alt="Nét vẽ đang thực hiện" width={480} height={270} /> : <span>Đang chờ nét vẽ...</span>)}
                {['album', 'top'].includes(selectedPc.desktop?.tab || '') && <div className="admin-desktop-gallery">
                  {(selectedPc.desktop?.tab === 'top' ? pcDetail.top : pcDetail.images).map((image) => <figure key={image.id}>
                    <Image unoptimized src={image.image_url} alt={image.title} width={92} height={70} />
                    <figcaption>{image.title || 'Không tên'} · {image.nickname}</figcaption>
                  </figure>)}
                  {!(selectedPc.desktop?.tab === 'top' ? pcDetail.top : pcDetail.images).length && <span>Chưa có tranh.</span>}
                </div>}
              </div>
              {selectedPc.browser_url && <a href={selectedPc.browser_url} target="_blank" rel="noopener noreferrer">Trang đang mở ↗</a>}
              <small>Trạng thái ứng dụng cập nhật từ PC đang online; hình nền và URL lấy từ dữ liệu đã lưu.</small>
            </div>}
          </section>
          <section className="admin-card admin-music">
            <h2>Nhạc cộng đồng</h2>
            <p>Tải MP3 hoặc dán URL âm thanh HTTPS trực tiếp (MP3, OGG, luồng radio tương thích trình duyệt). Link trang YouTube/Spotify không phát ẩn được.</p>
            <form onSubmit={uploadMusic}>
              <input value={musicTitle} onChange={(event) => setMusicTitle(event.target.value)} placeholder="Tên bài nhạc" required maxLength={100} aria-label="Tên bài nhạc" />
              <input type="url" value={musicUrl} onChange={(event) => setMusicUrl(event.target.value)} placeholder="https://example.com/music.mp3" required={!musicFile} aria-label="URL âm thanh trực tiếp" />
              <input type="file" accept="audio/mpeg,.mp3" onChange={(event) => setMusicFile(event.target.files?.[0] || null)} aria-label="Tải MP3" />
              <button type="submit">THÊM NHẠC</button>
            </form>
            <div className="admin-music-list">
              {musicTracks.map((track) => <div key={track.id}>
                <strong>{track.title}</strong>
                <button onClick={() => playMusic(track.id)} disabled={playingTrack === track.id || /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(track.file_url)}>{/^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(track.file_url) ? 'CẦN THAY LINK' : playingTrack === track.id ? 'ĐANG PHÁT' : 'PHÁT'}</button>
                <button onClick={() => deleteMusic(track)}>XÓA</button>
              </div>)}
              {!musicTracks.length && <p>Chưa tải bài nhạc nào.</p>}
            </div>
            <button onClick={() => playMusic(null)} disabled={!playingTrack}>DỪNG NHẠC</button>
          </section>
          <section className="admin-card">
            <h2>Nền bảng vàng</h2>
            <p>Chọn màu và ảnh nền cho bảng vàng trong quán. Ảnh được nén trước khi tải lên.</p>
            <div className="board-preview" style={{ backgroundColor: board.background_color, backgroundImage: boardPreview ? `url(${boardPreview})` : board.background_url && !removeBoardImage ? `url(${board.background_url})` : undefined }}>
              NETVERSE · BẢNG VÀNG
            </div>
            <form onSubmit={saveBoard}>
              <label>
                Màu nền
                <input type="color" value={board.background_color} onChange={(event) => setBoard((current) => ({ ...current, background_color: event.target.value }))} />
              </label>
              <label>
                Ảnh nền (PNG, JPEG, WebP)
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setBoardFile(file); setBoardPreview(file ? URL.createObjectURL(file) : null); setRemoveBoardImage(false); }} />
              </label>
              {board.background_url && <button type="button" onClick={() => { setBoardFile(null); setBoardPreview(null); setRemoveBoardImage(true); }}>XÓA ẢNH NỀN</button>}
              <button>LƯU NỀN BẢNG VÀNG</button>
            </form>
          </section>
          <section className="admin-card">
            <h2>1. Tải asset lên</h2>
            <p>Chọn GLB hoặc GLTF tự chứa dữ liệu, kèm thông tin giấy phép sử dụng.</p>
            <form onSubmit={uploadAsset}>
              <input
                placeholder="Tên mô hình"
                value={assetName}
                onChange={(event) => setAssetName(event.target.value)}
                required
              />
              <input
                placeholder="Giấy phép / nguồn"
                value={assetLicense}
                onChange={(event) => setAssetLicense(event.target.value)}
                required
              />
              <input
                type="file"
                accept=".glb,.gltf"
                onChange={(event) => setAssetFile(event.target.files?.[0] || null)}
                required
              />
              <button>TẢI LÊN</button>
            </form>
            <div className="asset-list">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  className={selectedAsset?.id === asset.id ? 'selected' : ''}
                  onClick={() => {
                    setSelectedAsset(asset);
                    setPreviewScale(1);
                    setModelSize(0);
                  }}
                >
                  {asset.name}{' '}
                  <small>
                    {asset.kind.toUpperCase()} · {asset.license}
                  </small>
                </button>
              ))}
            </div>
          </section>
          <section className="admin-card">
            <h2>2. Xem trước và cân chỉnh</h2>
            {selectedAsset ? (
              <>
                <div className="model-preview">
                  <Canvas camera={{ position: [3, 2.2, 4], fov: 45 }}>
                    <ambientLight intensity={2} />
                    <directionalLight position={[4, 6, 3]} intensity={2} />
                    <gridHelper args={[10, 10]} />
                    <AssetErrorBoundary key={selectedAsset.id}>
                      <Suspense fallback={null}>
                        <ModelPreview
                          asset={selectedAsset}
                          scale={previewScale}
                          onSize={setModelSize}
                        />
                      </Suspense>
                    </AssetErrorBoundary>
                  </Canvas>
                </div>
                <p>
                  Kích thước gốc lớn nhất: {modelSize.toFixed(2)} đơn vị. Tỉ lệ gợi ý cho vật thể
                  cao 2m: {modelSize ? (2 / modelSize).toFixed(2) : '—'}
                </p>
                <label>
                  Tỉ lệ trong game
                  <input
                    type="number"
                    min="0.05"
                    max="10"
                    step="0.05"
                    value={previewScale}
                    onChange={(event) => setPreviewScale(Number(event.target.value))}
                  />
                </label>
                <button
                  onClick={() =>
                    setPreviewScale(modelSize ? Math.max(0.05, Math.min(10, 2 / modelSize)) : 1)
                  }
                >
                  CÂN KÍCH THƯỚC 2M
                </button>
                <button
                  onClick={() =>
                    addObject({
                      assetId: selectedAsset.id,
                      x: 0,
                      y: 0,
                      z: 25,
                      rotation: 0,
                      scale: previewScale,
                    })
                  }
                >
                  THÊM VÀO BẢN NHÁP
                </button>
                <button onClick={() => deleteAsset(selectedAsset)}>XÓA ASSET</button>
              </>
            ) : (
              <p>Chọn một asset để xem trước.</p>
            )}
          </section>
          <section className="admin-card admin-editor">
            <h2>3. Xây thế giới</h2>
            <p>
              Kéo các chấm tròn để đổi vị trí. Chọn vật thể bên dưới để chỉnh tỉ lệ, góc xoay và
              xuất bản.
            </p>
            <WorldPreview objects={objects} />
            <div className="world-map" ref={map}>
              {stations.map((station) => (
                <span
                  key={station.stationId}
                  className="station-dot"
                  style={{
                    left: `${((station.position[0] + worldBounds.halfWidth + .9) / (worldBounds.halfWidth * 2 + 1.8)) * 100}%`,
                    top: `${((station.position[2] + worldBounds.halfLength + .9) / (worldBounds.halfLength * 2 + 1.8)) * 100}%`,
                  }}
                  title={`PC ${station.stationId}`}
                />
              ))}
              {objects.map((object) => (
                <button
                  key={object.id}
                  className={`object-dot ${object.published ? 'published' : ''}`}
                  style={{
                    left: `${((object.x + worldBounds.halfWidth + .9) / (worldBounds.halfWidth * 2 + 1.8)) * 100}%`,
                    top: `${((object.z + worldBounds.halfLength + .9) / (worldBounds.halfLength * 2 + 1.8)) * 100}%`,
                  }}
                  title={object.asset_url}
                  onClick={() => setSelectedObject(object)}
                  onPointerDown={(event) => { dragPosition.current = { x: object.x, z: object.z }; event.currentTarget.setPointerCapture(event.pointerId); }}
                  onPointerMove={(event) => {
                    if (!event.buttons) return;
                    const point = mapPosition(event);
                    dragPosition.current = point;
                    setObjects((current) =>
                      current.map((item) => (item.id === object.id ? { ...item, ...point } : item)),
                    );
                    setSelectedObject((current) =>
                      current?.id === object.id ? { ...current, ...point } : current,
                    );
                  }}
                  onPointerUp={(event) => {
                    const point = dragPosition.current || mapPosition(event);
                    dragPosition.current = null;
                    updateObject({ ...object, ...point });
                  }}
                />
              ))}
            </div>
            <small>{stations.length} máy được hiển thị bằng chấm tím. Vật thể xuất bản màu xanh.</small>
            {selectedObject && (
              <div className="object-controls">
                <h3>Vật thể đã chọn</h3>
                <label className="object-asset-select">Mô hình
                  <select value={selectedObject.assetId || assets.find((asset) => asset.asset_url === selectedObject.asset_url)?.id || ''} onChange={(event) => setSelectedObject((current) => current ? { ...current, assetId: event.target.value } : current)}>
                    {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                  </select>
                </label>
                {(['x', 'y', 'z', 'rotation', 'scale'] as const).map((field) => (
                  <label key={field}>
                    {field}
                    <input
                      type="number"
                      step={field === 'scale' ? 0.05 : 0.1}
                      value={selectedObject[field]}
                      onChange={(event) =>
                        setSelectedObject((current) =>
                          current ? { ...current, [field]: Number(event.target.value) } : current,
                        )
                      }
                    />
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={selectedObject.published}
                    onChange={(event) =>
                      setSelectedObject((current) =>
                        current ? { ...current, published: event.target.checked } : current,
                      )
                    }
                  />{' '}
                  Xuất bản
                </label>
                <button onClick={() => updateObject(selectedObject)}>LƯU</button>
                <button onClick={() => deleteObject(selectedObject)}>XÓA</button>
              </div>
            )}
          </section>
          <section className="admin-card">
            <h2>4. Sắp xếp bằng Gemini</h2>
            <p>Gemini chỉ tạo gợi ý. Mỗi vật thể cần được bạn duyệt trước khi xuất bản.</p>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ví dụ: thêm cây và ghế chờ ở sân ngoài..."
            />
            <button disabled={!config.gemini || !prompt.trim()} onClick={arrange}>
              TẠO GỢI Ý
            </button>
            {!config.gemini && <small>Thêm GEMINI_API_KEY để bật tính năng này.</small>}
            <div className="proposal-list">
              {proposals.map((item, index) => (
                <p key={index}>
                  {assets.find((asset) => asset.id === item.assetId)?.name || item.assetId} · x{' '}
                  {item.x}, z {item.z}, tỉ lệ {item.scale}{' '}
                  <button
                    onClick={() => {
                      addObject(item);
                      setProposals((current) => current.filter((_, i) => i !== index));
                    }}
                  >
                    DUYỆT
                  </button>
                </p>
              ))}
            </div>
          </section>
          <section className="admin-card">
            <h2>Cấp nghệ sĩ</h2>
            <p>
              Đề xuất mặc định: Tân binh 0/0, Tập sự 3/10, Nghệ sĩ 10/50, Danh họa 25/200, Huyền
              thoại 50/500 (ảnh đăng/lượt thích).
            </p>
            <div className="level-list">
              {levels.map((item, index) => (
                <div key={item.level}>
                  <b>{item.level}</b>
                  {item.badge_url && <Image unoptimized src={item.badge_url} alt={`Huy hiệu ${item.name}`} width={38} height={38} />}
                  <label className="admin-badge-upload">TẢI HUY HIỆU<input type="file" accept="image/png,image/gif" onChange={(event) => event.target.files?.[0] && uploadBadge(item.level, event.target.files[0])} /></label>
                  {item.badge_url && <button type="button" onClick={() => setLevels((current) => current.map((row) => row.level === item.level ? { ...row, badge_url: null } : row))}>XÓA</button>}
                  <input
                    value={item.name}
                    onChange={(event) =>
                      setLevels((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, name: event.target.value } : row,
                        ),
                      )
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    value={item.min_uploads}
                    onChange={(event) =>
                      setLevels((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, min_uploads: Number(event.target.value) } : row,
                        ),
                      )
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    value={item.min_likes}
                    onChange={(event) =>
                      setLevels((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, min_likes: Number(event.target.value) } : row,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <button onClick={saveLevels}>LƯU CẤP BẬC</button>
          </section>
        </div>
      )}
    </main>
  );
}
