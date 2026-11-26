export const lanWebRemoteScripts = `
    // =========================================================================
    // 阶段 3 共享远程内核：视图切换、流式多文件上传、远程下载队列与网盘分享解析
    // =========================================================================
    state.activeMainView = 'files';
    state.remoteDownloads = [];
    state.downloadsEventSource = null;
    state.panParsedType = '';
    state.panParsedTitle = '';
    state.panParsedFiles = [];
    state.panSelectedIndices = new Set();
    state.panSaveBreadcrumbs = [{ id: '0', name: '全部文件' }];
    state.activeUploadXhr = null;
    state.isUploading = false;

    window.switchLanView = function(targetMode) {
      var target = targetMode === 'mobile' ? '/m?prefer=1' : '/desktop?prefer=1';
      window.location.href = target;
    };

    window.switchMainView = function(viewName) {
      state.activeMainView = viewName || 'files';
      var sections = document.querySelectorAll('.lan-panel-section');
      for (var i = 0; i < sections.length; i++) {
        var el = sections[i];
        if (el.getAttribute('data-panel') === state.activeMainView) {
          el.classList.add('is-active');
        } else {
          el.classList.remove('is-active');
        }
      }
      var navBtns = document.querySelectorAll('[data-nav-view]');
      for (var j = 0; j < navBtns.length; j++) {
        var btn = navBtns[j];
        if (btn.getAttribute('data-nav-view') === state.activeMainView) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
      updateRemoteWriteVisibility();
      if (state.activeMainView === 'downloads') {
        renderRemoteDownloads();
      }
    };

    function updateRemoteWriteVisibility() {
      var allow = !!state.allowEdit;
      var uploadBtn = document.getElementById('upload-files-btn');
      if (uploadBtn) uploadBtn.style.display = allow ? 'inline-flex' : 'none';
      var dlFormCard = document.getElementById('remote-dl-form-card');
      if (dlFormCard) dlFormCard.style.display = allow ? 'flex' : 'none';
      var dlReadonly = document.getElementById('remote-dl-readonly');
      if (dlReadonly) dlReadonly.style.display = allow ? 'none' : 'block';
      var panFormCard = document.getElementById('remote-pan-form-card');
      if (panFormCard) panFormCard.style.display = allow ? 'flex' : 'none';
      var panReadonly = document.getElementById('remote-pan-readonly');
      if (panReadonly) panReadonly.style.display = allow ? 'none' : 'block';
    }

    // -------------------------------------------------------------------------
    // 流式多文件上传（支持多选与桌面拖拽）
    // -------------------------------------------------------------------------
    window.triggerFileUpload = function() {
      if (!state.allowEdit) {
        showToast('当前为只读模式，请在桌面端设置开启局域网编辑权限', 3000);
        return;
      }
      if (!state.currentPath) {
        showToast('请先进入一个本地资源目录再上传', 3000);
        return;
      }
      var input = document.getElementById('lan-upload-input');
      if (input) {
        input.value = '';
        input.click();
      }
    };

    window.cancelActiveUpload = function() {
      if (state.activeUploadXhr) {
        try { state.activeUploadXhr.abort(); } catch (e) {}
        state.activeUploadXhr = null;
      }
      state.isUploading = false;
      var box = document.getElementById('upload-progress-float');
      if (box) box.style.display = 'none';
      showToast('已取消上传');
    };

    function uploadSingleFile(file, dirPath, onProgress) {
      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        state.activeUploadXhr = xhr;
        var url = '/api/upload?dir=' + encodeURIComponent(dirPath) +
          '&filename=' + encodeURIComponent(file.name || 'upload.bin') +
          (state.token ? '&token=' + encodeURIComponent(state.token) : '');
        xhr.open('POST', url, true);
        if (state.token) {
          xhr.setRequestHeader('Authorization', 'Bearer ' + state.token);
        }
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
          }
        };
        xhr.onload = function() {
          state.activeUploadXhr = null;
          try {
            var json = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300 && json.success) {
              resolve(json);
            } else {
              reject(new Error(json.error || ('上传失败 (' + xhr.status + ')')));
            }
          } catch (err) {
            reject(new Error('上传响应解析失败'));
          }
        };
        xhr.onerror = function() {
          state.activeUploadXhr = null;
          reject(new Error('网络异常导致上传失败'));
        };
        xhr.onabort = function() {
          state.activeUploadXhr = null;
          reject(new Error('ABORTED'));
        };
        xhr.send(file);
      });
    }

    async function uploadFileList(fileList) {
      if (!fileList || fileList.length === 0) return;
      if (!state.allowEdit) {
        showToast('未开启局域网编辑权限，无法上传文件', 3000);
        return;
      }
      if (!state.currentPath) {
        showToast('请先选择目标本地资源目录', 3000);
        return;
      }
      if (state.isUploading) {
        showToast('已有文件正在上传，请等待当前批次完成', 3000);
        return;
      }

      var files = Array.prototype.slice.call(fileList);
      var targetDir = state.currentPath;
      state.isUploading = true;

      var floatBox = document.getElementById('upload-progress-float');
      var titleEl = document.getElementById('upload-progress-title');
      var nameEl = document.getElementById('upload-progress-name');
      var fillEl = document.getElementById('upload-progress-fill');
      if (floatBox) floatBox.style.display = 'flex';

      var successCount = 0;
      for (var i = 0; i < files.length; i++) {
        if (!state.isUploading) break;
        var f = files[i];
        if (titleEl) titleEl.innerText = '正在上传 (' + (i + 1) + '/' + files.length + ')';
        if (nameEl) nameEl.innerText = f.name + ' (' + formatBytes(f.size) + ')';
        if (fillEl) fillEl.style.width = '0%';
        try {
          await uploadSingleFile(f, targetDir, function(pct) {
            if (fillEl) fillEl.style.width = pct + '%';
          });
          successCount++;
        } catch (err) {
          if (err && err.message === 'ABORTED') break;
          showToast(f.name + ' 上传失败: ' + (err.message || '未知错误'), 3000);
        }
      }

      state.isUploading = false;
      state.activeUploadXhr = null;
      if (floatBox) floatBox.style.display = 'none';

      if (successCount > 0) {
        showToast('已成功上传 ' + successCount + ' 个文件');
        if (state.currentPath === targetDir) {
          loadDirectory(targetDir, { preserveScroll: true });
        }
      }
    }

    (function bindUploadEvents() {
      var input = document.getElementById('lan-upload-input');
      if (input) {
        input.addEventListener('change', function(e) {
          if (e.target.files && e.target.files.length > 0) {
            uploadFileList(e.target.files);
          }
        });
      }

      // 桌面端拖拽上传
      var dropOverlay = document.getElementById('desktop-drop-overlay');
      if (dropOverlay) {
        var dragDepth = 0;
        window.addEventListener('dragenter', function(e) {
          if (!state.allowEdit || state.activeMainView !== 'files' || !state.currentPath) return;
          if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.indexOf('Files') !== -1) {
            e.preventDefault();
            dragDepth++;
            dropOverlay.classList.add('is-visible');
          }
        });
        window.addEventListener('dragover', function(e) {
          if (dragDepth > 0) e.preventDefault();
        });
        window.addEventListener('dragleave', function(e) {
          if (dragDepth > 0) {
            dragDepth--;
            if (dragDepth <= 0) {
              dragDepth = 0;
              dropOverlay.classList.remove('is-visible');
            }
          }
        });
        window.addEventListener('drop', function(e) {
          if (dragDepth > 0 || dropOverlay.classList.contains('is-visible')) {
            e.preventDefault();
            dragDepth = 0;
            dropOverlay.classList.remove('is-visible');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              uploadFileList(e.dataTransfer.files);
            }
          }
        });
      }
    })();

    // -------------------------------------------------------------------------
    // 远程下载队列 SSE 与控制
    // -------------------------------------------------------------------------
    function getDownloadStatusLabel(status) {
      var map = {
        downloading: '下载中',
        resolving: '解析中',
        converting: '封装中',
        compressing: '压缩中',
        processing: '处理中',
        waiting: '等待中',
        paused: '已暂停',
        completed: '已完成',
        error: '下载失败',
        file_removed: '文件已移除',
        file_corrupted: '文件损坏'
      };
      return map[status] || status || '未知';
    }

    function updateDownloadBadges() {
      var activeCount = 0;
      for (var i = 0; i < state.remoteDownloads.length; i++) {
        var st = state.remoteDownloads[i].status;
        if (st === 'downloading' || st === 'resolving' || st === 'converting' || st === 'compressing' || st === 'processing' || st === 'waiting') {
          activeCount++;
        }
      }
      var badges = document.querySelectorAll('.dl-active-badge');
      for (var b = 0; b < badges.length; b++) {
        if (activeCount > 0) {
          badges[b].innerText = activeCount > 99 ? '99+' : String(activeCount);
          badges[b].style.display = 'inline-flex';
        } else {
          badges[b].style.display = 'none';
        }
      }
    }

    function renderRemoteDownloads() {
      var container = document.getElementById('remote-dl-list');
      if (!container) return;
      var list = state.remoteDownloads || [];
      if (list.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:36px 16px;">暂无下载任务</div>';
        return;
      }

      var html = '';
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        var isActive = ['downloading', 'resolving', 'converting', 'compressing', 'processing', 'waiting'].indexOf(t.status) !== -1;
        var isDone = t.status === 'completed';
        var isErr = t.status === 'error' || t.status === 'file_removed' || t.status === 'file_corrupted';
        var statusCls = isActive ? 'is-active' : (isDone ? 'is-done' : (isErr ? 'is-error' : ''));
        var pct = Math.max(0, Math.min(100, Number(t.progress) || 0));
        var sizeText = t.totalBytes > 0
          ? (formatBytes(t.receivedBytes) + ' / ' + formatBytes(t.totalBytes))
          : (t.receivedBytes > 0 ? formatBytes(t.receivedBytes) : (pct + '%'));
        var speedPart = isActive && t.speed > 0 ? (' · ' + (t.speedText || (formatBytes(t.speed) + '/s'))) : '';
        var errPart = isErr && t.errorMsg ? (' · ' + escapeHtml(t.errorMsg)) : '';

        var btnsHtml = '';
        if (state.allowEdit) {
          var safeId = encodeURIComponent(t.id);
          if (isActive) {
            btnsHtml += '<button class="v-btn v-btn-secondary" style="height:28px; padding:0 10px; font-size:12px;" onclick="controlRemoteDownload(\\'pause\\', \\'' + safeId + '\\')">暂停</button>';
          } else if (!isDone) {
            btnsHtml += '<button class="v-btn v-btn-secondary" style="height:28px; padding:0 10px; font-size:12px;" onclick="controlRemoteDownload(\\'resume\\', \\'' + safeId + '\\')">继续</button>';
          }
          btnsHtml += '<button class="v-btn v-btn-danger" style="height:28px; padding:0 10px; font-size:12px;" onclick="confirmDeleteRemoteDownload(\\'' + safeId + '\\', \\'' + encodeURIComponent(t.name) + '\\')">删除</button>';
        }

        html += '<div class="remote-dl-item">' +
          '<div class="remote-dl-top">' +
            '<div class="remote-dl-name" title="' + escapeHtml(t.name) + '">' + escapeHtml(t.name) + '</div>' +
            '<span class="remote-dl-status ' + statusCls + '">' + escapeHtml(getDownloadStatusLabel(t.status)) + '</span>' +
          '</div>' +
          '<div class="remote-dl-progress-track"><div class="remote-dl-progress-fill" style="width:' + pct + '%;"></div></div>' +
          '<div class="remote-dl-meta">' +
            '<span>' + sizeText + speedPart + errPart + '</span>' +
            '<div class="remote-dl-actions">' + btnsHtml + '</div>' +
          '</div>' +
        '</div>';
      }
      container.innerHTML = html;
    }

    function connectDownloadsSSE() {
      if (state.downloadsEventSource) {
        try { state.downloadsEventSource.close(); } catch (e) {}
        state.downloadsEventSource = null;
      }
      var sseUrl = '/api/downloads/stream' + (state.token ? '?token=' + encodeURIComponent(state.token) : '');
      try {
        var es = new EventSource(sseUrl);
        state.downloadsEventSource = es;
        es.onmessage = function(event) {
          try {
            var data = JSON.parse(event.data || '{}');
            if (Array.isArray(data.tasks)) {
              state.remoteDownloads = data.tasks;
              updateDownloadBadges();
              if (state.activeMainView === 'downloads') {
                renderRemoteDownloads();
              }
            }
          } catch (e) {}
        };
        es.onerror = function() {
          if (state.downloadsEventSource === es) {
            try { es.close(); } catch (e) {}
            state.downloadsEventSource = null;
            setTimeout(connectDownloadsSSE, 4000);
          }
        };
      } catch (e) {}
    }

    window.submitRemoteDownload = async function() {
      if (!state.allowEdit) {
        showToast('当前为只读模式，无法新建下载', 3000);
        return;
      }
      var urlEl = document.getElementById('dl-url-input');
      var nameEl = document.getElementById('dl-name-input');
      var urlVal = urlEl ? urlEl.value.trim() : '';
      if (!urlVal) {
        showToast('请输入下载链接', 3000);
        return;
      }
      var btn = document.getElementById('dl-submit-btn');
      if (btn) btn.disabled = true;
      try {
        var data = await apiFetch('/api/downloads/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: urlVal,
            name: nameEl ? nameEl.value.trim() : ''
          })
        });
        if (data && data.success) {
          showToast('已投递到桌面端下载队列');
          if (urlEl) urlEl.value = '';
          if (nameEl) nameEl.value = '';
        } else {
          showToast((data && data.error) || '创建下载任务失败', 3000);
        }
      } catch (err) {
        showToast('提交下载失败: ' + (err.message || '网络异常'), 3000);
      } finally {
        if (btn) btn.disabled = false;
      }
    };

    window.controlRemoteDownload = async function(action, encodedId, deleteFile) {
      var id = decodeURIComponent(encodedId);
      try {
        var data = await apiFetch('/api/downloads/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: action, id: id, deleteFile: !!deleteFile })
        });
        if (!data || !data.success) {
          showToast((data && data.error) || '操作失败', 3000);
        }
      } catch (err) {
        showToast('控制任务失败', 3000);
      }
    };

    window.confirmDeleteRemoteDownload = async function(encodedId, encodedName) {
      var name = decodeURIComponent(encodedName);
      var ok = await window.showConfirm({
        title: '删除下载任务',
        message: '确定要删除任务「' + name + '」吗？',
        confirmText: '删除',
        isDanger: true
      });
      if (ok) {
        controlRemoteDownload('delete', encodedId, false);
      }
    };

    // -------------------------------------------------------------------------
    // 远程网盘分享口令解析、下载投递与转存
    // -------------------------------------------------------------------------
    function parsePanUrlAndPwd(rawText) {
      var text = (rawText || '').trim();
      var pwdMatch = text.match(/(?:提取码|密码|访问码|口令|code|pwd)[:：\\s]*([a-zA-Z0-9]{4,8})/i);
      var urlMatch = text.match(/https?:\\/\\/[^\\s\\u3000-\\u303f\\uff00-\\uffef\\u4e00-\\u9fff"'<>()（）【】[\\]]+/i);
      return {
        url: urlMatch ? urlMatch[0] : text,
        password: pwdMatch ? pwdMatch[1] : ''
      };
    }

    function renderPanParsedFiles() {
      var box = document.getElementById('remote-pan-results');
      var listEl = document.getElementById('remote-pan-file-list');
      var summaryEl = document.getElementById('remote-pan-summary');
      var saveBtn = document.getElementById('pan-save-drive-btn');
      if (!box || !listEl) return;

      if (!state.panParsedFiles || state.panParsedFiles.length === 0) {
        box.style.display = 'none';
        return;
      }
      box.style.display = 'flex';
      if (saveBtn) {
        saveBtn.style.display = state.panParsedType === 'lanzou' ? 'none' : 'inline-flex';
      }

      var totalSize = 0;
      var html = '';
      for (var i = 0; i < state.panParsedFiles.length; i++) {
        var f = state.panParsedFiles[i];
        var checked = state.panSelectedIndices.has(i);
        if (checked) totalSize += (f.size || 0);
        html += '<div class="pan-parse-row" onclick="togglePanFileIndex(' + i + ')">' +
          '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation(); togglePanFileIndex(' + i + ')">' +
          '<span class="pan-parse-row-name" title="' + escapeHtml(f.path || f.name) + '">' + escapeHtml(f.path || f.name) + '</span>' +
          '<span class="pan-parse-row-size">' + formatBytes(f.size || 0) + '</span>' +
        '</div>';
      }
      listEl.innerHTML = html;
      if (summaryEl) {
        summaryEl.innerText = '已选 ' + state.panSelectedIndices.size + ' / ' + state.panParsedFiles.length + ' 项 · ' + formatBytes(totalSize);
      }
    }

    window.togglePanFileIndex = function(idx) {
      if (state.panSelectedIndices.has(idx)) {
        state.panSelectedIndices.delete(idx);
      } else {
        state.panSelectedIndices.add(idx);
      }
      renderPanParsedFiles();
    };

    window.selectAllPanFiles = function(selectAllFlag) {
      state.panSelectedIndices.clear();
      if (selectAllFlag) {
        for (var i = 0; i < state.panParsedFiles.length; i++) {
          state.panSelectedIndices.add(i);
        }
      }
      renderPanParsedFiles();
    };

    window.submitLanPanParse = async function() {
      if (!state.allowEdit) {
        showToast('当前为只读模式，无法解析网盘', 3000);
        return;
      }
      var urlInput = document.getElementById('pan-url-input');
      var pwdInput = document.getElementById('pan-pwd-input');
      var raw = urlInput ? urlInput.value.trim() : '';
      if (!raw) {
        showToast('请输入网盘分享链接或口令', 3000);
        return;
      }
      var extracted = parsePanUrlAndPwd(raw);
      if (extracted.password && pwdInput && !pwdInput.value.trim()) {
        pwdInput.value = extracted.password;
      }
      if (urlInput && extracted.url) {
        urlInput.value = extracted.url;
      }

      var btn = document.getElementById('pan-parse-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerText = '正在解析';
      }
      try {
        var json = await apiFetch('/api/pan/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: extracted.url,
            password: pwdInput ? pwdInput.value.trim() : ''
          })
        });
        if (json && json.success && json.data && Array.isArray(json.data.files) && json.data.files.length > 0) {
          state.panParsedType = json.data.panType || '';
          state.panParsedTitle = json.data.shareTitle || '';
          state.panParsedFiles = json.data.files;
          state.panSelectedIndices = new Set();
          for (var i = 0; i < state.panParsedFiles.length; i++) {
            state.panSelectedIndices.add(i);
          }
          renderPanParsedFiles();
          showToast('解析成功，共 ' + state.panParsedFiles.length + ' 个文件');
        } else {
          state.panParsedFiles = [];
          renderPanParsedFiles();
          showToast((json && json.error) || '未能解析出有效文件', 3000);
        }
      } catch (err) {
        showToast('解析失败: ' + (err.message || '网络异常'), 3000);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = '解析链接';
        }
      }
    };

    function getSelectedPanFiles() {
      var out = [];
      state.panSelectedIndices.forEach(function(idx) {
        if (state.panParsedFiles[idx]) out.push(state.panParsedFiles[idx]);
      });
      return out;
    }

    window.submitLanPanDownload = async function() {
      var selected = getSelectedPanFiles();
      if (selected.length === 0) {
        showToast('请先勾选需要下载的文件', 3000);
        return;
      }
      var btn = document.getElementById('pan-download-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerText = '投递中';
      }
      try {
        var json = await apiFetch('/api/pan/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            panType: state.panParsedType,
            files: selected
          })
        });
        if (json && json.success) {
          showToast('已添加到桌面端下载队列');
          switchMainView('downloads');
        } else {
          showToast((json && json.error) || '投递下载失败', 3000);
        }
      } catch (err) {
        showToast('投递下载异常', 3000);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = '下载到电脑';
        }
      }
    };

    window.openLanPanSavePicker = async function() {
      var selected = getSelectedPanFiles();
      if (selected.length === 0) {
        showToast('请先勾选需要转存的文件', 3000);
        return;
      }
      state.panSaveBreadcrumbs = [{ id: '0', name: '全部文件' }];
      actionModalTitle.innerText = '选择转存目标网盘目录';
      actionModalBody.innerHTML = '<div id="pan-folder-crumbs" style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;"></div>' +
        '<div id="pan-folder-list" class="pan-folder-picker-list"><div style="padding:20px; text-align:center; color:var(--text-secondary);">正在加载网盘目录</div></div>';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button id="confirm-pan-save-btn" class="v-btn v-btn-primary" onclick="confirmLanPanSave()">转存到此目录</button>';
      actionModal.style.display = 'flex';
      await loadLanPanFolderList('0');
    };

    window.loadLanPanFolderList = async function(pdirFid) {
      var listEl = document.getElementById('pan-folder-list');
      var crumbsEl = document.getElementById('pan-folder-crumbs');
      if (crumbsEl) {
        var cHtml = '';
        for (var i = 0; i < state.panSaveBreadcrumbs.length; i++) {
          var b = state.panSaveBreadcrumbs[i];
          if (i > 0) cHtml += ' / ';
          cHtml += '<a href="javascript:void(0)" style="color:var(--color-accent); text-decoration:none;" onclick="jumpLanPanCrumb(' + i + ')">' + escapeHtml(b.name) + '</a>';
        }
        crumbsEl.innerHTML = cHtml;
      }
      if (listEl) {
        listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary);">正在加载网盘目录</div>';
      }
      try {
        var json = await apiFetch('/api/pan/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ panType: state.panParsedType, pdirFid: pdirFid || '0' })
        });
        if (!json || !json.success) {
          if (listEl) listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--color-error);">' + escapeHtml((json && json.error) || '加载失败') + '</div>';
          return;
        }
        var folders = json.folders || [];
        if (folders.length === 0) {
          if (listEl) listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary);">当前目录下无子文件夹</div>';
          return;
        }
        var html = '';
        for (var j = 0; j < folders.length; j++) {
          var f = folders[j];
          html += '<div class="pan-folder-row" onclick="enterLanPanFolder(\\'' + encodeURIComponent(f.id) + '\\', \\'' + encodeURIComponent(f.name) + '\\')">' +
            '<span>📁 ' + escapeHtml(f.name) + '</span>' +
            '<span style="color:var(--text-secondary); font-size:12px;">进入 ›</span>' +
          '</div>';
        }
        if (listEl) listEl.innerHTML = html;
      } catch (err) {
        if (listEl) listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--color-error);">加载目录异常</div>';
      }
    };

    window.enterLanPanFolder = function(encodedId, encodedName) {
      var id = decodeURIComponent(encodedId);
      var name = decodeURIComponent(encodedName);
      state.panSaveBreadcrumbs.push({ id: id, name: name });
      loadLanPanFolderList(id);
    };

    window.jumpLanPanCrumb = function(index) {
      state.panSaveBreadcrumbs = state.panSaveBreadcrumbs.slice(0, index + 1);
      var cur = state.panSaveBreadcrumbs[state.panSaveBreadcrumbs.length - 1];
      loadLanPanFolderList(cur ? cur.id : '0');
    };

    window.confirmLanPanSave = async function() {
      var selected = getSelectedPanFiles();
      if (selected.length === 0) return;
      var cur = state.panSaveBreadcrumbs[state.panSaveBreadcrumbs.length - 1];
      var targetDirFid = cur ? cur.id : '0';
      var items = selected.map(function(file) {
        var r = file.rawInfo || {};
        var fid = String(r.fid || r.FileId || r.fs_id || file.id || '');
        var fidToken = r.fidToken || r.share_fid_token || r.S3keyFlag;
        var pwdId = r.pwdId || r.pwd_id || r.shareKey;
        var stoken = r.stoken || r.sekey;
        var extra = r.extra && typeof r.extra === 'object' ? Object.assign({}, r.extra) : Object.assign({}, r);
        extra.relativePath = file.path || file.name;
        return { fid: fid, fidToken: fidToken, pwdId: pwdId, stoken: stoken, extra: extra };
      }).filter(function(it) { return !!it.fid; });

      var btn = document.getElementById('confirm-pan-save-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerText = '转存中';
      }
      try {
        var json = await apiFetch('/api/pan/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            panType: state.panParsedType,
            items: items,
            targetDirFid: targetDirFid
          })
        });
        if (json && json.success) {
          closeActionModal();
          showToast('已成功转存到网盘');
        } else {
          showToast((json && json.error) || '转存失败', 3000);
        }
      } catch (err) {
        showToast('转存请求异常', 3000);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = '转存到此目录';
        }
      }
    };

    // 钩住既有 init 完成后自动建立下载 SSE 与更新写权限可见性
    var _origLoadResources = typeof loadResources === 'function' ? loadResources : null;
    if (_origLoadResources) {
      loadResources = async function() {
        await _origLoadResources.apply(this, arguments);
        updateRemoteWriteVisibility();
        connectDownloadsSSE();
      };
    }
`;
