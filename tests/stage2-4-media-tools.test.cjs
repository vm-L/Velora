/**
 * 阶段 2 + 阶段 4 媒体工具与高码率瘦身回归测试：
 * 1. playbackProgress: 本地断点续播路径归一化与片头/片尾边界规则
 * 2. videoEditor (probe / extractAudio / exportVideoGif): 真实 FFmpeg 端到端实测与临时目录零残留
 * 3. lanWeb/scripts/previewAndSearch: 真实局域网 localStorage 断点续播脚本 VM 执行校验
 * 4. bitrateAudit (阶段 4): estimateSavingsBytes 数学边界 + 真实 FFmpeg 高/低码率混合目录探测筛选校验
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const { execFileSync, spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const tmpDir = path.join(rootDir, 'tmp', `media-tools-test-${Date.now()}`);
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
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. playbackProgress 纯规则测试
    const progressMod = require(
      bundleToCjs(path.join(rootDir, 'src/composables/videoPlayer/playbackProgress.ts'), 'playbackProgress.cjs')
    );
    assert.strictEqual(progressMod.normalizePlaybackKey('D:\\Videos\\Demo\\Clip.MP4'), 'd:/videos/demo/clip.mp4');
    assert.strictEqual(progressMod.shouldPersistProgress(5, 10), false);
    assert.strictEqual(progressMod.shouldPersistProgress(2.5, 120), false);
    assert.strictEqual(progressMod.shouldPersistProgress(30, 120), true);
    assert.strictEqual(progressMod.shouldPersistProgress(115, 120), false);
    assert.strictEqual(progressMod.shouldPersistProgress(112, 120), false);
    assert.strictEqual(progressMod.isNearPlaybackEnd(115, 120), true);
    assert.strictEqual(progressMod.isNearPlaybackEnd(30, 120), false);
    console.log('[PASS] 1. playbackProgress 本地断点续播规则与路径归一化');

    // 2. videoEditor (probe / extractAudio / exportVideoGif / bitrateAudit)
    const appDataDir = path.join(tmpDir, 'mock-userdata');
    fs.mkdirSync(appDataDir, { recursive: true });

    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === 'electron') {
        return {
          app: {
            getPath: () => appDataDir,
            getName: () => 'velora',
            getVersion: () => '1.12.5',
            isPackaged: false
          }
        };
      }
      return origLoad.apply(this, arguments);
    };

    try {
      const editorEntry = path.join(tmpDir, 'media-editor-entry.ts');
      fs.writeFileSync(
        editorEntry,
        `
          export { probeVideo, getVideoDuration } from ${JSON.stringify(path.join(rootDir, 'electron/videoEditor/probe.ts').replace(/\\/g, '/'))};
          export { extractAudio, resolveAudioCopyExtension, resolveUniqueOutputPath } from ${JSON.stringify(path.join(rootDir, 'electron/videoEditor/extractAudio.ts').replace(/\\/g, '/'))};
          export { exportVideoGif, buildGifFilterComplex } from ${JSON.stringify(path.join(rootDir, 'electron/videoEditor/gif.ts').replace(/\\/g, '/'))};
          export { estimateSavingsBytes, auditHighBitrateVideos } from ${JSON.stringify(path.join(rootDir, 'electron/videoEditor/bitrateAudit.ts').replace(/\\/g, '/'))};
        `
      );
      const editor = require(bundleToCjs(editorEntry, 'videoEditor.cjs', ['--external:electron']));

      // 纯逻辑校验
      assert.deepStrictEqual(editor.resolveAudioCopyExtension('aac'), { ext: '.m4a', canStreamCopy: true });
      assert.deepStrictEqual(editor.resolveAudioCopyExtension('mp3'), { ext: '.mp3', canStreamCopy: true });
      assert.deepStrictEqual(editor.resolveAudioCopyExtension('opus'), { ext: '.ogg', canStreamCopy: true });
      assert.deepStrictEqual(editor.resolveAudioCopyExtension('unknown_codec'), { ext: '.m4a', canStreamCopy: false });

      const filter = editor.buildGifFilterComplex(12, 640);
      assert.ok(filter.includes('fps=12'));
      assert.ok(filter.includes("scale='min(640,iw)':-1:flags=lanczos"));
      assert.ok(filter.includes('palettegen=stats_mode=diff'));

      // Stage 4 estimateSavingsBytes 数学边界校验
      assert.strictEqual(editor.estimateSavingsBytes(0, 5000, 1500), 0);
      assert.strictEqual(editor.estimateSavingsBytes(1000, 1500, 1500), 0);
      assert.strictEqual(editor.estimateSavingsBytes(1000, 1200, 1500), 0);
      assert.strictEqual(editor.estimateSavingsBytes(1000, 6000, 1500), Math.round(1000 * 0.75 * 0.92));

      // 空/不存在目录探测应优雅返回
      const missingRes = await editor.auditHighBitrateVideos({
        targetPaths: [path.join(tmpDir, 'does-not-exist')],
        minBitrateKbps: 2000,
        targetBitrateKbps: 1000,
        minSizeMB: 0
      });
      assert.strictEqual(missingRes.success, true);
      assert.strictEqual(missingRes.totalScanned, 0);
      assert.strictEqual(missingRes.candidates.length, 0);

      // 检查系统 ffmpeg 是否可用
      const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
      if (hasFfmpeg) {
        const mediaDir = path.join(tmpDir, 'media');
        fs.mkdirSync(mediaDir, { recursive: true });
        const sampleMp4 = path.join(mediaDir, 'sample.mp4');
        const silentMp4 = path.join(mediaDir, 'silent.mp4');

        execFileSync('ffmpeg', [
          '-y',
          '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=24',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k',
          sampleMp4
        ], { stdio: 'ignore' });

        execFileSync('ffmpeg', [
          '-y',
          '-f', 'lavfi', '-i', 'testsrc=duration=1.5:size=320x240:rate=24',
          '-an',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
          silentMp4
        ], { stdio: 'ignore' });

        const probed = await editor.probeVideo(sampleMp4);
        assert.strictEqual(probed.hasAudio, true);
        assert.strictEqual(probed.audioCodec, 'aac');
        assert.ok(probed.duration >= 1.8 && probed.duration <= 2.3);

        const copyRes = await editor.extractAudio({ taskId: 'test_audio_copy', sourcePath: sampleMp4, format: 'copy' });
        assert.strictEqual(copyRes.success, true, copyRes.error);
        assert.ok(copyRes.outputPath.endsWith('.m4a'));

        const mp3Res = await editor.extractAudio({ taskId: 'test_audio_mp3', sourcePath: sampleMp4, format: 'mp3' });
        assert.strictEqual(mp3Res.success, true, mp3Res.error);
        assert.ok(mp3Res.outputPath.endsWith('.mp3'));

        const silentRes = await editor.extractAudio({ taskId: 'test_audio_silent', sourcePath: silentMp4, format: 'copy' });
        assert.strictEqual(silentRes.success, false);
        assert.ok(silentRes.error.includes('不包含音频轨'));

        const gifRes = await editor.exportVideoGif({
          taskId: 'test_gif_1',
          sourcePath: sampleMp4,
          start: 0.2,
          end: 1.4,
          fps: 10,
          maxWidth: 240
        });
        assert.strictEqual(gifRes.success, true, gifRes.error);
        assert.strictEqual(fs.readFileSync(gifRes.outputPath).subarray(0, 6).toString('ascii'), 'GIF89a');

        const tooLongRes = await editor.exportVideoGif({
          taskId: 'test_gif_long',
          sourcePath: sampleMp4,
          start: 0,
          end: 75
        });
        assert.strictEqual(tooLongRes.success, false);
        assert.ok(tooLongRes.error.includes('60 秒'));

        const appTmp = path.join(appDataDir, 'tmp');
        const leftovers = fs.existsSync(appTmp) ? fs.readdirSync(appTmp) : [];
        assert.strictEqual(leftovers.length, 0, `临时目录残留文件: ${leftovers.join(', ')}`);
        console.log('[PASS] 2. videoEditor (probe / extractAudio / exportVideoGif) 真实 FFmpeg 端到端校验');

        // Stage 4: 高码率瘦身扫描实测（构造高码率噪声视频 + 低码率视频 + 非视频 + 隐藏文件）
        const auditDir = path.join(tmpDir, 'audit-dir');
        fs.mkdirSync(auditDir, { recursive: true });
        const highBitrateMp4 = path.join(auditDir, 'high_bitrate.mp4');
        const lowBitrateMp4 = path.join(auditDir, 'low_bitrate.mp4');
        const hiddenMp4 = path.join(auditDir, '.hidden.mp4');
        fs.writeFileSync(path.join(auditDir, 'notes.txt'), 'not a video');

        // 使用伪随机像素噪声 + 超低 qp 保证真实码率显著高于 2500 kbps
        execFileSync('ffmpeg', [
          '-y',
          '-f', 'lavfi', '-i', 'nullsrc=s=640x360:d=2:r=24,geq=random(1)*255:128:128',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '12', '-pix_fmt', 'yuv420p',
          highBitrateMp4
        ], { stdio: 'ignore' });

        execFileSync('ffmpeg', [
          '-y',
          '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2:r=24',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '200k', '-pix_fmt', 'yuv420p',
          lowBitrateMp4
        ], { stdio: 'ignore' });

        fs.copyFileSync(highBitrateMp4, hiddenMp4);

        const auditRes = await editor.auditHighBitrateVideos({
          targetPaths: [auditDir],
          minBitrateKbps: 2000,
          targetBitrateKbps: 1000,
          minSizeMB: 0
        });
        assert.strictEqual(auditRes.success, true, auditRes.error);
        assert.strictEqual(auditRes.totalScanned, 2, '应仅扫描 2 个可见视频，忽略 txt 与隐藏文件');
        assert.strictEqual(auditRes.candidates.length, 1, '应仅命中高码率视频');
        assert.strictEqual(auditRes.candidates[0].name, 'high_bitrate.mp4');
        assert.ok(auditRes.candidates[0].bitrateKbps >= 2000, `实测码率异常: ${auditRes.candidates[0].bitrateKbps}`);
        assert.ok(auditRes.candidates[0].estimatedSavingsBytes > 0);
        assert.strictEqual(auditRes.totalEstimatedSavingsBytes, auditRes.candidates[0].estimatedSavingsBytes);
        console.log('[PASS] 3. bitrateAudit 高码率视频瘦身探测与预计省空间实测');
      } else {
        console.log('[PASS] 2-3. videoEditor & bitrateAudit 纯逻辑校验通过（未检测到 ffmpeg，跳过子进程实测）');
      }
    } finally {
      Module._load = origLoad;
    }

    // 4. 局域网 Web 独立 localStorage 断点续播脚本真实执行测试
    const { lanWebPreviewAndSearchScripts } = require(
      bundleToCjs(path.join(rootDir, 'electron/lanWeb/scripts/previewAndSearch.ts'), 'lanPreview.cjs')
    );
    const store = new Map();
    const videoListeners = {};
    const mockVideo = {
      src: '',
      currentTime: 0,
      duration: 200,
      play: () => Promise.resolve(),
      pause: () => {},
      removeAttribute: () => {},
      load: () => {},
      addEventListener: (ev, fn) => {
        videoListeners[ev] = videoListeners[ev] || [];
        videoListeners[ev].push(fn);
      },
      emit: (ev) => (videoListeners[ev] || []).forEach((fn) => fn())
    };
    const toasts = [];
    const sandbox = {
      window: { location: { origin: 'http://192.168.1.5:8899' }, scrollY: 0, scrollTo: () => {} },
      document: {
        documentElement: { scrollTop: 0 },
        addEventListener: () => {},
        getElementById: (id) => (id === 'main-video' ? mockVideo : { innerText: '', style: {}, className: '', src: '', addEventListener: () => {} })
      },
      requestAnimationFrame: () => {},
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v))
      },
      state: { token: 'tok' },
      showToast: (msg) => toasts.push(msg),
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
      refreshBtn: { addEventListener: () => {} },
      openVideoModalRef: null
    };
    vm.createContext(sandbox);
    vm.runInContext(lanWebPreviewAndSearchScripts + '\nopenVideoModalRef = openVideoModal;', sandbox);

    sandbox.openVideoModalRef({ path: '/media/demo.mp4', name: 'demo.mp4' });
    mockVideo.currentTime = 45.4;
    sandbox.window.closeVideoModal();
    assert.strictEqual(JSON.parse(store.get('velora_lan_playback_progress_v1'))['/media/demo.mp4'].position, 45.4);

    mockVideo.currentTime = 0;
    sandbox.openVideoModalRef({ path: '/media/demo.mp4', name: 'demo.mp4' });
    mockVideo.emit('loadedmetadata');
    assert.strictEqual(mockVideo.currentTime, 45.4);
    assert.ok(toasts.some((t) => t.includes('已续播至 00:45')));

    mockVideo.emit('ended');
    assert.strictEqual(JSON.parse(store.get('velora_lan_playback_progress_v1'))['/media/demo.mp4'], undefined);
    console.log('[PASS] 4. lanWeb 独立 localStorage 断点续播脚本校验');

    // 5. 本地视频剪辑时间码格式化、解析与修饰键步长映射校验
    const playerTypesMod = require(
      bundleToCjs(path.join(rootDir, 'src/composables/videoPlayer/types.ts'), 'videoPlayerTypes.cjs')
    );
    assert.strictEqual(playerTypesMod.formatEditTime(0), '00:00.0');
    assert.strictEqual(playerTypesMod.formatEditTime(85.44), '01:25.4');
    assert.strictEqual(playerTypesMod.formatEditTime(5058.4), '01:24:18.4');
    assert.strictEqual(playerTypesMod.formatEditTime(85.4, true), '00:01:25.4');
    assert.strictEqual(playerTypesMod.parseEditTime('01:24:18.4'), 5058.4);
    assert.strictEqual(playerTypesMod.parseEditTime('12:34.5'), 754.5);
    assert.strictEqual(playerTypesMod.parseEditTime('45.2'), 45.2);
    assert.strictEqual(playerTypesMod.parseEditTime('invalid'), null);
    assert.strictEqual(playerTypesMod.parseEditTime('-5'), null);
    assert.deepStrictEqual(playerTypesMod.resolveStepByModifiers({}), { step: 1, label: '1s', modifier: '' });
    assert.deepStrictEqual(playerTypesMod.resolveStepByModifiers({ altKey: true }), { step: 0.1, label: '0.1s', modifier: 'Alt' });
    assert.deepStrictEqual(playerTypesMod.resolveStepByModifiers({ ctrlKey: true }), { step: 10, label: '10s', modifier: 'Ctrl' });
    assert.deepStrictEqual(playerTypesMod.resolveStepByModifiers({ metaKey: true }), { step: 10, label: '10s', modifier: 'Ctrl' });
    assert.deepStrictEqual(playerTypesMod.resolveStepByModifiers({ shiftKey: true }), { step: 60, label: '60s', modifier: 'Shift' });
    assert.deepStrictEqual(
      playerTypesMod.resolveStepByModifiers({ shiftKey: true, ctrlKey: true, altKey: true }),
      { step: 60, label: '60s', modifier: 'Shift' }
    );
    assert.deepStrictEqual(
      playerTypesMod.resolveStepByModifiers({ ctrlKey: true, altKey: true }),
      { step: 10, label: '10s', modifier: 'Ctrl' }
    );
    assert.strictEqual(
      playerTypesMod.buildLocalStreamUrl('F:\\Videos\\尼古喵喵_第01集.mp4', 18080, 'tok_1', 999),
      `http://127.0.0.1:18080/stream?path=${encodeURIComponent('F:/Videos/尼古喵喵_第01集.mp4')}&_v=999&token=tok_1`
    );
    assert.strictEqual(
      playerTypesMod.buildLocalStreamUrl('velora://local/D%3A%2Fclip.mp4', 18080, 'tok_2', 123),
      `http://127.0.0.1:18080/stream?path=${encodeURIComponent('D:/clip.mp4')}&_v=123&token=tok_2`
    );
    assert.strictEqual(
      playerTypesMod.buildLocalStreamUrl('https://cdn.example.com/a.mp4', 18080, 'tok_2', 123),
      'https://cdn.example.com/a.mp4'
    );
    console.log('[PASS] 5. videoPlayer/types 本地流 URL、时间码与修饰键步长映射校验');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
