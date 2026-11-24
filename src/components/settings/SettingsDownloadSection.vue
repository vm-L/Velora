<template>
  <div class="settings-section-title">下载</div>
  <div class="settings-card">
    <!-- 同时下载任务数 -->
    <div class="settings-row">
      <div class="settings-info">
        <h3>同时下载任务数</h3>
        <p>设置最大同时进行的下载任务数量 (支持范围 1-10)</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-input
          type="number"
          min="1"
          max="10"
          v-model.number="state.maxConcurrentDownloads"
          @change="handleMaxConcurrentChange"
          @blur="handleMaxConcurrentChange"
          class="inline-input"
          style="width: 100px; min-width: 100px;"
        />
      </div>
    </div>

    <!-- 最大内存空间 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>最大内存空间 (MB)</h3>
        <p>设置下载流在内存中的缓冲容量上限，超限时自动批量写盘</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-input
          type="number"
          min="64"
          max="8192"
          v-model.number="state.maxMemoryBufferMB"
          @change="handleMaxMemoryChange"
          @blur="handleMaxMemoryChange"
          class="inline-input"
          style="width: 100px; min-width: 100px;"
        />
      </div>
    </div>

    <!-- 图片目录 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>图片目录</h3>
        <p>图片的默认下载目录</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-input
          v-model="state.imageDirectory"
          @change="saveImageDirectory(state.imageDirectory)"
          @blur="saveImageDirectory(state.imageDirectory)"
          type="text"
          class="inline-input"
          placeholder="输入或选择目录"
          style="flex: 1; max-width: 300px; margin-right: 8px;"
        />
        <v-button variant="secondary" @click="handleSelectDirectory">
          <VIcon name="folder" :size="14" />
          <span>选择目录</span>
        </v-button>
      </div>
    </div>

    <!-- 音频目录 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>音频目录</h3>
        <p>音频的默认下载目录</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-input
          v-model="state.audioDirectory"
          @change="saveAudioDirectory(state.audioDirectory)"
          @blur="saveAudioDirectory(state.audioDirectory)"
          type="text"
          class="inline-input"
          placeholder="输入或选择目录"
          style="flex: 1; max-width: 300px; margin-right: 8px;"
        />
        <v-button variant="secondary" @click="handleSelectAudioDirectory">
          <VIcon name="folder" :size="14" />
          <span>选择目录</span>
        </v-button>
      </div>
    </div>

    <!-- 视频目录 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>视频目录</h3>
        <p>视频的默认下载目录</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-input
          v-model="state.videoDirectory"
          @change="saveVideoDirectory(state.videoDirectory)"
          @blur="saveVideoDirectory(state.videoDirectory)"
          type="text"
          class="inline-input"
          placeholder="输入或选择目录"
          style="flex: 1; max-width: 300px; margin-right: 8px;"
        />
        <v-button variant="secondary" @click="handleSelectVideoDirectory">
          <VIcon name="folder" :size="14" />
          <span>选择目录</span>
        </v-button>
      </div>
    </div>

    <!-- 文件目录 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>文件目录</h3>
        <p>其他类型文件的默认下载目录</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-input
          v-model="state.fileDirectory"
          @change="saveFileDirectory(state.fileDirectory)"
          @blur="saveFileDirectory(state.fileDirectory)"
          type="text"
          class="inline-input"
          placeholder="输入或选择目录"
          style="flex: 1; max-width: 300px; margin-right: 8px;"
        />
        <v-button variant="secondary" @click="handleSelectFileDirectory">
          <VIcon name="folder" :size="14" />
          <span>选择目录</span>
        </v-button>
      </div>
    </div>

    <!-- 自动匹配目录 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>自动匹配目录</h3>
        <p>下载时自动选择匹配度最高的子目录</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-switch
          :model-value="state.autoMatchDownloadSubdir"
          @change="handleAutoMatchSubdirToggle"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettings } from '@/composables/useSettings';
import { useMessage } from '@/composables/useMessage';
import { extractInputRawValue } from '@/components/settings/settingsHelpers';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInput from '@/components/base/VInput.vue';
import VSwitch from '@/components/base/VSwitch.vue';

const {
  state,
  saveImageDirectory,
  saveAudioDirectory,
  saveVideoDirectory,
  saveFileDirectory,
  saveMaxConcurrentDownloads,
  saveMaxMemoryBufferMB,
  saveAutoMatchDownloadSubdir
} = useSettings();
const { showMessage } = useMessage();

const handleAutoMatchSubdirToggle = (val: boolean) => {
  saveAutoMatchDownloadSubdir(val);
  showMessage(val ? '已开启下载自动匹配子目录' : '已关闭下载自动匹配子目录', 'info');
};

const selectAndApplyDirectory = async (apply: (dir: string) => void) => {
  const dir = await window.electronAPI.selectDirectory();
  if (dir) {
    apply(dir);
  }
};

const handleSelectDirectory = () => selectAndApplyDirectory((dir) => {
  state.imageDirectory = dir;
  saveImageDirectory(dir);
});

const handleSelectAudioDirectory = () => selectAndApplyDirectory((dir) => {
  state.audioDirectory = dir;
  saveAudioDirectory(dir);
});

const handleSelectVideoDirectory = () => selectAndApplyDirectory((dir) => {
  state.videoDirectory = dir;
  saveVideoDirectory(dir);
});

const handleSelectFileDirectory = () => selectAndApplyDirectory((dir) => {
  state.fileDirectory = dir;
  saveFileDirectory(dir);
});

const handleMaxConcurrentChange = (val?: any) => {
  const raw = extractInputRawValue(val, state.maxConcurrentDownloads);
  let num = parseInt(String(raw), 10);
  if (isNaN(num) || num < 1) num = 1;
  else if (num > 10) num = 10;
  state.maxConcurrentDownloads = num;
  saveMaxConcurrentDownloads(num);
};

const handleMaxMemoryChange = (val?: any) => {
  const raw = extractInputRawValue(val, state.maxMemoryBufferMB);
  let num = parseInt(String(raw), 10);
  if (isNaN(num) || num < 64) num = 64;
  else if (num > 8192) num = 8192;
  state.maxMemoryBufferMB = num;
  saveMaxMemoryBufferMB(num);
};
</script>
