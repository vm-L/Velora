export const lanWebTrimmerScripts = `    // ==========================================
    // Video Editing, Merge & Compression Methods
    // ==========================================

    function formatTimeSec(sec) {
      if (typeof sec !== 'number' || isNaN(sec) || sec < 0) sec = 0;
      var totalTenths = Math.round(sec * 10);
      var ms = totalTenths % 10;
      var totalSec = Math.floor(totalTenths / 10);
      var m = Math.floor(totalSec / 60);
      var s = totalSec % 60;
      var pad = function(n) { return n.toString().padStart(2, '0'); };
      return pad(m) + ':' + pad(s) + '.' + ms;
    }

    function updateTrimmerSummary() {
      var summaryEl = document.getElementById('trimmer-summary-display');
      if (!summaryEl) return;
      var video = document.getElementById('trimmer-video');
      var originalDur = state.trimDuration || (video ? video.duration : 0) || 0;
      var totalDur = 0;
      if (state.trimSegments && state.trimSegments.length > 0) {
        for (var i = 0; i < state.trimSegments.length; i++) {
          var s = state.trimSegments[i];
          if (s.valid && s.start !== null && s.end !== null && s.end > s.start) {
            totalDur += Math.max(0, s.end - s.start);
          }
        }
      }
      var reduced = Math.max(0, originalDur - totalDur);
      summaryEl.innerText = '总时长: ' + formatTimeSec(totalDur) + ' (-' + formatTimeSec(reduced) + ')';
    }

    // ==========================================
    // Video Editing Draft Storage Helpers
    // ==========================================
    var TRIM_DRAFTS_STORAGE_KEY = 'velora_trim_drafts';

    function getStoredTrimDrafts() {
      try {
        var raw = localStorage.getItem(TRIM_DRAFTS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    }

    function saveCurrentTrimDraft() {
      if (!state.currentTrimPath || !state.trimSegments || state.trimSegments.length === 0) return;
      try {
        var drafts = getStoredTrimDrafts();
        drafts[state.currentTrimPath] = {
          segments: state.trimSegments.map(function(s) {
            return {
              id: s.id,
              start: s.start,
              end: s.end,
              valid: !!s.valid
            };
          }),
          selectedSegmentIndex: state.selectedSegmentIndex || 0,
          updatedAt: Date.now()
        };
        // 限制最多保留 50 个最新剪辑草稿，超额淘汰最久未更新条目
        var keys = Object.keys(drafts);
        if (keys.length > 50) {
          keys.sort(function(a, b) {
            var timeA = (drafts[a] && drafts[a].updatedAt) || 0;
            var timeB = (drafts[b] && drafts[b].updatedAt) || 0;
            return timeA - timeB;
          });
          while (keys.length > 50) {
            var oldestKey = keys.shift();
            delete drafts[oldestKey];
          }
        }
        localStorage.setItem(TRIM_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
      } catch (e) {
        // ignore localStorage quota/parse error
      }
    }

    function loadTrimDraft(filePath) {
      if (!filePath) return null;
      try {
        var drafts = getStoredTrimDrafts();
        var draft = drafts[filePath];
        if (draft && Array.isArray(draft.segments) && draft.segments.length > 0) {
          return draft;
        }
      } catch (e) {}
      return null;
    }

    function removeTrimDraft(filePath) {
      if (!filePath) return;
      try {
        var drafts = getStoredTrimDrafts();
        if (drafts[filePath]) {
          delete drafts[filePath];
          localStorage.setItem(TRIM_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
        }
      } catch (e) {}
    }

    // Video Trimmer Modal
    window.openVideoEditModal = function(encodedPath, name) {
      var filePath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === filePath; });
      var finalName = name || (item ? item.name : (filePath.split(/[\\\\/]/).pop() || ''));
      state.currentTrimPath = filePath;
      state.currentTrimName = finalName;
      state.trimSegments = [];
      state.selectedSegmentIndex = 0;
      state.trimStart = 0;
      state.trimEnd = 0;

      document.getElementById('video-edit-title').innerText = '视频剪辑: ' + finalName;
      var video = document.getElementById('trimmer-video');
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(filePath) +
        (state.token ? '&token=' + encodeURIComponent(state.token) : '') +
        '&_v=' + Date.now();
      video.src = streamUrl;

      // 重置 Seek 调度器
      pendingSeekTime = null;

      var baseWithoutExt = finalName.replace(/\.[^/.]+$/, '');
      document.getElementById('trim-filename-input').value = baseWithoutExt + '_cut.mp4';
      document.getElementById('trim-save-mode').value = 'replace';
      toggleTrimSaveMode();

      video.muted = true;
      video.playbackRate = 1;
      state.trimSpeed = 1;
      state.trimStepMode = 'sec';
      updateTrimmerActionButtons();

      video.onloadedmetadata = function() {
        var dur = video.duration || 0;
        state.trimDuration = dur;
        state.trimStart = 0;
        state.trimEnd = dur;

        // 检查是否存在已保存的草稿
        var savedDraft = loadTrimDraft(filePath);
        if (savedDraft && Array.isArray(savedDraft.segments) && savedDraft.segments.length > 0) {
          state.trimSegments = savedDraft.segments.map(function(s) {
            return {
              id: s.id || Date.now(),
              start: s.start !== null && s.start !== undefined ? s.start : null,
              end: s.end !== null && s.end !== undefined ? s.end : null,
              valid: !!s.valid
            };
          });
          var targetIndex = typeof savedDraft.selectedSegmentIndex === 'number' ? savedDraft.selectedSegmentIndex : 0;
          state.selectedSegmentIndex = Math.max(0, Math.min(state.trimSegments.length - 1, targetIndex));
          showToast('已自动恢复未导出的剪辑草稿');
        } else {
          state.trimSegments = [{
            id: 1,
            start: 0,
            end: Math.round(dur * 100) / 100,
            valid: true
          }];
          state.selectedSegmentIndex = 0;
        }

        renderTrimSegments();
        updateTrimmerTimeLabels();
      };

      video.ontimeupdate = function() {
        if (!video.seeking && pendingSeekTime === null) {
          updateTrimmerTimeLabels();
        }
      };

      video.onseeked = function() {
        if (pendingSeekTime !== null) {
          var next = pendingSeekTime;
          pendingSeekTime = null;
          safeSeekTrimmerVideo(next);
        } else {
          updateTrimmerTimeLabels();
        }
      };

      video.onerror = function(err) {
        console.warn('Trimmer video error:', err);
      };

      renderTrimSegments();
      document.getElementById('video-edit-modal').style.display = 'flex';
    };

    var pendingSeekTime = null;

    function safeSeekTrimmerVideo(targetTime) {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      var dur = state.trimDuration || (video.duration || 0) || 0;
      if (dur > 0) {
        targetTime = Math.max(0, Math.min(dur, targetTime));
      } else {
        targetTime = Math.max(0, targetTime);
      }

      // 实时更新 UI 时间和进度条，提供即时视觉反馈
      updateTrimmerTimeLabels(targetTime);

      // 若底层正在寻道中，记录最新的目标位置，在 seeked 之后立即执行
      if (video.seeking) {
        pendingSeekTime = targetTime;
        return;
      }

      pendingSeekTime = null;
      try {
        video.currentTime = targetTime;
      } catch (err) {
        // ignore
      }
    }

    function updateTrimmerTimeLabels(overrideCurr) {
      var video = document.getElementById('trimmer-video');
      var curr = (typeof overrideCurr === 'number' && !isNaN(overrideCurr))
        ? overrideCurr
        : (pendingSeekTime !== null ? pendingSeekTime : (video ? video.currentTime : 0));
      var dur = state.trimDuration || (video ? video.duration : 0) || 0;
      var textEl = document.getElementById('trimmer-time-text');
      var progEl = document.getElementById('trimmer-time-progress');
      if (textEl) {
        textEl.innerText = formatTimeSec(curr) + ' / ' + formatTimeSec(dur);
      } else {
        var display = document.getElementById('trimmer-time-display');
        if (display) display.innerText = formatTimeSec(curr) + ' / ' + formatTimeSec(dur);
      }
      if (progEl) {
        var pct = dur > 0 ? Math.max(0, Math.min(100, (curr / dur) * 100)) : 0;
        progEl.style.width = pct + '%';
      }

      updateTrimmerSummary();
    }

    (function initTrimmerProgressEvents() {
      var display = document.getElementById('trimmer-time-display');
      if (!display) return;

      var isPointerDown = false;
      var isDragging = false;
      var startX = 0;
      var startTime = 0;

      display.addEventListener('pointerdown', function(e) {
        if (e.button !== undefined && e.button !== 0) return;
        var video = document.getElementById('trimmer-video');
        if (!video) return;
        var dur = state.trimDuration || (video.duration || 0) || 0;
        if (dur <= 0) return;

        isPointerDown = true;
        isDragging = false;
        startX = e.clientX;
        startTime = typeof video.currentTime === 'number' && !isNaN(video.currentTime) ? video.currentTime : 0;

        try {
          display.setPointerCapture(e.pointerId);
        } catch (err) {}
        if (e.cancelable) e.preventDefault();
      });

      display.addEventListener('pointermove', function(e) {
        if (!isPointerDown) return;
        var video = document.getElementById('trimmer-video');
        if (!video) return;
        var dur = state.trimDuration || (video.duration || 0) || 0;
        if (dur <= 0) return;

        var deltaX = e.clientX - startX;
        if (!isDragging && Math.abs(deltaX) >= 6) {
          isDragging = true;
        }

        if (isDragging) {
          var effectiveDelta = deltaX > 0 ? (deltaX - 6) : (deltaX + 6);
          var steps = Math.round(effectiveDelta / 8);
          var targetTime = startTime + steps * (dur * 0.01);
          safeSeekTrimmerVideo(targetTime);
        }
      });

      var handlePointerUp = function(e) {
        if (!isPointerDown) return;
        isPointerDown = false;
        var video = document.getElementById('trimmer-video');
        if (video) {
          var dur = state.trimDuration || (video.duration || 0) || 0;
          if (dur > 0 && !isDragging) {
            var rect = display.getBoundingClientRect();
            var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            safeSeekTrimmerVideo(ratio * dur);
          }
        }
        isDragging = false;
        try {
          if (e.pointerId !== undefined && display.hasPointerCapture && display.hasPointerCapture(e.pointerId)) {
            display.releasePointerCapture(e.pointerId);
          }
        } catch (err) {}
      };

      display.addEventListener('pointerup', handlePointerUp);
      display.addEventListener('pointercancel', handlePointerUp);
    })();

    var seekHoldTimer = null;
    var seekIntervalTimer = null;

    window.stopSeek = function() {
      if (seekHoldTimer) {
        clearTimeout(seekHoldTimer);
        seekHoldTimer = null;
      }
      if (seekIntervalTimer) {
        clearInterval(seekIntervalTimer);
        seekIntervalTimer = null;
      }
    };

    window.startSeek = function(delta, e) {
      if (e) {
        if (e.type === 'touchstart') {
          if (e.cancelable) e.preventDefault();
        } else if (e.button !== undefined && e.button !== 0) {
          return;
        }
      }
      window.stopSeek();
      window.seekTrimmer(delta);
      seekHoldTimer = setTimeout(function() {
        seekIntervalTimer = setInterval(function() {
          window.seekTrimmer(delta);
        }, 100);
      }, 200);
    };

    window.addEventListener('mouseup', window.stopSeek);
    window.addEventListener('touchend', window.stopSeek);
    window.addEventListener('touchcancel', window.stopSeek);

    window.closeVideoEditModal = function() {
      window.stopSeek();
      pendingSeekTime = null;
      var video = document.getElementById('trimmer-video');
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (e) {}
      }
      document.getElementById('video-edit-modal').style.display = 'none';
    };

    window.toggleTrimmerPlay = function() {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      if (pendingSeekTime !== null) {
        safeSeekTrimmerVideo(pendingSeekTime);
      }
      if (video.paused || video.ended) {
        if (video.ended || (video.duration && video.currentTime >= video.duration - 0.05)) {
          safeSeekTrimmerVideo(0);
        }
        var p = video.play();
        if (p && p.catch) {
          p.catch(function() {});
        }
      } else {
        video.pause();
      }
    };

    window.toggleTrimmerMute = function() {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      video.muted = !video.muted;
      updateTrimmerMuteButton();
    };

    function updateTrimmerMuteButton() {
      var btn = document.getElementById('trim-mute-btn');
      var video = document.getElementById('trimmer-video');
      if (!btn || !video) return;
      btn.innerText = video.muted ? '解除静音' : '开启静音';
      btn.classList.remove('active');
    }

    window.toggleTrimmerSpeed = function() {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      state.trimSpeed = (state.trimSpeed === 1 ? 2 : 1);
      video.playbackRate = state.trimSpeed;
      updateTrimmerSpeedButton();
    };

    function updateTrimmerSpeedButton() {
      var btn = document.getElementById('trim-speed-btn');
      if (!btn) return;
      var spd = state.trimSpeed || 1;
      btn.innerText = '倍速: ' + spd + 'x';
      btn.classList.remove('active');
    }

    function updateTrimmerStepButtons() {
      var container = document.getElementById('trim-steppers');
      var modeBtn = document.getElementById('trim-step-mode-btn');
      var isMin = state.trimStepMode === 'min';

      if (modeBtn) {
        modeBtn.innerText = isMin ? '跨度: 分 (m)' : '跨度: 秒 (s)';
        if (isMin) {
          modeBtn.classList.add('active');
        } else {
          modeBtn.classList.remove('active');
        }
      }

      if (!container) return;

      var configs = isMin
        ? [
            { label: '-10m', delta: -600 },
            { label: '-5m',  delta: -300 },
            { label: '-1m',  delta: -60 },
            { label: '+1m',  delta: 60 },
            { label: '+5m',  delta: 300 },
            { label: '+10m', delta: 600 }
          ]
        : [
            { label: '-10s',  delta: -10 },
            { label: '-1s',   delta: -1 },
            { label: '-0.1s', delta: -0.1 },
            { label: '+0.1s', delta: 0.1 },
            { label: '+1s',   delta: 1 },
            { label: '+10s',  delta: 10 }
          ];

      var html = '';
      for (var i = 0; i < configs.length; i++) {
        var cfg = configs[i];
        html += '<button class="v-btn v-btn-secondary"' +
          ' onmousedown="startSeek(' + cfg.delta + ', event)" onmouseup="stopSeek()" onmouseleave="stopSeek()"' +
          ' ontouchstart="startSeek(' + cfg.delta + ', event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">' +
          cfg.label +
          '</button>';
      }
      container.innerHTML = html;
    }

    window.toggleTrimmerStepMode = function() {
      state.trimStepMode = (state.trimStepMode === 'min') ? 'sec' : 'min';
      updateTrimmerStepButtons();
    };

    function updateTrimmerActionButtons() {
      updateTrimmerMuteButton();
      updateTrimmerSpeedButton();
      updateTrimmerStepButtons();
    }

    window.seekTrimmer = function(delta) {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      var dur = state.trimDuration || (video.duration || 0) || 0;
      var current = (pendingSeekTime !== null)
        ? pendingSeekTime
        : (typeof video.currentTime === 'number' && !isNaN(video.currentTime) ? video.currentTime : 0);
      var target = Math.max(0, Math.min(dur, current + delta));
      safeSeekTrimmerVideo(target);
    };

    window.markTrimStart = function() {
      var video = document.getElementById('trimmer-video');
      if (!video || !state.trimSegments || !state.trimSegments.length) return;
      var idx = state.selectedSegmentIndex >= 0 && state.selectedSegmentIndex < state.trimSegments.length ? state.selectedSegmentIndex : 0;
      var seg = state.trimSegments[idx];
      var currentTimeVal = (pendingSeekTime !== null)
        ? pendingSeekTime
        : (typeof video.currentTime === 'number' && !isNaN(video.currentTime) ? video.currentTime : 0);
      var newStart = Math.round(currentTimeVal * 100) / 100;

      if (seg.end !== null && newStart >= seg.end) {
        showToast('起点时间必须小于当前片段终点');
        return;
      }

      if (seg.end !== null) {
        for (var i = 0; i < state.trimSegments.length; i++) {
          if (i === idx) continue;
          var other = state.trimSegments[i];
          if (other.valid && other.start !== null && other.end !== null) {
            if (newStart < other.end && seg.end > other.start) {
              showToast('当前片段与已有片段存在重叠');
              return;
            }
          }
        }
      }

      seg.start = newStart;
      if (seg.start !== null && seg.end !== null && seg.start < seg.end) {
        seg.valid = true;
      }
      state.trimStart = seg.start;
      renderTrimSegments();
      updateTrimmerTimeLabels();
      saveCurrentTrimDraft();
      showToast('已设为片段 ' + (idx + 1) + ' 起点: ' + formatTimeSec(newStart));
    };

    window.markTrimEnd = function() {
      var video = document.getElementById('trimmer-video');
      if (!video || !state.trimSegments || !state.trimSegments.length) return;
      var idx = state.selectedSegmentIndex >= 0 && state.selectedSegmentIndex < state.trimSegments.length ? state.selectedSegmentIndex : 0;
      var seg = state.trimSegments[idx];
      var currentTimeVal = (pendingSeekTime !== null)
        ? pendingSeekTime
        : (typeof video.currentTime === 'number' && !isNaN(video.currentTime) ? video.currentTime : 0);
      var newEnd = Math.round(currentTimeVal * 100) / 100;

      if (seg.start !== null && newEnd <= seg.start) {
        showToast('终点时间必须大于当前片段起点');
        return;
      }

      if (seg.start !== null) {
        for (var i = 0; i < state.trimSegments.length; i++) {
          if (i === idx) continue;
          var other = state.trimSegments[i];
          if (other.valid && other.start !== null && other.end !== null) {
            if (seg.start < other.end && newEnd > other.start) {
              showToast('当前片段与已有片段存在重叠');
              return;
            }
          }
        }
      }

      seg.end = newEnd;
      if (seg.start !== null && seg.end !== null && seg.start < seg.end) {
        seg.valid = true;
      }
      state.trimEnd = seg.end;
      renderTrimSegments();
      updateTrimmerTimeLabels();
      saveCurrentTrimDraft();
      showToast('已设为片段 ' + (idx + 1) + ' 终点: ' + formatTimeSec(newEnd));
    };

    window.addNewSegment = function() {
      var newSeg = {
        id: Date.now(),
        start: null,
        end: null,
        valid: false
      };
      state.trimSegments.push(newSeg);
      state.selectedSegmentIndex = state.trimSegments.length - 1;
      renderTrimSegments();
      updateTrimmerTimeLabels();
      saveCurrentTrimDraft();
      showToast('已新增片段 ' + state.trimSegments.length + '，请设置起点和终点');
    };

    window.removeTrimSegment = function(idx) {
      if (!state.trimSegments || state.trimSegments.length <= 1) return;
      state.trimSegments.splice(idx, 1);
      if (state.selectedSegmentIndex >= state.trimSegments.length) {
        state.selectedSegmentIndex = state.trimSegments.length - 1;
      } else if (state.selectedSegmentIndex > idx) {
        state.selectedSegmentIndex--;
      }
      renderTrimSegments();
      updateTrimmerTimeLabels();
      saveCurrentTrimDraft();
    };

    window.moveSelectedSegment = function(dir) {
      if (!state.trimSegments || state.trimSegments.length <= 1) return;
      var currentIdx = state.selectedSegmentIndex;
      if (typeof currentIdx !== 'number' || currentIdx < 0 || currentIdx >= state.trimSegments.length) return;
      var targetIdx = currentIdx + dir;
      if (targetIdx < 0 || targetIdx >= state.trimSegments.length) return;

      var item = state.trimSegments.splice(currentIdx, 1)[0];
      state.trimSegments.splice(targetIdx, 0, item);
      state.selectedSegmentIndex = targetIdx;
      renderTrimSegments();
      updateTrimmerTimeLabels();
      saveCurrentTrimDraft();
    };

    window.selectSegment = function(idx) {
      if (!state.trimSegments || idx < 0 || idx >= state.trimSegments.length) return;
      state.selectedSegmentIndex = idx;
      var seg = state.trimSegments[idx];
      if (seg) {
        seekToSegment(seg.start, seg.end);
      }
      renderTrimSegments();
      updateTrimmerTimeLabels();
    };

    function renderTrimSegments() {
      var listEl = document.getElementById('trimmer-segments-list');
      var prevBtn = document.getElementById('trim-move-prev-btn');
      var nextBtn = document.getElementById('trim-move-next-btn');
      if (!listEl) return;

      if (!state.trimSegments || state.trimSegments.length === 0) {
        listEl.innerHTML = '<span style="font-size:12px; color:var(--text-muted);">暂无片段</span>';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        updateTrimmerSummary();
        return;
      }

      var html = '';
      var isSingle = state.trimSegments.length <= 1;

      if (prevBtn) {
        prevBtn.disabled = isSingle || state.selectedSegmentIndex <= 0;
      }
      if (nextBtn) {
        nextBtn.disabled = isSingle || state.selectedSegmentIndex >= state.trimSegments.length - 1;
      }

      for (var i = 0; i < state.trimSegments.length; i++) {
        var seg = state.trimSegments[i];
        var isSelected = i === state.selectedSegmentIndex;
        var timeText = '';
        if (seg.valid && seg.start !== null && seg.end !== null) {
          timeText = formatTimeSec(seg.start) + ' ~ ' + formatTimeSec(seg.end);
        } else if (seg.start !== null) {
          timeText = formatTimeSec(seg.start) + ' ~ 未设置';
        } else if (seg.end !== null) {
          timeText = '未设置 ~ ' + formatTimeSec(seg.end);
        } else {
          timeText = '未设置';
        }

        html += '<div class="segment-chip' + (isSelected ? ' active' : '') + (!seg.valid ? ' invalid' : '') + '" onclick="selectSegment(' + i + ')">' +
          '<span>片段 ' + (i + 1) + ': ' + timeText + '</span>' +
          (!isSingle ? '<span class="chip-remove" onclick="event.stopPropagation(); removeTrimSegment(' + i + ')">✕</span>' : '') +
          '</div>';
      }
      listEl.innerHTML = html;
      updateTrimmerSummary();
    }

    window.seekToSegment = function(startSec, endSec) {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      var dur = state.trimDuration || (video.duration || 0) || 0;
      var current = (pendingSeekTime !== null)
        ? pendingSeekTime
        : (typeof video.currentTime === 'number' && !isNaN(video.currentTime) ? video.currentTime : 0);
      var hasStart = typeof startSec === 'number' && !isNaN(startSec);
      var hasEnd = typeof endSec === 'number' && !isNaN(endSec);

      var isAtStart = hasStart && Math.abs(current - startSec) < 0.05;

      var targetTime = null;
      if (isAtStart) {
        if (hasEnd) {
          targetTime = endSec;
        }
      } else {
        if (hasStart) {
          targetTime = startSec;
        }
      }

      if (targetTime === null) {
        return;
      }

      targetTime = Math.max(0, Math.min(dur, targetTime));
      safeSeekTrimmerVideo(targetTime);
    };

    window.setTrimSaveMode = function(mode) {
      var input = document.getElementById('trim-save-mode');
      if (input) input.value = mode;
      toggleTrimSaveMode();
    };

    window.toggleTrimSaveMode = function() {
      var mode = (document.getElementById('trim-save-mode') || {}).value || 'replace';
      var wrap = document.getElementById('trim-filename-wrap');
      if (wrap) {
        wrap.style.display = mode === 'saveAs' ? 'flex' : 'none';
      }
      var segmented = document.getElementById('trim-save-segmented');
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

    window.submitVideoCut = async function() {
      var mode = document.getElementById('trim-save-mode').value;
      var cutMode = 'keep';
      var filename = document.getElementById('trim-filename-input').value.trim();

      var validSegments = [];
      var invalidCount = 0;
      for (var i = 0; i < state.trimSegments.length; i++) {
        var s = state.trimSegments[i];
        if (s.valid && s.start !== null && s.end !== null && s.end > s.start) {
          if (s.end - s.start < 0.2) {
            showToast('第 ' + (i + 1) + ' 个片段时长过短（至少 0.2 秒），请微调后再试');
            return;
          }
          validSegments.push({
            start: Math.round(s.start * 100) / 100,
            end: Math.round(s.end * 100) / 100
          });
        } else {
          invalidCount++;
        }
      }

      if (validSegments.length === 0) {
        showToast('请至少设置一个有效的剪辑片段');
        return;
      }

      if (invalidCount > 0) {
        var ok = await window.showConfirm({
          title: '提示',
          message: '检测到列表中包含 ' + invalidCount + ' 个未设置起止时间的无效片段，处理时将自动跳过这些片段。是否继续？',
          confirmText: '确认',
          cancelText: '取消'
        });
        if (!ok) return;
      }

      if (mode === 'replace') {
        var ok = await window.showConfirm({
          title: '覆盖保存确认',
          message: '确定要覆盖保存原视频文件吗？',
          confirmText: '确认',
          danger: true
        });
        if (!ok) return;

        // 覆盖保存发起前先释放当前视频流占用，避免后台写入期间文件被网络流占用
        closeVideoEditModal();
      }

      var sourceName = state.currentTrimName || (state.currentTrimPath ? state.currentTrimPath.split(/[\\/]/).pop() : '视频');
      var taskId = 'cut_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

      try {
        var res = await apiFetch('/api/video-cut', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: taskId,
            sourcePath: state.currentTrimPath,
            segments: validSegments,
            cutMode: cutMode,
            mode: mode,
            customFilename: filename
          })
        });

        if (res.success) {
          closeVideoEditModal();
          showToast(state.globalActiveTask ? '已加入全局任务队列（排队中）' : '剪辑任务已启动');
        } else {
          showToast(res.error || '剪辑发起失败');
        }
      } catch (err) {
        showToast('请求异常');
      }
    };
`;
