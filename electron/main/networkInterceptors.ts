import { BrowserWindow, session } from 'electron'
import { isAdUrl } from '../adblock'
import { logger } from '../logger'

const globalMediaPageMap = new Map<string, string>()
const globalHostPageMap = new Map<string, string>()
const webContentsUrlMap = new Map<number, string>()
const MAX_REFERER_CACHE_SIZE = 1000

let mainWindowProvider: () => BrowserWindow | null = () => null

export function setNetworkMainWindowProvider(provider: () => BrowserWindow | null): void {
  mainWindowProvider = provider
}

export function trackWebContentsNavigation(contents: Electron.WebContents): void {
  contents.once('destroyed', () => {
    webContentsUrlMap.delete(contents.id)
  })

  contents.on('did-navigate', (_, url) => {
    if (url && !isLocalUrl(url)) {
      webContentsUrlMap.set(contents.id, url)
    }
  })
  contents.on('did-navigate-in-page', (_, url) => {
    if (url && !isLocalUrl(url)) {
      webContentsUrlMap.set(contents.id, url)
    }
  })
}

export function isLocalUrl(urlStr?: string): boolean {
  if (!urlStr) return true
  try {
    const u = new URL(urlStr)
    const host = u.hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || u.protocol === 'file:' || u.protocol === 'app:' || u.protocol === 'velora:'
  } catch {
    return true
  }
}

export function registerMediaReferer(mediaUrl: string, pageUrl: string): void {
  if (!mediaUrl || !pageUrl || isLocalUrl(pageUrl)) return
  let targetOrigin = pageUrl
  try {
    const u = new URL(pageUrl)
    if (u.origin && u.origin !== 'null') targetOrigin = u.origin
  } catch {}

  if (globalMediaPageMap.size >= MAX_REFERER_CACHE_SIZE) {
    const oldestKey = globalMediaPageMap.keys().next().value
    if (oldestKey) globalMediaPageMap.delete(oldestKey)
  }
  globalMediaPageMap.set(mediaUrl, targetOrigin)

  try {
    const u = new URL(mediaUrl)
    const host = u.hostname.toLowerCase()
    if (host) {
      if (globalHostPageMap.size >= MAX_REFERER_CACHE_SIZE) {
        const oldestHost = globalHostPageMap.keys().next().value
        if (oldestHost) globalHostPageMap.delete(oldestHost)
      }
      globalHostPageMap.set(host, targetOrigin)
    }
  } catch {}
}

export interface VeloraClientConfig {
  clientId: string
  referer: string
  origin?: string
}

class VeloraClientManager {
  private clients = new Map<string, VeloraClientConfig>()

  registerClient(config: VeloraClientConfig) {
    if (!config.clientId) return
    const referer = (config.referer || '').trim()
    let origin = config.origin
    try {
      if (referer && !origin) {
        const u = new URL(referer)
        if (u.origin && u.origin !== 'null') {
          origin = u.origin
        }
      }
    } catch {}
    this.clients.set(config.clientId, {
      clientId: config.clientId,
      referer,
      origin
    })
  }

  unregisterClient(clientId: string) {
    this.clients.delete(clientId)
  }

  getClient(clientId: string): VeloraClientConfig | undefined {
    return this.clients.get(clientId)
  }
}

export const clientManager = new VeloraClientManager()

function getHeaderValue(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const lowerKey = key.toLowerCase()
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lowerKey) {
      const val = headers[k]
      return Array.isArray(val) ? val[0] : val
    }
  }
  return undefined
}

function removeHeaderCaseInsensitive(headers: Record<string, any>, key: string) {
  const lowerKey = key.toLowerCase()
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lowerKey) {
      delete headers[k]
    }
  }
}

const interceptedSessions = new WeakSet<Electron.Session>()

export function setupNetworkInterceptors(targetSession: Electron.Session = session.defaultSession): void {
  if (interceptedSessions.has(targetSession)) return
  interceptedSessions.add(targetSession)

  // Network Sniffer & AdBlock Interceptor
  targetSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const isBackgroundMainReq = !details.webContentsId || details.webContentsId <= 0
      if (isBackgroundMainReq) {
        return callback({})
      }

      if (details.resourceType === 'mainFrame') {
        return callback({})
      }

      const url = details.url

      // AdBlock Interceptor
      if (isAdUrl(url)) {
        logger.info('AdBlock', `Blocked ad request: ${url}`)
        return callback({ cancel: true })
      }

      if (details.resourceType === 'subFrame' || details.resourceType === 'script' || details.resourceType === 'stylesheet') {
        return callback({})
      }

      let pathname = ''
      try {
        pathname = new URL(url).pathname.toLowerCase()
      } catch {
        pathname = url.split('?')[0].toLowerCase()
      }
      let type = ''

      if (pathname.endsWith('.m4s') || pathname.endsWith('.mpd') || pathname.endsWith('.ts')) {
        return callback({})
      }

      const isAudioExt = pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac|wma|opus|aiff|ape)$/i)
      const isVideoExt = pathname.match(/\.(mp4|webm|m3u8|flv|f4v|mkv|avi|mov|qt|wmv|asf|3gp|3g2|m2ts|vob|mpg|mpeg|ogv)$/i)

      if (isAudioExt) type = 'audio'
      else if (isVideoExt) type = 'video'

      const mainWindow = mainWindowProvider()
      if (type && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('media-sniffed', {
          webContentsId: details.webContentsId,
          url,
          type,
          timestamp: Date.now()
        })
      }

      callback({})
    }
  )

  // Network Sniffer - Catch by Headers & Bypass CORS globally
  targetSession.webRequest.onHeadersReceived(
    { urls: ['*://*/*'] },
    (details, callback) => {
      if (!details.webContentsId || details.webContentsId <= 0) {
        return callback({})
      }

      const responseHeaders = { ...details.responseHeaders }
      const mainWindow = mainWindowProvider()

      // Only inject wildcard CORS if the request comes from the main application window.
      // Webviews (e.g. for Bilibili) have different webContentsId and handle their own CORS.
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed() && details.webContentsId === mainWindow.webContents.id) {
        for (const key in responseHeaders) {
          if (key.toLowerCase().startsWith('access-control-allow-')) {
            delete responseHeaders[key]
          }
        }
        responseHeaders['Access-Control-Allow-Origin'] = ['*']
        responseHeaders['Access-Control-Allow-Headers'] = ['*']
        responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS']
      }

      if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame' || details.resourceType === 'script' || details.resourceType === 'stylesheet') {
        return callback({ responseHeaders })
      }

      let url = details.url
      let pathname = ''
      try {
        pathname = new URL(url).pathname.toLowerCase()
      } catch {
        pathname = url.split('?')[0].toLowerCase()
      }
      let type = ''

      const isImageExt = pathname.match(/\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff)$/i)
      const isAudioExt = pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac|wma|opus|aiff|ape)$/i)
      const isVideoExt = pathname.match(/\.(mp4|webm|m3u8|flv|f4v|mkv|avi|mov|qt|wmv|asf|3gp|3g2|m2ts|vob|mpg|mpeg|ogv)$/i)

      if (pathname.endsWith('.m4s') || pathname.endsWith('.mpd') || pathname.endsWith('.ts')) {
        return callback({ responseHeaders })
      }

      let contentType = ''
      if (details.responseHeaders) {
        for (const key in details.responseHeaders) {
          if (key.toLowerCase() === 'content-type') {
            contentType = details.responseHeaders[key][0].toLowerCase()
            break
          }
        }
      }

      const audioMimeWhitelist = [
        'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
        'audio/flac', 'audio/x-m4a', 'audio/mp4', 'audio/x-ms-wma', 'audio/opus',
        'audio/x-wav', 'audio/aiff'
      ]
      const videoMimeWhitelist = [
        'video/mp4', 'video/webm', 'video/x-flv', 'video/flv', 'video/avi',
        'video/x-msvideo', 'video/quicktime', 'video/x-matroska', 'video/x-ms-wmv',
        'video/x-ms-asf', 'video/3gpp', 'video/3gpp2', 'video/mpeg', 'video/mp2t',
        'video/ogg', 'application/x-mpegurl', 'application/vnd.apple.mpegurl',
        'application/dash+xml'
      ]
      const imageMimeWhitelist = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/bmp']

      const matchesAudioMime = audioMimeWhitelist.some(mime => contentType.startsWith(mime))
      const matchesVideoMime = videoMimeWhitelist.some(mime => contentType.startsWith(mime) || contentType.includes('mpegurl'))
      const matchesImageMime = imageMimeWhitelist.some(mime => contentType.startsWith(mime))

      // 若既无匹配后缀，且 Content-Type 也不在白名单中，并且资源类型不是 media/image，则忽略
      if (!isImageExt && !isAudioExt && !isVideoExt && !matchesAudioMime && !matchesVideoMime && !matchesImageMime) {
        return callback({ responseHeaders })
      }

      if (isImageExt && (details.resourceType === 'image' || matchesImageMime)) {
        type = 'image'
      } else if (matchesAudioMime || (isAudioExt && (details.resourceType === 'media' || !contentType || matchesAudioMime))) {
        type = 'audio'
      } else if (matchesVideoMime || (isVideoExt && (details.resourceType === 'media' || !contentType || matchesVideoMime))) {
        type = 'video'
      }

      if (type === 'image') {
        // 保留 query 参数，但去除 @ 后的缩放等特殊后缀
        try {
          const parsed = new URL(url)
          url = parsed.origin + parsed.pathname
          const atIndex = url.indexOf('@')
          if (atIndex !== -1) url = url.substring(0, atIndex)
          url += parsed.search
        } catch {}
      }

      if (type && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        const activePageUrl = webContentsUrlMap.get(details.webContentsId)
        if (activePageUrl) {
          registerMediaReferer(url, activePageUrl)
        }

        mainWindow.webContents.send('media-sniffed', {
          webContentsId: details.webContentsId,
          url,
          type,
          timestamp: Date.now()
        })
      }

      callback({ responseHeaders })
    }
  )

  // Referer and Origin header handling: Set to client config (X-Velora-Client-Id) or webpage referrer if present, otherwise strip local/empty
  targetSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details, callback) => {
      if (details.resourceType === 'mainFrame') {
        return callback({ requestHeaders: details.requestHeaders })
      }

      const explicitClientId = getHeaderValue(details.requestHeaders, 'X-Velora-Client-Id')
      const explicitRef = getHeaderValue(details.requestHeaders, 'X-Velora-Referer')
      const isBackgroundMainReq = !details.webContentsId || details.webContentsId <= 0
      if (isBackgroundMainReq && !explicitClientId && !explicitRef) {
        return callback({})
      }

      const existingRef = getHeaderValue(details.requestHeaders, 'Referer')

      let clientConfig: VeloraClientConfig | undefined
      if (explicitClientId) {
        clientConfig = clientManager.getClient(explicitClientId)
      }

      const exactMappedRef = globalMediaPageMap.get(details.url)
      let hostMappedRef: string | undefined
      try {
        const u = new URL(details.url)
        hostMappedRef = globalHostPageMap.get(u.hostname.toLowerCase())
      } catch {}

      const webContentsRef = webContentsUrlMap.get(details.webContentsId)
      const mainWindow = mainWindowProvider()

      const isMainWinReq =
        mainWindow &&
        !mainWindow.isDestroyed() &&
        details.webContentsId === mainWindow.webContents.id

      let targetReferer =
        isMainWinReq || explicitClientId || explicitRef
          ? clientConfig?.referer || explicitRef || exactMappedRef || hostMappedRef || existingRef || details.referrer || webContentsRef
          : clientConfig?.referer ||
            explicitRef ||
            (existingRef && !isLocalUrl(existingRef) ? existingRef : undefined) ||
            (details.referrer && !isLocalUrl(details.referrer) ? details.referrer : undefined) ||
            exactMappedRef ||
            hostMappedRef ||
            webContentsRef

      if (isLocalUrl(targetReferer)) {
        targetReferer = clientConfig?.referer || explicitRef || exactMappedRef || hostMappedRef || (isLocalUrl(webContentsRef) ? '' : webContentsRef) || ''
      }

      if (targetReferer) {
        try {
          const parsedTarget = new URL(targetReferer)
          const targetOrigin = clientConfig?.origin || parsedTarget.origin
          // 保留调用方传入的完整 Referer（含末尾斜杠及子路径）；仅当无有效 scheme 时兜底处理
          let cleanReferer = /^https?:\/\//i.test(targetReferer) ? targetReferer : targetOrigin
          // 夸克/UC/123网盘防盗链根路径 Referer 确保携带末尾斜杠
          if (
            (targetReferer.includes('quark.cn') || targetReferer.includes('uc.cn') || targetReferer.includes('123pan')) &&
            cleanReferer === targetOrigin &&
            !cleanReferer.endsWith('/')
          ) {
            cleanReferer = cleanReferer + '/'
          }
          const existingOrigin = getHeaderValue(details.requestHeaders, 'Origin')
          removeHeaderCaseInsensitive(details.requestHeaders, 'Referer')
          details.requestHeaders['Referer'] = cleanReferer

          // 仅在请求本身已携带 Origin 或需要替换本地域 Origin 时设置 Origin，避免普通 GET 触发 CDN 403
          if (existingOrigin) {
            removeHeaderCaseInsensitive(details.requestHeaders, 'Origin')
            if (targetOrigin && targetOrigin !== 'null') {
              details.requestHeaders['Origin'] = targetOrigin
            }
          }
        } catch {
          removeHeaderCaseInsensitive(details.requestHeaders, 'Referer')
          removeHeaderCaseInsensitive(details.requestHeaders, 'Origin')
        }
      } else {
        removeHeaderCaseInsensitive(details.requestHeaders, 'Referer')
        removeHeaderCaseInsensitive(details.requestHeaders, 'Origin')
      }

      removeHeaderCaseInsensitive(details.requestHeaders, 'X-Velora-Client-Id')
      removeHeaderCaseInsensitive(details.requestHeaders, 'X-Velora-Referer')

      callback({ requestHeaders: details.requestHeaders })
    }
  )
}
