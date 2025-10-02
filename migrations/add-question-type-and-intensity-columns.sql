-- Migration: Add question_type and intensity columns
-- Description: Adds question_type column to messages table and intensity column to sessions table
-- Date: 2025-01-27
-- Purpose: Enable persistent question types and intensity preferences

-- ==============================================
-- 1. ADD QUESTION_TYPE COLUMN TO MESSAGES TABLE
-- ==============================================

-- Add question_type column to messages table
ALTER TABLE public.messages 
ADD COLUMN question_type TEXT CHECK (question_type IN ('basic', 'deep'));

-- Add comment for documentation
COMMENT ON COLUMN public.messages.question_type IS 'Question type for assistant messages: basic or deep';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_messages_question_type ON public.messages(question_type) 
WHERE question_type IS NOT NULL;

-- ==============================================
-- 2. ADD INTENSITY COLUMN TO SESSIONS TABLE
-- ==============================================

-- Add intensity column to sessions table
ALTER TABLE public.sessions 
ADD COLUMN intensity TEXT DEFAULT 'deep' CHECK (intensity IN ('basic', 'deep'));

-- Add comment for documentation
COMMENT ON COLUMN public.sessions.intensity IS 'Current intensity setting for the session: basic or deep';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_sessions_intensity ON public.sessions(intensity);

-- ==============================================
-- 3. VERIFICATION QUERIES
-- ==============================================

-- Verify question_type column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'messages' 
AND column_name = 'question_type';

-- Verify intensity column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'sessions' 
AND column_name = 'intensity';

-- Verify indexes were created
SELECT indexname, tablename, indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname IN ('idx_messages_question_type', 'idx_sessions_intensity');

-- Verify check constraints
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint 
WHERE conrelid = 'public.messages'::regclass 
AND conname LIKE '%question_type%';

SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint 
WHERE conrelid = 'public.sessions'::regclass 
AND conname LIKE '%intensity%';
