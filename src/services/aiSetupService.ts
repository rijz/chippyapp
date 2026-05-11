import { BusinessPlaybook, KnowledgeBaseData, OwnerCommandState } from '../types';

const parseError = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string') return data.error;
  } catch {
    // fallback below
  }
  return `Request failed (${response.status})`;
};

const authHeaders = (accessToken: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${accessToken}`,
});

export interface AiSetupStateResponse {
  setup: any | null;
  playbook: BusinessPlaybook | null;
  playbookMarkdown: string;
  recovery: {
    recoveredBookings: number;
    reactivatedLeads: number;
    needsOwner: number;
    recoveredRevenue: number;
    recent: any[];
  };
}

export async function fetchAiSetupState(accessToken: string): Promise<AiSetupStateResponse> {
  const response = await fetch('/api/ai-setup/state', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function createAiSetupDraft(input: {
  accessToken: string;
  businessUrl: string;
  knowledgeData: KnowledgeBaseData;
}): Promise<{
  setup: any;
  draft: KnowledgeBaseData;
  playbookPreview: any;
  playbookMarkdown: string;
  missingFields: string[];
}> {
  const response = await fetch('/api/ai-setup/draft', {
    method: 'POST',
    headers: authHeaders(input.accessToken),
    body: JSON.stringify({
      businessUrl: input.businessUrl,
      knowledgeData: input.knowledgeData,
    }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function approveAiSetup(input: {
  accessToken: string;
  setupId: string;
  knowledgeData: KnowledgeBaseData;
  phoneNumber?: string;
  bookingLink?: string;
}): Promise<{
  success: boolean;
  knowledgeData: KnowledgeBaseData;
  playbook: BusinessPlaybook;
  playbookMarkdown: string;
  ownerCommand: OwnerCommandState;
}> {
  const response = await fetch('/api/ai-setup/approve', {
    method: 'POST',
    headers: authHeaders(input.accessToken),
    body: JSON.stringify({
      setupId: input.setupId,
      knowledgeData: input.knowledgeData,
      phoneNumber: input.phoneNumber,
      bookingLink: input.bookingLink,
    }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function fetchCurrentPlaybook(accessToken: string): Promise<{ playbook: BusinessPlaybook; playbookMarkdown: string }> {
  const response = await fetch('/api/playbook/current', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function fetchRecoveryMetrics(accessToken: string): Promise<AiSetupStateResponse['recovery']> {
  const response = await fetch('/api/recovery/metrics', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}
