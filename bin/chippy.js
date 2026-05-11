#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDefaultAgentRuntime, createDefaultProviderRegistry, createDefaultToolRegistry } from '../agent-runtime/index.js';
import {
  rotateRuntimeLogs,
  createBackupSnapshot,
  listBackups as listBackupSnapshots,
  restoreBackupSnapshot,
  runSystemDoctor,
  getWatchdogStatusSummary as getWatchdogStatusSummaryFromMaintenance,
} from '../scripts/runtime-maintenance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WHATSAPP_LINKED_BASE_DIR = process.env.CHIPPY_WHATSAPP_LINKED_DIR || path.join(ROOT_DIR, '.runs', 'whatsapp-gateway');
const GATEWAY_RUN_DIR = process.env.CHIPPY_GATEWAY_RUN_DIR || path.join(ROOT_DIR, '.runs', 'gateway');
const GATEWAY_PID_PATH = path.join(GATEWAY_RUN_DIR, 'gateway.pid');
const GATEWAY_LOCK_PATH = path.join(GATEWAY_RUN_DIR, 'gateway.lock');
const GATEWAY_STATE_PATH = path.join(GATEWAY_RUN_DIR, 'gateway-state.json');
const GATEWAY_LOG_PATH = path.join(GATEWAY_RUN_DIR, 'gateway.log');
const WATCHDOG_RUN_DIR = process.env.CHIPPY_WATCHDOG_RUN_DIR || GATEWAY_RUN_DIR;
const WATCHDOG_PID_PATH = path.join(WATCHDOG_RUN_DIR, 'watchdog.pid');
const WATCHDOG_STATE_PATH = path.join(WATCHDOG_RUN_DIR, 'watchdog-state.json');
const WATCHDOG_LOG_PATH = path.join(WATCHDOG_RUN_DIR, 'watchdog.log');
const BACKUP_BASE_DIR = process.env.CHIPPY_BACKUP_DIR || path.join(ROOT_DIR, '.runs', 'backups');
const WHATSAPP_PAIRING_TTL_MS = 60 * 60 * 1000;
const WHATSAPP_PAIRING_PENDING_LIMIT = Math.max(
  1,
  Number.isFinite(Number(process.env.WHATSAPP_PAIRING_PENDING_LIMIT))
    ? Math.round(Number(process.env.WHATSAPP_PAIRING_PENDING_LIMIT))
    : 3
);

function parseArgs(rawArgs) {
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
    'Chippy Agent CLI',
    '',
    'Usage:',
    '  chippy provider list',
    '  chippy tool list',
    '  chippy tool exec <tool-name> --input \'{"key":"value"}\' [--context \'{"tenantId":"..."}\'] [--execute] [--json]',
    '  chippy agent run --goal "Your objective" [--provider gemini.flash] [--model ...] [--json]',
    '  chippy email process [--provider local.heuristic] [--limit 3] [--execute-write] [--json]',
    '  chippy action list [--status pending_review] [--run-id run_xxx] [--json]',
    '  chippy action process --action-id action_xxx --decision approve|deny [--decided-by cli] [--json]',
    '  chippy gateway start [--workspace-id <id>]',
    '  chippy gateway status [--json]',
    '  chippy gateway stop',
    '  chippy gateway restart [--workspace-id <id>]',
    '  chippy gateway install [--workspace-id <id>]',
    '  chippy gateway uninstall',
    '  chippy gateway doctor [--workspace-id <id>] [--json]',
    '  chippy gateway rotate-logs [--max-bytes <n>] [--keep <n>] [--workspace-id <id>] [--json]',
    '  chippy watchdog start [--workspace-id <id>] [--interval-seconds 60]',
    '  chippy watchdog status [--json]',
    '  chippy watchdog stop',
    '  chippy watchdog restart [--workspace-id <id>] [--interval-seconds 60]',
    '  chippy watchdog install [--workspace-id <id>]',
    '  chippy watchdog uninstall',
    '  chippy backup create [--label nightly] [--workspace-id <id>] [--json]',
    '  chippy backup list [--limit 20] [--json]',
    '  chippy backup restore --id <backup-id> [--force] [--json]',
    '  chippy channels login --channel whatsapp [--workspace-id <id>] [--relink]',
    '  chippy channels status --channel whatsapp [--workspace-id <id>]',
    '  chippy channels stop --channel whatsapp [--workspace-id <id>]',
    '  chippy pairing list whatsapp [--workspace-id <id>]',
    '  chippy pairing approve whatsapp <CODE> [--workspace-id <id>]',
    '  chippy pairing deny whatsapp <CODE> [--workspace-id <id>]',
    '  chippy whatsapp send --to +14165551234 --message "Hello from Chippy" [--linked] [--workspace-id <id>]',
    '',
    'Options for agent run:',
    '  --goal               Required run objective',
    '  --provider           Provider id (default: gemini.flash)',
    '  --model              Optional model override',
    '  --max-agents         Max task agents (default: 5)',
    '  --max-steps          Max execution steps (default: 12)',
    '  --min-review-score   Threshold 0..1 (default: 0.65)',
    '  --api-key            Optional API key override',
    '  --base-url           Optional provider base URL (for ollama)',
    '  --fixture            Optional JSON fixture file path for deterministic tool runs',
    '  --lead-id            Optional lead id hint for followup flow',
    '  --lead-email         Optional lead email hint for followup flow',
    '  --owner-email        Optional owner email for email workflows',
    '  --company-name       Optional company name override for email templates',
    '  --timezone           Optional IANA timezone (example: America/New_York)',
    '  --user-id            Optional tenant/user id for real data lookups',
    '  --tenant-id          Optional tenant id alias',
    '  --api-base-url       Optional backend base URL for live calendar slots',
    '  --requested-date     Optional booking date hint (YYYY-MM-DD)',
    '  --email-limit        Optional max inbox messages to process (default: 3)',
    '  --email-source       Optional inbox source (gmail|storage|fixture)',
    '  --email-transport    Optional reply transport (gmail|resend)',
    '  --execute-write      Request live write actions (requires policy approval)',
    '  --iterative-executor true|false (default: env CHIPPY_ENABLE_ITERATIVE_EXECUTOR=true)',
    '  --iterative-max-steps Max iterative executor turns (default: env CHIPPY_ITERATIVE_MAX_STEPS=4)',
    '  --input              Tool exec JSON input payload',
    '  --input-file         Tool exec JSON input file path',
    '  --context            Tool exec JSON context payload',
    '  --execute            Tool exec: run non-dry mode (required for write side effects)',
    '  --approval-mode      AUTO | REVIEW_REQUIRED | BLOCKED (default: REVIEW_REQUIRED)',
    '  --max-tool-calls     Max tool calls per run (default: 12)',
    '  --max-write-actions  Max write actions per run (default: 3)',
    '  --allowed-scopes     Comma-separated tool scopes (none,read,write)',
    '  --quiet-hours        Quiet hours window HH-HH (example: 22-7) or off',
    '  --storage-backend    auto | sqlite | supabase (default: auto)',
    '  --db-path            Optional SQLite db path (default: .runs/agent-runtime/runtime.db)',
    '  --workspace-id       Workspace id for channel/pairing/linked-send commands',
    '  --workspace-ids      Comma-separated workspace ids for gateway commands',
    '  --channel            Channel name (currently: whatsapp)',
    '  --interval-seconds   Interval for watchdog checks (default: 60)',
    '  --backup-interval-minutes  Watchdog scheduled backup interval (default: 360)',
    '  --max-bytes          Log rotation threshold in bytes (default: 5242880)',
    '  --keep               Log rotation generations to keep (default: 5)',
    '  --id                 Backup id (required for backup restore)',
    '  --force              Force restore even if gateway is currently running',
    '  --relink             Reset linked WhatsApp auth and force fresh QR',
    '  --linked             Force linked-device outbox for `whatsapp send`',
    '  --no-fallback        Strict mode: disable provider fallback',
    '  --json               Print machine-readable JSON output',
  ].join('\n'));
}

function printProviderTable(list) {
  const header = ['ID', 'Default Model', 'Capabilities', 'Description'];
  const rows = list.map((p) => [
    p.id,
    p.defaultModel || '-',
    JSON.stringify(p.capabilities || {}),
    p.description || '',
  ]);

  const colWidths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const format = (row) => row.map((cell, i) => cell.padEnd(colWidths[i])).join('  ');

  console.log(format(header));
  console.log(colWidths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(format(row));
  }
}

function printToolTable(list) {
  const header = ['Name', 'SideEffect', 'DryRun', 'Source Module', 'Description'];
  const rows = list.map((t) => [
    t.name,
    t.sideEffect,
    String(t.supportsDryRun),
    t.sourceModule || '-',
    t.description || '',
  ]);

  const colWidths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const format = (row) => row.map((cell, i) => cell.padEnd(colWidths[i])).join('  ');

  console.log(format(header));
  console.log(colWidths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(format(row));
  }
}

function printActionTable(list) {
  const header = ['Action ID', 'Run ID', 'Tool', 'Status', 'Decision', 'Execution', 'Created At'];
  const rows = list.map((item) => [
    item.id,
    item.runId,
    item.toolName,
    item.status,
    item.decision || '-',
    item.executionStatus || '-',
    item.createdAt,
  ]);

  const colWidths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] || '').length)));
  const format = (row) => row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join('  ');

  console.log(format(header));
  console.log(colWidths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(format(row));
  }
}

function eventLogger(event) {
  const noisyTypes = new Set(['agent.execute.started', 'agent.execute.completed']);
  if (noisyTypes.has(event.type)) return;
  console.log(`[event] ${event.type}`);
}

function normalizeApprovalMode(raw) {
  const value = String(raw || 'REVIEW_REQUIRED').toUpperCase();
  if (!['AUTO', 'REVIEW_REQUIRED', 'BLOCKED'].includes(value)) {
    throw new Error(`Invalid --approval-mode: ${raw}. Use AUTO, REVIEW_REQUIRED, or BLOCKED.`);
  }
  return value;
}

function normalizeStorageBackend(raw) {
  const value = String(raw || 'auto').toLowerCase();
  if (!['auto', 'sqlite', 'supabase'].includes(value)) {
    throw new Error(`Invalid --storage-backend: ${raw}. Use auto, sqlite, or supabase.`);
  }
  return value;
}

function normalizeDecision(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!['approve', 'deny'].includes(value)) {
    throw new Error(`Invalid --decision: ${raw}. Use approve or deny.`);
  }
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function parseAllowedScopes(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return ['none', 'read', 'write'];
  }

  const scopes = String(raw)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (scopes.length === 0) {
    throw new Error('Invalid --allowed-scopes: must include at least one scope.');
  }

  for (const scope of scopes) {
    if (!['none', 'read', 'write'].includes(scope)) {
      throw new Error(`Invalid scope "${scope}" in --allowed-scopes. Use none, read, write.`);
    }
  }

  return Array.from(new Set(scopes));
}

function parseQuietHours(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return {
      enabled: false,
      startHour: 22,
      endHour: 7,
    };
  }

  const value = String(raw).trim().toLowerCase();
  if (value === 'off' || value === 'disabled') {
    return {
      enabled: false,
      startHour: 22,
      endHour: 7,
    };
  }

  const match = value.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    throw new Error(`Invalid --quiet-hours: ${raw}. Use HH-HH (example: 22-7) or "off".`);
  }

  const startHour = Number(match[1]);
  const endHour = Number(match[2]);
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23 || !Number.isInteger(endHour) || endHour < 0 || endHour > 23) {
    throw new Error(`Invalid --quiet-hours: ${raw}. Hours must be between 0 and 23.`);
  }

  return {
    enabled: true,
    startHour,
    endHour,
  };
}

function parsePositiveInt(raw, flagName, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${flagName}: ${raw}. Must be an integer >= 1.`);
  }
  return value;
}

function parseOptionalBooleanFlag(raw, flagName) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  const value = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`Invalid ${flagName}: ${raw}. Use true or false.`);
}

function parseJsonFlag(raw, flagName, fallback = {}) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  try {
    return JSON.parse(String(raw));
  } catch (error) {
    throw new Error(`Invalid ${flagName}: ${error.message || error}`);
  }
}

function normalizeWhatsAppAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  const withoutPrefix = lowered.startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;
  const compact = withoutPrefix.replace(/[^\d+]/g, '');
  if (!compact) return '';
  const normalized = compact.startsWith('+') ? compact : `+${compact}`;
  return `whatsapp:${normalized}`;
}

async function sendWhatsAppMessage({ to, message }) {
  const accountSid = process.env.WHATSAPP_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.WHATSAPP_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '';
  const from = process.env.WHATSAPP_TWILIO_FROM || process.env.WHATSAPP_FROM_NUMBER || 'whatsapp:+14155238886';

  if (!accountSid) {
    throw new Error('Missing WHATSAPP_TWILIO_ACCOUNT_SID (or TWILIO_ACCOUNT_SID).');
  }
  if (!authToken) {
    throw new Error('Missing WHATSAPP_TWILIO_AUTH_TOKEN (or TWILIO_AUTH_TOKEN).');
  }

  const normalizedTo = normalizeWhatsAppAddress(to);
  const normalizedFrom = normalizeWhatsAppAddress(from);
  if (!normalizedTo) {
    throw new Error('Invalid --to phone number.');
  }
  if (!normalizedFrom) {
    throw new Error('Invalid WHATSAPP_TWILIO_FROM (or WHATSAPP_FROM_NUMBER).');
  }

  const body = new URLSearchParams({
    To: normalizedTo,
    From: normalizedFrom,
    Body: String(message || ''),
  });

  const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const rawText = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = { raw: rawText };
  }

  if (!response.ok) {
    const messageText = payload?.message || rawText || `Twilio API error ${response.status}`;
    throw new Error(`Twilio send failed (${response.status}): ${messageText}`);
  }

  return payload;
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[^\d+]/g, '');
  if (!compact) return '';
  return compact.startsWith('+') ? compact : `+${compact}`;
}

function parseOwnerNumbers(raw) {
  if (!raw || typeof raw !== 'string') return new Set();
  return new Set(
    raw
      .split(',')
      .map((item) => normalizePhone(item))
      .filter(Boolean)
  );
}

function normalizeAllowFrom(values = []) {
  const list = Array.isArray(values) ? values : [];
  return Array.from(new Set(list.map((value) => normalizePhone(value)).filter(Boolean)));
}

function sanitizeWorkspaceFileKey(workspaceId = '') {
  return String(workspaceId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128) || 'workspace';
}

function parsePairingCode(rawCode = '') {
  return String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatPairingCode(rawCode = '') {
  const code = parsePairingCode(rawCode);
  if (!code) return '';
  return code.match(/.{1,4}/g)?.join('-') || code;
}

function resolveWorkspaceId(flags) {
  const workspaceId = typeof flags['workspace-id'] === 'string'
    ? String(flags['workspace-id']).trim()
    : String(process.env.WHATSAPP_DEFAULT_WORKSPACE_ID || '').trim();

  if (!workspaceId) {
    throw new Error('Missing workspace id. Use --workspace-id or set WHATSAPP_DEFAULT_WORKSPACE_ID.');
  }
  return workspaceId;
}

function resolveChannel(positionals, flags) {
  const fromFlag = typeof flags.channel === 'string' ? flags.channel.trim().toLowerCase() : '';
  const fromPositional = typeof positionals[2] === 'string' ? positionals[2].trim().toLowerCase() : '';
  const channel = fromFlag || fromPositional || 'whatsapp';
  if (channel !== 'whatsapp') {
    throw new Error(`Unsupported channel "${channel}". Only "whatsapp" is supported right now.`);
  }
  return channel;
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

function hasTwilioWhatsAppConfig() {
  const accountSid = process.env.WHATSAPP_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.WHATSAPP_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '';
  return Boolean(String(accountSid).trim() && String(authToken).trim());
}

function randomMessageId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function enqueueLinkedWhatsappMessage({ workspaceId, to, message }) {
  const normalizedTo = normalizePhone(to);
  const normalizedMessage = String(message || '').trim();
  if (!normalizedTo) {
    throw new Error('Invalid destination phone number.');
  }
  if (!normalizedMessage) {
    throw new Error('Message text is required.');
  }

  const paths = linkedWhatsappPaths(workspaceId);
  const payload = {
    id: randomMessageId(),
    to: normalizedTo,
    message: normalizedMessage,
    createdAt: nowIso(),
    source: 'cli',
  };
  const fileName = `${Date.now()}-${payload.id}.json`;
  const filePath = path.join(paths.outboxDir, fileName);
  await fs.mkdir(paths.outboxDir, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return {
    mode: 'linked',
    workspaceId,
    id: payload.id,
    to: normalizeWhatsAppAddress(payload.to),
    queuedAt: payload.createdAt,
    queueFile: filePath,
  };
}

async function readLinkedWhatsappState(workspaceId = '') {
  const paths = linkedWhatsappPaths(workspaceId);
  await fs.mkdir(WHATSAPP_LINKED_BASE_DIR, { recursive: true });

  let parsed = null;
  try {
    const raw = await fs.readFile(paths.statePath, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const ownerList = normalizeAllowFrom(Array.from(parseOwnerNumbers(process.env.WHATSAPP_OWNER_NUMBERS || '')));
  const policy = parsed?.policy && typeof parsed.policy === 'object' ? parsed.policy : {};
  const dmPolicy = policy.dmPolicy === 'allowlist' ? 'allowlist' : 'pairing';
  const allowFrom = normalizeAllowFrom([...(policy.allowFrom || []), ...ownerList]);
  const nowMs = Date.now();
  const pairingsRaw = Array.isArray(parsed?.pairings) ? parsed.pairings : [];
  const pairings = pairingsRaw
    .map((item) => {
      const code = parsePairingCode(item?.code || '');
      const phone = normalizePhone(item?.phone || '');
      if (!code || !phone) return null;

      const requestedAtMs = Number.isFinite(Date.parse(item?.requestedAt || ''))
        ? Date.parse(item.requestedAt)
        : nowMs;
      const expiresAtMs = requestedAtMs + WHATSAPP_PAIRING_TTL_MS;
      const approved = item?.status === 'approved';
      const expired = expiresAtMs <= nowMs;

      return {
        code,
        phone,
        requestedAt: new Date(requestedAtMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        status: approved ? 'approved' : (expired ? 'expired' : 'pending'),
        approvedAt: approved && item?.approvedAt ? String(item.approvedAt) : null,
        approvedBy: approved && item?.approvedBy ? String(item.approvedBy) : null,
      };
    })
    .filter(Boolean);

  return {
    workspaceId,
    policy: {
      dmPolicy,
      allowFrom,
    },
    pairings,
    updatedAt: new Date().toISOString(),
  };
}

async function writeLinkedWhatsappState(workspaceId = '', state = {}) {
  const paths = linkedWhatsappPaths(workspaceId);
  await fs.mkdir(WHATSAPP_LINKED_BASE_DIR, { recursive: true });
  await fs.writeFile(paths.statePath, `${JSON.stringify({
    workspaceId,
    policy: {
      dmPolicy: state?.policy?.dmPolicy === 'allowlist' ? 'allowlist' : 'pairing',
      allowFrom: normalizeAllowFrom(state?.policy?.allowFrom || []),
    },
    pairings: Array.isArray(state?.pairings) ? state.pairings : [],
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
}

async function listLinkedPendingPairings(workspaceId = '') {
  const state = await readLinkedWhatsappState(workspaceId);
  return state.pairings
    .filter((item) => item.status === 'pending')
    .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
    .slice(0, WHATSAPP_PAIRING_PENDING_LIMIT)
    .map((item) => ({
      code: formatPairingCode(item.code),
      phone: item.phone,
      requestedAt: item.requestedAt,
      expiresAt: item.expiresAt,
      status: item.status,
    }));
}

async function approveLinkedPairingCli({ workspaceId, code, approvedBy }) {
  const normalizedCode = parsePairingCode(code);
  if (!normalizedCode) {
    throw new Error('Invalid pairing code.');
  }

  const state = await readLinkedWhatsappState(workspaceId);
  const nowIsoValue = new Date().toISOString();
  let matched = null;

  state.pairings = state.pairings.map((item) => {
    if (item.code !== normalizedCode || item.status !== 'pending') return item;
    matched = item;
    return {
      ...item,
      status: 'approved',
      approvedAt: nowIsoValue,
      approvedBy: approvedBy || null,
    };
  });

  if (!matched) {
    throw new Error('Pairing request not found or expired.');
  }

  state.policy.allowFrom = normalizeAllowFrom([...(state.policy.allowFrom || []), matched.phone]);
  await writeLinkedWhatsappState(workspaceId, state);
  return {
    code: formatPairingCode(normalizedCode),
    phone: matched.phone,
  };
}

async function denyLinkedPairingCli({ workspaceId, code, decidedBy }) {
  const normalizedCode = parsePairingCode(code);
  if (!normalizedCode) {
    throw new Error('Invalid pairing code.');
  }

  const state = await readLinkedWhatsappState(workspaceId);
  let changed = false;
  state.pairings = state.pairings.map((item) => {
    if (item.code !== normalizedCode || item.status !== 'pending') return item;
    changed = true;
    return {
      ...item,
      status: 'expired',
      approvedAt: new Date().toISOString(),
      approvedBy: decidedBy || null,
    };
  });

  if (!changed) {
    throw new Error('Pairing request not found or expired.');
  }
  await writeLinkedWhatsappState(workspaceId, state);
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

async function readWorkspacePid(workspaceId = '') {
  const paths = linkedWhatsappPaths(workspaceId);
  try {
    const raw = await fs.readFile(paths.pidPath, 'utf8');
    const pid = Number(String(raw).trim());
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function startLinkedWhatsappGatewayCli({ workspaceId, forceQr = true, resetAuth = false } = {}) {
  const paths = linkedWhatsappPaths(workspaceId);
  const gatewayPid = await readGatewayPid();
  if (isProcessRunning(gatewayPid)) {
    return {
      managedByGateway: true,
      gatewayPid,
      alreadyRunning: true,
      pid: null,
      paths,
    };
  }
  const currentPid = await readWorkspacePid(workspaceId);
  if (isProcessRunning(currentPid)) {
    return {
      alreadyRunning: true,
      pid: currentPid,
      paths,
    };
  }

  await fs.mkdir(WHATSAPP_LINKED_BASE_DIR, { recursive: true });
  const args = ['scripts/whatsapp-linked-device.js', '--workspace-id', workspaceId];
  if (forceQr) args.push('--force-qr');
  if (resetAuth) args.push('--reset-auth');

  const outFd = fsSync.openSync(paths.logPath, 'a');
  const child = spawn('node', args, {
    cwd: ROOT_DIR,
    detached: true,
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
    // ignore fd close issues
  }

  child.unref();
  await fs.writeFile(paths.pidPath, `${child.pid}\n`, 'utf8');
  return {
    alreadyRunning: false,
    pid: child.pid,
    paths,
  };
}

async function stopLinkedWhatsappGatewayCli({ workspaceId } = {}) {
  const paths = linkedWhatsappPaths(workspaceId);
  const gatewayPid = await readGatewayPid();
  if (isProcessRunning(gatewayPid)) {
    return { managedByGateway: true, gatewayPid, stopped: false, pid: null, paths };
  }
  const pid = await readWorkspacePid(workspaceId);
  if (!isProcessRunning(pid)) {
    await fs.rm(paths.pidPath, { force: true });
    return { stopped: false, pid: null, paths };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore kill errors
  }

  await fs.rm(paths.pidPath, { force: true });
  return { stopped: true, pid, paths };
}

async function readLogTail(filePath, maxChars = 1200) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (raw.length <= maxChars) return raw;
    return raw.slice(raw.length - maxChars);
  } catch {
    return '';
  }
}

async function getLinkedGatewaySummaryCli(workspaceId) {
  const paths = linkedWhatsappPaths(workspaceId);
  const pid = await readWorkspacePid(workspaceId);
  const running = isProcessRunning(pid);
  const state = await readLinkedWhatsappState(workspaceId);
  await writeLinkedWhatsappState(workspaceId, state);
  const pendingPairings = await listLinkedPendingPairings(workspaceId);
  const logTail = await readLogTail(paths.logPath);

  return {
    workspaceId,
    channel: 'whatsapp',
    gateway: {
      running,
      pid: running ? pid : null,
      hasAuthSession: fsSync.existsSync(paths.authDir),
      qrPngPath: fsSync.existsSync(paths.qrPngPath) ? paths.qrPngPath : null,
      qrTextPath: fsSync.existsSync(paths.qrTextPath) ? paths.qrTextPath : null,
      logPath: paths.logPath,
      logTail,
    },
    policy: state.policy,
    pendingPairings,
  };
}

function printPairingTable(list) {
  const header = ['Code', 'Phone', 'Requested At', 'Expires At', 'Status'];
  const rows = list.map((item) => [
    item.code || '',
    item.phone || '',
    item.requestedAt || '',
    item.expiresAt || '',
    item.status || '',
  ]);

  const colWidths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] || '').length)));
  const format = (row) => row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join('  ');

  console.log(format(header));
  console.log(colWidths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(format(row));
  }
}

function printChannelStatus(summary) {
  const statusLabel = summary?.gateway?.running ? 'running' : 'stopped';
  console.log(`Workspace: ${summary.workspaceId}`);
  console.log(`Channel: ${summary.channel}`);
  console.log(`Gateway: ${statusLabel}${summary?.gateway?.pid ? ` (pid=${summary.gateway.pid})` : ''}`);
  console.log(`Auth session: ${summary?.gateway?.hasAuthSession ? 'present' : 'not linked yet'}`);
  console.log(`DM policy: ${summary?.policy?.dmPolicy || 'pairing'}`);
  const allowFrom = Array.isArray(summary?.policy?.allowFrom) ? summary.policy.allowFrom : [];
  console.log(`Allowlist: ${allowFrom.length > 0 ? allowFrom.join(', ') : '(none)'}`);
  console.log(`Pending pairings: ${Array.isArray(summary?.pendingPairings) ? summary.pendingPairings.length : 0}`);
  if (summary?.gateway?.qrPngPath) {
    console.log(`QR image: ${summary.gateway.qrPngPath}`);
  }
  console.log(`Log file: ${summary?.gateway?.logPath || '(n/a)'}`);
}

function parseWorkspaceIds(flags = {}) {
  const values = [];
  if (typeof flags['workspace-id'] === 'string') values.push(flags['workspace-id']);
  if (typeof flags['workspace-ids'] === 'string') values.push(flags['workspace-ids']);
  if (typeof process.env.CHIPPY_GATEWAY_WORKSPACES === 'string') values.push(process.env.CHIPPY_GATEWAY_WORKSPACES);
  if (typeof process.env.WHATSAPP_DEFAULT_WORKSPACE_ID === 'string') values.push(process.env.WHATSAPP_DEFAULT_WORKSPACE_ID);

  const set = new Set();
  for (const value of values) {
    String(value || '')
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => set.add(item));
  }
  return Array.from(set);
}

async function readGatewayPid() {
  try {
    const raw = await fs.readFile(GATEWAY_PID_PATH, 'utf8');
    const pid = Number(String(raw).trim());
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function readGatewayLockPid() {
  try {
    const raw = await fs.readFile(GATEWAY_LOCK_PATH, 'utf8');
    const pid = Number(String(raw).trim());
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function resolveRunningGatewayPid() {
  const pidFromFile = await readGatewayPid();
  if (isProcessRunning(pidFromFile)) {
    return {
      pid: pidFromFile,
      pidFromFile,
      lockPid: null,
    };
  }

  const lockPid = await readGatewayLockPid();
  if (isProcessRunning(lockPid)) {
    return {
      pid: lockPid,
      pidFromFile: null,
      lockPid,
    };
  }

  return {
    pid: null,
    pidFromFile: null,
    lockPid: null,
  };
}

async function readGatewayState() {
  try {
    const raw = await fs.readFile(GATEWAY_STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getGatewayStatusSummary() {
  const resolved = await resolveRunningGatewayPid();
  const pid = resolved.pid;
  const state = await readGatewayState();
  return {
    running: isProcessRunning(pid),
    pid: isProcessRunning(pid) ? pid : null,
    pidFromFile: resolved.pidFromFile,
    lockPid: resolved.lockPid,
    state,
    pidPath: GATEWAY_PID_PATH,
    lockPath: GATEWAY_LOCK_PATH,
    statePath: GATEWAY_STATE_PATH,
    logPath: GATEWAY_LOG_PATH,
  };
}

function printGatewayStatus(summary) {
  const status = summary.running ? 'running' : 'stopped';
  console.log(`Gateway: ${status}${summary.pid ? ` (pid=${summary.pid})` : ''}`);
  console.log(`PID file: ${summary.pidPath}`);
  console.log(`Lock file: ${summary.lockPath}`);
  console.log(`State file: ${summary.statePath}`);
  console.log(`Log file: ${summary.logPath}`);
  if (Array.isArray(summary?.state?.workspaces)) {
    console.log(`Workspaces: ${summary.state.workspaces.join(', ') || '(none)'}`);
  }
  if (Array.isArray(summary?.state?.workers) && summary.state.workers.length > 0) {
    const active = summary.state.workers.filter((worker) => worker?.running === true);
    console.log(`Workers: ${active.length}/${summary.state.workers.length} running`);
  }
  if (summary?.state?.scheduler) {
    const scheduler = summary.state.scheduler;
    console.log(
      `Scheduler: tick=${scheduler.tickSeconds}s heartbeat=${scheduler.heartbeatMinutes}m objectivePoll=${scheduler.objectivePollSeconds}s autoObjectives=${scheduler.autoRunObjectives === true}`
    );
  }
}

async function startGatewayDaemon({ workspaceIds = [], relinkWorkspaceIds = [] } = {}) {
  const existing = await resolveRunningGatewayPid();
  if (isProcessRunning(existing.pid)) {
    return {
      alreadyRunning: true,
      pid: existing.pid,
      summary: await getGatewayStatusSummary(),
    };
  }

  await fs.mkdir(GATEWAY_RUN_DIR, { recursive: true });
  const args = [path.join('scripts', 'chippy-gateway.js')];
  if (workspaceIds.length > 0) {
    args.push('--workspace-ids', workspaceIds.join(','));
  }
  const relinkList = Array.from(new Set(
    (Array.isArray(relinkWorkspaceIds) ? relinkWorkspaceIds : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));

  const outFd = fsSync.openSync(GATEWAY_LOG_PATH, 'a');
  const child = spawn(process.execPath, args, {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: {
      ...process.env,
      ...(workspaceIds.length > 0 ? { CHIPPY_GATEWAY_WORKSPACES: workspaceIds.join(',') } : {}),
      ...(relinkList.length > 0 ? { CHIPPY_GATEWAY_RELINK_WORKSPACES: relinkList.join(',') } : {}),
    },
  });

  try {
    fsSync.closeSync(outFd);
  } catch {
    // ignore fd close issues
  }
  child.unref();
  await new Promise((resolve) => setTimeout(resolve, 350));

  const summary = await getGatewayStatusSummary();
  return {
    alreadyRunning: false,
    pid: summary.pid || child.pid,
    summary,
  };
}

async function stopGatewayDaemon() {
  const resolved = await resolveRunningGatewayPid();
  const pid = resolved.pid;
  if (!isProcessRunning(pid)) {
    await fs.rm(GATEWAY_PID_PATH, { force: true });
    await fs.rm(GATEWAY_LOCK_PATH, { force: true });
    return {
      stopped: false,
      pid: null,
      summary: await getGatewayStatusSummary(),
    };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore kill errors
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await fs.rm(GATEWAY_PID_PATH, { force: true });
  await fs.rm(GATEWAY_LOCK_PATH, { force: true });

  return {
    stopped: true,
    pid,
    summary: await getGatewayStatusSummary(),
  };
}

async function waitForProcessExit(pid, timeoutMs = 3500) {
  const parsed = Number(pid);
  if (!Number.isInteger(parsed) || parsed < 1) return true;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!isProcessRunning(parsed)) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return !isProcessRunning(parsed);
}

async function readWatchdogPid() {
  try {
    const raw = await fs.readFile(WATCHDOG_PID_PATH, 'utf8');
    const pid = Number(String(raw).trim());
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function getWatchdogStatusSummary() {
  return getWatchdogStatusSummaryFromMaintenance();
}

async function startWatchdogDaemon({ workspaceIds = [], intervalSeconds, backupIntervalMinutes } = {}) {
  const existing = await readWatchdogPid();
  if (isProcessRunning(existing)) {
    return {
      alreadyRunning: true,
      pid: existing,
      summary: await getWatchdogStatusSummary(),
    };
  }

  await fs.mkdir(WATCHDOG_RUN_DIR, { recursive: true });
  const args = [path.join('scripts', 'chippy-watchdog.js')];
  if (workspaceIds.length > 0) {
    args.push('--workspace-ids', workspaceIds.join(','));
  }
  if (Number.isInteger(intervalSeconds) && intervalSeconds > 0) {
    args.push('--interval-seconds', String(intervalSeconds));
  }
  if (Number.isInteger(backupIntervalMinutes) && backupIntervalMinutes >= 0) {
    args.push('--backup-interval-minutes', String(backupIntervalMinutes));
  }

  const outFd = fsSync.openSync(WATCHDOG_LOG_PATH, 'a');
  const child = spawn(process.execPath, args, {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: {
      ...process.env,
      ...(workspaceIds.length > 0 ? { CHIPPY_GATEWAY_WORKSPACES: workspaceIds.join(',') } : {}),
    },
  });
  try {
    fsSync.closeSync(outFd);
  } catch {
    // ignore fd close issues
  }
  child.unref();
  await new Promise((resolve) => setTimeout(resolve, 350));

  const summary = await getWatchdogStatusSummary();
  return {
    alreadyRunning: false,
    pid: summary.pid || child.pid,
    summary,
  };
}

async function stopWatchdogDaemon() {
  const pid = await readWatchdogPid();
  if (!isProcessRunning(pid)) {
    await fs.rm(WATCHDOG_PID_PATH, { force: true });
    return {
      stopped: false,
      pid: null,
      summary: await getWatchdogStatusSummary(),
    };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore kill errors
  }

  let forced = false;
  let exited = await waitForProcessExit(pid, 3500);
  if (!exited) {
    forced = true;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore kill errors
    }
    exited = await waitForProcessExit(pid, 1200);
  }
  await fs.rm(WATCHDOG_PID_PATH, { force: true });

  return {
    stopped: true,
    pid,
    forced,
    exited,
    summary: await getWatchdogStatusSummary(),
  };
}

function printWatchdogStatus(summary) {
  const status = summary.running ? 'running' : 'stopped';
  console.log(`Watchdog: ${status}${summary.pid ? ` (pid=${summary.pid})` : ''}`);
  console.log(`PID file: ${summary.pidPath || WATCHDOG_PID_PATH}`);
  console.log(`State file: ${summary.statePath || WATCHDOG_STATE_PATH}`);
  console.log(`Log file: ${summary.logPath || WATCHDOG_LOG_PATH}`);
  if (Array.isArray(summary?.state?.workspaceIds) && summary.state.workspaceIds.length > 0) {
    console.log(`Workspaces: ${summary.state.workspaceIds.join(', ')}`);
  }
  if (summary?.state?.lastRunAt) {
    console.log(`Last run: ${summary.state.lastRunAt}`);
  }
  if (Number.isInteger(summary?.state?.consecutiveFailures) && summary.state.consecutiveFailures > 0) {
    console.log(`Consecutive failures: ${summary.state.consecutiveFailures}`);
  }
}

function printDoctorReport(report) {
  console.log(`Generated: ${report.generatedAt || 'n/a'}`);
  console.log(`Checks: ok=${report?.summary?.ok || 0} warn=${report?.summary?.warn || 0} error=${report?.summary?.error || 0}`);
  console.log(`Gateway: ${report?.gateway?.running ? `running (pid=${report.gateway.pid})` : 'stopped'}`);
  console.log(`Watchdog: ${report?.watchdog?.running ? `running (pid=${report.watchdog.pid})` : 'stopped'}`);
  console.log('');
  for (const check of report?.checks || []) {
    console.log(`[${String(check.status || 'unknown').toUpperCase()}] ${check.title}`);
    console.log(`  ${check.detail}`);
    if (check.recommendation) {
      console.log(`  recommendation: ${check.recommendation}`);
    }
  }
}

function printBackupTable(list) {
  const header = ['ID', 'Created At', 'Label', 'Workspaces', 'Items'];
  const rows = list.map((item) => [
    item.id || '',
    item.createdAt || '',
    item.label || '-',
    Array.isArray(item.workspaceIds) ? item.workspaceIds.join(',') : '',
    String(item.itemCount || 0),
  ]);
  const colWidths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i] || '').length)));
  const format = (row) => row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join('  ');

  console.log(format(header));
  console.log(colWidths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(format(row));
  }
}

function runCommandSync(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: ROOT_DIR,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error ? (result.error.message || String(result.error)) : null,
    command: [command, ...args].join(' '),
  };
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function installGatewayService({ workspaceIds = [] } = {}) {
  await fs.mkdir(GATEWAY_RUN_DIR, { recursive: true });

  if (process.platform === 'darwin') {
    const home = process.env.HOME || '';
    if (!home) {
      throw new Error('Cannot resolve HOME directory for launchd install.');
    }

    const launchAgentsDir = path.join(home, 'Library', 'LaunchAgents');
    const filePath = path.join(launchAgentsDir, 'com.chippy.gateway.plist');
    await fs.mkdir(launchAgentsDir, { recursive: true });

    const workspaceCsv = workspaceIds.join(',');
    const programNode = escapeXml(process.execPath);
    const programScript = escapeXml(path.join(ROOT_DIR, 'scripts', 'chippy-gateway.js'));
    const workingDirectory = escapeXml(ROOT_DIR);
    const stdoutPath = escapeXml(path.join(GATEWAY_RUN_DIR, 'launchd.out.log'));
    const stderrPath = escapeXml(path.join(GATEWAY_RUN_DIR, 'launchd.err.log'));

    const envPairs = [
      `<key>CHIPPY_GATEWAY_RUN_DIR</key><string>${escapeXml(GATEWAY_RUN_DIR)}</string>`,
      workspaceCsv ? `<key>CHIPPY_GATEWAY_WORKSPACES</key><string>${escapeXml(workspaceCsv)}</string>` : '',
    ].filter(Boolean);

    const plist = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '<key>Label</key><string>com.chippy.gateway</string>',
      '<key>ProgramArguments</key>',
      '<array>',
      `<string>${programNode}</string>`,
      `<string>${programScript}</string>`,
      '</array>',
      '<key>WorkingDirectory</key>',
      `<string>${workingDirectory}</string>`,
      '<key>RunAtLoad</key><true/>',
      '<key>KeepAlive</key><true/>',
      '<key>StandardOutPath</key>',
      `<string>${stdoutPath}</string>`,
      '<key>StandardErrorPath</key>',
      `<string>${stderrPath}</string>`,
      '<key>EnvironmentVariables</key>',
      '<dict>',
      ...envPairs,
      '</dict>',
      '</dict>',
      '</plist>',
      '',
    ].join('\n');

    await fs.writeFile(filePath, plist, 'utf8');

    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    const domain = uid !== null ? `gui/${uid}` : null;
    const actions = [];

    if (domain) {
      actions.push(runCommandSync('launchctl', ['bootout', domain, 'com.chippy.gateway']));
      actions.push(runCommandSync('launchctl', ['bootstrap', domain, filePath]));
      actions.push(runCommandSync('launchctl', ['enable', `${domain}/com.chippy.gateway`]));
      actions.push(runCommandSync('launchctl', ['kickstart', '-k', `${domain}/com.chippy.gateway`]));
    } else {
      actions.push(runCommandSync('launchctl', ['load', '-w', filePath]));
    }

    return {
      platform: 'darwin',
      manager: 'launchd',
      filePath,
      actions,
    };
  }

  if (process.platform === 'linux') {
    const home = process.env.HOME || '';
    if (!home) {
      throw new Error('Cannot resolve HOME directory for systemd user install.');
    }

    const userDir = path.join(home, '.config', 'systemd', 'user');
    const filePath = path.join(userDir, 'chippy-gateway.service');
    await fs.mkdir(userDir, { recursive: true });

    const workspaceCsv = workspaceIds.join(',');
    const lines = [
      '[Unit]',
      'Description=Chippy Gateway Service',
      'After=network-online.target',
      '',
      '[Service]',
      'Type=simple',
      `WorkingDirectory=${ROOT_DIR}`,
      `ExecStart=${process.execPath} ${path.join(ROOT_DIR, 'scripts', 'chippy-gateway.js')}`,
      'Restart=always',
      'RestartSec=5',
      `Environment=CHIPPY_GATEWAY_RUN_DIR=${GATEWAY_RUN_DIR}`,
    ];
    if (workspaceCsv) {
      lines.push(`Environment=CHIPPY_GATEWAY_WORKSPACES=${workspaceCsv}`);
    }
    lines.push('', '[Install]', 'WantedBy=default.target', '');

    await fs.writeFile(filePath, lines.join('\n'), 'utf8');

    const actions = [
      runCommandSync('systemctl', ['--user', 'daemon-reload']),
      runCommandSync('systemctl', ['--user', 'enable', '--now', 'chippy-gateway.service']),
    ];

    return {
      platform: 'linux',
      manager: 'systemd-user',
      filePath,
      actions,
    };
  }

  throw new Error(`Unsupported platform for install: ${process.platform}`);
}

async function uninstallGatewayService() {
  if (process.platform === 'darwin') {
    const home = process.env.HOME || '';
    const filePath = path.join(home, 'Library', 'LaunchAgents', 'com.chippy.gateway.plist');
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    const domain = uid !== null ? `gui/${uid}` : null;
    const actions = [];

    if (domain) {
      actions.push(runCommandSync('launchctl', ['bootout', domain, 'com.chippy.gateway']));
      actions.push(runCommandSync('launchctl', ['disable', `${domain}/com.chippy.gateway`]));
    } else {
      actions.push(runCommandSync('launchctl', ['unload', '-w', filePath]));
    }

    await fs.rm(filePath, { force: true });
    return {
      platform: 'darwin',
      manager: 'launchd',
      filePath,
      actions,
    };
  }

  if (process.platform === 'linux') {
    const home = process.env.HOME || '';
    const filePath = path.join(home, '.config', 'systemd', 'user', 'chippy-gateway.service');
    const actions = [
      runCommandSync('systemctl', ['--user', 'disable', '--now', 'chippy-gateway.service']),
      runCommandSync('systemctl', ['--user', 'daemon-reload']),
    ];
    await fs.rm(filePath, { force: true });
    return {
      platform: 'linux',
      manager: 'systemd-user',
      filePath,
      actions,
    };
  }

  throw new Error(`Unsupported platform for uninstall: ${process.platform}`);
}

async function installWatchdogService({ workspaceIds = [], intervalSeconds, backupIntervalMinutes } = {}) {
  await fs.mkdir(WATCHDOG_RUN_DIR, { recursive: true });

  if (process.platform === 'darwin') {
    const home = process.env.HOME || '';
    if (!home) {
      throw new Error('Cannot resolve HOME directory for launchd install.');
    }

    const launchAgentsDir = path.join(home, 'Library', 'LaunchAgents');
    const filePath = path.join(launchAgentsDir, 'com.chippy.watchdog.plist');
    await fs.mkdir(launchAgentsDir, { recursive: true });

    const workspaceCsv = workspaceIds.join(',');
    const programNode = escapeXml(process.execPath);
    const programScript = escapeXml(path.join(ROOT_DIR, 'scripts', 'chippy-watchdog.js'));
    const workingDirectory = escapeXml(ROOT_DIR);
    const stdoutPath = escapeXml(path.join(WATCHDOG_RUN_DIR, 'watchdog.launchd.out.log'));
    const stderrPath = escapeXml(path.join(WATCHDOG_RUN_DIR, 'watchdog.launchd.err.log'));

    const envPairs = [
      `<key>CHIPPY_WATCHDOG_RUN_DIR</key><string>${escapeXml(WATCHDOG_RUN_DIR)}</string>`,
      workspaceCsv ? `<key>CHIPPY_GATEWAY_WORKSPACES</key><string>${escapeXml(workspaceCsv)}</string>` : '',
      Number.isInteger(intervalSeconds) && intervalSeconds > 0
        ? `<key>CHIPPY_WATCHDOG_INTERVAL_SECONDS</key><string>${escapeXml(String(intervalSeconds))}</string>`
        : '',
      Number.isInteger(backupIntervalMinutes) && backupIntervalMinutes >= 0
        ? `<key>CHIPPY_WATCHDOG_BACKUP_INTERVAL_MINUTES</key><string>${escapeXml(String(backupIntervalMinutes))}</string>`
        : '',
    ].filter(Boolean);

    const plist = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '<key>Label</key><string>com.chippy.watchdog</string>',
      '<key>ProgramArguments</key>',
      '<array>',
      `<string>${programNode}</string>`,
      `<string>${programScript}</string>`,
      '</array>',
      '<key>WorkingDirectory</key>',
      `<string>${workingDirectory}</string>`,
      '<key>RunAtLoad</key><true/>',
      '<key>KeepAlive</key><true/>',
      '<key>StandardOutPath</key>',
      `<string>${stdoutPath}</string>`,
      '<key>StandardErrorPath</key>',
      `<string>${stderrPath}</string>`,
      '<key>EnvironmentVariables</key>',
      '<dict>',
      ...envPairs,
      '</dict>',
      '</dict>',
      '</plist>',
      '',
    ].join('\n');

    await fs.writeFile(filePath, plist, 'utf8');

    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    const domain = uid !== null ? `gui/${uid}` : null;
    const actions = [];

    if (domain) {
      actions.push(runCommandSync('launchctl', ['bootout', domain, 'com.chippy.watchdog']));
      actions.push(runCommandSync('launchctl', ['bootstrap', domain, filePath]));
      actions.push(runCommandSync('launchctl', ['enable', `${domain}/com.chippy.watchdog`]));
      actions.push(runCommandSync('launchctl', ['kickstart', '-k', `${domain}/com.chippy.watchdog`]));
    } else {
      actions.push(runCommandSync('launchctl', ['load', '-w', filePath]));
    }

    return {
      platform: 'darwin',
      manager: 'launchd',
      filePath,
      actions,
    };
  }

  if (process.platform === 'linux') {
    const home = process.env.HOME || '';
    if (!home) {
      throw new Error('Cannot resolve HOME directory for systemd user install.');
    }

    const userDir = path.join(home, '.config', 'systemd', 'user');
    const filePath = path.join(userDir, 'chippy-watchdog.service');
    await fs.mkdir(userDir, { recursive: true });

    const workspaceCsv = workspaceIds.join(',');
    const lines = [
      '[Unit]',
      'Description=Chippy Gateway Watchdog Service',
      'After=network-online.target',
      '',
      '[Service]',
      'Type=simple',
      `WorkingDirectory=${ROOT_DIR}`,
      `ExecStart=${process.execPath} ${path.join(ROOT_DIR, 'scripts', 'chippy-watchdog.js')}`,
      'Restart=always',
      'RestartSec=5',
      `Environment=CHIPPY_WATCHDOG_RUN_DIR=${WATCHDOG_RUN_DIR}`,
    ];
    if (workspaceCsv) {
      lines.push(`Environment=CHIPPY_GATEWAY_WORKSPACES=${workspaceCsv}`);
    }
    if (Number.isInteger(intervalSeconds) && intervalSeconds > 0) {
      lines.push(`Environment=CHIPPY_WATCHDOG_INTERVAL_SECONDS=${intervalSeconds}`);
    }
    if (Number.isInteger(backupIntervalMinutes) && backupIntervalMinutes >= 0) {
      lines.push(`Environment=CHIPPY_WATCHDOG_BACKUP_INTERVAL_MINUTES=${backupIntervalMinutes}`);
    }
    lines.push('', '[Install]', 'WantedBy=default.target', '');

    await fs.writeFile(filePath, lines.join('\n'), 'utf8');

    const actions = [
      runCommandSync('systemctl', ['--user', 'daemon-reload']),
      runCommandSync('systemctl', ['--user', 'enable', '--now', 'chippy-watchdog.service']),
    ];

    return {
      platform: 'linux',
      manager: 'systemd-user',
      filePath,
      actions,
    };
  }

  throw new Error(`Unsupported platform for install: ${process.platform}`);
}

async function uninstallWatchdogService() {
  if (process.platform === 'darwin') {
    const home = process.env.HOME || '';
    const filePath = path.join(home, 'Library', 'LaunchAgents', 'com.chippy.watchdog.plist');
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    const domain = uid !== null ? `gui/${uid}` : null;
    const actions = [];

    if (domain) {
      actions.push(runCommandSync('launchctl', ['bootout', domain, 'com.chippy.watchdog']));
      actions.push(runCommandSync('launchctl', ['disable', `${domain}/com.chippy.watchdog`]));
    } else {
      actions.push(runCommandSync('launchctl', ['unload', '-w', filePath]));
    }

    await fs.rm(filePath, { force: true });
    return {
      platform: 'darwin',
      manager: 'launchd',
      filePath,
      actions,
    };
  }

  if (process.platform === 'linux') {
    const home = process.env.HOME || '';
    const filePath = path.join(home, '.config', 'systemd', 'user', 'chippy-watchdog.service');
    const actions = [
      runCommandSync('systemctl', ['--user', 'disable', '--now', 'chippy-watchdog.service']),
      runCommandSync('systemctl', ['--user', 'daemon-reload']),
    ];
    await fs.rm(filePath, { force: true });
    return {
      platform: 'linux',
      manager: 'systemd-user',
      filePath,
      actions,
    };
  }

  throw new Error(`Unsupported platform for uninstall: ${process.platform}`);
}

function summarizeServiceActions(actions = []) {
  return actions.map((action) => ({
    command: action.command,
    ok: action.ok,
    status: action.status,
    stderr: action.stderr || null,
  }));
}

function createRuntimeFromFlags(flags, options = {}) {
  const storageBackend = normalizeStorageBackend(flags['storage-backend']);
  const maxWriteActions = parsePositiveInt(flags['max-write-actions'], '--max-write-actions', 3);
  const allowedToolScopes = parseAllowedScopes(flags['allowed-scopes']);
  const quietHours = parseQuietHours(flags['quiet-hours']);
  if (typeof flags.timezone === 'string' && flags.timezone.trim()) {
    quietHours.timezone = flags.timezone.trim();
  }
  return createDefaultAgentRuntime({
    limits: {
      maxAgents: Number(flags['max-agents'] || 5),
      maxSteps: Number(flags['max-steps'] || 12),
      minReviewScore: Number(flags['min-review-score'] || 0.65),
    },
    policy: {
      approvalMode: normalizeApprovalMode(flags['approval-mode']),
      fallbackMode: flags['no-fallback'] ? 'strict' : 'permissive',
      maxToolCallsPerRun: parsePositiveInt(flags['max-tool-calls'], '--max-tool-calls', 12),
      maxWriteActionsPerRun: maxWriteActions,
      allowedToolScopes,
      quietHours,
    },
    storageBackend,
    dbPath: typeof flags['db-path'] === 'string' ? flags['db-path'] : undefined,
    onEvent: options.enableEventLog ? eventLogger : undefined,
  });
}

async function run() {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);

  if (positionals.length === 0 || flags.help || flags.h) {
    printHelp();
    return;
  }

  const [entity, action] = positionals;

  if (entity === 'provider' && action === 'list') {
    const registry = createDefaultProviderRegistry();
    const providers = registry.list();

    if (flags.json) {
      console.log(JSON.stringify(providers, null, 2));
      return;
    }

    printProviderTable(providers);
    return;
  }

  if (entity === 'tool' && action === 'list') {
    const toolRegistry = createDefaultToolRegistry();
    const tools = toolRegistry.list();

    if (flags.json) {
      console.log(JSON.stringify(tools, null, 2));
      return;
    }

    printToolTable(tools);
    return;
  }

  if (entity === 'tool' && action === 'exec') {
    const toolName = typeof flags.name === 'string'
      ? flags.name.trim()
      : (typeof positionals[2] === 'string' ? positionals[2].trim() : '');
    if (!toolName) {
      console.error('Missing tool name. Usage: chippy tool exec <tool-name> --input \'{"key":"value"}\'');
      process.exitCode = 1;
      return;
    }

    let inputPayload = {};
    if (typeof flags['input-file'] === 'string') {
      const raw = await fs.readFile(flags['input-file'], 'utf8');
      inputPayload = parseJsonFlag(raw, '--input-file', {});
    } else {
      inputPayload = parseJsonFlag(flags.input, '--input', {});
    }

    const rawContext = parseJsonFlag(flags.context, '--context', {});
    if (rawContext === null || typeof rawContext !== 'object' || Array.isArray(rawContext)) {
      throw new Error('Invalid --context: expected a JSON object.');
    }

    const runtime = createRuntimeFromFlags(flags, { enableEventLog: false });
    const tool = runtime.toolRegistry.get(toolName);
    if (!tool) {
      console.error(`Unknown tool: ${toolName}`);
      process.exitCode = 1;
      return;
    }

    const context = {
      ...rawContext,
      ...(typeof flags['user-id'] === 'string' ? { userId: flags['user-id'] } : {}),
      ...(typeof flags['tenant-id'] === 'string' ? { tenantId: flags['tenant-id'] } : {}),
      ...(typeof flags['api-base-url'] === 'string' ? { apiBaseUrl: flags['api-base-url'] } : {}),
      ...(typeof flags.timezone === 'string' ? { timezone: flags.timezone } : {}),
    };

    const dryRun = !Boolean(flags.execute);
    const execution = await runtime.toolRegistry.execute(toolName, {
      input: inputPayload,
      context,
      dryRun,
    });

    if (flags.json) {
      console.log(JSON.stringify(execution, null, 2));
      return;
    }

    console.log(`Tool: ${execution.tool}`);
    console.log(`Side effect: ${execution.sideEffect}`);
    console.log(`Mode: ${dryRun ? 'dry-run' : 'execute'}`);
    console.log(`Idempotency key: ${execution.idempotencyKey}`);
    console.log('\nResult:');
    console.log(JSON.stringify(execution.result, null, 2));
    return;
  }

  if (entity === 'gateway' && action === 'start') {
    const workspaceIds = parseWorkspaceIds(flags);
    const relinkWorkspaceIds = flags.relink ? workspaceIds : [];
    const started = await startGatewayDaemon({ workspaceIds, relinkWorkspaceIds });

    if (flags.json) {
      console.log(JSON.stringify(started, null, 2));
      return;
    }

    if (started.alreadyRunning) {
      console.log(`Gateway already running (pid=${started.pid}).`);
    } else {
      console.log(`Gateway started (pid=${started.pid}).`);
    }
    printGatewayStatus(started.summary);
    return;
  }

  if (entity === 'gateway' && action === 'status') {
    const summary = await getGatewayStatusSummary();
    if (flags.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    printGatewayStatus(summary);
    return;
  }

  if (entity === 'gateway' && action === 'stop') {
    const stopped = await stopGatewayDaemon();
    if (flags.json) {
      console.log(JSON.stringify(stopped, null, 2));
      return;
    }
    if (stopped.stopped) {
      console.log(`Gateway stopped (pid=${stopped.pid}).`);
    } else {
      console.log('Gateway already stopped.');
    }
    printGatewayStatus(stopped.summary);
    return;
  }

  if (entity === 'gateway' && action === 'restart') {
    const workspaceIds = parseWorkspaceIds(flags);
    await stopGatewayDaemon();
    const relinkWorkspaceIds = flags.relink ? workspaceIds : [];
    const started = await startGatewayDaemon({ workspaceIds, relinkWorkspaceIds });
    if (flags.json) {
      console.log(JSON.stringify(started, null, 2));
      return;
    }
    console.log(`Gateway restarted (pid=${started.pid}).`);
    printGatewayStatus(started.summary);
    return;
  }

  if (entity === 'gateway' && action === 'install') {
    const workspaceIds = parseWorkspaceIds(flags);
    const installResult = await installGatewayService({ workspaceIds });
    const summary = await getGatewayStatusSummary();

    if (flags.json) {
      console.log(JSON.stringify({
        installResult,
        summary,
      }, null, 2));
      return;
    }

    console.log(`Gateway service installed via ${installResult.manager}.`);
    console.log(`Service file: ${installResult.filePath}`);
    const actions = summarizeServiceActions(installResult.actions);
    for (const item of actions) {
      console.log(`- ${item.ok ? 'ok' : 'failed'}: ${item.command}${item.stderr ? ` (${item.stderr})` : ''}`);
    }
    printGatewayStatus(summary);
    return;
  }

  if (entity === 'gateway' && action === 'uninstall') {
    const uninstallResult = await uninstallGatewayService();
    const summary = await getGatewayStatusSummary();

    if (flags.json) {
      console.log(JSON.stringify({
        uninstallResult,
        summary,
      }, null, 2));
      return;
    }

    console.log(`Gateway service removed from ${uninstallResult.manager}.`);
    console.log(`Service file: ${uninstallResult.filePath}`);
    const actions = summarizeServiceActions(uninstallResult.actions);
    for (const item of actions) {
      console.log(`- ${item.ok ? 'ok' : 'failed'}: ${item.command}${item.stderr ? ` (${item.stderr})` : ''}`);
    }
    printGatewayStatus(summary);
    return;
  }

  if (entity === 'gateway' && action === 'doctor') {
    const workspaceIds = parseWorkspaceIds(flags);
    const report = await runSystemDoctor({ workspaceIds });
    if (flags.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    printDoctorReport(report);
    return;
  }

  if (entity === 'gateway' && action === 'rotate-logs') {
    const workspaceIds = parseWorkspaceIds(flags);
    const maxBytes = parsePositiveInt(flags['max-bytes'], '--max-bytes', 5 * 1024 * 1024);
    const keep = parsePositiveInt(flags.keep, '--keep', 5);
    const result = await rotateRuntimeLogs({
      workspaceIds,
      maxBytes,
      keep,
    });

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const rotatedCount = (result.files || []).filter((item) => item.rotated).length;
    console.log(`Rotated logs: ${rotatedCount}/${(result.files || []).length}`);
    for (const item of result.files || []) {
      if (!item.rotated) continue;
      console.log(`- rotated ${item.filePath} (${item.sizeBytes} bytes)`);
    }
    return;
  }

  if (entity === 'watchdog' && action === 'start') {
    const workspaceIds = parseWorkspaceIds(flags);
    const intervalSeconds = flags['interval-seconds'] !== undefined
      ? parsePositiveInt(flags['interval-seconds'], '--interval-seconds', 60)
      : undefined;
    let backupIntervalMinutes;
    if (flags['backup-interval-minutes'] !== undefined) {
      const parsed = Number(flags['backup-interval-minutes']);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid --backup-interval-minutes: ${flags['backup-interval-minutes']}. Must be integer >= 0.`);
      }
      backupIntervalMinutes = parsed;
    }

    const started = await startWatchdogDaemon({
      workspaceIds,
      intervalSeconds,
      backupIntervalMinutes,
    });

    if (flags.json) {
      console.log(JSON.stringify(started, null, 2));
      return;
    }

    if (started.alreadyRunning) {
      console.log(`Watchdog already running (pid=${started.pid}).`);
    } else {
      console.log(`Watchdog started (pid=${started.pid}).`);
    }
    printWatchdogStatus(started.summary);
    return;
  }

  if (entity === 'watchdog' && action === 'status') {
    const summary = await getWatchdogStatusSummary();
    if (flags.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    printWatchdogStatus(summary);
    return;
  }

  if (entity === 'watchdog' && action === 'stop') {
    const stopped = await stopWatchdogDaemon();
    if (flags.json) {
      console.log(JSON.stringify(stopped, null, 2));
      return;
    }
    if (stopped.stopped) {
      console.log(`Watchdog stopped (pid=${stopped.pid}).`);
    } else {
      console.log('Watchdog already stopped.');
    }
    printWatchdogStatus(stopped.summary);
    return;
  }

  if (entity === 'watchdog' && action === 'restart') {
    const workspaceIds = parseWorkspaceIds(flags);
    const intervalSeconds = flags['interval-seconds'] !== undefined
      ? parsePositiveInt(flags['interval-seconds'], '--interval-seconds', 60)
      : undefined;
    let backupIntervalMinutes;
    if (flags['backup-interval-minutes'] !== undefined) {
      const parsed = Number(flags['backup-interval-minutes']);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid --backup-interval-minutes: ${flags['backup-interval-minutes']}. Must be integer >= 0.`);
      }
      backupIntervalMinutes = parsed;
    }

    await stopWatchdogDaemon();
    const started = await startWatchdogDaemon({
      workspaceIds,
      intervalSeconds,
      backupIntervalMinutes,
    });
    if (flags.json) {
      console.log(JSON.stringify(started, null, 2));
      return;
    }
    console.log(`Watchdog restarted (pid=${started.pid}).`);
    printWatchdogStatus(started.summary);
    return;
  }

  if (entity === 'watchdog' && action === 'install') {
    const workspaceIds = parseWorkspaceIds(flags);
    const intervalSeconds = flags['interval-seconds'] !== undefined
      ? parsePositiveInt(flags['interval-seconds'], '--interval-seconds', 60)
      : undefined;
    let backupIntervalMinutes;
    if (flags['backup-interval-minutes'] !== undefined) {
      const parsed = Number(flags['backup-interval-minutes']);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid --backup-interval-minutes: ${flags['backup-interval-minutes']}. Must be integer >= 0.`);
      }
      backupIntervalMinutes = parsed;
    }

    const installResult = await installWatchdogService({
      workspaceIds,
      intervalSeconds,
      backupIntervalMinutes,
    });
    const summary = await getWatchdogStatusSummary();

    if (flags.json) {
      console.log(JSON.stringify({
        installResult,
        summary,
      }, null, 2));
      return;
    }

    console.log(`Watchdog service installed via ${installResult.manager}.`);
    console.log(`Service file: ${installResult.filePath}`);
    const actions = summarizeServiceActions(installResult.actions);
    for (const item of actions) {
      console.log(`- ${item.ok ? 'ok' : 'failed'}: ${item.command}${item.stderr ? ` (${item.stderr})` : ''}`);
    }
    printWatchdogStatus(summary);
    return;
  }

  if (entity === 'watchdog' && action === 'uninstall') {
    const uninstallResult = await uninstallWatchdogService();
    const summary = await getWatchdogStatusSummary();

    if (flags.json) {
      console.log(JSON.stringify({
        uninstallResult,
        summary,
      }, null, 2));
      return;
    }

    console.log(`Watchdog service removed from ${uninstallResult.manager}.`);
    console.log(`Service file: ${uninstallResult.filePath}`);
    const actions = summarizeServiceActions(uninstallResult.actions);
    for (const item of actions) {
      console.log(`- ${item.ok ? 'ok' : 'failed'}: ${item.command}${item.stderr ? ` (${item.stderr})` : ''}`);
    }
    printWatchdogStatus(summary);
    return;
  }

  if (entity === 'backup' && action === 'create') {
    const workspaceIds = parseWorkspaceIds(flags);
    const label = typeof flags.label === 'string' ? flags.label : '';
    const result = await createBackupSnapshot({
      workspaceIds,
      label,
    });

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Backup created: ${result.id}`);
    console.log(`Path: ${result.path}`);
    console.log(`Created: ${result.createdAt}`);
    if (Array.isArray(result.cleanup?.removed) && result.cleanup.removed.length > 0) {
      console.log(`Pruned backups: ${result.cleanup.removed.join(', ')}`);
    }
    return;
  }

  if (entity === 'backup' && action === 'list') {
    const limit = parsePositiveInt(flags.limit, '--limit', 20);
    const list = await listBackupSnapshots({ limit });

    if (flags.json) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }

    if (!list.length) {
      console.log(`No backups found in ${BACKUP_BASE_DIR}`);
      return;
    }
    printBackupTable(list);
    return;
  }

  if (entity === 'backup' && action === 'restore') {
    const backupId = typeof flags.id === 'string'
      ? flags.id
      : (typeof positionals[2] === 'string' ? positionals[2] : '');
    if (!backupId) {
      console.error('Missing backup id. Use --id <backup-id> or `chippy backup restore <id>`.');
      process.exitCode = 1;
      return;
    }

    const result = await restoreBackupSnapshot({
      backupId,
      force: Boolean(flags.force),
    });

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Backup restored: ${result.id}`);
    console.log(`Restored at: ${result.restoredAt}`);
    console.log(`Paths restored: ${Array.isArray(result.restored) ? result.restored.length : 0}`);
    return;
  }

  if (entity === 'channels' && action === 'login') {
    resolveChannel(positionals, flags);
    const workspaceId = resolveWorkspaceId(flags);
    const relink = Boolean(flags.relink || flags['reset-auth']);
    await readLinkedWhatsappState(workspaceId);
    const startResult = await startLinkedWhatsappGatewayCli({
      workspaceId,
      forceQr: true,
      resetAuth: relink,
    });
    const summary = await getLinkedGatewaySummaryCli(workspaceId);

    if (flags.json) {
      console.log(JSON.stringify({
        ...summary,
        managedByGateway: startResult?.managedByGateway === true,
        gatewayPid: startResult?.gatewayPid || null,
      }, null, 2));
      return;
    }

    if (startResult?.managedByGateway) {
      console.log(`Gateway daemon is managing WhatsApp workers (pid=${startResult.gatewayPid}).`);
      console.log('Use `chippy gateway restart --workspace-id <id>` to relink channels.');
      printChannelStatus(summary);
      return;
    }

    console.log(relink ? 'WhatsApp relink started.' : 'WhatsApp channel login started.');
    printChannelStatus(summary);
    if (summary?.gateway?.qrPngPath) {
      console.log('\nScan QR in WhatsApp: Settings -> Linked Devices -> Link a Device.');
    } else {
      console.log('\nQR not generated yet. Re-run `chippy channels status --channel whatsapp` in a few seconds.');
    }
    return;
  }

  if (entity === 'channels' && action === 'status') {
    resolveChannel(positionals, flags);
    const workspaceId = resolveWorkspaceId(flags);
    const summary = await getLinkedGatewaySummaryCli(workspaceId);

    if (flags.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    printChannelStatus(summary);
    if (summary.pendingPairings.length > 0) {
      console.log('\nPending pairing requests:');
      printPairingTable(summary.pendingPairings);
    }
    return;
  }

  if (entity === 'channels' && action === 'stop') {
    resolveChannel(positionals, flags);
    const workspaceId = resolveWorkspaceId(flags);
    const stopped = await stopLinkedWhatsappGatewayCli({ workspaceId });
    const summary = await getLinkedGatewaySummaryCli(workspaceId);

    if (flags.json) {
      console.log(JSON.stringify({
        stopped,
        summary,
      }, null, 2));
      return;
    }

    if (stopped.managedByGateway) {
      console.log(`Gateway daemon is managing WhatsApp workers (pid=${stopped.gatewayPid}).`);
      console.log('Use `chippy gateway stop` to stop all managed channels.');
      printChannelStatus(summary);
      return;
    }

    console.log(stopped.stopped ? `Stopped WhatsApp gateway pid ${stopped.pid}.` : 'WhatsApp gateway already stopped.');
    printChannelStatus(summary);
    return;
  }

  if (entity === 'pairing' && action === 'list') {
    resolveChannel(positionals, flags);
    const workspaceId = resolveWorkspaceId(flags);
    const list = await listLinkedPendingPairings(workspaceId);

    if (flags.json) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }

    if (!list.length) {
      console.log('No pending pairing requests.');
      return;
    }
    printPairingTable(list);
    return;
  }

  if (entity === 'pairing' && (action === 'approve' || action === 'deny')) {
    resolveChannel(positionals, flags);
    const workspaceId = resolveWorkspaceId(flags);
    const pairingCode = typeof positionals[3] === 'string' ? positionals[3] : (typeof flags.code === 'string' ? flags.code : '');
    if (!pairingCode) {
      console.error(`Missing pairing code. Usage: chippy pairing ${action} whatsapp <CODE>`);
      process.exitCode = 1;
      return;
    }

    if (action === 'approve') {
      const approved = await approveLinkedPairingCli({
        workspaceId,
        code: pairingCode,
        approvedBy: typeof flags['decided-by'] === 'string' ? flags['decided-by'] : 'cli',
      });
      const summary = await getLinkedGatewaySummaryCli(workspaceId);
      if (flags.json) {
        console.log(JSON.stringify({
          approved,
          summary,
        }, null, 2));
        return;
      }
      console.log(`Approved ${approved.code} for ${approved.phone}.`);
      printChannelStatus(summary);
      return;
    }

    await denyLinkedPairingCli({
      workspaceId,
      code: pairingCode,
      decidedBy: typeof flags['decided-by'] === 'string' ? flags['decided-by'] : 'cli',
    });
    const summary = await getLinkedGatewaySummaryCli(workspaceId);
    if (flags.json) {
      console.log(JSON.stringify({
        denied: formatPairingCode(pairingCode),
        summary,
      }, null, 2));
      return;
    }
    console.log(`Denied ${formatPairingCode(pairingCode)}.`);
    printChannelStatus(summary);
    return;
  }

  if (entity === 'whatsapp' && action === 'send') {
    const to = typeof flags.to === 'string'
      ? flags.to
      : (typeof positionals[2] === 'string' ? positionals[2] : '');
    const messageFromFlag = typeof flags.message === 'string' ? flags.message.trim() : '';
    const messageFromPositionals = positionals.slice(3).join(' ').trim();
    const message = messageFromFlag || messageFromPositionals;
    const preferLinked = flags.linked === true || String(flags.via || '').trim().toLowerCase() === 'linked';

    if (!to) {
      console.error('Missing --to phone number.');
      process.exitCode = 1;
      return;
    }
    if (!message) {
      console.error('Missing --message text.');
      process.exitCode = 1;
      return;
    }

    const useLinkedQueue = preferLinked || !hasTwilioWhatsAppConfig();
    const result = useLinkedQueue
      ? await enqueueLinkedWhatsappMessage({
          workspaceId: resolveWorkspaceId(flags),
          to,
          message,
        })
      : await sendWhatsAppMessage({ to, message });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (useLinkedQueue) {
      console.log('WhatsApp linked message queued.');
      console.log(`Workspace: ${result.workspaceId}`);
      console.log(`Message ID: ${result.id}`);
      console.log(`To: ${result.to || normalizeWhatsAppAddress(to)}`);
      console.log(`Queue file: ${result.queueFile}`);
      return;
    }

    console.log('WhatsApp message queued.');
    console.log(`SID: ${result.sid || 'n/a'}`);
    console.log(`Status: ${result.status || 'accepted'}`);
    console.log(`To: ${result.to || normalizeWhatsAppAddress(to)}`);
    return;
  }

  if (entity === 'action' && action === 'list') {
    const runtime = createRuntimeFromFlags(flags, { enableEventLog: false });
    const status = typeof flags.status === 'string' ? flags.status : 'pending_review';
    const runId = typeof flags['run-id'] === 'string' ? flags['run-id'] : undefined;
    const workspaceId = typeof flags['tenant-id'] === 'string'
      ? flags['tenant-id']
      : (typeof flags['user-id'] === 'string' ? flags['user-id'] : undefined);
    const limit = parsePositiveInt(flags.limit, '--limit', 50);

    const actions = await runtime.runStore.listActions({
      status,
      runId,
      workspaceId,
      limit,
    });

    if (flags.json) {
      console.log(JSON.stringify(actions, null, 2));
      return;
    }

    if (!actions.length) {
      console.log('No actions found.');
      return;
    }

    printActionTable(actions);
    return;
  }

  if (entity === 'action' && action === 'process') {
    const actionId = typeof flags['action-id'] === 'string' ? flags['action-id'].trim() : '';
    if (!actionId) {
      console.error('Missing --action-id');
      process.exitCode = 1;
      return;
    }

    const decision = normalizeDecision(flags.decision);
    const decidedBy = typeof flags['decided-by'] === 'string' ? flags['decided-by'] : 'cli';
    const runtime = createRuntimeFromFlags(flags, { enableEventLog: false });

    const existing = await runtime.runStore.getAction(actionId);
    if (!existing) {
      console.error(`Action not found: ${actionId}`);
      process.exitCode = 1;
      return;
    }

    const decided = await runtime.runStore.decideAction({
      actionId,
      decision,
      decidedBy,
    });

    if (decided.status === 'executed') {
      const response = {
        action: decided,
        runId: decided.runId,
        toolCallId: decided.toolCallId,
        status: 'already_executed',
      };
      if (flags.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        console.log(`Action ${decided.id} already executed.`);
      }
      return;
    }

    if (decision === 'deny') {
      await runtime.runStore.patchRunToolCall({
        runId: decided.runId,
        toolCallId: decided.toolCallId,
        patch: {
          status: 'denied',
          error: `Action denied by ${decidedBy}`,
          endedAt: nowIso(),
        },
      });

      const deniedResponse = {
        action: decided,
        runId: decided.runId,
        toolCallId: decided.toolCallId,
        status: 'denied',
      };

      if (flags.json) {
        console.log(JSON.stringify(deniedResponse, null, 2));
      } else {
        console.log(`Action ${decided.id} denied.`);
        console.log(`Run: ${decided.runId}`);
        console.log(`Tool call: ${decided.toolCallId}`);
      }
      return;
    }

    if (decided.status !== 'approved') {
      if (flags.json) {
        console.log(JSON.stringify({
          action: decided,
          runId: decided.runId,
          toolCallId: decided.toolCallId,
          status: 'not_executable',
          reason: `Action status is ${decided.status}`,
        }, null, 2));
      } else {
        console.error(`Action ${decided.id} is not executable from status "${decided.status}".`);
      }
      process.exitCode = 1;
      return;
    }

    try {
      const claimed = await runtime.runStore.claimActionExecution({
        actionId,
        claimedBy: decidedBy,
      });

      if (claimed.status === 'executed') {
        const response = {
          action: claimed,
          runId: claimed.runId,
          toolCallId: claimed.toolCallId,
          status: 'already_executed',
        };
        if (flags.json) {
          console.log(JSON.stringify(response, null, 2));
        } else {
          console.log(`Action ${claimed.id} already executed.`);
        }
        return;
      }

      if (claimed.status !== 'executing') {
        throw new Error(`Failed to claim action for execution (status=${claimed.status}).`);
      }

      const execution = await runtime.toolRegistry.execute(claimed.toolName, {
        input: claimed.input || {},
        context: claimed.context || {},
        dryRun: false,
      });

      const executedAction = await runtime.runStore.finalizeActionExecution({
        actionId,
        executionStatus: 'executed',
        result: execution.result,
      });

      const patchedRun = await runtime.runStore.patchRunToolCall({
        runId: decided.runId,
        toolCallId: decided.toolCallId,
        patch: {
          status: 'completed',
          dryRun: false,
          result: execution.result,
          idempotencyKey: execution.idempotencyKey,
          attempts: 1,
          error: null,
          endedAt: nowIso(),
        },
      });

      const response = {
        action: executedAction,
        runId: decided.runId,
        toolCallId: decided.toolCallId,
        runStatus: patchedRun.status,
        status: 'executed',
      };

      if (flags.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        console.log(`Action ${executedAction.id} executed.`);
        console.log(`Run: ${decided.runId}`);
        console.log(`Tool call: ${decided.toolCallId}`);
      }
      return;
    } catch (error) {
      const failedAction = await runtime.runStore.finalizeActionExecution({
        actionId,
        executionStatus: 'failed',
        error: error.message,
      });

      await runtime.runStore.patchRunToolCall({
        runId: decided.runId,
        toolCallId: decided.toolCallId,
        patch: {
          status: 'failed',
          dryRun: false,
          error: error.message || 'Action execution failed',
          endedAt: nowIso(),
        },
      });

      if (flags.json) {
        console.log(JSON.stringify({
          action: failedAction,
          runId: decided.runId,
          toolCallId: decided.toolCallId,
          status: 'failed',
          error: error.message || 'Action execution failed',
        }, null, 2));
      } else {
        console.error(`Action ${actionId} failed: ${error.message || error}`);
      }
      process.exitCode = 1;
      return;
    }
  }

  if (entity === 'email' && action === 'process') {
    let fixture = null;
    if (typeof flags.fixture === 'string') {
      const raw = await fs.readFile(flags.fixture, 'utf8');
      fixture = JSON.parse(raw);
    }

    const runtime = createRuntimeFromFlags(flags, {
      enableEventLog: !flags.json,
    });
    const iterativeExecutor = parseOptionalBooleanFlag(flags['iterative-executor'], '--iterative-executor');
    const iterativeMaxSteps = flags['iterative-max-steps'] !== undefined
      ? parsePositiveInt(flags['iterative-max-steps'], '--iterative-max-steps', 4)
      : undefined;

    const limit = parsePositiveInt(flags.limit || flags['email-limit'], '--limit', 3);
    const result = await runtime.run({
      goal: typeof flags.goal === 'string' ? flags.goal : 'Manage customer email inbox and reply',
      providerId: typeof flags.provider === 'string' ? flags.provider : 'local.heuristic',
      model: typeof flags.model === 'string' ? flags.model : undefined,
      apiKey: typeof flags['api-key'] === 'string' ? flags['api-key'] : undefined,
      baseUrl: typeof flags['base-url'] === 'string' ? flags['base-url'] : undefined,
      noFallback: Boolean(flags['no-fallback']),
      executeWrites: Boolean(flags['execute-write']),
      iterativeExecutor,
      iterativeMaxSteps,
      context: {
        source: 'cli-email-process',
        fixture,
        emailLimit: limit,
        emailSource: typeof flags['email-source'] === 'string' ? flags['email-source'] : undefined,
        emailTransport: typeof flags['email-transport'] === 'string' ? flags['email-transport'] : undefined,
        companyName: typeof flags['company-name'] === 'string' ? flags['company-name'] : undefined,
        ownerEmail: typeof flags['owner-email'] === 'string' ? flags['owner-email'] : undefined,
        timezone: typeof flags.timezone === 'string' ? flags.timezone : undefined,
        userId: typeof flags['user-id'] === 'string' ? flags['user-id'] : undefined,
        tenantId: typeof flags['tenant-id'] === 'string' ? flags['tenant-id'] : undefined,
        ...(iterativeExecutor !== undefined ? { enableIterativeExecutor: iterativeExecutor } : {}),
        ...(iterativeMaxSteps !== undefined ? { iterativeMaxSteps } : {}),
      },
    });

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`\nRun ID: ${result.id}`);
    console.log(`Status: ${result.status}`);
    console.log(`Provider: ${result.provider.id} (${result.provider.model || 'n/a'})`);

    const toolCalls = Array.isArray(result?.tooling?.toolCalls) ? result.tooling.toolCalls : [];
    const inboxCall = toolCalls.find((call) => call.name === 'email.inbox_list');
    const replyCalls = toolCalls.filter((call) => call.name === 'email.reply_send');
    console.log(`Inbox messages seen: ${Array.isArray(inboxCall?.result?.messages) ? inboxCall.result.messages.length : 0}`);
    console.log(`Replies attempted: ${replyCalls.length}`);
    if (replyCalls.some((call) => call.status === 'pending_review')) {
      console.log('Some replies are pending review. Use `chippy action list` and `chippy action process`.');
    }

    console.log(`\nAudit file: ${result.recordPath || 'not saved'}`);
    return;
  }

  if (entity === 'agent' && action === 'run') {
    const goalFromFlag = typeof flags.goal === 'string' ? flags.goal.trim() : '';
    const trailingGoal = positionals.slice(2).join(' ').trim();
    const goal = goalFromFlag || trailingGoal;

    if (!goal) {
      console.error('Missing goal. Use --goal "..."');
      process.exitCode = 1;
      return;
    }

    let fixture = null;
    if (typeof flags.fixture === 'string') {
      const raw = await fs.readFile(flags.fixture, 'utf8');
      fixture = JSON.parse(raw);
    }

    const runtime = createRuntimeFromFlags(flags, {
      enableEventLog: !flags.json,
    });
    const iterativeExecutor = parseOptionalBooleanFlag(flags['iterative-executor'], '--iterative-executor');
    const iterativeMaxSteps = flags['iterative-max-steps'] !== undefined
      ? parsePositiveInt(flags['iterative-max-steps'], '--iterative-max-steps', 4)
      : undefined;

    const result = await runtime.run({
      goal,
      providerId: typeof flags.provider === 'string' ? flags.provider : 'gemini.flash',
      model: typeof flags.model === 'string' ? flags.model : undefined,
      apiKey: typeof flags['api-key'] === 'string' ? flags['api-key'] : undefined,
      baseUrl: typeof flags['base-url'] === 'string' ? flags['base-url'] : undefined,
      noFallback: Boolean(flags['no-fallback']),
      executeWrites: Boolean(flags['execute-write']),
      iterativeExecutor,
      iterativeMaxSteps,
      context: {
        source: 'cli',
        fixture,
        leadId: typeof flags['lead-id'] === 'string' ? flags['lead-id'] : undefined,
        leadEmail: typeof flags['lead-email'] === 'string' ? flags['lead-email'] : undefined,
        userId: typeof flags['user-id'] === 'string' ? flags['user-id'] : undefined,
        tenantId: typeof flags['tenant-id'] === 'string' ? flags['tenant-id'] : undefined,
        apiBaseUrl: typeof flags['api-base-url'] === 'string' ? flags['api-base-url'] : undefined,
        requestedDate: typeof flags['requested-date'] === 'string' ? flags['requested-date'] : undefined,
        emailLimit: Number.isInteger(Number(flags['email-limit'])) ? Number(flags['email-limit']) : undefined,
        timezone: typeof flags.timezone === 'string' ? flags.timezone : undefined,
        ...(iterativeExecutor !== undefined ? { enableIterativeExecutor: iterativeExecutor } : {}),
        ...(iterativeMaxSteps !== undefined ? { iterativeMaxSteps } : {}),
      },
    });

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`\nRun ID: ${result.id}`);
    console.log(`Status: ${result.status}`);
    console.log(`Provider: ${result.provider.id} (${result.provider.model || 'n/a'})`);
    console.log(`Steps used: ${result.stepsUsed}`);
    console.log(`\nPlan:`);
    result.plan.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.title} [${task.agentRole}]`);
    });

    console.log(`\nReviewer:`);
    console.log(`  status=${result.review.status} score=${result.review.score}`);

    if (Array.isArray(result.verification.findings) && result.verification.findings.length > 0) {
      console.log('  findings:');
      result.verification.findings.forEach((finding) => console.log(`   - ${finding}`));
    }

    console.log(`\nAudit file: ${result.recordPath || 'not saved'}`);
    return;
  }

  printHelp();
  process.exitCode = 1;
}

run().catch((error) => {
  console.error('CLI error:', error.message || error);
  process.exitCode = 1;
});
