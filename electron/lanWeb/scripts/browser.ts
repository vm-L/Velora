export const lanWebBrowserScripts = `    async function loadResources() {
      try {
        var res = await apiFetch('/api/resources');
        if (res.success && res.resources && res.resources.length > 0) {
          state.resources = res.resources;
          renderResourceTabs();
          var target = state.resources.find(function(r) { return r.id === state.currentResourceId; }) || state.resources[0];
          selectResource(target.id);
        } else {
          fileGrid.innerHTML = '<div class="empty-state"><span>暂无挂载的本地资源</span></div>';
        }
      } catch (err) {
        console.error('Load resources error:', err);
      }
    }

    function renderResourceTabs() {
      var html = '';
      for (var i = 0; i < state.resources.length; i++) {
        var r = state.resources[i];
        var activeClass = r.id === state.currentResourceId ? 'active' : '';
        html += '<div class="resource-tab-item ' + activeClass + '" onclick="selectResource(\\'' + r.id + '\\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
          '</svg>' +
          '<span>' + escapeHtml(r.name) + '</span>' +
          '</div>';
      }
      resourceTabs.innerHTML = html;
    }

    window.selectResource = function(id) {
      var res = state.resources.find(function(r) { return r.id === id; });
      if (!res) return;
      state.currentResourceId = id;
      state.currentPath = res.path;
      if (typeof clearSearch === 'function') {
        clearSearch();
      }
      renderResourceTabs();
      loadDirectory(res.path);
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
      if (!preserveScroll) {
        fileGrid.innerHTML = '<div class="empty-state"><span>正在读取目录</span></div>';
        window.scrollTo(0, 0);
      }
      renderBreadcrumbs();

      try {
        var res = await apiFetch('/api/directory?id=' + encodeURIComponent(state.currentResourceId) + '&path=' + encodeURIComponent(path));
        if (res.success) {
          state.items = res.items || [];
          if (state.isSearching && searchInput && searchInput.value.trim()) {
            await executeSearch();
          } else {
            renderFileGrid();
          }
          if (preserveScroll) {
            window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            requestAnimationFrame(function() {
              window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            });
          }
        } else {
          fileGrid.innerHTML = '<div class="empty-state"><span>读取失败: ' + escapeHtml(res.error || '未知错误') + '</span></div>';
        }
      } catch (err) {
        fileGrid.innerHTML = '<div class="empty-state"><span>读取异常</span></div>';
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
      var res = state.resources.find(function(r) { return r.id === state.currentResourceId; });
      if (!res) return;

      var normRoot = res.path.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var normCurrent = state.currentPath.replace(/\\\\/g, '/').replace(/\\/+$/, '');

      state.breadcrumbPaths = [];

      var isAtRoot = normCurrent === normRoot;
      var navBackBtn = document.getElementById('nav-back-btn');
      if (navBackBtn) {
        navBackBtn.disabled = isAtRoot;
      }

      var isRootActive = isAtRoot ? 'active' : '';
      var html = '<span class="breadcrumb-item ' + isRootActive + '" onclick="goToResourceRoot()">' +
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
            html += '<span class="breadcrumb-sep">/</span>';
            html += '<span class="breadcrumb-item ' + itemClass + '" ' + clickAttr + '>' + escapeHtml(part) + '</span>';
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

    function getCategoryIcon(cat) {
      if (cat === 'folder') {
        return '<svg class="file-svg folder-color" width="44" height="44" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
      } else if (cat === 'video') {
        return '<svg class="file-svg video-color" width="44" height="44" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>';
      } else if (cat === 'audio') {
        return '<svg class="file-svg audio-color" width="44" height="44" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
      } else if (cat === 'image') {
        return '<svg class="file-svg image-color" width="44" height="44" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
      } else if (cat === 'code') {
        return '<svg class="file-svg code-color" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
      }
      return '<svg class="file-svg doc-color" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
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

    function buildCardHtml(item, idx) {
      var cat = getFileCategory(item);
      var iconSvg = getCategoryIcon(cat);
      var metaSize = item.isDirectory ? '文件夹' : formatBytes(item.size);
      var encodedPath = encodeURIComponent(item.path);
      var timeStr = formatTime(item.mtime);
      var extBadge = item.isDirectory ? '' : '<span class="ext-badge">' + (item.ext || 'FILE').toUpperCase() + '</span>';
      var recentBadge = isRecentFile(item) ? '<span class="recent-badge">NEW</span>' : '';
      var isSelected = state.selectedPaths.has(item.path);
      var cardClass = 'file-card' + (isSelected ? ' selected' : '') + (state.allowEdit ? ' has-actions' : '');

      return '<div class="' + cardClass + '" data-idx="' + idx + '" data-path="' + encodedPath + '" title="' + escapeHtml(item.path) + '" onclick="handleCardClick(' + idx + ', event)">' +
        (state.allowEdit ? '<div class="card-select-btn" onclick="event.stopPropagation(); toggleCardSelection(' + idx + ', event)">✓</div>' : '') +
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
        (state.allowEdit ? '<button class="card-actions-btn" onclick="event.stopPropagation(); openItemActions(\\'' + encodedPath + '\\')">⋮</button>' : '') +
        '</div>';
    }

    function renderFileGrid() {
      currentRenderedItems = getFilteredAndSortedItems();

      if (gridSentinelObserver) {
        gridSentinelObserver.disconnect();
        gridSentinelObserver = null;
      }

      if (currentRenderedItems.length === 0) {
        var emptyMsg = state.isSearching ? '未找到匹配的文件或目录' : '未找到文件或目录为空';
        fileGrid.innerHTML = '<div class="empty-state"><span>' + emptyMsg + '</span></div>';
        state.renderedCount = 0;
        return;
      }

      state.renderedCount = Math.min(GRID_BATCH_SIZE, currentRenderedItems.length);
      var html = '';
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
      if (!currentRenderedItems || state.renderedCount >= currentRenderedItems.length) return;

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
      var cards = container.querySelectorAll('.file-card:not([data-touch-bound])');
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
      if (e.touches.length !== 1) return;
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
        if (activeTouchTimer) {
          clearTimeout(activeTouchTimer);
          activeTouchTimer = null;
        }
        activeTouchCard.classList.remove('pressing');
        activeTouchCard = null;
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
      if (activeTouchTimer) {
        clearTimeout(activeTouchTimer);
        activeTouchTimer = null;
      }
      if (activeTouchCard) {
        activeTouchCard.classList.remove('pressing');
        activeTouchCard = null;
      }
    }

    window.toggleCardSelection = function(idx, event) {
      if (event) event.stopPropagation();
      var item = currentRenderedItems[idx];
      if (!item) return;

      var wasSelected = state.selectedPaths.has(item.path);
      if (wasSelected) {
        state.selectedPaths.delete(item.path);
      } else {
        state.selectedPaths.add(item.path);
      }

      var cardEl = fileGrid.querySelector('.file-card[data-idx="' + idx + '"]');
      if (cardEl) {
        cardEl.classList.toggle('selected', !wasSelected);
      }

      updateMultiSelectBar();
    };

    window.clearSelection = function() {
      state.selectedPaths.clear();
      var selectedEls = fileGrid.querySelectorAll('.file-card.selected');
      for (var i = 0; i < selectedEls.length; i++) {
        selectedEls[i].classList.remove('selected');
      }
      updateMultiSelectBar();
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
        var allCards = fileGrid.querySelectorAll('.file-card');
        for (var i = 0; i < allCards.length; i++) {
          allCards[i].classList.add('selected');
        }
        updateMultiSelectBar();
      }
    };

    function updateMultiSelectBar() {
      var bar = document.getElementById('multi-select-bar');
      var countEl = document.getElementById('multi-select-count');
      var mergeBtn = document.getElementById('batch-merge-btn');
      var compressBtn = document.getElementById('batch-compress-btn');
      var moveBtn = document.getElementById('batch-move-btn');
      var allBtn = document.getElementById('batch-select-all-btn');

      var size = state.selectedPaths.size;
      if (size === 0) {
        bar.style.display = 'none';
        document.body.classList.remove('is-selecting');
        return;
      }

      document.body.classList.add('is-selecting');
      bar.style.display = 'flex';
      countEl.innerText = '已选 ' + size + ' 项';

      if (allBtn && currentRenderedItems.length > 0) {
        var isAllSelected = currentRenderedItems.every(function(item) {
          return state.selectedPaths.has(item.path);
        });
        allBtn.innerText = isAllSelected ? '取消全选' : '全选';
      }

      var selectedItems = state.items.filter(function(i) { return state.selectedPaths.has(i.path); });
      var videoItems = selectedItems.filter(function(i) { return getFileCategory(i) === 'video'; });

      if (state.allowEdit && videoItems.length >= 2) {
        mergeBtn.style.display = 'inline-flex';
      } else {
        mergeBtn.style.display = 'none';
      }

      if (state.allowEdit && videoItems.length > 0) {
        compressBtn.style.display = 'inline-flex';
      } else {
        compressBtn.style.display = 'none';
      }

      if (state.allowEdit && size > 0) {
        if (moveBtn) moveBtn.style.display = 'inline-flex';
      } else {
        if (moveBtn) moveBtn.style.display = 'none';
      }
    }

    window.handleCardClick = function(idx, event) {
      if (hasTriggeredLongPress) {
        hasTriggeredLongPress = false;
        return;
      }

      var list = currentRenderedItems;
      var item = list[idx];
      if (!item) return;

      if (state.selectedPaths.size > 0) {
        toggleCardSelection(idx, event);
        return;
      }

      if (item.isDirectory) {
        loadDirectory(item.path);
      } else {
        var cat = getFileCategory(item);
        if (cat === 'video' || cat === 'audio') {
          openVideoModal(item);
        } else if (cat === 'image') {
          openImageModal(item);
        } else {
          openUnsupportedPreviewModal(item);
        }
      }
    };
`;
