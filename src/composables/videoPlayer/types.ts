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
 * 将本地磁盘路径或 velora://local/ 地址统一转换为内置 HTTP 媒体流地址（远程地址原样返回）
 */
export const buildLocalStreamUrl = (
  rawUrl: string,
  port: number,
  token: string,
  sessionKey: number
): string => {
  if (!rawUrl) return '';
  let cleanPath = rawUrl.trim().replace(/\\/g, '/');

  if (/^(http:\/\/|https:\/\/|blob:|data:)/i.test(cleanPath)) {
    return cleanPath;
  }

  if (cleanPath.startsWith('velora://local/')) {
    cleanPath = decodeURIComponent(cleanPath.slice('velora://local/'.length));
  }

  return `http://127.0.0.1:${port}/stream?path=${encodeURIComponent(cleanPath)}&_v=${sessionKey}&token=${encodeURIComponent(token)}`;
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

/**
 * 将秒数格式化为剪辑精确时间码：MM:SS.d 或 HH:MM:SS.d（大于等于 1 小时或强制小时位时显示 HH）
 */
export const formatEditTime = (secs: number, forceHours = false): string => {
  if (typeof secs !== 'number' || isNaN(secs) || secs < 0) secs = 0;
  const totalTenths = Math.round(secs * 10);
  const tenth = totalTenths % 10;
  const totalSec = Math.floor(totalTenths / 10);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (forceHours || h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}.${tenth}`;
  }
  return `${pad(m)}:${pad(s)}.${tenth}`;
};

/**
 * 解析剪辑时间码输入（支持 HH:MM:SS.d / MM:SS.d / 纯秒数）
 */
export const parseEditTime = (raw: string): number | null => {
  const str = String(raw || '').trim();
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) {
    const val = parseFloat(str);
    return isNaN(val) || val < 0 ? null : val;
  }
  const parts = str.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => isNaN(n) || n < 0)) return null;
  if (parts.length === 2) {
    return nums[0] * 60 + nums[1];
  }
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
};

export interface StepModifierSpec {
  step: number;
  label: string;
  modifier: '' | 'Alt' | 'Ctrl' | 'Shift';
}

/**
 * 根据修饰键状态解析当前方向键与步进按钮的统一跨度（本地与局域网桌面端共用标准）
 * 优先级：Shift (60s) > Ctrl/Meta (10s) > Alt (0.1s) > 默认 (1s)
 */
export const resolveStepByModifiers = (e: {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): StepModifierSpec => {
  if (e.shiftKey) return { step: 60, label: '60s', modifier: 'Shift' };
  if (e.ctrlKey || e.metaKey) return { step: 10, label: '10s', modifier: 'Ctrl' };
  if (e.altKey) return { step: 0.1, label: '0.1s', modifier: 'Alt' };
  return { step: 1, label: '1s', modifier: '' };
};
