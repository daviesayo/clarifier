import { checkRateLimit, incrementUsage } from '@/lib/rateLimit';
import { createClient } from '@/lib/supabase/server';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

describe('Rate Limit Profile Creation', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSupabase = {
      from: jest.fn(),
      auth: {
        getUser: jest.fn(),
      },
    };
    
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  describe('checkRateLimit', () => {
    it('should create a profile when one does not exist', async () => {
      const userId = 'test-user-123';
      const userEmail = 'test@example.com';

      // Mock profile not found (PGRST116 error code)
      const profileQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows returned' }
        })
      };

      // Mock auth.getUser to return user data
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId, email: userEmail } },
        error: null
      });

      // Mock profile creation
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: userId, email: userEmail, usage_count: 0, tier: 'free' },
          error: null
        })
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'profiles') {
          return profileQuery;
        }
        return insertQuery;
      });

      const result = await checkRateLimit(userId);

      expect(result).toEqual({
        allowed: true,
        remaining: 10,
        limit: 10,
        tier: 'free'
      });

      // Verify profile creation was attempted
      expect(insertQuery.insert).toHaveBeenCalledWith({
        id: userId,
        email: userEmail,
        usage_count: 0,
        tier: 'free'
      });
    });

    it('should handle existing profile normally', async () => {
      const userId = 'test-user-123';
      const existingProfile = { usage_count: 5, tier: 'free' };

      const profileQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: existingProfile,
          error: null
        })
      };

      mockSupabase.from.mockReturnValue(profileQuery);

      const result = await checkRateLimit(userId);

      expect(result).toEqual({
        allowed: true,
        remaining: 5, // 10 - 5 = 5 remaining
        limit: 10,
        tier: 'free'
      });

      // Verify profile creation was not attempted
      expect(profileQuery.insert).toBeUndefined();
    });
  });

  describe('incrementUsage', () => {
    it('should create a profile with usage_count = 1 when one does not exist', async () => {
      const userId = 'test-user-123';
      const userEmail = 'test@example.com';

      // Mock profile not found
      const profileQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'No rows returned' }
        })
      };

      // Mock auth.getUser
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId, email: userEmail } },
        error: null
      });

      // Mock profile creation
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: userId, email: userEmail, usage_count: 1, tier: 'free' },
          error: null
        })
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'profiles') {
          return profileQuery;
        }
        return insertQuery;
      });

      const result = await incrementUsage(userId);

      expect(result.data).toEqual({
        id: userId,
        email: userEmail,
        usage_count: 1,
        tier: 'free'
      });
      expect(result.error).toBeNull();

      // Verify profile creation with usage_count = 1
      expect(insertQuery.insert).toHaveBeenCalledWith({
        id: userId,
        email: userEmail,
        usage_count: 1,
        tier: 'free'
      });
    });
  });
});