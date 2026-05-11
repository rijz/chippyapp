import fs from 'node:fs/promises';
import path from 'node:path';
import { createId, nowIso } from '../core/utils.js';

const DEFAULT_RUN_DIR = path.resolve(process.cwd(), '.runs', 'agent-runtime');
const DEFAULT_DB_PATH = path.join(DEFAULT_RUN_DIR, 'runtime.db');
const DEFAULT_WORKSPACE_ID = 'local-workspace';
let DatabaseSyncCtor = null;

async function getDatabaseSyncCtor() {
  if (DatabaseSyncCtor) return DatabaseSyncCtor;
  const mod = await import('node:sqlite');
  DatabaseSyncCtor = mod.DatabaseSync;
  return DatabaseSyncCtor;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT,
  name TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  model TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_default_per_workspace
  ON provider_configs(workspace_id, is_default)
  WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS crm_contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  phone TEXT,
  status TEXT,
  source TEXT,
  service_interest TEXT,
  location_id TEXT,
  location_name TEXT,
  notes TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_contacts_workspace_email
  ON crm_contacts(workspace_id, lower(email));

CREATE INDEX IF NOT EXISTS ix_contacts_workspace_status
  ON crm_contacts(workspace_id, status);

CREATE TABLE IF NOT EXISTS crm_bookings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES crm_contacts(id) ON DELETE SET NULL,
  provider TEXT,
  external_event_id TEXT,
  requested_start TEXT,
  requested_end TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_bookings_workspace_status
  ON crm_bookings(workspace_id, status);

CREATE TABLE IF NOT EXISTS business_objectives (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  channel TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  last_run_id TEXT,
  last_run_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_objectives_workspace_status
  ON business_objectives(workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_objectives_workspace_updated
  ON business_objectives(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workspace_souls (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT,
  mission TEXT,
  principles_json TEXT NOT NULL DEFAULT '[]',
  guardrails_json TEXT NOT NULL DEFAULT '{}',
  preferences_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_heartbeats (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'ok',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_workspace_heartbeats_workspace_created
  ON workspace_heartbeats(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_email_threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  last_message_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_email_threads_workspace_status
  ON customer_email_threads(workspace_id, status);

CREATE TABLE IF NOT EXISTS customer_email_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES customer_email_threads(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  from_email TEXT,
  from_name TEXT,
  to_email TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT,
  in_reply_to_id TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_email_messages_workspace_status
  ON customer_email_messages(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_email_messages_thread
  ON customer_email_messages(thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_model TEXT,
  approval_mode TEXT NOT NULL,
  fallback_mode TEXT NOT NULL,
  max_tool_calls INTEGER NOT NULL,
  execute_writes INTEGER NOT NULL DEFAULT 0,
  steps_used INTEGER NOT NULL DEFAULT 0,
  score REAL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  context_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  outputs_json TEXT NOT NULL,
  review_json TEXT NOT NULL,
  verification_json TEXT NOT NULL,
  tooling_json TEXT NOT NULL,
  run_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_agent_runs_workspace_started
  ON agent_runs(workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  task_id TEXT,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  agent_role TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  deliverables_json TEXT NOT NULL DEFAULT '[]',
  risks_json TEXT NOT NULL DEFAULT '[]',
  questions_json TEXT NOT NULL DEFAULT '[]',
  next_actions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_agent_steps_run_order
  ON agent_steps(run_id, step_order);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  side_effect TEXT,
  dry_run INTEGER NOT NULL DEFAULT 1,
  attempts INTEGER NOT NULL DEFAULT 0,
  approval_mode TEXT,
  idempotency_key TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_agent_tool_calls_run
  ON agent_tool_calls(run_id);

CREATE TABLE IF NOT EXISTS approval_actions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  side_effect TEXT,
  reason TEXT,
  idempotency_key TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  context_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  duplicate_of TEXT,
  decision TEXT,
  decided_by TEXT,
  decided_at TEXT,
  execution_status TEXT,
  execution_result_json TEXT,
  execution_error TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_approval_actions_status
  ON approval_actions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_approval_actions_workspace
  ON approval_actions(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_approval_actions_run
  ON approval_actions(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  event_order INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_agent_events_run_order
  ON agent_events(run_id, event_order);
`;

function parseJson(raw, fallback = null) {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function toJson(value, fallback = {}) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function resolveWorkspaceId(input = {}) {
  const value = input.tenantId || input.userId || input.workspaceId || input?.fixture?.tenantId || DEFAULT_WORKSPACE_ID;
  const normalized = String(value || '').trim();
  return normalized || DEFAULT_WORKSPACE_ID;
}

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value || null;
}

function normalizeLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || null,
    email: row.email || null,
    phone: row.phone || null,
    status: row.status || null,
    source: row.source || null,
    serviceInterest: row.service_interest || null,
    locationId: row.location_id || null,
    locationName: row.location_name || null,
    notes: row.notes || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function nullableText(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    toolCallId: row.tool_call_id,
    workspaceId: row.workspace_id,
    toolName: row.tool_name,
    sideEffect: row.side_effect || null,
    reason: row.reason || null,
    idempotencyKey: row.idempotency_key,
    input: parseJson(row.input_json, {}),
    context: parseJson(row.context_json, {}),
    status: row.status,
    duplicateOf: row.duplicate_of || null,
    decision: row.decision || null,
    decidedBy: row.decided_by || null,
    decidedAt: row.decided_at || null,
    executionStatus: row.execution_status || null,
    executionResult: parseJson(row.execution_result_json, null),
    executionError: row.execution_error || null,
    executedAt: row.executed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeObjective(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title || null,
    goal: row.goal || '',
    status: row.status || 'pending',
    priority: row.priority || 'normal',
    channel: row.channel || null,
    metadata: parseJson(row.metadata_json, {}) || {},
    createdBy: row.created_by || null,
    lastRunId: row.last_run_id || null,
    lastRunStatus: row.last_run_status || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSoul(row) {
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    name: row.name || 'Business Brain',
    mission: row.mission || 'Operate and improve business workflows safely.',
    principles: parseJson(row.principles_json, []) || [],
    guardrails: parseJson(row.guardrails_json, {}) || {},
    preferences: parseJson(row.preferences_json, {}) || {},
    updatedBy: row.updated_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeHeartbeat(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    source: row.source || 'system',
    status: row.status || 'ok',
    metrics: parseJson(row.metrics_json, {}) || {},
    note: row.note || null,
    createdAt: row.created_at,
  };
}

function normalizeEmailMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    threadId: row.thread_id,
    workspaceId: row.workspace_id,
    direction: row.direction,
    fromEmail: row.from_email || null,
    fromName: row.from_name || null,
    toEmail: row.to_email || null,
    subject: row.subject || '',
    body: row.body || '',
    status: row.status || 'open',
    source: row.source || null,
    inReplyToId: row.in_reply_to_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deriveRunStatusFromRecord(run) {
  const calls = Array.isArray(run?.tooling?.toolCalls) ? run.tooling.toolCalls : [];
  if (calls.some((call) => call?.status === 'pending_review')) {
    return 'awaiting_approval';
  }
  if (calls.some((call) => call?.status === 'blocked_policy')) {
    return 'blocked_policy';
  }
  if (run?.verification?.passed === true) {
    return 'completed';
  }
  return 'needs_revision';
}

export class SqliteStorageAdapter {
  constructor({ runDir = DEFAULT_RUN_DIR, dbPath = DEFAULT_DB_PATH } = {}) {
    this.runDir = path.resolve(runDir);
    this.dbPath = path.resolve(dbPath);
    this.db = null;
    this.ready = false;
  }

  describe() {
    return {
      backend: 'sqlite',
      dbPath: this.dbPath,
      runDir: this.runDir,
    };
  }

  async ensureReady() {
    if (this.ready) return;

    await fs.mkdir(this.runDir, { recursive: true });
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

    const DatabaseSync = await getDatabaseSyncCtor();
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec(SCHEMA_SQL);

    const now = nowIso();
    this.db.prepare(`
      INSERT INTO schema_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run('agent_runtime_schema_version', '5', now);

    this.ready = true;
  }

  async ensureWorkspace({ workspaceId, workspaceName = null }) {
    await this.ensureReady();
    const now = nowIso();
    const resolvedWorkspaceId = resolveWorkspaceId({ workspaceId });
    const slug = resolvedWorkspaceId.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const name = workspaceName || resolvedWorkspaceId;

    this.db.prepare(`
      INSERT INTO workspaces (id, slug, name, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, '{}', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        name = COALESCE(workspaces.name, excluded.name),
        updated_at = excluded.updated_at
    `).run(resolvedWorkspaceId, slug, name, now, now);

    return resolvedWorkspaceId;
  }

  normalizeObjectivePriority(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['low', 'normal', 'high', 'critical'].includes(normalized)) {
      return normalized;
    }
    return 'normal';
  }

  async createObjective({
    workspaceId,
    title = null,
    goal,
    priority = 'normal',
    channel = 'manual',
    metadata = {},
    createdBy = null,
  } = {}) {
    await this.ensureReady();
    const normalizedGoal = nullableText(goal);
    if (!normalizedGoal) {
      throw new Error('createObjective: goal is required');
    }

    const resolvedWorkspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId({ workspaceId }),
    });

    const now = nowIso();
    const objectiveId = createId('obj');
    this.db.prepare(`
      INSERT INTO business_objectives (
        id, workspace_id, title, goal, status, priority, channel, metadata_json,
        created_by, last_run_id, last_run_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(
      objectiveId,
      resolvedWorkspaceId,
      nullableText(title),
      normalizedGoal,
      this.normalizeObjectivePriority(priority),
      nullableText(channel),
      toJson(metadata || {}, {}),
      nullableText(createdBy),
      now,
      now,
    );

    const row = this.db.prepare(`
      SELECT *
      FROM business_objectives
      WHERE id = ?
      LIMIT 1
    `).get(objectiveId);
    return normalizeObjective(row);
  }

  async listObjectives({ workspaceId, status = 'all', limit = 25 } = {}) {
    await this.ensureReady();
    const resolvedWorkspaceId = resolveWorkspaceId({ workspaceId });
    const filters = ['workspace_id = ?'];
    const values = [resolvedWorkspaceId];

    if (status && status !== 'all') {
      filters.push('status = ?');
      values.push(String(status));
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const maxRows = Number(limit) > 0 ? Number(limit) : 25;
    const rows = this.db.prepare(`
      SELECT *
      FROM business_objectives
      ${where}
      ORDER BY updated_at DESC
      LIMIT ${Math.min(maxRows, 200)}
    `).all(...values);
    return rows.map(normalizeObjective);
  }

  async getObjective({ objectiveId, workspaceId } = {}) {
    await this.ensureReady();
    if (!objectiveId) return null;

    const filters = ['id = ?'];
    const values = [String(objectiveId)];
    if (workspaceId) {
      filters.push('workspace_id = ?');
      values.push(resolveWorkspaceId({ workspaceId }));
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const row = this.db.prepare(`
      SELECT *
      FROM business_objectives
      ${where}
      LIMIT 1
    `).get(...values);
    return normalizeObjective(row);
  }

  async updateObjective({ objectiveId, workspaceId, patch = {} } = {}) {
    await this.ensureReady();
    if (!objectiveId) {
      throw new Error('updateObjective: objectiveId is required');
    }

    const existing = await this.getObjective({ objectiveId, workspaceId });
    if (!existing) return null;

    const now = nowIso();
    const mergedMetadata = patch?.metadataMerge && typeof patch.metadataMerge === 'object'
      ? { ...(existing.metadata || {}), ...patch.metadataMerge }
      : (patch?.metadataReplace && typeof patch.metadataReplace === 'object'
          ? patch.metadataReplace
          : existing.metadata || {});

    const updated = {
      title: patch.title !== undefined ? nullableText(patch.title) : existing.title,
      goal: patch.goal !== undefined ? (nullableText(patch.goal) || existing.goal) : existing.goal,
      status: patch.status !== undefined ? String(patch.status) : existing.status,
      priority: patch.priority !== undefined ? this.normalizeObjectivePriority(patch.priority) : existing.priority,
      channel: patch.channel !== undefined ? nullableText(patch.channel) : existing.channel,
      metadata: mergedMetadata,
      createdBy: existing.createdBy,
      lastRunId: patch.lastRunId !== undefined ? nullableText(patch.lastRunId) : existing.lastRunId,
      lastRunStatus: patch.lastRunStatus !== undefined ? nullableText(patch.lastRunStatus) : existing.lastRunStatus,
    };

    this.db.prepare(`
      UPDATE business_objectives
      SET title = ?,
          goal = ?,
          status = ?,
          priority = ?,
          channel = ?,
          metadata_json = ?,
          last_run_id = ?,
          last_run_status = ?,
          updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      updated.title,
      updated.goal,
      updated.status,
      updated.priority,
      updated.channel,
      toJson(updated.metadata, {}),
      updated.lastRunId,
      updated.lastRunStatus,
      now,
      existing.id,
      existing.workspaceId,
    );

    return this.getObjective({ objectiveId: existing.id, workspaceId: existing.workspaceId });
  }

  async getSoul({ workspaceId } = {}) {
    await this.ensureReady();
    const resolvedWorkspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId({ workspaceId }),
    });

    const existing = this.db.prepare(`
      SELECT *
      FROM workspace_souls
      WHERE workspace_id = ?
      LIMIT 1
    `).get(resolvedWorkspaceId);

    if (existing) {
      return normalizeSoul(existing);
    }

    const now = nowIso();
    this.db.prepare(`
      INSERT INTO workspace_souls (
        workspace_id, name, mission, principles_json, guardrails_json, preferences_json,
        updated_by, created_at, updated_at
      ) VALUES (?, 'Business Brain', 'Operate and improve business workflows safely.', '[]', '{}', '{}', NULL, ?, ?)
      ON CONFLICT(workspace_id) DO NOTHING
    `).run(resolvedWorkspaceId, now, now);

    const created = this.db.prepare(`
      SELECT *
      FROM workspace_souls
      WHERE workspace_id = ?
      LIMIT 1
    `).get(resolvedWorkspaceId);
    return normalizeSoul(created);
  }

  async upsertSoul({ workspaceId, patch = {}, updatedBy = null } = {}) {
    await this.ensureReady();
    const existing = await this.getSoul({ workspaceId });
    const resolvedWorkspaceId = existing.workspaceId;
    const now = nowIso();

    const safePrinciples = Array.isArray(patch.principles)
      ? patch.principles.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : existing.principles;

    const mergedGuardrails = patch.guardrails && typeof patch.guardrails === 'object'
      ? patch.guardrails
      : existing.guardrails;

    const mergedPreferences = patch.preferences && typeof patch.preferences === 'object'
      ? patch.preferences
      : existing.preferences;

    this.db.prepare(`
      INSERT INTO workspace_souls (
        workspace_id, name, mission, principles_json, guardrails_json, preferences_json,
        updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        name = excluded.name,
        mission = excluded.mission,
        principles_json = excluded.principles_json,
        guardrails_json = excluded.guardrails_json,
        preferences_json = excluded.preferences_json,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(
      resolvedWorkspaceId,
      nullableText(patch.name) || existing.name || 'Business Brain',
      nullableText(patch.mission) || existing.mission || 'Operate and improve business workflows safely.',
      toJson(safePrinciples, []),
      toJson(mergedGuardrails, {}),
      toJson(mergedPreferences, {}),
      nullableText(updatedBy),
      existing.createdAt || now,
      now,
    );

    return this.getSoul({ workspaceId: resolvedWorkspaceId });
  }

  async recordHeartbeat({
    workspaceId,
    source = 'system',
    status = 'ok',
    metrics = {},
    note = null,
  } = {}) {
    await this.ensureReady();
    const resolvedWorkspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId({ workspaceId }),
    });
    const now = nowIso();
    const heartbeatId = createId('hb');

    this.db.prepare(`
      INSERT INTO workspace_heartbeats (
        id, workspace_id, source, status, metrics_json, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      heartbeatId,
      resolvedWorkspaceId,
      nullableText(source) || 'system',
      nullableText(status) || 'ok',
      toJson(metrics, {}),
      nullableText(note),
      now,
    );

    const row = this.db.prepare(`
      SELECT *
      FROM workspace_heartbeats
      WHERE id = ?
      LIMIT 1
    `).get(heartbeatId);
    return normalizeHeartbeat(row);
  }

  async getLatestHeartbeat({ workspaceId } = {}) {
    await this.ensureReady();
    const resolvedWorkspaceId = resolveWorkspaceId({ workspaceId });
    const row = this.db.prepare(`
      SELECT *
      FROM workspace_heartbeats
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(resolvedWorkspaceId);
    return normalizeHeartbeat(row);
  }

  async getHeartbeatSummary({ workspaceId } = {}) {
    await this.ensureReady();
    const resolvedWorkspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId({ workspaceId }),
    });

    const latest = await this.getLatestHeartbeat({ workspaceId: resolvedWorkspaceId });
    const objectivesPending = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM business_objectives
      WHERE workspace_id = ? AND status IN ('pending', 'running', 'awaiting_approval')
    `).get(resolvedWorkspaceId)?.count || 0;

    const approvalsPending = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM approval_actions
      WHERE workspace_id = ? AND status = 'pending_review'
    `).get(resolvedWorkspaceId)?.count || 0;

    const runsLast24h = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM agent_runs
      WHERE workspace_id = ? AND started_at >= ?
    `).get(
      resolvedWorkspaceId,
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    )?.count || 0;

    return {
      workspaceId: resolvedWorkspaceId,
      latest,
      metrics: {
        objectivesPending: Number(objectivesPending || 0),
        approvalsPending: Number(approvalsPending || 0),
        runsLast24h: Number(runsLast24h || 0),
      },
    };
  }

  async seedFixtureContacts(context = {}) {
    const fixture = context?.fixture;
    if (!fixture || !Array.isArray(fixture.leads) || fixture.leads.length === 0) {
      return;
    }

    const workspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId(context),
      workspaceName: nullableText(fixture.companyName),
    });

    const now = nowIso();
    const statement = this.db.prepare(`
      INSERT INTO crm_contacts (
        id, workspace_id, email, name, phone, status, source, service_interest,
        location_id, location_name, notes, tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = COALESCE(excluded.email, crm_contacts.email),
        name = COALESCE(excluded.name, crm_contacts.name),
        phone = COALESCE(excluded.phone, crm_contacts.phone),
        status = COALESCE(excluded.status, crm_contacts.status),
        source = COALESCE(excluded.source, crm_contacts.source),
        service_interest = COALESCE(excluded.service_interest, crm_contacts.service_interest),
        location_id = COALESCE(excluded.location_id, crm_contacts.location_id),
        location_name = COALESCE(excluded.location_name, crm_contacts.location_name),
        notes = COALESCE(excluded.notes, crm_contacts.notes),
        updated_at = excluded.updated_at
    `);

    for (const lead of fixture.leads) {
      const leadId = nullableText(lead?.id) || createId('lead');
      statement.run(
        leadId,
        workspaceId,
        normalizeEmail(lead?.email),
        nullableText(lead?.name),
        nullableText(lead?.phone),
        nullableText(lead?.status),
        nullableText(lead?.source),
        nullableText(lead?.service || lead?.serviceInterest),
        nullableText(lead?.location_id || lead?.locationId),
        nullableText(lead?.location_name || lead?.locationName),
        nullableText(lead?.notes),
        nullableText(lead?.created_at || lead?.createdAt) || now,
        now,
      );
    }
  }

  async lookupLead({ tenantId, leadId, email, context = {} } = {}) {
    await this.ensureReady();
    await this.seedFixtureContacts(context);

    const workspaceId = resolveWorkspaceId({
      tenantId,
      userId: context?.userId,
      workspaceId: context?.workspaceId,
      fixture: context?.fixture,
    });
    await this.ensureWorkspace({
      workspaceId,
      workspaceName: nullableText(context?.companyName || context?.fixture?.companyName),
    });

    const db = this.db;
    let row = null;
    if (leadId) {
      row = db.prepare(`
        SELECT *
        FROM crm_contacts
        WHERE workspace_id = ? AND id = ?
        LIMIT 1
      `).get(workspaceId, String(leadId));
    } else if (email) {
      row = db.prepare(`
        SELECT *
        FROM crm_contacts
        WHERE workspace_id = ? AND lower(email) = lower(?)
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(workspaceId, String(email));
    } else {
      row = db.prepare(`
        SELECT *
        FROM crm_contacts
        WHERE workspace_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(workspaceId);
    }

    return normalizeLead(row);
  }

  async ensureEmailThread({ workspaceId, threadId, customerEmail, customerName = null, subject = null }) {
    await this.ensureReady();
    const now = nowIso();
    const resolvedThreadId = nullableText(threadId) || createId('thread');
    const resolvedCustomerEmail = normalizeEmail(customerEmail);
    if (!resolvedCustomerEmail) {
      throw new Error('ensureEmailThread: customerEmail is required');
    }

    this.db.prepare(`
      INSERT INTO customer_email_threads (
        id, workspace_id, customer_email, customer_name, subject, status, last_message_at,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'open', ?, '{}', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        customer_email = excluded.customer_email,
        customer_name = COALESCE(excluded.customer_name, customer_email_threads.customer_name),
        subject = COALESCE(excluded.subject, customer_email_threads.subject),
        last_message_at = excluded.last_message_at,
        updated_at = excluded.updated_at
    `).run(
      resolvedThreadId,
      workspaceId,
      resolvedCustomerEmail,
      nullableText(customerName),
      nullableText(subject),
      now,
      now,
      now,
    );

    return resolvedThreadId;
  }

  async seedFixtureEmails(context = {}) {
    const fixture = context?.fixture;
    if (!fixture || !Array.isArray(fixture.emails) || fixture.emails.length === 0) {
      return;
    }

    const workspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId(context),
      workspaceName: nullableText(fixture.companyName),
    });
    const now = nowIso();

    for (const email of fixture.emails) {
      const customerEmail = normalizeEmail(email?.fromEmail || email?.customerEmail || email?.email);
      if (!customerEmail) continue;
      const threadId = await this.ensureEmailThread({
        workspaceId,
        threadId: email?.threadId,
        customerEmail,
        customerName: email?.fromName || email?.customerName || null,
        subject: email?.subject || null,
      });

      const messageId = nullableText(email?.id) || createId('msg');
      this.db.prepare(`
        INSERT INTO customer_email_messages (
          id, thread_id, workspace_id, direction, from_email, from_name, to_email,
          subject, body, status, source, in_reply_to_id, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          from_email = excluded.from_email,
          from_name = excluded.from_name,
          to_email = excluded.to_email,
          subject = excluded.subject,
          body = excluded.body,
          status = excluded.status,
          source = excluded.source,
          in_reply_to_id = excluded.in_reply_to_id,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
      `).run(
        messageId,
        threadId,
        workspaceId,
        customerEmail,
        nullableText(email?.fromName || email?.customerName),
        normalizeEmail(email?.toEmail || context?.ownerEmail || null),
        nullableText(email?.subject) || 'New customer inquiry',
        nullableText(email?.body) || '',
        nullableText(email?.status) || 'open',
        nullableText(email?.source) || 'fixture',
        nullableText(email?.inReplyToId),
        toJson(email, {}),
        nullableText(email?.receivedAt || email?.createdAt) || now,
        now,
      );
    }
  }

  async upsertInboundEmail({
    tenantId,
    message,
    context = {},
  } = {}) {
    await this.ensureReady();
    if (!message || typeof message !== 'object') {
      throw new Error('upsertInboundEmail: message is required');
    }

    const workspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId({
        tenantId,
        userId: context?.userId,
        workspaceId: context?.workspaceId,
        fixture: context?.fixture,
      }),
      workspaceName: nullableText(context?.companyName || context?.fixture?.companyName),
    });

    const customerEmail = normalizeEmail(
      message.fromEmail
      || message.customerEmail
      || message.email
      || message.toEmail
    );
    if (!customerEmail) {
      throw new Error('upsertInboundEmail: fromEmail is required');
    }

    const threadId = await this.ensureEmailThread({
      workspaceId,
      threadId: message.threadId || message.gmailThreadId,
      customerEmail,
      customerName: message.fromName || message.customerName || null,
      subject: message.subject || null,
    });

    const messageId = nullableText(message.id || message.gmailMessageId) || createId('msg');
    const now = nowIso();
    const createdAt = nullableText(message.receivedAt || message.createdAt) || now;
    const status = nullableText(message.status) || 'open';

    this.db.prepare(`
      INSERT INTO customer_email_messages (
        id, thread_id, workspace_id, direction, from_email, from_name, to_email,
        subject, body, status, source, in_reply_to_id, raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        thread_id = excluded.thread_id,
        from_email = excluded.from_email,
        from_name = excluded.from_name,
        to_email = excluded.to_email,
        subject = excluded.subject,
        body = excluded.body,
        status = excluded.status,
        source = excluded.source,
        in_reply_to_id = excluded.in_reply_to_id,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(
      messageId,
      threadId,
      workspaceId,
      customerEmail,
      nullableText(message.fromName || message.customerName),
      normalizeEmail(message.toEmail || context?.ownerEmail || null),
      nullableText(message.subject) || 'New customer inquiry',
      nullableText(message.body) || '',
      status,
      nullableText(message.source) || 'external',
      nullableText(message.inReplyToId || message.messageIdHeader),
      toJson(message.raw || message, {}),
      createdAt,
      now,
    );

    const row = this.db.prepare(`
      SELECT *
      FROM customer_email_messages
      WHERE id = ?
      LIMIT 1
    `).get(messageId);
    return normalizeEmailMessage(row);
  }

  async listInboxMessages({ tenantId, limit = 10, context = {}, status = 'open' } = {}) {
    await this.ensureReady();
    await this.seedFixtureContacts(context);
    await this.seedFixtureEmails(context);

    const workspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId({
        tenantId,
        userId: context?.userId,
        workspaceId: context?.workspaceId,
        fixture: context?.fixture,
      }),
      workspaceName: nullableText(context?.companyName || context?.fixture?.companyName),
    });

    const maxRows = Number(limit) > 0 ? Math.min(Number(limit), 100) : 10;
    const values = [workspaceId, 'inbound'];
    let where = `workspace_id = ? AND direction = ?`;

    if (status && status !== 'all') {
      where += ' AND status = ?';
      values.push(String(status));
    }

    const rows = this.db.prepare(`
      SELECT *
      FROM customer_email_messages
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ${maxRows}
    `).all(...values);

    return rows.map(normalizeEmailMessage);
  }

  async updateEmailMessageStatus({ messageId, status = 'open', note = null } = {}) {
    await this.ensureReady();
    const now = nowIso();
    const existing = this.db.prepare(`
      SELECT raw_json
      FROM customer_email_messages
      WHERE id = ?
      LIMIT 1
    `).get(String(messageId));
    const raw = parseJson(existing?.raw_json || '{}', {}) || {};
    if (note) {
      raw.statusNote = String(note);
    }

    this.db.prepare(`
      UPDATE customer_email_messages
      SET status = ?, raw_json = ?, updated_at = ?
      WHERE id = ?
    `).run(String(status), JSON.stringify(raw), now, String(messageId));

    const row = this.db.prepare(`
      SELECT *
      FROM customer_email_messages
      WHERE id = ?
      LIMIT 1
    `).get(String(messageId));
    return normalizeEmailMessage(row);
  }

  async recordOutboundEmail({
    tenantId,
    threadId,
    toEmail,
    toName = null,
    subject,
    body,
    source = 'agent-runtime',
    inReplyToId = null,
    status = 'sent',
    context = {},
  } = {}) {
    await this.ensureReady();
    const workspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId({
        tenantId,
        userId: context?.userId,
        workspaceId: context?.workspaceId,
        fixture: context?.fixture,
      }),
      workspaceName: nullableText(context?.companyName || context?.fixture?.companyName),
    });

    const now = nowIso();
    const resolvedThreadId = await this.ensureEmailThread({
      workspaceId,
      threadId,
      customerEmail: toEmail,
      customerName: toName,
      subject,
    });

    const messageId = createId('msg');
    this.db.prepare(`
      INSERT INTO customer_email_messages (
        id, thread_id, workspace_id, direction, from_email, from_name, to_email,
        subject, body, status, source, in_reply_to_id, raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
    `).run(
      messageId,
      resolvedThreadId,
      workspaceId,
      normalizeEmail(context?.ownerEmail || context?.fromEmail || 'notifications@hellochippy.com'),
      nullableText(context?.companyName) || 'Chippy',
      normalizeEmail(toEmail),
      nullableText(subject) || 'Reply from Chippy',
      nullableText(body) || '',
      String(status),
      nullableText(source),
      nullableText(inReplyToId),
      now,
      now,
    );

    this.db.prepare(`
      UPDATE customer_email_threads
      SET last_message_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, resolvedThreadId);

    const row = this.db.prepare(`
      SELECT *
      FROM customer_email_messages
      WHERE id = ?
      LIMIT 1
    `).get(messageId);
    return normalizeEmailMessage(row);
  }

  async enqueuePendingToolCall({
    runId,
    toolCallId,
    toolName,
    sideEffect = 'write',
    reason = '',
    idempotencyKey,
    input = {},
    context = {},
  } = {}) {
    await this.ensureReady();

    if (!runId) throw new Error('enqueuePendingToolCall: runId is required');
    if (!toolCallId) throw new Error('enqueuePendingToolCall: toolCallId is required');
    if (!toolName) throw new Error('enqueuePendingToolCall: toolName is required');

    const workspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId(context),
      workspaceName: nullableText(context?.companyName || context?.fixture?.companyName),
    });
    const key = String(idempotencyKey || `${toolName}:${JSON.stringify(input || {})}`);
    const now = nowIso();
    const windowHours = Number(context?.idempotencyWindowHours ?? 24);
    const cutoff = Number.isFinite(windowHours) && windowHours > 0
      ? new Date(Date.now() - (windowHours * 60 * 60 * 1000)).toISOString()
      : '1970-01-01T00:00:00.000Z';

    const existing = this.db.prepare(`
      SELECT id, status
      FROM approval_actions
      WHERE workspace_id = ?
        AND tool_name = ?
        AND idempotency_key = ?
        AND status IN ('pending_review', 'approved', 'executed')
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(workspaceId, String(toolName), key, cutoff);

    if (existing) {
      return {
        actionId: existing.id,
        status: existing.status,
        duplicate: true,
        duplicateOf: existing.id,
      };
    }

    const actionId = createId('action');
    this.db.prepare(`
      INSERT INTO approval_actions (
        id, run_id, tool_call_id, workspace_id, tool_name, side_effect, reason,
        idempotency_key, input_json, context_json, status, duplicate_of, decision,
        decided_by, decided_at, execution_status, execution_result_json, execution_error,
        executed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
    `).run(
      actionId,
      String(runId),
      String(toolCallId),
      workspaceId,
      String(toolName),
      nullableText(sideEffect),
      nullableText(reason),
      key,
      toJson(input, {}),
      toJson(context, {}),
      now,
      now,
    );

    return {
      actionId,
      status: 'pending_review',
      duplicate: false,
      duplicateOf: null,
    };
  }

  async listActions({ status = 'pending_review', runId, workspaceId, limit = 50 } = {}) {
    await this.ensureReady();

    const filters = [];
    const values = [];

    if (status && status !== 'all') {
      filters.push('status = ?');
      values.push(String(status));
    }
    if (runId) {
      filters.push('run_id = ?');
      values.push(String(runId));
    }
    if (workspaceId) {
      filters.push('workspace_id = ?');
      values.push(String(workspaceId));
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const maxRows = Number(limit) > 0 ? Number(limit) : 50;
    const sql = `
      SELECT *
      FROM approval_actions
      ${where}
      ORDER BY created_at DESC
      LIMIT ${Math.min(maxRows, 500)}
    `;
    const rows = this.db.prepare(sql).all(...values);
    return rows.map(normalizeAction);
  }

  async getAction(actionId) {
    await this.ensureReady();
    const row = this.db.prepare(`
      SELECT *
      FROM approval_actions
      WHERE id = ?
      LIMIT 1
    `).get(String(actionId));
    return normalizeAction(row);
  }

  async decideAction({ actionId, decision, decidedBy = 'cli' } = {}) {
    await this.ensureReady();
    const existing = await this.getAction(actionId);
    if (!existing) {
      throw new Error(`Action not found: ${actionId}`);
    }

    const normalized = String(decision || '').toLowerCase();
    if (!['approve', 'deny'].includes(normalized)) {
      throw new Error(`Invalid decision: ${decision}. Use approve or deny.`);
    }

    if (existing.status === 'executed') {
      return existing;
    }
    if (existing.status === 'executing') {
      return existing;
    }
    if (existing.status === 'denied' && normalized === 'deny') {
      return existing;
    }
    if (existing.status === 'denied' && normalized === 'approve') {
      throw new Error(`Action ${actionId} is denied and cannot be directly approved.`);
    }

    const status = normalized === 'approve' ? 'approved' : 'denied';
    const now = nowIso();
    const update = this.db.prepare(`
      UPDATE approval_actions
      SET status = ?, decision = ?, decided_by = ?, decided_at = ?, updated_at = ?
      WHERE id = ?
        AND status IN ('pending_review', 'approved')
    `).run(status, normalized, String(decidedBy), now, now, String(actionId));

    if (Number(update?.changes || 0) === 0) {
      return this.getAction(actionId);
    }

    return this.getAction(actionId);
  }

  async claimActionExecution({ actionId, claimedBy = 'cli' } = {}) {
    await this.ensureReady();
    const existing = await this.getAction(actionId);
    if (!existing) {
      throw new Error(`Action not found: ${actionId}`);
    }

    if (existing.status === 'executed') return existing;
    if (existing.status === 'executing') return existing;
    if (existing.status !== 'approved') {
      throw new Error(`Action ${actionId} cannot be claimed from status "${existing.status}".`);
    }

    const now = nowIso();
    const update = this.db.prepare(`
      UPDATE approval_actions
      SET status = 'executing',
          execution_status = 'executing',
          updated_at = ?
      WHERE id = ?
        AND status = 'approved'
    `).run(now, String(actionId));

    if (Number(update?.changes || 0) === 0) {
      return this.getAction(actionId);
    }

    const action = await this.getAction(actionId);
    return {
      ...action,
      claimedBy,
    };
  }

  async finalizeActionExecution({ actionId, executionStatus, result = null, error = null } = {}) {
    await this.ensureReady();
    const existing = await this.getAction(actionId);
    if (!existing) {
      throw new Error(`Action not found: ${actionId}`);
    }

    const normalized = String(executionStatus || '').toLowerCase();
    if (!['executed', 'failed'].includes(normalized)) {
      throw new Error(`Invalid executionStatus: ${executionStatus}. Use executed or failed.`);
    }
    if (!['executing', 'approved', 'failed', 'executed'].includes(existing.status)) {
      throw new Error(`Action ${actionId} cannot be finalized from status "${existing.status}".`);
    }

    const now = nowIso();
    const update = this.db.prepare(`
      UPDATE approval_actions
      SET status = ?,
          execution_status = ?,
          execution_result_json = ?,
          execution_error = ?,
          executed_at = ?,
          updated_at = ?
      WHERE id = ?
        AND status IN ('executing', 'approved', 'failed', 'executed')
    `).run(
      normalized,
      normalized,
      result === null ? null : JSON.stringify(result),
      nullableText(error),
      now,
      now,
      String(actionId),
    );

    if (Number(update?.changes || 0) === 0) {
      return this.getAction(actionId);
    }

    return this.getAction(actionId);
  }

  async markActionExecution({ actionId, executionStatus, result = null, error = null } = {}) {
    return this.finalizeActionExecution({ actionId, executionStatus, result, error });
  }

  async saveRun(record) {
    await this.ensureReady();

    const context = record?.context || {};
    const workspaceId = await this.ensureWorkspace({
      workspaceId: resolveWorkspaceId(context),
      workspaceName: nullableText(context?.companyName || context?.fixture?.companyName),
    });
    const now = nowIso();
    const runJson = JSON.stringify(record);
    const steps = Array.isArray(record?.plan) ? record.plan : [];
    const outputs = Array.isArray(record?.outputs) ? record.outputs : [];
    const toolCalls = Array.isArray(record?.tooling?.toolCalls) ? record.tooling.toolCalls : [];
    const events = Array.isArray(record?.events) ? record.events : [];

    try {
      this.db.exec('BEGIN');
      this.db.prepare(`
        INSERT INTO agent_runs (
          id, schema_version, workspace_id, goal, status, provider_id, provider_name, provider_model,
          approval_mode, fallback_mode, max_tool_calls, execute_writes, steps_used, score,
          started_at, ended_at, policy_json, context_json, plan_json, outputs_json, review_json,
          verification_json, tooling_json, run_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          schema_version = excluded.schema_version,
          workspace_id = excluded.workspace_id,
          goal = excluded.goal,
          status = excluded.status,
          provider_id = excluded.provider_id,
          provider_name = excluded.provider_name,
          provider_model = excluded.provider_model,
          approval_mode = excluded.approval_mode,
          fallback_mode = excluded.fallback_mode,
          max_tool_calls = excluded.max_tool_calls,
          execute_writes = excluded.execute_writes,
          steps_used = excluded.steps_used,
          score = excluded.score,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          policy_json = excluded.policy_json,
          context_json = excluded.context_json,
          plan_json = excluded.plan_json,
          outputs_json = excluded.outputs_json,
          review_json = excluded.review_json,
          verification_json = excluded.verification_json,
          tooling_json = excluded.tooling_json,
          run_json = excluded.run_json,
          updated_at = excluded.updated_at
      `).run(
        record.id,
        Number(record.schemaVersion || 1),
        workspaceId,
        String(record.goal || ''),
        String(record.status || 'unknown'),
        String(record?.provider?.id || 'unknown'),
        String(record?.provider?.name || 'unknown'),
        nullableText(record?.provider?.model),
        String(record?.policy?.approvalMode || 'REVIEW_REQUIRED'),
        String(record?.policy?.fallbackMode || 'permissive'),
        Number(record?.policy?.maxToolCallsPerRun || 12),
        record?.execution?.executeWrites ? 1 : 0,
        Number(record?.stepsUsed || 0),
        Number(record?.verification?.score ?? 0),
        String(record.startedAt || now),
        String(record.endedAt || now),
        toJson(record.policy || {}),
        toJson(context || {}),
        toJson(steps, []),
        toJson(outputs, []),
        toJson(record.review || {}),
        toJson(record.verification || {}),
        toJson(record.tooling || {}),
        runJson,
        now,
        now,
      );

      this.db.prepare('DELETE FROM agent_steps WHERE run_id = ?').run(record.id);
      this.db.prepare('DELETE FROM agent_tool_calls WHERE run_id = ?').run(record.id);
      this.db.prepare('DELETE FROM agent_events WHERE run_id = ?').run(record.id);

      const insertStep = this.db.prepare(`
        INSERT INTO agent_steps (
          id, run_id, step_order, task_id, title, objective, agent_role, acceptance_criteria_json,
          summary, deliverables_json, risks_json, questions_json, next_actions_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      steps.forEach((step, index) => {
        const stepOutput = outputs[index]?.parsed || {};
        insertStep.run(
          createId('step'),
          record.id,
          index + 1,
          nullableText(step?.id),
          String(step?.title || `Task ${index + 1}`),
          String(step?.objective || ''),
          String(step?.agentRole || 'executor'),
          toJson(step?.acceptanceCriteria || [], []),
          nullableText(stepOutput?.summary),
          toJson(stepOutput?.deliverables || [], []),
          toJson(stepOutput?.risks || [], []),
          toJson(stepOutput?.questions || [], []),
          toJson(stepOutput?.nextActions || [], []),
          now,
        );
      });

      const insertToolCall = this.db.prepare(`
        INSERT INTO agent_tool_calls (
          id, run_id, tool_name, reason, status, side_effect, dry_run, attempts, approval_mode,
          idempotency_key, input_json, result_json, error, started_at, ended_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      toolCalls.forEach((call) => {
        insertToolCall.run(
          String(call?.id || createId('tool')),
          record.id,
          String(call?.name || 'unknown'),
          nullableText(call?.reason),
          String(call?.status || 'unknown'),
          nullableText(call?.sideEffect),
          call?.dryRun === false ? 0 : 1,
          Number(call?.attempts || 0),
          nullableText(call?.approvalMode),
          nullableText(call?.idempotencyKey),
          toJson(call?.input || {}, {}),
          call?.result === undefined ? null : JSON.stringify(call.result),
          nullableText(call?.error),
          String(call?.startedAt || now),
          nullableText(call?.endedAt),
          now,
        );
      });

      const insertEvent = this.db.prepare(`
        INSERT INTO agent_events (
          run_id, event_order, event_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `);

      events.forEach((event, index) => {
        insertEvent.run(
          record.id,
          index + 1,
          String(event?.type || 'unknown'),
          toJson(event?.payload || {}, {}),
          String(event?.at || now),
        );
      });
      this.db.exec('COMMIT');
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure; preserve original error.
      }
      throw error;
    }

    const auditPath = path.join(this.runDir, `${record.id}.json`);
    await fs.writeFile(auditPath, JSON.stringify(record, null, 2), 'utf8');

    return {
      recordPath: auditPath,
      storage: 'sqlite',
      dbPath: this.dbPath,
    };
  }

  async patchRunToolCall({ runId, toolCallId, patch = {} } = {}) {
    await this.ensureReady();
    const row = this.db.prepare(`
      SELECT run_json
      FROM agent_runs
      WHERE id = ?
      LIMIT 1
    `).get(String(runId));
    if (!row) {
      throw new Error(`Run not found: ${runId}`);
    }

    const run = parseJson(row.run_json, null);
    if (!run) {
      throw new Error(`Run record is invalid JSON: ${runId}`);
    }

    const calls = Array.isArray(run?.tooling?.toolCalls) ? run.tooling.toolCalls : [];
    const index = calls.findIndex((call) => String(call?.id) === String(toolCallId));
    if (index < 0) {
      throw new Error(`Tool call not found: ${toolCallId}`);
    }

    const now = nowIso();
    const merged = {
      ...calls[index],
      ...patch,
      endedAt: patch?.endedAt || calls[index]?.endedAt || now,
    };
    calls[index] = merged;
    run.tooling.toolCalls = calls;
    run.status = deriveRunStatusFromRecord(run);
    run.updatedAt = now;

    this.db.prepare(`
      UPDATE agent_runs
      SET status = ?,
          tooling_json = ?,
          run_json = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      String(run.status || 'unknown'),
      toJson(run.tooling || {}, {}),
      JSON.stringify(run),
      now,
      String(runId),
    );

    const hasToolRow = this.db.prepare(`
      SELECT id
      FROM agent_tool_calls
      WHERE run_id = ? AND id = ?
      LIMIT 1
    `).get(String(runId), String(toolCallId));

    if (hasToolRow) {
      this.db.prepare(`
        UPDATE agent_tool_calls
        SET status = ?,
            attempts = ?,
            approval_mode = ?,
            idempotency_key = ?,
            result_json = ?,
            error = ?,
            ended_at = ?
        WHERE run_id = ? AND id = ?
      `).run(
        String(merged.status || 'unknown'),
        Number(merged.attempts || 0),
        nullableText(merged.approvalMode),
        nullableText(merged.idempotencyKey),
        (merged.result === undefined || merged.result === null) ? null : JSON.stringify(merged.result),
        nullableText(merged.error),
        nullableText(merged.endedAt),
        String(runId),
        String(toolCallId),
      );
    }

    const auditPath = path.join(this.runDir, `${runId}.json`);
    await fs.writeFile(auditPath, JSON.stringify(run, null, 2), 'utf8');
    return run;
  }

  async loadRun(runId) {
    await this.ensureReady();
    const row = this.db.prepare(`
      SELECT run_json
      FROM agent_runs
      WHERE id = ?
      LIMIT 1
    `).get(String(runId));

    if (!row) {
      throw new Error(`Run not found: ${runId}`);
    }

    const parsed = parseJson(row.run_json, null);
    if (!parsed) {
      throw new Error(`Run record is invalid JSON: ${runId}`);
    }
    return parsed;
  }

  async listRuns({ workspaceId, status, limit = 20 } = {}) {
    await this.ensureReady();

    const filters = [];
    const values = [];

    if (workspaceId) {
      filters.push('workspace_id = ?');
      values.push(String(workspaceId));
    }

    if (status && status !== 'all') {
      filters.push('status = ?');
      values.push(String(status));
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const maxRows = Number(limit) > 0 ? Number(limit) : 20;
    const sql = `
      SELECT
        id,
        workspace_id,
        goal,
        status,
        provider_id,
        provider_name,
        provider_model,
        steps_used,
        score,
        started_at,
        ended_at,
        review_json,
        verification_json
      FROM agent_runs
      ${where}
      ORDER BY started_at DESC
      LIMIT ${Math.min(maxRows, 200)}
    `;
    const rows = this.db.prepare(sql).all(...values);

    return rows.map((row) => {
      const review = parseJson(row.review_json, {}) || {};
      const verification = parseJson(row.verification_json, {}) || {};

      return {
        id: row.id,
        workspaceId: row.workspace_id,
        goal: row.goal,
        status: row.status,
        provider: {
          id: row.provider_id,
          name: row.provider_name || row.provider_id,
          model: row.provider_model || null,
        },
        stepsUsed: Number(row.steps_used || 0),
        score: Number.isFinite(Number(row.score)) ? Number(row.score) : Number(review?.score || 0),
        reviewStatus: String(review?.status || ''),
        verificationPassed: verification?.passed === true,
        startedAt: row.started_at,
        endedAt: row.ended_at,
      };
    });
  }
}
