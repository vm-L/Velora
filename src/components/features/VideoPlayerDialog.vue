<template>
  <Teleport to="body">
    <div v-if="url" class="video-player-dialog"
      :style="{ top: position.y + 'px', left: position.x + 'px', width: size.w + 'px', height: size.h + 'px', zIndex }"
      @mousedown="bringToFront" ref="dialogRef" :class="{ 'is-fullscreen': (isFullscreen || isInAppFullscreen), 'hide-cursor': hideCursor, 'is-resizing': isResizing, 'is-dragging': isDraggingWindow }"
      @mousemove="onMouseMove" @mouseleave="onMouseLeave">
    
    <div class="dialog-header" :class="{ 'show-header': showControls || !(isFullscreen || isInAppFullscreen) }" @mousedown="startDrag" v-show="!(isFullscreen || isInAppFullscreen) || showControls" @mouseenter="onControlsEnter" @mouseleave="onControlsLeave">
      <div class="header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        视频播放器
      </div>
      <div class="header-actions" @mousedown.stop>
        <button v-if="!hideDownload" class="action-btn" @click.stop="downloadVideo" @mousedown.stop title="下载">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        <button class="action-btn close-btn" @click.stop="close" @mousedown.stop title="关闭">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <div class="dialog-content">
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
      
      <div class="player-controls-overlay" :class="{ 'show-controls': showControls || !isPlaying }" @mouseenter="onControlsEnter" @mouseleave="onControlsLeave">
        <div class="progress-container">
          <input type="range" class="progress-bar" min="0" :max="duration || 100" step="0.1" :value="currentTime" @input="onSeek" @change="onSeekEnd" @mousedown="isDragging = true" />
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
            <!-- In-App Fullscreen Button -->
            <button class="ctrl-btn" @click="toggleInAppFullscreen" title="应用内全屏">
              <svg v-if="!isInAppFullscreen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="5" y="5" width="14" height="14" rx="1" ry="1"></rect>
                <line x1="2" y1="2" x2="22" y2="22"></line>
              </svg>
            </button>
            
            <!-- True Fullscreen Button -->
            <button class="ctrl-btn" @click="toggleFullscreen" title="系统级全屏">
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
    
    <div class="resize-handle" @mousedown.stop="startResize" v-if="!isFullscreen && !isInAppFullscreen"></div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { logger } from '../../services/logger';

const props = defineProps<{
  url: string | null;
  hideDownload?: boolean;
  pageUrl?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'download', url: string): void;
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

logger.info('VideoPreview', `Component setup initialized. props.url: ${props.url}`);

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
const showVolume = ref(false);
const isPip = ref(false);
const supportsPip = ref(false);

let hls: any = null;

let controlsTimeout: number | null = null;
const isHoveringControls = ref(false);

const hideCursor = ref(false);
let cursorTimeout: number | null = null;

const resetCursorTimeout = () => {
  if (cursorTimeout) clearTimeout(cursorTimeout);
  hideCursor.value = false;
  if (isPlaying.value && !isDragging.value) {
    cursorTimeout = window.setTimeout(() => {
      if (isPlaying.value && !isDragging.value) {
        hideCursor.value = true;
      }
    }, 1000);
  }
};

const onMouseMove = (e: MouseEvent) => {
  if (isDraggingWindow.value || isResizing.value) {
    if (isPlaying.value) {
      showControls.value = false;
    }
    return;
  }
  resetCursorTimeout();

  if (!dialogRef.value) return;
  const rect = dialogRef.value.getBoundingClientRect();
  
  // 鼠标在顶部 60px 区域（全屏悬浮标题栏）或底部 85px 区域（操作栏）时唤醒控件
  const isAtTop = e.clientY <= rect.top + 60;
  const isAtBottom = e.clientY >= rect.bottom - 85;

  if (isAtTop || isAtBottom) {
    showControls.value = true;
    resetControlsTimeout();
  } else if (!isHoveringControls.value && isPlaying.value && !isDragging.value) {
    showControls.value = false;
  }
};

const onMouseLeave = () => {
  if (cursorTimeout) clearTimeout(cursorTimeout);
  hideCursor.value = false;
  if (isPlaying.value && !isDragging.value) {
    showControls.value = false;
  }
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
  if (isHoveringControls.value) return;
  controlsTimeout = window.setTimeout(() => {
    if (isPlaying.value && !isHoveringControls.value && !isDragging.value) {
      showControls.value = false;
    }
  }, 200);
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
  logger.info('VideoPreview', `loadVideo called. videoRef: ${!!videoRef.value}, url: ${props.url}`);
  if (!videoRef.value || !props.url) {
    logger.warn('VideoPreview', `loadVideo returning early! videoRef is ${videoRef.value}`);
    return;
  }
  const video = videoRef.value;
  const playUrl = formatMediaSrc(props.url);

  logger.info('VideoPreview', `Loading video source. Raw: ${props.url} -> Formatted: ${playUrl}`);

  if (hls) {
    hls.destroy();
    hls = null;
  }

  const checkM3U8Content = async (targetUrl: string): Promise<boolean> => {
    if (!targetUrl) return false;
    // 1. 本地媒体服务器流与本地文件路径直接跳过探查（绝对不是网络 M3U8 列表）
    if (targetUrl.includes('127.0.0.1:') || targetUrl.includes('localhost:') || /^\/|^[a-zA-Z]:[\\/]/i.test(targetUrl)) {
      return false;
    }
    // 2. 已有常见音视频/图像标准扩展名直接跳过探查
    if (/\.(mp4|webm|mkv|avi|flv|mp3|wav|ogg|aac|png|jpe?g|webp)$/i.test(targetUrl.split('?')[0])) {
      return false;
    }

    try {
      // 3. 仅对可疑网络资源使用 Range 探查前 512 字节头部签名，绝不一次性将大文件文本读入内存
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

  // 判断是否走 HLS.js 播放
  if (isM3U8) {
    try {
      const HlsModule = await import('hls.js');
      const Hls = HlsModule.default || HlsModule;
      if (Hls.isSupported()) {
        logger.info('VideoPreview', 'Using HLS.js decoder for playback.');
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
          },
          xhrSetup: (xhr: XMLHttpRequest) => {
            try {
              xhr.setRequestHeader('X-Velora-Client-Id', previewClientId);
              if (effectiveReferer.value) {
                xhr.setRequestHeader('X-Velora-Referer', effectiveReferer.value);
              }
            } catch {}
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
          for (let i = 0; i < data.levels.length; i++) {
            if (data.levels[i].bitrate > maxBitrate) {
              maxBitrate = data.levels[i].bitrate;
              maxLevel = i;
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
      logger.error('VideoPreview', `Failed to load HLS.js: ${err.message}`);
      video.src = playUrl;
      video.play().catch(() => {});
    }
  } else {
    logger.info('VideoPreview', 'Using HTML5 native video player for playback.');
    video.src = playUrl;
    video.play().catch((err) => {
      logger.error('VideoPreview', `Native video play exception: ${err.message}`);
    });
  }
};

function bringToFront() {
  zIndex.value = 2000 + Date.now() % 1000;
}

watch(() => props.url, (newUrl) => {
  logger.info('VideoPreview', `watch(url) triggered. newUrl: ${newUrl}`);
  if (newUrl) {
    bringToFront();
    setTimeout(() => {
      logger.info('VideoPreview', `watch(url) setTimeout executed. newUrl: ${newUrl}`);
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


let dragRafId: number | null = null;
let resizeRafId: number | null = null;

const startDrag = (e: MouseEvent) => {
  if (isFullscreen.value || isInAppFullscreen.value) return;
  if ((e.target as HTMLElement)?.closest('.header-actions, button')) return;
  isDraggingWindow.value = true;
  if (isPlaying.value) showControls.value = false;
  startPos = { x: position.value.x, y: position.value.y };
  startMouse = { x: e.clientX, y: e.clientY };
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDraggingWindow.value) return;
  const clientX = e.clientX;
  const clientY = e.clientY;
  if (dragRafId) cancelAnimationFrame(dragRafId);
  dragRafId = requestAnimationFrame(() => {
    const dx = clientX - startMouse.x;
    const dy = clientY - startMouse.y;
    position.value = {
      x: startPos.x + dx,
      y: startPos.y + dy
    };
  });
};

const stopDrag = () => {
  isDraggingWindow.value = false;
  if (dragRafId) cancelAnimationFrame(dragRafId);
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

const videoRatio = ref<number | null>(null);

const startResize = (e: MouseEvent) => {
  if (isFullscreen.value || isInAppFullscreen.value) return;
  isResizing.value = true;
  if (isPlaying.value) showControls.value = false;
  startSize = { w: size.value.w, h: size.value.h };
  startMouse = { x: e.clientX, y: e.clientY };
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
};

const onResize = (e: MouseEvent) => {
  if (!isResizing.value) return;
  const clientX = e.clientX;
  const clientY = e.clientY;
  if (resizeRafId) cancelAnimationFrame(resizeRafId);
  resizeRafId = requestAnimationFrame(() => {
    const dx = clientX - startMouse.x;
    const dy = clientY - startMouse.y;
    
    let ratio = videoRatio.value;
    if (!ratio && videoRef.value && videoRef.value.videoWidth && videoRef.value.videoHeight) {
      ratio = videoRef.value.videoWidth / videoRef.value.videoHeight;
    }
    if (!ratio) {
      ratio = startSize.w / Math.max(1, startSize.h);
    }

    // 沿对角线向量连续投影计算 deltaW，彻底消除条件分支跳跃导致的顿挫卡顿
    const deltaW = (dx + dy * ratio) / 2;
    const newW = Math.max(440, Math.round(startSize.w + deltaW));
    const newH = Math.round(newW / ratio);

    size.value = { w: newW, h: newH };
  });
};

const stopResize = () => {
  isResizing.value = false;
  if (resizeRafId) cancelAnimationFrame(resizeRafId);
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
};

const togglePlay = () => {
  if (!videoRef.value) return;
  if (isPlaying.value) {
    videoRef.value.pause();
  } else {
    videoRef.value.play().catch(err => {
      logger.error('VideoPreview', `togglePlay play exception: ${err.message}`);
    });
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

    const vw = videoRef.value.videoWidth;
    const vh = videoRef.value.videoHeight;

    if (vw && vh) {
      const ratio = vw / vh;
      videoRatio.value = ratio;

      let targetW = 600;
      if (ratio < 1) {
        // 竖屏视频：完全贴合 9:16 等宽高比，保障最小宽度 440px
        targetW = 440;
      } else {
        // 横屏视频：完全贴合 16:9 / 21:9 等宽高比
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
  if (videoRef.value && Math.abs(videoRef.value.currentTime - val) > 0.5) {
    videoRef.value.currentTime = val;
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


const toggleInAppFullscreen = () => {
  if (!dialogRef.value) return;
  isInAppFullscreen.value = !isInAppFullscreen.value;
};

const toggleFullscreen = async () => {
  if (!dialogRef.value) return;
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

onMounted(() => {
  logger.info('VideoPreview', 'onMounted called!');
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  
  if (props.url) {
    bringToFront();
  }
  
  setTimeout(() => {
    logger.info('VideoPreview', 'onMounted setTimeout executed!');
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

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && (isFullscreen.value || isInAppFullscreen.value)) {
    if (document.fullscreenElement) {
       document.exitFullscreen().catch(()=>{});
    }
    isInAppFullscreen.value = false;
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
  min-width: 440px;
  
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

.is-fullscreen .dialog-header,
:fullscreen .dialog-header,
:-webkit-full-screen .dialog-header {
  cursor: default !important;
  * {
    cursor: default !important;
  }
  &:active {
    cursor: default !important;
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
