export const lanWebMediaToolsStyles = `    /* ==========================================
       Shared Scrubber & Timeline Segment Overlay
       ========================================== */
    .time-display {
      font-family: ui-monospace, Consolas, monospace;
      font-variant-numeric: tabular-nums;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      background: var(--bg-surface);
      border-radius: 8px;
      border: 1px solid var(--border-color);
      width: 100%;
      min-height: 32px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
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
      background: color-mix(in srgb, var(--color-accent) 10%, transparent);
      pointer-events: none;
      z-index: 0;
    }

    .trimmer-segments-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
    }

    .trimmer-seg-bar {
      position: absolute;
      top: 3px;
      bottom: 3px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--color-accent) 12%, transparent);
      border: 1px solid var(--text-tertiary);
    }

    .trimmer-seg-bar.active {
      background: color-mix(in srgb, var(--color-accent) 22%, transparent);
      border: 1.5px solid var(--color-accent);
    }

    .trimmer-playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0%;
      width: 2px;
      background: var(--color-accent);
      pointer-events: none;
      z-index: 2;
    }

    .time-display-text {
      position: relative;
      z-index: 3;
      pointer-events: none;
      background: color-mix(in srgb, var(--bg-surface) 84%, transparent);
      padding: 1px 8px;
      border-radius: 4px;
      font-size: 12px;
    }

    /* ==========================================
       Desktop D2 Split-Pane Video Edit Workbench
       ========================================== */
    .desktop-d2-workbench {
      width: min(1120px, 94vw);
      height: min(680px, 88vh);
      max-width: 96vw;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .desktop-d2-header {
      height: 46px;
      padding: 0 16px;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
    }

    .desktop-d2-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: var(--text-primary);
    }

    .desktop-d2-title {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .desktop-d2-header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .trim-help-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .trim-shortcuts-popover {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 288px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 12px 14px;
      box-shadow: var(--shadow-soft);
      z-index: 40;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-4px);
      transition: opacity 0.16s ease, transform 0.16s ease;
    }

    .trim-help-wrap:hover .trim-shortcuts-popover,
    .trim-help-wrap:focus-within .trim-shortcuts-popover {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .trim-popover-title {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border-light);
    }

    .trim-shortcut-grid {
      display: grid;
      grid-template-columns: 1fr auto;
      row-gap: 6px;
      column-gap: 10px;
      font-size: 11.5px;
      color: var(--text-secondary);
      align-items: center;
    }

    .trim-keys {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      justify-content: flex-end;
    }

    .trim-shortcut-grid kbd {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 10.5px;
      padding: 1px 5px;
      border-radius: 4px;
      background: var(--border-light);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
    }

    .desktop-d2-body {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 344px;
      grid-template-rows: minmax(0, 1fr);
    }

    .desktop-d2-stage {
      background: var(--bg-app);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      min-height: 0;
    }

    .desktop-d2-video-wrap {
      flex: 1;
      min-height: 0;
      background: #141517;
      border-radius: 10px;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .desktop-d2-video-wrap video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      cursor: pointer;
    }

    .desktop-d2-hud {
      position: absolute;
      top: 10px;
      left: 12px;
      background: rgba(18, 18, 17, 0.65);
      color: #f8f7f4;
      font-size: 11.5px;
      font-family: ui-monospace, Consolas, monospace;
      padding: 4px 9px;
      border-radius: 6px;
      pointer-events: none;
    }

    .desktop-d2-controls-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex-shrink: 0;
    }

    .desktop-d2-track {
      min-height: 24px;
      height: 24px;
      background: var(--border-light);
      border-radius: 6px;
    }

    .desktop-d2-ctrl-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .desktop-d2-ctrl-left,
    .desktop-d2-ctrl-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .desktop-play-btn {
      width: 32px;
      height: 28px;
      padding: 0;
    }

    .desktop-step-btn {
      height: 28px;
      padding: 0 10px;
      font-size: 12px;
      font-family: ui-monospace, Consolas, monospace;
      line-height: 1;
    }

    .desktop-step-btn.active {
      background: var(--bg-surface);
      color: var(--color-accent);
      border-color: var(--color-accent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, transparent), var(--shadow-sm);
    }

    .trim-modifier-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      font-size: 11px;
      line-height: 1;
      color: var(--text-secondary);
      background: var(--border-light);
      border: 1px solid var(--border-color);
      padding: 0 8px;
      border-radius: 6px;
      font-family: ui-monospace, Consolas, monospace;
      box-sizing: border-box;
      white-space: nowrap;
    }

    .desktop-d2-timecode {
      font-family: ui-monospace, Consolas, monospace;
      font-variant-numeric: tabular-nums;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-primary);
      margin-right: 4px;
    }

    .desktop-speed-btn {
      height: 28px;
      padding: 0 9px;
      font-size: 11.5px;
      font-family: ui-monospace, Consolas, monospace;
    }

    .desktop-d2-inspector {
      border-left: 1px solid var(--border-color);
      background: var(--bg-surface);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .desktop-d2-mark-row {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-light);
      display: grid;
      grid-template-columns: 1fr 1fr 1.15fr;
      gap: 6px;
      flex-shrink: 0;
    }

    .desktop-d2-mark-row .v-btn {
      padding: 0 8px;
      font-size: 12px;
      line-height: 1;
    }

    .desktop-d2-list-header {
      padding: 10px 14px 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .desktop-d2-segments-list {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 4px 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .desktop-seg-card {
      border: 1px solid var(--border-color);
      background: var(--bg-app);
      border-radius: 8px;
      padding: 9px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: pointer;
      flex-shrink: 0;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }

    .desktop-seg-card:hover {
      border-color: var(--text-secondary);
    }

    .desktop-seg-card.active {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 1px var(--color-accent);
      background: var(--bg-surface);
    }

    .desktop-seg-card.invalid {
      border-style: dashed;
    }

    .desktop-seg-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }

    .desktop-seg-title {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .desktop-seg-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .desktop-seg-actions .v-btn-icon {
      width: 24px;
      height: 24px;
      font-size: 11px;
    }

    .desktop-seg-inputs {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      gap: 6px;
      align-items: center;
      width: 100%;
    }

    .desktop-seg-inputs .v-input {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      padding: 4px 6px;
      font-size: 11.5px;
      font-family: ui-monospace, Consolas, monospace;
      text-align: center;
    }

    .desktop-d2-export-box {
      padding: 12px 14px;
      border-top: 1px solid var(--border-light);
      background: var(--bg-app);
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }

    .desktop-d2-export-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 2px;
    }

    .desktop-d2-summary {
      font-size: 11.5px;
      color: var(--text-secondary);
      font-family: ui-monospace, Consolas, monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ==========================================
       Mobile S3 Native Fullscreen Video Editor
       ========================================== */
    .mobile-s3-overlay {
      padding: 0 !important;
    }

    .mobile-s3-workbench {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      background: var(--bg-surface);
      border: none;
      border-radius: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    .mobile-s3-header {
      height: 46px;
      padding: 0 10px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-light);
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .mobile-s3-title {
      flex: 1;
      min-width: 0;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-s3-speed-btn {
      height: 28px;
      padding: 0 8px;
      font-size: 11.5px;
      font-family: ui-monospace, Consolas, monospace;
    }

    .mobile-s3-save-btn {
      height: 30px;
      padding: 0 12px;
      font-size: 12.5px;
    }

    .mobile-s3-video-wrap {
      width: 100%;
      height: 31dvh;
      min-height: 165px;
      max-height: 260px;
      background: #141517;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
    }

    .mobile-s3-video-wrap video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      cursor: pointer;
    }

    .mobile-s3-body {
      flex: 1;
      min-height: 0;
      background: var(--bg-surface);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .mobile-s3-section {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-light);
      flex-shrink: 0;
    }

    .mobile-s3-scrubber {
      height: 32px;
      min-height: 32px;
    }

    .mobile-s3-step-zone {
      background: var(--bg-app);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mobile-s3-steppers {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 7px;
      width: 100%;
    }

    .mobile-s3-steppers .v-btn {
      height: 46px;
      padding: 0 4px;
      font-size: 13.5px;
      font-weight: 600;
      font-family: ui-monospace, Consolas, monospace;
      user-select: none;
      -webkit-user-select: none;
    }

    .mobile-s3-mark-row {
      display: grid;
      grid-template-columns: 1fr 1.1fr 1fr;
      gap: 8px;
    }

    .mobile-s3-mark-row .v-btn {
      height: 40px;
      padding: 0 6px;
      font-size: 12.5px;
    }

    .mobile-s3-segments-section {
      flex: 1 1 0%;
      min-height: 0;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      overflow: hidden;
    }

    .mobile-s3-seg-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
    }

    .mobile-s3-summary {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: ui-monospace, Consolas, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-s3-segments-list {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      touch-action: pan-y;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-bottom: 8px;
      -webkit-overflow-scrolling: touch;
    }

    .mobile-seg-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 7px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      font-family: ui-monospace, Consolas, monospace;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      flex-shrink: 0;
    }

    .mobile-seg-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-seg-row.active {
      background: var(--bg-surface-hover);
      border-color: var(--color-accent);
      box-shadow: 0 0 0 1px var(--color-accent);
      color: var(--text-primary);
      font-weight: 600;
    }

    .mobile-seg-row.invalid {
      border-style: dashed;
      color: var(--text-muted);
    }

    .mobile-seg-row-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .mobile-seg-row-actions .v-btn-icon {
      width: 26px;
      height: 26px;
      font-size: 12px;
    }

    /* Mobile Bottom Export Sheet */
    .mobile-s3-sheet-mask {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.42);
      z-index: 30;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .mobile-s3-sheet-card {
      width: 100%;
      background: var(--bg-surface);
      border-top: 1px solid var(--border-color);
      border-radius: 14px 14px 0 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      display: flex;
      flex-direction: column;
    }

    .mobile-s3-sheet-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .mobile-s3-sheet-body {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mobile-s3-sheet-summary {
      font-size: 12.5px;
      color: var(--text-secondary);
      font-family: ui-monospace, Consolas, monospace;
    }

    .mobile-s3-sheet-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border-light);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
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
      background: var(--bg-surface);
      color: var(--color-accent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, transparent), var(--shadow-sm);
      font-weight: 600;
    }

    /* Segmented Control */
    .segmented-control {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--border-light);
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
      padding: 6px 10px;
      text-align: center;
      font-size: 12.5px;
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
      background: var(--bg-surface-active);
      border-color: var(--border-color);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    }

    .segmented-control.mobile-s3-tier-switch {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .segmented-control.mobile-s3-tier-switch .segmented-option {
      font-size: 11.5px;
      padding: 6px 2px;
      white-space: nowrap;
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
      background: var(--color-accent);
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

    .image-modal-content img.swipe-left {
      transform: translateX(-40px);
      opacity: 0;
    }

    .image-modal-content img.swipe-right {
      transform: translateX(40px);
      opacity: 0;
    }`;
