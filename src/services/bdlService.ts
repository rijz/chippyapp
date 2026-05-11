import { BusinessMemorySnapshot, TenantFaqEntry, BdlEventBase } from '../bdl/types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const safeJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
};

const getJson = async <T>(url: string): Promise<T | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return safeJson<T>(response);
  } catch {
    return null;
  }
};

const postJson = async (url: string, body: unknown): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body)
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const bdlService = {
  async getBusinessMemory(userId: string): Promise<BusinessMemorySnapshot | null> {
    const data = await getJson<{ memory?: BusinessMemorySnapshot }>(`/api/bdl/memory/${userId}`);
    return data?.memory || null;
  },

  async upsertBusinessMemory(memory: BusinessMemorySnapshot): Promise<boolean> {
    return postJson('/api/bdl/memory', memory);
  },

  async getTenantFaq(userId: string, limit = 100): Promise<TenantFaqEntry[]> {
    const clampedLimit = Math.max(50, Math.min(200, Math.floor(limit || 0))) || 100;
    const data = await getJson<{ faq?: TenantFaqEntry[] }>(`/api/bdl/faq/${userId}?limit=${clampedLimit}`);
    return data?.faq || [];
  },

  async addTenantFaq(entry: TenantFaqEntry): Promise<boolean> {
    return postJson('/api/bdl/faq', entry);
  },

  async emitEvent(event: BdlEventBase): Promise<boolean> {
    return postJson('/api/bdl/events', event);
  },

  async getSkillSubscriptions(userId: string): Promise<Array<{ skill_id: string; status: string }>> {
    const data = await getJson<{ skills?: Array<{ skill_id: string; status: string }> }>(`/api/bdl/skills/${userId}`);
    return data?.skills || [];
  },

  async upsertSkillSubscription(payload: { tenantId: string; skillId: string; status: 'active' | 'disabled'; config?: Record<string, unknown> }): Promise<boolean> {
    return postJson('/api/bdl/skills', payload);
  }
};
