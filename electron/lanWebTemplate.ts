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
      background: linear-gradient(180deg, var(--bg-surface) 0%, var(--border-light) 100%);
      color: var(--color-accent);
      border-color: var(--border-color);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.6);
      font-weight: 600;
    }

    .v-btn-primary:hover {
      background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-surface-hover) 100%);
      color: var(--color-accent-hover);
      border-color: var(--border-color);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.75);
    }

    .v-btn-primary:active {
      transform: translateY(1px);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    [data-theme='dark'] .v-btn-primary {
      background: linear-gradient(180deg, var(--border-color) 0%, var(--border-light) 100%);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    [data-theme='dark'] .v-btn-primary:hover {
      background: linear-gradient(180deg, var(--bg-surface-active) 0%, var(--border-color) 100%);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12);
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

    /* Toast Notification Container & Items (Top Staggered) */
    .toast-container {
      position: fixed;
      top: 20px;
      left: 0;
      right: 0;
      z-index: 12000;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      max-height: calc(100vh - 40px);
      overflow: visible;
    }

    .toast {
      position: relative;
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      padding: 10px 20px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: var(--shadow-soft), 0 6px 20px rgba(0, 0, 0, 0.12);
      pointer-events: auto;
      cursor: pointer;
      max-width: min(85vw, 560px);
      min-width: 180px;
      text-align: center;
      word-break: break-word;
      line-height: 1.45;
      animation: toastInTop 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: all 0.25s ease;
      user-select: none;
    }

    .toast:hover {
      box-shadow: var(--shadow-soft), 0 8px 24px rgba(0, 0, 0, 0.18);
    }

    .toast.toast-fadeout {
      opacity: 0;
      transform: translateY(-12px) scale(0.95);
      pointer-events: none;
    }

    @keyframes toastInTop {
      from {
        opacity: 0;
        transform: translateY(-18px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
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

    /* Multi-Select & Card Checkboxes */
    .card-select-btn {
      position: absolute;
      top: 6px;
      left: 6px;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-surface);
      color: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 10;
    }

    .file-card:hover .card-select-btn,
    .file-card.selected .card-select-btn,
    body.is-selecting .card-select-btn {
      opacity: 1;
    }

    .file-card.selected .card-select-btn {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: var(--color-accent-text);
    }

    .file-card.selected {
      border-color: var(--color-accent);
      background: var(--bg-surface-hover);
    }

    .multi-select-bar {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      box-shadow: var(--shadow-soft);
      padding: 10px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 900;
      animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      max-width: 92vw;
    }

    @keyframes slideUp {
      from { transform: translate(-50%, 20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }

    .multi-select-count {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
    }

    .multi-select-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
    }

    /* Video Trimmer Modal */
    .video-edit-modal-content {
      max-width: 900px;
      width: 100%;
      height: 88vh;
      max-height: 94vh;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
    }

    .video-edit-modal-content .modal-header {
      flex-shrink: 0;
    }

    .trimmer-video-wrap {
      width: 100%;
      max-height: 35vh;
      min-height: 160px;
      background: #000;
      position: relative;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .trimmer-video-wrap video {
      width: 100%;
      height: 100%;
      max-height: 35vh;
      object-fit: contain;
    }

    .trimmer-video-wrap video::-webkit-media-controls-overlay-play-button,
    .trimmer-video-wrap video::-webkit-media-controls-start-playback-button,
    #trimmer-video::-webkit-media-controls-overlay-play-button,
    #trimmer-video::-webkit-media-controls-start-playback-button {
      display: none !important;
      -webkit-appearance: none;
      opacity: 0;
      pointer-events: none;
    }

    .trimmer-controls {
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--bg-app);
      border-top: 1px solid var(--border-light);
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    .video-edit-modal-content .modal-footer {
      flex-shrink: 0;
      background: var(--bg-surface);
      border-top: 1px solid var(--border-light);
      z-index: 10;
    }

    .time-steppers {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      width: 100%;
    }

    .time-steppers .v-btn {
      padding: 6px 4px;
      font-size: 12px;
      min-width: 0;
      justify-content: center;
      user-select: none;
      -webkit-user-select: none;
    }

    .trim-points-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      width: 100%;
    }

    .trim-points-row .v-btn {
      justify-content: center;
    }

    .time-display {
      font-family: monospace;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      background: var(--bg-surface);
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      width: 100%;
      text-align: center;
      box-sizing: border-box;
    }

    .segment-chips-container {
      display: flex;
      flex-wrap: wrap;
      align-content: flex-start;
      align-items: center;
      gap: 8px;
      min-height: 50px;
      max-height: 120px;
      overflow-y: auto;
      padding: 8px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: 8px;
      box-sizing: border-box;
    }

    .segment-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s;
    }

    .segment-chip:hover {
      border-color: var(--color-accent);
    }

    .segment-chip .chip-remove {
      color: var(--text-muted);
      cursor: pointer;
      font-weight: bold;
      padding: 0 2px;
    }

    .segment-chip .chip-remove:hover {
      color: var(--color-error);
    }

    /* Merge Modal */
    .merge-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 260px;
      overflow-y: auto;
    }

    .merge-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--bg-app);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-size: 13px;
    }

    .merge-item-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 8px;
    }

    .merge-item-btns {
      display: flex;
      gap: 4px;
    }

    /* Compress Presets */
    .compress-presets {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .preset-btn {
      padding: 8px 4px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-app);
      color: var(--text-primary);
      cursor: pointer;
      text-align: center;
      font-size: 12px;
      transition: all 0.15s;
      outline: none;
    }

    .preset-btn.active {
      border-color: var(--color-accent);
      background: var(--accent-light);
      color: var(--color-accent);
      font-weight: 600;
    }

    /* Progress Modal */
    .progress-bar-bg {
      width: 100%;
      height: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
      margin: 10px 0;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--color-accent) 0%, #3b82f6 100%);
      width: 0%;
      transition: width 0.25s ease;
      border-radius: 4px;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
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

    <!-- Multi-Select Floating Bar -->
    <div id="multi-select-bar" class="multi-select-bar" style="display:none;">
      <span id="multi-select-count" class="multi-select-count">已选 0 项</span>
      <div class="multi-select-actions">
        <button id="batch-merge-btn" class="v-btn v-btn-primary" style="display:none;" onclick="openBatchMergeModal()">
          <span>合并视频</span>
        </button>
        <button id="batch-compress-btn" class="v-btn v-btn-secondary" style="display:none;" onclick="openBatchCompressModal()">
          <span>压缩视频</span>
        </button>
        <button class="v-btn v-btn-secondary" onclick="clearSelection()">取消选择</button>
      </div>
    </div>

    <!-- Dedicated Fullscreen Video Trimmer Modal -->
    <div id="video-edit-modal" class="modal-overlay" style="display:none;">
      <div class="video-edit-modal-content">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
            <span id="video-edit-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:15px; font-weight:600;">视频剪辑</span>
          </div>
          <button class="v-btn v-btn-icon" onclick="closeVideoEditModal()">✕</button>
        </div>
        <div class="trimmer-video-wrap">
          <video id="trimmer-video" playsinline controls></video>
        </div>
        <div class="trimmer-controls">
          <div id="trimmer-time-display" class="time-display">00:00.0 / 00:00.0</div>

          <div class="time-steppers" oncontextmenu="return false;">
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(-60, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(-60, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">-1m</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(-1, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(-1, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">-1s</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(-0.1, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(-0.1, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">-0.1s</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(0.1, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(0.1, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">+0.1s</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(1, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(1, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">+1s</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(60, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(60, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">+1m</button>
          </div>

          <div class="trim-points-row">
            <button class="v-btn v-btn-secondary" onclick="markTrimStart()">设为起点</button>
            <button class="v-btn v-btn-secondary" onclick="markTrimEnd()">设为终点</button>
          </div>

          <button id="trimmer-add-segment-btn" class="v-btn v-btn-primary" style="width:100%;" onclick="addTrimSegment()">添加为片段 (00:00.0 - 00:00.0)</button>

          <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-top:2px;">已选片段清单：</div>
          <div id="trimmer-segments-list" class="segment-chips-container">
            <span style="font-size:12px; color:var(--text-muted);">暂未添加多片段，默认全时长</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
            <label style="font-size:12px; color:var(--text-secondary);">保存模式</label>
            <select id="trim-save-mode" class="v-input" style="width:100%;" onchange="toggleTrimSaveMode()">
              <option value="replace" selected>覆盖保存</option>
              <option value="saveAs">另存为</option>
            </select>
          </div>
          <div id="trim-filename-wrap" style="display:none; flex-direction:column; gap:4px;">
            <label style="font-size:12px; color:var(--text-secondary);">导出文件名</label>
            <input type="text" id="trim-filename-input" class="v-input" placeholder="输入输出文件名" style="width:100%;">
          </div>
        </div>
        <div class="modal-footer">
          <button class="v-btn v-btn-secondary" onclick="closeVideoEditModal()">取消</button>
          <button class="v-btn v-btn-primary" onclick="submitVideoCut()">开始剪辑</button>
        </div>
      </div>
    </div>

    <!-- Video Merge Modal -->
    <div id="video-merge-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content" style="max-width:560px;">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path><path d="M4 18V4a2 2 0 0 1 2-2h14"></path></svg>
            <h3>合并视频</h3>
          </div>
          <button class="v-btn v-btn-icon" onclick="closeVideoMergeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:12px; color:var(--text-secondary); margin:0;">系统将按从上到下的顺序拼接视频，可点击上下箭头调整拼接次序：</p>
          <div id="merge-video-items" class="merge-list"></div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-top:6px;">
            <label style="font-size:12px; color:var(--text-secondary);">合并产物文件名</label>
            <input type="text" id="merge-filename-input" class="v-input" placeholder="输入合并文件名" style="width:100%;">
          </div>
        </div>
        <div class="modal-footer">
          <button class="v-btn v-btn-secondary" onclick="closeVideoMergeModal()">取消</button>
          <button class="v-btn v-btn-primary" id="start-merge-btn" onclick="submitVideoMerge()">开始合并</button>
        </div>
      </div>
    </div>

    <!-- Video Compress Modal -->
    <div id="video-compress-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            <h3 id="compress-modal-title">压缩视频</h3>
          </div>
          <button class="v-btn v-btn-icon" onclick="closeVideoCompressModal()">✕</button>
        </div>
        <div class="modal-body">
          <label style="font-size:12px; color:var(--text-secondary);">目标码率档位：</label>
          <div class="compress-presets">
            <button class="preset-btn" id="preset-1000" onclick="selectCompressPreset(1000)">流畅 (1000k)</button>
            <button class="preset-btn active" id="preset-2000" onclick="selectCompressPreset(2000)">标准 (2000k)</button>
            <button class="preset-btn" id="preset-3500" onclick="selectCompressPreset(3500)">高清 (3500k)</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
            <label style="font-size:12px; color:var(--text-secondary);">自定义码率 (kbps)</label>
            <input type="number" id="compress-bitrate-input" class="v-input" value="2000" min="300" max="20000" style="width:100%;">
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
            <label style="font-size:12px; color:var(--text-secondary);">保存方式</label>
            <select id="compress-mode-select" class="v-input" style="width:100%;" onchange="toggleCompressSaveMode()">
              <option value="saveAs">另存为新文件</option>
              <option value="replace">覆盖保存原文件</option>
            </select>
          </div>
          <div id="compress-filename-wrap" style="display:flex; flex-direction:column; gap:4px;">
            <label style="font-size:12px; color:var(--text-secondary);">导出文件名</label>
            <input type="text" id="compress-filename-input" class="v-input" placeholder="输入输出文件名" style="width:100%;">
          </div>
        </div>
        <div class="modal-footer">
          <button class="v-btn v-btn-secondary" onclick="closeVideoCompressModal()">取消</button>
          <button class="v-btn v-btn-primary" onclick="submitVideoCompress()">开始压缩</button>
        </div>
      </div>
    </div>

    <!-- Task Progress Modal -->
    <div id="task-progress-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-header">
          <h3 id="task-progress-title">正在处理</h3>
        </div>
        <div class="modal-body">
          <div class="progress-header">
            <span id="task-progress-status" style="color:var(--text-secondary);">正在初始化</span>
            <strong id="task-progress-percent" style="font-family:monospace;">0%</strong>
          </div>
          <div class="progress-bar-bg">
            <div id="task-progress-fill" class="progress-bar-fill"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="task-cancel-btn" class="v-btn v-btn-danger-soft" onclick="cancelCurrentTask()">取消任务</button>
        </div>
      </div>
    </div>

    <!-- Custom Dialog Modal (Alert / Confirm / Prompt) -->
    <div id="custom-dialog-modal" class="modal-overlay" style="display:none; z-index:1100;">
      <div class="modal-content" style="max-width:400px; width:100%;">
        <div class="modal-header">
          <h3 id="custom-dialog-title">提示</h3>
          <button class="v-btn v-btn-icon" onclick="closeCustomDialog(null)">✕</button>
        </div>
        <div class="modal-body" style="padding:18px 20px;">
          <p id="custom-dialog-message" style="margin:0; font-size:14px; line-height:1.5; color:var(--text-primary);"></p>
          <input type="text" id="custom-dialog-input" class="v-input" style="width:100%; margin-top:10px; display:none;">
        </div>
        <div class="modal-footer">
          <button id="custom-dialog-cancel-btn" class="v-btn v-btn-secondary" onclick="closeCustomDialog(false)">取消</button>
          <button id="custom-dialog-confirm-btn" class="v-btn v-btn-primary" onclick="confirmCustomDialog()">确定</button>
        </div>
      </div>
    </div>

    <!-- Toast Notification Container (Top Staggered) -->
    <div id="toast-container" class="toast-container"></div>
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
      theme: localStorage.getItem('velora_theme') || 'light',
      selectedPaths: new Set(),
      // Trimmer
      trimSegments: [],
      trimStart: 0,
      trimEnd: 0,
      trimDuration: 0,
      currentTrimPath: '',
      currentTrimName: '',
      // Merge
      mergeVideos: [],
      // Compress
      compressFilePath: '',
      compressFileName: '',
      compressBitrate: 2000,
      // Task SSE
      currentTaskId: '',
      currentEventSource: null
    };

    function getFilteredAndSortedItems() {
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
      return list;
    }

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
    var actionModal = document.getElementById('action-modal');
    var actionModalTitle = document.getElementById('action-modal-title');
    var actionModalBody = document.getElementById('action-modal-body');
    var actionModalFooter = document.getElementById('action-modal-footer');

    window.closeActionModal = function() {
      if (actionModal) actionModal.style.display = 'none';
    };

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

    // Toast (Top Staggered Notification)
    function dismissToast(el) {
      if (!el || el.classList.contains('toast-fadeout')) return;
      el.classList.add('toast-fadeout');
      setTimeout(function() {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }, 250);
    }

    function showToast(msg, duration) {
      var container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }

      var el = document.createElement('div');
      el.className = 'toast';
      el.innerText = msg;

      var stayDuration = typeof duration === 'number' ? duration : 2500;

      container.appendChild(el);

      var timer = setTimeout(function() {
        dismissToast(el);
      }, stayDuration);

      el.addEventListener('click', function() {
        clearTimeout(timer);
        dismissToast(el);
      });
    }

    // Custom Dialog Modal (Alert / Confirm / Prompt)
    var customDialogResolve = null;

    window.closeCustomDialog = function(result) {
      var modal = document.getElementById('custom-dialog-modal');
      if (modal) modal.style.display = 'none';
      if (customDialogResolve) {
        var resolve = customDialogResolve;
        customDialogResolve = null;
        resolve(result);
      }
    };

    window.confirmCustomDialog = function() {
      var input = document.getElementById('custom-dialog-input');
      var isPrompt = input && input.style.display !== 'none';
      if (isPrompt) {
        var val = input.value;
        window.closeCustomDialog(val);
      } else {
        window.closeCustomDialog(true);
      }
    };

    window.showAlert = function(options) {
      return new Promise(function(resolve) {
        var opts = typeof options === 'string' ? { message: options } : (options || {});
        customDialogResolve = function() { resolve(); };

        document.getElementById('custom-dialog-title').innerText = opts.title || '提示';
        document.getElementById('custom-dialog-message').innerText = opts.message || '';

        var input = document.getElementById('custom-dialog-input');
        input.style.display = 'none';
        input.onkeydown = null;

        var cancelBtn = document.getElementById('custom-dialog-cancel-btn');
        cancelBtn.style.display = 'none';

        var confirmBtn = document.getElementById('custom-dialog-confirm-btn');
        confirmBtn.className = 'v-btn v-btn-primary';
        confirmBtn.innerText = opts.okText || '确定';

        document.getElementById('custom-dialog-modal').style.display = 'flex';
        confirmBtn.focus();
      });
    };

    window.showConfirm = function(options) {
      return new Promise(function(resolve) {
        var opts = typeof options === 'string' ? { message: options } : (options || {});
        customDialogResolve = function(res) { resolve(!!res); };

        document.getElementById('custom-dialog-title').innerText = opts.title || '确认';
        document.getElementById('custom-dialog-message').innerText = opts.message || '';

        var input = document.getElementById('custom-dialog-input');
        input.style.display = 'none';
        input.onkeydown = null;

        var cancelBtn = document.getElementById('custom-dialog-cancel-btn');
        cancelBtn.style.display = '';
        cancelBtn.innerText = opts.cancelText || '取消';

        var confirmBtn = document.getElementById('custom-dialog-confirm-btn');
        confirmBtn.className = opts.danger ? 'v-btn v-btn-danger-soft' : 'v-btn v-btn-primary';
        confirmBtn.innerText = opts.confirmText || '确定';

        document.getElementById('custom-dialog-modal').style.display = 'flex';
        confirmBtn.focus();
      });
    };

    window.showPrompt = function(options) {
      return new Promise(function(resolve) {
        var opts = typeof options === 'string' ? { message: options } : (options || {});
        customDialogResolve = function(res) {
          if (res === null || res === false) {
            resolve(null);
          } else {
            resolve(String(res));
          }
        };

        document.getElementById('custom-dialog-title').innerText = opts.title || '输入';
        document.getElementById('custom-dialog-message').innerText = opts.message || '';

        var input = document.getElementById('custom-dialog-input');
        input.style.display = 'block';
        input.value = opts.defaultValue || '';
        input.placeholder = opts.placeholder || '';
        input.onkeydown = function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            window.confirmCustomDialog();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            window.closeCustomDialog(null);
          }
        };

        var cancelBtn = document.getElementById('custom-dialog-cancel-btn');
        cancelBtn.style.display = '';
        cancelBtn.innerText = opts.cancelText || '取消';

        var confirmBtn = document.getElementById('custom-dialog-confirm-btn');
        confirmBtn.className = 'v-btn v-btn-primary';
        confirmBtn.innerText = opts.confirmText || opts.okText || '确定';

        document.getElementById('custom-dialog-modal').style.display = 'flex';
        setTimeout(function() {
          input.focus();
          input.select();
        }, 50);
      });
    };

    window.alert = function(msg) {
      return window.showAlert(msg);
    };

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

    async function loadDirectory(path, options) {
      options = options || {};
      var preserveScroll = !!options.preserveScroll;
      var savedScrollY = preserveScroll ? (window.scrollY || document.documentElement.scrollTop || 0) : 0;

      state.currentPath = path;
      if (!preserveScroll) {
        fileGrid.innerHTML = '<div class="empty-state"><span>正在读取目录</span></div>';
        window.scrollTo(0, 0);
      }
      renderBreadcrumbs();

      try {
        var res = await apiFetch('/api/directory?id=' + encodeURIComponent(state.currentResourceId) + '&path=' + encodeURIComponent(path));
        if (res.success) {
          state.items = res.items || [];
          renderFileGrid();
          if (preserveScroll) {
            window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            requestAnimationFrame(function() {
              window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            });
          }
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
      var list = getFilteredAndSortedItems();

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
        var isSelected = state.selectedPaths.has(item.path);
        var cardClass = 'file-card' + (isSelected ? ' selected' : '');

        html += '<div class="' + cardClass + '" onclick="handleCardClick(' + idx + ')">' +
          (state.allowEdit ? '<div class="card-select-btn" onclick="event.stopPropagation(); toggleCardSelection(' + idx + ', event)">✓</div>' : '') +
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

    window.toggleCardSelection = function(idx, event) {
      if (event) event.stopPropagation();
      var list = getFilteredAndSortedItems();
      var item = list[idx];
      if (!item) return;

      if (state.selectedPaths.has(item.path)) {
        state.selectedPaths.delete(item.path);
      } else {
        state.selectedPaths.add(item.path);
      }
      updateMultiSelectBar();
      renderFileGrid();
    };

    window.clearSelection = function() {
      state.selectedPaths.clear();
      updateMultiSelectBar();
      renderFileGrid();
    };

    function updateMultiSelectBar() {
      var bar = document.getElementById('multi-select-bar');
      var countEl = document.getElementById('multi-select-count');
      var mergeBtn = document.getElementById('batch-merge-btn');
      var compressBtn = document.getElementById('batch-compress-btn');

      var size = state.selectedPaths.size;
      if (size === 0) {
        bar.style.display = 'none';
        document.body.classList.remove('is-selecting');
        return;
      }

      document.body.classList.add('is-selecting');
      bar.style.display = 'flex';
      countEl.innerText = '已选 ' + size + ' 项';

      var selectedItems = state.items.filter(function(i) { return state.selectedPaths.has(i.path); });
      var videoItems = selectedItems.filter(function(i) { return getFileCategory(i) === 'video'; });

      if (state.allowEdit && videoItems.length >= 2) {
        mergeBtn.style.display = 'inline-flex';
      } else {
        mergeBtn.style.display = 'none';
      }

      if (state.allowEdit && videoItems.length > 0) {
        compressBtn.style.display = 'inline-flex';
      } else {
        compressBtn.style.display = 'none';
      }
    }

    window.handleCardClick = function(idx) {
      var list = getFilteredAndSortedItems();
      var item = list[idx];
      if (!item) return;

      if (state.selectedPaths.size > 0) {
        toggleCardSelection(idx);
        return;
      }

      if (item.isDirectory) {
        loadDirectory(item.path);
      } else {
        var cat = getFileCategory(item);
        if (cat === 'video' || cat === 'audio') {
          openVideoModal(item);
        } else if (cat === 'image') {
          openImageModal(item);
        } else {
          openUnsupportedPreviewModal(item);
        }
      }
    };

    // 不支持在线预览的文件提醒与下载确认
    function openUnsupportedPreviewModal(item) {
      var extText = item.ext ? '.' + item.ext.toLowerCase() : '未知格式';
      actionModalTitle.innerText = '文件提示';
      actionModalBody.innerHTML = '<div style="display:flex; flex-direction:column; gap:12px;">' +
        '<p style="font-size:14px; color:var(--text-primary); line-height:1.6; margin:0;">' +
        '该文件格式 (<strong style="color:var(--color-accent);">' + escapeHtml(extText) + '</strong>) 暂不支持在线预览，是否下载该文件？' +
        '</p>' +
        '<div style="font-size:12px; color:var(--text-secondary); background:var(--bg-secondary); padding:10px 12px; border-radius:8px; border:1px solid var(--border-light); word-break:break-all;">' +
        '<div style="line-height:1.5;"><strong style="color:var(--text-primary);">文件名：</strong>' + escapeHtml(item.name) + '</div>' +
        '<div style="margin-top:6px; line-height:1.5;"><strong style="color:var(--text-primary);">文件大小：</strong>' + formatBytes(item.size) + '</div>' +
        '</div>' +
        '</div>';

      var encodedPath = encodeURIComponent(item.path);
      actionModalFooter.innerHTML = '<button class="v-btn v-btn-secondary" onclick="closeActionModal()">取消</button>' +
        '<button class="v-btn v-btn-primary" onclick="confirmDownloadFile(\\'' + encodedPath + '\\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
        '<polyline points="7 10 12 15 17 10"></polyline>' +
        '<line x1="12" y1="15" x2="12" y2="3"></line>' +
        '</svg>' +
        '<span class="btn-text">下载文件</span>' +
        '</button>';

      actionModal.style.display = 'flex';
    }

    window.confirmDownloadFile = function(encodedPath) {
      closeActionModal();
      var itemPath = decodeURIComponent(encodedPath);
      window.location.href = '/download?path=' + encodeURIComponent(itemPath) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
    };

    // Preview Scroll Anchor Restoration
    var previewScrollY = 0;

    function recordPreviewScroll() {
      previewScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    }

    function restorePreviewScroll() {
      if (typeof previewScrollY === 'number') {
        window.scrollTo({ top: previewScrollY, behavior: 'instant' });
        requestAnimationFrame(function() {
          window.scrollTo({ top: previewScrollY, behavior: 'instant' });
        });
      }
    }

    // Video Player
    function openVideoModal(item) {
      recordPreviewScroll();
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(item.path) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      
      document.getElementById('video-modal-title').innerText = item.name;
      var video = document.getElementById('main-video');
      video.src = streamUrl;
      video.play().catch(function() {});
      document.getElementById('video-modal').style.display = 'flex';
    }

    window.closeVideoModal = function() {
      var video = document.getElementById('main-video');
      video.pause();
      video.src = '';
      document.getElementById('video-modal').style.display = 'none';
      restorePreviewScroll();
    };

    // Image Preview
    function openImageModal(item) {
      recordPreviewScroll();
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(item.path) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      document.getElementById('main-image').src = streamUrl;
      document.getElementById('image-modal').style.display = 'flex';
    }

    window.closeImageModal = function() {
      document.getElementById('image-modal').style.display = 'none';
      document.getElementById('main-image').src = '';
      restorePreviewScroll();
    };

    // Fullscreen Exit Event Handlers (Desktop & Mobile)
    document.addEventListener('fullscreenchange', function() {
      if (!document.fullscreenElement) {
        restorePreviewScroll();
      }
    });

    document.addEventListener('webkitfullscreenchange', function() {
      if (!document.webkitFullscreenElement) {
        restorePreviewScroll();
      }
    });

    var mainVideo = document.getElementById('main-video');
    if (mainVideo) {
      // iOS Safari native video fullscreen exit event
      mainVideo.addEventListener('webkitendfullscreen', function() {
        restorePreviewScroll();
      });
    }

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
      loadDirectory(state.currentPath, { preserveScroll: true });
    });



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
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '创建失败');
        }
      } catch (err) {
        showToast('创建异常');
      }
    };

    window.openItemActions = function(encodedPath, isDir, name) {
      var itemPath = decodeURIComponent(encodedPath);
      var item = state.items.find(function(i) { return i.path === itemPath; });
      var isVideo = item ? getFileCategory(item) === 'video' : false;

      actionModalTitle.innerText = '管理: ' + name;
      var html = '<div style="display:flex; flex-direction:column; gap:8px;">';

      if (isVideo) {
        html += '<button class="v-btn v-btn-primary" onclick="closeActionModal(); openVideoEditModal(\\'' + encodedPath + '\\', \\'' + escapeHtml(name) + '\\')">' +
          '<span>视频剪辑</span></button>';

        html += '<button class="v-btn v-btn-secondary" onclick="closeActionModal(); openVideoCompressModal(\\'' + encodedPath + '\\', \\'' + escapeHtml(name) + '\\')">' +
          '<span>压缩视频</span></button>';
      }

      html += '<button class="v-btn v-btn-secondary" onclick="openMoveModal(\\'' + encodedPath + '\\', \\'' + escapeHtml(name) + '\\')">移动</button>' +
        '<button class="v-btn v-btn-secondary" onclick="openRenameModal(\\'' + encodedPath + '\\', \\'' + escapeHtml(name) + '\\')">重命名</button>' +
        '<button class="v-btn v-btn-danger-soft" onclick="openDeleteModal(\\'' + encodedPath + '\\', ' + isDir + ', \\'' + escapeHtml(name) + '\\')">删除</button>' +
        '</div>';

      actionModalBody.innerHTML = html;
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

    window.openMoveNewSubfolderModal = async function() {
      if (!state.moveSelectedTarget) return;
      var subfolderName = await window.showPrompt({
        title: '新建子目录',
        message: '在当前所选目录下创建新子目录：',
        placeholder: '请输入文件夹名称'
      });
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
          loadDirectory(state.currentPath, { preserveScroll: true });
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
          loadDirectory(state.currentPath, { preserveScroll: true });
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
          loadDirectory(state.currentPath, { preserveScroll: true });
        } else {
          showToast(res.error || '删除失败');
        }
      } catch (err) {
        showToast('删除异常');
      }
    };

    // ==========================================
    // Video Editing, Merge & Compression Methods
    // ==========================================

    function formatTimeSec(sec) {
      if (typeof sec !== 'number' || isNaN(sec) || sec < 0) sec = 0;
      var m = Math.floor(sec / 60);
      var s = Math.floor(sec % 60);
      var ms = Math.floor((sec % 1) * 10);
      var pad = function(n) { return n.toString().padStart(2, '0'); };
      return pad(m) + ':' + pad(s) + '.' + ms;
    }

    // Video Trimmer Modal
    window.openVideoEditModal = function(encodedPath, name) {
      var filePath = decodeURIComponent(encodedPath);
      state.currentTrimPath = filePath;
      state.currentTrimName = name;
      state.trimSegments = [];
      state.trimStart = 0;
      state.trimEnd = 0;

      document.getElementById('video-edit-title').innerText = '视频剪辑: ' + name;
      var video = document.getElementById('trimmer-video');
      var streamUrl = window.location.origin + '/stream?path=' + encodeURIComponent(filePath) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      video.src = streamUrl;

      var baseWithoutExt = name.replace(/\.[^/.]+$/, '');
      document.getElementById('trim-filename-input').value = baseWithoutExt + '_cut.mp4';
      document.getElementById('trim-save-mode').value = 'replace';
      toggleTrimSaveMode();

      video.onloadedmetadata = function() {
        state.trimDuration = video.duration || 0;
        state.trimEnd = video.duration || 0;
        updateTrimmerTimeLabels();
      };

      video.ontimeupdate = function() {
        updateTrimmerTimeLabels();
      };

      renderTrimSegments();
      document.getElementById('video-edit-modal').style.display = 'flex';
    };

    function updateTrimmerTimeLabels() {
      var video = document.getElementById('trimmer-video');
      var curr = video ? video.currentTime : 0;
      var dur = state.trimDuration || (video ? video.duration : 0) || 0;
      var display = document.getElementById('trimmer-time-display');
      if (display) display.innerText = formatTimeSec(curr) + ' / ' + formatTimeSec(dur);

      var addBtn = document.getElementById('trimmer-add-segment-btn');
      if (addBtn) {
        addBtn.innerText = '添加为片段 (' + formatTimeSec(state.trimStart) + ' - ' + formatTimeSec(state.trimEnd) + ')';
      }
    }

    var seekHoldTimer = null;
    var seekIntervalTimer = null;

    window.stopSeek = function() {
      if (seekHoldTimer) {
        clearTimeout(seekHoldTimer);
        seekHoldTimer = null;
      }
      if (seekIntervalTimer) {
        clearInterval(seekIntervalTimer);
        seekIntervalTimer = null;
      }
    };

    window.startSeek = function(delta, e) {
      if (e) {
        if (e.type === 'touchstart') {
          if (e.cancelable) e.preventDefault();
        } else if (e.button !== undefined && e.button !== 0) {
          return;
        }
      }
      window.stopSeek();
      window.seekTrimmer(delta);
      seekHoldTimer = setTimeout(function() {
        seekIntervalTimer = setInterval(function() {
          window.seekTrimmer(delta);
        }, 100);
      }, 350);
    };

    window.addEventListener('mouseup', window.stopSeek);
    window.addEventListener('touchend', window.stopSeek);
    window.addEventListener('touchcancel', window.stopSeek);

    window.closeVideoEditModal = function() {
      window.stopSeek();
      var video = document.getElementById('trimmer-video');
      if (video) {
        video.pause();
        video.src = '';
      }
      document.getElementById('video-edit-modal').style.display = 'none';
    };

    window.seekTrimmer = function(delta) {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      var dur = state.trimDuration || (video.duration || 0) || 0;
      var current = typeof video.currentTime === 'number' && !isNaN(video.currentTime) ? video.currentTime : 0;
      var target = Math.max(0, Math.min(dur, current + delta));
      video.currentTime = target;
      updateTrimmerTimeLabels();
    };

    window.markTrimStart = function() {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      state.trimStart = video.currentTime;
      if (state.trimEnd < state.trimStart) {
        state.trimEnd = video.duration || state.trimStart;
      }
      updateTrimmerTimeLabels();
      showToast('已标记入点: ' + formatTimeSec(state.trimStart));
    };

    window.markTrimEnd = function() {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      state.trimEnd = video.currentTime;
      if (state.trimStart > state.trimEnd) {
        state.trimStart = 0;
      }
      updateTrimmerTimeLabels();
      showToast('已标记出点: ' + formatTimeSec(state.trimEnd));
    };

    window.addTrimSegment = function() {
      if (state.trimStart >= state.trimEnd) {
        showToast('入点时间必须小于出点时间');
        return;
      }
      var newStart = Math.round(state.trimStart * 100) / 100;
      var newEnd = Math.round(state.trimEnd * 100) / 100;

      for (var i = 0; i < state.trimSegments.length; i++) {
        var existing = state.trimSegments[i];
        if (newStart < existing.end && newEnd > existing.start) {
          showToast('当前片段与已有片段存在重叠');
          return;
        }
      }

      state.trimSegments.push({
        start: newStart,
        end: newEnd
      });
      state.trimSegments.sort(function(a, b) { return a.start - b.start; });
      renderTrimSegments();
      showToast('已添加选段');
    };

    window.removeTrimSegment = function(idx) {
      state.trimSegments.splice(idx, 1);
      renderTrimSegments();
    };

    function renderTrimSegments() {
      var listEl = document.getElementById('trimmer-segments-list');
      if (!listEl) return;

      if (state.trimSegments.length === 0) {
        listEl.innerHTML = '<span style="font-size:12px; color:var(--text-muted);">暂未添加多片段，默认导出入点至出点范围 (' + formatTimeSec(state.trimStart) + ' - ' + formatTimeSec(state.trimEnd) + ')</span>';
        return;
      }

      var html = '';
      for (var i = 0; i < state.trimSegments.length; i++) {
        var seg = state.trimSegments[i];
        html += '<div class="segment-chip" onclick="seekToSegment(' + seg.start + ', ' + seg.end + ')">' +
          '<span>片段 ' + (i + 1) + ': ' + formatTimeSec(seg.start) + ' ~ ' + formatTimeSec(seg.end) + '</span>' +
          '<span class="chip-remove" onclick="event.stopPropagation(); removeTrimSegment(' + i + ')">✕</span>' +
          '</div>';
      }
      listEl.innerHTML = html;
    }

    window.seekToSegment = function(startSec, endSec) {
      var video = document.getElementById('trimmer-video');
      if (!video) return;
      var dur = state.trimDuration || (video.duration || 0) || 0;
      var current = typeof video.currentTime === 'number' && !isNaN(video.currentTime) ? video.currentTime : 0;
      var isAtStart = Math.abs(current - startSec) < 0.05;
      var target = isAtStart ? (typeof endSec === 'number' ? endSec : startSec) : startSec;
      target = Math.max(0, Math.min(dur, target));
      video.currentTime = target;
      updateTrimmerTimeLabels();
    };

    window.toggleTrimSaveMode = function() {
      var mode = document.getElementById('trim-save-mode').value;
      var wrap = document.getElementById('trim-filename-wrap');
      if (wrap) {
        wrap.style.display = mode === 'saveAs' ? 'flex' : 'none';
      }
    };

    window.submitVideoCut = async function() {
      var mode = document.getElementById('trim-save-mode').value;
      var cutMode = 'keep';
      var filename = document.getElementById('trim-filename-input').value.trim();

      if (mode === 'replace') {
        var ok = await window.showConfirm({
          title: '覆盖保存确认',
          message: '确定要覆盖保存原视频文件吗？此操作将直接修改源文件。',
          confirmText: '覆盖保存',
          danger: true
        });
        if (!ok) return;
      }

      var segs = state.trimSegments.length > 0 ? state.trimSegments : [{ start: state.trimStart, end: state.trimEnd }];
      var taskId = 'cut_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

      try {
        var res = await apiFetch('/api/video-cut', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: taskId,
            sourcePath: state.currentTrimPath,
            segments: segs,
            cutMode: cutMode,
            mode: mode,
            customFilename: filename
          })
        });

        if (res.success) {
          closeVideoEditModal();
          showTaskProgress(taskId, '正在剪辑视频');
        } else {
          showToast(res.error || '剪辑发起失败');
        }
      } catch (err) {
        showToast('请求异常');
      }
    };

    // Video Merge Modal
    window.openBatchMergeModal = function() {
      var selectedItems = state.items.filter(function(i) { return state.selectedPaths.has(i.path); });
      var videoItems = selectedItems.filter(function(i) { return getFileCategory(i) === 'video'; });

      if (videoItems.length < 2) {
        showToast('请至少选择 2 个视频文件进行合并');
        return;
      }

      state.mergeVideos = videoItems.map(function(v) { return { path: v.path, name: v.name, size: v.size }; });
      var firstName = state.mergeVideos[0].name.replace(/\.[^/.]+$/, '');
      document.getElementById('merge-filename-input').value = firstName + '_merged.mp4';
      renderMergeList();
      document.getElementById('video-merge-modal').style.display = 'flex';
    };

    window.closeVideoMergeModal = function() {
      document.getElementById('video-merge-modal').style.display = 'none';
    };

    function renderMergeList() {
      var container = document.getElementById('merge-video-items');
      if (!container) return;

      var html = '';
      for (var i = 0; i < state.mergeVideos.length; i++) {
        var item = state.mergeVideos[i];
        html += '<div class="merge-item">' +
          '<div class="merge-item-title" title="' + escapeHtml(item.name) + '">' + (i + 1) + '. ' + escapeHtml(item.name) + ' (' + formatBytes(item.size) + ')</div>' +
          '<div class="merge-item-btns">' +
          '<button class="v-btn v-btn-secondary" style="padding:2px 8px; font-size:11px;" ' + (i === 0 ? 'disabled' : '') + ' onclick="moveMergeItem(' + i + ', -1)">↑</button>' +
          '<button class="v-btn v-btn-secondary" style="padding:2px 8px; font-size:11px;" ' + (i === state.mergeVideos.length - 1 ? 'disabled' : '') + ' onclick="moveMergeItem(' + i + ', 1)">↓</button>' +
          '<button class="v-btn v-btn-danger-soft" style="padding:2px 8px; font-size:11px;" ' + (state.mergeVideos.length <= 2 ? 'disabled' : '') + ' onclick="removeMergeItem(' + i + ')">✕</button>' +
          '</div>' +
          '</div>';
      }
      container.innerHTML = html;
    }

    window.moveMergeItem = function(idx, dir) {
      var target = idx + dir;
      if (target < 0 || target >= state.mergeVideos.length) return;
      var item = state.mergeVideos.splice(idx, 1)[0];
      state.mergeVideos.splice(target, 0, item);
      renderMergeList();
    };

    window.removeMergeItem = function(idx) {
      if (state.mergeVideos.length <= 2) return;
      state.mergeVideos.splice(idx, 1);
      renderMergeList();
    };

    window.submitVideoMerge = async function() {
      if (state.mergeVideos.length < 2) return;
      var filename = document.getElementById('merge-filename-input').value.trim();
      var taskId = 'merge_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

      try {
        var res = await apiFetch('/api/video-merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: taskId,
            videoPaths: state.mergeVideos.map(function(v) { return v.path; }),
            customFilename: filename
          })
        });

        if (res.success) {
          closeVideoMergeModal();
          clearSelection();
          showTaskProgress(taskId, '正在合并视频');
        } else {
          showToast(res.error || '合并发起失败');
        }
      } catch (err) {
        showToast('请求异常');
      }
    };

    // Video Compress Modal
    window.openVideoCompressModal = function(encodedPath, name) {
      var filePath = decodeURIComponent(encodedPath);
      state.compressFilePath = filePath;
      state.compressFileName = name;

      document.getElementById('compress-modal-title').innerText = '压缩视频: ' + name;
      var baseWithoutExt = name.replace(/\.[^/.]+$/, '');
      document.getElementById('compress-filename-input').value = baseWithoutExt + '_compressed.mp4';
      document.getElementById('compress-mode-select').value = 'saveAs';
      selectCompressPreset(2000);
      toggleCompressSaveMode();
      document.getElementById('video-compress-modal').style.display = 'flex';
    };

    window.openBatchCompressModal = function() {
      var selectedItems = state.items.filter(function(i) { return state.selectedPaths.has(i.path); });
      var videoItems = selectedItems.filter(function(i) { return getFileCategory(i) === 'video'; });

      if (videoItems.length === 0) {
        showToast('请选择视频文件进行压缩');
        return;
      }

      openVideoCompressModal(encodeURIComponent(videoItems[0].path), videoItems[0].name);
    };

    window.closeVideoCompressModal = function() {
      document.getElementById('video-compress-modal').style.display = 'none';
    };

    window.selectCompressPreset = function(kbps) {
      state.compressBitrate = kbps;
      var presets = [1000, 2000, 3500];
      for (var i = 0; i < presets.length; i++) {
        var p = presets[i];
        var btn = document.getElementById('preset-' + p);
        if (btn) {
          if (p === kbps) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      }
      var input = document.getElementById('compress-bitrate-input');
      if (input) input.value = kbps;
    };

    window.toggleCompressSaveMode = function() {
      var mode = document.getElementById('compress-mode-select').value;
      var wrap = document.getElementById('compress-filename-wrap');
      if (wrap) {
        wrap.style.display = mode === 'saveAs' ? 'flex' : 'none';
      }
    };

    window.submitVideoCompress = async function() {
      var mode = document.getElementById('compress-mode-select').value;
      var bitrate = parseInt(document.getElementById('compress-bitrate-input').value, 10) || 2000;
      var filename = document.getElementById('compress-filename-input').value.trim();

      if (mode === 'replace') {
        var ok = await window.showConfirm({
          title: '覆盖保存确认',
          message: '确定要覆盖保存原视频文件吗？此操作将以压缩后内容替换原文件。',
          confirmText: '覆盖保存',
          danger: true
        });
        if (!ok) return;
      }

      var taskId = 'compress_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

      try {
        var res = await apiFetch('/api/video-compress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: taskId,
            filePath: state.compressFilePath,
            targetBitrateKbps: bitrate,
            mode: mode,
            customFilename: filename
          })
        });

        if (res.success) {
          closeVideoCompressModal();
          clearSelection();
          showTaskProgress(taskId, '正在压缩视频');
        } else {
          showToast(res.error || '压缩发起失败');
        }
      } catch (err) {
        showToast('请求异常');
      }
    };

    // Task Progress & SSE Handling
    window.showTaskProgress = function(taskId, title) {
      state.currentTaskId = taskId;
      document.getElementById('task-progress-title').innerText = title || '正在处理';
      document.getElementById('task-progress-status').innerText = '正在启动任务';
      document.getElementById('task-progress-percent').innerText = '0%';
      document.getElementById('task-progress-fill').style.width = '0%';
      document.getElementById('task-progress-modal').style.display = 'flex';

      if (state.currentEventSource) {
        state.currentEventSource.close();
      }

      var sseUrl = '/api/task-progress?taskId=' + encodeURIComponent(taskId) + (state.token ? '&token=' + encodeURIComponent(state.token) : '');
      var es = new EventSource(sseUrl);
      state.currentEventSource = es;

      es.onmessage = function(event) {
        try {
          var data = JSON.parse(event.data);
          if (data.type === 'progress') {
            var pct = Math.min(100, Math.max(0, Math.round(data.percent || 0)));
            document.getElementById('task-progress-percent').innerText = pct + '%';
            document.getElementById('task-progress-fill').style.width = pct + '%';
            if (data.text) {
              document.getElementById('task-progress-status').innerText = data.text;
            }
          } else if (data.type === 'complete') {
            es.close();
            state.currentEventSource = null;
            document.getElementById('task-progress-modal').style.display = 'none';
            showToast('处理完成！');
            loadDirectory(state.currentPath, { preserveScroll: true });
          } else if (data.type === 'error') {
            es.close();
            state.currentEventSource = null;
            document.getElementById('task-progress-modal').style.display = 'none';
            showToast('处理失败: ' + (data.error || '未知错误'));
          } else if (data.type === 'cancelled') {
            es.close();
            state.currentEventSource = null;
            document.getElementById('task-progress-modal').style.display = 'none';
            showToast('操作已取消');
          }
        } catch (e) {
          // ignore
        }
      };

      es.onerror = function() {
        // SSE error or completed
      };
    };

    window.cancelCurrentTask = async function() {
      if (!state.currentTaskId) return;
      try {
        await apiFetch('/api/task-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: state.currentTaskId })
        });
        showToast('已请求取消任务');
      } catch (err) {
        showToast('取消失败');
      }
    };

    // Run
    init();
  </script>
</body>
</html>`;
  return cachedLanWebHtml;
}
