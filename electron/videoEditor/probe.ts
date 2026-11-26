import { spawn } from 'child_process'
import type { ProbeResult } from './types'

/**
 * 探测视频总时长（优先 ffprobe JSON，失败时自动回退至 ffmpeg -i）
 */
export async function getVideoDuration(filePath: string): Promise<number> {
  // 优先使用 ffprobe JSON 快速读取时长（~20ms），失败或返回 0 时回退至 ffmpeg -i
  const probeViaFfprobe = (): Promise<number> => {
    return new Promise((resolve) => {
      try {
        const child = spawn('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'json',
          filePath
        ])
        let stdout = ''
        child.stdout.on('data', (data) => {
          stdout += data.toString()
        })
        child.on('close', (code) => {
          if (code === 0 && stdout) {
            try {
              const parsed = JSON.parse(stdout)
              const dur = parseFloat(parsed?.format?.duration)
              if (!isNaN(dur) && dur > 0) {
                return resolve(dur)
              }
            } catch {}
          }
          resolve(0)
        })
        child.on('error', () => resolve(0))
      } catch {
        resolve(0)
      }
    })
  }

  const ffprobeDur = await probeViaFfprobe()
  if (ffprobeDur > 0) return ffprobeDur

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
      const audioMatch = stderr.match(/Stream #\d+:\d+.*Audio:\s*([a-zA-Z0-9_]+)/)
      const hasAudio = !!audioMatch
      const audioCodec = audioMatch ? audioMatch[1].toLowerCase() : undefined
      resolve({
        duration,
        width,
        height,
        fps: fps > 0 ? fps : 30,
        hasAudio,
        audioCodec
      })
    })
    fallbackChild.on('error', () => {
      resolve({ duration: 0, width: 1280, height: 720, fps: 30, hasAudio: true })
    })
  })
}

/**
 * 探测视频完整元数据（时长、分辨率、帧率、音轨 presence），ffprobe 异常时自动回退至 ffmpeg -i
 */
export async function probeVideo(filePath: string): Promise<ProbeResult> {
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
        '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate',
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

            const width = videoStream?.width || 1280
            const height = videoStream?.height || 720
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
                hasAudio: !!audioStream,
                audioCodec: audioStream?.codec_name ? String(audioStream.codec_name).toLowerCase() : undefined
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
