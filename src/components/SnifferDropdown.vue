<template>
  <div class="dropdown-container">
    <button class="func-btn" :class="{ 'active': isOpen }" v-tooltip="isOpen ? '' : tooltip" @click="toggle">
      <slot name="icon"></slot>
      <div v-if="items.length > 0" class="sniff-badge">{{ items.length > 99 ? '99+' : items.length }}</div>
    </button>
    <div v-if="isOpen" class="dropdown-backdrop" @click.stop="close"></div>
    <div v-if="isOpen" class="dropdown-menu">
      <div class="dropdown-header">
        <span class="dropdown-title">{{ title }} ({{ items.length }})</span>
        <button class="text-btn" @click.stop="clear">清空</button>
      </div>
      <div class="dropdown-items">
        <div v-if="processedItems.length === 0" class="dropdown-empty">暂无捕获记录</div>
        <div v-for="item in processedItems" :key="item.url" class="dropdown-item" @click="onItemClick(item.url)">
          <div class="media-preview" v-if="type === 'image'">
            <img :src="item.url" referrerpolicy="no-referrer" />
          </div>
          <div class="media-preview video-icon" v-else>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
          <div class="item-info">
            <div class="item-url">{{ getBasename(item.url) }}</div>
            <div class="item-time">{{ formatTime(item.timestamp) }}</div>
          </div>
          <div class="item-actions">
            <button class="icon-action-btn" @click.stop="copyUrl(item.url)" title="复制链接">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button v-if="type === 'image'" class="icon-action-btn" @click.stop="copyData(item.url)"
              title="复制图片到剪贴板">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </button>
            <button class="icon-action-btn" @click.stop="saveLocal(item.url)" title="保存到本地">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    <SaveMediaDialog
      :visible="saveDialogVisible"
      @update:visible="saveDialogVisible = $event"
      :url="saveTargetUrl"
      :default-name="saveDefaultName"
      :default-dir="saveDefaultDir"
      :type="type"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SaveMediaDialog from './SaveMediaDialog.vue';
import { useMessage } from '../composables/useMessage';

const props = defineProps<{
  type: 'image' | 'video' | 'audio';
  title: string;
  tooltip: string;
  items: { url: string, timestamp: number; }[];
}>();

const emit = defineEmits(['clear', 'preview']);
const { showMessage } = useMessage();

const isOpen = ref(false);

const processedItems = computed(() => {
  const manifests = props.items.filter(item => {
    try {
      const pathname = new URL(item.url).pathname.toLowerCase();
      return pathname.endsWith('.m3u8') || pathname.endsWith('.mpd');
    } catch { return false; }
  });

  const manifestPaths = manifests.map(m => {
    try {
      const u = new URL(m.url);
      const parts = u.pathname.split('/');
      parts.pop();
      return { host: u.host, dir: parts.join('/') };
    } catch { return null; }
  }).filter(Boolean);

  const clustered = new Map<string, typeof props.items[0]>();

  props.items.forEach(item => {
    try {
      const u = new URL(item.url);
      const pathname = u.pathname.toLowerCase();
      
      if (pathname.endsWith('.ts') || pathname.endsWith('.m4a') || pathname.endsWith('.mp4')) {
        const parts = u.pathname.split('/');
        parts.pop();
        const dir = parts.join('/');
        if (manifestPaths.some(m => m?.host === u.host && m?.dir === dir)) {
          return;
        }
      }

      let base = u.origin + u.pathname;
      base = base.replace(/[-_]?(?:part|seg|segment|frag|fragment)?[-_]?\d+\.([a-zA-Z0-9]+)$/i, '.$1');
      
      const clusterKey = base;

      const existing = clustered.get(clusterKey);
      if (!existing || item.timestamp > existing.timestamp) {
        clustered.set(clusterKey, item);
      }
    } catch {
      clustered.set(item.url, item);
    }
  });

  return Array.from(clustered.values()).sort((a, b) => b.timestamp - a.timestamp);
});

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const close = () => {
  isOpen.value = false;
};

const clear = () => {
  emit('clear');
};

const onItemClick = (url: string) => {
  emit('preview', url);
};

const getBasename = (urlStr: string) => {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/');
    const base = parts[parts.length - 1];
    return base || u.hostname;
  } catch (e) {
    return urlStr.substring(0, 30) + '...';
  }
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
};

const copyUrl = (url: string) => {
  navigator.clipboard.writeText(url);
  showMessage('链接已复制', 'success');
};

const copyData = async (url: string) => {
  if (window.electronAPI && window.electronAPI.copyImage) {
    const success = await window.electronAPI.copyImage(url);
    if (success) {
      showMessage('图片已复制到剪贴板', 'success');
    } else {
      showMessage('复制失败：剪贴板可能不支持该格式或加载超时', 'error');
    }
  }
};

import { useSettings } from '../composables/useSettings';

const { state } = useSettings();

const saveDialogVisible = ref(false);
const saveTargetUrl = ref('');
const saveDefaultName = ref('');
const saveDefaultDir = ref('');

const saveLocal = (url: string) => {
  const name = getBasename(url);
  let dir = state.fileDirectory;
  if (props.type === 'image') dir = state.imageDirectory;
  else if (props.type === 'video') dir = state.videoDirectory;
  else if (props.type === 'audio') dir = state.audioDirectory;

  saveTargetUrl.value = url;
  saveDefaultName.value = name;
  saveDefaultDir.value = dir;
  saveDialogVisible.value = true;
  
  // Close the dropdown when opening dialog
  close();
}
</script>

<style scoped lang="less">
.dropdown-container {
  position: relative;
  display: flex;
}

.func-btn {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.func-btn svg {
  display: block;
}

.func-btn:hover,
.func-btn.active {
  background: var(--border-light);
  color: var(--text-primary);
}

.func-btn::before,
.func-btn::after {
  position: absolute;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transition-delay: 0.1s;
  pointer-events: none;
  z-index: 100;
}

.sniff-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background-color: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: bold;
  height: 16px;
  min-width: 16px;
  padding: 0 4px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 2px var(--bg-primary);
  pointer-events: none;
}

.dropdown-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 99;
  background: transparent;
  cursor: default;
}


.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
  width: 280px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-surface-hover);
  border-bottom: 1px solid var(--border-color);
}

.dropdown-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.text-btn {
  background: transparent;
  border: none;
  color: #ef4444;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.text-btn:hover {
  text-decoration: underline;
}

.dropdown-empty {
  padding: 24px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.dropdown-items {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.dropdown-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 10px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid var(--border-light);
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: var(--bg-surface-hover);
}

.media-preview {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: var(--border-color);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.media-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-icon {
  color: var(--text-secondary);
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-url {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.item-time {
  font-size: 10px;
  color: var(--text-secondary);
}

.item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.dropdown-item:hover .item-actions {
  opacity: 1;
}

.icon-action-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
}

.icon-action-btn:hover {
  background: var(--border-color);
  color: var(--color-accent);
}
</style>
