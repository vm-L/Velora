/**
 * 阶段 1 回归测试（浏览器 ↔ 网盘无侵入联动 + 目录筛选排序）：
 * 1. shareTextParser: 10 大网盘链接识别、非分享路径过滤、网页批量提取与提取码归属、normalizePanShareFile 去代理
 * 2. pan/types: 文件分类筛选与目录置顶多列排序
 * 3. useGlobalPanParseModal: 全局弹窗唤起、提取码拼接与关闭清理
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, 'tmp', `stage1-test-${Date.now()}`);
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
      '--alias:@=' + path.join(rootDir, 'src'),
      ...extraArgs,
      '--outfile=' + outFile
    ],
    { cwd: rootDir, stdio: 'pipe' }
  );
  return outFile;
}

async function runTests() {
  try {
    // 1. shareTextParser 真实模块
    const parserEntry = path.join(tmpDir, 'parser-entry.ts');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      parserEntry,
      `
        export { reactive } from 'vue';
        export * from ${JSON.stringify(path.join(rootDir, 'src/composables/pan/shareTextParser.ts').replace(/\\/g, '/'))};
      `
    );
    const parser = require(bundleToCjs(parserEntry, 'shareTextParser.cjs'));

    assert.strictEqual(parser.detectPanShareMeta('https://pan.quark.cn/'), null);
    assert.strictEqual(parser.detectPanShareMeta('https://pan.baidu.com/disk/main'), null);
    assert.strictEqual(parser.detectPanShareMeta('https://www.google.com/s/123456'), null);

    const sampleUrls = [
      ['https://pan.quark.cn/s/abc123456789', 'quark'],
      ['https://drive.uc.cn/s/uc998877', 'uc'],
      ['https://pan.baidu.com/s/1AbCdEfGh?pwd=1234', 'baidu'],
      ['https://www.123pan.com/s/xyz-12345.html', '123pan'],
      ['https://wwa.lanzouy.com/iAbCd12345', 'lanzou'],
      ['https://www.ilanzou.com/s/ilz9988', 'ilanzou'],
      ['https://pan.xunlei.com/s/VNm123456', 'xunlei'],
      ['https://115cdn.com/s/sw3abcd1234', '115'],
      ['https://yun.139.com/shareweb/#/w/i/2qABC123', '139'],
      ['https://www.guangyapan.com/s/gy8899', 'guangya']
    ];
    for (const [url, expectedType] of sampleUrls) {
      const meta = parser.detectPanShareMeta(url);
      assert.ok(meta, `应该识别为网盘分享链接: ${url}`);
      assert.strictEqual(meta.type, expectedType, `${url} 应归属 ${expectedType}`);
    }

    const pageText = `
      欢迎访问资源站，网盘官网 https://pan.quark.cn/ 不应误报。
      电影合集：https://pan.quark.cn/s/demoQuark01 提取码：ab12
      重复链接测试：https://pan.quark.cn/s/demoQuark01
      蓝奏优享：https://www.ilanzou.com/s/demoIlz02 密码:9988
      百度链接：https://pan.baidu.com/s/1DemoBaidu?pwd=wxyz
    `;
    const anchors = [
      { href: 'https://pan.quark.cn/s/demoQuark01', text: '4K 电影合集', context: '4K 电影合集 提取码：ab12' },
      { href: 'https://pan.xunlei.com/s/demoXunlei03', text: '迅雷资源包', context: '迅雷资源包 访问码: x7y8' }
    ];
    const extracted = parser.extractAllPanShareLinks(pageText, anchors);
    assert.strictEqual(extracted.length, 4);
    assert.strictEqual(extracted.find((i) => i.panType === 'quark').password, 'ab12');
    assert.strictEqual(extracted.find((i) => i.panType === 'quark').title, '4K 电影合集');
    assert.strictEqual(extracted.find((i) => i.panType === 'xunlei').password, 'x7y8');
    assert.strictEqual(extracted.find((i) => i.panType === 'ilanzou').password, '9988');
    assert.strictEqual(extracted.find((i) => i.panType === 'baidu').password, 'wxyz');

    const reactiveFile = parser.reactive({
      id: 'fid_100',
      name: 'demo/video.mp4',
      path: 'folder/demo/video.mp4',
      size: 4096,
      rawInfo: { fid: 'fid_100', share_fid_token: 'tok_1', extra: { nested: { count: 2 } } }
    });
    const clonedNormalized = structuredClone(parser.normalizePanShareFile(reactiveFile));
    assert.strictEqual(clonedNormalized.fid, 'fid_100');
    assert.strictEqual(clonedNormalized.extra.nested.count, 2);
    console.log('[PASS] 1. shareTextParser 10大网盘识别、网页批量嗅探与去代理');

    // 2. pan/types 筛选与排序
    const panTypes = require(bundleToCjs(path.join(rootDir, 'src/composables/pan/types.ts'), 'panTypes.cjs'));
    const mockFiles = [
      { id: '1', name: 'B_movie.mp4', pdir_fid: '0', size: 500, isDirectory: false, updatedAt: 2000 },
      { id: '2', name: 'Folder_Z', pdir_fid: '0', size: 0, isDirectory: true, updatedAt: 1000 },
      { id: '3', name: 'A_song.mp3', pdir_fid: '0', size: 100, isDirectory: false, updatedAt: 3000 },
      { id: '4', name: 'Folder_A', pdir_fid: '0', size: 0, isDirectory: true, updatedAt: 4000 },
      { id: '5', name: 'cover.png', pdir_fid: '0', size: 50, isDirectory: false, updatedAt: 1500 },
      { id: '6', name: 'readme.txt', pdir_fid: '0', size: 10, isDirectory: false, updatedAt: 500 }
    ];
    assert.strictEqual(panTypes.filterAndSortPanFiles(mockFiles, { typeFilter: 'video', sortBy: 'default', sortOrder: 'asc' }).length, 1);
    assert.strictEqual(panTypes.filterAndSortPanFiles(mockFiles, { typeFilter: 'audio', sortBy: 'default', sortOrder: 'asc' }).length, 1);
    assert.strictEqual(panTypes.filterAndSortPanFiles(mockFiles, { typeFilter: 'image', sortBy: 'default', sortOrder: 'asc' }).length, 1);
    assert.strictEqual(panTypes.filterAndSortPanFiles(mockFiles, { typeFilter: 'other', sortBy: 'default', sortOrder: 'asc' }).length, 1);

    const bySizeDesc = panTypes.filterAndSortPanFiles(mockFiles, { typeFilter: 'all', sortBy: 'size', sortOrder: 'desc' });
    assert.strictEqual(bySizeDesc[0].isDirectory, true);
    assert.strictEqual(bySizeDesc[1].isDirectory, true);
    assert.strictEqual(bySizeDesc[2].name, 'B_movie.mp4');
    assert.strictEqual(bySizeDesc[5].name, 'readme.txt');

    const byNameAsc = panTypes.filterAndSortPanFiles(mockFiles, { typeFilter: 'all', sortBy: 'name', sortOrder: 'asc' });
    assert.strictEqual(byNameAsc[0].name, 'Folder_A');
    assert.strictEqual(byNameAsc[1].name, 'Folder_Z');
    assert.strictEqual(byNameAsc[2].name, 'A_song.mp3');
    console.log('[PASS] 2. pan/types 分类筛选与目录置顶多列排序');

    // 3. useGlobalPanParseModal
    const { useGlobalPanParseModal } = require(
      bundleToCjs(path.join(rootDir, 'src/composables/pan/useGlobalPanParseModal.ts'), 'globalPanModal.cjs')
    );
    const modal = useGlobalPanParseModal();
    modal.openPanParseModal('https://pan.quark.cn/s/abc123', 'qwer');
    assert.strictEqual(modal.panParseVisible.value, true);
    assert.strictEqual(modal.panParseInitialUrl.value, 'https://pan.quark.cn/s/abc123 提取码: qwer');
    modal.closePanParseModal();
    assert.strictEqual(modal.panParseVisible.value, false);
    assert.strictEqual(modal.panParseInitialUrl.value, '');
    console.log('[PASS] 3. useGlobalPanParseModal 全局弹窗状态管理');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
