import { ref, type ComputedRef, type Ref } from 'vue';
import type { DownloadTask } from '@/db';
import { useMessage } from '@/composables/useMessage';
import { useNotification } from '@/composables/useNotification';
import { useConfirm } from '@/composables/useConfirm';
import { useSettings } from '@/composables/useSettings';
import { useSaveMediaDialog } from '@/composables/useSaveMediaDialog';
import { logger } from '@/services/logger';
import { isImageTask, isAudioTask, isVideoTask } from '@/composables/home/taskHelpers';

export interface UseHomeTaskActionsOptions {
  tasks: Ref<DownloadTask[]>;
  selectedTasks: Ref<string[]>;
  selectedCompressibleTasks: ComputedRef<DownloadTask[]>;
  updateTaskDb: (task: DownloadTask) => Promise<void>;
  skipFailedSegmentsTask: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteTask: (id: string, deleteFile?: boolean) => Promise<void>;
}

/**
 * 首页下载任务的预览、编辑、压缩、目录定位与单条操作逻辑
 */
export function useHomeTaskActions(options: UseHomeTaskActionsOptions) {
  const {
    tasks,
    selectedTasks,
    selectedCompressibleTasks,
    updateTaskDb,
    skipFailedSegmentsTask,
    deleteTask
  } = options;

  const { showMessage } = useMessage();
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();
  const { state: settingsState } = useSettings();
  const { openSaveMediaDialog } = useSaveMediaDialog();

  const showNewDownloadModal = ref(false);
  const activeImagePreviewUrl = ref<string | null>(null);
  const activeAudioPreviewUrl = ref<string | null>(null);
  const activeVideoPreviewUrl = ref<string | null>(null);

  const handleVideoEditComplete = async (payload: { mode: 'replace' | 'saveAs'; outputPath: string; sourcePath: string }) => {
    if (!window.electronAPI?.getVideoMediaInfo) return;
    try {
      const targetPath = payload.mode === 'replace' ? payload.sourcePath : payload.outputPath;
      const task = tasks.value.find(t => t.savePath === targetPath || t.savePath === payload.sourcePath);
      if (task && payload.mode === 'replace') {
        const info = await window.electronAPI.getVideoMediaInfo(payload.sourcePath);
        if (info && info.size > 0) {
          task.totalBytes = info.size;
          task.receivedBytes = info.size;
          await updateTaskDb(task);
        }
      }
    } catch (err: any) {
      logger.error('HomeView', `Failed to update edited task file size: ${err?.message}`);
    }
  };

  const editTaskDialogVisible = ref(false);
  const editingTask = ref<any>(null);

  const openEditTask = (task: any) => {
    editingTask.value = task;
    editTaskDialogVisible.value = true;
  };

  const isCompressDialogVisible = ref(false);
  const compressingTask = ref<any>(null);

  const openCompressDialog = (task: any) => {
    compressingTask.value = task;
    isCompressDialogVisible.value = true;
  };

  const isVideoEditDialogVisible = ref(false);
  const videoEditTargetPath = ref<string | null>(null);
  const videoEditTargetTitle = ref('');

  const openVideoEditDialog = (task: any) => {
    if (!task?.savePath) return;
    videoEditTargetPath.value = task.savePath;
    videoEditTargetTitle.value = task.name || '';
    isVideoEditDialogVisible.value = true;
  };

  const isBatchCompressDialogVisible = ref(false);

  const openBatchCompressDialog = () => {
    if (selectedCompressibleTasks.value.length === 0) return;
    isBatchCompressDialogVisible.value = true;
  };

  const handleConfirmBatchCompress = async ({ tasks: targetTasks, targetBitrateKbps }: { tasks: any[]; targetBitrateKbps: number }) => {
    if (targetTasks.length === 0 || !window.electronAPI) return;

    selectedTasks.value = [];
    showMessage('已将选中的视频加入压缩处理队列', 'info');

    for (const t of targetTasks) {
      t.speed = 0;
      delete t.speedText;
      delete t.etaSeconds;
      // 后台触发，downloader.ts 单并发压缩队列会自动管理排队与运行
      window.electronAPI.compressVideoTask(t.id, t.savePath, targetBitrateKbps).catch((err: any) => {
        logger.error('Home', `[BatchCompress] 任务 ${t.id} 压缩触发异常: ${err?.message}`);
      });
    }
  };

  const handleConfirmCompress = async ({ task, targetBitrateKbps }: { task: any; targetBitrateKbps: number }) => {
    if (!task || !window.electronAPI) return;
    task.status = 'compressing';
    task.progress = 0;
    task.speed = 0;
    delete task.speedText;
    delete task.etaSeconds;
    await updateTaskDb(task);
    showMessage(`已开始压缩视频 "${task.name}"`, 'info');

    try {
      const res = await window.electronAPI.compressVideoTask(task.id, task.savePath, targetBitrateKbps);
      if (res && res.success && res.newSize) {
        task.status = 'completed';
        task.progress = 100;
        task.receivedBytes = res.newSize;
        task.totalBytes = res.newSize;
        delete task.speedText;
        delete task.etaSeconds;
        await updateTaskDb(task);
      } else if (res && !res.success) {
        task.status = 'completed';
        delete task.speedText;
        delete task.etaSeconds;
        await updateTaskDb(task);
        if (res.error && res.error !== '压缩已取消') {
          showNotification({
            type: 'error',
            title: '视频压缩失败',
            message: task.name,
            detail: res.error,
            sourceRoute: '/'
          });
        }
      }
    } catch (err: any) {
      task.status = 'completed';
      delete task.speedText;
      delete task.etaSeconds;
      await updateTaskDb(task);
      showNotification({
        type: 'error',
        title: '视频压缩失败',
        message: task.name,
        detail: err.message || '压缩发生未知异常',
        sourceRoute: '/'
      });
    }
  };

  const onDownloadAudio = (url: string) => {
    let name = '';
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/');
      name = parts[parts.length - 1] || 'audio.mp3';
    } catch {
      name = 'audio.mp3';
    }

    openSaveMediaDialog({
      url,
      defaultName: name,
      defaultDir: settingsState.audioDirectory,
      type: 'audio'
    });
  };

  const openTask = async (task: any) => {
    logger.info('HomeView', `openTask invoked for task ID: ${task.id}, name: ${task.name}, savePath: ${task.savePath}`);
    if (!task.savePath) {
      showMessage('文件路径不存在', 'error');
      return;
    }

    if (window.electronAPI) {
      const exists = await window.electronAPI.fileExists(task.savePath);
      if (!exists) {
        task.status = 'file_removed';
        showMessage('本地文件已移除', 'error');
        await updateTaskDb(task);
        return;
      }

      if (task.status === 'file_removed' || task.status === 'file_corrupted') {
        task.status = 'completed';
        task.progress = 100;
        await updateTaskDb(task);
        showMessage('已识别到本地文件，状态恢复为已完成', 'success');
      }

      if (isImageTask(task)) {
        logger.info('HomeView', `Opening ImagePreviewDialog for path: ${task.savePath}`);
        activeImagePreviewUrl.value = task.savePath;
        return;
      } else if (isAudioTask(task)) {
        logger.info('HomeView', `Opening AudioPlayerDialog for path: ${task.savePath}`);
        activeAudioPreviewUrl.value = task.savePath;
        return;
      } else if (isVideoTask(task)) {
        logger.info('HomeView', `Opening VideoPlayerDialog for path: ${task.savePath}`);
        activeVideoPreviewUrl.value = task.savePath;
        return;
      }

      const userConfirmed = await confirm({
        title: '使用系统应用打开',
        message: '当前应用不支持该格式，是否使用系统默认应用打开该文件？',
        confirmText: '打开',
        cancelText: '取消'
      });

      if (userConfirmed) {
        const res = await window.electronAPI.openFile(task.savePath);
        if (!res.success) {
          if (res.code === 'NOT_FOUND') {
            task.status = 'file_removed';
            showMessage('本地文件已移除', 'error');
          } else {
            task.status = 'file_corrupted';
            showMessage('本地文件已损坏或无法打开', 'error');
          }
          await updateTaskDb(task);
        }
      }
    }
  };

  const confirmSkipFailedSegments = async (task: any) => {
    if (!task?.id) return;
    const userConfirmed = await confirm({
      title: '跳过失效分片并封装',
      message: '确定要跳过当前无法下载的失败分片，直接合并封装已完成部分吗？缺失位置在播放时可能会有短暂跳帧。',
      confirmText: '跳过并封装',
      cancelText: '取消',
      type: 'warning'
    });
    if (!userConfirmed) return;

    const res = await skipFailedSegmentsTask(task.id);
    if (!res?.success && res?.error) {
      showMessage(`跳过封装失败: ${res.error}`, 'error', 3000);
    }
  };

  const openDirectory = async (task: any) => {
    if (!task.savePath) {
      showMessage('任务路径未知', 'error');
      return;
    }

    const normalizedPath = task.savePath.replace(/\\/g, '/');
    const dir = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));

    // 正在下载、处理、等待或暂停的任务，最终文件尚未落地，直接打开所在目录即可
    const isUnfinished = ['downloading', 'compressing', 'converting', 'processing', 'resolving', 'waiting', 'paused'].includes(task.status);

    if (isUnfinished) {
      if (window.electronAPI) {
        const dirExists = await window.electronAPI.fileExists(dir);
        if (dirExists) {
          if (window.electronAPI.openFile) {
            window.electronAPI.openFile(dir);
          } else {
            window.electronAPI.showItemInFolder(dir);
          }
        } else {
          showMessage('保存目录尚未创建', 'warning');
        }
      }
      return;
    }

    // 已完成或异常任务，进行文件精准校验
    if (window.electronAPI && window.electronAPI.showItemInFolder) {
      const exists = await window.electronAPI.fileExists(task.savePath);
      if (exists) {
        if (task.status === 'file_removed' || task.status === 'file_corrupted') {
          task.status = 'completed';
          task.progress = 100;
          await updateTaskDb(task);
          showMessage('已识别到本地文件，状态恢复为已完成', 'success');
        }
        // 文件真实存在，高亮选中文件
        window.electronAPI.showItemInFolder(task.savePath);
      } else {
        // 文件不存在，标为本地文件已移除并更新数据库
        task.status = 'file_removed';
        await updateTaskDb(task);
        showMessage('本地文件已移除', 'error');

        const dirExists = await window.electronAPI.fileExists(dir);
        if (dirExists) {
          if (window.electronAPI.openFile) {
            window.electronAPI.openFile(dir);
          } else {
            window.electronAPI.showItemInFolder(dir);
          }
        } else {
          showMessage('文件所在目录尚未创建或已被删除', 'error');
        }
      }
    }
  };

  const confirmDeleteTask = async (task: any) => {
    let fileExists = false;
    if (task.savePath && window.electronAPI && window.electronAPI.fileExists) {
      fileExists = await window.electronAPI.fileExists(task.savePath);
    }

    const { confirmed, checked } = await confirm({
      title: '删除任务',
      message: `确定要删除任务 "${task.name}" 的记录吗？`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
      checkboxLabel: '是否同时删除文件',
      defaultChecked: true
    });

    if (confirmed) {
      const shouldDeleteFile = checked && fileExists;
      await deleteTask(task.id, shouldDeleteFile);
      if (shouldDeleteFile) {
        showMessage('已删除任务记录及本地文件', 'success');
      } else {
        showMessage('已删除任务记录', 'success');
      }
    }
  };

  return {
    showNewDownloadModal,
    activeImagePreviewUrl,
    activeAudioPreviewUrl,
    activeVideoPreviewUrl,
    handleVideoEditComplete,
    editTaskDialogVisible,
    editingTask,
    openEditTask,
    isCompressDialogVisible,
    compressingTask,
    openCompressDialog,
    isVideoEditDialogVisible,
    videoEditTargetPath,
    videoEditTargetTitle,
    openVideoEditDialog,
    isBatchCompressDialogVisible,
    openBatchCompressDialog,
    handleConfirmBatchCompress,
    handleConfirmCompress,
    onDownloadAudio,
    openTask,
    confirmSkipFailedSegments,
    openDirectory,
    confirmDeleteTask
  };
}
