import type { BrowserWindow } from 'electron';
import {
  PanProvider,
  PanParseResult,
  PanType,
  PanAccount,
  PanPublicAccount,
  PanDriveProvider,
  PanDriveListResult,
  PanShareDownloadItem,
  PanDownloadItemLink,
  PanCreateShareParams,
  PanShareCreatedInfo
} from './types';
import { sanitizeRelativePath } from '../utils/fileSystem';
import { panAccountManager } from './accountManager';
import { PanLoginWindow } from './loginWindow';
import { LanzouProvider } from './providers/lanzou';
import { ILanzouProvider } from './providers/ilanzou';
import { QuarkProvider } from './providers/quark';
import { Pan123Provider } from './providers/pan123';
import { BaiduProvider } from './providers/baidu';
import { UCProvider } from './providers/uc';
import { Pan115Provider } from './providers/pan115';
import { XunleiProvider } from './providers/xunlei';
import { C139Provider } from './providers/c139';
import { GuangYaProvider } from './providers/guangya';
import {
  parseShareText,
  looksLikeXunleiKouling,
  resolveXunleiKouling
} from './shareLinkParser';
import { logger } from '../logger';

export class PanService {
  private static instance: PanService;
  private resolvedUrlHeaders = new Map<string, { headers: Record<string, string>; expiresAt: number }>();
  private providers: PanProvider[] = [
    new QuarkProvider(),
    new UCProvider(),
    new BaiduProvider(),
    new Pan123Provider(),
    new ILanzouProvider(), // 必须先于 LanzouProvider 注册
    new LanzouProvider(),
    new Pan115Provider(),
    new XunleiProvider(),
    new C139Provider(),
    new GuangYaProvider()
  ];

  static getInstance(): PanService {
    if (!PanService.instance) {
      PanService.instance = new PanService();
    }
    return PanService.instance;
  }

  cacheResolvedHeaders(url: string, headers?: Record<string, string>): void {
    if (!url) return;
    const now = Date.now();
    if (this.resolvedUrlHeaders.size >= 1000) {
      this.resolvedUrlHeaders.forEach((entry, key) => {
        if (entry.expiresAt <= now) this.resolvedUrlHeaders.delete(key);
      });
      if (this.resolvedUrlHeaders.size >= 1000) {
        const oldestKey = this.resolvedUrlHeaders.keys().next().value;
        if (oldestKey !== undefined) this.resolvedUrlHeaders.delete(oldestKey);
      }
    }
    this.resolvedUrlHeaders.set(url, {
      headers: { ...(headers || {}) },
      expiresAt: now + 45 * 60 * 1000
    });
  }

  getCachedHeadersForUrl(url: string): Record<string, string> | undefined {
    if (!url) return undefined;
    const entry = this.resolvedUrlHeaders.get(url);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.resolvedUrlHeaders.delete(url);
      return undefined;
    }
    return { ...entry.headers };
  }

  sanitizeHeadersForRenderer(headers?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers) return out;
    for (const [k, v] of Object.entries(headers)) {
      const lower = k.toLowerCase();
      if (lower === 'cookie' || lower === 'authorization' || lower === 'x-velora-client-id') {
        continue;
      }
      out[k] = v;
    }
    return out;
  }

  toPublicAccount(acc: PanAccount): PanPublicAccount {
    return {
      type: acc.type,
      name: acc.name,
      avatar: acc.avatar,
      quotaText: acc.quotaText,
      totalSpace: acc.totalSpace,
      usedSpace: acc.usedSpace,
      updatedAt: acc.updatedAt
    };
  }

  getPublicAccounts(): PanPublicAccount[] {
    return this.getAccounts().map((acc) => this.toPublicAccount(acc));
  }

  isPanUrl(text: string): boolean {
    if (!text) return false;
    if (parseShareText(text)) return true;
    if (looksLikeXunleiKouling(text)) return true;
    return this.providers.some((p) => p.canHandle(text));
  }

  getPanType(text: string): PanType | null {
    const parsed = parseShareText(text);
    if (parsed) return parsed.panType;
    if (looksLikeXunleiKouling(text)) return 'xunlei';
    const p = this.providers.find((provider) => provider.canHandle(text));
    return p ? p.panType : null;
  }

  async parseUrl(rawInput: string, password = ''): Promise<PanParseResult> {
    let targetUrl = (rawInput || '').trim();
    let effectivePassword = (password || '').trim();

    const parsedShare = parseShareText(targetUrl);
    if (parsedShare) {
      targetUrl = parsedShare.normalizedUrl;
      if (!effectivePassword && parsedShare.pwd) {
        effectivePassword = parsedShare.pwd;
      }
    } else if (looksLikeXunleiKouling(targetUrl)) {
      logger.info('PanService', '检测到疑似迅雷中文口令，尝试换取分享链接');
      const koulingRes = await resolveXunleiKouling(targetUrl);
      if (!koulingRes?.url) {
        return {
          panType: 'xunlei',
          shareTitle: '迅雷口令解析',
          files: [],
          error: '口令未匹配到有效的迅雷网盘分享链接'
        };
      }
      targetUrl = koulingRes.url;
      if (!effectivePassword && koulingRes.pwd) {
        effectivePassword = koulingRes.pwd;
      }
    }

    const provider = this.providers.find((p) => p.canHandle(targetUrl));
    if (!provider) {
      return {
        panType: 'quark',
        shareTitle: '未知网盘',
        files: [],
        error: '不支持的网盘分享链接或口令'
      };
    }

    const account = panAccountManager.getAccount(provider.panType) || undefined;
    logger.info(
      'PanService',
      `使用 Provider ${provider.panType} 进行解析 (已登录账号: ${account?.name || '无'})`
    );
    return provider.parse(targetUrl, effectivePassword, account);
  }

  getAccounts(): PanAccount[] {
    return panAccountManager.getAllAccounts();
  }

  removeAccount(type: PanType): void {
    panAccountManager.removeAccount(type);
  }

  async login(type: PanType, parentWindow?: BrowserWindow): Promise<PanAccount | null> {
    return PanLoginWindow.open(type, parentWindow);
  }

  getDriveProvider(type: PanType): PanDriveProvider | null {
    const p = this.providers.find((provider) => provider.panType === type);
    if (p && typeof (p as any).listFiles === 'function') {
      return p as unknown as PanDriveProvider;
    }
    return null;
  }

  async listDriveFiles(type: PanType, pdirFid = '0'): Promise<{ success: boolean; data?: PanDriveListResult; error?: string }> {
    const provider = this.getDriveProvider(type);
    if (!provider) {
      return { success: false, error: `当前网盘 ${type} 暂不支持个人盘文件浏览` };
    }
    const account = panAccountManager.getAccount(type);
    if (!account) {
      return { success: false, error: `未登录 ${type} 网盘账号` };
    }
    try {
      const data = await provider.listFiles(pdirFid, account);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err?.message || '获取网盘文件失败' };
    }
  }

  async getDriveDownloadUrls(
    type: PanType,
    fids: string[]
  ): Promise<{ success: boolean; urls?: Record<string, string>; links?: Record<string, PanDownloadItemLink>; error?: string }> {
    const provider = this.getDriveProvider(type);
    if (!provider) {
      return { success: false, error: `当前网盘 ${type} 暂不支持获取直链` };
    }
    const account = panAccountManager.getAccount(type);
    if (!account) {
      return { success: false, error: `未登录 ${type} 网盘账号` };
    }
    try {
      let urls: Record<string, string> = {};
      const rawLinks: Record<string, PanDownloadItemLink> = {};
      if (provider.getBatchDownloadUrlsDetail) {
        const fetched = await provider.getBatchDownloadUrlsDetail(fids, account);
        for (const [fid, link] of Object.entries(fetched)) {
          if (link?.url) {
            rawLinks[fid] = link;
            urls[fid] = link.url;
          }
        }
      } else if (provider.getBatchDownloadUrls) {
        urls = await provider.getBatchDownloadUrls(fids, account);
        for (const [fid, u] of Object.entries(urls)) {
          if (u) rawLinks[fid] = { fid, url: u, headers: {} };
        }
      } else {
        for (const fid of fids) {
          const u = await provider.getDriveDownloadUrl(fid, account);
          if (u) {
            urls[fid] = u;
            rawLinks[fid] = { fid, url: u, headers: {} };
          }
        }
      }

      if (fids.length > 0 && Object.keys(urls).length === 0) {
        return { success: false, error: '未能获取到有效下载直链，请检查登录状态或稍后重试' };
      }

      const links: Record<string, PanDownloadItemLink> = {};
      for (const [fid, link] of Object.entries(rawLinks)) {
        this.cacheResolvedHeaders(link.url, link.headers);
        links[fid] = {
          ...link,
          headers: this.sanitizeHeadersForRenderer(link.headers)
        };
      }
      return { success: true, urls, links };
    } catch (err: any) {
      return { success: false, error: err?.message || '获取直链失败' };
    }
  }

  async deleteDriveFiles(type: PanType, fids: string[]): Promise<{ success: boolean; error?: string }> {
    const provider = this.getDriveProvider(type);
    if (!provider) {
      return { success: false, error: `当前网盘 ${type} 暂不支持删除文件` };
    }
    const account = panAccountManager.getAccount(type);
    if (!account) {
      return { success: false, error: `未登录 ${type} 网盘账号` };
    }
    try {
      const ok = await provider.deleteFiles(fids, account);
      if (!ok) {
        return { success: false, error: '删除文件未成功，请确认登录状态或稍后重试' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || '删除文件失败' };
    }
  }

  async createDriveFolder(
    type: PanType,
    parentFid: string,
    name: string
  ): Promise<{ success: boolean; data?: { fid: string; name: string }; error?: string }> {
    const provider = this.getDriveProvider(type);
    if (!provider || !provider.createFolder) {
      return { success: false, error: `当前网盘 ${type} 暂不支持新建文件夹` };
    }
    const account = panAccountManager.getAccount(type);
    if (!account) {
      return { success: false, error: `未登录 ${type} 网盘账号` };
    }
    try {
      const data = await provider.createFolder(parentFid, name, account);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err?.message || '新建文件夹失败' };
    }
  }

  async renameDriveItem(
    type: PanType,
    fid: string,
    newName: string,
    isDirectory?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const provider = this.getDriveProvider(type);
    if (!provider || !provider.renameItem) {
      return { success: false, error: `当前网盘 ${type} 暂不支持重命名` };
    }
    const account = panAccountManager.getAccount(type);
    if (!account) {
      return { success: false, error: `未登录 ${type} 网盘账号` };
    }
    try {
      const ok = await provider.renameItem(fid, newName, account, { isDirectory });
      return { success: ok };
    } catch (err: any) {
      return { success: false, error: err?.message || '重命名失败' };
    }
  }

  async moveDriveItems(
    type: PanType,
    fids: string[],
    targetDirFid: string
  ): Promise<{ success: boolean; error?: string }> {
    const provider = this.getDriveProvider(type);
    if (!provider || !provider.moveItems) {
      return { success: false, error: `当前网盘 ${type} 暂不支持移动文件` };
    }
    const account = panAccountManager.getAccount(type);
    if (!account) {
      return { success: false, error: `未登录 ${type} 网盘账号` };
    }
    try {
      const ok = await provider.moveItems(fids, targetDirFid, account);
      return { success: ok };
    } catch (err: any) {
      return { success: false, error: err?.message || '移动文件失败' };
    }
  }

  async createDriveShare(
    type: PanType,
    params: PanCreateShareParams
  ): Promise<{ success: boolean; data?: PanShareCreatedInfo; error?: string }> {
    const provider = this.getDriveProvider(type);
    if (!provider || !provider.createShare) {
      return { success: false, error: `当前网盘 ${type} 暂不支持创建分享` };
    }
    const account = panAccountManager.getAccount(type);
    if (!account) {
      return { success: false, error: `未登录 ${type} 网盘账号` };
    }
    try {
      const data = await provider.createShare(params, account);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err?.message || '创建分享失败' };
    }
  }

  async saveShareToDrive(
    type: PanType,
    items: PanShareDownloadItem[],
    targetDirFid: string
  ): Promise<{ success: boolean; savedCount?: number; error?: string }> {
    const provider = this.providers.find((p) => p.panType === type);
    if (!provider || !provider.saveShareItems) {
      return { success: false, error: `当前网盘 ${type} 暂不支持转存分享到网盘` };
    }
    const account = panAccountManager.getAccount(type);
    if (!account) {
      return { success: false, error: `未登录 ${type} 网盘账号，请先登录` };
    }
    try {
      const normalizedEntries = items.map((item) => {
        const rawRel = typeof item.extra?.relativePath === 'string' ? item.extra.relativePath.trim() : '';
        let dirKey = '';
        if (rawRel && (rawRel.includes('/') || rawRel.includes('\\'))) {
          const cleanRel = sanitizeRelativePath(rawRel, 'file');
          const parts = cleanRel.split('/');
          if (parts.length > 1) {
            parts.pop();
            dirKey = parts.join('/');
          }
        }
        return { item, dirKey };
      });

      const dirPrefixes = new Set<string>();
      for (const entry of normalizedEntries) {
        if (!entry.dirKey) continue;
        const parts = entry.dirKey.split('/');
        for (let i = 1; i <= parts.length; i++) {
          dirPrefixes.add(parts.slice(0, i).join('/'));
        }
      }

      const driveProvider = this.getDriveProvider(type);
      if (dirPrefixes.size === 0 || !driveProvider || !driveProvider.createFolder) {
        const res = await provider.saveShareItems(items, targetDirFid, account);
        return { success: true, savedCount: res.savedCount };
      }

      const sortedDirs = Array.from(dirPrefixes).sort(
        (a, b) => a.split('/').length - b.split('/').length
      );
      const dirFidCache = new Map<string, string>([['', targetDirFid]]);
      const existingDirCache = new Map<string, Map<string, string>>();

      const loadExistingDirs = async (parentFid: string): Promise<Map<string, string>> => {
        const cached = existingDirCache.get(parentFid);
        if (cached) return cached;
        const map = new Map<string, string>();
        try {
          const listRes = await driveProvider.listFiles(parentFid, account);
          for (const f of listRes.files || []) {
            if (f.isDirectory && f.name && f.id) {
              map.set(f.name, f.id);
            }
          }
        } catch {}
        existingDirCache.set(parentFid, map);
        return map;
      };

      for (const dirPath of sortedDirs) {
        const parts = dirPath.split('/');
        const folderName = parts[parts.length - 1];
        const parentKey = parts.slice(0, -1).join('/');
        const parentFid = dirFidCache.get(parentKey) || targetDirFid;

        const existingMap = await loadExistingDirs(parentFid);
        const existingFid = existingMap.get(folderName);
        if (existingFid) {
          dirFidCache.set(dirPath, existingFid);
          continue;
        }

        try {
          const created = await driveProvider.createFolder(parentFid, folderName, account);
          dirFidCache.set(dirPath, created.fid);
          existingMap.set(folderName, created.fid);
        } catch (createErr: any) {
          existingDirCache.delete(parentFid);
          const refreshedMap = await loadExistingDirs(parentFid);
          const matchedFid = refreshedMap.get(folderName);
          if (matchedFid) {
            dirFidCache.set(dirPath, matchedFid);
          } else {
            throw createErr;
          }
        }
      }

      const groupedByTarget = new Map<string, PanShareDownloadItem[]>();
      for (const entry of normalizedEntries) {
        const destFid = dirFidCache.get(entry.dirKey) || targetDirFid;
        const list = groupedByTarget.get(destFid) || [];
        list.push(entry.item);
        groupedByTarget.set(destFid, list);
      }

      let totalSaved = 0;
      for (const [destFid, groupItems] of Array.from(groupedByTarget.entries())) {
        const res = await provider.saveShareItems(groupItems, destFid, account);
        totalSaved += res.savedCount;
      }
      return { success: true, savedCount: totalSaved };
    } catch (err: any) {
      return { success: false, error: err?.message || '转存分享失败' };
    }
  }

  invalidatePanSession(type: PanType): void {
    const provider = this.providers.find((p) => p.panType === type);
    if (provider && typeof (provider as any).invalidateSession === 'function') {
      (provider as any).invalidateSession();
    }
  }

  async cleanupTempDir(type: PanType, cleanupDirFid: string): Promise<void> {
    if (!cleanupDirFid) return;
    const provider = this.getDriveProvider(type);
    const account = panAccountManager.getAccount(type);
    if (!provider || !account) return;
    try {
      await provider.deleteFiles([cleanupDirFid], account);
      logger.info('PanService', `已清理网盘 ${type} 临时转存目录: ${cleanupDirFid}`);
    } catch (err: any) {
      logger.warn('PanService', `清理网盘 ${type} 临时转存目录失败 (${cleanupDirFid}): ${err?.message}`);
    }
  }

  async getShareDownloadUrls(
    type: PanType,
    items: PanShareDownloadItem[]
  ): Promise<{ success: boolean; urls?: Record<string, string>; links?: Record<string, PanDownloadItemLink>; error?: string }> {
    const provider = this.providers.find((p) => p.panType === type);
    if (!provider) {
      return { success: false, error: `当前网盘 ${type} 暂不支持分享直链获取` };
    }
    const account = panAccountManager.getAccount(type) || undefined;
    try {
      let urls: Record<string, string> = {};
      const rawLinks: Record<string, PanDownloadItemLink> = {};
      if (provider.getShareDownloadUrlsDetail) {
        const fetched = await provider.getShareDownloadUrlsDetail(items, account);
        for (const [fid, link] of Object.entries(fetched)) {
          if (link?.url) {
            rawLinks[fid] = link;
            urls[fid] = link.url;
          }
        }
      } else if (provider.getShareDownloadUrls) {
        urls = await provider.getShareDownloadUrls(items, account);
        for (const [fid, u] of Object.entries(urls)) {
          if (u) rawLinks[fid] = { fid, url: u, headers: {} };
        }
      } else {
        return { success: false, error: `当前网盘 ${type} 暂不支持分享直链获取` };
      }

      if (items.length > 0 && Object.keys(urls).length === 0) {
        return { success: false, error: '未能获取到有效下载直链，请检查登录状态或分享链接有效性' };
      }

      const links: Record<string, PanDownloadItemLink> = {};
      for (const [fid, link] of Object.entries(rawLinks)) {
        this.cacheResolvedHeaders(link.url, link.headers);
        links[fid] = {
          ...link,
          headers: this.sanitizeHeadersForRenderer(link.headers)
        };
      }
      return { success: true, urls, links };
    } catch (err: any) {
      return { success: false, error: err?.message || '获取分享直链失败' };
    }
  }

  async refreshQuota(type: PanType): Promise<{ success: boolean; quotaText?: string; used?: number; total?: number; error?: string }> {
    const provider = this.getDriveProvider(type);
    if (!provider || !provider.getQuota) {
      return { success: false, error: `当前网盘 ${type} 不支持刷新容量` };
    }
    const account = panAccountManager.getAccount(type);
    if (!account) {
      return { success: false, error: `未登录 ${type} 网盘账号` };
    }
    try {
      const res = await provider.getQuota(account);
      if (res && res.quotaText) {
        account.quotaText = res.quotaText;
        account.usedSpace = res.used;
        account.totalSpace = res.total;
        panAccountManager.saveAccount(account);
        return {
          success: true,
          quotaText: res.quotaText,
          used: res.used,
          total: res.total
        };
      }
      return { success: false, error: '获取网盘容量返回空' };
    } catch (err: any) {
      return { success: false, error: err?.message || '刷新容量异常' };
    }
  }
}

export const panService = PanService.getInstance();
