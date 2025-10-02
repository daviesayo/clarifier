import { createClient } from '@/lib/supabase/server'
import type { 
  Session, 
  SessionInsert, 
  SessionUpdate, 
  QueryResult, 
  QueryResultWithCount,
  SessionFilters,
  PaginationOptions,
  SortOptions
} from './types'

export class SessionService {
  async getSession(sessionId: string): Promise<QueryResult<Session>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async getSessions(
    userId: string, 
    filters?: SessionFilters,
    pagination?: PaginationOptions,
    sort?: SortOptions
  ): Promise<QueryResultWithCount<Session[]>> {
    try {
      const supabase = await createClient()
      let query = supabase
        .from('sessions')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)

      // Apply filters
      if (filters?.domain) {
        query = query.eq('domain', filters.domain)
      }
      if (filters?.created_after) {
        query = query.gte('created_at', filters.created_after)
      }
      if (filters?.created_before) {
        query = query.lte('created_at', filters.created_before)
      }

      // Apply sorting
      if (sort) {
        query = query.order(sort.column, { ascending: sort.ascending ?? true })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      // Apply pagination
      if (pagination?.limit) {
        const offset = pagination.offset ?? (pagination.page ? (pagination.page - 1) * pagination.limit : 0)
        query = query.range(offset, offset + pagination.limit - 1)
      }

      const { data, error, count } = await query

      return { data, error, count }
    } catch (error) {
      return { data: null, count: null, error: error as Error }
    }
  }

  async createSession(session: SessionInsert): Promise<QueryResult<Session>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('sessions')
        .insert(session)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async updateSession(sessionId: string, updates: SessionUpdate): Promise<QueryResult<Session>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('sessions')
        .update(updates)
        .eq('id', sessionId)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async deleteSession(sessionId: string): Promise<QueryResult<null>> {
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId)

      return { data: null, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async updateSessionOutput(sessionId: string, finalBrief: string, finalOutput: Record<string, unknown>): Promise<QueryResult<Session>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('sessions')
        .update({ 
          final_brief: finalBrief,
          final_output: finalOutput
        })
        .eq('id', sessionId)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async getSessionsByDomain(userId: string, domain: string): Promise<QueryResult<Session[]>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('domain', domain)
        .order('created_at', { ascending: false })

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }
}

// Export singleton instance
export const sessionService = new SessionService()