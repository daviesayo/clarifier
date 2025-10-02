/**
 * Integration tests for the complete generation flow
 * Tests the full flow from synthesis to generation to database storage
 */

import { generateOutput } from '@/lib/llm/generateOutput';
import { synthesizeBrief } from '@/lib/llm/synthesizeBrief';

// Mock LangChain for both synthesis and generation
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn()
      .mockResolvedValueOnce({
        // First call - synthesis
        content: 'Core Goal: Build a SaaS platform for small businesses.\n\nKey Context: The user wants to create an AI-powered social media management tool. Target market is small businesses with 5-50 employees who struggle with consistent posting.\n\nTarget Audience: Small business owners and marketing managers who lack dedicated social media teams.\n\nRequirements: Must include content scheduling, analytics dashboard, AI-powered content suggestions, multi-platform support (Facebook, Instagram, Twitter, LinkedIn).\n\nSuccess Criteria: Achieve 100 paying customers within 6 months, maintain 80% customer retention rate, achieve 4.5+ star rating from users.'
      })
      .mockResolvedValueOnce({
        // Second call - generation
        content: `# Business Model Concepts

## Concept 1: Freemium SaaS Model
**Value Proposition**: AI-powered social media management that saves time and improves engagement.

**Customer Segments**: Small businesses (5-50 employees) without dedicated marketing teams.

**Revenue Streams**: Free tier (1 social account), $29/mo Professional (5 accounts), $99/mo Business (unlimited accounts).

**Key Activities**: Product development, AI model training, customer support, content library curation.

**Competitive Advantage**: AI suggestions trained on industry-specific best practices, not generic content.

## Concept 2: Agency Partnership Model
**Value Proposition**: White-label solution for marketing agencies to offer clients.

**Customer Segments**: Digital marketing agencies serving 10+ small business clients.

**Revenue Streams**: $199/mo per agency for unlimited client accounts, setup fees, custom branding fees.

**Key Activities**: Partner recruitment, training programs, custom feature development, co-marketing.

**Competitive Advantage**: Revenue share model incentivizes agencies to promote, dedicated partnership team.

## Concept 3: Industry-Specific Vertical
**Value Proposition**: Social media management built specifically for restaurant industry needs.

**Customer Segments**: Independent restaurants and small restaurant chains (2-10 locations).

**Revenue Streams**: $49/mo per location, menu photography service add-on, review management premium tier.

**Key Activities**: Industry partnerships, specialized content templates, food photography network, review monitoring.

**Competitive Advantage**: Deep integration with reservation systems, food delivery platforms, review sites specific to restaurants.`
      })
  }))
}));

describe('Generation Integration Tests', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Full Generation Flow', () => {
    it('should complete synthesis followed by generation', async () => {
      // Step 1: Synthesize conversation
      const conversationHistory = [
        { role: 'user' as const, content: 'I want to build a social media management tool' },
        { role: 'assistant' as const, content: 'What problem does this solve for your target users?' },
        { role: 'user' as const, content: 'Small businesses struggle to maintain consistent social media presence' },
        { role: 'assistant' as const, content: 'Who specifically would use this tool?' },
        { role: 'user' as const, content: 'Small business owners with 5-50 employees who don\'t have marketing teams' },
      ];

      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory,
      });

      expect(brief).toBeTruthy();
      expect(brief.length).toBeGreaterThan(100);

      // Step 2: Generate output from brief
      const result = await generateOutput({
        domain: 'business',
        brief,
      });

      expect(result).toBeTruthy();
      expect(result.rawOutput).toBeTruthy();
      expect(result.rawOutput.length).toBeGreaterThan(200);
      expect(result.wordCount).toBeGreaterThan(50);
      expect(result.model).toBeTruthy();
    });

    it('should handle different domains in full flow', async () => {
      const domains = ['business', 'product', 'creative'];

      for (const domain of domains) {
        // Synthesis
        const brief = await synthesizeBrief({
          domain,
          conversationHistory: [
            { role: 'user', content: `I have a ${domain} idea` },
            { role: 'assistant', content: 'Tell me more about it' },
            { role: 'user', content: 'It involves helping people solve a common problem they face daily' },
          ],
        });

        expect(brief).toBeTruthy();

        // Generation
        const result = await generateOutput({
          domain,
          brief,
        });

        expect(result).toBeTruthy();
        expect(result.rawOutput).toBeTruthy();
        expect(result.model).toBeTruthy();
      }
    });
  });

  describe('Performance Testing', () => {
    it('should complete full flow within acceptable time', async () => {
      const startTime = Date.now();

      // Synthesis
      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory: [
          { role: 'user', content: 'I want to start a business' },
          { role: 'assistant', content: 'What problem are you solving?' },
          { role: 'user', content: 'Small businesses need better tools for managing their operations' },
        ],
      });

      // Generation
      const result = await generateOutput({
        domain: 'business',
        brief,
      });

      const totalDuration = Date.now() - startTime;

      expect(result).toBeTruthy();
      // Full flow should complete within 30 seconds (generous for testing)
      expect(totalDuration).toBeLessThan(30000);
    });
  });

  describe('Data Flow Validation', () => {
    it('should maintain data integrity through synthesis and generation', async () => {
      const conversationHistory = [
        { role: 'user' as const, content: 'I want to create a mobile fitness app' },
        { role: 'assistant' as const, content: 'What makes your app unique?' },
        { role: 'user' as const, content: 'It uses AI to create personalized workout plans based on user progress' },
      ];

      // Synthesis
      const brief = await synthesizeBrief({
        domain: 'product',
        conversationHistory,
      });

      expect(brief).toBeTruthy();
      expect(typeof brief).toBe('string');

      // Generation
      const result = await generateOutput({
        domain: 'product',
        brief,
      });

      expect(result.rawOutput).toBeTruthy();
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.wordCount).toBeGreaterThan(0);
      
      // Ensure both raw and structured output are handled
      expect(result).toHaveProperty('rawOutput');
      expect(result).toHaveProperty('structuredOutput');
    });

    it('should produce serializable output for database storage', async () => {
      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory: [
          { role: 'user', content: 'I need help with my business idea' },
        ],
      });

      const result = await generateOutput({
        domain: 'business',
        brief,
      });

      // Test that result can be serialized to JSON (for database storage)
      expect(() => {
        const serialized = JSON.stringify({
          rawOutput: result.rawOutput,
          structuredOutput: result.structuredOutput,
          metadata: {
            duration: result.duration,
            wordCount: result.wordCount,
            model: result.model,
          }
        });
        JSON.parse(serialized);
      }).not.toThrow();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle brief validation through the flow', async () => {
      // Create an intentionally short brief that should fail generation validation
      const shortBrief = 'Too short';

      await expect(
        generateOutput({
          domain: 'business',
          brief: shortBrief,
        })
      ).rejects.toThrow(/at least 50 words/i);
    });

    it('should propagate errors appropriately', async () => {
      const conversationHistory = [
        { role: 'user' as const, content: 'Test' },
      ];

      // Synthesis should succeed
      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory,
      });

      expect(brief).toBeTruthy();

      // Generation with proper brief should also succeed
      const result = await generateOutput({
        domain: 'business',
        brief,
      });

      expect(result).toBeTruthy();
    });
  });

  describe('Output Structure Validation', () => {
    it('should produce valid output structure', async () => {
      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory: [
          { role: 'user', content: 'I want to build a SaaS product for project management' },
          { role: 'assistant', content: 'What specific problem does it solve?' },
          { role: 'user', content: 'Teams struggle with async communication and task tracking' },
        ],
      });

      const result = await generateOutput({
        domain: 'business',
        brief,
      });

      // Validate result structure
      expect(result).toMatchObject({
        rawOutput: expect.any(String),
        duration: expect.any(Number),
        wordCount: expect.any(Number),
        model: expect.any(String),
      });

      // structuredOutput can be object or null
      if (result.structuredOutput !== null) {
        expect(typeof result.structuredOutput).toBe('object');
      }
    });
  });
});

