import { createClient } from '@/lib/supabase/server'
import type { Profile, ProfileInsert, ProfileUpdate, QueryResult } from './types'

export class ProfileService {
  async getProfile(userId: string): Promise<QueryResult<Profile>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
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
      const supabase = await createClient()
      const { data, error } = await supabase
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
      const supabase = await createClient()
      const { data, error } = await supabase
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
      const supabase = await createClient()
      
      // First get the current profile
      const { data: currentProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('usage_count')
        .eq('id', userId)
        .single()
      
      if (fetchError) {
        return { data: null, error: fetchError }
      }
      
      // Then increment the usage count
      const { data, error } = await supabase
        .from('profiles')
        .update({ 
          usage_count: currentProfile.usage_count + 1
        })
        .eq('id', userId)
        .select('*')
        .single()

      if (error) {
        return { data: null, error }
      }

      if (!data) {
        return { data: null, error: new Error('Profile not found') }
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  }

  async updateTier(userId: string, tier: 'free' | 'premium' | 'pro'): Promise<QueryResult<Profile>> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
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