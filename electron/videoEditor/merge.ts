import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import {
  getAvailableEncoders,
  getEncoderArgs,
  isGpuEncoder
} from '../gpuAccelerator'
import type { MergeVideosParams, ProbeResult } from './types'
import {
  cancelledTasks,
  checkDiskSpace,
  moveOrCopyFile,
  getAppTempDir,
  runFfmpegCommand
} from './runtime'
import { getVideoDuration, probeVideo } from './probe'

async function executeFilterComplexMerge(
  taskId: string,
  videoPaths: string[],
  videoInfos: ProbeResult[],
  targetWidth: number,
  targetHeight: number,
  targetFps: number,
  totalDuration: number,
  tempOutputFile: string,
  maxrateKbps?: number,
  onProgress?: (percent: number, text: string) => void
): Promise<{ success: boolean; error?: string }> {
  const encoders = await getAvailableEncoders()
  let lastError = ''

  for (const encoder of encoders) {
    if (cancelledTasks.has(taskId)) {
      return { success: false, error: '操作已取消' }
    }
    if (fs.existsSync(tempOutputFile)) {
      try { fs.unlinkSync(tempOutputFile) } catch {}
    }

    const filterParts: string[] = []
    const concatInputs: string[] = []

    for (let i = 0; i < videoPaths.length; i++) {
      const info = videoInfos[i]
      filterParts.push(
        `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${targetFps}[v${i}]`
      )

      if (info.hasAudio) {
        filterParts.push(
          `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,aresample=async=1000[a${i}]`
        )
      } else {
        const dur = Math.max(0.1, info.duration || 1)
        filterParts.push(
          `aevalsrc=0:d=${dur.toFixed(3)}:s=44100[a${i}]`
        )
      }

      concatInputs.push(`[v${i}][a${i}]`)
    }

    filterParts.push(`${concatInputs.join('')}concat=n=${videoPaths.length}:v=1:a=1[outv][outa]`)
    const filterComplexStr = filterParts.join('; ')

    const encArgs = getEncoderArgs(encoder, { mode: 'quality', maxrateKbps })

    const filterArgs = [
      '-y',
      '-progress', 'pipe:1',
      ...videoPaths.flatMap(p => ['-i', p]),
      '-filter_complex', filterComplexStr,
      '-map', '[outv]',
      '-map', '[outa]',
      ...encArgs,
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      tempOutputFile
    ]

    const isGpu = isGpuEncoder(encoder)
    logger.info('VideoEditor', `合并视频尝试使用编码器 [${encoder}] (${isGpu ? 'GPU硬件加速' : 'CPU'})${maxrateKbps ? ` [码率上限: ${maxrateKbps}kbps]` : ''}`)

    const result = await runFfmpegCommand(taskId, filterArgs, (sec) => {
      let pct: number
      if (totalDuration > 0) {
        pct = Math.min(95, Math.max(10, Math.round(10 + (sec / totalDuration) * 85)))
      } else {
        pct = Math.min(90, Math.max(10, Math.round(10 + sec * 2)))
      }
      onProgress?.(pct, `正在智能转码合并 (${isGpu ? 'GPU加速' : 'CPU'})`)
    })

    if (result.success && fs.existsSync(tempOutputFile) && fs.statSync(tempOutputFile).size > 0) {
      return { success: true }
    } else {
      lastError = result.error || result.stderr || ''
      logger.warn('VideoEditor', `编码器 [${encoder}] 合并失败: ${lastError}，尝试下一个可用编码器`)
    }
  }

  return { success: false, error: lastError || '所有编码器转码合并均失败' }
}

/**
 * 合并多个视频文件（优先 -c copy + 时长校验，异常自动降级为统一规格转码合并）
 */
export async function mergeVideos(
  params: MergeVideosParams,
  onProgress?: (percent: number, text: string) => void
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const { taskId, videoPaths, outputPath } = params

  if (!videoPaths || videoPaths.length < 2) {
    return { success: false, error: '至少需要提供 2 个视频文件进行合并' }
  }

  for (const vp of videoPaths) {
    if (!fs.existsSync(vp)) {
      return { success: false, error: `源文件不存在: ${vp}` }
    }
  }

  if (!outputPath) {
    return { success: false, error: '未指定目标输出路径' }
  }

  const tmpDir = getAppTempDir()
  const outExt = path.extname(outputPath) || '.mp4'
  const randToken = Math.random().toString(36).substring(2, 7)
  const tempOutputFile = path.join(tmpDir, `velora_merge_${Date.now()}_${randToken}_final${outExt}`)
  const concatListFile = path.join(tmpDir, `velora_merge_${Date.now()}_${randToken}_concat.txt`)
  const tempFilesToClean: string[] = [tempOutputFile, concatListFile]

  // 双重磁盘空间预检：应用目录预留过程合并空间，目标目录预留最终文件空间
  const totalInputBytes = videoPaths.reduce((sum, p) => {
    try {
      return sum + (fs.existsSync(p) ? fs.statSync(p).size : 0)
    } catch {
      return sum
    }
  }, 0)
  const appSpaceCheck = checkDiskSpace(tmpDir, Math.max(totalInputBytes * 1.1, 50 * 1024 * 1024))
  if (!appSpaceCheck.ok) {
    return { success: false, error: `应用临时目录空间不足: ${appSpaceCheck.error}` }
  }

  const destDir = path.dirname(outputPath)
  if (destDir !== tmpDir) {
    const destSpaceCheck = checkDiskSpace(destDir, Math.max(totalInputBytes * 0.9, 30 * 1024 * 1024))
    if (!destSpaceCheck.ok) {
      return { success: false, error: `目标磁盘空间不足: ${destSpaceCheck.error}` }
    }
  }

  try {
    onProgress?.(2, '正在分析视频时长与元数据')

    const videoInfos: ProbeResult[] = []
    let totalDuration = 0
    for (const vp of videoPaths) {
      if (cancelledTasks.has(taskId)) {
        return { success: false, error: '操作已取消' }
      }
      const info = await probeVideo(vp)
      videoInfos.push(info)
      totalDuration += info.duration
    }

    if (cancelledTasks.has(taskId)) {
      return { success: false, error: '操作已取消' }
    }

    // 计算原片平均码率并设置 1.15x 码率上限余量，兼顾画质并防止体积膨胀
    const avgBitrateKbps = totalDuration > 0 && totalInputBytes > 0
      ? Math.round(((totalInputBytes * 8) / totalDuration) / 1000)
      : 2500
    const capBitrateKbps = Math.max(500, Math.round(avgBitrateKbps * 1.15))

    const maxWidth = Math.max(...videoInfos.map(i => i.width || 1280), 640)
    const maxHeight = Math.max(...videoInfos.map(i => i.height || 720), 360)
    const targetWidth = maxWidth % 2 === 0 ? maxWidth : maxWidth + 1
    const targetHeight = maxHeight % 2 === 0 ? maxHeight : maxHeight + 1
    const maxFps = Math.max(...videoInfos.map(i => i.fps || 30))
    const targetFps = Math.min(60, Math.max(24, Math.round(maxFps)))

    // 生成 concat 描述文件 (路径统一转为正斜杠并对单引号进行转义)
    const concatContent = videoPaths
      .map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n')
    fs.writeFileSync(concatListFile, concatContent, 'utf-8')

    onProgress?.(5, '正在合并视频')

    // 1. 尝试快速无损流复制合并 (-c copy)
    const copyArgs = [
      '-y',
      '-progress', 'pipe:1',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListFile,
      '-c', 'copy',
      '-movflags', '+faststart',
      tempOutputFile
    ]

    const result = await runFfmpegCommand(taskId, copyArgs, (sec) => {
      let pct: number
      if (totalDuration > 0) {
        pct = Math.min(95, Math.max(5, Math.round(5 + (sec / totalDuration) * 90)))
      } else {
        pct = Math.min(90, Math.max(5, Math.round(5 + sec * 5)))
      }
      onProgress?.(pct, '正在合并视频')
    })

    // 严密校验流复制产物的时长是否准确（防止 DTS/PTS 漂移导致尾部产生大量不可播放空白）
    let isCopyValid = false
    if (result.success && fs.existsSync(tempOutputFile) && fs.statSync(tempOutputFile).size > 0) {
      const copyDuration = await getVideoDuration(tempOutputFile)
      if (totalDuration > 0 && Math.abs(copyDuration - totalDuration) <= 1.0) {
        isCopyValid = true
      } else {
        logger.warn('VideoEditor', `流复制合并后时长异常 (预期: ${totalDuration.toFixed(2)}s, 实际: ${copyDuration.toFixed(2)}s)，自动降级为转码合并`)
      }
    }

    // 2. 若流复制失败或时长异常且非用户主动取消，则无缝降级为精准 Filter Complex 重新编码合并
    if (!isCopyValid) {
      if (cancelledTasks.has(taskId)) {
        return { success: false, error: '操作已取消' }
      }

      if (fs.existsSync(tempOutputFile)) {
        try { fs.unlinkSync(tempOutputFile) } catch {}
      }

      onProgress?.(10, '正在智能转码合并 (保证精准时长与声画同步)')

      const filterResult = await executeFilterComplexMerge(
        taskId,
        videoPaths,
        videoInfos,
        targetWidth,
        targetHeight,
        targetFps,
        totalDuration,
        tempOutputFile,
        capBitrateKbps,
        onProgress
      )

      if (!filterResult.success) {
        if (cancelledTasks.has(taskId)) {
          return { success: false, error: '操作已取消' }
        }
        return { success: false, error: `视频合并失败: ${filterResult.error}` }
      }
    }

    if (!fs.existsSync(tempOutputFile) || fs.statSync(tempOutputFile).size === 0) {
      return { success: false, error: '生成合并文件失败，文件大小为 0' }
    }

    onProgress?.(98, '正在写入目标文件')

    const outDir = path.dirname(outputPath)
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }

    moveOrCopyFile(tempOutputFile, outputPath)

    onProgress?.(100, '合并完成！')
    return { success: true, outputPath }
  } catch (err: any) {
    logger.error('VideoEditor', `视频合并异常: ${err.message}`)
    return { success: false, error: err.message || '未知合并错误' }
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
