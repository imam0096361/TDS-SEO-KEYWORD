
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

  // Core required fields with flexible modern quantities
  const coreValid = (
    validateKeywordArray(data.primary, 2, 5, 'Target Focus keywords (flexible: 2-5 based on article scope)') &&
    validateKeywordArray(data.secondary, 5, 12, 'Supporting Topic keywords (flexible: 5-12 based on complexity)') &&
    validateKeywordArray(data.longtail, 8, 20, 'User Query Variations (flexible: 8-20 based on content richness)') &&
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
    
    **Phase 2: INTENT-DRIVEN BANGLA KEYWORD EXTRACTION (Modern Approach)**

    **MODERN BANGLA SEO:** Same intent-driven approach as English, but adapted for Bangla search behavior (40% longer queries, more conversational).

    **A. TARGET FOCUS KEYWORDS (লক্ষ্য কীওয়ার্ড - মূল বিষয়):**
        - Quantity: 2-5 keywords (flexible based on article)
        - Length: ANY length in Bangla (can be 1-15+ words) - NO LIMITS
        - Provide BOTH: Bangla script + English transliteration
        - Purpose: Core topic and primary search intent
        - Examples: 
          * "সোনার দাম" (sonar dam - gold price)
          * "কেন বাংলাদেশে সোনার দাম বাড়ছে ২০২৪ সালে" (why gold prices rising Bangladesh 2024)
          * "বাংলাদেশ সোনার বাজার বিশ্লেষণ" (Bangladesh gold market analysis)
        - Remember: Bangla users search 40% longer - embrace complete phrases!
    
    **B. SUPPORTING TOPIC KEYWORDS (সহায়ক বিষয় কীওয়ার্ড):**
        - Quantity: 5-12 keywords (varies by complexity)
        - Length: ANY length (2-10+ words in Bangla) - focus on THEMES
        - Extract SUB-TOPICS and CONCEPTS, not just entities
        - Examples:
          * "বৈশ্বিক সোনার বাজার প্রবণতা" (global gold market trends)
          * "টাকার অবমূল্যায়নের প্রভাব" (taka devaluation impact)
          * "সোনা চোরাচালান বাংলাদেশ" (gold smuggling Bangladesh)
          * "দেশীয় বনাম আন্তর্জাতিক স্বর্ণের দাম" (domestic vs international prices)
        - BOTH scripts for all keywords
    
    **C. USER QUERY VARIATIONS (ব্যবহারকারী অনুসন্ধান বৈচিত্র):**
        - Quantity: 8-20 phrases (varies by content richness)
        - Length: ANY length (3-20+ words) - match NATURAL Bangla queries
        - Bangla queries are LONGER and more conversational
        - Examples:
          * "দেশীয় দাম বৈশ্বিক প্রবণতার সাথে ঘনিষ্ঠভাবে সংযুক্ত" (verbatim from article)
          * "বাংলাদেশে বার্ষিক গার্হস্থ্য চাহিদা ২০ থেকে ৪০ টনের মধ্যে" (with statistics)
          * "চোরাচালান উল্লেখযোগ্য রাজস্ব ক্ষতির কারণ" (complete thoughts)
        - BOTH scripts required
    
    **D. SEMANTIC CONTEXT KEYWORDS (বাংলা প্রসঙ্গ শব্দ):**
        - Quantity: 5-8 keywords
        - Length: ANY length (1-6 words typically)
        - Bangla synonyms and related terms
        - Examples:
          * "মূল্য" (price), "দাম" (cost), "মূল্যবৃদ্ধি" (price increase)
          * "বুলিয়ন বাজার" (bullion market), "মূল্যবান ধাতু" (precious metals)
        - BOTH scripts
    
    **E. QUESTION-INTENT KEYWORDS (প্রশ্ন-ভিত্তিক কীওয়ার্ড):**
        - Quantity: 5-10 questions
        - Length: ANY length - complete, natural Bangla questions (4-25+ words)
        - Bangla question words: "কেন", "কীভাবে", "কী", "কোথায়", "কখন", "কোন"
        - Examples:
          * "কেন বাংলাদেশে সোনার দাম বাড়ছে ২০২৪ সালে?" (why prices rising)
          * "কীভাবে সোনার দাম নির্ধারণ করা হয় বাংলাদেশে?" (how determined)
          * "চোরাচালান কীভাবে সোনার বাজারকে প্রভাবিত করে?" (smuggling impact)
        - Voice search optimized, PAA targets
        - BOTH scripts
    
    **F. NAMED ENTITIES (সত্ত্বা - নামযুক্ত সংস্থা):**
        - Quantity: ALL entities (5-20+) - comprehensive
        - BOTH Bangla script + English transliteration MANDATORY
        - Examples:
          * "বাংলাদেশ ব্যাংক (Bangladesh Bank - Central Bank)"
          * "আবদুর রউফ তালুকদার (Abdur Rouf Talukder - BAJUS Chairman)"
          * "ঢাকা (Dhaka - Capital City)"
          * "সোনা নীতি ২০১৮ (Gold Policy 2018 - Regulation)"
        - Proper Bengali spelling essential

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

    **CRITICAL FOR THE DAILY STAR BANGLA - MODERN APPROACH:**
    1. ❌ NO word count limits - ✅ Bangla users search LONGER (40% more than English)
    2. EVERY keyword in BOTH Bangla script AND English transliteration (MANDATORY)
    3. Target Focus = ANY length that captures intent (can be 1-15+ words in Bangla)
    4. Supporting Topics = THEMES/CONCEPTS in Bangla, not just entity dumps
    5. User Queries = NATURAL conversational Bangla (embrace 10-20 word phrases!)
    6. Code-switching is NATURAL: "বাংলাদেশ economy" is how people search
    7. Bangla Featured Snippets 70% EASIER - massive opportunity!
    8. Voice search in Bangla growing 200%/year - optimize for questions
    9. Proper Unicode (U+0980-U+09FF) MANDATORY
    10. Numbers in BOTH scripts: "২০২৪" and "2024"
    11. Dhaka standard preferred (শুদ্ধ Bangla)
    12. Bilingual meta tags = DUAL visibility (Bangla + English searches)
    13. Focus on WHAT users want to know, not arbitrary categorization

    **Your Mission:** Make দ্য ডেইলি স্টার বাংলা rank #1 by understanding Bangla SEARCH INTENT and natural language patterns. Execute with modern বাংলা SEO expertise!
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

    **Phase 2: INTENT-DRIVEN KEYWORD EXTRACTION (Google 2024-2025 Algorithm)**

    **MODERN SEO PRINCIPLE:** Google ranks content by SEARCH INTENT and SEMANTIC RELEVANCE, not word count.
    Organize keywords by HOW and WHY users search, not by arbitrary length categories.

    **A. TARGET FOCUS KEYWORDS (Primary Intent - What This Article Is About):**
        - **Quantity:** 2-4 keywords (flexible based on article scope)
        - **Length:** ANY length that captures complete user intent (can be 1-10+ words)
        - **SEO Purpose:** Define the core topic and primary search intent this article serves
        - **Modern Rules:**
          * Extract the EXACT topic users would search for (don't limit by word count)
          * Include the main headline topic with natural modifiers
          * Can be broad ("gold prices") OR specific ("why Bangladesh gold prices increased in 2024")
          * Focus on INTENT, not length: What problem/question does this article solve?
          * Include Bangladesh-specific context if it's core to the topic
          * Each keyword should represent a distinct search intent
        - **Google Factors:** Primary intent matching, topic authority, user satisfaction signals
        - **Examples:** 
          * "gold prices in Bangladesh" (informational)
          * "why are gold prices rising in Bangladesh 2024" (informational - specific)
          * "Bangladesh gold market analysis" (commercial investigation)
          * "impact of smuggling on Bangladesh economy" (informational - cause)

    **B. SUPPORTING TOPIC KEYWORDS (Content Depth - What Sub-Topics Are Covered):**
        - **Quantity:** 6-10 keywords (varies by article complexity)
        - **Length:** ANY length (2-8+ words) - focus on complete topics, not word limits
        - **SEO Purpose:** Demonstrate topical breadth, semantic coverage, subject matter expertise
        - **Modern Rules:**
          * Extract THEMES and SUB-TOPICS, not just entities
          * Each keyword = a distinct concept or angle covered in the article
          * Include market dynamics, trends, causes, effects, policies
          * Industry terminology and professional concepts
          * Related topics that provide context
          * Can include key statistics as topic phrases ("20-40 tonnes annual demand")
        - **Google Factors:** Topical authority, semantic relevance, content depth signals
        - **Examples:** 
          * "global gold market trends"
          * "taka devaluation effects"
          * "gold smuggling Bangladesh"
          * "domestic vs international gold prices"
          * "Bangladesh Bank monetary policy"
          * "consumer gold demand patterns"

    **C. USER QUERY VARIATIONS (How Real People Search This Topic):**
        - **Quantity:** 10-15 phrases (varies by content richness)
        - **Length:** ANY length that matches natural search queries (3-15+ words)
        - **SEO Purpose:** Match actual search queries, capture long-tail traffic, Featured Snippets
        - **Modern Rules:**
          * Extract phrases EXACTLY as they appear in article (verbatim is powerful)
          * Focus on complete thoughts and natural language
          * Include questions, statements, and conversational phrases
          * Statistics with context (not just numbers)
          * Cause-and-effect relationships
          * Direct quotes that answer common questions
          * NO arbitrary word count limits - if users search it, include it
        - **Google Factors:** Natural language processing (BERT/MUM), voice search, Featured Snippet eligibility, query matching
        - **Examples:** 
          * "domestic prices closely aligned with global trends"
          * "annual domestic demand between 20 and 40 tonnes"
          * "smuggling causes significant revenue losses"
          * "Gold Policy 2018 import regulations"
          * "how global prices affect Bangladesh market"

    **D. SEMANTIC CONTEXT KEYWORDS (What Google Expects to See):**
        - **Quantity:** 5-8 keywords
        - **Length:** ANY length (1-6 words typically)
        - **SEO Purpose:** Prove comprehensive topic coverage, semantic SEO, avoid thin content
        - **Modern Rules:**
          * Related concepts and synonyms Google associates with your main topic
          * Industry terminology and co-occurring terms
          * Contextual terms that signal expertise
          * Variations of main keywords (synonyms, related phrases)
          * Terms that often appear together in authoritative content
        - **Google Factors:** Semantic understanding, topical authority, content quality signals
        - **Examples:** 
          * "bullion market", "precious metals", "gold trading"
          * "market volatility", "price fluctuations"
          * "import duties", "customs regulations"
          * "commodity prices", "forex rates"

    **E. QUESTION-INTENT KEYWORDS (Featured Snippet & Voice Search Targets):**
        - **Quantity:** 5-10 questions (based on content)
        - **Length:** ANY length - complete, natural questions (4-20+ words)
        - **SEO Purpose:** People Also Ask (PAA), Featured Snippets, voice search, conversational AI
        - **Modern Rules:**
          * Frame as ACTUAL questions a user would ask
          * Must be directly answerable by your article content
          * Use natural question words: why, how, what, when, where, who, which
          * Include context (location, time, specifics)
          * Conversational and natural language
          * Each question = potential Featured Snippet opportunity
        - **Google Factors:** Featured Snippets, PAA boxes, voice search, conversational search, Google Assistant
        - **Examples:** 
          * "why are gold prices rising in Bangladesh in 2024?"
          * "how does smuggling affect Bangladesh gold market?"
          * "what is the Gold Policy 2018?"
          * "what factors influence gold prices in Bangladesh?"
          * "how much gold does Bangladesh import annually?"

    **F. NAMED ENTITIES (Knowledge Graph & E-E-A-T Signals):**
        - **Quantity:** ALL entities (comprehensive extraction, typically 5-20+)
        - **Format:** Entity name + entity type
        - **SEO Purpose:** Knowledge Graph connection, E-E-A-T signals, entity-based ranking
        - **Modern Rules:**
          * Extract EVERY named entity mentioned
          * People: Full names with titles/roles/affiliations
          * Organizations: Official names (government, companies, institutions)
          * Places: Cities, regions, countries, landmarks
          * Events: Conferences, policies, announcements, dates
          * Products/Services: Specific offerings, brands
          * Laws/Regulations: Official policy names
        - **Google Factors:** Knowledge Graph entities, entity-based search, E-E-A-T, authority signals
        - **Examples:**
          * "Bangladesh Bank (Central Bank)"
          * "Abdur Rouf Talukder (BAJUS Chairman)"
          * "Dhaka (Capital City)"
          * "Gold Policy 2018 (Regulation)"

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
        - Target Focus Keywords: 2-5 keywords (each represents distinct primary intent)
        - Supporting Topic Keywords: 5-12 keywords (varies by article complexity)
        - User Query Variations: 8-20 phrases (varies by content richness)
        - Semantic Context Keywords: 5-8 keywords
        - Question-Intent Keywords: 5-10 questions
        - Named Entities: ALL extracted (comprehensive, typically 5-20+)
        - All keywords/phrases extracted verbatim from article
        - No duplicates across categories
        - Each keyword has clear rationale and search intent

    **8. OUTPUT FORMAT - CRITICAL:** 
    
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
    
    **CRITICAL IMPERATIVES - MODERN SEO (2024-2025):**
    1. ❌ STOP organizing by word count - ✅ START organizing by SEARCH INTENT
    2. Target Focus keywords can be ANY length (1-10+ words) - capture complete user intent
    3. Supporting Topics = THEMES/CONCEPTS, not just entity lists
    4. User Query Variations = EXACTLY how people search (verbatim from article, any length)
    5. Extract ALL entities separately - don't mix with topic keywords
    6. Question keywords = Featured Snippet gold mines (complete, natural questions)
    7. Bangladesh context is MANDATORY - local SEO dominates international
    8. Meta tags must be compelling - CTR is a major ranking factor
    9. NO invented keywords - extract verbatim from article only
    10. Focus on WHAT users want to know, not arbitrary categorization rules
    
    **Your mission:** Make The Daily Star rank #1 by understanding USER INTENT and SEMANTIC CONTEXT, not outdated word-count rules. Execute with modern SEO precision.
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
        `AI response has invalid keyword counts for modern SEO optimization. ` +
        `Expected: Target Focus (2-5), Supporting Topics (5-12), User Query Variations (8-20). ` +
        `Received: Target Focus (${counts.primary}), Supporting Topics (${counts.secondary}), User Queries (${counts.longtail}). ` +
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