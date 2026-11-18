import { app, net } from 'electron';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

export interface AdBlockSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  isBuiltIn?: boolean;
  ruleCount: number;
  lastUpdated?: number;
}

interface CompiledRules {
  domainBlocks: Set<string>;
  urlRegexes: RegExp[];
  whitelists: Set<string>;
  totalRules: number;
}

const compiledRules: CompiledRules = {
  domainBlocks: new Set(),
  urlRegexes: [],
  whitelists: new Set(),
  totalRules: 0
};

const MAX_DECISION_CACHE_SIZE = 2000;
const decisionCache = new Map<string, boolean>();

function getAdBlockCacheDir(): string {
  const userDataDir = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), 'data');
  return path.join(userDataDir, 'adblock_cache');
}

function getRuleCachePath(sourceId: string): string {
  const safeId = (sourceId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getAdBlockCacheDir(), `${safeId}.txt`);
}

export async function saveRuleCacheFile(sourceId: string, content: string): Promise<void> {
  if (!sourceId) return;
  try {
    const dir = getAdBlockCacheDir();
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(getRuleCachePath(sourceId), content || '', 'utf8');
  } catch (err: any) {
    logger.warn('AdBlock', `Failed to save rule cache (${sourceId}): ${err.message}`);
  }
}

export function saveRuleCacheFileSync(sourceId: string, content: string): void {
  if (!sourceId) return;
  try {
    const dir = getAdBlockCacheDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(getRuleCachePath(sourceId), content || '', 'utf8');
  } catch (err: any) {
    logger.warn('AdBlock', `Failed to save rule cache sync (${sourceId}): ${err.message}`);
  }
}

async function readRuleCacheFile(sourceId: string): Promise<string> {
  if (!sourceId) return '';
  try {
    return await fs.promises.readFile(getRuleCachePath(sourceId), 'utf8');
  } catch {
    return '';
  }
}

function extractDomainRule(rawRule: string): string | null {
  const domain = rawRule.replace(/\^.*$/, '').replace(/\/.*$/, '').trim().toLowerCase();
  if (domain && !domain.includes('*') && !domain.includes('$')) {
    return domain;
  }
  return null;
}

// Simple AdBlock Rule Parser (Supports EasyList / ABP / uBlock formats)
export function parseRulesText(text: string): {
  domainBlocks: string[];
  whitelists: string[];
  regexes: string[];
  count: number;
} {
  if (!text) return { domainBlocks: [], whitelists: [], regexes: [], count: 0 };

  const lines = text.split(/\r?\n/);
  const domainBlocks: string[] = [];
  const whitelists: string[] = [];
  const regexes: string[] = [];
  let count = 0;

  for (let line of lines) {
    line = line.trim();
    // Skip empty lines, comments, and element hiding rules (##)
    if (!line || line.startsWith('!') || line.startsWith('[Adblock') || line.includes('##') || line.includes('#@#')) {
      continue;
    }

    // Handle whitelist rules: @@||domain.com^
    if (line.startsWith('@@')) {
      const rest = line.slice(2);
      if (rest.startsWith('||')) {
        const domain = extractDomainRule(rest.slice(2));
        if (domain) {
          whitelists.push(domain);
          count++;
        }
      }
      continue;
    }

    // Handle domain block rule: ||domain.com^ or ||domain.com
    if (line.startsWith('||')) {
      const domain = extractDomainRule(line.slice(2));
      if (domain) {
        domainBlocks.push(domain);
        count++;
        continue;
      }
    }

    // Handle simple URL pattern match: e.g. /ad_banner_*, http://...
    if (line.length > 4 && line.length < 150) {
      try {
        const clean = line.replace(/[\^]/g, '*');
        if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('*')) {
          const pattern = clean.replace(/([.*+?^${}()|[\]\\])/g, '\\$1').replace(/\\\*/g, '.*');
          regexes.push(pattern);
          count++;
        }
      } catch {}
    }
  }

  return { domainBlocks, whitelists, regexes, count };
}

function matchDomainSet(hostname: string, targetSet: Set<string>): boolean {
  if (targetSet.size === 0) return false;
  if (targetSet.has(hostname)) return true;
  let dotIndex = hostname.indexOf('.');
  while (dotIndex !== -1) {
    const parent = hostname.slice(dotIndex + 1);
    if (parent && parent.includes('.') && targetSet.has(parent)) {
      return true;
    }
    dotIndex = hostname.indexOf('.', dotIndex + 1);
  }
  return false;
}

// Check if a URL should be blocked as an Ad
export function isAdUrl(url: string): boolean {
  if (!url || compiledRules.totalRules === 0) return false;

  const cached = decisionCache.get(url);
  if (cached !== undefined) {
    return cached;
  }

  let blocked = false;
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // 1. Whitelist exemption check
    if (matchDomainSet(hostname, compiledRules.whitelists)) {
      blocked = false;
    } else if (matchDomainSet(hostname, compiledRules.domainBlocks)) {
      // 2. Domain match check (including subdomains)
      blocked = true;
    } else {
      // 3. Combined regex pattern check (max 10 regex executions instead of 500)
      for (let i = 0; i < compiledRules.urlRegexes.length; i++) {
        if (compiledRules.urlRegexes[i].test(url)) {
          blocked = true;
          break;
        }
      }
    }
  } catch {
    blocked = false;
  }

  if (decisionCache.size >= MAX_DECISION_CACHE_SIZE) {
    const oldestKey = decisionCache.keys().next().value;
    if (oldestKey !== undefined) {
      decisionCache.delete(oldestKey);
    }
  }
  decisionCache.set(url, blocked);
  return blocked;
}

function compileBatchedRegexes(rawPatterns: string[]): RegExp[] {
  const result: RegExp[] = [];
  const BATCH_SIZE = 50;
  for (let i = 0; i < rawPatterns.length; i += BATCH_SIZE) {
    const slice = rawPatterns.slice(i, i + BATCH_SIZE);
    try {
      result.push(new RegExp(`(?:${slice.join(')|(?:')})`, 'i'));
    } catch {
      // If any pattern in the batch breaks combined compilation, compile individually
      for (const p of slice) {
        try {
          result.push(new RegExp(p, 'i'));
        } catch {}
      }
    }
  }
  return result;
}

// Recompile active rules from disk cache IDs or legacy dictionary of sourceId -> rules text
export async function updateCompiledRules(sourcesOrIds: Record<string, string> | string[]): Promise<number> {
  compiledRules.domainBlocks.clear();
  compiledRules.urlRegexes = [];
  compiledRules.whitelists.clear();
  decisionCache.clear();

  let sourcesData: Record<string, string>;
  if (Array.isArray(sourcesOrIds)) {
    sourcesData = {};
    const contents = await Promise.all(
      sourcesOrIds.map(async (id) => ({ id, content: await readRuleCacheFile(id) }))
    );
    for (const item of contents) {
      if (item.content) {
        sourcesData[item.id] = item.content;
      }
    }
  } else {
    sourcesData = sourcesOrIds || {};
  }

  let totalCount = 0;
  const collectedRegexPatterns: string[] = [];

  for (const [, text] of Object.entries(sourcesData)) {
    if (!text) continue;
    const { domainBlocks, whitelists, regexes, count } = parseRulesText(text);

    for (const d of domainBlocks) compiledRules.domainBlocks.add(d);
    for (const w of whitelists) compiledRules.whitelists.add(w);

    for (const r of regexes) {
      if (collectedRegexPatterns.length >= 500) break;
      collectedRegexPatterns.push(r);
    }

    totalCount += count;
  }

  compiledRules.urlRegexes = compileBatchedRegexes(collectedRegexPatterns);
  compiledRules.totalRules =
    compiledRules.domainBlocks.size + compiledRules.whitelists.size + collectedRegexPatterns.length;
  logger.info(
    'AdBlock',
    `Compiled ${compiledRules.domainBlocks.size} domains, ${compiledRules.whitelists.size} whitelists & ${collectedRegexPatterns.length} regexes into ${compiledRules.urlRegexes.length} groups (Total rules: ${totalCount})`
  );
  return compiledRules.totalRules;
}

// Fetch raw rules text from a remote URL via Electron net API
export function fetchRemoteRuleSource(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const req = net.request(url);
      let body = '';

      req.on('response', (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP Error ${res.statusCode}`));
        }
        res.on('data', (chunk) => {
          body += chunk.toString('utf-8');
        });
        res.on('end', () => {
          resolve(body);
        });
        res.on('error', (err) => {
          reject(err);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    } catch (err) {
      reject(err);
    }
  });
}
