import http from 'http';
import fs from 'fs';
import path from 'path';
import { panService } from '../pan/service';
import type { PanType } from '../pan/types';
import { storeManager } from '../store';
import { logger } from '../logger';
import { sendJson, readRequestBody, sanitizeFilename, type LanRouteContext } from './types';

function inferDownloadCategory(filenameOrUrl: string): 'video' | 'audio' | 'image' | 'file' {
  const clean = (filenameOrUrl || '').split('?')[0].toLowerCase();
  if (clean.includes('.m3u8') || /\.(mp4|mkv|avi|flv|mov|wmv|webm|ts|m4v)$/.test(clean)) return 'video';
  if (/\.(mp3|flac|wav|aac|ogg|m4a)$/.test(clean)) return 'audio';
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(clean)) return 'image';
  return 'file';
}

async function resolveDefaultDownloadDir(
  category: 'video' | 'audio' | 'image' | 'file',
  ctx: LanRouteContext
): Promise<string> {
  const keyMap = {
    video: 'videoDirectory',
    audio: 'audioDirectory',
    image: 'imageDirectory',
    file: 'fileDirectory'
  } as const;

  try {
    const typedDir = await storeManager.getSetting(keyMap[category]);
    if (typeof typedDir === 'string' && typedDir.trim()) {
      return typedDir.trim();
    }
    const fileDir = await storeManager.getSetting('fileDirectory');
    if (typeof fileDir === 'string' && fileDir.trim()) {
      return fileDir.trim();
    }
    const fallbackDir = await storeManager.getSetting('downloadPath');
    if (typeof fallbackDir === 'string' && fallbackDir.trim()) {
      return fallbackDir.trim();
    }
  } catch {}

  const resources = await ctx.getResources();
  if (resources.length > 0 && resources[0].path) {
    return resources[0].path;
  }
  return '';
}

function getDefaultPanReferer(panType: string): string | undefined {
  if (panType === 'quark') return 'https://pan.quark.cn/';
  if (panType === 'uc') return 'https://drive.uc.cn/';
  if (panType === 'baidu') return 'https://pan.baidu.com/';
  if (panType === '123pan') return 'https://yun.123pan.cn/';
  if (panType === 'xunlei') return 'https://pan.xunlei.com/';
  if (panType === '115') return 'https://115.com/';
  if (panType === 'lanzou') return 'https://pc.woozooo.com/';
  if (panType === '139') return 'https://yun.139.com/';
  if (panType === 'guangya') return 'https://www.guangyapan.com/';
  if (panType === 'ilanzou') return 'https://www.ilanzou.com/';
  return undefined;
}

function inferFilenameFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const seg = decodeURIComponent(u.pathname.split('/').pop() || '');
    if (seg && seg.includes('.')) {
      return sanitizeFilename(seg, `download_${Date.now()}.mp4`);
    }
    if (rawUrl.toLowerCase().includes('.m3u8')) {
      return `video_${Date.now()}.mp4`;
    }
  } catch {}
  return `download_${Date.now()}`;
}

/**
 * 清洗网盘分享条目的相对子路径：移除前导斜杠、空段及 `.`/`..` 穿越段，并对每段做文件名清洗
 */
export function sanitizeRelativeSubPath(rawPath: string, fallbackName: string): string {
  const safeFallback = sanitizeFilename(fallbackName, 'download_file');
  const rawSegments = String(rawPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..');
  if (rawSegments.length === 0) return safeFallback;

  const cleaned = rawSegments
    .map((seg) => sanitizeFilename(seg, ''))
    .filter((seg) => seg.length > 0 && seg !== '.' && seg !== '..');
  return cleaned.length > 0 ? cleaned.join('/') : safeFallback;
}

/**
 * 在基础目录内安全拼接相对子目录，确保最终路径严格位于 baseDir 之内
 */
export function resolveSafeChildDir(baseDir: string, relativePath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const relDir = path.dirname(relativePath);
  if (!relDir || relDir === '.') return resolvedBase;
  const candidate = path.resolve(resolvedBase, relDir);
  const rel = path.relative(resolvedBase, candidate);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return resolvedBase;
  }
  return candidate;
}

/**
 * 处理局域网远程下载队列与网盘分享解析/转存/下载投递路由
 */
export async function handleRemoteRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  urlObj: URL,
  ctx: LanRouteContext
): Promise<boolean> {
  const pathname = urlObj.pathname;

  // 1. 获取当前下载列表快照
  if (pathname === '/api/downloads' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      tasks: ctx.getDownloadTasksSnapshot()
    });
    return true;
  }

  // 2. SSE 实时订阅下载队列与进度变化
  if (pathname === '/api/downloads/stream' && req.method === 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`data: ${JSON.stringify({ tasks: ctx.getDownloadTasksSnapshot() })}\n\n`);
    ctx.addDownloadSubscriber(res);
    req.on('close', () => {
      ctx.removeDownloadSubscriber(res);
    });
    return true;
  }

  // 3. 获取已登录网盘账号列表（只读展示）
  if (pathname === '/api/pan/accounts' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      accounts: panService.getPublicAccounts()
    });
    return true;
  }

  // 以下远程写入/投递接口统一受 allowEdit 权限保护
  const isRemoteWriteRoute =
    req.method === 'POST' &&
    [
      '/api/downloads/add',
      '/api/downloads/action',
      '/api/pan/parse',
      '/api/pan/folders',
      '/api/pan/save',
      '/api/pan/download'
    ].includes(pathname);

  if (!isRemoteWriteRoute) {
    return false;
  }

  if (!ctx.allowEdit()) {
    sendJson(res, 403, { success: false, error: '未开启局域网编辑权限，当前为只读模式' });
    return true;
  }

  const body = await readRequestBody(req);
  let params: any = {};
  try {
    params = JSON.parse(body || '{}');
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      sendJson(res, 400, { success: false, error: '请求参数格式无效' });
      return true;
    }
  } catch {
    sendJson(res, 400, { success: false, error: '请求体 JSON 格式无效' });
    return true;
  }

  // 4. 远程投递直链 / M3U8 下载任务
  if (pathname === '/api/downloads/add') {
    const rawUrl = String(params.url || '').trim();
    const targetDir = String(params.saveDir || '').trim();
    const customName = String(params.name || '').trim();
    const referer = String(params.referer || '').trim() || undefined;

    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
      sendJson(res, 400, { success: false, error: '请输入有效的 HTTP/HTTPS 下载链接' });
      return true;
    }

    const fileName = customName
      ? sanitizeFilename(customName, inferFilenameFromUrl(rawUrl))
      : inferFilenameFromUrl(rawUrl);

    let resolvedDir = targetDir;
    if (resolvedDir) {
      const allowed = await ctx.isPathInAllowedResources(resolvedDir);
      if (!allowed) {
        sendJson(res, 403, { success: false, error: '保存目录不在已挂载的本地资源范围内' });
        return true;
      }
      if (!fs.existsSync(resolvedDir)) {
        sendJson(res, 400, { success: false, error: '指定的保存目录不存在' });
        return true;
      }
    } else {
      const category = inferDownloadCategory(fileName || rawUrl);
      resolvedDir = await resolveDefaultDownloadDir(category, ctx);
      if (!resolvedDir) {
        sendJson(res, 400, { success: false, error: '请先在桌面端设置默认下载目录' });
        return true;
      }
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }
    }

    const result = await ctx.dispatchDownloadCommand({
      action: 'add',
      items: [
        {
          url: rawUrl,
          name: fileName,
          saveDir: resolvedDir,
          referer
        }
      ]
    });
    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  // 5. 远程控制下载任务（暂停 / 继续 / 删除）
  if (pathname === '/api/downloads/action') {
    const action = String(params.action || '');
    const id = String(params.id || '').trim();
    if (!id || !['pause', 'resume', 'delete'].includes(action)) {
      sendJson(res, 400, { success: false, error: '无效的任务控制参数' });
      return true;
    }
    const result = await ctx.dispatchDownloadCommand({
      action: action as 'pause' | 'resume' | 'delete',
      id,
      deleteFile: !!params.deleteFile
    });
    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  // 6. 远程解析网盘分享链接
  if (pathname === '/api/pan/parse') {
    const rawUrl = String(params.url || '').trim();
    const password = String(params.password || '').trim();
    if (!rawUrl) {
      sendJson(res, 400, { success: false, error: '请输入网盘分享链接或口令' });
      return true;
    }
    try {
      const parsed = await panService.parseUrl(rawUrl, password);
      if (parsed.error && (!parsed.files || parsed.files.length === 0)) {
        sendJson(res, 400, { success: false, error: parsed.error, data: parsed });
        return true;
      }
      sendJson(res, 200, { success: true, data: parsed });
    } catch (err: any) {
      sendJson(res, 500, { success: false, error: err?.message || '网盘解析失败' });
    }
    return true;
  }

  // 7. 列出网盘个人目录（供远程转存选择目标目录）
  if (pathname === '/api/pan/folders') {
    const panType = String(params.panType || '') as PanType;
    const pdirFid = String(params.pdirFid || '0');
    if (!panType) {
      sendJson(res, 400, { success: false, error: '缺少网盘类型参数' });
      return true;
    }
    const listRes = await panService.listDriveFiles(panType, pdirFid);
    if (!listRes.success || !listRes.data) {
      sendJson(res, 400, { success: false, error: listRes.error || '加载网盘目录失败' });
      return true;
    }
    const folders = (listRes.data.files || [])
      .filter((f) => f.isDirectory)
      .map((f) => ({ id: f.id, name: f.name, pdir_fid: f.pdir_fid }));
    sendJson(res, 200, { success: true, folders });
    return true;
  }

  // 8. 远程转存网盘分享文件至个人网盘
  if (pathname === '/api/pan/save') {
    const panType = String(params.panType || '') as PanType;
    const items = Array.isArray(params.items) ? params.items : [];
    const targetDirFid = String(params.targetDirFid || '0');
    if (!panType || items.length === 0) {
      sendJson(res, 400, { success: false, error: '请选择至少一个需要转存的文件' });
      return true;
    }
    const saveRes = await panService.saveShareToDrive(panType, items, targetDirFid);
    if (!saveRes.success) {
      sendJson(res, 400, { success: false, error: saveRes.error || '转存到网盘失败' });
      return true;
    }
    sendJson(res, 200, { success: true, savedCount: saveRes.savedCount || items.length });
    return true;
  }

  // 9. 远程将网盘分享文件投递到桌面端高速下载队列
  if (pathname === '/api/pan/download') {
    const panType = String(params.panType || '') as PanType;
    const files = Array.isArray(params.files) ? params.files : [];
    let saveDir = String(params.saveDir || '').trim();

    if (!panType || files.length === 0) {
      sendJson(res, 400, { success: false, error: '请选择至少一个需要下载的文件' });
      return true;
    }

    if (saveDir) {
      const allowed = await ctx.isPathInAllowedResources(saveDir);
      if (!allowed || !fs.existsSync(saveDir)) {
        sendJson(res, 403, { success: false, error: '下载目录无效或不在挂载资源范围内' });
        return true;
      }
    } else {
      saveDir = await resolveDefaultDownloadDir('file', ctx);
      if (!saveDir) {
        sendJson(res, 400, { success: false, error: '请先在桌面端设置默认下载目录' });
        return true;
      }
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }
    }

    const shareItems: any[] = [];
    const normalizedEntries = files.map((file: any) => {
      const r = file.rawInfo || {};
      const fid = String(r.fid || r.FileId || r.fs_id || file.id || '');
      const fidToken = r.fidToken || r.share_fid_token || r.S3keyFlag;
      const pwdId = r.pwdId || r.pwd_id || r.shareKey;
      const stoken = r.stoken || r.sekey;
      const safeName = sanitizeFilename(String(file.name || 'download_file'), 'download_file');
      const relativePath = sanitizeRelativeSubPath(String(file.path || safeName), safeName);
      const baseExtra = r.extra && typeof r.extra === 'object' ? r.extra : r;
      const extra = { ...baseExtra, relativePath };
      if (!file.downloadUrl && fid) {
        shareItems.push({ fid, fidToken, pwdId, stoken, extra });
      }
      return { file, fid, fidToken, pwdId, stoken, safeName, relativePath, extra };
    });

    let directUrlsMap: Record<string, string> = {};
    let directLinksMap: Record<string, any> = {};

    if (shareItems.length > 0) {
      const linkRes = await panService.getShareDownloadUrls(panType, shareItems);
      if (!linkRes.success) {
        sendJson(res, 400, { success: false, error: linkRes.error || '获取网盘下载直链失败' });
        return true;
      }
      directUrlsMap = linkRes.urls || {};
      directLinksMap = linkRes.links || {};
    }

    const batchItems = normalizedEntries
      .map((entry) => {
        const linkDetail = entry.fid ? directLinksMap[entry.fid] : undefined;
        const resolvedUrl = entry.file.downloadUrl || linkDetail?.url || (entry.fid ? directUrlsMap[entry.fid] : '');
        if (!resolvedUrl) return null;
        const itemSaveDir = resolveSafeChildDir(saveDir, entry.relativePath);
        const headers = linkDetail?.headers && Object.keys(linkDetail.headers).length > 0 ? linkDetail.headers : undefined;
        const referer = headers?.Referer || headers?.referer || getDefaultPanReferer(panType);

        return {
          url: resolvedUrl,
          name: entry.safeName,
          saveDir: itemSaveDir,
          referer,
          headers,
          totalBytes: entry.file.size > 0 ? entry.file.size : undefined,
          panContext: entry.fid
            ? {
                panType,
                mode: 'share' as const,
                fid: entry.fid,
                fidToken: entry.fidToken,
                pwdId: entry.pwdId,
                stoken: entry.stoken,
                cleanupDirFid: linkDetail?.cleanupDirFid,
                extra: entry.extra
              }
            : undefined
        };
      })
      .filter(Boolean);

    if (batchItems.length === 0) {
      sendJson(res, 400, { success: false, error: '未能获取到有效下载直链' });
      return true;
    }

    const dispatchRes = await ctx.dispatchDownloadCommand({
      action: 'add',
      items: batchItems
    });
    if (!dispatchRes.success) {
      // 投递失败时自动清理临时转存目录
      const dirFids = Array.from(
        new Set(
          Object.values(directLinksMap)
            .map((l: any) => l?.cleanupDirFid)
            .filter(Boolean)
        )
      );
      for (const dirFid of dirFids) {
        panService.cleanupTempDir(panType, String(dirFid)).catch(() => {});
      }
      logger.warn('LanServer', `远程网盘投递下载失败: ${dispatchRes.error}`);
      sendJson(res, 500, dispatchRes);
      return true;
    }

    sendJson(res, 200, { success: true, count: dispatchRes.count ?? batchItems.length });
    return true;
  }

  return false;
}
