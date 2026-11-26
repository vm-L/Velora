import type { Ref } from 'vue';
import { resolveStepByModifiers } from '@/composables/videoPlayer/types';

export interface UsePlayerShortcutsOptions {
  dialogRef: Ref<HTMLElement | null>;
  zIndex: Ref<number>;
  isAudioMode: Ref<boolean>;
  isFullscreen: Ref<boolean>;
  isInAppFullscreen: Ref<boolean>;
  togglePlay: () => void;
  seekBy: (delta: number) => void;
  changeVolume: (delta: number) => void;
  toggleFullscreen: () => Promise<void> | void;
  toggleMute: () => void;
  captureScreenshot?: () => Promise<void> | void;
}

/**
 * 视频播放器全局快捷键调度与多浮窗层级仲裁逻辑
 */
export function usePlayerShortcuts(options: UsePlayerShortcutsOptions) {
  const {
    dialogRef,
    zIndex,
    isAudioMode,
    isFullscreen,
    isInAppFullscreen,
    togglePlay,
    seekBy,
    changeVolume,
    toggleFullscreen,
    toggleMute,
    captureScreenshot
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
      const { step } = resolveStepByModifiers(e);
      seekBy(-step);
    } else if (e.key === 'ArrowRight' || e.code === 'ArrowRight') {
      e.preventDefault();
      const { step } = resolveStepByModifiers(e);
      seekBy(step);
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
    } else if (e.key === 'p' || e.key === 'P' || e.code === 'KeyP') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !isAudioMode.value && captureScreenshot) {
        e.preventDefault();
        captureScreenshot();
      }
    } else if (e.key === 'm' || e.key === 'M' || e.code === 'KeyM') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleMute();
      }
    }
  };

  return {
    handleKeydown
  };
}
