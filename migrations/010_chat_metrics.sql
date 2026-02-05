-- Migration: 010_chat_metrics.sql
-- Purpose: Add response-time and feedback fields to chat sessions

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS first_response_ms INTEGER;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS avg_response_ms INTEGER;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS feedback_rating INTEGER;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS feedback_comment TEXT;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS feedback_sentiment TEXT;

ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS feedback_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS chat_sessions_user_created_idx
ON public.chat_sessions (user_id, created_at);
