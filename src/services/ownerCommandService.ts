import {
  BusinessPlaybook,
  OwnerCommandAction,
  OwnerCommandMessage,
  OwnerCommandState,
  OwnerCommandThread,
} from '../types';

const parseError = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string') return data.error;
  } catch {
    // Use fallback below.
  }
  return `Request failed (${response.status})`;
};

const mapThread = (row: any): OwnerCommandThread => ({
  id: row.id,
  tenantId: row.tenant_id,
  title: row.title,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMessage = (row: any): OwnerCommandMessage => ({
  id: row.id,
  threadId: row.thread_id,
  tenantId: row.tenant_id,
  role: row.role,
  content: row.content,
  metadata: row.metadata || {},
  createdAt: row.created_at,
});

const mapAction = (row: any): OwnerCommandAction => ({
  id: row.id,
  tenantId: row.tenant_id,
  threadId: row.thread_id,
  messageId: row.message_id,
  actionType: row.action_type,
  status: row.status,
  targetTable: row.target_table,
  targetId: row.target_id,
  patchJson: row.patch_json || {},
  previewMarkdown: row.preview_markdown || '',
  riskLevel: row.risk_level || 'low',
  executedAt: row.executed_at,
  createdAt: row.created_at,
});

const mapPlaybook = (row: any): BusinessPlaybook | null => {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    vertical: row.vertical,
    status: row.status,
    servicesJson: row.services_json || [],
    pricingRulesJson: row.pricing_rules_json || {},
    bookingRulesJson: row.booking_rules_json || {},
    followupRulesJson: row.followup_rules_json || {},
    approvedClaimsJson: row.approved_claims_json || [],
    blockedClaimsJson: row.blocked_claims_json || [],
    escalationRulesJson: row.escalation_rules_json || [],
    playbookMarkdown: row.playbook_markdown || '',
    sourceSetupSessionId: row.source_setup_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const mapState = (data: any): OwnerCommandState => ({
  thread: data.thread ? mapThread(data.thread) : null,
  messages: Array.isArray(data.messages) ? data.messages.map(mapMessage) : [],
  actions: Array.isArray(data.actions) ? data.actions.map(mapAction) : [],
  playbook: mapPlaybook(data.playbook),
  playbookMarkdown: data.playbookMarkdown || data.playbook?.playbook_markdown || '',
});

export async function fetchOwnerCommandState(accessToken: string): Promise<OwnerCommandState> {
  const response = await fetch('/api/owner-command/state', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseError(response));
  return mapState(await response.json());
}

export async function sendOwnerCommand(input: {
  accessToken: string;
  message: string;
  threadId?: string | null;
}): Promise<OwnerCommandState> {
  const response = await fetch('/api/owner-command/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      message: input.message,
      threadId: input.threadId,
    }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return mapState(await response.json());
}

export async function decideOwnerCommandAction(input: {
  accessToken: string;
  actionId: string;
  decision: 'approve' | 'deny';
}): Promise<OwnerCommandState> {
  const response = await fetch(`/api/owner-command/actions/${input.actionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({ decision: input.decision }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return mapState(await response.json());
}
