export const lanWebDesktopInteractionsScripts = `    // =========================================================================
    // Desktop Exclusive Interactions: Context Menu, Marquee, Shortcuts, Drag-Move
    // =========================================================================
    function buildDesktopContextMenuItems(opts) {
      opts = opts || {};
      var items = [];
      if (opts.type === 'multi') {
        var videoCount = Number(opts.videoCount) || 0;
        var allowEdit = !!opts.allowEdit;
        if (allowEdit && videoCount >= 2) {
          items.push({ label: '合并视频', action: 'batchMerge' });
        }
        if (allowEdit && videoCount >= 1) {
          items.push({ label: '压缩视频', action: 'batchCompress' });
        }
        if (allowEdit) {
          items.push({ label: '移动', action: 'batchMove' });
          items.push({ type: 'divider' });
          items.push({ label: '删除', action: 'batchDelete', danger: true });
        }
        items.push({ type: 'divider' });
        items.push({ label: '取消选择', action: 'clearSelection' });
        return items;
      }

      if (opts.type === 'single' && opts.item) {
        var single = opts.item;
        var allow = !!opts.allowEdit;
        var cat = opts.category || getFileCategory(single);
        items.push({ label: single.isDirectory ? '打开文件夹' : '打开预览', action: 'openSingle' });
        if (!single.isDirectory) {
          items.push({ label: '下载', action: 'downloadSingle' });
        }
        if (allow && cat === 'video') {
          items.push({ type: 'divider' });
          items.push({ label: '视频剪辑', action: 'editSingle' });
          items.push({ label: '压缩视频', action: 'compressSingle' });
        }
        if (allow) {
          items.push({ type: 'divider' });
          items.push({ label: '移动', action: 'moveSingle' });
          items.push({ label: '重命名', action: 'renameSingle' });
          items.push({ label: '删除', action: 'deleteSingle', danger: true });
        }
        return items;
      }

      items.push({ label: '刷新', action: 'refresh' });
      items.push({ label: opts.viewMode === 'list' ? '切换为网格视图' : '切换为列表视图', action: 'toggleView' });
      if (opts.allowEdit) {
        items.push({ type: 'divider' });
        items.push({ label: '新建文件夹', action: 'newFolder' });
        items.push({ label: '上传文件', action: 'uploadFiles' });
      }
      if (opts.hasItems) {
        items.push({ type: 'divider' });
        items.push({ label: '全选', action: 'selectAll' });
      }
      return items;
    }

    (function initDesktopInteractions() {
      if (typeof document === 'undefined' || !document.getElementById) return;
      var ctxMenuEl = document.getElementById('desktop-context-menu');
      var marqueeEl = document.getElementById('desktop-marquee-box');
      var mainContentEl = document.querySelector ? document.querySelector('.desktop-main-content') : null;
      var ctxTargetIdx = -1;

      window.closeDesktopContextMenu = function() {
        if (ctxMenuEl) ctxMenuEl.style.display = 'none';
      };

      function executeDesktopMenuAction(action) {
        window.closeDesktopContextMenu();
        var item = ctxTargetIdx >= 0 ? currentRenderedItems[ctxTargetIdx] : null;
        var enc = item ? encodeURIComponent(item.path) : '';
        if (action === 'openSingle' && ctxTargetIdx >= 0) openItemPrimaryAction(ctxTargetIdx);
        else if (action === 'downloadSingle' && enc) window.downloadLanFile(enc);
        else if (action === 'editSingle' && enc) window.openVideoEditModal(enc);
        else if (action === 'compressSingle' && enc) window.openVideoCompressModal(enc);
        else if (action === 'moveSingle' && enc) window.openMoveModal(enc);
        else if (action === 'renameSingle' && enc) window.openRenameModal(enc);
        else if (action === 'deleteSingle' && enc) window.openDeleteModal(enc);
        else if (action === 'batchMerge') window.openBatchMergeModal();
        else if (action === 'batchCompress') window.openBatchCompressModal();
        else if (action === 'batchMove') window.openBatchMoveModal();
        else if (action === 'batchDelete') window.confirmDeleteSelectedItems();
        else if (action === 'clearSelection') window.clearSelection();
        else if (action === 'refresh') loadDirectory(state.currentPath, { preserveScroll: true });
        else if (action === 'toggleView') window.toggleViewMode();
        else if (action === 'newFolder') window.triggerCreateNewFolder();
        else if (action === 'uploadFiles') window.triggerFileUpload();
        else if (action === 'selectAll') window.toggleSelectAll();
      }

      window.runDesktopContextMenuAction = executeDesktopMenuAction;

      function showDesktopContextMenuAt(clientX, clientY, menuItems) {
        if (!ctxMenuEl || !menuItems || menuItems.length === 0) return;
        var html = '';
        for (var i = 0; i < menuItems.length; i++) {
          var m = menuItems[i];
          if (m.type === 'divider') {
            html += '<div class="desktop-ctx-divider"></div>';
          } else {
            html += '<button type="button" class="desktop-ctx-item' + (m.danger ? ' is-danger' : '') + '" onclick="runDesktopContextMenuAction(\\'' + m.action + '\\')">' +
              '<span>' + escapeHtml(m.label) + '</span>' +
              '</button>';
          }
        }
        ctxMenuEl.innerHTML = html;
        ctxMenuEl.style.visibility = 'hidden';
        ctxMenuEl.style.display = 'flex';
        var w = ctxMenuEl.offsetWidth || 170;
        var h = ctxMenuEl.offsetHeight || 180;
        var x = Math.max(8, Math.min(clientX, window.innerWidth - w - 8));
        var y = Math.max(8, Math.min(clientY, window.innerHeight - h - 8));
        ctxMenuEl.style.left = x + 'px';
        ctxMenuEl.style.top = y + 'px';
        ctxMenuEl.style.visibility = 'visible';
      }

      function hasAnyOpenLanModal() {
        var modalIds = [
          'auth-modal', 'video-modal', 'image-modal', 'action-modal',
          'video-edit-modal', 'video-merge-modal', 'video-compress-modal',
          'task-progress-modal', 'custom-dialog-modal'
        ];
        for (var i = 0; i < modalIds.length; i++) {
          var el = document.getElementById(modalIds[i]);
          if (el && el.style.display !== 'none') return true;
        }
        return false;
      }

      function getDesktopGridColumns() {
        if (!fileGrid || state.viewMode === 'list') return 1;
        var cards = fileGrid.querySelectorAll('.file-card');
        if (cards.length <= 1) return 1;
        var firstTop = cards[0].getBoundingClientRect().top;
        var cols = 1;
        for (var i = 1; i < cards.length; i++) {
          if (Math.abs(cards[i].getBoundingClientRect().top - firstTop) <= 6) {
            cols++;
          } else {
            break;
          }
        }
        return Math.max(1, cols);
      }

      function scrollItemIntoViewByIdx(idx) {
        if (!fileGrid || idx < 0) return;
        var el = fileGrid.querySelector('[data-idx="' + idx + '"]');
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }

      async function movePathsToTargetDir(paths, targetDirPath) {
        if (!paths || !paths.length || !targetDirPath) return;
        try {
          var res = await apiFetch('/api/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePaths: paths, targetDirPath: targetDirPath })
          });
          if (res && res.success) {
            showToast('已移动项目');
            window.clearSelection();
            loadDirectory(state.currentPath, { preserveScroll: true });
          } else {
            showToast((res && res.error) || '移动失败', 3000);
          }
        } catch (err) {
          showToast('移动异常', 3000);
        }
      }

      function canDropIntoTarget(destDir, dragPaths) {
        if (!destDir || !dragPaths || dragPaths.length === 0) return false;
        var normDest = normalizeBrowserPath(destDir);
        var hasValidSource = false;
        for (var i = 0; i < dragPaths.length; i++) {
          var normSrc = normalizeBrowserPath(dragPaths[i]);
          if (normSrc === normDest || normDest.indexOf(normSrc + '/') === 0) {
            return false;
          }
          var lastSlash = normSrc.lastIndexOf('/');
          var parent = lastSlash > 0 ? normSrc.slice(0, lastSlash) : '';
          if (parent !== normDest) {
            hasValidSource = true;
          }
        }
        return hasValidSource;
      }

      function clearDropHighlights() {
        var activeDrops = document.querySelectorAll('.is-drop-target');
        for (var i = 0; i < activeDrops.length; i++) {
          activeDrops[i].classList.remove('is-drop-target');
        }
      }

      if (typeof document === 'undefined' || !document.addEventListener) return;

      document.addEventListener('click', function(e) {
        if (ctxMenuEl && ctxMenuEl.style.display !== 'none') {
          if (!e.target || !e.target.closest || !e.target.closest('#desktop-context-menu')) {
            window.closeDesktopContextMenu();
          }
        }
      });

      window.addEventListener('blur', window.closeDesktopContextMenu);
      if (mainContentEl) {
        mainContentEl.addEventListener('scroll', window.closeDesktopContextMenu, { passive: true });
      }

      // Context menu in Desktop Files Workspace
      if (mainContentEl) {
        mainContentEl.addEventListener('contextmenu', function(e) {
          if (!isLanDesktopMode() || state.activeMainView !== 'files' || hasAnyOpenLanModal()) return;
          if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;

          e.preventDefault();
          var cardOrRow = e.target && e.target.closest ? e.target.closest('#file-grid .file-card, #file-grid .file-list-row') : null;
          if (cardOrRow) {
            var idx = parseInt(cardOrRow.getAttribute('data-idx'), 10);
            var item = !isNaN(idx) ? currentRenderedItems[idx] : null;
            if (!item) return;

            if (!state.selectedPaths.has(item.path)) {
              state.selectedPaths.clear();
              state.selectedPaths.add(item.path);
              state.focusedIdx = idx;
              state.lastSelectedIdx = idx;
              state.multiSelectExplicit = false;
              syncSelectionVisuals();
            }

            if (state.selectedPaths.size > 1) {
              var selectedItems = state.items.filter(function(i) { return state.selectedPaths.has(i.path); });
              var videos = selectedItems.filter(function(i) { return getFileCategory(i) === 'video'; });
              ctxTargetIdx = idx;
              showDesktopContextMenuAt(e.clientX, e.clientY, buildDesktopContextMenuItems({
                type: 'multi',
                allowEdit: state.allowEdit,
                videoCount: videos.length
              }));
            } else {
              var singleIdx = currentRenderedItems.findIndex(function(x) { return state.selectedPaths.has(x.path); });
              if (singleIdx < 0) singleIdx = idx;
              ctxTargetIdx = singleIdx;
              var singleItem = currentRenderedItems[singleIdx];
              showDesktopContextMenuAt(e.clientX, e.clientY, buildDesktopContextMenuItems({
                type: 'single',
                allowEdit: state.allowEdit,
                item: singleItem,
                category: getFileCategory(singleItem)
              }));
            }
            return;
          }

          if (e.target && e.target.closest && e.target.closest('.workspace-toolbar, .desktop-list-header')) return;
          ctxTargetIdx = -1;
          showDesktopContextMenuAt(e.clientX, e.clientY, buildDesktopContextMenuItems({
            type: 'empty',
            allowEdit: state.allowEdit,
            viewMode: state.viewMode,
            hasItems: currentRenderedItems.length > 0
          }));
        });
      }

      // Blank-area Marquee Selection
      if (mainContentEl && marqueeEl) {
        var mqTracking = false;
        var mqDragging = false;
        var mqStartX = 0;
        var mqStartY = 0;
        var mqInitialSelected = new Set();

        mainContentEl.addEventListener('mousedown', function(e) {
          if (!isLanDesktopMode() || state.activeMainView !== 'files' || e.button !== 0 || hasAnyOpenLanModal()) return;
          if (!e.target || !e.target.closest) return;
          if (e.target.closest('.file-card, .file-list-row, .desktop-list-header, .workspace-toolbar, button, input, select, .empty-state')) {
            return;
          }
          mqTracking = true;
          mqDragging = false;
          mqStartX = e.clientX;
          mqStartY = e.clientY;
          mqInitialSelected = (e.ctrlKey || e.metaKey) ? new Set(state.selectedPaths) : new Set();
        });

        window.addEventListener('mousemove', function(e) {
          if (!mqTracking) return;
          var dx = e.clientX - mqStartX;
          var dy = e.clientY - mqStartY;
          if (!mqDragging && Math.hypot(dx, dy) < 6) return;
          mqDragging = true;

          var left = Math.min(mqStartX, e.clientX);
          var top = Math.min(mqStartY, e.clientY);
          var width = Math.abs(dx);
          var height = Math.abs(dy);
          marqueeEl.style.display = 'block';
          marqueeEl.style.left = left + 'px';
          marqueeEl.style.top = top + 'px';
          marqueeEl.style.width = width + 'px';
          marqueeEl.style.height = height + 'px';

          var nextSelected = new Set(mqInitialSelected);
          var els = fileGrid ? fileGrid.querySelectorAll('.file-card, .file-list-row') : [];
          var right = left + width;
          var bottom = top + height;
          for (var i = 0; i < els.length; i++) {
            var rect = els[i].getBoundingClientRect();
            if (rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom) {
              var idx = parseInt(els[i].getAttribute('data-idx'), 10);
              if (!isNaN(idx) && currentRenderedItems[idx]) {
                nextSelected.add(currentRenderedItems[idx].path);
              }
            }
          }
          state.selectedPaths = nextSelected;
          state.multiSelectExplicit = nextSelected.size > 0;
          syncSelectionVisuals();
        });

        window.addEventListener('mouseup', function() {
          if (!mqTracking) return;
          if (!mqDragging && state.selectedPaths.size > 0 && mqInitialSelected.size === 0) {
            window.clearSelection();
          }
          mqTracking = false;
          mqDragging = false;
          marqueeEl.style.display = 'none';
        });
      }

      // Internal Drag-and-Drop to Folders, Breadcrumbs, Sidebar Resources
      document.addEventListener('dragstart', function(e) {
        if (!isLanDesktopMode() || !state.allowEdit || state.activeMainView !== 'files') return;
        var el = e.target && e.target.closest ? e.target.closest('#file-grid .file-card, #file-grid .file-list-row') : null;
        if (!el) return;
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        var item = !isNaN(idx) ? currentRenderedItems[idx] : null;
        if (!item) return;

        var dragPaths = state.selectedPaths.has(item.path) ? Array.from(state.selectedPaths) : [item.path];
        state.internalDragPaths = dragPaths;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try {
            e.dataTransfer.setData('application/x-velora-paths', JSON.stringify(dragPaths));
          } catch (err) {}
        }
      });

      document.addEventListener('dragend', function() {
        state.internalDragPaths = [];
        clearDropHighlights();
      });

      document.addEventListener('dragover', function(e) {
        if (!isLanDesktopMode() || !state.allowEdit || !state.internalDragPaths || state.internalDragPaths.length === 0) return;
        var targetEl = e.target && e.target.closest ? e.target.closest('[data-drop-path]') : null;
        clearDropHighlights();
        if (!targetEl) return;
        var destPath = decodeURIComponent(targetEl.getAttribute('data-drop-path') || '');
        if (canDropIntoTarget(destPath, state.internalDragPaths)) {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          targetEl.classList.add('is-drop-target');
        }
      });

      document.addEventListener('drop', function(e) {
        if (!isLanDesktopMode() || !state.allowEdit || !state.internalDragPaths || state.internalDragPaths.length === 0) return;
        var dragPaths = state.internalDragPaths.slice();
        state.internalDragPaths = [];
        clearDropHighlights();

        var targetEl = e.target && e.target.closest ? e.target.closest('[data-drop-path]') : null;
        if (!targetEl) return;
        var destPath = decodeURIComponent(targetEl.getAttribute('data-drop-path') || '');
        if (canDropIntoTarget(destPath, dragPaths)) {
          e.preventDefault();
          e.stopPropagation();
          movePathsToTargetDir(dragPaths, destPath);
        }
      });

      // Desktop Files Workspace Keyboard Shortcuts
      window.addEventListener('keydown', function(e) {
        if (!isLanDesktopMode() || hasAnyOpenLanModal()) return;

        var tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
        var isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);

        if ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 'f' && state.activeMainView === 'files') {
          e.preventDefault();
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
          return;
        }

        if (isEditable || state.activeMainView !== 'files') return;

        if ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 'a') {
          e.preventDefault();
          window.toggleSelectAll();
          return;
        }

        if (e.ctrlKey || e.metaKey || e.altKey) return;

        var key = e.key;
        if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
          if (!currentRenderedItems || currentRenderedItems.length === 0) return;
          e.preventDefault();
          var cols = getDesktopGridColumns();
          var delta = 0;
          if (key === 'ArrowLeft') delta = -1;
          else if (key === 'ArrowRight') delta = 1;
          else if (key === 'ArrowUp') delta = -cols;
          else if (key === 'ArrowDown') delta = cols;

          var cur = state.focusedIdx >= 0 ? state.focusedIdx : 0;
          var next = state.focusedIdx < 0 ? 0 : Math.max(0, Math.min(currentRenderedItems.length - 1, cur + delta));
          state.focusedIdx = next;

          if (e.shiftKey && state.lastSelectedIdx >= 0) {
            selectRangeDesktop(state.lastSelectedIdx, next, false);
          } else {
            state.selectedPaths.clear();
            state.selectedPaths.add(currentRenderedItems[next].path);
            state.lastSelectedIdx = next;
            state.multiSelectExplicit = false;
            syncSelectionVisuals();
          }
          scrollItemIntoViewByIdx(next);
          return;
        }

        if (key === 'Enter') {
          var enterIdx = state.focusedIdx >= 0
            ? state.focusedIdx
            : currentRenderedItems.findIndex(function(x) { return state.selectedPaths.has(x.path); });
          if (enterIdx >= 0) {
            e.preventDefault();
            openItemPrimaryAction(enterIdx);
          }
          return;
        }

        if (e.code === 'Space') {
          var spaceIdx = state.focusedIdx >= 0
            ? state.focusedIdx
            : currentRenderedItems.findIndex(function(x) { return state.selectedPaths.has(x.path); });
          if (spaceIdx >= 0 && currentRenderedItems[spaceIdx]) {
            var spItem = currentRenderedItems[spaceIdx];
            var spCat = getFileCategory(spItem);
            if (!spItem.isDirectory && (spCat === 'video' || spCat === 'audio' || spCat === 'image')) {
              e.preventDefault();
              openItemPrimaryAction(spaceIdx);
            }
          }
          return;
        }

        if (key === 'Backspace') {
          e.preventDefault();
          window.navigateUp();
          return;
        }

        if (key === 'F2' && state.allowEdit) {
          var renameIdx = state.focusedIdx >= 0
            ? state.focusedIdx
            : currentRenderedItems.findIndex(function(x) { return state.selectedPaths.has(x.path); });
          if (renameIdx >= 0 && currentRenderedItems[renameIdx]) {
            e.preventDefault();
            var rItem = currentRenderedItems[renameIdx];
            window.openRenameModal(encodeURIComponent(rItem.path), rItem.name);
          }
          return;
        }

        if (key === 'Delete' && state.allowEdit && state.selectedPaths.size > 0) {
          e.preventDefault();
          if (state.selectedPaths.size === 1) {
            var onlyPath = Array.from(state.selectedPaths)[0];
            window.openDeleteModal(encodeURIComponent(onlyPath));
          } else {
            window.confirmDeleteSelectedItems();
          }
          return;
        }

        if (key === 'Escape') {
          if (ctxMenuEl && ctxMenuEl.style.display !== 'none') {
            window.closeDesktopContextMenu();
          } else if (state.selectedPaths.size > 0) {
            window.clearSelection();
          } else if (state.isSearching && typeof clearSearch === 'function') {
            clearSearch();
          }
        }
      });
    })();
`;
