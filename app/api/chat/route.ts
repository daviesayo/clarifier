import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, incrementUsage, getRateLimitHeaders } from '@/lib/rateLimit';
import { continueConversation, ConversationMessage, ValidationError as ConversationValidationError } from '@/lib/llm/conversationLoop';

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
  message?: string;
  remaining?: number;
  limit?: number;
  tier?: string;
}

// Validation schema
const ChatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(10000),
  domain: z.enum(['business', 'product', 'creative', 'research', 'coding']).optional(),
  generateNow: z.boolean().optional(),
  intensity: z.enum(['basic', 'deep']).optional(),
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

    const { sessionId, message, domain, generateNow, intensity } = validationResult.data;

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

    // Check rate limiting before creating new sessions
    if (!sessionId) {
      const rateLimitResult = await checkRateLimit(user.id);
      
      if (!rateLimitResult.allowed) {
        const headers = getRateLimitHeaders(rateLimitResult);
        
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            message: 'Upgrade to Pro for unlimited sessions',
            remaining: rateLimitResult.remaining,
            limit: rateLimitResult.limit,
            tier: rateLimitResult.tier,
            code: 'RATE_LIMIT_EXCEEDED'
          },
          {
            status: 429,
            headers
          }
        );
      }
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

    // Retrieve conversation history for this session
    const { data: messagesData, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', currentSessionId)
      .order('created_at', { ascending: true });

    if (historyError) {
      return NextResponse.json(
        { error: 'Failed to retrieve conversation history' },
        { status: 500 }
      );
    }

    // Get session domain if not provided (for continuing sessions)
    let currentDomain = domain;
    if (!currentDomain) {
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('domain')
        .eq('id', currentSessionId)
        .single();
      
      currentDomain = sessionData?.domain;
    }

    if (!currentDomain) {
      return NextResponse.json(
        { error: 'Domain not found for session' },
        { status: 400 }
      );
    }

    // Generate response using LangChain conversation loop
    let responseMessage: string;
    let isCompleted = false;

    if (generateNow) {
      // TODO: Implement generation phase in future
      responseMessage = `Generation mode: Processing your request for ${currentDomain} domain...`;
      isCompleted = true;
    } else {
      try {
        // Prepare conversation history (exclude the current user message)
        const conversationHistory: ConversationMessage[] = messagesData
          .slice(0, -1) // Exclude the current message we just saved
          .map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));

        // Get AI response using conversation loop
        responseMessage = await continueConversation({
          domain: currentDomain,
          conversationHistory,
          userMessage: message,
          intensity: intensity || 'deep',
        });
      } catch (error: any) {
        console.error('Conversation loop error:', error);
        
        // Handle specific conversation errors
        if (error instanceof ConversationValidationError) {
          return NextResponse.json(
            { 
              error: 'Invalid conversation data',
              code: 'CONVERSATION_VALIDATION_ERROR',
              details: error.message
            },
            { status: 400 }
          );
        }

        // For other errors, return generic error
        return NextResponse.json(
          { 
            error: 'Failed to generate response',
            code: 'CONVERSATION_ERROR',
            details: error.message || 'An error occurred while processing your message'
          },
          { status: 500 }
        );
      }
    }

    // Save assistant response to database
    const { error: assistantMessageError } = await supabase
      .from('messages')
      .insert({
        session_id: currentSessionId,
        role: 'assistant',
        content: responseMessage,
      });

    if (assistantMessageError) {
      console.error('Failed to save assistant message:', assistantMessageError);
      // Don't fail the request, just log the error
    }

    // Increment usage count when session completes
    if (isCompleted && !sessionId) {
      const { error: incrementError } = await incrementUsage(user.id);
      if (incrementError) {
        console.error('Failed to increment usage count:', incrementError);
        // Don't fail the request, just log the error
      }
    }

    return NextResponse.json({
      sessionId: currentSessionId,
      responseMessage,
      isCompleted,
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
