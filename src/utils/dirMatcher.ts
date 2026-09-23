import { calculateSimilarity, extractEffectiveChars } from '@/utils/similarity';

export interface DirTreeItem {
  name: string;
  path: string;
  depth: number;
  [key: string]: any;
}

export interface MatchSubdirectoryOptions {
  threshold?: number; // 触发自动选中的最低得分门槛，默认 5 分
}

export interface MatchBestResult<T extends DirTreeItem = DirTreeItem> {
  item: T;
  score: number;
  cleanLength: number;
  coverage: number;
}

export { extractEffectiveChars as extractCleanChars };

/**
 * 基于单字匹配度 + 文本相对顺序 + 连续成词加权的智能子目录匹配算法
 * 
 * 决胜与排序规则：
 * 1. 综合相似度得分更高优先（>= threshold，默认最低 5 分）
 * 2. 同分时，目录层级更深（更具体子分类）优先
 * 3. 同深度同分时，有效字数更短（匹配密度更高、干扰字更少）优先
 * 4. 其余保持原遍历顺序
 */
export function findBestMatchingSubdirectory<T extends DirTreeItem>(
  fileName: string,
  dirTreeList: T[],
  options: MatchSubdirectoryOptions = {}
): MatchBestResult<T> | null {
  const threshold = options.threshold ?? 5;
  if (!fileName || !dirTreeList || dirTreeList.length === 0) {
    return null;
  }

  let bestMatch: MatchBestResult<T> | null = null;

  for (const item of dirTreeList) {
    const dirName = (item.name || '').trim();
    if (!dirName) continue;

    // 比对目录名称与目标文件名的综合相似度打分（包含单字、LCS顺序与连续成词加权）
    const result = calculateSimilarity(dirName, fileName);

    // 必须达到最低门槛
    if (result.score < threshold) continue;

    if (!bestMatch) {
      bestMatch = {
        item,
        score: result.score,
        cleanLength: result.candidateLength,
        coverage: result.coverage
      };
    } else {
      if (result.score > bestMatch.score) {
        bestMatch = {
          item,
          score: result.score,
          cleanLength: result.candidateLength,
          coverage: result.coverage
        };
      } else if (result.score === bestMatch.score) {
        // 同分决胜 1：深度更深优先
        if (item.depth > bestMatch.item.depth) {
          bestMatch = {
            item,
            score: result.score,
            cleanLength: result.candidateLength,
            coverage: result.coverage
          };
        } else if (item.depth === bestMatch.item.depth) {
          // 同分决胜 2：有效字数更短（干扰字更少，匹配度更高）优先
          if (result.candidateLength < bestMatch.cleanLength) {
            bestMatch = {
              item,
              score: result.score,
              cleanLength: result.candidateLength,
              coverage: result.coverage
            };
          }
        }
      }
    }
  }

  return bestMatch;
}
