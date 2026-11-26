import { lanWebCoreScripts } from './scripts/core';
import { lanWebNavigationScripts } from './scripts/navigation';
import { lanWebBrowserScripts } from './scripts/browser';
import { lanWebDesktopInteractionsScripts } from './scripts/desktopInteractions';
import { lanWebMobileInteractionsScripts } from './scripts/mobileInteractions';
import { lanWebPreviewAndSearchScripts } from './scripts/previewAndSearch';
import { lanWebFileActionsScripts } from './scripts/fileActions';
import { lanWebTrimmerScripts } from './scripts/trimmer';
import { lanWebMergeAndQueueScripts } from './scripts/mergeAndQueue';

export const lanWebScripts = [
  lanWebCoreScripts,
  lanWebNavigationScripts,
  lanWebBrowserScripts,
  lanWebDesktopInteractionsScripts,
  lanWebMobileInteractionsScripts,
  lanWebPreviewAndSearchScripts,
  lanWebFileActionsScripts,
  lanWebTrimmerScripts,
  lanWebMergeAndQueueScripts
].join('\n');
