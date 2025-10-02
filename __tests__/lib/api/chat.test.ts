import { sendMessage, createSession, generateIdeas, ChatApiError } from '@/lib/api/chat';
import { ChatResponse } from '@/app/api/chat/route';

// Mock fetch globally
global.fetch = jest.fn();

describe('Chat API Helper', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      const mockResponse: ChatResponse = {
        sessionId: 'test-session-123',
        responseMessage: 'Hello! How can I help you?',
        isCompleted: false,
        status: 'questioning',
        questionCount: 1,
        canGenerate: false,
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await sendMessage({
        message: 'Hello',
        domain: 'business',
      });

      expect(fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Hello',
          domain: 'business',
          generateNow: undefined,
          intensity: 'deep',
        }),
      });

      expect(result).toEqual(mockResponse);
    });

    it('should handle network errors with retry', async () => {
      // First two calls fail with network error, third succeeds
      (fetch as jest.Mock)
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            sessionId: 'test-session-123',
            responseMessage: 'Hello!',
            isCompleted: false,
            status: 'questioning',
          }),
        });

      const result = await sendMessage({
        message: 'Hello',
        domain: 'business',
      });

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result.sessionId).toBe('test-session-123');
    });

    it('should handle rate limit errors with user-friendly message', async () => {
      // Mock rate limit error that's not retryable
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          remaining: 2,
          limit: 10,
          tier: 'free',
        }),
      });

      await expect(sendMessage({
        message: 'Hello',
        domain: 'business',
      })).rejects.toThrow('Rate limit exceeded. You have 2 sessions remaining. Please upgrade to Pro for unlimited sessions.');
    });

    it('should handle server errors with retry', async () => {
      // First call fails with 500, second succeeds
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            sessionId: 'test-session-123',
            responseMessage: 'Hello!',
            isCompleted: false,
            status: 'questioning',
          }),
        });

      const result = await sendMessage({
        message: 'Hello',
        domain: 'business',
      });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result.sessionId).toBe('test-session-123');
    });

    it('should fail after max retry attempts', async () => {
      (fetch as jest.Mock).mockRejectedValue(new TypeError('fetch failed'));

      await expect(sendMessage({
        message: 'Hello',
        domain: 'business',
      })).rejects.toThrow('Network error - please check your connection and try again.');

      expect(fetch).toHaveBeenCalledTimes(3); // Max retry attempts
    });

    it('should validate required parameters', async () => {
      await expect(sendMessage({
        message: '',
        domain: 'business',
      })).rejects.toThrow('Message is required');

      await expect(sendMessage({
        message: 'Hello',
      })).rejects.toThrow('Either sessionId or domain is required');
    });

    it('should handle different error types with appropriate messages', async () => {
      const testCases = [
        {
          status: 400,
          error: { error: 'Bad request', code: 'VALIDATION_ERROR' },
          expectedMessage: 'Invalid request - please check your input and try again.',
        },
        {
          status: 401,
          error: { error: 'Unauthorized', code: 'AUTHENTICATION_REQUIRED' },
          expectedMessage: 'Please log in to continue.',
        },
        {
          status: 404,
          error: { error: 'Not found', code: 'SESSION_NOT_FOUND' },
          expectedMessage: 'Session not found - please start a new conversation.',
        },
        {
          status: 408,
          error: { error: 'Timeout', code: 'GENERATION_TIMEOUT' },
          expectedMessage: 'Generation is taking longer than expected. Please try again with a shorter conversation.',
        },
      ];

      for (const testCase of testCases) {
        (fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: testCase.status,
          json: () => Promise.resolve(testCase.error),
        });

        await expect(sendMessage({
          message: 'Hello',
          domain: 'business',
        })).rejects.toThrow(testCase.expectedMessage);
      }
    });
  });

  describe('createSession', () => {
    it('should create a new session with domain', async () => {
      const mockResponse: ChatResponse = {
        sessionId: 'new-session-123',
        responseMessage: 'Welcome! Let\'s explore your business idea.',
        isCompleted: false,
        status: 'questioning',
        questionCount: 0,
        canGenerate: false,
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await createSession('business');

      expect(fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Hello, I\'d like to start a new conversation.',
          domain: 'business',
          intensity: 'deep',
        }),
      });

      expect(result).toEqual(mockResponse);
    });

    it('should create session with custom intensity', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          sessionId: 'new-session-123',
          responseMessage: 'Welcome!',
          isCompleted: false,
          status: 'questioning',
        }),
      });

      await createSession('business', 'basic');

      expect(fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Hello, I\'d like to start a new conversation.',
          domain: 'business',
          intensity: 'basic',
        }),
      });
    });
  });

  describe('generateIdeas', () => {
    it('should generate ideas for existing session', async () => {
      const mockResponse: ChatResponse = {
        sessionId: 'existing-session-123',
        responseMessage: 'Here are your generated ideas...',
        isCompleted: true,
        status: 'completed',
        finalOutput: {
          brief: 'Test brief',
          generatedIdeas: { idea1: 'Test idea 1' },
        },
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await generateIdeas('existing-session-123');

      expect(fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: 'existing-session-123',
          message: 'Generate ideas now',
          generateNow: true,
          intensity: 'deep',
        }),
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Error handling', () => {
    it('should create ChatApiError with proper properties', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          remaining: 5,
          limit: 10,
          tier: 'free',
        }),
      });

      try {
        await sendMessage({ message: 'Hello', domain: 'business' });
      } catch (error) {
        const chatError = error as ChatApiError;
        expect(chatError.message).toContain('Rate limit exceeded');
        expect(chatError.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(chatError.remaining).toBe(5);
        expect(chatError.limit).toBe(10);
        expect(chatError.tier).toBe('free');
        expect(chatError.status).toBe(429);
        expect(chatError.retryable).toBe(false);
      }
    });

    it('should handle malformed error responses', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      try {
        await sendMessage({ message: 'Hello', domain: 'business' });
      } catch (error) {
        const chatError = error as ChatApiError;
        // The JSON parsing error gets caught in the retry loop and becomes a network error
        expect(chatError.message).toBe('Network error - please check your connection and try again.');
        expect(chatError.code).toBe('NETWORK_ERROR');
        expect(chatError.status).toBe(0);
      }
    });
  });
});
