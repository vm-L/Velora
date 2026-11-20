# Velora 协作开发指南 (AGENTS.md)

Velora 基于 **Electron + Vue 3 + TypeScript + Vite** 构建（`electron/` 为主进程与底层能力，`src/` 为渲染进程与前端界面）。执行 Shell 命令时请统一使用 `rtk` 前缀；日常类型自检优先运行 `rtk npx vue-tsc --noEmit`（涉及 `electron/` 改动时同步运行 `rtk npx tsc -p tsconfig.node.json --noEmit`），常规自检无需运行完整打包 build。

---

## 规范文档按需阅读路由

**触发以下任一操作前，必须先读取 `.agents/docs/` 中对应的工程规范文档，并严格遵守其中的强制条款与自检清单：**

| 触发场景 / 操作类型 | 必读文档路径 | 核心约束摘要 |
| :--- | :--- | :--- |
| **前端 UI 组件、页面、图标、模块导入、文案、Toast / 持久通知** | `.agents/docs/ui_component_standards.md` | 强制 `@/` 别名导入；三层组件复用/扩展漏斗；禁用原生表单/SVG 裸标签；`primary` 按钮严控铁律（仅直接生效或直接新增可用）；纯动词与无省略号文案；Toast/通知时长与后台静默规范 |
| **FFmpeg / FFprobe、视频剪辑、合并、压缩、GPU 硬件加速、元数据探测** | `.agents/docs/ffmpeg_media_processing_standards.md` | `-c copy` 优先与校验；统一调用 `electron/gpuAccelerator.ts` 调度与回退；二次重编码 `1.15x` 码率上限；双层元数据探测；`getAppTempDir()` 与原子落盘 |
| **非 UI 漏洞修复或非 UI 新功能开发与验证** | `.agents/docs/testing_standards.md` | 必须在 `test/` 创建对应测试文件，**直接调用项目真实功能函数**验证通过后再定稿应用，并自动清理测试运行产物 |
| **代码提交（`git commit` / 版本发布）** | `.agents/docs/code_review_and_commit_standards.md` | **严禁直接 `git commit`**；须先检阅冗余与边界问题、输出《代码质量检阅报告》并等待用户确认，再按多行规范提交 |

---

## 全局执行原则

1. **先读规范再动手**：命中有多个触发场景时，须读取全部相关文档后再开始设计与修改。
2. **非 UI 测试先行**：排查非 UI 漏洞或开发非 UI 核心功能时，先在 `test/` 下编写直调真实函数的测试脚本，实测通过后再应用定稿。
3. **轻量校验收尾**：代码修改完成后按改动范围执行类型校验（`vue-tsc` / `tsc -p tsconfig.node.json`）及对应 `test/` 测试脚本，确保全部通过。
4. **提交必须确认**：收到任何代码提交指令时，必须先输出《代码质量检阅报告》并暂停等待用户明确确认后，方可执行提交。
