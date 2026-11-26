/**
 * 阶段 3 局域网双端分离、流式上传与远程控制 HTTP 端到端测试：
 * 1. deviceDetector: 桌面/平板/手机 UA、Sec-CH-UA-Mobile 与 Cookie 偏好覆盖规则
 * 2. lanWeb 模板校验: /desktop 与 /m HTML 结构完整性、无废弃连接状态标签与目录选择器、内联 JS 零语法错误
 * 3. LanServer 真实 HTTP 实测:
 *    - GET / 按设备自动 302 分流至 /desktop 与 /m
 *    - GET /m?prefer=1 下发对应入口并写入 Cookie
 *    - POST /api/upload 流式上传（只读 403、防越界 403、同名自动编号、FS 变更通知）
 *    - GET /api/downloads + POST /api/downloads/add（支持缺省自动采用桌面端默认分类目录）+ POST /api/downloads/action
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, 'tmp', `stage3-test-${Date.now()}`);
const esbuildBin = path.join(rootDir, 'node_modules', '.bin', 'esbuild');

function bundleToCjs(entryPath, outName, extraArgs = []) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const outFile = path.join(tmpDir, outName);
  execFileSync(
    esbuildBin,
    [
      entryPath,
      '--bundle',
      '--platform=node',
      '--format=cjs',
      ...extraArgs,
      '--outfile=' + outFile
    ],
    { cwd: rootDir, stdio: 'pipe' }
  );
  return outFile;
}

function httpRequest(port, method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

async function runTests() {
  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. deviceDetector
    const { detectLanDeviceView } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanServer/deviceDetector.ts'), 'deviceDetector.cjs')
    );
    assert.strictEqual(detectLanDeviceView({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0' }), 'desktop');
    assert.strictEqual(detectLanDeviceView({ 'user-agent': 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' }), 'desktop');
    assert.strictEqual(detectLanDeviceView({ 'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-X910) Chrome/130.0 Safari/537.36' }), 'desktop');
    assert.strictEqual(detectLanDeviceView({ 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148' }), 'mobile');
    assert.strictEqual(detectLanDeviceView({ 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36' }), 'mobile');
    assert.strictEqual(detectLanDeviceView({ 'sec-ch-ua-mobile': '?1', 'user-agent': 'Mozilla/5.0 Chrome/130.0' }), 'mobile');
    assert.strictEqual(detectLanDeviceView({ cookie: 'velora_lan_view=desktop', 'user-agent': 'iPhone Mobile' }), 'desktop');
    assert.strictEqual(detectLanDeviceView({ cookie: 'velora_lan_view=mobile', 'user-agent': 'Windows NT 10.0' }), 'mobile');
    console.log('[PASS] 1. deviceDetector 设备与偏好分流规则校验');

    // 2. lanWeb 模板 + JS 语法校验
    const { getLanDesktopHtml, getLanMobileHtml } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanWeb/index.ts'), 'lanWeb.cjs')
    );
    const desktopHtml = getLanDesktopHtml();
    const mobileHtml = getLanMobileHtml();

    assert.ok(desktopHtml.includes('class="lan-desktop-mode"'));
    assert.ok(desktopHtml.includes('desktop-sidebar'));
    assert.ok(desktopHtml.includes('desktop-drop-overlay'));
    assert.ok(desktopHtml.includes('id="view-mode-btn"'));
    assert.ok(desktopHtml.includes('id="desktop-context-menu"'));
    assert.ok(desktopHtml.includes('id="desktop-marquee-box"'));
    assert.ok(desktopHtml.includes('id="batch-delete-btn"'));
    assert.ok(desktopHtml.includes('id="remote-dl-filter-tabs"'));
    assert.ok(desktopHtml.includes('id="image-prev-btn"'));
    assert.ok(desktopHtml.includes('class="video-edit-modal-content desktop-d2-workbench"'));
    assert.ok(desktopHtml.includes('class="trim-shortcuts-popover"'));
    assert.ok(desktopHtml.includes('id="trim-step-prev"'));
    assert.ok(desktopHtml.includes('id="trim-step-next"'));
    assert.ok(desktopHtml.includes('id="trim-modifier-badge"'));
    assert.strictEqual(desktopHtml.includes('id="trim-tier-switch"'), false);
    assert.strictEqual(desktopHtml.includes('id="mobile-select-bar"'), false);

    assert.ok(mobileHtml.includes('class="lan-mobile-mode"'));
    assert.ok(mobileHtml.includes('mobile-bottom-nav'));
    assert.ok(mobileHtml.includes('id="mobile-select-bar"'));
    assert.ok(mobileHtml.includes('id="mobile-search-toggle-btn"'));
    assert.ok(mobileHtml.includes('id="mobile-open-dl-sheet-btn"'));
    assert.ok(mobileHtml.includes('id="pan-paste-parse-btn"'));
    assert.ok(mobileHtml.includes('class="video-edit-modal-content mobile-s3-workbench"'));
    assert.ok(mobileHtml.includes('id="trim-tier-switch"'));
    assert.ok(mobileHtml.includes('粗略 1/5 m'));
    assert.ok(mobileHtml.includes('普通 5/10 s'));
    assert.ok(mobileHtml.includes('精细 0.1/1 s'));
    assert.ok(mobileHtml.includes('id="trim-export-sheet"'));
    assert.strictEqual(mobileHtml.includes('id="trim-move-prev-btn"'), false);
    assert.strictEqual(mobileHtml.includes('id="trim-move-next-btn"'), false);
    assert.strictEqual(mobileHtml.includes('id="desktop-context-menu"'), false);
    assert.strictEqual(mobileHtml.includes('id="desktop-marquee-box"'), false);
    assert.strictEqual(mobileHtml.includes('class="video-edit-modal-content desktop-d2-workbench"'), false);
    assert.ok(mobileHtml.includes('.segmented-control.mobile-s3-tier-switch'));
    assert.strictEqual(mobileHtml.includes('step-inner'), false);
    // UI 回归防退化：无废弃连接状态标签、无远程下载/网盘目录选择框、全文档零重复 DOM ID
    assert.strictEqual(desktopHtml.includes('id="network-indicator"'), false);
    assert.strictEqual(mobileHtml.includes('id="network-indicator"'), false);
    assert.strictEqual(desktopHtml.includes('id="dl-save-dir"'), false);
    assert.strictEqual(desktopHtml.includes('id="pan-download-dir"'), false);

    for (const [label, html] of [['desktop', desktopHtml], ['mobile', mobileHtml]]) {
      const m = html.match(/<script>([\s\S]*?)<\/script>/);
      assert.ok(m && m[1], `${label} HTML 应包含内联脚本`);
      new vm.Script(m[1], { filename: `lan-${label}.js` });

      const bodyHtml = html.replace(/<script>[\s\S]*?<\/script>/g, '');
      const seenIds = new Set();
      for (const match of bodyHtml.matchAll(/\bid="([^"]+)"/g)) {
        const domId = match[1];
        assert.strictEqual(seenIds.has(domId), false, `${label} HTML 存在重复 DOM id: ${domId}`);
        seenIds.add(domId);
      }
    }

    // 2b. lanWebTrimmerScripts 核心时间码、桌面端修饰键步长与移动端 S3 三档配置 VM 实测
    const { lanWebTrimmerScripts } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanWeb/scripts/trimmer.ts'), 'lanTrimmer.cjs')
    );
    const trimmerToasts = [];
    const mockListEl = { innerHTML: '', scrollTop: 0, scrollHeight: 420 };
    const trimmerSandbox = {
      window: { addEventListener: () => {}, location: { origin: 'http://127.0.0.1:8899' } },
      document: {
        body: { classList: { contains: () => false } },
        addEventListener: () => {},
        getElementById: (id) => (id === 'trimmer-segments-list' ? mockListEl : null)
      },
      localStorage: { getItem: () => null, setItem: () => {} },
      state: { trimDuration: 0, trimSegments: [], selectedSegmentIndex: 0, items: [] },
      showToast: (msg) => trimmerToasts.push(msg),
      apiFetch: async () => ({ success: true }),
      console
    };
    vm.createContext(trimmerSandbox);
    vm.runInContext(
      lanWebTrimmerScripts + '\n__exports = { formatTimeSec, parseTimeSec, resolveDesktopStepByModifiers, MOBILE_TIER_CONFIGS };',
      trimmerSandbox
    );
    const trimmerApi = trimmerSandbox.__exports;
    assert.strictEqual(trimmerApi.formatTimeSec(75.5), '01:15.5');
    trimmerSandbox.state.trimDuration = 5400;
    assert.strictEqual(trimmerApi.formatTimeSec(75.5), '00:01:15.5');
    assert.strictEqual(trimmerApi.parseTimeSec('01:24:18.4'), 5058.4);
    assert.strictEqual(trimmerApi.parseTimeSec('12:34.5'), 754.5);
    assert.strictEqual(trimmerApi.parseTimeSec('bad'), null);
    assert.strictEqual(trimmerApi.resolveDesktopStepByModifiers({}).step, 1);
    assert.strictEqual(trimmerApi.resolveDesktopStepByModifiers({ altKey: true }).step, 0.1);
    assert.strictEqual(trimmerApi.resolveDesktopStepByModifiers({ ctrlKey: true }).step, 10);
    assert.strictEqual(trimmerApi.resolveDesktopStepByModifiers({ metaKey: true }).step, 10);
    assert.strictEqual(trimmerApi.resolveDesktopStepByModifiers({ shiftKey: true }).step, 60);
    assert.deepStrictEqual(
      Array.from(trimmerApi.MOBILE_TIER_CONFIGS.coarse, (x) => x.delta),
      [-300, -60, 60, 300]
    );
    assert.deepStrictEqual(
      Array.from(trimmerApi.MOBILE_TIER_CONFIGS.normal, (x) => x.delta),
      [-10, -5, 5, 10]
    );
    assert.deepStrictEqual(
      Array.from(trimmerApi.MOBILE_TIER_CONFIGS.fine, (x) => x.delta),
      [-1, -0.1, 0.1, 1]
    );
    // 新增片段静默无 Toast，自动滚动到底部，且移动端每行自带上下移按钮
    trimmerSandbox.window.addNewSegment();
    trimmerSandbox.window.addNewSegment();
    assert.strictEqual(trimmerToasts.length, 0);
    assert.strictEqual(mockListEl.scrollTop, 420);
    assert.ok(mockListEl.innerHTML.includes('moveSegmentAt(0, -1)'));
    assert.ok(mockListEl.innerHTML.includes('moveSegmentAt(1, 1)'));

    // 2c. 校验模态框防滚动穿透脚本允许桌面端 D2 与移动端 S3 片段列表正常滚轮/触摸滚动
    const { lanWebPreviewAndSearchScripts } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanWeb/scripts/previewAndSearch.ts'), 'lanPreviewScroll.cjs')
    );
    const docListeners = {};
    const scrollSandbox = {
      window: {
        location: { origin: 'http://127.0.0.1:8899' },
        scrollY: 0,
        scrollTo: () => {},
        getComputedStyle: (el) => ({ overflowY: el._overflowY || 'visible' })
      },
      document: {
        body: {},
        documentElement: { scrollTop: 0 },
        addEventListener: (ev, fn) => {
          docListeners[ev] = docListeners[ev] || [];
          docListeners[ev].push(fn);
        },
        getElementById: () => ({ innerText: '', style: {}, className: '', addEventListener: () => {} })
      },
      requestAnimationFrame: () => {},
      localStorage: { getItem: () => null, setItem: () => {} },
      state: { token: '' },
      showToast: () => {},
      escapeHtml: (s) => s,
      formatBytes: (n) => String(n),
      closeActionModal: () => {},
      actionModalTitle: {},
      actionModalBody: {},
      actionModalFooter: {},
      actionModal: { style: {} },
      currentRenderedItems: [],
      getFileCategory: () => 'video',
      renderGrid: () => {},
      searchForm: null,
      searchInput: null,
      searchBtn: null,
      clearSearchBtn: null,
      sortSelect: { addEventListener: () => {} },
      refreshBtn: { addEventListener: () => {} }
    };
    vm.createContext(scrollSandbox);
    vm.runInContext(lanWebPreviewAndSearchScripts, scrollSandbox);

    const mockModal = { nodeType: 1, style: { display: 'flex' }, parentElement: scrollSandbox.document.body };
    const makeScrollList = (cls) => ({
      nodeType: 1,
      _overflowY: 'auto',
      scrollHeight: 600,
      clientHeight: 240,
      scrollTop: 50,
      parentElement: mockModal,
      closest: (sel) => (sel === '.modal-overlay' ? mockModal : (sel.includes(cls) ? true : null))
    });

    for (const cls of ['.desktop-d2-segments-list', '.mobile-s3-segments-list']) {
      const listNode = makeScrollList(cls);
      const childNode = {
        nodeType: 1,
        scrollHeight: 60,
        clientHeight: 60,
        parentElement: listNode,
        closest: (sel) => (sel === '.modal-overlay' ? mockModal : (sel.includes(cls) ? listNode : null))
      };

      let wheelPrevented = false;
      docListeners.wheel.forEach((fn) =>
        fn({ target: childNode, deltaY: 40, cancelable: true, preventDefault: () => { wheelPrevented = true; } })
      );
      assert.strictEqual(wheelPrevented, false, `${cls} 中间位置滚轮不应被拦截`);

      let touchPrevented = false;
      docListeners.touchstart.forEach((fn) => fn({ touches: [{ clientY: 300 }] }));
      docListeners.touchmove.forEach((fn) =>
        fn({ target: childNode, touches: [{ clientY: 250 }], cancelable: true, preventDefault: () => { touchPrevented = true; } })
      );
      assert.strictEqual(touchPrevented, false, `${cls} 中间位置触摸滑动不应被拦截`);
    }

    // 非滚动区域仍应阻断穿透
    const nonScrollNode = {
      nodeType: 1,
      scrollHeight: 40,
      clientHeight: 40,
      parentElement: mockModal,
      closest: (sel) => (sel === '.modal-overlay' ? mockModal : null)
    };
    let blockedNonScroll = false;
    docListeners.wheel.forEach((fn) =>
      fn({ target: nonScrollNode, deltaY: 40, cancelable: true, preventDefault: () => { blockedNonScroll = true; } })
    );
    assert.strictEqual(blockedNonScroll, true, '非滚动区域滚轮应阻止背景穿透');

    // 2d. 校验 navigation.ts 历史栈、Hash 解析与浮层逐层关闭（防 history.back 重入）
    const { lanWebNavigationScripts } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanWeb/scripts/navigation.ts'), 'lanNav.cjs')
    );
    const historyStack = [{ state: null, hash: '' }];
    let historyBackCalls = 0;
    let navSandbox;
    const listenersMap = {};
    navSandbox = {
      window: {
        location: { hash: '#view=files&res=res1&path=%2Fmedia%2FMovies' },
        history: {
          get state() {
            return historyStack[historyStack.length - 1].state;
          },
          pushState: (st, _t, url) => {
            if (url !== undefined) navSandbox.window.location.hash = url;
            historyStack.push({ state: st, hash: url || '' });
          },
          replaceState: (st, _t, url) => {
            if (url !== undefined) navSandbox.window.location.hash = url;
            historyStack[historyStack.length - 1] = { state: st, hash: url || '' };
          },
          back: () => {
            historyBackCalls++;
            if (historyStack.length > 1) {
              historyStack.pop();
              const cur = historyStack[historyStack.length - 1];
              (listenersMap.popstate || []).forEach((fn) => fn({ state: cur.state }));
            }
          }
        },
        addEventListener: (ev, fn) => {
          listenersMap[ev] = listenersMap[ev] || [];
          listenersMap[ev].push(fn);
        },
        switchMainView: () => {},
        selectResource: () => {}
      },
      state: { activeMainView: 'files', currentResourceId: 'res1', currentPath: '/media/Movies' },
      loadDirectory: () => {},
      console
    };
    vm.createContext(navSandbox);
    vm.runInContext(
      lanWebNavigationScripts + '\n__navExports = { parseNavHash, pushNavHistory, pushOverlayHistory, closeOverlayViaUi };',
      navSandbox
    );
    const navApi = navSandbox.__navExports;
    assert.deepStrictEqual(Object.assign({}, navApi.parseNavHash('#view=downloads&res=r1&path=%2Fd%2Fsub')), {
      view: 'downloads',
      res: 'r1',
      path: '/d/sub'
    });
    let closedBottom = 0;
    let closedTop = 0;
    navApi.pushOverlayHistory('video-modal', () => { closedBottom++; });
    navApi.pushOverlayHistory('action-modal', () => { closedTop++; });
    // 通过浏览器 back 先关闭顶层，不会连带关掉下层
    navSandbox.window.history.back();
    assert.strictEqual(closedTop, 1);
    assert.strictEqual(closedBottom, 0);
    // 通过 UI 按钮关闭底层，应回退 history 且不触发 popstate 二次重入回调
    navApi.closeOverlayViaUi('video-modal', () => { closedBottom++; });
    assert.strictEqual(closedBottom, 1);
    assert.strictEqual(historyBackCalls, 2);

    // 2e. 校验 desktopInteractions 右键菜单策略与 remoteScripts 下载状态筛选
    const { lanWebDesktopInteractionsScripts } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanWeb/scripts/desktopInteractions.ts'), 'lanDeskInt.cjs')
    );
    const deskSandbox = {
      window: { addEventListener: () => {}, innerWidth: 1280, innerHeight: 800 },
      document: {
        addEventListener: () => {},
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
      },
      fileGrid: null,
      state: { activeMainView: 'files', allowEdit: false, selectedPaths: new Set(), items: [], internalDragPaths: [] },
      getFileCategory: (i) => (i.isDirectory ? 'folder' : 'video'),
      console
    };
    vm.createContext(deskSandbox);
    vm.runInContext(
      lanWebDesktopInteractionsScripts + '\n__deskExports = { buildDesktopContextMenuItems };',
      deskSandbox
    );
    const singleReadonlyMenu = deskSandbox.__deskExports.buildDesktopContextMenuItems({
      type: 'single',
      allowEdit: false,
      item: { name: 'a.mp4', isDirectory: false },
      category: 'video'
    });
    assert.ok(singleReadonlyMenu.some((m) => m.label === '下载'));
    assert.strictEqual(singleReadonlyMenu.some((m) => m.label === '删除'), false);

    const { lanWebRemoteScripts } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanWeb/shared/remoteScripts.ts'), 'lanRemote.cjs')
    );
    const remSandbox = {
      window: { addEventListener: () => {}, location: { href: '' } },
      document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
      state: { allowEdit: true, remoteDownloads: [] },
      console
    };
    vm.createContext(remSandbox);
    vm.runInContext(
      lanWebRemoteScripts + '\n__remExports = { filterRemoteDownloadTasks };',
      remSandbox
    );
    const sampleTasks = [
      { id: '1', status: 'downloading' },
      { id: '2', status: 'paused' },
      { id: '3', status: 'completed' },
      { id: '4', status: 'error' }
    ];
    assert.strictEqual(remSandbox.__remExports.filterRemoteDownloadTasks(sampleTasks, 'all').length, 4);
    assert.strictEqual(remSandbox.__remExports.filterRemoteDownloadTasks(sampleTasks, 'active').length, 2);
    assert.strictEqual(remSandbox.__remExports.filterRemoteDownloadTasks(sampleTasks, 'completed').length, 1);
    assert.strictEqual(remSandbox.__remExports.filterRemoteDownloadTasks(sampleTasks, 'error').length, 1);

    // 2f. 校验双端 Velora 瓷器配色规范、复选框非纯黑、网盘复选框与桌面端无 ⋮ 按钮 / 无重复弹窗
    for (const [label, html] of [['desktop', desktopHtml], ['mobile', mobileHtml]]) {
      const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
      assert.ok(styleMatch && styleMatch[1], `${label} HTML 应包含内联样式`);
      const css = styleMatch[1];

      assert.strictEqual(css.includes('#64748b'), false, `${label} 样式不应包含偏离色板的 #64748b`);
      assert.strictEqual(css.includes('--bg-surface-rgb'), false, `${label} 样式不应包含未定义的 --bg-surface-rgb`);
      assert.ok(css.includes('.pan-parse-row input[type="checkbox"]:checked'), `${label} 网盘列表复选框应接入瓷器样式`);

      const pickRuleWithBg = (re) => {
        const blocks = Array.from(css.matchAll(re), (m) => m[1]);
        assert.ok(blocks.length > 0, `${label} 缺少目标样式规则: ${re}`);
        const bgBlock = blocks.find((b) => b.includes('background')) || blocks[blocks.length - 1];
        return bgBlock;
      };

      const progressRule = pickRuleWithBg(/^[ \t]*\.progress-bar-fill\s*\{([^}]*)\}/gm);
      assert.strictEqual(progressRule.includes('#3b82f6'), false, `${label} .progress-bar-fill 不应使用偏离色板蓝色渐变`);

      for (const selectorRe of [
        /^[ \t]*\.file-card\.selected \.card-select-btn\s*\{([^}]*)\}/gm,
        /^[ \t]*\.resource-tab-item\.active\s*\{([^}]*)\}/gm,
        /^[ \t]*\.nav-badge-count\s*\{([^}]*)\}/gm,
        /^[ \t]*\.capsule-badge\s*\{([^}]*)\}/gm
      ]) {
        const rule = pickRuleWithBg(selectorRe);
        assert.strictEqual(
          /background:\s*var\(--color-accent\)/.test(rule),
          false,
          `${label} ${selectorRe} 不应使用纯黑 --color-accent 作为背景填充`
        );
      }
    }

    const desktopCss = desktopHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
    const desktopCtxMenuMatch = desktopCss.match(/^[ \t]*\.desktop-context-menu\s*\{([^}]*)\}/m);
    assert.ok(desktopCtxMenuMatch && desktopCtxMenuMatch[1].includes('z-index: 980'), '桌面右键菜单层级应低于模态框(1000)');
    assert.strictEqual(
      /^[ \t]*\.desktop-list-row\.selected \.list-check-box[\s\S]*?background:\s*var\(--color-accent\)/m.test(desktopCss),
      false,
      '桌面端列表勾选框不应使用纯黑填充'
    );
    for (const noDarkBorderRe of [
      /^[ \t]*\.file-card\.selected\s*\{[^}]*border-color:\s*var\(--color-accent\)/m,
      /^[ \t]*\.file-card\.selected \.card-select-btn\s*\{[^}]*border-color:\s*var\(--color-accent\)/m,
      /^[ \t]*\.desktop-list-row\.selected \.list-check-box[\s\S]*?border-color:\s*var\(--color-accent\)/m
    ]) {
      assert.strictEqual(noDarkBorderRe.test(desktopCss), false, `桌面端选中态不应使用黑边: ${noDarkBorderRe}`);
    }

    const mobileCss = mobileHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.strictEqual(
      /^[ \t]*\.mobile-list-row-wrap\.selected \.mobile-row-check\s*\{[^}]*background:\s*var\(--color-accent\)/m.test(mobileCss),
      false,
      '移动端列表勾选框不应使用纯黑填充'
    );
    for (const noDarkBorderRe of [
      /^[ \t]*\.mobile-list-row-wrap\.selected\s*\{[^}]*border-color:\s*var\(--color-accent\)/m,
      /^[ \t]*\.mobile-list-row-wrap\.selected \.mobile-row-check\s*\{[^}]*border-color:\s*var\(--color-accent\)/m
    ]) {
      assert.strictEqual(noDarkBorderRe.test(mobileCss), false, `移动端选中态不应使用黑边: ${noDarkBorderRe}`);
    }

    const { lanWebBrowserScripts } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanWeb/scripts/browser.ts'), 'lanBrowser.cjs')
    );
    const { lanWebFileActionsScripts } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanWeb/scripts/fileActions.ts'), 'lanFileActions.cjs')
    );
    let isDesktopFlag = true;
    const browserSandbox = {
      window: { closeDesktopContextMenu: () => {} },
      document: {
        body: { classList: { toggle: () => {}, add: () => {}, remove: () => {} } },
        getElementById: () => null
      },
      fileGrid: { innerHTML: '', classList: { toggle: () => {} }, querySelectorAll: () => [] },
      getFilteredAndSortedItems: () => browserSandbox.state.items.slice(),
      newFolderBtn: null,
      actionModalTitle: { innerText: '' },
      actionModalBody: { innerHTML: '' },
      actionModalFooter: { innerHTML: '' },
      actionModal: { style: { display: 'none' } },
      isLanDesktopMode: () => isDesktopFlag,
      isLanMobileMode: () => !isDesktopFlag,
      escapeHtml: (s) => String(s || ''),
      getFileCategory: (item) => (item && item.ext === 'mp4' ? 'video' : 'image'),
      state: {
        allowEdit: true,
        viewMode: 'grid',
        sort: 'mtime-desc',
        isSearching: false,
        selectedPaths: new Set(),
        focusedIdx: -1,
        lastSelectedIdx: -1,
        multiSelectExplicit: false,
        items: [
          { name: 'clip.mp4', path: '/demo/clip.mp4', ext: 'mp4', size: 2048, mtime: Date.now(), isDirectory: false },
          { name: 'photo.jpg', path: '/demo/photo.jpg', ext: 'jpg', size: 1024, mtime: Date.now(), isDirectory: false }
        ]
      },
      console
    };
    vm.createContext(browserSandbox);
    vm.runInContext(
      lanWebBrowserScripts +
        '\n' +
        lanWebFileActionsScripts +
        '\n__browserExports = { buildCardHtml, buildGridCardHtml, buildDesktopListRowHtml, renderFileGrid };',
      browserSandbox
    );

    isDesktopFlag = true;
    browserSandbox.state.viewMode = 'grid';
    browserSandbox.__browserExports.renderFileGrid();
    const desktopCardHtml = browserSandbox.__browserExports.buildCardHtml(browserSandbox.state.items[0], 0);
    assert.strictEqual(desktopCardHtml.includes('card-actions-btn'), false, '桌面端网格卡片不应渲染右上角 ⋮ 按钮');
    assert.strictEqual(desktopCardHtml.includes('openItemActions'), false, '桌面端网格卡片不应绑定 openItemActions');
    assert.ok(desktopCardHtml.includes('<polyline points="20 6 9 17 4 12"></polyline>'), '桌面端网格卡片应使用圆角矢量勾号 SVG');
    assert.strictEqual(desktopCardHtml.includes('>✓<'), false, '桌面端网格卡片不应保留原始 ✓ 字符');

    // 桌面端重复点击卡片反选 + 双击第 2 次点击防误反选 + 多选反选
    browserSandbox.window.handleCardClick(0, { detail: 1 });
    assert.strictEqual(browserSandbox.state.selectedPaths.has('/demo/clip.mp4'), true);
    assert.strictEqual(browserSandbox.state.focusedIdx, 0);
    browserSandbox.window.handleCardClick(0, { detail: 1 });
    assert.strictEqual(browserSandbox.state.selectedPaths.size, 0, '桌面端重复单击已选中卡片应取消选中');
    assert.strictEqual(browserSandbox.state.focusedIdx, -1, '取消选中后应清空焦点');

    browserSandbox.window.handleCardClick(0, { detail: 1 });
    browserSandbox.window.handleCardClick(0, { detail: 2 });
    assert.strictEqual(browserSandbox.state.selectedPaths.has('/demo/clip.mp4'), true, '双击第 2 次点击不应误触发反选');

    browserSandbox.window.handleCardClick(1, { ctrlKey: true, detail: 1 });
    assert.strictEqual(browserSandbox.state.selectedPaths.size, 2);
    browserSandbox.window.handleCardClick(0, { detail: 1 });
    assert.strictEqual(browserSandbox.state.selectedPaths.has('/demo/clip.mp4'), false, '多选状态单击已选卡片应取消该项选中');
    assert.strictEqual(browserSandbox.state.selectedPaths.has('/demo/photo.jpg'), true);
    browserSandbox.state.selectedPaths.clear();
    browserSandbox.state.focusedIdx = -1;

    browserSandbox.state.viewMode = 'list';
    const desktopRowHtml = browserSandbox.__browserExports.buildCardHtml(browserSandbox.state.items[0], 0);
    assert.strictEqual(desktopRowHtml.includes('openItemActions'), false, '桌面端列表行不应渲染 ⋮ 更多弹窗按钮');
    assert.ok(desktopRowHtml.includes('<polyline points="20 6 9 17 4 12"></polyline>'), '桌面端列表行应使用矢量勾号 SVG');
    assert.ok(desktopRowHtml.includes('<path d="M2 13h10"></path><path d="m9 16 3-3-3-3"></path>'), '桌面端移动按钮应使用 folder-input 箭头入目录 SVG');
    assert.strictEqual(desktopRowHtml.includes('>✓<'), false);

    // 移动弹窗与网盘转存目录选择器容器应具备固定 260px 高度，防止加载前后弹窗高度闪烁
    for (const [label, html] of [['desktop', desktopHtml], ['mobile', mobileHtml]]) {
      const styleBlock = html.match(/<style>([\s\S]*?)<\/style>/)[1];
      const dirTreeMatch = styleBlock.match(/^[ \t]*\.directory-tree-container\s*\{([^}]*)\}/m);
      assert.ok(dirTreeMatch && dirTreeMatch[1].includes('height: 260px'), `${label} .directory-tree-container 应固定 height: 260px`);
      const panListMatch = styleBlock.match(/^[ \t]*\.pan-folder-picker-list\s*\{([^}]*)\}/m);
      assert.ok(panListMatch && panListMatch[1].includes('height: 260px'), `${label} .pan-folder-picker-list 应固定 height: 260px`);
    }

    // 桌面端列表行常用操作：按适用范围从窄到广(左->右)排序，右侧视觉对齐
    const videoActionOrder = [
      'openVideoEditModal',
      'openVideoCompressModal',
      'downloadLanFile',
      'openMoveModal',
      'openRenameModal',
      'openDeleteModal'
    ];
    let prevActPos = -1;
    for (const fn of videoActionOrder) {
      const pos = desktopRowHtml.indexOf(fn);
      assert.ok(pos > prevActPos, `视频行按钮顺序应满足从窄到广右对齐: ${fn}`);
      prevActPos = pos;
    }

    const desktopImgRowHtml = browserSandbox.__browserExports.buildCardHtml(browserSandbox.state.items[1], 1);
    assert.strictEqual(desktopImgRowHtml.includes('openVideoEditModal'), false);
    assert.strictEqual(desktopImgRowHtml.includes('openVideoCompressModal'), false);
    const fileActionOrder = ['downloadLanFile', 'openMoveModal', 'openRenameModal', 'openDeleteModal'];
    prevActPos = -1;
    for (const fn of fileActionOrder) {
      const pos = desktopImgRowHtml.indexOf(fn);
      assert.ok(pos > prevActPos, `普通文件行应右侧对齐包含: ${fn}`);
      prevActPos = pos;
    }

    const folderItem = { name: 'Movies', path: '/demo/Movies', ext: '', size: 0, mtime: Date.now(), isDirectory: true };
    const desktopFolderRowHtml = browserSandbox.__browserExports.buildCardHtml(folderItem, 2);
    assert.strictEqual(desktopFolderRowHtml.includes('openVideoEditModal'), false);
    assert.strictEqual(desktopFolderRowHtml.includes('openVideoCompressModal'), false);
    assert.strictEqual(desktopFolderRowHtml.includes('downloadLanFile'), false);
    const folderActionOrder = ['openMoveModal', 'openRenameModal', 'openDeleteModal'];
    prevActPos = -1;
    for (const fn of folderActionOrder) {
      const pos = desktopFolderRowHtml.indexOf(fn);
      assert.ok(pos > prevActPos, `文件夹行应右侧对齐包含: ${fn}`);
      prevActPos = pos;
    }

    // 只读模式：仅非目录保留下载按钮，所有编辑/删除操作隐藏
    browserSandbox.state.allowEdit = false;
    const roVideoRowHtml = browserSandbox.__browserExports.buildCardHtml(browserSandbox.state.items[0], 0);
    assert.ok(roVideoRowHtml.includes('downloadLanFile'));
    for (const fn of ['openVideoEditModal', 'openVideoCompressModal', 'openMoveModal', 'openRenameModal', 'openDeleteModal']) {
      assert.strictEqual(roVideoRowHtml.includes(fn), false, `只读模式不应显示: ${fn}`);
    }
    const roFolderRowHtml = browserSandbox.__browserExports.buildCardHtml(folderItem, 2);
    assert.strictEqual(roFolderRowHtml.includes('downloadLanFile'), false);
    assert.strictEqual(roFolderRowHtml.includes('openDeleteModal'), false);
    browserSandbox.state.allowEdit = true;

    browserSandbox.actionModal.style.display = 'none';
    browserSandbox.window.openItemActions(encodeURIComponent('/demo/clip.mp4'));
    assert.strictEqual(browserSandbox.actionModal.style.display, 'none', '桌面端调用 openItemActions 不应打开重复操作弹窗');

    isDesktopFlag = false;
    browserSandbox.state.viewMode = 'grid';
    const mobileCardHtml = browserSandbox.__browserExports.buildCardHtml(browserSandbox.state.items[0], 0);
    assert.ok(mobileCardHtml.includes('card-actions-btn') && mobileCardHtml.includes('openItemActions'));
    assert.ok(mobileCardHtml.includes('<polyline points="20 6 9 17 4 12"></polyline>'));
    assert.strictEqual(mobileCardHtml.includes('>✓<'), false);
    browserSandbox.state.viewMode = 'list';
    const mobileRowHtml = browserSandbox.__browserExports.buildCardHtml(browserSandbox.state.items[0], 0);
    assert.ok(mobileRowHtml.includes('mobile-row-more-btn') && mobileRowHtml.includes('openItemActions'));
    assert.ok(mobileRowHtml.includes('<polyline points="20 6 9 17 4 12"></polyline>'));
    assert.strictEqual(mobileRowHtml.includes('>✓<'), false);
    browserSandbox.window.openItemActions(encodeURIComponent('/demo/clip.mp4'));
    assert.strictEqual(browserSandbox.actionModal.style.display, 'flex', '移动端应继续通过 openItemActions 打开操作面板');

    console.log('[PASS] 2. lanWeb 双端模板(无重复ID)、配色规范、JS语法、导航历史栈、桌面右键与无冗余弹窗、滚动与下载筛选校验');

    // 3. 启动真实 LanServer HTTP 实测
    const appDataDir = path.join(tmpDir, 'mock-userdata');
    const mountedDir = path.join(tmpDir, 'mounted-resource');
    const defaultVideoDir = path.join(tmpDir, 'default-video-dir');
    fs.mkdirSync(appDataDir, { recursive: true });
    fs.mkdirSync(mountedDir, { recursive: true });
    fs.mkdirSync(defaultVideoDir, { recursive: true });

    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === 'electron') {
        return {
          app: {
            getPath: () => appDataDir,
            getName: () => 'velora',
            getVersion: () => '1.12.5',
            isPackaged: false
          },
          net: { fetch: async () => ({ status: 200, text: async () => '{}', json: async () => ({}) }) },
          safeStorage: { isEncryptionAvailable: () => false },
          BrowserWindow: class {}
        };
      }
      return origLoad.apply(this, arguments);
    };

    let serverInstance = null;
    try {
      const fakeStoreFile = path.join(tmpDir, 'fake-electron-store.cjs');
      fs.writeFileSync(
        fakeStoreFile,
        `
          module.exports = class FakeElectronStore {
            constructor() {
              this.store = {
                videoDirectory: ${JSON.stringify(defaultVideoDir)},
                fileDirectory: ${JSON.stringify(mountedDir)}
              };
            }
            get(key) {
              return this.store[key];
            }
            set(key, val) {
              this.store[key] = val;
            }
            delete(key) {
              delete this.store[key];
            }
          };
        `
      );
      const { LanServer } = require(
        bundleToCjs(path.join(rootDir, 'electron/lanServer.ts'), 'lanServer.cjs', [
          '--external:electron',
          `--alias:electron-store=${fakeStoreFile}`
        ])
      );
      serverInstance = new LanServer();

      const fsEvents = [];
      const dispatchedCommands = [];
      serverInstance.setDownloadCommandCallback(async (cmd) => {
        dispatchedCommands.push(cmd);
        return { success: true, count: cmd.items ? cmd.items.length : 1 };
      });

      const testPort = 18900 + Math.floor(Math.random() * 500);
      const startRes = await serverInstance.start(
        { enabled: true, port: testPort, password: '', allowEdit: false },
        async () => [{ id: 'res1', name: '媒体库', path: mountedDir }],
        (ev) => fsEvents.push(ev)
      );
      assert.strictEqual(startRes.success, true, startRes.error);

      // 3a. 自动 302 分流 & Cookie 偏好
      const rPhone = await httpRequest(testPort, 'GET', '/', { 'user-agent': 'Mozilla/5.0 (iPhone) Mobile/15E148' });
      assert.strictEqual(rPhone.status, 302);
      assert.strictEqual(rPhone.headers.location, '/m');

      const rPc = await httpRequest(testPort, 'GET', '/', { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0' });
      assert.strictEqual(rPc.status, 302);
      assert.strictEqual(rPc.headers.location, '/desktop');

      const rPrefer = await httpRequest(testPort, 'GET', '/m?prefer=1');
      assert.strictEqual(rPrefer.status, 200);
      assert.ok(String(rPrefer.headers['set-cookie'] || '').includes('velora_lan_view=mobile'));

      // 3b. 只读 403 守卫
      assert.strictEqual(
        (await httpRequest(testPort, 'POST', `/api/upload?dir=${encodeURIComponent(mountedDir)}&filename=a.txt`, {}, Buffer.from('hi'))).status,
        403
      );
      assert.strictEqual(
        (await httpRequest(testPort, 'POST', '/api/downloads/add', { 'Content-Type': 'application/json' }, JSON.stringify({ url: 'https://example.com/a.mp4' }))).status,
        403
      );

      // 3c. 开启 allowEdit 后测试流式上传 + 同名重命名 + 防越界
      await serverInstance.start(
        { enabled: true, port: testPort, password: '', allowEdit: true },
        async () => [{ id: 'res1', name: '媒体库', path: mountedDir }],
        (ev) => fsEvents.push(ev)
      );

      const rUp1 = await httpRequest(
        testPort,
        'POST',
        `/api/upload?dir=${encodeURIComponent(mountedDir)}&filename=demo.bin`,
        {},
        Buffer.from('payload-1')
      );
      assert.strictEqual(rUp1.status, 200);
      assert.strictEqual(JSON.parse(rUp1.body).file.name, 'demo.bin');

      const rUp2 = await httpRequest(
        testPort,
        'POST',
        `/api/upload?dir=${encodeURIComponent(mountedDir)}&filename=demo.bin`,
        {},
        Buffer.from('payload-2')
      );
      assert.strictEqual(rUp2.status, 200);
      assert.strictEqual(JSON.parse(rUp2.body).file.name, 'demo (1).bin');
      assert.ok(fsEvents.length >= 2);

      const rEscape = await httpRequest(
        testPort,
        'POST',
        `/api/upload?dir=${encodeURIComponent(tmpDir)}&filename=evil.txt`,
        {},
        Buffer.from('nope')
      );
      assert.strictEqual(rEscape.status, 403);

      // 3d. 远程下载快照 + 缺省默认下载目录解析 + 控制指令
      serverInstance.updateDownloadTasksSnapshot([
        {
          id: 'dl_1',
          name: 'movie.mp4',
          status: 'downloading',
          progress: 42.5,
          receivedBytes: 425,
          totalBytes: 1000,
          speed: 100,
          savePath: path.join(mountedDir, 'movie.mp4'),
          createdAt: Date.now()
        }
      ]);
      const rList = await httpRequest(testPort, 'GET', '/api/downloads');
      assert.strictEqual(rList.status, 200);
      assert.strictEqual(JSON.parse(rList.body).tasks.length, 1);

      // 不传 saveDir，后端应自动落到桌面端配置的 videoDirectory
      const rAddDefaultDir = await httpRequest(
        testPort,
        'POST',
        '/api/downloads/add',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ url: 'https://example.com/auto.mp4' })
      );
      assert.strictEqual(rAddDefaultDir.status, 200);
      assert.strictEqual(dispatchedCommands[0].action, 'add');
      assert.strictEqual(dispatchedCommands[0].items[0].name, 'auto.mp4');
      assert.strictEqual(dispatchedCommands[0].items[0].saveDir, defaultVideoDir);

      const rPause = await httpRequest(
        testPort,
        'POST',
        '/api/downloads/action',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ action: 'pause', id: 'dl_1' })
      );
      assert.strictEqual(rPause.status, 200);
      assert.strictEqual(dispatchedCommands[1].action, 'pause');
      assert.strictEqual(dispatchedCommands[1].id, 'dl_1');

      // 3e. 畸形 JSON 应返回 400 Bad Request，且网盘相对路径清洗阻断 .. 路径穿越
      const rBadJson = await httpRequest(
        testPort,
        'POST',
        '/api/downloads/add',
        { 'Content-Type': 'application/json' },
        '{broken-json'
      );
      assert.strictEqual(rBadJson.status, 400);

      const { sanitizeRelativeSubPath, resolveSafeChildDir } = require(
        bundleToCjs(path.join(rootDir, 'electron/lanServer/remoteRoutes.ts'), 'remoteRoutes.cjs', [
          '--external:electron',
          `--alias:electron-store=${fakeStoreFile}`
        ])
      );
      assert.strictEqual(sanitizeRelativeSubPath('Movies/SciFi/ep01.mp4', 'fallback.mp4'), 'Movies/SciFi/ep01.mp4');
      assert.strictEqual(sanitizeRelativeSubPath('../../../../Windows/System32/evil.exe', 'evil.exe'), 'Windows/System32/evil.exe');
      assert.strictEqual(sanitizeRelativeSubPath('..\\..\\secret.txt', 'secret.txt'), 'secret.txt');
      assert.strictEqual(sanitizeRelativeSubPath('/../..', 'fallback.mp4'), 'fallback.mp4');
      assert.strictEqual(
        resolveSafeChildDir(mountedDir, '../../../../outside/evil.exe'),
        path.resolve(mountedDir)
      );
      assert.strictEqual(
        resolveSafeChildDir(mountedDir, 'Sub/ep01.mp4'),
        path.resolve(mountedDir, 'Sub')
      );
      console.log('[PASS] 3. LanServer 真实 HTTP 分流、流式上传、默认目录远程下载与安全边界闭环');
    } finally {
      if (serverInstance) await serverInstance.stop();
      Module._load = origLoad;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
