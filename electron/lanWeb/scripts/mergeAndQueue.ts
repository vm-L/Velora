export const lanWebMergeAndQueueScripts = `    // Video Merge Modal
    window.openBatchMergeModal = function() {
      var selectedItems = state.items.filter(function(i) { return state.selectedPaths.has(i.path); });
      var videoItems = selectedItems.filter(function(i) { return getFileCategory(i) === 'video'; });

      if (videoItems.length < 2) {
        showToast('请至少选择 2 个视频文件进行合并');
        return;
      }

      state.mergeVideos = videoItems.map(function(v) { return { path: v.path, name: v.name, size: v.size }; });
      var firstName = state.mergeVideos[0].name.replace(/\\.[^/.]+$/, '');
      document.getElementById('merge-filename-input').value = firstName + '_merged.mp4';
      renderMergeList();
      document.getElementById('video-merge-modal').style.display = 'flex';
      if (typeof pushOverlayHistory === 'function') {
        pushOverlayHistory('video-merge-modal', function() { window.closeVideoMergeModal(true); });
      }
    };

    window.closeVideoMergeModal = function(fromPopState) {
      var hideMerge = function() {
        var modal = document.getElementById('video-merge-modal');
        if (modal) modal.style.display = 'none';
      };
      if (fromPopState === true) {
        hideMerge();
      } else if (typeof closeOverlayViaUi === 'function') {
        closeOverlayViaUi('video-merge-modal', hideMerge);
      } else {
        hideMerge();
      }
    };

    function renderMergeList() {
      var container = document.getElementById('merge-video-items');
      if (!container) return;

      var html = '';
      for (var i = 0; i < state.mergeVideos.length; i++) {
        var item = state.mergeVideos[i];
        html += '<div class="merge-item">' +
          '<div class="merge-item-title" title="' + escapeHtml(item.name) + '">' + (i + 1) + '. ' + escapeHtml(item.name) + ' (' + formatBytes(item.size) + ')</div>' +
          '<div class="merge-item-btns">' +
          '<button class="v-btn v-btn-secondary" style="padding:2px 8px; font-size:11px;" ' + (i === 0 ? 'disabled' : '') + ' onclick="moveMergeItem(' + i + ', -1)">↑</button>' +
          '<button class="v-btn v-btn-secondary" style="padding:2px 8px; font-size:11px;" ' + (i === state.mergeVideos.length - 1 ? 'disabled' : '') + ' onclick="moveMergeItem(' + i + ', 1)">↓</button>' +
          '<button class="v-btn v-btn-danger-soft" style="padding:2px 8px; font-size:11px;" ' + (state.mergeVideos.length <= 2 ? 'disabled' : '') + ' onclick="removeMergeItem(' + i + ')">✕</button>' +
          '</div>' +
          '</div>';
      }
      container.innerHTML = html;
    }

    window.moveMergeItem = function(idx, dir) {
      var target = idx + dir;
      if (target < 0 || target >= state.mergeVideos.length) return;
      var item = state.mergeVideos.splice(idx, 1)[0];
      state.mergeVideos.splice(target, 0, item);
      renderMergeList();
    };

    window.removeMergeItem = function(idx) {
      if (state.mergeVideos.length <= 2) return;
      state.mergeVideos.splice(idx, 1);
      renderMergeList();
    };

    window.submitVideoMerge = async function() {
      if (state.mergeVideos.length < 2) return;
      var filename = document.getElementById('merge-filename-input').value.trim();
      var taskId = 'merge_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

      try {
        var res = await apiFetch('/api/video-merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: taskId,
            videoPaths: state.mergeVideos.map(function(v) { return v.path; }),
            customFilename: filename
          })
        });

        if (res.success) {
          closeVideoMergeModal();
          clearSelection();
          showToast(state.globalActiveTask ? '已加入全局任务队列（排队中）' : '合并任务已启动');
        } else {
          showToast(res.error || '合并发起失败');
        }
      } catch (err) {
        showToast('请求异常');
      }
    };

    // Video Compress Modal
    window.openVideoCompressModal = function(encodedPath, name) {
      var filePath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === filePath; });
      var finalName = name || (item ? item.name : (filePath.split(/[\\\\/]/).pop() || ''));

      state.compressFilePath = filePath;
      state.compressFileName = finalName;

      document.getElementById('compress-modal-title').innerText = '压缩视频: ' + finalName;
      var baseWithoutExt = finalName.replace(/\\.[^/.]+$/, '');
      document.getElementById('compress-filename-input').value = baseWithoutExt + '_compressed.mp4';
      document.getElementById('compress-mode-select').value = 'saveAs';
      selectCompressPreset(2000);
      toggleCompressSaveMode();
      document.getElementById('video-compress-modal').style.display = 'flex';
      if (typeof pushOverlayHistory === 'function') {
        pushOverlayHistory('video-compress-modal', function() { window.closeVideoCompressModal(true); });
      }
    };

    window.openBatchCompressModal = function() {
      var selectedItems = state.items.filter(function(i) { return state.selectedPaths.has(i.path); });
      var videoItems = selectedItems.filter(function(i) { return getFileCategory(i) === 'video'; });

      if (videoItems.length === 0) {
        showToast('请选择视频文件进行压缩');
        return;
      }

      openVideoCompressModal(encodeURIComponent(videoItems[0].path), videoItems[0].name);
    };

    window.closeVideoCompressModal = function(fromPopState) {
      var hideCompress = function() {
        var modal = document.getElementById('video-compress-modal');
        if (modal) modal.style.display = 'none';
      };
      if (fromPopState === true) {
        hideCompress();
      } else if (typeof closeOverlayViaUi === 'function') {
        closeOverlayViaUi('video-compress-modal', hideCompress);
      } else {
        hideCompress();
      }
    };

    window.selectCompressPreset = function(kbps) {
      state.compressBitrate = kbps;
      var presets = [1000, 2000, 3500];
      for (var i = 0; i < presets.length; i++) {
        var p = presets[i];
        var btn = document.getElementById('preset-' + p);
        if (btn) {
          if (p === kbps) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      }
      var input = document.getElementById('compress-bitrate-input');
      if (input) input.value = kbps;
    };

    window.setCompressSaveMode = function(mode) {
      var input = document.getElementById('compress-mode-select');
      if (input) input.value = mode;
      toggleCompressSaveMode();
    };

    window.toggleCompressSaveMode = function() {
      var mode = (document.getElementById('compress-mode-select') || {}).value || 'saveAs';
      var wrap = document.getElementById('compress-filename-wrap');
      if (wrap) {
        wrap.style.display = mode === 'saveAs' ? 'flex' : 'none';
      }
      var segmented = document.getElementById('compress-save-segmented');
      if (segmented) {
        var options = segmented.querySelectorAll('.segmented-option');
        for (var i = 0; i < options.length; i++) {
          var opt = options[i];
          if (opt.getAttribute('data-value') === mode) {
            opt.classList.add('active');
          } else {
            opt.classList.remove('active');
          }
        }
      }
    };

    window.submitVideoCompress = async function() {
      var mode = document.getElementById('compress-mode-select').value;
      var bitrate = parseInt(document.getElementById('compress-bitrate-input').value, 10) || 2000;
      var filename = document.getElementById('compress-filename-input').value.trim();

      if (mode === 'replace') {
        var ok = await window.showConfirm({
          title: '覆盖保存确认',
          message: '确定要覆盖保存原视频文件吗？',
          confirmText: '确认',
          danger: true
        });
        if (!ok) return;
      }

      var taskId = 'compress_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

      try {
        var res = await apiFetch('/api/video-compress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: taskId,
            filePath: state.compressFilePath,
            targetBitrateKbps: bitrate,
            mode: mode,
            customFilename: filename
          })
        });

        if (res.success) {
          closeVideoCompressModal();
          clearSelection();
          showToast(state.globalActiveTask ? '已加入全局任务队列（排队中）' : '压缩任务已启动');
        } else {
          showToast(res.error || '压缩发起失败');
        }
      } catch (err) {
        showToast('请求异常');
      }
    };

    function setNetworkStatus(connected) {
      var indicator = document.getElementById('network-indicator');
      var text = document.getElementById('network-text');
      if (!indicator || !text) return;
      if (connected) {
        indicator.classList.remove('disconnected');
        indicator.title = '局域网连接正常';
        text.innerText = '已连接';
      } else {
        indicator.classList.add('disconnected');
        indicator.title = '局域网连接断开，正在自动重连';
        text.innerText = '重连中';
      }
    }

    // Global Task Queue SSE Connection & State Sync
    function connectTaskQueueSSE() {
      if (state.queueEventSource) {
        state.queueEventSource.close();
        state.queueEventSource = null;
      }

      var sseUrl = '/api/task-queue-stream' + (state.token ? '?token=' + encodeURIComponent(state.token) : '');
      var es = new EventSource(sseUrl);
      state.queueEventSource = es;

      es.onopen = function() {
        setNetworkStatus(true);
      };

      es.onmessage = function(event) {
        setNetworkStatus(true);
        try {
          var data = JSON.parse(event.data);

          // 任务完成/终止广播事件
          if (data.type === 'task-finished') {
            var finishedTask = data.task || {};
            var rawTitle = finishedTask.title || '视频';
            var cleanTitle = rawTitle.replace(/^(剪辑(\(覆盖\))?|合并|压缩):\s*/, '').trim() || '视频';

            if (data.success) {
              showToast(cleanTitle + ' 处理完成');
              if (finishedTask.extra && finishedTask.extra.sourcePath) {
                removeTrimDraft(finishedTask.extra.sourcePath);
              }
              // 静默刷新当前目录（保持滚动位置）
              loadDirectory(state.currentPath, { preserveScroll: true });
            } else if (finishedTask.status === 'cancelled') {
              showToast(cleanTitle + ' 任务已取消');
            } else {
              var errMsg = finishedTask.error || '未知错误';
              showToast(cleanTitle + ' 处理失败: ' + errMsg, 3000);
            }
            return;
          }

          // 全局任务队列状态快照更新
          state.globalActiveTask = data.activeTask || null;
          state.globalTaskQueue = Array.isArray(data.queue) ? data.queue : [];
          state.globalTotalCount = Number(data.totalCount) || 0;
          renderTaskQueueUI();
        } catch (e) {
          // ignore
        }
      };

      es.onerror = function() {
        setNetworkStatus(false);
        setTimeout(function() {
          if (state.queueEventSource === es) {
            connectTaskQueueSSE();
          }
        }, 5000);
      };
    }

    window.addEventListener('offline', function() {
      setNetworkStatus(false);
    });
    window.addEventListener('online', function() {
      connectTaskQueueSSE();
    });

    function updateActiveTaskProgressUI() {
      var task = state.globalActiveTask;
      if (!task) return;

      var pct = Math.min(100, Math.max(0, Math.round(task.progress || 0)));
      var text = task.statusText || '正在处理';

      var percentEl = document.getElementById('task-progress-percent');
      var fillEl = document.getElementById('task-progress-fill');
      var statusEl = document.getElementById('task-progress-status');
      if (percentEl) percentEl.innerText = pct + '%';
      if (fillEl) fillEl.style.width = pct + '%';
      if (statusEl) statusEl.innerText = text;

      var capPercentEl = document.getElementById('capsule-percent-text');
      var capBarEl = document.getElementById('capsule-ring-bar');
      if (capPercentEl) capPercentEl.innerText = pct;
      if (capBarEl) {
        var perimeter = 2 * Math.PI * 9;
        var offset = perimeter * (1 - pct / 100);
        capBarEl.style.strokeDashoffset = String(offset);
      }
    }

    function renderTaskQueueUI() {
      var modal = document.getElementById('task-progress-modal');
      var capsule = document.getElementById('task-floating-capsule');
      var totalCount = state.globalTotalCount;

      if (totalCount === 0) {
        state.isTaskProgressMinimized = false;
        if (modal) modal.style.display = 'none';
        if (capsule) capsule.style.display = 'none';
        return;
      }

      var current = state.globalActiveTask || (state.globalTaskQueue.length > 0 ? state.globalTaskQueue[0] : null);
      var waitingTasks = state.globalTaskQueue;

      if (state.isTaskProgressMinimized) {
        if (modal) modal.style.display = 'none';
        if (capsule) {
          capsule.style.display = 'flex';
          var titleEl = document.getElementById('capsule-title-text');
          if (titleEl && current) {
            titleEl.innerText = current.title;
          }
          var badgeEl = document.getElementById('capsule-queue-badge');
          if (badgeEl) {
            if (waitingTasks.length > 0) {
              badgeEl.style.display = 'inline-block';
              badgeEl.innerText = '+' + waitingTasks.length;
            } else {
              badgeEl.style.display = 'none';
            }
          }
          updateActiveTaskProgressUI();
        }
      } else {
        if (capsule) capsule.style.display = 'none';
        if (modal) {
          modal.style.display = 'flex';
          var titleEl = document.getElementById('task-progress-title');
          if (titleEl && current) {
            titleEl.innerText = current.title;
          }
          updateActiveTaskProgressUI();

          var queuePreview = document.getElementById('task-queue-preview');
          var queueCountEl = document.getElementById('task-queue-count');
          var queueItemsEl = document.getElementById('task-queue-items');
          if (queuePreview && queueCountEl && queueItemsEl) {
            if (waitingTasks.length > 0) {
              queuePreview.style.display = 'block';
              queueCountEl.innerText = waitingTasks.length;
              var itemsHtml = '';
              for (var i = 0; i < waitingTasks.length; i++) {
                var wTask = waitingTasks[i];
                itemsHtml += '<div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; background:var(--bg-hover); padding:5px 8px; border-radius:6px;">' +
                  '<div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; margin-right:8px; color:var(--text-secondary);">' +
                  (i + 1) + '. ' + escapeHtml(wTask.title) +
                  '</div>' +
                  '<button class="v-btn v-btn-danger-soft" style="padding:2px 6px; font-size:11px;" onclick="cancelTaskFromQueue(\\'' + wTask.id + '\\')">取消</button>' +
                  '</div>';
              }
              queueItemsEl.innerHTML = itemsHtml;
            } else {
              queuePreview.style.display = 'none';
            }
          }
        }
      }
    }

    window.minimizeTaskProgress = function() {
      state.isTaskProgressMinimized = true;
      renderTaskQueueUI();
    };

    window.expandTaskProgress = function(e) {
      if (e) e.stopPropagation();
      state.isTaskProgressMinimized = false;
      renderTaskQueueUI();
    };

    window.cancelCurrentTaskFromCapsule = function(e) {
      if (e) e.stopPropagation();
      cancelCurrentTask();
    };

    window.cancelCurrentTask = async function() {
      var targetId = state.globalActiveTask ? state.globalActiveTask.id : (state.globalTaskQueue[0] ? state.globalTaskQueue[0].id : null);
      if (!targetId) return;

      var cancelBtn = document.getElementById('task-cancel-btn');
      if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.innerText = '正在取消';
      }

      try {
        await apiFetch('/api/task-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: targetId })
        });
        showToast('已请求取消任务');
      } catch (err) {
        showToast('取消请求异常');
      } finally {
        if (cancelBtn) {
          cancelBtn.disabled = false;
          cancelBtn.innerText = '取消任务';
        }
      }
    };

    window.cancelTaskFromQueue = async function(taskId) {
      try {
        await apiFetch('/api/task-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: taskId })
        });
        showToast('已请求取消排队任务');
      } catch (err) {
        showToast('取消失败');
      }
    };

    // Run
    init();`;
