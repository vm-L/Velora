import fs from 'fs';
import path from 'path';

export interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  ext: string;
  hasRecentFile?: boolean;
}

const IGNORED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '$recycle.bin',
  'system volume information',
  '.velora_tmp',
  'tmp',
  '.idea',
  '.vscode'
]);

/**
 * 递归全量探测目录树内是否包含 7 天内修改/新增的近期文件（遇到首个命中立即短路退出）
 */
export async function checkDirHasRecentFiles(
  dirPath: string,
  now = Date.now(),
  thresholdMs = 7 * 24 * 60 * 60 * 1000
): Promise<boolean> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name.toLowerCase())) {
          continue;
        }
        const hasInSub = await checkDirHasRecentFiles(fullPath, now, thresholdMs);
        if (hasInSub) return true;
      } else {
        try {
          const stat = await fs.promises.stat(fullPath);
          const diff = now - stat.mtimeMs;
          if (diff >= 0 && diff <= thresholdMs) {
            return true;
          }
        } catch {
          // ignore unreadable files
        }
      }
    }
  } catch {
    // ignore unreadable directories
  }
  return false;
}

/**
 * 统一扫描本地目录，获取包含元数据的文件/文件夹条目列表
 */
export async function scanDirectory(dirPath: string): Promise<{ success: boolean; items: DirectoryItem[]; error?: string }> {
  try {
    if (!dirPath) {
      return { success: false, error: '目录路径为空', items: [] };
    }
    const stat = await fs.promises.stat(dirPath);
    if (!stat.isDirectory()) {
      return { success: false, error: '目标路径不是有效目录', items: [] };
    }
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const now = Date.now();
    const items: DirectoryItem[] = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name).replace(/\\/g, '/');
        try {
          const itemStat = await fs.promises.stat(fullPath);
          const isDir = itemStat.isDirectory();
          const ext = isDir ? '' : path.extname(entry.name).toLowerCase().replace(/^\./, '');
          const hasRecentFile = isDir ? await checkDirHasRecentFiles(fullPath, now) : false;
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : itemStat.size,
            mtime: itemStat.mtimeMs,
            ext,
            hasRecentFile
          };
        } catch {
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: 0,
            mtime: 0,
            ext: '',
            hasRecentFile: false
          };
        }
      })
    );
    return { success: true, items };
  } catch (err: any) {
    return { success: false, error: err.message || '读取目录失败', items: [] };
  }
}

/**
 * 跨开发环境与生产打包环境统一解析应用图标路径
 */
export function resolveAppIconPath(): string | null {
  const iconCandidates = [
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../../public/icon.png'),
    path.join(process.resourcesPath || '', 'public/icon.png'),
    path.join(process.resourcesPath || '', 'app.asar/public/icon.png'),
    path.join(process.cwd(), 'public/icon.png'),
    path.join(process.cwd(), 'build/icon.png')
  ];
  for (const candidate of iconCandidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * 带指数退避的原子文件系统操作重试器（专门解决 Windows 平台下的短暂 EBUSY/EPERM 文件句柄释放延迟）
 */
export async function retryFileOperation<T>(
  operation: () => Promise<T>,
  maxAttempts = 5,
  baseDelay = 60
): Promise<T> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const isLockError = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES';
      if (!isLockError || attempt === maxAttempts) {
        throw err;
      }
      const delay = Math.min(400, Math.round(baseDelay * Math.pow(1.5, attempt - 1)));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * 递归复制目录及其全部内容（用于跨分区 EXDEV 移动文件夹时的数据迁移兜底）
 */
export async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 递归全量搜索目录树下匹配关键词的所有文件与文件夹（无层级限制，自动过滤系统与临时目录）
 */
export async function searchDirectoryRecursive(
  rootDir: string,
  query: string
): Promise<{ success: boolean; items: DirectoryItem[]; error?: string }> {
  try {
    if (!rootDir) {
      return { success: false, error: '搜索根路径为空', items: [] };
    }
    const stat = await fs.promises.stat(rootDir);
    if (!stat.isDirectory()) {
      return { success: false, error: '目标路径不是有效目录', items: [] };
    }

    const trimmedQuery = (query || '').trim().toLowerCase();
    if (!trimmedQuery) {
      return { success: true, items: [] };
    }

    const items: DirectoryItem[] = [];
    const now = Date.now();

    const walk = async (currentDir: string) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch {
        return; // 忽略不可读或权限不足的文件夹
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (IGNORED_DIR_NAMES.has(entry.name.toLowerCase())) continue;

        const fullPath = path.join(currentDir, entry.name).replace(/\\/g, '/');
        const isDir = entry.isDirectory();

        // 检查文件名是否命中关键词
        const isMatched = entry.name.toLowerCase().includes(trimmedQuery);

        if (isMatched) {
          try {
            const itemStat = await fs.promises.stat(fullPath);
            const ext = isDir ? '' : path.extname(entry.name).toLowerCase().replace(/^\./, '');
            const hasRecentFile = isDir ? await checkDirHasRecentFiles(fullPath, now) : false;
            items.push({
              name: entry.name,
              path: fullPath,
              isDirectory: isDir,
              size: isDir ? 0 : itemStat.size,
              mtime: itemStat.mtimeMs,
              ext,
              hasRecentFile
            });
          } catch {
            items.push({
              name: entry.name,
              path: fullPath,
              isDirectory: isDir,
              size: 0,
              mtime: 0,
              ext: isDir ? '' : path.extname(entry.name).toLowerCase().replace(/^\./, ''),
              hasRecentFile: false
            });
          }
        }

        // 继续深入递归子目录
        if (isDir) {
          await walk(fullPath);
        }
      }
    };

    await walk(rootDir);
    return { success: true, items };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err), items: [] };
  }
}
