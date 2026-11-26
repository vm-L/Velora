export const lanWebTrimmerScripts = `    // ==========================================
    // Video Editing Workbench (Desktop D2 + Mobile S3)
    // ==========================================

    function isLanDesktopTrimmer() {
      return document.body && document.body.classList.contains('lan-desktop-mode');
    }

    function formatTimeSec(sec, forceHours) {
      if (typeof sec !== 'number' || isNaN(sec) || sec < 0) sec = 0;
      var totalTenths = Math.round(sec * 10);
      var tenth = totalTenths % 10;
      var totalSec = Math.floor(totalTenths / 10);
      var h = Math.floor(totalSec / 3600);
      var m = Math.floor((totalSec % 3600) / 60);
      var s = totalSec % 60;
      var pad = function(n) { return n.toString().padStart(2, '0'); };
      if (forceHours || h > 0 || (state.trimDuration && state.trimDuration >= 3600)) {
        return pad(h) + ':' + pad(m) + ':' + pad(s) + '.' + tenth;
      }
      return pad(m) + ':' + pad(s) + '.' + tenth;
    }

    function parseTimeSec(raw) {
      var str = String(raw || '').trim();
      if (!str) return null;
      if (/^\\d+(\\.\\d+)?$/.test(str)) {
        var v = parseFloat(str);
        return isNaN(v) || v < 0 ? null : v;
      }
      var parts = str.split(':');
      if (parts.length !== 2 && parts.length !== 3) return null;
      var nums = [];
      for (var i = 0; i < parts.length; i++) {
        var n = Number(parts[i]);
        if (isNaN(n) || n < 0) return null;
        nums.push(n);
      }
      if (parts.length === 2) return nums[0] * 60 + nums[1];
      return nums[0] * 3600 + nums[1] * 60 + nums[2];
    }

    function resolveDesktopStepByModifiers(e) {
      if (e && e.shiftKey) return { step: 60, label: '60s', modifier: 'Shift' };
      if (e && (e.ctrlKey || e.metaKey)) return { step: 10, label: '10s', modifier: 'Ctrl' };
      if (e && e.altKey) return { step: 0.1, label: '0.1s', modifier: 'Alt' };
      return { step: 1, label: '1s', modifier: '' };
    }

    var desktopActiveStepSpec = { step: 1, label: '1s', modifier: '' };
    var trimPreviewPlayingIndex = -1;

    function updateDesktopStepButtonsUI() {
      var prevBtn = document.getElementById('trim-step-prev');
      var nextBtn = document.getElementById('trim-step-next');
      var badge = document.getElementById('trim-modifier-badge');
      var hasMod = !!desktopActiveStepSpec.modifier;
      if (prevBtn) {
        prevBtn.innerText = '‹ -' + desktopActiveStepSpec.label;
        prevBtn.classList.toggle('active', hasMod);
      }
      if (nextBtn) {
        nextBtn.innerText = '+' + desktopActiveStepSpec.label + ' ›';
        nextBtn.classList.toggle('active', hasMod);
      }
      if (badge) {
        if (hasMod) {
          badge.style.display = 'inline-flex';
          badge.innerText = desktopActiveStepSpec.modifier + ' · ±' + desktopActiveStepSpec.label;
        } else {
          badge.style.display = 'none';
          badge.innerText = '';
        }
      }
    }

    function updateTrimmerPlayButtonUI() {
      var video = document.getElementById('trimmer-video');
      var playIcon = document.getElementById('trim-play-icon');
      var pauseIcon = document.getElementById('trim-pause-icon');
      if (!video || !playIcon || !pauseIcon) return;
      var playing = !video.paused && !video.ended;
      playIcon.style.display = playing ? 'none' : 'block';
      pauseIcon.style.display = playing ? 'block' : 'none';
    }

    function updateTrimmerSummary() {
      var summaryEl = document.getElementById('trimmer-summary-display');
      var sheetSummaryEl = document.getElementById('trim-sheet-summary');
      var countEl = document.getElementById('trimmer-segments-count');
      var hudEl = document.getElementById('trimmer-active-hud');
      var video = document.getElementById('trimmer-video');
      var originalDur = state.trimDuration || (video ? video.duration : 0) || 0;
      var totalDur = 0;
      var validCount = 0;
      if (state.trimSegments && state.trimSegments.length > 0) {
        for (var i = 0; i < state.trimSegments.length; i++) {
          var s = state.trimSegments[i];
          if (s.valid && s.start !== null && s.end !== null && s.end > s.start) {
            totalDur += Math.max(0, s.end - s.start);
            validCount++;
          }
        }
      }
      var reduced = Math.max(0, originalDur - totalDur);
      var summaryText = isLanDesktopTrimmer()
        ? ('裁去 ' + formatTimeSec(reduced))
        : ('已选 ' + validCount + ' 段 · 保留 ' + formatTimeSec(totalDur));
      if (summaryEl) summaryEl.innerText = summaryText;
      if (sheetSummaryEl) {
        sheetSummaryEl.innerText = '保留 ' + formatTimeSec(totalDur) + ' · 裁去 ' + formatTimeSec(reduced);
      }
      if (countEl) {
        countEl.innerText = (state.trimSegments ? state.trimSegments.length : 0) + ' 段 · ' + formatTimeSec(totalDur);
      }
      if (hudEl) {
        var activeSeg = state.trimSegments && state.trimSegments[state.selectedSegmentIndex];
        if (activeSeg && activeSeg.valid && activeSeg.start !== null && activeSeg.end !== null) {
          hudEl.style.display = 'block';
          hudEl.innerText = '片段 #' + (state.selectedSegmentIndex + 1) + '：' + formatTimeSec(activeSeg.start) + ' → ' + formatTimeSec(activeSeg.end);
        } else {
          hudEl.style.display = 'none';
        }
      }
    }

    function renderTrimmerSegmentsOverlay() {
      var overlay = document.getElementById('trimmer-segments-overlay');
      if (!overlay) return;
      var dur = state.trimDuration || 0;
      if (dur <= 0 || !state.trimSegments || state.trimSegments.length === 0) {
        overlay.innerHTML = '';
        return;
      }
      var html = '';
      for (var i = 0; i < state.trimSegments.length; i++) {
        var s = state.trimSegments[i];
        if (!s.valid || s.start === null || s.end === null || s.end <= s.start) continue;
        var leftPct = Math.max(0, Math.min(100, (s.start / dur) * 100));
        var widthPct = Math.max(0.4, Math.min(100 - leftPct, ((s.end - s.start) / dur) * 100));
        var isSelected = i === state.selectedSegmentIndex;
        html += '<div class="trimmer-seg-bar' + (isSelected ? ' active' : '') + '" style="left:' + leftPct + '%; width:' + widthPct + '%;"></div>';
      }
      overlay.innerHTML = html;
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
            return { id: s.id, start: s.start, end: s.end, valid: !!s.valid };
          }),
          selectedSegmentIndex: state.selectedSegmentIndex || 0,
          updatedAt: Date.now()
        };
        var keys = Object.keys(drafts);
        if (keys.length > 50) {
          keys.sort(function(a, b) {
            return ((drafts[a] && drafts[a].updatedAt) || 0) - ((drafts[b] && drafts[b].updatedAt) || 0);
          });
          while (keys.length > 50) delete drafts[keys.shift()];
        }
        localStorage.setItem(TRIM_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
      } catch (e) {}
    }

    function loadTrimDraft(filePath) {
      if (!filePath) return null;
      try {
        var drafts = getStoredTrimDrafts();
        var draft = drafts[filePath];
        if (draft && Array.isArray(draft.segments) && draft.segments.length > 0) return draft;
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

    function stopTrimSegmentPreview() {
      if (trimPreviewPlayingIndex !== -1) {
        trimPreviewPlayingIndex = -1;
        renderTrimSegments();
      }
    }

    // Open Video Trimmer Modal
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
      trimPreviewPlayingIndex = -1;
      desktopActiveStepSpec = { step: 1, label: '1s', modifier: '' };
      updateDesktopStepButtonsUI();

      var titleEl = document.getElementById('video-edit-title');
      if (titleEl) titleEl.innerText = finalName || '视频剪辑';
      var video = document.getElementById('trimmer-video');
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(filePath) +
        (state.token ? '&token=' + encodeURIComponent(state.token) : '') +
        '&_v=' + Date.now();
      video.src = streamUrl;
      pendingSeekTime = null;

      var baseWithoutExt = finalName.replace(/\\.[^/.]+$/, '');
      var fnInput = document.getElementById('trim-filename-input');
      if (fnInput) fnInput.value = baseWithoutExt + '_cut.mp4';
      var modeInput = document.getElementById('trim-save-mode');
      if (modeInput) modeInput.value = 'replace';
      toggleTrimSaveMode();
      window.closeMobileTrimExportSheet();

      video.muted = true;
      video.playbackRate = 1;
      state.trimSpeed = 1;
      state.trimMobileTier = state.trimMobileTier || 'normal';
      updateTrimmerActionButtons();

      video.onloadedmetadata = function() {
        var dur = video.duration || 0;
        state.trimDuration = dur;
        state.trimStart = 0;
        state.trimEnd = dur;

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
          if (trimPreviewPlayingIndex >= 0 && state.trimSegments && state.trimSegments[trimPreviewPlayingIndex]) {
            var activePreview = state.trimSegments[trimPreviewPlayingIndex];
            if (activePreview.end !== null && video.currentTime >= activePreview.end) {
              video.pause();
              stopTrimSegmentPreview();
            }
          }
        }
      };

      video.onplay = function() { updateTrimmerPlayButtonUI(); };
      video.onpause = function() { updateTrimmerPlayButtonUI(); };
      video.onended = function() {
        updateTrimmerPlayButtonUI();
        stopTrimSegmentPreview();
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
      updateTrimmerPlayButtonUI();
      document.getElementById('video-edit-modal').style.display = 'flex';
    };

    var pendingSeekTime = null;

    function safeSeekTrimmerVideo(targetTime) {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      var dur = state.trimDuration || (video.duration || 0) || 0;
      targetTime = dur > 0 ? Math.max(0, Math.min(dur, targetTime)) : Math.max(0, targetTime);

      updateTrimmerTimeLabels(targetTime);
      if (video.seeking) {
        pendingSeekTime = targetTime;
        return;
      }
      pendingSeekTime = null;
      try {
        video.currentTime = targetTime;
      } catch (err) {}
    }

    function updateTrimmerTimeLabels(overrideCurr) {
      var video = document.getElementById('trimmer-video');
      var curr = (typeof overrideCurr === 'number' && !isNaN(overrideCurr))
        ? overrideCurr
        : (pendingSeekTime !== null ? pendingSeekTime : (video ? video.currentTime : 0));
      var dur = state.trimDuration || (video ? video.duration : 0) || 0;
      var textEl = document.getElementById('trimmer-time-text');
      var progEl = document.getElementById('trimmer-time-progress');
      var playheadEl = document.getElementById('trimmer-playhead');
      if (textEl) {
        textEl.innerText = formatTimeSec(curr) + ' / ' + formatTimeSec(dur);
      }
      var pct = dur > 0 ? Math.max(0, Math.min(100, (curr / dur) * 100)) : 0;
      if (progEl) progEl.style.width = pct + '%';
      if (playheadEl) playheadEl.style.left = pct + '%';
      updateTrimmerSummary();
    }

    // Scrubber pointer events: desktop = click/drag absolute position; mobile = click absolute + horizontal drag 1% relative step
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
        stopTrimSegmentPreview();

        try { display.setPointerCapture(e.pointerId); } catch (err) {}
        if (e.cancelable) e.preventDefault();

        if (isLanDesktopTrimmer()) {
          var rect = display.getBoundingClientRect();
          var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          safeSeekTrimmerVideo(ratio * dur);
        }
      });

      display.addEventListener('pointermove', function(e) {
        if (!isPointerDown) return;
        var video = document.getElementById('trimmer-video');
        if (!video) return;
        var dur = state.trimDuration || (video.duration || 0) || 0;
        if (dur <= 0) return;

        if (isLanDesktopTrimmer()) {
          isDragging = true;
          var rect = display.getBoundingClientRect();
          var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          safeSeekTrimmerVideo(ratio * dur);
          return;
        }

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
        if (video && !isLanDesktopTrimmer()) {
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
      if (seekHoldTimer) { clearTimeout(seekHoldTimer); seekHoldTimer = null; }
      if (seekIntervalTimer) { clearInterval(seekIntervalTimer); seekIntervalTimer = null; }
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
      stopTrimSegmentPreview();
      window.seekTrimmer(delta);
      seekHoldTimer = setTimeout(function() {
        seekIntervalTimer = setInterval(function() {
          window.seekTrimmer(delta);
        }, 100);
      }, 200);
    };

    window.startDynamicSeek = function(dir, e) {
      if (e && e.button !== undefined && e.button !== 0) return;
      if (e) {
        desktopActiveStepSpec = resolveDesktopStepByModifiers(e);
        updateDesktopStepButtonsUI();
      }
      window.stopSeek();
      stopTrimSegmentPreview();
      window.seekTrimmer(dir * desktopActiveStepSpec.step);
      seekHoldTimer = setTimeout(function() {
        seekIntervalTimer = setInterval(function() {
          window.seekTrimmer(dir * desktopActiveStepSpec.step);
        }, 100);
      }, 200);
    };

    window.addEventListener('mouseup', window.stopSeek);
    window.addEventListener('touchend', window.stopSeek);
    window.addEventListener('touchcancel', window.stopSeek);

    window.closeVideoEditModal = function() {
      window.stopSeek();
      stopTrimSegmentPreview();
      window.closeMobileTrimExportSheet();
      pendingSeekTime = null;
      var video = document.getElementById('trimmer-video');
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (e) {}
      }
      var modal = document.getElementById('video-edit-modal');
      if (modal) modal.style.display = 'none';
    };

    window.toggleTrimmerPlay = function() {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      stopTrimSegmentPreview();
      if (pendingSeekTime !== null) safeSeekTrimmerVideo(pendingSeekTime);
      if (video.paused || video.ended) {
        if (video.ended || (video.duration && video.currentTime >= video.duration - 0.05)) {
          safeSeekTrimmerVideo(0);
        }
        var p = video.play();
        if (p && p.catch) p.catch(function() {});
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
      var video = document.getElementById('trimmer-video');
      var mutedIcon = document.getElementById('trim-icon-muted');
      var unmutedIcon = document.getElementById('trim-icon-unmuted');
      var btn = document.getElementById('trim-mute-btn');
      if (!video) return;
      if (mutedIcon && unmutedIcon) {
        mutedIcon.style.display = video.muted ? 'block' : 'none';
        unmutedIcon.style.display = video.muted ? 'none' : 'block';
      }
      if (btn) btn.title = video.muted ? '解除静音 (M)' : '静音 (M)';
    }

    var TRIM_SPEEDS = [1, 1.5, 2, 3];
    window.toggleTrimmerSpeed = function() {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      var idx = TRIM_SPEEDS.indexOf(state.trimSpeed || 1);
      state.trimSpeed = TRIM_SPEEDS[(idx + 1) % TRIM_SPEEDS.length];
      video.playbackRate = state.trimSpeed;
      updateTrimmerSpeedButton();
    };

    function updateTrimmerSpeedButton() {
      var btn = document.getElementById('trim-speed-btn');
      if (!btn) return;
      btn.innerText = (state.trimSpeed || 1) + 'x';
    }

    // Mobile S3 3-Tier Switch: 粗略 1/5 m | 普通 5/10 s | 精细 0.1/1 s
    var MOBILE_TIER_CONFIGS = {
      coarse: [
        { label: '-5m', delta: -300 },
        { label: '-1m', delta: -60 },
        { label: '+1m', delta: 60 },
        { label: '+5m', delta: 300 }
      ],
      normal: [
        { label: '-10s', delta: -10 },
        { label: '-5s', delta: -5 },
        { label: '+5s', delta: 5 },
        { label: '+10s', delta: 10 }
      ],
      fine: [
        { label: '-1s', delta: -1 },
        { label: '-0.1s', delta: -0.1 },
        { label: '+0.1s', delta: 0.1 },
        { label: '+1s', delta: 1 }
      ]
    };

    function renderMobileTierSteppers() {
      var container = document.getElementById('trim-steppers');
      var sw = document.getElementById('trim-tier-switch');
      var tier = state.trimMobileTier || 'normal';
      if (!MOBILE_TIER_CONFIGS[tier]) tier = 'normal';

      if (sw) {
        var opts = sw.querySelectorAll('.segmented-option');
        for (var j = 0; j < opts.length; j++) {
          opts[j].classList.toggle('active', opts[j].getAttribute('data-tier') === tier);
        }
      }
      if (!container) return;

      var cfgs = MOBILE_TIER_CONFIGS[tier];
      var html = '';
      for (var i = 0; i < cfgs.length; i++) {
        var c = cfgs[i];
        html += '<button class="v-btn v-btn-secondary" type="button"' +
          ' onmousedown="startSeek(' + c.delta + ', event)" onmouseup="stopSeek()" onmouseleave="stopSeek()"' +
          ' ontouchstart="startSeek(' + c.delta + ', event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">' +
          c.label + '</button>';
      }
      container.innerHTML = html;
    }

    window.setMobileTrimTier = function(tier) {
      if (!MOBILE_TIER_CONFIGS[tier]) return;
      state.trimMobileTier = tier;
      renderMobileTierSteppers();
    };

    window.openMobileTrimExportSheet = function() {
      var sheet = document.getElementById('trim-export-sheet');
      if (sheet) {
        updateTrimmerSummary();
        sheet.style.display = 'flex';
      }
    };

    window.closeMobileTrimExportSheet = function() {
      var sheet = document.getElementById('trim-export-sheet');
      if (sheet) sheet.style.display = 'none';
    };

    function updateTrimmerActionButtons() {
      updateTrimmerMuteButton();
      updateTrimmerSpeedButton();
      renderMobileTierSteppers();
      updateDesktopStepButtonsUI();
    }

    window.seekTrimmer = function(delta) {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      var dur = state.trimDuration || (video.duration || 0) || 0;
      var current = (pendingSeekTime !== null)
        ? pendingSeekTime
        : (typeof video.currentTime === 'number' && !isNaN(video.currentTime) ? video.currentTime : 0);
      safeSeekTrimmerVideo(Math.max(0, Math.min(dur, current + delta)));
    };

    function hasSegmentOverlap(idx, startVal, endVal) {
      if (startVal === null || endVal === null) return false;
      for (var i = 0; i < state.trimSegments.length; i++) {
        if (i === idx) continue;
        var other = state.trimSegments[i];
        if (other.valid && other.start !== null && other.end !== null) {
          if (startVal < other.end && endVal > other.start) return true;
        }
      }
      return false;
    }

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
        showToast('起点时间必须小于当前片段终点', 3000);
        return;
      }
      if (hasSegmentOverlap(idx, newStart, seg.end)) {
        showToast('当前片段与已有片段存在重叠', 3000);
        return;
      }

      seg.start = newStart;
      if (seg.start !== null && seg.end !== null && seg.start < seg.end) seg.valid = true;
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
        showToast('终点时间必须大于当前片段起点', 3000);
        return;
      }
      if (hasSegmentOverlap(idx, seg.start, newEnd)) {
        showToast('当前片段与已有片段存在重叠', 3000);
        return;
      }

      seg.end = newEnd;
      if (seg.start !== null && seg.end !== null && seg.start < seg.end) seg.valid = true;
      state.trimEnd = seg.end;
      renderTrimSegments();
      updateTrimmerTimeLabels();
      saveCurrentTrimDraft();
      showToast('已设为片段 ' + (idx + 1) + ' 终点: ' + formatTimeSec(newEnd));
    };

    window.updateTrimSegmentInput = function(idx, field, rawVal) {
      if (!state.trimSegments || !state.trimSegments[idx]) return;
      var parsed = parseTimeSec(rawVal);
      if (parsed === null) {
        showToast('请输入有效的时间码', 3000);
        renderTrimSegments();
        return;
      }
      var dur = state.trimDuration || 0;
      var clamped = dur > 0 ? Math.min(dur, parsed) : parsed;
      var rounded = Math.round(clamped * 100) / 100;
      var seg = state.trimSegments[idx];
      var nextStart = field === 'start' ? rounded : seg.start;
      var nextEnd = field === 'end' ? rounded : seg.end;
      if (nextStart !== null && nextEnd !== null && nextEnd <= nextStart + 0.1) {
        showToast(field === 'start' ? '起点必须小于终点' : '终点必须大于起点', 3000);
        renderTrimSegments();
        return;
      }
      if (hasSegmentOverlap(idx, nextStart, nextEnd)) {
        showToast('当前片段与已有片段存在重叠', 3000);
        renderTrimSegments();
        return;
      }
      seg[field] = rounded;
      if (seg.start !== null && seg.end !== null && seg.end > seg.start) seg.valid = true;
      renderTrimSegments();
      safeSeekTrimmerVideo(rounded);
      saveCurrentTrimDraft();
    };

    window.addNewSegment = function() {
      var newSeg = { id: Date.now(), start: null, end: null, valid: false };
      state.trimSegments.push(newSeg);
      state.selectedSegmentIndex = state.trimSegments.length - 1;
      renderTrimSegments();
      updateTrimmerTimeLabels();
      saveCurrentTrimDraft();
      var listEl = document.getElementById('trimmer-segments-list');
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    };

    window.removeTrimSegment = function(idx) {
      if (!state.trimSegments || state.trimSegments.length <= 1) return;
      stopTrimSegmentPreview();
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

    window.moveSegmentAt = function(idx, dir) {
      if (!state.trimSegments || state.trimSegments.length <= 1) return;
      var targetIdx = idx + dir;
      if (idx < 0 || idx >= state.trimSegments.length || targetIdx < 0 || targetIdx >= state.trimSegments.length) return;
      var item = state.trimSegments.splice(idx, 1)[0];
      state.trimSegments.splice(targetIdx, 0, item);
      if (state.selectedSegmentIndex === idx) {
        state.selectedSegmentIndex = targetIdx;
      } else if (state.selectedSegmentIndex === targetIdx) {
        state.selectedSegmentIndex = idx;
      }
      renderTrimSegments();
      updateTrimmerTimeLabels();
      saveCurrentTrimDraft();
    };

    window.selectSegment = function(idx) {
      if (!state.trimSegments || idx < 0 || idx >= state.trimSegments.length) return;
      state.selectedSegmentIndex = idx;
      var seg = state.trimSegments[idx];
      if (seg) seekToSegment(seg.start, seg.end);
      renderTrimSegments();
      updateTrimmerTimeLabels();
    };

    window.togglePreviewTrimSegment = function(idx) {
      var video = document.getElementById('trimmer-video');
      if (!video || !state.trimSegments || !state.trimSegments[idx]) return;
      var seg = state.trimSegments[idx];
      if (!seg.valid || seg.start === null || seg.end === null || seg.end <= seg.start) {
        showToast('请先设置当前片段的起点和终点', 3000);
        return;
      }
      if (trimPreviewPlayingIndex === idx && !video.paused) {
        video.pause();
        stopTrimSegmentPreview();
        return;
      }
      state.selectedSegmentIndex = idx;
      trimPreviewPlayingIndex = idx;
      safeSeekTrimmerVideo(seg.start);
      var p = video.play();
      if (p && p.catch) p.catch(function() {});
      renderTrimSegments();
    };

    function renderTrimSegments() {
      var listEl = document.getElementById('trimmer-segments-list');
      if (!listEl) return;

      if (!state.trimSegments || state.trimSegments.length === 0) {
        listEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:8px;">暂无片段</div>';
        renderTrimmerSegmentsOverlay();
        updateTrimmerSummary();
        return;
      }

      var isSingle = state.trimSegments.length <= 1;

      var html = '';
      if (isLanDesktopTrimmer()) {
        // Desktop D2 structured cards with manual timecode inputs
        for (var i = 0; i < state.trimSegments.length; i++) {
          var seg = state.trimSegments[i];
          var isSelected = i === state.selectedSegmentIndex;
          var isPreviewing = trimPreviewPlayingIndex === i;
          var durText = (seg.valid && seg.start !== null && seg.end !== null)
            ? formatTimeSec(Math.max(0, seg.end - seg.start))
            : '未设置';
          var startVal = seg.start !== null ? formatTimeSec(seg.start) : '';
          var endVal = seg.end !== null ? formatTimeSec(seg.end) : '';

          html += '<div class="desktop-seg-card' + (isSelected ? ' active' : '') + (!seg.valid ? ' invalid' : '') + '" onclick="selectSegment(' + i + ')">' +
            '<div class="desktop-seg-top">' +
              '<span class="desktop-seg-title">#' + (i + 1) + ' · ' + durText + '</span>' +
              '<div class="desktop-seg-actions" onclick="event.stopPropagation()">' +
                '<button class="v-btn v-btn-icon" type="button" ' + (i === 0 ? 'disabled' : '') + ' onclick="moveSegmentAt(' + i + ', -1)" title="上移">↑</button>' +
                '<button class="v-btn v-btn-icon" type="button" ' + (i === state.trimSegments.length - 1 ? 'disabled' : '') + ' onclick="moveSegmentAt(' + i + ', 1)" title="下移">↓</button>' +
                '<button class="v-btn v-btn-icon' + (isPreviewing ? ' active' : '') + '" type="button" onclick="togglePreviewTrimSegment(' + i + ')" title="试播此段 (S)">' + (isPreviewing ? '❚❚' : '▶') + '</button>' +
                (!isSingle ? '<button class="v-btn v-btn-icon" type="button" onclick="removeTrimSegment(' + i + ')" title="删除片段 (W)">✕</button>' : '') +
              '</div>' +
            '</div>' +
            '<div class="desktop-seg-inputs" onclick="event.stopPropagation()">' +
              '<input type="text" class="v-input" value="' + startVal + '" placeholder="起点" onchange="updateTrimSegmentInput(' + i + ', \\'start\\', this.value)">' +
              '<span style="color:var(--text-tertiary); font-size:12px;">→</span>' +
              '<input type="text" class="v-input" value="' + endVal + '" placeholder="终点" onchange="updateTrimSegmentInput(' + i + ', \\'end\\', this.value)">' +
            '</div>' +
          '</div>';
        }
      } else {
        // Mobile S3 multi-row structured list (move/preview/delete actions aligned with Desktop)
        for (var j = 0; j < state.trimSegments.length; j++) {
          var mseg = state.trimSegments[j];
          var mSelected = j === state.selectedSegmentIndex;
          var mPreview = trimPreviewPlayingIndex === j;
          var rangeText = (mseg.valid && mseg.start !== null && mseg.end !== null)
            ? (formatTimeSec(mseg.start) + ' → ' + formatTimeSec(mseg.end))
            : (mseg.start !== null ? (formatTimeSec(mseg.start) + ' → 未设置') : (mseg.end !== null ? ('未设置 → ' + formatTimeSec(mseg.end)) : '未设置起止时间'));

          html += '<div class="mobile-seg-row' + (mSelected ? ' active' : '') + (!mseg.valid ? ' invalid' : '') + '" onclick="selectSegment(' + j + ')">' +
            '<span class="mobile-seg-label">#' + (j + 1) + ' · ' + rangeText + '</span>' +
            '<div class="mobile-seg-row-actions" onclick="event.stopPropagation()">' +
              '<button class="v-btn v-btn-icon" type="button" ' + (j === 0 ? 'disabled' : '') + ' onclick="moveSegmentAt(' + j + ', -1)" title="上移">↑</button>' +
              '<button class="v-btn v-btn-icon" type="button" ' + (j === state.trimSegments.length - 1 ? 'disabled' : '') + ' onclick="moveSegmentAt(' + j + ', 1)" title="下移">↓</button>' +
              '<button class="v-btn v-btn-icon' + (mPreview ? ' active' : '') + '" type="button" onclick="togglePreviewTrimSegment(' + j + ')" title="试播">' + (mPreview ? '❚❚' : '▶') + '</button>' +
              (!isSingle ? '<button class="v-btn v-btn-icon" type="button" onclick="removeTrimSegment(' + j + ')" title="删除">✕</button>' : '') +
            '</div>' +
          '</div>';
        }
      }

      listEl.innerHTML = html;
      renderTrimmerSegmentsOverlay();
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
      var targetTime = isAtStart ? (hasEnd ? endSec : null) : (hasStart ? startSec : null);
      if (targetTime === null) return;
      safeSeekTrimmerVideo(Math.max(0, Math.min(dur, targetTime)));
    };

    window.setTrimSaveMode = function(mode) {
      var input = document.getElementById('trim-save-mode');
      if (input) input.value = mode;
      toggleTrimSaveMode();
    };

    window.toggleTrimSaveMode = function() {
      var mode = (document.getElementById('trim-save-mode') || {}).value || 'replace';
      var wrap = document.getElementById('trim-filename-wrap');
      if (wrap) wrap.style.display = mode === 'saveAs' ? 'flex' : 'none';
      var segmented = document.getElementById('trim-save-segmented');
      if (segmented) {
        var options = segmented.querySelectorAll('.segmented-option');
        for (var i = 0; i < options.length; i++) {
          options[i].classList.toggle('active', options[i].getAttribute('data-value') === mode);
        }
      }
    };

    window.submitVideoCut = async function() {
      var mode = (document.getElementById('trim-save-mode') || {}).value || 'replace';
      var cutMode = 'keep';
      var filename = ((document.getElementById('trim-filename-input') || {}).value || '').trim();

      var validSegments = [];
      var invalidCount = 0;
      for (var i = 0; i < state.trimSegments.length; i++) {
        var s = state.trimSegments[i];
        if (s.valid && s.start !== null && s.end !== null && s.end > s.start) {
          if (s.end - s.start < 0.2) {
            showToast('第 ' + (i + 1) + ' 个片段时长过短（至少 0.2 秒），请微调后再试', 3000);
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
        showToast('请至少设置一个有效的剪辑片段', 3000);
        return;
      }

      if (invalidCount > 0) {
        var okInvalid = await window.showConfirm({
          title: '提示',
          message: '检测到列表中包含 ' + invalidCount + ' 个未设置起止时间的无效片段，处理时将自动跳过这些片段。是否继续？',
          confirmText: '确认',
          cancelText: '取消'
        });
        if (!okInvalid) return;
      }

      if (mode === 'replace') {
        var okReplace = await window.showConfirm({
          title: '覆盖保存确认',
          message: '确定要覆盖保存原视频文件吗？',
          confirmText: '确认',
          danger: true
        });
        if (!okReplace) return;
        closeVideoEditModal();
      }

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
          showToast(res.error || '剪辑发起失败', 3000);
        }
      } catch (err) {
        showToast('请求异常', 3000);
      }
    };

    // ==========================================
    // Desktop D2 Synchronized Keyboard Shortcuts & Live Modifier Stepper Indicator
    // ==========================================
    function isTrimmerModalOpen() {
      var modal = document.getElementById('video-edit-modal');
      return !!(modal && modal.style.display !== 'none');
    }

    window.addEventListener('keydown', function(e) {
      if (!isLanDesktopTrimmer() || !isTrimmerModalOpen()) return;

      desktopActiveStepSpec = resolveDesktopStepByModifiers(e);
      updateDesktopStepButtonsUI();

      var tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;

      var confirmModal = document.getElementById('custom-confirm-modal');
      if (confirmModal && confirmModal.style.display !== 'none') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeVideoEditModal();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        toggleTrimmerPlay();
        return;
      }
      if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft') {
        e.preventDefault();
        stopTrimSegmentPreview();
        window.seekTrimmer(-desktopActiveStepSpec.step);
        return;
      }
      if (e.key === 'ArrowRight' || e.code === 'ArrowRight') {
        e.preventDefault();
        stopTrimSegmentPreview();
        window.seekTrimmer(desktopActiveStepSpec.step);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      var key = (e.key || '').toLowerCase();
      var activeSeg = state.trimSegments && state.trimSegments[state.selectedSegmentIndex];
      if (key === 'm') {
        e.preventDefault();
        toggleTrimmerMute();
      } else if (key === 'z') {
        e.preventDefault();
        markTrimStart();
      } else if (key === 'c') {
        e.preventDefault();
        markTrimEnd();
      } else if (key === 'x') {
        e.preventDefault();
        addNewSegment();
      } else if (key === 'a') {
        e.preventDefault();
        if (activeSeg && activeSeg.start !== null) safeSeekTrimmerVideo(activeSeg.start);
      } else if (key === 'd') {
        e.preventDefault();
        if (activeSeg && activeSeg.end !== null) safeSeekTrimmerVideo(activeSeg.end);
      } else if (key === 's') {
        e.preventDefault();
        togglePreviewTrimSegment(state.selectedSegmentIndex);
      } else if (key === 'q') {
        e.preventDefault();
        if (state.selectedSegmentIndex > 0) selectSegment(state.selectedSegmentIndex - 1);
      } else if (key === 'e') {
        e.preventDefault();
        if (state.trimSegments && state.selectedSegmentIndex < state.trimSegments.length - 1) {
          selectSegment(state.selectedSegmentIndex + 1);
        }
      } else if (key === 'w') {
        e.preventDefault();
        removeTrimSegment(state.selectedSegmentIndex);
      }
    });

    window.addEventListener('keyup', function(e) {
      if (!isLanDesktopTrimmer() || !isTrimmerModalOpen()) return;
      desktopActiveStepSpec = resolveDesktopStepByModifiers(e);
      updateDesktopStepButtonsUI();
    });

    window.addEventListener('blur', function() {
      desktopActiveStepSpec = { step: 1, label: '1s', modifier: '' };
      updateDesktopStepButtonsUI();
    });

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        desktopActiveStepSpec = { step: 1, label: '1s', modifier: '' };
        updateDesktopStepButtonsUI();
      }
    });

    window.addEventListener('pointermove', function(e) {
      if (!isLanDesktopTrimmer() || !isTrimmerModalOpen()) return;
      var next = resolveDesktopStepByModifiers(e);
      if (next.modifier !== desktopActiveStepSpec.modifier) {
        desktopActiveStepSpec = next;
        updateDesktopStepButtonsUI();
      }
    });
`;
