export const RUNTIME_CONTRACTS = Object.freeze({
  provider: 1,
  tool: 1,
  storage: 1,
  policy: 2,
});

export function getRuntimeContractVersions() {
  return { ...RUNTIME_CONTRACTS };
}

