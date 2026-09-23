<template>
  <Teleport to="body">
    <transition name="dialog-fade">
      <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
        <div class="modal-content config-backup-modal">
          <div class="modal-header">
            <div class="header-title-group">
              <v-icon :name="mode === 'export' ? 'export' : 'import'" :size="18" class="header-icon" />
              <h3>{{ mode === 'export' ? '导出配置备份' : '导入配置备份' }}</h3>
            </div>
            <v-button variant="icon" class="modal-close-btn" @click="handleCancel" title="关闭">
              <v-icon name="close" :size="16" />
            </v-button>
          </div>

          <div class="modal-body">
            <!-- 提示与全选工具栏 -->
            <div class="toolbar-row">
              <div class="summary-text">
                <span>{{ mode === 'export' ? '请勾选需要导出的设置与资源项' : '请勾选需要恢复的设置与资源项' }}</span>
                <span class="count-badge">已选 {{ selectedKeys.length }} / {{ availableSections.length }} 项</span>
              </div>
              <div class="quick-actions">
                <v-button variant="text" size="small" class="text-btn" @click="selectAll">全选</v-button>
                <span class="divider">/</span>
                <v-button variant="text" size="small" class="text-btn" @click="toggleInvert">反选</v-button>
              </div>
            </div>

            <!-- 选项列表 -->
            <div class="section-list custom-scroll">
              <div
                v-for="item in availableSections"
                :key="item.key"
                class="section-item"
                :class="{ 'is-selected': isSelected(item.key) }"
                @click="toggleSelect(item.key)"
              >
                <div class="item-checkbox" @click.stop>
                  <v-checkbox
                    :model-value="isSelected(item.key)"
                    @change="toggleSelect(item.key)"
                  />
                </div>
                <div class="item-icon-wrapper">
                  <v-icon :name="item.icon as any" :size="18" />
                </div>
                <div class="item-info">
                  <div class="item-title-row">
                    <span class="item-title">{{ item.title }}</span>
                    <span class="item-category-tag">{{ item.category }}</span>
                  </div>
                  <div class="item-desc">{{ item.description }}</div>
                </div>
                <div class="item-stat-badge">
                  {{ getItemStatText(item.key) }}
                </div>
              </div>
            </div>

            <!-- 导入模式下的冲突合并策略选择 -->
            <div v-if="mode === 'import'" class="import-strategy-section">
              <div class="strategy-title">遇到重复条目时的冲突策略</div>
              <div class="strategy-options">
                <div
                  class="strategy-card"
                  :class="{ active: importMode === 'merge' }"
                  @click="importMode = 'merge'"
                >
                  <div class="strategy-header">
                    <span class="strategy-radio"></span>
                    <span class="strategy-name">增量合并（推荐）</span>
                  </div>
                  <div class="strategy-desc">保持当前已有数据，仅追加备份中不存在的新站点、规则与脚本</div>
                </div>

                <div
                  class="strategy-card"
                  :class="{ active: importMode === 'overwrite' }"
                  @click="importMode = 'overwrite'"
                >
                  <div class="strategy-header">
                    <span class="strategy-radio"></span>
                    <span class="strategy-name text-danger">覆盖重置</span>
                  </div>
                  <div class="strategy-desc">使用备份文件直接覆盖当前系统对应模块的所有已有数据</div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <v-button variant="secondary" @click="handleCancel">取消</v-button>
            <v-button
              variant="primary"
              :disabled="selectedKeys.length === 0"
              @click="handleConfirm"
            >
              {{ mode === 'export' ? `确认导出 (${selectedKeys.length})` : `确认导入 (${selectedKeys.length})` }}
            </v-button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { BACKUP_SECTIONS, type ConfigBackupSectionKey, type ConfigBackupSectionMeta } from '@/types/backup';
import { useSettings } from '@/composables/useSettings';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VCheckbox from '@/components/base/VCheckbox.vue';

const props = withDefaults(defineProps<{
  visible: boolean;
  mode: 'export' | 'import';
  backupData?: any; // 导入模式下读取解析到的 JSON 数据对象
}>(), {
  visible: false,
  mode: 'export',
  backupData: null
});

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'confirmExport', selectedKeys: ConfigBackupSectionKey[]): void;
  (e: 'confirmImport', payload: { selectedKeys: ConfigBackupSectionKey[]; mode: 'merge' | 'overwrite' }): void;
  (e: 'cancel'): void;
}>();

const { state } = useSettings();
const selectedKeys = ref<ConfigBackupSectionKey[]>([]);
const importMode = ref<'merge' | 'overwrite'>('merge');

// 根据导入数据或导出环境动态筛选可用模块（向下自适应兼容）
const availableSections = computed<ConfigBackupSectionMeta[]>(() => {
  if (props.mode === 'export') {
    return BACKUP_SECTIONS;
  }

  // 导入模式：检查传入的备份数据包含哪些模块
  const data = props.backupData?.data || {};
  return BACKUP_SECTIONS.filter((section) => {
    switch (section.key) {
      case 'general':
        return !!data.general;
      case 'download':
        return !!data.download;
      case 'videoCompress':
        return !!data.videoCompress;
      case 'lanShare':
        return !!data.lanShare;
      case 'externalSites':
        return !!(data.externalSites?.length || data.webResources?.length);
      case 'localResources':
        return !!data.localResources?.length;
      case 'cmsResources':
        return !!data.cmsResources?.length;
      case 'customParseRules':
        return !!(data.customParseRules && Object.keys(data.customParseRules).length > 0);
      case 'customScripts':
        return !!(
          (data.customScripts && Object.keys(data.customScripts).length > 0) ||
          (data.customStyles && Object.keys(data.customStyles).length > 0)
        );
      case 'adBlockSources':
        return !!data.adBlockSources?.length;
      default:
        return false;
    }
  });
});

// 计算每个条目的统计/预览文本
const getItemStatText = (key: ConfigBackupSectionKey): string => {
  if (props.mode === 'export') {
    switch (key) {
      case 'general':
        return state.theme === 'dark' ? '深色外观' : '浅色外观';
      case 'download':
        return `并发 ${state.maxConcurrentDownloads}`;
      case 'videoCompress':
        return state.enableVideoCompress ? `已启用 (>${state.videoCompressTargetGB}G)` : '未启用';
      case 'lanShare':
        return `端口 ${state.lanSharePort}`;
      case 'externalSites':
        return `${(state.externalSites || []).length} 个站点`;
      case 'localResources':
        return `${(state.localResources || []).length} 个目录`;
      case 'cmsResources':
        return `${(state.cmsResources || []).length} 个资源站`;
      case 'customParseRules': {
        const count = Object.values(state.customParseRules || {}).reduce((a, c) => a + (c?.length || 0), 0);
        return `${count} 条规则`;
      }
      case 'customScripts': {
        const count = Object.values(state.customScripts || {}).reduce((a, c) => a + (c?.length || 0), 0);
        return `${count} 个脚本`;
      }
      case 'adBlockSources':
        return `${(state.adBlockSources || []).length} 个规则源`;
      default:
        return '';
    }
  }

  // 导入模式统计
  const data = props.backupData?.data || {};
  switch (key) {
    case 'general':
      return data.general?.theme === 'dark' ? '深色外观' : '浅色外观';
    case 'download':
      return data.download?.maxConcurrentDownloads ? `并发 ${data.download.maxConcurrentDownloads}` : '下载参数';
    case 'videoCompress':
      return data.videoCompress?.enableVideoCompress ? '已启用' : '已关闭';
    case 'lanShare':
      return data.lanShare?.lanSharePort ? `端口 ${data.lanShare.lanSharePort}` : '局域网';
    case 'externalSites': {
      const list = data.externalSites || data.webResources || [];
      return `${list.length} 个站点`;
    }
    case 'localResources':
      return `${(data.localResources || []).length} 个目录`;
    case 'cmsResources':
      return `${(data.cmsResources || []).length} 个资源站`;
    case 'customParseRules': {
      const count = Object.values(data.customParseRules || {}).reduce((a: number, c: any) => a + (c?.length || 0), 0);
      return `${count} 条规则`;
    }
    case 'customScripts': {
      const count = Object.values(data.customScripts || {}).reduce((a: number, c: any) => a + (c?.length || 0), 0);
      return `${count} 个脚本`;
    }
    case 'adBlockSources':
      return `${(data.adBlockSources || []).length} 个规则源`;
    default:
      return '';
  }
};

const isSelected = (key: ConfigBackupSectionKey) => {
  return selectedKeys.value.includes(key);
};

const toggleSelect = (key: ConfigBackupSectionKey) => {
  if (isSelected(key)) {
    selectedKeys.value = selectedKeys.value.filter((k) => k !== key);
  } else {
    selectedKeys.value.push(key);
  }
};

const selectAll = () => {
  selectedKeys.value = availableSections.value.map((s) => s.key);
};

const toggleInvert = () => {
  const currentSet = new Set(selectedKeys.value);
  selectedKeys.value = availableSections.value
    .map((s) => s.key)
    .filter((k) => !currentSet.has(k));
};

// 监听打开状态，默认全选所有可用条目
watch(
  () => props.visible,
  (val) => {
    if (val) {
      importMode.value = 'merge';
      selectedKeys.value = availableSections.value.map((s) => s.key);
    }
  },
  { immediate: true }
);

watch(
  () => props.backupData,
  () => {
    if (props.visible) {
      selectedKeys.value = availableSections.value.map((s) => s.key);
    }
  }
);

const handleCancel = () => {
  emit('update:visible', false);
  emit('cancel');
};

const handleConfirm = () => {
  if (selectedKeys.value.length === 0) return;
  if (props.mode === 'export') {
    emit('confirmExport', [...selectedKeys.value]);
  } else {
    emit('confirmImport', {
      selectedKeys: [...selectedKeys.value],
      mode: importMode.value
    });
  }
  emit('update:visible', false);
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100000;
}

.modal-content.config-backup-modal {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.24);
  max-width: 620px;
  width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary);
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title-group h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-icon {
  color: var(--color-accent);
}

.modal-close-btn {
  color: var(--text-secondary) !important;
}

.modal-close-btn:hover {
  color: var(--text-primary) !important;
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0 10px 0;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.summary-text {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background-color: var(--border-light);
  color: var(--color-accent);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.quick-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.text-btn {
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.text-btn:hover {
  background-color: var(--border-light);
}

.divider {
  color: var(--border-color);
  user-select: none;
}

.section-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 330px;
  overflow-y: auto;
  padding-right: 2px;
}

.section-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background-color: var(--bg-surface);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.section-item:hover {
  border-color: var(--border-color);
  background-color: var(--bg-surface-hover);
}

.section-item.is-selected {
  border-color: var(--color-accent);
  background-color: color-mix(in srgb, var(--color-accent) 4%, var(--bg-surface));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.item-checkbox {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.item-icon-wrapper {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background-color: var(--border-light);
  color: var(--color-accent);
  flex-shrink: 0;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.section-item.is-selected .item-icon-wrapper {
  background-color: color-mix(in srgb, var(--color-accent) 12%, var(--bg-surface));
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.item-category-tag {
  font-size: 11px;
  color: var(--text-secondary);
  background-color: var(--border-light);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 400;
}

.item-desc {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-stat-badge {
  font-size: 12px;
  color: var(--text-secondary);
  background-color: var(--border-light);
  padding: 3px 9px;
  border-radius: 12px;
  white-space: nowrap;
  font-weight: 500;
  transition: all 0.2s ease;
}

.section-item.is-selected .item-stat-badge {
  color: var(--color-accent);
  font-weight: 600;
  background-color: color-mix(in srgb, var(--color-accent) 8%, var(--bg-surface));
}

.import-strategy-section {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

.strategy-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.strategy-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.strategy-card {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1.5px solid var(--border-light);
  background-color: var(--bg-surface);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.strategy-card:hover {
  border-color: var(--border-color);
  background-color: var(--bg-surface-hover);
}

.strategy-card.active {
  border-color: var(--color-accent);
  background-color: color-mix(in srgb, var(--color-accent) 5%, var(--bg-surface));
}

.strategy-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.strategy-radio {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--text-tertiary);
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.strategy-card.active .strategy-radio {
  border-color: var(--color-accent);
}

.strategy-card.active .strategy-radio::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--color-accent);
}

.strategy-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.strategy-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  padding-left: 22px;
}

.text-danger {
  color: var(--color-error, #ef4444);
}

.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-surface);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

/* Transitions */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-active .modal-content,
.dialog-fade-leave-active .modal-content {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-from .modal-content {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}

.dialog-fade-leave-to .modal-content {
  opacity: 0;
  transform: scale(0.96);
}
</style>
