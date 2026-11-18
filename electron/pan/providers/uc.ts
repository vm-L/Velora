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
import { buildCookieHeader, inferFormatType, mapConcurrent, parseTimestamp, sleep } from '../utils';
import { toQuarkOrUcExpiredType } from '../shareExpire';

/**
 * UC网盘 API 常量（严格依据 YunX-Desktop UCConstants.kt）
 */
export const UC_CONSTANTS = {
  API_BASE: 'https://pc-api.uc.cn',
  WEB_ORIGIN: 'https://drive.uc.cn',
  DOWNLOAD_REFERER: 'https://drive.uc.cn/',
  WEB_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  CLOUD_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/1.6.1 Chrome/100.0.4896.160 Electron/18.3.5.16-b62cf9c50d Safari/537.36 Channel/ucpan_other_ch',
  GUEST_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch',
  GUEST_SEC_CH_UA: '"Not=A?Brand";v="99", "Chromium";v="100", "Google Chrome";v="100"',
  SHARE_TOKEN_URL: 'https://pc-api.uc.cn/1/clouddrive/share/sharepage/token?pr=UCBrowser&fr=pc',
  SHARE_DETAIL_URL: 'https://pc-api.uc.cn/1/clouddrive/share/sharepage/v2/detail?pr=UCBrowser&fr=pc',
  TRANSFER_SHARE_DETAIL_URL:
    'https://pc-api.uc.cn/1/clouddrive/transfer_share/detail?entry=ft&fr=pc&pr=UCBrowser',
  DOWNLOAD_URL: 'https://pc-api.uc.cn/1/clouddrive/file/download?entry=ft&fr=pc&pr=UCBrowser',
  CLOUD_DOWNLOAD_URL: 'https://pc-api.uc.cn/1/clouddrive/file/download?pr=UCBrowser&fr=pc&sys=win32&ve=1.6.1',
  VIDEO_PREVIEW_URL: 'https://pc-api.uc.cn/1/clouddrive/share/sharepage/video_preview',
  PLAY_URL: 'https://pc-api.uc.cn/1/clouddrive/file/v2/play/project?pr=UCBrowser&fr=pc',
  FILE_URL: 'https://pc-api.uc.cn/1/clouddrive/file?pr=UCBrowser&fr=pc',
  SAVE_URL: 'https://pc-api.uc.cn/1/clouddrive/share/sharepage/save?pr=UCBrowser&fr=pc',
  TASK_URL: 'https://pc-api.uc.cn/1/clouddrive/task?pr=UCBrowser&fr=pc',
  CLOUD_FILE_SORT_URL: 'https://pc-api.uc.cn/1/clouddrive/file/sort?pr=UCBrowser&fr=pc',
  RENAME_URL: 'https://pc-api.uc.cn/1/clouddrive/file/rename?pr=UCBrowser&fr=pc',
  MOVE_URL: 'https://pc-api.uc.cn/1/clouddrive/file/move?pr=UCBrowser&fr=pc',
  SHARE_CREATE_URL: 'https://pc-api.uc.cn/1/clouddrive/share?pr=UCBrowser&fr=pc',
  SHARE_INFO_URL: 'https://pc-api.uc.cn/1/clouddrive/share/password?pr=UCBrowser&fr=pc',
  DELETE_URL: 'https://pc-api.uc.cn/1/clouddrive/file/delete?pr=UCBrowser&fr=pc',
  MEMBER_QUOTA_URL: 'https://pc-api.uc.cn/1/clouddrive/member?pr=UCBrowser&fr=pc&fetch_subscribe=true&_ch=home',
  CONFIG_URL: 'https://pc-api.uc.cn/1/clouddrive/config?pr=UCBrowser&fr=pc',
  TEMP_DIR_NAME: 'Velora临时转存'
};

export class UCProvider implements PanProvider, PanDriveProvider {
  panType = 'uc' as const;

  private guestPugs = '';
  private lastSessionRefreshTs = 0;
  private readonly PUUS_REFRESH_INTERVAL_MS = 90 * 60 * 1000;
  private refreshPromise: Promise<string | null> | null = null;
  private ensureTempDirPromise: Promise<string> | null = null;

  private async ensureTempDir(account: PanAccount): Promise<string> {
    if (this.ensureTempDirPromise) {
      return this.ensureTempDirPromise;
    }
    this.ensureTempDirPromise = (async () => {
      try {
        const listed = await this.listFiles('0', account);
        const existing = listed.files.find(
          (f) => f.isDirectory && f.name === UC_CONSTANTS.TEMP_DIR_NAME
        );
        if (existing?.id) {
          return existing.id;
        }
      } catch {}

      const created = await this.createFolder('0', UC_CONSTANTS.TEMP_DIR_NAME, account);
      return created.fid;
    })().finally(() => {
      this.ensureTempDirPromise = null;
    });
    return this.ensureTempDirPromise;
  }

  private mapGuestDownloadError(code: number, message?: string): string {
    switch (code) {
      case 31001:
        return '该分享需要登录 UC 网盘后才能下载，请先在设置中登录 UC 网盘账号';
      case 23018:
        return '该文件超出游客可获取的大小上限，请先在设置中登录 UC 网盘后再下载';
      case 14001:
        return '分享已失效或提取码有误，请重新解析';
      case 41020:
        return '文件令牌已过期，请重新解析分享';
      default:
        return message || `获取 UC 直链失败 (${code})`;
    }
  }

  invalidateSession(): void {
    this.lastSessionRefreshTs = 0;
  }

  canHandle(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('drive.uc.cn') || lower.includes('fast.uc.cn');
  }

  private extractPwdId(url: string): string {
    const match = url.match(/\/s\/([a-zA-Z0-9]+)/);
    return match ? match[1] : '';
  }

  private handleSetCookies(resp: any, account?: PanAccount) {
    try {
      const setCookieHeaders: string[] = [];
      if (resp && resp.headers) {
        if (typeof resp.headers.getSetCookie === 'function') {
          setCookieHeaders.push(...resp.headers.getSetCookie());
        } else {
          const raw = resp.headers.get('set-cookie');
          if (raw) setCookieHeaders.push(raw);
        }
      }

      if (setCookieHeaders.length > 0) {
        for (const sc of setCookieHeaders) {
          const part = sc.split(';')[0].trim();
          if (part.startsWith('__pugs=')) {
            this.guestPugs = part;
          }
        }

        if (account) {
          panAccountManager.mergeSetCookies('uc', setCookieHeaders);
        }
      }
    } catch {}
  }

  private async ensureGuestPugs(): Promise<string> {
    if (this.guestPugs) return this.guestPugs;
    try {
      const resp = await net.fetch(UC_CONSTANTS.CONFIG_URL, {
        headers: {
          'User-Agent': UC_CONSTANTS.GUEST_UA,
          Referer: UC_CONSTANTS.DOWNLOAD_REFERER
        }
      });
      this.handleSetCookies(resp);
    } catch {}
    return this.guestPugs;
  }

  /**
   * 刷新会话 Cookie（对齐 YunX UCApi.refreshSession）
   */
  async refreshSession(account: PanAccount): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const cookieHeader = buildCookieHeader(account?.cookies);
      if (!cookieHeader) return null;

      const cookieWithoutPuus = cookieHeader
        .split(';')
        .map((s) => s.trim())
        .filter((s) => !s.startsWith('__puus='))
        .join('; ');

      try {
        const resp = await net.fetch(UC_CONSTANTS.CONFIG_URL, {
          headers: {
            'User-Agent': UC_CONSTANTS.CLOUD_UA,
            Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
            Cookie: cookieWithoutPuus
          }
        });
        this.handleSetCookies(resp, account);
        this.lastSessionRefreshTs = Date.now();
        const updatedAccount = panAccountManager.getAccount('uc');
        return buildCookieHeader(updatedAccount?.cookies) || null;
      } catch (err: any) {
        logger.warn('UCProvider', `刷新 UC 会话 session 失败: ${err.message}`);
        return null;
      }
    })().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  /**
   * 1. 分享解析（递归遍历完整子文件夹，提取 share_fid_token / stoken / pwd_id）
   */
  async parse(url: string, password = '', account?: PanAccount): Promise<PanParseResult> {
    const pwdId = this.extractPwdId(url);
    if (!pwdId) {
      return {
        panType: 'uc',
        shareTitle: 'UC网盘',
        files: [],
        error: '无效的 UC 网盘分享链接（缺少 /s/ 标识）'
      };
    }

    logger.info('UCProvider', `开始解析 UC 网盘分享: pwdId=${pwdId}`);

    const cookieHeader = buildCookieHeader(account?.cookies);

    try {
      // 换取 share token（对齐 YunX UCApi.getShareToken）
      const tokenResp = await net.fetch(UC_CONSTANTS.SHARE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UC_CONSTANTS.WEB_UA,
          Origin: UC_CONSTANTS.WEB_ORIGIN,
          Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
          Cookie: cookieHeader
        },
        body: JSON.stringify({
          pwd_id: pwdId,
          passcode: password || '',
          share_for_transfer: true
        })
      });

      this.handleSetCookies(tokenResp, account);

      const tokenText = await tokenResp.text();
      if (!tokenText || tokenText.trim().startsWith('<')) {
        throw new Error(`UC网盘返回异常响应 (HTTP ${tokenResp.status})`);
      }
      const tokenJson: any = JSON.parse(tokenText);
      if (tokenJson.code !== 0 && tokenJson.status !== 200) {
        return {
          panType: 'uc',
          shareTitle: 'UC网盘',
          files: [],
          error: tokenJson.message || '获取分享 Token 失败，请检查提取码'
        };
      }

      const stoken = tokenJson.data?.stoken || '';
      if (!stoken) {
        throw new Error('未返回有效访问凭证 stoken');
      }

      const allFiles: PanFileItem[] = [];
      const seenFids = new Set<string>();
      const scannedDirs = new Set<string>();
      let shareTitle = tokenJson.data?.title || 'UC网盘资源';

      const scanDirectory = async (pdirFid: string, relativePrefix: string, depth = 0): Promise<void> => {
        if (depth > 15 || scannedDirs.has(pdirFid)) return;
        scannedDirs.add(pdirFid);
        let page = 1;
        const maxPages = 200;
        const subDirs: Array<{ fid: string; path: string }> = [];

        while (page <= maxPages) {
          // 必须走 transfer_share/detail（带 stoken），对齐 UCApi.getTransferShareFiles & UCResolveRepository.listFiles
          const detailUrl =
            `${UC_CONSTANTS.TRANSFER_SHARE_DETAIL_URL}&pwd_id=${encodeURIComponent(pwdId)}` +
            `&pdir_fid=${encodeURIComponent(pdirFid)}&fetch_file_list=1&passcode=` +
            `&_page=${page}&_size=50&_fetch_total=1&_fetch_task=1&_fetch_share=1&_sort=` +
            `&stoken=${encodeURIComponent(stoken)}`;

          const resp = await net.fetch(detailUrl, {
            headers: {
              'User-Agent': UC_CONSTANTS.WEB_UA,
              Origin: 'https://fast.uc.cn',
              Referer: 'https://fast.uc.cn/',
              ...(cookieHeader ? { Cookie: cookieHeader } : {})
            }
          });

          this.handleSetCookies(resp, account);
          const text = await resp.text();
          if (!text || text.trim().startsWith('<')) {
            throw new Error(`获取分享目录返回异常响应 (HTTP ${resp.status})`);
          }
          const json: any = JSON.parse(text);
          if (json?.status !== 200 && json?.code !== 0) {
            throw new Error(json?.message || `获取分享目录失败 (${json?.code ?? json?.status ?? resp.status})`);
          }

          if (json.data?.title && pdirFid === '0') {
            shareTitle = json.data.title;
          }

          const list = json.data?.list || json.data?.detail_info?.list || [];
          if (!Array.isArray(list) || list.length === 0) {
            break;
          }

          let newInPage = 0;
          for (const item of list) {
            const fidStr = item.fid ? String(item.fid) : '';
            if (!fidStr || seenFids.has(fidStr)) continue;
            seenFids.add(fidStr);
            newInPage++;

            const isDir =
              item.dir === true ||
              item.format_type === 'folder' ||
              !!item.is_dir ||
              String(item.file_type) === '0';
            const name = item.file_name || item.fname || '未知文件';
            const itemRelativePath = relativePrefix ? `${relativePrefix}/${name}` : name;

            if (isDir) {
              subDirs.push({ fid: fidStr, path: itemRelativePath });
            } else {
              allFiles.push({
                id: fidStr,
                name,
                path: itemRelativePath,
                size: typeof item.size === 'number' ? item.size : parseInt(item.size, 10) || 0,
                isDirectory: false,
                rawInfo: {
                  fid: fidStr,
                  fidToken: item.share_fid_token || item.fid_token || '',
                  pwdId,
                  stoken,
                  pdirFid: item.pdir_fid || pdirFid,
                  name,
                  share_fid_token: item.share_fid_token,
                  pwd_id: pwdId
                }
              });
            }
          }

          if (newInPage === 0) break;
          page++;
        }

        if (subDirs.length > 0) {
          await mapConcurrent(subDirs, 4, async (sub) => {
            await scanDirectory(sub.fid, sub.path, depth + 1);
          });
        }
      };

      await scanDirectory('0', '', 0);

      return {
        panType: 'uc',
        shareTitle,
        files: allFiles
      };
    } catch (err: any) {
      logger.error('UCProvider', `解析异常: ${err.message}`);
      return {
        panType: 'uc',
        shareTitle: 'UC网盘',
        files: [],
        error: `UC网盘解析异常: ${err.message}`
      };
    }
  }

  /**
   * 2. 分享免转存取直链（对齐 YunX UCApi.getGuestShareDownloadLink 与 getShareDownloadLink）
   */
  async getShareDownloadUrlsDetail(
    items: PanShareDownloadItem[],
    account?: PanAccount
  ): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!items || items.length === 0) return result;

    let cookieHeader = buildCookieHeader(account?.cookies);
    const isLogin = !!(
      cookieHeader &&
      (account?.cookies?.['__pus'] || account?.cookies?.['__puus'] || account?.cookies?.['__kps'] || account?.cookies?.['kps'])
    );

    if (isLogin && account) {
      const now = Date.now();
      if (!account.cookies?.['__puus'] || now - this.lastSessionRefreshTs > this.PUUS_REFRESH_INTERVAL_MS) {
        const refreshed = await this.refreshSession(account);
        if (refreshed) cookieHeader = refreshed;
      }
    } else if (!isLogin && !this.guestPugs) {
      await this.ensureGuestPugs();
    }

    const groups = new Map<string, PanShareDownloadItem[]>();
    for (const item of items) {
      if (!item.fid) continue;
      const key = `${item.pwdId || ''}\0${item.stoken || ''}`;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }

    for (const groupItems of Array.from(groups.values())) {
      const pwdId = groupItems[0].pwdId || '';
      const stoken = groupItems[0].stoken || '';

      for (let i = 0; i < groupItems.length; i += 50) {
        const batch = groupItems.slice(i, i + 50);

        // 登录态下，视频文件优先走 share/sharepage/video_preview 获取原画直链，绕过非会员宣传片替换（对齐 UCResolveRepository）
        if (isLogin && account) {
          for (const item of batch) {
            const name = item.extra?.name || '';
            if (inferFormatType(name, false) === 'video') {
              const preview = await this.getVideoPreview(
                pwdId,
                stoken,
                item.fid,
                item.fidToken || '',
                cookieHeader
              );
              if (preview) {
                result[item.fid] = {
                  ...preview,
                  filename: name || preview.filename
                };
              }
            }
          }
        }

        const directBatch = batch.filter((b) => !result[b.fid]?.url);
        if (directBatch.length > 0) {
          const body = {
            fids: directBatch.map((b) => b.fid),
            fids_token: directBatch.map((b) => b.fidToken || ''),
            pwd_id: pwdId,
            stoken: stoken,
            speedup_session: '',
            token: ''
          };

          const reqHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': isLogin ? UC_CONSTANTS.WEB_UA : UC_CONSTANTS.GUEST_UA,
            Origin: UC_CONSTANTS.WEB_ORIGIN,
            Referer: UC_CONSTANTS.DOWNLOAD_REFERER
          };
          if (!isLogin) {
            reqHeaders['Sec-Ch-Ua'] = UC_CONSTANTS.GUEST_SEC_CH_UA;
          }

          if (isLogin) {
            reqHeaders['Cookie'] = cookieHeader;
          } else if (this.guestPugs) {
            reqHeaders['Cookie'] = this.guestPugs;
          }

          try {
            const resp = await net.fetch(UC_CONSTANTS.DOWNLOAD_URL, {
              method: 'POST',
              headers: reqHeaders,
              body: JSON.stringify(body)
            });

            this.handleSetCookies(resp, account);
            const respText = await resp.text();
            if (!respText || respText.trim().startsWith('<')) {
              throw new Error(`获取 UC 直链返回异常响应 (HTTP ${resp.status})`);
            }
            const json: any = JSON.parse(respText);
            const code = Number(json.code ?? 0);

            if (json.status !== 200 && code !== 0) {
              const msg = isLogin
                ? json.message || `获取 UC 直链失败 (${code || json.status})`
                : this.mapGuestDownloadError(code, json.message);
              throw new Error(msg);
            }

            if (json.data && Array.isArray(json.data) && json.data.length > 0) {
              const latestAcc = panAccountManager.getAccount('uc') || account;
              const cookieForDownload = isLogin
                ? (buildCookieHeader(latestAcc?.cookies) || cookieHeader)
                : this.guestPugs;

              const downloadHeaders: Record<string, string> = {
                'User-Agent': isLogin ? UC_CONSTANTS.WEB_UA : UC_CONSTANTS.GUEST_UA,
                Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
                Origin: UC_CONSTANTS.WEB_ORIGIN
              };
              if (!isLogin) {
                downloadHeaders['Sec-Ch-Ua'] = UC_CONSTANTS.GUEST_SEC_CH_UA;
              }
              if (cookieForDownload) {
                downloadHeaders['Cookie'] = cookieForDownload;
              }

              for (const entry of json.data) {
                const targetFid = entry?.fid || (directBatch.length === 1 ? directBatch[0].fid : undefined);
                if (targetFid && entry?.download_url) {
                  result[targetFid] = {
                    fid: targetFid,
                    url: entry.download_url,
                    size: typeof entry.size === 'number' ? entry.size : undefined,
                    filename: entry.file_name || entry.filename,
                    headers: downloadHeaders
                  };
                }
              }
            }
          } catch (err: any) {
            logger.warn('UCProvider', `批量获取 UC 直链失败: ${err.message}`);
            if (!isLogin || !account) {
              throw err;
            }
          }
        }

        // 若仍有条目未拿到直链且已登录：落入 Velora临时转存/tr_xxx 后走个人盘直链，附带 cleanupDirFid 供下载完成后自动清理
        const stillMissing = batch.filter((it) => !result[it.fid]?.url);
        if (stillMissing.length > 0) {
          if (isLogin && account) {
            let subDirFid = '';
            try {
              const baseTempDirFid = await this.ensureTempDir(account);
              const subName = `tr_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
              const subDir = await this.createFolder(baseTempDirFid, subName, account);
              subDirFid = subDir.fid;
              const { savedFids, fidMap } = await this.saveShareItemsInternal(stillMissing, subDirFid, account);
              const targetIds = Object.values(fidMap).filter(Boolean);
              const lookupIds = targetIds.length > 0 ? targetIds : savedFids;
              if (lookupIds.length > 0) {
                const dlMap = await this.getBatchDownloadUrlsDetail(lookupIds, account);
                for (const orig of stillMissing) {
                  const savedFid = fidMap[orig.fid];
                  if (!savedFid) continue;
                  const link = dlMap[savedFid];
                  if (link && link.url) {
                    result[orig.fid] = {
                      ...link,
                      fid: orig.fid,
                      cleanupDirFid: subDirFid
                    };
                  }
                }
              }
              const anyMapped = stillMissing.some((orig) => result[orig.fid]?.cleanupDirFid === subDirFid);
              if (!anyMapped) {
                throw new Error('临时转存后未能获取有效下载直链');
              }
            } catch (saveErr: any) {
              if (subDirFid) {
                this.deleteFiles([subDirFid], account).catch(() => {});
              }
              throw saveErr;
            }
          } else {
            throw new Error('未能获取到 UC 下载直链');
          }
        }
      }
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
   * 3. 个人网盘文件列表（对齐 YunX UCApi.listCloudFiles）
   */
  async listFiles(pdirFid = '0', account: PanAccount): Promise<PanDriveListResult> {
    const cookieHeader = buildCookieHeader(account?.cookies);

    const targetFid = (!pdirFid || pdirFid === '0') ? '0' : pdirFid;

    try {
      const files: PanDriveItem[] = [];
      const seen = new Set<string>();
      let total = 0;
      let page = 1;
      const maxPages = 200;

      while (page <= maxPages) {
        const url = `${UC_CONSTANTS.CLOUD_FILE_SORT_URL}&pdir_fid=${encodeURIComponent(
          targetFid
        )}&_page=${page}&_size=50&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,updated_at:desc`;

        const resp = await net.fetch(url, {
          headers: {
            'User-Agent': UC_CONSTANTS.CLOUD_UA,
            Origin: UC_CONSTANTS.WEB_ORIGIN,
            Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
            Cookie: cookieHeader
          }
        });
        this.handleSetCookies(resp, account);
        const text = await resp.text();
        if (!text || text.trim().startsWith('<')) {
          throw new Error('UC网盘登录态已失效，请重新登录');
        }
        const json: any = JSON.parse(text);
        if (json?.status !== 200 && json?.code !== 0) {
          throw new Error(json?.message || `获取 UC 网盘文件列表失败 (${json?.code ?? json?.status})`);
        }

        const rawList = json.data?.list || [];
        if (typeof json.data?.total === 'number' && json.data.total > total) {
          total = json.data.total;
        }
        if (!Array.isArray(rawList) || rawList.length === 0) break;

        let newCount = 0;
        for (const item of rawList) {
          if (!item.fid || seen.has(item.fid)) continue;
          seen.add(item.fid);
          newCount++;
          const isDir =
            item.dir === true ||
            item.format_type === 'folder' ||
            !!item.is_dir ||
            String(item.file_type) === '0';
          files.push({
            id: item.fid,
            name: item.file_name || item.fname,
            pdir_fid: item.pdir_fid || targetFid,
            size: typeof item.size === 'number' ? item.size : parseInt(item.size, 10) || 0,
            isDirectory: isDir,
            updatedAt: parseTimestamp(item.updated_at),
            formatType: isDir ? 'folder' : undefined
          });
        }

        if (newCount === 0 || (total > 0 && files.length >= total)) {
          break;
        }
        page++;
      }

      return {
        files,
        total: total || files.length,
        pdir_fid: targetFid
      };
    } catch (err: any) {
      logger.error('UCProvider', `列出 UC 网盘个人文件失败: ${err.message}`);
      throw err;
    }
  }

  /**
   * 4. 个人网盘文件取直链
   */
  async getDriveDownloadUrl(fid: string, account: PanAccount): Promise<string> {
    const urls = await this.getBatchDownloadUrls([fid], account);
    return urls[fid] || '';
  }

  async getBatchDownloadUrlsDetail(fids: string[], account: PanAccount): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!fids || fids.length === 0) return result;

    let cookieHeader = buildCookieHeader(account?.cookies);

    const now = Date.now();
    if (!account?.cookies?.['__puus'] || now - this.lastSessionRefreshTs > this.PUUS_REFRESH_INTERVAL_MS) {
      const refreshed = await this.refreshSession(account);
      if (refreshed) cookieHeader = refreshed;
    }

    try {
      for (let i = 0; i < fids.length; i += 50) {
        const batchFids = fids.slice(i, i + 50);
        const activeAcc = panAccountManager.getAccount('uc') || account;
        const currentCookie = buildCookieHeader(activeAcc?.cookies) || cookieHeader;

        const resp = await net.fetch(UC_CONSTANTS.CLOUD_DOWNLOAD_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'User-Agent': UC_CONSTANTS.CLOUD_UA,
            Origin: UC_CONSTANTS.WEB_ORIGIN,
            Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
            Cookie: currentCookie
          },
          body: JSON.stringify({ fids: batchFids })
        });

        this.handleSetCookies(resp, account);
        const text = await resp.text();
        if (!text || text.trim().startsWith('<')) {
          throw new Error('获取 UC 网盘直链返回异常响应，请重新登录');
        }
        const json: any = JSON.parse(text);
        if (json?.status !== 200 && json?.code !== 0) {
          throw new Error(json?.message || `获取 UC 网盘直链失败 (${json?.code ?? json?.status})`);
        }

        const latestAcc = panAccountManager.getAccount('uc') || account;
        const latestCookie = buildCookieHeader(latestAcc?.cookies) || currentCookie;

        if (json.data && Array.isArray(json.data)) {
          json.data.forEach((item: any) => {
            if (item.fid && item.download_url) {
              result[item.fid] = {
                fid: item.fid,
                url: item.download_url,
                size: typeof item.size === 'number' ? item.size : undefined,
                filename: item.file_name || item.filename,
                headers: {
                  'User-Agent': UC_CONSTANTS.CLOUD_UA,
                  Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
                  Origin: UC_CONSTANTS.WEB_ORIGIN,
                  Cookie: latestCookie
                }
              };
            }
          });
        }

        const missingFids = batchFids.filter((id) => !result[id]?.url);
        if (missingFids.length > 0) {
          try {
            const fbResp = await net.fetch(UC_CONSTANTS.DOWNLOAD_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': UC_CONSTANTS.WEB_UA,
                Origin: UC_CONSTANTS.WEB_ORIGIN,
                Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
                Cookie: latestCookie
              },
              body: JSON.stringify({ fids: missingFids })
            });
            this.handleSetCookies(fbResp, account);
            const fbText = await fbResp.text();
            if (fbText && !fbText.trim().startsWith('<')) {
              const fbJson: any = JSON.parse(fbText);
              if (fbJson && (fbJson.status === 200 || fbJson.code === 0) && Array.isArray(fbJson.data)) {
                const refreshedAcc = panAccountManager.getAccount('uc') || account;
                const refreshedCookie = buildCookieHeader(refreshedAcc?.cookies) || latestCookie;
                fbJson.data.forEach((item: any) => {
                  if (item.fid && item.download_url) {
                    result[item.fid] = {
                      fid: item.fid,
                      url: item.download_url,
                      size: typeof item.size === 'number' ? item.size : undefined,
                      filename: item.file_name || item.filename,
                      headers: {
                        'User-Agent': UC_CONSTANTS.WEB_UA,
                        Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
                        Origin: UC_CONSTANTS.WEB_ORIGIN,
                        Cookie: refreshedCookie
                      }
                    };
                  }
                });
              }
            }
          } catch {}
        }
      }
      return result;
    } catch (err: any) {
      logger.error('UCProvider', `获取 UC 直链失败: ${err.message}`);
      throw err;
    }
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
   * 5. 删除个人网盘文件
   */
  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const cookieHeader = buildCookieHeader(account?.cookies);

    try {
      const resp = await net.fetch(UC_CONSTANTS.DELETE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UC_CONSTANTS.CLOUD_UA,
          Origin: UC_CONSTANTS.WEB_ORIGIN,
          Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
          Cookie: cookieHeader
        },
        body: JSON.stringify({
          action_type: 2,
          filelist: fids,
          exclude_fids: []
        })
      });
      this.handleSetCookies(resp, account);
      const json: any = await resp.json();
      return !!(json && (json.status === 200 || json.code === 0));
    } catch (err: any) {
      logger.error('UCProvider', `删除 UC 文件失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 6. 容量信息（对齐 YunX UCApi.getQuota）
   */
  async getQuota(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    if (!cookieHeader) return null;

    try {
      const resp = await net.fetch(UC_CONSTANTS.MEMBER_QUOTA_URL, {
        headers: {
          'User-Agent': UC_CONSTANTS.CLOUD_UA,
          Origin: UC_CONSTANTS.WEB_ORIGIN,
          Referer: UC_CONSTANTS.DOWNLOAD_REFERER,
          Cookie: cookieHeader
        }
      });
      this.handleSetCookies(resp, account);
      const json: any = await resp.json();
      if (json && json.data) {
        const total = json.data.total_capacity || json.data.total || 0;
        const used = json.data.use_capacity || json.data.used || 0;
        const formatBytes = (bytes: number): string => {
          if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
          const units = ['B', 'KB', 'MB', 'GB', 'TB'];
          const i = Math.floor(Math.log(bytes) / Math.log(1024));
          return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
        };
        return {
          used,
          total,
          quotaText: `${formatBytes(used)} / ${formatBytes(total)}`
        };
      }
    } catch (e: any) {
      logger.warn('UCProvider', `获取 UC 容量失败: ${e.message}`);
    }
    return null;
  }

  private async getVideoPreview(
    pwdId: string,
    stoken: string,
    fid: string,
    fidToken: string,
    cookieHeader: string
  ): Promise<PanDownloadItemLink | null> {
    try {
      const url = `${UC_CONSTANTS.VIDEO_PREVIEW_URL}?pr=UCBrowser&fr=h5&pwd_id=${encodeURIComponent(pwdId)}&stoken=${encodeURIComponent(stoken)}&fid=${encodeURIComponent(fid)}&fid_token=${encodeURIComponent(fidToken)}`;
      const resp = await net.fetch(url, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': UC_CONSTANTS.WEB_UA,
          'Origin': UC_CONSTANTS.WEB_ORIGIN,
          'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
          'Content-Type': 'application/json'
        }
      });
      const json: any = await resp.json();
      if (json?.status !== 200 && json?.code !== 0) return null;
      const playInfo = json?.data?.play_info;
      if (!playInfo?.url) return null;
      return {
        fid,
        url: playInfo.url,
        size: Number(playInfo.size || 0) || undefined,
        headers: {
          'User-Agent': UC_CONSTANTS.WEB_UA,
          'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
          'Origin': UC_CONSTANTS.WEB_ORIGIN,
          ...(cookieHeader ? { Cookie: cookieHeader } : {})
        }
      };
    } catch {
      return null;
    }
  }

  async getPlayLink(fid: string, account: PanAccount): Promise<string | null> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    if (!cookieHeader) return null;
    const endpoints = [UC_CONSTANTS.PLAY_URL, `${UC_CONSTANTS.API_BASE}/1/clouddrive/file/v2/play/project`];
    for (const ep of endpoints) {
      try {
        const resp = await net.fetch(ep, {
          method: 'POST',
          headers: {
            'Cookie': cookieHeader,
            'User-Agent': UC_CONSTANTS.WEB_UA,
            'Content-Type': 'application/json;charset=UTF-8',
            'Origin': UC_CONSTANTS.WEB_ORIGIN,
            'Referer': UC_CONSTANTS.DOWNLOAD_REFERER
          },
          body: JSON.stringify({
            fid,
            resolutions: 'low,normal,high,super,2k,4k',
            supports: 'fmp4_av,m3u8,dolby_vision'
          })
        });
        const json: any = await resp.json();
        const list = json?.data?.video_list;
        if (Array.isArray(list)) {
          for (const item of list) {
            const u = item?.video_info?.url;
            if (u) return String(u);
          }
        }
      } catch {}
    }
    return null;
  }

  private async pollTask(
    taskId: string,
    cookieHeader: string,
    account: PanAccount,
    maxPolls = 20
  ): Promise<{ savedFids: string[]; shareId?: string }> {
    for (let i = 0; i < maxPolls; i++) {
      const url = `${UC_CONSTANTS.TASK_URL}&task_id=${encodeURIComponent(taskId)}&retry_index=${i}`;
      let json: any = null;
      try {
        const resp = await net.fetch(url, {
          headers: {
            'User-Agent': UC_CONSTANTS.CLOUD_UA,
            'Origin': UC_CONSTANTS.WEB_ORIGIN,
            'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
            'Cookie': cookieHeader
          }
        });
        this.handleSetCookies(resp, account);
        const text = await resp.text();
        if (text && !text.trim().startsWith('<')) {
          json = JSON.parse(text);
        }
      } catch {}

      if (json) {
        if (json.status !== 200 && json.code !== 0) {
          throw new Error(json.message || `UC 异步任务失败 (${json.code ?? json.status})`);
        }
        const data = json.data;
        if (data) {
          const tStatus = Number(data.status ?? data.task_status ?? 0);
          if (tStatus === 3 || (data.error_code && Number(data.error_code) !== 0)) {
            throw new Error(data.message || data.task_title || 'UC 异步任务执行失败');
          }
          const finished =
            Number(data.finished_at || 0) > 0 ||
            tStatus === 2;
          if (finished) {
            const savedFids = Array.isArray(data.save_as?.save_as_top_fids)
              ? data.save_as.save_as_top_fids.map(String).filter(Boolean)
              : [];
            const shareId = data.share_id ? String(data.share_id) : undefined;
            return { savedFids, shareId };
          }
        }
      }
      await sleep(1000);
    }
    throw new Error('UC 网盘异步任务处理超时，请稍后重试');
  }

  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const resp = await net.fetch(UC_CONSTANTS.FILE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UC_CONSTANTS.CLOUD_UA,
        'Origin': UC_CONSTANTS.WEB_ORIGIN,
        'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        pdir_fid: parentFid || '0',
        file_name: name,
        dir_path: '',
        dir_init_lock: false
      })
    });
    this.handleSetCookies(resp, account);
    const json: any = await resp.json();
    if (json?.status !== 200 || !json?.data?.fid) {
      throw new Error(json?.message || 'UC 新建文件夹失败');
    }
    return { fid: String(json.data.fid), name };
  }

  async renameItem(fid: string, newName: string, account: PanAccount): Promise<boolean> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const resp = await net.fetch(UC_CONSTANTS.RENAME_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UC_CONSTANTS.CLOUD_UA,
        'Origin': UC_CONSTANTS.WEB_ORIGIN,
        'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        fid,
        file_name: newName
      })
    });
    this.handleSetCookies(resp, account);
    const json: any = await resp.json();
    if (json?.status !== 200) {
      throw new Error(json?.message || 'UC 重命名失败');
    }
    return true;
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const cookieHeader = buildCookieHeader(account?.cookies);
    const resp = await net.fetch(UC_CONSTANTS.MOVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UC_CONSTANTS.CLOUD_UA,
        'Origin': UC_CONSTANTS.WEB_ORIGIN,
        'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
        'Cookie': cookieHeader
      },
      body: JSON.stringify({
        action_type: 1,
        to_pdir_fid: targetDirFid || '0',
        filelist: fids,
        exclude_fids: []
      })
    });
    this.handleSetCookies(resp, account);
    const json: any = await resp.json();
    if (json?.status !== 200) {
      throw new Error(json?.message || 'UC 移动文件失败');
    }
    if (json?.data?.task_id) {
      await this.pollTask(String(json.data.task_id), cookieHeader, account, 15);
    }
    return true;
  }

  async createShare(params: PanCreateShareParams, account: PanAccount): Promise<PanShareCreatedInfo> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const expiredType = toQuarkOrUcExpiredType(params.expireType);
    const passcode = (params.passcode || '').trim();
    const body: Record<string, any> = {
      fid_list: params.fids,
      title: '分享文件',
      url_type: passcode ? 2 : 1,
      expired_type: expiredType,
      public_search: passcode ? 0 : 1
    };
    if (passcode) {
      body.passcode = passcode;
    }

    const resp = await net.fetch(UC_CONSTANTS.SHARE_CREATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UC_CONSTANTS.CLOUD_UA,
        'Origin': UC_CONSTANTS.WEB_ORIGIN,
        'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
        'Cookie': cookieHeader
      },
      body: JSON.stringify(body)
    });
    this.handleSetCookies(resp, account);
    const json: any = await resp.json();
    if (json?.status !== 200) {
      throw new Error(json?.message || 'UC 创建分享失败');
    }
    const taskId = json?.data?.task_id;
    let shareId = json?.data?.share_id ? String(json.data.share_id) : '';
    if (!shareId && taskId) {
      const pollRes = await this.pollTask(String(taskId), cookieHeader, account, 15);
      shareId = pollRes.shareId || '';
    }
    if (!shareId) {
      throw new Error('UC 创建分享超时，请稍后重试');
    }

    const infoResp = await net.fetch(UC_CONSTANTS.SHARE_INFO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UC_CONSTANTS.CLOUD_UA,
        'Origin': UC_CONSTANTS.WEB_ORIGIN,
        'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
        'Cookie': cookieHeader
      },
      body: JSON.stringify({ share_id: shareId })
    });
    this.handleSetCookies(infoResp, account);
    const infoJson: any = await infoResp.json();
    if (infoJson?.status !== 200 || !infoJson?.data?.share_url) {
      throw new Error(infoJson?.message || '查询 UC 分享链接失败');
    }
    return {
      shareUrl: infoJson.data.share_url,
      passcode: infoJson.data.passcode || passcode || '',
      shareId: infoJson.data.pwd_id || shareId,
      title: infoJson.data.title || '分享文件'
    };
  }

  private async saveShareItemsInternal(
    items: PanShareDownloadItem[],
    targetDirFid: string,
    account: PanAccount
  ): Promise<{ savedCount: number; savedFids: string[]; fidMap: Record<string, string> }> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    if (!cookieHeader) {
      throw new Error('请先登录 UC 网盘账号');
    }
    const groups = new Map<string, PanShareDownloadItem[]>();
    for (const item of items) {
      const pwdId = item.pwdId || item.extra?.pwdId || '';
      const stoken = item.stoken || item.extra?.stoken || '';
      const pdirFid = item.extra?.pdirFid || '0';
      const key = `${pwdId}\0${stoken}\0${pdirFid}`;
      const arr = groups.get(key) || [];
      arr.push(item);
      groups.set(key, arr);
    }

    const savedFids: string[] = [];
    const fidMap: Record<string, string> = {};
    let savedCount = 0;

    for (const group of Array.from(groups.values())) {
      const pwdId = group[0].pwdId || group[0].extra?.pwdId || '';
      const stoken = group[0].stoken || group[0].extra?.stoken || '';
      const pdirFid = group[0].extra?.pdirFid || '0';
      const resp = await net.fetch(UC_CONSTANTS.SAVE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UC_CONSTANTS.CLOUD_UA,
          'Origin': UC_CONSTANTS.WEB_ORIGIN,
          'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
          'Cookie': cookieHeader
        },
        body: JSON.stringify({
          pwd_id: pwdId,
          stoken,
          pdir_fid: pdirFid,
          to_pdir_fid: targetDirFid || '0',
          fid_list: group.map((it) => it.fid),
          fid_token_list: group.map((it) => it.fidToken || it.extra?.fidToken || ''),
          scene: 'link'
        })
      });
      this.handleSetCookies(resp, account);
      const text = await resp.text();
      if (!text || text.trim().startsWith('<')) {
        throw new Error(`UC 分享转存返回异常响应 (HTTP ${resp.status})`);
      }
      const json: any = JSON.parse(text);
      if (json?.status !== 200) {
        throw new Error(json?.message || 'UC 分享转存失败');
      }
      let groupSavedFids: string[] = Array.isArray(json?.data?.save_as?.save_as_top_fids)
        ? json.data.save_as.save_as_top_fids.map(String).filter(Boolean)
        : [];
      if (json?.data?.task_id) {
        const res = await this.pollTask(String(json.data.task_id), cookieHeader, account, 20);
        if (res.savedFids.length > 0) {
          groupSavedFids = res.savedFids;
        }
      }
      savedFids.push(...groupSavedFids);
      if (groupSavedFids.length === group.length) {
        group.forEach((orig, idx) => {
          if (groupSavedFids[idx]) {
            fidMap[orig.fid] = groupSavedFids[idx];
          }
        });
      }
      savedCount += group.length;
    }

    if (items.some((it) => !fidMap[it.fid])) {
      try {
        const dirRes = await this.listFiles(targetDirFid, account);
        const driveFiles = (dirRes.files || []).filter((f) => !f.isDirectory);
        const usedIds = new Set<string>(Object.values(fidMap));
        for (const orig of items) {
          if (fidMap[orig.fid]) continue;
          const origName = orig.extra?.name;
          if (!origName) continue;
          const matched = driveFiles.find((f) => !usedIds.has(f.id) && f.name === origName);
          if (matched) {
            fidMap[orig.fid] = matched.id;
            usedIds.add(matched.id);
          }
        }
      } catch {}
    }

    return { savedCount, savedFids, fidMap };
  }

  async saveShareItems(
    items: PanShareDownloadItem[],
    targetDirFid: string,
    account: PanAccount
  ): Promise<{ savedCount: number }> {
    const res = await this.saveShareItemsInternal(items, targetDirFid, account);
    return { savedCount: res.savedCount };
  }
}
