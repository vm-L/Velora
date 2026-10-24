import { lanWebStyles } from './styles';
import { lanWebMarkup } from './markup';
import { lanWebScripts } from './scripts';

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
${lanWebStyles}
  </style>
</head>
<body>
${lanWebMarkup}
  <script>
${lanWebScripts}
  </script>
</body>
</html>`;
  return cachedLanWebHtml;
}
