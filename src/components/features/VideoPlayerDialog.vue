<template>
  <div v-if="url" class="video-player-dialog"
    :style="{ top: position.y + 'px', left: position.x + 'px', width: size.w + 'px', height: size.h + 'px', zIndex }"
    @mousedown="bringToFront" ref="dialogRef" :class="{ 'is-fullscreen': isFullscreen }">
    
    <div class="dialog-header" @mousedown="startDrag" v-show="!isFullscreen || showControls">
      <div class="header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        视频播放器
      </div>
      <div class="header-actions">
        <button v-if="!hideDownload" class="action-btn" @click.stop="downloadVideo" title="下载">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        <button class="action-btn close-btn" @click.stop="close" title="关闭">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <div class="dialog-content" @mousemove="onMouseMove" @mouseleave="onMouseLeave">
      <div class="video-container" @click="togglePlay" @dblclick="toggleFullscreen">
        <video ref="videoRef" autoplay referrerpolicy="no-referrer"
          @timeupdate="onTimeUpdate" 
          @loadedmetadata="onLoadedMetadata" 
          @ended="isPlaying = false" 
          @play="isPlaying = true" 
          @pause="isPlaying = false"
          @volumechange="onVolumeChange"
          @enterpictureinpicture="isPip = true"
          @leavepictureinpicture="isPip = false"
          @error="onVideoError"
        ></video>
      </div>
      
      <div class="player-controls-overlay" :class="{ 'show-controls': showControls || !isPlaying }">
        <div class="progress-container">
          <input type="range" class="progress-bar" min="0" :max="duration || 100" step="0.1" v-model="currentTime" @input="onSeek" @mousedown="isDragging = true" @mouseup="isDragging = false" />
        </div>
        <div class="controls-row">
          <div class="controls-left">
            <button class="ctrl-btn play-btn" @click="togglePlay">
              <svg v-if="!isPlaying" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            </button>
            <div class="volume-control" @mouseenter="showVolume = true" @mouseleave="showVolume = false">
              <button class="ctrl-btn volume-btn" @click="toggleMute">
                <svg v-if="volume === 0 || isMuted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <line x1="23" y1="9" x2="17" y2="15"></line>
                  <line x1="17" y1="9" x2="23" y2="15"></line>
                </svg>
                <svg v-else-if="volume < 0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              </button>
              <div class="volume-slider-container" :class="{ 'show': showVolume }">
                <input type="range" class="volume-slider" min="0" max="1" step="0.01" v-model="volume" @input="onVolumeSlider" />
              </div>
            </div>
            <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
          </div>

          <div class="controls-right">
            <select class="speed-select" v-model="playbackRate" @change="onSpeedChange" title="播放速度">
              <option :value="0.5">0.5x</option>
              <option :value="1">1.0x</option>
              <option :value="1.25">1.25x</option>
              <option :value="1.5">1.5x</option>
              <option :value="2">2.0x</option>
            </select>
            <button class="ctrl-btn" @click="togglePip" title="画中画" v-if="supportsPip">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <rect x="12" y="12" width="7" height="5" rx="1" ry="1"></rect>
              </svg>
            </button>
            <button class="ctrl-btn" @click="toggleFullscreen" title="全屏">
              <svg v-if="!isFullscreen" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <div class="resize-handle" @mousedown.stop="startResize" v-if="!isFullscreen"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import Hls from 'hls.js';
import { logger } from '../../services/logger';

const props = defineProps<{
  url: string | null;
  hideDownload?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'download', url: string): void;
}>();

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
const showControls = ref(true);
const showVolume = ref(false);
const isPip = ref(false);
const supportsPip = ref(false);

let hls: Hls | null = null;
let controlsTimeout: number | null = null;

const onMouseMove = () => {
  showControls.value = true;
  resetControlsTimeout();
};

const onMouseLeave = () => {
  if (isPlaying.value) {
    showControls.value = false;
  }
};

const resetControlsTimeout = () => {
  if (controlsTimeout) clearTimeout(controlsTimeout);
  controlsTimeout = window.setTimeout(() => {
    if (isPlaying.value) {
      showControls.value = false;
    }
  }, 2000);
};

const formatMediaSrc = (rawUrl: string): string => {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  
  if (trimmed.startsWith('velora://local/')) {
    const rawPath = trimmed.slice('velora://local/'.length);
    const decoded = decodeURIComponent(rawPath).replace(/\\/g, '/');
    return `velora://local/${encodeURIComponent(decoded)}`;
  }

  if (/^(http:\/\/|https:\/\/|blob:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  // 离线本地磁盘路径统一规范为 velora://local/ 协议
  const cleanPath = trimmed.replace(/\\/g, '/');
  return `velora://local/${encodeURIComponent(cleanPath)}`;
};

const loadVideo = () => {
  if (!videoRef.value || !props.url) return;
  const video = videoRef.value;
  const playUrl = formatMediaSrc(props.url);

  logger.info('VideoPreview', `Loading video source. Raw: ${props.url} -> Formatted: ${playUrl}`);

  if (hls) {
    hls.destroy();
    hls = null;
  }

  // 判断是否走 HLS.js 播放
  if (playUrl.toLowerCase().includes('.m3u8') && Hls.isSupported()) {
    logger.info('VideoPreview', 'Using HLS.js decoder for playback.');
    hls = new Hls({
      autoStartLoad: true,
      startPosition: -1,
      capLevelToPlayerSize: false,
    });
    
    hls.on(Hls.Events.ERROR, (_event, data) => {
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

    hls.loadSource(playUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
  } else {
    logger.info('VideoPreview', 'Using HTML5 native video player for playback.');
    video.src = playUrl;
    video.play().catch((err) => {
      logger.error('VideoPreview', `Native video play exception: ${err.message}`);
    });
  }
};

watch(() => props.url, (newUrl) => {
  if (newUrl) {
    bringToFront();
    nextTick(() => {
      loadVideo();
      if (document.pictureInPictureEnabled) {
        supportsPip.value = true;
      }
    });
  } else {
    if (videoRef.value) {
      videoRef.value.pause();
    }
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }
}, { immediate: true });

const bringToFront = () => {
  zIndex.value = 2000 + Date.now() % 1000;
};

const startDrag = (e: MouseEvent) => {
  if (isFullscreen.value) return;
  isDraggingWindow.value = true;
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

const startResize = (e: MouseEvent) => {
  if (isFullscreen.value) return;
  isResizing.value = true;
  startSize = { w: size.value.w, h: size.value.h };
  startMouse = { x: e.clientX, y: e.clientY };
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
};

const onResize = (e: MouseEvent) => {
  if (!isResizing.value) return;
  const dx = e.clientX - startMouse.x;
  const dy = e.clientY - startMouse.y;
  size.value = {
    w: Math.max(320, startSize.w + dx),
    h: Math.max(180, startSize.h + dy)
  };
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
  } else {
    videoRef.value.play();
  }
};

const onTimeUpdate = () => {
  if (!isDragging.value && videoRef.value) {
    currentTime.value = videoRef.value.currentTime;
  }
};

const onLoadedMetadata = () => {
  if (videoRef.value) {
    duration.value = videoRef.value.duration;
  }
};

const onSeek = (e: Event) => {
  if (videoRef.value) {
    videoRef.value.currentTime = Number((e.target as HTMLInputElement).value);
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
  if (target.error) {
    logger.error('VideoPreview', `Native Video Error: Code ${target.error.code} - ${target.error.message}`);
  } else {
    logger.error('VideoPreview', 'Native Video Error: Unknown error');
  }
};

const toggleFullscreen = () => {
  if (!dialogRef.value) return;
  isFullscreen.value = !isFullscreen.value;
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
  if (isNaN(secs)) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const close = () => {
  if (isFullscreen.value) isFullscreen.value = false;
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

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  nextTick(() => {
    loadVideo();
  });
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  if (hls) {
    hls.destroy();
  }
});

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false;
  }
};

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
  transition: width 0.1s, height 0.1s;
  
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
}

.dialog-header {
  height: 38px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  background: var(--bg-surface-hover);
  border-bottom: 1px solid var(--border-color);
  cursor: grab;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  transition: opacity 0.3s ease;

  &:active {
    cursor: grabbing;
  }
}

.is-fullscreen .dialog-header {
  background: var(--bg-surface-hover);
  border: none;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  user-select: none;
}

.header-actions {
  display: flex;
  gap: 6px;
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
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--bg-app);
}

.video-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  
  video {
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
  
  &.show-controls {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
}

.progress-container {
  display: flex;
  align-items: center;
  height: 12px;
  cursor: pointer;
}

.progress-bar {
  flex: 1;
  -webkit-appearance: none;
  background: var(--border-color);
  height: 4px;
  border-radius: 2px;
  outline: none;
  transition: height 0.1s ease;
  
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
  gap: 12px;
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
  padding: 6px;
  color: var(--color-accent);
  
  &:hover {
    color: var(--color-accent-hover);
  }
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.volume-slider-container {
  width: 0;
  opacity: 0;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  
  &.show {
    width: 60px;
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
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  user-select: none;
  pointer-events: none;
}

.speed-select {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12px;
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

.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 20;
  &::after {
    content: '';
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 8px;
    height: 8px;
    border-right: 2px solid var(--text-tertiary);
    border-bottom: 2px solid var(--text-tertiary);
    border-radius: 0 0 2px 0;
  }
}

</style>
