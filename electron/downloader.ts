import http from 'http'
import https from 'https'
import zlib from 'zlib'
import fs from 'fs'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { session as electronSession } from 'electron'

import path from 'path'
import { storeManager } from './store'
import { logger } from './logger'
import { ensureSafeTargetSavePath } from './utils/fileSystem'
import {
  getAvailableEncoders,
  getEncoderArgs,
  VideoEncoder,
  isGpuEncoder,
  getFfmpegThrottleConfig,
  FfmpegThrottleConfig,
  VideoThrottleScope
} from './gpuAccelerator'
import { panService } from './pan/service'
import { panAccountManager } from './pan/accountManager'

export interface PanDownloadContext {
  panType: string
  mode: 'drive' | 'share'
  fid: string
  fidToken?: string
  pwdId?: string
  stoken?: string
  cleanupDirFid?: string
  extra?: Record<string, any>
}

export interface DownloadCommand {
  id: string
  url: string
  savePath: string
  startBytes: number
  downloadedSegments?: number
  totalSegments?: number
  referer?: string
  origin?: string
  headers?: Record<string, string>
  totalBytes?: number
  panContext?: PanDownloadContext
  enqueuedAt?: number
}

// 对齐 YunX-Desktop HttpClients.kt：纯 HTTP/1.1 连接池，解除 Chromium 单域名 6 Socket 上限与 HTTP/2 单连接限速合并
const downloadHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 64,
  maxFreeSockets: 16,
  scheduling: 'lifo'
})

const downloadHttpsAgent = new https.Agent({
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

const LANZOU_HOST_RE = /^([a-z0-9-]+\.)*(lanzou[a-z]?\.com|woozooo\.com|baidupan\.com)$/i

function parseUrlHost(rawUrl?: string): string {
  if (!rawUrl) return ''
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function hostMatches(host: string, suffixes: string[]): boolean {
  if (!host) return false
  return suffixes.some((s) => host === s || host.endsWith('.' + s))
}

function isLanzouHost(host: string): boolean {
  return Boolean(host && LANZOU_HOST_RE.test(host))
}

function getRegistrableRoot(host: string): string {
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

function isTrustedCrossDomainRedirect(prevHost: string, nextHost: string): boolean {
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

function sanitizeHeaderValue(value: string): string {
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

function sanitizeOutboundHeaders(headers: Record<string, string> | undefined, stripCredentials: boolean): Record<string, string> {
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

function hasHeaderCaseInsensitive(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase()
  return Object.keys(headers).some((k) => k.toLowerCase() === target && Boolean(headers[k]))
}

function getHeaderCaseInsensitive(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined
  const target = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target && v !== undefined && v !== null && v !== '') {
      return String(v)
    }
  }
  return undefined
}

function deleteHeaderCaseInsensitive(headers: Record<string, string> | undefined, name: string): void {
  if (!headers) return
  const target = name.toLowerCase()
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) {
      delete headers[k]
    }
  }
}

function mergeCookieHeaders(baseCookie: string | undefined, extraCookie: string | undefined): string | undefined {
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

function createNodeFetchResponse(
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

async function executeNodeHttpHop(
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

export interface M3U8Segment {
  index: number
  url: string
  duration: number
  key?: { method: string, url: string, iv?: string }
}

export interface M3U8ParseResult {
  segments: M3U8Segment[]
  isFmp4: boolean
}

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

interface ManagedFetchHandle {
  response: any
  signal: AbortSignal
  isTimedOut: () => boolean
  resetIdleTimeout: (ms?: number) => void
  cleanup: () => void
}

const M3U8_SESSION_POOL_SIZE = 12
const M3U8_INTERNAL_REFERER_HEADER = 'X-Velora-M3U8-Referer'
const M3U8_INTERNAL_ORIGIN_HEADER = 'X-Velora-M3U8-Origin'
const M3U8_INTERNAL_COOKIE_HEADER = 'X-Velora-M3U8-Cookie'
const M3U8_INTERNAL_UA_HEADER = 'X-Velora-M3U8-UA'
let m3u8Sessions: Electron.Session[] | null = null

/**
 * 惰性创建 M3U8 专用无缓存 Electron Session 池（分散 HTTP/2 单连接队头阻塞并保留系统代理/TLS 指纹）
 */
function getM3U8Session(sessionIndex = 0): Electron.Session | null {
  if (!electronSession || typeof electronSession.fromPartition !== 'function') {
    return null
  }
  if (!m3u8Sessions) {
    const pool: Electron.Session[] = []
    for (let i = 0; i < M3U8_SESSION_POOL_SIZE; i++) {
      const sess = electronSession.fromPartition(`velora-m3u8-pool-${i}`, { cache: false })
      sess.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
        const reqHeaders = details.requestHeaders || {}
        const internalReferer = getHeaderCaseInsensitive(reqHeaders, M3U8_INTERNAL_REFERER_HEADER)
        const internalOrigin = getHeaderCaseInsensitive(reqHeaders, M3U8_INTERNAL_ORIGIN_HEADER)
        const internalCookie = getHeaderCaseInsensitive(reqHeaders, M3U8_INTERNAL_COOKIE_HEADER)
        const internalUa = getHeaderCaseInsensitive(reqHeaders, M3U8_INTERNAL_UA_HEADER)

        deleteHeaderCaseInsensitive(reqHeaders, M3U8_INTERNAL_REFERER_HEADER)
        deleteHeaderCaseInsensitive(reqHeaders, M3U8_INTERNAL_ORIGIN_HEADER)
        deleteHeaderCaseInsensitive(reqHeaders, M3U8_INTERNAL_COOKIE_HEADER)
        deleteHeaderCaseInsensitive(reqHeaders, M3U8_INTERNAL_UA_HEADER)
        deleteHeaderCaseInsensitive(reqHeaders, 'X-Velora-Client-Id')
        deleteHeaderCaseInsensitive(reqHeaders, 'X-Velora-Referer')

        if (internalReferer) {
          deleteHeaderCaseInsensitive(reqHeaders, 'Referer')
          reqHeaders['Referer'] = internalReferer
        }
        if (internalOrigin) {
          deleteHeaderCaseInsensitive(reqHeaders, 'Origin')
          reqHeaders['Origin'] = internalOrigin
        }
        if (internalUa) {
          deleteHeaderCaseInsensitive(reqHeaders, 'User-Agent')
          reqHeaders['User-Agent'] = internalUa
        }
        if (internalCookie) {
          const existingCookie = getHeaderCaseInsensitive(reqHeaders, 'Cookie')
          const mergedCookie = mergeCookieHeaders(existingCookie, internalCookie)
          deleteHeaderCaseInsensitive(reqHeaders, 'Cookie')
          if (mergedCookie) {
            reqHeaders['Cookie'] = mergedCookie
          }
        }

        callback({ requestHeaders: reqHeaders })
      })
      pool.push(sess)
    }
    m3u8Sessions = pool
  }
  const idx = ((sessionIndex % m3u8Sessions.length) + m3u8Sessions.length) % m3u8Sessions.length
  return m3u8Sessions[idx]
}

async function fetchWithM3U8Session(
  fetchUrl: string,
  fetchOptions: any,
  sessionIndex = 0,
  maxHops = 6
): Promise<any> {
  const sess = getM3U8Session(sessionIndex)
  if (!sess) {
    return fetchWithRedirectGuard(fetchUrl, fetchOptions, undefined, maxHops)
  }

  let currentUrl = fetchUrl
  let currentHeaders = sanitizeOutboundHeaders(fetchOptions?.headers, false)
  const fallbackReferer = getHeaderCaseInsensitive(fetchOptions?.headers, 'X-Velora-Referer')
  if (fallbackReferer && !getHeaderCaseInsensitive(currentHeaders, 'Referer')) {
    currentHeaders['Referer'] = fallbackReferer
  }
  let currentMethod = (fetchOptions?.method || 'GET').toUpperCase()
  let currentBody = fetchOptions?.body
  const signal = fetchOptions?.signal

  for (let hop = 0; hop <= maxHops; hop++) {
    if (signal?.aborted) {
      const reason = signal.reason
      throw reason instanceof Error ? reason : new DOMException('User aborted download', 'AbortError')
    }

    const wireHeaders: Record<string, string> = { ...currentHeaders }
    const refererVal = getHeaderCaseInsensitive(wireHeaders, 'Referer')
    const originVal = getHeaderCaseInsensitive(wireHeaders, 'Origin')
    const cookieVal = getHeaderCaseInsensitive(wireHeaders, 'Cookie')
    const uaVal = getHeaderCaseInsensitive(wireHeaders, 'User-Agent')

    deleteHeaderCaseInsensitive(wireHeaders, 'Referer')
    deleteHeaderCaseInsensitive(wireHeaders, 'Origin')
    deleteHeaderCaseInsensitive(wireHeaders, 'Cookie')
    deleteHeaderCaseInsensitive(wireHeaders, 'User-Agent')

    if (refererVal) wireHeaders[M3U8_INTERNAL_REFERER_HEADER] = refererVal
    if (originVal) wireHeaders[M3U8_INTERNAL_ORIGIN_HEADER] = originVal
    if (cookieVal) wireHeaders[M3U8_INTERNAL_COOKIE_HEADER] = cookieVal
    if (uaVal) wireHeaders[M3U8_INTERNAL_UA_HEADER] = uaVal

    const reqInit: RequestInit = {
      method: currentMethod,
      headers: wireHeaders,
      signal,
      redirect: 'manual'
    }
    if (currentMethod !== 'GET' && currentMethod !== 'HEAD' && currentBody !== undefined && currentBody !== null) {
      reqInit.body = currentBody
    }

    const res = await sess.fetch(currentUrl, reqInit)

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
        deleteHeaderCaseInsensitive(currentHeaders, 'Content-Length')
      }
      currentUrl = resolved.toString()
      continue
    }

    return res
  }

  throw new Error('下载直链重定向次数过多')
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
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

async function fetchWithManagedTimeoutCore(
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
async function fetchWithManagedTimeout(
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

/**
 * 基于 M3U8 多 Session 连接池、带连接与流空闲超时的网络请求封装
 */
async function fetchM3U8WithManagedTimeout(
  fetchUrl: string,
  fetchOptions: any,
  connectTimeoutMs: number = 15000,
  sessionIndex: number = 0
): Promise<ManagedFetchHandle> {
  return fetchWithManagedTimeoutCore(
    (u, opts) => fetchWithM3U8Session(u, opts, sessionIndex),
    fetchUrl,
    fetchOptions,
    connectTimeoutMs
  )
}

async function readResponseBufferWithIdleTimeout(
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

/**
 * 智能解析 M3U8 Playlist (自动处理 Master Playlist 与相对路径，识别 fMP4/m4s 切片)
 */
async function parseM3U8(
  playlistUrl: string,
  originHeaders: any,
  signal?: AbortSignal,
  sessionIndex: number = 0
): Promise<M3U8ParseResult> {
  const handle = await fetchM3U8WithManagedTimeout(
    playlistUrl,
    { headers: originHeaders, signal },
    15000,
    sessionIndex
  )
  let text = ''
  try {
    if (!handle.response.ok) {
      try { await handle.response.body?.cancel?.() } catch {}
      throw new Error(`无法获取 M3U8 播放列表: HTTP ${handle.response.status}`)
    }
    const buf = await readResponseBufferWithIdleTimeout(handle.response, handle, 15000, signal)
    text = buf.toString('utf8')
  } finally {
    handle.cleanup()
  }
  
  if (!text.includes('#EXTM3U')) {
    throw new Error('无效的 M3U8 播放列表文本文件')
  }

  // 处理 Master Playlist 嵌套
  if (text.includes('#EXT-X-STREAM-INF')) {
    const lines = text.split('\n')
    let highestBandwidth = -1
    let bestSubPlaylistUrl = ''
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const nextLine = lines[i + 1]?.trim()
        if (nextLine && !nextLine.startsWith('#')) {
          let bandwidth = 0
          const bwMatch = line.match(/BANDWIDTH=(\d+)/)
          if (bwMatch) {
            bandwidth = parseInt(bwMatch[1], 10)
          }
          
          if (bandwidth > highestBandwidth) {
            highestBandwidth = bandwidth
            bestSubPlaylistUrl = resolveUrl(playlistUrl, nextLine)
          }
        }
      }
    }
    if (bestSubPlaylistUrl) {
      logger.info('Downloader', `[M3U8Parser] 发现 Master Playlist，已自动选择最高清晰度 (Bandwidth: ${highestBandwidth}) 转向二级子列表: ${bestSubPlaylistUrl}`)
      return parseM3U8(bestSubPlaylistUrl, originHeaders, signal, sessionIndex)
    }
  }

  // 解析分片
  const lines = text.split('\n')
  const segments: M3U8Segment[] = []
  let currentDuration = 0
  let index = 0
  let currentKey: { method: string, url: string, iv?: string } | undefined = undefined
  let isFmp4 = false

  if (text.includes('#EXT-X-MAP:')) {
    isFmp4 = true
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    if (line.startsWith('#EXT-X-KEY:')) {
      const methodMatch = line.match(/METHOD=([^,]+)/)
      const method = methodMatch ? methodMatch[1] : 'NONE'
      if (method === 'NONE') {
        currentKey = undefined
      } else {
        const uriMatch = line.match(/URI="([^"]+)"/)
        const ivMatch = line.match(/IV=([^,]+)/)
        if (uriMatch) {
          currentKey = {
            method,
            url: resolveUrl(playlistUrl, uriMatch[1]),
            iv: ivMatch ? ivMatch[1] : undefined
          }
        }
      }
    } else if (line.startsWith('#EXT-X-MAP:')) {
      isFmp4 = true
      const uriMatch = line.match(/URI="([^"]+)"/)
      if (uriMatch) {
        segments.push({
          index: index++,
          url: resolveUrl(playlistUrl, uriMatch[1]),
          duration: 0,
          key: currentKey
        })
      }
    } else if (line.startsWith('#EXTINF:')) {
      const durMatch = line.match(/#EXTINF:([\d\.]+)/)
      if (durMatch) {
        currentDuration = parseFloat(durMatch[1])
      }
    } else if (line && !line.startsWith('#')) {
      const segUrl = resolveUrl(playlistUrl, line)
      const segLower = segUrl.toLowerCase()
      if (segLower.includes('.m4s') || segLower.includes('.mp4')) {
        isFmp4 = true
      }
      segments.push({
        index: index++,
        url: segUrl,
        duration: currentDuration,
        key: currentKey
      })
    }
  }

  return { segments, isFmp4 }
}

function resolveUrl(baseUrl: string, relativeOrAbsolute: string): string {
  if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
    return relativeOrAbsolute
  }
  try {
    return new URL(relativeOrAbsolute, baseUrl).href
  } catch {
    const urlObj = new URL(baseUrl)
    const basePath = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1)
    if (relativeOrAbsolute.startsWith('/')) {
      return `${urlObj.origin}${relativeOrAbsolute}`
    } else {
      return `${urlObj.origin}${basePath}${relativeOrAbsolute}`
    }
  }
}

/**
 * 安全原子文件替换 (带备份与占用重试机制)
 * 1. 验证临时文件有效性
 * 2. 将目标原文件安全重命名为临时备份 .orig_bak_timestamp
 * 3. 将新临时文件重命名为目标文件（支持多次重试及跨卷/锁定时 copy+unlink 兜底）
 * 4. 成功后删除备份；若失败则立即从备份还原原文件，绝不丢失任何一方
 */
async function safeAtomicReplace(sourceTempPath: string, targetFinalPath: string): Promise<boolean> {
  if (!fs.existsSync(sourceTempPath)) {
    logger.error('Downloader', `[SafeReplace] 临时文件不存在: ${sourceTempPath}`)
    return false
  }
  const sourceSize = fs.statSync(sourceTempPath).size
  if (sourceSize <= 0) {
    logger.error('Downloader', `[SafeReplace] 临时文件为空: ${sourceTempPath}`)
    return false
  }

  const dir = path.dirname(targetFinalPath)
  const parsed = path.parse(targetFinalPath)
  const backupPath = path.join(dir, `${parsed.name}.orig_bak_${Date.now()}${parsed.ext}`)

  const retryOperation = async (op: () => void, maxAttempts = 8, baseDelay = 150): Promise<boolean> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        op()
        return true
      } catch (err: any) {
        if (attempt === maxAttempts) {
          logger.warn('Downloader', `[SafeReplace] 操作失败 (${attempt}/${maxAttempts}): ${err.message}`)
          return false
        }
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(1.3, attempt - 1)))
      }
    }
    return false
  }

  let hasBackup = false
  if (fs.existsSync(targetFinalPath)) {
    // 步骤 1: 将原文件移至备份
    const backupOk = await retryOperation(() => {
      if (fs.existsSync(backupPath)) {
        try { fs.unlinkSync(backupPath) } catch {}
      }
      fs.renameSync(targetFinalPath, backupPath)
    })

    if (!backupOk) {
      logger.error('Downloader', `[SafeReplace] 无法备份原文件，原文件可能正被其他程序或播放器占用锁定: ${targetFinalPath}`)
      return false
    }
    hasBackup = true
  }

  // 步骤 2: 将新临时文件移入目标路径
  const replaceOk = await retryOperation(() => {
    if (fs.existsSync(targetFinalPath)) {
      try { fs.unlinkSync(targetFinalPath) } catch {}
    }
    fs.renameSync(sourceTempPath, targetFinalPath)
  })

  if (replaceOk) {
    // 步骤 3: 替换成功，删除备份文件
    if (hasBackup && fs.existsSync(backupPath)) {
      await retryOperation(() => {
        fs.unlinkSync(backupPath)
      })
    }
    logger.info('Downloader', `[SafeReplace] 文件安全替换成功: ${targetFinalPath}`)
    return true
  } else {
    // 步骤 4: 替换失败，尝试 copy 兜底
    let copyFallbackOk = false
    try {
      logger.warn('Downloader', `[SafeReplace] 重命名失败，尝试 copyFileSync 兜底写入: ${targetFinalPath}`)
      fs.copyFileSync(sourceTempPath, targetFinalPath)
      try { fs.unlinkSync(sourceTempPath) } catch {}
      copyFallbackOk = true
    } catch (copyErr: any) {
      logger.error('Downloader', `[SafeReplace] copyFileSync 兜底写入失败: ${copyErr.message}`)
      copyFallbackOk = false
    }

    if (copyFallbackOk) {
      if (hasBackup && fs.existsSync(backupPath)) {
        try { fs.unlinkSync(backupPath) } catch {}
      }
      return true
    }

    // 步骤 5: 无法替换，从备份紧急还原原始文件
    logger.error('Downloader', `[SafeReplace] 临时文件写入目标失败，正在从备份还原原文件: ${targetFinalPath}`)
    if (hasBackup && fs.existsSync(backupPath)) {
      const restoreOk = await retryOperation(() => {
        if (fs.existsSync(targetFinalPath)) {
          try { fs.unlinkSync(targetFinalPath) } catch {}
        }
        fs.renameSync(backupPath, targetFinalPath)
      })
      if (!restoreOk) {
        // 如果 rename 还原失败，用 copy 强制还原
        try {
          fs.copyFileSync(backupPath, targetFinalPath)
          try { fs.unlinkSync(backupPath) } catch {}
        } catch (resErr: any) {
          logger.error('Downloader', `[SafeReplace] 严重错误：无法自动还原备份文件 ${backupPath}: ${resErr.message}`)
        }
      }
    }
    return false
  }
}

interface CompressQueueItem {
  taskId: string
  filePath: string
  targetBitrateKbps: number
  scope: VideoThrottleScope
  totalSegments?: number
  resolve?: (res: { success: boolean; newSize?: number; error?: string; skipped?: boolean }) => void
  reject?: (err: any) => void
}

async function writeBufferFully(
  handle: fs.promises.FileHandle,
  buf: Buffer,
  position: number | null = null
): Promise<void> {
  let offset = 0
  let currentPos = position
  while (offset < buf.length) {
    const { bytesWritten } = await handle.write(buf, offset, buf.length - offset, currentPos)
    if (bytesWritten <= 0) {
      throw new Error('磁盘写入失败 (0 字节写入)')
    }
    offset += bytesWritten
    if (currentPos !== null) {
      currentPos += bytesWritten
    }
  }
}

export interface TaskStats {
  downloadingCount: number;
  queuedCount: number;
  compressingCount: number;
  speed: number;
  speedText: string;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0 || isNaN(bytesPerSec)) return '0 B/s';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

class Downloader {
  private activeDownloads: Map<string, { abortController: AbortController; cmd: DownloadCommand; donePromise?: Promise<void>; tempPaths?: string[] }> = new Map()
  private startingIds: Set<string> = new Set()
  private pendingQueue: DownloadCommand[] = []

  hasUnfinishedTempDirRef(panType: string, cleanupDirFid: string, excludeTaskId?: string): boolean {
    if (!panType || !cleanupDirFid) return false
    let found = false
    this.activeDownloads.forEach((entry, id) => {
      if (id === excludeTaskId || entry.abortController.signal.aborted) return
      const ctx = entry.cmd?.panContext
      if (ctx && ctx.panType === panType && ctx.cleanupDirFid === cleanupDirFid) {
        found = true
      }
    })
    if (found) return true
    return this.pendingQueue.some((c) => {
      if (c.id === excludeTaskId) return false
      return c.panContext?.panType === panType && c.panContext?.cleanupDirFid === cleanupDirFid
    })
  }
  private isCompressingActive = false
  private compressQueue: CompressQueueItem[] = []
  private activeCompressTaskId: string | null = null
  private activeCompressController: AbortController | null = null
  private activeCompressTempPath: string | null = null
  private mainWindow: any = null
  private taskSpeedMap: Map<string, { speed: number; lastTime: number }> = new Map()
  private onStatsChangeCallback?: () => void

  setOnStatsChange(callback: () => void) {
    this.onStatsChangeCallback = callback
  }

  getTaskStats(): TaskStats {
    const downloadingCount = this.activeDownloads.size
    const queuedCount = this.pendingQueue.length
    const compressingCount = (this.activeCompressTaskId ? 1 : 0) + this.compressQueue.length

    let totalSpeed = 0
    const now = Date.now()

    if (downloadingCount === 0) {
      this.taskSpeedMap.clear()
    } else {
      const toDelete: string[] = []
      this.taskSpeedMap.forEach((record, id) => {
        if (!this.activeDownloads.has(id) || now - record.lastTime > 4000) {
          toDelete.push(id)
        } else {
          totalSpeed += record.speed
        }
      })
      toDelete.forEach(id => this.taskSpeedMap.delete(id))
    }

    return {
      downloadingCount,
      queuedCount,
      compressingCount,
      speed: Math.round(totalSpeed),
      speedText: formatSpeed(totalSpeed)
    }
  }

  pauseAll() {
    logger.info('Downloader', `[Downloader] 执行 pauseAll: 暂停所有活跃、排队与压缩任务`)
    const queuedIds = this.pendingQueue.map(c => c.id)
    for (const id of queuedIds) {
      this.pauseDownload(id)
    }
    const compQueueIds = this.compressQueue.map(c => c.taskId)
    for (const id of compQueueIds) {
      this.pauseDownload(id)
    }
    if (this.activeCompressTaskId) {
      this.pauseDownload(this.activeCompressTaskId)
    }
    const activeIds: string[] = []
    this.activeDownloads.forEach((_, id) => {
      activeIds.push(id)
    })
    for (const id of activeIds) {
      this.pauseDownload(id)
    }
    this.taskSpeedMap.clear()
    this.onStatsChangeCallback?.()
  }

  setWindow(window: any) {
    this.mainWindow = window
    logger.info('Downloader', `[Downloader] MainWindow 已成功绑定和初始化。`)
  }

  async startDownload(cmd: DownloadCommand) {
    cmd.savePath = ensureSafeTargetSavePath(cmd.savePath)
    logger.info('Downloader', `[Downloader] startDownload ID: ${cmd.id}, URL: ${cmd.url}, savePath: ${cmd.savePath}, startBytes: ${cmd.startBytes}`)

    if (this.startingIds.has(cmd.id)) {
      logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 正在调度中，跳过重复添加。`)
      return
    }

    if (this.activeCompressTaskId === cmd.id || this.compressQueue.some(c => c.taskId === cmd.id)) {
      logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 已在压缩队列或压缩中，跳过重复添加。`)
      return
    }

    // 同步原子占位，防止微任务期间重入触发重复调度
    this.startingIds.add(cmd.id)
    try {
      const existingActive = this.activeDownloads.get(cmd.id)
      if (existingActive) {
        if (existingActive.abortController.signal.aborted && existingActive.donePromise) {
          logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 正在释放文件句柄，等待就绪后继续...`)
          await existingActive.donePromise.catch(() => {})
        } else {
          logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 已在下载中，跳过重复添加。`)
          return
        }
      }

      if (
        this.activeDownloads.has(cmd.id) ||
        this.pendingQueue.some(c => c.id === cmd.id)
      ) {
        logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 已在队列或下载中，跳过重复添加。`)
        return
      }

      if (!cmd.enqueuedAt) {
        cmd.enqueuedAt = Date.now()
      }

      let maxConcurrent = 3
      try {
        maxConcurrent = (await storeManager.getSetting('maxConcurrentDownloads')) || 3
      } catch {
        maxConcurrent = 3
      }

      if (this.activeDownloads.size < maxConcurrent) {
        this.runTask(cmd)
      } else {
        this.pendingQueue.push(cmd)
        this.sendProgress({
          id: cmd.id,
          totalBytes: cmd.totalBytes || 0,
          receivedBytes: cmd.startBytes || 0,
          status: 'waiting',
          speed: 0
        })
      }
    } finally {
      this.startingIds.delete(cmd.id)
    }
  }

  private buildTaskHeaders(cmd: DownloadCommand, targetUrl?: string): Record<string, string> {
    const resolvedUrl = targetUrl || cmd.url
    const baseHeaders = getHeadersForUrl(resolvedUrl, cmd.referer, cmd.origin, undefined, {
      allowPanCookies: Boolean(cmd.panContext),
      panType: cmd.panContext?.panType
    })
    const cachedPanHeaders = resolvedUrl ? panService.getCachedHeadersForUrl(resolvedUrl) : undefined
    const merged: Record<string, string> = {}
    const assignNonEmpty = (src?: Record<string, string>) => {
      if (!src) return
      for (const [k, v] of Object.entries(src)) {
        if (v !== undefined && v !== null && v !== '') {
          merged[k] = v
        }
      }
    }
    assignNonEmpty(baseHeaders)
    assignNonEmpty(cmd.headers)
    assignNonEmpty(cachedPanHeaders)
    return merged
  }

  private async refreshCommandPanLink(cmd: DownloadCommand, forceSession = false): Promise<boolean> {
    if (!cmd.panContext) return false
    const ctx = cmd.panContext
    try {
      if (forceSession) {
        panService.invalidatePanSession(ctx.panType as any)
      }
      if (ctx.mode === 'share') {
        const res = await panService.getShareDownloadUrls(ctx.panType as any, [
          {
            fid: ctx.fid,
            fidToken: ctx.fidToken,
            pwdId: ctx.pwdId,
            stoken: ctx.stoken,
            extra: ctx.extra
          }
        ])
        const link = res.links?.[ctx.fid]
        const nextUrl = link?.url || res.urls?.[ctx.fid]
        if (nextUrl) {
          if (link?.cleanupDirFid && link.cleanupDirFid !== ctx.cleanupDirFid) {
            const oldDirFid = ctx.cleanupDirFid
            ctx.cleanupDirFid = link.cleanupDirFid
            this.sendProgress({ id: cmd.id, cleanupDirFid: link.cleanupDirFid })
            if (oldDirFid && !this.hasUnfinishedTempDirRef(ctx.panType, oldDirFid, cmd.id)) {
              panService.cleanupTempDir(ctx.panType as any, oldDirFid).catch(() => {})
            }
          }
          cmd.url = nextUrl
          if (link?.headers) {
            cmd.headers = { ...(cmd.headers || {}), ...link.headers }
          }
          cmd.enqueuedAt = Date.now()
          logger.info('Downloader', `[PanRefresh] 任务 ${cmd.id} 分享直链自动刷新成功`)
          return true
        }
      } else {
        const res = await panService.getDriveDownloadUrls(ctx.panType as any, [ctx.fid])
        const link = res.links?.[ctx.fid]
        const nextUrl = link?.url || res.urls?.[ctx.fid]
        if (nextUrl) {
          cmd.url = nextUrl
          if (link?.headers) {
            cmd.headers = { ...(cmd.headers || {}), ...link.headers }
          }
          cmd.enqueuedAt = Date.now()
          logger.info('Downloader', `[PanRefresh] 任务 ${cmd.id} 个人盘直链自动刷新成功`)
          return true
        }
      }
    } catch (err: any) {
      logger.warn('Downloader', `[PanRefresh] 任务 ${cmd.id} 自动重取直链失败: ${err.message}`)
    }
    return false
  }

  private sendProgress(payload: any) {
    if (payload?.id) {
      if (payload.status === 'downloading' && typeof payload.speed === 'number') {
        this.taskSpeedMap.set(payload.id, { speed: Math.max(0, payload.speed), lastTime: Date.now() })
      } else if (payload.status && ['completed', 'paused', 'error', 'failed'].includes(payload.status)) {
        this.taskSpeedMap.delete(payload.id)
      }
    }
    this.onStatsChangeCallback?.()
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('download-progress', payload)
    }
  }

  private async isM3U8UrlOrContent(url: string, headers: any, signal: AbortSignal, savePath?: string): Promise<boolean> {
    const lower = url.toLowerCase()
    if (lower.includes('.m3u8')) return true
    if (savePath) {
      const ext = path.extname(savePath).toLowerCase()
      const nonM3u8Exts = [
        '.zip', '.rar', '.7z', '.tar', '.gz', '.iso', '.exe', '.dmg', '.pkg', '.apk',
        '.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.webm',
        '.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a',
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'
      ]
      if (nonM3u8Exts.includes(ext)) {
        return false
      }
    }
    if (
      lower.includes('quark') ||
      lower.includes('clouddrive') ||
      lower.includes('file.alyp') ||
      lower.includes('uc.cn') ||
      lower.includes('baidupcs.com') ||
      lower.includes('123pan') ||
      lower.includes('123865') ||
      lower.includes('123684') ||
      lower.includes('123912') ||
      lower.includes('lanzou') ||
      lower.includes('115.com') ||
      lower.includes('115cdn') ||
      lower.includes('xunlei.com')
    ) {
      return false
    }

    let handle: ManagedFetchHandle | null = null
    try {
      handle = await fetchM3U8WithManagedTimeout(
        url,
        { headers: { ...headers, Range: 'bytes=0-512' }, signal },
        15000,
        0
      )
      const reader = handle.response?.body?.getReader?.()
      if (!reader) return false
      handle.resetIdleTimeout(10000)
      const { value } = await reader.read()
      try { await reader.cancel() } catch {}
      if (!value) return false
      const slice = value.byteLength > 1024 ? value.subarray(0, 1024) : value
      const text = new TextDecoder().decode(slice)
      return text.includes('#EXTM3U')
    } catch {
      return false
    } finally {
      handle?.cleanup()
    }
  }

  private runTask(cmd: DownloadCommand) {
    const abortController = new AbortController()
    const entry: { abortController: AbortController; cmd: DownloadCommand; donePromise?: Promise<void>; tempPaths?: string[] } = {
      abortController,
      cmd
    }
    this.activeDownloads.set(cmd.id, entry)
    const execPromise = this.executeTaskInternal(cmd, abortController)
    entry.donePromise = execPromise
    return execPromise
  }

  private async executeTaskInternal(cmd: DownloadCommand, abortController: AbortController) {
    this.sendProgress({ id: cmd.id, status: 'resolving', speed: 0 })

    let downloadResult: { filePath: string; fileSize: number; totalSegments?: number } | null = null

    try {
      // 若排队超 25 分钟，或重启恢复任务/当前进程缺少网盘鉴权头缓存时，先自动重取新鲜直链与最新凭据头
      if (cmd.panContext) {
        const hasCachedHeaders = panService.getCachedHeadersForUrl(cmd.url) !== undefined
        const queueExpired = Boolean(cmd.enqueuedAt && Date.now() - cmd.enqueuedAt > 25 * 60 * 1000)
        if (queueExpired || !hasCachedHeaders) {
          await this.refreshCommandPanLink(cmd, false)
        }
      }

      const headers = this.buildTaskHeaders(cmd)
      const isM3U8 = await this.isM3U8UrlOrContent(cmd.url, headers, abortController.signal, cmd.savePath)
      if (isM3U8) {
        downloadResult = await this.downloadM3U8Task(cmd, abortController)
      } else {
        downloadResult = await this.downloadDirectFileTask(cmd, abortController)
      }
    } catch (err: any) {
      logger.error('Downloader', `[Downloader] 任务 ${cmd.id} 执行异常: ${err.message}`)
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        const pausedPayload: any = { id: cmd.id, status: 'paused', speed: 0 }
        if (typeof err?.savedBytes === 'number') {
          pausedPayload.receivedBytes = err.savedBytes
        }
        if (typeof err?.downloadedSegments === 'number') {
          pausedPayload.downloadedSegments = err.downloadedSegments
        }
        this.sendProgress(pausedPayload)
      } else {
        this.sendProgress({ id: cmd.id, status: 'error', errorMsg: err.message, speed: 0 })
      }
      return
    } finally {
      this.activeDownloads.delete(cmd.id)
      this.checkQueue()
    }

    if (downloadResult) {
      await this.handlePostDownload(cmd.id, downloadResult.filePath, downloadResult.fileSize, downloadResult.totalSegments)
    }
  }

  /**
   * M3U8 断点续传、多分片并发下载、内存缓冲池 (Memory Buffer Flush) 顺序追加合并
   */
  private async downloadM3U8Task(cmd: DownloadCommand, abortController: AbortController): Promise<{ filePath: string; fileSize: number; totalSegments: number }> {
    const { id, url, savePath } = cmd

    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    let finalSavePath = savePath
    if (!finalSavePath.toLowerCase().endsWith('.mp4') && !finalSavePath.toLowerCase().endsWith('.mkv')) {
      if (finalSavePath.toLowerCase().endsWith('.m3u8') || finalSavePath.toLowerCase().endsWith('.ts')) {
        finalSavePath = finalSavePath.replace(/\.(m3u8|ts)$/i, '.mp4')
      } else {
        finalSavePath = finalSavePath + '.mp4'
      }
    }
    const isTargetMp4 = true
    const tempMp4Path = finalSavePath + '.temp.mp4'
    const tempTsPath = finalSavePath + '.temp.ts'

    // 1. 检查是否已有完整封装的目标文件（仅当记录的分片数已达到总分片数且有效封装时才跳过）
    if (fs.existsSync(finalSavePath) && !fs.existsSync(tempMp4Path) && !fs.existsSync(tempTsPath)) {
      try {
        const stat = fs.statSync(finalSavePath)
        const isSegmentsFullyRecorded = cmd.totalSegments && cmd.downloadedSegments && cmd.downloadedSegments >= cmd.totalSegments
        if (stat.size > 0 && isSegmentsFullyRecorded) {
          const info = await this.getVideoDurationAndBitrate(finalSavePath)
          if (info.duration > 0) {
            logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 目标文件已完整存在 (大小: ${stat.size}B, 时长: ${info.duration}s)，跳过下载`)
            return {
              filePath: finalSavePath,
              fileSize: stat.size,
              totalSegments: cmd.totalSegments
            }
          }
        }
      } catch (e: any) {
        logger.warn('Downloader', `[M3U8Downloader] 检查已存在目标文件异常: ${e.message}`)
      }
    }

    logger.info('Downloader', `[M3U8Downloader] 开始解析并下载 M3U8 资源: ${url}`)

    let maxMemoryMB = 128
    try {
      maxMemoryMB = (await storeManager.getSetting('maxMemoryBufferMB')) || 128
    } catch {
      maxMemoryMB = 128
    }
    const maxMemoryBytes = maxMemoryMB * 1024 * 1024

    const headers = this.buildTaskHeaders(cmd, url)

    let parseResult: M3U8ParseResult | null = null
    let parseAttempts = 0
    const maxParseTransientAttempts = 15
    while (!parseResult) {
      if (abortController.signal.aborted) {
        throw new DOMException('User aborted download', 'AbortError')
      }
      try {
        parseResult = await parseM3U8(url, headers, abortController.signal, parseAttempts)
      } catch (err: any) {
        if (abortController.signal.aborted && err?.name === 'AbortError') throw err
        if (abortController.signal.aborted) {
          throw new DOMException('User aborted download', 'AbortError')
        }
        if (isTransientNetworkError(err) || err?.name === 'AbortError') {
          parseAttempts++
          if (parseAttempts >= maxParseTransientAttempts) {
            throw new Error(`解析 M3U8 列表连续重试 ${maxParseTransientAttempts} 次仍失败: ${err.message}`)
          }
          const friendlyMsg = formatTransientErrorMessage(err)
          logger.warn('Downloader', `[M3U8Downloader] 解析 M3U8 列表遭遇网络波动，正在后台自动重试 (第 ${parseAttempts} 次): ${err.message}`)
          this.sendProgress({
            id,
            status: 'resolving',
            speed: 0,
            errorMsg: `正在重试: ${friendlyMsg}`
          })
          await sleepWithAbort(getTransientRetryDelay(parseAttempts, err), abortController.signal)
          continue
        }
        throw err
      }
    }

    const { segments, isFmp4 } = parseResult
    if (segments.length === 0) {
      throw new Error('M3U8 列表中未解析到任何可下载的分片视频')
    }
    logger.info('Downloader', `[M3U8Downloader] 成功解析出 ${segments.length} 个 ${isFmp4 ? 'fMP4/m4s' : 'TS'} 视频分片`)

    let workSavePath = isFmp4 ? tempMp4Path : tempTsPath
    if (!fs.existsSync(workSavePath) && fs.existsSync(tempTsPath)) {
      workSavePath = tempTsPath
    }

    // 2. 检查临时文件是否已全量就绪（必须满足分片数全量达到总分片数，严禁只凭临时文件大小判定就绪）
    if (fs.existsSync(workSavePath)) {
      try {
        const stat = fs.statSync(workSavePath)
        const isReadyForConvert = cmd.downloadedSegments !== undefined &&
          cmd.downloadedSegments > 0 &&
          (
            (cmd.totalSegments !== undefined && cmd.downloadedSegments >= cmd.totalSegments) ||
            (segments.length > 0 && cmd.downloadedSegments >= segments.length)
          ) &&
          stat.size > 0

        if (isReadyForConvert) {
          logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 临时文件已完整落盘 (${stat.size} 字节, ${cmd.downloadedSegments}/${cmd.totalSegments || cmd.downloadedSegments} 分片)，直接进入格式转换`)
          if (isTargetMp4) {
            await this.remuxToMp4(workSavePath, finalSavePath, isFmp4, abortController, id)
          }
          const targetVideoFile = isTargetMp4 ? finalSavePath : workSavePath
          const finalFileSize = fs.existsSync(targetVideoFile) ? fs.statSync(targetVideoFile).size : stat.size
          logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 格式转换完成。文件大小: ${finalFileSize}`)
          return {
            filePath: targetVideoFile,
            fileSize: finalFileSize,
            totalSegments: cmd.totalSegments || cmd.downloadedSegments
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError' || abortController.signal.aborted) {
          const savedBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : 0
          const pauseErr: any = Object.assign(new Error('User aborted download'), {
            name: 'AbortError',
            savedBytes,
            downloadedSegments: cmd.downloadedSegments
          })
          throw pauseErr
        }
        logger.warn('Downloader', `[M3U8Downloader] 检查临时文件转换就绪异常: ${e.message}，回退至正常解析流程`)
      }
    }

    // 检查断点续传：临时文件是否已存在及大小
    let existingBytes = 0
    let skipSegments = 0
    let fileFlags = 'w'

    if (fs.existsSync(workSavePath)) {
      try {
        const stat = fs.statSync(workSavePath)
        existingBytes = stat.size
        if (existingBytes > 0 && cmd.downloadedSegments !== undefined && cmd.downloadedSegments > 0) {
          if (cmd.downloadedSegments < segments.length) {
            skipSegments = cmd.downloadedSegments
            fileFlags = 'a'
            logger.info('Downloader', `[M3U8Downloader] 触发精准断点续传: 已落盘 ${existingBytes} 字节，跳过前 ${skipSegments}/${segments.length} 个分片`)
          } else {
            // 已记录分片已达总数且临时文件完整：跳过分片下载直接进入转封装
            skipSegments = segments.length
            fileFlags = 'a'
            logger.info('Downloader', `[M3U8Downloader] 分片已全量就绪 (${segments.length}/${segments.length})，直接进入转封装步骤`)
          }
        } else {
          skipSegments = 0
          existingBytes = 0
          fileFlags = 'w'
        }
      } catch (e: any) {
        logger.info('Downloader', `[M3U8Downloader] 检查续传状态失败: ${e.message}`)
        skipSegments = 0
        existingBytes = 0
        fileFlags = 'w'
      }
    }

    const fileHandle = await fs.promises.open(workSavePath, fileFlags)
    const keyCache = new Map<string, Buffer>()
    const keyPromiseCache = new Map<string, Promise<Buffer>>()
    const bufferMap = new Map<number, Buffer>()
    let currentBufferedBytes = 0
    let nextFlushIndex = skipSegments
    let flushedSegmentsCount = skipSegments
    let totalReceivedBytes = existingBytes
    let diskWriteError: Error | null = null
    let writeChain: Promise<void> = Promise.resolve()

    let lastReportTime = Date.now()
    let lastReportBytes = totalReceivedBytes
    let lastDataReceivedAt = Date.now()
    let smoothedSpeed = 0

    const enqueueSequentialFlush = (forceLog: boolean = false) => {
      const batchBuffers: Buffer[] = []
      let batchBytes = 0
      while (bufferMap.has(nextFlushIndex)) {
        const chunkBuf = bufferMap.get(nextFlushIndex)!
        batchBuffers.push(chunkBuf)
        batchBytes += chunkBuf.length
        bufferMap.delete(nextFlushIndex)
        nextFlushIndex++
      }

      if (batchBuffers.length === 0) return
      const batchCount = batchBuffers.length
      if (forceLog || currentBufferedBytes >= maxMemoryBytes) {
        logger.info('Downloader', `[MemoryBuffer] M3U8 内存缓冲异步顺序落盘 (${batchCount} 分片, ${(batchBytes / 1024 / 1024).toFixed(2)} MB)`)
      }

      writeChain = writeChain.then(async () => {
        if (diskWriteError) {
          currentBufferedBytes = Math.max(0, currentBufferedBytes - batchBytes)
          return
        }
        try {
          const combined = batchBuffers.length === 1 ? batchBuffers[0] : Buffer.concat(batchBuffers)
          await writeBufferFully(fileHandle, combined)
          flushedSegmentsCount += batchCount
        } catch (writeErr: any) {
          diskWriteError = writeErr
          abortController.abort(writeErr)
        } finally {
          currentBufferedBytes = Math.max(0, currentBufferedBytes - batchBytes)
        }
      })
    }

    const getAesKey = async (keyUrl: string, sessionIndex = 0): Promise<Buffer> => {
      const cached = keyCache.get(keyUrl)
      if (cached) return cached
      let pending = keyPromiseCache.get(keyUrl)
      if (!pending) {
        pending = (async () => {
          const handle = await fetchM3U8WithManagedTimeout(
            keyUrl,
            { headers, signal: abortController.signal as any },
            15000,
            sessionIndex
          )
          try {
            if (!handle.response.ok) {
              try { await handle.response.body?.cancel?.() } catch {}
              throw new Error(`Key fetch failed: ${keyUrl} (HTTP ${handle.response.status})`)
            }
            const buf = await readResponseBufferWithIdleTimeout(
              handle.response,
              handle,
              15000,
              abortController.signal
            )
            keyCache.set(keyUrl, buf)
            return buf
          } finally {
            handle.cleanup()
          }
        })().finally(() => {
          keyPromiseCache.delete(keyUrl)
        })
        keyPromiseCache.set(keyUrl, pending)
      }
      return pending
    }

    const reportStreamProgress = (force: boolean = false) => {
      const now = Date.now()
      if (!force && now - lastReportTime < 500 && nextFlushIndex < segments.length) {
        return
      }
      const dt = Math.max(1, now - lastReportTime)
      const deltaBytes = Math.max(0, totalReceivedBytes - lastReportBytes)
      const instSpeed = (deltaBytes / dt) * 1000
      smoothedSpeed = smoothedSpeed > 0 ? smoothedSpeed * 0.4 + instSpeed * 0.6 : instSpeed
      this.sendProgress({
        id,
        totalBytes: 0,
        receivedBytes: totalReceivedBytes,
        downloadedSegments: Math.max(flushedSegmentsCount, nextFlushIndex),
        totalSegments: segments.length,
        speed: smoothedSpeed,
        status: 'downloading',
        errorMsg: ''
      })
      lastReportTime = now
      lastReportBytes = totalReceivedBytes
    }

    const remainingSegments = Math.max(1, segments.length - skipSegments)
    const concurrency = Math.min(M3U8_SESSION_POOL_SIZE, remainingSegments)
    let segQueueIndex = skipSegments

    const fetchNextSegment = async (workerId: number): Promise<void> => {
      if (workerId > 0) {
        await sleepWithAbort(workerId * 50, abortController.signal)
      }

      while (segQueueIndex < segments.length) {
        if (abortController.signal.aborted) {
          throw new DOMException('User aborted download', 'AbortError')
        }

        // 背压控制：当缓冲及异步待写盘数据超过上限两倍时让出事件循环，防止慢分片导致内存激增
        while (currentBufferedBytes >= maxMemoryBytes * 2) {
          if (abortController.signal.aborted) {
            throw new DOMException('User aborted download', 'AbortError')
          }
          await sleepWithAbort(50, abortController.signal)
        }

        const seg = segments[segQueueIndex++]
        let attempts = 0
        let preemptCount = 0
        let success = false
        const maxAttempts = 5
        const maxTransientAttempts = 30

        while (!success) {
          if (abortController.signal.aborted) {
            throw new DOMException('User aborted download', 'AbortError')
          }

          let handle: ManagedFetchHandle | null = null
          let segReceivedBytes = 0
          let slowPreempted = false
          const rollbackSegBytes = () => {
            if (segReceivedBytes > 0) {
              totalReceivedBytes = Math.max(0, totalReceivedBytes - segReceivedBytes)
              segReceivedBytes = 0
            }
          }
          const sessionIdx = (workerId + attempts * 5 + preemptCount * 3) % M3U8_SESSION_POOL_SIZE

          try {
            handle = await fetchM3U8WithManagedTimeout(
              seg.url,
              { headers, signal: abortController.signal as any },
              15000,
              sessionIdx
            )
            const res = handle.response
            if (!res.ok) {
              try { await res.body?.cancel?.() } catch {}
              throw new Error(`HTTP ${res.status}`)
            }

            const rawLen = res.headers?.get?.('content-length')
            const contentEncoding = String(res.headers?.get?.('content-encoding') || '').toLowerCase().trim()
            const parsedLen = rawLen ? parseInt(rawLen, 10) : 0
            const expectedLen = parsedLen > 0 && (!contentEncoding || contentEncoding === 'identity') ? parsedLen : 0

            const chunks: Buffer[] = []
            if (res.body && typeof res.body.getReader === 'function') {
              const reader = res.body.getReader()
              handle.resetIdleTimeout(12000)
              const connStartTime = Date.now()
              let windowStartTime = connStartTime
              let windowBytes = 0

              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                handle.resetIdleTimeout(12000)
                if (abortController.signal.aborted) {
                  try { await reader.cancel() } catch {}
                  throw new DOMException('User aborted download', 'AbortError')
                }
                if (!value || value.byteLength === 0) continue

                const chunkBuf = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
                chunks.push(chunkBuf)
                segReceivedBytes += chunkBuf.length
                totalReceivedBytes += chunkBuf.length
                windowBytes += chunkBuf.length
                lastDataReceivedAt = Date.now()

                reportStreamProgress(false)

                // 慢连接抢占：每 4s 采样窗口速度，持续 >= 10s 且明显拖后腿时切换新 Session 重下
                const now = lastDataReceivedAt
                if (now - windowStartTime >= 4000) {
                  const winDt = Math.max(1, now - windowStartTime)
                  const windowBps = (windowBytes * 1000) / winDt
                  windowStartTime = now
                  windowBytes = 0

                  const remainingLargeOrUnknown = expectedLen <= 0 || expectedLen - segReceivedBytes > 256 * 1024
                  if (now - connStartTime >= 10000 && preemptCount < 3 && remainingLargeOrUnknown) {
                    const avgPerWorkerBps = smoothedSpeed > 0 ? smoothedSpeed / Math.max(1, concurrency) : 0
                    const floorBps = Math.max(16 * 1024, avgPerWorkerBps * 0.2)
                    if (windowBps < floorBps) {
                      preemptCount++
                      slowPreempted = true
                      logger.warn(
                        'Downloader',
                        `[M3U8Downloader] 分片 ${seg.index} 连接过慢 (${(windowBps / 1024).toFixed(1)} KB/s < 阈值 ${(floorBps / 1024).toFixed(1)} KB/s)，切换连接重试 (${preemptCount}/3)`
                      )
                      try { await reader.cancel() } catch {}
                      rollbackSegBytes()
                      break
                    }
                  }
                }
              }

              if (slowPreempted) {
                continue
              }

              if (handle.isTimedOut() && !abortController.signal.aborted) {
                throw new Error('流读取超时 (12000ms 无数据响应)')
              }
            } else {
              handle.resetIdleTimeout(12000)
              const ab = await res.arrayBuffer()
              const fallbackBuf = Buffer.from(ab)
              chunks.push(fallbackBuf)
              segReceivedBytes = fallbackBuf.length
              totalReceivedBytes += fallbackBuf.length
              lastDataReceivedAt = Date.now()
            }

            if (expectedLen > 0 && segReceivedBytes !== expectedLen) {
              throw new Error(`分片 ${seg.index} 数据不完整 (${segReceivedBytes}/${expectedLen} 字节)`)
            }

            let buf = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)

            if (seg.key && seg.key.method === 'AES-128') {
              const keyBuf = await getAesKey(seg.key.url, sessionIdx)
              let ivBuf: Buffer
              if (seg.key.iv) {
                let hex = seg.key.iv.startsWith('0x') || seg.key.iv.startsWith('0X') ? seg.key.iv.slice(2) : seg.key.iv
                hex = hex.padStart(32, '0')
                ivBuf = Buffer.from(hex, 'hex')
              } else {
                ivBuf = Buffer.alloc(16)
                ivBuf.writeUInt32BE(seg.index, 12)
              }
              try {
                const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, ivBuf)
                decipher.setAutoPadding(true)
                buf = Buffer.concat([decipher.update(buf), decipher.final()])
              } catch {
                const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, ivBuf)
                decipher.setAutoPadding(false)
                buf = Buffer.concat([decipher.update(buf), decipher.final()])
              }
            }

            bufferMap.set(seg.index, buf)
            currentBufferedBytes += buf.length

            if (
              bufferMap.has(nextFlushIndex) &&
              (currentBufferedBytes >= Math.min(maxMemoryBytes, 16 * 1024 * 1024) ||
                bufferMap.size >= 8 ||
                nextFlushIndex + bufferMap.size >= segments.length)
            ) {
              enqueueSequentialFlush(false)
            }

            reportStreamProgress(nextFlushIndex >= segments.length)
            success = true
          } catch (e: any) {
            rollbackSegBytes()
            if (abortController.signal.aborted) {
              throw e?.name === 'AbortError' ? e : new DOMException('User aborted download', 'AbortError')
            }
            const retryableErr =
              handle?.isTimedOut()
                ? new Error(e?.message || '流读取超时 (12000ms 无数据响应)')
                : e
            attempts++
            if (isTransientNetworkError(retryableErr) || retryableErr?.name === 'AbortError') {
              if (attempts >= maxTransientAttempts) {
                logger.error('Downloader', `[M3U8Downloader] 分片 ${seg.index} 连续重试 ${maxTransientAttempts} 次网络错误均无法恢复，终止任务: ${retryableErr.message}`)
                throw new Error(`分片 ${seg.index} 下载失败 (已重试 ${maxTransientAttempts} 次: ${retryableErr.message})`)
              }
              const friendlyMsg = formatTransientErrorMessage(retryableErr)
              logger.warn('Downloader', `[M3U8Downloader] 分片 ${seg.index} 遭遇网络波动，正在后台自动重试 (第 ${attempts} 次): ${retryableErr.message}`)
              const now = Date.now()
              const isGlobalStalled = now - lastDataReceivedAt > 3000
              if (attempts >= 3 || isGlobalStalled) {
                if (isGlobalStalled) {
                  smoothedSpeed = 0
                }
                this.sendProgress({
                  id,
                  totalBytes: 0,
                  receivedBytes: totalReceivedBytes,
                  downloadedSegments: flushedSegmentsCount,
                  totalSegments: segments.length,
                  speed: isGlobalStalled ? 0 : smoothedSpeed,
                  status: 'downloading',
                  errorMsg: `正在重试: ${friendlyMsg}`
                })
              }
              await sleepWithAbort(getTransientRetryDelay(attempts, retryableErr), abortController.signal)
            } else {
              if (attempts >= maxAttempts) {
                logger.error('Downloader', `[M3U8Downloader] 分片 ${seg.index} 连续重试 ${maxAttempts} 次均失败: ${retryableErr.message}`)
                throw new Error(`分片 ${seg.index} 下载失败 (${retryableErr.message})`)
              }
              await sleepWithAbort(getTransientRetryDelay(attempts, retryableErr), abortController.signal)
            }
          } finally {
            handle?.cleanup()
          }
        }
      }
    }

    const workers: Promise<void>[] = []
    for (let c = 0; c < concurrency; c++) {
      workers.push(fetchNextSegment(c))
    }

    try {
      await Promise.all(workers)
      enqueueSequentialFlush(true)
      await writeChain
      await fileHandle.close()

      if (diskWriteError) {
        throw diskWriteError
      }
      if (flushedSegmentsCount < segments.length) {
        throw new Error(`M3U8 分片未全部完成落盘: 仅写入 ${flushedSegmentsCount}/${segments.length} 分片`)
      }

      if (isTargetMp4) {
        await this.remuxToMp4(workSavePath, finalSavePath, isFmp4, abortController, id)
      }

      const targetVideoFile = isTargetMp4 ? finalSavePath : workSavePath
      const finalFileSize = fs.existsSync(targetVideoFile) ? fs.statSync(targetVideoFile).size : totalReceivedBytes

      logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 全部 ${segments.length} 个分片下载及封装完成。文件大小: ${finalFileSize}`)
      return {
        filePath: targetVideoFile,
        fileSize: finalFileSize,
        totalSegments: segments.length
      }
    } catch (err: any) {
      try {
        enqueueSequentialFlush(false)
        await writeChain.catch(() => {})
        await fileHandle.close()
      } catch {}
      if (diskWriteError) {
        throw diskWriteError
      }
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        const savedBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : totalReceivedBytes
        const pauseErr: any = Object.assign(new Error('User aborted download'), {
          name: 'AbortError',
          savedBytes,
          downloadedSegments: flushedSegmentsCount
        })
        throw pauseErr
      }
      throw err
    }
  }

  /**
   * 将分片合并落盘的视频无损转封装为标准 MP4 格式 (根据 fMP4 / TS 自动选择最佳参数，消费 stdout/stderr 避免管道死锁)
   */
  private async remuxToMp4(
    workSavePath: string,
    finalSavePath: string,
    isFmp4: boolean,
    abortController: AbortController,
    taskId: string
  ): Promise<void> {
    logger.info('Downloader', `[M3U8Downloader] 准备将临时 ${isFmp4 ? 'fMP4' : 'TS'} 封装为 MP4: ${workSavePath} -> ${finalSavePath}`)
    const totalBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : 0
    this.sendProgress({
      id: taskId,
      totalBytes,
      receivedBytes: totalBytes,
      status: 'converting',
      speed: 0
    })

    const runFfmpeg = (args: string[]): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const ffmpegBin = 'ffmpeg'
        const child = spawn(ffmpegBin, args)

        let stderrBuffer = ''
        child.stderr?.on('data', (chunk) => {
          stderrBuffer += chunk.toString()
          if (stderrBuffer.length > 5000) {
            stderrBuffer = stderrBuffer.substring(stderrBuffer.length - 5000)
          }
        })

        child.stdout?.on('data', () => {
          // 消费 stdout 避免管道挂起
        })

        child.on('close', (code) => {
          if (code === 0) {
            try { fs.unlinkSync(workSavePath) } catch {}
            resolve()
          } else {
            logger.warn('Downloader', `[M3U8Downloader] FFmpeg 封装失败 (code ${code}): ${stderrBuffer.slice(-300)}`)
            reject(new Error(`FFmpeg exited with code ${code}: ${stderrBuffer.slice(-200)}`))
          }
        })

        child.on('error', (err) => {
          logger.error('Downloader', `[M3U8Downloader] FFmpeg 启动异常: ${err.message}`)
          reject(err)
        })

        if (abortController.signal.aborted) {
          child.kill('SIGKILL')
          reject(new DOMException('User aborted download', 'AbortError'))
        } else {
          abortController.signal.addEventListener('abort', () => {
            child.kill('SIGKILL')
            reject(new DOMException('User aborted download', 'AbortError'))
          }, { once: true })
        }
      })
    }

    if (isFmp4) {
      // fMP4 流: 原生已经具备 ISO MP4 音频格式头，直接 -c copy 转封装，严禁添加 -bsf:a aac_adtstoasc
      await runFfmpeg([
        '-y',
        '-i', workSavePath,
        '-c', 'copy',
        '-movflags', '+faststart',
        finalSavePath
      ])
    } else {
      // MPEG-TS 流: 优先尝试 -bsf:a aac_adtstoasc 过滤，若失败则自适应回退到无滤镜 copy
      try {
        await runFfmpeg([
          '-y',
          '-i', workSavePath,
          '-c', 'copy',
          '-bsf:a', 'aac_adtstoasc',
          '-movflags', '+faststart',
          finalSavePath
        ])
      } catch (err: any) {
        if (abortController.signal.aborted) throw err
        logger.warn('Downloader', `[M3U8Downloader] TS 转封装带 aac_adtstoasc 失败，尝试回退无滤镜纯 copy 转封装: ${err.message}`)
        await runFfmpeg([
          '-y',
          '-i', workSavePath,
          '-c', 'copy',
          '-movflags', '+faststart',
          finalSavePath
        ])
      }
    }
  }

  /**
   * 通用视频 (MP4 / AVI 等) 的断点续传、HTTP Range 分块多线程加速与内存缓冲
   */
  private async downloadDirectFileTask(cmd: DownloadCommand, abortController: AbortController): Promise<{ filePath: string; fileSize: number }> {
    const { id, savePath, startBytes = 0 } = cmd
    const progressPath = savePath + '.velora'

    let savedChunkSize = 0
    let savedCompletedChunks: number[] = []
    if (fs.existsSync(progressPath)) {
      try {
        const progData = JSON.parse(fs.readFileSync(progressPath, 'utf8'))
        if (typeof progData.chunkSize === 'number' && progData.chunkSize > 0 && Array.isArray(progData.completed)) {
          savedChunkSize = progData.chunkSize
          savedCompletedChunks = progData.completed
        }
      } catch {}
    }

    let maxMemoryMB = 128
    try {
      maxMemoryMB = (await storeManager.getSetting('maxMemoryBufferMB')) || 128
    } catch {
      maxMemoryMB = 128
    }
    const maxMemoryBytes = maxMemoryMB * 1024 * 1024

    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    let activeUrl = cmd.url
    const buildHeaders = (targetUrl: string): Record<string, string> => this.buildTaskHeaders(cmd, targetUrl)
    let activeHeaders = buildHeaders(activeUrl)

    let panRefreshPromise: Promise<boolean> | null = null
    const ensurePanLinkRefreshed = async (forceSession = true): Promise<boolean> => {
      if (!cmd.panContext) return false
      if (!panRefreshPromise) {
        panRefreshPromise = this.refreshCommandPanLink(cmd, forceSession)
          .then((ok) => {
            if (ok) {
              activeUrl = cmd.url
              activeHeaders = buildHeaders(activeUrl)
            }
            return ok
          })
          .finally(() => {
            panRefreshPromise = null
          })
      }
      return panRefreshPromise
    }

    let isRangeSupported = false
    let totalBytes = cmd.totalBytes && cmd.totalBytes > 0 ? cmd.totalBytes : 0
    let initialFullResponseHandle: ManagedFetchHandle | null = null

    for (let probeAttempt = 0; probeAttempt < 2; probeAttempt++) {
      let probeHandle: ManagedFetchHandle | null = null
      let transferToStream = false
      try {
        probeHandle = await fetchWithManagedTimeout(
          activeUrl,
          { headers: { ...activeHeaders, Range: 'bytes=0-0' }, signal: abortController.signal as any },
          15000
        )
        const checkRes = probeHandle.response
        if (checkRes.status === 206) {
          isRangeSupported = true
          const cr = checkRes.headers.get('content-range')
          if (cr) {
            const match = cr.match(/\/(\d+)/)
            if (match && (!totalBytes || totalBytes === 0)) {
              totalBytes = parseInt(match[1], 10)
            }
          }
          try { await checkRes.body?.cancel?.() } catch {}
          break
        } else if (checkRes.status === 200) {
          isRangeSupported = false
          const cl = checkRes.headers.get('content-length')
          if (cl && totalBytes === 0) {
            totalBytes = parseInt(cl, 10)
          }
          initialFullResponseHandle = probeHandle
          transferToStream = true
          break
        } else if ((checkRes.status === 401 || checkRes.status === 403 || checkRes.status === 412) && cmd.panContext && probeAttempt === 0) {
          try { await checkRes.body?.cancel?.() } catch {}
          probeHandle.cleanup()
          probeHandle = null
          logger.warn('Downloader', `[DirectDownloader] 直链预检返回 HTTP ${checkRes.status} (host=${parseUrlHost(activeUrl)}, headers=${JSON.stringify(Object.keys(activeHeaders))})，尝试刷新会话并重取网盘直链...`)
          const refreshed = await ensurePanLinkRefreshed(true)
          if (refreshed) continue
          logger.error('Downloader', `[DirectDownloader] 直链预检失败: status=${checkRes.status}, host=${parseUrlHost(activeUrl)}, headers=${JSON.stringify(Object.keys(activeHeaders))}`)
          break
        } else {
          try { await checkRes.body?.cancel?.() } catch {}
          if (checkRes.status === 401 || checkRes.status === 403 || checkRes.status === 412) {
            logger.error('Downloader', `[DirectDownloader] 直链预检失败: status=${checkRes.status}, host=${parseUrlHost(activeUrl)}, headers=${JSON.stringify(Object.keys(activeHeaders))}`)
          }
          break
        }
      } catch (e: any) {
        if (abortController.signal.aborted) {
          throw e?.name === 'AbortError' ? e : new DOMException('User aborted download', 'AbortError')
        }
        logger.info('Downloader', `[DirectDownloader] Range 探测未响应: ${e.message}`)
        if (
          totalBytes > 0 &&
          (activeUrl.includes('quark') || activeUrl.includes('uc.cn') || (cmd.referer && (cmd.referer.includes('quark') || cmd.referer.includes('uc.cn'))))
        ) {
          isRangeSupported = true
        }
        break
      } finally {
        if (probeHandle && !transferToStream) {
          probeHandle.cleanup()
        }
      }
    }

    const cleanupInitialHandle = async () => {
      if (initialFullResponseHandle) {
        try { await initialFullResponseHandle.response?.body?.cancel?.() } catch {}
        initialFullResponseHandle.cleanup()
        initialFullResponseHandle = null
      }
    }

    if (fs.existsSync(savePath) && !fs.existsSync(progressPath) && totalBytes > 0) {
      try {
        const stat = fs.statSync(savePath)
        if (stat.size >= totalBytes) {
          await cleanupInitialHandle()
          logger.info('Downloader', `[DirectDownloader] 目标文件已完整存在 (${stat.size} >= ${totalBytes})，直接跳过下载`)
          return { filePath: savePath, fileSize: stat.size }
        }
      } catch {}
    }

    const targetConcurrency = computeOptimalConcurrency(activeUrl, cmd.referer)
    const chunkSize =
      savedChunkSize > 0 && savedCompletedChunks.length > 0
        ? savedChunkSize
        : computeOptimalChunkSize(totalBytes, targetConcurrency)
    const completedChunks = savedChunkSize > 0 && savedChunkSize === chunkSize ? savedCompletedChunks : []
    const totalChunksCount = totalBytes > 0 ? Math.ceil(totalBytes / chunkSize) : 0
    const validCompletedChunks = Array.from(new Set(completedChunks.filter(i => i >= 0 && i < totalChunksCount)))
    const completedChunkSet = new Set<number>(validCompletedChunks)

    const getChunkByteLength = (chunkIdx: number) => {
      const start = chunkIdx * chunkSize
      return Math.max(0, Math.min(chunkSize, totalBytes - start))
    }
    let totalReceivedBytes = validCompletedChunks.reduce((sum, idx) => sum + getChunkByteLength(idx), 0)

    if (isRangeSupported && totalBytes > 512 * 1024) {
      await cleanupInitialHandle()

      const chunks: Array<{ index: number; start: number; end: number }> = []
      for (let i = 0; i < totalChunksCount; i++) {
        if (completedChunkSet.has(i)) continue
        const start = i * chunkSize
        const end = Math.min(totalBytes - 1, start + chunkSize - 1)
        chunks.push({ index: i, start, end })
      }

      if (chunks.length === 0) {
        if (fs.existsSync(progressPath)) {
          try { await fs.promises.unlink(progressPath) } catch {}
        }
        const finalFileSize = fs.existsSync(savePath) ? fs.statSync(savePath).size : totalBytes
        return { filePath: savePath, fileSize: finalFileSize }
      }

      const concurrency = Math.min(targetConcurrency, chunks.length)
      logger.info(
        'Downloader',
        `[DirectDownloader] 支持 Range 断点续传 (${(chunkSize / 1024 / 1024).toFixed(2)}MB/块, 已完成 ${validCompletedChunks.length}/${totalChunksCount})，开启 ${concurrency} 并发加速下载`
      )

      const fileExists = fs.existsSync(savePath)
      if (fileExists) {
        try {
          const stats = fs.statSync(savePath)
          if (stats.size > totalBytes) {
            logger.info('Downloader', `[DirectDownloader] 续传旧文件过大，截断为 ${totalBytes}`)
            await fs.promises.truncate(savePath, totalBytes)
          }
        } catch {}
      }

      let fileHandle: fs.promises.FileHandle
      try {
        fileHandle = await fs.promises.open(savePath, fileExists ? 'r+' : 'w')
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          fileHandle = await fs.promises.open(savePath, 'w')
        } else {
          throw err
        }
      }

      let pendingDiskWriteBytes = 0
      let workerInFlightBytes = 0
      let downloadedChunksCount = validCompletedChunks.length
      let lastReportTime = Date.now()
      let lastReportBytes = totalReceivedBytes
      let lastProgressSaveTime = Date.now()
      let progressDirty = false
      let progressWritePromise: Promise<void> | null = null
      let diskWriteError: Error | null = null
      const activeWritePromises = new Set<Promise<void>>()

      const saveProgressFile = async (force = false): Promise<void> => {
        if (!progressDirty && !force) return
        const now = Date.now()
        if (!force && now - lastProgressSaveTime < 1000) return
        if (progressWritePromise && !force) return
        if (progressWritePromise && force) {
          await progressWritePromise.catch(() => {})
        }
        lastProgressSaveTime = now
        progressDirty = false
        const snapshot = JSON.stringify({ chunkSize, completed: Array.from(completedChunkSet) })
        const p = fs.promises.writeFile(progressPath, snapshot).catch(() => {}).finally(() => {
          if (progressWritePromise === p) progressWritePromise = null
        })
        progressWritePromise = p
        if (force) await p
      }

      let chunkQueueIndex = 0

      const fetchNextChunk = async (): Promise<void> => {
        while (chunkQueueIndex < chunks.length) {
          if (abortController.signal.aborted) {
            throw new DOMException('User aborted download', 'AbortError')
          }

          // 异步写盘背压：待落盘+在途内存超过上限 1.5x 时稍作让步
          while (pendingDiskWriteBytes + workerInFlightBytes >= maxMemoryBytes * 1.5 && activeWritePromises.size > 0) {
            if (abortController.signal.aborted) {
              throw new DOMException('User aborted download', 'AbortError')
            }
            await new Promise(r => setTimeout(r, 40))
          }

          const chunkItem = chunks[chunkQueueIndex++]
          const expectedLen = chunkItem.end - chunkItem.start + 1
          const chunkBuf = Buffer.allocUnsafe(expectedLen)
          let writeOffset = 0
          let attempts = 0
          let panRefreshCount = 0
          let preemptCount = 0
          let success = false
          const maxAttempts = 5
          const maxTransientAttempts = 30

          const releaseBufferedBytes = () => {
            if (writeOffset > 0) {
              workerInFlightBytes = Math.max(0, workerInFlightBytes - writeOffset)
              totalReceivedBytes = Math.max(0, totalReceivedBytes - writeOffset)
              writeOffset = 0
            }
          }

          while (!success) {
            if (abortController.signal.aborted) {
              releaseBufferedBytes()
              throw new DOMException('User aborted download', 'AbortError')
            }
            let handle: ManagedFetchHandle | null = null
            const reqStart = chunkItem.start + writeOffset
            const remainingExpected = expectedLen - writeOffset
            let slowPreempted = false
            try {
              handle = await fetchWithManagedTimeout(
                activeUrl,
                {
                  headers: { ...activeHeaders, Range: `bytes=${reqStart}-${chunkItem.end}` },
                  signal: abortController.signal as any
                },
                20000
              )
              const chunkRes = handle.response

              if ((chunkRes.status === 401 || chunkRes.status === 403 || chunkRes.status === 412) && cmd.panContext && panRefreshCount < 2) {
                try { await chunkRes.body?.cancel?.() } catch {}
                panRefreshCount++
                const refreshed = await ensurePanLinkRefreshed()
                if (refreshed) continue
              }

              // 严格要求 206 部分内容响应（除非总文件只有这 1 个完整分块且从 0 开始服务器返回 200）
              const isValidRangeRes =
                chunkRes.status === 206 ||
                (chunkRes.status === 200 && reqStart === 0 && totalBytes === expectedLen)
              if (!isValidRangeRes) {
                try { await chunkRes.body?.cancel?.() } catch {}
                throw new Error(`HTTP ${chunkRes.status}`)
              }

              if (chunkRes.status === 206) {
                const cr = chunkRes.headers?.get?.('content-range')
                const crMatch = cr ? cr.match(/bytes\s+(\d+)-(\d+)/i) : null
                if (crMatch && Number(crMatch[1]) !== reqStart) {
                  try { await chunkRes.body?.cancel?.() } catch {}
                  throw new Error(`分块 ${chunkItem.index} Range 起始偏移不匹配 (${crMatch[1]} != ${reqStart})`)
                }
              }

              if (!chunkRes.body) throw new Error('No response body')

              const reader = chunkRes.body.getReader()
              handle.resetIdleTimeout(25000)
              const connStartTime = Date.now()
              let windowStartTime = connStartTime
              let windowBytes = 0

              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                handle.resetIdleTimeout(25000)
                if (abortController.signal.aborted) {
                  try { await reader.cancel() } catch {}
                  throw new DOMException('User aborted download', 'AbortError')
                }
                if (!value || value.byteLength === 0) continue

                if (writeOffset + value.byteLength > expectedLen) {
                  try { await reader.cancel() } catch {}
                  throw new Error(`分块 ${chunkItem.index} 返回字节数超出预期 (${writeOffset + value.byteLength} > ${expectedLen})`)
                }

                Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(chunkBuf, writeOffset)
                writeOffset += value.byteLength
                windowBytes += value.byteLength
                workerInFlightBytes += value.byteLength
                totalReceivedBytes += value.byteLength

                const now = Date.now()
                if (now - lastReportTime > 400) {
                  const dt = Math.max(1, now - lastReportTime)
                  const speed = ((totalReceivedBytes - lastReportBytes) / dt) * 1000
                  this.sendProgress({
                    id,
                    totalBytes,
                    receivedBytes: totalReceivedBytes,
                    speed,
                    status: 'downloading',
                    errorMsg: ''
                  })
                  lastReportTime = now
                  lastReportBytes = totalReceivedBytes
                }

                // 慢连接抢占（对齐 YunX-Desktop DownloadTuning）：持续 >= 15s 且低于阈值时保留已收字节立即重连
                if (now - windowStartTime >= 5000) {
                  const winDt = Math.max(1, now - windowStartTime)
                  const windowBps = (windowBytes * 1000) / winDt
                  windowStartTime = now
                  windowBytes = 0

                  if (
                    now - connStartTime >= 15000 &&
                    expectedLen - writeOffset > 128 * 1024 &&
                    preemptCount < 6
                  ) {
                    const taskBps = this.taskSpeedMap.get(id)?.speed || 0
                    const avgPerConn = taskBps > 0 ? taskBps / Math.max(1, concurrency) : 0
                    const floorBps = Math.max(12 * 1024, avgPerConn * 0.45)
                    if (windowBps < floorBps) {
                      preemptCount++
                      slowPreempted = true
                      try { await reader.cancel() } catch {}
                      break
                    }
                  }
                }
              }

              if (slowPreempted) {
                continue
              }

              if (handle.isTimedOut() && !abortController.signal.aborted) {
                throw new Error(`分块 ${chunkItem.index} 流读取超时`)
              }
              if (writeOffset !== expectedLen) {
                throw new Error(`分块 ${chunkItem.index} 数据不完整 (${writeOffset}/${expectedLen} 字节, 剩余 ${remainingExpected})`)
              }

              // 网络收包完毕，转入异步并发落盘（不阻塞本 worker 拉取下一分块）
              workerInFlightBytes = Math.max(0, workerInFlightBytes - writeOffset)
              writeOffset = 0
              pendingDiskWriteBytes += chunkBuf.length

              const wp = writeBufferFully(fileHandle, chunkBuf, chunkItem.start)
                .then(() => {
                  completedChunkSet.add(chunkItem.index)
                  downloadedChunksCount++
                  progressDirty = true
                  saveProgressFile(false)
                })
                .catch((writeErr: any) => {
                  diskWriteError = writeErr
                  abortController.abort(writeErr)
                })
                .finally(() => {
                  pendingDiskWriteBytes = Math.max(0, pendingDiskWriteBytes - chunkBuf.length)
                  activeWritePromises.delete(wp)
                })
              activeWritePromises.add(wp)

              if (downloadedChunksCount >= totalChunksCount - 1) {
                const now = Date.now()
                const dt = Math.max(1, now - lastReportTime)
                const speed = ((totalReceivedBytes - lastReportBytes) / dt) * 1000
                this.sendProgress({
                  id,
                  totalBytes,
                  receivedBytes: Math.min(totalBytes, totalReceivedBytes),
                  speed: isNaN(speed) ? 0 : speed,
                  status: 'downloading',
                  errorMsg: ''
                })
                lastReportTime = now
                lastReportBytes = totalReceivedBytes
              }

              success = true
            } catch (err: any) {
              if (abortController.signal.aborted) {
                releaseBufferedBytes()
                throw err?.name === 'AbortError' ? err : new DOMException('User aborted download', 'AbortError')
              }
              const retryableErr =
                err?.name === 'AbortError' || handle?.isTimedOut()
                  ? new Error(err?.message || `分块 ${chunkItem.index} 请求中断，准备重试`)
                  : err
              attempts++
              if (isTransientNetworkError(retryableErr) || err?.name === 'AbortError') {
                if (attempts >= maxTransientAttempts) {
                  releaseBufferedBytes()
                  logger.error('Downloader', `[DirectDownloader] 分块 ${chunkItem.index} 连续重试 ${maxTransientAttempts} 次均失败: ${retryableErr.message}`)
                  throw new Error(`分块 ${chunkItem.index} 下载失败 (已重试 ${maxTransientAttempts} 次: ${retryableErr.message})`)
                }
                const friendlyMsg = formatTransientErrorMessage(retryableErr)
                logger.warn('Downloader', `[DirectDownloader] 分块 ${chunkItem.index} 遭遇网络波动 (保留已收 ${writeOffset}/${expectedLen} 字节)，正在自动续传重试 (第 ${attempts} 次): ${retryableErr.message}`)
                this.sendProgress({
                  id,
                  totalBytes,
                  receivedBytes: totalReceivedBytes,
                  speed: 0,
                  status: 'downloading',
                  errorMsg: `正在重试: ${friendlyMsg}`
                })
                await new Promise(r => setTimeout(r, getTransientRetryDelay(attempts, retryableErr)))
              } else {
                if (attempts >= maxAttempts) {
                  releaseBufferedBytes()
                  logger.error('Downloader', `[DirectDownloader] 分块 ${chunkItem.index} 连续重试 ${maxAttempts} 次均失败: ${retryableErr.message}`)
                  throw new Error(`分块 ${chunkItem.index} 下载失败 (${retryableErr.message})`)
                }
                await new Promise(r => setTimeout(r, getTransientRetryDelay(attempts, retryableErr)))
              }
            } finally {
              handle?.cleanup()
            }
          }
        }
      }

      const workers: Promise<void>[] = []
      for (let c = 0; c < concurrency; c++) {
        workers.push(fetchNextChunk())
      }

      try {
        await Promise.all(workers)
        await Promise.allSettled(Array.from(activeWritePromises))
        await saveProgressFile(true)
        await fileHandle.close()

        if (diskWriteError) {
          throw diskWriteError
        }
        if (completedChunkSet.size < totalChunksCount) {
          throw new Error(`分块未全部完成写入: ${completedChunkSet.size}/${totalChunksCount}`)
        }

        if (fs.existsSync(progressPath)) {
          try { await fs.promises.unlink(progressPath) } catch {}
        }

        const finalFileSize = fs.existsSync(savePath) ? fs.statSync(savePath).size : totalBytes
        logger.info('Downloader', `[DirectDownloader] 单文件 Range 断点续传/下载完成: ${savePath}，大小: ${finalFileSize}`)
        return {
          filePath: savePath,
          fileSize: finalFileSize
        }
      } catch (err: any) {
        await Promise.allSettled(Array.from(activeWritePromises))
        await saveProgressFile(true)
        try { await fileHandle.close() } catch {}
        if (diskWriteError) {
          throw diskWriteError
        }
        if (err?.name === 'AbortError' || abortController.signal.aborted) {
          const savedBytes = Array.from(completedChunkSet).reduce((sum, idx) => sum + getChunkByteLength(idx), 0)
          const pauseErr: any = Object.assign(new Error('User aborted download'), {
            name: 'AbortError',
            savedBytes
          })
          throw pauseErr
        }
        throw err
      }
    }

    // 3. 不支持 Range 或小文件：单线程流式下载（优先复用 200 OK 预检流，异步 write 落盘）
    let singleStreamAttempts = 0
    const maxSingleStreamAttempts = 30
    let panRefreshCount = 0
    let receivedBytes = startBytes
    let finalTotalBytes = totalBytes

    while (true) {
      if (abortController.signal.aborted) {
        await cleanupInitialHandle()
        throw new DOMException('User aborted download', 'AbortError')
      }

      let handle: ManagedFetchHandle | null = null
      let fileHandle: fs.promises.FileHandle | null = null
      try {
        if (initialFullResponseHandle && receivedBytes === 0) {
          handle = initialFullResponseHandle
          initialFullResponseHandle = null
        } else {
          await cleanupInitialHandle()
          const streamHeaders = { ...activeHeaders }
          if (receivedBytes > 0) {
            streamHeaders['Range'] = `bytes=${receivedBytes}-`
          }
          handle = await fetchWithManagedTimeout(
            activeUrl,
            { headers: streamHeaders, signal: abortController.signal as any },
            20000
          )
        }

        const response = handle.response
        if ((response.status === 401 || response.status === 403 || response.status === 412) && cmd.panContext && panRefreshCount < 2) {
          try { await response.body?.cancel?.() } catch {}
          handle.cleanup()
          handle = null
          panRefreshCount++
          const refreshed = await ensurePanLinkRefreshed()
          if (refreshed) continue
        }

        if (!response.ok && response.status !== 206) {
          try { await response.body?.cancel?.() } catch {}
          throw new Error(`HTTP ${response.status} ${response.statusText}`)
        }

        let flags = 'a'
        if (receivedBytes === 0) {
          flags = 'w'
        } else if (response.status === 200 && receivedBytes > 0) {
          flags = 'w'
          receivedBytes = 0
        }

        const contentLength = response.headers.get('content-length')
        if (contentLength && finalTotalBytes === 0) {
          finalTotalBytes = parseInt(contentLength, 10) + (response.status === 206 ? receivedBytes : 0)
        }

        fileHandle = await fs.promises.open(savePath, flags)
        this.sendProgress({
          id,
          totalBytes: finalTotalBytes,
          receivedBytes,
          speed: 0,
          status: 'downloading',
          errorMsg: ''
        })

        if (!response.body) throw new Error('No response body')
        const reader = response.body.getReader()
        handle.resetIdleTimeout(30000)

        let lastReportTime = Date.now()
        let lastReportBytes = receivedBytes
        let memoryChunks: Buffer[] = []
        let memoryChunkBytes = 0
        const flushLimit = Math.min(maxMemoryBytes, 8 * 1024 * 1024)

        const flushStreamBuffer = async () => {
          if (memoryChunks.length > 0 && fileHandle) {
            const combined = memoryChunks.length === 1 ? memoryChunks[0] : Buffer.concat(memoryChunks)
            memoryChunks = []
            memoryChunkBytes = 0
            await writeBufferFully(fileHandle, combined)
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          handle.resetIdleTimeout(30000)
          if (abortController.signal.aborted) {
            try { await reader.cancel() } catch {}
            await flushStreamBuffer()
            throw new DOMException('User aborted download', 'AbortError')
          }
          if (!value || value.byteLength === 0) continue

          const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
          receivedBytes += buf.length
          memoryChunks.push(buf)
          memoryChunkBytes += buf.length

          if (memoryChunkBytes >= flushLimit) {
            await flushStreamBuffer()
          }

          const now = Date.now()
          if (now - lastReportTime > 400) {
            const dt = Math.max(1, now - lastReportTime)
            const speed = ((receivedBytes - lastReportBytes) / dt) * 1000
            this.sendProgress({
              id,
              receivedBytes,
              totalBytes: finalTotalBytes,
              speed,
              status: 'downloading',
              errorMsg: ''
            })
            lastReportTime = now
            lastReportBytes = receivedBytes
          }
        }

        if (handle.isTimedOut() && !abortController.signal.aborted) {
          await flushStreamBuffer()
          throw new Error('单流读取空闲超时')
        }

        await flushStreamBuffer()
        await fileHandle.close()
        fileHandle = null
        break
      } catch (err: any) {
        if (fileHandle) {
          try { await fileHandle.close() } catch {}
          fileHandle = null
        }
        if (abortController.signal.aborted) {
          const savedBytes = fs.existsSync(savePath) ? fs.statSync(savePath).size : receivedBytes
          const pauseErr: any = Object.assign(new Error('User aborted download'), {
            name: 'AbortError',
            savedBytes
          })
          throw pauseErr
        }
        const retryableErr =
          err?.name === 'AbortError' || handle?.isTimedOut()
            ? new Error(err?.message || '单流连接意外中断，准备重试')
            : err
        singleStreamAttempts++
        if (isTransientNetworkError(retryableErr) || err?.name === 'AbortError') {
          if (singleStreamAttempts >= maxSingleStreamAttempts) {
            logger.error('Downloader', `[DirectDownloader] 单流下载连续重试 ${maxSingleStreamAttempts} 次均失败: ${retryableErr.message}`)
            throw new Error(`单流下载失败 (已重试 ${maxSingleStreamAttempts} 次: ${retryableErr.message})`)
          }
          const friendlyMsg = formatTransientErrorMessage(retryableErr)
          logger.warn('Downloader', `[DirectDownloader] 单流下载遭遇网络波动，正在后台自动重试 (第 ${singleStreamAttempts} 次): ${retryableErr.message}`)
          this.sendProgress({
            id,
            totalBytes: finalTotalBytes,
            receivedBytes,
            speed: 0,
            status: 'downloading',
            errorMsg: `正在重试: ${friendlyMsg}`
          })
          await new Promise(r => setTimeout(r, getTransientRetryDelay(singleStreamAttempts, retryableErr)))
        } else {
          logger.error('Downloader', `[DirectDownloader] 单流下载遇到非瞬态错误: ${retryableErr.message}`)
          throw retryableErr
        }
      } finally {
        handle?.cleanup()
      }
    }

    const finalFileSize = fs.existsSync(savePath) ? fs.statSync(savePath).size : receivedBytes
    logger.info('Downloader', `[DirectDownloader] 单文件流式下载完成: ${savePath}，大小: ${finalFileSize}`)
    return {
      filePath: savePath,
      fileSize: finalFileSize
    }
  }

  private async checkQueue() {
    let maxConcurrent = 3
    try {
      maxConcurrent = (await storeManager.getSetting('maxConcurrentDownloads')) || 3
    } catch {
      maxConcurrent = 3
    }

    while (this.activeDownloads.size < maxConcurrent && this.pendingQueue.length > 0) {
      const nextCmd = this.pendingQueue.shift()!
      this.runTask(nextCmd)
    }
  }

  pauseDownload(id: string) {
    // 1. 如果在待下载队列中
    const queueIndex = this.pendingQueue.findIndex(c => c.id === id)
    if (queueIndex !== -1) {
      this.pendingQueue.splice(queueIndex, 1)
      this.sendProgress({ id, status: 'paused', speed: 0 })
      this.checkQueue()
      return
    }

    // 2. 如果在待压缩队列中
    const compressQueueIndex = this.compressQueue.findIndex(c => c.taskId === id)
    if (compressQueueIndex !== -1) {
      const removed = this.compressQueue.splice(compressQueueIndex, 1)[0]
      this.sendProgress({ id, status: 'paused', speed: 0 })
      if (removed.resolve) {
        removed.resolve({ success: false, error: '压缩排队已取消' })
      }
      logger.info('Downloader', `[CompressQueue] 任务 ${id} 已从压缩排队队列中移除并暂停`)
      return
    }

    // 3. 如果当前正在压缩中
    if (this.activeCompressTaskId === id && this.activeCompressController) {
      logger.info('Downloader', `[CompressQueue] 正在压缩的任务 ${id} 被暂停，中断压缩进程`)
      this.activeCompressController.abort()
      if (this.activeCompressTempPath) {
        try {
          if (fs.existsSync(this.activeCompressTempPath)) {
            fs.unlinkSync(this.activeCompressTempPath)
          }
        } catch {}
      }
      this.sendProgress({ id, status: 'paused', speed: 0 })
      return
    }

    // 4. 如果当前正在下载中（仅发出中止信号，由 runTask/executeTaskInternal 的 finally 在文件句柄关闭后统一释放 activeDownloads 并调度队列）
    if (this.activeDownloads.has(id)) {
      const entry = this.activeDownloads.get(id)!
      entry.abortController.abort()
    }
  }

  cancelDownload(id: string) {
    this.pauseDownload(id)
  }

  async getVideoMediaInfo(filePath: string): Promise<{ duration: number; bitrate: number; size: number }> {
    if (!fs.existsSync(filePath)) {
      return { duration: 0, bitrate: 0, size: 0 }
    }
    const size = fs.statSync(filePath).size
    const info = await this.getVideoDurationAndBitrate(filePath)
    let bitrate = info.bitrate
    if (bitrate <= 0 && info.duration > 0) {
      bitrate = Math.round((size * 8) / info.duration)
    }
    return { duration: info.duration, bitrate, size }
  }

  /**
   * 评估视频文件是否符合自动压缩条件并计算目标码率
   */
  private async evaluateAutoCompress(filePath: string, taskId: string): Promise<{ needCompress: boolean; targetBitrateKbps: number }> {
    try {
      const ext = path.extname(filePath).toLowerCase()
      const videoExts = ['.mp4', '.mkv', '.webm', '.ts', '.avi', '.mov', '.flv']
      if (!videoExts.includes(ext)) {
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      const isCompressEnabled = (await storeManager.getSetting('enableVideoCompress')) || false
      if (!isCompressEnabled) {
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      const targetGB = (await storeManager.getSetting('videoCompressTargetGB')) ?? (await storeManager.getSetting('videoCompressThresholdGB')) ?? 1.5
      const targetSizeBytes = targetGB * 1024 * 1024 * 1024
      const triggerSizeBytes = targetSizeBytes * 1.5

      const minBitrateKbps = (await storeManager.getSetting('videoCompressMinBitrateKbps')) ?? 1500
      const minBitrateBps = minBitrateKbps * 1000

      if (!fs.existsSync(filePath)) {
        return { needCompress: false, targetBitrateKbps: 0 }
      }
      const currentSize = fs.statSync(filePath).size

      // 1. 体积触发条件：下载的视频文件大小 ≥ 目标文件大小的 1.5 倍
      if (currentSize < triggerSizeBytes) {
        logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 文件体积 (${(currentSize / 1024 / 1024).toFixed(1)}MB) 未达到触发条件 (目标大小 ${targetGB}GB 的 1.5倍即 ${(triggerSizeBytes / 1024 / 1024 / 1024).toFixed(2)}GB)，跳过压缩`)
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      // 2. 读取视频时长与实际码率
      const videoInfo = await this.getVideoDurationAndBitrate(filePath)
      let actualBitrateBps = 0
      if (videoInfo.bitrate > 0) {
        actualBitrateBps = videoInfo.bitrate
      } else if (videoInfo.duration > 0) {
        actualBitrateBps = (currentSize * 8) / videoInfo.duration
      }
      const actualBitrateKbps = Math.round(actualBitrateBps / 1000)

      // 3. 文件码率需大于最小码率
      if (actualBitrateBps > 0 && actualBitrateBps <= minBitrateBps) {
        logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 实际码率 (${actualBitrateKbps} kbps) 未大于设置的最小码率 (${minBitrateKbps} kbps)，保持原画质无需压缩`)
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      // 4. 读取视频时长，计算目标压缩大小所需的码率
      if (!videoInfo.duration || videoInfo.duration <= 0) {
        logger.warn('Downloader', `[AutoCompress] 任务 ${taskId} 无法获取有效视频时长，跳过压缩`)
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      const calculatedTargetBps = (targetSizeBytes * 8) / videoInfo.duration
      let targetBitrateKbps = Math.round(calculatedTargetBps / 1000)

      // 当计算得到的压缩码率小于设置的最小码率时，使用最小码率
      if (targetBitrateKbps < minBitrateKbps) {
        logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 计算出的目标码率 (${targetBitrateKbps} kbps) 小于设置的最小码率 (${minBitrateKbps} kbps)，保底使用最小码率 (${minBitrateKbps} kbps)`)
        targetBitrateKbps = minBitrateKbps
      }

      // 5. 限制：仅当目标码率小于等于原始码率时可以进行压缩
      if (actualBitrateKbps > 0 && targetBitrateKbps > actualBitrateKbps) {
        logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 目标码率 (${targetBitrateKbps} kbps) 大于原始码率 (${actualBitrateKbps} kbps)，无需压缩`)
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 满足自动压缩条件 (体积 ${(currentSize / 1024 / 1024).toFixed(2)}MB, 目标码率 ${targetBitrateKbps}kbps)`)
      return { needCompress: true, targetBitrateKbps }
    } catch (e: any) {
      logger.error('Downloader', `[AutoCompress] 评估压缩条件失败: ${e.message}`)
      return { needCompress: false, targetBitrateKbps: 0 }
    }
  }

  /**
   * 下载完成后的收尾工作：无需压缩则标记完成；需压缩则加入单一压缩队列排队
   */
  private async handlePostDownload(taskId: string, filePath: string, fileSize: number, totalSegments?: number) {
    const { needCompress, targetBitrateKbps } = await this.evaluateAutoCompress(filePath, taskId)

    if (!needCompress) {
      logger.info('Downloader', `[Downloader] 任务 ${taskId} 无需压缩，直接标记完成。最终大小: ${fileSize}`)
      this.sendProgress({
        id: taskId,
        savePath: filePath,
        totalBytes: fileSize,
        receivedBytes: fileSize,
        downloadedSegments: totalSegments,
        totalSegments: totalSegments,
        status: 'completed',
        progress: 100,
        speed: 0
      })
      return
    }

    // 加入全局单一压缩队列排队调度
    this.enqueueCompressTask({
      taskId,
      filePath,
      targetBitrateKbps,
      scope: 'autoCompress',
      totalSegments
    })
  }

  /**
   * 统一将压缩任务压入队列（单并发调度，完全不占用下载并发槽位）
   */
  private enqueueCompressTask(item: CompressQueueItem) {
    if (this.isCompressingActive) {
      logger.info('Downloader', `[CompressQueue] 当前已有压缩任务进行中，任务 ${item.taskId} 进入排队 (队列位置: ${this.compressQueue.length + 1})`)
      this.sendProgress({
        id: item.taskId,
        status: 'waiting',
        speedText: '等待压缩',
        progress: 100,
        downloadedSegments: item.totalSegments,
        totalSegments: item.totalSegments,
        speed: 0
      })
      this.compressQueue.push(item)
      this.onStatsChangeCallback?.()
    } else {
      this.isCompressingActive = true
      this.activeCompressTaskId = item.taskId
      this.onStatsChangeCallback?.()
      this.executeCompressQueueItem(item)
    }
  }

  /**
   * 手动压缩视频接口（由用户或右键菜单触发）
   */
  async compressVideoTask(taskId: string, filePath: string, targetBitrateKbps: number): Promise<{ success: boolean; newSize?: number; error?: string; skipped?: boolean }> {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' }
    }
    const currentSize = fs.statSync(filePath).size
    if (currentSize <= 0) {
      return { success: false, error: '文件为空' }
    }

    const info = await this.getVideoMediaInfo(filePath)
    const actualBitrateKbps = info.bitrate > 0 ? Math.round(info.bitrate / 1000) : 0
    if (actualBitrateKbps > 0 && targetBitrateKbps >= actualBitrateKbps) {
      logger.info('Downloader', `[ManualCompress] 任务 ${taskId} 原始码率 (${actualBitrateKbps} kbps) 小于等于目标码率 (${targetBitrateKbps} kbps)，自动跳过`)
      return { success: false, skipped: true, error: '码率未超过目标码率，无需压缩' }
    }

    return new Promise<{ success: boolean; newSize?: number; error?: string; skipped?: boolean }>((resolve, reject) => {
      this.enqueueCompressTask({
        taskId,
        filePath,
        targetBitrateKbps,
        scope: 'manualCompress',
        resolve,
        reject
      })
    })
  }

  /**
   * 执行单个压缩任务（同一时刻仅有且仅能有一个任务处于执行中）
   */
  private async executeCompressQueueItem(item: CompressQueueItem) {
    const { taskId, filePath, targetBitrateKbps, totalSegments, resolve } = item
    this.activeCompressTaskId = taskId
    this.activeCompressController = new AbortController()

    const dir = path.dirname(filePath)
    const parsed = path.parse(filePath)
    const tempCompressedPath = path.join(dir, `${parsed.name}.compress_tmp.mp4`)
    this.activeCompressTempPath = tempCompressedPath

    // 注意：绝对不能将 taskId 放入 this.activeDownloads！压缩任务完全不占用下载并发槽位！

    try {
      const currentSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
      const info = await this.getVideoDurationAndBitrate(filePath)

      this.sendProgress({
        id: taskId,
        status: 'compressing',
        progress: 0,
        speed: 0,
        downloadedSegments: totalSegments,
        totalSegments: totalSegments
      })

      const encoders = await getAvailableEncoders()
      const throttle = await getFfmpegThrottleConfig(item.scope)
      const throttleDesc = throttle.enabled && throttle.readrate
        ? `限速 ${throttle.readrate}x`
        : '全速'
      let compressSuccess = false
      let usedEncoder = ''
      let lastCompressError = ''

      for (const encoder of encoders) {
        if (this.activeCompressController.signal.aborted) break
        const isGpu = isGpuEncoder(encoder)
        logger.info('Downloader', `[CompressTask] 任务 ${taskId} 尝试使用编码器 [${encoder}] (${isGpu ? 'GPU硬件加速' : 'CPU'}, ${throttleDesc}) 压缩 (${targetBitrateKbps} kbps)`)
        const result = await this.executeFfmpegCompress(
          filePath,
          tempCompressedPath,
          encoder,
          targetBitrateKbps,
          info.duration,
          currentSize,
          taskId,
          this.activeCompressController,
          throttle
        )
        if (result.success && fs.existsSync(tempCompressedPath)) {
          const compSize = fs.statSync(tempCompressedPath).size
          if (compSize > 0) {
            compressSuccess = true
            usedEncoder = encoder
            break
          }
        }
        if (result.error) {
          lastCompressError = result.error
        }
        try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}
      }

      if (this.activeCompressController.signal.aborted) {
        logger.info('Downloader', `[CompressTask] 任务 ${taskId} 压缩已被中断取消`)
        try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}
        if (resolve) resolve({ success: false, error: '压缩已取消' })
        return
      }

      if (compressSuccess && fs.existsSync(tempCompressedPath)) {
        const compressedSize = fs.statSync(tempCompressedPath).size
        logger.info('Downloader', `[CompressTask] 任务 ${taskId} 使用 [${usedEncoder}] 压缩成功: ${(currentSize / 1024 / 1024).toFixed(1)}MB -> ${(compressedSize / 1024 / 1024).toFixed(1)}MB`)
        
        const replaced = await safeAtomicReplace(tempCompressedPath, filePath)
        if (replaced) {
          this.sendProgress({
            id: taskId,
            savePath: filePath,
            status: 'completed',
            progress: 100,
            receivedBytes: compressedSize,
            totalBytes: compressedSize,
            downloadedSegments: totalSegments,
            totalSegments: totalSegments,
            speed: 0
          })

          if (resolve) resolve({ success: true, newSize: compressedSize })
        } else {
          logger.error('Downloader', `[CompressTask] 任务 ${taskId} 文件安全替换失败，已完整保留原文件`)
          this.sendProgress({
            id: taskId,
            savePath: filePath,
            status: 'completed',
            progress: 100,
            receivedBytes: currentSize,
            totalBytes: currentSize,
            downloadedSegments: totalSegments,
            totalSegments: totalSegments,
            speed: 0
          })
          if (resolve) resolve({ success: false, error: '文件替换失败（文件可能被其他程序占用），原视频已安全保留' })
        }
      } else {
        logger.warn('Downloader', `[CompressTask] 任务 ${taskId} 压缩未成功，保留原始文件`)
        try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}
        
        this.sendProgress({
          id: taskId,
          savePath: filePath,
          status: 'completed',
          progress: 100,
          receivedBytes: currentSize,
          totalBytes: currentSize,
          downloadedSegments: totalSegments,
          totalSegments: totalSegments,
          speed: 0
        })

        if (resolve) resolve({ success: false, error: lastCompressError || '压缩未能完成' })
      }
    } catch (err: any) {
      logger.error('Downloader', `[CompressTask] 任务 ${taskId} 异常: ${err.message}`)
      try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}
      this.sendProgress({
        id: taskId,
        status: 'completed',
        progress: 100,
        receivedBytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        totalBytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        downloadedSegments: totalSegments,
        totalSegments: totalSegments,
        speed: 0
      })
      if (resolve) resolve({ success: false, error: err.message })
    } finally {
      this.activeCompressTaskId = null
      this.activeCompressController = null
      this.activeCompressTempPath = null
      try {
        if (fs.existsSync(tempCompressedPath)) {
          fs.unlinkSync(tempCompressedPath)
        }
      } catch {}

      // 启动队列中的下一个压缩任务
      this.processNextCompressQueue()
    }
  }

  private processNextCompressQueue() {
    if (this.compressQueue.length > 0) {
      const nextItem = this.compressQueue.shift()!
      logger.info('Downloader', `[CompressQueue] 启动队列下一个压缩任务: ${nextItem.taskId}`)
      this.isCompressingActive = true
      this.activeCompressTaskId = nextItem.taskId
      this.onStatsChangeCallback?.()
      this.executeCompressQueueItem(nextItem)
    } else {
      this.isCompressingActive = false
      this.activeCompressTaskId = null
      this.activeCompressController = null
      this.activeCompressTempPath = null
      this.onStatsChangeCallback?.()
    }
  }

  private async getVideoDurationAndBitrate(filePath: string): Promise<{ duration: number; bitrate: number }> {
    const ffprobeResult = await new Promise<{ duration: number; bitrate: number }>((resolve) => {
      const child = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration,bit_rate',
        '-of', 'json',
        filePath
      ])
      let stdout = ''
      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })
      child.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout)
            const duration = parseFloat(parsed?.format?.duration || '0') || 0
            const bitrate = parseInt(parsed?.format?.bit_rate || '0', 10) || 0
            if (duration > 0) {
              resolve({ duration, bitrate })
              return
            }
          } catch {}
        }
        resolve({ duration: 0, bitrate: 0 })
      })
      child.on('error', () => {
        resolve({ duration: 0, bitrate: 0 })
      })
    })
    if (ffprobeResult.duration > 0) {
      return ffprobeResult
    }

    return new Promise((resolve) => {
      const child = spawn('ffmpeg', ['-i', filePath])
      let stderr = ''
      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      child.on('close', () => {
        let duration = 0
        let bitrate = 0
        const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
        if (durationMatch) {
          const hours = parseFloat(durationMatch[1])
          const mins = parseFloat(durationMatch[2])
          const secs = parseFloat(durationMatch[3])
          duration = hours * 3600 + mins * 60 + secs
        }
        const bitrateMatch = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/i)
        if (bitrateMatch) {
          bitrate = parseInt(bitrateMatch[1], 10) * 1000
        }
        resolve({ duration, bitrate })
      })
      child.on('error', () => {
        resolve({ duration: 0, bitrate: 0 })
      })
    })
  }

  private async executeFfmpegCompress(
    inputPath: string,
    outputPath: string,
    encoder: string,
    targetBitrateKbps: number,
    totalDuration: number,
    currentSize: number,
    taskId: string,
    abortController: AbortController,
    throttle?: FfmpegThrottleConfig
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const encArgs = getEncoderArgs(encoder as VideoEncoder, { mode: 'bitrate', bitrateKbps: targetBitrateKbps })
      const args = [
        '-y',
        '-progress', 'pipe:1',
        ...(throttle?.inputArgs || []),
        '-i', inputPath,
        ...encArgs,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath
      ]

      const proc = spawn('ffmpeg', args)
      const startTime = Date.now()
      let lastProgressTime = 0
      let stdoutBuffer = ''
      let stderrBuffer = ''

      proc.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
        if (stderrBuffer.length > 5000) {
          stderrBuffer = stderrBuffer.substring(stderrBuffer.length - 5000)
        }
      })

      proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() || ''

        let outTimeUs: number | null = null
        let speedStr: string | null = null

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('out_time_us=')) {
            const val = parseInt(trimmed.substring(12), 10)
            if (!isNaN(val)) outTimeUs = val
          } else if (trimmed.startsWith('out_time=')) {
            const timeParts = trimmed.substring(9).split(':')
            if (timeParts.length === 3) {
              const h = parseFloat(timeParts[0]) || 0
              const m = parseFloat(timeParts[1]) || 0
              const s = parseFloat(timeParts[2]) || 0
              if (outTimeUs === null) {
                outTimeUs = Math.round((h * 3600 + m * 60 + s) * 1000000)
              }
            }
          } else if (trimmed.startsWith('speed=')) {
            const rawSpeed = trimmed.substring(6).trim().replace('x', '')
            if (rawSpeed && rawSpeed !== 'N/A') {
              speedStr = rawSpeed
            }
          }
        }

        const now = Date.now()
        if (now - lastProgressTime >= 200 && outTimeUs !== null && totalDuration > 0) {
          lastProgressTime = now
          const currentTimeSec = outTimeUs / 1000000
          const progressPercent = Math.min(99, Math.max(0, Math.round((currentTimeSec / totalDuration) * 100)))

          let speedMultiplier = speedStr ? parseFloat(speedStr) : 0
          if (isNaN(speedMultiplier) || speedMultiplier <= 0) {
            const elapsedWallSec = (now - startTime) / 1000
            if (elapsedWallSec > 0.5 && currentTimeSec > 0) {
              speedMultiplier = currentTimeSec / elapsedWallSec
            }
          }

          let remainingSeconds: number | undefined
          if (speedMultiplier > 0) {
            remainingSeconds = Math.max(0, Math.round((totalDuration - currentTimeSec) / speedMultiplier))
          }

          const speedFormatted = speedMultiplier > 0 ? `${speedMultiplier.toFixed(1)}x` : ''

          this.sendProgress({
            id: taskId,
            status: 'compressing',
            progress: progressPercent,
            receivedBytes: Math.round((currentSize * progressPercent) / 100),
            totalBytes: currentSize,
            speedText: speedFormatted,
            etaSeconds: remainingSeconds,
            speed: 0
          })
        }
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          try {
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath)
            }
          } catch {}
          const errorLines = stderrBuffer.trim().split('\n').filter(l => l.trim().length > 0)
          const lastError = errorLines.slice(-3).join('\n') || `FFmpeg 退出码: ${code}`
          resolve({ success: false, error: lastError })
        } else {
          resolve({ success: true })
        }
      })

      proc.on('error', (err) => {
        logger.error('Downloader', `[VideoCompress] FFmpeg 启动失败: ${err.message}`)
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath)
          }
        } catch {}
        resolve({ success: false, error: `FFmpeg 启动失败: ${err.message}` })
      })

      const abortHandler = () => {
        try { proc.kill('SIGKILL') } catch {}
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath)
          }
        } catch {}
        resolve({ success: false, error: '压缩已取消' })
      }
      abortController.signal.addEventListener('abort', abortHandler, { once: true })
    })
  }
}

export const downloader = new Downloader()
