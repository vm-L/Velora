<template>
  <Teleport to="body">
    <div v-if="visible" class="picker-modal-overlay" @click.self="handleClose">
      <div class="picker-modal">
        <div class="picker-header">
          <div class="picker-title">
            <VIcon name="folder-move" :size="17" />
            <span>{{ title }}</span>
          </div>
          <VButton variant="icon" @click="handleClose" title="关闭">
            <VIcon name="close" :size="16" />
          </VButton>
        </div>

        <div class="picker-toolbar">
          <div class="picker-breadcrumbs">
            <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.id">
              <span v-if="idx > 0" class="crumb-sep">/</span>
              <button
                type="button"
                class="crumb-btn"
                :class="{ current: idx === breadcrumbs.length - 1 }"
                @click="navigateBreadcrumb(idx)"
              >
                {{ crumb.name }}
              </button>
            </template>
          </div>
          <VButton
            variant="secondary"
            size="small"
            @click="toggleNewFolder"
            :disabled="isLoading || isCreatingFolder"
          >
            <VIcon name="plus" :size="13" />
            <span>新建文件夹</span>
          </VButton>
        </div>

        <div v-if="showNewFolder" class="new-folder-bar">
          <input
            v-model="newFolderName"
            type="text"
            class="new-folder-input"
            placeholder="输入新文件夹名称"
            @keyup.enter="handleCreateFolder"
          />
          <VButton
            variant="primary"
            size="small"
            :loading="isCreatingFolder"
            :disabled="!newFolderName.trim() || isCreatingFolder"
            @click="handleCreateFolder"
          >
            创建
          </VButton>
          <VButton variant="secondary" size="small" @click="showNewFolder = false">
            取消
          </VButton>
        </div>

        <div class="picker-body">
          <div v-if="isLoading" class="picker-state">
            <VIcon name="loading" :size="18" class="spin-icon" />
            <span>正在加载目录...</span>
          </div>

          <div v-else-if="errorMsg" class="picker-state error">
            <VIcon name="warning" :size="18" />
            <span>{{ errorMsg }}</span>
            <VButton variant="secondary" size="small" @click="loadCurrentFolders">重试</VButton>
          </div>

          <div v-else-if="folders.length === 0" class="picker-state empty">
            <span>当前目录暂无子文件夹</span>
          </div>

          <div v-else class="folder-list">
            <button
              v-for="folder in folders"
              :key="folder.id"
              type="button"
              class="folder-row"
              @click="enterFolder(folder)"
            >
              <VIcon name="folder" :size="16" class="folder-icon" />
              <span class="folder-name">{{ folder.name }}</span>
              <VIcon name="folder-enter" :size="14" class="enter-icon" />
            </button>
          </div>
        </div>

        <div class="picker-footer">
          <div class="target-hint" :title="currentPathText">
            目标位置：{{ currentPathText }}
          </div>
          <div class="footer-actions">
            <VButton variant="secondary" @click="handleClose">取消</VButton>
            <VButton variant="primary" :disabled="isLoading || isCreatingFolder" @click="handleConfirm">
              {{ confirmText }}
            </VButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';

interface FolderEntry {
  id: string;
  name: string;
}

const props = withDefaults(
  defineProps<{
    visible: boolean;
    panType: string;
    title?: string;
    confirmText?: string;
    excludeIds?: string[];
  }>(),
  {
    title: '选择目标文件夹',
    confirmText: '确定',
    excludeIds: () => []
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', targetFid: string, targetName: string): void;
}>();

const breadcrumbs = ref<FolderEntry[]>([{ id: '0', name: '根目录' }]);
const folders = ref<FolderEntry[]>([]);
const isLoading = ref(false);
const errorMsg = ref('');
const showNewFolder = ref(false);
const newFolderName = ref('');
const isCreatingFolder = ref(false);

const currentFolder = computed(
  () => breadcrumbs.value[breadcrumbs.value.length - 1] || { id: '0', name: '根目录' }
);

const currentPathText = computed(() =>
  breadcrumbs.value.map(b => b.name).join(' / ')
);

let folderReqSeq = 0;

const loadCurrentFolders = async () => {
  if (!props.panType || !window.electronAPI?.listPanFiles) return;
  const reqSeq = ++folderReqSeq;
  isLoading.value = true;
  errorMsg.value = '';
  try {
    const res = await window.electronAPI.listPanFiles({
      type: props.panType,
      pdirFid: currentFolder.value.id
    });
    if (reqSeq !== folderReqSeq) return;
    if (res && res.success) {
      const excluded = new Set(props.excludeIds || []);
      const files = Array.isArray(res.data?.files) ? res.data.files : [];
      folders.value = files
        .filter((f: any) => f.isDirectory && !excluded.has(f.id))
        .map((f: any) => ({ id: f.id, name: f.name }));
    } else {
      errorMsg.value = res?.error || '加载目录失败';
      folders.value = [];
    }
  } catch (err: any) {
    if (reqSeq !== folderReqSeq) return;
    errorMsg.value = err?.message || '加载目录异常';
    folders.value = [];
  } finally {
    if (reqSeq === folderReqSeq) {
      isLoading.value = false;
    }
  }
};

const navigateBreadcrumb = (index: number) => {
  if (index === breadcrumbs.value.length - 1) return;
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1);
  loadCurrentFolders();
};

const enterFolder = (folder: FolderEntry) => {
  breadcrumbs.value = [...breadcrumbs.value, folder];
  loadCurrentFolders();
};

const toggleNewFolder = () => {
  showNewFolder.value = !showNewFolder.value;
  if (showNewFolder.value) {
    newFolderName.value = '';
  }
};

const handleCreateFolder = async () => {
  const trimmed = newFolderName.value.trim();
  if (!trimmed || !window.electronAPI?.createPanFolder) return;
  isCreatingFolder.value = true;
  errorMsg.value = '';
  try {
    const res = await window.electronAPI.createPanFolder({
      type: props.panType,
      parentFid: currentFolder.value.id,
      name: trimmed
    });
    if (res && res.success) {
      showNewFolder.value = false;
      newFolderName.value = '';
      await loadCurrentFolders();
    } else {
      errorMsg.value = res?.error || '创建文件夹失败';
    }
  } catch (err: any) {
    errorMsg.value = err?.message || '创建文件夹异常';
  } finally {
    isCreatingFolder.value = false;
  }
};

const handleClose = () => {
  emit('close');
};

const handleConfirm = () => {
  emit('confirm', currentFolder.value.id, currentFolder.value.name);
};

watch(
  () => [props.visible, props.panType] as const,
  ([vis]) => {
    if (vis) {
      breadcrumbs.value = [{ id: '0', name: '根目录' }];
      folders.value = [];
      errorMsg.value = '';
      showNewFolder.value = false;
      newFolderName.value = '';
      loadCurrentFolders();
    } else {
      folderReqSeq++;
      isLoading.value = false;
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.picker-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.picker-modal {
  width: 480px;
  max-width: 90vw;
  height: 460px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-light);
}

.picker-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-surface-secondary, rgba(0, 0, 0, 0.015));
}

.picker-breadcrumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  min-width: 0;
  flex: 1;
}

.crumb-sep {
  color: var(--text-tertiary, var(--text-secondary));
}

.crumb-btn {
  border: none;
  background: transparent;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.crumb-btn:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.crumb-btn.current {
  color: var(--text-primary);
  font-weight: 600;
}

.new-folder-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-surface-hover);
}

.new-folder-input {
  flex: 1;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.new-folder-input:focus {
  border-color: var(--color-accent);
}

.picker-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
}

.picker-state {
  height: 100%;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.picker-state.error {
  color: #ef4444;
}

.spin-icon {
  animation: pickerSpin 1s linear infinite;
}

@keyframes pickerSpin {
  100% {
    transform: rotate(360deg);
  }
}

.folder-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.folder-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.folder-row:hover {
  background: var(--bg-surface-hover);
}

.folder-icon {
  flex-shrink: 0;
  color: var(--color-accent);
}

.folder-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.enter-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
  opacity: 0.7;
}

.picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-surface);
}

.target-hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
