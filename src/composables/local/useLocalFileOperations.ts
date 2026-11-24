import { ref, type Ref, type ComputedRef } from 'vue';
import type { MergeVideoItem } from '@/components/features/MergeVideoDialog.vue';
import { useMessage } from '@/composables/useMessage';
import { useConfirm } from '@/composables/useConfirm';
import { logger } from '@/services/logger';
import { getFileCategory, type LocalFileItem } from '@/composables/local/types';

export interface UseLocalFileOperationsOptions {
  currentPath: Ref<string>;
  selectedPaths: Ref<Set<string>>;
  selectedItems: ComputedRef<LocalFileItem[]>;
  closeContextMenu: () => void;
  loadDirectory: (dirPath: string) => Promise<void>;
}

/**
 * 本地文件预览打开、占用校验、重命名/新建/移动/删除与音视频压缩合并逻辑
 */
export function useLocalFileOperations(options: UseLocalFileOperationsOptions) {
  const { currentPath, selectedPaths, selectedItems, closeContextMenu, loadDirectory } = options;
  const { showMessage, removeMessage } = useMessage();
  const { confirm } = useConfirm();

  // Preview states
  const activeVideoUrl = ref<string | null>(null);
  const activeAudioUrl = ref<string | null>(null);
  const activeImageUrl = ref<string | null>(null);

  // Dialogs state
  const showNewFolderModal = ref<boolean>(false);
  const newFolderName = ref<string>('');

  const renameModal = ref<{ visible: boolean; item: LocalFileItem | null; newName: string }>({
    visible: false,
    item: null,
    newName: ''
  });

  const moveDialog = ref<{ visible: boolean; items: LocalFileItem[] }>({
    visible: false,
    items: []
  });

  const compressModal = ref<{ visible: boolean; task: any }>({
    visible: false,
    task: null
  });

  const isBatchCompressDialogVisible = ref<boolean>(false);
  const batchCompressTasks = ref<Array<{ id: string; name: string; savePath: string; totalBytes: number }>>([]);

  const isMergeVideoDialogVisible = ref<boolean>(false);
  const mergeVideosList = ref<MergeVideoItem[]>([]);

  const handlePreview = async (item: LocalFileItem) => {
    const cat = getFileCategory(item);
    if (cat === 'video') {
      activeVideoUrl.value = item.path;
    } else if (cat === 'audio') {
      activeAudioUrl.value = item.path;
    } else if (cat === 'image') {
      activeImageUrl.value = item.path;
    } else {
      // Open in system default application
      if (window.electronAPI) {
        await window.electronAPI.openFile(item.path);
      }
    }
  };

  const handleItemDblClick = (item: LocalFileItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path);
    } else {
      handlePreview(item);
    }
  };

  const handleContextPreview = (item: LocalFileItem) => {
    closeContextMenu();
    handleItemDblClick(item);
  };

  const openInExplorer = (targetPath: string) => {
    closeContextMenu();
    if (!targetPath || !window.electronAPI) return;
    window.electronAPI.showItemInFolder(targetPath);
  };

  /**
   * 检查指定路径（或该目录下的子文件）当前是否正被播放器/预览器打开播放中
   */
  const isPathCurrentlyPlayingOrPreviewed = (targetPath: string): { occupied: boolean; mediaName?: string } => {
    if (!targetPath) return { occupied: false };
    const normalizedTarget = targetPath.trim().replace(/\\/g, '/').toLowerCase();

    const activeMediaPaths = [
      activeVideoUrl.value,
      activeAudioUrl.value,
      activeImageUrl.value
    ].filter(Boolean) as string[];

    for (const activePath of activeMediaPaths) {
      const normalizedActive = activePath.trim().replace(/\\/g, '/').toLowerCase();
      const isExactMatch = normalizedActive === normalizedTarget;
      const isInsideFolder = normalizedActive.startsWith(normalizedTarget.endsWith('/') ? normalizedTarget : normalizedTarget + '/');

      if (isExactMatch || isInsideFolder) {
        const parts = activePath.replace(/\\/g, '/').split('/');
        const mediaName = parts[parts.length - 1] || '媒体文件';
        return { occupied: true, mediaName };
      }
    }

    return { occupied: false };
  };

  // Rename
  const openRenameModal = (item: LocalFileItem) => {
    closeContextMenu();
    const check = isPathCurrentlyPlayingOrPreviewed(item.path);
    if (check.occupied) {
      showMessage(`无法重命名：项目正在播放预览中（${check.mediaName}），请先关闭播放器`, 'warning');
      return;
    }
    renameModal.value = {
      visible: true,
      item,
      newName: item.name
    };
  };

  const handleConfirmRename = async () => {
    const { item, newName } = renameModal.value;
    if (!item || !newName.trim() || !window.electronAPI) return;

    const check = isPathCurrentlyPlayingOrPreviewed(item.path);
    if (check.occupied) {
      showMessage(`无法重命名：项目正在播放预览中（${check.mediaName}），请先关闭播放器`, 'warning');
      return;
    }

    const trimmed = newName.trim();
    const dir = item.path.substring(0, item.path.lastIndexOf(/[\\/]/.test(item.path) ? item.path.match(/[\\/]/)![0] : '/'));
    const newPath = `${dir}/${trimmed}`.replace(/\\/g, '/');

    try {
      const res = await window.electronAPI.moveFile(item.path, newPath);
      if (res && res.success) {
        showMessage(`重命名为 "${trimmed}" 成功`, 'success');
        renameModal.value.visible = false;
        await loadDirectory(currentPath.value);
      } else {
        showMessage(res?.error || '重命名失败', 'error');
      }
    } catch (err: any) {
      showMessage(`重命名失败: ${err?.message}`, 'error');
    }
  };

  // New Folder
  const handleConfirmNewFolder = async () => {
    const name = newFolderName.value.trim();
    if (!name || !window.electronAPI) return;

    const targetPath = `${currentPath.value}/${name}`.replace(/\\/g, '/');
    try {
      const res = await window.electronAPI.createLocalFolder(targetPath);
      if (res && res.success) {
        showMessage(`文件夹 "${name}" 创建成功`, 'success');
        showNewFolderModal.value = false;
        newFolderName.value = '';
        await loadDirectory(currentPath.value);
      } else {
        showMessage(res?.error || '创建文件夹失败', 'error');
      }
    } catch (err: any) {
      showMessage(`创建失败: ${err?.message}`, 'error');
    }
  };

  // Move
  const openMoveModal = (item: LocalFileItem) => {
    closeContextMenu();
    const check = isPathCurrentlyPlayingOrPreviewed(item.path);
    if (check.occupied) {
      showMessage(`无法移动：项目正在播放预览中（${check.mediaName}），请先关闭播放器`, 'warning');
      return;
    }
    moveDialog.value = {
      visible: true,
      items: [item]
    };
  };

  const openBatchMoveModal = () => {
    closeContextMenu();
    if (selectedItems.value.length === 0) return;
    for (const item of selectedItems.value) {
      const check = isPathCurrentlyPlayingOrPreviewed(item.path);
      if (check.occupied) {
        showMessage(`无法移动：项目 "${item.name}" 正在播放预览中，请先关闭播放器`, 'warning');
        return;
      }
    }
    moveDialog.value = {
      visible: true,
      items: [...selectedItems.value]
    };
  };

  const handleConfirmMove = async (targetDir: string) => {
    const targetItems = moveDialog.value.items;
    if (!targetItems || targetItems.length === 0 || !targetDir || !window.electronAPI) return;

    for (const item of targetItems) {
      const check = isPathCurrentlyPlayingOrPreviewed(item.path);
      if (check.occupied) {
        showMessage(`无法移动：项目 "${item.name}" 正在播放预览中，请先关闭播放器`, 'warning');
        return;
      }
    }

    const count = targetItems.length;
    if (count === 1) {
      const item = targetItems[0];
      const newPath = `${targetDir}/${item.name}`.replace(/\\/g, '/');
      const msgId = showMessage(`正在移动 "${item.name}"`, 'loading', 0);
      try {
        const res = await window.electronAPI.moveFile(item.path, newPath);
        removeMessage(msgId);
        if (res && res.success) {
          showMessage(`已将 "${item.name}" 移动至目标目录`, 'success');
          selectedPaths.value.delete(item.path);
          await loadDirectory(currentPath.value);
        } else {
          showMessage(res?.error || '移动失败', 'error');
        }
      } catch (err: any) {
        removeMessage(msgId);
        showMessage(`移动失败: ${err?.message}`, 'error');
      }
    } else {
      const msgId = showMessage('正在移动选中的项目', 'loading', 0);
      let failCount = 0;
      for (const item of targetItems) {
        const newPath = `${targetDir}/${item.name}`.replace(/\\/g, '/');
        try {
          const res = await window.electronAPI.moveFile(item.path, newPath);
          if (!res || !res.success) {
            failCount++;
            logger.error('LocalWorkspace', `[BatchMove] 移动失败 "${item.name}": ${res?.error}`);
          }
        } catch (err: any) {
          failCount++;
          logger.error('LocalWorkspace', `[BatchMove] 移动异常 "${item.name}": ${err?.message}`);
        }
      }
      removeMessage(msgId);
      if (failCount === 0) {
        showMessage('已成功移动选中的项目', 'success');
      } else {
        showMessage('移动完成，部分项目未能成功移动', 'warning');
      }
      selectedPaths.value = new Set();
      await loadDirectory(currentPath.value);
    }
  };

  // Single Compress
  const openCompressModal = (item: LocalFileItem) => {
    closeContextMenu();
    compressModal.value = {
      visible: true,
      task: {
        id: `local-${Math.random().toString(36).substr(2, 8)}`,
        name: item.name,
        savePath: item.path,
        totalBytes: item.size
      }
    };
  };

  const handleConfirmCompress = async ({ task, targetBitrateKbps }: { task: any; targetBitrateKbps: number }) => {
    if (!task || !window.electronAPI) return;
    showMessage(`已开始压缩 "${task.name}"`, 'info');
    try {
      const res = await window.electronAPI.compressVideoTask(task.id, task.savePath, targetBitrateKbps);
      if (res && res.success) {
        showMessage(`视频 "${task.name}" 压缩完成`, 'success');
        await loadDirectory(currentPath.value);
      } else if (res && res.error) {
        showMessage(`压缩失败: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showMessage(`压缩异常: ${err?.message}`, 'error');
    }
  };

  // Directory Compress (Recursive)
  const handleCompressDirectory = async (item: LocalFileItem) => {
    closeContextMenu();
    if (!item || !window.electronAPI) return;
    const msgId = showMessage(`正在扫描目录 "${item.name}" 中的视频文件`, 'loading', 0);
    try {
      const res = await window.electronAPI.scanLocalVideos([item.path]);
      if (res && res.success && res.videos && res.videos.length > 0) {
        removeMessage(msgId);
        batchCompressTasks.value = res.videos.map(v => ({
          id: `local-${Math.random().toString(36).substr(2, 8)}`,
          name: v.name,
          savePath: v.path,
          totalBytes: v.size
        }));
        isBatchCompressDialogVisible.value = true;
      } else {
        showMessage(`目录 "${item.name}" 及其子目录中未发现可压缩的视频文件`, 'warning', 3000, undefined, msgId);
      }
    } catch (err: any) {
      showMessage(`扫描视频文件失败: ${err?.message}`, 'error', 3000, undefined, msgId);
    }
  };

  // Merge Videos (Multi-selection)
  const openMergeVideoModal = async () => {
    closeContextMenu();
    if (!window.electronAPI || selectedPaths.value.size === 0) return;
    const msgId = showMessage('正在扫描所选项目中的视频文件', 'loading', 0);
    try {
      const paths = Array.from(selectedPaths.value);
      const res = await window.electronAPI.scanLocalVideos(paths);
      if (res && res.success && res.videos && res.videos.length >= 2) {
        removeMessage(msgId);
        mergeVideosList.value = res.videos.map(v => ({
          name: v.name,
          path: v.path,
          size: v.size
        }));
        isMergeVideoDialogVisible.value = true;
      } else if (res && res.success && res.videos && res.videos.length === 1) {
        showMessage('请至少选择 2 个视频文件进行合并', 'warning', 3000, undefined, msgId);
      } else {
        showMessage('所选项目中未发现足够的视频文件进行合并', 'warning', 3000, undefined, msgId);
      }
    } catch (err: any) {
      showMessage(`扫描视频文件失败: ${err?.message}`, 'error', 3000, undefined, msgId);
    }
  };

  const handleMergeSuccess = async (_outputPath: string) => {
    await loadDirectory(currentPath.value);
  };

  // Batch Compress (Multi-selection: files and directories)
  const openBatchCompressModal = async () => {
    closeContextMenu();
    if (!window.electronAPI || selectedPaths.value.size === 0) return;
    const msgId = showMessage('正在扫描所选项目中的视频文件', 'loading', 0);
    try {
      const paths = Array.from(selectedPaths.value);
      const res = await window.electronAPI.scanLocalVideos(paths);
      if (res && res.success && res.videos && res.videos.length > 0) {
        removeMessage(msgId);
        batchCompressTasks.value = res.videos.map(v => ({
          id: `local-${Math.random().toString(36).substr(2, 8)}`,
          name: v.name,
          savePath: v.path,
          totalBytes: v.size
        }));
        isBatchCompressDialogVisible.value = true;
      } else {
        showMessage('所选项目及子目录中未发现可压缩的视频文件', 'warning', 3000, undefined, msgId);
      }
    } catch (err: any) {
      showMessage(`扫描视频文件失败: ${err?.message}`, 'error', 3000, undefined, msgId);
    }
  };

  const handleConfirmBatchCompress = async ({ tasks: targetTasks, targetBitrateKbps }: { tasks: any[]; targetBitrateKbps: number }) => {
    if (targetTasks.length === 0 || !window.electronAPI) return;
    showMessage('已将选中的视频加入压缩处理队列', 'info');
    for (const t of targetTasks) {
      window.electronAPI.compressVideoTask(t.id, t.savePath, targetBitrateKbps).catch((err: any) => {
        logger.error('LocalWorkspace', `[BatchCompress] 异常: ${err?.message}`);
      });
    }
  };

  // Single Delete
  const handleDelete = async (item: LocalFileItem) => {
    closeContextMenu();
    const check = isPathCurrentlyPlayingOrPreviewed(item.path);
    if (check.occupied) {
      showMessage(`无法删除：项目正在播放预览中（${check.mediaName}），请先关闭播放器`, 'warning');
      return;
    }

    const isDir = item.isDirectory;
    const confirmed = await confirm({
      title: isDir ? '删除文件夹' : '删除文件',
      message: `确定要永久删除 ${isDir ? '文件夹及其内部所有内容' : '文件'} "${item.name}" 吗？此操作不可恢复。`,
      confirmText: '彻底删除',
      cancelText: '取消',
      type: 'danger'
    });
    if (!confirmed || !window.electronAPI) return;

    try {
      const res = await window.electronAPI.deleteLocalPath(item.path);
      if (res && res.success) {
        showMessage(`已删除 "${item.name}"`, 'success');
        selectedPaths.value.delete(item.path);
        await loadDirectory(currentPath.value);
      } else {
        showMessage(res?.error || '删除失败', 'error');
      }
    } catch (err: any) {
      showMessage(`删除失败: ${err?.message}`, 'error');
    }
  };

  // Batch Delete
  const handleBatchDelete = async () => {
    closeContextMenu();
    const count = selectedPaths.value.size;
    if (count === 0 || !window.electronAPI) return;

    for (const p of Array.from(selectedPaths.value)) {
      const check = isPathCurrentlyPlayingOrPreviewed(p);
      if (check.occupied) {
        const parts = p.replace(/\\/g, '/').split('/');
        const name = parts[parts.length - 1] || '文件';
        showMessage(`无法删除：项目 "${name}" 正在播放预览中，请先关闭播放器`, 'warning');
        return;
      }
    }

    const confirmed = await confirm({
      title: '批量删除',
      message: '确定要永久删除选中的文件和文件夹吗？此操作不可恢复。',
      confirmText: '彻底删除',
      cancelText: '取消',
      type: 'danger'
    });
    if (!confirmed) return;

    for (const p of Array.from(selectedPaths.value)) {
      try {
        await window.electronAPI.deleteLocalPath(p);
      } catch {
        logger.error('LocalWorkspace', `[BatchDelete] 删除失败: ${p}`);
      }
    }
    showMessage('已成功删除选中项', 'success');
    selectedPaths.value = new Set();
    await loadDirectory(currentPath.value);
  };

  return {
    activeVideoUrl,
    activeAudioUrl,
    activeImageUrl,
    showNewFolderModal,
    newFolderName,
    renameModal,
    moveDialog,
    compressModal,
    isBatchCompressDialogVisible,
    batchCompressTasks,
    isMergeVideoDialogVisible,
    mergeVideosList,
    handleItemDblClick,
    handlePreview,
    handleContextPreview,
    openInExplorer,
    isPathCurrentlyPlayingOrPreviewed,
    openRenameModal,
    handleConfirmRename,
    handleConfirmNewFolder,
    openMoveModal,
    openBatchMoveModal,
    handleConfirmMove,
    openCompressModal,
    handleConfirmCompress,
    handleCompressDirectory,
    openMergeVideoModal,
    handleMergeSuccess,
    openBatchCompressModal,
    handleConfirmBatchCompress,
    handleDelete,
    handleBatchDelete
  };
}
