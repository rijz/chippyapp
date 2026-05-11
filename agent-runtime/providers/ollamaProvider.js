function toOllamaRole(role) {
  if (role === 'model' || role === 'assistant') return 'assistant';
  if (role === 'system') return 'system';
  return 'user';
}

export class OllamaProvider {
  constructor(config = {}) {
    this.name = 'ollama';
    this.baseUrl = (config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.model = config.model || process.env.OLLAMA_MODEL || 'llama3.1';
  }

  async generate({ systemPrompt, messages, temperature = 0.2 }) {
    const chatMessages = [];

    if (systemPrompt) {
      chatMessages.push({ role: 'system', content: systemPrompt });
    }

    for (const message of messages || []) {
      chatMessages.push({
        role: toOllamaRole(message.role),
        content: String(message.content || ''),
      });
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: chatMessages,
        stream: false,
        options: { temperature },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
      text: data?.message?.content || '',
      model: this.model,
      metadata: {
        evalCount: data?.eval_count,
      },
    };
  }
}
