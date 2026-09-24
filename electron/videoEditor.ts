import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from './logger'
import { getAvailableEncoders, getEncoderArgs, isGpuEncoder, VideoEncoder } from './gpuAccelerator'

export interface VideoSegment {
  start: number
  end: number
}

export interface EditVideoParams {
  taskId: string
  sourcePath: string
  segments: VideoSegment[]
  outputPath?: string
  mode: 'replace' | 'saveAs'
}

export interface MergeVideosParams {
  taskId: string
  videoPaths: string[]
  outputPath: string
}

const activeEditingProcesses = new Map<string, ChildProcess>()
const cancelledTasks = new Set<string>()

export function cancelVideoEdit(taskId: string): boolean {
  cancelledTasks.add(taskId)
  const proc = activeEditingProcesses.get(taskId)
  if (proc) {
    try {
      proc.kill('SIGKILL')
    } catch {
      // ignore
    }
    activeEditingProcesses.delete(taskId)
    return true
  }
  return false
}

export const cancelVideoMerge = cancelVideoEdit

function getTempDir(): string {
  let baseDir = process.cwd()
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    baseDir = process.env.PORTABLE_EXECUTABLE_DIR
  } else if (app && typeof app.getPath === 'function') {
    try {
      baseDir = app.getPath('userData')
    } catch {
      // ignore
    }
  }
  const tmpDir = path.join(baseDir, 'tmp')
  if (!fs.existsSync(tmpDir)) {
    try {
      fs.mkdirSync(tmpDir, { recursive: true })
    } catch {
      // ignore
    }
  }
  return tmpDir
}

export async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-i', filePath])
    let stderr = ''
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('close', () => {
      let duration = 0
      const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
      if (durationMatch) {
        const hours = parseFloat(durationMatch[1])
        const mins = parseFloat(durationMatch[2])
        const secs = parseFloat(durationMatch[3])
        duration = hours * 3600 + mins * 60 + secs
      }
      resolve(duration)
    })
    child.on('error', () => {
      resolve(0)
    })
  })
}

function runFfmpegCommand(
  taskId: string,
  args: string[],
  onProgress?: (progressSec: number) => void
): Promise<{ success: boolean; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args)
    activeEditingProcesses.set(taskId, proc)

    let stderrBuffer = ''
    let stdoutBuffer = ''

    proc.stderr.on('data', (chunk) => {
      const str = chunk.toString()
      stderrBuffer += str
      if (stderrBuffer.length > 8000) {
        stderrBuffer = stderrBuffer.substring(stderrBuffer.length - 8000)
      }
    })

    proc.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''

      let progressSec: number | null = null

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('out_time_us=')) {
          const val = parseInt(trimmed.substring(12), 10)
          if (!isNaN(val) && val >= 0) {
            progressSec = val / 1000000
          }
        } else if (trimmed.startsWith('out_time=')) {
          const timeParts = trimmed.substring(9).split(':')
          if (timeParts.length === 3) {
            const h = parseFloat(timeParts[0]) || 0
            const m = parseFloat(timeParts[1]) || 0
            const s = parseFloat(timeParts[2]) || 0
            const parsed = h * 3600 + m * 60 + s
            if (!isNaN(parsed) && parsed >= 0) {
              progressSec = parsed
            }
          }
        }
      }

      if (progressSec !== null && onProgress) {
        onProgress(progressSec)
      }
    })

    proc.on('close', (code) => {
      activeEditingProcesses.delete(taskId)
      if (code === 0) {
        resolve({ success: true, stderr: stderrBuffer })
      } else {
        resolve({ success: false, stderr: stderrBuffer, error: `FFmpeg exited with code ${code}` })
      }
    })

    proc.on('error', (err) => {
      activeEditingProcesses.delete(taskId)
      resolve({ success: false, stderr: stderrBuffer, error: err.message })
    })
  })
}

export async function editVideoSegments(
  params: EditVideoParams,
  onProgress?: (percent: number, text: string) => void
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const { taskId, sourcePath, segments, outputPath, mode } = params

  if (!fs.existsSync(sourcePath)) {
    return { success: false, error: `源文件不存在: ${sourcePath}` }
  }

  if (!segments || segments.length === 0) {
    return { success: false, error: '未提供剪辑区间' }
  }

  // 校验并清洗片段时间
  const cleanSegments = segments
    .map(s => ({
      start: Math.max(0, Number(s.start) || 0),
      end: Math.max(0, Number(s.end) || 0)
    }))
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start)

  if (cleanSegments.length === 0) {
    return { success: false, error: '剪辑区间的起始时间必须小于结束时间' }
  }

  const tmpDir = getTempDir()
  const ext = path.extname(sourcePath) || '.mp4'
  const tempOutputFile = path.join(tmpDir, `velora_edit_${Date.now()}_final${ext}`)
  const tempFilesToClean: string[] = [tempOutputFile]

  const totalSegmentDuration = cleanSegments.reduce((sum, s) => sum + (s.end - s.start), 0)

  // 覆盖保存模式下，预先记录源文件的访问时间与修改时间，以便保存后精准恢复，不破坏原有文件排序
  let origStats: fs.Stats | null = null
  if (mode === 'replace' && fs.existsSync(sourcePath)) {
    try {
      origStats = fs.statSync(sourcePath)
    } catch (err: any) {
      logger.warn('VideoEditor', `获取原文件时间戳失败: ${err.message}`)
    }
  }

  try {
    if (cleanSegments.length === 1) {
      const seg = cleanSegments[0]
      const segDuration = seg.end - seg.start
      onProgress?.(10, '正在截取视频片段')

      // 优先快速流复制模式
      const copyArgs = [
        '-y',
        '-progress', 'pipe:1',
        '-ss', seg.start.toFixed(3),
        '-to', seg.end.toFixed(3),
        '-i', sourcePath,
        '-c', 'copy',
        '-movflags', '+faststart',
        tempOutputFile
      ]

      let result = await runFfmpegCommand(taskId, copyArgs, (sec) => {
        const pct = Math.min(95, Math.round(10 + (sec / (segDuration || 1)) * 80))
        onProgress?.(pct, '正在截取视频片段')
      })

      // 若流复制失败则自动降级为 GPU 优先硬件加速重新编码
      if (!result.success || !fs.existsSync(tempOutputFile) || fs.statSync(tempOutputFile).size === 0) {
        logger.warn('VideoEditor', `流复制剪辑失败，降级为硬件加速重新编码: ${result.error || ''}`)
        const encoders = await getAvailableEncoders()
        let encodeSuccess = false
        let lastError = ''

        for (const encoder of encoders) {
          if (cancelledTasks.has(taskId)) {
            return { success: false, error: '操作已取消' }
          }
          if (fs.existsSync(tempOutputFile)) {
            try { fs.unlinkSync(tempOutputFile) } catch {}
          }

          const encArgs = getEncoderArgs(encoder, { mode: 'quality' })
          const encodeArgs = [
            '-y',
            '-progress', 'pipe:1',
            '-ss', seg.start.toFixed(3),
            '-to', seg.end.toFixed(3),
            '-i', sourcePath,
            ...encArgs,
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            tempOutputFile
          ]

          const isGpu = isGpuEncoder(encoder)
          logger.info('VideoEditor', `单片段剪辑尝试使用编码器 [${encoder}] (${isGpu ? 'GPU硬件加速' : 'CPU'})`)

          result = await runFfmpegCommand(taskId, encodeArgs, (sec) => {
            const pct = Math.min(95, Math.round(10 + (sec / (segDuration || 1)) * 80))
            onProgress?.(pct, `正在重新编码剪辑视频 (${isGpu ? 'GPU加速' : 'CPU'})`)
          })

          if (result.success && fs.existsSync(tempOutputFile) && fs.statSync(tempOutputFile).size > 0) {
            encodeSuccess = true
            break
          } else {
            lastError = result.error || result.stderr || ''
            logger.warn('VideoEditor', `编码器 [${encoder}] 剪辑失败: ${lastError}，尝试下一个可用编码器`)
          }
        }

        if (!encodeSuccess) {
          return { success: false, error: `剪辑处理失败: ${lastError}` }
        }
      }
    } else {
      // 多选段剪辑：依次裁切各片段后合并
      const segmentFiles: string[] = []

      for (let i = 0; i < cleanSegments.length; i++) {
        const seg = cleanSegments[i]
        const segDuration = seg.end - seg.start
        const segFile = path.join(tmpDir, `velora_edit_${Date.now()}_seg_${i}${ext}`)
        tempFilesToClean.push(segFile)
        segmentFiles.push(segFile)

        const startPct = Math.round(10 + (i / cleanSegments.length) * 60)
        const endPct = Math.round(10 + ((i + 1) / cleanSegments.length) * 60)
        onProgress?.(startPct, `正在截取片段 ${i + 1}/${cleanSegments.length}`)

        // 先尝试流复制切片
        let segArgs = [
          '-y',
          '-progress', 'pipe:1',
          '-ss', seg.start.toFixed(3),
          '-to', seg.end.toFixed(3),
          '-i', sourcePath,
          '-c', 'copy',
          '-avoid_negative_ts', '1',
          segFile
        ]

        let segRes = await runFfmpegCommand(taskId, segArgs, (sec) => {
          const currentPct = Math.min(endPct, Math.round(startPct + (sec / (segDuration || 1)) * (endPct - startPct)))
          onProgress?.(currentPct, `正在截取片段 ${i + 1}/${cleanSegments.length}`)
        })

        if (!segRes.success || !fs.existsSync(segFile) || fs.statSync(segFile).size === 0) {
          logger.warn('VideoEditor', `片段 ${i + 1} 流复制失败，使用硬件加速重新编码`)
          const encoders = await getAvailableEncoders()
          let segSuccess = false
          let lastSegError = ''

          for (const encoder of encoders) {
            if (cancelledTasks.has(taskId)) {
              return { success: false, error: '操作已取消' }
            }
            if (fs.existsSync(segFile)) {
              try { fs.unlinkSync(segFile) } catch {}
            }

            const encArgs = getEncoderArgs(encoder, { mode: 'quality' })
            segArgs = [
              '-y',
              '-progress', 'pipe:1',
              '-ss', seg.start.toFixed(3),
              '-to', seg.end.toFixed(3),
              '-i', sourcePath,
              ...encArgs,
              '-c:a', 'aac',
              '-b:a', '192k',
              segFile
            ]
            segRes = await runFfmpegCommand(taskId, segArgs)
            if (segRes.success && fs.existsSync(segFile) && fs.statSync(segFile).size > 0) {
              segSuccess = true
              break
            } else {
              lastSegError = segRes.error || segRes.stderr || ''
            }
          }

          if (!segSuccess) {
            return { success: false, error: `截取片段 ${i + 1} 失败: ${lastSegError}` }
          }
        }
      }

      onProgress?.(75, '正在合并多个片段')

      // 生成 concat 描述文件
      const concatListFile = path.join(tmpDir, `velora_edit_${Date.now()}_concat.txt`)
      tempFilesToClean.push(concatListFile)
      const concatContent = segmentFiles
        .map(f => `file '${f.replace(/\\/g, '/')}'`)
        .join('\n')
      fs.writeFileSync(concatListFile, concatContent, 'utf-8')

      // 执行合并
      const concatArgs = [
        '-y',
        '-progress', 'pipe:1',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListFile,
        '-c', 'copy',
        '-movflags', '+faststart',
        tempOutputFile
      ]

      let concatRes = await runFfmpegCommand(taskId, concatArgs, (sec) => {
        const pct = Math.min(95, Math.round(75 + (sec / (totalSegmentDuration || 1)) * 20))
        onProgress?.(pct, '正在合并所有片段')
      })

      if (!concatRes.success || !fs.existsSync(tempOutputFile) || fs.statSync(tempOutputFile).size === 0) {
        logger.warn('VideoEditor', 'Concat 流复制失败，降级为硬件加速重编码合并')
        const encoders = await getAvailableEncoders()
        let concatSuccess = false
        let lastConcatError = ''

        for (const encoder of encoders) {
          if (cancelledTasks.has(taskId)) {
            return { success: false, error: '操作已取消' }
          }
          if (fs.existsSync(tempOutputFile)) {
            try { fs.unlinkSync(tempOutputFile) } catch {}
          }

          const encArgs = getEncoderArgs(encoder, { mode: 'quality' })
          const reencodeConcatArgs = [
            '-y',
            '-progress', 'pipe:1',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListFile,
            ...encArgs,
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            tempOutputFile
          ]
          concatRes = await runFfmpegCommand(taskId, reencodeConcatArgs)
          if (concatRes.success && fs.existsSync(tempOutputFile) && fs.statSync(tempOutputFile).size > 0) {
            concatSuccess = true
            break
          } else {
            lastConcatError = concatRes.error || concatRes.stderr || ''
          }
        }

        if (!concatSuccess) {
          return { success: false, error: `合并片段失败: ${lastConcatError}` }
        }
      }
    }

    if (!fs.existsSync(tempOutputFile) || fs.statSync(tempOutputFile).size === 0) {
      return { success: false, error: '生成剪辑文件失败，文件大小为 0' }
    }

    onProgress?.(98, mode === 'replace' ? '正在覆盖保存原文件' : '正在写入目标文件')

    let finalTargetPath = sourcePath
    if (mode === 'saveAs' && outputPath) {
      finalTargetPath = outputPath
      const outDir = path.dirname(outputPath)
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true })
      }
      fs.copyFileSync(tempOutputFile, outputPath)
    } else {
      // 覆盖保存模式：先将临时文件复制替换原文件
      fs.copyFileSync(tempOutputFile, sourcePath)

      // 恢复原文件的修改时间与访问时间，不破坏系统的文件排序
      if (origStats) {
        try {
          fs.utimesSync(sourcePath, origStats.atime, origStats.mtime)
        } catch (err: any) {
          logger.warn('VideoEditor', `恢复原文件时间戳失败: ${err.message}`)
        }
      }
    }

    onProgress?.(100, '处理完成！')
    return { success: true, outputPath: finalTargetPath }
  } catch (err: any) {
    logger.error('VideoEditor', `视频剪辑异常: ${err.message}`)
    return { success: false, error: err.message || '未知剪辑错误' }
  } finally {
    cancelledTasks.delete(taskId)
    // 自动清理所有中间临时文件
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

interface ProbeResult {
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

async function probeVideoWithFfmpeg(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const fallbackChild = spawn('ffmpeg', ['-i', filePath])
    let stderr = ''
    fallbackChild.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    fallbackChild.on('close', () => {
      let duration = 0
      const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
      if (durationMatch) {
        const hours = parseFloat(durationMatch[1])
        const mins = parseFloat(durationMatch[2])
        const secs = parseFloat(durationMatch[3])
        duration = hours * 3600 + mins * 60 + secs
      }
      let width = 1280
      let height = 720
      const resMatch = stderr.match(/Stream #\d+:\d+.*Video:.*,\s*(\d{2,5})x(\d{2,5})/)
      if (resMatch) {
        width = parseInt(resMatch[1], 10)
        height = parseInt(resMatch[2], 10)
      }
      let fps = 30
      const fpsMatch = stderr.match(/,\s*(\d+(?:\.\d+)?)\s*fps/)
      if (fpsMatch) {
        fps = parseFloat(fpsMatch[1])
      }
      const hasAudio = /Stream #\d+:\d+.*Audio:/.test(stderr)
      resolve({
        duration,
        width,
        height,
        fps: fps > 0 ? fps : 30,
        hasAudio
      })
    })
    fallbackChild.on('error', () => {
      resolve({ duration: 0, width: 1280, height: 720, fps: 30, hasAudio: true })
    })
  })
}

async function probeVideo(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let resolved = false
    const safeResolve = (res: ProbeResult) => {
      if (!resolved) {
        resolved = true
        resolve(res)
      }
    }

    try {
      const child = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-show_entries', 'stream=codec_type,width,height,r_frame_rate',
        '-of', 'json',
        filePath
      ])
      let stdout = ''
      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })
      child.on('close', async (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const json = JSON.parse(stdout)
            const formatDuration = parseFloat(json?.format?.duration) || 0
            const streams = json?.streams || []
            const videoStream = streams.find((s: any) => s.codec_type === 'video')
            const audioStream = streams.find((s: any) => s.codec_type === 'audio')

            let width = videoStream?.width || 1280
            let height = videoStream?.height || 720
            let fps = 30
            if (videoStream?.r_frame_rate) {
              const parts = videoStream.r_frame_rate.split('/')
              if (parts.length === 2 && parseFloat(parts[1]) > 0) {
                fps = Math.round((parseFloat(parts[0]) / parseFloat(parts[1])) * 100) / 100
              } else if (parseFloat(videoStream.r_frame_rate) > 0) {
                fps = parseFloat(videoStream.r_frame_rate)
              }
            }
            if (formatDuration > 0) {
              return safeResolve({
                duration: formatDuration,
                width,
                height,
                fps: fps > 0 ? fps : 30,
                hasAudio: !!audioStream
              })
            }
          } catch {
            // ignore
          }
        }
        // Fallback to ffmpeg -i parsing
        const fallbackRes = await probeVideoWithFfmpeg(filePath)
        safeResolve(fallbackRes)
      })
      child.on('error', async () => {
        const fallbackRes = await probeVideoWithFfmpeg(filePath)
        safeResolve(fallbackRes)
      })
    } catch {
      probeVideoWithFfmpeg(filePath).then(safeResolve)
    }
  })
}

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

  const tmpDir = getTempDir()
  const outExt = path.extname(outputPath) || '.mp4'
  const tempOutputFile = path.join(tmpDir, `velora_merge_${Date.now()}_final${outExt}`)
  const concatListFile = path.join(tmpDir, `velora_merge_${Date.now()}_concat.txt`)
  const tempFilesToClean: string[] = [tempOutputFile, concatListFile]

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

    // 统计输入源文件总大小并计算原片平均码率
    const totalInputBytes = videoPaths.reduce((sum, p) => {
      try {
        return sum + (fs.existsSync(p) ? fs.statSync(p).size : 0)
      } catch {
        return sum
      }
    }, 0)
    const avgBitrateKbps = totalDuration > 0 && totalInputBytes > 0
      ? Math.round(((totalInputBytes * 8) / totalDuration) / 1000)
      : 2500
    // 允许 1.15x 上限余量以保障二次重编码画质，同时彻底防止体积虚高翻倍
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

    let result = await runFfmpegCommand(taskId, copyArgs, (sec) => {
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

    try {
      fs.renameSync(tempOutputFile, outputPath)
    } catch (err: any) {
      if (err.code === 'EXDEV') {
        fs.copyFileSync(tempOutputFile, outputPath)
        try { fs.unlinkSync(tempOutputFile) } catch {}
      } else {
        throw err
      }
    }

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

export interface CompressVideoParams {
  taskId: string
  filePath: string
  targetBitrateKbps: number
  outputPath?: string
  mode?: 'replace' | 'saveAs'
}

export const cancelVideoCompress = cancelVideoEdit

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

  const tmpDir = getTempDir()
  const outExt = path.extname(filePath) || '.mp4'
  const tempOutputFile = path.join(tmpDir, `velora_compress_${Date.now()}_out${outExt}`)
  const tempFilesToClean: string[] = [tempOutputFile]

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
        '-i', filePath,
        ...encArgs,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        tempOutputFile
      ]

      const isGpu = isGpuEncoder(encoder)
      logger.info('VideoEditor', `压缩视频任务 [${taskId}] 尝试使用编码器 [${encoder}] (${isGpu ? 'GPU硬件加速' : 'CPU'}) [目标码率: ${targetBitrateKbps}kbps]`)

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
      fs.copyFileSync(tempOutputFile, outputPath)
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

