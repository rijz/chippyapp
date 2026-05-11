import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const AGENT_RUNTIME_RUN_DIR = process.env.CHIPPY_AGENT_RUN_DIR || path.join(ROOT_DIR, '.runs', 'agent-runtime');
export const AGENT_RUNTIME_DB_PATH = process.env.CHIPPY_STORAGE_DB_PATH || path.join(AGENT_RUNTIME_RUN_DIR, 'runtime.db');
export const WHATSAPP_LINKED_BASE_DIR = process.env.CHIPPY_WHATSAPP_LINKED_DIR || path.join(ROOT_DIR, '.runs', 'whatsapp-gateway');
export const GATEWAY_RUN_DIR = process.env.CHIPPY_GATEWAY_RUN_DIR || path.join(ROOT_DIR, '.runs', 'gateway');
export const GATEWAY_PID_PATH = path.join(GATEWAY_RUN_DIR, 'gateway.pid');
export const GATEWAY_LOCK_PATH = path.join(GATEWAY_RUN_DIR, 'gateway.lock');
export const GATEWAY_STATE_PATH = path.join(GATEWAY_RUN_DIR, 'gateway-state.json');
export const GATEWAY_LOG_PATH = path.join(GATEWAY_RUN_DIR, 'gateway.log');
export const WATCHDOG_RUN_DIR = process.env.CHIPPY_WATCHDOG_RUN_DIR || GATEWAY_RUN_DIR;
export const WATCHDOG_PID_PATH = path.join(WATCHDOG_RUN_DIR, 'watchdog.pid');
export const WATCHDOG_STATE_PATH = path.join(WATCHDOG_RUN_DIR, 'watchdog-state.json');
export const WATCHDOG_LOG_PATH = path.join(WATCHDOG_RUN_DIR, 'watchdog.log');
export const BACKUP_BASE_DIR = process.env.CHIPPY_BACKUP_DIR || path.join(ROOT_DIR, '.runs', 'backups');

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeFileKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 160);
}

export function isProcessRunning(pid) {
  const parsed = Number(pid);
  if (!Number.isInteger(parsed) || parsed < 1) return false;
  try {
    process.kill(parsed, 0);
    return true;
  } catch {
    return false;
  }
}

export function parseWorkspaceIds(values = []) {
  const list = Array.isArray(values) ? values : [values];
  const set = new Set();
  for (const value of list) {
    String(value || '')
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => set.add(item));
  }
  return Array.from(set);
}

export function parseWorkspaceIdsFromEnv() {
  return parseWorkspaceIds([
    process.env.CHIPPY_GATEWAY_WORKSPACES || '',
    process.env.WHATSAPP_DEFAULT_WORKSPACE_ID || '',
  ]);
}

export function linkedWhatsappPaths(workspaceId = '') {
  const key = String(workspaceId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128) || 'workspace';
  return {
    workspaceKey: key,
    statePath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}.json`),
    authDir: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}-auth`),
    pidPath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}.pid`),
    logPath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}.log`),
    qrPngPath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}-qr.png`),
    qrTextPath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}-qr.txt`),
    pairingCodePath: path.join(WHATSAPP_LINKED_BASE_DIR, `${key}-pairing-code.txt`),
  };
}

export async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function readGatewayPid() {
  try {
    const raw = await fs.readFile(GATEWAY_PID_PATH, 'utf8');
    const pid = Number(String(raw).trim());
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function readGatewayLockPid() {
  try {
    const raw = await fs.readFile(GATEWAY_LOCK_PATH, 'utf8');
    const pid = Number(String(raw).trim());
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function readWatchdogPid() {
  try {
    const raw = await fs.readFile(WATCHDOG_PID_PATH, 'utf8');
    const pid = Number(String(raw).trim());
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function readGatewayState() {
  return readJson(GATEWAY_STATE_PATH, null);
}

export async function readWatchdogState() {
  return readJson(WATCHDOG_STATE_PATH, null);
}

export async function writeWatchdogState(payload) {
  return writeJson(WATCHDOG_STATE_PATH, payload);
}

export async function getGatewayStatusSummary() {
  const pidFromFile = await readGatewayPid();
  const lockPid = await readGatewayLockPid();
  const pid = isProcessRunning(pidFromFile)
    ? pidFromFile
    : (isProcessRunning(lockPid) ? lockPid : null);
  const running = isProcessRunning(pid);
  const state = await readGatewayState();
  return {
    running,
    pid: running ? pid : null,
    pidFromFile: isProcessRunning(pidFromFile) ? pidFromFile : null,
    lockPid: isProcessRunning(lockPid) ? lockPid : null,
    state,
    pidPath: GATEWAY_PID_PATH,
    lockPath: GATEWAY_LOCK_PATH,
    statePath: GATEWAY_STATE_PATH,
    logPath: GATEWAY_LOG_PATH,
  };
}

export async function getWatchdogStatusSummary() {
  const pid = await readWatchdogPid();
  const running = isProcessRunning(pid);
  const state = await readWatchdogState();
  return {
    running,
    pid: running ? pid : null,
    state,
    pidPath: WATCHDOG_PID_PATH,
    statePath: WATCHDOG_STATE_PATH,
    logPath: WATCHDOG_LOG_PATH,
  };
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

function getServiceDescriptor(name) {
  const home = process.env.HOME || '';
  const normalized = String(name || '').trim().toLowerCase();
  const supportedName = normalized === 'watchdog' ? 'watchdog' : 'gateway';

  if (process.platform === 'darwin') {
    return {
      supported: Boolean(home),
      manager: 'launchd',
      platform: process.platform,
      serviceName: supportedName,
      label: supportedName === 'watchdog' ? 'com.chippy.watchdog' : 'com.chippy.gateway',
      filePath: home
        ? path.join(home, 'Library', 'LaunchAgents', supportedName === 'watchdog' ? 'com.chippy.watchdog.plist' : 'com.chippy.gateway.plist')
        : null,
      unitName: null,
    };
  }

  if (process.platform === 'linux') {
    return {
      supported: Boolean(home),
      manager: 'systemd-user',
      platform: process.platform,
      serviceName: supportedName,
      label: null,
      filePath: home
        ? path.join(home, '.config', 'systemd', 'user', supportedName === 'watchdog' ? 'chippy-watchdog.service' : 'chippy-gateway.service')
        : null,
      unitName: supportedName === 'watchdog' ? 'chippy-watchdog.service' : 'chippy-gateway.service',
    };
  }

  return {
    supported: false,
    manager: null,
    platform: process.platform,
    serviceName: supportedName,
    label: null,
    filePath: null,
    unitName: null,
  };
}

export function getGatewayServiceDescriptor() {
  return getServiceDescriptor('gateway');
}

export function getWatchdogServiceDescriptor() {
  return getServiceDescriptor('watchdog');
}

export function getServiceStatus(name) {
  const descriptor = getServiceDescriptor(name);
  const installed = descriptor.filePath ? fsSync.existsSync(descriptor.filePath) : false;

  if (!descriptor.supported || !descriptor.manager) {
    return {
      ...descriptor,
      installed,
      enabled: false,
      active: false,
      checks: [],
    };
  }

  if (descriptor.manager === 'launchd') {
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    const checks = [];
    let active = false;

    if (uid !== null && descriptor.label) {
      const activeCheck = runCommandSync('launchctl', ['print', `gui/${uid}/${descriptor.label}`]);
      checks.push(activeCheck);
      active = activeCheck.ok;
      checks.push(runCommandSync('launchctl', ['print-disabled', `gui/${uid}`]));
    } else if (descriptor.label) {
      const activeCheck = runCommandSync('launchctl', ['list', descriptor.label]);
      checks.push(activeCheck);
      active = activeCheck.ok;
    }

    const enabledCheck = checks.find((item) => item.command.includes('print-disabled'));
    const enabled = installed
      ? (enabledCheck
      ? !String(enabledCheck.stdout || '').includes(`"${descriptor.label}" => true`)
      : active)
      : false;

    return {
      ...descriptor,
      installed,
      enabled,
      active,
      checks: checks.map((item) => ({
        command: item.command,
        ok: item.ok,
        status: item.status,
        stdout: item.stdout || null,
        stderr: item.stderr || null,
      })),
    };
  }

  const checks = [];
  if (descriptor.unitName) {
    checks.push(runCommandSync('systemctl', ['--user', 'is-enabled', descriptor.unitName]));
    checks.push(runCommandSync('systemctl', ['--user', 'is-active', descriptor.unitName]));
  }
  const enabled = checks[0]?.ok && checks[0]?.stdout === 'enabled';
  const active = checks[1]?.ok && checks[1]?.stdout === 'active';

  return {
    ...descriptor,
    installed,
    enabled,
    active,
    checks: checks.map((item) => ({
      command: item.command,
      ok: item.ok,
      status: item.status,
      stdout: item.stdout || null,
      stderr: item.stderr || null,
    })),
  };
}

async function rotateLogFile(filePath, maxBytes, keep) {
  try {
    const stat = await fs.stat(filePath);
    const sizeBytes = Number(stat.size || 0);
    if (sizeBytes < maxBytes) {
      return {
        filePath,
        rotated: false,
        sizeBytes,
      };
    }

    for (let index = keep; index >= 1; index -= 1) {
      const source = `${filePath}.${index}`;
      const target = `${filePath}.${index + 1}`;
      if (index === keep) {
        await fs.rm(source, { force: true });
        continue;
      }
      if (fsSync.existsSync(source)) {
        await fs.rename(source, target);
      }
    }

    await fs.rename(filePath, `${filePath}.1`);
    await fs.writeFile(filePath, '', 'utf8');

    return {
      filePath,
      rotated: true,
      sizeBytes,
      archivePath: `${filePath}.1`,
    };
  } catch {
    return {
      filePath,
      rotated: false,
      sizeBytes: 0,
      skipped: true,
    };
  }
}

async function resolveWorkspaceIdsForLogs(workspaceIds = []) {
  const state = await readGatewayState();
  const fromState = Array.isArray(state?.workspaces) ? state.workspaces : [];
  return parseWorkspaceIds([
    workspaceIds,
    parseWorkspaceIdsFromEnv(),
    fromState,
  ]);
}

export async function rotateRuntimeLogs({ workspaceIds = [], maxBytes, keep } = {}) {
  const limitBytes = clampInt(maxBytes, 1024 * 100, 1024 * 1024 * 1024, 5 * 1024 * 1024);
  const keepCount = clampInt(keep, 1, 20, 5);
  await fs.mkdir(GATEWAY_RUN_DIR, { recursive: true });

  const resolvedWorkspaceIds = await resolveWorkspaceIdsForLogs(workspaceIds);
  const files = new Set([
    GATEWAY_LOG_PATH,
    WATCHDOG_LOG_PATH,
    path.join(GATEWAY_RUN_DIR, 'launchd.out.log'),
    path.join(GATEWAY_RUN_DIR, 'launchd.err.log'),
  ]);
  for (const workspaceId of resolvedWorkspaceIds) {
    files.add(linkedWhatsappPaths(workspaceId).logPath);
  }

  const rotated = [];
  for (const filePath of files) {
    rotated.push(await rotateLogFile(filePath, limitBytes, keepCount));
  }

  return {
    rotatedAt: nowIso(),
    maxBytes: limitBytes,
    keep: keepCount,
    workspaceIds: resolvedWorkspaceIds,
    files: rotated,
  };
}

function resolveBackupRelativePath(absolutePath) {
  const rel = path.relative(ROOT_DIR, absolutePath);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel;
  }
  return path.join('_external', sanitizeFileKey(absolutePath));
}

async function pathExists(absolutePath) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function parseEnvPathList(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (path.isAbsolute(item) ? item : path.join(ROOT_DIR, item)));
}

async function cleanupBackups({ now = Date.now() } = {}) {
  const keepCount = clampInt(process.env.CHIPPY_BACKUP_KEEP_COUNT, 1, 200, 20);
  const keepDays = clampInt(process.env.CHIPPY_BACKUP_KEEP_DAYS, 1, 3650, 14);
  const entries = await listBackups({ limit: 500 });
  const maxAgeMs = keepDays * 24 * 60 * 60 * 1000;
  const removed = [];

  for (let index = 0; index < entries.length; index += 1) {
    const item = entries[index];
    const createdMs = Number.isFinite(Date.parse(item.createdAt || ''))
      ? Date.parse(item.createdAt)
      : now;
    const tooOld = now - createdMs > maxAgeMs;
    const aboveCount = index >= keepCount;
    if (!tooOld && !aboveCount) continue;
    await fs.rm(item.path, { recursive: true, force: true });
    removed.push(item.id);
  }

  return {
    removed,
    keepCount,
    keepDays,
  };
}

export async function createBackupSnapshot({ workspaceIds = [], label = '' } = {}) {
  await fs.mkdir(BACKUP_BASE_DIR, { recursive: true });
  const createdAt = nowIso();
  const backupId = `${createdAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '_')}_${Math.random().toString(36).slice(2, 8)}`;
  const backupPath = path.join(BACKUP_BASE_DIR, backupId);
  const dataPath = path.join(backupPath, 'data');
  await fs.mkdir(dataPath, { recursive: true });

  const includeLogs = String(process.env.CHIPPY_BACKUP_INCLUDE_LOGS || '').toLowerCase() === 'true';
  const extraPaths = parseEnvPathList(process.env.CHIPPY_BACKUP_EXTRA_PATHS || '');
  const candidateSources = [
    AGENT_RUNTIME_RUN_DIR,
    WHATSAPP_LINKED_BASE_DIR,
    GATEWAY_RUN_DIR,
    ...extraPaths,
  ];

  const sources = [];
  for (const sourcePath of candidateSources) {
    if (!sourcePath) continue;
    const absoluteSource = path.resolve(sourcePath);
    if (!(await pathExists(absoluteSource))) continue;
    sources.push(absoluteSource);
  }

  const items = [];
  for (const absoluteSource of sources) {
    const relativeBackupPath = resolveBackupRelativePath(absoluteSource);
    const absoluteDestination = path.join(dataPath, relativeBackupPath);
    await fs.mkdir(path.dirname(absoluteDestination), { recursive: true });
    await fs.cp(absoluteSource, absoluteDestination, {
      recursive: true,
      force: true,
      errorOnExist: false,
      filter: (entry) => {
        if (includeLogs) return true;
        return !/\.log(\.\d+)?$/i.test(String(entry || ''));
      },
    });

    items.push({
      sourcePath: absoluteSource,
      backupRelativePath: relativeBackupPath,
      restorePath: absoluteSource,
    });
  }

  const manifest = {
    schemaVersion: 1,
    id: backupId,
    label: String(label || '').trim() || null,
    createdAt,
    workspaceIds: parseWorkspaceIds(workspaceIds),
    includeLogs,
    items,
  };

  await writeJson(path.join(backupPath, 'manifest.json'), manifest);
  const cleanup = await cleanupBackups({});

  return {
    id: backupId,
    path: backupPath,
    createdAt,
    manifest,
    cleanup,
  };
}

export async function listBackups({ limit = 50 } = {}) {
  await fs.mkdir(BACKUP_BASE_DIR, { recursive: true });
  const entries = await fs.readdir(BACKUP_BASE_DIR, { withFileTypes: true });
  const list = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const backupPath = path.join(BACKUP_BASE_DIR, entry.name);
    const manifestPath = path.join(backupPath, 'manifest.json');
    const manifest = await readJson(manifestPath, null);
    if (!manifest) continue;
    list.push({
      id: manifest.id || entry.name,
      createdAt: manifest.createdAt || null,
      label: manifest.label || null,
      workspaceIds: Array.isArray(manifest.workspaceIds) ? manifest.workspaceIds : [],
      itemCount: Array.isArray(manifest.items) ? manifest.items.length : 0,
      path: backupPath,
      manifestPath,
    });
  }

  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return list.slice(0, clampInt(limit, 1, 500, 50));
}

export async function restoreBackupSnapshot({ backupId, force = false } = {}) {
  const normalizedId = String(backupId || '').trim();
  if (!normalizedId) {
    throw new Error('Missing backup id.');
  }

  const backupPath = path.join(BACKUP_BASE_DIR, normalizedId);
  const manifest = await readJson(path.join(backupPath, 'manifest.json'), null);
  if (!manifest) {
    throw new Error(`Backup not found: ${normalizedId}`);
  }

  const gateway = await getGatewayStatusSummary();
  if (gateway.running && !force) {
    throw new Error('Gateway is running. Stop gateway/watchdog before restore or pass --force.');
  }

  const restored = [];
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  for (const item of items) {
    const source = path.join(backupPath, 'data', item.backupRelativePath || '');
    const target = String(item.restorePath || '').trim()
      ? String(item.restorePath)
      : path.join(ROOT_DIR, item.backupRelativePath || '');
    if (!(await pathExists(source))) continue;

    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
    restored.push({
      source,
      target,
    });
  }

  return {
    id: normalizedId,
    restoredAt: nowIso(),
    restored,
    force,
  };
}

function checkMacSleepSettings() {
  const result = runCommandSync('pmset', ['-g', 'custom']);
  if (!result.ok) {
    return {
      status: 'warn',
      detail: 'Could not read macOS sleep settings with pmset.',
      command: result.command,
      stderr: result.stderr || null,
    };
  }

  const guardServiceCheck = (() => {
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    if (uid === null) return null;
    return runCommandSync('launchctl', ['print', `gui/${uid}/com.chippy.caffeinate`]);
  })();
  const guardProcessCheck = runCommandSync('pgrep', ['-fl', 'caffeinate -dimsu']);
  const guardActive = Boolean((guardServiceCheck && guardServiceCheck.ok) || guardProcessCheck.ok);

  const lines = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  const relevant = lines.filter((line) => /^sleep\s+\d+/i.test(line) || /^displaysleep\s+\d+/i.test(line));
  const hasSleep = relevant.some((line) => {
    const match = line.match(/\s+(\d+)$/);
    return Number(match?.[1] || 0) > 0;
  });

  return {
    status: hasSleep && !guardActive ? 'warn' : 'ok',
    detail: hasSleep
      ? (guardActive
          ? 'macOS sleep appears enabled, but a persistent caffeinate guard is active.'
          : 'macOS sleep appears enabled. Disable sleep for reliable 24/7 runtime.')
      : 'macOS sleep appears disabled for core power profiles.',
    command: result.command,
    stderr: result.stderr || null,
  };
}

function checkLinuxLinger() {
  const user = process.env.USER || '';
  if (!user) {
    return {
      status: 'warn',
      detail: 'Could not resolve USER for linger check.',
      command: 'loginctl',
      stderr: null,
    };
  }
  const result = runCommandSync('loginctl', ['show-user', user, '-p', 'Linger']);
  if (!result.ok) {
    return {
      status: 'warn',
      detail: 'Could not read linux linger setting. Check manually with loginctl.',
      command: result.command,
      stderr: result.stderr || null,
    };
  }
  const enabled = /Linger=yes/i.test(result.stdout);
  return {
    status: enabled ? 'ok' : 'warn',
    detail: enabled
      ? 'Linux linger is enabled.'
      : 'Linux linger is disabled. Run `loginctl enable-linger <user>` for user services at boot.',
    command: result.command,
    stderr: result.stderr || null,
  };
}

export async function runSystemDoctor({ workspaceIds = [] } = {}) {
  const resolvedWorkspaceIds = parseWorkspaceIds([
    workspaceIds,
    parseWorkspaceIdsFromEnv(),
  ]);

  const gateway = await getGatewayStatusSummary();
  const watchdog = await getWatchdogStatusSummary();
  const gatewayService = getServiceStatus('gateway');
  const watchdogService = getServiceStatus('watchdog');
  const checks = [];

  checks.push({
    id: 'gateway.service',
    status: gatewayService.installed ? 'ok' : 'warn',
    title: 'Gateway service installation',
    detail: gatewayService.installed
      ? `Gateway service file present (${gatewayService.filePath || 'n/a'}).`
      : 'Gateway service is not installed.',
    recommendation: gatewayService.installed ? null : 'Run `chippy gateway install`.',
  });

  checks.push({
    id: 'watchdog.service',
    status: watchdogService.installed ? 'ok' : 'warn',
    title: 'Watchdog service installation',
    detail: watchdogService.installed
      ? `Watchdog service file present (${watchdogService.filePath || 'n/a'}).`
      : 'Watchdog service is not installed.',
    recommendation: watchdogService.installed ? null : 'Run `chippy watchdog install`.',
  });

  checks.push({
    id: 'gateway.runtime',
    status: gateway.running ? 'ok' : 'error',
    title: 'Gateway process runtime',
    detail: gateway.running
      ? `Gateway is running (pid ${gateway.pid}).`
      : 'Gateway is not running.',
    recommendation: gateway.running ? null : 'Run `chippy gateway start`.',
  });

  checks.push({
    id: 'watchdog.runtime',
    status: watchdog.running ? 'ok' : 'warn',
    title: 'Watchdog process runtime',
    detail: watchdog.running
      ? `Watchdog is running (pid ${watchdog.pid}).`
      : 'Watchdog is not running.',
    recommendation: watchdog.running ? null : 'Run `chippy watchdog start` or install service.',
  });

  for (const workspaceId of resolvedWorkspaceIds) {
    const paths = linkedWhatsappPaths(workspaceId);
    const workerPidRaw = await fs.readFile(paths.pidPath, 'utf8').catch(() => '');
    const workerPid = Number(String(workerPidRaw || '').trim());
    const authPresent = fsSync.existsSync(paths.authDir);
    checks.push({
      id: `workspace.auth.${workspaceId}`,
      status: authPresent ? 'ok' : 'warn',
      title: `WhatsApp auth (${workspaceId})`,
      detail: authPresent
        ? 'Auth session exists.'
        : 'Auth session not found.',
      recommendation: authPresent ? null : 'Run restart + relink and scan QR.',
    });
    checks.push({
      id: `workspace.pid.${workspaceId}`,
      status: Number.isInteger(workerPid) && isProcessRunning(workerPid) ? 'ok' : 'warn',
      title: `Worker pid (${workspaceId})`,
      detail: Number.isInteger(workerPid) && isProcessRunning(workerPid)
        ? `Worker process running (pid ${workerPid}).`
        : 'Worker pid not active (this can be normal when gateway is stopped).',
      recommendation: null,
    });
  }

  if (process.platform === 'darwin') {
    const sleep = checkMacSleepSettings();
    checks.push({
      id: 'host.sleep',
      status: sleep.status,
      title: 'Host sleep policy',
      detail: sleep.detail,
      recommendation: sleep.status === 'warn' ? 'Disable system sleep on AC power.' : null,
    });
  } else if (process.platform === 'linux') {
    const linger = checkLinuxLinger();
    checks.push({
      id: 'host.linger',
      status: linger.status,
      title: 'Linux linger setting',
      detail: linger.detail,
      recommendation: linger.status === 'warn' ? 'Enable linger for service user.' : null,
    });
  }

  checks.push({
    id: 'backup.path',
    status: fsSync.existsSync(BACKUP_BASE_DIR) ? 'ok' : 'warn',
    title: 'Backup directory',
    detail: fsSync.existsSync(BACKUP_BASE_DIR)
      ? `Backup directory exists at ${BACKUP_BASE_DIR}.`
      : `Backup directory missing at ${BACKUP_BASE_DIR}.`,
    recommendation: fsSync.existsSync(BACKUP_BASE_DIR) ? null : 'Run `chippy backup create` once to initialize.',
  });

  const summary = {
    ok: checks.filter((item) => item.status === 'ok').length,
    warn: checks.filter((item) => item.status === 'warn').length,
    error: checks.filter((item) => item.status === 'error').length,
  };

  return {
    generatedAt: nowIso(),
    workspaceIds: resolvedWorkspaceIds,
    gateway,
    watchdog,
    services: {
      gateway: gatewayService,
      watchdog: watchdogService,
    },
    summary,
    checks,
  };
}
