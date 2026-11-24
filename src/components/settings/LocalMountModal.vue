<template>
  <div v-if="visible" class="modal-overlay" v-overlay-close="close">
    <div class="modal-content" style="max-width: 680px; width: 90vw;">
      <div class="modal-header">
        <h3>挂载本地目录</h3>
        <v-button variant="icon" class="modal-close-btn" @click="close">
          <VIcon name="close" :size="20" />
        </v-button>
      </div>
      <div class="modal-body" style="padding: 16px 20px; max-height: 60vh; overflow-y: auto;">
        <div v-if="!state.localResources || state.localResources.length === 0" class="empty-state" style="padding: 30px 0;">
          暂未挂载任何本地目录
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 8px;">
          <div
            v-for="(item, index) in state.localResources"
            :key="item.id"
            class="settings-row"
            style="border: 1px solid var(--border-light); border-radius: 8px; padding: 10px 14px; background: var(--bg-hover-soft);"
            @dragover.prevent @dragenter.prevent
            @drop="onDrop($event, index)"
          >
            <div class="drag-handle" title="拖动排序" draggable="true" @dragstart="onDragStart($event, index)">
              <VIcon name="drag-handle" :size="14" />
            </div>

            <template v-if="editingId === item.id">
              <div class="settings-info edit-mode-info" @focusout="handleEditFocusOut($event, index)">
                <v-input v-model="editTempName" type="text" class="inline-input name-input" placeholder="挂载名称" @enter="saveEdit(index)" />
                <div class="dir-input-group flex-1" style="display: flex; gap: 8px; align-items: center;">
                  <v-input v-model="editTempPath" type="text" class="inline-input url-input flex-1" placeholder="本地目录路径" @enter="saveEdit(index)" />
                  <v-button variant="secondary" @mousedown.prevent @click="handleSelectEditLocalDir">
                    <VIcon name="folder" :size="14" />
                    <span>选择目录</span>
                  </v-button>
                </div>
              </div>
              <div class="action-buttons">
                <v-button variant="secondary" @mousedown.prevent @click="cancelEdit">
                  <VIcon name="close" :size="14" />
                  <span>取消</span>
                </v-button>
                <v-button variant="primary" @mousedown.prevent @click="saveEdit(index)">
                  <VIcon name="check" :size="14" />
                  <span>保存</span>
                </v-button>
              </div>
            </template>
            <template v-else>
              <div class="settings-info resource-info">
                <h3>{{ item.name }}</h3>
                <p>{{ item.path || item.url }}</p>
              </div>
              <div class="action-buttons">
                <v-button variant="secondary" @click="startEdit(item)">
                  <VIcon name="edit" :size="14" />
                  <span>编辑</span>
                </v-button>
                <v-button variant="danger-soft" @click="removeLocalResource(index)">
                  <VIcon name="trash" :size="14" />
                  <span>删除</span>
                </v-button>
              </div>
            </template>
          </div>
        </div>

        <!-- Add New Local Resource inside Modal -->
        <div class="settings-row add-row" style="margin-top: 14px; border: 1px dashed var(--border-color); border-radius: 8px; padding: 12px;">
          <v-input v-model="newLocalName" type="text" placeholder="挂载名称" class="inline-input name-input" style="max-width: 140px;" />
          <v-input v-model="newLocalPath" type="text" placeholder="本地文件夹路径" class="inline-input url-input flex-1" />
          <v-button variant="secondary" @mousedown.prevent @click="handleSelectNewLocalDir">
            <VIcon name="folder" :size="14" />
            <span>选择目录</span>
          </v-button>
          <v-button variant="primary" :disabled="!newLocalName || !newLocalPath" @click="addLocalResource">
            <VIcon name="plus" :size="14" />
            <span>添加</span>
          </v-button>
        </div>
      </div>
      <div class="modal-footer" style="padding: 12px 20px; border-top: 1px solid var(--border-light); display: flex; justify-content: flex-end;">
        <v-button variant="secondary" @click="close">
          <VIcon name="check" :size="14" />
          <span>完成</span>
        </v-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSettings, type ResourceItem } from '@/composables/useSettings';
import { useConfirm } from '@/composables/useConfirm';
import { useMessage } from '@/composables/useMessage';
import {
  generateResourceId,
  parseRowDropSourceIndex,
  reorderList,
  startRowDrag
} from '@/components/settings/settingsHelpers';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInput from '@/components/base/VInput.vue';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();

const close = () => {
  emit('update:visible', false);
};

const { state, saveLocalResources } = useSettings();
const { confirm } = useConfirm();
const { showMessage } = useMessage();

const newLocalName = ref('');
const newLocalPath = ref('');
const editingId = ref<string | null>(null);
const editTempName = ref('');
const editTempPath = ref('');
const isSelectingDirectory = ref(false);

const handleSelectNewLocalDir = async () => {
  isSelectingDirectory.value = true;
  try {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      newLocalPath.value = dir;
      if (!newLocalName.value) {
        // 提取最后一级目录名作为默认资源名称
        const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/);
        newLocalName.value = parts[parts.length - 1] || '本地目录';
      }
    }
  } finally {
    setTimeout(() => {
      isSelectingDirectory.value = false;
    }, 300);
  }
};

const handleSelectEditLocalDir = async () => {
  isSelectingDirectory.value = true;
  try {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      editTempPath.value = dir;
    }
  } finally {
    setTimeout(() => {
      isSelectingDirectory.value = false;
    }, 300);
  }
};

const addLocalResource = () => {
  if (!newLocalName.value || !newLocalPath.value) return;
  const resources = [...(state.localResources || [])];
  resources.push({
    id: generateResourceId(),
    name: newLocalName.value,
    path: newLocalPath.value,
    url: newLocalPath.value
  });
  saveLocalResources(resources);
  newLocalName.value = '';
  newLocalPath.value = '';
  showMessage('本地资源挂载成功', 'success');
};

const removeLocalResource = async (index: number) => {
  const resource = state.localResources[index];
  const confirmed = await confirm({
    title: '移除本地资源',
    message: `确定要移除本地挂载目录 "${resource.name}" 吗？（不会删除本地实际文件）`,
    confirmText: '移除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  const resources = [...state.localResources];
  resources.splice(index, 1);
  saveLocalResources(resources);
  showMessage(`已移除 "${resource.name}"`, 'success');
};

const startEdit = (item: ResourceItem) => {
  editingId.value = item.id;
  editTempName.value = item.name;
  editTempPath.value = item.path || item.url || '';
};

const cancelEdit = () => {
  editingId.value = null;
  editTempName.value = '';
  editTempPath.value = '';
};

const saveEdit = (index: number) => {
  if (!editingId.value) return;
  const trimmedName = editTempName.value.trim();
  const trimmedPath = editTempPath.value.trim();
  if (trimmedName && trimmedPath) {
    const resources = [...state.localResources];
    if (resources[index]) {
      resources[index] = {
        ...resources[index],
        name: trimmedName,
        path: trimmedPath,
        url: trimmedPath
      };
      saveLocalResources(resources);
    }
  }
  showMessage('已保存修改', 'success');
  cancelEdit();
};

const handleEditFocusOut = (e: FocusEvent, index: number) => {
  if (isSelectingDirectory.value) {
    return;
  }
  const currentTarget = e.currentTarget as HTMLElement;
  const relatedTarget = e.relatedTarget as HTMLElement;
  const parentRow = currentTarget.closest('.settings-row');
  if (parentRow && relatedTarget && parentRow.contains(relatedTarget)) {
    return;
  }
  if (editingId.value) {
    saveEdit(index);
  }
};

const onDragStart = (e: DragEvent, index: number) => {
  startRowDrag(e, 'local', index);
};

const onDrop = (e: DragEvent, targetIndex: number) => {
  const sourceIndex = parseRowDropSourceIndex(e, 'local', targetIndex);
  if (sourceIndex === null) return;
  saveLocalResources(reorderList(state.localResources, sourceIndex, targetIndex));
};
</script>
