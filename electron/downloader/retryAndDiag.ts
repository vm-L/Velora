import crypto from 'crypto'
import type { ManagedFetchHandle, UrlDiagInfo, HttpErrorDiag } from './types'
import { fetchWithRedirectGuard, getHeaderCaseInsensitive, parseUrlHost } from './httpClient'

/**
 * 判断是否为瞬态网络波动错误（连接重置、超时、临时断网、网关抖动等）
 */
export function isTransientNetworkError(err: any): boolean {
  if (!err) return false
  if (err.name === 'AbortError') return false

  const msg = (err.message || String(err)).toLowerCase()
  const code = (err.code || '').toLowerCase()

  // 明确的致命错误，不可按瞬态重试
  if (
    msg.includes('http 404') ||
    msg.includes('http 403') ||
    msg.includes('http 401') ||
    msg.includes('http 410') ||
    code === 'enospc' ||
    msg.includes('enospc') ||
    code === 'eacces' ||
    code === 'eperm' ||
    code === 'erofs'
  ) {
    return false
  }

  // 瞬态网络特征匹配
  const transientPatterns = [
    'err_connection_reset',
    'err_connection_closed',
    'err_connection_refused',
    'err_connection_timed_out',
    'err_timed_out',
    'err_network_changed',
    'err_internet_disconnected',
    'err_name_not_resolved',
    'err_address_unreachable',
    'err_ssl_protocol_error',
    'econnreset',
    'etimedout',
    'econnrefused',
    'ehostunreach',
    'enetunreach',
    'enotfound',
    'fetch failed',
    'socket hang up',
    'premature close',
    'incomplete chunk',
    '数据不完整',
    '流读取超时',
    '请求超时',
    'network error',
    'timeout',
    'terminated',
    'other side closed',
    'err_http2_protocol_error',
    'err_quic_protocol_error',
    'err_empty_response',
    'err_content_length_mismatch',
    'err_incomplete_chunked_encoding',
    'err_proxy_connection_failed',
    'err_tunnel_connection_failed',
    'err_socket_not_connected',
    'err_aborted',
    'err_connection_aborted',
    'http 429',
    'http 500',
    'http 502',
    'http 503',
    'http 504'
  ]

  return transientPatterns.some(pattern => msg.includes(pattern) || code.includes(pattern))
}

/**
 * 格式化瞬态错误信息为简明直观的提示（用于界面红字提示）
 */
export function formatTransientErrorMessage(err: any): string {
  if (!err) return '网络连接异常'
  const msg = err.message || String(err)

  if (/err_connection_reset/i.test(msg)) return 'net::ERR_CONNECTION_RESET'
  if (/err_connection_closed/i.test(msg)) return 'net::ERR_CONNECTION_CLOSED'
  if (/err_connection_refused/i.test(msg)) return 'net::ERR_CONNECTION_REFUSED'
  if (/err_connection_timed_out|err_timed_out|etimedout/i.test(msg)) return '连接超时 (ETIMEDOUT)'
  if (/err_network_changed/i.test(msg)) return '网络发生变动'
  if (/err_internet_disconnected/i.test(msg)) return '网络已断开'
  if (/err_name_not_resolved|enotfound/i.test(msg)) return '域名解析失败 (ENOTFOUND)'
  if (/econnreset/i.test(msg)) return '连接重置 (ECONNRESET)'
  if (/err_http2_protocol_error/i.test(msg)) return 'HTTP/2 连接中断'
  if (/err_quic_protocol_error/i.test(msg)) return 'QUIC 连接异常'
  if (/err_proxy_connection_failed|err_tunnel_connection_failed/i.test(msg)) return '代理连接失败'
  if (/err_empty_response/i.test(msg)) return '服务器返回空响应'
  if (/err_content_length_mismatch|数据不完整/i.test(msg)) return '分片数据不完整'
  if (/http 429/i.test(msg)) return '请求过于频繁 (HTTP 429)'
  if (/http 502/i.test(msg)) return '网关错误 (HTTP 502)'
  if (/http 503/i.test(msg)) return '服务暂不可用 (HTTP 503)'
  if (/http 504/i.test(msg)) return '网关超时 (HTTP 504)'
  if (/http 500/i.test(msg)) return '服务器内部错误 (HTTP 500)'

  const firstLine = msg.split('\n')[0].trim()
  return firstLine.length > 35 ? firstLine.slice(0, 35) + '...' : firstLine
}

/**
 * 计算网络重试等待延迟（毫秒）
 * - 1~5 次（快速响应期）：起始 300ms，指数递增至 1.5s，快速自愈偶发断流
 * - 6~15 次（连接冷却期）：2000ms ~ 4000ms 逐步拉开重试步长，避免打爆连接池或被服务端硬限流
 * - 16 次以上（长效重试期）：固定 5000ms 稳妥探测
 * - HTTP 429 限流错误：起始 1500ms，最大封顶 4000ms
 */
export function getTransientRetryDelay(attempts: number, err?: any): number {
  const errMsg = err ? (err.message || String(err)).toLowerCase() : ''
  if (errMsg.includes('429')) {
    return Math.min(4000, Math.round(1500 * Math.pow(1.3, Math.min(attempts, 5))))
  }
  if (attempts <= 5) {
    return Math.min(1500, Math.round(300 * Math.pow(1.3, Math.max(0, attempts - 1))))
  } else if (attempts <= 15) {
    return Math.min(4000, 2000 + (attempts - 5) * 200)
  } else {
    return 5000
  }
}

export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
    )
  }
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError'))
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export async function fetchWithManagedTimeoutCore(
  requester: (url: string, opts: any) => Promise<any>,
  fetchUrl: string,
  fetchOptions: any,
  connectTimeoutMs: number = 20000
): Promise<ManagedFetchHandle> {
  const timeoutCtrl = new AbortController()
  let timedOut = false
  let timer: NodeJS.Timeout | null = setTimeout(() => {
    timedOut = true
    timeoutCtrl.abort(new Error(`连接超时 (${connectTimeoutMs}ms 未响应)`))
  }, connectTimeoutMs)

  const parentSignal: AbortSignal | undefined = fetchOptions?.signal
  const onParentAbort = () => {
    timeoutCtrl.abort(parentSignal?.reason || new DOMException('User aborted download', 'AbortError'))
  }
  if (parentSignal) {
    if (parentSignal.aborted) {
      if (timer) clearTimeout(timer)
      throw new DOMException('User aborted download', 'AbortError')
    }
    parentSignal.addEventListener('abort', onParentAbort, { once: true })
  }

  const cleanup = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (parentSignal) {
      parentSignal.removeEventListener('abort', onParentAbort)
    }
  }

  const resetIdleTimeout = (idleMs: number = 25000) => {
    if (timer) clearTimeout(timer)
    if (timeoutCtrl.signal.aborted) return
    timer = setTimeout(() => {
      timedOut = true
      timeoutCtrl.abort(new Error(`流读取超时 (${idleMs}ms 无数据响应)`))
    }, idleMs)
  }

  try {
    const res = await requester(
      fetchUrl,
      {
        ...fetchOptions,
        signal: timeoutCtrl.signal as any
      }
    )
    // 收到响应头后暂清连接超时器，但保持 parentSignal 监听与 resetIdleTimeout 能力直至流消费完毕
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    return {
      response: res,
      signal: timeoutCtrl.signal,
      isTimedOut: () => timedOut,
      resetIdleTimeout,
      cleanup
    }
  } catch (err: any) {
    cleanup()
    if (timedOut && (!parentSignal || !parentSignal.aborted)) {
      throw new Error(`连接超时 (${connectTimeoutMs}ms 未响应)`)
    }
    throw err
  }
}

/**
 * 带连接超时、流读取空闲超时与父级 AbortSignal 全程联动的无缓存网络请求封装
 */
export async function fetchWithManagedTimeout(
  fetchUrl: string,
  fetchOptions: any,
  connectTimeoutMs: number = 20000
): Promise<ManagedFetchHandle> {
  return fetchWithManagedTimeoutCore(
    (u, opts) => fetchWithRedirectGuard(u, opts),
    fetchUrl,
    fetchOptions,
    connectTimeoutMs
  )
}

export async function readResponseBufferWithIdleTimeout(
  res: any,
  handle: ManagedFetchHandle,
  idleMs: number,
  signal?: AbortSignal
): Promise<Buffer> {
  if (!res.body || typeof res.body.getReader !== 'function') {
    handle.resetIdleTimeout(idleMs)
    try {
      const ab = await res.arrayBuffer()
      return Buffer.from(ab)
    } catch (err: any) {
      if (handle.isTimedOut() && !signal?.aborted) {
        throw new Error(`流读取超时 (${idleMs}ms 无数据响应)`)
      }
      throw err
    }
  }

  const reader = res.body.getReader()
  const chunks: Buffer[] = []
  handle.resetIdleTimeout(idleMs)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      handle.resetIdleTimeout(idleMs)
      if (signal?.aborted) {
        try { await reader.cancel() } catch {}
        throw new DOMException('User aborted download', 'AbortError')
      }
      if (value && value.byteLength > 0) {
        chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength))
      }
    }
    if (handle.isTimedOut() && !signal?.aborted) {
      throw new Error(`流读取超时 (${idleMs}ms 无数据响应)`)
    }
    return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)
  } catch (err: any) {
    try { await reader.cancel() } catch {}
    if (handle.isTimedOut() && !signal?.aborted) {
      throw new Error(`流读取超时 (${idleMs}ms 无数据响应)`)
    }
    throw err
  }
}

export function extractHttpStatusCode(err: any): number | null {
  if (typeof err?.httpStatus === 'number') {
    return err.httpStatus
  }
  const msg = err?.message || String(err || '')
  const match = msg.match(/\bHTTP\s+(\d{3})\b/i)
  return match ? parseInt(match[1], 10) : null
}

export const DIAG_RESPONSE_HEADER_WHITELIST = [
  'server',
  'content-type',
  'content-length',
  'cf-ray',
  'cf-mitigated',
  'x-cache',
  'via',
  'www-authenticate',
  'retry-after',
  'location',
  'x-amz-error-code',
  'x-oss-ec',
  'x-cos-trace-id',
  'x-request-id'
]

export function sanitizeUrlDiagnostic(rawUrl: string): UrlDiagInfo {
  const fingerprint = crypto.createHash('sha1').update(String(rawUrl || '')).digest('hex').slice(0, 8)
  try {
    const u = new URL(rawUrl)
    const host = (u.hostname || '').toLowerCase()
    const parts = u.pathname.split('/').filter(Boolean)
    const pathTail = parts.length === 0 ? '/' : parts.slice(-2).join('/')
    const lastPart = parts[parts.length - 1] || ''
    const dotIdx = lastPart.lastIndexOf('.')
    const ext = dotIdx > 0 ? lastPart.slice(dotIdx).toLowerCase() : 'none'
    const keySet = new Set<string>()
    u.searchParams.forEach((_v, k) => {
      if (k) keySet.add(k)
    })
    return {
      host: host || 'unknown',
      ext,
      pathTail,
      queryKeys: Array.from(keySet),
      fingerprint
    }
  } catch {
    return {
      host: 'invalid',
      ext: 'none',
      pathTail: '',
      queryKeys: [],
      fingerprint
    }
  }
}

export function extractDiagnosticResponseHeaders(headers: any): string {
  if (!headers || typeof headers.get !== 'function') return ''
  const pairs: string[] = []
  for (let i = 0; i < DIAG_RESPONSE_HEADER_WHITELIST.length; i++) {
    const key = DIAG_RESPONSE_HEADER_WHITELIST[i]
    try {
      const val = headers.get(key)
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        const clean = String(val).replace(/[\r\n]+/g, ' ').trim()
        pairs.push(`${key}=${clean.length > 100 ? clean.slice(0, 100) + '...' : clean}`)
      }
    } catch {}
  }
  return pairs.join(', ')
}

export function buildRequestHeaderSummary(reqHeaders: Record<string, string>): string {
  const ref = getHeaderCaseInsensitive(reqHeaders, 'Referer')
  const origin = getHeaderCaseInsensitive(reqHeaders, 'Origin')
  const cookie = getHeaderCaseInsensitive(reqHeaders, 'Cookie')
  const cookieCount = cookie
    ? cookie.split(';').map(s => s.trim()).filter(Boolean).length
    : 0
  const safeKeys = Object.keys(reqHeaders).filter(Boolean)
  return `refererHost=${ref ? parseUrlHost(ref) || 'set' : 'none'}, originHost=${origin ? parseUrlHost(origin) || 'set' : 'none'}, cookieCount=${cookieCount}, keys=[${safeKeys.join(',')}]`
}

export async function readErrorBodySnippet(res: any, maxBytes = 512, timeoutMs = 1500): Promise<string> {
  if (!res) return ''
  const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase()
  if (/^(video|audio|image)\//i.test(contentType) || contentType.includes('application/octet-stream')) {
    try { await res.body?.cancel?.() } catch {}
    return ''
  }

  const formatSnippet = (buf: Buffer): string => {
    const clean = buf
      .toString('utf8')
      .replace(/[\x00-\x1f\x7f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/"/g, "'")
      .trim()
    return clean.length > 240 ? clean.slice(0, 240) + '...' : clean
  }

  if (!res.body || typeof res.body.getReader !== 'function') {
    let timer: NodeJS.Timeout | null = null
    try {
      const text = await Promise.race<string>([
        res.text(),
        new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve(''), timeoutMs)
        })
      ])
      return formatSnippet(Buffer.from(String(text || ''), 'utf8').subarray(0, maxBytes))
    } catch {
      return ''
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  const reader = res.body.getReader()
  const chunks: Buffer[] = []
  let collected = 0
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try { void reader.cancel() } catch {}
  }, timeoutMs)

  try {
    while (collected < maxBytes && !timedOut) {
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.byteLength > 0) {
        const remaining = maxBytes - collected
        const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value
        chunks.push(Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength))
        collected += slice.byteLength
      }
    }
  } catch {
    // 忽略诊断体读取中断，返回已采集片段
  } finally {
    clearTimeout(timer)
    try { await reader.cancel() } catch {}
  }

  if (chunks.length === 0) return ''
  return formatSnippet(chunks.length === 1 ? chunks[0] : Buffer.concat(chunks))
}

export async function createHttpResponseError(
  res: any,
  phase: 'playlist' | 'segment' | 'key',
  readBody: boolean,
  prefixMessage?: string
): Promise<Error> {
  const resHeaders = extractDiagnosticResponseHeaders(res?.headers)
  const bodySnippet = readBody ? await readErrorBodySnippet(res, 512, 1500) : ''
  if (!readBody) {
    try { await res?.body?.cancel?.() } catch {}
  }
  const err: any = new Error(prefixMessage || `HTTP ${res?.status ?? 'unknown'}`)
  err.httpStatus = res?.status
  err.diag = {
    phase,
    status: res?.status || 0,
    resHeaders,
    bodySnippet,
    fetchMeta: (res as any)?.__veloraFetchMeta
  } satisfies HttpErrorDiag
  return err
}
