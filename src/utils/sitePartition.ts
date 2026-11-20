export const SITE_PARTITION_PREFIX = 'persist:site_';

export type SiteCacheClearScope = 'cache' | 'cookies' | 'history';

/**
 * 与主进程 electron/siteSession.ts 保持一致，为指定网站资源生成隔离持久化分区名。
 */
export function getSitePartition(resourceId: string): string {
  const cleaned = String(resourceId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleaned) {
    throw new Error('站点资源 ID 不能为空');
  }
  return `${SITE_PARTITION_PREFIX}${cleaned}`;
}
