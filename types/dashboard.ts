import { Tables } from './supabase'

// Base types from database
export type Session = Tables<'sessions'>
export type Message = Tables<'messages'>

// Extended session type with message count and formatted data
export interface SessionWithDetails extends Session {
  message_count: number
  last_message_at: string | null
  formatted_created_at: string
  formatted_domain: string
}

// API response types
export interface SessionsResponse {
  sessions: SessionWithDetails[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface SessionDetailResponse {
  session: Session
  messages: Message[]
}

// Filter and sort types
export type SessionStatus = 'questioning' | 'generating' | 'completed'
export type SortField = 'created_at' | 'domain' | 'status'
export type SortOrder = 'asc' | 'desc'

export interface SessionFilters {
  domain?: string | undefined
  status?: SessionStatus | undefined
  search?: string | undefined
  sortBy?: SortField | undefined
  sortOrder?: SortOrder | undefined
  page?: number | undefined
  limit?: number | undefined
}

// Session management action types
export interface RenameSessionRequest {
  sessionId: string
  newDomain: string
}

export interface DeleteSessionRequest {
  sessionId: string
}

export interface ExportSessionRequest {
  sessionId: string
  format: 'markdown' | 'json'
}

// UI state types
export interface DashboardState {
  sessions: SessionWithDetails[]
  loading: boolean
  error: string | null
  filters: SessionFilters
  selectedSession: string | null
  total: number
  hasMore: boolean
}
