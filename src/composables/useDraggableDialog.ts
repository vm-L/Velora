import { ref, onUnmounted } from 'vue';

export interface UseDraggableDialogOptions {
  initialX?: number;
  initialY?: number;
  dialogWidth?: number;
  dialogHeight?: number;
  boundToViewport?: boolean;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

/**
 * 弹窗拖拽及视口约束组合式函数
 */
export function useDraggableDialog(options: UseDraggableDialogOptions = {}) {
  const {
    dialogWidth = 460,
    dialogHeight = 480,
    boundToViewport = true,
    onInteractionStart,
    onInteractionEnd
  } = options;

  const calculateDefaultPosition = () => {
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const x = options.initialX !== undefined
      ? options.initialX
      : Math.max(20, Math.round((winWidth - dialogWidth) / 2));
    const y = options.initialY !== undefined
      ? options.initialY
      : Math.max(40, Math.round(winHeight * 0.15));
    return { x, y };
  };

  const position = ref(calculateDefaultPosition());
  const isDragging = ref(false);
  let dragOffset = { x: 0, y: 0 };

  const resetPosition = () => {
    position.value = calculateDefaultPosition();
  };

  const onDrag = (e: MouseEvent) => {
    if (!isDragging.value) return;
    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;

    if (boundToViewport) {
      if (newX < 0) newX = 0;
      if (newY < 0) newY = 0;
      if (newX + dialogWidth > window.innerWidth) {
        newX = Math.max(0, window.innerWidth - dialogWidth);
      }
      if (newY + dialogHeight > window.innerHeight) {
        newY = Math.max(0, window.innerHeight - dialogHeight);
      }
    }

    position.value = { x: newX, y: newY };
  };

  const stopDrag = () => {
    if (!isDragging.value) return;
    isDragging.value = false;
    onInteractionEnd?.();
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
  };

  const startDrag = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.action-btn, button, input, textarea, select')) return;
    isDragging.value = true;
    dragOffset = {
      x: e.clientX - position.value.x,
      y: e.clientY - position.value.y
    };
    onInteractionStart?.();
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', stopDrag);
  };

  onUnmounted(() => {
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
  });

  return {
    position,
    isDragging,
    startDrag,
    stopDrag,
    resetPosition
  };
}
