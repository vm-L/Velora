export const lanWebScripts = `function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // State
    var state = {
      token: localStorage.getItem('velora_lan_token') || '',
      requireAuth: false,
      allowEdit: false,
      resources: [],
      currentResourceId: '',
      currentPath: '',
      breadcrumbPaths: [],
      items: [],
      search: '',
      sort: 'mtime-desc',
      theme: localStorage.getItem('velora_theme') || 'light',
      selectedPaths: new Set(),
      // Trimmer
      trimSegments: [],
      trimStart: 0,
      trimEnd: 0,
      trimDuration: 0,
      currentTrimPath: '',
      currentTrimName: '',
      trimStepMode: 'sec',
      // Merge
      mergeVideos: [],
      // Compress
      compressFilePath: '',
      compressFileName: '',
      compressBitrate: 2000,
      // Move
      moveSourcePath: '',
      moveSourceName: '',
      moveSourcePaths: [],
      isBatchMove: false,
      moveSelectedTarget: '',
      moveDirList: [],
      // Global Task Queue (Single Source of Truth from Main Process)
      globalActiveTask: null,
      globalTaskQueue: [],
      globalTotalCount: 0,
      queueEventSource: null,
      isTaskProgressMinimized: false
    };

    function getFilteredAndSortedItems() {
      var list = state.items.slice();
      if (state.search.trim()) {
        var q = state.search.trim().toLowerCase();
        list = list.filter(function(i) { return i.name.toLowerCase().includes(q); });
      }

      var parts = state.sort.split('-');
      var field = parts[0];
      var order = parts[1];
      var isAsc = order === 'asc';
      list.sort(function(a, b) {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        if (field === 'name') {
          var cmp = a.name.localeCompare(b.name, 'zh-CN');
          return isAsc ? cmp : -cmp;
        } else if (field === 'mtime') {
          return isAsc ? a.mtime - b.mtime : b.mtime - a.mtime;
        } else if (field === 'size') {
          return isAsc ? a.size - b.size : b.size - a.size;
        }
        return 0;
      });
      return list;
    }

    // DOM Elements
    var fileGrid = document.getElementById('file-grid');
    var resourceTabs = document.getElementById('resource-tabs');
    var breadcrumbs = document.getElementById('breadcrumbs');
    var navBackBtn = document.getElementById('nav-back-btn');
    var searchInput = document.getElementById('search-input');
    var sortSelect = document.getElementById('sort-select');
    var newFolderBtn = document.getElementById('new-folder-btn');
    var refreshBtn = document.getElementById('refresh-btn');
    var authModal = document.getElementById('auth-modal');
    var authPassword = document.getElementById('auth-password');
    var authSubmitBtn = document.getElementById('auth-submit-btn');
    var logoutBtn = document.getElementById('logout-btn');
    var actionModal = document.getElementById('action-modal');
    var actionModalTitle = document.getElementById('action-modal-title');
    var actionModalBody = document.getElementById('action-modal-body');
    var actionModalFooter = document.getElementById('action-modal-footer');

    window.closeActionModal = function() {
      if (actionModal) actionModal.style.display = 'none';
    };

    if (navBackBtn) {
      navBackBtn.addEventListener('click', function() {
        window.navigateUp();
      });
    }

    // Theme Setup
    function applyTheme(theme) {
      state.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('velora_theme', theme);
      document.getElementById('theme-icon-light').style.display = theme === 'light' ? 'block' : 'none';
      document.getElementById('theme-icon-dark').style.display = theme === 'dark' ? 'block' : 'none';
    }
    applyTheme(state.theme);
    document.getElementById('theme-btn').addEventListener('click', function(event) {
      var newTheme = state.theme === 'light' ? 'dark' : 'light';
      if (!document.startViewTransition) {
        applyTheme(newTheme);
        return;
      }

      var x = event.clientX;
      var y = event.clientY;
      if (typeof x !== 'number' || typeof y !== 'number' || (x === 0 && y === 0)) {
        var rect = this.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }

      var endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      var transition = document.startViewTransition(function() {
        applyTheme(newTheme);
      });

      transition.ready.then(function() {
        var clipPath = [
          'circle(0px at ' + x + 'px ' + y + 'px)',
          'circle(' + endRadius + 'px at ' + x + 'px ' + y + 'px)'
        ];

        document.documentElement.animate(
          { clipPath: clipPath },
          {
            duration: 400,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
            fill: 'forwards'
          }
        );
      });
    });

    // Toast (Top Staggered Notification)
    function dismissToast(el) {
      if (!el || el.classList.contains('toast-fadeout')) return;
      el.classList.add('toast-fadeout');
      setTimeout(function() {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }, 250);
    }

    function showToast(msg, duration) {
      var container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }

      var el = document.createElement('div');
      el.className = 'toast';
      el.innerText = msg;

      var stayDuration = typeof duration === 'number' ? duration : 2000;

      container.appendChild(el);

      var timer = setTimeout(function() {
        dismissToast(el);
      }, stayDuration);

      el.addEventListener('click', function() {
        clearTimeout(timer);
        dismissToast(el);
      });
    }

    // Custom Dialog Modal (Alert / Confirm / Prompt)
    var customDialogResolve = null;

    window.closeCustomDialog = function(result) {
      var modal = document.getElementById('custom-dialog-modal');
      if (modal) modal.style.display = 'none';
      if (customDialogResolve) {
        var resolve = customDialogResolve;
        customDialogResolve = null;
        resolve(result);
      }
    };

    window.confirmCustomDialog = function() {
      var input = document.getElementById('custom-dialog-input');
      var isPrompt = input && input.style.display !== 'none';
      if (isPrompt) {
        var val = input.value;
        window.closeCustomDialog(val);
      } else {
        window.closeCustomDialog(true);
      }
    };

    window.showAlert = function(options) {
      return new Promise(function(resolve) {
        var opts = typeof options === 'string' ? { message: options } : (options || {});
        customDialogResolve = function() { resolve(); };

        document.getElementById('custom-dialog-title').innerText = opts.title || '提示';
        document.getElementById('custom-dialog-message').innerText = opts.message || '';

        var input = document.getElementById('custom-dialog-input');
        input.style.display = 'none';
        input.onkeydown = null;

        var cancelBtn = document.getElementById('custom-dialog-cancel-btn');
        cancelBtn.style.display = 'none';

        var confirmBtn = document.getElementById('custom-dialog-confirm-btn');
        confirmBtn.className = 'v-btn v-btn-primary';
        confirmBtn.innerText = opts.okText || '确认';

        document.getElementById('custom-dialog-modal').style.display = 'flex';
        confirmBtn.focus();
      });
    };

    window.showConfirm = function(options) {
      return new Promise(function(resolve) {
        var opts = typeof options === 'string' ? { message: options } : (options || {});
        customDialogResolve = function(res) { resolve(!!res); };

        document.getElementById('custom-dialog-title').innerText = opts.title || '确认';
        document.getElementById('custom-dialog-message').innerText = opts.message || '';

        var input = document.getElementById('custom-dialog-input');
        input.style.display = 'none';
        input.onkeydown = null;

        var cancelBtn = document.getElementById('custom-dialog-cancel-btn');
        cancelBtn.style.display = '';
        cancelBtn.innerText = opts.cancelText || '取消';

        var confirmBtn = document.getElementById('custom-dialog-confirm-btn');
        confirmBtn.className = opts.danger ? 'v-btn v-btn-danger-soft' : 'v-btn v-btn-primary';
        confirmBtn.innerText = opts.confirmText || '确认';

        document.getElementById('custom-dialog-modal').style.display = 'flex';
        confirmBtn.focus();
      });
    };

    window.showPrompt = function(options) {
      return new Promise(function(resolve) {
        var opts = typeof options === 'string' ? { message: options } : (options || {});
        customDialogResolve = function(res) {
          if (res === null || res === false) {
            resolve(null);
          } else {
            resolve(String(res));
          }
        };

        document.getElementById('custom-dialog-title').innerText = opts.title || '输入';
        document.getElementById('custom-dialog-message').innerText = opts.message || '';

        var input = document.getElementById('custom-dialog-input');
        input.style.display = 'block';
        input.value = opts.defaultValue || '';
        input.placeholder = opts.placeholder || '';
        input.onkeydown = function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            window.confirmCustomDialog();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            window.closeCustomDialog(null);
          }
        };

        var cancelBtn = document.getElementById('custom-dialog-cancel-btn');
        cancelBtn.style.display = '';
        cancelBtn.innerText = opts.cancelText || '取消';

        var confirmBtn = document.getElementById('custom-dialog-confirm-btn');
        confirmBtn.className = 'v-btn v-btn-primary';
        confirmBtn.innerText = opts.confirmText || opts.okText || '确认';

        document.getElementById('custom-dialog-modal').style.display = 'flex';
        setTimeout(function() {
          input.focus();
          input.select();
        }, 50);
      });
    };

    window.alert = function(msg) {
      return window.showAlert(msg);
    };

    // API Helper
    async function apiFetch(url, options) {
      options = options || {};
      options.headers = options.headers || {};
      if (state.token) {
        options.headers['Authorization'] = 'Bearer ' + state.token;
      }
      var res = await fetch(url, options);
      if (res.status === 401) {
        state.token = '';
        localStorage.removeItem('velora_lan_token');
        showAuthModal();
        throw new Error('Unauthorized');
      }
      return await res.json();
    }

    // Init
    async function init() {
      try {
        var info = await fetch('/api/info').then(function(r) { return r.json(); });
        state.requireAuth = info.requireAuth;
        state.allowEdit = info.allowEdit;

        if (state.allowEdit) {
          newFolderBtn.style.display = 'inline-flex';
        }

        if (state.requireAuth && !state.token) {
          showAuthModal();
          return;
        }

        if (state.requireAuth) {
          logoutBtn.style.display = 'inline-flex';
        }

        await loadResources();
        connectTaskQueueSSE();
      } catch (err) {
        console.error('Init error:', err);
      }
    }

    function showAuthModal() {
      authModal.style.display = 'flex';
      authPassword.value = '';
      authPassword.focus();
    }

    authSubmitBtn.addEventListener('click', async function() {
      var pwd = authPassword.value.trim();
      if (!pwd) return;
      try {
        var res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        }).then(function(r) { return r.json(); });

        if (res.success && res.token) {
          state.token = res.token;
          localStorage.setItem('velora_lan_token', res.token);
          authModal.style.display = 'none';
          logoutBtn.style.display = 'inline-flex';
          showToast('登录成功');
          await loadResources();
          connectTaskQueueSSE();
        } else {
          showToast(res.error || '密码错误');
        }
      } catch (err) {
        showToast('登录校验失败');
      }
    });

    authPassword.addEventListener('keyup', function(e) {
      if (e.key === 'Enter') authSubmitBtn.click();
    });

    logoutBtn.addEventListener('click', function() {
      state.token = '';
      localStorage.removeItem('velora_lan_token');
      logoutBtn.style.display = 'none';
      showAuthModal();
    });

    async function loadResources() {
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
          renderFileGrid();
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

      return '<div class="' + cardClass + '" data-idx="' + idx + '" data-path="' + encodedPath + '" onclick="handleCardClick(' + idx + ', event)">' +
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
        fileGrid.innerHTML = '<div class="empty-state"><span>未找到文件或目录为空</span></div>';
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

    // 不支持在线预览的文件提醒与下载确认
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

    // Search & Sort Event Listeners with Debounce
    var searchDebounceTimer = null;
    searchInput.addEventListener('input', function(e) {
      var val = e.target.value;
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(function() {
        state.search = val;
        renderFileGrid();
      }, 250);
    });

    sortSelect.addEventListener('change', function(e) {
      state.sort = e.target.value;
      renderFileGrid();
    });

    refreshBtn.addEventListener('click', function() {
      loadDirectory(state.currentPath, { preserveScroll: true });
    });



    newFolderBtn.addEventListener('click', function() {
      actionModalTitle.innerText = '新建文件夹';
      actionModalBody.innerHTML = '<input type="text" id="new-folder-name" class="v-input" placeholder="请输入文件夹名称" style="width:100%;">';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" onclick="submitNewFolder()">创建</button>';
      actionModal.style.display = 'flex';
      setTimeout(function() { document.getElementById('new-folder-name').focus(); }, 50);
    });

    window.submitNewFolder = async function() {
      var name = document.getElementById('new-folder-name').value.trim();
      if (!name) return;
      try {
        var res = await apiFetch('/api/create-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentPath: state.currentPath, name: name })
        });
        if (res.success) {
          showToast('文件夹创建成功');
          closeActionModal();
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '创建失败');
        }
      } catch (err) {
        showToast('创建异常');
      }
    };

    window.openItemActions = function(encodedPath) {
      var itemPath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === itemPath; });
      if (!item) return;

      var isVideo = getFileCategory(item) === 'video';

      actionModalTitle.innerText = '管理: ' + item.name;
      var html = '<div style="display:flex; flex-direction:column; gap:8px;">';

      if (isVideo) {
        html += '<button class="v-btn v-btn-primary" onclick="closeActionModal(); openVideoEditModal(\\'' + encodedPath + '\\')">' +
          '<span>视频剪辑</span></button>';

        html += '<button class="v-btn v-btn-secondary" onclick="closeActionModal(); openVideoCompressModal(\\'' + encodedPath + '\\')">' +
          '<span>压缩视频</span></button>';
      }

      html += '<button class="v-btn v-btn-secondary" onclick="openMoveModal(\\'' + encodedPath + '\\')">移动</button>' +
        '<button class="v-btn v-btn-secondary" onclick="openRenameModal(\\'' + encodedPath + '\\')">重命名</button>' +
        '<button class="v-btn v-btn-danger-soft" onclick="openDeleteModal(\\'' + encodedPath + '\\')">删除</button>' +
        '</div>';

      actionModalBody.innerHTML = html;
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">关闭</button>';
      actionModal.style.display = 'flex';
    };

    window.openBatchMoveModal = async function() {
      var selectedList = Array.from(state.selectedPaths);
      if (selectedList.length === 0) return;

      state.isBatchMove = true;
      state.moveSourcePaths = selectedList;
      state.moveSourcePath = '';
      state.moveSourceName = '';
      state.moveSelectedTarget = '';
      state.moveDirList = [];

      actionModalTitle.innerText = '移动 (已选 ' + selectedList.length + ' 项)';
      actionModalBody.innerHTML = '<div style="display:flex; flex-direction:column; gap:12px;">' +
        '<div class="tree-toolbar">' +
        '<span class="selected-target-hint">目标目录: <strong id="move-target-label">未选择</strong></span>' +
        '<button class="v-btn v-btn-secondary" id="move-new-subfolder-btn" disabled onclick="openMoveNewSubfolderModal()" style="font-size:12px; height:28px; padding:2px 8px;">+ 新建子目录</button>' +
        '</div>' +
        '<div class="directory-tree-container" id="move-tree-container">' +
        '<div class="empty-state" style="padding:30px 10px;"><span>正在扫描目录树</span></div>' +
        '</div>' +
        '</div>';

      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" id="move-confirm-btn" disabled onclick="submitMove()">确认移动</button>';

      actionModal.style.display = 'flex';
      await loadMoveDirTree();
    };

    window.openMoveModal = async function(encodedPath, name) {
      var sourcePath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === sourcePath; });
      var finalName = name || (item ? item.name : (sourcePath.split(/[\\\\/]/).pop() || ''));

      state.isBatchMove = false;
      state.moveSourcePath = sourcePath;
      state.moveSourceName = finalName;
      state.moveSourcePaths = [];
      state.moveSelectedTarget = '';
      state.moveDirList = [];

      actionModalTitle.innerText = '移动 "' + finalName + '"';
      actionModalBody.innerHTML = '<div style="display:flex; flex-direction:column; gap:12px;">' +
        '<div class="tree-toolbar">' +
        '<span class="selected-target-hint">目标目录: <strong id="move-target-label">未选择</strong></span>' +
        '<button class="v-btn v-btn-secondary" id="move-new-subfolder-btn" disabled onclick="openMoveNewSubfolderModal()" style="font-size:12px; height:28px; padding:2px 8px;">+ 新建子目录</button>' +
        '</div>' +
        '<div class="directory-tree-container" id="move-tree-container">' +
        '<div class="empty-state" style="padding:30px 10px;"><span>正在扫描目录树</span></div>' +
        '</div>' +
        '</div>';

      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" id="move-confirm-btn" disabled onclick="submitMove()">确认移动</button>';

      actionModal.style.display = 'flex';
      await loadMoveDirTree();
    };

    async function loadMoveDirTree() {
      try {
        var res = await apiFetch('/api/dir-tree?id=' + encodeURIComponent(state.currentResourceId));
        if (res.success && res.dirList) {
          state.moveDirList = res.dirList;
          renderMoveTree();
        } else {
          document.getElementById('move-tree-container').innerHTML = '<div class="empty-state" style="padding:30px 10px;"><span>扫描失败: ' + escapeHtml(res.error || '无法获取目录') + '</span></div>';
        }
      } catch (err) {
        document.getElementById('move-tree-container').innerHTML = '<div class="empty-state" style="padding:30px 10px;"><span>扫描异常</span></div>';
      }
    }

    function renderMoveTree() {
      var container = document.getElementById('move-tree-container');
      if (!container) return;

      if (!state.moveDirList || state.moveDirList.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><span>未发现可用目录</span></div>';
        return;
      }

      var currentDir = state.currentPath.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var html = '';
      for (var i = 0; i < state.moveDirList.length; i++) {
        var item = state.moveDirList[i];
        var isSelected = state.moveSelectedTarget === item.path;
        var padLeft = item.depth * 16 + 10;
        html += '<div class="tree-node ' + (isSelected ? 'active' : '') + '" style="padding-left:' + padLeft + 'px;" onclick="selectMoveTarget(' + i + ')">' +
          '<svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
          '<span class="node-name" title="' + escapeHtml(item.path) + '">' + escapeHtml(item.name) + '</span>' +
          '</div>';
      }
      container.innerHTML = html;
    }

    window.selectMoveTarget = function(index) {
      var item = state.moveDirList[index];
      if (!item) return;

      state.moveSelectedTarget = item.path;
      var targetLabel = document.getElementById('move-target-label');
      if (targetLabel) targetLabel.innerText = item.name;

      var newSubBtn = document.getElementById('move-new-subfolder-btn');
      if (newSubBtn) newSubBtn.disabled = false;

      var currentDir = state.currentPath.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var selectedNorm = item.path.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var isSameAsCurrent = currentDir === selectedNorm;

      var confirmBtn = document.getElementById('move-confirm-btn');
      if (confirmBtn) {
        confirmBtn.disabled = isSameAsCurrent;
      }

      renderMoveTree();
    };

    window.openMoveNewSubfolderModal = async function() {
      if (!state.moveSelectedTarget) return;
      var subfolderName = await window.showPrompt({
        title: '新建子目录',
        message: '在当前所选目录下创建新子目录：',
        placeholder: '请输入文件夹名称'
      });
      if (!subfolderName || !subfolderName.trim()) return;

      apiFetch('/api/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPath: state.moveSelectedTarget, name: subfolderName.trim() })
      }).then(function(res) {
        if (res.success) {
          showToast('子目录创建成功');
          loadMoveDirTree();
        } else {
          showToast(res.error || '创建失败');
        }
      }).catch(function() {
        showToast('创建异常');
      });
    };

    window.submitMove = async function() {
      if (!state.moveSelectedTarget) return;

      var payload = {};
      if (state.isBatchMove) {
        if (!state.moveSourcePaths || state.moveSourcePaths.length === 0) return;
        payload = {
          sourcePaths: state.moveSourcePaths,
          targetDirPath: state.moveSelectedTarget
        };
      } else {
        if (!state.moveSourcePath) return;
        payload = {
          sourcePath: state.moveSourcePath,
          targetDirPath: state.moveSelectedTarget
        };
      }

      var confirmBtn = document.getElementById('move-confirm-btn');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerText = '正在移动...';
      }

      try {
        var res = await apiFetch('/api/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.success) {
          if (state.isBatchMove) {
            showToast('已成功移动 ' + (res.movedCount || state.moveSourcePaths.length) + ' 项');
            clearSelection();
          } else {
            showToast('移动成功');
          }
          closeActionModal();
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '移动失败');
        }
      } catch (err) {
        showToast('移动异常');
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerText = '确认移动';
        }
      }
    };

    window.openRenameModal = function(encodedPath, oldName) {
      var targetPath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === targetPath; });
      var finalName = oldName || (item ? item.name : (targetPath.split(/[\\\\/]/).pop() || ''));

      actionModalTitle.innerText = '重命名';
      actionModalBody.innerHTML = '<input type="text" id="rename-input" class="v-input" value="' + escapeHtml(finalName) + '" style="width:100%;">';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" onclick="submitRename(\\'' + encodedPath + '\\')">保存</button>';
      actionModal.style.display = 'flex';
      setTimeout(function() { document.getElementById('rename-input').focus(); }, 50);
    };

    window.submitRename = async function(encodedPath) {
      var targetPath = decodeURIComponent(encodedPath);
      var inputEl = document.getElementById('rename-input');
      var newName = inputEl ? inputEl.value.trim() : '';
      if (!newName) return;

      var saveBtn = actionModalFooter.querySelector('.v-btn-primary');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = '正在保存...';
      }

      try {
        var res = await apiFetch('/api/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath: targetPath, newName: newName })
        });
        if (res.success) {
          showToast('重命名成功');
          closeActionModal();
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '重命名失败');
        }
      } catch (err) {
        showToast('重命名异常');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = '保存';
        }
      }
    };

    window.openDeleteModal = function(encodedPath, isDir, name) {
      var targetPath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === targetPath; });
      var finalName = name || (item ? item.name : (targetPath.split(/[\\\\/]/).pop() || ''));
      var isDirectory = typeof isDir === 'boolean' ? isDir : (item ? item.isDirectory : false);

      actionModalTitle.innerText = '确认删除';
      actionModalBody.innerHTML = '<p style="color:var(--color-error); font-size:14px;">确定要永久删除 ' + (isDirectory ? '文件夹' : '文件') + ' "<strong>' + escapeHtml(finalName) + '</strong>" 吗？此操作不可恢复。</p>';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-danger-soft" onclick="submitDelete(\\'' + encodedPath + '\\')">确认</button>';
      actionModal.style.display = 'flex';
    };

    window.submitDelete = async function(encodedPath) {
      var targetPath = decodeURIComponent(encodedPath);
      var delBtn = actionModalFooter.querySelector('.v-btn-danger-soft');
      if (delBtn) {
        delBtn.disabled = true;
        delBtn.innerText = '正在删除...';
      }

      try {
        var res = await apiFetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath: targetPath })
        });
        if (res.success) {
          showToast('已成功删除');
          closeActionModal();
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '删除失败');
        }
      } catch (err) {
        showToast('删除异常');
      } finally {
        if (delBtn) {
          delBtn.disabled = false;
          delBtn.innerText = '确认';
        }
      }
    };

    // ==========================================
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

    // Video Merge Modal
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
    };

    window.closeVideoMergeModal = function() {
      document.getElementById('video-merge-modal').style.display = 'none';
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

    window.closeVideoCompressModal = function() {
      document.getElementById('video-compress-modal').style.display = 'none';
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
        indicator.title = '局域网连接断开，正在尝试自动重连...';
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
      var text = task.statusText || '正在处理中...';

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
        cancelBtn.innerText = '正在取消...';
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
