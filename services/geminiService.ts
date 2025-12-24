
// Fix: Import Chat instead of deprecated ChatSession and GenerativeModel
import { GoogleGenAI, Chat } from "@google/genai";
import { KnowledgeBaseData, KnowledgeConflict, ReviewItem, Sentiment, Message, ChatSessionRecord, EnquiryType } from "../types";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Uses gemini-3-pro-preview for high-reasoning chat interactions.
 * This is the "Brain" of Agent X.
 */
// Fix: Use Chat type instead of ChatSession
export const createAgentSession = async (
  systemInstruction: string
): Promise<Chat> => {
  const model = 'gemini-3-pro-preview';
  
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
    
    // Fix: Use gemini-3-flash-preview for basic text analysis
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
    // Fix: Use gemini-3-flash-preview for sentiment and topic extraction
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
 * Uses gemini-3-flash-preview with Google Search Grounding to research a company URL.
 * Returns structured JSON data about the business.
 */
export const analyzeCompanyContent = async (url: string): Promise<KnowledgeBaseData | null> => {
  try {
    // Fix: Use gemini-3-flash-preview for search grounding
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: `Research the business at the following URL: ${url}. 
      Use Google Search to find the latest information.
      
      CRITICAL: You MUST look for "Pricing", "Rates", "Cost", "Services", and "Cancellation Policy" or "Terms".
      
      Based on your research, return a VALID JSON object (do not use Markdown formatting like \`\`\`json) with the following structure:
      {
        "companyName": "The official name of the business",
        "website": "The official website URL found",
        "phoneNumber": "The primary phone number (if found, else null)",
        "businessCategory": "A short 2-3 word industry category",
        "keywords": ["array", "of", "5", "relevant", "keywords"],
        "summary": "A 2-sentence executive summary of what the business does",
        "services": ["array", "of", "specific", "services", "offered"],
        "businessHours": "A string describing open hours (or 'Not specified')",
        "contactInfo": "A string describing contact methods (email, address) (or 'Not specified')",
        "pricing": "A summarized text block of ANY pricing, starting rates, or packages found. If none found, return empty string.",
        "policies": "A summarized text block of cancellation policies, booking terms, or deposit requirements. If none found, return empty string."
      }
      
      Return ONLY the JSON object.`,
      config: {
        tools: [{googleSearch: {}}],
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
    console.error("Analysis failed", error);
    return null;
  }
};

/**
 * Analyzes raw text content (e.g. from uploaded files).
 */
export const analyzeRawText = async (textContext: string, fileName: string): Promise<KnowledgeBaseData | null> => {
    try {
        // Fix: Use gemini-3-flash-preview for text extraction
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
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
        // Fix: Use gemini-3-flash-preview for conflict detection
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
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
            model: 'gemini-3-pro-preview',
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
