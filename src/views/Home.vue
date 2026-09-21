<template>
  <div class="view home-view">
    <div class="header">
      <div class="metrics-grid">
        <div class="metric-card" :class="{ active: activeFilter === null }" @click="toggleFilter(null)">
          <div class="metric-label">全部任务</div>
          <div class="metric-value">{{ tasks.length }}</div>
        </div>
        <div class="metric-card" :class="{ active: activeFilter === 'processing' }"
          @click="toggleFilter('processing')">
          <div class="metric-label">
            <span class="status-dot processing"></span>进行中
          </div>
          <div class="metric-value">{{ inProgressCount }}</div>
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
          <v-checkbox :checked="isAllSelected" @change="toggleSelectAll" class="select-all-checkbox">
            {{ isAllSelected ? '反选' : '全选' }}
          </v-checkbox>
          <div class="batch-buttons">
            <span class="selected-count" v-show="selectedTasks.length > 0">已选择 {{ selectedTasks.length }} 项</span>
            <v-button variant="secondary" :disabled="selectedTasks.length === 0" @click="batchPause" title="暂停所选">
              <VIcon name="pause" :size="14" />
              暂停
            </v-button>
            <v-button variant="secondary" :disabled="selectedTasks.length === 0" @click="batchResume" title="继续所选">
              <VIcon name="play" :size="14" />
              继续
            </v-button>
            <v-button variant="secondary" :disabled="selectedCompressibleTasks.length === 0" @click="openBatchCompressDialog"
              title="压缩所选">
              <VIcon name="compress" :size="14" />
              压缩
            </v-button>
            <v-button variant="danger-soft" :disabled="selectedTasks.length === 0" @click="batchDelete"
              title="删除所选">
              <VIcon name="trash" :size="14" />
              删除
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
        <VIcon name="download" :size="48" />
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
              <VIcon v-if="isAudioTask(task)" name="music" :size="20" />
              <VIcon v-else-if="isVideoTask(task)" name="video-sniffer" :size="20" />
              <VIcon v-else name="file" :size="20" />
            </template>
          </div>

          <div class="task-content">
            <div class="task-header">
              <div class="task-name" :title="task.name" :class="{ 'file-removed': task.status === 'file_removed' }">{{ task.name }}</div>
              <div class="task-actions">
                <!-- 正在下载/压缩/转码/处理/等待：暂停 -->
                <VButton v-if="['downloading', 'compressing', 'converting', 'processing', 'resolving', 'waiting'].includes(task.status)" variant="icon-secondary" title="暂停"
                  @click.stop="pauseTask(task.id)">
                  <VIcon name="pause" :size="14" />
                </VButton>
                <!-- 暂停状态：继续下载（下载矢量箭头图标） -->
                <VButton v-else-if="task.status === 'paused'" variant="icon-secondary" title="继续下载"
                  @click.stop="resumeTask(task.id)">
                  <VIcon name="download" :size="14" />
                </VButton>
                <!-- 错误/文件已移除状态：重新下载/重试（环形刷新/重试图标） -->
                <VButton v-else-if="['error', 'file_removed', 'file_corrupted'].includes(task.status)" variant="icon-secondary" :title="task.status === 'file_removed' ? '重新下载' : '重试'"
                  @click.stop="resumeTask(task.id)">
                  <VIcon name="refresh" :size="14" />
                </VButton>
                <!-- 已完成状态：播放/预览（向右三角形播放图标） -->
                <v-button v-else-if="task.status === 'completed'" variant="icon-secondary" title="播放/预览" @click.stop="openTask(task)">
                  <VIcon name="play" :size="14" />
                </v-button>
                <VButton variant="icon-secondary" title="编辑任务" @click.stop="openEditTask(task)">
                  <VIcon name="edit" :size="14" />
                </VButton>
                <VButton variant="icon-secondary" title="打开所在目录" @click.stop="openDirectory(task)">
                  <VIcon name="folder" :size="14" />
                </VButton>
                <!-- 压缩视频按钮（仅对已完成的视频任务显示） -->
                <VButton
                  v-if="task.status === 'completed' && isVideoTask(task)"
                  variant="icon-secondary"
                  title="压缩视频"
                  @click.stop="openCompressDialog(task)"
                >
                  <VIcon name="compress" :size="14" />
                </VButton>
                <VButton variant="icon-danger" title="删除记录" @click.stop="confirmDeleteTask(task)">
                  <VIcon name="close" :size="14" />
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
              <span class="status-text" :class="task.status">{{ getStatusText(task.status, task) }}</span>
              <span v-if="task.status === 'error' && task.errorMsg" class="error-msg" :title="task.errorMsg"> - {{ task.errorMsg }}</span>
              <span class="meta-divider">•</span>
              <span class="size-text">{{ formatBytes(task.receivedBytes) }} {{ task.totalBytes > 0 ? '/ ' + formatBytes(task.totalBytes) : '' }}</span>
              <template v-if="task.totalSegments && task.totalSegments > 0">
                <span class="meta-divider">•</span>
                <span class="segments-text">{{ task.downloadedSegments || 0 }}/{{ task.totalSegments }} 分片</span>
              </template>
              <template v-if="['downloading', 'compressing', 'converting', 'processing', 'resolving'].includes(task.status)">
                <span class="meta-divider">•</span>
                <span v-if="task.status === 'resolving'">解析中</span>
                <span v-else-if="task.status === 'downloading'">{{ formatBytes(task.speed) }}/s</span>
                <span v-else-if="task.status === 'converting'">格式转换中</span>
                <span v-else-if="task.status === 'compressing'">{{ task.speedText ? `${task.speedText} 倍速` : '正在压缩' }}</span>
                <span v-else-if="task.status === 'processing'">处理中</span>
                <template v-if="task.status === 'compressing' && task.etaSeconds !== undefined">
                  <span class="meta-divider">•</span>
                  <span class="eta-text">{{ formatSecondsETA(task.etaSeconds) }}</span>
                </template>
                <template v-else-if="task.status === 'downloading' && task.totalBytes > 0">
                  <span class="meta-divider">•</span>
                  <span class="eta-text">{{ formatETA(task.totalBytes, task.receivedBytes, task.speed) }}</span>
                </template>
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
      @edit-complete="handleVideoEditComplete"
      @close="activeVideoPreviewUrl = null" :hideDownload="true" />

    <EditTaskDialog
      v-model:visible="editTaskDialogVisible"
      :task="editingTask"
    />
    <CompressVideoDialog
      v-model:visible="isCompressDialogVisible"
      :task="compressingTask"
      @confirm="handleConfirmCompress"
    />
    <BatchCompressVideoDialog
      v-model:visible="isBatchCompressDialogVisible"
      :tasks="selectedCompressibleTasks"
      @confirm="handleConfirmBatchCompress"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { useDownloads } from '../composables/useDownloads';
import { useMessage } from '../composables/useMessage';
import { useConfirm } from '../composables/useConfirm';
import VButton from '../components/base/VButton.vue';
import VIcon from '../components/base/VIcon.vue';
import VCheckbox from '../components/base/VCheckbox.vue';
const ImagePreviewDialog = defineAsyncComponent(() => import('../components/features/ImagePreviewDialog.vue'));
const AudioPlayerDialog = defineAsyncComponent(() => import('../components/features/AudioPlayerDialog.vue'));
const VideoPlayerDialog = defineAsyncComponent(() => import('../components/features/VideoPlayerDialog.vue'));
const EditTaskDialog = defineAsyncComponent(() => import('../components/features/EditTaskDialog.vue'));
const CompressVideoDialog = defineAsyncComponent(() => import('../components/features/CompressVideoDialog.vue'));
const BatchCompressVideoDialog = defineAsyncComponent(() => import('../components/features/BatchCompressVideoDialog.vue'));
import { useNotification } from '../composables/useNotification';
import { useSettings } from '../composables/useSettings';
import { useSaveMediaDialog } from '../composables/useSaveMediaDialog';
import { logger } from '../services/logger';
import { formatBytes } from '../utils/format';

const { tasks, pauseTask, resumeTask, deleteTask, loadTasks, isInitialized, updateTaskDb } = useDownloads();
const { showMessage } = useMessage();
const { showNotification } = useNotification();
const { confirm } = useConfirm();
const { state: settingsState } = useSettings();
const { openSaveMediaDialog } = useSaveMediaDialog();

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

const isBatchCompressDialogVisible = ref(false);

const selectedCompressibleTasks = computed(() => {
  return tasks.value.filter(t => selectedTasks.value.includes(t.id) && t.status === 'completed' && isVideoTask(t));
});

const openBatchCompressDialog = () => {
  if (selectedCompressibleTasks.value.length === 0) return;
  isBatchCompressDialogVisible.value = true;
};

const handleConfirmBatchCompress = async ({ tasks: targetTasks, targetBitrateKbps }: { tasks: any[], targetBitrateKbps: number }) => {
  if (targetTasks.length === 0 || !window.electronAPI) return;

  const count = targetTasks.length;
  selectedTasks.value = [];
  showMessage(`已将 ${count} 个视频加入压缩处理队列`, 'info');

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

const handleConfirmCompress = async ({ task, targetBitrateKbps }: { task: any, targetBitrateKbps: number }) => {
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
    case 'compressing': return 7;
    case 'converting': return 6;
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

  const count = selectedTasks.value.length;
  const { confirmed, checked } = await confirm({
    title: '批量删除',
    message: `确定要删除选中的 ${count} 个任务记录吗？`,
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
      showMessage(`已删除选中的 ${count} 个任务及对应文件`, 'success');
    } else {
      showMessage(`已删除选中的 ${count} 个任务记录`, 'success');
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

const getStatusText = (status: string, task?: any) => {
  if (status === 'waiting') {
    return task?.speedText === '等待压缩' ? '等待压缩' : '排队中';
  }
  switch (status) {
    case 'resolving': return '解析中';
    case 'downloading': return '下载中';
    case 'converting': return '格式转换中';
    case 'compressing': return '压缩中';
    case 'processing': return '处理中';
    case 'paused': return '已暂停';
    case 'completed': return '已完成';
    case 'error': return '下载失败';
    case 'file_removed': return '本地文件已移除';
    case 'file_corrupted': return '本地文件已损坏';
    default: return '未知状态';
  }
};

const getDirectory = (savePath: string) => {
  if (!savePath) return '';
  const lastIndex = Math.max(savePath.lastIndexOf('\\'), savePath.lastIndexOf('/'));
  return lastIndex === -1 ? savePath : savePath.substring(0, lastIndex);
};

const formatSecondsETA = (seconds: number) => {
  if (seconds <= 0) return '即将完成';
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return remSec > 0 ? `${minutes}分${remSec}秒` : `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}小时${remMin}分`;
};

const formatETA = (total: number, received: number, speed: number) => {
  if (speed === 0 && received > 0) return 'N/A';
  if (!speed || !total) return '计算中';
  const remaining = total - received;
  if (remaining <= 0) return '即将完成';

  const seconds = Math.floor(remaining / speed);
  return formatSecondsETA(seconds);
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
  background: var(--color-accent);

  &.downloading, &.compressing, &.converting, &.processing, &.resolving, &.waiting {
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
