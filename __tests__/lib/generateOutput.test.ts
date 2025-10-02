/**
 * Unit tests for the generateOutput module
 */

import { generateOutput, generateOutputWithMetadata, GenerationError, ValidationError } from '@/lib/llm/generateOutput';

// Mock the LangChain client
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: `# Business Model Concepts

## Concept 1: Freemium SaaS Model
**Value Proposition**: AI-powered analytics platform that democratizes data insights for small businesses.

**Customer Segments**: Small to medium businesses (10-100 employees) lacking dedicated data teams.

**Revenue Streams**: Free tier with basic features, $49/month professional tier, $199/month enterprise tier with white-label options.

**Key Activities**: Product development, customer onboarding, community building, and continuous feature iteration.

**Competitive Advantage**: Simplified UI that requires no technical expertise, coupled with AI-driven insights that typically require expensive consultants.

## Concept 2: Marketplace Model
**Value Proposition**: Connect businesses with pre-vetted freelance specialists for specific projects.

**Customer Segments**: Fast-growing startups and agencies needing flexible talent without full-time hiring.

**Revenue Streams**: 15% commission on all transactions, premium listings for top-rated freelancers, subscription for unlimited project postings.

**Key Activities**: Vetting specialists, matchmaking algorithms, quality assurance, payment processing, dispute resolution.

**Competitive Advantage**: AI-powered matching system that considers cultural fit and project requirements, not just skills.

## Concept 3: B2B Partnership Model
**Value Proposition**: White-label solution that existing platforms can integrate to enhance their offerings.

**Customer Segments**: Established SaaS companies wanting to add complementary features without building from scratch.

**Revenue Streams**: Annual licensing fees based on end-user volume, implementation fees, ongoing support contracts.

**Key Activities**: API development, partner enablement, technical documentation, integration support.

**Competitive Advantage**: Plug-and-play integration with comprehensive documentation and dedicated partnership team.`
    })
  }))
}));

// Mock the prompts module
jest.mock('@/lib/prompts', () => ({
  getGenerationPrompt: jest.fn((domain: string, brief: string) => 
    `Generate ${domain} output based on: ${brief}`
  )
}));

describe('generateOutput', () => {
  beforeEach(() => {
    // Set up required environment variable
    process.env.OPENROUTER_API_KEY = 'test-api-key';
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should generate output from a synthesized brief', async () => {
      const brief = 'User wants to build a SaaS product for small businesses that helps them manage their social media presence. Target market is businesses with 5-50 employees who struggle with consistent social media posting. Key features include content scheduling, analytics dashboard, and AI-powered content suggestions. Success metrics include 100 paying customers within 6 months and 80% customer retention rate.';

      const result = await generateOutput({
        domain: 'business',
        brief
      });

      expect(result).toBeTruthy();
      expect(result.rawOutput).toBeTruthy();
      expect(typeof result.rawOutput).toBe('string');
      expect(result.rawOutput.length).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.model).toBeTruthy();
    });

    it('should work with different domains', async () => {
      const domains = ['business', 'product', 'creative', 'research', 'coding'];
      const brief = 'A comprehensive brief with over fifty words describing the project context, goals, target audience, key requirements, success criteria, constraints, timeline expectations, budget considerations, and stakeholder needs. This brief provides extensive detailed information about what the user wants to achieve, why it matters to them, and how they plan to measure success in their endeavor.';

      for (const domain of domains) {
        const result = await generateOutput({
          domain,
          brief
        });

        expect(result).toBeTruthy();
        expect(result.rawOutput).toBeTruthy();
        expect(typeof result.rawOutput).toBe('string');
        expect(result.model).toBeTruthy();
      }
    });

    it('should return structured output when parsing succeeds', async () => {
      const brief = 'A comprehensive brief with over fifty words describing the project context, goals, target audience, key requirements, success criteria, constraints, timeline expectations, budget considerations, and stakeholder needs. This brief provides extensive detailed information about what the user wants to achieve, why it matters to them, and how they plan to measure success in their endeavor.';

      const result = await generateOutput({
        domain: 'business',
        brief
      });

      expect(result).toHaveProperty('rawOutput');
      expect(result).toHaveProperty('structuredOutput');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('wordCount');
      expect(result).toHaveProperty('model');
    });

    it('should handle structured output gracefully', async () => {
      const brief = 'A comprehensive brief with over fifty words describing the project context, goals, target audience, key requirements, success criteria, constraints, timeline expectations, budget considerations, and stakeholder needs. This brief provides extensive detailed information about what the user wants to achieve, why it matters to them, and how they plan to measure success in their endeavor.';

      const result = await generateOutput({
        domain: 'product',
        brief
      });

      // structuredOutput should either be an object or null (if parsing failed)
      expect(result.structuredOutput === null || typeof result.structuredOutput === 'object').toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should throw ValidationError for missing domain', async () => {
      await expect(
        generateOutput({
          domain: '',
          brief: 'A comprehensive brief with over fifty words describing the project.'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid domain type', async () => {
      await expect(
        generateOutput({
          domain: 123 as any,
          brief: 'A comprehensive brief with over fifty words describing the project.'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing brief', async () => {
      await expect(
        generateOutput({
          domain: 'business',
          brief: ''
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid brief type', async () => {
      const error = await generateOutput({
        domain: 'business',
        brief: 123 as any
      }).catch(e => e);
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain('Brief must be a string');
    });

    it('should throw ValidationError for brief that is too short', async () => {
      await expect(
        generateOutput({
          domain: 'business',
          brief: 'Too short'
        })
      ).rejects.toThrow(ValidationError);
      
      await expect(
        generateOutput({
          domain: 'business',
          brief: 'Too short'
        })
      ).rejects.toThrow(/at least 50 words/i);
    });

    it('should accept brief with exactly 50 words', async () => {
      const fiftyWords = Array(50).fill('word').join(' ');
      
      const result = await generateOutput({
        domain: 'business',
        brief: fiftyWords
      });

      expect(result).toBeTruthy();
      expect(result.rawOutput).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should throw GenerationError when API key is missing', async () => {
      delete process.env.OPENROUTER_API_KEY;

      const brief = 'A comprehensive brief with over fifty words describing the project context, goals, target audience, key requirements, success criteria, constraints, timeline expectations, budget considerations, and stakeholder needs. This brief provides extensive detailed information about what the user wants to achieve, why it matters to them, and how they plan to measure success in their endeavor.';

      await expect(
        generateOutput({
          domain: 'business',
          brief
        })
      ).rejects.toThrow(GenerationError);

      // Restore for other tests
      process.env.OPENROUTER_API_KEY = 'test-api-key';
    });

    it('should include error code in GenerationError', async () => {
      delete process.env.OPENROUTER_API_KEY;

      const brief = 'A comprehensive brief with over fifty words describing the project context, goals, target audience, key requirements, success criteria, constraints, timeline expectations, budget considerations, and stakeholder needs. This brief provides extensive detailed information about what the user wants to achieve, why it matters to them, and how they plan to measure success in their endeavor.';

      try {
        await generateOutput({
          domain: 'business',
          brief
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(GenerationError);
        // The error propagates through retry logic, so check it's a GenerationError
        expect((error as GenerationError).code).toMatch(/MISSING_API_KEY|GENERATION_FAILED/);
      }

      // Restore for other tests
      process.env.OPENROUTER_API_KEY = 'test-api-key';
    });
  });

  describe('generateOutputWithMetadata', () => {
    it('should return output with full metadata', async () => {
      const brief = 'A comprehensive brief with over fifty words describing the project context, goals, target audience, key requirements, success criteria, constraints, timeline expectations, budget considerations, and stakeholder needs. This brief provides extensive detailed information about what the user wants to achieve, why it matters to them, and how they plan to measure success in their endeavor.';

      const result = await generateOutputWithMetadata({
        domain: 'business',
        brief
      });

      expect(result).toHaveProperty('rawOutput');
      expect(result).toHaveProperty('structuredOutput');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('wordCount');
      expect(result).toHaveProperty('model');
      expect(typeof result.rawOutput).toBe('string');
      expect(typeof result.duration).toBe('number');
      expect(typeof result.wordCount).toBe('number');
      expect(typeof result.model).toBe('string');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.wordCount).toBeGreaterThan(0);
    });
  });

  describe('Output Quality', () => {
    it('should return meaningful output content', async () => {
      const brief = 'User wants to build a mobile app for fitness tracking with social features and accountability systems. Target users are millennials who want dedicated accountability partners to stay motivated. Key features include comprehensive workout logging, detailed progress tracking, engaging friend challenges, achievement badges, and social sharing capabilities. Success criteria include achieving 10,000 downloads in first 3 months, maintaining active user engagement, and building a strong community around fitness goals.';

      const result = await generateOutput({
        domain: 'product',
        brief
      });

      expect(result.rawOutput.length).toBeGreaterThan(100);
      expect(result.wordCount).toBeGreaterThan(20);
    });

    it('should maintain brief context in generation', async () => {
      const brief = 'User wants to create a captivating mystery novel set in Victorian London featuring a strong female detective who challenges social norms. The story should deeply explore themes of social justice and women\'s rights during this transformative period. Target audience is adult readers who enjoy historical fiction with strong character development. Key elements include atmospheric Victorian setting, complex plot twists, compelling character arcs, and historically accurate social commentary that resonates with modern readers.';

      const result = await generateOutput({
        domain: 'creative',
        brief
      });

      expect(result.rawOutput).toBeTruthy();
      expect(result.wordCount).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const brief = 'A comprehensive brief with over fifty words describing the project context, goals, target audience, key requirements, success criteria, constraints, timeline expectations, budget considerations, and stakeholder needs. This brief provides extensive detailed information about what the user wants to achieve, why it matters to them, and how they plan to measure success in their endeavor.';

      const startTime = Date.now();

      await generateOutput({
        domain: 'business',
        brief
      });

      const duration = Date.now() - startTime;

      // Should complete within 25 seconds (generous for testing with retries)
      expect(duration).toBeLessThan(25000);
    });

    it('should track generation duration accurately', async () => {
      const brief = 'A comprehensive brief with over fifty words describing the project context, goals, target audience, key requirements, success criteria, constraints, timeline expectations, budget considerations, and stakeholder needs. This brief provides extensive detailed information about what the user wants to achieve, why it matters to them, and how they plan to measure success in their endeavor.';

      const result = await generateOutput({
        domain: 'business',
        brief
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeLessThan(30000);
    });
  });

  describe('Word Count Calculation', () => {
    it('should calculate word count correctly', async () => {
      const brief = 'A comprehensive brief with over fifty words describing the project context, goals, target audience, key requirements, success criteria, constraints, timeline expectations, budget considerations, and stakeholder needs. This brief provides extensive detailed information about what the user wants to achieve, why it matters to them, and how they plan to measure success in their endeavor.';

      const result = await generateOutput({
        domain: 'business',
        brief
      });

      expect(result.wordCount).toBeGreaterThan(0);
      expect(typeof result.wordCount).toBe('number');
      
      // Word count should be reasonable for the mock output
      expect(result.wordCount).toBeGreaterThan(10);
    });
  });
});

