import http from 'http'
import https from 'https'
import zlib from 'zlib'
import { panAccountManager } from '../pan/accountManager'

// 对齐 YunX-Desktop HttpClients.kt：纯 HTTP/1.1 连接池，解除 Chromium 单域名 6 Socket 上限与 HTTP/2 单连接限速合并
export const downloadHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 64,
  maxFreeSockets: 16,
  scheduling: 'lifo'
})

export const downloadHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 64,
  maxFreeSockets: 16,
  scheduling: 'lifo',
  ALPNProtocols: ['http/1.1']
})

export function computeOptimalChunkSize(totalBytes: number, concurrency = 16): number {
  if (totalBytes <= 0) return 2 * 1024 * 1024
  const minChunk = 512 * 1024 // 512KB
  const idealByConcurrency = Math.floor(totalBytes / Math.max(concurrency * 4, 32))
  const minForMaxChunks = Math.ceil(totalBytes / 512)
  const rawSize = Math.max(minChunk, minForMaxChunks, Math.min(idealByConcurrency, 2 * 1024 * 1024))
  const step = 256 * 1024
  return Math.ceil(rawSize / step) * step
}

export function computeOptimalConcurrency(urlStr: string, referer?: string): number {
  const lowerUrl = (urlStr || '').toLowerCase()
  const lowerRef = (referer || '').toLowerCase()
  if (
    lowerRef.includes('quark') ||
    lowerUrl.includes('quark') ||
    lowerUrl.includes('clouddrive') ||
    lowerUrl.includes('file.alyp') ||
    lowerUrl.includes('alyp.cn') ||
    lowerRef.includes('uc.cn') ||
    lowerUrl.includes('uc.cn')
  ) {
    return 32
  }
  if (lowerRef.includes('baidu') || lowerUrl.includes('baidu') || lowerUrl.includes('baidupcs')) {
    return 24
  }
  if (
    lowerRef.includes('xunlei') ||
    lowerUrl.includes('xunlei') ||
    lowerUrl.includes('sandai.net')
  ) {
    return 8
  }
  return 16
}

export const LANZOU_HOST_RE = /^([a-z0-9-]+\.)*(lanzou[a-z]?\.com|woozooo\.com|baidupan\.com)$/i

export function parseUrlHost(rawUrl?: string): string {
  if (!rawUrl) return ''
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function hostMatches(host: string, suffixes: string[]): boolean {
  if (!host) return false
  return suffixes.some((s) => host === s || host.endsWith('.' + s))
}

export function isLanzouHost(host: string): boolean {
  return Boolean(host && LANZOU_HOST_RE.test(host))
}

export function getRegistrableRoot(host: string): string {
  if (!host) return ''
  const clean = host.toLowerCase().replace(/\.+$/, '')
  const parts = clean.split('.').filter(Boolean)
  if (parts.length <= 2) return clean
  const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  if (['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'co.uk', 'com.hk'].includes(lastTwo) && parts.length >= 3) {
    return `${parts[parts.length - 3]}.${lastTwo}`
  }
  return lastTwo
}

export function isTrustedCrossDomainRedirect(prevHost: string, nextHost: string): boolean {
  if (!prevHost || !nextHost) return false
  const prevRoot = getRegistrableRoot(prevHost)
  const nextRoot = getRegistrableRoot(nextHost)
  if (prevRoot === nextRoot) return true
  const quarkUcSet = new Set(['quark.cn', 'uc.cn', 'alyp.cn', 'aliyuncs.com', 'alicdn.com', 'sm.cn'])
  if (quarkUcSet.has(prevRoot) && quarkUcSet.has(nextRoot)) return true
  const baiduSet = new Set(['baidu.com', 'baidupcs.com', 'bdimg.com', 'bcebos.com'])
  if (baiduSet.has(prevRoot) && baiduSet.has(nextRoot)) return true
  const p115Set = new Set(['115.com', '115cdn.com', '115cdn.net', '115rc.com', 'anxia.com'])
  if (p115Set.has(prevRoot) && p115Set.has(nextRoot)) return true
  if (isLanzouHost(prevHost) && isLanzouHost(nextHost)) return true
  return false
}

export function sanitizeHeaderValue(value: string): string {
  if (!value) return value
  let allAscii = true
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) {
      allAscii = false
      break
    }
  }
  if (allAscii) return value
  let out = ''
  for (const ch of value) {
    const cp = ch.codePointAt(0)!
    if (cp >= 0x20 && cp <= 0x7e) {
      out += ch
    } else {
      const bytes = Buffer.from(ch, 'utf8')
      for (let i = 0; i < bytes.length; i++) {
        out += '%' + bytes[i].toString(16).toUpperCase().padStart(2, '0')
      }
    }
  }
  return out
}

export function sanitizeOutboundHeaders(headers: Record<string, string> | undefined, stripCredentials: boolean): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || v === null || v === '') continue
    if (/[\r\n\x00-\x1f\x7f]/.test(k)) continue
    const lower = k.toLowerCase()
    if (lower === 'x-velora-client-id' || lower === 'x-velora-referer') continue
    if (stripCredentials && (lower === 'cookie' || lower === 'authorization' || lower === 'host' || lower === 'content-length')) continue
    out[k] = sanitizeHeaderValue(String(v))
  }
  return out
}

export function hasHeaderCaseInsensitive(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase()
  return Object.keys(headers).some((k) => k.toLowerCase() === target && Boolean(headers[k]))
}

export function getHeaderCaseInsensitive(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined
  const target = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target && v !== undefined && v !== null && v !== '') {
      return String(v)
    }
  }
  return undefined
}

export function deleteHeaderCaseInsensitive(headers: Record<string, string> | undefined, name: string): void {
  if (!headers) return
  const target = name.toLowerCase()
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) {
      delete headers[k]
    }
  }
}

export function mergeCookieHeaders(baseCookie: string | undefined, extraCookie: string | undefined): string | undefined {
  const cookieMap = new Map<string, string>()
  const applyRaw = (raw?: string) => {
    if (!raw) return
    for (const part of raw.split(';')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx <= 0) {
        cookieMap.set(trimmed, trimmed)
      } else {
        const name = trimmed.slice(0, eqIdx).trim()
        cookieMap.set(name, trimmed)
      }
    }
  }
  applyRaw(baseCookie)
  applyRaw(extraCookie)
  if (cookieMap.size === 0) return undefined
  return Array.from(cookieMap.values()).join('; ')
}

export function createNodeFetchResponse(
  req: http.ClientRequest,
  rawRes: http.IncomingMessage,
  signal?: AbortSignal
): any {
  const status = rawRes.statusCode || 0
  const statusText = rawRes.statusMessage || ''
  const encoding = String(rawRes.headers['content-encoding'] || '').toLowerCase().trim()

  let sourceStream: NodeJS.ReadableStream = rawRes
  if (encoding === 'gzip' || encoding === 'x-gzip') {
    const gunzip = zlib.createGunzip()
    rawRes.pipe(gunzip)
    rawRes.on('error', (err) => gunzip.destroy(err))
    sourceStream = gunzip
  } else if (encoding === 'deflate') {
    const inflate = zlib.createInflate()
    rawRes.pipe(inflate)
    rawRes.on('error', (err) => inflate.destroy(err))
    sourceStream = inflate
  } else if (encoding === 'br') {
    const brotli = zlib.createBrotliDecompress()
    rawRes.pipe(brotli)
    rawRes.on('error', (err) => brotli.destroy(err))
    sourceStream = brotli
  }

  const chunkQueue: Buffer[] = []
  let queuedBytes = 0
  const HIGH_WATER_BYTES = 512 * 1024
  let ended = false
  let cancelled = false
  let streamError: Error | null = null
  let pendingRead: {
    resolve: (res: { done: boolean; value?: Uint8Array }) => void
    reject: (err: any) => void
  } | null = null

  const detachAbort = () => {
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }

  const failStream = (err: Error) => {
    if (ended || cancelled || streamError) return
    streamError = err
    detachAbort()
    if (pendingRead) {
      const p = pendingRead
      pendingRead = null
      p.reject(err)
    }
  }

  const onAbort = () => {
    const reason = signal?.reason
    const abortErr = reason instanceof Error ? reason : new DOMException('User aborted download', 'AbortError')
    failStream(abortErr)
    try { req.destroy(abortErr) } catch {}
  }

  if (signal) {
    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  if (typeof (sourceStream as any).pause === 'function') {
    try { (sourceStream as any).pause() } catch {}
  }

  sourceStream.on('data', (raw: Buffer | string) => {
    if (cancelled || streamError) return
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    if (buf.length === 0) return

    if (pendingRead) {
      const p = pendingRead
      pendingRead = null
      p.resolve({
        done: false,
        value: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      })
      return
    }

    chunkQueue.push(buf)
    queuedBytes += buf.length
    if (queuedBytes >= HIGH_WATER_BYTES && typeof (sourceStream as any).pause === 'function') {
      try { (sourceStream as any).pause() } catch {}
    }
  })

  sourceStream.on('end', () => {
    if (cancelled) return
    ended = true
    detachAbort()
    if (pendingRead) {
      const p = pendingRead
      pendingRead = null
      p.resolve({ done: true, value: undefined })
    }
  })

  sourceStream.on('error', (err: any) => {
    failStream(err instanceof Error ? err : new Error(String(err)))
  })

  rawRes.on('aborted', () => {
    failStream(new Error('premature close'))
  })

  rawRes.on('close', () => {
    if (!rawRes.complete) {
      failStream(new Error('premature close'))
    }
  })

  req.on('error', (err: any) => {
    failStream(err instanceof Error ? err : new Error(String(err)))
  })

  const cancelBody = async () => {
    if (cancelled) return
    cancelled = true
    detachAbort()
    chunkQueue.length = 0
    queuedBytes = 0
    if (pendingRead) {
      const p = pendingRead
      pendingRead = null
      p.resolve({ done: true, value: undefined })
    }
    if (!ended) {
      try { (sourceStream as any).destroy?.() } catch {}
      if (rawRes !== sourceStream) {
        try { rawRes.destroy() } catch {}
      }
      try { req.destroy() } catch {}
    }
  }

  const bodyObj = {
    cancel: cancelBody,
    getReader: () => ({
      read: (): Promise<{ done: boolean; value?: Uint8Array }> => {
        if (chunkQueue.length > 0) {
          const buf = chunkQueue.shift()!
          queuedBytes = Math.max(0, queuedBytes - buf.length)
          if (queuedBytes < HIGH_WATER_BYTES && !ended && !cancelled && !streamError) {
            if (typeof (sourceStream as any).resume === 'function') {
              try { (sourceStream as any).resume() } catch {}
            }
          }
          return Promise.resolve({
            done: false,
            value: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
          })
        }
        if (streamError) {
          return Promise.reject(streamError)
        }
        if (ended || cancelled) {
          return Promise.resolve({ done: true, value: undefined })
        }
        return new Promise<{ done: boolean; value?: Uint8Array }>((resolve, reject) => {
          pendingRead = { resolve, reject }
          if (typeof (sourceStream as any).resume === 'function') {
            try { (sourceStream as any).resume() } catch {}
          }
        })
      },
      cancel: cancelBody
    })
  }

  const readAllBuffer = async (): Promise<ArrayBuffer> => {
    const reader = bodyObj.getReader()
    const parts: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.byteLength > 0) {
        parts.push(value)
        total += value.byteLength
      }
    }
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) {
      out.set(p, offset)
      offset += p.byteLength
    }
    return out.buffer
  }

  const headersObj = {
    get: (name: string): string | null => {
      const val = rawRes.headers[name.toLowerCase()]
      if (val === undefined) return null
      return Array.isArray(val) ? val.join(', ') : String(val)
    }
  }

  return {
    status,
    statusText,
    ok: status >= 200 && status < 300,
    headers: headersObj,
    body: bodyObj,
    arrayBuffer: readAllBuffer,
    text: async () => {
      const ab = await readAllBuffer()
      return Buffer.from(ab).toString('utf8')
    }
  }
}

export async function executeNodeHttpHop(
  urlStr: string,
  options: { method?: string; headers?: Record<string, string>; body?: any; signal?: AbortSignal }
): Promise<any> {
  const signal = options.signal
  if (signal?.aborted) {
    const reason = signal.reason
    throw reason instanceof Error ? reason : new DOMException('User aborted download', 'AbortError')
  }

  const parsed = new URL(urlStr)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`不支持的请求协议: ${parsed.protocol}`)
  }

  const method = (options.method || 'GET').toUpperCase()
  const reqHeaders: Record<string, string> = { ...(options.headers || {}) }
  if (!hasHeaderCaseInsensitive(reqHeaders, 'accept-encoding')) {
    reqHeaders['Accept-Encoding'] = hasHeaderCaseInsensitive(reqHeaders, 'range')
      ? 'identity'
      : 'gzip, deflate, br'
  }

  let bodyBuf: Buffer | undefined
  if (options.body !== undefined && options.body !== null) {
    if (Buffer.isBuffer(options.body)) {
      bodyBuf = options.body
    } else if (options.body instanceof Uint8Array) {
      bodyBuf = Buffer.from(options.body.buffer, options.body.byteOffset, options.body.byteLength)
    } else {
      bodyBuf = Buffer.from(String(options.body), 'utf8')
    }
    if (!hasHeaderCaseInsensitive(reqHeaders, 'content-length')) {
      reqHeaders['Content-Length'] = String(bodyBuf.length)
    }
  }

  return new Promise((resolve, reject) => {
    let responded = false
    const isHttps = parsed.protocol === 'https:'
    const transport = isHttps ? https : http

    const onPreAbort = () => {
      if (responded) return
      const reason = signal?.reason
      const abortErr = reason instanceof Error ? reason : new DOMException('User aborted download', 'AbortError')
      responded = true
      try { req.destroy(abortErr) } catch {}
      reject(abortErr)
    }

    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname.replace(/^\[|\]$/g, ''),
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: reqHeaders,
        agent: isHttps ? downloadHttpsAgent : downloadHttpAgent
      },
      (res) => {
        if (responded) {
          res.resume()
          return
        }
        responded = true
        if (signal) {
          signal.removeEventListener('abort', onPreAbort)
        }
        resolve(createNodeFetchResponse(req, res, signal))
      }
    )

    if (signal) {
      signal.addEventListener('abort', onPreAbort, { once: true })
    }

    req.on('error', (err) => {
      if (responded) return
      responded = true
      if (signal) {
        signal.removeEventListener('abort', onPreAbort)
      }
      reject(err)
    })

    if (bodyBuf !== undefined) {
      req.write(bodyBuf)
    }
    req.end()
  })
}

/**
 * 基于 Node HTTP/1.1 Keep-Alive 连接池执行支持手动重定向守卫的网络请求：
 * - 始终剥离 X-Velora-Client-Id / X-Velora-Referer 内部头
 * - 手动追踪重定向，跨非信任域跳转自动剥离 Cookie / Authorization 凭据
 */
export async function fetchWithRedirectGuard(
  fetchUrl: string,
  fetchOptions: any,
  _targetSession?: any,
  maxHops = 6
): Promise<any> {
  let currentUrl = fetchUrl
  let currentHeaders = sanitizeOutboundHeaders(fetchOptions?.headers, false)
  let currentMethod = (fetchOptions?.method || 'GET').toUpperCase()
  let currentBody = fetchOptions?.body
  const signal = fetchOptions?.signal

  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await executeNodeHttpHop(currentUrl, {
      method: currentMethod,
      headers: currentHeaders,
      body: currentBody,
      signal
    })

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location')
      if (!loc) return res
      try { await res.body?.cancel?.() } catch {}
      const resolved = new URL(loc, currentUrl)
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        throw new Error(`不支持的重定向协议: ${resolved.protocol}`)
      }
      const prevHost = parseUrlHost(currentUrl)
      const nextHost = resolved.hostname.toLowerCase()
      const trusted = isTrustedCrossDomainRedirect(prevHost, nextHost)
      if (!trusted) {
        currentHeaders = sanitizeOutboundHeaders(currentHeaders, true)
      }
      if ([301, 302, 303].includes(res.status) && currentMethod !== 'GET' && currentMethod !== 'HEAD') {
        currentMethod = 'GET'
        currentBody = undefined
        delete currentHeaders['Content-Length']
        delete currentHeaders['content-length']
      }
      currentUrl = resolved.toString()
      continue
    }
    return res
  }

  throw new Error('下载直链重定向次数过多')
}

export function getHeadersForUrl(
  _urlStr: string,
  customReferer?: string,
  _customOrigin?: string,
  clientId?: string,
  options?: { allowPanCookies?: boolean; panType?: string }
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }

  if (clientId) {
    headers['X-Velora-Client-Id'] = clientId
  }
  if (customReferer) {
    headers['X-Velora-Referer'] = customReferer
    headers['Referer'] = customReferer
  }

  const host = parseUrlHost(_urlStr)
  const refHost = parseUrlHost(customReferer)
  const allowPanCookies = Boolean(options?.allowPanCookies)
  const pType = options?.panType

  // 针对网盘直链优先匹配明确 panType，其次按解析后的主机名后缀匹配，禁止仅凭 URL query 子串注入账号 Cookie
  if (pType === 'quark' || (!pType && hostMatches(host, ['quark.cn', 'clouddrive.quark.cn', 'alyp.cn']))) {
    headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.12-a038f7b798 Safari/537.36 Channel/pckk_other_ch'
    headers['Referer'] = 'https://pan.quark.cn/'
    headers['X-Velora-Referer'] = 'https://pan.quark.cn/'
    if (
      (allowPanCookies && (pType === 'quark' || hostMatches(host, ['quark.cn']))) ||
      (hostMatches(host, ['pds.quark.cn', 'clouddrive.quark.cn']) && hostMatches(refHost, ['pan.quark.cn']))
    ) {
      try {
        const cookieHeader = panAccountManager.getCookieHeader('quark')
        if (cookieHeader) {
          headers['Cookie'] = cookieHeader
        }
      } catch {}
    }
  } else if (pType === 'uc' || (!pType && hostMatches(host, ['uc.cn']))) {
    headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/1.6.1 Chrome/100.0.4896.160 Electron/18.3.5.16-b62cf9c50d Safari/537.36 Channel/ucpan_other_ch'
    headers['Referer'] = 'https://drive.uc.cn/'
    headers['Origin'] = 'https://drive.uc.cn'
    headers['X-Velora-Referer'] = 'https://drive.uc.cn/'
    if (
      allowPanCookies ||
      (hostMatches(host, ['pds.uc.cn', 'uc.cn']) && hostMatches(refHost, ['drive.uc.cn']))
    ) {
      try {
        const cookieHeader = panAccountManager.getCookieHeader('uc')
        if (cookieHeader) {
          headers['Cookie'] = cookieHeader
        }
      } catch {}
    }
  } else if (pType === 'baidu' || (!pType && hostMatches(host, ['baidu.com', 'baidupcs.com']))) {
    headers['User-Agent'] =
      'netdisk;12.24.6;piano;android-android;16;JSbridge4.4.0;jointBridge;1.1.0'
    if (allowPanCookies) {
      try {
        const cookieHeader = panAccountManager.getCookieHeader('baidu')
        if (cookieHeader) {
          headers['Cookie'] = cookieHeader
        }
      } catch {}
    }
  } else if (
    pType === '123pan' ||
    (!pType &&
      (hostMatches(host, ['123pan.com', '123pan.cn', '123684.com', '123865.com', '123912.com']) ||
        hostMatches(refHost, ['123pan.cn', '123pan.com'])))
  ) {
    headers['Referer'] = 'https://yun.123pan.cn/'
    headers['X-Velora-Referer'] = 'https://yun.123pan.cn/'
  } else if (pType === 'lanzou' || (!pType && (isLanzouHost(host) || isLanzouHost(refHost)))) {
    headers['Cookie'] = 'down_ip=1'
    headers['Accept-Language'] = 'zh-CN,zh;q=0.9'
  } else if (
    pType === 'xunlei' ||
    (!pType && (hostMatches(host, ['xunlei.com', 'sandai.net']) || hostMatches(refHost, ['pan.xunlei.com'])))
  ) {
    headers['User-Agent'] =
      'ANDROID-com.xunlei.downloadprovider/8.31.0.9726 netWorkType/5G appid/40 deviceName/Xiaomi_M2004j7ac deviceModel/M2004J7AC OSVersion/12 protocolVersion/301 platformVersion/10 sdkVersion/512000 Oauth2Client/0.9 (Linux 4_14_186-perf-gddfs8vbb238b) (JAVA 0)'
  } else if (
    pType === '115' ||
    (!pType &&
      (hostMatches(host, ['115.com', '115cdn.com', '115cdn.net', 'anxia.com', '115rc.com']) ||
        hostMatches(refHost, ['115.com'])))
  ) {
    headers['Referer'] = 'https://115.com/'
    headers['X-Velora-Referer'] = 'https://115.com/'
    headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 115disk/30.1.0'
  } else if (
    pType === '139' ||
    (!pType && (hostMatches(host, ['139.com', 'mcloud.139.com']) || hostMatches(refHost, ['yun.139.com', '139.com'])))
  ) {
    headers['Referer'] = 'https://yun.139.com/'
    headers['X-Velora-Referer'] = 'https://yun.139.com/'
  } else if (
    pType === 'guangya' ||
    (!pType && (hostMatches(host, ['guangyapan.com']) || hostMatches(refHost, ['guangyapan.com'])))
  ) {
    headers['Referer'] = 'https://www.guangyapan.com/'
    headers['X-Velora-Referer'] = 'https://www.guangyapan.com/'
  } else if (
    pType === 'ilanzou' ||
    (!pType &&
      (hostMatches(host, ['ilanzou.com', 'ilanzou.cn', 'ilanzou.net']) ||
        hostMatches(refHost, ['ilanzou.com', 'ilanzou.cn'])))
  ) {
    headers['Referer'] = 'https://www.ilanzou.com/'
    headers['X-Velora-Referer'] = 'https://www.ilanzou.com/'
  }

  return headers
}
