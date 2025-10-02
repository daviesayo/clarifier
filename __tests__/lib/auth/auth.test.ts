import { loginUser, signupUser, logoutUser, getErrorMessage } from '@/lib/auth/auth'
import type { LoginFormData, SignupFormData } from '@/lib/auth/schemas'

// Mock the Supabase client
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}))

import { createClient } from '@/lib/supabase/client'
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

describe('Authentication Functions', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = {
      auth: {
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
      },
      from: jest.fn(() => ({
        insert: jest.fn(),
      })),
    }
    mockCreateClient.mockReturnValue(mockSupabase)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('loginUser', () => {
    it('should successfully login with valid credentials', async () => {
      const mockUser = { id: '1', email: 'test@example.com' }
      const mockSession = { access_token: 'token' }
      
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      })

      const formData: LoginFormData = {
        email: 'test@example.com',
        password: 'password123',
      }

      const result = await loginUser(formData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        user: mockUser,
        session: mockSession,
      })
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })

    it('should handle invalid credentials', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      })

      const formData: LoginFormData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      }

      const result = await loginUser(formData)

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Invalid email or password. Please check your credentials and try again.')
    })

    it('should handle network errors with retry', async () => {
      mockSupabase.auth.signInWithPassword
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          data: { user: { id: '1' }, session: {} },
          error: null,
        })

      const formData: LoginFormData = {
        email: 'test@example.com',
        password: 'password123',
      }

      const result = await loginUser(formData)

      expect(result.success).toBe(true)
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(3)
    })
  })

  describe('signupUser', () => {
    it('should successfully signup with valid data', async () => {
      const mockUser = { id: '1', email: 'test@example.com' }
      const mockSession = { access_token: 'token' }
      
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      })

      mockSupabase.from().insert.mockResolvedValue({
        data: {},
        error: null,
      })

      const formData: SignupFormData = {
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      }

      const result = await signupUser(formData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        user: mockUser,
        session: mockSession,
      })
      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })

    it('should handle email already exists error', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      })

      const formData: SignupFormData = {
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      }

      const result = await signupUser(formData)

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('An account with this email already exists. Please sign in instead.')
    })

    it('should handle profile creation failure gracefully', async () => {
      const mockUser = { id: '1', email: 'test@example.com' }
      
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: {} },
        error: null,
      })

      mockSupabase.from().insert.mockResolvedValue({
        data: null,
        error: { message: 'Profile creation failed' },
      })

      const formData: SignupFormData = {
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      }

      const result = await signupUser(formData)

      // Should still succeed even if profile creation fails
      expect(result.success).toBe(true)
    })
  })

  describe('logoutUser', () => {
    it('should successfully logout', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null,
      })

      const result = await logoutUser()

      expect(result.success).toBe(true)
      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    })

    it('should handle logout errors', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({
        error: { message: 'Logout failed' },
      })

      const result = await logoutUser()

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Failed to logout. Please try again.')
    })
  })

  describe('getErrorMessage', () => {
    it('should return user-friendly error messages', () => {
      expect(getErrorMessage('Invalid login credentials')).toBe('Invalid email or password. Please check your credentials and try again.')
      expect(getErrorMessage('User already registered')).toBe('An account with this email already exists. Please sign in instead.')
      expect(getErrorMessage('Password should be at least 6 characters')).toBe('Password must be at least 6 characters long.')
      expect(getErrorMessage('Unable to validate email address: invalid format')).toBe('Please enter a valid email address.')
      expect(getErrorMessage('Unknown error')).toBe('An error occurred. Please try again.')
    })
  })
})
