export interface EditSegment {
  id: string;
  start: number;
  end: number;
}

export const EDIT_DOCK_HEIGHT = 148;

/**
 * 从媒体 URL 中提取真实本地磁盘路径；非本地流返回 null
 */
export const getLocalDiskPath = (rawUrl: string | null): string | null => {
  if (!rawUrl) return null;
  const clean = rawUrl.trim();
  if (clean.startsWith('velora://local/')) {
    return decodeURIComponent(clean.slice('velora://local/'.length));
  }
  if (clean.includes('/stream?path=')) {
    try {
      const u = new URL(clean);
      const p = u.searchParams.get('path');
      if (p) return p;
    } catch {}
  }
  if (/^[a-zA-Z]:[\\/]/.test(clean) || (clean.startsWith('/') && !clean.startsWith('//'))) {
    return clean;
  }
  return null;
};

/**
 * 将秒数格式化为 mm:ss 或 h:mm:ss
 */
export const formatPlayerTime = (secs: number): string => {
  if (isNaN(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};
