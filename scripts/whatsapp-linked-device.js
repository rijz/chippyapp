#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { createDefaultAgentRuntime, createDefaultProviderRegistry } from '../agent-runtime/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_RUN_DIR = process.env.CHIPPY_AGENT_RUN_DIR || path.join(ROOT_DIR, '.runs', 'agent-runtime');
const DEFAULT_DB_PATH = process.env.CHIPPY_STORAGE_DB_PATH || path.join(DEFAULT_RUN_DIR, 'runtime.db');
const DEFAULT_AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || path.join(ROOT_DIR, '.runs', 'whatsapp-auth');
const DEFAULT_PAIRING_CODE_PATH = process.env.WHATSAPP_PAIRING_CODE_PATH || path.join(ROOT_DIR, '.runs', 'whatsapp-pairing-code.txt');
const DEFAULT_QR_TEXT_PATH = process.env.WHATSAPP_QR_TEXT_PATH || path.join(ROOT_DIR, '.runs', 'whatsapp-qr.txt');
const DEFAULT_QR_PNG_PATH = process.env.WHATSAPP_QR_PNG_PATH || path.join(ROOT_DIR, '.runs', 'whatsapp-qr.png');
const DEFAULT_GATEWAY_STATE_PATH = process.env.WHATSAPP_GATEWAY_STATE_PATH || path.join(ROOT_DIR, '.runs', 'whatsapp-gateway.json');
const DEFAULT_OUTBOX_ROOT_DIR = path.join(ROOT_DIR, '.runs', 'whatsapp-outbox');
const PAIRING_TTL_MS = 60 * 60 * 1000;
const PAIRING_PENDING_LIMIT = Math.max(
  1,
  Number.isFinite(Number(process.env.WHATSAPP_PAIRING_PENDING_LIMIT))
    ? Math.round(Number(process.env.WHATSAPP_PAIRING_PENDING_LIMIT))
    : 3
);
const RESET_AUTH_ONCE_ENV = '__CHIPPY_WHATSAPP_RESET_AUTH_ONCE';
let signalHandlersRegistered = false;

const OWNER_COMMANDS = new Set(['status', 'actions', 'approve', 'deny']);
const ACTION_INTENT_TOKENS = [
  'manage',
  'monitor',
  'automate',
  'integrate',
  'implement',
  'build',
  'create',
  'draft',
  'send',
  'workflow',
  'connect',
  'configure',
  'setup',
  'set up',
  'deploy',
  'execute',
  'approval',
];
const DIRECT_ANSWER_SYSTEM_PROMPT = [
  'You are Business Brain replying in WhatsApp.',
  'Answer the user directly in plain text, concise and useful.',
  'Do not output JSON.',
  'Do not output task lists, plans, deliverables, reviewer findings, implementation details, or workflow steps unless explicitly requested.',
  'For greetings, reply briefly and ask what they need.',
  'For simple factual or arithmetic questions, provide the answer first.',
  'For real-time data you cannot verify, state that clearly and ask a follow-up.',
].join(' ');

function printHelp() {
  console.log([
    'WhatsApp Linked Device Runner (Baileys)',
    '',
    'Usage:',
    '  npm run whatsapp:linked -- --workspace-id <workspace-uuid>',
    '  npm run whatsapp:linked -- --workspace-id <workspace-uuid> --pair-phone +14168370477',
    '  npm run whatsapp:linked -- --workspace-id <workspace-uuid> --send-to +14168370477 --message "Test ping" --exit-after-send',
    '',
    'Flags:',
    '  --workspace-id       Required workspace id (or set WHATSAPP_DEFAULT_WORKSPACE_ID)',
    '  --provider           Provider id override (default: gemini.flash)',
    '  --model              Optional model override',
    '  --execute-write      Enable live writes (default false)',
    '  --approval-mode      AUTO|REVIEW_REQUIRED|BLOCKED',
    '  --max-tool-calls     Max tool calls per run (default 10)',
    '  --max-write-actions  Max write actions per run (default 2)',
    '  --allowed-scopes     none,read,write',
    '  --storage-backend    auto|sqlite|supabase',
    '  --db-path            SQLite db path override',
    '  --auth-dir           Linked-device auth directory',
    '  --pair-phone         Pair by code for this phone number',
    '  --force-qr           Ignore pair-phone and force QR pairing mode',
    '  --reset-auth         Remove local WhatsApp auth session before startup',
    '  --send-to            Send startup message to number',
    '  --message            Startup message body',
    '  --exit-after-send    Exit process after sending startup message',
    '  --help               Show this help',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = [...argv];
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

function parseApprovalMode(raw) {
  const mode = String(raw || 'REVIEW_REQUIRED').toUpperCase();
  if (!['AUTO', 'REVIEW_REQUIRED', 'BLOCKED'].includes(mode)) {
    return 'REVIEW_REQUIRED';
  }
  return mode;
}

function parseAllowedScopes(raw) {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || 'none,read,write')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

  const allowed = values.filter((value) => ['none', 'read', 'write'].includes(value));
  if (allowed.length === 0) return ['none', 'read', 'write'];
  return Array.from(new Set(allowed));
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[^\d+]/g, '');
  if (!compact) return '';
  return compact.startsWith('+') ? compact : `+${compact}`;
}

function nowIso() {
  return new Date().toISOString();
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

function randomPairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function formatPairingCode(rawCode = '') {
  const code = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return '';
  return code.match(/.{1,4}/g)?.join('-') || code;
}

function parsePairingCode(rawCode = '') {
  return String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function readGatewayState(workspaceId, ownerNumbers = new Set()) {
  let parsed = null;
  try {
    const raw = await fs.readFile(DEFAULT_GATEWAY_STATE_PATH, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const ownerList = normalizeAllowFrom(Array.from(ownerNumbers || []));
  const baseState = parsed && typeof parsed === 'object' ? parsed : {};
  const policy = baseState.policy && typeof baseState.policy === 'object' ? baseState.policy : {};
  const dmPolicy = policy.dmPolicy === 'allowlist' ? 'allowlist' : 'pairing';
  const allowFrom = normalizeAllowFrom([...(policy.allowFrom || []), ...ownerList]);
  const pairings = Array.isArray(baseState.pairings) ? baseState.pairings : [];
  const now = Date.now();

  const cleanedPairings = pairings
    .map((item) => {
      const code = parsePairingCode(item?.code || '');
      const phone = normalizePhone(item?.phone || '');
      if (!code || !phone) return null;
      const requestedAt = String(item?.requestedAt || nowIso());
      const requestedMs = Number.isFinite(Date.parse(requestedAt)) ? Date.parse(requestedAt) : now;
      const expiresMs = requestedMs + PAIRING_TTL_MS;
      const isExpired = expiresMs <= now;
      return {
        code,
        phone,
        requestedAt: new Date(requestedMs).toISOString(),
        expiresAt: new Date(expiresMs).toISOString(),
        status: isExpired ? 'expired' : (item?.status === 'approved' ? 'approved' : 'pending'),
        approvedAt: item?.approvedAt ? String(item.approvedAt) : null,
        approvedBy: item?.approvedBy ? String(item.approvedBy) : null,
      };
    })
    .filter(Boolean);

  return {
    workspaceId,
    policy: {
      dmPolicy,
      allowFrom,
    },
    pairings: cleanedPairings,
    updatedAt: nowIso(),
  };
}

async function writeGatewayState(state) {
  await fs.mkdir(path.dirname(DEFAULT_GATEWAY_STATE_PATH), { recursive: true });
  await fs.writeFile(DEFAULT_GATEWAY_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function ensureGatewayState(workspaceId, ownerNumbers = new Set()) {
  const state = await readGatewayState(workspaceId, ownerNumbers);
  await writeGatewayState(state);
  return state;
}

async function upsertPairingRequest(workspaceId, phone, ownerNumbers = new Set()) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const state = await readGatewayState(workspaceId, ownerNumbers);
  const activePending = state.pairings
    .filter((item) => item.status === 'pending')
    .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));

  const existing = activePending.find((item) => item.phone === normalizedPhone);
  if (existing) {
    return {
      state,
      request: {
        ...existing,
        displayCode: formatPairingCode(existing.code),
      },
      created: false,
      reason: 'existing_pending',
    };
  }

  if (activePending.length >= PAIRING_PENDING_LIMIT) {
    return {
      state,
      request: null,
      reason: 'Pairing request limit reached. Ask owner to clear pending requests.',
    };
  }

  const rawCode = randomPairingCode();
  const now = Date.now();
  const request = {
    code: rawCode,
    phone: normalizedPhone,
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PAIRING_TTL_MS).toISOString(),
    status: 'pending',
    approvedAt: null,
    approvedBy: null,
  };
  state.pairings = [...state.pairings, request];
  state.updatedAt = nowIso();
  await writeGatewayState(state);

  return {
    state,
    request: {
      ...request,
      displayCode: formatPairingCode(rawCode),
    },
    created: true,
  };
}

function isAllowedSender(phone, state) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return false;
  const allowFrom = normalizeAllowFrom(state?.policy?.allowFrom || []);
  return allowFrom.includes(normalizedPhone);
}

function normalizePhoneDigits(value) {
  return normalizePhone(value).replace(/[^\d]/g, '');
}

function phoneToJid(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return '';
  return `${digits}@s.whatsapp.net`;
}

function jidToPhone(jid) {
  const left = String(jid || '').split('@')[0] || '';
  const digits = left.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
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

function parseCommand(text) {
  const normalized = String(text || '').trim();
  if (!normalized.startsWith('/')) return null;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const name = tokens[0].slice(1).toLowerCase();
  return {
    name,
    args: tokens.slice(1),
  };
}

async function persistPairingCode(rawCode) {
  const code = parsePairingCode(rawCode);
  if (!code) return;
  const formatted = formatPairingCode(code);
  const payload = [
    `code=${formatted}`,
    `updatedAt=${new Date().toISOString()}`,
  ].join('\n');

  await fs.mkdir(path.dirname(DEFAULT_PAIRING_CODE_PATH), { recursive: true });
  await fs.writeFile(DEFAULT_PAIRING_CODE_PATH, `${payload}\n`, 'utf8');
  console.log(`[whatsapp-linked] pairing code file: ${DEFAULT_PAIRING_CODE_PATH}`);
}

async function persistQrArtifacts(rawQr) {
  const qr = String(rawQr || '').trim();
  if (!qr) return;

  const textPayload = [
    `qr=${qr}`,
    `updatedAt=${new Date().toISOString()}`,
  ].join('\n');

  await fs.mkdir(path.dirname(DEFAULT_QR_TEXT_PATH), { recursive: true });
  await fs.writeFile(DEFAULT_QR_TEXT_PATH, `${textPayload}\n`, 'utf8');
  console.log(`[whatsapp-linked] qr text file: ${DEFAULT_QR_TEXT_PATH}`);

  try {
    await QRCode.toFile(DEFAULT_QR_PNG_PATH, qr, {
      margin: 1,
      width: 360,
      errorCorrectionLevel: 'M',
    });
    console.log(`[whatsapp-linked] qr image file: ${DEFAULT_QR_PNG_PATH}`);
  } catch (error) {
    console.warn('[whatsapp-linked] failed to write qr image file:', error?.message || error);
  }
}

async function clearPairingArtifacts() {
  await fs.rm(DEFAULT_PAIRING_CODE_PATH, { force: true });
  await fs.rm(DEFAULT_QR_TEXT_PATH, { force: true });
  await fs.rm(DEFAULT_QR_PNG_PATH, { force: true });
}

function resolveOutboxDir(workspaceId, flags = {}) {
  if (typeof flags['outbox-dir'] === 'string' && flags['outbox-dir'].trim()) {
    return flags['outbox-dir'].trim();
  }
  if (typeof process.env.WHATSAPP_OUTBOX_DIR === 'string' && process.env.WHATSAPP_OUTBOX_DIR.trim()) {
    return process.env.WHATSAPP_OUTBOX_DIR.trim();
  }
  return path.join(DEFAULT_OUTBOX_ROOT_DIR, sanitizeWorkspaceFileKey(workspaceId));
}

async function listOutboxFiles(outboxDir) {
  try {
    const entries = await fs.readdir(outboxDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function markInvalidOutboxFile(filePath) {
  const invalidPath = `${filePath}.invalid`;
  try {
    await fs.rename(filePath, invalidPath);
  } catch {
    await fs.rm(filePath, { force: true });
  }
}

async function flushOutboxQueue({ sock, outboxDir, maxPerFlush = 10 }) {
  const fileNames = await listOutboxFiles(outboxDir);
  if (fileNames.length === 0) return 0;

  let sentCount = 0;
  for (const fileName of fileNames.slice(0, Math.max(1, maxPerFlush))) {
    const filePath = path.join(outboxDir, fileName);

    let payload = null;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      payload = JSON.parse(raw);
    } catch {
      await markInvalidOutboxFile(filePath);
      continue;
    }

    const to = normalizePhone(payload?.to || '');
    const message = truncateText(payload?.message || '', 1400);
    const jid = phoneToJid(to);
    if (!jid || !message) {
      await markInvalidOutboxFile(filePath);
      continue;
    }

    await sock.sendMessage(jid, { text: message });
    await fs.rm(filePath, { force: true });
    sentCount += 1;
    console.log(`[whatsapp-linked] outbox sent: ${payload?.id || fileName} -> ${to}`);
  }

  return sentCount;
}

function truncateText(text, maxChars = 1400) {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function formatTimestamp(value) {
  if (!value) return 'n/a';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

function extractMessageText(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.conversation === 'string') return message.conversation;
  if (typeof message?.extendedTextMessage?.text === 'string') return message.extendedTextMessage.text;
  if (typeof message?.imageMessage?.caption === 'string') return message.imageMessage.caption;
  if (typeof message?.videoMessage?.caption === 'string') return message.videoMessage.caption;
  if (message?.ephemeralMessage?.message) return extractMessageText(message.ephemeralMessage.message);
  if (message?.viewOnceMessage?.message) return extractMessageText(message.viewOnceMessage.message);
  if (message?.viewOnceMessageV2?.message) return extractMessageText(message.viewOnceMessageV2.message);
  return '';
}

function extractJsonObjectFromText(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return null;

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ? fencedMatch[1].trim() : text;
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function normalizeDirectAnswer(raw = '') {
  const parsed = extractJsonObjectFromText(raw);
  if (parsed && typeof parsed === 'object') {
    const directKeys = ['answer', 'finalAnswer', 'response', 'message', 'result'];
    for (const key of directKeys) {
      if (typeof parsed[key] === 'string' && parsed[key].trim()) {
        return parsed[key].trim();
      }
    }
    if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
      return parsed.summary.trim();
    }
    if (Array.isArray(parsed.deliverables)) {
      const first = parsed.deliverables.find((item) => typeof item === 'string' && item.trim());
      if (first) {
        const normalized = String(first).trim().replace(/^[^:]{1,80}:\s*/, '');
        return normalized || String(first).trim();
      }
    }
  }

  const stripped = String(raw || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const lines = stripped
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^deliverables?:/i.test(line))
    .filter((line) => !/^reviewer findings?:/i.test(line))
    .filter((line) => !/^tasks?:/i.test(line));

  return lines.join('\n').trim();
}

function shouldUseDirectAnswerMode(rawText = '') {
  const text = String(rawText || '').trim();
  if (!text) return false;
  const lower = text.toLowerCase();

  const hasActionIntent = ACTION_INTENT_TOKENS.some((token) => lower.includes(token));
  const explicitWorkflow = /\b(deliverable|architecture|schema|phase|integration|api|workflow|runbook|plan)\b/.test(lower);
  const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(text);
  const asksIdentity = /\b(your name|who are you)\b/.test(lower);

  if (explicitWorkflow) return false;
  if (hasActionIntent) return false;
  if (isGreeting || asksIdentity) return true;
  return false;
}

async function generateDirectAnswer({
  runtime,
  providerId,
  model,
  text,
  timezone,
  companyName,
  workspaceId,
} = {}) {
  let provider = null;
  try {
    provider = await runtime.providerRegistry.create(providerId, { model });
  } catch {
    provider = await runtime.providerRegistry.create('local.heuristic', {});
  }

  const prompt = [
    `User message: ${String(text || '').trim()}`,
    `Workspace: ${String(workspaceId || '').trim() || 'unknown'}`,
    `Assistant name: Business Brain`,
    `Company: ${String(companyName || 'Chippy User')}`,
    `Current UTC timestamp: ${new Date().toISOString()}`,
    `User timezone: ${String(timezone || 'unknown')}`,
  ].join('\n');

  const result = await provider.client.generate({
    systemPrompt: DIRECT_ANSWER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.15,
    maxOutputTokens: 240,
  });

  return normalizeDirectAnswer(result?.text || '');
}

function summarizeRun(run) {
  const outputs = Array.isArray(run?.outputs) ? run.outputs : [];
  const summaries = outputs
    .map((item) => item?.parsed?.summary)
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => String(value).trim());

  const deliverables = outputs
    .flatMap((item) => (Array.isArray(item?.parsed?.deliverables) ? item.parsed.deliverables : []))
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => String(value).trim())
    .slice(0, 3);

  const findings = Array.isArray(run?.verification?.findings) ? run.verification.findings : [];
  if (run?.status === 'needs_revision') {
    const topFinding = findings.length > 0 ? findings[0] : 'I do not have enough verified evidence yet.';
    return truncateText(`I could not verify this confidently yet. ${topFinding}`, 1400);
  }

  const summary = summaries.length > 0 ? summaries[summaries.length - 1] : '';
  const firstDeliverable = deliverables.length > 0 ? deliverables[0] : '';
  const primary = normalizeDirectAnswer(summary || firstDeliverable || `Run finished with status: ${run?.status || 'unknown'}.`);

  const lines = [primary];
  if (run?.status === 'needs_revision' && findings.length > 0) {
    lines.push(`I still need revisions: ${findings[0]}`);
  }
  if (run?.status === 'awaiting_approval') {
    lines.push('Write actions are waiting for approval before execution.');
  }

  return truncateText(lines.filter(Boolean).join('\n\n'), 1400);
}

async function listPendingActions(runStore, workspaceId, runId) {
  return runStore.listActions({
    status: 'pending_review',
    workspaceId,
    runId,
    limit: 20,
  });
}

async function loadRunSummary(runStore, runId) {
  try {
    const run = await runStore.load(runId);
    return {
      id: run.id,
      status: run.status,
    };
  } catch {
    return null;
  }
}

async function recordHeartbeat(runStore, workspaceId, source, status = 'ok', note = '', extraMetrics = {}) {
  try {
    const summary = await runStore.getHeartbeatSummary({ workspaceId });
    await runStore.recordHeartbeat({
      workspaceId,
      source,
      status,
      note,
      metrics: {
        ...(summary?.metrics || {}),
        ...(extraMetrics || {}),
      },
    });
  } catch (error) {
    console.warn('[whatsapp-linked] heartbeat update skipped:', error?.message || error);
  }
}

async function processActionDecision({ runtime, workspaceId, actionId, decision, decidedBy }) {
  const existing = await runtime.runStore.getAction(actionId);
  if (!existing || existing.workspaceId !== workspaceId) {
    return `Action ${actionId} not found for this workspace.`;
  }

  const decided = await runtime.runStore.decideAction({
    actionId,
    decision,
    decidedBy,
  });

  if (decision === 'deny') {
    await runtime.runStore.patchRunToolCall({
      runId: decided.runId,
      toolCallId: decided.toolCallId,
      patch: {
        status: 'denied',
        error: `Action denied by ${decidedBy}`,
        endedAt: new Date().toISOString(),
      },
    });
    return `Denied ${actionId}.`;
  }

  if (decided.status === 'executed') {
    return `${actionId} is already executed.`;
  }

  if (decided.status !== 'approved') {
    return `${actionId} is not executable from status ${decided.status}.`;
  }

  try {
    const claimed = await runtime.runStore.claimActionExecution({
      actionId,
      claimedBy: decidedBy,
    });

    if (claimed.status === 'executed') {
      return `${actionId} is already executed.`;
    }

    const execution = await runtime.toolRegistry.execute(claimed.toolName, {
      input: claimed.input || {},
      context: {
        ...(claimed.context || {}),
        userId: workspaceId,
        tenantId: workspaceId,
      },
      dryRun: false,
    });

    await runtime.runStore.finalizeActionExecution({
      actionId,
      executionStatus: 'executed',
      result: execution.result,
    });

    await runtime.runStore.patchRunToolCall({
      runId: decided.runId,
      toolCallId: decided.toolCallId,
      patch: {
        status: 'completed',
        dryRun: false,
        result: execution.result,
        idempotencyKey: execution.idempotencyKey,
        attempts: 1,
        error: null,
        endedAt: new Date().toISOString(),
      },
    });

    const run = await loadRunSummary(runtime.runStore, decided.runId);
    return `Approved ${actionId}. Run ${run?.id || decided.runId} is now ${run?.status || 'updated'}.`;
  } catch (error) {
    await runtime.runStore.finalizeActionExecution({
      actionId,
      executionStatus: 'failed',
      error: error.message || 'Action execution failed',
    });

    await runtime.runStore.patchRunToolCall({
      runId: decided.runId,
      toolCallId: decided.toolCallId,
      patch: {
        status: 'failed',
        dryRun: false,
        error: error.message || 'Action execution failed',
        endedAt: new Date().toISOString(),
      },
    });

    return `Approval failed for ${actionId}: ${error.message || error}`;
  }
}

function buildRuntime(flags) {
  const providerRegistry = createDefaultProviderRegistry();
  const runDir = typeof flags['run-dir'] === 'string' ? flags['run-dir'] : DEFAULT_RUN_DIR;
  const dbPath = typeof flags['db-path'] === 'string' ? flags['db-path'] : DEFAULT_DB_PATH;
  const storageBackend = typeof flags['storage-backend'] === 'string'
    ? flags['storage-backend']
    : (process.env.CHIPPY_STORAGE_BACKEND || 'auto');

  const approvalMode = parseApprovalMode(flags['approval-mode'] || process.env.WHATSAPP_APPROVAL_MODE || 'REVIEW_REQUIRED');
  const maxToolCallsPerRun = clampInt(
    flags['max-tool-calls'] || process.env.WHATSAPP_MAX_TOOL_CALLS,
    1,
    50,
    10
  );
  const maxWriteActionsPerRun = clampInt(
    flags['max-write-actions'] || process.env.WHATSAPP_MAX_WRITE_ACTIONS,
    1,
    20,
    2
  );
  const allowedToolScopes = parseAllowedScopes(flags['allowed-scopes'] || process.env.WHATSAPP_ALLOWED_SCOPES || 'none,read,write');

  return createDefaultAgentRuntime({
    providerRegistry,
    runDir,
    dbPath,
    storageBackend,
    policy: {
      approvalMode,
      fallbackMode: parseBool(flags['no-fallback'], false) ? 'strict' : 'permissive',
      maxToolCallsPerRun,
      maxWriteActionsPerRun,
      allowedToolScopes,
      quietHours: {
        enabled: false,
        startHour: 22,
        endHour: 7,
        timezone: typeof flags.timezone === 'string' ? flags.timezone : (process.env.WHATSAPP_DEFAULT_TIMEZONE || null),
      },
    },
  });
}

function formatHelpText() {
  return [
    'Chippy WhatsApp commands:',
    '/help',
    '/status',
    '/actions',
    '/approve <action_id>',
    '/deny <action_id>',
    'Any non-command text runs a new agent mission.',
    'If you are messaging from the same paired account, use: /agent <your instruction>',
  ].join('\n');
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printHelp();
    return;
  }

  const workspaceId = typeof flags['workspace-id'] === 'string'
    ? flags['workspace-id']
    : (process.env.WHATSAPP_DEFAULT_WORKSPACE_ID || process.env.CHIPPY_WORKSPACE_ID || '');
  if (!workspaceId) {
    throw new Error('Missing workspace id. Set --workspace-id or WHATSAPP_DEFAULT_WORKSPACE_ID.');
  }

  const providerId = typeof flags.provider === 'string'
    ? flags.provider
    : (process.env.WHATSAPP_DEFAULT_PROVIDER_ID || 'gemini.flash');
  const model = typeof flags.model === 'string'
    ? flags.model
    : (process.env.WHATSAPP_DEFAULT_MODEL || undefined);
  const executeWrites = parseBool(
    flags['execute-write'] === true ? 'true' : flags['execute-write'],
    parseBool(process.env.WHATSAPP_EXECUTE_WRITES, false)
  );
  const timezone = typeof flags.timezone === 'string'
    ? flags.timezone
    : (process.env.WHATSAPP_DEFAULT_TIMEZONE || null);
  const companyName = typeof flags['company-name'] === 'string'
    ? flags['company-name']
    : (process.env.CHIPPY_COMPANY_NAME || 'Chippy User');
  const forceQr = parseBool(flags['force-qr'] === true ? 'true' : flags['force-qr'], false);
  const resetAuth = parseBool(flags['reset-auth'] === true ? 'true' : flags['reset-auth'], false);

  const authDir = typeof flags['auth-dir'] === 'string'
    ? flags['auth-dir']
    : DEFAULT_AUTH_DIR;
  const shouldResetAuthNow = resetAuth && process.env[RESET_AUTH_ONCE_ENV] !== '1';
  if (shouldResetAuthNow) {
    await fs.rm(authDir, { recursive: true, force: true });
    await clearPairingArtifacts();
    process.env[RESET_AUTH_ONCE_ENV] = '1';
    console.log(`[whatsapp-linked] auth session reset: ${authDir}`);
  }

  const pairPhone = forceQr
    ? ''
    : (typeof flags['pair-phone'] === 'string'
        ? normalizePhone(flags['pair-phone'])
        : normalizePhone(process.env.WHATSAPP_PAIR_PHONE || ''));

  const startupTo = typeof flags['send-to'] === 'string'
    ? normalizePhone(flags['send-to'])
    : normalizePhone(process.env.WHATSAPP_STARTUP_TO || '');
  const startupMessage = typeof flags.message === 'string'
    ? flags.message
    : '';
  const exitAfterSend = parseBool(flags['exit-after-send'] === true ? 'true' : flags['exit-after-send'], false);
  const outboxDir = resolveOutboxDir(workspaceId, flags);
  await fs.mkdir(outboxDir, { recursive: true });

  const ownerNumbers = parseOwnerNumbers(process.env.WHATSAPP_OWNER_NUMBERS || '');
  await ensureGatewayState(workspaceId, ownerNumbers);
  const runtime = buildRuntime(flags);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  let startupSent = false;
  let pairingRequested = false;
  let outboxTimer = null;
  let outboxBusy = false;

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('Chippy'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  if (!state.creds.registered && state.creds.pairingCode) {
    const formatted = String(state.creds.pairingCode || '').match(/.{1,4}/g)?.join('-') || String(state.creds.pairingCode || '');
    if (formatted) {
      console.log(`[whatsapp-linked] existing pairing code: ${formatted}`);
      await persistPairingCode(state.creds.pairingCode);
    }
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('Scan this QR in WhatsApp Linked Devices:');
      qrcodeTerminal.generate(qr, { small: true });
      await persistQrArtifacts(qr);
      if (pairPhone) {
        console.log('[whatsapp-linked] QR fallback is available while using --pair-phone.');
      }
    }

    if ((connection === 'connecting' || connection === 'open') && pairPhone && !state.creds.registered && !pairingRequested) {
      pairingRequested = true;
      try {
        const digits = normalizePhoneDigits(pairPhone);
        const code = await sock.requestPairingCode(digits);
        const formatted = String(code || '').match(/.{1,4}/g)?.join('-') || String(code || '');
        console.log(`[whatsapp-linked] pairing code for ${pairPhone}: ${formatted}`);
        await persistPairingCode(code);
      } catch (error) {
        pairingRequested = false;
        console.warn('[whatsapp-linked] pairing code request failed, will retry:', error?.message || error);
      }
    }

    if (connection === 'open') {
      console.log('[whatsapp-linked] connected');
      await clearPairingArtifacts();
      await recordHeartbeat(runtime.runStore, workspaceId, 'whatsapp.linked.connected', 'ok', 'Linked device connected');

      if (!outboxTimer) {
        outboxTimer = setInterval(async () => {
          if (outboxBusy) return;
          outboxBusy = true;
          try {
            await flushOutboxQueue({ sock, outboxDir });
          } catch (error) {
            console.warn('[whatsapp-linked] outbox flush failed:', error?.message || error);
          } finally {
            outboxBusy = false;
          }
        }, 3000);
      }
      try {
        await flushOutboxQueue({ sock, outboxDir });
      } catch (error) {
        console.warn('[whatsapp-linked] initial outbox flush failed:', error?.message || error);
      }

      if (startupTo && startupMessage && !startupSent) {
        startupSent = true;
        const jid = phoneToJid(startupTo);
        if (jid) {
          await sock.sendMessage(jid, { text: truncateText(startupMessage, 1400) });
          console.log(`[whatsapp-linked] startup message sent to ${startupTo}`);
          if (exitAfterSend) {
            process.exit(0);
          }
        }
      }
      return;
    }

    if (connection === 'close') {
      if (outboxTimer) {
        clearInterval(outboxTimer);
        outboxTimer = null;
      }
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut || state.creds.registered !== true;
      console.warn(`[whatsapp-linked] disconnected (code=${code || 'unknown'})`);
      if (shouldReconnect) {
        setTimeout(() => {
          main().catch((error) => {
            console.error('[whatsapp-linked] reconnect failed:', error.message || error);
            process.exit(1);
          });
        }, 1500);
      } else {
        console.error('[whatsapp-linked] logged out; delete auth dir and pair again.');
        process.exit(1);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        const remoteJid = msg?.key?.remoteJid || '';
        const fromMe = msg?.key?.fromMe === true;
        if (!remoteJid) continue;
        if (!remoteJid.endsWith('@s.whatsapp.net')) continue;

        const extractedText = extractMessageText(msg.message || {});
        if (!extractedText || !extractedText.trim()) continue;

        let text = extractedText.trim();
        if (fromMe) {
          const lower = text.toLowerCase();
          if (!lower.startsWith('/agent')) continue;
          text = text.slice('/agent'.length).trim();
          if (!text) {
            await sock.sendMessage(remoteJid, { text: 'Usage: /agent <instruction or /command>' }, { quoted: msg });
            continue;
          }
        }

        const contactPhone = jidToPhone(remoteJid);
        const command = parseCommand(text);
        const gatewayState = await readGatewayState(workspaceId, ownerNumbers);
        const allowedSender = isAllowedSender(contactPhone, gatewayState);
        if (!allowedSender) {
          if (gatewayState.policy.dmPolicy === 'allowlist') {
            await sock.sendMessage(
              remoteJid,
              { text: 'Access denied. This WhatsApp number is not allowlisted.' },
              { quoted: msg }
            );
            continue;
          }

          const pairing = await upsertPairingRequest(workspaceId, contactPhone, ownerNumbers);
          if (pairing?.created === false && pairing?.reason === 'existing_pending') {
            // Mirror OpenClaw behavior: do not spam repeated pairing instructions for an already pending request.
            continue;
          }
          if (!pairing?.request?.displayCode) {
            const reason = pairing?.reason || 'Unable to create pairing request right now.';
            await sock.sendMessage(remoteJid, { text: reason }, { quoted: msg });
            continue;
          }

          await sock.sendMessage(
            remoteJid,
            {
              text: `Access request created.\nCode: ${pairing.request.displayCode}\nAsk the owner to approve this code in Integrations -> WhatsApp.\nExpires in 1 hour.`,
            },
            { quoted: msg }
          );
          continue;
        }

        if (command) {
          if (OWNER_COMMANDS.has(command.name) && ownerNumbers.size > 0 && !ownerNumbers.has(contactPhone)) {
            await sock.sendMessage(remoteJid, { text: 'This command is restricted to owner numbers.' }, { quoted: msg });
            continue;
          }

          if (command.name === 'help') {
            await sock.sendMessage(remoteJid, { text: formatHelpText() }, { quoted: msg });
            continue;
          }

          if (command.name === 'status') {
            const summary = await runtime.runStore.getHeartbeatSummary({ workspaceId });
            const runs = await runtime.runStore.listRuns({ workspaceId, limit: 1 });
            const pending = await runtime.runStore.listActions({
              status: 'pending_review',
              workspaceId,
              limit: 5,
            });
            const metrics = summary?.metrics || {};
            const latestRun = runs.length > 0 ? runs[0] : null;
            const lines = [
              `Workspace: ${workspaceId}`,
              `Heartbeat: ${summary?.latest?.status || 'n/a'} at ${formatTimestamp(summary?.latest?.createdAt)}`,
              `Queue: objectives=${Number(metrics.objectivesPending || 0)} approvals=${Number(metrics.approvalsPending || 0)} runs24h=${Number(metrics.runsLast24h || 0)}`,
              `Last run: ${latestRun ? `${latestRun.id} (${latestRun.status})` : 'none'}`,
              `Pending actions: ${pending.length > 0 ? pending.map((item) => item.id).join(', ') : 'none'}`,
            ];
            await sock.sendMessage(remoteJid, { text: truncateText(lines.join('\n'), 1400) }, { quoted: msg });
            continue;
          }

          if (command.name === 'actions') {
            const actions = await runtime.runStore.listActions({
              status: 'pending_review',
              workspaceId,
              limit: 10,
            });
            if (!actions.length) {
              await sock.sendMessage(remoteJid, { text: 'No pending approval actions.' }, { quoted: msg });
              continue;
            }
            const lines = ['Pending approval actions:'];
            for (const action of actions) {
              lines.push(`- ${action.id} | ${action.toolName}`);
            }
            await sock.sendMessage(remoteJid, { text: truncateText(lines.join('\n'), 1400) }, { quoted: msg });
            continue;
          }

          if (command.name === 'approve' || command.name === 'deny') {
            const actionId = String(command.args[0] || '').trim();
            if (!actionId) {
              await sock.sendMessage(remoteJid, { text: `Usage: /${command.name} <action_id>` }, { quoted: msg });
              continue;
            }
            const responseText = await processActionDecision({
              runtime,
              workspaceId,
              actionId,
              decision: command.name,
              decidedBy: `whatsapp:${contactPhone || 'unknown'}`,
            });
            await recordHeartbeat(
              runtime.runStore,
              workspaceId,
              `whatsapp.command.${command.name}`,
              'ok',
              `Processed ${command.name} for ${actionId}`
            );
            await sock.sendMessage(remoteJid, { text: truncateText(responseText, 1400) }, { quoted: msg });
            continue;
          }

          await sock.sendMessage(remoteJid, { text: formatHelpText() }, { quoted: msg });
          continue;
        }

        if (shouldUseDirectAnswerMode(text)) {
          const directAnswer = await generateDirectAnswer({
            runtime,
            providerId,
            model,
            text,
            timezone,
            companyName,
            workspaceId,
          });

          if (directAnswer) {
            await recordHeartbeat(
              runtime.runStore,
              workspaceId,
              'whatsapp.linked.direct_answer',
              'ok',
              'Answered directly in chat mode'
            );
            await sock.sendMessage(remoteJid, { text: truncateText(directAnswer, 1400) }, { quoted: msg });
            continue;
          }
        }

        const soul = await runtime.runStore.getSoul({ workspaceId });
        const run = await runtime.run({
          goal: text,
          providerId,
          model,
          executeWrites,
          context: {
            source: 'whatsapp-linked-device',
            channel: 'whatsapp',
            userId: workspaceId,
            tenantId: workspaceId,
            workspaceId,
            companyName,
            timezone,
            emailSource: process.env.CHIPPY_EMAIL_SOURCE || undefined,
            emailTransport: process.env.CHIPPY_EMAIL_REPLY_TRANSPORT || undefined,
            enableIterativeExecutor: true,
            soul,
            contactPhone,
            contactName: msg.pushName || undefined,
            inboundMessageId: msg?.key?.id || undefined,
          },
        });

        const pendingActions = await listPendingActions(runtime.runStore, workspaceId, run.id);
        await recordHeartbeat(
          runtime.runStore,
          workspaceId,
          'whatsapp.linked.run',
          run.status === 'failed' ? 'error' : 'ok',
          `Run ${run.id} status ${run.status}`,
          {
            lastRunStatus: run.status,
            channel: 'whatsapp',
          }
        );

        const reply = pendingActions.length > 0
          ? `${summarizeRun(run)}\n\n${pendingActions.length} action(s) await owner approval.`
          : summarizeRun(run);
        await sock.sendMessage(remoteJid, { text: truncateText(reply, 1400) }, { quoted: msg });
      } catch (error) {
        console.error('[whatsapp-linked] message handler failed:', error);
        const remoteJid = msg?.key?.remoteJid || '';
        if (remoteJid && remoteJid.endsWith('@s.whatsapp.net')) {
          try {
            await sock.sendMessage(remoteJid, { text: 'I could not process that right now. Please retry in a moment.' }, { quoted: msg });
          } catch {
            // ignore nested send failures
          }
        }
      }
    }
  });

  if (!signalHandlersRegistered) {
    signalHandlersRegistered = true;
    process.on('SIGINT', async () => {
      console.log('\n[whatsapp-linked] shutting down...');
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error('[whatsapp-linked] fatal error:', error.message || error);
  process.exit(1);
});
