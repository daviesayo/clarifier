# Database Schema Documentation

## Overview

This document describes the database schema for Clarifier, a Next.js application that helps users generate ideas through structured conversations. The schema is built on Supabase (PostgreSQL) and includes three main tables with Row Level Security (RLS) policies.

## Table Structure

### 1. Profiles Table (`public.profiles`)

Extends the Supabase `auth.users` table with additional user metadata.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, FK to auth.users(id) | User identifier |
| `email` | TEXT | NULL | User email address |
| `usage_count` | INT | DEFAULT 0 | Number of API calls/interactions |
| `tier` | TEXT | DEFAULT 'free' | Subscription tier (free/premium) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Profile creation timestamp |

**Relationships:**
- One-to-one with `auth.users` (CASCADE DELETE)

### 2. Sessions Table (`public.sessions`)

Stores idea generation sessions with domain-specific context.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Session identifier |
| `user_id` | UUID | NOT NULL, FK to auth.users(id) | Owner of the session |
| `domain` | TEXT | NOT NULL | Session domain/category |
| `status` | TEXT | NOT NULL, DEFAULT 'questioning', CHECK (status IN ('questioning', 'generating', 'completed')) | Current phase of the session |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Session creation timestamp |
| `final_brief` | TEXT | NULL | Generated brief from conversation |
| `final_output` | JSONB | NULL | Structured output data |

**Relationships:**
- Many-to-one with `auth.users` (CASCADE DELETE)
- One-to-many with `messages` (CASCADE DELETE)

### 3. Messages Table (`public.messages`)

Stores conversation history for each session.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGSERIAL | PRIMARY KEY | Message identifier |
| `session_id` | UUID | NOT NULL, FK to sessions(id) | Parent session |
| `role` | TEXT | NOT NULL, CHECK (role IN ('user', 'assistant')) | Message role |
| `content` | TEXT | NOT NULL | Message content |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Message timestamp |

**Relationships:**
- Many-to-one with `sessions` (CASCADE DELETE)

## Performance Indexes

The schema includes several indexes for optimal query performance:

### Primary Indexes
- `idx_sessions_user_id` - User session queries
- `idx_messages_session_id` - Session message queries

### Filtering Indexes
- `idx_sessions_domain` - Sessions by domain
- `idx_sessions_status` - Sessions by status
- `idx_messages_role` - Messages by role

### Ordering Indexes
- `idx_sessions_created_at` - Sessions by creation date (DESC)
- `idx_messages_created_at` - Messages by creation date (ASC)

### Composite Indexes
- `idx_sessions_user_domain` - User sessions with domain filter
- `idx_sessions_user_status` - User sessions with status filter
- `idx_messages_session_role` - Session messages with role filter

## Row Level Security (RLS)

All tables have RLS enabled to ensure data isolation between users.

### Profiles Policies
- **Read**: Users can only read their own profile
- **Update**: Users can only update their own profile
- **Insert**: Users can only insert their own profile

### Sessions Policies
- **All Operations**: Users can only access sessions they created

### Messages Policies
- **All Operations**: Users can only access messages from their own sessions

## Data Integrity

### Foreign Key Constraints
- `profiles.id` → `auth.users(id)` (CASCADE DELETE)
- `sessions.user_id` → `auth.users(id)` (CASCADE DELETE)
- `messages.session_id` → `sessions(id)` (CASCADE DELETE)

### Data Validation
- Message roles must be either 'user' or 'assistant'
- Required fields are enforced with NOT NULL constraints
- Default values are set for optional fields

## Usage Examples

### TypeScript Integration

```typescript
import { createClient } from '@/lib/supabase/client'
import type { Database, Profile, Session, Message } from '@/types/supabase'

const supabase = createClient<Database>()

// Get user profile
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single()

// Get user sessions
const { data: sessions } = await supabase
  .from('sessions')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })

// Get session messages
const { data: messages } = await supabase
  .from('messages')
  .select('*')
  .eq('session_id', sessionId)
  .order('created_at', { ascending: true })
```

### Database Services

```typescript
import { profileService, sessionService, messageService } from '@/lib/database'

// Create a new session
const { data: session } = await sessionService.createSession({
  user_id: userId,
  domain: 'technology'
})

// Add a message
const { data: message } = await messageService.addUserMessage(
  session.id,
  'Hello, I need help with a project idea'
)
```

## Migration Scripts

The schema includes several migration scripts:

- `001_create_tables.sql` - Creates all tables
- `002_create_indexes.sql` - Creates performance indexes
- `003_create_policies.sql` - Creates RLS policies
- `setup.sql` - Complete setup script
- `rollback.sql` - Removes all schema components

## Security Considerations

1. **Data Isolation**: RLS policies ensure users can only access their own data
2. **Authentication Required**: All operations require valid user authentication
3. **Cascading Deletes**: User deletion properly cleans up all related data
4. **Input Validation**: Database constraints prevent invalid data insertion

## Performance Considerations

1. **Indexed Queries**: Common query patterns are optimized with indexes
2. **Efficient Joins**: Foreign key relationships enable efficient data retrieval
3. **Pagination Support**: Services include pagination for large datasets
4. **Query Optimization**: Composite indexes support complex filtering

## Monitoring and Maintenance

### Query Performance
- Monitor query execution times (target: <100ms for typical operations)
- Use `EXPLAIN ANALYZE` for slow queries
- Review index usage with `pg_stat_user_indexes`

### Data Growth
- Monitor table sizes and growth rates
- Consider partitioning for very large datasets
- Implement data retention policies if needed

### Security Auditing
- Regularly review RLS policies
- Monitor for unauthorized access attempts
- Audit user data access patterns

## Troubleshooting

### Common Issues

1. **RLS Policy Violations**: Ensure user is authenticated and accessing own data
2. **Foreign Key Violations**: Verify referenced records exist before insertion
3. **Constraint Violations**: Check data types and required fields
4. **Performance Issues**: Review query patterns and index usage

### Debug Queries

```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables WHERE schemaname = 'public';

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes WHERE schemaname = 'public';
```
