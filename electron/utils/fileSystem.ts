import fs from 'fs';
import path from 'path';

export interface DirectoryItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  ext: string;
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
    const items: DirectoryItem[] = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name).replace(/\\/g, '/');
        try {
          const itemStat = await fs.promises.stat(fullPath);
          const isDir = itemStat.isDirectory();
          const ext = isDir ? '' : path.extname(entry.name).toLowerCase().replace(/^\./, '');
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : itemStat.size,
            mtime: itemStat.mtimeMs,
            ext
          };
        } catch {
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: 0,
            mtime: 0,
            ext: ''
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
