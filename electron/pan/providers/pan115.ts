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
import { Pan115Crypto } from '../pan115Crypto';
import { toPan115Duration } from '../shareExpire';
import {
  buildCookieHeader,
  formatPanBytes,
  inferFormatType,
  mapConcurrent,
  parseTimestamp,
  sleep
} from '../utils';

/**
 * 115网盘常量（严格依据 YunX-Desktop Pan115Constants.kt）
 */
export const PAN115_CONSTANTS = {
  API_BASE: 'https://webapi.115.com',
  PRO_API_BASE: 'https://proapi.115.com',
  REFERER: 'https://115.com/',
  DOWNLOAD_REFERER: 'https://115.com/',
  SHARE_HOST: 'https://115cdn.com',
  WEB_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  CLIENT_UA_FALLBACK: 'Mozilla/5.0 115Browser/36.0.1',
  APP_VERSION_URL: 'https://appversion.115.com/1/web/1.0/api/chrome',
  FILES_URL: 'https://webapi.115.com/files',
  FILE_INFO_URL: 'https://webapi.115.com/files/file',
  INDEX_INFO_URL: 'https://webapi.115.com/files/index_info?count_space_nums=1',
  FILE_ADD_URL: 'https://webapi.115.com/files/add',
  FILE_MOVE_URL: 'https://webapi.115.com/files/move',
  MOVE_PROGRESS_URL: 'https://webapi.115.com/files/move_progress',
  FILE_RENAME_URL: 'https://webapi.115.com/files/batch_rename',
  DELETE_URL: 'https://webapi.115.com/rb/delete',
  FILE_DOWNLOAD_URL: 'https://webapi.115.com/files/download',
  APP_DOWNLOAD_URL: 'https://proapi.115.com/app/chrome/downurl',
  ALLOW_PROTOCOL_URL: 'https://webapi.115.com/user/allow_protocol',
  SHARE_SEND_URL: 'https://webapi.115.com/share/send',
  SHARE_UPDATE_URL: 'https://webapi.115.com/share/updateshare',
  SHARE_SNAP_URL: 'https://webapi.115.com/share/snap',
  SHARE_DOWNLOAD_URL: 'https://webapi.115.com/share/downurl',
  SHARE_RECEIVE_URL: 'https://webapi.115.com/share/receive',
  TEMP_DIR_NAME: 'Velora临时转存'
};

export class Pan115Provider implements PanProvider, PanDriveProvider {
  panType = '115' as const;

  private pickCodeCache = new Map<string, string>();
  private fidPidCache = new Map<string, string>();
  private clientUa = PAN115_CONSTANTS.CLIENT_UA_FALLBACK;
  private clientVersionFetched = false;
  private protocolAllowedUsers = new Set<string>();
  private ensureTempDirPromise: Promise<string> | null = null;

  private async ensureTempDir(account: PanAccount): Promise<string> {
    if (this.ensureTempDirPromise) {
      return this.ensureTempDirPromise;
    }
    this.ensureTempDirPromise = (async () => {
      try {
        const listed = await this.listFiles('0', account);
        const existing = listed.files.find(
          (f) => f.isDirectory && f.name === PAN115_CONSTANTS.TEMP_DIR_NAME
        );
        if (existing?.id) {
          return existing.id;
        }
      } catch {}

      const created = await this.createFolder('0', PAN115_CONSTANTS.TEMP_DIR_NAME, account);
      return created.fid;
    })().finally(() => {
      this.ensureTempDirPromise = null;
    });
    return this.ensureTempDirPromise;
  }

  private matchesTransferredName(actualName: string, expectedName: string): boolean {
    if (!expectedName) return false;
    if (actualName === expectedName) return true;
    const dotIdx = expectedName.lastIndexOf('.');
    const base = dotIdx > 0 ? expectedName.slice(0, dotIdx) : expectedName;
    const ext = dotIdx > 0 ? expectedName.slice(dotIdx + 1) : '';
    if (!actualName.startsWith(`${base}(`)) return false;
    return ext ? actualName.endsWith(`).${ext}`) : actualName.endsWith(')');
  }

  canHandle(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('115.com') ||
      lower.includes('115cdn.com') ||
      lower.includes('115rc.com') ||
      lower.includes('anxia.com')
    );
  }

  private extractShareCode(url: string): string {
    const m1 = url.match(/\/s\/([A-Za-z0-9]+)/i);
    if (m1) return m1[1];
    const m2 = url.match(/115(?:cdn|rc)?\.com\/(sw[A-Za-z0-9]{8,})/i);
    return m2 ? m2[1] : '';
  }

  private shareReferer(shareCode: string, receiveCode: string): string {
    if (!receiveCode) {
      return `${PAN115_CONSTANTS.SHARE_HOST}/s/${shareCode}`;
    }
    return `${PAN115_CONSTANTS.SHARE_HOST}/s/${shareCode}?password=${encodeURIComponent(receiveCode)}&`;
  }

  private async refreshClientVersion(): Promise<void> {
    if (this.clientVersionFetched) return;
    this.clientVersionFetched = true;
    try {
      const resp = await net.fetch(PAN115_CONSTANTS.APP_VERSION_URL, {
        headers: {
          'User-Agent': PAN115_CONSTANTS.WEB_UA,
          Referer: PAN115_CONSTANTS.REFERER
        }
      });
      const json: any = await resp.json();
      const ver = String(json?.data?.win?.version_code || '').trim();
      if (ver && /^\d[\d.]{1,15}$/.test(ver)) {
        this.clientUa = `Mozilla/5.0 115Browser/${ver}`;
      }
    } catch {}
  }

  private extractDownloadCookie(resp: any): string {
    try {
      const list: string[] = [];
      if (resp?.headers) {
        if (typeof resp.headers.getSetCookie === 'function') {
          list.push(...resp.headers.getSetCookie());
        } else {
          const raw = resp.headers.get('set-cookie');
          if (raw) list.push(raw);
        }
      }
      let fallback = '';
      for (const raw of list) {
        const pair = raw.split(';')[0].trim();
        const eqIdx = pair.indexOf('=');
        if (eqIdx <= 0) continue;
        const name = pair.slice(0, eqIdx).trim().toLowerCase();
        if (name === 'expires' || name === 'path' || name === 'domain') continue;
        if (!fallback) fallback = pair;
        const pathMatch = raw.match(/[;\s]path=([^;]+)/i);
        const cookiePath = pathMatch?.[1]?.trim();
        if (cookiePath && cookiePath !== '/') {
          return pair;
        }
      }
      return fallback;
    } catch {
      return '';
    }
  }

  private mergeCookies(...parts: Array<string | undefined>): string {
    return parts.filter((p) => p && p.trim().length > 0).join('; ');
  }

  private extractUserId(cookieHeader: string): string {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('UID=')) {
        return trimmed.slice(4).split('_')[0].trim();
      }
    }
    return '';
  }

  private checkState(json: any, fallback: string) {
    if (json?.state === true) return;
    const errno = Number(json?.errno ?? json?.errNo ?? 0);
    const raw = json?.error || json?.msg || '';
    let msg = raw || fallback;
    if (errno === 990001) msg = '115 登录已过期，请在设置中重新登录';
    else if (errno === 4100012) msg = '该 115 分享需要访问码，请填写访问码后重试';
    else if (errno === 4100008) msg = '115 分享访问码错误，请检查后重试';
    else if (errno === 4100026) msg = '115 分享链接不存在或已被删除';
    else if (errno === 4100016) msg = '115 不允许分享空文件夹';
    else if (errno === 990009) msg = '上一次操作尚未完成，请稍后重试';
    else if (errno === 50028) msg = '115 网页端拒绝下发大文件直链 (errno=50028)';
    else if (errno === 50029) msg = '115 判定客户端版本受限 (errno=50029)';
    throw new Error(errno && !msg.includes(String(errno)) ? `${msg} (errno=${errno})` : msg);
  }

  /**
   * 1. 115网盘分享解析（提取分享者 userinfo.user_id 供 share/downurl 使用）
   */
  async parse(url: string, password = '', account?: PanAccount): Promise<PanParseResult> {
    const shareCode = this.extractShareCode(url);
    if (!shareCode) {
      return {
        panType: '115',
        shareTitle: '115网盘',
        files: [],
        error: '无效的 115 网盘分享链接'
      };
    }

    logger.info('Pan115Provider', `开始解析 115 分享: shareCode=${shareCode}`);
    const cookieHeader = buildCookieHeader(account?.cookies);
    const urlPwdMatch = url.match(/[?&](?:password|pwd|passcode)=([A-Za-z0-9]+)/i);
    const receiveCode = (password || urlPwdMatch?.[1] || '').trim();

    try {
      const files: PanFileItem[] = [];
      let shareTitle = '115网盘资源';
      let sharerUserId = '';

      const scanShareDir = async (cid: string, relativePrefix: string, isRoot: boolean): Promise<void> => {
        let offset = 0;
        const limit = 100;
        const subDirs: Array<{ cid: string; path: string }> = [];

        for (let page = 0; page < 30; page++) {
          const snapUrl =
            `${PAN115_CONSTANTS.SHARE_SNAP_URL}?share_code=${encodeURIComponent(shareCode)}` +
            `&receive_code=${encodeURIComponent(receiveCode)}&offset=${offset}&limit=${limit}&asc=0` +
            `&cid=${encodeURIComponent(cid)}&format=json`;

          const resp = await net.fetch(snapUrl, {
            headers: {
              'User-Agent': PAN115_CONSTANTS.WEB_UA,
              'X-Requested-With': 'XMLHttpRequest',
              Referer: this.shareReferer(shareCode, receiveCode),
              ...(cookieHeader ? { Cookie: cookieHeader } : {})
            }
          });
          const json: any = await resp.json();

          if (!json || json.state !== true) {
            this.checkState(json, '解析 115 分享失败');
          }

          const snapData = json.data || {};
          if (isRoot && offset === 0) {
            if (snapData.shareinfo?.share_title) shareTitle = snapData.shareinfo.share_title;
            else if (snapData.share_title) shareTitle = snapData.share_title;
            if (snapData.userinfo?.user_id) sharerUserId = String(snapData.userinfo.user_id);
          }

          const rawList = snapData.list || [];
          if (!Array.isArray(rawList) || rawList.length === 0) break;

          for (const item of rawList) {
            const isDir = item.fc !== undefined ? Number(item.fc) === 0 : !item.fid && !!item.cid;
            const name = item.n || item.name || '未知文件';
            const itemPath = relativePrefix ? `${relativePrefix}/${name}` : name;

            if (isDir) {
              subDirs.push({ cid: String(item.cid), path: itemPath });
            } else {
              const fidStr = String(item.fid);
              const pc = item.pc || item.pick_code || '';
              if (pc) {
                if (this.pickCodeCache.size > 5000) this.pickCodeCache.clear();
                this.pickCodeCache.set(fidStr, pc);
              }
              const fileSize = typeof item.s === 'number' ? item.s : parseInt(item.s, 10) || 0;
              files.push({
                id: fidStr,
                name,
                path: itemPath,
                size: fileSize,
                isDirectory: false,
                rawInfo: {
                  fid: fidStr,
                  fidToken: pc,
                  pwdId: shareCode,
                  stoken: `${receiveCode}|${sharerUserId}`,
                  userId: sharerUserId,
                  share_code: shareCode,
                  receive_code: receiveCode,
                  name,
                  size: fileSize,
                  cid: item.cid
                }
              });
            }
          }

          if (rawList.length < limit) break;
          offset += limit;
        }

        if (subDirs.length > 0) {
          await mapConcurrent(subDirs, 3, async (sub) => {
            await scanShareDir(sub.cid, sub.path, false);
          });
        }
      };

      await scanShareDir('0', '', true);

      return {
        panType: '115',
        shareTitle,
        files
      };
    } catch (err: any) {
      logger.error('Pan115Provider', `解析 115 分享异常: ${err.message}`);
      return {
        panType: '115',
        shareTitle: '115网盘',
        files: [],
        error: `解析异常: ${err.message}`
      };
    }
  }

  /**
   * 2. 分享取直链：GET /share/downurl (附带客户端 UA + CDN Cookie)；若 50028/50029 受限且已登录，走临时转存 + proapi 电脑端通道 + cleanupDirFid
   */
  async getShareDownloadUrlsDetail(
    items: PanShareDownloadItem[],
    account?: PanAccount
  ): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!items || items.length === 0) return result;

    await this.refreshClientVersion();
    const cookieHeader = buildCookieHeader(account?.cookies);
    const needTransferFallback: PanShareDownloadItem[] = [];

    await mapConcurrent(items, 4, async (item) => {
      if (!item.fid) return;
      const shareCode = item.pwdId || item.extra?.share_code || '';
      const rawStoken = item.stoken || '';
      const stokenParts = rawStoken.split('|');
      const receiveCode = item.extra?.receive_code ?? stokenParts[0] ?? '';
      const userId = item.extra?.userId || stokenParts[1] || '';

      if (!shareCode || !userId) {
        needTransferFallback.push(item);
        return;
      }

      try {
        let downUrl =
          `${PAN115_CONSTANTS.SHARE_DOWNLOAD_URL}?dl=1` +
          `&user_id=${encodeURIComponent(userId)}` +
          `&share_code=${encodeURIComponent(shareCode)}` +
          `&file_id=${encodeURIComponent(item.fid)}`;
        if (receiveCode) {
          downUrl += `&receive_code=${encodeURIComponent(receiveCode)}`;
        }

        const resp = await net.fetch(downUrl, {
          method: 'GET',
          headers: {
            'User-Agent': this.clientUa,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: this.shareReferer(shareCode, receiveCode),
            ...(cookieHeader ? { Cookie: cookieHeader } : {})
          }
        });
        const cdnCookie = this.extractDownloadCookie(resp);
        const json: any = await resp.json();
        const errno = Number(json?.errno ?? json?.errNo ?? 0);

        if (json?.state === true && json?.data) {
          const d = json.data;
          const fileUrl = d.file_url_302 || d.file_url || d.url?.url || '';
          if (fileUrl) {
            const downloadHeaders: Record<string, string> = {
              'User-Agent': this.clientUa,
              Referer: PAN115_CONSTANTS.DOWNLOAD_REFERER
            };
            const mergedCookie = this.mergeCookies(cookieHeader, cdnCookie);
            if (mergedCookie) downloadHeaders['Cookie'] = mergedCookie;

            result[item.fid] = {
              fid: item.fid,
              url: fileUrl,
              filename: d.fn || item.extra?.name,
              size: Number(d.fs ?? item.extra?.size ?? 0) || undefined,
              headers: downloadHeaders
            };
            return;
          }
        }

        if (errno === 50028 || errno === 50029 || !json?.state) {
          needTransferFallback.push(item);
        }
      } catch (err: any) {
        logger.warn('Pan115Provider', `115 share/downurl 失败 (${item.fid}): ${err.message}`);
        needTransferFallback.push(item);
      }
    });

    // 若直链受限且用户已登录：临时转存到 Velora临时转存/tr_xxx -> 轮询认领新文件 -> getAppDownloadLink (proapi RSA+XOR) -> 返回 cleanupDirFid
    let lastFallbackError = '';
    if (needTransferFallback.length > 0 && account && cookieHeader) {
      const groups = new Map<string, PanShareDownloadItem[]>();
      for (const item of needTransferFallback) {
        const shareCode = item.pwdId || item.extra?.share_code || '';
        const receiveCode = item.extra?.receive_code ?? (item.stoken || '').split('|')[0] ?? '';
        const key = `${shareCode}\0${receiveCode}`;
        const arr = groups.get(key) || [];
        arr.push(item);
        groups.set(key, arr);
      }

      const baseTempDirCid = await this.ensureTempDir(account);
      for (const group of Array.from(groups.values())) {
        const shareCode = group[0].pwdId || group[0].extra?.share_code || '';
        const receiveCode = group[0].extra?.receive_code ?? (group[0].stoken || '').split('|')[0] ?? '';
        if (!shareCode) continue;

        const subDirName = `tr_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
        let subDirCid = '';
        try {
          const subDir = await this.createFolder(baseTempDirCid, subDirName, account);
          subDirCid = subDir.fid;
          await this.receiveShare(
            shareCode,
            receiveCode,
            group.map((it) => it.fid).join(','),
            subDirCid,
            cookieHeader
          );

          // 115 转存列表有延迟，最多轮询 10 次（每次间隔 500ms）认领新文件
          let driveFiles: PanDriveItem[] = [];
          for (let attempt = 0; attempt < 10; attempt++) {
            if (attempt > 0) await sleep(500);
            const listed = await this.listFiles(subDirCid, account);
            const nonDirs = listed.files.filter((f) => !f.isDirectory);
            if (nonDirs.length > 0) {
              driveFiles = nonDirs;
              const allMatched = group.every((orig) => {
                const origName = orig.extra?.name || '';
                return (
                  driveFiles.some((f) => this.matchesTransferredName(f.name, origName) || f.id === orig.fid) ||
                  (group.length === 1 && driveFiles.length === 1)
                );
              });
              if (allMatched && driveFiles.length >= group.length) {
                break;
              }
            }
          }

          if (driveFiles.length === 0) {
            throw new Error('115 临时转存后未找到文件');
          }
          const dlMap = await this.getBatchDownloadUrlsDetail(
            driveFiles.map((f) => f.id),
            account
          );
          const usedIds = new Set<string>();
          for (const orig of group) {
            const origName = orig.extra?.name || '';
            let matched =
              (origName &&
                driveFiles.find((f) => !usedIds.has(f.id) && this.matchesTransferredName(f.name, origName))) ||
              driveFiles.find((f) => !usedIds.has(f.id) && f.id === orig.fid);
            if (!matched && group.length === 1 && driveFiles.length === 1 && !usedIds.has(driveFiles[0].id)) {
              matched = driveFiles[0];
            }
            const link = matched ? dlMap[matched.id] : undefined;
            if (matched && link && link.url) {
              usedIds.add(matched.id);
              result[orig.fid] = {
                ...link,
                fid: orig.fid,
                cleanupDirFid: subDirCid
              };
            }
          }
          if (!group.some((orig) => result[orig.fid]?.cleanupDirFid === subDirCid)) {
            throw new Error('115 临时转存文件匹配或取链失败');
          }
        } catch (err: any) {
          if (subDirCid) this.deleteFiles([subDirCid], account).catch(() => {});
          lastFallbackError = err?.message || '115 临时转存电脑端取链失败';
          logger.warn('Pan115Provider', `115 临时转存电脑端取链失败: ${lastFallbackError}`);
        }
      }
    }

    if (Object.keys(result).length === 0) {
      throw new Error(
        lastFallbackError || '未能获取 115 分享直链；若文件较大，请先在设置中登录 115 网盘账号后重试'
      );
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

  private async receiveShare(
    shareCode: string,
    receiveCode: string,
    fileId: string,
    toCid: string,
    cookieHeader: string
  ): Promise<void> {
    const form = new URLSearchParams();
    form.append('share_code', shareCode);
    form.append('receive_code', receiveCode);
    form.append('file_id', fileId);
    form.append('cid', toCid || '0');

    const resp = await net.fetch(PAN115_CONSTANTS.SHARE_RECEIVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'User-Agent': PAN115_CONSTANTS.WEB_UA,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: PAN115_CONSTANTS.REFERER,
        Cookie: cookieHeader
      },
      body: form.toString()
    });
    const json: any = await resp.json();
    this.checkState(json, '115 分享转存失败');
  }

  async saveShareItems(
    items: PanShareDownloadItem[],
    targetDirFid: string,
    account: PanAccount
  ): Promise<{ savedCount: number }> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    if (!cookieHeader) {
      throw new Error('请先登录 115 网盘账号');
    }
    const toCid = !targetDirFid || targetDirFid === '0' ? '0' : targetDirFid;
    const groups = new Map<string, PanShareDownloadItem[]>();
    for (const item of items) {
      const shareCode = item.pwdId || item.extra?.share_code || '';
      const receiveCode = item.extra?.receive_code ?? (item.stoken || '').split('|')[0] ?? '';
      const key = `${shareCode}\0${receiveCode}`;
      const arr = groups.get(key) || [];
      arr.push(item);
      groups.set(key, arr);
    }

    let savedCount = 0;
    for (const group of Array.from(groups.values())) {
      const shareCode = group[0].pwdId || group[0].extra?.share_code || '';
      const receiveCode = group[0].extra?.receive_code ?? (group[0].stoken || '').split('|')[0] ?? '';
      if (!shareCode) continue;
      await this.receiveShare(
        shareCode,
        receiveCode,
        group.map((it) => it.fid).join(','),
        toCid,
        cookieHeader
      );
      savedCount += group.length;
    }
    return { savedCount };
  }

  /**
   * 3. 个人网盘文件列表
   */
  async listFiles(pdirFid = '0', account: PanAccount): Promise<PanDriveListResult> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const cid = !pdirFid || pdirFid === '0' ? '0' : pdirFid;

    const files: PanDriveItem[] = [];
    const seen = new Set<string>();
    const limit = 100;
    let offset = 0;

    for (let page = 0; page < 30; page++) {
      const url =
        `${PAN115_CONSTANTS.FILES_URL}?aid=1&cid=${encodeURIComponent(cid)}` +
        `&o=user_ptime&asc=0&offset=${offset}&show_dir=1&limit=${limit}` +
        `&snap=0&natsort=1&record_open_time=1&count_folders=1&format=json`;

      const resp = await net.fetch(url, {
        headers: {
          'User-Agent': PAN115_CONSTANTS.WEB_UA,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: PAN115_CONSTANTS.REFERER,
          Cookie: cookieHeader
        }
      });
      const json: any = await resp.json();
      if (!json || json.state !== true) {
        this.checkState(json, '获取 115 个人文件列表失败');
      }

      const rawData = json.data || [];
      if (!Array.isArray(rawData) || rawData.length === 0) break;

      let newCount = 0;
      for (const item of rawData) {
        const isDir = !item.fid && !!item.cid;
        const itemId = String(isDir ? item.cid : item.fid || '');
        if (!itemId || seen.has(itemId)) continue;
        seen.add(itemId);
        newCount++;
        const name = item.n || item.name || '未知文件';
        const pc = item.pc || item.pick_code;
        if (!isDir && item.fid && pc) {
          if (this.pickCodeCache.size > 5000) this.pickCodeCache.clear();
          this.pickCodeCache.set(String(item.fid), pc);
        }
        if (this.fidPidCache.size > 5000) this.fidPidCache.clear();
        this.fidPidCache.set(itemId, cid);
        files.push({
          id: itemId,
          name,
          pdir_fid: cid,
          size: isDir ? 0 : typeof item.s === 'number' ? item.s : parseInt(item.s, 10) || 0,
          isDirectory: isDir,
          updatedAt: parseTimestamp(item.t),
          formatType: inferFormatType(name, isDir)
        });
      }

      if (newCount === 0 || rawData.length < limit) break;
      offset += limit;
    }

    return {
      files,
      total: files.length,
      pdir_fid: cid
    };
  }

  /**
   * 4. 个人网盘直链（优先 proapi.115.com/app/chrome/downurl RSA+XOR 协议，回退 webapi）
   */
  async getDriveDownloadUrl(fid: string, account: PanAccount): Promise<string> {
    const urls = await this.getBatchDownloadUrls([fid], account);
    return urls[fid] || '';
  }

  private async getAppDownloadLink(pickCode: string, cookieHeader: string): Promise<PanDownloadItemLink | null> {
    if (!pickCode) return null;
    const key = Pan115Crypto.newKey();
    const payload = JSON.stringify({ pickcode: pickCode });
    const encodedData = Pan115Crypto.encode(payload, key);
    const url = `${PAN115_CONSTANTS.APP_DOWNLOAD_URL}?t=${Math.floor(Date.now() / 1000)}`;

    const form = new URLSearchParams();
    form.append('data', encodedData);

    const resp = await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'User-Agent': this.clientUa,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: PAN115_CONSTANTS.DOWNLOAD_REFERER,
        Cookie: cookieHeader
      },
      body: form.toString()
    });
    const cdnCookie = this.extractDownloadCookie(resp);
    const json: any = await resp.json();
    this.checkState(json, '获取 115 电脑端下载链接失败');
    const encryptedResp = json?.data;
    if (!encryptedResp || typeof encryptedResp !== 'string') return null;

    const decodedStr = Pan115Crypto.decode(encryptedResp, key);
    const decodedObj: any = JSON.parse(decodedStr);
    let info: any = null;
    for (const k of Object.keys(decodedObj || {})) {
      if (decodedObj[k] && typeof decodedObj[k] === 'object' && decodedObj[k].url) {
        info = decodedObj[k];
        break;
      }
    }
    const fileUrl = info?.url?.url || '';
    if (!fileUrl) return null;

    const downloadHeaders: Record<string, string> = {
      'User-Agent': this.clientUa,
      Referer: PAN115_CONSTANTS.DOWNLOAD_REFERER
    };
    const mergedCookie = this.mergeCookies(cookieHeader, cdnCookie);
    if (mergedCookie) downloadHeaders['Cookie'] = mergedCookie;

    return {
      fid: String(info.pick_code || pickCode),
      url: fileUrl,
      size: Number(info.file_size || 0) || undefined,
      filename: info.file_name || undefined,
      headers: downloadHeaders
    };
  }

  async getBatchDownloadUrlsDetail(fids: string[], account: PanAccount): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!fids || fids.length === 0) return result;

    await this.refreshClientVersion();
    const cookieHeader = buildCookieHeader(account?.cookies);

    await mapConcurrent(fids, 4, async (fid) => {
      if (!fid) return;
      try {
        let pickCode = this.pickCodeCache.get(fid) || '';
        if (!pickCode) {
          const infoResp = await net.fetch(
            `${PAN115_CONSTANTS.FILE_INFO_URL}?file_id=${encodeURIComponent(fid)}`,
            {
              headers: {
                'User-Agent': PAN115_CONSTANTS.WEB_UA,
                'X-Requested-With': 'XMLHttpRequest',
                Referer: PAN115_CONSTANTS.REFERER,
                Cookie: cookieHeader
              }
            }
          );
          const infoJson: any = await infoResp.json();
          pickCode = infoJson?.data?.[0]?.pick_code || infoJson?.data?.[0]?.pc || '';
          if (pickCode) {
            this.pickCodeCache.set(fid, pickCode);
          }
        }
        if (!pickCode) return;

        // 1. 优先 proapi 电脑端 RSA/XOR 加密协议（无大文件限制）
        try {
          const appLink = await this.getAppDownloadLink(pickCode, cookieHeader);
          if (appLink && appLink.url) {
            result[fid] = { ...appLink, fid };
            return;
          }
        } catch (appErr: any) {
          logger.warn('Pan115Provider', `115 proapi 取链失败，回退 webapi (${fid}): ${appErr.message}`);
        }

        // 2. 回退 webapi 小文件通道
        const dlResp = await net.fetch(
          `${PAN115_CONSTANTS.FILE_DOWNLOAD_URL}?pickcode=${encodeURIComponent(pickCode)}`,
          {
            headers: {
              'User-Agent': this.clientUa,
              'X-Requested-With': 'XMLHttpRequest',
              Referer: PAN115_CONSTANTS.DOWNLOAD_REFERER,
              Cookie: cookieHeader
            }
          }
        );
        const cdnCookie = this.extractDownloadCookie(dlResp);
        const dlJson: any = await dlResp.json();
        this.checkState(dlJson, '获取 115 下载链接失败');
        const data = dlJson?.data || {};
        const fileUrl = data.file_url || dlJson?.file_url || '';
        if (fileUrl) {
          const downloadHeaders: Record<string, string> = {
            'User-Agent': this.clientUa,
            Referer: PAN115_CONSTANTS.DOWNLOAD_REFERER
          };
          const mergedCookie = this.mergeCookies(cookieHeader, cdnCookie);
          if (mergedCookie) downloadHeaders['Cookie'] = mergedCookie;

          result[fid] = {
            fid,
            url: fileUrl,
            size: Number(data.file_size ?? dlJson.file_size ?? 0) || undefined,
            filename: data.file_name || dlJson.file_name,
            headers: downloadHeaders
          };
        }
      } catch (err: any) {
        logger.warn('Pan115Provider', `获取 115 个人直链失败 (${fid}): ${err.message}`);
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
   * 5. 个人盘管理：新建目录 / 重命名 / 移动 / 删除 / 创建分享
   */
  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const form = new URLSearchParams();
    form.append('pid', !parentFid || parentFid === '0' ? '0' : parentFid);
    form.append('cname', name);

    const resp = await net.fetch(PAN115_CONSTANTS.FILE_ADD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'User-Agent': PAN115_CONSTANTS.WEB_UA,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: PAN115_CONSTANTS.REFERER,
        Cookie: cookieHeader
      },
      body: form.toString()
    });
    const json: any = await resp.json();
    this.checkState(json, '115 新建文件夹失败');
    const cid = String(json?.cid || json?.data?.cid || '');
    if (!cid) {
      throw new Error('115 未返回新文件夹 cid');
    }
    this.fidPidCache.set(cid, parentFid || '0');
    return { fid: cid, name };
  }

  async renameItem(fid: string, newName: string, account: PanAccount): Promise<boolean> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const form = new URLSearchParams();
    form.append('fid', fid);
    form.append('file_name', newName);
    form.append(`files_new_name[${fid}]`, newName);

    const resp = await net.fetch(PAN115_CONSTANTS.FILE_RENAME_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'User-Agent': PAN115_CONSTANTS.WEB_UA,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: PAN115_CONSTANTS.REFERER,
        Cookie: cookieHeader
      },
      body: form.toString()
    });
    const json: any = await resp.json();
    this.checkState(json, '115 重命名失败');
    return true;
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const cookieHeader = buildCookieHeader(account?.cookies);
    const toPid = !targetDirFid || targetDirFid === '0' ? '0' : targetDirFid;
    const form = new URLSearchParams();
    form.append('pid', toPid);
    fids.forEach((id, idx) => form.append(`fid[${idx}]`, id));

    const resp = await net.fetch(PAN115_CONSTANTS.FILE_MOVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'User-Agent': PAN115_CONSTANTS.WEB_UA,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: PAN115_CONSTANTS.REFERER,
        Cookie: cookieHeader
      },
      body: form.toString()
    });
    const json: any = await resp.json();
    this.checkState(json, '115 移动文件失败');

    const moveId = json?.move_proid || json?.data?.move_proid || '';
    if (moveId) {
      for (let i = 0; i < 20; i++) {
        await sleep(400);
        try {
          const pResp = await net.fetch(
            `${PAN115_CONSTANTS.MOVE_PROGRESS_URL}?move_proid=${encodeURIComponent(moveId)}`,
            {
              headers: {
                'User-Agent': PAN115_CONSTANTS.WEB_UA,
                'X-Requested-With': 'XMLHttpRequest',
                Referer: PAN115_CONSTANTS.REFERER,
                Cookie: cookieHeader
              }
            }
          );
          const pJson: any = await pResp.json();
          if (!pJson?.state) break;
          const d = pJson.data;
          if (!d || Number(d.percent || 0) >= 100 || Number(d.count || 0) <= 0) break;
        } catch {
          break;
        }
      }
    }
    return true;
  }

  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const cookieHeader = buildCookieHeader(account?.cookies);
    let pid = this.fidPidCache.get(fids[0]) || '';
    if (!pid) {
      try {
        const infoResp = await net.fetch(
          `${PAN115_CONSTANTS.FILE_INFO_URL}?file_id=${encodeURIComponent(fids[0])}`,
          {
            headers: {
              'User-Agent': PAN115_CONSTANTS.WEB_UA,
              'X-Requested-With': 'XMLHttpRequest',
              Referer: PAN115_CONSTANTS.REFERER,
              Cookie: cookieHeader
            }
          }
        );
        const infoJson: any = await infoResp.json().catch(() => null);
        const infoPid = infoJson?.data?.[0]?.cid || infoJson?.data?.[0]?.pid;
        if (infoPid) {
          pid = String(infoPid);
          this.fidPidCache.set(fids[0], pid);
        }
      } catch {}
    }
    if (!pid) {
      try {
        const rootListed = await this.listFiles('0', account);
        const tempDir = rootListed.files.find(
          (f) => f.isDirectory && f.name === PAN115_CONSTANTS.TEMP_DIR_NAME
        );
        if (tempDir?.id) {
          const tempListed = await this.listFiles(tempDir.id, account);
          if (tempListed.files.some((f) => f.id === fids[0])) {
            pid = tempDir.id;
            this.fidPidCache.set(fids[0], pid);
          }
        }
      } catch {}
    }
    if (!pid) pid = '0';

    const form = new URLSearchParams();
    form.append('pid', pid);
    form.append('ignore_warn', '1');
    fids.forEach((fid, index) => {
      form.append(`fid[${index}]`, fid);
    });

    const sendDelete = async () => {
      const resp = await net.fetch(PAN115_CONSTANTS.DELETE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          'User-Agent': PAN115_CONSTANTS.WEB_UA,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: PAN115_CONSTANTS.REFERER,
          Cookie: cookieHeader
        },
        body: form.toString()
      });
      return resp.json() as Promise<any>;
    };

    try {
      let json = await sendDelete();
      if (Number(json?.errno ?? json?.errNo ?? 0) === 800007) {
        json = await sendDelete();
      }
      if (!json || json.state !== true) {
        const errno = Number(json?.errno ?? json?.errNo ?? 0);
        if (errno === 990001 || errno === 990002) {
          this.checkState(json, '删除 115 文件失败');
        }
        return false;
      }
      return true;
    } catch (err: any) {
      logger.error('Pan115Provider', `删除 115 文件失败: ${err.message}`);
      throw err;
    }
  }

  async createShare(params: PanCreateShareParams, account: PanAccount): Promise<PanShareCreatedInfo> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const userId = this.extractUserId(cookieHeader);
    if (!userId) {
      throw new Error('115 登录态缺少 UID，请在设置中重新登录 115 网盘');
    }
    const duration = toPan115Duration(params.expireType);

    if (!this.protocolAllowedUsers.has(userId)) {
      try {
        const pf = new URLSearchParams();
        pf.append('action', 'pubshare');
        const protoResp = await net.fetch(PAN115_CONSTANTS.ALLOW_PROTOCOL_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            'User-Agent': PAN115_CONSTANTS.WEB_UA,
            'X-Requested-With': 'XMLHttpRequest',
            Referer: PAN115_CONSTANTS.REFERER,
            Cookie: cookieHeader
          },
          body: pf.toString()
        });
        const protoJson: any = await protoResp.json().catch(() => null);
        if (protoResp.ok && protoJson?.state === true) {
          this.protocolAllowedUsers.add(userId);
        }
      } catch {}
    }

    const idText = params.fids.join(',');
    try {
      const preBody = new URLSearchParams();
      preBody.append('user_id', userId);
      preBody.append('file_ids', idText);
      preBody.append('ignore_warn', '0');
      await net.fetch(PAN115_CONSTANTS.SHARE_SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          'User-Agent': PAN115_CONSTANTS.WEB_UA,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: PAN115_CONSTANTS.REFERER,
          Cookie: cookieHeader
        },
        body: preBody.toString()
      });
    } catch {}
    const sendBody = new URLSearchParams();
    sendBody.append('user_id', userId);
    sendBody.append('file_ids', idText);
    sendBody.append('ignore_warn', '1');

    const resp = await net.fetch(PAN115_CONSTANTS.SHARE_SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'User-Agent': PAN115_CONSTANTS.WEB_UA,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: PAN115_CONSTANTS.REFERER,
        Cookie: cookieHeader
      },
      body: sendBody.toString()
    });
    const json: any = await resp.json();
    this.checkState(json, '115 创建分享失败');
    const data = json?.data || {};
    const field = (name: string) => String(data[name] || json?.[name] || '');
    const shareCode = field('share_code');
    if (!shareCode) {
      throw new Error('115 创建分享失败：响应缺少 share_code');
    }

    let warning: string | undefined;
    try {
      const updBody = new URLSearchParams();
      updBody.append('share_code', shareCode);
      updBody.append('share_duration', duration);
      const updResp = await net.fetch(PAN115_CONSTANTS.SHARE_UPDATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          'User-Agent': PAN115_CONSTANTS.WEB_UA,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: PAN115_CONSTANTS.REFERER,
          Cookie: cookieHeader
        },
        body: updBody.toString()
      });
      const updJson: any = await updResp.json();
      if (!updJson?.state) {
        warning = `分享已创建，但有效期设置未生效：${updJson?.error || updJson?.msg || '未知原因'}`;
      }
    } catch (e: any) {
      warning = `分享已创建，但有效期设置未生效：${e.message}`;
    }

    return {
      shareUrl: field('share_url') || `${PAN115_CONSTANTS.SHARE_HOST}/s/${shareCode}`,
      passcode: field('receive_code') || field('sys_receive_code'),
      shareId: shareCode,
      title: field('share_title'),
      warning
    };
  }

  /**
   * 6. 容量信息
   */
  async getQuota(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    if (!cookieHeader) return null;

    try {
      const resp = await net.fetch(PAN115_CONSTANTS.INDEX_INFO_URL, {
        headers: {
          'User-Agent': PAN115_CONSTANTS.WEB_UA,
          'X-Requested-With': 'XMLHttpRequest',
          Referer: PAN115_CONSTANTS.REFERER,
          Cookie: cookieHeader
        }
      });
      const json: any = await resp.json();
      if (json && json.state === true && json.data?.space_info) {
        const space = json.data.space_info;
        const total = space.all_total?.size || 0;
        const used = space.all_use?.size || 0;
        if (total > 0) {
          return {
            used,
            total,
            quotaText: `${formatPanBytes(used)} / ${formatPanBytes(total)}`
          };
        }
      }
    } catch (e: any) {
      logger.warn('Pan115Provider', `获取 115 容量失败: ${e.message}`);
    }
    return null;
  }
}
