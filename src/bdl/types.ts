export type BdlEventSource = 'chat' | 'admin' | 'system' | 'api';

export interface BdlEventBase<TPayload = Record<string, unknown>> {
  id: string;
  tenantId: string;
  type: string;
  occurredAt: string; // ISO
  source: BdlEventSource;
  payload: TPayload;
}

export interface BookingPayload {
  bookingId: string;
  customer: {
    name?: string;
    email?: string;
    phone?: string;
  };
  service?: string;
  locationId?: string;
  startAt?: string;
  endAt?: string;
}

export interface CallbackPayload {
  requestId: string;
  customer: {
    name?: string;
    email?: string;
    phone?: string;
  };
  service?: string;
  requestedDatetime?: string;
  preferredTime?: string;
}

export interface FeedbackPayload {
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  rating?: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  comment?: string;
}

export interface SlotOpenedPayload {
  locationId?: string;
  startAt: string;
  endAt: string;
  service?: string;
}

export interface BusinessMemorySnapshot {
  tenantId: string;
  version: number;
  compiledAt: string;
  bmsText: string;
  sourceHash: string;
}

export interface TenantFaqEntry {
  tenantId: string;
  question: string;
  answer: string;
  source: 'approved' | 'correction' | 'auto';
  createdAt: string;
  lastUsedAt?: string;
  usageCount?: number;
}

export interface SkillPermissionRules {
  requiresMarketingConsent: boolean;
  channels: Array<'sms' | 'email' | 'in_app'>;
}

export interface SkillScheduleRule {
  offset?: string; // e.g., "-24h"
  cron?: string;   // optional
}

export interface SkillDefinition {
  id: string;
  name: string;
  version: string;
  triggers: string[];
  requiredData: string[];
  permissions: SkillPermissionRules;
  schedule?: SkillScheduleRule[];
  guardrails: string[];
  action: string;
}

export interface SkillSubscription {
  tenantId: string;
  skillId: string;
  status: 'active' | 'disabled';
  config?: Record<string, unknown>;
}

export interface JobRecord {
  id: string;
  tenantId: string;
  type: string;
  executeAt: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  payload: Record<string, unknown>;
  idempotencyKey: string;
}
