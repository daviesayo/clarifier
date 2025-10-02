import { createClient } from '@/lib/supabase/server'
import type { 
  Profile, 
  QueryResult, 
  RateLimitResult, 
  RateLimitConfig, 
  RateLimitError 
} from '@/lib/database/types'

/**
 * Rate limiting utility for Clarifier's freemium model.
 * Enforces session limits based on user subscription tiers.
 */

// Tier-based session limits
const TIER_LIMITS: RateLimitConfig = {
  free: { sessions: 10 },
  pro: { sessions: 999999 } // Effectively unlimited
}

/**
 * Get session limits for a specific tier.
 * @param tier - User's subscription tier
 * @returns Session limit configuration for the tier
 */
export function getTierLimits(tier: string): { sessions: number } {
  switch (tier) {
    case 'free':
      return TIER_LIMITS.free
    case 'pro':
      return TIER_LIMITS.pro
    default:
      // Default to free tier limits for unknown tiers
      return TIER_LIMITS.free
  }
}

/**
 * Check if a user can create a new session based on their tier and usage.
 * @param userId - User's unique identifier
 * @returns Promise resolving to rate limit status
 */
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  try {
    // Validate input
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId provided')
    }

    const supabase = await createClient()
    
    // Fetch user profile with usage count and tier
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('usage_count, tier')
      .eq('id', userId)
      .single()

    if (error) {
      throw new Error(`Failed to fetch user profile: ${error.message}`)
    }

    if (!profile) {
      throw new Error('User profile not found')
    }

    // Normalize tier (handle both 'premium' and 'pro' for backward compatibility)
    const normalizedTier = profile.tier === 'premium' ? 'pro' : profile.tier as 'free' | 'pro'
    
    // Get tier-specific limits
    const limits = getTierLimits(normalizedTier)
    const currentUsage = profile.usage_count || 0
    const remaining = Math.max(0, limits.sessions - currentUsage)
    const allowed = currentUsage < limits.sessions

    return {
      allowed,
      remaining,
      limit: limits.sessions,
      tier: normalizedTier,
      resetTime: undefined // No time-based reset for session limits
    }
  } catch (error) {
    // Log error for debugging
    console.error('Rate limit check failed:', error)
    
    // Return a conservative result (deny access) on error
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      tier: 'free',
      resetTime: undefined
    }
  }
}

/**
 * Atomically increment user's usage count.
 * Uses database-level atomic increment to prevent race conditions.
 * @param userId - User's unique identifier
 * @returns Promise resolving to updated profile or error
 */
export async function incrementUsage(userId: string): Promise<QueryResult<Profile>> {
  try {
    // Validate input
    if (!userId || typeof userId !== 'string') {
      return { data: null, error: new Error('Invalid userId provided') }
    }

    const supabase = await createClient()
    
    // Use atomic increment to prevent race conditions
    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        usage_count: supabase.raw('usage_count + 1')
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
    console.error('Usage increment failed:', error)
    return { data: null, error: error as Error }
  }
}

/**
 * Create a rate limit error with helpful context.
 * @param result - Rate limit result that triggered the error
 * @returns RateLimitError instance
 */
export function createRateLimitError(result: RateLimitResult): RateLimitError {
  const error = new Error('Rate limit exceeded') as RateLimitError
  error.code = 'RATE_LIMIT_EXCEEDED'
  error.remaining = result.remaining
  error.limit = result.limit
  error.tier = result.tier
  return error
}

/**
 * Get rate limit headers for HTTP responses.
 * @param result - Rate limit result
 * @returns Headers object with rate limit information
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Tier': result.tier,
    'Retry-After': '86400' // 24 hours (session limits don't reset)
  }
}
