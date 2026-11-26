export const lanWebBrowserScripts = `    function normalizeBrowserPath(p) {
      return String(p || '').replace(/\\\\/g, '/').replace(/\\/+$/, '');
    }

    function updateViewModeButtonUI() {
      var listIcon = document.getElementById('view-icon-list');
      var gridIcon = document.getElementById('view-icon-grid');
      var btn = document.getElementById('view-mode-btn');
      var isList = state.viewMode === 'list';
      if (fileGrid) {
        fileGrid.classList.toggle('is-list-view', isList);
      }
      if (listIcon) listIcon.style.display = isList ? 'none' : 'block';
      if (gridIcon) gridIcon.style.display = isList ? 'block' : 'none';
      if (btn) btn.title = isList ? '切换为网格视图' : '切换为列表视图';
    }

    window.toggleViewMode = function(explicitMode) {
      var next = (explicitMode === 'list' || explicitMode === 'grid')
        ? explicitMode
        : (state.viewMode === 'list' ? 'grid' : 'list');
      if (next === state.viewMode && explicitMode !== undefined) return;
      state.viewMode = next;
      try {
        localStorage.setItem(isLanMobileMode() ? 'velora_lan_mobile_view' : 'velora_lan_desktop_view', next);
      } catch (e) {}
      if (typeof window.closeOpenMobileSwipeRow === 'function') {
        window.closeOpenMobileSwipeRow();
      }
      updateViewModeButtonUI();
      renderFileGrid();
    };

    window.toggleColumnSort = function(field) {
      if (!field) return;
      var parts = String(state.sort || 'mtime-desc').split('-');
      var curField = parts[0];
      var curOrder = parts[1] || 'desc';
      var nextOrder = (curField === field) ? (curOrder === 'asc' ? 'desc' : 'asc') : (field === 'name' ? 'asc' : 'desc');
      state.sort = field + '-' + nextOrder;
      if (typeof sortSelect !== 'undefined' && sortSelect) {
        sortSelect.value = state.sort;
      }
      renderFileGrid();
    };

    async function loadResources() {
      try {
        var res = await apiFetch('/api/resources');
        if (res.success && res.resources && res.resources.length > 0) {
          state.resources = res.resources;
          renderResourceTabs();
          updateViewModeButtonUI();

          var hashNav = typeof parseNavHash === 'function' ? parseNavHash() : {};
          var target = (hashNav.res && state.resources.find(function(r) { return r.id === hashNav.res; }))
            || state.resources.find(function(r) { return r.id === state.currentResourceId; })
            || state.resources[0];

          var restoredPath = '';
          if (hashNav.path && target) {
            var normRoot = normalizeBrowserPath(target.path);
            var normHashPath = normalizeBrowserPath(hashNav.path);
            if (normHashPath === normRoot || normHashPath.indexOf(normRoot + '/') === 0) {
              restoredPath = hashNav.path;
            }
          }

          await window.selectResource(target.id, {
            targetPath: restoredPath || target.path,
            replaceHistory: true,
            fallbackRootOnFail: !!restoredPath
          });
        } else if (fileGrid) {
          fileGrid.innerHTML = '<div class="empty-state"><span>暂无挂载的本地资源</span></div>';
        }
      } catch (err) {
        console.error('Load resources error:', err);
      }
    }

    function renderResourceTabs() {
      if (!resourceTabs) return;
      if (isLanMobileMode()) {
        resourceTabs.classList.toggle('is-single-hidden', state.resources.length <= 1);
      }
      var html = '';
      for (var i = 0; i < state.resources.length; i++) {
        var r = state.resources[i];
        var activeClass = r.id === state.currentResourceId ? 'active' : '';
        html += '<div class="resource-tab-item ' + activeClass + '" data-drop-path="' + encodeURIComponent(r.path) + '" onclick="selectResource(\\'' + r.id + '\\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
          '</svg>' +
          '<span>' + escapeHtml(r.name) + '</span>' +
          '</div>';
      }
      resourceTabs.innerHTML = html;
    }

    window.selectResource = async function(id, options) {
      options = options || {};
      var res = state.resources.find(function(r) { return r.id === id; });
      if (!res) return;
      state.currentResourceId = id;
      var nextPath = options.targetPath || res.path;
      state.currentPath = nextPath;
      if (typeof clearSearch === 'function') {
        clearSearch();
      }
      renderResourceTabs();
      var ok = await loadDirectory(nextPath, {
        fromPopState: !!options.fromPopState,
        replaceHistory: !!options.replaceHistory
      });
      if (!ok && options.fallbackRootOnFail && nextPath !== res.path) {
        await loadDirectory(res.path, { replaceHistory: true });
      }
    };

    window.goToResourceRoot = function() {
      var res = state.resources.find(function(r) { return r.id === state.currentResourceId; });
      if (res) {
        loadDirectory(res.path);
      }
    };

    window.goToBreadcrumb = function(idx) {
      if (state.breadcrumbPaths && state.breadcrumbPaths[idx]) {
        loadDirectory(state.breadcrumbPaths[idx]);
      }
    };

    async function loadDirectory(path, options) {
      options = options || {};
      var preserveScroll = !!options.preserveScroll;
      var savedScrollY = preserveScroll ? (window.scrollY || document.documentElement.scrollTop || 0) : 0;

      state.currentPath = path;
      state.focusedIdx = -1;
      state.lastSelectedIdx = -1;
      state.multiSelectExplicit = false;
      state.selectedPaths.clear();
      if (typeof window.closeOpenMobileSwipeRow === 'function') {
        window.closeOpenMobileSwipeRow();
      }
      if (typeof window.closeDesktopContextMenu === 'function') {
        window.closeDesktopContextMenu();
      }

      if (!preserveScroll && fileGrid) {
        fileGrid.innerHTML = '<div class="empty-state"><span>正在读取目录</span></div>';
        window.scrollTo(0, 0);
      }
      renderBreadcrumbs();
      updateMultiSelectBar();

      try {
        var res = await apiFetch('/api/directory?id=' + encodeURIComponent(state.currentResourceId) + '&path=' + encodeURIComponent(path));
        if (res.success) {
          state.items = res.items || [];
          if (state.isSearching && searchInput && searchInput.value.trim()) {
            await executeSearch();
          } else {
            renderFileGrid();
          }
          if (!options.fromPopState && !preserveScroll && typeof pushNavHistory === 'function') {
            pushNavHistory(state.activeMainView || 'files', state.currentResourceId, state.currentPath, {
              replace: !!options.replaceHistory
            });
          }
          if (preserveScroll) {
            window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            requestAnimationFrame(function() {
              window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            });
          }
          return true;
        } else {
          if (fileGrid) {
            fileGrid.innerHTML = '<div class="empty-state"><span>读取失败: ' + escapeHtml(res.error || '未知错误') + '</span></div>';
          }
          return false;
        }
      } catch (err) {
        if (fileGrid) {
          fileGrid.innerHTML = '<div class="empty-state"><span>读取异常</span></div>';
        }
        return false;
      }
    }

    window.navigateUp = function() {
      if (!state.breadcrumbPaths || state.breadcrumbPaths.length === 0) {
        return;
      }
      if (state.breadcrumbPaths.length === 1) {
        goToResourceRoot();
      } else {
        goToBreadcrumb(state.breadcrumbPaths.length - 2);
      }
    };

    function renderBreadcrumbs() {
      if (!breadcrumbs) return;
      var res = state.resources.find(function(r) { return r.id === state.currentResourceId; });
      if (!res) return;

      var normRoot = normalizeBrowserPath(res.path);
      var normCurrent = normalizeBrowserPath(state.currentPath);

      state.breadcrumbPaths = [];

      var isAtRoot = normCurrent === normRoot;
      if (navBackBtn) {
        navBackBtn.disabled = isAtRoot;
      }

      var isRootActive = isAtRoot ? 'active' : '';
      var rootDropAttr = isAtRoot ? '' : ' data-drop-path="' + encodeURIComponent(res.path) + '"';
      var html = '<span class="breadcrumb-item ' + isRootActive + '"' + rootDropAttr + ' onclick="goToResourceRoot()">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' +
        '<span>' + escapeHtml(res.name) + '</span>' +
        '</span>';

      if (normCurrent.startsWith(normRoot) && normCurrent.length > normRoot.length) {
        var rel = normCurrent.substring(normRoot.length).replace(/^\\/+/, '');
        var parts = rel.split('/');
        var accum = normRoot;
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          if (part) {
            accum += '/' + part;
            var pathIndex = state.breadcrumbPaths.length;
            state.breadcrumbPaths.push(accum);
            var isLast = i === parts.length - 1;
            var itemClass = isLast ? 'active' : '';
            var clickAttr = isLast ? '' : 'onclick="goToBreadcrumb(' + pathIndex + ')"';
            var dropAttr = isLast ? '' : ' data-drop-path="' + encodeURIComponent(accum) + '"';
            html += '<span class="breadcrumb-sep">/</span>';
            html += '<span class="breadcrumb-item ' + itemClass + '"' + dropAttr + ' ' + clickAttr + '>' + escapeHtml(part) + '</span>';
          }
        }
      }
      breadcrumbs.innerHTML = html;
      breadcrumbs.scrollLeft = breadcrumbs.scrollWidth;
    }

    function getFileCategory(item) {
      if (item.isDirectory) return 'folder';
      var ext = (item.ext || '').toLowerCase();
      if (['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'm4v', 'ts', 'm3u8'].includes(ext)) return 'video';
      if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext)) return 'audio';
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) return 'image';
      if (['js', 'ts', 'html', 'css', 'json', 'py', 'go', 'rs', 'c', 'cpp', 'sh'].includes(ext)) return 'code';
      return 'doc';
    }

    function getCategoryIcon(cat, sizePx) {
      var sz = sizePx || 44;
      if (cat === 'folder') {
        return '<svg class="file-svg folder-color" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
      } else if (cat === 'video') {
        return '<svg class="file-svg video-color" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>';
      } else if (cat === 'audio') {
        return '<svg class="file-svg audio-color" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
      } else if (cat === 'image') {
        return '<svg class="file-svg image-color" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
      } else if (cat === 'code') {
        return '<svg class="file-svg code-color" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
      }
      return '<svg class="file-svg doc-color" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
    }

    function getCheckIconSvg(sizePx) {
      var sz = sizePx || 13;
      return '<svg class="check-icon-svg" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }

    function formatBytes(bytes) {
      if (!bytes || bytes <= 0) return '0 B';
      var k = 1024;
      var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatTime(ts) {
      if (!ts) return '';
      var d = new Date(ts);
      var pad = function(n) { return n.toString().padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function isRecentFile(item) {
      if (!item) return false;
      if (item.isDirectory) {
        return !!item.hasRecentFile;
      }
      if (!item.mtime) return false;
      var diff = Date.now() - item.mtime;
      return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }

    var GRID_BATCH_SIZE = 60;
    var gridSentinelObserver = null;
    var currentRenderedItems = [];
    var activeTouchTimer = null;
    var activeTouchCard = null;
    var touchStartX = 0;
    var touchStartY = 0;
    var hasTriggeredLongPress = false;

    window.cancelActiveCardTouch = function() {
      if (activeTouchTimer) {
        clearTimeout(activeTouchTimer);
        activeTouchTimer = null;
      }
      if (activeTouchCard) {
        activeTouchCard.classList.remove('pressing');
        activeTouchCard = null;
      }
    };

    function buildGridCardHtml(item, idx) {
      var cat = getFileCategory(item);
      var iconSvg = getCategoryIcon(cat, 44);
      var metaSize = item.isDirectory ? '文件夹' : formatBytes(item.size);
      var encodedPath = encodeURIComponent(item.path);
      var timeStr = formatTime(item.mtime);
      var extBadge = item.isDirectory ? '' : '<span class="ext-badge">' + (item.ext || 'FILE').toUpperCase() + '</span>';
      var recentBadge = isRecentFile(item) ? '<span class="recent-badge">NEW</span>' : '';
      var isSelected = state.selectedPaths.has(item.path);
      var isFocused = state.focusedIdx === idx;
      var isDesktop = isLanDesktopMode();
      var canShowMoreBtn = isLanMobileMode() && (state.allowEdit || !item.isDirectory);
      var cardClass = 'file-card' +
        (isSelected ? ' selected' : '') +
        (isFocused ? ' is-focused' : '') +
        (canShowMoreBtn ? ' has-actions' : '');
      var dragAttrs = (isDesktop && state.allowEdit) ? ' draggable="true"' : '';
      var dropAttr = (isDesktop && item.isDirectory) ? ' data-drop-path="' + encodedPath + '"' : '';
      var dblAttr = isDesktop ? ' ondblclick="handleCardDblClick(' + idx + ', event)"' : '';

      return '<div class="' + cardClass + '" data-idx="' + idx + '" data-path="' + encodedPath + '" data-is-dir="' + (item.isDirectory ? '1' : '0') + '"' + dragAttrs + dropAttr + dblAttr + ' title="' + escapeHtml(item.path) + '" onclick="handleCardClick(' + idx + ', event)">' +
        '<div class="card-select-btn" onclick="event.stopPropagation(); toggleCardSelection(' + idx + ', event)">' + getCheckIconSvg(13) + '</div>' +
        recentBadge +
        '<div class="card-icon-wrap">' +
        iconSvg +
        extBadge +
        '</div>' +
        '<div class="card-info">' +
        '<span class="card-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</span>' +
        '<span class="card-size">' + metaSize + '</span>' +
        '<span class="card-time">' + timeStr + '</span>' +
        '</div>' +
        (canShowMoreBtn ? '<button class="card-actions-btn" type="button" onclick="event.stopPropagation(); openItemActions(\\'' + encodedPath + '\\')">⋮</button>' : '') +
        '</div>';
    }

    function buildDesktopListHeaderHtml() {
      var parts = String(state.sort || 'mtime-desc').split('-');
      var curField = parts[0];
      var curOrder = parts[1] || 'desc';
      var arrow = function(f) {
        if (curField !== f) return '';
        return curOrder === 'asc' ? ' ↑' : ' ↓';
      };
      var allSelected = currentRenderedItems.length > 0 && currentRenderedItems.every(function(it) {
        return state.selectedPaths.has(it.path);
      });
      return '<div class="desktop-list-header">' +
        '<div class="col-check"><span id="desktop-list-select-all-check" class="list-check-box' + (allSelected ? ' is-checked' : '') + '" onclick="toggleSelectAll()" title="全选">' + getCheckIconSvg(12) + '</span></div>' +
        '<div class="col-name is-sortable" onclick="toggleColumnSort(\\'name\\')">名称' + arrow('name') + '</div>' +
        '<div class="col-size is-sortable" onclick="toggleColumnSort(\\'size\\')">大小' + arrow('size') + '</div>' +
        '<div class="col-time is-sortable" onclick="toggleColumnSort(\\'mtime\\')">修改时间' + arrow('mtime') + '</div>' +
        '<div class="col-actions">操作</div>' +
      '</div>';
    }

    function buildDesktopRowActionBtn(title, fnName, encodedPath, svgBody, extraClass) {
      var cls = 'row-action-btn' + (extraClass ? ' ' + extraClass : '');
      return '<button class="' + cls + '" type="button" title="' + title + '" onclick="event.stopPropagation(); ' + fnName + '(\\'' + encodedPath + '\\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + svgBody + '</svg>' +
        '</button>';
    }

    function buildDesktopListRowHtml(item, idx) {
      var cat = getFileCategory(item);
      var iconSvg = getCategoryIcon(cat, 20);
      var encodedPath = encodeURIComponent(item.path);
      var metaSize = item.isDirectory ? '-' : formatBytes(item.size);
      var timeStr = formatTime(item.mtime);
      var isSelected = state.selectedPaths.has(item.path);
      var isFocused = state.focusedIdx === idx;
      var recentTag = isRecentFile(item) ? '<span class="list-new-badge">NEW</span>' : '';
      var typeTag = item.isDirectory ? '<span class="list-ext-tag">目录</span>' : '<span class="list-ext-tag">' + escapeHtml((item.ext || 'FILE').toUpperCase()) + '</span>';
      var dragAttr = state.allowEdit ? ' draggable="true"' : '';
      var dropAttr = item.isDirectory ? ' data-drop-path="' + encodedPath + '"' : '';

      var quickBtns = '';
      if (state.allowEdit && !item.isDirectory && cat === 'video') {
        quickBtns += buildDesktopRowActionBtn('视频剪辑', 'openVideoEditModal', encodedPath, '<circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line>');
        quickBtns += buildDesktopRowActionBtn('压缩视频', 'openVideoCompressModal', encodedPath, '<path d="M12 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path><polygon points="8 10.5 13 13.5 8 16.5" fill="currentColor" stroke="none"></polygon><polyline points="15 4 15 9 20 9"></polyline><line x1="21" y1="3" x2="15" y2="9"></line>');
      }
      if (!item.isDirectory) {
        quickBtns += buildDesktopRowActionBtn('下载', 'downloadLanFile', encodedPath, '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>');
      }
      if (state.allowEdit) {
        quickBtns += buildDesktopRowActionBtn('移动', 'openMoveModal', encodedPath, '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"></path><path d="M2 13h10"></path><path d="m9 16 3-3-3-3"></path>');
        quickBtns += buildDesktopRowActionBtn('重命名', 'openRenameModal', encodedPath, '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>');
        quickBtns += buildDesktopRowActionBtn('删除', 'openDeleteModal', encodedPath, '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>', 'is-danger');
      }

      return '<div class="file-list-row desktop-list-row' + (isSelected ? ' selected' : '') + (isFocused ? ' is-focused' : '') + '" data-idx="' + idx + '" data-path="' + encodedPath + '" data-is-dir="' + (item.isDirectory ? '1' : '0') + '"' + dragAttr + dropAttr + ' title="' + escapeHtml(item.path) + '" onclick="handleCardClick(' + idx + ', event)" ondblclick="handleCardDblClick(' + idx + ', event)">' +
        '<div class="col-check" onclick="event.stopPropagation(); toggleCardSelection(' + idx + ', event)"><span class="list-check-box">' + getCheckIconSvg(12) + '</span></div>' +
        '<div class="col-name">' +
          iconSvg +
          '<span class="desktop-row-name">' + escapeHtml(item.name) + '</span>' +
          recentTag +
          typeTag +
        '</div>' +
        '<div class="col-size">' + metaSize + '</div>' +
        '<div class="col-time">' + timeStr + '</div>' +
        '<div class="col-actions">' + quickBtns + '</div>' +
      '</div>';
    }

    function buildMobileListRowHtml(item, idx) {
      var cat = getFileCategory(item);
      var iconSvg = getCategoryIcon(cat, 28);
      var encodedPath = encodeURIComponent(item.path);
      var metaSize = item.isDirectory ? '文件夹' : formatBytes(item.size);
      var timeStr = formatTime(item.mtime);
      var isSelected = state.selectedPaths.has(item.path);
      var recentTag = isRecentFile(item) ? '<span class="mobile-row-new">NEW</span>' : '';

      var swipeBtns = '';
      if (state.allowEdit) {
        if (cat === 'video') {
          swipeBtns += '<button class="mobile-swipe-btn is-edit" type="button" onclick="event.stopPropagation(); closeOpenMobileSwipeRow(); openVideoEditModal(\\'' + encodedPath + '\\')">剪辑</button>';
        } else {
          swipeBtns += '<button class="mobile-swipe-btn is-move" type="button" onclick="event.stopPropagation(); closeOpenMobileSwipeRow(); openMoveModal(\\'' + encodedPath + '\\')">移动</button>';
        }
        swipeBtns += '<button class="mobile-swipe-btn is-delete" type="button" onclick="event.stopPropagation(); closeOpenMobileSwipeRow(); openDeleteModal(\\'' + encodedPath + '\\')">删除</button>';
      } else if (!item.isDirectory) {
        swipeBtns += '<button class="mobile-swipe-btn is-download" type="button" onclick="event.stopPropagation(); closeOpenMobileSwipeRow(); downloadLanFile(\\'' + encodedPath + '\\')">下载</button>';
      }

      var hasMoreMenu = state.allowEdit || !item.isDirectory;

      return '<div class="mobile-list-row-wrap' + (isSelected ? ' selected' : '') + '" data-idx="' + idx + '" data-path="' + encodedPath + '">' +
        (swipeBtns ? '<div class="mobile-swipe-actions">' + swipeBtns + '</div>' : '') +
        '<div class="mobile-list-row" data-idx="' + idx + '" onclick="handleCardClick(' + idx + ', event)">' +
          '<div class="mobile-row-check" onclick="event.stopPropagation(); toggleCardSelection(' + idx + ', event)">' + getCheckIconSvg(13) + '</div>' +
          '<div class="mobile-row-icon">' + iconSvg + '</div>' +
          '<div class="mobile-row-main">' +
            '<div class="mobile-row-title">' + escapeHtml(item.name) + '</div>' +
            '<div class="mobile-row-sub">' +
              recentTag +
              '<span>' + metaSize + (timeStr ? (' · ' + timeStr) : '') + '</span>' +
            '</div>' +
          '</div>' +
          (hasMoreMenu ? '<button class="mobile-row-more-btn" type="button" aria-label="操作菜单" onclick="event.stopPropagation(); openItemActions(\\'' + encodedPath + '\\')">⋮</button>' : '') +
        '</div>' +
      '</div>';
    }

    function buildCardHtml(item, idx) {
      if (state.viewMode === 'list') {
        if (isLanDesktopMode()) return buildDesktopListRowHtml(item, idx);
        if (isLanMobileMode()) return buildMobileListRowHtml(item, idx);
      }
      return buildGridCardHtml(item, idx);
    }

    function renderFileGrid() {
      currentRenderedItems = getFilteredAndSortedItems();

      if (gridSentinelObserver) {
        gridSentinelObserver.disconnect();
        gridSentinelObserver = null;
      }

      if (!fileGrid) return;
      updateViewModeButtonUI();

      if (currentRenderedItems.length === 0) {
        var emptyMsg = state.isSearching ? '未找到匹配的文件或目录' : '未找到文件或目录为空';
        fileGrid.innerHTML = '<div class="empty-state"><span>' + emptyMsg + '</span></div>';
        state.renderedCount = 0;
        return;
      }

      state.renderedCount = Math.min(GRID_BATCH_SIZE, currentRenderedItems.length);
      var html = (state.viewMode === 'list' && isLanDesktopMode()) ? buildDesktopListHeaderHtml() : '';
      for (var idx = 0; idx < state.renderedCount; idx++) {
        html += buildCardHtml(currentRenderedItems[idx], idx);
      }

      if (state.renderedCount < currentRenderedItems.length) {
        html += '<div id="grid-sentinel" class="grid-sentinel"><span>滑动加载更多 (' + state.renderedCount + '/' + currentRenderedItems.length + ')</span></div>';
      }

      fileGrid.innerHTML = html;
      bindCardTouchGestures(fileGrid);
      initGridSentinelObserver();
    }

    function appendNextGridBatch() {
      if (!currentRenderedItems || state.renderedCount >= currentRenderedItems.length || !fileGrid) return;

      var start = state.renderedCount;
      var nextCount = Math.min(start + GRID_BATCH_SIZE, currentRenderedItems.length);
      var sentinel = document.getElementById('grid-sentinel');

      var frag = document.createElement('div');
      var batchHtml = '';
      for (var idx = start; idx < nextCount; idx++) {
        batchHtml += buildCardHtml(currentRenderedItems[idx], idx);
      }
      frag.innerHTML = batchHtml;

      while (frag.firstChild) {
        if (sentinel) {
          fileGrid.insertBefore(frag.firstChild, sentinel);
        } else {
          fileGrid.appendChild(frag.firstChild);
        }
      }

      state.renderedCount = nextCount;
      bindCardTouchGestures(fileGrid);

      if (sentinel) {
        if (state.renderedCount >= currentRenderedItems.length) {
          sentinel.remove();
          if (gridSentinelObserver) {
            gridSentinelObserver.disconnect();
            gridSentinelObserver = null;
          }
        } else {
          sentinel.innerHTML = '<span>滑动加载更多 (' + state.renderedCount + '/' + currentRenderedItems.length + ')</span>';
        }
      }
    }

    function initGridSentinelObserver() {
      var sentinel = document.getElementById('grid-sentinel');
      if (!sentinel) return;

      if ('IntersectionObserver' in window) {
        gridSentinelObserver = new IntersectionObserver(function(entries) {
          if (entries[0] && entries[0].isIntersecting) {
            appendNextGridBatch();
          }
        }, { rootMargin: '250px' });
        gridSentinelObserver.observe(sentinel);
      }
    }

    function bindCardTouchGestures(container) {
      if (!isLanMobileMode()) return;
      var cards = container.querySelectorAll('.file-card:not([data-touch-bound]), .mobile-list-row:not([data-touch-bound])');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        card.setAttribute('data-touch-bound', 'true');
        card.addEventListener('touchstart', onCardTouchStart, { passive: true });
        card.addEventListener('touchmove', onCardTouchMove, { passive: true });
        card.addEventListener('touchend', onCardTouchEnd);
        card.addEventListener('touchcancel', onCardTouchCancel);
      }
    }

    function onCardTouchStart(e) {
      if (!isLanMobileMode() || e.touches.length !== 1) return;
      if (e.target && e.target.closest && e.target.closest('.mobile-row-more-btn, .mobile-row-check, .card-select-btn, .card-actions-btn')) {
        return;
      }
      var card = e.currentTarget;
      activeTouchCard = card;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      hasTriggeredLongPress = false;

      card.classList.add('pressing');

      if (activeTouchTimer) clearTimeout(activeTouchTimer);
      activeTouchTimer = setTimeout(function() {
        if (!activeTouchCard) return;
        hasTriggeredLongPress = true;
        activeTouchCard.classList.remove('pressing');

        if (navigator.vibrate) {
          try { navigator.vibrate(35); } catch (err) {}
        }

        var idx = parseInt(activeTouchCard.getAttribute('data-idx'), 10);
        if (!isNaN(idx)) {
          toggleCardSelection(idx);
        }
      }, 450);
    }

    function onCardTouchMove(e) {
      if (!activeTouchCard) return;
      var moveX = e.touches[0].clientX;
      var moveY = e.touches[0].clientY;
      if (Math.hypot(moveX - touchStartX, moveY - touchStartY) > 10) {
        window.cancelActiveCardTouch();
      }
    }

    function onCardTouchEnd(e) {
      if (activeTouchTimer) {
        clearTimeout(activeTouchTimer);
        activeTouchTimer = null;
      }
      if (activeTouchCard) {
        activeTouchCard.classList.remove('pressing');
        activeTouchCard = null;
      }
      if (hasTriggeredLongPress) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
    }

    function onCardTouchCancel() {
      window.cancelActiveCardTouch();
    }

    function syncSelectionVisuals() {
      if (!fileGrid) return;
      var itemEls = fileGrid.querySelectorAll('[data-idx]');
      for (var i = 0; i < itemEls.length; i++) {
        var el = itemEls[i];
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        var item = !isNaN(idx) ? currentRenderedItems[idx] : null;
        if (!item) continue;
        el.classList.toggle('selected', state.selectedPaths.has(item.path));
        if (el.classList.contains('file-card') || el.classList.contains('file-list-row')) {
          el.classList.toggle('is-focused', state.focusedIdx === idx);
        }
      }
      var allCheck = document.getElementById('desktop-list-select-all-check');
      if (allCheck && allCheck.classList) {
        var allSelected = currentRenderedItems.length > 0 && currentRenderedItems.every(function(it) {
          return state.selectedPaths.has(it.path);
        });
        allCheck.classList.toggle('is-checked', allSelected);
      }
      updateMultiSelectBar();
    }

    function selectRangeDesktop(fromIdx, toIdx, preserveExisting) {
      if (!preserveExisting) {
        state.selectedPaths.clear();
      }
      var start = Math.min(fromIdx, toIdx);
      var end = Math.max(fromIdx, toIdx);
      for (var i = start; i <= end; i++) {
        if (currentRenderedItems[i]) {
          state.selectedPaths.add(currentRenderedItems[i].path);
        }
      }
      state.multiSelectExplicit = state.selectedPaths.size > 1;
      syncSelectionVisuals();
    }

    window.toggleCardSelection = function(idx, event) {
      if (event) event.stopPropagation();
      var item = currentRenderedItems[idx];
      if (!item) return;

      if (isLanDesktopMode() && event && event.shiftKey && state.lastSelectedIdx >= 0) {
        state.focusedIdx = idx;
        selectRangeDesktop(state.lastSelectedIdx, idx, !!(event.ctrlKey || event.metaKey));
        return;
      }

      var wasSelected = state.selectedPaths.has(item.path);
      if (wasSelected) {
        state.selectedPaths.delete(item.path);
      } else {
        state.selectedPaths.add(item.path);
      }
      state.focusedIdx = state.selectedPaths.has(item.path) ? idx : -1;
      state.lastSelectedIdx = idx;
      state.multiSelectExplicit = state.selectedPaths.size > 0;
      syncSelectionVisuals();
    };

    window.clearSelection = function() {
      state.selectedPaths.clear();
      state.multiSelectExplicit = false;
      syncSelectionVisuals();
    };

    window.toggleSelectAll = function() {
      if (!currentRenderedItems || currentRenderedItems.length === 0) return;
      var allSelected = currentRenderedItems.every(function(item) {
        return state.selectedPaths.has(item.path);
      });

      if (allSelected) {
        window.clearSelection();
      } else {
        currentRenderedItems.forEach(function(item) {
          state.selectedPaths.add(item.path);
        });
        state.multiSelectExplicit = true;
        syncSelectionVisuals();
      }
    };

    function updateMultiSelectBar() {
      var size = state.selectedPaths.size;
      var selectedItems = state.items.filter(function(i) { return state.selectedPaths.has(i.path); });
      var videoItems = selectedItems.filter(function(i) { return getFileCategory(i) === 'video'; });
      var allSelected = currentRenderedItems.length > 0 && currentRenderedItems.every(function(item) {
        return state.selectedPaths.has(item.path);
      });

      if (isLanMobileMode()) {
        var desktopBar = document.getElementById('multi-select-bar');
        if (desktopBar) desktopBar.style.display = 'none';
        var mobileBar = document.getElementById('mobile-select-bar');
        if (mobileBar) {
          if (size === 0) {
            mobileBar.style.display = 'none';
            document.body.classList.remove('is-selecting');
            return;
          }
          document.body.classList.add('is-selecting');
          mobileBar.style.display = 'flex';
          var mAll = document.getElementById('m-batch-select-all-btn');
          var mMerge = document.getElementById('m-batch-merge-btn');
          var mComp = document.getElementById('m-batch-compress-btn');
          var mMove = document.getElementById('m-batch-move-btn');
          var mDel = document.getElementById('m-batch-delete-btn');
          if (mAll) mAll.innerText = allSelected ? '全不选' : '全选';
          if (mMerge) mMerge.style.display = (state.allowEdit && videoItems.length >= 2) ? 'inline-flex' : 'none';
          if (mComp) mComp.style.display = (state.allowEdit && videoItems.length > 0) ? 'inline-flex' : 'none';
          if (mMove) mMove.style.display = (state.allowEdit && size > 0) ? 'inline-flex' : 'none';
          if (mDel) mDel.style.display = (state.allowEdit && size > 0) ? 'inline-flex' : 'none';
        }
        return;
      }

      var bar = document.getElementById('multi-select-bar');
      if (!bar) return;
      var countEl = document.getElementById('multi-select-count');
      var mergeBtn = document.getElementById('batch-merge-btn');
      var compressBtn = document.getElementById('batch-compress-btn');
      var moveBtn = document.getElementById('batch-move-btn');
      var delBtn = document.getElementById('batch-delete-btn');
      var allBtn = document.getElementById('batch-select-all-btn');

      document.body.classList.toggle('is-selecting', size > 0);

      var shouldShowDesktopBar = size >= 2 || (size >= 1 && !!state.multiSelectExplicit);
      if (!shouldShowDesktopBar) {
        bar.style.display = 'none';
        return;
      }

      bar.style.display = 'flex';
      if (countEl) countEl.innerText = '已选 ' + size + ' 项';
      if (allBtn) allBtn.innerText = allSelected ? '取消全选' : '全选';
      if (mergeBtn) mergeBtn.style.display = (state.allowEdit && videoItems.length >= 2) ? 'inline-flex' : 'none';
      if (compressBtn) compressBtn.style.display = (state.allowEdit && videoItems.length > 0) ? 'inline-flex' : 'none';
      if (moveBtn) moveBtn.style.display = (state.allowEdit && size > 0) ? 'inline-flex' : 'none';
      if (delBtn) delBtn.style.display = (state.allowEdit && size > 0) ? 'inline-flex' : 'none';
    }

    function openItemPrimaryAction(idx) {
      var item = currentRenderedItems[idx];
      if (!item) return;
      if (item.isDirectory) {
        loadDirectory(item.path);
        return;
      }
      var cat = getFileCategory(item);
      if (cat === 'video' || cat === 'audio') {
        openVideoModal(item);
      } else if (cat === 'image') {
        openImageModal(item);
      } else {
        openUnsupportedPreviewModal(item);
      }
    }

    window.handleCardDblClick = function(idx, event) {
      if (!isLanDesktopMode()) return;
      if (event && event.target && event.target.closest && event.target.closest('.card-select-btn, .card-actions-btn, .row-action-btn, .col-check')) {
        return;
      }
      openItemPrimaryAction(idx);
    };

    window.handleCardClick = function(idx, event) {
      if (typeof window.closeDesktopContextMenu === 'function') {
        window.closeDesktopContextMenu();
      }
      var item = currentRenderedItems[idx];
      if (!item) return;

      if (isLanDesktopMode()) {
        if (event && event.target && event.target.closest && event.target.closest('.card-select-btn, .card-actions-btn, .row-action-btn, .col-check')) {
          return;
        }
        if (event && event.detail >= 2) {
          return;
        }
        if (event && event.shiftKey && state.lastSelectedIdx >= 0) {
          state.focusedIdx = idx;
          selectRangeDesktop(state.lastSelectedIdx, idx, !!(event.ctrlKey || event.metaKey));
          return;
        }
        if (event && (event.ctrlKey || event.metaKey)) {
          if (state.selectedPaths.has(item.path)) {
            state.selectedPaths.delete(item.path);
            if (state.focusedIdx === idx) state.focusedIdx = -1;
          } else {
            state.selectedPaths.add(item.path);
            state.focusedIdx = idx;
          }
          state.lastSelectedIdx = idx;
          state.multiSelectExplicit = state.selectedPaths.size > 0;
          syncSelectionVisuals();
          return;
        }
        if (state.selectedPaths.has(item.path)) {
          state.selectedPaths.delete(item.path);
          if (state.selectedPaths.size === 0) {
            state.focusedIdx = -1;
            state.lastSelectedIdx = -1;
            state.multiSelectExplicit = false;
          } else {
            if (state.focusedIdx === idx) state.focusedIdx = -1;
            state.multiSelectExplicit = true;
          }
          syncSelectionVisuals();
          return;
        }
        state.selectedPaths.clear();
        state.selectedPaths.add(item.path);
        state.focusedIdx = idx;
        state.lastSelectedIdx = idx;
        state.multiSelectExplicit = false;
        syncSelectionVisuals();
        return;
      }

      if (typeof window.closeOpenMobileSwipeRow === 'function' && window.closeOpenMobileSwipeRow()) {
        return;
      }

      if (hasTriggeredLongPress) {
        hasTriggeredLongPress = false;
        return;
      }

      if (state.selectedPaths.size > 0) {
        toggleCardSelection(idx, event);
        return;
      }

      openItemPrimaryAction(idx);
    };
`;
