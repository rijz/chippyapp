import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold
} from "@google/generative-ai";
import { KnowledgeBaseData, KnowledgeConflict, ReviewItem, Sentiment, Message, EnquiryType } from "../types";
import { getEnv } from "../utils/env";

// ALWAYS use the proxy to keep the API key secure on the backend
// Never expose the API key in the browser for chat operations
const USE_PROXY = true;

// Initialize the client for non-chat operations (scanning, classification, etc.)
// These run in the authenticated app, not in public embeds
const apiKey = getEnv('VITE_GEMINI_API_KEY');
console.log('[GeminiService] Using proxy for chat:', USE_PROXY);
const genAI = new GoogleGenerativeAI(apiKey || '');

// Custom chat session implementation for proxy mode with Function Calling support
class ProxyChatSession {
  public history: any[] = []; // Made public to allow history restoration
  private systemInstruction: string;
  private tools: any[] = [];
  private toolExecutor?: (name: string, args: any) => Promise<any>;

  constructor(systemInstruction: string, tools?: any[], toolExecutor?: (name: string, args: any) => Promise<any>) {
    this.systemInstruction = systemInstruction;
    this.tools = tools || [];
    this.toolExecutor = toolExecutor;
  }

  /**
   * Restore conversation history from previous session
   */
  public restoreHistory(messages: Array<{ role: string, text: string }>) {
    this.history = messages.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));
  }

  async sendMessage(userMessage: string): Promise<{ response: { text: () => string } }> {
    this.history.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    // Build request with tools if available
    const requestBody: any = {
      system_instruction: {
        parts: [{ text: this.systemInstruction }]
      },
      contents: this.history,
      generationConfig: {
        temperature: 0.7,
      }
    };

    // Add tools if defined
    if (this.tools.length > 0) {
      requestBody.tools = this.tools;
    }

    let finalText = '';
    let maxIterations = 5; // Prevent infinite loops

    while (maxIterations > 0) {
      maxIterations--;

      const response = await fetch('/api-proxy/v1beta/models/gemini-2.0-flash:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate response');
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const content = candidate?.content;

      if (!content || !content.parts || content.parts.length === 0) {
        finalText = 'I encountered an error. Please try again.';
        break;
      }

      // Check if the response contains a function call
      const functionCallPart = content.parts.find((p: any) => p.functionCall);

      if (functionCallPart && this.toolExecutor) {
        const { name, args } = functionCallPart.functionCall;
        console.log(`[ProxyChatSession] Executing tool: ${name}`, args);

        // Execute the tool
        const toolResult = await this.toolExecutor(name, args);
        console.log(`[ProxyChatSession] Tool result:`, toolResult);

        // Add the model's function call to history
        this.history.push({
          role: 'model',
          parts: [{ functionCall: { name, args } }]
        });

        // Add the function response to history
        this.history.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name,
              response: toolResult
            }
          }]
        });

        // Update request body with new history for next iteration
        requestBody.contents = this.history;

      } else {
        // Regular text response - we're done
        finalText = content.parts.map((p: any) => p.text || '').join('');

        this.history.push({
          role: 'model',
          parts: [{ text: finalText }]
        });
        break;
      }
    }

    return {
      response: {
        text: () => finalText
      }
    };
  }
}

/**
 * Uses gemini-2.0-flash for high-performance interactions.
 * This is the "Brain" of Chippy.
 */
export const createAgentSession = async (
  systemInstruction: string,
  tools?: any[],
  toolExecutor?: (name: string, args: any) => Promise<any>
): Promise<any> => {
  // Use proxy in production, direct SDK in development
  if (USE_PROXY) {
    return new ProxyChatSession(systemInstruction, tools, toolExecutor);
  }

  if (!genAI) {
    throw new Error('Gemini API not initialized');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemInstruction,
  });

  return model.startChat({
    generationConfig: {
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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent(`Analyze this chat transcript.
      
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
      `);

    let text = result.response.text();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const json = JSON.parse(text);

    return {
      type: json.type || 'General',
      summary: json.summary || 'Conversation',
      sentiment: json.sentiment || 'neutral'
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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(`Analyze this chat interaction between a User and an AI Agent.
      
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
      `);

    let text = result.response.text();
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
 * Calls the server-side scraper to analyze a company website.
 * The backend uses Puppeteer to crawl the site and Gemini to structure the data.
 */
export const analyzeCompanyContent = async (url: string): Promise<KnowledgeBaseData | null> => {
  try {
    console.log(`[GeminiService] Calling /api/scrape for: ${url}`);

    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Scrape failed: ${response.status}`);
    }

    const data = await response.json() as KnowledgeBaseData;
    data.lastUpdated = new Date(); // Ensure it's a Date object

    console.log(`[GeminiService] Successfully received data for: ${data.companyName}`);
    return data;

  } catch (error: any) {
    console.error("Scraper API Error:", {
      message: error.message,
      name: error.name
    });
    console.warn("Server-side scraping failed, falling back to MOCK data for demo.");

    // MOCK FAILURE FALLBACK
    return {
      companyName: "Demo Company (Mock)",
      website: url,
      phoneNumber: "+1 (555) 123-4567",
      businessCategory: "Services",
      keywords: ["Mock", "Demo", "Fallback"],
      summary: `Simulation for ${url}. Real analysis failed: ${error.message}`,
      services: ["Demo Service A", "Demo Service B"],
      businessHours: "Mon-Fri: 9am - 5pm",
      contactInfo: "demo@example.com",
      pricing: "Standard Rate: $100/hr",
      policies: "24h Cancellation Policy",
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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(`Analyze the following text content from a document named "${fileName}".
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
            
            Return ONLY the JSON object.`);

    let text = result.response.text();
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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(`Compare these two business knowledge sets (Current vs New).
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
            
            If no significant conflicts, return [] (empty array).`);

    let text = result.response.text();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    if (!text) return [];
    return JSON.parse(text) as KnowledgeConflict[];

  } catch (error) {
    console.error("Conflict detection failed", error);
    return [];
  }
}

/**
 * Uses gemini-2.0-flash to suggest corrections for the Review Queue.
 */
export const suggestCorrection = async (query: string, poorResponse: string): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(`You are a QA specialist for an AI booking agent. 
            The agent gave a low-confidence or incorrect response.
            
            User Query: "${query}"
            Agent Response: "${poorResponse}"
            
            Please rewrite the response to be more helpful, professional, and goal-oriented (driving towards a booking).`);
    return result.response.text();
  } catch (e) {
    return "";
  }
}
