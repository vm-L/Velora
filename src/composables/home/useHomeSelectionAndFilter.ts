import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import type { DownloadTask } from '@/db';
import { useMessage } from '@/composables/useMessage';
import { useConfirm } from '@/composables/useConfirm';
import { getStatusWeight, isVideoTask } from '@/composables/home/taskHelpers';

export interface UseHomeSelectionAndFilterOptions {
  tasks: Ref<DownloadTask[]>;
  pauseTask: (id: string) => void;
  resumeTask: (id: string) => void;
  deleteTask: (id: string, deleteFile?: boolean) => Promise<void>;
}

/**
 * 首页下载任务筛选、滑选多选、统计指标与批量操作逻辑
 */
export function useHomeSelectionAndFilter(options: UseHomeSelectionAndFilterOptions) {
  const { tasks, pauseTask, resumeTask, deleteTask } = options;
  const { showMessage } = useMessage();
  const { confirm } = useConfirm();

  const activeFilter = ref<string | null>(null);
  const selectedTasks = ref<string[]>([]);
  const isSelecting = ref(false);
  const selectMode = ref(true);

  const handleMouseUp = () => {
    isSelecting.value = false;
  };

  onMounted(() => {
    window.addEventListener('mouseup', handleMouseUp);
  });

  onUnmounted(() => {
    window.removeEventListener('mouseup', handleMouseUp);
  });

  const toggleFilter = (status: string | null) => {
    if (activeFilter.value === status) {
      activeFilter.value = null;
    } else {
      activeFilter.value = status;
    }
    selectedTasks.value = []; // Reset selection on filter change
  };

  const sortedTasks = computed(() => {
    let filtered = tasks.value;
    if (activeFilter.value) {
      filtered = filtered.filter(t => {
        if (activeFilter.value === 'processing' || activeFilter.value === 'downloading') {
          return ['resolving', 'downloading', 'converting', 'compressing', 'processing', 'waiting', 'paused'].includes(t.status);
        }
        if (activeFilter.value === 'error') {
          return ['error', 'file_removed', 'file_corrupted'].includes(t.status);
        }
        return t.status === activeFilter.value;
      });
    }
    return [...filtered].sort((a, b) => {
      const wa = getStatusWeight(a.status);
      const wb = getStatusWeight(b.status);
      if (wa !== wb) return wb - wa;
      return b.createdAt - a.createdAt;
    });
  });

  const isAllSelected = computed(() => {
    return sortedTasks.value.length > 0 && selectedTasks.value.length === sortedTasks.value.length;
  });

  const toggleSelectAll = () => {
    if (isAllSelected.value) {
      selectedTasks.value = [];
    } else {
      selectedTasks.value = sortedTasks.value.map(t => t.id);
    }
  };

  const startSelection = (id: string, event: MouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.task-checkbox')) return;

    isSelecting.value = true;
    const index = selectedTasks.value.indexOf(id);
    selectMode.value = index === -1;

    if (selectMode.value) {
      selectedTasks.value.push(id);
    } else {
      selectedTasks.value.splice(index, 1);
    }
  };

  const enterSelection = (id: string) => {
    if (!isSelecting.value) return;

    const index = selectedTasks.value.indexOf(id);
    if (selectMode.value && index === -1) {
      selectedTasks.value.push(id);
    } else if (!selectMode.value && index !== -1) {
      selectedTasks.value.splice(index, 1);
    }
  };

  const batchPause = () => {
    if (selectedTasks.value.length === 0) return;

    const eligibleTasks = tasks.value.filter(t => selectedTasks.value.includes(t.id) && ['downloading', 'compressing', 'converting', 'processing', 'waiting', 'resolving'].includes(t.status));

    eligibleTasks.forEach(t => pauseTask(t.id));

    if (eligibleTasks.length > 0) {
      showMessage(`已成功暂停 ${eligibleTasks.length} 个任务`, 'success');
    }
  };

  const batchResume = () => {
    if (selectedTasks.value.length === 0) return;

    const eligibleTasks = tasks.value.filter(t => selectedTasks.value.includes(t.id) && ['paused', 'error', 'file_removed', 'file_corrupted'].includes(t.status));

    eligibleTasks.forEach(t => resumeTask(t.id));

    if (eligibleTasks.length > 0) {
      showMessage(`已成功继续 ${eligibleTasks.length} 个任务`, 'success');
    }
  };

  const batchDelete = async () => {
    if (selectedTasks.value.length === 0) return;

    const { confirmed, checked } = await confirm({
      title: '批量删除',
      message: '确定要删除选中的任务记录吗？',
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
      checkboxLabel: '是否同时删除文件',
      defaultChecked: true
    });

    if (confirmed) {
      for (const id of selectedTasks.value) {
        await deleteTask(id, checked);
      }
      if (checked) {
        showMessage('已删除选中的任务及对应文件', 'success');
      } else {
        showMessage('已删除选中的任务记录', 'success');
      }
      selectedTasks.value = [];
    }
  };

  const inProgressCount = computed(() => tasks.value.filter(t => ['resolving', 'downloading', 'converting', 'compressing', 'processing', 'waiting', 'paused'].includes(t.status)).length);
  const completedCount = computed(() => tasks.value.filter(t => t.status === 'completed').length);
  const errorCount = computed(() => tasks.value.filter(t => ['error', 'file_removed', 'file_corrupted'].includes(t.status)).length);

  const globalSpeed = computed(() => {
    return tasks.value
      .filter(t => t.status === 'downloading')
      .reduce((sum, t) => sum + (t.speed || 0), 0);
  });

  const globalReceivedBytes = computed(() => tasks.value.reduce((sum, t) => sum + (t.receivedBytes || 0), 0));

  const selectedCompressibleTasks = computed(() => {
    return tasks.value.filter(t => selectedTasks.value.includes(t.id) && t.status === 'completed' && isVideoTask(t));
  });

  return {
    activeFilter,
    selectedTasks,
    toggleFilter,
    sortedTasks,
    isAllSelected,
    toggleSelectAll,
    startSelection,
    enterSelection,
    batchPause,
    batchResume,
    batchDelete,
    inProgressCount,
    completedCount,
    errorCount,
    globalSpeed,
    globalReceivedBytes,
    selectedCompressibleTasks
  };
}
