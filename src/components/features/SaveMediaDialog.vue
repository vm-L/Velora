<template>
  <div v-if="visible" class="save-overlay" @mousedown.stop>
    <div class="save-modal">
      <div class="save-header">
        <h3>保存{{ typeName }}</h3>
      </div>
      <div class="save-body">
        <div class="save-location-group">
          <label>保存位置</label>
          <div class="location-input-row">
            <v-input v-model="saveDirectory" type="text" placeholder="选择或输入目录..." />
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
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDownloads } from '../../composables/useDownloads';
import { useMessage } from '../../composables/useMessage';
import VButton from '../base/VButton.vue';
import VInput from '../base/VInput.vue';

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

const typeName = computed(() => {
  switch (props.type) {
    case 'audio': return '音频';
    case 'video': return '视频';
    case 'image': return '图片';
    default: return '文件';
  }
});

watch(() => props.visible, (newVal) => {
  if (newVal) {
    saveDirectory.value = props.defaultDir;
    const ext = getExtension(props.defaultName);
    if (ext && props.defaultName.endsWith('.' + ext)) {
      fileName.value = props.defaultName.slice(0, -(ext.length + 1));
    } else {
      fileName.value = props.defaultName;
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
  // Auto append extension if missing or different
  const origExt = getExtension(props.defaultName);
  
  if (origExt) {
    if (!finalName.toLowerCase().endsWith('.' + origExt.toLowerCase())) {
      finalName = `${finalName}.${origExt}`;
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
  z-index: 100000;
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
