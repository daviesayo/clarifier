import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rateLimit';
import { continueConversation, ConversationMessage, ValidationError as ConversationValidationError } from '@/lib/llm/conversationLoop';
import { synthesizeBrief, SynthesisError, ValidationError as SynthesisValidationError } from '@/lib/llm/synthesizeBrief';
import { generateOutput, GenerationError, ValidationError as GenerationValidationError } from '@/lib/llm/generateOutput';
import { sessionService } from '@/lib/database/sessions';
import { profileService } from '@/lib/database/profiles';

// Helper function to ensure user profile exists
async function ensureUserProfile(supabase: Awaited<ReturnType<typeof createClient>>, user: { id: string; email?: string }): Promise<void> {
  try {
    // Check if profile already exists
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    // If profile exists, we're done
    if (existingProfile && !fetchError) {
      return;
    }

    // If profile doesn't exist (PGRST116 error), create it
    if (fetchError && fetchError.code === 'PGRST116') {
      console.log('Creating profile for user:', user.id);
      
      const { error: createError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          usage_count: 0,
          tier: 'free'
        });

      if (createError) {
        console.error('Failed to create user profile:', createError);
        throw new Error(`Failed to create user profile: ${createError.message}`);
      }
      
      console.log('Profile created successfully for user:', user.id);
    } else if (fetchError) {
      // Some other error occurred
      console.error('Error checking user profile:', fetchError);
      throw new Error(`Failed to check user profile: ${fetchError.message}`);
    }
  } catch (error) {
    console.error('Error in ensureUserProfile:', error);
    throw error;
  }
}

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
  questionType?: 'basic' | 'deep'; // Question type for the assistant response
  brief?: string; // Synthesized brief (available during partial success)
  finalOutput?: {
    brief: string;
    generatedIdeas: Record<string, unknown>; // Structured output from generation
  } | undefined;
  partialSuccess?: boolean; // Indicates brief was synthesized but generation timed out
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
 * Maximum time allowed for generation operations (in milliseconds)
 * Vercel serverless functions have a 10s timeout on free tier
 */
const MAX_GENERATION_TIMEOUT = 25000; // 25 seconds - much longer for full generation

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
 * Wraps an async operation with a timeout
 * @param operation The async operation to execute
 * @param timeoutMs Timeout in milliseconds
 * @param operationName Name of the operation for logging
 * @returns Promise that rejects with timeout error if exceeded
 */
async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

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

    // Ensure user profile exists before checking rate limits
    await ensureUserProfile(supabase, user);

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
          intensity: intensity || 'deep', // Store the intensity preference
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
      .select('role, content, question_type')
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

      // Declare brief at broader scope for error handling
      let brief: string | undefined;

      try {
        // Step 1: Synthesize conversation into brief
        console.log(`Starting context synthesis for session ${currentSessionId}`);
        const synthesisStartTime = Date.now();

        // Prepare conversation history for synthesis
        const conversationHistory: ConversationMessage[] = messagesData.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

        // Add retry logic for synthesis
        let synthesisAttempts = 0;
        const maxSynthesisRetries = 2;

        while (synthesisAttempts <= maxSynthesisRetries) {
          try {
            brief = await withTimeout(
              () => synthesizeBrief({
                domain: currentDomain,
                conversationHistory,
              }),
              MAX_GENERATION_TIMEOUT / 3, // Use 1/3 timeout for synthesis (8+ seconds)
              'Synthesis'
            );
            break; // Success, exit retry loop
          } catch (error) {
            synthesisAttempts++;
            console.warn(`Synthesis attempt ${synthesisAttempts} failed:`, error);
            
            if (synthesisAttempts > maxSynthesisRetries) {
              throw error; // Re-throw if max retries exceeded
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * synthesisAttempts));
          }
        }

        const synthesisDuration = Date.now() - synthesisStartTime;
        console.log(`Context synthesis completed in ${synthesisDuration}ms for session ${currentSessionId} (${synthesisAttempts + 1} attempts)`);

        // Ensure brief was successfully generated
        if (!brief) {
          throw new Error('Failed to generate brief after all retry attempts');
        }

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
              details: 'Unable to update session with synthesized brief. Please try again.',
              message: 'Your conversation was processed but couldn\'t be saved. Please try generating again.'
            },
            { status: 500 }
          );
        }

        currentSessionStatus = 'generating';

        // Step 3: Generate final output
        console.log(`Starting output generation for session ${currentSessionId}`);
        const generationStartTime = Date.now();

        // Ensure brief is defined before generation
        if (!brief) {
          throw new Error('Brief is required for generation but was not provided');
        }

        // Add retry logic for generation (reduced to prevent token burning)
        let generationResult: { wordCount: number; model: string; rawOutput: string; structuredOutput: Record<string, unknown> | null } | undefined;
        let generationAttempts = 0;
        const maxGenerationRetries = 1; // Reduced from 2 to 1

        while (generationAttempts <= maxGenerationRetries) {
          try {
            console.log(`Generation attempt ${generationAttempts + 1} starting for session ${currentSessionId}`);
            generationResult = await withTimeout(
              () => generateOutput({
                domain: currentDomain,
                brief: brief!,
              }),
              MAX_GENERATION_TIMEOUT * 2 / 3, // Use 2/3 timeout for generation (16+ seconds)
              'Generation'
            );
            console.log(`Generation attempt ${generationAttempts + 1} succeeded for session ${currentSessionId}`);
            break; // Success, exit retry loop
          } catch (error) {
            generationAttempts++;
            const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
            
            // Check for rate limit errors - don't retry these
            if (errorMessage.includes('rate limit') || 
                errorMessage.includes('429') || 
                errorMessage.includes('quota') ||
                errorMessage.includes('limit exceeded')) {
              console.error(`Rate limit hit for session ${currentSessionId}, stopping retries to prevent token burning:`, error);
              throw error; // Stop immediately on rate limits
            }
            
            console.warn(`Generation attempt ${generationAttempts} failed for session ${currentSessionId}:`, error);
            
            if (generationAttempts > maxGenerationRetries) {
              console.error(`All generation attempts failed for session ${currentSessionId}`);
              throw error; // Re-throw if max retries exceeded
            }
            
            // Wait before retry (exponential backoff) - only for non-rate-limit errors
            const retryDelay = 1000 * generationAttempts;
            console.log(`Waiting ${retryDelay}ms before retry ${generationAttempts + 1} for session ${currentSessionId}`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }

        const generationDuration = Date.now() - generationStartTime;
        console.log(`Output generation completed in ${generationDuration}ms for session ${currentSessionId} (${generationAttempts + 1} attempts)`);
        
        if (!generationResult) {
          throw new Error('Generation failed - no result returned');
        }
        
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
              details: 'Unable to update session with generated output. Please try again.',
              message: 'Your ideas were generated but couldn\'t be saved. Please try generating again.'
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

        // Handle specific error types with user-friendly messages
        if (error instanceof SynthesisValidationError) {
          return NextResponse.json(
            { 
              error: 'Unable to process your conversation',
              code: 'SYNTHESIS_VALIDATION_ERROR',
              details: error.message,
              message: 'There was an issue with the conversation format. Please try again with a different message.'
            },
            { status: 400 }
          );
        }

        if (error instanceof SynthesisError) {
          return NextResponse.json(
            { 
              error: 'Failed to analyze your conversation',
              code: 'SYNTHESIS_ERROR',
              details: error.message,
              message: 'We couldn\'t process your conversation. Please try again or start a new session.'
            },
            { status: 500 }
          );
        }

        if (error instanceof GenerationValidationError) {
          return NextResponse.json(
            { 
              error: 'Invalid data for idea generation',
              code: 'GENERATION_VALIDATION_ERROR',
              details: error.message,
              message: 'There was an issue with the data format. Please try generating again.'
            },
            { status: 400 }
          );
        }

        if (error instanceof GenerationError) {
          return NextResponse.json(
            { 
              error: 'Failed to generate ideas',
              code: 'GENERATION_ERROR',
              details: error.message,
              message: 'We couldn\'t generate your ideas. Please try again or contact support if the issue persists.'
            },
            { status: 500 }
          );
        }

        // Handle timeout errors specifically
        if (error instanceof Error && error.message.includes('timed out')) {
          return NextResponse.json(
            { 
              error: 'Generation timed out',
              code: 'GENERATION_TIMEOUT',
              details: error.message,
              message: 'Generation is taking longer than expected. Please try again with a shorter conversation or contact support.'
            },
            { status: 408 }
          );
        }

        // Generic error with retry suggestion
        return NextResponse.json(
          { 
            error: 'Generation failed unexpectedly',
            code: 'GENERATION_UNKNOWN_ERROR',
            details: error instanceof Error ? error.message : 'Unknown error',
            message: 'Something went wrong during generation. Please try again in a moment.'
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

    // Save assistant response to database with question_type
    const { error: assistantMessageError } = await supabase
      .from('messages')
      .insert({
        session_id: currentSessionId,
        role: 'assistant',
        content: responseMessage,
        question_type: intensity || 'deep', // Store the intensity as question_type for assistant messages
      });

    if (assistantMessageError) {
      console.error('Failed to save assistant message:', assistantMessageError);
      // Don't fail the request, just log the error
    }

    // Note: Usage count is now incremented in the generation phase (after successful generation only)

    // Log overall request performance
    const totalDuration = Date.now() - startTime;
    console.log(`Chat API request completed in ${totalDuration}ms for session ${currentSessionId}`);

    // Prepare finalOutput for generation responses
    let finalOutput: { brief: string; generatedIdeas: Record<string, unknown> } | undefined;
    if (isCompleted && generateNow) {
      // Get the brief and generated ideas from the database
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('final_brief, final_output')
        .eq('id', currentSessionId)
        .single();
      
      if (sessionData?.final_brief && sessionData?.final_output) {
        finalOutput = {
          brief: sessionData.final_brief,
          generatedIdeas: sessionData.final_output
        };
      }
    }

    return NextResponse.json({
      sessionId: currentSessionId,
      responseMessage,
      isCompleted,
      status: currentSessionStatus,
      questionCount,
      canGenerate,
      suggestedTermination,
      questionType: intensity || 'deep', // Include question type in response
      finalOutput,
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
