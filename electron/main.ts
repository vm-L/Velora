import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, session, clipboard, net, dialog, webContents, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import http from 'http'
import crypto from 'crypto'
import { scanDirectory, resolveAppIcoPath, resolveAppIconPath, retryFileOperation, copyDirRecursive, searchDirectoryRecursive, sanitizeFileName, resolveSafeChildPath } from './utils/fileSystem'

// 启动渲染与图形硬件加速配置
app.commandLine.appendSwitch('disable-http-cache', 'false');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// 配置本地绿色同级目录数据存储路径 (dev 及打包便携版数据均归集于程序同级目录的 data/ 文件夹内)
const getLocalDataDir = () => {
  let baseDir = process.cwd();
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    baseDir = process.env.PORTABLE_EXECUTABLE_DIR;
  } else if (app.isPackaged) {
    baseDir = path.dirname(app.getPath('exe'));
  }
  const dataDir = path.join(baseDir, 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {
      // ignore
    }
  }
  return dataDir;
};

const localDataPath = getLocalDataDir();
app.setPath('userData', localDataPath);
app.setPath('sessionData', path.join(localDataPath, 'session'));

import { isAdUrl, updateCompiledRules, fetchRemoteRuleSource, parseRulesText, saveRuleCacheFile } from './adblock'
import { getHeadersForUrl, fetchWithRedirectGuard } from './downloader'
import { logger } from './logger'
import { editVideoSegments, cancelVideoEdit, EditVideoParams, mergeVideos, cancelVideoMerge, MergeVideosParams, cleanupAppTempDir } from './videoEditor'
import { videoTaskManager } from './videoTaskManager'
import { panService } from './pan/service'
import { panAccountManager, PAN_CONFIGS } from './pan/accountManager'

interface ActiveMediaStream {
  filePath: string;
  fileStream: fs.ReadStream;
  res: http.ServerResponse;
}

const activeMediaStreams = new Set<ActiveMediaStream>();

export function releaseLocalMediaStreams(targetPath: string): number {
  if (!targetPath) return 0;
  const normalizedTarget = path.normalize(targetPath).toLowerCase();
  let closedCount = 0;

  for (const item of Array.from(activeMediaStreams)) {
    const itemNorm = path.normalize(item.filePath).toLowerCase();
    const isDirectMatch = itemNorm === normalizedTarget;
    const isSubPathMatch = itemNorm.startsWith(normalizedTarget.endsWith(path.sep) ? normalizedTarget : normalizedTarget + path.sep);

    if (isDirectMatch || isSubPathMatch) {
      try {
        item.fileStream.destroy();
      } catch {}
      try {
        if (!item.res.writableEnded) {
          item.res.destroy();
        }
      } catch {}
      activeMediaStreams.delete(item);
      closedCount++;
    }
  }

  if (closedCount > 0) {
    logger.info('Main', `[MediaServer] 已强制释放 ${closedCount} 个本地媒体流句柄: ${targetPath}`);
  }
  return closedCount;
}

const mediaServerToken = crypto.randomBytes(24).toString('hex');
const SENSITIVE_STREAM_EXTS = new Set(['.json', '.enc', '.log', '.env', '.db', '.sqlite', '.sqlite3', '.key', '.pem', '.crt', '.pfx']);

function isSensitiveStreamPath(targetPath: string): boolean {
  try {
    const resolved = path.resolve(targetPath);
    const resolvedLower = resolved.toLowerCase();
    const dataDirResolved = path.resolve(localDataPath).toLowerCase();
    // 禁止通过流服务访问应用配置、密钥与会话目录内文件
    if (resolvedLower === dataDirResolved || resolvedLower.startsWith(dataDirResolved + path.sep)) {
      return true;
    }
    const ext = path.extname(resolvedLower);
    if (SENSITIVE_STREAM_EXTS.has(ext)) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

function resolveAllowedStreamOrigin(originHeader?: string): string | null {
  if (!originHeader) return null;
  if (
    originHeader === 'null' ||
    originHeader.startsWith('file://') ||
    originHeader.startsWith('http://localhost:') ||
    originHeader.startsWith('http://127.0.0.1:')
  ) {
    return originHeader;
  }
  return null;
}

interface PanPreviewEntry {
  url: string;
  headers: Record<string, string>;
  filename: string;
  createdAt: number;
}

const panPreviewRegistry = new Map<string, PanPreviewEntry>();

function inferMediaContentType(filePathOrName: string): string {
  const ext = (filePathOrName || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'm3u8') return 'application/x-mpegURL';
  if (ext === 'ts') return 'video/MP2T';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mkv') return 'video/x-matroska';
  if (ext === 'flv' || ext === 'f4v') return 'video/x-flv';
  if (ext === 'mov' || ext === 'qt') return 'video/quicktime';
  if (ext === 'avi') return 'video/x-msvideo';
  if (ext === 'wmv') return 'video/x-ms-wmv';
  if (ext === '3gp') return 'video/3gpp';
  if (ext === 'ogg' || ext === 'ogv') return 'video/ogg';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

let streamServerPort = 0;
const mediaServer = http.createServer(async (req, res) => {
  try {
    const allowedOrigin = resolveAllowedStreamOrigin(typeof req.headers.origin === 'string' ? req.headers.origin : undefined);
    if (req.method === 'OPTIONS') {
      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.writeHead(204);
      return res.end();
    }

    const urlObj = new URL(req.url || '', `http://${req.headers.host || '127.0.0.1'}`);
    if (urlObj.pathname === '/stream') {
      const reqToken = urlObj.searchParams.get('token');
      if (!reqToken || reqToken !== mediaServerToken) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      const filePath = urlObj.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing path');
      }

      if (isSensitiveStreamPath(filePath)) {
        res.writeHead(403);
        return res.end('Forbidden path');
      }
      
      const stat = await fs.promises.stat(filePath);
      const rangeHeader = req.headers['range'];
      
      let contentType = 'application/octet-stream';
      const ext = filePath.split('.').pop()?.toLowerCase();
      if (ext === 'mp4' || ext === 'm4v') contentType = 'video/mp4';
      else if (ext === 'm3u8') contentType = 'application/x-mpegURL';
      else if (ext === 'ts') contentType = 'video/MP2T';
      else if (ext === 'mp3') contentType = 'audio/mpeg';
      else if (ext === 'webm') contentType = 'video/webm';
      else if (ext === 'mkv') contentType = 'video/x-matroska';
      else if (ext === 'flv' || ext === 'f4v') contentType = 'video/x-flv';
      else if (ext === 'mov' || ext === 'qt') contentType = 'video/quicktime';
      else if (ext === 'avi') contentType = 'video/x-msvideo';
      else if (ext === 'wmv') contentType = 'video/x-ms-wmv';
      else if (ext === '3gp') contentType = 'video/3gpp';
      else if (ext === 'ogg' || ext === 'ogv') contentType = 'video/ogg';
      else if (ext === 'png') contentType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
      else if (ext === 'webp') contentType = 'image/webp';
      else if (ext === 'gif') contentType = 'image/gif';
      
      const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
      const lastModified = stat.mtime.toUTCString();
      const ifRange = req.headers['if-range'];
      const isIfRangeValid = !ifRange || ifRange === etag || ifRange === lastModified;

      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache, private');
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', lastModified);
      res.setHeader('Connection', 'keep-alive');

      if (rangeHeader && stat.size > 0 && isIfRangeValid) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (!match) {
          res.writeHead(416, {
            'Content-Range': `bytes */${stat.size}`
          });
          return res.end();
        }

        let start = match[1] ? parseInt(match[1], 10) : NaN;
        let end = match[2] ? parseInt(match[2], 10) : NaN;

        if (isNaN(start)) {
          if (isNaN(end)) {
            res.writeHead(416, {
              'Content-Range': `bytes */${stat.size}`
            });
            return res.end();
          }
          start = Math.max(0, stat.size - end);
          end = stat.size - 1;
        } else if (isNaN(end)) {
          end = stat.size - 1;
        }

        if (start >= stat.size || start < 0 || end < start) {
          res.writeHead(416, {
            'Content-Range': `bytes */${stat.size}`
          });
          return res.end();
        }

        end = Math.min(end, stat.size - 1);

        const chunksize = (end - start) + 1;
        
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes'
        });
        const fileStream = fs.createReadStream(filePath, { start, end });
        const streamEntry: ActiveMediaStream = { filePath, fileStream, res };
        activeMediaStreams.add(streamEntry);
        const cleanUpStream = () => {
          activeMediaStreams.delete(streamEntry);
          try { fileStream.destroy(); } catch {}
        };

        fileStream.on('error', (err) => {
          logger.warn('Protocol', `Local media stream pipe error: ${err.message}`);
          cleanUpStream();
          if (!res.headersSent) {
            res.writeHead(500);
          }
          res.end();
        });
        req.on('close', cleanUpStream);
        res.on('finish', cleanUpStream);
        fileStream.on('close', () => activeMediaStreams.delete(streamEntry));
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes'
        });
        const fileStream = fs.createReadStream(filePath);
        const streamEntry: ActiveMediaStream = { filePath, fileStream, res };
        activeMediaStreams.add(streamEntry);
        const cleanUpStream = () => {
          activeMediaStreams.delete(streamEntry);
          try { fileStream.destroy(); } catch {}
        };

        fileStream.on('error', (err) => {
          logger.warn('Protocol', `Local media full stream error: ${err.message}`);
          cleanUpStream();
          if (!res.headersSent) {
            res.writeHead(500);
          }
          res.end();
        });
        req.on('close', cleanUpStream);
        res.on('finish', cleanUpStream);
        fileStream.on('close', () => activeMediaStreams.delete(streamEntry));
        fileStream.pipe(res);
      }
    } else if (urlObj.pathname === '/pan-stream') {
      const reqToken = urlObj.searchParams.get('token');
      if (!reqToken || reqToken !== mediaServerToken) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      const sid = urlObj.searchParams.get('sid') || '';
      const entry = panPreviewRegistry.get(sid);
      if (!entry) {
        res.writeHead(404);
        return res.end('Preview not found or expired');
      }

      const upstreamHeaders: Record<string, string> = { ...entry.headers };
      if (typeof req.headers['range'] === 'string') {
        upstreamHeaders['Range'] = req.headers['range'];
      }
      if (typeof req.headers['if-range'] === 'string') {
        upstreamHeaders['If-Range'] = req.headers['if-range'];
      }

      const abortCtrl = new AbortController();
      req.on('close', () => {
        try { abortCtrl.abort(); } catch {}
      });

      const upstream = await fetchWithRedirectGuard(entry.url, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
        signal: abortCtrl.signal as any
      });

      const respHeaders: Record<string, string> = {};
      const passHeaders = ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control'];
      for (const h of passHeaders) {
        const val = upstream.headers?.get?.(h);
        if (val) respHeaders[h] = val;
      }
      const rawCt = upstream.headers?.get?.('content-type') || '';
      const ct = rawCt && !rawCt.toLowerCase().includes('octet-stream')
        ? rawCt
        : inferMediaContentType(entry.filename);
      if (ct) respHeaders['Content-Type'] = ct;
      if (!respHeaders['Accept-Ranges']) {
        respHeaders['Accept-Ranges'] = 'bytes';
      }
      if (allowedOrigin) {
        respHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
        respHeaders['Vary'] = 'Origin';
      }

      res.writeHead(upstream.status || 200, respHeaders);
      if (req.method === 'HEAD' || !upstream.body) {
        return res.end();
      }

      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0 && !res.destroyed) {
            const canContinue = res.write(Buffer.from(value));
            if (!canContinue) {
              await new Promise<void>((r) => res.once('drain', r));
            }
          }
        }
      } catch (streamErr: any) {
        if (!abortCtrl.signal.aborted) {
          logger.warn('Protocol', `Pan stream pump error: ${streamErr?.message || streamErr}`);
        }
      } finally {
        try { await reader.cancel(); } catch {}
        if (!res.writableEnded) res.end();
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err: any) {
    logger.error('Protocol', `Local media server error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(404);
    }
    if (!res.writableEnded) {
      res.end('File not found');
    }
  }
});

mediaServer.listen(0, '127.0.0.1', () => {
  streamServerPort = (mediaServer.address() as any).port;
  logger.info('System', `Local media server listening on port ${streamServerPort}`);
});

import { exec } from 'child_process'

// Create a polyfill for __dirname in ESM if needed, though we are compiling via vite-plugin-electron which handles __dirname if we use standard CJS/ESM mixed. 
// However, standard electron vite plugin setup allows CJS. Let's stick to CJS-like paths or use path.join(process.env.DIST, ...)

process.env.DIST_ELECTRON = __dirname
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

import { storeManager, setupStoreHandlers } from './store'
import { downloader } from './downloader'
import { lanServer } from './lanServer'
import { getSplashHtml } from './splash'
import { trayWindowManager } from './trayWindow'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let splashStartTime = 0
let isFirstScreenReady = false

export interface FileSystemChangeEvent {
  type: 'add' | 'delete' | 'rename' | 'move' | 'overwrite' | 'sync-dir';
  name?: string;
  path?: string;
  oldPath?: string;
  newPath?: string;
  isDirectory?: boolean;
  dirPath?: string;
  files?: Array<{ name: string; path: string }>;
}

export function broadcastFileSystemChange(event: FileSystemChangeEvent) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('file-system-changed', event);
    } catch (err: any) {
      logger.warn('Main', `Failed to broadcast file-system-changed: ${err.message}`);
    }
  }
}

// 获取应用图标 Base64 Data URL (优先使用 build/icon.ico，供 Splash 与 Tray 备用)
let cachedIconBase64: string | null = null;
const getIconDataUrl = (): string => {
  if (cachedIconBase64) return cachedIconBase64;
  const icoPath = resolveAppIcoPath();
  if (icoPath) {
    try {
      const buf = fs.readFileSync(icoPath);
      if (buf && buf.length > 0) {
        cachedIconBase64 = `data:image/x-icon;base64,${buf.toString('base64')}`;
        return cachedIconBase64;
      }
    } catch {}
  }
  const pngPath = resolveAppIconPath();
  if (pngPath) {
    try {
      const buf = fs.readFileSync(pngPath);
      if (buf && buf.length > 0) {
        cachedIconBase64 = `data:image/png;base64,${buf.toString('base64')}`;
        return cachedIconBase64;
      }
    } catch {}
  }
  return '';
};

// 设置 Windows 任务栏应用唯一 AppUserModelId，确保任务栏图标与主程序图标统一关联
if (process.platform === 'win32') {
  app.setAppUserModelId('com.velora.app');
}

let cachedAppIcon: Electron.NativeImage | null = null;
const getAppIcon = () => {
  if (cachedAppIcon && !cachedAppIcon.isEmpty()) return cachedAppIcon;
  const icoPath = resolveAppIcoPath();
  if (icoPath) {
    const img = nativeImage.createFromPath(icoPath);
    if (!img.isEmpty()) {
      cachedAppIcon = img;
      return cachedAppIcon;
    }
  }
  const pngPath = resolveAppIconPath();
  if (pngPath) {
    const img = nativeImage.createFromPath(pngPath);
    if (!img.isEmpty()) {
      cachedAppIcon = img;
      return cachedAppIcon;
    }
  }
  const fallbackUrl = getIconDataUrl();
  const fallbackImg = fallbackUrl ? nativeImage.createFromDataURL(fallbackUrl) : nativeImage.createEmpty();
  if (!fallbackImg.isEmpty()) {
    cachedAppIcon = fallbackImg;
  }
  return fallbackImg;
};

function createSplashWindow(theme: string = 'light') {
  splashStartTime = Date.now();
  const icoPath = resolveAppIcoPath();
  const appIcon = getAppIcon();
  splashWindow = new BrowserWindow({
    width: 380,
    height: 240,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    backgroundColor: '#00000000',
    icon: (process.platform === 'win32' && icoPath) ? icoPath : appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const iconDataUrl = getIconDataUrl();
  const version = typeof app.getVersion === 'function' ? app.getVersion() : '1.4.3';
  const html = getSplashHtml(theme, iconDataUrl, version);
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed() && !isFirstScreenReady) {
      splashWindow.show();
    }
  });
}

function updateSplashTheme(theme: string) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.executeJavaScript(`
    window.setTheme && window.setTheme(${JSON.stringify(theme)});
  `).catch(() => {});
}

function finishStartupAndShowMain() {
  if (isFirstScreenReady) return;
  isFirstScreenReady = true;

  const elapsed = Date.now() - splashStartTime;
  const minDisplayTime = 300; // 保底展示 300ms
  const remainingWait = Math.max(0, minDisplayTime - elapsed);

  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.executeJavaScript(`
        document.body.classList.add('fade-out');
      `).catch(() => {});

      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.destroy();
          splashWindow = null;
        }
      }, 250); // 淡出动画过渡时长
    } else {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  }, remainingWait);
}

const globalMediaPageMap = new Map<string, string>();
const globalHostPageMap = new Map<string, string>();
const webContentsUrlMap = new Map<number, string>();
const MAX_REFERER_CACHE_SIZE = 1000;

function isLocalUrl(urlStr?: string): boolean {
  if (!urlStr) return true;
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || u.protocol === 'file:' || u.protocol === 'app:' || u.protocol === 'velora:';
  } catch {
    return true;
  }
}

function registerMediaReferer(mediaUrl: string, pageUrl: string) {
  if (!mediaUrl || !pageUrl || isLocalUrl(pageUrl)) return;
  let targetOrigin = pageUrl;
  try {
    const u = new URL(pageUrl);
    if (u.origin && u.origin !== 'null') targetOrigin = u.origin;
  } catch {}

  if (globalMediaPageMap.size >= MAX_REFERER_CACHE_SIZE) {
    const oldestKey = globalMediaPageMap.keys().next().value;
    if (oldestKey) globalMediaPageMap.delete(oldestKey);
  }
  globalMediaPageMap.set(mediaUrl, targetOrigin);

  try {
    const u = new URL(mediaUrl);
    const host = u.hostname.toLowerCase();
    if (host) {
      if (globalHostPageMap.size >= MAX_REFERER_CACHE_SIZE) {
        const oldestHost = globalHostPageMap.keys().next().value;
        if (oldestHost) globalHostPageMap.delete(oldestHost);
      }
      globalHostPageMap.set(host, targetOrigin);
    }
  } catch {}
}

export interface VeloraClientConfig {
  clientId: string;
  referer: string;
  origin?: string;
}

class VeloraClientManager {
  private clients = new Map<string, VeloraClientConfig>();

  registerClient(config: VeloraClientConfig) {
    if (!config.clientId) return;
    const referer = (config.referer || '').trim();
    let origin = config.origin;
    try {
      if (referer && !origin) {
        const u = new URL(referer);
        if (u.origin && u.origin !== 'null') {
          origin = u.origin;
        }
      }
    } catch {}
    this.clients.set(config.clientId, {
      clientId: config.clientId,
      referer,
      origin
    });
  }

  unregisterClient(clientId: string) {
    this.clients.delete(clientId);
  }

  getClient(clientId: string): VeloraClientConfig | undefined {
    return this.clients.get(clientId);
  }
}

export const clientManager = new VeloraClientManager();

function getHeaderValue(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const lowerKey = key.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lowerKey) {
      const val = headers[k];
      return Array.isArray(val) ? val[0] : val;
    }
  }
  return undefined;
}

function removeHeaderCaseInsensitive(headers: Record<string, any>, key: string) {
  const lowerKey = key.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lowerKey) {
      delete headers[k];
    }
  }
}

function createWindow() {
  const icoPath = resolveAppIcoPath();
  const appIcon = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 850,
    resizable: true,
    title: "Velora",
    icon: (process.platform === 'win32' && icoPath) ? icoPath : appIcon,
    autoHideMenuBar: true,
    frame: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#FDFBF7',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true
    },
  })

  downloader.setWindow(mainWindow)

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized')
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-unmaximized')
  })

  mainWindow.webContents.on('enter-html-full-screen', () => {
    mainWindow?.setFullScreen(true)
  })

  mainWindow.webContents.on('leave-html-full-screen', () => {
    mainWindow?.setFullScreen(false)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    downloader.setWindow(null)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST, 'index.html'))
  }
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }
}

let isIpcInitialized = false;

function setupIpcHandlers() {
  if (isIpcInitialized) return;
  isIpcInitialized = true;

  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window-close', async () => {
    const behavior = await storeManager.getSetting('closeBehavior')
    if (behavior === 'tray') {
      mainWindow?.hide()
    } else {
      app.quit()
    }
  })

  ipcMain.on('app-first-screen-ready', () => {
    finishStartupAndShowMain();
  })

  ipcMain.on('open-external', (_, url) => {
    try {
      const parsed = new URL(String(url || ''));
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(parsed.toString());
      } else {
        logger.warn('Security', `Blocked openExternal with disallowed protocol: ${parsed.protocol}`);
      }
    } catch {}
  })

  ipcMain.on('show-item-in-folder', (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })


  ipcMain.handle('pause-webview', (_, id) => {
    const wc = webContents.fromId(id);
    if (wc) {
      wc.mainFrame.frames.forEach(frame => {
        frame.executeJavaScript('document.querySelectorAll("video").forEach(v => v.pause())').catch(()=>{});
      });
    }
  });

  ipcMain.handle('resume-webview', (_, id) => {
    const wc = webContents.fromId(id);
    if (wc) {
      wc.mainFrame.frames.forEach(frame => {
        frame.executeJavaScript('document.querySelectorAll("video").forEach(v => v.play())').catch(()=>{});
      });
    }
  });

  ipcMain.handle('get-server-port', () => streamServerPort)
  ipcMain.handle('get-server-info', () => ({ port: streamServerPort, token: mediaServerToken }))

  
  ipcMain.handle('open-file', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, code: 'NOT_FOUND' };
      }
      const err = await shell.openPath(filePath);
      if (err) {
        return { success: false, code: 'OPEN_FAILED', error: err };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, code: 'ERROR', error: e.message };
    }
  })

  ipcMain.handle('fetch-image-base64', async (_, url: string) => {
    try {
      const response = await net.fetch(url, { headers: getHeadersForUrl(url) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      let contentType = response.headers.get('content-type') || 'image/x-icon'
      if (contentType.includes(';')) contentType = contentType.split(';')[0]
      const base64 = Buffer.from(buffer).toString('base64')
      return `data:${contentType};base64,${base64}`
    } catch (e: any) {
      logger.error('Main', 'Failed to fetch image base64: ' + e)
      return null
    }
  })

  ipcMain.handle('fetch-url', async (_, url: string) => {
    try {
      const response = await net.fetch(url, { headers: getHeadersForUrl(url) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    } catch (e: any) {
      logger.error('Main', 'Failed to fetch url: ' + e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('copy-image', async (_, url: string) => {
    try {
      const response = await net.fetch(url, { headers: getHeadersForUrl(url) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      const image = nativeImage.createFromBuffer(Buffer.from(buffer))
      clipboard.writeImage(image)
      return true
    } catch (e: any) {
      logger.error('Main', 'Failed to copy image: ' + e)
      return false
    }
  })

  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (canceled) return undefined
    return filePaths[0]
  })

  ipcMain.handle('save-images', async (_, dirPath: string, files: { url: string, name: string }[]) => {
    const results = []
    for (const file of files) {
      try {
        const response = await net.fetch(file.url, { headers: getHeadersForUrl(file.url) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await response.arrayBuffer()
        const safeName = sanitizeFileName(path.basename(String(file.name || '')), 'image')
        const savePath = resolveSafeChildPath(dirPath, safeName, 'image')
        await fs.promises.writeFile(savePath, Buffer.from(buffer))
        results.push({ url: file.url, success: true, path: savePath })
        broadcastFileSystemChange({
          type: 'add',
          name: safeName,
          path: savePath
        })
      } catch (e: any) {
        logger.error('Main', 'Failed to save image: ' + file.url + ' ' + e)
        results.push({ url: file.url, success: false, error: e.message })
      }
    }
    return results
  })

  ipcMain.handle('set-media-referer', (_, mediaUrl: string, pageUrl: string) => {
    registerMediaReferer(mediaUrl, pageUrl);
  })

  ipcMain.handle('create-media-client', (_, config: VeloraClientConfig) => {
    if (config && config.clientId) {
      clientManager.registerClient(config);
    }
  })

  ipcMain.handle('destroy-media-client', (_, clientId: string) => {
    if (clientId) {
      clientManager.unregisterClient(clientId);
    }
  })

  // Downloader IPCs
  downloader.setWindow(mainWindow)
  
  ipcMain.on('log-message', (_, { level, scope, message }: { level: 'info' | 'warn' | 'error' | 'perf', scope: string, message: string }) => {
    logger[level || 'info'](scope || 'Renderer', message || '')
  })
  
  ipcMain.on('start-download', (_, cmd) => {
    downloader.startDownload(cmd)
  })

  ipcMain.on('pause-download', (_, id: string) => {
    downloader.pauseDownload(id)
  })

  ipcMain.on('cancel-download', (_, id: string) => {
    downloader.cancelDownload(id)
  })

  ipcMain.handle('get-video-media-info', async (_, filePath: string) => {
    return await downloader.getVideoMediaInfo(filePath)
  })

  ipcMain.handle('compress-video-task', async (_, taskId: string, filePath: string, targetBitrateKbps: number) => {
    const res = await downloader.compressVideoTask(taskId, filePath, targetBitrateKbps);
    if (res && res.success) {
      broadcastFileSystemChange({
        type: 'overwrite',
        name: path.basename(filePath),
        path: filePath
      });
    }
    return res;
  })

  ipcMain.handle('delete-file', async (_, filePath: string) => {
    if (!filePath) return false;
    const targets = [
      filePath,
      filePath + '.temp.mp4',
      filePath + '.temp.ts',
      filePath + '.temp',
      filePath + '.tmp',
      filePath + '.velora',
      filePath + '.ts',
      (() => {
        const parsed = path.parse(filePath);
        return path.join(parsed.dir, `${parsed.name}.compress_tmp.mp4`);
      })()
    ];
    let anyDeleted = false;
    for (const targetPath of targets) {
      if (fs.existsSync(targetPath)) {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await fs.promises.unlink(targetPath);
            anyDeleted = true;
            logger.info('Main', `Deleted file: ${targetPath}`);
            break;
          } catch (e: any) {
            if (attempt < 4) {
              await new Promise(r => setTimeout(r, 150));
            } else {
              logger.error('Main', `Failed to delete file ${targetPath}: ${e.message}`);
            }
          }
        }
      }
    }
    if (anyDeleted) {
      broadcastFileSystemChange({
        type: 'delete',
        path: filePath,
        isDirectory: false
      });
    }
    return anyDeleted;
  })

  const pathExistsAsync = async (p: string): Promise<boolean> => {
    try {
      await fs.promises.access(p);
      return true;
    } catch {
      return false;
    }
  };

  const checkTargetOrTempExists = async (filePath: string): Promise<boolean> => {
    if (!filePath) return false;
    const parsed = path.parse(filePath);
    const candidates = [
      filePath,
      filePath + '.temp.mp4',
      filePath + '.temp.ts',
      filePath + '.temp',
      filePath + '.tmp',
      filePath + '.velora',
      filePath + '.ts',
      path.join(parsed.dir, `${parsed.name}.compress_tmp.mp4`)
    ];
    const results = await Promise.all(candidates.map(pathExistsAsync));
    return results.some(Boolean);
  };

  ipcMain.handle('file-exists', async (_, filePath: string) => {
    return checkTargetOrTempExists(filePath);
  })

  ipcMain.handle('files-exist-batch', async (_, filePaths: string[]) => {
    const resMap: Record<string, boolean> = {};
    if (!Array.isArray(filePaths) || filePaths.length === 0) return resMap;
    const uniquePaths = Array.from(new Set(filePaths.filter((p) => typeof p === 'string' && p.length > 0)));
    const BATCH_LIMIT = 24;
    for (let i = 0; i < uniquePaths.length; i += BATCH_LIMIT) {
      const slice = uniquePaths.slice(i, i + BATCH_LIMIT);
      await Promise.all(
        slice.map(async (p) => {
          resMap[p] = await checkTargetOrTempExists(p);
        })
      );
    }
    return resMap;
  })

  ipcMain.handle('export-resources-json', async (_event, data: any) => {
    try {
      const defaultFilename = data?.type === 'velora-config-backup'
        ? `velora-config-backup-${new Date().toISOString().slice(0, 10)}.json`
        : `velora-resources-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const { filePath } = await dialog.showSaveDialog({
        title: '导出 Velora 配置文件',
        defaultPath: defaultFilename,
        filters: [{ name: 'JSON 备份文件 (*.json)', extensions: ['json'] }]
      });
      if (!filePath) return { success: false, cancelled: true };
      const jsonStr = JSON.stringify(data, null, 2);
      await fs.promises.writeFile(filePath, jsonStr, 'utf-8');
      return { success: true, filePath };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('import-resources-json', async () => {
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: '选择要导入的 Velora JSON 备份文件',
        filters: [{ name: 'JSON 备份文件 (*.json)', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, cancelled: true };
      }
      const content = await fs.promises.readFile(filePaths[0], 'utf-8');
      const data = JSON.parse(content);
      if (!data || (data.type !== 'velora-resource-backup' && data.type !== 'velora-config-backup')) {
        return { success: false, error: '无效的备份文件：缺失 velora-config-backup / velora-resource-backup 校验标识' };
      }
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: `读取解析备份文件失败: ${err.message || String(err)}` };
    }
  });
}

let isInterceptorsInitialized = false;

function setupNetworkInterceptors() {
  if (isInterceptorsInitialized) return;
  isInterceptorsInitialized = true;

  // Network Sniffer & AdBlock Interceptor
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const isBackgroundMainReq = !details.webContentsId || details.webContentsId <= 0;
      if (isBackgroundMainReq) {
        return callback({});
      }

      if (details.resourceType === 'mainFrame') {
        return callback({});
      }

      const url = details.url;

      // AdBlock Interceptor
      if (isAdUrl(url)) {
        logger.info('AdBlock', `Blocked ad request: ${url}`);
        return callback({ cancel: true });
      }

      if (details.resourceType === 'subFrame' || details.resourceType === 'script' || details.resourceType === 'stylesheet') {
        return callback({});
      }

      let pathname = '';
      try {
        pathname = new URL(url).pathname.toLowerCase();
      } catch {
        pathname = url.split('?')[0].toLowerCase();
      }
      let type = '';

      if (pathname.endsWith('.m4s') || pathname.endsWith('.mpd') || pathname.endsWith('.ts')) {
        return callback({});
      }

      const isAudioExt = pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac|wma|opus|aiff|ape)$/i);
      const isVideoExt = pathname.match(/\.(mp4|webm|m3u8|flv|f4v|mkv|avi|mov|qt|wmv|asf|3gp|3g2|m2ts|vob|mpg|mpeg|ogv)$/i);

      if (isAudioExt) type = 'audio';
      else if (isVideoExt) type = 'video';

      if (type && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('media-sniffed', {
          webContentsId: details.webContentsId,
          url,
          type,
          timestamp: Date.now()
        });
      }

      callback({});
    }
  )

  // Network Sniffer - Catch by Headers & Bypass CORS globally
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://*/*'] },
    (details, callback) => {
      if (!details.webContentsId || details.webContentsId <= 0) {
        return callback({});
      }

      const responseHeaders = { ...details.responseHeaders };
      
      // Only inject wildcard CORS if the request comes from the main application window.
      // Webviews (e.g. for Bilibili) have different webContentsId and handle their own CORS.
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed() && details.webContentsId === mainWindow.webContents.id) {
        for (const key in responseHeaders) {
          if (key.toLowerCase().startsWith('access-control-allow-')) {
            delete responseHeaders[key];
          }
        }
        responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        responseHeaders['Access-Control-Allow-Headers'] = ['*'];
        responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
      }

      if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame' || details.resourceType === 'script' || details.resourceType === 'stylesheet') {
        return callback({ responseHeaders });
      }

      let url = details.url;
      let pathname = '';
      try {
        pathname = new URL(url).pathname.toLowerCase();
      } catch {
        pathname = url.split('?')[0].toLowerCase();
      }
      let type = '';

      const isImageExt = pathname.match(/\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff)$/i);
      const isAudioExt = pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac|wma|opus|aiff|ape)$/i);
      const isVideoExt = pathname.match(/\.(mp4|webm|m3u8|flv|f4v|mkv|avi|mov|qt|wmv|asf|3gp|3g2|m2ts|vob|mpg|mpeg|ogv)$/i);

      if (pathname.endsWith('.m4s') || pathname.endsWith('.mpd') || pathname.endsWith('.ts')) {
        return callback({ responseHeaders });
      }

      let contentType = '';
      if (details.responseHeaders) {
        for (const key in details.responseHeaders) {
          if (key.toLowerCase() === 'content-type') {
            contentType = details.responseHeaders[key][0].toLowerCase();
            break;
          }
        }
      }

      const audioMimeWhitelist = [
        'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
        'audio/flac', 'audio/x-m4a', 'audio/mp4', 'audio/x-ms-wma', 'audio/opus',
        'audio/x-wav', 'audio/aiff'
      ];
      const videoMimeWhitelist = [
        'video/mp4', 'video/webm', 'video/x-flv', 'video/flv', 'video/avi',
        'video/x-msvideo', 'video/quicktime', 'video/x-matroska', 'video/x-ms-wmv',
        'video/x-ms-asf', 'video/3gpp', 'video/3gpp2', 'video/mpeg', 'video/mp2t',
        'video/ogg', 'application/x-mpegurl', 'application/vnd.apple.mpegurl',
        'application/dash+xml'
      ];
      const imageMimeWhitelist = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/bmp'];

      const matchesAudioMime = audioMimeWhitelist.some(mime => contentType.startsWith(mime));
      const matchesVideoMime = videoMimeWhitelist.some(mime => contentType.startsWith(mime) || contentType.includes('mpegurl'));
      const matchesImageMime = imageMimeWhitelist.some(mime => contentType.startsWith(mime));

      // 若既无匹配后缀，且 Content-Type 也不在白名单中，并且资源类型不是 media/image，则忽略
      if (!isImageExt && !isAudioExt && !isVideoExt && !matchesAudioMime && !matchesVideoMime && !matchesImageMime) {
        return callback({ responseHeaders });
      }

      if (isImageExt && (details.resourceType === 'image' || matchesImageMime)) {
        type = 'image';
      } else if (matchesAudioMime || (isAudioExt && (details.resourceType === 'media' || !contentType || matchesAudioMime))) {
        type = 'audio';
      } else if (matchesVideoMime || (isVideoExt && (details.resourceType === 'media' || !contentType || matchesVideoMime))) {
        type = 'video';
      }

      if (type === 'image') {
        // 保留 query 参数，但去除 @ 后的缩放等特殊后缀
        try {
          const parsed = new URL(url);
          url = parsed.origin + parsed.pathname;
          const atIndex = url.indexOf('@');
          if (atIndex !== -1) url = url.substring(0, atIndex);
          url += parsed.search; // Retain query parameters
        } catch {}
      }

      if (type && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        const activePageUrl = webContentsUrlMap.get(details.webContentsId);
        if (activePageUrl) {
          registerMediaReferer(url, activePageUrl);
        }

        mainWindow.webContents.send('media-sniffed', {
          webContentsId: details.webContentsId,
          url,
          type,
          timestamp: Date.now()
        });
      }

      callback({ responseHeaders });
    }
  );

  // Referer and Origin header handling: Set to client config (X-Velora-Client-Id) or webpage referrer if present, otherwise strip local/empty
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details, callback) => {
      if (details.resourceType === 'mainFrame') {
        return callback({ requestHeaders: details.requestHeaders });
      }

      const explicitClientId = getHeaderValue(details.requestHeaders, 'X-Velora-Client-Id');
      const explicitRef = getHeaderValue(details.requestHeaders, 'X-Velora-Referer');
      const isBackgroundMainReq = !details.webContentsId || details.webContentsId <= 0;
      if (isBackgroundMainReq && !explicitClientId && !explicitRef) {
        return callback({});
      }

      const existingRef = getHeaderValue(details.requestHeaders, 'Referer');

      let clientConfig: VeloraClientConfig | undefined;
      if (explicitClientId) {
        clientConfig = clientManager.getClient(explicitClientId);
      }

      let exactMappedRef = globalMediaPageMap.get(details.url);
      let hostMappedRef: string | undefined;
      try {
        const u = new URL(details.url);
        hostMappedRef = globalHostPageMap.get(u.hostname.toLowerCase());
      } catch {}

      let webContentsRef = webContentsUrlMap.get(details.webContentsId);

      const isMainWinReq =
        mainWindow &&
        !mainWindow.isDestroyed() &&
        details.webContentsId === mainWindow.webContents.id;

      let targetReferer =
        isMainWinReq || explicitClientId || explicitRef
          ? clientConfig?.referer || explicitRef || exactMappedRef || hostMappedRef || existingRef || details.referrer || webContentsRef
          : clientConfig?.referer ||
            explicitRef ||
            (existingRef && !isLocalUrl(existingRef) ? existingRef : undefined) ||
            (details.referrer && !isLocalUrl(details.referrer) ? details.referrer : undefined) ||
            exactMappedRef ||
            hostMappedRef ||
            webContentsRef;

      if (isLocalUrl(targetReferer)) {
        targetReferer = clientConfig?.referer || explicitRef || exactMappedRef || hostMappedRef || (isLocalUrl(webContentsRef) ? '' : webContentsRef) || '';
      }

      if (targetReferer) {
        try {
          const parsedTarget = new URL(targetReferer);
          const targetOrigin = clientConfig?.origin || parsedTarget.origin;
          // 保留调用方传入的完整 Referer（含末尾斜杠及子路径）；仅当无有效 scheme 时兜底处理
          let cleanReferer = /^https?:\/\//i.test(targetReferer) ? targetReferer : targetOrigin;
          // 夸克/UC/123网盘防盗链根路径 Referer 确保携带末尾斜杠
          if (
            (targetReferer.includes('quark.cn') || targetReferer.includes('uc.cn') || targetReferer.includes('123pan')) &&
            cleanReferer === targetOrigin &&
            !cleanReferer.endsWith('/')
          ) {
            cleanReferer = cleanReferer + '/';
          }
          const existingOrigin = getHeaderValue(details.requestHeaders, 'Origin');
          removeHeaderCaseInsensitive(details.requestHeaders, 'Referer');
          details.requestHeaders['Referer'] = cleanReferer;

          // 仅在请求本身已携带 Origin 或需要替换本地域 Origin 时设置 Origin，避免普通 GET 触发 CDN 403
          if (existingOrigin) {
            removeHeaderCaseInsensitive(details.requestHeaders, 'Origin');
            if (targetOrigin && targetOrigin !== 'null') {
              details.requestHeaders['Origin'] = targetOrigin;
            }
          }
        } catch {
          removeHeaderCaseInsensitive(details.requestHeaders, 'Referer');
          removeHeaderCaseInsensitive(details.requestHeaders, 'Origin');
        }
      } else {
        removeHeaderCaseInsensitive(details.requestHeaders, 'Referer');
        removeHeaderCaseInsensitive(details.requestHeaders, 'Origin');
      }

      removeHeaderCaseInsensitive(details.requestHeaders, 'X-Velora-Client-Id');
      removeHeaderCaseInsensitive(details.requestHeaders, 'X-Velora-Referer');

      callback({ requestHeaders: details.requestHeaders });
    }
  );
}


const getMountedLocalResources = async () => {
  const localRes = await storeManager.getSetting('localResources');
  if (Array.isArray(localRes)) {
    return localRes.map((r: any) => ({ id: r.id, name: r.name, path: r.path }));
  }
  return [];
};

const initOrRestartLanServer = async () => {
  lanServer.setFileSystemChangeCallback(broadcastFileSystemChange);
  lanServer.setReleaseMediaStreamsCallback(releaseLocalMediaStreams);
  const enabled = await storeManager.getSetting('lanShareEnabled');
  if (!enabled) {
    await lanServer.stop();
    return { success: true, running: false };
  }
  const port = (await storeManager.getSetting('lanSharePort')) || 8899;
  const password = (await storeManager.getSetting('lanSharePassword')) || '';
  const allowEdit = (await storeManager.getSetting('lanShareAllowEdit')) || false;
  return await lanServer.start({
    enabled: true,
    port,
    password,
    allowEdit
  }, getMountedLocalResources, broadcastFileSystemChange);
};

ipcMain.handle('get-lan-share-status', async () => {
  return lanServer.getStatus();
});

ipcMain.handle('restart-lan-server', async () => {
  return await initOrRestartLanServer();
});

ipcMain.handle('stop-lan-server', async () => {
  await lanServer.stop();
  return { success: true };
});

// 全局视频任务队列监听与多端广播
videoTaskManager.onStateChange((state) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('video-queue-state-changed', state);
    }
  });
  lanServer.broadcastTaskQueueState(state);
});

videoTaskManager.onTaskFinish((task, success, outputPath) => {
  if (success && outputPath) {
    broadcastFileSystemChange({
      type: task.extra?.mode === 'replace' ? 'overwrite' : 'add',
      path: outputPath,
      name: path.basename(outputPath)
    });
  }

  // 向所有 PC 客户端窗口广播任务终态通知
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('video-task-finished', {
        task,
        success,
        outputPath
      });
    }
  });

  // 向局域网各客户端广播任务终态通知
  lanServer.broadcastTaskFinished({
    task,
    success,
    outputPath
  });
});

// 全局视频队列 IPC 接口
ipcMain.handle('get-video-queue-state', () => {
  return videoTaskManager.getQueueState();
});

ipcMain.handle('enqueue-video-task', (_event, params: {
  id?: string;
  type: 'cut' | 'merge' | 'compress';
  title: string;
  payload: any;
  extra?: any;
}) => {
  return videoTaskManager.enqueueTask(params);
});

ipcMain.handle('cancel-video-task', (_event, taskId: string) => {
  return videoTaskManager.cancelTask(taskId);
});

ipcMain.handle('edit-video-segments', async (event, params: EditVideoParams) => {
  const sender = event.sender;
  const result = await editVideoSegments(params, (percent, text) => {
    if (!sender.isDestroyed()) {
      sender.send(`video-edit-progress-${params.taskId}`, { percent, text });
    }
  });
  if (result.success && result.outputPath) {
    broadcastFileSystemChange({
      type: params.mode === 'replace' ? 'overwrite' : 'add',
      path: result.outputPath,
      name: path.basename(result.outputPath)
    });
  }
  return result;
});

ipcMain.handle('cancel-video-edit', async (_event, taskId: string) => {
  return cancelVideoEdit(taskId);
});

ipcMain.handle('merge-videos', async (event, params: MergeVideosParams) => {
  const sender = event.sender;
  const result = await mergeVideos(params, (percent, text) => {
    if (!sender.isDestroyed()) {
      sender.send(`video-merge-progress-${params.taskId}`, { percent, text });
    }
  });
  if (result.success && result.outputPath) {
    broadcastFileSystemChange({
      type: 'add',
      path: result.outputPath,
      name: path.basename(result.outputPath)
    });
  }
  return result;
});

ipcMain.handle('cancel-video-merge', async (_event, taskId: string) => {
  return cancelVideoMerge(taskId);
});

ipcMain.handle('show-save-dialog', async (event, options: { defaultPath?: string; title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return await dialog.showSaveDialog(options);
  }
  return await dialog.showSaveDialog(win, options);
});

app.whenReady().then(async () => {
  // 0. 延迟加载已保存的网盘账号凭据（确保 safeStorage 密钥链已完全就绪），并清理临时目录历史孤儿文件
  panAccountManager.ensureLoaded();
  cleanupAppTempDir();

  // 1. 【最高优先级】瞬间秒开 Splash 悬浮卡片（0ms 阻塞，依据系统明暗色偏好极速呈现）
  const initialTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  createSplashWindow(initialTheme);

  // 2. 初始化核心存储、IPC 通道与网络拦截器
  setupStoreHandlers();
  setupIpcHandlers();
  setupNetworkInterceptors();

  // 3. 读取用户主题配置并平滑同步至 Splash（若与系统偏好不一致）
  storeManager.getSetting('theme').then((savedTheme) => {
    if (savedTheme && savedTheme !== initialTheme) {
      updateSplashTheme(savedTheme);
    }
  }).catch(() => {});

  // 4. 后台非阻塞环境检测与局域网服务
  initOrRestartLanServer().catch((err) => {
    logger.error('Main', `Failed to initialize LAN server: ${err.message}`);
  });

  // 自动检测系统环境变量中是否存在 ffmpeg (异步非阻塞)
  exec('ffmpeg -version', (error) => {
    if (error) {
      logger.warn('System', 'FFmpeg is not detected in system PATH.');
    } else {
      logger.info('System', 'FFmpeg is correctly installed and accessible.');
    }
  });

  // 5. 装载应用主窗口与工作区
  createWindow();

  // 6. 安全熔断保底：若渲染进程因异常未在 5 秒内通知就绪，强制淡出 Splash 展示主窗口
  setTimeout(() => {
    if (!isFirstScreenReady) {
      logger.warn('Main', '首屏就绪通知超时，触发安全熔断保底显示主窗口');
      finishStartupAndShowMain();
    }
  }, 5000);

  const icoPath = resolveAppIcoPath();
  const appIcon = getAppIcon();
  let trayIcon: Electron.NativeImage | string;
  if (process.platform === 'win32' && icoPath) {
    trayIcon = icoPath;
  } else if (!appIcon.isEmpty()) {
    trayIcon = appIcon.resize({ width: 16, height: 16 });
  } else {
    const fallbackUrl = getIconDataUrl();
    trayIcon = fallbackUrl ? nativeImage.createFromDataURL(fallbackUrl) : nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('Velora');
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  const savedUserTheme = (await storeManager.getSetting('theme')) || (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  trayWindowManager.init(tray, {
    onShowApp: () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    },
    onResumeAll: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tray-resume-all');
      }
    },
    onPauseAll: () => {
      downloader.pauseAll();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tray-pause-all');
      }
    },
    onQuitApp: () => {
      app.quit();
    },
    getTaskStats: () => {
      return downloader.getTaskStats();
    }
  }, savedUserTheme);

  // 监听主题配置变更，动态同步至托盘浮窗
  storeManager.onSettingChange((key, value) => {
    if (key === 'theme') {
      trayWindowManager.updateTheme(value);
    }
  });

  // 监听原生系统明暗色偏好变化
  nativeTheme.on('updated', () => {
    storeManager.getSetting('theme').then((t) => {
      if (!t) {
        trayWindowManager.updateTheme(nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
      }
    });
  });

  // 托盘动态状态节流调度
  let trayUpdateTimer: NodeJS.Timeout | null = null;
  const updateTrayStatsThrottled = () => {
    const stats = downloader.getTaskStats();
    trayWindowManager.updateStats(stats);

    const isBusy = (stats.downloadingCount > 0 || stats.queuedCount > 0 || stats.compressingCount > 0 || stats.speed > 0);
    if (isBusy && !trayUpdateTimer) {
      trayUpdateTimer = setInterval(() => {
        const currentStats = downloader.getTaskStats();
        trayWindowManager.updateStats(currentStats);
        if (currentStats.downloadingCount === 0 && currentStats.queuedCount === 0 && currentStats.compressingCount === 0 && currentStats.speed === 0) {
          if (trayUpdateTimer) {
            clearInterval(trayUpdateTimer);
            trayUpdateTimer = null;
          }
        }
      }, 1000);
    }
  };

  downloader.setOnStatsChange(() => {
    updateTrayStatsThrottled();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let isQuitting = false
app.on('before-quit', (e) => {
  if (!isQuitting) {
    e.preventDefault()
    isQuitting = true
    try {
      storeManager.flushSync()
    } catch {}
    try {
      logger.flushSync()
    } catch {}
    app.exit(0)
  }
})

app.on('web-contents-created', (_, contents) => {
  contents.once('destroyed', () => {
    webContentsUrlMap.delete(contents.id);
  });

  contents.on('did-navigate', (_, url) => {
    if (url && !isLocalUrl(url)) {
      webContentsUrlMap.set(contents.id, url);
    }
  });
  contents.on('did-navigate-in-page', (_, url) => {
    if (url && !isLocalUrl(url)) {
      webContentsUrlMap.set(contents.id, url);
    }
  });

  contents.on('before-input-event', (e, input) => {
    if (input.key === 'F12') {
      e.preventDefault()
    }
  })

  if (contents.getType() === 'webview') {
    contents.on('enter-html-full-screen', () => {
      mainWindow?.setFullScreen(true)
    })
    
    contents.on('leave-html-full-screen', () => {
      mainWindow?.setFullScreen(false)
    })

    contents.setWindowOpenHandler((details) => {
      mainWindow?.webContents.send('webview-new-window', { url: details.url, webContentsId: contents.id })
      return { action: 'deny' }
    })
  }
})

ipcMain.handle('sync-adblock-source', async (_event, url: string, sourceId?: string) => {
  try {
    const text = await fetchRemoteRuleSource(url);
    const { count } = parseRulesText(text);
    if (sourceId) {
      await saveRuleCacheFile(sourceId, text);
      return { success: true, count };
    }
    return { success: true, count, content: text };
  } catch (err: any) {
    logger.error('AdBlock', `Failed to sync source ${url}: ${err.message}`);
    return { success: false, count: 0, error: err.message };
  }
});

ipcMain.handle('compile-adblock-rules', async (_event, sourcesOrIds: Record<string, string> | string[]) => {
  return await updateCompiledRules(sourcesOrIds);
});

ipcMain.handle('move-file', async (_event, oldPath: string, newPath: string, options?: { autoRename?: boolean }) => {
  try {
    if (!oldPath || !newPath) {
      return { success: false, error: '文件路径不能为空' };
    }
    let isDir = false;
    try {
      const stat = await fs.promises.stat(oldPath);
      isDir = stat.isDirectory();
    } catch {}

    // 1. 操作前主动释放所有关联媒体读流句柄（涵盖单文件及父目录场景）
    releaseLocalMediaStreams(oldPath);
    if (lanServer && typeof lanServer.releaseStreams === 'function') {
      lanServer.releaseStreams(oldPath);
    }

    const newDir = path.dirname(newPath);
    await fs.promises.mkdir(newDir, { recursive: true });

    let finalDestPath = newPath;
    if (options?.autoRename && fs.existsSync(finalDestPath) && path.resolve(oldPath).toLowerCase() !== path.resolve(finalDestPath).toLowerCase()) {
      const parsed = path.parse(finalDestPath);
      let counter = 1;
      while (fs.existsSync(finalDestPath)) {
        const candidateName = isDir ? `${parsed.name} (${counter})` : `${parsed.name} (${counter})${parsed.ext}`;
        finalDestPath = path.join(parsed.dir, candidateName);
        counter++;
      }
    }

    // 2. 带毫秒级退避重试执行重命名/移动，平滑抵御 Windows 句柄异步释放延迟
    await retryFileOperation(async () => {
      try {
        await fs.promises.rename(oldPath, finalDestPath);
      } catch (err: any) {
        if (err.code === 'EXDEV') {
          if (isDir) {
            await copyDirRecursive(oldPath, finalDestPath);
            await fs.promises.rm(oldPath, { recursive: true, force: true });
          } else {
            await fs.promises.copyFile(oldPath, finalDestPath);
            await fs.promises.unlink(oldPath);
          }
        } else {
          throw err;
        }
      }
    });

    broadcastFileSystemChange({
      type: path.dirname(oldPath) === path.dirname(finalDestPath) ? 'rename' : 'move',
      oldPath,
      newPath: finalDestPath,
      name: path.basename(finalDestPath),
      isDirectory: isDir
    });

    return { success: true, finalPath: finalDestPath };
  } catch (err: any) {
    logger.error('Main', `Failed to move/rename file from ${oldPath} to ${newPath}: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-directory-tree', async (_event, rootDir: string, maxDepth: number = 3) => {
  try {
    if (!rootDir || !fs.existsSync(rootDir)) {
      return [];
    }

    interface DirItem {
      path: string;
      name: string;
      depth: number;
    }

    const results: DirItem[] = [];

    const scan = async (currentDir: string, depth: number) => {
      if (depth > maxDepth) return;
      try {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const fullPath = path.join(currentDir, entry.name);
            results.push({
              path: fullPath,
              name: entry.name,
              depth
            });
            await scan(fullPath, depth + 1);
          }
        }
      } catch (err: any) {
        logger.error('Main', `Error scanning directory ${currentDir}: ${err.message}`);
      }
    };

    const rootName = path.basename(rootDir) || rootDir;
    results.push({
      path: rootDir,
      name: `默认目录 (${rootName})`,
      depth: 0
    });

    await scan(rootDir, 1);
    return results;
  } catch (err: any) {
    logger.error('Main', `Failed to get directory tree for ${rootDir}: ${err.message}`);
    return [];
  }
});

ipcMain.handle('scan-directory-media-files', async (_event, rootDir: string, maxDepth: number = 3) => {
  try {
    if (!rootDir || !fs.existsSync(rootDir)) {
      return [];
    }

    const MEDIA_EXTS = new Set([
      'mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'f4v', 'm4v', 'ts', 'm3u8', '3gp', '3g2', 'wmv', 'asf', 'vob', 'mpg', 'mpeg', 'ogv',
      'mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'aiff', 'ape', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'
    ]);

    interface ExistingMediaFile {
      name: string;
      path: string;
      dir: string;
      relativeDir: string;
    }

    const results: ExistingMediaFile[] = [];

    const scan = async (currentDir: string, depth: number) => {
      if (depth > maxDepth) return;
      try {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            await scan(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase().replace(/^\./, '');
            if (MEDIA_EXTS.has(ext)) {
              const rel = path.relative(rootDir, currentDir).replace(/\\/g, '/');
              results.push({
                name: entry.name,
                path: fullPath.replace(/\\/g, '/'),
                dir: currentDir.replace(/\\/g, '/'),
                relativeDir: rel || '.'
              });
            }
          }
        }
      } catch (err: any) {
        logger.warn('Main', `Error scanning media files in ${currentDir}: ${err.message}`);
      }
    };

    await scan(rootDir, 1);
    return results;
  } catch (err: any) {
    logger.error('Main', `Failed to scan media files for ${rootDir}: ${err.message}`);
    return [];
  }
});

ipcMain.handle('scan-directories-all-files', async (_event, rootDirs: string[], maxDepth: number = 5) => {
  try {
    if (!Array.isArray(rootDirs) || rootDirs.length === 0) {
      return [];
    }

    const uniqueRoots = Array.from(new Set(rootDirs.filter(d => typeof d === 'string' && d.trim() && fs.existsSync(d))));
    if (uniqueRoots.length === 0) {
      return [];
    }

    interface ScannedFile {
      name: string;
      path: string;
    }

    const results: ScannedFile[] = [];
    const visitedPaths = new Set<string>();

    const scan = async (currentDir: string, depth: number) => {
      if (depth > maxDepth) return;
      try {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = path.join(currentDir, entry.name);
          const normalizedPath = fullPath.replace(/\\/g, '/');

          if (visitedPaths.has(normalizedPath)) continue;
          visitedPaths.add(normalizedPath);

          if (entry.isDirectory()) {
            await scan(fullPath, depth + 1);
          } else if (entry.isFile()) {
            if (/\.(temp|tmp|crdownload|velora)(\.[a-zA-Z0-9]+)?$/i.test(entry.name)) {
              continue;
            }
            results.push({
              name: entry.name,
              path: normalizedPath
            });
          }
        }
      } catch (err: any) {
        logger.warn('Main', `Error scanning directory ${currentDir}: ${err.message}`);
      }
    };

    await Promise.all(uniqueRoots.map(root => scan(root, 1)));
    return results;
  } catch (err: any) {
    logger.error('Main', `Failed to batch scan directories for files: ${err.message}`);
    return [];
  }
});

ipcMain.handle('read-local-directory', async (_event, dirPath: string) => {
  const res = await scanDirectory(dirPath);
  if (!res.success) {
    logger.error('Main', `Failed to read directory ${dirPath}: ${res.error}`);
  } else {
    const files = res.items
      .filter(item => !item.isDirectory)
      .map(item => ({ name: item.name, path: item.path }));
    broadcastFileSystemChange({
      type: 'sync-dir',
      dirPath: dirPath.replace(/\\/g, '/'),
      files
    });
  }
  return res;
});

ipcMain.handle('search-local-files', async (_event, dirPath: string, query: string) => {
  const res = await searchDirectoryRecursive(dirPath, query);
  if (!res.success) {
    logger.error('Main', `Failed to search directory ${dirPath} for "${query}": ${res.error}`);
  }
  return res;
});

ipcMain.handle('get-pan-accounts', async () => {
  return panService.getPublicAccounts();
});

ipcMain.handle('login-pan-account', async (event, type: any) => {
  try {
    const parentWin = BrowserWindow.fromWebContents(event.sender) || mainWindow || undefined;
    const account = await panService.login(type, parentWin);
    return { success: !!account, account: account ? panService.toPublicAccount(account) : undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || '登录异常' };
  }
});

ipcMain.handle('logout-pan-account', async (_, type: any) => {
  if (typeof type !== 'string' || !PAN_CONFIGS[type as keyof typeof PAN_CONFIGS]) {
    return { success: false, error: '无效的网盘类型' };
  }
  panService.removeAccount(type as any);
  try {
    const partition = `persist:pan_auth_${type}`;
    const authSession = session.fromPartition(partition);
    await authSession.clearStorageData();
    await authSession.clearCache();
    await authSession.clearAuthCache();
  } catch {}
  return { success: true };
});

ipcMain.handle('resolve-pan-resource', async (_, { url, password }: { url: string; password?: string }) => {
  try {
    const res = await panService.parseUrl(url, password);
    if (res.error && (!res.files || res.files.length === 0)) {
      return { success: false, error: res.error, data: res };
    }
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err?.message || '解析网盘失败' };
  }
});

ipcMain.handle('pan-list-files', async (_, { type, pdirFid }: { type: any; pdirFid?: string }) => {
  return panService.listDriveFiles(type, pdirFid);
});

ipcMain.handle('pan-get-download-urls', async (_, { type, fids }: { type: any; fids: string[] }) => {
  return panService.getDriveDownloadUrls(type, fids);
});

ipcMain.handle('pan-delete-files', async (_, { type, fids }: { type: any; fids: string[] }) => {
  return panService.deleteDriveFiles(type, fids);
});

ipcMain.handle('pan-get-share-download-urls', async (_, { type, items }: { type: any; items: any[] }) => {
  return panService.getShareDownloadUrls(type, items);
});

ipcMain.handle('pan-refresh-quota', async (_, type: any) => {
  return panService.refreshQuota(type);
});

ipcMain.handle('pan-create-folder', async (_, { type, parentFid, name }: { type: any; parentFid: string; name: string }) => {
  return panService.createDriveFolder(type, parentFid, name);
});

ipcMain.handle('pan-rename-item', async (_, { type, fid, newName, isDirectory }: { type: any; fid: string; newName: string; isDirectory?: boolean }) => {
  return panService.renameDriveItem(type, fid, newName, isDirectory);
});

ipcMain.handle('pan-move-items', async (_, { type, fids, targetDirFid }: { type: any; fids: string[]; targetDirFid: string }) => {
  return panService.moveDriveItems(type, fids, targetDirFid);
});

ipcMain.handle('pan-create-share', async (_, { type, params }: { type: any; params: any }) => {
  return panService.createDriveShare(type, params);
});

ipcMain.handle('pan-save-share', async (_, { type, items, targetDirFid }: { type: any; items: any[]; targetDirFid: string }) => {
  return panService.saveShareToDrive(type, items, targetDirFid);
});

ipcMain.handle('pan-get-preview-url', async (_, { type, fid, filename }: { type: any; fid: string; filename?: string }) => {
  try {
    const res = await panService.getDriveDownloadUrls(type, [fid]);
    if (!res.success) {
      return { success: false, error: res.error || '无法获取媒体直链' };
    }
    const link = res.links?.[fid];
    const url = link?.url || res.urls?.[fid];
    if (!url) {
      return { success: false, error: '无法获取媒体直链' };
    }
    const cachedHeaders = panService.getCachedHeadersForUrl(url) || {};
    const baseHeaders = getHeadersForUrl(url, undefined, undefined, undefined, { allowPanCookies: true, panType: String(type) });
    const mergedHeaders = { ...baseHeaders, ...cachedHeaders };

    const sid = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    if (panPreviewRegistry.size >= 100) {
      panPreviewRegistry.forEach((v, k) => {
        if (now - v.createdAt > 6 * 60 * 60 * 1000) panPreviewRegistry.delete(k);
      });
      if (panPreviewRegistry.size >= 100) {
        const oldestKey = panPreviewRegistry.keys().next().value;
        if (oldestKey !== undefined) panPreviewRegistry.delete(oldestKey);
      }
    }
    panPreviewRegistry.set(sid, {
      url,
      headers: mergedHeaders,
      filename: String(link?.filename || filename || 'media.mp4'),
      createdAt: now
    });
    const previewUrl = `http://127.0.0.1:${streamServerPort}/pan-stream?token=${encodeURIComponent(mediaServerToken)}&sid=${sid}`;
    return { success: true, previewUrl };
  } catch (err: any) {
    return { success: false, error: err?.message || '获取预览流失败' };
  }
});

ipcMain.handle('pan-cleanup-temp-dir', async (_, { type, cleanupDirFid }: { type: any; cleanupDirFid: string }) => {
  try {
    if (!type || !cleanupDirFid) return { success: true };
    if (downloader.hasUnfinishedTempDirRef(String(type), String(cleanupDirFid))) {
      return { success: true };
    }
    await panService.cleanupTempDir(type, cleanupDirFid);
    return { success: true };
  } catch {
    return { success: false };
  }
});

ipcMain.handle('create-local-folder', async (_event, folderPath: string) => {
  try {
    if (!folderPath) return { success: false, error: '路径不能为空' };
    if (fs.existsSync(folderPath)) {
      return { success: false, error: '同名文件夹已存在' };
    }
    await fs.promises.mkdir(folderPath, { recursive: true });
    return { success: true };
  } catch (err: any) {
    logger.error('Main', `Failed to create folder ${folderPath}: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-local-path', async (_event, targetPath: string) => {
  try {
    if (!targetPath || !fs.existsSync(targetPath)) return { success: false, error: '文件或目录不存在' };
    let isDir = false;
    try {
      const stat = await fs.promises.stat(targetPath);
      isDir = stat.isDirectory();
    } catch {}

    // 1. 操作前主动释放所有关联媒体读流句柄
    releaseLocalMediaStreams(targetPath);
    if (lanServer && typeof lanServer.releaseStreams === 'function') {
      lanServer.releaseStreams(targetPath);
    }

    // 2. 带毫秒级退避重试执行删除
    await retryFileOperation(async () => {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    });

    broadcastFileSystemChange({
      type: 'delete',
      path: targetPath,
      name: path.basename(targetPath),
      isDirectory: isDir
    });
    return { success: true };
  } catch (err: any) {
    logger.error('Main', `Failed to delete local path ${targetPath}: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('scan-local-videos', async (_event, targetPaths: string[]) => {
  const VIDEO_EXTS = new Set([
    'mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'f4v', 'm4v', 'ts', 'm3u8',
    '3gp', '3g2', 'wmv', 'asf', 'vob', 'mpg', 'mpeg', 'ogv'
  ]);
  const results: Array<{ name: string; path: string; size: number }> = [];

  const scanPath = async (p: string) => {
    try {
      if (!fs.existsSync(p)) return;
      const stat = await fs.promises.stat(p);
      if (stat.isDirectory()) {
        const entries = await fs.promises.readdir(p, { withFileTypes: true });
        for (const entry of entries) {
          const subPath = path.join(p, entry.name);
          await scanPath(subPath);
        }
      } else {
        const ext = path.extname(p).toLowerCase().replace(/^\./, '');
        if (VIDEO_EXTS.has(ext)) {
          results.push({
            name: path.basename(p),
            path: p.replace(/\\/g, '/'),
            size: stat.size
          });
        }
      }
    } catch (err: any) {
      logger.warn('Main', `[ScanVideos] Skip ${p}: ${err.message}`);
    }
  };

  if (Array.isArray(targetPaths)) {
    for (const p of targetPaths) {
      if (p) await scanPath(p);
    }
  }

  // Deduplicate by path
  const uniqueMap = new Map<string, { name: string; path: string; size: number }>();
  for (const item of results) {
    uniqueMap.set(item.path, item);
  }

  return { success: true, videos: Array.from(uniqueMap.values()) };
});

ipcMain.handle('silent-parse-html', async (_event, targetUrl: string, scripts?: string[], evalExprs?: string[]) => {
  try {
    if (!targetUrl) {
      return { success: false, error: '目标链接不能为空' };
    }
    let parsedTarget: URL;
    try {
      parsedTarget = new URL(String(targetUrl));
    } catch {
      return { success: false, error: '目标链接格式无效' };
    }
    if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
      return { success: false, error: `不支持的协议: ${parsedTarget.protocol}` };
    }

    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false
      }
    });

    let isResolved = false;

    return new Promise<{ success: boolean; html?: string; evaluatedVars?: Record<string, any>; error?: string }>((resolve) => {
      const cleanup = () => {
        if (!win.isDestroyed()) {
          win.destroy();
        }
      };

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve({ success: false, error: '页面加载超时 (15s)' });
        }
      }, 15000);

      win.webContents.on('did-finish-load', async () => {
        if (isResolved) return;
        try {
          // 匹配并顺序执行传入的 JS 脚本
          if (Array.isArray(scripts) && scripts.length > 0) {
            for (const scriptCode of scripts) {
              if (scriptCode && scriptCode.trim()) {
                try {
                  await win.webContents.executeJavaScript(scriptCode);
                } catch (scriptErr: any) {
                  logger.error('Parser', `[silent-parse-html] 执行自定义 JS 脚本发生错误: ${scriptErr?.message || scriptErr}`);
                }
              }
            }
          }

          // 求值全局变量表达式
          const evaluatedVars: Record<string, any> = {};
          if (Array.isArray(evalExprs) && evalExprs.length > 0) {
            for (const expr of evalExprs) {
              if (expr && expr.trim()) {
                try {
                  evaluatedVars[expr] = await win.webContents.executeJavaScript(expr);
                } catch {
                  evaluatedVars[expr] = null;
                }
              }
            }
          }

          const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
          isResolved = true;
          clearTimeout(timer);
          cleanup();
          resolve({ success: true, html, evaluatedVars });
        } catch (err: any) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timer);
            cleanup();
            resolve({ success: false, error: err.message });
          }
        }
      });

      win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        if (isResolved) return;
        if (errorCode === -3) return; // ignore ABORTED
        isResolved = true;
        clearTimeout(timer);
        cleanup();
        resolve({ success: false, error: `加载失败: ${errorDescription} (${errorCode})` });
      });

      win.loadURL(targetUrl).catch((err) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          cleanup();
          resolve({ success: false, error: err.message });
        }
      });
    });
  } catch (err: any) {
    logger.error('Main', `Silent parse error for ${targetUrl}: ${err.message}`);
    return { success: false, error: err.message };
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
