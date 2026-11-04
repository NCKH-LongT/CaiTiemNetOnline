'use client';

import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import Link from 'next/link';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from '@/lib/api';
import { compressDesktopImage } from '@/lib/desktop-image';
import { stations } from '@/lib/stations';
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
};
type Level = { level: number; name: string; min_uploads: number; min_likes: number };
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

export default function AdminConsole() {
  const [config, setConfig] = useState<Config | null>(null);
  const [admin, setAdmin] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [notice, setNotice] = useState('');
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
  const captchaBox = useRef<HTMLDivElement>(null);
  const captchaWidget = useRef<string | null>(null);
  useEffect(() => () => {
    if (boardPreview) URL.revokeObjectURL(boardPreview);
  }, [boardPreview]);

  useEffect(() => {
    api<Config>('/api/admin/config')
      .then(setConfig)
      .catch(() => setNotice('API chưa sẵn sàng.'));
    api<{ admin: boolean }>('/api/admin/me')
      .then((result) => setAdmin(result.admin))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!admin) return;
    Promise.all([
      api<{ assets: Asset[] }>('/api/admin/assets'),
      api<{ objects: Object3D[] }>('/api/admin/world'),
      api<{ levels: Level[] }>('/api/admin/levels'),
      api<{ board: Board }>('/api/admin/board'),
    ])
      .then(([assetResult, worldResult, levelResult, boardResult]) => {
        setAssets(assetResult.assets);
        setObjects(worldResult.objects);
        setLevels(levelResult.levels);
        setBoard(boardResult.board);
      })
      .catch((error) => setNotice(error.message));
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
        -16,
        Math.min(
          16,
          Math.round((((event.clientX - bounds.left) / bounds.width) * 34 - 17) * 10) / 10,
        ),
      ),
      z: Math.max(
        -32,
        Math.min(
          32,
          Math.round((((event.clientY - bounds.top) / bounds.height) * 66 - 33) * 10) / 10,
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
            <div className="world-map" ref={map}>
              {stations.map((station) => (
                <span
                  key={station.stationId}
                  className="station-dot"
                  style={{
                    left: `${((station.position[0] + 17) / 34) * 100}%`,
                    top: `${((station.position[2] + 33) / 66) * 100}%`,
                  }}
                  title={`PC ${station.stationId}`}
                />
              ))}
              {objects.map((object) => (
                <button
                  key={object.id}
                  className={`object-dot ${object.published ? 'published' : ''}`}
                  style={{
                    left: `${((object.x + 17) / 34) * 100}%`,
                    top: `${((object.z + 33) / 66) * 100}%`,
                  }}
                  title={object.asset_url}
                  onClick={() => setSelectedObject(object)}
                  onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                  onPointerMove={(event) => {
                    if (!event.buttons) return;
                    const point = mapPosition(event);
                    setObjects((current) =>
                      current.map((item) => (item.id === object.id ? { ...item, ...point } : item)),
                    );
                    setSelectedObject((current) =>
                      current?.id === object.id ? { ...current, ...point } : current,
                    );
                  }}
                  onPointerUp={(event) => {
                    const point = mapPosition(event);
                    updateObject({ ...object, ...point });
                  }}
                />
              ))}
            </div>
            <small>200 máy được hiển thị bằng chấm tím. Vật thể xuất bản màu xanh.</small>
            {selectedObject && (
              <div className="object-controls">
                <h3>Vật thể đã chọn</h3>
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
