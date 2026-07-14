<template>
  <div v-if="type === 'ext'" class="workspace-wrapper">
    <BrowserWorkspace :resourceId="id as string" :resourceUrl="item?.url || ''" />
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
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSettings } from '../composables/useSettings'
import BrowserWorkspace from '../components/BrowserWorkspace.vue'

const route = useRoute()
const { state } = useSettings()

const type = computed(() => route.params.type as string)
const id = computed(() => route.params.id as string)

const item = computed(() => {
  if (type.value === 'cms') {
    return state.cmsResources.find(r => r.id === id.value)
  } else {
    return state.externalSites.find(r => r.id === id.value)
  }
})
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
  background: white;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.04);
  width: 100%;
  max-width: 600px;
  padding: var(--card-padding);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid #e2e8f0;
}

.pulse-header {
  width: 40%;
  height: 24px;
  background: #e2e8f0;
  border-radius: 4px;
  margin-bottom: 24px;
  animation: pulse 1.5s infinite ease-in-out;
}

.pulse-line {
  width: 100%;
  height: 12px;
  background: #f1f5f9;
  border-radius: 4px;
  margin-bottom: 12px;
  animation: pulse 1.5s infinite ease-in-out;
}

.pulse-line.short {
  width: 70%;
}

.resource-info {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px dashed #e2e8f0;
  width: 100%;
}

h1 {
  font-size: 24px;
  color: #1e293b;
  margin: 0 0 8px 0;
}

.url-text {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 16px 0;
  font-family: monospace;
}

.badge {
  display: inline-block;
  background: #eff6ff;
  color: #3b82f6;
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
