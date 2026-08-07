/**
 * 校验并替换文件名中不符合 Windows / macOS / Linux 系统规定的非法字符，
 * 并对连续重复的全角/半角符号与标点进行去重处理 (如 !!! -> !, ？？？ -> ？, ___ -> _, 【【 -> 【)
 */
export function sanitizeFilename(filename: string, replacement: string = '_'): string {
  if (!filename) return '';
  let str = String(filename).trim();

  // 分离可能存在的合法后缀扩展名 (如 .mp4, .m3u8, .png)
  const lastDotIndex = str.lastIndexOf('.');
  let baseName = str;
  let ext = '';

  if (lastDotIndex > 0 && lastDotIndex < str.length - 1) {
    const potentialExt = str.slice(lastDotIndex + 1);
    if (/^[a-zA-Z0-9]+$/i.test(potentialExt)) {
      baseName = str.slice(0, lastDotIndex);
      ext = '.' + potentialExt;
    }
  }

  // 1. 替换 Windows/Linux/macOS 不允许的非法字符: \ / : * ? " < > |
  baseName = baseName.replace(/[\\/:\*\?"<>\|]/g, replacement);

  // 2. 替换控制字符 (0x00-0x1F, 0x7F)
  baseName = baseName.replace(/[\x00-\x1f\x7f]/g, '');

  // 3. 对连续重复的全角/半角标点与特殊符号进行去重 (如 !!! -> !, ？？？ -> ？, ___ -> _, 【【 -> 【)
  // 排除 Unicode 字母 (\p{L})、数字 (\p{N}) 和空白字符 (\s)
  baseName = baseName.replace(/([^\p{L}\p{N}\s])\1+/gu, '$1');

  // 4. 消除前导和首尾的点和空格 (Windows 兼容)
  baseName = baseName.replace(/^[\.\s]+|[\.\s]+$/g, '');

  // 若清理后变为空，退回默认通用名称
  if (!baseName) {
    baseName = 'unnamed_file';
  }

  return baseName + ext;
}
