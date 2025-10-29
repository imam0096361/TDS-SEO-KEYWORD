import React, { useState, useCallback, useRef } from 'react';
import { generateKeywords } from './services/geminiService';
import type { KeywordResult } from './types';
import { KeywordCard } from './components/KeywordCard';
import Loader from './components/Loader';
import { SparklesIcon } from './components/icons';

const App: React.FC = () => {
  const [articleContent, setArticleContent] = useState('');
  const [articleUrl, setArticleUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KeywordResult | null>(null);
  const [useDeepAnalysis, setUseDeepAnalysis] = useState(false);
  
  // Ref to track and cancel in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Calculates a 'content score' for a given HTML element.
   * The score is based on paragraph length, link density, and other heuristics
   * to identify the most likely container of the main article content.
   */
  const calculateScore = (element: HTMLElement): number => {
      let score = 0;
      const classAndIdString = (element.className + ' ' + element.id).toLowerCase();
      
      if (/comment|share|related|ad|footer|header|menu|nav|sidebar|promo|social|widget/.test(classAndIdString)) {
          return -100;
      }

      element.querySelectorAll('p, li, blockquote, pre').forEach(p => {
          if (p.textContent && p.textContent.trim().length > 25) {
              score += p.textContent.trim().length;
          }
      });

      score += (element.textContent?.match(/,/g) || []).length * 10;

      const linkTextLength = Array.from(element.querySelectorAll('a'))
                                   .reduce((len, a) => len + (a.textContent?.length || 0), 0);
      const totalTextLength = element.textContent?.length || 1;
      const linkDensity = linkTextLength / totalTextLength;
      
      if (linkDensity > 0.35) {
          score *= (1 - linkDensity);
      }

      return score;
  };

  /**
   * Extracts text from content-bearing elements within a container.
   * It iterates through block-level tags to build a clean string representation.
   */
  const extractCleanText = (element: HTMLElement): string => {
      let text = '';
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT, null);
      let currentNode = walker.nextNode();
      
      while (currentNode) {
          // Ensure it's an Element node before casting
          if (currentNode.nodeType === Node.ELEMENT_NODE) {
              const el = currentNode as HTMLElement;
              const tagName = el.tagName?.toLowerCase();
              
              if (tagName && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre'].includes(tagName)) {
                  const blockText = el.innerText?.trim();
                  if (blockText) {
                      text += blockText + '\n\n';
                  }
              }
          }
          currentNode = walker.nextNode();
      }
      return text.trim().replace(/(\n\s*){3,}/g, '\n\n');
  };

  const handleFetchAndGenerate = useCallback(async () => {
    if (!articleUrl.trim()) {
      setError("Please enter a valid URL.");
      return;
    }
    
    // Cancel previous request if still in progress
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const controller = abortControllerRef.current;
    
    setIsLoading(true);
    setError(null);
    setResult(null);
    setArticleContent('');

    // Setup timeout
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      // --- Start of Fetching Logic ---
      // Validate URL format
      try {
        new URL(articleUrl);
      } catch (urlError) {
        throw new Error("Invalid URL format. Please enter a valid web address starting with http:// or https://");
      }
      
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(articleUrl)}`;
      const response = await fetch(proxyUrl, { 
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch article (Status ${response.status}). The URL may be inaccessible or blocked.`);
      }
      
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      doc.querySelectorAll('script, style, nav, header, footer, aside, form, noscript, svg, [aria-hidden="true"]').forEach(el => el.remove());
      
      const title = (doc.querySelector('h1')?.innerText || doc.title).trim();

      let bestElement: HTMLElement = doc.body;
      let bestScore = -1;

      const candidates = doc.querySelectorAll('article, main, div[class*="content"], div[class*="post"], div[id*="content"], div[id*="post"]');
      const elementsToScore: HTMLElement[] = candidates.length > 0 ? Array.from(candidates) as HTMLElement[] : [doc.body];

      elementsToScore.forEach(element => {
          const score = calculateScore(element);
          if (score > bestScore) {
              bestScore = score;
              bestElement = element;
          }
      });
      
      let content = extractCleanText(bestElement);
      
      if (content.length < 300) {
          console.warn("Structured text extraction was short, falling back to innerText.");
          content = bestElement.innerText.trim();
      }

      const cleanedContent = content.replace(/(\r\n|\n|\r){3,}/gm, '\n\n');
      const fetchedContent = `${title}\n\n${cleanedContent}`;

      if (fetchedContent.trim().length < 500) {
        throw new Error("Article content is too short for accurate analysis (minimum 500 characters required). The extraction may have failed.");
      }

      setArticleContent(fetchedContent);
      // --- End of Fetching Logic ---

      // --- Start of Generation Logic ---
      const generatedResult = await generateKeywords(fetchedContent, useDeepAnalysis);
      setResult(generatedResult);
      // --- End of Generation Logic ---

    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Error in fetch and generate process:", err);
      
      if (err instanceof Error) {
        // Handle specific error types
        if (err.name === 'AbortError') {
          setError('Request timed out after 30 seconds. Please try again or check the URL.');
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          setError('Network error: Unable to reach the article URL. Please check the URL and your internet connection.');
        } else {
          setError(err.message);
        }
      } else {
        setError("An unknown error occurred during the process.");
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [articleUrl, useDeepAnalysis]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!articleContent.trim()) {
      setError("Please paste or fetch your article draft before generating keywords.");
      return;
    }
    
    if (articleContent.trim().length < 500) {
      setError("Article content is too short for accurate analysis (minimum 500 characters required).");
      return;
    }
    
    setError(null);
    setIsLoading(true);
    setResult(null);

    try {
      const generatedResult = await generateKeywords(articleContent, useDeepAnalysis);
      setResult(generatedResult);
    } catch (err) {
      console.error("Error generating keywords:", err);
      if (err instanceof Error) {
        if (err.message.includes('API_KEY')) {
          setError('API Key not configured. Please set your GEMINI_API_KEY in the .env.local file.');
        } else if (err.message.includes('parse') || err.message.includes('JSON')) {
          setError('Failed to parse AI response. The AI returned an invalid format. Please try again.');
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          setError('Network error: Unable to connect to the AI service. Please check your internet connection.');
        } else {
          setError(err.message);
        }
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [articleContent, useDeepAnalysis]);

  return (
    <div className="min-h-screen bg-brand-bg text-gray-200 font-sans">
      <main className="container mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex flex-col items-center justify-center gap-6">
            {/* Logo Container with Professional Background */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-2xl rounded-full"></div>
              <div className="relative bg-white rounded-2xl px-8 py-5 shadow-2xl border-2 border-gray-100">
                <img 
                  src="https://upload.wikimedia.org/wikipedia/commons/1/1a/Logo_of_The_Daily_Star.svg" 
                  alt="The Daily Star Logo" 
                  className="h-12 md:h-16 w-auto"
                />
              </div>
            </div>
            
            {/* Title Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <div className="h-px w-8 bg-gradient-to-r from-transparent to-blue-500"></div>
                <SparklesIcon className="w-5 h-5 text-blue-400 animate-pulse" />
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
                  AI Keyword Strategist
                </h1>
                <SparklesIcon className="w-5 h-5 text-blue-400 animate-pulse" />
                <div className="h-px w-8 bg-gradient-to-l from-transparent to-blue-500"></div>
              </div>
              
              <p className="text-sm md:text-base text-gray-400 max-w-2xl mx-auto">
                <span className="inline-flex items-center gap-2 bg-gray-800/50 px-4 py-2 rounded-full border border-gray-700">
                  <span className="text-blue-400">🇬🇧 English</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-green-400">🇧🇩 বাংলা</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-purple-400">SEO Optimized</span>
                </span>
              </p>
              
              <p className="text-xs text-gray-500 italic">
                Powered by Google Gemini AI • Developed by DS IT
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-12">
          {/* Input Section */}
          <div className="bg-brand-card border border-brand-border rounded-xl shadow-2xl p-6 h-fit">
            <form onSubmit={handleSubmit}>
              {/* URL Input */}
              <div>
                <h2 className="text-xl font-bold mb-1">Quick Input</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Fetch and analyze an article directly from a public URL.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={articleUrl}
                    onChange={(e) => { setArticleUrl(e.target.value); setError(null); }}
                    placeholder="https://www.thedailystar.net/..."
                    className="flex-grow p-3 bg-brand-bg border border-brand-border rounded-md focus:ring-2 focus:ring-brand-primary focus:outline-none transition-all"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={handleFetchAndGenerate}
                    disabled={isLoading || !articleUrl.trim()}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-secondary text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-500 transition-all disabled:bg-gray-600 disabled:cursor-not-allowed"
                  >
                    {isLoading && (
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {isLoading ? 'Analyzing...' : 'Fetch & Analyze'}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-brand-border"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-brand-card px-3 text-sm font-semibold uppercase text-gray-500">Or</span>
                </div>
              </div>

              {/* Manual Input */}
              <div>
                <h2 className="text-xl font-bold mb-1">Manual Input</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Paste your full article draft below.
                </p>
                <textarea
                  value={articleContent}
                  onChange={(e) => setArticleContent(e.target.value)}
                  placeholder="Your fetched or pasted article content will appear here..."
                  className="w-full h-80 p-4 bg-brand-bg border border-brand-border rounded-md focus:ring-2 focus:ring-brand-primary focus:outline-none transition-all resize-y"
                  disabled={isLoading}
                ></textarea>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <label className="flex items-center cursor-pointer select-none">
                  <span className="mr-3 text-sm font-medium text-gray-300">Deep Analysis</span>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      checked={useDeepAnalysis}
                      onChange={() => setUseDeepAnalysis(!useDeepAnalysis)}
                      className="sr-only"
                      disabled={isLoading}
                    />
                    <div className={`block w-14 h-8 rounded-full transition ${useDeepAnalysis ? 'bg-brand-primary' : 'bg-brand-border'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${useDeepAnalysis ? 'transform translate-x-6' : ''}`}></div>
                  </div>
                </label>
                <button
                  type="submit"
                  disabled={isLoading || !articleContent.trim()}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-primary text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  <SparklesIcon className="w-5 h-5"/>
                  {isLoading ? 'Analyzing...' : 'Generate Keywords'}
                </button>
              </div>
               <p className="text-xs text-gray-500 mt-2 text-center sm:text-left">
                  {useDeepAnalysis ? "Using Gemini 2.5 Pro (Deep thinking, best quality)" : "Using Gemini 2.0 Flash (Fast, efficient)"}
                </p>
            </form>
          </div>

          {/* Output Section */}
          <div className="mt-10 lg:mt-0">
            {isLoading && <Loader />}
            {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg">{error}</div>}
            
            {!isLoading && !error && !result && (
              <div className="text-center p-8 bg-brand-card/50 border-2 border-dashed border-brand-border rounded-lg">
                <h3 className="text-lg font-semibold text-gray-300">Your Keyword Strategy Awaits</h3>
                <p className="text-gray-500 mt-1">Enter your article draft to reveal AI-powered keyword suggestions.</p>
              </div>
            )}

            {result && (
              <div className="space-y-6">
                {/* Language Detection Badge */}
                {result.detectedLanguage && (
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                    result.detectedLanguage === 'bangla' ? 'bg-green-900/50 text-green-300 border-2 border-green-500/50' :
                    result.detectedLanguage === 'mixed' ? 'bg-purple-900/50 text-purple-300 border-2 border-purple-500/50' :
                    'bg-blue-900/50 text-blue-300 border-2 border-blue-500/50'
                  }`}>
                    {result.detectedLanguage === 'bangla' ? '🇧🇩 বাংলা Content Detected' :
                     result.detectedLanguage === 'mixed' ? '🔄 Bilingual (Banglish) Content' :
                     '🇬🇧 English Content'}
                  </div>
                )}

                {/* SEO Score & Meta Tags - Priority Section */}
                {result.seoScore && (
                  <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 border-2 border-blue-500/50 rounded-xl shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-blue-300">📊 SEO Performance Score</h3>
                      <div className="text-4xl font-extrabold text-blue-400">{result.seoScore}/100</div>
                    </div>
                    <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${result.seoScore >= 80 ? 'bg-green-500' : result.seoScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${result.seoScore}%` }}
                      ></div>
                    </div>
                    {result.detectedLanguage === 'bangla' && (
                      <p className="mt-2 text-xs text-green-300">✨ Bangla content bonus: Featured Snippets are 70% less competitive!</p>
                    )}
                  </div>
                )}

                {/* Meta Tags - Critical for SERP - Bilingual Support */}
                {(result.metaTitle || result.metaDescription || result.metaTitleBangla || result.metaDescriptionBangla) && (
                  <div className="bg-brand-card border border-green-500/50 rounded-xl shadow-lg p-5">
                    <h3 className="text-lg font-bold text-green-400 mb-3 flex items-center gap-2">
                      🎯 Meta Tags (Copy to CMS)
                      {result.detectedLanguage === 'bangla' && <span className="text-xs bg-green-900/50 px-2 py-1 rounded">বাংলা + English</span>}
                    </h3>
                    
                    {/* Bangla Meta Tags (if available) */}
                    {result.metaTitleBangla && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                          <span>🇧🇩 Bangla Meta Title ({result.metaTitleBangla.length} chars)</span>
                        </div>
                        <div className="bg-brand-bg p-3 rounded border border-green-500/30">
                          <code className="text-green-300 text-sm" style={{fontFamily: "'SolaimanLipi', 'Kalpurush', 'Noto Sans Bengali', sans-serif"}}>{result.metaTitleBangla}</code>
                        </div>
                      </div>
                    )}
                    {result.metaTitleBangla && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                          <span>🇬🇧 English Meta Title ({result.metaTitle?.length || 0} chars)</span>
                        </div>
                        <div className="bg-brand-bg p-3 rounded border border-brand-border">
                          <code className="text-green-300 text-sm">{result.metaTitle}</code>
                        </div>
                      </div>
                    )}
                    
                    {/* Show only English if no Bangla */}
                    {!result.metaTitleBangla && result.metaTitle && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-400 mb-1">Meta Title ({result.metaTitle.length} chars)</div>
                        <div className="bg-brand-bg p-3 rounded border border-brand-border">
                          <code className="text-green-300 text-sm">{result.metaTitle}</code>
                        </div>
                      </div>
                    )}
                    
                    {result.metaDescriptionBangla && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-400 mb-1">🇧🇩 Bangla Meta Description ({result.metaDescriptionBangla.length} chars)</div>
                        <div className="bg-brand-bg p-3 rounded border border-green-500/30">
                          <code className="text-green-300 text-sm" style={{fontFamily: "'SolaimanLipi', 'Kalpurush', 'Noto Sans Bengali', sans-serif"}}>{result.metaDescriptionBangla}</code>
                        </div>
                      </div>
                    )}
                    {result.metaDescription && (
                      <div>
                        <div className="text-xs text-gray-400 mb-1">{result.metaDescriptionBangla ? '🇬🇧 English Meta Description' : 'Meta Description'} ({result.metaDescription.length} chars)</div>
                        <div className="bg-brand-bg p-3 rounded border border-brand-border">
                          <code className="text-green-300 text-sm">{result.metaDescription}</code>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Content Type */}
                <div className="bg-brand-card border border-brand-border rounded-xl shadow-lg p-5">
                    <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-1">Detected Content Type</h3>
                    <p className="text-lg font-bold text-gray-200">{result.contentType}</p>
                </div>

                {/* Competitor Insights */}
                <div className="bg-brand-card border border-brand-border rounded-xl shadow-lg p-5">
                  <h3 className="text-lg font-bold text-purple-400 mb-2">🔍 Competitor Gap Analysis</h3>
                  <p className="text-sm text-gray-300">{result.competitorInsights}</p>
                </div>
                
                <KeywordCard 
                  title="Primary Keywords (3-5)" 
                  keywords={result.primary} 
                  color="text-blue-400" 
                  tooltipText="1-3 word phrases representing the article's core topics. High search volume, broad intent. Includes headline topic and main themes."
                />
                <KeywordCard 
                  title="Secondary Keywords (8-12)" 
                  keywords={result.secondary} 
                  color="text-green-400" 
                  tooltipText="2-5 word phrases covering all major entities, people, places, organizations, and concepts. Medium search volume, specific intent."
                />
                <KeywordCard 
                  title="Long-tail Keywords (10-15)" 
                  keywords={result.longtail} 
                  color="text-yellow-400" 
                  tooltipText="4+ word phrases mirroring actual user search queries. Low search volume, high conversion intent. Verbatim from article."
                />

                {/* Advanced SEO Features */}
                {result.lsiKeywords && result.lsiKeywords.length > 0 && (
                  <KeywordCard 
                    title="LSI Keywords (Semantic SEO)" 
                    keywords={result.lsiKeywords} 
                    color="text-cyan-400" 
                    tooltipText="Latent Semantic Indexing keywords. Terms Google expects to see with your main keywords. Proves topical authority to BERT/MUM algorithms."
                  />
                )}

                {result.questionKeywords && result.questionKeywords.length > 0 && (
                  <KeywordCard 
                    title="Question Keywords (PAA Optimization)" 
                    keywords={result.questionKeywords} 
                    color="text-pink-400" 
                    tooltipText="Question-based keywords targeting Google's People Also Ask (PAA) boxes and voice search. Each question is a Featured Snippet opportunity."
                  />
                )}

                {result.entities && result.entities.length > 0 && (
                  <KeywordCard 
                    title="Named Entities (Knowledge Graph)" 
                    keywords={result.entities} 
                    color="text-orange-400" 
                    tooltipText="Named entities extracted from your article. Connects to Google Knowledge Graph for E-E-A-T signals and entity-based SEO."
                  />
                )}

                {/* SERP Feature Targets */}
                {result.serpFeatureTargets && result.serpFeatureTargets.length > 0 && (
                  <div className="bg-brand-card border border-yellow-500/50 rounded-xl shadow-lg p-5">
                    <h3 className="text-lg font-bold text-yellow-400 mb-3">🎯 SERP Feature Opportunities</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.serpFeatureTargets.map((feature, index) => (
                        <span key={index} className="bg-yellow-900/30 text-yellow-300 px-3 py-1 rounded-full text-sm border border-yellow-500/50">
                          {feature}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-3">These are Google SERP features your article can compete for. Optimize content for these to increase visibility.</p>
                  </div>
                )}

                {/* Local SEO Signals */}
                {result.localSeoSignals && result.localSeoSignals.length > 0 && (
                  <div className="bg-brand-card border border-teal-500/50 rounded-xl shadow-lg p-5">
                    <h3 className="text-lg font-bold text-teal-400 mb-3">🇧🇩 Bangladesh Local SEO Signals</h3>
                    <ul className="space-y-2 text-sm text-gray-300">
                      {result.localSeoSignals.map((signal, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-teal-400 mt-1">▸</span>
                          <span>{signal}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Bangla Search Insights */}
                {result.banglaSearchInsights && (
                  <div className="bg-gradient-to-r from-green-900/30 to-teal-900/30 border border-green-500/50 rounded-xl shadow-lg p-5">
                    <h3 className="text-lg font-bold text-green-400 mb-3 flex items-center gap-2">
                      🇧🇩 বাংলা Search Behavior Insights
                    </h3>
                    <p className="text-sm text-gray-300" style={{fontFamily: "'SolaimanLipi', 'Kalpurush', 'Noto Sans Bengali', sans-serif"}}>
                      {result.banglaSearchInsights}
                    </p>
                  </div>
                )}

                {/* Transliteration Guide */}
                {result.transliterationGuide && (
                  <div className="bg-brand-card border border-purple-500/50 rounded-xl shadow-lg p-5">
                    <h3 className="text-lg font-bold text-purple-400 mb-3">📝 Bangla-English Transliteration Guide</h3>
                    <div className="bg-brand-bg p-3 rounded border border-brand-border">
                      <code className="text-purple-300 text-sm whitespace-pre-wrap" style={{fontFamily: "'SolaimanLipi', 'Kalpurush', 'Noto Sans Bengali', 'Courier New', monospace"}}>
                        {result.transliterationGuide}
                      </code>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Use these transliterations for URL slugs, tags, and English-speaking audiences.</p>
                  </div>
                )}

                {result.searchReferences && result.searchReferences.length > 0 && (
                  <div className="bg-brand-card border border-brand-border rounded-xl shadow-lg p-5">
                    <h3 className="text-lg font-bold text-gray-300 mb-3">🔗 AI Search References</h3>
                    <ul className="space-y-2 text-sm">
                      {result.searchReferences.map((ref, index) => (
                        ref.web && (
                          <li key={index}>
                            <a href={ref.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">
                              {ref.web.title || ref.web.uri}
                            </a>
                          </li>
                        )
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Copyright Footer */}
      <footer className="mt-12 pt-6 border-t border-gray-200">
        <p className="text-center text-sm text-gray-600">
          © {new Date().getFullYear()} Developed by <span className="font-semibold text-blue-600">DS IT</span> - The Daily Star
        </p>
      </footer>
    </div>
  );
};

export default App;