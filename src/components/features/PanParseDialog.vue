<template>
  <div v-if="visible" class="modal-overlay" @mousedown.self="handleClose">
    <div
      class="pan-parse-modal"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
      :class="{ 'is-dragging': isDragging }"
    >
      <!-- 模态框头部 -->
      <div class="modal-header">
        <div class="header-title">
          <VIcon name="cloud-download" :size="16" />
          <span>网盘资源解析</span>
        </div>
        <VButton variant="icon" class="close-btn" @click="handleClose" title="关闭">
          <VIcon name="close" :size="14" />
        </VButton>
      </div>

      <!-- 模态框主体 -->
      <div class="modal-body">
        <!-- 1. 链接输入区域 -->
        <div class="form-group">
          <label>网盘分享链接<span class="required-star">*</span></label>
          <VInput
            v-model="inputUrl"
            placeholder="请输入网盘分享链接或口令"
            clearable
            @input="onUrlInput"
            @paste="onUrlPaste"
            @enter="triggerResolve"
          />
        </div>

        <!-- 2. 提取码输入 -->
        <div class="form-group" style="margin-top: 10px;">
          <label>提取码</label>
          <VInput
            v-model="inputPassword"
            placeholder="选填"
            clearable
            @input="onPasswordInput"
            @enter="triggerResolve"
          />
        </div>

        <!-- 3. 解析中状态提示 -->
        <div v-if="isResolving" class="resolving-state">
          <VIcon name="loading" :size="16" class="spin-icon" />
          <span>正在解析网盘资源元数据与文件目录</span>
        </div>

        <!-- 4. 解析错误提示 -->
        <div v-if="resolveError" class="alert-box error">
          <VIcon name="warning" :size="14" />
          <span>{{ resolveError }}</span>
        </div>

        <!-- 5. 多文件树展示 -->
        <div v-if="resolvedFiles.length > 0" class="file-tree-section">
          <div class="file-tree-header">
            <span class="section-title">选择下载文件 ({{ selectedIndices.length }} / {{ resolvedFiles.length }})</span>
            <div class="tree-quick-actions">
              <VButton variant="text" size="small" @click="selectAll">全选</VButton>
              <VButton variant="text" size="small" @click="invertSelect">反选</VButton>
            </div>
          </div>

          <FileTree
            :files="resolvedFiles"
            v-model="selectedIndices"
            :previewable="true"
            :preview-loading-index="previewLoadingIndex"
            @preview="handlePreviewFile"
          />

          <div class="file-tree-summary">
            <span>已选总大小：<strong class="mono">{{ formatBytes(selectedTotalSize) }}</strong></span>
          </div>
        </div>

        <!-- 6. 保存路径选择 -->
        <div class="form-group" style="margin-top: 14px;">
          <label>下载目录<span class="required-star">*</span></label>
          <div class="input-with-button">
            <VInput
              v-model="saveDirectory"
              placeholder="请选择下载目录"
              class="flex-1"
            />
            <VButton variant="secondary" size="small" class="browse-btn" @click="handleSelectDirectory" title="选择本地下载目录">
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
          v-if="detectedPanType !== 'lanzou'"
          variant="secondary"
          :disabled="isSaveDisabled || isSavingToDrive || isSubmitting"
          :loading="isSavingToDrive"
          @click="handleOpenSavePicker"
        >
          <VIcon name="folder-enter" :size="14" />
          <span>{{ isSavingToDrive ? '转存中' : '转存到网盘' }}</span>
        </VButton>
        <VButton
          variant="primary"
          :disabled="isSubmitDisabled || isSubmitting || isSavingToDrive"
          :loading="isSubmitting"
          @click="handleSubmit"
        >
          <VIcon name="download" :size="14" />
          <span>{{ isSubmitting ? '解析直链中' : '立即下载' }}</span>
        </VButton>
      </div>

      <PanFolderPickerDialog
        :visible="savePickerVisible"
        :panType="detectedPanType"
        title="选择转存目标文件夹"
        confirmText="转存到此目录"
        @close="savePickerVisible = false"
        @confirm="handleConfirmSaveToDrive"
      />
    </div>
  </div>

  <!-- 分享音视频免下载在线预览播放器 -->
  <VideoPlayerDialog
    v-if="previewVideoUrl"
    :url="previewVideoUrl"
    :pageUrl="previewPageUrl"
    :hideDownload="true"
    @close="closeMediaPreview"
  />
  <AudioPlayerDialog
    v-if="previewAudioUrl"
    :url="previewAudioUrl"
    :pageUrl="previewPageUrl"
    @close="closeMediaPreview"
  />
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VIcon from '@/components/base/VIcon.vue';
import FileTree from '@/components/features/FileTree.vue';
import PanFolderPickerDialog from '@/components/features/PanFolderPickerDialog.vue';
import { formatBytes } from '@/composables/pan/types';
import { usePanShareParse } from '@/composables/pan/usePanShareParse';

const VideoPlayerDialog = defineAsyncComponent(() => import('@/components/features/VideoPlayerDialog.vue'));
const AudioPlayerDialog = defineAsyncComponent(() => import('@/components/features/AudioPlayerDialog.vue'));

const props = defineProps<{
  visible: boolean;
  initialUrl?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'success'): void;
}>();

const handleClose = () => {
  emit('update:visible', false);
};

const {
  inputUrl,
  inputPassword,
  saveDirectory,
  isDragging,
  isResolving,
  isSubmitting,
  isSavingToDrive,
  savePickerVisible,
  resolveError,
  detectedPanType,
  resolvedFiles,
  selectedIndices,
  selectedTotalSize,
  isSubmitDisabled,
  isSaveDisabled,
  previewVideoUrl,
  previewAudioUrl,
  previewLoadingIndex,
  previewPageUrl,
  onUrlPaste,
  onUrlInput,
  onPasswordInput,
  triggerResolve,
  handleSelectDirectory,
  onDragOver,
  onDragLeave,
  onDrop,
  selectAll,
  invertSelect,
  handleOpenSavePicker,
  handleConfirmSaveToDrive,
  handleSubmit,
  handlePreviewFile,
  closeMediaPreview
} = usePanShareParse({
  visible: () => props.visible,
  initialUrl: () => props.initialUrl,
  onSuccess: () => emit('success'),
  onClose: handleClose
});
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

.pan-parse-modal {
  width: 600px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.pan-parse-modal.is-dragging {
  border-color: var(--color-accent);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
}

.modal-header .header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-group label .required-star {
  color: #ef4444;
  margin-left: 2px;
}

.input-with-button {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-with-button .flex-1 {
  flex: 1;
}

.input-with-button .browse-btn {
  flex-shrink: 0;
}

.resolving-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--bg-surface-hover);
  color: var(--color-accent);
  font-size: 12px;
  margin-bottom: 12px;
}

.resolving-state .spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.alert-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 12px;
}

.alert-box.error {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #ef4444;
}

.file-tree-section {
  margin-top: 12px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 12px;
  background: var(--bg-surface-secondary, rgba(0, 0, 0, 0.01));
}

.file-tree-section .file-tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}

.file-tree-section .file-tree-header .section-title {
  font-weight: 600;
  color: var(--text-primary);
}

.file-tree-section .file-tree-header .tree-quick-actions {
  display: flex;
  gap: 6px;
}

.file-tree-section .file-tree-header .tree-quick-actions .highlight {
  color: #10b981;
}

.file-tree-section .file-tree-summary {
  margin-top: 8px;
  text-align: right;
  font-size: 11px;
  color: var(--text-secondary);
}

.file-tree-section .file-tree-summary .mono {
  font-family: monospace;
  color: var(--text-primary);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-surface);
}
</style>
