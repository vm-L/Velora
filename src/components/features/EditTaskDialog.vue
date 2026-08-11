<template>
  <Teleport to="body">
    <div v-if="visible && task" class="edit-task-overlay" @click.self="close" @mousedown.stop>
      <div class="edit-task-modal">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>编辑任务信息</span>
          </div>
          <button class="close-btn" @click="close" title="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <div class="form-group">
            <label>任务名称</label>
            <v-input v-model="taskName" type="text" placeholder="输入任务名称..." />
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <label>任务链接</label>
            <div class="url-input-row">
              <v-input :model-value="taskUrl" type="text" readonly placeholder="任务链接..." class="flex-1" />
              <v-button variant="secondary" size="small" @click="handleCopyUrl">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>复制</span>
              </v-button>
            </div>
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <label>当前目录</label>
            <div class="dir-input-row">
              <VInputSelect
                v-model="saveDirectory"
                placeholder="选择或输入新文件目录..."
                :options="dirTreeOptions"
                class="flex-1"
              />
              <v-button variant="secondary" size="small" @click="handleSelectDirectory">移至目录</v-button>
            </div>
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="margin-bottom: 0;">防盗链凭据 (Referer & Cookie)</label>
              <v-button variant="secondary" size="small" style="font-size: 11px; padding: 2px 8px;" @click="handleCaptureCredentials">
                一键获取网页凭据
              </v-button>
            </div>
            <v-input v-model="taskReferer" type="text" placeholder="Referer 请求头 (如 https://domain.com/...)" />
            <v-input v-model="taskCookie" type="text" placeholder="Cookie 字符串 (包含登录与防盗链 Token)" style="margin-top: 8px;" />
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <v-button variant="secondary" size="small" @click="close" :disabled="isSaving">取消</v-button>
          <v-button variant="primary" size="small" @click="saveEdit" :disabled="isSaving">
            {{ isSaving ? '保存中...' : '保存修改' }}
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
const taskReferer = ref('');
const taskCookie = ref('');
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
    taskReferer.value = props.task.referer || '';
    taskCookie.value = props.task.cookie || '';
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

const handleCaptureCredentials = async () => {
  const targetUrl = taskReferer.value || taskUrl.value;
  if (!targetUrl) return;
  if (window.electronAPI && window.electronAPI.getPageCredentials) {
    try {
      const res = await window.electronAPI.getPageCredentials(targetUrl);
      if (res.success) {
        if (res.referer) taskReferer.value = res.referer;
        if (res.cookie) taskCookie.value = res.cookie;
        showMessage('已成功获取当前网页的 Referer 与 Cookie 凭据！', 'success');
      } else {
        showMessage(res.error || '获取凭据失败', 'error');
      }
    } catch (err: any) {
      showMessage(`获取凭据失败: ${err.message}`, 'error');
    }
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

    props.task.referer = taskReferer.value.trim();
    props.task.cookie = taskCookie.value.trim();

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
      showMessage('任务信息与凭据更新成功', 'success');
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
