import fs from 'fs'
import { spawn } from 'child_process'
import { logger } from '../logger'
import {
  buildCoalescedM3U8StreamPlan,
  cleanupM3U8SpillArtifacts,
  materializeSourcesToFile,
  streamSourcesToWritable
} from '../utils/m3u8SpillPack'

/**
 * 将分片合并落盘的视频无损转封装为标准 MP4 格式 (根据 fMP4 / TS 自动选择最佳参数，消费 stdout/stderr 避免管道死锁)
 */
export async function remuxToMp4(
  workSavePath: string,
  finalSavePath: string,
  isFmp4: boolean,
  abortController: AbortController,
  taskId: string,
  sendProgress: (payload: any) => void,
  hasMissingSegments: boolean = false
): Promise<void> {
  logger.info('Downloader', `[M3U8Downloader] 准备将临时 ${isFmp4 ? 'fMP4' : 'TS'} 封装为 MP4: ${workSavePath} -> ${finalSavePath}`)
  const totalBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : 0
  sendProgress({
    id: taskId,
    totalBytes,
    receivedBytes: totalBytes,
    status: 'converting',
    speed: 0
  })

  const runFfmpeg = (args: string[]): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const ffmpegBin = 'ffmpeg'
      const child = spawn(ffmpegBin, args)

      let settled = false
      const onAbort = () => {
        try { child.kill('SIGKILL') } catch {}
        if (!settled) {
          settled = true
          reject(new DOMException('User aborted download', 'AbortError'))
        }
      }
      const detachAbort = () => {
        abortController.signal.removeEventListener('abort', onAbort)
      }

      let stderrBuffer = ''
      child.stderr?.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
        if (stderrBuffer.length > 5000) {
          stderrBuffer = stderrBuffer.substring(stderrBuffer.length - 5000)
        }
      })

      child.stdout?.on('data', () => {
        // 消费 stdout 避免管道挂起
      })

      child.on('close', (code) => {
        detachAbort()
        if (settled) return
        settled = true
        if (code === 0) {
          try { fs.unlinkSync(workSavePath) } catch {}
          resolve()
        } else {
          logger.warn('Downloader', `[M3U8Downloader] FFmpeg 封装失败 (code ${code}): ${stderrBuffer.slice(-300)}`)
          reject(new Error(`FFmpeg exited with code ${code}: ${stderrBuffer.slice(-200)}`))
        }
      })

      child.on('error', (err) => {
        detachAbort()
        if (settled) return
        settled = true
        logger.error('Downloader', `[M3U8Downloader] FFmpeg 启动异常: ${err.message}`)
        reject(err)
      })

      if (abortController.signal.aborted) {
        onAbort()
      } else {
        abortController.signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  const inputFlags = hasMissingSegments ? ['-fflags', '+genpts+igndts'] : []

  if (isFmp4) {
    // fMP4 流: 原生已经具备 ISO MP4 音频格式头，直接 -c copy 转封装，严禁添加 -bsf:a aac_adtstoasc
    await runFfmpeg([
      '-y',
      ...inputFlags,
      '-i', workSavePath,
      '-c', 'copy',
      '-movflags', '+faststart',
      finalSavePath
    ])
  } else {
    // MPEG-TS 流: 优先尝试 -bsf:a aac_adtstoasc 过滤，若失败则自适应回退到无滤镜 copy
    try {
      await runFfmpeg([
        '-y',
        ...inputFlags,
        '-i', workSavePath,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', '+faststart',
        finalSavePath
      ])
    } catch (err: any) {
      if (abortController.signal.aborted) throw err
      logger.warn('Downloader', `[M3U8Downloader] TS 转封装带 aac_adtstoasc 失败，尝试回退无滤镜纯 copy 转封装: ${err.message}`)
      try {
        await runFfmpeg([
          '-y',
          ...inputFlags,
          '-i', workSavePath,
          '-c', 'copy',
          '-movflags', '+faststart',
          finalSavePath
        ])
      } catch (fallbackErr: any) {
        if (!hasMissingSegments || abortController.signal.aborted) throw fallbackErr
        logger.warn('Downloader', `[M3U8Downloader] 缺片 TS 无滤镜 copy 转封装仍失败，尝试 discardcorrupt 兜底封装: ${fallbackErr.message}`)
        await runFfmpeg([
          '-y',
          '-fflags', '+genpts+discardcorrupt',
          '-i', workSavePath,
          '-c', 'copy',
          '-movflags', '+faststart',
          finalSavePath
        ])
      }
    }
  }
}

/**
 * 通过 FFmpeg pipe:0 将连续前缀与 .spill.bin 区间合并流直喂封装为标准 MP4（保留 -movflags +faststart，不支持流式时自动回退临时文件封装）
 */
export async function remuxToMp4FromSources(
  streamPlan: ReturnType<typeof buildCoalescedM3U8StreamPlan>,
  workSavePath: string,
  finalSavePath: string,
  isFmp4: boolean,
  abortController: AbortController,
  taskId: string,
  sendProgress: (payload: any) => void,
  hasMissingSegments: boolean = false
): Promise<void> {
  logger.info(
    'Downloader',
    `[M3U8Downloader] 准备通过流式管道将 ${isFmp4 ? 'fMP4' : 'TS'} 封装为 MP4 (${streamPlan.sources.length} 连续区间, ${(streamPlan.totalBytes / 1024 / 1024).toFixed(2)} MB) -> ${finalSavePath}`
  )
  sendProgress({
    id: taskId,
    totalBytes: streamPlan.totalBytes,
    receivedBytes: streamPlan.totalBytes,
    status: 'converting',
    speed: 0
  })

  const runFfmpegFromPipe = (args: string[]): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const ffmpegBin = 'ffmpeg'
      const child = spawn(ffmpegBin, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      if (!child.stdin) {
        try { child.kill('SIGKILL') } catch {}
        reject(new Error('FFmpeg 子进程缺少 stdin 管道'))
        return
      }

      // 防止 FFmpeg 提前结束写关闭时因内核 EPIPE 产生未捕获流异常
      child.stdin.on('error', () => {})

      const pipeAbortCtrl = new AbortController()
      let streamReadError: Error | null = null
      const streamPromise = streamSourcesToWritable(
        streamPlan.sources,
        child.stdin,
        pipeAbortCtrl.signal
      ).catch((err: any) => {
        if (err?.name !== 'AbortError' && !pipeAbortCtrl.signal.aborted && !abortController.signal.aborted) {
          streamReadError = err instanceof Error ? err : new Error(String(err))
        }
      })

      let settled = false
      let abortedByCaller = false

      const onAbort = () => {
        abortedByCaller = true
        if (!pipeAbortCtrl.signal.aborted) {
          pipeAbortCtrl.abort(abortController.signal.reason || new DOMException('User aborted download', 'AbortError'))
        }
        try { child.kill('SIGKILL') } catch {}
      }
      const detachAbort = () => {
        abortController.signal.removeEventListener('abort', onAbort)
      }

      let stderrBuffer = ''
      child.stderr?.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
        if (stderrBuffer.length > 5000) {
          stderrBuffer = stderrBuffer.substring(stderrBuffer.length - 5000)
        }
      })

      child.stdout?.on('data', () => {
        // 消费 stdout 避免管道挂起
      })

      const finishWithWaitForHandles = async (code: number | null, spawnErr?: Error) => {
        detachAbort()
        if (!pipeAbortCtrl.signal.aborted) {
          pipeAbortCtrl.abort(new DOMException('FFmpeg process closed', 'AbortError'))
        }
        await streamPromise
        if (settled) return
        settled = true

        if (abortedByCaller || abortController.signal.aborted) {
          reject(new DOMException('User aborted download', 'AbortError'))
          return
        }
        if (spawnErr) {
          logger.error('Downloader', `[M3U8Downloader] FFmpeg 启动异常 (pipe:0): ${spawnErr.message}`)
          reject(spawnErr)
          return
        }
        if (streamReadError) {
          reject(streamReadError)
          return
        }
        const outSize = code === 0 && fs.existsSync(finalSavePath) ? fs.statSync(finalSavePath).size : 0
        if (code === 0 && outSize > 0) {
          resolve()
        } else {
          const errDetail = code === 0 ? '输出文件为空' : stderrBuffer.slice(-300)
          logger.warn('Downloader', `[M3U8Downloader] FFmpeg pipe:0 封装失败 (code ${code}): ${errDetail}`)
          reject(new Error(`FFmpeg pipe exited with code ${code}: ${errDetail.slice(-200)}`))
        }
      }

      child.on('close', (code) => {
        finishWithWaitForHandles(code).catch((err) => {
          if (!settled) {
            settled = true
            reject(err)
          }
        })
      })

      child.on('error', (err) => {
        finishWithWaitForHandles(null, err).catch((e) => {
          if (!settled) {
            settled = true
            reject(e)
          }
        })
      })

      if (abortController.signal.aborted) {
        onAbort()
      } else {
        abortController.signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  const inputFlags = hasMissingSegments ? ['-fflags', '+genpts+igndts'] : []

  if (isFmp4) {
    try {
      await runFfmpegFromPipe([
        '-y',
        ...inputFlags,
        '-i', 'pipe:0',
        '-c', 'copy',
        '-movflags', '+faststart',
        finalSavePath
      ])
    } catch (pipeErr: any) {
      if (abortController.signal.aborted) throw pipeErr
      logger.warn('Downloader', `[M3U8Downloader] fMP4 pipe:0 流式封装失败，回退合并至临时文件后再封装: ${pipeErr.message}`)
      await materializeSourcesToFile(streamPlan.sources, workSavePath, abortController.signal)
      await remuxToMp4(workSavePath, finalSavePath, true, abortController, taskId, sendProgress, hasMissingSegments)
    }
  } else {
    try {
      await runFfmpegFromPipe([
        '-y',
        ...inputFlags,
        '-f', 'mpegts',
        '-i', 'pipe:0',
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', '+faststart',
        finalSavePath
      ])
    } catch (err: any) {
      if (abortController.signal.aborted) throw err
      logger.warn('Downloader', `[M3U8Downloader] TS pipe:0 转封装带 aac_adtstoasc 失败，尝试回退无滤镜 pipe:0 纯 copy 转封装: ${err.message}`)
      try {
        await runFfmpegFromPipe([
          '-y',
          ...inputFlags,
          '-f', 'mpegts',
          '-i', 'pipe:0',
          '-c', 'copy',
          '-movflags', '+faststart',
          finalSavePath
        ])
      } catch (fallbackErr: any) {
        if (abortController.signal.aborted) throw fallbackErr
        let lastPipeErr = fallbackErr
        if (hasMissingSegments) {
          logger.warn('Downloader', `[M3U8Downloader] 缺片 TS pipe:0 无滤镜 copy 失败，尝试 discardcorrupt pipe:0 封装: ${fallbackErr.message}`)
          try {
            await runFfmpegFromPipe([
              '-y',
              '-fflags', '+genpts+discardcorrupt',
              '-f', 'mpegts',
              '-i', 'pipe:0',
              '-c', 'copy',
              '-movflags', '+faststart',
              finalSavePath
            ])
            lastPipeErr = null
          } catch (discardErr: any) {
            if (abortController.signal.aborted) throw discardErr
            lastPipeErr = discardErr
          }
        }
        if (lastPipeErr) {
          logger.warn('Downloader', `[M3U8Downloader] TS pipe:0 全部流式封装失败，回退合并至临时文件后再封装: ${lastPipeErr.message}`)
          await materializeSourcesToFile(streamPlan.sources, workSavePath, abortController.signal)
          await remuxToMp4(workSavePath, finalSavePath, false, abortController, taskId, sendProgress, hasMissingSegments)
        }
      }
    }
  }

  if (fs.existsSync(workSavePath)) {
    try { fs.unlinkSync(workSavePath) } catch {}
  }
  await cleanupM3U8SpillArtifacts(finalSavePath)
}
