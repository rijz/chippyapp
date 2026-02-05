import { BdlEventBase, BdlEventSource } from './types';

export const createEvent = <TPayload>(
  event: Omit<BdlEventBase<TPayload>, 'id' | 'occurredAt'> & {
    id?: string;
    occurredAt?: string;
  }
): BdlEventBase<TPayload> => {
  return {
    id: event.id || `evt_${Date.now()}`,
    occurredAt: event.occurredAt || new Date().toISOString(),
    tenantId: event.tenantId,
    type: event.type,
    source: event.source as BdlEventSource,
    payload: event.payload
  };
};
