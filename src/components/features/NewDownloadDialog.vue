<template>
  <div v-if="visible" class="modal-overlay" @mousedown.self="handleClose">
    <div class="new-download-modal">
      <!-- 模态框头部 -->
      <div class="modal-header">
        <div class="header-title">
          <VIcon name="download" :size="16" />
          <span>新建下载任务</span>
        </div>
        <VButton variant="icon" class="close-btn" @click="handleClose" title="关闭">
          <VIcon name="close" :size="14" />
        </VButton>
      </div>

      <!-- 模态框主体 -->
      <div class="modal-body">
        <!-- 1. 链接输入区域 -->
        <div class="form-group">
          <label>下载链接<span class="required-star">*</span></label>
          <VInput
            v-model="inputUrl"
            placeholder="请输入下载链接"
            clearable
            @input="onUrlInput"
          />
        </div>

        <!-- 2. 文件/任务名称 -->
        <div class="form-group" style="margin-top: 14px;">
          <label>任务名称<span class="required-star">*</span></label>
          <VInput
            v-model="taskName"
            placeholder="请输入保存名称"
            clearable
          />
        </div>

        <!-- 3. 下载目录 -->
        <div class="form-group" style="margin-top: 14px;">
          <label>下载目录<span class="required-star">*</span></label>
          <div class="input-with-button">
            <VInput
              v-model="saveDirectory"
              placeholder="请选择下载目录"
              readonly
              class="flex-1"
            />
            <VButton variant="secondary" size="small" class="browse-btn" @click="handleSelectDirectory" title="选择本地保存目录">
              <VIcon name="folder" :size="14" />
              <span>选择目录</span>
            </VButton>
          </div>
        </div>
      </div>

      <!-- 模态框底部 -->
      <div class="modal-footer">
        <VButton variant="secondary" @click="handleClose">取消</VButton>
        <VButton
          variant="primary"
          :disabled="isSubmitDisabled"
          @click="handleSubmit"
        >
          立即下载
        </VButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VIcon from '@/components/base/VIcon.vue';
import { useDownloads } from '@/composables/useDownloads';
import { useMessage } from '@/composables/useMessage';
import { sanitizeFileName } from '@/utils/pathSanitizer';

const props = defineProps<{
  visible: boolean;
  initialUrl?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'success', taskId?: string): void;
}>();

const { addDownload } = useDownloads();
const { showMessage } = useMessage();

const inputUrl = ref('');
const taskName = ref('');
const saveDirectory = ref('');

// 自动初始化默认下载目录（默认使用设置中的文件类型下载目录）
const initDefaultDownloadDir = async () => {
  if (window.electronAPI && window.electronAPI.getSetting) {
    try {
      const fileDir = await window.electronAPI.getSetting('fileDirectory');
      if (fileDir) {
        saveDirectory.value = fileDir;
        return;
      }
      const defaultDir = await window.electronAPI.getSetting('downloadPath');
      if (defaultDir) saveDirectory.value = defaultDir;
    } catch {}
  }
};

onMounted(async () => {
  await initDefaultDownloadDir();
});

watch(() => props.visible, async (val) => {
  if (val) {
    resetState();
    await initDefaultDownloadDir();
    if (props.initialUrl) {
      inputUrl.value = props.initialUrl;
      handleUrlChange(props.initialUrl);
    } else {
      // 尝试自动识别剪贴板内容
      checkClipboard();
    }
  }
});

const resetState = () => {
  inputUrl.value = '';
  taskName.value = '';
};

const handleClose = () => {
  emit('update:visible', false);
};

const checkClipboard = async () => {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = (await navigator.clipboard.readText() || '').trim();
      if (isSupportedUrl(text)) {
        inputUrl.value = text;
        handleUrlChange(text);
      }
    }
  } catch {}
};

const isSupportedUrl = (url: string): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  // 排除网盘链接（网盘链接由专门的网盘解析入口处理）
  if (
    lower.includes('pan.quark.cn') ||
    lower.includes('drive.uc.cn') ||
    lower.includes('fast.uc.cn') ||
    lower.includes('123pan.com') ||
    lower.includes('123pan.cn') ||
    lower.includes('123684.com') ||
    lower.includes('123865.com') ||
    lower.includes('123912.com') ||
    lower.includes('pan.baidu.com') ||
    lower.includes('lanzou') ||
    lower.includes('ilanzou.') ||
    lower.includes('woozooo.com') ||
    lower.includes('115.com') ||
    lower.includes('115cdn.com') ||
    lower.includes('115rc.com') ||
    lower.includes('anxia.com') ||
    lower.includes('pan.xunlei.com') ||
    lower.includes('yun.139.com') ||
    lower.includes('caiyun.139.com') ||
    lower.includes('guangyapan.com')
  ) {
    return false;
  }
  return lower.startsWith('http://') || lower.startsWith('https://');
};

const onUrlInput = () => {
  handleUrlChange(inputUrl.value.trim());
};

const handleUrlChange = (rawUrl: string) => {
  if (!rawUrl) {
    taskName.value = '';
    return;
  }

  // 普通链接直接提取文件名
  try {
    const u = new URL(rawUrl);
    const pathname = u.pathname;
    const base = pathname.split('/').filter(Boolean).pop() || 'download_file';
    taskName.value = sanitizeFileName(decodeURIComponent(base));
  } catch {
    taskName.value = 'download_file';
  }
};

// 选择保存目录
const handleSelectDirectory = async () => {
  if (window.electronAPI?.selectDirectory) {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      saveDirectory.value = dir;
    }
  }
};

const isSubmitDisabled = computed(() => {
  return !inputUrl.value.trim() || !taskName.value.trim() || !saveDirectory.value.trim();
});

// 提交下载
const handleSubmit = async () => {
  const url = inputUrl.value.trim();
  const name = sanitizeFileName(taskName.value.trim());
  const dir = saveDirectory.value.trim();

  if (!url || !name || !dir) return;

  const fullSavePath = `${dir.replace(/\\/g, '/').replace(/\/+$/, '')}/${name}`;

  try {
    const added = await addDownload(url, name, fullSavePath);
    if (added) {
      showMessage(`任务已创建: ${name}`, 'success');
      emit('success');
      handleClose();
    }
  } catch (err: any) {
    showMessage(err.message ? `创建任务失败: ${err.message}` : '创建任务失败', 'error');
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.new-download-modal {
  width: 540px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  height: 48px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.modal-header .header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-header .close-btn {
  color: var(--text-muted);
}

.modal-header .close-btn:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 18px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group .required-star {
  color: var(--color-error, #ef4444);
  margin-left: 2px;
}

.input-with-button {
  display: flex;
  gap: 8px;
}

.input-with-button .browse-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 0 12px;
}

.modal-footer {
  height: 52px;
  padding: 0 18px;
  border-top: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
  background: var(--bg-surface);
}
</style>
