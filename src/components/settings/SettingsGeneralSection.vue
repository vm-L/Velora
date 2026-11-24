<template>
  <div class="settings-section-title">常规</div>
  <div class="settings-card">
    <div class="settings-row">
      <div class="settings-info">
        <h3>关闭窗口行为</h3>
        <p>指定点击主窗口右上角关闭按钮时的默认系统行为</p>
      </div>
      <v-switch
        :model-value="state.closeBehavior"
        :options="closeBehaviorOptions"
        @change="updateBehavior"
      />
    </div>

    <!-- 配置与资源 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info" style="min-width: 0; flex: 1;">
        <h3>配置与资源</h3>
        <p>导出或导入系统设置、解析规则、用户脚本与资源配置</p>
      </div>
      <div class="action-buttons" style="display: flex; gap: 8px;">
        <v-button variant="secondary" @click="handleImportResources">
          <VIcon name="import" :size="14" />
          <span>导入</span>
        </v-button>
        <v-button variant="secondary" @click="handleExportResources">
          <VIcon name="export" :size="14" />
          <span>导出</span>
        </v-button>
      </div>
    </div>

    <!-- 广告过滤规则 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>广告过滤规则</h3>
        <p>已启用 {{ totalActiveRulesCount.toLocaleString() }} 条过滤规则</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end; gap: 8px;">
        <v-button variant="secondary" :disabled="isUpdatingAllRules" @click="handleUpdateAllRules">
          <VIcon :name="isUpdatingAllRules ? 'loading' : 'refresh'" :size="14" :class="{ 'spin-icon': isUpdatingAllRules }" />
          <span>{{ isUpdatingAllRules ? '更新中' : '更新' }}</span>
        </v-button>
        <v-button variant="secondary" @click="showAdBlockModal = true">
          <VIcon name="edit" :size="14" />
          <span>编辑</span>
        </v-button>
      </div>
    </div>

    <!-- 网盘账号管理 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>网盘账号</h3>
        <p>{{ loggedInPanCountText }}</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-button variant="secondary" @click="showPanAccountsModal = true">
          <VIcon name="cloud" :size="14" />
          <span>管理</span>
        </v-button>
      </div>
    </div>
  </div>

  <AdBlockDialog v-model:visible="showAdBlockModal" />

  <!-- Unified Config & Resources Backup Dialog -->
  <ConfigBackupDialog
    v-model:visible="showBackupDialog"
    :mode="backupDialogMode"
    :backup-data="pendingImportData"
    @confirm-export="handleConfirmExport"
    @confirm-import="handleConfirmImport"
    @cancel="pendingImportData = null"
  />

  <PanAccountsModal v-model:visible="showPanAccountsModal" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSettings } from '@/composables/useSettings';
import { useMessage } from '@/composables/useMessage';
import { usePanAccounts } from '@/composables/usePanAccounts';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VSwitch, { type VSwitchOption } from '@/components/base/VSwitch.vue';
import AdBlockDialog from '@/components/features/AdBlockDialog.vue';
import ConfigBackupDialog from '@/components/features/ConfigBackupDialog.vue';
import PanAccountsModal from '@/components/settings/PanAccountsModal.vue';
import type { ConfigBackupSectionKey } from '@/types/backup';

const closeBehaviorOptions: VSwitchOption[] = [
  { label: '隐藏到托盘', value: 'tray' },
  { label: '直接退出', value: 'quit' }
];

const {
  state,
  setCloseBehavior,
  syncAllAdBlockSources,
  exportConfigBackup,
  importConfigBackup
} = useSettings();
const { showMessage } = useMessage();
const { panAccounts, loadAccounts: loadPanAccounts } = usePanAccounts();

const showPanAccountsModal = ref(false);

onMounted(async () => {
  await loadPanAccounts();
});

const loggedInPanCountText = computed(() => {
  const count = panAccounts.value.length;
  if (count === 0) return '暂无已登录网盘账号';
  return `已登录 ${count} 个网盘账号`;
});

const updateBehavior = (behavior: string) => {
  setCloseBehavior(behavior);
};

const showBackupDialog = ref(false);
const backupDialogMode = ref<'export' | 'import'>('export');
const pendingImportData = ref<any>(null);

const handleExportResources = () => {
  backupDialogMode.value = 'export';
  showBackupDialog.value = true;
};

const handleConfirmExport = async (selectedKeys: ConfigBackupSectionKey[]) => {
  try {
    const res = await exportConfigBackup(selectedKeys);
    if (res.success && res.filePath) {
      showMessage(`配置备份已导出至: ${res.filePath}`, 'success');
    } else if (res.error) {
      showMessage(`导出失败: ${res.error}`, 'error');
    }
  } catch (err: any) {
    showMessage(`导出失败: ${err.message}`, 'error');
  }
};

const handleImportResources = async () => {
  try {
    const res = await window.electronAPI.importResourcesJson();
    if (res.cancelled) return;
    if (!res.success || !res.data) {
      showMessage(res.error || '导入备份文件无效', 'error');
      return;
    }
    pendingImportData.value = res.data;
    backupDialogMode.value = 'import';
    showBackupDialog.value = true;
  } catch (err: any) {
    showMessage(`读取导入文件失败: ${err.message}`, 'error');
  }
};

const handleConfirmImport = async (payload: { selectedKeys: ConfigBackupSectionKey[]; mode: 'merge' | 'overwrite' }) => {
  if (!pendingImportData.value) return;
  try {
    await importConfigBackup(pendingImportData.value, payload.selectedKeys, payload.mode);
    const modeText = payload.mode === 'overwrite' ? '覆盖重置' : '增量合并';
    showMessage(`所选配置项已成功以【${modeText}】模式完成导入！`, 'success');
  } catch (err: any) {
    showMessage(`导入失败: ${err.message}`, 'error');
  } finally {
    pendingImportData.value = null;
  }
};

const showAdBlockModal = ref(false);
const isUpdatingAllRules = ref(false);

const totalActiveRulesCount = computed(() => {
  return state.adBlockSources
    .filter(s => s.enabled)
    .reduce((acc, s) => acc + (s.ruleCount || 0), 0);
});

const handleUpdateAllRules = async () => {
  if (isUpdatingAllRules.value) return;
  isUpdatingAllRules.value = true;
  const msgId = showMessage('正在同步更新所有启用的广告过滤规则', 'loading', 0);

  try {
    await syncAllAdBlockSources();
    showMessage(`规则同步完成，当前已生效 ${totalActiveRulesCount.value.toLocaleString()} 条过滤规则`, 'success', 2000, undefined, msgId);
  } catch (err: any) {
    showMessage(`更新失败: ${err.message}`, 'error', 3000, undefined, msgId);
  } finally {
    isUpdatingAllRules.value = false;
  }
};
</script>
