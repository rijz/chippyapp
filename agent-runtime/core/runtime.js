import { AgentBus } from './agentBus.js';
import { AgentFactory } from './agentFactory.js';
import { Verifier } from './verifier.js';
import { createId, extractJsonObject, nowIso, normalizeText, safeArray } from './utils.js';
import { createAjv, formatValidationErrors } from './jsonValidation.js';
import { planSchema, policySchema, reviewerOutputSchema, runRecordSchema, workerOutputSchema } from './schemas.js';

const WORKER_ROLES = new Set(['researcher', 'planner', 'executor']);
const RUN_SCHEMA_VERSION = 1;
const ajv = createAjv();
const validatePlan = ajv.compile(planSchema);
const validateWorkerOutput = ajv.compile(workerOutputSchema);
const validateReviewerOutput = ajv.compile(reviewerOutputSchema);
const validatePolicy = ajv.compile(policySchema);
const validateRunRecord = ajv.compile(runRecordSchema);

const DEFAULT_POLICY = {
  approvalMode: 'REVIEW_REQUIRED',
  fallbackMode: 'permissive', // permissive | strict
  maxToolCallsPerRun: 12,
  maxWriteActionsPerRun: 3,
  allowedToolScopes: ['none', 'read', 'write'],
  quietHours: {
    enabled: false,
    startHour: 22,
    endHour: 7,
  },
};

const ITERATIVE_EXECUTOR_SYSTEM_PROMPT = [
  'You are an iterative executor loop for Business Brain.',
  'Your job is to use available tools one step at a time until you can provide a direct final answer.',
  'Use context.currentUtcTimestamp as the authoritative current date/time.',
  'For time-sensitive questions (current/latest/today/now/ongoing/live), do not finalize without concrete tool evidence.',
  'Return JSON only and exactly one decision per turn.',
  'If you need more information, choose mode "tool" and call one tool.',
  'If you can answer now, choose mode "final" and provide a concise answer message grounded in tool results.',
  'Never return markdown code fences.',
  'Output schema:',
  '{"mode":"tool|final","toolName":"optional","toolInput":{},"message":"required when mode=final","reason":"short rationale"}',
].join(' ');

function normalizeAllowedToolScopes(scopes) {
  const raw = Array.isArray(scopes) ? scopes : DEFAULT_POLICY.allowedToolScopes;
  const allowed = new Set(raw.map((item) => String(item).toLowerCase()));
  if (allowed.size === 0) {
    return ['none', 'read', 'write'];
  }
  return Array.from(allowed).filter((value) => ['none', 'read', 'write'].includes(value));
}

function normalizeQuietHours(input) {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_POLICY.quietHours };
  }

  const enabled = input.enabled === true;
  const startHour = Number(input.startHour);
  const endHour = Number(input.endHour);
  const safeStart = Number.isInteger(startHour) && startHour >= 0 && startHour <= 23 ? startHour : 22;
  const safeEnd = Number.isInteger(endHour) && endHour >= 0 && endHour <= 23 ? endHour : 7;

  return {
    enabled,
    startHour: safeStart,
    endHour: safeEnd,
    timezone: typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : null,
  };
}

function getHourForTimezone(timezone) {
  if (!timezone) {
    return new Date().getHours();
  }

  try {
    const value = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date());
    const hour = Number(value);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      return hour;
    }
  } catch {
    // Fall back to local runtime hour if timezone is invalid or unsupported.
  }

  return new Date().getHours();
}

function isWithinQuietHours(quietHours, timezone = null) {
  if (!quietHours?.enabled) return false;
  const hour = getHourForTimezone(timezone);
  const start = Number(quietHours.startHour);
  const end = Number(quietHours.endHour);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  if (start === end) return true;
  if (start < end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

function fallbackPlan(goal) {
  return {
    tasks: [
      {
        title: 'Clarify objective and constraints',
        objective: `Capture success criteria for: ${goal}`,
        agentRole: 'researcher',
        acceptanceCriteria: ['Constraints listed', 'Assumptions listed'],
      },
      {
        title: 'Build solution design',
        objective: 'Create a concrete technical approach with risk controls.',
        agentRole: 'planner',
        acceptanceCriteria: ['Architecture described', 'Tradeoffs recorded'],
      },
      {
        title: 'Produce execution-ready output',
        objective: 'Generate the initial implementation output and next actions.',
        agentRole: 'executor',
        acceptanceCriteria: ['Deliverables included', 'Next actions included'],
      },
    ],
  };
}

function parseWorkOutput(text) {
  const parsed = extractJsonObject(text);
  if (parsed) return parsed;

  const summary = normalizeText(text).slice(0, 600);
  return {
    summary: summary || 'No summary produced.',
    deliverables: summary ? [summary] : [],
    risks: [],
    questions: [],
    nextActions: [],
  };
}

function normalizeOutputList(values, maxItems, maxChars = 240) {
  const list = safeArray(values)
    .map((item) => normalizeText(item))
    .map((item) => item.slice(0, maxChars))
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const item of list) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= maxItems) break;
  }
  return unique;
}

function normalizeWorkerOutput(output, caps = {}) {
  const safe = output && typeof output === 'object' ? output : {};
  return {
    summary: normalizeText(safe.summary).slice(0, 600) || 'No summary produced.',
    deliverables: normalizeOutputList(safe.deliverables, Number(caps.maxDeliverables ?? 4)),
    risks: normalizeOutputList(safe.risks, Number(caps.maxRisks ?? 3)),
    questions: normalizeOutputList(safe.questions, Number(caps.maxQuestions ?? 3)),
    nextActions: normalizeOutputList(safe.nextActions, Number(caps.maxNextActions ?? 4)),
  };
}

function applyRunOutputBudgets(output, budget) {
  if (!budget || typeof budget !== 'object') return output;
  const deliverablesLimit = Math.max(0, Number(budget.deliverablesRemaining ?? 0));
  const risksLimit = Math.max(0, Number(budget.risksRemaining ?? 0));
  const deliverables = safeArray(output.deliverables).slice(0, deliverablesLimit);
  const risks = safeArray(output.risks).slice(0, risksLimit);

  budget.deliverablesRemaining = Math.max(0, deliverablesLimit - deliverables.length);
  budget.risksRemaining = Math.max(0, risksLimit - risks.length);

  return {
    ...output,
    deliverables,
    risks,
  };
}

function fallbackReviewOutput() {
  return {
    status: 'revise',
    score: 0.4,
    feedback: ['Review parser fallback: structured review not returned.'],
    missing: ['Structured review output'],
  };
}

function deriveRunStatus({ verification, toolCalls }) {
  const calls = safeArray(toolCalls);
  if (calls.some((call) => call?.status === 'pending_review')) {
    return 'awaiting_approval';
  }
  if (calls.some((call) => call?.status === 'blocked_policy')) {
    return 'blocked_policy';
  }

  return verification?.passed ? 'completed' : 'needs_revision';
}

function extractFirstHttpUrl(text = '') {
  const match = String(text || '').match(/https?:\/\/[^\s)]+/i);
  return match ? match[0] : '';
}

function parseBooleanLike(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseIntegerLike(value, fallback, min = 1, max = 12) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function truncateForPrompt(text, maxChars = 1200) {
  const value = normalizeText(text);
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
}

function stringifyForPrompt(value, maxChars = 1600) {
  let raw = '';
  if (typeof value === 'string') raw = value;
  else {
    try {
      raw = JSON.stringify(value);
    } catch {
      raw = String(value);
    }
  }
  return truncateForPrompt(raw, maxChars);
}

function stripMarkdownFences(text = '') {
  return String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function normalizeIterativeDecision(candidate) {
  const safe = candidate && typeof candidate === 'object' ? candidate : {};
  const rawMode = normalizeText(safe.mode || safe.action || '').toLowerCase();
  const explicitToolName = normalizeText(safe.toolName || safe.tool || '');
  const inferredToolName = explicitToolName || (rawMode.includes('.') ? rawMode : '');
  const rawToolInput = safe.toolInput || safe.input || safe.args;
  const toolInput = rawToolInput && typeof rawToolInput === 'object' && !Array.isArray(rawToolInput)
    ? rawToolInput
    : {};
  const message = normalizeText(safe.message || safe.answer || safe.final || safe.summary || '');

  if (rawMode === 'final' && message) {
    return {
      mode: 'final',
      toolName: '',
      toolInput: {},
      message,
      valid: true,
    };
  }

  if ((rawMode === 'tool' || rawMode === 'call_tool' || rawMode.includes('.') || !rawMode) && inferredToolName) {
    return {
      mode: 'tool',
      toolName: inferredToolName,
      toolInput,
      message: '',
      valid: true,
    };
  }

  return {
    mode: 'invalid',
    toolName: inferredToolName,
    toolInput,
    message,
    valid: false,
  };
}

function resolveIterativeExecutorEnabled(input = {}, context = {}) {
  if (typeof input?.iterativeExecutor === 'boolean') return input.iterativeExecutor;
  if (typeof context?.enableIterativeExecutor === 'boolean') return context.enableIterativeExecutor;
  return parseBooleanLike(process.env.CHIPPY_ENABLE_ITERATIVE_EXECUTOR, true);
}

function resolveIterativeMaxSteps(input = {}, context = {}, fallback = 4) {
  const inputValue = input?.iterativeMaxSteps;
  const contextValue = context?.iterativeMaxSteps;
  const envValue = process.env.CHIPPY_ITERATIVE_MAX_STEPS;
  if (inputValue !== undefined) return parseIntegerLike(inputValue, fallback, 1, 12);
  if (contextValue !== undefined) return parseIntegerLike(contextValue, fallback, 1, 12);
  return parseIntegerLike(envValue, fallback, 1, 12);
}

function isTimeSensitiveGoal(goal = '') {
  const value = String(goal || '').toLowerCase();
  return /(current|latest|today|now|ongoing|going on|live|right now|currently)/.test(value);
}

function buildIterativeToolCatalog(tools = []) {
  return safeArray(tools).map((tool) => {
    const properties = tool?.inputSchema?.properties && typeof tool.inputSchema.properties === 'object'
      ? Object.keys(tool.inputSchema.properties).slice(0, 8)
      : [];
    return {
      name: tool.name,
      description: truncateForPrompt(tool.description || '', 280),
      sideEffect: tool.sideEffect || 'none',
      supportsDryRun: tool.supportsDryRun === true,
      inputFields: properties,
    };
  });
}

function normalizeReviewOutput(review) {
  const safe = review && typeof review === 'object' ? review : {};
  const rawStatus = String(safe.status || '').trim().toLowerCase();
  const normalizedStatus = ['approved', 'approve', 'pass', 'passed', 'accepted'].includes(rawStatus)
    ? 'approved'
    : 'revise';
  const normalizedScore = Number(safe.score);

  return {
    status: normalizedStatus,
    score: Number.isFinite(normalizedScore) ? normalizedScore : 0,
    feedback: safeArray(safe.feedback).map((item) => String(item)),
    missing: safeArray(safe.missing).map((item) => String(item)),
  };
}

function normalizePlan(planCandidate) {
  const plan = planCandidate?.tasks ? planCandidate : fallbackPlan('General business automation objective');
  const tasks = safeArray(plan.tasks)
    .map((task, index) => ({
      id: task.id || `task-${index + 1}`,
      title: normalizeText(task.title) || `Task ${index + 1}`,
      objective: normalizeText(task.objective) || 'No objective provided.',
      // Reserve reviewer for the final verification pass only.
      agentRole: WORKER_ROLES.has(task.agentRole) ? task.agentRole : 'executor',
      acceptanceCriteria: safeArray(task.acceptanceCriteria).map((x) => normalizeText(x)).filter(Boolean),
    }))
    .filter((task) => task.title && task.objective);

  return { tasks };
}

function buildSoulPromptSuffix(soul) {
  if (!soul || typeof soul !== 'object') return '';

  const lines = ['BUSINESS SOUL (non-negotiable operating context):'];
  const name = normalizeText(soul.name);
  const mission = normalizeText(soul.mission);
  const principles = safeArray(soul.principles)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 8);
  const guardrails = soul.guardrails && typeof soul.guardrails === 'object'
    ? soul.guardrails
    : {};

  if (name) lines.push(`Identity: ${name}`);
  if (mission) lines.push(`Mission: ${mission}`);
  if (principles.length > 0) {
    lines.push(`Principles: ${principles.join(' | ')}`);
  }

  const guardrailEntries = Object.entries(guardrails)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .slice(0, 10)
    .map(([key, value]) => `${key}=${String(value)}`);
  if (guardrailEntries.length > 0) {
    lines.push(`Guardrails: ${guardrailEntries.join(', ')}`);
  }

  lines.push('Prioritize safe, execution-ready business outcomes aligned with this soul.');
  return lines.join('\n');
}

export class ConstrainedAgentRuntime {
  constructor({ providerRegistry, toolRegistry, runStore, limits = {}, policy = {}, onEvent, contracts = null } = {}) {
    this.providerRegistry = providerRegistry;
    this.toolRegistry = toolRegistry;
    this.runStore = runStore;
    this.limits = {
      maxAgents: Number(limits.maxAgents ?? 5),
      maxSteps: Number(limits.maxSteps ?? 12),
      minReviewScore: Number(limits.minReviewScore ?? 0.65),
      maxArtifacts: Number(limits.maxArtifacts ?? 20),
      maxRisks: Number(limits.maxRisks ?? 20),
    };
    this.policy = {
      approvalMode: policy.approvalMode || DEFAULT_POLICY.approvalMode,
      fallbackMode: policy.fallbackMode || DEFAULT_POLICY.fallbackMode,
      maxToolCallsPerRun: Number(policy.maxToolCallsPerRun ?? DEFAULT_POLICY.maxToolCallsPerRun),
      maxWriteActionsPerRun: Number(policy.maxWriteActionsPerRun ?? DEFAULT_POLICY.maxWriteActionsPerRun),
      allowedToolScopes: normalizeAllowedToolScopes(policy.allowedToolScopes),
      quietHours: normalizeQuietHours(policy.quietHours),
    };
    this.onEvent = typeof onEvent === 'function' ? onEvent : null;
    this.contracts = contracts || null;
  }

  getGoalSignals(goal) {
    const value = String(goal || '').toLowerCase();
    const looksLikeQuestion = /(\?|^(what|who|when|where|why|how)\b|\b(what|who|when|where|why|how)\b)/.test(value);
    const hasResearchTokens = /(search|browse|look up|lookup|find|research|weather|temperature|forecast|capital|news|latest|current|today|http)/.test(value);
    return {
      wantsFollowup: /(follow[\s-]?up|reactivat|lead)/.test(value),
      wantsBooking: /(book|slot|availability|schedule|appointment)/.test(value),
      wantsEmail: /(email|inbox|reply|customer message|respond to customer|manage customer email)/.test(value),
      wantsResearch: looksLikeQuestion || hasResearchTokens || /https?:\/\//.test(value),
    };
  }

  getLeadFromContext(context = {}) {
    const fixture = context?.fixture || {};
    const leads = Array.isArray(fixture.leads) ? fixture.leads : [];

    const byId = context?.leadId ? leads.find((lead) => lead.id === context.leadId) : null;
    const byEmail = context?.leadEmail
      ? leads.find((lead) => String(lead.email || '').toLowerCase() === String(context.leadEmail || '').toLowerCase())
      : null;

    return byId || byEmail || leads[0] || null;
  }

  async executeToolCall({ runId, toolCalls, bus, policy, policyState, toolName, input = {}, context = {}, dryRun = true, reason = '' }) {
    const toolId = createId('tool');
    const startedAt = nowIso();
    const tool = this.toolRegistry?.get(toolName);
    const pendingIdempotencyKey = tool
      ? tool.idempotencyKey({ input, context, dryRun: false })
      : null;

    const record = {
      id: toolId,
      name: toolName,
      reason,
      status: 'pending',
      sideEffect: tool?.sideEffect || null,
      dryRun,
      attempts: 0,
      approvalMode: policy.approvalMode,
      input,
      idempotencyKey: pendingIdempotencyKey,
      result: null,
      error: null,
      startedAt,
      endedAt: null,
    };

    if (!tool) {
      record.status = 'unavailable';
      record.error = `Tool not found: ${toolName}`;
      record.endedAt = nowIso();
      toolCalls.push(record);
      bus.publish('tool.call.skipped', { toolId, toolName, status: record.status, reason: record.error });
      return record;
    }

    if (toolCalls.length >= policy.maxToolCallsPerRun) {
      record.status = 'skipped_limit';
      record.error = `maxToolCallsPerRun reached (${policy.maxToolCallsPerRun})`;
      record.endedAt = nowIso();
      toolCalls.push(record);
      bus.publish('tool.call.skipped', { toolId, toolName, status: record.status, reason: record.error });
      return record;
    }

    if (tool.sideEffect === 'write' && !dryRun) {
      const scopes = normalizeAllowedToolScopes(policy.allowedToolScopes);
      if (!scopes.includes('write')) {
        record.status = 'blocked_policy';
        record.error = 'Write actions are disallowed by policy scope.';
        record.policyCode = 'POLICY_SCOPE_BLOCK';
      } else if (
        isWithinQuietHours(
          policy.quietHours,
          context?.timezone || context?.fixture?.timezone || policy?.quietHours?.timezone || null,
        )
      ) {
        record.status = 'blocked_policy';
        record.error = 'Write action blocked during quiet hours.';
        record.policyCode = 'POLICY_QUIET_HOURS_BLOCK';
      } else if ((policyState?.writeActions || 0) >= Number(policy.maxWriteActionsPerRun || 0)) {
        record.status = 'blocked_policy';
        record.error = `Write action limit reached (${policy.maxWriteActionsPerRun}).`;
        record.policyCode = 'POLICY_WRITE_LIMIT_BLOCK';
      }

      if (policy.approvalMode === 'BLOCKED') {
        record.status = 'blocked_policy';
        record.error = 'Write action blocked by policy.';
        record.policyCode = 'POLICY_APPROVAL_BLOCK';
      } else if (policy.approvalMode === 'REVIEW_REQUIRED') {
        if (record.status === 'pending') {
          record.status = 'pending_review';
          record.error = 'Write action requires approval.';
          if (this.runStore?.enqueuePendingToolCall) {
            try {
              const queued = await this.runStore.enqueuePendingToolCall({
                runId,
                toolCallId: toolId,
                toolName,
                sideEffect: tool.sideEffect,
                reason,
                idempotencyKey: pendingIdempotencyKey,
                input,
                context,
              });
              record.actionId = queued.actionId;
              record.queueStatus = queued.status;
              record.duplicateOf = queued.duplicateOf || null;
              if (queued.duplicate) {
                record.status = 'duplicate_suppressed';
                record.error = `Duplicate write action suppressed (actionId=${queued.actionId}).`;
                record.policyCode = 'POLICY_DUPLICATE_SUPPRESSED';
              }
              bus.publish('tool.action.queued', {
                runId,
                toolId,
                actionId: queued.actionId,
                queueStatus: queued.status,
                duplicate: queued.duplicate === true,
              });
            } catch (queueError) {
              record.error = `Failed to enqueue approval action: ${queueError.message}`;
              record.policyCode = 'POLICY_QUEUE_FAILURE';
              bus.publish('tool.action.queue_failed', {
                runId,
                toolId,
                reason: queueError.message,
              });
            }
          }
        }
      }

      if (record.status !== 'pending') {
        if (policyState && record.status === 'pending_review') {
          policyState.writeActions += 1;
        }
        record.endedAt = nowIso();
        toolCalls.push(record);
        bus.publish('tool.call.skipped', { toolId, toolName, status: record.status, reason: record.error });
        return record;
      }

      if (policyState) {
        policyState.writeActions += 1;
      }
    }

    const maxAttempts = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      record.attempts = attempt;
      bus.publish('tool.call.started', { toolId, toolName, attempt, reason, dryRun });

      try {
        const execution = await this.toolRegistry.execute(toolName, { input, context, dryRun });

        record.status = 'completed';
        record.sideEffect = execution.sideEffect;
        record.idempotencyKey = execution.idempotencyKey;
        record.result = execution.result;
        record.endedAt = nowIso();
        toolCalls.push(record);
        bus.publish('tool.call.completed', { toolId, toolName, attempt, status: record.status });
        return record;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          bus.publish('tool.call.retry', { toolId, toolName, attempt, reason: error.message });
        }
      }
    }

    record.status = 'failed';
    record.error = lastError?.message || 'Tool execution failed';
    record.endedAt = nowIso();
    toolCalls.push(record);
    bus.publish('tool.call.failed', { toolId, toolName, status: record.status, reason: record.error });
    return record;
  }

  async runFollowupWorkflow({ runId, goal, context, policy, policyState, toolCalls, bus, executeWrites }) {
    const leadHint = this.getLeadFromContext(context);
    const lookupInput = {};
    if (context?.leadId || leadHint?.id) lookupInput.leadId = context?.leadId || leadHint?.id;
    if (context?.leadEmail || leadHint?.email) lookupInput.email = context?.leadEmail || leadHint?.email;

    const leadLookup = await this.executeToolCall({
      runId,
      toolCalls,
      bus,
      policy,
      policyState,
      toolName: 'lead.lookup',
      input: lookupInput,
      context,
      dryRun: true,
      reason: 'followup_workflow_lookup',
    });

    const lead = leadLookup?.result?.lead || leadHint;
    if (!lead) return;

    const compose = await this.executeToolCall({
      runId,
      toolCalls,
      bus,
      policy,
      policyState,
      toolName: 'followup.compose',
      input: {
        leadName: lead.name || 'Customer',
        serviceInterest: lead.serviceInterest || context?.serviceInterest || 'requested service',
        companyName: context?.companyName || context?.fixture?.companyName || 'Chippy Team',
      },
      context,
      dryRun: true,
      reason: 'followup_workflow_compose',
    });

    const subject = compose?.result?.subject;
    const body = compose?.result?.body;
    const toEmail = context?.leadEmail || lead.email;
    if (!subject || !body || !toEmail) return;

    await this.executeToolCall({
      runId,
      toolCalls,
      bus,
      policy,
      policyState,
      toolName: 'followup.send_preview',
      input: {
        toEmail,
        subject,
        body,
      },
      context,
      dryRun: !executeWrites,
      reason: 'followup_workflow_preview',
    });
  }

  async runBookingWorkflow({ runId, context, policy, policyState, toolCalls, bus }) {
    const bookingInput = {};
    if (context?.requestedDate) bookingInput.date = context.requestedDate;

    await this.executeToolCall({
      runId,
      toolCalls,
      bus,
      policy,
      policyState,
      toolName: 'booking.check_slots',
      input: bookingInput,
      context,
      dryRun: true,
      reason: 'booking_workflow_slots',
    });
  }

  async runEmailWorkflow({ runId, context, policy, policyState, toolCalls, bus, executeWrites }) {
    const inboxLimit = Number(context?.emailLimit || 3);
    const inbox = await this.executeToolCall({
      runId,
      toolCalls,
      bus,
      policy,
      policyState,
      toolName: 'email.inbox_list',
      input: {
        limit: Number.isInteger(inboxLimit) && inboxLimit > 0 ? inboxLimit : 3,
        status: context?.emailStatus || 'open',
      },
      context,
      dryRun: true,
      reason: 'email_workflow_inbox_list',
    });

    const messages = safeArray(inbox?.result?.messages).slice(0, Math.max(1, Number(context?.emailLimit || 3)));
    for (const message of messages) {
      const classify = await this.executeToolCall({
        runId,
        toolCalls,
        bus,
        policy,
        policyState,
        toolName: 'email.thread_classify',
        input: {
          subject: message.subject || '',
          body: message.body || '',
        },
        context,
        dryRun: true,
        reason: 'email_workflow_classify',
      });

      const compose = await this.executeToolCall({
        runId,
        toolCalls,
        bus,
        policy,
        policyState,
        toolName: 'email.reply_compose',
        input: {
          fromName: message.fromName || 'there',
          companyName: context?.companyName || context?.fixture?.companyName || 'Chippy Team',
          category: classify?.result?.category || 'general',
          needsHuman: classify?.result?.needsHuman === true,
          summary: classify?.result?.summary || '',
        },
        context,
        dryRun: true,
        reason: 'email_workflow_compose',
      });

      if (!compose?.result?.subject || !compose?.result?.body || !message.fromEmail) {
        continue;
      }

      await this.executeToolCall({
        runId,
        toolCalls,
        bus,
        policy,
        policyState,
        toolName: 'email.reply_send',
        input: {
          toEmail: message.fromEmail,
          toName: message.fromName || 'Customer',
          subject: compose.result.subject,
          body: compose.result.body,
          threadId: message.threadId,
          inReplyToId: message.inReplyToId || message.messageIdHeader || message.id,
          references: message.references || '',
          mailProvider: message.source || '',
          inboundMessageId: message.id,
          companyName: context?.companyName || context?.fixture?.companyName || 'Chippy Team',
        },
        context,
        dryRun: !executeWrites,
        reason: 'email_workflow_reply_send',
      });
    }
  }

  async runResearchWorkflow({ runId, goal, context, policy, policyState, toolCalls, bus }) {
    const explicitUrl = extractFirstHttpUrl(goal) || extractFirstHttpUrl(context?.sourceUrl || '');
    const query = String(context?.searchQuery || goal || '').trim();
    const maxResults = Number.isInteger(Number(context?.searchMaxResults))
      ? Math.min(Math.max(Number(context.searchMaxResults), 1), 5)
      : 3;

    let fetchedUrls = new Set();

    if (explicitUrl) {
      const fetchResult = await this.executeToolCall({
        runId,
        toolCalls,
        bus,
        policy,
        policyState,
        toolName: 'browser.fetch_page',
        input: {
          url: explicitUrl,
          maxChars: 12000,
        },
        context,
        dryRun: true,
        reason: 'research_workflow_fetch_explicit_url',
      });
      const finalUrl = String(fetchResult?.result?.finalUrl || explicitUrl);
      fetchedUrls.add(finalUrl);
    }

    if (!query) return;

    const search = await this.executeToolCall({
      runId,
      toolCalls,
      bus,
      policy,
      policyState,
      toolName: 'web.search',
      input: {
        query,
        maxResults,
      },
      context,
      dryRun: true,
      reason: 'research_workflow_search',
    });

    const topResult = safeArray(search?.result?.results).find((item) => item?.url);
    const topUrl = topResult?.url ? String(topResult.url) : '';
    if (!topUrl) return;
    if (fetchedUrls.has(topUrl)) return;

    await this.executeToolCall({
      runId,
      toolCalls,
      bus,
      policy,
      policyState,
      toolName: 'browser.fetch_page',
      input: {
        url: topUrl,
        maxChars: 12000,
      },
      context,
      dryRun: true,
      reason: 'research_workflow_fetch_top_result',
    });
  }

  async runIterativeExecutorLoop({
    runId,
    goal,
    context,
    policy,
    policyState,
    toolCalls,
    outputs,
    provider,
    bus,
    executeWrites,
    maxIterations = 4,
  }) {
    if (!this.toolRegistry || typeof provider?.client?.generate !== 'function') {
      return {
        usedSteps: 0,
        iterations: 0,
        finalMessage: '',
        output: null,
      };
    }

    const tools = this.toolRegistry.list();
    if (!Array.isArray(tools) || tools.length === 0) {
      return {
        usedSteps: 0,
        iterations: 0,
        finalMessage: '',
        output: null,
      };
    }

    const toolCatalog = buildIterativeToolCatalog(tools);
    const history = [];
    const currentUtcTimestamp = new Date().toISOString();
    const timeSensitiveGoal = isTimeSensitiveGoal(goal);
    const evidence = {
      completedCalls: 0,
      systemNowCalls: 0,
      searchCalls: 0,
      searchWithResults: 0,
      fetchCalls: 0,
      fetchWithText: 0,
      otherEvidence: 0,
    };
    let pendingGroundingUrl = '';
    let usedSteps = 0;
    let finalMessage = '';

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const payload = {
        goal,
        context: {
          timezone: context?.timezone || null,
          companyName: context?.companyName || null,
          workspaceId: context?.workspaceId || context?.tenantId || null,
          currentUtcTimestamp,
          currentUtcDate: currentUtcTimestamp.slice(0, 10),
        },
        priorOutputs: safeArray(outputs)
          .slice(-3)
          .map((item) => ({
            summary: truncateForPrompt(item?.parsed?.summary || '', 300),
            deliverables: safeArray(item?.parsed?.deliverables).slice(0, 2),
            risks: safeArray(item?.parsed?.risks).slice(0, 2),
          })),
        toolHistory: history.slice(-6),
        availableTools: toolCatalog,
      };

      const response = await provider.client.generate({
        systemPrompt: ITERATIVE_EXECUTOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        temperature: 0.1,
        maxOutputTokens: 500,
      });
      usedSteps += 1;

      const parsed = extractJsonObject(response?.text || '');
      const decision = normalizeIterativeDecision(parsed);

      bus.publish('iterative.executor.step', {
        runId,
        iteration,
        mode: decision.mode,
        toolName: decision.toolName || null,
        valid: decision.valid,
      });

      if (decision.mode === 'final' && decision.message) {
        const needsNowProbe = timeSensitiveGoal && evidence.systemNowCalls === 0;
        if (needsNowProbe) {
          const nowProbe = await this.executeToolCall({
            runId,
            toolCalls,
            bus,
            policy,
            policyState,
            toolName: 'system.now',
            input: {},
            context,
            dryRun: true,
            reason: `iterative_executor_now_probe_${iteration}`,
          });
          history.push({
            iteration,
            toolName: 'system.now',
            status: nowProbe?.status || 'unknown',
            resultPreview: stringifyForPrompt(nowProbe?.result || nowProbe?.error || '', 900),
          });
          if (nowProbe?.status === 'completed') {
            evidence.completedCalls += 1;
            evidence.systemNowCalls += 1;
          }
          if (nowProbe?.status === 'skipped_limit') {
            break;
          }
          continue;
        }

        const needsGroundingFetch = timeSensitiveGoal && evidence.fetchWithText === 0 && Boolean(pendingGroundingUrl);
        if (!needsGroundingFetch) {
          finalMessage = truncateForPrompt(decision.message, 1200);
          break;
        }

        const groundingFetch = await this.executeToolCall({
          runId,
          toolCalls,
          bus,
          policy,
          policyState,
          toolName: 'browser.fetch_page',
          input: {
            url: pendingGroundingUrl,
            maxChars: 12000,
          },
          context,
          dryRun: true,
          reason: `iterative_executor_grounding_fetch_${iteration}`,
        });

        history.push({
          iteration,
          toolName: 'browser.fetch_page',
          status: groundingFetch?.status || 'unknown',
          resultPreview: stringifyForPrompt(groundingFetch?.result || groundingFetch?.error || '', 900),
        });

        pendingGroundingUrl = '';
        if (groundingFetch?.status === 'completed') {
          evidence.completedCalls += 1;
          evidence.fetchCalls += 1;
          const fetchedText = normalizeText(groundingFetch?.result?.text || '');
          if (groundingFetch?.result?.ok === true && fetchedText.length >= 160) {
            evidence.fetchWithText += 1;
          }
        }
        if (groundingFetch?.status === 'skipped_limit') {
          break;
        }
        continue;
      }

      if (decision.mode !== 'tool' || !decision.toolName) {
        history.push({
          iteration,
          status: 'invalid_decision',
          responsePreview: stringifyForPrompt(response?.text || '', 500),
        });
        continue;
      }

      const tool = this.toolRegistry.get(decision.toolName);
      if (!tool) {
        history.push({
          iteration,
          status: 'unknown_tool',
          toolName: decision.toolName,
        });
        continue;
      }

      const dryRun = tool.sideEffect === 'write' ? !executeWrites : true;
      const toolCall = await this.executeToolCall({
        runId,
        toolCalls,
        bus,
        policy,
        policyState,
        toolName: decision.toolName,
        input: decision.toolInput,
        context,
        dryRun,
        reason: `iterative_executor_step_${iteration}`,
      });

      history.push({
        iteration,
        toolName: decision.toolName,
        status: toolCall?.status || 'unknown',
        resultPreview: stringifyForPrompt(toolCall?.result || toolCall?.error || '', 900),
      });

      if (toolCall?.status === 'completed') {
        evidence.completedCalls += 1;
        if (decision.toolName === 'web.search') {
          evidence.searchCalls += 1;
          const results = safeArray(toolCall?.result?.results);
          if (results.length > 0) {
            evidence.searchWithResults += 1;
            if (!pendingGroundingUrl) {
              const topUrl = String(results[0]?.url || '').trim();
              pendingGroundingUrl = topUrl || pendingGroundingUrl;
            }
          }

          if (timeSensitiveGoal && evidence.fetchCalls === 0 && pendingGroundingUrl) {
            const autoFetch = await this.executeToolCall({
              runId,
              toolCalls,
              bus,
              policy,
              policyState,
              toolName: 'browser.fetch_page',
              input: {
                url: pendingGroundingUrl,
                maxChars: 12000,
              },
              context,
              dryRun: true,
              reason: `iterative_executor_auto_fetch_${iteration}`,
            });
            history.push({
              iteration,
              toolName: 'browser.fetch_page',
              status: autoFetch?.status || 'unknown',
              resultPreview: stringifyForPrompt(autoFetch?.result || autoFetch?.error || '', 900),
            });
            pendingGroundingUrl = '';
            if (autoFetch?.status === 'completed') {
              evidence.completedCalls += 1;
              evidence.fetchCalls += 1;
              const fetchedText = normalizeText(autoFetch?.result?.text || '');
              if (autoFetch?.result?.ok === true && fetchedText.length >= 160) {
                evidence.fetchWithText += 1;
              }
            }
            if (autoFetch?.status === 'skipped_limit') {
              break;
            }
          }
        } else if (decision.toolName === 'system.now') {
          evidence.systemNowCalls += 1;
        } else if (decision.toolName === 'browser.fetch_page') {
          evidence.fetchCalls += 1;
          const fetchedText = normalizeText(toolCall?.result?.text || '');
          if (toolCall?.result?.ok === true && fetchedText.length >= 160) {
            evidence.fetchWithText += 1;
          }
        } else if (toolCall?.result && typeof toolCall.result === 'object') {
          const serialized = JSON.stringify(toolCall.result);
          if (serialized && serialized.length > 30) {
            evidence.otherEvidence += 1;
          }
        }
      }

      if (toolCall?.status === 'skipped_limit') {
        break;
      }
    }

    if (!finalMessage && (evidence.fetchWithText > 0 || evidence.searchWithResults > 0)) {
      const synthesis = await provider.client.generate({
        systemPrompt: [
          'You are grounding a final answer from tool evidence.',
          'Answer using only the provided evidence.',
          'If evidence is insufficient, reply exactly: "I could not verify this yet from the available evidence."',
          'Return plain text only, no JSON and no markdown code fences.',
        ].join(' '),
        messages: [{
          role: 'user',
          content: JSON.stringify({
            goal,
            currentUtcTimestamp,
            evidence: history.slice(-4),
          }),
        }],
        temperature: 0.05,
        maxOutputTokens: 220,
      });
      usedSteps += 1;
      const synthesized = stripMarkdownFences(synthesis?.text || '');
      if (synthesized) {
        finalMessage = truncateForPrompt(synthesized, 1200);
      }
    }

    if (!finalMessage) {
      const lastSuccessful = [...history].reverse().find((item) => item.status === 'completed');
      if (timeSensitiveGoal) {
        finalMessage = 'I could not verify a current answer yet with the available evidence. Please ask me to retry or share a source URL.';
      } else if (lastSuccessful?.resultPreview) {
        finalMessage = truncateForPrompt(
          `I completed tool execution (${lastSuccessful.toolName}) and gathered this result: ${lastSuccessful.resultPreview}`,
          1200
        );
      }
    }

    if (!finalMessage) {
      return {
        usedSteps,
        iterations: history.length,
        finalMessage: '',
        output: null,
      };
    }

    const hasTemporalEvidence = evidence.fetchWithText > 0 || (evidence.systemNowCalls > 0 && evidence.searchWithResults > 0);

    if (timeSensitiveGoal && !hasTemporalEvidence) {
      finalMessage = 'I could not verify a current answer with grounded page evidence yet. Ask me to retry or share a source URL.';
    } else if (
      evidence.searchCalls > 0
      && evidence.searchWithResults === 0
      && evidence.fetchWithText === 0
      && evidence.otherEvidence === 0
    ) {
      finalMessage = 'I could not find usable evidence from tool results yet. Please try rephrasing your request.';
    }

    return {
      usedSteps,
      iterations: history.length,
      finalMessage,
      output: {
        task: {
          id: 'iterative-executor',
          title: 'Iterative executor loop',
          objective: 'Use tools iteratively and return a direct answer.',
          agentRole: 'executor',
          acceptanceCriteria: ['Direct answer returned to user'],
        },
        role: 'executor',
        raw: JSON.stringify({
          finalMessage,
          history,
        }),
        parsed: normalizeWorkerOutput({
          summary: finalMessage,
          deliverables: [finalMessage],
          risks: [],
          questions: [],
          nextActions: [],
        }),
      },
    };
  }

  async executeToolWorkflow({ runId, goal, context, policy, bus, executeWrites = false, skipResearchWorkflow = false }) {
    const toolCalls = [];
    if (!this.toolRegistry) {
      return {
        toolCalls,
        policyState: { writeActions: 0 },
        signals: this.getGoalSignals(goal),
      };
    }
    const policyState = {
      writeActions: 0,
    };

    const signals = this.getGoalSignals(goal);
    if (!signals.wantsFollowup && !signals.wantsBooking && !signals.wantsEmail && !signals.wantsResearch) {
      bus.publish('tool.workflow.skipped', { reason: 'no_matching_goal_signals' });
      return { toolCalls, policyState, signals };
    }

    if (signals.wantsFollowup) {
      await this.runFollowupWorkflow({ runId, goal, context, policy, policyState, toolCalls, bus, executeWrites });
    }

    if (signals.wantsBooking) {
      await this.runBookingWorkflow({ runId, context, policy, policyState, toolCalls, bus });
    }

    if (signals.wantsEmail) {
      await this.runEmailWorkflow({ runId, context, policy, policyState, toolCalls, bus, executeWrites });
    }

    if (signals.wantsResearch && !skipResearchWorkflow) {
      await this.runResearchWorkflow({ runId, goal, context, policy, policyState, toolCalls, bus });
    }

    return { toolCalls, policyState, signals };
  }

  async run(input) {
    const goal = normalizeText(input?.goal);
    if (!goal) {
      throw new Error('Goal is required.');
    }

    const startedAt = nowIso();
    const runId = input?.runId || createId('run');
    const providerId = input?.providerId || 'gemini.flash';
    const model = input?.model;
    const context = input?.context || {};
    const executeWrites = input?.executeWrites === true;
    const effectivePolicy = {
      ...this.policy,
      ...(input?.policy || {}),
    };
    if (input?.noFallback === true) {
      effectivePolicy.fallbackMode = 'strict';
    }
    if (!validatePolicy(effectivePolicy)) {
      throw new Error(`Runtime policy validation failed: ${formatValidationErrors(validatePolicy.errors || [])}`);
    }

    const bus = new AgentBus();
    if (this.onEvent) {
      bus.subscribe(this.onEvent);
    }

    bus.publish('run.started', { runId, goal, providerId, model });

    let provider;
    try {
      provider = await this.providerRegistry.create(providerId, {
        model,
        apiKey: input?.apiKey,
        baseUrl: input?.baseUrl,
      });
    } catch (error) {
      if (effectivePolicy.fallbackMode === 'strict') {
        bus.publish('provider.error', {
          requested: providerId,
          reason: error.message,
        });
        throw error;
      }

      bus.publish('provider.fallback', {
        requested: providerId,
        reason: error.message,
        fallback: 'local.heuristic',
      });
      provider = await this.providerRegistry.create('local.heuristic', {});
    }

    const agentFactory = new AgentFactory({ provider, bus });
    const soulPromptSuffix = buildSoulPromptSuffix(context?.soul);
    const supervisor = agentFactory.create('supervisor', {
      id: 'supervisor-1',
      systemPromptSuffix: soulPromptSuffix,
    });

    let stepsUsed = 0;

    const supervisorResult = await supervisor.execute({
      goal,
      context,
      constraints: {
        maxAgents: this.limits.maxAgents,
        maxSteps: this.limits.maxSteps,
      },
    });
    stepsUsed += 1;

    const extractedPlan = extractJsonObject(supervisorResult.text);
    let planCandidate = extractedPlan && validatePlan(extractedPlan) ? extractedPlan : fallbackPlan(goal);
    if (extractedPlan && !validatePlan(extractedPlan)) {
      bus.publish('validation.warning', {
        stage: 'supervisor.plan',
        details: formatValidationErrors(validatePlan.errors || []),
      });
    }

    const parsedPlan = normalizePlan(planCandidate);
    if (!validatePlan(parsedPlan)) {
      bus.publish('validation.warning', {
        stage: 'normalized.plan',
        details: formatValidationErrors(validatePlan.errors || []),
      });
      planCandidate = fallbackPlan(goal);
    }
    const selectedTasks = normalizePlan(planCandidate).tasks.slice(0, this.limits.maxAgents);

    bus.publish('plan.created', {
      taskCount: selectedTasks.length,
      tasks: selectedTasks,
    });

    const outputs = [];
    const outputBudget = {
      deliverablesRemaining: Math.max(0, Number(this.limits.maxArtifacts || 20)),
      risksRemaining: Math.max(0, Number(this.limits.maxRisks || 20)),
    };

    for (const task of selectedTasks) {
      if (stepsUsed >= this.limits.maxSteps) {
        bus.publish('run.limit_reached', {
          reason: 'maxSteps',
          maxSteps: this.limits.maxSteps,
        });
        break;
      }

      const role = WORKER_ROLES.has(task.agentRole) ? task.agentRole : 'executor';
      const worker = agentFactory.create(role, {
        systemPromptSuffix: soulPromptSuffix,
      });

      const workerResult = await worker.execute({
        goal,
        task,
        priorOutputs: outputs.map((item) => item.parsed),
      });

      let parsed = normalizeWorkerOutput(parseWorkOutput(workerResult.text));
      if (!validateWorkerOutput(parsed)) {
        bus.publish('validation.warning', {
          stage: `worker.output.${task.id}`,
          details: formatValidationErrors(validateWorkerOutput.errors || []),
        });
        parsed = normalizeWorkerOutput(parseWorkOutput(''));
      }
      const beforeBudget = {
        deliverables: parsed.deliverables.length,
        risks: parsed.risks.length,
      };
      parsed = applyRunOutputBudgets(parsed, outputBudget);
      if (parsed.deliverables.length < beforeBudget.deliverables || parsed.risks.length < beforeBudget.risks) {
        bus.publish('output.trimmed', {
          taskId: task.id,
          deliverablesBefore: beforeBudget.deliverables,
          deliverablesAfter: parsed.deliverables.length,
          risksBefore: beforeBudget.risks,
          risksAfter: parsed.risks.length,
          deliverablesRemaining: outputBudget.deliverablesRemaining,
          risksRemaining: outputBudget.risksRemaining,
        });
      }
      outputs.push({
        task,
        role,
        raw: workerResult.text,
        parsed,
      });

      stepsUsed += 1;
      bus.publish('task.completed', {
        taskId: task.id,
        title: task.title,
        role,
        summary: parsed.summary,
      });
    }

    const iterativeEnabled = resolveIterativeExecutorEnabled(input, context);

    const toolWorkflow = await this.executeToolWorkflow({
      runId,
      goal,
      context,
      policy: effectivePolicy,
      bus,
      executeWrites,
      skipResearchWorkflow: iterativeEnabled,
    });
    const toolCalls = safeArray(toolWorkflow?.toolCalls);
    const policyState = toolWorkflow?.policyState || { writeActions: 0 };
    const goalSignals = toolWorkflow?.signals || this.getGoalSignals(goal);

    let iterativeMeta = null;
    if (iterativeEnabled) {
      const configuredIterations = resolveIterativeMaxSteps(input, context, 4);
      const remainingSteps = Math.max(0, this.limits.maxSteps - stepsUsed - 1);
      const maxIterations = Math.min(configuredIterations, remainingSteps);

      if (maxIterations > 0) {
        const shouldRunIterative = goalSignals.wantsResearch || context?.forceIterativeExecutor === true;
        if (shouldRunIterative) {
          const iterativeResult = await this.runIterativeExecutorLoop({
            runId,
            goal,
            context,
            policy: effectivePolicy,
            policyState,
            toolCalls,
            outputs,
            provider,
            bus,
            executeWrites,
            maxIterations,
          });
          stepsUsed += Number(iterativeResult?.usedSteps || 0);

          if (iterativeResult?.output) {
            let parsed = normalizeWorkerOutput(iterativeResult.output.parsed);
            const beforeBudget = {
              deliverables: parsed.deliverables.length,
              risks: parsed.risks.length,
            };
            parsed = applyRunOutputBudgets(parsed, outputBudget);
            if (parsed.deliverables.length < beforeBudget.deliverables || parsed.risks.length < beforeBudget.risks) {
              bus.publish('output.trimmed', {
                taskId: 'iterative-executor',
                deliverablesBefore: beforeBudget.deliverables,
                deliverablesAfter: parsed.deliverables.length,
                risksBefore: beforeBudget.risks,
                risksAfter: parsed.risks.length,
                deliverablesRemaining: outputBudget.deliverablesRemaining,
                risksRemaining: outputBudget.risksRemaining,
              });
            }
            outputs.push({
              ...iterativeResult.output,
              parsed,
            });

            bus.publish('task.completed', {
              taskId: 'iterative-executor',
              title: 'Iterative executor loop',
              role: 'executor',
              summary: parsed.summary,
            });
          }

          iterativeMeta = {
            enabled: true,
            maxIterations,
            usedSteps: iterativeResult?.usedSteps || 0,
            iterations: iterativeResult?.iterations || 0,
            finalMessage: iterativeResult?.finalMessage || '',
          };
        } else {
          iterativeMeta = {
            enabled: true,
            skipped: true,
            reason: 'goal_did_not_require_iterative_loop',
          };
        }
      } else {
        iterativeMeta = {
          enabled: true,
          skipped: true,
          reason: 'no_step_budget_remaining',
        };
      }
    } else {
      iterativeMeta = {
        enabled: false,
      };
    }

    const reviewer = agentFactory.create('reviewer', {
      id: 'reviewer-1',
      systemPromptSuffix: soulPromptSuffix,
    });
    const reviewResult = await reviewer.execute({
      goal,
      plan: selectedTasks,
      outputs: outputs.map((item) => item.parsed),
      toolCalls: toolCalls.map((call) => ({
        name: call.name,
        status: call.status,
        reason: call.reason,
        sideEffect: call.sideEffect,
      })),
    });
    stepsUsed += 1;

    const extractedReview = extractJsonObject(reviewResult.text);
    let reviewParsed = normalizeReviewOutput(extractedReview || fallbackReviewOutput());
    if (!validateReviewerOutput(reviewParsed)) {
      bus.publish('validation.warning', {
        stage: 'reviewer.output',
        details: formatValidationErrors(validateReviewerOutput.errors || []),
      });
      reviewParsed = fallbackReviewOutput();
    }

    const verifier = new Verifier({
      minScore: this.limits.minReviewScore,
      maxArtifacts: this.limits.maxArtifacts,
      maxRisks: this.limits.maxRisks,
    });
    const verification = verifier.verify({
      goal,
      outputs,
      review: reviewParsed,
      toolCalls,
    });

    const endedAt = nowIso();
    const status = deriveRunStatus({ verification, toolCalls });
    const availableTools = this.toolRegistry
      ? this.toolRegistry.list().map((tool) => ({
          name: tool.name,
          sideEffect: tool.sideEffect,
          supportsDryRun: tool.supportsDryRun,
          sourceModule: tool.sourceModule,
        }))
      : [];

    const record = {
      schemaVersion: RUN_SCHEMA_VERSION,
      id: runId,
      status,
      goal,
      contracts: this.contracts,
      storage: this.runStore?.storage?.describe ? this.runStore.storage.describe() : null,
      execution: {
        executeWrites,
        iterativeExecutor: iterativeMeta,
      },
      policy: effectivePolicy,
      provider: {
        id: provider.id,
        name: provider.name,
        model: provider.model,
      },
      tooling: {
        contractVersion: 1,
        availableTools,
        toolCalls,
      },
      context,
      plan: selectedTasks,
      outputs,
      review: reviewParsed,
      verification,
      startedAt,
      endedAt,
      stepsUsed,
      events: bus.getEvents(),
    };
    if (!validateRunRecord(record)) {
      const details = formatValidationErrors(validateRunRecord.errors || []);
      bus.publish('validation.error', {
        stage: 'run.record',
        details,
      });
      throw new Error(`Run record validation failed: ${details}`);
    }

    const recordPath = this.runStore ? await this.runStore.save(record) : null;

    bus.publish('run.completed', {
      runId,
      status,
      stepsUsed,
      recordPath,
    });

    return {
      ...record,
      recordPath,
    };
  }
}
