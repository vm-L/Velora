<template>
  <div class="dropdown-container">
    <button class="func-btn" :class="{ 'active': isOpen }" :data-tooltip="tooltip" @click="toggle">
      <slot name="icon"></slot>
    </button>
    <div v-if="isOpen" class="dropdown-backdrop" @click.stop="close"></div>
    <div v-if="isOpen" class="dropdown-menu">
      <div class="dropdown-header">
        <span class="dropdown-title">{{ title }} ({{ items.length }})</span>
        <button class="text-btn" @click.stop="clear">清空</button>
      </div>
      <div class="dropdown-items">
        <div v-if="items.length === 0" class="dropdown-empty">暂无捕获记录</div>
        <div v-for="group in groupedItems" :key="group.format" class="group-container">
          <div class="group-header" @click="toggleGroup(group.format)">
            <span class="group-title">{{ group.format }} ({{ group.items.length }})</span>
            <svg class="group-chevron" :class="{ 'is-open': expandedGroup === group.format }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
          <div class="group-body" v-show="expandedGroup === group.format">
            <div v-for="item in group.items" :key="item.url" class="dropdown-item" @click="onItemClick(item.url)">
              <div class="media-preview" v-if="type === 'image'">
                <img :src="item.url" referrerpolicy="no-referrer" />
              </div>
              <div class="media-preview video-icon" v-else>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </div>
              <div class="item-info">
                <div class="item-url" :title="item.url">{{ getBasename(item.url) }}</div>
                <div class="item-time">{{ formatTime(item.timestamp) }}</div>
              </div>
              <div class="item-actions">
                <button class="icon-action-btn" @click.stop="copyUrl(item.url)" title="复制链接">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                <button v-if="type === 'image'" class="icon-action-btn" @click.stop="copyData(item.url)" title="复制图片到剪贴板">
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useMessage } from '../composables/useMessage'

const props = defineProps<{
  type: 'image' | 'video'
  title: string
  tooltip: string
  items: { url: string, timestamp: number }[]
}>()

const emit = defineEmits(['clear', 'preview'])
const { showMessage } = useMessage()

const isOpen = ref(false)
const expandedGroup = ref<string | null>(null)

watch(isOpen, (newVal) => {
  if (!newVal) {
    expandedGroup.value = null
  }
})

const groupedItems = computed(() => {
  const groups: Record<string, typeof props.items> = {}
  props.items.forEach(item => {
    let ext = 'Other'
    try {
      const parsed = new URL(item.url)
      const pathname = parsed.pathname
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/)
      if (match) {
        ext = match[1].toUpperCase()
      } else {
        ext = 'Other'
      }
    } catch {
      ext = 'Other'
    }
    
    if (!groups[ext]) {
      groups[ext] = []
    }
    groups[ext].push(item)
  })

  return Object.keys(groups).map(format => ({
    format,
    items: [...groups[format]].sort((a, b) => b.timestamp - a.timestamp)
  })).sort((a, b) => b.items.length - a.items.length)
})

const toggleGroup = (format: string) => {
  if (expandedGroup.value === format) {
    expandedGroup.value = null
  } else {
    expandedGroup.value = format
  }
}

const toggle = () => {
  isOpen.value = !isOpen.value
}

const close = () => {
  isOpen.value = false
}

const clear = () => {
  emit('clear')
}

const onItemClick = (url: string) => {
  emit('preview', url)
}

const getBasename = (urlStr: string) => {
  try {
    const u = new URL(urlStr)
    const parts = u.pathname.split('/')
    const base = parts[parts.length - 1]
    return base || u.hostname
  } catch (e) {
    return urlStr.substring(0, 30) + '...'
  }
}

const formatTime = (ts: number) => {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

const copyUrl = (url: string) => {
  navigator.clipboard.writeText(url)
  showMessage('链接已复制', 'success')
}

const copyData = async (url: string) => {
  if (window.electronAPI && window.electronAPI.copyImage) {
    const success = await window.electronAPI.copyImage(url)
    if (success) {
      showMessage('图片已复制到剪贴板', 'success')
    } else {
      showMessage('复制失败：剪贴板可能不支持该格式或加载超时', 'error')
    }
  }
}

const saveLocal = (url: string) => {
  console.log('Save to local logic goes here', url)
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
  color: #64748b;
  transition: all 0.2s ease;
}

.func-btn svg {
  display: block;
}

.func-btn:hover, .func-btn.active {
  background: #f1f5f9;
  color: #0f172a;
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

/* Tooltip text */
.func-btn::before {
  content: attr(data-tooltip);
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(4px) scale(0.95);
  background: #1e293b;
  color: #ffffff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.func-btn::after {
  content: '';
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-2px);
  border-width: 6px;
  border-style: solid;
  border-color: transparent transparent #1e293b transparent;
}

.func-btn:hover::before {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(8px) scale(1);
}

.func-btn:hover::after {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(2px);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
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
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.dropdown-title {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
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
  color: #94a3b8;
  text-align: center;
}

.dropdown-items {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.group-container {
  display: flex;
  flex-direction: column;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8fafc;
  cursor: pointer;
  border-bottom: 1px solid #e2e8f0;
  user-select: none;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  position: sticky;
  top: 0;
  z-index: 2;
}

.group-header:hover {
  background: #f1f5f9;
}

.group-chevron {
  transition: transform 0.2s;
  color: #94a3b8;
}

.group-chevron.is-open {
  transform: rotate(180deg);
}

.group-body {
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
  border-bottom: 1px solid #f1f5f9;
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: #f8fafc;
}

.media-preview {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: #e2e8f0;
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
  color: #64748b;
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
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.item-time {
  font-size: 10px;
  color: #94a3b8;
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
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
}

.icon-action-btn:hover {
  background: #e2e8f0;
  color: #3b82f6;
}
</style>
