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

export const PAN_SHARE_METAS: Record<string, { type: string; name: string; domains: string[] }> = {
  quark: { type: 'quark', name: '夸克网盘', domains: ['pan.quark.cn'] },
  uc: { type: 'uc', name: 'UC网盘', domains: ['drive.uc.cn', 'fast.uc.cn'] },
  baidu: { type: 'baidu', name: '百度网盘', domains: ['pan.baidu.com'] },
  '123pan': {
    type: '123pan',
    name: '123云盘',
    domains: ['123pan.com', '123pan.cn', '123684.com', '123865.com', '123912.com']
  },
  lanzou: { type: 'lanzou', name: '蓝奏云', domains: ['lanzou', 'woozooo.com'] },
  ilanzou: { type: 'ilanzou', name: '蓝奏云优享版', domains: ['ilanzou.'] },
  xunlei: { type: 'xunlei', name: '迅雷云盘', domains: ['pan.xunlei.com'] },
  '115': { type: '115', name: '115网盘', domains: ['115.com', '115cdn.com', '115rc.com', 'anxia.com'] },
  '139': { type: '139', name: '中国移动云盘', domains: ['yun.139.com', 'caiyun.139.com'] },
  guangya: { type: 'guangya', name: '光鸭云盘', domains: ['guangyapan.com'] }
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
