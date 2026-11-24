import { ref, computed, type ComputedRef, type Ref } from 'vue';
import { useMessage } from '@/composables/useMessage';
import type { PanFileItem, ShareResultData } from '@/composables/pan/types';

export interface UsePanModalsOptions {
  panType: () => string;
  currentPdirFid: ComputedRef<string>;
  currentFiles: Ref<PanFileItem[]>;
  selectedIds: Ref<string[]>;
  clearSelection: () => void;
  loadCurrentDirectory: (forceQuota?: boolean) => Promise<void>;
}

/**
 * 网盘新建文件夹、重命名、移动目录选择与创建分享弹窗状态及提交逻辑
 */
export function usePanModals(options: UsePanModalsOptions) {
  const {
    panType,
    currentPdirFid,
    currentFiles,
    selectedIds,
    clearSelection,
    loadCurrentDirectory
  } = options;

  const { showMessage } = useMessage();

  const isModalSubmitting = ref(false);

  const showNewFolderModal = ref(false);
  const newFolderNameInput = ref('');

  const showRenameModal = ref(false);
  const renameTargetFile = ref<PanFileItem | null>(null);
  const renameInput = ref('');

  const showMoveModal = ref(false);
  const moveTargetFiles = ref<PanFileItem[]>([]);
  const moveExcludeIds = computed(() => moveTargetFiles.value.filter(f => f.isDirectory).map(f => f.id));

  const showShareModal = ref(false);
  const shareTargetFiles = ref<PanFileItem[]>([]);
  const shareExpireType = ref<number>(3);
  const sharePasscodeInput = ref('');
  const shareResult = ref<ShareResultData | null>(null);

  const shareTargetSummary = computed(() => {
    if (shareTargetFiles.value.length === 0) return '';
    if (shareTargetFiles.value.length === 1) return shareTargetFiles.value[0].name;
    return `${shareTargetFiles.value[0].name} 等 ${shareTargetFiles.value.length} 项`;
  });

  const shareExpireOptions = computed(() => {
    if (panType() === '115') {
      return [
        { value: 101, label: '永久有效' },
        { value: 102, label: '1 天' },
        { value: 103, label: '3 天' },
        { value: 104, label: '7 天' },
        { value: 105, label: '15 天' }
      ];
    }
    return [
      { value: 1, label: '永久有效' },
      { value: 2, label: '1 天' },
      { value: 3, label: '7 天' },
      { value: 4, label: '30 天' }
    ];
  });

  const openNewFolderModal = () => {
    newFolderNameInput.value = '';
    showNewFolderModal.value = true;
  };

  const closeNewFolderModal = () => {
    showNewFolderModal.value = false;
    newFolderNameInput.value = '';
  };

  const submitNewFolder = async () => {
    const name = newFolderNameInput.value.trim();
    if (!name || isModalSubmitting.value || !window.electronAPI?.createPanFolder) return;
    isModalSubmitting.value = true;
    try {
      const res = await window.electronAPI.createPanFolder({
        type: panType(),
        parentFid: currentPdirFid.value,
        name
      });
      if (res && res.success) {
        showMessage(`已创建文件夹「${name}」`, 'success');
        closeNewFolderModal();
        loadCurrentDirectory(true);
      } else {
        showMessage(res?.error || '创建文件夹未成功', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message ? `创建失败: ${err.message}` : '创建失败', 'error');
    } finally {
      isModalSubmitting.value = false;
    }
  };

  const openRenameModal = (file: PanFileItem) => {
    renameTargetFile.value = file;
    renameInput.value = file.name;
    showRenameModal.value = true;
  };

  const closeRenameModal = () => {
    showRenameModal.value = false;
    renameTargetFile.value = null;
    renameInput.value = '';
  };

  const submitRename = async () => {
    const target = renameTargetFile.value;
    const newName = renameInput.value.trim();
    if (!target || !newName || isModalSubmitting.value || !window.electronAPI?.renamePanItem) return;
    if (newName === target.name) {
      closeRenameModal();
      return;
    }
    isModalSubmitting.value = true;
    try {
      const res = await window.electronAPI.renamePanItem({
        type: panType(),
        fid: target.id,
        newName,
        isDirectory: target.isDirectory
      });
      if (res && res.success) {
        showMessage(`已重命名为「${newName}」`, 'success');
        closeRenameModal();
        loadCurrentDirectory(true);
      } else {
        showMessage(res?.error || '重命名未成功', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message ? `重命名失败: ${err.message}` : '重命名失败', 'error');
    } finally {
      isModalSubmitting.value = false;
    }
  };

  const openMoveModal = (files: PanFileItem[]) => {
    if (files.length === 0) return;
    moveTargetFiles.value = files;
    showMoveModal.value = true;
  };

  const openMoveBatchModal = () => {
    const files = currentFiles.value.filter(f => selectedIds.value.includes(f.id));
    openMoveModal(files);
  };

  const handleConfirmMove = async (targetFid: string, targetName: string) => {
    showMoveModal.value = false;
    if (moveTargetFiles.value.length === 0 || !window.electronAPI?.movePanItems) return;
    if (targetFid === currentPdirFid.value) {
      showMessage('目标文件夹与当前所在目录相同', 'info');
      return;
    }
    try {
      const res = await window.electronAPI.movePanItems({
        type: panType(),
        fids: moveTargetFiles.value.map(f => f.id),
        targetDirFid: targetFid
      });
      if (res && res.success) {
        showMessage(`已移动到「${targetName}」`, 'success');
        clearSelection();
        loadCurrentDirectory(true);
      } else {
        showMessage(res?.error || '移动未成功', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message ? `移动失败: ${err.message}` : '移动失败', 'error');
    }
  };

  const openShareModal = (files: PanFileItem[]) => {
    if (files.length === 0) return;
    const type = panType();
    shareTargetFiles.value = files;
    shareExpireType.value = type === '115' ? 104 : type === 'lanzou' ? 1 : 3;
    sharePasscodeInput.value = '';
    shareResult.value = null;
    showShareModal.value = true;
  };

  const openShareBatchModal = () => {
    const files = currentFiles.value.filter(f => selectedIds.value.includes(f.id));
    openShareModal(files);
  };

  const closeShareModal = () => {
    showShareModal.value = false;
    shareTargetFiles.value = [];
    sharePasscodeInput.value = '';
    shareResult.value = null;
  };

  const submitCreateShare = async () => {
    if (shareTargetFiles.value.length === 0 || isModalSubmitting.value || !window.electronAPI?.createPanShare) {
      return;
    }
    isModalSubmitting.value = true;
    try {
      const type = panType();
      const passcode = ['115', '139', 'lanzou'].includes(type)
        ? ''
        : sharePasscodeInput.value.trim();
      const res = await window.electronAPI.createPanShare({
        type,
        params: {
          fids: shareTargetFiles.value.map(f => f.id),
          fidsInfo: shareTargetFiles.value.map(f => ({
            fid: f.id,
            isDirectory: f.isDirectory
          })),
          expireType: shareExpireType.value,
          ...(passcode ? { passcode } : {})
        }
      });
      if (res && res.success && res.data) {
        shareResult.value = res.data;
      } else {
        showMessage(res?.error || '生成分享链接未成功', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message ? `创建分享失败: ${err.message}` : '创建分享失败', 'error');
    } finally {
      isModalSubmitting.value = false;
    }
  };

  const copyShareResult = async () => {
    if (!shareResult.value?.shareUrl) return;
    const text = shareResult.value.passcode
      ? `链接: ${shareResult.value.shareUrl}\n提取码: ${shareResult.value.passcode}`
      : shareResult.value.shareUrl;
    try {
      await navigator.clipboard.writeText(text);
      showMessage('分享链接已复制到剪贴板', 'success');
    } catch {
      showMessage('无法写入剪贴板，请手动复制', 'error');
    }
  };

  const resetAllModals = () => {
    closeNewFolderModal();
    closeRenameModal();
    showMoveModal.value = false;
    closeShareModal();
  };

  return {
    isModalSubmitting,
    showNewFolderModal,
    newFolderNameInput,
    showRenameModal,
    renameInput,
    showMoveModal,
    moveTargetFiles,
    moveExcludeIds,
    showShareModal,
    shareTargetFiles,
    shareExpireType,
    sharePasscodeInput,
    shareResult,
    shareTargetSummary,
    shareExpireOptions,
    openNewFolderModal,
    closeNewFolderModal,
    submitNewFolder,
    openRenameModal,
    closeRenameModal,
    submitRename,
    openMoveModal,
    openMoveBatchModal,
    handleConfirmMove,
    openShareModal,
    openShareBatchModal,
    closeShareModal,
    submitCreateShare,
    copyShareResult,
    resetAllModals
  };
}
