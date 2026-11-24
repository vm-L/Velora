import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger';
import { getLanWebHtml } from './lanWebTemplate';
import { resolveAppIconPath } from './utils/fileSystem';
import type { VideoQueueState } from './videoTaskManager';
import {
  sendJson,
  readRequestBody,
  type LanServerConfig,
  type ResourceInfo,
  type TaskEvent,
  type ActiveStreamEntry,
  type LanRouteContext
} from './lanServer/types';
import { getLocalIp } from './lanServer/network';
import { handleStreamRoutes } from './lanServer/streamRoutes';
import { handleFsRoutes } from './lanServer/fsRoutes';
import { handleVideoRoutes } from './lanServer/videoRoutes';

export type { LanServerConfig, ResourceInfo, TaskEvent };

export class LanServer {
  private server: http.Server | null = null;
  private currentPort = 8899;
  private isRunning = false;
  private password = '';
  private allowEdit = false;
  private validTokens = new Set<string>();
  private getResourcesCallback: () => Promise<ResourceInfo[]> = async () => [];
  private sseSubscribers = new Map<string, Set<http.ServerResponse>>();
  private taskQueueSubscribers = new Set<http.ServerResponse>();
  private latestTaskEvents = new Map<string, TaskEvent>();
  private onFileSystemChangeCallback: ((event: any) => void) | null = null;
  private onReleaseMediaStreamsCallback: ((targetPath: string) => void) | null = null;
  private activeStreams = new Set<ActiveStreamEntry>();
  private readonly routeContext: LanRouteContext;

  constructor() {
    this.routeContext = this.buildRouteContext();
  }

  public setFileSystemChangeCallback(cb: (event: any) => void) {
    this.onFileSystemChangeCallback = cb;
  }

  public setReleaseMediaStreamsCallback(cb: (targetPath: string) => void) {
    this.onReleaseMediaStreamsCallback = cb;
  }

  public releaseStreams(targetPath: string): number {
    if (!targetPath) return 0;
    const normalizedTarget = path.normalize(targetPath).toLowerCase();
    let closedCount = 0;

    for (const item of Array.from(this.activeStreams)) {
      const itemNorm = path.normalize(item.filePath).toLowerCase();
      const isDirectMatch = itemNorm === normalizedTarget;
      const isSubPathMatch = itemNorm.startsWith(normalizedTarget.endsWith(path.sep) ? normalizedTarget : normalizedTarget + path.sep);

      if (isDirectMatch || isSubPathMatch) {
        try { item.fileStream.destroy(); } catch {}
        try { if (!item.res.writableEnded) item.res.destroy(); } catch {}
        this.activeStreams.delete(item);
        closedCount++;
      }
    }

    if (this.onReleaseMediaStreamsCallback) {
      try {
        this.onReleaseMediaStreamsCallback(targetPath);
      } catch {}
    }

    if (closedCount > 0) {
      logger.info('LanServer', `[LanServer] 已强制释放 ${closedCount} 个局域网读流句柄: ${targetPath}`);
    }
    return closedCount;
  }

  public broadcastTaskQueueState(state: VideoQueueState) {
    const payload = `data: ${JSON.stringify(state)}\n\n`;
    this.taskQueueSubscribers.forEach((res) => {
      try {
        res.write(payload);
      } catch {
        this.taskQueueSubscribers.delete(res);
      }
    });
  }

  public broadcastTaskFinished(data: any) {
    const payload = `data: ${JSON.stringify({ type: 'task-finished', ...data })}\n\n`;
    this.taskQueueSubscribers.forEach((res) => {
      try {
        res.write(payload);
      } catch {
        this.taskQueueSubscribers.delete(res);
      }
    });
  }

  private notifyFileSystemChange(event: any) {
    if (this.onFileSystemChangeCallback) {
      try {
        this.onFileSystemChangeCallback(event);
      } catch (err: any) {
        logger.warn('LanServer', `Failed to broadcast file change: ${err.message}`);
      }
    }
  }

  public getLocalIp(): string {
    return getLocalIp();
  }

  public getStatus() {
    const ip = this.getLocalIp();
    return {
      running: this.isRunning,
      port: this.currentPort,
      ip,
      url: `http://${ip}:${this.currentPort}`,
      hasPassword: !!this.password,
      allowEdit: this.allowEdit
    };
  }

  public async start(config: LanServerConfig, getResources: () => Promise<ResourceInfo[]>, onFileSystemChange?: (event: any) => void): Promise<{ success: boolean; port?: number; error?: string }> {
    this.getResourcesCallback = getResources;
    if (onFileSystemChange) {
      this.onFileSystemChangeCallback = onFileSystemChange;
    }
    this.password = (config.password || '').trim();
    this.allowEdit = !!config.allowEdit;
    const targetPort = config.port > 0 && config.port <= 65535 ? config.port : 8899;

    if (this.isRunning && this.currentPort === targetPort && this.server) {
      return { success: true, port: this.currentPort };
    }

    await this.stop();

    return new Promise((resolve) => {
      try {
        const server = http.createServer(async (req, res) => {
          await this.handleRequest(req, res);
        });

        server.on('error', (err: any) => {
          logger.error('LanServer', `Server error on port ${targetPort}: ${err.message}`);
          this.isRunning = false;
          this.server = null;
          resolve({ success: false, error: err.code === 'EADDRINUSE' ? `端口 ${targetPort} 已被占用` : err.message });
        });

        server.listen(targetPort, '0.0.0.0', () => {
          this.server = server;
          this.isRunning = true;
          this.currentPort = targetPort;
          logger.info('LanServer', `LAN Share Server listening on http://0.0.0.0:${this.currentPort}`);
          resolve({ success: true, port: this.currentPort });
        });
      } catch (err: any) {
        logger.error('LanServer', `Failed to start LAN server: ${err.message}`);
        resolve({ success: false, error: err.message });
      }
    });
  }

  public async stop(): Promise<void> {
    this.taskQueueSubscribers.forEach((res) => {
      try { res.end(); } catch {}
    });
    this.taskQueueSubscribers.clear();

    if (this.server) {
      return new Promise((resolve) => {
        this.server?.close(() => {
          this.isRunning = false;
          this.server = null;
          logger.info('LanServer', 'LAN Share Server stopped');
          resolve();
        });
      });
    }
    this.isRunning = false;
  }

  private isAuthorized(req: http.IncomingMessage, urlObj: URL): boolean {
    if (!this.password) return true;

    // Check Bearer token in headers
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (this.validTokens.has(token)) return true;
    }

    // Check token in query params
    const tokenQuery = urlObj.searchParams.get('token');
    if (tokenQuery && this.validTokens.has(tokenQuery)) {
      return true;
    }

    return false;
  }

  private async isPathInAllowedResources(targetPath: string): Promise<boolean> {
    if (!targetPath) return false;
    const cleanTarget = path.normalize(targetPath).toLowerCase().replace(/[\\/]+$/, '');
    const resources = await this.getResourcesCallback();
    for (const r of resources) {
      if (r.path) {
        const cleanRoot = path.normalize(r.path).toLowerCase().replace(/[\\/]+$/, '');
        if (
          cleanTarget === cleanRoot ||
          cleanTarget.startsWith(cleanRoot + path.sep) ||
          cleanTarget.startsWith(cleanRoot + '/') ||
          cleanTarget.startsWith(cleanRoot + '\\')
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private buildRouteContext(): LanRouteContext {
    return {
      allowEdit: () => this.allowEdit,
      getResources: () => this.getResourcesCallback(),
      isPathInAllowedResources: (targetPath) => this.isPathInAllowedResources(targetPath),
      releaseStreams: (targetPath) => this.releaseStreams(targetPath),
      notifyFileSystemChange: (event) => this.notifyFileSystemChange(event),
      registerActiveStream: (entry) => this.activeStreams.add(entry),
      unregisterActiveStream: (entry) => this.activeStreams.delete(entry),
      addTaskQueueSubscriber: (res) => this.taskQueueSubscribers.add(res),
      removeTaskQueueSubscriber: (res) => this.taskQueueSubscribers.delete(res),
      subscribeTaskProgress: (taskId, res) => {
        if (!this.sseSubscribers.has(taskId)) {
          this.sseSubscribers.set(taskId, new Set());
        }
        this.sseSubscribers.get(taskId)!.add(res);
        return this.latestTaskEvents.get(taskId);
      },
      unsubscribeTaskProgress: (taskId, res) => {
        const subs = this.sseSubscribers.get(taskId);
        if (!subs) return;
        subs.delete(res);
        if (subs.size === 0) {
          this.sseSubscribers.delete(taskId);
        }
      },
      broadcastTaskEvent: (taskId, event) => this.broadcastTaskEvent(taskId, event)
    };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const urlObj = new URL(req.url || '', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = urlObj.pathname;

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.writeHead(204);
        return res.end();
      }

      // Root Web page
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(getLanWebHtml());
      }

      // Static assets: App Icon / Favicon
      if (pathname === '/icon.png' || pathname === '/favicon.ico') {
        const iconPath = resolveAppIconPath();
        if (iconPath) {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
          return fs.createReadStream(iconPath).pipe(res);
        }
        res.writeHead(404);
        return res.end();
      }

      // API: info
      if (pathname === '/api/info') {
        return sendJson(res, 200, {
          success: true,
          requireAuth: !!this.password,
          allowEdit: this.allowEdit
        });
      }

      // API: login
      if (pathname === '/api/login' && req.method === 'POST') {
        const body = await readRequestBody(req);
        const { password } = JSON.parse(body || '{}');
        if (this.password && password === this.password) {
          const token = crypto.randomBytes(24).toString('hex');
          this.validTokens.add(token);
          return sendJson(res, 200, { success: true, token });
        } else if (!this.password) {
          return sendJson(res, 200, { success: true, token: 'free' });
        } else {
          return sendJson(res, 401, { success: false, error: '密码错误' });
        }
      }

      // Check authentication for protected APIs
      if (!this.isAuthorized(req, urlObj)) {
        return sendJson(res, 401, { success: false, error: '未授权或登录已过期' });
      }

      if (await handleStreamRoutes(req, res, urlObj, this.routeContext)) return;
      if (await handleFsRoutes(req, res, urlObj, this.routeContext)) return;
      if (await handleVideoRoutes(req, res, urlObj, this.routeContext)) return;

      res.writeHead(404);
      res.end('Not Found');
    } catch (err: any) {
      logger.error('LanServer', `Request handle error: ${err.message}`);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }

  private broadcastTaskEvent(taskId: string, event: TaskEvent): void {
    this.latestTaskEvents.set(taskId, event);
    const subscribers = this.sseSubscribers.get(taskId);
    if (subscribers && subscribers.size > 0) {
      const dataStr = `data: ${JSON.stringify(event)}\n\n`;
      subscribers.forEach((clientRes) => {
        try {
          clientRes.write(dataStr);
        } catch {
          // ignore
        }
      });
    }
  }
}

export const lanServer = new LanServer();
