import Dexie, { type Table } from 'dexie';

export interface DownloadTask {
  id: string; // Unique ID (e.g. UUID)
  url: string;
  name: string;
  savePath: string; // Full path where the file is saved
  status: 'resolving' | 'downloading' | 'processing' | 'paused' | 'completed' | 'error' | 'waiting' | 'file_removed' | 'file_corrupted';
  progress: number; // 0-100
  receivedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  downloadedSegments?: number;
  totalSegments?: number;
  referer?: string;
  cookie?: string;
  headers?: Record<string, string>;
  errorMsg?: string;
  createdAt: number;
  updatedAt: number;
}

export class VeloraDB extends Dexie {
  downloads!: Table<DownloadTask, string>;

  constructor() {
    super('VeloraDB');
    this.version(1).stores({
      downloads: 'id, status, createdAt' // Primary key and indexed props
    });
  }
}

export const db = new VeloraDB();
