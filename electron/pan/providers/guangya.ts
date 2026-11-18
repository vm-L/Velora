import crypto from 'crypto';
import { net } from 'electron';
import {
  PanProvider,
  PanParseResult,
  PanFileItem,
  PanAccount,
  PanDriveProvider,
  PanDriveListResult,
  PanDriveItem,
  PanShareDownloadItem,
  PanDownloadItemLink,
  PanCreateShareParams,
  PanShareCreatedInfo
} from '../types';
import { panAccountManager } from '../accountManager';
import { logger } from '../../logger';
import { toGuangYaDuration } from '../shareExpire';
import {
  formatPanBytes,
  inferFormatType,
  mapConcurrent,
  parseTimestamp,
  sleep
} from '../utils';

export const GUANGYA_CONSTANTS = {
  CLIENT_ID: 'aMe-8VSlkrbQXpUR',
  API_BASE: 'https://api.guangyapan.com',
  ACCOUNT_BASE: 'https://account.guangyapan.com',
  WEB_SITE: 'https://www.guangyapan.com',
  DOWNLOAD_REFERER: 'https://www.guangyapan.com/',
  WEB_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  CLIENT_VERSION: '0.0.1',
  SDK_VERSION: '9.1.3',
  PROTOCOL_VERSION: '301',
  DEVICE_MODEL: 'chrome%2F131.0.0.0',
  DEVICE_NAME: 'PC-Chrome',
  OS_VERSION: 'Win32',
  PLATFORM_VERSION: '1',
  TEMP_DIR_NAME: 'Velora临时转存'
};

export class GuangYaProvider implements PanProvider, PanDriveProvider {
  panType = 'guangya' as const;

  private publicDeviceId = crypto.randomBytes(16).toString('hex');
  private itemNameCache = new Map<string, string>();
  private ensureTempDirPromise: Promise<string> | null = null;

  private async ensureTempDir(account: PanAccount): Promise<string> {
    if (this.ensureTempDirPromise) {
      return this.ensureTempDirPromise;
    }
    this.ensureTempDirPromise = (async () => {
      try {
        const listed = await this.listFiles('0', account);
        const existing = listed.files.find(
          (f) => f.isDirectory && f.name === GUANGYA_CONSTANTS.TEMP_DIR_NAME
        );
        if (existing?.id) {
          return existing.id;
        }
      } catch {}

      try {
        const created = await this.createFolder('0', GUANGYA_CONSTANTS.TEMP_DIR_NAME, account);
        return created.fid;
      } catch (err) {
        const listed = await this.listFiles('0', account);
        const existing = listed.files.find(
          (f) => f.isDirectory && f.name === GUANGYA_CONSTANTS.TEMP_DIR_NAME
        );
        if (existing?.id) {
          return existing.id;
        }
        throw err;
      }
    })().finally(() => {
      this.ensureTempDirPromise = null;
    });
    return this.ensureTempDirPromise;
  }

  canHandle(url: string): boolean {
    if (!url) return false;
    return url.toLowerCase().includes('guangyapan.com');
  }

  private extractShareId(url: string): string {
    const match = url.match(/guangyapan\.com\/s\/([A-Za-z0-9_-]+)/i);
    return match ? match[1] : '';
  }

  private newTraceparent(): string {
    return `00-${crypto.randomBytes(16).toString('hex')}-${crypto.randomBytes(8).toString('hex')}-01`;
  }

  private getDeviceId(account?: PanAccount): string {
    return account?.extra?.deviceId || this.publicDeviceId;
  }

  private getAccessToken(account?: PanAccount): string {
    return account?.extra?.accessToken || account?.cookies?.accessToken || account?.cookies?.access_token || '';
  }

  private requireAccessToken(account: PanAccount): string {
    const token = this.getAccessToken(account);
    if (!token) {
      throw new Error('光鸭云盘登录凭证缺失或已失效，请在设置中重新登录');
    }
    return token;
  }

  private refreshInFlight: Promise<string | null> | null = null;

  private async refreshAccessToken(account: PanAccount): Promise<string | null> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    const refreshToken = account?.extra?.refreshToken;
    if (!refreshToken) return null;

    const deviceId = this.getDeviceId(account);
    const deviceSign = `wdi10.${deviceId}${crypto.randomBytes(16).toString('hex')}`;
    this.refreshInFlight = (async () => {
      try {
        const resp = await net.fetch(`${GUANGYA_CONSTANTS.ACCOUNT_BASE}/v1/auth/token`, {
          method: 'POST',
          headers: {
            'X-Client-Id': GUANGYA_CONSTANTS.CLIENT_ID,
            'X-Client-Version': GUANGYA_CONSTANTS.CLIENT_VERSION,
            'X-Device-Id': encodeURIComponent(deviceId),
            'X-Device-Model': GUANGYA_CONSTANTS.DEVICE_MODEL,
            'X-Device-Name': GUANGYA_CONSTANTS.DEVICE_NAME,
            'X-Device-Sign': encodeURIComponent(deviceSign),
            'X-Os-Version': GUANGYA_CONSTANTS.OS_VERSION,
            'X-Platform-Version': GUANGYA_CONSTANTS.PLATFORM_VERSION,
            'X-Protocol-Version': GUANGYA_CONSTANTS.PROTOCOL_VERSION,
            'X-Sdk-Version': GUANGYA_CONSTANTS.SDK_VERSION,
            'X-Action': '401',
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'User-Agent': GUANGYA_CONSTANTS.WEB_UA
          },
          body: JSON.stringify({
            client_id: GUANGYA_CONSTANTS.CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          })
        });
        if (!resp.ok) return null;
        const rawText = await resp.text();
        if (!rawText || rawText.trim().startsWith('<')) return null;
        const json: any = JSON.parse(rawText);
        const data = json?.data || json;
        const newAccess = data?.access_token || data?.accessToken;
        if (!newAccess) return null;
        const newRefresh = data?.refresh_token || data?.refreshToken || refreshToken;
        account.extra = {
          ...(account.extra || {}),
          accessToken: newAccess,
          refreshToken: newRefresh,
          deviceId
        };
        panAccountManager.saveAccount(account);
        return newAccess;
      } catch {
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  private async businessPost(
    path: string,
    payload: Record<string, any>,
    account?: PanAccount,
    useAuth = false,
    allowRetry = true
  ): Promise<any> {
    const token = useAuth && account ? this.requireAccessToken(account) : '';
    const did = this.getDeviceId(account);
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'User-Agent': GUANGYA_CONSTANTS.WEB_UA,
      'Origin': GUANGYA_CONSTANTS.WEB_SITE,
      'Referer': GUANGYA_CONSTANTS.DOWNLOAD_REFERER,
      'dt': '4',
      'did': did,
      'traceparent': this.newTraceparent()
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const resp = await net.fetch(`${GUANGYA_CONSTANTS.API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (resp.status === 401 && useAuth && account && allowRetry) {
      const refreshed = await this.refreshAccessToken(account);
      if (refreshed) {
        return this.businessPost(path, payload, account, useAuth, false);
      }
      throw new Error('光鸭云盘登录已过期，请在设置中重新登录');
    }

    const text = await resp.text();
    if (!text) {
      throw new Error(`光鸭云盘请求失败 (HTTP ${resp.status})`);
    }
    if (text.trim().startsWith('<')) {
      throw new Error(`光鸭云盘返回异常响应 (HTTP ${resp.status})`);
    }
    const parsedJson = JSON.parse(text);
    if (
      useAuth &&
      account &&
      allowRetry &&
      (String(parsedJson?.code) === '401' || parsedJson?.error === 'unauthenticated')
    ) {
      const refreshed = await this.refreshAccessToken(account);
      if (refreshed) {
        return this.businessPost(path, payload, account, useAuth, false);
      }
      throw new Error('光鸭云盘登录已过期，请在设置中重新登录');
    }
    return parsedJson;
  }

  private isSuccess(json: any): boolean {
    if (json?.success === false) return false;
    if (json?.error) return false;
    const code = String(json?.code ?? '');
    return !code || code === '0';
  }

  private checkBusiness(json: any, fallback: string) {
    if (this.isSuccess(json)) return;
    const code = String(json?.code ?? '');
    const serverMsg = json?.msg || json?.message || json?.error_description || '';
    if (code === '209') throw new Error('光鸭分享提取码错误或缺失');
    if (code === '200' || code === '201' || code === '202') {
      throw new Error('光鸭分享已取消、过期或不可访问');
    }
    if (code === '205' || code === '206' || code === '207' || code === '504') {
      throw new Error('光鸭分享下载受限，需登录后转存下载');
    }
    if (code === '157') throw new Error('光鸭网盘空间不足');
    throw new Error(serverMsg || `${fallback} (code=${code})`);
  }

  private parseFileEntry(item: any) {
    const fid = String(item?.fileId || item?.file_id || item?.id || item?.resId || item?.resourceId || '');
    const name = String(
      item?.fileName || item?.name || item?.filename || item?.dirName || item?.title || '未知文件'
    );
    const size = Number(item?.fileSize ?? item?.size ?? item?.file_size ?? 0) || 0;
    const resType = String(item?.resType ?? '');
    const dirType = String(item?.dirType ?? '');
    let isDir = false;
    if (resType === '2') isDir = true;
    else if (resType === '1') isDir = false;
    else {
      const t = String(item?.type || '').toLowerCase();
      const ft = String(item?.fileType || '').toLowerCase();
      isDir = !!(
        item?.isDir ||
        item?.isdir ||
        item?.dir ||
        item?.isFolder ||
        item?.folder ||
        item?.dirName ||
        ['folder', 'dir', 'directory', '0'].includes(t) ||
        ['folder', 'dir', 'directory', '0'].includes(ft) ||
        (!name.includes('.') && dirType === '1')
      );
    }
    const parentId = String(item?.parentId || item?.parentFileId || item?.parent_id || '');
    const updatedAt = parseTimestamp(
      item?.updatedAt ||
        item?.updateAt ||
        item?.updated_at ||
        item?.updateTime ||
        item?.mtime ||
        item?.createdAt
    );
    return { fid, name, size, isDir, parentId, updatedAt };
  }

  private extractArray(data: any): any[] {
    if (!data) return [];
    return (
      data.list ||
      data.items ||
      data.files ||
      data.records ||
      data.content ||
      []
    );
  }

  /**
   * 1. 分享解析
   */
  async parse(url: string, password = '', _account?: PanAccount): Promise<PanParseResult> {
    const shareId = this.extractShareId(url);
    if (!shareId) {
      return {
        panType: 'guangya',
        shareTitle: '光鸭云盘',
        files: [],
        error: '无效的光鸭云盘分享链接'
      };
    }

    try {
      let shareTitle = '光鸭云盘分享';
      try {
        const sumJson = await this.businessPost('/userres/v1/get_share_summary', { shareId });
        if (this.isSuccess(sumJson) && sumJson?.data) {
          shareTitle = sumJson.data.title || sumJson.data.shareName || shareTitle;
        }
      } catch {}

      const urlPwdMatch = url.match(/[?&](?:pwd|password|passcode)=([A-Za-z0-9]+)/i);
      const pwd = password || urlPwdMatch?.[1] || '';

      const tokenJson = await this.businessPost('/userres/v1/get_share_access_token', {
        shareId,
        code: pwd
      });
      this.checkBusiness(tokenJson, '获取光鸭分享访问令牌失败');
      const shareAccessToken = tokenJson?.data?.accessToken || tokenJson?.data?.access_token;
      if (!shareAccessToken) {
        throw new Error('光鸭分享链接无效或需要提取码');
      }

      const files: PanFileItem[] = [];
      const visitedDirs = new Set<string>();

      const scanDir = async (parentId: string, prefix: string): Promise<void> => {
        if (visitedDirs.has(parentId)) return;
        visitedDirs.add(parentId);
        const subDirs: Array<{ id: string; path: string }> = [];
        let cursor = '';

        for (let page = 0; page < 50; page++) {
          const body: Record<string, any> = {
            parentId,
            pageSize: 100,
            orderBy: 0,
            sortType: 0,
            accessToken: shareAccessToken
          };
          if (cursor) body.cursor = cursor;

          const json = await this.businessPost('/userres/v1/get_share_page_files_list', body);
          this.checkBusiness(json, '获取光鸭分享列表失败');
          const data = json?.data || {};
          const arr = this.extractArray(data);
          if (!Array.isArray(arr) || arr.length === 0) break;

          for (const raw of arr) {
            const item = this.parseFileEntry(raw);
            if (!item.fid) continue;
            const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.isDir) {
              subDirs.push({ id: item.fid, path: itemPath });
            } else {
              files.push({
                id: item.fid,
                name: item.name,
                path: itemPath,
                size: item.size,
                isDirectory: false,
                rawInfo: {
                  fid: item.fid,
                  pwdId: shareId,
                  stoken: shareAccessToken,
                  code: pwd,
                  name: item.name,
                  size: item.size
                }
              });
            }
          }

          const hasMore = Boolean(data.hasMore);
          const nextCursor = data.cursor ? String(data.cursor) : '';
          if (!hasMore || !nextCursor || nextCursor === cursor) break;
          cursor = nextCursor;
        }

        for (const sub of subDirs) {
          await scanDir(sub.id, sub.path);
        }
      };

      await scanDir('', '');

      if (files.length === 0) {
        return {
          panType: 'guangya',
          shareTitle,
          files: [],
          error: '该光鸭分享中未找到文件'
        };
      }

      return {
        panType: 'guangya',
        shareTitle,
        files
      };
    } catch (err: any) {
      logger.error('GuangYaProvider', `解析光鸭分享异常: ${err.message}`);
      return {
        panType: 'guangya',
        shareTitle: '光鸭云盘',
        files: [],
        error: err?.message || '解析光鸭云盘分享失败'
      };
    }
  }

  /**
   * 2. 获取分享下载直链（含 207 受限 -> 临时转存兜底与清理标识）
   */
  async getShareDownloadUrlsDetail(
    items: PanShareDownloadItem[],
    account?: PanAccount
  ): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!items || items.length === 0) return result;

    const restrictedItems: PanShareDownloadItem[] = [];

    await mapConcurrent(items, 4, async (item) => {
      let shareToken = item.stoken || item.extra?.stoken || '';
      if (!shareToken) return;
      let json = await this.businessPost('/userres/v1/get_share_download_url', {
        fileId: item.fid,
        accessToken: shareToken
      });
      if (!this.isSuccess(json) && String(json?.code) !== '207' && item.extra?.code !== undefined) {
        const shareId = item.pwdId || item.extra?.pwdId || '';
        if (shareId) {
          const tokenJson = await this.businessPost('/userres/v1/get_share_access_token', {
            shareId,
            code: String(item.extra.code || '')
          });
          if (this.isSuccess(tokenJson)) {
            const refreshedToken = tokenJson?.data?.accessToken || tokenJson?.data?.access_token;
            if (refreshedToken) {
              shareToken = refreshedToken;
              json = await this.businessPost('/userres/v1/get_share_download_url', {
                fileId: item.fid,
                accessToken: shareToken
              });
            }
          }
        }
      }
      if (String(json?.code) === '207') {
        restrictedItems.push({
          ...item,
          stoken: shareToken
        });
        return;
      }
      this.checkBusiness(json, '获取光鸭分享直链失败');
      const data = json?.data || {};
      const url =
        data.signedURL ||
        data.signedUrl ||
        data.downloadUrl ||
        data.download_url ||
        data.url ||
        data.cdnUrl ||
        '';
      if (url) {
        result[item.fid] = {
          fid: item.fid,
          url,
          size: Number(data.size ?? item.extra?.size ?? 0) || undefined,
          filename: item.extra?.name,
          headers: {
            Referer: GUANGYA_CONSTANTS.DOWNLOAD_REFERER
          }
        };
      }
    });

    if (restrictedItems.length > 0) {
      if (!account || !this.getAccessToken(account)) {
        if (Object.keys(result).length === 0) {
          throw new Error('该光鸭分享需登录并转存后下载，请先在设置中登录光鸭云盘');
        }
        return result;
      }

      const byToken = new Map<string, PanShareDownloadItem[]>();
      for (const it of restrictedItems) {
        const st = it.stoken || it.extra?.stoken || '';
        if (!st) continue;
        const arr = byToken.get(st) || [];
        arr.push(it);
        byToken.set(st, arr);
      }

      const baseTempDirId = await this.ensureTempDir(account);
      for (const [shareToken, group] of Array.from(byToken.entries())) {
        const subDirName = `tr_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
        let tempDirId = '';
        try {
          const dir = await this.createFolder(baseTempDirId, subDirName, account);
          tempDirId = dir.fid;
          await this.restoreShare(shareToken, group.map((it) => it.fid), tempDirId, account);

          // restore_share 无 taskId 时后台异步落盘，需轮询目录直到目标文件可见（最多 30 次）
          let driveFiles: PanDriveItem[] = [];
          let stableCount = 0;
          let lastCount = 0;
          for (let poll = 0; poll < 30; poll++) {
            await sleep(750);
            const listed = await this.listFiles(tempDirId, account);
            const nonDirs = listed.files.filter((f) => !f.isDirectory);
            if (nonDirs.length > 0) {
              driveFiles = nonDirs;
              if (nonDirs.length >= group.length) {
                break;
              }
              if (nonDirs.length === lastCount) {
                stableCount++;
                if (stableCount >= 3) break;
              } else {
                lastCount = nonDirs.length;
                stableCount = 0;
              }
            }
          }

          if (driveFiles.length === 0) {
            throw new Error('光鸭临时转存后未找到文件');
          }
          const dlDetails = await this.getBatchDownloadUrlsDetail(
            driveFiles.map((f) => f.id),
            account
          );
          const usedIds = new Set<string>();
          let anyMapped = false;
          for (const orig of group) {
            const origName = orig.extra?.name;
            const origSize = Number(orig.extra?.size || 0);
            const matched =
              (origName &&
                driveFiles.find((f) => !usedIds.has(f.id) && f.name === origName && (!origSize || f.size === origSize))) ||
              (origName && driveFiles.find((f) => !usedIds.has(f.id) && f.name === origName)) ||
              driveFiles.find((f) => !usedIds.has(f.id) && f.id === orig.fid) ||
              (group.length === 1 && driveFiles.length === 1 && !usedIds.has(driveFiles[0].id) ? driveFiles[0] : undefined);
            const link = matched ? dlDetails[matched.id] : undefined;
            if (matched && link && link.url) {
              usedIds.add(matched.id);
              anyMapped = true;
              result[orig.fid] = {
                ...link,
                fid: orig.fid,
                cleanupDirFid: tempDirId
              };
            }
          }
          if (!anyMapped) {
            throw new Error('光鸭临时转存文件匹配或取链失败');
          }
        } catch (err: any) {
          if (tempDirId) this.deleteFiles([tempDirId], account).catch(() => {});
          if (Object.keys(result).length === 0) {
            throw err;
          }
        }
      }
    }

    return result;
  }

  async getShareDownloadUrls(items: PanShareDownloadItem[], account?: PanAccount): Promise<Record<string, string>> {
    const detail = await this.getShareDownloadUrlsDetail(items, account);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(detail)) {
      out[k] = v.url;
    }
    return out;
  }

  private async waitTask(taskId: string, account: PanAccount): Promise<void> {
    await sleep(750);
    for (let i = 0; i < 80; i++) {
      const json = await this.businessPost('/userres/v1/get_task_status', { taskId }, account, true);
      this.checkBusiness(json, '查询光鸭任务状态失败');
      const data = json?.data;
      if (!data) {
        await sleep(750);
        continue;
      }
      const status = Number(data.status ?? 0);
      const detail = data.detail;
      const detailCode = Number(detail?.code ?? 0);
      if (status === 2 && detailCode === 0) return;
      if (status === 3 || (status === 2 && detailCode !== 0)) {
        throw new Error(detail?.msg || '光鸭云盘异步操作失败');
      }
      await sleep(750);
    }
    throw new Error('光鸭云盘操作仍在处理中，请稍后刷新查看');
  }

  private async restoreShare(shareToken: string, fileIds: string[], targetDirId: string, account: PanAccount) {
    const parentId = !targetDirId || targetDirId === '0' ? '' : targetDirId;
    const json = await this.businessPost(
      '/userres/v1/restore_share',
      {
        accessToken: shareToken,
        fileIds,
        parentId
      },
      account,
      true
    );
    this.checkBusiness(json, '光鸭分享转存失败');
    const taskId = json?.data?.taskId;
    if (taskId) {
      await this.waitTask(String(taskId), account);
    }
  }

  async saveShareItems(
    items: PanShareDownloadItem[],
    targetDirFid: string,
    account: PanAccount
  ): Promise<{ savedCount: number }> {
    const byToken = new Map<string, PanShareDownloadItem[]>();
    for (const it of items) {
      const st = it.stoken || it.extra?.stoken || '';
      if (!st) continue;
      const arr = byToken.get(st) || [];
      arr.push(it);
      byToken.set(st, arr);
    }
    let savedCount = 0;
    for (const [shareToken, group] of Array.from(byToken.entries())) {
      await this.restoreShare(
        shareToken,
        group.map((it) => it.fid),
        targetDirFid,
        account
      );
      savedCount += group.length;
    }
    return { savedCount };
  }

  /**
   * 3. 个人盘管理能力
   */
  async listFiles(pdirFid: string, account: PanAccount): Promise<PanDriveListResult> {
    const displayParent = pdirFid || '0';
    const apiParent = !pdirFid || pdirFid === '0' ? '' : pdirFid;
    const files: PanDriveItem[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < 100; page++) {
      const json = await this.businessPost(
        '/userres/v1/file/get_file_list',
        {
          parentId: apiParent,
          pageSize: 100,
          orderBy: 0,
          sortType: 0,
          page
        },
        account,
        true
      );
      this.checkBusiness(json, '获取光鸭文件列表失败');
      const data = json?.data;
      if (!data) break;
      const arr = this.extractArray(data);
      if (!Array.isArray(arr) || arr.length === 0) break;

      let added = 0;
      for (const raw of arr) {
        const entry = this.parseFileEntry(raw);
        if (!entry.fid || seen.has(entry.fid)) continue;
        seen.add(entry.fid);
        added++;
        this.itemNameCache.set(entry.fid, entry.name);
        files.push({
          id: entry.fid,
          name: entry.name,
          pdir_fid: displayParent,
          size: entry.size,
          isDirectory: entry.isDir,
          updatedAt: entry.updatedAt,
          formatType: inferFormatType(entry.name, entry.isDir),
          thumbnail: raw?.thumbnail
        });
      }

      const total = Number(data.total ?? 0);
      if (added === 0 || (total > 0 && files.length >= total) || (total <= 0 && arr.length < 100)) {
        break;
      }
    }

    return {
      files,
      total: files.length,
      pdir_fid: displayParent
    };
  }

  async getDriveDownloadUrl(fid: string, account: PanAccount): Promise<string> {
    const urls = await this.getBatchDownloadUrls([fid], account);
    return urls[fid] || '';
  }

  async getBatchDownloadUrls(fids: string[], account: PanAccount): Promise<Record<string, string>> {
    const details = await this.getBatchDownloadUrlsDetail(fids, account);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(details)) {
      out[k] = v.url;
    }
    return out;
  }

  async getBatchDownloadUrlsDetail(fids: string[], account: PanAccount): Promise<Record<string, PanDownloadItemLink>> {
    const out: Record<string, PanDownloadItemLink> = {};
    await mapConcurrent(fids, 4, async (fid) => {
      const json = await this.businessPost('/userres/v1/get_res_download_url', { fileId: fid }, account, true);
      this.checkBusiness(json, '获取光鸭下载直链失败');
      const data = json?.data || {};
      const url =
        data.signedURL ||
        data.signedUrl ||
        data.downloadUrl ||
        data.download_url ||
        data.url ||
        data.cdnUrl ||
        '';
      if (url) {
        out[fid] = {
          fid,
          url,
          size: Number(data.size || 0) || undefined,
          filename: this.itemNameCache.get(fid),
          headers: {
            Referer: GUANGYA_CONSTANTS.DOWNLOAD_REFERER
          }
        };
      }
    });
    return out;
  }

  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const parentId = !parentFid || parentFid === '0' ? '' : parentFid;
    const json = await this.businessPost(
      '/userres/v1/file/create_dir',
      {
        parentId,
        dirName: name,
        failIfNameExist: true
      },
      account,
      true
    );
    this.checkBusiness(json, '光鸭新建文件夹失败');
    const data = json?.data;
    const fid = data?.fileId || data?.id;
    if (!fid || String(data?.resType) === '1') {
      throw new Error('光鸭未创建文件夹，请检查是否存在同名项');
    }
    this.itemNameCache.set(String(fid), name);
    return { fid: String(fid), name };
  }

  async renameItem(fid: string, newName: string, account: PanAccount): Promise<boolean> {
    const json = await this.businessPost(
      '/userres/v1/file/rename',
      { fileId: fid, newName },
      account,
      true
    );
    this.checkBusiness(json, '光鸭重命名失败');
    if (json?.data?.taskId) {
      await this.waitTask(String(json.data.taskId), account);
    }
    this.itemNameCache.set(fid, newName);
    return true;
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const parentId = !targetDirFid || targetDirFid === '0' ? '' : targetDirFid;
    const json = await this.businessPost(
      '/userres/v1/file/move_file',
      { fileIds: fids, parentId },
      account,
      true
    );
    this.checkBusiness(json, '光鸭移动文件失败');
    if (json?.data?.taskId) {
      await this.waitTask(String(json.data.taskId), account);
    }
    return true;
  }

  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const json = await this.businessPost('/userres/v1/file/delete_file', { fileIds: fids }, account, true);
    this.checkBusiness(json, '光鸭删除文件失败');
    if (json?.data?.taskId) {
      await this.waitTask(String(json.data.taskId), account);
    }
    return true;
  }

  async createShare(params: PanCreateShareParams, account: PanAccount): Promise<PanShareCreatedInfo> {
    const code = (params.passcode || '').trim();
    const firstName = this.itemNameCache.get(params.fids[0]) || '光鸭云盘分享';
    const expireDays = toGuangYaDuration(params.expireType);
    const json = await this.businessPost(
      '/userres/v1/share_file',
      {
        fileIds: params.fids,
        title: firstName,
        validateDuration: expireDays,
        shareType: code ? 1 : 0,
        code,
        autoFillCode: false,
        trafficLimit: '0',
        maxRestoreCount: 0,
        downloadType: 1
      },
      account,
      true
    );
    this.checkBusiness(json, '光鸭创建分享失败');
    const data = json?.data || {};
    const shareId = String(data.shareId || data.id || '');
    const shareUrl = data.shareUrl || (shareId ? `${GUANGYA_CONSTANTS.WEB_SITE}/s/${shareId}` : '');
    if (!shareUrl) {
      throw new Error('光鸭创建分享失败：未返回分享链接');
    }
    return {
      shareUrl,
      passcode: data.code || code || '',
      shareId,
      title: firstName
    };
  }

  async getQuota(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    try {
      const json = await this.businessPost('/assets/v1/get_assets', {}, account, true);
      this.checkBusiness(json, '获取光鸭容量失败');
      const data = json?.data;
      if (!data) return null;
      const total = Number(data.totalSpaceSize ?? 0);
      const used = Number(data.usedSpaceSize ?? 0);
      if (total > 0) {
        return {
          used,
          total,
          quotaText: `${formatPanBytes(used)} / ${formatPanBytes(total)}`
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
