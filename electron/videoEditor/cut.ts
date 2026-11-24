import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import {
  getAvailableEncoders,
  getEncoderArgs,
  isGpuEncoder
} from '../gpuAccelerator'
import type { EditVideoParams } from './types'
import {
  cancelledTasks,
  checkDiskSpace,
  moveOrCopyFile,
  getAppTempDir,
  runFfmpegCommand
} from './runtime'

/**
 * 按片段列表剪辑视频（优先流复制，失败自动降级至 GPU/CPU 重编码）
 */
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

  const tmpDir = getAppTempDir()
  const ext = path.extname(sourcePath) || '.mp4'
  const randToken = Math.random().toString(36).substring(2, 7)
  const tempOutputFile = path.join(tmpDir, `velora_edit_${Date.now()}_${randToken}_final${ext}`)
  const tempFilesToClean: string[] = [tempOutputFile]

  // 双重磁盘空间预检：应用目录预留过程空间，目标目录预留最终空间
  const sourceSize = fs.existsSync(sourcePath) ? fs.statSync(sourcePath).size : 0
  const appSpaceCheck = checkDiskSpace(tmpDir, Math.max(sourceSize * 1.2, 50 * 1024 * 1024))
  if (!appSpaceCheck.ok) {
    return { success: false, error: `应用临时目录空间不足: ${appSpaceCheck.error}` }
  }

  const destDir = mode === 'replace' ? path.dirname(sourcePath) : path.dirname(outputPath || sourcePath)
  if (destDir !== tmpDir) {
    const destSpaceCheck = checkDiskSpace(destDir, Math.max(sourceSize * 0.8, 30 * 1024 * 1024))
    if (!destSpaceCheck.ok) {
      return { success: false, error: `目标磁盘空间不足: ${destSpaceCheck.error}` }
    }
  }

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
        const segFile = path.join(tmpDir, `velora_edit_${Date.now()}_${randToken}_seg_${i}${ext}`)
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
      const concatListFile = path.join(tmpDir, `velora_edit_${Date.now()}_${randToken}_concat.txt`)
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
      moveOrCopyFile(tempOutputFile, outputPath)
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
