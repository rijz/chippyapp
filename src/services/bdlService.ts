import { BusinessMemorySnapshot, TenantFaqEntry, BdlEventBase } from '../bdl/types';

export const bdlService = {
  async getBusinessMemory(userId: string): Promise<BusinessMemorySnapshot | null> {
    const response = await fetch(`/api/bdl/memory/${userId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.memory || null;
  },

  async upsertBusinessMemory(memory: BusinessMemorySnapshot): Promise<boolean> {
    const response = await fetch('/api/bdl/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memory)
    });
    return response.ok;
  },

  async getTenantFaq(userId: string, limit = 50): Promise<TenantFaqEntry[]> {
    const response = await fetch(`/api/bdl/faq/${userId}?limit=${limit}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data?.faq || [];
  },

  async addTenantFaq(entry: TenantFaqEntry): Promise<boolean> {
    const response = await fetch('/api/bdl/faq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    return response.ok;
  },

  async emitEvent(event: BdlEventBase): Promise<boolean> {
    const response = await fetch('/api/bdl/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    return response.ok;
  },

  async getSkillSubscriptions(userId: string): Promise<Array<{ skill_id: string; status: string }>> {
    const response = await fetch(`/api/bdl/skills/${userId}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data?.skills || [];
  },

  async upsertSkillSubscription(payload: { tenantId: string; skillId: string; status: 'active' | 'disabled'; config?: Record<string, unknown> }): Promise<boolean> {
    const response = await fetch('/api/bdl/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.ok;
  }
};
