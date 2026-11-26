import type { IconName } from '@/components/base/VIcon.vue';

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface PanFileItem {
  id: string;
  name: string;
  pdir_fid: string;
  size: number;
  isDirectory: boolean;
  updatedAt: number;
  formatType?: string;
  thumbnail?: string;
  downloadUrl?: string;
}

export type PanFileTypeFilter = 'all' | 'folder' | 'video' | 'audio' | 'image' | 'other';
export type PanSortField = 'default' | 'name' | 'size' | 'updatedAt';
export type PanSortOrder = 'asc' | 'desc';

export interface FlatDownloadTarget {
  fid: string;
  name: string;
  relativePath: string;
  size?: number;
}

export interface ShareResultData {
  shareUrl: string;
  passcode?: string;
  shareId?: string;
  title?: string;
  warning?: string;
}

/**
 * 根据网盘类型解析默认 Referer
 */
export const getDefaultPanReferer = (panType: string): string | undefined => {
  if (panType === 'quark') return 'https://pan.quark.cn/';
  if (panType === 'uc') return 'https://drive.uc.cn/';
  if (panType === 'baidu') return 'https://pan.baidu.com/';
  if (panType === '123pan') return 'https://yun.123pan.cn/';
  if (panType === 'xunlei') return 'https://pan.xunlei.com/';
  if (panType === '115') return 'https://115.com/';
  if (panType === 'lanzou') return 'https://pc.woozooo.com/';
  if (panType === '139') return 'https://yun.139.com/';
  if (panType === 'guangya') return 'https://www.guangyapan.com/';
  if (panType === 'ilanzou') return 'https://www.ilanzou.com/';
  return undefined;
};

/**
 * 根据网盘文件后缀返回对应图标名
 */
export const getFileIcon = (file: PanFileItem): IconName => {
  if (file.isDirectory) return 'folder';
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts', 'm4v'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return 'music';
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
    return 'image';
  }
  return 'file';
};

export const isMediaFile = (file: PanFileItem): boolean => {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts', 'm4v', 'mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext);
};

export const isVideoFile = (file: PanFileItem): boolean => {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts', 'm4v'].includes(ext);
};

export const classifyPanFileType = (file: PanFileItem): Exclude<PanFileTypeFilter, 'all'> => {
  if (file.isDirectory) return 'folder';
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  return 'other';
};

export interface PanFilterAndSortOptions {
  query?: string;
  typeFilter: PanFileTypeFilter;
  sortBy: PanSortField;
  sortOrder: PanSortOrder;
}

/**
 * 网盘文件类型筛选、关键词过滤与目录置顶排序
 */
export function filterAndSortPanFiles(
  files: PanFileItem[],
  options: PanFilterAndSortOptions
): PanFileItem[] {
  const { query = '', typeFilter, sortBy, sortOrder } = options;
  const trimmedQuery = query.trim().toLowerCase();

  const filtered = files.filter((file) => {
    if (typeFilter !== 'all' && classifyPanFileType(file) !== typeFilter) {
      return false;
    }
    if (trimmedQuery && !file.name.toLowerCase().includes(trimmedQuery)) {
      return false;
    }
    return true;
  });

  if (sortBy === 'default') {
    return filtered;
  }

  const direction = sortOrder === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    // 文件夹始终排在普通文件前，组内按指定字段排序
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }) * direction;
    }
    if (sortBy === 'size') {
      const diff = (a.size || 0) - (b.size || 0);
      if (diff !== 0) return diff * direction;
      return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
    }
    if (sortBy === 'updatedAt') {
      const diff = (a.updatedAt || 0) - (b.updatedAt || 0);
      if (diff !== 0) return diff * direction;
      return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
    }
    return 0;
  });
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
