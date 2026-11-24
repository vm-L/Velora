import path from 'path'
import { session as electronSession } from 'electron'
import { logger } from '../logger'
import type { ManagedFetchHandle, M3U8ParseResult, M3U8Segment } from './types'
import {
  deleteHeaderCaseInsensitive,
  fetchWithRedirectGuard,
  getHeaderCaseInsensitive,
  isTrustedCrossDomainRedirect,
  mergeCookieHeaders,
  parseUrlHost,
  sanitizeOutboundHeaders
} from './httpClient'
import {
  createHttpResponseError,
  fetchWithManagedTimeoutCore,
  readResponseBufferWithIdleTimeout
} from './retryAndDiag'

export const M3U8_SESSION_POOL_SIZE = 12
export const M3U8_INTERNAL_REFERER_HEADER = 'X-Velora-M3U8-Referer'
export const M3U8_INTERNAL_ORIGIN_HEADER = 'X-Velora-M3U8-Origin'
export const M3U8_INTERNAL_COOKIE_HEADER = 'X-Velora-M3U8-Cookie'
export const M3U8_INTERNAL_UA_HEADER = 'X-Velora-M3U8-UA'
let m3u8Sessions: Electron.Session[] | null = null

/**
 * 惰性创建 M3U8 专用无缓存 Electron Session 池（分散 HTTP/2 单连接队头阻塞并保留系统代理/TLS 指纹）
 */
export function getM3U8Session(sessionIndex = 0): Electron.Session | null {
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

export async function fetchWithM3U8Session(
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
  let redirectHops = 0
  let crossDomainRedirect = false
  let strippedCredentials = false

  const attachFetchMeta = (res: any) => {
    try {
      ;(res as any).__veloraFetchMeta = {
        finalUrl: currentUrl,
        redirectHops,
        crossDomainRedirect,
        strippedCredentials
      }
    } catch {}
    return res
  }

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
      if (!loc) return attachFetchMeta(res)
      try { await res.body?.cancel?.() } catch {}
      const resolved = new URL(loc, currentUrl)
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        throw new Error(`不支持的重定向协议: ${resolved.protocol}`)
      }
      const prevHost = parseUrlHost(currentUrl)
      const nextHost = resolved.hostname.toLowerCase()
      const trusted = isTrustedCrossDomainRedirect(prevHost, nextHost)
      redirectHops++
      if (prevHost && nextHost && prevHost !== nextHost) {
        crossDomainRedirect = true
      }
      if (!trusted) {
        strippedCredentials = true
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

    return attachFetchMeta(res)
  }

  throw new Error('下载直链重定向次数过多')
}

/**
 * 基于 M3U8 多 Session 连接池、带连接与流空闲超时的网络请求封装
 */
export async function fetchM3U8WithManagedTimeout(
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

export function resolveUrl(baseUrl: string, relativeOrAbsolute: string): string {
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
 * 智能解析 M3U8 Playlist (自动处理 Master Playlist 与相对路径，识别 fMP4/m4s 切片)
 */
export async function parseM3U8(
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
      throw await createHttpResponseError(
        handle.response,
        'playlist',
        true,
        `无法获取 M3U8 播放列表: HTTP ${handle.response.status}`
      )
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
  let currentKey: { method: string; url: string; iv?: string } | undefined = undefined
  let isFmp4 = false
  let pendingDiscontinuity = false
  let pendingByteRange: string | undefined = undefined

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
    } else if (line === '#EXT-X-DISCONTINUITY') {
      pendingDiscontinuity = true
    } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      const rawRange = line.slice('#EXT-X-BYTERANGE:'.length).trim()
      if (rawRange) {
        pendingByteRange = rawRange
      }
    } else if (line.startsWith('#EXT-X-MAP:')) {
      isFmp4 = true
      const uriMatch = line.match(/URI="([^"]+)"/)
      if (uriMatch) {
        segments.push({
          index: index++,
          url: resolveUrl(playlistUrl, uriMatch[1]),
          duration: 0,
          key: currentKey,
          ...(pendingDiscontinuity ? { discontinuity: true } : {}),
          ...(pendingByteRange ? { byteRange: pendingByteRange } : {})
        })
        pendingDiscontinuity = false
        pendingByteRange = undefined
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
        key: currentKey,
        ...(pendingDiscontinuity ? { discontinuity: true } : {}),
        ...(pendingByteRange ? { byteRange: pendingByteRange } : {})
      })
      pendingDiscontinuity = false
      pendingByteRange = undefined
    }
  }

  return { segments, isFmp4 }
}

export async function isM3U8UrlOrContent(
  url: string,
  headers: any,
  signal: AbortSignal,
  savePath?: string
): Promise<boolean> {
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
