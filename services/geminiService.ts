
import { GoogleGenAI } from "@google/genai";
import type { KeywordResult, GroundingChunk, Keyword } from '../types';

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

  // Core required fields
  const coreValid = (
    validateKeywordArray(data.primary, 3, 5, 'Primary keywords') &&
    validateKeywordArray(data.secondary, 8, 12, 'Secondary keywords') &&
    validateKeywordArray(data.longtail, 10, 15, 'Long-tail keywords') &&
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
    
    **Mission:** Analyze this ${newsType} article for দ্য ডেইলি স্টার বাংলা (The Daily Star Bangla) and generate a BILINGUAL SEO strategy optimized for Google Bangladesh.

    **DETECTED LANGUAGE:** ${languageContext}

    **Article to Analyze:**
    ---
    ${articleContent}
    ---

    **!! BANGLA SEO CRITICAL REQUIREMENTS !!**
    
    **Phase 1: BILINGUAL KEYWORD STRATEGY**
    
    1. **For BANGLA Content (বাংলা কন্টেন্ট):**
       - Extract keywords in BOTH Bengali script AND English transliteration
       - Example: {"term": "অর্থনীতি", "termBangla": "অর্থনীতি", "termEnglish": "orthoniti (economy)"}
       - Bangla searches are 40% longer than English (more conversational)
       - Bangla voice search queries are growing 200% annually
       - Code-switching is natural: "বাংলাদেশ economy", "ঢাকা stock market"
    
    2. **Bangla Search Behavior Understanding:**
       - Bangladeshis search in: Pure Bangla (60%), Banglish/Code-mix (30%), Pure English (10%)
       - Question format is different: "কীভাবে" (how), "কেন" (why), "কোথায়" (where), "কী" (what)
       - Numbers often in both scripts: ২০২৪ and 2024
       - Dates in Bangla: "২০২৪ সালের জানুয়ারি" or "January 2024"
    
    3. **Bangla Competitor Intelligence:**
       - ${competitorContext} use different keyword strategies
       - প্রথম আলো dominates general news (you need niche angles)
       - Bangla Featured Snippets are 70% LESS competitive than English
       - Local Bangla content beats international in Google.com.bd
    
    **Phase 2: BANGLA KEYWORD EXTRACTION (Same quantities as English)**

    **A. PRIMARY KEYWORDS (প্রধান কীওয়ার্ড):**
        - Quantity: EXACTLY 3-5
        - Provide BOTH: Bangla script + English transliteration
        - Example: "সোনার দাম" (sonar dam - gold price), "বাংলাদেশ অর্থনীতি" (Bangladesh orthoniti)
        - Word count: 1-3 words in Bangla
    
    **B. SECONDARY KEYWORDS (গৌণ কীওয়ার্ড):**
        - Quantity: EXACTLY 8-12
        - ALL entities in Bangla: "বাংলাদেশ ব্যাংক" (Bangladesh Bank), "ঢাকা স্টক এক্সচেঞ্জ"
        - Organizations: Full Bangla names with English in parentheses
        - People: Bengali names properly spelled
        - Places: "ঢাকা" (Dhaka), "চট্টগ্রাম" (Chittagong)
    
    **C. LONG-TAIL KEYWORDS (দীর্ঘ-লেজ কীওয়ার্ড):**
        - Quantity: EXACTLY 10-15
        - Complete Bangla phrases (4-10 words - Bangla queries are longer!)
        - Natural conversational Bangla
        - Include question formats: "কেন সোনার দাম বাড়ছে বাংলাদেশে"
        - Statistics in both scripts: "২০ থেকে ৪০ টন" (20 to 40 tons)
    
    **D. LSI KEYWORDS (বাংলা প্রসঙ্গ শব্দ):**
        - Quantity: 5-8
        - Related Bangla terms Google expects
        - Synonyms in Bengali: "মূল্য" (price), "দাম" (cost), "মূল্যবৃদ্ধি" (price increase)
    
    **E. QUESTION KEYWORDS (প্রশ্ন-ভিত্তিক কীওয়ার্ড):**
        - Quantity: 5-8
        - Bangla question format: "কেন", "কীভাবে", "কী", "কোথায়", "কখন"
        - Example: "কীভাবে সোনার দাম নির্ধারণ হয় বাংলাদেশে?"
        - Bangla voice search optimized
    
    **F. ENTITIES (সত্ত্বা):**
        - ALL in Bangla script + English
        - People: "আবদুর রউফ তালুকদার" (Abdur Rouf Talukder)
        - Organizations: "বাংলাদেশ ব্যাংক" (Bangladesh Bank)
        - Places: "ঢাকা" (Dhaka), proper Bengali spelling
        - Events/Policies: "সোনা নীতি ২০১৮" (Gold Policy 2018)

    **Phase 3: BANGLA META TAGS & SEO DELIVERABLES**

    **1. BILINGUAL META TAGS:**
       - Generate TWO versions: Bangla AND English
       - Bangla Meta Title (50-60 chars in Bengali): "সোনার দাম বৃদ্ধি বাংলাদেশে: বাজার বিশ্লেষণ | দ্য ডেইলি স্টার"
       - English Meta Title: For international/English searches
       - Bangla Meta Description (150-160 chars)
       - English Meta Description: Alternative version
    
    **2. BANGLA SEARCH INSIGHTS:**
       - How Bangladeshis search differently in Bangla vs English
       - Code-switching patterns observed
       - Regional dialect considerations
       - Voice search optimization notes
    
    **3. TRANSLITERATION GUIDE:**
       - Key Bangla terms with pronunciation guide
       - Example: "অর্থনীতি = orthoniti (economy)"
       - Help English speakers understand Bangla keywords
    
    **4. SEO SCORE (Same 0-100 scale):**
       - Evaluate for Bangla search optimization
       - Bonus points for proper Unicode
       - Bangla Featured Snippet potential
    
    **5. SERP FEATURE TARGETS (Bangla-specific):**
       - Bangla Featured Snippets (70% less competitive!)
       - Bangla PAA boxes
       - Top Stories (বাংলা সংবাদ)
       - Local Pack (Bangladesh)
    
    **6. BANGLADESH LOCAL SEO (বাংলাদেশ স্থানীয় এসইও):**
       - Geographic: ঢাকা, চট্টগ্রাম, সিলেট
       - Local entities: বাংলাদেশ ব্যাংক, সরকারি প্রতিষ্ঠান
       - Cultural context: টাকা (Taka), বাংলা ক্যালেন্ডার
       - Bangla festivals, local events
    
    **7. COMPETITOR GAP (Bangla Media):**
       - Compare with ${competitorContext}
       - Unique Bangla angles
       - Missing Bangla keywords
       - Differentiation in Bengali market

    **OUTPUT FORMAT (CRITICAL):**
    Respond ONLY with valid JSON. For Bangla keywords, provide BOTH scripts:

    \`\`\`json
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
    \`\`\`

    **CRITICAL FOR THE DAILY STAR BANGLA:**
    1. EVERY keyword in BOTH Bangla script and English transliteration
    2. Bangla queries are LONGER (4-10 words vs 3-6 in English)
    3. Code-switching is NATURAL and should be included
    4. Bangla Featured Snippets are EASIER to rank for
    5. Voice search in Bangla is GROWING FASTEST
    6. Proper Unicode rendering is MANDATORY
    7. Regional dialects matter (Dhaka standard preferred)
    8. Numbers in BOTH scripts when relevant
    9. Competitor analysis against Bangla media REQUIRED
    10. Bilingual meta tags give you DUAL visibility

    **Your Mission:** Make দ্য ডেইলি স্টার বাংলা rank #1 on Google Bangladesh for Bangla searches AND compete internationally. Execute with বাংলা expertise!
    `;
};

const generatePrompt = (articleContent: string, contentType: string): string => {
    let persona = `You are a Senior SEO Specialist at Google Search Quality Team with 15+ years experience in ranking algorithms, now consulting for The Daily Star Bangladesh reporters.
    
    **Your Deep Knowledge Includes:**
    - RankBrain, BERT, MUM, and Gemini-powered semantic search
    - Entity-based SEO and Google Knowledge Graph
    - News SEO and Google News Publisher Center requirements
    - E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) signals
    - Bangladesh local search ecosystem and vernacular patterns
    - SERP features: Featured Snippets, People Also Ask, Top Stories
    - Mobile-first indexing and Core Web Vitals impact on news
    - Real-time trending topics and search demand forecasting`;
    
    let competitorContext = "Prothom Alo, Bangladesh Pratidin, bdnews24.com, and international outlets (BBC Bangla, Al Jazeera)";
    let newsType = "breaking news, in-depth reporting";

    switch (contentType) {
        case 'Business Article':
            persona += "\n    You specialize in financial journalism SEO, business intelligence keywords, and B2B search intent.";
            competitorContext = "The Business Standard, Dhaka Tribune Business, Financial Express BD, and regional business publications";
            newsType = "business analysis, market reports, corporate coverage";
            break;
        case 'Press Release':
            persona += "\n    You specialize in announcement optimization, brand visibility, and newswire distribution SEO.";
            competitorContext = "official press releases, corporate announcements, and PR distribution networks";
            newsType = "official announcements, product launches, corporate statements";
            break;
    }

  return `
    **Persona:** ${persona}

    **Mission:** Analyze this ${newsType} article for The Daily Star and generate a COMPLETE SEO strategy that will rank #1 on Google Bangladesh and internationally.

    **Article Draft to Analyze:**
    ---
    ${articleContent}
    ---

    **!! GOOGLE RANKING ALGORITHM REQUIREMENTS !!**
    
    **Phase 1: SEMANTIC ANALYSIS (How Google Actually Works)**
    
    1. **Entity Recognition (Knowledge Graph Alignment):**
       - Identify ALL named entities: People, Organizations, Places, Events, Products
       - Match entities to their Knowledge Graph equivalents
       - Extract entity relationships and co-occurrences
       - Flag entities unique to Bangladesh context
    
    2. **Search Intent Classification:**
       - Determine primary user intent: Informational / Navigational / Transactional / Commercial Investigation
       - Identify micro-intents within the article (what specific questions users have)
       - Map keywords to SERP feature opportunities (Featured Snippet, PAA, Top Stories, etc.)
    
    3. **Topic Clustering & Semantic Relevance:**
       - Identify the core topic and sub-topics
       - Extract LSI (Latent Semantic Indexing) keywords - terms Google expects to see with main keywords
       - Find semantic variations and synonyms actually used in Bangladesh
       - Identify topic gaps compared to ${competitorContext}

    **Phase 2: KEYWORD EXTRACTION (Google Rank #1 Strategy)**

    **A. PRIMARY KEYWORDS (Head Terms - High Volume):**
        - **Quantity:** EXACTLY 3-5 keywords
        - **Word Count:** 1-3 words MAX
        - **SEO Purpose:** Capture 80% of search volume, establish topical authority
        - **Rules:**
          * Include the main headline topic (verbatim from article)
          * Add 2-4 related head terms that dominate the article
          * Include Bangladesh-specific variants where relevant
          * Consider plural/singular forms based on search behavior
          * Check: Would users type this exact phrase in Google?
        - **Google Factors:** High search volume, competitive, drives brand visibility
        - **Example:** "gold price Bangladesh", "domestic gold demand", "international bullion market"

    **B. SECONDARY KEYWORDS (Mid-tail - Entity-Based):**
        - **Quantity:** EXACTLY 8-12 keywords
        - **Word Count:** 2-5 words MAX
        - **SEO Purpose:** Entity recognition, topical depth, semantic SEO coverage
        - **Rules:**
          * Extract ALL named entities (MANDATORY):
            - People: Full names with titles/roles
            - Organizations: Companies, government bodies, institutions
            - Places: Cities, regions, landmarks (Bangladesh-specific)
            - Events: Policies, conferences, announcements
            - Products/Services: Specific offerings mentioned
          * Include industry-specific terminology
          * Add year/date qualifiers where relevant (e.g., "Gold Policy 2018")
          * Include statistical references (e.g., "20 tonnes annual demand")
        - **Google Factors:** Knowledge Graph entities, semantic relationships, E-E-A-T signals
        - **Examples:** "Bangladesh Bank policy", "industry insiders analysis", "taka devaluation impact", "smuggling revenue losses"

    **C. LONG-TAIL KEYWORDS (User Query Matching):**
        - **Quantity:** EXACTLY 10-15 keywords
        - **Word Count:** 4-8 words (complete phrases)
        - **SEO Purpose:** Featured Snippets, voice search, zero-click results, high conversion
        - **Rules:**
          * Extract verbatim phrases that answer "how, what, why, when, where"
          * Include complete statistics with context
          * Capture cause-and-effect relationships
          * Extract direct quotes and key findings
          * Match natural language search patterns
          * Prioritize phrases that could become Featured Snippets
        - **Google Factors:** RankBrain natural language processing, voice search optimization, position zero targeting
        - **Examples:** "domestic prices remain closely aligned with global trends", "annual domestic demand in Bangladesh stands between 20 tonnes and 40 tonnes"

    **D. LSI KEYWORDS (Latent Semantic Indexing - Google's Expected Context):**
        - **Quantity:** 5-8 keywords
        - **Word Count:** 2-4 words
        - **SEO Purpose:** Prove topical depth, avoid thin content penalties, semantic relevance signals
        - **Rules:**
          * Extract related concepts Google expects with main keywords
          * Include synonyms and variations actually used in article
          * Add contextual terms that support main topic
          * Bangladesh-specific terminology variations
        - **Google Factors:** BERT/MUM semantic understanding, content quality signals
        - **Examples:** "bullion market trends", "precious metal prices", "gold trading patterns", "market volatility factors"

    **E. QUESTION-BASED KEYWORDS (PAA & Featured Snippet Targeting):**
        - **Quantity:** 5-8 keywords
        - **Word Count:** 5-12 words (full questions)
        - **SEO Purpose:** People Also Ask (PAA) boxes, FAQ rich results, voice search
        - **Rules:**
          * Frame as actual questions from article content
          * Start with: "how", "what", "why", "when", "where", "who"
          * Must be answerable by article content
          * Match conversational search patterns
          * Include Bangladesh/local context in questions
        - **Google Factors:** Featured Snippets, PAA, voice search, Google Assistant
        - **Examples:** "why are gold prices rising in Bangladesh", "how does smuggling affect gold market", "what is Bangladesh Gold Policy 2018"

    **F. ENTITY EXTRACTION (Knowledge Graph Alignment):**
        - **Quantity:** All entities (no limit, extract comprehensively)
        - **Format:** Entity name + entity type
        - **Purpose:** Google Knowledge Graph connection, authority signals
        - **Rules:**
          * People: Name + Role/Title
          * Organizations: Official name + Type
          * Places: Location + Country/Region
          * Events: Name + Year
          * Laws/Policies: Official name + Issuing body
        - **Google Factors:** Knowledge Graph, entity-based search, E-E-A-T

    **Phase 3: SEO OPTIMIZATION DELIVERABLES**

    **1. META TITLE (Google Title Tag Optimization):**
        - Length: 50-60 characters (mobile-optimized)
        - Include: Primary keyword + compelling hook + "| The Daily Star"
        - Rules: Front-load main keyword, add emotional trigger, maintain journalistic tone
        - Example: "Gold Prices Surge in Bangladesh: Market Analysis | The Daily Star"

    **2. META DESCRIPTION (SERP Click-Through Optimization):**
        - Length: 150-160 characters
        - Include: Primary keyword, key statistic, call-to-action
        - Rules: Answer "what's in it for me", create urgency, include year/freshness signal
        - Example: "Gold prices in Bangladesh rise 15% amid global market shifts. Industry experts analyze taka devaluation impact and smuggling trends in 2024."

    **3. SEO SCORE (0-100 Scale):**
        - Evaluate article's SEO potential based on:
          * Keyword density and placement (20 points)
          * Entity coverage and E-E-A-T signals (20 points)
          * Content depth and semantic richness (20 points)
          * Bangladesh local SEO signals (15 points)
          * SERP feature optimization potential (15 points)
          * News SEO compliance (10 points)

    **4. SERP FEATURE TARGETS:**
        - List specific SERP features this article can rank for:
          * Featured Snippet (if yes, specify snippet type: paragraph/list/table)
          * People Also Ask (PAA)
          * Top Stories / News carousel
          * Local Pack (if Bangladesh location-specific)
          * Knowledge Panel (if entity-rich)
          * Image Pack (if visual content mentioned)

    **5. LOCAL SEO SIGNALS (Bangladesh-Specific):**
        - Identify Bangladesh local search optimization opportunities:
          * Geographic keywords (cities, regions)
          * Local entities (Bangladesh organizations, government bodies)
          * Local language variants (Bangla-English code-mixing)
          * Cultural context markers
          * Local competitor mentions

    **6. COMPETITOR GAP ANALYSIS:**
        - Compare to ${competitorContext}:
          * Unique angles this article covers (competitive advantages)
          * Missing keywords competitors rank for (content gaps)
          * Differentiating factors (exclusive sources, data, perspectives)

    **7. QUALITY VERIFICATION:** Before outputting JSON, verify:
        - Primary Keywords: EXACTLY 3-5 keywords
        - Secondary Keywords: EXACTLY 8-12 keywords
        - Long-tail Keywords: EXACTLY 10-15 keywords
        - LSI Keywords: 5-8 keywords
        - Question Keywords: 5-8 keywords
        - Entities: ALL extracted (comprehensive)
        - All keywords verbatim from article
        - No duplicates across categories

    **8. OUTPUT FORMAT:** Respond ONLY with a valid JSON object. No markdown, no extra text.

    **COMPLETE JSON STRUCTURE (Google Rank #1 Strategy):**
    \`\`\`json
    {
      "primary": [
        { 
          "term": "primary keyword 1", 
          "rationale": "Verbatim from headline. High search volume. Broad informational intent.",
          "searchIntent": "informational",
          "searchVolume": "high",
          "difficulty": "hard"
        }
        // 3-5 total, each with full details
      ],
      "secondary": [
        { 
          "term": "secondary keyword 1", 
          "rationale": "Named entity from article body. Medium search volume. Specific informational intent.",
          "searchIntent": "informational",
          "searchVolume": "medium",
          "difficulty": "medium"
        }
        // 8-12 total - ALL entities, organizations, people, places, concepts
      ],
      "longtail": [
        { 
          "term": "complete long phrase from article", 
          "rationale": "Natural language query. Featured Snippet potential. High conversion intent.",
          "searchIntent": "informational",
          "searchVolume": "low",
          "difficulty": "easy"
        }
        // 10-15 total - verbatim phrases, statistics, complete thoughts
      ],
      "lsiKeywords": [
        { "term": "related context term", "rationale": "Semantic relevance signal for Google BERT/MUM" }
        // 5-8 LSI terms
      ],
      "entities": [
        { "term": "Entity Name (Person/Org/Place/Event)", "rationale": "Knowledge Graph entity. E-E-A-T signal." }
        // ALL entities comprehensively extracted
      ],
      "questionKeywords": [
        { "term": "why/how/what question from content?", "rationale": "PAA box target. Voice search optimized." }
        // 5-8 question-based keywords
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
    \`\`\`
    
    **CRITICAL IMPERATIVES FOR THE DAILY STAR REPORTERS:**
    1. Extract EVERY entity, statistic, and quote - missing data = lost rankings
    2. Bangladesh context is MANDATORY - local SEO wins against international outlets  
    3. Question keywords = Featured Snippet opportunities = 3x traffic
    4. Meta title/description MUST be compelling - 30% of ranking is CTR
    5. LSI keywords prove topical authority - thin content gets penalized
    6. All keywords VERBATIM from article - no invented terms
    
    **Your mission:** Make The Daily Star rank #1 on Google Bangladesh and compete internationally. Execute with precision.
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
          temperature: 0.3, // Lower temperature for more consistent, accurate results
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 8192, // Allow longer, more comprehensive responses
        },
      });
    } else {
      // Fast Mode with Gemini 2.0 Flash (Quick, efficient)
      console.log("Using Gemini 2.0 Flash (Fast Mode)");
      response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
        config: {
          temperature: 0.4,
          topP: 0.9,
          topK: 40,
          maxOutputTokens: 4096,
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
    
    // Extract JSON from markdown code blocks if present
    if (!text.startsWith('{')) {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
           text = jsonMatch[1].trim();
        } else {
           // Try to find any JSON object in the response
           const objectMatch = text.match(/\{[\s\S]*\}/);
           if (objectMatch) {
             text = objectMatch[0];
           } else {
             throw new SyntaxError("No valid JSON found in the AI's response. Response: " + text.substring(0, 200));
           }
        }
    }
    
    // Parse JSON
    let parsedResult;
    try {
      parsedResult = JSON.parse(text);
    } catch (parseError) {
      throw new SyntaxError(`Failed to parse JSON response. Error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
    }
    
    // Validate the structure
    if (!validateKeywordResult(parsedResult)) {
      const counts = {
        primary: parsedResult.primary?.length || 0,
        secondary: parsedResult.secondary?.length || 0,
        longtail: parsedResult.longtail?.length || 0
      };
      
      throw new Error(
        `AI response has invalid keyword counts for Google Rank #1 optimization. ` +
        `Expected: Primary (3-5), Secondary (8-12), Long-tail (10-15). ` +
        `Received: Primary (${counts.primary}), Secondary (${counts.secondary}), Long-tail (${counts.longtail}). ` +
        `Please try again or use Deep Analysis mode for better results.`
      );
    }

    // Extract grounding chunks safely
    const groundingChunks: GroundingChunk[] = 
      response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { 
      ...parsedResult, 
      searchReferences: groundingChunks, 
      contentType,
      detectedLanguage 
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