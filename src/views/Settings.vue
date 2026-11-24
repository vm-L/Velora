<template>
  <div class="view settings-view">
    <div class="settings-container">
      <!-- 页面顶部标题与操作栏 -->
      <div class="settings-header">
        <div class="settings-title-area">
          <v-button variant="icon-secondary" class="back-btn" @click="goBack" title="返回">
            <VIcon name="arrow-left" :size="18" />
          </v-button>
          <div>
            <h1 class="settings-page-title">系统设置</h1>
            <p class="settings-page-subtitle">管理应用程序行为、存储目录、网络服务与自定义规则</p>
          </div>
        </div>
      </div>

      <SettingsGeneralSection />
      <SettingsDownloadSection />
      <SettingsCompressionSection />
      <SettingsLocalResourcesSection />
      <SettingsCmsSection />
      <SettingsExternalSitesSection />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import SettingsGeneralSection from '@/components/settings/SettingsGeneralSection.vue';
import SettingsDownloadSection from '@/components/settings/SettingsDownloadSection.vue';
import SettingsCompressionSection from '@/components/settings/SettingsCompressionSection.vue';
import SettingsLocalResourcesSection from '@/components/settings/SettingsLocalResourcesSection.vue';
import SettingsCmsSection from '@/components/settings/SettingsCmsSection.vue';
import SettingsExternalSitesSection from '@/components/settings/SettingsExternalSitesSection.vue';

const router = useRouter();

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
};
</script>

<style scoped lang="less">
.settings-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: var(--view-padding);
  box-sizing: border-box;
  overflow-y: auto;
}

.settings-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  padding-bottom: var(--view-padding);
}

.settings-header {
  margin-bottom: 24px;
}

.settings-title-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.v-btn-icon-secondary.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-primary);
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: var(--bg-surface-hover);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }
}

.settings-page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.settings-page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}
</style>

<style lang="less">
@import '@/components/settings/settings-shared.less';
</style>
