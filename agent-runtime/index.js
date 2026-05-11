import { createDefaultProviderRegistry } from './providers/createDefaultRegistry.js';
import { ConstrainedAgentRuntime } from './core/runtime.js';
import { RunStore } from './store/runStore.js';
import { createDefaultToolRegistry } from './tools/defaultTools.js';
import { createStorageRouter } from './storage/storageRouter.js';
import { assertRuntimeContracts } from './contracts/contractGuards.js';
import { getRuntimeContractVersions } from './contracts/runtimeContracts.js';

export { ProviderRegistry } from './core/providerRegistry.js';
export { ConstrainedAgentRuntime } from './core/runtime.js';
export { RunStore } from './store/runStore.js';
export { createDefaultProviderRegistry } from './providers/createDefaultRegistry.js';
export { ToolRegistry } from './tools/toolRegistry.js';
export { createDefaultToolRegistry } from './tools/defaultTools.js';
export { StorageRouter, createStorageRouter } from './storage/storageRouter.js';
export { SqliteStorageAdapter } from './storage/sqliteStorageAdapter.js';
export { SupabaseStorageAdapter } from './storage/supabaseStorageAdapter.js';
export { getRuntimeContractVersions, RUNTIME_CONTRACTS } from './contracts/runtimeContracts.js';
export {
  assertRuntimeContracts,
  assertProviderRegistryContract,
  assertToolRegistryContract,
  assertStorageContract,
} from './contracts/contractGuards.js';

export function createDefaultAgentRuntime(options = {}) {
  const providerRegistry = options.providerRegistry || createDefaultProviderRegistry();
  const storage = options.storage || createStorageRouter({
    backend: options.storageBackend,
    runDir: options.runDir,
    dbPath: options.dbPath,
    supabaseUrl: options.supabaseUrl,
    supabaseServiceRoleKey: options.supabaseServiceRoleKey,
  });
  const toolRegistry = options.toolRegistry || createDefaultToolRegistry({ storage });
  const runStore = options.runStore || new RunStore({
    runDir: options.runDir,
    storage,
    storageBackend: options.storageBackend,
    dbPath: options.dbPath,
    supabaseUrl: options.supabaseUrl,
    supabaseServiceRoleKey: options.supabaseServiceRoleKey,
  });
  const contracts = getRuntimeContractVersions();
  assertRuntimeContracts({
    providerRegistry,
    toolRegistry,
    storage,
  });

  return new ConstrainedAgentRuntime({
    providerRegistry,
    toolRegistry,
    runStore,
    limits: options.limits,
    policy: options.policy,
    onEvent: options.onEvent,
    contracts,
  });
}
