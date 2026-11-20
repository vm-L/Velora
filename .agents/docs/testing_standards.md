# 非 UI 功能与漏洞测试规约 (Non-UI Testing Standards)

本规约适用于本项目所有非 UI 漏洞排查/修复及非 UI 新功能的开发验证流程。旨在确保关键业务逻辑经过真实函数调用与实测通过后再定稿应用，避免仅靠静态阅读推理导致回归或假修复。

---

## 1. 适用范围 (Scope)

凡涉及以下任意非 UI 模块的缺陷排查、修复或新功能开发，均须遵守本规约：

- `electron/` 主进程核心模块：下载引擎（HTTP/Range、M3U8 解析与分片合并）、网盘解析与直链调度（`electron/pan/`）、FFmpeg / GPU 音视频处理（`electron/videoEditor.ts`、`electron/gpuAccelerator.ts`）、配置持久化（`electron/store.ts`）、局域网服务（`electron/lanServer.ts`）等。
- `src/` 渲染进程非界面逻辑：`src/utils/`、`src/services/`、`src/composables/` 中的纯逻辑、解析规则与数据处理函数。

---

## 2. 核心测试流程 (Test-First & Verify-Before-Apply)

### 2.1 在 `test/` 创建对应测试文件
- 按当前排查的问题或开发的功能主题，在项目根目录 `test/` 下创建对应的独立测试文件（如 `test/test-<topic>.cjs`、`.mjs` 或 `.ts`）。
- `test/` 已配置在仓库根目录 `.gitignore` 中，不会污染正式源码提交记录；针对核心修复可保留为回归测试脚本（具体运行产生的临时产物须清理）。

### 2.2 直接调用项目真实功能函数
- 测试文件**必须直接导入或打包项目中的真实业务模块与目标功能函数**进行调用验证（例如 `downloader.startDownload`、`parseM3U8`、`getEncoderArgs`、`panService`、`editVideoSegments` 等）。
- **严禁**仅靠阅读代码臆测效果，或编写脱离项目实际源码的独立模拟脚本（Mock-only reimplementation）来替代对真实功能函数的调用。
- 按运行环境选择执行方式：
  - **依赖 Electron 主进程 API（`app`、`session`、`net` 等）的模块**：使用 `esbuild --bundle --platform=node --format=cjs --external:electron` 将测试入口与真实源码打包后，拉起本地 `node_modules/electron/dist/electron` 进程直接调用真实函数（可参考 `test/test-error-download.cjs` 模式）。
  - **纯 Node / TypeScript 逻辑函数**：直接使用 `node` 或经 `esbuild` 编译后运行，直接调用对应导出函数进行输入输出断言。

### 2.3 覆盖关键验证维度
测试脚本应尽量覆盖以下 4 个维度：
1. **故障复现**：若为修复漏洞，先确认能够复现原始失败现象或瓶颈。
2. **核心正常路径**：验证真实函数在正常输入下的返回值、生成产物与性能指标（如文件内容/码流校验、吞吐率、退出码 `0`）。
3. **边界条件与异常回退**：验证空值、超时、网络抖动/错误码回退、非法路径或并发竞态下的行为。
4. **资源与状态清理**：验证取消/失败后文件句柄、子进程、定时器与临时文件能够正确释放，无残留阻塞。

### 2.4 验证通过后再正式应用
- **必须确认测试脚本稳定通过（退出码 `0` 且核心断言/输出符合预期）后，方可定稿应用对应代码修改。**
- 每次调整核心实现代码后，须重新执行对应测试文件做回归验证，确保未破坏既有行为。
- 完成代码改动后，须配合运行轻量类型校验：
  - 前端：`rtk npx vue-tsc --noEmit`
  - 主进程：`rtk npx tsc -p tsconfig.node.json --noEmit`

### 2.5 清理测试运行产物
- 测试脚本运行过程中产生的临时下载文件、音视频样本、日志（`app.log`）及临时 `userData` 目录，必须在测试结束的 `finally` 块中自动清理，严禁在工作区留下大体积测试产物或临时目录。

---

## 3. 自检清单 (Self-Verification Checklist)

- [ ] **测试文件落位 `test/`**：已针对本次非 UI 问题或功能在 `test/` 下创建可运行的测试脚本。
- [ ] **直调真实功能函数**：测试脚本真实导入/打包并调用了目标源码函数，而非独立手写替代逻辑。
- [ ] **关键路径与边界验证通过**：测试覆盖正常输出与异常/边界场景，且在最后一次代码修改后运行退出码为 `0`。
- [ ] **临时产物已清理**：测试下载文件、临时日志及临时目录已清理干净。
- [ ] **类型校验通过**：`rtk npx vue-tsc --noEmit`（及主进程改动时的 `rtk npx tsc -p tsconfig.node.json --noEmit`）均 0 错误通过。
