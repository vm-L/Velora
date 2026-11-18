const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * 清洗单个文件或目录名：剔除控制字符、Windows 非法字符、末尾点/空格、.. 越界及保留设备名
 */
export function sanitizeFileName(rawName: string, fallback = 'download_file'): string {
  const safeFallback =
    String(fallback || 'download_file')
      .replace(/[\x00-\x1f\x7f]/g, '')
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim()
      .replace(/[\s.]+$/, '') || 'download_file';

  let clean = String(rawName || '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .replace(/[\s.]+$/, '');

  if (!clean || clean === '.' || clean === '..') {
    return safeFallback;
  }

  if (WINDOWS_RESERVED_RE.test(clean)) {
    clean = `_${clean}`;
  }

  if (clean.length > 200) {
    const dotIdx = clean.lastIndexOf('.');
    const hasExt = dotIdx > 0 && clean.length - dotIdx <= 16;
    if (hasExt) {
      const ext = clean.slice(dotIdx);
      const stem = clean.slice(0, 200 - ext.length).replace(/[\s.]+$/, '') || 'file';
      clean = `${stem}${ext}`;
    } else {
      clean = clean.slice(0, 200).replace(/[\s.]+$/, '') || safeFallback;
    }
  }

  return clean;
}

/**
 * 清洗网盘/分享相对路径：剔除空段、`.` 与 `..`，逐段应用安全文件名清洗
 */
export function sanitizeRelativePath(rawRelPath: string, fallbackName = 'download_file'): string {
  const rawSegments = String(rawRelPath || '')
    .split(/[\\/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..');

  if (rawSegments.length === 0) {
    return sanitizeFileName(fallbackName);
  }

  const safeSegments = rawSegments.map((seg, idx) =>
    sanitizeFileName(seg, idx === rawSegments.length - 1 ? fallbackName : 'dir')
  );
  return safeSegments.join('/');
}
