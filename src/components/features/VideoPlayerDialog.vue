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
    <VideoEditDockPanel
      v-if="isEditingMode && !isAudioMode"
      :segments="editSegments"
      :active-segment-index="activeSegmentIndex"
      :is-segment-playing="isSegmentPlaying"
      :total-edited-duration="totalEditedDuration"
      @set-start="setCurrentAsStart"
      @set-end="setCurrentAsEnd"
      @add-segment="addSegment"
      @exit-edit="toggleEditingMode"
      @select-segment="selectSegment"
      @toggle-preview-segment="togglePreviewSegment"
      @remove-segment="removeSegment"
      @save-as="handleSaveAs"
      @prompt-overwrite="promptConfirmOverwrite"
    />
    
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

    <div class="resize-handle" @mousedown.stop="startResize" v-if="!isFullscreen && !isInAppFullscreen && !isAudioMode"></div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VideoEditDockPanel from '@/components/features/VideoEditDockPanel.vue';
import { formatPlayerTime, type EditSegment } from '@/composables/videoPlayer/types';
import { usePlayerWindowLayout } from '@/composables/videoPlayer/usePlayerWindowLayout';
import { useVideoPlayback } from '@/composables/videoPlayer/useVideoPlayback';
import { useVideoEditSegments } from '@/composables/videoPlayer/useVideoEditSegments';
import { usePlayerShortcuts } from '@/composables/videoPlayer/usePlayerShortcuts';

export type { EditSegment };

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

const dialogRef = ref<HTMLElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const formatTime = formatPlayerTime;

// 严格按 A -> B -> C -> D 无环顺序装配 4 个 Composable
let getPlaybackStateImpl = () => ({ isPlaying: false, isSeeking: false, videoRatio: null as number | null });
let onEditModeEnterImpl = () => {};
let onEditModeExitImpl = () => {};
let onTimeUpdateSegmentCheckImpl = (_curTime: number) => {};
let onMetadataDurationReadyImpl = (_dur: number) => {};
let onPlaybackStoppedImpl = () => {};

const {
  position,
  size,
  zIndex,
  isDraggingWindow,
  isResizing,
  isFullscreen,
  isInAppFullscreen,
  isAudioMode,
  isEditingMode,
  showControls,
  isMouseInVideoArea,
  hideCursor,
  bringToFront,
  startDrag,
  startResize,
  applyMetadataWindowSize,
  toggleAudioMode,
  toggleEditingMode,
  toggleInAppFullscreen,
  toggleFullscreen,
  handleFullscreenChange,
  onVideoAreaEnter,
  onVideoAreaMouseMove,
  onVideoAreaLeave,
  onMouseMove,
  onMouseLeave,
  onControlsEnter,
  onControlsLeave,
  resetControlsTimeout,
  cleanupWindowLayout
} = usePlayerWindowLayout({
  dialogRef,
  videoRef,
  getPlaybackState: () => getPlaybackStateImpl(),
  onEditModeEnter: () => onEditModeEnterImpl(),
  onEditModeExit: () => onEditModeExitImpl()
});

const {
  playerSessionKey,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  volume,
  isMuted,
  isDragging,
  isPip,
  supportsPip,
  showVolume,
  videoRatio,
  localDiskPath,
  isLocalVideo,
  videoTitle,
  releaseVideoMedia,
  loadVideo,
  togglePlay,
  onTimeUpdate,
  onVideoEnded,
  onLoadedMetadata,
  onSeek,
  onSeekEnd,
  onSpeedChange,
  toggleMute,
  onVolumeChange,
  onVolumeSlider,
  onVideoError,
  togglePip,
  seekBy,
  changeVolume,
  cleanupMediaClient
} = useVideoPlayback({
  url: () => props.url,
  pageUrl: () => props.pageUrl,
  videoRef,
  isAudioMode,
  isEditingMode,
  isMouseInVideoArea,
  showControls,
  resetControlsTimeout,
  applyMetadataWindowSize,
  onTimeUpdateSegmentCheck: (t) => onTimeUpdateSegmentCheckImpl(t),
  onMetadataDurationReady: (d) => onMetadataDurationReadyImpl(d),
  onPlaybackStopped: () => onPlaybackStoppedImpl()
});

getPlaybackStateImpl = () => ({
  isPlaying: isPlaying.value,
  isSeeking: isDragging.value,
  videoRatio: videoRatio.value
});

const {
  editSegments,
  activeSegmentIndex,
  isSegmentPlaying,
  totalEditedDuration,
  showOverwriteConfirm,
  initSegmentsIfEmpty,
  syncInitialSegmentDuration,
  resetEditSegments,
  stopSegmentPlaying,
  checkSegmentPlaybackEnd,
  selectSegment,
  setCurrentAsStart,
  setCurrentAsEnd,
  addSegment,
  removeSegment,
  togglePreviewSegment,
  seekToSegmentStart,
  seekToSegmentEnd,
  selectPrevSegment,
  selectNextSegment,
  promptConfirmOverwrite,
  executeOverwriteSave,
  handleSaveAs
} = useVideoEditSegments({
  videoRef,
  currentTime,
  duration,
  localDiskPath,
  videoTitle,
  releaseVideoMedia
});

onEditModeEnterImpl = initSegmentsIfEmpty;
onEditModeExitImpl = stopSegmentPlaying;
onTimeUpdateSegmentCheckImpl = (curTime) => {
  if (isEditingMode.value) {
    checkSegmentPlaybackEnd(curTime);
  }
};
onMetadataDurationReadyImpl = (dur) => {
  if (isEditingMode.value) {
    syncInitialSegmentDuration(dur);
  }
};
onPlaybackStoppedImpl = stopSegmentPlaying;

const { handleKeydown } = usePlayerShortcuts({
  dialogRef,
  zIndex,
  isAudioMode,
  isEditingMode,
  isFullscreen,
  isInAppFullscreen,
  showOverwriteConfirm,
  activeSegmentIndex,
  togglePlay,
  seekBy,
  changeVolume,
  toggleFullscreen,
  toggleMute,
  setCurrentAsStart,
  setCurrentAsEnd,
  addSegment,
  seekToSegmentStart,
  seekToSegmentEnd,
  togglePreviewSegment,
  selectPrevSegment,
  selectNextSegment,
  removeSegment
});

watch(() => props.url, (newUrl) => {
  if (newUrl) {
    playerSessionKey.value = Date.now();
    bringToFront();
    isAudioMode.value = false;
    isEditingMode.value = false;
    resetEditSegments();
    setTimeout(() => {
      loadVideo();
      if (document.pictureInPictureEnabled) {
        supportsPip.value = true;
      }
    }, 50);
  } else {
    releaseVideoMedia();
  }
});

const close = () => {
  if (isFullscreen.value) document.exitFullscreen().catch(() => {});
  isInAppFullscreen.value = false;
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  releaseVideoMedia();
  emit('close');
};

const downloadVideo = () => {
  if (props.url) {
    emit('download', props.url);
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
  cleanupWindowLayout();
  cleanupMediaClient();
  releaseVideoMedia();
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
// 弹窗与确认遮罩样式
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

.editor-confirm-card {
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

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
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
