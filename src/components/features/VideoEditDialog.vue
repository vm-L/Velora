<template>
  <Teleport to="body">
    <div v-if="visible && sourcePath" class="modal-overlay video-edit-overlay" v-overlay-close="close">
      <div
        class="video-edit-workbench"
        @mousedown.stop="syncPointerModifiers"
        @pointermove="syncPointerModifiers"
      >
        <!-- 顶部标题栏：关闭按钮旁常驻 ? 帮助气泡 -->
        <div class="workbench-header">
          <div class="header-left" :title="displayTitle">
            <VIcon name="scissors" :size="15" />
            <span class="header-title">{{ displayTitle }}</span>
          </div>
          <div class="header-right">
            <div class="help-trigger-wrap">
              <VButton variant="icon" class="help-btn" title="快捷键说明">
                <VIcon name="help" :size="15" />
              </VButton>
              <div class="shortcuts-popover">
                <div class="popover-title">剪辑快捷键</div>
                <div class="shortcut-grid">
                  <span>播放 / 暂停 · 静音</span><span class="keys"><kbd>Space</kbd><kbd>M</kbd></span>
                  <span>微调 ±0.1 秒</span><span class="keys"><kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd></span>
                  <span>常规步进 ±1 秒</span><span class="keys"><kbd>←</kbd><kbd>→</kbd></span>
                  <span>快速步进 ±10 秒</span><span class="keys"><kbd>Ctrl</kbd>+<kbd>←</kbd><kbd>→</kbd></span>
                  <span>大跨步 ±60 秒</span><span class="keys"><kbd>Shift</kbd>+<kbd>←</kbd><kbd>→</kbd></span>
                  <span>设起点 / 设终点 / 新增</span><span class="keys"><kbd>Z</kbd><kbd>C</kbd><kbd>X</kbd></span>
                  <span>跳起点 / 跳终点 / 试播</span><span class="keys"><kbd>A</kbd><kbd>D</kbd><kbd>S</kbd></span>
                  <span>切换片段 / 删除片段</span><span class="keys"><kbd>Q</kbd><kbd>E</kbd><kbd>W</kbd></span>
                </div>
              </div>
            </div>
            <VButton variant="icon" @click="close" title="关闭">
              <VIcon name="close" :size="14" />
            </VButton>
          </div>
        </div>

        <!-- D2 左右分栏主体 -->
        <div class="workbench-body">
          <!-- 左 65%：监视器 + 选段进度条 + 动态修饰键步进控制栏 -->
          <div class="workbench-stage">
            <div class="stage-video-wrap" @click="togglePlay">
              <video
                ref="videoRef"
                playsinline
                @loadedmetadata="onLoadedMetadata"
                @timeupdate="onTimeUpdate"
                @play="isPlaying = true"
                @pause="isPlaying = false"
                @ended="onEnded"
                @error="onVideoError"
              ></video>
              <div v-if="activeSegment" class="stage-hud-chip">
                片段 #{{ activeSegmentIndex + 1 }}：{{ formatTime(activeSegment.start) }} → {{ formatTime(activeSegment.end) }}
              </div>
            </div>

            <!-- 底部控制卡 -->
            <div class="stage-controls-card">
              <!-- 可点击与拖拽的选段可视化进度条 -->
              <div
                ref="trackRef"
                class="timeline-track"
                @pointerdown="onTrackPointerDown"
                @pointermove="onTrackPointerMove"
                @pointerup="onTrackPointerUp"
                @pointercancel="onTrackPointerUp"
              >
                <div class="timeline-progress-fill" :style="{ width: progressPercent + '%' }"></div>
                <template v-if="duration > 0">
                  <div
                    v-for="(seg, idx) in editSegments"
                    :key="seg.id"
                    class="timeline-segment-block"
                    :class="{ 'is-active': idx === activeSegmentIndex }"
                    :style="{
                      left: (Math.max(0, seg.start) / duration * 100) + '%',
                      width: (Math.max(0.2, seg.end - seg.start) / duration * 100) + '%'
                    }"
                    @pointerdown.stop
                    @click.stop="selectSegment(idx)"
                    :title="`片段 #${idx + 1}: ${formatTime(seg.start)} - ${formatTime(seg.end)}`"
                  ></div>
                </template>
                <div class="timeline-playhead" :style="{ left: progressPercent + '%' }"></div>
              </div>

              <!-- 播放 + 动态修饰键联动步进栏 -->
              <div class="stage-controls-row">
                <div class="controls-left">
                  <VButton
                    variant="secondary"
                    size="small"
                    class="play-toggle-btn"
                    @click="togglePlay"
                    :title="isPlaying ? '暂停 (Space)' : '播放 (Space)'"
                  >
                    <VIcon :name="isPlaying ? 'pause' : 'play'" :size="13" />
                  </VButton>

                  <VButton
                    variant="secondary"
                    size="small"
                    class="step-btn"
                    :active="Boolean(activeStepSpec.modifier)"
                    @mousedown="startHoldSeek(-1, $event)"
                    @mouseup="stopHoldSeek"
                    @mouseleave="stopHoldSeek"
                    :title="`后退 ${activeStepSpec.label} (按住 Alt/Ctrl/Shift 切换步长)`"
                  >
                    <VIcon name="chevron-left" :size="12" />
                    <span class="mono">-{{ activeStepSpec.label }}</span>
                  </VButton>

                  <VButton
                    variant="secondary"
                    size="small"
                    class="step-btn"
                    :active="Boolean(activeStepSpec.modifier)"
                    @mousedown="startHoldSeek(1, $event)"
                    @mouseup="stopHoldSeek"
                    @mouseleave="stopHoldSeek"
                    :title="`前进 ${activeStepSpec.label} (按住 Alt/Ctrl/Shift 切换步长)`"
                  >
                    <span class="mono">+{{ activeStepSpec.label }}</span>
                    <VIcon name="chevron-right" :size="12" />
                  </VButton>

                  <span v-if="activeStepSpec.modifier" class="modifier-hint">
                    {{ activeStepSpec.modifier }} · ±{{ activeStepSpec.label }}
                  </span>
                </div>

                <div class="controls-right">
                  <span class="timecode-text mono">
                    {{ formatTime(currentTime) }}
                    <span class="timecode-total">/ {{ formatTime(duration) }}</span>
                  </span>
                  <VButton variant="secondary" size="small" class="speed-btn mono" @click="cycleSpeed" title="切换播放倍速">
                    {{ playbackRate }}x
                  </VButton>
                  <VButton variant="icon" :active="isMuted" @click="toggleMute" :title="isMuted ? '取消静音 (M)' : '静音 (M)'">
                    <VIcon :name="isMuted ? 'volume-mute' : 'volume'" :size="15" />
                  </VButton>
                </div>
              </div>
            </div>
          </div>

          <!-- 右 35%：固定精剪检视器（一屏全览零弹窗） -->
          <div class="workbench-inspector">
            <!-- 顶部打点三连 -->
            <div class="inspector-mark-row">
              <VButton variant="secondary" class="mark-btn" @click="setCurrentAsStart" title="设为当前片段起点 (Z)">
                <VIcon name="segment-start" :size="13" />
                <span class="mark-label">起点</span>
              </VButton>
              <VButton variant="secondary" class="mark-btn" @click="setCurrentAsEnd" title="设为当前片段终点 (C)">
                <VIcon name="segment-end" :size="13" />
                <span class="mark-label">终点</span>
              </VButton>
              <VButton variant="primary" class="mark-btn" @click="handleAddSegment" title="新增剪辑选段 (X)">
                <VIcon name="plus" :size="13" />
                <span class="mark-label">新增片段</span>
              </VButton>
            </div>

            <!-- 中部片段清单 -->
            <div class="inspector-list-header">
              <span>片段清单</span>
              <span class="mono"><strong>{{ editSegments.length }}</strong> 段 · {{ formatTime(totalEditedDuration) }}</span>
            </div>

            <div ref="segmentsListRef" class="inspector-segments">
              <div
                v-for="(seg, idx) in editSegments"
                :key="seg.id"
                class="segment-card"
                :class="{ 'is-selected': idx === activeSegmentIndex }"
                @click="selectSegment(idx)"
              >
                <div class="segment-card-top">
                  <span class="segment-badge mono">
                    #{{ idx + 1 }} · {{ formatTime(Math.max(0, seg.end - seg.start)) }}
                  </span>
                  <div class="segment-card-actions" @click.stop>
                    <VButton
                      variant="icon"
                      class="seg-mini-btn"
                      :disabled="idx === 0"
                      @click="moveSegment(idx, -1)"
                      title="上移片段"
                    >
                      <VIcon name="arrow-up" :size="11" />
                    </VButton>
                    <VButton
                      variant="icon"
                      class="seg-mini-btn"
                      :disabled="idx === editSegments.length - 1"
                      @click="moveSegment(idx, 1)"
                      title="下移片段"
                    >
                      <VIcon name="arrow-down" :size="11" />
                    </VButton>
                    <VButton
                      variant="icon"
                      class="seg-mini-btn"
                      :active="isSegmentPlaying && idx === activeSegmentIndex"
                      @click="togglePreviewSegment(idx)"
                      :title="isSegmentPlaying && idx === activeSegmentIndex ? '停止试播 (S)' : '试播片段 (S)'"
                    >
                      <VIcon :name="(isSegmentPlaying && idx === activeSegmentIndex) ? 'pause' : 'play'" :size="11" />
                    </VButton>
                    <VButton
                      v-if="editSegments.length > 1"
                      variant="icon-danger"
                      class="seg-mini-btn"
                      @click="removeSegment(idx)"
                      title="删除片段 (W)"
                    >
                      <VIcon name="close" :size="11" />
                    </VButton>
                  </div>
                </div>

                <div class="segment-time-inputs" @click.stop>
                  <VInput
                    :model-value="formatTime(seg.start)"
                    class="time-input mono"
                    @blur="(val: string) => onTimeInputCommit(idx, 'start', val)"
                    @enter="onTimeInputEnter(idx, 'start', $event)"
                  />
                  <span class="time-arrow">→</span>
                  <VInput
                    :model-value="formatTime(seg.end)"
                    class="time-input mono"
                    @blur="(val: string) => onTimeInputCommit(idx, 'end', val)"
                    @enter="onTimeInputEnter(idx, 'end', $event)"
                  />
                </div>
              </div>
            </div>

            <!-- 底部固定导出区 -->
            <div class="inspector-export-panel">
              <VSwitch v-model="saveMode" :options="saveModeOptions" block />
              <VInput
                v-if="saveMode === 'saveAs'"
                v-model="customFilename"
                placeholder="输入输出文件名"
              />
              <div class="export-summary">
                <span class="mono">裁去 {{ formatTime(trimmedDuration) }}</span>
                <VButton variant="secondary" size="small" @click="handleExportGif" title="将当前选中片段导出为 GIF">
                  导出 GIF
                </VButton>
              </div>
              <div class="export-actions">
                <VButton variant="secondary" @click="close">取消</VButton>
                <VButton :variant="saveMode === 'replace' ? 'secondary' : 'primary'" @click="handleConfirmExport">开始剪辑</VButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VSwitch from '@/components/base/VSwitch.vue';
import VIcon from '@/components/base/VIcon.vue';
import {
  buildLocalStreamUrl,
  formatEditTime,
  parseEditTime,
  resolveStepByModifiers,
  type StepModifierSpec
} from '@/composables/videoPlayer/types';
import { useVideoEditSegments } from '@/composables/videoPlayer/useVideoEditSegments';
import { useConfirm } from '@/composables/useConfirm';
import { useMessage } from '@/composables/useMessage';
import { logger } from '@/services/logger';

const props = defineProps<{
  visible: boolean;
  sourcePath: string | null;
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'edit-complete', payload: { mode: 'replace' | 'saveAs'; outputPath: string; sourcePath: string }): void;
}>();

const { confirm, state: confirmState } = useConfirm();
const { showMessage } = useMessage();

const videoRef = ref<HTMLVideoElement | null>(null);
const trackRef = ref<HTMLElement | null>(null);
const segmentsListRef = ref<HTMLElement | null>(null);

const isPlaying = ref(false);
const isMuted = ref(false);
const playbackRate = ref(1);
const currentTime = ref(0);
const duration = ref(0);

const saveMode = ref<'replace' | 'saveAs'>('saveAs');
const customFilename = ref('');
const saveModeOptions = [
  { label: '覆盖保存', value: 'replace' },
  { label: '另存为', value: 'saveAs' }
];

const activeStepSpec = ref<StepModifierSpec>({ step: 1, label: '1s', modifier: '' });
let holdTimer: number | null = null;
let holdInterval: number | null = null;
let isTrackDragging = false;

const displayTitle = computed(() => {
  if (props.title) return props.title;
  if (!props.sourcePath) return '视频剪辑';
  return props.sourcePath.replace(/\\/g, '/').split('/').pop() || '视频剪辑';
});

const localDiskPath = computed(() => props.sourcePath || null);

const forceHours = computed(() => duration.value >= 3600);
const formatTime = (sec: number) => formatEditTime(sec, forceHours.value);

const progressPercent = computed(() => {
  if (duration.value <= 0) return 0;
  return Math.max(0, Math.min(100, (currentTime.value / duration.value) * 100));
});

const releaseVideoMedia = () => {
  stopHoldSeek();
  const vid = videoRef.value;
  if (vid) {
    try {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
    } catch {}
  }
  isPlaying.value = false;
};

const {
  editSegments,
  activeSegmentIndex,
  isSegmentPlaying,
  totalEditedDuration,
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
  moveSegment,
  updateSegmentTime,
  togglePreviewSegment,
  seekToSegmentStart,
  seekToSegmentEnd,
  selectPrevSegment,
  selectNextSegment,
  startExport,
  handleExportGif
} = useVideoEditSegments({
  videoRef,
  currentTime,
  duration,
  localDiskPath,
  videoTitle: displayTitle,
  releaseVideoMedia
});

const activeSegment = computed(() => editSegments.value[activeSegmentIndex.value] || null);
const trimmedDuration = computed(() => Math.max(0, duration.value - totalEditedDuration.value));

const handleAddSegment = () => {
  addSegment();
  void nextTick(() => {
    if (segmentsListRef.value) {
      segmentsListRef.value.scrollTop = segmentsListRef.value.scrollHeight;
    }
  });
};

let loadSessionId = 0;

const loadSourceVideo = async () => {
  const session = ++loadSessionId;
  const rawPath = props.sourcePath;
  if (!rawPath) return;

  if ((!window.__SERVER_PORT__ || !window.__SERVER_TOKEN__) && window.electronAPI?.getServerInfo) {
    try {
      const info = await window.electronAPI.getServerInfo();
      if (info?.port) window.__SERVER_PORT__ = info.port;
      if (info?.token) window.__SERVER_TOKEN__ = info.token;
    } catch {}
  }

  await nextTick();
  const vid = videoRef.value;
  if (!vid || !props.visible || session !== loadSessionId) return;

  const port = window.__SERVER_PORT__ || 0;
  const token = window.__SERVER_TOKEN__ || '';
  const streamUrl = buildLocalStreamUrl(rawPath, port, token, Date.now());
  vid.src = streamUrl;
  vid.muted = isMuted.value;
  vid.playbackRate = playbackRate.value;
  vid.load();
};

const initWorkbench = () => {
  currentTime.value = 0;
  duration.value = 0;
  isPlaying.value = false;
  playbackRate.value = 1;
  activeStepSpec.value = { step: 1, label: '1s', modifier: '' };
  resetEditSegments();
  initSegmentsIfEmpty();

  const fileName = displayTitle.value;
  const dotIdx = fileName.lastIndexOf('.');
  const base = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
  const ext = dotIdx > 0 ? fileName.slice(dotIdx) : '.mp4';
  customFilename.value = `${base}_cut${ext}`;
  saveMode.value = 'saveAs';

  void loadSourceVideo();
};

watch(
  () => [props.visible, props.sourcePath] as const,
  ([vis, src]) => {
    if (vis && src) {
      initWorkbench();
    } else if (!vis) {
      loadSessionId++;
      stopSegmentPlaying();
      releaseVideoMedia();
    }
  },
  { immediate: true }
);

const onLoadedMetadata = () => {
  const vid = videoRef.value;
  if (!vid) return;
  const dur = Number(vid.duration || 0);
  if (dur > 0) {
    duration.value = dur;
    syncInitialSegmentDuration(dur);
  }
};

const onVideoError = (e: Event) => {
  const target = e.target as HTMLVideoElement | null;
  if (!target?.getAttribute('src')) return;
  logger.error('VideoEdit', `Video load error: ${target.error?.message || 'unknown'}`);
  showMessage('视频加载失败', 'error');
};

const onTimeUpdate = () => {
  const vid = videoRef.value;
  if (!vid || isTrackDragging) return;
  currentTime.value = vid.currentTime || 0;
  checkSegmentPlaybackEnd(currentTime.value);
};

const onEnded = () => {
  isPlaying.value = false;
  stopSegmentPlaying();
};

const togglePlay = () => {
  const vid = videoRef.value;
  if (!vid) return;
  stopSegmentPlaying();
  if (vid.paused || vid.ended) {
    vid.play().catch(() => {});
  } else {
    vid.pause();
  }
};

const seekTo = (target: number) => {
  const vid = videoRef.value;
  if (!vid) return;
  const maxDur = duration.value > 0 ? duration.value : (vid.duration || 0);
  if (!isFinite(maxDur) || maxDur <= 0) return;
  const clamped = Math.max(0, Math.min(maxDur, target));
  vid.currentTime = clamped;
  currentTime.value = clamped;
};

const seekBy = (delta: number) => {
  stopSegmentPlaying();
  const base = videoRef.value ? videoRef.value.currentTime : currentTime.value;
  seekTo(base + delta);
};

const startHoldSeek = (dir: -1 | 1, e: MouseEvent) => {
  if (e.button !== 0) return;
  stopHoldSeek();
  const step = activeStepSpec.value.step;
  seekBy(dir * step);
  holdTimer = window.setTimeout(() => {
    holdInterval = window.setInterval(() => {
      seekBy(dir * activeStepSpec.value.step);
    }, 100);
  }, 200);
};

const stopHoldSeek = () => {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  if (holdInterval !== null) {
    clearInterval(holdInterval);
    holdInterval = null;
  }
};

const seekFromPointer = (clientX: number) => {
  const track = trackRef.value;
  if (!track || duration.value <= 0) return;
  const rect = track.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  seekTo(ratio * duration.value);
};

const onTrackPointerDown = (e: PointerEvent) => {
  if (e.button !== 0 || duration.value <= 0) return;
  isTrackDragging = true;
  stopSegmentPlaying();
  try {
    trackRef.value?.setPointerCapture(e.pointerId);
  } catch {}
  seekFromPointer(e.clientX);
};

const onTrackPointerMove = (e: PointerEvent) => {
  if (!isTrackDragging) return;
  seekFromPointer(e.clientX);
};

const onTrackPointerUp = (e: PointerEvent) => {
  if (!isTrackDragging) return;
  isTrackDragging = false;
  try {
    trackRef.value?.releasePointerCapture(e.pointerId);
  } catch {}
};

const SPEED_OPTIONS = [1, 1.5, 2, 3];
const cycleSpeed = () => {
  const idx = SPEED_OPTIONS.indexOf(playbackRate.value);
  const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
  playbackRate.value = next;
  if (videoRef.value) videoRef.value.playbackRate = next;
};

const toggleMute = () => {
  isMuted.value = !isMuted.value;
  if (videoRef.value) videoRef.value.muted = isMuted.value;
};

const onTimeInputCommit = (idx: number, field: 'start' | 'end', raw: string) => {
  const parsed = parseEditTime(raw);
  if (parsed === null) {
    showMessage('请输入有效的时间码，例如 00:12.5 或 01:05:20.0', 'warning');
    return;
  }
  const ok = updateSegmentTime(idx, field, parsed);
  if (!ok) {
    showMessage(field === 'start' ? '起点必须小于当前片段终点' : '终点必须大于当前片段起点', 'warning');
    return;
  }
  seekTo(parsed);
};

const onTimeInputEnter = (idx: number, field: 'start' | 'end', e?: Event) => {
  const input = e?.target as HTMLInputElement | null;
  if (input) {
    onTimeInputCommit(idx, field, input.value);
    input.blur();
  }
};

const handleConfirmExport = async () => {
  if (!props.sourcePath) return;
  const validSegs = editSegments.value.filter((s) => s.end > s.start + 0.1);
  if (validSegs.length === 0) {
    showMessage('请至少保留一个有效的剪辑片段', 'warning');
    return;
  }

  if (saveMode.value === 'replace') {
    const ok = await confirm({
      title: '确认覆盖保存原视频',
      message: '将使用当前标记的片段重新生成并替换原视频文件，此操作不可撤销。',
      confirmText: '确认覆盖',
      cancelText: '取消',
      type: 'danger'
    });
    if (!ok) return;
    startExport('replace');
    emit('edit-complete', { mode: 'replace', outputPath: props.sourcePath, sourcePath: props.sourcePath });
    close();
    return;
  }

  const trimmedName = customFilename.value.trim();
  if (!trimmedName) {
    showMessage('请输入输出文件名', 'warning');
    return;
  }
  const normSrc = props.sourcePath.replace(/\\/g, '/');
  const slashIdx = normSrc.lastIndexOf('/');
  const parentDir = slashIdx >= 0 ? normSrc.slice(0, slashIdx) : '';
  const safeName = trimmedName.replace(/[<>:"/\\|?*]/g, '_');
  const outPath = parentDir ? `${parentDir}/${safeName}` : safeName;
  startExport('saveAs', outPath);
  emit('edit-complete', { mode: 'saveAs', outputPath: outPath, sourcePath: props.sourcePath });
  close();
};

const close = () => {
  stopSegmentPlaying();
  releaseVideoMedia();
  emit('update:visible', false);
};

// ==========================================
// 统一快捷键与修饰键动态步长联动
// ==========================================
const syncModifierState = (e: KeyboardEvent) => {
  if (!props.visible) return;
  activeStepSpec.value = resolveStepByModifiers(e);
};

const syncPointerModifiers = (e: MouseEvent | PointerEvent) => {
  if (!props.visible) return;
  const next = resolveStepByModifiers(e);
  if (next.modifier !== activeStepSpec.value.modifier) {
    activeStepSpec.value = next;
  }
};

const resetModifierState = () => {
  activeStepSpec.value = { step: 1, label: '1s', modifier: '' };
};

const handleVisibilityChange = () => {
  if (document.hidden) resetModifierState();
};

const handleKeydown = (e: KeyboardEvent) => {
  if (!props.visible) return;
  syncModifierState(e);

  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }

  // 若存在确认弹窗（如覆盖保存确认），不抢占键盘
  if (confirmState.isVisible) {
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
    return;
  }

  if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft') {
    e.preventDefault();
    seekBy(-resolveStepByModifiers(e).step);
    return;
  }

  if (e.key === 'ArrowRight' || e.code === 'ArrowRight') {
    e.preventDefault();
    seekBy(resolveStepByModifiers(e).step);
    return;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'm') {
    e.preventDefault();
    toggleMute();
  } else if (key === 'z') {
    e.preventDefault();
    setCurrentAsStart();
  } else if (key === 'c') {
    e.preventDefault();
    setCurrentAsEnd();
  } else if (key === 'x') {
    e.preventDefault();
    handleAddSegment();
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
};

const handleKeyup = (e: KeyboardEvent) => {
  if (!props.visible) return;
  syncModifierState(e);
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  window.addEventListener('blur', resetModifierState);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keyup', handleKeyup);
  window.removeEventListener('blur', resetModifierState);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  stopHoldSeek();
  releaseVideoMedia();
});
</script>

<style scoped lang="less">
.video-edit-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2500;
  padding: 20px;
}

.video-edit-workbench {
  width: min(1120px, 94vw);
  height: min(680px, 88vh);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workbench-header {
  height: 46px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text-primary);
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.help-trigger-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;

  &:hover .shortcuts-popover {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
}

.shortcuts-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 288px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: var(--shadow-soft);
  z-index: 30;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.popover-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}

.shortcut-grid {
  display: grid;
  grid-template-columns: 1fr auto;
  row-gap: 6px;
  column-gap: 10px;
  font-size: 11.5px;
  color: var(--text-secondary);
  align-items: center;

  .keys {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    justify-content: flex-end;
  }

  kbd {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 10.5px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--border-light);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  }
}

.workbench-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 344px;
  grid-template-rows: minmax(0, 1fr);
}

/* Left 65% Video Stage */
.workbench-stage {
  background: var(--bg-app);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

.stage-video-wrap {
  flex: 1;
  min-height: 0;
  background: #141517;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
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

.stage-hud-chip {
  position: absolute;
  top: 10px;
  left: 12px;
  background: rgba(18, 18, 17, 0.65);
  color: #f8f7f4;
  font-size: 11.5px;
  font-family: ui-monospace, Consolas, monospace;
  padding: 4px 9px;
  border-radius: 6px;
  pointer-events: none;
}

.stage-controls-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.timeline-track {
  position: relative;
  height: 24px;
  background: var(--border-light);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  user-select: none;
  touch-action: none;
}

.timeline-progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  pointer-events: none;
}

.timeline-segment-block {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  border: 1px solid var(--text-tertiary);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;

  &.is-active {
    background: color-mix(in srgb, var(--color-accent) 22%, transparent);
    border: 1.5px solid var(--color-accent);
  }
}

.timeline-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-accent);
  pointer-events: none;
  z-index: 4;
}

.stage-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.play-toggle-btn {
  width: 32px;
  padding: 0;
}

.step-btn {
  padding: 0 10px;
}

.modifier-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  font-size: 11px;
  line-height: 1;
  color: var(--text-secondary);
  background: var(--border-light);
  border: 1px solid var(--border-color);
  padding: 0 8px;
  border-radius: 6px;
  font-family: ui-monospace, Consolas, monospace;
  white-space: nowrap;
}

.timecode-text {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  margin-right: 4px;
}

.timecode-total {
  font-weight: 400;
  color: var(--text-secondary);
}

.speed-btn {
  padding: 0 9px;
  font-size: 11.5px;
}

/* Right 35% Fixed Inspector */
.workbench-inspector {
  border-left: 1px solid var(--border-color);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.inspector-mark-row {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-light);
  display: grid;
  grid-template-columns: 1fr 1fr 1.15fr;
  gap: 6px;
  flex-shrink: 0;

  .mark-btn {
    padding: 0 8px;
    gap: 5px;
    font-size: 12.5px;
    line-height: 1;
  }

  .mark-label {
    display: inline-flex;
    align-items: center;
    line-height: 1;
    transform: translateY(-0.5px);
  }
}

.inspector-list-header {
  padding: 10px 14px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;

  strong {
    color: var(--text-primary);
  }
}

.inspector-segments {
  flex: 1 1 0%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.segment-card {
  border: 1px solid var(--border-color);
  background: var(--bg-app);
  border-radius: 8px;
  padding: 9px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.15s ease, background-color 0.15s ease;

  &:hover {
    border-color: var(--text-secondary);
  }

  &.is-selected {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
    background: var(--bg-surface);
  }
}

.segment-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.segment-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.segment-card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.seg-mini-btn {
  width: 24px;
  height: 24px;
}

.segment-time-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  width: 100%;

  :deep(.v-input) {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 5px 8px;
    font-size: 12px;
    text-align: center;
  }
}

.time-arrow {
  font-size: 12px;
  color: var(--text-tertiary);
}

.inspector-export-panel {
  padding: 12px 14px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-app);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.export-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.export-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.mono {
  font-family: ui-monospace, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
</style>
