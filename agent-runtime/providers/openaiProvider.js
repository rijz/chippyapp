function resolveOpenAIKey(explicitKey) {
  return explicitKey || process.env.OPENAI_API_KEY || '';
}

function resolveBaseUrl(explicitBaseUrl) {
  return (explicitBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
}

function normalizeRole(role) {
  if (role === 'assistant' || role === 'model') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
}

function extractResponsesText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  if (Array.isArray(data?.output)) {
    const chunks = [];
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const contentPart of item.content) {
        if (contentPart?.type === 'output_text' && typeof contentPart.text === 'string') {
          chunks.push(contentPart.text);
        }
      }
    }

    if (chunks.length > 0) return chunks.join('\n').trim();
  }

  return '';
}

export class OpenAIProvider {
  constructor(config = {}) {
    this.name = 'openai';
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    this.baseUrl = resolveBaseUrl(config.baseUrl);
    this.apiKey = resolveOpenAIKey(config.apiKey);

    if (!this.apiKey) {
      throw new Error('OpenAI API key not found. Set OPENAI_API_KEY.');
    }
  }

  async generate({ systemPrompt, messages, temperature = 0.2, maxOutputTokens }) {
    const safeMessages = Array.isArray(messages) ? messages : [];

    // Preferred path: Responses API
    try {
      const responsePayload = {
        model: this.model,
        input: safeMessages.map((message) => ({
          role: normalizeRole(message.role),
          content: [{ type: 'input_text', text: String(message.content || '') }],
        })),
        instructions: systemPrompt || undefined,
        temperature,
        max_output_tokens: maxOutputTokens,
      };

      const response = await fetch(`${this.baseUrl}/v1/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(responsePayload),
      });

      if (response.ok) {
        const data = await response.json();
        const text = extractResponsesText(data);
        if (text) {
          return {
            text,
            model: this.model,
            metadata: {
              id: data?.id,
              usage: data?.usage,
              api: 'responses',
            },
          };
        }
      }
    } catch {
      // Fall through to chat completions compatibility path.
    }

    // Compatibility fallback: Chat Completions API
    const completionPayload = {
      model: this.model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...safeMessages.map((message) => ({
          role: normalizeRole(message.role),
          content: String(message.content || ''),
        })),
      ],
      temperature,
      max_tokens: maxOutputTokens,
    };

    const completionResponse = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(completionPayload),
    });

    if (!completionResponse.ok) {
      const errorText = await completionResponse.text();
      throw new Error(`OpenAI request failed (${completionResponse.status}): ${errorText}`);
    }

    const completionData = await completionResponse.json();
    const text = completionData?.choices?.[0]?.message?.content || '';

    return {
      text: String(text || ''),
      model: this.model,
      metadata: {
        id: completionData?.id,
        usage: completionData?.usage,
        api: 'chat.completions',
      },
    };
  }
}
