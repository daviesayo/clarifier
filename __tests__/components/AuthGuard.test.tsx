import { render, screen } from '@testing-library/react'
import AuthGuard from '@/components/AuthGuard'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}))

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const mockPush = jest.fn()
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>
mockUseRouter.mockReturnValue({
  push: mockPush,
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
})

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

describe('AuthGuard', () => {
  const mockChildren = <div>Protected Content</div>
  let mockSupabase: {
    auth: {
      getSession: jest.Mock
      onAuthStateChange: jest.Mock
    }
  }

  beforeEach(() => {
    mockSupabase = {
      auth: {
        getSession: jest.fn(),
        onAuthStateChange: jest.fn(),
      },
    }
    mockCreateClient.mockReturnValue(mockSupabase)
    jest.clearAllMocks()
  })

  it('should render children when user is authenticated', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: '1', email: 'test@example.com' } } },
      error: null,
    })

    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    })

    render(<AuthGuard>{mockChildren}</AuthGuard>)

    // Wait for the component to load
    await screen.findByText('Protected Content')
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('should show loading spinner when loading', () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    })

    render(<AuthGuard>{mockChildren}</AuthGuard>)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('should redirect when user is not authenticated', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    })

    render(<AuthGuard>{mockChildren}</AuthGuard>)

    // Wait for the redirect to happen
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Should redirect to login
    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('should render with custom fallback', () => {
    const customFallback = <div>Custom Loading Message</div>
    
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    })

    render(<AuthGuard fallback={customFallback}>{mockChildren}</AuthGuard>)

    expect(screen.getByText('Custom Loading Message')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })
})
