import http from 'http';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger';
import { scanDirectory, retryFileOperation, copyDirRecursive, searchDirectoryRecursive } from '../utils/fileSystem';
import { sendJson, readRequestBody, type LanRouteContext } from './types';

async function resolveTargetPath(urlObj: URL, ctx: LanRouteContext, paramKey: string): Promise<string> {
  const resourceId = urlObj.searchParams.get('id') || '';
  let targetPath = urlObj.searchParams.get(paramKey) || '';

  const resources = await ctx.getResources();
  if (!targetPath && resourceId) {
    const matched = resources.find(r => r.id === resourceId);
    if (matched && matched.path) {
      targetPath = matched.path;
    }
  }
  return targetPath;
}

/**
 * 处理局域网文件浏览、搜索、目录树与编辑操作（新建、重命名、删除、移动）路由
 */
export async function handleFsRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  urlObj: URL,
  ctx: LanRouteContext
): Promise<boolean> {
  const pathname = urlObj.pathname;

  // API: resources
  if (pathname === '/api/resources') {
    const resources = await ctx.getResources();
    sendJson(res, 200, {
      success: true,
      resources: resources.map(r => ({ id: r.id, name: r.name, path: r.path }))
    });
    return true;
  }

  // API: directory
  if (pathname === '/api/directory') {
    const targetPath = await resolveTargetPath(urlObj, ctx, 'path');

    if (!targetPath) {
      sendJson(res, 400, { success: false, error: '缺少路径参数' });
      return true;
    }

    const isAllowed = await ctx.isPathInAllowedResources(targetPath);
    if (!isAllowed) {
      sendJson(res, 403, { success: false, error: '拒绝访问非挂载资源目录' });
      return true;
    }

    const scanRes = await scanDirectory(targetPath);
    if (!scanRes.success) {
      sendJson(res, 400, { success: false, error: scanRes.error });
      return true;
    }

    sendJson(res, 200, { success: true, items: scanRes.items });
    return true;
  }

  // API: search (递归深度搜索)
  if (pathname === '/api/search') {
    const targetPath = await resolveTargetPath(urlObj, ctx, 'path');
    const query = urlObj.searchParams.get('q') || '';

    if (!targetPath) {
      sendJson(res, 400, { success: false, error: '缺少路径参数' });
      return true;
    }

    const isAllowed = await ctx.isPathInAllowedResources(targetPath);
    if (!isAllowed) {
      sendJson(res, 403, { success: false, error: '拒绝访问非挂载资源目录' });
      return true;
    }

    const searchRes = await searchDirectoryRecursive(targetPath, query);
    if (!searchRes.success) {
      sendJson(res, 400, { success: false, error: searchRes.error });
      return true;
    }

    sendJson(res, 200, { success: true, items: searchRes.items });
    return true;
  }

  // API: dir-tree
  if (pathname === '/api/dir-tree') {
    const rootPath = await resolveTargetPath(urlObj, ctx, 'rootPath');

    if (!rootPath) {
      sendJson(res, 400, { success: false, error: '缺少 rootPath 参数' });
      return true;
    }

    const isAllowed = await ctx.isPathInAllowedResources(rootPath);
    if (!isAllowed) {
      sendJson(res, 403, { success: false, error: '越界操作' });
      return true;
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
    sendJson(res, 200, { success: true, dirList: results });
    return true;
  }

  // Edit Actions (Protected by allowEdit flag)
  if (pathname.startsWith('/api/') && ['/api/create-folder', '/api/rename', '/api/delete', '/api/move'].includes(pathname)) {
    if (!ctx.allowEdit()) {
      sendJson(res, 403, { success: false, error: '未开启局域网编辑权限，当前为只读模式' });
      return true;
    }

    const body = await readRequestBody(req);
    const params = JSON.parse(body || '{}');

    if (pathname === '/api/create-folder') {
      const { parentPath, name } = params;
      if (!parentPath || !name) {
        sendJson(res, 400, { success: false, error: '参数缺失' });
        return true;
      }
      const targetDir = path.join(parentPath, name);
      const isAllowed = await ctx.isPathInAllowedResources(targetDir);
      if (!isAllowed) {
        sendJson(res, 403, { success: false, error: '越界操作' });
        return true;
      }
      await fs.promises.mkdir(targetDir, { recursive: true });
      sendJson(res, 200, { success: true });
      return true;
    }

    if (pathname === '/api/rename') {
      const { targetPath, newName } = params;
      if (!targetPath || !newName) {
        sendJson(res, 400, { success: false, error: '参数缺失' });
        return true;
      }
      const isAllowed = await ctx.isPathInAllowedResources(targetPath);
      if (!isAllowed) {
        sendJson(res, 403, { success: false, error: '越界操作' });
        return true;
      }
      const isDir = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
      const dir = path.dirname(targetPath);
      const newPath = path.join(dir, newName);

      ctx.releaseStreams(targetPath);

      try {
        await retryFileOperation(async () => {
          await fs.promises.rename(targetPath, newPath);
        });
        ctx.notifyFileSystemChange({
          type: 'rename',
          oldPath: targetPath,
          newPath,
          name: newName,
          isDirectory: isDir
        });
        sendJson(res, 200, { success: true });
      } catch (err: any) {
        logger.error('LanServer', `重命名失败: ${err.message}`);
        sendJson(res, 500, { success: false, error: `重命名失败: ${err.message}` });
      }
      return true;
    }

    if (pathname === '/api/delete') {
      const { targetPath } = params;
      if (!targetPath) {
        sendJson(res, 400, { success: false, error: '参数缺失' });
        return true;
      }
      const isAllowed = await ctx.isPathInAllowedResources(targetPath);
      if (!isAllowed) {
        sendJson(res, 403, { success: false, error: '越界操作' });
        return true;
      }
      const isDir = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();

      ctx.releaseStreams(targetPath);

      try {
        await retryFileOperation(async () => {
          await fs.promises.rm(targetPath, { recursive: true, force: true });
        });
        ctx.notifyFileSystemChange({
          type: 'delete',
          path: targetPath,
          isDirectory: isDir
        });
        sendJson(res, 200, { success: true });
      } catch (err: any) {
        logger.error('LanServer', `删除失败: ${err.message}`);
        sendJson(res, 500, { success: false, error: `删除失败: ${err.message}` });
      }
      return true;
    }

    if (pathname === '/api/move') {
      const { sourcePath, sourcePaths, targetDirPath } = params;
      const pathsToMove: string[] = Array.isArray(sourcePaths)
        ? sourcePaths.filter((p: any) => typeof p === 'string' && p.trim())
        : (sourcePath && typeof sourcePath === 'string' && sourcePath.trim() ? [sourcePath.trim()] : []);

      if (pathsToMove.length === 0 || !targetDirPath) {
        sendJson(res, 400, { success: false, error: '参数缺失' });
        return true;
      }

      const isTargetAllowed = await ctx.isPathInAllowedResources(targetDirPath);
      if (!isTargetAllowed) {
        sendJson(res, 403, { success: false, error: '越界操作' });
        return true;
      }

      if (!fs.existsSync(targetDirPath)) {
        sendJson(res, 404, { success: false, error: '目标目录不存在' });
        return true;
      }

      const targetStat = await fs.promises.stat(targetDirPath);
      if (!targetStat.isDirectory()) {
        sendJson(res, 400, { success: false, error: '目标路径不是文件夹' });
        return true;
      }

      const movedPaths: string[] = [];
      const errors: string[] = [];

      for (let i = 0; i < pathsToMove.length; i++) {
        const src = pathsToMove[i];
        const isSourceAllowed = await ctx.isPathInAllowedResources(src);
        if (!isSourceAllowed) {
          errors.push(`权限不足: ${path.basename(src)}`);
          continue;
        }

        if (!fs.existsSync(src)) {
          errors.push(`源文件不存在: ${path.basename(src)}`);
          continue;
        }

        const srcStat = await fs.promises.stat(src);
        const resolvedSrc = path.resolve(src);
        const resolvedTargetDir = path.resolve(targetDirPath);

        if (srcStat.isDirectory()) {
          const relative = path.relative(resolvedSrc, resolvedTargetDir);
          if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
            errors.push(`无法将文件夹移动到其子目录中: ${path.basename(src)}`);
            continue;
          }
        }

        const baseName = path.basename(src);
        let destPath = path.join(targetDirPath, baseName);

        if (resolvedSrc === path.resolve(destPath)) {
          continue;
        }

        if (fs.existsSync(destPath)) {
          const ext = path.extname(baseName);
          const nameWithoutExt = path.basename(baseName, ext);
          destPath = path.join(targetDirPath, `${nameWithoutExt}_moved_${Date.now()}_${i}${ext}`);
        }

        try {
          ctx.releaseStreams(src);

          await retryFileOperation(async () => {
            try {
              await fs.promises.rename(src, destPath);
            } catch (err: any) {
              if (err.code === 'EXDEV') {
                if (srcStat.isDirectory()) {
                  await copyDirRecursive(src, destPath);
                  await fs.promises.rm(src, { recursive: true, force: true });
                } else {
                  await fs.promises.copyFile(src, destPath);
                  await fs.promises.unlink(src);
                }
              } else {
                throw err;
              }
            }
          });

          movedPaths.push(destPath.replace(/\\/g, '/'));
          ctx.notifyFileSystemChange({
            type: 'move',
            oldPath: src,
            newPath: destPath,
            name: path.basename(destPath),
            isDirectory: srcStat.isDirectory()
          });
        } catch (err: any) {
          errors.push(`移动失败: ${baseName} (${err.message || '未知原因'})`);
        }
      }

      if (movedPaths.length === 0 && errors.length > 0) {
        sendJson(res, 400, { success: false, error: errors.join('; ') });
        return true;
      }

      sendJson(res, 200, {
        success: true,
        movedCount: movedPaths.length,
        totalCount: pathsToMove.length,
        newPath: movedPaths[0] || '',
        errors: errors.length > 0 ? errors : undefined
      });
      return true;
    }
  }

  return false;
}
