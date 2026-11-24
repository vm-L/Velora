<template>
  <div class="settings-section-title">本地资源</div>
  <div class="settings-card">
    <!-- Mount Directory Row -->
    <div class="settings-row">
      <div class="settings-info">
        <h3>挂载目录</h3>
        <p>已挂载 {{ (state.localResources || []).length }} 个本地资源文件夹</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-button variant="secondary" @click="showMountModal = true">
          <VIcon name="folder" :size="14" />
          <span>挂载目录</span>
        </v-button>
      </div>
    </div>

    <!-- LAN Share Toggle -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>局域网共享服务</h3>
        <p>允许通过局域网浏览器访问已挂载的本地资源</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-switch
          :model-value="state.lanShareEnabled"
          @change="handleToggleLanShare"
        />
      </div>
    </div>

    <!-- Port, Password, Edit Permission, URL -->
    <template v-if="state.lanShareEnabled">
      <!-- Port -->
      <div class="settings-row" style="border-top: 1px solid var(--border-light);">
        <div class="settings-info">
          <h3>服务端口</h3>
          <p>局域网 HTTP 服务监听端口</p>
        </div>
        <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
          <v-input
            v-model="lanPortInput"
            type="number"
            placeholder="8899"
            style="max-width: 140px;"
            @blur="handleApplyLanPort"
            @enter="handleApplyLanPort"
          />
        </div>
      </div>

      <!-- Password -->
      <div class="settings-row" style="border-top: 1px solid var(--border-light);">
        <div class="settings-info">
          <h3>访问密码</h3>
          <p>留空为免密公开访问</p>
        </div>
        <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
          <v-input
            v-model="lanPasswordInput"
            type="text"
            placeholder="留空为免密访问"
            style="max-width: 180px;"
            @blur="handleApplyLanPassword"
            @enter="handleApplyLanPassword"
          />
        </div>
      </div>

      <!-- Allow Edit Toggle -->
      <div class="settings-row" style="border-top: 1px solid var(--border-light);">
        <div class="settings-info">
          <h3>编辑模式</h3>
          <p>允许局域网设备对文件进行编辑</p>
        </div>
        <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
          <v-switch
            :model-value="state.lanShareAllowEdit"
            @change="handleToggleLanAllowEdit"
          />
        </div>
      </div>

      <!-- URL and QR Code Banner -->
      <div class="settings-row">
        <div class="settings-info">
          <h3>服务运行地址</h3>
          <p>{{ lanShareStatus.url }}</p>
        </div>
        <div class="action-buttons" style="flex: 1; justify-content: flex-end; gap: 8px;">
          <v-button variant="secondary" @click="handleCopyLanUrl">
            <VIcon name="copy-text" :size="14" />
            <span>复制链接</span>
          </v-button>
          <v-button variant="secondary" @click="showQrModal = true">
            <VIcon name="qrcode" :size="14" />
            <span>手机扫码</span>
          </v-button>
        </div>
      </div>
    </template>
  </div>

  <LocalMountModal v-model:visible="showMountModal" />

  <!-- LAN Share QR Code Modal -->
  <div v-if="showQrModal" class="modal-overlay" v-overlay-close="() => showQrModal = false">
    <div class="modal-content" style="max-width: 360px; width: 90vw; text-align: center;">
      <div class="modal-header">
        <h3>手机扫码访问</h3>
        <v-button variant="icon" class="modal-close-btn" @click="showQrModal = false">
          <VIcon name="close" :size="20" />
        </v-button>
      </div>
      <div class="modal-body" style="padding: 24px 20px; display: flex; flex-direction: column; align-items: center; gap: 14px;">
        <div class="qr-box" v-html="lanQrCodeSvg" style="line-height: 0; padding: 10px; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
        <p style="font-size: 13px; color: var(--text-secondary); word-break: break-all; margin-top: 4px;">
          {{ lanShareStatus.url }}
        </p>
        <p style="font-size: 12px; color: var(--text-secondary);">
          请确保手机与当前电脑连接在同一局域网 (Wi-Fi)
        </p>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: space-between; padding: 12px 20px; border-top: 1px solid var(--border-light);">
        <v-button variant="secondary" @click="handleCopyLanUrl">
          <VIcon name="copy-text" :size="14" />
          <span>复制链接</span>
        </v-button>
        <v-button variant="secondary" @click="showQrModal = false">
          <VIcon name="check" :size="14" />
          <span>完成</span>
        </v-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSettings } from '@/composables/useSettings';
import { useMessage } from '@/composables/useMessage';
import { logger } from '@/services/logger';
import { generateQrCodeSvg } from '@/utils/qrcode';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInput from '@/components/base/VInput.vue';
import VSwitch from '@/components/base/VSwitch.vue';
import LocalMountModal from '@/components/settings/LocalMountModal.vue';

const {
  state,
  saveLanShareEnabled,
  saveLanShareAllowEdit,
  saveLanShareSettings
} = useSettings();
const { showMessage } = useMessage();

const showMountModal = ref<boolean>(false);
const lanPortInput = ref<number>(8899);
const lanPasswordInput = ref<string>('');
const showQrModal = ref<boolean>(false);
const lanShareStatus = ref<{
  running: boolean;
  port: number;
  ip: string;
  url: string;
  hasPassword: boolean;
  allowEdit: boolean;
}>({
  running: false,
  port: 8899,
  ip: '127.0.0.1',
  url: 'http://127.0.0.1:8899',
  hasPassword: false,
  allowEdit: false
});

const refreshLanStatus = async () => {
  if (window.electronAPI && window.electronAPI.getLanShareStatus) {
    try {
      const status = await window.electronAPI.getLanShareStatus();
      if (status) {
        lanShareStatus.value = status;
        lanPortInput.value = status.port || state.lanSharePort || 8899;
        lanPasswordInput.value = state.lanSharePassword || '';
      }
    } catch (err: any) {
      logger.error('Settings', `Failed to get LAN status: ${err?.message}`);
    }
  }
};

onMounted(async () => {
  await refreshLanStatus();
});

const lanQrCodeSvg = computed(() => {
  return generateQrCodeSvg(lanShareStatus.value.url, 200);
});

const handleToggleLanShare = async (val: boolean) => {
  try {
    await saveLanShareEnabled(val);
    await refreshLanStatus();
    showMessage(val ? `局域网共享服务已启动: ${lanShareStatus.value.url}` : '局域网共享服务已停止', val ? 'success' : 'info');
  } catch (err: any) {
    showMessage(`操作失败: ${err?.message}`, 'error');
  }
};

const handleApplyLanPort = async () => {
  const port = parseInt(String(lanPortInput.value), 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    showMessage('请输入 1024~65535 之间的有效端口号', 'warning');
    lanPortInput.value = state.lanSharePort || 8899;
    return;
  }
  if (port === state.lanSharePort && lanShareStatus.value?.port === port) {
    return;
  }
  try {
    const res = await saveLanShareSettings({
      enabled: state.lanShareEnabled,
      port,
      password: state.lanSharePassword,
      allowEdit: state.lanShareAllowEdit
    });
    await refreshLanStatus();
    if (res && res.error) {
      showMessage(`端口应用失败: ${res.error}`, 'error');
    } else {
      showMessage(`已应用新端口: ${port}`, 'success');
    }
  } catch (err: any) {
    showMessage(`端口应用失败: ${err?.message}`, 'error');
  }
};

const handleApplyLanPassword = async () => {
  const pwd = lanPasswordInput.value.trim();
  if (pwd === (state.lanSharePassword || '')) {
    return;
  }
  try {
    await saveLanShareSettings({
      enabled: state.lanShareEnabled,
      port: state.lanSharePort,
      password: pwd,
      allowEdit: state.lanShareAllowEdit
    });
    await refreshLanStatus();
    showMessage(pwd ? '访问密码已保存' : '已清除访问密码 (免密访问)', 'success');
  } catch (err: any) {
    showMessage(`密码保存失败: ${err?.message}`, 'error');
  }
};

const handleToggleLanAllowEdit = async (val: boolean) => {
  try {
    await saveLanShareAllowEdit(val);
    await refreshLanStatus();
    showMessage(val ? '已开启局域网设备编辑权限' : '已设置为只读模式', 'info');
  } catch (err: any) {
    showMessage(`操作失败: ${err?.message}`, 'error');
  }
};

const handleCopyLanUrl = () => {
  if (!lanShareStatus.value.url) return;
  navigator.clipboard.writeText(lanShareStatus.value.url).then(() => {
    showMessage('已复制局域网访问链接到剪贴板', 'success');
  }).catch(() => {
    showMessage('复制链接失败', 'error');
  });
};
</script>
