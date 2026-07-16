<template>
  <div class="view home-view">
    <div class="header">
      <div class="metrics-grid">
        <div class="metric-card" :class="{ active: activeFilter === null }" @click="toggleFilter(null)">
          <div class="metric-label">全部任务</div>
          <div class="metric-value">{{ tasks.length }}</div>
        </div>
        <div class="metric-card" :class="{ active: activeFilter === 'downloading' }" @click="toggleFilter('downloading')">
          <div class="metric-label">
            <span class="status-dot downloading"></span>下载中
          </div>
          <div class="metric-value">{{ downloadingCount }}</div>
        </div>
        <div class="metric-card" :class="{ active: activeFilter === 'completed' }" @click="toggleFilter('completed')">
          <div class="metric-label">
            <span class="status-dot completed"></span>已完成
          </div>
          <div class="metric-value">{{ completedCount }}</div>
        </div>
        <div class="metric-card" :class="{ active: activeFilter === 'error' }" @click="toggleFilter('error')">
          <div class="metric-label">
            <span class="status-dot error"></span>异常
          </div>
          <div class="metric-value">{{ errorCount }}</div>
        </div>
      </div>
      
      <div class="operation-panel">
        <div class="batch-actions-bar" v-if="sortedTasks.length > 0">
          <label class="select-all-checkbox">
            <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
            <span>全选</span>
          </label>
          <div class="batch-buttons">
            <span class="selected-count" v-show="selectedTasks.length > 0">已选择 {{ selectedTasks.length }} 项</span>
            <button class="action-btn" :disabled="selectedTasks.length === 0" @click="batchPause" title="暂停所选">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              暂停
            </button>
            <button class="action-btn" :disabled="selectedTasks.length === 0" @click="batchResume" title="继续所选">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              继续
            </button>
            <button class="action-btn delete-btn" :disabled="selectedTasks.length === 0" @click="batchDelete" title="删除所选">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              删除
            </button>
          </div>
        </div>

        <div class="global-stats">
          <div class="stat-item">
            <span class="stat-label">全局速度</span>
            <span class="stat-value mono">{{ formatBytes(globalSpeed) }}/s</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-label">磁盘空间</span>
            <span class="stat-value mono">{{ formatBytes(globalReceivedBytes) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="downloads-container">
      <div v-if="sortedTasks.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <p>暂无下载任务</p>
      </div>

      <div v-else class="task-list">

        <div v-for="task in sortedTasks" :key="task.id" class="task-card" :class="{ 'is-selected': selectedTasks.includes(task.id) }" @mousedown="startSelection(task.id, $event)" @mouseenter="enterSelection(task.id)">
          <div class="task-checkbox" @click.stop>
            <input type="checkbox" :value="task.id" v-model="selectedTasks" />
          </div>
          <div class="task-icon" :class="`status-${task.status}`">
            <img v-if="isImageTask(task)" :src="task.url" class="task-thumbnail" referrerpolicy="no-referrer" />
            <template v-else>
              <svg v-if="task.status === 'completed'" width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <svg v-else-if="task.status === 'error'" width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <svg v-else-if="task.status === 'paused'" width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </template>
          </div>

          <div class="task-content">
            <div class="task-header">
              <div class="task-name" :title="task.name">{{ task.name }}</div>
              <div class="task-actions">
                <button v-if="task.status === 'downloading'" class="action-icon" title="暂停" @click.stop="pauseTask(task.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  </svg>
                </button>
                <button v-if="['paused', 'error'].includes(task.status)" class="action-icon" title="继续"
                  @click.stop="resumeTask(task.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </button>
                <button class="action-icon" title="打开所在目录" @click.stop="openDirectory(task)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
                <button class="action-icon" title="复制链接" @click.stop="copyUrl(task.url)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                <button class="action-icon delete" title="删除任务" @click.stop="confirmDelete(task)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>

            <div class="task-progress-wrap">
              <div class="progress-bar">
                <div class="progress-fill" :class="task.status" :style="{ width: task.progress + '%' }"></div>
              </div>
            </div>

            <div class="task-meta">
              <span class="status-text" :class="task.status">{{ getStatusText(task.status) }}</span>
              <span v-if="task.errorMsg" class="error-msg" :title="task.errorMsg"> - {{ task.errorMsg }}</span>
              <span class="meta-divider">•</span>
              <span class="size-text">{{ formatBytes(task.receivedBytes) }} / {{ formatBytes(task.totalBytes) }}</span>
              <template v-if="task.status === 'downloading' && task.speed > 0">
                <span class="meta-divider">•</span>
                <span class="speed-text">{{ formatBytes(task.speed) }}/s</span>
                <span class="meta-divider">•</span>
                <span class="eta-text">{{ formatETA(task.totalBytes, task.receivedBytes, task.speed) }}</span>
              </template>
              <template v-if="task.savePath">
                <span class="meta-divider">•</span>
                <span class="path-text">{{ getDirectory(task.savePath) }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useDownloads } from '../composables/useDownloads';
import { useMessage } from '../composables/useMessage';
import { useConfirm } from '../composables/useConfirm';

const { tasks, pauseTask, resumeTask, deleteTask, loadTasks, isInitialized, initListeners } = useDownloads();
const { showMessage } = useMessage();
const { confirm } = useConfirm();

const handleMouseUp = () => {
  isSelecting.value = false;
};

onMounted(async () => {
  window.addEventListener('mouseup', handleMouseUp);
  if (!isInitialized.value) {
    await loadTasks();
    initListeners();
  }
});

onUnmounted(() => {
  window.removeEventListener('mouseup', handleMouseUp);
});

const getStatusWeight = (status: string) => {
  switch (status) {
    case 'downloading': return 4;
    case 'paused': return 3;
    case 'error': return 2;
    case 'completed': return 1;
    default: return 0;
  }
};

const activeFilter = ref<string | null>(null);
const selectedTasks = ref<string[]>([]);

const toggleFilter = (status: string | null) => {
  if (activeFilter.value === status) {
    activeFilter.value = null;
  } else {
    activeFilter.value = status;
  }
  selectedTasks.value = []; // Reset selection on filter change
};

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

const isSelecting = ref(false);
const selectMode = ref(true);

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
  
  const eligibleTasks = tasks.value.filter(t => selectedTasks.value.includes(t.id) && t.status === 'downloading');
  const skippedCount = selectedTasks.value.length - eligibleTasks.length;
  
  eligibleTasks.forEach(t => pauseTask(t.id));
  
  if (skippedCount > 0) {
    showMessage(`成功暂停 ${eligibleTasks.length} 个任务，跳过 ${skippedCount} 个状态不符的任务`, eligibleTasks.length > 0 ? 'success' : 'info');
  } else {
    showMessage(`已成功暂停 ${eligibleTasks.length} 个任务`, 'success');
  }
};

const batchResume = () => {
  if (selectedTasks.value.length === 0) return;
  
  const eligibleTasks = tasks.value.filter(t => selectedTasks.value.includes(t.id) && ['paused', 'error'].includes(t.status));
  const skippedCount = selectedTasks.value.length - eligibleTasks.length;
  
  eligibleTasks.forEach(t => resumeTask(t.id));
  
  if (skippedCount > 0) {
    showMessage(`成功继续 ${eligibleTasks.length} 个任务，跳过 ${skippedCount} 个状态不符的任务`, eligibleTasks.length > 0 ? 'success' : 'info');
  } else {
    showMessage(`已成功继续 ${eligibleTasks.length} 个任务`, 'success');
  }
};

const batchDelete = async () => {
  if (selectedTasks.value.length === 0) return;
  
  const confirmed = await confirm({
    title: '批量删除',
    message: `确定要删除选中的 ${selectedTasks.value.length} 个任务及对应的本地文件吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });
  
  if (confirmed) {
    for (const id of selectedTasks.value) {
      deleteTask(id, true);
    }
    showMessage(`已删除 ${selectedTasks.value.length} 个任务和文件`, 'success');
    selectedTasks.value = [];
  }
};

const downloadingCount = computed(() => tasks.value.filter(t => t.status === 'downloading').length);
const completedCount = computed(() => tasks.value.filter(t => t.status === 'completed').length);
const errorCount = computed(() => tasks.value.filter(t => t.status === 'error').length);

const globalSpeed = computed(() => {
  return tasks.value
    .filter(t => t.status === 'downloading')
    .reduce((sum, t) => sum + (t.speed || 0), 0);
});

const globalReceivedBytes = computed(() => tasks.value.reduce((sum, t) => sum + (t.receivedBytes || 0), 0));
const globalTotalBytes = computed(() => tasks.value.reduce((sum, t) => sum + (t.totalBytes || 0), 0));

const isImageTask = (task: any) => {
  if (!task.name) return false;
  const ext = task.name.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext || '');
};

const sortedTasks = computed(() => {
  let filtered = tasks.value;
  if (activeFilter.value) {
    filtered = filtered.filter(t => t.status === activeFilter.value);
  }
  return [...filtered].sort((a, b) => {
    const wa = getStatusWeight(a.status);
    const wb = getStatusWeight(b.status);
    if (wa !== wb) return wb - wa;
    return b.createdAt - a.createdAt;
  });
});

const getStatusText = (status: string) => {
  switch (status) {
    case 'downloading': return '下载中';
    case 'paused': return '已暂停';
    case 'completed': return '已完成';
    case 'error': return '下载失败';
    default: return '未知状态';
  }
};

const formatBytes = (bytes: number) => {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getDirectory = (savePath: string) => {
  if (!savePath) return '';
  const lastIndex = Math.max(savePath.lastIndexOf('\\'), savePath.lastIndexOf('/'));
  return lastIndex === -1 ? savePath : savePath.substring(0, lastIndex);
};

const formatETA = (total: number, received: number, speed: number) => {
  if (!speed || !total) return '计算中...';
  const remaining = total - received;
  if (remaining <= 0) return '即将完成';

  const seconds = Math.floor(remaining / speed);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return `${minutes}分${remSec}秒`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}小时${remMin}分`;
};

const copyUrl = (url: string) => {
  navigator.clipboard.writeText(url);
  showMessage('下载链接已复制', 'success');
};

const openDirectory = async (task: any) => {
  if (task.savePath && window.electronAPI && window.electronAPI.showItemInFolder) {
    window.electronAPI.showItemInFolder(task.savePath);
  } else if (!task.savePath) {
    showMessage('任务路径未知', 'error');
  }
};

const confirmDelete = async (task: any) => {
  let fileExists = false;
  if (window.electronAPI) {
    fileExists = await window.electronAPI.fileExists(task.savePath);
  }

  if (fileExists) {
    const confirmed = await confirm({
      title: '删除任务',
      message: '确定删除任务及本地文件吗？',
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    });

    if (confirmed) {
      deleteTask(task.id, true);
      showMessage('已删除任务和文件', 'success');
    }
  } else {
    const confirmed = await confirm({
      title: '删除任务',
      message: `确定要删除任务 "${task.name}" 吗？`,
      confirmText: '删除',
      cancelText: '取消'
    });

    if (confirmed) {
      deleteTask(task.id, false);
      showMessage('已删除任务', 'success');
    }
  }
};
</script>

<style scoped lang="less">
.home-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: var(--view-padding);
  box-sizing: border-box;
  overflow: hidden;
}

.header {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
}

.operation-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.metric-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);

  &:hover {
    border-color: #cbd5e1;
    background: #f8fafc;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }

  &.active {
    border-color: #3b82f6;
    box-shadow: 0 0 0 1px #3b82f6;
    
    .metric-value {
      color: #0f172a;
    }
  }

  .metric-label {
    font-size: 13px;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
  }

  .metric-value {
    font-size: 28px;
    font-weight: 600;
    color: #0f172a;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    line-height: 1;
    letter-spacing: -0.5px;
  }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  
  &.downloading { background: #3b82f6; }
  &.completed { background: #10b981; }
  &.error { background: #ef4444; }
}

.global-stats {
  display: flex;
  align-items: center;
  gap: 24px;
  font-size: 13px;
  margin-left: auto;

  .stat-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stat-label {
    color: #64748b;
    font-weight: 500;
  }

  .stat-value {
    color: #334155;
    font-weight: 600;
    
    &.mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
  }

  .stat-divider {
    width: 1px;
    height: 14px;
    background: #cbd5e1;
  }
}

.downloads-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
  padding-right: 8px;
}

.downloads-container::-webkit-scrollbar {
  width: 8px;
}
.downloads-container::-webkit-scrollbar-track {
  background: transparent;
}
.downloads-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.downloads-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #94a3b8;

  svg {
    margin-bottom: 16px;
    opacity: 0.5;
  }

  p {
    font-size: 15px;
    margin: 0;
  }
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
  padding-bottom: var(--view-padding);
}

.task-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  border: 1px solid transparent;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  transition: all 0.2s;
  cursor: pointer;

  &:hover {
    border-color: #cbd5e1;
    transform: translateY(-1px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
  }

  &.is-selected {
    border-color: #3b82f6;
  }

  .task-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 14px;
    
    input {
      cursor: pointer;
    }
  }
}

.batch-actions-bar {
  display: flex;
  align-items: center;
  gap: 24px;

  .select-all-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: #475569;
    user-select: none;
    
    input {
      cursor: pointer;
    }
  }

  .batch-buttons {
    display: flex;
    align-items: center;
    gap: 12px;
    
    .selected-count {
      font-size: 13px;
      color: #64748b;
      margin-right: 8px;
    }
    
    .action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 13px;
      border-radius: 6px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #334155;
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover:not(:disabled) {
        background: #f1f5f9;
        border-color: #94a3b8;
      }
      
      &.delete-btn {
        color: #ef4444;
        border-color: #fca5a5;
        
        &:hover:not(:disabled) {
          background: #fef2f2;
          border-color: #f87171;
        }
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: #f8fafc;
      }
    }
  }
}

.task-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  .task-thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &.status-downloading {
    background: #eff6ff;
    color: #3b82f6;
  }

  &.status-paused {
    background: #f1f5f9;
    color: #64748b;
  }

  &.status-completed {
    background: #ecfdf5;
    color: #10b981;
  }

  &.status-error {
    background: #fef2f2;
    color: #ef4444;
  }
}

.task-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.task-name {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 16px;
}

.task-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.action-icon {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #64748b;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #e2e8f0;
    color: #3b82f6;
  }

  &.delete:hover {
    color: #ef4444;
    border-color: #fca5a5;
    background: #fef2f2;
  }
}

.task-progress-wrap {
  margin-bottom: 10px;
}

.progress-bar {
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;

  &.downloading {
    background: #3b82f6;
  }

  &.paused {
    background: #94a3b8;
  }

  &.completed {
    background: #10b981;
  }

  &.error {
    background: #ef4444;
  }
}

.task-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
}

.meta-divider {
  color: #cbd5e1;
}

.path-text {
  word-break: break-all;
}

.status-text {
  font-weight: 500;

  &.downloading {
    color: #3b82f6;
  }

  &.paused {
    color: #64748b;
  }

  &.completed {
    color: #10b981;
  }

  &.error {
    color: #ef4444;
  }
}

.speed-text,
.eta-text,
.size-text {
  font-variant-numeric: tabular-nums;
}

.error-msg {
  color: #ef4444;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
