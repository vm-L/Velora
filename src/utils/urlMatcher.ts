/**
 * 统一的 URL 规则通配符匹配引擎
 * 适用于：JS 注入器、CSS 自定义样式、瀑布流模式、媒体嗅探与解析规则
 */

/**
 * 判断指定 URL 是否匹配给定的 Pattern 规则
 * 
 * 支持的规则格式：
 * 1. 全局通配：* 或 通配协议域名
 * 2. 纯域名或路径简写：如 music.mmp.cc/、music.mmp.cc/list（自动内置协议匹配 *://，严格比对路径字面量）
 * 3. 显式通配模板：如 *://*.bilibili.com/* 或 https://example.com/posts/*
 * 4. 任意路径正则/通配：如 example.com/list/*.html
 */
export const isUrlMatchPattern = (pattern: string, url: string): boolean => {
  if (!pattern || !url) return false;
  pattern = pattern.trim();
  url = url.trim();
  if (pattern === '*' || pattern === '*://*/*' || pattern === '*://*' || pattern === '*/*') return true;

  let urlObj: URL | null = null;
  try {
    urlObj = new URL(url);
  } catch (e) {
    return false;
  }
  const hostname = urlObj.hostname;

  // 1. 如果 pattern 不以协议开头（即不含 ://），自动为其补充协议通配
  // 例如 "music.mmp.cc/" -> "*://music.mmp.cc/"
  // "music.mmp.cc/list" -> "*://music.mmp.cc/list"
  // "bilibili.com/*" -> "*://bilibili.com/*"
  let normalizedPattern = pattern;
  if (!normalizedPattern.includes('://')) {
    normalizedPattern = `*://${normalizedPattern}`;
  }

  // 2. 经典全站通配 "*://*.domain.com/*" 或 "*://domain.com/*"
  if (normalizedPattern.startsWith('*://') && normalizedPattern.endsWith('/*') && !normalizedPattern.slice(4, -2).includes('/')) {
    const domainMatch = normalizedPattern.slice(4, -2).replace(/^\*\./, '');
    return hostname === domainMatch || hostname.endsWith('.' + domainMatch);
  }

  // 3. 通用通配符转正则匹配
  let regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义特殊正则字符
    .replace(/\*/g, '.*'); // 将 * 替换为 .*

  // 将 *:// 统一替换为协议匹配
  regexPattern = regexPattern.replace(/^(?:\.\*|\(\?:https\?\|ftp\))?:\/\//, '(?:https?|ftp|file)://');

  try {
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    const rawUrl = url;
    const originPath = urlObj.origin + urlObj.pathname;
    return regex.test(rawUrl) || regex.test(originPath);
  } catch (e) {
    return false;
  }
};

/**
 * 根据当前页面 URL 生成统一的默认匹配 URL 模板：
 * 1. 不显式展示协议 "*://"，内置到规则引擎中
 * 2. 保留当前完整 host（包括 www.、子域名、端口等）与原始 pathname（包含末尾斜杠）
 * 3. 移除 Query 与 Hash
 * 例如：
 * - https://music.mmp.cc/ -> music.mmp.cc/
 * - https://music.mmp.cc/list/ -> music.mmp.cc/list/
 * - https://music.mmp.cc/list -> music.mmp.cc/list
 */
export const getDefaultUrlPattern = (url?: string): string => {
  if (!url || url === 'about:blank') return '*';
  try {
    const urlObj = new URL(url);
    if (!urlObj.host) return '*';
    const host = urlObj.host;
    const pathname = urlObj.pathname || '/';
    return `${host}${pathname}`;
  } catch (e) {
    return '*';
  }
};
