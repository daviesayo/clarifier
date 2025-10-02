-- Rollback Migration: Remove question_type and intensity columns
-- Description: Removes question_type column from messages table and intensity column from sessions table
-- Date: 2025-01-27
-- Purpose: Rollback the persistent question types feature

-- ==============================================
-- 1. REMOVE INDEXES
-- ==============================================

-- Drop indexes first
DROP INDEX IF EXISTS public.idx_messages_question_type;
DROP INDEX IF EXISTS public.idx_sessions_intensity;

-- ==============================================
-- 2. REMOVE COLUMNS
-- ==============================================

-- Remove question_type column from messages table
ALTER TABLE public.messages DROP COLUMN IF EXISTS question_type;

-- Remove intensity column from sessions table
ALTER TABLE public.sessions DROP COLUMN IF EXISTS intensity;

-- ==============================================
-- 3. VERIFICATION QUERIES
-- ==============================================

-- Verify question_type column was removed
SELECT column_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'messages' 
AND column_name = 'question_type';

-- Verify intensity column was removed
SELECT column_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'sessions' 
AND column_name = 'intensity';

-- Verify indexes were removed
SELECT indexname
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname IN ('idx_messages_question_type', 'idx_sessions_intensity');
