import type http from 'http';

export type LanViewMode = 'desktop' | 'mobile';

export const LAN_VIEW_COOKIE_NAME = 'velora_lan_view';

/**
 * 解析 HTTP Cookie 请求头
 */
export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

/**
 * 根据 Cookie 偏好、Sec-CH-UA-Mobile 与 User-Agent 判定局域网访问入口
 * 规则：
 * 1. 若用户手动切换过版本并存在偏好 Cookie，则优先使用偏好值
 * 2. 平板设备（iPad / Android Tablet / HarmonyOS Tablet）默认归属桌面端 /desktop
 * 3. 手机设备默认归属移动端 /m
 */
export function detectLanDeviceView(headers: http.IncomingHttpHeaders): LanViewMode {
  const rawCookie = typeof headers.cookie === 'string' ? headers.cookie : '';
  const cookies = parseCookieHeader(rawCookie);
  if (cookies[LAN_VIEW_COOKIE_NAME] === 'mobile') return 'mobile';
  if (cookies[LAN_VIEW_COOKIE_NAME] === 'desktop') return 'desktop';

  const ua = typeof headers['user-agent'] === 'string' ? headers['user-agent'] : '';
  const chMobile = typeof headers['sec-ch-ua-mobile'] === 'string' ? headers['sec-ch-ua-mobile'].trim() : '';

  // 明确识别的平板设备统一归属桌面端
  const isExplicitTablet =
    /\biPad\b/i.test(ua) ||
    /\bTablet\b/i.test(ua) ||
    /\bPlayBook\b/i.test(ua) ||
    /\bSilk\b/i.test(ua) ||
    (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua));
  if (isExplicitTablet) {
    return 'desktop';
  }

  // Client Hint 明确指示手机
  if (chMobile === '?1') {
    return 'mobile';
  }
  if (chMobile === '?0') {
    return 'desktop';
  }

  // 经典手机 UA 特征
  const isPhoneUa =
    /\biPhone\b/i.test(ua) ||
    /\biPod\b/i.test(ua) ||
    /\bWindows Phone\b/i.test(ua) ||
    /\bIEMobile\b/i.test(ua) ||
    /\bOpera Mini\b/i.test(ua) ||
    /\bBlackBerry\b/i.test(ua) ||
    (/\bAndroid\b/i.test(ua) && /\bMobile\b/i.test(ua)) ||
    (/\bHarmonyOS\b/i.test(ua) && /\bMobile\b/i.test(ua));

  return isPhoneUa ? 'mobile' : 'desktop';
}
