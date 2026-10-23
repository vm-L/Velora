import { ref, computed } from 'vue';
import { useMessage } from './useMessage';
import { useNotification } from './useNotification';

export interface VideoEditTaskItem {
  id: string;
  type?: 'cut' | 'merge' | 'compress';
  title: string;
  sourcePath?: string;
  segments?: Array<{ start: number; end: number }>;
  outputPath?: string;
  mode?: 'replace' | 'saveAs';
  status: 'waiting' | 'processing' | 'completed' | 'error' | 'cancelled';
  percent: number;
  text: string;
  error?: string;
  finalOutputPath?: string;
  createdAt: number;
}

const tasks = ref<VideoEditTaskItem[]>([]);
const activeTaskId = ref<string | null>(null);
const isModalVisible = ref(false);
const isMinimized = ref(false);
let isInitialized = false;

function syncStateFromMain(state: { activeTask: any; queue: any[]; totalCount: number }) {
  if (!state) return;

  const newTasks: VideoEditTaskItem[] = [];

  if (state.activeTask) {
    const at = state.activeTask;
    activeTaskId.value = at.id;
    newTasks.push({
      id: at.id,
      type: at.type,
      title: at.title || '正在处理',
      status: at.status === 'running' ? 'processing' : at.status,
      percent: Math.min(100, Math.max(0, Math.round(at.progress || 0))),
      text: at.statusText || '正在处理中...',
      error: at.error,
      finalOutputPath: at.outputPath,
      createdAt: at.createdAt || Date.now()
    });
  } else {
    activeTaskId.value = null;
  }

  if (Array.isArray(state.queue)) {
    for (const qt of state.queue) {
      newTasks.push({
        id: qt.id,
        type: qt.type,
        title: qt.title || '排队任务',
        status: 'waiting',
        percent: 0,
        text: qt.statusText || '排队等待处理...',
        error: qt.error,
        createdAt: qt.createdAt || Date.now()
      });
    }
  }

  tasks.value = newTasks;

  if (state.totalCount === 0) {
    if (isMinimized.value) {
      isMinimized.value = false;
    }
  }
}

// 初始化全局主进程监听
function initGlobalQueueSync() {
  if (isInitialized) return;
  isInitialized = true;

  const { showMessage } = useMessage();
  const { showNotification } = useNotification();

  if (window.electronAPI?.getVideoQueueState) {
    window.electronAPI.getVideoQueueState().then((state) => {
      syncStateFromMain(state);
    }).catch(() => {});
  }

  if (window.electronAPI?.onVideoQueueStateChanged) {
    window.electronAPI.onVideoQueueStateChanged((state) => {
      syncStateFromMain(state);
    });
  }

  if (window.electronAPI?.onVideoTaskFinished) {
    window.electronAPI.onVideoTaskFinished((data) => {
      const task = data.task || {};
      const rawTitle = task.title || '视频';
      const cleanTitle = rawTitle.replace(/^(剪辑(\(覆盖\))?|合并|压缩):\s*/, '').trim() || '视频';

      if (data.success) {
        showMessage({
          text: `${cleanTitle} 处理完成`,
          type: 'success',
          duration: 3500
        });
        showNotification({
          type: 'success',
          title: '处理完成',
          message: cleanTitle,
          duration: 3000
        });
      } else if (task.status === 'cancelled') {
        showMessage({
          text: `${cleanTitle} 任务已取消`,
          type: 'info',
          duration: 2500
        });
      } else {
        const errMsg = task.error || '处理失败';
        showMessage({
          text: `${cleanTitle} 处理失败: ${errMsg}`,
          type: 'error',
          duration: 4000
        });
        showNotification({
          type: 'error',
          title: '处理失败',
          message: `${cleanTitle}: ${errMsg}`,
          duration: 0
        });
      }
    });
  }
}

initGlobalQueueSync();

const activeTask = computed(() => {
  if (!activeTaskId.value) return null;
  return tasks.value.find(t => t.id === activeTaskId.value) || null;
});

const waitingTasks = computed(() => {
  return tasks.value.filter(t => t.status === 'waiting');
});

const activeOrWaitingCount = computed(() => {
  return tasks.value.filter(t => t.status === 'processing' || t.status === 'waiting').length;
});

const hasActiveOrWaitingTasks = computed(() => {
  return activeOrWaitingCount.value > 0;
});

export function useVideoEditQueue() {
  initGlobalQueueSync();

  /**
   * 将剪辑任务推入主进程全局任务队列
   */
  const enqueueTask = async (params: {
    sourcePath: string;
    segments: Array<{ start: number; end: number }>;
    mode: 'replace' | 'saveAs';
    outputPath?: string;
    title?: string;
  }): Promise<string> => {
    const taskId = 'task_edit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const fileName = params.outputPath
      ? params.outputPath.split(/[/\\]/).pop() || '未命名视频'
      : params.sourcePath.split(/[/\\]/).pop() || '未命名视频';

    const title = params.title || fileName;

    if (window.electronAPI?.enqueueVideoTask) {
      await window.electronAPI.enqueueVideoTask({
        id: taskId,
        type: 'cut',
        title: title,
        payload: {
          cutParams: {
            taskId: taskId,
            sourcePath: params.sourcePath,
            segments: params.segments.map(s => ({ start: s.start, end: s.end })),
            outputPath: params.outputPath,
            mode: params.mode
          }
        },
        extra: {
          sourcePath: params.sourcePath,
          mode: params.mode
        }
      });
    }

    // 默认展示居中详情弹窗
    isModalVisible.value = true;
    isMinimized.value = false;

    return taskId;
  };

  /**
   * 取消指定的任务（统一通知主进程）
   */
  const cancelTask = async (taskId: string) => {
    if (window.electronAPI?.cancelVideoTask) {
      await window.electronAPI.cancelVideoTask(taskId);
    } else if (window.electronAPI?.cancelVideoEdit) {
      await window.electronAPI.cancelVideoEdit(taskId);
    }
  };

  /**
   * 取消当前运行中的任务
   */
  const cancelCurrentTask = async () => {
    if (activeTaskId.value) {
      await cancelTask(activeTaskId.value);
    } else if (waitingTasks.value.length > 0) {
      await cancelTask(waitingTasks.value[0].id);
    }
  };

  /**
   * 移除已完成或出错的历史任务项
   */
  const removeCompletedTask = (taskId: string) => {
    tasks.value = tasks.value.filter(t => t.id !== taskId);
  };

  /**
   * 清除所有已结束（完成/失败/取消）的历史记录
   */
  const clearFinishedTasks = () => {
    tasks.value = tasks.value.filter(t => t.status === 'processing' || t.status === 'waiting');
  };

  /**
   * 最小化到右下角微型胶囊卡片
   */
  const minimize = () => {
    isModalVisible.value = false;
    isMinimized.value = true;
  };

  /**
   * 从右下角微型胶囊卡片重新展开为居中详细大弹窗
   */
  const expand = () => {
    isModalVisible.value = true;
    isMinimized.value = false;
  };

  /**
   * 关闭居中详情弹窗（行为等同于进入后台处理，缩小到右下角）
   */
  const closeModalToBackground = () => {
    if (hasActiveOrWaitingTasks.value) {
      minimize();
    } else {
      isModalVisible.value = false;
      isMinimized.value = false;
    }
  };

  return {
    tasks,
    activeTaskId,
    activeTask,
    waitingTasks,
    activeOrWaitingCount,
    hasActiveOrWaitingTasks,
    isModalVisible,
    isMinimized,
    enqueueTask,
    cancelTask,
    cancelCurrentTask,
    removeCompletedTask,
    clearFinishedTasks,
    minimize,
    expand,
    closeModalToBackground
  };
}
