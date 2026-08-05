import { net } from 'electron';
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

// Simple AdBlock Rule Parser (Supports EasyList / ABP / uBlock formats)
export function parseRulesText(text: string): { domainBlocks: string[], regexes: string[], count: number } {
  if (!text) return { domainBlocks: [], regexes: [], count: 0 };

  const lines = text.split(/\r?\n/);
  const domainBlocks: string[] = [];
  const regexes: string[] = [];
  let count = 0;

  for (let line of lines) {
    line = line.trim();
    // Skip empty lines, comments, and element hiding rules (##)
    if (!line || line.startsWith('!') || line.startsWith('[Adblock') || line.includes('##') || line.includes('#@#')) {
      continue;
    }

    // Skip whitelist rules for basic request blocking (or handle @@)
    if (line.startsWith('@@')) {
      continue;
    }

    // Handle domain block rule: ||domain.com^ or ||domain.com
    if (line.startsWith('||')) {
      let domain = line.slice(2).replace(/\^.*$/, '').replace(/\/.*$/, '').trim().toLowerCase();
      if (domain && !domain.includes('*')) {
        domainBlocks.push(domain);
        count++;
        continue;
      }
    }

    // Handle simple URL pattern match: e.g. /ad_banner_*, http://...
    if (line.length > 4 && line.length < 150) {
      try {
        // Convert simple wildcard to regex
        let clean = line.replace(/[\^]/g, '.*');
        if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('*')) {
          let pattern = clean.replace(/([.*+?^${}()|[\]\\])/g, '\\$1').replace(/\\\*/g, '.*');
          regexes.push(pattern);
          count++;
        }
      } catch {}
    }
  }

  return { domainBlocks, regexes, count };
}

// Check if a URL should be blocked as an Ad
export function isAdUrl(url: string): boolean {
  if (!url || compiledRules.totalRules === 0) return false;

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // 1. Domain match check (including subdomains)
    let domainParts = hostname.split('.');
    for (let i = 0; i < domainParts.length - 1; i++) {
      let subDomain = domainParts.slice(i).join('.');
      if (compiledRules.domainBlocks.has(subDomain)) {
        return true;
      }
    }

    // 2. Regex pattern check (capped for performance)
    for (let i = 0; i < compiledRules.urlRegexes.length; i++) {
      if (compiledRules.urlRegexes[i].test(url)) {
        return true;
      }
    }
  } catch {}

  return false;
}

// Recompile active rules from a dictionary of sourceId -> rules text
export function updateCompiledRules(sourcesData: Record<string, string>) {
  compiledRules.domainBlocks.clear();
  compiledRules.urlRegexes = [];
  compiledRules.whitelists.clear();
  let totalCount = 0;

  for (const [_, text] of Object.entries(sourcesData)) {
    if (!text) continue;
    const { domainBlocks, regexes, count } = parseRulesText(text);
    
    domainBlocks.forEach(d => compiledRules.domainBlocks.add(d));
    
    // Limit regexes to top 500 for performance
    for (const r of regexes) {
      if (compiledRules.urlRegexes.length >= 500) break;
      try {
        compiledRules.urlRegexes.push(new RegExp(r, 'i'));
      } catch {}
    }

    totalCount += count;
  }

  compiledRules.totalRules = compiledRules.domainBlocks.size + compiledRules.urlRegexes.length;
  logger.info('AdBlock', `Compiled ${compiledRules.domainBlocks.size} domains & ${compiledRules.urlRegexes.length} regexes (Total rules: ${totalCount})`);
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
