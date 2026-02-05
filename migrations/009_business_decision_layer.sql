-- Business Decision Layer (BDL) core tables

create table if not exists business_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  version int default 1,
  compiled_at timestamp with time zone default timezone('utc'::text, now()) not null,
  bms_text text not null,
  source_hash text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (tenant_id)
);

create table if not exists tenant_faq (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  question text not null,
  answer text not null,
  source text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_used_at timestamp with time zone,
  usage_count int default 0
);

create table if not exists bdl_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  occurred_at timestamp with time zone default timezone('utc'::text, now()) not null,
  payload jsonb not null,
  source text not null
);

create table if not exists bdl_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  execute_at timestamp with time zone not null,
  status text not null,
  payload jsonb not null,
  idempotency_key text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create unique index if not exists bdl_jobs_idempotency_idx on bdl_jobs (tenant_id, idempotency_key);

create table if not exists skill_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references auth.users(id) on delete cascade not null,
  skill_id text not null,
  status text not null,
  config jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (tenant_id, skill_id)
);

create index if not exists bdl_events_tenant_type_idx on bdl_events (tenant_id, type);
create index if not exists bdl_jobs_execute_idx on bdl_jobs (execute_at);

-- Enable RLS
alter table business_memory enable row level security;
alter table tenant_faq enable row level security;
alter table bdl_events enable row level security;
alter table bdl_jobs enable row level security;
alter table skill_subscriptions enable row level security;

-- RLS Policies
create policy "Users can view own business_memory" on business_memory
  for select using (auth.uid() = tenant_id);

create policy "Users can insert own business_memory" on business_memory
  for insert with check (auth.uid() = tenant_id);

create policy "Users can update own business_memory" on business_memory
  for update using (auth.uid() = tenant_id);

create policy "Users can delete own business_memory" on business_memory
  for delete using (auth.uid() = tenant_id);

create policy "Users can view own tenant_faq" on tenant_faq
  for select using (auth.uid() = tenant_id);

create policy "Users can insert own tenant_faq" on tenant_faq
  for insert with check (auth.uid() = tenant_id);

create policy "Users can update own tenant_faq" on tenant_faq
  for update using (auth.uid() = tenant_id);

create policy "Users can delete own tenant_faq" on tenant_faq
  for delete using (auth.uid() = tenant_id);

create policy "Users can view own bdl_events" on bdl_events
  for select using (auth.uid() = tenant_id);

create policy "Users can insert own bdl_events" on bdl_events
  for insert with check (auth.uid() = tenant_id);

create policy "Users can view own bdl_jobs" on bdl_jobs
  for select using (auth.uid() = tenant_id);

create policy "Users can insert own bdl_jobs" on bdl_jobs
  for insert with check (auth.uid() = tenant_id);

create policy "Users can update own bdl_jobs" on bdl_jobs
  for update using (auth.uid() = tenant_id);

create policy "Users can delete own bdl_jobs" on bdl_jobs
  for delete using (auth.uid() = tenant_id);

create policy "Users can view own skill_subscriptions" on skill_subscriptions
  for select using (auth.uid() = tenant_id);

create policy "Users can insert own skill_subscriptions" on skill_subscriptions
  for insert with check (auth.uid() = tenant_id);

create policy "Users can update own skill_subscriptions" on skill_subscriptions
  for update using (auth.uid() = tenant_id);

create policy "Users can delete own skill_subscriptions" on skill_subscriptions
  for delete using (auth.uid() = tenant_id);
