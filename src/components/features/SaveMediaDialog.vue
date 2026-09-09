<template>
  <div
    v-if="visible"
    class="save-modal-window"
    :class="{ 'is-highlighted': isHighlighted }"
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

// 核心：子目录名称与文件名的智能最长匹配算法
const matchBestSubdirectory = (currentFileName: string) => {
  if (!settingsState.autoMatchDownloadSubdir || isUserManualDir.value) return;
  if (!dirTreeList.value || dirTreeList.value.length === 0) return;

  let targetName = (currentFileName || '').trim();
  const ext = getExtension(targetName);
  if (ext && targetName.endsWith('.' + ext)) {
    targetName = targetName.slice(0, -(ext.length + 1));
  }
  // 去除常见媒体拓展名
  targetName = targetName.replace(/\.(m3u8|ts|mp4|mkv|avi|mov|mp3|flac|wav|jpg|png|webp)$/i, '');
  if (!targetName) return;

  const normalizedTarget = targetName.toLowerCase();
  let bestMatch: { path: string; name: string; depth: number; matchLength: number } | null = null;

  for (const item of dirTreeList.value) {
    const dirName = item.name.trim();
    if (!dirName) continue;

    const normalizedDirName = dirName.toLowerCase();
    let matchLen = 0;

    // 优先字面量包含匹配
    if (normalizedTarget.includes(normalizedDirName)) {
      matchLen = normalizedDirName.length;
    } else {
      // 安全正则匹配
      try {
        const escaped = normalizedDirName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(escaped, 'i');
        const m = normalizedTarget.match(reg);
        if (m && m[0]) {
          matchLen = m[0].length;
        }
      } catch {
        matchLen = 0;
      }
    }

    if (matchLen > 0) {
      if (!bestMatch) {
        bestMatch = { ...item, matchLength: matchLen };
      } else {
        // 1. 最长字符串匹配优先（如“盗梦空间”4字 > “诺兰”2字）
        if (matchLen > bestMatch.matchLength) {
          bestMatch = { ...item, matchLength: matchLen };
        } else if (matchLen === bestMatch.matchLength) {
          // 2. 匹配长度相同时，层级更深（更具体子分类）优先
          if (item.depth > bestMatch.depth) {
            bestMatch = { ...item, matchLength: matchLen };
          }
          // 3. 深度相同时，保持遍历顺序靠前的目录
        }
      }
    }
  }

  if (bestMatch) {
    saveDirectory.value = bestMatch.path;
    autoMatchedPath.value = bestMatch.path;
    isAutoMatchedDir.value = true;
  } else {
    // 未匹配到任何子目录时，自动回退保持根下载目录
    if (!isUserManualDir.value) {
      saveDirectory.value = props.defaultDir;
      autoMatchedPath.value = '';
      isAutoMatchedDir.value = false;
    }
  }
};

const loadDirTree = async () => {
  if (props.defaultDir && window.electronAPI && window.electronAPI.getDirectoryTree) {
    try {
      const list = await window.electronAPI.getDirectoryTree(props.defaultDir, 3);
      dirTreeList.value = list;
      // 目录树扫描完成后，立即根据初始文件名执行初次自动匹配
      if (!isUserManualDir.value && settingsState.autoMatchDownloadSubdir) {
        matchBestSubdirectory(fileName.value);
      }
    } catch {
      dirTreeList.value = [];
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

// 文件名修改时实时联动重新计算最佳子目录（防覆盖锁开启时除外）
watch(fileName, (newVal) => {
  if (!isUserManualDir.value && settingsState.autoMatchDownloadSubdir) {
    matchBestSubdirectory(newVal);
  }
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

  isSaving.value = true;

  try {
    const savePath = `${saveDirectory.value}/${finalName}`;
    const added = await addDownload(targetUrl, finalName, savePath, props.pageUrl);

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
