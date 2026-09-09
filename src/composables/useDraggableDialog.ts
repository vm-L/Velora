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
    initialX = 100,
    initialY = 100,
    dialogWidth = 420,
    dialogHeight = 480,
    boundToViewport = true,
    onInteractionStart,
    onInteractionEnd
  } = options;

  const position = ref({ x: initialX, y: initialY });
  const isDragging = ref(false);
  let dragOffset = { x: 0, y: 0 };

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
    stopDrag
  };
}
