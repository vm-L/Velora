<template>
  <div v-if="visible" class="modal-overlay" v-overlay-close="close">
    <div class="modal-content" style="max-width: 640px; width: 90vw;">
      <div class="modal-header">
        <h3>网盘账号管理</h3>
        <v-button variant="icon" class="modal-close-btn" @click="close">
          <VIcon name="close" :size="20" />
        </v-button>
      </div>
      <div class="modal-body" style="padding: 16px 20px; max-height: 65vh; overflow-y: auto;">
        <div
          v-for="(pan, idx) in panList"
          :key="pan.type"
          class="pan-modal-item"
          :style="idx > 0 ? 'border-top: 1px solid var(--border-light);' : ''"
        >
          <div class="pan-item-info">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h4 style="margin: 0; font-size: 14px; font-weight: 600;">{{ pan.name }}</h4>
            </div>
            <p v-if="getPanAccount(pan.type)" style="margin: 4px 0 0; font-size: 12px; color: var(--text-secondary);">
              {{ formatAccountDisplay(getPanAccount(pan.type)) }}
            </p>
            <p v-else style="margin: 4px 0 0; font-size: 12px; color: var(--text-muted);">
              未登录
            </p>
          </div>
          <div class="action-buttons" style="display: flex; align-items: center; gap: 8px;">
            <v-button
              v-if="getPanAccount(pan.type)"
              variant="danger-soft"
              @click="handleLogoutPan(pan.type)"
            >
              <VIcon name="logout" :size="14" />
              <span>退出登录</span>
            </v-button>
            <v-button
              v-else
              variant="secondary"
              :disabled="!!isLoggingInPan"
              @click="handleLoginPan(pan.type)"
            >
              <VIcon :name="isLoggingInPan === pan.type ? 'loading' : 'login'" :size="14" :class="{ 'spin-icon': isLoggingInPan === pan.type }" />
              <span>{{ isLoggingInPan === pan.type ? '登录中' : '登录' }}</span>
            </v-button>
          </div>
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; padding: 12px 20px; border-top: 1px solid var(--border-light);">
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
import { useMessage } from '@/composables/useMessage';
import { usePanAccounts } from '@/composables/usePanAccounts';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';

interface PanMeta {
  type: string;
  name: string;
}

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
}>();

const close = () => {
  emit('update:visible', false);
};

const panList: PanMeta[] = [
  { type: 'quark', name: '夸克网盘' },
  { type: 'uc', name: 'UC网盘' },
  { type: 'baidu', name: '百度网盘' },
  { type: '123pan', name: '123云盘' },
  { type: 'xunlei', name: '迅雷云盘' },
  { type: '115', name: '115网盘' },
  { type: 'lanzou', name: '蓝奏云' },
  { type: '139', name: '中国移动云盘' },
  { type: 'guangya', name: '光鸭云盘' },
  { type: 'ilanzou', name: '蓝奏云优享版' },
];

const { panAccounts, loadAccounts: loadPanAccounts } = usePanAccounts();
const { showMessage } = useMessage();
const isLoggingInPan = ref<string | null>(null);

const getPanAccount = (type: string) => {
  return panAccounts.value.find(a => a.type === type);
};

const formatAccountDisplay = (account: any) => {
  if (!account) return '';
  const rawName = typeof account.name === 'string' ? account.name : '';
  const name = rawName.replace(/\d+([KMGT]?B)?\/\d+([KMGT]?B)?.*$/i, '').replace(/查看.*$/, '').trim() || '已登录';
  if (account.quotaText) {
    return `${name} · 容量：${account.quotaText}`;
  }
  return name;
};

const handleLoginPan = async (type: string) => {
  if (!window.electronAPI?.loginPanAccount) return;
  if (isLoggingInPan.value) return;
  isLoggingInPan.value = type;
  try {
    const res = await window.electronAPI.loginPanAccount(type);
    if (res && res.success) {
      await loadPanAccounts();
      showMessage('网盘账号登录成功，凭据已保存', 'success');
    } else if (res?.error) {
      showMessage(`登录失败: ${res.error}`, 'error');
    }
  } catch (err: any) {
    showMessage(`登录发生异常: ${err.message}`, 'error');
  } finally {
    isLoggingInPan.value = null;
  }
};

const handleLogoutPan = async (type: string) => {
  if (!window.electronAPI?.logoutPanAccount) return;
  try {
    await window.electronAPI.logoutPanAccount(type);
    await loadPanAccounts();
    showMessage('已成功注销网盘账号凭据', 'info');
  } catch (err: any) {
    showMessage(`注销失败: ${err.message}`, 'error');
  }
};
</script>
