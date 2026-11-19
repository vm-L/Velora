import { spawn, type ChildProcess } from 'child_process'
import os from 'os'
import { logger } from './logger'
import { storeManager } from './store'

export type VideoEncoder = 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'h264_videotoolbox' | 'libx264'
export type VideoCompressSpeedPreset = 'low' | 'balanced' | 'fast' | 'unlimited'
export type VideoThrottleScope = 'autoCompress' | 'manualCompress'

export const DEFAULT_VIDEO_COMPRESS_SPEED_PRESET: VideoCompressSpeedPreset = 'unlimited'
export const DEFAULT_VIDEO_THROTTLE_SCOPES: VideoThrottleScope[] = ['autoCompress']

const VALID_SPEED_PRESETS = new Set<VideoCompressSpeedPreset>(['low', 'balanced', 'fast', 'unlimited'])
const VALID_THROTTLE_SCOPES = new Set<VideoThrottleScope>(['autoCompress', 'manualCompress'])

export interface FfmpegThrottleConfig {
  enabled: boolean
  preset: VideoCompressSpeedPreset
  readrate: number | null
  inputArgs: string[]
  osPriority: number | null
}

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

let cachedReadrateSupported: boolean | null = null
let readrateDetectingPromise: Promise<boolean> | null = null

/**
 * 探测当前 FFmpeg 是否支持 -readrate 参数（带 5 秒超时保护）
 */
function testReadrateSupport(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let child: ChildProcess | null = null
    const finish = (supported: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(supported)
    }

    const timer = setTimeout(() => {
      try {
        child?.kill('SIGKILL')
      } catch {}
      finish(false)
    }, 5000)

    try {
      child = spawn('ffmpeg', [
        '-v', 'error',
        '-readrate', '4',
        '-f', 'lavfi',
        '-i', 'testsrc=duration=0.1:size=64x64:rate=30',
        '-f', 'null',
        '-'
      ])
      child.on('close', (code) => {
        finish(code === 0)
      })
      child.on('error', () => {
        finish(false)
      })
    } catch {
      finish(false)
    }
  })
}

/**
 * 获取当前 FFmpeg 是否支持 -readrate（结果单次缓存）
 */
export async function isReadrateSupported(): Promise<boolean> {
  if (cachedReadrateSupported !== null) {
    return cachedReadrateSupported
  }
  if (readrateDetectingPromise) {
    return readrateDetectingPromise
  }

  readrateDetectingPromise = (async () => {
    const supported = await testReadrateSupport()
    cachedReadrateSupported = supported
    if (supported) {
      logger.info('GPUAccelerator', 'FFmpeg 支持 -readrate 输入限速参数')
    } else {
      logger.warn('GPUAccelerator', '当前 FFmpeg 不支持 -readrate 参数，将自动降级为仅降低进程优先级')
    }
    return supported
  })()

  return readrateDetectingPromise
}

/**
 * 根据生效范围与系统设置解析 FFmpeg 限速及进程优先级配置
 */
export async function getFfmpegThrottleConfig(scope: VideoThrottleScope): Promise<FfmpegThrottleConfig> {
  const rawPreset = await storeManager.getSetting('videoCompressSpeedPreset')
  const preset: VideoCompressSpeedPreset = VALID_SPEED_PRESETS.has(rawPreset)
    ? rawPreset
    : DEFAULT_VIDEO_COMPRESS_SPEED_PRESET

  const rawScopes = await storeManager.getSetting('videoThrottleScopes')
  const scopes: VideoThrottleScope[] = Array.isArray(rawScopes)
    ? rawScopes.filter((s): s is VideoThrottleScope => VALID_THROTTLE_SCOPES.has(s))
    : DEFAULT_VIDEO_THROTTLE_SCOPES

  if (preset === 'unlimited' || !scopes.includes(scope)) {
    return {
      enabled: false,
      preset,
      readrate: null,
      inputArgs: [],
      osPriority: null
    }
  }

  let readrate: number
  let osPriority: number
  if (preset === 'low') {
    readrate = 2
    osPriority = os.constants.priority.PRIORITY_LOW
  } else if (preset === 'fast') {
    readrate = 8
    osPriority = os.constants.priority.PRIORITY_BELOW_NORMAL
  } else {
    readrate = 4
    osPriority = os.constants.priority.PRIORITY_BELOW_NORMAL
  }

  const readrateSupported = await isReadrateSupported()
  return {
    enabled: true,
    preset,
    readrate,
    inputArgs: readrateSupported ? ['-readrate', String(readrate)] : [],
    osPriority
  }
}

/**
 * 为已启动的 FFmpeg 子进程应用限速对应的操作系统调度优先级
 */
export function applyFfmpegProcessPriority(proc: ChildProcess, throttle?: FfmpegThrottleConfig | null): void {
  if (!throttle?.enabled || throttle.osPriority === null || !proc.pid) {
    return
  }
  try {
    os.setPriority(proc.pid, throttle.osPriority)
  } catch (err: any) {
    logger.warn('GPUAccelerator', `设置 FFmpeg 进程优先级失败 (pid=${proc.pid}): ${err?.message || err}`)
  }
}
