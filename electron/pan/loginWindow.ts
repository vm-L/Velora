import { BrowserWindow, session, net } from 'electron';
import crypto from 'crypto';
import { PanType, PanAccount } from './types';
import { PAN_CONFIGS, panAccountManager } from './accountManager';
import { buildCookieHeader, formatPanBytes } from './utils';
import {
  XUNLEI_CONSTANTS,
  extractXunleiDeviceId,
  normalizeXunleiClientId,
  parseXunleiJwtSub,
  sharedXunleiVerifier
} from './providers/xunlei';
import { PAN123_CONSTANTS, makePan123Sign } from './providers/pan123';
import { BAIDU_CONSTANTS } from './providers/baidu';
import { UC_CONSTANTS } from './providers/uc';
import { PAN115_CONSTANTS } from './providers/pan115';
import { logger } from '../logger';

function mergeResponseSetCookies(resp: any, cookieMap: Record<string, string>) {
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
    for (const sc of list) {
      const kv = sc.split(';')[0].trim();
      const eq = kv.indexOf('=');
      if (eq <= 0) continue;
      const name = kv.slice(0, eq).trim();
      const val = kv.slice(eq + 1).trim();
      if (name && val) {
        cookieMap[name] = val;
      }
    }
  } catch {}
}

function isWindowOnAllowedHost(win: BrowserWindow | undefined, suffixes: string[]): boolean {
  if (!win || win.isDestroyed()) return false;
  try {
    const rawUrl = win.webContents.getURL();
    if (!rawUrl) return false;
    const host = new URL(rawUrl).hostname.toLowerCase();
    return suffixes.some((s) => host === s || host.endsWith('.' + s));
  } catch {
    return false;
  }
}

export class PanLoginWindow {
  private static activeWindow: BrowserWindow | null = null;

  static async open(type: PanType, parentWindow?: BrowserWindow): Promise<PanAccount | null> {
    const config = PAN_CONFIGS[type];
    if (!config) {
      logger.error('PanLoginWindow', `未知的网盘类型: ${type}`);
      return null;
    }

    if (this.activeWindow && !this.activeWindow.isDestroyed()) {
      this.activeWindow.focus();
      return null;
    }

    const partition = `persist:pan_auth_${type}`;
    const authSession = session.fromPartition(partition);

    // 每次进入登录流程前，清理可能存在的未授权访客缓存与失效 Cookie
    try {
      await authSession.clearStorageData();
    } catch (err: any) {
      logger.warn('PanLoginWindow', `清理会话存储异常: ${err.message}`);
    }

    return new Promise((resolve) => {
      const win = new BrowserWindow({
        width: 860,
        height: 640,
        parent: parentWindow,
        modal: true,
        title: `${config.name} - 登录`,
        autoHideMenuBar: true,
        webPreferences: {
          session: authSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      });

      win.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            win.loadURL(url).catch(() => {});
          }
        } catch {}
        return { action: 'deny' };
      });

      this.activeWindow = win;

      let isFinished = false;
      let isVerifying = false;

      const checkCookies = async () => {
        if (isFinished || isVerifying || win.isDestroyed()) return;
        try {
          const cookies = await authSession.cookies.get({});
          const cookieMap: Record<string, string> = {};
          cookies.forEach((c) => {
            cookieMap[c.name] = c.value;
          });

          // 执行针对该网盘的真实凭证与用户信息严格校验
          isVerifying = true;
          const authResult = await this.verifyPanLogin(type, cookieMap, win);
          isVerifying = false;

          if (authResult.success) {
            isFinished = true;
            logger.info('PanLoginWindow', `检测到 ${config.name} 登录凭据有效，用户: ${authResult.nickname}`);

            const account: PanAccount = {
              type,
              name: authResult.nickname,
              cookies: cookieMap,
              quotaText: authResult.quotaText,
              totalSpace: authResult.totalSpace,
              usedSpace: authResult.usedSpace,
              extra: authResult.extra,
              updatedAt: Date.now()
            };

            panAccountManager.saveAccount(account);

            setTimeout(() => {
              if (!win.isDestroyed()) {
                win.close();
              }
              resolve(account);
            }, 800);
          }
        } catch (err: any) {
          isVerifying = false;
          logger.warn('PanLoginWindow', `检查登录态异常: ${err.message}`);
        }
      };

      // 监听导航和页面加载事件
      win.webContents.on('did-finish-load', checkCookies);
      win.webContents.on('did-navigate', checkCookies);
      win.webContents.on('did-navigate-in-page', checkCookies);

      // 定时轮询兜底（每 1 秒轮询一次）
      const pollTimer = setInterval(checkCookies, 1000);

      win.on('closed', () => {
        clearInterval(pollTimer);
        this.activeWindow = null;
        if (!isFinished) {
          resolve(null);
        }
      });

      win.loadURL(config.loginUrl, {
        userAgent:
          type === 'xunlei'
            ? XUNLEI_CONSTANTS.DESKTOP_UA
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
    });
  }

  /**
   * 严格校验网盘登录态，杜绝仅有访客/设备 Cookie 时误判为登录成功
   */
  private static async verifyPanLogin(
    type: PanType,
    cookieMap: Record<string, string>,
    win?: BrowserWindow
  ): Promise<{
    success: boolean;
    nickname: string;
    quotaText?: string;
    totalSpace?: number;
    usedSpace?: number;
    extra?: Record<string, any>;
  }> {
    const cookieHeader = buildCookieHeader(cookieMap);

    const formatBytes = formatPanBytes;

    switch (type) {
      case 'quark': {
        // 夸克网盘核心鉴权凭据：网页端登录后必定下发 __pus、__puus 或 __kps / kps
        const hasAuthToken = !!(
          cookieMap['__pus'] ||
          cookieMap['__puus'] ||
          cookieMap['__kps'] ||
          cookieMap['kps']
        );
        if (!hasAuthToken) {
          return { success: false, nickname: '' };
        }

        let userNickname = '夸克用户';
        let quotaText: string | undefined;
        let totalSpace: number | undefined;
        let usedSpace: number | undefined;

        const quarkUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.12-a038f7b798 Safari/537.36 Channel/pckk_other_ch';

        // 1. 严格通过官方接口获取真实纯净昵称（对齐 YunX-Desktop QuarkApi.fetchNickname），绝不使用容易抓取脏字符的 DOM 注入
        try {
          const resp = await net.fetch('https://pan.quark.cn/account/info', {
            headers: {
              'Cookie': cookieHeader,
              'Referer': 'https://pan.quark.cn/',
              'Origin': 'https://pan.quark.cn',
              'User-Agent': quarkUserAgent
            }
          });
          mergeResponseSetCookies(resp, cookieMap);
          const text = await resp.text();
          if (text && !text.startsWith('<')) {
            const json: any = JSON.parse(text);
            if (json && (json.success === true || json.code === 'OK' || json.code === 0 || json.status === 200)) {
              const nick = json.data?.nickname;
              if (nick && typeof nick === 'string' && nick.trim()) {
                userNickname = nick.trim();
              }
            }
          }
        } catch (err: any) {
          logger.warn('PanLoginWindow', `校验夸克用户信息异常: ${err.message}`);
        }

        const updatedCookieHeader = Object.entries(cookieMap)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');

        // 2. 通过官方业务接口获取网盘精确容量（对齐 YunX-Desktop QuarkApi.getQuota）
        try {
          const capResp = await net.fetch('https://drive-pc.quark.cn/1/clouddrive/member?pr=ucpro&fr=pc&fetch_subscribe=true&_ch=home', {
            headers: {
              'Cookie': updatedCookieHeader || cookieHeader,
              'Referer': 'https://pan.quark.cn/',
              'Origin': 'https://pan.quark.cn',
              'User-Agent': quarkUserAgent
            }
          });
          mergeResponseSetCookies(capResp, cookieMap);
          const capText = await capResp.text();
          if (capText && !capText.startsWith('<')) {
            const capJson: any = JSON.parse(capText);
            if (capJson && capJson.data) {
              totalSpace = capJson.data.total_capacity;
              usedSpace = capJson.data.use_capacity;
              if (typeof totalSpace === 'number' && totalSpace > 0) {
                quotaText = `${formatBytes(usedSpace || 0)} / ${formatBytes(totalSpace)}`;
              }
            }
          }
        } catch (err: any) {
          logger.warn('PanLoginWindow', `获取夸克容量异常: ${err.message}`);
        }

        return {
          success: true,
          nickname: userNickname,
          quotaText,
          totalSpace,
          usedSpace
        };
      }

      case 'baidu': {
        if (!cookieMap['BDUSS']) {
          return { success: false, nickname: '' };
        }
        let userNickname = '百度网盘用户';
        let quotaText: string | undefined;
        let totalSpace: number | undefined;
        let usedSpace: number | undefined;

        try {
          const tvResp = await net.fetch(
            `${BAIDU_CONSTANTS.GET_TEMPLATE_VARIABLE_URL}?clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1&fields=%5B%22username%22%5D`,
            {
              headers: {
                'Cookie': cookieHeader,
                'User-Agent': BAIDU_CONSTANTS.UA_WEB
              }
            }
          );
          const tvJson: any = await tvResp.json();
          const uname = tvJson?.errno === 0 ? tvJson?.result?.username : '';
          if (uname && typeof uname === 'string' && uname.trim()) {
            userNickname = uname.trim();
          } else {
            const resp = await net.fetch('https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo', {
              headers: {
                'Cookie': cookieHeader,
                'User-Agent': BAIDU_CONSTANTS.UA_WEB
              }
            });
            const json: any = await resp.json();
            if (json && json.errno === 0) {
              userNickname = json.baidu_name || json.netdisk_name || '百度网盘用户';
            }
          }
        } catch {}

        try {
          const qResp = await net.fetch(
            `${BAIDU_CONSTANTS.QUOTA_URL}?clienttype=0&app_id=${BAIDU_CONSTANTS.APP_ID}&web=1&channel=chunlei&version=${Date.now()}`,
            {
              headers: {
                'Cookie': cookieHeader,
                'User-Agent': BAIDU_CONSTANTS.UA_WEB,
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://pan.baidu.com/disk/main'
              }
            }
          );
          const qJson: any = await qResp.json();
          if (qJson && qJson.errno === 0 && qJson.total) {
            totalSpace = qJson.total;
            usedSpace = qJson.used || 0;
            quotaText = `${formatBytes(usedSpace)} / ${formatBytes(totalSpace)}`;
          }
        } catch {}

        return {
          success: true,
          nickname: userNickname,
          quotaText,
          totalSpace,
          usedSpace
        };
      }

      case '123pan': {
        let authorToken = cookieMap['token'] || '';
        let extra: Record<string, any> | undefined;
        if (isWindowOnAllowedHost(win, ['123pan.com', '123pan.cn'])) {
          try {
            const lsData = await win!.webContents.executeJavaScript(`(() => {
              try {
                return {
                  authorToken: localStorage.getItem('authorToken') || '',
                  token: localStorage.getItem('token') || '',
                  loginUuid: localStorage.getItem('LoginUuid') || localStorage.getItem('loginUuid') || '',
                  userId: localStorage.getItem('b-user-id') || ''
                };
              } catch { return null; }
            })()`);
            if (lsData && typeof lsData === 'object') {
              const cleanVal = (s: any) => (typeof s === 'string' ? s.replace(/^"|"$/g, '').trim() : '');
              const lsToken = cleanVal(lsData.authorToken) || cleanVal(lsData.token);
              if (lsToken && !authorToken) {
                authorToken = lsToken;
              } else if (lsToken && lsToken.length > authorToken.length) {
                authorToken = lsToken;
              }
              const loginUuid = cleanVal(lsData.loginUuid);
              const userId = cleanVal(lsData.userId);
              if (authorToken || loginUuid || userId) {
                extra = {
                  ...(authorToken ? { authorToken } : {}),
                  ...(loginUuid ? { loginUuid } : {}),
                  ...(userId ? { userId } : {})
                };
              }
            }
          } catch {}
        }

        if (!authorToken) {
          return { success: false, nickname: '' };
        }
        if (!cookieMap['token']) {
          cookieMap['token'] = authorToken;
        }

        let nickname = cookieMap['username'] || '123云盘用户';
        let quotaText: string | undefined;
        let totalSpace: number | undefined;
        let usedSpace: number | undefined;

        try {
          const { authKey, authValue } = makePan123Sign('/b/api/user/info');
          const loginUuid = extra?.loginUuid || crypto.randomBytes(16).toString('hex');
          const qResp = await net.fetch(PAN123_CONSTANTS.USER_INFO_URL, {
            headers: {
              'platform': PAN123_CONSTANTS.PLATFORM_WEB,
              'app-version': PAN123_CONSTANTS.APP_VERSION_WEB,
              'authorization': `Bearer ${authorToken}`,
              'loginuuid': loginUuid,
              'auth-key': authKey,
              'auth-value': authValue,
              'User-Agent': PAN123_CONSTANTS.WEB_UA,
              'Accept': 'application/json, text/plain, */*',
              'Referer': PAN123_CONSTANTS.DOWNLOAD_REFERER,
              ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
            }
          });
          const qJson: any = await qResp.json();
          if (qJson && qJson.code === 0 && qJson.data) {
            if (qJson.data.Nickname) {
              nickname = String(qJson.data.Nickname).trim() || nickname;
            }
            const used = Number(qJson.data.SpaceUsed ?? qJson.data.space?.used ?? 0);
            const total = Number(
              qJson.data.SpacePermanent !== undefined || qJson.data.SpaceTemp !== undefined
                ? Number(qJson.data.SpacePermanent || 0) + Number(qJson.data.SpaceTemp || 0)
                : qJson.data.space?.total || 0
            );
            if (total > 0) {
              totalSpace = total;
              usedSpace = used;
              quotaText = `${formatBytes(usedSpace)} / ${formatBytes(totalSpace)}`;
            }
          }
        } catch {}

        return {
          success: true,
          nickname,
          quotaText,
          totalSpace,
          usedSpace,
          extra
        };
      }

      case 'uc': {
        const hasAuthToken = !!(
          cookieMap['__pus'] ||
          cookieMap['__puus'] ||
          cookieMap['__kps'] ||
          cookieMap['kps']
        );
        if (!hasAuthToken) {
          return { success: false, nickname: '' };
        }

        let userNickname = 'UC网盘用户';
        let quotaText: string | undefined;
        let totalSpace: number | undefined;
        let usedSpace: number | undefined;

        try {
          const accResp = await net.fetch('https://drive.uc.cn/account/info', {
            headers: {
              'Cookie': cookieHeader,
              'User-Agent': UC_CONSTANTS.WEB_UA
            }
          });
          mergeResponseSetCookies(accResp, cookieMap);
          const accText = await accResp.text();
          if (accText && !accText.startsWith('<')) {
            const accJson: any = JSON.parse(accText);
            if (accJson?.success && accJson?.data?.nickname) {
              userNickname = String(accJson.data.nickname).trim() || userNickname;
            }
          }
        } catch {}

        const updatedCookieHeader = buildCookieHeader(cookieMap) || cookieHeader;

        try {
          const infoResp = await net.fetch(UC_CONSTANTS.MEMBER_QUOTA_URL, {
            headers: {
              'Cookie': updatedCookieHeader,
              'Referer': UC_CONSTANTS.DOWNLOAD_REFERER,
              'Origin': UC_CONSTANTS.WEB_ORIGIN,
              'User-Agent': UC_CONSTANTS.CLOUD_UA
            }
          });
          mergeResponseSetCookies(infoResp, cookieMap);
          const infoText = await infoResp.text();
          if (infoText && !infoText.startsWith('<')) {
            const infoJson: any = JSON.parse(infoText);
            if (infoJson?.data) {
              const nick = infoJson.data.nickname || infoJson.data.user_info?.nickname;
              if (userNickname === 'UC网盘用户' && nick && typeof nick === 'string' && nick.trim()) {
                userNickname = nick.trim();
              }
              totalSpace = infoJson.data.total_capacity;
              usedSpace = infoJson.data.use_capacity;
              if (typeof totalSpace === 'number' && totalSpace > 0) {
                quotaText = `${formatBytes(usedSpace || 0)} / ${formatBytes(totalSpace)}`;
              }
            }
          }
        } catch (err: any) {
          logger.warn('PanLoginWindow', `校验 UC 网盘用户信息异常: ${err.message}`);
        }

        return {
          success: true,
          nickname: userNickname,
          quotaText,
          totalSpace,
          usedSpace
        };
      }

      case 'xunlei': {
        const isValidXunleiToken = (val: string) =>
          val.length >= 16 &&
          val.length <= 16384 &&
          /^[A-Za-z0-9._~+/=-]+$/.test(val) &&
          val !== 'null' &&
          val !== 'undefined';

        let candidateExtra: Record<string, any> | undefined;
        let docCookieDeviceId = '';

        if (isWindowOnAllowedHost(win, ['xunlei.com'])) {
          try {
            const lsData = await win!.webContents.executeJavaScript(`(() => {
              try {
                const currentSub = localStorage.getItem('current_sub') || '';
                const credentials = {};
                const captchas = {};
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (!k) continue;
                  if (k.startsWith('credentials_')) {
                    credentials[k] = localStorage.getItem(k);
                  } else if (k.startsWith('captcha_')) {
                    captchas[k] = localStorage.getItem(k);
                  }
                }
                const lsDeviceId = localStorage.getItem('deviceid') || '';
                let cookieDeviceId = '';
                const pairs = (document.cookie || '').split(';');
                for (let i = 0; i < pairs.length; i++) {
                  const s = pairs[i].trim();
                  if (s.indexOf('deviceid=') === 0) {
                    cookieDeviceId = s.slice(9);
                    break;
                  }
                }
                return { currentSub, credentials, captchas, lsDeviceId, cookieDeviceId };
              } catch { return null; }
            })()`);

            if (lsData && typeof lsData === 'object') {
              docCookieDeviceId = String(lsData.cookieDeviceId || '');
              const currentSub = String(lsData.currentSub || '').trim();
              const credEntries = Object.entries((lsData.credentials || {}) as Record<string, any>)
                .filter(([, v]) => typeof v === 'string' && v.trim().length > 0);

              if (credEntries.length > 0) {
                const preferredKeyWithSub = currentSub
                  ? `credentials_${XUNLEI_CONSTANTS.WEB_CLIENT_ID}@${currentSub}`
                  : '';
                const selectedEntry =
                  (preferredKeyWithSub && credEntries.find(([k]) => k === preferredKeyWithSub)) ||
                  (currentSub && credEntries.find(([k]) => k.endsWith(`@${currentSub}`))) ||
                  credEntries.find(([k]) => k === `credentials_${XUNLEI_CONSTANTS.WEB_CLIENT_ID}`) ||
                  credEntries.find(([k]) => k.startsWith(`credentials_${XUNLEI_CONSTANTS.WEB_CLIENT_ID}`)) ||
                  credEntries[0];

                if (selectedEntry) {
                  const [credKey, rawCred] = selectedEntry;
                  try {
                    const cred = JSON.parse(String(rawCred));
                    const accessToken = String(cred?.access_token || cred?.accessToken || '').trim();
                    const rawRefresh = String(cred?.refresh_token || cred?.refreshToken || '').trim();
                    const refreshToken = isValidXunleiToken(rawRefresh) ? rawRefresh : '';

                    if (isValidXunleiToken(accessToken)) {
                      const clientId = normalizeXunleiClientId(credKey.slice('credentials_'.length));
                      const deviceId = extractXunleiDeviceId(
                        lsData.lsDeviceId,
                        docCookieDeviceId || cookieMap['deviceid']
                      );
                      const userId = String(
                        cred?.user_id || cred?.userId || cred?.sub || parseXunleiJwtSub(accessToken) || ''
                      ).trim();

                      const capList: Array<{ key: string; token: string; expMs: number }> = [];
                      const nowMs = Date.now();
                      for (const [ck, rawCap] of Object.entries((lsData.captchas || {}) as Record<string, any>)) {
                        if (typeof rawCap !== 'string') continue;
                        try {
                          const cap = JSON.parse(rawCap);
                          const token = String(cap?.token || '').trim();
                          if (!isValidXunleiToken(token)) continue;
                          let expMs = 0;
                          if (typeof cap?.expires_at === 'string') {
                            const t = Date.parse(cap.expires_at);
                            if (!isNaN(t)) expMs = t;
                          } else if (cap?.expire_time || cap?.expires_at) {
                            const n = Number(cap.expire_time || cap.expires_at || 0);
                            if (n > 0) expMs = n < 1e12 ? n * 1000 : n;
                          }
                          capList.push({ key: ck, token, expMs });
                        } catch {}
                      }
                      const validCaps = capList.filter((c) => !c.expMs || c.expMs > nowMs + 30_000);
                      const matchedCap =
                        validCaps.find((c) => c.key.includes(clientId)) || validCaps[0];

                      candidateExtra = {
                        clientId,
                        deviceId,
                        userId,
                        accessToken,
                        ...(refreshToken ? { refreshToken } : {}),
                        ...(matchedCap
                          ? {
                              captchaToken: matchedCap.token,
                              ...(matchedCap.expMs ? { captchaExpiresAt: matchedCap.expMs } : {})
                            }
                          : {})
                      };
                    }
                  } catch {}
                }
              }
            }
          } catch {}
        }

        if (!candidateExtra?.accessToken) {
          return { success: false, nickname: '' };
        }

        const verified = await sharedXunleiVerifier.verifyWebLoginAccount(
          candidateExtra,
          docCookieDeviceId || cookieMap['deviceid']
        );
        if (!verified.valid) {
          return { success: false, nickname: '' };
        }

        const rawNick = cookieMap['usernick'] || cookieMap['nickname'] || '';
        let nickname = '迅雷云盘用户';
        if (rawNick) {
          try {
            nickname = decodeURIComponent(rawNick).trim() || '迅雷云盘用户';
          } catch {
            nickname = rawNick.trim() || '迅雷云盘用户';
          }
        }

        return {
          success: true,
          nickname,
          quotaText: verified.quotaText,
          totalSpace: verified.totalSpace,
          usedSpace: verified.usedSpace,
          extra: verified.extra
        };
      }

      case '115': {
        if (!cookieMap['UID'] || !cookieMap['CID'] || !cookieMap['SEID']) {
          return { success: false, nickname: '' };
        }
        let nickname = '115网盘用户';
        let quotaText: string | undefined;
        let totalSpace: number | undefined;
        let usedSpace: number | undefined;

        try {
          const uResp = await net.fetch('https://webapi.115.com/user/info?ct=json', {
            headers: {
              'User-Agent': PAN115_CONSTANTS.WEB_UA,
              'Accept': 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': PAN115_CONSTANTS.REFERER,
              'Cookie': cookieHeader
            }
          });
          const uJson: any = await uResp.json();
          if (Number(uJson?.errno ?? uJson?.errNo ?? 0) === 990001) {
            return { success: false, nickname: '' };
          }
          if (uJson?.state === true && typeof uJson?.data === 'string' && uJson.data.trim()) {
            nickname = uJson.data.trim();
          }
        } catch {}

        try {
          const qResp = await net.fetch(PAN115_CONSTANTS.INDEX_INFO_URL, {
            headers: {
              'User-Agent': PAN115_CONSTANTS.WEB_UA,
              'Accept': 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': PAN115_CONSTANTS.REFERER,
              'Cookie': cookieHeader
            }
          });
          const qJson: any = await qResp.json();
          const space = qJson?.state === true ? qJson?.data?.space_info : null;
          if (space) {
            const total = Number(space.all_total?.size || 0);
            const used = Number(space.all_use?.size || 0);
            if (total > 0) {
              totalSpace = total;
              usedSpace = used;
              quotaText = `${formatBytes(used)} / ${formatBytes(total)}`;
            }
          }
        } catch {}

        return {
          success: true,
          nickname,
          quotaText,
          totalSpace,
          usedSpace
        };
      }

      case 'lanzou': {
        if (!cookieMap['phpdisk_info'] || !cookieMap['ylogin']) {
          return { success: false, nickname: '' };
        }
        return {
          success: true,
          nickname: '蓝奏云用户'
        };
      }

      case '139': {
        if (!cookieMap['authorization']) {
          return { success: false, nickname: '' };
        }

        let fullAccount = '';
        if (cookieMap['ORCHES-I-ACCOUNT-ENCRYPT']) {
          try {
            const decoded = Buffer.from(cookieMap['ORCHES-I-ACCOUNT-ENCRYPT'], 'base64').toString('utf8').trim();
            if (decoded) fullAccount = decoded;
          } catch {}
        }
        if (!fullAccount && cookieMap['authorization']) {
          try {
            const rawAuth = cookieMap['authorization'].replace(/^Basic\s+/i, '').trim();
            const parts = Buffer.from(rawAuth, 'base64').toString('utf8').split(':');
            if (parts[1]) fullAccount = parts[1].trim();
          } catch {}
        }
        if (!fullAccount && cookieMap['Login_UserNumber']) {
          fullAccount = cookieMap['Login_UserNumber'].trim();
        }

        const nickname =
          cookieMap['ORCHES-I-ACCOUNT-SIMPLIFY'] ||
          fullAccount ||
          '中国移动云盘用户';

        return {
          success: true,
          nickname,
          extra: {
            account: fullAccount || nickname,
            ...(cookieMap['authorization'] ? { authorization: cookieMap['authorization'] } : {})
          }
        };
      }

      case 'guangya': {
        let accessToken = cookieMap['access_token'] || cookieMap['accessToken'] || '';
        let refreshToken = cookieMap['refresh_token'] || cookieMap['refreshToken'] || '';
        let deviceId = '';
        if (isWindowOnAllowedHost(win, ['guangyapan.com'])) {
          try {
            const storageObj = await win!.webContents.executeJavaScript(`(() => {
              const dump = (store) => {
                const out = {};
                try {
                  for (let i = 0; i < store.length; i++) {
                    const k = store.key(i);
                    if (k) out[k] = store.getItem(k);
                  }
                } catch {}
                return out;
              };
              return { ls: dump(localStorage), ss: dump(sessionStorage) };
            })()`);

            const extractFromEntries = (entries: Record<string, any>) => {
              if (!entries || typeof entries !== 'object') return;
              for (const [k, rawVal] of Object.entries(entries)) {
                if (typeof rawVal !== 'string' || !rawVal) continue;
                const lk = k.toLowerCase();
                if ((lk === 'accesstoken' || lk === 'access_token') && rawVal.length >= 16) {
                  accessToken = rawVal.replace(/^"|"$/g, '');
                } else if ((lk === 'refreshtoken' || lk === 'refresh_token') && rawVal.length >= 16) {
                  refreshToken = rawVal.replace(/^"|"$/g, '');
                } else if (lk === 'deviceid' || lk === 'did' || lk === 'device_id') {
                  const cleaned = rawVal.replace(/^"|"$/g, '');
                  if (/^[a-f0-9]{16,64}$/i.test(cleaned)) deviceId = cleaned;
                } else if (rawVal.trim().startsWith('{')) {
                  try {
                    const obj = JSON.parse(rawVal);
                    const scanObj = (o: any, depth = 0) => {
                      if (!o || typeof o !== 'object' || depth > 3) return;
                      for (const [ok, ov] of Object.entries(o)) {
                        const lok = ok.toLowerCase();
                        if (typeof ov === 'string') {
                          if ((lok === 'accesstoken' || lok === 'access_token') && ov.length >= 16 && !accessToken) {
                            accessToken = ov;
                          } else if ((lok === 'refreshtoken' || lok === 'refresh_token') && ov.length >= 16 && !refreshToken) {
                            refreshToken = ov;
                          } else if ((lok === 'deviceid' || lok === 'did' || lok === 'device_id') && /^[a-f0-9]{16,64}$/i.test(ov) && !deviceId) {
                            deviceId = ov;
                          }
                        } else if (ov && typeof ov === 'object') {
                          scanObj(ov, depth + 1);
                        }
                      }
                    };
                    scanObj(obj);
                  } catch {}
                }
              }
            };
            extractFromEntries(storageObj?.ls);
            extractFromEntries(storageObj?.ss);
          } catch {}
        }

        if (!accessToken) {
          return { success: false, nickname: '' };
        }
        if (!deviceId) {
          deviceId = crypto.randomBytes(16).toString('hex');
        }
        const traceparent = `00-${crypto.randomBytes(16).toString('hex')}-${crypto.randomBytes(8).toString('hex')}-01`;

        let nickname = '光鸭云盘用户';
        let quotaText: string | undefined;
        let totalSpace: number | undefined;
        let usedSpace: number | undefined;

        try {
          const assetsResp = await net.fetch('https://api.guangyapan.com/assets/v1/get_assets', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json;charset=UTF-8',
              'Authorization': `Bearer ${accessToken}`,
              'dt': '4',
              'did': deviceId,
              'traceparent': traceparent,
              'Origin': 'https://www.guangyapan.com',
              'Referer': 'https://www.guangyapan.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            },
            body: '{}'
          });
          if (!assetsResp.ok) {
            return { success: false, nickname: '' };
          }
          const assetsJson: any = await assetsResp.json();
          const codeStr = String(assetsJson?.code ?? '');
          if (codeStr !== '0' && codeStr !== '200' && assetsJson?.success !== true) {
            return { success: false, nickname: '' };
          }
          const data = assetsJson?.data || {};
          const total = Number(data.totalSpaceSize ?? 0);
          const used = Number(data.usedSpaceSize ?? 0);
          if (total > 0) {
            totalSpace = total;
            usedSpace = used;
            quotaText = `${formatBytes(used)} / ${formatBytes(total)}`;
          }
        } catch {
          return { success: false, nickname: '' };
        }

        try {
          const meResp = await net.fetch('https://account.guangyapan.com/v1/user/me', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Client-Id': 'aMe-8VSlkrbQXpUR',
              'X-Device-Id': deviceId,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            }
          });
          if (meResp.ok) {
            const meJson: any = await meResp.json();
            const nick = meJson?.nickname || meJson?.nick_name || meJson?.name || meJson?.username;
            if (nick && typeof nick === 'string' && nick.trim()) {
              nickname = nick.trim();
            }
          }
        } catch {}

        return {
          success: true,
          nickname,
          quotaText,
          totalSpace,
          usedSpace,
          extra: {
            accessToken,
            refreshToken,
            deviceId
          }
        };
      }

      case 'ilanzou': {
        let appToken = cookieMap['appToken'] || cookieMap['token'] || '';
        let uuid = cookieMap['uuid'] || '';
        if (isWindowOnAllowedHost(win, ['ilanzou.com', 'ilanzou.cn', 'ilanzou.net'])) {
          try {
            const storageObj = await win!.webContents.executeJavaScript(`(() => {
              const dump = (store) => {
                const out = {};
                try {
                  for (let i = 0; i < store.length; i++) {
                    const k = store.key(i);
                    if (k) out[k] = store.getItem(k);
                  }
                } catch {}
                return out;
              };
              return { ls: dump(localStorage), ss: dump(sessionStorage) };
            })()`);
            const extractFromEntries = (entries: Record<string, any>) => {
              if (!entries || typeof entries !== 'object') return;
              for (const [k, rawVal] of Object.entries(entries)) {
                if (typeof rawVal !== 'string' || !rawVal) continue;
                const lk = k.toLowerCase();
                if ((lk === 'apptoken' || lk === 'token' || lk === 'app_token') && rawVal.length >= 16) {
                  appToken = rawVal.replace(/^"|"$/g, '');
                } else if (lk === 'uuid' && rawVal.length >= 8) {
                  uuid = rawVal.replace(/^"|"$/g, '');
                } else if (rawVal.trim().startsWith('{')) {
                  try {
                    const obj = JSON.parse(rawVal);
                    if (typeof obj?.appToken === 'string' && obj.appToken.length >= 16 && !appToken) {
                      appToken = obj.appToken;
                    }
                    if (typeof obj?.uuid === 'string' && obj.uuid.length >= 8 && !uuid) {
                      uuid = obj.uuid;
                    }
                  } catch {}
                }
              }
            };
            extractFromEntries(storageObj?.ls);
            extractFromEntries(storageObj?.ss);
          } catch {}
        }

        if (!appToken) {
          return { success: false, nickname: '' };
        }

        const ilanzouHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Origin': 'https://www.ilanzou.com',
          'Referer': 'https://www.ilanzou.com/',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site'
        };

        const aesHex = (plain: string) => {
          const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from('lanZouY-disk-app', 'utf8'), null);
          cipher.setAutoPadding(true);
          return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('hex');
        };
        const encodeToken = (v: string) => encodeURIComponent(v).replace(/%3A/gi, ':');

        try {
          if (!uuid) {
            const ts = aesHex(String(Date.now()));
            const uuidUrl =
              `https://apis.ilanzou.com/unproved/getUuid?uuid=&devType=6&devCode=&devModel=chrome&devVersion=125&appVersion=&timestamp=${encodeToken(ts)}&extra=2`;
            const uuidResp = await net.fetch(uuidUrl, { headers: ilanzouHeaders });
            if (uuidResp.ok) {
              const uuidJson: any = await uuidResp.json();
              if (uuidJson?.uuid) uuid = String(uuidJson.uuid);
            }
          }
          if (!uuid) return { success: false, nickname: '' };

          const ts = aesHex(String(Date.now()));
          const mapUrl =
            `https://apis.ilanzou.com/proved/user/account/map?uuid=${encodeToken(uuid)}&devType=6&devCode=${encodeToken(uuid)}&devModel=chrome&devVersion=125&appVersion=&timestamp=${encodeToken(ts)}&appToken=${encodeToken(appToken)}&extra=2`;
          const mapResp = await net.fetch(mapUrl, { headers: ilanzouHeaders });
          if (!mapResp.ok) return { success: false, nickname: '' };
          const mapJson: any = await mapResp.json();
          if (mapJson?.code !== 200 || !mapJson?.map?.userId) {
            return { success: false, nickname: '' };
          }
          const map = mapJson.map;
          const userId = String(map.userId);
          const nickname = String(map.nickName || map.nickname || map.account || '蓝奏优享用户').trim();
          const used = Math.round(Number(map.usedSize || 0) * 1024);
          const total = Math.round((Number(map.totalSize || 0) + Number(map.vipSize || 0) + Number(map.rewardSize || 0)) * 1024);
          const quotaText = total > 0 ? `${formatBytes(used)} / ${formatBytes(total)}` : undefined;

          return {
            success: true,
            nickname,
            quotaText,
            totalSpace: total > 0 ? total : undefined,
            usedSpace: total > 0 ? used : undefined,
            extra: {
              appToken,
              uuid,
              userId
            }
          };
        } catch {
          return { success: false, nickname: '' };
        }
      }

      default:
        return { success: false, nickname: '' };
    }
  }
}
