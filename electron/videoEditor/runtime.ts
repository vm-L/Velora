import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from '../logger'

const activeEditingProcesses = new Map<string, ChildProcess>()
export const cancelledTasks = new Set<string>()

/**
 * 取消正在进行的视频处理任务
 */
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
export const cancelVideoCompress = cancelVideoEdit

/**
 * 检查目标目录所在磁盘剩余空间是否满足需求
 */
export function checkDiskSpace(targetDir: string, requiredBytes: number): { ok: boolean; freeBytes: number; error?: string } {
  try {
    let checkPath = targetDir
    while (checkPath && !fs.existsSync(checkPath)) {
      const parent = path.dirname(checkPath)
      if (parent === checkPath) break
      checkPath = parent
    }
    if (!checkPath || !fs.existsSync(checkPath)) {
      return { ok: true, freeBytes: Number.MAX_SAFE_INTEGER }
    }
    const stats = fs.statfsSync(checkPath)
    const freeBytes = Number(stats.bavail) * Number(stats.bsize)
    if (freeBytes < requiredBytes) {
      const freeMB = Math.round(freeBytes / (1024 * 1024))
      const reqMB = Math.round(requiredBytes / (1024 * 1024))
      return {
        ok: false,
        freeBytes,
        error: `目标磁盘剩余空间不足 (剩余 ${freeMB} MB，预计需要至少 ${reqMB} MB)，已中止操作以防写满磁盘`
      }
    }
    return { ok: true, freeBytes }
  } catch {
    return { ok: true, freeBytes: Number.MAX_SAFE_INTEGER }
  }
}

/**
 * 移动文件，跨磁盘卷（EXDEV）时自动降级为复制并清理源文件
 */
export function moveOrCopyFile(src: string, dest: string): void {
  try {
    fs.renameSync(src, dest)
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(src, dest)
      try { fs.unlinkSync(src) } catch {}
    } else {
      throw err
    }
  }
}

/**
 * 获取应用统一临时目录，用于存放视频处理中间产物
 */
export function getAppTempDir(): string {
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

/**
 * 清理应用临时目录下的历史遗留视频处理产物
 */
export function cleanupAppTempDir(): void {
  try {
    const tmpDir = getAppTempDir()
    if (!fs.existsSync(tmpDir)) return
    const files = fs.readdirSync(tmpDir)
    for (const file of files) {
      if (file.startsWith('velora_') || file.startsWith('~velora_')) {
        const fullPath = path.join(tmpDir, file)
        try {
          fs.rmSync(fullPath, { recursive: true, force: true })
        } catch {
          // ignore busy files
        }
      }
    }
  } catch (err: any) {
    logger.warn('VideoEditor', `Failed to cleanup app temp dir: ${err?.message}`)
  }
}

/**
 * 执行 FFmpeg 子进程命令并解析进度输出
 */
export function runFfmpegCommand(
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
