<template>
  <div class="settings-section-title">CMS 资源</div>
  <div class="settings-card">
    <div v-for="(item, index) in state.cmsResources" :key="item.id" class="settings-row"
      @dragover.prevent @dragenter.prevent
      @drop="onDrop($event, index)">

      <div class="drag-handle" title="拖动排序" draggable="true" @dragstart="onDragStart($event, index)">
        <VIcon name="drag-handle" :size="14" />
      </div>

      <template v-if="editingId === item.id">
        <div class="settings-info edit-mode-info" @focusout="handleEditFocusOut($event, index)">
          <v-input v-model="editTempName" type="text" class="inline-input name-input" placeholder="名称" @enter="saveEdit(index)" />
          <v-input v-model="editTempUrl" type="text" class="inline-input url-input flex-1" placeholder="URL" @blur="editTempUrl = formatUrlPrefix(editTempUrl)" @enter="saveEdit(index)" />
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
          <p>{{ item.url }}</p>
        </div>
        <div class="action-buttons">
          <v-button variant="secondary" @click="startEdit(item)">
            <VIcon name="edit" :size="14" />
            <span>编辑</span>
          </v-button>
          <v-button variant="danger-soft" @click="removeCmsResource(index)">
            <VIcon name="trash" :size="14" />
            <span>删除</span>
          </v-button>
        </div>
      </template>
    </div>

    <!-- Add New CMS Resource -->
    <div class="settings-row add-row">
      <v-input v-model="newCmsName" type="text" placeholder="资源名称" class="inline-input name-input" />
      <v-input v-model="newCmsUrl" type="text" placeholder="https://" class="inline-input url-input flex-1" @blur="newCmsUrl = formatUrlPrefix(newCmsUrl)" @enter="addCmsResource" />
      <v-button variant="primary" :disabled="!newCmsName || !newCmsUrl" @click="addCmsResource">
        <VIcon name="plus" :size="14" />
        <span>添加</span>
      </v-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSettings, type ResourceItem } from '@/composables/useSettings';
import { useConfirm } from '@/composables/useConfirm';
import { useMessage } from '@/composables/useMessage';
import { useOpenedCMS } from '@/composables/useOpenedCMS';
import {
  formatUrlPrefix,
  generateResourceId,
  parseRowDropSourceIndex,
  reorderList,
  startRowDrag
} from '@/components/settings/settingsHelpers';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInput from '@/components/base/VInput.vue';

const { state, saveCmsResources } = useSettings();
const { confirm } = useConfirm();
const { showMessage } = useMessage();
const { updateCMSUrl } = useOpenedCMS();

const newCmsName = ref('');
const newCmsUrl = ref('https://');
const editingId = ref<string | null>(null);
const editTempName = ref('');
const editTempUrl = ref('');

const addCmsResource = () => {
  const formattedUrl = formatUrlPrefix(newCmsUrl.value);
  const trimmedName = newCmsName.value.trim();
  if (!trimmedName || !formattedUrl) return;
  const resources = [...state.cmsResources];
  resources.push({
    id: generateResourceId(),
    name: trimmedName,
    url: formattedUrl
  });
  saveCmsResources(resources);
  newCmsName.value = '';
  newCmsUrl.value = 'https://';
  showMessage(`已添加 "${trimmedName}"`, 'success');
};

const removeCmsResource = async (index: number) => {
  const resource = state.cmsResources[index];
  const confirmed = await confirm({
    title: '删除资源',
    message: `确定要删除 CMS 资源 "${resource.name}" 吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  const resources = [...state.cmsResources];
  resources.splice(index, 1);
  saveCmsResources(resources);
  showMessage(`已删除 "${resource.name}"`, 'success');
};

const startEdit = (item: ResourceItem) => {
  editingId.value = item.id;
  editTempName.value = item.name;
  editTempUrl.value = item.url || '';
};

const cancelEdit = () => {
  editingId.value = null;
  editTempName.value = '';
  editTempUrl.value = '';
};

const saveEdit = (index: number) => {
  if (!editingId.value) return;
  const trimmedName = editTempName.value.trim();
  const formattedUrl = formatUrlPrefix(editTempUrl.value);
  if (trimmedName && formattedUrl) {
    const resources = [...state.cmsResources];
    if (resources[index]) {
      resources[index] = { ...resources[index], name: trimmedName, url: formattedUrl };
      saveCmsResources(resources);
      updateCMSUrl(resources[index].id, formattedUrl);
    }
  }
  showMessage('已保存修改', 'success');
  cancelEdit();
};

const handleEditFocusOut = (e: FocusEvent, index: number) => {
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
  startRowDrag(e, 'cms', index);
};

const onDrop = (e: DragEvent, targetIndex: number) => {
  const sourceIndex = parseRowDropSourceIndex(e, 'cms', targetIndex);
  if (sourceIndex === null) return;
  saveCmsResources(reorderList(state.cmsResources, sourceIndex, targetIndex));
};
</script>
