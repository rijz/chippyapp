-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table to store your documents
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  embedding vector(768), -- Gemini 1.5/2.0 Flash embedding dimension
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an index to query the vectors faster
create index if not exists memories_embedding_idx on memories 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Enable RLS
alter table memories enable row level security;

-- RLS Policies
create policy "Users can view own memories" on memories
  for select using (auth.uid() = user_id);

create policy "Users can insert own memories" on memories
  for insert with check (auth.uid() = user_id);

create policy "Users can update own memories" on memories
  for update using (auth.uid() = user_id);

create policy "Users can delete own memories" on memories
  for delete using (auth.uid() = user_id);

-- Create a function to search for memories
create or replace function match_memories (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    memories.id,
    memories.content,
    memories.metadata,
    1 - (memories.embedding <=> query_embedding) as similarity
  from memories
  where 1 - (memories.embedding <=> query_embedding) > match_threshold
  and memories.user_id = p_user_id
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;
