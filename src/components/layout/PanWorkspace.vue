<template>
  <div class="pan-workspace">
    <!-- 顶部导航与操作栏 -->
    <div class="workspace-header">
      <div class="header-nav">
        <VButton
          variant="icon"
          class="nav-btn"
          :disabled="isAtRoot"
          @click="navigateUp"
          title="返回上一级"
        >
          <VIcon name="chevron-left" :size="18" />
        </VButton>
        <VButton
          variant="icon"
          class="nav-btn"
          @click="loadCurrentDirectory(true)"
          title="刷新"
        >
          <VIcon name="refresh" :size="16" />
        </VButton>

        <!-- 面包屑路径导航 -->
        <div class="breadcrumb-container">
          <div
            class="breadcrumb-item"
            :class="{ active: breadcrumbs.length === 1 }"
            @click="jumpToBreadcrumb(0)"
          >
            <VIcon name="cloud" :size="14" class="root-icon" />
            <span class="crumb-text">{{ panDisplayName }}</span>
          </div>

          <template v-for="(crumb, idx) in breadcrumbs.slice(1)" :key="crumb.id">
            <span class="crumb-separator">/</span>
            <div
              class="breadcrumb-item"
              :class="{ active: idx === breadcrumbs.length - 2 }"
              @click="jumpToBreadcrumb(idx + 1)"
            >
              <span class="crumb-text">{{ crumb.name }}</span>
            </div>
          </template>
        </div>
      </div>

      <div class="header-actions">
        <!-- 账号容量概况 -->
        <div v-if="displayQuotaText" class="quota-badge" :title="`容量：${displayQuotaText}`">
          <VIcon name="cloud" :size="13" />
          <span>{{ displayQuotaText }}</span>
        </div>

        <VButton variant="secondary" size="small" @click="openNewFolderModal" title="新建文件夹">
          <VIcon name="plus" :size="13" />
          <span>新建文件夹</span>
        </VButton>

        <!-- 本地即时过滤搜索框 -->
        <div class="search-wrap">
          <VInput
            v-model="searchQuery"
            placeholder="过滤当前目录文件"
            class="search-input"
            clearable
          />
        </div>
      </div>
    </div>

    <!-- 主体文件列表区域 -->
    <div class="workspace-body">
      <!-- 加载中状态 -->
      <div v-if="isLoading" class="loading-state">
        <VIcon name="loading" :size="24" class="spin-icon" />
        <span>加载网盘文件中</span>
      </div>

      <!-- 错误提示 -->
      <div v-else-if="loadError" class="error-state">
        <VIcon name="warning" :size="28" />
        <span class="error-msg">{{ loadError }}</span>
        <div class="error-actions" style="display: flex; gap: 8px; margin-top: 4px;">
          <VButton v-if="loadError.includes('登录')" variant="primary" size="small" @click="handleRelogin">重新登录</VButton>
          <VButton variant="secondary" size="small" @click="loadCurrentDirectory(true)">重试</VButton>
        </div>
      </div>

      <!-- 空目录或无搜索结果 -->
      <div v-else-if="filteredFiles.length === 0" class="empty-state">
        <VIcon name="folder" :size="36" class="empty-icon" />
        <span>{{ searchQuery ? '未找到匹配的文件' : '当前目录为空' }}</span>
      </div>

      <!-- 文件列表视图 -->
      <div v-else class="file-table">
        <div class="file-table-header">
          <div class="col-checkbox">
            <VCheckbox
              :checked="isAllSelected"
              :indeterminate="isIndeterminate"
              @change="toggleSelectAll"
            />
          </div>
          <div class="col-name">名称</div>
          <div class="col-size">大小</div>
          <div class="col-date">修改时间</div>
          <div class="col-actions">操作</div>
        </div>

        <div class="file-table-body">
          <div
            v-for="file in filteredFiles"
            :key="file.id"
            class="file-row"
            :class="{ 'is-selected': isSelected(file.id) }"
            @click="handleRowClick(file)"
            @dblclick="handleRowDblClick(file)"
          >
            <div class="col-checkbox" @click.stop>
              <VCheckbox
                :checked="isSelected(file.id)"
                @change="toggleItemSelect(file.id)"
              />
            </div>

            <div class="col-name" @click.stop="handleNameClick(file)">
              <VIcon :name="getFileIcon(file)" :size="18" class="file-icon" />
              <span class="file-name-text" :title="file.name">{{ file.name }}</span>
            </div>

            <div class="col-size">
              {{ file.isDirectory ? '-' : formatBytes(file.size) }}
            </div>

            <div class="col-date">
              {{ formatTime(file.updatedAt) }}
            </div>

            <div class="col-actions" @click.stop>
              <VButton
                v-if="!file.isDirectory && isMediaFile(file)"
                variant="icon"
                class="row-action-btn"
                @click="handlePreview(file)"
                title="在线预览"
              >
                <VIcon name="play" :size="13" />
              </VButton>
              <VButton
                variant="icon"
                class="row-action-btn"
                @click="openRenameModal(file)"
                title="重命名"
              >
                <VIcon name="edit" :size="13" />
              </VButton>
              <VButton
                variant="icon"
                class="row-action-btn"
                @click="openMoveModal([file])"
                title="移动到..."
              >
                <VIcon name="folder-move" :size="13" />
              </VButton>
              <VButton
                v-if="panType !== 'ilanzou'"
                variant="icon"
                class="row-action-btn"
                @click="openShareModal([file])"
                title="创建分享"
              >
                <VIcon name="external-link" :size="13" />
              </VButton>
              <VButton
                variant="icon"
                class="row-action-btn"
                :disabled="isDownloading"
                @click="handleDownloadSingle(file)"
                title="下载"
              >
                <VIcon name="download" :size="13" />
              </VButton>
              <VButton
                variant="icon"
                class="row-action-btn delete-btn"
                @click="handleDeleteSingle(file)"
                title="删除"
              >
                <VIcon name="trash" :size="13" />
              </VButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部悬浮批量操作栏 -->
    <div v-if="selectedIds.length > 0" class="batch-bar">
      <div class="batch-bar-left">
        <span class="selected-summary">已选择 {{ selectedIds.length }} 项</span>
        <VButton variant="text" size="small" @click="toggleSelectAll">
          {{ isAllSelected ? '反选' : '全选' }}
        </VButton>
      </div>

      <div class="batch-bar-right">
        <VButton
          variant="primary"
          size="small"
          :disabled="isDownloading"
          @click="handleBatchDownload"
        >
          <VIcon name="download" :size="13" />
          <span>下载所选</span>
        </VButton>
        <VButton
          variant="secondary"
          size="small"
          @click="openMoveBatchModal"
        >
          <VIcon name="folder-move" :size="13" />
          <span>移动所选</span>
        </VButton>
        <VButton
          v-if="panType !== 'ilanzou'"
          variant="secondary"
          size="small"
          @click="openShareBatchModal"
        >
          <VIcon name="external-link" :size="13" />
          <span>创建分享</span>
        </VButton>
        <VButton
          variant="danger-soft"
          size="small"
          :disabled="isDeleting"
          @click="handleBatchDelete"
        >
          <VIcon name="trash" :size="13" />
          <span>删除所选</span>
        </VButton>
        <VButton variant="secondary" size="small" @click="clearSelection">
          取消选择
        </VButton>
      </div>
    </div>

    <!-- 内置视频播放弹窗 -->
    <VideoPlayerDialog
      v-if="activeVideoUrl"
      :url="activeVideoUrl"
      :pageUrl="defaultReferer || ''"
      @close="activeVideoUrl = null"
    />

    <!-- 内置音频播放弹窗 -->
    <AudioPlayerDialog
      v-if="activeAudioUrl"
      :url="activeAudioUrl"
      :pageUrl="defaultReferer || ''"
      @close="activeAudioUrl = null"
    />

    <!-- 新建文件夹弹窗 -->
    <div v-if="showNewFolderModal" class="pan-modal-overlay" @click.self="closeNewFolderModal">
      <div class="pan-modal">
        <div class="pan-modal-header">
          <span>新建文件夹</span>
          <VButton variant="icon" @click="closeNewFolderModal">
            <VIcon name="close" :size="14" />
          </VButton>
        </div>
        <div class="pan-modal-body">
          <div class="pan-form-group">
            <label>文件夹名称</label>
            <input
              v-model="newFolderNameInput"
              type="text"
              class="pan-modal-input"
              placeholder="请输入文件夹名称"
              @keyup.enter="submitNewFolder"
            />
          </div>
        </div>
        <div class="pan-modal-footer">
          <VButton variant="secondary" @click="closeNewFolderModal">取消</VButton>
          <VButton
            variant="primary"
            :loading="isModalSubmitting"
            :disabled="!newFolderNameInput.trim() || isModalSubmitting"
            @click="submitNewFolder"
          >
            确定创建
          </VButton>
        </div>
      </div>
    </div>

    <!-- 重命名弹窗 -->
    <div v-if="showRenameModal" class="pan-modal-overlay" @click.self="closeRenameModal">
      <div class="pan-modal">
        <div class="pan-modal-header">
          <span>重命名</span>
          <VButton variant="icon" @click="closeRenameModal">
            <VIcon name="close" :size="14" />
          </VButton>
        </div>
        <div class="pan-modal-body">
          <div class="pan-form-group">
            <label>新名称</label>
            <input
              v-model="renameInput"
              type="text"
              class="pan-modal-input"
              placeholder="请输入新名称"
              @keyup.enter="submitRename"
            />
          </div>
        </div>
        <div class="pan-modal-footer">
          <VButton variant="secondary" @click="closeRenameModal">取消</VButton>
          <VButton
            variant="primary"
            :loading="isModalSubmitting"
            :disabled="!renameInput.trim() || isModalSubmitting"
            @click="submitRename"
          >
            确认重命名
          </VButton>
        </div>
      </div>
    </div>

    <!-- 移动到目录选择器 -->
    <PanFolderPickerDialog
      :visible="showMoveModal"
      :panType="panType"
      :title="moveTargetFiles.length > 1 ? `移动 ${moveTargetFiles.length} 项到...` : `移动「${moveTargetFiles[0]?.name || ''}」到...`"
      confirmText="移动到此处"
      :excludeIds="moveExcludeIds"
      @close="showMoveModal = false"
      @confirm="handleConfirmMove"
    />

    <!-- 创建分享弹窗 -->
    <div v-if="showShareModal" class="pan-modal-overlay" @click.self="closeShareModal">
      <div class="pan-modal">
        <div class="pan-modal-header">
          <span>创建分享</span>
          <VButton variant="icon" @click="closeShareModal">
            <VIcon name="close" :size="14" />
          </VButton>
        </div>
        <div class="pan-modal-body">
          <template v-if="!shareResult">
            <div class="share-summary">
              分享内容：{{ shareTargetSummary }}
            </div>

            <div class="pan-form-group">
              <label>有效期</label>
              <div v-if="panType === 'lanzou'" class="pan-notice-box">
                蓝奏云分享链接默认永久有效。
              </div>
              <select v-else v-model.number="shareExpireType" class="pan-modal-select">
                <option
                  v-for="opt in shareExpireOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div v-if="!['115', '139', 'lanzou'].includes(panType)" class="pan-form-group">
              <label>提取码（选填）</label>
              <input
                v-model="sharePasscodeInput"
                type="text"
                class="pan-modal-input"
                maxlength="8"
                placeholder="留空则按默认规则生成或免密码"
              />
            </div>
          </template>

          <template v-else>
            <div class="share-result-box">
              <div v-if="shareResult.title" class="share-result-row">
                <span class="result-label">名称：</span>
                <span class="result-val">{{ shareResult.title }}</span>
              </div>
              <div class="share-result-row">
                <span class="result-label">链接：</span>
                <span class="result-val mono">{{ shareResult.shareUrl }}</span>
              </div>
              <div v-if="shareResult.passcode" class="share-result-row">
                <span class="result-label">提取码：</span>
                <span class="result-val mono">{{ shareResult.passcode }}</span>
              </div>
              <div v-if="shareResult.warning" class="share-warning">
                {{ shareResult.warning }}
              </div>
            </div>
          </template>
        </div>
        <div class="pan-modal-footer">
          <template v-if="!shareResult">
            <VButton variant="secondary" @click="closeShareModal">取消</VButton>
            <VButton
              variant="primary"
              :loading="isModalSubmitting"
              :disabled="isModalSubmitting || shareTargetFiles.length === 0"
              @click="submitCreateShare"
            >
              生成分享链接
            </VButton>
          </template>
          <template v-else>
            <VButton variant="secondary" @click="closeShareModal">关闭</VButton>
            <VButton variant="primary" @click="copyShareResult">
              <VIcon name="copy-text" :size="13" />
              <span>一键复制</span>
            </VButton>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VIcon from '@/components/base/VIcon.vue';
import VCheckbox from '@/components/base/VCheckbox.vue';
import type { IconName } from '@/components/base/VIcon.vue';
import { useDownloads } from '@/composables/useDownloads';
import { useNotification } from '@/composables/useNotification';
import { useConfirm } from '@/composables/useConfirm';
import { usePanAccounts, type PanAccountInfo } from '@/composables/usePanAccounts';
import { sanitizeFileName, sanitizeRelativePath } from '@/utils/pathSanitizer';
import PanFolderPickerDialog from '@/components/features/PanFolderPickerDialog.vue';

const VideoPlayerDialog = defineAsyncComponent(() => import('@/components/features/VideoPlayerDialog.vue'));
const AudioPlayerDialog = defineAsyncComponent(() => import('@/components/features/AudioPlayerDialog.vue'));

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface PanFileItem {
  id: string;
  name: string;
  pdir_fid: string;
  size: number;
  isDirectory: boolean;
  updatedAt: number;
  formatType?: string;
  thumbnail?: string;
  downloadUrl?: string;
}

const props = defineProps<{
  panType: string;
  account?: PanAccountInfo;
}>();

const { addDownloadsBatch } = useDownloads();
const { showNotification } = useNotification();
const { confirm } = useConfirm();
const { getPanName, refreshQuota } = usePanAccounts();

const panDisplayName = computed(() => getPanName(props.panType));
const defaultReferer = computed(() => {
  if (props.panType === 'quark') return 'https://pan.quark.cn/';
  if (props.panType === 'uc') return 'https://drive.uc.cn/';
  if (props.panType === 'baidu') return 'https://pan.baidu.com/';
  if (props.panType === '123pan') return 'https://yun.123pan.cn/';
  if (props.panType === 'xunlei') return 'https://pan.xunlei.com/';
  if (props.panType === '115') return 'https://115.com/';
  if (props.panType === 'lanzou') return 'https://pc.woozooo.com/';
  if (props.panType === '139') return 'https://yun.139.com/';
  if (props.panType === 'guangya') return 'https://www.guangyapan.com/';
  if (props.panType === 'ilanzou') return 'https://www.ilanzou.com/';
  return undefined;
});
const liveQuotaText = ref<string>('');
const displayQuotaText = computed(() => liveQuotaText.value || props.account?.quotaText || '');
let lastQuotaUpdateAt = 0;
let quotaReqSeq = 0;
let dirReqSeq = 0;

const autoUpdateQuota = async (force = false) => {
  const now = Date.now();
  if (!force && now - lastQuotaUpdateAt < 30000) return;
  lastQuotaUpdateAt = now;
  const expectedPanType = props.panType;
  const reqSeq = ++quotaReqSeq;
  try {
    const q = await refreshQuota(expectedPanType);
    if (reqSeq !== quotaReqSeq || props.panType !== expectedPanType) return;
    if (q) {
      liveQuotaText.value = q;
    }
  } catch {}
};

// 目录与文件状态
const breadcrumbs = ref<BreadcrumbItem[]>([
  { id: '0', name: '全部文件' }
]);
const currentFiles = ref<PanFileItem[]>([]);
const selectedIds = ref<string[]>([]);
const searchQuery = ref('');
const isLoading = ref(false);
const loadError = ref('');
const isDownloading = ref(false);
const isDeleting = ref(false);

// 在线预览状态
const activeVideoUrl = ref<string | null>(null);
const activeAudioUrl = ref<string | null>(null);

const currentPdirFid = computed(() => {
  const top = breadcrumbs.value[breadcrumbs.value.length - 1];
  return top ? top.id : '0';
});

const isAtRoot = computed(() => breadcrumbs.value.length <= 1);

// 本地即时过滤列表
const filteredFiles = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return currentFiles.value;
  return currentFiles.value.filter((f) => f.name.toLowerCase().includes(query));
});

// 全选/半选状态
const isAllSelected = computed(() => {
  if (filteredFiles.value.length === 0) return false;
  return filteredFiles.value.every((f) => selectedIds.value.includes(f.id));
});

const isIndeterminate = computed(() => {
  if (filteredFiles.value.length === 0) return false;
  const count = filteredFiles.value.filter((f) => selectedIds.value.includes(f.id)).length;
  return count > 0 && count < filteredFiles.value.length;
});

const isSelected = (id: string) => selectedIds.value.includes(id);

const toggleItemSelect = (id: string) => {
  const idx = selectedIds.value.indexOf(id);
  if (idx > -1) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
};

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    // 反选或清空
    const visibleIds = new Set(filteredFiles.value.map((f) => f.id));
    selectedIds.value = selectedIds.value.filter((id) => !visibleIds.has(id));
  } else {
    // 全选当前可见项
    const currentSet = new Set(selectedIds.value);
    filteredFiles.value.forEach((f) => currentSet.add(f.id));
    selectedIds.value = Array.from(currentSet);
  }
};

const clearSelection = () => {
  selectedIds.value = [];
};

// 加载当前目录文件
const loadCurrentDirectory = async (forceQuota = false) => {
  if (!window.electronAPI?.listPanFiles) {
    loadError.value = '客户端不支持网盘接口';
    return;
  }

  const reqSeq = ++dirReqSeq;
  const expectedPanType = props.panType;
  isLoading.value = true;
  loadError.value = '';
  clearSelection();
  autoUpdateQuota(forceQuota);

  try {
    const res = await window.electronAPI.listPanFiles({
      type: expectedPanType,
      pdirFid: currentPdirFid.value
    });
    if (reqSeq !== dirReqSeq || props.panType !== expectedPanType) return;

    if (res && res.success && res.data) {
      currentFiles.value = res.data.files || [];
    } else {
      loadError.value = res?.error || '获取文件列表失败';
    }
  } catch (err: any) {
    if (reqSeq !== dirReqSeq || props.panType !== expectedPanType) return;
    loadError.value = err?.message || '加载异常';
  } finally {
    if (reqSeq === dirReqSeq) {
      isLoading.value = false;
    }
  }
};

const handleRelogin = async () => {
  if (window.electronAPI?.loginPanAccount) {
    try {
      const res = await window.electronAPI.loginPanAccount(props.panType);
      if (res && res.success) {
        showNotification({ type: 'success', title: '登录成功', message: '网盘授权已更新' });
        await loadCurrentDirectory(true);
      }
    } catch {}
  }
};

// 导航操作
const navigateUp = () => {
  if (breadcrumbs.value.length > 1) {
    breadcrumbs.value.pop();
    loadCurrentDirectory();
  }
};

const jumpToBreadcrumb = (index: number) => {
  if (index >= 0 && index < breadcrumbs.value.length) {
    breadcrumbs.value = breadcrumbs.value.slice(0, index + 1);
    loadCurrentDirectory();
  }
};

const enterFolder = (folder: PanFileItem) => {
  breadcrumbs.value.push({
    id: folder.id,
    name: folder.name
  });
  searchQuery.value = '';
  loadCurrentDirectory();
};

const handleRowClick = (file: PanFileItem) => {
  toggleItemSelect(file.id);
};

const handleNameClick = (file: PanFileItem) => {
  if (file.isDirectory) {
    enterFolder(file);
  } else {
    toggleItemSelect(file.id);
  }
};

const handleRowDblClick = (file: PanFileItem) => {
  if (file.isDirectory) {
    enterFolder(file);
  } else if (isMediaFile(file)) {
    handlePreview(file);
  }
};

// 文件图标与格式判定
const getFileIcon = (file: PanFileItem): IconName => {
  if (file.isDirectory) return 'folder';
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts', 'm4v'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return 'music';
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
    return 'image';
  }
  return 'file';
};

const isMediaFile = (file: PanFileItem): boolean => {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts', 'm4v', 'mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext);
};

const isVideoFile = (file: PanFileItem): boolean => {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts', 'm4v'].includes(ext);
};

// 在线预览
const handlePreview = async (file: PanFileItem) => {
  if (!window.electronAPI?.getPanPreviewUrl && !window.electronAPI?.getPanDownloadUrls) return;
  try {
    let url = '';
    if (window.electronAPI?.getPanPreviewUrl) {
      const res = await window.electronAPI.getPanPreviewUrl({
        type: props.panType,
        fid: file.id,
        filename: file.name
      });
      if (res && !res.success && res.error) {
        throw new Error(res.error);
      }
      url = res?.previewUrl || '';
    } else if (window.electronAPI?.getPanDownloadUrls) {
      const res = await window.electronAPI.getPanDownloadUrls({
        type: props.panType,
        fids: [file.id]
      });
      url = res?.urls?.[file.id] || '';
    }
    if (url) {
      if (isVideoFile(file)) {
        activeVideoUrl.value = url;
      } else {
        activeAudioUrl.value = url;
      }
    } else {
      showNotification({
        type: 'error',
        title: '预览失败',
        message: '无法获取媒体直链'
      });
    }
  } catch (err: any) {
    showNotification({
      type: 'error',
      title: '预览异常',
      message: err.message || '未知错误'
    });
  }
};

// 获取默认下载路径
const getDownloadDirectory = async (): Promise<string> => {
  if (window.electronAPI?.getSetting) {
    try {
      const fileDir = await window.electronAPI.getSetting('fileDirectory');
      if (fileDir) return fileDir;
      const defaultDir = await window.electronAPI.getSetting('downloadPath');
      if (defaultDir) return defaultDir;
    } catch {}
  }
  return '';
};

// 递归遍历网盘目录获取所有子文件，保持相对路径
interface FlatDownloadTarget {
  fid: string;
  name: string;
  relativePath: string;
  size?: number;
}

const runConcurrent = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> => {
  if (items.length === 0) return;
  let index = 0;
  const count = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (index < items.length) {
        const current = items[index++];
        await worker(current);
      }
    })
  );
};

const collectFilesRecursively = async (
  item: PanFileItem,
  baseRelativePath = '',
  depth = 0
): Promise<FlatDownloadTarget[]> => {
  if (depth > 15) {
    throw new Error('目录层级过深（超过 15 层），已中止递归扫描');
  }
  const safeItemName = sanitizeFileName(item.name || 'download_file', item.isDirectory ? 'folder' : 'download_file');
  if (!item.isDirectory) {
    const relativePath = sanitizeRelativePath(
      baseRelativePath ? `${baseRelativePath}/${safeItemName}` : safeItemName,
      safeItemName
    );
    return [{ fid: item.id, name: safeItemName, relativePath, size: item.size }];
  }

  const results: FlatDownloadTarget[] = [];
  const folderRelativePath = sanitizeRelativePath(
    baseRelativePath ? `${baseRelativePath}/${safeItemName}` : safeItemName,
    'folder'
  );

  const subRes = await window.electronAPI?.listPanFiles?.({
    type: props.panType,
    pdirFid: item.id
  });
  if (!subRes || !subRes.success) {
    throw new Error(subRes?.error || `读取目录 "${item.name}" 失败`);
  }

  const subItems: PanFileItem[] = Array.isArray(subRes.data?.files) ? subRes.data.files : [];
  const childFiles = subItems.filter(s => !s.isDirectory);
  const childDirs = subItems.filter(s => s.isDirectory);

  for (const f of childFiles) {
    const safeChildName = sanitizeFileName(f.name || 'download_file');
    results.push({
      fid: f.id,
      name: safeChildName,
      relativePath: `${folderRelativePath}/${safeChildName}`,
      size: f.size
    });
  }

  if (childDirs.length > 0) {
    const nestedResults: FlatDownloadTarget[] = [];
    await runConcurrent(childDirs, 4, async (subDir) => {
      const subFiles = await collectFilesRecursively(subDir, folderRelativePath, depth + 1);
      nestedResults.push(...subFiles);
    });
    results.push(...nestedResults);
  }

  return results;
};

// 单文件下载
const handleDownloadSingle = async (file: PanFileItem) => {
  if (isDownloading.value) return;
  const saveDir = await getDownloadDirectory();
  if (!saveDir) {
    showNotification({ type: 'warning', title: '下载提示', message: '请在设置中配置下载保存目录' });
    return;
  }

  isDownloading.value = true;
  try {
    const targets = await collectFilesRecursively(file);
    if (targets.length === 0) {
      showNotification({ type: 'warning', title: '下载提示', message: '所选文件夹为空' });
      return;
    }

    const fids = targets.map((t) => t.fid);
    const urlRes = await window.electronAPI?.getPanDownloadUrls?.({
      type: props.panType,
      fids
    });
    const urls = urlRes?.urls || {};
    const links = urlRes?.links || {};
    const normalizedDir = saveDir.replace(/\\/g, '/').replace(/\/+$/, '');

    const batchItems = targets.flatMap((target) => {
      const linkInfo = links[target.fid];
      const url = linkInfo?.url || urls[target.fid];
      if (!url) return [];
      return [{
        url,
        name: target.name,
        savePath: `${normalizedDir}/${target.relativePath}`,
        customReferer: defaultReferer.value,
        headers: linkInfo?.headers,
        totalBytes: linkInfo?.size || target.size,
        panContext: {
          panType: props.panType,
          mode: 'drive' as const,
          fid: target.fid
        }
      }];
    });

    if (batchItems.length === 0) {
      showNotification({
        type: 'error',
        title: '创建任务失败',
        message: '无法获取文件下载直链'
      });
      return;
    }

    const addedCount = await addDownloadsBatch(batchItems);
    if (addedCount > 0) {
      showNotification({
        type: 'success',
        title: '下载已添加',
        message: `已成功创建 ${addedCount} 个下载任务`
      });
    }
  } catch (err: any) {
    showNotification({ type: 'error', title: '下载异常', message: err.message || '未知错误' });
  } finally {
    isDownloading.value = false;
  }
};

// 批量下载所选
const handleBatchDownload = async () => {
  if (isDownloading.value) return;
  const selectedItems = currentFiles.value.filter((f) => selectedIds.value.includes(f.id));
  if (selectedItems.length === 0) return;

  const saveDir = await getDownloadDirectory();
  if (!saveDir) {
    showNotification({ type: 'warning', title: '下载提示', message: '请在设置中配置下载保存目录' });
    return;
  }

  isDownloading.value = true;
  try {
    const allTargets: FlatDownloadTarget[] = [];
    await runConcurrent(selectedItems, 4, async (item) => {
      const targets = await collectFilesRecursively(item);
      allTargets.push(...targets);
    });

    if (allTargets.length === 0) {
      showNotification({ type: 'warning', title: '下载提示', message: '所选项中未包含有效文件' });
      return;
    }

    const fids = allTargets.map((t) => t.fid);
    const urlRes = await window.electronAPI?.getPanDownloadUrls?.({
      type: props.panType,
      fids
    });
    const urls = urlRes?.urls || {};
    const links = urlRes?.links || {};
    const normalizedDir = saveDir.replace(/\\/g, '/').replace(/\/+$/, '');

    const batchItems = allTargets.flatMap((target) => {
      const linkInfo = links[target.fid];
      const url = linkInfo?.url || urls[target.fid];
      if (!url) return [];
      return [{
        url,
        name: target.name,
        savePath: `${normalizedDir}/${target.relativePath}`,
        customReferer: defaultReferer.value,
        headers: linkInfo?.headers,
        totalBytes: linkInfo?.size || target.size,
        panContext: {
          panType: props.panType,
          mode: 'drive' as const,
          fid: target.fid
        }
      }];
    });

    if (batchItems.length === 0) {
      showNotification({
        type: 'error',
        title: '创建任务失败',
        message: '无法获取文件下载直链'
      });
      return;
    }

    const addedCount = await addDownloadsBatch(batchItems);
    if (addedCount > 0) {
      showNotification({
        type: 'success',
        title: '批量下载已添加',
        message: `已成功添加 ${addedCount} 个下载任务`
      });
      clearSelection();
    }
  } catch (err: any) {
    showNotification({ type: 'error', title: '批量下载异常', message: err.message || '未知错误' });
  } finally {
    isDownloading.value = false;
  }
};

// 单文件删除
const handleDeleteSingle = async (file: PanFileItem) => {
  const confirmed = await confirm({
    title: '确认删除',
    message: `确定要从网盘中删除 "${file.name}" 吗？此操作无法撤销。`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });

  if (!confirmed) return;

  try {
    const res = await window.electronAPI?.deletePanFiles?.({
      type: props.panType,
      fids: [file.id]
    });
    if (res && res.success) {
      showNotification({ type: 'success', title: '删除成功', message: `已从网盘删除 "${file.name}"` });
      loadCurrentDirectory(true);
    } else {
      showNotification({ type: 'error', title: '删除失败', message: res?.error || '删除未成功' });
    }
  } catch (err: any) {
    showNotification({ type: 'error', title: '删除异常', message: err.message || '未知错误' });
  }
};

// 批量删除
const handleBatchDelete = async () => {
  if (selectedIds.value.length === 0) return;

  const confirmed = await confirm({
    title: '确认批量删除',
    message: `确定要从网盘中永久删除选中的 ${selectedIds.value.length} 个文件/文件夹吗？此操作无法撤销。`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });

  if (!confirmed) return;

  isDeleting.value = true;
  try {
    const res = await window.electronAPI?.deletePanFiles?.({
      type: props.panType,
      fids: selectedIds.value
    });
    if (res && res.success) {
      showNotification({ type: 'success', title: '删除成功', message: '所选文件已从网盘删除' });
      clearSelection();
      loadCurrentDirectory(true);
    } else {
      showNotification({ type: 'error', title: '删除失败', message: res?.error || '删除未成功' });
    }
  } catch (err: any) {
    showNotification({ type: 'error', title: '删除异常', message: err.message || '未知错误' });
  } finally {
    isDeleting.value = false;
  }
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  const pad = (n: number) => (n < 10 ? '0' + n : n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 网盘管理动作状态（新建文件夹 / 重命名 / 移动 / 创建分享）
const isModalSubmitting = ref(false);

const showNewFolderModal = ref(false);
const newFolderNameInput = ref('');

const showRenameModal = ref(false);
const renameTargetFile = ref<PanFileItem | null>(null);
const renameInput = ref('');

const showMoveModal = ref(false);
const moveTargetFiles = ref<PanFileItem[]>([]);
const moveExcludeIds = computed(() => moveTargetFiles.value.filter(f => f.isDirectory).map(f => f.id));

interface ShareResultData {
  shareUrl: string;
  passcode?: string;
  shareId?: string;
  title?: string;
  warning?: string;
}
const showShareModal = ref(false);
const shareTargetFiles = ref<PanFileItem[]>([]);
const shareExpireType = ref<number>(3);
const sharePasscodeInput = ref('');
const shareResult = ref<ShareResultData | null>(null);

const shareTargetSummary = computed(() => {
  if (shareTargetFiles.value.length === 0) return '';
  if (shareTargetFiles.value.length === 1) return shareTargetFiles.value[0].name;
  return `${shareTargetFiles.value[0].name} 等 ${shareTargetFiles.value.length} 项`;
});

const shareExpireOptions = computed(() => {
  if (props.panType === '115') {
    return [
      { value: 101, label: '永久有效' },
      { value: 102, label: '1 天' },
      { value: 103, label: '3 天' },
      { value: 104, label: '7 天' },
      { value: 105, label: '15 天' }
    ];
  }
  return [
    { value: 1, label: '永久有效' },
    { value: 2, label: '1 天' },
    { value: 3, label: '7 天' },
    { value: 4, label: '30 天' }
  ];
});

const openNewFolderModal = () => {
  newFolderNameInput.value = '';
  showNewFolderModal.value = true;
};

const closeNewFolderModal = () => {
  showNewFolderModal.value = false;
  newFolderNameInput.value = '';
};

const submitNewFolder = async () => {
  const name = newFolderNameInput.value.trim();
  if (!name || isModalSubmitting.value || !window.electronAPI?.createPanFolder) return;
  isModalSubmitting.value = true;
  try {
    const res = await window.electronAPI.createPanFolder({
      type: props.panType,
      parentFid: currentPdirFid.value,
      name
    });
    if (res && res.success) {
      showNotification({ type: 'success', title: '创建成功', message: `已创建文件夹「${name}」` });
      closeNewFolderModal();
      loadCurrentDirectory(true);
    } else {
      showNotification({ type: 'error', title: '创建失败', message: res?.error || '创建文件夹未成功' });
    }
  } catch (err: any) {
    showNotification({ type: 'error', title: '创建异常', message: err?.message || '未知错误' });
  } finally {
    isModalSubmitting.value = false;
  }
};

const openRenameModal = (file: PanFileItem) => {
  renameTargetFile.value = file;
  renameInput.value = file.name;
  showRenameModal.value = true;
};

const closeRenameModal = () => {
  showRenameModal.value = false;
  renameTargetFile.value = null;
  renameInput.value = '';
};

const submitRename = async () => {
  const target = renameTargetFile.value;
  const newName = renameInput.value.trim();
  if (!target || !newName || isModalSubmitting.value || !window.electronAPI?.renamePanItem) return;
  if (newName === target.name) {
    closeRenameModal();
    return;
  }
  isModalSubmitting.value = true;
  try {
    const res = await window.electronAPI.renamePanItem({
      type: props.panType,
      fid: target.id,
      newName,
      isDirectory: target.isDirectory
    });
    if (res && res.success) {
      showNotification({ type: 'success', title: '重命名成功', message: `已重命名为「${newName}」` });
      closeRenameModal();
      loadCurrentDirectory(true);
    } else {
      showNotification({ type: 'error', title: '重命名失败', message: res?.error || '重命名未成功' });
    }
  } catch (err: any) {
    showNotification({ type: 'error', title: '重命名异常', message: err?.message || '未知错误' });
  } finally {
    isModalSubmitting.value = false;
  }
};

const openMoveModal = (files: PanFileItem[]) => {
  if (files.length === 0) return;
  moveTargetFiles.value = files;
  showMoveModal.value = true;
};

const openMoveBatchModal = () => {
  const files = currentFiles.value.filter(f => selectedIds.value.includes(f.id));
  openMoveModal(files);
};

const handleConfirmMove = async (targetFid: string, targetName: string) => {
  showMoveModal.value = false;
  if (moveTargetFiles.value.length === 0 || !window.electronAPI?.movePanItems) return;
  if (targetFid === currentPdirFid.value) {
    showNotification({ type: 'info', title: '无需移动', message: '目标文件夹与当前所在目录相同' });
    return;
  }
  try {
    const res = await window.electronAPI.movePanItems({
      type: props.panType,
      fids: moveTargetFiles.value.map(f => f.id),
      targetDirFid: targetFid
    });
    if (res && res.success) {
      showNotification({ type: 'success', title: '移动成功', message: `已移动到「${targetName}」` });
      clearSelection();
      loadCurrentDirectory(true);
    } else {
      showNotification({ type: 'error', title: '移动失败', message: res?.error || '移动未成功' });
    }
  } catch (err: any) {
    showNotification({ type: 'error', title: '移动异常', message: err?.message || '未知错误' });
  }
};

const openShareModal = (files: PanFileItem[]) => {
  if (files.length === 0) return;
  shareTargetFiles.value = files;
  shareExpireType.value = props.panType === '115' ? 104 : props.panType === 'lanzou' ? 1 : 3;
  sharePasscodeInput.value = '';
  shareResult.value = null;
  showShareModal.value = true;
};

const openShareBatchModal = () => {
  const files = currentFiles.value.filter(f => selectedIds.value.includes(f.id));
  openShareModal(files);
};

const closeShareModal = () => {
  showShareModal.value = false;
  shareTargetFiles.value = [];
  sharePasscodeInput.value = '';
  shareResult.value = null;
};

const submitCreateShare = async () => {
  if (shareTargetFiles.value.length === 0 || isModalSubmitting.value || !window.electronAPI?.createPanShare) {
    return;
  }
  isModalSubmitting.value = true;
  try {
    const passcode = ['115', '139', 'lanzou'].includes(props.panType)
      ? ''
      : sharePasscodeInput.value.trim();
    const res = await window.electronAPI.createPanShare({
      type: props.panType,
      params: {
        fids: shareTargetFiles.value.map(f => f.id),
        fidsInfo: shareTargetFiles.value.map(f => ({
          fid: f.id,
          isDirectory: f.isDirectory
        })),
        expireType: shareExpireType.value,
        ...(passcode ? { passcode } : {})
      }
    });
    if (res && res.success && res.data) {
      shareResult.value = res.data;
    } else {
      showNotification({ type: 'error', title: '创建分享失败', message: res?.error || '生成分享链接未成功' });
    }
  } catch (err: any) {
    showNotification({ type: 'error', title: '创建分享异常', message: err?.message || '未知错误' });
  } finally {
    isModalSubmitting.value = false;
  }
};

const copyShareResult = async () => {
  if (!shareResult.value?.shareUrl) return;
  const text = shareResult.value.passcode
    ? `链接: ${shareResult.value.shareUrl}\n提取码: ${shareResult.value.passcode}`
    : shareResult.value.shareUrl;
  try {
    await navigator.clipboard.writeText(text);
    showNotification({ type: 'success', title: '已复制', message: '分享链接已复制到剪贴板' });
  } catch {
    showNotification({ type: 'error', title: '复制失败', message: '无法写入剪贴板，请手动复制' });
  }
};

watch(
  () => props.panType,
  () => {
    breadcrumbs.value = [{ id: '0', name: '全部文件' }];
    currentFiles.value = [];
    clearSelection();
    searchQuery.value = '';
    liveQuotaText.value = '';
    lastQuotaUpdateAt = 0;
    activeVideoUrl.value = null;
    activeAudioUrl.value = null;
    closeNewFolderModal();
    closeRenameModal();
    showMoveModal.value = false;
    closeShareModal();
    loadCurrentDirectory(true);
  }
);

onMounted(() => {
  loadCurrentDirectory(true);
});
</script>

<style scoped>
.pan-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-surface);
  overflow: hidden;
}

.workspace-header {
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-surface);
  flex-shrink: 0;
  gap: 12px;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.nav-btn {
  color: var(--text-secondary);
}

.breadcrumb-container {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  white-space: nowrap;
  padding-left: 6px;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.breadcrumb-item:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.breadcrumb-item.active {
  font-weight: 600;
  color: var(--text-primary);
  cursor: default;
}

.breadcrumb-item.active:hover {
  background: none;
}

.crumb-separator {
  color: var(--text-muted);
  font-size: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.quota-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 8px;
  background: var(--bg-app);
  border: 1px solid var(--border-light);
  border-radius: 6px;
}

.search-wrap {
  width: 200px;
}

.workspace-body {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 40px;
}

.spin-icon {
  animation: spin 1s linear infinite;
  color: var(--color-accent);
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.error-state {
  color: var(--color-error, #ef4444);
}

.empty-icon {
  color: var(--text-muted);
  opacity: 0.5;
}

.file-table {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.file-table-header {
  height: 38px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-app);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  position: sticky;
  top: 0;
  z-index: 2;
}

.file-row {
  height: 42px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
  color: var(--text-primary);
  transition: background-color 0.15s ease;
  user-select: none;
  cursor: pointer;
}

.file-row:hover {
  background: var(--bg-surface-hover);
}

.file-row.is-selected {
  background: var(--bg-surface-active, rgba(59, 130, 246, 0.08));
}

.col-checkbox {
  width: 36px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.col-name {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  cursor: pointer;
}

.file-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.file-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-size {
  width: 120px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.col-date {
  width: 150px;
  color: var(--text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.col-actions {
  width: 172px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.file-row:hover .col-actions {
  opacity: 1;
}

.row-action-btn {
  color: var(--text-secondary);
}

.row-action-btn:hover {
  color: var(--text-primary);
}

.row-action-btn.delete-btn:hover {
  color: var(--color-error, #ef4444);
}

.batch-bar {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 8px 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 20;
}

.batch-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selected-summary {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.batch-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pan-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}

.pan-modal {
  width: 420px;
  max-width: 90vw;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pan-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-light);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.pan-modal-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pan-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pan-form-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.pan-modal-input,
.pan-modal-select {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-app, var(--bg-surface));
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.pan-modal-input:focus,
.pan-modal-select:focus {
  border-color: var(--color-accent);
}

.share-summary {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-surface-hover);
  word-break: break-all;
}

.pan-notice-box {
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.25);
  font-size: 12px;
  color: var(--text-primary);
}

.share-result-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-light);
}

.share-result-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.5;
}

.share-result-row .result-label {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.share-result-row .result-val {
  color: var(--text-primary);
  word-break: break-all;
}

.share-result-row .result-val.mono {
  font-family: monospace;
  user-select: all;
}

.share-warning {
  font-size: 12px;
  color: #f59e0b;
  margin-top: 2px;
}

.pan-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-light);
}
</style>
