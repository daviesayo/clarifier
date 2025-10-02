import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// TypeScript interfaces
export interface ChatRequest {
  sessionId?: string; // Undefined for new sessions
  message: string;
  domain?: string; // Required for first message only
  generateNow?: boolean; // Flag to skip questioning and generate
}

export interface ChatResponse {
  sessionId: string;
  responseMessage: string;
  isCompleted: boolean; // True when generation phase is done
  error?: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  details?: string;
}

// Validation schema
const ChatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(10000),
  domain: z.enum(['business', 'product', 'creative', 'research']).optional(),
  generateNow: z.boolean().optional(),
});

// Database types (imported for future use)
// type Session = Database['public']['Tables']['sessions']['Row'];
// type SessionInsert = Database['public']['Tables']['sessions']['Insert'];
// type MessageInsert = Database['public']['Tables']['messages']['Insert'];
// type Profile = Database['public']['Tables']['profiles']['Row'];

/**
 * POST /api/chat
 * 
 * Central orchestrator for Clarifier's two-phase conversation model.
 * Handles session creation, message persistence, rate limiting, and LLM orchestration.
 */
export async function POST(request: NextRequest): Promise<NextResponse<ChatResponse | ErrorResponse>> {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validationResult = ChatRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: validationResult.error.errors.map(e => e.message).join(', ')
        },
        { status: 400 }
      );
    }

    const { sessionId, message, domain, generateNow } = validationResult.data;

    // Initialize Supabase client
    const supabase = await createClient();

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user profile for rate limiting
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check rate limiting
    const maxSessions = profile.tier === 'free' ? 10 : 100; // Example limits
    if (profile.usage_count && profile.usage_count >= maxSessions) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    let currentSessionId: string;

    // Handle session management
    if (sessionId) {
      // Retrieve existing session
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (sessionError || !session) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }

      currentSessionId = session.id;
    } else {
      // Create new session
      if (!domain) {
        return NextResponse.json(
          { error: 'Domain is required for new sessions' },
          { status: 400 }
        );
      }

      const { data: newSession, error: createError } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          domain: domain,
        })
        .select()
        .single();

      if (createError || !newSession) {
        return NextResponse.json(
          { error: 'Failed to create session' },
          { status: 500 }
        );
      }

      currentSessionId = newSession.id;

      // Update usage count
      await supabase
        .from('profiles')
        .update({ usage_count: (profile.usage_count || 0) + 1 })
        .eq('id', user.id);
    }

    // Save user message to database
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        session_id: currentSessionId,
        role: 'user',
        content: message,
      });

    if (messageError) {
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      );
    }

    // TODO: Implement LLM orchestration in future phases
    // For now, return a placeholder response
    const responseMessage = generateNow 
      ? `Generation mode: Processing your request for ${domain} domain...`
      : `Questioning mode: I understand you're working on something related to ${domain}. Let me ask you some clarifying questions...`;

    return NextResponse.json({
      sessionId: currentSessionId,
      responseMessage,
      isCompleted: false, // Will be true when generation phase is complete
    });

  } catch (error) {
    console.error('Chat API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}
