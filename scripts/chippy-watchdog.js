#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  ROOT_DIR,
  WATCHDOG_RUN_DIR,
  WATCHDOG_PID_PATH,
  readWatchdogState,
  writeWatchdogState,
  getGatewayStatusSummary,
  rotateRuntimeLogs,
  createBackupSnapshot,
  parseWorkspaceIds,
  parseWorkspaceIdsFromEnv,
  isProcessRunning,
} from './runtime-maintenance.js';

const ALERT_LOG_PATH = process.env.CHIPPY_ALERT_LOG_PATH || path.join(WATCHDOG_RUN_DIR, 'watchdog-alerts.log');

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

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function nowIso() {
  return new Date().toISOString();
}

function shouldSendAlert(lastAlertAt, cooldownMinutes) {
  const last = Number.isFinite(Date.parse(lastAlertAt || '')) ? Date.parse(lastAlertAt) : 0;
  const cooldownMs = clampInt(cooldownMinutes, 1, 1440, 30) * 60 * 1000;
  if (!last) return true;
  return Date.now() - last > cooldownMs;
}

function parseJsonFromText(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT_DIR,
      env: {
        ...process.env,
        ...(options.env || {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: stderr || String(error?.message || error || ''),
        command: [command, ...args].join(' '),
      });
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code: Number.isInteger(code) ? code : -1,
        stdout,
        stderr,
        command: [command, ...args].join(' '),
      });
    });
  });
}

async function sendAlert({ webhookUrl, title, message, payload }) {
  const endpoint = String(webhookUrl || '').trim();
  if (!endpoint) {
    const body = {
      channel: 'local-log',
      title,
      message,
      timestamp: nowIso(),
      payload,
    };
    await fs.mkdir(path.dirname(ALERT_LOG_PATH), { recursive: true });
    await fs.appendFile(ALERT_LOG_PATH, `${JSON.stringify(body)}\n`, 'utf8');
    return {
      sent: true,
      status: 0,
      response: 'stored-in-local-alert-log',
      logPath: ALERT_LOG_PATH,
    };
  }

  const body = {
    text: `[Chippy Watchdog] ${title}: ${message}`,
    title,
    message,
    timestamp: nowIso(),
    payload,
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    return {
      sent: response.ok,
      status: response.status,
      response: raw || null,
    };
  } catch (error) {
    return {
      sent: false,
      error: error?.message || String(error || 'alert failed'),
    };
  }
}

async function startGateway(workspaceIds = []) {
  const args = [path.join('bin', 'chippy.js'), 'gateway', 'start', '--json'];
  if (workspaceIds.length > 0) {
    args.push('--workspace-ids', workspaceIds.join(','));
  }

  const result = await runCommand(process.execPath, args, {
    env: {
      DOTENV_CONFIG_QUIET: 'true',
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr || result.stdout || 'gateway start command failed',
      command: result.command,
    };
  }

  const parsed = parseJsonFromText(result.stdout);
  if (!parsed) {
    return {
      ok: false,
      error: 'invalid gateway start output',
      command: result.command,
    };
  }

  return {
    ok: true,
    result: parsed,
  };
}

class Watchdog {
  constructor({ workspaceIds = [], flags = {} } = {}) {
    this.workspaceIds = parseWorkspaceIds([workspaceIds, parseWorkspaceIdsFromEnv()]);
    this.once = flags.once === true;
    this.noStart = flags['no-start'] === true;
    this.intervalSeconds = clampInt(flags['interval-seconds'] || process.env.CHIPPY_WATCHDOG_INTERVAL_SECONDS, 15, 3600, 60);
    this.backupIntervalMinutes = clampInt(flags['backup-interval-minutes'] || process.env.CHIPPY_WATCHDOG_BACKUP_INTERVAL_MINUTES, 0, 10080, 360);
    this.logRotateMaxBytes = clampInt(flags['log-rotate-max-bytes'] || process.env.CHIPPY_LOG_ROTATE_MAX_BYTES, 100000, 1073741824, 5 * 1024 * 1024);
    this.logRotateKeep = clampInt(flags['log-rotate-keep'] || process.env.CHIPPY_LOG_ROTATE_KEEP, 1, 20, 5);
    this.maxRestartsPerHour = clampInt(flags['max-restarts-per-hour'] || process.env.CHIPPY_WATCHDOG_MAX_RESTARTS_PER_HOUR, 1, 50, 5);
    this.alertCooldownMinutes = clampInt(flags['alert-cooldown-minutes'] || process.env.CHIPPY_WATCHDOG_ALERT_COOLDOWN_MINUTES, 1, 1440, 30);
    this.alertWebhook = String(flags['alert-webhook'] || process.env.CHIPPY_ALERT_WEBHOOK_URL || '').trim();
    this.startedAt = nowIso();
    this.stopping = false;
    this.inCycle = false;
    this.state = null;
  }

  async init() {
    await fs.mkdir(WATCHDOG_RUN_DIR, { recursive: true });
    const existingRaw = await fs.readFile(WATCHDOG_PID_PATH, 'utf8').catch(() => '');
    const existingPid = Number(String(existingRaw || '').trim());
    if (isProcessRunning(existingPid) && existingPid !== process.pid) {
      throw new Error(`Watchdog already running with pid ${existingPid}`);
    }
    await fs.writeFile(WATCHDOG_PID_PATH, `${process.pid}\n`, 'utf8');

    const currentState = await readWatchdogState();
    this.state = currentState && typeof currentState === 'object'
      ? currentState
      : {
        startedAt: this.startedAt,
        lastRunAt: null,
        consecutiveFailures: 0,
        lastAlertAt: null,
        lastBackupAt: null,
        restarts: [],
        workspaceIds: this.workspaceIds,
      };

    this.registerSignals();
    await this.persistState();
  }

  registerSignals() {
    const shutdown = async (signal) => {
      if (this.stopping) return;
      this.stopping = true;
      this.state = {
        ...(this.state || {}),
        stoppedAt: nowIso(),
        stopSignal: signal,
      };
      await this.persistState();
      await fs.rm(WATCHDOG_PID_PATH, { force: true });
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT').catch(() => process.exit(1)));
    process.on('SIGTERM', () => shutdown('SIGTERM').catch(() => process.exit(1)));
  }

  async persistState() {
    await writeWatchdogState({
      ...(this.state || {}),
      updatedAt: nowIso(),
      workspaceIds: this.workspaceIds,
      config: {
        intervalSeconds: this.intervalSeconds,
        backupIntervalMinutes: this.backupIntervalMinutes,
        logRotateMaxBytes: this.logRotateMaxBytes,
        logRotateKeep: this.logRotateKeep,
        maxRestartsPerHour: this.maxRestartsPerHour,
        noStart: this.noStart,
      },
    });
  }

  async runCycle() {
    if (this.inCycle || this.stopping) return null;
    this.inCycle = true;
    try {
      const startedAtMs = Date.now();
      const gatewayBefore = await getGatewayStatusSummary();
      const rotations = await rotateRuntimeLogs({
        workspaceIds: this.workspaceIds,
        maxBytes: this.logRotateMaxBytes,
        keep: this.logRotateKeep,
      });

      let startAttempt = null;
      if (!gatewayBefore.running && !this.noStart) {
        startAttempt = await startGateway(this.workspaceIds);
      }

      const gatewayAfter = await getGatewayStatusSummary();
      let backup = null;
      if (this.backupIntervalMinutes > 0) {
        const lastBackupMs = Number.isFinite(Date.parse(this.state?.lastBackupAt || ''))
          ? Date.parse(this.state.lastBackupAt)
          : 0;
        const backupIntervalMs = this.backupIntervalMinutes * 60 * 1000;
        if (!lastBackupMs || Date.now() - lastBackupMs > backupIntervalMs) {
          backup = await createBackupSnapshot({
            workspaceIds: this.workspaceIds,
            label: 'watchdog-scheduled',
          });
          this.state.lastBackupAt = backup.createdAt;
        }
      }

      const ok = gatewayAfter.running === true;
      const now = nowIso();
      const previousFailures = Number(this.state?.consecutiveFailures || 0);
      this.state.lastRunAt = now;
      this.state.lastResult = {
        ok,
        durationMs: Date.now() - startedAtMs,
        gatewayBeforeRunning: gatewayBefore.running,
        gatewayAfterRunning: gatewayAfter.running,
        startAttempt,
        backupId: backup?.id || null,
        rotatedFiles: rotations.files.filter((item) => item.rotated).length,
      };

      if (startAttempt?.ok) {
        const restarts = Array.isArray(this.state.restarts) ? this.state.restarts : [];
        restarts.push(now);
        this.state.restarts = restarts.slice(-300);
      }

      if (ok) {
        this.state.consecutiveFailures = 0;
      } else {
        this.state.consecutiveFailures = previousFailures + 1;
      }

      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const recentRestarts = (Array.isArray(this.state.restarts) ? this.state.restarts : [])
        .filter((item) => Number.isFinite(Date.parse(item)) && Date.parse(item) >= oneHourAgo);

      let alert = null;
      if (!ok && shouldSendAlert(this.state.lastAlertAt, this.alertCooldownMinutes)) {
        alert = await sendAlert({
          webhookUrl: this.alertWebhook,
          title: 'Gateway Down',
          message: `Gateway is not running after watchdog cycle (failures=${this.state.consecutiveFailures}).`,
          payload: {
            workspaceIds: this.workspaceIds,
            cycle: this.state.lastResult,
          },
        });
        if (alert.sent) {
          this.state.lastAlertAt = now;
        }
      } else if (recentRestarts.length > this.maxRestartsPerHour && shouldSendAlert(this.state.lastAlertAt, this.alertCooldownMinutes)) {
        alert = await sendAlert({
          webhookUrl: this.alertWebhook,
          title: 'Gateway Restart Storm',
          message: `Watchdog observed ${recentRestarts.length} gateway restarts in the last hour.`,
          payload: {
            workspaceIds: this.workspaceIds,
            recentRestarts,
          },
        });
        if (alert.sent) {
          this.state.lastAlertAt = now;
        }
      } else if (ok && previousFailures > 0 && shouldSendAlert(this.state.lastAlertAt, this.alertCooldownMinutes)) {
        alert = await sendAlert({
          webhookUrl: this.alertWebhook,
          title: 'Gateway Recovered',
          message: `Gateway recovered after ${previousFailures} failed cycle(s).`,
          payload: {
            workspaceIds: this.workspaceIds,
            cycle: this.state.lastResult,
          },
        });
        if (alert.sent) {
          this.state.lastAlertAt = now;
        }
      }

      await this.persistState();
      return {
        ok,
        startedAt: now,
        gatewayBefore,
        gatewayAfter,
        startAttempt,
        backup,
        rotations,
        alert,
      };
    } finally {
      this.inCycle = false;
    }
  }

  async run() {
    await this.init();
    const first = await this.runCycle();
    if (this.once) {
      await fs.rm(WATCHDOG_PID_PATH, { force: true });
      return first;
    }

    console.log(`[watchdog] running interval=${this.intervalSeconds}s workspaces=${this.workspaceIds.join(',') || '(auto)'}`);
    const timer = setInterval(() => {
      this.runCycle().catch((error) => {
        console.error('[watchdog] cycle failed:', error?.message || error);
      });
    }, this.intervalSeconds * 1000);

    await new Promise((resolve) => {
      const done = () => {
        clearInterval(timer);
        resolve();
      };
      process.on('SIGINT', done);
      process.on('SIGTERM', done);
    });
    return null;
  }
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const workspaceIds = parseWorkspaceIds([
    typeof flags['workspace-id'] === 'string' ? flags['workspace-id'] : '',
    typeof flags['workspace-ids'] === 'string' ? flags['workspace-ids'] : '',
    parseWorkspaceIdsFromEnv(),
  ]);

  const watchdog = new Watchdog({
    workspaceIds,
    flags,
  });
  const result = await watchdog.run();

  if (flags.json && result) {
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error('[watchdog] fatal:', error?.message || error);
  process.exitCode = 1;
});
