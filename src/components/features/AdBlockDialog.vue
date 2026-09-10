<template>
  <Teleport to="body">
    <div v-if="visible" class="adblock-overlay" @click.self="close" @mousedown.stop>
      <div class="adblock-modal">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-title">
            <VIcon name="shield" :size="18" style="margin-right: 6px;" />
            <span>广告过滤规则源管理</span>
          </div>
          <v-button variant="secondary" size="small" style="padding: 4px 6px; min-width: unset;" @click="close" title="关闭">
            <VIcon name="close" :size="14" />
          </v-button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <div class="action-bar">
            <div class="summary-info">
              已配置 <strong>{{ settingsState.adBlockSources.length }}</strong> 个规则源，已启用 <strong>{{ enabledSourcesCount }}</strong> 个 (共计 <strong>{{ totalActiveRulesCount.toLocaleString() }}</strong> 条有效规则)
            </div>
            <div class="bar-buttons">
              <v-button variant="secondary" size="small" :disabled="isSyncingAll" @click="handleSyncAll">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'spin-icon': isSyncingAll }">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                {{ isSyncingAll ? '更新中' : '更新全部' }}
              </v-button>
              <v-button variant="primary" size="small" @click="openAddModal">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                添加规则源
              </v-button>
            </div>
          </div>

          <!-- Source List -->
          <div class="source-list">
            <div 
              v-for="(source, index) in settingsState.adBlockSources" 
              :key="source.id" 
              class="source-card" 
              :class="{ 'is-disabled': !source.enabled }"
              @dragover.prevent 
              @dragenter.prevent
              @drop="onDrop($event, index)"
            >
              <div 
                class="drag-handle" 
                title="拖动排序" 
                draggable="true" 
                @dragstart="onDragStart($event, index)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="9" cy="5" r="1.2" fill="currentColor"></circle>
                  <circle cx="15" cy="5" r="1.2" fill="currentColor"></circle>
                  <circle cx="9" cy="12" r="1.2" fill="currentColor"></circle>
                  <circle cx="15" cy="12" r="1.2" fill="currentColor"></circle>
                  <circle cx="9" cy="19" r="1.2" fill="currentColor"></circle>
                  <circle cx="15" cy="19" r="1.2" fill="currentColor"></circle>
                </svg>
              </div>

              <div class="source-main">
                <div class="source-header-row">
                  <span class="source-name">{{ source.name }}</span>
                  <span v-if="source.isBuiltIn" class="badge-builtin">内置</span>
                  <span class="rule-count">{{ source.ruleCount.toLocaleString() }} 条规则</span>
                </div>
                <div class="source-url" :title="source.url">{{ source.url }}</div>
                <div class="source-meta">
                  <span>{{ source.lastUpdated ? '更新于 ' + formatTime(source.lastUpdated) : '未同步' }}</span>
                </div>
              </div>

              <div class="source-actions">
                <!-- Toggle Enable Switch -->
                <label class="switch-toggle" :title="source.enabled ? '停用' : '启用'">
                  <input type="checkbox" :checked="source.enabled" @change="toggleSourceEnable(source)" />
                  <span class="slider"></span>
                </label>

                <!-- Update Single Source -->
                <v-button variant="secondary" size="small" style="padding: 4px 6px; min-width: unset;" :disabled="syncingIds.includes(source.id)" @click="handleSyncSource(source)" title="更新规则">
                  <VIcon name="refresh" :size="14" :class="{ 'spin-icon': syncingIds.includes(source.id) }" />
                </v-button>

                <!-- Edit Source -->
                <v-button variant="secondary" size="small" style="padding: 4px 6px; min-width: unset;" @click="openEditModal(source)" title="编辑">
                  <VIcon name="edit" :size="14" />
                </v-button>

                <!-- Delete Source (Hidden for built-in) -->
                <v-button v-if="!source.isBuiltIn" variant="danger-soft" size="small" style="padding: 4px 6px; min-width: unset;" @click="confirmDeleteSource(source)" title="删除规则源">
                  <VIcon name="trash" :size="14" />
                </v-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Add / Edit Source Sub-Modal -->
      <div v-if="showEditForm" class="sub-modal-overlay" @click.self="showEditForm = false">
        <div class="sub-modal">
          <div class="sub-modal-header">
            <h3>{{ editingSourceId ? '编辑规则源' : '添加自定义规则源' }}</h3>
          </div>
          <div class="sub-modal-body">
            <div class="form-group">
              <label>规则源名称</label>
              <v-input v-model="formName" type="text" placeholder="例如: 屏蔽社交广告" />
            </div>
            <div class="form-group" style="margin-top: 12px;">
              <label>规则源 URL</label>
              <v-input v-model="formUrl" type="text" placeholder="https://example.com/rules.txt" />
            </div>
          </div>
          <div class="sub-modal-footer">
            <v-button variant="secondary" size="small" @click="showEditForm = false">取消</v-button>
            <v-button variant="primary" size="small" @click="saveSourceForm">保存</v-button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettings, type AdBlockSource } from '../../composables/useSettings';
import { useMessage } from '../../composables/useMessage';
import VButton from '../base/VButton.vue';
import VInput from '../base/VInput.vue';
import VIcon from '../base/VIcon.vue';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const { state: settingsState, saveAdBlockSources, syncAdBlockSourceItem, syncAllAdBlockSources, recompileRules } = useSettings();
const { showMessage } = useMessage();

const syncingIds = ref<string[]>([]);
const isSyncingAll = ref(false);

const showEditForm = ref(false);
const editingSourceId = ref<string | null>(null);
const formName = ref('');
const formUrl = ref('');

const enabledSourcesCount = computed(() => {
  return settingsState.adBlockSources.filter(s => s.enabled).length;
});

const totalActiveRulesCount = computed(() => {
  return settingsState.adBlockSources
    .filter(s => s.enabled)
    .reduce((acc, s) => acc + (s.ruleCount || 0), 0);
});

const close = () => {
  emit('update:visible', false);
};

const formatTime = (ts?: number) => {
  if (!ts) return '未同步';
  const now = Date.now();
  const diffSec = Math.floor((now - ts) / 1000);
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  return new Date(ts).toLocaleDateString();
};

const toggleSourceEnable = async (source: AdBlockSource) => {
  source.enabled = !source.enabled;
  await saveAdBlockSources([...settingsState.adBlockSources]);
  await recompileRules();
  showMessage(source.enabled ? `已启用 ${source.name}` : `已停用 ${source.name}`, 'info');
};

const handleSyncSource = async (source: AdBlockSource) => {
  if (syncingIds.value.includes(source.id)) return;
  syncingIds.value.push(source.id);
  const msgId = showMessage(`正在同步 ${source.name}`, 'loading', 0);

  const res = await syncAdBlockSourceItem(source.id);
  syncingIds.value = syncingIds.value.filter(id => id !== source.id);

  if (res.success) {
    showMessage(`成功同步 ${source.name} (${res.count} 条规则)`, 'success', 2000, undefined, msgId);
  } else {
    showMessage(`同步失败: ${res.error}`, 'error', 2500, undefined, msgId);
  }
};

const handleSyncAll = async () => {
  if (isSyncingAll.value) return;
  isSyncingAll.value = true;
  const msgId = showMessage('正在同步所有已启用的过滤规则源', 'loading', 0);

  try {
    const count = await syncAllAdBlockSources();
    showMessage(`成功完成 ${count} 个规则源的更新`, 'success', 2000, undefined, msgId);
  } catch (err: any) {
    showMessage(`同步异常: ${err.message}`, 'error', 2500, undefined, msgId);
  } finally {
    isSyncingAll.value = false;
  }
};

const openAddModal = () => {
  editingSourceId.value = null;
  formName.value = '';
  formUrl.value = '';
  showEditForm.value = true;
};

const openEditModal = (source: AdBlockSource) => {
  editingSourceId.value = source.id;
  formName.value = source.name;
  formUrl.value = source.url;
  showEditForm.value = true;
};

const saveSourceForm = async () => {
  const name = formName.value.trim();
  const url = formUrl.value.trim();

  if (!name || !url) {
    showMessage('请输入完整的规则源名称与 URL', 'error');
    return;
  }

  if (editingSourceId.value) {
    const s = settingsState.adBlockSources.find(item => item.id === editingSourceId.value);
    if (s) {
      s.name = name;
      s.url = url;
    }
  } else {
    const newId = 'custom_' + Date.now();
    settingsState.adBlockSources.push({
      id: newId,
      name,
      url,
      enabled: true,
      isBuiltIn: false,
      ruleCount: 0
    });
  }

  await saveAdBlockSources([...settingsState.adBlockSources]);
  showEditForm.value = false;
  showMessage('规则源配置保存成功', 'success');

  // Trigger sync if URL was added/updated
  const targetId = editingSourceId.value || settingsState.adBlockSources[settingsState.adBlockSources.length - 1].id;
  const target = settingsState.adBlockSources.find(i => i.id === targetId);
  if (target && target.enabled) {
    handleSyncSource(target);
  }
};

const confirmDeleteSource = async (source: AdBlockSource) => {
  if (source.isBuiltIn) {
    showMessage('内置规则源无法删除', 'warning');
    return;
  }

  settingsState.adBlockSources = settingsState.adBlockSources.filter(s => s.id !== source.id);
  await saveAdBlockSources([...settingsState.adBlockSources]);
  await recompileRules();
  showMessage(`已删除规则源 ${source.name}`, 'success');
};

const onDragStart = (e: DragEvent, index: number) => {
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ index }));
    e.dataTransfer.effectAllowed = 'move';
  }
};

const onDrop = async (e: DragEvent, targetIndex: number) => {
  if (!e.dataTransfer) return;
  const dataString = e.dataTransfer.getData('text/plain');
  if (!dataString) return;

  try {
    const data = JSON.parse(dataString);
    const sourceIndex = data.index;
    if (sourceIndex === undefined || sourceIndex === targetIndex) return;

    const items = [...settingsState.adBlockSources];
    const [movedItem] = items.splice(sourceIndex, 1);
    items.splice(targetIndex, 0, movedItem);

    await saveAdBlockSources(items);
  } catch {}
};
</script>

<style scoped lang="less">
.adblock-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  z-index: 2147483647;
  display: flex;
  justify-content: center;
  align-items: center;
}

.adblock-modal {
  width: 680px;
  max-width: 90vw;
  max-height: 82vh;
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
  height: 48px;
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
    color: var(--text-primary);
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
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-app);
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);

  .summary-info {
    font-size: 12px;
    color: var(--text-secondary);
    strong {
      color: var(--color-accent);
    }
  }

  .bar-buttons {
    display: flex;
    gap: 8px;
  }
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.source-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 14px;
  transition: all 0.2s ease;

  &.is-disabled {
    opacity: 0.6;
  }

  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    margin-right: 10px;
    cursor: grab;
    color: var(--text-tertiary, #999);
    transition: color 0.2s ease;

    &:hover {
      color: var(--text-primary);
    }

    &:active {
      cursor: grabbing;
    }
  }

  .source-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
  }

  .source-header-row {
    display: flex;
    align-items: center;
    gap: 8px;

    .source-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .badge-builtin {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(var(--color-accent-rgb, 59, 130, 246), 0.15);
      color: var(--color-accent);
      font-weight: 500;
    }

    .rule-count {
      font-size: 11px;
      color: var(--text-secondary);
      margin-left: auto;
    }
  }

  .source-url {
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: monospace;
  }

  .source-meta {
    font-size: 10px;
    color: var(--text-tertiary, #999);
  }

  .source-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 16px;
  }
}

.icon-action-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  &.danger-btn:hover {
    background: var(--color-error, #ef4444);
    color: white;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* Switch Toggle Styling */
.switch-toggle {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 18px;
  cursor: pointer;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--border-color);
    transition: .3s;
    border-radius: 18px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
    left: 2px;
    bottom: 2px;
    background-color: white;
    transition: .3s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: var(--color-accent);
  }

  input:checked + .slider:before {
    transform: translateX(16px);
  }
}

/* Sub-modal styling */
.sub-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2147483648;
  display: flex;
  justify-content: center;
  align-items: center;
}

.sub-modal {
  width: 440px;
  max-width: 90vw;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: var(--shadow-soft);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sub-modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.sub-modal-body label {
  font-size: 12px;
  color: var(--text-secondary);
  display: block;
  margin-bottom: 4px;
}

.sub-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}
</style>
