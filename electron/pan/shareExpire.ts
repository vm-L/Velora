/**
 * 分享有效期中性码及各网盘映射
 */

export const ShareExpire = {
  UNKNOWN: 0,
  FOREVER: 1,
  ONE_DAY: 2,
  SEVEN_DAYS: 3,
  THIRTY_DAYS: 4,

  PAN115_FOREVER: 101,
  PAN115_ONE_DAY: 102,
  PAN115_THREE_DAYS: 103,
  PAN115_SEVEN_DAYS: 104,
  PAN115_FIFTEEN_DAYS: 105
} as const;

export function daysOrNull(expireType: number): number | null {
  switch (expireType) {
    case ShareExpire.ONE_DAY:
      return 1;
    case ShareExpire.SEVEN_DAYS:
      return 7;
    case ShareExpire.THIRTY_DAYS:
      return 30;
    case ShareExpire.FOREVER:
      return null;
    default:
      throw new Error(`未知的分享有效期代码: ${expireType}`);
  }
}

export function toQuarkOrUcExpiredType(expireType: number): 1 | 2 | 3 | 4 {
  switch (expireType) {
    case ShareExpire.FOREVER:
    case ShareExpire.ONE_DAY:
    case ShareExpire.SEVEN_DAYS:
    case ShareExpire.THIRTY_DAYS:
      return expireType;
    default:
      throw new Error(`未知的分享有效期代码: ${expireType}`);
  }
}

export function toBaiduPeriod(expireType: number): 0 | 1 | 7 | 30 {
  const days = daysOrNull(expireType);
  if (days === null) return 0;
  return days as 1 | 7 | 30;
}

export function toPan123Expiration(expireType: number): string {
  const days = daysOrNull(expireType);
  if (days === null) {
    return '2099-12-12T08:00:00+08:00';
  }
  const targetMs = Date.now() + days * 24 * 60 * 60 * 1000;
  // 以东八区 (+08:00) 格式化为 ISO-8601 字符串，对齐 123 云盘接口要求
  const offsetDate = new Date(targetMs + 8 * 60 * 60 * 1000);
  const yyyy = offsetDate.getUTCFullYear();
  const mm = String(offsetDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(offsetDate.getUTCDate()).padStart(2, '0');
  const hh = String(offsetDate.getUTCHours()).padStart(2, '0');
  const mi = String(offsetDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(offsetDate.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+08:00`;
}

export function toXunleiExpirationDays(expireType: number): string {
  const days = daysOrNull(expireType);
  return days !== null ? String(days) : '-1';
}

export function toC139Period(expireType: number): number | null {
  return daysOrNull(expireType);
}

export function toGuangYaDuration(expireType: number): number {
  return daysOrNull(expireType) ?? 0;
}

export function toPan115Duration(expireType: number): '-1' | '1' | '3' | '7' | '15' {
  switch (expireType) {
    case ShareExpire.PAN115_FOREVER:
    case ShareExpire.FOREVER:
      return '-1';
    case ShareExpire.PAN115_ONE_DAY:
    case ShareExpire.ONE_DAY:
      return '1';
    case ShareExpire.PAN115_THREE_DAYS:
      return '3';
    case ShareExpire.PAN115_SEVEN_DAYS:
    case ShareExpire.SEVEN_DAYS:
      return '7';
    case ShareExpire.PAN115_FIFTEEN_DAYS:
    case ShareExpire.THIRTY_DAYS:
      return '15';
    default:
      throw new Error(`未知的 115 分享有效期代码: ${expireType}`);
  }
}
