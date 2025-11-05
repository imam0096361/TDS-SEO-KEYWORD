/**
 * Keyword Utility Functions
 * - Duplicate detection and removal
 * - Similarity calculation
 * - Difficulty estimation (when DataForSEO not available)
 * - Ranking confidence scoring
 */

import type { Keyword, RankingConfidence } from '../types';

/**
 * Calculate similarity between two strings (0-1)
 * Uses Jaccard similarity with word tokenization
 */
export const calculateSimilarity = (str1: string, str2: string): number => {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
};

/**
 * Remove duplicate/similar keywords from array
 * Keeps the first occurrence, removes subsequent similar ones
 *
 * @param keywords - Array of keywords
 * @param threshold - Similarity threshold (0-1), default 0.8 (80% similar)
 * @returns Deduplicated keywords
 */
export const removeDuplicateKeywords = (keywords: Keyword[], threshold: number = 0.8): Keyword[] => {
  const result: Keyword[] = [];

  for (const keyword of keywords) {
    // Check if this keyword is too similar to any already added
    const isDuplicate = result.some(existing =>
      calculateSimilarity(keyword.term, existing.term) >= threshold
    );

    if (!isDuplicate) {
      result.push(keyword);
    } else {
      console.log(`🗑️  Removed duplicate keyword: "${keyword.term}" (too similar to existing)`);
    }
  }

  return result;
};

/**
 * Estimate keyword difficulty when DataForSEO is not available
 * Based on keyword characteristics and AI estimates
 *
 * @param keyword - Keyword object
 * @param category - 'primary' | 'secondary' | 'longtail'
 * @returns Difficulty score (0-100)
 */
export const estimateKeywordDifficulty = (
  keyword: Keyword,
  category: 'primary' | 'secondary' | 'longtail'
): number => {
  let baseScore = 0;

  // Category-based baseline
  switch (category) {
    case 'primary':
      baseScore = 60; // High-volume head terms are usually competitive
      break;
    case 'secondary':
      baseScore = 40; // Medium volume = medium difficulty
      break;
    case 'longtail':
      baseScore = 20; // Long-tail = easier to rank
      break;
  }

  // Adjust based on keyword length (longer = easier)
  const wordCount = keyword.term.split(/\s+/).length;
  if (wordCount >= 5) {
    baseScore -= 15; // Very long tail
  } else if (wordCount >= 3) {
    baseScore -= 10; // Long tail
  }

  // Adjust based on search volume estimate
  if (keyword.searchVolume) {
    const volume = keyword.searchVolume.toString().toLowerCase();
    if (volume.includes('high') || volume.includes('100k') || volume.includes('50k')) {
      baseScore += 20; // High volume = more competition
    } else if (volume.includes('low') || volume.includes('500')) {
      baseScore -= 15; // Low volume = less competition
    }
  }

  // Adjust based on search intent (commercial/transactional = harder)
  if (keyword.searchIntent === 'transactional' || keyword.searchIntent === 'commercial') {
    baseScore += 10; // Money keywords are more competitive
  }

  // Ensure score is within 0-100
  return Math.max(0, Math.min(100, baseScore));
};

/**
 * Determine winnability category from difficulty score
 */
export const getWinnability = (difficulty: number): 'Easy' | 'Medium' | 'Hard' | 'Very Hard' => {
  if (difficulty <= 30) return 'Easy';
  if (difficulty <= 60) return 'Medium';
  if (difficulty <= 85) return 'Hard';
  return 'Very Hard';
};

/**
 * Calculate ranking confidence score for a keyword
 *
 * @param keyword - Keyword with difficulty and volume data
 * @param domainAuthority - Website's domain authority (Daily Star ≈ 75-85)
 * @param articleRelevance - How well article covers this keyword (0-100)
 * @returns Confidence score (0-100) and estimated rank
 */
export const calculateKeywordConfidence = (
  keyword: Keyword,
  domainAuthority: number = 80, // Daily Star default
  articleRelevance: number = 90  // Assume high relevance
): { confidence: number; estimatedRank: string } => {
  const difficulty = keyword.difficultyScore || 50;

  // Factors (weighted)
  const difficultyFactor = (100 - difficulty) * 0.4;  // 40% weight - easier = better
  const authorityFactor = domainAuthority * 0.3;      // 30% weight
  const relevanceFactor = articleRelevance * 0.2;     // 20% weight
  const freshnessBonus = 10;                          // 10% - news articles get boost

  const confidence = Math.round(
    difficultyFactor + authorityFactor + relevanceFactor + freshnessBonus
  );

  // Estimate ranking position
  let estimatedRank: string;
  if (confidence >= 80) {
    estimatedRank = '#1';
  } else if (confidence >= 65) {
    estimatedRank = 'Top 3';
  } else if (confidence >= 50) {
    estimatedRank = 'Top 5';
  } else if (confidence >= 35) {
    estimatedRank = 'Top 10';
  } else {
    estimatedRank = 'Page 2+';
  }

  return {
    confidence: Math.min(100, Math.max(0, confidence)),
    estimatedRank
  };
};

/**
 * Calculate overall ranking confidence for all keywords
 *
 * @param primary - Primary keywords
 * @param secondary - Secondary keywords
 * @param longtail - Long-tail keywords
 * @param domainAuthority - Website DA
 * @returns Overall ranking confidence
 */
export const calculateRankingConfidence = (
  primary: Keyword[],
  secondary: Keyword[],
  longtail: Keyword[],
  domainAuthority: number = 80
): RankingConfidence => {
  // Calculate average search volume score
  const allKeywords = [...primary, ...secondary, ...longtail];
  let avgSearchVolumeScore = 0;
  let volumeCount = 0;

  for (const kw of allKeywords) {
    if (kw.searchVolumeNumeric) {
      // Real data available
      if (kw.searchVolumeNumeric >= 10000) avgSearchVolumeScore += 95;
      else if (kw.searchVolumeNumeric >= 5000) avgSearchVolumeScore += 85;
      else if (kw.searchVolumeNumeric >= 1000) avgSearchVolumeScore += 70;
      else if (kw.searchVolumeNumeric >= 500) avgSearchVolumeScore += 50;
      else avgSearchVolumeScore += 30;
      volumeCount++;
    }
  }
  avgSearchVolumeScore = volumeCount > 0 ? avgSearchVolumeScore / volumeCount : 70;

  // Calculate average difficulty
  const avgDifficulty = allKeywords.reduce((sum, kw) =>
    sum + (kw.difficultyScore || estimateKeywordDifficulty(kw, 'secondary')), 0
  ) / allKeywords.length;

  // Article relevance (assume 90% - keywords came from article)
  const articleRelevance = 90;

  // Freshness bonus for news
  const freshnessBonus = 20;

  // Calculate overall confidence
  const overall = Math.round(
    (avgSearchVolumeScore * 0.3) +          // 30% - traffic potential
    ((100 - avgDifficulty) * 0.3) +         // 30% - winnability
    (domainAuthority * 0.25) +              // 25% - domain strength
    (articleRelevance * 0.1) +              // 10% - relevance
    (freshnessBonus * 0.05)                 // 5% - freshness
  );

  // Identify top 5 keywords by confidence
  const keywordsWithConfidence = [...primary, ...secondary, ...longtail].map(kw => {
    const { confidence, estimatedRank } = calculateKeywordConfidence(kw, domainAuthority, articleRelevance);
    return {
      term: kw.term,
      confidence,
      estimatedRank
    };
  });

  // Sort by confidence and take top 5
  const topKeywords = keywordsWithConfidence
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return {
    overall: Math.min(100, Math.max(0, overall)),
    factors: {
      searchVolume: Math.round(avgSearchVolumeScore),
      difficulty: Math.round(100 - avgDifficulty), // Invert: higher = easier
      articleRelevance: Math.round(articleRelevance),
      domainAuthority,
      freshnessBonus
    },
    topKeywords
  };
};

/**
 * Apply all keyword enhancements:
 * 1. Remove duplicates
 * 2. Add difficulty scores (if not from API)
 * 3. Add winnability
 */
export const enhanceKeywords = (
  keywords: Keyword[],
  category: 'primary' | 'secondary' | 'longtail'
): Keyword[] => {
  // Step 1: Remove duplicates
  const deduplicated = removeDuplicateKeywords(keywords, 0.8);

  // Step 2: Add difficulty if not present
  return deduplicated.map(keyword => {
    if (!keyword.difficultyScore) {
      const difficulty = estimateKeywordDifficulty(keyword, category);
      const winnability = getWinnability(difficulty);

      return {
        ...keyword,
        difficultyScore: difficulty,
        winnability,
        difficulty: winnability.toLowerCase() as 'easy' | 'medium' | 'hard'
      };
    }

    return keyword;
  });
};
