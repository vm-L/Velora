/**
 * 字符串相似度与智能匹配打分算法
 * 
 * 核心指标：
 * 1. 单字重叠频次（Character Overlap）：候选词字符在目标文件名中的命中数量（过滤标点符号与空白，不区分大小写）
 * 2. 文本相对顺序（LCS - Longest Common Subsequence）：保持原有文本先后顺序的最大匹配长度
 * 3. 连续成词加权（Consecutive Runs）：连续相邻字符同时命中的最大长度与连续性奖励
 */

export interface SimilarityResult {
  score: number;             // 综合得分
  charOverlap: number;       // 单字命中总数
  lcsLength: number;         // 保持文本先后顺序的匹配长度 (LCS)
  maxConsecutive: number;    // 最大连续匹配字符数
  candidateLength: number;   // 候选串清洗后有效字符长度
  targetLength: number;      // 目标串清洗后有效字符长度
  coverage: number;          // 候选有效字在目标中的顺序覆盖度 (lcsLength / candidateLength)
}

/**
 * 过滤常见媒体后缀与标点符号，提取有效单字字符（小写英文字母、数字、所有 Unicode 语言字符）
 */
export function extractEffectiveChars(str: string): string[] {
  if (!str) return [];
  let s = str.trim();

  // 1. 去除常见媒体拓展名
  s = s.replace(/\.(m3u8|ts|mp4|mkv|avi|mov|wmv|flv|webm|mp3|flac|wav|aac|ogg|jpg|png|webp)$/i, '');

  // 2. 剥离常见 4 位年份标签 (如 1999, 2010, 2024 等) 和常见影视规格标签 (1080p, bluray 等) 以提纯电影/视频主体
  s = s.replace(/[\(\[\{【（]?(?:19|20)\d{2}[\)\]\}】）]?/g, '');
  s = s.replace(/\b(?:1080p|720p|2160p|4k|bluray|web-?dl|hdrip|h264|x264|h265|x265|aac)\b/gi, '');

  // 3. 转小写并使用 Array.from 处理 Unicode 编码（如特殊汉字等）
  const lower = s.toLowerCase();
  const chars = Array.from(lower);

  // 4. 过滤出字母与数字 (包含中日韩汉字及各语言字符，过滤 - _ . [ ] ( ) 空格等标点)
  return chars.filter(ch => /[\p{L}\p{N}]/u.test(ch));
}

/**
 * 计算最长公共子序列 (LCS) 以及最大连续成词长度
 */
export function calculateLCSAndConsecutive(
  candidateChars: string[],
  targetChars: string[]
): { lcsLength: number; maxConsecutive: number } {
  const m = candidateChars.length;
  const n = targetChars.length;
  if (m === 0 || n === 0) {
    return { lcsLength: 0, maxConsecutive: 0 };
  }

  // 二维 DP 计算 LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    const cChar = candidateChars[i - 1];
    for (let j = 1; j <= n; j++) {
      if (cChar === targetChars[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const lcsLength = dp[m][n];

  // 计算最大连续匹配子串长度 (Longest Common Substring)
  let maxConsecutive = 0;
  const matchDp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    const cChar = candidateChars[i - 1];
    for (let j = 1; j <= n; j++) {
      if (cChar === targetChars[j - 1]) {
        matchDp[i][j] = matchDp[i - 1][j - 1] + 1;
        if (matchDp[i][j] > maxConsecutive) {
          maxConsecutive = matchDp[i][j];
        }
      } else {
        matchDp[i][j] = 0;
      }
    }
  }

  return { lcsLength, maxConsecutive };
}

/**
 * 综合评估候选文本相对于目标文本的相似度打分
 * 
 * 评分公式：
 * - 单字频次命中：权重 1.0
 * - 保持文字先后顺序 (LCS)：权重 2.0
 * - 连续成词奖励：权重 1.5 * maxConsecutive
 */
export function calculateSimilarity(candidate: string, target: string): SimilarityResult {
  const candidateChars = extractEffectiveChars(candidate);
  const targetChars = extractEffectiveChars(target);

  if (candidateChars.length === 0 || targetChars.length === 0) {
    return {
      score: 0,
      charOverlap: 0,
      lcsLength: 0,
      maxConsecutive: 0,
      candidateLength: candidateChars.length,
      targetLength: targetChars.length,
      coverage: 0
    };
  }

  // 1. 统计单字频次消耗重叠数
  const targetCountMap = new Map<string, number>();
  for (const ch of targetChars) {
    targetCountMap.set(ch, (targetCountMap.get(ch) || 0) + 1);
  }

  let charOverlap = 0;
  for (const ch of candidateChars) {
    const rem = targetCountMap.get(ch) || 0;
    if (rem > 0) {
      charOverlap++;
      targetCountMap.set(ch, rem - 1);
    }
  }

  // 2. 计算相对顺序与最大连续匹配
  const { lcsLength, maxConsecutive } = calculateLCSAndConsecutive(candidateChars, targetChars);

  // 3. 候选词覆盖度（在保持顺序下，候选词有多少比例完整映射到了目标文本）
  const coverage = candidateChars.length > 0 ? lcsLength / candidateChars.length : 0;

  // 4. 综合打分计算
  // 基础单字得分 + 顺序权重大幅加成 + 连续成词奖励
  const consecutiveBonus = maxConsecutive >= 2 ? maxConsecutive * 1.5 : 0;
  const score = charOverlap * 1.0 + lcsLength * 2.0 + consecutiveBonus;

  return {
    score,
    charOverlap,
    lcsLength,
    maxConsecutive,
    candidateLength: candidateChars.length,
    targetLength: targetChars.length,
    coverage
  };
}

/**
 * 智能判断已有文件与待下载文件是否高度相似（同一文件的重复下载）
 * 
 * 判定规则：
 * 1. 纯英文/拉丁字母文本进行单词完整度检查，避免单字散落误判（如 image.jpg 误判 Montagem Nada Tropica）；
 * 2. 综合双向 Dice 相似度系数 (>= 0.75) 与长短串包含关系。
 */
export function isSimilarExistingFile(existingFileName: string, newFileName: string): boolean {
  if (!existingFileName || !newFileName) return false;

  // 1. 提取有效字符
  const existingChars = extractEffectiveChars(existingFileName);
  const newChars = extractEffectiveChars(newFileName);

  if (existingChars.length === 0 || newChars.length === 0) return false;

  const str1 = existingChars.join('');
  const str2 = newChars.join('');

  // 2. 完全相同
  if (str1 === str2) {
    return true;
  }

  // 3. 长度太短（<3）避免无意义误判
  const len1 = existingChars.length;
  const len2 = newChars.length;
  const minLen = Math.min(len1, len2);
  const maxLen = Math.max(len1, len2);
  if (minLen < 3) {
    return false;
  }

  // 4. 英文/拉丁单词级别重叠校验（如果纯拉丁字母文本且长度差异大，避免单字零散匹配）
  const isLatinOnly = (s: string) => /^[a-z0-9\s_-]+$/i.test(s.replace(/\.[^.]+$/, ''));
  if (isLatinOnly(existingFileName) && isLatinOnly(newFileName)) {
    const words1 = existingFileName.toLowerCase().replace(/\.[^.]+$/, '').split(/[^a-z0-9]+/i).filter(w => w.length >= 2);
    const words2 = newFileName.toLowerCase().replace(/\.[^.]+$/, '').split(/[^a-z0-9]+/i).filter(w => w.length >= 2);
    const set2 = new Set(words2);
    const commonWords = words1.filter(w => set2.has(w));
    if (commonWords.length === 0) {
      return false;
    }
  }

  // 5. 综合 LCS 与连续字长计算
  const { lcsLength, maxConsecutive } = calculateLCSAndConsecutive(existingChars, newChars);

  // 双向 Dice 相似度系数
  const dice = (2 * lcsLength) / (len1 + len2);

  // 短串连续覆盖率（最大连续子串占短串的比例）
  const consecutiveRatio = maxConsecutive / minLen;

  // 判定规则：
  // 规则 A: 双向 Dice 相似度 >= 0.75 且 最大连续成词 >= 3
  if (dice >= 0.75 && maxConsecutive >= 3) {
    return true;
  }

  // 规则 B: 短串 >=95% 完整连续包含在长串中（如 "自由的你" 包含在 "自由的你 (官方版)" 中），且长度差异在合理范围内（短串占长串 >= 50%）
  if (consecutiveRatio >= 0.95 && (minLen / maxLen) >= 0.5 && maxConsecutive >= 3) {
    return true;
  }

  return false;
}
