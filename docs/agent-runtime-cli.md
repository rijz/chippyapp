# Agent Runtime + CLI (Initial Slice)

This adds a constrained multi-agent runtime that can:
- create a task plan from a goal,
- spawn role-based agents,
- coordinate through a structured event bus,
- run reviewer validation,
- persist an audit record for each run.

## Commands

```bash
npm run cli -- provider list
npm run cli -- tool list
npm run cli -- tool exec web.search --input '{"query":"current weather toronto","maxResults":3}'
npm run cli -- tool exec browser.fetch_page --input '{"url":"https://example.com"}'
npm run cli -- tool exec fs.list --input '{"path":".","recursive":false}'
npm run cli -- tool exec shell.exec --input '{"command":"date","args":[]}' --execute
npm run benchmark:agent-runtime
npm run cli -- agent run --goal "Design a tenant-safe follow-up automation"
npm run cli -- email process --fixture /Users/rijesh/Documents/GitHub/chippyapp/fixtures/agent-runtime/tenant-email-fixture.json --limit 2 --execute-write --approval-mode REVIEW_REQUIRED --storage-backend sqlite
npm run cli -- agent run --goal "Create callback recovery workflow" --provider gemini.flash
npm run cli -- agent run --goal "Draft reactivation campaign workflow" --provider openai.default
npm run cli -- agent run --goal "Create follow-up for lead" --fixture /Users/rijesh/Documents/GitHub/chippyapp/fixtures/agent-runtime/tenant-lead-fixture.json --lead-id lead-001 --json
npm run cli -- agent run --goal "Create follow-up for lead" --user-id <tenant-uuid> --execute-write --approval-mode AUTO
npm run cli -- agent run --goal "Re-engage old leads" --storage-backend sqlite --db-path /Users/rijesh/Documents/GitHub/chippyapp/.runs/agent-runtime/runtime.db
npm run cli -- action list --status pending_review --storage-backend sqlite
npm run cli -- action process --action-id action_xxx --decision approve --decided-by owner --storage-backend sqlite
npm run cli -- gateway start --workspace-id <workspace-uuid>
npm run cli -- gateway status
npm run cli -- gateway restart --workspace-id <workspace-uuid>
npm run cli -- gateway stop
npm run cli -- gateway install --workspace-id <workspace-uuid>
npm run cli -- gateway uninstall
npm run cli -- gateway doctor --workspace-id <workspace-uuid>
npm run cli -- gateway rotate-logs --workspace-id <workspace-uuid> --max-bytes 5242880 --keep 5
npm run cli -- watchdog start --workspace-id <workspace-uuid> --interval-seconds 60
npm run cli -- watchdog status
npm run cli -- watchdog restart --workspace-id <workspace-uuid> --interval-seconds 60
npm run cli -- watchdog stop
npm run cli -- watchdog install --workspace-id <workspace-uuid> --interval-seconds 60
npm run cli -- watchdog uninstall
npm run cli -- backup create --label nightly --workspace-id <workspace-uuid>
npm run cli -- backup list --limit 20
npm run cli -- backup restore --id <backup-id>
npm run cli -- channels login --channel whatsapp --workspace-id <workspace-uuid>
npm run cli -- channels status --channel whatsapp --workspace-id <workspace-uuid>
npm run cli -- channels stop --channel whatsapp --workspace-id <workspace-uuid>
npm run cli -- pairing list whatsapp --workspace-id <workspace-uuid>
npm run cli -- pairing approve whatsapp <CODE> --workspace-id <workspace-uuid>
npm run cli -- pairing deny whatsapp <CODE> --workspace-id <workspace-uuid>
npm run cli -- whatsapp send --to +14168370477 --message "Hello from Chippy"
npm run cli -- whatsapp send --to +14168370477 --message "Force linked mode" --workspace-id <workspace-uuid> --linked
npm run whatsapp:linked -- --workspace-id <workspace-uuid> --pair-phone +14168370477
npm run whatsapp:linked -- --workspace-id <workspace-uuid> --force-qr --reset-auth
```

## Providers

Current provider IDs:
- `local.heuristic` (no external key required)
- `gemini.flash`
- `gemini.pro`
- `ollama.local`
- `openai.default`

## Environment

For Gemini:
- `GEMINI_API_KEY` or `API_KEY`

Default CLI provider is `gemini.flash`. If no Gemini key is available, runtime falls back to `local.heuristic`.

Policy defaults:
- `approvalMode=REVIEW_REQUIRED`
- `fallbackMode=permissive` (use `--no-fallback` for strict mode)
- `maxToolCallsPerRun=12`
- `maxWriteActionsPerRun=3`
- `allowedToolScopes=none,read,write`
- `quietHours=off`
- `iterativeExecutor=enabled` (tool-driven loop for question/research goals)

JSON validation:
- Runtime now validates supervisor/worker/reviewer outputs against schemas.
- Tool inputs/outputs are validated against each tool's JSON schema.
- Invalid policy values fail fast (for example bad `--approval-mode`).

Useful flags:
- `--approval-mode AUTO|REVIEW_REQUIRED|BLOCKED`
- `--max-tool-calls 12`
- `--max-write-actions 3`
- `--allowed-scopes none,read,write`
- `--quiet-hours 22-7` (or `off`)
- `--timezone America/New_York` (for quiet-hours evaluation)
- `--no-fallback`
- `--storage-backend auto|sqlite|supabase`
- `--db-path /absolute/path/to/runtime.db`
- `--fixture /absolute/path/to/fixture.json`
- `--lead-id lead-001`
- `--lead-email alex@example.com`
- `--owner-email owner@example.com`
- `--company-name "Chippy HVAC"`
- `--timezone America/New_York`
- `--user-id <tenant-uuid>`
- `--tenant-id <tenant-uuid>`
- `--api-base-url https://your-api-base-url`
- `--requested-date 2026-02-16`
- `--email-limit 3`
- `--execute-write`
- `--iterative-executor true|false`
- `--iterative-max-steps 4`
- `--input '{"key":"value"}'` (for `tool exec`)
- `--input-file /absolute/path/to/input.json` (for `tool exec`)
- `--context '{"tenantId":"..."}'` (for `tool exec`)
- `--execute` (for `tool exec`; disables dry-run)

For Ollama:
- `OLLAMA_BASE_URL` (optional, default `http://localhost:11434`)
- `OLLAMA_MODEL` (optional)

For OpenAI:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-4.1-mini`)
- `OPENAI_BASE_URL` (optional, defaults to `https://api.openai.com`)

For WhatsApp Linked Device mode (OpenClaw-style):
- `WHATSAPP_DEFAULT_WORKSPACE_ID` (required unless passed with `--workspace-id`)
- `WHATSAPP_OWNER_NUMBERS=+14168370477,+15551234567` (owner-only command control)
- `WHATSAPP_AUTH_DIR` (optional auth session folder; default `.runs/whatsapp-auth`)
- `WHATSAPP_PAIR_PHONE` (optional phone for pairing code mode)
- `WHATSAPP_PAIRING_PENDING_LIMIT` (optional pending pairing cap; default `3`)
- `WHATSAPP_DEFAULT_PROVIDER_ID` (default `gemini.flash`)
- `WHATSAPP_DEFAULT_MODEL` (optional)
- `WHATSAPP_EXECUTE_WRITES=true|false` (default `false`)
- `WHATSAPP_APPROVAL_MODE=AUTO|REVIEW_REQUIRED|BLOCKED` (default `REVIEW_REQUIRED`)
- `WHATSAPP_MAX_TOOL_CALLS` (default `10`)
- `WHATSAPP_MAX_WRITE_ACTIONS` (default `2`)
- `WHATSAPP_ALLOWED_SCOPES=none,read,write`
- QR artifacts are saved to:
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/whatsapp-qr.png`
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/whatsapp-qr.txt`

Always-on Gateway (OpenClaw-style 24/7):
- `CHIPPY_GATEWAY_WORKSPACES=<workspace-uuid>,<workspace-uuid-2>`
- `CHIPPY_GATEWAY_HEARTBEAT_MINUTES=30` (default 30)
- `CHIPPY_GATEWAY_OBJECTIVE_POLL_SECONDS=60` (default 60)
- `CHIPPY_GATEWAY_AUTO_RUN_OBJECTIVES=true` (default true)
- `CHIPPY_GATEWAY_EMAIL_POLL_SECONDS=180` (default 180)
- `CHIPPY_GATEWAY_AUTO_RUN_EMAIL=false` (default false)
- `CHIPPY_GATEWAY_EMAIL_EXECUTE_WRITES=true|false` (default follows `CHIPPY_GATEWAY_EXECUTE_WRITES`)
- `CHIPPY_GATEWAY_EMAIL_GOAL="Manage unread customer emails and send concise, safe replies."` (optional override)
- `CHIPPY_GATEWAY_EMAIL_SOURCE=gmail|storage|fixture` (default `gmail`)
- `CHIPPY_GATEWAY_EMAIL_TRANSPORT=gmail|resend` (default `gmail`)
- `CHIPPY_GATEWAY_PROVIDER_ID=gemini.flash` (optional override)
- `CHIPPY_GATEWAY_MODEL=<model-id>` (optional override)
- `CHIPPY_GATEWAY_EXECUTE_WRITES=true|false` (default false)
- `CHIPPY_GATEWAY_RELINK_WORKSPACES=<workspace-uuid>` (optional one-time reset-auth+QR on next start)
- `CHIPPY_WATCHDOG_INTERVAL_SECONDS=60` (default 60)
- `CHIPPY_WATCHDOG_BACKUP_INTERVAL_MINUTES=360` (default 360; set `0` to disable scheduled backups)
- `CHIPPY_WATCHDOG_MAX_RESTARTS_PER_HOUR=5` (default 5)
- `CHIPPY_WATCHDOG_ALERT_COOLDOWN_MINUTES=30` (default 30)
- `CHIPPY_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...` (optional alerts)
- `CHIPPY_ALERT_LOG_PATH=/absolute/path/to/watchdog-alerts.log` (optional local alert sink path)
- `CHIPPY_LOG_ROTATE_MAX_BYTES=5242880` (default 5MB)
- `CHIPPY_LOG_ROTATE_KEEP=5` (default 5 generations)
- `CHIPPY_BACKUP_DIR=/absolute/path/to/backups` (optional; default `.runs/backups`)
- `CHIPPY_BACKUP_KEEP_COUNT=20` (default 20 backups retained)
- `CHIPPY_BACKUP_KEEP_DAYS=14` (default 14 days)
- `CHIPPY_BACKUP_INCLUDE_LOGS=false` (default false)
- `CHIPPY_BACKUP_EXTRA_PATHS=/abs/path/a,/abs/path/b` (optional additional backup paths)
- Gateway state files:
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/gateway/gateway.pid`
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/gateway/gateway-state.json`
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/gateway/gateway.log`
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/gateway/watchdog.pid`
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/gateway/watchdog-state.json`
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/gateway/watchdog.log`

24/7 hardening flow:
1. `npm run cli -- gateway install --workspace-id <workspace-uuid>`
2. `npm run cli -- watchdog install --workspace-id <workspace-uuid>`
3. `npm run cli -- gateway doctor --workspace-id <workspace-uuid>`
4. Optionally wire alerts with `CHIPPY_ALERT_WEBHOOK_URL`
5. Validate backups with `npm run cli -- backup create` and `npm run cli -- backup list`

Alert behavior:
- If `CHIPPY_ALERT_WEBHOOK_URL` is configured, alerts are POSTed there.
- If webhook is not configured, alerts are still persisted locally at:
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/gateway/watchdog-alerts.log`

Integration strategy (default going forward):
- Prefer linked-device/session channels first (WhatsApp Web, Slack bot socket/session, Teams bot session).
- Use provider HTTP APIs as fallback, not as the primary control path.
- Keep the same command loop across channels: `/help`, `/status`, `/actions`, `/approve`, `/deny`.

Linked-device commands (inside WhatsApp chat):
- `/help`
- `/status`
- `/actions`
- `/approve <action_id>`
- `/deny <action_id>`
- non-command text triggers a new multi-agent run.
- If you are chatting from the same paired WhatsApp account, use `/agent <instruction>` (example: `/agent manage customer emails` or `/agent /status`).

Outbound send behavior:
- `chippy whatsapp send` uses Twilio when Twilio credentials exist.
- If Twilio credentials are missing, it automatically queues to the linked-device outbox (gateway worker sends it).
- Use `--linked` to force linked-device outbox mode.

Pairing recovery (recommended when phone-code link fails):
1. `npm run whatsapp:linked -- --force-qr --reset-auth`
2. Open `/Users/rijesh/Documents/GitHub/chippyapp/.runs/whatsapp-qr.png`
3. WhatsApp -> Linked Devices -> Link a device -> scan the QR

In-app setup (Integrations page):
- WhatsApp Linked Device can now be configured directly in-app with:
  - QR start/stop gateway controls
  - DM policy mode (`pairing` or `allowlist`)
  - allowlist number editor
  - pending pairing approval/deny queue

For live tool connectors:
- `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (optional for `lead.lookup` when using `supabase` or `auto`)
- `CHIPPY_API_URL` or `--api-base-url` (for `booking.check_slots`)
- `RESEND_API_KEY` (for non-dry-run `followup.send_preview`)
- Gmail inbox/reply connector (optional):
  - `CHIPPY_EMAIL_SOURCE=gmail|storage|fixture` (default `storage`)
  - `CHIPPY_EMAIL_REPLY_TRANSPORT=gmail|resend` (default `resend`)
  - `GMAIL_CLIENT_ID=...`
  - `GMAIL_CLIENT_SECRET=...`
  - `GMAIL_REFRESH_TOKEN=...`
  - `GMAIL_USER_ID=me` (or explicit mailbox id)
  - `GMAIL_REPLY_FROM=Your Name <you@domain.com>` (optional)
  - replies sent via Gmail now attempt to remove `UNREAD` from the inbound message to prevent duplicate auto-replies
- Gmail Pub/Sub webhook trigger (OpenClaw-style event ingestion):
  - Endpoint: `POST /api/integrations/gmail/pubsub/webhook`
  - `GMAIL_PUBSUB_WEBHOOK_SECRET=...` (optional shared secret; pass via `?token=` or `x-chippy-gmail-token`)
  - `GMAIL_PUBSUB_ALLOWED_SUBSCRIPTIONS=projects/<project>/subscriptions/<sub1>,...` (optional allowlist)
  - `GMAIL_PUBSUB_DEFAULT_WORKSPACE_ID=<workspace-uuid>` (fallback workspace)
  - `GMAIL_PUBSUB_WORKSPACE_MAP={"owner@gmail.com":"<workspace-uuid>","subscription:projects/.../subscriptions/...":"<workspace-uuid>"}` (optional explicit routing)
  - `GMAIL_PUBSUB_PROVIDER_ID=gemini.flash` (default)
  - `GMAIL_PUBSUB_MODEL=<model>` (optional)
  - `GMAIL_PUBSUB_EXECUTE_WRITES=true|false` (default false)
  - `GMAIL_PUBSUB_APPROVAL_MODE=AUTO|REVIEW_REQUIRED|BLOCKED` (default REVIEW_REQUIRED)
  - `GMAIL_PUBSUB_MAX_TOOL_CALLS=10` (default 10)
  - `GMAIL_PUBSUB_MAX_WRITE_ACTIONS=2` (default 2)
  - `GMAIL_PUBSUB_ALLOWED_SCOPES=none,read,write` (default all three)
  - `GMAIL_PUBSUB_EMAIL_SOURCE=gmail|storage|fixture` (default `gmail`)
  - `GMAIL_PUBSUB_EMAIL_TRANSPORT=gmail|resend` (default `gmail`)
  - `GMAIL_PUBSUB_GOAL=...` (optional run-goal override)
  - `GMAIL_PUBSUB_RECENT_EVENT_TTL_SECONDS=1800` (duplicate suppression window, default 30m)
- Capability tools:
  - `CHIPPY_TOOL_FS_ROOT=/absolute/path` (bounds `fs.*` + `shell.exec` working area; defaults to current workspace)
  - `CHIPPY_ENABLE_WEB_SEARCH_TOOL=true|false`
  - `CHIPPY_ENABLE_BROWSER_TOOL=true|false`
  - `CHIPPY_ENABLE_FS_READ_TOOL=true|false`
  - `CHIPPY_ENABLE_FS_WRITE_TOOL=true|false` (default `false`)
  - `CHIPPY_ENABLE_SHELL_TOOL=true|false` (default `false`)
  - `CHIPPY_SHELL_ALLOW_ALL=true|false` (default `false`)
  - `CHIPPY_SHELL_ALLOWLIST=echo,pwd,ls,cat,rg,date,whoami,uname,node,npm`
  - `CHIPPY_SEARCH_API_URL=https://your-search-endpoint.example` (optional custom search backend)
- Iterative executor loop:
  - `CHIPPY_ENABLE_ITERATIVE_EXECUTOR=true|false` (default `true`)
  - `CHIPPY_ITERATIVE_MAX_STEPS=4` (max iterative tool/think turns per run, bounded by remaining run step budget)

For storage:
- `CHIPPY_STORAGE_BACKEND=auto|sqlite|supabase`
- `CHIPPY_STORAGE_DB_PATH=/absolute/path/to/runtime.db`
- `auto` mode lookup order for `lead.lookup`: SQLite local -> Supabase -> fixture fallback.

For WhatsApp (Twilio webhook bridge):
- `WHATSAPP_TWILIO_AUTH_TOKEN` (required when signature validation is enabled)
- `WHATSAPP_SIGNATURE_REQUIRED=true|false` (default `true` in production)
- `WHATSAPP_WEBHOOK_SECRET` (optional shared secret; pass as `?token=...` in webhook URL)
- `WHATSAPP_NUMBER_WORKSPACE_MAP` (JSON object mapping WhatsApp number to workspace ID)
- `WHATSAPP_DEFAULT_WORKSPACE_ID` (fallback workspace when map does not match)
- `WHATSAPP_DEFAULT_PROVIDER_ID` (default `gemini.flash`)
- `WHATSAPP_DEFAULT_MODEL` (optional)
- `WHATSAPP_DEFAULT_TIMEZONE` (optional, for policy quiet-hours context)
- `WHATSAPP_APPROVAL_MODE=AUTO|REVIEW_REQUIRED|BLOCKED` (default `REVIEW_REQUIRED`)
- `WHATSAPP_MAX_TOOL_CALLS` (default `10`)
- `WHATSAPP_MAX_WRITE_ACTIONS` (default `2`)
- `WHATSAPP_ALLOWED_SCOPES=none,read,write` (default all three)
- `WHATSAPP_EXECUTE_WRITES=true|false` (default `false`)
- `WHATSAPP_OWNER_NUMBERS=+15551234567,+15557654321` (optional; required for command-level owner controls if set)
- DM policy enforcement uses the same linked-device state/policy file:
  - `policy.dmPolicy=pairing|allowlist`
  - `policy.allowFrom=[+number,...]`
  - unauthorized inbound numbers are blocked (`allowlist`) or placed into pairing approval flow (`pairing`).

Webhook endpoint:
- `POST /api/integrations/whatsapp/twilio/webhook`
- Twilio payload fields used: `Body`, `From`, `To`, `ProfileName`, `MessageSid`
- Replies are returned as TwiML `<Message>` and routed through the same multi-agent runtime + soul/heartbeat tracking.

WhatsApp command mode (OpenClaw-style control loop):
- Commands must start with `/` to avoid intercepting normal customer text
- `/help` shows command reference
- `/status` shows heartbeat, queue health, and last run
- `/actions` lists pending approval actions
- `/approve <action_id>` approves and executes the pending action
- `/deny <action_id>` denies the pending action
- Any non-command text is treated as a new goal and run through the agent runtime

Example mapping:
```env
WHATSAPP_NUMBER_WORKSPACE_MAP={"+14155238886":"<workspace-uuid>","whatsapp:+14155238886":"<workspace-uuid>"}
```

Storage behavior:
- Run artifacts are persisted to local SQLite and mirrored as JSON audit files.
- Local SQLite path default: `/Users/rijesh/Documents/GitHub/chippyapp/.runs/agent-runtime/runtime.db`.
- JSON audit files remain under `/Users/rijesh/Documents/GitHub/chippyapp/.runs/agent-runtime/<run-id>.json`.

Write behavior:
- Default is dry-run for write tools.
- `--execute-write` requests live write actions.
- With `--approval-mode REVIEW_REQUIRED`, write actions are recorded as `pending_review` actions and not executed.
- With `--approval-mode AUTO`, write actions execute if required credentials are present.

Approval action commands:
- `action list --status pending_review|approved|denied|executed|failed|all`
- `action process --action-id <id> --decision approve|deny`
- `approve` executes the underlying write tool without rerunning planning.
- Tool-call state inside the original run audit is patched in place after action processing.
- Action execution uses claim/finalize transitions (`approved -> executing -> executed|failed`) to prevent concurrent double execution.

Email process command:
- `email process --fixture <fixture.json> --limit 3 [--execute-write]`
- `email process --limit 5 --email-source gmail --email-transport gmail [--execute-write]`
- Uses email tools:
  - `email.inbox_list`
  - `email.thread_classify`
  - `email.reply_compose`
  - `email.reply_send`
- `email.inbox_list` supports Gmail sync (`query`, `unreadOnly`) when `CHIPPY_EMAIL_SOURCE=gmail`.
- In `REVIEW_REQUIRED` mode, `email.reply_send` creates approval actions.
- In `AUTO` mode, replies are executed immediately (or `live-skipped` if the selected transport is not configured).

Run statuses:
- `awaiting_approval`: run has pending write actions waiting for approval.
- `completed`: verifier passed and no pending write actions remain.
- `blocked_policy`: a required write path was blocked by policy.

## Runtime Files

- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/runtime.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/agentFactory.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/agentBus.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/providerRegistry.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/core/verifier.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/agent-runtime/providers/createDefaultRegistry.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/bin/chippy.js`
- `/Users/rijesh/Documents/GitHub/chippyapp/scripts/benchmark-agent-runtime.js`

## Audit Logs

Each run is stored as JSON under:
- `/Users/rijesh/Documents/GitHub/chippyapp/.runs/agent-runtime/<run-id>.json`

The audit record includes plan, outputs, review result, verifier findings, and event history.

Fixture for deterministic prep-stage tests:
- `/Users/rijesh/Documents/GitHub/chippyapp/fixtures/agent-runtime/tenant-lead-fixture.json`
