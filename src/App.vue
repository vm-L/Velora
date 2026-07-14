<template>
  <TitleBar />
  <div class="content">
    <Sidebar />
    <div class="main-panel">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import { useSettings } from './composables/useSettings'

const { loadSettings } = useSettings()

onMounted(() => {
  loadSettings()
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
