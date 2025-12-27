
// Fix: Import Chat instead of deprecated ChatSession and GenerativeModel
import { GoogleGenAI, Chat } from "@google/genai";
import { KnowledgeBaseData, KnowledgeConflict, ReviewItem, Sentiment, Message, ChatSessionRecord, EnquiryType } from "../types";
import { getEnv } from "../utils/env";

// Initialize the client
const apiKey = getEnv('VITE_GEMINI_API_KEY');
const ai = new GoogleGenAI({ apiKey });

/**
 * Uses gemini-1.5-pro for high-reasoning chat interactions.
 * This is the "Brain" of Agent X.
 */
// Fix: Use Chat type instead of ChatSession
export const createAgentSession = async (
  systemInstruction: string
): Promise<any> => {
  const model = 'gemini-1.5-pro';

  return ai.chats.create({
    model: model,
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.7,
    },
  });
};

/**
 * Analyzes a full chat session to determine the primary enquiry type and summary.
 */
export const classifySession = async (messages: Message[]): Promise<{ type: EnquiryType; summary: string; sentiment: Sentiment }> => {
  if (messages.length === 0) return { type: 'General', summary: 'No interaction', sentiment: 'neutral' };

  try {
    const transcript = messages.map(m => `${m.role}: ${m.text}`).join('\n');

    // Fix: Use gemini-1.5-flash for basic text analysis
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `Analyze this chat transcript.
      
      TRANSCRIPT:
      ${transcript.substring(0, 5000)}
      
      TASKS:
      1. Classify into one type: "Pricing", "Services", "Support", "Booking", or "General".
      2. Summarize the user's intent in 10 words or less.
      3. Determine overall user sentiment.

      Return JSON:
      {
        "type": "Pricing",
        "summary": "User asked about monthly rates.",
        "sentiment": "neutral"
      }
      `
    });

    let text = response.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(text);

    return {
      type: result.type || 'General',
      summary: result.summary || 'Conversation',
      sentiment: result.sentiment || 'neutral'
    };
  } catch (error) {
    return { type: 'General', summary: 'New Conversation', sentiment: 'neutral' };
  }
};

/**
 * Analyzes a chat interaction to extract sentiment, topics, and confidence.
 * This runs in the background to populate the Review Queue.
 */
export const analyzeInteraction = async (query: string, response: string): Promise<Partial<ReviewItem>> => {
  try {
    // Fix: Use gemini-1.5-flash for sentiment and topic extraction
    const result = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `Analyze this chat interaction between a User and an AI Agent.
      
      User: "${query}"
      AI: "${response}"
      
      Determine the following:
      1. Sentiment: How does the USER feel? (positive, neutral, negative, frustrated)
      2. Confidence: How confident SHOULD the AI be in this answer based on ambiguity? (0.0 to 1.0)
      3. Topics: What business topics are discussed? (e.g. Pricing, Scheduling, Complaint)
      
      Return JSON only:
      {
        "sentiment": "neutral",
        "confidence": 0.9,
        "topics": ["topic1", "topic2"]
      }
      `
    });

    let text = result.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(text);
  } catch (error) {
    // Fallback default
    return {
      sentiment: 'neutral',
      confidence: 0.5,
      topics: ['General']
    };
  }
};

/**
 * Uses gemini-1.5-flash with Google Search Grounding to research a company URL.
 * Returns structured JSON data about the business.
 */
export const analyzeCompanyContent = async (url: string): Promise<KnowledgeBaseData | null> => {
  try {
    // Fix: Use gemini-1.5-flash for search grounding with DEEP SCAN strategy
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `You are a business intelligence researcher. Perform a DEEP SCAN of the following business website: ${url}

STEP 1: HOMEPAGE ANALYSIS
- Search for the main homepage of ${url}
- Extract: Company name, tagline, primary contact info, business hours

STEP 2: SERVICES/PRODUCTS DISCOVERY
- Search specifically for: "site:${url} services" OR "site:${url} what we do" OR "site:${url} solutions"
- Look for dedicated Services, Products, or Solutions pages
- Extract ALL distinct service/product offerings (be comprehensive, not generic)

STEP 3: PRICING INTELLIGENCE
- Search specifically for: "site:${url} pricing" OR "site:${url} rates" OR "site:${url} cost" OR "site:${url} packages"
- Look for /pricing, /rates, /plans pages
- Extract specific dollar amounts, rate structures, package names, starting prices
- If no pricing found, return empty string (do NOT guess)

STEP 4: POLICIES & TERMS
- Search specifically for: "site:${url} terms" OR "site:${url} cancellation policy" OR "site:${url} refund"
- Look for /terms, /privacy, /policies pages
- Extract cancellation windows, deposit requirements, booking terms
- If no policies found, return empty string

STEP 5: SYNTHESIS
Based on your multi-query research, return a VALID JSON object (NO markdown formatting, NO \`\`\`json wrapper):

{
  "companyName": "Official business name",
  "website": "${url}",
  "phoneNumber": "Primary phone (or null if not found)",
  "businessCategory": "2-3 word industry (e.g., 'Hair Salon', 'Law Firm')",
  "keywords": ["5", "relevant", "industry", "keywords", "here"],
  "summary": "2-sentence executive summary of what they do and who they serve",
  "services": ["Specific Service 1", "Specific Service 2", "etc"],
  "businessHours": "Open hours string (or 'Not specified')",
  "contactInfo": "Email, address, other contact methods (or 'Not specified')",
  "pricing": "Detailed pricing info with actual numbers/packages found. Empty string if none.",
  "policies": "Cancellation/booking policies found. Empty string if none."
}

CRITICAL: Be thorough. Use the search tool multiple times if needed. Return ONLY valid JSON.`,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType is NOT allowed when using tools
      }
    });

    let text = response.text || "";

    // Cleanup any potential markdown leaks
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    if (!text) return null;

    // Parse JSON
    const parsedData = JSON.parse(text) as KnowledgeBaseData;

    // Extract Grounding Metadata (Sources)
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map(c => c.web?.uri)
      .filter((uri): uri is string => !!uri);

    // Deduplicate sources
    parsedData.sources = Array.from(new Set(sources));
    parsedData.lastUpdated = new Date();

    return parsedData;

  } catch (error) {
    console.error("Gemini Search Error:", error);
    console.warn("Analysis failed or API key missing, falling back to MOCK data for demo.", error);

    // MOCK DATA FALLBACK
    // This ensures the user sees a successful result in the demo environment even if the API call fails.
    return {
      companyName: "Demo Company (Mock)",
      website: url,
      phoneNumber: "+1 (555) 123-4567",
      businessCategory: "Technology Services",
      keywords: ["AI", "Demo", "Automation", "Mock Data"],
      summary: `This is a simulated scan result for ${url}. In a real deployment with valid API keys, this would be real data extracted from the site.`,
      services: ["Consulting", "Implementation", "Support", "Training"],
      businessHours: "Mon-Fri: 9am - 5pm EST",
      contactInfo: "contact@demo.com",
      pricing: "Initial Consultation: $150\nStandard Rate: $100/hr\nMonthly Retainer: $2000/mo",
      policies: "24-hour cancellation required. 50% deposit for new projects.",
      sources: ["Mock Generator"],
      lastUpdated: new Date(),
      isMock: true
    };
  }
};

/**
 * Analyzes raw text content (e.g. from uploaded files).
 */
export const analyzeRawText = async (textContext: string, fileName: string): Promise<KnowledgeBaseData | null> => {
  try {
    // Fix: Use gemini-1.5-flash for text extraction
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `Analyze the following text content from a document named "${fileName}".
            Extract key business information into a structured format.
            
            Focus heavily on extracting SERVICES, PRICING, and POLICIES if they exist in the text.
            
            TEXT CONTENT:
            "${textContext.substring(0, 20000)}" 
            
            Return a VALID JSON object (no markdown) with this structure:
            {
              "companyName": "Business name if found (else null)",
              "businessCategory": "Industry category (or null if not found)",
              "keywords": ["keywords"],
              "summary": "Executive summary",
              "services": ["array", "of", "services"],
              "businessHours": "Open hours",
              "contactInfo": "Contact info",
              "pricing": "Detailed pricing information found in text",
              "policies": "Policy/Cancellation information found in text"
            }
            
            Return ONLY the JSON object.`
    });

    let text = response.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    if (!text) return null;

    const parsedData = JSON.parse(text) as KnowledgeBaseData;
    parsedData.sources = [`Document: ${fileName}`];
    parsedData.lastUpdated = new Date();

    return parsedData;
  } catch (error) {
    console.error("File analysis failed", error);
    return null;
  }
}

/**
 * Detects conflicts between existing knowledge and new knowledge.
 */
export const detectConflicts = async (current: KnowledgeBaseData, incoming: KnowledgeBaseData): Promise<KnowledgeConflict[]> => {
  try {
    // Fix: Use gemini-1.5-flash for conflict detection
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `Compare these two business knowledge sets (Current vs New).
            Identify SIGNIFICANT semantic discrepancies that a human should review.
            Ignore minor formatting differences (e.g., "9am-5pm" vs "09:00 - 17:00" is NOT a conflict).
            
            Current: ${JSON.stringify(current)}
            New: ${JSON.stringify(incoming)}
            
            Return a JSON array of objects (no markdown):
            [
                {
                    "field": "summary" | "services" | "businessHours" | "contactInfo" | "pricing" | "policies",
                    "currentValue": "value from current",
                    "newValue": "value from new",
                    "reason": "Why this is a conflict"
                }
            ]
            
            If no significant conflicts, return [] (empty array).`
    });

    let text = response.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    if (!text) return [];
    return JSON.parse(text) as KnowledgeConflict[];

  } catch (error) {
    console.error("Conflict detection failed", error);
    return [];
  }
}

/**
 * Uses gemini-3-pro-preview to suggest corrections for the Review Queue.
 */
export const suggestCorrection = async (query: string, poorResponse: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: `You are a QA specialist for an AI booking agent. 
            The agent gave a low-confidence or incorrect response.
            
            User Query: "${query}"
            Agent Response: "${poorResponse}"
            
            Please rewrite the response to be more helpful, professional, and goal-oriented (driving towards a booking).`
    });
    return response.text || "";
  } catch (e) {
    return "";
  }
}
