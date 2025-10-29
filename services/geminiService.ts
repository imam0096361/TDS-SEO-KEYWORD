
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

  // Core required fields with VERY FLEXIBLE quantities (quality over quantity)
  const coreValid = (
    validateKeywordArray(data.primary, 1, 10, 'Target Focus keywords (1-10, flexible based on article scope)') &&
    validateKeywordArray(data.secondary, 2, 20, 'Supporting Topic keywords (2-20, flexible based on complexity)') &&
    validateKeywordArray(data.longtail, 3, 30, 'User Query Variations (3-30, flexible based on content richness)') &&
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
    
    **Phase 2: SEARCH VOLUME-DRIVEN BANGLA KEYWORD RESEARCH (World-Class SEO 2024-2025)**

    **🔥 CRITICAL PARADIGM SHIFT - BANGLA KEYWORD RESEARCH MINDSET:**
    
    You are NOT just extracting keywords from the article. You are doing BANGLA KEYWORD RESEARCH.
    Your mission: Find the HIGHEST search volume BANGLA keywords related to this topic.
    
    **PRIORITY ORDER (বাংলা সার্চ ভলিউম):**
    1. 📊 HIGH SEARCH VOLUME (10,000+ searches/month in Bangladesh) = TOP PRIORITY
    2. 📈 MEDIUM SEARCH VOLUME (1,000-10,000 searches/month) = IMPORTANT
    3. 📉 LOW SEARCH VOLUME (<1,000 searches/month) = AVOID unless highly specific
    
    **WORLD-CLASS BANGLA SEO PRINCIPLE:**
    - Think: "বাংলাদেশে এই বিষয়ে সবচেয়ে বেশি সার্চ কী?" (What are the BIGGEST searches in Bangladesh for this topic?)
    - NOT: "আর্টিকেলে কোন শব্দ আছে?" (What exact words are in this article?)
    - Article content = context. Bangla search demand = target.
    - Prioritize POPULAR Bangla queries, not niche phrases.
    - BANGLA-SPECIFIC: Searches are 40% LONGER - include full conversational queries!

    **A. PRIMARY KEYWORDS (প্রাথমিক কীওয়ার্ড) - HIGHEST VOLUME (10,000+ monthly searches):**
        - **Quantity:** 2-5 keywords MAXIMUM (only the BIGGEST Bangla searches)
        - **Length:** ANY length (Bangla users search 40% longer - embrace it!)
        - **CRITICAL: SEARCH VOLUME IS KING (সার্চ ভলিউম সবচেয়ে গুরুত্বপূর্ণ)**
        - **Provide BOTH:** Bangla script + English transliteration (MANDATORY)
        
        🎯 **BANGLA KEYWORD RESEARCH MINDSET:**
        
        **Step 1:** Identify the article's MAIN TOPIC
        **Step 2:** Think: "বাংলাদেশে সবচেয়ে জনপ্রিয় সার্চ কী?" (What are the MOST POPULAR searches in Bangladesh?)
        **Step 3:** Choose ONLY keywords with MASSIVE search volume
        **Step 4:** Prioritize BROAD, POPULAR Bangla terms
        
        **🔥 HIGHEST VOLUME BANGLA KEYWORDS (বাংলা সার্চ ভলিউম):**
        
        1. **BROAD HEAD TERMS (Massive volume 50,000+ searches/month)**
           - "সোনার দাম" (sonar dam - gold price) - most searches
           - "সোনার রেট" (sonar rate - gold rate) - very high
           - "আজকের সোনার দাম" (ajoker sonar dam - gold price today) - evergreen
           - Think: Simple, broad, what EVERYONE searches in Bangla
        
        2. **GEO-TARGETED HIGH VOLUME (10,000-50,000 searches/month)**
           - "বাংলাদেশে সোনার দাম" (Bangladesh gold price)
           - "ঢাকায় সোনার দাম" (Dhaka gold price)
           - "আজকের সোনার রেট বাংলাদেশ" (today's gold rate Bangladesh)
           - Think: Bangladesh + popular Bangla term
        
        3. **COMMERCIAL HIGH INTENT (10,000+ searches/month)**
           - "২২ ক্যারেট সোনার দাম" (22 carat gold price)
           - "সোনা কেনার দাম" (gold buying price)
           - "সোনার ভরি দাম" (gold bhori price - local unit)
           - Think: What buyers/investors search in Bangla
        
        **❌ AVOID LOW VOLUME (বাংলা):**
        - Academic Bangla phrases (<1,000 searches)
        - Article-specific wording if not commonly searched
        - Technical jargon without proven search volume
        
        **✅ INCLUDE HIGH VOLUME (বাংলা):**
        - Simple, broad Bangla terms (সোনার দাম, রেট)
        - "আজকের" (today) variations - high daily volume
        - Local units: ভরি (bhori), আনা (ana)
        - City names: ঢাকা, চট্টগ্রাম
        
        **Examples:**
        HIGH VOLUME PRIMARY:
        1. "সোনার দাম" (sonar dam - gold price) 100,000+ searches
        2. "আজকের সোনার দাম" (ajoker sonar dam - gold price today) 80,000+ searches
        3. "বাংলাদেশে সোনার দাম" (Bangladesh sonar dam) 50,000+ searches
        4. "সোনার রেট" (sonar rate) 30,000+ searches
        5. "২২ ক্যারেট সোনার দাম" (22 carat sonar dam) 25,000+ searches
    
    **B. SECONDARY KEYWORDS (সহায়ক কীওয়ার্ড) - MEDIUM-HIGH VOLUME (1,000-15,000 searches):**
        - **Quantity:** 5-12 keywords (MEDIUM search volume focus)
        - **Length:** ANY length (Bangla users use longer queries!)
        - **CRITICAL: MEDIUM VOLUME + RELEVANCE**
        - **BOTH scripts:** Bangla + English transliteration
        
        🎯 **RELATED HIGH-DEMAND BANGLA SEARCHES:**
        
        **Step 1:** Look at article sub-topics
        **Step 2:** Think: "কোন জনপ্রিয় সম্পর্কিত সার্চ আছে?" (What POPULAR related searches exist?)
        **Step 3:** Include MEDIUM-HIGH volume Bangla variations
        **Step 4:** Check Bangla Google's "এছাড়াও মানুষ খোঁজেন" (People Also Search For)
        
        **🔥 MEDIUM-HIGH VOLUME BANGLA TARGETS:**
        
        1. **POPULAR SUB-TOPICS (5,000-15,000 searches/month)**
           - "সোনার দাম বৃদ্ধি" (gold price increase)
           - "বাংলাদেশে সোনার বিনিয়োগ" (gold investment Bangladesh)
           - "সোনার বাজার" (gold market)
           - Think: Popular aspects in Bangla
        
        2. **RELATED HIGH-VOLUME QUERIES (2,000-10,000 searches/month)**
           - "রূপার দাম বাংলাদেশ" (silver price Bangladesh)
           - "ডলারের রেট" (dollar rate)
           - "সোনার দাম পূর্বাভাস" (gold price prediction)
           - Think: Related topics with high Bangla search demand
        
        3. **SPECIFIC HIGH-VOLUME VARIATIONS (1,000-5,000 searches/month)**
           - "১৮ ক্যারেট সোনার দাম" (18 carat gold price)
           - "সোনার ভরি প্রতি দাম" (price per bhori)
           - "সোনার অলংকারের দাম" (gold ornament price)
           - Think: Specific but still popular Bangla searches
        
        **Examples:**
        SECONDARY (MEDIUM-HIGH VOLUME):
        1. "সোনার দাম বৃদ্ধি" (sonar dam briddhi - price increase) 10,000+ searches
        2. "রূপার দাম" (rupar dam - silver price) 8,000+ searches
        3. "ডলারের রেট বাংলাদেশ" (dollar rate) 6,000+ searches
        4. "সোনার বিনিয়োগ" (gold investment) 5,000+ searches
        5. "১৮ ক্যারেট সোনার দাম" (18 carat) 3,000+ searches
    
    **C. LONG-TAIL KEYWORDS (লং-টেইল কীওয়ার্ড) - POPULAR LONG BANGLA QUERIES (500-5,000 searches):**
        - **Quantity:** 8-20 phrases (POPULAR long-tail, not random article sentences)
        - **Length:** ANY length (Bangla queries are 40% LONGER - 5-25+ words!)
        - **CRITICAL: SEARCH DEMAND FOR BANGLA LONG QUERIES**
        - **BOTH scripts:** Bangla + English (MANDATORY)
        
        🎯 **POPULAR BANGLA LONG-TAIL RESEARCH:**
        
        **Step 1:** Identify specific Bangla questions users ask
        **Step 2:** Think: "জনপ্রিয় বিস্তারিত সার্চ কোনগুলো?" (What POPULAR detailed searches exist?)
        **Step 3:** Focus on 500-5,000 search volume Bangla long-tail
        **Step 4:** Bangla Featured Snippet opportunities (70% LESS competitive!)
        
        **🔥 POPULAR BANGLA LONG-TAIL TARGETS:**
        
        1. **POPULAR QUESTION QUERIES (1,000-5,000 searches/month)**
           - "কীভাবে সোনার খাঁটিতা যাচাই করবেন" (how to check gold purity)
           - "কোথায় সোনা কিনবেন বাংলাদেশে" (where to buy gold Bangladesh)
           - "কখন সোনা কেনা উচিত" (when to buy gold)
           - Think: Questions MANY people ask in Bangla
        
        2. **SPECIFIC POPULAR SEARCHES (500-2,000 searches/month)**
           - "সোনার দাম বাড়ার কারণ" (reason for price increase)
           - "সোনার দাম পূর্বাভাস ২০২৪" (prediction 2024)
           - "সোনা বনাম ডলার বিনিয়োগ" (gold vs dollar investment)
           - Think: Specific but popular Bangla queries
        
        3. **COMMERCIAL LONG-TAIL (500-3,000 searches/month)**
           - "বাংলাদেশে সোনার ভরি প্রতি দাম" (price per bhori)
           - "ঢাকায় সেরা সোনার দোকান" (best gold shop Dhaka)
           - "পুরনো সোনার দাম" (old gold price)
           - Think: Buying/selling specific Bangla queries
        
        **❌ AVOID LOW-VOLUME BANGLA PHRASES:**
        - Random article sentences with no search demand (<100 searches)
        - "বার্ষিক গার্হস্থ্য চাহিদা ২০-৪০ টন" (annual demand 20-40 tonnes) - too specific
        - Academic/technical Bangla phrasing with no proven volume
        
        **✅ PRIORITIZE POPULAR BANGLA LONG-TAIL:**
        - Bangla questions with proven demand (কীভাবে, কেন, কোথায়)
        - "কীভাবে" (how to) queries - usually high volume
        - "কখন" (when to) timing questions
        - "কোথায়" (where to) location questions
        - Commercial long-tail in Bangla
        - Comparison queries (সোনা বনাম রূপা, etc.)
        
        **Examples:**
        LONG-TAIL (POPULAR 500-5,000 searches):
        1. "কীভাবে সোনার খাঁটিতা বুঝবেন" (how to check purity) 4,000+ searches
        2. "ঢাকায় কোথায় সোনা কিনবেন" (where to buy in Dhaka) 3,500+ searches
        3. "সোনার দাম বাড়ার কারণ" (reason for increase) 2,800+ searches
        4. "কখন সোনা কেনা লাভজনক" (when to buy) 2,200+ searches
        5. "সোনা বনাম ডলার কোনটি ভালো" (gold vs dollar) 1,800+ searches
        6. "বাংলাদেশে সোনায় বিনিয়োগ" (invest in gold) 1,500+ searches
    
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

    **CRITICAL IMPERATIVES - WORLD-CLASS BANGLA SEO (SEARCH VOLUME FIRST):**
    
    🔥 **PARADIGM SHIFT - BANGLA KEYWORD RESEARCH, NOT EXTRACTION:**
    
    1. 📊 **SEARCH VOLUME IS #1 PRIORITY (বাংলা সার্চ ভলিউম):**
       - PRIMARY: Only include 10,000+ monthly searches in Bangladesh
       - SECONDARY: Focus on 1,000-15,000 monthly searches
       - LONG-TAIL: Target 500-5,000 monthly searches (popular Bangla long-tail)
    
    2. 🎯 **THINK LIKE BANGLA KEYWORD RESEARCH TOOL:**
       - Ask: "বাংলাদেশে সবচেয়ে বড় সার্চ কী?" (What are the BIGGEST searches in Bangladesh?)
       - NOT: "আর্টিকেলে কী লেখা আছে?" (What exact words are in this article?)
       - Article = context. Bangla search demand = target.
    
    3. ✅ **PRIMARY KEYWORDS (10,000+ searches):**
       - Broad Bangla terms: "সোনার দাম", "সোনার রেট", "আজকের সোনার দাম"
       - Geo-targeted: "বাংলাদেশে সোনার দাম", "ঢাকায় সোনার দাম"
       - Commercial: "২২ ক্যারেট সোনার দাম", "সোনা কেনার দাম"
       - SIMPLE, POPULAR, BROAD Bangla = HIGH VOLUME
    
    4. ✅ **SECONDARY KEYWORDS (1,000-15,000 searches):**
       - Related popular topics: "রূপার দাম", "ডলারের রেট"
       - Sub-topics: "সোনার বিনিয়োগ", "সোনার বাজার"
       - Specific popular: "১৮ ক্যারেট সোনার দাম", "সোনার চার্ট"
       - Check Bangla "এছাড়াও মানুষ খোঁজেন" (People Also Search For)
    
    5. ✅ **LONG-TAIL (500-5,000 searches):**
       - Popular Bangla questions: "কীভাবে সোনার খাঁটিতা বুঝবেন", "কোথায় সোনা কিনবেন"
       - Commercial long-tail: "সোনার ভরি প্রতি দাম", "ঢাকায় সেরা সোনার দোকান"
       - Trending: "সোনার দাম পূর্বাভাস ২০২৪", "সোনায় বিনিয়োগ গাইড"
       - ❌ AVOID random Bangla article sentences with <100 searches
    
    6. 🚫 **WHAT TO AVOID (LOW VOLUME বাংলা):**
       - Academic Bangla phrases without search demand
       - Technical jargon: "সামষ্টিক অর্থনৈতিক কারণ যা পণ্যের বাজার প্রভাবিত করে"
       - Random article sentences: "বার্ষিক গার্হস্থ্য চাহিদা ২০-৪০ টন"
       - If Bangla search volume is <500/month → SKIP IT
    
    7. 📈 **PRIORITIZE BANGLA:**
       - "আজকের" (today) variations - massive daily Bangla searches
       - Simple broad terms (সোনার দাম, সোনার রেট)
       - Commercial intent (কেনার, বিক্রির, দাম, রেট)
       - Questions with volume (কীভাবে, কোথায়, কখন, কেন)
       - Local: ঢাকা, চট্টগ্রাম, বাংলাদেশ
       - Local units: ভরি (bhori), আনা (ana)
    
    8. 🎪 **BANGLA FEATURED SNIPPET OPPORTUNITIES:**
       - Target POPULAR Bangla questions (1,000+ searches)
       - "কীভাবে" (how to) questions with proven demand
       - "কখন" (when to) timing questions
       - "কোথায়" (where to) location questions
       - 70% LESS competitive than English - HUGE opportunity!
    
    9. 🇧🇩 **BANGLADESH HIGH-VOLUME BANGLA SEARCHES:**
       - Local units: "প্রতি ভরি", "প্রতি আনা"
       - Cities: "ঢাকা", "চট্টগ্রাম", "সিলেট"
       - "আজকের" (today) - high daily search volume
    
    10. 🔄 **BANGLA SYNONYMS (ALL must have high volume):**
        - দাম = মূল্য = রেট (check which has higher volume in Bangla)
        - সোনা = স্বর্ণ (সোনা typically higher in Bangladesh)
        - কেনা = ক্রয় = বিনিয়োগ (কেনা usually highest)
    
    11. 🎯 **QUALITY CHECK (বাংলা):**
        - Does this BANGLA keyword have 500+ monthly searches? If NO → SKIP
        - Is this a POPULAR search in Bangladesh? If NO → SKIP
        - Would MANY people search this in Bangla? If NO → SKIP
    
    12. 🔤 **BILINGUAL REQUIREMENT (MANDATORY):**
        - EVERY keyword in BOTH Bangla script AND English transliteration
        - Example: "সোনার দাম" + "sonar dam (gold price)"
        - Helps English speakers understand + improves transliteration SEO
    
    13. 🗣️ **BANGLA VOICE SEARCH (Growing 200%/year):**
        - Natural, conversational Bangla queries
        - Questions: "কীভাবে", "কেন", "কোথায়", "কখন"
        - 40% LONGER queries than English - embrace it!
    
    14. 🔢 **NUMBERS IN BOTH SCRIPTS:**
        - Use both: "২০২৪" and "2024" (users search both)
        - Dates: "২০২৪ সালের জানুয়ারি" and "January 2024"
    
    15. 🔤 **CODE-SWITCHING IS NATURAL:**
        - "বাংলাদেশ economy" - how people actually search
        - "ঢাকা stock market" - mixed queries are common
        - Don't avoid English words in Bangla context
    
    16. 🌐 **MISSION:**
        Find the HIGHEST search volume BANGLA keywords related to this topic.
        Think: Bangla keyword research tool, not content extractor.

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

    **Phase 2: SEARCH VOLUME-DRIVEN KEYWORD RESEARCH (World-Class SEO 2024-2025)**

    **🔥 CRITICAL PARADIGM SHIFT - THINK LIKE SEMRUSH/AHREFS:**
    
    You are NOT just extracting keywords from the article. You are doing KEYWORD RESEARCH.
    Your mission: Find the HIGHEST search volume keywords related to this topic.
    
    **PRIORITY ORDER:**
    1. 📊 HIGH SEARCH VOLUME (10,000+ searches/month) = TOP PRIORITY
    2. 📈 MEDIUM SEARCH VOLUME (1,000-10,000 searches/month) = IMPORTANT
    3. 📉 LOW SEARCH VOLUME (<1,000 searches/month) = AVOID unless highly specific
    
    **WORLD-CLASS SEO PRINCIPLE:**
    - Think: "What are the BIGGEST searches in Bangladesh for this topic?"
    - Not: "What exact words are in this article?"
    - Article content = context. Search demand = target.
    - Prioritize POPULAR queries, not niche phrases.
    
    Organize keywords by SEARCH DEMAND and USER INTENT, not by article wording.

    **A. PRIMARY KEYWORDS - HIGHEST SEARCH VOLUME (10,000+ monthly searches):**
        - **Quantity:** 2-5 keywords MAXIMUM (only the BIGGEST searches)
        - **Length:** ANY length (usually 2-4 words for high volume)
        - **CRITICAL: SEARCH VOLUME IS KING**
        
        🎯 **KEYWORD RESEARCH MINDSET - Not Extraction:**
        
        **Step 1:** Identify the article's MAIN TOPIC
        **Step 2:** Think: "What are the MOST POPULAR searches in Bangladesh for this topic?"
        **Step 3:** Choose ONLY keywords with MASSIVE search volume
        **Step 4:** Prioritize BROAD, POPULAR terms over specific phrases
        
        **🔥 HIGHEST VOLUME KEYWORDS (Priority Order):**
        
        1. **BROAD HEAD TERMS** (Massive volume 50,000+ searches/month)
           - "gold price" (most searches)
           - "gold rate" (very high)
           - "gold price today" (evergreen high volume)
           - Think: Simple, broad, what EVERYONE searches
        
        2. **GEO-TARGETED HIGH VOLUME** (10,000-50,000 searches/month)
           - "Bangladesh gold price" (local high volume)
           - "gold price Bangladesh today" (daily searchers)
           - "BD gold rate" (common abbreviation)
           - Think: Bangladesh + popular term
        
        3. **COMMERCIAL HIGH INTENT** (10,000+ searches/month)
           - "22 carat gold price Bangladesh" (buying intent)
           - "gold rate today Bangladesh" (immediate intent)
           - Think: What buyers/investors search
        
        **❌ AVOID LOW VOLUME:**
        - Long, specific phrases (usually <1,000 searches)
        - Academic/technical jargon (low search demand)
        - Article-specific wording if not commonly searched
        
        **✅ INCLUDE HIGH VOLUME:**
        - Simple, broad terms (gold price, gold rate)
        - "Today" variations (gold price today - high daily volume)
        - Local variations (Bangladesh gold, BD gold)
        - Buying/commercial terms (22k gold, gold buying)
        
        **SEARCH VOLUME EXAMPLES (Bangladesh Gold Article):**
        
        PRIMARY (HIGH VOLUME - 10,000+ searches):
        1. "gold price" (100,000+ searches) HIGH VOLUME
        2. "gold price today" (80,000+ searches) HIGH VOLUME
        3. "Bangladesh gold price" (50,000+ searches) HIGH VOLUME
        4. "gold rate Bangladesh" (30,000+ searches) HIGH VOLUME
        5. "22 carat gold price" (25,000+ searches) HIGH VOLUME
        
        TOO SPECIFIC (LOW VOLUME - AVOID):
        - "gold prices influenced by global market volatility" (50 searches) TOO LOW
        - "Bangladesh gold market analysis report" (200 searches) TOO LOW
        
        **Google Factors:** 
        - SEARCH VOLUME (primary)
        - Commercial intent
        - Local relevance
        - Evergreen demand
        - Competition (prefer winnable high-volume)

    **B. SECONDARY KEYWORDS - MEDIUM-HIGH VOLUME (1,000-15,000 monthly searches):**
        - **Quantity:** 5-12 keywords (MEDIUM search volume focus)
        - **Length:** ANY length (usually 3-6 words)
        - **CRITICAL: MEDIUM VOLUME + RELEVANCE**
        
        🎯 **RELATED HIGH-DEMAND SEARCHES:**
        
        **Step 1:** Look at article sub-topics
        **Step 2:** Think: "What POPULAR related searches exist?"
        **Step 3:** Include MEDIUM-HIGH volume variations
        **Step 4:** Check Google's "People Also Search For"
        
        **🔥 MEDIUM-HIGH VOLUME TARGETS (1,000-15,000 searches):**
        
        1. **POPULAR SUB-TOPICS** (5,000-15,000 searches/month)
           - "gold price increase" (trending topic, high volume)
           - "gold investment Bangladesh" (commercial interest)
           - "gold market today" (daily searches)
           - Think: Popular aspects of main topic
        
        2. **RELATED HIGH-VOLUME QUERIES** (2,000-10,000 searches/month)
           - "silver price Bangladesh" (related metal, high searches)
           - "dollar rate Bangladesh" (related to gold prices)
           - "gold price prediction" (future interest)
           - Think: What related topics have high search demand?
        
        3. **SPECIFIC HIGH-VOLUME VARIATIONS** (1,000-5,000 searches/month)
           - "18 karat gold price" (specific purity, popular)
           - "gold price per gram" (unit-based search)
           - "gold ornament price" (product-specific)
           - Think: Specific but still popular searches
        
        **❌ AVOID:**
        - Niche academic terms (<500 searches)
        - Overly specific article phrases with no search demand
        - Technical jargon unless it has proven search volume
        
        **✅ PRIORITIZE:**
        - Google's "Related Searches" (proven demand)
        - "People Also Ask" topics (high interest)
        - Trending related topics
        - Commercial variations (buying, selling, investing)
        - Popular sub-categories
        
        **SEARCH VOLUME EXAMPLES (Gold Article Secondary):**
        
        SECONDARY (MEDIUM-HIGH VOLUME - 1,000-15,000 searches):
        1. "gold price increase" (10,000+ searches) INCLUDE
        2. "silver price Bangladesh" (8,000+ searches) INCLUDE
        3. "dollar rate Bangladesh" (6,000+ searches) INCLUDE
        4. "gold investment" (5,000+ searches) INCLUDE
        5. "18 karat gold price" (3,000+ searches) INCLUDE
        6. "gold price chart" (2,500+ searches) INCLUDE
        7. "gold jewellery price" (2,000+ searches) INCLUDE
        
        LOW VOLUME (SKIP THESE):
        - "taka devaluation impact on commodity markets" (100 searches) TOO LOW
        - "Bangladesh gold market microeconomic analysis" (20 searches) TOO LOW
        
        **Google Factors:**
        - Search volume (1,000-15,000 range)
        - Related search demand
        - Commercial intent
        - Topical relevance
        - User interest patterns

    **C. LONG-TAIL KEYWORDS - POPULAR LONG-QUERIES (500-5,000 monthly searches):**
        - **Quantity:** 8-20 phrases (POPULAR long-tail, not random article sentences)
        - **Length:** ANY length (usually 4-10 words for long-tail)
        - **CRITICAL: SEARCH DEMAND FOR LONGER QUERIES**
        
        🎯 **POPULAR LONG-TAIL RESEARCH:**
        
        **Step 1:** Identify specific questions/queries users ask
        **Step 2:** Think: "What POPULAR detailed searches exist?" (not rare phrases)
        **Step 3:** Focus on 500-5,000 search volume long-tail
        **Step 4:** Include Featured Snippet opportunities
        
        **🔥 POPULAR LONG-TAIL TARGETS (500-5,000 searches):**
        
        1. **POPULAR QUESTION QUERIES** (1,000-5,000 searches/month)
           - "how to check gold purity" (practical question, high demand)
           - "where to buy gold in Bangladesh" (commercial intent)
           - "how to invest in gold Bangladesh" (investment interest)
           - "when to buy gold in Bangladesh" (timing question)
           - Think: Questions MANY people ask
        
        2. **SPECIFIC POPULAR SEARCHES** (500-2,000 searches/month)
           - "gold price increase reason" (cause-seeking)
           - "gold price prediction 2024 Bangladesh" (future-looking)
           - "gold vs dollar investment Bangladesh" (comparison)
           - "best time to buy gold" (decision-making)
           - Think: Specific but still popular queries
        
        3. **COMMERCIAL LONG-TAIL** (500-3,000 searches/month)
           - "gold price per bhori Bangladesh" (local unit)
           - "gold jewellery price in Bangladesh today" (buyer intent)
           - "second hand gold price" (resale market)
           - "gold coin price Bangladesh" (investment product)
           - Think: Buying/selling specific queries
        
        4. **INFORMATIONAL LONG-TAIL** (500-2,000 searches/month)
           - "why gold price increasing 2024" (trending explanation)
           - "gold price future forecast" (prediction interest)
           - "gold price drop or rise" (directional interest)
           - Think: Information-seeking with volume
        
        **❌ AVOID LOW-VOLUME PHRASES:**
        - Random article sentences with no search demand (<100 searches)
        - "domestic prices remain closely aligned with global market trends" (50 searches) ← SKIP
        - "revenue losses from smuggling activities" (30 searches) ← SKIP
        - Academic/technical phrasing with no proven search volume
        
        **✅ PRIORITIZE POPULAR LONG-TAIL:**
        - Questions with proven search demand
        - "How to" queries (usually high volume)
        - "When to" timing questions
        - "Where to" location questions
        - Commercial long-tail (buying, selling, investing)
        - Comparison queries (gold vs silver, etc.)
        - Prediction/forecast queries (always popular)
        
        **SEARCH VOLUME EXAMPLES (Long-tail for Gold Article):**
        
        LONG-TAIL (POPULAR 500-5,000 searches):
        1. "how to check gold purity at home" (4,000+ searches) INCLUDE
        2. "where to buy gold in Dhaka" (3,500+ searches) INCLUDE
        3. "gold price increase reason today" (2,800+ searches) INCLUDE
        4. "when to buy gold in Bangladesh" (2,200+ searches) INCLUDE
        5. "gold vs dollar which is better" (1,800+ searches) INCLUDE
        6. "how to invest in gold Bangladesh" (1,500+ searches) INCLUDE
        7. "gold price per bhori today" (1,200+ searches) INCLUDE
        8. "best gold shop in Bangladesh" (1,000+ searches) INCLUDE
        9. "gold price drop prediction" (800+ searches) INCLUDE
        10. "gold price future forecast 2024" (600+ searches) INCLUDE
        
        RANDOM ARTICLE PHRASES (LOW/NO VOLUME - SKIP):
        - "domestic demand between 20 tonnes and 40 tonnes annually" (20 searches) TOO LOW
        - "alignment with global market trends persists" (5 searches) TOO LOW
        - "policy framework under Gold Policy 2018" (10 searches) TOO LOW
        
        **Google Factors:**
        - Search volume (500-5,000 sweet spot)
        - Featured Snippet potential (questions!)
        - Commercial intent
        - Voice search compatibility
        - Natural language patterns
        - Proven user demand

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

    **7. SEARCH VOLUME VERIFICATION (CRITICAL QUALITY CHECK):** Before outputting JSON:
        
        **PRIMARY KEYWORDS - SEARCH VOLUME CHECK:**
        - ✅ Does EACH have 10,000+ monthly searches?
        - ✅ Are these the BIGGEST searches for this topic in Bangladesh?
        - ✅ Included "today" variations? (gold price today - massive volume)
        - ✅ Included broad terms? (gold price, gold rate)
        - ✅ Included geo-targeted high-volume? (Bangladesh gold price)
        - ❌ NO low-volume specific phrases
        - Target: 2-5 keywords with MASSIVE search demand
        
        **SECONDARY KEYWORDS - MEDIUM VOLUME CHECK:**
        - ✅ Does EACH have 1,000-15,000 monthly searches?
        - ✅ Checked "People Also Search For"?
        - ✅ Included related high-demand topics?
        - ✅ Included specific popular variations? (18k gold, per gram)
        - ❌ NO niche academic terms
        - Target: 5-12 keywords with proven search demand
        
        **LONG-TAIL KEYWORDS - POPULAR LONG-TAIL CHECK:**
        - ✅ Does EACH have 500-5,000 monthly searches?
        - ✅ Are these POPULAR questions? (how to, where to, when to)
        - ✅ Included commercial long-tail? (best gold shop, where to buy)
        - ✅ Included trending queries? (prediction, forecast)
        - ❌ NO random article sentences with <100 searches
        - ❌ SKIP "domestic demand between 20-40 tonnes" type phrases
        - Target: 8-20 popular long-tail queries
        
        **OVERALL QUALITY:**
        - ✅ ALL keywords have proven search volume (500+ minimum)
        - ✅ Prioritized high-volume over low-volume
        - ✅ Thought like SEMrush/Ahrefs (keyword research tool)
        - ✅ Focused on POPULAR searches, not just article wording
        - ✅ Included commercial intent where relevant
        - ✅ Each keyword has search volume indicator (high/medium/low)
        - ✅ No duplicates across categories
        
        **FINAL CHECK:**
        "Would these keywords bring significant traffic if we ranked for them?"
        If NO → Replace with higher-volume alternatives

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
    
    **CRITICAL IMPERATIVES - WORLD-CLASS SEO (SEARCH VOLUME FIRST):**
    
    🔥 **PARADIGM SHIFT - YOU ARE DOING KEYWORD RESEARCH, NOT EXTRACTION:**
    
    1. 📊 **SEARCH VOLUME IS #1 PRIORITY** - Not article wording!
       - PRIMARY: Only include 10,000+ monthly searches
       - SECONDARY: Focus on 1,000-15,000 monthly searches
       - LONG-TAIL: Target 500-5,000 monthly searches (popular long-tail)
    
    2. 🎯 **THINK LIKE SEMRUSH/AHREFS:**
       - Ask: "What are the BIGGEST searches in Bangladesh for this topic?"
       - NOT: "What exact words are in this article?"
       - Article = context. Search demand = target.
    
    3. ✅ **PRIMARY KEYWORDS (10,000+ searches):**
       - Broad terms: "gold price", "gold rate", "gold price today"
       - Geo-targeted: "Bangladesh gold price", "BD gold rate"
       - Commercial: "22 carat gold price", "gold buying price"
       - SIMPLE, POPULAR, BROAD = HIGH VOLUME
    
    4. ✅ **SECONDARY KEYWORDS (1,000-15,000 searches):**
       - Related popular topics: "silver price", "dollar rate"
       - Sub-topics: "gold investment", "gold market"
       - Specific popular: "18k gold price", "gold chart"
       - Check "People Also Search For" (proven demand)
    
    5. ✅ **LONG-TAIL (500-5,000 searches):**
       - Popular questions: "how to check gold purity", "where to buy gold"
       - Commercial long-tail: "gold price per bhori", "best gold shop"
       - Trending: "gold price prediction 2024", "gold investment guide"
       - ❌ AVOID random article sentences with <100 searches
    
    6. 🚫 **WHAT TO AVOID (LOW VOLUME):**
       - Academic phrases: "macroeconomic factors influencing commodity markets"
       - Technical jargon without search demand
       - Random article sentences: "domestic demand between 20-40 tonnes"
       - Long, specific phrases: "alignment with global market trends"
       - If search volume is <500/month → SKIP IT (unless extremely relevant)
    
    7. 📈 **PRIORITIZE:**
       - "Today" variations (gold price today - massive daily searches)
       - Simple broad terms (gold, gold price, gold rate)
       - Commercial intent (buying, selling, price, rate)
       - Questions with volume (how to, where to, when to)
       - Local variations (Bangladesh, Dhaka, BD)
    
    8. 🎪 **FEATURED SNIPPET OPPORTUNITIES:**
       - Target POPULAR questions (1,000+ searches)
       - "How to" questions with proven demand
       - "When to" timing questions
       - "Where to" location questions
    
    9. 🇧🇩 **BANGLADESH HIGH-VOLUME SEARCHES:**
       - Local units: "per bhori", "per vori"
       - Cities: "Dhaka", "Chittagong"
       - Abbreviations: "BD" (Bangladesh commonly abbreviated)
    
    10. 🔄 **SYNONYMS (ALL must have high volume):**
        - price = rate = cost (check which has higher volume)
        - gold = bullion (gold typically higher in Bangladesh)
        - buy = purchase = invest (buy usually highest)
    
    11. 🎯 **QUALITY CHECK:**
        - Does this keyword have 500+ monthly searches? If NO → SKIP
        - Is this a POPULAR search in Bangladesh? If NO → SKIP
        - Would MANY people search this? If NO → SKIP
    
    12. 🌐 **MISSION:**
        Find the HIGHEST search volume keywords related to this topic.
        Think: Keyword research tool, not content extractor.
    
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
        `AI response has invalid keyword counts. ` +
        `Expected: Target Focus (1-10), Supporting Topics (2-20), User Query Variations (3-30). ` +
        `Received: Target Focus (${counts.primary}), Supporting Topics (${counts.secondary}), User Queries (${counts.longtail}). ` +
        `This usually indicates the AI didn't extract enough keywords from the article. ` +
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