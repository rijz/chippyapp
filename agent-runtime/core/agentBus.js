import { createId, nowIso } from './utils.js';

export class AgentBus {
  constructor() {
    this.events = [];
    this.subscribers = new Set();
  }

  publish(type, payload = {}) {
    const event = {
      id: createId('evt'),
      type,
      at: nowIso(),
      payload,
    };

    this.events.push(event);
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (error) {
        // Subscriber failures should never break orchestrator flow.
      }
    }

    return event;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getEvents() {
    return [...this.events];
  }
}
