import { ref, watch } from 'vue';
import { db } from '@/db';
import { useSettings } from '@/composables/useSettings';
import { isSimilarExistingFile } from '@/utils/similarity';
import { logger } from '@/services/logger';

export interface DuplicateCheckResult {
  type: 'exact' | 'similar' | 'none';
  name?: string;
  paths: string[];
}

// 全局单例去重索引 Map: {"demo.txt": ['/path1/demo.txt', '/path2/demo.txt']}
const fileIndexMap = ref<Map<string, string[]>>(new Map());
const isIndexing = ref(false);
const isReady = ref(false);
let initPromise: Promise<void> | null = null;
let isWatcherInitialized = false;

export const useFileDeduplication = () => {
  const { state: settingsState, loadSettings } = useSettings();

  /**
   * 规范化路径为统一正斜杠
   */
  const normalizePath = (p: string): string => {
    return (p || '').replace(/\\/g, '/');
  };

  /**
   * 在内存 Map 中记录一个文件项
   */
  const recordFile = (name: string, filePath: string) => {
    if (!name || !filePath) return;
    const cleanPath = normalizePath(filePath);
    const existing = fileIndexMap.value.get(name);
    if (!existing) {
      fileIndexMap.value.set(name, [cleanPath]);
    } else if (!existing.includes(cleanPath)) {
      existing.push(cleanPath);
    }
  };

  /**
   * 从内存 Map 中移除一个文件路径或整个键
   */
  const removeFile = (name: string, filePath?: string) => {
    if (!name) return;
    if (!filePath) {
      fileIndexMap.value.delete(name);
      return;
    }
    const cleanPath = normalizePath(filePath);
    const existing = fileIndexMap.value.get(name);
    if (existing) {
      const filtered = existing.filter(p => p !== cleanPath);
      if (filtered.length > 0) {
        fileIndexMap.value.set(name, filtered);
      } else {
        fileIndexMap.value.delete(name);
      }
    }
  };

  /**
   * 增量扫描指定目录并合并进 Map
   */
  const rescanDirectories = async (dirs: string[]) => {
    if (!window.electronAPI || !window.electronAPI.scanDirectoriesAllFiles) return;
    const validDirs = dirs.filter(d => typeof d === 'string' && d.trim());
    if (validDirs.length === 0) return;

    try {
      const scanned = await window.electronAPI.scanDirectoriesAllFiles(validDirs, 5);
      if (Array.isArray(scanned)) {
        for (const item of scanned) {
          if (item && item.name && item.path) {
            recordFile(item.name, item.path);
          }
        }
      }
    } catch (err: any) {
      logger.warn('Deduplication', `增量扫描目录失败: ${err.message}`);
    }
  };

  /**
   * 启动时全量初始化索引
   */
  const initFileIndex = async () => {
    if (isReady.value) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      isIndexing.value = true;
      const startTime = performance.now();
      logger.info('Deduplication', '开始构建启动文件去重内存 Map 索引...');

      try {
        await loadSettings();

        // 1. 遍历并加载所有历史与进行中的下载任务
        try {
          const allTasks = await db.downloads.toArray();
          for (const t of allTasks) {
            if (t.name && t.savePath) {
              recordFile(t.name, t.savePath);
            }
          }
        } catch (dbErr: any) {
          logger.warn('Deduplication', `读取下载任务库失败: ${dbErr.message}`);
        }

        // 2. 收集配置的 4 大基础下载目录
        const configuredDirs: string[] = [
          settingsState.imageDirectory,
          settingsState.audioDirectory,
          settingsState.videoDirectory,
          settingsState.fileDirectory
        ].filter(Boolean);

        // 3. 扫描基础下载目录下的所有文件
        if (configuredDirs.length > 0 && window.electronAPI?.scanDirectoriesAllFiles) {
          try {
            const files = await window.electronAPI.scanDirectoriesAllFiles(configuredDirs, 5);
            if (Array.isArray(files)) {
              for (const f of files) {
                if (f && f.name && f.path) {
                  recordFile(f.name, f.path);
                }
              }
            }
          } catch (scanErr: any) {
            logger.warn('Deduplication', `扫描下载目录文件失败: ${scanErr.message}`);
          }
        }

        isReady.value = true;
        const elapsed = (performance.now() - startTime).toFixed(2);
        let totalFiles = 0;
        fileIndexMap.value.forEach(paths => { totalFiles += paths.length; });
        logger.info('Deduplication', `文件去重内存 Map 构建完成，耗时 ${elapsed}ms，共索引 ${fileIndexMap.value.size} 个文件名 (${totalFiles} 个物理路径)`);

        // 4. 初始化配置变更监听器
        if (!isWatcherInitialized) {
          isWatcherInitialized = true;
          watch(
            [
              () => settingsState.imageDirectory,
              () => settingsState.audioDirectory,
              () => settingsState.videoDirectory,
              () => settingsState.fileDirectory
            ],
            (newDirs, oldDirs) => {
              const changedDirs: string[] = [];
              newDirs.forEach((nd, i) => {
                const od = oldDirs ? oldDirs[i] : undefined;
                if (nd && nd !== od) {
                  changedDirs.push(nd);
                }
              });
              if (changedDirs.length > 0) {
                logger.info('Deduplication', `检测到下载目录配置变更，触发增量扫描: ${changedDirs.join(', ')}`);
                rescanDirectories(changedDirs);
              }
            }
          );
        }
      } catch (err: any) {
        logger.error('Deduplication', `初始化去重索引异常: ${err.message}`);
      } finally {
        isIndexing.value = false;
        initPromise = null;
      }
    })();

    return initPromise;
  };

  /**
   * 毫秒级两级去重校验：
   * 1. O(1) 严格全字精确匹配
   * 2. 纯内存 keys() 遍历 isSimilarExistingFile 相似度匹配
   */
  const checkDuplicate = (targetFileName: string): DuplicateCheckResult => {
    if (!targetFileName || typeof targetFileName !== 'string') {
      return { type: 'none', paths: [] };
    }
    const cleanName = targetFileName.trim();
    if (!cleanName) {
      return { type: 'none', paths: [] };
    }

    // 第 1 级：O(1) 严格区分大小写精确同名匹配
    const exactPaths = fileIndexMap.value.get(cleanName);
    if (exactPaths && exactPaths.length > 0) {
      return {
        type: 'exact',
        name: cleanName,
        paths: [...exactPaths]
      };
    }

    // 第 2 级：内存遍历相似度算法
    for (const existingKey of fileIndexMap.value.keys()) {
      if (isSimilarExistingFile(existingKey, cleanName)) {
        const similarPaths = fileIndexMap.value.get(existingKey) || [];
        if (similarPaths.length > 0) {
          return {
            type: 'similar',
            name: existingKey,
            paths: [...similarPaths]
          };
        }
      }
    }

    return { type: 'none', paths: [] };
  };

  /**
   * 获取精确匹配的物理路径列表
   */
  const getExactMatches = (fileName: string): string[] => {
    if (!fileName) return [];
    return fileIndexMap.value.get(fileName.trim()) || [];
  };

  /**
   * 清除失效死路径
   */
  const auditCleanDeadPaths = (validPaths: Set<string>) => {
    fileIndexMap.value.forEach((paths, name) => {
      const active = paths.filter(p => validPaths.has(p));
      if (active.length === 0) {
        fileIndexMap.value.delete(name);
      } else if (active.length !== paths.length) {
        fileIndexMap.value.set(name, active);
      }
    });
  };

  return {
    fileIndexMap,
    isIndexing,
    isReady,
    initFileIndex,
    recordFile,
    removeFile,
    rescanDirectories,
    checkDuplicate,
    getExactMatches,
    auditCleanDeadPaths
  };
};
