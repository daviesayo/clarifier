// Re-export types for easier imports
export type {
  Database,
  Profile,
  ProfileInsert,
  ProfileUpdate,
  Session,
  SessionInsert,
  SessionUpdate,
  Message,
  MessageInsert,
  MessageUpdate,
  MessageRole,
  ProfileTier,
} from '@/types/supabase'

// Additional utility types
export type DatabaseTable = keyof Database['public']['Tables']

export type TableRow<T extends DatabaseTable> = Database['public']['Tables'][T]['Row']
export type TableInsert<T extends DatabaseTable> = Database['public']['Tables'][T]['Insert']
export type TableUpdate<T extends DatabaseTable> = Database['public']['Tables'][T]['Update']

// Query result types
export type QueryResult<T> = {
  data: T | null
  error: Error | null
}

export type QueryResultWithCount<T> = {
  data: T | null
  count: number | null
  error: Error | null
}

// Common query filters
export type SessionFilters = {
  user_id?: string
  domain?: string
  created_after?: string
  created_before?: string
}

export type MessageFilters = {
  session_id?: string
  role?: MessageRole
  created_after?: string
  created_before?: string
}

// Pagination
export type PaginationOptions = {
  page?: number
  limit?: number
  offset?: number
}

// Sort options
export type SortOptions = {
  column: string
  ascending?: boolean
}
