import { NextRequest } from 'next/server';
import { POST } from '@/app/api/chat/route';
import { createClient } from '@/lib/supabase/server';
import { profileService } from '@/lib/database/profiles';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

// Mock profile service
jest.mock('@/lib/database/profiles', () => ({
  profileService: {
    incrementUsageCount: jest.fn(),
  },
}));

// Mock conversation loop and generation functions
jest.mock('@/lib/llm/conversationLoop', () => ({
  continueConversation: jest.fn(),
}));

jest.mock('@/lib/llm/synthesizeBrief', () => ({
  synthesizeBrief: jest.fn(),
}));

jest.mock('@/lib/llm/generateOutput', () => ({
  generateOutput: jest.fn(),
}));

jest.mock('@/lib/database/sessions', () => ({
  sessionService: {
    updateSession: jest.fn(),
  },
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 5, limit: 10, tier: 'free' }),
  getRateLimitHeaders: jest.fn().mockReturnValue({}),
}));

describe('Usage Tracking Integration', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    (profileService.incrementUsageCount as jest.Mock).mockResolvedValue({ data: {}, error: null });
  });

  it('increments usage count when generation completes successfully', async () => {
    // Mock user authentication
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    });

    // Mock profile exists
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'test-user-id' },
            error: null,
          }),
        }),
      }),
    });

    // Mock session creation
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'test-session-id', user_id: 'test-user-id', domain: 'business', status: 'questioning' },
            error: null,
          }),
        }),
      }),
    });

    // Mock message insertion
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });

    // Mock conversation history retrieval
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [
              { role: 'user', content: 'Test message' },
              { role: 'assistant', content: 'Test response' },
            ],
            error: null,
          }),
        }),
      }),
    });

    // Mock session domain retrieval
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { domain: 'business' },
            error: null,
          }),
        }),
      }),
    });

    // Mock synthesis and generation
    const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');
    const { generateOutput } = require('@/lib/llm/generateOutput');
    const { sessionService } = require('@/lib/database/sessions');

    synthesizeBrief.mockResolvedValue('Test brief');
    generateOutput.mockResolvedValue({
      wordCount: 100,
      model: 'test-model',
      rawOutput: 'Test output',
      structuredOutput: { ideas: ['idea1', 'idea2'] },
    });
    sessionService.updateSession.mockResolvedValue({ data: {}, error: null });

    // Mock session update with brief
    mockSupabase.from.mockReturnValueOnce({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    // Mock final session update
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { final_brief: 'Test brief', final_output: { ideas: ['idea1', 'idea2'] } },
            error: null,
          }),
        }),
      }),
    });

    // Mock assistant message insertion
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Generate ideas now',
        domain: 'business',
        generateNow: true,
        intensity: 'deep',
      }),
    });

    const response = await POST(request);
    const responseData = await response.json();

    expect(response.status).toBe(200);
    expect(responseData.isCompleted).toBe(true);
    expect(profileService.incrementUsageCount).toHaveBeenCalledWith('test-user-id');
  });

  it('does not increment usage count when generation fails', async () => {
    // Mock user authentication
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    });

    // Mock profile exists
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'test-user-id' },
            error: null,
          }),
        }),
      }),
    });

    // Mock session creation
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'test-session-id', user_id: 'test-user-id', domain: 'business', status: 'questioning' },
            error: null,
          }),
        }),
      }),
    });

    // Mock message insertion
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });

    // Mock conversation history retrieval
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [
              { role: 'user', content: 'Test message' },
              { role: 'assistant', content: 'Test response' },
            ],
            error: null,
          }),
        }),
      }),
    });

    // Mock session domain retrieval
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { domain: 'business' },
            error: null,
          }),
        }),
      }),
    });

    // Mock synthesis failure
    const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');
    synthesizeBrief.mockRejectedValue(new Error('Synthesis failed'));

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Generate ideas now',
        domain: 'business',
        generateNow: true,
        intensity: 'deep',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(profileService.incrementUsageCount).not.toHaveBeenCalled();
  });

  it('handles usage count increment failure gracefully', async () => {
    // Mock user authentication
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    });

    // Mock profile exists
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'test-user-id' },
            error: null,
          }),
        }),
      }),
    });

    // Mock session creation
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'test-session-id', user_id: 'test-user-id', domain: 'business', status: 'questioning' },
            error: null,
          }),
        }),
      }),
    });

    // Mock message insertion
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });

    // Mock conversation history retrieval
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: [
              { role: 'user', content: 'Test message' },
              { role: 'assistant', content: 'Test response' },
            ],
            error: null,
          }),
        }),
      }),
    });

    // Mock session domain retrieval
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { domain: 'business' },
            error: null,
          }),
        }),
      }),
    });

    // Mock synthesis and generation
    const { synthesizeBrief } = require('@/lib/llm/synthesizeBrief');
    const { generateOutput } = require('@/lib/llm/generateOutput');
    const { sessionService } = require('@/lib/database/sessions');

    synthesizeBrief.mockResolvedValue('Test brief');
    generateOutput.mockResolvedValue({
      wordCount: 100,
      model: 'test-model',
      rawOutput: 'Test output',
      structuredOutput: { ideas: ['idea1', 'idea2'] },
    });
    sessionService.updateSession.mockResolvedValue({ data: {}, error: null });

    // Mock session update with brief
    mockSupabase.from.mockReturnValueOnce({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    // Mock final session update
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { final_brief: 'Test brief', final_output: { ideas: ['idea1', 'idea2'] } },
            error: null,
          }),
        }),
      }),
    });

    // Mock assistant message insertion
    mockSupabase.from.mockReturnValueOnce({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });

    // Mock usage count increment failure
    (profileService.incrementUsageCount as jest.Mock).mockResolvedValue({
      data: null,
      error: new Error('Database error'),
    });

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Generate ideas now',
        domain: 'business',
        generateNow: true,
        intensity: 'deep',
      }),
    });

    const response = await POST(request);
    const responseData = await response.json();

    // Should still succeed even if usage count increment fails
    expect(response.status).toBe(200);
    expect(responseData.isCompleted).toBe(true);
    expect(profileService.incrementUsageCount).toHaveBeenCalledWith('test-user-id');
  });
});
