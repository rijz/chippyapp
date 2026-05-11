# Agent Runtime Contracts

Last updated: February 14, 2026

## Locked contract versions
- `provider`: 1
- `tool`: 1
- `storage`: 1
- `policy`: 2

Source of truth:
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/contracts/runtimeContracts.js`

## Startup guardrails
Runtime creation now validates contracts before execution:
- provider registry shape and provider IDs
- tool registry shape and tool side-effect values
- storage router adapter surface (`saveRun/loadRun/lookupLead` and approval action methods)

Guard implementation:
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/contracts/contractGuards.js`

## Policy contract scope
The policy object is now treated as a strict contract with these required fields:
- `approvalMode`
- `fallbackMode`
- `maxToolCallsPerRun`
- `maxWriteActionsPerRun`
- `allowedToolScopes`
- `quietHours`

Schema:
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/schemas.js`

