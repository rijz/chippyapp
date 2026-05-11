import { SqliteStorageAdapter } from './sqliteStorageAdapter.js';
import { SupabaseStorageAdapter } from './supabaseStorageAdapter.js';

const ALLOWED_BACKENDS = new Set(['auto', 'sqlite', 'supabase']);

function normalizeBackend(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  if (!ALLOWED_BACKENDS.has(normalized)) {
    throw new Error(`Invalid storage backend: ${value}. Use auto, sqlite, or supabase.`);
  }
  return normalized;
}

function resolveTenantId(context = {}) {
  return context.tenantId || context.userId || context?.fixture?.tenantId || null;
}

export class StorageRouter {
  constructor(options = {}) {
    this.backend = normalizeBackend(options.backend || process.env.CHIPPY_STORAGE_BACKEND || 'auto');
    this.sqlite = options.sqlite || new SqliteStorageAdapter({
      runDir: options.runDir,
      dbPath: options.dbPath || process.env.CHIPPY_STORAGE_DB_PATH,
    });
    this.supabase = options.supabase || new SupabaseStorageAdapter({
      url: options.supabaseUrl || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      serviceRoleKey: options.supabaseServiceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  }

  describe() {
    return {
      backend: this.backend,
      sqlite: this.sqlite.describe(),
      supabaseConfigured: this.supabase.isConfigured(),
    };
  }

  async saveRun(record) {
    return this.sqlite.saveRun(record);
  }

  async loadRun(runId) {
    return this.sqlite.loadRun(runId);
  }

  async listRuns(options = {}) {
    return this.sqlite.listRuns(options);
  }

  async enqueuePendingToolCall(payload) {
    return this.sqlite.enqueuePendingToolCall(payload);
  }

  async listActions(options = {}) {
    return this.sqlite.listActions(options);
  }

  async getAction(actionId) {
    return this.sqlite.getAction(actionId);
  }

  async decideAction(payload) {
    return this.sqlite.decideAction(payload);
  }

  async markActionExecution(payload) {
    return this.sqlite.markActionExecution(payload);
  }

  async claimActionExecution(payload) {
    return this.sqlite.claimActionExecution(payload);
  }

  async finalizeActionExecution(payload) {
    return this.sqlite.finalizeActionExecution(payload);
  }

  async patchRunToolCall(payload) {
    return this.sqlite.patchRunToolCall(payload);
  }

  async listInboxMessages(payload) {
    return this.sqlite.listInboxMessages(payload);
  }

  async upsertInboundEmail(payload) {
    return this.sqlite.upsertInboundEmail(payload);
  }

  async updateEmailMessageStatus(payload) {
    return this.sqlite.updateEmailMessageStatus(payload);
  }

  async recordOutboundEmail(payload) {
    return this.sqlite.recordOutboundEmail(payload);
  }

  async createObjective(payload) {
    return this.sqlite.createObjective(payload);
  }

  async listObjectives(options = {}) {
    return this.sqlite.listObjectives(options);
  }

  async getObjective(options = {}) {
    return this.sqlite.getObjective(options);
  }

  async updateObjective(options = {}) {
    return this.sqlite.updateObjective(options);
  }

  async getSoul(options = {}) {
    return this.sqlite.getSoul(options);
  }

  async upsertSoul(options = {}) {
    return this.sqlite.upsertSoul(options);
  }

  async recordHeartbeat(options = {}) {
    return this.sqlite.recordHeartbeat(options);
  }

  async getLatestHeartbeat(options = {}) {
    return this.sqlite.getLatestHeartbeat(options);
  }

  async getHeartbeatSummary(options = {}) {
    return this.sqlite.getHeartbeatSummary(options);
  }

  getLookupOrder() {
    if (this.backend === 'sqlite') return ['sqlite'];
    if (this.backend === 'supabase') return ['supabase', 'sqlite'];
    return ['sqlite', 'supabase'];
  }

  async lookupLead({ leadId, email, context = {} } = {}) {
    const tenantId = resolveTenantId(context);
    const warnings = [];
    const order = this.getLookupOrder();

    for (const source of order) {
      if (source === 'sqlite') {
        const lead = await this.sqlite.lookupLead({
          tenantId,
          leadId,
          email,
          context,
        });
        if (lead) {
          return {
            lead,
            source: 'sqlite',
            warning: warnings.length > 0 ? warnings.join('; ') : undefined,
          };
        }
        continue;
      }

      const result = await this.supabase.lookupLead({ tenantId, leadId, email });
      if (result?.lead) {
        return {
          lead: result.lead,
          source: 'supabase',
          warning: warnings.length > 0 ? warnings.join('; ') : undefined,
        };
      }
      if (result?.warning) {
        warnings.push(`supabase:${result.warning}`);
      }
    }

    return {
      lead: null,
      source: order[0] || 'none',
      warning: warnings.length > 0 ? warnings.join('; ') : undefined,
    };
  }
}

export function createStorageRouter(options = {}) {
  return new StorageRouter(options);
}
