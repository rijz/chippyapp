-- AI-first setup, generated business playbooks, lead recovery, and owner command chat.

create table if not exists public.ai_setup_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'drafting',
  business_url text,
  detected_vertical text,
  confidence numeric,
  draft_json jsonb not null default '{}'::jsonb,
  missing_fields_json jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  launched_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.business_playbooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  vertical text not null default 'med_spa',
  status text not null default 'draft',
  services_json jsonb not null default '[]'::jsonb,
  pricing_rules_json jsonb not null default '{}'::jsonb,
  booking_rules_json jsonb not null default '{}'::jsonb,
  followup_rules_json jsonb not null default '{}'::jsonb,
  approved_claims_json jsonb not null default '[]'::jsonb,
  blocked_claims_json jsonb not null default '[]'::jsonb,
  escalation_rules_json jsonb not null default '[]'::jsonb,
  playbook_markdown text not null default '',
  source_setup_session_id uuid references public.ai_setup_sessions(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists business_playbooks_active_unique
  on public.business_playbooks (tenant_id)
  where status = 'active';

alter table public.leads add column if not exists treatment_interest text;
alter table public.leads add column if not exists lead_temperature text;
alter table public.leads add column if not exists pipeline_status text;
alter table public.leads add column if not exists last_contacted_at timestamptz;
alter table public.leads add column if not exists next_followup_at timestamptz;
alter table public.leads add column if not exists followup_attempts int not null default 0;
alter table public.leads add column if not exists estimated_value numeric;
alter table public.leads add column if not exists recovery_source text;
alter table public.leads add column if not exists requires_approval_reason text;
alter table public.leads add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists leads_pipeline_status_idx on public.leads (user_id, pipeline_status);
create index if not exists leads_next_followup_idx on public.leads (user_id, next_followup_at);
create index if not exists leads_temperature_idx on public.leads (user_id, lead_temperature);

create table if not exists public.lead_interactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  lead_id text references public.leads(id) on delete cascade,
  channel text not null,
  direction text not null,
  body text not null,
  ai_generated boolean not null default false,
  status text not null default 'draft',
  approval_action_id uuid,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.recovery_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  lead_id text references public.leads(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  outcome_type text not null,
  estimated_value numeric,
  attributed_to text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.owner_command_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Owner command chat',
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.owner_command_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.owner_command_threads(id) on delete cascade not null,
  tenant_id uuid references auth.users(id) on delete cascade not null,
  role text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.owner_command_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  thread_id uuid references public.owner_command_threads(id) on delete cascade,
  message_id uuid references public.owner_command_messages(id) on delete set null,
  action_type text not null,
  status text not null default 'draft',
  target_table text,
  target_id text,
  patch_json jsonb not null default '{}'::jsonb,
  preview_markdown text not null default '',
  risk_level text not null default 'low',
  executed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists lead_interactions_tenant_lead_idx on public.lead_interactions (tenant_id, lead_id, created_at desc);
create index if not exists recovery_outcomes_tenant_idx on public.recovery_outcomes (tenant_id, created_at desc);
create index if not exists owner_command_messages_thread_idx on public.owner_command_messages (thread_id, created_at);
create index if not exists owner_command_actions_tenant_status_idx on public.owner_command_actions (tenant_id, status, created_at desc);

alter table public.ai_setup_sessions enable row level security;
alter table public.business_playbooks enable row level security;
alter table public.lead_interactions enable row level security;
alter table public.recovery_outcomes enable row level security;
alter table public.owner_command_threads enable row level security;
alter table public.owner_command_messages enable row level security;
alter table public.owner_command_actions enable row level security;

create policy "Users can view own ai_setup_sessions" on public.ai_setup_sessions for select using (auth.uid() = tenant_id);
create policy "Users can insert own ai_setup_sessions" on public.ai_setup_sessions for insert with check (auth.uid() = tenant_id);
create policy "Users can update own ai_setup_sessions" on public.ai_setup_sessions for update using (auth.uid() = tenant_id);
create policy "Users can delete own ai_setup_sessions" on public.ai_setup_sessions for delete using (auth.uid() = tenant_id);

create policy "Users can view own business_playbooks" on public.business_playbooks for select using (auth.uid() = tenant_id);
create policy "Users can insert own business_playbooks" on public.business_playbooks for insert with check (auth.uid() = tenant_id);
create policy "Users can update own business_playbooks" on public.business_playbooks for update using (auth.uid() = tenant_id);
create policy "Users can delete own business_playbooks" on public.business_playbooks for delete using (auth.uid() = tenant_id);

create policy "Users can view own lead_interactions" on public.lead_interactions for select using (auth.uid() = tenant_id);
create policy "Users can insert own lead_interactions" on public.lead_interactions for insert with check (auth.uid() = tenant_id);
create policy "Users can update own lead_interactions" on public.lead_interactions for update using (auth.uid() = tenant_id);
create policy "Users can delete own lead_interactions" on public.lead_interactions for delete using (auth.uid() = tenant_id);

create policy "Users can view own recovery_outcomes" on public.recovery_outcomes for select using (auth.uid() = tenant_id);
create policy "Users can insert own recovery_outcomes" on public.recovery_outcomes for insert with check (auth.uid() = tenant_id);
create policy "Users can update own recovery_outcomes" on public.recovery_outcomes for update using (auth.uid() = tenant_id);
create policy "Users can delete own recovery_outcomes" on public.recovery_outcomes for delete using (auth.uid() = tenant_id);

create policy "Users can view own owner_command_threads" on public.owner_command_threads for select using (auth.uid() = tenant_id);
create policy "Users can insert own owner_command_threads" on public.owner_command_threads for insert with check (auth.uid() = tenant_id);
create policy "Users can update own owner_command_threads" on public.owner_command_threads for update using (auth.uid() = tenant_id);
create policy "Users can delete own owner_command_threads" on public.owner_command_threads for delete using (auth.uid() = tenant_id);

create policy "Users can view own owner_command_messages" on public.owner_command_messages for select using (auth.uid() = tenant_id);
create policy "Users can insert own owner_command_messages" on public.owner_command_messages for insert with check (auth.uid() = tenant_id);
create policy "Users can update own owner_command_messages" on public.owner_command_messages for update using (auth.uid() = tenant_id);
create policy "Users can delete own owner_command_messages" on public.owner_command_messages for delete using (auth.uid() = tenant_id);

create policy "Users can view own owner_command_actions" on public.owner_command_actions for select using (auth.uid() = tenant_id);
create policy "Users can insert own owner_command_actions" on public.owner_command_actions for insert with check (auth.uid() = tenant_id);
create policy "Users can update own owner_command_actions" on public.owner_command_actions for update using (auth.uid() = tenant_id);
create policy "Users can delete own owner_command_actions" on public.owner_command_actions for delete using (auth.uid() = tenant_id);
