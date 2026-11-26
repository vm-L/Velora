/**
 * 核心引擎纯逻辑回归测试：
 * 1. M3U8SegmentScheduler: 失败延后穿插重试、尾部全并发去重、源站永久失效连续 2 轮判定
 * 2. M3U8SpillPack: 单包批写、崩溃脏尾截断恢复、连续区间坍缩、背压流式输出、旧版 .segs 混合兼容
 * 3. speedLimit: 主/渲染进程限速常量、整数解析、钳制与旧版档位迁移一致
 * 4. siteSession: 站点分区命名归一化与参数校验
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { PassThrough, Writable } = require('stream');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, 'tmp', `core-utils-test-${Date.now()}`);
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

async function runTests() {
  const origLoad = Module._load;
  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. M3U8SegmentScheduler
    const schedMod = require(
      bundleToCjs(path.join(rootDir, 'electron/utils/m3u8Scheduler.ts'), 'm3u8Scheduler.cjs')
    );
    const { M3U8SegmentScheduler, isPermanentOriginSegmentError } = schedMod;

    {
      const s = new M3U8SegmentScheduler({
        totalSegments: 16,
        retryIntervalSegments: 8,
        tailRetryMinGapMs: 50
      });
      assert.deepStrictEqual(s.acquire(1000), { type: 'segment', index: 0, failCount: 0, isRetry: false });
      assert.deepStrictEqual(s.acquire(1000), { type: 'segment', index: 1, failCount: 0, isRetry: false });
      assert.strictEqual(s.markFailed(0, 'HTTP 403', 1000), 1);
      assert.strictEqual(s.pendingRetryCount, 1);

      for (let expected = 2; expected <= 9; expected++) {
        assert.deepStrictEqual(s.acquire(1200), { type: 'segment', index: expected, failCount: 0, isRetry: false });
        s.markSuccess(expected);
      }
      assert.deepStrictEqual(s.acquire(1200), { type: 'segment', index: 0, failCount: 1, isRetry: true });
      s.markSuccess(0);
      assert.strictEqual(s.pendingRetryCount, 0);
      s.markSuccess(1);
      for (let expected = 10; expected < 16; expected++) {
        assert.deepStrictEqual(s.acquire(1300), { type: 'segment', index: expected, failCount: 0, isRetry: false });
        s.markSuccess(expected);
      }
      assert.deepStrictEqual(s.acquire(1400), { type: 'done' });
    }

    {
      const s = new M3U8SegmentScheduler({
        totalSegments: 6,
        alreadyCompleted: [0, 3, 5],
        retryIntervalSegments: 8,
        tailRetryMinGapMs: 200
      });
      assert.strictEqual(s.completedCount, 3);
      assert.strictEqual(s.acquire(1000).index, 1);
      assert.strictEqual(s.acquire(1000).index, 2);
      assert.strictEqual(s.acquire(1000).index, 4);
      s.markSuccess(2);
      s.markFailed(1, 'HTTP 403', 1000);
      s.markFailed(4, 'HTTP 403', 1000);
      assert.strictEqual(s.isTailRetryOnly, true);
      assert.strictEqual(s.acquire(1050).type, 'wait');
      assert.deepStrictEqual(s.acquire(1250), { type: 'segment', index: 1, failCount: 1, isRetry: true });
      assert.deepStrictEqual(s.acquire(1250), { type: 'segment', index: 4, failCount: 1, isRetry: true });
      assert.strictEqual(s.acquire(1250).type, 'wait');
      s.markSuccess(1);
      s.markSuccess(4);
      assert.strictEqual(s.isDone, true);
    }

    {
      assert.strictEqual(
        isPermanentOriginSegmentError(403, 'server=cloudflare, x-oss-ec=0003-00000908', '<Code>BucketPunish</Code>'),
        true
      );
      assert.strictEqual(isPermanentOriginSegmentError(404, '', ''), true);
      assert.strictEqual(isPermanentOriginSegmentError(403, 'cf-mitigated=challenge', '<Code>BucketPunish</Code>'), false);
      assert.strictEqual(isPermanentOriginSegmentError(403, '', 'Token expired'), false);

      const s = new M3U8SegmentScheduler({ totalSegments: 4, retryIntervalSegments: 8, tailRetryMinGapMs: 10 });
      for (let i = 0; i < 4; i++) s.acquire(1000);
      s.markSuccess(0);
      s.markSuccess(2);
      s.markFailed(1, 'HTTP 403', 1000, true);
      s.markFailed(3, 'HTTP 403', 1000, true);
      assert.strictEqual(s.hasAllRemainingPermanentlyFailed(2), false);
      s.acquire(1050);
      s.markFailed(1, 'HTTP 403', 1050, true);
      assert.strictEqual(s.hasAllRemainingPermanentlyFailed(2), false);
      s.acquire(1060);
      s.markFailed(3, 'HTTP 403', 1060, true);
      assert.strictEqual(s.hasAllRemainingPermanentlyFailed(2), true);
    }
    console.log('[PASS] 1. M3U8SegmentScheduler 穿插重试、尾部并发去重与源站永久失效判定');

    // 2. M3U8SpillPack
    const spillMod = require(
      bundleToCjs(path.join(rootDir, 'electron/utils/m3u8SpillPack.ts'), 'm3u8SpillPack.cjs')
    );
    const {
      M3U8SpillPack,
      inspectM3U8SpillForResume,
      buildCoalescedM3U8StreamPlan,
      streamSourcesToWritable,
      cleanupM3U8SpillArtifacts,
      getM3U8SpillPaths,
      writeFileAtomic
    } = spillMod;

    {
      const workSub = path.join(tmpDir, 'spill-a4');
      fs.mkdirSync(workSub, { recursive: true });
      const finalPath = path.join(workSub, 'demo.mp4');
      const prefixPath = finalPath + '.temp.ts';
      const segBufs = Array.from({ length: 20 }, (_, idx) => {
        const b = Buffer.alloc(1024 + idx * 37);
        for (let j = 0; j < b.length; j++) b[j] = (idx * 31 + j) & 0xff;
        return b;
      });
      fs.writeFileSync(prefixPath, Buffer.concat(segBufs.slice(0, 3)));

      const pack1 = new M3U8SpillPack(finalPath, { totalSegments: 20, isFmp4: false, flushedSegments: 3 });
      await pack1.appendBatch(
        Array.from({ length: 10 }, (_, k) => ({ index: k + 10, buf: segBufs[k + 10] })),
        3
      );
      await pack1.close();

      const paths = getM3U8SpillPaths(finalPath);
      const validEnd = fs.statSync(paths.spillBinPath).size;
      fs.appendFileSync(paths.spillBinPath, Buffer.alloc(99, 0xaa)); // 模拟崩溃脏尾

      const resumed = inspectM3U8SpillForResume(finalPath, 20);
      assert.strictEqual(resumed.mode, 'pack');
      assert.strictEqual(resumed.packValidEndOffset, validEnd);

      const pack2 = new M3U8SpillPack(finalPath, {
        totalSegments: 20,
        isFmp4: false,
        flushedSegments: resumed.flushedSegments,
        initialEntries: resumed.packEntries,
        initialWriteOffset: resumed.packValidEndOffset
      });
      const written2 = await pack2.appendBatch(
        Array.from({ length: 7 }, (_, k) => ({ index: k + 3, buf: segBufs[k + 3] })),
        3
      );
      await pack2.close();
      assert.strictEqual(written2[0].offset, validEnd);

      const finalInspected = inspectM3U8SpillForResume(finalPath, 20);
      const ordered = [];
      finalInspected.packEntries.forEach((span, idx) => {
        ordered.push({ index: idx, fileRange: { filePath: paths.spillBinPath, offset: span.offset, length: span.length } });
      });
      const plan = buildCoalescedM3U8StreamPlan({
        prefixFilePath: prefixPath,
        prefixLength: fs.statSync(prefixPath).size,
        orderedSegments: ordered
      });
      assert.strictEqual(plan.sources.length, 3);

      const pt = new PassThrough({ highWaterMark: 1024 });
      const chunks = [];
      const done = new Promise((resolve, reject) => {
        pt.on('data', (c) => chunks.push(c));
        pt.on('end', resolve);
        pt.on('error', reject);
      });
      await streamSourcesToWritable(plan.sources, pt, undefined, 2048);
      await done;
      assert.strictEqual(Buffer.compare(Buffer.concat(chunks), Buffer.concat(segBufs)), 0);

      await cleanupM3U8SpillArtifacts(finalPath);
      assert.strictEqual(fs.existsSync(paths.spillBinPath), false);
      assert.strictEqual(fs.existsSync(paths.spillMetaPath), false);
    }

    {
      // 旧版 .segs + 新版 .spill.bin 混合恢复兼容
      const workSub = path.join(tmpDir, 'spill-hybrid');
      fs.mkdirSync(workSub, { recursive: true });
      const finalPath = path.join(workSub, 'hybrid.mp4');
      const prefixPath = finalPath + '.temp.ts';
      const segBufs = Array.from({ length: 6 }, (_, idx) => Buffer.from(`SEG-${idx}-DATA`));
      fs.writeFileSync(prefixPath, Buffer.concat([segBufs[0], segBufs[1]]));

      const paths = getM3U8SpillPaths(finalPath);
      fs.mkdirSync(paths.legacySegsDir, { recursive: true });
      await writeFileAtomic(paths.legacySegsMetaPath, JSON.stringify({ totalSegments: 6, isFmp4: false, flushedSegments: 2 }));
      fs.writeFileSync(path.join(paths.legacySegsDir, '2.seg'), segBufs[2]);
      fs.writeFileSync(path.join(paths.legacySegsDir, '3.seg'), segBufs[3]);

      const pack = new M3U8SpillPack(finalPath, { totalSegments: 6, isFmp4: false, flushedSegments: 2 });
      await pack.appendBatch([{ index: 4, buf: segBufs[4] }, { index: 5, buf: segBufs[5] }], 2);
      await pack.close();

      const inspected = inspectM3U8SpillForResume(finalPath, 6);
      const ordered = [];
      inspected.legacySegFiles.forEach((info, idx) => {
        ordered.push({ index: idx, fileRange: { filePath: info.filePath, offset: 0, length: info.size } });
      });
      inspected.packEntries.forEach((span, idx) => {
        ordered.push({ index: idx, fileRange: { filePath: paths.spillBinPath, offset: span.offset, length: span.length } });
      });
      const plan = buildCoalescedM3U8StreamPlan({
        prefixFilePath: prefixPath,
        prefixLength: fs.statSync(prefixPath).size,
        orderedSegments: ordered
      });
      const outChunks = [];
      await streamSourcesToWritable(
        plan.sources,
        new Writable({ write(c, _e, cb) { outChunks.push(c); cb(); } })
      );
      assert.strictEqual(Buffer.compare(Buffer.concat(outChunks), Buffer.concat(segBufs)), 0);
      await cleanupM3U8SpillArtifacts(finalPath);
      assert.strictEqual(fs.existsSync(paths.legacySegsDir), false);
    }
    console.log('[PASS] 2. M3U8SpillPack 批写、脏尾截断恢复、区间坍缩与混合兼容');

    // 3. speedLimit 主/渲染进程双向一致性
    const electronSpeed = require(
      bundleToCjs(path.join(rootDir, 'electron/utils/speedLimit.ts'), 'electronSpeed.cjs')
    );
    const rendererSpeed = require(
      bundleToCjs(path.join(rootDir, 'src/utils/speedLimit.ts'), 'rendererSpeed.cjs')
    );

    assert.strictEqual(electronSpeed.DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT, 0);
    assert.strictEqual(rendererSpeed.DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT, 0);
    for (const [preset, expected] of [['low', 2], ['balanced', 4], ['fast', 8], ['unlimited', 0]]) {
      assert.strictEqual(electronSpeed.normalizeVideoCompressSpeedLimit(preset), expected);
      assert.strictEqual(rendererSpeed.normalizeVideoCompressSpeedLimit(preset), expected);
    }
    assert.deepStrictEqual(rendererSpeed.parseSpeedLimitInput('全速'), { valid: true, value: 0 });
    assert.deepStrictEqual(rendererSpeed.parseSpeedLimitInput('12X'), { valid: true, value: 12 });
    assert.deepStrictEqual(rendererSpeed.parseSpeedLimitInput('99x'), { valid: true, value: 32, clamped: true });
    assert.strictEqual(rendererSpeed.parseSpeedLimitInput('2.5').valid, false);
    assert.strictEqual(rendererSpeed.formatSpeedLimitDisplay(0), '全速');
    assert.strictEqual(rendererSpeed.formatSpeedLimitDisplay(6), '6x');
    assert.strictEqual(electronSpeed.resolveVideoCompressSpeedLimit({ videoCompressSpeedLimit: 10, videoCompressSpeedPreset: 'low' }), 10);
    assert.strictEqual(electronSpeed.resolveVideoCompressSpeedLimit({ videoCompressSpeedPreset: 'balanced' }), 4);
    console.log('[PASS] 3. speedLimit 主/渲染进程常量、解析与旧档位兼容');

    // 4. siteSession 分区命名与参数规范化
    Module._load = function (request, parent, isMain) {
      if (request === 'electron') {
        return { session: { fromPartition: () => ({}) }, webContents: { getAllWebContents: () => [] } };
      }
      return origLoad.apply(this, arguments);
    };
    const siteSession = require(
      bundleToCjs(path.join(rootDir, 'electron/siteSession.ts'), 'siteSession.cjs', ['--external:electron'])
    );
    assert.strictEqual(siteSession.SITE_PARTITION_PREFIX, 'persist:site_');
    assert.strictEqual(siteSession.getSitePartition('alpha'), 'persist:site_alpha');
    assert.strictEqual(siteSession.getSitePartition('site.1/foo:bar'), 'persist:site_site_1_foo_bar');
    assert.throws(() => siteSession.getSitePartition(''), /站点资源 ID 不能为空/);
    assert.strictEqual(siteSession.isSitePartition('persist:site_alpha'), true);
    assert.strictEqual(siteSession.isSitePartition('persist:pan_auth_quark'), false);
    assert.deepStrictEqual(
      siteSession.normalizeClearScopes(['cache', 'invalid', 'cookies', 'cache', 'history']),
      ['cache', 'cookies', 'history']
    );
    console.log('[PASS] 4. siteSession 分区命名与清理范围参数规范化');
  } finally {
    Module._load = origLoad;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
