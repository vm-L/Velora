import crypto from 'crypto';
import http from 'http';
import https from 'https';
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
import {
  formatPanBytes,
  inferFormatType,
  mapConcurrent,
  panHttpRequest,
  parseTimestamp,
  sleep
} from '../utils';
import { toXunleiExpirationDays } from '../shareExpire';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 网页版 captcha 签名 9 条盐，顺序敏感（来自 YunX-Desktop XunleiWebCredential.kt） */
const WEB_CAPTCHA_SALTS = [
  'DVM8BRQfJWDsIE0JbH5GCUM0z0jU1yGymBTj4Eyloazv1F+w0G7ig',
  'T',
  'a1fUxfjOO1/dW++DpGupRgw9P93L',
  'aktKbp+/lQc3MvlMHIupt65LjAgJOL6ttMFvTKK+7+WKubSf9rT',
  'SB/ne9FQUnQmWz4Wuv9KqKfGOBOCUubpHpECxOHfD4hNoMclYA2Yq',
  'sOZFBQ8IMFy3OFjAIf/eA65iqFvS9TIKzLyrhiT6',
  'ZhJdLgL7MGh2GanboB0yk',
  'Osf',
  'v'
];

/**
 * 迅雷云盘常量（严格依据 YunX-Desktop XunleiConstants.kt / XunleiWebCredential.kt）
 */
export const XUNLEI_CONSTANTS = {
  AUTH_BASE: 'https://xluser-ssl.xunlei.com',
  PAN_BASE: 'https://api-pan.xunlei.com',
  CAPTCHA_INIT_URL: 'https://xluser-ssl.xunlei.com/v1/shield/captcha/init',
  FILES_URL: 'https://api-pan.xunlei.com/drive/v1/files',
  ABOUT_URL: 'https://api-pan.xunlei.com/drive/v1/about',
  SHARE_URL: 'https://api-pan.xunlei.com/drive/v1/share',
  SHARE_DETAIL_URL: 'https://api-pan.xunlei.com/drive/v1/share/detail',
  RESTORE_URL: 'https://api-pan.xunlei.com/drive/v1/share/restore',
  TASKS_URL: 'https://api-pan.xunlei.com/drive/v1/tasks',
  MOVE_URL: 'https://api-pan.xunlei.com/drive/v1/files:batchMove',
  TRASH_URL: 'https://api-pan.xunlei.com/drive/v1/files:batchTrash',
  BATCH_DELETE_URL: 'https://api-pan.xunlei.com/drive/v1/files:batchDelete',
  TEMP_DIR_NAME: 'Velora临时转存',
  REFRESH_URL: 'https://xluser-ssl.xunlei.com/v1/auth/token',
  WEB_CLIENT_ID: 'Xqp0kJBXWhwaTpB6',
  WEB_CLIENT_VERSION: '1.93.10',
  WEB_PACKAGE_NAME: 'pan.xunlei.com',
  WEB_SIGN_HOST: 'pan.xunlei.com',
  WEB_CAPTCHA_TOKEN_TTL_MS: 270_000,
  DESKTOP_UA,
  DESKTOP_SEC_CH_UA: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  DESKTOP_SEC_CH_UA_MOBILE: '?0',
  DESKTOP_SEC_CH_UA_PLATFORM: '"Windows"',
  APP_UA:
    'ANDROID-com.xunlei.downloadprovider/8.31.0.9726 netWorkType/5G appid/40 deviceName/Xiaomi_M2004j7ac deviceModel/M2004J7AC OSVersion/12 protocolVersion/301 platformVersion/10 sdkVersion/512000 Oauth2Client/0.9 (Linux 4_14_186-perf-gddfs8vbb238b) (JAVA 0)',
  WEB_UA: DESKTOP_UA
};

export function normalizeXunleiClientId(raw?: string): string {
  const base = String(raw || '').split('@')[0].trim();
  if (!base || base === 'Xp6pAdwyJv9sQuoN') {
    return XUNLEI_CONSTANTS.WEB_CLIENT_ID;
  }
  return base;
}

function parseRawDeviceId(raw?: string): string {
  if (!raw) return '';
  let text = String(raw).trim();
  try {
    text = decodeURIComponent(text);
  } catch {}
  text = text.replace(/^"|"$/g, '').trim();
  if (!text) return '';
  if (text.includes('.') && text.length > 32) {
    const seg = text.split('.')[1];
    if (seg) return seg.slice(0, 32);
  }
  return text;
}

export function extractXunleiDeviceId(rawDeviceId?: string, cookieDeviceId?: string, fallback = ''): string {
  return parseRawDeviceId(rawDeviceId) || parseRawDeviceId(cookieDeviceId) || fallback;
}

export function parseXunleiJwtSub(token?: string): string {
  if (!token) return '';
  try {
    const parts = String(token).split('.');
    if (parts.length < 2 || !parts[1]) return '';
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json);
    return String(payload?.sub || payload?.user_id || '');
  } catch {
    return '';
  }
}

export function computeXunleiWebCaptchaSign(deviceId: string, timestampMs: number): string {
  let h =
    XUNLEI_CONSTANTS.WEB_CLIENT_ID +
    XUNLEI_CONSTANTS.WEB_CLIENT_VERSION +
    XUNLEI_CONSTANTS.WEB_SIGN_HOST +
    deviceId +
    String(timestampMs);
  for (const salt of WEB_CAPTCHA_SALTS) {
    h = crypto.createHash('md5').update(h + salt, 'utf8').digest('hex');
  }
  return `1.${h}`;
}

export class XunleiProvider implements PanProvider, PanDriveProvider {
  panType = 'xunlei' as const;
  private itemNameCache = new Map<string, string>();
  private captchaCache = new Map<string, { token: string; expiresAt: number }>();

  canHandle(url: string): boolean {
    if (!url) return false;
    return url.toLowerCase().includes('pan.xunlei.com');
  }

  invalidateSession(): void {
    this.captchaCache.clear();
  }

  private fallbackDeviceId = crypto.createHash('md5').update(process.platform + process.arch).digest('hex');
  private refreshInFlight: Promise<boolean> | null = null;
  private ensureTempDirPromise: Promise<string> | null = null;

  private probeDirectUrl(urlStr: string): Promise<boolean> {
    return new Promise((resolve) => {
      let parsed: URL;
      try {
        parsed = new URL(urlStr);
      } catch {
        resolve(false);
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        resolve(false);
        return;
      }

      let settled = false;
      let timer: NodeJS.Timeout | null = null;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resolve(ok);
      };

      const transport = parsed.protocol === 'https:' ? https : http;
      const req = transport.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname.replace(/^\[|\]$/g, ''),
          port: parsed.port || undefined,
          path: `${parsed.pathname}${parsed.search}`,
          method: 'GET',
          headers: {
            'User-Agent': XUNLEI_CONSTANTS.APP_UA,
            Range: 'bytes=0-0',
            'Accept-Encoding': 'identity'
          }
        },
        (res) => {
          const ok = res.statusCode === 200 || res.statusCode === 206;
          finish(ok);
          try {
            req.destroy();
          } catch {}
        }
      );

      timer = setTimeout(() => {
        finish(false);
        try {
          req.destroy();
        } catch {}
      }, 5000);

      req.on('error', () => finish(false));
      req.end();
    });
  }

  private async ensureTempDir(account: PanAccount): Promise<string> {
    if (this.ensureTempDirPromise) {
      return this.ensureTempDirPromise;
    }
    this.ensureTempDirPromise = (async () => {
      try {
        const listed = await this.listFiles('0', account);
        const existing = listed.files.find(
          (f) => f.isDirectory && f.name === XUNLEI_CONSTANTS.TEMP_DIR_NAME
        );
        if (existing?.id) {
          return existing.id;
        }
      } catch {}

      const created = await this.createFolder('0', XUNLEI_CONSTANTS.TEMP_DIR_NAME, account);
      return created.fid;
    })().finally(() => {
      this.ensureTempDirPromise = null;
    });
    return this.ensureTempDirPromise;
  }

  private async batchDeletePermanent(fids: string[], account: PanAccount): Promise<void> {
    const uniqueIds = Array.from(
      new Set((fids || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (uniqueIds.length === 0) return;

    for (let i = 0; i < uniqueIds.length; i += 50) {
      const batch = uniqueIds.slice(i, i + 50);
      try {
        await this.fetchPanJson(XUNLEI_CONSTANTS.BATCH_DELETE_URL, {
          method: 'POST',
          account,
          body: JSON.stringify({
            ids: batch,
            space: ''
          })
        });
      } catch (err: any) {
        logger.warn('XunleiProvider', `永久删除迅雷临时转存文件失败，尝试移入回收站兜底: ${err.message}`);
        try {
          await this.deleteFiles(batch, account);
        } catch {}
      }
    }
  }

  private extractShareKey(url: string): string {
    const match = url.match(/\/s\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : '';
  }

  private async initWebCaptcha(
    deviceId: string,
    action: string,
    userId = '',
    clientId = XUNLEI_CONSTANTS.WEB_CLIENT_ID
  ): Promise<string | null> {
    const ts = Date.now();
    const effectiveClientId = normalizeXunleiClientId(clientId);
    const sign = computeXunleiWebCaptchaSign(deviceId, ts);
    const body = JSON.stringify({
      client_id: effectiveClientId,
      action,
      device_id: deviceId,
      meta: {
        username: '',
        phone_number: '',
        email: '',
        package_name: XUNLEI_CONSTANTS.WEB_PACKAGE_NAME,
        client_version: XUNLEI_CONSTANTS.WEB_CLIENT_VERSION,
        captcha_sign: sign,
        timestamp: String(ts),
        user_id: userId || ''
      }
    });

    try {
      const resp = await panHttpRequest(XUNLEI_CONSTANTS.CAPTCHA_INIT_URL, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'text/plain;charset=UTF-8',
          Origin: 'https://pan.xunlei.com',
          Referer: 'https://pan.xunlei.com/',
          'User-Agent': XUNLEI_CONSTANTS.DESKTOP_UA,
          'Sec-Ch-Ua': XUNLEI_CONSTANTS.DESKTOP_SEC_CH_UA,
          'Sec-Ch-Ua-Mobile': XUNLEI_CONSTANTS.DESKTOP_SEC_CH_UA_MOBILE,
          'Sec-Ch-Ua-Platform': XUNLEI_CONSTANTS.DESKTOP_SEC_CH_UA_PLATFORM
        },
        body,
        timeoutMs: 15000
      });
      if (!resp.text || resp.text.trim().startsWith('<')) return null;
      const json: any = JSON.parse(resp.text);
      const token = String(json?.captcha_token || '');
      if (!token) {
        logger.warn('XunleiProvider', `初始化迅雷安全验证码未返回 token: ${resp.text.slice(0, 200)}`);
        return null;
      }
      this.captchaCache.set(deviceId, {
        token,
        expiresAt: ts + XUNLEI_CONSTANTS.WEB_CAPTCHA_TOKEN_TTL_MS
      });
      return token;
    } catch (err: any) {
      logger.warn('XunleiProvider', `初始化迅雷安全验证码失败: ${err.message}`);
      return null;
    }
  }

  private buildPanHeaders(
    opts: {
      accessToken?: string;
      clientId: string;
      deviceId: string;
      captchaToken?: string;
      anonymous?: boolean;
      ua?: string;
    }
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': opts.ua || XUNLEI_CONSTANTS.WEB_UA,
      Accept: 'application/json;charset=UTF-8',
      'Content-Type': 'application/json',
      Origin: 'https://pan.xunlei.com',
      Referer: 'https://pan.xunlei.com/',
      'X-Client-Version': '8.31.0.9726',
      'X-Client-Id': opts.clientId,
      'X-Device-Id': opts.deviceId
    };
    if (!opts.anonymous && opts.accessToken) {
      headers['Authorization'] = `Bearer ${opts.accessToken}`;
    }
    if (opts.captchaToken) {
      headers['X-Captcha-Token'] = opts.captchaToken;
    }
    return headers;
  }

  private async refreshOAuthToken(account: PanAccount, persistAccount = true): Promise<boolean> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    const refreshToken = account?.extra?.refreshToken;
    if (!refreshToken) return false;

    const clientId = normalizeXunleiClientId(account.extra?.clientId);
    const deviceId = extractXunleiDeviceId(
      account.extra?.deviceId,
      account.cookies?.['deviceid'],
      this.fallbackDeviceId
    );
    this.refreshInFlight = (async () => {
      try {
        const resp = await panHttpRequest(XUNLEI_CONSTANTS.REFRESH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json;charset=UTF-8',
            'Content-Type': 'application/json',
            'X-Client-Id': clientId,
            'X-Device-Id': deviceId,
            Origin: 'https://pan.xunlei.com',
            Referer: 'https://pan.xunlei.com/',
            'User-Agent': XUNLEI_CONSTANTS.DESKTOP_UA,
            'Sec-Ch-Ua': XUNLEI_CONSTANTS.DESKTOP_SEC_CH_UA,
            'Sec-Ch-Ua-Mobile': XUNLEI_CONSTANTS.DESKTOP_SEC_CH_UA_MOBILE,
            'Sec-Ch-Ua-Platform': XUNLEI_CONSTANTS.DESKTOP_SEC_CH_UA_PLATFORM
          },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: refreshToken
          }),
          timeoutMs: 15000
        });
        if (!resp.ok || !resp.text || resp.text.trim().startsWith('<')) return false;
        const json: any = JSON.parse(resp.text);
        const accessToken = json?.access_token || json?.accessToken;
        if (!accessToken) return false;
        const nextRefresh = json?.refresh_token || json?.refreshToken || refreshToken;
        const userId = account.extra?.userId || parseXunleiJwtSub(accessToken) || account.cookies?.['userid'] || '';
        account.extra = {
          ...(account.extra || {}),
          clientId,
          deviceId,
          userId,
          accessToken,
          refreshToken: nextRefresh
        };
        if (persistAccount) {
          panAccountManager.saveAccount(account);
        }
        return true;
      } catch {
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  private async fetchPanJson(
    url: string,
    options: {
      method?: string;
      body?: string;
      account?: PanAccount;
      ua?: string;
      anonymous?: boolean;
      persistAccount?: boolean;
    } = {}
  ): Promise<any> {
    const {
      method = 'GET',
      body,
      account,
      ua = XUNLEI_CONSTANTS.WEB_UA,
      anonymous,
      persistAccount = true
    } = options;

    const upperMethod = method.toUpperCase();
    const action = `${upperMethod}:${new URL(url).pathname}`;
    const isAnon = Boolean(anonymous || !account?.extra?.accessToken);
    const clientId = normalizeXunleiClientId(account?.extra?.clientId);
    const deviceId = extractXunleiDeviceId(
      account?.extra?.deviceId,
      account?.cookies?.['deviceid'],
      this.fallbackDeviceId
    );
    let userId =
      account?.extra?.userId ||
      parseXunleiJwtSub(account?.extra?.accessToken) ||
      account?.cookies?.['userid'] ||
      '';

    const cachedCaptcha = this.captchaCache.get(deviceId);
    let captchaToken = '';
    if (cachedCaptcha && cachedCaptcha.expiresAt > Date.now()) {
      captchaToken = cachedCaptcha.token;
    } else if (!isAnon) {
      captchaToken = (await this.initWebCaptcha(deviceId, action, userId, clientId)) || '';
      if (!captchaToken && account?.extra?.captchaToken) {
        const expMs = Number(account.extra.captchaExpiresAt || 0);
        if (expMs > Date.now()) {
          captchaToken = String(account.extra.captchaToken);
        }
      }
    }

    const reqBody =
      body !== undefined
        ? body
        : upperMethod !== 'GET' && upperMethod !== 'HEAD'
          ? '{}'
          : undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await panHttpRequest(url, {
        method: upperMethod,
        headers: this.buildPanHeaders({
          accessToken: account?.extra?.accessToken,
          clientId,
          deviceId,
          captchaToken,
          anonymous: isAnon,
          ua
        }),
        body: reqBody,
        timeoutMs: 20000
      });

      const text = resp.text || '';
      if (text.trim().startsWith('<')) {
        throw new Error(`迅雷云盘返回异常 HTML 响应 (HTTP ${resp.status})`);
      }

      let json: any = {};
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(`迅雷云盘响应解析失败 (HTTP ${resp.status})`);
        }
      }

      if (!resp.ok || json?.error) {
        const err = String(json?.error || '');

        if (!isAnon && (resp.status === 401 || err === 'unauthenticated') && attempt === 0 && account?.extra?.refreshToken) {
          const ok = await this.refreshOAuthToken(account, persistAccount);
          if (ok) {
            userId = account.extra?.userId || parseXunleiJwtSub(account.extra?.accessToken) || userId;
            this.captchaCache.delete(deviceId);
            const newCap = await this.initWebCaptcha(deviceId, action, userId, clientId);
            if (newCap) captchaToken = newCap;
            continue;
          }
        }

        if (err === 'captcha_invalid' && attempt === 0) {
          if (JSON.stringify(json).includes('client_id not match')) {
            throw new Error('验证码与当前登录方式不匹配，请在设置中重新登录迅雷网页版');
          }
          this.captchaCache.delete(deviceId);
          const newCap = await this.initWebCaptcha(deviceId, action, userId, clientId);
          if (newCap) {
            captchaToken = newCap;
            continue;
          }
        }

        if (err === 'captcha_invalid') {
          throw new Error('迅雷云盘安全验证令牌刷新失败，请在设置中重新登录迅雷云盘账号完成验证');
        }
        if (resp.status === 401 || err === 'unauthenticated') {
          throw new Error('迅雷云盘登录已过期，请在设置中重新登录');
        }
        const msg = json?.error_description || json?.message || err || `迅雷云盘请求失败 (${resp.status})`;
        throw new Error(msg);
      }

      return json?.data || json;
    }

    throw new Error('迅雷云盘安全验证刷新后仍失败');
  }

  /**
   * 校验网页登录凭据是否真实有效（落库前调用 GET /drive/v1/about 验证）
   */
  async verifyWebLoginAccount(
    rawExtra: Record<string, any>,
    cookieDeviceId?: string
  ): Promise<{
    valid: boolean;
    extra: Record<string, any>;
    quotaText?: string;
    totalSpace?: number;
    usedSpace?: number;
  }> {
    const clientId = normalizeXunleiClientId(rawExtra?.clientId);
    const accessToken = String(rawExtra?.accessToken || '').trim();
    const deviceId = extractXunleiDeviceId(rawExtra?.deviceId, cookieDeviceId, this.fallbackDeviceId);
    const userId = String(rawExtra?.userId || parseXunleiJwtSub(accessToken) || '');
    const normalizedExtra: Record<string, any> = {
      ...rawExtra,
      clientId,
      deviceId,
      userId,
      accessToken
    };

    if (!accessToken) {
      return { valid: false, extra: normalizedExtra };
    }

    const tempAccount: PanAccount = {
      type: 'xunlei',
      name: '迅雷云盘用户',
      cookies: {},
      extra: normalizedExtra,
      updatedAt: Date.now()
    };

    try {
      const data = await this.fetchPanJson(XUNLEI_CONSTANTS.ABOUT_URL, {
        account: tempAccount,
        persistAccount: false
      });
      const quota = data?.quota;
      const valid = Boolean(quota || data?.kind === 'drive#about');
      let quotaText: string | undefined;
      let totalSpace: number | undefined;
      let usedSpace: number | undefined;
      if (quota) {
        const total = Number(quota.limit || 0);
        const used = Number(quota.usage || 0);
        if (total > 0) {
          totalSpace = total;
          usedSpace = used;
          quotaText = `${formatPanBytes(used)} / ${formatPanBytes(total)}`;
        }
      }
      return {
        valid,
        extra: tempAccount.extra || normalizedExtra,
        quotaText,
        totalSpace,
        usedSpace
      };
    } catch (err: any) {
      logger.warn('XunleiProvider', `网页登录态真实校验未通过: ${err.message}`);
      return { valid: false, extra: normalizedExtra };
    }
  }

  /**
   * 1. 分享解析（根走 /drive/v1/share，子目录走 /drive/v1/share/detail）
   */
  async parse(url: string, password = '', account?: PanAccount): Promise<PanParseResult> {
    const shareKey = this.extractShareKey(url);
    if (!shareKey) {
      return {
        panType: 'xunlei',
        shareTitle: '迅雷云盘',
        files: [],
        error: '无效的迅雷云盘分享链接（缺少 /s/ 标识）'
      };
    }

    logger.info('XunleiProvider', `开始解析迅雷分享: shareKey=${shareKey}`);
    const urlPwdMatch = url.match(/[?&](?:pwd|passcode|password)=([A-Za-z0-9]+)/i);
    const passCode = (password || urlPwdMatch?.[1] || '').trim();

    try {
      const files: PanFileItem[] = [];
      let shareTitle = '迅雷云盘资源';
      let passCodeToken = '';

      const scanShareDir = async (
        parentId: string,
        relativePrefix: string,
        reqAccount?: PanAccount
      ): Promise<void> => {
        let pageToken = '';
        const subDirs: Array<{ id: string; path: string }> = [];

        for (let page = 0; page < 100; page++) {
          let apiUrl = '';
          if (!parentId) {
            apiUrl =
              `${XUNLEI_CONSTANTS.SHARE_URL}?share_id=${encodeURIComponent(shareKey)}` +
              `&pass_code=${encodeURIComponent(passCode)}&limit=100` +
              `&page_token=${encodeURIComponent(pageToken)}&thumbnail_size=SIZE_SMALL`;
          } else {
            apiUrl =
              `${XUNLEI_CONSTANTS.SHARE_DETAIL_URL}?share_id=${encodeURIComponent(shareKey)}` +
              `&parent_id=${encodeURIComponent(parentId)}` +
              `&pass_code_token=${encodeURIComponent(passCodeToken)}&limit=100` +
              `&page_token=${encodeURIComponent(pageToken)}&thumbnail_size=SIZE_SMALL`;
          }

          const data = await this.fetchPanJson(apiUrl, {
            account: reqAccount,
            anonymous: !reqAccount?.extra?.accessToken
          });

          if (!parentId && page === 0) {
            const shareStatus = String(data?.share_status || '');
            if (shareStatus === 'PASS_CODE_EMPTY' || shareStatus === 'PASS_CODE_NEED') {
              throw new Error('该迅雷分享需要提取码，请输入提取码后重试');
            }
            if (shareStatus === 'PASS_CODE_ERROR') {
              throw new Error('迅雷分享提取码错误，请检查后重试');
            }
            if (['DELETED', 'EXPIRED', 'SENSITIVE', 'FORBIDDEN', 'CANCELLED'].includes(shareStatus)) {
              throw new Error(`该迅雷分享已失效或不可访问 (${shareStatus})`);
            }
            if (data?.title) shareTitle = data.title;
            if (data?.pass_code_token) passCodeToken = data.pass_code_token;
          }

          const list = data?.files || data?.list || [];
          if (!Array.isArray(list) || list.length === 0) break;

          for (const item of list) {
            const isDir = item.kind === 'drive#folder' || item.is_folder === true;
            const itemId = item.id || item.file_id;
            const name = item.name || '未知文件';
            const itemPath = relativePrefix ? `${relativePrefix}/${name}` : name;

            if (isDir && itemId) {
              subDirs.push({ id: String(itemId), path: itemPath });
            } else if (itemId) {
              const direct = item.web_content_link || item.download_url || undefined;
              const size = typeof item.size === 'number' ? item.size : parseInt(item.size, 10) || 0;
              files.push({
                id: String(itemId),
                name,
                path: itemPath,
                size,
                isDirectory: false,
                rawInfo: {
                  fid: String(itemId),
                  pwdId: shareKey,
                  shareId: shareKey,
                  stoken: passCodeToken,
                  directUrl: direct,
                  resolvedAt: direct ? Date.now() : 0,
                  name,
                  size
                }
              });
            }
          }

          if (!data?.next_page_token) break;
          pageToken = data.next_page_token;
        }

        if (subDirs.length > 0) {
          await mapConcurrent(subDirs, 3, async (sub) => {
            await scanShareDir(sub.id, sub.path, reqAccount);
          });
        }
      };

      try {
        await scanShareDir('', '', account);
      } catch (firstErr: any) {
        const msg = String(firstErr?.message || '');
        if (account?.extra?.accessToken && /登录已过期|unauthenticated/i.test(msg)) {
          logger.warn('XunleiProvider', '历史登录态已失效，自动降级游客模式解析迅雷分享');
          files.length = 0;
          passCodeToken = '';
          await scanShareDir('', '', undefined);
        } else {
          throw firstErr;
        }
      }

      return {
        panType: 'xunlei',
        shareTitle,
        files
      };
    } catch (err: any) {
      logger.error('XunleiProvider', `解析异常: ${err.message}`);
      return {
        panType: 'xunlei',
        shareTitle: '迅雷云盘',
        files: [],
        error: `解析异常: ${err.message}`
      };
    }
  }

  private async getFileDetailLink(fileId: string, account?: PanAccount): Promise<PanDownloadItemLink | null> {
    const url =
      `${XUNLEI_CONSTANTS.FILES_URL}/${encodeURIComponent(fileId)}?_magic=2021&usage=PLAY&thumbnail_size=SIZE_LARGE` +
      `&with=hdr10&with=subtitle_files&with=task&with=public_share_tag`;
    const data = await this.fetchPanJson(url, { account, ua: XUNLEI_CONSTANTS.APP_UA });
    const fileObj = data?.file || data;
    const directUrl =
      fileObj?.links?.['application/octet-stream']?.url ||
      fileObj?.web_content_link ||
      '';
    if (!directUrl) return null;
    return {
      fid: String(fileObj?.id || fileId),
      url: directUrl,
      size: typeof fileObj?.size === 'number' ? fileObj.size : parseInt(fileObj?.size, 10) || undefined,
      filename: fileObj?.name || this.itemNameCache.get(fileId),
      headers: {
        'User-Agent': XUNLEI_CONSTANTS.APP_UA
      }
    };
  }

  /**
   * 2. 分享取直链：
   * 直接尝试可用直链（Range 预检） -> 不可用时确保存在「Velora临时转存」目录 -> 转存目标文件 -> 取文件详情直链 -> 立即永久删除临时转存文件
   */
  async getShareDownloadUrlsDetail(
    items: PanShareDownloadItem[],
    account?: PanAccount
  ): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!items || items.length === 0) return result;

    const needRestoreItems: PanShareDownloadItem[] = [];

    // 第一步：尝试免转存直接下载并探测可用性
    await mapConcurrent(items, 4, async (item) => {
      if (!item.fid) return;
      const directUrl =
        (typeof item.extra?.directUrl === 'string' && item.extra.directUrl.startsWith('http')
          ? item.extra.directUrl
          : '') || (item.pwdId && item.pwdId.startsWith('http') ? item.pwdId : '');
      const resolvedAt = Number(item.extra?.resolvedAt || 0);
      const isDirectFresh = Boolean(
        directUrl && (!item.extra?.directUrl || (resolvedAt > 0 && Date.now() - resolvedAt < 10 * 60 * 1000))
      );
      if (isDirectFresh) {
        const probeOk = await this.probeDirectUrl(directUrl);
        if (probeOk) {
          result[item.fid] = {
            fid: item.fid,
            url: directUrl,
            size: item.extra?.size || undefined,
            filename: item.extra?.name,
            headers: { 'User-Agent': XUNLEI_CONSTANTS.APP_UA }
          };
          return;
        }
      }

      needRestoreItems.push(item);
    });

    if (needRestoreItems.length > 0) {
      if (!account?.extra?.accessToken) {
        if (Object.keys(result).length === 0) {
          throw new Error('该迅雷分享文件需登录后获取下载地址，请先在设置中登录迅雷云盘账号');
        }
        return result;
      }

      // 第二步：创建/复用根目录下的「Velora临时转存」目录
      const tempDirFid = await this.ensureTempDir(account);

      const byShare = new Map<string, PanShareDownloadItem[]>();
      for (const item of needRestoreItems) {
        const shareId = item.extra?.shareId || (item.pwdId && !item.pwdId.startsWith('http') ? item.pwdId : '');
        const passCodeToken = item.stoken || item.extra?.stoken || '';
        const key = `${shareId}\0${passCodeToken}`;
        const arr = byShare.get(key) || [];
        arr.push(item);
        byShare.set(key, arr);
      }

      let hasRestoredId = false;
      for (const group of Array.from(byShare.values())) {
        const shareId = group[0].extra?.shareId || (group[0].pwdId && !group[0].pwdId.startsWith('http') ? group[0].pwdId : '');
        const passCodeToken = group[0].stoken || group[0].extra?.stoken || '';
        if (!shareId) continue;

        const restoredIds = new Set<string>();
        try {
          // 第三步：转存目标文件到「Velora临时转存」并获取真实下载直链
          const traceMap = await this.restoreInternal(
            shareId,
            passCodeToken,
            tempDirFid,
            group.map((it) => it.fid),
            account
          );
          for (const rid of Object.values(traceMap)) {
            if (rid) restoredIds.add(rid);
          }

          const fallbackMap: Record<string, string> = {};
          if (group.some((orig) => !traceMap[orig.fid])) {
            try {
              const listed = await this.listFiles(tempDirFid, account);
              const usedIds = new Set<string>(Object.values(traceMap));
              const driveFiles = listed.files
                .filter((f) => !f.isDirectory)
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
              for (const orig of group) {
                if (traceMap[orig.fid]) continue;
                const origName = orig.extra?.name;
                let matched = origName
                  ? driveFiles.find((f) => !usedIds.has(f.id) && f.name === origName)
                  : undefined;
                if (!matched && group.length === 1 && driveFiles.length === 1 && !usedIds.has(driveFiles[0].id)) {
                  matched = driveFiles[0];
                }
                if (matched) {
                  usedIds.add(matched.id);
                  fallbackMap[orig.fid] = matched.id;
                  restoredIds.add(matched.id);
                }
              }
            } catch {}
          }

          if (restoredIds.size > 0) {
            hasRestoredId = true;
          }

          await mapConcurrent(group, 4, async (orig) => {
            const restoredId = traceMap[orig.fid] || fallbackMap[orig.fid];
            if (!restoredId) return;
            let link = await this.getFileDetailLink(restoredId, account);
            if (!link?.url) {
              await sleep(600);
              link = await this.getFileDetailLink(restoredId, account);
            }
            if (link?.url) {
              result[orig.fid] = {
                ...link,
                fid: orig.fid
              };
            }
          });
        } catch (err: any) {
          if (Object.keys(result).length === 0) {
            throw err;
          }
        } finally {
          // 第四步：立即永久删除临时转存文件（直链自带签名不影响下载）
          if (restoredIds.size > 0) {
            await this.batchDeletePermanent(Array.from(restoredIds), account);
          }
        }
      }

      if (Object.keys(result).length === 0) {
        throw new Error(
          hasRestoredId
            ? '迅雷临时转存后未能获取有效下载直链'
            : '迅雷临时转存未获取到目标文件 ID，请检查云盘剩余空间或分享状态'
        );
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

  private async restoreInternal(
    shareId: string,
    passCodeToken: string,
    parentFolderId: string,
    fileIds: string[],
    account: PanAccount
  ): Promise<Record<string, string>> {
    const parentId = !parentFolderId || parentFolderId === '0' ? '' : parentFolderId;
    const data = await this.fetchPanJson(XUNLEI_CONSTANTS.RESTORE_URL, {
      method: 'POST',
      account,
      body: JSON.stringify({
        share_id: shareId,
        pass_code_token: passCodeToken,
        parent_id: parentId,
        ancestor_ids: [],
        file_ids: fileIds,
        specify_parent_id: true
      })
    });

    const out: Record<string, string> = {};
    const extractTrace = (raw: any) => {
      if (!raw) return;
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === 'object') {
          for (const id of fileIds) {
            if (parsed[id]) out[id] = String(parsed[id]);
          }
        }
      } catch {}
    };

    extractTrace(data?.params?.trace_file_ids);
    extractTrace(data?.trace_file_ids);
    const taskId = String(data?.restore_task_id || data?.task_id || '');
    if (Object.keys(out).length < fileIds.length && taskId) {
      for (let i = 0; i < 25; i++) {
        await sleep(800);
        const taskData = await this.fetchPanJson(
          `${XUNLEI_CONSTANTS.TASKS_URL}/${encodeURIComponent(taskId)}?type=share`,
          { account }
        );
        extractTrace(taskData?.params?.trace_file_ids);
        extractTrace(taskData?.trace_file_ids);
        const phase = String(taskData?.status || taskData?.phase || '');
        if (phase === 'PHASE_TYPE_COMPLETE') {
          break;
        }
        if (phase === 'PHASE_TYPE_ERROR') {
          throw new Error(taskData?.message || '迅雷云盘转存任务失败');
        }
      }
    }
    if (Object.keys(out).length === 0 && (data?.file?.id || data?.file_id) && fileIds.length === 1) {
      out[fileIds[0]] = String(data?.file?.id || data.file_id);
    }
    return out;
  }

  async saveShareItems(
    items: PanShareDownloadItem[],
    targetDirFid: string,
    account: PanAccount
  ): Promise<{ savedCount: number }> {
    const byShare = new Map<string, PanShareDownloadItem[]>();
    for (const item of items) {
      const shareId = item.extra?.shareId || (item.pwdId && !item.pwdId.startsWith('http') ? item.pwdId : '');
      const passCodeToken = item.stoken || item.extra?.stoken || '';
      const key = `${shareId}\0${passCodeToken}`;
      const arr = byShare.get(key) || [];
      arr.push(item);
      byShare.set(key, arr);
    }

    let savedCount = 0;
    for (const group of Array.from(byShare.values())) {
      const shareId = group[0].extra?.shareId || (group[0].pwdId && !group[0].pwdId.startsWith('http') ? group[0].pwdId : '');
      const passCodeToken = group[0].stoken || group[0].extra?.stoken || '';
      if (!shareId) {
        throw new Error('缺少迅雷分享 ID，请重新解析链接后再试');
      }
      await this.restoreInternal(
        shareId,
        passCodeToken,
        targetDirFid,
        group.map((it) => it.fid),
        account
      );
      savedCount += group.length;
    }
    return { savedCount };
  }

  /**
   * 3. 个人网盘文件列表
   */
  async listFiles(pdirFid = '0', account: PanAccount): Promise<PanDriveListResult> {
    const parentId = !pdirFid || pdirFid === '0' ? '' : pdirFid;
    const files: PanDriveItem[] = [];
    const seen = new Set<string>();
    let pageToken = '';
    const filters = encodeURIComponent('{"trashed":{"eq":false}}');

    for (let page = 0; page < 100; page++) {
      const pageParam = pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : '';
      const url = `${XUNLEI_CONSTANTS.FILES_URL}?parent_id=${encodeURIComponent(parentId)}&limit=100&with_audit=true&filters=${filters}${pageParam}`;

      const data = await this.fetchPanJson(url, { account });
      const rawFiles = data?.files || [];
      if (!Array.isArray(rawFiles) || rawFiles.length === 0) break;

      let newCount = 0;
      for (const item of rawFiles) {
        const fid = String(item.id || '');
        if (!fid || seen.has(fid)) continue;
        seen.add(fid);
        newCount++;
        const isDir = item.kind === 'drive#folder';
        const name = item.name || '未知文件';
        this.itemNameCache.set(fid, name);
        files.push({
          id: fid,
          name,
          pdir_fid: parentId || '0',
          size: typeof item.size === 'number' ? item.size : parseInt(item.size, 10) || 0,
          isDirectory: isDir,
          updatedAt: parseTimestamp(item.modified_time || item.updated_time),
          formatType: inferFormatType(name, isDir),
          downloadUrl: item.web_content_link || undefined
        });
      }

      if (newCount === 0 || !data?.next_page_token) break;
      pageToken = data.next_page_token;
    }

    return {
      files,
      total: files.length,
      pdir_fid: parentId || '0'
    };
  }

  async getDriveDownloadUrl(fid: string, account: PanAccount): Promise<string> {
    const urls = await this.getBatchDownloadUrls([fid], account);
    return urls[fid] || '';
  }

  async getBatchDownloadUrlsDetail(fids: string[], account: PanAccount): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!fids || fids.length === 0) return result;

    await mapConcurrent(fids, 4, async (fid) => {
      if (!fid) return;
      try {
        const link = await this.getFileDetailLink(fid, account);
        if (link?.url) {
          result[fid] = link;
        }
      } catch (err: any) {
        logger.warn('XunleiProvider', `获取迅雷个人直链失败 (${fid}): ${err.message}`);
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
   * 4. 个人盘管理：新建文件夹 / 重命名 / 移动 / 删除 / 创建分享
   */
  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const parentId = !parentFid || parentFid === '0' ? '' : parentFid;
    const data = await this.fetchPanJson(XUNLEI_CONSTANTS.FILES_URL, {
      method: 'POST',
      account,
      body: JSON.stringify({
        kind: 'drive#folder',
        name,
        parent_id: parentId,
        space: ''
      })
    });
    let newId = String(data?.file?.id || data?.id || '');
    if (!newId) {
      try {
        const listed = await this.listFiles(parentFid, account);
        const matched = listed.files.find((f) => f.isDirectory && f.name === name);
        if (matched?.id) {
          newId = matched.id;
        }
      } catch {}
    }
    if (!newId) throw new Error('迅雷云盘未返回新文件夹 id');
    this.itemNameCache.set(newId, name);
    return { fid: newId, name };
  }

  async renameItem(fid: string, newName: string, account: PanAccount): Promise<boolean> {
    const data = await this.fetchPanJson(`${XUNLEI_CONSTANTS.FILES_URL}/${encodeURIComponent(fid)}`, {
      method: 'PATCH',
      account,
      body: JSON.stringify({ name: newName })
    });
    const updatedId = data?.file?.id || data?.id;
    this.itemNameCache.set(fid, newName);
    return Boolean(updatedId || true);
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const toParentId = !targetDirFid || targetDirFid === '0' ? '' : targetDirFid;
    for (let i = 0; i < fids.length; i += 50) {
      const batch = fids.slice(i, i + 50);
      await this.fetchPanJson(XUNLEI_CONSTANTS.MOVE_URL, {
        method: 'POST',
        account,
        body: JSON.stringify({
          ids: batch,
          to: { parent_id: toParentId, space: '' },
          space: ''
        })
      });
    }
    return true;
  }

  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    try {
      for (let i = 0; i < fids.length; i += 50) {
        const batch = fids.slice(i, i + 50);
        await this.fetchPanJson(XUNLEI_CONSTANTS.TRASH_URL, {
          method: 'POST',
          account,
          body: JSON.stringify({
            ids: batch,
            space: ''
          })
        });
      }
      return true;
    } catch (err: any) {
      logger.error('XunleiProvider', `删除迅雷文件失败: ${err.message}`);
      if (/登录|过期|401|403|unauthenticated|unauthorized|token/i.test(String(err?.message || ''))) {
        throw err;
      }
      return false;
    }
  }

  async createShare(params: PanCreateShareParams, account: PanAccount): Promise<PanShareCreatedInfo> {
    const expirationDays = toXunleiExpirationDays(params.expireType);
    const passCode = (params.passcode || '').trim();
    const firstName = this.itemNameCache.get(params.fids[0]) || '迅雷云盘分享';

    const shareParams: Record<string, any> = {
      subscribe_push: 'false',
      WithPassCodeInLink: 'true',
      with_pass_code_in_link: 'true'
    };
    if (passCode) {
      shareParams.pass_code = passCode;
    }

    const data = await this.fetchPanJson(XUNLEI_CONSTANTS.SHARE_URL, {
      method: 'POST',
      account,
      body: JSON.stringify({
        file_ids: params.fids,
        share_to: 'copy',
        params: shareParams,
        title: firstName,
        restore_limit: '-1',
        expiration_days: expirationDays
      })
    });

    const shareUrl = data?.share_url;
    if (!shareUrl) {
      throw new Error('迅雷云盘创建分享失败：未返回分享链接');
    }
    return {
      shareUrl,
      passcode: data?.pass_code || passCode || '',
      shareId: data?.share_id || '',
      title: data?.title || firstName
    };
  }

  /**
   * 5. 容量信息（GET /drive/v1/about）
   */
  async getQuota(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    if (!account?.extra?.accessToken) return null;

    try {
      const data = await this.fetchPanJson(XUNLEI_CONSTANTS.ABOUT_URL, { account });
      const quota = data?.quota;
      if (quota) {
        const total = Number(quota.limit || 0);
        const used = Number(quota.usage || 0);
        if (total > 0) {
          return {
            used,
            total,
            quotaText: `${formatPanBytes(used)} / ${formatPanBytes(total)}`
          };
        }
      }
    } catch (e: any) {
      logger.warn('XunleiProvider', `获取迅雷容量失败: ${e.message}`);
    }
    return null;
  }
}

export const sharedXunleiVerifier = new XunleiProvider();
