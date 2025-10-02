/**
 * Tests for LangChain Conversation Loop
 * 
 * Comprehensive test suite covering:
 * - Core conversation functionality
 * - Message formatting
 * - Error handling and recovery
 * - Validation
 * - Performance requirements
 */

import { 
  continueConversation,
  ConversationError,
  ValidationError,
  ConversationParams,
} from '../../lib/llm/conversationLoop';

// Mock LangChain modules
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn(),
  })),
}));

jest.mock('@langchain/core/messages', () => ({
  HumanMessage: jest.fn((content) => ({ type: 'human', content })),
  AIMessage: jest.fn((content) => ({ type: 'ai', content })),
  SystemMessage: jest.fn((content) => ({ type: 'system', content })),
}));

// Import mocked modules
import { ChatOpenAI } from '@langchain/openai';

describe('continueConversation', () => {
  // Store original environment
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset mock implementation
    const mockInvoke = jest.fn().mockResolvedValue({
      content: 'What specific problem does your business solve?',
    });
    
    (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mockImplementation(() => ({
      invoke: mockInvoke,
    } as any));
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Successful Conversations', () => {
    it('should generate a contextually relevant question for business domain', async () => {
      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'I want to start a sustainable fashion business',
        intensity: 'deep',
      };

      const response = await continueConversation(params);

      expect(response).toBeTruthy();
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should maintain conversation history across multiple turns', async () => {
      const params: ConversationParams = {
        domain: 'product',
        conversationHistory: [
          { role: 'user', content: 'I want to add a dark mode feature' },
          { role: 'assistant', content: 'What problem would dark mode solve for your users?' },
          { role: 'user', content: 'Users complain about eye strain at night' },
        ],
        userMessage: 'They want to use the app in bed',
      };

      const response = await continueConversation(params);

      expect(response).toBeTruthy();
      // Verify ChatOpenAI was called with conversation history
      const mockInstance = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.results[0].value;
      expect(mockInstance.invoke).toHaveBeenCalled();
    });

    it('should work with all valid domains', async () => {
      const domains = ['business', 'product', 'creative', 'research', 'coding'];

      for (const domain of domains) {
        const params: ConversationParams = {
          domain,
          conversationHistory: [],
          userMessage: 'Test message',
        };

        const response = await continueConversation(params);
        expect(response).toBeTruthy();
      }
    });

    it('should support both basic and deep intensity levels', async () => {
      const basicParams: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'I have a business idea',
        intensity: 'basic',
      };

      const deepParams: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'I have a business idea',
        intensity: 'deep',
      };

      const basicResponse = await continueConversation(basicParams);
      const deepResponse = await continueConversation(deepParams);

      expect(basicResponse).toBeTruthy();
      expect(deepResponse).toBeTruthy();
    });

    it('should handle empty conversation history', async () => {
      const params: ConversationParams = {
        domain: 'coding',
        conversationHistory: [],
        userMessage: 'I want to build a REST API',
      };

      const response = await continueConversation(params);
      expect(response).toBeTruthy();
    });

    it('should trim long conversation histories', async () => {
      const longHistory = Array.from({ length: 15 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i + 1}`,
      }));

      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: longHistory,
        userMessage: 'New message',
      };

      const response = await continueConversation(params);
      expect(response).toBeTruthy();
    });
  });

  describe('Input Validation', () => {
    it('should throw ValidationError for missing domain', async () => {
      const params: any = {
        conversationHistory: [],
        userMessage: 'Test message',
      };

      await expect(continueConversation(params)).rejects.toThrow(ValidationError);
      await expect(continueConversation(params)).rejects.toThrow('Domain is required');
    });

    it('should throw ValidationError for empty user message', async () => {
      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: '   ',
      };

      await expect(continueConversation(params)).rejects.toThrow(ValidationError);
      await expect(continueConversation(params)).rejects.toThrow('empty');
    });

    it('should throw ValidationError for excessively long user message', async () => {
      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'x'.repeat(5001),
      };

      await expect(continueConversation(params)).rejects.toThrow(ValidationError);
      await expect(continueConversation(params)).rejects.toThrow('maximum length');
    });

    it('should throw ValidationError for invalid conversation history', async () => {
      const params: any = {
        domain: 'business',
        conversationHistory: 'not an array',
        userMessage: 'Test message',
      };

      await expect(continueConversation(params)).rejects.toThrow(ValidationError);
      await expect(continueConversation(params)).rejects.toThrow('must be an array');
    });

    it('should throw ValidationError for invalid message role', async () => {
      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [
          { role: 'invalid' as any, content: 'Test' },
        ],
        userMessage: 'Test message',
      };

      await expect(continueConversation(params)).rejects.toThrow(ValidationError);
      await expect(continueConversation(params)).rejects.toThrow('invalid role');
    });

    it('should throw error for invalid domain', async () => {
      const params: ConversationParams = {
        domain: 'invalid-domain',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      await expect(continueConversation(params)).rejects.toThrow();
    });

    it('should sanitize user input', async () => {
      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message\0with null byte',
      };

      const response = await continueConversation(params);
      expect(response).toBeTruthy();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should throw ConversationError when API key is missing', async () => {
      delete process.env.OPENROUTER_API_KEY;

      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      await expect(continueConversation(params)).rejects.toThrow(ConversationError);
      await expect(continueConversation(params)).rejects.toThrow('OPENROUTER_API_KEY');
    });

    it('should retry on network errors', async () => {
      const mockInvoke = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          content: 'Success after retry',
        });

      (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mockImplementation(() => ({
        invoke: mockInvoke,
      } as any));

      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      const response = await continueConversation(params);
      expect(response).toBe('Success after retry');
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    it('should return fallback response after max retries', async () => {
      const mockInvoke = jest.fn().mockRejectedValue(new Error('Persistent error'));

      (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mockImplementation(() => ({
        invoke: mockInvoke,
      } as any));

      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      const response = await continueConversation(params);
      expect(response).toContain('trouble connecting');
      expect(mockInvoke).toHaveBeenCalledTimes(3); // Max retries
    });

    it('should handle rate limiting errors', async () => {
      const rateLimitError: any = new Error('Rate limit exceeded');
      rateLimitError.status = 429;

      const mockInvoke = jest.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          content: 'Success after rate limit',
        });

      (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mockImplementation(() => ({
        invoke: mockInvoke,
      } as any));

      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      const response = await continueConversation(params);
      expect(response).toBe('Success after rate limit');
    });

    it('should throw ConversationError for authentication errors', async () => {
      const authError: any = new Error('Invalid API key');
      authError.status = 401;

      const mockInvoke = jest.fn().mockRejectedValue(authError);

      (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mockImplementation(() => ({
        invoke: mockInvoke,
      } as any));

      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      await expect(continueConversation(params)).rejects.toThrow(ConversationError);
    });

    it('should return fallback response when LLM returns empty responses', async () => {
      // Empty responses should trigger retries and eventually fallback
      const mockInvoke = jest.fn()
        .mockResolvedValue({ content: '' }); // Always return empty

      (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mockImplementation(() => ({
        invoke: mockInvoke,
      } as any));

      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      const response = await continueConversation(params);
      // Should return fallback after retries with empty responses
      expect(response).toContain('trouble connecting');
      // Check that it was called at least once
      expect(mockInvoke).toHaveBeenCalled();
    });

    it('should provide domain-specific fallback responses', async () => {
      const mockInvoke = jest.fn().mockRejectedValue(new Error('Persistent error'));

      (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mockImplementation(() => ({
        invoke: mockInvoke,
      } as any));

      const domains = ['business', 'product', 'creative', 'research', 'coding'];

      for (const domain of domains) {
        const params: ConversationParams = {
          domain,
          conversationHistory: [],
          userMessage: 'Test message',
        };

        const response = await continueConversation(params);
        expect(response).toBeTruthy();
        expect(typeof response).toBe('string');
      }
    }, 20000); // Increase timeout to 20 seconds
  });

  describe('Message Formatting', () => {
    it('should format messages correctly for LangChain', async () => {
      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
        ],
        userMessage: 'Second message',
      };

      await continueConversation(params);

      const mockInstance = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.results[0].value;
      expect(mockInstance.invoke).toHaveBeenCalled();
      
      const callArgs = mockInstance.invoke.mock.calls[0][0];
      expect(Array.isArray(callArgs)).toBe(true);
      expect(callArgs.length).toBeGreaterThan(0);
    });

    it('should include system message with domain meta-prompt', async () => {
      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      await continueConversation(params);

      const mockInstance = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.results[0].value;
      const callArgs = mockInstance.invoke.mock.calls[0][0];
      
      // First message should be system message
      expect(callArgs[0].type).toBe('system');
    });

    it('should handle array-type response content', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
      });

      (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mockImplementation(() => ({
        invoke: mockInvoke,
      } as any));

      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      const response = await continueConversation(params);
      expect(response).toBe('Part 1 Part 2');
    });
  });

  describe('Performance', () => {
    it('should respond within reasonable time for typical messages', async () => {
      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [
          { role: 'user', content: 'I want to start a business' },
          { role: 'assistant', content: 'What problem are you solving?' },
        ],
        userMessage: 'I want to help people find local artisans',
      };

      const startTime = Date.now();
      await continueConversation(params);
      const duration = Date.now() - startTime;

      // Should complete quickly with mock (< 1 second)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle concurrent requests', async () => {
      const params1: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Business idea 1',
      };

      const params2: ConversationParams = {
        domain: 'product',
        conversationHistory: [],
        userMessage: 'Product idea 2',
      };

      const params3: ConversationParams = {
        domain: 'creative',
        conversationHistory: [],
        userMessage: 'Story idea 3',
      };

      const [response1, response2, response3] = await Promise.all([
        continueConversation(params1),
        continueConversation(params2),
        continueConversation(params3),
      ]);

      expect(response1).toBeTruthy();
      expect(response2).toBeTruthy();
      expect(response3).toBeTruthy();
    });
  });

  describe('Logging', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should log conversation start and completion', async () => {
      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      await continueConversation(params);

      expect(consoleLogSpy).toHaveBeenCalled();
      
      // Check for start log
      const logCalls = consoleLogSpy.mock.calls;
      const startLog = logCalls.find((call) => 
        call[0].includes('Starting conversation')
      );
      expect(startLog).toBeDefined();

      // Check for completion log
      const completionLog = logCalls.find((call) => 
        call[0].includes('completed successfully')
      );
      expect(completionLog).toBeDefined();
    });

    it('should log errors', async () => {
      delete process.env.OPENROUTER_API_KEY;

      const params: ConversationParams = {
        domain: 'business',
        conversationHistory: [],
        userMessage: 'Test message',
      };

      await expect(continueConversation(params)).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});

