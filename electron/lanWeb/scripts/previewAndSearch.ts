export const lanWebPreviewAndSearchScripts = `    // 不支持在线预览的文件提醒与下载确认
    function openUnsupportedPreviewModal(item) {
      var extText = item.ext ? '.' + item.ext.toLowerCase() : '未知格式';
      actionModalTitle.innerText = '文件提示';
      actionModalBody.innerHTML = '<div style="display:flex; flex-direction:column; gap:12px;">' +
        '<p style="font-size:14px; color:var(--text-primary); line-height:1.6; margin:0;">' +
        '该文件格式 (<strong style="color:var(--color-accent);">' + escapeHtml(extText) + '</strong>) 暂不支持在线预览，是否下载该文件？' +
        '</p>' +
        '<div style="font-size:12px; color:var(--text-secondary); background:var(--bg-tertiary); padding:10px 12px; border-radius:8px; border:1px solid var(--border-light); word-break:break-all;">' +
        '<div style="line-height:1.5;"><strong style="color:var(--text-primary);">文件名：</strong>' + escapeHtml(item.name) + '</div>' +
        '<div style="margin-top:6px; line-height:1.5;"><strong style="color:var(--text-primary);">文件大小：</strong>' + formatBytes(item.size) + '</div>' +
        '</div>' +
        '</div>';

      var encodedPath = encodeURIComponent(item.path);
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" onclick="confirmDownloadFile(\\'' + encodedPath + '\\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
        '<polyline points="7 10 12 15 17 10"></polyline>' +
        '<line x1="12" y1="15" x2="12" y2="3"></line>' +
        '</svg>' +
        '<span class="btn-text">下载文件</span>' +
        '</button>';

      actionModal.style.display = 'flex';
      if (typeof pushOverlayHistory === 'function') {
        pushOverlayHistory('action-modal', function() { window.closeActionModal(true); });
      }
    }

    window.confirmDownloadFile = function(encodedPath) {
      closeActionModal();
      var itemPath = decodeURIComponent(encodedPath);
      window.location.href = '/download?path=' + encodeURIComponent(itemPath) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
    };

    // Preview Scroll Anchor Restoration
    var previewScrollY = 0;

    function recordPreviewScroll() {
      previewScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    }

    function restorePreviewScroll() {
      if (typeof previewScrollY === 'number') {
        window.scrollTo({ top: previewScrollY, behavior: 'instant' });
        requestAnimationFrame(function() {
          window.scrollTo({ top: previewScrollY, behavior: 'instant' });
        });
      }
    }

    // Prevent Mobile Touch & Wheel Scroll Penetration on Modals
    var MODAL_SCROLLABLE_SELECTOR = '.desktop-d2-segments-list, .mobile-s3-segments-list, .mobile-s3-sheet-body, .trimmer-controls, .directory-tree-container, .segment-chips-container, .merge-list, .modal-body';

    function findModalScrollableTarget(target, modal) {
      var el = target && target.nodeType === 1 ? target : (target && target.parentElement);
      while (el && el !== modal && el !== document.body) {
        if (el.scrollHeight > el.clientHeight + 1) {
          var ov = window.getComputedStyle ? window.getComputedStyle(el).overflowY : '';
          if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') {
            return el;
          }
        }
        el = el.parentElement;
      }
      return (target && target.closest) ? target.closest(MODAL_SCROLLABLE_SELECTOR) : null;
    }

    var modalTouchStartY = 0;
    document.addEventListener('touchstart', function(e) {
      if (e.touches && e.touches[0]) {
        modalTouchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      var modal = e.target && e.target.closest ? e.target.closest('.modal-overlay') : null;
      if (!modal || modal.style.display === 'none') return;

      var scrollEl = findModalScrollableTarget(e.target, modal);
      if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight + 1) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      var deltaY = e.touches && e.touches[0] ? e.touches[0].clientY - modalTouchStartY : 0;
      var atTop = scrollEl.scrollTop <= 0 && deltaY > 0;
      var atBottom = (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1) && deltaY < 0;
      if (atTop || atBottom) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    document.addEventListener('wheel', function(e) {
      var modal = e.target && e.target.closest ? e.target.closest('.modal-overlay') : null;
      if (!modal || modal.style.display === 'none') return;

      var scrollEl = findModalScrollableTarget(e.target, modal);
      if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight + 1) {
        if (e.cancelable) e.preventDefault();
        return;
      }

      var deltaY = e.deltaY;
      var atTop = scrollEl.scrollTop <= 0 && deltaY < 0;
      var atBottom = (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1) && deltaY > 0;
      if (atTop || atBottom) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    // Video Player (含局域网端独立 localStorage 断点续播)
    var LAN_RESUME_STORAGE_KEY = 'velora_lan_playback_progress_v1';
    var LAN_RESUME_MAX_ITEMS = 200;
    var activeLanVideoPath = '';
    var activeLanVideoName = '';
    var activeLanVideoRestored = false;
    var lastLanProgressSaveAt = 0;
    var gestureBadgeTimer = null;

    function showVideoGestureBadge(text, autoHideMs) {
      var badge = document.getElementById('player-gesture-badge');
      if (!badge || !badge.style) return;
      badge.innerText = text;
      badge.style.display = 'block';
      if (gestureBadgeTimer) {
        clearTimeout(gestureBadgeTimer);
        gestureBadgeTimer = null;
      }
      if (autoHideMs !== 0) {
        gestureBadgeTimer = setTimeout(function() {
          badge.style.display = 'none';
        }, autoHideMs || 900);
      }
    }

    function hideVideoGestureBadge() {
      var badge = document.getElementById('player-gesture-badge');
      if (badge && badge.style) badge.style.display = 'none';
      if (gestureBadgeTimer) {
        clearTimeout(gestureBadgeTimer);
        gestureBadgeTimer = null;
      }
    }

    function loadLanResumeMap() {
      try {
        var raw = localStorage.getItem(LAN_RESUME_STORAGE_KEY);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
      } catch (e) {
        return {};
      }
    }

    function persistLanResumeMap(map) {
      try {
        var keys = Object.keys(map);
        if (keys.length > LAN_RESUME_MAX_ITEMS) {
          keys.sort(function(a, b) {
            return (map[a] && map[a].updatedAt || 0) - (map[b] && map[b].updatedAt || 0);
          });
          var removeCount = keys.length - LAN_RESUME_MAX_ITEMS;
          for (var i = 0; i < removeCount; i++) {
            delete map[keys[i]];
          }
        }
        localStorage.setItem(LAN_RESUME_STORAGE_KEY, JSON.stringify(map));
      } catch (e) {}
    }

    function formatLanResumeTime(sec) {
      var total = Math.max(0, Math.floor(sec || 0));
      var h = Math.floor(total / 3600);
      var m = Math.floor((total % 3600) / 60);
      var s = total % 60;
      var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
      return h > 0 ? (pad(h) + ':' + pad(m) + ':' + pad(s)) : (pad(m) + ':' + pad(s));
    }

    function saveLanVideoProgress(videoPath, pos, dur) {
      if (!videoPath || !isFinite(pos) || !isFinite(dur) || dur < 15) return;
      var map = loadLanResumeMap();
      if (pos / dur >= 0.95 || (dur - pos) < 10) {
        if (map[videoPath]) {
          delete map[videoPath];
          persistLanResumeMap(map);
        }
        return;
      }
      if (pos < 3) return;
      map[videoPath] = {
        position: Math.round(pos * 10) / 10,
        duration: Math.round(dur * 10) / 10,
        updatedAt: Date.now()
      };
      persistLanResumeMap(map);
    }

    function clearLanVideoProgress(videoPath) {
      if (!videoPath) return;
      var map = loadLanResumeMap();
      if (map[videoPath]) {
        delete map[videoPath];
        persistLanResumeMap(map);
      }
    }

    function bindLanVideoResumeEvents(video) {
      if (!video || video.__veloraResumeBound) return;
      video.__veloraResumeBound = true;

      video.addEventListener('loadedmetadata', function() {
        if (!activeLanVideoPath || activeLanVideoRestored) return;
        activeLanVideoRestored = true;
        var dur = video.duration;
        if (!isFinite(dur) || dur < 15) return;
        var map = loadLanResumeMap();
        var rec = map[activeLanVideoPath];
        if (rec && rec.position >= 3 && rec.position / dur < 0.95 && (dur - rec.position) >= 10) {
          try {
            video.currentTime = rec.position;
            showToast('已续播至 ' + formatLanResumeTime(rec.position));
          } catch (e) {}
        }
      });

      video.addEventListener('timeupdate', function() {
        if (!activeLanVideoPath) return;
        var now = Date.now();
        if (now - lastLanProgressSaveAt < 3000) return;
        lastLanProgressSaveAt = now;
        saveLanVideoProgress(activeLanVideoPath, video.currentTime, video.duration);
      });

      video.addEventListener('pause', function() {
        if (!activeLanVideoPath) return;
        saveLanVideoProgress(activeLanVideoPath, video.currentTime, video.duration);
      });

      video.addEventListener('ended', function() {
        if (!activeLanVideoPath) return;
        clearLanVideoProgress(activeLanVideoPath);
      });
    }

    function openVideoModal(item) {
      recordPreviewScroll();
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(item.path) +
        (state.token ? '&token=' + encodeURIComponent(state.token) : '') +
        '&_v=' + Date.now();

      var titleEl = document.getElementById('video-modal-title');
      if (titleEl) titleEl.innerText = item.name;
      var editBtn = document.getElementById('video-preview-edit-btn');
      if (editBtn && editBtn.style) {
        var isVid = getFileCategory(item) === 'video';
        editBtn.style.display = (state.allowEdit && isVid) ? 'inline-flex' : 'none';
      }

      var video = document.getElementById('main-video');
      bindLanVideoResumeEvents(video);
      activeLanVideoPath = item.path || '';
      activeLanVideoName = item.name || '';
      activeLanVideoRestored = false;
      lastLanProgressSaveAt = 0;
      hideVideoGestureBadge();
      video.playbackRate = 1;
      video.src = streamUrl;
      video.play().catch(function() {});
      var modal = document.getElementById('video-modal');
      if (modal) modal.style.display = 'flex';
      if (typeof pushOverlayHistory === 'function') {
        pushOverlayHistory('video-modal', function() { window.closeVideoModal(true); });
      }
    }

    window.downloadCurrentPreviewVideo = function() {
      if (!activeLanVideoPath) return;
      var enc = encodeURIComponent(activeLanVideoPath);
      if (typeof window.downloadLanFile === 'function') {
        window.downloadLanFile(enc);
      } else {
        window.location.href = '/download?path=' + enc + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      }
    };

    window.editCurrentPreviewVideo = function() {
      if (!activeLanVideoPath) return;
      var targetPath = activeLanVideoPath;
      var targetName = activeLanVideoName;
      window.closeVideoModal();
      if (typeof window.openVideoEditModal === 'function') {
        window.openVideoEditModal(encodeURIComponent(targetPath), targetName);
      }
    };

    function closeVideoModalDom() {
      hideVideoGestureBadge();
      var video = document.getElementById('main-video');
      if (video) {
        if (activeLanVideoPath) {
          saveLanVideoProgress(activeLanVideoPath, video.currentTime, video.duration);
        }
        try {
          video.playbackRate = 1;
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (e) {}
      }
      activeLanVideoPath = '';
      activeLanVideoName = '';
      activeLanVideoRestored = false;
      var modal = document.getElementById('video-modal');
      if (modal) modal.style.display = 'none';
      restorePreviewScroll();
    }

    window.closeVideoModal = function(fromPopState) {
      if (fromPopState === true) {
        closeVideoModalDom();
      } else if (typeof closeOverlayViaUi === 'function') {
        closeOverlayViaUi('video-modal', closeVideoModalDom);
      } else {
        closeVideoModalDom();
      }
    };

    // Dual-End Enhanced Image Lightbox (Zoom, Pan, Swipe, Arrows, Keyboard)
    var currentImageItem = null;
    var imgScale = 1;
    var imgTx = 0;
    var imgTy = 0;
    var imgSwipeStartX = 0;
    var imgSwipeStartY = 0;
    var imgSingleTapTimer = null;

    function getCurrentImageList() {
      if (!currentRenderedItems) return [];
      return currentRenderedItems.filter(function(i) {
        return !i.isDirectory && getFileCategory(i) === 'image';
      });
    }

    function applyImageLightboxTransform() {
      var mainImg = document.getElementById('main-image');
      var viewport = document.getElementById('image-stage-viewport');
      var resetBtn = document.getElementById('image-zoom-reset-btn');
      if (mainImg && mainImg.style) {
        if (imgScale <= 1.01 && imgTx === 0 && imgTy === 0) {
          mainImg.style.transform = '';
        } else {
          mainImg.style.transform = 'translate3d(' + imgTx + 'px, ' + imgTy + 'px, 0) scale(' + imgScale + ')';
        }
      }
      if (viewport && viewport.classList) {
        viewport.classList.toggle('is-zoomed', imgScale > 1.02);
      }
      if (resetBtn && resetBtn.style) {
        resetBtn.style.display = imgScale > 1.05 ? 'inline-flex' : 'none';
      }
    }

    window.resetImageLightboxTransform = function() {
      imgScale = 1;
      imgTx = 0;
      imgTy = 0;
      applyImageLightboxTransform();
    };

    function openImageModal(item) {
      recordPreviewScroll();
      currentImageItem = item;
      imgScale = 1;
      imgTx = 0;
      imgTy = 0;

      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(item.path) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      var mainImg = document.getElementById('main-image');
      if (mainImg) {
        mainImg.className = '';
        mainImg.src = streamUrl;
      }
      applyImageLightboxTransform();

      var imgList = getCurrentImageList();
      var idx = imgList.findIndex(function(i) { return i.path === item.path; });
      var counterEl = document.getElementById('image-lightbox-counter');
      var nameEl = document.getElementById('image-lightbox-name');
      var prevBtn = document.getElementById('image-prev-btn');
      var nextBtn = document.getElementById('image-next-btn');
      if (counterEl) {
        counterEl.innerText = (idx >= 0 ? (idx + 1) : 1) + ' / ' + Math.max(1, imgList.length);
      }
      if (nameEl) nameEl.innerText = item.name || '';
      var hasMany = imgList.length > 1;
      if (prevBtn && prevBtn.style) prevBtn.style.display = hasMany ? '' : 'none';
      if (nextBtn && nextBtn.style) nextBtn.style.display = hasMany ? '' : 'none';

      var modalEl = document.getElementById('image-modal');
      if (modalEl) {
        if (modalEl.classList) modalEl.classList.remove('is-chrome-hidden');
        modalEl.style.display = 'flex';
      }
      if (typeof pushOverlayHistory === 'function') {
        pushOverlayHistory('image-modal', function() { window.closeImageModal(true); });
      }
    }

    function navigateImage(direction) {
      var imgList = getCurrentImageList();
      if (imgList.length <= 1 || !currentImageItem) return;

      var currentIdx = imgList.findIndex(function(i) { return i.path === currentImageItem.path; });
      if (currentIdx === -1) return;

      var targetIdx = currentIdx + direction;
      if (targetIdx < 0) targetIdx = imgList.length - 1;
      if (targetIdx >= imgList.length) targetIdx = 0;

      var nextItem = imgList[targetIdx];
      var mainImg = document.getElementById('main-image');

      if (mainImg && mainImg.classList) {
        mainImg.classList.add(direction > 0 ? 'swipe-left' : 'swipe-right');
        setTimeout(function() {
          openImageModal(nextItem);
        }, 100);
      } else {
        openImageModal(nextItem);
      }
    }

    window.stepLightboxImage = navigateImage;

    var blockNextBackdropClose = false;
    window.handleImageBackdropClick = function(e) {
      if (blockNextBackdropClose) {
        blockNextBackdropClose = false;
        return;
      }
      if (typeof isLanMobileMode === 'function' && isLanMobileMode()) return;
      if (imgScale > 1.05) return;
      if (e && (e.target && (e.target.id === 'image-modal' || e.target.id === 'image-stage-viewport'))) {
        window.closeImageModal();
      }
    };

    window.downloadCurrentPreviewImage = function() {
      if (!currentImageItem || !currentImageItem.path) return;
      var enc = encodeURIComponent(currentImageItem.path);
      if (typeof window.downloadLanFile === 'function') {
        window.downloadLanFile(enc);
      } else {
        window.location.href = '/download?path=' + enc + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      }
    };

    function closeImageModalDom() {
      if (imgSingleTapTimer) {
        clearTimeout(imgSingleTapTimer);
        imgSingleTapTimer = null;
      }
      var modalEl = document.getElementById('image-modal');
      if (modalEl) {
        modalEl.style.display = 'none';
        if (modalEl.classList) modalEl.classList.remove('is-chrome-hidden');
      }
      var mainImg = document.getElementById('main-image');
      if (mainImg) {
        mainImg.src = '';
        mainImg.className = '';
        if (mainImg.style) mainImg.style.transform = '';
      }
      imgScale = 1;
      imgTx = 0;
      imgTy = 0;
      currentImageItem = null;
      restorePreviewScroll();
    }

    window.closeImageModal = function(fromPopState) {
      if (fromPopState === true) {
        closeImageModalDom();
      } else if (typeof closeOverlayViaUi === 'function') {
        closeOverlayViaUi('image-modal', closeImageModalDom);
      } else {
        closeImageModalDom();
      }
    };

    // Bind Image & Video Gestures / Keyboard Shortcuts safely
    (function initPreviewEnhancements() {
      var imageModalEl = document.getElementById('image-modal');
      var viewportEl = document.getElementById('image-stage-viewport');
      var touchTarget = viewportEl || imageModalEl;

      if (touchTarget && typeof touchTarget.addEventListener === 'function') {
        var mode = '';
        var panStartX = 0;
        var panStartY = 0;
        var panBaseTx = 0;
        var panBaseTy = 0;
        var pinchStartDist = 0;
        var pinchStartScale = 1;
        var pullDownDy = 0;
        var lastTapAt = 0;

        touchTarget.addEventListener('touchstart', function(e) {
          if (!e.touches) return;
          if (e.touches.length === 2) {
            mode = 'pinch';
            if (imgSingleTapTimer) { clearTimeout(imgSingleTapTimer); imgSingleTapTimer = null; }
            pinchStartDist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            ) || 1;
            pinchStartScale = imgScale;
            return;
          }
          if (e.touches.length === 1) {
            imgSwipeStartX = e.touches[0].clientX;
            imgSwipeStartY = e.touches[0].clientY;
            panStartX = imgSwipeStartX;
            panStartY = imgSwipeStartY;
            panBaseTx = imgTx;
            panBaseTy = imgTy;
            pullDownDy = 0;
            mode = imgScale > 1.05 ? 'pan' : 'detect';
          }
        }, { passive: true });

        touchTarget.addEventListener('touchmove', function(e) {
          if (!e.touches) return;
          if (mode === 'pinch' && e.touches.length === 2) {
            if (e.cancelable) e.preventDefault();
            var dist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            imgScale = Math.max(1, Math.min(4, pinchStartScale * (dist / pinchStartDist)));
            if (imgScale <= 1.02) { imgTx = 0; imgTy = 0; }
            applyImageLightboxTransform();
            return;
          }
          if (e.touches.length !== 1) return;
          var dx = e.touches[0].clientX - panStartX;
          var dy = e.touches[0].clientY - panStartY;

          if (mode === 'pan') {
            if (e.cancelable) e.preventDefault();
            var limitX = (window.innerWidth || 360) * 0.45 * (imgScale - 1);
            var limitY = (window.innerHeight || 640) * 0.45 * (imgScale - 1);
            imgTx = Math.max(-limitX, Math.min(limitX, panBaseTx + dx));
            imgTy = Math.max(-limitY, Math.min(limitY, panBaseTy + dy));
            applyImageLightboxTransform();
            return;
          }

          if (mode === 'detect' && Math.hypot(dx, dy) > 12) {
            if (Math.abs(dy) > Math.abs(dx) && dy > 0 && typeof isLanMobileMode === 'function' && isLanMobileMode()) {
              mode = 'pulldown';
            } else if (Math.abs(dx) > Math.abs(dy)) {
              mode = 'swipe';
            } else {
              mode = 'none';
            }
          }

          if (mode === 'pulldown') {
            if (e.cancelable) e.preventDefault();
            pullDownDy = Math.max(0, dy);
            if (viewportEl && viewportEl.style) {
              viewportEl.style.transform = 'translateY(' + pullDownDy + 'px)';
              viewportEl.style.opacity = String(Math.max(0.35, 1 - pullDownDy / 320));
            }
          }
        }, { passive: false });

        touchTarget.addEventListener('touchend', function(e) {
          if (viewportEl && viewportEl.style) {
            viewportEl.style.transform = '';
            viewportEl.style.opacity = '';
          }
          if (mode === 'pulldown') {
            if (pullDownDy >= 75) {
              window.closeImageModal();
            }
            mode = '';
            return;
          }
          if (e.changedTouches && e.changedTouches.length === 1 && mode !== 'pinch') {
            var deltaX = e.changedTouches[0].clientX - imgSwipeStartX;
            var deltaY = e.changedTouches[0].clientY - imgSwipeStartY;
            if (imgScale <= 1.05 && Math.abs(deltaX) > 40 && Math.abs(deltaY) < 60) {
              navigateImage(deltaX < 0 ? 1 : -1);
            } else if (Math.hypot(deltaX, deltaY) < 10 && typeof isLanMobileMode === 'function' && isLanMobileMode()) {
              var now = Date.now();
              if (now - lastTapAt < 260) {
                lastTapAt = 0;
                if (imgSingleTapTimer) { clearTimeout(imgSingleTapTimer); imgSingleTapTimer = null; }
                imgScale = imgScale > 1.2 ? 1 : 2.5;
                if (imgScale === 1) { imgTx = 0; imgTy = 0; }
                applyImageLightboxTransform();
              } else {
                lastTapAt = now;
                imgSingleTapTimer = setTimeout(function() {
                  imgSingleTapTimer = null;
                  if (imageModalEl && imageModalEl.classList) {
                    imageModalEl.classList.toggle('is-chrome-hidden');
                  }
                }, 270);
              }
            }
          }
          mode = '';
        }, { passive: true });
      }

      if (viewportEl && typeof viewportEl.addEventListener === 'function') {
        var desktopDragging = false;
        var dragStartX = 0;
        var dragStartY = 0;
        var dragBaseTx = 0;
        var dragBaseTy = 0;

        viewportEl.addEventListener('wheel', function(e) {
          if (typeof isLanDesktopMode !== 'function' || !isLanDesktopMode()) return;
          e.preventDefault();
          var factor = e.deltaY < 0 ? 1.15 : 0.87;
          imgScale = Math.max(0.5, Math.min(5, imgScale * factor));
          if (imgScale <= 1.02) {
            imgTx = 0;
            imgTy = 0;
          }
          applyImageLightboxTransform();
        }, { passive: false });

        viewportEl.addEventListener('dblclick', function(e) {
          if (typeof isLanDesktopMode !== 'function' || !isLanDesktopMode()) return;
          e.stopPropagation();
          if (imgScale > 1.2) {
            window.resetImageLightboxTransform();
          } else {
            imgScale = 2.5;
            applyImageLightboxTransform();
          }
        });

        viewportEl.addEventListener('mousedown', function(e) {
          if (typeof isLanDesktopMode !== 'function' || !isLanDesktopMode() || e.button !== 0 || imgScale <= 1.05) return;
          e.preventDefault();
          desktopDragging = true;
          blockNextBackdropClose = false;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          dragBaseTx = imgTx;
          dragBaseTy = imgTy;
        });

        if (typeof window.addEventListener === 'function') {
          window.addEventListener('mousemove', function(e) {
            if (!desktopDragging) return;
            if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 4) {
              blockNextBackdropClose = true;
            }
            imgTx = dragBaseTx + (e.clientX - dragStartX);
            imgTy = dragBaseTy + (e.clientY - dragStartY);
            applyImageLightboxTransform();
          });
          window.addEventListener('mouseup', function() {
            desktopDragging = false;
          });
        }
      }

      // Mobile Video Preview Touch Gestures (Double-tap ±10s, Hold 2x, Swipe-down close)
      var videoWrap = document.getElementById('player-video-wrap');
      if (videoWrap && typeof videoWrap.addEventListener === 'function') {
        var vHoldTimer = null;
        var vHeld2x = false;
        var vStartX = 0;
        var vStartY = 0;
        var vMoved = false;
        var vPullDown = false;
        var vLastTapAt = 0;
        var vIgnoreGesture = false;

        videoWrap.addEventListener('touchstart', function(e) {
          if (typeof isLanMobileMode !== 'function' || !isLanMobileMode() || !e.touches || e.touches.length !== 1) return;
          var rect = videoWrap.getBoundingClientRect ? videoWrap.getBoundingClientRect() : null;
          var touch = e.touches[0];
          vIgnoreGesture = !!(rect && touch.clientY > rect.bottom - 56);
          if (vIgnoreGesture) return;

          vStartX = touch.clientX;
          vStartY = touch.clientY;
          vMoved = false;
          vPullDown = false;
          vHeld2x = false;

          if (vHoldTimer) clearTimeout(vHoldTimer);
          vHoldTimer = setTimeout(function() {
            vHoldTimer = null;
            if (!vMoved && !vPullDown) {
              var vid = document.getElementById('main-video');
              if (vid && !vid.paused) {
                vHeld2x = true;
                vid.playbackRate = 2;
                showVideoGestureBadge('2.0x 倍速播放', 0);
              }
            }
          }, 400);
        }, { passive: true });

        videoWrap.addEventListener('touchmove', function(e) {
          if (vIgnoreGesture || !e.touches || e.touches.length !== 1) return;
          var dx = e.touches[0].clientX - vStartX;
          var dy = e.touches[0].clientY - vStartY;
          if (Math.hypot(dx, dy) > 12) {
            vMoved = true;
            if (vHoldTimer) { clearTimeout(vHoldTimer); vHoldTimer = null; }
          }
          if (!vHeld2x && dy > 24 && Math.abs(dy) > Math.abs(dx) * 1.4) {
            vPullDown = true;
          }
        }, { passive: true });

        var endVideoTouch = function(e) {
          if (vHoldTimer) { clearTimeout(vHoldTimer); vHoldTimer = null; }
          if (vIgnoreGesture) return;
          var vid = document.getElementById('main-video');
          if (vHeld2x) {
            vHeld2x = false;
            if (vid) vid.playbackRate = 1;
            hideVideoGestureBadge();
            if (e && e.cancelable) e.preventDefault();
            return;
          }
          if (vPullDown && e && e.changedTouches && e.changedTouches[0]) {
            var dy = e.changedTouches[0].clientY - vStartY;
            if (dy > 80) {
              window.closeVideoModal();
              return;
            }
          }
          if (!vMoved && e && e.changedTouches && e.changedTouches[0] && vid) {
            var now = Date.now();
            if (now - vLastTapAt < 280) {
              vLastTapAt = 0;
              var rect = videoWrap.getBoundingClientRect ? videoWrap.getBoundingClientRect() : { left: 0, width: window.innerWidth || 360 };
              var ratio = (e.changedTouches[0].clientX - rect.left) / (rect.width || 1);
              if (ratio < 0.4) {
                vid.currentTime = Math.max(0, (vid.currentTime || 0) - 10);
                showVideoGestureBadge('-10s');
              } else if (ratio > 0.6) {
                var dur = vid.duration || 0;
                vid.currentTime = dur > 0 ? Math.min(dur, (vid.currentTime || 0) + 10) : ((vid.currentTime || 0) + 10);
                showVideoGestureBadge('+10s');
              } else {
                if (vid.paused) vid.play().catch(function() {});
                else vid.pause();
              }
            } else {
              vLastTapAt = now;
            }
          }
        };

        videoWrap.addEventListener('touchend', endVideoTouch, { passive: false });
        videoWrap.addEventListener('touchcancel', endVideoTouch, { passive: false });
      }

      // Desktop Keyboard Shortcuts for Video & Image Lightbox Modals
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('keydown', function(e) {
          if (typeof isLanDesktopMode !== 'function' || !isLanDesktopMode()) return;

          var imgModal = document.getElementById('image-modal');
          if (imgModal && imgModal.style && imgModal.style.display !== 'none') {
            if (e.key === 'Escape') {
              e.preventDefault();
              window.closeImageModal();
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              navigateImage(-1);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              navigateImage(1);
            } else if (e.key === '0') {
              e.preventDefault();
              window.resetImageLightboxTransform();
            }
            return;
          }

          var vidModal = document.getElementById('video-modal');
          if (vidModal && vidModal.style && vidModal.style.display !== 'none') {
            var vid = document.getElementById('main-video');
            if (!vid) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              window.closeVideoModal();
              return;
            }
            if (e.code === 'Space' || (e.key || '').toLowerCase() === 'k') {
              e.preventDefault();
              if (vid.paused || vid.ended) vid.play().catch(function() {});
              else vid.pause();
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              vid.currentTime = Math.max(0, (vid.currentTime || 0) - 5);
              showVideoGestureBadge('-5s');
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              var maxD = vid.duration || 0;
              vid.currentTime = maxD > 0 ? Math.min(maxD, (vid.currentTime || 0) + 5) : ((vid.currentTime || 0) + 5);
              showVideoGestureBadge('+5s');
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              vid.volume = Math.min(1, Number((vid.volume + 0.1).toFixed(2)));
              vid.muted = false;
              showVideoGestureBadge('音量 ' + Math.round(vid.volume * 100) + '%');
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              vid.volume = Math.max(0, Number((vid.volume - 0.1).toFixed(2)));
              showVideoGestureBadge('音量 ' + Math.round(vid.volume * 100) + '%');
            } else if ((e.key || '').toLowerCase() === 'm') {
              e.preventDefault();
              vid.muted = !vid.muted;
              showVideoGestureBadge(vid.muted ? '已静音' : '已解除静音');
            } else if ((e.key || '').toLowerCase() === 'f') {
              e.preventDefault();
              if (document.fullscreenElement) {
                if (document.exitFullscreen) document.exitFullscreen().catch(function() {});
              } else if (vid.requestFullscreen) {
                vid.requestFullscreen().catch(function() {});
              }
            }
          }
        });
      }
    })();

    // Fullscreen Exit Event Handlers (Desktop & Mobile)
    document.addEventListener('fullscreenchange', function() {
      if (!document.fullscreenElement) {
        restorePreviewScroll();
      }
    });

    document.addEventListener('webkitfullscreenchange', function() {
      if (!document.webkitFullscreenElement) {
        restorePreviewScroll();
      }
    });

    var mainVideoEl = document.getElementById('main-video');
    if (mainVideoEl && typeof mainVideoEl.addEventListener === 'function') {
      mainVideoEl.addEventListener('webkitendfullscreen', function() {
        restorePreviewScroll();
      });
    }

    // Search & Sort Event Listeners
    function updateClearSearchBtn() {
      if (clearSearchBtn && clearSearchBtn.style) {
        clearSearchBtn.style.display = searchInput && searchInput.value ? 'flex' : 'none';
      }
    }

    async function executeSearch() {
      if (!searchInput) return;
      var q = searchInput.value.trim();
      if (!q) {
        clearSearch();
        return;
      }
      state.isSearching = true;
      var searchToggleBtn = document.getElementById('mobile-search-toggle-btn');
      if (searchToggleBtn && searchToggleBtn.classList) {
        searchToggleBtn.classList.add('active');
      }
      if (fileGrid) {
        fileGrid.innerHTML = '<div class="empty-state"><span>正在搜索</span></div>';
      }
      try {
        var res = await apiFetch('/api/search?id=' + encodeURIComponent(state.currentResourceId) + '&path=' + encodeURIComponent(state.currentPath) + '&q=' + encodeURIComponent(q));
        if (res.success) {
          state.searchResults = res.items || [];
          renderFileGrid();
        } else if (fileGrid) {
          fileGrid.innerHTML = '<div class="empty-state"><span>搜索失败: ' + escapeHtml(res.error || '未知错误') + '</span></div>';
        }
      } catch (err) {
        if (fileGrid) {
          fileGrid.innerHTML = '<div class="empty-state"><span>搜索发生异常</span></div>';
        }
      }
    }

    function clearSearch() {
      if (searchInput) searchInput.value = '';
      updateClearSearchBtn();
      var searchToggleBtn = document.getElementById('mobile-search-toggle-btn');
      if (searchToggleBtn && searchToggleBtn.classList) {
        var drawer = document.getElementById('mobile-search-drawer');
        searchToggleBtn.classList.toggle('active', !!(drawer && drawer.classList && drawer.classList.contains('is-open')));
      }
      if (state.isSearching) {
        state.isSearching = false;
        state.searchResults = [];
        renderFileGrid();
      }
    }

    function triggerSearch() {
      if (searchInput && searchInput.blur) searchInput.blur();
      executeSearch();
    }

    if (searchForm) {
      searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        triggerSearch();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
          e.preventDefault();
          triggerSearch();
        }
      });
      searchInput.addEventListener('keyup', function(e) {
        if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
          e.preventDefault();
          triggerSearch();
        }
      });
      searchInput.addEventListener('input', function() {
        updateClearSearchBtn();
        if (!searchInput.value.trim() && state.isSearching) {
          clearSearch();
        }
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', function(e) {
        e.preventDefault();
        triggerSearch();
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', function() {
        clearSearch();
      });
    }

    if (typeof sortSelect !== 'undefined' && sortSelect) {
      sortSelect.addEventListener('change', function(e) {
        state.sort = e.target.value;
        renderFileGrid();
      });
    }

    if (typeof refreshBtn !== 'undefined' && refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        loadDirectory(state.currentPath, { preserveScroll: true });
      });
    }
`;
