import { POST } from '@/app/api/chat/route';

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(),
    })),
  })),
};

// Mock the Supabase server client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock NextRequest for Node.js environment
const createMockRequest = (body: any) => ({
  json: jest.fn().mockResolvedValue(body),
} as any);

describe('/api/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/chat', () => {
    it('should return 400 for invalid request data', async () => {
      const request = createMockRequest({
        message: '', // Invalid: empty message
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request data');
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid domain', async () => {
      const request = createMockRequest({
        message: 'Test message',
        domain: 'invalid-domain', // Invalid domain
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request data');
    });

    it('should return 401 for unauthenticated request', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = createMockRequest({
        message: 'Test message',
        domain: 'business',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 404 when user profile not found', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Profile not found' },
            }),
          })),
        })),
      });

      const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User profile not found');
    });

    it('should return 429 when rate limit exceeded', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { id: 'user-123', tier: 'free', usage_count: 10 }, // At limit
              error: null,
            }),
          })),
        })),
      });

      const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Rate limit exceeded');
    });

    it('should create new session successfully', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { id: 'user-123', tier: 'free', usage_count: 5 },
              error: null,
            }),
          })),
        })),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
              error: null,
            }),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ error: null }),
        })),
      });

      const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('session-123');
      expect(data.responseMessage).toContain('Questioning mode');
      expect(data.isCompleted).toBe(false);
    });

    it('should retrieve existing session successfully', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock all database calls with a generic mock
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'user-123', tier: 'free', usage_count: 5 },
                  error: null,
                }),
              })),
            })),
          };
        } else if (table === 'sessions') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { id: '123e4567-e89b-12d3-a456-426614174000', user_id: 'user-123', domain: 'business' },
                  error: null,
                }),
              })),
            })),
          };
        } else if (table === 'messages') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const request = createMockRequest({
        sessionId: '123e4567-e89b-12d3-a456-426614174000', // Valid UUID
        message: 'Test message',
      });

      const response = await POST(request);
      const data = await response.json();

      if (response.status !== 200) {
        console.log('Error response:', data);
      }

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(data.responseMessage).toContain('Questioning mode');
    });

    it('should return 404 for non-existent session', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock profile lookup
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { id: 'user-123', tier: 'free', usage_count: 5 },
              error: null,
            }),
          })),
        })),
      });

      // Mock session not found
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Session not found' },
            }),
          })),
        })),
      });

      const request = createMockRequest({
        sessionId: 'non-existent-session',
        message: 'Test message',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Session not found');
    });

    it('should handle generateNow flag correctly', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock profile lookup
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { id: 'user-123', tier: 'free', usage_count: 5 },
              error: null,
            }),
          })),
        })),
      });

      // Mock session creation
      mockSupabaseClient.from.mockReturnValueOnce({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
              error: null,
            }),
          })),
        })),
      });

      // Mock usage count update
      mockSupabaseClient.from.mockReturnValueOnce({
        update: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ error: null }),
        })),
      });

      // Mock message insert
      mockSupabaseClient.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });

      const request = createMockRequest({
        message: 'Test message',
        domain: 'business',
        generateNow: true,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.responseMessage).toContain('Generation mode');
    });

    it('should return 500 for internal server error', async () => {
      mockSupabaseClient.auth.getUser.mockRejectedValue(new Error('Database error'));

      const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
      expect(data.code).toBe('INTERNAL_ERROR');
    });
  });
});
