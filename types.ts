
export interface Keyword {
  term: string;
  rationale: string;
  searchIntent?: 'informational' | 'navigational' | 'transactional' | 'commercial';
  searchVolume?: 'high' | 'medium' | 'low' | string;  // Can be estimate or real number
  searchVolumeNumeric?: number;      // Real search volume from API (if available)
  difficulty?: 'easy' | 'medium' | 'hard';
  difficultyScore?: number;          // 0-100 (0=easiest, 100=impossible)
  winnability?: 'Easy' | 'Medium' | 'Hard' | 'Very Hard';
  // Bilingual support for Bangla keywords
  termBangla?: string;        // Bengali script version
  termEnglish?: string;       // English/transliteration version
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface RankingConfidence {
  overall: number;  // 0-100
  factors: {
    searchVolume: number;       // High volume = more traffic potential
    difficulty: number;         // Low difficulty = easier to rank
    articleRelevance: number;   // How well article covers keywords
    domainAuthority: number;    // Daily Star's authority
    freshnessBonus: number;     // News articles rank higher when fresh
  };
  topKeywords: Array<{
    term: string;
    confidence: number;  // Individual keyword confidence
    estimatedRank: string;  // "Top 3", "#1", "Top 10"
  }>;
}

export interface KeywordResult {
  primary: Keyword[];
  secondary: Keyword[];
  longtail: Keyword[];
  lsiKeywords?: Keyword[];
  entities?: Keyword[];
  questionKeywords?: Keyword[];
  competitorInsights: string;
  searchReferences: GroundingChunk[];
  contentType: string;
  seoScore?: number;
  metaTitle?: string;
  metaDescription?: string;
  serpFeatureTargets?: string[];
  localSeoSignals?: string[];
  rankingConfidence?: RankingConfidence;  // NEW: Ranking predictions
  dataSourceUsed?: 'gemini-estimate' | 'dataforseo-api' | 'google-data';  // Which data source
  // Bilingual/Bangla-specific fields
  detectedLanguage?: 'english' | 'bangla' | 'mixed';
  metaTitleBangla?: string;           // Bangla version of meta title
  metaDescriptionBangla?: string;     // Bangla version of meta description
  banglaSearchInsights?: string;      // Bangla-specific search behavior insights
  transliterationGuide?: string;      // How to transliterate key Bangla terms
}