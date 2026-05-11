
import { LLMProvider, ChatMessage } from '../ai/interfaces/LLMProvider';
import { GeminiProvider } from '../ai/providers/GeminiProvider';
import { KnowledgeBaseData, ReviewItem, Sentiment, Message, EnquiryType } from "../types";
import { bdlService } from "./bdlService";
import { getEnv } from "../utils/env";

// Default configuration
const DEFAULT_RISK_LEVEL = 'low';
const USE_PROXY = true; // Still defaults to proxy for safety

export interface AgentContext {
    userId: string;
    sessionId: string;
}

export interface AgentOptions {
    riskLevel?: 'low' | 'high';
    provider?: LLMProvider;
}

export class AgentSession {
    public history: ChatMessage[] = [];
    private systemInstruction: string;
    private tools: any[] = [];
    private toolExecutor?: (name: string, args: any) => Promise<any>;
    private context?: AgentContext;
    private provider: LLMProvider;

    constructor(
        provider: LLMProvider,
        systemInstruction: string,
        tools?: any[],
        toolExecutor?: (name: string, args: any) => Promise<any>,
        context?: AgentContext
    ) {
        this.provider = provider;
        this.systemInstruction = systemInstruction;
        this.tools = tools || [];
        this.toolExecutor = toolExecutor;
        this.context = context;
    }

    public restoreHistory(messages: Array<{ role: string, text: string }>) {
        this.history = messages.map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user',
            content: msg.text
        }));
    }

    async sendMessage(userMessage: string): Promise<{ response: { text: () => string } }> {
        // 1. RECALL MEMORIES (RAG)
        let contextAugmentation = '';
        if (this.context?.userId && this.context?.sessionId) {
            try {
                // Dynamic import to avoid circular dependencies if any
                const { memoryService } = await import('./memoryService');
                const memories = await memoryService.recall(
                    this.context.userId,
                    userMessage,
                    this.context.sessionId
                );

                if (memories.length > 0) {
                    contextAugmentation = `\n\nRELEVANT MEMORIES (Use these facts to answer):\n${memories.map(m => `- ${m.content}`).join('\n')}`;
                    console.log('[RAG] Injected memories:', memories.length);
                }
            } catch (e) {
                console.warn('[RAG] Memory recall failed', e);
            }
        }

        const effectiveUserMessage = userMessage + contextAugmentation;

        // Add user message to history
        this.history.push({
            role: 'user',
            content: effectiveUserMessage
        });

        let finalText = '';
        let maxIterations = 5;

        // Prepare initial messages with system instruction
        // Note: Some providers support system messages, others (like Gemini) prefer it in config or first message
        // For generic provider, we might prepend system message if supported, or rely on provider specific config.
        // For now, we'll prepend as a 'system' role or just keep it separate if the provider supports it separately.
        // Our LLMProvider interface is simple. Let's prepend it as system message for now, 
        // knowing GeminiProvider might need to adapt if it handles system instructions differently (it does, via config).
        // Actually, our GeminiProvider doesn't use the system instruction from the messages list in `generateAuthoredContent`?
        // Wait, `GeminiProvider` implementation I wrote takes `generationConfig`. It does NOT take `systemInstruction` in `generateAuthoredContent`.
        // I need to fix `GeminiProvider` or pass system instruction in the message history as 'system' role.
        // Gemini API supports `system_instruction` field.

        // Strategy: Prepend system instruction to the messages sent to provider.
        // But `GeminiProvider` implementation maps `system` role? No.
        // Let's assume for now we pass it as a user message or we fix the provider.
        // Fixing the provider is better. But for now, let's treat strictly as message history.
        // Actually, for Gemini, system instruction is best passed in initialization or config.
        // BUT my `LLMProvider` interface doesn't have a `systemInstruction` in `generateAuthoredContent`.

        // Workaround: Add it as the first 'system' message.
        // `GeminiProvider` should be smart enough to extract 'system' role if it exists.

        const currentMessages = [
            { role: 'system' as const, content: this.systemInstruction },
            ...this.history
        ];

        while (maxIterations > 0) {
            maxIterations--;

            const response = await this.provider.generateAuthoredContent(currentMessages);

            if (response.functionCall && this.toolExecutor) {
                const { name, args } = response.functionCall;

                // Execute tool
                const toolResult = await this.toolExecutor(name, args);

                // Add model's function call to history
                this.history.push({
                    role: 'model',
                    content: '',
                    functionCall: { name, args }
                });

                // Add function response to history
                // Note: Standardize function response message format?
                // Our generic ChatMessage allows 'function' role.
                this.history.push({
                    role: 'function',
                    content: JSON.stringify(toolResult),
                    name: name
                });

                // Update conversation for next iteration
                currentMessages.push({
                    role: 'model', // function call representation in history
                    content: '',
                    functionCall: { name, args }
                });
                currentMessages.push({
                    role: 'function', // function response
                    content: JSON.stringify(toolResult),
                    name: name
                });

            } else {
                finalText = response.content;
                this.history.push({
                    role: 'model',
                    content: finalText
                });

                // 2. MEMORIZE (LEARNING) - Background Task
                if (this.context?.userId && finalText) {
                    this.learnFromInteraction(userMessage, finalText).catch(e => console.error('[Learning] Failed:', e));
                }

                break;
            }
        }

        return {
            response: {
                text: () => finalText
            }
        };
    }

    private async learnFromInteraction(userMsg: string, aiMsg: string) {
        if (!this.context) return;
        if (userMsg.length < 10) return;

        try {
            const { memoryService } = await import('./memoryService');
            const facts: string[] = [];

            const emailMatch = userMsg.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
            if (emailMatch) facts.push(`User email: ${emailMatch[0]}`);

            const phoneMatch = userMsg.match(/(\+?\d[\d\s().-]{7,}\d)/);
            if (phoneMatch) facts.push(`User phone: ${phoneMatch[0]}`);

            const nameMatch = userMsg.match(/\bmy name is\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/i);
            if (nameMatch) facts.push(`User name: ${nameMatch[1]}`);

            const companyMatch = userMsg.match(/\bmy (company|business) is\s+([A-Z][\w&' -]{1,60})/i);
            if (companyMatch) facts.push(`User company: ${companyMatch[2].trim()}`);

            if (facts.length === 0) return;

            for (const fact of facts) {
                await memoryService.memorize(this.context.userId, fact, this.context.sessionId, 'session');
            }
        } catch (e) {
            // ignore
        }
    }
}

/**
 * Factory for Agent Sessions
 */
export const createAgentSession = async (
    systemInstruction: string,
    tools?: any[],
    toolExecutor?: (name: string, args: any) => Promise<any>,
    context?: AgentContext,
    options?: AgentOptions
): Promise<AgentSession> => {

    let provider = options?.provider;

    if (!provider) {
        // Default to Gemini
        const apiKey = getEnv('VITE_GEMINI_API_KEY');
        const model = options?.riskLevel === 'high'
            ? (getEnv('VITE_GEMINI_MODEL_HIGH_RISK') || 'gemini-2.0-flash')
            : (getEnv('VITE_GEMINI_MODEL_LOW_RISK') || 'gemini-2.0-flash');

        provider = new GeminiProvider({
            model,
            useProxy: USE_PROXY,
            apiKey
        });
    }

    return new AgentSession(provider, systemInstruction, tools, toolExecutor, context);
};

/**
 * BDL-aware session factory
 */
export const createBdlAgentSession = async (
    systemInstruction: string,
    tools?: any[],
    toolExecutor?: (name: string, args: any) => Promise<any>,
    context?: AgentContext,
    options?: AgentOptions
): Promise<AgentSession> => {
    let bdlContext = '';

    if (context?.userId) {
        try {
            const [memory, faq] = await Promise.all([
                bdlService.getBusinessMemory(context.userId),
                bdlService.getTenantFaq(context.userId, 100)
            ]);

            const memoryBlock = memory?.bmsText
                ? `BEGIN BUSINESS MEMORY\n${memory.bmsText}\nEND BUSINESS MEMORY`
                : 'BEGIN BUSINESS MEMORY\nNo business memory available.\nEND BUSINESS MEMORY';

            const faqLines = (faq || []).map(entry => `- Q: ${entry.question}\n  A: ${entry.answer}`);
            const faqBlock = faqLines.length > 0
                ? `BEGIN TENANT FAQ\n${faqLines.join('\n')}\nEND TENANT FAQ`
                : 'BEGIN TENANT FAQ\nNo tenant FAQ available.\nEND TENANT FAQ';

            bdlContext = `\n\nBDL CONTEXT (AUTHORITATIVE):\n${memoryBlock}\n\n${faqBlock}\n\nUse the BDL context as the primary source of truth. If the answer is missing, ask a clarification question instead of guessing.`;
        } catch (error) {
            console.warn('[BDL] Failed to load memory/FAQ', error);
        }
    }

    return createAgentSession(`${systemInstruction}${bdlContext}`, tools, toolExecutor, context, options);
};

/**
 * Analyzes a full chat session to determine the primary enquiry type and summary.
 */
export const classifySession = async (messages: Message[]): Promise<{ type: EnquiryType; summary: string; sentiment: Sentiment }> => {
    if (messages.length === 0) return { type: 'General', summary: 'No interaction', sentiment: 'neutral' };

    try {
        const transcript = messages.map(m => `${m.role}: ${m.text}`).join('\n');
        const prompt = `Analyze this chat transcript.
      
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
      `;

        // Use a default provider for background tasks
        const provider = new GeminiProvider({
            model: 'gemini-2.0-flash',
            useProxy: USE_PROXY,
            apiKey: getEnv('VITE_GEMINI_API_KEY')
        });

        const response = await provider.generateAuthoredContent([{ role: 'user', content: prompt }]);
        const rawText = response.content;

        const cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const json = JSON.parse(cleaned);

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
 */
export const analyzeInteraction = async (query: string, response: string): Promise<Partial<ReviewItem>> => {
    try {
        const prompt = `Analyze this chat interaction between a User and an AI Agent.
      
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
      `;

        const provider = new GeminiProvider({
            model: 'gemini-2.0-flash',
            useProxy: USE_PROXY,
            apiKey: getEnv('VITE_GEMINI_API_KEY')
        });

        const result = await provider.generateAuthoredContent([{ role: 'user', content: prompt }]);
        const cleaned = result.content.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned);
    } catch (error) {
        return {
            sentiment: 'neutral',
            confidence: 0.5,
            topics: ['General']
        };
    }
};

/**
 * Calls the server-side scraper to analyze a company website.
 */
export const analyzeCompanyContent = async (url: string): Promise<KnowledgeBaseData | null> => {
    try {
        const response = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Scrape failed with status ${response.status}`);
        }

        const data = await response.json() as KnowledgeBaseData;
        data.lastUpdated = new Date();
        return data;

    } catch (error: any) {
        console.error("Scraper API Error:", {
            message: error.message,
            name: error.name
        });
        throw error;
    }
};

/**
 * Analyzes raw text content (e.g. from uploaded files).
 */
export const analyzeRawText = async (textContext: string, fileName: string): Promise<KnowledgeBaseData | null> => {
    try {
        const prompt = `Analyze the following text content from a document named "${fileName}".
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
            
            Return ONLY the JSON object.`;

        const provider = new GeminiProvider({
            model: 'gemini-2.0-flash',
            useProxy: USE_PROXY,
            apiKey: getEnv('VITE_GEMINI_API_KEY')
        });

        const response = await provider.generateAuthoredContent([{ role: 'user', content: prompt }]);
        const cleaned = response.content.replace(/```json/g, "").replace(/```/g, "").trim();

        if (!cleaned) return null;

        const parsedData = JSON.parse(cleaned) as KnowledgeBaseData;
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
export const detectConflicts = async (current: KnowledgeBaseData, incoming: KnowledgeBaseData): Promise<any[]> => {
    try {
        const prompt = `Compare these two business knowledge sets (Current vs New).
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
            
            If no significant conflicts, return [] (empty array).`;

        const provider = new GeminiProvider({
            model: 'gemini-2.0-flash',
            useProxy: USE_PROXY,
            apiKey: getEnv('VITE_GEMINI_API_KEY')
        });

        const response = await provider.generateAuthoredContent([{ role: 'user', content: prompt }]);
        const cleaned = response.content.replace(/```json/g, "").replace(/```/g, "").trim();

        if (!cleaned) return [];
        return JSON.parse(cleaned);

    } catch (error) {
        console.error("Conflict detection failed", error);
        return [];
    }
}

/**
 * Suggests corrections for the Review Queue.
 */
export const suggestCorrection = async (query: string, poorResponse: string): Promise<string> => {
    try {
        const prompt = `You are a QA specialist for an AI booking agent. 
            The agent gave a low-confidence or incorrect response.
            
            User Query: "${query}"
            Agent Response: "${poorResponse}"
            
            Please rewrite the response to be more helpful, professional, and goal-oriented (driving towards a booking).`;

        const provider = new GeminiProvider({
            model: 'gemini-2.0-flash',
            useProxy: USE_PROXY,
            apiKey: getEnv('VITE_GEMINI_API_KEY')
        });

        const response = await provider.generateAuthoredContent([{ role: 'user', content: prompt }]);
        return response.content;
    } catch (e) {
        return "";
    }
}
