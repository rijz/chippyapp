
import { LLMProvider, ChatMessage, CompletionOptions } from '../interfaces/LLMProvider';

export class OllamaProvider implements LLMProvider {
    name = 'ollama';
    private baseUrl: string;
    private model: string;

    constructor(config: { baseUrl?: string; model?: string }) {
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        this.model = config.model || 'llama3';
    }

    async generateAuthoredContent(
        messages: ChatMessage[],
        options?: CompletionOptions
    ): Promise<ChatMessage> {
        const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');

        const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: options?.temperature,
                    num_ctx: 4096
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();

        return {
            role: 'model',
            content: data.response
        };
    }
}
