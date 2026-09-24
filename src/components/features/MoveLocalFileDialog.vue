<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="close">
      <div class="modal-content move-dialog-content">
        <div class="modal-header">
          <div class="header-left">
            <VIcon name="folder-move" :size="18" />
            <h3>{{ computedTitle }}</h3>
          </div>
          <v-button variant="icon" class="modal-close-btn" @click="close">
            <VIcon name="close" :size="18" />
          </v-button>
        </div>

        <div class="modal-body">
          <div class="tree-toolbar">
            <span class="selected-target-hint">
              目标目录: <strong>{{ selectedDirPath || '未选择' }}</strong>
            </span>
            <v-button variant="secondary" size="small" @click="showNewFolderModal = true" :disabled="!selectedDirPath">
              <VIcon name="plus" :size="14" />
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
                <VIcon name="folder" :size="16" class="folder-icon" />
                <span class="node-name" :title="item.path">{{ item.name }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <v-button variant="secondary" @click="close">取消</v-button>
          <v-button variant="primary" :disabled="!selectedDirPath || isInvalidTarget" @click="confirmMove">
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
              <VIcon name="close" :size="18" />
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
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VIcon from '@/components/base/VIcon.vue';
import { useMessage } from '@/composables/useMessage';

export interface MoveTargetItem {
  name: string;
  path: string;
  isDirectory?: boolean;
}

interface DirNode {
  path: string;
  name: string;
  depth: number;
}

const props = defineProps<{
  visible: boolean;
  rootPath: string;
  currentFilePath?: string;
  fileName?: string;
  items?: MoveTargetItem[];
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

const computedTitle = computed(() => {
  if (props.items && props.items.length > 1) {
    return '移动选中的项目';
  }
  return `移动 "${props.fileName || props.items?.[0]?.name || ''}"`;
});

const isInvalidTarget = computed(() => {
  if (!selectedDirPath.value) return true;
  const normSelected = selectedDirPath.value.replace(/\\/g, '/');

  // 1. 单项路径校验
  if (props.currentFilePath) {
    const normCurrent = props.currentFilePath.replace(/\\/g, '/');
    const currentDir = normCurrent.substring(0, normCurrent.lastIndexOf('/'));
    if (currentDir === normSelected || normCurrent === normSelected) return true;
  }

  // 2. 多项路径校验与自包含循环校验
  if (props.items && props.items.length > 0) {
    const allAlreadyInTarget = props.items.every(item => {
      const itemNorm = item.path.replace(/\\/g, '/');
      const itemDir = itemNorm.substring(0, itemNorm.lastIndexOf('/'));
      return itemDir === normSelected;
    });
    if (allAlreadyInTarget) return true;

    for (const item of props.items) {
      const itemNorm = item.path.replace(/\\/g, '/');
      if (item.isDirectory) {
        if (normSelected === itemNorm || normSelected.startsWith(`${itemNorm}/`)) {
          return true;
        }
      }
    }
  }

  return false;
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
      background: var(--bg-surface-active);
      color: var(--color-accent);

      .folder-icon {
        stroke: var(--color-accent);
      }

      .node-name {
        font-weight: 600;
        color: var(--color-accent);
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
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
