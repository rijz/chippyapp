#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDefaultAgentRuntime, createDefaultProviderRegistry } from '../agent-runtime/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const GATEWAY_RUN_DIR = process.env.CHIPPY_GATEWAY_RUN_DIR || path.join(ROOT_DIR, '.runs', 'gateway');
const GATEWAY_PID_PATH = path.join(GATEWAY_RUN_DIR, 'gateway.pid');
const GATEWAY_LOCK_PATH = path.join(GATEWAY_RUN_DIR, 'gateway.lock');
const GATEWAY_STATE_PATH = path.join(GATEWAY_RUN_DIR, 'gateway-state.json');
const GATEWAY_LOG_PATH = path.join(GATEWAY_RUN_DIR, 'gateway.log');
const WHATSAPP_LINKED_BASE_DIR = process.env.CHIPPY_WHATSAPP_LINKED_DIR || path.join(ROOT_DIR, '.runs', 'whatsapp-gateway');

const AGENT_RUNTIME_RUN_DIR = process.env.CHIPPY_AGENT_RUN_DIR || path.join(ROOT_DIR, '.runs', 'agent-runtime');
const AGENT_RUNTIME_DB_PATH = process.env.CHIPPY_STORAGE_DB_PATH || path.join(AGENT_RUNTIME_RUN_DIR, 'runtime.db');
const AGENT_RUNTIME_STORAGE_BACKEND = process.env.CHIPPY_STORAGE_BACKEND || 'auto';

const DEFAULT_TICK_SECONDS = 15;
const DEFAULT_HEARTBEAT_MINUTES = 30;
const DEFAULT_OBJECTIVE_POLL_SECONDS = 60;
const DEFAULT_EMAIL_POLL_SECONDS = 180;

function parseArgs(rawArgs = []) {
  const args = [...rawArgs];
  const flags = {};
  const positionals = [];

  while (args.length > 0) {
    const token = args.shift();
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = args[0];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = args.shift();
      }
    } else {
      positionals.push(token);
    }
  }

  return { flags, positionals };
}

function printHelp() {
  console.log([
    'Chippy Gateway (always-on orchestrator)',
    '',
    'Usage:',
    '  node scripts/chippy-gateway.js --workspace-id <id>',
    '  node scripts/chippy-gateway.js --workspace-ids <id1,id2>',
    '  node scripts/chippy-gateway.js --run-once',
    '',
    'Flags:',
    '  --workspace-id        Single workspace id (repeat command with env for multiple)',
    '  --workspace-ids       Comma-separated workspace ids',
    '  --run-once            Run one scheduler cycle and exit',
    '  --help                Show this help',
  ].join('\n'));
}

function parseBool(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[^\d+]/g, '');
  if (!compact) return '';
  return compact.startsWith('+') ? compact : `+${compact}`;
}

function sanitizeWorkspaceFileKey(workspaceId = '') {
  return String(workspaceId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128) || 'workspace';
}

function linkedWhatsappPaths(workspaceId = '') {
  const key = sanitizeWorkspaceFileKey(workspaceId);
  return {
    workspaceKey: key,
    statePath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}.json`),
    authDir: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}-auth`),
    pidPath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}.pid`),
    logPath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}.log`),
    qrPngPath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}-qr.png`),
    qrTextPath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}-qr.txt`),
    pairingCodePath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}-pairing-code.txt`),
    outboxDir: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}-outbox`),
  };
}

function isProcessRunning(pid) {
  const parsed = Number(pid);
  if (!Number.isInteger(parsed) || parsed < 1) return false;
  try {
    process.kill(parsed, 0);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function resolveWorkspaceIds(flags = {}) {
  const sources = [];

  if (typeof flags['workspace-id'] === 'string') sources.push(flags['workspace-id']);
  if (typeof flags['workspace-ids'] === 'string') sources.push(flags['workspace-ids']);
  if (typeof process.env.CHIPPY_GATEWAY_WORKSPACES === 'string') sources.push(process.env.CHIPPY_GATEWAY_WORKSPACES);
  if (typeof process.env.WHATSAPP_DEFAULT_WORKSPACE_ID === 'string') sources.push(process.env.WHATSAPP_DEFAULT_WORKSPACE_ID);

  const discovered = [];
  try {
    const entries = await fs.readdir(WHATSAPP_LINKED_BASE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.json')) continue;
      const fullPath = path.join(WHATSAPP_LINKED_BASE_DIR, entry.name);
      const parsed = await readJson(fullPath, null);
      const workspaceId = String(parsed?.workspaceId || '').trim();
      if (workspaceId) discovered.push(workspaceId);
    }
  } catch {
    // ignore discovery failures
  }

  const set = new Set();
  for (const value of [...sources, ...discovered]) {
    String(value || '')
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => set.add(item));
  }

  return Array.from(set);
}

function parseWorkspaceList(value = '') {
  return Array.from(new Set(
    String(value || '')
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function normalizePolicyFromEnv() {
  const approvalModeRaw = String(process.env.CHIPPY_GATEWAY_APPROVAL_MODE || process.env.WHATSAPP_APPROVAL_MODE || 'REVIEW_REQUIRED').toUpperCase();
  const approvalMode = ['AUTO', 'REVIEW_REQUIRED', 'BLOCKED'].includes(approvalModeRaw)
    ? approvalModeRaw
    : 'REVIEW_REQUIRED';

  const allowedScopesRaw = String(process.env.CHIPPY_GATEWAY_ALLOWED_SCOPES || process.env.WHATSAPP_ALLOWED_SCOPES || 'none,read,write');
  const allowedToolScopes = Array.from(new Set(
    allowedScopesRaw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => ['none', 'read', 'write'].includes(item))
  ));

  const maxToolCallsPerRun = clampInt(
    process.env.CHIPPY_GATEWAY_MAX_TOOL_CALLS || process.env.WHATSAPP_MAX_TOOL_CALLS,
    1,
    50,
    10
  );

  const maxWriteActionsPerRun = clampInt(
    process.env.CHIPPY_GATEWAY_MAX_WRITE_ACTIONS || process.env.WHATSAPP_MAX_WRITE_ACTIONS,
    1,
    20,
    2
  );

  const timezone = String(process.env.CHIPPY_GATEWAY_TIMEZONE || process.env.WHATSAPP_DEFAULT_TIMEZONE || '').trim() || null;

  return {
    approvalMode,
    fallbackMode: parseBool(process.env.CHIPPY_GATEWAY_NO_FALLBACK, false) ? 'strict' : 'permissive',
    maxToolCallsPerRun,
    maxWriteActionsPerRun,
    allowedToolScopes: allowedToolScopes.length > 0 ? allowedToolScopes : ['none', 'read', 'write'],
    quietHours: {
      enabled: false,
      startHour: 22,
      endHour: 7,
      timezone,
    },
  };
}

function mapRunStatusToObjectiveStatus(runStatus) {
  if (runStatus === 'completed') return 'completed';
  if (runStatus === 'awaiting_approval') return 'awaiting_approval';
  if (runStatus === 'needs_revision') return 'needs_revision';
  if (runStatus === 'blocked_policy') return 'blocked_policy';
  return 'failed';
}

class Gateway {
  constructor({ workspaceIds = [], runOnce = false } = {}) {
    this.workspaceIds = workspaceIds;
    this.runOnce = runOnce;
    this.startedAt = nowIso();
    this.stopping = false;
    this.workers = new Map();
    this.objectiveLocks = new Set();
    this.timers = [];

    this.tickSeconds = clampInt(process.env.CHIPPY_GATEWAY_TICK_SECONDS, 5, 300, DEFAULT_TICK_SECONDS);
    this.heartbeatMinutes = clampInt(process.env.CHIPPY_GATEWAY_HEARTBEAT_MINUTES, 1, 240, DEFAULT_HEARTBEAT_MINUTES);
    this.objectivePollSeconds = clampInt(process.env.CHIPPY_GATEWAY_OBJECTIVE_POLL_SECONDS, 10, 900, DEFAULT_OBJECTIVE_POLL_SECONDS);
    this.emailPollSeconds = clampInt(process.env.CHIPPY_GATEWAY_EMAIL_POLL_SECONDS, 30, 3600, DEFAULT_EMAIL_POLL_SECONDS);

    this.tickMs = this.tickSeconds * 1000;
    this.heartbeatMs = this.heartbeatMinutes * 60 * 1000;
    this.objectivePollMs = this.objectivePollSeconds * 1000;
    this.emailPollMs = this.emailPollSeconds * 1000;

    this.autoRunObjectives = parseBool(process.env.CHIPPY_GATEWAY_AUTO_RUN_OBJECTIVES, true);
    this.autoRunEmail = parseBool(process.env.CHIPPY_GATEWAY_AUTO_RUN_EMAIL, false);
    this.relinkOnceWorkspaces = new Set(parseWorkspaceList(process.env.CHIPPY_GATEWAY_RELINK_WORKSPACES || ''));
    this.providerId = String(process.env.CHIPPY_GATEWAY_PROVIDER_ID || process.env.WHATSAPP_DEFAULT_PROVIDER_ID || 'gemini.flash').trim() || 'gemini.flash';
    this.model = String(process.env.CHIPPY_GATEWAY_MODEL || process.env.WHATSAPP_DEFAULT_MODEL || '').trim() || undefined;
    this.executeWrites = parseBool(process.env.CHIPPY_GATEWAY_EXECUTE_WRITES || process.env.WHATSAPP_EXECUTE_WRITES, false);
    this.emailExecuteWrites = parseBool(process.env.CHIPPY_GATEWAY_EMAIL_EXECUTE_WRITES, this.executeWrites);
    this.emailGoal = String(
      process.env.CHIPPY_GATEWAY_EMAIL_GOAL || 'Manage unread customer emails and send concise, safe replies.'
    ).trim() || 'Manage unread customer emails and send concise, safe replies.';
    this.emailSource = String(process.env.CHIPPY_GATEWAY_EMAIL_SOURCE || 'gmail').trim() || 'gmail';
    this.emailTransport = String(process.env.CHIPPY_GATEWAY_EMAIL_TRANSPORT || 'gmail').trim() || 'gmail';
    this.companyName = String(process.env.CHIPPY_COMPANY_NAME || 'Chippy User').trim() || 'Chippy User';
    this.timezone = String(process.env.CHIPPY_GATEWAY_TIMEZONE || process.env.WHATSAPP_DEFAULT_TIMEZONE || '').trim() || null;

    this.policy = normalizePolicyFromEnv();
    this.lastHeartbeatAt = 0;
    this.lastObjectivePollAt = 0;
    this.lastEmailPollAt = 0;
    this.lastObjectiveRunAt = null;
    this.lastEmailRunAt = null;
    this.emailLocks = new Set();

    this.runtime = createDefaultAgentRuntime({
      providerRegistry: createDefaultProviderRegistry(),
      runDir: AGENT_RUNTIME_RUN_DIR,
      dbPath: AGENT_RUNTIME_DB_PATH,
      storageBackend: AGENT_RUNTIME_STORAGE_BACKEND,
      policy: this.policy,
    });
  }

  async init() {
    await fs.mkdir(GATEWAY_RUN_DIR, { recursive: true });
    await fs.mkdir(WHATSAPP_LINKED_BASE_DIR, { recursive: true });

    const existingPid = await this.readPid();
    if (isProcessRunning(existingPid) && existingPid !== process.pid) {
      throw new Error(`Gateway already running with pid ${existingPid}`);
    }

    await this.acquireLock();
    await this.writePid(process.pid);
    this.registerSignals();
    await this.writeState();
  }

  registerSignals() {
    const shutdown = async (signal) => {
      if (this.stopping) return;
      this.stopping = true;
      console.log(`[gateway] shutting down (${signal})`);
      for (const timer of this.timers) {
        clearInterval(timer);
      }
      this.timers = [];
      await this.stopAllWorkers();
      await this.removePid();
      await this.releaseLock();
      await this.writeState();
      process.exit(0);
    };

    process.on('SIGINT', () => {
      shutdown('SIGINT').catch((error) => {
        console.error('[gateway] shutdown error:', error?.message || error);
        process.exit(1);
      });
    });

    process.on('SIGTERM', () => {
      shutdown('SIGTERM').catch((error) => {
        console.error('[gateway] shutdown error:', error?.message || error);
        process.exit(1);
      });
    });
  }

  async readPid() {
    try {
      const raw = await fs.readFile(GATEWAY_PID_PATH, 'utf8');
      const pid = Number(String(raw).trim());
      return Number.isInteger(pid) ? pid : null;
    } catch {
      return null;
    }
  }

  async writePid(pid) {
    await fs.writeFile(GATEWAY_PID_PATH, `${pid}\n`, 'utf8');
  }

  async removePid() {
    await fs.rm(GATEWAY_PID_PATH, { force: true });
  }

  async readLockPid() {
    try {
      const raw = await fs.readFile(GATEWAY_LOCK_PATH, 'utf8');
      const pid = Number(String(raw).trim());
      return Number.isInteger(pid) ? pid : null;
    } catch {
      return null;
    }
  }

  async acquireLock() {
    try {
      await fs.writeFile(GATEWAY_LOCK_PATH, `${process.pid}\n`, { encoding: 'utf8', flag: 'wx' });
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }

    const lockPid = await this.readLockPid();
    if (isProcessRunning(lockPid) && lockPid !== process.pid) {
      throw new Error(`Gateway lock is held by pid ${lockPid}`);
    }

    // Stale lock file.
    await fs.rm(GATEWAY_LOCK_PATH, { force: true });
    await fs.writeFile(GATEWAY_LOCK_PATH, `${process.pid}\n`, { encoding: 'utf8', flag: 'wx' });
  }

  async releaseLock() {
    const lockPid = await this.readLockPid();
    if (!lockPid || lockPid === process.pid || !isProcessRunning(lockPid)) {
      await fs.rm(GATEWAY_LOCK_PATH, { force: true });
    }
  }

  getWorkerSnapshot(workspaceId) {
    const worker = this.workers.get(workspaceId);
    if (!worker) {
      return {
        workspaceId,
        running: false,
        pid: null,
        restartCount: 0,
        lastStartedAt: null,
        nextRestartAt: null,
        lastExit: null,
      };
    }

    return {
      workspaceId,
      running: worker.running === true,
      pid: worker.running ? worker.pid : null,
      restartCount: worker.restartCount || 0,
      lastStartedAt: worker.lastStartedAt || null,
      nextRestartAt: worker.nextRestartAt ? new Date(worker.nextRestartAt).toISOString() : null,
      lastExit: worker.lastExit || null,
    };
  }

  async writeState() {
    const state = {
      pid: process.pid,
      startedAt: this.startedAt,
      updatedAt: nowIso(),
      workspaces: this.workspaceIds,
      scheduler: {
        tickSeconds: this.tickSeconds,
        heartbeatMinutes: this.heartbeatMinutes,
        objectivePollSeconds: this.objectivePollSeconds,
        emailPollSeconds: this.emailPollSeconds,
        autoRunObjectives: this.autoRunObjectives,
        autoRunEmail: this.autoRunEmail,
        relinkPendingWorkspaces: Array.from(this.relinkOnceWorkspaces),
      },
      objectiveRunner: {
        providerId: this.providerId,
        model: this.model || null,
        executeWrites: this.executeWrites,
      },
      workers: this.workspaceIds.map((workspaceId) => this.getWorkerSnapshot(workspaceId)),
      lastHeartbeatAt: this.lastHeartbeatAt ? new Date(this.lastHeartbeatAt).toISOString() : null,
      lastObjectivePollAt: this.lastObjectivePollAt ? new Date(this.lastObjectivePollAt).toISOString() : null,
      lastEmailPollAt: this.lastEmailPollAt ? new Date(this.lastEmailPollAt).toISOString() : null,
      lastObjectiveRunAt: this.lastObjectiveRunAt,
      lastEmailRunAt: this.lastEmailRunAt,
    };

    await fs.writeFile(GATEWAY_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  async ensureWorkers() {
    for (const workspaceId of this.workspaceIds) {
      const current = this.workers.get(workspaceId);
      if (current?.running) {
        if (isProcessRunning(current.pid)) continue;
        this.workers.set(workspaceId, {
          ...current,
          running: false,
          pid: null,
          nextRestartAt: Date.now() + 1000,
          lastExit: {
            code: null,
            signal: 'process-missing',
            at: nowIso(),
          },
        });
      }

      const next = this.workers.get(workspaceId);
      if (next?.nextRestartAt && Date.now() < next.nextRestartAt) continue;
      await this.spawnWorker(workspaceId);
    }
  }

  async spawnWorker(workspaceId) {
    const previous = this.workers.get(workspaceId) || {
      restartCount: 0,
    };

    const paths = linkedWhatsappPaths(workspaceId);
    const outFd = fsSync.openSync(paths.logPath, 'a');

    const args = [path.join('scripts', 'whatsapp-linked-device.js'), '--workspace-id', workspaceId];
    if (this.relinkOnceWorkspaces.has(workspaceId)) {
      args.push('--force-qr', '--reset-auth');
      this.relinkOnceWorkspaces.delete(workspaceId);
    }

    const child = spawn(process.execPath, args, {
      cwd: ROOT_DIR,
      stdio: ['ignore', outFd, outFd],
      env: {
        ...process.env,
        WHATSAPP_DEFAULT_WORKSPACE_ID: workspaceId,
        WHATSAPP_GATEWAY_STATE_PATH: paths.statePath,
        WHATSAPP_AUTH_DIR: paths.authDir,
        WHATSAPP_QR_PNG_PATH: paths.qrPngPath,
        WHATSAPP_QR_TEXT_PATH: paths.qrTextPath,
        WHATSAPP_PAIRING_CODE_PATH: paths.pairingCodePath,
        WHATSAPP_OUTBOX_DIR: paths.outboxDir,
      },
    });

    try {
      fsSync.closeSync(outFd);
    } catch {
      // ignore close errors
    }

    await fs.writeFile(paths.pidPath, `${child.pid}\n`, 'utf8');

    const workerState = {
      workspaceId,
      child,
      pid: child.pid,
      running: true,
      restartCount: previous.restartCount || 0,
      lastStartedAt: nowIso(),
      nextRestartAt: null,
      lastExit: null,
    };
    this.workers.set(workspaceId, workerState);
    console.log(`[gateway] started whatsapp worker ${workspaceId} pid=${child.pid}`);

    child.on('exit', async (code, signal) => {
      const latest = this.workers.get(workspaceId) || workerState;
      const restartCount = (latest.restartCount || 0) + 1;
      const backoffMs = Math.min(30000, 1000 * Math.max(1, restartCount));

      this.workers.set(workspaceId, {
        ...latest,
        child: null,
        pid: null,
        running: false,
        restartCount,
        nextRestartAt: Date.now() + backoffMs,
        lastExit: {
          code,
          signal,
          at: nowIso(),
        },
      });

      try {
        await fs.rm(paths.pidPath, { force: true });
      } catch {
        // ignore stale pid cleanup errors
      }

      if (!this.stopping) {
        console.warn(`[gateway] worker ${workspaceId} exited (code=${code ?? 'null'} signal=${signal ?? 'null'}) restarting in ${backoffMs}ms`);
      }
    });
  }

  async stopWorker(workspaceId) {
    const worker = this.workers.get(workspaceId);
    const paths = linkedWhatsappPaths(workspaceId);

    if (worker?.running && worker.pid) {
      try {
        process.kill(worker.pid, 'SIGTERM');
      } catch {
        // ignore kill errors
      }
    }

    try {
      await fs.rm(paths.pidPath, { force: true });
    } catch {
      // ignore pid cleanup errors
    }

    this.workers.set(workspaceId, {
      ...(worker || {}),
      workspaceId,
      child: null,
      pid: null,
      running: false,
      nextRestartAt: null,
      lastExit: {
        code: null,
        signal: 'stopped',
        at: nowIso(),
      },
    });
  }

  async stopAllWorkers() {
    await Promise.all(this.workspaceIds.map((workspaceId) => this.stopWorker(workspaceId)));
  }

  async tickHeartbeats() {
    for (const workspaceId of this.workspaceIds) {
      try {
        const summary = await this.runtime.runStore.getHeartbeatSummary({ workspaceId });
        await this.runtime.runStore.recordHeartbeat({
          workspaceId,
          source: 'gateway.heartbeat',
          status: 'ok',
          metrics: {
            ...(summary?.metrics || {}),
          },
          note: 'Gateway heartbeat tick',
        });
      } catch (error) {
        console.warn(`[gateway] heartbeat tick failed for ${workspaceId}:`, error?.message || error);
      }
    }

    this.lastHeartbeatAt = Date.now();
  }

  async tickObjectives() {
    this.lastObjectivePollAt = Date.now();
    if (!this.autoRunObjectives) return;

    for (const workspaceId of this.workspaceIds) {
      if (this.objectiveLocks.has(workspaceId)) continue;

      const pending = await this.runtime.runStore.listObjectives({
        workspaceId,
        status: 'pending',
        limit: 1,
      });

      if (!Array.isArray(pending) || pending.length === 0) continue;
      const objective = pending[0];
      this.objectiveLocks.add(workspaceId);

      try {
        await this.runtime.runStore.updateObjective({
          objectiveId: objective.id,
          workspaceId,
          patch: {
            status: 'running',
            metadataMerge: {
              lastScheduledAt: nowIso(),
              lastScheduledBy: 'gateway',
            },
          },
        });

        const soul = await this.runtime.runStore.getSoul({ workspaceId });
        const run = await this.runtime.run({
          goal: objective.goal,
          providerId: this.providerId,
          model: this.model,
          executeWrites: this.executeWrites,
          context: {
            source: 'gateway.objective',
            objectiveId: objective.id,
            workspaceId,
            userId: workspaceId,
            tenantId: workspaceId,
            companyName: this.companyName,
            timezone: this.timezone,
            soul,
          },
          policy: this.policy,
        });

        const objectiveStatus = mapRunStatusToObjectiveStatus(run.status);
        await this.runtime.runStore.updateObjective({
          objectiveId: objective.id,
          workspaceId,
          patch: {
            status: objectiveStatus,
            lastRunId: run.id,
            lastRunStatus: run.status,
            metadataMerge: {
              lastRunAt: nowIso(),
              lastRunSource: 'gateway',
            },
          },
        });

        const summary = await this.runtime.runStore.getHeartbeatSummary({ workspaceId });
        await this.runtime.runStore.recordHeartbeat({
          workspaceId,
          source: 'gateway.objective',
          status: run.status === 'failed' ? 'error' : 'ok',
          metrics: {
            ...(summary?.metrics || {}),
            lastRunStatus: run.status,
          },
          note: `Objective ${objective.id} status ${run.status}`,
        });

        this.lastObjectiveRunAt = nowIso();
        console.log(`[gateway] objective ${objective.id} executed for workspace ${workspaceId} status=${run.status}`);
      } catch (error) {
        try {
          await this.runtime.runStore.updateObjective({
            objectiveId: objective.id,
            workspaceId,
            patch: {
              status: 'failed',
              metadataMerge: {
                lastRunAt: nowIso(),
                lastRunError: error?.message || 'Gateway objective run failed',
                lastRunSource: 'gateway',
              },
            },
          });
        } catch {
          // ignore objective patch failures
        }

        try {
          const summary = await this.runtime.runStore.getHeartbeatSummary({ workspaceId });
          await this.runtime.runStore.recordHeartbeat({
            workspaceId,
            source: 'gateway.objective',
            status: 'error',
            metrics: {
              ...(summary?.metrics || {}),
            },
            note: `Objective ${objective.id} failed: ${error?.message || 'unknown error'}`,
          });
        } catch {
          // ignore heartbeat fallback failures
        }

        console.error(`[gateway] objective run failed for ${objective.id}:`, error?.message || error);
      } finally {
        this.objectiveLocks.delete(workspaceId);
      }
    }
  }

  async tickEmailPolls() {
    this.lastEmailPollAt = Date.now();
    if (!this.autoRunEmail) return;

    for (const workspaceId of this.workspaceIds) {
      if (this.emailLocks.has(workspaceId)) continue;
      this.emailLocks.add(workspaceId);

      try {
        const soul = await this.runtime.runStore.getSoul({ workspaceId });
        const run = await this.runtime.run({
          goal: this.emailGoal,
          providerId: this.providerId,
          model: this.model,
          executeWrites: this.emailExecuteWrites,
          context: {
            source: 'gateway.email.poll',
            channel: 'email',
            workspaceId,
            userId: workspaceId,
            tenantId: workspaceId,
            companyName: this.companyName,
            timezone: this.timezone,
            soul,
            emailSource: this.emailSource,
            emailTransport: this.emailTransport,
          },
          policy: this.policy,
        });

        const summary = await this.runtime.runStore.getHeartbeatSummary({ workspaceId });
        await this.runtime.runStore.recordHeartbeat({
          workspaceId,
          source: 'gateway.email.poll',
          status: run.status === 'failed' ? 'error' : 'ok',
          metrics: {
            ...(summary?.metrics || {}),
            lastRunStatus: run.status,
          },
          note: `Email poll run ${run.id} status ${run.status}`,
        });

        this.lastEmailRunAt = nowIso();
        console.log(`[gateway] email poll run ${run.id} for workspace ${workspaceId} status=${run.status}`);
      } catch (error) {
        try {
          const summary = await this.runtime.runStore.getHeartbeatSummary({ workspaceId });
          await this.runtime.runStore.recordHeartbeat({
            workspaceId,
            source: 'gateway.email.poll',
            status: 'error',
            metrics: {
              ...(summary?.metrics || {}),
            },
            note: `Email poll failed: ${error?.message || 'unknown error'}`,
          });
        } catch {
          // ignore heartbeat fallback failures
        }
        console.error(`[gateway] email poll failed for ${workspaceId}:`, error?.message || error);
      } finally {
        this.emailLocks.delete(workspaceId);
      }
    }
  }

  async tick(force = false) {
    if (this.stopping) return;

    await this.ensureWorkers();
    const nowMs = Date.now();

    if (force || nowMs - this.lastHeartbeatAt >= this.heartbeatMs) {
      await this.tickHeartbeats();
    }

    if (force || nowMs - this.lastObjectivePollAt >= this.objectivePollMs) {
      await this.tickObjectives();
    }

    if (force || nowMs - this.lastEmailPollAt >= this.emailPollMs) {
      await this.tickEmailPolls();
    }

    await this.writeState();
  }

  async run() {
    console.log(`[gateway] starting pid=${process.pid}`);
    console.log(`[gateway] workspaces: ${this.workspaceIds.join(', ')}`);
    console.log(
      `[gateway] scheduler tick=${this.tickSeconds}s heartbeat=${this.heartbeatMinutes}m objectivePoll=${this.objectivePollSeconds}s emailPoll=${this.emailPollSeconds}s autoObjectives=${this.autoRunObjectives} autoEmail=${this.autoRunEmail}`
    );

    await this.tick(true);

    if (this.runOnce) {
      await this.removePid();
      await this.releaseLock();
      console.log('[gateway] run-once complete');
      return;
    }

    const timer = setInterval(() => {
      this.tick(false).catch((error) => {
        console.error('[gateway] tick failed:', error?.message || error);
      });
    }, this.tickMs);
    this.timers.push(timer);
  }
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printHelp();
    return;
  }

  const workspaceIds = await resolveWorkspaceIds(flags);
  if (!workspaceIds.length) {
    throw new Error('No workspace ids configured. Use --workspace-id/--workspace-ids or CHIPPY_GATEWAY_WORKSPACES.');
  }

  const gateway = new Gateway({
    workspaceIds,
    runOnce: parseBool(flags['run-once'] === true ? 'true' : flags['run-once'], false),
  });

  await gateway.init();
  await gateway.run();
}

main().catch(async (error) => {
  try {
    const raw = await fs.readFile(GATEWAY_LOCK_PATH, 'utf8');
    const lockPid = Number(String(raw).trim());
    if (Number.isInteger(lockPid) && lockPid === process.pid) {
      await fs.rm(GATEWAY_LOCK_PATH, { force: true });
    }
  } catch {
    // ignore cleanup failures
  }
  console.error('[gateway] fatal error:', error?.message || error);
  process.exit(1);
});
