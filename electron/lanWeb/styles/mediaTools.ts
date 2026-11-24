export const lanWebMediaToolsStyles = `    /* Video Trimmer Modal */
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
      max-height: 25vh;
      min-height: 120px;
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
      max-height: 25vh;
      object-fit: contain;
      cursor: pointer;
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

    .trimmer-controls > * {
      flex-shrink: 0;
    }

    .video-edit-modal-content .modal-footer {
      flex-shrink: 0;
      background: var(--bg-surface);
      border-top: 1px solid var(--border-light);
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .time-steppers {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      width: 100%;
      flex-shrink: 0;
    }

    .time-steppers .v-btn {
      padding: 6px 4px;
      font-size: 12px;
      min-width: 0;
      justify-content: center;
      user-select: none;
      -webkit-user-select: none;
    }

    .trimmer-action-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      width: 100%;
      flex-shrink: 0;
    }

    .trimmer-action-row .v-btn {
      padding: 6px 4px;
      font-size: 12px;
      min-width: 0;
      justify-content: center;
      white-space: nowrap;
      user-select: none;
      -webkit-user-select: none;
    }

    .trimmer-action-row .v-btn.active {
      background: var(--color-accent);
      color: var(--color-accent-text);
      border-color: var(--color-accent);
    }

    .trim-points-row {
      display: grid;
      grid-template-columns: 1fr 1.2fr 1fr;
      gap: 6px;
      width: 100%;
      flex-shrink: 0;
    }

    .trim-points-row .v-btn {
      padding: 6px 4px;
      font-size: 12px;
      min-width: 0;
      justify-content: center;
      white-space: nowrap;
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
      min-height: 38px;
      flex-shrink: 0;
      text-align: center;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      transition: border-color 0.15s;
    }

    .time-display:active {
      border-color: var(--color-accent);
    }

    .time-display-progress {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: 0%;
      background: color-mix(in srgb, var(--color-accent) 18%, transparent);
      pointer-events: none;
      z-index: 0;
      transition: width 0.05s ease-out;
    }

    .time-display-text {
      position: relative;
      z-index: 1;
      pointer-events: none;
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

    .segment-chip.active {
      border-color: var(--color-accent);
      background: var(--bg-hover);
      box-shadow: 0 0 0 1px var(--color-accent);
      font-weight: 600;
    }

    .segment-chip.invalid {
      border-style: dashed;
      color: var(--text-muted);
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

    /* Segmented Control */
    .segmented-control {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--bg-app);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      gap: 3px;
      user-select: none;
      -webkit-user-select: none;
      box-sizing: border-box;
      width: 100%;
    }

    .segmented-option {
      padding: 6px 12px;
      text-align: center;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid transparent;
    }

    .segmented-option:hover {
      color: var(--text-primary);
    }

    .segmented-option.active {
      background: var(--bg-surface);
      color: var(--text-primary);
      font-weight: 600;
      border-color: var(--border-light);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    [data-theme='dark'] .segmented-option.active {
      background: var(--bg-hover);
      border-color: var(--border-color);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
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

    /* Touch & Mobile UX Enhancements */
    .file-card {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      touch-action: manipulation;
    }

    .file-card.pressing {
      transform: scale(0.97);
      opacity: 0.9;
    }

    .grid-sentinel {
      width: 100%;
      height: 36px;
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: var(--text-tertiary);
      pointer-events: none;
    }

    .network-indicator {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      background: var(--bg-surface-hover);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      transition: all 0.25s ease;
    }

    .network-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-success);
      flex-shrink: 0;
      transition: background-color 0.25s ease;
    }

    .network-indicator.disconnected {
      color: var(--color-error);
      border-color: rgba(239, 68, 68, 0.25);
      background: rgba(239, 68, 68, 0.08);
    }

    .network-indicator.disconnected .network-dot {
      background: var(--color-error);
      animation: net-blink 1.2s infinite;
    }

    @keyframes net-blink {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.85); }
    }

    .image-modal-content img.swipe-left {
      transform: translateX(-40px);
      opacity: 0;
    }

    .image-modal-content img.swipe-right {
      transform: translateX(40px);
      opacity: 0;
    }`;
