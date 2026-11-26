import http from 'http';
import fs from 'fs';
import path from 'path';

export interface LanServerConfig {
  enabled: boolean;
  port: number;
  password?: string;
  allowEdit?: boolean;
}

export interface ResourceInfo {
  id: string;
  name: string;
  path: string;
}

export interface TaskEvent {
  type: 'progress' | 'complete' | 'error' | 'cancelled';
  percent?: number;
  text?: string;
  outputPath?: string;
  newSize?: number;
  error?: string;
}

export interface ActiveStreamEntry {
  filePath: string;
  fileStream: fs.ReadStream;
  res: http.ServerResponse;
}

export interface LanDownloadTaskItem {
  id: string;
  name: string;
  status: string;
  progress: number;
  receivedBytes: number;
  totalBytes: number;
  speed: number;
  speedText?: string;
  etaSeconds?: number;
  savePath: string;
  errorMsg?: string;
  createdAt: number;
}

export interface LanDownloadCommand {
  action: 'add' | 'pause' | 'resume' | 'delete';
  id?: string;
  deleteFile?: boolean;
  items?: Array<{
    url: string;
    name?: string;
    saveDir: string;
    referer?: string;
    headers?: Record<string, string>;
    totalBytes?: number;
    panContext?: Record<string, any>;
  }>;
}

export interface LanDownloadCommandResult {
  success: boolean;
  count?: number;
  error?: string;
}

/**
 * 路由处理器共享上下文，封装 LanServer 内部状态与核心能力
 */
export interface LanRouteContext {
  allowEdit: () => boolean;
  getResources: () => Promise<ResourceInfo[]>;
  isPathInAllowedResources: (targetPath: string) => Promise<boolean>;
  releaseStreams: (targetPath: string) => number;
  notifyFileSystemChange: (event: any) => void;
  registerActiveStream: (entry: ActiveStreamEntry) => void;
  unregisterActiveStream: (entry: ActiveStreamEntry) => void;
  addTaskQueueSubscriber: (res: http.ServerResponse) => void;
  removeTaskQueueSubscriber: (res: http.ServerResponse) => void;
  subscribeTaskProgress: (taskId: string, res: http.ServerResponse) => TaskEvent | undefined;
  unsubscribeTaskProgress: (taskId: string, res: http.ServerResponse) => void;
  broadcastTaskEvent: (taskId: string, event: TaskEvent) => void;
  getDownloadTasksSnapshot: () => LanDownloadTaskItem[];
  addDownloadSubscriber: (res: http.ServerResponse) => void;
  removeDownloadSubscriber: (res: http.ServerResponse) => void;
  dispatchDownloadCommand: (cmd: LanDownloadCommand) => Promise<LanDownloadCommandResult>;
}

/**
 * 清洗用户自定义文件名，防止路径穿越和非法字符
 */
export function sanitizeFilename(filename: string, fallback: string): string {
  if (!filename) return fallback;
  const base = path.basename(filename.trim());
  const sanitized = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
  return sanitized || fallback;
}

/**
 * 输出带 CORS 头的 JSON HTTP 响应
 */
export function sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/**
 * 读取 HTTP POST 请求体文本（限制最大 10MB）
 */
export function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
