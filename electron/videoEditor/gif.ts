import fs from 'fs'
import path from 'path'
import { logger } from '../logger'
import { resolveUniqueOutputPath } from './extractAudio'
import {
  cancelledTasks,
  checkDiskSpace,
  getAppTempDir,
  moveOrCopyFile,
  runFfmpegCommand
} from './runtime'
import type { ExportGifParams } from './types'

const MAX_GIF_DURATION_SECONDS = 60

/**
 * 构建双通道调色板 GIF 滤镜链（Lanczos 等比缩放不放大原片 + 差异统计调色板 + Bayer 抖动）
 */
export function buildGifFilterComplex(fps = 12, maxWidth = 640): string {
  const safeFps = Math.max(5, Math.min(24, Math.round(fps)))
  const safeWidth = Math.max(240, Math.min(1280, Math.round(maxWidth)))
  return `fps=${safeFps},scale='min(${safeWidth},iw)':-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`
}

/**
 * 将本地视频指定片段导出为高质量控体积 GIF（统一走应用临时目录 + 原子落盘）
 */
export async function exportVideoGif(
  params: ExportGifParams,
  onProgress?: (percent: number, text: string) => void
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const { taskId, sourcePath, start, end, outputPath, fps = 12, maxWidth = 640 } = params
  cancelledTasks.delete(taskId)
  const tempFilesToClean: string[] = []

  try {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { success: false, error: '源视频文件不存在' }
    }

    const safeStart = Math.max(0, Number(start) || 0)
    const safeEnd = Math.max(0, Number(end) || 0)
    const clipDuration = safeEnd - safeStart
    if (clipDuration <= 0.1) {
      return { success: false, error: '选段时长过短，无法导出 GIF' }
    }
    if (clipDuration > MAX_GIF_DURATION_SECONDS) {
      return {
        success: false,
        error: `单段 GIF 时长不能超过 ${MAX_GIF_DURATION_SECONDS} 秒（当前 ${clipDuration.toFixed(1)} 秒），请缩短选段后再导出`
      }
    }

    const sourceDir = path.dirname(sourcePath)
    const sourceBase = path.basename(sourcePath, path.extname(sourcePath))
    const finalOutputPath = outputPath
      ? outputPath
      : resolveUniqueOutputPath(sourceDir, `${sourceBase}_clip`, '.gif')

    const appTempDir = getAppTempDir()
    const requiredBytes = Math.max(50 * 1024 * 1024, Math.ceil(clipDuration * 2 * 1024 * 1024))
    const tempSpace = checkDiskSpace(appTempDir, requiredBytes)
    if (!tempSpace.ok) {
      return { success: false, error: `应用临时目录空间不足: ${tempSpace.error}` }
    }
    const targetSpace = checkDiskSpace(path.dirname(finalOutputPath), requiredBytes)
    if (!targetSpace.ok) {
      return { success: false, error: `目标磁盘空间不足: ${targetSpace.error}` }
    }

    const rand = Math.random().toString(36).slice(2, 8)
    const tempOutput = path.join(appTempDir, `velora_gif_${Date.now()}_${rand}.gif`)
    tempFilesToClean.push(tempOutput)

    onProgress?.(5, '正在生成高质量调色板 GIF')
    const filterComplex = buildGifFilterComplex(fps, maxWidth)
    const args = [
      '-y',
      '-progress', 'pipe:1',
      '-ss', safeStart.toFixed(3),
      '-t', clipDuration.toFixed(3),
      '-i', sourcePath,
      '-filter_complex', filterComplex,
      '-loop', '0',
      tempOutput
    ]

    const res = await runFfmpegCommand(taskId, args, (sec) => {
      const pct = Math.min(95, Math.max(5, Math.round(5 + (sec / clipDuration) * 90)))
      onProgress?.(pct, '正在生成高质量调色板 GIF')
    })

    if (cancelledTasks.has(taskId)) {
      return { success: false, error: '操作已取消' }
    }
    if (!res.success || !fs.existsSync(tempOutput) || fs.statSync(tempOutput).size === 0) {
      return { success: false, error: `导出 GIF 失败: ${res.error || res.stderr || '未生成有效文件'}` }
    }

    onProgress?.(98, '正在写入目标 GIF 文件')
    const outDir = path.dirname(finalOutputPath)
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }
    moveOrCopyFile(tempOutput, finalOutputPath)
    onProgress?.(100, '处理完成')

    logger.info('VideoEditor', `GIF 导出完成: ${sourcePath} [${safeStart.toFixed(2)}s-${safeEnd.toFixed(2)}s] -> ${finalOutputPath}`)
    return { success: true, outputPath: finalOutputPath }
  } catch (err: any) {
    if (cancelledTasks.has(taskId)) {
      return { success: false, error: '操作已取消' }
    }
    logger.error('VideoEditor', `exportVideoGif error: ${err?.message || err}`)
    return { success: false, error: err?.message || '导出 GIF 异常' }
  } finally {
    cancelledTasks.delete(taskId)
    for (const f of tempFilesToClean) {
      if (fs.existsSync(f)) {
        try { fs.rmSync(f, { force: true }) } catch {}
      }
    }
  }
}
