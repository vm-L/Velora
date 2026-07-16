<template>
  <TitleBar />
  <div class="content">
    <Sidebar />
    <div class="main-panel">
      <router-view v-slot="{ Component, route }">
        <transition name="fade" mode="out-in">
          <keep-alive>
            <component :is="Component" :key="route.fullPath" />
          </keep-alive>
        </transition>
      </router-view>

      <!-- Global Workspaces for true keep-alive (prevents webview reload) -->
      <BrowserWorkspace 
        v-for="res in openedResources" 
        :key="res.id"
        :resourceId="res.id"
        :resourceUrl="res.url"
        v-show="$route.params.type === 'ext' && $route.params.id === res.id"
        class="global-workspace"
      />
    </div>
  </div>
  <ConfirmDialog />
  <MessageBar />
  <NotificationBar />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import MessageBar from './components/MessageBar.vue'
import NotificationBar from './components/NotificationBar.vue'
import BrowserWorkspace from './components/BrowserWorkspace.vue'
import { useSettings } from './composables/useSettings'
import { useDownloads } from './composables/useDownloads'
import { useOpenedResources } from './composables/useOpenedResources'

const { loadSettings } = useSettings()
const { loadTasks, initListeners, isInitialized } = useDownloads()
const { openedResources } = useOpenedResources()

onMounted(async () => {
  loadSettings()
  if (!isInitialized.value) {
    await loadTasks()
    initListeners()
  }
})
</script>

<style lang="less">
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 40px;

  --view-padding: var(--spacing-lg);
  --card-padding: var(--spacing-lg);
  --row-padding-v: var(--spacing-md);
  --row-padding-h: var(--spacing-lg);
}

* {
  box-sizing: border-box;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
}

::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

body {
  margin: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: "Segoe UI", Arial, sans-serif;
  background: #f5f7fa;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}

input, textarea {
  user-select: text;
  -webkit-user-select: text;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.content {
  flex: 1;
  display: flex;
  height: calc(100vh - 32px);
}

.main-panel {
  flex: 1;
  padding: 0; /* Views will handle their own view-padding */
  background: #f5f7fa;
  container-type: size;
  display: flex;
  flex-direction: column;
  position: relative;
}

.global-workspace {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  background: #f5f7fa;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
