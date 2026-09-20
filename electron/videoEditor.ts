import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from './logger'

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

const activeEditingProcesses = new Map<string, ChildProcess>()

export function cancelVideoEdit(taskId: string): boolean {
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

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('out_time_us=')) {
          const val = parseInt(trimmed.substring(12), 10)
          if (!isNaN(val) && onProgress) {
            onProgress(val / 1000000)
          }
        } else if (trimmed.startsWith('out_time=')) {
          const timeParts = trimmed.substring(9).split(':')
          if (timeParts.length === 3 && onProgress) {
            const h = parseFloat(timeParts[0]) || 0
            const m = parseFloat(timeParts[1]) || 0
            const s = parseFloat(timeParts[2]) || 0
            onProgress(h * 3600 + m * 60 + s)
          }
        }
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

  try {
    if (cleanSegments.length === 1) {
      const seg = cleanSegments[0]
      const segDuration = seg.end - seg.start
      onProgress?.(10, '正在截取视频片段...')

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
        onProgress?.(pct, '正在截取视频片段...')
      })

      // 若流复制失败则自动降级为精准重新编码
      if (!result.success || !fs.existsSync(tempOutputFile) || fs.statSync(tempOutputFile).size === 0) {
        logger.warn('VideoEditor', `流复制剪辑失败，降级为重新编码: ${result.error || ''}`)
        if (fs.existsSync(tempOutputFile)) {
          try { fs.unlinkSync(tempOutputFile) } catch {}
        }

        const encodeArgs = [
          '-y',
          '-progress', 'pipe:1',
          '-ss', seg.start.toFixed(3),
          '-to', seg.end.toFixed(3),
          '-i', sourcePath,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '20',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          tempOutputFile
        ]

        result = await runFfmpegCommand(taskId, encodeArgs, (sec) => {
          const pct = Math.min(95, Math.round(10 + (sec / (segDuration || 1)) * 80))
          onProgress?.(pct, '正在重新编码剪辑视频...')
        })

        if (!result.success) {
          return { success: false, error: `剪辑处理失败: ${result.error || result.stderr}` }
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
        onProgress?.(startPct, `正在截取片段 ${i + 1}/${cleanSegments.length}...`)

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
          onProgress?.(currentPct, `正在截取片段 ${i + 1}/${cleanSegments.length}...`)
        })

        if (!segRes.success || !fs.existsSync(segFile) || fs.statSync(segFile).size === 0) {
          logger.warn('VideoEditor', `片段 ${i + 1} 流复制失败，使用重新编码`)
          if (fs.existsSync(segFile)) {
            try { fs.unlinkSync(segFile) } catch {}
          }
          segArgs = [
            '-y',
            '-progress', 'pipe:1',
            '-ss', seg.start.toFixed(3),
            '-to', seg.end.toFixed(3),
            '-i', sourcePath,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '20',
            '-c:a', 'aac',
            '-b:a', '192k',
            segFile
          ]
          segRes = await runFfmpegCommand(taskId, segArgs)
          if (!segRes.success) {
            return { success: false, error: `截取片段 ${i + 1} 失败: ${segRes.error || segRes.stderr}` }
          }
        }
      }

      onProgress?.(75, '正在合并多个片段...')

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
        onProgress?.(pct, '正在合并所有片段...')
      })

      if (!concatRes.success || !fs.existsSync(tempOutputFile) || fs.statSync(tempOutputFile).size === 0) {
        logger.warn('VideoEditor', 'Concat 流复制失败，降级为重编码合并')
        if (fs.existsSync(tempOutputFile)) {
          try { fs.unlinkSync(tempOutputFile) } catch {}
        }
        const reencodeConcatArgs = [
          '-y',
          '-progress', 'pipe:1',
          '-f', 'concat',
          '-safe', '0',
          '-i', concatListFile,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '20',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-movflags', '+faststart',
          tempOutputFile
        ]
        concatRes = await runFfmpegCommand(taskId, reencodeConcatArgs)
        if (!concatRes.success) {
          return { success: false, error: `合并片段失败: ${concatRes.error || concatRes.stderr}` }
        }
      }
    }

    if (!fs.existsSync(tempOutputFile) || fs.statSync(tempOutputFile).size === 0) {
      return { success: false, error: '生成剪辑文件失败，文件大小为 0' }
    }

    onProgress?.(98, mode === 'replace' ? '正在覆盖保存原文件...' : '正在写入目标文件...')

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
    }

    onProgress?.(100, '处理完成！')
    return { success: true, outputPath: finalTargetPath }
  } catch (err: any) {
    logger.error('VideoEditor', `视频剪辑异常: ${err.message}`)
    return { success: false, error: err.message || '未知剪辑错误' }
  } finally {
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
