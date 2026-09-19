<template>
  <Teleport to="body">
    <div v-if="visible && task" class="edit-task-overlay" @click.self="close" @mousedown.stop>
      <div class="edit-task-modal">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-title">
            <VIcon name="edit" :size="16" style="margin-right: 6px;" />
            <span>编辑任务信息</span>
          </div>
          <v-button variant="secondary" size="small" style="padding: 4px 6px; min-width: unset;" @click="close" title="关闭">
            <VIcon name="close" :size="14" />
          </v-button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <div class="form-group">
            <label>任务名称</label>
            <v-input v-model="taskName" type="text" placeholder="输入任务名称" />
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <label>任务链接</label>
            <div class="url-input-row">
              <v-input :model-value="taskUrl" type="text" readonly placeholder="任务链接" class="flex-1" />
              <v-button variant="secondary" size="small" @click="handleCopyUrl">
                <VIcon name="copy-text" :size="14" style="margin-right: 4px;" />
                <span>复制</span>
              </v-button>
            </div>
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <label>当前目录</label>
            <div class="dir-input-row">
              <VInputSelect
                v-model="saveDirectory"
                placeholder="选择或输入新文件目录"
                :options="dirTreeOptions"
                class="flex-1"
              />
              <v-button variant="secondary" size="small" @click="handleSelectDirectory">移至目录</v-button>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <v-button variant="secondary" size="small" @click="close" :disabled="isSaving">取消</v-button>
          <v-button variant="primary" size="small" @click="saveEdit" :disabled="isSaving">
            {{ isSaving ? '保存中' : '保存修改' }}
          </v-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { DownloadTask } from '../../db';
import { useDownloads } from '../../composables/useDownloads';
import { useMessage } from '../../composables/useMessage';
import VButton from '../base/VButton.vue';
import VInput from '../base/VInput.vue';
import VIcon from '../base/VIcon.vue';
import VInputSelect, { type InputSelectOption } from '../base/VInputSelect.vue';

const props = defineProps<{
  visible: boolean;
  task: DownloadTask | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const { updateTaskDb } = useDownloads();
const { showMessage } = useMessage();

const taskName = ref('');
const taskUrl = ref('');
const saveDirectory = ref('');
const isSaving = ref(false);
const dirTreeList = ref<Array<{ path: string, name: string, depth: number }>>([]);

const dirTreeOptions = computed<InputSelectOption[]>(() => {
  return dirTreeList.value.map(item => ({
    label: item.name,
    value: item.path,
    depth: item.depth
  }));
});

const loadDirTree = async (dir: string) => {
  if (dir && window.electronAPI && window.electronAPI.getDirectoryTree) {
    try {
      const list = await window.electronAPI.getDirectoryTree(dir, 3);
      dirTreeList.value = list;
    } catch {
      dirTreeList.value = [];
    }
  }
};

watch(() => [props.visible, props.task], () => {
  if (props.visible && props.task) {
    taskName.value = props.task.name || '';
    taskUrl.value = props.task.url || '';
    if (props.task.savePath) {
      // Extract dir
      const normalized = props.task.savePath.replace(/\\/g, '/');
      const lastSlash = normalized.lastIndexOf('/');
      if (lastSlash !== -1) {
        const dir = normalized.substring(0, lastSlash);
        saveDirectory.value = dir;
        loadDirTree(dir);
      } else {
        saveDirectory.value = '';
      }
    } else {
      saveDirectory.value = '';
    }
  }
}, { immediate: true });

const close = () => {
  emit('update:visible', false);
};

const handleCopyUrl = async () => {
  if (!taskUrl.value) return;
  try {
    await navigator.clipboard.writeText(taskUrl.value);
    showMessage('链接已复制到剪切板', 'success');
  } catch (err: any) {
    showMessage(`复制失败: ${err.message || err}`, 'error');
  }
};

const handleSelectDirectory = async () => {
  if (window.electronAPI && window.electronAPI.selectDirectory) {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      saveDirectory.value = dir;
    }
  }
};

const saveEdit = async () => {
  if (!props.task) return;
  const name = taskName.value.trim();
  const dir = saveDirectory.value.trim();

  if (!name) {
    showMessage('请输入任务名称', 'error');
    return;
  }
  if (!dir) {
    showMessage('请选择下载目录', 'error');
    return;
  }

  isSaving.value = true;

  try {
    const oldPath = props.task.savePath || '';
    const normalizedOld = oldPath.replace(/\\/g, '/');
    const oldFileName = normalizedOld.substring(normalizedOld.lastIndexOf('/') + 1);
    
    // Check if name contains extension
    let ext = '';
    const dotIdx = oldFileName.lastIndexOf('.');
    if (dotIdx !== -1) {
      ext = oldFileName.substring(dotIdx);
    }

    let newFileName = name;
    if (ext && !newFileName.toLowerCase().endsWith(ext.toLowerCase())) {
      newFileName += ext;
    }

    const newSavePath = `${dir.replace(/[/\\]+$/, '')}/${newFileName}`;

    let oldFileExists = false;
    if (oldPath && window.electronAPI && window.electronAPI.fileExists) {
      oldFileExists = await window.electronAPI.fileExists(oldPath);
    }

    if (oldFileExists) {
      // Move / rename file if path changed
      if (oldPath !== newSavePath) {
        const res = await window.electronAPI.moveFile(oldPath, newSavePath);
        if (!res.success) {
          showMessage(`移动/重命名文件失败: ${res.error}`, 'error');
          isSaving.value = false;
          return;
        }
        props.task.savePath = newSavePath;
      }

      props.task.name = name;
      await updateTaskDb(props.task);
      showMessage('任务名称与文件定位更新成功', 'success');
    } else {
      // File missing at old path -> update DB record first
      props.task.name = name;
      props.task.savePath = newSavePath;

      // Check if file exists at new path
      let newFileExists = false;
      if (window.electronAPI && window.electronAPI.fileExists) {
        newFileExists = await window.electronAPI.fileExists(newSavePath);
      }

      if (newFileExists) {
        props.task.status = 'completed';
        props.task.progress = 100;
        showMessage('任务信息已修改（找到文件）', 'success');
      } else {
        if (props.task.status === 'completed') {
          props.task.status = 'file_removed';
        }
        showMessage('任务信息已修改（未找到文件）', 'success');
      }

      await updateTaskDb(props.task);
    }

    close();
  } catch (err: any) {
    showMessage(`保存失败: ${err.message}`, 'error');
  } finally {
    isSaving.value = false;
  }
};
</script>

<style scoped lang="less">
.edit-task-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 2147483647;
  display: flex;
  justify-content: center;
  align-items: center;
}

.edit-task-modal {
  width: 480px;
  max-width: 90vw;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary);
}

.modal-header {
  height: 46px;
  padding: 0 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface-hover);

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
  }

  .close-btn {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;

    &:hover {
      background: var(--bg-surface-active);
      color: var(--text-primary);
    }
  }
}

.modal-body {
  padding: 16px;

  .form-group label {
    font-size: 12px;
    color: var(--text-secondary);
    display: block;
    margin-bottom: 6px;
  }

  .dir-input-row,
  .url-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
}

.modal-footer {
  height: 48px;
  padding: 0 16px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-app);
}
</style>
