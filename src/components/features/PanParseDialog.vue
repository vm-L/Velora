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
          <span>{{ isSavingToDrive ? '转存中...' : '转存到网盘' }}</span>
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
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VIcon from '@/components/base/VIcon.vue';
import FileTree from '@/components/features/FileTree.vue';
import PanFolderPickerDialog from '@/components/features/PanFolderPickerDialog.vue';
import { useDownloads } from '@/composables/useDownloads';
import { useNotification } from '@/composables/useNotification';
import { usePanAccounts } from '@/composables/usePanAccounts';
import { sanitizeFileName, sanitizeRelativePath } from '@/utils/pathSanitizer';

interface PanFileWithUrl {
  id?: string;
  name: string;
  path: string;
  size: number;
  downloadUrl?: string;
  isDirectory?: boolean;
  rawInfo?: any;
}

const props = defineProps<{
  visible: boolean;
  initialUrl?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'success'): void;
}>();

const { addDownloadsBatch } = useDownloads();
const { showNotification } = useNotification();
const { getAccount, loadAccounts, getPanName } = usePanAccounts();

// 表单状态
const inputUrl = ref('');
const inputPassword = ref('');
const saveDirectory = ref('');
const isDragging = ref(false);
const isResolving = ref(false);
const isSubmitting = ref(false);
const isSavingToDrive = ref(false);
const savePickerVisible = ref(false);
const resolveError = ref('');
const detectedPanType = ref<string>('quark');

// 解析结果与选集
const resolvedFiles = ref<PanFileWithUrl[]>([]);
const selectedIndices = ref<number[]>([]);

// 网盘元数据配置
const panMetas: Record<string, { type: string; name: string; domains: string[] }> = {
  quark: { type: 'quark', name: '夸克网盘', domains: ['pan.quark.cn'] },
  uc: { type: 'uc', name: 'UC网盘', domains: ['drive.uc.cn', 'fast.uc.cn'] },
  baidu: { type: 'baidu', name: '百度网盘', domains: ['pan.baidu.com'] },
  '123pan': {
    type: '123pan',
    name: '123云盘',
    domains: ['123pan.com', '123pan.cn', '123684.com', '123865.com', '123912.com']
  },
  lanzou: { type: 'lanzou', name: '蓝奏云', domains: ['lanzou', 'woozooo.com'] },
  ilanzou: { type: 'ilanzou', name: '蓝奏云优享版', domains: ['ilanzou.'] },
  xunlei: { type: 'xunlei', name: '迅雷云盘', domains: ['pan.xunlei.com'] },
  '115': { type: '115', name: '115网盘', domains: ['115.com', '115cdn.com', '115rc.com', 'anxia.com'] },
  '139': { type: '139', name: '中国移动云盘', domains: ['yun.139.com', 'caiyun.139.com'] },
  guangya: { type: 'guangya', name: '光鸭云盘', domains: ['guangyapan.com'] }
};

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

let resolveSeq = 0;

onUnmounted(() => {
  ++resolveSeq;
  if (resolveDebounceTimer) {
    clearTimeout(resolveDebounceTimer);
    resolveDebounceTimer = null;
  }
});

watch(() => props.visible, async (val) => {
  if (val) {
    resetState();
    await initDefaultDownloadDir();
    if (props.initialUrl) {
      applyShareText(props.initialUrl);
      triggerResolve();
    } else {
      checkClipboard();
    }
  }
});

const resetState = () => {
  ++resolveSeq;
  if (resolveDebounceTimer) {
    clearTimeout(resolveDebounceTimer);
    resolveDebounceTimer = null;
  }
  inputUrl.value = '';
  inputPassword.value = '';
  resolveError.value = '';
  isResolving.value = false;
  resolvedFiles.value = [];
  selectedIndices.value = [];
};

const handleClose = () => {
  emit('update:visible', false);
};

// 检查剪贴板
const checkClipboard = async () => {
  try {
    if (inputUrl.value.trim()) return;
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = (await navigator.clipboard.readText() || '').trim();
      if (inputUrl.value.trim()) return;
      if (text && isProbablyPanText(text)) {
        applyShareText(text);
        triggerResolve();
      }
    }
  } catch {}
};

const isProbablyPanText = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  for (const meta of Object.values(panMetas)) {
    if (meta.domains.some(d => lower.includes(d))) return true;
  }
  // 仅匹配明确的迅雷口令特征，避免误填普通中文剪贴板文本
  return /(?:迅雷云盘|迅雷口令|复制这段内容.*迅雷|pan\.xunlei\.com)/i.test(trimmed);
};

// 智能从分享长文本中分离出 URL 与 提取码
const applyShareText = (rawText: string, resetPwd = true) => {
  if (!rawText) return;

  // 1. 尝试从文本中匹配提取码、密码、访问码等
  const pwdMatch = rawText.match(/(?:提取码|密码|访问码|code|pwd)[:：\s]*([a-zA-Z0-9]{4,8})/i);

  // 2. 尝试从有效 URL 中提取（排除中文和全角标点）
  const urlMatch = rawText.match(/https?:\/\/[^\s\u3000-\u303f\uff00-\uffef\u4e00-\u9fff"'<>()（）【】[\]]+/i);
  let urlPwd = '';
  if (urlMatch) {
    try {
      const parsedUrl = new URL(urlMatch[0]);
      urlPwd =
        parsedUrl.searchParams.get('pwd') ||
        parsedUrl.searchParams.get('password') ||
        parsedUrl.searchParams.get('passcode') ||
        parsedUrl.searchParams.get('code') ||
        '';
    } catch {}
  }

  const nextPwd = pwdMatch?.[1] || urlPwd || '';
  if (nextPwd) {
    inputPassword.value = nextPwd;
  } else if (resetPwd) {
    inputPassword.value = '';
  }

  const nextUrl = urlMatch ? urlMatch[0] : rawText.trim();
  if (inputUrl.value !== nextUrl) {
    inputUrl.value = nextUrl;
  }
};

const onUrlPaste = (e: ClipboardEvent) => {
  const pastedText = e.clipboardData?.getData('text') || '';
  if (pastedText) {
    e.preventDefault();
    applyShareText(pastedText);
    triggerResolve();
  }
};

const onUrlInput = () => {
  const val = inputUrl.value;
  if (
    (/\s/.test(val) && /https?:\/\//i.test(val)) ||
    /(?:提取码|密码|访问码)[:：\s]*[a-zA-Z0-9]{4,8}/i.test(val)
  ) {
    applyShareText(val, false);
  }
  triggerResolve();
};

const onPasswordInput = () => {
  triggerResolve();
};

let resolveDebounceTimer: any = null;
const triggerResolve = () => {
  if (resolveDebounceTimer) clearTimeout(resolveDebounceTimer);
  resolveError.value = '';
  const url = inputUrl.value.trim();
  if (!url) return;

  resolveDebounceTimer = setTimeout(() => {
    executeResolve(url);
  }, 300);
};

const executeResolve = async (url: string) => {
  if (!window.electronAPI?.resolvePanResource) {
    resolveError.value = '当前客户端环境不支持网盘解析接口';
    return;
  }

  const seq = ++resolveSeq;
  isResolving.value = true;
  resolveError.value = '';
  resolvedFiles.value = [];
  selectedIndices.value = [];

  try {
    const res = await window.electronAPI.resolvePanResource({
      url,
      password: inputPassword.value.trim()
    });
    if (seq !== resolveSeq) return;

    if (res && res.success && res.data) {
      const data = res.data;
      if (data.panType) {
        detectedPanType.value = data.panType;
      }
      if (Array.isArray(data.files) && data.files.length > 0) {
        resolvedFiles.value = data.files.map((f: any) => ({
          id: f.id,
          name: f.name || '',
          path: f.path || f.name || '',
          size: f.size || 0,
          downloadUrl: f.downloadUrl,
          isDirectory: f.isDirectory,
          rawInfo: f.rawInfo
        }));
        // 默认全选
        selectedIndices.value = resolvedFiles.value.map((_, i) => i);
      } else {
        resolveError.value = '该分享链接中未找到有效文件';
      }
    } else {
      resolveError.value = res?.error || '无法解析此网盘资源，请检查链接或提取码是否正确';
    }
  } catch (err: any) {
    if (seq !== resolveSeq) return;
    resolveError.value = err?.message || '网盘解析异常';
  } finally {
    if (seq === resolveSeq) {
      isResolving.value = false;
    }
  }
};

// 选择本地保存目录
const handleSelectDirectory = async () => {
  if (window.electronAPI?.selectDirectory) {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      saveDirectory.value = dir;
    }
  }
};

// 拖拽处理
const onDragOver = () => {
  isDragging.value = true;
};

const onDragLeave = () => {
  isDragging.value = false;
};

const onDrop = (e: DragEvent) => {
  isDragging.value = false;
  if (!e.dataTransfer) return;
  const text = e.dataTransfer.getData('text');
  if (text) {
    applyShareText(text.trim());
    triggerResolve();
  }
};

// 选集快捷操作
const selectAll = () => {
  selectedIndices.value = resolvedFiles.value.map((_, i) => i);
};

const invertSelect = () => {
  const currentSet = new Set(selectedIndices.value);
  const next: number[] = [];
  resolvedFiles.value.forEach((_, i) => {
    if (!currentSet.has(i)) next.push(i);
  });
  selectedIndices.value = next;
};

const selectedTotalSize = computed(() => {
  if (resolvedFiles.value.length === 0) return 0;
  const set = new Set(selectedIndices.value);
  return resolvedFiles.value.reduce((acc, file, index) => {
    return set.has(index) ? acc + file.size : acc;
  }, 0);
});

const isSubmitDisabled = computed(() => {
  if (!inputUrl.value.trim() || !saveDirectory.value.trim()) {
    return true;
  }
  if (resolvedFiles.value.length === 0 || selectedIndices.value.length === 0) {
    return true;
  }
  return isResolving.value;
});

const isSaveDisabled = computed(() => {
  if (!inputUrl.value.trim()) return true;
  if (resolvedFiles.value.length === 0 || selectedIndices.value.length === 0) {
    return true;
  }
  return isResolving.value;
});

const getNormalizedRaw = (file: PanFileWithUrl): {
  fid?: string;
  fidToken?: string;
  pwdId?: string;
  stoken?: string;
  extra?: Record<string, any>;
} => {
  const r = file.rawInfo || {};
  const fid =
    r.fid ||
    (r.FileId !== undefined ? String(r.FileId) : undefined) ||
    (r.fs_id !== undefined ? String(r.fs_id) : undefined) ||
    file.id;
  const fidToken = r.fidToken || r.share_fid_token || r.S3keyFlag;
  const pwdId = r.pwdId || r.pwd_id || r.shareKey;
  const stoken = r.stoken || r.sekey;
  const safeName = sanitizeFileName(file.name || 'download_file');
  const relativePath = sanitizeRelativePath(file.path || file.name || safeName, safeName);
  const baseExtra =
    r.extra && typeof r.extra === 'object'
      ? r.extra
      : Object.keys(r).length > 0
        ? r
        : {};
  const extra: Record<string, any> = {
    ...baseExtra,
    relativePath
  };
  return {
    fid: fid !== undefined ? String(fid) : undefined,
    fidToken,
    pwdId,
    stoken,
    extra
  };
};

// 打开“转存到网盘”目标目录选择器
const handleOpenSavePicker = async () => {
  const pt = detectedPanType.value || 'quark';
  const panName = getPanName(pt);

  await loadAccounts();
  let account = getAccount(pt);
  if (!account) {
    if (!window.electronAPI?.loginPanAccount) {
      showNotification({
        type: 'error',
        title: '无法登录',
        message: '当前客户端不支持网盘账号登录'
      });
      return;
    }
    showNotification({
      type: 'info',
      title: `需要登录${panName}`,
      message: `请先在弹出的窗口中登录${panName}账号后再转存`
    });
    const loginRes = await window.electronAPI.loginPanAccount(pt);
    if (!loginRes || !loginRes.success) {
      if (loginRes?.error && loginRes.error !== '用户取消登录') {
        showNotification({
          type: 'error',
          title: '登录失败',
          message: loginRes.error
        });
      }
      return;
    }
    await loadAccounts();
    account = getAccount(pt);
    if (!account) return;
  }

  savePickerVisible.value = true;
};

const handleConfirmSaveToDrive = async (targetFid: string, targetName: string) => {
  savePickerVisible.value = false;
  const targetFiles = selectedIndices.value.map(i => resolvedFiles.value[i]).filter(Boolean);
  if (targetFiles.length === 0 || !window.electronAPI?.savePanShare) return;

  const items = targetFiles
    .map(f => getNormalizedRaw(f))
    .filter(
      (m): m is { fid: string; fidToken?: string; pwdId?: string; stoken?: string; extra?: Record<string, any> } =>
        Boolean(m.fid)
    );

  if (items.length === 0) {
    showNotification({ type: 'error', title: '转存失败', message: '未找到有效的分享文件标识' });
    return;
  }

  isSavingToDrive.value = true;
  try {
    const res = await window.electronAPI.savePanShare({
      type: detectedPanType.value || 'quark',
      items,
      targetDirFid: targetFid
    });
    if (res && res.success) {
      showNotification({
        type: 'success',
        title: '转存成功',
        message: `已转存 ${res.savedCount ?? items.length} 项到「${targetName}」`
      });
    } else {
      showNotification({
        type: 'error',
        title: '转存失败',
        message: res?.error || '转存未成功'
      });
    }
  } catch (err: any) {
    showNotification({
      type: 'error',
      title: '转存异常',
      message: err?.message || '未知错误'
    });
  } finally {
    isSavingToDrive.value = false;
  }
};

// 提交下载加入队列
const handleSubmit = async () => {
  const dir = saveDirectory.value.trim();
  if (!dir) return;

  const targetFiles = selectedIndices.value.map(i => resolvedFiles.value[i]).filter(Boolean);
  if (targetFiles.length === 0) return;

  isSubmitting.value = true;
  let directUrlMap: Record<string, string> = {};
  let directLinksMap: Record<
    string,
    { fid: string; url: string; size?: number; filename?: string; headers: Record<string, string>; cleanupDirFid?: string }
  > = {};
  let batchDispatched = false;
  try {
    // 1. 针对未携带直链的文件（如夸克免转存分享），批量调用接口换取真实直链
    const needFetchItems: Array<{
      fid: string;
      fidToken?: string;
      pwdId?: string;
      stoken?: string;
      extra?: Record<string, any>;
    }> = [];
    targetFiles.forEach((file) => {
      if (!file.downloadUrl) {
        const meta = getNormalizedRaw(file);
        if (meta.fid) {
          needFetchItems.push({ ...meta, fid: meta.fid });
        }
      }
    });

    if (needFetchItems.length > 0 && window.electronAPI?.getPanShareDownloadUrls) {
      const res = await window.electronAPI.getPanShareDownloadUrls({
        type: detectedPanType.value || 'quark',
        items: needFetchItems
      });
      if (res && res.success && res.urls) {
        directUrlMap = res.urls;
        directLinksMap = res.links || {};
      } else {
        throw new Error(res?.error || '无法获取网盘文件真实下载链接');
      }
    }

    let panReferer: string | undefined = undefined;
    const pt = detectedPanType.value;
    if (pt === 'quark') panReferer = 'https://pan.quark.cn/';
    else if (pt === 'uc') panReferer = 'https://drive.uc.cn/';
    else if (pt === 'baidu') panReferer = 'https://pan.baidu.com/';
    else if (pt === '123pan') panReferer = 'https://yun.123pan.cn/';
    else if (pt === 'xunlei') panReferer = 'https://pan.xunlei.com/';
    else if (pt === '115') panReferer = 'https://115.com/';
    else if (pt === 'lanzou') panReferer = 'https://pc.woozooo.com/';
    else if (pt === '139') panReferer = 'https://yun.139.com/';
    else if (pt === 'guangya') panReferer = 'https://www.guangyapan.com/';
    else if (pt === 'ilanzou') panReferer = 'https://www.ilanzou.com/';

    const normalizedDir = dir.replace(/\\/g, '/').replace(/\/+$/, '');
    const batchItems = targetFiles.map((file) => {
      const meta = getNormalizedRaw(file);
      const linkDetail =
        (file.id ? directLinksMap[file.id] : undefined) ||
        (meta.fid ? directLinksMap[meta.fid] : undefined);

      const directUrl =
        file.downloadUrl ||
        linkDetail?.url ||
        (file.id ? directUrlMap[file.id] : undefined) ||
        (meta.fid ? directUrlMap[meta.fid] : undefined);

      if (!directUrl) {
        throw new Error(`文件 "${file.name}" 未能获取到下载直链，已取消`);
      }

      const fileName = sanitizeFileName(file.name || 'download_file');
      const relativePath = sanitizeRelativePath(file.path || file.name || 'download_file', fileName);
      const fullSavePath = `${normalizedDir}/${relativePath}`;

      return {
        url: directUrl,
        name: fileName,
        savePath: fullSavePath,
        customReferer: panReferer,
        headers: linkDetail?.headers,
        totalBytes: linkDetail?.size || file.size,
        panContext: meta.fid
          ? {
              panType: pt || 'quark',
              mode: 'share' as const,
              fid: meta.fid,
              fidToken: meta.fidToken,
              pwdId: meta.pwdId,
              stoken: meta.stoken,
              cleanupDirFid: linkDetail?.cleanupDirFid,
              extra: meta.extra
            }
          : undefined
      };
    });

    const successCount = await addDownloadsBatch(batchItems);
    batchDispatched = true;

    if (successCount > 0) {
      showNotification({
        type: 'success',
        title: '网盘下载已启动',
        message: `已成功添加 ${successCount} 个下载任务`
      });
      emit('success');
      handleClose();
    }
  } catch (err: any) {
    if (!batchDispatched) {
      const dirFids = Array.from(
        new Set(
          Object.values(directLinksMap)
            .map((link) => link?.cleanupDirFid)
            .filter((fid): fid is string => Boolean(fid))
        )
      );
      for (const dirFid of dirFids) {
        window.electronAPI?.cleanupPanTempDir?.({
          type: detectedPanType.value || 'quark',
          cleanupDirFid: dirFid
        }).catch(() => {});
      }
    }
    showNotification({
      type: 'error',
      title: '创建网盘下载任务失败',
      message: err.message || '未知错误'
    });
  } finally {
    isSubmitting.value = false;
  }
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
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
