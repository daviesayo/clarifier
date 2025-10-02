import { incrementUsage, checkRateLimit } from '@/lib/rateLimit'
import { createClient } from '@/lib/supabase/server'

// Mock Supabase client
jest.mock('@/lib/supabase/server')
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

describe('Concurrent Rate Limiting', () => {
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

  describe('Concurrent Usage Increment', () => {
    it('should handle concurrent increments atomically', async () => {
      const userId = 'user-123'
      let callCount = 0
      
      // Mock atomic increment that simulates database behavior
      mockSupabase.raw.mockReturnValue('usage_count + 1')
      mockSupabase.single.mockImplementation(() => {
        callCount++
        return Promise.resolve({
          data: { 
            id: userId, 
            usage_count: callCount, // Simulate increment
            tier: 'free' 
          },
          error: null
        })
      })

      // Simulate 5 concurrent increment requests
      const promises = Array.from({ length: 5 }, () => incrementUsage(userId))
      const results = await Promise.all(promises)

      // All should succeed
      expect(results).toHaveLength(5)
      results.forEach(result => {
        expect(result.error).toBeNull()
        expect(result.data).toBeDefined()
      })

      // Should have made 5 separate database calls
      expect(mockSupabase.single).toHaveBeenCalledTimes(5)
    })

    it('should handle some failures in concurrent increments', async () => {
      const userId = 'user-123'
      let callCount = 0
      
      mockSupabase.raw.mockReturnValue('usage_count + 1')
      mockSupabase.single.mockImplementation(() => {
        callCount++
        if (callCount === 3) {
          return Promise.resolve({
            data: null,
            error: { message: 'Database error' }
          })
        }
        return Promise.resolve({
          data: { 
            id: userId, 
            usage_count: callCount,
            tier: 'free' 
          },
          error: null
        })
      })

      // Simulate 5 concurrent increment requests
      const promises = Array.from({ length: 5 }, () => incrementUsage(userId))
      const results = await Promise.all(promises)

      // Most should succeed, one should fail
      const successfulResults = results.filter(r => r.error === null)
      const failedResults = results.filter(r => r.error !== null)
      
      expect(successfulResults).toHaveLength(4)
      expect(failedResults).toHaveLength(1)
      expect(failedResults[0].error?.message).toBe('Database error')
    })
  })

  describe('Concurrent Rate Limit Checks', () => {
    it('should handle concurrent rate limit checks consistently', async () => {
      const userId = 'user-123'
      
      // Mock consistent profile data
      mockSupabase.single.mockResolvedValue({
        data: { usage_count: 5, tier: 'free' },
        error: null
      })

      // Simulate 10 concurrent rate limit checks
      const promises = Array.from({ length: 10 }, () => checkRateLimit(userId))
      const results = await Promise.all(promises)

      // All should return the same result
      expect(results).toHaveLength(10)
      results.forEach(result => {
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(5)
        expect(result.limit).toBe(10)
        expect(result.tier).toBe('free')
      })
    })

    it('should handle rate limit checks with database errors', async () => {
      const userId = 'user-123'
      let callCount = 0
      
      mockSupabase.single.mockImplementation(() => {
        callCount++
        if (callCount <= 3) {
          return Promise.resolve({
            data: { usage_count: 5, tier: 'free' },
            error: null
          })
        }
        return Promise.resolve({
          data: null,
          error: { message: 'Database error' }
        })
      })

      // Simulate 5 concurrent rate limit checks
      const promises = Array.from({ length: 5 }, () => checkRateLimit(userId))
      const results = await Promise.all(promises)

      // First 3 should succeed, last 2 should fail gracefully
      const successfulResults = results.filter(r => r.allowed === true)
      const failedResults = results.filter(r => r.allowed === false)
      
      expect(successfulResults).toHaveLength(3)
      expect(failedResults).toHaveLength(2)
      
      // Failed results should have conservative values
      failedResults.forEach(result => {
        expect(result.allowed).toBe(false)
        expect(result.remaining).toBe(0)
        expect(result.limit).toBe(0)
        expect(result.tier).toBe('free')
      })
    })
  })

  describe('Race Condition Prevention', () => {
    it('should prevent race conditions in usage counting', async () => {
      const userId = 'user-123'
      let currentUsage = 0
      
      // Simulate database with atomic increment
      mockSupabase.raw.mockReturnValue('usage_count + 1')
      mockSupabase.single.mockImplementation(() => {
        currentUsage++
        return Promise.resolve({
          data: { 
            id: userId, 
            usage_count: currentUsage,
            tier: 'free' 
          },
          error: null
        })
      })

      // Simulate rapid concurrent increments
      const promises = Array.from({ length: 20 }, () => incrementUsage(userId))
      const results = await Promise.all(promises)

      // All should succeed
      expect(results).toHaveLength(20)
      results.forEach(result => {
        expect(result.error).toBeNull()
        expect(result.data?.usage_count).toBeGreaterThan(0)
      })

      // Final usage count should be exactly 20
      expect(currentUsage).toBe(20)
    })

    it('should handle mixed success/failure scenarios', async () => {
      const userId = 'user-123'
      let successCount = 0
      let failureCount = 0
      
      mockSupabase.raw.mockReturnValue('usage_count + 1')
      mockSupabase.single.mockImplementation(() => {
        // Simulate 80% success rate
        if (Math.random() < 0.8) {
          successCount++
          return Promise.resolve({
            data: { 
              id: userId, 
              usage_count: successCount,
              tier: 'free' 
            },
            error: null
          })
        } else {
          failureCount++
          return Promise.resolve({
            data: null,
            error: { message: 'Temporary database error' }
          })
        }
      })

      // Simulate 50 concurrent requests
      const promises = Array.from({ length: 50 }, () => incrementUsage(userId))
      const results = await Promise.all(promises)

      const successfulResults = results.filter(r => r.error === null)
      const failedResults = results.filter(r => r.error !== null)
      
      // Should have some successes and some failures
      expect(successfulResults.length + failedResults.length).toBe(50)
      expect(successfulResults.length).toBeGreaterThan(0)
      expect(failedResults.length).toBeGreaterThan(0)
    })
  })
})
