export const taskSchema = {
  type: 'object',
  required: ['title', 'objective', 'agentRole'],
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    title: { type: 'string', minLength: 1 },
    objective: { type: 'string', minLength: 1 },
    agentRole: { type: 'string', enum: ['researcher', 'planner', 'executor', 'reviewer'] },
    acceptanceCriteria: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

export const planSchema = {
  type: 'object',
  required: ['tasks'],
  additionalProperties: true,
  properties: {
    tasks: {
      type: 'array',
      minItems: 1,
      items: taskSchema,
    },
  },
};

export const workerOutputSchema = {
  type: 'object',
  required: ['summary', 'deliverables', 'risks', 'questions', 'nextActions'],
  additionalProperties: true,
  properties: {
    summary: { type: 'string' },
    deliverables: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
    nextActions: { type: 'array', items: { type: 'string' } },
  },
};

export const reviewerOutputSchema = {
  type: 'object',
  required: ['status', 'score', 'feedback', 'missing'],
  additionalProperties: true,
  properties: {
    status: { type: 'string', enum: ['approved', 'revise'] },
    score: { type: 'number', minimum: 0, maximum: 1 },
    feedback: { type: 'array', items: { type: 'string' } },
    missing: { type: 'array', items: { type: 'string' } },
  },
};

export const policySchema = {
  type: 'object',
  required: [
    'approvalMode',
    'fallbackMode',
    'maxToolCallsPerRun',
    'maxWriteActionsPerRun',
    'allowedToolScopes',
    'quietHours',
  ],
  additionalProperties: true,
  properties: {
    approvalMode: { type: 'string', enum: ['AUTO', 'REVIEW_REQUIRED', 'BLOCKED'] },
    fallbackMode: { type: 'string', enum: ['permissive', 'strict'] },
    maxToolCallsPerRun: { type: 'integer', minimum: 1 },
    maxWriteActionsPerRun: { type: 'integer', minimum: 1 },
    allowedToolScopes: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', enum: ['none', 'read', 'write'] },
    },
    quietHours: {
      type: 'object',
      additionalProperties: true,
      properties: {
        enabled: { type: 'boolean' },
        startHour: { type: 'integer', minimum: 0, maximum: 23 },
        endHour: { type: 'integer', minimum: 0, maximum: 23 },
        timezone: { type: ['string', 'null'] },
      },
    },
  },
};

export const runRecordSchema = {
  type: 'object',
  required: [
    'schemaVersion',
    'id',
    'status',
    'goal',
    'policy',
    'provider',
    'tooling',
    'plan',
    'outputs',
    'review',
    'verification',
    'startedAt',
    'endedAt',
    'stepsUsed',
    'events',
  ],
  additionalProperties: true,
  properties: {
    schemaVersion: { type: 'integer', minimum: 1 },
    id: { type: 'string' },
    status: { type: 'string' },
    goal: { type: 'string' },
    policy: policySchema,
    provider: {
      type: 'object',
      required: ['id', 'name', 'model'],
      additionalProperties: true,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        model: { type: ['string', 'null'] },
      },
    },
    tooling: {
      type: 'object',
      required: ['contractVersion', 'availableTools', 'toolCalls'],
      additionalProperties: true,
      properties: {
        contractVersion: { type: 'integer', minimum: 1 },
        availableTools: { type: 'array' },
        toolCalls: { type: 'array' },
      },
    },
    plan: { type: 'array' },
    outputs: { type: 'array' },
    review: reviewerOutputSchema,
    verification: {
      type: 'object',
      required: ['passed', 'findings', 'score'],
      additionalProperties: true,
      properties: {
        passed: { type: 'boolean' },
        findings: { type: 'array', items: { type: 'string' } },
        score: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    startedAt: { type: 'string' },
    endedAt: { type: 'string' },
    stepsUsed: { type: 'integer', minimum: 0 },
    events: { type: 'array' },
  },
};
