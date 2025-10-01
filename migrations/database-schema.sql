-- Database Schema Documentation for Clarifier
-- Description: Complete schema definition with tables, indexes, and RLS policies
-- Date: 2025-01-27
-- Status: Schema is already deployed in Supabase
-- Purpose: Documentation and reference for the database structure

-- ==============================================
-- 1. CREATE TABLES
-- ==============================================

-- Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  usage_count INT DEFAULT 0,
  tier TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sessions table (stores idea generation sessions)
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  final_brief TEXT,
  final_output JSONB
);

-- Create messages table (stores conversation history)
CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================
-- 2. CREATE INDEXES
-- ==============================================

-- Index for user session queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);

-- Index for session message queries
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);

-- Index for sessions by domain (common filter)
CREATE INDEX IF NOT EXISTS idx_sessions_domain ON public.sessions(domain);

-- Index for sessions by creation date (for ordering)
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions(created_at DESC);

-- Index for messages by creation date (for ordering)
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at ASC);

-- Index for messages by role (for filtering)
CREATE INDEX IF NOT EXISTS idx_messages_role ON public.messages(role);

-- Composite index for user sessions with domain filter
CREATE INDEX IF NOT EXISTS idx_sessions_user_domain ON public.sessions(user_id, domain);

-- Composite index for session messages with role filter
CREATE INDEX IF NOT EXISTS idx_messages_session_role ON public.messages(session_id, role);

-- ==============================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- 4. CREATE RLS POLICIES
-- ==============================================

-- Profiles policies
CREATE POLICY IF NOT EXISTS "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Sessions policies
CREATE POLICY IF NOT EXISTS "Users can manage own sessions"
  ON public.sessions FOR ALL
  USING (auth.uid() = user_id);

-- Messages policies
CREATE POLICY IF NOT EXISTS "Users can manage messages in own sessions"
  ON public.messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = messages.session_id
      AND sessions.user_id = auth.uid()
    )
  );

-- ==============================================
-- 5. ADD COMMENTS FOR DOCUMENTATION
-- ==============================================

COMMENT ON TABLE public.profiles IS 'User profiles extending auth.users with additional metadata';
COMMENT ON TABLE public.sessions IS 'Idea generation sessions with domain context';
COMMENT ON TABLE public.messages IS 'Conversation history for each session';

COMMENT ON COLUMN public.profiles.usage_count IS 'Number of API calls or interactions made by user';
COMMENT ON COLUMN public.profiles.tier IS 'User subscription tier (free, premium)';
COMMENT ON COLUMN public.sessions.domain IS 'Domain or category for the session (e.g., "technology", "business")';
COMMENT ON COLUMN public.sessions.final_brief IS 'Final brief generated from the conversation';
COMMENT ON COLUMN public.sessions.final_output IS 'Structured output data in JSON format';
COMMENT ON COLUMN public.messages.role IS 'Message role: user or assistant';
COMMENT ON COLUMN public.messages.content IS 'Message content text';

-- ==============================================
-- 6. VERIFICATION QUERIES
-- ==============================================

-- Verify tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'sessions', 'messages');

-- Verify indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%';

-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'sessions', 'messages');

-- Verify policies exist
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'sessions', 'messages');
