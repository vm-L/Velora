/**
 * 渲染进程核心 Composables 与持久化回归测试：
 * 1. usePanRefreshBus / usePanDirectory / usePanTransfers: 静默刷新、配额同步、IPC 去代理
 * 2. useMessage: 按类型自动推断默认持续时长与显式覆盖
 * 3. useSettings: 配置备份导出、merge 与 overwrite 导入语义
 * 4. downloads/persistence: 敏感请求头脱敏、Referer 归一化与 Dexie 序列化去代理
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, 'tmp', `composables-test-${Date.now()}`);
const esbuildBin = path.join(rootDir, 'node_modules', '.bin', 'esbuild');

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 25));

async function runTests() {
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const entryPath = path.join(tmpDir, 'entry.ts');
    const bundlePath = path.join(tmpDir, 'bundle.cjs');

    fs.writeFileSync(
      entryPath,
      [
        `export { ref, reactive } from 'vue';`,
        `export * from ${JSON.stringify(path.join(rootDir, 'src/composables/pan/usePanRefreshBus.ts').replace(/\\/g, '/'))};`,
        `export { usePanDirectory } from ${JSON.stringify(path.join(rootDir, 'src/composables/pan/usePanDirectory.ts').replace(/\\/g, '/'))};`,
        `export { usePanTransfers } from ${JSON.stringify(path.join(rootDir, 'src/composables/pan/usePanTransfers.ts').replace(/\\/g, '/'))};`,
        `export { useMessage } from ${JSON.stringify(path.join(rootDir, 'src/composables/useMessage.ts').replace(/\\/g, '/'))};`,
        `export { useConfirm } from ${JSON.stringify(path.join(rootDir, 'src/composables/useConfirm.ts').replace(/\\/g, '/'))};`,
        `export { useSettings } from ${JSON.stringify(path.join(rootDir, 'src/composables/useSettings.ts').replace(/\\/g, '/'))};`,
        `export { clonePanContext, sanitizeHeadersForDb, serializeTaskForDb, normalizeReferer } from ${JSON.stringify(path.join(rootDir, 'src/composables/downloads/persistence.ts').replace(/\\/g, '/'))};`
      ].join('\n'),
      'utf8'
    );

    execFileSync(
      esbuildBin,
      [
        entryPath,
        '--bundle',
        '--platform=node',
        '--format=cjs',
        `--tsconfig=${path.join(rootDir, 'tsconfig.json')}`,
        `--outfile=${bundlePath}`
      ],
      { cwd: rootDir, stdio: 'pipe' }
    );

    const listCalls = [];
    const quotaCalls = [];
    const deleteCalls = [];
    const savedSettings = {};
    let exportedPayload = null;
    let currentMockFiles = [
      { id: 'f1', name: 'keep.mp4', pdir_fid: '0', size: 1024, isDirectory: false, updatedAt: 1000 },
      { id: 'f2', name: 'remove.mp4', pdir_fid: '0', size: 2048, isDirectory: false, updatedAt: 2000 }
    ];
    let mockQuotaText = '10GB / 100GB';

    globalThis.window = {
      electronAPI: {
        listPanFiles: async (params) => {
          listCalls.push(params);
          return {
            success: true,
            data: { files: currentMockFiles, total: currentMockFiles.length, pdir_fid: params.pdirFid }
          };
        },
        refreshPanQuota: async (type) => {
          quotaCalls.push(type);
          return { success: true, quotaText: mockQuotaText };
        },
        loginPanAccount: async () => ({ success: true }),
        deletePanFiles: async (payload) => {
          deleteCalls.push(structuredClone(payload));
          return { success: true };
        },
        setSetting: async (k, v) => {
          savedSettings[k] = structuredClone(v);
        },
        exportResourcesJson: async (payload) => {
          exportedPayload = structuredClone(payload);
          return { success: true };
        },
        compileAdBlockRules: async () => {}
      }
    };

    const mod = require(bundlePath);

    // 1. 网盘刷新总线 + 静默刷新 + IPC 去代理
    assert.strictEqual(mod.normalizePanDirFid('/'), '0');
    assert.strictEqual(mod.shouldRefreshPanDirectory({ panType: 'quark', dirFids: [''] }, 'quark', '0'), true);
    assert.strictEqual(mod.shouldRefreshPanDirectory({ panType: 'baidu', dirFids: ['0'] }, 'quark', '0'), false);

    const dirState = mod.usePanDirectory({
      panType: () => 'quark',
      accountQuotaText: () => '1GB / 100GB'
    });
    await dirState.loadCurrentDirectory(true);
    assert.strictEqual(dirState.currentFiles.value.length, 2);

    dirState.selectedIds.value = ['f1', 'f2'];
    currentMockFiles = [
      { id: 'f1', name: 'keep.mp4', pdir_fid: '0', size: 1024, isDirectory: false, updatedAt: 1000 },
      { id: 'f3', name: 'saved.mp4', pdir_fid: '0', size: 4096, isDirectory: false, updatedAt: 3000 }
    ];
    mockQuotaText = '14GB / 100GB';
    mod.notifyPanDirectoryChanged({ panType: 'quark', dirFids: ['0'], refreshQuota: true });
    assert.strictEqual(dirState.isLoading.value, false);
    await flushAsync();
    assert.deepStrictEqual(dirState.selectedIds.value, ['f1']);
    assert.strictEqual(dirState.displayQuotaText.value, '14GB / 100GB');

    const confirmApi = mod.useConfirm();
    const transfers = mod.usePanTransfers({
      panType: () => 'quark',
      defaultReferer: () => 'https://pan.quark.cn/',
      currentFiles: dirState.currentFiles,
      selectedIds: dirState.selectedIds,
      clearSelection: dirState.clearSelection,
      loadCurrentDirectory: dirState.loadCurrentDirectory
    });
    dirState.selectedIds.value = ['fid_a', 'fid_b'];
    const delPromise = transfers.handleBatchDelete();
    await Promise.resolve();
    assert.strictEqual(confirmApi.state.isVisible, true);
    confirmApi.proceed();
    await delPromise;
    await flushAsync();
    assert.deepStrictEqual(deleteCalls[0], { type: 'quark', fids: ['fid_a', 'fid_b'] });
    dirState.dispose();
    console.log('[PASS] 1. 网盘刷新总线静默刷新与批量删除去代理校验');

    // 2. useMessage 时长推断
    const msgApi = mod.useMessage();
    msgApi.clearAllMessages();
    msgApi.showMessage('成功', 'success');
    assert.strictEqual(msgApi.messages.value[0].duration, 2000);
    msgApi.showMessage('错误', 'error');
    assert.strictEqual(msgApi.messages.value[0].duration, 3000);
    msgApi.showMessage('显式', 'error', 5000);
    assert.strictEqual(msgApi.messages.value[0].duration, 5000);
    msgApi.clearAllMessages();
    console.log('[PASS] 2. useMessage 默认持续时长推断与覆盖校验');

    // 3. useSettings 导出与 merge/overwrite 导入
    const settingsApi = mod.useSettings();
    await settingsApi.saveExternalSites([{ id: 's1', name: 'Site One', url: 'https://one.example' }]);
    await settingsApi.exportConfigBackup(['externalSites']);
    assert.strictEqual(exportedPayload.data.externalSites.length, 1);

    await settingsApi.importConfigBackup(
      {
        data: {
          externalSites: [
            { id: 's1', name: 'Dup Ignored', url: 'https://dup.example' },
            { id: 's2', name: 'Site Two', url: 'https://two.example' }
          ]
        }
      },
      ['externalSites'],
      'merge'
    );
    assert.strictEqual(settingsApi.state.externalSites.length, 2);
    assert.strictEqual(settingsApi.state.externalSites[0].name, 'Site One');

    await settingsApi.importConfigBackup(
      { data: { externalSites: [{ id: 's3', name: 'Only', url: 'https://only.example' }] } },
      ['externalSites'],
      'overwrite'
    );
    assert.strictEqual(settingsApi.state.externalSites.length, 1);
    assert.strictEqual(settingsApi.state.externalSites[0].id, 's3');
    console.log('[PASS] 3. useSettings 备份导出与 merge/overwrite 导入校验');

    // 4. downloads/persistence 脱敏与去代理
    assert.deepStrictEqual(
      mod.sanitizeHeadersForDb({ Cookie: 'secret=1', Authorization: 'Bearer x', Referer: 'https://example.com' }),
      { Referer: 'https://example.com' }
    );
    assert.strictEqual(mod.normalizeReferer('https://pan.quark.cn/s/abc'), 'https://pan.quark.cn/');
    const reactiveCtx = mod.reactive({ panType: 'quark', mode: 'share', fid: 'f1', extra: { path: ['a'] } });
    const serialized = mod.serializeTaskForDb({
      id: 't1',
      url: 'https://example.com/a.mp4',
      name: 'a.mp4',
      savePath: '/tmp/a.mp4',
      status: 'downloading',
      progress: 10,
      receivedBytes: 10,
      totalBytes: 100,
      speed: 5,
      headers: { Authorization: 'secret', 'User-Agent': 'Velora' },
      panContext: reactiveCtx,
      createdAt: 1,
      updatedAt: 2
    });
    const cloned = structuredClone(serialized);
    assert.deepStrictEqual(cloned.headers, { 'User-Agent': 'Velora' });
    assert.deepStrictEqual(cloned.panContext.extra.path, ['a']);
    console.log('[PASS] 4. downloads/persistence 敏感头脱敏与 Dexie 去代理校验');
  } finally {
    delete globalThis.window;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
