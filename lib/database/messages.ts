import { createClient } from '@/lib/supabase/server'
import type { 
  Message, 
  MessageInsert, 
  MessageUpdate, 
  QueryResult, 
  QueryResultWithCount,
  MessageFilters,
  PaginationOptions,
  SortOptions
} from './types'

export class MessageService {
  async getMessage(messageId: number): Promise<QueryResult<Message>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async getMessages(
    sessionId: string,
    filters?: MessageFilters,
    pagination?: PaginationOptions,
    sort?: SortOptions
  ): Promise<QueryResultWithCount<Message[]>> {
    try {
      const supabase = await createClient()
      let query = supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('session_id', sessionId)

      // Apply filters
      if (filters?.role) {
        query = query.eq('role', filters.role)
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
        query = query.order('created_at', { ascending: true })
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

  async createMessage(message: MessageInsert): Promise<QueryResult<Message>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('messages')
        .insert(message)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async updateMessage(messageId: number, updates: MessageUpdate): Promise<QueryResult<Message>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('messages')
        .update(updates)
        .eq('id', messageId)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async deleteMessage(messageId: number): Promise<QueryResult<null>> {
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)

      return { data: null, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async getMessagesByRole(sessionId: string, role: 'user' | 'assistant'): Promise<QueryResult<Message[]>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .eq('role', role)
        .order('created_at', { ascending: true })

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async getConversationHistory(sessionId: string): Promise<QueryResult<Message[]>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async addUserMessage(sessionId: string, content: string): Promise<QueryResult<Message>> {
    return this.createMessage({
      session_id: sessionId,
      role: 'user',
      content
    })
  }

  async addAssistantMessage(sessionId: string, content: string): Promise<QueryResult<Message>> {
    return this.createMessage({
      session_id: sessionId,
      role: 'assistant',
      content
    })
  }
}

// Export singleton instance
export const messageService = new MessageService()