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
import { logger } from '../../logger';
import {
  buildCookieHeader,
  formatPanBytes,
  inferFormatType,
  mapConcurrent,
  parseTimestamp,
  sleep
} from '../utils';
import { toPan123Expiration } from '../shareExpire';

/**
 * 123云盘 API 常量（严格依据 YunX-Desktop Pan123Constants.kt）
 */
export const PAN123_CONSTANTS = {
  API_BASE: 'https://yun.123pan.cn',
  DOWNLOAD_BASE: 'https://www.123865.com',
  SHARE_GET_URL: 'https://yun.123pan.cn/b/api/share/get',
  SHARE_DOWNLOAD_INFO_URL: 'https://www.123865.com/b/api/share/download/info',
  FILE_LIST_URL: 'https://yun.123pan.cn/b/api/file/list/new',
  FILE_INFO_URL: 'https://yun.123pan.cn/b/api/file/info',
  FILE_DOWNLOAD_INFO_URL: 'https://yun.123pan.cn/api/file/download_info',
  USER_INFO_URL: 'https://yun.123pan.cn/b/api/user/info',
  FILE_TRASH_URL: 'https://yun.123pan.cn/b/api/file/trash',
  FILE_RENAME_URL: 'https://yun.123pan.cn/b/api/file/rename',
  FILE_MOD_PID_URL: 'https://yun.123pan.cn/b/api/file/mod_pid',
  FILE_UPLOAD_REQUEST_URL: 'https://yun.123pan.cn/b/api/file/upload_request',
  SHARE_CREATE_URL: 'https://yun.123pan.cn/b/api/share/create',
  WEB_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  DART_UA: 'Dart/3.12 (dart:io)',
  PLATFORM_WEB: 'web',
  PLATFORM_ANDROID: 'android',
  APP_VERSION_WEB: '3',
  APP_VERSION_ANDROID: '39',
  DOWNLOAD_REFERER: 'https://yun.123pan.cn/',
  SIGN_TABLE: 'adefghlmyijnopkqrstubcvwsz',
  SIGN_OS: 'web',
  SIGN_VER: '3',
  SIGN_OFFSET_SECONDS: 57600
};

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Hex(input: string): string {
  const buf = Buffer.from(input, 'utf8');
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16);
}

/**
 * 计算 123 云盘签名头 auth-key / auth-value（对齐 YunX Pan123Api.makeSign）
 */
export function makePan123Sign(
  apiPath: string,
  ts = Math.floor(Date.now() / 1000)
): { authKey: string; authValue: string } {
  const d = new Date((ts + PAN123_CONSTANTS.SIGN_OFFSET_SECONDS) * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const minute =
    String(d.getUTCFullYear()) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes());

  let substituted = '';
  for (let i = 0; i < minute.length; i++) {
    const idx = minute.charCodeAt(i) - 48;
    substituted += PAN123_CONSTANTS.SIGN_TABLE[idx] || 'a';
  }
  const authKey = crc32Hex(substituted);
  const random = Math.floor(Math.random() * 10_000_000);
  const data = `${ts}|${random}|${apiPath}|${PAN123_CONSTANTS.SIGN_OS}|${PAN123_CONSTANTS.SIGN_VER}|${authKey}`;
  const authValue = `${ts}-${random}-${crc32Hex(data)}`;
  return { authKey, authValue };
}

interface Pan123ItemMeta {
  fid: string;
  name: string;
  size: number;
  isDirectory: boolean;
  s3KeyFlag: string;
  etag: string;
  storageNode: string;
}

export class Pan123Provider implements PanProvider, PanDriveProvider {
  panType = '123pan' as const;

  private defaultLoginUuid = crypto.randomBytes(16).toString('hex');
  private driveMetaCache = new Map<string, Pan123ItemMeta>();

  canHandle(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('123pan.com') ||
      lower.includes('123pan.cn') ||
      lower.includes('123684.com') ||
      lower.includes('123865.com') ||
      lower.includes('123912.com')
    );
  }

  private extractShareKey(url: string): string {
    const m1 = url.match(/\/s\/([A-Za-z0-9-]+)/i);
    if (m1) return m1[1];
    const m2 = url.match(/share\.123pan\.cn\/123pan\/([A-Za-z0-9-]+)/i);
    if (m2) return m2[1];
    const m3 = url.match(/[?&]sk=([A-Za-z0-9-]+)/i);
    return m3 ? m3[1] : '';
  }

  private makeSign(apiPath: string, ts = Math.floor(Date.now() / 1000)): { authKey: string; authValue: string } {
    return makePan123Sign(apiPath, ts);
  }

  private getTokenAndUuid(account?: PanAccount): { token: string; loginUuid: string; cookieHeader: string } {
    const token = account?.extra?.authorToken || account?.cookies?.token || account?.token || '';
    const loginUuid = account?.extra?.loginUuid || this.defaultLoginUuid;
    const cookieHeader = buildCookieHeader(account?.cookies);
    return { token, loginUuid, cookieHeader };
  }

  private requireToken(account: PanAccount): { token: string; loginUuid: string; cookieHeader: string } {
    const ctx = this.getTokenAndUuid(account);
    if (!ctx.token) {
      throw new Error('123云盘未登录或授权 Token 缺失，请在设置中重新登录');
    }
    return ctx;
  }

  private async getAuth(url: string, signPath: string, account: PanAccount): Promise<any> {
    const { token, loginUuid, cookieHeader } = this.requireToken(account);
    const { authKey, authValue } = this.makeSign(signPath);
    const resp = await net.fetch(url, {
      method: 'GET',
      headers: {
        platform: PAN123_CONSTANTS.PLATFORM_WEB,
        'app-version': PAN123_CONSTANTS.APP_VERSION_WEB,
        authorization: `Bearer ${token}`,
        loginuuid: loginUuid,
        'auth-key': authKey,
        'auth-value': authValue,
        'User-Agent': PAN123_CONSTANTS.WEB_UA,
        Accept: 'application/json, text/plain, */*',
        Referer: PAN123_CONSTANTS.DOWNLOAD_REFERER,
        ...(cookieHeader ? { Cookie: cookieHeader } : {})
      }
    });
    const text = await resp.text();
    if (!text) throw new Error(`123云盘请求失败 (${resp.status})`);
    return JSON.parse(text);
  }

  private async postAuth(
    url: string,
    signPath: string,
    bodyObj: Record<string, any>,
    account: PanAccount,
    platform = PAN123_CONSTANTS.PLATFORM_WEB,
    appVersion = PAN123_CONSTANTS.APP_VERSION_WEB
  ): Promise<any> {
    const { token, loginUuid, cookieHeader } = this.requireToken(account);
    const { authKey, authValue } = this.makeSign(signPath);
    const resp = await net.fetch(url, {
      method: 'POST',
      headers: {
        platform,
        'app-version': appVersion,
        authorization: `Bearer ${token}`,
        loginuuid: loginUuid,
        'auth-key': authKey,
        'auth-value': authValue,
        'Content-Type': 'application/json;charset=UTF-8',
        'User-Agent': PAN123_CONSTANTS.WEB_UA,
        Referer: PAN123_CONSTANTS.DOWNLOAD_REFERER,
        ...(cookieHeader ? { Cookie: cookieHeader } : {})
      },
      body: JSON.stringify(bodyObj)
    });
    const text = await resp.text();
    if (!text) throw new Error(`123云盘请求失败 (${resp.status})`);
    return JSON.parse(text);
  }

  private checkOk(json: any, fallback: string) {
    const code = Number(json?.code ?? -1);
    if (code === 0) return;
    if (code === 401) {
      throw new Error('123云盘登录态已过期，请在设置中重新登录');
    }
    throw new Error(json?.message || `${fallback} (code=${code})`);
  }

  private decodeDownloadUrl(downloadUrl: string): string | null {
    const trimmed = (downloadUrl || '').trim();
    if (!trimmed) return null;
    if (!trimmed.includes('://')) {
      try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
        if (/^https?:\/\//i.test(decoded)) return decoded;
      } catch {}
      return null;
    }
    const idx = trimmed.indexOf('params=');
    if (idx < 0) return null;
    const rawParams = trimmed.slice(idx + 'params='.length).split('&')[0];
    try {
      const normalized = rawParams.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(normalized, 'base64').toString('utf8');
      if (/^https?:\/\//i.test(decoded)) return decoded;
    } catch {}
    return null;
  }

  private async followRedirectUrl(initialUrl: string): Promise<string> {
    let current = initialUrl;
    for (let hop = 0; hop < 5; hop++) {
      try {
        const controller = new AbortController();
        const resp = await net.fetch(current, {
          method: 'GET',
          headers: {
            Referer: PAN123_CONSTANTS.DOWNLOAD_REFERER,
            'User-Agent': PAN123_CONSTANTS.DART_UA
          },
          signal: controller.signal
        });
        const lenStr = resp.headers.get('content-length');
        const len = lenStr ? parseInt(lenStr, 10) : -1;
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        if ((len >= 0 && len <= 8192) || ct.includes('application/json')) {
          const text = await resp.text();
          if (text.trimStart().startsWith('{')) {
            const json: any = JSON.parse(text);
            const nextUrl = json?.data?.redirect_url;
            if (nextUrl && typeof nextUrl === 'string') {
              current = nextUrl;
              continue;
            }
          }
          return current;
        }
        // 非小 JSON 跳转页（真实文件流），立即中止流探测并返回当前 URL
        controller.abort();
        return current;
      } catch {
        return current;
      }
    }
    return current;
  }

  /**
   * 1. 递归展开 123云盘分享目录树（对齐 YunX Pan123Api.getShareFiles：无提取码不传 SharePwd；Next=="-1" 末页，空串表示还有下一页）
   */
  async parse(url: string, password = '', _account?: PanAccount): Promise<PanParseResult> {
    const shareKey = this.extractShareKey(url);
    if (!shareKey) {
      return {
        panType: '123pan',
        shareTitle: '123云盘',
        files: [],
        error: '无效的123云盘分享链接'
      };
    }

    logger.info('Pan123Provider', `开始解析123云盘分享: shareKey=${shareKey}`);

    try {
      const allFiles: PanFileItem[] = [];
      let shareTitle = '123云盘资源';
      const urlPwdMatch = url.match(/[?&](?:pwd|password|passcode)=([A-Za-z0-9]+)/i);
      const effectivePwd = (password || urlPwdMatch?.[1] || '').trim();

      const scanDirectory = async (parentFileId: string, relativePrefix: string): Promise<void> => {
        let page = 1;
        const subDirs: Array<{ id: string; path: string }> = [];

        while (page <= 100) {
          let apiUrl =
            `${PAN123_CONSTANTS.SHARE_GET_URL}?limit=100&next=0` +
            `&orderBy=file_name&orderDirection=asc&shareKey=${encodeURIComponent(shareKey)}` +
            `&ParentFileId=${encodeURIComponent(parentFileId)}&Page=${page}`;
          if (effectivePwd) {
            apiUrl += `&SharePwd=${encodeURIComponent(effectivePwd)}`;
          }

          const resp = await net.fetch(apiUrl, {
            headers: {
              'User-Agent': PAN123_CONSTANTS.DART_UA,
              Referer: `https://www.123pan.com/s/${shareKey}`
            }
          });

          const resJson: any = await resp.json();
          if (!resJson || resJson.code !== 0) {
            throw new Error(resJson?.message || '获取123云盘分享文件列表失败');
          }
          if (resJson.data?.Expired) {
            throw new Error('该 123 云盘分享已失效');
          }

          if (resJson.data?.ShareTitle) {
            shareTitle = resJson.data.ShareTitle;
          }

          const infoList = resJson.data?.InfoList || [];
          if (!Array.isArray(infoList) || infoList.length === 0) {
            break;
          }

          for (const item of infoList) {
            const isDir = Number(item.Type) === 1;
            const name = item.FileName || '未知文件';
            const itemRelativePath = relativePrefix ? `${relativePrefix}/${name}` : name;
            const s3KeyFlag = String(item.S3KeyFlag || item.S3keyFlag || '');

            if (isDir) {
              subDirs.push({ id: String(item.FileId), path: itemRelativePath });
            } else {
              const fileSize = typeof item.Size === 'number' ? item.Size : parseInt(item.Size, 10) || 0;
              allFiles.push({
                id: String(item.FileId),
                name,
                path: itemRelativePath,
                size: fileSize,
                isDirectory: false,
                downloadUrl: undefined,
                rawInfo: {
                  fid: String(item.FileId),
                  fidToken: `${s3KeyFlag}|${item.Etag || ''}|${item.StorageNode || ''}`,
                  pwdId: shareKey,
                  stoken: effectivePwd,
                  FileId: item.FileId,
                  FileName: name,
                  Size: fileSize,
                  Type: item.Type ?? 0,
                  shareKey,
                  sharePwd: effectivePwd,
                  S3KeyFlag: s3KeyFlag,
                  S3keyFlag: s3KeyFlag,
                  Etag: item.Etag || '',
                  StorageNode: item.StorageNode || ''
                }
              });
            }
          }

          const respNext = resJson.data?.Next;
          if (String(respNext) === '-1' || Number(respNext) === -1) {
            break;
          }
          page++;
        }

        if (subDirs.length > 0) {
          await mapConcurrent(subDirs, 4, async (sub) => {
            await scanDirectory(sub.id, sub.path);
          });
        }
      };

      await scanDirectory('0', '');

      return {
        panType: '123pan',
        shareTitle,
        files: allFiles
      };
    } catch (err: any) {
      logger.error('Pan123Provider', `解析异常: ${err.message}`);
      return {
        panType: '123pan',
        shareTitle: '123云盘',
        files: [],
        error: `123云盘解析异常: ${err.message}`
      };
    }
  }

  /**
   * 2. 分享文件取下载直链（含 auth-key/auth-value 签名 + decodeDownloadUrl + redirect_url 追踪）
   */
  async getShareDownloadUrlsDetail(
    items: PanShareDownloadItem[],
    account?: PanAccount
  ): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!items || items.length === 0) return result;

    if (!account || !this.getTokenAndUuid(account).token) {
      throw new Error('123云盘下载分享文件需要登录账号，请先在设置中登录123云盘');
    }

    this.requireToken(account);
    const downloadHeaders: Record<string, string> = {
      'User-Agent': PAN123_CONSTANTS.WEB_UA,
      Referer: PAN123_CONSTANTS.DOWNLOAD_REFERER
    };

    await mapConcurrent(items, 4, async (item) => {
      if (!item.fid) return;
      const parts = (item.fidToken || item.extra?.fidToken || '').split('|');
      const s3KeyFlag = item.extra?.S3KeyFlag || item.extra?.S3keyFlag || parts[0] || '';
      const etag = item.extra?.Etag || parts[1] || '';
      const sizeNum = Number(item.extra?.Size ?? 0);
      const shareKey = item.pwdId || item.extra?.shareKey || item.extra?.pwdId || '';

      const baseBody: Record<string, any> = {
        ShareKey: shareKey,
        FileID: String(item.fid),
        S3KeyFlag: s3KeyFlag,
        Size: sizeNum,
        Etag: etag
      };

      let json = await this.postAuth(
        PAN123_CONSTANTS.SHARE_DOWNLOAD_INFO_URL,
        '/b/api/share/download/info',
        baseBody,
        account,
        PAN123_CONSTANTS.PLATFORM_ANDROID,
        PAN123_CONSTANTS.APP_VERSION_ANDROID
      );
      if (Number(json?.code ?? -1) !== 0 && /^\d+$/.test(String(item.fid))) {
        json = await this.postAuth(
          PAN123_CONSTANTS.SHARE_DOWNLOAD_INFO_URL,
          '/b/api/share/download/info',
          {
            ...baseBody,
            FileID: Number(item.fid)
          },
          account,
          PAN123_CONSTANTS.PLATFORM_ANDROID,
          PAN123_CONSTANTS.APP_VERSION_ANDROID
        );
      }
      this.checkOk(json, '获取123云盘分享下载链接失败');

      const rawUrl = json?.data?.DownloadURL || json?.data?.DownloadUrl || '';
      if (!rawUrl) return;
      const decoded = this.decodeDownloadUrl(rawUrl) || rawUrl;
      const realUrl = await this.followRedirectUrl(decoded);
      result[item.fid] = {
        fid: item.fid,
        url: realUrl,
        size: sizeNum || Number(json?.data?.Size || 0) || undefined,
        filename: item.extra?.FileName || json?.data?.FileName,
        headers: downloadHeaders
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
   * 3. 分享转存至个人盘（mshare 子域 copy/save + copy/save/get 轮询）
   */
  async saveShareItems(
    items: PanShareDownloadItem[],
    targetDirFid: string,
    account: PanAccount
  ): Promise<{ savedCount: number }> {
    const { token, loginUuid } = this.requireToken(account);
    const parentId = Number(targetDirFid && targetDirFid !== '0' ? targetDirFid : 0) || 0;

    const groups = new Map<string, { shareId: string; shareKey: string; sharePwd: string; list: any[] }>();
    for (const item of items) {
      const parts = (item.fidToken || item.extra?.fidToken || '').split('|');
      const s3KeyFlag = item.extra?.S3KeyFlag || item.extra?.S3keyFlag || parts[0] || '';
      const etag = item.extra?.Etag || parts[1] || '';
      const storageNode = item.extra?.StorageNode || parts[2] || '';
      const shareId = s3KeyFlag.split('-')[0];
      if (!shareId || !/^[A-Za-z0-9-]+$/.test(shareId)) {
        throw new Error('无法识别123分享节点信息，请重新解析链接后再转存');
      }
      const shareKey = item.pwdId || item.extra?.shareKey || item.extra?.pwdId || '';
      const sharePwd = item.extra?.sharePwd || item.stoken || '';
      const fileId = Number(item.fid) || 0;
      const fileName = item.extra?.FileName || item.extra?.name || '';
      const fileSize = Number(item.extra?.Size ?? 0);
      const itemType = Number(item.extra?.Type ?? 0);

      const groupKey = `${shareId}\0${shareKey}\0${sharePwd}`;
      const existing = groups.get(groupKey) || { shareId, shareKey, sharePwd, list: [] };
      existing.list.push({
        fileID: fileId,
        fileId: fileId,
        size: fileSize,
        etag,
        type: itemType,
        parentFileID: parentId,
        parentFileId: parentId,
        fileName,
        driveID: 0,
        driveId: 0,
        s3keyFlag: s3KeyFlag,
        S3KeyFlag: s3KeyFlag,
        StorageNode: storageNode
      });
      groups.set(groupKey, existing);
    }

    let savedCount = 0;
    for (const group of Array.from(groups.values())) {
      const body = {
        fileList: group.list,
        shareKey: group.shareKey,
        sharePwd: group.sharePwd || '',
        currentLevel: 1,
        superAdmin: null
      };

      const saveUrl = `https://${group.shareId}.mshare.123pan.cn/b/api/restful/goapi/v1/file/copy/save`;
      const resp = await net.fetch(saveUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          LoginUuid: loginUuid,
          platform: PAN123_CONSTANTS.PLATFORM_WEB,
          'Content-Type': 'application/json;charset=UTF-8',
          'User-Agent': PAN123_CONSTANTS.DART_UA
        },
        body: JSON.stringify(body)
      });
      const saveText = await resp.text();
      if (!saveText || saveText.trim().startsWith('<')) {
        throw new Error(`123云盘转存返回异常响应 (HTTP ${resp.status})`);
      }
      const json: any = JSON.parse(saveText);
      this.checkOk(json, '123云盘转存失败');

      const taskId = json?.data?.taskID;
      if (taskId) {
        let completed = false;
        for (let i = 0; i < 20; i++) {
          await sleep(1000);
          const pollUrl = `https://${group.shareId}.mshare.123pan.cn/b/api/restful/goapi/v1/file/copy/save/get?taskID=${encodeURIComponent(String(taskId))}`;
          const pResp = await net.fetch(pollUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              LoginUuid: loginUuid,
              platform: PAN123_CONSTANTS.PLATFORM_WEB,
              'User-Agent': PAN123_CONSTANTS.DART_UA
            }
          });
          const pText = await pResp.text();
          if (!pText || pText.trim().startsWith('<')) continue;
          const pJson: any = JSON.parse(pText);
          if (pJson?.code !== 0) {
            if (pJson?.message) throw new Error(`转存失败：${pJson.message}`);
            continue;
          }
          const d = pJson.data || {};
          const statusNum = Number(d.status ?? 0);
          const state = String(d.state || '').toLowerCase();
          if (statusNum === 3 || state === 'failed' || state === 'error') {
            throw new Error(d.failReason || d.message || '123云盘转存任务执行失败（可能空间不足或包含受限文件）');
          }
          const done =
            Boolean(d.finished) ||
            statusNum === 2 ||
            state === 'success' ||
            state === 'done' ||
            state === '2' ||
            Boolean(d.fileId || d.FileId || d.newFileId);
          if (done) {
            completed = true;
            break;
          }
        }
        if (!completed) {
          throw new Error('123云盘转存任务等待超时，请稍后到个人网盘内确认结果');
        }
      }
      savedCount += group.list.length;
    }

    return { savedCount };
  }

  /**
   * 4. 个人网盘文件列表与管理（对齐 YunX Pan123Api）
   */
  async listFiles(pdirFid = '0', account: PanAccount): Promise<PanDriveListResult> {
    const targetFid = !pdirFid || pdirFid === '0' ? '0' : pdirFid;
    const files: PanDriveItem[] = [];
    const seen = new Set<string>();
    let nextCursor = '0';

    for (let page = 1; page <= 50; page++) {
      const url =
        `${PAN123_CONSTANTS.FILE_LIST_URL}?driveId=0&limit=100&next=${encodeURIComponent(nextCursor)}` +
        `&orderBy=update_time&orderDirection=desc&parentFileId=${encodeURIComponent(targetFid)}` +
        `&trashed=false&SearchData=&Page=${page}&OnlyLookAbnormalFile=0&event=homeListFile&operateType=1&inDirectSpace=false`;

      const json = await this.getAuth(url, '/b/api/file/list/new', account);
      this.checkOk(json, '获取123云盘目录失败');

      const rawList = json?.data?.InfoList || [];
      if (!Array.isArray(rawList) || rawList.length === 0) break;

      let added = 0;
      for (const item of rawList) {
        const fid = String(item.FileId);
        if (!fid || seen.has(fid)) continue;
        seen.add(fid);
        added++;
        const isDir = Number(item.Type) === 1;
        const name = item.FileName || '未知文件';
        const size = typeof item.Size === 'number' ? item.Size : parseInt(item.Size, 10) || 0;
        this.driveMetaCache.set(fid, {
          fid,
          name,
          size,
          isDirectory: isDir,
          s3KeyFlag: String(item.S3KeyFlag || item.S3keyFlag || ''),
          etag: String(item.Etag || ''),
          storageNode: String(item.StorageNode || '')
        });
        files.push({
          id: fid,
          name,
          pdir_fid: targetFid,
          size,
          isDirectory: isDir,
          updatedAt: parseTimestamp(item.UpdateAt),
          formatType: inferFormatType(name, isDir),
          downloadUrl: item.DownloadUrl || undefined,
          extra: {
            s3KeyFlag: String(item.S3KeyFlag || item.S3keyFlag || ''),
            etag: String(item.Etag || ''),
            storageNode: String(item.StorageNode || '')
          }
        });
      }

      const respNext = json?.data?.Next;
      if (
        added === 0 ||
        String(respNext) === '-1' ||
        Number(respNext) === -1
      ) {
        break;
      }
      nextCursor = respNext !== undefined && respNext !== null && String(respNext) !== '' ? String(respNext) : '0';
    }

    return {
      files,
      total: files.length,
      pdir_fid: targetFid
    };
  }

  private async ensureDriveMeta(fids: string[], account: PanAccount): Promise<void> {
    const missing = Array.from(new Set(fids)).filter((fid) => fid && !this.driveMetaCache.has(fid));
    if (missing.length === 0) return;

    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      try {
        const json = await this.postAuth(
          PAN123_CONSTANTS.FILE_INFO_URL,
          '/b/api/file/info',
          { fileIdList: batch.map((id) => ({ fileId: Number(id) || id })) },
          account
        );
        const infoList = json?.data?.infoList || json?.data?.InfoList || json?.data?.list || [];
        if (Array.isArray(infoList)) {
          for (const item of infoList) {
            const fid = String(item?.FileId ?? item?.fileId ?? '');
            if (!fid) continue;
            this.driveMetaCache.set(fid, {
              fid,
              name: String(item?.FileName || item?.fileName || ''),
              size: Number(item?.Size ?? item?.size ?? 0) || 0,
              isDirectory: Number(item?.Type ?? item?.type ?? 0) === 1,
              s3KeyFlag: String(item?.S3KeyFlag || item?.S3keyFlag || ''),
              etag: String(item?.Etag || item?.etag || ''),
              storageNode: String(item?.StorageNode || item?.storageNode || '')
            });
          }
        }
      } catch (err: any) {
        logger.warn('Pan123Provider', `回填123云盘文件元数据失败: ${err.message}`);
      }
    }
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
    const result: Record<string, PanDownloadItemLink> = {};
    if (!fids || fids.length === 0) return result;

    this.requireToken(account);
    await this.ensureDriveMeta(fids, account);
    const downloadHeaders: Record<string, string> = {
      'User-Agent': PAN123_CONSTANTS.WEB_UA,
      Referer: PAN123_CONSTANTS.DOWNLOAD_REFERER
    };

    await mapConcurrent(fids, 4, async (fid) => {
      if (!fid) return;
      const meta = this.driveMetaCache.get(fid);
      const body = {
        driveId: 0,
        etag: meta?.etag || '',
        fileId: Number(fid) || fid,
        s3keyFlag: meta?.s3KeyFlag || '',
        type: 0,
        fileName: meta?.name || '',
        size: meta?.size || 0
      };
      const json = await this.postAuth(
        PAN123_CONSTANTS.FILE_DOWNLOAD_INFO_URL,
        '/api/file/download_info',
        body,
        account
      );
      this.checkOk(json, '获取123云盘下载链接失败');
      const rawUrl = json?.data?.DownloadUrl || json?.data?.DownloadURL || '';
      if (!rawUrl) return;
      const decoded = this.decodeDownloadUrl(rawUrl) || rawUrl;
      const realUrl = await this.followRedirectUrl(decoded);
      result[fid] = {
        fid,
        url: realUrl,
        size: meta?.size || Number(json?.data?.Size || 0) || undefined,
        filename: meta?.name || json?.data?.FileName,
        headers: downloadHeaders
      };
    });

    return result;
  }

  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const parentId = Number(!parentFid || parentFid === '0' ? 0 : parentFid) || 0;
    const json = await this.postAuth(
      PAN123_CONSTANTS.FILE_UPLOAD_REQUEST_URL,
      '/b/api/file/upload_request',
      {
        driveId: 0,
        parentFileId: parentId,
        fileName: name,
        size: 0,
        type: 1,
        etag: '',
        duplicate: 1,
        NotReuse: true,
        RequestSource: null
      },
      account
    );
    this.checkOk(json, '123云盘新建文件夹失败');
    const data = json?.data || {};
    const newId = String(data?.Info?.FileId || data?.FileId || data?.fileId || '');
    if (!newId || newId === '0') {
      throw new Error('123云盘未返回新文件夹编号');
    }
    this.driveMetaCache.set(newId, {
      fid: newId,
      name,
      size: 0,
      isDirectory: true,
      s3KeyFlag: '',
      etag: '',
      storageNode: ''
    });
    return { fid: newId, name };
  }

  async renameItem(fid: string, newName: string, account: PanAccount): Promise<boolean> {
    const json = await this.postAuth(
      PAN123_CONSTANTS.FILE_RENAME_URL,
      '/b/api/file/rename',
      {
        driveId: 0,
        fileId: Number(fid) || fid,
        fileName: newName,
        duplicate: 1,
        event: 'fileRename',
        operatePlace: 'right',
        RequestSource: null
      },
      account
    );
    this.checkOk(json, '123云盘重命名失败');
    const prev = this.driveMetaCache.get(fid);
    if (prev) this.driveMetaCache.set(fid, { ...prev, name: newName });
    return true;
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const parentFileId = Number(!targetDirFid || targetDirFid === '0' ? 0 : targetDirFid) || 0;
    const json = await this.postAuth(
      PAN123_CONSTANTS.FILE_MOD_PID_URL,
      '/b/api/file/mod_pid',
      {
        fileIdList: fids.map((id) => ({ FileId: Number(id) || id })),
        parentFileId,
        event: 'fileMove',
        operatePlace: 1,
        RequestSource: null
      },
      account
    );
    this.checkOk(json, '123云盘移动文件失败');
    return true;
  }

  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    await this.ensureDriveMeta(fids, account);
    const fileTrashInfoList = fids.map((fid) => {
      const meta = this.driveMetaCache.get(fid);
      return {
        FileId: Number(fid) || fid,
        FileName: meta?.name || '',
        Type: meta?.isDirectory ? 1 : 0,
        Size: meta?.size || 0,
        S3KeyFlag: meta?.s3KeyFlag || '',
        Etag: meta?.etag || ''
      };
    });
    const json = await this.postAuth(
      PAN123_CONSTANTS.FILE_TRASH_URL,
      '/b/api/file/trash',
      {
        driveId: 0,
        fileTrashInfoList,
        operation: true,
        event: 'intoRecycle',
        operatePlace: 1,
        safeBox: false
      },
      account
    );
    this.checkOk(json, '123云盘删除文件失败');
    return true;
  }

  async createShare(params: PanCreateShareParams, account: PanAccount): Promise<PanShareCreatedInfo> {
    const expiration = toPan123Expiration(params.expireType);
    const sharePwd = (params.passcode || '').trim();
    const firstName = this.driveMetaCache.get(params.fids[0])?.name || '123云盘分享';
    const fileIdList =
      params.fids.length === 1
        ? Number(params.fids[0]) || params.fids[0]
        : params.fids.map((id) => Number(id) || id);

    const body: Record<string, any> = {
      driveId: 0,
      expiration,
      fileIdList,
      shareName: firstName,
      event: 'shareCreate',
      fileNum: params.fids.length,
      shareModality: 4,
      trafficLimitSwitch: 1,
      trafficLimit: 0,
      trafficSwitch: 1,
      fillPwdSwitch: 0
    };
    if (sharePwd) {
      body.sharePwd = sharePwd;
    }

    const json = await this.postAuth(
      PAN123_CONSTANTS.SHARE_CREATE_URL,
      '/b/api/share/create',
      body,
      account
    );
    this.checkOk(json, '123云盘创建分享失败');
    const data = json?.data;
    const shareKey = data?.ShareKey;
    if (!shareKey) {
      throw new Error('123云盘创建分享失败：未返回 ShareKey');
    }
    const shareUrl =
      data?.shareLinkList?.list?.[0] ||
      data?.shareLinkList?.standBy ||
      `https://www.123pan.com/s/${shareKey}`;
    return {
      shareUrl,
      passcode: sharePwd,
      shareId: shareKey,
      title: firstName
    };
  }

  async getQuota(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    try {
      const json = await this.getAuth(PAN123_CONSTANTS.USER_INFO_URL, '/b/api/user/info', account);
      this.checkOk(json, '获取123云盘容量失败');
      const d = json?.data;
      if (!d) return null;
      const used = Number(d.SpaceUsed ?? d.UsedSpace ?? 0);
      const total =
        d.SpacePermanent !== undefined || d.SpaceTemp !== undefined
          ? Number(d.SpacePermanent || 0) + Number(d.SpaceTemp || 0)
          : Number(d.TotalSpace || 0);
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
