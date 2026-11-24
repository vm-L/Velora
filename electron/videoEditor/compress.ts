import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import {
  getAvailableEncoders,
  getEncoderArgs,
  isGpuEncoder,
  getFfmpegThrottleConfig
} from '../gpuAccelerator'
import type { CompressVideoParams } from './types'
import {
  cancelledTasks,
  checkDiskSpace,
  moveOrCopyFile,
  getAppTempDir,
  runFfmpegCommand
} from './runtime'
import { probeVideo } from './probe'

/**
 * 视频单片/目标码率压缩处理函数 (支持 GPU 硬件加速优先与 CPU 自动回退)
 */
export async function compressVideo(
  params: CompressVideoParams,
  onProgress?: (percent: number, text: string) => void
): Promise<{ success: boolean; outputPath?: string; newSize?: number; error?: string }> {
  const { taskId, filePath, targetBitrateKbps, outputPath, mode = 'saveAs' } = params

  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: '源视频文件不存在' }
  }

  const tmpDir = getAppTempDir()
  const outExt = path.extname(filePath) || '.mp4'
  const randToken = Math.random().toString(36).substring(2, 7)
  const tempOutputFile = path.join(tmpDir, `velora_compress_${Date.now()}_${randToken}_final${outExt}`)
  const tempFilesToClean: string[] = [tempOutputFile]

  // 双重磁盘空间预检：应用目录预留压缩过程空间，目标目录预留最终文件空间
  const sourceBytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
  const appSpaceCheck = checkDiskSpace(tmpDir, Math.max(sourceBytes * 0.8, 50 * 1024 * 1024))
  if (!appSpaceCheck.ok) {
    return { success: false, error: `应用临时目录空间不足: ${appSpaceCheck.error}` }
  }

  const destDir = mode === 'replace' ? path.dirname(filePath) : path.dirname(outputPath || filePath)
  if (destDir !== tmpDir) {
    const destSpaceCheck = checkDiskSpace(destDir, Math.max(sourceBytes * 0.6, 20 * 1024 * 1024))
    if (!destSpaceCheck.ok) {
      return { success: false, error: `目标磁盘空间不足: ${destSpaceCheck.error}` }
    }
  }

  let origStats: fs.Stats | null = null
  try {
    origStats = fs.statSync(filePath)
  } catch {}

  try {
    onProgress?.(3, '正在分析视频时长与元数据')

    const info = await probeVideo(filePath)
    const duration = info.duration || 1

    if (cancelledTasks.has(taskId)) {
      return { success: false, error: '操作已取消' }
    }

    const encoders = await getAvailableEncoders()
    const throttle = await getFfmpegThrottleConfig('manualCompress')
    const throttleDesc = throttle.enabled && throttle.readrate
      ? `限速 ${throttle.readrate}x`
      : '全速'
    let compressSuccess = false
    let lastError = ''

    for (const encoder of encoders) {
      if (cancelledTasks.has(taskId)) {
        return { success: false, error: '操作已取消' }
      }
      if (fs.existsSync(tempOutputFile)) {
        try { fs.unlinkSync(tempOutputFile) } catch {}
      }

      const encArgs = getEncoderArgs(encoder, { mode: 'bitrate', bitrateKbps: targetBitrateKbps })
      const args = [
        '-y',
        '-progress', 'pipe:1',
        ...throttle.inputArgs,
        '-i', filePath,
        ...encArgs,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        tempOutputFile
      ]

      const isGpu = isGpuEncoder(encoder)
      logger.info('VideoEditor', `压缩视频任务 [${taskId}] 尝试使用编码器 [${encoder}] (${isGpu ? 'GPU硬件加速' : 'CPU'}, ${throttleDesc}) [目标码率: ${targetBitrateKbps}kbps]`)

      const result = await runFfmpegCommand(taskId, args, (sec) => {
        const pct = Math.min(95, Math.max(5, Math.round(5 + (sec / duration) * 90)))
        onProgress?.(pct, `正在压缩视频 (${isGpu ? 'GPU加速' : 'CPU'})`)
      })

      if (result.success && fs.existsSync(tempOutputFile) && fs.statSync(tempOutputFile).size > 0) {
        compressSuccess = true
        break
      } else {
        lastError = result.error || result.stderr || ''
        logger.warn('VideoEditor', `编码器 [${encoder}] 压缩失败: ${lastError}，尝试下一个可用编码器`)
      }
    }

    if (!compressSuccess) {
      if (cancelledTasks.has(taskId)) {
        return { success: false, error: '操作已取消' }
      }
      return { success: false, error: `视频压缩失败: ${lastError}` }
    }

    const newSize = fs.statSync(tempOutputFile).size
    if (newSize === 0) {
      return { success: false, error: '压缩产物大小为 0' }
    }

    onProgress?.(98, mode === 'replace' ? '正在覆盖保存原文件' : '正在写入目标文件')

    let finalTargetPath = filePath
    if (mode === 'saveAs' && outputPath) {
      finalTargetPath = outputPath
      const outDir = path.dirname(outputPath)
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true })
      }
      moveOrCopyFile(tempOutputFile, outputPath)
    } else {
      fs.copyFileSync(tempOutputFile, filePath)
      if (origStats) {
        try {
          fs.utimesSync(filePath, origStats.atime, origStats.mtime)
        } catch {}
      }
    }

    onProgress?.(100, '压缩完成！')
    return { success: true, outputPath: finalTargetPath, newSize }
  } catch (err: any) {
    logger.error('VideoEditor', `视频压缩异常: ${err.message}`)
    return { success: false, error: err.message || '未知压缩错误' }
  } finally {
    cancelledTasks.delete(taskId)
    for (const file of tempFilesToClean) {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file)
        } catch {
          // ignore
        }
      }
    }
  }
}
