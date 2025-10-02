/**
 * Integration tests for context synthesis
 * Tests the synthesis module with real conversation data
 */

import { synthesizeBrief, synthesizeBriefWithMetadata } from '@/lib/llm/synthesizeBrief';

// Mock the LangChain client for integration testing
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockImplementation((messages) => {
      // Simulate different responses based on domain
      const systemMessage = messages[0];
      const userMessage = messages[1];
      const prompt = userMessage.content;
      
      if (prompt.includes('business')) {
        return Promise.resolve({
          content: `Core Goal: Create an eco-friendly marketplace platform connecting consumers with verified sustainable brands.

Key Context: The user wants to solve the problem of finding reliable eco-friendly products by building a platform that focuses on verified certifications and environmental impact ratings. The target market is millennials and Gen Z in urban areas who prioritize sustainability.

Target Audience: Urban millennials and Gen Z consumers (ages 18-35) who are environmentally conscious and willing to pay premium for verified sustainable products. Geographic focus on major metropolitan areas.

Requirements: Platform must feature verified eco-certifications for all products, include a rating system for actual environmental impact, provide user-friendly interface for browsing and purchasing, and ensure mobile responsiveness for the target demographic.

Success Criteria: Launch with 50+ verified eco-friendly brands within 6 months, achieve 10,000 active users in first year, maintain 4.5+ star rating on app stores, and establish partnerships with major environmental certification bodies.`
        });
      } else if (prompt.includes('product')) {
        return Promise.resolve({
          content: `Core Goal: Develop a social feature for a fitness tracking app that allows runners to share runs and challenge friends.

Key Context: The user is building a fitness tracking app specifically for runners and wants to add social functionality. The app targets both iOS and Android platforms and requires offline functionality for social features.

Target Audience: Active runners of all skill levels who want to connect with friends and share their fitness progress. Users range from casual joggers to serious marathoners, primarily mobile-first users.

Requirements: Social feature must work on both iOS and Android platforms, support offline functionality with sync when online, include run sharing capabilities, enable friend challenges, and maintain data integrity during offline/online transitions.

Success Criteria: Feature must sync seamlessly when users come back online, maintain data consistency, support real-time challenges when online, and provide engaging social experience that increases user retention by 25%.`
        });
      } else if (prompt.includes('creative')) {
        return Promise.resolve({
          content: `Core Goal: Develop a compelling science fiction novel about a discredited climate scientist who discovers a way to extract water from air in a water-scarce 2050 world.

Key Context: The story is set in 2050 when the world has run out of water. The protagonist is a former climate scientist who was discredited for her radical theories but discovers a revolutionary water extraction method. The novel explores themes of trust, scientific integrity, and environmental crisis.

Target Audience: Science fiction readers aged 18-45 who enjoy climate fiction, character-driven stories, and near-future dystopian settings. Readers who appreciate complex protagonists and moral dilemmas.

Requirements: Novel must feature a well-developed protagonist with clear internal conflicts (trust issues, secrecy vs. sharing), compelling external conflict (water crisis), strong scientific foundation, and engaging plot structure that balances character development with action.

Success Criteria: Complete manuscript of 80,000-100,000 words, compelling character arc for protagonist, scientifically plausible water extraction method, and strong thematic exploration of trust and environmental responsibility.`
        });
      } else {
        return Promise.resolve({
          content: `Core Goal: [Generated based on conversation context]

Key Context: [Generated based on conversation details]

Target Audience: [Generated based on user input]

Requirements: [Generated based on conversation requirements]

Success Criteria: [Generated based on conversation goals]`
        });
      }
    })
  }))
}));

describe('Context Synthesis Integration Tests', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Real Conversation Data Tests', () => {
    const testConversations = {
      business: [
        { role: 'user' as const, content: 'I want to start a business but I\'m not sure what to do' },
        { role: 'assistant' as const, content: 'That\'s exciting! What problems have you noticed in your daily life that you think could be solved with a business?' },
        { role: 'user' as const, content: 'I always struggle to find eco-friendly products that actually work well' },
        { role: 'assistant' as const, content: 'That\'s a great problem to solve! Are you thinking of creating products yourself or building a platform to help others find them?' },
        { role: 'user' as const, content: 'I\'d like to build a platform that connects consumers with verified eco-friendly brands' },
        { role: 'assistant' as const, content: 'Excellent! Who do you see as your target customers? Are you thinking of a specific demographic or geographic area?' },
        { role: 'user' as const, content: 'Probably millennials and Gen Z in urban areas who care about sustainability' },
        { role: 'assistant' as const, content: 'Perfect target market! What would make your platform different from existing eco-friendly marketplaces?' },
        { role: 'user' as const, content: 'I want to focus on verified certifications and have a rating system for actual environmental impact' }
      ],
      product: [
        { role: 'user' as const, content: 'I need help designing a mobile app feature' },
        { role: 'assistant' as const, content: 'I\'d be happy to help! What kind of mobile app are you working on?' },
        { role: 'user' as const, content: 'It\'s a fitness tracking app for runners' },
        { role: 'assistant' as const, content: 'Great! What specific feature are you looking to add?' },
        { role: 'user' as const, content: 'I want to add a social feature where users can share their runs and challenge friends' },
        { role: 'assistant' as const, content: 'That sounds engaging! What platforms are you targeting - iOS, Android, or both?' },
        { role: 'user' as const, content: 'Both platforms, and I want it to work offline too' },
        { role: 'assistant' as const, content: 'Interesting requirement! How do you envision the offline functionality working for social features?' },
        { role: 'user' as const, content: 'I think it should sync when they come back online, and maybe show cached data' }
      ],
      creative: [
        { role: 'user' as const, content: 'I\'m writing a novel and need help with character development' },
        { role: 'assistant' as const, content: 'I love helping with creative writing! What genre is your novel?' },
        { role: 'user' as const, content: 'It\'s a science fiction story set in 2050' },
        { role: 'assistant' as const, content: 'Fascinating! What\'s the main conflict or challenge your protagonist faces?' },
        { role: 'user' as const, content: 'The world has run out of water and my character discovers a way to extract it from air' },
        { role: 'assistant' as const, content: 'That\'s a compelling premise! What\'s your protagonist\'s background - are they a scientist, engineer, or something else?' },
        { role: 'user' as const, content: 'She\'s a former climate scientist who was discredited for her radical theories' },
        { role: 'assistant' as const, content: 'Perfect backstory! What internal struggles does she face beyond the external water crisis?' },
        { role: 'user' as const, content: 'She struggles with trust issues and whether to share her discovery or keep it secret' }
      ]
    };

    it('should synthesize business conversation into structured brief', async () => {
      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory: testConversations.business
      });

      expect(brief).toBeTruthy();
      expect(typeof brief).toBe('string');
      expect(brief.length).toBeGreaterThan(200);
      
      // Check for required sections
      expect(brief.toLowerCase()).toContain('goal');
      expect(brief.toLowerCase()).toContain('context');
      expect(brief.toLowerCase()).toContain('audience');
      expect(brief.toLowerCase()).toContain('requirement');
      expect(brief.toLowerCase()).toContain('success');
      
      // Check for domain-specific content
      expect(brief.toLowerCase()).toContain('eco-friendly');
      expect(brief.toLowerCase()).toContain('platform');
      expect(brief.toLowerCase()).toContain('millennials');
    });

    it('should synthesize product conversation into structured brief', async () => {
      const brief = await synthesizeBrief({
        domain: 'product',
        conversationHistory: testConversations.product
      });

      expect(brief).toBeTruthy();
      expect(typeof brief).toBe('string');
      expect(brief.length).toBeGreaterThan(200);
      
      // Check for required sections
      expect(brief.toLowerCase()).toContain('goal');
      expect(brief.toLowerCase()).toContain('context');
      expect(brief.toLowerCase()).toContain('audience');
      expect(brief.toLowerCase()).toContain('requirement');
      expect(brief.toLowerCase()).toContain('success');
      
      // Check for domain-specific content
      expect(brief.toLowerCase()).toContain('fitness');
      expect(brief.toLowerCase()).toContain('social');
      expect(brief.toLowerCase()).toContain('offline');
    });

    it('should synthesize creative conversation into structured brief', async () => {
      const brief = await synthesizeBrief({
        domain: 'creative',
        conversationHistory: testConversations.creative
      });

      expect(brief).toBeTruthy();
      expect(typeof brief).toBe('string');
      expect(brief.length).toBeGreaterThan(200);
      
      // Check for required sections
      expect(brief.toLowerCase()).toContain('goal');
      expect(brief.toLowerCase()).toContain('context');
      expect(brief.toLowerCase()).toContain('audience');
      expect(brief.toLowerCase()).toContain('requirement');
      expect(brief.toLowerCase()).toContain('success');
      
      // Check for domain-specific content
      expect(brief.toLowerCase()).toContain('novel');
      expect(brief.toLowerCase()).toContain('science fiction');
      expect(brief.toLowerCase()).toContain('character');
    });

    it('should handle long conversation histories', async () => {
      // Create a long conversation
      const longConversation = Array.from({ length: 30 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i + 1}: This is a test message for conversation history testing.`
      }));

      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory: longConversation
      });

      expect(brief).toBeTruthy();
      expect(typeof brief).toBe('string');
      expect(brief.length).toBeGreaterThan(200);
    });

    it('should handle conversations with special characters', async () => {
      const specialConversation = [
        { role: 'user' as const, content: 'I need help with a project that uses @#$%^&*() symbols' },
        { role: 'assistant' as const, content: 'I can help! What kind of project is it?' },
        { role: 'user' as const, content: 'It\'s a "quoted" project with \'apostrophes\' and special chars' }
      ];

      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory: specialConversation
      });

      expect(brief).toBeTruthy();
      expect(typeof brief).toBe('string');
      expect(brief.length).toBeGreaterThan(200);
    });
  });

  describe('Performance Tests', () => {
    it('should complete synthesis within acceptable time', async () => {
      const conversation = [
        { role: 'user' as const, content: 'Test message' },
        { role: 'assistant' as const, content: 'Test response' }
      ];

      const startTime = Date.now();
      
      await synthesizeBrief({
        domain: 'business',
        conversationHistory: conversation
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should return metadata with synthesis', async () => {
      const conversation = [
        { role: 'user' as const, content: 'Test message' },
        { role: 'assistant' as const, content: 'Test response' }
      ];

      const result = await synthesizeBriefWithMetadata({
        domain: 'business',
        conversationHistory: conversation
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

  describe('Error Handling Tests', () => {
    it('should handle empty conversation gracefully', async () => {
      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory: []
      });

      expect(brief).toBeTruthy();
      expect(typeof brief).toBe('string');
    });

    it('should handle single message conversations', async () => {
      const brief = await synthesizeBrief({
        domain: 'business',
        conversationHistory: [
          { role: 'user' as const, content: 'Single message test' }
        ]
      });

      expect(brief).toBeTruthy();
      expect(typeof brief).toBe('string');
    });
  });
});
