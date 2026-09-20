import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, session, clipboard, net, dialog, webContents, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { scanDirectory, resolveAppIconPath } from './utils/fileSystem'

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

import { isAdUrl, updateCompiledRules, fetchRemoteRuleSource, parseRulesText } from './adblock'
import { getHeadersForUrl } from './downloader'
import { logger } from './logger'
import { editVideoSegments, cancelVideoEdit, EditVideoParams } from './videoEditor'

let streamServerPort = 0;
const mediaServer = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
    if (urlObj.pathname === '/stream') {
      const filePath = urlObj.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400);
        return res.end('Missing path');
      }
      
      const stat = await fs.promises.stat(filePath);
      const rangeHeader = req.headers['range'];
      
      let contentType = 'application/octet-stream';
      const ext = filePath.split('.').pop()?.toLowerCase();
      if (ext === 'mp4') contentType = 'video/mp4';
      else if (ext === 'm3u8') contentType = 'application/x-mpegURL';
      else if (ext === 'ts') contentType = 'video/MP2T';
      else if (ext === 'mp3') contentType = 'audio/mpeg';
      else if (ext === 'webm') contentType = 'video/webm';
      else if (ext === 'png') contentType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
      else if (ext === 'webp') contentType = 'image/webp';
      else if (ext === 'gif') contentType = 'image/gif';
      
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunksize,
        });
        const fileStream = fs.createReadStream(filePath, { start, end });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
        });
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err: any) {
    logger.error('Protocol', `Local media server error: ${err.message}`);
    res.writeHead(404);
    res.end('File not found');
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

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let splashStartTime = 0
let isFirstScreenReady = false

// 获取应用图标 Base64 Data URL (供 Splash 与 Tray 备用)
const getIconDataUrl = (): string => {
  const iconPath = resolveAppIconPath();
  if (iconPath) {
    try {
      const buf = fs.readFileSync(iconPath);
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {}
  }
  return '';
};

const iconBase64 = getIconDataUrl();

// 设置 Windows 任务栏应用唯一 AppUserModelId，确保任务栏图标与主程序图标统一关联
if (process.platform === 'win32') {
  app.setAppUserModelId('com.velora.app');
}

const getAppIcon = () => {
  const icoCandidates = [
    path.join(__dirname, '../public/icon.ico'),
    path.join(__dirname, '../../public/icon.ico'),
    path.join(process.resourcesPath || '', 'public/icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar/public/icon.ico'),
    path.join(process.cwd(), 'build/icon.ico'),
    path.join(process.cwd(), 'public/icon.ico')
  ];
  for (const p of icoCandidates) {
    if (p && fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }
  const pngPath = resolveAppIconPath();
  if (pngPath) {
    const img = nativeImage.createFromPath(pngPath);
    if (!img.isEmpty()) return img;
  }
  return iconBase64 ? nativeImage.createFromDataURL(iconBase64) : nativeImage.createEmpty();
};

function createSplashWindow(theme: string = 'light') {
  splashStartTime = Date.now();
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
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const iconDataUrl = getIconDataUrl();
  const version = typeof app.getVersion === 'function' ? app.getVersion() : '1.4.1';
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

function updateSplashText(text: string) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.executeJavaScript(`
    window.setStatusText && window.setStatusText(${JSON.stringify(text)});
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

const clearPrivacyData = async () => {
  try {
    await session.defaultSession.clearCache()
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'websql', 'cachestorage', 'serviceworkers']
    })
    logger.info('Privacy', 'Browser cache and storage data cleared successfully.')
  } catch (e: any) {
    logger.error('Privacy', `Failed to clear privacy data: ${e.message}`)
  }
}
export const globalMediaPageMap = new Map<string, string>();
export const globalHostPageMap = new Map<string, string>();
export const webContentsUrlMap = new Map<number, string>();
const MAX_REFERER_CACHE_SIZE = 1000;

export function isLocalUrl(urlStr?: string): boolean {
  if (!urlStr) return true;
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || u.protocol === 'file:' || u.protocol === 'app:' || u.protocol === 'velora:';
  } catch {
    return true;
  }
}

export function registerMediaReferer(mediaUrl: string, pageUrl: string) {
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
    let referer = config.referer || '';
    let origin = config.origin;
    try {
      if (referer) {
        const u = new URL(referer);
        if (u.origin && u.origin !== 'null') {
          origin = u.origin;
          referer = u.origin;
        }
      }
    } catch {}
    this.clients.set(config.clientId, {
      clientId: config.clientId,
      referer: referer,
      origin: origin || referer
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
  const appIcon = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 850,
    resizable: true,
    title: "Velora",
    icon: appIcon,
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
    shell.openExternal(url)
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
        const savePath = path.join(dirPath, file.name)
        await fs.promises.writeFile(savePath, Buffer.from(buffer))
        results.push({ url: file.url, success: true, path: savePath })
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

  ipcMain.on('write-log', (_, message: string) => {
    logger.info('Renderer', message)
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
    return await downloader.compressVideoTask(taskId, filePath, targetBitrateKbps)
  })

  ipcMain.handle('delete-file', async (_, filePath: string) => {
    if (!filePath) return false;
    const targets = [
      filePath,
      filePath + '.temp.ts',
      filePath + '.temp',
      filePath + '.tmp',
      filePath + '.velora',
      filePath + '.ts'
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
    return anyDeleted;
  })

  ipcMain.handle('file-exists', async (_, filePath: string) => {
    if (!filePath) return false;
    return (
      fs.existsSync(filePath) ||
      fs.existsSync(filePath + '.temp.ts') ||
      fs.existsSync(filePath + '.temp') ||
      fs.existsSync(filePath + '.tmp') ||
      fs.existsSync(filePath + '.velora') ||
      fs.existsSync(filePath + '.ts')
    );
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

      const isAudioExt = pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i);
      const isVideoExt = pathname.match(/\.(mp4|webm|m3u8|flv|mkv|avi)$/i);

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

      const isImageExt = pathname.match(/\.(png|jpe?g|gif|webp|svg|ico)$/i);
      const isAudioExt = pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i);
      const isVideoExt = pathname.match(/\.(mp4|webm|m3u8|flv|mkv|avi)$/i);

      // Require a whitelisted suffix, otherwise block/ignore from sniffing
      if (!isImageExt && !isAudioExt && !isVideoExt) {
        return callback({ responseHeaders });
      }

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

      const audioMimeWhitelist = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac', 'audio/flac', 'audio/x-m4a', 'audio/mp4'];
      const videoMimeWhitelist = ['video/mp4', 'video/webm', 'video/x-flv', 'video/avi', 'video/mpeg', 'application/x-mpegurl', 'application/vnd.apple.mpegurl'];
      const imageMimeWhitelist = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'];

      if (isImageExt && (details.resourceType === 'image' || imageMimeWhitelist.some(mime => contentType.startsWith(mime)))) {
        type = 'image';
      } else if (isAudioExt && audioMimeWhitelist.some(mime => contentType.startsWith(mime))) {
        type = 'audio';
      } else if (isVideoExt && videoMimeWhitelist.some(mime => contentType.startsWith(mime) || contentType.includes('mpegurl'))) {
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

      let targetReferer = clientConfig?.referer || explicitRef || exactMappedRef || hostMappedRef || existingRef || details.referrer || webContentsRef;

      if (isLocalUrl(targetReferer)) {
        targetReferer = clientConfig?.referer || explicitRef || exactMappedRef || hostMappedRef || (isLocalUrl(webContentsRef) ? '' : webContentsRef) || '';
      }

      if (targetReferer) {
        try {
          const targetOrigin = clientConfig?.origin || new URL(targetReferer).origin;
          const cleanReferer = (new URL(targetReferer).origin !== 'null') ? new URL(targetReferer).origin : targetReferer;
          removeHeaderCaseInsensitive(details.requestHeaders, 'Referer');
          removeHeaderCaseInsensitive(details.requestHeaders, 'Origin');
          details.requestHeaders['Referer'] = cleanReferer;
          details.requestHeaders['Origin'] = targetOrigin;
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
  }, getMountedLocalResources);
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

ipcMain.handle('edit-video-segments', async (event, params: EditVideoParams) => {
  const sender = event.sender;
  return await editVideoSegments(params, (percent, text) => {
    if (!sender.isDestroyed()) {
      sender.send(`video-edit-progress-${params.taskId}`, { percent, text });
    }
  });
});

ipcMain.handle('cancel-video-edit', async (_event, taskId: string) => {
  return cancelVideoEdit(taskId);
});

ipcMain.handle('show-save-dialog', async (event, options: { defaultPath?: string; title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return await dialog.showSaveDialog(options);
  }
  return await dialog.showSaveDialog(win, options);
});

app.whenReady().then(async () => {
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

  const appIcon = getAppIcon();
  const trayIcon = appIcon.isEmpty() ? nativeImage.createFromDataURL(iconBase64) : appIcon.resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示应用', click: () => { if (mainWindow) mainWindow.show() } },
    { type: 'separator' },
    { label: '完全退出', click: () => { app.quit() } }
  ]);
  tray.setToolTip('Velora');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => { if (mainWindow) mainWindow.show() });
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
    clearPrivacyData().finally(() => {
      app.exit(0)
    })
  }
})

app.on('web-contents-created', (event, contents) => {
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

    // contents.on('before-input-event', (e, input) => {
    //   if (input.type === 'keyDown') {
    //     if (input.key === 'F5') {
    //       contents.reload()
    //       e.preventDefault()
    //     } else if (input.key === 'F12') {
    //       if (contents.isDevToolsOpened()) {
    //         contents.closeDevTools()
    //       } else {
    //         contents.openDevTools()
    //       }
    //       e.preventDefault()
    //     }
    //   }
    // })
  }
})

ipcMain.handle('sync-adblock-source', async (_event, url: string) => {
  try {
    const text = await fetchRemoteRuleSource(url);
    const { count } = parseRulesText(text);
    return { success: true, count, content: text };
  } catch (err: any) {
    logger.error('AdBlock', `Failed to sync source ${url}: ${err.message}`);
    return { success: false, count: 0, error: err.message };
  }
});

ipcMain.handle('compile-adblock-rules', async (_event, sourcesData: Record<string, string>) => {
  return updateCompiledRules(sourcesData);
});

ipcMain.handle('move-file', async (_event, oldPath: string, newPath: string) => {
  try {
    if (!oldPath || !newPath) {
      return { success: false, error: '文件路径不能为空' };
    }
    const newDir = path.dirname(newPath);
    await fs.promises.mkdir(newDir, { recursive: true });

    try {
      await fs.promises.rename(oldPath, newPath);
    } catch (err: any) {
      if (err.code === 'EXDEV') {
        await fs.promises.copyFile(oldPath, newPath);
        await fs.promises.unlink(oldPath);
      } else {
        throw err;
      }
    }
    return { success: true };
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
      'mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'm4v', 'ts', 'm3u8',
      'mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'jpg', 'png', 'webp'
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

ipcMain.handle('read-local-directory', async (_event, dirPath: string) => {
  const res = await scanDirectory(dirPath);
  if (!res.success) {
    logger.error('Main', `Failed to read directory ${dirPath}: ${res.error}`);
  }
  return res;
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
    await fs.promises.rm(targetPath, { recursive: true, force: true });
    return { success: true };
  } catch (err: any) {
    logger.error('Main', `Failed to delete local path ${targetPath}: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('scan-local-videos', async (_event, targetPaths: string[]) => {
  const VIDEO_EXTS = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'm4v', 'ts', 'm3u8']);
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
