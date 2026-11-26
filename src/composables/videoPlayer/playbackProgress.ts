import { db, type PlaybackProgressRecord } from '@/db';

const MAX_RECORDS = 500;
const MIN_DURATION_SEC = 15;
const MIN_POSITION_SEC = 3;
const END_MARGIN_RATIO = 0.95;
const END_MARGIN_SEC = 10;

/**
 * 归一化本地文件路径作为断点续播主键（统一正斜杠并小写，避免盘符大小写差异）
 */
export function normalizePlaybackKey(localPath: string): string {
  return (localPath || '').trim().replace(/\\/g, '/').toLowerCase();
}

/**
 * 判断当前播放进度是否值得持久化（跳过过短视频、片头 3 秒内及临近片尾）
 */
export function shouldPersistProgress(position: number, duration: number): boolean {
  if (!Number.isFinite(position) || !Number.isFinite(duration)) return false;
  if (duration < MIN_DURATION_SEC) return false;
  if (position < MIN_POSITION_SEC) return false;
  if (position / duration >= END_MARGIN_RATIO) return false;
  if (duration - position < END_MARGIN_SEC) return false;
  return true;
}

/**
 * 判断播放进度是否已接近片尾（应自动清除断点记录，下次从头播放）
 */
export function isNearPlaybackEnd(position: number, duration: number): boolean {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return false;
  return position / duration >= END_MARGIN_RATIO || duration - position < END_MARGIN_SEC;
}

export async function getSavedPlaybackProgress(localPath: string): Promise<PlaybackProgressRecord | null> {
  const key = normalizePlaybackKey(localPath);
  if (!key) return null;
  try {
    const rec = await db.playbackProgress.get(key);
    if (!rec) return null;
    if (!shouldPersistProgress(rec.position, rec.duration)) {
      await db.playbackProgress.delete(key).catch(() => {});
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

export async function clearPlaybackProgress(localPath: string): Promise<void> {
  const key = normalizePlaybackKey(localPath);
  if (!key) return;
  try {
    await db.playbackProgress.delete(key);
  } catch {}
}

export async function savePlaybackProgress(
  localPath: string,
  position: number,
  duration: number
): Promise<void> {
  const key = normalizePlaybackKey(localPath);
  if (!key) return;

  if (isNearPlaybackEnd(position, duration)) {
    await clearPlaybackProgress(localPath);
    return;
  }
  if (!shouldPersistProgress(position, duration)) {
    return;
  }

  try {
    await db.playbackProgress.put({
      path: key,
      position: Number(position.toFixed(1)),
      duration: Number(duration.toFixed(1)),
      updatedAt: Date.now()
    });

    // 超出容量上限时按最早更新时间修剪旧记录
    const count = await db.playbackProgress.count();
    if (count > MAX_RECORDS) {
      const overflow = count - MAX_RECORDS;
      const oldest = await db.playbackProgress.orderBy('updatedAt').limit(overflow).primaryKeys();
      if (oldest.length > 0) {
        await db.playbackProgress.bulkDelete(oldest);
      }
    }
  } catch {}
}
