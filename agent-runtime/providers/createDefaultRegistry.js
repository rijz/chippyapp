import { ProviderRegistry } from '../core/providerRegistry.js';
import { GeminiProvider } from './geminiProvider.js';
import { OllamaProvider } from './ollamaProvider.js';
import { HeuristicProvider } from './heuristicProvider.js';
import { OpenAIProvider } from './openaiProvider.js';

export function createDefaultProviderRegistry() {
  const registry = new ProviderRegistry();

  registry.register({
    id: 'local.heuristic',
    name: 'Local Heuristic',
    description: 'No external API required. Deterministic fallback for orchestration testing.',
    defaultModel: 'heuristic-v1',
    capabilities: {
      json: true,
      tools: false,
      autonomous: true,
      costTier: 'free',
    },
    create: async (options = {}) => new HeuristicProvider(options),
  });

  registry.register({
    id: 'gemini.flash',
    name: 'Gemini Flash',
    description: 'Fast general-purpose model for planning and execution.',
    defaultModel: 'gemini-2.0-flash',
    capabilities: {
      json: true,
      tools: 'limited',
      autonomous: true,
      costTier: 'medium',
    },
    create: async (options = {}) => new GeminiProvider({ model: options.model || 'gemini-2.0-flash', apiKey: options.apiKey }),
  });

  registry.register({
    id: 'gemini.pro',
    name: 'Gemini Pro',
    description: 'Higher-reasoning tier for review and verification-heavy workflows.',
    defaultModel: 'gemini-2.5-pro',
    capabilities: {
      json: true,
      tools: 'limited',
      autonomous: true,
      costTier: 'high',
    },
    create: async (options = {}) => new GeminiProvider({ model: options.model || 'gemini-2.5-pro', apiKey: options.apiKey }),
  });

  registry.register({
    id: 'ollama.local',
    name: 'Ollama Local',
    description: 'Self-hosted local model via Ollama /api/chat.',
    defaultModel: 'llama3.1',
    capabilities: {
      json: 'prompted',
      tools: false,
      autonomous: true,
      costTier: 'infra',
    },
    create: async (options = {}) => new OllamaProvider(options),
  });

  registry.register({
    id: 'openai.default',
    name: 'OpenAI Default',
    description: 'OpenAI Responses-first provider with chat-completions fallback.',
    defaultModel: 'gpt-4.1-mini',
    capabilities: {
      json: true,
      tools: 'limited',
      autonomous: true,
      costTier: 'medium',
    },
    create: async (options = {}) =>
      new OpenAIProvider({
        model: options.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
      }),
  });

  return registry;
}
