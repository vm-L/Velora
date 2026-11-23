import fs from 'fs'
import path from 'path'

export interface M3U8SpillMeta {
  version: 2
  totalSegments: number
  isFmp4: boolean
  flushedSegments: number
  entries: Array<[number, number, number]>
}

export interface M3U8SpillDiskSpan {
  offset: number
  length: number
}

export type M3U8StreamSource =
  | { kind: 'file-range'; filePath: string; offset: number; length: number }
  | { kind: 'buffer'; buf: Buffer }

export interface M3U8SpillPaths {
  spillBinPath: string
  spillMetaPath: string
  legacySegsDir: string
  legacySegsMetaPath: string
}

export interface M3U8SpillResumeInspection {
  mode: 'pack' | 'legacy-segs' | 'none'
  totalSegmentsMismatch: boolean
  totalSegments?: number
  isFmp4?: boolean
  flushedSegments: number
  packEntries: Map<number, M3U8SpillDiskSpan>
  packValidEndOffset: number
  legacySegFiles: Map<number, { filePath: string; size: number }>
  totalSpilledBytes: number
}

export interface OrderedM3U8SegmentInput {
  index: number
  fileRange?: { filePath: string; offset: number; length: number }
  buffer?: Buffer
}

export function getM3U8SpillPaths(finalSavePath: string): M3U8SpillPaths {
  const legacySegsDir = finalSavePath + '.segs'
  return {
    spillBinPath: finalSavePath + '.spill.bin',
    spillMetaPath: finalSavePath + '.spill.meta.json',
    legacySegsDir,
    legacySegsMetaPath: path.join(legacySegsDir, 'meta.json')
  }
}

export async function writeBufferFully(
  handle: fs.promises.FileHandle,
  buf: Buffer,
  position: number | null = null
): Promise<void> {
  let offset = 0
  let currentPos = position
  while (offset < buf.length) {
    const { bytesWritten } = await handle.write(buf, offset, buf.length - offset, currentPos)
    if (bytesWritten <= 0) {
      throw new Error('磁盘写入失败 (0 字节写入)')
    }
    offset += bytesWritten
    if (currentPos !== null) {
      currentPos += bytesWritten
    }
  }
}

export async function writeFileAtomic(targetPath: string, data: Buffer | string): Promise<void> {
  const tmpPath = `${targetPath}.tmp`
  await fs.promises.writeFile(tmpPath, data)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fs.promises.rename(tmpPath, targetPath)
      return
    } catch (err: any) {
      if (attempt < 2 && (err?.code === 'EPERM' || err?.code === 'EBUSY')) {
        await new Promise(resolve => setTimeout(resolve, 25))
        continue
      }
      await fs.promises.unlink(tmpPath).catch(() => {})
      throw err
    }
  }
}

function hasLegacySegsDir(segsDir: string): boolean {
  try {
    if (!fs.existsSync(segsDir)) return false
    const entries = fs.readdirSync(segsDir)
    return entries.some(name => name === 'meta.json' || /^\d+\.seg$/.test(name))
  } catch {
    return false
  }
}

export function hasUnmergedM3U8Spill(finalSavePath: string): boolean {
  const paths = getM3U8SpillPaths(finalSavePath)
  try {
    if (fs.existsSync(paths.spillMetaPath)) return true
    if (fs.existsSync(paths.spillBinPath) && fs.statSync(paths.spillBinPath).size > 0) return true
    if (hasLegacySegsDir(paths.legacySegsDir)) return true
  } catch {
    return false
  }
  return false
}

export async function cleanupM3U8SpillArtifacts(finalSavePath: string): Promise<void> {
  const paths = getM3U8SpillPaths(finalSavePath)
  const removeTargets = [
    paths.spillBinPath,
    paths.spillMetaPath,
    `${paths.spillMetaPath}.tmp`,
    paths.legacySegsDir
  ]
  for (let i = 0; i < removeTargets.length; i++) {
    const target = removeTargets[i]
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fs.promises.rm(target, { recursive: true, force: true })
        break
      } catch (err: any) {
        if (attempt < 2 && (err?.code === 'EBUSY' || err?.code === 'EPERM')) {
          await new Promise(resolve => setTimeout(resolve, 40))
          continue
        }
        break
      }
    }
  }
}

export function inspectM3U8SpillForResume(
  finalSavePath: string,
  expectedTotalSegments?: number
): M3U8SpillResumeInspection {
  const paths = getM3U8SpillPaths(finalSavePath)
  const packEntries = new Map<number, M3U8SpillDiskSpan>()
  const legacySegFiles = new Map<number, { filePath: string; size: number }>()

  const spillMetaTmpPath = `${paths.spillMetaPath}.tmp`
  if (fs.existsSync(spillMetaTmpPath)) {
    try { fs.unlinkSync(spillMetaTmpPath) } catch {}
  }

  let totalSegments: number | undefined
  let isFmp4: boolean | undefined
  let flushedSegments = 0
  let packValidEndOffset = 0
  let totalSpilledBytes = 0
  let hasValidPackMeta = false
  let totalSegmentsMismatch = false

  // 1. 优先解析单文件顺序溢写包 (.spill.meta.json + .spill.bin)
  if (fs.existsSync(paths.spillMetaPath)) {
    let rawMeta: any = null
    try {
      rawMeta = JSON.parse(fs.readFileSync(paths.spillMetaPath, 'utf8'))
    } catch {
      rawMeta = null
    }

    if (rawMeta && rawMeta.version === 2) {
      if (typeof rawMeta.totalSegments === 'number') {
        totalSegments = rawMeta.totalSegments
        if (typeof expectedTotalSegments === 'number' && rawMeta.totalSegments !== expectedTotalSegments) {
          totalSegmentsMismatch = true
        }
      }
      if (typeof rawMeta.isFmp4 === 'boolean') {
        isFmp4 = rawMeta.isFmp4
      }
      if (
        typeof rawMeta.flushedSegments === 'number' &&
        Number.isInteger(rawMeta.flushedSegments) &&
        rawMeta.flushedSegments >= 0 &&
        (typeof expectedTotalSegments !== 'number' || rawMeta.flushedSegments <= expectedTotalSegments)
      ) {
        flushedSegments = rawMeta.flushedSegments
      }

      hasValidPackMeta = true
      if (!totalSegmentsMismatch && Array.isArray(rawMeta.entries) && fs.existsSync(paths.spillBinPath)) {
        let binSize = 0
        try {
          binSize = fs.statSync(paths.spillBinPath).size
        } catch {
          binSize = 0
        }
        if (binSize > 0) {
          for (let i = 0; i < rawMeta.entries.length; i++) {
            const tuple = rawMeta.entries[i]
            if (!Array.isArray(tuple) || tuple.length < 3) continue
            const idx = tuple[0]
            const offset = tuple[1]
            const length = tuple[2]
            if (
              !Number.isInteger(idx) ||
              !Number.isInteger(offset) ||
              !Number.isInteger(length) ||
              idx < flushedSegments ||
              (typeof expectedTotalSegments === 'number' && idx >= expectedTotalSegments) ||
              offset < 0 ||
              length <= 0 ||
              offset + length > binSize
            ) {
              continue
            }
            packEntries.set(idx, { offset, length })
            if (offset + length > packValidEndOffset) {
              packValidEndOffset = offset + length
            }
            totalSpilledBytes += length
          }
        }
      }
    }
  } else if (fs.existsSync(paths.spillBinPath)) {
    // 无有效元数据文件但残留孤立 .spill.bin，清理以避免损坏
    try { fs.unlinkSync(paths.spillBinPath) } catch {}
  }

  // 2. 向下兼容读取旧版 .segs 目录
  let hasValidLegacyMeta = false
  if (!totalSegmentsMismatch && fs.existsSync(paths.legacySegsDir)) {
    try {
      const entries = fs.readdirSync(paths.legacySegsDir)
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].endsWith('.tmp')) {
          try { fs.unlinkSync(path.join(paths.legacySegsDir, entries[i])) } catch {}
        }
      }

      if (fs.existsSync(paths.legacySegsMetaPath)) {
        try {
          const legacyMeta = JSON.parse(fs.readFileSync(paths.legacySegsMetaPath, 'utf8'))
          if (legacyMeta && typeof legacyMeta === 'object') {
            if (typeof legacyMeta.totalSegments === 'number') {
              if (typeof expectedTotalSegments === 'number' && legacyMeta.totalSegments !== expectedTotalSegments) {
                if (!hasValidPackMeta) {
                  totalSegmentsMismatch = true
                  totalSegments = legacyMeta.totalSegments
                }
              } else {
                if (totalSegments === undefined) totalSegments = legacyMeta.totalSegments
                hasValidLegacyMeta = true
              }
            }
            if (!totalSegmentsMismatch) {
              if (typeof legacyMeta.isFmp4 === 'boolean' && isFmp4 === undefined) {
                isFmp4 = legacyMeta.isFmp4
              }
              if (
                typeof legacyMeta.flushedSegments === 'number' &&
                Number.isInteger(legacyMeta.flushedSegments) &&
                legacyMeta.flushedSegments >= 0 &&
                (typeof expectedTotalSegments !== 'number' || legacyMeta.flushedSegments <= expectedTotalSegments)
              ) {
                if (!hasValidPackMeta && legacyMeta.flushedSegments > flushedSegments) {
                  flushedSegments = legacyMeta.flushedSegments
                }
                hasValidLegacyMeta = true
              }
            }
          }
        } catch {}
      }

      if (!totalSegmentsMismatch) {
        const remainingEntries = fs.readdirSync(paths.legacySegsDir)
        for (let i = 0; i < remainingEntries.length; i++) {
          const name = remainingEntries[i]
          const match = name.match(/^(\d+)\.seg$/)
          if (!match) continue
          const segIdx = parseInt(match[1], 10)
          const fullSegPath = path.join(paths.legacySegsDir, name)
          if (
            segIdx < flushedSegments ||
            (typeof expectedTotalSegments === 'number' && segIdx >= expectedTotalSegments) ||
            packEntries.has(segIdx)
          ) {
            try { fs.unlinkSync(fullSegPath) } catch {}
            continue
          }
          try {
            const segStat = fs.statSync(fullSegPath)
            if (segStat.size > 0) {
              legacySegFiles.set(segIdx, { filePath: fullSegPath, size: segStat.size })
              totalSpilledBytes += segStat.size
            } else {
              try { fs.unlinkSync(fullSegPath) } catch {}
            }
          } catch {
            try { fs.unlinkSync(fullSegPath) } catch {}
          }
        }
      }
    } catch {}
  }

  let mode: 'pack' | 'legacy-segs' | 'none' = 'none'
  if (!totalSegmentsMismatch) {
    if (hasValidPackMeta || packEntries.size > 0) {
      mode = 'pack'
    } else if (hasValidLegacyMeta || legacySegFiles.size > 0) {
      mode = 'legacy-segs'
    }
  }

  return {
    mode,
    totalSegmentsMismatch,
    totalSegments,
    isFmp4,
    flushedSegments,
    packEntries,
    packValidEndOffset,
    legacySegFiles,
    totalSpilledBytes
  }
}

export class M3U8SpillPack {
  public readonly spillBinPath: string
  public readonly spillMetaPath: string
  private readonly finalSavePath: string
  private readonly totalSegments: number
  private readonly isFmp4: boolean
  private flushedSegments: number
  private readonly indexMap = new Map<number, M3U8SpillDiskSpan>()
  private writeOffset = 0
  private handle: fs.promises.FileHandle | null = null
  private resumeExisting = false

  constructor(
    finalSavePath: string,
    opts: {
      totalSegments: number
      isFmp4: boolean
      flushedSegments: number
      initialEntries?: Map<number, M3U8SpillDiskSpan>
      initialWriteOffset?: number
    }
  ) {
    this.finalSavePath = finalSavePath
    const paths = getM3U8SpillPaths(finalSavePath)
    this.spillBinPath = paths.spillBinPath
    this.spillMetaPath = paths.spillMetaPath
    this.totalSegments = opts.totalSegments
    this.isFmp4 = opts.isFmp4
    this.flushedSegments = opts.flushedSegments
    if (opts.initialEntries) {
      opts.initialEntries.forEach((span, idx) => {
        this.indexMap.set(idx, { offset: span.offset, length: span.length })
      })
    }
    this.writeOffset = Math.max(0, opts.initialWriteOffset || 0)
    if (this.writeOffset > 0 && fs.existsSync(this.spillBinPath)) {
      this.resumeExisting = true
    }
  }

  private async ensureOpen(): Promise<fs.promises.FileHandle> {
    if (this.handle) return this.handle
    const dir = path.dirname(this.spillBinPath)
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }
    if (this.resumeExisting && fs.existsSync(this.spillBinPath)) {
      const fh = await fs.promises.open(this.spillBinPath, 'r+')
      try {
        await fh.truncate(this.writeOffset)
      } catch (err) {
        await fh.close().catch(() => {})
        throw err
      }
      this.handle = fh
      return fh
    }
    this.writeOffset = 0
    this.indexMap.clear()
    this.resumeExisting = false
    const fh = await fs.promises.open(this.spillBinPath, 'w')
    this.handle = fh
    return fh
  }

  async appendBatch(
    items: Array<{ index: number; buf: Buffer }>,
    flushedSegments: number
  ): Promise<Array<{ index: number; offset: number; length: number }>> {
    this.flushedSegments = flushedSegments
    if (!items || items.length === 0) {
      return []
    }

    const sorted = items.slice().sort((a, b) => a.index - b.index)
    const fh = await this.ensureOpen()
    const written: Array<{ index: number; offset: number; length: number }> = []
    const MAX_COALESCE_WRITE_BYTES = 16 * 1024 * 1024

    let cursor = 0
    while (cursor < sorted.length) {
      const batchBuffers: Buffer[] = []
      const batchItems: Array<{ index: number; length: number }> = []
      let batchBytes = 0

      while (cursor < sorted.length) {
        const item = sorted[cursor]
        if (batchBytes > 0 && batchBytes + item.buf.length > MAX_COALESCE_WRITE_BYTES) {
          break
        }
        batchBuffers.push(item.buf)
        batchItems.push({ index: item.index, length: item.buf.length })
        batchBytes += item.buf.length
        cursor++
      }

      const combined = batchBuffers.length === 1 ? batchBuffers[0] : Buffer.concat(batchBuffers)
      const batchStartOffset = this.writeOffset
      await writeBufferFully(fh, combined, batchStartOffset)

      let localOffset = 0
      for (let i = 0; i < batchItems.length; i++) {
        const bi = batchItems[i]
        const absOffset = batchStartOffset + localOffset
        this.indexMap.set(bi.index, { offset: absOffset, length: bi.length })
        written.push({ index: bi.index, offset: absOffset, length: bi.length })
        localOffset += bi.length
      }
      this.writeOffset += combined.length
    }

    await this.persistMeta(flushedSegments)
    return written
  }

  async persistMeta(flushedSegments?: number): Promise<void> {
    if (typeof flushedSegments === 'number') {
      this.flushedSegments = flushedSegments
    }
    const dir = path.dirname(this.spillMetaPath)
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }
    const entries: Array<[number, number, number]> = Array.from(this.indexMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([idx, span]) => [idx, span.offset, span.length])
    const payload: M3U8SpillMeta = {
      version: 2,
      totalSegments: this.totalSegments,
      isFmp4: this.isFmp4,
      flushedSegments: this.flushedSegments,
      entries
    }
    await writeFileAtomic(this.spillMetaPath, JSON.stringify(payload))
  }

  async close(): Promise<void> {
    if (this.handle) {
      const fh = this.handle
      this.handle = null
      await fh.close().catch(() => {})
    }
  }

  async cleanup(): Promise<void> {
    await this.close()
    await cleanupM3U8SpillArtifacts(this.finalSavePath)
  }
}

export function buildCoalescedM3U8StreamPlan(input: {
  prefixFilePath?: string
  prefixLength?: number
  orderedSegments: OrderedM3U8SegmentInput[]
}): { sources: M3U8StreamSource[]; totalBytes: number } {
  const sources: M3U8StreamSource[] = []
  let totalBytes = 0

  if (input.prefixFilePath && typeof input.prefixLength === 'number' && input.prefixLength > 0) {
    sources.push({
      kind: 'file-range',
      filePath: input.prefixFilePath,
      offset: 0,
      length: input.prefixLength
    })
    totalBytes += input.prefixLength
  }

  const sortedSegments = input.orderedSegments.slice().sort((a, b) => a.index - b.index)
  for (let i = 0; i < sortedSegments.length; i++) {
    const seg = sortedSegments[i]
    if (seg.fileRange && seg.fileRange.length > 0) {
      const last = sources[sources.length - 1]
      if (
        last &&
        last.kind === 'file-range' &&
        last.filePath === seg.fileRange.filePath &&
        last.offset + last.length === seg.fileRange.offset
      ) {
        last.length += seg.fileRange.length
      } else {
        sources.push({
          kind: 'file-range',
          filePath: seg.fileRange.filePath,
          offset: seg.fileRange.offset,
          length: seg.fileRange.length
        })
      }
      totalBytes += seg.fileRange.length
    } else if (seg.buffer && seg.buffer.length > 0) {
      sources.push({
        kind: 'buffer',
        buf: seg.buffer
      })
      totalBytes += seg.buffer.length
    }
  }

  return { sources, totalBytes }
}

async function readRangeChunkFromHandle(
  handle: fs.promises.FileHandle,
  toRead: number,
  position: number
): Promise<Buffer> {
  // 每次分配独立 Buffer 喂给流，避免异步管道写入尚未消费时被下一轮读取覆写
  const buf = Buffer.allocUnsafe(toRead)
  let totalRead = 0
  while (totalRead < toRead) {
    const { bytesRead } = await handle.read(buf, totalRead, toRead - totalRead, position + totalRead)
    if (bytesRead <= 0) {
      throw new Error(`读取溢写分片数据意外到达文件末尾 (已读 ${totalRead}/${toRead} 字节)`)
    }
    totalRead += bytesRead
  }
  return buf
}

export async function streamSourcesToWritable(
  sources: M3U8StreamSource[],
  writable: NodeJS.WritableStream & {
    destroyed?: boolean
    writableEnded?: boolean
    writableFinished?: boolean
    end: (cb?: () => void) => any
  },
  signal?: AbortSignal,
  chunkSize: number = 4 * 1024 * 1024
): Promise<void> {
  let streamClosed = Boolean(writable.destroyed || writable.writableEnded)

  const onStreamError = () => {
    streamClosed = true
  }
  const onStreamClose = () => {
    streamClosed = true
  }

  writable.on('error', onStreamError)
  writable.on('close', onStreamClose)

  const waitForDrainOrStop = (): Promise<boolean> => {
    if (signal?.aborted) {
      return Promise.reject(
        signal.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
      )
    }
    if (streamClosed || writable.destroyed || writable.writableEnded) {
      return Promise.resolve(false)
    }
    return new Promise<boolean>((resolve, reject) => {
      const cleanup = () => {
        writable.removeListener('drain', onDrain)
        writable.removeListener('close', onClose)
        writable.removeListener('error', onErr)
        if (signal) signal.removeEventListener('abort', onAbort)
      }
      const onDrain = () => {
        cleanup()
        resolve(true)
      }
      const onClose = () => {
        streamClosed = true
        cleanup()
        resolve(false)
      }
      const onErr = () => {
        streamClosed = true
        cleanup()
        resolve(false)
      }
      const onAbort = () => {
        cleanup()
        reject(
          signal?.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
        )
      }
      writable.on('drain', onDrain)
      writable.on('close', onClose)
      writable.on('error', onErr)
      if (signal) signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  const writeBufferToStream = async (buf: Buffer): Promise<boolean> => {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
    }
    if (streamClosed || writable.destroyed || writable.writableEnded) {
      return false
    }
    const ok = writable.write(buf)
    if (!ok) {
      return waitForDrainOrStop()
    }
    return true
  }

  let currentFilePath: string | null = null
  let currentHandle: fs.promises.FileHandle | null = null

  try {
    outer: for (let i = 0; i < sources.length; i++) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
      }
      if (streamClosed) break

      const src = sources[i]
      if (src.kind === 'buffer') {
        let offset = 0
        while (offset < src.buf.length) {
          const sliceLen = Math.min(chunkSize, src.buf.length - offset)
          const chunk = sliceLen === src.buf.length ? src.buf : src.buf.subarray(offset, offset + sliceLen)
          const cont = await writeBufferToStream(chunk)
          if (!cont) break outer
          offset += sliceLen
        }
        continue
      }

      if (currentFilePath !== src.filePath || !currentHandle) {
        if (currentHandle) {
          await currentHandle.close().catch(() => {})
          currentHandle = null
          currentFilePath = null
        }
        currentHandle = await fs.promises.open(src.filePath, 'r')
        currentFilePath = src.filePath
      }

      let remaining = src.length
      let pos = src.offset
      while (remaining > 0) {
        if (signal?.aborted) {
          throw signal.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
        }
        if (streamClosed) break outer
        const toRead = Math.min(chunkSize, remaining)
        const chunk = await readRangeChunkFromHandle(currentHandle, toRead, pos)
        const cont = await writeBufferToStream(chunk)
        if (!cont) break outer
        pos += toRead
        remaining -= toRead
      }
    }

    if (!streamClosed && !writable.destroyed && !writable.writableEnded) {
      await new Promise<void>((resolve) => {
        try {
          writable.end(() => resolve())
        } catch {
          resolve()
        }
      })
    }
  } finally {
    if (currentHandle) {
      await currentHandle.close().catch(() => {})
      currentHandle = null
    }
    writable.removeListener('error', onStreamError)
    writable.removeListener('close', onStreamClose)
  }
}

export async function materializeSourcesToFile(
  sources: M3U8StreamSource[],
  workSavePath: string,
  signal?: AbortSignal,
  chunkSize: number = 4 * 1024 * 1024
): Promise<void> {
  const dir = path.dirname(workSavePath)
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true })
  }

  let startIndex = 0
  let outFlags: 'w' | 'a' = 'w'
  const firstSrc = sources[0]
  const resolvedWorkPath = path.resolve(workSavePath)

  if (
    firstSrc &&
    firstSrc.kind === 'file-range' &&
    path.resolve(firstSrc.filePath) === resolvedWorkPath &&
    firstSrc.offset === 0 &&
    fs.existsSync(workSavePath)
  ) {
    const stat = fs.statSync(workSavePath)
    if (stat.size >= firstSrc.length) {
      if (stat.size > firstSrc.length) {
        const truncHandle = await fs.promises.open(workSavePath, 'r+')
        try {
          await truncHandle.truncate(firstSrc.length)
        } finally {
          await truncHandle.close().catch(() => {})
        }
      }
      outFlags = 'a'
      startIndex = 1
    }
  }

  const outHandle = await fs.promises.open(workSavePath, outFlags)
  let currentReadPath: string | null = null
  let currentReadHandle: fs.promises.FileHandle | null = null

  try {
    for (let i = startIndex; i < sources.length; i++) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
      }
      const src = sources[i]
      if (src.kind === 'buffer') {
        await writeBufferFully(outHandle, src.buf)
        continue
      }

      if (currentReadPath !== src.filePath || !currentReadHandle) {
        if (currentReadHandle) {
          await currentReadHandle.close().catch(() => {})
          currentReadHandle = null
          currentReadPath = null
        }
        currentReadHandle = await fs.promises.open(src.filePath, 'r')
        currentReadPath = src.filePath
      }

      let remaining = src.length
      let pos = src.offset
      while (remaining > 0) {
        if (signal?.aborted) {
          throw signal.reason instanceof Error ? signal.reason : new DOMException('User aborted download', 'AbortError')
        }
        const toRead = Math.min(chunkSize, remaining)
        const buf = await readRangeChunkFromHandle(currentReadHandle, toRead, pos)
        await writeBufferFully(outHandle, buf)
        pos += toRead
        remaining -= toRead
      }
    }
  } finally {
    if (currentReadHandle) {
      await currentReadHandle.close().catch(() => {})
    }
    await outHandle.close().catch(() => {})
  }
}
