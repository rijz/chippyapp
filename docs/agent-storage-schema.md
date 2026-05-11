# Agent Storage Schema (Local-First, Adapter-Based)

Last updated: February 14, 2026

## Why this schema
- OpenClaw-inspired runtime model: local-first execution, optional external adapters.
- Business-safe design: keep auditable run history and action traces locally by default.
- Portability: storage backend can be swapped (`sqlite`, `supabase`, `auto`) without changing tool contracts.

## Backend strategy
- Primary runtime persistence: local SQLite.
- Optional remote lookup: Supabase adapter for CRM reads.
- Fallback path: fixture data for deterministic testing.

Lookup order:
- `auto`: SQLite -> Supabase -> fixture
- `sqlite`: SQLite only -> fixture fallback
- `supabase`: Supabase -> SQLite -> fixture

## Core tables

### `workspaces`
Tenant/workspace boundary for all data.
- `id` (PK)
- `slug`
- `name`
- `metadata_json`
- `created_at`, `updated_at`

### `provider_configs`
LLM/provider settings per workspace.
- `id` (PK)
- `workspace_id` (FK -> `workspaces`)
- `provider_id`
- `model`
- `config_json`
- `is_default`
- `created_at`, `updated_at`

### `crm_contacts`
Business lead/contact records used by tools like `lead.lookup`.
- `id` (PK)
- `workspace_id` (FK -> `workspaces`)
- `email`, `name`, `phone`
- `status`, `source`
- `service_interest`
- `location_id`, `location_name`
- `notes`, `tags_json`
- `created_at`, `updated_at`

### `crm_bookings`
Booking intents/outcomes linked to contacts.
- `id` (PK)
- `workspace_id` (FK -> `workspaces`)
- `contact_id` (FK -> `crm_contacts`)
- `provider`, `external_event_id`
- `requested_start`, `requested_end`
- `status`, `notes`
- `created_at`, `updated_at`

### `customer_email_threads`
Customer email thread metadata for inbox processing.
- `id` (PK)
- `workspace_id` (FK -> `workspaces`)
- `customer_email`, `customer_name`
- `subject`
- `status`
- `last_message_at`
- `metadata_json`
- `created_at`, `updated_at`

### `customer_email_messages`
Inbound/outbound customer email records for agent processing.
- `id` (PK)
- `thread_id` (FK -> `customer_email_threads`)
- `workspace_id` (FK -> `workspaces`)
- `direction` (`inbound|outbound`)
- `from_email`, `from_name`, `to_email`
- `subject`, `body`
- `status` (`open|pending_manual|replied|...`)
- `source`, `in_reply_to_id`
- `raw_json`
- `created_at`, `updated_at`

### `agent_runs`
Top-level execution records (canonical audit object).
- `id` (PK)
- `schema_version`
- `workspace_id` (FK -> `workspaces`)
- `goal`, `status`
- `provider_id`, `provider_name`, `provider_model`
- `approval_mode`, `fallback_mode`, `max_tool_calls`
- `execute_writes`, `steps_used`, `score`
- `started_at`, `ended_at`
- JSON snapshots: `policy_json`, `context_json`, `plan_json`, `outputs_json`, `review_json`, `verification_json`, `tooling_json`, `run_json`
- `created_at`, `updated_at`

### `agent_steps`
Normalized per-task output rows for analytics/query.
- `id` (PK)
- `run_id` (FK -> `agent_runs`)
- `step_order`, `task_id`
- `title`, `objective`, `agent_role`
- `acceptance_criteria_json`
- output fields: `summary`, `deliverables_json`, `risks_json`, `questions_json`, `next_actions_json`
- `created_at`

### `agent_tool_calls`
All tool executions with policy + idempotency trace.
- `id` (PK)
- `run_id` (FK -> `agent_runs`)
- `tool_name`, `reason`, `status`, `side_effect`
- `dry_run`, `attempts`, `approval_mode`
- `idempotency_key`
- `input_json`, `result_json`, `error`
- `started_at`, `ended_at`, `created_at`

### `approval_actions`
Review queue for side-effecting actions under `REVIEW_REQUIRED`.
- `id` (PK)
- `run_id`
- `tool_call_id`
- `workspace_id`
- `tool_name`, `side_effect`, `reason`
- `idempotency_key`
- `input_json`, `context_json`
- `status` (`pending_review|approved|executing|denied|executed|failed`)
- `duplicate_of`
- decision fields: `decision`, `decided_by`, `decided_at`
- execution fields: `execution_status`, `execution_result_json`, `execution_error`, `executed_at`
- `created_at`, `updated_at`

### `agent_events`
Event bus trace for replay/debug.
- `id` (PK autoincrement)
- `run_id` (FK -> `agent_runs`)
- `event_order`
- `event_type`
- `payload_json`
- `created_at`

### `schema_meta`
Schema version tracking.
- `key` (PK)
- `value`
- `updated_at`

## Runtime artifacts
- SQLite DB default:
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/agent-runtime/runtime.db`
- JSON audit mirror:
  - `/Users/rijesh/Documents/GitHub/chippyapp/.runs/agent-runtime/<run-id>.json`
