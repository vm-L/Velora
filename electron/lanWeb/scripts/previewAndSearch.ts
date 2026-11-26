export const lanWebPreviewAndSearchScripts = `    // 不支持在线预览的文件提醒与下载确认
    function openUnsupportedPreviewModal(item) {
      var extText = item.ext ? '.' + item.ext.toLowerCase() : '未知格式';
      actionModalTitle.innerText = '文件提示';
      actionModalBody.innerHTML = '<div style="display:flex; flex-direction:column; gap:12px;">' +
        '<p style="font-size:14px; color:var(--text-primary); line-height:1.6; margin:0;">' +
        '该文件格式 (<strong style="color:var(--color-accent);">' + escapeHtml(extText) + '</strong>) 暂不支持在线预览，是否下载该文件？' +
        '</p>' +
        '<div style="font-size:12px; color:var(--text-secondary); background:var(--bg-secondary); padding:10px 12px; border-radius:8px; border:1px solid var(--border-light); word-break:break-all;">' +
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
    var activeLanVideoRestored = false;
    var lastLanProgressSaveAt = 0;

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
      
      document.getElementById('video-modal-title').innerText = item.name;
      var video = document.getElementById('main-video');
      bindLanVideoResumeEvents(video);
      activeLanVideoPath = item.path || '';
      activeLanVideoRestored = false;
      lastLanProgressSaveAt = 0;
      video.src = streamUrl;
      video.play().catch(function() {});
      document.getElementById('video-modal').style.display = 'flex';
    }

    window.closeVideoModal = function() {
      var video = document.getElementById('main-video');
      if (video) {
        if (activeLanVideoPath) {
          saveLanVideoProgress(activeLanVideoPath, video.currentTime, video.duration);
        }
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (e) {}
      }
      activeLanVideoPath = '';
      activeLanVideoRestored = false;
      document.getElementById('video-modal').style.display = 'none';
      restorePreviewScroll();
    };

    // Image Preview & Swipe Navigation
    var currentImageItem = null;
    var imgSwipeStartX = 0;
    var imgSwipeStartY = 0;

    function getCurrentImageList() {
      if (!currentRenderedItems) return [];
      return currentRenderedItems.filter(function(i) {
        return !i.isDirectory && getFileCategory(i) === 'image';
      });
    }

    function openImageModal(item) {
      recordPreviewScroll();
      currentImageItem = item;
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(item.path) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      var mainImg = document.getElementById('main-image');
      if (mainImg) {
        mainImg.className = '';
        mainImg.src = streamUrl;
      }
      document.getElementById('image-modal').style.display = 'flex';
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

      if (mainImg) {
        mainImg.classList.add(direction > 0 ? 'swipe-left' : 'swipe-right');
        setTimeout(function() {
          openImageModal(nextItem);
        }, 100);
      } else {
        openImageModal(nextItem);
      }
    }

    window.closeImageModal = function() {
      document.getElementById('image-modal').style.display = 'none';
      var mainImg = document.getElementById('main-image');
      if (mainImg) {
        mainImg.src = '';
        mainImg.className = '';
      }
      currentImageItem = null;
      restorePreviewScroll();
    };

    var imageModalEl = document.getElementById('image-modal');
    if (imageModalEl) {
      imageModalEl.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
          imgSwipeStartX = e.touches[0].clientX;
          imgSwipeStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      imageModalEl.addEventListener('touchend', function(e) {
        if (e.changedTouches.length === 1) {
          var deltaX = e.changedTouches[0].clientX - imgSwipeStartX;
          var deltaY = e.changedTouches[0].clientY - imgSwipeStartY;
          if (Math.abs(deltaX) > 40 && Math.abs(deltaY) < 60) {
            if (deltaX < 0) {
              navigateImage(1); // Next image
            } else {
              navigateImage(-1); // Previous image
            }
          }
        }
      }, { passive: true });
    }

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

    var mainVideo = document.getElementById('main-video');
    if (mainVideo) {
      // iOS Safari native video fullscreen exit event
      mainVideo.addEventListener('webkitendfullscreen', function() {
        restorePreviewScroll();
      });
    }

    // Search & Sort Event Listeners
    function updateClearSearchBtn() {
      if (clearSearchBtn) {
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
      fileGrid.innerHTML = '<div class="empty-state"><span>正在搜索...</span></div>';
      try {
        var res = await apiFetch('/api/search?id=' + encodeURIComponent(state.currentResourceId) + '&path=' + encodeURIComponent(state.currentPath) + '&q=' + encodeURIComponent(q));
        if (res.success) {
          state.searchResults = res.items || [];
          renderFileGrid();
        } else {
          fileGrid.innerHTML = '<div class="empty-state"><span>搜索失败: ' + escapeHtml(res.error || '未知错误') + '</span></div>';
        }
      } catch (err) {
        fileGrid.innerHTML = '<div class="empty-state"><span>搜索发生异常</span></div>';
      }
    }

    function clearSearch() {
      if (searchInput) searchInput.value = '';
      updateClearSearchBtn();
      if (state.isSearching) {
        state.isSearching = false;
        state.searchResults = [];
        renderFileGrid();
      }
    }

    function triggerSearch() {
      if (searchInput) searchInput.blur();
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

    sortSelect.addEventListener('change', function(e) {
      state.sort = e.target.value;
      renderFileGrid();
    });

    refreshBtn.addEventListener('click', function() {
      loadDirectory(state.currentPath, { preserveScroll: true });
    });


`;
