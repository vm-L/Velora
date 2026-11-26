export const lanWebCoreScripts = `function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function isLanDesktopMode() {
      return !!(typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('lan-desktop-mode'));
    }

    function isLanMobileMode() {
      return !!(typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('lan-mobile-mode'));
    }

    function getInitialViewMode() {
      try {
        if (isLanMobileMode()) {
          return localStorage.getItem('velora_lan_mobile_view') || 'list';
        }
        return localStorage.getItem('velora_lan_desktop_view') || 'grid';
      } catch (e) {
        return isLanMobileMode() ? 'list' : 'grid';
      }
    }

    // State
    var state = {
      token: localStorage.getItem('velora_lan_token') || '',
      requireAuth: false,
      allowEdit: false,
      activeMainView: 'files',
      viewMode: getInitialViewMode(),
      resources: [],
      currentResourceId: '',
      currentPath: '',
      breadcrumbPaths: [],
      items: [],
      renderedCount: 0,
      search: '',
      isSearching: false,
      searchResults: [],
      sort: 'mtime-desc',
      theme: localStorage.getItem('velora_theme') || 'light',
      selectedPaths: new Set(),
      focusedIdx: -1,
      lastSelectedIdx: -1,
      internalDragPaths: [],
      downloadStatusFilter: 'all',
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
      var list = state.isSearching ? state.searchResults.slice() : state.items.slice();

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
    var searchForm = document.getElementById('search-form');
    var searchInput = document.getElementById('search-input');
    var searchBtn = document.getElementById('search-btn');
    var clearSearchBtn = document.getElementById('clear-search-btn');
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

    function hideActionModalDom() {
      if (actionModal) actionModal.style.display = 'none';
    }

    window.closeActionModal = function(fromPopState) {
      if (fromPopState === true) {
        hideActionModalDom();
      } else if (typeof closeOverlayViaUi === 'function') {
        closeOverlayViaUi('action-modal', hideActionModalDom);
      } else {
        hideActionModalDom();
      }
    };

    window.downloadLanFile = function(encodedPath) {
      var itemPath = decodeURIComponent(encodedPath);
      window.location.href = '/download?path=' + encodeURIComponent(itemPath) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
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

    function hideCustomDialogDom() {
      var modal = document.getElementById('custom-dialog-modal');
      if (modal) modal.style.display = 'none';
    }

    window.closeCustomDialog = function(result, fromPopState) {
      if (fromPopState === true) {
        hideCustomDialogDom();
      } else if (typeof closeOverlayViaUi === 'function') {
        closeOverlayViaUi('custom-dialog', hideCustomDialogDom);
      } else {
        hideCustomDialogDom();
      }
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
        if (typeof pushOverlayHistory === 'function') {
          pushOverlayHistory('custom-dialog', function() { window.closeCustomDialog(undefined, true); });
        }
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
        if (typeof pushOverlayHistory === 'function') {
          pushOverlayHistory('custom-dialog', function() { window.closeCustomDialog(false, true); });
        }
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
        if (typeof pushOverlayHistory === 'function') {
          pushOverlayHistory('custom-dialog', function() { window.closeCustomDialog(null, true); });
        }
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
    async function restoreInitialNavigationView() {
      if (typeof parseNavHash === 'function') {
        var hashNav = parseNavHash();
        if (hashNav && (hashNav.view === 'downloads' || hashNav.view === 'pan') && typeof window.switchMainView === 'function') {
          window.switchMainView(hashNav.view, { replaceHistory: true });
        } else if (typeof pushNavHistory === 'function') {
          pushNavHistory('files', state.currentResourceId, state.currentPath, { replace: true });
        }
      }
    }

    async function init() {
      try {
        var info = await fetch('/api/info').then(function(r) { return r.json(); });
        state.requireAuth = info.requireAuth;
        state.allowEdit = info.allowEdit;

        if (state.allowEdit && newFolderBtn) {
          newFolderBtn.style.display = 'inline-flex';
        }

        if (state.requireAuth && !state.token) {
          showAuthModal();
          return;
        }

        if (state.requireAuth && logoutBtn) {
          logoutBtn.style.display = 'inline-flex';
        }

        await loadResources();
        await restoreInitialNavigationView();
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
          if (logoutBtn) logoutBtn.style.display = 'inline-flex';
          showToast('登录成功');
          await loadResources();
          await restoreInitialNavigationView();
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
`;
