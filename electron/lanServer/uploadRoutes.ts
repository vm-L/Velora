import http from 'http';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { getAppTempDir, moveOrCopyFile, resolveUniqueOutputPath } from '../videoEditor';
import { sendJson, sanitizeFilename, type LanRouteContext } from './types';

/**
 * 处理局域网流式文件上传路由（支持 GB 级大文件，绕开 JSON Body 上限，防覆盖自动编号与原子落盘）
 */
export async function handleUploadRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  urlObj: URL,
  ctx: LanRouteContext
): Promise<boolean> {
  if (urlObj.pathname !== '/api/upload' || req.method !== 'POST') {
    return false;
  }

  if (!ctx.allowEdit()) {
    sendJson(res, 403, { success: false, error: '未开启局域网编辑权限，当前为只读模式' });
    return true;
  }

  const targetDir = (urlObj.searchParams.get('dir') || '').trim();
  const rawFilename = (urlObj.searchParams.get('filename') || '').trim();

  if (!targetDir) {
    sendJson(res, 400, { success: false, error: '缺少目标上传目录参数' });
    return true;
  }

  const isAllowed = await ctx.isPathInAllowedResources(targetDir);
  if (!isAllowed) {
    sendJson(res, 403, { success: false, error: '拒绝上传到非挂载资源目录' });
    return true;
  }

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    sendJson(res, 400, { success: false, error: '目标上传目录不存在' });
    return true;
  }

  const safeName = sanitizeFilename(rawFilename, `upload_${Date.now()}.bin`);
  const ext = path.extname(safeName);
  const baseName = ext ? safeName.slice(0, -ext.length) : safeName;
  const finalPath = resolveUniqueOutputPath(targetDir, baseName || `upload_${Date.now()}`, ext || '.bin');

  const tempDir = getAppTempDir();
  const rand = Math.random().toString(36).slice(2, 8);
  const tempPath = path.join(tempDir, `velora_lan_upload_${Date.now()}_${rand}.part`);

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let totalBytes = 0;

    const cleanupTemp = () => {
      try {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
      } catch {}
    };

    const finishWithError = (statusCode: number, msg: string) => {
      if (settled) return;
      settled = true;
      cleanupTemp();
      if (!res.headersSent) {
        sendJson(res, statusCode, { success: false, error: msg });
      } else if (!res.writableEnded) {
        try { res.end(); } catch {}
      }
      resolve(true);
    };

    const writeStream = fs.createWriteStream(tempPath);

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
    });

    req.on('aborted', () => {
      writeStream.destroy();
      finishWithError(499, '上传已取消');
    });

    req.on('error', (err) => {
      writeStream.destroy();
      finishWithError(500, `上传读取失败: ${err.message}`);
    });

    writeStream.on('error', (err) => {
      finishWithError(500, `写入上传文件失败: ${err.message}`);
    });

    writeStream.on('finish', () => {
      if (settled) return;
      try {
        moveOrCopyFile(tempPath, finalPath);
        const finalName = path.basename(finalPath);
        ctx.notifyFileSystemChange({
          type: 'add',
          path: finalPath,
          name: finalName
        });
        logger.info('LanServer', `局域网上传完成: ${finalPath} (${totalBytes} bytes)`);
        settled = true;
        sendJson(res, 200, {
          success: true,
          file: {
            name: finalName,
            path: finalPath.replace(/\\/g, '/'),
            size: totalBytes
          }
        });
        resolve(true);
      } catch (err: any) {
        finishWithError(500, `保存上传文件失败: ${err?.message || err}`);
      }
    });

    req.pipe(writeStream);
  });
}
