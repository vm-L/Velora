# FFmpeg 与音视频处理工程化规范 (FFmpeg & Media Processing Standards)

本规约适用于本项目所有涉及 FFmpeg / FFprobe 调用的业务模块（包括视频下载合并、分片裁剪、视频合并、码率压缩、元数据探测等）。旨在保障音视频处理的高性能、高稳定性、跨平台硬件兼容性与文件系统安全性。

---

## 1. 核心架构与决策漏斗 (Three-tier Media Decision Funnel)

在执行任何音视频处理任务（裁剪、合并、封装、转码）时，**严禁直接无脑调用 CPU 慢速重编码**，必须严格按照以下三层决策漏斗进行处理：

```mermaid
flowchart TD
    Start["发起音视频处理任务 (裁剪 / 合并 / 封装)"] --> CheckCopy{"① 能否使用无损流复制？<br/>(-c copy / TS封装)"}
    CheckCopy -- "可以" --> TryStreamCopy["执行无损流复制 (-c copy)<br/>(0ms 耗时 / 零画质损失)"]
    TryStreamCopy --> ValidateCopy{"产物有效性与时长校验<br/>(是否存在 DTS/PTS 漂移？)"}
    ValidateCopy -- "校验通过 (时长误差 <= 1.0s)" --> Finalize["原子写入目标路径并返回成功"]
    ValidateCopy -- "校验失败 / 流复制出错" --> FallbackGPU["降级为智能重编码"]
    CheckCopy -- "不可用 (如滤镜、缩放、压缩)" --> FallbackGPU
    FallbackGPU --> GetEncoders["② 读取 GPU 硬件加速调度链<br/>(gpuAccelerator.getAvailableEncoders)"]
    GetEncoders --> LoopEncoders["③ 遍历可用编码器<br/>(NVENC -> QSV -> AMF -> VideoToolbox)"]
    LoopEncoders --> RunEncode{"当前编码器执行成功？"}
    RunEncode -- "成功" --> Finalize
    RunEncode -- "异常 / 不支持" --> TryNext{"还有下一个编码器？"}
    TryNext -- "是" --> LoopEncoders
    TryNext -- "否 (GPU全失败)" --> CpuFallback["④ CPU 软件重编码保底<br/>(libx264)"]
    CpuFallback --> Finalize
```

---

## 2. GPU 硬件加速优先调度与 CPU 回退规范 (Hardware Acceleration Standards)

所有需要进行视频重编码的操作，**必须统一调用 [`electron/gpuAccelerator.ts`](file:///mnt/f/project/tools/Velora/electron/gpuAccelerator.ts) 模块**，严禁在业务代码中硬编码 `-c:v libx264`。

### 2.1 调度优先级标准
系统必须按以下优先级尝试可用的硬件加速编码器：
$$\text{h264\_nvenc (NVIDIA)} \rightarrow \text{h264\_qsv (Intel)} \rightarrow \text{h264\_amf (AMD)} \rightarrow \text{h264\_videotoolbox (Apple Silicon)} \rightarrow \text{libx264 (CPU 保底)}$$

### 2.2 编码器参数适配矩阵 (Encoder Argument Matrix)
统一使用 `getEncoderArgs(encoder, options)` 生成对应的 FFmpeg 编码参数：

| 编码器 (Encoder) | 画质恒定模式 (`mode: 'quality'`) | 目标码率模式 (`mode: 'bitrate'`) |
| :--- | :--- | :--- |
| **`h264_nvenc`** (NVIDIA) | `-c:v h264_nvenc -preset p4 -cq 22` | `-c:v h264_nvenc -preset fast -b:v <B>k -maxrate <1.5B>k -bufsize <2B>k` |
| **`h264_qsv`** (Intel) | `-c:v h264_qsv -preset fast -global_quality 22` | `-c:v h264_qsv -preset fast -b:v <B>k -maxrate <1.5B>k -bufsize <2B>k` |
| **`h264_amf`** (AMD) | `-c:v h264_amf -quality speed -rc cqp -qp_i 22 -qp_p 22` | `-c:v h264_amf -quality speed -b:v <B>k -maxrate <1.5B>k -bufsize <2B>k` |
| **`h264_videotoolbox`** (Apple) | `-c:v h264_videotoolbox -q:v 60` | `-c:v h264_videotoolbox -b:v <B>k -maxrate <1.5B>k -bufsize <2B>k` |
| **`libx264`** (CPU 保底) | `-c:v libx264 -preset fast -crf 20` | `-c:v libx264 -preset fast -b:v <B>k -maxrate <1.5B>k -bufsize <2B>k` |

### 2.3 异常捕获与循环回退模板 (Code Pattern)
```ts
const encoders = await getAvailableEncoders()
let encodeSuccess = false
let lastError = ''

for (const encoder of encoders) {
  if (cancelledTasks.has(taskId)) return { success: false, error: '操作已取消' }
  if (fs.existsSync(tempOutputFile)) {
    try { fs.unlinkSync(tempOutputFile) } catch {}
  }

  const encArgs = getEncoderArgs(encoder, { mode: 'quality' })
  const args = [
    '-y',
    '-progress', 'pipe:1',
    '-i', sourcePath,
    ...encArgs,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    tempOutputFile
  ]

  const isGpu = isGpuEncoder(encoder)
  logger.info('MediaEngine', `尝试使用编码器 [${encoder}] (${isGpu ? 'GPU硬件加速' : 'CPU'})`)

  const res = await runFfmpegCommand(taskId, args, onProgress)
  if (res.success && fs.existsSync(tempOutputFile) && fs.statSync(tempOutputFile).size > 0) {
    encodeSuccess = true
    break
  } else {
    lastError = res.error || res.stderr || ''
    logger.warn('MediaEngine', `编码器 [${encoder}] 执行失败: ${lastError}，尝试下一个编码器`)
  }
}

if (!encodeSuccess) {
  return { success: false, error: `音视频处理失败: ${lastError}` }
}
```

### 2.4 转码重编码码率自适应天花板 (Bitrate Ceiling) 规范
当音视频处理任务因流复制失效降级为转码/重编码（如多视频拼接、滤镜缩放）时，**严禁无约束以固定 CRF / CQ 编码**导致产物文件体积无序膨胀（例如网络流媒体低码率原片经默认参数二次编码导致体积膨胀 2~3 倍）。

1. **原片加权平均码率计算**：
   $$\text{avgBitrateKbps} = \frac{\sum \text{FileSizeBytes} \times 8}{\sum \text{DurationSeconds} \times 1000}$$
2. **动态设定码率天花板（1.15x Headroom）**：
   $$\text{capBitrateKbps} = \max\left(500, \text{round}(\text{avgBitrateKbps} \times 1.15)\right)$$
3. **注入编码器参数**：
   在调用 `getEncoderArgs(encoder, { mode: 'quality', maxrateKbps: capBitrateKbps })` 时传入 `maxrateKbps`，编码器自动追加 `-maxrate <cap>k -bufsize <2*cap>k` 参数，在保障二次有损重编码画质的同时，锁定产物体积不超出原始总体积的 100%~115%。

---

## 3. 双层视频元数据探测规范 (Robust Metadata Probing)

获取视频时长（Duration）、分辨率（Width/Height）、帧率（FPS）及音频流存在性时，**必须具备双层回退链**，严禁因环境缺少 `ffprobe` 导致返回 `duration: 0`。

### 3.1 探测工作流
1. **首选 `ffprobe`（结构化 JSON）**：
   - 执行 `ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,width,height,r_frame_rate -of json <filePath>`。
   - 若解析出有效 `duration > 0` 则直接返回。
2. **保底 `ffmpeg -i`（正则解析）**：
   - 若 `ffprobe` 进程 spawn 报错（如 `ENOENT`）、退出码非 0 或未解析到时长，**必须自动回退** 执行 `ffmpeg -i <filePath>`。
   - 解析 stderr 中的 `Duration: hh:mm:ss.xx`、`Stream #... Video: ... WxH`、`... fps` 以及音频流标记。

---

## 4. 实时进度监控与 IPC 通信规约 (Progress Monitoring & Telemetry)

### 4.1 FFmpeg 命令行参数规范
- 执行 FFmpeg 命令时，必须在输入参数前加入 `-progress pipe:1`。
- 监听子进程的 `stdout`，按行切分并处理。

### 4.2 解析与去重规约 (Deduplication)
由于单次 stdout 数据块可能同时包含 `out_time_us`、`out_time_ms` 与 `out_time`，**必须在每次 chunk 解析中提取最新的有效秒数并仅触发一次 `onProgress` 回调**：
```ts
proc.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk.toString()
  const lines = stdoutBuffer.split('\n')
  stdoutBuffer = lines.pop() || ''

  let progressSec: number | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('out_time_us=')) {
      const val = parseInt(trimmed.substring(12), 10)
      if (!isNaN(val) && val >= 0) {
        progressSec = val / 1000000
      }
    } else if (trimmed.startsWith('out_time=')) {
      const timeParts = trimmed.substring(9).split(':')
      if (timeParts.length === 3) {
        const h = parseFloat(timeParts[0]) || 0
        const m = parseFloat(timeParts[1]) || 0
        const s = parseFloat(timeParts[2]) || 0
        const parsed = h * 3600 + m * 60 + s
        if (!isNaN(parsed) && parsed >= 0) {
          progressSec = parsed
        }
      }
    }
  }

  if (progressSec !== null && onProgress) {
    onProgress(progressSec)
  }
})
```

### 4.3 进度百分比与分段权重
- **0% ~ 5%**：元数据分析与准备阶段。
- **5% ~ 95%**：处理核心阶段，基于探测到的实际总时长 `(sec / totalDuration)` 线性计算。
- **98%**：完成编码，正在执行原子落盘与写入文件。
- **100%**：完成全部流程。

---

## 5. 临时文件生命周期与原子落盘安全 (File Lifecycle & Safety)

### 5.1 统一应用目录操作与源目录防污染
- **严禁污染源目录**：所有音视频切片分片（`editVideoSegments`）、视频合并（`mergeVideos`）、视频压缩（`compressVideo`）的中间分段与 Concat 清单文件，必须统一在应用数据临时目录操作：`getAppTempDir()`（即 `app.getPath('userData')/tmp` 或可执行文件目录下的 `tmp/`）。
- 绝不在源视频文件或目标输出路径所在目录创建任何中间分片、临时合并文件或 probe 探测文件，保持源目录与目标目录 100% 洁净。
- 文件命名约定：必须包含业务前缀、时间戳与随机唯一标识（如 `velora_edit_${Date.now()}_${randToken}_seg_${i}.mp4`、`velora_merge_${Date.now()}_${randToken}_concat.txt`）。

### 5.2 双重磁盘空间预检 (Dual Disk Space Pre-check)
- 由于应用临时目录（通常位于系统盘 C 盘）与用户源目录/目标输出目录可能分属不同磁盘分区，转码前必须分别执行双重空间检查：
  1. **应用临时目录预检**：预留转码切片与中间清单的处理空间（如源文件的 1.1x ~ 1.2x，或至少 50MB）；
  2. **目标磁盘预检**：当目标路径分区与应用临时目录不同时，预检目标目录是否能容纳最终产物（如 0.6x ~ 0.9x 源文件大小）；
- 空间不足时提前阻断并给出精准指向的中文错误提示（区分“应用临时目录空间不足”与“目标磁盘空间不足”）。

### 5.3 资源清理保证与自愈清理 (Cleanup & Self-Healing)
- **单次任务保障**：记录所有创建的中间文件与清单路径 `tempFilesToClean: string[]`，必须在 `finally` 块中遍历执行无条件删除（`fs.rmSync(file, { force: true })`）。
- **启动自愈清理**：在应用启动阶段（`app.whenReady()` 首要执行）调用 `cleanupAppTempDir()`，自动扫描并清理应用临时目录中因应用崩溃或异常强退遗留的历史孤儿临时文件（匹配 `velora_*` 或 `~velora_*`）。

### 5.4 原子迁移与跨盘兼容
- 将临时文件移动至最终目标路径时，统一调用 `moveOrCopyFile`：
  - **同分区**：调用 `fs.renameSync(tempFile, targetPath)` 实现秒级原子替换。
  - **跨分区**：捕获 `EXDEV`（跨设备链接）错误，平滑降级为 `fs.copyFileSync` + `fs.unlinkSync` 复制后删除临时文件。
- **元数据与时间戳保护**：覆盖已有原文件时（如原位剪辑保存），必须预先记录源文件的 `mtime` / `atime`，完成写入后通过 `fs.utimesSync` 精准恢复，避免破坏系统文件管理器的排序状态。

---

## 6. 开发自检清单 (Self-Verification Checklist)

在修改或新增任何音视频处理逻辑后，必须完成以下自检确认：

- [ ] **无死写 libx264**：所有视频转码操作均统一通过 `getAvailableEncoders()` 与 `getEncoderArgs()` 调度。
- [ ] **具备 GPU 回退能力**：转码执行逻辑包裹在编码器遍历循环中，GPU 失败自动降级到 CPU。
- [ ] **码率天花板约束**：二次转码合并时已计算输入源文件平均码率并注入 1.15x `maxrateKbps` 码率上限，防止产物体积异常膨胀。
- [ ] **流复制校验完整**：使用 `-c copy` 的地方均配备产物大小及时长有效性校验。
- [ ] **双层元数据探测**：`probeVideo` 具备 `ffprobe -> ffmpeg -i` 完整回退，不返回 0 时长。
- [ ] **进度解析无重复**：`stdout` 进度解析单 chunk 内已去重。
- [ ] **临时文件必清理**：所有中间产物均在 `finally` 块中执行清理。
- [ ] **轻量校验通过**：运行 `rtk npx vue-tsc --noEmit` 确保 0 错误（严禁/无需运行 build）。
