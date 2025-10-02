import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rateLimit';
import { continueConversation, ConversationMessage, ValidationError as ConversationValidationError } from '@/lib/llm/conversationLoop';
import { synthesizeBrief, SynthesisError, ValidationError as SynthesisValidationError } from '@/lib/llm/synthesizeBrief';
import { generateOutput, GenerationError, ValidationError as GenerationValidationError } from '@/lib/llm/generateOutput';
import { sessionService } from '@/lib/database/sessions';
import { profileService } from '@/lib/database/profiles';

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
  status: 'questioning' | 'generating' | 'completed'; // Current session status
  questionCount?: number; // Number of questions asked so far
  canGenerate?: boolean; // Whether user can trigger generation
  suggestedTermination?: boolean; // Whether AI suggests readiness to generate
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
 * Minimum number of questions required before allowing generation
 */
const MIN_QUESTIONS_THRESHOLD = 3;

/**
 * Keywords that indicate AI is suggesting readiness to proceed to generation
 */
const TERMINATION_KEYWORDS = [
  'shall we proceed',
  'ready to generate',
  'ready to create',
  'enough information',
  'sufficient context',
  'move forward',
  'move on to generating',
  'begin generating',
  'start generating',
];

/**
 * Detects if the AI response suggests termination (readiness to generate)
 * @param response The AI response text
 * @returns Object with suggestion flag and confidence score
 */
function detectTerminationSuggestion(response: string): { suggested: boolean; confidence: number } {
  const lowerResponse = response.toLowerCase();
  let matchCount = 0;
  
  for (const keyword of TERMINATION_KEYWORDS) {
    if (lowerResponse.includes(keyword)) {
      matchCount++;
    }
  }
  
  // Calculate confidence based on number of matches
  const confidence = Math.min(matchCount / 2, 1); // Max confidence at 2+ matches
  const suggested = confidence >= 0.5; // Threshold for flagging as suggestion
  
  return { suggested, confidence };
}

/**
 * Counts the number of questions asked by the assistant in the conversation
 * @param messages Array of messages
 * @returns Number of assistant messages that are questions
 */
function countQuestions(messages: { role: string; content: string }[]): number {
  return messages.filter(msg => 
    msg.role === 'assistant' && msg.content.includes('?')
  ).length;
}

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
    let currentSessionStatus: 'questioning' | 'generating' | 'completed' = 'questioning';

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
      currentSessionStatus = (session.status as 'questioning' | 'generating' | 'completed') || 'questioning';

      // Validate session status - cannot send messages to completed sessions
      if (currentSessionStatus === 'completed') {
        return NextResponse.json(
          { 
            error: 'Session is already completed',
            code: 'SESSION_COMPLETED',
            details: 'Cannot add messages to a completed session'
          },
          { status: 400 }
        );
      }
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
          status: 'questioning',
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
      currentSessionStatus = 'questioning';
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

    // Count questions asked so far for threshold check
    const questionCount = countQuestions(messagesData);
    const canGenerate = questionCount >= MIN_QUESTIONS_THRESHOLD;

    // Generate response using LangChain conversation loop
    let responseMessage: string;
    let isCompleted = false;
    let suggestedTermination = false;

    if (generateNow) {
      // Check minimum question threshold before allowing generation
      if (!canGenerate) {
        return NextResponse.json(
          { 
            error: 'Insufficient questions answered',
            code: 'MIN_QUESTIONS_NOT_MET',
            details: `At least ${MIN_QUESTIONS_THRESHOLD} questions must be answered before generating. Current count: ${questionCount}`,
            message: `Please answer at least ${MIN_QUESTIONS_THRESHOLD - questionCount} more question(s) before generating ideas.`
          },
          { status: 400 }
        );
      }

      try {
        // Step 1: Synthesize conversation into brief
        console.log(`Starting context synthesis for session ${currentSessionId}`);
        const synthesisStartTime = Date.now();

        // Prepare conversation history for synthesis
        const conversationHistory: ConversationMessage[] = messagesData.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

        const brief = await synthesizeBrief({
          domain: currentDomain,
          conversationHistory,
        });

        const synthesisDuration = Date.now() - synthesisStartTime;
        console.log(`Context synthesis completed in ${synthesisDuration}ms for session ${currentSessionId}`);

        // Step 2: Update session with brief and status
        const { error: updateError } = await supabase
          .from('sessions')
          .update({ 
            status: 'generating',
            final_brief: brief
          })
          .eq('id', currentSessionId);

        if (updateError) {
          console.error('Failed to update session with brief:', updateError);
          return NextResponse.json(
            { 
              error: 'Failed to save synthesis results',
              code: 'DATABASE_UPDATE_ERROR',
              details: 'Unable to update session with synthesized brief'
            },
            { status: 500 }
          );
        }

        currentSessionStatus = 'generating';

        // Step 3: Generate final output
        console.log(`Starting output generation for session ${currentSessionId}`);
        const generationStartTime = Date.now();

        const generationResult = await generateOutput({
          domain: currentDomain,
          brief,
        });

        const generationDuration = Date.now() - generationStartTime;
        console.log(`Output generation completed in ${generationDuration}ms for session ${currentSessionId}`);
        console.log(`Generation metrics: ${generationResult.wordCount} words, model: ${generationResult.model}`);

        // Step 4: Update session with final output and completed status
        // Cast to Json type for database storage
        const finalOutput = JSON.parse(
          JSON.stringify(generationResult.structuredOutput || { raw: generationResult.rawOutput })
        );
        
        const updateResult = await sessionService.updateSession(currentSessionId, {
          final_output: finalOutput,
          status: 'completed',
        });

        if (updateResult.error) {
          console.error('Failed to update session with output:', updateResult.error);
          return NextResponse.json(
            { 
              error: 'Failed to save generation results',
              code: 'DATABASE_UPDATE_ERROR',
              details: 'Unable to update session with generated output'
            },
            { status: 500 }
          );
        }

        currentSessionStatus = 'completed';

        // Step 5: Increment usage count on successful generation
        const usageResult = await profileService.incrementUsageCount(user.id);
        if (usageResult.error) {
          console.error('Failed to increment usage count:', usageResult.error);
          // Don't fail the request, just log the error
        }

        // Format response message
        responseMessage = `Generation complete! Here's your ${currentDomain} output:\n\n${generationResult.rawOutput}`;
        isCompleted = true;

      } catch (error: unknown) {
        console.error('Generation phase failed:', error);

        // Handle specific error types
        if (error instanceof SynthesisValidationError) {
          return NextResponse.json(
            { 
              error: 'Invalid conversation data for synthesis',
              code: 'SYNTHESIS_VALIDATION_ERROR',
              details: error.message
            },
            { status: 400 }
          );
        }

        if (error instanceof SynthesisError) {
          return NextResponse.json(
            { 
              error: 'Failed to synthesize conversation',
              code: 'SYNTHESIS_ERROR',
              details: error.message
            },
            { status: 500 }
          );
        }

        if (error instanceof GenerationValidationError) {
          return NextResponse.json(
            { 
              error: 'Invalid data for generation',
              code: 'GENERATION_VALIDATION_ERROR',
              details: error.message
            },
            { status: 400 }
          );
        }

        if (error instanceof GenerationError) {
          return NextResponse.json(
            { 
              error: 'Failed to generate output',
              code: 'GENERATION_ERROR',
              details: error.message
            },
            { status: 500 }
          );
        }

        // Generic error
        return NextResponse.json(
          { 
            error: 'An error occurred during generation phase',
            code: 'GENERATION_UNKNOWN_ERROR',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          { status: 500 }
        );
      }
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

        // Detect if AI suggests termination (readiness to generate)
        const terminationDetection = detectTerminationSuggestion(responseMessage);
        suggestedTermination = terminationDetection.suggested;
        
        if (suggestedTermination) {
          console.log(`AI suggested termination detected with confidence ${terminationDetection.confidence} for session ${currentSessionId}`);
        }

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

    // Note: Usage count is now incremented in the generation phase (after successful generation only)

    // Log overall request performance
    const totalDuration = Date.now() - startTime;
    console.log(`Chat API request completed in ${totalDuration}ms for session ${currentSessionId}`);

    return NextResponse.json({
      sessionId: currentSessionId,
      responseMessage,
      isCompleted,
      status: currentSessionStatus,
      questionCount,
      canGenerate,
      suggestedTermination,
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
