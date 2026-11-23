export const DEFAULT_M3U8_RETRY_INTERVAL_SEGMENTS = 8
export const DEFAULT_M3U8_TAIL_RETRY_MIN_GAP_MS = 250

const TEMPORARY_AUTH_OR_CHALLENGE_PATTERNS = [
  'cf-mitigated=challenge',
  'request has expired',
  'expiredtoken',
  'token expired',
  'rate limit',
  'too many requests'
]

const PERMANENT_ORIGIN_PATTERNS = [
  'bucketpunish',
  '0003-00000908',
  'nosuchkey',
  'nosuchbucket',
  'accountarrears',
  'bucketalreadydeleted',
  'resourcenotfound'
]

/**
 * 判断分片响应是否属于源站永久不可恢复错误（如对象被删或存储桶被封禁），排除临时限流与过期校验
 */
export function isPermanentOriginSegmentError(
  status: number | null,
  resHeaders?: string,
  bodySnippet?: string
): boolean {
  if (status === 404 || status === 410) {
    return true
  }
  if (status !== 403) {
    return false
  }
  const combined = `${resHeaders || ''} ${bodySnippet || ''}`.toLowerCase()
  for (let i = 0; i < TEMPORARY_AUTH_OR_CHALLENGE_PATTERNS.length; i++) {
    if (combined.includes(TEMPORARY_AUTH_OR_CHALLENGE_PATTERNS[i])) {
      return false
    }
  }
  for (let i = 0; i < PERMANENT_ORIGIN_PATTERNS.length; i++) {
    if (combined.includes(PERMANENT_ORIGIN_PATTERNS[i])) {
      return true
    }
  }
  return false
}

export interface M3U8SchedulerOptions {
  totalSegments: number
  alreadyCompleted?: Iterable<number>
  retryIntervalSegments?: number
  tailRetryMinGapMs?: number
}

export type M3U8AcquireResult =
  | { type: 'segment'; index: number; failCount: number; isRetry: boolean }
  | { type: 'wait'; waitMs: number }
  | { type: 'done' }

interface RetryQueueItem {
  index: number
  failCount: number
  readyAtDispatch: number
  nextEarliestMs: number
  lastError?: string
}

/**
 * M3U8 分片并发调度器：
 * - 首轮按序分发未完成分片，单个分片失败后按分片间隔穿插延后重试，不阻塞后续分片
 * - 首轮全部分发完毕进入尾部阶段后，忽略间隔限制，保持高并发对剩余失败分片持续循环重试
 * - 跟踪连续源站永久失效轮次，便于识别全剩余分片均已永久不可用的场景
 */
export class M3U8SegmentScheduler {
  readonly totalSegments: number
  readonly retryIntervalSegments: number
  readonly tailRetryMinGapMs: number

  private readonly primaryIndices: number[] = []
  private primaryCursor = 0
  private readonly retryQueue: RetryQueueItem[] = []
  private readonly inFlight = new Set<number>()
  private readonly completed = new Set<number>()
  private readonly failedSegments = new Set<number>()
  private readonly failCounts = new Map<number, number>()
  private readonly permanentFailCounts = new Map<number, number>()
  private dispatchedCount = 0
  private readonly waiters = new Set<() => void>()

  constructor(options: M3U8SchedulerOptions) {
    this.totalSegments = Math.max(0, Math.floor(options.totalSegments))
    this.retryIntervalSegments = Math.max(
      1,
      Math.floor(options.retryIntervalSegments ?? DEFAULT_M3U8_RETRY_INTERVAL_SEGMENTS)
    )
    this.tailRetryMinGapMs = Math.max(
      0,
      Math.floor(options.tailRetryMinGapMs ?? DEFAULT_M3U8_TAIL_RETRY_MIN_GAP_MS)
    )

    if (options.alreadyCompleted) {
      const completedItems = Array.from(options.alreadyCompleted)
      for (let i = 0; i < completedItems.length; i++) {
        const rawIdx = completedItems[i]
        if (Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < this.totalSegments) {
          this.completed.add(rawIdx)
        }
      }
    }

    for (let i = 0; i < this.totalSegments; i++) {
      if (!this.completed.has(i)) {
        this.primaryIndices.push(i)
      }
    }
  }

  get completedCount(): number {
    return this.completed.size
  }

  get pendingRetryCount(): number {
    return this.failedSegments.size
  }

  get remainingUncompletedCount(): number {
    return Math.max(0, this.totalSegments - this.completed.size)
  }

  get isTailRetryOnly(): boolean {
    return this.primaryCursor >= this.primaryIndices.length && this.completed.size < this.totalSegments
  }

  get isDone(): boolean {
    return this.completed.size >= this.totalSegments
  }

  isCompleted(index: number): boolean {
    return this.completed.has(index)
  }

  /**
   * 仅当首轮已全部分发完毕且尚存未完成分片时，检查是否所有未完成分片均连续命中源站永久失效
   */
  hasAllRemainingPermanentlyFailed(minConsecutiveRounds: number = 2): boolean {
    if (this.primaryCursor < this.primaryIndices.length || this.completed.size >= this.totalSegments) {
      return false
    }
    let uncompletedCount = 0
    for (let i = 0; i < this.totalSegments; i++) {
      if (this.completed.has(i)) continue
      uncompletedCount++
      if ((this.permanentFailCounts.get(i) || 0) < minConsecutiveRounds) {
        return false
      }
    }
    return uncompletedCount > 0
  }

  acquire(now: number = Date.now()): M3U8AcquireResult {
    if (this.completed.size >= this.totalSegments) {
      return { type: 'done' }
    }

    // 1. 主列表下载阶段：优先调度已达到间隔分片数且冷却到期的重试分片
    for (let i = 0; i < this.retryQueue.length; i++) {
      const item = this.retryQueue[i]
      if (this.completed.has(item.index) || this.inFlight.has(item.index)) {
        continue
      }
      if (item.readyAtDispatch <= this.dispatchedCount && item.nextEarliestMs <= now) {
        this.retryQueue.splice(i, 1)
        this.inFlight.add(item.index)
        this.dispatchedCount++
        return {
          type: 'segment',
          index: item.index,
          failCount: item.failCount,
          isRetry: true
        }
      }
    }

    // 2. 分发主列表下一未下载分片
    while (this.primaryCursor < this.primaryIndices.length) {
      const index = this.primaryIndices[this.primaryCursor++]
      if (this.completed.has(index) || this.inFlight.has(index)) {
        continue
      }
      this.inFlight.add(index)
      this.dispatchedCount++
      return {
        type: 'segment',
        index,
        failCount: 0,
        isRetry: false
      }
    }

    // 3. 尾部阶段：忽略分片间隔，纯按 FIFO 队列与极短防空转保护持续轮询重试
    let minNextMs = Infinity
    for (let i = 0; i < this.retryQueue.length; i++) {
      const item = this.retryQueue[i]
      if (this.completed.has(item.index) || this.inFlight.has(item.index)) {
        continue
      }
      if (item.nextEarliestMs <= now) {
        this.retryQueue.splice(i, 1)
        this.inFlight.add(item.index)
        this.dispatchedCount++
        return {
          type: 'segment',
          index: item.index,
          failCount: item.failCount,
          isRetry: true
        }
      }
      if (item.nextEarliestMs < minNextMs) {
        minNextMs = item.nextEarliestMs
      }
    }

    if (Number.isFinite(minNextMs)) {
      return { type: 'wait', waitMs: Math.max(20, minNextMs - now) }
    }

    if (this.inFlight.size > 0) {
      return { type: 'wait', waitMs: 100 }
    }

    return { type: 'done' }
  }

  markSuccess(index: number): void {
    this.inFlight.delete(index)
    this.completed.add(index)
    this.failedSegments.delete(index)
    this.failCounts.delete(index)
    this.permanentFailCounts.delete(index)
    this.notifyWaiters()
  }

  markFailed(index: number, errorMsg: string, now: number = Date.now(), isPermanent: boolean = false): number {
    this.inFlight.delete(index)
    if (this.completed.has(index)) {
      this.failedSegments.delete(index)
      this.failCounts.delete(index)
      this.permanentFailCounts.delete(index)
      this.notifyWaiters()
      return 0
    }

    const nextFailCount = (this.failCounts.get(index) || 0) + 1
    this.failCounts.set(index, nextFailCount)
    this.failedSegments.add(index)

    if (isPermanent) {
      this.permanentFailCounts.set(index, (this.permanentFailCounts.get(index) || 0) + 1)
    } else {
      this.permanentFailCounts.delete(index)
    }

    const readyAtDispatch = this.dispatchedCount + this.retryIntervalSegments
    const nextEarliestMs = now + this.tailRetryMinGapMs
    this.retryQueue.push({
      index,
      failCount: nextFailCount,
      readyAtDispatch,
      nextEarliestMs,
      lastError: errorMsg
    })

    this.notifyWaiters()
    return nextFailCount
  }

  waitForUpdate(waitMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(
        signal.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
      )
    }
    if (this.isDone) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        clearTimeout(timer)
        this.waiters.delete(onWake)
        if (signal) {
          signal.removeEventListener('abort', onAbort)
        }
      }
      const onWake = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const onAbort = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(
          signal?.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
        )
      }

      const timer = setTimeout(onWake, Math.max(1, waitMs))
      this.waiters.add(onWake)
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  private notifyWaiters(): void {
    if (this.waiters.size === 0) return
    const current = Array.from(this.waiters)
    for (let i = 0; i < current.length; i++) {
      current[i]()
    }
  }
}
