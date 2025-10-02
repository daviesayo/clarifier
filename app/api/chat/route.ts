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
 * Maximum conversation history length to maintain performance
 * Longer histories are truncated to the most recent messages
 */
const MAX_CONVERSATION_HISTORY_LENGTH = 20;

/**
 * POST /api/chat
 * 
 * Central orchestrator for Clarifier's two-phase conversation model.
 * Handles session creation, message persistence, rate limiting, and LLM orchestration.
 */
export async function POST(request: NextRequest): Promise<NextResponse<ChatResponse | ErrorResponse>> {
  const startTime = Date.now();
  
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
      console.error('Failed to retrieve conversation history:', historyError);
      return NextResponse.json(
        { 
          error: 'Unable to retrieve conversation history. Please try again.',
          code: 'HISTORY_RETRIEVAL_ERROR',
          details: 'Database query failed'
        },
        { status: 500 }
      );
    }

    // Log conversation history length for monitoring
    const historyLength = messagesData?.length || 0;
    console.log(`Conversation history retrieved: ${historyLength} messages for session ${currentSessionId}`);

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
        { 
          error: 'Session configuration error. Please start a new session.',
          code: 'DOMAIN_NOT_FOUND',
          details: 'Domain not found for session'
        },
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
        let conversationHistory: ConversationMessage[] = messagesData
          .slice(0, -1) // Exclude the current message we just saved
          .map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));

        // Handle empty conversation history (first message)
        const isFirstMessage = conversationHistory.length === 0;
        if (isFirstMessage) {
          console.log(`First message in session ${currentSessionId} for domain: ${currentDomain}`);
        }

        // Truncate conversation history if it exceeds maximum length
        if (conversationHistory.length > MAX_CONVERSATION_HISTORY_LENGTH) {
          const originalLength = conversationHistory.length;
          conversationHistory = conversationHistory.slice(-MAX_CONVERSATION_HISTORY_LENGTH);
          console.log(`Conversation history truncated from ${originalLength} to ${MAX_CONVERSATION_HISTORY_LENGTH} messages for session ${currentSessionId}`);
        }

        // Log conversation loop invocation
        const conversationStartTime = Date.now();
        console.log(`Calling continueConversation with ${conversationHistory.length} history messages`);

        // Get AI response using conversation loop
        responseMessage = await continueConversation({
          domain: currentDomain,
          conversationHistory,
          userMessage: message,
          intensity: intensity || 'deep',
        });

        // Log conversation loop performance
        const conversationDuration = Date.now() - conversationStartTime;
        console.log(`Conversation loop completed in ${conversationDuration}ms`);

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorCode = (error as { code?: string })?.code;
        
        console.error('Conversation loop error:', {
          error: errorMessage,
          code: errorCode,
          sessionId: currentSessionId,
          domain: currentDomain,
          historyLength: messagesData?.length || 0
        });
        
        // Handle specific conversation errors
        if (error instanceof ConversationValidationError) {
          return NextResponse.json(
            { 
              error: 'Invalid conversation data. Please check your message and try again.',
              code: 'CONVERSATION_VALIDATION_ERROR',
              details: error.message
            },
            { status: 400 }
          );
        }

        // For other errors, provide helpful user-facing message
        return NextResponse.json(
          { 
            error: 'Unable to generate response. Please try again or start a new session.',
            code: 'CONVERSATION_ERROR',
            details: errorMessage
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

    // Log overall request performance
    const totalDuration = Date.now() - startTime;
    console.log(`Chat API request completed in ${totalDuration}ms for session ${currentSessionId}`);

    return NextResponse.json({
      sessionId: currentSessionId,
      responseMessage,
      isCompleted,
    });

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('Chat API error:', {
      error,
      duration: totalDuration,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { 
        error: 'An unexpected error occurred. Please try again.',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}
