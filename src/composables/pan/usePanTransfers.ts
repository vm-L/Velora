import { ref, type Ref } from 'vue';
import { useDownloads } from '@/composables/useDownloads';
import { useMessage } from '@/composables/useMessage';
import { useConfirm } from '@/composables/useConfirm';
import { sanitizeFileName, sanitizeRelativePath } from '@/utils/pathSanitizer';
import { isVideoFile, type FlatDownloadTarget, type PanFileItem } from '@/composables/pan/types';

export interface UsePanTransfersOptions {
  panType: () => string;
  defaultReferer: () => string | undefined;
  currentFiles: Ref<PanFileItem[]>;
  selectedIds: Ref<string[]>;
  clearSelection: () => void;
  loadCurrentDirectory: (forceQuota?: boolean) => Promise<void>;
}

/**
 * 网盘媒体在线预览、并发递归下载（单文件与批量）及文件删除逻辑
 */
export function usePanTransfers(options: UsePanTransfersOptions) {
  const {
    panType,
    defaultReferer,
    currentFiles,
    selectedIds,
    clearSelection,
    loadCurrentDirectory
  } = options;

  const { addDownloadsBatch } = useDownloads();
  const { showMessage } = useMessage();
  const { confirm } = useConfirm();

  const isDownloading = ref(false);
  const isDeleting = ref(false);
  const activeVideoUrl = ref<string | null>(null);
  const activeAudioUrl = ref<string | null>(null);

  const handlePreview = async (file: PanFileItem) => {
    if (!window.electronAPI?.getPanPreviewUrl && !window.electronAPI?.getPanDownloadUrls) return;
    try {
      let url = '';
      if (window.electronAPI?.getPanPreviewUrl) {
        const res = await window.electronAPI.getPanPreviewUrl({
          type: panType(),
          fid: file.id,
          filename: file.name
        });
        if (res && !res.success && res.error) {
          throw new Error(res.error);
        }
        url = res?.previewUrl || '';
      } else if (window.electronAPI?.getPanDownloadUrls) {
        const res = await window.electronAPI.getPanDownloadUrls({
          type: panType(),
          fids: [file.id]
        });
        url = res?.urls?.[file.id] || '';
      }
      if (url) {
        if (isVideoFile(file)) {
          activeVideoUrl.value = url;
        } else {
          activeAudioUrl.value = url;
        }
      } else {
        showMessage('无法获取媒体直链', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message ? `预览失败: ${err.message}` : '预览失败', 'error');
    }
  };

  const getDownloadDirectory = async (): Promise<string> => {
    if (window.electronAPI?.getSetting) {
      try {
        const fileDir = await window.electronAPI.getSetting('fileDirectory');
        if (fileDir) return fileDir;
        const defaultDir = await window.electronAPI.getSetting('downloadPath');
        if (defaultDir) return defaultDir;
      } catch {}
    }
    return '';
  };

  const runConcurrent = async <T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> => {
    if (items.length === 0) return;
    let index = 0;
    const count = Math.min(Math.max(1, concurrency), items.length);
    await Promise.all(
      Array.from({ length: count }, async () => {
        while (index < items.length) {
          const current = items[index++];
          await worker(current);
        }
      })
    );
  };

  // 递归遍历网盘目录获取所有子文件，保持相对路径
  const collectFilesRecursively = async (
    item: PanFileItem,
    baseRelativePath = '',
    depth = 0
  ): Promise<FlatDownloadTarget[]> => {
    if (depth > 15) {
      throw new Error('目录层级过深（超过 15 层），已中止递归扫描');
    }
    const safeItemName = sanitizeFileName(item.name || 'download_file', item.isDirectory ? 'folder' : 'download_file');
    if (!item.isDirectory) {
      const relativePath = sanitizeRelativePath(
        baseRelativePath ? `${baseRelativePath}/${safeItemName}` : safeItemName,
        safeItemName
      );
      return [{ fid: item.id, name: safeItemName, relativePath, size: item.size }];
    }

    const results: FlatDownloadTarget[] = [];
    const folderRelativePath = sanitizeRelativePath(
      baseRelativePath ? `${baseRelativePath}/${safeItemName}` : safeItemName,
      'folder'
    );

    const subRes = await window.electronAPI?.listPanFiles?.({
      type: panType(),
      pdirFid: item.id
    });
    if (!subRes || !subRes.success) {
      throw new Error(subRes?.error || `读取目录 "${item.name}" 失败`);
    }

    const subItems: PanFileItem[] = Array.isArray(subRes.data?.files) ? subRes.data.files : [];
    const childFiles = subItems.filter(s => !s.isDirectory);
    const childDirs = subItems.filter(s => s.isDirectory);

    for (const f of childFiles) {
      const safeChildName = sanitizeFileName(f.name || 'download_file');
      results.push({
        fid: f.id,
        name: safeChildName,
        relativePath: `${folderRelativePath}/${safeChildName}`,
        size: f.size
      });
    }

    if (childDirs.length > 0) {
      const nestedResults: FlatDownloadTarget[] = [];
      await runConcurrent(childDirs, 4, async (subDir) => {
        const subFiles = await collectFilesRecursively(subDir, folderRelativePath, depth + 1);
        nestedResults.push(...subFiles);
      });
      results.push(...nestedResults);
    }

    return results;
  };

  const dispatchDownloadTargets = async (
    targets: FlatDownloadTarget[],
    saveDir: string,
    config: {
      successMessage: (count: number) => string;
      clearOnSuccess?: boolean;
    }
  ) => {
    const fids = targets.map((t) => t.fid);
    const urlRes = await window.electronAPI?.getPanDownloadUrls?.({
      type: panType(),
      fids
    });
    const urls = urlRes?.urls || {};
    const links = urlRes?.links || {};
    const normalizedDir = saveDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const activePanType = panType();
    const referer = defaultReferer();

    const batchItems = targets.flatMap((target) => {
      const linkInfo = links[target.fid];
      const url = linkInfo?.url || urls[target.fid];
      if (!url) return [];
      return [{
        url,
        name: target.name,
        savePath: `${normalizedDir}/${target.relativePath}`,
        customReferer: referer,
        headers: linkInfo?.headers,
        totalBytes: linkInfo?.size || target.size,
        panContext: {
          panType: activePanType,
          mode: 'drive' as const,
          fid: target.fid
        }
      }];
    });

    if (batchItems.length === 0) {
      showMessage('无法获取文件下载直链', 'error');
      return;
    }

    const addedCount = await addDownloadsBatch(batchItems);
    if (addedCount > 0) {
      showMessage(config.successMessage(addedCount), 'success');
      if (config.clearOnSuccess) {
        clearSelection();
      }
    }
  };

  // 单文件下载
  const handleDownloadSingle = async (file: PanFileItem) => {
    if (isDownloading.value) return;
    const saveDir = await getDownloadDirectory();
    if (!saveDir) {
      showMessage('请在设置中配置下载保存目录', 'warning');
      return;
    }

    isDownloading.value = true;
    try {
      const targets = await collectFilesRecursively(file);
      if (targets.length === 0) {
        showMessage('所选文件夹为空', 'warning');
        return;
      }

      await dispatchDownloadTargets(targets, saveDir, {
        successMessage: (count) => `已成功创建 ${count} 个下载任务`
      });
    } catch (err: any) {
      showMessage(err?.message ? `创建任务失败: ${err.message}` : '创建任务失败', 'error');
    } finally {
      isDownloading.value = false;
    }
  };

  // 批量下载所选
  const handleBatchDownload = async () => {
    if (isDownloading.value) return;
    const selectedItems = currentFiles.value.filter((f) => selectedIds.value.includes(f.id));
    if (selectedItems.length === 0) return;

    const saveDir = await getDownloadDirectory();
    if (!saveDir) {
      showMessage('请在设置中配置下载保存目录', 'warning');
      return;
    }

    isDownloading.value = true;
    try {
      const allTargets: FlatDownloadTarget[] = [];
      await runConcurrent(selectedItems, 4, async (item) => {
        const targets = await collectFilesRecursively(item);
        allTargets.push(...targets);
      });

      if (allTargets.length === 0) {
        showMessage('所选项中未包含有效文件', 'warning');
        return;
      }

      await dispatchDownloadTargets(allTargets, saveDir, {
        successMessage: (count) => `已成功添加 ${count} 个下载任务`,
        clearOnSuccess: true
      });
    } catch (err: any) {
      showMessage(err?.message ? `批量创建任务失败: ${err.message}` : '批量创建任务失败', 'error');
    } finally {
      isDownloading.value = false;
    }
  };

  // 单文件删除
  const handleDeleteSingle = async (file: PanFileItem) => {
    const confirmed = await confirm({
      title: '确认删除',
      message: `确定要从网盘中删除 "${file.name}" 吗？此操作无法撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    });

    if (!confirmed) return;

    try {
      const res = await window.electronAPI?.deletePanFiles?.({
        type: panType(),
        fids: [file.id]
      });
      if (res && res.success) {
        showMessage(`已从网盘删除 "${file.name}"`, 'success');
        loadCurrentDirectory(true);
      } else {
        showMessage(res?.error || '删除未成功', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message ? `删除失败: ${err.message}` : '删除失败', 'error');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.value.length === 0) return;

    const confirmed = await confirm({
      title: '确认批量删除',
      message: `确定要从网盘中永久删除选中的 ${selectedIds.value.length} 个文件/文件夹吗？此操作无法撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    });

    if (!confirmed) return;

    isDeleting.value = true;
    try {
      const res = await window.electronAPI?.deletePanFiles?.({
        type: panType(),
        fids: [...selectedIds.value]
      });
      if (res && res.success) {
        showMessage('所选文件已从网盘删除', 'success');
        clearSelection();
        loadCurrentDirectory(true);
      } else {
        showMessage(res?.error || '删除未成功', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message ? `删除失败: ${err.message}` : '删除失败', 'error');
    } finally {
      isDeleting.value = false;
    }
  };

  const resetPreviewState = () => {
    activeVideoUrl.value = null;
    activeAudioUrl.value = null;
  };

  return {
    isDownloading,
    isDeleting,
    activeVideoUrl,
    activeAudioUrl,
    handlePreview,
    handleDownloadSingle,
    handleBatchDownload,
    handleDeleteSingle,
    handleBatchDelete,
    resetPreviewState
  };
}
