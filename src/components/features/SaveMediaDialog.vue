<template>
  <Teleport to="body">
    <div v-if="visible" class="save-overlay" @mousedown.stop>
      <div class="save-modal">
        <div class="save-header">
          <h3>保存{{ typeName }}</h3>
        </div>
        <div class="save-body">
          <div class="save-location-group">
            <label>保存位置</label>
            <div class="location-input-row">
              <VInputSelect
                v-model="saveDirectory"
                placeholder="选择或输入目录..."
                :options="dirTreeOptions"
                class="flex-1"
              />
              <v-button variant="secondary" class="select-dir-btn" @click="selectSaveDirectory">选择</v-button>
            </div>
          </div>

          <div class="save-location-group" style="margin-top: 16px;">
            <label>文件名称</label>
            <div class="location-input-row">
              <v-input v-model="fileName" type="text" placeholder="输入文件名称..." />
            </div>
          </div>
        </div>
        <div class="save-footer">
          <v-button variant="secondary" class="cancel-btn" @click="close" :disabled="isSaving">取消</v-button>
          <v-button variant="primary" class="confirm-btn" @click="confirmSave" :disabled="isSaving">
            {{ isSaving ? '保存中...' : '确认保存' }}
          </v-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDownloads } from '../../composables/useDownloads';
import { useMessage } from '../../composables/useMessage';
import VButton from '../base/VButton.vue';
import VInput from '../base/VInput.vue';
import VInputSelect, { type InputSelectOption } from '../base/VInputSelect.vue';

const props = defineProps<{
  visible: boolean;
  url: string;
  defaultName: string;
  defaultDir: string;
  type: string; // 'audio', 'video', 'image', 'file'
}>();

const emit = defineEmits(['update:visible', 'saved']);

const { addDownload } = useDownloads();
const { showMessage } = useMessage();

const saveDirectory = ref('');
const fileName = ref('');
const isSaving = ref(false);
const dirTreeList = ref<Array<{ path: string, name: string, depth: number }>>([]);

const dirTreeOptions = computed<InputSelectOption[]>(() => {
  return dirTreeList.value.map(item => ({
    label: item.name,
    value: item.path,
    depth: item.depth
  }));
});

const loadDirTree = async () => {
  if (props.defaultDir && window.electronAPI && window.electronAPI.getDirectoryTree) {
    try {
      const list = await window.electronAPI.getDirectoryTree(props.defaultDir, 3);
      dirTreeList.value = list;
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

const pauseAllMedia = () => {
  // 暂停当前主渲染进程 DOM 中的所有 HTML5 音视频（包含音视频预览弹窗）
  document.querySelectorAll('video, audio').forEach((media) => {
    try {
      (media as HTMLMediaElement).pause();
    } catch {}
  });

  // 暂停网页标签页 (webview) 内正在播放的音视频
  document.querySelectorAll('webview').forEach((wv) => {
    try {
      (wv as any).executeJavaScript(`
        document.querySelectorAll('video, audio').forEach(m => m.pause());
      `).catch(() => {});
    } catch {}
  });
};

watch(() => props.visible, (newVal) => {
  if (newVal) {
    pauseAllMedia();
    saveDirectory.value = props.defaultDir;
    loadDirTree();
    
    let rawName = props.defaultName || 'video';
    const ext = getExtension(rawName);
    let baseName = rawName;
    if (ext && rawName.endsWith('.' + ext)) {
      baseName = rawName.slice(0, -(ext.length + 1));
    }
    
    // Clean up any remaining .m3u8 or .ts
    baseName = baseName.replace(/\.(m3u8|ts)$/i, '');

    // Determine target final extension
    let targetExt = ext;
    if (props.type === 'video' || props.url.toLowerCase().includes('.m3u8') || ext.toLowerCase() === 'm3u8' || ext.toLowerCase() === 'ts') {
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
  }
});

const close = () => {
  emit('update:visible', false);
};

const selectSaveDirectory = async () => {
  if (window.electronAPI && window.electronAPI.selectDirectory) {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      saveDirectory.value = dir;
    }
  }
};

const getExtension = (urlOrName: string) => {
  const match = urlOrName.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
  return match ? match[1] : '';
};

const confirmSave = async () => {
  if (!saveDirectory.value) {
    showMessage('请先选择保存目录', 'error');
    return;
  }
  if (!fileName.value.trim()) {
    showMessage('文件名称不能为空', 'error');
    return;
  }

  let finalName = fileName.value.trim();
  let targetExt = getExtension(props.defaultName);
  if (props.type === 'video' || props.url.toLowerCase().includes('.m3u8') || targetExt.toLowerCase() === 'm3u8' || targetExt.toLowerCase() === 'ts') {
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
    const added = await addDownload(props.url, finalName, savePath);
    
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
.save-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2147483647;
}

.save-modal {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  width: 420px;
  max-width: 90%;
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.save-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-surface-hover);
}

.save-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.save-body {
  padding: 16px;
  background: var(--bg-surface);
}

.save-location-group label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.location-input-row {
  display: flex;
  gap: 8px;
}

.combobox-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;

  :deep(.v-input) {
    width: 100%;
  }

  :deep(.v-input input) {
    padding-right: 32px;
  }
}

.dropdown-toggle-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 2;

  &:hover {
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  svg {
    transition: transform 0.2s ease;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.tree-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 220px;
  overflow-y: auto;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
  z-index: 9999;
  padding: 4px 0;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s ease;
  user-select: none;

  &:hover {
    background: var(--bg-surface-hover);
  }

  &.active {
    background: var(--bg-surface-active);
    color: var(--color-accent);
    font-weight: 500;
  }

  .tree-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  &.active .tree-icon {
    color: var(--color-accent);
  }

  .tree-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.save-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--bg-surface-hover);
}
/* Styled by custom VButton and VInput components */
</style>
