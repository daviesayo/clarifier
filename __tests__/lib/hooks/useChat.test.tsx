import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '@/lib/hooks/useChat';
import * as chatApi from '@/lib/api/chat';

// Mock the chat API
jest.mock('@/lib/api/chat');
const mockChatApi = chatApi as jest.Mocked<typeof chatApi>;

describe('useChat Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should add user message optimistically and then add assistant response', async () => {
      const mockResponse = {
        sessionId: 'test-session-123',
        responseMessage: 'Hello! How can I help you?',
        isCompleted: false,
        status: 'questioning' as const,
        questionCount: 1,
        canGenerate: false,
      };

      mockChatApi.sendMessage.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useChat({ domain: 'business' }));

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      // Check that user message was added optimistically
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0]).toMatchObject({
        role: 'user',
        content: 'Hello',
      });
      expect(result.current.messages[1]).toMatchObject({
        role: 'assistant',
        content: 'Hello! How can I help you?',
      });

      expect(result.current.sessionId).toBe('test-session-123');
      expect(result.current.questionCount).toBe(1);
      expect(result.current.canGenerate).toBe(false);
    });

    it('should rollback optimistic update on error', async () => {
      mockChatApi.sendMessage.mockRejectedValueOnce(
        new Error('Network error') as any
      );

      const { result } = renderHook(() => useChat({ domain: 'business' }));

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      // Check that user message was removed after error
      expect(result.current.messages).toHaveLength(0);
      expect(result.current.error).toBe('Network error');
    });

    it('should handle different error types', async () => {
      const errorCases = [
        {
          error: { message: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
          expectedError: 'Rate limit exceeded',
        },
        {
          error: { message: 'Network error', code: 'NETWORK_ERROR' },
          expectedError: 'Network error',
        },
        {
          error: { message: 'Server error', code: 'INTERNAL_ERROR' },
          expectedError: 'Server error',
        },
      ];

      for (const errorCase of errorCases) {
        mockChatApi.sendMessage.mockRejectedValueOnce(errorCase.error as any);

        const { result } = renderHook(() => useChat({ domain: 'business' }));

        await act(async () => {
          await result.current.sendMessage('Hello');
        });

        expect(result.current.error).toBe(errorCase.expectedError);
        expect(result.current.messages).toHaveLength(0); // Rolled back
      }
    });

    it('should call onError callback when provided', async () => {
      const onError = jest.fn();
      const error = new Error('Test error');
      mockChatApi.sendMessage.mockRejectedValueOnce(error as any);

      const { result } = renderHook(() => 
        useChat({ domain: 'business', onError })
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should not send message when loading or generating', async () => {
      const { result } = renderHook(() => useChat({ domain: 'business' }));

      // Set loading state
      act(() => {
        result.current.sendMessage('Hello');
      });

      // Try to send another message while loading
      await act(async () => {
        await result.current.sendMessage('Another message');
      });

      // Should only call API once
      expect(mockChatApi.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateIdeas', () => {
    it('should generate ideas successfully', async () => {
      const mockResponse = {
        sessionId: 'test-session-123',
        responseMessage: 'Here are your generated ideas...',
        isCompleted: true,
        status: 'completed' as const,
        finalOutput: {
          brief: 'Test brief',
          generatedIdeas: { idea1: 'Test idea 1' },
        },
      };

      mockChatApi.generateIdeas.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useChat({ domain: 'business' }));

      // Set up session first by mocking sendMessage
      mockChatApi.sendMessage.mockResolvedValueOnce({
        sessionId: 'test-session-123',
        responseMessage: 'Hello!',
        isCompleted: false,
        status: 'questioning' as const,
        canGenerate: true,
      });

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      // Now generateIdeas should work
      await act(async () => {
        await result.current.generateIdeas();
      });

      expect(mockChatApi.generateIdeas).toHaveBeenCalledWith('test-session-123');
      expect(result.current.status).toBe('completed');
      expect(result.current.isGenerating).toBe(false);
    });

    it('should not generate ideas when not allowed', async () => {
      const { result } = renderHook(() => useChat({ domain: 'business' }));

      await act(async () => {
        await result.current.generateIdeas();
      });

      expect(mockChatApi.generateIdeas).not.toHaveBeenCalled();
    });

    it('should handle generation errors', async () => {
      mockChatApi.generateIdeas.mockRejectedValueOnce(
        new Error('Generation failed') as any
      );

      const { result } = renderHook(() => useChat({ domain: 'business' }));

      // Set up session first by mocking sendMessage
      mockChatApi.sendMessage.mockResolvedValueOnce({
        sessionId: 'test-session-123',
        responseMessage: 'Hello!',
        isCompleted: false,
        status: 'questioning' as const,
        canGenerate: true,
      });

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await act(async () => {
        await result.current.generateIdeas();
      });

      expect(result.current.error).toBe('Generation failed');
      expect(result.current.isGenerating).toBe(false);
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const mockResponse = {
        sessionId: 'new-session-123',
        responseMessage: 'Welcome! Let\'s explore your business idea.',
        isCompleted: false,
        status: 'questioning' as const,
        questionCount: 0,
        canGenerate: false,
      };

      mockChatApi.createSession.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useChat({ domain: 'business' }));

      await act(async () => {
        await result.current.createSession('business');
      });

      expect(mockChatApi.createSession).toHaveBeenCalledWith('business', 'deep');
      expect(result.current.sessionId).toBe('new-session-123');
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]).toMatchObject({
        role: 'assistant',
        content: 'Welcome! Let\'s explore your business idea.',
      });
    });

    it('should handle session creation errors', async () => {
      mockChatApi.createSession.mockRejectedValueOnce(
        new Error('Session creation failed') as any
      );

      const { result } = renderHook(() => useChat({ domain: 'business' }));

      await act(async () => {
        await result.current.createSession('business');
      });

      expect(result.current.error).toBe('Session creation failed');
    });
  });

  describe('retryLastMessage', () => {
    it('should retry the last user message', async () => {
      const mockResponse = {
        sessionId: 'test-session-123',
        responseMessage: 'Hello! How can I help you?',
        isCompleted: false,
        status: 'questioning' as const,
      };

      mockChatApi.sendMessage
        .mockRejectedValueOnce(new Error('Network error') as any)
        .mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useChat({ domain: 'business' }));

      // First attempt fails
      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.messages).toHaveLength(0);

      // Retry succeeds
      await act(async () => {
        await result.current.retryLastMessage();
      });

      expect(result.current.error).toBe(null);
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0]).toMatchObject({
        role: 'user',
        content: 'Hello',
      });
    });

    it('should not retry if no last message', async () => {
      const { result } = renderHook(() => useChat({ domain: 'business' }));

      await act(async () => {
        await result.current.retryLastMessage();
      });

      expect(mockChatApi.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages and reset state', () => {
      const { result } = renderHook(() => useChat({ domain: 'business' }));

      // Add some messages first
      act(() => {
        result.current.sendMessage('Hello');
      });

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.sessionId).toBe(null);
      expect(result.current.canGenerate).toBe(false);
      expect(result.current.questionCount).toBe(0);
      expect(result.current.status).toBe('questioning');
      expect(result.current.error).toBe(null);
    });
  });

  describe('session completion', () => {
    it('should call onSessionComplete when session is completed', async () => {
      const onSessionComplete = jest.fn();
      const finalOutput = {
        brief: 'Test brief',
        generatedIdeas: { idea1: 'Test idea 1' },
      };

      const mockResponse = {
        sessionId: 'test-session-123',
        responseMessage: 'Generation complete!',
        isCompleted: true,
        status: 'completed' as const,
        finalOutput,
      };

      mockChatApi.sendMessage.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => 
        useChat({ domain: 'business', onSessionComplete })
      );

      await act(async () => {
        await result.current.sendMessage('Generate ideas');
      });

      expect(onSessionComplete).toHaveBeenCalledWith(finalOutput);
    });
  });
});
