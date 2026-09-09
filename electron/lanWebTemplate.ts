let cachedLanWebHtml: string | null = null;

export function getLanWebHtml(): string {
  if (cachedLanWebHtml) {
    return cachedLanWebHtml;
  }
  cachedLanWebHtml = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Velora - 本地资源</title>
  <link rel="icon" type="image/png" href="/icon.png">
  <style>
    /* Pristine Elegance OKLCH Theme Variables - 1:1 with Velora App */
    :root {
      --bg-app: oklch(98.5% 0.005 90);
      --bg-surface: oklch(100% 0 0);
      --bg-surface-hover: oklch(97.5% 0.008 90);
      --bg-surface-active: oklch(96.5% 0.01 90);
      --bg-tertiary: oklch(96% 0.006 90);

      --text-primary: oklch(38% 0.01 90);
      --text-secondary: oklch(62% 0.01 90);
      --text-tertiary: oklch(76% 0.01 90);
      --text-muted: oklch(70% 0.01 90);

      --color-accent: oklch(30% 0.01 90);
      --color-accent-hover: oklch(20% 0.01 90);
      --color-accent-text: #ffffff;
      --accent-color: var(--color-accent);
      --accent-hover: var(--color-accent-hover);
      --accent-light: oklch(92% 0.01 90);

      --border-color: oklch(93% 0.01 90);
      --border-light: oklch(96% 0.006 90);

      --shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.03), 0 4px 12px rgba(0, 0, 0, 0.02);
      --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.02);

      --color-success: oklch(68% 0.16 160);
      --color-error: oklch(62% 0.22 25);
      --color-warning: oklch(74% 0.17 70);
    }

    [data-theme='dark'] {
      --bg-app: oklch(15% 0.005 90);
      --bg-surface: oklch(18% 0.005 90);
      --bg-surface-hover: oklch(22% 0.005 90);
      --bg-surface-active: oklch(26% 0.005 90);
      --bg-tertiary: oklch(22% 0.005 90);

      --text-primary: oklch(95% 0.005 90);
      --text-secondary: oklch(75% 0.005 90);
      --text-tertiary: oklch(60% 0.005 90);
      --text-muted: oklch(50% 0.005 90);

      --color-accent: oklch(90% 0.01 90);
      --color-accent-hover: oklch(98.5% 0.01 90);
      --color-accent-text: oklch(15% 0.005 90);
      --accent-color: var(--color-accent);
      --accent-hover: var(--color-accent-hover);
      --accent-light: oklch(26% 0.005 90);

      --border-color: oklch(28% 0.005 90);
      --border-light: oklch(24% 0.005 90);

      --shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2);
      --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation: none;
      mix-blend-mode: normal;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
      scrollbar-width: none;
    }

    ::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }

    body {
      font-family: "Segoe UI", Arial, -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      background: var(--bg-app);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    input, textarea {
      user-select: text;
      -webkit-user-select: text;
      font-family: inherit;
    }

    /* Header Bar */
    header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 50;
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      box-shadow: var(--shadow-sm);
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 15px;
      color: var(--text-primary);
      text-decoration: none;
      flex-shrink: 0;
    }

    .brand-logo svg {
      color: var(--color-accent);
    }

    .brand-logo-img {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      object-fit: contain;
      box-shadow: var(--shadow-sm);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* VButton Component Style - 1:1 with VButton.vue */
    .v-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 14px;
      height: 32px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
      user-select: none;
      flex-shrink: 0;
      white-space: nowrap;
      text-decoration: none;
    }

    .v-btn-primary {
      background: var(--bg-surface);
      color: var(--color-accent);
      border-color: var(--color-accent);
    }

    .v-btn-primary:hover {
      background: var(--bg-surface-hover);
      color: var(--color-accent-hover);
      border-color: var(--color-accent-hover);
    }

    .v-btn-secondary {
      background: var(--border-light);
      color: var(--text-primary);
      border-color: var(--border-color);
    }

    .v-btn-secondary:hover {
      background: var(--border-color);
    }

    .v-btn-danger-soft {
      background: rgba(239, 68, 68, 0.1);
      color: var(--color-error);
      border-color: transparent;
    }

    .v-btn-danger-soft:hover {
      background: rgba(239, 68, 68, 0.2);
    }

    .v-btn-icon {
      padding: 0;
      width: 32px;
      height: 32px;
      background: transparent;
      color: var(--text-secondary);
      border-radius: 6px;
    }

    .v-btn-icon:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    .v-input {
      padding: 7px 12px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-size: 13px;
      outline: none;
      background: var(--bg-app);
      color: var(--text-primary);
      box-sizing: border-box;
      transition: border-color 0.2s;
    }

    .v-input:focus {
      border-color: var(--accent-color);
    }

    /* Main Container */
    main {
      flex: 1;
      max-width: 1360px;
      width: 100%;
      margin: 0 auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* Resource Switcher Tabs */
    .resource-tabs-wrap {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .resource-tab-item {
      padding: 6px 14px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .resource-tab-item:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    .resource-tab-item.active {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: var(--color-accent-text);
      box-shadow: var(--shadow-sm);
      font-weight: 600;
    }

    .resource-tab-item.active svg {
      stroke: var(--color-accent-text);
    }

    /* Workspace Toolbar */
    .workspace-toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      background: var(--bg-surface);
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
    }

    .toolbar-nav-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .nav-back-btn {
      width: 32px;
      height: 32px;
      padding: 0;
      flex-shrink: 0;
      border-radius: 6px;
      background: var(--border-light);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
    }

    .nav-back-btn:hover:not(:disabled) {
      background: var(--border-color);
      color: var(--color-accent);
    }

    .nav-back-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }

    .breadcrumb-container {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      white-space: nowrap;
      background: var(--bg-tertiary);
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--border-light);
      font-size: 13px;
      flex: 1;
      min-width: 0;
    }

    .breadcrumb-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: var(--text-secondary);
      padding: 2px 6px;
      border-radius: 4px;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .breadcrumb-item:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    .breadcrumb-item.active {
      font-weight: 600;
      color: var(--text-primary);
      cursor: default;
    }

    .breadcrumb-sep {
      color: var(--text-muted);
      font-size: 12px;
      flex-shrink: 0;
    }

    .toolbar-tools {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .search-wrap {
      position: relative;
      width: 170px;
    }

    .search-wrap .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      stroke: var(--text-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding-left: 28px !important;
      padding-right: 10px !important;
      font-size: 12px;
      height: 32px;
    }

    .sort-select {
      height: 32px;
      background: var(--bg-app);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 0 10px;
      font-size: 12px;
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s;
    }

    .sort-select:focus {
      border-color: var(--color-accent);
    }

    /* File Grid Layout - 1:1 with LocalWorkspace.vue */
    .file-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 14px;
    }

    @media (max-width: 640px) {
      .workspace-toolbar {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        padding: 10px 10px;
      }

      .toolbar-nav-group {
        width: 100%;
      }

      .toolbar-tools {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
      }

      .search-wrap {
        flex: 1;
        min-width: 0;
        width: auto !important;
      }

      .sort-select {
        flex-shrink: 0;
        max-width: 110px;
        padding: 0 4px;
        font-size: 11px;
      }

      .toolbar-tools .btn-text {
        display: none;
      }

      .toolbar-tools .v-btn {
        padding: 0 8px;
        min-width: 32px;
        height: 32px;
      }

      .file-grid {
        grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
        gap: 12px;
      }

      .file-card {
        padding: 14px 10px;
      }
    }

    .file-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
      text-align: center;
      box-shadow: var(--shadow-sm);
    }

    .file-card:hover {
      background: var(--bg-surface-hover);
      border-color: var(--border-color);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
    }

    .file-card:active {
      transform: scale(0.98);
    }

    .card-icon-wrap {
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      margin-bottom: 8px;
    }

    .file-svg {
      transition: transform 0.15s ease;
    }

    .folder-color {
      stroke: #f59e0b;
      fill: rgba(245, 158, 11, 0.15);
    }

    .video-color {
      stroke: #ef4444;
      fill: rgba(239, 68, 68, 0.12);
    }

    .audio-color {
      stroke: #8b5cf6;
      fill: rgba(139, 92, 246, 0.12);
    }

    .image-color {
      stroke: #10b981;
      fill: rgba(16, 185, 129, 0.12);
    }

    .code-color {
      stroke: #3b82f6;
    }

    .doc-color {
      stroke: var(--text-secondary);
    }

    .ext-badge {
      position: absolute;
      bottom: 0;
      right: 0;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-light);
      color: var(--text-secondary);
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      letter-spacing: 0.5px;
    }

    .card-info {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 3px;
      overflow: hidden;
    }

    .card-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      word-break: break-all;
      white-space: normal;
      line-height: 1.35;
      max-height: 2.7em;
    }

    @media (max-width: 640px) {
      .card-name {
        -webkit-line-clamp: 3;
        max-height: 4.1em;
      }
    }

    .card-size {
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.2;
    }

    .card-time {
      font-size: 10px;
      color: var(--text-muted);
      line-height: 1.2;
    }

    .card-actions-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      border: 1px solid var(--border-light);
      border-radius: 4px;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.6;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .file-card:hover .card-actions-btn {
      opacity: 1;
    }

    /* Modal Dialogs - 1:1 with Velora Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 16px;
    }

    .modal-content {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--text-primary);
    }

    .modal-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 15px;
    }

    .modal-body {
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .modal-footer {
      padding: 12px 20px;
      border-top: 1px solid var(--border-light);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    /* Video Player Modal */
    .player-modal-content {
      max-width: 900px;
      width: 100%;
      background: #000000;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: var(--shadow-soft);
    }

    .player-video-wrap {
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
    }

    .player-video-wrap video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* Image Modal */
    .image-modal-content {
      max-width: 90vw;
      max-height: 90vh;
      background: transparent;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .image-modal-content img {
      max-width: 100%;
      max-height: 85vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      z-index: 2000;
      box-shadow: var(--shadow-soft);
    }

    .empty-state {
      grid-column: 1 / -1;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      color: var(--text-muted);
      gap: 12px;
      text-align: center;
      box-sizing: border-box;
    }

    /* Move Dialog Tree Styles - 1:1 with MoveLocalFileDialog.vue */
    .tree-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--bg-tertiary);
      border-radius: 6px;
      border: 1px solid var(--border-light);
      font-size: 12px;
      gap: 8px;
    }

    .selected-target-hint {
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .selected-target-hint strong {
      color: var(--text-primary);
    }

    .directory-tree-container {
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-app);
      padding: 4px 0;
      display: flex;
      flex-direction: column;
    }

    .tree-node {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-primary);
      transition: background 0.15s ease;
      user-select: none;
    }

    .tree-node:hover {
      background: var(--bg-surface-hover);
    }

    .tree-node.active {
      background: var(--accent-light);
      color: var(--accent-color);
      font-weight: 600;
    }

    .tree-node .folder-icon {
      stroke: #f59e0b;
      fill: rgba(245, 158, 11, 0.15);
      flex-shrink: 0;
    }

    .tree-node .node-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="app">
    <!-- Header -->
    <header>
      <a href="/" class="brand-logo">
        <img src="/icon.png" class="brand-logo-img" alt="Velora" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='block';">
        <svg class="brand-logo-svg" style="display:none;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        <span>Velora</span>
      </a>

      <div class="header-actions">
        <button id="theme-btn" class="v-btn v-btn-icon" title="切换主题">
          <svg id="theme-icon-light" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <svg id="theme-icon-dark" style="display:none;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </button>
        <button id="logout-btn" class="v-btn v-btn-secondary" style="display:none;" title="退出登录">退出</button>
      </div>
    </header>

    <main>
      <!-- Resource Switcher Tabs -->
      <div id="resource-tabs" class="resource-tabs-wrap"></div>

      <!-- Workspace Toolbar -->
      <div class="workspace-toolbar">
        <div class="toolbar-nav-group">
          <button id="nav-back-btn" class="v-btn v-btn-icon nav-back-btn" title="返回上一级" disabled onclick="navigateUp()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <div id="breadcrumbs" class="breadcrumb-container"></div>
        </div>

        <div class="toolbar-tools">
          <div class="search-wrap">
            <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="search-input" class="v-input search-input" placeholder="搜索文件或目录">
          </div>
          <select id="sort-select" class="sort-select">
            <option value="mtime-desc">按修改时间 (最新)</option>
            <option value="mtime-asc">按修改时间 (最早)</option>
            <option value="name-asc">按名称 (A-Z)</option>
            <option value="name-desc">按名称 (Z-A)</option>
            <option value="size-desc">按大小 (从大到小)</option>
            <option value="size-asc">按大小 (从小到大)</option>
          </select>
          <button id="new-folder-btn" class="v-btn v-btn-secondary" style="display:none;" title="新建文件夹">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span class="btn-text">新建文件夹</span>
          </button>
          <button id="refresh-btn" class="v-btn v-btn-secondary" title="刷新列表">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span class="btn-text">刷新</span>
          </button>
        </div>
      </div>

      <!-- File Grid -->
      <div id="file-grid" class="file-grid"></div>
    </main>

    <!-- Auth Modal -->
    <div id="auth-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content">
        <div class="modal-header">
          <h3>局域网访问认证</h3>
        </div>
        <div class="modal-body">
          <p style="font-size:13px; color:var(--text-secondary);">该资源库已启用密码保护，请输入访问密码：</p>
          <input type="password" id="auth-password" class="v-input" placeholder="请输入密码" autocomplete="current-password">
        </div>
        <div class="modal-footer">
          <button id="auth-submit-btn" class="v-btn v-btn-primary">验证进入</button>
        </div>
      </div>
    </div>

    <!-- Video Player Modal -->
    <div id="video-modal" class="modal-overlay" style="display:none;">
      <div class="player-modal-content">
        <div class="modal-header" style="background:var(--bg-surface); border-color:var(--border-color);">
          <span id="video-modal-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%;"></span>
          <button class="v-btn v-btn-icon" onclick="closeVideoModal()">✕</button>
        </div>
        <div class="player-video-wrap">
          <video id="main-video" controls playsinline></video>
        </div>
        <div style="padding:10px 16px; background:var(--bg-surface); border-top:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center;">
          <button class="v-btn v-btn-secondary" id="copy-stream-btn" style="font-size:12px;">复制播放链接 (第三方播放器)</button>
          <a id="video-download-btn" class="v-btn v-btn-primary" style="font-size:12px;" download>下载原文件</a>
        </div>
      </div>
    </div>

    <!-- Image Preview Modal -->
    <div id="image-modal" class="modal-overlay" style="display:none;" onclick="closeImageModal()">
      <div class="image-modal-content">
        <img id="main-image" src="" alt="preview">
      </div>
    </div>

    <!-- Action / Edit Modal (New Folder, Rename, Delete) -->
    <div id="action-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="action-modal-title">操作</h3>
          <button class="v-btn v-btn-icon" onclick="closeActionModal()">✕</button>
        </div>
        <div class="modal-body" id="action-modal-body"></div>
        <div class="modal-footer" id="action-modal-footer"></div>
      </div>
    </div>
  </div>

  <script>
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // State
    var state = {
      token: localStorage.getItem('velora_lan_token') || '',
      requireAuth: false,
      allowEdit: false,
      resources: [],
      currentResourceId: '',
      currentPath: '',
      breadcrumbPaths: [],
      items: [],
      search: '',
      sort: 'mtime-desc',
      theme: localStorage.getItem('velora_theme') || 'light'
    };

    // DOM Elements
    var fileGrid = document.getElementById('file-grid');
    var resourceTabs = document.getElementById('resource-tabs');
    var breadcrumbs = document.getElementById('breadcrumbs');
    var navBackBtn = document.getElementById('nav-back-btn');
    var searchInput = document.getElementById('search-input');
    var sortSelect = document.getElementById('sort-select');
    var newFolderBtn = document.getElementById('new-folder-btn');
    var refreshBtn = document.getElementById('refresh-btn');
    var authModal = document.getElementById('auth-modal');
    var authPassword = document.getElementById('auth-password');
    var authSubmitBtn = document.getElementById('auth-submit-btn');
    var logoutBtn = document.getElementById('logout-btn');

    if (navBackBtn) {
      navBackBtn.addEventListener('click', function() {
        window.navigateUp();
      });
    }

    // Theme Setup
    function applyTheme(theme) {
      state.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('velora_theme', theme);
      document.getElementById('theme-icon-light').style.display = theme === 'light' ? 'block' : 'none';
      document.getElementById('theme-icon-dark').style.display = theme === 'dark' ? 'block' : 'none';
    }
    applyTheme(state.theme);
    document.getElementById('theme-btn').addEventListener('click', function(event) {
      var newTheme = state.theme === 'light' ? 'dark' : 'light';
      if (!document.startViewTransition) {
        applyTheme(newTheme);
        return;
      }

      var x = event.clientX;
      var y = event.clientY;
      if (typeof x !== 'number' || typeof y !== 'number' || (x === 0 && y === 0)) {
        var rect = this.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }

      var endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      var transition = document.startViewTransition(function() {
        applyTheme(newTheme);
      });

      transition.ready.then(function() {
        var clipPath = [
          'circle(0px at ' + x + 'px ' + y + 'px)',
          'circle(' + endRadius + 'px at ' + x + 'px ' + y + 'px)'
        ];

        document.documentElement.animate(
          { clipPath: clipPath },
          {
            duration: 400,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
            fill: 'forwards'
          }
        );
      });
    });

    // Toast
    function showToast(msg) {
      var el = document.createElement('div');
      el.className = 'toast';
      el.innerText = msg;
      document.body.appendChild(el);
      setTimeout(function() { el.remove(); }, 2500);
    }

    // API Helper
    async function apiFetch(url, options) {
      options = options || {};
      options.headers = options.headers || {};
      if (state.token) {
        options.headers['Authorization'] = 'Bearer ' + state.token;
      }
      var res = await fetch(url, options);
      if (res.status === 401) {
        state.token = '';
        localStorage.removeItem('velora_lan_token');
        showAuthModal();
        throw new Error('Unauthorized');
      }
      return await res.json();
    }

    // Init
    async function init() {
      try {
        var info = await fetch('/api/info').then(function(r) { return r.json(); });
        state.requireAuth = info.requireAuth;
        state.allowEdit = info.allowEdit;

        if (state.allowEdit) {
          newFolderBtn.style.display = 'inline-flex';
        }

        if (state.requireAuth && !state.token) {
          showAuthModal();
          return;
        }

        if (state.requireAuth) {
          logoutBtn.style.display = 'inline-flex';
        }

        await loadResources();
      } catch (err) {
        console.error('Init error:', err);
      }
    }

    function showAuthModal() {
      authModal.style.display = 'flex';
      authPassword.value = '';
      authPassword.focus();
    }

    authSubmitBtn.addEventListener('click', async function() {
      var pwd = authPassword.value.trim();
      if (!pwd) return;
      try {
        var res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        }).then(function(r) { return r.json(); });

        if (res.success && res.token) {
          state.token = res.token;
          localStorage.setItem('velora_lan_token', res.token);
          authModal.style.display = 'none';
          logoutBtn.style.display = 'inline-flex';
          showToast('登录成功');
          await loadResources();
        } else {
          showToast(res.error || '密码错误');
        }
      } catch (err) {
        showToast('登录校验失败');
      }
    });

    authPassword.addEventListener('keyup', function(e) {
      if (e.key === 'Enter') authSubmitBtn.click();
    });

    logoutBtn.addEventListener('click', function() {
      state.token = '';
      localStorage.removeItem('velora_lan_token');
      logoutBtn.style.display = 'none';
      showAuthModal();
    });

    async function loadResources() {
      try {
        var res = await apiFetch('/api/resources');
        if (res.success && res.resources && res.resources.length > 0) {
          state.resources = res.resources;
          renderResourceTabs();
          var target = state.resources.find(function(r) { return r.id === state.currentResourceId; }) || state.resources[0];
          selectResource(target.id);
        } else {
          fileGrid.innerHTML = '<div class="empty-state"><span>暂无挂载的本地资源</span></div>';
        }
      } catch (err) {
        console.error('Load resources error:', err);
      }
    }

    function renderResourceTabs() {
      var html = '';
      for (var i = 0; i < state.resources.length; i++) {
        var r = state.resources[i];
        var activeClass = r.id === state.currentResourceId ? 'active' : '';
        html += '<div class="resource-tab-item ' + activeClass + '" onclick="selectResource(\\'' + r.id + '\\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
          '</svg>' +
          '<span>' + escapeHtml(r.name) + '</span>' +
          '</div>';
      }
      resourceTabs.innerHTML = html;
    }

    window.selectResource = function(id) {
      var res = state.resources.find(function(r) { return r.id === id; });
      if (!res) return;
      state.currentResourceId = id;
      state.currentPath = res.path;
      renderResourceTabs();
      loadDirectory(res.path);
    };

    window.goToResourceRoot = function() {
      var res = state.resources.find(function(r) { return r.id === state.currentResourceId; });
      if (res) {
        loadDirectory(res.path);
      }
    };

    window.goToBreadcrumb = function(idx) {
      if (state.breadcrumbPaths && state.breadcrumbPaths[idx]) {
        loadDirectory(state.breadcrumbPaths[idx]);
      }
    };

    async function loadDirectory(path) {
      state.currentPath = path;
      fileGrid.innerHTML = '<div class="empty-state"><span>正在读取目录</span></div>';
      renderBreadcrumbs();

      try {
        var res = await apiFetch('/api/directory?id=' + encodeURIComponent(state.currentResourceId) + '&path=' + encodeURIComponent(path));
        if (res.success) {
          state.items = res.items || [];
          renderFileGrid();
        } else {
          fileGrid.innerHTML = '<div class="empty-state"><span>读取失败: ' + escapeHtml(res.error || '未知错误') + '</span></div>';
        }
      } catch (err) {
        fileGrid.innerHTML = '<div class="empty-state"><span>读取异常</span></div>';
      }
    }

    window.navigateUp = function() {
      if (!state.breadcrumbPaths || state.breadcrumbPaths.length === 0) {
        return;
      }
      if (state.breadcrumbPaths.length === 1) {
        goToResourceRoot();
      } else {
        goToBreadcrumb(state.breadcrumbPaths.length - 2);
      }
    };

    function renderBreadcrumbs() {
      var res = state.resources.find(function(r) { return r.id === state.currentResourceId; });
      if (!res) return;

      var normRoot = res.path.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var normCurrent = state.currentPath.replace(/\\\\/g, '/').replace(/\\/+$/, '');

      state.breadcrumbPaths = [];

      var isAtRoot = normCurrent === normRoot;
      var navBackBtn = document.getElementById('nav-back-btn');
      if (navBackBtn) {
        navBackBtn.disabled = isAtRoot;
      }

      var isRootActive = isAtRoot ? 'active' : '';
      var html = '<span class="breadcrumb-item ' + isRootActive + '" onclick="goToResourceRoot()">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' +
        '<span>' + escapeHtml(res.name) + '</span>' +
        '</span>';

      if (normCurrent.startsWith(normRoot) && normCurrent.length > normRoot.length) {
        var rel = normCurrent.substring(normRoot.length).replace(/^\\/+/, '');
        var parts = rel.split('/');
        var accum = normRoot;
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          if (part) {
            accum += '/' + part;
            var pathIndex = state.breadcrumbPaths.length;
            state.breadcrumbPaths.push(accum);
            var isLast = i === parts.length - 1;
            var itemClass = isLast ? 'active' : '';
            var clickAttr = isLast ? '' : 'onclick="goToBreadcrumb(' + pathIndex + ')"';
            html += '<span class="breadcrumb-sep">/</span>';
            html += '<span class="breadcrumb-item ' + itemClass + '" ' + clickAttr + '>' + escapeHtml(part) + '</span>';
          }
        }
      }
      breadcrumbs.innerHTML = html;
      breadcrumbs.scrollLeft = breadcrumbs.scrollWidth;
    }

    function getFileCategory(item) {
      if (item.isDirectory) return 'folder';
      var ext = (item.ext || '').toLowerCase();
      if (['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'm4v', 'ts', 'm3u8'].includes(ext)) return 'video';
      if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext)) return 'audio';
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) return 'image';
      if (['js', 'ts', 'html', 'css', 'json', 'py', 'go', 'rs', 'c', 'cpp', 'sh'].includes(ext)) return 'code';
      return 'doc';
    }

    function getCategoryIcon(cat) {
      if (cat === 'folder') {
        return '<svg class="file-svg folder-color" width="44" height="44" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
      } else if (cat === 'video') {
        return '<svg class="file-svg video-color" width="44" height="44" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>';
      } else if (cat === 'audio') {
        return '<svg class="file-svg audio-color" width="44" height="44" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
      } else if (cat === 'image') {
        return '<svg class="file-svg image-color" width="44" height="44" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
      } else if (cat === 'code') {
        return '<svg class="file-svg code-color" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
      }
      return '<svg class="file-svg doc-color" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
    }

    function formatBytes(bytes) {
      if (!bytes || bytes <= 0) return '0 B';
      var k = 1024;
      var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatTime(ts) {
      if (!ts) return '';
      var d = new Date(ts);
      var pad = function(n) { return n.toString().padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function renderFileGrid() {
      var list = state.items.slice();
      if (state.search.trim()) {
        var q = state.search.trim().toLowerCase();
        list = list.filter(function(i) { return i.name.toLowerCase().includes(q); });
      }

      var parts = state.sort.split('-');
      var field = parts[0];
      var order = parts[1];
      var isAsc = order === 'asc';
      list.sort(function(a, b) {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        if (field === 'name') {
          var cmp = a.name.localeCompare(b.name, 'zh-CN');
          return isAsc ? cmp : -cmp;
        } else if (field === 'mtime') {
          return isAsc ? a.mtime - b.mtime : b.mtime - a.mtime;
        } else if (field === 'size') {
          return isAsc ? a.size - b.size : b.size - a.size;
        }
        return 0;
      });

      if (list.length === 0) {
        fileGrid.innerHTML = '<div class="empty-state"><span>未找到文件或目录为空</span></div>';
        return;
      }

      var html = '';
      for (var idx = 0; idx < list.length; idx++) {
        var item = list[idx];
        var cat = getFileCategory(item);
        var iconSvg = getCategoryIcon(cat);
        var metaSize = item.isDirectory ? '文件夹' : formatBytes(item.size);
        var encodedPath = encodeURIComponent(item.path);
        var timeStr = formatTime(item.mtime);
        var extBadge = item.isDirectory ? '' : '<span class="ext-badge">' + (item.ext || 'FILE').toUpperCase() + '</span>';

        html += '<div class="file-card" onclick="handleCardClick(' + idx + ')">' +
          '<div class="card-icon-wrap">' +
          iconSvg +
          extBadge +
          '</div>' +
          '<div class="card-info">' +
          '<span class="card-name" title="' + item.name + '">' + item.name + '</span>' +
          '<span class="card-size">' + metaSize + '</span>' +
          '<span class="card-time">' + timeStr + '</span>' +
          '</div>' +
          (state.allowEdit ? '<button class="card-actions-btn" onclick="event.stopPropagation(); openItemActions(\\'' + encodedPath + '\\', ' + item.isDirectory + ', \\'' + item.name + '\\')">⋮</button>' : '') +
          '</div>';
      }
      fileGrid.innerHTML = html;
    }

    window.handleCardClick = function(idx) {
      var list = state.items.slice();
      if (state.search.trim()) {
        var q = state.search.trim().toLowerCase();
        list = list.filter(function(i) { return i.name.toLowerCase().includes(q); });
      }
      var parts = state.sort.split('-');
      var field = parts[0];
      var order = parts[1];
      var isAsc = order === 'asc';
      list.sort(function(a, b) {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        if (field === 'name') {
          var cmp = a.name.localeCompare(b.name, 'zh-CN');
          return isAsc ? cmp : -cmp;
        } else if (field === 'mtime') {
          return isAsc ? a.mtime - b.mtime : b.mtime - a.mtime;
        } else if (field === 'size') {
          return isAsc ? a.size - b.size : b.size - a.size;
        }
        return 0;
      });

      var item = list[idx];
      if (!item) return;

      if (item.isDirectory) {
        loadDirectory(item.path);
      } else {
        var cat = getFileCategory(item);
        if (cat === 'video' || cat === 'audio') {
          openVideoModal(item);
        } else if (cat === 'image') {
          openImageModal(item);
        } else {
          // Direct download
          window.location.href = '/download?path=' + encodeURIComponent(item.path) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
        }
      }
    };

    // Video Player
    function openVideoModal(item) {
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(item.path) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      var downloadUrl = window.location.origin + '/download?path=' + encodeURIComponent(item.path) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      
      document.getElementById('video-modal-title').innerText = item.name;
      var video = document.getElementById('main-video');
      video.src = streamUrl;
      video.play().catch(function() {});
      
      document.getElementById('copy-stream-btn').onclick = function() {
        navigator.clipboard.writeText(streamUrl).then(function() { showToast('已复制流媒体链接到剪贴板'); });
      };
      document.getElementById('video-download-btn').href = downloadUrl;
      document.getElementById('video-modal').style.display = 'flex';
    }

    window.closeVideoModal = function() {
      var video = document.getElementById('main-video');
      video.pause();
      video.src = '';
      document.getElementById('video-modal').style.display = 'none';
    };

    // Image Preview
    function openImageModal(item) {
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(item.path) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      document.getElementById('main-image').src = streamUrl;
      document.getElementById('image-modal').style.display = 'flex';
    }

    window.closeImageModal = function() {
      document.getElementById('image-modal').style.display = 'none';
      document.getElementById('main-image').src = '';
    };

    // Search & Sort Event Listeners
    searchInput.addEventListener('input', function(e) {
      state.search = e.target.value;
      renderFileGrid();
    });

    sortSelect.addEventListener('change', function(e) {
      state.sort = e.target.value;
      renderFileGrid();
    });

    refreshBtn.addEventListener('click', function() {
      loadDirectory(state.currentPath);
    });

    // Action Modal for Editing
    var actionModal = document.getElementById('action-modal');
    var actionModalTitle = document.getElementById('action-modal-title');
    var actionModalBody = document.getElementById('action-modal-body');
    var actionModalFooter = document.getElementById('action-modal-footer');

    window.closeActionModal = function() {
      actionModal.style.display = 'none';
    };

    newFolderBtn.addEventListener('click', function() {
      actionModalTitle.innerText = '新建文件夹';
      actionModalBody.innerHTML = '<input type="text" id="new-folder-name" class="v-input" placeholder="请输入文件夹名称" style="width:100%;">';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" onclick="submitNewFolder()">创建</button>';
      actionModal.style.display = 'flex';
      setTimeout(function() { document.getElementById('new-folder-name').focus(); }, 50);
    });

    window.submitNewFolder = async function() {
      var name = document.getElementById('new-folder-name').value.trim();
      if (!name) return;
      try {
        var res = await apiFetch('/api/create-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentPath: state.currentPath, name: name })
        });
        if (res.success) {
          showToast('文件夹创建成功');
          closeActionModal();
          loadDirectory(state.currentPath);
        } else {
          showToast(res.error || '创建失败');
        }
      } catch (err) {
        showToast('创建异常');
      }
    };

    window.openItemActions = function(encodedPath, isDir, name) {
      actionModalTitle.innerText = '管理: ' + name;
      actionModalBody.innerHTML = '<div style="display:flex; flex-direction:column; gap:8px;">' +
        '<button class="v-btn v-btn-secondary" onclick="openMoveModal(\\'' + encodedPath + '\\', \\'' + name + '\\')">移动</button>' +
        '<button class="v-btn v-btn-secondary" onclick="openRenameModal(\\'' + encodedPath + '\\', \\'' + name + '\\')">重命名</button>' +
        '<button class="v-btn v-btn-danger-soft" onclick="openDeleteModal(\\'' + encodedPath + '\\', ' + isDir + ', \\'' + name + '\\')">删除</button>' +
        '</div>';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">关闭</button>';
      actionModal.style.display = 'flex';
    };

    window.openMoveModal = async function(encodedPath, name) {
      var sourcePath = decodeURIComponent(encodedPath);
      state.moveSourcePath = sourcePath;
      state.moveSourceName = name;
      state.moveSelectedTarget = '';
      state.moveDirList = [];

      actionModalTitle.innerText = '移动 "' + name + '"';
      actionModalBody.innerHTML = '<div style="display:flex; flex-direction:column; gap:12px;">' +
        '<div class="tree-toolbar">' +
        '<span class="selected-target-hint">目标目录: <strong id="move-target-label">未选择</strong></span>' +
        '<button class="v-btn v-btn-secondary" id="move-new-subfolder-btn" disabled onclick="openMoveNewSubfolderModal()" style="font-size:12px; height:28px; padding:2px 8px;">+ 新建子目录</button>' +
        '</div>' +
        '<div class="directory-tree-container" id="move-tree-container">' +
        '<div class="empty-state" style="padding:30px 10px;"><span>正在扫描目录树</span></div>' +
        '</div>' +
        '</div>';

      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" id="move-confirm-btn" disabled onclick="submitMove()">确认移动</button>';

      await loadMoveDirTree();
    };

    async function loadMoveDirTree() {
      try {
        var res = await apiFetch('/api/dir-tree?id=' + encodeURIComponent(state.currentResourceId));
        if (res.success && res.dirList) {
          state.moveDirList = res.dirList;
          renderMoveTree();
        } else {
          document.getElementById('move-tree-container').innerHTML = '<div class="empty-state" style="padding:30px 10px;"><span>扫描失败: ' + escapeHtml(res.error || '无法获取目录') + '</span></div>';
        }
      } catch (err) {
        document.getElementById('move-tree-container').innerHTML = '<div class="empty-state" style="padding:30px 10px;"><span>扫描异常</span></div>';
      }
    }

    function renderMoveTree() {
      var container = document.getElementById('move-tree-container');
      if (!container) return;

      if (!state.moveDirList || state.moveDirList.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><span>未发现可用目录</span></div>';
        return;
      }

      var currentDir = state.currentPath.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var html = '';
      for (var i = 0; i < state.moveDirList.length; i++) {
        var item = state.moveDirList[i];
        var isSelected = state.moveSelectedTarget === item.path;
        var padLeft = item.depth * 16 + 10;
        html += '<div class="tree-node ' + (isSelected ? 'active' : '') + '" style="padding-left:' + padLeft + 'px;" onclick="selectMoveTarget(' + i + ')">' +
          '<svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
          '<span class="node-name" title="' + escapeHtml(item.path) + '">' + escapeHtml(item.name) + '</span>' +
          '</div>';
      }
      container.innerHTML = html;
    }

    window.selectMoveTarget = function(index) {
      var item = state.moveDirList[index];
      if (!item) return;

      state.moveSelectedTarget = item.path;
      var targetLabel = document.getElementById('move-target-label');
      if (targetLabel) targetLabel.innerText = item.name;

      var newSubBtn = document.getElementById('move-new-subfolder-btn');
      if (newSubBtn) newSubBtn.disabled = false;

      var currentDir = state.currentPath.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var selectedNorm = item.path.replace(/\\\\/g, '/').replace(/\\/+$/, '');
      var isSameAsCurrent = currentDir === selectedNorm;

      var confirmBtn = document.getElementById('move-confirm-btn');
      if (confirmBtn) {
        confirmBtn.disabled = isSameAsCurrent;
      }

      renderMoveTree();
    };

    window.openMoveNewSubfolderModal = function() {
      if (!state.moveSelectedTarget) return;
      var subfolderName = prompt('在当前所选目录下创建新子目录：');
      if (!subfolderName || !subfolderName.trim()) return;

      apiFetch('/api/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPath: state.moveSelectedTarget, name: subfolderName.trim() })
      }).then(function(res) {
        if (res.success) {
          showToast('子目录创建成功');
          loadMoveDirTree();
        } else {
          showToast(res.error || '创建失败');
        }
      }).catch(function() {
        showToast('创建异常');
      });
    };

    window.submitMove = async function() {
      if (!state.moveSourcePath || !state.moveSelectedTarget) return;
      try {
        var res = await apiFetch('/api/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourcePath: state.moveSourcePath,
            targetDirPath: state.moveSelectedTarget
          })
        });

        if (res.success) {
          showToast('移动成功');
          closeActionModal();
          loadDirectory(state.currentPath);
        } else {
          showToast(res.error || '移动失败');
        }
      } catch (err) {
        showToast('移动异常');
      }
    };

    window.openRenameModal = function(encodedPath, oldName) {
      actionModalTitle.innerText = '重命名';
      actionModalBody.innerHTML = '<input type="text" id="rename-input" class="v-input" value="' + oldName + '" style="width:100%;">';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" onclick="submitRename(\\'' + encodedPath + '\\')">保存</button>';
      setTimeout(function() { document.getElementById('rename-input').focus(); }, 50);
    };

    window.submitRename = async function(encodedPath) {
      var targetPath = decodeURIComponent(encodedPath);
      var newName = document.getElementById('rename-input').value.trim();
      if (!newName) return;
      try {
        var res = await apiFetch('/api/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath: targetPath, newName: newName })
        });
        if (res.success) {
          showToast('重命名成功');
          closeActionModal();
          loadDirectory(state.currentPath);
        } else {
          showToast(res.error || '重命名失败');
        }
      } catch (err) {
        showToast('重命名异常');
      }
    };

    window.openDeleteModal = function(encodedPath, isDir, name) {
      actionModalTitle.innerText = '确认删除';
      actionModalBody.innerHTML = '<p style="color:var(--color-error); font-size:14px;">确定要永久删除 ' + (isDir ? '文件夹' : '文件') + ' "<strong>' + name + '</strong>" 吗？此操作不可恢复。</p>';
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-danger-soft" onclick="submitDelete(\\'' + encodedPath + '\\')">确认删除</button>';
    };

    window.submitDelete = async function(encodedPath) {
      var targetPath = decodeURIComponent(encodedPath);
      try {
        var res = await apiFetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath: targetPath })
        });
        if (res.success) {
          showToast('已成功删除');
          closeActionModal();
          loadDirectory(state.currentPath);
        } else {
          showToast(res.error || '删除失败');
        }
      } catch (err) {
        showToast('删除异常');
      }
    };

    // Run
    init();
  </script>
</body>
</html>`;
  return cachedLanWebHtml;
}
