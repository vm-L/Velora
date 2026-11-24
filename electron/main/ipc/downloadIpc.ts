import { clipboard, ipcMain, nativeImage, net } from 'electron'
import fs from 'fs'
import path from 'path'
import { downloader, getHeadersForUrl } from '../../downloader'
import { logger } from '../../logger'
import { resolveSafeChildPath, sanitizeFileName } from '../../utils/fileSystem'
import { clientManager, registerMediaReferer, type VeloraClientConfig } from '../networkInterceptors'
import { broadcastFileSystemChange } from '../windowManager'

const pathExistsAsync = async (p: string): Promise<boolean> => {
  try {
    await fs.promises.access(p)
    return true
  } catch {
    return false
  }
}

const checkTargetOrTempExists = async (filePath: string): Promise<boolean> => {
  if (!filePath) return false
  const parsed = path.parse(filePath)
  const candidates = [
    filePath,
    filePath + '.temp.mp4',
    filePath + '.temp.ts',
    filePath + '.spill.bin',
    filePath + '.spill.meta.json',
    filePath + '.spill.meta.json.tmp',
    filePath + '.segs',
    filePath + '.temp',
    filePath + '.tmp',
    filePath + '.velora',
    filePath + '.ts',
    path.join(parsed.dir, `${parsed.name}.compress_tmp.mp4`)
  ]
  const results = await Promise.all(candidates.map(pathExistsAsync))
  return results.some(Boolean)
}

export function registerDownloadIpc(): void {
  ipcMain.handle('fetch-image-base64', async (_, url: string) => {
    try {
      const response = await net.fetch(url, { headers: getHeadersForUrl(url) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      let contentType = response.headers.get('content-type') || 'image/x-icon'
      if (contentType.includes(';')) contentType = contentType.split(';')[0]
      const base64 = Buffer.from(buffer).toString('base64')
      return `data:${contentType};base64,${base64}`
    } catch (e: any) {
      logger.error('Main', 'Failed to fetch image base64: ' + e)
      return null
    }
  })

  ipcMain.handle('fetch-url', async (_, url: string) => {
    try {
      const response = await net.fetch(url, { headers: getHeadersForUrl(url) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    } catch (e: any) {
      logger.error('Main', 'Failed to fetch url: ' + e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('copy-image', async (_, url: string) => {
    try {
      const response = await net.fetch(url, { headers: getHeadersForUrl(url) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      const image = nativeImage.createFromBuffer(Buffer.from(buffer))
      clipboard.writeImage(image)
      return true
    } catch (e: any) {
      logger.error('Main', 'Failed to copy image: ' + e)
      return false
    }
  })

  ipcMain.handle('save-images', async (_, dirPath: string, files: { url: string; name: string }[]) => {
    const results = []
    for (const file of files) {
      try {
        const response = await net.fetch(file.url, { headers: getHeadersForUrl(file.url) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await response.arrayBuffer()
        const safeName = sanitizeFileName(path.basename(String(file.name || '')), 'image')
        const savePath = resolveSafeChildPath(dirPath, safeName, 'image')
        await fs.promises.writeFile(savePath, Buffer.from(buffer))
        results.push({ url: file.url, success: true, path: savePath })
        broadcastFileSystemChange({
          type: 'add',
          name: safeName,
          path: savePath
        })
      } catch (e: any) {
        logger.error('Main', 'Failed to save image: ' + file.url + ' ' + e)
        results.push({ url: file.url, success: false, error: e.message })
      }
    }
    return results
  })

  ipcMain.handle('set-media-referer', (_, mediaUrl: string, pageUrl: string) => {
    registerMediaReferer(mediaUrl, pageUrl)
  })

  ipcMain.handle('create-media-client', (_, config: VeloraClientConfig) => {
    if (config && config.clientId) {
      clientManager.registerClient(config)
    }
  })

  ipcMain.handle('destroy-media-client', (_, clientId: string) => {
    if (clientId) {
      clientManager.unregisterClient(clientId)
    }
  })

  ipcMain.on('start-download', (_, cmd) => {
    downloader.startDownload(cmd)
  })

  ipcMain.on('pause-download', (_, id: string) => {
    downloader.pauseDownload(id)
  })

  ipcMain.on('cancel-download', (_, id: string) => {
    downloader.cancelDownload(id)
  })

  ipcMain.handle('skip-failed-m3u8-segments', async (_, cmd) => {
    return await downloader.skipFailedM3U8Segments(cmd)
  })

  ipcMain.handle('get-video-media-info', async (_, filePath: string) => {
    return await downloader.getVideoMediaInfo(filePath)
  })

  ipcMain.handle('compress-video-task', async (_, taskId: string, filePath: string, targetBitrateKbps: number) => {
    const res = await downloader.compressVideoTask(taskId, filePath, targetBitrateKbps)
    if (res && res.success) {
      broadcastFileSystemChange({
        type: 'overwrite',
        name: path.basename(filePath),
        path: filePath
      })
    }
    return res
  })

  ipcMain.handle('delete-file', async (_, filePath: string) => {
    if (!filePath) return false
    const targets = [
      filePath,
      filePath + '.temp.mp4',
      filePath + '.temp.ts',
      filePath + '.spill.bin',
      filePath + '.spill.meta.json',
      filePath + '.spill.meta.json.tmp',
      filePath + '.segs',
      filePath + '.temp',
      filePath + '.tmp',
      filePath + '.velora',
      filePath + '.ts',
      (() => {
        const parsed = path.parse(filePath)
        return path.join(parsed.dir, `${parsed.name}.compress_tmp.mp4`)
      })()
    ]
    let anyDeleted = false
    for (const targetPath of targets) {
      if (fs.existsSync(targetPath)) {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await fs.promises.rm(targetPath, { recursive: true, force: true })
            anyDeleted = true
            logger.info('Main', `Deleted file: ${targetPath}`)
            break
          } catch (e: any) {
            if (attempt < 4) {
              await new Promise(r => setTimeout(r, 150))
            } else {
              logger.error('Main', `Failed to delete file ${targetPath}: ${e.message}`)
            }
          }
        }
      }
    }
    if (anyDeleted) {
      broadcastFileSystemChange({
        type: 'delete',
        path: filePath,
        isDirectory: false
      })
    }
    return anyDeleted
  })

  ipcMain.handle('file-exists', async (_, filePath: string) => {
    return checkTargetOrTempExists(filePath)
  })

  ipcMain.handle('files-exist-batch', async (_, filePaths: string[]) => {
    const resMap: Record<string, boolean> = {}
    if (!Array.isArray(filePaths) || filePaths.length === 0) return resMap
    const uniquePaths = Array.from(new Set(filePaths.filter((p) => typeof p === 'string' && p.length > 0)))
    const BATCH_LIMIT = 24
    for (let i = 0; i < uniquePaths.length; i += BATCH_LIMIT) {
      const slice = uniquePaths.slice(i, i + BATCH_LIMIT)
      await Promise.all(
        slice.map(async (p) => {
          resMap[p] = await checkTargetOrTempExists(p)
        })
      )
    }
    return resMap
  })
}
