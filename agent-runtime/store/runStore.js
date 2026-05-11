import fs from 'node:fs/promises';
import path from 'node:path';
import { createStorageRouter } from '../storage/storageRouter.js';

export class RunStore {
  constructor(options = path.resolve(process.cwd(), '.runs', 'agent-runtime')) {
    const resolved = typeof options === 'string'
      ? { runDir: options }
      : { ...(options || {}) };

    this.baseDir = path.resolve(resolved.runDir || path.resolve(process.cwd(), '.runs', 'agent-runtime'));
    this.storage = resolved.storage || createStorageRouter({
      backend: resolved.storageBackend,
      runDir: this.baseDir,
      dbPath: resolved.dbPath,
      supabaseUrl: resolved.supabaseUrl,
      supabaseServiceRoleKey: resolved.supabaseServiceRoleKey,
    });
  }

  async ensureDir() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async save(record) {
    if (this.storage && typeof this.storage.saveRun === 'function') {
      const result = await this.storage.saveRun(record);
      return result?.recordPath || null;
    }

    await this.ensureDir();
    const fileName = `${record.id}.json`;
    const filePath = path.join(this.baseDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
    return filePath;
  }

  async load(runId) {
    if (this.storage && typeof this.storage.loadRun === 'function') {
      return this.storage.loadRun(runId);
    }

    const filePath = path.join(this.baseDir, `${runId}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  }

  async listRuns(options = {}) {
    if (!this.storage || typeof this.storage.listRuns !== 'function') {
      return [];
    }
    return this.storage.listRuns(options);
  }

  async enqueuePendingToolCall(payload) {
    if (!this.storage || typeof this.storage.enqueuePendingToolCall !== 'function') {
      throw new Error('Action queue storage is not available.');
    }
    return this.storage.enqueuePendingToolCall(payload);
  }

  async listActions(options = {}) {
    if (!this.storage || typeof this.storage.listActions !== 'function') {
      return [];
    }
    return this.storage.listActions(options);
  }

  async getAction(actionId) {
    if (!this.storage || typeof this.storage.getAction !== 'function') {
      return null;
    }
    return this.storage.getAction(actionId);
  }

  async decideAction(payload) {
    if (!this.storage || typeof this.storage.decideAction !== 'function') {
      throw new Error('Action queue storage is not available.');
    }
    return this.storage.decideAction(payload);
  }

  async markActionExecution(payload) {
    if (!this.storage || typeof this.storage.markActionExecution !== 'function') {
      throw new Error('Action queue storage is not available.');
    }
    return this.storage.markActionExecution(payload);
  }

  async claimActionExecution(payload) {
    if (!this.storage || typeof this.storage.claimActionExecution !== 'function') {
      throw new Error('Action queue storage is not available.');
    }
    return this.storage.claimActionExecution(payload);
  }

  async finalizeActionExecution(payload) {
    if (!this.storage || typeof this.storage.finalizeActionExecution !== 'function') {
      throw new Error('Action queue storage is not available.');
    }
    return this.storage.finalizeActionExecution(payload);
  }

  async patchRunToolCall(payload) {
    if (!this.storage || typeof this.storage.patchRunToolCall !== 'function') {
      throw new Error('Run patching storage is not available.');
    }
    return this.storage.patchRunToolCall(payload);
  }

  async createObjective(payload) {
    if (!this.storage || typeof this.storage.createObjective !== 'function') {
      throw new Error('Objective storage is not available.');
    }
    return this.storage.createObjective(payload);
  }

  async listObjectives(options = {}) {
    if (!this.storage || typeof this.storage.listObjectives !== 'function') {
      return [];
    }
    return this.storage.listObjectives(options);
  }

  async getObjective(options = {}) {
    if (!this.storage || typeof this.storage.getObjective !== 'function') {
      return null;
    }
    return this.storage.getObjective(options);
  }

  async updateObjective(options = {}) {
    if (!this.storage || typeof this.storage.updateObjective !== 'function') {
      throw new Error('Objective storage is not available.');
    }
    return this.storage.updateObjective(options);
  }

  async getSoul(options = {}) {
    if (!this.storage || typeof this.storage.getSoul !== 'function') {
      return null;
    }
    return this.storage.getSoul(options);
  }

  async upsertSoul(options = {}) {
    if (!this.storage || typeof this.storage.upsertSoul !== 'function') {
      throw new Error('Soul storage is not available.');
    }
    return this.storage.upsertSoul(options);
  }

  async recordHeartbeat(options = {}) {
    if (!this.storage || typeof this.storage.recordHeartbeat !== 'function') {
      throw new Error('Heartbeat storage is not available.');
    }
    return this.storage.recordHeartbeat(options);
  }

  async getLatestHeartbeat(options = {}) {
    if (!this.storage || typeof this.storage.getLatestHeartbeat !== 'function') {
      return null;
    }
    return this.storage.getLatestHeartbeat(options);
  }

  async getHeartbeatSummary(options = {}) {
    if (!this.storage || typeof this.storage.getHeartbeatSummary !== 'function') {
      return {
        workspaceId: options?.workspaceId || null,
        latest: null,
        metrics: {
          objectivesPending: 0,
          approvalsPending: 0,
          runsLast24h: 0,
        },
      };
    }
    return this.storage.getHeartbeatSummary(options);
  }
}
