<template>
  <div class="dropdown-container">
    <VButton
      variant="icon"
      class="func-btn"
      :class="{ active: isOpen }"
      v-tooltip="isOpen ? '' : tooltip"
      @click="toggle"
    >
      <VIcon name="cloud-download" :size="16" />
      <div v-if="items.length > 0" class="sniff-badge">{{ items.length > 99 ? '99+' : items.length }}</div>
    </VButton>
    <div v-if="isOpen" class="dropdown-backdrop" @click.stop="close"></div>
    <div v-if="isOpen" class="dropdown-menu">
      <div class="dropdown-header">
        <span class="dropdown-title">网盘嗅探 ({{ items.length }})</span>
        <VButton v-if="items.length > 0" variant="text" size="small" class="text-btn" @click.stop="clear">清空</VButton>
      </div>
      <div class="dropdown-items">
        <div v-if="items.length === 0" class="dropdown-empty">当前页面未检测到网盘分享链接</div>
        <div
          v-for="item in items"
          :key="item.url"
          class="dropdown-item"
          @click="handleParse(item)"
        >
          <div class="pan-icon-badge">
            <VIcon name="cloud" :size="15" />
          </div>
          <div class="item-info">
            <div class="item-top-row">
              <span class="pan-type-tag">{{ item.panName }}</span>
              <span v-if="item.password" class="pan-pwd-tag">提取码: {{ item.password }}</span>
            </div>
            <div class="item-title" :title="item.title || item.url">{{ item.title || item.url }}</div>
            <div v-if="item.title" class="item-url" :title="item.url">{{ item.url }}</div>
          </div>
          <div class="item-actions">
            <VButton variant="icon" class="icon-action-btn" @click.stop="copyItem(item)" title="复制链接">
              <VIcon name="copy-text" :size="14" />
            </VButton>
            <VButton variant="icon" class="icon-action-btn" @click.stop="handleParse(item)" title="解析">
              <VIcon name="cloud-download" :size="14" />
            </VButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import { useMessage } from '@/composables/useMessage';
import type { SniffedPanLink } from '@/composables/pan/shareTextParser';

defineProps<{
  tooltip?: string;
  items: SniffedPanLink[];
}>();

const emit = defineEmits<{
  (e: 'clear'): void;
  (e: 'parse', item: SniffedPanLink): void;
}>();

const { showMessage } = useMessage();
const isOpen = ref(false);

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const close = () => {
  isOpen.value = false;
};

const clear = () => {
  emit('clear');
};

const handleParse = (item: SniffedPanLink) => {
  isOpen.value = false;
  emit('parse', item);
};

const copyItem = async (item: SniffedPanLink) => {
  const text = item.password ? `${item.url} 提取码: ${item.password}` : item.url;
  try {
    await navigator.clipboard.writeText(text);
    showMessage('网盘链接已复制', 'success');
  } catch {
    showMessage('复制失败', 'error');
  }
};
</script>

<style scoped lang="less">
.dropdown-container {
  position: relative;
  display: inline-flex;
}

.func-btn {
  width: 28px;
  height: 28px;
  position: relative;

  &.active {
    background-color: var(--bg-tertiary);
    color: var(--color-accent);
  }
}

.sniff-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background-color: var(--color-accent);
  color: var(--bg-surface);
  font-size: 9px;
  font-weight: 700;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  pointer-events: none;
  box-shadow: 0 0 0 1.5px var(--bg-surface);
}

.dropdown-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.dropdown-menu {
  position: absolute;
  top: 34px;
  right: 0;
  width: 340px;
  max-height: 400px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: var(--shadow-soft);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fadeInDown 0.15s ease;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  background-color: var(--bg-app);
}

.dropdown-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.text-btn {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 6px;
}

.dropdown-items {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropdown-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background-color: var(--bg-surface-hover);
  }
}

.pan-icon-badge {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background-color: var(--bg-app);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--border-light);
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-top-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pan-type-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-accent);
  background-color: var(--bg-app);
  border: 1px solid var(--border-light);
  padding: 1px 6px;
  border-radius: 4px;
}

.pan-pwd-tag {
  font-size: 11px;
  color: var(--text-secondary);
  background-color: var(--bg-app);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.item-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-url {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.icon-action-btn {
  width: 26px;
  height: 26px;
  color: var(--text-secondary);
}
</style>
