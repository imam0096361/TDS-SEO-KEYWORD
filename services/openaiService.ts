import OpenAI from 'openai';
import type { KeywordResult } from '../types';
import { detectLanguage, detectContentType, generatePrompt, generateBanglaPrompt, validateKeywordResult } from './geminiService';

// OpenAI API client (will be initialized with user's API key)
let openaiClient: OpenAI | null = null;

export const initializeOpenAI = (apiKey: string) => {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OpenAI API key is required. Get one from https://platform.openai.com/api-keys');
  }
  
  openaiClient = new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true // Required for client-side usage
  });
  
  console.log('OpenAI client initialized successfully');
};

export const generateKeywordsWithOpenAI = async (
  articleContent: string,
  useDeepAnalysis: boolean,
  apiKey: string
): Promise<KeywordResult> => {
  try {
    // Initialize OpenAI client with API key
    if (!openaiClient) {
      initializeOpenAI(apiKey);
    }
    
    if (!openaiClient) {
      throw new Error('OpenAI client not initialized. Please check your API key.');
    }
    
    // Detect language first
    const detectedLanguage = detectLanguage(articleContent);
    console.log("Detected language:", detectedLanguage);
    
    const contentType = await detectContentType(articleContent);
    
    // Use Bangla-specific prompt for Bangla/Mixed content
    const prompt = (detectedLanguage === 'bangla' || detectedLanguage === 'mixed')
      ? generateBanglaPrompt(articleContent, contentType, detectedLanguage)
      : generatePrompt(articleContent, contentType);
    
    console.log("Starting keyword generation with OpenAI...", { useDeepAnalysis, contentType });
    
    // Choose model based on analysis depth
    const model = useDeepAnalysis 
      ? 'gpt-4-turbo-preview' // Most powerful, best for deep analysis
      : 'gpt-3.5-turbo'; // Fast and efficient
    
    console.log(`Using OpenAI model: ${model}`);
    
    // Call OpenAI API
    const response = await openaiClient.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a world-class SEO keyword research specialist. You must respond with ONLY valid JSON, no markdown, no explanations, just pure JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2, // Low temperature for consistent, focused output
      max_tokens: useDeepAnalysis ? 4096 : 2048,
      response_format: { type: "json_object" }, // Force JSON output
    });
    
    console.log("OpenAI response received");
    
    // Extract text from response
    const text = response.choices[0]?.message?.content;
    
    if (!text) {
      console.error("Empty response from OpenAI");
      throw new Error("Received empty response from OpenAI. Please try again.");
    }
    
    console.log("Extracted text:", text.substring(0, 200));
    
    // Robust JSON extraction with multiple fallback strategies
    let jsonText = text.trim();
    let parsedResult: any;
    
    // Strategy 1: Already pure JSON
    if (!jsonText.startsWith('{')) {
      console.log("JSON not at start, trying extraction strategies...");
      
      // Strategy 2: Extract from markdown code blocks (```json ... ```)
      const jsonBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch && jsonBlockMatch[1]) {
        jsonText = jsonBlockMatch[1].trim();
        console.log("Extracted from markdown block");
      } else {
        // Strategy 3: Find first { to last } (embedded JSON)
        const objectMatch = jsonText.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonText = objectMatch[0];
          console.log("Extracted embedded JSON object");
        } else {
          // Strategy 4: Look for JSON after common prefixes
          const afterPrefixMatch = jsonText.match(/(?:Here's|Here is|Output:|Result:)?\s*(\{[\s\S]*\})/i);
          if (afterPrefixMatch && afterPrefixMatch[1]) {
            jsonText = afterPrefixMatch[1];
            console.log("Extracted JSON after prefix");
          } else {
            throw new SyntaxError("The AI did not return valid JSON. This is a format error.");
          }
        }
      }
    }
    
    // Parse JSON with detailed error reporting
    try {
      parsedResult = JSON.parse(jsonText);
      console.log("JSON parsed successfully");
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
      console.error("JSON parsing failed:", errorMsg);
      console.error("Failed JSON text:", jsonText.substring(0, 500));
      throw new SyntaxError(`Failed to parse AI response as JSON. ${errorMsg}. The AI may have returned text instead of pure JSON. Please try again.`);
    }
    
    // Validate the structure and content
    const validationResult = validateKeywordResult(parsedResult);
    
    if (!validationResult.isValid) {
      console.error("Validation failed:", validationResult.errors);
      throw new Error(
        `OpenAI returned incomplete keyword data:\n\n${validationResult.errors.join('\n')}\n\n` +
        `This usually means the article is too short or the AI needs more context. ` +
        `Try using "Deep Analysis Mode" for better results, or ensure your article is at least 200+ words.`
      );
    }
    
    console.log("Keyword generation successful!", {
      primary: parsedResult.primary?.length || 0,
      secondary: parsedResult.secondary?.length || 0,
      longtail: parsedResult.longtail?.length || 0,
      detectedLanguage: parsedResult.detectedLanguage || detectedLanguage
    });
    
    // Add detected language if not present
    if (!parsedResult.detectedLanguage) {
      parsedResult.detectedLanguage = detectedLanguage;
    }
    
    return parsedResult as KeywordResult;
    
  } catch (error) {
    console.error('Error in OpenAI keyword generation:', error);
    
    // Enhanced error messages for common issues
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error(
          'OpenAI API Key Error: Invalid or missing API key. ' +
          'Please check your API key at https://platform.openai.com/api-keys'
        );
      }
      if (error.message.includes('quota')) {
        throw new Error(
          'OpenAI Quota Exceeded: You have exceeded your API usage quota. ' +
          'Check your usage at https://platform.openai.com/usage'
        );
      }
      if (error.message.includes('rate limit')) {
        throw new Error(
          'OpenAI Rate Limit: Too many requests. Please wait a moment and try again.'
        );
      }
    }
    
    throw error;
  }
};

// Export the prompt generators for reuse
export { detectLanguage, detectContentType, generatePrompt, generateBanglaPrompt };

