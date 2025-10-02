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

import { POST } from '@/app/api/chat/route';

// Helper to create chainable mock
const createChainableMock = (finalValue: any) => {
  const chain: any = {
    select: jest.fn(function() { return chain; }),
    insert: jest.fn(function() { 
      // For insert operations without select, return directly
      return Promise.resolve(finalValue);
    }),
    update: jest.fn(function() { return chain; }),
    eq: jest.fn(function() { return chain; }),
    order: jest.fn(() => Promise.resolve(finalValue)),
    single: jest.fn(() => Promise.resolve(finalValue)),
  };
  
  // Override insert to support chaining when followed by select()
  const originalInsert = chain.insert;
  chain.insert = jest.fn(function() {
    // Return a new chain that can handle .select()
    const insertChain: any = {
      select: jest.fn(function() {
        return {
          single: jest.fn(() => Promise.resolve(finalValue)),
        };
      }),
    };
    // But also make it thenable for direct resolution
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
  from: jest.fn(() => createChainableMock({ data: null, error: null })),
};

// Mock the Supabase server client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock rate limiting
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => Promise.resolve({ allowed: true, remaining: 5, limit: 10, tier: 'free' })),
  incrementUsage: jest.fn(() => Promise.resolve({ error: null })),
  getRateLimitHeaders: jest.fn(() => ({})),
}));

// Mock conversation loop
jest.mock('@/lib/llm/conversationLoop', () => ({
  continueConversation: jest.fn(() => Promise.resolve('Mock AI response')),
  ValidationError: class ValidationError extends Error {
    constructor(message: string, public field: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

// Mock synthesis and generation functions
jest.mock('@/lib/llm/synthesizeBrief', () => ({
  synthesizeBrief: jest.fn(() => Promise.resolve('Mock synthesized brief')),
  SynthesisError: class SynthesisError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SynthesisError';
    }
  },
  ValidationError: class SynthesisValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

jest.mock('@/lib/llm/generateOutput', () => ({
  generateOutput: jest.fn(() => Promise.resolve({
    rawOutput: 'Mock generated output',
    structuredOutput: { ideas: ['Idea 1', 'Idea 2'] },
    wordCount: 100,
    model: 'mock-model'
  })),
  GenerationError: class GenerationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'GenerationError';
    }
  },
  ValidationError: class GenerationValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

// Mock database services
jest.mock('@/lib/database/sessions', () => ({
  sessionService: {
    updateSession: jest.fn(() => Promise.resolve({ error: null })),
  },
}));

jest.mock('@/lib/database/profiles', () => ({
  profileService: {
    incrementUsageCount: jest.fn(() => Promise.resolve({ error: null })),
  },
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
    beforeEach(() => {
      jest.clearAllMocks();
    });

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

    it('should return 400 when domain is required for new session', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const request = createMockRequest({
        message: 'Test message',
        // Missing domain for new session
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Domain is required for new sessions');
    });

    it('should return 429 when rate limit exceeded', async () => {
      const { checkRateLimit } = require('@/lib/rateLimit');
      
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock rate limit exceeded
      checkRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        limit: 10,
        tier: 'free'
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

      // Mock session creation
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
            error: null,
          });
        } else if (table === 'messages') {
          const chain = createChainableMock({
            data: [{ role: 'user', content: 'Test message' }],
            error: null,
          });
          chain.insert.mockResolvedValue({ data: null, error: null });
          return chain;
        }
        return createChainableMock({ data: null, error: null });
      });

      const request = createMockRequest({
        message: 'Test message',
        domain: 'business',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('session-123');
      expect(data.responseMessage).toBeDefined();
      expect(data.isCompleted).toBe(false);
    });

    it('should retrieve existing session successfully', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock all database calls
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: { id: '123e4567-e89b-12d3-a456-426614174000', user_id: 'user-123', domain: 'business' },
            error: null,
          });
        } else if (table === 'messages') {
          const chain = createChainableMock({
            data: [
              { role: 'user', content: 'Previous message' },
              { role: 'assistant', content: 'Previous response' },
              { role: 'user', content: 'Test message' }
            ],
            error: null,
          });
          chain.insert.mockResolvedValue({ data: null, error: null });
          return chain;
        }
        return createChainableMock({ data: null, error: null });
      });

      const request = createMockRequest({
        sessionId: '123e4567-e89b-12d3-a456-426614174000', // Valid UUID
        message: 'Test message',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(data.responseMessage).toBeDefined();
    });

    it('should return 404 for non-existent session', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock session not found
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: null,
            error: { message: 'Session not found' },
          });
        }
        return createChainableMock({ data: null, error: null });
      });

      const request = createMockRequest({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
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

      // Mock session creation and message handling
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
            error: null,
          });
        } else if (table === 'messages') {
          const chain = createChainableMock({
            data: [
              { role: 'user', content: 'Question 1' },
              { role: 'assistant', content: 'Response 1?' },
              { role: 'user', content: 'Question 2' },
              { role: 'assistant', content: 'Response 2?' },
              { role: 'user', content: 'Question 3' },
              { role: 'assistant', content: 'Response 3?' },
              { role: 'user', content: 'Test message' }
            ],
            error: null,
          });
          chain.insert.mockResolvedValue({ data: null, error: null });
          return chain;
        }
        return createChainableMock({ data: null, error: null });
      });

      const request = createMockRequest({
        message: 'Test message',
        domain: 'business',
        generateNow: true,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.responseMessage).toContain('Generation complete!');
      expect(data.isCompleted).toBe(true);
      expect(data.finalOutput).toBeDefined();
      expect(data.finalOutput.brief).toBe('Mock synthesized brief');
      expect(data.finalOutput.generatedIdeas).toEqual({ ideas: ['Idea 1', 'Idea 2'] });
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
      expect(data.error).toContain('unexpected error');
      expect(data.code).toBe('INTERNAL_ERROR');
    });

    it('should return 400 when minimum questions not met for generation', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock session with insufficient questions
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'sessions') {
          return createChainableMock({
            data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
            error: null,
          });
        } else if (table === 'messages') {
          const chain = createChainableMock({
            data: [
              { role: 'user', content: 'Question 1' },
              { role: 'assistant', content: 'Response 1?' },
              { role: 'user', content: 'Test message' }
            ],
            error: null,
          });
          chain.insert.mockResolvedValue({ data: null, error: null });
          return chain;
        }
        return createChainableMock({ data: null, error: null });
      });

      const request = createMockRequest({
        message: 'Test message',
        domain: 'business',
        generateNow: true,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Insufficient questions answered');
      expect(data.code).toBe('MIN_QUESTIONS_NOT_MET');
      expect(data.message).toContain('Please answer at least');
    });
  });

  describe('Generation Integration', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      
      // Default mock for authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
    });

    describe('Successful Generation Flow', () => {
      it('should complete full generation flow with finalOutput', async () => {
        const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');
        const { generateOutput } = require('@/lib/llm/generateOutput');
        const { sessionService } = require('@/lib/database/sessions');
        const { profileService } = require('@/lib/database/profiles');

        // Mock database calls
        let callCount = 0;
        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            callCount++;
            if (callCount === 1) {
              // First call: create session
              return createChainableMock({
                data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
                error: null,
              });
            } else if (callCount === 2) {
              // Second call: update session with brief
              return createChainableMock({
                data: null,
                error: null,
              });
            } else if (callCount === 3) {
              // Third call: get final output
              return createChainableMock({
                data: { 
                  final_brief: 'Mock synthesized brief',
                  final_output: { ideas: ['Idea 1', 'Idea 2'] }
                },
                error: null,
              });
            }
            return createChainableMock({ data: null, error: null });
          } else if (table === 'messages') {
            const chain = createChainableMock({
              data: [
                { role: 'user', content: 'Question 1' },
                { role: 'assistant', content: 'Response 1?' },
                { role: 'user', content: 'Question 2' },
                { role: 'assistant', content: 'Response 2?' },
                { role: 'user', content: 'Question 3' },
                { role: 'assistant', content: 'Response 3?' },
                { role: 'user', content: 'Test message' }
              ],
              error: null,
            });
            chain.insert.mockResolvedValue({ data: null, error: null });
            return chain;
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
          generateNow: true,
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.isCompleted).toBe(true);
        expect(data.finalOutput).toBeDefined();
        expect(data.finalOutput.brief).toBe('Mock synthesized brief');
        expect(data.finalOutput.generatedIdeas).toEqual({ ideas: ['Idea 1', 'Idea 2'] });
        
        // Verify synthesis and generation were called
        expect(synthesizeBrief).toHaveBeenCalledWith({
          domain: 'business',
          conversationHistory: expect.any(Array),
        });
        expect(generateOutput).toHaveBeenCalledWith({
          domain: 'business',
          brief: 'Mock synthesized brief',
        });
        
        // Verify database updates
        expect(sessionService.updateSession).toHaveBeenCalledWith('session-123', {
          final_output: { ideas: ['Idea 1', 'Idea 2'] },
          status: 'completed',
        });
        expect(profileService.incrementUsageCount).toHaveBeenCalledWith('user-123');
      });

      it('should handle generation with retry logic', async () => {
        const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');
        const { generateOutput } = require('@/lib/llm/generateOutput');

        // Mock first synthesis attempt to fail, second to succeed
        synthesizeBrief
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('Mock synthesized brief');

        // Mock generation to succeed on first attempt
        generateOutput.mockResolvedValueOnce({
          rawOutput: 'Mock generated output',
          structuredOutput: { ideas: ['Idea 1', 'Idea 2'] },
          wordCount: 100,
          model: 'mock-model'
        });

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return createChainableMock({
              data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
              error: null,
            });
          } else if (table === 'messages') {
            const chain = createChainableMock({
              data: [
                { role: 'user', content: 'Question 1' },
                { role: 'assistant', content: 'Response 1?' },
                { role: 'user', content: 'Question 2' },
                { role: 'assistant', content: 'Response 2?' },
                { role: 'user', content: 'Question 3' },
                { role: 'assistant', content: 'Response 3?' },
                { role: 'user', content: 'Test message' }
              ],
              error: null,
            });
            chain.insert.mockResolvedValue({ data: null, error: null });
            return chain;
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
          generateNow: true,
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.isCompleted).toBe(true);
        expect(synthesizeBrief).toHaveBeenCalledTimes(2);
        expect(generateOutput).toHaveBeenCalledTimes(1);
      });
    });

    describe('Generation Error Handling', () => {
      it('should handle synthesis validation errors', async () => {
        const { ValidationError } = require('@/lib/llm/synthesizeBrief');
        const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');

        synthesizeBrief.mockRejectedValueOnce(
          new ValidationError('Invalid conversation data')
        );

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return createChainableMock({
              data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
              error: null,
            });
          } else if (table === 'messages') {
            const chain = createChainableMock({
              data: [
                { role: 'user', content: 'Question 1' },
                { role: 'assistant', content: 'Response 1?' },
                { role: 'user', content: 'Question 2' },
                { role: 'assistant', content: 'Response 2?' },
                { role: 'user', content: 'Question 3' },
                { role: 'assistant', content: 'Response 3?' },
                { role: 'user', content: 'Test message' }
              ],
              error: null,
            });
            chain.insert.mockResolvedValue({ data: null, error: null });
            return chain;
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
          generateNow: true,
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Unable to process your conversation');
        expect(data.code).toBe('SYNTHESIS_VALIDATION_ERROR');
        expect(data.message).toContain('conversation format');
      });

      it('should handle generation errors with user-friendly messages', async () => {
        const { GenerationError } = require('@/lib/llm/generateOutput');
        const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');
        const { generateOutput } = require('@/lib/llm/generateOutput');

        synthesizeBrief.mockResolvedValueOnce('Mock synthesized brief');
        // Mock generation to fail on all retry attempts
        generateOutput
          .mockRejectedValueOnce(new GenerationError('LLM service unavailable'))
          .mockRejectedValueOnce(new GenerationError('LLM service unavailable'))
          .mockRejectedValueOnce(new GenerationError('LLM service unavailable'));

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return createChainableMock({
              data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
              error: null,
            });
          } else if (table === 'messages') {
            const chain = createChainableMock({
              data: [
                { role: 'user', content: 'Question 1' },
                { role: 'assistant', content: 'Response 1?' },
                { role: 'user', content: 'Question 2' },
                { role: 'assistant', content: 'Response 2?' },
                { role: 'user', content: 'Question 3' },
                { role: 'assistant', content: 'Response 3?' },
                { role: 'user', content: 'Test message' }
              ],
              error: null,
            });
            chain.insert.mockResolvedValue({ data: null, error: null });
            return chain;
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
          generateNow: true,
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe('Failed to generate ideas');
        expect(data.code).toBe('GENERATION_ERROR');
        expect(data.message).toContain('couldn\'t generate your ideas');
      });

      it('should handle timeout errors', async () => {
        const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');

        // Mock timeout error on all retry attempts
        synthesizeBrief
          .mockRejectedValueOnce(new Error('Synthesis timed out after 4000ms'))
          .mockRejectedValueOnce(new Error('Synthesis timed out after 4000ms'))
          .mockRejectedValueOnce(new Error('Synthesis timed out after 4000ms'));

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return createChainableMock({
              data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
              error: null,
            });
          } else if (table === 'messages') {
            const chain = createChainableMock({
              data: [
                { role: 'user', content: 'Question 1' },
                { role: 'assistant', content: 'Response 1?' },
                { role: 'user', content: 'Question 2' },
                { role: 'assistant', content: 'Response 2?' },
                { role: 'user', content: 'Question 3' },
                { role: 'assistant', content: 'Response 3?' },
                { role: 'user', content: 'Test message' }
              ],
              error: null,
            });
            chain.insert.mockResolvedValue({ data: null, error: null });
            return chain;
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
          generateNow: true,
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(408);
        expect(data.error).toBe('Generation timed out');
        expect(data.code).toBe('GENERATION_TIMEOUT');
        expect(data.message).toContain('taking longer than expected');
      });
    });

    describe('Performance and Monitoring', () => {
      it('should log generation performance metrics', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return createChainableMock({
              data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
              error: null,
            });
          } else if (table === 'messages') {
            const chain = createChainableMock({
              data: [
                { role: 'user', content: 'Question 1' },
                { role: 'assistant', content: 'Response 1?' },
                { role: 'user', content: 'Question 2' },
                { role: 'assistant', content: 'Response 2?' },
                { role: 'user', content: 'Question 3' },
                { role: 'assistant', content: 'Response 3?' },
                { role: 'user', content: 'Test message' }
              ],
              error: null,
            });
            chain.insert.mockResolvedValue({ data: null, error: null });
            return chain;
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
          generateNow: true,
        });

        await POST(request);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Context synthesis completed in')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Output generation completed in')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Generation metrics:')
        );
        consoleSpy.mockRestore();
      });
    });
  });

  describe('Conversation Loop Enhancements', () => {
    const { continueConversation } = require('@/lib/llm/conversationLoop');

    beforeEach(() => {
      jest.clearAllMocks();
      
      // Default mock for authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
    });

    describe('First Message Handling', () => {
      it('should handle first message with empty conversation history', async () => {
        // Mock session creation
        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
                    error: null,
                  }),
                })),
              })),
            };
          } else if (table === 'messages') {
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn().mockResolvedValue({
                    data: [{ role: 'user', content: 'First message' }],
                    error: null,
                  }),
                })),
              })),
            };
          }
          return {};
        });

        const request = createMockRequest({
          message: 'First message',
          domain: 'business',
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(continueConversation).toHaveBeenCalledWith(
          expect.objectContaining({
            conversationHistory: [], // Empty history for first message
            userMessage: 'First message',
            domain: 'business',
          })
        );
      });

      it('should log first message for monitoring', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'session-123', user_id: 'user-123', domain: 'creative' },
                    error: null,
                  }),
                })),
              })),
            };
          } else if (table === 'messages') {
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn().mockResolvedValue({
                    data: [{ role: 'user', content: 'First message' }],
                    error: null,
                  }),
                })),
              })),
            };
          }
          return {};
        });

        const request = createMockRequest({
          message: 'First message',
          domain: 'creative',
        });

        await POST(request);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('First message in session')
        );
        consoleSpy.mockRestore();
      });
    });

    describe('Long Conversation History Handling', () => {
      it('should truncate conversation history exceeding 20 messages', async () => {
        // Create 25 messages (should be truncated to 20)
        const messages = Array.from({ length: 25 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}`,
        }));

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return createChainableMock({
              data: { id: 'session-123', user_id: 'user-123', domain: 'product' },
              error: null,
            });
          } else if (table === 'messages') {
            const chain = createChainableMock({
              data: messages,
              error: null,
            });
            chain.insert.mockReturnValue(Promise.resolve({ data: null, error: null }));
            return chain;
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          sessionId: 'session-123',
          message: 'New message',
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        // Verify that continueConversation was called with truncated history
        expect(continueConversation).toHaveBeenCalledWith(
          expect.objectContaining({
            conversationHistory: expect.arrayContaining([
              expect.objectContaining({ role: expect.any(String) })
            ]),
          })
        );

        const call = continueConversation.mock.calls[0][0];
        expect(call.conversationHistory.length).toBeLessThanOrEqual(20);
      });

      it('should log truncation event', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // Create 25 messages
        const messages = Array.from({ length: 25 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}`,
        }));

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return createChainableMock({
              data: { id: 'session-123', user_id: 'user-123', domain: 'product' },
              error: null,
            });
          } else if (table === 'messages') {
            const chain = createChainableMock({
              data: messages,
              error: null,
            });
            chain.insert.mockReturnValue(Promise.resolve({ data: null, error: null }));
            return chain;
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          sessionId: 'session-123',
          message: 'New message',
        });

        await POST(request);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Conversation history truncated')
        );
        consoleSpy.mockRestore();
      });
    });

    describe('Performance Logging', () => {
      it('should log conversation loop performance metrics', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'session-123', user_id: 'user-123', domain: 'research' },
                    error: null,
                  }),
                })),
              })),
            };
          } else if (table === 'messages') {
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn().mockResolvedValue({
                    data: [{ role: 'user', content: 'Test message' }],
                    error: null,
                  }),
                })),
              })),
            };
          }
          return {};
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'research',
        });

        await POST(request);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Conversation loop completed in')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Chat API request completed in')
        );
        consoleSpy.mockRestore();
      });

      it('should log conversation history length', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const messages = [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Message 2' },
        ];

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return createChainableMock({
              data: { id: 'session-123', user_id: 'user-123', domain: 'coding' },
              error: null,
            });
          } else if (table === 'messages') {
            const chain = createChainableMock({
              data: messages,
              error: null,
            });
            chain.insert.mockReturnValue(Promise.resolve({ data: null, error: null }));
            return chain;
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          sessionId: 'session-123',
          message: 'New message',
        });

        await POST(request);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Conversation history retrieved: 3 messages')
        );
        consoleSpy.mockRestore();
      });
    });

    describe('Enhanced Error Handling', () => {
      it('should handle conversation validation errors with user-friendly messages', async () => {
        const { ValidationError } = require('@/lib/llm/conversationLoop');
        continueConversation.mockRejectedValueOnce(
          new ValidationError('Invalid message format', 'message')
        );

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
                    error: null,
                  }),
                })),
              })),
            };
          } else if (table === 'messages') {
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn().mockResolvedValue({
                    data: [{ role: 'user', content: 'Test' }],
                    error: null,
                  }),
                })),
              })),
            };
          }
          return {};
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'business',
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('Invalid conversation data');
        expect(data.code).toBe('CONVERSATION_VALIDATION_ERROR');
      });

      it('should handle conversation loop errors with helpful messages', async () => {
        continueConversation.mockRejectedValueOnce(
          new Error('LLM service unavailable')
        );

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'session-123', user_id: 'user-123', domain: 'product' },
                    error: null,
                  }),
                })),
              })),
            };
          } else if (table === 'messages') {
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn().mockResolvedValue({
                    data: [{ role: 'user', content: 'Test' }],
                    error: null,
                  }),
                })),
              })),
            };
          }
          return {};
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'product',
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toContain('Unable to generate response');
        expect(data.code).toBe('CONVERSATION_ERROR');
      });

      it('should log detailed error information for debugging', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        continueConversation.mockRejectedValueOnce(
          new Error('Test error')
        );

        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'session-123', user_id: 'user-123', domain: 'creative' },
                    error: null,
                  }),
                })),
              })),
            };
          } else if (table === 'messages') {
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn().mockResolvedValue({
                    data: [{ role: 'user', content: 'Test' }],
                    error: null,
                  }),
                })),
              })),
            };
          }
          return {};
        });

        const request = createMockRequest({
          message: 'Test message',
          domain: 'creative',
        });

        await POST(request);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Conversation loop error:',
          expect.objectContaining({
            sessionId: 'session-123',
            domain: 'creative',
          })
        );
        consoleErrorSpy.mockRestore();
      });
    });

    describe('History Retrieval Error Handling', () => {
      it('should provide user-friendly error when history retrieval fails', async () => {
        let callCount = 0;
        mockSupabaseClient.from.mockImplementation((table: string) => {
          if (table === 'sessions') {
            return createChainableMock({
              data: { id: 'session-123', user_id: 'user-123', domain: 'business' },
              error: null,
            });
          } else if (table === 'messages') {
            callCount++;
            if (callCount === 1) {
              // First call: insert user message - should succeed
              const insertChain: any = {
                then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
                catch: (reject: any) => Promise.resolve({ data: null, error: null }).catch(reject),
              };
              return { insert: jest.fn(() => insertChain) };
            } else {
              // Second call: retrieve history - should fail
              return createChainableMock({
                data: null,
                error: { message: 'Database connection failed' },
              });
            }
          }
          return createChainableMock({ data: null, error: null });
        });

        const request = createMockRequest({
          sessionId: 'session-123',
          message: 'Test message',
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toContain('Unable to retrieve conversation history');
        expect(data.code).toBe('HISTORY_RETRIEVAL_ERROR');
      });
    });
  });
});
