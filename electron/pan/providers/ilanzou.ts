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
  PanDownloadItemLink
} from '../types';
import { logger } from '../../logger';
import {
  formatPanBytes,
  inferFormatType,
  mapConcurrent,
  parseTimestamp,
  sleep
} from '../utils';

export const ILANZOU_CONSTANTS = {
  API_BASE: 'https://apis.ilanzou.com',
  SHARE_API_BASE: 'https://apix.ilanzou.com',
  WEB_SITE: 'https://www.ilanzou.com',
  DOWNLOAD_REFERER: 'https://www.ilanzou.com/',
  WEB_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  DEV_TYPE: '6',
  DEV_MODEL: 'chrome',
  SHARE_DEV_MODEL: 'Chrome',
  DEV_VERSION: '125',
  PAGE_SIZE: 60,
  AES_KEY: 'lanZouY-disk-app',
  FOLDER_PREFIX: 'd:',
  FILE_PREFIX: 'f:',
  ROOT_FOLDER_ID: '0'
};

export class ILanzouProvider implements PanProvider, PanDriveProvider {
  panType = 'ilanzou' as const;

  private anonUuid = '';
  private itemNameCache = new Map<string, string>();

  canHandle(url: string): boolean {
    if (!url) return false;
    return /(?:^|[/.])ilanzou\.(?:com|net|org|cn)/i.test(url);
  }

  private extractShareId(url: string): string {
    const m = url.match(/ilanzou\.(?:com|net|org|cn)\/s\/([A-Za-z0-9_-]+)/i);
    return m ? m[1] : '';
  }

  private aesHex(plain: string): string {
    const cipher = crypto.createCipheriv(
      'aes-128-ecb',
      Buffer.from(ILANZOU_CONSTANTS.AES_KEY, 'utf8'),
      null
    );
    cipher.setAutoPadding(true);
    return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('hex');
  }

  private encodeToken(value: string): string {
    return encodeURIComponent(value).replace(/%3A/gi, ':');
  }

  private commonHeaders(json = false): Record<string, string> {
    const h: Record<string, string> = {
      'User-Agent': ILANZOU_CONSTANTS.WEB_UA,
      'Origin': ILANZOU_CONSTANTS.WEB_SITE,
      'Referer': ILANZOU_CONSTANTS.DOWNLOAD_REFERER,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site'
    };
    if (json) {
      h['Content-Type'] = 'application/json; charset=utf-8';
    }
    return h;
  }

  private buildPersonalUrl(
    path: string,
    uuid: string,
    appToken: string | null,
    extra: boolean,
    params: Array<[string, string]> = [],
    timestamp = this.aesHex(String(Date.now()))
  ): string {
    const parts: Array<[string, string]> = [
      ['uuid', uuid],
      ['devType', ILANZOU_CONSTANTS.DEV_TYPE],
      ['devCode', uuid],
      ['devModel', ILANZOU_CONSTANTS.DEV_MODEL],
      ['devVersion', ILANZOU_CONSTANTS.DEV_VERSION],
      ['appVersion', ''],
      ['timestamp', timestamp]
    ];
    if (appToken) parts.push(['appToken', appToken]);
    if (extra) parts.push(['extra', '2']);
    for (const p of params) parts.push(p);
    const query = parts.map(([k, v]) => `${k}=${this.encodeToken(v)}`).join('&');
    return `${ILANZOU_CONSTANTS.API_BASE}${path}?${query}`;
  }

  private buildShareUrl(
    path: string,
    uuid: string,
    shareId: string,
    params: Array<[string, string]> = []
  ): string {
    const parts: Array<[string, string]> = [
      ['uuid', uuid],
      ['devType', ILANZOU_CONSTANTS.DEV_TYPE],
      ['devCode', uuid],
      ['devModel', ILANZOU_CONSTANTS.SHARE_DEV_MODEL],
      ['devVersion', ILANZOU_CONSTANTS.DEV_VERSION],
      ['appVersion', ''],
      ['timestamp', this.aesHex(String(Date.now()))],
      ['extra', '2'],
      ['shareId', shareId]
    ];
    for (const p of params) parts.push(p);
    const query = parts.map(([k, v]) => `${k}=${this.encodeToken(v)}`).join('&');
    return `${ILANZOU_CONSTANTS.SHARE_API_BASE}${path}?${query}`;
  }

  private async ensureUuid(account?: PanAccount): Promise<string> {
    if (account?.extra?.uuid) return String(account.extra.uuid);
    if (this.anonUuid) return this.anonUuid;

    const url = this.buildPersonalUrl('/unproved/getUuid', '', null, true);
    const resp = await net.fetch(url, { headers: this.commonHeaders(false) });
    const text = await resp.text();
    if (!text || text.trim().startsWith('<')) {
      throw new Error(resp.status === 409 ? '蓝奏云优享版触发安全校验，请在浏览器打开分享页完成验证后重试' : `蓝奏云优享版获取设备标识异常 (HTTP ${resp.status})`);
    }
    const json: any = JSON.parse(text);
    if (json?.uuid) {
      this.anonUuid = String(json.uuid);
      return this.anonUuid;
    }
    throw new Error('蓝奏云优享版未返回有效设备标识');
  }

  private getAuthCredentials(account: PanAccount): { appToken: string; uuid: string; userId: string } {
    const appToken = account?.extra?.appToken || account?.cookies?.appToken || '';
    const uuid = account?.extra?.uuid || '';
    const userId = account?.extra?.userId || '';
    if (!appToken || !uuid) {
      throw new Error('蓝奏云优享版登录态不完整，请在设置中重新登录');
    }
    return { appToken, uuid, userId };
  }

  private async execPersonal(url: string, init: RequestInit = {}): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await net.fetch(url, init);
      const ct = resp.headers.get('content-type') || '';
      const text = await resp.text();
      if (resp.status === 409 && ct.includes('text/html') && attempt === 0) {
        continue;
      }
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          throw new Error('蓝奏云优享版登录已过期，请重新登录');
        }
        throw new Error(`蓝奏云优享版请求失败 (${resp.status})`);
      }
      if (ct.includes('text/html') && !text.trim().startsWith('{')) {
        if (attempt === 0) continue;
        throw new Error('蓝奏云优享版访问受限，请稍后重试或重新登录');
      }
      const json: any = JSON.parse(text);
      if (json?.code === -1 || json?.code === -2) {
        throw new Error('蓝奏云优享版登录已过期，请重新登录');
      }
      if (json?.code !== 200) {
        throw new Error(json?.msg || `蓝奏云优享版操作失败 (${json?.code})`);
      }
      return json;
    }
    throw new Error('蓝奏云优享版请求失败');
  }

  private parseRawItem(item: any): {
    prefixedId: string;
    rawId: string;
    name: string;
    size: number;
    isDirectory: boolean;
    updatedAt: number;
  } | null {
    const fileType = Number(item?.fileType ?? 0);
    if (fileType === 2) {
      const fid = String(item?.folderId || '');
      if (!fid || fid === '0') return null;
      return {
        prefixedId: `${ILANZOU_CONSTANTS.FOLDER_PREFIX}${fid}`,
        rawId: fid,
        name: String(item?.folderName || '未知文件夹'),
        size: 0,
        isDirectory: true,
        updatedAt: parseTimestamp(item?.updTime || item?.addTime)
      };
    }
    const fid = String(item?.fileId || '');
    if (!fid || fid === '0') return null;
    return {
      prefixedId: `${ILANZOU_CONSTANTS.FILE_PREFIX}${fid}`,
      rawId: fid,
      name: String(item?.fileName || '未知文件'),
      size: Math.round(Number(item?.fileSize || 0) * 1024),
      isDirectory: false,
      updatedAt: parseTimestamp(item?.updTime || item?.addTime)
    };
  }

  /**
   * 1. 分享解析（匿名可用）
   */
  async parse(url: string, password = '', account?: PanAccount): Promise<PanParseResult> {
    const shareId = this.extractShareId(url);
    if (!shareId) {
      return {
        panType: 'ilanzou',
        shareTitle: '蓝奏云优享版',
        files: [],
        error: '无效的蓝奏云优享版分享链接'
      };
    }

    let effectivePwd = (password || '').trim();
    if (!effectivePwd) {
      try {
        const u = new URL(url);
        effectivePwd = (u.searchParams.get('code') || u.searchParams.get('pwd') || '').trim();
      } catch {}
    }

    try {
      const uuid = await this.ensureUuid(account);
      const files: PanFileItem[] = [];
      const visitedDirs = new Set<string>();

      const scanDir = async (rawFolderId: string, prefix: string): Promise<void> => {
        const visitKey = rawFolderId || '__ROOT__';
        if (visitedDirs.has(visitKey)) return;
        visitedDirs.add(visitKey);

        const subDirs: Array<{ rawId: string; path: string }> = [];
        const seen = new Set<string>();

        for (let page = 1; page <= 100; page++) {
          const params: Array<[string, string]> = [
            ['offset', String(page)],
            ['limit', String(ILANZOU_CONSTANTS.PAGE_SIZE)]
          ];
          if (rawFolderId) params.push(['folderId', rawFolderId]);
          if (effectivePwd) params.push(['code', effectivePwd]);

          const reqUrl = this.buildShareUrl('/unproved/share/list', uuid, shareId, params);
          const resp = await net.fetch(reqUrl, { headers: this.commonHeaders(false) });
          const text = await resp.text();
          if (!text || text.trim().startsWith('<')) {
            throw new Error(resp.status === 409 ? '蓝奏云优享版触发安全校验，请在浏览器打开分享页完成验证后重试' : `蓝奏云优享版分享返回异常响应 (HTTP ${resp.status})`);
          }
          const json: any = JSON.parse(text);
          if (json?.code !== 200) {
            throw new Error(json?.msg || `蓝奏云优享版分享请求失败 (${json?.code})`);
          }
          const list = json?.list;
          if (!Array.isArray(list) || list.length === 0) break;

          let added = 0;
          for (const raw of list) {
            const parsed = this.parseRawItem(raw);
            if (!parsed || seen.has(parsed.prefixedId)) continue;
            seen.add(parsed.prefixedId);
            added++;
            const itemPath = prefix ? `${prefix}/${parsed.name}` : parsed.name;
            if (parsed.isDirectory) {
              subDirs.push({ rawId: parsed.rawId, path: itemPath });
            } else {
              files.push({
                id: parsed.prefixedId,
                name: parsed.name,
                path: itemPath,
                size: parsed.size,
                isDirectory: false,
                rawInfo: {
                  fid: parsed.prefixedId,
                  rawFileId: parsed.rawId,
                  pwdId: shareId,
                  name: parsed.name,
                  size: parsed.size
                }
              });
            }
          }

          const totalPage = Number(json?.totalPage || 0);
          if (added === 0 || (totalPage > 0 && page >= totalPage) || (totalPage <= 0 && list.length < ILANZOU_CONSTANTS.PAGE_SIZE)) {
            break;
          }
        }

        for (const sub of subDirs) {
          await scanDir(sub.rawId, sub.path);
        }
      };

      await scanDir('', '');

      if (files.length === 0) {
        return {
          panType: 'ilanzou',
          shareTitle: '蓝奏云优享版分享',
          files: [],
          error: '该分享链接中未找到可下载的文件'
        };
      }

      return {
        panType: 'ilanzou',
        shareTitle: '蓝奏云优享版分享',
        files
      };
    } catch (err: any) {
      logger.error('ILanzouProvider', `解析分享异常: ${err.message}`);
      return {
        panType: 'ilanzou',
        shareTitle: '蓝奏云优享版',
        files: [],
        error: err?.message || '解析蓝奏云优享版分享失败'
      };
    }
  }

  /**
   * 2. 获取分享直链（支持 302 Location 与 JSON url）
   */
  async getShareDownloadUrlsDetail(
    items: PanShareDownloadItem[],
    account?: PanAccount
  ): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!items || items.length === 0) return result;

    const uuid = await this.ensureUuid(account);
    const userId = account?.extra?.userId ? String(account.extra.userId) : '';

    await mapConcurrent(items, 4, async (item) => {
      const shareId = item.pwdId || item.extra?.pwdId || '';
      const rawFileId =
        item.extra?.rawFileId ||
        (item.fid.startsWith(ILANZOU_CONSTANTS.FILE_PREFIX)
          ? item.fid.slice(ILANZOU_CONSTANTS.FILE_PREFIX.length)
          : item.fid);
      if (!shareId || !rawFileId) return;

      const ts = Date.now();
      const params: Array<[string, string]> = [
        ['downloadId', this.aesHex(`${rawFileId}|${userId}`)],
        ['enable', '1'],
        ['devType', ILANZOU_CONSTANTS.DEV_TYPE],
        ['uuid', uuid],
        ['timestamp', this.aesHex(String(ts))],
        ['auth', this.aesHex(`${rawFileId}|${ts}`)],
        ['shareId', shareId]
      ];
      const query = params.map(([k, v]) => `${k}=${this.encodeToken(v)}`).join('&');
      const reqUrl = `${ILANZOU_CONSTANTS.SHARE_API_BASE}/unproved/file/redirect?${query}`;

      const resp = await net.fetch(reqUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: this.commonHeaders(false)
      });

      const location = resp.headers.get('location');
      if (resp.status >= 300 && resp.status < 400 && location) {
        const resolved = new URL(location, ILANZOU_CONSTANTS.SHARE_API_BASE).toString();
        result[item.fid] = {
          fid: item.fid,
          url: resolved,
          size: item.extra?.size || undefined,
          filename: item.extra?.name,
          headers: {
            Referer: ILANZOU_CONSTANTS.DOWNLOAD_REFERER,
            Origin: ILANZOU_CONSTANTS.WEB_SITE,
            'User-Agent': ILANZOU_CONSTANTS.WEB_UA
          }
        };
        return;
      }

      const text = await resp.text();
      if (!text || text.trim().startsWith('<')) {
        throw new Error(resp.status === 409 ? '蓝奏云优享版触发安全校验，请在浏览器打开分享页完成验证后重试' : `蓝奏云优享版取链返回异常响应 (HTTP ${resp.status})`);
      }
      const json: any = JSON.parse(text);
      const link = json?.url || json?.data?.url || '';
      if (!link) {
        throw new Error(json?.msg || '蓝奏云优享版未返回下载地址');
      }
      result[item.fid] = {
        fid: item.fid,
        url: link,
        size: item.extra?.size || undefined,
        filename: item.extra?.name,
        headers: {
          Referer: ILANZOU_CONSTANTS.DOWNLOAD_REFERER,
          Origin: ILANZOU_CONSTANTS.WEB_SITE,
          'User-Agent': ILANZOU_CONSTANTS.WEB_UA
        }
      };
    });

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

  /**
   * 3. 分享转存至个人盘
   */
  async saveShareItems(
    items: PanShareDownloadItem[],
    targetDirFid: string,
    account: PanAccount
  ): Promise<{ savedCount: number }> {
    const { appToken, uuid } = this.getAuthCredentials(account);
    const cleanTargetFolder =
      targetDirFid && targetDirFid.startsWith(ILANZOU_CONSTANTS.FOLDER_PREFIX)
        ? targetDirFid.slice(ILANZOU_CONSTANTS.FOLDER_PREFIX.length)
        : targetDirFid || ILANZOU_CONSTANTS.ROOT_FOLDER_ID;

    const byShare = new Map<string, PanShareDownloadItem[]>();
    for (const it of items) {
      const shareId = it.pwdId || it.extra?.pwdId || '';
      if (!shareId) continue;
      const arr = byShare.get(shareId) || [];
      arr.push(it);
      byShare.set(shareId, arr);
    }

    let savedCount = 0;
    for (const [shareId, group] of Array.from(byShare.entries())) {
      const fileIds: string[] = [];
      const folderIds: string[] = [];
      for (const it of group) {
        if (it.fid.startsWith(ILANZOU_CONSTANTS.FOLDER_PREFIX)) {
          folderIds.push(it.fid.slice(ILANZOU_CONSTANTS.FOLDER_PREFIX.length));
        } else if (it.fid.startsWith(ILANZOU_CONSTANTS.FILE_PREFIX)) {
          fileIds.push(it.fid.slice(ILANZOU_CONSTANTS.FILE_PREFIX.length));
        } else {
          fileIds.push(it.extra?.rawFileId || it.fid);
        }
      }

      const reqUrl = this.buildPersonalUrl('/proved/file/transfer', uuid, appToken, true);
      const json = await this.execPersonal(reqUrl, {
        method: 'POST',
        headers: this.commonHeaders(true),
        body: JSON.stringify({
          targetFileId: fileIds.join(','),
          targetFolderId: folderIds.join(','),
          folderId: cleanTargetFolder,
          shareId
        })
      });

      const transferKey =
        json?.data?.transferKey ||
        json?.map?.transferKey ||
        json?.transferKey ||
        (typeof json?.data === 'string' ? json.data : '');

      if (transferKey) {
        for (let i = 0; i < 30; i++) {
          await sleep(500);
          const numUrl = this.buildPersonalUrl('/proved/file/transfer/num', uuid, appToken, true, [
            ['transferKey', String(transferKey)]
          ]);
          const numJson = await this.execPersonal(numUrl, { headers: this.commonHeaders(false) });
          if (Number(numJson?.map?.num ?? 0) === 1) break;
        }
      }

      savedCount += group.length;
    }

    return { savedCount };
  }

  /**
   * 4. 个人网盘文件列表与管理
   */
  async listFiles(pdirFid: string, account: PanAccount): Promise<PanDriveListResult> {
    const { appToken, uuid } = this.getAuthCredentials(account);
    const displayParent = pdirFid || '0';
    const rawFolderId =
      displayParent.startsWith(ILANZOU_CONSTANTS.FOLDER_PREFIX)
        ? displayParent.slice(ILANZOU_CONSTANTS.FOLDER_PREFIX.length)
        : displayParent;

    const files: PanDriveItem[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= 100; page++) {
      const reqUrl = this.buildPersonalUrl('/proved/record/file/list', uuid, appToken, true, [
        ['offset', String(page)],
        ['limit', String(ILANZOU_CONSTANTS.PAGE_SIZE)],
        ['folderId', rawFolderId],
        ['type', '0']
      ]);
      const json = await this.execPersonal(reqUrl, { headers: this.commonHeaders(false) });
      const list = json?.list;
      if (!Array.isArray(list) || list.length === 0) break;

      let added = 0;
      for (const raw of list) {
        const parsed = this.parseRawItem(raw);
        if (!parsed || seen.has(parsed.prefixedId)) continue;
        seen.add(parsed.prefixedId);
        added++;
        this.itemNameCache.set(parsed.prefixedId, parsed.name);
        files.push({
          id: parsed.prefixedId,
          name: parsed.name,
          pdir_fid: displayParent,
          size: parsed.size,
          isDirectory: parsed.isDirectory,
          updatedAt: parsed.updatedAt,
          formatType: inferFormatType(parsed.name, parsed.isDirectory)
        });
      }

      const totalPage = Number(json?.totalPage || 0);
      if (added === 0 || (totalPage > 0 && page >= totalPage) || (totalPage <= 0 && list.length < ILANZOU_CONSTANTS.PAGE_SIZE)) {
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
    const { appToken, uuid, userId } = this.getAuthCredentials(account);
    const out: Record<string, PanDownloadItemLink> = {};

    await mapConcurrent(fids, 4, async (fid) => {
      const rawFileId = fid.startsWith(ILANZOU_CONSTANTS.FILE_PREFIX)
        ? fid.slice(ILANZOU_CONSTANTS.FILE_PREFIX.length)
        : fid;
      const ts = Date.now();
      const encTs = this.aesHex(String(ts));
      const reqUrl = this.buildPersonalUrl(
        '/unproved/file/redirect',
        uuid,
        appToken,
        false,
        [
          ['enable', '1'],
          ['downloadId', this.aesHex(`${rawFileId}|${userId}`)],
          ['auth', this.aesHex(`${rawFileId}|${ts}`)]
        ],
        encTs
      );

      const resp = await net.fetch(reqUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: this.commonHeaders(false)
      });

      const location = resp.headers.get('location');
      if (resp.status >= 300 && resp.status < 400 && location) {
        const resolved = new URL(location, ILANZOU_CONSTANTS.API_BASE).toString();
        out[fid] = {
          fid,
          url: resolved,
          filename: this.itemNameCache.get(fid),
          headers: {
            Referer: ILANZOU_CONSTANTS.DOWNLOAD_REFERER,
            Origin: ILANZOU_CONSTANTS.WEB_SITE,
            'User-Agent': ILANZOU_CONSTANTS.WEB_UA
          }
        };
        return;
      }

      const text = await resp.text();
      const json: any = JSON.parse(text);
      if (json?.code !== 200) {
        throw new Error(json?.msg || `蓝奏云优享版获取直链失败 (${json?.code})`);
      }
      const link = json?.url || json?.data?.url || '';
      if (!link) throw new Error('蓝奏云优享版未返回下载地址');
      out[fid] = {
        fid,
        url: link,
        filename: this.itemNameCache.get(fid),
        headers: {
          Referer: ILANZOU_CONSTANTS.DOWNLOAD_REFERER,
          Origin: ILANZOU_CONSTANTS.WEB_SITE,
          'User-Agent': ILANZOU_CONSTANTS.WEB_UA
        }
      };
    });

    return out;
  }

  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const { appToken, uuid } = this.getAuthCredentials(account);
    const rawParentId =
      parentFid && parentFid.startsWith(ILANZOU_CONSTANTS.FOLDER_PREFIX)
        ? parentFid.slice(ILANZOU_CONSTANTS.FOLDER_PREFIX.length)
        : parentFid || ILANZOU_CONSTANTS.ROOT_FOLDER_ID;
    const reqUrl = this.buildPersonalUrl('/proved/file/folder/save', uuid, appToken, true);
    const json = await this.execPersonal(reqUrl, {
      method: 'POST',
      headers: this.commonHeaders(true),
      body: JSON.stringify({
        folderDesc: '',
        folderId: rawParentId,
        folderName: name
      })
    });
    const newRawId = String(json?.list?.[0]?.id || '');
    if (!newRawId || newRawId === '0') {
      throw new Error('蓝奏云优享版未返回新文件夹信息');
    }
    const prefixed = `${ILANZOU_CONSTANTS.FOLDER_PREFIX}${newRawId}`;
    this.itemNameCache.set(prefixed, name);
    return { fid: prefixed, name };
  }

  async renameItem(
    fid: string,
    newName: string,
    account: PanAccount,
    extra?: { isDirectory?: boolean }
  ): Promise<boolean> {
    const { appToken, uuid } = this.getAuthCredentials(account);
    const isDir = fid.startsWith(ILANZOU_CONSTANTS.FOLDER_PREFIX) || !!extra?.isDirectory;
    if (isDir) {
      const rawId = fid.startsWith(ILANZOU_CONSTANTS.FOLDER_PREFIX)
        ? fid.slice(ILANZOU_CONSTANTS.FOLDER_PREFIX.length)
        : fid;
      const reqUrl = this.buildPersonalUrl('/proved/file/folder/edit', uuid, appToken, true);
      await this.execPersonal(reqUrl, {
        method: 'POST',
        headers: this.commonHeaders(true),
        body: JSON.stringify({ folderDesc: '', folderId: rawId, folderName: newName })
      });
    } else {
      const rawId = fid.startsWith(ILANZOU_CONSTANTS.FILE_PREFIX)
        ? fid.slice(ILANZOU_CONSTANTS.FILE_PREFIX.length)
        : fid;
      const reqUrl = this.buildPersonalUrl('/proved/file/edit', uuid, appToken, true);
      await this.execPersonal(reqUrl, {
        method: 'POST',
        headers: this.commonHeaders(true),
        body: JSON.stringify({ fileDesc: '', fileId: rawId, fileName: newName })
      });
    }
    this.itemNameCache.set(fid, newName);
    return true;
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const { appToken, uuid } = this.getAuthCredentials(account);
    const rawTargetId =
      targetDirFid && targetDirFid.startsWith(ILANZOU_CONSTANTS.FOLDER_PREFIX)
        ? targetDirFid.slice(ILANZOU_CONSTANTS.FOLDER_PREFIX.length)
        : targetDirFid || ILANZOU_CONSTANTS.ROOT_FOLDER_ID;

    const folderIds: string[] = [];
    const fileIds: string[] = [];
    for (const fid of fids) {
      if (fid.startsWith(ILANZOU_CONSTANTS.FOLDER_PREFIX)) {
        folderIds.push(fid.slice(ILANZOU_CONSTANTS.FOLDER_PREFIX.length));
      } else if (fid.startsWith(ILANZOU_CONSTANTS.FILE_PREFIX)) {
        fileIds.push(fid.slice(ILANZOU_CONSTANTS.FILE_PREFIX.length));
      } else {
        fileIds.push(fid);
      }
    }

    const reqUrl = this.buildPersonalUrl('/proved/file/folder/move', uuid, appToken, true);
    await this.execPersonal(reqUrl, {
      method: 'POST',
      headers: this.commonHeaders(true),
      body: JSON.stringify({
        folderIds: folderIds.join(','),
        fileIds: fileIds.join(','),
        targetId: rawTargetId
      })
    });
    return true;
  }

  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const { appToken, uuid } = this.getAuthCredentials(account);
    const folderIds: string[] = [];
    const fileIds: string[] = [];
    for (const fid of fids) {
      if (fid.startsWith(ILANZOU_CONSTANTS.FOLDER_PREFIX)) {
        folderIds.push(fid.slice(ILANZOU_CONSTANTS.FOLDER_PREFIX.length));
      } else if (fid.startsWith(ILANZOU_CONSTANTS.FILE_PREFIX)) {
        fileIds.push(fid.slice(ILANZOU_CONSTANTS.FILE_PREFIX.length));
      } else {
        fileIds.push(fid);
      }
    }

    const reqUrl = this.buildPersonalUrl('/proved/file/delete', uuid, appToken, true);
    await this.execPersonal(reqUrl, {
      method: 'POST',
      headers: this.commonHeaders(true),
      body: JSON.stringify({
        folderIds: folderIds.join(','),
        fileIds: fileIds.join(','),
        status: 0
      })
    });
    return true;
  }

  async getQuota(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    try {
      const { appToken, uuid } = this.getAuthCredentials(account);
      const reqUrl = this.buildPersonalUrl('/proved/user/account/map', uuid, appToken, true);
      const json = await this.execPersonal(reqUrl, { headers: this.commonHeaders(false) });
      const map = json?.map;
      if (!map) return null;
      const used = Math.round(Number(map.usedSize || 0) * 1024);
      const total = Math.round((Number(map.totalSize || 0) + Number(map.vipSize || 0) + Number(map.rewardSize || 0)) * 1024);
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
