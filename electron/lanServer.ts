import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { logger } from './logger';
import { getLanWebHtml } from './lanWebTemplate';
import { scanDirectory, resolveAppIconPath } from './utils/fileSystem';

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

export class LanServer {
  private server: http.Server | null = null;
  private currentPort = 8899;
  private isRunning = false;
  private password = '';
  private allowEdit = false;
  private validTokens = new Set<string>();
  private getResourcesCallback: () => Promise<ResourceInfo[]> = async () => [];

  constructor() {}

  public getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const devName of Object.keys(interfaces)) {
      const iface = interfaces[devName];
      if (!iface) continue;
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
          return alias.address;
        }
      }
    }
    return '127.0.0.1';
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

  public async start(config: LanServerConfig, getResources: () => Promise<ResourceInfo[]>): Promise<{ success: boolean; port?: number; error?: string }> {
    this.getResourcesCallback = getResources;
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

  private sendJson(res: http.ServerResponse, statusCode: number, data: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
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
        return this.sendJson(res, 200, {
          success: true,
          requireAuth: !!this.password,
          allowEdit: this.allowEdit
        });
      }

      // API: login
      if (pathname === '/api/login' && req.method === 'POST') {
        const body = await this.readRequestBody(req);
        const { password } = JSON.parse(body || '{}');
        if (this.password && password === this.password) {
          const token = crypto.randomBytes(24).toString('hex');
          this.validTokens.add(token);
          return this.sendJson(res, 200, { success: true, token });
        } else if (!this.password) {
          return this.sendJson(res, 200, { success: true, token: 'free' });
        } else {
          return this.sendJson(res, 401, { success: false, error: '密码错误' });
        }
      }

      // Check authentication for protected APIs
      if (!this.isAuthorized(req, urlObj)) {
        return this.sendJson(res, 401, { success: false, error: '未授权或登录已过期' });
      }

      // API: resources
      if (pathname === '/api/resources') {
        const resources = await this.getResourcesCallback();
        return this.sendJson(res, 200, {
          success: true,
          resources: resources.map(r => ({ id: r.id, name: r.name, path: r.path }))
        });
      }

      // API: directory
      if (pathname === '/api/directory') {
        const resourceId = urlObj.searchParams.get('id') || '';
        let targetPath = urlObj.searchParams.get('path') || '';

        const resources = await this.getResourcesCallback();
        if (!targetPath && resourceId) {
          const matched = resources.find(r => r.id === resourceId);
          if (matched && matched.path) {
            targetPath = matched.path;
          }
        }

        if (!targetPath) {
          return this.sendJson(res, 400, { success: false, error: '缺少路径参数' });
        }

        const isAllowed = await this.isPathInAllowedResources(targetPath);
        if (!isAllowed) {
          return this.sendJson(res, 403, { success: false, error: '拒绝访问非挂载资源目录' });
        }

        const scanRes = await scanDirectory(targetPath);
        if (!scanRes.success) {
          return this.sendJson(res, 400, { success: false, error: scanRes.error });
        }

        return this.sendJson(res, 200, { success: true, items: scanRes.items });
      }

      // Stream Range Stream (Video / Audio / Image / Static Files)
      if (pathname === '/stream') {
        const filePath = urlObj.searchParams.get('path') || '';
        if (!filePath) {
          res.writeHead(400);
          return res.end('Missing path');
        }

        const isAllowed = await this.isPathInAllowedResources(filePath);
        if (!isAllowed) {
          res.writeHead(403);
          return res.end('Forbidden');
        }

        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          return res.end('File not found');
        }

        const stat = await fs.promises.stat(filePath);
        const rangeHeader = req.headers['range'];

        let contentType = 'application/octet-stream';
        const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
        if (ext === 'mp4') contentType = 'video/mp4';
        else if (ext === 'm3u8') contentType = 'application/x-mpegURL';
        else if (ext === 'ts') contentType = 'video/MP2T';
        else if (ext === 'mkv') contentType = 'video/x-matroska';
        else if (ext === 'webm') contentType = 'video/webm';
        else if (ext === 'mov') contentType = 'video/quicktime';
        else if (ext === 'mp3') contentType = 'audio/mpeg';
        else if (ext === 'wav') contentType = 'audio/wav';
        else if (ext === 'aac') contentType = 'audio/aac';
        else if (ext === 'flac') contentType = 'audio/flac';
        else if (ext === 'ogg' || ext === 'opus') contentType = 'audio/ogg';
        else if (ext === 'png') contentType = 'image/png';
        else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
        else if (ext === 'webp') contentType = 'image/webp';
        else if (ext === 'gif') contentType = 'image/gif';
        else if (ext === 'svg') contentType = 'image/svg+xml';

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunksize = end - start + 1;

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': chunksize
          });
          const fileStream = fs.createReadStream(filePath, { start, end });
          return fileStream.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': stat.size
          });
          const fileStream = fs.createReadStream(filePath);
          return fileStream.pipe(res);
        }
      }

      // Download file attachment
      if (pathname === '/download') {
        const filePath = urlObj.searchParams.get('path') || '';
        if (!filePath) {
          res.writeHead(400);
          return res.end('Missing path');
        }

        const isAllowed = await this.isPathInAllowedResources(filePath);
        if (!isAllowed || !fs.existsSync(filePath)) {
          res.writeHead(404);
          return res.end('File not found');
        }

        const stat = await fs.promises.stat(filePath);
        const fileName = path.basename(filePath);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        const fileStream = fs.createReadStream(filePath);
        return fileStream.pipe(res);
      }

      // API: dir-tree
      if (pathname === '/api/dir-tree') {
        const resourceId = urlObj.searchParams.get('id') || '';
        let rootPath = urlObj.searchParams.get('rootPath') || '';

        const resources = await this.getResourcesCallback();
        if (!rootPath && resourceId) {
          const matched = resources.find(r => r.id === resourceId);
          if (matched && matched.path) {
            rootPath = matched.path;
          }
        }

        if (!rootPath) {
          return this.sendJson(res, 400, { success: false, error: '缺少 rootPath 参数' });
        }

        const isAllowed = await this.isPathInAllowedResources(rootPath);
        if (!isAllowed) {
          return this.sendJson(res, 403, { success: false, error: '越界操作' });
        }

        const maxDepth = 6;
        interface DirTreeItem {
          path: string;
          name: string;
          depth: number;
        }
        const results: DirTreeItem[] = [];

        const scan = async (currentDir: string, depth: number) => {
          if (depth > maxDepth) return;
          try {
            const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                const fullPath = path.join(currentDir, entry.name).replace(/\\/g, '/');
                results.push({
                  path: fullPath,
                  name: entry.name,
                  depth
                });
                await scan(fullPath, depth + 1);
              }
            }
          } catch (err: any) {
            logger.error('LanServer', `Error scanning dir tree: ${err.message}`);
          }
        };

        const rootName = path.basename(rootPath) || rootPath;
        results.push({
          path: rootPath.replace(/\\/g, '/'),
          name: `根目录 (${rootName})`,
          depth: 0
        });

        await scan(rootPath, 1);
        return this.sendJson(res, 200, { success: true, dirList: results });
      }

      // Edit Actions (Protected by allowEdit flag)
      if (pathname.startsWith('/api/') && ['/api/create-folder', '/api/rename', '/api/delete', '/api/move'].includes(pathname)) {
        if (!this.allowEdit) {
          return this.sendJson(res, 403, { success: false, error: '未开启局域网编辑权限，当前为只读模式' });
        }

        const body = await this.readRequestBody(req);
        const params = JSON.parse(body || '{}');

        if (pathname === '/api/create-folder') {
          const { parentPath, name } = params;
          if (!parentPath || !name) return this.sendJson(res, 400, { success: false, error: '参数缺失' });
          const targetDir = path.join(parentPath, name);
          const isAllowed = await this.isPathInAllowedResources(targetDir);
          if (!isAllowed) return this.sendJson(res, 403, { success: false, error: '越界操作' });
          await fs.promises.mkdir(targetDir, { recursive: true });
          return this.sendJson(res, 200, { success: true });
        }

        if (pathname === '/api/rename') {
          const { targetPath, newName } = params;
          if (!targetPath || !newName) return this.sendJson(res, 400, { success: false, error: '参数缺失' });
          const isAllowed = await this.isPathInAllowedResources(targetPath);
          if (!isAllowed) return this.sendJson(res, 403, { success: false, error: '越界操作' });
          const dir = path.dirname(targetPath);
          const newPath = path.join(dir, newName);
          await fs.promises.rename(targetPath, newPath);
          return this.sendJson(res, 200, { success: true });
        }

        if (pathname === '/api/delete') {
          const { targetPath } = params;
          if (!targetPath) return this.sendJson(res, 400, { success: false, error: '参数缺失' });
          const isAllowed = await this.isPathInAllowedResources(targetPath);
          if (!isAllowed) return this.sendJson(res, 403, { success: false, error: '越界操作' });
          await fs.promises.rm(targetPath, { recursive: true, force: true });
          return this.sendJson(res, 200, { success: true });
        }

        if (pathname === '/api/move') {
          const { sourcePath, targetDirPath } = params;
          if (!sourcePath || !targetDirPath) {
            return this.sendJson(res, 400, { success: false, error: '参数缺失' });
          }
          const isSourceAllowed = await this.isPathInAllowedResources(sourcePath);
          const isTargetAllowed = await this.isPathInAllowedResources(targetDirPath);
          if (!isSourceAllowed || !isTargetAllowed) {
            return this.sendJson(res, 403, { success: false, error: '越界操作' });
          }

          if (!fs.existsSync(sourcePath)) {
            return this.sendJson(res, 404, { success: false, error: '源文件不存在' });
          }

          const baseName = path.basename(sourcePath);
          let destPath = path.join(targetDirPath, baseName);

          if (path.resolve(sourcePath) === path.resolve(destPath)) {
            return this.sendJson(res, 400, { success: false, error: '目标位置与源位置相同' });
          }

          if (fs.existsSync(destPath)) {
            const ext = path.extname(baseName);
            const nameWithoutExt = path.basename(baseName, ext);
            destPath = path.join(targetDirPath, `${nameWithoutExt}_moved_${Date.now()}${ext}`);
          }

          try {
            await fs.promises.rename(sourcePath, destPath);
          } catch (err: any) {
            if (err.code === 'EXDEV') {
              const stat = await fs.promises.stat(sourcePath);
              if (stat.isDirectory()) {
                await fs.promises.cp(sourcePath, destPath, { recursive: true });
                await fs.promises.rm(sourcePath, { recursive: true, force: true });
              } else {
                await fs.promises.copyFile(sourcePath, destPath);
                await fs.promises.unlink(sourcePath);
              }
            } else {
              throw err;
            }
          }

          return this.sendJson(res, 200, { success: true, newPath: destPath.replace(/\\/g, '/') });
        }
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (err: any) {
      logger.error('LanServer', `Request handle error: ${err.message}`);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }

  private readRequestBody(req: http.IncomingMessage): Promise<string> {
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
}

export const lanServer = new LanServer();
