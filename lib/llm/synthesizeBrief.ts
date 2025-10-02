/**
 * Context Synthesis Module
 * 
 * This module provides context synthesis functionality that converts Q&A conversations
 * into concise, structured briefs. These briefs serve as high-quality context for the
 * generation LLM, maximizing output relevance and quality.
 * 
 * @fileoverview Context synthesis with LLM integration
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Conversation message structure
 * Represents a single message in the conversation history
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Parameters for the synthesizeBrief function
 */
export interface SynthesisParams {
  domain: string;
  conversationHistory: ConversationMessage[];
}

/**
 * Synthesis result
 */
export interface SynthesisResult {
  brief: string;
  duration: number;
  wordCount: number;
}

/**
 * Logging interface for synthesis events
 */
export interface SynthesisLog {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  domain: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Custom error class for synthesis-related errors
 * Provides detailed error information for debugging and user feedback
 */
export class SynthesisError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SynthesisError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for validation errors
 * Thrown when input data fails validation
 */
export class ValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'ValidationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default model for synthesis (fast and high-quality)
 */
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

/**
 * Temperature setting for synthesis (prioritize accuracy over creativity)
 */
const SYNTHESIS_TEMPERATURE = 0.3;

/**
 * Timeout for synthesis requests (milliseconds)
 */
const SYNTHESIS_TIMEOUT = 6000; // 6 seconds to work within API timeout constraints

/**
 * Maximum retries for API calls
 */
const MAX_RETRIES = 3;

/**
 * Base delay for exponential backoff (milliseconds)
 */
const BASE_RETRY_DELAY = 1000;

/**
 * Maximum conversation history length for synthesis
 */
const MAX_HISTORY_LENGTH = 50;

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Log synthesis events
 * @param log - Log entry
 */
function log(logEntry: SynthesisLog): void {
  const { timestamp, level, domain, message, metadata } = logEntry;
  
  const logMessage = `[${timestamp}] [${level}] [Domain: ${domain}] ${message}`;
  
  switch (level) {
    case 'DEBUG':
      console.debug(logMessage, metadata || '');
      break;
    case 'INFO':
      console.info(logMessage, metadata || '');
      break;
    case 'WARN':
      console.warn(logMessage, metadata || '');
      break;
    case 'ERROR':
      console.error(logMessage, metadata || '');
      break;
  }
}

// ============================================================================
// SYNTHESIS PROMPT TEMPLATE
// ============================================================================

/**
 * Generate synthesis prompt for a given domain and conversation history
 * @param domain - The domain of the conversation
 * @param formattedHistory - Formatted conversation history
 * @returns Synthesis prompt
 */
function generateSynthesisPrompt(domain: string, formattedHistory: string): string {
  return `You are an expert at distilling conversations into structured briefs.

The following is a Q&A session where a user discussed their ${domain} idea. Synthesize this entire conversation into a comprehensive, well-structured brief (200-300 words) that captures:

1. Core goal/objective
2. Key context and constraints
3. Target audience or users
4. Important requirements or preferences
5. Success criteria

Format the brief with clear sections. Be specific and include all relevant details from the conversation.

CONVERSATION:
${formattedHistory}

BRIEF:`;
}

// ============================================================================
// CONVERSATION HISTORY FORMATTING
// ============================================================================

/**
 * Format conversation history into readable Q&A format
 * @param history - Array of conversation messages
 * @returns Formatted conversation string
 */
function formatConversationHistory(history: ConversationMessage[]): string {
  if (history.length === 0) {
    return '(No conversation history)';
  }

  // Truncate if necessary
  const truncatedHistory = history.length > MAX_HISTORY_LENGTH
    ? history.slice(-MAX_HISTORY_LENGTH)
    : history;

  return truncatedHistory
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    })
    .join('\n\n');
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate synthesis parameters
 * @param params - Synthesis parameters
 * @throws ValidationError if validation fails
 */
function validateSynthesisData(params: SynthesisParams): void {
  // Validate domain
  if (!params.domain || typeof params.domain !== 'string') {
    throw new ValidationError('Domain is required and must be a string', 'domain');
  }

  if (params.domain.trim().length === 0) {
    throw new ValidationError('Domain cannot be empty', 'domain');
  }

  // Validate conversation history
  if (!Array.isArray(params.conversationHistory)) {
    throw new ValidationError('Conversation history must be an array', 'conversationHistory');
  }

  // Allow empty conversations but validate structure if present
  if (params.conversationHistory.length > 0) {
    params.conversationHistory.forEach((msg, index) => {
      if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
        throw new ValidationError(
          `Message at index ${index} has invalid role: ${msg.role}`,
          'conversationHistory'
        );
      }

      if (!msg.content || typeof msg.content !== 'string') {
        throw new ValidationError(
          `Message at index ${index} has invalid content`,
          'conversationHistory'
        );
      }
    });
  }
}

// ============================================================================
// LANGCHAIN CLIENT
// ============================================================================

/**
 * Create LangChain client configured for synthesis
 * @returns ChatOpenAI instance
 * @throws SynthesisError if configuration is invalid
 */
function createSynthesisClient(): ChatOpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new SynthesisError(
      'OpenRouter API key is not configured',
      'MISSING_API_KEY'
    );
  }

  return new ChatOpenAI({
    model: DEFAULT_MODEL,
    apiKey,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
    },
    temperature: SYNTHESIS_TEMPERATURE,
    timeout: SYNTHESIS_TIMEOUT,
  });
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Invoke LLM with retry logic
 * @param client - LangChain client
 * @param prompt - Synthesis prompt
 * @returns Promise resolving to LLM response
 * @throws SynthesisError if all retries fail
 */
async function invokeWithRetry(client: ChatOpenAI, prompt: string): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const systemMessage = new SystemMessage('You are an expert at synthesizing conversations into structured briefs.');
      const userMessage = new HumanMessage(prompt);
      
      const response = await client.invoke([systemMessage, userMessage]);
      return response.content as string;
    } catch (error: unknown) {
      lastError = error as Error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      log({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        domain: 'synthesis',
        message: `Synthesis attempt ${attempt + 1} failed: ${errorMessage}`,
        metadata: { attempt: attempt + 1, maxRetries: MAX_RETRIES },
      });

      // Check if error is retryable
      const isRetryable = errorMessage.includes('timeout') ||
                         errorMessage.includes('network') ||
                         errorMessage.includes('429') ||
                         errorMessage.includes('503');

      if (!isRetryable || attempt === MAX_RETRIES - 1) {
        break;
      }

      // Exponential backoff
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new SynthesisError(
    `Failed to synthesize brief after ${MAX_RETRIES} attempts`,
    'SYNTHESIS_FAILED',
    lastError
  );
}

// ============================================================================
// WORD COUNT UTILITY
// ============================================================================

/**
 * Count words in a string
 * @param text - Text to count words in
 * @returns Word count
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Synthesize a conversation into a structured brief
 * 
 * This function takes a domain and conversation history, then uses an LLM to generate
 * a concise, structured brief (200-300 words) that captures the key points. The brief
 * serves as high-quality context for the generation LLM.
 * 
 * @param params - Synthesis parameters including domain and conversation history
 * @returns Promise resolving to the synthesized brief
 * @throws ValidationError if input validation fails
 * @throws SynthesisError if synthesis fails
 * 
 * @example
 * ```typescript
 * const brief = await synthesizeBrief({
 *   domain: 'business',
 *   conversationHistory: [
 *     { role: 'user', content: 'I want to start a business' },
 *     { role: 'assistant', content: 'What problem are you trying to solve?' },
 *     { role: 'user', content: 'I want to help people find eco-friendly products' }
 *   ]
 * });
 * ```
 */
export async function synthesizeBrief(params: SynthesisParams): Promise<string> {
  const startTime = Date.now();

  try {
    // Step 1: Validate input
    log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      domain: params.domain,
      message: 'Starting synthesis',
      metadata: {
        historyLength: params.conversationHistory.length,
      },
    });

    validateSynthesisData(params);

    // Step 2: Format conversation history
    const formattedHistory = formatConversationHistory(params.conversationHistory);

    log({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      domain: params.domain,
      message: 'Conversation history formatted',
      metadata: {
        formattedLength: formattedHistory.length,
      },
    });

    // Step 3: Generate synthesis prompt
    const prompt = generateSynthesisPrompt(params.domain, formattedHistory);

    // Step 4: Create LangChain client
    const client = createSynthesisClient();

    // Step 5: Invoke LLM with retry logic
    const brief = await invokeWithRetry(client, prompt);

    // Step 6: Log success
    const duration = Date.now() - startTime;
    const wordCount = countWords(brief);

    log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      domain: params.domain,
      message: 'Synthesis completed successfully',
      metadata: {
        duration,
        wordCount,
        briefLength: brief.length,
      },
    });

    return brief;

  } catch (error: unknown) {
    const duration = Date.now() - startTime;

    log({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      domain: params.domain,
      message: `Synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: {
        duration,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      },
    });

    // Re-throw the error for caller to handle
    throw error;
  }
}

/**
 * Get synthesis result with metadata
 * This is a convenience function that returns additional metadata about the synthesis
 * 
 * @param params - Synthesis parameters
 * @returns Promise resolving to synthesis result with metadata
 */
export async function synthesizeBriefWithMetadata(params: SynthesisParams): Promise<SynthesisResult> {
  const startTime = Date.now();
  const brief = await synthesizeBrief(params);
  const duration = Date.now() - startTime;
  const wordCount = countWords(brief);

  return {
    brief,
    duration,
    wordCount,
  };
}

