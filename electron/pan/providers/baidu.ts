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
import { logger } from '../../logger';
import { buildCookieHeader, formatPanBytes, inferFormatType, mapConcurrent, sleep } from '../utils';
import { toBaiduPeriod } from '../shareExpire';

/**
 * 百度网盘 API 常量（严格依据 YunX-Desktop BaiduConstants.kt 与抓包文档）
 */
export const BAIDU_CONSTANTS = {
  APP_ID: '250528',
  UA_WEB:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  UA_NETDISK:
    'netdisk;12.24.6;piano;android-android;16;JSbridge4.4.0;jointBridge;1.1.0',
  SHARE_VERIFY_URL: 'https://pan.baidu.com/share/verify',
  XPAN_SHARE_LIST_URL: 'https://pan.baidu.com/rest/2.0/xpan/share?method=list',
  LOCATEDOWNLOAD_URL: 'https://d.pcs.baidu.com/rest/2.0/pcs/file',
  FILEMETAS_URL: 'https://pan.baidu.com/api/filemetas',
  FILE_LIST_URL: 'https://pan.baidu.com/api/list',
  FILE_CREATE_URL: 'https://pan.baidu.com/api/create',
  SHARE_TRANSFER_URL: 'https://pan.baidu.com/share/transfer',
  SHARE_SET_URL: 'https://pan.baidu.com/share/set',
  QUOTA_URL: 'https://pan.baidu.com/api/quota',
  FILEMANAGER_URL: 'https://pan.baidu.com/api/filemanager',
  GET_TEMPLATE_VARIABLE_URL: 'https://pan.baidu.com/api/gettemplatevariable',
  TEMP_DIR_NAME: 'Velora临时转存'
};

export class BaiduProvider implements PanProvider, PanDriveProvider {
  panType = 'baidu' as const;

  private bdstokenCache = new Map<string, string>();
  private pathFsIdCache = new Map<string, string>();
  private ensureTempDirPromise: Promise<string> | null = null;

  private formatSekey(sekey: string): string {
    if (!sekey) return '';
    return sekey.includes('%') ? sekey : encodeURIComponent(sekey);
  }

  private async ensureTempDir(account: PanAccount, cookieHeader: string): Promise<string> {
    if (this.ensureTempDirPromise) {
      return this.ensureTempDirPromise;
    }
    const targetDir = `/${BAIDU_CONSTANTS.TEMP_DIR_NAME}`;
    this.ensureTempDirPromise = (async () => {
      try {
        const listed = await this.listFiles('/', account);
        const existing = listed.files.find(
          (f) => f.isDirectory && (f.id === targetDir || f.name === BAIDU_CONSTANTS.TEMP_DIR_NAME)
        );
        if (existing) {
          return targetDir;
        }
      } catch {}

      try {
        const created = await this.createFolder('/', BAIDU_CONSTANTS.TEMP_DIR_NAME, account);
        if (created.fid) {
          return created.fid;
        }
      } catch (err: any) {
        logger.warn('BaiduProvider', `创建临时目录 ${targetDir} 失败，回退根目录: ${err?.message}`);
      }
      return '/';
    })().finally(() => {
      this.ensureTempDirPromise = null;
    });
    void cookieHeader;
    return this.ensureTempDirPromise;
  }

  canHandle(url: string): boolean {
    if (!url) return false;
    return url.toLowerCase().includes('pan.baidu.com');
  }

  private extractSurl(url: string): string {
    const match = url.match(/\/s\/1([a-zA-Z0-9_-]+)/) || url.match(/surl=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : '';
  }

  /**
   * 获取或刷新 bdstoken（基于 gettemplatevariable，按 cookie 隔离缓存）
   */
  async getBdstoken(cookie: string, forceRefresh = false): Promise<string | null> {
    if (!cookie) return null;
    if (!forceRefresh) {
      const cached = this.bdstokenCache.get(cookie);
      if (cached) return cached;
    } else {
      this.bdstokenCache.delete(cookie);
    }
    try {
      const url = `${BAIDU_CONSTANTS.GET_TEMPLATE_VARIABLE_URL}?clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1&fields=%5B%22bdstoken%22%5D`;
      const resp = await net.fetch(url, {
        headers: {
          Cookie: cookie,
          'User-Agent': BAIDU_CONSTANTS.UA_WEB
        }
      });
      const json: any = await resp.json();
      if (json && json.errno === 0 && json.result?.bdstoken) {
        if (this.bdstokenCache.size >= 20) {
          this.bdstokenCache.clear();
        }
        this.bdstokenCache.set(cookie, json.result.bdstoken);
        return json.result.bdstoken;
      }
    } catch (e: any) {
      logger.warn('BaiduProvider', `获取 bdstoken 异常: ${e.message}`);
    }
    return null;
  }

  private async fetchBaiduJson(url: string, init: RequestInit): Promise<any> {
    let lastJson: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await net.fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          ...(attempt > 0 ? { Accept: '*/*', 'Accept-Language': 'zh-CN,zh;q=0.9' } : {})
        }
      });
      lastJson = await resp.json();
      if (lastJson?.errno !== 8888) {
        return lastJson;
      }
      await sleep(2000);
    }
    return lastJson;
  }

  /**
   * 1. 分享解析（支持提取码验证 + 递归展开完整目录树，对齐 YunX BaiduApi.listShare）
   */
  private buildShareCookie(cookieHeader: string, sekey: string): string {
    const cleanParts = (cookieHeader || '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^BDCLND=/i.test(s));
    if (sekey) {
      cleanParts.push(`BDCLND=${this.formatSekey(sekey)}`);
    }
    return cleanParts.join('; ');
  }

  async parse(url: string, password = '', account?: PanAccount): Promise<PanParseResult> {
    const surl = this.extractSurl(url);
    if (!surl) {
      return {
        panType: 'baidu',
        shareTitle: '百度网盘',
        files: [],
        error: '无效的百度网盘分享链接'
      };
    }

    logger.info('BaiduProvider', `开始解析百度网盘分享: surl=${surl}`);

    const cookieHeader = buildCookieHeader(account?.cookies);

    try {
      // 1. 验证提取码以换取 randsk（sekey 已是 URL 编码形式，原样保存）
      let sekey = '';
      if (password) {
        const verifyJson: any = await this.fetchBaiduJson(
          `${BAIDU_CONSTANTS.SHARE_VERIFY_URL}?surl=${encodeURIComponent(surl)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Cookie: cookieHeader,
              'User-Agent': BAIDU_CONSTANTS.UA_WEB,
              Referer: `https://pan.baidu.com/s/${surl}`
            },
            body: `pwd=${encodeURIComponent(password)}&vcode_str=&vcode=`
          }
        );
        if (verifyJson && verifyJson.errno === 0 && verifyJson.randsk) {
          sekey = String(verifyJson.randsk);
        } else if (verifyJson && verifyJson.errno !== 0) {
          return {
            panType: 'baidu',
            shareTitle: '百度网盘',
            files: [],
            error: verifyJson.show_msg || verifyJson.errmsg || '提取码错误'
          };
        }
      }

      // 2. 递归拉取分享列表所有子目录和文件
      const allFiles: PanFileItem[] = [];
      let shareTitle = '百度网盘分享文件';
      let shareid = '';
      let uk = '';

      const scanDirectory = async (dirPath: string, relativePrefix: string, isRoot: boolean): Promise<void> => {
        let page = 1;
        let hasMore = true;
        const subDirs: Array<{ dirPath: string; path: string }> = [];

        while (hasMore) {
          const rootParam = isRoot ? '1' : '0';
          const sekeyParam = sekey ? `&sekey=${this.formatSekey(sekey)}` : '';
          const effectiveDir = isRoot ? '/' : dirPath || '/';
          const listUrl = `${BAIDU_CONSTANTS.XPAN_SHARE_LIST_URL}&shorturl=${encodeURIComponent(
            surl
          )}&page=${page}&num=100&root=${rootParam}&dir=${encodeURIComponent(effectiveDir)}${sekeyParam}`;

          const authCookie = this.buildShareCookie(cookieHeader, sekey);

          const json: any = await this.fetchBaiduJson(listUrl, {
            headers: {
              Cookie: authCookie,
              'User-Agent': BAIDU_CONSTANTS.UA_WEB,
              Referer: `https://pan.baidu.com/s/${surl}`
            }
          });
          const errno = json?.errno;
          if (errno !== 0) {
            if (sekey === '' && (errno === 2 || errno === -6 || errno === -9)) {
              throw new Error(
                errno === -6
                  ? '该分享需要提取码，或需要登录百度网盘 (errno=-6)'
                  : `该分享需要提取码，请输入提取码后再试 (errno=${errno})`
              );
            }
            if (errno === -9) {
              throw new Error('提取码错误，请检查后重试');
            }
            throw new Error(json?.show_msg || json?.err_msg || json?.errmsg || `获取分享列表失败 (errno=${errno})`);
          }

          if (isRoot) {
            if (json.title) shareTitle = json.title;
            if (json.share_id || json.shareid) shareid = String(json.share_id || json.shareid);
            if (json.uk) uk = String(json.uk);
          }

          const list = json.list || [];
          if (!Array.isArray(list) || list.length === 0) {
            break;
          }

          for (const item of list) {
            const isDir = String(item.isdir) === '1';
            const name = item.server_filename || '未知文件';
            const itemRelativePath = relativePrefix ? `${relativePrefix}/${name}` : name;

            if (isDir) {
              subDirs.push({ dirPath: item.path, path: itemRelativePath });
            } else {
              allFiles.push({
                id: String(item.fs_id),
                name,
                path: itemRelativePath,
                size: typeof item.size === 'number' ? item.size : parseInt(item.size, 10) || 0,
                isDirectory: false,
                downloadUrl: undefined,
                rawInfo: {
                  fid: String(item.fs_id),
                  fidToken: item.path || '',
                  pwdId: `${surl}|${shareid}|${uk}`,
                  stoken: sekey,
                  fs_id: item.fs_id,
                  name,
                  size: typeof item.size === 'number' ? item.size : parseInt(item.size, 10) || 0,
                  path: item.path,
                  surl,
                  sekey,
                  shareid,
                  uk
                }
              });
            }
          }

          if (list.length < 100) {
            hasMore = false;
          } else {
            page++;
          }
        }

        if (subDirs.length > 0) {
          await mapConcurrent(subDirs, 3, async (sub) => {
            await scanDirectory(sub.dirPath, sub.path, false);
          });
        }
      };

      await scanDirectory('/', '', true);

      return {
        panType: 'baidu',
        shareTitle: shareTitle || (allFiles.length > 0 ? allFiles[0].name : '百度网盘资源'),
        files: allFiles
      };
    } catch (err: any) {
      logger.error('BaiduProvider', `解析异常: ${err.message}`);
      return {
        panType: 'baidu',
        shareTitle: '百度网盘',
        files: [],
        error: `百度网盘解析异常: ${err.message}`
      };
    }
  }

  /**
   * 2. 分享文件取下载直链（对齐 YunX BaiduApi：优先已登录态临时转存 + locatedownload 高速明文直链 + cleanupDirFid）
   */
  async getShareDownloadUrlsDetail(
    items: PanShareDownloadItem[],
    account?: PanAccount
  ): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!items || items.length === 0) return result;

    const cookieHeader = buildCookieHeader(account?.cookies);
    const downloadHeaders: Record<string, string> = {
      'User-Agent': BAIDU_CONSTANTS.UA_NETDISK
    };
    if (cookieHeader) {
      downloadHeaders['Cookie'] = cookieHeader;
    }

    // 登录态下按 share 批次临时转存至 /Velora临时转存 -> locatedownload 取高速 encrypt=0 明文 CDN 直链 -> 立即删除临时转存文件
    const fallbackItems: PanShareDownloadItem[] = [];
    if (cookieHeader && account) {
      const groups = new Map<string, PanShareDownloadItem[]>();
      for (const item of items) {
        const pwdId = item.pwdId || item.extra?.pwdId || '';
        const stoken = item.stoken || item.extra?.stoken || '';
        const key = `${pwdId}\0${stoken}`;
        const arr = groups.get(key) || [];
        arr.push(item);
        groups.set(key, arr);
      }

      const tempDirPath = await this.ensureTempDir(account, cookieHeader);
      let lastTransferError = '';
      for (const group of Array.from(groups.values())) {
        const [, shareid, uk] = (group[0].pwdId || group[0].extra?.pwdId || '').split('|');
        const sekey = group[0].stoken || group[0].extra?.stoken || '';
        if (!shareid || !uk) {
          fallbackItems.push(...group);
          continue;
        }
        const transferredPaths: string[] = [];
        try {
          const transferred = await this.transferInternal(
            shareid,
            uk,
            sekey,
            group.map((it) => String(it.extra?.fs_id || it.fid)),
            tempDirPath,
            cookieHeader
          );
          for (const t of transferred) {
            if (t.path) transferredPaths.push(t.path);
          }

          const usedPaths = new Set<string>();
          await mapConcurrent(group, 4, async (orig, idx) => {
            const origFsId = String(orig.extra?.fs_id || orig.fid);
            const matched =
              transferred.find((t) => t.fromFsId === origFsId && t.path && !usedPaths.has(t.path)) ||
              (transferred[idx]?.path && !usedPaths.has(transferred[idx].path) ? transferred[idx] : undefined);
            const targetPath = matched?.path || '';
            if (!targetPath) {
              fallbackItems.push(orig);
              return;
            }
            usedPaths.add(targetPath);
            const located = await this.locateDownloadByPath(targetPath, cookieHeader);
            if (located?.url) {
              result[orig.fid] = {
                fid: orig.fid,
                url: located.url,
                size: orig.extra?.size || located.size,
                filename: orig.extra?.name || located.filename,
                headers: downloadHeaders
              };
            } else {
              fallbackItems.push(orig);
            }
          });
        } catch (err: any) {
          lastTransferError = err?.message || '百度临时转存失败';
          logger.warn('BaiduProvider', `百度临时转存高速取链失败: ${lastTransferError}`);
          fallbackItems.push(...group);
        } finally {
          // appall 直链自带签名，不依赖云端转存文件存活；取链完成后立即删除本次转存文件，网盘零残留
          if (transferredPaths.length > 0) {
            await this.deleteFiles(transferredPaths, account).catch(() => {});
          }
        }
      }

      if (Object.keys(result).length === 0 && fallbackItems.length > 0 && lastTransferError) {
        throw new Error(lastTransferError);
      }
    } else {
      throw new Error('百度网盘未登录且无法匿名取链，请在设置中登录百度网盘账号');
    }

    if (Object.keys(result).length === 0) {
      throw new Error('未能获取到百度网盘有效下载直链，请检查分享状态或账号登录态');
    }

    return result;
  }

  async getShareDownloadUrls(
    items: PanShareDownloadItem[],
    account?: PanAccount
  ): Promise<Record<string, string>> {
    const detail = await this.getShareDownloadUrlsDetail(items, account);
    const result: Record<string, string> = {};
    for (const [fid, link] of Object.entries(detail)) {
      result[fid] = link.url;
    }
    return result;
  }

  /**
   * 3. 个人网盘列出目录文件（对齐 YunX BaiduApi.listCloudFiles，返回完整云端路径作为 id，缓存 fs_id）
   */
  async listFiles(pdirFid = '0', account: PanAccount): Promise<PanDriveListResult> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const targetDir = !pdirFid || pdirFid === '0' ? '/' : pdirFid;

    try {
      const files: PanDriveItem[] = [];
      const seen = new Set<string>();
      let page = 1;
      const maxPages = 20;
      let bdstoken = await this.getBdstoken(cookieHeader);

      while (page <= maxPages) {
        const bdstokenPart = bdstoken ? `&bdstoken=${encodeURIComponent(bdstoken)}` : '';
        const url = `${BAIDU_CONSTANTS.FILE_LIST_URL}?clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1&channel=chunlei&showempty=0&order=time&desc=1&dir=${encodeURIComponent(
          targetDir
        )}&num=100&page=${page}${bdstokenPart}`;

        let json: any = await this.fetchBaiduJson(url, {
          headers: {
            Cookie: cookieHeader,
            'User-Agent': BAIDU_CONSTANTS.UA_WEB,
            Accept: '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: 'https://pan.baidu.com/disk/main'
          }
        });
        if (json?.errno === -6) {
          bdstoken = await this.getBdstoken(cookieHeader, true);
          const refreshedUrl = `${BAIDU_CONSTANTS.FILE_LIST_URL}?clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1&channel=chunlei&showempty=0&order=time&desc=1&dir=${encodeURIComponent(
            targetDir
          )}&num=100&page=${page}${bdstoken ? `&bdstoken=${encodeURIComponent(bdstoken)}` : ''}`;
          json = await this.fetchBaiduJson(refreshedUrl, {
            headers: {
              Cookie: cookieHeader,
              'User-Agent': BAIDU_CONSTANTS.UA_WEB,
              Accept: '*/*',
              'X-Requested-With': 'XMLHttpRequest',
              Referer: 'https://pan.baidu.com/disk/main'
            }
          });
        }

        if (!json || json.errno !== 0) {
          throw new Error(json?.errmsg || `获取目录失败 (errno=${json?.errno})`);
        }

        const rawList = json.list || [];
        if (!Array.isArray(rawList) || rawList.length === 0) break;

        let newCount = 0;
        for (const item of rawList) {
          const itemId = item.path || String(item.fs_id);
          if (!itemId || seen.has(itemId)) continue;
          seen.add(itemId);
          newCount++;
          const isDir = String(item.isdir) === '1';
          const fsIdStr = item.fs_id !== undefined ? String(item.fs_id) : '';
          if (item.path && fsIdStr) {
            this.pathFsIdCache.set(item.path, fsIdStr);
          }
          files.push({
            id: itemId,
            name: item.server_filename,
            pdir_fid: targetDir,
            size: typeof item.size === 'number' ? item.size : parseInt(item.size, 10) || 0,
            isDirectory: isDir,
            updatedAt: (item.server_mtime || 0) * 1000,
            formatType: inferFormatType(item.server_filename || '', isDir),
            downloadUrl: item.dlink || undefined,
            extra: fsIdStr ? { fs_id: fsIdStr } : undefined
          });
        }

        if (newCount === 0 || rawList.length < 100) break;
        page++;
      }

      return {
        files,
        total: files.length,
        pdir_fid: targetDir
      };
    } catch (err: any) {
      logger.error('BaiduProvider', `列出个人文件失败: ${err.message}`);
      throw err;
    }
  }

  /**
   * 4. 个人网盘获取高速直链（对齐 YunX BaiduApi.locateDownload，筛选 encrypt=0 的明文直链）
   */
  async getDriveDownloadUrl(fid: string, account: PanAccount): Promise<string> {
    const urls = await this.getBatchDownloadUrls([fid], account);
    return urls[fid] || '';
  }

  async getBatchDownloadUrlsDetail(fids: string[], account: PanAccount): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!fids || fids.length === 0) return result;

    const cookieHeader = buildCookieHeader(account?.cookies);

    const downloadHeaders: Record<string, string> = {
      'User-Agent': BAIDU_CONSTANTS.UA_NETDISK,
      Cookie: cookieHeader
    };

    await mapConcurrent(fids, 4, async (fid) => {
      if (!fid) return;
      let link: { url: string; size?: number; filename?: string } | null = null;
      if (fid.startsWith('/')) {
        link = await this.locateDownloadByPath(fid, cookieHeader);
        if (!link) {
          const cachedFsId = this.pathFsIdCache.get(fid);
          if (cachedFsId) {
            link = await this.locateDownloadByFsId(cachedFsId, cookieHeader);
          }
        }
      } else if (/^\d+$/.test(fid)) {
        link = await this.locateDownloadByFsId(fid, cookieHeader);
      }
      if (link) {
        result[fid] = {
          fid,
          url: link.url,
          size: link.size,
          filename: link.filename,
          headers: downloadHeaders
        };
      }
    });
    return result;
  }

  async getBatchDownloadUrls(fids: string[], account: PanAccount): Promise<Record<string, string>> {
    const detail = await this.getBatchDownloadUrlsDetail(fids, account);
    const result: Record<string, string> = {};
    for (const [fid, link] of Object.entries(detail)) {
      result[fid] = link.url;
    }
    return result;
  }

  /**
   * 内部方法：通过 locatedownload 按路径获取明文直链（严格对齐 YunX BaiduApi.locateDownload POST 协议）
   */
  private async locateDownloadByPath(
    filePath: string,
    cookie: string
  ): Promise<{ url: string; size?: number; filename?: string } | null> {
    try {
      const time = Math.floor(Date.now() / 1000);
      const url =
        `${BAIDU_CONSTANTS.LOCATEDOWNLOAD_URL}?method=locatedownload` +
        `&app_id=${BAIDU_CONSTANTS.APP_ID}` +
        `&clienttype=17&ver=4.0` +
        `&ant=1&check_blue=1&es=1&esl=1&apn_id=1_-1` +
        `&freeisp=0&queryfree=0&use=1&dtype=1&eck=1&ehps=1` +
        `&err_ver=1.0&network_type=WIFI&channel=0` +
        `&path=${encodeURIComponent(filePath)}` +
        `&time=${time}` +
        `&rand=5ed606e9da222cde0474cdf70eda884b` +
        `&devuid=0F1E9FC2E084472DA5A61C4CF4C759AF` +
        `&cuid=0F1E9FC2E084472DA5A61C4CF4C759AF` +
        `&deviceid=348642637967375013` +
        `&psign=860a071f77c860e8cea06e4e54c518f3` +
        `&version=2.2.111.34&version_app=12.24.6&vip=0`;

      const json: any = await this.fetchBaiduJson(url, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'User-Agent': BAIDU_CONSTANTS.UA_NETDISK,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: '0'
      });

      if (json && json.errno === 0 && Array.isArray(json.urls) && json.urls.length > 0) {
        const candidates = json.urls.filter((u: any) => u?.url);
        const plainHttps = candidates.find((u: any) => Number(u?.encrypt ?? 1) === 0 && String(u.url).startsWith('https'));
        const plainAny = candidates.find((u: any) => Number(u?.encrypt ?? 1) === 0);
        const anyHttps = candidates.find((u: any) => String(u.url).startsWith('https'));
        const chosen = plainHttps || plainAny || anyHttps || candidates[0];
        if (chosen?.url) {
          return {
            url: chosen.url,
            size: typeof json.size === 'number' ? json.size : undefined,
            filename: filePath.split('/').pop()
          };
        }
      }
    } catch (e: any) {
      logger.warn('BaiduProvider', `locatedownload 取链失败 (${filePath}): ${e.message}`);
    }
    return null;
  }

  /**
   * 内部方法：通过 filemetas 或 locatedownload 获取明文 CDN 直链
   */
  private async locateDownloadByFsId(
    fsId: string,
    cookie: string
  ): Promise<{ url: string; size?: number; filename?: string } | null> {
    try {
      const bdstoken = await this.getBdstoken(cookie);
      const numericId = Number(fsId);
      const fsidsJson = JSON.stringify([Number.isNaN(numericId) ? fsId : numericId]);
      const url = `${BAIDU_CONSTANTS.FILEMETAS_URL}?dlink=1&fsids=${encodeURIComponent(
        fsidsJson
      )}&bdstoken=${bdstoken || ''}&clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1`;

      const resp = await net.fetch(url, {
        headers: {
          Cookie: cookie,
          'User-Agent': BAIDU_CONSTANTS.UA_WEB
        }
      });
      const json: any = await resp.json();
      if (json && json.errno === 0 && Array.isArray(json.info) && json.info.length > 0) {
        const item = json.info[0];
        if (item.path) {
          const located = await this.locateDownloadByPath(item.path, cookie);
          if (located) {
            return {
              url: located.url,
              size: typeof item.size === 'number' ? item.size : parseInt(item.size, 10) || located.size,
              filename: item.server_filename || located.filename
            };
          }
        }
        if (item.dlink) {
          return {
            url: item.dlink,
            size: typeof item.size === 'number' ? item.size : parseInt(item.size, 10) || undefined,
            filename: item.server_filename
          };
        }
      }
    } catch (e: any) {
      logger.warn('BaiduProvider', `filemetas 取链失败: ${e.message}`);
    }
    return null;
  }

  /**
   * 5. 删除个人网盘文件（对齐 YunX BaiduApi.deleteFile）
   */
  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const cookieHeader = buildCookieHeader(account?.cookies);
    let bdstoken = await this.getBdstoken(cookieHeader);
    if (!bdstoken) {
      throw new Error('获取百度 bdstoken 失败，请重新登录');
    }

    const body = `filelist=${encodeURIComponent(JSON.stringify(fids))}`;
    const doReq = async (tok: string) => {
      const url = `${BAIDU_CONSTANTS.FILEMANAGER_URL}?async=2&onnest=fail&opera=delete&bdstoken=${encodeURIComponent(
        tok
      )}&newVerify=1&clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1`;
      return this.fetchBaiduJson(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Cookie: cookieHeader,
          'User-Agent': BAIDU_CONSTANTS.UA_WEB,
          Referer: 'https://pan.baidu.com/disk/main'
        },
        body
      });
    };

    let json: any = await doReq(bdstoken);
    if (json?.errno === -6) {
      const refreshed = await this.getBdstoken(cookieHeader, true);
      if (refreshed) json = await doReq(refreshed);
    }
    if (!json || json.errno !== 0) {
      throw new Error(json?.errmsg || `删除百度网盘文件失败 (errno=${json?.errno})`);
    }
    for (const fid of fids) {
      this.pathFsIdCache.delete(fid);
    }
    return true;
  }

  /**
   * 6. 刷新获取网盘容量信息（对齐 YunX BaiduApi.getQuota）
   */
  async getQuota(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    if (!cookieHeader) return null;

    try {
      const resp = await net.fetch(
        `${BAIDU_CONSTANTS.QUOTA_URL}?clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1&channel=chunlei&version=${Date.now()}`,
        {
          headers: {
            Cookie: cookieHeader,
            'User-Agent': BAIDU_CONSTANTS.UA_WEB,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: 'https://pan.baidu.com/disk/main'
          }
        }
      );
      const json: any = await resp.json();
      if (json && json.errno === 0) {
        const total = json.total || 0;
        const used = json.used || 0;
        return {
          used,
          total,
          quotaText: `${formatPanBytes(used)} / ${formatPanBytes(total)}`
        };
      }
    } catch (e: any) {
      logger.warn('BaiduProvider', `获取百度容量失败: ${e.message}`);
    }
    return null;
  }

  private async transferInternal(
    shareId: string,
    uk: string,
    sekey: string,
    fsIds: string[],
    toDir: string,
    cookie: string
  ): Promise<Array<{ fromFsId: string; fsId: string; path: string }>> {
    let bdstoken = await this.getBdstoken(cookie);
    if (!bdstoken) {
      throw new Error('获取百度 bdstoken 失败，请重新登录');
    }
    const authCookie = this.buildShareCookie(cookie, sekey);
    const fsidListStr = `[${fsIds.map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id)).join(',')}]`;
    const body = `fsidlist=${encodeURIComponent(fsidListStr)}&path=${encodeURIComponent(toDir)}`;

    const doReq = async (tok: string) => {
      const url =
        `${BAIDU_CONSTANTS.SHARE_TRANSFER_URL}?shareid=${encodeURIComponent(shareId)}&from=${encodeURIComponent(uk)}` +
        `&channel=chunlei&sekey=${this.formatSekey(sekey)}&ondup=newcopy&web=1&app_id=${BAIDU_CONSTANTS.APP_ID}` +
        `&bdstoken=${encodeURIComponent(tok)}&clienttype=0`;
      return this.fetchBaiduJson(url, {
        method: 'POST',
        headers: {
          Cookie: authCookie,
          'User-Agent': BAIDU_CONSTANTS.UA_WEB,
          Origin: 'https://pan.baidu.com',
          Referer: 'https://pan.baidu.com/s/',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body
      });
    };

    let json: any = await doReq(bdstoken);
    if (json?.errno === -6) {
      const refreshed = await this.getBdstoken(cookie, true);
      if (refreshed) json = await doReq(refreshed);
    }
    if (!json || json.errno !== 0) {
      throw new Error(json?.show_msg || json?.err_msg || `百度转存失败 (errno=${json?.errno})`);
    }
    const list = json?.extra?.list;
    if (!Array.isArray(list)) return [];
    return list.map((it: any) => ({
      fromFsId: String(it?.from_fs_id || ''),
      fsId: String(it?.to_fs_id || ''),
      path: it?.to ? String(it.to) : ''
    }));
  }

  async saveShareItems(
    items: PanShareDownloadItem[],
    targetDirFid: string,
    account: PanAccount
  ): Promise<{ savedCount: number }> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    if (!cookieHeader) {
      throw new Error('请先登录百度网盘账号');
    }
    const targetDir = !targetDirFid || targetDirFid === '0' ? '/' : targetDirFid;
    const groups = new Map<string, PanShareDownloadItem[]>();
    for (const item of items) {
      const pwdId = item.pwdId || item.extra?.pwdId || '';
      const stoken = item.stoken || item.extra?.stoken || '';
      const key = `${pwdId}\0${stoken}`;
      const arr = groups.get(key) || [];
      arr.push(item);
      groups.set(key, arr);
    }

    let savedCount = 0;
    for (const group of Array.from(groups.values())) {
      const [, shareid, uk] = (group[0].pwdId || group[0].extra?.pwdId || '').split('|');
      const sekey = group[0].stoken || group[0].extra?.stoken || '';
      if (!shareid || !uk) {
        throw new Error('百度分享元数据缺失，请重新解析链接后再转存');
      }
      await this.transferInternal(
        shareid,
        uk,
        sekey,
        group.map((it) => String(it.extra?.fs_id || it.fid)),
        targetDir,
        cookieHeader
      );
      savedCount += group.length;
    }
    return { savedCount };
  }

  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const parent = !parentFid || parentFid === '0' ? '/' : parentFid.replace(/\/+$/, '');
    const fullPath = parent === '/' ? `/${name}` : `${parent}/${name}`;
    let bdstoken = await this.getBdstoken(cookieHeader);
    if (!bdstoken) throw new Error('获取百度 bdstoken 失败，请重新登录');

    const doReq = async (tok: string) => {
      const url = `https://pan.baidu.com/api/create?a=commit&channel=chunlei&web=1&app_id=${BAIDU_CONSTANTS.APP_ID}&clienttype=0&bdstoken=${encodeURIComponent(tok)}`;
      const body = `path=${encodeURIComponent(fullPath)}&isdir=1&size&block_list=%5B%5D&method=post&dataType=json`;
      return this.fetchBaiduJson(url, {
        method: 'POST',
        headers: {
          Cookie: cookieHeader,
          'User-Agent': BAIDU_CONSTANTS.UA_WEB,
          Referer: 'https://pan.baidu.com/disk/main',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body
      });
    };

    let json: any = await doReq(bdstoken);
    if (json?.errno === -6) {
      const refreshed = await this.getBdstoken(cookieHeader, true);
      if (refreshed) json = await doReq(refreshed);
    }
    if (!json || json.errno !== 0) {
      throw new Error(json?.errmsg || `百度新建文件夹失败 (errno=${json?.errno})`);
    }
    const createdPath = json.path || fullPath;
    if (json.fs_id) {
      this.pathFsIdCache.set(createdPath, String(json.fs_id));
    }
    return { fid: createdPath, name };
  }

  async renameItem(fid: string, newName: string, account: PanAccount): Promise<boolean> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    let bdstoken = await this.getBdstoken(cookieHeader);
    if (!bdstoken) throw new Error('获取百度 bdstoken 失败，请重新登录');
    const filelist = JSON.stringify([{ path: fid, newname: newName }]);
    const body = `filelist=${encodeURIComponent(filelist)}`;

    const doReq = async (tok: string) => {
      const url = `${BAIDU_CONSTANTS.FILEMANAGER_URL}?async=0&onnest=fail&opera=rename&bdstoken=${encodeURIComponent(tok)}&clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1`;
      return this.fetchBaiduJson(url, {
        method: 'POST',
        headers: {
          Cookie: cookieHeader,
          'User-Agent': BAIDU_CONSTANTS.UA_WEB,
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://pan.baidu.com/disk/main'
        },
        body
      });
    };

    let json: any = await doReq(bdstoken);
    if (json?.errno === -6) {
      const refreshed = await this.getBdstoken(cookieHeader, true);
      if (refreshed) json = await doReq(refreshed);
    }
    if (!json || json.errno !== 0) {
      throw new Error(json?.errmsg || `百度重命名失败 (errno=${json?.errno})`);
    }
    this.pathFsIdCache.delete(fid);
    return true;
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const cookieHeader = buildCookieHeader(account?.cookies);
    let bdstoken = await this.getBdstoken(cookieHeader);
    if (!bdstoken) throw new Error('获取百度 bdstoken 失败，请重新登录');
    const dest = !targetDirFid || targetDirFid === '0' ? '/' : targetDirFid;
    const payload = fids.map((p) => ({
      path: p,
      dest,
      newname: p.split('/').pop() || p
    }));
    const body = `filelist=${encodeURIComponent(JSON.stringify(payload))}`;

    const doReq = async (tok: string) => {
      const url = `${BAIDU_CONSTANTS.FILEMANAGER_URL}?async=2&onnest=fail&opera=move&bdstoken=${encodeURIComponent(tok)}&clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1`;
      return this.fetchBaiduJson(url, {
        method: 'POST',
        headers: {
          Cookie: cookieHeader,
          'User-Agent': BAIDU_CONSTANTS.UA_WEB,
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://pan.baidu.com/disk/main'
        },
        body
      });
    };

    let json: any = await doReq(bdstoken);
    if (json?.errno === -6) {
      const refreshed = await this.getBdstoken(cookieHeader, true);
      if (refreshed) json = await doReq(refreshed);
    }
    if (!json || json.errno !== 0) {
      throw new Error(json?.errmsg || `百度移动文件失败 (errno=${json?.errno})`);
    }
    for (const fid of fids) {
      this.pathFsIdCache.delete(fid);
    }
    return true;
  }

  async createShare(params: PanCreateShareParams, account: PanAccount): Promise<PanShareCreatedInfo> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    let bdstoken = await this.getBdstoken(cookieHeader);
    if (!bdstoken) throw new Error('获取百度 bdstoken 失败，请重新登录');

    const period = toBaiduPeriod(params.expireType);
    let pwd = (params.passcode || '').trim();
    if (!pwd) {
      const pool = 'abcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < 4; i++) {
        pwd += pool[Math.floor(Math.random() * pool.length)];
      }
    }

    // 解析出所有条目的 numeric fs_id
    const fsIds: string[] = [];
    for (const fidOrPath of params.fids) {
      if (/^\d+$/.test(fidOrPath)) {
        fsIds.push(fidOrPath);
        continue;
      }
      let cached = this.pathFsIdCache.get(fidOrPath);
      if (!cached && fidOrPath.includes('/')) {
        const lastSlash = fidOrPath.lastIndexOf('/');
        const parent = lastSlash > 0 ? fidOrPath.slice(0, lastSlash) : '/';
        await this.listFiles(parent, account).catch(() => null);
        cached = this.pathFsIdCache.get(fidOrPath);
      }
      if (cached) fsIds.push(cached);
    }
    if (fsIds.length === 0) {
      throw new Error('无法识别所选文件的百度 fs_id，请刷新目录后重试');
    }

    const fidListStr = `[${fsIds.join(',')}]`;
    const body = `fid_list=${encodeURIComponent(fidListStr)}&schannel=4&channel_list=%5B%5D&period=${period}&pwd=${encodeURIComponent(pwd)}`;

    const doReq = async (tok: string) => {
      const url = `${BAIDU_CONSTANTS.SHARE_SET_URL}?channel=chunlei&web=1&app_id=${BAIDU_CONSTANTS.APP_ID}&bdstoken=${encodeURIComponent(tok)}&clienttype=0`;
      return this.fetchBaiduJson(url, {
        method: 'POST',
        headers: {
          Cookie: cookieHeader,
          'User-Agent': BAIDU_CONSTANTS.UA_WEB,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: 'https://pan.baidu.com/disk/main'
        },
        body
      });
    };

    let json: any = await doReq(bdstoken);
    if (json?.errno === -6) {
      const refreshed = await this.getBdstoken(cookieHeader, true);
      if (refreshed) json = await doReq(refreshed);
    }
    if (!json || json.errno !== 0) {
      throw new Error(json?.show_msg || json?.err_msg || `百度创建分享失败 (errno=${json?.errno})`);
    }
    const shareUrl = json.shorturl || json.link;
    if (!shareUrl) {
      throw new Error('百度创建分享失败：未返回分享链接');
    }
    return {
      shareUrl,
      passcode: pwd,
      shareId: json.shareid ? String(json.shareid) : undefined
    };
  }
}
