<template>
  <TitleBar />
  <div class="content">
    <Sidebar />
    <div class="main-panel">
      <router-view v-slot="{ Component, route }">
        <keep-alive>
          <component :is="Component" :key="route.fullPath" />
        </keep-alive>
      </router-view>

      <!-- Global Workspaces for true keep-alive (prevents webview reload) -->
      <BrowserWorkspace v-for="res in openedResources" :key="res.id" :resourceId="res.id" :resourceUrl="res.url"
        v-show="$route.name === 'Resource' && $route.params.type === 'ext' && $route.params.id === res.id" class="global-workspace" />

      <!-- CMS Workspaces for multi-site v-show keep-alive -->
      <CMSWorkspace v-for="res in openedCMS" :key="res.id" :resourceId="res.id" :resourceUrl="res.url"
        v-show="$route.name === 'Resource' && $route.params.type === 'cms' && $route.params.id === res.id" class="global-workspace" />

      <!-- Local Workspaces for multi-site v-show keep-alive -->
      <LocalWorkspace v-for="res in openedLocal" :key="res.id" :resourceId="res.id" :resourcePath="res.path" :resourceName="res.name"
        v-show="$route.name === 'Resource' && $route.params.type === 'local' && $route.params.id === res.id" class="global-workspace" />
    </div>
  </div>
  <v-confirm-dialog />
  <v-message-bar />
  <v-notification-bar />
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import TitleBar from './components/layout/TitleBar.vue';
import Sidebar from './components/layout/Sidebar.vue';
import VConfirmDialog from './components/feedback/VConfirmDialog.vue';
import VMessageBar from './components/feedback/VMessageBar.vue';
import VNotificationBar from './components/feedback/VNotificationBar.vue';
import BrowserWorkspace from './components/layout/BrowserWorkspace.vue';
import CMSWorkspace from './components/layout/CMSWorkspace.vue';
import LocalWorkspace from './components/layout/LocalWorkspace.vue';
import { useSettings } from './composables/useSettings';
import { useDownloads } from './composables/useDownloads';
import { useOpenedResources } from './composables/useOpenedResources';
import { useOpenedCMS } from './composables/useOpenedCMS';
import { useOpenedLocal } from './composables/useOpenedLocal';

const route = useRoute();
const { state, loadSettings } = useSettings();
const { loadTasks, initListeners, isInitialized, auditDiskFiles } = useDownloads();
const { openedResources, openResource } = useOpenedResources();
const { openedCMS, openCMS, updateLastRoute } = useOpenedCMS();
const { openedLocal, openLocal } = useOpenedLocal();

onMounted(async () => {
  await loadSettings();
  document.documentElement.dataset.theme = state.theme;

  if (!isInitialized.value) {
    await loadTasks();
    initListeners();
    await auditDiskFiles();
  }

  // 启动所有资源后台预加载/注册
  preloadAllResources();
});

watch(() => state.theme, (newTheme) => {
  document.documentElement.dataset.theme = newTheme;
});

// 后台并发预加载函数
const preloadAllResources = () => {
  if (Array.isArray(state.localResources)) {
    state.localResources.forEach(local => {
      openLocal(local.id, local.path || local.url, local.name);
    });
  }
  if (Array.isArray(state.cmsResources)) {
    state.cmsResources.forEach(cms => {
      openCMS(cms.id, cms.url);
    });
  }
  if (Array.isArray(state.externalSites)) {
    state.externalSites.forEach(site => {
      openResource(site.id, site.url);
    });
  }
};

// 监听配置变更，动态同步预加载资源
watch(() => state.localResources, (newList) => {
  if (Array.isArray(newList)) {
    newList.forEach(local => {
      openLocal(local.id, local.path || local.url, local.name);
    });
  }
}, { deep: true });

watch(() => state.cmsResources, (newList) => {
  if (Array.isArray(newList)) {
    newList.forEach(cms => {
      openCMS(cms.id, cms.url);
    });
  }
}, { deep: true });

watch(() => state.externalSites, (newList) => {
  if (Array.isArray(newList)) {
    newList.forEach(site => {
      openResource(site.id, site.url);
    });
  }
}, { deep: true });

// 监听路由以自动注册已经打开的资源与 CMS 站点，并实时同步最新活跃路由
watch(() => [route.params.type, route.params.id, route.fullPath], ([type, id, fullPath]) => {
  const currentType = (type as string) || (route.path.includes('/cms/') ? 'cms' : '')
  const currentId = id as string
  if (currentType === 'local' && currentId) {
    const local = (state.localResources || []).find(l => l.id === currentId);
    if (local) {
      openLocal(local.id, local.path || local.url, local.name);
    }
  } else if (currentType === 'ext' && currentId) {
    const site = state.externalSites.find(s => s.id === currentId);
    if (site) {
      openResource(site.id, site.url);
    }
  } else if (currentType === 'cms' && currentId) {
    const cms = state.cmsResources.find(c => c.id === currentId);
    if (cms) {
      openCMS(cms.id, cms.url, fullPath as string);
      updateLastRoute(cms.id, fullPath as string);
    }
  }
}, { immediate: true });
</script>

<style lang="less">
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 32px;
  /* Increased from 24px for more whitespace */
  --spacing-xl: 48px;
  /* Increased from 32px */
  --spacing-2xl: 64px;
  /* Increased from 40px */

  --view-padding: var(--spacing-lg);
  --card-padding: var(--spacing-lg);
  --row-padding-v: var(--spacing-md);
  --row-padding-h: var(--spacing-lg);

  /* Pristine Elegance Theme Variables (OKLCH) */
  --bg-app: oklch(98.5% 0.005 90);
  /* Warm Ivory */
  --bg-surface: oklch(100% 0 0);
  /* Crisp White */
  --bg-surface-hover: oklch(97.5% 0.008 90);
  --bg-surface-active: oklch(96.5% 0.01 90);

  --text-primary: oklch(38% 0.01 90);
  /* Deep Charcoal / Espresso */
  --text-secondary: oklch(62% 0.01 90);
  /* Warm Gray */
  --text-tertiary: oklch(76% 0.01 90);

  --color-accent: oklch(30% 0.01 90);
  /* Deep Slate / Off-Black */
  --color-accent-hover: oklch(20% 0.01 90);

  --border-color: oklch(93% 0.01 90);
  /* Soft Stone */
  --border-light: oklch(96% 0.006 90);

  --shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.03), 0 4px 12px rgba(0, 0, 0, 0.02);
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.02);

  /* System Colors */
  --color-success: oklch(68% 0.16 160);
  --color-error: oklch(62% 0.22 25);
  --color-warning: oklch(74% 0.17 70);
}

[data-theme='dark'] {
  --bg-app: oklch(15% 0.005 90);
  /* Dark Espresso / Obsidian */
  --bg-surface: oklch(18% 0.005 90);
  /* Near-Black */
  --bg-surface-hover: oklch(22% 0.005 90);
  --bg-surface-active: oklch(26% 0.005 90);

  --text-primary: oklch(95% 0.005 90);
  /* Soft Ivory */
  --text-secondary: oklch(75% 0.005 90);
  /* Warm Slate */
  --text-tertiary: oklch(60% 0.005 90);

  --color-accent: oklch(90% 0.01 90);
  /* Glowing Warm Ivory */
  --color-accent-hover: oklch(98.5% 0.01 90);

  --border-color: oklch(28% 0.005 90);
  /* Deep Slate */
  --border-light: oklch(24% 0.005 90);

  --shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2);
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.2);
}

::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}


* {
  box-sizing: border-box;
  scrollbar-width: none;
  /* Firefox */
  -ms-overflow-style: none;
  /* IE 10+ */
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
  background: var(--bg-app);
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}

input,
textarea {
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
  padding: 0;
  /* Views will handle their own view-padding */
  background: var(--bg-app);
  container-type: size;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.global-workspace {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  background: var(--bg-app);
}

/* 拦截 Electron Webview 在 display: none 下隐式抢夺鼠标事件与遮挡路由弹窗的致命缺陷 */
.global-workspace[style*="display: none"] {
  z-index: -9999 !important;
  pointer-events: none !important;
  visibility: hidden !important;
}

</style>
