export interface VideoSegment {
  start: number
  end: number
}

export interface EditVideoParams {
  taskId: string
  sourcePath: string
  segments: VideoSegment[]
  outputPath?: string
  mode: 'replace' | 'saveAs'
}

export interface MergeVideosParams {
  taskId: string
  videoPaths: string[]
  outputPath: string
}

export interface CompressVideoParams {
  taskId: string
  filePath: string
  targetBitrateKbps: number
  outputPath?: string
  mode?: 'replace' | 'saveAs'
}

export interface ExtractAudioParams {
  taskId: string
  sourcePath: string
  format: 'copy' | 'mp3'
  outputPath?: string
}

export interface ExportGifParams {
  taskId: string
  sourcePath: string
  start: number
  end: number
  outputPath?: string
  fps?: number
  maxWidth?: number
}

export interface ProbeResult {
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  audioCodec?: string
}
