import assert from 'node:assert/strict';
import test from 'node:test';
import { createBdlProcessor } from '../src/bdl/processor.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const applyFilters = (rows, filters) => {
  return rows.filter((row) => {
    return filters.every((filter) => {
      const value = row?.[filter.field];
      if (filter.op === 'eq') return value === filter.value;
      if (filter.op === 'gte') return value >= filter.value;
      if (filter.op === 'lte') return value <= filter.value;
      return true;
    });
  });
};

const sortRows = (rows, orderConfig) => {
  if (!orderConfig) return rows;
  const { field, ascending } = orderConfig;
  const sorted = [...rows].sort((a, b) => {
    if (a?.[field] < b?.[field]) return -1;
    if (a?.[field] > b?.[field]) return 1;
    return 0;
  });
  return ascending === false ? sorted.reverse() : sorted;
};

class MockQuery {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.action = 'select';
    this.filters = [];
    this.orderConfig = null;
    this.limitCount = null;
    this.selectOptions = null;
    this.updateValues = null;
    this.returningColumns = '*';
  }

  select(columns = '*', options = undefined) {
    if (this.action === 'update') {
      this.returningColumns = columns;
      this.selectOptions = options || null;
      return this;
    }
    this.action = 'select';
    this.returningColumns = columns;
    this.selectOptions = options || null;
    return this;
  }

  update(values) {
    this.action = 'update';
    this.updateValues = values;
    return this;
  }

  insert(payload) {
    const rows = this.state.tables[this.table] || [];
    const nextRows = Array.isArray(payload) ? payload : [payload];

    if (this.table === 'bdl_jobs') {
      for (const row of nextRows) {
        if (this.state.duplicateIdempotencyKeys.has(row.idempotency_key)) {
          this.state.duplicateInsertAttempts.push(row.idempotency_key);
          return Promise.resolve({ data: null, error: { code: '23505' } });
        }
      }
    }

    for (const row of nextRows) {
      rows.push(clone(row));
      this.state.insertedRows.push({ table: this.table, row: clone(row) });
    }

    return Promise.resolve({ data: clone(nextRows), error: null });
  }

  eq(field, value) {
    this.filters.push({ op: 'eq', field, value });
    return this;
  }

  gte(field, value) {
    this.filters.push({ op: 'gte', field, value });
    return this;
  }

  lte(field, value) {
    this.filters.push({ op: 'lte', field, value });
    return this;
  }

  order(field, { ascending = true } = {}) {
    this.orderConfig = { field, ascending };
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  async single() {
    const result = await this._execute();
    if (result.error) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length !== 1) {
      return { data: null, error: { code: 'PGRST116' } };
    }
    return { data: rows[0], error: null };
  }

  async maybeSingle() {
    const result = await this._execute();
    if (result.error) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length === 0) return { data: null, error: null };
    return { data: rows[0], error: null };
  }

  then(resolve, reject) {
    this._execute().then(resolve, reject);
  }

  async _execute() {
    const rows = this.state.tables[this.table] || [];

    if (this.action === 'select') {
      let selected = applyFilters(rows, this.filters);
      selected = sortRows(selected, this.orderConfig);
      if (Number.isInteger(this.limitCount)) {
        selected = selected.slice(0, this.limitCount);
      }

      if (this.selectOptions?.head) {
        return { data: null, count: selected.length, error: null };
      }

      return { data: clone(selected), error: null };
    }

    if (this.action === 'update') {
      let selected = applyFilters(rows, this.filters);

      const isClaimOperation = this.table === 'bdl_jobs'
        && this.updateValues?.status === 'running'
        && this.filters.some((item) => item.field === 'status' && item.value === 'queued');

      if (isClaimOperation) {
        selected = selected.filter((row) => !this.state.nonClaimableJobIds.has(row.id));
      }

      for (const row of selected) {
        Object.assign(row, this.updateValues);
      }

      for (const row of selected) {
        this.state.updatedRows.push({ table: this.table, row: clone(row), values: clone(this.updateValues) });
      }

      return { data: clone(selected), error: null };
    }

    return { data: null, error: null };
  }
}

const createMockSupabase = ({
  jobs = [],
  events = [],
  skillSubscriptions = [],
  duplicateIdempotencyKeys = [],
  nonClaimableJobIds = []
} = {}) => {
  const state = {
    tables: {
      bdl_jobs: clone(jobs),
      bdl_events: clone(events),
      skill_subscriptions: clone(skillSubscriptions),
      bookings: [],
      leads: [],
      chat_sessions: []
    },
    duplicateIdempotencyKeys: new Set(duplicateIdempotencyKeys),
    nonClaimableJobIds: new Set(nonClaimableJobIds),
    insertedRows: [],
    updatedRows: [],
    duplicateInsertAttempts: []
  };

  const supabaseAdmin = {
    from(table) {
      return new MockQuery(table, state);
    },
    auth: {
      admin: {
        async getUserById() {
          return { data: { user: { email: 'owner@example.com' } }, error: null };
        }
      }
    }
  };

  return { supabaseAdmin, state };
};

const makeProcessor = (supabaseAdmin, emailService) => {
  return createBdlProcessor({
    supabaseAdmin,
    emailService,
    fetchKnowledgeBase: async () => ({}),
    getBusinessHoursForDate: () => null,
    parseHoursRange: () => null,
    isWithinBusinessHours: () => true,
    logger: {
      error: () => {},
      warn: () => {},
      log: () => {}
    }
  });
};

test('processBdlJobs skips jobs that cannot be claimed (race-safe claim)', async () => {
  const pastIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const futureStartIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { supabaseAdmin, state } = createMockSupabase({
    jobs: [{
      id: 'job-1',
      tenant_id: 'tenant-1',
      type: 'appointment-reminder',
      execute_at: pastIso,
      status: 'queued',
      payload: {
        start_at: futureStartIso,
        customer: { name: 'Ada', email: 'ada@example.com' }
      },
      idempotency_key: 'job-1:idem'
    }],
    nonClaimableJobIds: ['job-1']
  });

  const reminderCalls = [];
  const processor = makeProcessor(supabaseAdmin, {
    async sendAppointmentReminder(...args) {
      reminderCalls.push(args);
    },
    async sendDailyReport() {},
    async sendWeeklyReport() {}
  });

  await processor.processBdlJobs();

  assert.equal(reminderCalls.length, 0);
  assert.equal(state.tables.bdl_jobs[0].status, 'queued');
  assert.equal(state.updatedRows.length, 0);
});

test('processBdlEvents tolerates duplicate idempotency keys and still enqueues non-duplicate jobs', async () => {
  const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { supabaseAdmin, state } = createMockSupabase({
    events: [{
      id: 'evt-1',
      tenant_id: 'tenant-1',
      type: 'booking.created',
      occurred_at: new Date().toISOString(),
      payload: {
        booking_id: 'booking-1',
        start_at: startAt,
        customer: { name: 'Jules', email: 'jules@example.com' },
        service: 'Consultation'
      }
    }],
    duplicateIdempotencyKeys: ['evt-1:appointment-reminder:24h']
  });

  const processor = makeProcessor(supabaseAdmin, {
    async sendAppointmentReminder() {},
    async sendDailyReport() {},
    async sendWeeklyReport() {}
  });

  await processor.processBdlEvents();

  assert.deepEqual(state.duplicateInsertAttempts, ['evt-1:appointment-reminder:24h']);
  assert.equal(state.tables.bdl_jobs.length, 1);
  assert.equal(state.tables.bdl_jobs[0].idempotency_key, 'evt-1:appointment-reminder:2h');
});

test('processBdlJobs processes a queued job once and does not re-run completed jobs', async () => {
  const pastIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const futureStartIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { supabaseAdmin, state } = createMockSupabase({
    jobs: [{
      id: 'job-2',
      tenant_id: 'tenant-2',
      type: 'appointment-reminder',
      execute_at: pastIso,
      status: 'queued',
      payload: {
        start_at: futureStartIso,
        customer: { name: 'Mina', email: 'mina@example.com' }
      },
      idempotency_key: 'job-2:idem'
    }]
  });

  const reminderCalls = [];
  const processor = makeProcessor(supabaseAdmin, {
    async sendAppointmentReminder(...args) {
      reminderCalls.push(args);
    },
    async sendDailyReport() {},
    async sendWeeklyReport() {}
  });

  await processor.processBdlJobs();
  await processor.processBdlJobs();

  assert.equal(reminderCalls.length, 1);
  assert.equal(state.tables.bdl_jobs[0].status, 'completed');
});
