import fs from 'fs'
import path from 'path'
import { logger } from '../logger'
import { getVideoDuration, probeVideo } from './probe'
import {
  cancelledTasks,
  checkDiskSpace,
  getAppTempDir,
  moveOrCopyFile,
  runFfmpegCommand
} from './runtime'
import type { ExtractAudioParams } from './types'

/**
 * 根据原音频编码匹配无损流复制目标封装扩展名
 */
export function resolveAudioCopyExtension(audioCodec?: string): { ext: string; canStreamCopy: boolean } {
  const codec = (audioCodec || '').toLowerCase()
  if (codec === 'aac' || codec === 'alac') return { ext: '.m4a', canStreamCopy: true }
  if (codec === 'mp3') return { ext: '.mp3', canStreamCopy: true }
  if (codec === 'opus' || codec === 'vorbis') return { ext: '.ogg', canStreamCopy: true }
  if (codec === 'flac') return { ext: '.flac', canStreamCopy: true }
  if (codec === 'ac3' || codec === 'eac3' || codec === 'dts') return { ext: '.mka', canStreamCopy: true }
  if (codec.startsWith('pcm_')) return { ext: '.wav', canStreamCopy: true }
  return { ext: '.m4a', canStreamCopy: false }
}

/**
 * 生成不与源目录已有文件冲突的目标文件路径
 */
export function resolveUniqueOutputPath(dir: string, baseName: string, ext: string): string {
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`
  let candidate = path.join(dir, `${baseName}${safeExt}`)
  if (!fs.existsSync(candidate)) return candidate
  for (let i = 1; i <= 999; i++) {
    candidate = path.join(dir, `${baseName} (${i})${safeExt}`)
    if (!fs.existsSync(candidate)) return candidate
  }
  return path.join(dir, `${baseName}_${Date.now()}${safeExt}`)
}

/**
 * 从本地视频提取音频（优先无损流复制 -vn -c:a copy 并校验产物，失败自动平滑降级转码）
 */
export async function extractAudio(
  params: ExtractAudioParams,
  onProgress?: (percent: number, text: string) => void
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const { taskId, sourcePath, format, outputPath } = params
  cancelledTasks.delete(taskId)
  const tempFilesToClean: string[] = []

  try {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { success: false, error: '源视频文件不存在' }
    }

    onProgress?.(2, '正在分析视频音轨信息')
    const probe = await probeVideo(sourcePath)
    if (cancelledTasks.has(taskId)) {
      return { success: false, error: '操作已取消' }
    }
    if (!probe.hasAudio) {
      return { success: false, error: '该视频不包含音频轨，无法提取' }
    }

    const totalDuration = probe.duration > 0 ? probe.duration : await getVideoDuration(sourcePath)
    const sourceSize = fs.statSync(sourcePath).size
    const copyPlan = resolveAudioCopyExtension(probe.audioCodec)
    const targetExt = format === 'mp3' ? '.mp3' : copyPlan.ext

    const sourceDir = path.dirname(sourcePath)
    const sourceBase = path.basename(sourcePath, path.extname(sourcePath))
    const finalOutputPath = outputPath
      ? outputPath
      : resolveUniqueOutputPath(sourceDir, sourceBase, targetExt)

    // 双重磁盘空间预检（音频一般远小于视频，但预留至少 50MB 或源文件 0.35x 保底）
    const appTempDir = getAppTempDir()
    const requiredBytes = Math.max(50 * 1024 * 1024, Math.ceil(sourceSize * 0.35))
    const tempSpace = checkDiskSpace(appTempDir, requiredBytes)
    if (!tempSpace.ok) {
      return { success: false, error: `应用临时目录空间不足: ${tempSpace.error}` }
    }
    const targetSpace = checkDiskSpace(path.dirname(finalOutputPath), requiredBytes)
    if (!targetSpace.ok) {
      return { success: false, error: `目标磁盘空间不足: ${targetSpace.error}` }
    }

    const rand = Math.random().toString(36).slice(2, 8)
    const tempOutput = path.join(appTempDir, `velora_audio_${Date.now()}_${rand}${targetExt}`)
    tempFilesToClean.push(tempOutput)

    const reportProgress = (sec: number, label: string) => {
      if (totalDuration > 0) {
        const pct = Math.min(95, Math.max(5, Math.round(5 + (sec / totalDuration) * 90)))
        onProgress?.(pct, label)
      }
    }

    let extracted = false
    let lastError = ''

    // ① 无损流复制优先
    if (format === 'copy' && copyPlan.canStreamCopy) {
      onProgress?.(5, '正在无损提取原音轨')
      const copyArgs = [
        '-y',
        '-progress', 'pipe:1',
        '-i', sourcePath,
        '-vn',
        '-c:a', 'copy',
        ...(targetExt === '.m4a' ? ['-movflags', '+faststart'] : []),
        tempOutput
      ]
      const copyRes = await runFfmpegCommand(taskId, copyArgs, (sec) => reportProgress(sec, '正在无损提取原音轨'))
      if (cancelledTasks.has(taskId)) {
        return { success: false, error: '操作已取消' }
      }
      if (copyRes.success && fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 0) {
        if (totalDuration > 0) {
          const outDur = await getVideoDuration(tempOutput)
          if (outDur > 0 && Math.abs(outDur - totalDuration) <= Math.max(1.5, totalDuration * 0.05)) {
            extracted = true
          } else {
            logger.warn('VideoEditor', `无损提取音频时长校验异常 (原 ${totalDuration}s / 出 ${outDur}s)，降级转码`)
          }
        } else {
          extracted = true
        }
      } else {
        lastError = copyRes.error || copyRes.stderr || ''
        logger.warn('VideoEditor', `无损提取音频失败，降级转码: ${lastError}`)
      }
    }

    // ② 转码路径（指定 MP3 或无损流复制失败/编码不兼容时回退）
    if (!extracted) {
      if (fs.existsSync(tempOutput)) {
        try { fs.unlinkSync(tempOutput) } catch {}
      }
      const isMp3 = format === 'mp3' || targetExt === '.mp3'
      const fallbackLabel = isMp3 ? '正在提取并转换 MP3 音频' : '正在提取并转换音频'
      onProgress?.(8, fallbackLabel)

      const encodeArgs = isMp3
        ? [
            '-y',
            '-progress', 'pipe:1',
            '-i', sourcePath,
            '-vn',
            '-c:a', 'libmp3lame',
            '-q:a', '2',
            tempOutput
          ]
        : [
            '-y',
            '-progress', 'pipe:1',
            '-i', sourcePath,
            '-vn',
            '-c:a', 'aac',
            '-b:a', '192k',
            ...(targetExt === '.m4a' ? ['-movflags', '+faststart'] : []),
            tempOutput
          ]

      const encRes = await runFfmpegCommand(taskId, encodeArgs, (sec) => reportProgress(sec, fallbackLabel))
      if (cancelledTasks.has(taskId)) {
        return { success: false, error: '操作已取消' }
      }
      if (encRes.success && fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 0) {
        extracted = true
      } else {
        lastError = encRes.error || encRes.stderr || 'FFmpeg 音频提取失败'
      }
    }

    if (!extracted) {
      return { success: false, error: `提取音频失败: ${lastError}` }
    }

    onProgress?.(98, '正在写入目标音频文件')
    const outDir = path.dirname(finalOutputPath)
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }
    moveOrCopyFile(tempOutput, finalOutputPath)
    onProgress?.(100, '处理完成')

    logger.info('VideoEditor', `音频提取完成: ${sourcePath} -> ${finalOutputPath}`)
    return { success: true, outputPath: finalOutputPath }
  } catch (err: any) {
    if (cancelledTasks.has(taskId)) {
      return { success: false, error: '操作已取消' }
    }
    logger.error('VideoEditor', `extractAudio error: ${err?.message || err}`)
    return { success: false, error: err?.message || '提取音频异常' }
  } finally {
    cancelledTasks.delete(taskId)
    for (const f of tempFilesToClean) {
      if (fs.existsSync(f)) {
        try { fs.rmSync(f, { force: true }) } catch {}
      }
    }
  }
}
