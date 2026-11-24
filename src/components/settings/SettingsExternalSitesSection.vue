<template>
  <div class="settings-section-title">网站资源</div>
  <div class="settings-card">
    <div v-for="(item, index) in state.externalSites" :key="item.id" class="settings-row"
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
          <v-button variant="secondary" @click="managingParseFor = item">
            <VIcon name="magic" :size="14" />
            <span>解析</span>
          </v-button>
          <v-button variant="secondary" @click="managingScriptsFor = item">
            <VIcon name="js" :size="14" />
            <span>脚本</span>
          </v-button>
          <v-button variant="secondary" @click="managingStylesFor = item">
            <VIcon name="css" :size="14" />
            <span>样式</span>
          </v-button>
          <v-button variant="secondary" @click="clearingCacheFor = item">
            <VIcon name="clean" :size="14" />
            <span>缓存</span>
          </v-button>
          <v-button variant="secondary" @click="startEdit(item)">
            <VIcon name="edit" :size="14" />
            <span>编辑</span>
          </v-button>
          <v-button variant="danger-soft" @click="removeExternalSite(index)">
            <VIcon name="trash" :size="14" />
            <span>删除</span>
          </v-button>
        </div>
      </template>
    </div>

    <!-- Add New External Site -->
    <div class="settings-row add-row">
      <v-input v-model="newExtName" type="text" placeholder="网站名称" class="inline-input name-input" />
      <v-input v-model="newExtUrl" type="text" placeholder="https://" class="inline-input url-input flex-1" @blur="newExtUrl = formatUrlPrefix(newExtUrl)" @enter="addExternalSite" />
      <v-button variant="primary" :disabled="!newExtName || !newExtUrl" @click="addExternalSite">
        <VIcon name="plus" :size="14" />
        <span>添加</span>
      </v-button>
    </div>
  </div>

  <SiteRulesModals
    :parse-target="managingParseFor"
    :script-target="managingScriptsFor"
    :style-target="managingStylesFor"
    @close-parse="managingParseFor = null"
    @close-script="managingScriptsFor = null"
    @close-style="managingStylesFor = null"
  />

  <SiteCacheClearModal
    :target="clearingCacheFor"
    @close="clearingCacheFor = null"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSettings, type ResourceItem } from '@/composables/useSettings';
import { useConfirm } from '@/composables/useConfirm';
import { useMessage } from '@/composables/useMessage';
import { useOpenedResources } from '@/composables/useOpenedResources';
import { useWorkspaces } from '@/composables/useWorkspaces';
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
import SiteRulesModals from '@/components/settings/SiteRulesModals.vue';
import SiteCacheClearModal from '@/components/settings/SiteCacheClearModal.vue';

const { state, saveExternalSites } = useSettings();
const { confirm } = useConfirm();
const { showMessage } = useMessage();
const { updateResourceUrl, closeResource } = useOpenedResources();
const { resetWorkspace } = useWorkspaces();

const newExtName = ref('');
const newExtUrl = ref('https://');
const editingId = ref<string | null>(null);
const editTempName = ref('');
const editTempUrl = ref('');

const managingParseFor = ref<ResourceItem | null>(null);
const managingScriptsFor = ref<ResourceItem | null>(null);
const managingStylesFor = ref<ResourceItem | null>(null);
const clearingCacheFor = ref<ResourceItem | null>(null);

const addExternalSite = () => {
  const formattedUrl = formatUrlPrefix(newExtUrl.value);
  const trimmedName = newExtName.value.trim();
  if (!trimmedName || !formattedUrl) return;
  const sites = [...state.externalSites];
  sites.push({
    id: generateResourceId(),
    name: trimmedName,
    url: formattedUrl
  });
  saveExternalSites(sites);
  newExtName.value = '';
  newExtUrl.value = 'https://';
  showMessage(`已添加 "${trimmedName}"`, 'success');
};

const removeExternalSite = async (index: number) => {
  const site = state.externalSites[index];
  const confirmed = await confirm({
    title: '删除站点',
    message: `确定要删除外部站点 "${site.name}" 吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  const sites = [...state.externalSites];
  sites.splice(index, 1);
  saveExternalSites(sites);
  resetWorkspace(site.id);
  closeResource(site.id);
  window.electronAPI?.clearSiteCache?.(site.id, ['cache', 'cookies', 'history']).catch(() => {});
  showMessage(`已删除 "${site.name}"`, 'success');
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
    const sites = [...state.externalSites];
    if (sites[index]) {
      sites[index] = { ...sites[index], name: trimmedName, url: formattedUrl };
      saveExternalSites(sites);
      updateResourceUrl(sites[index].id, formattedUrl);
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
  startRowDrag(e, 'ext', index);
};

const onDrop = (e: DragEvent, targetIndex: number) => {
  const sourceIndex = parseRowDropSourceIndex(e, 'ext', targetIndex);
  if (sourceIndex === null) return;
  saveExternalSites(reorderList(state.externalSites, sourceIndex, targetIndex));
};
</script>
