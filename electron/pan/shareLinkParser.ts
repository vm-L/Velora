import { PanType } from './types';
import { panHttpRequest } from './utils';

export interface ParsedShareResult {
  panType: PanType;
  shareId: string;
  normalizedUrl: string;
  pwd?: string;
}

const URL_REGEX = /https?:\/\/[^\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef"'<>]+/i;
const QUARK_RE = /pan\.quark\.cn\/s\/([A-Za-z0-9]+)/i;
const UC_RE = /(?:drive|fast)\.uc\.cn\/s\/([A-Za-z0-9]+)/i;
const XUNLEI_RE = /pan\.xunlei\.com\/s\/([A-Za-z0-9_-]+)/i;
const BAIDU_RE = /pan\.baidu\.com\/s\/(1[A-Za-z0-9_-]+)/i;
const BAIDU_INIT_RE = /pan\.baidu\.com\/share\/init\?[^#\s]*surl=([A-Za-z0-9_-]+)/i;
const C139_SHARE_RE = /(?:yun|caiyun)\.139\.com\/(?:shareweb\/.*?)?w\/i\/([A-Za-z0-9_-]+)/i;
const C139_SHORT_RE = /caiyun\.139\.com\/m\/i\?([A-Za-z0-9_-]+)/i;
const PAN123_RE = /123(?:865|684|912|pan)\.(?:com|cn)\/s\/([A-Za-z0-9-]+)(?:\/)?/i;
const PAN123_SUB_RE = /share\.123pan\.cn\/123pan\/([A-Za-z0-9-]+)/i;
const PAN123_SRR_RE = /123(?:pan|865)\.(?:com|cn)\/api\/srr\?[^#\s]*sk=([A-Za-z0-9-]+)/i;
const PAN115_RE = /(?:115(?:cdn|rc)?\.com|anxia\.com)\/s\/(sw[A-Za-z0-9]+|[A-Za-z0-9]+)/i;
const PAN115_CMD_RE = /(?:115(?:cdn|rc)?\.com|anxia\.com)(?:\/s)?\/(sw[A-Za-z0-9]{8,})-([A-Za-z0-9]{4,8})/i;
const PAN115_PWD_IN_URL_RE = /[?&]password=([A-Za-z0-9]+)/i;
const GUANGYA_RE = /guangyapan\.com\/s\/([A-Za-z0-9_-]+)/i;
const ILANZOU_RE = /(?:^|[/.])ilanzou\.(?:com|net|org|cn)\/s\/([A-Za-z0-9_-]+)/i;
const LANZOU_RE = /(?:^|[/.])(?:lanzou[a-z0-9-]*|lan[zs]o[ux]|woozooo)\.(?:com|net|org|cn)\/([A-Za-z0-9]+)/i;

const PWD_URL_RE = /[?&](?:pwd|pass|passcode|password|code)=([A-Za-z0-9]+)/i;
const PWD_TEXT_RE = /(?:提取码|访问码|密码|code|pwd)[：:\s]*([A-Za-z0-9]{4,8})/i;

export const XUNLEI_KOULING_CONSTANTS = {
  JUMP_API: 'https://api-shoulei-ssl.xunlei.com/xlppc.searcher.api/jump',
  ORIGIN: 'https://sl-m-ssl.xunlei.com',
  REFERER: 'https://sl-m-ssl.xunlei.com/',
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.215 Safari/537.36 TBC/1.3.3.999 Thunder/12.4.4.3740',
  TN: '15007414_5_dg',
  SRC: 'lm',
  LS: 'sm3016480',
  LM_EXTEND: 'ctype%3A31',
  MAX_LENGTH: 64
};

const TRIM_CHARS = new Set(Array.from('「」『』【】《》〈〉“”‘’"\'`()（）[]{}<>.,，。;；:：!！?？、| \t\r\n'));

export function normalizeKoulingText(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && TRIM_CHARS.has(text[start])) start++;
  while (end > start && TRIM_CHARS.has(text[end - 1])) end--;
  return text.slice(start, end).trim();
}

export function looksLikeXunleiKouling(text: string): boolean {
  const t = normalizeKoulingText(text);
  if (!t || t.length > XUNLEI_KOULING_CONSTANTS.MAX_LENGTH) return false;
  if (/https?:\/\//i.test(t)) return false;
  // 正文仅含汉字/字母/数字且至少包含 1 个汉字
  if (!/^[\u4e00-\u9fffA-Za-z0-9]+$/.test(t)) return false;
  return /[\u4e00-\u9fff]/.test(t);
}

export function hasExplicitXunleiKoulingMarker(text: string): boolean {
  if (!looksLikeXunleiKouling(text)) return false;
  return /(?:迅雷|口令|「|」|『|』|#|【|】|复制)/.test(text);
}

export async function resolveXunleiKouling(text: string): Promise<{ url: string; pwd?: string } | null> {
  const keyword = normalizeKoulingText(text);
  if (!keyword || keyword.length > XUNLEI_KOULING_CONSTANTS.MAX_LENGTH) {
    return null;
  }
  const jumpUrl =
    `${XUNLEI_KOULING_CONSTANTS.JUMP_API}?noredirect=1&t=20&wd=${encodeURIComponent(keyword)}` +
    `&tn=${XUNLEI_KOULING_CONSTANTS.TN}&src=${XUNLEI_KOULING_CONSTANTS.SRC}&ls=${XUNLEI_KOULING_CONSTANTS.LS}&lm_extend=${XUNLEI_KOULING_CONSTANTS.LM_EXTEND}`;

  try {
    const resp = await panHttpRequest(jumpUrl, {
      method: 'GET',
      timeoutMs: 8000,
      headers: {
        Origin: XUNLEI_KOULING_CONSTANTS.ORIGIN,
        Referer: XUNLEI_KOULING_CONSTANTS.REFERER,
        'User-Agent': XUNLEI_KOULING_CONSTANTS.USER_AGENT,
        Accept: 'application/json, text/plain, */*'
      }
    });
    if (!resp.ok || !resp.text) return null;
    let json: any = null;
    try {
      json = JSON.parse(resp.text);
    } catch {
      return null;
    }
    if (!json || typeof json !== 'object') return null;

    const location: string | undefined = json.location || json.data?.location || json.url;
    const koulingType: string | undefined = json.ext?.kouling_type || json.data?.ext?.kouling_type;
    if (koulingType && koulingType !== 'share_page' && (!location || !XUNLEI_RE.test(location))) {
      return null;
    }
    if (!location) return null;
    const shareMatch = location.match(XUNLEI_RE);
    if (!shareMatch) return null;
    const shareId = shareMatch[1];
    const pwdMatch = location.match(/[?&]pwd=([A-Za-z0-9]+)/i);
    const pwd = pwdMatch?.[1];
    return {
      url: pwd ? `https://pan.xunlei.com/s/${shareId}?pwd=${pwd}` : `https://pan.xunlei.com/s/${shareId}`,
      pwd
    };
  } catch {
    return null;
  }
}

export function parseShareText(text: string): ParsedShareResult | null {
  if (!text || !text.trim()) return null;
  const rawMatch = text.trim().match(URL_REGEX)?.[0];
  const url = rawMatch
    ? rawMatch.replace(/[。，,；;)）\]}"'」』】》>]+$/g, '')
    : '';
  if (!url) return null;

  const extractPwd = (urlRegex = PWD_URL_RE) =>
    url.match(urlRegex)?.[1] || text.match(PWD_TEXT_RE)?.[1];

  const quarkMatch = url.match(QUARK_RE);
  if (quarkMatch) {
    return {
      panType: 'quark',
      shareId: quarkMatch[1],
      normalizedUrl: url,
      pwd: extractPwd()
    };
  }

  const ucMatch = url.match(UC_RE);
  if (ucMatch) {
    return {
      panType: 'uc',
      shareId: ucMatch[1],
      normalizedUrl: url,
      pwd: extractPwd()
    };
  }

  const xunleiMatch = url.match(XUNLEI_RE);
  if (xunleiMatch) {
    return {
      panType: 'xunlei',
      shareId: xunleiMatch[1],
      normalizedUrl: url,
      pwd: extractPwd()
    };
  }

  const baiduMatch = url.match(BAIDU_RE);
  if (baiduMatch) {
    return {
      panType: 'baidu',
      shareId: baiduMatch[1].replace(/^1/, ''),
      normalizedUrl: url,
      pwd: extractPwd()
    };
  }
  const baiduInitMatch = url.match(BAIDU_INIT_RE);
  if (baiduInitMatch) {
    return {
      panType: 'baidu',
      shareId: baiduInitMatch[1],
      normalizedUrl: url,
      pwd: extractPwd()
    };
  }

  const c139Match = url.match(C139_SHARE_RE) || url.match(C139_SHORT_RE);
  if (c139Match) {
    return {
      panType: '139',
      shareId: c139Match[1],
      normalizedUrl: url,
      pwd: extractPwd()
    };
  }

  const pan123Match = url.match(PAN123_RE) || url.match(PAN123_SUB_RE) || url.match(PAN123_SRR_RE);
  if (pan123Match) {
    const shareKey = pan123Match[1];
    return {
      panType: '123pan',
      shareId: shareKey,
      normalizedUrl: `https://www.123pan.com/s/${shareKey}`,
      pwd: extractPwd()
    };
  }

  const pan115CmdMatch = url.match(PAN115_CMD_RE);
  if (pan115CmdMatch) {
    return {
      panType: '115',
      shareId: pan115CmdMatch[1],
      normalizedUrl: `https://115.com/s/${pan115CmdMatch[1]}?password=${pan115CmdMatch[2]}`,
      pwd: pan115CmdMatch[2]
    };
  }

  const pan115Match = url.match(PAN115_RE);
  if (pan115Match) {
    return {
      panType: '115',
      shareId: pan115Match[1],
      normalizedUrl: url,
      pwd: url.match(PAN115_PWD_IN_URL_RE)?.[1] || extractPwd()
    };
  }

  const guangyaMatch = url.match(GUANGYA_RE);
  if (guangyaMatch) {
    return {
      panType: 'guangya',
      shareId: guangyaMatch[1],
      normalizedUrl: url,
      pwd: extractPwd()
    };
  }

  // ilanzou 必须先于 lanzou 判断
  const ilanzouMatch = url.match(ILANZOU_RE);
  if (ilanzouMatch) {
    return {
      panType: 'ilanzou',
      shareId: ilanzouMatch[1],
      normalizedUrl: url,
      pwd: extractPwd()
    };
  }

  const lanzouMatch = url.match(LANZOU_RE);
  if (lanzouMatch) {
    return {
      panType: 'lanzou',
      shareId: lanzouMatch[1],
      normalizedUrl: url,
      pwd: extractPwd()
    };
  }

  return null;
}
