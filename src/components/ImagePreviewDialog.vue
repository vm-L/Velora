<template>
  <div class="image-preview-dialog"
    :style="{ top: position.y + 'px', left: position.x + 'px', width: size.width + 'px', height: size.height + 'px', zIndex }"
    @mousedown="bringToFront" ref="dialogRef">
    <div class="dialog-header" @mousedown="startDrag">
      <div class="header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        图片预览
      </div>
      <div class="header-actions">
        <button class="action-btn close-btn" @click.stop="close" title="关闭">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <div class="dialog-content checkerboard" @wheel.prevent="onWheel" ref="contentRef" @contextmenu.prevent="copyData">
      <div class="image-wrapper" :style="{ transform: `translate(${panX}px, ${panY}px) scale(${scale})` }"
        @mousedown="startPan" @dblclick="resetView">
        <img :src="currentUrl" referrerpolicy="no-referrer" @load="onImageLoad" draggable="false" />
      </div>

      <!-- Navigation Arrows -->
      <button v-if="isMulti" class="nav-arrow left-arrow" @click.stop="prev" title="上一张">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
      </button>
      <button v-if="isMulti" class="nav-arrow right-arrow" @click.stop="next" title="下一张">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </button>

      <!-- Minimap -->
      <div v-if="scale > 1" class="minimap" :style="minimapContainerStyle">
        <img :src="currentUrl" referrerpolicy="no-referrer" />
        <div class="minimap-viewport" :style="minimapViewportStyle"></div>
      </div>
    </div>

    <div class="dialog-footer">
      <div class="image-info">
        <span v-if="isMulti" class="multi-index">{{ currentIndex + 1 }}/{{ urls?.length }}</span>
        {{ width }} × {{ height }} ({{ Math.round(scale * 100) }}%)
      </div>
      <div class="footer-actions">
        <button class="icon-action-btn" @click="resetView" title="重置缩放和平移">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <polyline points="3 3 3 8 8 8"></polyline>
          </svg>
        </button>
        <button class="icon-action-btn" @click="copyUrl" title="复制图片链接">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="icon-action-btn" @click="copyData" title="复制图片到剪贴板">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </button>
        <button class="icon-action-btn" @click="saveLocal" title="保存到本地">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
      </div>
    </div>

    <!-- Thumbnails Bar -->
    <div v-if="isMulti" class="thumbnails-bar" @wheel.prevent="onThumbnailsWheel" ref="thumbnailsRef">
      <div v-for="(thumb, index) in urls" :key="index" class="thumbnail-item"
        :class="{ active: index === currentIndex }" @click="goTo(index)">
        <img :src="thumb" referrerpolicy="no-referrer" draggable="false" />
      </div>
    </div>

    <div class="resize-handle" @mousedown="startResize">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="21" y1="21" x2="3" y2="3"></line>
        <line x1="21" y1="14" x2="10" y2="3"></line>
        <line x1="14" y1="21" x2="3" y2="10"></line>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue';
import { useMessage } from '../composables/useMessage';

const props = defineProps<{
  id: string;
  url: string;
  urls?: string[];
  zIndex: number;
  initialX?: number;
  initialY?: number;
}>();

const emit = defineEmits(['close', 'focus', 'interaction-start', 'interaction-end']);
const { showMessage } = useMessage();

const position = ref({
  x: props.initialX !== undefined ? props.initialX : (window.innerWidth / 2 - 200),
  y: props.initialY !== undefined ? props.initialY : (window.innerHeight / 2 - 150)
});

const size = ref({ width: 400, height: 300 });

const dialogRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const thumbnailsRef = ref<HTMLElement | null>(null);

const scale = ref(1);
const panX = ref(0);
const panY = ref(0);
const width = ref(0);
const height = ref(0);

const isMulti = computed(() => (props.urls?.length ?? 0) > 1);
const currentIndex = ref(0);
const currentUrl = computed(() => props.urls ? (props.urls[currentIndex.value] ?? props.url) : props.url);

const viewStates = ref<Record<number, { scale: number; panX: number; panY: number; }>>({});

const onImageLoad = (e: Event) => {
  const img = e.target as HTMLImageElement;
  width.value = img.naturalWidth;
  height.value = img.naturalHeight;

  // Adjust initial dialog size to match image aspect ratio only on first load if we don't have viewStates
  if (!viewStates.value[currentIndex.value]) {
    const ratio = width.value / height.value;
    if (ratio > 0 && !isMulti.value) { // For multi-image, don't resize on every image
      // Set reasonable viewport boundaries to prevent dialog overflowing
      const maxW = Math.min(800, window.innerWidth * 0.8);
      const maxH = Math.min(600, window.innerHeight * 0.8);
      const minW = 250;
      const minH = 200;

      // Start with a reasonable width and calculate height based on ratio
      let targetW = Math.min(450, maxW);
      let targetH = targetW / ratio;

      // Constrain height within maxH
      if (targetH > maxH) {
        targetH = maxH;
        targetW = targetH * ratio;
      }

      // Constrain width within maxW
      if (targetW > maxW) {
        targetW = maxW;
        targetH = targetW / ratio;
      }

      // Constrain to minimum sizes (if the ratio is too extreme, center/contain will handle it)
      if (targetW < minW) {
        targetW = minW;
        targetH = Math.max(minH, Math.min(maxH, targetW / ratio));
      }
      if (targetH < minH) {
        targetH = minH;
        targetW = Math.max(minW, Math.min(maxW, targetH * ratio));
      }

      size.value = { width: Math.round(targetW), height: Math.round(targetH) };
    }
  }
};

const resetView = () => {
  scale.value = 1;
  panX.value = 0;
  panY.value = 0;
  if (viewStates.value[currentIndex.value]) {
    delete viewStates.value[currentIndex.value];
  }
};

const goTo = (index: number) => {
  if (!props.urls) return;
  // Save current state
  viewStates.value[currentIndex.value] = { scale: scale.value, panX: panX.value, panY: panY.value };

  currentIndex.value = index;

  // Restore or reset state
  const saved = viewStates.value[index];
  if (saved) {
    scale.value = saved.scale;
    panX.value = saved.panX;
    panY.value = saved.panY;
  } else {
    scale.value = 1;
    panX.value = 0;
    panY.value = 0;
  }

  // Scroll thumbnail into view
  if (thumbnailsRef.value) {
    const thumbEl = thumbnailsRef.value.children[index] as HTMLElement;
    if (thumbEl) {
      thumbEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }
};

const prev = () => {
  if (!props.urls) return;
  goTo((currentIndex.value - 1 + props.urls.length) % props.urls.length);
};

const next = () => {
  if (!props.urls) return;
  goTo((currentIndex.value + 1) % props.urls.length);
};

const onThumbnailsWheel = (e: WheelEvent) => {
  if (thumbnailsRef.value) {
    thumbnailsRef.value.scrollLeft += e.deltaY > 0 ? 50 : -50;
  }
};

const onWheel = (e: WheelEvent) => {
  const delta = e.deltaY > 0 ? -0.15 : 0.15;
  let newScale = scale.value + delta;
  if (newScale < 1) newScale = 1;
  if (newScale > 10) newScale = 10;

  if (newScale === 1) {
    panX.value = 0;
    panY.value = 0;
  }

  scale.value = newScale;
};

const bringToFront = () => {
  emit('focus', props.id);
};

const close = () => {
  emit('close', props.id);
};

const copyUrl = () => {
  navigator.clipboard.writeText(currentUrl.value);
  showMessage('图片链接已复制', 'success');
};

const copyData = async () => {
  if (window.electronAPI && window.electronAPI.copyImage) {
    const success = await window.electronAPI.copyImage(currentUrl.value);
    if (success) {
      showMessage('图片已复制到剪贴板', 'success');
    } else {
      showMessage('复制失败：剪贴板可能不支持该格式或加载超时', 'error');
    }
  }
};

const saveLocal = () => {
  // To be implemented
  console.log('Save to local logic goes here');
};

// Drag Logic
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

const startDrag = (e: MouseEvent) => {
  isDragging = true;
  bringToFront();
  emit('interaction-start');
  dragOffset.x = e.clientX - position.value.x;
  dragOffset.y = e.clientY - position.value.y;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDragging) return;
  position.value.x = e.clientX - dragOffset.x;
  position.value.y = e.clientY - dragOffset.y;
};

const stopDrag = () => {
  isDragging = false;
  emit('interaction-end');
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

// Panning Logic
let isPanning = false;
let panStartMouse = { x: 0, y: 0 };
let panStartOffset = { x: 0, y: 0 };

const startPan = (e: MouseEvent) => {
  if (scale.value <= 1) return;
  e.preventDefault();
  isPanning = true;
  bringToFront();
  emit('interaction-start');
  panStartMouse.x = e.clientX;
  panStartMouse.y = e.clientY;
  panStartOffset.x = panX.value;
  panStartOffset.y = panY.value;
  document.addEventListener('mousemove', onPan);
  document.addEventListener('mouseup', stopPan);
};

const onPan = (e: MouseEvent) => {
  if (!isPanning) return;
  panX.value = panStartOffset.x + (e.clientX - panStartMouse.x);
  panY.value = panStartOffset.y + (e.clientY - panStartMouse.y);
};

const stopPan = () => {
  isPanning = false;
  emit('interaction-end');
  document.removeEventListener('mousemove', onPan);
  document.removeEventListener('mouseup', stopPan);
};

const minimapContainerStyle = computed(() => {
  // Dependency tracking for resize
  const _w = size.value.width;
  const _h = size.value.height;
  if (_w < 0 || _h < 0) return {};

  if (!contentRef.value) return { width: '80px', height: '60px' };
  const cw = contentRef.value.clientWidth;
  const ch = contentRef.value.clientHeight;
  if (!cw || !ch) return { width: '80px', height: '60px' };

  const ratio = cw / ch;
  let mw = 120;
  let mh = 120 / ratio;
  if (mh > 100) {
    mh = 100;
    mw = 100 * ratio;
  }
  return {
    width: `${mw}px`,
    height: `${mh}px`
  };
});

const minimapViewportStyle = computed(() => {
  // Dependency tracking
  const _w = size.value.width;
  const _h = size.value.height;
  if (_w < 0 || _h < 0) return {};

  if (!contentRef.value) return {};
  const cw = contentRef.value.clientWidth;
  const ch = contentRef.value.clientHeight;
  if (!cw || !ch) return {};

  const boxW = (1 / scale.value) * 100;
  const boxH = (1 / scale.value) * 100;
  const boxLeft = 50 - (panX.value / (cw * scale.value)) * 100 - (boxW / 2);
  const boxTop = 50 - (panY.value / (ch * scale.value)) * 100 - (boxH / 2);

  return {
    width: `${boxW}%`,
    height: `${boxH}%`,
    left: `${boxLeft}%`,
    top: `${boxTop}%`
  };
});

// Resize Logic
let isResizing = false;
let resizeStartSize = { w: 0, h: 0 };
let resizeStartMouse = { x: 0, y: 0 };

const startResize = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  isResizing = true;
  bringToFront();
  emit('interaction-start');
  resizeStartSize.w = size.value.width;
  resizeStartSize.h = size.value.height;
  resizeStartMouse.x = e.clientX;
  resizeStartMouse.y = e.clientY;
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
};

const onResize = (e: MouseEvent) => {
  if (!isResizing) return;

  const ratio = width.value / height.value || (resizeStartSize.w / resizeStartSize.h);
  let newW = resizeStartSize.w + (e.clientX - resizeStartMouse.x);
  let newH = newW / ratio;

  if (newW < 250) {
    newW = 250;
    newH = newW / ratio;
  }
  if (newH < 200) {
    newH = 200;
    newW = newH * ratio;
  }

  size.value.width = newW;
  size.value.height = newH;
};

const stopResize = () => {
  isResizing = false;
  emit('interaction-end');
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
};

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
  document.removeEventListener('mousemove', onPan);
  document.removeEventListener('mouseup', stopPan);
})
  ;</script>

<style scoped lang="less">
.image-preview-dialog {
  position: fixed;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
  min-width: 250px;
  min-height: 200px;
}

.dialog-header {
  height: 32px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  cursor: grab;
  flex-shrink: 0;
}

.dialog-header:active {
  cursor: grabbing;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}

.header-title svg {
  display: block;
}

.header-actions {
  display: flex;
  align-items: center;
}

.action-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
}

.action-btn svg {
  display: block;
}

.action-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

.close-btn:hover {
  color: #ef4444;
}

.dialog-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.checkerboard {
  background-color: #f1f5f9;
  background-image:
    linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%, #e2e8f0),
    linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%, #e2e8f0);
  background-size: 20px 20px;
  background-position: 0 0, 10px 10px;
}

.image-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  transition: transform 0.05s linear;
  transform-origin: center center;
  cursor: grab;
}

.image-wrapper:active {
  cursor: grabbing;
}

.image-wrapper img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.4);
  color: white;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 5;
  padding: 0;
}

.nav-arrow:hover {
  background: rgba(0, 0, 0, 0.8);
  transform: translateY(-50%) scale(1.1);
}

.nav-arrow svg {
  display: block;
}

.left-arrow {
  left: 10px;
}

.right-arrow {
  right: 10px;
}

.minimap {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 10;
}

.minimap img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.minimap-viewport {
  position: absolute;
  border: 1px solid #ef4444;
  background: rgba(239, 68, 68, 0.2);
  box-sizing: border-box;
}

.dialog-footer {
  height: 40px;
  padding: 0 12px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  padding-right: 20px;
  /* space for resize handle */
}

.image-info {
  font-size: 11px;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.multi-index {
  color: #3b82f6;
  font-weight: 600;
  margin-right: 6px;
  display: inline-block;
  background: #eff6ff;
  padding: 2px 6px;
  border-radius: 4px;
}

.footer-actions {
  display: flex;
  gap: 4px;
}

.icon-action-btn {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
}

.icon-action-btn:hover {
  background: #e2e8f0;
  color: #3b82f6;
}

.thumbnails-bar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: #f1f5f9;
  border-top: 1px solid #e2e8f0;
  overflow-x: auto;
  flex-shrink: 0;
  height: 52px;
  box-sizing: border-box;
  align-items: center;

  /* Hide scrollbar for Chrome, Safari and Opera */
  &::-webkit-scrollbar {
    display: none;
  }

  /* Hide scrollbar for IE, Edge and Firefox */
  -ms-overflow-style: none;
  /* IE and Edge */
  scrollbar-width: none;
  /* Firefox */
}

.thumbnail-item {
  width: 48px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  background: white;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
  box-sizing: border-box;
}

.thumbnail-item img {
  max-width: 100%;
  max-height: 100%;
  object-fit: cover;
}

.thumbnail-item:hover {
  border-color: #cbd5e1;
}

.thumbnail-item.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.resize-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  color: #cbd5e1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.resize-handle:hover {
  color: #94a3b8;
}
</style>
