import type { DownloadTask } from '@/db';

/**
 * 按任务状态返回列表排序权重
 */
export const getStatusWeight = (status: string): number => {
  switch (status) {
    case 'compressing': return 7;
    case 'converting': return 6;
    case 'processing': return 6;
    case 'downloading': return 5;
    case 'resolving': return 4;
    case 'waiting': return 4;
    case 'paused': return 3;
    case 'error':
    case 'file_removed':
    case 'file_corrupted':
      return 2;
    case 'completed': return 1;
    default: return 0;
  }
};

/**
 * 获取任务状态的中文展示文本
 */
export const getStatusText = (status: string, task?: DownloadTask): string => {
  if (status === 'waiting') {
    return task?.speedText === '等待压缩' ? '等待压缩' : '排队中';
  }
  switch (status) {
    case 'resolving': return '解析中';
    case 'downloading': return '下载中';
    case 'converting': return '格式转换中';
    case 'compressing': return '压缩中';
    case 'processing': return '处理中';
    case 'paused': return '已暂停';
    case 'completed': return '已完成';
    case 'error': return '下载失败';
    case 'file_removed': return '本地文件已移除';
    case 'file_corrupted': return '本地文件已损坏';
    default: return '未知状态';
  }
};

/**
 * 从完整保存路径中提取所在目录路径
 */
export const getDirectory = (savePath: string): string => {
  if (!savePath) return '';
  const lastIndex = Math.max(savePath.lastIndexOf('\\'), savePath.lastIndexOf('/'));
  return lastIndex === -1 ? savePath : savePath.substring(0, lastIndex);
};

/**
 * 将剩余秒数格式化为可读 ETA 文案
 */
export const formatSecondsETA = (seconds: number): string => {
  if (seconds <= 0) return '即将完成';
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return remSec > 0 ? `${minutes}分${remSec}秒` : `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}小时${remMin}分`;
};

/**
 * 根据总大小、已接收字节与瞬时速度计算下载 ETA
 */
export const formatETA = (total: number, received: number, speed: number): string => {
  if (speed === 0 && received > 0) return 'N/A';
  if (!speed || !total) return '计算中';
  const remaining = total - received;
  if (remaining <= 0) return '即将完成';

  const seconds = Math.floor(remaining / speed);
  return formatSecondsETA(seconds);
};

export const isImageTask = (task: Pick<DownloadTask, 'savePath' | 'name'>): boolean => {
  const path = task.savePath || task.name || '';
  const ext = path.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext || '');
};

export const isAudioTask = (task: Pick<DownloadTask, 'savePath' | 'name'>): boolean => {
  const path = task.savePath || task.name || '';
  const ext = path.split('.').pop()?.toLowerCase();
  return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext || '');
};

export const isVideoTask = (task: Pick<DownloadTask, 'savePath' | 'name'>): boolean => {
  const path = task.savePath || task.name || '';
  const ext = path.split('.').pop()?.toLowerCase();
  return ['mp4', 'webm', 'mkv', 'avi', 'mov', 'm3u8', 'ts'].includes(ext || '');
};
