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
    assert.ok(desktopHtml.includes('class="video-edit-modal-content desktop-d2-workbench"'));
    assert.ok(desktopHtml.includes('class="trim-shortcuts-popover"'));
    assert.ok(desktopHtml.includes('id="trim-step-prev"'));
    assert.ok(desktopHtml.includes('id="trim-step-next"'));
    assert.ok(desktopHtml.includes('id="trim-modifier-badge"'));
    assert.strictEqual(desktopHtml.includes('id="trim-tier-switch"'), false);

    assert.ok(mobileHtml.includes('class="lan-mobile-mode"'));
    assert.ok(mobileHtml.includes('mobile-bottom-nav'));
    assert.ok(mobileHtml.includes('class="video-edit-modal-content mobile-s3-workbench"'));
    assert.ok(mobileHtml.includes('id="trim-tier-switch"'));
    assert.ok(mobileHtml.includes('粗略 1/5 m'));
    assert.ok(mobileHtml.includes('普通 5/10 s'));
    assert.ok(mobileHtml.includes('精细 0.1/1 s'));
    assert.ok(mobileHtml.includes('id="trim-export-sheet"'));
    assert.strictEqual(mobileHtml.includes('id="trim-move-prev-btn"'), false);
    assert.strictEqual(mobileHtml.includes('id="trim-move-next-btn"'), false);
    assert.strictEqual(mobileHtml.includes('class="video-edit-modal-content desktop-d2-workbench"'), false);
    assert.ok(mobileHtml.includes('.segmented-control.mobile-s3-tier-switch'));
    assert.strictEqual(mobileHtml.includes('step-inner'), false);
    // UI 回归防退化：无废弃连接状态标签、无远程下载/网盘目录选择框
    assert.strictEqual(desktopHtml.includes('id="network-indicator"'), false);
    assert.strictEqual(mobileHtml.includes('id="network-indicator"'), false);
    assert.strictEqual(desktopHtml.includes('id="dl-save-dir"'), false);
    assert.strictEqual(desktopHtml.includes('id="pan-download-dir"'), false);

    for (const [label, html] of [['desktop', desktopHtml], ['mobile', mobileHtml]]) {
      const m = html.match(/<script>([\s\S]*?)<\/script>/);
      assert.ok(m && m[1], `${label} HTML 应包含内联脚本`);
      new vm.Script(m[1], { filename: `lan-${label}.js` });
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
    console.log('[PASS] 2. lanWeb /desktop(D2) 与 /m(S3) 模板、脚本语法、滚动放行与双端步长校验');

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
