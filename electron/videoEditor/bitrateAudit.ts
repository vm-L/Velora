import fs from 'fs'
import path from 'path'
import { logger } from '../logger'
import { probeVideo } from './probe'

const AUDIT_VIDEO_EXTS = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'f4v', 'm4v', 'ts',
  '3gp', '3g2', 'wmv', 'asf', 'vob', 'mpg', 'mpeg', 'ogv'
])

export interface HighBitrateVideoItem {
  name: string
  path: string
  size: number
  duration: number
  width: number
  height: number
  bitrateKbps: number
  estimatedSavingsBytes: number
}

export interface AuditHighBitrateParams {
  targetPaths: string[]
  minBitrateKbps: number
  targetBitrateKbps: number
  minSizeMB?: number
  maxFiles?: number
}

export interface AuditHighBitrateResult {
  success: boolean
  totalScanned: number
  candidates: HighBitrateVideoItem[]
  totalEstimatedSavingsBytes: number
  error?: string
}

/**
 * 保守估算重编码至目标码率后的可释放磁盘字节数（预留 ~8% 音轨与封装开销）
 */
export function estimateSavingsBytes(
  sizeBytes: number,
  currentBitrateKbps: number,
  targetBitrateKbps: number
): number {
  if (sizeBytes <= 0 || currentBitrateKbps <= 0 || targetBitrateKbps <= 0) return 0
  if (currentBitrateKbps <= targetBitrateKbps) return 0
  const ratio = 1 - targetBitrateKbps / currentBitrateKbps
  return Math.max(0, Math.round(sizeBytes * ratio * 0.92))
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIdx = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIdx < items.length) {
      const idx = nextIdx++
      results[idx] = await worker(items[idx])
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * 扫描指定本地目录，使用 probeVideo 探测视频真实码率，筛出高码率低效视频并估算可省空间
 */
export async function auditHighBitrateVideos(
  params: AuditHighBitrateParams
): Promise<AuditHighBitrateResult> {
  try {
    const targetPaths = Array.isArray(params?.targetPaths) ? params.targetPaths.filter(Boolean) : []
    const minBitrateKbps = Math.max(300, Number(params?.minBitrateKbps) || 4000)
    const targetBitrateKbps = Math.max(300, Number(params?.targetBitrateKbps) || 1500)
    const minSizeBytes = Math.max(0, Number(params?.minSizeMB ?? 20)) * 1024 * 1024
    const maxFiles = Math.max(1, Math.min(1000, Number(params?.maxFiles) || 300))

    const discovered = new Map<string, { name: string; path: string; size: number }>()

    const walk = async (target: string, depth = 0): Promise<void> => {
      if (depth > 12) return
      try {
        if (!fs.existsSync(target)) return
        const stat = await fs.promises.stat(target)
        if (stat.isDirectory()) {
          const entries = await fs.promises.readdir(target, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue
            await walk(path.join(target, entry.name), depth + 1)
          }
        } else if (stat.size >= minSizeBytes) {
          const ext = path.extname(target).toLowerCase().replace(/^\./, '')
          if (AUDIT_VIDEO_EXTS.has(ext)) {
            const norm = target.replace(/\\/g, '/')
            discovered.set(norm, {
              name: path.basename(target),
              path: norm,
              size: stat.size
            })
          }
        }
      } catch (err: any) {
        logger.warn('BitrateAudit', `Skip ${target}: ${err?.message || err}`)
      }
    }

    for (const p of targetPaths) {
      await walk(p, 0)
    }

    // 优先探测大体积文件，限制最大探测数避免超大规模目录耗时过长
    const toProbe = Array.from(discovered.values())
      .sort((a, b) => b.size - a.size)
      .slice(0, maxFiles)

    const probedList = await mapWithConcurrency(toProbe, 4, async (item) => {
      try {
        const info = await probeVideo(item.path)
        if (!info || info.duration <= 0) return null
        const bitrateKbps = Math.round((item.size * 8) / (info.duration * 1000))
        if (bitrateKbps < minBitrateKbps || bitrateKbps <= targetBitrateKbps) {
          return null
        }
        const estimatedSavingsBytes = estimateSavingsBytes(item.size, bitrateKbps, targetBitrateKbps)
        return {
          name: item.name,
          path: item.path,
          size: item.size,
          duration: info.duration,
          width: info.width,
          height: info.height,
          bitrateKbps,
          estimatedSavingsBytes
        } as HighBitrateVideoItem
      } catch {
        return null
      }
    })

    const candidates = probedList
      .filter((x): x is HighBitrateVideoItem => x !== null)
      .sort((a, b) => b.estimatedSavingsBytes - a.estimatedSavingsBytes)

    const totalEstimatedSavingsBytes = candidates.reduce((acc, c) => acc + c.estimatedSavingsBytes, 0)

    return {
      success: true,
      totalScanned: toProbe.length,
      candidates,
      totalEstimatedSavingsBytes
    }
  } catch (err: any) {
    logger.error('BitrateAudit', `auditHighBitrateVideos error: ${err?.message || err}`)
    return {
      success: false,
      totalScanned: 0,
      candidates: [],
      totalEstimatedSavingsBytes: 0,
      error: err?.message || '扫描视频码率失败'
    }
  }
}
