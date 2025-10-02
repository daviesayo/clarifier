-- Migration: Add status column to sessions table
-- Date: 2025-10-02
-- Description: Adds status column to track conversation phase (questioning, generating, completed)
-- Author: OpenSpec Change - implement-termination-logic

-- ==============================================
-- 1. ADD STATUS COLUMN
-- ==============================================

-- Add status column with CHECK constraint for valid values
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS status TEXT 
  NOT NULL 
  DEFAULT 'questioning' 
  CHECK (status IN ('questioning', 'generating', 'completed'));

-- ==============================================
-- 2. CREATE INDEX FOR STATUS
-- ==============================================

-- Index for sessions by status (common filter)
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);

-- Composite index for user sessions with status filter
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON public.sessions(user_id, status);

-- ==============================================
-- 3. ADD COMMENT FOR DOCUMENTATION
-- ==============================================

COMMENT ON COLUMN public.sessions.status IS 'Current phase of the session: questioning, generating, or completed';

-- ==============================================
-- 4. UPDATE EXISTING SESSIONS
-- ==============================================

-- Update existing sessions to have 'questioning' status
-- (This is idempotent because of the DEFAULT value, but explicitly setting it for clarity)
UPDATE public.sessions 
SET status = 'questioning' 
WHERE status IS NULL;

-- ==============================================
-- 5. VERIFICATION QUERY
-- ==============================================

-- Verify the column exists and has correct constraints
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'sessions' 
  AND column_name = 'status';

-- Verify indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'sessions'
  AND indexname LIKE '%status%';

-- ==============================================
-- ROLLBACK SCRIPT (for reference)
-- ==============================================
-- To rollback this migration, run:
--
-- DROP INDEX IF EXISTS public.idx_sessions_status;
-- DROP INDEX IF EXISTS public.idx_sessions_user_status;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS status;

