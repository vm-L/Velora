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

const RECENT_CACHE_TTL_MS = 60 * 1000;
const RECENT_CACHE_MAX_SIZE = 2000;
const recentDirCache = new Map<string, { mtimeMs: number; result: boolean; expireAt: number }>();

function getCachedRecentDir(dirPath: string, mtimeMs: number, now: number): boolean | undefined {
  const entry = recentDirCache.get(dirPath);
  if (!entry) return undefined;
  if (entry.mtimeMs !== mtimeMs || entry.expireAt <= now) {
    recentDirCache.delete(dirPath);
    return undefined;
  }
  return entry.result;
}

function setCachedRecentDir(dirPath: string, mtimeMs: number, result: boolean, now: number) {
  if (recentDirCache.size >= RECENT_CACHE_MAX_SIZE) {
    const oldestKey = recentDirCache.keys().next().value;
    if (oldestKey !== undefined) recentDirCache.delete(oldestKey);
  }
  recentDirCache.set(dirPath, {
    mtimeMs,
    result,
    expireAt: now + RECENT_CACHE_TTL_MS
  });
}

/**
 * 探测目录树内是否包含 7 天内修改/新增的近期文件
 * 优化：优先利用目录自身 mtime 短路，限制最大递归深度 (maxDepth=2) 与单次探测 stat 预算 (budget=250)，加 TTL 缓存
 */
export async function checkDirHasRecentFiles(
  dirPath: string,
  now = Date.now(),
  thresholdMs = 7 * 24 * 60 * 60 * 1000,
  maxDepth = 2,
  budget: { remaining: number } = { remaining: 250 }
): Promise<boolean> {
  try {
    if (budget.remaining <= 0) return false;

    const dirStat = await fs.promises.stat(dirPath);
    const dirDiff = now - dirStat.mtimeMs;
    if (dirDiff >= 0 && dirDiff <= thresholdMs) {
      return true;
    }

    const cached = getCachedRecentDir(dirPath, dirStat.mtimeMs, now);
    if (cached !== undefined) {
      return cached;
    }

    if (maxDepth <= 0) {
      return false;
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    let result = false;

    for (const entry of entries) {
      if (budget.remaining <= 0) break;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name.toLowerCase())) {
          continue;
        }
        budget.remaining--;
        const hasInSub = await checkDirHasRecentFiles(fullPath, now, thresholdMs, maxDepth - 1, budget);
        if (hasInSub) {
          result = true;
          break;
        }
      } else {
        budget.remaining--;
        try {
          const stat = await fs.promises.stat(fullPath);
          const diff = now - stat.mtimeMs;
          if (diff >= 0 && diff <= thresholdMs) {
            result = true;
            break;
          }
        } catch {
          // ignore unreadable files
        }
      }
    }

    setCachedRecentDir(dirPath, dirStat.mtimeMs, result, now);
    return result;
  } catch {
    // ignore unreadable directories
  }
  return false;
}

/**
 * 统一扫描本地目录，获取包含元数据的文件/文件夹条目列表（受控并发，防止大目录 I/O 风暴）
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
    const items: DirectoryItem[] = new Array(entries.length);
    const CONCURRENCY = 16;
    let nextIdx = 0;

    const worker = async () => {
      while (nextIdx < entries.length) {
        const i = nextIdx++;
        const entry = entries[i];
        const fullPath = path.join(dirPath, entry.name).replace(/\\/g, '/');
        try {
          const itemStat = await fs.promises.stat(fullPath);
          const isDir = itemStat.isDirectory();
          const ext = isDir ? '' : path.extname(entry.name).toLowerCase().replace(/^\./, '');
          const hasRecentFile = isDir
            ? await checkDirHasRecentFiles(fullPath, now, 7 * 24 * 60 * 60 * 1000, 2, { remaining: 250 })
            : false;
          items[i] = {
            name: entry.name,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : itemStat.size,
            mtime: itemStat.mtimeMs,
            ext,
            hasRecentFile
          };
        } catch {
          items[i] = {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: 0,
            mtime: 0,
            ext: '',
            hasRecentFile: false
          };
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let c = 0; c < Math.min(CONCURRENCY, Math.max(1, entries.length)); c++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    return { success: true, items };
  } catch (err: any) {
    return { success: false, error: err.message || '读取目录失败', items: [] };
  }
}

/**
 * 跨开发环境与生产打包环境统一解析应用 ICO 图标路径（优先使用 build/icon.ico）
 */
export function resolveAppIcoPath(): string | null {
  const icoCandidates = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked/build/icon.ico'),
    path.join(__dirname, '../build/icon.ico').replace('app.asar', 'app.asar.unpacked'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../../build/icon.ico'),
    path.join(process.resourcesPath || '', 'build/icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar/build/icon.ico'),
    path.join(process.cwd(), 'build/icon.ico'),
    path.join(__dirname, '../dist/icon.ico'),
    path.join(__dirname, '../public/icon.ico'),
    path.join(process.cwd(), 'public/icon.ico')
  ];
  for (const candidate of icoCandidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * 跨开发环境与生产打包环境统一解析应用 PNG 图标路径
 */
export function resolveAppIconPath(): string | null {
  const iconCandidates = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked/build/icon.png'),
    path.join(__dirname, '../build/icon.png').replace('app.asar', 'app.asar.unpacked'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(process.resourcesPath || '', 'build/icon.png'),
    path.join(process.resourcesPath || '', 'app.asar/build/icon.png'),
    path.join(process.cwd(), 'build/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../../public/icon.png'),
    path.join(process.resourcesPath || '', 'public/icon.png'),
    path.join(process.resourcesPath || '', 'app.asar/public/icon.png'),
    path.join(process.cwd(), 'public/icon.png')
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

const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function sanitizeFileName(rawName: string, fallback = 'download_file'): string {
  const safeFallback =
    String(fallback || 'download_file')
      .replace(/[\x00-\x1f\x7f]/g, '')
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim()
      .replace(/[\s.]+$/, '') || 'download_file';

  let clean = String(rawName || '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .replace(/[\s.]+$/, '');

  if (!clean || clean === '.' || clean === '..') {
    return safeFallback;
  }

  if (WINDOWS_RESERVED_RE.test(clean)) {
    clean = `_${clean}`;
  }

  if (clean.length > 200) {
    const dotIdx = clean.lastIndexOf('.');
    const hasExt = dotIdx > 0 && clean.length - dotIdx <= 16;
    if (hasExt) {
      const ext = clean.slice(dotIdx);
      const stem = clean.slice(0, 200 - ext.length).replace(/[\s.]+$/, '') || 'file';
      clean = `${stem}${ext}`;
    } else {
      clean = clean.slice(0, 200).replace(/[\s.]+$/, '') || safeFallback;
    }
  }

  return clean;
}

export function sanitizeRelativePath(rawRelPath: string, fallbackName = 'download_file'): string {
  const rawSegments = String(rawRelPath || '')
    .split(/[\\/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..');

  if (rawSegments.length === 0) {
    return sanitizeFileName(fallbackName);
  }

  const safeSegments = rawSegments.map((seg, idx) =>
    sanitizeFileName(seg, idx === rawSegments.length - 1 ? fallbackName : 'dir')
  );
  return safeSegments.join('/');
}

/**
 * 校验并清洗完整保存路径：禁止 `..` 路径穿越段，清洗非根目录的各子目录与文件名非法字符
 */
export function ensureSafeTargetSavePath(rawSavePath: string, fallbackName = 'download_file'): string {
  const normalized = path.normalize(String(rawSavePath || '').trim());
  if (!normalized) {
    throw new Error('目标保存路径为空');
  }
  const parsed = path.parse(normalized);
  const tail = normalized.slice(parsed.root.length);
  const rawSegments = tail.split(/[\\/]+/).filter((s) => s.length > 0);
  if (rawSegments.some((s) => s === '..')) {
    throw new Error('检测到非法目标保存路径（禁止路径穿越）');
  }
  if (rawSegments.length === 0) {
    return path.join(parsed.root || '.', sanitizeFileName(fallbackName));
  }
  const cleanSegments = rawSegments.map((seg, idx) =>
    sanitizeFileName(seg, idx === rawSegments.length - 1 ? fallbackName : 'dir')
  );
  return path.join(parsed.root, ...cleanSegments);
}

/**
 * 将相对路径安全解析为 baseDir 下的绝对子路径，并严格校验不越界
 */
export function resolveSafeChildPath(baseDir: string, unsafeRelPath: string, fallbackName = 'download_file'): string {
  const resolvedBase = path.resolve(baseDir);
  const safeRel = sanitizeRelativePath(unsafeRelPath, fallbackName);
  const target = path.resolve(resolvedBase, ...safeRel.split('/'));
  const prefix = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
  if (target !== resolvedBase && !target.startsWith(prefix)) {
    throw new Error('非法目标路径：禁止越出保存目录');
  }
  return target;
}
