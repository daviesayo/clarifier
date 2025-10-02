/**
 * API Integration Tests for Context Synthesis
 * Tests the chat API endpoint with synthesis functionality
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/chat/route';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null
      })
    },
    from: jest.fn((table) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { usage_count: 5, tier: 'free' },
              error: null
            })
          })
        };
      }
      if (table === 'sessions') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'test-session-id', status: 'questioning' },
                error: null
              })
            })
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'test-session-id', status: 'generating', final_brief: 'Test brief' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'messages') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'test-message-id' },
                error: null
              })
            })
          }),
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [
                  { role: 'user', content: 'I want to start a business' },
                  { role: 'assistant', content: 'What problem are you trying to solve?' },
                  { role: 'user', content: 'I want to help people find eco-friendly products' },
                  { role: 'assistant', content: 'That sounds great! Who is your target audience?' },
                  { role: 'user', content: 'Millennials and Gen Z who care about sustainability' }
                ],
                error: null
              })
            })
          })
        };
      }
    })
  }))
}));

// Mock rate limiting
jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({
    allowed: true,
    remaining: 5,
    limit: 10,
    tier: 'free',
    resetTime: new Date(Date.now() + 3600000)
  }),
  incrementUsage: jest.fn().mockResolvedValue(undefined),
  getRateLimitHeaders: jest.fn().mockReturnValue({})
}));

// Mock conversation loop
jest.mock('@/lib/llm/conversationLoop', () => ({
  continueConversation: jest.fn().mockResolvedValue('Test AI response for conversation'),
  ValidationError: class extends Error {
    constructor(message) {
      super(message);
      this.name = 'ValidationError';
    }
  }
}));

// Mock synthesis module
jest.mock('@/lib/llm/synthesizeBrief', () => ({
  synthesizeBrief: jest.fn().mockResolvedValue('This is a synthesized brief for testing purposes. It contains the core goal, key context, target audience, requirements, and success criteria based on the conversation history.'),
  SynthesisError: class extends Error {
    constructor(message, code, originalError) {
      super(message);
      this.name = 'SynthesisError';
      this.code = code;
      this.originalError = originalError;
    }
  },
  ValidationError: class extends Error {
    constructor(message, field) {
      super(message);
      this.name = 'ValidationError';
      this.field = field;
    }
  }
}));

describe('API Integration Tests for Context Synthesis', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    jest.clearAllMocks();
  });

  describe('Normal Conversation Flow', () => {
    it('should handle normal conversation without synthesis', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          message: 'I want to start a business',
          domain: 'business'
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('test-session-id');
      expect(data.responseMessage).toBe('Test AI response for conversation');
      expect(data.status).toBe('questioning');
      expect(data.isCompleted).toBe(false);
    });
  });

  describe('Generation Trigger with Synthesis', () => {
    it('should trigger synthesis when generateNow is true', async () => {
      const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          sessionId: 'test-session-id',
          message: 'I\'m ready to generate ideas',
          generateNow: true
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('test-session-id');
      expect(data.status).toBe('generating');
      expect(data.isCompleted).toBe(true);
      expect(data.responseMessage).toContain('Context synthesis complete');
      
      // Verify synthesis was called
      expect(synthesizeBrief).toHaveBeenCalledWith({
        domain: 'business',
        conversationHistory: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'I want to start a business' }),
          expect.objectContaining({ role: 'assistant', content: 'What problem are you trying to solve?' })
        ])
      });
    });

    it('should handle synthesis errors gracefully', async () => {
      const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');
      const { SynthesisError } = require('@/lib/llm/synthesizeBrief');
      
      // Mock synthesis to throw an error
      synthesizeBrief.mockRejectedValueOnce(new SynthesisError('Synthesis failed', 'SYNTHESIS_ERROR'));

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          sessionId: 'test-session-id',
          message: 'Generate now',
          generateNow: true
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to synthesize conversation');
      expect(data.code).toBe('SYNTHESIS_ERROR');
    });

    it('should handle synthesis validation errors', async () => {
      const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');
      const { ValidationError } = require('@/lib/llm/synthesizeBrief');
      
      // Mock synthesis to throw a validation error
      synthesizeBrief.mockRejectedValueOnce(new ValidationError('Invalid domain', 'domain'));

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          sessionId: 'test-session-id',
          message: 'Generate now',
          generateNow: true
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid conversation data for synthesis');
      expect(data.code).toBe('SYNTHESIS_VALIDATION_ERROR');
    });
  });

  describe('Insufficient Questions Error', () => {
    it('should reject generation when insufficient questions answered', async () => {
      // Mock messages with only 2 questions (below threshold of 3)
      const mockSupabase = require('@/lib/supabase/server');
      mockSupabase.createClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'test-user-id' } },
            error: null
          })
        },
        from: jest.fn((table) => {
          if (table === 'profiles') {
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { usage_count: 5, tier: 'free' },
                  error: null
                })
              })
            };
          }
          if (table === 'sessions') {
            return {
              update: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                      data: { id: 'test-session-id', status: 'generating' },
                      error: null
                    })
                  })
                })
              })
            };
          }
          if (table === 'messages') {
            return {
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'test-message-id' },
                    error: null
                  })
                })
              }),
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  order: jest.fn().mockResolvedValue({
                    data: [
                      { role: 'user', content: 'I want to start a business' },
                      { role: 'assistant', content: 'What problem are you trying to solve?' }
                    ],
                    error: null
                  })
                })
              })
            };
          }
        })
      });

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          sessionId: 'test-session-id',
          message: 'Generate now',
          generateNow: true
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Insufficient questions answered');
      expect(data.code).toBe('MIN_QUESTIONS_NOT_MET');
      expect(data.details).toContain('At least 3 questions must be answered');
    });
  });

  describe('Database Integration', () => {
    it('should update session with brief and status', async () => {
      const mockSupabase = require('@/lib/supabase/server');
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'test-session-id', status: 'generating', final_brief: 'Test brief' },
              error: null
            })
          })
        })
      });

      mockSupabase.createClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'test-user-id' } },
            error: null
          })
        },
        from: jest.fn((table) => {
          if (table === 'profiles') {
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { usage_count: 5, tier: 'free' },
                  error: null
                })
              })
            };
          }
          if (table === 'sessions') {
            return {
              update: mockUpdate
            };
          }
          if (table === 'messages') {
            return {
              insert: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'test-message-id' },
                    error: null
                  })
                })
              }),
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  order: jest.fn().mockResolvedValue({
                    data: [
                      { role: 'user', content: 'I want to start a business' },
                      { role: 'assistant', content: 'What problem are you trying to solve?' },
                      { role: 'user', content: 'I want to help people find eco-friendly products' },
                      { role: 'assistant', content: 'That sounds great! Who is your target audience?' },
                      { role: 'user', content: 'Millennials and Gen Z who care about sustainability' }
                    ],
                    error: null
                  })
                })
              })
            };
          }
        })
      });

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          sessionId: 'test-session-id',
          message: 'Generate now',
          generateNow: true
        })
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'generating',
        final_brief: expect.any(String)
      });
    });
  });
});
