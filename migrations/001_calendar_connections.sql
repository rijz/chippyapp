-- Calendar Connections Table
-- Stores owner's calendar credentials for multiple providers

create table if not exists calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'calendly', 'outlook')),
  provider_email text not null,
  access_token text, -- Encrypted
  refresh_token text, -- Encrypted  
  token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  is_active boolean default true,
  connected_at timestamptz default now(),
  last_used_at timestamptz default now(),
  
  -- Ensure one active connection per provider per user
  unique(user_id, provider)
);

-- Index for faster lookups
create index if not exists idx_calendar_connections_user_provider 
  on calendar_connections(user_id, provider, is_active);

-- RLS Policies
alter table calendar_connections enable row level security;

-- Users can only see/manage their own calendar connections
create policy "Users can view own calendar connections"
  on calendar_connections for select
  using (auth.uid() = user_id);

create policy "Users can insert own calendar connections"
  on calendar_connections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own calendar connections"
  on calendar_connections for update
  using (auth.uid() = user_id);

create policy "Users can delete own calendar connections"
  on calendar_connections for delete
  using (auth.uid() = user_id);
