export function getSplashHtml(theme: string, iconDataUrl: string, version: string = "1.4.0"): string {
  const isDark = theme === "dark";

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${isDark ? 'dark' : 'light'}">
<head>
  <meta charset="utf-8">
  <title>Velora</title>
  <style>
    :root {
      --bg-surface: oklch(100% 0 0);
      --text-primary: oklch(38% 0.01 90);
      --text-secondary: oklch(62% 0.01 90);
      --color-accent: oklch(30% 0.01 90);
      --border-color: oklch(93% 0.01 90);
      --track-bg: oklch(94% 0.008 90);
      --shadow-card: 0 16px 40px -8px rgba(0, 0, 0, 0.08), 0 0 0 1px oklch(93% 0.01 90);
      --shadow-logo: 0 4px 14px rgba(0, 0, 0, 0.04);
    }

    [data-theme='dark'] {
      --bg-surface: oklch(18% 0.005 90);
      --text-primary: oklch(95% 0.005 90);
      --text-secondary: oklch(75% 0.005 90);
      --color-accent: oklch(90% 0.01 90);
      --border-color: oklch(28% 0.005 90);
      --track-bg: oklch(25% 0.005 90);
      --shadow-card: 0 24px 50px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px oklch(28% 0.005 90);
      --shadow-logo: 0 4px 14px rgba(0, 0, 0, 0.35);
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
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      overflow: hidden;
      transition: opacity 0.25s ease-out, transform 0.25s ease-out;
    }
    body.fade-out {
      opacity: 0;
      transform: scale(0.96);
    }
    .splash-card {
      width: 360px;
      height: 220px;
      background: var(--bg-surface);
      border-radius: 16px;
      box-shadow: var(--shadow-card);
      border: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 26px 28px 22px;
      position: relative;
      overflow: hidden;
    }
    .top-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      margin-top: 4px;
    }
    .logo-box {
      width: 54px;
      height: 54px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: var(--shadow-logo);
      border: 1px solid var(--border-color);
      background: var(--bg-surface);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: logo-breathe 2.4s ease-in-out infinite alternate;
    }
    @keyframes logo-breathe {
      0% { transform: scale(1); }
      100% { transform: scale(1.04); }
    }
    .logo-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .version-tag {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-secondary);
      padding: 1px 6px;
      background: var(--track-bg);
      border-radius: 10px;
    }
    .bottom-section {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .status-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
      letter-spacing: 0.2px;
      animation: text-pulse 2s ease-in-out infinite alternate;
    }
    @keyframes text-pulse {
      0% { opacity: 0.75; }
      100% { opacity: 1; }
    }
    .progress-track {
      width: 100%;
      height: 3px;
      background: var(--track-bg);
      border-radius: 2px;
      overflow: hidden;
      position: relative;
    }
    .progress-fill {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 38%;
      background: linear-gradient(90deg, transparent 0%, var(--color-accent) 50%, transparent 100%);
      border-radius: 2px;
      animation: indeterminate-shimmer 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }
    @keyframes indeterminate-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(300%); }
    }
  </style>
</head>
<body>
  <div class="splash-card">
    <div class="top-section">
      <div class="logo-box">
        ${iconDataUrl ? `<img src="${iconDataUrl}" class="logo-img" alt="Velora" />` : `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-accent);">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        `}
      </div>
      <div class="brand-title">
        Velora
        <span class="version-tag">v${version}</span>
      </div>
    </div>
    <div class="bottom-section">
      <div class="status-row">
        <span class="status-text" id="status-text">正在启动应用...</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
    </div>
  </div>
  <script>
    window.setTheme = function(theme) {
      document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    };
    window.setStatusText = function(text) {
      var label = document.getElementById("status-text");
      if (label && text) label.textContent = text;
    };
  </script>
</body>
</html>`;
}
