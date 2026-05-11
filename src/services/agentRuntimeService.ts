export interface AgentRuntimeProvider {
  id: string;
  name: string;
  description: string;
  defaultModel: string | null;
  capabilities: Record<string, unknown>;
}

export interface AgentRuntimePlanTask {
  id: string;
  title: string;
  objective: string;
  agentRole: string;
}

export interface AgentRuntimeToolCall {
  id: string;
  name: string;
  status: string;
  reason: string | null;
  sideEffect: string | null;
  dryRun: boolean;
  error: string | null;
  actionId?: string;
}

export interface AgentRuntimeRunSummary {
  id: string;
  status: string;
  goal: string;
  provider: {
    id: string;
    name: string;
    model: string | null;
  };
  stepsUsed: number;
  review: {
    status: string;
    score: number;
  };
  verification: {
    passed: boolean;
    findings: string[];
  };
  plan: AgentRuntimePlanTask[];
  toolCalls: AgentRuntimeToolCall[];
  startedAt: string;
  endedAt: string;
}

export interface AgentRuntimeRunListItem {
  id: string;
  goal: string;
  status: string;
  provider: {
    id: string;
    name: string;
    model: string | null;
  };
  stepsUsed: number;
  score: number;
  reviewStatus: string | null;
  verificationPassed: boolean;
  startedAt: string;
  endedAt: string;
}

export interface AgentRuntimeAction {
  id: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  status: string;
  reason: string | null;
  decision: string | null;
  executionStatus: string | null;
  createdAt: string;
}

export interface AgentRuntimeChatResponse {
  assistantMessage: string;
  run: AgentRuntimeRunSummary;
  pendingActions: AgentRuntimeAction[];
}

export interface AgentRuntimeActionResponse {
  status: string;
  action: AgentRuntimeAction;
  run: AgentRuntimeRunSummary | null;
  pendingActions: AgentRuntimeAction[];
  message: string;
  error?: string;
}

export interface AgentObjective {
  id: string;
  workspaceId: string;
  title: string | null;
  goal: string;
  status: string;
  priority: string;
  channel: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  lastRunId: string | null;
  lastRunStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentObjectiveRunResponse {
  objective: AgentObjective;
  run: AgentRuntimeRunSummary;
  pendingActions: AgentRuntimeAction[];
  assistantMessage: string;
}

export interface AgentSoul {
  workspaceId: string;
  name: string;
  mission: string;
  principles: string[];
  guardrails: Record<string, unknown>;
  preferences: Record<string, unknown>;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentHeartbeat {
  workspaceId: string | null;
  latest: {
    id: string;
    source: string;
    status: string;
    metrics: Record<string, unknown>;
    note: string | null;
    createdAt: string;
  } | null;
  metrics: {
    objectivesPending: number;
    approvalsPending: number;
    runsLast24h: number;
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } catch {
    // Ignore JSON parse errors and use fallback text below.
  }
  return `Request failed (${response.status})`;
}

export async function fetchAgentRuntimeProviders(accessToken: string): Promise<AgentRuntimeProvider[]> {
  const response = await fetch('/api/agent-runtime/providers', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return Array.isArray(data?.providers) ? data.providers : [];
}

export async function runAgentRuntimeChat(input: {
  accessToken: string;
  message: string;
  providerId: string;
  executeWrites: boolean;
  approvalMode: 'AUTO' | 'REVIEW_REQUIRED' | 'BLOCKED';
  timezone?: string;
}): Promise<AgentRuntimeChatResponse> {
  const response = await fetch('/api/agent-runtime/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      message: input.message,
      providerId: input.providerId,
      executeWrites: input.executeWrites,
      approvalMode: input.approvalMode,
      timezone: input.timezone,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

export async function listAgentRuntimeActions(input: {
  accessToken: string;
  status?: string;
  runId?: string;
  limit?: number;
}): Promise<AgentRuntimeAction[]> {
  const query = new URLSearchParams();
  if (input.status) query.set('status', input.status);
  if (input.runId) query.set('runId', input.runId);
  if (typeof input.limit === 'number') query.set('limit', String(input.limit));

  const response = await fetch(`/api/agent-runtime/actions?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return Array.isArray(data?.actions) ? data.actions : [];
}

export async function processAgentRuntimeAction(input: {
  accessToken: string;
  actionId: string;
  decision: 'approve' | 'deny';
}): Promise<AgentRuntimeActionResponse> {
  const response = await fetch(`/api/agent-runtime/actions/${input.actionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      decision: input.decision,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

export async function listAgentRuntimeRuns(input: {
  accessToken: string;
  status?: string;
  limit?: number;
}): Promise<AgentRuntimeRunListItem[]> {
  const query = new URLSearchParams();
  if (input.status) query.set('status', input.status);
  if (typeof input.limit === 'number') query.set('limit', String(input.limit));

  const response = await fetch(`/api/agent-runtime/runs?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return Array.isArray(data?.runs) ? data.runs : [];
}

export async function fetchAgentRuntimeRun(input: {
  accessToken: string;
  runId: string;
}): Promise<AgentRuntimeRunSummary> {
  const response = await fetch(`/api/agent-runtime/runs/${input.runId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return data?.run;
}

export async function listAgentRuntimeObjectives(input: {
  accessToken: string;
  status?: string;
  limit?: number;
}): Promise<AgentObjective[]> {
  const query = new URLSearchParams();
  if (input.status) query.set('status', input.status);
  if (typeof input.limit === 'number') query.set('limit', String(input.limit));

  const response = await fetch(`/api/agent-runtime/objectives?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return Array.isArray(data?.objectives) ? data.objectives : [];
}

export async function createAgentRuntimeObjective(input: {
  accessToken: string;
  title?: string;
  goal: string;
  priority?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}): Promise<AgentObjective> {
  const response = await fetch('/api/agent-runtime/objectives', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      title: input.title,
      goal: input.goal,
      priority: input.priority,
      channel: input.channel,
      metadata: input.metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return data?.objective;
}

export async function runAgentRuntimeObjective(input: {
  accessToken: string;
  objectiveId: string;
  providerId: string;
  approvalMode: 'AUTO' | 'REVIEW_REQUIRED' | 'BLOCKED';
  executeWrites: boolean;
  timezone?: string;
}): Promise<AgentObjectiveRunResponse> {
  const response = await fetch(`/api/agent-runtime/objectives/${input.objectiveId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      providerId: input.providerId,
      approvalMode: input.approvalMode,
      executeWrites: input.executeWrites,
      timezone: input.timezone,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

export async function fetchAgentRuntimeSoul(input: {
  accessToken: string;
}): Promise<AgentSoul> {
  const response = await fetch('/api/agent-runtime/soul', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return data?.soul;
}

export async function updateAgentRuntimeSoul(input: {
  accessToken: string;
  patch: Partial<Pick<AgentSoul, 'name' | 'mission' | 'principles' | 'guardrails' | 'preferences'>>;
}): Promise<AgentSoul> {
  const response = await fetch('/api/agent-runtime/soul', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(input.patch || {}),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return data?.soul;
}

export async function fetchAgentRuntimeHeartbeat(input: {
  accessToken: string;
}): Promise<AgentHeartbeat> {
  const response = await fetch('/api/agent-runtime/heartbeat', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return data?.heartbeat;
}

export async function tickAgentRuntimeHeartbeat(input: {
  accessToken: string;
  source?: string;
  status?: string;
  note?: string;
  metrics?: Record<string, unknown>;
}): Promise<AgentHeartbeat> {
  const response = await fetch('/api/agent-runtime/heartbeat/tick', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      source: input.source,
      status: input.status,
      note: input.note,
      metrics: input.metrics,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return data?.heartbeat;
}
