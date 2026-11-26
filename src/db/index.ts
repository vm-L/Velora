import Dexie, { type Table } from 'dexie';

export interface PanTaskContext {
  panType: string;
  mode: 'drive' | 'share';
  fid: string;
  fidToken?: string;
  pwdId?: string;
  stoken?: string;
  cleanupDirFid?: string;
  extra?: Record<string, any>;
}

export interface DownloadTask {
  id: string; // Unique ID (e.g. UUID)
  url: string;
  name: string;
  savePath: string; // Full path where the file is saved
  status: 'resolving' | 'downloading' | 'converting' | 'compressing' | 'processing' | 'paused' | 'completed' | 'error' | 'waiting' | 'file_removed' | 'file_corrupted';
  progress: number; // 0-100
  receivedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  downloadedSegments?: number;
  totalSegments?: number;
  canSkipFailedSegments?: boolean;
  failedSegmentsCount?: number;
  skippedSegments?: number;
  referer?: string;
  headers?: Record<string, string>;
  panContext?: PanTaskContext;
  errorMsg?: string;
  speedText?: string;
  etaSeconds?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlaybackProgressRecord {
  path: string; // 归一化后的本地视频路径作为主键
  position: number; // 上次播放秒数
  duration: number; // 视频总时长秒数
  updatedAt: number;
}

export class VeloraDB extends Dexie {
  downloads!: Table<DownloadTask, string>;
  playbackProgress!: Table<PlaybackProgressRecord, string>;

  constructor() {
    super('VeloraDB');
    this.version(1).stores({
      downloads: 'id, status, createdAt' // Primary key and indexed props
    });
    this.version(2).stores({
      downloads: 'id, status, createdAt',
      playbackProgress: 'path, updatedAt'
    });
  }
}

export const db = new VeloraDB();
