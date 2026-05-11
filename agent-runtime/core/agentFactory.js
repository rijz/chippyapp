import { createId } from './utils.js';

const TEMPLATE_SYSTEM_PROMPTS = {
  supervisor: [
    'You are a strict supervisor agent for business workflow automation.',
    'Break the goal into a minimal, executable task list.',
    'Return JSON only: {"tasks":[{"title":"","objective":"","agentRole":"researcher|planner|executor|reviewer","acceptanceCriteria":[""]}]}.',
    'Do not exceed 5 tasks.'
  ].join(' '),
  researcher: [
    'You are a researcher agent.',
    'Identify assumptions, constraints, and missing information.',
    'Keep output concise with hard limits: max 4 deliverables, max 3 risks, max 3 questions, max 4 nextActions.',
    'Return JSON only: {"summary":"","deliverables":[""],"risks":[""],"questions":[""],"nextActions":[""]}.'
  ].join(' '),
  planner: [
    'You are a planner agent.',
    'Turn the task into concrete implementation steps.',
    'Keep output concise with hard limits: max 4 deliverables, max 3 risks, max 3 questions, max 4 nextActions.',
    'Return JSON only: {"summary":"","deliverables":[""],"risks":[""],"questions":[""],"nextActions":[""]}.'
  ].join(' '),
  executor: [
    'You are an executor agent.',
    'Produce actionable output for the task and keep it implementation-oriented.',
    'Keep output concise with hard limits: max 4 deliverables, max 3 risks, max 3 questions, max 4 nextActions.',
    'Return JSON only: {"summary":"","deliverables":[""],"risks":[""],"questions":[""],"nextActions":[""]}.'
  ].join(' '),
  reviewer: [
    'You are a reviewer agent.',
    'Evaluate whether outputs meet the goal and acceptance criteria.',
    'Use status "approved" when outputs are execution-ready with no critical blockers.',
    'Use status "revise" only when there are blocking gaps (missing deliverables, unsafe actions, unresolved dependencies).',
    'Keep feedback and missing concise (max 4 each).',
    'Return JSON only: {"status":"approved|revise","score":0.0,"feedback":[""],"missing":[""]}.'
  ].join(' '),
};

export class AgentFactory {
  constructor({ provider, bus }) {
    this.provider = provider;
    this.bus = bus;
  }

  create(role, options = {}) {
    const agentId = options.id || createId('agent');
    const basePrompt = options.systemPrompt || TEMPLATE_SYSTEM_PROMPTS[role] || TEMPLATE_SYSTEM_PROMPTS.executor;
    const suffix = typeof options.systemPromptSuffix === 'string' ? options.systemPromptSuffix.trim() : '';
    const systemPrompt = suffix ? `${basePrompt}\n\n${suffix}` : basePrompt;
    const provider = this.provider;
    const bus = this.bus;

    return {
      id: agentId,
      role,
      execute: async (input, request = {}) => {
        const payloadText = JSON.stringify(input || {}, null, 2);
        const messages = [{ role: 'user', content: payloadText }];

        bus?.publish('agent.execute.started', {
          agentId,
          role,
          input,
        });

        const result = await provider.client.generate({
          systemPrompt,
          messages,
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxOutputTokens,
        });

        bus?.publish('agent.execute.completed', {
          agentId,
          role,
          outputPreview: String(result?.text || '').slice(0, 300),
        });

        return {
          text: String(result?.text || ''),
          model: result?.model || provider.model,
          metadata: result?.metadata || {},
        };
      },
    };
  }
}

export const AGENT_ROLES = ['supervisor', 'researcher', 'planner', 'executor', 'reviewer'];
