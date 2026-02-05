# Business Decision Layer (BDL) — Specs

## Purpose
A model-agnostic proprietary layer that ensures business-specific AI responses are reliable, grounded, and action-safe across chat and non-chat workflows (booking, callbacks, reminders, admin reports, promos).

## Goals
- Ensure answers are grounded in verified business knowledge.
- Make actions deterministic and safe (no accidental bookings or policy violations).
- Provide consistent behavior across Gemini/OpenAI/Claude/open-source models.
- Enable plugin-style skills that business owners can activate.
- Keep runtime lightweight and cost-efficient.

## Non-Goals
- Training or fine-tuning models per tenant.
- Replacing existing LLMs; this layer orchestrates them.

---

## Core Concepts

### 1) Business Memory Snapshot (BMS)
A compact, curated, canonical memory for each tenant.

**Characteristics**
- Size target: 2–5 KB
- Updated only when the knowledge base changes
- Used in every inference regardless of model provider
- Considered the source of truth for answers

**Contents (canonical fields)**
- Company profile: name, category, website
- Contact: phone, email, address
- Hours: business hours, holiday rules
- Locations: name, address, service area
- Services: name, description, duration, category, pricing
- Policies: cancellation, deposits, refunds, late policy
- Top rules: critical business instructions
- Keywords: services, niche terms, synonyms
- Risk rules: “Do not guess pricing”, “Do not promise walk-ins”, etc.
- Example Q&A: 3–5 canonical responses

**Example format**
```
BMS
Company: {name}
Category: {category}
Locations:
- {name} — {address}
Services:
- {name} ({duration} min) — {pricing}
Policies:
- {policy lines}
Top Rules:
- {rule lines}
Examples:
- Q: {question}
  A: {answer}
```

### 2) Tenant FAQ Memory (TFM)
Learned FAQs from corrections and admin-approved answers.

**Sources**
- Owner corrections
- Approved chat answers
- Review queue approvals

**Retention**
- Keep top 50–200 entries
- Prune by low usage or outdated policies

### 3) Conversation Memory (CM)
Last N messages for immediate context only.

---

## Architecture Overview

```
User Input
  ↓
Intent Parser → Required-Info Checker → Evidence Assembler
  ↓                          ↓
Action State Machine        Evidence Confidence
  ↓                          ↓
Template/Freeform Generator + LLM Router
  ↓
Answer Validator (evidence check)
  ↓
Output / Action / Clarification
```

---

## Event Schema

All business workflows operate on events. This makes skills reusable across chat, SMS, email, and admin dashboards.

**Event Base**
```
{
  id: string,
  tenant_id: string,
  type: string,
  occurred_at: string, // ISO
  payload: object,
  source: 'chat' | 'admin' | 'system' | 'api'
}
```

**Core Events**
- `booking.created`
- `booking.updated`
- `booking.canceled`
- `booking.completed`
- `booking.no_show`
- `callback.requested`
- `feedback.received`
- `chat.unresolved`
- `slot.opened`
- `report.daily`
- `report.weekly`

**Example**
```
{
  id: "evt_123",
  tenant_id: "tenant_abc",
  type: "booking.created",
  occurred_at: "2026-02-04T10:30:00Z",
  source: "chat",
  payload: {
    booking_id: "bk_123",
    customer: { name: "Jane", email: "jane@x.com", phone: "+1..." },
    service: "Haircut",
    location_id: "loc_1",
    start_at: "2026-02-05T14:00:00-05:00",
    end_at: "2026-02-05T15:00:00-05:00"
  }
}
```

---

## Skill System

### Skill Definition (conceptual)
```
{
  id: "appointment-reminders",
  name: "Appointment Reminders",
  version: "1.0",
  triggers: ["booking.created", "booking.updated"],
  required_data: ["customer.phone", "booking.start_at"],
  permissions: {
    requires_marketing_consent: false,
    channels: ["sms", "email"]
  },
  schedule: [
    { offset: "-24h" },
    { offset: "-2h" }
  ],
  guardrails: ["quiet_hours", "opt_out", "booking_status_active"],
  action: "send_reminder"
}
```

### Examples of Skills
- Appointment Reminders
- Review Request (positive sentiment only)
- Post-Service Feedback
- No-Show Recovery
- Waitlist Backfill
- Promo/Reactivation
- Daily Admin Report

---

## Decision Engine (Brain)

### 1) Intent Parser
Extracts structured intent from input:
- inquiry type (pricing, hours, service availability)
- required parameters (service, location, date)
- confidence score

### 2) Evidence Assembler
Retrieves facts from BMS and TFM.
- If no evidence, force clarification
- If low confidence, ask follow-up

### 3) Action State Machine
Deterministic checks before calling tools.
- booking: require service, location, date, contact
- callback: require name + phone + preferred time
- cancellation: require email + confirmation

### 4) Output Generator
- Template-first for high-risk intents (pricing, policies)
- Freeform for low-risk intents

### 5) Answer Validator
- Ensures each response maps to evidence
- If not, re-ask or escalate

---

## LLM Router (Model-Agnostic)

A provider abstraction layer:
- `generate(text, context, tools)`
- `classify(text)`
- `summarize(text)`

**Routing rules**
- “High risk” intents → most reliable model
- “Low risk” → cheaper model or open-source
- Tool-heavy flows → model with strongest function calling

---

## Booking & Callback Flows

### Booking Flow
1. Identify service
2. Confirm service
3. Resolve location
4. Call `get_available_slots`
5. Confirm time
6. Collect contact info
7. Call `book_appointment`

### Callback Flow
1. Identify service
2. Confirm service
3. Collect name + phone
4. Ask preferred time/date
5. Call `request_callback`

---

## Reminder Skill Flow

1. Event: `booking.created`
2. Scheduler creates jobs at -24h and -2h
3. Worker executes each job:
   - Verify booking still active
   - Check quiet hours + consent
   - Send reminder
4. Log status and audit record

---

## Admin Report Flow

1. Schedule event: `report.daily`
2. Aggregation: bookings, cancellations, no-shows, feedback
3. Optional LLM summary
4. Send report to owner

---

## Data Models (suggested)

### business_memory
```
{
  tenant_id: string,
  version: number,
  compiled_at: string,
  bms_text: string,
  source_hash: string
}
```

### tenant_faq
```
{
  tenant_id: string,
  question: string,
  answer: string,
  source: 'approved' | 'correction' | 'auto',
  created_at: string,
  last_used_at: string,
  usage_count: number
}
```

### events
```
{
  id: string,
  tenant_id: string,
  type: string,
  occurred_at: string,
  payload: object,
  source: string
}
```

### jobs
```
{
  id: string,
  tenant_id: string,
  type: string,
  execute_at: string,
  status: 'queued' | 'running' | 'completed' | 'failed',
  payload: object,
  idempotency_key: string
}
```

### skill_subscriptions
```
{
  tenant_id: string,
  skill_id: string,
  status: 'active' | 'disabled',
  config: object
}
```

---

## Guardrails
- Evidence required for pricing, policies, refunds
- Do not answer outside business scope
- If uncertain, clarify or escalate
- Compliance for marketing consent
- Quiet hours enforcement
- Idempotency for all actions

---

## Practical Feasibility

**MVP phase**
- Business Memory Compiler
- Intent parser (heuristic + LLM)
- Evidence Assembler
- Basic validator
- 2–3 skills (reminders, feedback, admin report)

**Scale phase**
- Model router
- Full skill marketplace
- Advanced learning loops

---

## Success Metrics
- Answer accuracy (human-rated)
- Booking completion rate
- Reduction in escalations
- Review rating uplift
- Admin time saved

---

## v0.2 Integration Steps (Next)
1. Compile BMS when knowledge base updates and upsert via `POST /api/bdl/memory`.
2. Load BMS + top Tenant FAQ into the chat runtime (alongside existing prompt).
3. Emit core events (`booking.created`, `callback.requested`, `feedback.received`) from the current flows.
4. Add a lightweight worker to pull `bdl_events` and enqueue `bdl_jobs` for skills.
5. Implement the first two skills: Appointment Reminders + Daily Admin Report.

---

## Notes
This spec is designed to be implementation-friendly in the current codebase. The architecture avoids vendor lock-in and keeps runtime costs low by minimizing prompt size and using events + queues.
