export interface LocalFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  ext: string;
  hasRecentFile?: boolean;
}

export type LocalFileCategory = 'folder' | 'video' | 'audio' | 'image' | 'code' | 'doc' | 'other';

/**
 * 统一规范化本地路径分隔符与大小写（用于路径比较）
 */
export const normalizeLocalPath = (targetPath: string): string => {
  return targetPath.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
};

/**
 * 根据文件扩展名归类本地条目
 */
export const getFileCategory = (item: LocalFileItem): LocalFileCategory => {
  if (item.isDirectory) return 'folder';
  const ext = item.ext.toLowerCase();
  if (['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'm4v', 'ts', 'm3u8'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'opus'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) return 'image';
  if (['js', 'ts', 'vue', 'json', 'html', 'css', 'less', 'scss', 'py', 'go', 'rs', 'c', 'cpp', 'sh', 'bat'].includes(ext)) return 'code';
  if (['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'doc';
  return 'other';
};

/**
 * 格式化时间戳为 YYYY-MM-DD HH:mm
 */
export const formatTime = (ts: number): string => {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * 判断条目是否为近 7 天内新增/修改文件（或目录内含近期文件）
 */
export const isRecentFile = (item: LocalFileItem): boolean => {
  if (!item) return false;
  if (item.isDirectory) {
    return !!item.hasRecentFile;
  }
  if (!item.mtime) return false;
  const diff = Date.now() - item.mtime;
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
};
