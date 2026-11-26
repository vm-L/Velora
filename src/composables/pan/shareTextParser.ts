import { sanitizeFileName, sanitizeRelativePath } from '@/utils/pathSanitizer';

export interface PanFileWithUrl {
  id?: string;
  name: string;
  path: string;
  size: number;
  downloadUrl?: string;
  isDirectory?: boolean;
  rawInfo?: any;
}

export interface NormalizedPanShareItem {
  fid?: string;
  fidToken?: string;
  pwdId?: string;
  stoken?: string;
  extra?: Record<string, any>;
}

export interface SniffedPanLink {
  url: string;
  password: string;
  panType: string;
  panName: string;
  title?: string;
  timestamp: number;
}

export interface PageAnchorCandidate {
  href: string;
  text?: string;
  context?: string;
}

export const PAN_SHARE_METAS: Record<string, { type: string; name: string; domains: string[] }> = {
  ilanzou: { type: 'ilanzou', name: '蓝奏云优享版', domains: ['ilanzou.'] },
  quark: { type: 'quark', name: '夸克网盘', domains: ['pan.quark.cn'] },
  uc: { type: 'uc', name: 'UC网盘', domains: ['drive.uc.cn', 'fast.uc.cn'] },
  baidu: { type: 'baidu', name: '百度网盘', domains: ['pan.baidu.com'] },
  '123pan': {
    type: '123pan',
    name: '123云盘',
    domains: ['123pan.com', '123pan.cn', '123684.com', '123865.com', '123912.com']
  },
  lanzou: { type: 'lanzou', name: '蓝奏云', domains: ['lanzou', 'woozooo.com'] },
  xunlei: { type: 'xunlei', name: '迅雷云盘', domains: ['pan.xunlei.com'] },
  '115': { type: '115', name: '115网盘', domains: ['115.com', '115cdn.com', '115rc.com', 'anxia.com'] },
  '139': { type: '139', name: '中国移动云盘', domains: ['yun.139.com', 'caiyun.139.com'] },
  guangya: { type: 'guangya', name: '光鸭云盘', domains: ['guangyapan.com'] }
};

/**
 * 识别单个 URL 所属的网盘类型（同时过滤网盘首页/登录页等非分享路径）
 */
export const detectPanShareMeta = (rawUrl: string): { type: string; name: string } | null => {
  const trimmed = (rawUrl || '').trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname || '/';
  const fullLower = trimmed.toLowerCase();

  let matched: { type: string; name: string } | null = null;
  for (const meta of Object.values(PAN_SHARE_METAS)) {
    if (meta.domains.some((d) => host.includes(d))) {
      matched = { type: meta.type, name: meta.name };
      break;
    }
  }
  if (!matched) return null;

  // 排除明显非分享路径（根路径、登录、个人盘主界面等），降低浏览网盘官网时的误报
  const cleanPath = pathname.replace(/\/+$/, '');
  if (!cleanPath && !parsed.hash && !parsed.search) return null;
  if (/^\/(?:disk|login|signin|register|home|download|about|help)(?:\/|$)/i.test(cleanPath)) {
    return null;
  }

  switch (matched.type) {
    case 'quark':
    case 'uc':
    case 'xunlei':
    case '115':
    case '123pan':
      if (!/(?:\/s\/|\/share\/|\/t\/|sharekey=|surl=)/i.test(fullLower)) return null;
      break;
    case 'baidu':
      if (!/(?:\/s\/|\/share\/init|surl=)/i.test(fullLower)) return null;
      break;
    case '139':
      if (!/(?:\/share\/|\/w\/|linkid=|\/m\/i\?)/i.test(fullLower)) return null;
      break;
    case 'guangya':
      if (!/(?:\/s\/|\/share\/)/i.test(fullLower)) return null;
      break;
    case 'ilanzou':
      if (!/(?:\/s\/|\/b\/)/i.test(fullLower)) return null;
      break;
    case 'lanzou':
      // 蓝奏云分享路径通常为 /iXXXX 或 /bXXXX 或 /tp/iXXXX
      if (!/^\/(?:tp\/)?[a-zA-Z0-9_-]{4,}$/i.test(cleanPath)) return null;
      break;
  }

  return matched;
};

const PASSWORD_PATTERN = /(?:提取码|密码|访问码|口令|code|pwd)[:：\s]*([a-zA-Z0-9]{4,8})/i;

const extractPasswordFromUrl = (rawUrl: string): string => {
  try {
    const parsedUrl = new URL(rawUrl);
    return (
      parsedUrl.searchParams.get('pwd') ||
      parsedUrl.searchParams.get('password') ||
      parsedUrl.searchParams.get('passcode') ||
      parsedUrl.searchParams.get('code') ||
      ''
    ).trim();
  } catch {
    return '';
  }
};

const normalizeShareUrlForDedup = (rawUrl: string): string => {
  try {
    const u = new URL(rawUrl);
    // 去掉末尾标点与多余斜杠，保留 query 以便保留带 pwd 的完整链接
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}${u.search}${u.hash}`;
  } catch {
    return rawUrl.trim();
  }
};

const cleanMatchedUrl = (raw: string): string => {
  return raw.replace(/[.,;!?，。；！？、]+$/g, '');
};

/**
 * 批量从网页纯文本与超链接候选中提取所有 10 大网盘分享链接及紧邻提取码
 */
export const extractAllPanShareLinks = (
  rawText: string,
  anchors: PageAnchorCandidate[] = []
): SniffedPanLink[] => {
  const resultMap = new Map<string, SniffedPanLink>();
  const now = Date.now();

  const upsert = (url: string, password: string, title?: string) => {
    const cleanUrl = cleanMatchedUrl(url);
    const meta = detectPanShareMeta(cleanUrl);
    if (!meta) return;

    const dedupKey = normalizeShareUrlForDedup(cleanUrl);
    const finalPwd = (password || extractPasswordFromUrl(cleanUrl) || '').trim();
    const cleanTitle = (title || '').replace(/\s+/g, ' ').trim().slice(0, 80);

    const existing = resultMap.get(dedupKey);
    if (!existing) {
      resultMap.set(dedupKey, {
        url: cleanUrl,
        password: finalPwd,
        panType: meta.type,
        panName: meta.name,
        title: cleanTitle && !/^https?:\/\//i.test(cleanTitle) ? cleanTitle : undefined,
        timestamp: now
      });
    } else {
      if (!existing.password && finalPwd) {
        existing.password = finalPwd;
      }
      if (!existing.title && cleanTitle && !/^https?:\/\//i.test(cleanTitle)) {
        existing.title = cleanTitle;
      }
    }
  };

  // 1. 优先解析页面 <a> 锚点（包含精准标题与周围上下文提取码）
  for (const anchor of anchors) {
    if (!anchor?.href) continue;
    const contextText = `${anchor.text || ''} ${anchor.context || ''}`;
    const pwdMatch = contextText.match(PASSWORD_PATTERN);
    upsert(anchor.href, pwdMatch?.[1] || '', anchor.text);
  }

  // 2. 扫描纯文本中直接裸露的网盘链接及紧邻 60 字符内的提取码
  if (rawText) {
    const urlRegex = /https?:\/\/[^\s\u3000-\u303f\uff00-\uffef\u4e00-\u9fff"'<>()（）【】[\]]+/gi;
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(rawText)) !== null) {
      const matchedUrl = cleanMatchedUrl(match[0]);
      if (!detectPanShareMeta(matchedUrl)) continue;
      const tailWindow = rawText.slice(match.index + match[0].length, match.index + match[0].length + 64);
      const firstLineWindow = tailWindow.split(/\r?\n/).slice(0, 2).join(' ');
      const pwdMatch = firstLineWindow.match(PASSWORD_PATTERN);
      upsert(matchedUrl, pwdMatch?.[1] || '');
    }
  }

  return Array.from(resultMap.values());
};

/**
 * 判断文本是否可能为支持的网盘分享链接或迅雷口令
 */
export const isProbablyPanText = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  for (const meta of Object.values(PAN_SHARE_METAS)) {
    if (meta.domains.some(d => lower.includes(d))) return true;
  }
  // 仅匹配明确的迅雷口令特征，避免误填普通中文剪贴板文本
  return /(?:迅雷云盘|迅雷口令|复制这段内容.*迅雷|pan\.xunlei\.com)/i.test(trimmed);
};

/**
 * 从分享长文本或带参链接中提取干净 URL 与提取码
 */
export const extractShareUrlAndPassword = (rawText: string): { url: string; password: string } => {
  const pwdMatch = rawText.match(/(?:提取码|密码|访问码|code|pwd)[:：\s]*([a-zA-Z0-9]{4,8})/i);
  const urlMatch = rawText.match(/https?:\/\/[^\s\u3000-\u303f\uff00-\uffef\u4e00-\u9fff"'<>()（）【】[\]]+/i);

  let urlPwd = '';
  if (urlMatch) {
    try {
      const parsedUrl = new URL(urlMatch[0]);
      urlPwd =
        parsedUrl.searchParams.get('pwd') ||
        parsedUrl.searchParams.get('password') ||
        parsedUrl.searchParams.get('passcode') ||
        parsedUrl.searchParams.get('code') ||
        '';
    } catch {}
  }

  return {
    url: urlMatch ? urlMatch[0] : rawText.trim(),
    password: pwdMatch?.[1] || urlPwd || ''
  };
};

/**
 * 归一化分享文件元数据并深去响应式代理，防止 IPC structuredClone 报错
 */
export const normalizePanShareFile = (file: PanFileWithUrl): NormalizedPanShareItem => {
  const r = file.rawInfo || {};
  const fid =
    r.fid ||
    (r.FileId !== undefined ? String(r.FileId) : undefined) ||
    (r.fs_id !== undefined ? String(r.fs_id) : undefined) ||
    file.id;
  const fidToken = r.fidToken || r.share_fid_token || r.S3keyFlag;
  const pwdId = r.pwdId || r.pwd_id || r.shareKey;
  const stoken = r.stoken || r.sekey;
  const safeName = sanitizeFileName(file.name || 'download_file');
  const relativePath = sanitizeRelativePath(file.path || file.name || safeName, safeName);
  const baseExtra =
    r.extra && typeof r.extra === 'object'
      ? r.extra
      : Object.keys(r).length > 0
        ? r
        : {};
  let safeBaseExtra: Record<string, any> = {};
  try {
    safeBaseExtra = JSON.parse(JSON.stringify(baseExtra));
  } catch {
    safeBaseExtra = { ...baseExtra };
  }
  const extra: Record<string, any> = {
    ...safeBaseExtra,
    relativePath
  };
  return {
    fid: fid !== undefined ? String(fid) : undefined,
    fidToken,
    pwdId,
    stoken,
    extra
  };
};
