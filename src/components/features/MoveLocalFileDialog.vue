<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="close">
      <div class="modal-content move-dialog-content">
        <div class="modal-header">
          <div class="header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <polyline points="9 14 12 17 15 14"></polyline>
            </svg>
            <h3>移动 "{{ fileName }}"</h3>
          </div>
          <v-button variant="icon" class="modal-close-btn" @click="close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </v-button>
        </div>

        <div class="modal-body">
          <div class="tree-toolbar">
            <span class="selected-target-hint">
              目标目录: <strong>{{ selectedDirPath || '未选择' }}</strong>
            </span>
            <v-button variant="secondary" size="small" @click="showNewFolderModal = true" :disabled="!selectedDirPath">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              新建子目录
            </v-button>
          </div>

          <div class="directory-tree-container">
            <div v-if="loading" class="tree-loading">
              <div class="spinner"></div>
              <span>正在扫描目录树</span>
            </div>
            <div v-else-if="dirList.length === 0" class="tree-empty">
              <span>未扫描到可用目录</span>
            </div>
            <div v-else class="tree-list">
              <div
                v-for="item in dirList"
                :key="item.path"
                class="tree-node"
                :class="{ active: selectedDirPath === item.path }"
                :style="{ paddingLeft: `${item.depth * 18 + 12}px` }"
                @click="selectedDirPath = item.path"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="folder-icon">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="node-name" :title="item.path">{{ item.name }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <v-button variant="secondary" @click="close">取消</v-button>
          <v-button variant="primary" :disabled="!selectedDirPath || isCurrentLocation" @click="confirmMove">
            确认移动
          </v-button>
        </div>
      </div>

      <!-- Dedicated New Subfolder Modal -->
      <div v-if="showNewFolderModal" class="modal-overlay subfolder-modal-overlay" @click.self="showNewFolderModal = false">
        <div class="modal-content" style="max-width: 400px; width: 88vw;">
          <div class="modal-header">
            <h3>新建子目录</h3>
            <v-button variant="icon" class="modal-close-btn" @click="showNewFolderModal = false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </v-button>
          </div>
          <div class="modal-body" style="padding: 16px 20px;">
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">
              将在 <strong>{{ selectedDirPath.split(/[\/\\]/).pop() || selectedDirPath }}</strong> 下创建新子目录：
            </p>
            <v-input v-model="newFolderName" type="text" placeholder="输入新子目录名称" class="inline-input" style="width: 100%;" @keyup.enter="handleCreateSubfolder" />
          </div>
          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--border-light);">
            <v-button variant="secondary" @click="showNewFolderModal = false; newFolderName = ''">取消</v-button>
            <v-button variant="primary" :disabled="!newFolderName.trim()" @click="handleCreateSubfolder">创建</v-button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import VButton from '../base/VButton.vue';
import VInput from '../base/VInput.vue';
import { useMessage } from '../../composables/useMessage';

interface DirNode {
  path: string;
  name: string;
  depth: number;
}

const props = defineProps<{
  visible: boolean;
  rootPath: string;
  currentFilePath: string;
  fileName: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'confirm', targetDir: string): void;
}>();

const { showMessage } = useMessage();
const loading = ref(false);
const dirList = ref<DirNode[]>([]);
const selectedDirPath = ref<string>('');
const showNewFolderModal = ref(false);
const newFolderName = ref('');

const isCurrentLocation = computed(() => {
  if (!props.currentFilePath || !selectedDirPath.value) return false;
  // Normalize slashes
  const normCurrent = props.currentFilePath.replace(/\\/g, '/');
  const normSelected = selectedDirPath.value.replace(/\\/g, '/');
  const currentDir = normCurrent.substring(0, normCurrent.lastIndexOf('/'));
  return currentDir === normSelected;
});

const loadTree = async () => {
  if (!props.rootPath || !window.electronAPI) return;
  loading.value = true;
  try {
    const list = await window.electronAPI.getDirectoryTree(props.rootPath, 5);
    dirList.value = list || [];
    if (!selectedDirPath.value && dirList.value.length > 0) {
      selectedDirPath.value = dirList.value[0].path;
    }
  } catch (err: any) {
    showMessage(`加载目录树失败: ${err?.message}`, 'error');
  } finally {
    loading.value = false;
  }
};

watch(() => props.visible, (val) => {
  if (val) {
    showNewFolderModal.value = false;
    newFolderName.value = '';
    loadTree();
  }
}, { immediate: true });

const handleCreateSubfolder = async () => {
  const name = newFolderName.value.trim();
  if (!name || !selectedDirPath.value || !window.electronAPI) return;

  const targetPath = `${selectedDirPath.value}/${name}`.replace(/\\/g, '/');
  try {
    const res = await window.electronAPI.createLocalFolder(targetPath);
    if (res && res.success) {
      showMessage(`子目录 "${name}" 创建成功`, 'success');
      newFolderName.value = '';
      showNewFolderModal.value = false;
      await loadTree();
      selectedDirPath.value = targetPath;
    } else {
      showMessage(res?.error || '创建子目录失败', 'error');
    }
  } catch (err: any) {
    showMessage(`创建子目录失败: ${err?.message}`, 'error');
  }
};

const close = () => {
  emit('update:visible', false);
};

const confirmMove = () => {
  if (!selectedDirPath.value) return;
  emit('confirm', selectedDirPath.value);
  close();
};
</script>

<style scoped lang="less">
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 100005;
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal-content {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary);
}

.move-dialog-content {
  max-width: 520px;
  width: 90vw;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-primary);

    h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 380px;
    }
  }
}

.modal-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tree-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  .selected-target-hint {
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    strong {
      color: var(--text-primary);
    }
  }
}

.subfolder-modal-overlay {
  z-index: 100010 !important;
}

.directory-tree-container {
  height: 260px;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-tertiary);
  padding: 6px 0;

  .tree-loading, .tree-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 13px;
    gap: 8px;
  }

  .tree-list {
    display: flex;
    flex-direction: column;
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease;
    border-radius: 4px;
    margin: 1px 6px;

    &:hover {
      background: var(--bg-hover);
    }

    &.active {
      background: var(--accent-light, rgba(59, 130, 246, 0.12));
      color: var(--accent-color, #3b82f6);

      .folder-icon {
        stroke: var(--accent-color, #3b82f6);
        fill: var(--accent-light, rgba(59, 130, 246, 0.12));
      }

      .node-name {
        font-weight: 600;
        color: var(--accent-color, #3b82f6);
      }
    }

    .folder-icon {
      flex-shrink: 0;
      stroke: var(--text-secondary);
    }

    .node-name {
      font-size: 13px;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-light);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-light);
  border-top-color: var(--accent-color, #3b82f6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
