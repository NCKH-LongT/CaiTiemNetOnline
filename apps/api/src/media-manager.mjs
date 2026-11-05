import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const dataDir = process.env.DATA_DIR || '/app/data';
const imageName = /^(avatar|wallpaper|art|board|badge|chat)-[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;
const imageTypes = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
let backupRunning = false;

export const driveConfigured = () => Boolean(
  process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
);

async function imageReferences(pool) {
  const result = await pool.query(`
    SELECT avatar_url AS url, 'Ảnh đại diện' AS usage FROM players WHERE avatar_url LIKE '/api/media/%'
    UNION ALL SELECT wallpaper_url, 'Hình nền PC' FROM pc_states WHERE wallpaper_url LIKE '/api/media/%'
    UNION ALL SELECT image_url, 'Tranh' FROM art_images WHERE deleted_at IS NULL
    UNION ALL SELECT background_url, 'Bảng xếp hạng' FROM board_settings WHERE background_url LIKE '/api/media/%'
    UNION ALL SELECT badge_url, 'Huy hiệu' FROM artist_levels WHERE badge_url LIKE '/api/media/%'
    UNION ALL SELECT image_url, 'Ảnh chat' FROM chat_images WHERE deleted_at IS NULL
  `);
  const references = new Map();
  for (const row of result.rows) {
    const filename = path.basename(row.url || '');
    if (!imageName.test(filename) || row.url !== `/api/media/${filename}`) continue;
    const labels = references.get(filename) || new Set();
    labels.add(row.usage);
    references.set(filename, labels);
  }
  return references;
}

export async function imageInventory(pool) {
  const references = await imageReferences(pool);
  const settings = (await pool.query('SELECT folder_id,last_run_at,last_error FROM media_backup_settings WHERE id=1')).rows[0];
  const backups = settings?.folder_id
    ? await pool.query('SELECT filename,drive_file_id,backed_at FROM media_backups WHERE folder_id=$1', [settings.folder_id])
    : { rows: [] };
  const backupMap = new Map(backups.rows.map((row) => [row.filename, row]));
  let entries = [];
  try { entries = await readdir(dataDir, { withFileTypes: true }); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  const images = (await Promise.all(entries
    .filter((entry) => entry.isFile() && imageName.test(entry.name))
    .map(async (entry) => {
      const info = await stat(path.join(dataDir, entry.name));
      const backup = backupMap.get(entry.name);
      return {
        filename: entry.name,
        url: `/api/media/${entry.name}`,
        bytes: info.size,
        createdAt: info.birthtime.toISOString(),
        usage: [...(references.get(entry.name) || [])],
        backedAt: backup?.backed_at || null,
        driveFileId: backup?.drive_file_id || null,
      };
    }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    images,
    totalBytes: images.reduce((total, item) => total + item.bytes, 0),
    orphanCount: images.filter((item) => !item.usage.length).length,
    pendingCount: images.filter((item) => item.usage.length && !item.backedAt).length,
    drive: {
      folderId: settings?.folder_id || '',
      configured: driveConfigured(),
      running: backupRunning,
      lastRunAt: settings?.last_run_at || null,
      lastError: settings?.last_error || null,
    },
  };
}

async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Google OAuth HTTP ${response.status}`);
  const data = await response.json();
  if (!data.access_token) throw new Error('Google OAuth không trả access token');
  return data.access_token;
}

async function uploadToDrive(filename, folderId, token) {
  const file = await readFile(path.join(dataDir, filename));
  const boundary = `netverse_${randomUUID()}`;
  const ext = filename.split('.').at(-1);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: filename, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: ${imageTypes[ext]}\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Google Drive HTTP ${response.status}`);
  const result = await response.json();
  if (!result.id) throw new Error('Google Drive không trả file ID');
  return result.id;
}

export function startImageBackup(pool) {
  if (backupRunning || !driveConfigured()) return false;
  backupRunning = true;
  void (async () => {
    try {
      const settings = (await pool.query('SELECT folder_id FROM media_backup_settings WHERE id=1')).rows[0];
      if (!settings?.folder_id) return;
      const inventory = await imageInventory(pool);
      const pending = inventory.images.filter((item) => item.usage.length && !item.backedAt).slice(0, 10);
      if (!pending.length) {
        await pool.query('UPDATE media_backup_settings SET last_run_at=now(),last_error=NULL WHERE id=1');
        return;
      }
      const token = await accessToken();
      for (const item of pending) {
        const driveFileId = await uploadToDrive(item.filename, settings.folder_id, token);
        await pool.query(`INSERT INTO media_backups (filename,folder_id,drive_file_id) VALUES ($1,$2,$3)
          ON CONFLICT (filename,folder_id) DO UPDATE SET drive_file_id=EXCLUDED.drive_file_id,backed_at=now()`,
        [item.filename, settings.folder_id, driveFileId]);
      }
      await pool.query('UPDATE media_backup_settings SET last_run_at=now(),last_error=NULL WHERE id=1');
    } catch (cause) {
      console.error('Drive image backup:', cause.message);
      await pool.query('UPDATE media_backup_settings SET last_run_at=now(),last_error=$1 WHERE id=1', [String(cause.message).slice(0, 180)]).catch(() => {});
    } finally {
      backupRunning = false;
    }
  })();
  return true;
}

export async function deleteManagedImage(pool, filename) {
  if (!imageName.test(filename)) return false;
  const references = await imageReferences(pool);
  const usage = references.get(filename);
  if (usage?.size && !(usage.size === 1 && usage.has('Ảnh chat'))) return false;
  if (usage?.has('Ảnh chat')) {
    await pool.query('UPDATE chat_images SET deleted_at=now() WHERE image_url=$1 AND deleted_at IS NULL', [`/api/media/${filename}`]);
  }
  try { await unlink(path.join(dataDir, filename)); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  await pool.query('DELETE FROM media_backups WHERE filename=$1', [filename]);
  return true;
}
