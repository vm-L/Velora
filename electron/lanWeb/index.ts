import { lanWebStyles } from './styles';
import { lanWebScripts } from './scripts';
import { lanWebRemoteStyles } from './shared/remoteStyles';
import { lanWebRemoteScripts } from './shared/remoteScripts';
import { lanDesktopMarkup } from './desktop/markup';
import { lanDesktopStyles } from './desktop/styles';
import { lanMobileMarkup } from './mobile/markup';
import { lanMobileStyles } from './mobile/styles';

let cachedDesktopHtml: string | null = null;
let cachedMobileHtml: string | null = null;

function buildLanDocument(options: {
  bodyClass: string;
  title: string;
  extraStyles: string;
  markup: string;
}): string {
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>${options.title}</title>
  <link rel="icon" type="image/png" href="/icon.png">
  <style>
${lanWebStyles}
${lanWebRemoteStyles}
${options.extraStyles}
  </style>
</head>
<body class="${options.bodyClass}">
${options.markup}
  <script>
${lanWebScripts}
${lanWebRemoteScripts}
  </script>
</body>
</html>`;
}

export function getLanDesktopHtml(): string {
  if (cachedDesktopHtml) {
    return cachedDesktopHtml;
  }
  cachedDesktopHtml = buildLanDocument({
    bodyClass: 'lan-desktop-mode',
    title: 'Velora - 局域网工作台',
    extraStyles: lanDesktopStyles,
    markup: lanDesktopMarkup
  });
  return cachedDesktopHtml;
}

export function getLanMobileHtml(): string {
  if (cachedMobileHtml) {
    return cachedMobileHtml;
  }
  cachedMobileHtml = buildLanDocument({
    bodyClass: 'lan-mobile-mode',
    title: 'Velora - 移动终端',
    extraStyles: lanMobileStyles,
    markup: lanMobileMarkup
  });
  return cachedMobileHtml;
}

/**
 * 向下兼容保留导出，默认返回桌面工作台入口 HTML
 */
export function getLanWebHtml(): string {
  return getLanDesktopHtml();
}
