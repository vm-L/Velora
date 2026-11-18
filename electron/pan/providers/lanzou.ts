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
  inferFormatType,
  mapConcurrent,
  parseHumanSize,
  parseTimestamp,
  sleep
} from '../utils';

/**
 * 蓝奏云常量（严格依据 YunX-Desktop LanzouConstants.kt）
 */
export const LANZOU_CONSTANTS = {
  WEB_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  MYDISK_URL: 'https://pc.woozooo.com/mydisk.php',
  MYDISK_FILES_URL: 'https://pc.woozooo.com/mydisk.php?item=files&action=index',
  DOUPLOAD_URL: 'https://pc.woozooo.com/doupload.php',
  ORIGIN: 'https://pc.woozooo.com',
  DOWN_IP_COOKIE: 'down_ip=1',
  FOLDER_PREFIX: 'd:',
  FILE_PREFIX: 'f:'
};

interface LanzouLoginParams {
  uid: string;
  vei: string;
}

export class LanzouProvider implements PanProvider, PanDriveProvider {
  panType = 'lanzou' as const;

  private loginParamsCache = new Map<string, LanzouLoginParams>();
  private itemNameCache = new Map<string, string>();

  canHandle(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    // 严格排除蓝奏云优享版域名，避免与蓝奏云混淆
    if (lower.includes('ilanzou.')) return false;
    return /(?:^|[/.])(?:lanzou[a-z0-9-]*|lan[zs]o[ux]|woozooo)\.(?:com|net|org|cn)/i.test(lower);
  }

  private async fetchLoginParams(cookieHeader: string): Promise<LanzouLoginParams> {
    if (!cookieHeader) {
      throw new Error('蓝奏云未登录，请先在设置中登录蓝奏云账号');
    }
    const cached = this.loginParamsCache.get(cookieHeader);
    if (cached) return cached;

    const resp = await net.fetch(LANZOU_CONSTANTS.MYDISK_FILES_URL, {
      headers: {
        Cookie: cookieHeader,
        'User-Agent': LANZOU_CONSTANTS.WEB_UA,
        Referer: LANZOU_CONSTANTS.MYDISK_URL,
        Origin: LANZOU_CONSTANTS.ORIGIN
      }
    });
    if (!resp.ok) {
      throw new Error('蓝奏云登录态无效，请在设置中重新登录');
    }
    const html = await resp.text();
    const uid = html.match(/uid['"]?\s*[=:]\s*['"]?(\d{1,20})/)?.[1] || '';
    const vei = html.match(/vei['"]?\s*[=:]\s*['"]?([A-Za-z0-9_\-+/=]{1,256})/)?.[1] || '';
    if (!uid || !vei) {
      throw new Error('蓝奏云登录态已过期，请在设置中重新登录');
    }
    const params = { uid, vei };
    if (this.loginParamsCache.size >= 20) this.loginParamsCache.clear();
    this.loginParamsCache.set(cookieHeader, params);
    return params;
  }

  private async doupload(
    cookieHeader: string,
    fields: Record<string, string>,
    allowEnd = false,
    retryAuth = true
  ): Promise<any> {
    const { uid, vei } = await this.fetchLoginParams(cookieHeader);
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) {
      form.append(k, v);
    }

    const resp = await net.fetch(`${LANZOU_CONSTANTS.DOUPLOAD_URL}?uid=${encodeURIComponent(uid)}&vei=${encodeURIComponent(vei)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieHeader,
        'User-Agent': LANZOU_CONSTANTS.WEB_UA,
        Referer: LANZOU_CONSTANTS.MYDISK_URL,
        Origin: LANZOU_CONSTANTS.ORIGIN,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: form.toString()
    });
    if (resp.status === 401 || resp.status === 403) {
      this.loginParamsCache.delete(cookieHeader);
      throw new Error('蓝奏云登录已过期，请在设置中重新登录');
    }
    const text = await resp.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('蓝奏文件操作失败，请检查登录态或文件权限');
    }
    const zt = Number(json?.zt ?? -1);
    if (zt === 1 || (zt === 2 && allowEnd)) {
      return json;
    }
    if (zt === 9 && retryAuth) {
      this.loginParamsCache.delete(cookieHeader);
      return this.doupload(cookieHeader, fields, allowEnd, false);
    }
    if (zt === 4) throw new Error('蓝奏请求过于频繁，请稍后重试');
    if (zt === 9) throw new Error('蓝奏登录已过期，请在设置中重新登录');
    throw new Error(json?.info || `蓝奏文件操作失败 (zt=${zt})`);
  }

  private jsVar(html: string, name: string): string | undefined {
    const m = html.match(new RegExp(`(?:(?:var|let|const)\\s+)?${name}\\s*=\\s*['"]([^'"]*)['"]`));
    return m?.[1];
  }

  private jsVarRaw(html: string, name: string): string | undefined {
    const m = html.match(new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*([^;,\\n\\r]+)`));
    return m?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  }

  private inputValue(html: string, name: string): string | undefined {
    const m1 = html.match(new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i'));
    if (m1) return m1[1];
    const m2 = html.match(new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i'));
    return m2?.[1];
  }

  private checkHtmlSafetyChallenge(html: string) {
    if (!html) return;
    if (/\barg1\s*=\s*'[0-9A-Fa-f]{40}'/.test(html) || html.includes('acw_sc__v2')) {
      throw new Error('该链接触发了蓝奏云安全验证，请在浏览器打开分享页完成验证后重试');
    }
    if (html.includes('文件已取消') || html.includes('文件不存在') || html.includes('取消分享')) {
      throw new Error('蓝奏云文件已取消分享或不存在');
    }
    if (html.includes('请求过于频繁')) {
      throw new Error('蓝奏云请求过于频繁，请稍后再试');
    }
  }

  private async fetchSharePage(url: string): Promise<{ finalUrl: string; html: string }> {
    const resp = await net.fetch(url, {
      headers: {
        'User-Agent': LANZOU_CONSTANTS.WEB_UA,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: url
      }
    });
    const html = await resp.text();
    this.checkHtmlSafetyChallenge(html);
    return { finalUrl: resp.url || url, html };
  }

  private async rangeProbe(url: string, shareOrigin: string): Promise<{ url: string; size?: number } | null> {
    const controller = new AbortController();
    try {
      const resp = await net.fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': LANZOU_CONSTANTS.WEB_UA,
          Referer: `${shareOrigin}/`,
          Cookie: LANZOU_CONSTANTS.DOWN_IP_COOKIE,
          Range: 'bytes=0-8191'
        }
      });
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        throw new Error('该链接触发了蓝奏云安全验证，请在浏览器打开分享页完成验证后重试');
      }
      const cr = resp.headers.get('content-range');
      let size: number | undefined;
      if (cr) {
        const total = parseInt(cr.split('/').pop() || '', 10);
        if (total > 0) size = total;
      }
      return { url, size };
    } catch (err: any) {
      if (/安全验证/.test(String(err?.message || ''))) throw err;
      return null;
    } finally {
      try {
        controller.abort();
      } catch {}
    }
  }

  /**
   * 跟随跳板重定向探测真实 CDN 下载地址（严格不绕过安全验证页）
   */
  private async probeFinalDownloadUrl(jumpUrl: string, shareOrigin: string): Promise<{ url: string; size?: number }> {
    let current = jumpUrl;
    const visited = new Set<string>();

    for (let hop = 0; hop < 8; hop++) {
      if (visited.has(current)) {
        throw new Error('蓝奏下载地址发生循环跳转，请重新解析');
      }
      visited.add(current);

      const resp = await net.fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': LANZOU_CONSTANTS.WEB_UA,
          Referer: `${shareOrigin}/`,
          Cookie: LANZOU_CONSTANTS.DOWN_IP_COOKIE
        }
      });

      const location = resp.headers.get('location');
      if (resp.status >= 300 && resp.status < 400 && location) {
        current = new URL(location, current).toString();
        continue;
      }

      if (resp.status === 200 || resp.status === 206) {
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) {
          throw new Error('该链接触发了蓝奏云安全验证，请在浏览器打开分享页完成验证后重试');
        }
        const cr = resp.headers.get('content-range');
        const lenStr = resp.headers.get('content-length');
        let size = cr ? parseInt(cr.split('/').pop() || '', 10) || undefined : undefined;
        if (!size && resp.status === 200 && lenStr) {
          size = parseInt(lenStr, 10) || undefined;
        }
        if (!size) {
          const fallback = await this.rangeProbe(current, shareOrigin);
          if (fallback?.size) return { url: current, size: fallback.size };
        }
        return { url: current, size };
      }

      if (resp.status === 403 || resp.status === 404 || resp.status === 410) {
        throw new Error('蓝奏云下载地址已失效，请重新解析分享');
      }
      if (resp.status === 429) {
        throw new Error('蓝奏云请求过于频繁，请稍后再试');
      }

      const fallback = await this.rangeProbe(current, shareOrigin);
      if (fallback) {
        return fallback;
      }
      throw new Error(`蓝奏云下载地址暂时不可用 (HTTP ${resp.status})`);
    }

    return { url: current };
  }

  /**
   * 1. 蓝奏云分享解析（单文件 & 文件夹，对齐 YunX LanzouApi）
   */
  async parse(url: string, password = '', _account?: PanAccount): Promise<PanParseResult> {
    logger.info('LanzouProvider', `开始解析蓝奏云链接: ${url}`);
    try {
      const urlPwdMatch = url.match(/[?&](?:pwd|pass|passcode|password)=([A-Za-z0-9]+)/i);
      const effectivePwd = (password || urlPwdMatch?.[1] || '').trim();
      const { finalUrl, html } = await this.fetchSharePage(url);

      const isFolder =
        finalUrl.includes('/b') ||
        html.includes('filemoreajax') ||
        html.includes('class="filemore"') ||
        html.includes('file_more') ||
        html.includes('class="f_list"');

      if (isFolder) {
        return await this.parseFolder(finalUrl, html, effectivePwd);
      }
      return await this.parseSingleFile(finalUrl, html, effectivePwd);
    } catch (err: any) {
      logger.error('LanzouProvider', `解析失败: ${err.message}`);
      return {
        panType: 'lanzou',
        shareTitle: '蓝奏云资源',
        files: [],
        error: err?.message || '解析蓝奏云分享失败'
      };
    }
  }

  private resolveAjaxEndpoint(html: string, origin: string, fileId: string, withPwd: boolean): string {
    const d1 = this.jsVar(html, 'domain1');
    if (d1 && d1.includes('/ajax')) return d1;
    const d2 = this.jsVar(html, 'domain2');
    if (d2 && d2.includes('/ajax')) return d2;
    const absMatch = html.match(/https?:\/\/[^'"\s]+\/(?:ajaxm|ajaxfile)\.php\?file=\d+/);
    if (absMatch) return absMatch[0];
    return withPwd ? `${origin}/ajaxfile.php?file=${fileId}` : `${origin}/ajaxm.php?file=${fileId}`;
  }

  private async resolveItemDirectUrl(
    pageUrl: string,
    password = '',
    preloadedHtml?: string
  ): Promise<{ url: string; size?: number } | undefined> {
    if (!pageUrl) return undefined;
    try {
      const origin = new URL(pageUrl).origin;
      let html = preloadedHtml;
      if (!html) {
        const fetched = await this.fetchSharePage(pageUrl);
        html = fetched.html;
      }

      const iframeMatch =
        html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframeMatch && !iframeMatch[1].startsWith('javascript')) {
        const iframeUrl = new URL(iframeMatch[1], origin).toString();
        if (new URL(iframeUrl).host === new URL(pageUrl).host) {
          const fetchedIframe = await this.fetchSharePage(iframeUrl);
          html = fetchedIframe.html;
        }
      }

      const fileId =
        html.match(/(?:ajaxm|ajaxfile)\.php\?file=(\d+)/)?.[1] ||
        html.match(/name=["']file["']\s+value=["'](\d+)["']/)?.[1] ||
        html.match(/file=(\d+)/)?.[1] ||
        '';

      const sign =
        this.jsVar(html, 'wp_sign') ||
        this.jsVar(html, 'sign') ||
        html.match(/['"]sign['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1] ||
        this.inputValue(html, 'sign') ||
        this.jsVar(html, 'skdklds') ||
        this.jsVar(html, 'posign') ||
        '';

      if (!sign) return undefined;

      const withPwd = Boolean(password && password.trim().length > 0);
      const ajaxUrl = fileId
        ? this.resolveAjaxEndpoint(html, origin, fileId, withPwd)
        : `${origin}/ajaxm.php`;

      const form = new URLSearchParams();
      form.append('action', 'downprocess');
      form.append('sign', sign);

      if (withPwd) {
        form.append('p', password.trim());
        form.append('kd', '1');
      } else {
        const ajaxData = this.jsVar(html, 'ajaxdata');
        const key = ajaxData || this.jsVar(html, 'websignkey') || this.inputValue(html, 'websignkey') || '';
        const kd = this.jsVarRaw(html, 'kdns') || '1';
        form.append('signs', this.jsVar(html, 'signs') || key);
        form.append('websignkey', key);
        form.append('websign', this.jsVar(html, 'websign') || '');
        form.append('kd', kd);
        form.append('ves', '1');
      }

      const postResp = await net.fetch(ajaxUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: pageUrl,
          Origin: origin,
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': LANZOU_CONSTANTS.WEB_UA,
          'Accept-Language': 'zh-CN,zh;q=0.9'
        },
        body: form.toString()
      });

      const postText = await postResp.text();
      if (postText.trimStart().startsWith('<')) {
        throw new Error('该链接触发了蓝奏云安全验证，请在浏览器打开分享页完成验证后重试');
      }
      const postJson: any = JSON.parse(postText);
      if (Number(postJson?.zt ?? 0) !== 1) {
        const inf = String(postJson?.inf || '');
        if (inf.includes('密码') || inf.includes('提取码')) {
          throw new Error('蓝奏云提取码错误，请检查后重试');
        }
        throw new Error(inf || '蓝奏云解析直链失败');
      }

      const dom = String(postJson.dom || '');
      const rel = String(postJson.url || '');
      if (!dom || !rel || rel.includes('://')) {
        throw new Error('蓝奏云未返回有效文件节点地址');
      }
      const domOrigin = new URL(dom).origin;
      const jumpUrl = `${domOrigin}/file/${rel.replace(/^\/+/, '')}`;
      return await this.probeFinalDownloadUrl(jumpUrl, origin);
    } catch (err: any) {
      logger.warn('LanzouProvider', `解析蓝奏直链异常 (${pageUrl}): ${err.message}`);
      throw err;
    }
  }

  private async parseSingleFile(url: string, html: string, password = ''): Promise<PanParseResult> {
    const nameMatch =
      html.match(/<div class="n_box_3fn">([^<]+)<\/div>/i) ||
      html.match(/<div style="font-size:\s*22px;color:\s*#333;">([^<]+)<\/div>/i) ||
      html.match(/var\s+filename\s*=\s*['"]([^'"]+)['"]/) ||
      html.match(/<title>([^<]+)<\/title>/i);
    let fileName = (nameMatch?.[1] || 'lanzou_file').replace(/\s*-\s*蓝奏云.*$/, '').trim();
    if (!fileName || fileName.includes('密码')) fileName = '蓝奏分享文件';

    const sizeMatch = html.match(/(?:文件)?大小[：:\s]*([^<|]+)/i) || html.match(/<span class="p7">([^<]+)<\/span>/i);
    const fileSize = sizeMatch ? parseHumanSize(sizeMatch[1]) : 0;

    let directUrl: string | undefined;
    let probedSize: number | undefined;
    const resolved = await this.resolveItemDirectUrl(url, password, html);
    if (resolved) {
      directUrl = resolved.url;
      probedSize = resolved.size;
    }

    const finalSize = fileSize > 0 ? fileSize : probedSize || 0;
    const fileItem: PanFileItem = {
      id: 'lanzou_0',
      name: fileName,
      path: fileName,
      size: finalSize,
      isDirectory: false,
      rawInfo: {
        fid: 'lanzou_0',
        pwdId: url,
        stoken: password,
        url,
        password,
        resolvedUrl: directUrl,
        resolvedAt: directUrl ? Date.now() : 0,
        size: finalSize,
        name: fileName
      }
    };

    return {
      panType: 'lanzou',
      shareTitle: fileName,
      files: [fileItem]
    };
  }

  private async parseFolder(url: string, html: string, password = ''): Promise<PanParseResult> {
    const titleMatch =
      html.match(/<div class="user-title">([^<]+)<\/div>/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    const title = (titleMatch?.[1] || '蓝奏云分享文件夹').replace(/\s*-\s*蓝奏云.*$/, '').trim();

    const parsedUrl = new URL(url);
    const fallbackFid = parsedUrl.pathname.replace(/^\/+|\/+$/g, '').split('/').pop() || '';
    const fidVal = this.jsVarRaw(html, 'fid') || html.match(/'fid'\s*:\s*'?([0-9]+)'?/i)?.[1] || fallbackFid;
    const uidVal = this.jsVar(html, 'uid') || this.jsVarRaw(html, 'uid') || html.match(/'uid'\s*:\s*'([0-9]+)'/i)?.[1];
    const lxVal = this.jsVarRaw(html, 'lx') || '2';
    const tVal = this.jsVar(html, 't') || html.match(/'t'\s*:\s*'([a-zA-Z0-9]+)'/i)?.[1];
    const kVal = this.jsVar(html, 'k') || html.match(/'k'\s*:\s*'([a-zA-Z0-9]+)'/i)?.[1];

    const files: PanFileItem[] = [];
    const seen = new Set<string>();

    if (fidVal && tVal && kVal) {
      const origin = parsedUrl.origin;
      const postUrl = `${origin}/filemoreajax.php`;
      let rateRetries = 0;

      for (let page = 1; page <= 100; page++) {
        const form = new URLSearchParams();
        form.append('lx', lxVal);
        form.append('fid', fidVal);
        if (uidVal) form.append('uid', uidVal);
        form.append('t', tVal);
        form.append('k', kVal);
        form.append('pwd', password || '');
        form.append('pg', String(page));

        const resp = await net.fetch(postUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: url,
            Origin: origin,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': LANZOU_CONSTANTS.WEB_UA
          },
          body: form.toString()
        });

        const json: any = await resp.json();
        const zt = Number(json?.zt ?? 0);
        if (zt === 2) break;
        if (zt === 3) throw new Error('蓝奏云提取码错误，请检查后重试');
        if (zt === 4) {
          rateRetries++;
          if (rateRetries > 3) {
            throw new Error('蓝奏云请求过于频繁，请稍后再试');
          }
          await sleep(400);
          page--;
          continue;
        }
        if (zt !== 1 || !Array.isArray(json?.text) || json.text.length === 0) break;
        rateRetries = 0;

        let added = 0;
        for (const item of json.text) {
          const rawId = String(item.id || '');
          if (!rawId || seen.has(rawId)) continue;
          seen.add(rawId);
          added++;
          const itemUrl = new URL(rawId, origin).toString();
          const name = item.name_all || item.name || '未知文件';
          files.push({
            id: rawId,
            name,
            path: name,
            size: parseHumanSize(item.size),
            isDirectory: false,
            rawInfo: {
              fid: rawId,
              pwdId: itemUrl,
              stoken: password,
              itemUrl,
              password,
              name
            }
          });
        }
        if (added === 0) break;
      }
    }

    return {
      panType: 'lanzou',
      shareTitle: title,
      files
    };
  }

  /**
   * 2. 分享取链
   */
  async getShareDownloadUrlsDetail(
    items: PanShareDownloadItem[],
    _account?: PanAccount
  ): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!items || items.length === 0) return result;

    await mapConcurrent(items, 3, async (item) => {
      if (!item.fid) return;
      const sharePageUrl = item.extra?.url || item.extra?.itemUrl || (item.pwdId && !item.pwdId.includes('/file/') ? item.pwdId : '');
      const cachedUrl = typeof item.extra?.resolvedUrl === 'string' ? item.extra.resolvedUrl : '';
      const cachedAt = Number(item.extra?.resolvedAt || 0);
      const isFreshCached = Boolean(cachedUrl && cachedAt > 0 && Date.now() - cachedAt < 10 * 60 * 1000);

      let directUrl = isFreshCached ? cachedUrl : '';
      let size = item.extra?.size;
      if (!directUrl) {
        if (!sharePageUrl) return;
        const resolved = await this.resolveItemDirectUrl(sharePageUrl, item.stoken || item.extra?.password || '');
        if (!resolved?.url) return;
        directUrl = resolved.url;
        if (resolved.size) size = resolved.size;
      }
      const nodeOrigin = new URL(directUrl).origin;
      result[item.fid] = {
        fid: item.fid,
        url: directUrl,
        size: size || undefined,
        filename: item.extra?.name,
        headers: {
          'User-Agent': LANZOU_CONSTANTS.WEB_UA,
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: `${nodeOrigin}/`,
          Cookie: LANZOU_CONSTANTS.DOWN_IP_COOKIE
        }
      };
    });

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
   * 3. 个人网盘文件列表（目录 ID 前缀 d:，文件 ID 前缀 f:）
   */
  async listFiles(pdirFid = '0', account: PanAccount): Promise<PanDriveListResult> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const displayParent = !pdirFid || pdirFid === '0' ? '0' : pdirFid;
    const apiFolderId =
      !pdirFid || pdirFid === '0'
        ? '-1'
        : pdirFid.startsWith(LANZOU_CONSTANTS.FOLDER_PREFIX)
          ? pdirFid.slice(LANZOU_CONSTANTS.FOLDER_PREFIX.length)
          : pdirFid;

    // 1. 子文件夹（task=47）
    const fJson = await this.doupload(cookieHeader, { task: '47', folder_id: apiFolderId }, true);
    const folderList: PanDriveItem[] = [];
    if (Array.isArray(fJson?.text)) {
      for (const fol of fJson.text) {
        const rawId = String(fol?.fol_id || fol?.id || '');
        if (!rawId) continue;
        const prefixedId = `${LANZOU_CONSTANTS.FOLDER_PREFIX}${rawId}`;
        const name = String(fol?.name || fol?.name_all || '文件夹');
        this.itemNameCache.set(prefixedId, name);
        folderList.push({
          id: prefixedId,
          name,
          pdir_fid: displayParent,
          size: 0,
          isDirectory: true,
          updatedAt: Date.now(),
          formatType: 'folder'
        });
      }
    }

    // 2. 分页获取子文件（task=5）
    const fileItemList: PanDriveItem[] = [];
    const seenIds = new Set<string>();
    for (let pg = 1; pg <= 100; pg++) {
      const fileJson = await this.doupload(
        cookieHeader,
        { task: '5', folder_id: apiFolderId, pg: String(pg) },
        true
      );
      if (!Array.isArray(fileJson?.text) || fileJson.text.length === 0) break;

      let newCount = 0;
      for (const fi of fileJson.text) {
        const rawId = String(fi?.id || '');
        if (!rawId || seenIds.has(rawId)) continue;
        seenIds.add(rawId);
        newCount++;
        const prefixedId = `${LANZOU_CONSTANTS.FILE_PREFIX}${rawId}`;
        const name = String(fi?.name_all || fi?.name || '未知文件');
        this.itemNameCache.set(prefixedId, name);
        fileItemList.push({
          id: prefixedId,
          name,
          pdir_fid: displayParent,
          size: parseHumanSize(fi.size),
          isDirectory: false,
          updatedAt: parseTimestamp(fi.time),
          formatType: inferFormatType(name, false)
        });
      }
      if (newCount === 0) break;
    }

    const all = [...folderList, ...fileItemList];
    return {
      files: all,
      total: all.length,
      pdir_fid: displayParent
    };
  }

  /**
   * 4. 个人网盘取直链：task=22 取分享短链 -> 解析分享页 -> probeFinalDownloadUrl
   */
  async getDriveDownloadUrl(fid: string, account: PanAccount): Promise<string> {
    const urls = await this.getBatchDownloadUrls([fid], account);
    return urls[fid] || '';
  }

  async getBatchDownloadUrlsDetail(fids: string[], account: PanAccount): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!fids || fids.length === 0) return result;

    await mapConcurrent(fids, 3, async (fid) => {
      if (!fid) return;
      const share = await this.createShare({ fids: [fid], expireType: 1 }, account);
      const resolved = await this.resolveItemDirectUrl(share.shareUrl, share.passcode || '');
      if (!resolved?.url) return;
      const nodeOrigin = new URL(resolved.url).origin;
      result[fid] = {
        fid,
        url: resolved.url,
        size: resolved.size,
        filename: this.itemNameCache.get(fid),
        headers: {
          'User-Agent': LANZOU_CONSTANTS.WEB_UA,
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: `${nodeOrigin}/`,
          Cookie: LANZOU_CONSTANTS.DOWN_IP_COOKIE
        }
      };
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
   * 5. 个人盘管理：新建文件夹 / 重命名 / 移动文件 / 删除 / 创建分享
   */
  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const apiParent =
      !parentFid || parentFid === '0'
        ? '-1'
        : parentFid.startsWith(LANZOU_CONSTANTS.FOLDER_PREFIX)
          ? parentFid.slice(LANZOU_CONSTANTS.FOLDER_PREFIX.length)
          : parentFid;

    const json = await this.doupload(cookieHeader, {
      task: '2',
      parent_id: apiParent,
      folder_name: name,
      folder_description: ''
    });
    const newId = String(json?.text || '');
    if (!/^\d+$/.test(newId)) {
      throw new Error('蓝奏云未返回新文件夹信息');
    }
    const prefixed = `${LANZOU_CONSTANTS.FOLDER_PREFIX}${newId}`;
    this.itemNameCache.set(prefixed, name);
    return { fid: prefixed, name };
  }

  async renameItem(
    fid: string,
    newName: string,
    account: PanAccount,
    extra?: { isDirectory?: boolean }
  ): Promise<boolean> {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const isDir = fid.startsWith(LANZOU_CONSTANTS.FOLDER_PREFIX) || !!extra?.isDirectory;
    if (isDir) {
      const rawId = fid.startsWith(LANZOU_CONSTANTS.FOLDER_PREFIX)
        ? fid.slice(LANZOU_CONSTANTS.FOLDER_PREFIX.length)
        : fid;
      await this.doupload(cookieHeader, {
        task: '4',
        folder_id: rawId,
        folder_name: newName,
        folder_description: ''
      });
    } else {
      const rawId = fid.startsWith(LANZOU_CONSTANTS.FILE_PREFIX)
        ? fid.slice(LANZOU_CONSTANTS.FILE_PREFIX.length)
        : fid;
      // 蓝奏云文件重命名后端会自动拼接原扩展名，若用户输入带原扩展名则先剥离
      const origName = this.itemNameCache.get(fid) || '';
      const origDotIdx = origName.lastIndexOf('.');
      let submitName = newName;
      if (origDotIdx > 0) {
        const origExt = origName.slice(origDotIdx).toLowerCase();
        if (submitName.toLowerCase().endsWith(origExt) && submitName.length > origExt.length) {
          submitName = submitName.slice(0, -origExt.length);
        }
      }
      await this.doupload(cookieHeader, {
        task: '46',
        file_id: rawId,
        file_name: submitName,
        type: '2'
      });
    }
    this.itemNameCache.set(fid, newName);
    return true;
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    if (fids.some((id) => id.startsWith(LANZOU_CONSTANTS.FOLDER_PREFIX))) {
      throw new Error('蓝奏云暂不支持移动文件夹，请仅选择文件移动');
    }
    const cookieHeader = buildCookieHeader(account?.cookies);
    const apiTargetId =
      !targetDirFid || targetDirFid === '0'
        ? '-1'
        : targetDirFid.startsWith(LANZOU_CONSTANTS.FOLDER_PREFIX)
          ? targetDirFid.slice(LANZOU_CONSTANTS.FOLDER_PREFIX.length)
          : targetDirFid;

    for (const fid of fids) {
      const rawFileId = fid.startsWith(LANZOU_CONSTANTS.FILE_PREFIX)
        ? fid.slice(LANZOU_CONSTANTS.FILE_PREFIX.length)
        : fid;
      await this.doupload(cookieHeader, {
        task: '20',
        folder_id: apiTargetId,
        file_id: rawFileId
      });
    }
    return true;
  }

  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const cookieHeader = buildCookieHeader(account?.cookies);

    for (const fid of fids) {
      if (fid.startsWith(LANZOU_CONSTANTS.FOLDER_PREFIX)) {
        await this.doupload(cookieHeader, {
          task: '3',
          folder_id: fid.slice(LANZOU_CONSTANTS.FOLDER_PREFIX.length)
        });
      } else {
        const rawFileId = fid.startsWith(LANZOU_CONSTANTS.FILE_PREFIX)
          ? fid.slice(LANZOU_CONSTANTS.FILE_PREFIX.length)
          : fid;
        await this.doupload(cookieHeader, {
          task: '6',
          file_id: rawFileId
        });
      }
    }
    return true;
  }

  async createShare(params: PanCreateShareParams, account: PanAccount): Promise<PanShareCreatedInfo> {
    if (!params.fids || params.fids.length !== 1) {
      throw new Error('蓝奏云每次仅支持对单个文件或文件夹创建分享');
    }
    const cookieHeader = buildCookieHeader(account?.cookies);
    const targetId = params.fids[0];
    const isDir = targetId.startsWith(LANZOU_CONSTANTS.FOLDER_PREFIX);
    const rawId = isDir
      ? targetId.slice(LANZOU_CONSTANTS.FOLDER_PREFIX.length)
      : targetId.startsWith(LANZOU_CONSTANTS.FILE_PREFIX)
        ? targetId.slice(LANZOU_CONSTANTS.FILE_PREFIX.length)
        : targetId;

    const json = await this.doupload(cookieHeader, {
      task: isDir ? '18' : '22',
      file_id: rawId
    });
    const info = json?.info;
    if (!info) {
      throw new Error('蓝奏云未返回分享链接');
    }
    const domain = String(info.is_newd || 'https://pan.lanzoui.com');
    const baseOrigin = domain.includes('://') ? new URL(domain).origin : `https://${domain}`;
    const rawPath = String(isDir ? info.new_url || '' : info.f_id || '');
    const shareUrl = rawPath.includes('://') ? rawPath : `${baseOrigin}/${rawPath.replace(/^\/+/, '')}`;
    const pwd = String(info.pwd || '');
    return {
      shareUrl,
      passcode: pwd,
      shareId: rawPath,
      title: this.itemNameCache.get(targetId) || '蓝奏云分享'
    };
  }

  async getQuota(_account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    return {
      used: 0,
      total: 1024 * 1024 * 1024 * 1024 * 100,
      quotaText: '无限空间 (单文件上限)'
    };
  }
}
