import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fetchWithRedirectGuard } from '../downloader'
import { logger } from '../logger'
import { localDataPath } from './bootstrap'

interface ActiveMediaStream {
  filePath: string
  fileStream: fs.ReadStream
  res: http.ServerResponse
}

interface PanPreviewEntry {
  url: string
  headers: Record<string, string>
  filename: string
  createdAt: number
}

const activeMediaStreams = new Set<ActiveMediaStream>()
const panPreviewRegistry = new Map<string, PanPreviewEntry>()

const mediaServerToken = crypto.randomBytes(24).toString('hex')
const SENSITIVE_STREAM_EXTS = new Set(['.json', '.enc', '.log', '.env', '.db', '.sqlite', '.sqlite3', '.key', '.pem', '.crt', '.pfx'])

let streamServerPort = 0
let mediaServerStarted = false

export function getStreamServerPort(): number {
  return streamServerPort
}

export function getMediaServerToken(): string {
  return mediaServerToken
}

export function registerPanPreview(url: string, headers: Record<string, string>, filename: string): string {
  const sid = crypto.randomBytes(16).toString('hex')
  const now = Date.now()
  if (panPreviewRegistry.size >= 100) {
    panPreviewRegistry.forEach((v, k) => {
      if (now - v.createdAt > 6 * 60 * 60 * 1000) panPreviewRegistry.delete(k)
    })
    if (panPreviewRegistry.size >= 100) {
      const oldestKey = panPreviewRegistry.keys().next().value
      if (oldestKey !== undefined) panPreviewRegistry.delete(oldestKey)
    }
  }
  panPreviewRegistry.set(sid, {
    url,
    headers,
    filename,
    createdAt: now
  })
  return `http://127.0.0.1:${streamServerPort}/pan-stream?token=${encodeURIComponent(mediaServerToken)}&sid=${sid}`
}

export function releaseLocalMediaStreams(targetPath: string): number {
  if (!targetPath) return 0
  const normalizedTarget = path.normalize(targetPath).toLowerCase()
  let closedCount = 0

  for (const item of Array.from(activeMediaStreams)) {
    const itemNorm = path.normalize(item.filePath).toLowerCase()
    const isDirectMatch = itemNorm === normalizedTarget
    const isSubPathMatch = itemNorm.startsWith(normalizedTarget.endsWith(path.sep) ? normalizedTarget : normalizedTarget + path.sep)

    if (isDirectMatch || isSubPathMatch) {
      try {
        item.fileStream.destroy()
      } catch {}
      try {
        if (!item.res.writableEnded) {
          item.res.destroy()
        }
      } catch {}
      activeMediaStreams.delete(item)
      closedCount++
    }
  }

  if (closedCount > 0) {
    logger.info('Main', `[MediaServer] 已强制释放 ${closedCount} 个本地媒体流句柄: ${targetPath}`)
  }
  return closedCount
}

function isSensitiveStreamPath(targetPath: string): boolean {
  try {
    const resolved = path.resolve(targetPath)
    const resolvedLower = resolved.toLowerCase()
    const dataDirResolved = path.resolve(localDataPath).toLowerCase()
    // 禁止通过流服务访问应用配置、密钥与会话目录内文件
    if (resolvedLower === dataDirResolved || resolvedLower.startsWith(dataDirResolved + path.sep)) {
      return true
    }
    const ext = path.extname(resolvedLower)
    if (SENSITIVE_STREAM_EXTS.has(ext)) {
      return true
    }
  } catch {
    return true
  }
  return false
}

function resolveAllowedStreamOrigin(originHeader?: string): string | null {
  if (!originHeader) return null
  if (
    originHeader === 'null' ||
    originHeader.startsWith('file://') ||
    originHeader.startsWith('http://localhost:') ||
    originHeader.startsWith('http://127.0.0.1:')
  ) {
    return originHeader
  }
  return null
}

function inferMediaContentType(filePathOrName: string): string {
  const ext = (filePathOrName || '').split('.').pop()?.toLowerCase() || ''
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4'
  if (ext === 'm3u8') return 'application/x-mpegURL'
  if (ext === 'ts') return 'video/MP2T'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'm4a' || ext === 'aac') return 'audio/mp4'
  if (ext === 'flac') return 'audio/flac'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'webm') return 'video/webm'
  if (ext === 'mkv') return 'video/x-matroska'
  if (ext === 'flv' || ext === 'f4v') return 'video/x-flv'
  if (ext === 'mov' || ext === 'qt') return 'video/quicktime'
  if (ext === 'avi') return 'video/x-msvideo'
  if (ext === 'wmv') return 'video/x-ms-wmv'
  if (ext === '3gp') return 'video/3gpp'
  if (ext === 'ogg' || ext === 'ogv') return 'video/ogg'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'application/octet-stream'
}

const mediaServer = http.createServer(async (req, res) => {
  try {
    const allowedOrigin = resolveAllowedStreamOrigin(typeof req.headers.origin === 'string' ? req.headers.origin : undefined)
    if (req.method === 'OPTIONS') {
      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
        res.setHeader('Vary', 'Origin')
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      res.writeHead(204)
      return res.end()
    }

    const urlObj = new URL(req.url || '', `http://${req.headers.host || '127.0.0.1'}`)
    if (urlObj.pathname === '/stream') {
      const reqToken = urlObj.searchParams.get('token')
      if (!reqToken || reqToken !== mediaServerToken) {
        res.writeHead(403)
        return res.end('Forbidden')
      }

      const filePath = urlObj.searchParams.get('path')
      if (!filePath) {
        res.writeHead(400)
        return res.end('Missing path')
      }

      if (isSensitiveStreamPath(filePath)) {
        res.writeHead(403)
        return res.end('Forbidden path')
      }

      const stat = await fs.promises.stat(filePath)
      const rangeHeader = req.headers['range']

      let contentType = 'application/octet-stream'
      const ext = filePath.split('.').pop()?.toLowerCase()
      if (ext === 'mp4' || ext === 'm4v') contentType = 'video/mp4'
      else if (ext === 'm3u8') contentType = 'application/x-mpegURL'
      else if (ext === 'ts') contentType = 'video/MP2T'
      else if (ext === 'mp3') contentType = 'audio/mpeg'
      else if (ext === 'webm') contentType = 'video/webm'
      else if (ext === 'mkv') contentType = 'video/x-matroska'
      else if (ext === 'flv' || ext === 'f4v') contentType = 'video/x-flv'
      else if (ext === 'mov' || ext === 'qt') contentType = 'video/quicktime'
      else if (ext === 'avi') contentType = 'video/x-msvideo'
      else if (ext === 'wmv') contentType = 'video/x-ms-wmv'
      else if (ext === '3gp') contentType = 'video/3gpp'
      else if (ext === 'ogg' || ext === 'ogv') contentType = 'video/ogg'
      else if (ext === 'png') contentType = 'image/png'
      else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg'
      else if (ext === 'webp') contentType = 'image/webp'
      else if (ext === 'gif') contentType = 'image/gif'

      const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`
      const lastModified = stat.mtime.toUTCString()
      const ifRange = req.headers['if-range']
      const isIfRangeValid = !ifRange || ifRange === etag || ifRange === lastModified

      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
        res.setHeader('Vary', 'Origin')
      }
      res.setHeader('Content-Type', contentType)
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Cache-Control', 'no-cache, private')
      res.setHeader('ETag', etag)
      res.setHeader('Last-Modified', lastModified)
      res.setHeader('Connection', 'keep-alive')

      if (rangeHeader && stat.size > 0 && isIfRangeValid) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
        if (!match) {
          res.writeHead(416, {
            'Content-Range': `bytes */${stat.size}`
          })
          return res.end()
        }

        let start = match[1] ? parseInt(match[1], 10) : NaN
        let end = match[2] ? parseInt(match[2], 10) : NaN

        if (isNaN(start)) {
          if (isNaN(end)) {
            res.writeHead(416, {
              'Content-Range': `bytes */${stat.size}`
            })
            return res.end()
          }
          start = Math.max(0, stat.size - end)
          end = stat.size - 1
        } else if (isNaN(end)) {
          end = stat.size - 1
        }

        if (start >= stat.size || start < 0 || end < start) {
          res.writeHead(416, {
            'Content-Range': `bytes */${stat.size}`
          })
          return res.end()
        }

        end = Math.min(end, stat.size - 1)
        const chunksize = end - start + 1

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes'
        })
        const fileStream = fs.createReadStream(filePath, { start, end })
        const streamEntry: ActiveMediaStream = { filePath, fileStream, res }
        activeMediaStreams.add(streamEntry)
        const cleanUpStream = () => {
          activeMediaStreams.delete(streamEntry)
          try { fileStream.destroy() } catch {}
        }

        fileStream.on('error', (err) => {
          logger.warn('Protocol', `Local media stream pipe error: ${err.message}`)
          cleanUpStream()
          if (!res.headersSent) {
            res.writeHead(500)
          }
          res.end()
        })
        req.on('close', cleanUpStream)
        res.on('finish', cleanUpStream)
        fileStream.on('close', () => activeMediaStreams.delete(streamEntry))
        fileStream.pipe(res)
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes'
        })
        const fileStream = fs.createReadStream(filePath)
        const streamEntry: ActiveMediaStream = { filePath, fileStream, res }
        activeMediaStreams.add(streamEntry)
        const cleanUpStream = () => {
          activeMediaStreams.delete(streamEntry)
          try { fileStream.destroy() } catch {}
        }

        fileStream.on('error', (err) => {
          logger.warn('Protocol', `Local media full stream error: ${err.message}`)
          cleanUpStream()
          if (!res.headersSent) {
            res.writeHead(500)
          }
          res.end()
        })
        req.on('close', cleanUpStream)
        res.on('finish', cleanUpStream)
        fileStream.on('close', () => activeMediaStreams.delete(streamEntry))
        fileStream.pipe(res)
      }
    } else if (urlObj.pathname === '/pan-stream') {
      const reqToken = urlObj.searchParams.get('token')
      if (!reqToken || reqToken !== mediaServerToken) {
        res.writeHead(403)
        return res.end('Forbidden')
      }

      const sid = urlObj.searchParams.get('sid') || ''
      const entry = panPreviewRegistry.get(sid)
      if (!entry) {
        res.writeHead(404)
        return res.end('Preview not found or expired')
      }

      const upstreamHeaders: Record<string, string> = { ...entry.headers }
      if (typeof req.headers['range'] === 'string') {
        upstreamHeaders['Range'] = req.headers['range']
      }
      if (typeof req.headers['if-range'] === 'string') {
        upstreamHeaders['If-Range'] = req.headers['if-range']
      }

      const abortCtrl = new AbortController()
      req.on('close', () => {
        try { abortCtrl.abort() } catch {}
      })

      const upstream = await fetchWithRedirectGuard(entry.url, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
        signal: abortCtrl.signal as any
      })

      const respHeaders: Record<string, string> = {}
      const passHeaders = ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control']
      for (const h of passHeaders) {
        const val = upstream.headers?.get?.(h)
        if (val) respHeaders[h] = val
      }
      const rawCt = upstream.headers?.get?.('content-type') || ''
      const ct = rawCt && !rawCt.toLowerCase().includes('octet-stream')
        ? rawCt
        : inferMediaContentType(entry.filename)
      if (ct) respHeaders['Content-Type'] = ct
      if (!respHeaders['Accept-Ranges']) {
        respHeaders['Accept-Ranges'] = 'bytes'
      }
      if (allowedOrigin) {
        respHeaders['Access-Control-Allow-Origin'] = allowedOrigin
        respHeaders['Vary'] = 'Origin'
      }

      res.writeHead(upstream.status || 200, respHeaders)
      if (req.method === 'HEAD' || !upstream.body) {
        return res.end()
      }

      const reader = upstream.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value && value.byteLength > 0 && !res.destroyed) {
            const canContinue = res.write(Buffer.from(value))
            if (!canContinue) {
              await new Promise<void>((r) => res.once('drain', r))
            }
          }
        }
      } catch (streamErr: any) {
        if (!abortCtrl.signal.aborted) {
          logger.warn('Protocol', `Pan stream pump error: ${streamErr?.message || streamErr}`)
        }
      } finally {
        try { await reader.cancel() } catch {}
        if (!res.writableEnded) res.end()
      }
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  } catch (err: any) {
    logger.error('Protocol', `Local media server error: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(404)
    }
    if (!res.writableEnded) {
      res.end('File not found')
    }
  }
})

export function startMediaStreamServer(): void {
  if (mediaServerStarted) return
  mediaServerStarted = true
  mediaServer.listen(0, '127.0.0.1', () => {
    streamServerPort = (mediaServer.address() as any).port
    logger.info('System', `Local media server listening on port ${streamServerPort}`)
  })
}
