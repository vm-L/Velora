import { logger } from '@/services/logger';

export type ResourceGroupType = 'local' | 'cms' | 'ext';

/**
 * 为外部资源 URL 补全默认 HTTPS 协议前缀
 */
export const formatUrlPrefix = (val: string): string => {
  const trimmed = (val || '').trim();
  if (!trimmed || trimmed === 'https://' || trimmed === 'http://') return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  return `https://${trimmed}`;
};

/**
 * 生成短随机资源 ID
 */
export const generateResourceId = (): string => Math.random().toString(36).substr(2, 9);

/**
 * 按拖拽源索引与目标索引返回重排后的新数组（不直接修改原数组）
 */
export const reorderList = <T>(items: T[], sourceIndex: number, targetIndex: number): T[] => {
  const next = [...items];
  const [movedItem] = next.splice(sourceIndex, 1);
  if (movedItem === undefined) return next;
  next.splice(targetIndex, 0, movedItem);
  return next;
};

/**
 * 设置资源行拖拽负载与预览图
 */
export const startRowDrag = (e: DragEvent, type: ResourceGroupType, index: number): void => {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({ type, index }));
  const target = e.target as HTMLElement | null;
  const row = target?.closest?.('.settings-row');
  if (row) {
    e.dataTransfer.setDragImage(row, 20, 20);
  }
};

/**
 * 解析同组资源行拖放事件的源索引；跨组或无效拖拽返回 null
 */
export const parseRowDropSourceIndex = (
  e: DragEvent,
  expectedType: ResourceGroupType,
  targetIndex: number
): number | null => {
  if (!e.dataTransfer) return null;
  const dataString = e.dataTransfer.getData('text/plain');
  if (!dataString) return null;

  try {
    const data = JSON.parse(dataString);
    if (data.type !== expectedType) return null;
    if (typeof data.index !== 'number' || data.index === targetIndex) return null;
    return data.index;
  } catch (err) {
    logger.error('Settings', 'Drag and drop error: ' + err);
    return null;
  }
};

/**
 * 从 VInput / 原生输入事件参数或回退状态中提取原始输入值
 */
export const extractInputRawValue = <T>(val: any, fallback: T): any => {
  if (val !== undefined && val !== null) {
    return typeof val === 'object' && 'target' in val
      ? (val.target as HTMLInputElement)?.value
      : val;
  }
  return fallback;
};
