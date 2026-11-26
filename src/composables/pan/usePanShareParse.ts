import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useDownloads } from '@/composables/useDownloads';
import { useMessage } from '@/composables/useMessage';
import { usePanAccounts } from '@/composables/usePanAccounts';
import { notifyPanDirectoryChanged } from '@/composables/pan/usePanRefreshBus';
import { getDefaultPanReferer } from '@/composables/pan/types';
import { sanitizeFileName, sanitizeRelativePath } from '@/utils/pathSanitizer';
import {
  isProbablyPanText,
  extractShareUrlAndPassword,
  normalizePanShareFile,
  type PanFileWithUrl
} from '@/composables/pan/shareTextParser';

export interface UsePanShareParseOptions {
  visible: () => boolean;
  initialUrl: () => string | undefined;
  onSuccess: () => void;
  onClose: () => void;
}

/**
 * 网盘分享资源解析、多文件树选集、转存至网盘与下载直链投递逻辑
 */
export function usePanShareParse(options: UsePanShareParseOptions) {
  const { visible, initialUrl, onSuccess, onClose } = options;
  const { addDownloadsBatch } = useDownloads();
  const { showMessage } = useMessage();
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

  // 分享文件在线预览与临时转存清理状态
  const previewVideoUrl = ref<string | null>(null);
  const previewAudioUrl = ref<string | null>(null);
  const previewLoadingIndex = ref<number | null>(null);
  const previewPageUrl = ref<string>('');
  let previewReqSeq = 0;
  let activePreviewCleanup: { panType: string; cleanupDirFid: string } | null = null;

  let resolveSeq = 0;
  let resolveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanupActivePreviewTempDir = () => {
    const pending = activePreviewCleanup;
    activePreviewCleanup = null;
    if (!pending?.cleanupDirFid || !pending?.panType) return;
    window.electronAPI?.cleanupPanTempDir?.({
      type: pending.panType,
      cleanupDirFid: pending.cleanupDirFid
    }).then((cleanRes) => {
      if (cleanRes?.success) {
        notifyPanDirectoryChanged({
          panType: pending.panType,
          dirFids: ['0'],
          refreshQuota: true
        });
      }
    }).catch(() => {});
  };

  const closeMediaPreview = () => {
    ++previewReqSeq;
    previewVideoUrl.value = null;
    previewAudioUrl.value = null;
    previewPageUrl.value = '';
    previewLoadingIndex.value = null;
    cleanupActivePreviewTempDir();
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

  onUnmounted(() => {
    ++resolveSeq;
    if (resolveDebounceTimer) {
      clearTimeout(resolveDebounceTimer);
      resolveDebounceTimer = null;
    }
    closeMediaPreview();
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

  // 智能从分享长文本中分离出 URL 与 提取码
  const applyShareText = (rawText: string, resetPwd = true) => {
    if (!rawText) return;

    const { url: nextUrl, password: nextPwd } = extractShareUrlAndPassword(rawText);
    if (nextPwd) {
      inputPassword.value = nextPwd;
    } else if (resetPwd) {
      inputPassword.value = '';
    }

    if (inputUrl.value !== nextUrl) {
      inputUrl.value = nextUrl;
    }
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

  const triggerResolve = () => {
    if (resolveDebounceTimer) clearTimeout(resolveDebounceTimer);
    resolveError.value = '';
    const url = inputUrl.value.trim();
    if (!url) return;

    resolveDebounceTimer = setTimeout(() => {
      executeResolve(url);
    }, 300);
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

  watch(visible, async (val) => {
    if (val) {
      resetState();
      await initDefaultDownloadDir();
      const presetUrl = initialUrl();
      if (presetUrl) {
        applyShareText(presetUrl);
        triggerResolve();
      } else {
        checkClipboard();
      }
    }
  });

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

  // 打开“转存到网盘”目标目录选择器
  const handleOpenSavePicker = async () => {
    const pt = detectedPanType.value || 'quark';
    const panName = getPanName(pt);

    await loadAccounts();
    let account = getAccount(pt);
    if (!account) {
      if (!window.electronAPI?.loginPanAccount) {
        showMessage('当前客户端不支持网盘账号登录', 'error');
        return;
      }
      showMessage(`请先在弹出的窗口中登录${panName}账号后再转存`, 'info');
      const loginRes = await window.electronAPI.loginPanAccount(pt);
      if (!loginRes || !loginRes.success) {
        if (loginRes?.error && loginRes.error !== '用户取消登录') {
          showMessage(`登录失败: ${loginRes.error}`, 'error');
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
      .map(f => normalizePanShareFile(f))
      .filter(
        (m): m is { fid: string; fidToken?: string; pwdId?: string; stoken?: string; extra?: Record<string, any> } =>
          Boolean(m.fid)
      );

    if (items.length === 0) {
      showMessage('未找到有效的分享文件标识', 'error');
      return;
    }

    const pt = detectedPanType.value || 'quark';
    isSavingToDrive.value = true;
    try {
      const res = await window.electronAPI.savePanShare({
        type: pt,
        items,
        targetDirFid: targetFid
      });
      if (res && res.success) {
        notifyPanDirectoryChanged({
          panType: pt,
          dirFids: [targetFid],
          refreshQuota: true
        });
        showMessage(`已转存到「${targetName}」`, 'success');
      } else {
        showMessage(res?.error || '转存未成功', 'error');
      }
    } catch (err: any) {
      showMessage(err?.message ? `转存失败: ${err.message}` : '转存失败', 'error');
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
          const meta = normalizePanShareFile(file);
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

      const pt = detectedPanType.value;
      const panReferer = getDefaultPanReferer(pt);
      const normalizedDir = dir.replace(/\\/g, '/').replace(/\/+$/, '');
      const batchItems = targetFiles.map((file) => {
        const meta = normalizePanShareFile(file);
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
        showMessage('已添加到下载队列', 'success');
        onSuccess();
        onClose();
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
        const cleanupPanType = detectedPanType.value || 'quark';
        for (const dirFid of dirFids) {
          window.electronAPI?.cleanupPanTempDir?.({
            type: cleanupPanType,
            cleanupDirFid: dirFid
          }).then((cleanRes) => {
            if (cleanRes?.success) {
              notifyPanDirectoryChanged({
                panType: cleanupPanType,
                dirFids: ['0'],
                refreshQuota: true
              });
            }
          }).catch(() => {});
        }
      }
      showMessage(err.message ? `创建下载任务失败: ${err.message}` : '创建下载任务失败', 'error');
    } finally {
      isSubmitting.value = false;
    }
  };

  // 全网盘统一支持分享文件在线直连预览（自动处理 /pan-stream 代理与关闭清理临时转存目录）
  const handlePreviewFile = async (fileIndex: number) => {
    const file = resolvedFiles.value[fileIndex];
    if (!file || file.isDirectory) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isVideo = ['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts', 'm4v'].includes(ext);
    const isAudio = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext);
    if (!isVideo && !isAudio) {
      showMessage('该文件类型暂不支持在线预览', 'info');
      return;
    }

    const pt = detectedPanType.value || 'quark';
    const meta = normalizePanShareFile(file);
    const reqSeq = ++previewReqSeq;

    // 切换预览前先释放并清理上一个预览可能产生的临时转存目录
    previewVideoUrl.value = null;
    previewAudioUrl.value = null;
    cleanupActivePreviewTempDir();
    previewLoadingIndex.value = fileIndex;

    try {
      let streamUrl = '';
      let cleanupDirFid: string | undefined;

      if (meta.fid && window.electronAPI?.getPanSharePreviewUrl) {
        const res = await window.electronAPI.getPanSharePreviewUrl({
          type: pt,
          item: {
            fid: meta.fid,
            fidToken: meta.fidToken,
            pwdId: meta.pwdId,
            stoken: meta.stoken,
            extra: meta.extra
          },
          filename: file.name
        });
        if (reqSeq !== previewReqSeq) {
          if (res?.cleanupDirFid) {
            window.electronAPI?.cleanupPanTempDir?.({ type: pt, cleanupDirFid: res.cleanupDirFid }).catch(() => {});
          }
          return;
        }
        if (!res?.success || !res.previewUrl) {
          throw new Error(res?.error || '无法获取在线预览地址');
        }
        streamUrl = res.previewUrl;
        cleanupDirFid = res.cleanupDirFid;
      } else if (file.downloadUrl) {
        streamUrl = file.downloadUrl;
      } else {
        throw new Error('当前客户端不支持分享在线预览');
      }

      if (cleanupDirFid) {
        activePreviewCleanup = { panType: pt, cleanupDirFid };
      }
      previewPageUrl.value = getDefaultPanReferer(pt) || '';
      if (isVideo) {
        previewVideoUrl.value = streamUrl;
      } else {
        previewAudioUrl.value = streamUrl;
      }
    } catch (err: any) {
      if (reqSeq === previewReqSeq) {
        showMessage(err?.message ? `无法在线预览: ${err.message}` : '无法在线预览该文件', 'error');
      }
    } finally {
      if (reqSeq === previewReqSeq) {
        previewLoadingIndex.value = null;
      }
    }
  };

  return {
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
  };
}
