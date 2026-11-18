/**
 * 网盘服务通用并发控制、HTTP 请求与格式化工具
 */
import http from 'http';
import https from 'https';
import zlib from 'zlib';

const panHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
const panHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 32,
  ALPNProtocols: ['http/1.1']
});

/**
 * 清洗 HTTP 请求头或 Cookie 值：
 * - 剔除控制字符（<0x20 且非 \t，以及 0x7f）
 * - 将非 ASCII 字符按 UTF-8 转为 %XX 大写百分号编码
 */
export function sanitizePanHeaderValue(value: string): string {
  if (!value) return '';
  let needsTransform = false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code >= 0x7f) {
      needsTransform = true;
      break;
    }
  }
  if (!needsTransform) return value;

  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x20 && cp <= 0x7e) || cp === 0x09) {
      out += ch;
    } else if (cp < 0x20 || cp === 0x7f) {
      continue;
    } else {
      const bytes = Buffer.from(ch, 'utf8');
      for (let i = 0; i < bytes.length; i++) {
        out += '%' + bytes[i].toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }
  return out;
}

export interface PanHttpResponse {
  status: number;
  ok: boolean;
  headers: http.IncomingHttpHeaders;
  text: string;
}

function hasHeaderCI(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === target);
}

function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (lower === 'authorization' || lower === 'cookie' || lower === 'host' || lower === 'content-length') {
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * 基于 Node 原生 http/https (HTTP/1.1) 执行轻量网盘接口请求，
 * 绕开 Chromium defaultSession 对主进程 net.fetch 的拦截与 Header 限制
 */
export async function panHttpRequest(
  urlStr: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    timeoutMs?: number;
    maxRedirects?: number;
  } = {}
): Promise<PanHttpResponse> {
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 20000;
  let currentUrl = urlStr;
  let currentMethod = (options.method || 'GET').toUpperCase();
  let currentBody: Buffer | undefined =
    options.body === undefined
      ? undefined
      : Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(String(options.body), 'utf8');

  let currentHeaders: Record<string, string> = {};
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      if (!k || v === undefined || v === null || v === '') continue;
      if (/[\r\n\x00-\x1f\x7f]/.test(k)) continue;
      const sanitized = sanitizePanHeaderValue(String(v));
      if (sanitized !== '') {
        currentHeaders[k] = sanitized;
      }
    }
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`不支持的协议: ${parsed.protocol}`);
    }

    const reqHeaders: Record<string, string> = { ...currentHeaders };
    if (!hasHeaderCI(reqHeaders, 'accept-encoding')) {
      reqHeaders['Accept-Encoding'] = 'gzip, deflate, br';
    }
    if (currentBody !== undefined && !hasHeaderCI(reqHeaders, 'content-length')) {
      reqHeaders['Content-Length'] = String(currentBody.length);
    }

    const resData = await new Promise<{
      status: number;
      headers: http.IncomingHttpHeaders;
      bodyText: string;
    }>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | null = null;
      const cleanupTimer = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };
      const doneResolve = (val: { status: number; headers: http.IncomingHttpHeaders; bodyText: string }) => {
        if (settled) return;
        settled = true;
        cleanupTimer();
        resolve(val);
      };
      const doneReject = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanupTimer();
        reject(err);
      };

      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;
      const req = transport.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: `${parsed.pathname}${parsed.search}`,
          method: currentMethod,
          headers: reqHeaders,
          agent: isHttps ? panHttpsAgent : panHttpAgent
        },
        (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            doneResolve({ status, headers: res.headers, bodyText: '' });
            return;
          }

          const encoding = String(res.headers['content-encoding'] || '').toLowerCase().trim();
          let stream: NodeJS.ReadableStream = res;
          if (encoding === 'gzip' || encoding === 'x-gzip') {
            const gunzip = zlib.createGunzip();
            res.pipe(gunzip);
            res.on('error', (err) => gunzip.destroy(err));
            stream = gunzip;
          } else if (encoding === 'deflate') {
            const inflate = zlib.createInflate();
            res.pipe(inflate);
            res.on('error', (err) => inflate.destroy(err));
            stream = inflate;
          } else if (encoding === 'br') {
            const brotli = zlib.createBrotliDecompress();
            res.pipe(brotli);
            res.on('error', (err) => brotli.destroy(err));
            stream = brotli;
          }

          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          stream.on('end', () => {
            doneResolve({
              status,
              headers: res.headers,
              bodyText: chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : ''
            });
          });
          stream.on('error', (err) => doneReject(err instanceof Error ? err : new Error(String(err))));
        }
      );

      timer = setTimeout(() => {
        const timeoutErr = new Error(`请求超时 (${timeoutMs}ms)`);
        req.destroy(timeoutErr);
        doneReject(timeoutErr);
      }, timeoutMs);

      req.on('error', (err) => doneReject(err instanceof Error ? err : new Error(String(err))));
      if (currentBody !== undefined) {
        req.write(currentBody);
      }
      req.end();
    });

    if ([301, 302, 303, 307, 308].includes(resData.status) && resData.headers.location) {
      const nextUrl = new URL(String(resData.headers.location), currentUrl);
      if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
        throw new Error(`不支持的重定向协议: ${nextUrl.protocol}`);
      }
      if (nextUrl.hostname.toLowerCase() !== parsed.hostname.toLowerCase()) {
        currentHeaders = stripSensitiveHeaders(currentHeaders);
      }
      if ([301, 302, 303].includes(resData.status) && currentMethod !== 'GET' && currentMethod !== 'HEAD') {
        currentMethod = 'GET';
        currentBody = undefined;
      }
      currentUrl = nextUrl.toString();
      continue;
    }

    return {
      status: resData.status,
      ok: resData.status >= 200 && resData.status < 300,
      headers: resData.headers,
      text: resData.bodyText
    };
  }

  throw new Error('HTTP 重定向次数过多');
}

/**
 * 受控并发映射工具（固定 worker pool 并发度，保持输出顺序一致）
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items || items.length === 0) return [];
  const results = new Array<R>(items.length);
  const workerCount = Math.min(Math.max(1, limit), items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

/**
 * 格式化字节容量
 */
export function formatPanBytes(bytes?: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * 解析网盘页面返回的人类可读文件大小字符串（例如 "12.5 M"、"800 KB"、"1.2G"、"512 B"）
 */
export function parseHumanSize(val: any): number {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.max(0, Math.round(val));
  }
  if (!val || typeof val !== 'string') return 0;
  const trimmed = val.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10) || 0;
  }
  const match = trimmed.match(/([\d.]+)\s*([KMGT]?B?)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return 0;
  const unit = (match[2] || '').toUpperCase();
  if (unit.startsWith('T')) return Math.round(num * 1024 * 1024 * 1024 * 1024);
  if (unit.startsWith('G')) return Math.round(num * 1024 * 1024 * 1024);
  if (unit.startsWith('M')) return Math.round(num * 1024 * 1024);
  if (unit.startsWith('K')) return Math.round(num * 1024);
  return Math.round(num);
}

/**
 * 组装 Cookie 请求头字符串（过滤非法键名并编码非 ASCII 值）
 */
export function buildCookieHeader(cookies?: Record<string, string>): string {
  if (!cookies) return '';
  return Object.entries(cookies)
    .filter(([k, v]) => !!k && !/[\s=;,\x00-\x1f\x7f]/.test(k) && v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${sanitizePanHeaderValue(String(v))}`)
    .join('; ');
}

/**
 * 异步休眠
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 推断文件类型标记，与前端图标匹配
 */
export function inferFormatType(name: string, isDirectory: boolean): string {
  if (isDirectory) return 'folder';
  const ext = (name || '').split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ts', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) return 'image';
  return 'file';
}

/**
 * 解析秒/毫秒/ISO 时间字符串为毫秒时间戳
 */
export function parseTimestamp(val: any): number {
  if (!val) return Date.now();
  if (typeof val === 'number') {
    if (val <= 0 || isNaN(val)) return Date.now();
    return val < 1e12 ? val * 1000 : val;
  }
  const str = String(val).trim();
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    return n < 1e12 ? n * 1000 : n;
  }
  const t = Date.parse(str);
  return isNaN(t) ? Date.now() : t;
}
