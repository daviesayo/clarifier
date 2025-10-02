// Mock Next.js server APIs before importing
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    json: jest.fn((data, init) => ({
      json: async () => data,
      status: init?.status || 200,
      headers: init?.headers || new Map(),
    })),
  },
}));

// Mock NextRequest for Node.js environment
const createMockRequest = (body: any) => ({
  json: jest.fn().mockResolvedValue(body),
} as any);

import { POST } from '@/app/api/chat/route';

// Helper to create chainable mock
const createChainableMock = (finalValue: any) => {
  const chain: any = {
    select: jest.fn(function() { return chain; }),
    insert: jest.fn(function() { 
      return Promise.resolve(finalValue);
    }),
    update: jest.fn(function() { return chain; }),
    eq: jest.fn(function() { return chain; }),
    order: jest.fn(() => Promise.resolve(finalValue)),
    single: jest.fn(() => Promise.resolve(finalValue)),
  };
  
  const originalInsert = chain.insert;
  chain.insert = jest.fn(function() {
    const insertChain: any = {
      select: jest.fn(function() {
        return {
          single: jest.fn(() => Promise.resolve(finalValue)),
        };
      }),
    };
    insertChain.then = (resolve: any) => Promise.resolve(finalValue).then(resolve);
    insertChain.catch = (reject: any) => Promise.resolve(finalValue).catch(reject);
    return insertChain;
  });
  
  return chain;
};

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn(),
};

// Mock rate limiting
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(),
  incrementUsage: jest.fn(),
  getRateLimitHeaders: jest.fn(() => new Map()),
}));

// Mock conversation loop
jest.mock('@/lib/llm/conversationLoop', () => ({
  continueConversation: jest.fn(),
  ValidationError: class ValidationError extends Error {},
}));

// Mock Supabase server
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

import { checkRateLimit } from '@/lib/rateLimit';
import { continueConversation } from '@/lib/llm/conversationLoop';

describe('Chat API - Termination Logic', () => {
  const mockUser = { id: 'test-user-id', email: 'test@example.com' };
  const mockSessionId = 'test-session-id';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default auth success
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    // Default rate limit success
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      remaining: 5,
      limit: 10,
      tier: 'free',
    });
  });

  describe('Minimum Question Threshold', () => {
    it('should reject generation request with fewer than 3 questions', async () => {
      const mockSession = {
        id: mockSessionId,
        user_id: mockUser.id,
        domain: 'business',
        status: 'questioning',
        created_at: new Date().toISOString(),
      };

      const mockMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there! What is your business idea?' },
        { role: 'user', content: 'A new app' },
        { role: 'assistant', content: 'Tell me more?' },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: mockSession,
            error: null,
          });
        }
        if (table === 'messages') {
          return createChainableMock({
            data: mockMessages,
            error: null,
          });
        }
        return createChainableMock({ data: null, error: null });
      });

      const request = createMockRequest({
        sessionId: mockSessionId,
        message: 'Generate now',
        generateNow: true,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('MIN_QUESTIONS_NOT_MET');
      expect(data.error).toContain('Insufficient questions');
    });

    it('should allow generation with 3 or more questions', async () => {
      const mockSession = {
        id: mockSessionId,
        user_id: mockUser.id,
        domain: 'business',
        status: 'questioning',
        created_at: new Date().toISOString(),
      };

      const mockMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'What is your business idea?' },
        { role: 'user', content: 'A new app' },
        { role: 'assistant', content: 'Who is your target market?' },
        { role: 'user', content: 'Young professionals' },
        { role: 'assistant', content: 'What problem does it solve?' },
      ];

      const mockUpdateChain = createChainableMock({ data: null, error: null });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions' && mockUpdateChain.update.mock.calls.length === 0) {
          return createChainableMock({
            data: mockSession,
            error: null,
          });
        }
        if (table === 'sessions' && mockUpdateChain.update.mock.calls.length > 0) {
          return mockUpdateChain;
        }
        if (table === 'messages') {
          return createChainableMock({
            data: mockMessages,
            error: null,
          });
        }
        return createChainableMock({ data: null, error: null });
      });

      const request = createMockRequest({
        sessionId: mockSessionId,
        message: 'Generate now',
        generateNow: true,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('generating');
      expect(data.isCompleted).toBe(true);
    });
  });

  describe('Session Status Management', () => {
    it('should initialize new sessions with questioning status', async () => {
      const mockNewSession = {
        id: mockSessionId,
        user_id: mockUser.id,
        domain: 'business',
        status: 'questioning',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: mockNewSession,
            error: null,
          });
        }
        if (table === 'messages') {
          return createChainableMock({
            data: [],
            error: null,
          });
        }
        return createChainableMock({ data: null, error: null });
      });

      (continueConversation as jest.Mock).mockResolvedValue('What is your business idea?');

      const request = createMockRequest({
        domain: 'business',
        message: 'I want to start a business',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('questioning');
    });

    it('should reject messages to completed sessions', async () => {
      const mockSession = {
        id: mockSessionId,
        user_id: mockUser.id,
        domain: 'business',
        status: 'completed',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: mockSession,
            error: null,
          });
        }
        return createChainableMock({ data: null, error: null });
      });

      const request = createMockRequest({
        sessionId: mockSessionId,
        message: 'More questions',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('SESSION_COMPLETED');
    });

    it('should update session status to generating when generateNow is triggered', async () => {
      const mockSession = {
        id: mockSessionId,
        user_id: mockUser.id,
        domain: 'business',
        status: 'questioning',
        created_at: new Date().toISOString(),
      };

      const mockMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Question 1?' },
        { role: 'user', content: 'Answer 1' },
        { role: 'assistant', content: 'Question 2?' },
        { role: 'user', content: 'Answer 2' },
        { role: 'assistant', content: 'Question 3?' },
      ];

      let updateCalled = false;
      const mockUpdateChain = {
        ...createChainableMock({ data: null, error: null }),
        update: jest.fn(function() {
          updateCalled = true;
          return this;
        }),
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions' && !updateCalled) {
          return createChainableMock({
            data: mockSession,
            error: null,
          });
        }
        if (table === 'sessions' && updateCalled) {
          return mockUpdateChain;
        }
        if (table === 'messages') {
          return createChainableMock({
            data: mockMessages,
            error: null,
          });
        }
        return createChainableMock({ data: null, error: null });
      });

      const request = createMockRequest({
        sessionId: mockSessionId,
        message: 'Generate now',
        generateNow: true,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(mockUpdateChain.update).toHaveBeenCalledWith({ status: 'generating' });
      expect(data.status).toBe('generating');
    });
  });

  describe('AI Termination Detection', () => {
    it('should detect AI termination suggestion keywords', async () => {
      const mockSession = {
        id: mockSessionId,
        user_id: mockUser.id,
        domain: 'business',
        status: 'questioning',
        created_at: new Date().toISOString(),
      };

      const mockMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Question 1?' },
        { role: 'user', content: 'Answer 1' },
        { role: 'assistant', content: 'Question 2?' },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: mockSession,
            error: null,
          });
        }
        if (table === 'messages') {
          return createChainableMock({
            data: mockMessages,
            error: null,
          });
        }
        return createChainableMock({ data: null, error: null });
      });

      (continueConversation as jest.Mock).mockResolvedValue(
        'Great answers! I think we have enough information. Shall we proceed to generate ideas?'
      );

      const request = createMockRequest({
        sessionId: mockSessionId,
        message: 'My final answer',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.suggestedTermination).toBe(true);
    });

    it('should not flag termination without keywords', async () => {
      const mockSession = {
        id: mockSessionId,
        user_id: mockUser.id,
        domain: 'business',
        status: 'questioning',
        created_at: new Date().toISOString(),
      };

      const mockMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Question 1?' },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: mockSession,
            error: null,
          });
        }
        if (table === 'messages') {
          return createChainableMock({
            data: mockMessages,
            error: null,
          });
        }
        return createChainableMock({ data: null, error: null });
      });

      (continueConversation as jest.Mock).mockResolvedValue(
        'Tell me more about your target audience.'
      );

      const request = createMockRequest({
        sessionId: mockSessionId,
        message: 'My answer',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.suggestedTermination).toBe(false);
    });
  });

  describe('Response Fields', () => {
    it('should include questionCount and canGenerate in response', async () => {
      const mockSession = {
        id: mockSessionId,
        user_id: mockUser.id,
        domain: 'business',
        status: 'questioning',
        created_at: new Date().toISOString(),
      };

      const mockMessages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Question 1?' },
        { role: 'user', content: 'Answer 1' },
        { role: 'assistant', content: 'Question 2?' },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: mockSession,
            error: null,
          });
        }
        if (table === 'messages') {
          return createChainableMock({
            data: mockMessages,
            error: null,
          });
        }
        return createChainableMock({ data: null, error: null });
      });

      (continueConversation as jest.Mock).mockResolvedValue('Next question?');

      const request = createMockRequest({
        sessionId: mockSessionId,
        message: 'My answer',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.questionCount).toBe(2);
      expect(data.canGenerate).toBe(false); // Only 2 questions, need 3
      expect(data.status).toBe('questioning');
    });
  });
});

