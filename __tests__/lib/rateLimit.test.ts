import { 
  checkRateLimit, 
  incrementUsage, 
  getTierLimits, 
  createRateLimitError, 
  getRateLimitHeaders 
} from '@/lib/rateLimit'
import { createClient } from '@/lib/supabase/server'

// Mock Supabase client
jest.mock('@/lib/supabase/server')
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

describe('Rate Limiting Utility', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
      raw: jest.fn()
    }
    mockCreateClient.mockResolvedValue(mockSupabase)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getTierLimits', () => {
    it('should return correct limits for free tier', () => {
      const limits = getTierLimits('free')
      expect(limits).toEqual({ sessions: 10 })
    })

    it('should return correct limits for pro tier', () => {
      const limits = getTierLimits('pro')
      expect(limits).toEqual({ sessions: 999999 })
    })

    it('should default to free tier limits for unknown tier', () => {
      const limits = getTierLimits('unknown')
      expect(limits).toEqual({ sessions: 10 })
    })
  })

  describe('checkRateLimit', () => {
    it('should allow free user under limit', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { usage_count: 5, tier: 'free' },
        error: null
      })

      const result = await checkRateLimit('user-123')
      
      expect(result).toEqual({
        allowed: true,
        remaining: 5,
        limit: 10,
        tier: 'free',
        resetTime: undefined
      })
    })

    it('should block free user at limit', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { usage_count: 10, tier: 'free' },
        error: null
      })

      const result = await checkRateLimit('user-123')
      
      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        limit: 10,
        tier: 'free',
        resetTime: undefined
      })
    })

    it('should allow pro user with high usage', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { usage_count: 500, tier: 'pro' },
        error: null
      })

      const result = await checkRateLimit('user-123')
      
      expect(result).toEqual({
        allowed: true,
        remaining: 999499,
        limit: 999999,
        tier: 'pro',
        resetTime: undefined
      })
    })

    it('should handle premium tier (backward compatibility)', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { usage_count: 5, tier: 'premium' },
        error: null
      })

      const result = await checkRateLimit('user-123')
      
      expect(result).toEqual({
        allowed: true,
        remaining: 999994,
        limit: 999999,
        tier: 'pro',
        resetTime: undefined
      })
    })

    it('should handle null usage_count', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { usage_count: null, tier: 'free' },
        error: null
      })

      const result = await checkRateLimit('user-123')
      
      expect(result).toEqual({
        allowed: true,
        remaining: 10,
        limit: 10,
        tier: 'free',
        resetTime: undefined
      })
    })

    it('should handle database error gracefully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      })

      const result = await checkRateLimit('user-123')
      
      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        limit: 0,
        tier: 'free',
        resetTime: undefined
      })
    })

    it('should handle invalid userId', async () => {
      const result = await checkRateLimit('')
      
      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        limit: 0,
        tier: 'free',
        resetTime: undefined
      })
    })
  })

  describe('incrementUsage', () => {
    it('should increment usage count atomically', async () => {
      const mockProfile = { id: 'user-123', usage_count: 5, tier: 'free' }
      mockSupabase.raw.mockReturnValue('usage_count + 1')
      mockSupabase.single.mockResolvedValue({
        data: { ...mockProfile, usage_count: 6 },
        error: null
      })

      const result = await incrementUsage('user-123')
      
      expect(result.data).toEqual({ ...mockProfile, usage_count: 6 })
      expect(result.error).toBeNull()
      expect(mockSupabase.raw).toHaveBeenCalledWith('usage_count + 1')
    })

    it('should handle increment error', async () => {
      mockSupabase.raw.mockReturnValue('usage_count + 1')
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' }
      })

      const result = await incrementUsage('user-123')
      
      expect(result.data).toBeNull()
      expect(result.error).toEqual({ message: 'Update failed' })
    })

    it('should handle profile not found', async () => {
      mockSupabase.raw.mockReturnValue('usage_count + 1')
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: null
      })

      const result = await incrementUsage('user-123')
      
      expect(result.data).toBeNull()
      expect(result.error).toEqual(new Error('Profile not found'))
    })

    it('should handle invalid userId', async () => {
      const result = await incrementUsage('')
      
      expect(result.data).toBeNull()
      expect(result.error).toEqual(new Error('Invalid userId provided'))
    })
  })

  describe('createRateLimitError', () => {
    it('should create error with rate limit context', () => {
      const rateLimitResult = {
        allowed: false,
        remaining: 0,
        limit: 10,
        tier: 'free' as const,
        resetTime: undefined
      }

      const error = createRateLimitError(rateLimitResult)
      
      expect(error.message).toBe('Rate limit exceeded')
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED')
      expect(error.remaining).toBe(0)
      expect(error.limit).toBe(10)
      expect(error.tier).toBe('free')
    })
  })

  describe('getRateLimitHeaders', () => {
    it('should return correct headers', () => {
      const rateLimitResult = {
        allowed: true,
        remaining: 5,
        limit: 10,
        tier: 'free' as const,
        resetTime: undefined
      }

      const headers = getRateLimitHeaders(rateLimitResult)
      
      expect(headers).toEqual({
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': '5',
        'X-RateLimit-Tier': 'free',
        'Retry-After': '86400'
      })
    })
  })
})
