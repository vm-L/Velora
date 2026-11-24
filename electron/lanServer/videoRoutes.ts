import http from 'http';
import path from 'path';
import { videoTaskManager } from '../videoTaskManager';
import { sendJson, readRequestBody, sanitizeFilename, type LanRouteContext } from './types';

/**
 * 处理局域网视频任务队列 SSE 订阅、剪辑、合并与压缩接口路由
 */
export async function handleVideoRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  urlObj: URL,
  ctx: LanRouteContext
): Promise<boolean> {
  const pathname = urlObj.pathname;

  // Global Task Queue Event Stream (SSE)
  if (pathname === '/api/task-queue-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    ctx.addTaskQueueSubscriber(res);

    // 立即发送当前全局任务队列状态快照
    const snapshot = videoTaskManager.getQueueState();
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      ctx.removeTaskQueueSubscriber(res);
    });
    return true;
  }

  // Global Task Queue Snapshot (GET)
  if (pathname === '/api/task-queue' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      ...videoTaskManager.getQueueState()
    });
    return true;
  }

  // Task Progress Event Stream (SSE, Backward Compatibility)
  if (pathname === '/api/task-progress') {
    const taskId = urlObj.searchParams.get('taskId');
    if (!taskId) {
      sendJson(res, 400, { success: false, error: '缺少 taskId 参数' });
      return true;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const latest = ctx.subscribeTaskProgress(taskId, res);
    if (latest) {
      res.write(`data: ${JSON.stringify(latest)}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'progress', percent: 0, text: '连接已就绪...' })}\n\n`);
    }

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      ctx.unsubscribeTaskProgress(taskId, res);
    });
    return true;
  }

  // Video Editing Operations (Protected by allowEdit flag)
  if (pathname === '/api/video-cut' || pathname === '/api/video-merge' || pathname === '/api/video-compress' || pathname === '/api/task-cancel') {
    if (!ctx.allowEdit()) {
      sendJson(res, 403, { success: false, error: '未开启局域网编辑权限，当前为只读模式' });
      return true;
    }

    const body = await readRequestBody(req);
    const params = JSON.parse(body || '{}');

    // Cancel video task (Unified via VideoTaskManager)
    if (pathname === '/api/task-cancel') {
      const { taskId } = params;
      if (!taskId) {
        sendJson(res, 400, { success: false, error: '缺少 taskId 参数' });
        return true;
      }
      const success = videoTaskManager.cancelTask(taskId);
      ctx.broadcastTaskEvent(taskId, { type: 'cancelled' });
      sendJson(res, 200, { success });
      return true;
    }

    // Cut video segments (Unified via VideoTaskManager)
    if (pathname === '/api/video-cut') {
      const { taskId, sourcePath, segments, mode, customFilename } = params;
      if (!sourcePath || !Array.isArray(segments) || segments.length === 0) {
        sendJson(res, 400, { success: false, error: '参数缺失' });
        return true;
      }
      const isAllowed = await ctx.isPathInAllowedResources(sourcePath);
      if (!isAllowed) {
        sendJson(res, 403, { success: false, error: '越界操作' });
        return true;
      }

      const editMode: 'replace' | 'saveAs' = mode === 'replace' ? 'replace' : 'saveAs';
      let targetPath = sourcePath;

      if (editMode === 'saveAs') {
        const dir = path.dirname(sourcePath);
        const ext = path.extname(sourcePath) || '.mp4';
        const baseName = path.basename(sourcePath, ext);
        const defaultName = `${baseName}_cut${ext}`;
        const fileName = sanitizeFilename(customFilename || '', defaultName);
        targetPath = path.join(dir, fileName);
        const isTargetAllowed = await ctx.isPathInAllowedResources(targetPath);
        if (!isTargetAllowed) {
          sendJson(res, 403, { success: false, error: '越界操作' });
          return true;
        }
      }

      const effectiveTaskId = taskId || `cut_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const sourceName = path.basename(sourcePath);

      videoTaskManager.enqueueTask({
        id: effectiveTaskId,
        type: 'cut',
        title: sourceName,
        payload: {
          cutParams: {
            taskId: effectiveTaskId,
            sourcePath,
            segments,
            mode: editMode,
            outputPath: editMode === 'saveAs' ? targetPath : undefined
          }
        },
        extra: {
          sourcePath,
          mode: editMode
        }
      });

      sendJson(res, 200, { success: true, taskId: effectiveTaskId });
      return true;
    }

    // Merge multiple videos (Unified via VideoTaskManager)
    if (pathname === '/api/video-merge') {
      const { taskId, videoPaths, customFilename } = params;
      if (!Array.isArray(videoPaths) || videoPaths.length < 2) {
        sendJson(res, 400, { success: false, error: '至少需要 2 个视频文件进行合并' });
        return true;
      }
      for (const vp of videoPaths) {
        const isAllowed = await ctx.isPathInAllowedResources(vp);
        if (!isAllowed) {
          sendJson(res, 403, { success: false, error: '越界操作' });
          return true;
        }
      }

      const dir = path.dirname(videoPaths[0]);
      const defaultName = `velora_merge_${Date.now()}.mp4`;
      const fileName = sanitizeFilename(customFilename || '', defaultName);
      const targetPath = path.join(dir, fileName);
      const isTargetAllowed = await ctx.isPathInAllowedResources(targetPath);
      if (!isTargetAllowed) {
        sendJson(res, 403, { success: false, error: '越界操作' });
        return true;
      }

      const effectiveTaskId = taskId || `merge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      videoTaskManager.enqueueTask({
        id: effectiveTaskId,
        type: 'merge',
        title: `合并 ${videoPaths.length} 个视频`,
        payload: {
          mergeParams: {
            taskId: effectiveTaskId,
            videoPaths,
            outputPath: targetPath
          }
        },
        extra: {
          mode: 'saveAs'
        }
      });

      sendJson(res, 200, { success: true, taskId: effectiveTaskId });
      return true;
    }

    // Compress video (Unified via VideoTaskManager)
    if (pathname === '/api/video-compress') {
      const { taskId, filePath, targetBitrateKbps, mode, customFilename } = params;
      if (!filePath || !targetBitrateKbps) {
        sendJson(res, 400, { success: false, error: '参数缺失' });
        return true;
      }
      const isAllowed = await ctx.isPathInAllowedResources(filePath);
      if (!isAllowed) {
        sendJson(res, 403, { success: false, error: '越界操作' });
        return true;
      }

      const compressMode: 'replace' | 'saveAs' = mode === 'replace' ? 'replace' : 'saveAs';
      let targetPath = filePath;

      if (compressMode === 'saveAs') {
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath) || '.mp4';
        const baseName = path.basename(filePath, ext);
        const defaultName = `${baseName}_compressed${ext}`;
        const fileName = sanitizeFilename(customFilename || '', defaultName);
        targetPath = path.join(dir, fileName);
        const isTargetAllowed = await ctx.isPathInAllowedResources(targetPath);
        if (!isTargetAllowed) {
          sendJson(res, 403, { success: false, error: '越界操作' });
          return true;
        }
      }

      const effectiveTaskId = taskId || `compress_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const fileName = path.basename(filePath);

      videoTaskManager.enqueueTask({
        id: effectiveTaskId,
        type: 'compress',
        title: fileName,
        payload: {
          compressParams: {
            taskId: effectiveTaskId,
            filePath,
            targetBitrateKbps: Number(targetBitrateKbps) || 2000,
            outputPath: compressMode === 'saveAs' ? targetPath : undefined,
            mode: compressMode
          }
        },
        extra: {
          filePath,
          mode: compressMode
        }
      });

      sendJson(res, 200, { success: true, taskId: effectiveTaskId });
      return true;
    }
  }

  return false;
}
