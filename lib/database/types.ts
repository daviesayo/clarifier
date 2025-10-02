// Re-export types for easier imports
export type {
  Database,
} from '@/types/supabase'

// Import Database type for use in this file
import type { Database } from '@/types/supabase'

// Helper types for common operations
export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export type Session = Database['public']['Tables']['sessions']['Row']
export type SessionInsert = Database['public']['Tables']['sessions']['Insert']
export type SessionUpdate = Database['public']['Tables']['sessions']['Update']

export type Message = Database['public']['Tables']['messages']['Row']
export type MessageInsert = Database['public']['Tables']['messages']['Insert']
export type MessageUpdate = Database['public']['Tables']['messages']['Update']

// Role type for messages
export type MessageRole = "user" | "assistant"

// Tier type for profiles
export type ProfileTier = "free" | "premium"

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