# Agent Runtime Progress and Next Plan

Last updated: February 15, 2026

## Milestone status
- Phase 1 (Agent Work Runtime): Completed (CLI scope).
- Phase 2 (Safety/Governance core): Completed (runtime policy kernel + reason-coded enforcement).
- Phase 3 (Product Integration): In progress (backend API + in-app chat console baseline completed).
- Contract lock + baseline benchmark: Completed.

## Vision
Build a constrained multi-agent system (OpenClaw-inspired, business-focused) where users choose LLM providers and agents collaborate to produce execution-ready solutions safely.

## Architecture direction (updated)
- Keep agent execution local-first and installable on a single machine.
- Treat external platforms (Supabase, hosted APIs) as optional adapters, not system dependencies.
- Use plugin-style boundaries:
  - `provider registry` for LLMs
  - `tool registry` for agent actions
  - `storage router` for backend portability (`sqlite | supabase | auto`)

## What is completed

### Runtime foundation
- Added constrained orchestrator with flow:
  - `supervisor -> worker agents -> final reviewer -> verifier`
- Added structured event bus and run-level audit logging.
- Added verifier gate to determine `completed` vs `needs_revision`.
- Added role guardrail so `reviewer` is reserved for final verification (prevents false reviewer loops during task execution).
- Added run artifact schema versioning (`schemaVersion: 1`).
- Added JSON-schema validation for plan/output/review/policy/run-record stages.
- Added explicit runtime contract versions attached to run artifacts.

### Provider architecture
- Added provider registry with capabilities metadata.
- Added providers:
  - `gemini.flash`
  - `gemini.pro`
  - `openai.default`
  - `ollama.local`
  - `local.heuristic` (safe fallback)
- Default provider is now `gemini.flash`.

### CLI control plane
- Added CLI command surface:
  - `provider list`
  - `tool list`
  - `agent run --goal "..."`
  - `action list --status ...`
  - `action process --action-id ... --decision approve|deny`
- Added JSON output support and runtime limits (`maxAgents`, `maxSteps`, `minReviewScore`).
- Added policy flags:
  - `--approval-mode`
  - `--max-tool-calls`
  - `--max-write-actions`
  - `--allowed-scopes`
  - `--quiet-hours`
  - `--no-fallback`
  - `--execute-write`
  - `--fixture`
  - `--user-id` / `--tenant-id` / `--api-base-url`

### Tooling prep layer
- Added typed `ToolRegistry` contract with required fields:
  - `name`
  - `inputSchema`
  - `outputSchema`
  - `sideEffect`
  - `supportsDryRun`
  - `idempotencyKey`
- Added initial tool set with source-module mapping:
  - `lead.lookup`
  - `followup.compose`
  - `followup.send_preview`
  - `booking.check_slots`
  - `email.inbox_list`
  - `email.thread_classify`
  - `email.reply_compose`
  - `email.reply_send`
  - `web.search`
  - `browser.fetch_page`
  - `fs.list`
  - `fs.read`
  - `fs.write` (default disabled until explicitly enabled)
  - `shell.exec` (default disabled + allowlist gated)
- Added deterministic fixture for repeatable tests:
  - `/Users/rijesh/Documents/GitHub/chippyapp/fixtures/agent-runtime/tenant-lead-fixture.json`
- Added tool input/output validation enforcement in `ToolRegistry` using JSON schemas.
- Added capability controls and guardrails:
  - bounded file root (`CHIPPY_TOOL_FS_ROOT`)
  - feature toggles for web/browser/fs/shell tools
  - shell allowlist + optional full-allow override
  - CLI direct tool execution: `chippy tool exec <tool-name>`
- Added iterative executor loop (tool-driven):
  - for research/question goals, runtime now runs a bounded LLM loop that chooses tools step-by-step
  - each loop turn can call one tool (`web.search`, `browser.fetch_page`, `fs.*`, `shell.exec`, etc.) through policy-gated execution
  - loop stops on `final` answer or step budget exhaustion
  - execution metadata is stored under `execution.iterativeExecutor` in run records
- Added initial tool execution workflow in runtime:
  - goal-signal based dry-run tool orchestration
  - retry support (2 attempts/tool)
  - tool call audit entries in `tooling.toolCalls`
- Added real-connector behavior with safe fallback:
  - `lead.lookup` uses storage router (`sqlite -> supabase -> fixture`, backend-dependent).
  - `booking.check_slots` uses backend `/api/calendar/slots` when API base URL + tenant are available, otherwise fixture.
  - `followup.send_preview` supports live send request (non-dry-run) via `emailService`, gated by policy + credentials.

### Approval queue and resume loop (Phase 1 complete)
- Added persistent `approval_actions` queue in SQLite.
- Runtime now enqueues write actions in `REVIEW_REQUIRED` mode with stable idempotency keys.
- Added duplicate suppression for repeated write intents (deterministic replay protection).
- Added `action process` flow to approve/deny and execute queued actions without rerunning planner/worker stages.
- Added run tool-call patching so original run artifacts are updated in place after approval decisions.

### Email process vertical (new)
- Added email-focused workflow path (`wantsEmail` goal signal) in runtime orchestration.
- Added storage-backed email inbox tables (`customer_email_threads`, `customer_email_messages`) with fixture seeding.
- Added CLI command:
  - `email process --fixture ... --limit ... [--execute-write]`
- Added fixture:
  - `/Users/rijesh/Documents/GitHub/chippyapp/fixtures/agent-runtime/tenant-email-fixture.json`
- Added Gmail connector path (OpenClaw-inspired event-driven readiness):
  - `email.inbox_list` can pull unread messages from Gmail when `CHIPPY_EMAIL_SOURCE=gmail`.
  - inbound Gmail messages are upserted into local storage for auditability and replay.
  - `email.reply_send` can send threaded Gmail replies when `CHIPPY_EMAIL_REPLY_TRANSPORT=gmail`.
  - Gmail replies now mark source inbound messages as read (remove `UNREAD`) to prevent duplicate replay loops.
  - fallback remains `storage|fixture` inbox + `resend` transport when Gmail is not configured.
  - Added Gmail Pub/Sub webhook trigger endpoint:
    - `POST /api/integrations/gmail/pubsub/webhook`
    - token + subscription allowlist + workspace mapping support
    - duplicate event suppression (TTL window) before run dispatch
  - Added optional gateway email poll loop:
    - `CHIPPY_GATEWAY_AUTO_RUN_EMAIL=true`
    - `CHIPPY_GATEWAY_EMAIL_POLL_SECONDS=...`
    - runs the same email workflow as background maintenance when Pub/Sub is not available.

### Policy kernel hardening (Phase 2 core complete)
- Added policy enforcement for:
  - write scope allowlist (`allowedToolScopes`)
  - quiet-hours write blocking (`quietHours`)
  - per-run write limit (`maxWriteActionsPerRun`)
- Added deterministic policy reason codes on blocked calls:
  - `POLICY_SCOPE_BLOCK`
  - `POLICY_QUIET_HOURS_BLOCK`
  - `POLICY_WRITE_LIMIT_BLOCK`
  - `POLICY_APPROVAL_BLOCK`
  - `POLICY_DUPLICATE_SUPPRESSED`

### Reliability refactor (post-phase hardening)
- Added run status reconciliation:
  - `awaiting_approval` when pending write approvals exist.
  - automatic transition to `completed` when approvals are resolved and verifier passed.
- Added concurrency-safe approval processing transitions:
  - `approved -> executing -> executed|failed`
  - claim/finalize execution flow prevents double execution races.
- Added timezone-aware quiet-hours evaluation (uses context/tenant timezone when available).
- Added idempotency duplicate windowing (default 24h) to avoid permanent suppression for identical actions.

### Documentation and persistence
- Added runtime docs and env guidance.
- Added run artifact persistence to `.runs/agent-runtime/<run-id>.json`.
- Added storage router and local SQLite persistence with normalized schema.
- Added optional Supabase adapter for lead lookup (fallback when configured).
- Added CLI storage controls:
  - `--storage-backend auto|sqlite|supabase`
  - `--db-path /absolute/path/to/runtime.db`
- Added contract docs:
  - `/Users/rijesh/Documents/GitHub/chippyapp/docs/AGENT_RUNTIME_CONTRACTS.md`
- Added benchmark harness:
  - `/Users/rijesh/Documents/GitHub/chippyapp/scripts/benchmark-agent-runtime.js`
  - `npm run benchmark:agent-runtime`
- Added benchmark output docs:
  - `/Users/rijesh/Documents/GitHub/chippyapp/docs/AGENT_RUNTIME_BENCHMARK.md`

### In-app agent console (Phase 3 baseline)
- Added authenticated backend API endpoints for runtime control:
  - `GET /api/agent-runtime/providers`
  - `GET /api/agent-runtime/runs`
  - `GET /api/agent-runtime/runs/:runId`
  - `GET /api/agent-runtime/objectives`
  - `POST /api/agent-runtime/objectives`
  - `POST /api/agent-runtime/objectives/:objectiveId/run`
  - `GET /api/agent-runtime/soul`
  - `PUT /api/agent-runtime/soul`
  - `GET /api/agent-runtime/heartbeat`
  - `POST /api/agent-runtime/heartbeat/tick`
  - `POST /api/agent-runtime/chat`
  - `POST /api/integrations/whatsapp/twilio/webhook` (Twilio WhatsApp bridge)
  - `POST /api/integrations/gmail/pubsub/webhook` (Gmail Pub/Sub bridge)
  - `GET /api/agent-runtime/actions`
  - `POST /api/agent-runtime/actions/:actionId` (approve/deny + execute)
- Added in-app `Agent Console` page with:
  - provider selection
  - approval mode selection
  - live-write request toggle
  - mission queue (create objective, run objective, track objective status)
  - soul editor (identity, mission, principles)
  - heartbeat panel (pulse + queue health metrics)
  - goal chat input -> runtime execution
  - pending approval queue with approve/deny controls
  - latest run summary (status, plan, review, findings)
- Added frontend runtime service client:
  - `/Users/rijesh/Documents/GitHub/chippyapp/src/services/agentRuntimeService.ts`
- Added app routing and sidebar navigation entry:
  - `/Users/rijesh/Documents/GitHub/chippyapp/src/pages/AgentConsole.tsx`
  - `/Users/rijesh/Documents/GitHub/chippyapp/src/App.tsx`
  - `/Users/rijesh/Documents/GitHub/chippyapp/src/components/layout/AppLayout.tsx`
- Added runtime regression test script:
  - `npm run test:agent-runtime`
  - `/Users/rijesh/Documents/GitHub/chippyapp/scripts/test-agent-runtime.js`
- Added WhatsApp webhook bridge behavior:
  - tenant routing via `WHATSAPP_NUMBER_WORKSPACE_MAP`
  - Twilio signature validation (`X-Twilio-Signature`)
  - command-mode controls (`/status`, `/actions`, `/approve`, `/deny`) for OpenClaw-style channel operations
  - inbound WhatsApp messages now execute through the same agent runtime policy/soul/heartbeat pipeline
- Added WhatsApp Linked Device runner (`Baileys`) for OpenClaw-style local pairing:
  - `npm run whatsapp:linked -- --workspace-id <workspace-id> --pair-phone +<phone>`
  - supports owner commands + direct message-driven runs without Twilio webhook dependency
- Channel integration principle adopted:
  - linked-device/session-first connectors as primary path
  - external APIs used as fallback path only
- Added in-app WhatsApp Linked setup APIs and UI:
  - `GET /api/integrations/whatsapp/linked`
  - `PUT /api/integrations/whatsapp/linked/policy`
  - `POST /api/integrations/whatsapp/linked/gateway/start`
  - `POST /api/integrations/whatsapp/linked/gateway/stop`
  - `POST /api/integrations/whatsapp/linked/pairings/:code/approve`
  - `POST /api/integrations/whatsapp/linked/pairings/:code/deny`
  - Integrations page now includes QR pairing controls, DM policy (`pairing`/`allowlist`), allowlist editor, and pairing approval queue.
- Added OpenClaw-style channel/pairing CLI controls:
  - `chippy channels login --channel whatsapp --workspace-id <id> [--relink]`
  - `chippy channels status --channel whatsapp --workspace-id <id>`
  - `chippy channels stop --channel whatsapp --workspace-id <id>`
  - `chippy pairing list whatsapp --workspace-id <id>`
  - `chippy pairing approve whatsapp <CODE> --workspace-id <id>`
  - `chippy pairing deny whatsapp <CODE> --workspace-id <id>`
- Hardened pairing workflow for OpenClaw parity:
  - default pending pairing cap reduced to `3` (`WHATSAPP_PAIRING_PENDING_LIMIT`)
  - repeated messages from already-pending numbers no longer re-send pairing prompts
  - auth reset now runs only once per explicit relink action (prevents reconnect reset loops)
  - DM policy enforcement now applies to Twilio webhook ingress too (same `pairing|allowlist` policy + pairing approval queue)
- Added always-on Gateway daemon + service supervision hooks (OpenClaw parity):
  - New daemon runner: `/Users/rijesh/Documents/GitHub/chippyapp/scripts/chippy-gateway.js`
  - Keeps linked WhatsApp workers alive and auto-restarts crashed workers
  - Records periodic runtime heartbeat ticks (default every 30 minutes)
  - Polls and executes pending business objectives while gateway is running
  - CLI controls:
    - `chippy gateway start|status|stop|restart`
    - `chippy gateway install|uninstall` (launchd on macOS, systemd user service on Linux)
  - In-app gateway APIs for daemon lifecycle:
    - `GET /api/integrations/gateway/status`
    - `POST /api/integrations/gateway/start`
    - `POST /api/integrations/gateway/stop`
    - `POST /api/integrations/gateway/restart`
    - `GET /api/integrations/gateway/service/status`
    - `POST /api/integrations/gateway/service/install`
    - `POST /api/integrations/gateway/service/uninstall`
  - Integrations UI now controls the gateway daemon directly (start/stop/restart+relink) instead of spawning standalone channel workers.
  - Integrations UI now supports one-click 24/7 service install/uninstall status for local macOS/Linux setups.
  - API guardrails added for workspace isolation:
    - app-level gateway start/restart now scope to authenticated workspace only
    - stop/restart are blocked from UI when daemon is serving multiple workspaces (must use CLI)
  - Daemon/worker observability hardening:
    - WhatsApp status now reports daemon-managed worker state (`managedByGateway`, restart count/backoff)
    - gateway/worker stop paths now wait for process exit and escalate to `SIGKILL` if needed
  - Added Gateway Control plane (new):
    - backend APIs:
      - `GET /api/integrations/gateway/control/health`
      - `GET /api/integrations/gateway/control/logs?target=gateway|worker`
      - `POST /api/integrations/gateway/control/repair`
    - app page:
      - `/gateway` with health checks, live log tails, and one-click repair actions
  - Added system-ops reliability layer for 24/7 runtime:
    - watchdog daemon: `/Users/rijesh/Documents/GitHub/chippyapp/scripts/chippy-watchdog.js`
    - CLI watchdog lifecycle:
      - `chippy watchdog start|status|stop|restart`
      - `chippy watchdog install|uninstall`
    - CLI hardening + maintenance:
      - `chippy gateway doctor`
      - `chippy gateway rotate-logs`
      - `chippy backup create|list|restore`
    - shared maintenance module:
      - `/Users/rijesh/Documents/GitHub/chippyapp/scripts/runtime-maintenance.js`
    - alert sink behavior:
      - webhook delivery via `CHIPPY_ALERT_WEBHOOK_URL` when configured
      - local fallback alert persistence via `watchdog-alerts.log` when webhook is not configured

### Storage redesign (new)
Implemented local-first schema in:
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/storage/sqliteStorageAdapter.js`

Core tables:
- `workspaces`
- `provider_configs`
- `crm_contacts`
- `crm_bookings`
- `agent_runs`
- `agent_steps`
- `agent_tool_calls`
- `approval_actions`
- `agent_events`
- `schema_meta`

Key outcomes:
- `lead.lookup` now resolves via storage adapter (`sqlite -> supabase -> fixture`, based on mode).
- Run persistence is decoupled from file-only JSON and now written to both SQLite and JSON audit.
- Fixture leads are seeded into local SQLite for deterministic local testing.

## Implemented files
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/agentBus.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/agentFactory.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/providerRegistry.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/runtime.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/verifier.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/jsonValidation.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/schemas.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/providers/createDefaultRegistry.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/providers/geminiProvider.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/providers/openaiProvider.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/providers/ollamaProvider.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/providers/heuristicProvider.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/store/runStore.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/storage/storageRouter.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/storage/sqliteStorageAdapter.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/storage/supabaseStorageAdapter.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/toolRegistry.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/tools/defaultTools.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/bin/chippy.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/docs/agent-runtime-cli.md`
- `/Users/rijesh/Documents/GitHub/chippyapp/fixtures/agent-runtime/tenant-lead-fixture.json`
- `/Users/rijesh/Documents/GitHub/chippyapp/fixtures/agent-runtime/tenant-email-fixture.json`

## Verified runs (local)
- Confirmed provider listing works.
- Confirmed default Gemini flow works.
- Confirmed OpenAI provider registration and fallback behavior works when key is missing.
- Confirmed reviewer-role orchestration issue fixed (run now completes for simple goals).
- Confirmed runtime contract versions included in run records.
- Confirmed baseline benchmark pass:
  - latency p95: 14.44 ms
  - reliability: 100% (10/10)
  - duplicate suppression: pass
  - approval flow: pass
  - benchmark artifact: `/Users/rijesh/Documents/GitHub/chippyapp/docs/AGENT_RUNTIME_BENCHMARK.md`

Examples of generated run artifacts:
- `/Users/rijesh/Documents/GitHub/chippyapp/.runs/agent-runtime/run_9727d3ef-dac3-4212-b7ea-4caa11164938.json` (pre-fix behavior)
- `/Users/rijesh/Documents/GitHub/chippyapp/.runs/agent-runtime/run_f579fcda-85d7-4224-a790-f1f89abb909c.json` (post-fix behavior)

## Current gaps
1. Runtime chat is synchronous request/response; no streaming token/events UI yet.
2. Run history screen and searchable audit explorer are not implemented in app.
3. Live connector coverage is partial (booking/create-event, callback flows, and richer lead sources still pending).
4. No cost/token accounting dashboards across provider calls.
5. Plugin packaging is still runtime-internal modules (not yet installable plugin bundles).

## Next implementation plan

### Phase 1: Agent Work Runtime (next execution target)
Goal: move from orchestration prototype to business-ready agent execution loops.

Deliverables:
- Add write-safe action queue for `pending_review` tool calls.
- Add action replay endpoint/CLI command for approve/deny execution.
- Add deterministic conflict handling (idempotency replay + duplicate suppression).

Acceptance criteria:
- A `pending_review` run can be approved and resumed without rerunning full planning.
- Approval decisions are persisted and auditable.

Status: Completed (CLI scope)

### Phase 2: Safety and Governance
Goal: production-safe agent execution.

Deliverables:
- Approval gate model:
  - `AUTO`
  - `REVIEW_REQUIRED`
  - `BLOCKED`
- Policy kernel with tenant + plan limits:
  - max actions/run
  - allowed tool scopes
  - quiet-hours enforcement
- Strong fallback policy options:
  - permissive fallback
  - strict fail-fast (no fallback)

Acceptance criteria:
- Side-effecting actions require explicit approval when configured.
- Violations produce deterministic blocked status with reason codes.

Status: Core controls completed in runtime + CLI policy flags.

### Phase 3: Product Integration
Goal: make this accessible in app workflows.

Deliverables:
- Expose runtime via backend API endpoint(s).
- Add run history viewer (status, plan, outputs, verification).
- Add provider selection in account settings (per-tenant default).
- Add job runner mode for async long tasks.

Acceptance criteria:
- User can start a run from UI and monitor status without CLI.
- Runs are persisted and queryable by tenant.

## Immediate next tasks (execution order)
1. Expose approval action queue over backend API for UI inbox/reviewer workflow.
2. Wire additional live tools (`callback.request`, `booking.create_event`) with policy scopes.
3. Add token/cost telemetry fields to run artifacts.
4. Add provider/tool allowlists per tenant plan.
5. Expose runtime run history and action logs in product UI.

## Definition of done for this milestone
- A user can run one end-to-end business workflow agent (follow-up draft + approval + send-preview) with Gemini provider, full audit trail, and enforced guardrails.
