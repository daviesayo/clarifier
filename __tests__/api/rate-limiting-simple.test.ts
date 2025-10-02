import { checkRateLimit, incrementUsage, getTierLimits } from '@/lib/rateLimit'
import { createClient } from '@/lib/supabase/server'

// Mock Supabase client
jest.mock('@/lib/supabase/server')
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

describe('Rate Limiting Integration', () => {
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

  describe('Rate Limit Check Integration', () => {
    it('should block free user at limit', async () => {
      // Mock user at limit
      mockSupabase.single.mockResolvedValue({
        data: { usage_count: 10, tier: 'free' },
        error: null
      })

      const result = await checkRateLimit('user-123')
      
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.limit).toBe(10)
      expect(result.tier).toBe('free')
    })

    it('should allow free user under limit', async () => {
      // Mock user under limit
      mockSupabase.single.mockResolvedValue({
        data: { usage_count: 5, tier: 'free' },
        error: null
      })

      const result = await checkRateLimit('user-123')
      
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(5)
      expect(result.limit).toBe(10)
      expect(result.tier).toBe('free')
    })

    it('should allow pro user with high usage', async () => {
      // Mock pro user with high usage
      mockSupabase.single.mockResolvedValue({
        data: { usage_count: 500, tier: 'pro' },
        error: null
      })

      const result = await checkRateLimit('user-123')
      
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(999499)
      expect(result.limit).toBe(999999)
      expect(result.tier).toBe('pro')
    })
  })

  describe('Usage Increment Integration', () => {
    it('should increment usage atomically', async () => {
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

    it('should handle increment errors gracefully', async () => {
      mockSupabase.raw.mockReturnValue('usage_count + 1')
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      })

      const result = await incrementUsage('user-123')
      
      expect(result.data).toBeNull()
      expect(result.error).toEqual({ message: 'Database error' })
    })
  })

  describe('Tier Limits Configuration', () => {
    it('should return correct limits for each tier', () => {
      expect(getTierLimits('free')).toEqual({ sessions: 10 })
      expect(getTierLimits('pro')).toEqual({ sessions: 999999 })
      expect(getTierLimits('unknown')).toEqual({ sessions: 10 })
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      })

      const result = await checkRateLimit('user-123')
      
      // Should return conservative result (deny access)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.limit).toBe(0)
      expect(result.tier).toBe('free')
    })

    it('should handle invalid userId', async () => {
      const result = await checkRateLimit('')
      
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.limit).toBe(0)
      expect(result.tier).toBe('free')
    })
  })
})
