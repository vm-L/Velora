<template>
  <Teleport to="body">
    <div v-if="url" class="video-player-dialog"
      :style="{ top: position.y + 'px', left: position.x + 'px', width: size.w + 'px', height: size.h + 'px', zIndex }"
      @mousedown="bringToFront" ref="dialogRef"
      :class="{
        'is-fullscreen': (isFullscreen || isInAppFullscreen),
        'hide-cursor': hideCursor,
        'is-resizing': isResizing,
        'is-dragging': isDraggingWindow,
        'is-audio-mode': isAudioMode,
        'is-editing-mode': isEditingMode
      }"
      @mousemove="onMouseMove" @mouseleave="onMouseLeave">
    
    <!-- 顶部标题栏 -->
    <div class="dialog-header" :class="{ 'show-header': showControls || !(isFullscreen || isInAppFullscreen) || isAudioMode || isEditingMode }" @mousedown="startDrag" v-show="!(isFullscreen || isInAppFullscreen) || showControls || isAudioMode" @mouseenter="onControlsEnter" @mouseleave="onControlsLeave">
      <div class="header-title" :title="videoTitle">
        <VIcon :name="!isAudioMode ? 'play' : 'headphones'" :size="14" />
        <span class="title-text">{{ videoTitle }}</span>
        <span v-if="isAudioMode" class="badge-mode">听视频</span>
        <span v-else-if="isEditingMode" class="badge-mode edit-badge">编辑</span>
      </div>
      <div class="header-actions" @mousedown.stop>
        <VButton v-if="!hideDownload && !isAudioMode && !isEditingMode" variant="icon" class="action-btn" @click.stop="downloadVideo" @mousedown.stop title="下载">
          <VIcon name="download" :size="12" />
        </VButton>

        <VButton variant="icon" class="action-btn close-btn" @click.stop="close" @mousedown.stop title="关闭">
          <VIcon name="close" :size="12" />
        </VButton>
      </div>
    </div>

    <!-- 播放器主体 -->
    <div class="dialog-content"
      @mouseenter="onVideoAreaEnter"
      @mousemove="onVideoAreaMouseMove"
      @mouseleave="onVideoAreaLeave">
      <!-- 视频画面 (听视频模式下隐藏) -->
      <div v-show="!isAudioMode" class="video-container" @click="togglePlay" @dblclick="toggleFullscreen">
        <video ref="videoRef" autoplay referrerpolicy="no-referrer"
          @timeupdate="onTimeUpdate" 
          @loadedmetadata="onLoadedMetadata" 
          @ended="onVideoEnded" 
          @play="isPlaying = true" 
          @pause="isPlaying = false"
          @volumechange="onVolumeChange"
          @enterpictureinpicture="isPip = true"
          @leavepictureinpicture="isPip = false"
          @error="onVideoError"
        ></video>
      </div>
      
      <!-- 播放控制栏 (原生悬浮在视频上) -->
      <div class="player-controls-overlay" :class="{ 'show-controls': isAudioMode || (showControls && isMouseInVideoArea) || (isDragging && isMouseInVideoArea) }" @mouseenter="onControlsEnter" @mouseleave="onControlsLeave">
        
        <!-- 进度条容器 (含选区高亮色块) -->
        <div class="progress-container">
          <div v-if="isEditingMode && duration > 0" class="segments-highlight-track">
            <div v-for="(seg, idx) in editSegments" :key="seg.id"
              class="segment-bar"
              :class="{ 'active-segment': idx === activeSegmentIndex }"
              :style="{
                left: (Math.max(0, seg.start) / duration * 100) + '%',
                width: (Math.max(0.5, (seg.end - seg.start)) / duration * 100) + '%'
              }"
              @click.stop="selectSegment(idx)"
              :title="`片段 ${idx + 1}: ${formatTime(seg.start)} - ${formatTime(seg.end)}`"
            ></div>
          </div>
          <input type="range" class="progress-bar" min="0" :max="duration || 100" step="0.05" :value="currentTime" @input="onSeek" @change="onSeekEnd" @mousedown="isDragging = true" />
        </div>

        <div class="controls-row">
          <div class="controls-left">
            <VButton variant="icon" class="ctrl-btn play-btn" @click="togglePlay" :title="isPlaying ? '暂停 (空格)' : '播放 (空格)'">
              <VIcon :name="isPlaying ? 'pause' : 'play'" :size="18" />
            </VButton>
            <div class="volume-control" @mouseenter="showVolume = true" @mouseleave="showVolume = false">
              <VButton variant="icon" class="ctrl-btn volume-btn" @click="toggleMute" title="音量/静音 (快捷键: M)">
                <VIcon :name="(volume === 0 || isMuted) ? 'volume-mute' : (volume < 0.5 ? 'volume-low' : 'volume')" :size="16" />
              </VButton>
              <div class="volume-slider-container" :class="{ 'show': showVolume }">
                <input type="range" class="volume-slider" min="0" max="1" step="0.01" v-model="volume" @input="onVolumeSlider" />
              </div>
            </div>
            <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
          </div>

          <div class="controls-right">
            <select class="speed-select" v-model="playbackRate" @change="onSpeedChange" title="播放速度">
              <option :value="0.5">0.5x</option>
              <option :value="0.75">0.75x</option>
              <option :value="1">1.0x</option>
              <option :value="1.25">1.25x</option>
              <option :value="1.5">1.5x</option>
              <option :value="2.0">2.0x</option>
            </select>

            <!-- 听视频模式切换 -->
            <VButton variant="icon" class="ctrl-btn" :active="isAudioMode" @click="toggleAudioMode" :title="isAudioMode ? '看视频' : '听视频'">
              <VIcon :name="!isAudioMode ? 'headphones' : 'video'" :size="16" />
            </VButton>

            <!-- 本地视频编辑模式切换 -->
            <VButton v-if="isLocalVideo && !isAudioMode && !(isFullscreen || isInAppFullscreen)" variant="icon" class="ctrl-btn" :active="isEditingMode" @click="toggleEditingMode" :title="isEditingMode ? '退出编辑' : '编辑'">
              <VIcon name="scissors" :size="16" />
            </VButton>

            <VButton v-if="!isAudioMode && supportsPip" variant="icon" class="ctrl-btn" @click="togglePip" title="画中画">
              <VIcon name="pip" :size="16" />
            </VButton>

            <!-- In-App Fullscreen Button -->
            <VButton v-if="!isAudioMode" variant="icon" class="ctrl-btn" :active="isInAppFullscreen" @click="toggleInAppFullscreen" title="应用内全屏">
              <VIcon :name="isInAppFullscreen ? 'window-exit' : 'window'" :size="15" />
            </VButton>
            
            <!-- True Fullscreen Button -->
            <VButton v-if="!isAudioMode" variant="icon" class="ctrl-btn" :active="isFullscreen" @click="toggleFullscreen" title="系统级全屏 (快捷键: F)">
              <VIcon :name="isFullscreen ? 'fullscreen-exit' : 'fullscreen'" :size="16" />
            </VButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑模式底部独立拼接操作面板 (拼接在原窗口下方，完全不遮挡视频画面) -->
    <div v-if="isEditingMode && !isAudioMode" class="edit-dock-panel" @mousedown.stop>
      <!-- 第一行：打点控制与片段统计 -->
      <div class="dock-header-row">
        <div class="dock-actions-left">
          <VButton variant="secondary" class="dock-btn" @click="setCurrentAsStart" title="将当前播放时间设为当前片段起点 (快捷键: Z)">
            <VIcon name="segment-start" :size="12" />
            起点
          </VButton>
          <VButton variant="secondary" class="dock-btn" @click="setCurrentAsEnd" title="将当前播放时间设为当前片段终点 (快捷键: C)">
            <VIcon name="segment-end" :size="12" />
            终点
          </VButton>
          <VButton variant="primary" class="dock-btn" @click="addSegment" title="添加新的剪辑选段 (快捷键: X)">
            <VIcon name="plus" :size="12" />
            添加选段
          </VButton>
        </div>

        <div class="dock-actions-right">
          <span class="summary-text"><strong>{{ editSegments.length }}</strong> 片段 / <strong>{{ formatTime(totalEditedDuration) }}</strong></span>
          <VButton variant="icon" class="ctrl-btn" :active="true" @click="toggleEditingMode" title="退出编辑模式">
            <VIcon name="close" :size="13" />
          </VButton>
        </div>
      </div>

      <!-- 第二行：片段列表 (支持自适应换行与纵向滚动) -->
      <div ref="segmentsListRef" class="dock-segments-list">
        <div v-for="(seg, idx) in editSegments" :key="seg.id"
          class="dock-segment-item"
          :class="{ 'is-selected': idx === activeSegmentIndex }"
          @click="selectSegment(idx)"
        >
          <span class="seg-badge">#{{ idx + 1 }}</span>
          <div class="seg-time-text">
            <span>{{ formatTime(seg.start) }}</span>
            <span class="seg-arrow">→</span>
            <span>{{ formatTime(seg.end) }}</span>
            <span class="seg-dur">({{ formatTime(Math.max(0, seg.end - seg.start)) }})</span>
          </div>

          <div class="seg-item-actions" @click.stop>
            <VButton variant="icon" class="seg-icon-btn" :active="isSegmentPlaying && idx === activeSegmentIndex" @click="togglePreviewSegment(idx)" :title="isSegmentPlaying && idx === activeSegmentIndex ? '停止播放 (快捷键: S)' : '播放此片段 (快捷键: S)'">
              <VIcon :name="(isSegmentPlaying && idx === activeSegmentIndex) ? 'pause' : 'play'" :size="10" />
            </VButton>
            <VButton v-if="editSegments.length > 1" variant="icon-danger" class="seg-icon-btn" @click="removeSegment(idx)" title="删除此选段 (快捷键: W)">
              <VIcon name="close" :size="10" />
            </VButton>
          </div>
        </div>
      </div>

      <!-- 第三行：保存与另存为操作栏 -->
      <div class="dock-footer-row">
        <div class="footer-save-btns">
          <VButton variant="secondary" @click="handleSaveAs">另存为</VButton>
          <VButton variant="primary" @click="promptConfirmOverwrite">覆盖保存</VButton>
        </div>
      </div>
    </div>
    
    <!-- 覆盖保存确认弹窗 -->
    <div v-if="showOverwriteConfirm" class="editor-modal-mask" @mousedown.stop>
      <div class="editor-confirm-card">
        <div class="modal-header">
          <VIcon name="warning" :size="18" color="var(--color-accent)" />
          <h3>确认覆盖源视频文件？</h3>
        </div>
        <p class="confirm-desc">
          将使用当前标记的 <strong>{{ editSegments.length }}</strong> 个片段并替换源文件。
        </p>
        <div class="modal-actions">
          <VButton variant="secondary" @click="showOverwriteConfirm = false">取消</VButton>
          <VButton variant="primary" @click="executeOverwriteSave">确认保存覆盖</VButton>
        </div>
      </div>
    </div>

    <!-- 导出进度弹窗 -->
    <div v-if="exportState.isExporting" class="editor-modal-mask" @mousedown.stop>
      <div class="editor-progress-card">
        <div class="modal-header">
          <VIcon v-if="exportState.isFinished" name="success" :size="18" style="color: var(--color-success, #10b981);" />
          <VIcon v-else-if="exportState.error" name="error" :size="18" style="color: var(--color-error, #ef4444);" />
          <VIcon v-else name="loading" :size="18" class="spin-icon" />
          <h3>{{ exportState.isFinished ? '导出完毕' : (exportState.error ? '剪辑处理失败' : '正在处理视频剪辑') }}</h3>
        </div>
        
        <div class="export-progress-bar-track">
          <div
            class="export-progress-fill"
            :class="{ success: exportState.isFinished, error: !!exportState.error }"
            :style="{ width: exportState.percent + '%' }"
          ></div>
        </div>

        <div class="progress-info-row">
          <span class="status-msg">{{ exportState.text || (exportState.isFinished ? '导出完毕' : '正在处理中') }}</span>
          <span class="status-pct">{{ Math.round(exportState.percent) }}%</span>
        </div>

        <div v-if="exportState.error" class="error-msg">
          {{ exportState.error }}
        </div>

        <div class="modal-actions">
          <!-- 导出完成状态：展示“打开文件目录”与“确认”，点击确认关闭预览播放窗口 -->
          <template v-if="exportState.isFinished">
            <VButton
              v-if="exportState.outputPath"
              variant="secondary"
              @click="handleOpenExportDir"
            >
              打开文件目录
            </VButton>
            <VButton
              variant="primary"
              @click="handleConfirmComplete"
            >
              确认
            </VButton>
          </template>

          <!-- 导出异常状态：仅关闭当前提示弹窗，保留剪辑界面方便重试 -->
          <template v-else-if="exportState.error">
            <VButton variant="secondary" @click="handleCloseExportModal">关闭</VButton>
          </template>

          <!-- 导出进行中状态：支持取消，但在最终写入覆盖阶段禁用防止源文件损坏 -->
          <template v-else>
            <VButton
              variant="secondary"
              :disabled="exportState.percent >= 95"
              :title="exportState.percent >= 95 ? '正在完成文件写入，不可取消' : '取消当前剪辑任务'"
              @click="handleCancelExport"
            >
              取消处理
            </VButton>
          </template>
        </div>
      </div>
    </div>

    <div class="resize-handle" @mousedown.stop="startResize" v-if="!isFullscreen && !isInAppFullscreen && !isAudioMode"></div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import VButton from '../base/VButton.vue';
import VIcon from '../base/VIcon.vue';
import { logger } from '../../services/logger';

const props = defineProps<{
  url: string | null;
  hideDownload?: boolean;
  pageUrl?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'download', url: string): void;
  (e: 'edit-complete', payload: { mode: 'replace' | 'saveAs'; outputPath: string; sourcePath: string }): void;
}>();

const previewClientId = 'preview_video_' + Math.random().toString(36).slice(2);

const effectiveReferer = computed(() => {
  if (!props.pageUrl) return '';
  try {
    const u = new URL(props.pageUrl);
    return (u.origin && u.origin !== 'null') ? u.origin : props.pageUrl;
  } catch {
    return props.pageUrl;
  }
});

watch(() => [props.url, effectiveReferer.value], ([u, p]) => {
  if (p && window.electronAPI && window.electronAPI.createMediaClient) {
    window.electronAPI.createMediaClient({ clientId: previewClientId, referer: p });
  }
  if (u && p && window.electronAPI && window.electronAPI.setMediaReferer) {
    window.electronAPI.setMediaReferer(u, p);
  }
}, { immediate: true });

onUnmounted(() => {
  if (window.electronAPI && window.electronAPI.destroyMediaClient) {
    window.electronAPI.destroyMediaClient(previewClientId);
  }
});

const dialogRef = ref<HTMLElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);

const position = ref({ x: window.innerWidth / 2 - 320, y: window.innerHeight / 2 - 180 });
const size = ref({ w: 640, h: 360 });
const zIndex = ref(2000);
const isDraggingWindow = ref(false);
const isResizing = ref(false);
let startPos = { x: 0, y: 0 };
let startSize = { w: 0, h: 0 };
let startMouse = { x: 0, y: 0 };

const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const playbackRate = ref(1);
const volume = ref(1);
const isMuted = ref(false);
const isDragging = ref(false);
const isFullscreen = ref(false);
const isInAppFullscreen = ref(false);
const showControls = ref(false);
const isMouseInVideoArea = ref(false);
const showVolume = ref(false);
const isPip = ref(false);
const supportsPip = ref(false);

let hls: any = null;
let controlsTimeout: number | null = null;
const isHoveringControls = ref(false);

const hideCursor = ref(false);
let cursorTimeout: number | null = null;

// ==============================
// 模式状态机：听视频模式 & 编辑模式
// ==============================
const isAudioMode = ref(false);
const isEditingMode = ref(false);
const EDIT_DOCK_HEIGHT = 148;
const prevVideoLayout = ref<{ position: { x: number; y: number }; size: { w: number; h: number } } | null>(null);
const prevEditLayout = ref<{ position: { x: number; y: number }; size: { w: number; h: number } } | null>(null);

// 解析真实本地路径
const getLocalDiskPath = (rawUrl: string | null): string | null => {
  if (!rawUrl) return null;
  let clean = rawUrl.trim();
  if (clean.startsWith('velora://local/')) {
    return decodeURIComponent(clean.slice('velora://local/'.length));
  }
  if (clean.includes('/stream?path=')) {
    try {
      const u = new URL(clean);
      const p = u.searchParams.get('path');
      if (p) return p;
    } catch {}
  }
  if (/^[a-zA-Z]:[\\\/]/.test(clean) || (clean.startsWith('/') && !clean.startsWith('//'))) {
    return clean;
  }
  return null;
};

const localDiskPath = computed(() => getLocalDiskPath(props.url));
const isLocalVideo = computed(() => !!localDiskPath.value);

const videoTitle = computed(() => {
  const disk = localDiskPath.value;
  if (disk) {
    const parts = disk.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || '本地视频';
  }
  if (props.url) {
    try {
      const u = new URL(props.url);
      const pathname = u.pathname.split('/').pop();
      return pathname || '视频播放器';
    } catch {
      return '视频播放器';
    }
  }
  return '视频播放器';
});

// 切换听视频模式
const toggleAudioMode = () => {
  if (isEditingMode.value) {
    toggleEditingMode();
  }
  if (!isAudioMode.value) {
    prevVideoLayout.value = {
      position: { ...position.value },
      size: { ...size.value }
    };
    isAudioMode.value = true;
    size.value = { w: 480, h: 104 };
    if (position.value.x + 480 > window.innerWidth) {
      position.value.x = Math.max(20, window.innerWidth - 500);
    }
    if (position.value.y + 104 > window.innerHeight) {
      position.value.y = Math.max(20, window.innerHeight - 130);
    }
  } else {
    isAudioMode.value = false;
    if (prevVideoLayout.value) {
      size.value = { ...prevVideoLayout.value.size };
      position.value = { ...prevVideoLayout.value.position };
      prevVideoLayout.value = null;
    } else {
      size.value = { w: 640, h: 360 };
    }
  }
};

// ==============================
// 多区间视频编辑状态与方法
// ==============================
export interface EditSegment {
  id: string;
  start: number;
  end: number;
}

const editSegments = ref<EditSegment[]>([]);
const activeSegmentIndex = ref(0);
const isSegmentPlaying = ref(false);
const segmentsListRef = ref<HTMLElement | null>(null);

const scrollToActiveSegment = () => {
  nextTick(() => {
    if (!segmentsListRef.value) return;
    const activeEl = segmentsListRef.value.querySelector('.dock-segment-item.is-selected') as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  });
};

const totalEditedDuration = computed(() => {
  return editSegments.value.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0);
});

const toggleEditingMode = () => {
  if (isAudioMode.value) {
    toggleAudioMode();
  }
  if (!isEditingMode.value) {
    prevEditLayout.value = {
      position: { ...position.value },
      size: { ...size.value }
    };
    isEditingMode.value = true;
    const targetH = size.value.h + EDIT_DOCK_HEIGHT;
    size.value = { w: size.value.w, h: targetH };
    if (position.value.y + targetH > window.innerHeight - 20) {
      position.value.y = Math.max(20, window.innerHeight - targetH - 20);
    }
    if (editSegments.value.length === 0) {
      editSegments.value = [
        {
          id: 'seg_' + Date.now(),
          start: 0,
          end: duration.value > 0 ? duration.value : 10
        }
      ];
      activeSegmentIndex.value = 0;
    }
    scrollToActiveSegment();
  } else {
    isEditingMode.value = false;
    isSegmentPlaying.value = false;
    if (prevEditLayout.value) {
      size.value = { ...prevEditLayout.value.size };
      position.value = { ...prevEditLayout.value.position };
      prevEditLayout.value = null;
    }
  }
};

const selectSegment = (idx: number) => {
  if (idx >= 0 && idx < editSegments.value.length) {
    activeSegmentIndex.value = idx;
    const seg = editSegments.value[idx];
    if (videoRef.value) {
      videoRef.value.currentTime = seg.start;
      currentTime.value = seg.start;
    }
    scrollToActiveSegment();
  }
};

const setCurrentAsStart = () => {
  if (editSegments.value.length === 0) return;
  const seg = editSegments.value[activeSegmentIndex.value];
  if (!seg) return;
  const cur = Number((videoRef.value?.currentTime ?? currentTime.value).toFixed(2));
  const maxDur = duration.value > 0 ? duration.value : (videoRef.value?.duration || 0);

  if (cur >= seg.end) {
    seg.start = cur;
    const targetEnd = maxDur > 0 ? Math.min(maxDur, cur + 15) : cur + 15;
    seg.end = Number(Math.max(cur + 0.1, targetEnd).toFixed(2));
  } else {
    seg.start = cur;
  }
};

const setCurrentAsEnd = () => {
  if (editSegments.value.length === 0) return;
  const seg = editSegments.value[activeSegmentIndex.value];
  if (!seg) return;
  const cur = Number((videoRef.value?.currentTime ?? currentTime.value).toFixed(2));

  if (cur <= seg.start) {
    seg.end = cur;
    seg.start = Number(Math.max(0, cur - 15).toFixed(2));
  } else {
    seg.end = cur;
  }
};

const addSegment = () => {
  const cur = Number((videoRef.value?.currentTime ?? currentTime.value).toFixed(2));
  const maxDur = duration.value > 0 ? duration.value : (videoRef.value?.duration || 0);

  let newStart = cur;
  let newEnd = maxDur > 0 ? Math.min(maxDur, cur + 15) : cur + 15;
  if (maxDur > 0 && cur >= maxDur) {
    newStart = Math.max(0, maxDur - 15);
    newEnd = maxDur;
  }

  const newSeg: EditSegment = {
    id: 'seg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    start: Number(newStart.toFixed(2)),
    end: Number(newEnd.toFixed(2))
  };
  editSegments.value.push(newSeg);
  activeSegmentIndex.value = editSegments.value.length - 1;
  scrollToActiveSegment();
};

const removeSegment = (idx: number) => {
  if (editSegments.value.length <= 1) return;
  editSegments.value.splice(idx, 1);
  if (activeSegmentIndex.value >= editSegments.value.length) {
    activeSegmentIndex.value = editSegments.value.length - 1;
  }
  scrollToActiveSegment();
};

const togglePreviewSegment = (idx: number) => {
  if (isSegmentPlaying.value && activeSegmentIndex.value === idx) {
    isSegmentPlaying.value = false;
    videoRef.value?.pause();
    return;
  }
  selectSegment(idx);
  isSegmentPlaying.value = true;
  videoRef.value?.play().catch(() => {});
};

// ==============================
// 导出与保存处理
// ==============================
const showOverwriteConfirm = ref(false);
const exportState = ref<{
  isExporting: boolean;
  taskId: string;
  percent: number;
  text: string;
  error: string | null;
  isFinished: boolean;
  outputPath: string | null;
}>({
  isExporting: false,
  taskId: '',
  percent: 0,
  text: '',
  error: null,
  isFinished: false,
  outputPath: null
});

const promptConfirmOverwrite = () => {
  showOverwriteConfirm.value = true;
};

const executeOverwriteSave = () => {
  showOverwriteConfirm.value = false;
  startExport('replace');
};

const handleSaveAs = async () => {
  const disk = localDiskPath.value;
  if (!disk || !window.electronAPI?.showSaveDialog) return;

  const ext = disk.split('.').pop() || 'mp4';
  const baseName = disk.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^/.]+$/, '') || 'video';
  const defaultFileName = `${baseName}_edited.${ext}`;

  const res = await window.electronAPI.showSaveDialog({
    defaultPath: defaultFileName,
    title: '另存剪辑视频为',
    filters: [
      { name: '视频文件 (*.' + ext + ')', extensions: [ext] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });

  if (!res.canceled && res.filePath) {
    startExport('saveAs', res.filePath);
  }
};

const startExport = async (mode: 'replace' | 'saveAs', saveAsPath?: string) => {
  const disk = localDiskPath.value;
  if (!disk || !window.electronAPI?.editVideoSegments) return;

  const taskId = 'task_edit_' + Date.now();
  exportState.value = {
    isExporting: true,
    taskId,
    percent: 0,
    text: '正在初始化剪辑任务...',
    error: null,
    isFinished: false,
    outputPath: null
  };

  window.electronAPI.onVideoEditProgress(taskId, (data) => {
    exportState.value.percent = data.percent;
    exportState.value.text = data.text;
  });

  try {
    const result = await window.electronAPI.editVideoSegments({
      taskId,
      sourcePath: disk,
      segments: editSegments.value.map(s => ({ start: s.start, end: s.end })),
      outputPath: saveAsPath,
      mode
    });

    if (result.success) {
      exportState.value.percent = 100;
      exportState.value.text = mode === 'replace' ? '原视频已成功覆盖保存！' : '视频剪辑已成功导出！';
      exportState.value.isFinished = true;
      const finalOutputPath = result.outputPath || saveAsPath || disk;
      exportState.value.outputPath = finalOutputPath;
      emit('edit-complete', {
        mode,
        outputPath: finalOutputPath,
        sourcePath: disk
      });
    } else {
      exportState.value.error = result.error || '剪辑处理失败';
    }
  } catch (err: any) {
    exportState.value.error = err.message || '导出异常';
  } finally {
    window.electronAPI.offVideoEditProgress(taskId);
  }
};

const handleConfirmComplete = () => {
  exportState.value.isExporting = false;
  close();
};

const handleOpenExportDir = () => {
  if (exportState.value.outputPath && window.electronAPI?.showItemInFolder) {
    window.electronAPI.showItemInFolder(exportState.value.outputPath);
  }
};

const handleCloseExportModal = () => {
  exportState.value.isExporting = false;
  exportState.value.error = null;
};

const handleCancelExport = () => {
  if (exportState.value.percent >= 95) return;
  if (exportState.value.taskId && window.electronAPI?.cancelVideoEdit) {
    window.electronAPI.cancelVideoEdit(exportState.value.taskId);
  }
  exportState.value.isExporting = false;
  exportState.value.error = null;
};


// ==============================
// 鼠标与基础播放交互控制
// ==============================
const onVideoAreaEnter = () => {
  isMouseInVideoArea.value = true;
  showControls.value = true;
  resetControlsTimeout();
};

const onVideoAreaMouseMove = () => {
  isMouseInVideoArea.value = true;
  showControls.value = true;
  resetControlsTimeout();
  resetCursorTimeout();
};

const onVideoAreaLeave = () => {
  isMouseInVideoArea.value = false;
  isHoveringControls.value = false;
  if (controlsTimeout) clearTimeout(controlsTimeout);
  if (!isDragging.value) {
    showControls.value = false;
  }
};

const resetCursorTimeout = () => {
  if (cursorTimeout) clearTimeout(cursorTimeout);
  hideCursor.value = false;
  if (isPlaying.value && !isDragging.value && !isAudioMode.value) {
    cursorTimeout = window.setTimeout(() => {
      if (isPlaying.value && !isDragging.value) {
        hideCursor.value = true;
      }
    }, 1500);
  }
};

const onMouseMove = () => {
  if (isDraggingWindow.value || isResizing.value) {
    return;
  }
  resetCursorTimeout();
};

const onMouseLeave = () => {
  if (cursorTimeout) clearTimeout(cursorTimeout);
  hideCursor.value = false;
};

const onControlsEnter = () => {
  isHoveringControls.value = true;
  if (controlsTimeout) clearTimeout(controlsTimeout);
  showControls.value = true;
};

const onControlsLeave = () => {
  isHoveringControls.value = false;
  resetControlsTimeout();
};

const resetControlsTimeout = () => {
  if (controlsTimeout) clearTimeout(controlsTimeout);
  if (isHoveringControls.value || isDragging.value || isAudioMode.value) return;
  controlsTimeout = window.setTimeout(() => {
    if (isPlaying.value && !isHoveringControls.value && !isDragging.value) {
      showControls.value = false;
    }
  }, 2000);
};

const formatMediaSrc = (rawUrl: string): string => {
  if (!rawUrl) return '';
  let cleanPath = rawUrl.trim().replace(/\\/g, '/');
  
  if (/^(http:\/\/|https:\/\/|blob:|data:)/i.test(cleanPath)) {
    return cleanPath;
  }
  
  if (cleanPath.startsWith('velora://local/')) {
    cleanPath = decodeURIComponent(cleanPath.slice('velora://local/'.length));
  }
  
  const port = window.__SERVER_PORT__ || 0;
  return `http://127.0.0.1:${port}/stream?path=${encodeURIComponent(cleanPath)}`;
};

const loadVideo = async () => {
  if (!videoRef.value || !props.url) return;
  const video = videoRef.value;
  const playUrl = formatMediaSrc(props.url);

  if (hls) {
    hls.destroy();
    hls = null;
  }

  const checkM3U8Content = async (targetUrl: string): Promise<boolean> => {
    if (!targetUrl) return false;
    if (targetUrl.includes('127.0.0.1:') || targetUrl.includes('localhost:') || /^\/|^[a-zA-Z]:[\\/]/i.test(targetUrl)) {
      return false;
    }
    if (/\.(mp4|webm|mkv|avi|flv|mp3|wav|ogg|aac|png|jpe?g|webp)$/i.test(targetUrl.split('?')[0])) {
      return false;
    }

    try {
      const res = await fetch(targetUrl, {
        headers: {
          'X-Velora-Client-Id': previewClientId,
          'Range': 'bytes=0-512',
          ...(effectiveReferer.value ? { 'X-Velora-Referer': effectiveReferer.value } : {})
        }
      });
      if (!res.ok && res.status !== 206) return false;
      const reader = res.body?.getReader();
      if (!reader) return false;
      const { value } = await reader.read();
      reader.cancel();
      if (!value) return false;
      const text = new TextDecoder().decode(value);
      return text.includes('#EXTM3U');
    } catch {
      return false;
    }
  };

  const isM3U8 = playUrl.toLowerCase().includes('.m3u8') || await checkM3U8Content(playUrl);

  if (isM3U8) {
    try {
      const HlsModule = await import('hls.js');
      const Hls = HlsModule.default || HlsModule;
      if (Hls.isSupported()) {
        hls = new Hls({
          autoStartLoad: true,
          startPosition: -1,
          capLevelToPlayerSize: false,
          fetchSetup: (context: any, initParams: any) => {
            initParams.headers = {
              ...(initParams.headers || {}),
              'X-Velora-Client-Id': previewClientId,
              ...(effectiveReferer.value ? { 'X-Velora-Referer': effectiveReferer.value } : {})
            };
            return new Request(context.url, initParams);
          }
        });
        
        hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
          const msg = `HLS Error: ${data.type} - ${data.details} (fatal: ${data.fatal})`;
          logger.error('VideoPreview', msg);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls?.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls?.recoverMediaError();
                break;
              default:
                hls?.destroy();
                if (video) {
                  video.src = playUrl;
                  video.play().catch(() => {});
                }
                break;
            }
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, (_event: any, data: any) => {
          let maxLevel = -1;
          let maxBitrate = -1;
          if (data && data.levels) {
            for (let i = 0; i < data.levels.length; i++) {
              if (data.levels[i].bitrate > maxBitrate) {
                maxBitrate = data.levels[i].bitrate;
                maxLevel = i;
              }
            }
          }
          if (maxLevel !== -1 && hls) {
            hls.currentLevel = maxLevel;
            logger.info('VideoPreview', `Locked to highest HLS quality level ${maxLevel} (${maxBitrate} bps)`);
          }
          video.play().catch(() => {});
        });

        hls.loadSource(playUrl);
        hls.attachMedia(video);
      } else {
        video.src = playUrl;
        video.play().catch(() => {});
      }
    } catch (err: any) {
      video.src = playUrl;
      video.play().catch(() => {});
    }
  } else {
    video.src = playUrl;
    video.play().catch(() => {});
  }
};

function bringToFront() {
  zIndex.value = 2000 + Date.now() % 1000;
}

watch(() => props.url, (newUrl) => {
  if (newUrl) {
    bringToFront();
    isAudioMode.value = false;
    isEditingMode.value = false;
    editSegments.value = [];
    setTimeout(() => {
      loadVideo();
      if (document.pictureInPictureEnabled) {
        supportsPip.value = true;
      }
    }, 50);
  } else {
    if (videoRef.value) {
      videoRef.value.pause();
    }
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }
});

const startDrag = (e: MouseEvent) => {
  if (isFullscreen.value || isInAppFullscreen.value) return;
  if ((e.target as HTMLElement)?.closest('.header-actions, button, input, select')) return;
  isDraggingWindow.value = true;
  if (isPlaying.value && !isAudioMode.value && !isEditingMode.value) showControls.value = false;
  startPos = { x: position.value.x, y: position.value.y };
  startMouse = { x: e.clientX, y: e.clientY };
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDraggingWindow.value) return;
  const dx = e.clientX - startMouse.x;
  const dy = e.clientY - startMouse.y;
  position.value = {
    x: startPos.x + dx,
    y: startPos.y + dy
  };
};

const stopDrag = () => {
  isDraggingWindow.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

const videoRatio = ref<number | null>(null);

const startResize = (e: MouseEvent) => {
  if (isFullscreen.value || isInAppFullscreen.value || isAudioMode.value) return;
  e.preventDefault();
  e.stopPropagation();
  isResizing.value = true;
  if (isPlaying.value && !isEditingMode.value) showControls.value = false;
  startSize = { w: size.value.w, h: size.value.h };
  startMouse = { x: e.clientX, y: e.clientY };
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
};

const onResize = (e: MouseEvent) => {
  if (!isResizing.value) return;
  const dx = e.clientX - startMouse.x;
  const dy = e.clientY - startMouse.y;
  
  if (isEditingMode.value) {
    let ratio = videoRatio.value;
    if (!ratio || isNaN(ratio) || ratio <= 0) {
      if (videoRef.value && videoRef.value.videoWidth && videoRef.value.videoHeight) {
        ratio = videoRef.value.videoWidth / videoRef.value.videoHeight;
      }
    }
    if (!ratio || isNaN(ratio) || ratio <= 0) {
      ratio = startSize.w / Math.max(1, (startSize.h - EDIT_DOCK_HEIGHT));
    }
    if (!ratio || isNaN(ratio) || ratio <= 0) {
      ratio = 16 / 9;
    }

    const deltaW = (dx + dy * ratio) / 2;
    const newW = Math.max(460, Math.round(startSize.w + deltaW));
    const newVideoH = Math.max(200, Math.round(newW / ratio));
    const newH = newVideoH + EDIT_DOCK_HEIGHT;

    if (!isNaN(newW) && !isNaN(newH) && newW > 0 && newH > 0) {
      size.value = { w: newW, h: newH };
    }
    return;
  }

  let ratio = videoRatio.value;
  if (!ratio || isNaN(ratio) || ratio <= 0) {
    if (videoRef.value && videoRef.value.videoWidth && videoRef.value.videoHeight) {
      ratio = videoRef.value.videoWidth / videoRef.value.videoHeight;
    }
  }
  if (!ratio || isNaN(ratio) || ratio <= 0) {
    ratio = startSize.w / Math.max(1, startSize.h);
  }
  if (!ratio || isNaN(ratio) || ratio <= 0) {
    ratio = 16 / 9;
  }

  const deltaW = (dx + dy * ratio) / 2;
  const newW = Math.max(380, Math.round(startSize.w + deltaW));
  const newH = Math.max(220, Math.round(newW / ratio));

  if (!isNaN(newW) && !isNaN(newH) && newW > 0 && newH > 0) {
    size.value = { w: newW, h: newH };
  }
};

const stopResize = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
};

const togglePlay = () => {
  if (!videoRef.value) return;
  if (isPlaying.value) {
    videoRef.value.pause();
    isSegmentPlaying.value = false;
  } else {
    videoRef.value.play().catch(() => {});
  }
};

const onTimeUpdate = () => {
  if (!isDragging.value && videoRef.value) {
    currentTime.value = videoRef.value.currentTime;

    // 播放到达终点自动暂停
    if (isSegmentPlaying.value && isEditingMode.value) {
      const seg = editSegments.value[activeSegmentIndex.value];
      if (seg && currentTime.value >= seg.end) {
        videoRef.value.pause();
        isSegmentPlaying.value = false;
      }
    }
  }
};

const onVideoEnded = () => {
  isPlaying.value = false;
  isSegmentPlaying.value = false;
};

const onLoadedMetadata = () => {
  if (videoRef.value) {
    duration.value = videoRef.value.duration;

    // 如果未设置编辑选段，初始化为完整时长
    if (isEditingMode.value && editSegments.value.length === 1 && editSegments.value[0].end === 10) {
      editSegments.value[0].end = duration.value;
    }

    const vw = videoRef.value.videoWidth;
    const vh = videoRef.value.videoHeight;

    if (vw && vh && !isAudioMode.value && !isEditingMode.value) {
      const ratio = vw / vh;
      videoRatio.value = ratio;

      let targetW = 600;
      if (ratio < 1) {
        targetW = 440;
      } else {
        targetW = Math.min(680, Math.round(window.innerWidth * 0.55));
      }

      const finalW = Math.max(440, targetW);
      const finalH = Math.round(finalW / ratio);

      size.value = { w: finalW, h: finalH };
      position.value = {
        x: Math.max(0, Math.round((window.innerWidth - finalW) / 2)),
        y: Math.max(0, Math.round((window.innerHeight - finalH) / 2))
      };
    }
  }
};

const onSeek = (e: Event) => {
  isDragging.value = true;
  const val = Number((e.target as HTMLInputElement).value);
  currentTime.value = val;
  if (videoRef.value) {
    videoRef.value.currentTime = val;
  }
};

const onSeekEnd = (e: Event) => {
  isDragging.value = false;
  const val = Number((e.target as HTMLInputElement).value);
  if (videoRef.value && Math.abs(videoRef.value.currentTime - val) > 0.3) {
    videoRef.value.currentTime = val;
  }
  if (!isMouseInVideoArea.value) {
    showControls.value = false;
  } else {
    resetControlsTimeout();
  }
};

const onSpeedChange = () => {
  if (videoRef.value) {
    videoRef.value.playbackRate = playbackRate.value;
  }
};

const toggleMute = () => {
  if (!videoRef.value) return;
  videoRef.value.muted = !videoRef.value.muted;
  isMuted.value = videoRef.value.muted;
  if (!isMuted.value && volume.value === 0) {
    volume.value = 1;
    videoRef.value.volume = 1;
  }
};

const onVolumeChange = () => {
  if (videoRef.value) {
    volume.value = videoRef.value.volume;
    isMuted.value = videoRef.value.muted;
  }
};

const onVolumeSlider = (e: Event) => {
  if (videoRef.value) {
    const val = Number((e.target as HTMLInputElement).value);
    videoRef.value.volume = val;
    if (val > 0) {
      videoRef.value.muted = false;
      isMuted.value = false;
    }
  }
};

const onVideoError = (e: Event) => {
  const target = e.target as HTMLVideoElement;
  logger.error('VideoPreview', `Native Video Error: ${target.error?.message || 'unknown'}`);
};

const toggleInAppFullscreen = () => {
  if (!dialogRef.value || isAudioMode.value) return;
  isInAppFullscreen.value = !isInAppFullscreen.value;
};

const toggleFullscreen = async () => {
  if (!dialogRef.value || isAudioMode.value) return;
  try {
    if (!document.fullscreenElement) {
      await dialogRef.value.requestFullscreen();
      isFullscreen.value = true;
    } else {
      await document.exitFullscreen();
      isInAppFullscreen.value = false;
    }
  } catch (err: any) {
    logger.error('VideoPlayerDialog', `Fullscreen error: ${err?.message || err}`);
  }
};

const togglePip = async () => {
  if (!videoRef.value) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await videoRef.value.requestPictureInPicture();
    }
  } catch (error) {
    logger.error('VideoPreview', 'PiP failed: ' + error);
  }
};

const formatTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const close = () => {
  if (isFullscreen.value) document.exitFullscreen().catch(()=>{}); isInAppFullscreen.value = false;
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(()=>{});
  if (videoRef.value) {
    videoRef.value.pause();
  }
  if (hls) {
    hls.destroy();
    hls = null;
  }
  emit('close');
};

const downloadVideo = () => {
  if (props.url) {
    emit('download', props.url);
  }
};

const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
};

const seekBy = (delta: number) => {
  if (!videoRef.value) return;
  const maxDur = duration.value || videoRef.value.duration || 0;
  const newTime = Math.max(0, Math.min(maxDur, videoRef.value.currentTime + delta));
  videoRef.value.currentTime = newTime;
  currentTime.value = newTime;
  if (isMouseInVideoArea.value) {
    resetControlsTimeout();
  }
};

const changeVolume = (delta: number) => {
  if (!videoRef.value) return;
  const newVol = Math.max(0, Math.min(1, Number((volume.value + delta).toFixed(2))));
  videoRef.value.volume = newVol;
  volume.value = newVol;
  if (newVol > 0 && isMuted.value) {
    videoRef.value.muted = false;
    isMuted.value = false;
  }
  showVolume.value = true;
  resetControlsTimeout();
};

const seekToSegmentStart = () => {
  if (editSegments.value.length === 0) return;
  const seg = editSegments.value[activeSegmentIndex.value];
  if (seg && videoRef.value) {
    videoRef.value.currentTime = seg.start;
    currentTime.value = seg.start;
  }
};

const seekToSegmentEnd = () => {
  if (editSegments.value.length === 0) return;
  const seg = editSegments.value[activeSegmentIndex.value];
  if (seg && videoRef.value) {
    videoRef.value.currentTime = seg.end;
    currentTime.value = seg.end;
  }
};

const selectPrevSegment = () => {
  if (editSegments.value.length === 0) return;
  const targetIdx = Math.max(0, activeSegmentIndex.value - 1);
  selectSegment(targetIdx);
};

const selectNextSegment = () => {
  if (editSegments.value.length === 0) return;
  const targetIdx = Math.min(editSegments.value.length - 1, activeSegmentIndex.value + 1);
  selectSegment(targetIdx);
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable) return;

  if (e.key === 'Escape') {
    if (showOverwriteConfirm.value) {
      showOverwriteConfirm.value = false;
      return;
    }
    if (isFullscreen.value || isInAppFullscreen.value) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(()=>{});
      }
      isInAppFullscreen.value = false;
    }
  } else if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft') {
    e.preventDefault();
    if (e.shiftKey) {
      seekBy(-60);
    } else if (e.ctrlKey || e.metaKey) {
      seekBy(-10);
    } else {
      seekBy(-1);
    }
  } else if (e.key === 'ArrowRight' || e.code === 'ArrowRight') {
    e.preventDefault();
    if (e.shiftKey) {
      seekBy(60);
    } else if (e.ctrlKey || e.metaKey) {
      seekBy(10);
    } else {
      seekBy(1);
    }
  } else if (e.key === 'ArrowUp' || e.code === 'ArrowUp') {
    e.preventDefault();
    changeVolume(0.01);
  } else if (e.key === 'ArrowDown' || e.code === 'ArrowDown') {
    e.preventDefault();
    changeVolume(-0.01);
  } else if (e.key === 'f' || e.key === 'F' || e.code === 'KeyF') {
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !isAudioMode.value) {
      e.preventDefault();
      toggleFullscreen();
    }
  } else if (e.key === 'm' || e.key === 'M' || e.code === 'KeyM') {
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggleMute();
    }
  } else if (isEditingMode.value && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 'z') {
      e.preventDefault();
      setCurrentAsStart();
    } else if (key === 'c') {
      e.preventDefault();
      setCurrentAsEnd();
    } else if (key === 'x') {
      e.preventDefault();
      addSegment();
    } else if (key === 'a') {
      e.preventDefault();
      seekToSegmentStart();
    } else if (key === 'd') {
      e.preventDefault();
      seekToSegmentEnd();
    } else if (key === 's') {
      e.preventDefault();
      togglePreviewSegment(activeSegmentIndex.value);
    } else if (key === 'q') {
      e.preventDefault();
      selectPrevSegment();
    } else if (key === 'e') {
      e.preventDefault();
      selectNextSegment();
    } else if (key === 'w') {
      e.preventDefault();
      removeSegment(activeSegmentIndex.value);
    }
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  
  if (props.url) {
    bringToFront();
  }
  
  setTimeout(() => {
    loadVideo();
    if (document.pictureInPictureEnabled) {
      supportsPip.value = true;
    }
  }, 50);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  if (hls) {
    hls.destroy();
  }
});
</script>

<style scoped lang="less">
.video-player-dialog {
  position: fixed;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary);
  min-width: 440px;
  transition: box-shadow 0.2s ease;
  
  &.is-resizing, &.is-dragging {
    transition: none !important;
    user-select: none !important;
    * {
      transition: none !important;
      pointer-events: none !important;
    }
  }
  
  &.hide-cursor {
    cursor: none !important;
    * {
      cursor: none !important;
    }
  }
  
  &.is-fullscreen {
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    border-radius: 0;
    border: none;
    z-index: 9999 !important;
    background: var(--bg-app);
  }

  // 听视频模式收缩条样式
  &.is-audio-mode {
    min-width: 380px;
    height: auto !important;
    border-radius: 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);

    .dialog-header {
      position: static;
      opacity: 1;
      transform: none;
      pointer-events: auto;
      height: 34px;
      padding: 0 12px;
      background: var(--bg-surface-hover);
      border-bottom: 1px solid var(--border-color);
    }

    .dialog-content {
      height: auto;
      background: var(--bg-surface);
    }

    .player-controls-overlay {
      position: static;
      opacity: 1;
      transform: none;
      pointer-events: auto;
      background: var(--bg-surface);
      border-top: none;
      padding: 8px 12px 10px;
    }
  }

  // 编辑模式样式 (保持窗口尺寸完全不变)
  &.is-editing-mode {
    .dialog-header {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
  }
}

.dialog-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 38px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  background: var(--bg-surface-hover);
  border-bottom: 1px solid var(--border-color);
  cursor: grab;
  z-index: 100;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;

  &.show-header {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  &:active {
    cursor: grabbing;
  }
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  user-select: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 70%;

  .title-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge-mode {
    font-size: 11px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--color-accent);
    color: var(--bg-surface);
    flex-shrink: 0;

    &.edit-badge {
      background: var(--color-accent);
    }
  }
}

.header-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.action-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  &.active-mode-btn {
    background: var(--color-accent);
    color: var(--bg-surface);
  }
  
  &.close-btn:hover {
    background: var(--color-error);
    color: white;
  }
}

.dialog-content {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--bg-app);
  overflow: hidden;
}

.video-container {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  overflow: hidden;
  
  video {
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.player-controls-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px 16px 12px;
  background: var(--bg-surface-hover);
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 50;
  
  &.show-controls {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
}

.progress-container {
  display: flex;
  align-items: center;
  height: 14px;
  position: relative;
  cursor: pointer;
}

.segments-highlight-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 4px;
  height: 6px;
  pointer-events: none;
  z-index: 1;
  border-radius: 3px;
  overflow: hidden;
}

.segment-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(80, 80, 80, 0.35);
  border-radius: 2px;
  pointer-events: auto;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(80, 80, 80, 0.55);
  }

  &.active-segment {
    background: var(--color-accent);
    opacity: 0.85;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
  }
}

.progress-bar {
  flex: 1;
  -webkit-appearance: none;
  background: var(--border-color);
  height: 4px;
  border-radius: 2px;
  outline: none;
  transition: height 0.1s ease;
  position: relative;
  z-index: 2;
  
  &:hover {
    height: 6px;
  }

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-accent);
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: transform 0.1s ease;
  }
  
  &:hover::-webkit-slider-thumb {
    transform: scale(1.2);
    background: var(--color-accent-hover);
  }
}

.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.controls-left, .controls-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ctrl-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 4px;
  border-radius: 6px;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-surface-active);
  }

  &.active-ctrl-btn {
    color: var(--bg-surface);
    background: var(--color-accent);
  }
}

.play-btn {
  padding: 5px;
  color: var(--color-accent);
  
  &:hover {
    color: var(--color-accent-hover);
  }
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.volume-slider-container {
  width: 0;
  opacity: 0;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  
  &.show {
    width: 54px;
    opacity: 1;
  }
}

.volume-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-accent);
    cursor: pointer;
  }
}

.time-display {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  user-select: none;
  pointer-events: none;
}

.speed-select {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  option {
    background: var(--bg-surface);
    color: var(--text-primary);
  }
}

// ==============================
// 编辑模式底部独立拼接操作面板样式
// ==============================
.edit-dock-panel {
  flex-shrink: 0;
  height: 148px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  z-index: 60;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dock-header-row {
  padding: 6px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-surface-hover);
  border-bottom: 1px solid var(--border-color);
}

.dock-actions-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dock-actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-text {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;

  strong {
    color: var(--text-primary);
  }
}

.dock-segments-list {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: center;
  gap: 6px 8px;
  padding: 8px 12px;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--bg-app);
  min-height: 48px;

  &::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
}

.dock-segment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--text-secondary);
    background: var(--bg-surface-hover);
  }

  &.is-selected {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
    background: var(--bg-surface-hover);
  }
}

.seg-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 4px;
  background: var(--border-color);
  border-radius: 3px;
  color: var(--text-primary);
}

.seg-time-text {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;

  .seg-arrow {
    color: var(--text-secondary);
    font-size: 10px;
  }
  .seg-dur {
    color: var(--text-secondary);
    font-size: 10px;
  }
}

.seg-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.seg-icon-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: var(--text-primary);
    border-color: var(--text-secondary);
    background: var(--bg-surface-active);
  }

  &.is-previewing {
    background: var(--color-accent);
    color: var(--bg-surface);
    border-color: var(--color-accent);
  }

  &.danger:hover {
    background: var(--color-error);
    color: white;
    border-color: var(--color-error);
  }
}

.dock-footer-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-color);
}

.edit-btn {
  font-size: 11px;
  font-weight: 500;
  height: 24px;
  padding: 0 8px;
  border-radius: 5px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    background: var(--bg-surface-active);
    border-color: var(--text-secondary);
  }

  &.primary {
    background: var(--color-accent);
    color: var(--bg-surface);
    border-color: var(--color-accent);

    &:hover {
      background: var(--color-accent-hover);
    }
  }

  &.secondary {
    background: var(--bg-surface-hover);
    color: var(--text-secondary);

    &:hover {
      background: var(--bg-surface-active);
      color: var(--text-primary);
    }
  }
}

.footer-save-btns {
  display: flex;
  gap: 8px;
}

// ==============================
// 弹窗与进度遮罩样式
// ==============================
.editor-modal-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.editor-confirm-card, .editor-progress-card {
  width: 360px;
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-soft);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.confirm-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
}

.export-progress-bar-track {
  width: 100%;
  height: 6px;
  background: var(--border-color);
  border-radius: 3px;
  overflow: hidden;
}

.export-progress-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: 3px;
  transition: width 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);

  &.success {
    background: var(--color-success, #10b981);
  }

  &.error {
    background: var(--color-error, #ef4444);
  }
}

.progress-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);

  .status-pct {
    font-weight: 600;
    color: var(--color-accent);
    font-variant-numeric: tabular-nums;
  }
}

.error-msg {
  font-size: 12px;
  color: var(--color-error);
  padding: 6px 8px;
  background: rgba(255, 0, 0, 0.08);
  border-radius: 6px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.spin-icon {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 24px;
  height: 24px;
  cursor: nwse-resize;
  z-index: 150;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 4px;
  user-select: none;
  touch-action: none;

  &::after {
    content: '';
    width: 8px;
    height: 8px;
    border-right: 2px solid var(--text-tertiary);
    border-bottom: 2px solid var(--text-tertiary);
    border-radius: 0 0 2px 0;
    transition: border-color 0.2s ease;
  }

  &:hover::after {
    border-right-color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }
}
</style>
