<template>
  <div class="view home-view">
    <div class="header">
      <div class="metrics-grid">
        <div class="metric-card" :class="{ active: activeFilter === null }" @click="toggleFilter(null)">
          <div class="metric-label">全部任务</div>
          <div class="metric-value">{{ tasks.length }}</div>
        </div>
        <div class="metric-card" :class="{ active: activeFilter === 'downloading' }"
          @click="toggleFilter('downloading')">
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
        <div class="metric-card" :class="{ active: activeFilter === 'file_removed' }" @click="toggleFilter('file_removed')">
          <div class="metric-label">
            <span class="status-dot warning" style="background: #f59e0b;"></span>文件丢失
          </div>
          <div class="metric-value">{{ fileRemovedCount }}</div>
        </div>
      </div>

      <div class="operation-panel">
        <div class="batch-actions-bar" v-if="sortedTasks.length > 0">
          <v-checkbox :checked="isAllSelected" @change="toggleSelectAll" class="select-all-checkbox">
            {{ isAllSelected ? '反选' : '全选' }}
          </v-checkbox>
          <div class="batch-buttons">
            <span class="selected-count" v-show="selectedTasks.length > 0">已选择 {{ selectedTasks.length }} 项</span>
            <v-button variant="secondary" :disabled="selectedTasks.length === 0" @click="batchPause" title="暂停所选">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              暂停
            </v-button>
            <v-button variant="secondary" :disabled="selectedTasks.length === 0" @click="batchResume" title="继续所选">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              继续
            </v-button>
            <v-button variant="danger-soft" :disabled="selectedTasks.length === 0" @click="batchDelete"
              title="删除所选">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              删除
            </v-button>
            <v-button variant="secondary" @click="handleAuditDiskFiles" title="审计已下载文件是否存在于磁盘上">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              审计磁盘
            </v-button>
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
        <div v-for="task in sortedTasks" :key="task.id" class="task-card"
          :class="{ 'is-selected': selectedTasks.includes(task.id) }" @mousedown="startSelection(task.id, $event)"
          @mouseenter="enterSelection(task.id)" @dblclick="openTask(task)">
          <div class="task-checkbox" @click.stop>
            <v-checkbox :value="task.id" v-model="selectedTasks" />
          </div>
          <div class="task-icon" :class="`status-${task.status}`">
            <img v-if="isImageTask(task)" :src="task.url" class="task-thumbnail" referrerpolicy="no-referrer" />
            <template v-else>
              <svg v-if="isAudioTask(task)" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
              <svg v-else-if="isVideoTask(task)" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                <line x1="7" y1="2" x2="7" y2="22"></line>
                <line x1="17" y1="2" x2="17" y2="22"></line>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="2" y1="7" x2="7" y2="7"></line>
                <line x1="2" y1="17" x2="7" y2="17"></line>
                <line x1="17" y1="17" x2="22" y2="17"></line>
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
            </template>
          </div>

          <div class="task-content">
            <div class="task-header">
              <div class="task-name" :title="task.name" :class="{ 'file-removed': task.status === 'file_removed' }">{{ task.name }}</div>
              <div class="task-actions">
                <!-- 正在下载/处理/等待：暂停 -->
                <VButton v-if="['downloading', 'processing', 'resolving', 'waiting'].includes(task.status)" variant="icon-secondary" title="暂停"
                  @click.stop="pauseTask(task.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  </svg>
                </VButton>
                <!-- 暂停状态：继续下载（下载矢量箭头图标） -->
                <VButton v-else-if="task.status === 'paused'" variant="icon-secondary" title="继续下载"
                  @click.stop="resumeTask(task.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </VButton>
                <!-- 错误/文件已移除状态：重新下载/重试（环形刷新/重试图标） -->
                <VButton v-else-if="['error', 'file_removed', 'file_corrupted'].includes(task.status)" variant="icon-secondary" :title="task.status === 'file_removed' ? '重新下载' : '重试'"
                  @click.stop="resumeTask(task.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                </VButton>
                <!-- 已完成状态：播放/预览（向右三角形播放图标） -->
                <v-button v-else-if="task.status === 'completed'" variant="icon-secondary" title="播放/预览" @click.stop="openTask(task)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </v-button>
                <VButton variant="icon-secondary" title="编辑任务" @click.stop="openEditTask(task)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </VButton>
                <VButton variant="icon-secondary" title="打开所在目录" @click.stop="openDirectory(task)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </VButton>
                <VButton variant="icon-danger" title="删除记录与文件" @click.stop="confirmDeleteFileAndRecord(task)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </VButton>
                <VButton variant="icon-danger" title="删除记录" @click.stop="confirmDeleteRecordOnly(task)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </VButton>
              </div>
            </div>

            <div class="task-progress-wrap">
              <div class="progress-bar">
                <div class="progress-fill" :class="task.status" :style="{ width: task.progress + '%' }"></div>
              </div>
              <span class="progress-text-percent">{{ Math.round(task.progress || 0) }}%</span>
            </div>

            <div class="task-meta">
              <span class="status-text" :class="task.status">{{ getStatusText(task.status) }}</span>
              <span v-if="task.errorMsg && task.status !== 'completed'" class="error-msg" :title="task.errorMsg"> - {{ task.errorMsg }}</span>
              <span class="meta-divider">•</span>
              <span class="size-text">{{ formatBytes(task.receivedBytes) }} {{ task.totalBytes > 0 ? '/ ' + formatBytes(task.totalBytes) : '' }}</span>
              <template v-if="task.totalSegments && task.totalSegments > 0">
                <span class="meta-divider">•</span>
                <span class="segments-text">{{ task.downloadedSegments || 0 }}/{{ task.totalSegments }} 分片</span>
              </template>
              <template v-if="(task.status === 'downloading' || task.status === 'processing' || task.status === 'resolving')">
                <span class="meta-divider">•</span>
                <span v-if="task.status === 'resolving'">解析中...</span>
                <span v-else-if="task.status === 'downloading'">{{ formatBytes(task.speed) }}/s</span>
                <span v-else-if="task.status === 'processing'">正在处理...</span>
                <span v-if="task.totalBytes > 0" class="meta-divider">•</span>
                <span v-if="task.totalBytes > 0" class="eta-text">{{ formatETA(task.totalBytes, task.receivedBytes, task.speed) }}</span>
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
    
    <ImagePreviewDialog v-if="activeImagePreviewUrl" :id="'home-preview'" :url="activeImagePreviewUrl"
      :urls="[activeImagePreviewUrl]" :zIndex="9999" @close="activeImagePreviewUrl = null" :hideDownload="true" />
      
    <AudioPlayerDialog v-if="activeAudioPreviewUrl" :url="activeAudioPreviewUrl" 
      @close="activeAudioPreviewUrl = null" @download="onDownloadAudio" :hideDownload="true" />
    <VideoPlayerDialog v-if="activeVideoPreviewUrl" :url="activeVideoPreviewUrl"
      @close="activeVideoPreviewUrl = null" :hideDownload="true" />

    <SaveMediaDialog
      :visible="saveDialogVisible"
      @update:visible="saveDialogVisible = $event"
      :url="saveTargetUrl"
      :default-name="saveDefaultName"
      :default-dir="saveDefaultDir"
      :type="'audio'"
    />
    <EditTaskDialog
      v-model:visible="editTaskDialogVisible"
      :task="editingTask"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useDownloads } from '../composables/useDownloads';
import { useMessage } from '../composables/useMessage';
import { useConfirm } from '../composables/useConfirm';
import VButton from '../components/base/VButton.vue';
import VCheckbox from '../components/base/VCheckbox.vue';
import ImagePreviewDialog from '../components/features/ImagePreviewDialog.vue';
import AudioPlayerDialog from '../components/features/AudioPlayerDialog.vue';
import VideoPlayerDialog from '../components/features/VideoPlayerDialog.vue';
import SaveMediaDialog from '../components/features/SaveMediaDialog.vue';
import EditTaskDialog from '../components/features/EditTaskDialog.vue';
import { useSettings } from '../composables/useSettings';
import { logger } from '../services/logger';

const { tasks, pauseTask, resumeTask, deleteTask, loadTasks, isInitialized, updateTaskDb, auditDiskFiles } = useDownloads();
const { showMessage } = useMessage();
const { confirm } = useConfirm();
const { state: settingsState } = useSettings();

const fileRemovedCount = computed(() => tasks.value.filter(t => t.status === 'file_removed').length);

const handleAuditDiskFiles = async () => {
  const updated = await auditDiskFiles();
  if (updated > 0) {
    showMessage(`磁盘审计完成：已同步更新 ${updated} 项任务的文件状态`, 'success');
  } else {
    showMessage('磁盘审计完成：所有已完成任务的文件在磁盘上均完好存留！', 'success');
  }
};

const activeImagePreviewUrl = ref<string | null>(null);
const activeAudioPreviewUrl = ref<string | null>(null);
const activeVideoPreviewUrl = ref<string | null>(null);

const saveDialogVisible = ref(false);

const editTaskDialogVisible = ref(false);
const editingTask = ref<any>(null);

const openEditTask = (task: any) => {
  editingTask.value = task;
  editTaskDialogVisible.value = true;
};
const saveTargetUrl = ref('');
const saveDefaultName = ref('');
const saveDefaultDir = ref('');

const onDownloadAudio = (url: string) => {
  let name = '';
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    name = parts[parts.length - 1] || 'audio.mp3';
  } catch {
    name = 'audio.mp3';
  }
  
  saveTargetUrl.value = url;
  saveDefaultName.value = name;
  saveDefaultDir.value = settingsState.audioDirectory;
  saveDialogVisible.value = true;
};

const handleMouseUp = () => {
  isSelecting.value = false;
};

onMounted(async () => {
  window.addEventListener('mouseup', handleMouseUp);
  if (!isInitialized.value) {
    await loadTasks();
  }
});

onUnmounted(() => {
  window.removeEventListener('mouseup', handleMouseUp);
});

const getStatusWeight = (status: string) => {
  switch (status) {
    case 'processing': return 6;
    case 'downloading': return 5;
    case 'resolving': return 4;
    case 'waiting': return 4;
    case 'paused': return 3;
    case 'error': 
    case 'file_removed':
    case 'file_corrupted':
      return 2;
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

  const eligibleTasks = tasks.value.filter(t => selectedTasks.value.includes(t.id) && (t.status === 'downloading' || t.status === 'processing' || t.status === 'waiting' || t.status === 'resolving'));

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

const downloadingCount = computed(() => tasks.value.filter(t => t.status === 'downloading' || t.status === 'processing' || t.status === 'waiting' || t.status === 'resolving').length);
const completedCount = computed(() => tasks.value.filter(t => t.status === 'completed').length);
const errorCount = computed(() => tasks.value.filter(t => t.status === 'error').length);

const globalSpeed = computed(() => {
  return tasks.value
    .filter(t => t.status === 'downloading')
    .reduce((sum, t) => sum + (t.speed || 0), 0);
});

const globalReceivedBytes = computed(() => tasks.value.reduce((sum, t) => sum + (t.receivedBytes || 0), 0));
// const globalTotalBytes = computed(() => tasks.value.reduce((sum, t) => sum + (t.totalBytes || 0), 0));

const isImageTask = (task: any) => {
  const path = task.savePath || task.name || '';
  const ext = path.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext || '');
};

const isAudioTask = (task: any) => {
  const path = task.savePath || task.name || '';
  const ext = path.split('.').pop()?.toLowerCase();
  return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext || '');
};

const isVideoTask = (task: any) => {
  const path = task.savePath || task.name || '';
  const ext = path.split('.').pop()?.toLowerCase();
  return ['mp4', 'webm', 'mkv', 'avi', 'mov', 'm3u8', 'ts'].includes(ext || '');
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

const sortedTasks = computed(() => {
  let filtered = tasks.value;
  if (activeFilter.value) {
    filtered = filtered.filter(t => {
      if (activeFilter.value === 'downloading') {
        return t.status === 'downloading' || t.status === 'processing' || t.status === 'waiting' || t.status === 'resolving';
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

const getStatusText = (status: string) => {
  switch (status) {
    case 'resolving': return '解析中';
    case 'downloading': return '下载中';
    case 'processing': return '处理中';
    case 'waiting': return '排队中';
    case 'paused': return '已暂停';
    case 'completed': return '已完成';
    case 'error': return '下载失败';
    case 'file_removed': return '本地文件已移除';
    case 'file_corrupted': return '本地文件已损坏';
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
  if (speed === 0 && received > 0) return 'N/A';
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



const openDirectory = async (task: any) => {
  if (!task.savePath) {
    showMessage('任务路径未知', 'error');
    return;
  }
  
  const normalizedPath = task.savePath.replace(/\\/g, '/');
  const dir = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));

  // 正在下载、处理、等待或暂停的任务，最终文件尚未落地，直接打开所在目录即可
  const isUnfinished = ['downloading', 'processing', 'resolving', 'waiting', 'paused'].includes(task.status);

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

const confirmDeleteFileAndRecord = async (task: any) => {
  let fileExists = false;
  if (window.electronAPI) {
    fileExists = await window.electronAPI.fileExists(task.savePath);
  }

  const isUnfinished = task.status !== 'completed';
  const message = isUnfinished
    ? (fileExists ? `确定要取消并删除未完成的任务 "${task.name}" 及其已下载的临时文件吗？` : `确定要删除任务记录 "${task.name}" 吗？`)
    : (fileExists ? `确定删除任务记录 "${task.name}" 及本地文件吗？` : `确定要删除任务记录 "${task.name}" 吗？（文件已移除）`);

  const confirmed = await confirm({
    title: isUnfinished ? '删除未完成任务' : '删除记录与文件',
    message,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });

  if (confirmed) {
    await deleteTask(task.id, fileExists || isUnfinished);
    showMessage(fileExists || isUnfinished ? (isUnfinished ? '已删除任务与已下载的临时文件' : '已删除任务记录与文件') : '已删除任务记录', 'success');
  }
};

const confirmDeleteRecordOnly = async (task: any) => {
  const isUnfinished = task.status !== 'completed';
  const confirmed = await confirm({
    title: '删除记录',
    message: isUnfinished
      ? `确定删除未完成的任务记录 "${task.name}" 吗？（已下载的临时文件将被同步清除）`
      : `确定仅删除任务记录 "${task.name}" 吗？（本地文件将保留）`,
    confirmText: '删除记录',
    cancelText: '取消'
  });

  if (confirmed) {
    await deleteTask(task.id, isUnfinished);
    showMessage(isUnfinished ? '已删除未完成任务与临时文件' : '已删除任务记录', 'success');
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
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.metric-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);

  &:hover {
    border-color: var(--border-color);
    background: var(--bg-surface-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  &.active {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);

    .metric-value {
      color: var(--text-primary);
    }
  }

  .metric-label {
    font-size: 13px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
  }

  .metric-value {
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    line-height: 1;
    letter-spacing: -0.5px;
  }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;

  &.downloading, &.processing, &.resolving {
    background: var(--color-accent);
  }

  &.completed {
    background: #10b981;
  }

  &.error {
    background: #ef4444;
  }
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
    color: var(--text-secondary);
    font-weight: 500;
  }

  .stat-value {
    color: var(--text-primary);
    font-weight: 600;

    &.mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
  }

  .stat-divider {
    width: 1px;
    height: 14px;
    background: var(--border-color);
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
  background: var(--border-color);
  border-radius: 4px;
}

.downloads-container::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-secondary);

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
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid transparent;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;
  cursor: pointer;

  &:hover {
    border-color: var(--border-color);
    transform: translateY(-1px);
    box-shadow: var(--shadow-soft);
  }

  &.is-selected {
    border-color: var(--color-accent);
  }

  .task-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 14px;

    input {
      cursor: pointer;
      margin: 0;
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
    color: var(--text-primary);
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
      color: var(--text-secondary);
      margin-right: 8px;
    }

    /* Buttons styled by VButton component */
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

  &.status-downloading, &.status-processing, &.status-resolving {
    background: var(--bg-surface-active);
    color: var(--color-accent);
  }

  &.status-paused {
    background: var(--border-light);
    color: var(--text-secondary);
  }

  &.status-completed {
    background: #ecfdf5;
    color: #10b981;
  }

  &.status-error,
  &.status-file_removed,
  &.status-file_corrupted {
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
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 16px;
  display: flex;
  align-items: center;

  &.file-removed span {
    text-decoration: line-through;
    opacity: 0.6;
  }
}

.edit-name-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  opacity: 0.4;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    opacity: 1;
    color: var(--color-accent);
    background: var(--bg-surface-active);
  }
}

.task-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* Action icons styled by VButton component */

.task-progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--border-color);
  border-radius: 3px;
  overflow: hidden;
}

.progress-text-percent {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;

  &.downloading, &.processing, &.resolving, &.waiting {
    background: var(--color-accent);
  }

  &.paused {
    background: var(--text-secondary);
  }

  &.completed {
    background: #10b981;
  }

  &.error,
  &.file_removed,
  &.file_corrupted {
    background: #ef4444;
  }
}

.task-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.meta-divider {
  color: var(--border-color);
}

.path-text {
  word-break: break-all;
}

.status-text {
  font-weight: 500;

  &.downloading, &.processing, &.resolving {
    color: var(--color-accent);
  }

  &.waiting {
    color: #f59e0b;
  }

  &.paused {
    color: var(--text-secondary);
  }

  &.completed {
    color: #10b981;
  }

  &.error,
  &.file_removed,
  &.file_corrupted {
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
