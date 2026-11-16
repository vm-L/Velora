import { BrowserWindow, Tray, screen, ipcMain, app } from 'electron';
import path from 'path';
import { logger } from './logger';
import { TaskStats } from './downloader';

export interface TrayCallbacks {
  onShowApp: () => void;
  onResumeAll: () => void;
  onPauseAll: () => void;
  onQuitApp: () => void;
  getTaskStats?: () => TaskStats;
}

let trayWindow: BrowserWindow | null = null;
let currentTheme: string = 'light';
let lastStats: TaskStats = {
  downloadingCount: 0,
  queuedCount: 0,
  compressingCount: 0,
  speed: 0,
  speedText: '0 B/s'
};
let hasPausedTasksState = true;

const TRAY_WINDOW_WIDTH = 175;
const TRAY_WINDOW_HEIGHT = 172;

function getTrayMenuHtml(theme: string): string {
  const isDark = theme === 'dark';

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${isDark ? 'dark' : 'light'}">
<head>
  <meta charset="utf-8">
  <title>Velora Tray</title>
  <style>
    :root {
      --bg-surface: oklch(100% 0 0);
      --bg-surface-hover: oklch(97.5% 0.008 90);
      --bg-surface-active: oklch(96% 0.01 90);
      --text-primary: oklch(38% 0.01 90);
      --text-secondary: oklch(62% 0.01 90);
      --text-tertiary: oklch(76% 0.01 90);
      --color-accent: oklch(30% 0.01 90);
      --border-color: oklch(93% 0.01 90);
      --border-light: oklch(96% 0.006 90);
      --footer-bg: oklch(98.5% 0.005 90);
      --color-success: oklch(62% 0.18 150);
    }

    [data-theme='dark'] {
      --bg-surface: oklch(18% 0.005 90);
      --bg-surface-hover: oklch(23% 0.005 90);
      --bg-surface-active: oklch(27% 0.005 90);
      --text-primary: oklch(95% 0.005 90);
      --text-secondary: oklch(75% 0.005 90);
      --text-tertiary: oklch(60% 0.005 90);
      --color-accent: oklch(90% 0.01 90);
      --border-color: oklch(28% 0.005 90);
      --border-light: oklch(24% 0.005 90);
      --footer-bg: oklch(15.5% 0.005 90);
      --color-success: oklch(74% 0.18 150);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
    }

    body {
      background: transparent;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .menu-card {
      width: 100%;
      height: 100%;
      background: var(--bg-surface);
      border-radius: 10px;
      border: 1px solid var(--border-color);
      box-shadow: none;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      transform-origin: bottom left;
      animation: menuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes menuFadeIn {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .menu-body {
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 7px;
      height: 28px;
      padding: 0 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease;
    }

    .menu-item:hover {
      background: var(--bg-surface-hover);
    }

    .menu-item:active {
      background: var(--bg-surface-active);
    }

    .menu-item.disabled {
      opacity: 0.42;
      pointer-events: none;
      cursor: default;
    }

    .menu-item svg {
      width: 13px;
      height: 13px;
      stroke-width: 2;
      flex-shrink: 0;
      color: var(--text-secondary);
    }

    .menu-item:hover svg {
      color: var(--text-primary);
    }

    .menu-divider {
      height: 1px;
      background: var(--border-light);
      margin: 2px 5px;
    }

    /* Footer Bar */
    .menu-footer {
      height: 32px;
      background: var(--footer-bg);
      border-top: 1px solid var(--border-color);
      padding: 0 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--text-secondary);
    }

    .speed-section {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: -0.2px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .speed-section.active {
      color: var(--color-success);
    }

    .speed-icon {
      width: 10px;
      height: 10px;
      flex-shrink: 0;
    }

    .badges-section {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .badge-item {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      white-space: nowrap;
    }

    .badge-item b {
      color: var(--text-secondary);
      font-weight: 500;
    }

    .badge-item.highlight b {
      color: var(--text-primary);
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="menu-card">
    <div class="menu-body">
      <div class="menu-item" id="btn-show" onclick="handleClick('show')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
        <span>显示应用</span>
      </div>

      <div class="menu-divider"></div>

      <div class="menu-item" id="btn-resume" onclick="handleClick('resumeAll')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        <span>全部继续</span>
      </div>

      <div class="menu-item" id="btn-pause" onclick="handleClick('pauseAll')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        <span>全部暂停</span>
      </div>

      <div class="menu-divider"></div>

      <div class="menu-item" id="btn-quit" onclick="handleClick('quit')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
        <span>退出应用</span>
      </div>
    </div>

    <!-- Footer Bar -->
    <div class="menu-footer">
      <div class="speed-section" id="speed-container">
        <svg class="speed-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="4" x2="12" y2="18"></line>
          <polyline points="7 13 12 18 17 13"></polyline>
        </svg>
        <span id="speed-text">0 B/s</span>
      </div>

      <div class="badges-section">
        <span class="badge-item" id="badge-down">下载<b id="cnt-down">0</b></span>
        <span class="badge-item" id="badge-queue">队列<b id="cnt-queue">0</b></span>
        <span class="badge-item" id="badge-comp">压缩<b id="cnt-comp">0</b></span>
      </div>
    </div>
  </div>

  <script>
    function handleClick(action) {
      if (window.electronAPI && window.electronAPI.trayAction) {
        window.electronAPI.trayAction(action);
      }
    }

    window.updateStats = function(stats, hasPaused) {
      if (!stats) return;

      var speedTextEl = document.getElementById('speed-text');
      var speedContainer = document.getElementById('speed-container');
      var cntDown = document.getElementById('cnt-down');
      var cntQueue = document.getElementById('cnt-queue');
      var cntComp = document.getElementById('cnt-comp');
      var badgeDown = document.getElementById('badge-down');
      var badgeQueue = document.getElementById('badge-queue');
      var badgeComp = document.getElementById('badge-comp');
      var btnPause = document.getElementById('btn-pause');
      var btnResume = document.getElementById('btn-resume');

      if (speedTextEl) speedTextEl.innerText = stats.speedText || '0 B/s';
      if (speedContainer) {
        if (stats.speed > 0) {
          speedContainer.classList.add('active');
        } else {
          speedContainer.classList.remove('active');
        }
      }

      var down = stats.downloadingCount || 0;
      var queue = stats.queuedCount || 0;
      var comp = stats.compressingCount || 0;

      if (cntDown) cntDown.innerText = down;
      if (cntQueue) cntQueue.innerText = queue;
      if (cntComp) cntComp.innerText = comp;

      if (badgeDown) badgeDown.classList.toggle('highlight', down > 0);
      if (badgeQueue) badgeQueue.classList.toggle('highlight', queue > 0);
      if (badgeComp) badgeComp.classList.toggle('highlight', comp > 0);

      // 全部暂停：如果没有任何活跃/排队/压缩任务，置灰禁用
      if (btnPause) {
        var hasActive = (down > 0 || queue > 0 || comp > 0);
        btnPause.classList.toggle('disabled', !hasActive);
      }

      // 全部继续：如果有暂停的任务才启用
      if (btnResume) {
        btnResume.classList.toggle('disabled', !hasPaused);
      }
    };

    window.setTheme = function(theme) {
      document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    };
  </script>
</body>
</html>`;
}

export class TrayWindowManager {
  private tray: Tray | null = null;
  private callbacks: TrayCallbacks | null = null;
  private isVisible = false;

  init(tray: Tray, callbacks: TrayCallbacks, initialTheme: string = 'light') {
    this.tray = tray;
    this.callbacks = callbacks;
    currentTheme = initialTheme;

    this.createWindow();

    // 绑定系统托盘交互
    tray.on('right-click', () => {
      this.toggle();
    });

    // 注册 IPC 分发
    ipcMain.on('tray-action', (_event, action: string) => {
      this.hide();
      if (!this.callbacks) return;
      switch (action) {
        case 'show':
          this.callbacks.onShowApp();
          break;
        case 'resumeAll':
          this.callbacks.onResumeAll();
          break;
        case 'pauseAll':
          this.callbacks.onPauseAll();
          break;
        case 'quit':
          this.callbacks.onQuitApp();
          break;
      }
    });

    ipcMain.on('tray-paused-state', (_event, hasPaused: boolean) => {
      hasPausedTasksState = !!hasPaused;
      this.pushStatsToWindow();
    });
  }

  private createWindow() {
    if (trayWindow && !trayWindow.isDestroyed()) return;

    trayWindow = new BrowserWindow({
      width: TRAY_WINDOW_WIDTH,
      height: TRAY_WINDOW_HEIGHT,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      hasShadow: false, // 由 CSS box-shadow 实现平滑无瑕疵的投影
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    const html = getTrayMenuHtml(currentTheme);
    trayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    trayWindow.on('blur', () => {
      this.hide();
    });

    trayWindow.webContents.on('did-finish-load', () => {
      this.pushStatsToWindow();
    });

    trayWindow.webContents.on('dom-ready', () => {
      this.pushStatsToWindow();
    });
  }

  toggle() {
    if (this.isVisible && trayWindow && trayWindow.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    if (!trayWindow || trayWindow.isDestroyed()) {
      this.createWindow();
    }
    if (!trayWindow || !this.tray) return;

    if (this.callbacks?.getTaskStats) {
      try {
        lastStats = this.callbacks.getTaskStats();
      } catch {}
    }

    this.pushStatsToWindow();
    this.repositionWindow();

    trayWindow.show();
    trayWindow.focus();
    this.isVisible = true;
  }

  hide() {
    if (trayWindow && !trayWindow.isDestroyed() && trayWindow.isVisible()) {
      trayWindow.hide();
    }
    this.isVisible = false;
  }

  updateStats(stats: TaskStats, hasPausedTasks: boolean = true) {
    lastStats = stats;
    hasPausedTasksState = hasPausedTasks;
    this.pushStatsToWindow();
  }

  updateTheme(theme: string) {
    currentTheme = theme;
    if (!trayWindow || trayWindow.isDestroyed()) return;
    trayWindow.webContents.executeJavaScript(`
      window.setTheme && window.setTheme(${JSON.stringify(theme)});
    `).catch(() => {});
  }

  private pushStatsToWindow() {
    if (!trayWindow || trayWindow.isDestroyed()) return;
    const statsJson = JSON.stringify(lastStats);
    const hasPausedJson = JSON.stringify(hasPausedTasksState);

    trayWindow.webContents.executeJavaScript(`
      window.updateStats && window.updateStats(${statsJson}, ${hasPausedJson});
    `).catch(() => {});
  }

  private repositionWindow() {
    if (!trayWindow) return;

    // 获取鼠标当前绝对屏幕坐标
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const bounds = display.bounds;

    // 核心定位：菜单左下角精确对齐鼠标指针坐标
    // 左边界 = cursor.x，下边界 = cursor.y
    let posX = cursor.x;
    let posY = cursor.y - TRAY_WINDOW_HEIGHT;

    // 水平边界碰撞保护 (若向右超出屏幕边界，贴靠屏幕右侧)
    if (posX + TRAY_WINDOW_WIDTH > bounds.x + bounds.width) {
      posX = bounds.x + bounds.width - TRAY_WINDOW_WIDTH;
    }
    if (posX < bounds.x) {
      posX = bounds.x;
    }

    // 垂直边界碰撞保护 (若向上超出屏幕顶部，则翻转向下展开至鼠标下方)
    if (posY < bounds.y) {
      posY = cursor.y;
    }
    if (posY + TRAY_WINDOW_HEIGHT > bounds.y + bounds.height) {
      posY = bounds.y + bounds.height - TRAY_WINDOW_HEIGHT;
    }

    trayWindow.setPosition(Math.round(posX), Math.round(posY));
  }
}

export const trayWindowManager = new TrayWindowManager();
