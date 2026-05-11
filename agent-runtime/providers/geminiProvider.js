import { GoogleGenerativeAI } from '@google/generative-ai';

function resolveGeminiKey(explicitKey) {
  return (
    explicitKey ||
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ''
  );
}

function toGeminiRole(role) {
  if (role === 'assistant' || role === 'model') return 'model';
  return 'user';
}

export class GeminiProvider {
  constructor(config = {}) {
    this.name = 'gemini';
    this.model = config.model || 'gemini-2.0-flash';
    const apiKey = resolveGeminiKey(config.apiKey);

    if (!apiKey) {
      throw new Error('Gemini API key not found. Set GEMINI_API_KEY or API_KEY.');
    }

    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generate({ systemPrompt, messages, temperature = 0.2, maxOutputTokens }) {
    const model = this.client.getGenerativeModel({ model: this.model });
    const safeMessages = Array.isArray(messages) ? messages : [];

    const contents = [];
    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: `SYSTEM INSTRUCTION:\n${systemPrompt}` }],
      });
    }

    for (const message of safeMessages) {
      contents.push({
        role: toGeminiRole(message.role),
        parts: [{ text: String(message.content || '') }],
      });
    }

    const result = await model.generateContent({
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    });

    const response = await result.response;
    return {
      text: response.text() || '',
      model: this.model,
      metadata: {
        candidateCount: Array.isArray(response.candidates) ? response.candidates.length : 0,
      },
    };
  }
}
