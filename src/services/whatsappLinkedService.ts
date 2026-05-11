export type WhatsAppDmPolicy = 'pairing' | 'allowlist';

export interface WhatsAppLinkedGatewayStatus {
  running: boolean;
  pid: number | null;
  managedByGateway?: boolean;
  gatewayPid?: number | null;
  qrImageDataUrl: string | null;
  pairingCode: string | null;
  hasAuthSession: boolean;
  logTail: string;
  lastStartedAt: string | null;
  nextRestartAt?: string | null;
  restartCount?: number;
}

export interface WhatsAppLinkedPolicy {
  dmPolicy: WhatsAppDmPolicy;
  allowFrom: string[];
}

export interface WhatsAppLinkedPairingRequest {
  code: string;
  phone: string;
  requestedAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'expired';
}

export interface WhatsAppLinkedSummary {
  workspaceId: string;
  gateway: WhatsAppLinkedGatewayStatus;
  policy: WhatsAppLinkedPolicy;
  pendingPairings: WhatsAppLinkedPairingRequest[];
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

async function parseSummary(response: Response): Promise<WhatsAppLinkedSummary> {
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
}

export async function fetchWhatsAppLinkedSummary(accessToken: string): Promise<WhatsAppLinkedSummary> {
  const response = await fetch('/api/integrations/whatsapp/linked', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseSummary(response);
}

export async function updateWhatsAppLinkedPolicy(input: {
  accessToken: string;
  dmPolicy: WhatsAppDmPolicy;
  allowFrom: string[];
}): Promise<WhatsAppLinkedSummary> {
  const response = await fetch('/api/integrations/whatsapp/linked/policy', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      dmPolicy: input.dmPolicy,
      allowFrom: input.allowFrom,
    }),
  });
  return parseSummary(response);
}

export async function startWhatsAppLinkedGateway(input: {
  accessToken: string;
  forceQr?: boolean;
  resetAuth?: boolean;
}): Promise<WhatsAppLinkedSummary> {
  const response = await fetch('/api/integrations/whatsapp/linked/gateway/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      forceQr: input.forceQr !== false,
      resetAuth: input.resetAuth === true,
    }),
  });
  return parseSummary(response);
}

export async function stopWhatsAppLinkedGateway(accessToken: string): Promise<WhatsAppLinkedSummary> {
  const response = await fetch('/api/integrations/whatsapp/linked/gateway/stop', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return parseSummary(response);
}

export async function approveWhatsAppLinkedPairing(input: {
  accessToken: string;
  code: string;
}): Promise<WhatsAppLinkedSummary> {
  const response = await fetch(`/api/integrations/whatsapp/linked/pairings/${encodeURIComponent(input.code)}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
  return parseSummary(response);
}

export async function denyWhatsAppLinkedPairing(input: {
  accessToken: string;
  code: string;
}): Promise<WhatsAppLinkedSummary> {
  const response = await fetch(`/api/integrations/whatsapp/linked/pairings/${encodeURIComponent(input.code)}/deny`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
  return parseSummary(response);
}
