import { ChatResponse, ErrorResponse } from '@/app/api/chat/route';

// Enhanced error types for better error handling
export interface ChatApiError extends Error {
  code?: string;
  details?: string;
  remaining?: number;
  limit?: number;
  tier?: string;
  status?: number;
  retryable?: boolean;
}

// Request parameters for sendMessage
export interface SendMessageParams {
  sessionId?: string;
  message: string;
  domain?: string;
  generateNow?: boolean;
  intensity?: 'basic' | 'deep';
}

// Retry configuration
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 4000,  // 4 seconds
  backoffMultiplier: 2,
};

/**
 * Determines if an error is retryable based on status code and error type
 */
function isRetryableError(error: ChatApiError): boolean {
  // Network errors (timeout, connection issues)
  if (!error.status) return true;
  
  // Server errors (5xx) are retryable
  if (error.status >= 500) return true;
  
  // Rate limit errors (429) are NOT retryable - they need user action
  if (error.status === 429) return false;
  
  // Client errors (4xx) are generally not retryable
  return false;
}

/**
 * Calculates retry delay with exponential backoff
 */
function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelay);
}

/**
 * Sleeps for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a ChatApiError from a fetch response
 */
async function createErrorFromResponse(response: Response): Promise<ChatApiError> {
  let errorData: ErrorResponse;
  
  try {
    errorData = await response.json();
  } catch {
    errorData = {
      error: 'Failed to parse error response',
      code: 'PARSE_ERROR',
    };
  }

  const error = new Error(errorData.message || errorData.error || 'API request failed') as ChatApiError;
  if (errorData.code) error.code = errorData.code;
  if (errorData.details) error.details = errorData.details;
  if (errorData.message) error.message = errorData.message;
  if (errorData.remaining !== undefined) error.remaining = errorData.remaining;
  if (errorData.limit !== undefined) error.limit = errorData.limit;
  if (errorData.tier) error.tier = errorData.tier;
  error.status = response.status;
  error.retryable = isRetryableError(error);
  
  return error;
}

/**
 * Makes a request to the chat API with retry logic
 */
async function makeRequestWithRetry(
  params: SendMessageParams,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<ChatResponse> {
  let lastError: ChatApiError | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: params.sessionId,
          message: params.message,
          domain: params.domain,
          generateNow: params.generateNow,
          intensity: params.intensity || 'deep',
        }),
      });

      if (!response.ok) {
        let error: ChatApiError;
        try {
          error = await createErrorFromResponse(response);
        } catch (parseError) {
          // Handle JSON parsing errors - these should not be retried
          if (parseError instanceof Error && parseError.message === 'Invalid JSON') {
            const chatError = new Error('Failed to parse error response') as ChatApiError;
            chatError.code = 'PARSE_ERROR';
            chatError.retryable = false;
            chatError.status = response.status;
            throw chatError;
          }
          throw parseError;
        }
        
        // If it's not retryable or we've exhausted retries, throw immediately
        if (!error.retryable || attempt === config.maxAttempts) {
          throw error;
        }
        
        lastError = error;
        
        // Wait before retrying
        const delay = calculateRetryDelay(attempt, config);
        console.warn(`Request failed (attempt ${attempt}/${config.maxAttempts}), retrying in ${delay}ms:`, error.message);
        await sleep(delay);
        continue;
      }

      const data: ChatResponse = await response.json();
      return data;

    } catch (error) {
      // Handle network errors (no response)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error('Network error - please check your connection') as ChatApiError;
        networkError.code = 'NETWORK_ERROR';
        networkError.retryable = true;
        networkError.status = 0;
        
        if (attempt === config.maxAttempts) {
          throw networkError;
        }
        
        lastError = networkError;
        const delay = calculateRetryDelay(attempt, config);
        console.warn(`Network error (attempt ${attempt}/${config.maxAttempts}), retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }


      // Re-throw non-retryable errors immediately
      if (error instanceof Error && 'retryable' in error && !(error as ChatApiError).retryable) {
        throw error;
      }

      // If we've exhausted retries, throw the last error
      if (attempt === config.maxAttempts) {
        throw lastError || error;
      }

      lastError = error as ChatApiError;
      const delay = calculateRetryDelay(attempt, config);
      console.warn(`Request failed (attempt ${attempt}/${config.maxAttempts}), retrying in ${delay}ms:`, error);
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError || new Error('Max retry attempts exceeded');
}

/**
 * Sends a message to the chat API with comprehensive error handling and retry logic
 * 
 * @param params - Message parameters
 * @returns Promise resolving to ChatResponse
 * @throws ChatApiError for various error conditions
 */
export async function sendMessage(params: SendMessageParams): Promise<ChatResponse> {
  // Validate required parameters
  if (!params.message?.trim()) {
    throw new Error('Message is required') as ChatApiError;
  }

  if (!params.sessionId && !params.domain) {
    throw new Error('Either sessionId or domain is required') as ChatApiError;
  }

  try {
    return await makeRequestWithRetry(params);
  } catch (error) {
    // Enhance error messages for better user experience
    const chatError = error as ChatApiError;
    
    // Add user-friendly messages based on error type
    switch (chatError.code) {
      case 'RATE_LIMIT_EXCEEDED':
        chatError.message = `Rate limit exceeded. ${chatError.remaining ? `You have ${chatError.remaining} sessions remaining.` : ''} Please upgrade to Pro for unlimited sessions.`;
        break;
      case 'NETWORK_ERROR':
        chatError.message = 'Network error - please check your connection and try again.';
        break;
      case 'VALIDATION_ERROR':
        chatError.message = 'Invalid request - please check your input and try again.';
        break;
      case 'AUTHENTICATION_REQUIRED':
        chatError.message = 'Please log in to continue.';
        break;
      case 'SESSION_NOT_FOUND':
        chatError.message = 'Session not found - please start a new conversation.';
        break;
      case 'GENERATION_TIMEOUT':
        chatError.message = 'Generation is taking longer than expected. Please try again with a shorter conversation.';
        break;
      case 'GENERATION_ERROR':
        chatError.message = 'Failed to generate ideas. Please try again or contact support if the issue persists.';
        break;
      default:
        if (chatError.status && chatError.status >= 500) {
          chatError.message = 'Server error - please try again in a moment.';
        } else if (chatError.status && chatError.status >= 400) {
          chatError.message = 'Request failed - please check your input and try again.';
        }
    }

    throw chatError;
  }
}

/**
 * Creates a new chat session with the specified domain
 * 
 * @param domain - The domain for the new session
 * @param intensity - The conversation intensity level
 * @returns Promise resolving to ChatResponse with new session
 */
export async function createSession(
  domain: string, 
  intensity: 'basic' | 'deep' = 'deep'
): Promise<ChatResponse> {
  return sendMessage({
    message: 'Hello, I\'d like to start a new conversation.',
    domain,
    intensity,
  });
}

/**
 * Generates ideas for the current session
 * 
 * @param sessionId - The current session ID
 * @returns Promise resolving to ChatResponse with generated ideas
 */
export async function generateIdeas(sessionId: string): Promise<ChatResponse> {
  return sendMessage({
    sessionId,
    message: 'Generate ideas now',
    generateNow: true,
  });
}
