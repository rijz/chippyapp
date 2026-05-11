import type { WhatsAppLinkedSummary } from './whatsappLinkedService';

export interface GatewayWorkerSnapshot {
  workspaceId: string;
  running: boolean;
  pid: number | null;
  restartCount: number;
  lastStartedAt: string | null;
  nextRestartAt: string | null;
  lastExit: {
    code: number | null;
    signal: string | null;
    at: string | null;
  } | null;
}

export interface GatewayState {
  pid: number;
  startedAt: string;
  updatedAt: string;
  workspaces: string[];
  scheduler: {
    tickSeconds: number;
    heartbeatMinutes: number;
    objectivePollSeconds: number;
    autoRunObjectives: boolean;
    relinkPendingWorkspaces?: string[];
  };
  objectiveRunner: {
    providerId: string;
    model: string | null;
    executeWrites: boolean;
  };
  workers: GatewayWorkerSnapshot[];
  lastHeartbeatAt: string | null;
  lastObjectivePollAt: string | null;
  lastObjectiveRunAt: string | null;
}

export interface GatewaySummary {
  gateway: {
    running: boolean;
    pid: number | null;
    pidPath: string;
    statePath: string;
    logPath: string;
  };
  workspaces: string[];
  state: GatewayState | null;
}

export interface GatewayLifecycleResponse {
  alreadyRunning?: boolean;
  stopped?: boolean;
  forced?: boolean;
  exited?: boolean;
  pid?: number | null;
  summary: GatewaySummary;
}

export interface GatewayServiceCheck {
  command: string;
  ok: boolean;
  code: number;
  stdout: string | null;
  stderr: string | null;
}

export interface GatewayServiceStatus {
  supported: boolean;
  manager: string | null;
  platform: string;
  filePath: string | null;
  installed: boolean;
  enabled: boolean;
  active: boolean;
  checks: GatewayServiceCheck[];
}

export interface GatewayServiceStatusResponse {
  service: GatewayServiceStatus;
  gateway: GatewaySummary['gateway'];
}

export interface GatewayServiceLifecycleResponse {
  installResult?: unknown;
  uninstallResult?: unknown;
  service: GatewayServiceStatus;
  gateway: GatewaySummary['gateway'];
}

export type GatewayHealthStatus = 'ok' | 'warn' | 'error';

export interface GatewayHealthCheck {
  id: string;
  status: GatewayHealthStatus;
  title: string;
  detail: string;
  recommendedAction: GatewayRepairAction | null;
}

export interface GatewayControlHealthResponse {
  generatedAt: string;
  summary: {
    ok: number;
    warn: number;
    error: number;
  };
  checks: GatewayHealthCheck[];
  gateway: GatewaySummary;
  service: GatewayServiceStatus;
  whatsapp: WhatsAppLinkedSummary;
}

export type GatewayControlLogTarget = 'gateway' | 'worker';

export interface GatewayControlLogResponse {
  target: GatewayControlLogTarget;
  maxChars: number;
  logPath: string;
  logTail: string;
  generatedAt: string;
}

export type GatewayRepairAction =
  | 'clear_stale_pid_files'
  | 'start_gateway'
  | 'restart_gateway'
  | 'restart_gateway_relink'
  | 'install_service'
  | 'uninstall_service';

export interface GatewayRepairResponse {
  action: GatewayRepairAction;
  result: unknown;
  health: GatewayControlHealthResponse;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } catch {
    // ignore parse errors
  }
  return `Request failed (${response.status})`;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json() as Promise<T>;
}

export async function fetchGatewayStatus(accessToken: string): Promise<GatewaySummary> {
  const response = await fetch('/api/integrations/gateway/status', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseJson<GatewaySummary>(response);
}

export async function startGateway(input: {
  accessToken: string;
  workspaceIds?: string[];
  relink?: boolean;
}): Promise<GatewayLifecycleResponse> {
  const response = await fetch('/api/integrations/gateway/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      workspaceIds: Array.isArray(input.workspaceIds) ? input.workspaceIds : [],
      relink: input.relink === true,
    }),
  });
  return parseJson<GatewayLifecycleResponse>(response);
}

export async function stopGateway(accessToken: string): Promise<GatewayLifecycleResponse> {
  const response = await fetch('/api/integrations/gateway/stop', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseJson<GatewayLifecycleResponse>(response);
}

export async function restartGateway(input: {
  accessToken: string;
  workspaceIds?: string[];
  relink?: boolean;
}): Promise<GatewayLifecycleResponse> {
  const response = await fetch('/api/integrations/gateway/restart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      workspaceIds: Array.isArray(input.workspaceIds) ? input.workspaceIds : [],
      relink: input.relink === true,
    }),
  });
  return parseJson<GatewayLifecycleResponse>(response);
}

export async function fetchGatewayServiceStatus(accessToken: string): Promise<GatewayServiceStatusResponse> {
  const response = await fetch('/api/integrations/gateway/service/status', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseJson<GatewayServiceStatusResponse>(response);
}

export async function installGatewayService(accessToken: string): Promise<GatewayServiceLifecycleResponse> {
  const response = await fetch('/api/integrations/gateway/service/install', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseJson<GatewayServiceLifecycleResponse>(response);
}

export async function uninstallGatewayService(accessToken: string): Promise<GatewayServiceLifecycleResponse> {
  const response = await fetch('/api/integrations/gateway/service/uninstall', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseJson<GatewayServiceLifecycleResponse>(response);
}

export async function fetchGatewayControlHealth(accessToken: string): Promise<GatewayControlHealthResponse> {
  const response = await fetch('/api/integrations/gateway/control/health', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseJson<GatewayControlHealthResponse>(response);
}

export async function fetchGatewayControlLogs(input: {
  accessToken: string;
  target: GatewayControlLogTarget;
  maxChars?: number;
}): Promise<GatewayControlLogResponse> {
  const params = new URLSearchParams({
    target: input.target,
  });
  if (typeof input.maxChars === 'number' && Number.isFinite(input.maxChars)) {
    params.set('maxChars', String(Math.round(input.maxChars)));
  }
  const response = await fetch(`/api/integrations/gateway/control/logs?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
  return parseJson<GatewayControlLogResponse>(response);
}

export async function runGatewayRepairAction(input: {
  accessToken: string;
  action: GatewayRepairAction;
}): Promise<GatewayRepairResponse> {
  const response = await fetch('/api/integrations/gateway/control/repair', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      action: input.action,
    }),
  });
  return parseJson<GatewayRepairResponse>(response);
}
