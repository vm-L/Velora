export interface PanDirectoryChangeEvent {
  panType: string;
  dirFids?: string[];
  refreshQuota?: boolean;
}

type PanRefreshListener = (event: PanDirectoryChangeEvent) => void;

const listeners = new Set<PanRefreshListener>();

/**
 * 将不同网盘返回的根目录标识（如空字符串、'/'、'0'）归一化为 '0'
 */
export function normalizePanDirFid(fid?: string): string {
  const trimmed = typeof fid === 'string' ? fid.trim() : '';
  if (!trimmed || trimmed === '/') return '0';
  return trimmed;
}

/**
 * 判断目录变更事件是否命中当前正在浏览的网盘与目录
 */
export function shouldRefreshPanDirectory(
  event: PanDirectoryChangeEvent,
  activePanType: string,
  currentDirFid: string
): boolean {
  if (!event.panType || event.panType !== activePanType) return false;
  if (!event.dirFids || event.dirFids.length === 0) return true;
  const currentNorm = normalizePanDirFid(currentDirFid);
  return event.dirFids.some(f => normalizePanDirFid(f) === currentNorm);
}

/**
 * 通知对应网盘工作区目录数据已发生变化
 */
export function notifyPanDirectoryChanged(event: PanDirectoryChangeEvent): void {
  if (!event.panType) return;
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch {
      // 单订阅者异常不影响其他监听者
    }
  }
}

/**
 * 订阅网盘目录变更事件，返回取消订阅函数
 */
export function onPanDirectoryChanged(listener: PanRefreshListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
