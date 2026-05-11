import { createAjv, formatValidationErrors } from '../core/jsonValidation.js';

export const SIDE_EFFECT_LEVELS = new Set(['none', 'read', 'write']);

function requireField(obj, field, toolName) {
  if (obj?.[field] === undefined || obj?.[field] === null) {
    throw new Error(`Tool \"${toolName}\" is missing required field: ${field}`);
  }
}

function ensureFunction(value, field, toolName) {
  if (typeof value !== 'function') {
    throw new Error(`Tool \"${toolName}\" must provide function field: ${field}`);
  }
}

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.ajv = createAjv();
  }

  register(definition) {
    const toolName = definition?.name || '<unknown>';

    requireField(definition, 'name', toolName);
    requireField(definition, 'inputSchema', toolName);
    requireField(definition, 'outputSchema', toolName);
    requireField(definition, 'sideEffect', toolName);
    requireField(definition, 'supportsDryRun', toolName);
    requireField(definition, 'idempotencyKey', toolName);
    requireField(definition, 'handler', toolName);

    if (!SIDE_EFFECT_LEVELS.has(definition.sideEffect)) {
      throw new Error(`Tool \"${toolName}\" has invalid sideEffect: ${definition.sideEffect}`);
    }

    ensureFunction(definition.idempotencyKey, 'idempotencyKey', toolName);
    ensureFunction(definition.handler, 'handler', toolName);

    const validateInput = this.ajv.compile(definition.inputSchema);
    const validateOutput = this.ajv.compile(definition.outputSchema);

    this.tools.set(definition.name, {
      name: definition.name,
      description: definition.description || '',
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      sideEffect: definition.sideEffect,
      supportsDryRun: Boolean(definition.supportsDryRun),
      idempotencyKey: definition.idempotencyKey,
      sourceModule: definition.sourceModule || null,
      handler: definition.handler,
      validateInput,
      validateOutput,
    });
  }

  get(name) {
    return this.tools.get(name) || null;
  }

  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      sideEffect: tool.sideEffect,
      supportsDryRun: tool.supportsDryRun,
      sourceModule: tool.sourceModule,
    }));
  }

  async execute(name, { input = {}, context = {}, dryRun = true } = {}) {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    if (!dryRun && !tool.supportsDryRun) {
      throw new Error(`Tool \"${name}\" does not support non-dry-run mode yet`);
    }

    if (!tool.validateInput(input)) {
      throw new Error(`Tool "${name}" input validation failed: ${formatValidationErrors(tool.validateInput.errors || [])}`);
    }

    const idempotencyKey = tool.idempotencyKey({ input, context, dryRun });

    const result = await tool.handler({
      input,
      context,
      dryRun,
      idempotencyKey,
      metadata: {
        toolName: name,
        sideEffect: tool.sideEffect,
      },
    });

    if (!tool.validateOutput(result)) {
      throw new Error(`Tool "${name}" output validation failed: ${formatValidationErrors(tool.validateOutput.errors || [])}`);
    }

    return {
      tool: name,
      sideEffect: tool.sideEffect,
      dryRun,
      idempotencyKey,
      result,
    };
  }
}
