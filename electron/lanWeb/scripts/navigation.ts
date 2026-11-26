export const lanWebNavigationScripts = `    // =========================================================================
    // Navigation History Stack, Overlay Stack & URL Hash Sync
    // =========================================================================
    var pendingBackSkips = 0;
    var activeOverlayStack = [];

    function parseNavHash(hashStr) {
      var raw = String(hashStr !== undefined ? hashStr : (window.location && window.location.hash) || '');
      raw = raw.replace(/^#/, '');
      var out = { view: '', res: '', path: '' };
      if (!raw) return out;
      var parts = raw.split('&');
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split('=');
        if (kv.length < 2) continue;
        var k = kv[0];
        var v = kv.slice(1).join('=');
        try {
          v = decodeURIComponent(v);
        } catch (e) {}
        if (k === 'view' || k === 'res' || k === 'path') {
          out[k] = v;
        }
      }
      return out;
    }

    function buildNavHash(viewName, resId, dirPath) {
      var parts = [];
      parts.push('view=' + encodeURIComponent(viewName || 'files'));
      if (resId) parts.push('res=' + encodeURIComponent(resId));
      if (dirPath) parts.push('path=' + encodeURIComponent(dirPath));
      return '#' + parts.join('&');
    }

    function pushNavHistory(viewName, resId, dirPath, options) {
      options = options || {};
      var v = viewName || state.activeMainView || 'files';
      var r = resId !== undefined ? resId : (state.currentResourceId || '');
      var p = dirPath !== undefined ? dirPath : (state.currentPath || '');
      var hash = buildNavHash(v, r, p);
      var navState = { veloraNav: true, view: v, res: r, path: p };
      if (window.history && window.history.pushState) {
        try {
          if (options.replace) {
            window.history.replaceState(navState, '', hash);
          } else {
            var cur = window.history.state;
            if (cur && cur.veloraNav && cur.view === v && cur.res === r && cur.path === p && !cur.veloraOverlay) {
              return;
            }
            window.history.pushState(navState, '', hash);
          }
        } catch (e) {}
      }
    }

    function pushOverlayHistory(overlayKey, closeFn) {
      if (!overlayKey || typeof closeFn !== 'function') return;
      var existIdx = -1;
      for (var i = 0; i < activeOverlayStack.length; i++) {
        if (activeOverlayStack[i].key === overlayKey) {
          existIdx = i;
          break;
        }
      }
      if (existIdx >= 0) {
        activeOverlayStack.splice(existIdx, 1);
        activeOverlayStack.push({ key: overlayKey, closeFn: closeFn });
        if (window.history && window.history.state && window.history.state.veloraOverlay === overlayKey) {
          return;
        }
      } else {
        activeOverlayStack.push({ key: overlayKey, closeFn: closeFn });
      }

      if (window.history && window.history.pushState) {
        try {
          var cur = window.history.state || {};
          var nextState = {
            veloraNav: true,
            view: state.activeMainView || cur.view || 'files',
            res: state.currentResourceId || cur.res || '',
            path: state.currentPath || cur.path || '',
            veloraOverlay: overlayKey
          };
          window.history.pushState(nextState, '', window.location ? window.location.hash : '');
        } catch (e) {}
      }
    }

    function removeOverlayFromStack(overlayKey) {
      for (var i = activeOverlayStack.length - 1; i >= 0; i--) {
        if (activeOverlayStack[i].key === overlayKey) {
          activeOverlayStack.splice(i, 1);
          return true;
        }
      }
      return false;
    }

    function closeOverlayViaUi(overlayKey, domCloseFn) {
      var removed = removeOverlayFromStack(overlayKey);
      if (typeof domCloseFn === 'function') {
        domCloseFn();
      }
      if (removed && window.history && window.history.state && window.history.state.veloraOverlay === overlayKey) {
        pendingBackSkips++;
        try {
          window.history.back();
        } catch (e) {
          pendingBackSkips = Math.max(0, pendingBackSkips - 1);
        }
      }
    }

    function handleNavPopState(event) {
      if (pendingBackSkips > 0) {
        pendingBackSkips--;
        return;
      }

      if (activeOverlayStack.length > 0) {
        var top = activeOverlayStack.pop();
        if (top && typeof top.closeFn === 'function') {
          try {
            top.closeFn(true);
          } catch (e) {}
        }
        return;
      }

      var target = (event && event.state && event.state.veloraNav)
        ? event.state
        : parseNavHash(window.location ? window.location.hash : '');

      var nextView = target.view || 'files';
      if (typeof window.switchMainView === 'function' && nextView !== state.activeMainView) {
        window.switchMainView(nextView, { fromPopState: true });
      }

      if (nextView === 'files') {
        if (target.res && target.res !== state.currentResourceId && typeof window.selectResource === 'function') {
          window.selectResource(target.res, { fromPopState: true, targetPath: target.path });
        } else if (target.path && target.path !== state.currentPath && typeof loadDirectory === 'function') {
          loadDirectory(target.path, { fromPopState: true });
        }
      }
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('popstate', handleNavPopState);
    }
`;
