/**
 * Final Output Generation Module
 * 
 * This module provides the generation phase functionality that transforms synthesized briefs
 * into high-quality, domain-specific outputs. This is the culminating step of Clarifier's
 * two-phase conversation model.
 * 
 * @fileoverview Generation functionality with LLM integration, structured output parsing, and error handling
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getGenerationPrompt } from '@/lib/prompts';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Parameters for the generateOutput function
 */
export interface GenerationParams {
  domain: string;
  brief: string;
}

/**
 * Generation result with both raw and structured output
 */
export interface GenerationResult {
  rawOutput: string;
  structuredOutput: Record<string, unknown> | null;
  duration: number;
  wordCount: number;
  model: string;
}

/**
 * Logging interface for generation events
 */
export interface GenerationLog {
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
 * Custom error class for generation-related errors
 * Provides detailed error information for debugging and user feedback
 */
export class GenerationError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'GenerationError';
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
 * Primary model for generation (fast and cost-effective)
 */
const PRIMARY_MODEL = 'google/gemini-2.0-flash-exp:free';

/**
 * Fallback model for generation (high quality)
 */
const FALLBACK_MODEL = 'openai/gpt-4o';

/**
 * Temperature setting for generation (balanced creativity)
 */
const GENERATION_TEMPERATURE = 0.7;

/**
 * Maximum retries for API calls
 */
const MAX_RETRIES = 2;

/**
 * Base delay for exponential backoff (milliseconds)
 */
const BASE_RETRY_DELAY = 1000;

/**
 * Timeout for generation requests (milliseconds)
 */
const GENERATION_TIMEOUT = 20000; // 20 seconds for full generation

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Log generation events
 * @param log - Log entry
 */
function log(logEntry: GenerationLog): void {
  const { timestamp, level, domain, message, metadata } = logEntry;
  
  const logMessage = `[${timestamp}] [${level}] [Generation] [Domain: ${domain}] ${message}`;
  
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
// VALIDATION
// ============================================================================

/**
 * Validate generation parameters
 * @param params - Generation parameters
 * @throws ValidationError if validation fails
 */
function validateGenerationData(params: GenerationParams): void {
  // Validate domain
  if (!params.domain || typeof params.domain !== 'string') {
    throw new ValidationError('Domain is required and must be a string', 'domain');
  }

  if (params.domain.trim().length === 0) {
    throw new ValidationError('Domain cannot be empty', 'domain');
  }

  // Validate brief type first
  if (!params.brief) {
    throw new ValidationError('Brief is required and must be a string', 'brief');
  }
  
  if (typeof params.brief !== 'string') {
    throw new ValidationError(
      `Brief must be a string, received ${typeof params.brief}`,
      'brief'
    );
  }

  if (params.brief.trim().length === 0) {
    throw new ValidationError('Brief cannot be empty', 'brief');
  }

  // Check minimum brief length (should be at least 50 words)
  const wordCount = params.brief.trim().split(/\s+/).length;
  if (wordCount < 50) {
    throw new ValidationError(
      `Brief is too short (${wordCount} words). Expected at least 50 words for quality generation.`,
      'brief'
    );
  }
}

// ============================================================================
// LANGCHAIN CLIENT
// ============================================================================

/**
 * Create LangChain client configured for generation
 * @param model - Model identifier to use
 * @returns ChatOpenAI instance
 * @throws GenerationError if configuration is invalid
 */
function createGenerationClient(model: string): ChatOpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new GenerationError(
      'OpenRouter API key is not configured',
      'MISSING_API_KEY'
    );
  }

  return new ChatOpenAI({
    model,
    apiKey,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
    },
    temperature: GENERATION_TEMPERATURE,
    timeout: GENERATION_TIMEOUT,
    maxRetries: 0, // Disable LangChain retries to prevent token burning
  });
}

// ============================================================================
// OUTPUT PARSING
// ============================================================================

/**
 * Attempt to parse structured output from raw text
 * @param rawOutput - Raw output from LLM
 * @param domain - Domain for logging context
 * @returns Parsed JSON object or null if parsing fails
 */
function parseStructuredOutput(rawOutput: string, domain: string): Record<string, unknown> | null {
  try {
    // Try to extract JSON from markdown code blocks first
    const jsonBlockMatch = rawOutput.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      log({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        domain,
        message: 'Successfully parsed structured output from JSON code block',
      });
      return parsed as Record<string, unknown>;
    }

    // Try to parse the entire output as JSON
    const parsed = JSON.parse(rawOutput);
    log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      domain,
      message: 'Successfully parsed structured output as direct JSON',
    });
    return parsed as Record<string, unknown>;

  } catch (error) {
    log({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      domain,
      message: 'Failed to parse structured output, falling back to raw text',
      metadata: { 
        error: error instanceof Error ? error.message : 'Unknown error',
        outputLength: rawOutput.length,
      },
    });
    return null;
  }
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Check if an error is retryable
 * @param error - Error to check
 * @returns True if error should be retried
 */
function isRetryableError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  
  // Rate limit errors should NOT be retried to prevent token burning
  // Only stop on confirmed rate limit errors
  if (errorMessage.includes('429') || 
      (errorMessage.includes('rate limit') && errorMessage.includes('exceeded')) ||
      (errorMessage.includes('quota') && errorMessage.includes('exceeded'))) {
    return false;
  }
  
  // Only retry network/timeout issues
  return (
    errorMessage.includes('timeout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('enotfound') ||
    errorMessage.includes('503')
  );
}

/**
 * Invoke LLM with retry logic and fallback model
 * @param prompt - Generation prompt
 * @param domain - Domain for logging
 * @returns Promise resolving to LLM response and model used
 * @throws GenerationError if all retries and fallback fail
 */
async function invokeWithRetryAndFallback(prompt: string, domain: string): Promise<{ output: string; model: string }> {
  let lastError: Error | undefined;
  
  // Try primary model first
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  
  for (const model of models) {
    log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      domain,
      message: `Attempting generation with model: ${model}`,
    });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const client = createGenerationClient(model);
        
        const systemMessage = new SystemMessage(
          'You are an expert consultant who generates high-quality, structured outputs based on detailed briefs. ' +
          'Follow the instructions precisely and provide comprehensive, actionable results.'
        );
        const userMessage = new HumanMessage(prompt);
        
        const response = await client.invoke([systemMessage, userMessage]);
        const output = response.content as string;
        
        log({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          domain,
          message: `Generation successful with model ${model} on attempt ${attempt + 1}`,
          metadata: {
            outputLength: output.length,
            model,
            attempt: attempt + 1,
          },
        });
        
        return { output, model };

      } catch (error: unknown) {
        lastError = error as Error;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        log({
          timestamp: new Date().toISOString(),
          level: 'WARN',
          domain,
          message: `Generation attempt ${attempt + 1} failed with model ${model}: ${errorMessage}`,
          metadata: { 
            attempt: attempt + 1, 
            maxRetries: MAX_RETRIES,
            model,
            error: errorMessage,
          },
        });

        // Check if error is retryable
        if (!isRetryableError(lastError) || attempt === MAX_RETRIES - 1) {
          // If not retryable or last attempt, break to try next model
          break;
        }

        // Exponential backoff
        const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
        log({
          timestamp: new Date().toISOString(),
          level: 'DEBUG',
          domain,
          message: `Retrying after ${delay}ms delay`,
          metadata: { delay, attempt: attempt + 1 },
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All models and retries exhausted
  throw new GenerationError(
    `Failed to generate output after trying all models with ${MAX_RETRIES} attempts each`,
    'GENERATION_FAILED',
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
 * Generate domain-specific output from a synthesized brief
 * 
 * This function takes a domain and synthesized brief, then uses an LLM to generate
 * high-quality, structured outputs. It attempts to parse structured output (JSON) but
 * gracefully falls back to raw text if parsing fails.
 * 
 * @param params - Generation parameters including domain and brief
 * @returns Promise resolving to the generation result with both raw and structured output
 * @throws ValidationError if input validation fails
 * @throws GenerationError if generation fails
 * 
 * @example
 * ```typescript
 * const result = await generateOutput({
 *   domain: 'business',
 *   brief: 'User wants to build a SaaS product for small businesses...'
 * });
 * console.log(result.rawOutput); // Raw text output
 * console.log(result.structuredOutput); // Parsed JSON or null
 * ```
 */
export async function generateOutput(params: GenerationParams): Promise<GenerationResult> {
  const startTime = Date.now();

  try {
    // Step 1: Validate input (validate before logging to avoid errors with invalid types)
    validateGenerationData(params);

    log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      domain: params.domain,
      message: 'Starting generation',
      metadata: {
        briefLength: params.brief.length,
        briefWordCount: countWords(params.brief),
      },
    });

    // Step 2: Get generation prompt
    const prompt = getGenerationPrompt(params.domain, params.brief);

    log({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      domain: params.domain,
      message: 'Generation prompt created',
      metadata: {
        promptLength: prompt.length,
      },
    });

    // Step 3: Invoke LLM with retry and fallback logic
    const { output: rawOutput, model } = await invokeWithRetryAndFallback(prompt, params.domain);

    // Step 4: Parse structured output
    const structuredOutput = parseStructuredOutput(rawOutput, params.domain);

    // Step 5: Calculate metrics
    const duration = Date.now() - startTime;
    const wordCount = countWords(rawOutput);

    log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      domain: params.domain,
      message: 'Generation completed successfully',
      metadata: {
        duration,
        wordCount,
        outputLength: rawOutput.length,
        hasStructuredOutput: structuredOutput !== null,
        model,
      },
    });

    return {
      rawOutput,
      structuredOutput,
      duration,
      wordCount,
      model,
    };

  } catch (error: unknown) {
    const duration = Date.now() - startTime;

    log({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      domain: params.domain,
      message: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: {
        duration,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    // Re-throw the error for caller to handle
    throw error;
  }
}

/**
 * Get generation result with metadata (convenience function)
 * Alias for generateOutput with same functionality
 * 
 * @param params - Generation parameters
 * @returns Promise resolving to generation result
 */
export async function generateOutputWithMetadata(params: GenerationParams): Promise<GenerationResult> {
  return generateOutput(params);
}

