import http from 'http';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import type { ActiveStreamEntry, LanRouteContext } from './types';

function resolveStreamMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'm3u8') return 'application/x-mpegURL';
  if (ext === 'ts') return 'video/MP2T';
  if (ext === 'mkv') return 'video/x-matroska';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'ogg' || ext === 'opus') return 'audio/ogg';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function pipeTrackedStream(
  filePath: string,
  fileStream: fs.ReadStream,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: LanRouteContext,
  errorLabel?: string
) {
  const streamEntry: ActiveStreamEntry = { filePath, fileStream, res };
  ctx.registerActiveStream(streamEntry);
  const cleanUpStream = () => {
    ctx.unregisterActiveStream(streamEntry);
    try { fileStream.destroy(); } catch {}
  };

  if (errorLabel) {
    fileStream.on('error', (err) => {
      logger.warn('LanServer', `${errorLabel} for ${filePath}: ${err.message}`);
      cleanUpStream();
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
  } else {
    fileStream.on('error', cleanUpStream);
  }

  req.on('close', cleanUpStream);
  res.on('finish', cleanUpStream);
  fileStream.on('close', () => ctx.unregisterActiveStream(streamEntry));
  return fileStream.pipe(res);
}

/**
 * 处理局域网媒体流推送 (/stream) 与附件下载 (/download) 路由
 */
export async function handleStreamRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  urlObj: URL,
  ctx: LanRouteContext
): Promise<boolean> {
  const pathname = urlObj.pathname;

  // Stream Range Stream (Video / Audio / Image / Static Files)
  if (pathname === '/stream') {
    const filePath = urlObj.searchParams.get('path') || '';
    if (!filePath) {
      res.writeHead(400);
      res.end('Missing path');
      return true;
    }

    const isAllowed = await ctx.isPathInAllowedResources(filePath);
    if (!isAllowed) {
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('File not found');
      return true;
    }

    const stat = await fs.promises.stat(filePath);
    const rangeHeader = req.headers['range'];
    const contentType = resolveStreamMimeType(filePath);

    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    const lastModified = stat.mtime.toUTCString();
    const ifRange = req.headers['if-range'];
    const isIfRangeValid = !ifRange || ifRange === etag || ifRange === lastModified;

    res.setHeader('Access-Control-Allow-Origin', '*');
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
          'Content-Range': `bytes */${stat.size}`,
          'Access-Control-Allow-Origin': '*'
        });
        res.end();
        return true;
      }

      let start = match[1] ? parseInt(match[1], 10) : NaN;
      let end = match[2] ? parseInt(match[2], 10) : NaN;

      if (isNaN(start)) {
        if (isNaN(end)) {
          res.writeHead(416, {
            'Content-Range': `bytes */${stat.size}`,
            'Access-Control-Allow-Origin': '*'
          });
          res.end();
          return true;
        }
        start = Math.max(0, stat.size - end);
        end = stat.size - 1;
      } else if (isNaN(end)) {
        end = stat.size - 1;
      }

      if (start >= stat.size || start < 0 || end < start) {
        res.writeHead(416, {
          'Content-Range': `bytes */${stat.size}`,
          'Access-Control-Allow-Origin': '*'
        });
        res.end();
        return true;
      }

      end = Math.min(end, stat.size - 1);

      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'Connection': 'keep-alive'
      });

      const fileStream = fs.createReadStream(filePath, { start, end });
      pipeTrackedStream(filePath, fileStream, req, res, ctx, 'Stream pipe error');
      return true;
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes'
      });
      const fileStream = fs.createReadStream(filePath);
      pipeTrackedStream(filePath, fileStream, req, res, ctx, 'Full stream error');
      return true;
    }
  }

  // Download file attachment
  if (pathname === '/download') {
    const filePath = urlObj.searchParams.get('path') || '';
    if (!filePath) {
      res.writeHead(400);
      res.end('Missing path');
      return true;
    }

    const isAllowed = await ctx.isPathInAllowedResources(filePath);
    if (!isAllowed || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('File not found');
      return true;
    }

    const stat = await fs.promises.stat(filePath);
    const fileName = path.basename(filePath);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    const fileStream = fs.createReadStream(filePath);
    pipeTrackedStream(filePath, fileStream, req, res, ctx);
    return true;
  }

  return false;
}
