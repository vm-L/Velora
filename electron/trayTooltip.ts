import { app, powerMonitor, screen, Tray } from 'electron';

export interface TrayTooltipGuard {
  restore: (force?: boolean) => boolean;
  setText: (text: string) => void;
  getText: () => string;
  dispose: () => void;
}

export interface SetupTrayTooltipOptions {
  startupRetryMs?: number;
  hoverThrottleMs?: number;
  debounceMs?: number;
}

/**
 * 为 Windows 系统托盘建立 Tooltip 守护与自愈机制。
 * 规避 Electron 43.2.0 在 TaskbarCreated 重建图标时丢失 szTip/NIF_TIP 及系统冷启动竞态的问题。
 */
export function setupTrayTooltip(
  tray: Tray,
  tooltipText = 'Velora',
  options: SetupTrayTooltipOptions = {}
): TrayTooltipGuard {
  const startupRetryMs = typeof options.startupRetryMs === 'number' ? options.startupRetryMs : 1500;
  const hoverThrottleMs = typeof options.hoverThrottleMs === 'number' ? options.hoverThrottleMs : 2000;
  const debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : 300;

  let currentText = (typeof tooltipText === 'string' && tooltipText.trim()) ? tooltipText.trim() : 'Velora';
  let disposed = false;
  let lastHoverAt = 0;
  let startupTimer: NodeJS.Timeout | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  const applyTooltip = (): boolean => {
    if (disposed || !tray || tray.isDestroyed()) {
      return false;
    }
    try {
      tray.setToolTip(currentText);
      return true;
    } catch {
      return false;
    }
  };

  const scheduleRestore = () => {
    if (disposed) return;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      applyTooltip();
    }, debounceMs);
  };

  // 启动即刻设置，并在短暂延迟后补设一次规避外壳注册竞态
  applyTooltip();
  if (startupRetryMs > 0) {
    startupTimer = setTimeout(() => {
      startupTimer = null;
      applyTooltip();
    }, startupRetryMs);
  }

  const onShellChanged = () => {
    scheduleRestore();
  };

  const onMouseEnter = () => {
    const now = Date.now();
    if (lastHoverAt > 0 && now - lastHoverAt < hoverThrottleMs) {
      return;
    }
    if (applyTooltip()) {
      lastHoverAt = now;
    }
  };

  const isWin32 = process.platform === 'win32';
  let hasScreenListeners = false;
  let hasPowerListeners = false;

  if (isWin32) {
    if (app.isReady()) {
      try {
        screen.on('display-added', onShellChanged);
        screen.on('display-removed', onShellChanged);
        screen.on('display-metrics-changed', onShellChanged);
        hasScreenListeners = true;
      } catch {}
    }

    try {
      powerMonitor.on('resume', onShellChanged);
      powerMonitor.on('unlock-screen', onShellChanged);
      hasPowerListeners = true;
    } catch {}

    try {
      tray.on('mouse-enter', onMouseEnter);
    } catch {}
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (hasScreenListeners) {
      try {
        screen.off('display-added', onShellChanged);
        screen.off('display-removed', onShellChanged);
        screen.off('display-metrics-changed', onShellChanged);
      } catch {}
      hasScreenListeners = false;
    }
    if (hasPowerListeners) {
      try {
        powerMonitor.off('resume', onShellChanged);
        powerMonitor.off('unlock-screen', onShellChanged);
      } catch {}
      hasPowerListeners = false;
    }
    if (isWin32 && tray && !tray.isDestroyed()) {
      try {
        tray.off('mouse-enter', onMouseEnter);
      } catch {}
    }
  };

  return {
    restore: (force = true) => {
      if (force) {
        return applyTooltip();
      }
      const now = Date.now();
      if (lastHoverAt > 0 && now - lastHoverAt < hoverThrottleMs) {
        return false;
      }
      if (applyTooltip()) {
        lastHoverAt = now;
        return true;
      }
      return false;
    },
    setText: (text: string) => {
      currentText = (typeof text === 'string' && text.trim()) ? text.trim() : 'Velora';
      applyTooltip();
    },
    getText: () => currentText,
    dispose
  };
}
