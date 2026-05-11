function ensureFunction(obj, name, field) {
  if (!obj || typeof obj[field] !== 'function') {
    throw new Error(`${name} contract invalid: missing function "${field}"`);
  }
}

function ensureObject(obj, name) {
  if (!obj || typeof obj !== 'object') {
    throw new Error(`${name} contract invalid: expected object`);
  }
}

export function assertProviderRegistryContract(providerRegistry) {
  ensureObject(providerRegistry, 'ProviderRegistry');
  ensureFunction(providerRegistry, 'ProviderRegistry', 'list');
  ensureFunction(providerRegistry, 'ProviderRegistry', 'get');
  ensureFunction(providerRegistry, 'ProviderRegistry', 'create');

  const providers = providerRegistry.list();
  if (!Array.isArray(providers)) {
    throw new Error('ProviderRegistry contract invalid: list() must return an array');
  }

  for (const provider of providers) {
    if (!provider?.id || typeof provider.id !== 'string') {
      throw new Error('ProviderRegistry contract invalid: provider.id must be a non-empty string');
    }
  }
}

export function assertToolRegistryContract(toolRegistry) {
  ensureObject(toolRegistry, 'ToolRegistry');
  ensureFunction(toolRegistry, 'ToolRegistry', 'list');
  ensureFunction(toolRegistry, 'ToolRegistry', 'get');
  ensureFunction(toolRegistry, 'ToolRegistry', 'execute');

  const tools = toolRegistry.list();
  if (!Array.isArray(tools)) {
    throw new Error('ToolRegistry contract invalid: list() must return an array');
  }

  for (const tool of tools) {
    if (!tool?.name || typeof tool.name !== 'string') {
      throw new Error('ToolRegistry contract invalid: tool.name must be a non-empty string');
    }
    if (!tool?.sideEffect || !['none', 'read', 'write'].includes(tool.sideEffect)) {
      throw new Error(`ToolRegistry contract invalid: tool "${tool?.name || '<unknown>'}" has invalid sideEffect`);
    }
  }
}

export function assertStorageContract(storage) {
  ensureObject(storage, 'Storage');
  ensureFunction(storage, 'Storage', 'saveRun');
  ensureFunction(storage, 'Storage', 'loadRun');
  ensureFunction(storage, 'Storage', 'lookupLead');
  ensureFunction(storage, 'Storage', 'enqueuePendingToolCall');
  ensureFunction(storage, 'Storage', 'listActions');
  ensureFunction(storage, 'Storage', 'getAction');
  ensureFunction(storage, 'Storage', 'decideAction');
  ensureFunction(storage, 'Storage', 'markActionExecution');
  ensureFunction(storage, 'Storage', 'claimActionExecution');
  ensureFunction(storage, 'Storage', 'finalizeActionExecution');
  ensureFunction(storage, 'Storage', 'patchRunToolCall');
}

export function assertRuntimeContracts({ providerRegistry, toolRegistry, storage }) {
  assertProviderRegistryContract(providerRegistry);
  assertToolRegistryContract(toolRegistry);
  assertStorageContract(storage);
}
