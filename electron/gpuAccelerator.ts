import { spawn } from 'child_process'
import { logger } from './logger'

export type VideoEncoder = 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'h264_videotoolbox' | 'libx264'

const CANDIDATE_ENCODERS: VideoEncoder[] = [
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
  'h264_videotoolbox',
  'libx264'
]

let cachedAvailableEncoders: VideoEncoder[] | null = null
let detectingPromise: Promise<VideoEncoder[]> | null = null

/**
 * 探测指定编码器在当前硬件与驱动环境下是否真正可用
 */
function testEncoderSupport(encoder: VideoEncoder): Promise<boolean> {
  if (encoder === 'libx264') return Promise.resolve(true)
  return new Promise((resolve) => {
    try {
      const child = spawn('ffmpeg', [
        '-v', 'error',
        '-f', 'lavfi',
        '-i', 'testsrc=duration=0.1:size=256x256:rate=30',
        '-c:v', encoder,
        '-f', 'null',
        '-'
      ])
      child.on('close', (code) => {
        resolve(code === 0)
      })
      child.on('error', () => {
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

/**
 * 获取当前系统按优先级排序的可用视频编码器列表 (GPU 优先，CPU 保底)
 */
export async function getAvailableEncoders(): Promise<VideoEncoder[]> {
  if (cachedAvailableEncoders && cachedAvailableEncoders.length > 0) {
    return cachedAvailableEncoders
  }
  if (detectingPromise) {
    return detectingPromise
  }

  detectingPromise = (async () => {
    const available: VideoEncoder[] = []
    for (const enc of CANDIDATE_ENCODERS) {
      if (enc === 'libx264') {
        available.push(enc)
      } else {
        const supported = await testEncoderSupport(enc)
        if (supported) {
          available.push(enc)
        }
      }
    }
    cachedAvailableEncoders = available
    logger.info('GPUAccelerator', `已检测到支持的视频编码器列表 (按调用优先级): ${available.join(', ')}`)
    return available
  })()

  return detectingPromise
}

export interface EncoderArgsOptions {
  mode: 'quality' | 'bitrate'
  bitrateKbps?: number
  maxrateKbps?: number
  bufsizeKbps?: number
  crf?: number
}

/**
 * 根据编码器类型生成对应的 FFmpeg 视频编码参数
 */
export function getEncoderArgs(encoder: VideoEncoder, options: EncoderArgsOptions): string[] {
  const { mode, bitrateKbps, maxrateKbps, bufsizeKbps } = options
  const targetBitrate = bitrateKbps || 2000
  const rateLimitArgs = maxrateKbps ? ['-maxrate', `${maxrateKbps}k`, '-bufsize', `${bufsizeKbps || maxrateKbps * 2}k`] : []

  if (encoder === 'h264_nvenc') {
    if (mode === 'quality') {
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23', ...rateLimitArgs]
    } else {
      return [
        '-c:v', 'h264_nvenc',
        '-preset', 'fast',
        '-b:v', `${targetBitrate}k`,
        '-maxrate', `${Math.round(targetBitrate * 1.5)}k`,
        '-bufsize', `${Math.round(targetBitrate * 2)}k`
      ]
    }
  }

  if (encoder === 'h264_qsv') {
    if (mode === 'quality') {
      return ['-c:v', 'h264_qsv', '-preset', 'fast', '-global_quality', '23', ...rateLimitArgs]
    } else {
      return [
        '-c:v', 'h264_qsv',
        '-preset', 'fast',
        '-b:v', `${targetBitrate}k`,
        '-maxrate', `${Math.round(targetBitrate * 1.5)}k`,
        '-bufsize', `${Math.round(targetBitrate * 2)}k`
      ]
    }
  }

  if (encoder === 'h264_amf') {
    if (mode === 'quality') {
      return ['-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '23', '-qp_p', '23', ...rateLimitArgs]
    } else {
      return [
        '-c:v', 'h264_amf',
        '-quality', 'speed',
        '-b:v', `${targetBitrate}k`,
        '-maxrate', `${Math.round(targetBitrate * 1.5)}k`,
        '-bufsize', `${Math.round(targetBitrate * 2)}k`
      ]
    }
  }

  if (encoder === 'h264_videotoolbox') {
    if (mode === 'quality') {
      return ['-c:v', 'h264_videotoolbox', '-q:v', '60', ...rateLimitArgs]
    } else {
      return [
        '-c:v', 'h264_videotoolbox',
        '-b:v', `${targetBitrate}k`,
        '-maxrate', `${Math.round(targetBitrate * 1.5)}k`,
        '-bufsize', `${Math.round(targetBitrate * 2)}k`
      ]
    }
  }

  // Fallback: libx264 (CPU)
  if (mode === 'quality') {
    return ['-c:v', 'libx264', '-preset', 'fast', '-crf', '22', ...rateLimitArgs]
  } else {
    return [
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-b:v', `${targetBitrate}k`,
      '-maxrate', `${Math.round(targetBitrate * 1.5)}k`,
      '-bufsize', `${Math.round(targetBitrate * 2)}k`
    ]
  }
}

/**
 * 判断指定编码器是否为 GPU 硬件加速编码器
 */
export function isGpuEncoder(encoder: string): boolean {
  return encoder === 'h264_nvenc' || encoder === 'h264_qsv' || encoder === 'h264_amf' || encoder === 'h264_videotoolbox'
}
