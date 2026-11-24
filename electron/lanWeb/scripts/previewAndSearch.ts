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
    var modalTouchStartY = 0;
    document.addEventListener('touchstart', function(e) {
      if (e.touches && e.touches[0]) {
        modalTouchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      var modal = e.target.closest ? e.target.closest('.modal-overlay') : null;
      if (!modal || modal.style.display === 'none') return;

      var scrollEl = e.target.closest ? e.target.closest('.trimmer-controls, .directory-tree-container, .segment-chips-container, .merge-list, .modal-body') : null;
      if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight) {
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
      var modal = e.target.closest ? e.target.closest('.modal-overlay') : null;
      if (!modal || modal.style.display === 'none') return;

      var scrollEl = e.target.closest ? e.target.closest('.trimmer-controls, .directory-tree-container, .segment-chips-container, .merge-list, .modal-body') : null;
      if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight) {
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

    // Video Player
    function openVideoModal(item) {
      recordPreviewScroll();
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(item.path) +
        (state.token ? '&token=' + encodeURIComponent(state.token) : '') +
        '&_v=' + Date.now();
      
      document.getElementById('video-modal-title').innerText = item.name;
      var video = document.getElementById('main-video');
      video.src = streamUrl;
      video.play().catch(function() {});
      document.getElementById('video-modal').style.display = 'flex';
    }

    window.closeVideoModal = function() {
      var video = document.getElementById('main-video');
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (e) {}
      }
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
