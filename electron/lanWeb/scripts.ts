import { lanWebCoreScripts } from './scripts/core';
import { lanWebBrowserScripts } from './scripts/browser';
import { lanWebPreviewAndSearchScripts } from './scripts/previewAndSearch';
import { lanWebFileActionsScripts } from './scripts/fileActions';
import { lanWebTrimmerScripts } from './scripts/trimmer';
import { lanWebMergeAndQueueScripts } from './scripts/mergeAndQueue';

export const lanWebScripts = [
  lanWebCoreScripts,
  lanWebBrowserScripts,
  lanWebPreviewAndSearchScripts,
  lanWebFileActionsScripts,
  lanWebTrimmerScripts,
  lanWebMergeAndQueueScripts
].join('\n');
