import { session, webContents } from 'electron';

export const SITE_PARTITION_PREFIX = 'persist:site_';

export type SiteCacheClearScope = 'cache' | 'cookies' | 'history';

export interface ClearSiteSessionResult {
  success: boolean;
  partition?: string;
  clearedScopes?: SiteCacheClearScope[];
  error?: string;
}

const VALID_SCOPES = new Set<SiteCacheClearScope>(['cache', 'cookies', 'history']);

type ClearStorageType = NonNullable<Electron.ClearStorageDataOptions['storages']>[number];

/**
 * 为指定网站资源生成隔离持久化分区名称，避免不同站点间 Cookie 与缓存相互污染。
 */
export function getSitePartition(resourceId: string): string {
  const cleaned = String(resourceId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleaned) {
    throw new Error('站点资源 ID 不能为空');
  }
  return `${SITE_PARTITION_PREFIX}${cleaned}`;
}

/**
 * 判断分区名是否为网站资源独立分区（排除网盘登录、M3U8 下载池等内部专用分区）。
 */
export function isSitePartition(partition?: string | null): boolean {
  return (
    typeof partition === 'string' &&
    partition.startsWith(SITE_PARTITION_PREFIX) &&
    partition.length > SITE_PARTITION_PREFIX.length
  );
}

/**
 * 过滤并去重清理范围选项，仅保留受支持的 scope。
 */
export function normalizeClearScopes(scopes: unknown): SiteCacheClearScope[] {
  if (!Array.isArray(scopes)) return [];
  const result: SiteCacheClearScope[] = [];
  const seen = new Set<SiteCacheClearScope>();
  for (const item of scopes) {
    if (typeof item === 'string' && VALID_SCOPES.has(item as SiteCacheClearScope)) {
      const scope = item as SiteCacheClearScope;
      if (!seen.has(scope)) {
        seen.add(scope);
        result.push(scope);
      }
    }
  }
  return result;
}

/**
 * 按选定范围清理指定网站资源独立分区的缓存、Cookies 与浏览历史。
 */
export async function clearSiteSessionData(
  resourceId: string,
  scopes: SiteCacheClearScope[]
): Promise<ClearSiteSessionResult> {
  let partition: string | undefined;
  try {
    partition = getSitePartition(resourceId);
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || '站点资源 ID 不能为空'
    };
  }

  const normalizedScopes = normalizeClearScopes(scopes);
  if (normalizedScopes.length === 0) {
    return {
      success: false,
      partition,
      error: '请至少选择一项需要清理的内容'
    };
  }

  try {
    const sess = session.fromPartition(partition);
    const storages: ClearStorageType[] = [];

    if (normalizedScopes.includes('history')) {
      for (const wc of webContents.getAllWebContents()) {
        if (!wc.isDestroyed() && wc.session === sess) {
          if (wc.navigationHistory && typeof wc.navigationHistory.clear === 'function') {
            wc.navigationHistory.clear();
          } else if (typeof (wc as any).clearHistory === 'function') {
            (wc as any).clearHistory();
          }
        }
      }
    }

    if (normalizedScopes.includes('cache')) {
      await sess.clearCache();
      await sess.clearCodeCaches({});
      await sess.clearHostResolverCache();
      storages.push('cachestorage', 'shadercache', 'serviceworkers');
    }

    if (normalizedScopes.includes('cookies')) {
      await sess.clearAuthCache();
      storages.push('cookies', 'localstorage', 'indexdb', 'filesystem');
    }

    if (storages.length > 0) {
      await sess.clearStorageData({ storages });
    }

    return {
      success: true,
      partition,
      clearedScopes: normalizedScopes
    };
  } catch (err: any) {
    return {
      success: false,
      partition,
      error: err?.message || String(err)
    };
  }
}
