export type Player = {
  id: string;
  username: string;
  nickname: string;
  fullname: string;
  avatar_url: string | null;
  x: number;
  z: number;
  balance_seconds: number;
  donated_seconds: number;
  online_seconds: number;
};

export type ArtImage = {
  id: string;
  image_url: string;
  title: string;
  station_id: number;
  nickname: string;
  avatar_url: string | null;
  likes: number;
  unlikes?: number;
};

export async function api<T>(path: string, value?: unknown): Promise<T> {
  const response = await fetch(
    path,
    value === undefined
      ? { credentials: 'same-origin' }
      : {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(value),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result as T;
}

export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      reject(new Error('Ảnh phải là PNG/JPEG/WebP và dưới 2 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.readAsDataURL(file);
  });
}
