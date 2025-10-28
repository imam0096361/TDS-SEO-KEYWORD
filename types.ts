
export interface Keyword {
  term: string;
  rationale: string;
  searchIntent?: 'informational' | 'navigational' | 'transactional' | 'commercial';
  searchVolume?: 'high' | 'medium' | 'low';
  difficulty?: 'easy' | 'medium' | 'hard';
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
  // Bilingual/Bangla-specific fields
  detectedLanguage?: 'english' | 'bangla' | 'mixed';
  metaTitleBangla?: string;           // Bangla version of meta title
  metaDescriptionBangla?: string;     // Bangla version of meta description
  banglaSearchInsights?: string;      // Bangla-specific search behavior insights
  transliterationGuide?: string;      // How to transliterate key Bangla terms
}