
export interface ChatMessage {
  role: 'user' | 'model' | 'system' | 'function';
  content: string;
  name?: string; // For function calls/responses
  functionCall?: {
    name: string;
    args: any;
  };
}

export interface CompletionOptions {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
}

export interface LLMProvider {
  name: string;
  
  /**
   * Generates a single completion for a prompt or chat history.
   */
  generateAuthoredContent(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<ChatMessage>;

  /**
   * Streams a completion (optional, for future use).
   */
  streamContent?(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncGenerator<string, void, unknown>;
}
