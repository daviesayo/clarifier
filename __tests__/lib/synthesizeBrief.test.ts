/**
 * Unit tests for the synthesizeBrief module
 */

import { synthesizeBrief, synthesizeBriefWithMetadata, SynthesisError, ValidationError } from '@/lib/llm/synthesizeBrief';

// Mock the LangChain client
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: 'Core Goal: Test a business idea for eco-friendly products.\n\nKey Context: The user wants to create an online marketplace connecting consumers with sustainable product manufacturers. Target market is environmentally conscious millennials.\n\nTarget Audience: Urban millennials aged 25-40 who prioritize sustainability in their purchasing decisions.\n\nRequirements: Platform must be user-friendly, mobile-responsive, and feature verified eco-certifications for all products. Need integration with existing e-commerce payment systems.\n\nSuccess Criteria: Launch with 50+ verified vendors within 6 months, achieve 10,000 active users in first year, maintain 4.5+ star rating on app stores.'
    })
  }))
}));

describe('synthesizeBrief', () => {
  beforeEach(() => {
    // Set up required environment variable
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should synthesize a brief from conversation history', async () => {
      const result = await synthesizeBrief({
        domain: 'business',
        conversationHistory: [
          { role: 'user', content: 'I want to start a business' },
          { role: 'assistant', content: 'What problem are you trying to solve?' },
          { role: 'user', content: 'I want to help people find eco-friendly products' }
        ]
      });

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty conversation history', async () => {
      const result = await synthesizeBrief({
        domain: 'product',
        conversationHistory: []
      });

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should work with different domains', async () => {
      const domains = ['business', 'product', 'creative', 'research'];

      for (const domain of domains) {
        const result = await synthesizeBrief({
          domain,
          conversationHistory: [
            { role: 'user', content: `I have a ${domain} idea` },
            { role: 'assistant', content: 'Tell me more about it' }
          ]
        });

        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
      }
    });
  });

  describe('Input Validation', () => {
    it('should throw ValidationError for missing domain', async () => {
      await expect(
        synthesizeBrief({
          domain: '',
          conversationHistory: []
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid domain type', async () => {
      await expect(
        synthesizeBrief({
          domain: 123 as any,
          conversationHistory: []
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for non-array conversation history', async () => {
      await expect(
        synthesizeBrief({
          domain: 'business',
          conversationHistory: 'not an array' as any
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid message role', async () => {
      await expect(
        synthesizeBrief({
          domain: 'business',
          conversationHistory: [
            { role: 'invalid' as any, content: 'test' }
          ]
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing message content', async () => {
      await expect(
        synthesizeBrief({
          domain: 'business',
          conversationHistory: [
            { role: 'user', content: '' }
          ]
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Error Handling', () => {
    it('should throw SynthesisError when API key is missing', async () => {
      delete process.env.OPENROUTER_API_KEY;

      await expect(
        synthesizeBrief({
          domain: 'business',
          conversationHistory: []
        })
      ).rejects.toThrow(SynthesisError);

      // Restore for other tests
      process.env.OPENROUTER_API_KEY = 'test-api-key';
    });
  });

  describe('synthesizeBriefWithMetadata', () => {
    it('should return brief with metadata', async () => {
      const result = await synthesizeBriefWithMetadata({
        domain: 'business',
        conversationHistory: [
          { role: 'user', content: 'Test message' }
        ]
      });

      expect(result).toHaveProperty('brief');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('wordCount');
      expect(typeof result.brief).toBe('string');
      expect(typeof result.duration).toBe('number');
      expect(typeof result.wordCount).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.wordCount).toBeGreaterThan(0);
    });
  });

  describe('Conversation History Formatting', () => {
    it('should handle long conversation histories', async () => {
      const longHistory = Array.from({ length: 100 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i + 1}`
      }));

      const result = await synthesizeBrief({
        domain: 'business',
        conversationHistory: longHistory
      });

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle messages with special characters', async () => {
      const result = await synthesizeBrief({
        domain: 'business',
        conversationHistory: [
          { role: 'user', content: 'Test with special chars: @#$%^&*()' },
          { role: 'assistant', content: 'Response with "quotes" and \'apostrophes\'' }
        ]
      });

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const startTime = Date.now();

      await synthesizeBrief({
        domain: 'business',
        conversationHistory: [
          { role: 'user', content: 'Test message' }
        ]
      });

      const duration = Date.now() - startTime;

      // Should complete within 10 seconds (generous for testing)
      expect(duration).toBeLessThan(10000);
    });
  });
});

