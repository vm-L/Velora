import { ref } from 'vue';

export interface SaveMediaDialogOptions {
  url: string;
  defaultName: string;
  defaultDir: string;
  type: 'audio' | 'video' | 'image' | 'file';
  nameOptions?: string[];
  urlOptions?: string[];
  pageUrl?: string;
}

export interface SaveMediaDialogItem extends SaveMediaDialogOptions {
  id: string;
  x: number;
  y: number;
  zIndex: number;
  isHighlighted?: boolean;
}

const dialogs = ref<SaveMediaDialogItem[]>([]);
let highestZIndex = 2000;
const isDraggingAnyDialog = ref(false);

export const useSaveMediaDialog = () => {
  const focusDialog = (id: string) => {
    const dialog = dialogs.value.find(d => d.id === id);
    if (dialog) {
      highestZIndex++;
      dialog.zIndex = highestZIndex;
    }
  };

  const openSaveMediaDialog = (options: SaveMediaDialogOptions): string => {
    // 1. 检查是否存在完全相同目标 URL 的打开中的弹窗
    const existing = dialogs.value.find(d => d.url === options.url);
    if (existing) {
      focusDialog(existing.id);
      existing.isHighlighted = true;
      setTimeout(() => {
        existing.isHighlighted = false;
      }, 600);
      return existing.id;
    }

    // 2. 计算初始居中与阶梯级联坐标
    highestZIndex++;
    const id = 'save_dialog_' + Math.random().toString(36).substring(2, 9);
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    const baseWidth = 420;
    const baseHeight = 360;
    const cascadeOffset = (dialogs.value.length % 8) * 30;

    let initX = Math.round((winWidth - baseWidth) / 2) + cascadeOffset;
    let initY = Math.round((winHeight - baseHeight) / 2) + cascadeOffset;

    // 边界钳制，确保不会出现在屏幕外
    initX = Math.max(20, Math.min(initX, winWidth - baseWidth - 20));
    initY = Math.max(20, Math.min(initY, winHeight - baseHeight - 40));

    dialogs.value.push({
      ...options,
      id,
      x: initX,
      y: initY,
      zIndex: highestZIndex,
      isHighlighted: false
    });

    return id;
  };

  const closeSaveMediaDialog = (id: string) => {
    dialogs.value = dialogs.value.filter(d => d.id !== id);
  };

  const updateDialogPosition = (id: string, x: number, y: number) => {
    const d = dialogs.value.find(item => item.id === id);
    if (d) {
      d.x = x;
      d.y = y;
    }
  };

  return {
    dialogs,
    isDraggingAnyDialog,
    openSaveMediaDialog,
    closeSaveMediaDialog,
    focusDialog,
    updateDialogPosition
  };
};
