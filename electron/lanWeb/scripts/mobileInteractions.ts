export const lanWebMobileInteractionsScripts = `    // =========================================================================
    // Mobile Exclusive Interactions: Compact Search Drawer, Bottom Sheets & Swipe
    // =========================================================================
    (function initMobileInteractions() {
      if (typeof document === 'undefined') return;

      var openSwipeWrap = null;

      window.closeOpenMobileSwipeRow = function() {
        if (!openSwipeWrap) return false;
        var row = openSwipeWrap.querySelector('.mobile-list-row');
        if (row) {
          row.style.transition = 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
          row.style.transform = 'translateX(0px)';
        }
        openSwipeWrap.classList.remove('is-swiped-open');
        openSwipeWrap = null;
        return true;
      };

      window.toggleMobileSearchDrawer = function(forceOpen) {
        var drawer = document.getElementById('mobile-search-drawer');
        var btn = document.getElementById('mobile-search-toggle-btn');
        if (!drawer) return;
        var willOpen = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('is-open');
        drawer.classList.toggle('is-open', willOpen);
        if (btn) btn.classList.toggle('active', willOpen || !!state.isSearching);
        if (willOpen && searchInput) {
          setTimeout(function() { searchInput.focus(); }, 60);
        }
      };

      window.openMobileSortSheet = function() {
        if (!actionModal) return;
        var opts = [
          { value: 'mtime-desc', label: '修改时间（最新优先）' },
          { value: 'mtime-asc', label: '修改时间（最早优先）' },
          { value: 'name-asc', label: '名称（A - Z）' },
          { value: 'name-desc', label: '名称（Z - A）' },
          { value: 'size-desc', label: '文件大小（从大到小）' },
          { value: 'size-asc', label: '文件大小（从小到大）' }
        ];
        actionModalTitle.innerText = '排序方式';
        var html = '<div class="mobile-sheet-list">';
        for (var i = 0; i < opts.length; i++) {
          var o = opts[i];
          var isAct = state.sort === o.value;
          html += '<button type="button" class="mobile-sheet-option' + (isAct ? ' active' : '') + '" onclick="applyMobileSort(\\'' + o.value + '\\')">' +
            '<span>' + escapeHtml(o.label) + '</span>' +
            (isAct ? '<span class="mobile-sheet-check"><svg class="check-icon-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : '') +
            '</button>';
        }
        html += '</div>';
        actionModalBody.innerHTML = html;
        actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" style="width:100%;" onclick="closeActionModal()">关闭</button>';
        actionModal.style.display = 'flex';
        if (typeof pushOverlayHistory === 'function') {
          pushOverlayHistory('action-modal', function() { window.closeActionModal(true); });
        }
      };

      window.applyMobileSort = function(sortVal) {
        state.sort = sortVal;
        if (typeof sortSelect !== 'undefined' && sortSelect) {
          sortSelect.value = sortVal;
        }
        window.closeActionModal();
        renderFileGrid();
      };

      window.openMobileToolsSheet = function() {
        if (!actionModal) return;
        actionModalTitle.innerText = '当前目录操作';
        var html = '<div style="display:flex; flex-direction:column; gap:8px;">';
        if (state.allowEdit) {
          html += '<button type="button" class="v-btn v-btn-secondary" onclick="closeActionModal(); triggerFileUpload()">上传文件</button>';
          html += '<button type="button" class="v-btn v-btn-secondary" onclick="closeActionModal(); triggerCreateNewFolder()">新建文件夹</button>';
        }
        html += '<button type="button" class="v-btn v-btn-secondary" onclick="closeActionModal(); loadDirectory(state.currentPath, { preserveScroll: true })">刷新目录</button>';
        html += '</div>';
        actionModalBody.innerHTML = html;
        actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" style="width:100%;" onclick="closeActionModal()">关闭</button>';
        actionModal.style.display = 'flex';
        if (typeof pushOverlayHistory === 'function') {
          pushOverlayHistory('action-modal', function() { window.closeActionModal(true); });
        }
      };

      if (!document.addEventListener) return;

      // Mobile list row horizontal left-swipe gesture (with iOS edge guard + axis lock)
      var swipeActive = false;
      var swipeLockedDir = '';
      var swipeStartX = 0;
      var swipeStartY = 0;
      var swipeBaseX = 0;
      var swipeCurrentX = 0;
      var swipeWrapEl = null;
      var swipeRowEl = null;
      var swipeMaxReveal = 0;

      document.addEventListener('touchstart', function(e) {
        if (!isLanMobileMode() || state.viewMode !== 'list' || state.selectedPaths.size > 0) return;
        if (!e.touches || e.touches.length !== 1) return;
        var t = e.touches[0];
        if (t.clientX < 24) return;

        var row = e.target && e.target.closest ? e.target.closest('.mobile-list-row') : null;
        if (!row) {
          if (!e.target || !e.target.closest || !e.target.closest('.mobile-swipe-actions')) {
            window.closeOpenMobileSwipeRow();
          }
          return;
        }
        if (e.target && e.target.closest && e.target.closest('.mobile-row-more-btn, .mobile-row-check')) return;

        var wrap = row.parentElement;
        var actionsEl = wrap ? wrap.querySelector('.mobile-swipe-actions') : null;
        if (!wrap || !actionsEl) return;

        if (openSwipeWrap && openSwipeWrap !== wrap) {
          window.closeOpenMobileSwipeRow();
        }

        swipeActive = true;
        swipeLockedDir = '';
        swipeStartX = t.clientX;
        swipeStartY = t.clientY;
        swipeWrapEl = wrap;
        swipeRowEl = row;
        swipeMaxReveal = actionsEl.offsetWidth || 128;
        swipeBaseX = (openSwipeWrap === wrap) ? -swipeMaxReveal : 0;
        swipeCurrentX = swipeBaseX;
        row.style.transition = 'none';
      }, { passive: true });

      document.addEventListener('touchmove', function(e) {
        if (!swipeActive || !swipeRowEl || !e.touches || e.touches.length !== 1) return;
        var dx = e.touches[0].clientX - swipeStartX;
        var dy = e.touches[0].clientY - swipeStartY;

        if (!swipeLockedDir) {
          if (Math.hypot(dx, dy) < 8) return;
          if (Math.abs(dy) >= Math.abs(dx)) {
            swipeActive = false;
            swipeRowEl.style.transition = '';
            swipeRowEl = null;
            swipeWrapEl = null;
            return;
          }
          swipeLockedDir = 'x';
          if (typeof window.cancelActiveCardTouch === 'function') {
            window.cancelActiveCardTouch();
          }
        }

        if (swipeLockedDir === 'x') {
          if (e.cancelable) e.preventDefault();
          var nextX = Math.max(-swipeMaxReveal, Math.min(0, swipeBaseX + dx));
          swipeCurrentX = nextX;
          swipeRowEl.style.transform = 'translateX(' + nextX + 'px)';
        }
      }, { passive: false });

      var endRowSwipe = function() {
        if (!swipeActive || !swipeRowEl) return;
        var row = swipeRowEl;
        var wrap = swipeWrapEl;
        var shouldOpen = swipeLockedDir === 'x' && (-swipeCurrentX >= swipeMaxReveal * 0.42);
        row.style.transition = 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
        if (shouldOpen) {
          row.style.transform = 'translateX(' + (-swipeMaxReveal) + 'px)';
          if (wrap) wrap.classList.add('is-swiped-open');
          openSwipeWrap = wrap;
        } else {
          row.style.transform = 'translateX(0px)';
          if (wrap) wrap.classList.remove('is-swiped-open');
          if (openSwipeWrap === wrap) openSwipeWrap = null;
        }
        swipeActive = false;
        swipeLockedDir = '';
        swipeRowEl = null;
        swipeWrapEl = null;
      };

      document.addEventListener('touchend', endRowSwipe, { passive: true });
      document.addEventListener('touchcancel', endRowSwipe, { passive: true });
      window.addEventListener('scroll', window.closeOpenMobileSwipeRow, { passive: true });

      // Bottom Sheet Pull-Down-to-Dismiss Gesture for Mobile Modals
      var sheetDragging = false;
      var sheetStartY = 0;
      var sheetDy = 0;
      var sheetCardEl = null;
      var sheetModalEl = null;

      function closeSheetModalByEl(modalEl) {
        if (!modalEl) return;
        if (modalEl.id === 'action-modal') window.closeActionModal();
        else if (modalEl.id === 'video-merge-modal') window.closeVideoMergeModal();
        else if (modalEl.id === 'video-compress-modal') window.closeVideoCompressModal();
        else if (modalEl.id === 'custom-dialog-modal') window.closeCustomDialog(false);
        else if (modalEl.id === 'remote-dl-form-card' && typeof window.closeMobileDownloadSheet === 'function') {
          window.closeMobileDownloadSheet();
        }
      }

      document.addEventListener('touchstart', function(e) {
        if (!isLanMobileMode() || !e.touches || e.touches.length !== 1) return;
        var header = e.target && e.target.closest ? e.target.closest('#action-modal .modal-header, #video-merge-modal .modal-header, #video-compress-modal .modal-header, #custom-dialog-modal .modal-header') : null;
        if (!header) return;
        if (e.target.closest('button')) return;
        var card = header.closest('.modal-content');
        var overlay = header.closest('.modal-overlay');
        if (!card || !overlay || overlay.style.display === 'none') return;
        sheetDragging = true;
        sheetStartY = e.touches[0].clientY;
        sheetDy = 0;
        sheetCardEl = card;
        sheetModalEl = overlay;
        card.style.transition = 'none';
      }, { passive: true });

      document.addEventListener('touchmove', function(e) {
        if (!sheetDragging || !sheetCardEl || !e.touches || e.touches.length !== 1) return;
        var dy = Math.max(0, e.touches[0].clientY - sheetStartY);
        sheetDy = dy;
        if (dy > 4 && e.cancelable) e.preventDefault();
        sheetCardEl.style.transform = 'translateY(' + dy + 'px)';
      }, { passive: false });

      var endSheetDrag = function() {
        if (!sheetDragging || !sheetCardEl) return;
        var card = sheetCardEl;
        var modal = sheetModalEl;
        var shouldClose = sheetDy >= 72;
        card.style.transition = 'transform 0.2s ease';
        card.style.transform = '';
        sheetDragging = false;
        sheetCardEl = null;
        sheetModalEl = null;
        if (shouldClose) closeSheetModalByEl(modal);
      };

      document.addEventListener('touchend', endSheetDrag, { passive: true });
      document.addEventListener('touchcancel', endSheetDrag, { passive: true });
    })();
`;
