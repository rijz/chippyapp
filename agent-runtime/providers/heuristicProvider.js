import { extractJsonObject, normalizeText } from '../core/utils.js';

function looksLikePlanPrompt(text) {
  return text.includes('"tasks"') || text.toLowerCase().includes('break the goal');
}

function looksLikeReviewPrompt(text) {
  return text.includes('"status"') && text.includes('"score"');
}

function looksLikeIterativePrompt(text) {
  return text.includes('iterative executor loop') || text.includes('"mode":"tool|final"');
}

function makePlan(goal) {
  return {
    tasks: [
      {
        title: 'Frame objective and constraints',
        objective: `Translate goal into constraints and success criteria: ${goal}`,
        agentRole: 'researcher',
        acceptanceCriteria: ['Key constraints captured', 'Assumptions listed'],
      },
      {
        title: 'Design execution approach',
        objective: 'Produce a concrete implementation plan with milestones and risks.',
        agentRole: 'planner',
        acceptanceCriteria: ['Milestones defined', 'Risks and mitigations captured'],
      },
      {
        title: 'Draft initial implementation output',
        objective: 'Create a first-pass solution that can be reviewed and iterated.',
        agentRole: 'executor',
        acceptanceCriteria: ['Output is actionable', 'Next actions are explicit'],
      },
    ],
  };
}

function makeWorkResult(taskTitle, objective) {
  return {
    summary: `Completed task: ${taskTitle}`,
    deliverables: [
      `Objective handled: ${normalizeText(objective)}`,
      'Concrete output draft prepared with explicit next actions.',
    ],
    risks: ['Result is heuristic and should be validated with a stronger LLM for production-critical paths.'],
    questions: [],
    nextActions: ['Run reviewer validation', 'Promote accepted output into execution queue'],
  };
}

function makeReview(outputs) {
  const hasDeliverables = outputs.some((entry) => Array.isArray(entry?.deliverables) && entry.deliverables.length > 0);
  return {
    status: hasDeliverables ? 'approved' : 'revise',
    score: hasDeliverables ? 0.8 : 0.45,
    feedback: hasDeliverables ? ['Outputs are actionable.'] : ['Outputs are missing concrete deliverables.'],
    missing: hasDeliverables ? [] : ['At least one task must provide deliverables.'],
  };
}

export class HeuristicProvider {
  constructor(config = {}) {
    this.name = 'local.heuristic';
    this.model = config.model || 'heuristic-v1';
  }

  async generate({ systemPrompt, messages }) {
    const prompt = `${systemPrompt || ''}\n${(messages || []).map((m) => m.content).join('\n')}`;
    const firstMessage = messages?.[0]?.content || '';
    const parsedInput = extractJsonObject(firstMessage) || {};
    const goal = normalizeText(parsedInput.goal || parsedInput.objective || 'Create an execution-ready business solution');

    if (looksLikePlanPrompt(prompt)) {
      return { text: JSON.stringify(makePlan(goal)), model: this.model };
    }

    if (looksLikeReviewPrompt(prompt)) {
      const outputs = Array.isArray(parsedInput.outputs) ? parsedInput.outputs : [];
      return { text: JSON.stringify(makeReview(outputs)), model: this.model };
    }

    if (looksLikeIterativePrompt(prompt)) {
      const history = Array.isArray(parsedInput.toolHistory) ? parsedInput.toolHistory : [];
      const hasCompletedTool = history.some((entry) => String(entry?.status || '').toLowerCase() === 'completed');

      if (!hasCompletedTool) {
        return {
          text: JSON.stringify({
            mode: 'tool',
            toolName: 'web.search',
            toolInput: {
              query: goal,
              maxResults: 3,
            },
            reason: 'Need one lookup before final answer.',
          }),
          model: this.model,
        };
      }

      let message = `I completed iterative tool checks for: ${goal}.`;
      if (/capital of canada/i.test(goal)) {
        message = 'The capital of Canada is Ottawa.';
      } else if (/what is 1\+1|1\+1/i.test(goal)) {
        message = '1 + 1 = 2.';
      }

      return {
        text: JSON.stringify({
          mode: 'final',
          message,
          reason: 'Sufficient signal after one lookup.',
        }),
        model: this.model,
      };
    }

    const taskTitle = normalizeText(parsedInput.task?.title || parsedInput.title || 'Untitled task');
    const objective = normalizeText(parsedInput.task?.objective || parsedInput.objective || parsedInput.goal || 'No objective provided');
    return { text: JSON.stringify(makeWorkResult(taskTitle, objective)), model: this.model };
  }
}
