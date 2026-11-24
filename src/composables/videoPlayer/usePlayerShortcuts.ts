import type { Ref } from 'vue';

export interface UsePlayerShortcutsOptions {
  dialogRef: Ref<HTMLElement | null>;
  zIndex: Ref<number>;
  isAudioMode: Ref<boolean>;
  isEditingMode: Ref<boolean>;
  isFullscreen: Ref<boolean>;
  isInAppFullscreen: Ref<boolean>;
  showOverwriteConfirm: Ref<boolean>;
  activeSegmentIndex: Ref<number>;
  togglePlay: () => void;
  seekBy: (delta: number) => void;
  changeVolume: (delta: number) => void;
  toggleFullscreen: () => Promise<void> | void;
  toggleMute: () => void;
  setCurrentAsStart: () => void;
  setCurrentAsEnd: () => void;
  addSegment: () => void;
  seekToSegmentStart: () => void;
  seekToSegmentEnd: () => void;
  togglePreviewSegment: (idx: number) => void;
  selectPrevSegment: () => void;
  selectNextSegment: () => void;
  removeSegment: (idx: number) => void;
}

/**
 * 视频播放器全局快捷键调度与多浮窗层级仲裁逻辑
 */
export function usePlayerShortcuts(options: UsePlayerShortcutsOptions) {
  const {
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
  } = options;

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    if (e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable) return;

    // 1. 若当前存在更高层级的独立模态框且焦点不在当前播放器内，不拦截按键
    const activeModal = document.querySelector('.modal-overlay, .confirm-modal, .v-modal-overlay, .dialog-mask');
    if (activeModal && !dialogRef.value?.contains(e.target as Node)) {
      return;
    }

    // 2. 若存在其他浮窗处于更高层级，且当前播放器未包含激活焦点，不抢占快捷键
    const myZ = zIndex.value;
    const floatingDialogs = document.querySelectorAll('.video-player-dialog, .audio-player-dialog, .image-preview-dialog');
    for (const el of floatingDialogs) {
      if (el !== dialogRef.value) {
        const otherZ = parseInt((el as HTMLElement).style.zIndex || '0', 10);
        if (otherZ > myZ && !dialogRef.value?.contains(document.activeElement)) {
          return;
        }
      }
    }

    // 3. 若用户焦点在外部按钮或可点击控件上，Space 键优先由该控件原生触发，不拦截
    if (e.code === 'Space' && e.target && e.target !== document.body && !dialogRef.value?.contains(e.target as Node)) {
      if ((e.target as HTMLElement)?.closest('button, a, [role="button"]')) {
        return;
      }
    }

    if (e.key === 'Escape') {
      if (showOverwriteConfirm.value) {
        showOverwriteConfirm.value = false;
        return;
      }
      if (isFullscreen.value || isInAppFullscreen.value) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
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

  return {
    handleKeydown
  };
}
