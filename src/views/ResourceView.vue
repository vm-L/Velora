<template>
  <div v-if="type === 'ext'" class="workspace-wrapper">
    <!-- BrowserWorkspace is now managed globally in App.vue to preserve webviews -->
  </div>
  <div v-else class="view resource-view">
    <div class="skeleton-card">
      <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-text-group">
          <div class="skeleton-line title"></div>
          <div class="skeleton-line subtitle"></div>
        </div>
      </div>
      
      <div class="resource-info">
        <h1>{{ item?.name || '未知资源' }}</h1>
        <p class="url-text">{{ item?.url }}</p>
        <span class="badge">{{ type === 'cms' ? 'CMS 资源' : '网站资源' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSettings } from '../composables/useSettings'
import { useOpenedResources } from '../composables/useOpenedResources'

const route = useRoute()
const { state } = useSettings()
const { openResource } = useOpenedResources()

const type = computed(() => route.params.type as string)
const id = computed(() => route.params.id as string)

const item = computed(() => {
  if (type.value === 'cms') {
    return state.cmsResources.find(r => r.id === id.value)
  } else {
    return state.externalSites.find(r => r.id === id.value)
  }
})

watch(() => item.value, (newVal) => {
  if (type.value === 'ext' && newVal) {
    openResource(id.value, newVal.url)
  }
}, { immediate: true })
</script>

<style scoped lang="less">
.workspace-wrapper {
  flex: 1;
  display: flex;
  width: 100%;
  height: 100%;
}

.resource-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: var(--view-padding);
}

.skeleton-card {
  background: var(--bg-surface);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  width: 100%;
  max-width: 600px;
  padding: var(--card-padding);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid var(--border-color);
}

.skeleton-header {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.skeleton-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--border-light);
  animation: pulse 1.5s infinite ease-in-out;
}

.skeleton-text-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 12px;
  background: var(--border-light);
  border-radius: 4px;
  animation: pulse 1.5s infinite ease-in-out;
}

.skeleton-line.title {
  width: 40%;
  height: 16px;
}

.skeleton-line.subtitle {
  width: 70%;
}

.resource-info {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px dashed var(--border-color);
  width: 100%;
}

h1 {
  font-size: 24px;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.url-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
  font-family: monospace;
}

.badge {
  display: inline-block;
  background: var(--bg-surface-active);
  color: var(--color-accent);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}
</style>
