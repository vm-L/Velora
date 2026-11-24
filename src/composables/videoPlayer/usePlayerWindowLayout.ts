import { ref, type Ref } from 'vue';
import { logger } from '@/services/logger';
import { EDIT_DOCK_HEIGHT } from '@/composables/videoPlayer/types';

export interface UsePlayerWindowLayoutOptions {
  dialogRef: Ref<HTMLElement | null>;
  videoRef: Ref<HTMLVideoElement | null>;
  getPlaybackState: () => { isPlaying: boolean; isSeeking: boolean; videoRatio: number | null };
  onEditModeEnter: () => void;
  onEditModeExit: () => void;
}

/**
 * 视频播放器浮窗拖拽、等比缩放、听视频/编辑模式尺寸切换、全屏及鼠标显隐控制
 */
export function usePlayerWindowLayout(options: UsePlayerWindowLayoutOptions) {
  const { dialogRef, videoRef, getPlaybackState, onEditModeEnter, onEditModeExit } = options;

  const position = ref({ x: window.innerWidth / 2 - 320, y: window.innerHeight / 2 - 180 });
  const size = ref({ w: 640, h: 360 });
  const zIndex = ref(2000);
  const isDraggingWindow = ref(false);
  const isResizing = ref(false);
  let startPos = { x: 0, y: 0 };
  let startSize = { w: 0, h: 0 };
  let startMouse = { x: 0, y: 0 };

  const isFullscreen = ref(false);
  const isInAppFullscreen = ref(false);
  const showControls = ref(false);
  const isMouseInVideoArea = ref(false);
  const isHoveringControls = ref(false);
  const hideCursor = ref(false);

  const isAudioMode = ref(false);
  const isEditingMode = ref(false);
  const prevVideoLayout = ref<{ position: { x: number; y: number }; size: { w: number; h: number } } | null>(null);
  const prevEditLayout = ref<{ position: { x: number; y: number }; size: { w: number; h: number } } | null>(null);

  let controlsTimeout: number | null = null;
  let cursorTimeout: number | null = null;

  const bringToFront = () => {
    zIndex.value = 2000 + Date.now() % 1000;
  };

  const resetControlsTimeout = () => {
    if (controlsTimeout) clearTimeout(controlsTimeout);
    const { isSeeking } = getPlaybackState();
    if (isHoveringControls.value || isSeeking || isAudioMode.value) return;
    controlsTimeout = window.setTimeout(() => {
      const latest = getPlaybackState();
      if (latest.isPlaying && !isHoveringControls.value && !latest.isSeeking) {
        showControls.value = false;
      }
    }, 2000);
  };

  const resetCursorTimeout = () => {
    if (cursorTimeout) clearTimeout(cursorTimeout);
    hideCursor.value = false;
    const { isPlaying, isSeeking } = getPlaybackState();
    if (isPlaying && !isSeeking && !isAudioMode.value) {
      cursorTimeout = window.setTimeout(() => {
        const latest = getPlaybackState();
        if (latest.isPlaying && !latest.isSeeking) {
          hideCursor.value = true;
        }
      }, 1500);
    }
  };

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
    if (!getPlaybackState().isSeeking) {
      showControls.value = false;
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

  const startDrag = (e: MouseEvent) => {
    if (isFullscreen.value || isInAppFullscreen.value) return;
    if ((e.target as HTMLElement)?.closest('.header-actions, button, input, select')) return;
    isDraggingWindow.value = true;
    if (getPlaybackState().isPlaying && !isAudioMode.value && !isEditingMode.value) showControls.value = false;
    startPos = { x: position.value.x, y: position.value.y };
    startMouse = { x: e.clientX, y: e.clientY };
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const resolveAspectRatio = (isEdit: boolean): number => {
    let ratio = getPlaybackState().videoRatio;
    if (!ratio || isNaN(ratio) || ratio <= 0) {
      if (videoRef.value && videoRef.value.videoWidth && videoRef.value.videoHeight) {
        ratio = videoRef.value.videoWidth / videoRef.value.videoHeight;
      }
    }
    if (!ratio || isNaN(ratio) || ratio <= 0) {
      const baseH = isEdit ? Math.max(1, startSize.h - EDIT_DOCK_HEIGHT) : Math.max(1, startSize.h);
      ratio = startSize.w / baseH;
    }
    if (!ratio || isNaN(ratio) || ratio <= 0) {
      ratio = 16 / 9;
    }
    return ratio;
  };

  const onResize = (e: MouseEvent) => {
    if (!isResizing.value) return;
    const dx = e.clientX - startMouse.x;
    const dy = e.clientY - startMouse.y;
    const ratio = resolveAspectRatio(isEditingMode.value);
    const deltaW = (dx + dy * ratio) / 2;

    if (isEditingMode.value) {
      const newW = Math.max(460, Math.round(startSize.w + deltaW));
      const newVideoH = Math.max(200, Math.round(newW / ratio));
      const newH = newVideoH + EDIT_DOCK_HEIGHT;

      if (!isNaN(newW) && !isNaN(newH) && newW > 0 && newH > 0) {
        size.value = { w: newW, h: newH };
      }
      return;
    }

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

  const startResize = (e: MouseEvent) => {
    if (isFullscreen.value || isInAppFullscreen.value || isAudioMode.value) return;
    e.preventDefault();
    e.stopPropagation();
    isResizing.value = true;
    if (getPlaybackState().isPlaying && !isEditingMode.value) showControls.value = false;
    startSize = { w: size.value.w, h: size.value.h };
    startMouse = { x: e.clientX, y: e.clientY };
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
  };

  const applyMetadataWindowSize = (vw: number, vh: number) => {
    if (!vw || !vh || isAudioMode.value || isEditingMode.value) return;
    const ratio = vw / vh;
    const targetW = ratio < 1 ? 440 : Math.min(680, Math.round(window.innerWidth * 0.55));
    const finalW = Math.max(440, targetW);
    const finalH = Math.round(finalW / ratio);

    size.value = { w: finalW, h: finalH };
    position.value = {
      x: Math.max(0, Math.round((window.innerWidth - finalW) / 2)),
      y: Math.max(0, Math.round((window.innerHeight - finalH) / 2))
    };
  };

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
      onEditModeEnter();
    } else {
      isEditingMode.value = false;
      onEditModeExit();
      if (prevEditLayout.value) {
        size.value = { ...prevEditLayout.value.size };
        position.value = { ...prevEditLayout.value.position };
        prevEditLayout.value = null;
      }
    }
  };

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

  const handleFullscreenChange = () => {
    isFullscreen.value = !!document.fullscreenElement;
  };

  const cleanupWindowLayout = () => {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
    if (controlsTimeout !== null) {
      clearTimeout(controlsTimeout);
      controlsTimeout = null;
    }
    if (cursorTimeout !== null) {
      clearTimeout(cursorTimeout);
      cursorTimeout = null;
    }
  };

  return {
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
  };
}
