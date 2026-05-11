
import { LLMProvider, ChatMessage, CompletionOptions } from '../interfaces/LLMProvider';
import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiProvider implements LLMProvider {
    name = 'gemini';
    private model: string;
    private useProxy: boolean;
    private apiKey?: string;
    private client?: GoogleGenerativeAI;

    constructor(config: { model?: string; useProxy?: boolean; apiKey?: string }) {
        this.model = config.model || 'gemini-2.0-flash';
        this.useProxy = config.useProxy ?? true;
        this.apiKey = config.apiKey;

        if (!this.useProxy && this.apiKey) {
            this.client = new GoogleGenerativeAI(this.apiKey);
        }
    }

    async generateAuthoredContent(
        messages: ChatMessage[],
        options?: CompletionOptions
    ): Promise<ChatMessage> {
        const contents = messages.map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const generationConfig = {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxOutputTokens,
            topP: options?.topP,
            topK: options?.topK,
            stopSequences: options?.stopSequences,
        };

        if (this.useProxy) {
            return this.generateViaProxy(contents, generationConfig);
        } else {
            return this.generateViaSdk(contents, generationConfig);
        }
    }

    private async generateViaProxy(contents: any[], generationConfig: any): Promise<ChatMessage> {
        const response = await fetch(`/api-proxy/v1beta/models/${this.model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error?.error || 'Gemini Proxy generation failed');
        }

        const data = await response.json();
        const content = data?.candidates?.[0]?.content;
        const text = content?.parts?.map((p: any) => p.text || '').join('') || '';
        const functionCallPart = content?.parts?.find((p: any) => p.functionCall);

        const message: ChatMessage = {
            role: 'model',
            content: text
        };

        if (functionCallPart) {
            message.functionCall = {
                name: functionCallPart.functionCall.name,
                args: functionCallPart.functionCall.args
            };
        }

        return message;
    }

    private async generateViaSdk(contents: any[], generationConfig: any): Promise<ChatMessage> {
        if (!this.client) throw new Error('Gemini SDK client not initialized');

        const model = this.client.getGenerativeModel({ model: this.model });
        const result = await model.generateContent({
            contents,
            generationConfig
        });

        const response = await result.response;
        const text = response.text();
        const functionCallPart = response.functionCall();

        const message: ChatMessage = {
            role: 'model',
            content: text
        };

        if (functionCallPart) {
            message.functionCall = {
                name: functionCallPart.name,
                args: functionCallPart.args
            };
        }

        return message;
    }
}
