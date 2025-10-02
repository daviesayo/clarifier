import { createClient } from '@/lib/supabase/client'
import type { LoginFormData, SignupFormData } from './schemas'
import type { User, Session } from '@supabase/supabase-js'

// Error logging utility
function logError(operation: string, error: unknown, context?: unknown) {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    operation,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error,
    context
  };
  
  console.error(`[AUTH ERROR] ${timestamp}`, errorInfo);
  
  // In production, you would send this to a logging service
  // Example: sendToLoggingService(errorInfo);
}

// Authentication error types
export interface AuthError {
  message: string
  code?: string
}

// Authentication result types
export interface AuthResult {
  success: boolean
  error?: AuthError
  data?: {
    user: User | null
    session: Session | null
  }
}

// Profile types
export interface Profile {
  id: string
  email: string | null
  usage_count: number | null
  tier: string | null
  created_at: string | null
}

// Authentication state types
export interface AuthState {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

// Retry utility function
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  
  throw lastError!;
}

// Login function
export async function loginUser(formData: LoginFormData): Promise<AuthResult> {
  try {
    const supabase = createClient()
    
    const result = await withRetry(async () => {
      const authResult = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });
      
      if (authResult.error) {
        throw new Error(authResult.error.message);
      }
      
      return authResult;
    });

    return {
      success: true,
      data: result.data,
    }
  } catch (error) {
    logError('loginUser', error, { email: formData.email });
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: {
        message: getErrorMessage(errorMessage),
        code: errorMessage,
      },
    }
  }
}

// Signup function
export async function signupUser(formData: SignupFormData): Promise<AuthResult> {
  try {
    const supabase = createClient()

    const result = await withRetry(async () => {
      const authResult = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });
      
      if (authResult.error) {
        throw new Error(authResult.error.message);
      }
      
      return authResult;
    });

    // Create profile record if signup was successful
    if (result.data.user) {
      try {
        const { error: profileError } = await withRetry(async () => {
          const profileResult = await supabase
            .from('profiles')
            .insert({
              id: result.data.user!.id,
              email: result.data.user!.email,
              usage_count: 0,
              tier: 'free',
            });
          
          if (profileResult.error) {
            throw new Error(profileResult.error.message);
          }
          
          return profileResult;
        });

        if (profileError) {
          console.error('Error creating profile:', profileError)
          console.error('Profile error details:', JSON.stringify(profileError, null, 2))
          // Don't fail the signup if profile creation fails
        } else {
          console.log('Profile created successfully for user:', result.data.user.id)
        }
      } catch (profileError) {
        console.error('Profile creation failed after retries:', profileError);
        // Don't fail the signup if profile creation fails
      }
    }

    return {
      success: true,
      data: result.data,
    }
  } catch (error) {
    logError('signupUser', error, { email: formData.email });
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: {
        message: getErrorMessage(errorMessage),
        code: errorMessage,
      },
    }
  }
}

// Logout function
export async function logoutUser(): Promise<AuthResult> {
  try {
    const supabase = createClient()
    
    const { error } = await supabase.auth.signOut()

    if (error) {
      return {
        success: false,
        error: {
          message: 'Failed to logout. Please try again.',
          code: error.message,
        },
      }
    }

    return {
      success: true,
    }
  } catch {
    return {
      success: false,
      error: {
        message: 'An unexpected error occurred. Please try again.',
      },
    }
  }
}

// Get current user
export async function getCurrentUser() {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      return null
    }
    
    return user
  } catch {
    return null
  }
}

// Helper function to convert Supabase error messages to user-friendly messages
export function getErrorMessage(errorMessage: string): string {
  const errorMap: Record<string, string> = {
    'Invalid login credentials': 'Invalid email or password. Please check your credentials and try again.',
    'Email not confirmed': 'Please check your email and click the confirmation link before signing in.',
    'User already registered': 'An account with this email already exists. Please sign in instead.',
    'Password should be at least 6 characters': 'Password must be at least 6 characters long.',
    'Unable to validate email address: invalid format': 'Please enter a valid email address.',
  }

  return errorMap[errorMessage] || 'An error occurred. Please try again.'
}
