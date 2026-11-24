export const lanWebBaseStyles = `/* Pristine Elegance OKLCH Theme Variables - 1:1 with Velora App */
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
`;
