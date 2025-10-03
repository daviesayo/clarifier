/**
 * LangChain Conversation Loop Module
 * 
 * This module provides the core conversation loop functionality for Clarifier's
 * two-phase model. It maintains context across multiple conversation turns,
 * formats messages for LangChain, and integrates with OpenRouter to generate
 * contextually relevant questions.
 * 
 * @fileoverview Core conversation loop with LangChain integration
 */

import { ChatOpenAI } from '@langchain/openai';
import { 
  HumanMessage, 
  AIMessage, 
  SystemMessage,
  BaseMessage 
} from '@langchain/core/messages';
import { getMetaPrompt } from '../prompts';

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
 * Parameters for the continueConversation function
 */
export interface ConversationParams {
  domain: string;
  conversationHistory: ConversationMessage[];
  userMessage: string;
  intensity?: 'basic' | 'deep';
}

/**
 * Options for configuring the LangChain client
 */
export interface LangChainClientOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

/**
 * Logging interface for conversation events
 */
export interface ConversationLog {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  domain: string;
  conversationId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Custom error class for conversation-related errors
 * Provides detailed error information for debugging and user feedback
 */
export class ConversationError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ConversationError';
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
 * Default configuration for the LangChain client
 */
const DEFAULT_CONFIG: Required<LangChainClientOptions> = {
  model: 'google/gemini-2.5-flash',
  temperature: 0.7,
  maxTokens: 500, // Reduced for faster responses
  timeout: 8000, // 8 seconds - faster timeout
};

/**
 * Maximum number of messages to keep in conversation history
 * Prevents memory issues and token limit problems
 */
const MAX_HISTORY_LENGTH = 10;

/**
 * Retry configuration for failed requests
 */
const RETRY_CONFIG = {
  maxRetries: 2, // Reasonable retry count for normal operation
  initialDelay: 1000, // 1 second
  maxDelay: 3000, // 3 seconds max delay
  backoffMultiplier: 2,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Simple logger for conversation events
 * In production, this should integrate with your logging infrastructure
 */
function log(logData: ConversationLog): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    ...logData,
    timestamp,
  };
  
  // For now, log to console. In production, send to logging service
  if (logData.level === 'ERROR') {
    console.error(JSON.stringify(logEntry));
  } else if (logData.level === 'WARN') {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

/**
 * Validates conversation parameters
 * @param params - The conversation parameters to validate
 * @throws {ValidationError} If validation fails
 */
function validateConversationData(params: ConversationParams): void {
  // Validate domain
  if (!params.domain || typeof params.domain !== 'string') {
    throw new ValidationError('Domain is required and must be a string', 'domain');
  }

  // Validate user message
  if (!params.userMessage || typeof params.userMessage !== 'string') {
    throw new ValidationError('User message is required and must be a string', 'userMessage');
  }

  if (params.userMessage.trim().length === 0) {
    throw new ValidationError('User message cannot be empty', 'userMessage');
  }

  if (params.userMessage.length > 5000) {
    throw new ValidationError('User message exceeds maximum length of 5000 characters', 'userMessage');
  }

  // Validate conversation history
  if (!Array.isArray(params.conversationHistory)) {
    throw new ValidationError('Conversation history must be an array', 'conversationHistory');
  }

  // Validate each message in history
  for (let i = 0; i < params.conversationHistory.length; i++) {
    const msg = params.conversationHistory[i];
    
    if (!msg.role || !msg.content) {
      throw new ValidationError(
        `Message at index ${i} must have 'role' and 'content' properties`,
        'conversationHistory'
      );
    }

    if (msg.role !== 'user' && msg.role !== 'assistant') {
      throw new ValidationError(
        `Message at index ${i} has invalid role: ${msg.role}. Must be 'user' or 'assistant'`,
        'conversationHistory'
      );
    }

    if (typeof msg.content !== 'string') {
      throw new ValidationError(
        `Message at index ${i} content must be a string`,
        'conversationHistory'
      );
    }
  }
}

/**
 * Trims conversation history to prevent token limit issues
 * Keeps the most recent messages up to MAX_HISTORY_LENGTH
 */
function trimConversationHistory(history: ConversationMessage[]): ConversationMessage[] {
  if (history.length <= MAX_HISTORY_LENGTH) {
    return history;
  }

  log({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    domain: 'system',
    message: `Trimming conversation history from ${history.length} to ${MAX_HISTORY_LENGTH} messages`,
  });

  return history.slice(-MAX_HISTORY_LENGTH);
}

/**
 * Sanitizes user input to prevent injection attacks
 * Removes potentially dangerous characters and patterns
 */
function sanitizeMessage(message: string): string {
  // Remove null bytes
  let sanitized = message.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Formats conversation history into LangChain message format
 * Converts simple message objects to LangChain BaseMessage instances
 */
function formatConversationHistory(
  history: ConversationMessage[]
): BaseMessage[] {
  return history.map((msg) => {
    const sanitizedContent = sanitizeMessage(msg.content);
    
    if (msg.role === 'user') {
      return new HumanMessage(sanitizedContent);
    } else {
      return new AIMessage(sanitizedContent);
    }
  });
}

/**
 * Creates and configures a LangChain ChatOpenAI client for OpenRouter
 * @param options - Optional configuration overrides
 * @returns Configured ChatOpenAI instance
 * @throws {ConversationError} If API key is missing or invalid
 */
function createLangChainClient(
  options: LangChainClientOptions = {}
): ChatOpenAI {
  // Validate API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ConversationError(
      'OPENROUTER_API_KEY environment variable is not set',
      'MISSING_API_KEY'
    );
  }

  // Merge with default configuration
  const config = { ...DEFAULT_CONFIG, ...options };

  // Create and return configured client
  return new ChatOpenAI({
    model: config.model,
    apiKey: apiKey,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
    },
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    timeout: config.timeout,
  });
}

/**
 * Processes LLM response and extracts content
 * @param response - The BaseMessage response from LangChain
 * @returns The string content of the response
 */
function handleLLMResponse(response: BaseMessage): string {
  if (!response.content) {
    throw new ConversationError(
      'LLM returned empty response',
      'EMPTY_RESPONSE'
    );
  }

  // Handle different content types
  if (typeof response.content === 'string') {
    const trimmed = response.content.trim();
    if (trimmed.length === 0) {
      throw new ConversationError(
        'LLM returned empty response',
        'EMPTY_RESPONSE'
      );
    }
    return trimmed;
  }

  // If content is an array (complex message), extract text
  if (Array.isArray(response.content)) {
    const textContent = response.content
      .filter((part: unknown) => typeof part === 'string' || (part as { type?: string })?.type === 'text')
      .map((part: unknown) => typeof part === 'string' ? part : (part as { text?: string })?.text)
      .join(' ');
    const trimmed = textContent.trim();
    if (trimmed.length === 0) {
      throw new ConversationError(
        'LLM returned empty response',
        'EMPTY_RESPONSE'
      );
    }
    return trimmed;
  }

  throw new ConversationError(
    'LLM response content format not supported',
    'INVALID_RESPONSE_FORMAT'
  );
}

/**
 * Invokes the LLM with retry logic and exponential backoff
 * @param client - The LangChain client
 * @param messages - The messages to send
 * @returns The LLM response
 */
async function invokeWithRetry(
  client: ChatOpenAI,
  messages: BaseMessage[]
): Promise<BaseMessage> {
  let lastError: Error | undefined;
  let delay = RETRY_CONFIG.initialDelay;

  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await client.invoke(messages);
      const duration = Date.now() - startTime;

      log({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        domain: 'llm',
        message: 'LLM invocation successful',
        metadata: {
          attempt: attempt + 1,
          duration,
          messageCount: messages.length,
        },
      });

      return response;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      log({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        domain: 'llm',
        message: `LLM invocation failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          attempt: attempt + 1,
        },
      });

      // Check if error is rate limiting - only stop on confirmed rate limits
      const errorStatus = (error as { status?: number })?.status;
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      
      // Only stop immediately on confirmed rate limit errors (429 status or explicit rate limit messages)
      if (errorStatus === 429 || 
          (errorMessage.includes('rate limit') && errorMessage.includes('exceeded')) ||
          (errorMessage.includes('quota') && errorMessage.includes('exceeded'))) {
        log({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          domain: 'llm',
          message: 'Confirmed rate limit hit, stopping retries to prevent token burning',
          metadata: {
            error: errorMessage,
            status: errorStatus,
            attempt: attempt + 1,
          },
        });
        throw new ConversationError(
          `Rate limit exceeded: ${errorMessage}`,
          'RATE_LIMIT_ERROR',
          lastError
        );
      }

      // Don't retry on validation or authentication errors
      if (errorStatus === 400 || errorStatus === 401 || errorStatus === 403) {
        throw new ConversationError(
          `LLM API error: ${errorMessage}`,
          errorStatus === 401 ? 'AUTH_ERROR' : 'API_ERROR',
          error instanceof Error ? error : new Error(errorMessage)
        );
      }

      // Wait before retrying
      if (attempt < RETRY_CONFIG.maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelay);
      }
    }
  }

  throw new ConversationError(
    `Failed to get LLM response after ${RETRY_CONFIG.maxRetries} attempts: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`,
    'MAX_RETRIES_EXCEEDED',
    lastError instanceof Error ? lastError : new Error('Unknown error')
  );
}

/**
 * Gets a fallback response when the LLM fails
 * Provides a graceful degradation experience
 */
function getFallbackResponse(domain: string): string {
  const fallbacks: Record<string, string> = {
    business: "I'm having trouble connecting to the AI service right now. Could you tell me more about the problem your business idea is trying to solve?",
    product: "I'm experiencing a technical issue at the moment. While we sort this out, could you describe what your feature aims to accomplish?",
    creative: "The AI service is temporarily unavailable. In the meantime, what's the core emotion or theme you want to explore in your story?",
    research: "I'm unable to connect to the AI service right now. Could you briefly describe your research question while we wait?",
    coding: "There's a temporary connection issue with the AI service. Could you outline the main technical problem you're trying to solve?",
  };

  return fallbacks[domain] || "I'm experiencing a technical issue. Please try again in a moment.";
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Continues a conversation with contextually relevant responses
 * 
 * This is the main function that orchestrates the conversation loop.
 * It validates input, formats messages, invokes the LLM, and handles errors.
 * 
 * @param params - Conversation parameters including domain, history, and user message
 * @returns Promise resolving to the AI-generated response
 * @throws {ValidationError} If input validation fails
 * @throws {ConversationError} If LLM invocation fails
 * 
 * @example
 * ```typescript
 * const response = await continueConversation({
 *   domain: 'business',
 *   conversationHistory: [
 *     { role: 'user', content: 'I want to start a business' },
 *     { role: 'assistant', content: 'What problem are you trying to solve?' }
 *   ],
 *   userMessage: 'I want to help people find eco-friendly products',
 *   intensity: 'deep'
 * });
 * ```
 */
export async function continueConversation(
  params: ConversationParams
): Promise<string> {
  const startTime = Date.now();

  try {
    // Step 1: Validate input
    log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      domain: params.domain,
      message: 'Starting conversation',
      metadata: {
        historyLength: params.conversationHistory.length,
        userMessageLength: params.userMessage.length,
      },
    });

    validateConversationData(params);

    // Step 2: Get domain meta-prompt
    const intensity = params.intensity || 'deep';
    const systemPrompt = getMetaPrompt(params.domain, intensity);

    // Step 3: Prepare messages
    const trimmedHistory = trimConversationHistory(params.conversationHistory);
    const historyMessages = formatConversationHistory(trimmedHistory);
    const sanitizedUserMessage = sanitizeMessage(params.userMessage);

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...historyMessages,
      new HumanMessage(sanitizedUserMessage),
    ];

    log({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      domain: params.domain,
      message: 'Messages prepared',
      metadata: {
        totalMessages: messages.length,
        systemPromptLength: systemPrompt.length,
      },
    });

    // Step 4: Create LangChain client
    const client = createLangChainClient();

    // Step 5: Invoke LLM with retry logic
    const response = await invokeWithRetry(client, messages);

    // Step 6: Process response
    const content = handleLLMResponse(response);

    const duration = Date.now() - startTime;
    log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      domain: params.domain,
      message: 'Conversation completed successfully',
      metadata: {
        duration,
        responseLength: content.length,
      },
    });

    return content;

  } catch (error: unknown) {
    const duration = Date.now() - startTime;

    log({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      domain: params.domain,
      message: 'Conversation failed',
      metadata: {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: (error as { code?: string })?.code,
      },
    });

    // Re-throw validation errors
    if (error instanceof ValidationError) {
      throw error;
    }

    // For conversation errors, provide fallback if possible
    if (error instanceof ConversationError) {
      // If it's a configuration or authentication error, re-throw
      if (error.code === 'MISSING_API_KEY' || error.code === 'AUTH_ERROR') {
        throw error;
      }

      // Otherwise, try to provide fallback
      return getFallbackResponse(params.domain);
    }

    // For unknown errors, wrap and throw
    throw new ConversationError(
      'An unexpected error occurred during conversation',
      'UNKNOWN_ERROR',
      error instanceof Error ? error : new Error('Unknown error')
    );
  }
}

