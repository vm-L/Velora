<template>
  <div v-if="url" class="audio-player-dialog"
    :style="{ top: position.y + 'px', left: position.x + 'px', zIndex }"
    @mousedown="bringToFront" ref="dialogRef">
    <div class="dialog-header" @mousedown="startDrag">
      <div class="header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
        音频播放器
      </div>
      <div class="header-actions">
        <button v-if="!hideDownload" class="action-btn" @click.stop="downloadAudio" title="下载">
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

    <div class="dialog-content">
      <audio ref="audioRef" :src="url" autoplay @timeupdate="onTimeUpdate" @loadedmetadata="onLoadedMetadata" @ended="isPlaying = false" @play="isPlaying = true" @pause="isPlaying = false"></audio>
      
      <div class="player-controls">
        <button class="play-btn" @click="togglePlay">
          <svg v-if="!isPlaying" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
        </button>

        <div class="progress-container">
          <span class="time">{{ formatTime(currentTime) }}</span>
          <input type="range" class="progress-bar" min="0" :max="duration || 100" v-model="currentTime" @input="onSeek" @mousedown="isDragging = true" @mouseup="isDragging = false" />
          <span class="time">{{ formatTime(duration) }}</span>
        </div>

        <div class="speed-control">
          <select v-model="playbackRate" @change="onSpeedChange" title="播放速度">
            <option :value="0.5">0.5x</option>
            <option :value="1">1.0x</option>
            <option :value="1.25">1.25x</option>
            <option :value="1.5">1.5x</option>
            <option :value="2">2.0x</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  url: string | null;
  hideDownload?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'download', url: string): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
const audioRef = ref<HTMLAudioElement | null>(null);

const position = ref({ x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 60 });
const zIndex = ref(2000);
const isDraggingWindow = ref(false);
let startPos = { x: 0, y: 0 };
let startMouse = { x: 0, y: 0 };

const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const playbackRate = ref(1);
const isDragging = ref(false);

watch(() => props.url, (newUrl) => {
  if (newUrl) {
    bringToFront();
    // Auto-play when opened
    setTimeout(() => {
      if (audioRef.value) {
        audioRef.value.play().catch(() => {});
      }
    }, 100);
  } else {
    if (audioRef.value) {
      audioRef.value.pause();
    }
  }
});

const bringToFront = () => {
  zIndex.value = 2000 + Date.now() % 1000;
};

const startDrag = (e: MouseEvent) => {
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

const togglePlay = () => {
  if (!audioRef.value) return;
  if (isPlaying.value) {
    audioRef.value.pause();
  } else {
    audioRef.value.play();
  }
};

const onTimeUpdate = () => {
  if (!isDragging.value && audioRef.value) {
    currentTime.value = audioRef.value.currentTime;
  }
};

const onLoadedMetadata = () => {
  if (audioRef.value) {
    duration.value = audioRef.value.duration;
  }
};

const onSeek = () => {
  if (audioRef.value) {
    audioRef.value.currentTime = currentTime.value;
  }
};

const onSpeedChange = () => {
  if (audioRef.value) {
    audioRef.value.playbackRate = playbackRate.value;
  }
};

const formatTime = (seconds: number) => {
  if (isNaN(seconds) || !isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const downloadAudio = () => {
  if (props.url) {
    emit('download', props.url);
  }
};

const close = () => {
  if (audioRef.value) {
    audioRef.value.pause();
  }
  emit('close');
};
</script>

<style scoped>
.audio-player-dialog {
  position: fixed;
  background: var(--bg-color, var(--bg-surface));
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color, #e4e7ed);
  min-width: 400px;
}

:global(body.dark) .audio-player-dialog {
  background: #1e1e20;
  border-color: var(--text-primary);
  box-shadow: var(--shadow-soft);
}

.dialog-header {
  height: 36px;
  background: var(--bg-color, var(--bg-surface));
  border-bottom: 1px solid var(--border-color, #e4e7ed);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  cursor: grab;
  user-select: none;
}

:global(body.dark) .dialog-header {
  background: #252527;
  border-color: var(--text-primary);
}

.dialog-header:active {
  cursor: grabbing;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color, #303133);
}

:global(body.dark) .header-title {
  color: #e5eaf3;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary, #909399);
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--hover-bg, var(--bg-app));
  color: var(--text-color, #303133);
}

.close-btn:hover {
  background: #f56c6c;
  color: white;
}

:global(body.dark) .action-btn:hover {
  background: var(--text-primary);
  color: #e5eaf3;
}

:global(body.dark) .close-btn:hover {
  background: #f56c6c;
  color: white;
}

.dialog-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.play-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--color-accent-hover);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.1s, background 0.2s;
}

.play-btn:hover {
  background: var(--color-accent-hover);
  transform: scale(1.05);
}

.play-btn:active {
  transform: scale(0.95);
}

.progress-container {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.time {
  font-size: 12px;
  color: var(--text-secondary, #909399);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-color, #e4e7ed);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

:global(body.dark) .progress-bar {
  background: #444;
}

.progress-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-accent-hover);
  cursor: pointer;
  transition: transform 0.1s;
}

.progress-bar::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.speed-control select {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-color, #e4e7ed);
  background: var(--bg-color, var(--bg-surface));
  color: var(--text-color, #303133);
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

:global(body.dark) .speed-control select {
  background: #252527;
  border-color: #444;
  color: #e5eaf3;
}
</style>
