/**
 * DataForSEO API Service - OPTIONAL
 *
 * Provides REAL search volume data and keyword difficulty scores
 * If API key not provided, app falls back to Gemini estimates
 *
 * API Cost: ~$0.0001 per keyword (very cheap)
 * Pricing: https://dataforseo.com/pricing
 * Get API Key: https://app.dataforseo.com/
 */

import type { Keyword } from '../types';

interface DataForSEOConfig {
  login?: string;      // API username
  password?: string;   // API password
  enabled: boolean;    // Whether to use API
}

interface DataForSEOKeywordData {
  keyword: string;
  location_code: number;
  language_code: string;
  search_partners: boolean;
  competition: number;        // 0-1 (converted to 0-100)
  competition_level: string;  // low/medium/high
  cpc: number;
  monthly_searches: Array<{
    year: number;
    month: number;
    search_volume: number;
  }>;
  keyword_info?: {
    monthly_searches: number;
  };
}

/**
 * Get DataForSEO configuration from localStorage
 * App works without this - it's OPTIONAL
 */
export const getDataForSEOConfig = (): DataForSEOConfig => {
  try {
    const login = localStorage.getItem('dataforseo_login');
    const password = localStorage.getItem('dataforseo_password');

    return {
      login: login || undefined,
      password: password || undefined,
      enabled: !!(login && password)
    };
  } catch (error) {
    console.warn('DataForSEO config not available:', error);
    return { enabled: false };
  }
};

/**
 * Save DataForSEO API credentials (optional)
 */
export const saveDataForSEOConfig = (login: string, password: string): void => {
  try {
    localStorage.setItem('dataforseo_login', login);
    localStorage.setItem('dataforseo_password', password);
    console.log('✅ DataForSEO API credentials saved');
  } catch (error) {
    console.error('Failed to save DataForSEO credentials:', error);
  }
};

/**
 * Clear DataForSEO API credentials
 */
export const clearDataForSEOConfig = (): void => {
  try {
    localStorage.removeItem('dataforseo_login');
    localStorage.removeItem('dataforseo_password');
    console.log('DataForSEO API credentials cleared');
  } catch (error) {
    console.error('Failed to clear DataForSEO credentials:', error);
  }
};

/**
 * Get real search volume and difficulty from DataForSEO API
 *
 * @param keywords - Array of keyword strings
 * @param location - Country code (2050 = Bangladesh, 2840 = USA)
 * @returns Enhanced keywords with real data or null if API unavailable
 */
export const getKeywordMetrics = async (
  keywords: string[],
  location: number = 2050  // Bangladesh by default
): Promise<Map<string, { searchVolume: number; difficulty: number; winnability: string }> | null> => {
  const config = getDataForSEOConfig();

  if (!config.enabled) {
    console.log('ℹ️  DataForSEO API not configured - using Gemini estimates');
    return null;
  }

  try {
    console.log(`🔍 Fetching real metrics for ${keywords.length} keywords from DataForSEO...`);

    const auth = btoa(`${config.login}:${config.password}`);

    // DataForSEO Keywords Data API
    const response = await fetch('https://api.dataforseo.com/v3/keywords_data/google/search_volume/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        keywords: keywords.slice(0, 100), // Limit to 100 keywords per request
        location_code: location,
        language_code: 'en',  // or 'bn' for Bangla
        search_partners: false,
        sort_by: 'search_volume'
      }])
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`DataForSEO API error (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();

    if (data.status_code !== 20000) {
      console.warn('DataForSEO API returned error:', data.status_message);
      return null;
    }

    const results = new Map<string, { searchVolume: number; difficulty: number; winnability: string }>();

    // Process results
    const items: DataForSEOKeywordData[] = data.tasks[0]?.result[0]?.items || [];

    for (const item of items) {
      // Get average monthly search volume
      let searchVolume = 0;
      if (item.keyword_info?.monthly_searches) {
        searchVolume = item.keyword_info.monthly_searches;
      } else if (item.monthly_searches && item.monthly_searches.length > 0) {
        // Average last 12 months
        const recentMonths = item.monthly_searches.slice(-12);
        searchVolume = Math.round(
          recentMonths.reduce((sum, m) => sum + m.search_volume, 0) / recentMonths.length
        );
      }

      // Convert competition (0-1) to difficulty (0-100)
      // Lower competition = easier to rank
      const competitionScore = item.competition || 0;
      const difficulty = Math.round(competitionScore * 100);

      // Determine winnability
      let winnability: string;
      if (difficulty <= 30) {
        winnability = 'Easy';
      } else if (difficulty <= 60) {
        winnability = 'Medium';
      } else if (difficulty <= 85) {
        winnability = 'Hard';
      } else {
        winnability = 'Very Hard';
      }

      results.set(item.keyword.toLowerCase(), {
        searchVolume,
        difficulty,
        winnability
      });
    }

    console.log(`✅ Retrieved real metrics for ${results.size} keywords from DataForSEO`);
    return results;

  } catch (error) {
    console.warn('DataForSEO API request failed:', error);
    console.log('ℹ️  Falling back to Gemini estimates');
    return null;
  }
};

/**
 * Enhance keywords with real search volume and difficulty data
 * If DataForSEO API is not available, returns keywords unchanged
 */
export const enhanceKeywordsWithRealData = async (
  keywords: Keyword[],
  location: number = 2050
): Promise<{ keywords: Keyword[]; dataSource: 'gemini-estimate' | 'dataforseo-api' }> => {
  // Extract keyword terms
  const terms = keywords.map(k => k.term);

  // Try to get real metrics
  const metricsMap = await getKeywordMetrics(terms, location);

  if (!metricsMap) {
    // DataForSEO not available - return original keywords
    return {
      keywords,
      dataSource: 'gemini-estimate'
    };
  }

  // Enhance keywords with real data
  const enhancedKeywords = keywords.map(keyword => {
    const metrics = metricsMap.get(keyword.term.toLowerCase());

    if (metrics) {
      return {
        ...keyword,
        searchVolumeNumeric: metrics.searchVolume,
        difficultyScore: metrics.difficulty,
        winnability: metrics.winnability as 'Easy' | 'Medium' | 'Hard' | 'Very Hard',
        searchVolume: formatSearchVolume(metrics.searchVolume),
        difficulty: metrics.winnability.toLowerCase() as 'easy' | 'medium' | 'hard'
      };
    }

    return keyword;
  });

  return {
    keywords: enhancedKeywords,
    dataSource: 'dataforseo-api'
  };
};

/**
 * Format search volume number as readable string
 */
const formatSearchVolume = (volume: number): string => {
  if (volume >= 100000) return `${Math.round(volume / 1000)}K+`;
  if (volume >= 10000) return `${Math.round(volume / 1000)}K`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
  return volume.toString();
};

/**
 * Test DataForSEO API connection
 */
export const testDataForSEOConnection = async (): Promise<boolean> => {
  const config = getDataForSEOConfig();

  if (!config.enabled) {
    return false;
  }

  try {
    const auth = btoa(`${config.login}:${config.password}`);

    const response = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ DataForSEO API connected successfully');
      console.log(`💰 Account balance: $${data.tasks[0]?.result[0]?.money?.balance || 'unknown'}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('DataForSEO connection test failed:', error);
    return false;
  }
};
