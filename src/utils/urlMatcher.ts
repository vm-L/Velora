/**
 * 统一的 URL 规则通配符匹配引擎
 * 适用于：JS 注入器、CSS 自定义样式、瀑布流模式、媒体嗅探与解析规则
 */

/**
 * 判断指定 URL 是否匹配给定的 Pattern 规则
 * 
 * 支持的规则格式：
 * 1. 全局通配：* 或 通配协议域名
 * 2. 纯域名简写：如 bilibili.com (自动匹配 bilibili.com 及 *.bilibili.com 的所有页面)
 * 3. 标准通配模板：如 *://*.bilibili.com/* 或 https://example.com/posts/*
 * 4. 任意路径正则/通配：如 *://example.com/list/*.html
 */
export const isUrlMatchPattern = (pattern: string, url: string): boolean => {
  if (!pattern || !url) return false;
  pattern = pattern.trim();
  url = url.trim();
  if (pattern === '*' || pattern === '*://*/*' || pattern === '*://*') return true;

  let urlObj: URL | null = null;
  try {
    urlObj = new URL(url);
  } catch (e) {
    return false;
  }
  const hostname = urlObj.hostname;

  // 1. 纯域名简写 (不含通配符与斜杠，例如 "bilibili.com")
  if (!pattern.includes('*') && !pattern.includes('/')) {
    return hostname === pattern || hostname.endsWith('.' + pattern);
  }

  // 2. 经典全站通配 "*://*.domain.com/*" 或 "*://domain.com/*"
  if (pattern.startsWith('*://') && pattern.endsWith('/*') && !pattern.slice(4, -2).includes('/')) {
    const domainMatch = pattern.slice(4, -2).replace(/^\*\./, '');
    return hostname === domainMatch || hostname.endsWith('.' + domainMatch);
  }

  // 3. 通用通配符转正则匹配
  let regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义特殊正则字符
    .replace(/\*/g, '.*'); // 将 * 替换为 .*

  // 将 *:// 统一替换为协议匹配
  regexPattern = regexPattern.replace(/^(?:\.\*|\(\?:https\?\|ftp\))?:\/\//, '(?:https?|ftp|file)://');

  // 末尾可选斜杠兼容处理 (例如匹配 / 或无 /)
  if (regexPattern.endsWith('\\/')) {
    regexPattern = regexPattern.slice(0, -2) + '(?:\\/)?';
  } else if (!regexPattern.endsWith('.*') && !regexPattern.endsWith('$')) {
    regexPattern = regexPattern + '(?:\\/)?';
  }

  try {
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    const rawUrl = url;
    const originPath = urlObj.origin + urlObj.pathname;
    const strippedOriginPath = originPath.replace(/\/+$/, '');
    return regex.test(rawUrl) || regex.test(originPath) || regex.test(strippedOriginPath);
  } catch (e) {
    return false;
  }
};

/**
 * 根据当前页面 URL 生成统一的默认匹配 URL 模板：
 * 1. 协议通配为 *://
 * 2. 移除 www. 前缀，匹配域名前缀加 *. (如 *.bilibili.com)
 * 3. 若无子路径或路径仅为 /，则生成 *://*.domain.com/
 * 4. 若有具体子路径，则生成 *://*.domain.com/path
 */
export const getDefaultUrlPattern = (url?: string): string => {
  if (!url || url === 'about:blank') return '*://*/*';
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname) return '*://*/*';
    const host = urlObj.hostname.replace(/^www\./, '');
    const pathname = urlObj.pathname;
    if (!pathname || pathname === '/') {
      return `*://*.${host}/`;
    }
    return `*://*.${host}${pathname}`;
  } catch (e) {
    return '*://*/*';
  }
};
