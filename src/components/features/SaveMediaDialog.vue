<template>
  <div
    v-if="visible"
    class="save-modal-window"
    :class="{ 'is-highlighted': isHighlighted, 'has-duplicate-warning': !!matchedExistingFile }"
    :style="{ top: position.y + 'px', left: position.x + 'px', zIndex: currentZIndex }"
    @mousedown="bringToFront"
    ref="dialogRef"
  >
    <div class="save-header" @mousedown="startDrag">
      <div class="header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>下载{{ typeName }}</span>
      </div>
      <button class="header-close-btn" @click.stop="close" title="关闭" type="button">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="save-body">
      <!-- 1. 文件名称 -->
      <div class="save-location-group">
        <label>文件名称</label>
        <div class="location-input-row">
          <VInputSelect
            v-model="fileName"
            placeholder="输入或选择文件名称"
            :options="computedNameOptions"
            class="flex-1"
          />
        </div>
        <!-- 相似已有文件防重提醒 -->
        <div v-if="matchedExistingFile" class="duplicate-file-alert" title="检测到下载目录树中已存在相似文件">
          <VIcon name="warning" :size="13" color="var(--color-warning, #f59e0b)" />
          <span class="duplicate-text">
            已存在相似文件：{{ matchedExistingFile.relativeDir !== '.' ? `[${matchedExistingFile.relativeDir}] ` : '' }}{{ matchedExistingFile.name }}
          </span>
        </div>
      </div>

      <!-- 2. 文件地址 -->
      <div class="save-location-group" style="margin-top: 16px;">
        <label>文件地址</label>
        <div class="location-input-row">
          <VInputSelect
            v-model="fileUrl"
            placeholder="输入或选择文件地址"
            :options="computedUrlOptions"
            class="flex-1"
          />
        </div>
      </div>

      <!-- 3. 下载目录 -->
      <div class="save-location-group" style="margin-top: 16px;">
        <div class="location-label-row">
          <label>下载目录</label>
          <span v-if="isAutoMatchedDir" class="auto-match-badge" title="已根据文件名自动匹配最佳子目录">
            <VIcon name="bot" :size="12" />
            <span>自动匹配</span>
          </span>
        </div>
        <div class="location-input-row">
          <VInputSelect
            :model-value="saveDirectory"
            @update:model-value="onUserChangeDirectory"
            placeholder="选择或输入下载目录"
            :options="dirTreeOptions"
            class="flex-1"
          />
          <v-button variant="secondary" class="select-dir-btn" @click="selectSaveDirectory">选择</v-button>
        </div>
      </div>
    </div>
    <div class="save-footer">
      <v-button variant="secondary" class="cancel-btn" @click="close" :disabled="isSaving">取消</v-button>
      <v-button variant="primary" class="confirm-btn" @click="confirmSave" :disabled="isSaving">
        {{ isSaving ? '下载中' : '确认下载' }}
      </v-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useDownloads } from '../../composables/useDownloads';
import { useMessage } from '../../composables/useMessage';
import { useSettings } from '../../composables/useSettings';
import { useSaveMediaDialog } from '../../composables/useSaveMediaDialog';
import VButton from '../base/VButton.vue';
import VIcon from '../base/VIcon.vue';
import VInputSelect, { type InputSelectOption } from '../base/VInputSelect.vue';
import { sanitizeFilename } from '../../utils/filename';
import { findBestMatchingSubdirectory } from '../../utils/dirMatcher';
import { isSimilarExistingFile } from '../../utils/similarity';

const props = withDefaults(defineProps<{
  visible?: boolean;
  id?: string;
  url: string;
  defaultName: string;
  defaultDir: string;
  type: string; // 'audio', 'video', 'image', 'file'
  nameOptions?: string[];
  urlOptions?: string[];
  pageUrl?: string;
  initialX?: number;
  initialY?: number;
  zIndex?: number;
  isHighlighted?: boolean;
}>(), {
  visible: true,
  initialX: 0,
  initialY: 0,
  zIndex: 2000,
  isHighlighted: false
});

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'saved'): void;
  (e: 'close'): void;
  (e: 'focus'): void;
  (e: 'updatePosition', pos: { x: number; y: number }): void;
}>();

const { addDownload } = useDownloads();
const { showMessage } = useMessage();
const { state: settingsState } = useSettings();
const { isDraggingAnyDialog } = useSaveMediaDialog();

const dialogRef = ref<HTMLElement | null>(null);
const saveDirectory = ref('');
const fileUrl = ref('');
const fileName = ref('');
const isSaving = ref(false);
const dirTreeList = ref<Array<{ path: string, name: string, depth: number }>>([]);
// 下载目录树中的已有文件列表
const existingMediaFiles = ref<Array<{ name: string; path: string; dir: string; relativeDir: string }>>([]);
// 命中的相似已有文件
const matchedExistingFile = ref<{ name: string; path: string; dir: string; relativeDir: string } | null>(null);

// 智能子目录匹配状态管理
const isAutoMatchedDir = ref(false);
const isUserManualDir = ref(false);
const autoMatchedPath = ref('');

const currentZIndex = computed(() => props.zIndex || 2000);
const position = ref({ x: props.initialX, y: props.initialY });
const isDragging = ref(false);
let startPos = { x: 0, y: 0 };
let startMouse = { x: 0, y: 0 };

const computedNameOptions = computed<InputSelectOption[]>(() => {
  return (props.nameOptions || []).map(n => ({ label: n, value: n }));
});

const computedUrlOptions = computed<InputSelectOption[]>(() => {
  const list = props.urlOptions && props.urlOptions.length > 0 ? props.urlOptions : (props.url ? [props.url] : []);
  return list.map(u => ({ label: u, value: u }));
});

const dirTreeOptions = computed<InputSelectOption[]>(() => {
  return dirTreeList.value.map(item => ({
    label: item.name,
    value: item.path,
    depth: item.depth
  }));
});

// 核心：子目录名称与文件名的智能单字打分匹配算法
const matchBestSubdirectory = (currentFileName: string) => {
  if (!settingsState.autoMatchDownloadSubdir || isUserManualDir.value) return;
  if (!dirTreeList.value || dirTreeList.value.length === 0) return;

  const bestMatch = findBestMatchingSubdirectory(currentFileName, dirTreeList.value, { threshold: 2 });

  if (bestMatch) {
    saveDirectory.value = bestMatch.item.path;
    autoMatchedPath.value = bestMatch.item.path;
    isAutoMatchedDir.value = true;
  } else {
    // 未达到匹配门槛或未匹配到任何子目录时，自动回退保持根下载目录
    if (!isUserManualDir.value) {
      saveDirectory.value = props.defaultDir;
      autoMatchedPath.value = '';
      isAutoMatchedDir.value = false;
    }
  }
};

// 检查是否存在高度相似的已有文件
const checkDuplicateExistingFile = (currentFileName: string) => {
  if (!currentFileName || existingMediaFiles.value.length === 0) {
    matchedExistingFile.value = null;
    return;
  }
  for (const file of existingMediaFiles.value) {
    if (isSimilarExistingFile(file.name, currentFileName)) {
      matchedExistingFile.value = file;
      return;
    }
  }
  matchedExistingFile.value = null;
};

const loadDirTree = async () => {
  if (props.defaultDir && window.electronAPI) {
    try {
      if (window.electronAPI.getDirectoryTree) {
        const list = await window.electronAPI.getDirectoryTree(props.defaultDir, 3);
        dirTreeList.value = list;
        // 目录树扫描完成后，立即根据初始文件名执行初次自动匹配
        if (!isUserManualDir.value && settingsState.autoMatchDownloadSubdir) {
          matchBestSubdirectory(fileName.value);
        }
      }
      // 同步扫描下载目录树下的已有文件以进行相似度查重
      if (window.electronAPI.scanDirectoryMediaFiles) {
        const files = await window.electronAPI.scanDirectoryMediaFiles(props.defaultDir, 3);
        existingMediaFiles.value = files || [];
        checkDuplicateExistingFile(fileName.value);
      }
    } catch {
      dirTreeList.value = [];
      existingMediaFiles.value = [];
    }
  }
};

const typeName = computed(() => {
  switch (props.type) {
    case 'audio': return '音频';
    case 'video': return '视频';
    case 'image': return '图片';
    default: return '文件';
  }
});

const getExtension = (urlOrName: string) => {
  const match = urlOrName.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
  return match ? match[1] : '';
};

const initData = () => {
  isUserManualDir.value = false;
  isAutoMatchedDir.value = false;
  autoMatchedPath.value = '';

  saveDirectory.value = props.defaultDir;
  fileUrl.value = props.url || (props.urlOptions && props.urlOptions[0]) || '';
  loadDirTree();

  let rawName = props.defaultName || 'video';
  const ext = getExtension(rawName);
  let baseName = rawName;
  if (ext && rawName.endsWith('.' + ext)) {
    baseName = rawName.slice(0, -(ext.length + 1));
  }

  // 清除残留的 .m3u8 或 .ts
  baseName = baseName.replace(/\.(m3u8|ts)$/i, '');

  // 决定最终拓展名
  let targetExt = ext;
  const targetUrl = fileUrl.value.toLowerCase();
  if (props.type === 'video' || targetUrl.includes('.m3u8') || ext.toLowerCase() === 'm3u8' || ext.toLowerCase() === 'ts') {
    targetExt = 'mp4';
  } else if (props.type === 'audio') {
    targetExt = targetExt || 'mp3';
  }

  if (targetExt) {
    fileName.value = `${baseName}.${targetExt}`;
  } else {
    fileName.value = baseName;
  }
  isSaving.value = false;
};

onMounted(() => {
  if (!props.initialX && !props.initialY && typeof window !== 'undefined') {
    position.value = {
      x: Math.max(20, Math.round((window.innerWidth - 420) / 2)),
      y: Math.max(20, Math.round((window.innerHeight - 360) / 2))
    };
  } else {
    position.value = { x: props.initialX, y: props.initialY };
  }
  initData();
});

// 文件名修改时实时联动重新计算最佳子目录与已有文件防重检查
watch(fileName, (newVal) => {
  if (!isUserManualDir.value && settingsState.autoMatchDownloadSubdir) {
    matchBestSubdirectory(newVal);
  }
  checkDuplicateExistingFile(newVal);
});

watch(() => props.url, () => {
  initData();
});

const bringToFront = () => {
  emit('focus');
};

const startDrag = (e: MouseEvent) => {
  if (e.button !== 0) return;
  isDragging.value = true;
  isDraggingAnyDialog.value = true;
  bringToFront();
  startPos = { x: position.value.x, y: position.value.y };
  startMouse = { x: e.clientX, y: e.clientY };
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const dx = e.clientX - startMouse.x;
  const dy = e.clientY - startMouse.y;
  let nextX = startPos.x + dx;
  let nextY = startPos.y + dy;

  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;
  const dialogWidth = dialogRef.value?.offsetWidth || 420;

  // 边界保护：左右保留至少 80px 在屏幕内，顶部不小于 0，底部保留至少 60px
  nextX = Math.max(80 - dialogWidth, Math.min(nextX, winWidth - 80));
  nextY = Math.max(0, Math.min(nextY, winHeight - 60));

  position.value = { x: nextX, y: nextY };
};

const stopDrag = () => {
  if (!isDragging.value) return;
  isDragging.value = false;
  isDraggingAnyDialog.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  emit('updatePosition', position.value);
};

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  if (isDragging.value) {
    isDraggingAnyDialog.value = false;
  }
});

const close = () => {
  emit('update:visible', false);
  emit('close');
};

// 用户手动输入或选择目录时的响应与意图锁定
const onUserChangeDirectory = (val: string) => {
  saveDirectory.value = val;
  if (val !== autoMatchedPath.value) {
    isUserManualDir.value = true;
    isAutoMatchedDir.value = false;
  } else {
    isAutoMatchedDir.value = true;
  }
};

const selectSaveDirectory = async () => {
  if (window.electronAPI && window.electronAPI.selectDirectory) {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      saveDirectory.value = dir;
      if (dir !== autoMatchedPath.value) {
        isUserManualDir.value = true;
        isAutoMatchedDir.value = false;
      }
    }
  }
};

const confirmSave = async () => {
  if (!saveDirectory.value) {
    showMessage('请先选择下载目录', 'error');
    return;
  }
  if (!fileUrl.value.trim()) {
    showMessage('文件地址不能为空', 'error');
    return;
  }
  if (!fileName.value.trim()) {
    showMessage('文件名称不能为空', 'error');
    return;
  }

  let targetUrl = fileUrl.value.trim();
  let finalName = sanitizeFilename(fileName.value.trim());
  let targetExt = getExtension(props.defaultName) || getExtension(targetUrl);
  if (props.type === 'video' || targetUrl.toLowerCase().includes('.m3u8') || targetExt.toLowerCase() === 'm3u8' || targetExt.toLowerCase() === 'ts') {
    targetExt = 'mp4';
  }

  if (targetExt) {
    if (!finalName.toLowerCase().endsWith('.' + targetExt.toLowerCase())) {
      finalName = `${finalName}.${targetExt}`;
    }
  }

  let targetSaveDir = saveDirectory.value;
  let targetFileName = finalName;

  // 如果检测到磁盘上已存在高度相似的文件
  if (matchedExistingFile.value) {
    const existing = matchedExistingFile.value;
    const normalizePath = (p: string) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const currentSaveDirNorm = normalizePath(targetSaveDir);
    const existingDirNorm = normalizePath(existing.dir);

    // 情况：相似文件存在于其他子目录（如已有在 B-诺兰，当前选中了 C-盗梦空间）
    if (existingDirNorm !== currentSaveDirNorm) {
      const { useConfirm } = await import('../../composables/useConfirm');
      const shouldOverwriteOriginal = await useConfirm().confirm({
        title: '检测到已存在相似文件',
        message: `在子目录 [${existing.relativeDir}] 已存在高度相似的文件：\n"${existing.name}"\n\n要直接覆盖替换该位置的原文件吗？\n点击【覆盖原文件】将切换并覆盖原文件；\n点击【继续下载】将仍保存至当前选中的目录。`,
        confirmText: '覆盖原文件',
        cancelText: '继续下载',
        type: 'warning'
      });

      if (shouldOverwriteOriginal) {
        targetSaveDir = existing.dir;
        targetFileName = existing.name;
      }
    }
  }

  isSaving.value = true;

  try {
    const savePath = `${targetSaveDir}/${targetFileName}`;
    const added = await addDownload(targetUrl, targetFileName, savePath, props.pageUrl);

    if (added) {
      showMessage('已添加到下载任务', 'success');
      emit('saved');
      close();
    }
  } catch (err: any) {
    showMessage('下载任务添加失败: ' + err.message, 'error');
  } finally {
    isSaving.value = false;
  }
};
</script>

<style scoped>
.save-modal-window {
  position: fixed;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  width: 420px;
  max-width: 90vw;
  border-radius: 8px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.save-modal-window.is-highlighted {
  animation: save-dialog-shake 0.5s ease-in-out;
  border-color: var(--color-accent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 35%, transparent), 0 12px 28px -5px rgba(0, 0, 0, 0.3) !important;
}

.save-modal-window.has-duplicate-warning {
  border-color: var(--color-warning, #f59e0b) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-warning, #f59e0b) 30%, transparent), 0 10px 25px -5px rgba(0, 0, 0, 0.25);
}

.duplicate-file-alert {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background-color: color-mix(in srgb, var(--color-warning, #f59e0b) 10%, var(--bg-surface));
  border: 1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 25%, transparent);
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.4;
}

.duplicate-file-alert .duplicate-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes save-dialog-shake {
  0% { transform: scale(1); }
  25% { transform: scale(1.02); }
  50% { transform: scale(0.99); }
  75% { transform: scale(1.01); }
  100% { transform: scale(1); }
}

.save-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-surface-hover);
  cursor: grab;
}

.save-header:active {
  cursor: grabbing;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  pointer-events: none;
}

.header-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-close-btn:hover {
  background: var(--bg-surface-active);
  color: var(--text-primary);
}

.save-body {
  padding: 16px;
  background: var(--bg-surface);
  user-select: auto;
}

.save-location-group label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.location-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.location-label-row label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0 !important;
}

.auto-match-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  user-select: none;
  animation: badge-fade-in 0.25s ease-out;
}

@keyframes badge-fade-in {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.location-input-row {
  display: flex;
  gap: 8px;
}

.save-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--bg-surface-hover);
  user-select: auto;
}
</style>
