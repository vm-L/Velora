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
