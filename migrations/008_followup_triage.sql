-- Migration: 008_followup_triage.sql
-- Purpose: Add AI triage + follow-up scheduling fields

-- Chat sessions: store customer contact + triage + follow-up tracking
ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS customer_email TEXT;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS customer_phone TEXT;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS triage JSONB;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS triage_updated_at TIMESTAMPTZ;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS followup_status TEXT;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS followup_scheduled_at TIMESTAMPTZ;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS followup_recipients JSONB;

CREATE INDEX IF NOT EXISTS chat_sessions_followup_due_idx
ON public.chat_sessions (followup_status, followup_scheduled_at);

-- Leads: store AI triage + follow-up tracking
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS intent TEXT;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS priority TEXT;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS next_action TEXT;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS followup_status TEXT;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS followup_scheduled_at TIMESTAMPTZ;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS leads_followup_due_idx
ON public.leads (followup_status, followup_scheduled_at);
