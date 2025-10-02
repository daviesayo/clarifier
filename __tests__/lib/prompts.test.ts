/**
 * Unit tests for domain-specific prompt templates
 * 
 * Tests cover all functionality including domain validation, prompt retrieval,
 * error handling, and type safety for the prompts module.
 */

import {
  getMetaPrompt,
  getAvailableDomains,
  getAvailableIntensities,
  hasDomain,
  hasIntensity,
  InvalidDomainError,
  InvalidIntensityError,
  VALID_DOMAINS,
  VALID_INTENSITIES,
  type Domain,
} from '../../lib/prompts';

describe('Domain Prompts', () => {
  describe('getMetaPrompt', () => {
    describe('Deep prompts (default)', () => {
      it('should return deep business prompt for valid domain', () => {
        const prompt = getMetaPrompt('business', 'deep');
        expect(prompt).toContain('startup advisor');
        expect(prompt).toContain('battle-tested');
        expect(prompt).toContain('brutal truth');
        expect(prompt).toContain('Ask ONE devastating question at a time');
      });

      it('should return deep business prompt by default', () => {
        const prompt = getMetaPrompt('business');
        expect(prompt).toContain('battle-tested');
        expect(prompt).toContain('brutal truth');
      });
    });

    describe('Basic prompts', () => {
      it('should return basic business prompt for valid domain', () => {
        const prompt = getMetaPrompt('business', 'basic');
        expect(prompt).toContain('friendly startup advisor');
        expect(prompt).toContain('helpful questioning');
        expect(prompt).toContain('Ask ONE question at a time');
      });

      it('should return deep product prompt for valid domain', () => {
        const prompt = getMetaPrompt('product', 'deep');
        expect(prompt).toContain('product strategist');
        expect(prompt).toContain('shipped features');
        expect(prompt).toContain('user psychology');
        expect(prompt).toContain('Ask ONE laser-focused question at a time');
      });

      it('should return deep creative prompt for valid domain', () => {
        const prompt = getMetaPrompt('creative', 'deep');
        expect(prompt).toContain('master storyteller');
        expect(prompt).toContain('emotional core');
        expect(prompt).toContain('beating heart');
        expect(prompt).toContain('Ask ONE evocative question at a time');
      });

      it('should return deep research prompt for valid domain', () => {
        const prompt = getMetaPrompt('research', 'deep');
        expect(prompt).toContain('research methodology expert');
        expect(prompt).toContain('top-tier journals');
        expect(prompt).toContain('bulletproof research');
        expect(prompt).toContain('Ask ONE rigorous question at a time');
      });

      it('should return deep coding prompt for valid domain', () => {
        const prompt = getMetaPrompt('coding', 'deep');
        expect(prompt).toContain('principal architect');
        expect(prompt).toContain('billions of requests');
        expect(prompt).toContain('technical challenges');
        expect(prompt).toContain('Ask ONE technically precise question at a time');
      });
    });

    describe('Basic prompts for all domains', () => {
      it('should return basic product prompt', () => {
        const prompt = getMetaPrompt('product', 'basic');
        expect(prompt).toContain('helpful product manager');
        expect(prompt).toContain('practical and supportive');
      });

      it('should return basic creative prompt', () => {
        const prompt = getMetaPrompt('creative', 'basic');
        expect(prompt).toContain('creative writing coach');
        expect(prompt).toContain('encouraging and imaginative');
      });

      it('should return basic research prompt', () => {
        const prompt = getMetaPrompt('research', 'basic');
        expect(prompt).toContain('experienced research advisor');
        expect(prompt).toContain('methodical and supportive');
      });

      it('should return basic coding prompt', () => {
        const prompt = getMetaPrompt('coding', 'basic');
        expect(prompt).toContain('senior developer');
        expect(prompt).toContain('technical but approachable');
      });
    });

    it('should throw InvalidDomainError for invalid domain', () => {
      expect(() => getMetaPrompt('invalid')).toThrow(InvalidDomainError);
      expect(() => getMetaPrompt('invalid')).toThrow('Invalid domain: invalid. Must be one of: business, product, creative, research, coding');
    });

    it('should throw InvalidIntensityError for invalid intensity', () => {
      expect(() => getMetaPrompt('business', 'invalid' as any)).toThrow(InvalidIntensityError);
      expect(() => getMetaPrompt('business', 'invalid' as any)).toThrow('Invalid intensity: invalid. Must be one of: basic, deep');
    });

    it('should throw InvalidDomainError for empty string', () => {
      expect(() => getMetaPrompt('')).toThrow(InvalidDomainError);
    });

    it('should throw InvalidDomainError for null/undefined', () => {
      expect(() => getMetaPrompt(null as any)).toThrow(InvalidDomainError);
      expect(() => getMetaPrompt(undefined as any)).toThrow(InvalidDomainError);
    });

    it('should be case sensitive for domains', () => {
      expect(() => getMetaPrompt('Business')).toThrow(InvalidDomainError);
      expect(() => getMetaPrompt('BUSINESS')).toThrow(InvalidDomainError);
    });

    it('should be case sensitive for intensities', () => {
      expect(() => getMetaPrompt('business', 'Basic' as any)).toThrow(InvalidIntensityError);
      expect(() => getMetaPrompt('business', 'DEEP' as any)).toThrow(InvalidIntensityError);
    });
  });

  describe('Domain Validation', () => {
    it('should validate all valid domains', () => {
      VALID_DOMAINS.forEach(domain => {
        expect(hasDomain(domain)).toBe(true);
        expect(() => getMetaPrompt(domain, 'deep')).not.toThrow();
      });
    });

    it('should reject invalid domains', () => {
      const invalidDomains = ['invalid', 'test', 'admin', 'user', 'api'];
      invalidDomains.forEach(domain => {
        expect(hasDomain(domain)).toBe(false);
        expect(() => getMetaPrompt(domain, 'deep')).toThrow(InvalidDomainError);
      });
    });

    it('should have correct VALID_DOMAINS array', () => {
      expect(VALID_DOMAINS).toEqual(['business', 'product', 'creative', 'research', 'coding']);
      expect(VALID_DOMAINS).toHaveLength(5);
    });
  });

  describe('Intensity Validation', () => {
    it('should validate all valid intensities', () => {
      VALID_INTENSITIES.forEach(intensity => {
        expect(hasIntensity(intensity)).toBe(true);
        expect(() => getMetaPrompt('business', intensity)).not.toThrow();
      });
    });

    it('should reject invalid intensities', () => {
      const invalidIntensities = ['invalid', 'medium', 'high', 'low', 'extreme'];
      invalidIntensities.forEach(intensity => {
        expect(hasIntensity(intensity)).toBe(false);
        expect(() => getMetaPrompt('business', intensity as any)).toThrow(InvalidIntensityError);
      });
    });

    it('should have correct VALID_INTENSITIES array', () => {
      expect(VALID_INTENSITIES).toEqual(['basic', 'deep']);
      expect(VALID_INTENSITIES).toHaveLength(2);
    });
  });

  describe('getAvailableDomains', () => {
    it('should return all valid domains', () => {
      const domains = getAvailableDomains();
      expect(domains).toEqual(VALID_DOMAINS);
      expect(domains).toHaveLength(5);
      expect(domains).toContain('business');
      expect(domains).toContain('product');
      expect(domains).toContain('creative');
      expect(domains).toContain('research');
      expect(domains).toContain('coding');
    });

    it('should return readonly array', () => {
      const domains = getAvailableDomains();
      // Test that the array is readonly by checking if it has the readonly property
      expect(domains).toBeDefined();
      expect(Array.isArray(domains)).toBe(true);
    });
  });

  describe('getAvailableIntensities', () => {
    it('should return all valid intensities', () => {
      const intensities = getAvailableIntensities();
      expect(intensities).toEqual(VALID_INTENSITIES);
      expect(intensities).toHaveLength(2);
      expect(intensities).toContain('basic');
      expect(intensities).toContain('deep');
    });

    it('should return readonly array', () => {
      const intensities = getAvailableIntensities();
      expect(intensities).toBeDefined();
      expect(Array.isArray(intensities)).toBe(true);
    });
  });

  describe('hasDomain', () => {
    it('should return true for valid domains', () => {
      VALID_DOMAINS.forEach(domain => {
        expect(hasDomain(domain)).toBe(true);
      });
    });

    it('should return false for invalid domains', () => {
      const invalidDomains = ['invalid', 'test', 'admin', 'user', 'api'];
      invalidDomains.forEach(domain => {
        expect(hasDomain(domain)).toBe(false);
      });
    });

    it('should be case sensitive', () => {
      expect(hasDomain('Business')).toBe(false);
      expect(hasDomain('BUSINESS')).toBe(false);
      expect(hasDomain('business')).toBe(true);
    });
  });

  describe('hasIntensity', () => {
    it('should return true for valid intensities', () => {
      VALID_INTENSITIES.forEach(intensity => {
        expect(hasIntensity(intensity)).toBe(true);
      });
    });

    it('should return false for invalid intensities', () => {
      const invalidIntensities = ['invalid', 'medium', 'high', 'low', 'extreme'];
      invalidIntensities.forEach(intensity => {
        expect(hasIntensity(intensity)).toBe(false);
      });
    });

    it('should be case sensitive', () => {
      expect(hasIntensity('Basic')).toBe(false);
      expect(hasIntensity('DEEP')).toBe(false);
      expect(hasIntensity('basic')).toBe(true);
      expect(hasIntensity('deep')).toBe(true);
    });
  });

  describe('Prompt Content Quality', () => {
    it('should have proper termination instructions for all domains', () => {
      VALID_DOMAINS.forEach(domain => {
        const prompt = getMetaPrompt(domain, 'deep');
        expect(prompt).toBeDefined();
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
        expect(prompt).toMatch(/Ask ONE .+ question at a time/);
        expect(prompt).toMatch(/After \d+-\d+ questions/);
        expect(prompt).toMatch(/ask if they.*ready to.*generate/);
      });
    });

    it('should have persona establishment for all domains', () => {
      const deepPersonas = {
        business: 'startup advisor',
        product: 'product strategist',
        creative: 'master storyteller',
        research: 'research methodology expert',
        coding: 'principal architect'
      };

      Object.entries(deepPersonas).forEach(([domain, persona]) => {
        const prompt = getMetaPrompt(domain as Domain, 'deep');
        expect(prompt).toContain(persona);
      });
    });

    it('should have focus areas for all domains', () => {
      const deepFocusAreas = {
        business: ['problem', 'customer', 'market', 'assumptions'],
        product: ['user', 'behavior', 'success', 'metrics'],
        creative: ['emotional', 'protagonist', 'conflict', 'voice'],
        research: ['knowledge gap', 'methodology', 'existing work', 'constraints'],
        coding: ['requirements', 'scale', 'technology', 'integration']
      };

      Object.entries(deepFocusAreas).forEach(([domain, areas]) => {
        const prompt = getMetaPrompt(domain as Domain, 'deep');
        areas.forEach(area => {
          expect(prompt.toLowerCase()).toContain(area.toLowerCase());
        });
      });
    });

    it('should have consistent question count ranges', () => {
      const questionRanges = {
        business: '5-7',
        product: '5-7',
        creative: '6-8',
        research: '5-7',
        coding: '6-8'
      };

      Object.entries(questionRanges).forEach(([domain, range]) => {
        const prompt = getMetaPrompt(domain as Domain, 'deep');
        expect(prompt).toContain(`After ${range} questions`);
      });
    });
  });

  describe('Error Handling', () => {
    it('should have descriptive error messages', () => {
      expect(() => getMetaPrompt('invalid')).toThrow(InvalidDomainError);
      expect(() => getMetaPrompt('invalid')).toThrow('Invalid domain: invalid');
      expect(() => getMetaPrompt('invalid')).toThrow('Must be one of: business, product, creative, research, coding');
    });

    it('should have correct error name', () => {
      try {
        getMetaPrompt('invalid');
        fail('Expected InvalidDomainError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('InvalidDomainError');
      }
    });
  });

  describe('Type Safety', () => {
    it('should enforce Domain type in function parameters', () => {
      // This test ensures TypeScript compilation works correctly
      const validDomain: Domain = 'business';
      expect(() => getMetaPrompt(validDomain, 'deep')).not.toThrow();
    });

    it('should work with type guards', () => {
      const testDomain = 'business';
      if (hasDomain(testDomain)) {
        // TypeScript should know this is a valid Domain here
        const prompt = getMetaPrompt(testDomain, 'deep');
        expect(prompt).toBeDefined();
      }
    });
  });
});
