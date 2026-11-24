<template>
  <div v-if="target" class="modal-overlay" v-overlay-close="closeSiteCacheModal">
    <div class="modal-content" style="max-width: 440px; width: 90vw;">
      <div class="modal-header">
        <h3>清理缓存 - {{ target.name }}</h3>
        <v-button variant="icon" class="modal-close-btn" :disabled="isClearingSiteCache" @click="closeSiteCacheModal">
          <VIcon name="close" :size="20" />
        </v-button>
      </div>
      <div class="modal-body" style="padding: 16px 20px;">
        <div class="throttle-scope-modal-list">
          <v-checkbox
            v-for="opt in cacheClearScopeOptions"
            :key="opt.value"
            class="throttle-scope-modal-item"
            v-model="selectedCacheClearScopes"
            :value="opt.value"
            :disabled="isClearingSiteCache"
          >
            <div class="scope-item-content">
              <span class="scope-item-title">{{ opt.label }}</span>
              <span class="scope-item-desc">{{ opt.desc }}</span>
            </div>
          </v-checkbox>
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-light);">
        <v-button variant="secondary" :disabled="isClearingSiteCache" @click="closeSiteCacheModal">
          <VIcon name="close" :size="14" />
          <span>取消</span>
        </v-button>
        <v-button
          variant="danger-soft"
          :disabled="isClearingSiteCache || selectedCacheClearScopes.length === 0"
          @click="handleConfirmClearSiteCache"
        >
          <VIcon :name="isClearingSiteCache ? 'loading' : 'clean'" :size="14" :class="{ 'spin-icon': isClearingSiteCache }" />
          <span>{{ isClearingSiteCache ? '清理中' : '清理' }}</span>
        </v-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { ResourceItem } from '@/composables/useSettings';
import { useMessage } from '@/composables/useMessage';
import { useOpenedResources } from '@/composables/useOpenedResources';
import { useWorkspaces } from '@/composables/useWorkspaces';
import type { SiteCacheClearScope } from '@/utils/sitePartition';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VCheckbox from '@/components/base/VCheckbox.vue';

const props = defineProps<{
  target: ResourceItem | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { showMessage } = useMessage();
const { closeResource } = useOpenedResources();
const { getWorkspace, resetWorkspace } = useWorkspaces();

const selectedCacheClearScopes = ref<SiteCacheClearScope[]>(['cache', 'history']);
const isClearingSiteCache = ref(false);

const cacheClearScopeOptions: Array<{ label: string; desc: string; value: SiteCacheClearScope }> = [
  { label: '网页缓存', desc: '清理图片、脚本、音视频缓冲与离线缓存文件', value: 'cache' },
  { label: '浏览记录', desc: '清空已打开标签页、前进后退历史与嗅探记录，并重置该空间回到初始首页', value: 'history' },
  { label: 'Cookies 与登录态', desc: '清理站点 Cookies、登录状态与本地存储数据，清理后需重新登录', value: 'cookies' }
];

watch(() => props.target, (val) => {
  if (val) {
    selectedCacheClearScopes.value = ['cache', 'history'];
  }
});

const closeSiteCacheModal = () => {
  if (isClearingSiteCache.value) return;
  emit('close');
};

const handleConfirmClearSiteCache = async () => {
  const target = props.target;
  if (!target || isClearingSiteCache.value) return;
  const scopes = [...selectedCacheClearScopes.value];
  if (scopes.length === 0) {
    showMessage('请至少选择一项需要清理的内容', 'warning', 3000);
    return;
  }

  isClearingSiteCache.value = true;
  try {
    if (scopes.includes('history')) {
      const ws = getWorkspace(target.id);
      if (ws) {
        for (const tab of ws.tabs) {
          if (!tab.isBlank) {
            const webviewEl = document.getElementById(`webview-${tab.id}`) as any;
            try {
              webviewEl?.clearHistory?.();
            } catch {}
          }
        }
      }
      resetWorkspace(target.id);
      closeResource(target.id);
      await nextTick();
    }

    const res = await window.electronAPI?.clearSiteCache?.(target.id, scopes);
    if (res && !res.success) {
      showMessage(res.error || '清理缓存失败', 'error', 3000);
      return;
    }

    emit('close');
    showMessage(`已清理 "${target.name}" 的所选数据`, 'success', 2000);
  } catch (err: any) {
    showMessage(`清理缓存失败: ${err?.message || String(err)}`, 'error', 3000);
  } finally {
    isClearingSiteCache.value = false;
  }
};
</script>
