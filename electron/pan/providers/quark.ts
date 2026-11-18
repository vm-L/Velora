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
import { buildCookieHeader, mapConcurrent, sleep } from '../utils';
import { toQuarkOrUcExpiredType } from '../shareExpire';

/**
 * 夸克网盘 API 常量（严格依据 YunX-Desktop QuarkConstants.kt）
 */
export const QUARK_CONSTANTS = {
  API_BASE: 'https://drive-pc.quark.cn',
  API_USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.12-a038f7b798 Safari/537.36 Channel/pckk_other_ch',
  DOWNLOAD_REFERER: 'https://pan.quark.cn/',
  ORIGIN: 'https://pan.quark.cn',
  CONFIG_URL: 'https://drive-pc.quark.cn/1/clouddrive/config?pr=ucpro&fr=pc',
  SHARE_TOKEN_URL: 'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/token?pr=ucpro&fr=pc',
  SHARE_DETAIL_URL: 'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail?pr=ucpro&fr=pc',
  CLOUD_FILE_SORT_URL: 'https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc',
  DOWNLOAD_URL: 'https://drive-pc.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc&sys=win32&ve=3.23.2',
  DELETE_URL: 'https://drive-pc.quark.cn/1/clouddrive/file/delete?pr=ucpro&fr=pc&uc_param_str=',
  FILE_URL: 'https://drive-pc.quark.cn/1/clouddrive/file?pr=ucpro&fr=pc',
  SAVE_URL: 'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/save?pr=ucpro&fr=pc',
  TASK_URL: 'https://drive-pc.quark.cn/1/clouddrive/task?pr=ucpro&fr=pc',
  RENAME_URL: 'https://drive-pc.quark.cn/1/clouddrive/file/rename?pr=ucpro&fr=pc&uc_param_str=',
  MOVE_URL: 'https://drive-pc.quark.cn/1/clouddrive/file/move?pr=ucpro&fr=pc&uc_param_str=',
  SHARE_CREATE_URL: 'https://drive-pc.quark.cn/1/clouddrive/share?pr=ucpro&fr=pc&uc_param_str=',
  SHARE_INFO_URL: 'https://drive-pc.quark.cn/1/clouddrive/share/password?pr=ucpro&fr=pc&uc_param_str=',
  MEMBER_QUOTA_URL: 'https://drive-pc.quark.cn/1/clouddrive/member?pr=ucpro&fr=pc&fetch_subscribe=true&_ch=home',
  TEMP_DIR_NAME: 'Velora临时转存'
};

export class QuarkProvider implements PanProvider, PanDriveProvider {
  panType = 'quark' as const;

  /** 游客态令牌 __pugs，对齐 YunX guestPugs，进程内复用 */
  private guestPugs = '';

  /** 上次刷新会话 __puus 的时间戳（进程内节流，对齐 YunX PUUS_REFRESH_INTERVAL_MS = 90分钟） */
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
          (f) => f.isDirectory && f.name === QUARK_CONSTANTS.TEMP_DIR_NAME
        );
        if (existing?.id) {
          return existing.id;
        }
      } catch {}

      const created = await this.createFolder('0', QUARK_CONSTANTS.TEMP_DIR_NAME, account);
      return created.fid;
    })().finally(() => {
      this.ensureTempDirPromise = null;
    });
    return this.ensureTempDirPromise;
  }

  invalidateSession(): void {
    this.lastSessionRefreshTs = 0;
  }

  /**
   * 刷新会话 Cookie（对齐 YunX QuarkApi.refreshSession / AList refreshPuus）：
   * 剥离 __puus 后请求 /config 接口，服务端在 Set-Cookie 下发新鲜的 __puus/__pus，
   * 彻底避免 3 小时 session 过期导致的直链签名 412。
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
        const resp = await net.fetch(QUARK_CONSTANTS.CONFIG_URL, {
          headers: {
            'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
            'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
            'Cookie': cookieWithoutPuus
          }
        });
        this.handleSetCookies(resp, account);
        this.lastSessionRefreshTs = Date.now();
        const updatedAccount = panAccountManager.getAccount('quark');
        return buildCookieHeader(updatedAccount?.cookies) || null;
      } catch (err: any) {
        logger.warn('QuarkProvider', `刷新夸克会话 session 失败: ${err.message}`);
        return null;
      }
    })().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  canHandle(url: string): boolean {
    if (!url) return false;
    return url.toLowerCase().includes('pan.quark.cn');
  }

  private extractPwdId(url: string): string {
    const match = url.match(/\/s\/([a-zA-Z0-9]+)/);
    return match ? match[1] : '';
  }

  private async ensureGuestPugs(): Promise<string> {
    if (this.guestPugs) return this.guestPugs;
    try {
      const resp = await net.fetch(QUARK_CONSTANTS.CONFIG_URL, {
        headers: {
          'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
          'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER
        }
      });
      this.handleSetCookies(resp);
    } catch {}
    return this.guestPugs;
  }

  /**
   * 合并响应中的 Set-Cookie 到本地账号管理
   */
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
          panAccountManager.mergeSetCookies('quark', setCookieHeaders);
        }
      }
    } catch {}
  }

  /**
   * 分页获取指定分享目录下的直接子文件和文件夹列表
   */
  private async fetchShareDetailBatch(
    pwdId: string,
    stoken: string,
    pdirFid: string,
    cookieHeader: string,
    account?: PanAccount
  ): Promise<any[]> {
    const allItems: any[] = [];
    const seenFids = new Set<string>();
    let page = 1;
    const maxPages = 200;

    while (page <= maxPages) {
      const listUrl = `${QUARK_CONSTANTS.SHARE_DETAIL_URL}&pwd_id=${pwdId}&stoken=${encodeURIComponent(
        stoken
      )}&pdir_fid=${pdirFid}&ver=2&force=0&_page=${page}&_size=100&_fetch_banner=0&_fetch_share=0&fetch_relate_conversation=0&_fetch_total=1&_sort=file_type:asc,file_name:asc`;

      const listResp = await net.fetch(listUrl, {
        headers: {
          'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
          'Origin': QUARK_CONSTANTS.ORIGIN,
          'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
          'Cookie': cookieHeader
        }
      });

      this.handleSetCookies(listResp, account);

      const listText = await listResp.text();
      if (listText.startsWith('<')) break;

      let listJson: any = null;
      try {
        listJson = JSON.parse(listText);
      } catch {
        break;
      }

      if (!listJson || listJson.status !== 200 || !listJson.data) break;

      const rawList = listJson.data.list || [];
      if (rawList.length === 0) break;

      let newCount = 0;
      for (const item of rawList) {
        if (!seenFids.has(item.fid)) {
          seenFids.add(item.fid);
          allItems.push(item);
          newCount++;
        }
      }

      if (newCount === 0) {
        break;
      }
      page++;
    }

    return allItems;
  }

  /**
   * 递归遍历分享文件夹收集所有真实文件（包含完整相对路径结构，对齐 YunX QuarkResolveRepository.listFiles）
   */
  private async collectShareFolderRecursively(
    pwdId: string,
    stoken: string,
    dirFid: string,
    prefixPath: string,
    cookieHeader: string,
    result: PanFileItem[],
    account?: PanAccount,
    depth = 0
  ): Promise<void> {
    if (depth > 12) return;

    const items = await this.fetchShareDetailBatch(pwdId, stoken, dirFid, cookieHeader, account);
    const subDirs: Array<{ fid: string; path: string }> = [];

    for (const item of items) {
      const isDir = item.dir === true || item.format_type === 'folder' || !!item.is_dir;
      const fileName = item.file_name || item.fname || 'unknown';
      const currentRelativePath = prefixPath ? `${prefixPath}/${fileName}` : fileName;

      if (isDir) {
        subDirs.push({ fid: item.fid, path: currentRelativePath });
      } else {
        result.push({
          id: item.fid,
          name: fileName,
          path: currentRelativePath,
          size: item.size || item.fsize || 0,
          isDirectory: false,
          downloadUrl: undefined,
          rawInfo: {
            fid: item.fid,
            fidToken: item.share_fid_token || item.fid_token || '',
            pwdId: pwdId,
            stoken: stoken,
            pdirFid: item.pdir_fid || dirFid,
            name: fileName
          }
        });
      }
    }

    if (subDirs.length > 0) {
      await mapConcurrent(subDirs, 4, async (sub) => {
        await this.collectShareFolderRecursively(
          pwdId,
          stoken,
          sub.fid,
          sub.path,
          cookieHeader,
          result,
          account,
          depth + 1
        );
      });
    }
  }

  /**
   * 1. 解析夸克分享链接（全面支持多层级子目录与递归展开）
   */
  async parse(url: string, password = '', account?: PanAccount): Promise<PanParseResult> {
    const pwdId = this.extractPwdId(url);
    if (!pwdId) {
      return {
        panType: 'quark',
        shareTitle: '夸克网盘',
        files: [],
        error: '无效的夸克网盘分享链接'
      };
    }

    logger.info('QuarkProvider', `开始解析夸克分享: pwd_id=${pwdId}`);

    const cookieHeader = buildCookieHeader(account?.cookies);

    try {
      // 1. 获取 share_token
      const tokenResp = await net.fetch(QUARK_CONSTANTS.SHARE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
          'Origin': QUARK_CONSTANTS.ORIGIN,
          'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
          'Cookie': cookieHeader
        },
        body: JSON.stringify({
          pwd_id: pwdId,
          passcode: password,
          support_visit_limit_private_share: true
        })
      });

      this.handleSetCookies(tokenResp, account);

      const tokenText = await tokenResp.text();
      if (tokenText.startsWith('<')) {
        return {
          panType: 'quark',
          shareTitle: '夸克网盘',
          files: [],
          error: '夸克服务端返回页面响应，请检查分享链接或登录状态'
        };
      }

      const tokenJson: any = JSON.parse(tokenText);
      if (!tokenJson || tokenJson.status !== 200 || !tokenJson.data?.stoken) {
        const msg = tokenJson?.message || '获取分享令牌失败，请检查分享是否已失效或提取码错误';
        return {
          panType: 'quark',
          shareTitle: '夸克网盘',
          files: [],
          error: msg
        };
      }

      const stoken = tokenJson.data.stoken;
      const shareTitle = tokenJson.data.title || '夸克分享资源';

      // 2. 递归深度收集分享内所有文件条目
      const collectedFiles: PanFileItem[] = [];
      await this.collectShareFolderRecursively(pwdId, stoken, '0', '', cookieHeader, collectedFiles, account, 0);

      logger.info('QuarkProvider', `分享解析完成: 共发现 ${collectedFiles.length} 个文件`);

      return {
        panType: 'quark',
        shareTitle,
        files: collectedFiles
      };
    } catch (err: any) {
      logger.error('QuarkProvider', `解析异常: ${err.message}`);
      return {
        panType: 'quark',
        shareTitle: '夸克网盘',
        files: [],
        error: `夸克网盘解析异常: ${err.message}`
      };
    }
  }

  /**
   * 2. 分享文件取真实直链详情（包含专属 Cookie/UA/Referer 请求头，对齐 YunX-Desktop 规避 412）
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

    // 登录态取链前检查会话是否超期或缺少 __puus 需刷新
    if (isLogin && account) {
      const now = Date.now();
      if (!account.cookies?.['__puus'] || now - this.lastSessionRefreshTs > this.PUUS_REFRESH_INTERVAL_MS) {
        const refreshed = await this.refreshSession(account);
        if (refreshed) cookieHeader = refreshed;
      }
    } else if (!isLogin && !this.guestPugs) {
      await this.ensureGuestPugs();
    }

    // 按 pwdId + stoken 分组后每 50 条批量取链，大幅减少请求数
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
        const body = {
          fids: batch.map((b) => b.fid),
          fids_token: batch.map((b) => b.fidToken || ''),
          pwd_id: pwdId,
          stoken: stoken,
          speedup_session: '',
          token: ''
        };

        const reqHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
          'Origin': QUARK_CONSTANTS.ORIGIN,
          'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER
        };

        if (isLogin) {
          reqHeaders['Cookie'] = cookieHeader;
        } else if (this.guestPugs) {
          reqHeaders['Cookie'] = this.guestPugs;
        }

        try {
          const resp = await net.fetch(QUARK_CONSTANTS.DOWNLOAD_URL, {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify(body)
          });

          this.handleSetCookies(resp, account);

          const respText = await resp.text();
          if (respText.startsWith('<')) {
            logger.warn('QuarkProvider', `取链返回 HTML 响应: HTTP ${resp.status}`);
            throw new Error(`夸克取链返回页面响应 (HTTP ${resp.status})`);
          }

          const json: any = JSON.parse(respText);
          const code = json.code;
          if (json.status !== 200 && code !== 0) {
            if (code === 23018) {
              throw new Error('该文件超出游客可获取的大小上限（夸克限制约 50MB），请先在设置中登录夸克网盘账号后再试');
            } else if (code === 31001) {
              throw new Error('该分享需要登录夸克网盘后才能下载，请先登录网盘账号');
            } else {
              throw new Error(json.message || `获取直链失败 (code ${code})`);
            }
          }

          const dataArray = json.data;
          if (Array.isArray(dataArray) && dataArray.length > 0) {
            const latestAcc = panAccountManager.getAccount('quark') || account;
            const cookieForDownload = isLogin
              ? (buildCookieHeader(latestAcc?.cookies) || cookieHeader)
              : this.guestPugs;

            const downloadHeaders: Record<string, string> = {
              'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
              'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER
            };
            if (cookieForDownload) {
              downloadHeaders['Cookie'] = cookieForDownload;
            }

            for (const entry of dataArray) {
              const targetFid = entry?.fid || (batch.length === 1 ? batch[0].fid : undefined);
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
          logger.error('QuarkProvider', `批量分享取链失败: ${err.message}`);
          if (!isLogin || !account) {
            throw err;
          }
        }

        const stillMissing = batch.filter((orig) => !result[orig.fid]?.url);
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
            throw new Error('未能获取到夸克下载直链');
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
   * 3. 获取个人网盘指定目录文件列表（对齐 YunX QuarkApi.listCloudFiles）
   */
  async listFiles(pdirFid = '0', account: PanAccount): Promise<PanDriveListResult> {
    const cookieHeader = buildCookieHeader(account?.cookies);

    const targetFid = pdirFid || '0';
    logger.info('QuarkProvider', `查询个人网盘目录: pdir_fid=${targetFid}`);

    try {
      const files: PanDriveItem[] = [];
      const seen = new Set<string>();
      let total = 0;
      let page = 1;
      const maxPages = 200;

      while (page <= maxPages) {
        const listUrl = `${QUARK_CONSTANTS.CLOUD_FILE_SORT_URL}&uc_param_str=&pdir_fid=${encodeURIComponent(
          targetFid
        )}&_page=${page}&_size=100&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,updated_at:desc&fetch_all_file=1&fetch_risk_file_name=1`;

        const resp = await net.fetch(listUrl, {
          headers: {
            'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
            'Origin': QUARK_CONSTANTS.ORIGIN,
            'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
            'Cookie': cookieHeader
          }
        });

        this.handleSetCookies(resp, account);

        const respText = await resp.text();
        if (respText.startsWith('<')) {
          throw new Error('夸克网盘登录态已失效或未授权，请前往设置重新登录');
        }

        const resJson: any = JSON.parse(respText);
        if (!resJson || resJson.status !== 200) {
          throw new Error(resJson?.message || '获取个人网盘文件列表失败');
        }

        const rawList = resJson.data?.list || [];
        if (typeof resJson.data?.total === 'number' && resJson.data.total > total) {
          total = resJson.data.total;
        }
        if (rawList.length === 0) break;

        let newCount = 0;
        for (const item of rawList) {
          if (!item.fid || seen.has(item.fid)) continue;
          seen.add(item.fid);
          newCount++;
          files.push({
            id: item.fid,
            name: item.file_name || item.fname,
            pdir_fid: item.pdir_fid,
            size: item.size || 0,
            isDirectory: item.dir === true || item.format_type === 'folder' || !!item.is_dir,
            updatedAt: item.updated_at || item.modify_time || Date.now(),
            formatType: item.format_type,
            thumbnail: item.thumbnail
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
      logger.error('QuarkProvider', `获取个人网盘文件异常: ${err.message}`);
      throw err;
    }
  }

  /**
   * 4. 获取单文件下载/播放直链
   */
  async getDriveDownloadUrl(fid: string, account: PanAccount): Promise<string> {
    const urls = await this.getBatchDownloadUrls([fid], account);
    return urls[fid] || '';
  }

  /**
   * 5. 批量获取个人网盘文件下载直链详情（包含专属 Cookie/UA/Referer 请求头，对齐 YunX QuarkApi.getDownloadLink）
   */
  async getBatchDownloadUrlsDetail(fids: string[], account: PanAccount): Promise<Record<string, PanDownloadItemLink>> {
    if (!fids || fids.length === 0) return {};
    let cookieHeader = buildCookieHeader(account?.cookies);

    // 取链前检查会话 __puus 是否存在或超期
    const now = Date.now();
    if (!account?.cookies?.['__puus'] || now - this.lastSessionRefreshTs > this.PUUS_REFRESH_INTERVAL_MS) {
      const refreshed = await this.refreshSession(account);
      if (refreshed) cookieHeader = refreshed;
    }

    const result: Record<string, PanDownloadItemLink> = {};

    try {
      for (let i = 0; i < fids.length; i += 50) {
        const batchFids = fids.slice(i, i + 50);
        const activeAcc = panAccountManager.getAccount('quark') || account;
        const currentCookie = buildCookieHeader(activeAcc?.cookies) || cookieHeader;

        const resp = await net.fetch(QUARK_CONSTANTS.DOWNLOAD_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
            'Origin': QUARK_CONSTANTS.ORIGIN,
            'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
            'Cookie': currentCookie
          },
          body: JSON.stringify({ fids: batchFids })
        });

        this.handleSetCookies(resp, account);

        const respText = await resp.text();
        if (respText.startsWith('<')) {
          throw new Error('夸克网盘登录态已失效，请重新登录');
        }

        const resJson: any = JSON.parse(respText);
        if (resJson && (resJson.status === 200 || resJson.code === 0) && Array.isArray(resJson.data)) {
          const latestAcc = panAccountManager.getAccount('quark') || account;
          const latestCookie = buildCookieHeader(latestAcc?.cookies) || currentCookie;

          const downloadHeaders: Record<string, string> = {
            'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
            'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER
          };
          if (latestCookie) {
            downloadHeaders['Cookie'] = latestCookie;
          }

          resJson.data.forEach((item: any) => {
            if (item.fid && item.download_url) {
              result[item.fid] = {
                fid: item.fid,
                url: item.download_url,
                size: typeof item.size === 'number' ? item.size : undefined,
                filename: item.file_name || item.filename,
                headers: downloadHeaders
              };
            }
          });
        } else {
          throw new Error(resJson?.message || `获取夸克下载直链失败 (${resJson?.code ?? resJson?.status ?? resp.status})`);
        }
      }
      return result;
    } catch (err: any) {
      logger.error('QuarkProvider', `获取夸克直链失败: ${err.message}`);
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
   * 6. 批量删除个人网盘云端文件（对齐 YunX QuarkApi.deleteFile）
   */
  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const cookieHeader = buildCookieHeader(account?.cookies);

    try {
      const resp = await net.fetch(QUARK_CONSTANTS.DELETE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
          'Origin': QUARK_CONSTANTS.ORIGIN,
          'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
          'Cookie': cookieHeader
        },
        body: JSON.stringify({
          action_type: 2,
          filelist: fids,
          exclude_fids: []
        })
      });

      this.handleSetCookies(resp, account);

      const respText = await resp.text();
      if (respText.startsWith('<')) {
        return false;
      }

      const resJson: any = JSON.parse(respText);
      return !!(resJson && (resJson.status === 200 || resJson.code === 0));
    } catch (err: any) {
      logger.error('QuarkProvider', `删除夸克文件异常: ${err.message}`);
      return false;
    }
  }

  /**
   * 7. 获取网盘最新真实容量信息（对齐 YunX QuarkApi.getQuota）
   */
  async getQuota(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    if (!cookieHeader) return null;

    try {
      const resp = await net.fetch(QUARK_CONSTANTS.MEMBER_QUOTA_URL, {
        headers: {
          'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
          'Origin': QUARK_CONSTANTS.ORIGIN,
          'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
          'Cookie': cookieHeader
        }
      });

      this.handleSetCookies(resp, account);

      const text = await resp.text();
      if (text.startsWith('<')) return null;

      const json: any = JSON.parse(text);
      if (json && json.data) {
        const total = json.data.total_capacity || json.data.total || 0;
        const used = json.data.use_capacity || json.data.used || 0;
        if (total > 0) {
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
      }
      return null;
    } catch (err: any) {
      logger.error('QuarkProvider', `刷新夸克网盘容量失败: ${err.message}`);
      return null;
    }
  }

  private async pollTask(
    taskId: string,
    cookieHeader: string,
    account: PanAccount,
    maxPolls = 20
  ): Promise<{ savedFids: string[]; shareId?: string }> {
    for (let i = 0; i < maxPolls; i++) {
      const url = `${QUARK_CONSTANTS.TASK_URL}&task_id=${encodeURIComponent(taskId)}&retry_index=${i}`;
      let json: any = null;
      try {
        const resp = await net.fetch(url, {
          headers: {
            'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
            'Origin': QUARK_CONSTANTS.ORIGIN,
            'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
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
          throw new Error(json.message || `夸克异步任务失败 (${json.code ?? json.status})`);
        }
        const data = json.data;
        if (data) {
          const tStatus = Number(data.status ?? data.task_status ?? 0);
          if (tStatus === 3 || (data.error_code && Number(data.error_code) !== 0)) {
            throw new Error(data.message || data.task_title || '夸克异步任务执行失败');
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
    throw new Error('夸克网盘异步任务处理超时，请稍后重试');
  }

  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const resp = await net.fetch(QUARK_CONSTANTS.FILE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
        'Origin': QUARK_CONSTANTS.ORIGIN,
        'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
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
      throw new Error(json?.message || '夸克新建文件夹失败');
    }
    return { fid: String(json.data.fid), name };
  }

  async renameItem(fid: string, newName: string, account: PanAccount): Promise<boolean> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const resp = await net.fetch(QUARK_CONSTANTS.RENAME_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
        'Origin': QUARK_CONSTANTS.ORIGIN,
        'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
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
      throw new Error(json?.message || '夸克重命名失败');
    }
    return true;
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const cookieHeader = buildCookieHeader(account?.cookies);
    const resp = await net.fetch(QUARK_CONSTANTS.MOVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
        'Origin': QUARK_CONSTANTS.ORIGIN,
        'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
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
      throw new Error(json?.message || '夸克移动文件失败');
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
      support_error_code: ['41060']
    };
    if (passcode) {
      body.passcode = passcode;
    }

    const resp = await net.fetch(QUARK_CONSTANTS.SHARE_CREATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
        'Origin': QUARK_CONSTANTS.ORIGIN,
        'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
        'Cookie': cookieHeader
      },
      body: JSON.stringify(body)
    });
    this.handleSetCookies(resp, account);
    const json: any = await resp.json();
    if (json?.status !== 200) {
      throw new Error(json?.message || '夸克创建分享失败');
    }
    const taskId = json?.data?.task_id;
    let shareId = json?.data?.share_id ? String(json.data.share_id) : '';
    if (!shareId && taskId) {
      const pollRes = await this.pollTask(String(taskId), cookieHeader, account, 15);
      shareId = pollRes.shareId || '';
    }
    if (!shareId) {
      throw new Error('夸克创建分享超时，请稍后重试');
    }

    const infoResp = await net.fetch(QUARK_CONSTANTS.SHARE_INFO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
        'Origin': QUARK_CONSTANTS.ORIGIN,
        'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
        'Cookie': cookieHeader
      },
      body: JSON.stringify({ share_id: shareId })
    });
    this.handleSetCookies(infoResp, account);
    const infoJson: any = await infoResp.json();
    if (infoJson?.status !== 200 || !infoJson?.data?.share_url) {
      throw new Error(infoJson?.message || '查询夸克分享链接失败');
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
      throw new Error('请先登录夸克网盘账号');
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
      const resp = await net.fetch(QUARK_CONSTANTS.SAVE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': QUARK_CONSTANTS.API_USER_AGENT,
          'Origin': QUARK_CONSTANTS.ORIGIN,
          'Referer': QUARK_CONSTANTS.DOWNLOAD_REFERER,
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
        throw new Error(`夸克分享转存返回异常响应 (HTTP ${resp.status})`);
      }
      const json: any = JSON.parse(text);
      if (json?.status !== 200) {
        throw new Error(json?.message || '夸克分享转存失败');
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
