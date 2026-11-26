import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { lanServer } from '../../lanServer'
import { logger } from '../../logger'
import { copyDirRecursive, retryFileOperation, scanDirectory, searchDirectoryRecursive } from '../../utils/fileSystem'
import { auditHighBitrateVideos, type AuditHighBitrateParams } from '../../videoEditor'
import { releaseLocalMediaStreams } from '../mediaStreamServer'
import { broadcastFileSystemChange } from '../windowManager'

export function registerLocalFsIpc(): void {
  ipcMain.handle('move-file', async (_event, oldPath: string, newPath: string, options?: { autoRename?: boolean }) => {
    try {
      if (!oldPath || !newPath) {
        return { success: false, error: '文件路径不能为空' }
      }
      let isDir = false
      try {
        const stat = await fs.promises.stat(oldPath)
        isDir = stat.isDirectory()
      } catch {}

      // 1. 操作前主动释放所有关联媒体读流句柄（涵盖单文件及父目录场景）
      releaseLocalMediaStreams(oldPath)
      if (lanServer && typeof lanServer.releaseStreams === 'function') {
        lanServer.releaseStreams(oldPath)
      }

      const newDir = path.dirname(newPath)
      await fs.promises.mkdir(newDir, { recursive: true })

      let finalDestPath = newPath
      if (options?.autoRename && fs.existsSync(finalDestPath) && path.resolve(oldPath).toLowerCase() !== path.resolve(finalDestPath).toLowerCase()) {
        const parsed = path.parse(finalDestPath)
        let counter = 1
        while (fs.existsSync(finalDestPath)) {
          const candidateName = isDir ? `${parsed.name} (${counter})` : `${parsed.name} (${counter})${parsed.ext}`
          finalDestPath = path.join(parsed.dir, candidateName)
          counter++
        }
      }

      // 2. 带毫秒级退避重试执行重命名/移动，平滑抵御 Windows 句柄异步释放延迟
      await retryFileOperation(async () => {
        try {
          await fs.promises.rename(oldPath, finalDestPath)
        } catch (err: any) {
          if (err.code === 'EXDEV') {
            if (isDir) {
              await copyDirRecursive(oldPath, finalDestPath)
              await fs.promises.rm(oldPath, { recursive: true, force: true })
            } else {
              await fs.promises.copyFile(oldPath, finalDestPath)
              await fs.promises.unlink(oldPath)
            }
          } else {
            throw err
          }
        }
      })

      broadcastFileSystemChange({
        type: path.dirname(oldPath) === path.dirname(finalDestPath) ? 'rename' : 'move',
        oldPath,
        newPath: finalDestPath,
        name: path.basename(finalDestPath),
        isDirectory: isDir
      })

      return { success: true, finalPath: finalDestPath }
    } catch (err: any) {
      logger.error('Main', `Failed to move/rename file from ${oldPath} to ${newPath}: ${err.message}`)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('get-directory-tree', async (_event, rootDir: string, maxDepth: number = 3) => {
    try {
      if (!rootDir || !fs.existsSync(rootDir)) {
        return []
      }

      interface DirItem {
        path: string
        name: string
        depth: number
      }

      const results: DirItem[] = []

      const scan = async (currentDir: string, depth: number) => {
        if (depth > maxDepth) return
        try {
          const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const fullPath = path.join(currentDir, entry.name)
              results.push({
                path: fullPath,
                name: entry.name,
                depth
              })
              await scan(fullPath, depth + 1)
            }
          }
        } catch (err: any) {
          logger.error('Main', `Error scanning directory ${currentDir}: ${err.message}`)
        }
      }

      const rootName = path.basename(rootDir) || rootDir
      results.push({
        path: rootDir,
        name: `默认目录 (${rootName})`,
        depth: 0
      })

      await scan(rootDir, 1)
      return results
    } catch (err: any) {
      logger.error('Main', `Failed to get directory tree for ${rootDir}: ${err.message}`)
      return []
    }
  })

  ipcMain.handle('scan-directory-media-files', async (_event, rootDir: string, maxDepth: number = 3) => {
    try {
      if (!rootDir || !fs.existsSync(rootDir)) {
        return []
      }

      const MEDIA_EXTS = new Set([
        'mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'f4v', 'm4v', 'ts', 'm3u8', '3gp', '3g2', 'wmv', 'asf', 'vob', 'mpg', 'mpeg', 'ogv',
        'mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'aiff', 'ape', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'
      ])

      interface ExistingMediaFile {
        name: string
        path: string
        dir: string
        relativeDir: string
      }

      const results: ExistingMediaFile[] = []

      const scan = async (currentDir: string, depth: number) => {
        if (depth > maxDepth) return
        try {
          const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue
            const fullPath = path.join(currentDir, entry.name)
            if (entry.isDirectory()) {
              await scan(fullPath, depth + 1)
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase().replace(/^\./, '')
              if (MEDIA_EXTS.has(ext)) {
                const rel = path.relative(rootDir, currentDir).replace(/\\/g, '/')
                results.push({
                  name: entry.name,
                  path: fullPath.replace(/\\/g, '/'),
                  dir: currentDir.replace(/\\/g, '/'),
                  relativeDir: rel || '.'
                })
              }
            }
          }
        } catch (err: any) {
          logger.warn('Main', `Error scanning media files in ${currentDir}: ${err.message}`)
        }
      }

      await scan(rootDir, 1)
      return results
    } catch (err: any) {
      logger.error('Main', `Failed to scan media files for ${rootDir}: ${err.message}`)
      return []
    }
  })

  ipcMain.handle('scan-directories-all-files', async (_event, rootDirs: string[], maxDepth: number = 5) => {
    try {
      if (!Array.isArray(rootDirs) || rootDirs.length === 0) {
        return []
      }

      const uniqueRoots = Array.from(new Set(rootDirs.filter(d => typeof d === 'string' && d.trim() && fs.existsSync(d))))
      if (uniqueRoots.length === 0) {
        return []
      }

      interface ScannedFile {
        name: string
        path: string
      }

      const results: ScannedFile[] = []
      const visitedPaths = new Set<string>()

      const scan = async (currentDir: string, depth: number) => {
        if (depth > maxDepth) return
        try {
          const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue
            const fullPath = path.join(currentDir, entry.name)
            const normalizedPath = fullPath.replace(/\\/g, '/')

            if (visitedPaths.has(normalizedPath)) continue
            visitedPaths.add(normalizedPath)

            if (entry.isDirectory()) {
              await scan(fullPath, depth + 1)
            } else if (entry.isFile()) {
              if (/\.(temp|tmp|crdownload|velora)(\.[a-zA-Z0-9]+)?$/i.test(entry.name)) {
                continue
              }
              results.push({
                name: entry.name,
                path: normalizedPath
              })
            }
          }
        } catch (err: any) {
          logger.warn('Main', `Error scanning directory ${currentDir}: ${err.message}`)
        }
      }

      await Promise.all(uniqueRoots.map(root => scan(root, 1)))
      return results
    } catch (err: any) {
      logger.error('Main', `Failed to batch scan directories for files: ${err.message}`)
      return []
    }
  })

  ipcMain.handle('read-local-directory', async (_event, dirPath: string) => {
    const res = await scanDirectory(dirPath)
    if (!res.success) {
      logger.error('Main', `Failed to read directory ${dirPath}: ${res.error}`)
    } else {
      const files = res.items
        .filter(item => !item.isDirectory)
        .map(item => ({ name: item.name, path: item.path }))
      broadcastFileSystemChange({
        type: 'sync-dir',
        dirPath: dirPath.replace(/\\/g, '/'),
        files
      })
    }
    return res
  })

  ipcMain.handle('search-local-files', async (_event, dirPath: string, query: string) => {
    const res = await searchDirectoryRecursive(dirPath, query)
    if (!res.success) {
      logger.error('Main', `Failed to search directory ${dirPath} for "${query}": ${res.error}`)
    }
    return res
  })

  ipcMain.handle('create-local-folder', async (_event, folderPath: string) => {
    try {
      if (!folderPath) return { success: false, error: '路径不能为空' }
      if (fs.existsSync(folderPath)) {
        return { success: false, error: '同名文件夹已存在' }
      }
      await fs.promises.mkdir(folderPath, { recursive: true })
      return { success: true }
    } catch (err: any) {
      logger.error('Main', `Failed to create folder ${folderPath}: ${err.message}`)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('delete-local-path', async (_event, targetPath: string) => {
    try {
      if (!targetPath || !fs.existsSync(targetPath)) return { success: false, error: '文件或目录不存在' }
      let isDir = false
      try {
        const stat = await fs.promises.stat(targetPath)
        isDir = stat.isDirectory()
      } catch {}

      // 1. 操作前主动释放所有关联媒体读流句柄
      releaseLocalMediaStreams(targetPath)
      if (lanServer && typeof lanServer.releaseStreams === 'function') {
        lanServer.releaseStreams(targetPath)
      }

      // 2. 带毫秒级退避重试执行删除
      await retryFileOperation(async () => {
        await fs.promises.rm(targetPath, { recursive: true, force: true })
      })

      broadcastFileSystemChange({
        type: 'delete',
        path: targetPath,
        name: path.basename(targetPath),
        isDirectory: isDir
      })
      return { success: true }
    } catch (err: any) {
      logger.error('Main', `Failed to delete local path ${targetPath}: ${err.message}`)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('scan-local-videos', async (_event, targetPaths: string[]) => {
    const VIDEO_EXTS = new Set([
      'mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'f4v', 'm4v', 'ts', 'm3u8',
      '3gp', '3g2', 'wmv', 'asf', 'vob', 'mpg', 'mpeg', 'ogv'
    ])
    const results: Array<{ name: string; path: string; size: number }> = []

    const scanPath = async (p: string) => {
      try {
        if (!fs.existsSync(p)) return
        const stat = await fs.promises.stat(p)
        if (stat.isDirectory()) {
          const entries = await fs.promises.readdir(p, { withFileTypes: true })
          for (const entry of entries) {
            const subPath = path.join(p, entry.name)
            await scanPath(subPath)
          }
        } else {
          const ext = path.extname(p).toLowerCase().replace(/^\./, '')
          if (VIDEO_EXTS.has(ext)) {
            results.push({
              name: path.basename(p),
              path: p.replace(/\\/g, '/'),
              size: stat.size
            })
          }
        }
      } catch (err: any) {
        logger.warn('Main', `[ScanVideos] Skip ${p}: ${err.message}`)
      }
    }

    if (Array.isArray(targetPaths)) {
      for (const p of targetPaths) {
        if (p) await scanPath(p)
      }
    }

    // Deduplicate by path
    const uniqueMap = new Map<string, { name: string; path: string; size: number }>()
    for (const item of results) {
      uniqueMap.set(item.path, item)
    }

    return { success: true, videos: Array.from(uniqueMap.values()) }
  })

  ipcMain.handle('audit-high-bitrate-videos', async (_event, params: AuditHighBitrateParams) => {
    return await auditHighBitrateVideos(params)
  })
}
