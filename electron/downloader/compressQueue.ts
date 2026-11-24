import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { storeManager } from '../store'
import { logger } from '../logger'
import {
  getAvailableEncoders,
  getEncoderArgs,
  VideoEncoder,
  isGpuEncoder,
  getFfmpegThrottleConfig,
  FfmpegThrottleConfig
} from '../gpuAccelerator'
import type { CompressQueueItem } from './types'

/**
 * 安全原子文件替换 (带备份与占用重试机制)
 * 1. 验证临时文件有效性
 * 2. 将目标原文件安全重命名为临时备份 .orig_bak_timestamp
 * 3. 将新临时文件重命名为目标文件（支持多次重试及跨卷/锁定时 copy+unlink 兜底）
 * 4. 成功后删除备份；若失败则立即从备份还原原文件，绝不丢失任何一方
 */
export async function safeAtomicReplace(sourceTempPath: string, targetFinalPath: string): Promise<boolean> {
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

export async function getVideoDurationAndBitrate(filePath: string): Promise<{ duration: number; bitrate: number }> {
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

export async function getVideoMediaInfo(filePath: string): Promise<{ duration: number; bitrate: number; size: number }> {
  if (!fs.existsSync(filePath)) {
    return { duration: 0, bitrate: 0, size: 0 }
  }
  const size = fs.statSync(filePath).size
  const info = await getVideoDurationAndBitrate(filePath)
  let bitrate = info.bitrate
  if (bitrate <= 0 && info.duration > 0) {
    bitrate = Math.round((size * 8) / info.duration)
  }
  return { duration: info.duration, bitrate, size }
}

export class VideoCompressQueue {
  private isCompressingActive = false
  private compressQueue: CompressQueueItem[] = []
  private activeCompressTaskId: string | null = null
  private activeCompressController: AbortController | null = null
  private activeCompressTempPath: string | null = null

  constructor(
    private readonly host: {
      sendProgress: (payload: any) => void
      onStatsChange: () => void
    }
  ) {}

  isTaskInCompress(id: string): boolean {
    return this.activeCompressTaskId === id || this.compressQueue.some(c => c.taskId === id)
  }

  getCompressingCount(): number {
    return (this.activeCompressTaskId ? 1 : 0) + this.compressQueue.length
  }

  getTaskIdsToPause(): string[] {
    const ids = this.compressQueue.map(c => c.taskId)
    if (this.activeCompressTaskId) {
      ids.push(this.activeCompressTaskId)
    }
    return ids
  }

  pauseTask(id: string): boolean {
    // 如果在待压缩队列中
    const compressQueueIndex = this.compressQueue.findIndex(c => c.taskId === id)
    if (compressQueueIndex !== -1) {
      const removed = this.compressQueue.splice(compressQueueIndex, 1)[0]
      this.host.sendProgress({ id, status: 'paused', speed: 0 })
      if (removed.resolve) {
        removed.resolve({ success: false, error: '压缩排队已取消' })
      }
      logger.info('Downloader', `[CompressQueue] 任务 ${id} 已从压缩排队队列中移除并暂停`)
      return true
    }

    // 如果当前正在压缩中
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
      this.host.sendProgress({ id, status: 'paused', speed: 0 })
      return true
    }

    return false
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
      const videoInfo = await getVideoDurationAndBitrate(filePath)
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
  async handlePostDownload(
    taskId: string,
    filePath: string,
    fileSize: number,
    totalSegments?: number,
    skippedSegments?: number,
    downloadedSegments?: number
  ): Promise<void> {
    const finalDownloadedSegments = downloadedSegments !== undefined ? downloadedSegments : totalSegments
    const { needCompress, targetBitrateKbps } = await this.evaluateAutoCompress(filePath, taskId)

    if (!needCompress) {
      logger.info('Downloader', `[Downloader] 任务 ${taskId} 无需压缩，直接标记完成。最终大小: ${fileSize}`)
      this.host.sendProgress({
        id: taskId,
        savePath: filePath,
        totalBytes: fileSize,
        receivedBytes: fileSize,
        downloadedSegments: finalDownloadedSegments,
        totalSegments: totalSegments,
        ...(skippedSegments && skippedSegments > 0 ? { skippedSegments } : {}),
        canSkipFailedSegments: false,
        failedSegmentsCount: 0,
        errorMsg: '',
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
      totalSegments,
      downloadedSegments: finalDownloadedSegments,
      ...(skippedSegments && skippedSegments > 0 ? { skippedSegments } : {})
    })
  }

  /**
   * 统一将压缩任务压入队列（单并发调度，完全不占用下载并发槽位）
   */
  private enqueueCompressTask(item: CompressQueueItem) {
    const effectiveDownloaded = item.downloadedSegments !== undefined ? item.downloadedSegments : item.totalSegments
    if (this.isCompressingActive) {
      logger.info('Downloader', `[CompressQueue] 当前已有压缩任务进行中，任务 ${item.taskId} 进入排队 (队列位置: ${this.compressQueue.length + 1})`)
      this.host.sendProgress({
        id: item.taskId,
        status: 'waiting',
        speedText: '等待压缩',
        progress: 100,
        downloadedSegments: effectiveDownloaded,
        totalSegments: item.totalSegments,
        ...(item.skippedSegments && item.skippedSegments > 0 ? { skippedSegments: item.skippedSegments } : {}),
        canSkipFailedSegments: false,
        failedSegmentsCount: 0,
        errorMsg: '',
        speed: 0
      })
      this.compressQueue.push(item)
      this.host.onStatsChange()
    } else {
      this.isCompressingActive = true
      this.activeCompressTaskId = item.taskId
      this.host.onStatsChange()
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

    const info = await getVideoMediaInfo(filePath)
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
    const { taskId, filePath, targetBitrateKbps, totalSegments, downloadedSegments, skippedSegments, resolve } = item
    const finalDownloadedSegments = downloadedSegments !== undefined ? downloadedSegments : totalSegments
    const skippedPayload = skippedSegments && skippedSegments > 0 ? { skippedSegments } : {}
    this.activeCompressTaskId = taskId
    this.activeCompressController = new AbortController()

    const dir = path.dirname(filePath)
    const parsed = path.parse(filePath)
    const tempCompressedPath = path.join(dir, `${parsed.name}.compress_tmp.mp4`)
    this.activeCompressTempPath = tempCompressedPath

    try {
      const currentSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
      const info = await getVideoDurationAndBitrate(filePath)

      this.host.sendProgress({
        id: taskId,
        status: 'compressing',
        progress: 0,
        speed: 0,
        downloadedSegments: finalDownloadedSegments,
        totalSegments: totalSegments,
        ...skippedPayload,
        canSkipFailedSegments: false,
        failedSegmentsCount: 0,
        errorMsg: ''
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
          this.host.sendProgress({
            id: taskId,
            savePath: filePath,
            status: 'completed',
            progress: 100,
            receivedBytes: compressedSize,
            totalBytes: compressedSize,
            downloadedSegments: finalDownloadedSegments,
            totalSegments: totalSegments,
            ...skippedPayload,
            canSkipFailedSegments: false,
            failedSegmentsCount: 0,
            errorMsg: '',
            speed: 0
          })

          if (resolve) resolve({ success: true, newSize: compressedSize })
        } else {
          logger.error('Downloader', `[CompressTask] 任务 ${taskId} 文件安全替换失败，已完整保留原文件`)
          this.host.sendProgress({
            id: taskId,
            savePath: filePath,
            status: 'completed',
            progress: 100,
            receivedBytes: currentSize,
            totalBytes: currentSize,
            downloadedSegments: finalDownloadedSegments,
            totalSegments: totalSegments,
            ...skippedPayload,
            canSkipFailedSegments: false,
            failedSegmentsCount: 0,
            errorMsg: '',
            speed: 0
          })
          if (resolve) resolve({ success: false, error: '文件替换失败（文件可能被其他程序占用），原视频已安全保留' })
        }
      } else {
        logger.warn('Downloader', `[CompressTask] 任务 ${taskId} 压缩未成功，保留原始文件`)
        try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}

        this.host.sendProgress({
          id: taskId,
          savePath: filePath,
          status: 'completed',
          progress: 100,
          receivedBytes: currentSize,
          totalBytes: currentSize,
          downloadedSegments: finalDownloadedSegments,
          totalSegments: totalSegments,
          ...skippedPayload,
          canSkipFailedSegments: false,
          failedSegmentsCount: 0,
          errorMsg: '',
          speed: 0
        })

        if (resolve) resolve({ success: false, error: lastCompressError || '压缩未能完成' })
      }
    } catch (err: any) {
      logger.error('Downloader', `[CompressTask] 任务 ${taskId} 异常: ${err.message}`)
      try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}
      this.host.sendProgress({
        id: taskId,
        status: 'completed',
        progress: 100,
        receivedBytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        totalBytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        downloadedSegments: finalDownloadedSegments,
        totalSegments: totalSegments,
        ...skippedPayload,
        canSkipFailedSegments: false,
        failedSegmentsCount: 0,
        errorMsg: '',
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
      this.host.onStatsChange()
      this.executeCompressQueueItem(nextItem)
    } else {
      this.isCompressingActive = false
      this.activeCompressTaskId = null
      this.activeCompressController = null
      this.activeCompressTempPath = null
      this.host.onStatsChange()
    }
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

          this.host.sendProgress({
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
