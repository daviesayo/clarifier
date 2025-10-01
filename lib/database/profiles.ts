import { createClient } from '@/lib/supabase/server'
import type { Profile, ProfileInsert, ProfileUpdate, QueryResult } from './types'

export class ProfileService {
  private supabase = createClient()

  async getProfile(userId: string): Promise<QueryResult<Profile>> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async createProfile(profile: ProfileInsert): Promise<QueryResult<Profile>> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .insert(profile)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async updateProfile(userId: string, updates: ProfileUpdate): Promise<QueryResult<Profile>> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async incrementUsageCount(userId: string): Promise<QueryResult<Profile>> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .update({ usage_count: this.supabase.raw('usage_count + 1') })
        .eq('id', userId)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async updateTier(userId: string, tier: 'free' | 'premium'): Promise<QueryResult<Profile>> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .update({ tier })
        .eq('id', userId)
        .select()
        .single()

      return { data, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }
}

// Export singleton instance
export const profileService = new ProfileService()
