import type { VideoThrottleScope } from '../gpuAccelerator'

export interface PanDownloadContext {
  panType: string
  mode: 'drive' | 'share'
  fid: string
  fidToken?: string
  pwdId?: string
  stoken?: string
  cleanupDirFid?: string
  extra?: Record<string, any>
}

export interface DownloadCommand {
  id: string
  url: string
  savePath: string
  startBytes: number
  downloadedSegments?: number
  totalSegments?: number
  referer?: string
  origin?: string
  headers?: Record<string, string>
  totalBytes?: number
  panContext?: PanDownloadContext
  enqueuedAt?: number
}

export interface M3U8Segment {
  index: number
  url: string
  duration: number
  key?: { method: string; url: string; iv?: string }
  discontinuity?: boolean
  byteRange?: string
}

export interface M3U8ParseResult {
  segments: M3U8Segment[]
  isFmp4: boolean
}

export interface ManagedFetchHandle {
  response: any
  signal: AbortSignal
  isTimedOut: () => boolean
  resetIdleTimeout: (ms?: number) => void
  cleanup: () => void
}

export interface CompressQueueItem {
  taskId: string
  filePath: string
  targetBitrateKbps: number
  scope: VideoThrottleScope
  totalSegments?: number
  downloadedSegments?: number
  skippedSegments?: number
  resolve?: (res: { success: boolean; newSize?: number; error?: string; skipped?: boolean }) => void
  reject?: (err: any) => void
}

export interface UrlDiagInfo {
  host: string
  ext: string
  pathTail: string
  queryKeys: string[]
  fingerprint: string
}

export interface FetchDiagMeta {
  finalUrl: string
  redirectHops: number
  crossDomainRedirect: boolean
  strippedCredentials: boolean
}

export interface HttpErrorDiag {
  phase: 'playlist' | 'segment' | 'key'
  status: number
  resHeaders: string
  bodySnippet: string
  fetchMeta?: FetchDiagMeta
}

export interface TaskStats {
  downloadingCount: number
  queuedCount: number
  compressingCount: number
  speed: number
  speedText: string
}

export interface ActiveDownloadEntry {
  abortController: AbortController
  cmd: DownloadCommand
  donePromise?: Promise<void>
  tempPaths?: string[]
  switchingToSkip?: boolean
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0 || isNaN(bytesPerSec)) return '0 B/s'
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`
}
