
import { GoogleGenAI } from "@google/genai";
import type { KeywordResult, GroundingChunk, Keyword } from '../types';
import {
  enhanceKeywords,
  calculateRankingConfidence,
  removeDuplicateKeywords
} from './keywordUtils';
import {
  enhanceKeywordsWithRealData,
  getDataForSEOConfig
} from './dataForSeoService';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set. Please set GEMINI_API_KEY in your .env.local file.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Detects the language of the article content (English, Bangla, or Mixed)
 * Uses Unicode range detection for Bengali script
 */
const detectLanguage = (content: string): 'english' | 'bangla' | 'mixed' => {
  // Bengali Unicode range: U+0980 to U+09FF
  const banglaPattern = /[\u0980-\u09FF]/;
  const englishPattern = /[a-zA-Z]/;
  
  const hasBangla = banglaPattern.test(content);
  const hasEnglish = englishPattern.test(content);
  
  // Count percentage of Bangla characters
  const banglaChars = (content.match(/[\u0980-\u09FF]/g) || []).length;
  const totalChars = content.replace(/\s/g, '').length;
  const banglaPercentage = totalChars > 0 ? (banglaChars / totalChars) * 100 : 0;
  
  if (banglaPercentage > 60) {
    return 'bangla';
  } else if (hasBangla && hasEnglish && banglaPercentage > 20) {
    return 'mixed'; // Code-switching / Banglish
  } else {
    return 'english';
  }
};

/**
 * Validates that a parsed object matches the KeywordResult interface structure
 * with correct quantities for Google Rank #1 optimization (Senior SEO Specialist Level)
 */
const validateKeywordResult = (data: any): data is Omit<KeywordResult, 'searchReferences' | 'contentType'> => {
  if (!data || typeof data !== 'object') {
    console.error("Data is not an object");
    return false;
  }

  const validateKeywordArray = (arr: any, minCount: number, maxCount: number, arrayName: string, required: boolean = true): arr is Keyword[] => {
    if (!Array.isArray(arr)) {
      if (required) {
        console.error(`${arrayName} is not an array`);
        return false;
      }
      return true; // Optional field
    }
    
    if (arr.length < minCount || arr.length > maxCount) {
      console.error(`${arrayName} count is ${arr.length}, expected ${minCount}-${maxCount}`);
      return false;
    }
    
    const allValid = arr.every(item => 
      item && 
      typeof item === 'object' && 
      typeof item.term === 'string' && 
      item.term.trim().length > 0 &&
      typeof item.rationale === 'string' &&
      item.rationale.trim().length > 0
    );
    
    if (!allValid) {
      console.error(`${arrayName} contains invalid items`);
    }
    
    return allValid;
  };

  // Core required fields with CONSISTENT quantities for world-class SEO
  const coreValid = (
    validateKeywordArray(data.primary, 3, 5, 'Target Focus keywords (3-5 HIGH-VOLUME head terms)') &&
    validateKeywordArray(data.secondary, 5, 12, 'Supporting Topic keywords (5-12 medium-volume related terms)') &&
    validateKeywordArray(data.longtail, 8, 20, 'User Query Variations (8-20 long-tail questions)') &&
    typeof data.competitorInsights === 'string' &&
    data.competitorInsights.trim().length > 0
  );
  
  if (!coreValid) {
    return false;
  }
  
  // Optional advanced SEO fields (validate if present, but don't fail if missing)
  if (data.lsiKeywords && !validateKeywordArray(data.lsiKeywords, 5, 8, 'LSI keywords', false)) {
    console.warn("LSI keywords present but invalid - will be ignored");
  }
  
  if (data.questionKeywords && !validateKeywordArray(data.questionKeywords, 5, 8, 'Question keywords', false)) {
    console.warn("Question keywords present but invalid - will be ignored");
  }
  
  if (data.entities && !validateKeywordArray(data.entities, 1, 50, 'Entities', false)) {
    console.warn("Entities present but invalid - will be ignored");
  }
  
  return true;
};

const detectContentType = async (articleContent: string): Promise<string> => {
    try {
        const prompt = `
**Task:** Classify the following article text into ONE of the following categories. Your response must be ONLY the category name.

**Categories & Definitions:**
*   **News Article:** Reports on recent events, current affairs, politics, or general interest topics. Characterized by objective, factual reporting (e.g., reports on government policies, social events, crime).
*   **Business Article:** Focuses on topics related to finance, economy, specific industries, companies, or markets. Often includes financial data, market analysis, or corporate strategies (e.g., a company's quarterly earnings report, analysis of a market trend, profile of a CEO).
*   **Press Release:** An official statement issued to the media. Typically written in a formal, promotional tone from a specific organization's perspective (e.g., a new product launch announcement, a company partnership statement).
*   **General:** Use this category only if the text does not clearly fit into any of the above categories.

**Article Text to Analyze:**
---
${articleContent.substring(0, 2000)}
---

**Classification:**`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: prompt,
        });

        const contentType = response.text?.trim() || 'General';
        const validTypes = ['News Article', 'Business Article', 'Press Release', 'General'];
        if (validTypes.includes(contentType)) {
            return contentType;
        }
        return 'General'; // Default fallback
    } catch (error) {
        console.error("Error detecting content type:", error);
        return 'General'; // Default on error
    }
};

/**
 * Generates Bangla-specific SEO prompt with Bengali search optimization
 */
const generateBanglaPrompt = (articleContent: string, contentType: string, language: string): string => {
    const languageContext = language === 'bangla' 
      ? 'বাংলা (Bengali)' 
      : language === 'mixed' 
      ? 'Mixed Bangla-English (Banglish/Code-switching)'
      : 'English';

    let persona = `You are a Senior SEO Specialist at Google Bangladesh with 15+ years experience optimizing BANGLA content for Google Search.
    
    **Your Specialized Knowledge:**
    - Bengali/Bangla SEO and Unicode optimization
    - Bangla search behavior patterns (longer, more conversational queries)
    - Code-switching (Banglish) - how Bangladeshis mix Bangla-English
    - Bengali script rendering and font optimization
    - Bangla voice search (fastest growing in Bangladesh)
    - প্রথম আলো (Prothom Alo), কালের কণ্ঠ (Kalerkantho) competitor strategies
    - Bangla Featured Snippets (less competitive, huge opportunity)
    - Regional Bangla variations (Dhaka, Chittagong, Sylhet dialects)
    - Transliteration strategies for Bangla keywords`;

    let competitorContext = "প্রথম আলো (Prothom Alo), কালের কণ্ঠ (Kalerkantho), বাংলা ট্রিবিউন (Bangla Tribune), এনটিভি বাংলা (NTV Bangla)";
    let newsType = "বাংলা সংবাদ (Bangla news), গভীর প্রতিবেদন (in-depth reporting)";

    switch (contentType) {
        case 'Business Article':
            persona += "\n    You specialize in Bangla business journalism SEO and financial terminology in Bengali script.";
            competitorContext = "দ্য ফাইন্যান্সিয়াল এক্সপ্রেস বাংলা, বণিক বার্তা, ব্যবসায় বাংলা সংস্করণ";
            newsType = "ব্যবসায়িক বিশ্লেষণ (business analysis), বাজার প্রতিবেদন (market reports)";
            break;
        case 'Press Release':
            persona += "\n    You specialize in Bangla press release optimization and official announcement SEO in Bengali.";
            competitorContext = "সরকারি বিজ্ঞপ্তি (government announcements), কর্পোরেট প্রেস রিলিজ (corporate press releases)";
            newsType = "সরকারি ঘোষণা (official announcements), পণ্য লঞ্চ (product launches)";
            break;
    }

    return `
    **Persona:** ${persona}

    **Mission:** Analyze this ${newsType} article and extract the MOST RELEVANT BANGLA keywords to help it rank on Google Bangladesh.

    **DETECTED LANGUAGE:** ${languageContext}

    **Article to Optimize:**
    ---
    ${articleContent}
    ---

    **BANGLA KEYWORD EXTRACTION STRATEGY - ARTICLE-FIRST APPROACH**

    **Core Principle:** Extract keywords that are DIRECTLY RELEVANT to this specific article.

    **BILINGUAL REQUIREMENTS:**
    - All keywords must have BOTH Bengali script AND English transliteration
    - Example: {"term": "অর্থনীতি", "termBangla": "অর্থনীতি", "termEnglish": "orthoniti (economy)"}
    - Code-switching is natural: "বাংলাদেশ economy", "ঢাকা stock market"

    **BANGLA SEARCH BEHAVIOR:**
    - Bangla searches are 40% longer (more conversational)
    - Question words: "কীভাবে" (how), "কেন" (why), "কোথায়" (where), "কী" (what)
    - Numbers in both scripts: ২০২৪ and 2024
    - Voice search growing 200% annually
    - Featured Snippets 70% LESS competitive

    **CRITICAL RULE:** Every keyword must pass this test:
    ✅ Is it in the article or strongly implied?
    ✅ Would searching this term lead users to THIS article?
    ✅ Does it match the article's specific angle/story?

    **A. PRIMARY KEYWORDS (প্রাথমিক কীওয়ার্ড) - 2-5 keywords:**
        - **What:** Main topics, events, or entities this Bangla article is about
        - **Must:** Both Bangla script AND English transliteration
        - **Source:** Headline, first paragraph, central story

        **Examples:**
        - Article: "বাংলাদেশ ব্যাংক সুদের হার কমিয়েছে"
          ✅ {"term": "বাংলাদেশ ব্যাংক সুদের হার", "termBangla": "বাংলাদেশ ব্যাংক সুদের হার", "termEnglish": "Bangladesh Bank suder haar (interest rate)"}
          ✅ {"term": "সুদের হার কমানো ২০২৪", "termBangla": "সুদের হার কমানো ২০২৪", "termEnglish": "suder haar komano 2024 (rate cut 2024)"}

    **B. SECONDARY KEYWORDS (সহায়ক কীওয়ার্ড) - 5-12 keywords:**
        - **What:** Supporting topics and sub-themes in Bangla
        - **Must:** Both scripts (Bangla + English)
        - **Source:** Body paragraphs, related concepts

        **Examples:**
          ✅ {"term": "মুদ্রানীতি বাংলাদেশ", "termBangla": "মুদ্রানীতি বাংলাদেশ", "termEnglish": "mudraniti Bangladesh (monetary policy)"}
          ✅ {"term": "মূল্যস্ফীতি নিয়ন্ত্রণ", "termBangla": "মূল্যস্ফীতি নিয়ন্ত্রণ", "termEnglish": "mulyasphiti niyontron (inflation control)"}

    **C. LONG-TAIL KEYWORDS (লং-টেইল কীওয়ার্ড) - 8-20 phrases:**
        - **What:** Complete Bangla questions and specific phrases
        - **Must:** Both scripts (Bangla + English)
        - **Source:** Natural questions the article answers
        - **Note:** Bangla searches are 40% longer - embrace full conversational queries

        **Examples:**
          ✅ {"term": "কেন বাংলাদেশ ব্যাংক সুদের হার কমিয়েছে", "termBangla": "কেন বাংলাদেশ ব্যাংক সুদের হার কমিয়েছে", "termEnglish": "keno Bangladesh Bank suder haar komiyeche (why did Bangladesh Bank cut rates)"}
          ✅ {"term": "সুদের হার কমার ফলাফল কী", "termBangla": "সুদের হার কমার ফলাফল কী", "termEnglish": "suder haar komar pholaphal ki (what result of rate cut)"}
    
    **D. LSI KEYWORDS (বাংলা প্রসঙ্গ শব্দ) - 5-8 terms:**
        - Bangla synonyms and related terms from article
        - Both scripts required

    **E. QUESTION KEYWORDS (প্রশ্ন-ভিত্তিক কীওয়ার্ড) - 5-10 questions:**
        - Complete natural Bangla questions the article answers
        - Question words: "কেন", "কীভাবে", "কী", "কোথায়", "কখন"
        - Both scripts required
        - Voice search and Featured Snippet targets

    **F. NAMED ENTITIES (সত্ত্বা) - ALL entities (5-20+):**
        - ALL people, organizations, places, events, policies in Bangla
        - Both Bangla script + English transliteration MANDATORY
        - Proper Bengali spelling essential

    **BANGLA META TAGS & DELIVERABLES:**

    **1. Bilingual Meta Tags:**
       - Bangla Meta Title (50-60 chars): Primary keyword + hook + "| দ্য ডেইলি স্টার"
       - English Meta Title: Alternative version
       - Bangla Meta Description (150-160 chars)
       - English Meta Description: Alternative version

    **2. Bangla Search Insights:**
       - How this article fits Bangla search patterns
       - Code-switching observed
       - Voice search relevance

    **3. Transliteration Guide:**
       - Key Bangla terms with English pronunciation
       - Example: "অর্থনীতি = orthoniti (economy)"

    **4. SEO Score (0-100):** Same as English scoring

    **5. SERP Features:** Bangla Featured Snippets, PAA, Top Stories, Local Pack

    **6. Local SEO:** Bangladesh-specific geographic, entity, cultural elements

    **7. Competitor Gap:** Compare with ${competitorContext}

    **OUTPUT FORMAT - CRITICAL:**
    
    ⚠️ **MANDATORY JSON-ONLY OUTPUT** ⚠️
    
    - Respond with PURE JSON object ONLY
    - NO markdown code blocks (no \`\`\`json)
    - NO explanatory text before or after
    - NO commentary or notes
    - Start with { and end with }
    - Must be valid, parseable JSON
    - For Bangla keywords, provide BOTH scripts (Bangla + English)
    
    **If you include ANY text other than the JSON object, the system will fail.**
    
    **EXAMPLE JSON STRUCTURE (Bangla Bilingual):**
    

    {
      "primary": [
        {
          "term": "সোনার দাম",
          "termBangla": "সোনার দাম",
          "termEnglish": "sonar dam (gold price)",
          "rationale": "প্রধান শিরোনাম থেকে। উচ্চ অনুসন্ধান ভলিউম। (Main headline keyword. High search volume.)",
          "searchIntent": "informational",
          "searchVolume": "high"
        }
      ],
      "secondary": [...],
      "longtail": [...],
      "lsiKeywords": [...],
      "entities": [...],
      "questionKeywords": [...],
      "competitorInsights": "প্রথম আলো এবং কালের কণ্ঠের তুলনায়... (Compared to Prothom Alo and Kalerkantho...)",
      "metaTitle": "Gold Price Surge in Bangladesh: Market Analysis | The Daily Star",
      "metaDescription": "Gold prices in Bangladesh rise 15%...",
      "metaTitleBangla": "বাংলাদেশে সোনার দাম বৃদ্ধি: বাজার বিশ্লেষণ | দ্য ডেইলি স্টার",
      "metaDescriptionBangla": "বাংলাদেশে সোনার দাম ১৫% বৃদ্ধি পেয়েছে...",
      "seoScore": 85,
      "serpFeatureTargets": [
        "Bangla Featured Snippet (বাংলা ফিচার্ড স্নিপেট)",
        "Bangla PAA boxes",
        "Top Stories (বাংলা সংবাদ)",
        "Local Pack (Bangladesh)"
      ],
      "localSeoSignals": [
        "Geographic: ঢাকা (Dhaka), বাংলাদেশ (Bangladesh)",
        "Local entity: বাংলাদেশ ব্যাংক (Bangladesh Bank)",
        "Currency: টাকা (Taka)",
        "Cultural: বাংলা ভাষা (Bangla language) optimization"
      ],
      "detectedLanguage": "bangla",
      "banglaSearchInsights": "বাংলায় অনুসন্ধানকারীরা ইংরেজির চেয়ে ৪০% দীর্ঘ প্রশ্ন করেন... (Bangla searchers use 40% longer queries than English...)",
      "transliterationGuide": "সোনা = sona (gold), দাম = dam (price), অর্থনীতি = orthoniti (economy)"
    }
    
    **REMEMBER: Output ONLY the JSON object above. No markdown, no wrapper, no extra text.**

    **FINAL REMINDER:**
    - Every keyword must be grounded in THIS article's content
    - ALL keywords need BOTH Bangla script + English transliteration
    - Balance article-relevance with search-worthiness
    - Make this SPECIFIC Bangla article rank
    - Embrace longer Bangla queries (40% longer than English is natural)
    `;
};

const generatePrompt = (articleContent: string, contentType: string): string => {
    let persona = `You are a Senior SEO Specialist helping The Daily Star Bangladesh reporters optimize their finished articles for search engines.

    **Your Expertise:**
    - Google's semantic search (BERT, MUM, RankBrain)
    - Entity-based SEO and Knowledge Graph
    - News SEO and Google News optimization
    - Bangladesh search behavior and local SEO
    - SERP features: Featured Snippets, People Also Ask, News carousel
    - E-E-A-T signals for news credibility`;

    let competitorContext = "Prothom Alo, Bangladesh Pratidin, bdnews24.com, BBC Bangla";
    let newsType = "news article";

    switch (contentType) {
        case 'Business Article':
            persona += "\n    You specialize in financial journalism SEO and business news optimization.";
            competitorContext = "The Business Standard, Dhaka Tribune Business, Financial Express BD";
            newsType = "business article";
            break;
        case 'Press Release':
            persona += "\n    You specialize in press release optimization and announcement visibility.";
            competitorContext = "corporate announcements and official press releases";
            newsType = "press release";
            break;
    }

  return `
    **Persona:** ${persona}

    **Mission:** Analyze this ${newsType} and extract the MOST RELEVANT keywords to help it rank on Google Bangladesh.

    **Article to Optimize:**
    ---
    ${articleContent}
    ---

    **KEYWORD EXTRACTION STRATEGY - ARTICLE-FIRST APPROACH**

    **Core Principle:** Extract keywords that are DIRECTLY RELEVANT to this specific article.

    Your keywords must be:
    1. **Article-grounded** - Mentioned or strongly implied in the content
    2. **Search-worthy** - Terms users actually search for
    3. **Intent-matched** - Aligned with how people search for this story

    **CRITICAL RULE:** Every keyword must pass this test:
    ✅ Is it in the article or strongly implied?
    ✅ Would searching this term lead users to THIS article?
    ✅ Does it match the article's specific angle/story?

    **A. PRIMARY KEYWORDS (2-5 keywords):**
        - **What:** Main topics, events, or entities this article is about
        - **Must:** Appear in headline, first paragraph, or be the central story
        - **Balance:** Specific to article + broad enough for search demand

        **Extraction Method:**
        1. Read the headline - what's the main story?
        2. Identify the core event/topic/entity
        3. Extract 2-5 keyword phrases that capture this

        **Examples:**
        - Article: "Bangladesh Bank cuts interest rates by 25 basis points"
          ✅ "Bangladesh Bank interest rate cut"
          ✅ "interest rate cut Bangladesh 2024"
          ✅ "25 basis point rate reduction"

        - Article: "Dhaka traffic congestion worsens during monsoon"
          ✅ "Dhaka traffic congestion"
          ✅ "Dhaka monsoon traffic"
          ✅ "Bangladesh traffic problems"

        **Search Potential Assessment:**
        - HIGH: Timely news events, commercial topics, broad regional issues
        - MEDIUM: Niche topics with local interest
        - LOW: Very specific article angles

        **Rationale Template:**
        "Main topic from headline. [Why it's search-worthy: timely/commercial/regional impact]"

    **B. SECONDARY KEYWORDS (5-12 keywords):**
        - **What:** Supporting topics, sub-themes, and related concepts from the article
        - **Source:** Body paragraphs, quoted experts, data points, contextual information
        - **Purpose:** Capture the article's depth and related angles

        **Extraction Method:**
        1. Identify sub-topics discussed in the article
        2. Extract related entities and concepts mentioned
        3. Include specific aspects that make this story unique
        4. Create keyword variations of main themes

        **Examples:**
        - Article: "Bangladesh Bank cuts rates amid inflation concerns"
          ✅ "Bangladesh monetary policy 2024"
          ✅ "inflation rate Bangladesh"
          ✅ "Bangladesh Bank policy rate"
          ✅ "economic growth Bangladesh"
          ✅ "central bank rate decision"

        **Search Potential:**
        - HIGH: Related trending topics, popular sub-themes
        - MEDIUM: Niche aspects with regional interest
        - LOW: Very technical or specific details

        **Rationale Template:**
        "Sub-topic from article. [Connection to main story + search relevance]"

    **C. LONG-TAIL KEYWORDS (8-20 phrases):**
        - **What:** Specific phrases, complete questions, and detailed concepts from the article
        - **Source:** Natural language in article, questions answered, unique data/insights
        - **Purpose:** Capture voice search, featured snippets, and specific user queries

        **Extraction Method:**
        1. What questions does this article answer?
        2. What specific details or statistics are mentioned?
        3. What natural phrases would users search to find this?
        4. Include location-specific and time-sensitive variations

        **Examples:**
        - Article: "Bangladesh Bank cuts interest rates by 25 basis points to boost economy"
          ✅ "why did Bangladesh Bank cut interest rates"
          ✅ "how much did Bangladesh Bank cut rates"
          ✅ "Bangladesh interest rate cut effect on economy"
          ✅ "when did Bangladesh Bank reduce policy rate 2024"
          ✅ "will interest rate cut reduce inflation Bangladesh"

        **Search Potential:**
        - HIGH: Common questions about newsworthy events
        - MEDIUM: Specific details people search for
        - LOW: Very niche or technical phrasing

        **Rationale Template:**
        "Question/phrase from article. [Why users would search this: information need/decision-making]"

        **Featured Snippet Targets:**
        - Questions starting with: Why, How, What, When, Where, Who
        - Comparison phrases: "X vs Y", "difference between X and Y"
        - Process queries: "how to", "steps to", "ways to"

    **D. LSI KEYWORDS (5-8 semantic context terms):**
        - **What:** Related terms that prove topic expertise to Google
        - **Source:** Synonyms, industry terms, and contextual concepts from article
        - **Purpose:** Show comprehensive coverage and topical authority

        **Examples:**
        - Article: "Gold price surge in Bangladesh"
          ✅ "bullion market"
          ✅ "precious metals trading"
          ✅ "commodity prices"
          ✅ "import duties"

    **E. QUESTION KEYWORDS (5-10 complete questions):**
        - **What:** Natural questions the article answers
        - **Source:** Questions directly answered or implied in content
        - **Purpose:** Featured Snippets, People Also Ask, voice search

        **Examples:**
        - Article: "Bangladesh Bank cuts rates"
          ✅ "why did Bangladesh Bank cut interest rates?"
          ✅ "how will rate cut affect inflation?"
          ✅ "what is Bangladesh's current policy rate?"
          ✅ "when did Bangladesh Bank announce rate cut?"

        **Must be:** Directly answerable by this article's content

    **F. NAMED ENTITIES (ALL entities - typically 5-20+):**
        - **What:** ALL people, organizations, places, events, policies mentioned
        - **Format:** "Entity Name (Type/Role)"
        - **Purpose:** Knowledge Graph, E-E-A-T, authority signals

        **Extract:**
        - People: "Dr. Ahsan H. Mansur (Bangladesh Bank Governor)"
        - Organizations: "Bangladesh Bank (Central Bank)"
        - Places: "Dhaka (Capital City)"
        - Events: "Monetary Policy Announcement 2024"
        - Policies: "Gold Policy 2018 (Regulation)"

    **META TAGS & DELIVERABLES:**

    **1. Meta Title (50-60 characters):**
        - Front-load primary keyword
        - Include key number/stat if present
        - End with "| The Daily Star"
        - Example: "Bangladesh Bank Cuts Rates by 25 Basis Points | The Daily Star"

    **2. Meta Description (150-160 characters):**
        - Primary keyword + article hook
        - Key statistic or finding
        - Freshness signal (2024, today, etc.)
        - Example: "Bangladesh Bank cuts interest rates by 25 basis points to boost economic growth. Experts analyze inflation impact and lending rate changes."

    **3. SEO Score (0-100):**
        Evaluate based on:
        - Keyword placement: 20pts
        - Entity coverage: 20pts
        - Content depth: 20pts
        - Local SEO: 15pts
        - SERP features: 15pts
        - News compliance: 10pts

    **4. SERP Feature Targets:**
        List which features this article can target:
        - Featured Snippet (paragraph/list/table)
        - People Also Ask
        - Top Stories / News carousel
        - Local Pack (Bangladesh)
        - Knowledge Graph entities

    **5. Local SEO Signals:**
        Bangladesh-specific elements:
        - Geographic: Cities, regions mentioned
        - Entities: Local organizations, government bodies
        - Cultural: Bangla terms, local context
        - Competitors: Comparison to ${competitorContext}

    ✅ Every keyword is from or strongly implied by the article
    ✅ Keywords match how users actually search for this story
    ✅ No generic keywords unrelated to article specifics
    ✅ Rationales explain article connection + search relevance
    ✅ Questions are directly answerable by the article
    ✅ All entities mentioned in article are extracted

    **OUTPUT FORMAT - CRITICAL:** 
    
    ⚠️ **MANDATORY JSON-ONLY OUTPUT** ⚠️
    
    - Respond with PURE JSON object ONLY
    - NO markdown code blocks (no \`\`\`json)
    - NO explanatory text before or after
    - NO commentary or notes
    - Start with { and end with }
    - Must be valid, parseable JSON
    
    **If you include ANY text other than the JSON object, the system will fail.**

    **EXAMPLE JSON STRUCTURE (Modern Intent-Driven SEO):**
    
    {
      "primary": [
        { 
          "term": "gold prices in Bangladesh", 
          "rationale": "Core topic from headline. Primary informational intent. High search volume.",
          "searchIntent": "informational",
          "searchVolume": "high",
          "difficulty": "hard"
        },
        { 
          "term": "why Bangladesh gold prices increased 2024", 
          "rationale": "Specific intent variation. Answers main article question. Complete user query.",
          "searchIntent": "informational",
          "searchVolume": "medium",
          "difficulty": "medium"
        }
        // 2-5 total - each represents distinct primary intent (NO word count limits)
      ],
      "secondary": [
        { 
          "term": "global gold market trends", 
          "rationale": "Major sub-topic covered. Supporting context for main topic. Industry theme.",
          "searchIntent": "informational",
          "searchVolume": "medium",
          "difficulty": "medium"
        },
        { 
          "term": "taka devaluation impact on commodity prices", 
          "rationale": "Key concept explaining price changes. Economic factor analyzed.",
          "searchIntent": "informational",
          "searchVolume": "medium",
          "difficulty": "medium"
        }
        // 5-12 total - THEMES/SUB-TOPICS, not just entities (NO word count limits)
      ],
      "longtail": [
        { 
          "term": "domestic prices remain closely aligned with global trends", 
          "rationale": "Verbatim phrase from article. Natural language. Featured Snippet potential.",
          "searchIntent": "informational",
          "searchVolume": "low",
          "difficulty": "easy"
        },
        { 
          "term": "annual domestic demand in Bangladesh stands between 20 tonnes and 40 tonnes", 
          "rationale": "Complete statistic with context. Specific user query match. Data-driven search.",
          "searchIntent": "informational",
          "searchVolume": "low",
          "difficulty": "easy"
        }
        // 8-20 total - ACTUAL user queries/phrases (NO word count limits - can be 3-20+ words)
      ],
      "lsiKeywords": [
        { "term": "bullion market", "rationale": "Related term Google associates with gold prices. Semantic signal." },
        { "term": "precious metals trading", "rationale": "Industry context. Co-occurring concept in authoritative content." }
        // 5-8 semantic context terms
      ],
      "entities": [
        { "term": "Bangladesh Bank (Central Bank)", "rationale": "Knowledge Graph entity. E-E-A-T signal. Monetary authority." },
        { "term": "Abdur Rouf Talukder (BAJUS Chairman)", "rationale": "Quoted expert. Authority signal. Industry leader." },
        { "term": "Gold Policy 2018 (Regulation)", "rationale": "Referenced policy. Official regulation. Topical authority." }
        // ALL entities (5-20+) - comprehensive extraction
      ],
      "questionKeywords": [
        { "term": "why are gold prices rising in Bangladesh in 2024?", "rationale": "Main article question. PAA target. Voice search optimized." },
        { "term": "how does smuggling affect the Bangladesh gold market?", "rationale": "Sub-topic question. Featured Snippet opportunity. Answerable by content." }
        // 5-10 questions - complete, natural (NO word count limits)
      ],
      "competitorInsights": "Detailed comparison with ${competitorContext}. Unique angles: [X, Y]. Missing keywords: [A, B]. Competitive advantages: [P, Q].",
      "metaTitle": "Primary Keyword: Compelling Hook | The Daily Star (50-60 chars)",
      "metaDescription": "Primary keyword + key statistic + CTA + year/freshness signal. Optimized for CTR. (150-160 chars)",
      "seoScore": 85,
      "serpFeatureTargets": [
        "Featured Snippet (Paragraph type)",
        "People Also Ask (5 questions identified)",
        "Top Stories carousel",
        "Local Pack (Bangladesh-specific)"
      ],
      "localSeoSignals": [
        "Geographic keyword: Dhaka",
        "Local entity: Bangladesh Bank",
        "Cultural context: Taka currency",
        "Local competitor: Prothom Alo coverage gap"
      ]
    }
    
    **REMEMBER: Output ONLY the JSON object above. No markdown, no wrapper, no extra text.**

    **FINAL REMINDER:**
    - Every keyword must be grounded in THIS article's content
    - Balance article-relevance with search-worthiness
    - Make this SPECIFIC article rank, not just any article on the topic
    - Quality over quantity - each keyword should earn its place
  `;
};

export const generateKeywords = async (
  articleContent: string,
  useDeepAnalysis: boolean
): Promise<KeywordResult> => {
  try {
    // Detect language first
    const detectedLanguage = detectLanguage(articleContent);
    console.log("Detected language:", detectedLanguage);
    
    const contentType = await detectContentType(articleContent);
    
    // Use Bangla-specific prompt for Bangla/Mixed content
    const prompt = (detectedLanguage === 'bangla' || detectedLanguage === 'mixed')
      ? generateBanglaPrompt(articleContent, contentType, detectedLanguage)
      : generatePrompt(articleContent, contentType);
    
    let response;
    
    console.log("Starting keyword generation...", { useDeepAnalysis, contentType });
    
    if (useDeepAnalysis) {
      // Deep Analysis Mode with Gemini 2.5 Pro (Most powerful, best for deep thinking)
      console.log("Using Gemini 2.5 Pro (Deep Analysis - Best Quality)");
      response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-thinking-exp-01-21',
        contents: prompt,
        config: {
          temperature: 0.2, // Even lower for maximum consistency
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 8192, // Allow longer, more comprehensive responses
          responseMimeType: 'application/json', // Force JSON output
        },
      });
    } else {
      // Fast Mode with Gemini 2.0 Flash (Quick, efficient)
      console.log("Using Gemini 2.0 Flash (Fast Mode)");
      response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
        config: {
          temperature: 0.2, // Lower for more consistent JSON
          topP: 0.85,
          topK: 40,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json', // Force JSON output
        },
      });
    }

    console.log("Response received:", response);

    // Extract text from response - try multiple methods
    let text = '';
    
    if (response.text) {
      text = response.text.trim();
    } else if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        text = candidate.content.parts.map((part: any) => part.text).join('').trim();
      }
    }
    
    console.log("Extracted text:", text.substring(0, 200));
    
    if (!text) {
      console.error("Empty response from AI. Full response:", JSON.stringify(response, null, 2));
      throw new Error("Received empty response from AI. This may indicate an API quota issue or invalid API key. Please check your Gemini API key and quota.");
    }
    
    // Robust JSON extraction with multiple fallback strategies
    let jsonText = text.trim();
    
    // Strategy 1: Already pure JSON
    if (!jsonText.startsWith('{')) {
      console.log("JSON not at start, trying extraction strategies...");
      
      // Strategy 2: Extract from markdown code blocks (```json ... ```)
      const jsonBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch && jsonBlockMatch[1]) {
        console.log("Found JSON in code block");
        jsonText = jsonBlockMatch[1].trim();
        } else {
        // Strategy 3: Find JSON object anywhere in text
        const objectMatch = jsonText.match(/\{[\s\S]*\}/);
           if (objectMatch) {
          console.log("Found JSON object in text");
          jsonText = objectMatch[0];
           } else {
          // Strategy 4: Try to find after common prefixes
          const afterPrefixMatch = jsonText.match(/(?:Here's|Here is|Output:|Result:)?\s*(\{[\s\S]*\})/i);
          if (afterPrefixMatch && afterPrefixMatch[1]) {
            console.log("Found JSON after prefix");
            jsonText = afterPrefixMatch[1];
          } else {
            console.error("No JSON found. Raw response:", text.substring(0, 500));
            throw new SyntaxError(
              "The AI did not return valid JSON. This is a format error. " +
              "Please try again. If the issue persists, try Deep Analysis mode. " +
              `Response preview: ${text.substring(0, 200)}...`
            );
          }
        }
      }
    }
    
    // Clean up the JSON text
    jsonText = jsonText.trim();
    
    // Remove any trailing text after the JSON object
    const lastBrace = jsonText.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < jsonText.length - 1) {
      jsonText = jsonText.substring(0, lastBrace + 1);
    }
    
    // Parse JSON with detailed error reporting
    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonText);
      console.log("Successfully parsed JSON");
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Attempted to parse:", jsonText.substring(0, 500));
      
      // Try to provide helpful error message
      const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
      throw new SyntaxError(
        `Failed to parse AI response as JSON. ${errorMsg}. ` +
        `This usually means the AI didn't follow the JSON format correctly. ` +
        `Please try again or use Deep Analysis mode for better results.`
      );
    }
    
    // Validate the structure
    if (!validateKeywordResult(parsedResult)) {
      const counts = {
        primary: parsedResult.primary?.length || 0,
        secondary: parsedResult.secondary?.length || 0,
        longtail: parsedResult.longtail?.length || 0
      };
      
      throw new Error(
        `AI response has invalid keyword counts. ` +
        `Expected: Target Focus (3-5), Supporting Topics (5-12), User Query Variations (8-20). ` +
        `Received: Target Focus (${counts.primary}), Supporting Topics (${counts.secondary}), User Queries (${counts.longtail}). ` +
        `This usually indicates the AI didn't extract enough keywords from the article. ` +
        `Please try again or use Deep Analysis mode for better results.`
      );
    }

    // Extract grounding chunks safely
    const groundingChunks: GroundingChunk[] =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    console.log("🔧 Applying keyword enhancements (deduplication, difficulty scoring)...");

    // STEP 1: Remove duplicate/similar keywords within each category
    let primary = removeDuplicateKeywords(parsedResult.primary || [], 0.8);
    let secondary = removeDuplicateKeywords(parsedResult.secondary || [], 0.8);
    let longtail = removeDuplicateKeywords(parsedResult.longtail || [], 0.8);

    // STEP 2: Try to get REAL search volume and difficulty from DataForSEO API (optional)
    let dataSource: 'gemini-estimate' | 'dataforseo-api' = 'gemini-estimate';
    const dataForSEOConfig = getDataForSEOConfig();

    if (dataForSEOConfig.enabled) {
      console.log("📊 DataForSEO API enabled - fetching real metrics...");

      // Enhance all keywords with real data
      const allKeywords = [...primary, ...secondary, ...longtail];
      const enhanced = await enhanceKeywordsWithRealData(allKeywords, 2050); // Bangladesh

      if (enhanced.dataSource === 'dataforseo-api') {
        console.log("✅ Real search volume data retrieved from DataForSEO");
        dataSource = 'dataforseo-api';

        // Split back into categories
        primary = enhanced.keywords.slice(0, primary.length);
        secondary = enhanced.keywords.slice(primary.length, primary.length + secondary.length);
        longtail = enhanced.keywords.slice(primary.length + secondary.length);
      }
    } else {
      console.log("ℹ️  DataForSEO API not configured - using Gemini estimates + calculated difficulty");
    }

    // STEP 3: Enhance keywords with estimated difficulty (if not from DataForSEO)
    primary = enhanceKeywords(primary, 'primary');
    secondary = enhanceKeywords(secondary, 'secondary');
    longtail = enhanceKeywords(longtail, 'longtail');

    // STEP 4: Calculate ranking confidence
    const rankingConfidence = calculateRankingConfidence(primary, secondary, longtail, 80); // Daily Star DA = 80

    console.log(`✅ Keyword enhancement complete! Overall ranking confidence: ${rankingConfidence.overall}%`);
    console.log(`🎯 Top keyword: "${rankingConfidence.topKeywords[0]?.term}" (${rankingConfidence.topKeywords[0]?.estimatedRank})`);

    return {
      ...parsedResult,
      primary,
      secondary,
      longtail,
      searchReferences: groundingChunks,
      contentType,
      detectedLanguage,
      rankingConfidence,
      dataSourceUsed: dataSource
    };

  } catch (error) {
    console.error("Error generating keywords:", error);
    
    if (error instanceof SyntaxError) {
       throw new Error("Failed to parse the AI's response. The format was invalid. Please try again.");
    }
    
    if (error instanceof Error) {
      // Re-throw with original message if it's already a descriptive error
      if (error.message.includes('API_KEY') || 
          error.message.includes('response') || 
          error.message.includes('structure')) {
        throw error;
      }
    }
    
    throw new Error("An error occurred while generating keywords. Please check your connection and API key, then try again.");
  }
};

// Export helper functions for reuse in other AI services (e.g., OpenAI)
export { detectLanguage, detectContentType, generatePrompt, generateBanglaPrompt, validateKeywordResult };