import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatPage from '@/app/chat/page';
import * as chatApi from '@/lib/api/chat';

// Mock the chat API
jest.mock('@/lib/api/chat');
const mockChatApi = chatApi as jest.Mocked<typeof chatApi>;

// Mock scrollIntoView for test environment
Element.prototype.scrollIntoView = jest.fn();

// Mock the useChat hook
jest.mock('@/lib/hooks/useChat', () => ({
  useChat: jest.fn(),
}));

const mockUseChat = require('@/lib/hooks/useChat').useChat as jest.Mock;

describe('Domain Selection Flow Integration', () => {
  const mockChatHook = {
    messages: [],
    sessionId: null,
    isLoading: false,
    isGenerating: false,
    canGenerate: false,
    questionCount: 0,
    status: 'questioning' as const,
    error: null,
    sendMessage: jest.fn(),
    generateIdeas: jest.fn(),
    createSession: jest.fn(),
    clearMessages: jest.fn(),
    retryLastMessage: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChat.mockReturnValue(mockChatHook);
  });

  it('should show domain selector initially', () => {
    render(<ChatPage />);

    expect(screen.getByText('Start a Conversation')).toBeInTheDocument();
    expect(screen.getByText('Choose a domain to begin exploring your ideas')).toBeInTheDocument();
    
    // Check all domain options are present
    expect(screen.getByText('business')).toBeInTheDocument();
    expect(screen.getByText('product')).toBeInTheDocument();
    expect(screen.getByText('creative')).toBeInTheDocument();
    expect(screen.getByText('research')).toBeInTheDocument();
    expect(screen.getByText('coding')).toBeInTheDocument();
  });

  it('should create session when domain is selected', async () => {
    const mockResponse = {
      sessionId: 'new-session-123',
      responseMessage: 'Welcome! Let\'s explore your business idea.',
      isCompleted: false,
      status: 'questioning' as const,
      questionCount: 0,
      canGenerate: false,
    };

    mockChatHook.createSession.mockResolvedValueOnce(mockResponse);

    render(<ChatPage />);

    // Click on business domain
    const businessCard = screen.getByText('business').closest('button');
    fireEvent.click(businessCard!);

    await waitFor(() => {
      expect(mockChatHook.createSession).toHaveBeenCalledWith('business');
    });
  });

  it('should show chat window after successful domain selection', async () => {
    const mockResponse = {
      sessionId: 'new-session-123',
      responseMessage: 'Welcome! Let\'s explore your business idea.',
      isCompleted: false,
      status: 'questioning' as const,
      questionCount: 0,
      canGenerate: false,
    };

    mockChatHook.createSession.mockResolvedValueOnce(mockResponse);

    render(<ChatPage />);

    // Click on business domain
    const businessCard = screen.getByText('business').closest('button');
    fireEvent.click(businessCard!);

    await waitFor(() => {
      expect(screen.queryByText('Start a Conversation')).not.toBeInTheDocument();
    });
  });

  it('should handle domain selection errors gracefully', async () => {
    mockChatHook.createSession.mockRejectedValueOnce(
      new Error('Failed to create session')
    );

    render(<ChatPage />);

    // Click on business domain
    const businessCard = screen.getByText('business').closest('button');
    fireEvent.click(businessCard!);

    await waitFor(() => {
      // Should still show domain selector after error
      expect(screen.getByText('Start a Conversation')).toBeInTheDocument();
    });
  });

  it('should show chat interface with proper header after domain selection', async () => {
    const mockResponse = {
      sessionId: 'new-session-123',
      responseMessage: 'Welcome! Let\'s explore your business idea.',
      isCompleted: false,
      status: 'questioning' as const,
      questionCount: 0,
      canGenerate: false,
    };

    mockChatHook.createSession.mockResolvedValueOnce(mockResponse);

    render(<ChatPage />);

    // Click on business domain
    const businessCard = screen.getByText('business').closest('button');
    fireEvent.click(businessCard!);

    await waitFor(() => {
      expect(screen.getByText('business Chat')).toBeInTheDocument();
      expect(screen.getByText('0 questions asked')).toBeInTheDocument();
    });
  });

  it('should allow starting new session from chat interface', async () => {
    const mockResponse = {
      sessionId: 'new-session-123',
      responseMessage: 'Welcome! Let\'s explore your business idea.',
      isCompleted: false,
      status: 'questioning' as const,
      questionCount: 0,
      canGenerate: false,
    };

    mockChatHook.createSession.mockResolvedValueOnce(mockResponse);

    render(<ChatPage />);

    // Click on business domain
    const businessCard = screen.getByText('business').closest('button');
    fireEvent.click(businessCard!);

    await waitFor(() => {
      expect(screen.getByText('business Chat')).toBeInTheDocument();
    });

    // Click new session button
    const newSessionButton = screen.getByText('New Session');
    fireEvent.click(newSessionButton);

    expect(mockChatHook.clearMessages).toHaveBeenCalled();
    expect(screen.getByText('Start a Conversation')).toBeInTheDocument();
  });

  it('should show error states with appropriate UI', async () => {
    mockChatHook.error = 'Rate limit exceeded. You have 2 sessions remaining. Please upgrade to Pro for unlimited sessions.';
    mockChatHook.createSession.mockResolvedValueOnce({
      sessionId: 'new-session-123',
      responseMessage: 'Welcome!',
      isCompleted: false,
      status: 'questioning' as const,
    });

    render(<ChatPage />);

    // Click on business domain
    const businessCard = screen.getByText('business').closest('button');
    fireEvent.click(businessCard!);

    await waitFor(() => {
      expect(screen.getByText('Rate Limit Exceeded')).toBeInTheDocument();
      expect(screen.getByText('Rate limit exceeded. You have 2 sessions remaining. Please upgrade to Pro for unlimited sessions.')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
    });
  });

    it('should show different error types with appropriate icons and messages', async () => {
      const errorCases = [
        {
          error: 'Network error - please check your connection and try again.',
          expectedTitle: 'Connection Error',
          expectedIcon: '📡',
        },
        {
          error: 'Server error - please try again in a moment.',
          expectedTitle: 'Server Error',
          expectedIcon: '🔧',
        },
        {
          error: 'Please log in to continue.',
          expectedTitle: 'Error',
          expectedIcon: '❌',
        },
      ];

    for (const errorCase of errorCases) {
      mockChatHook.error = errorCase.error;
      mockChatHook.createSession.mockResolvedValueOnce({
        sessionId: 'new-session-123',
        responseMessage: 'Welcome!',
        isCompleted: false,
        status: 'questioning' as const,
      });

      const { unmount } = render(<ChatPage />);

      // Click on business domain
      const businessCard = screen.getByText('business').closest('button');
      fireEvent.click(businessCard!);

      await waitFor(() => {
        expect(screen.getByText(errorCase.expectedTitle)).toBeInTheDocument();
        expect(screen.getByText(errorCase.error)).toBeInTheDocument();
      });

      unmount();
    }
  });

  it('should handle loading states during session creation', async () => {
    mockChatHook.isLoading = true;
    mockChatHook.createSession.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    render(<ChatPage />);

    // Click on business domain
    const businessCard = screen.getByText('business').closest('button');
    fireEvent.click(businessCard!);

    // Should show loading state
    expect(screen.getByText('business Chat')).toBeInTheDocument();
  });

  it('should show proper status messages in chat header', async () => {
    const statusCases = [
      {
        status: 'questioning' as const,
        questionCount: 3,
        expectedText: '3 questions asked',
      },
      {
        status: 'generating' as const,
        questionCount: 5,
        expectedText: 'Generating ideas...',
      },
      {
        status: 'completed' as const,
        questionCount: 5,
        expectedText: 'Session completed',
      },
    ];

    for (const statusCase of statusCases) {
      mockChatHook.status = statusCase.status;
      mockChatHook.questionCount = statusCase.questionCount;
      mockChatHook.createSession.mockResolvedValueOnce({
        sessionId: 'new-session-123',
        responseMessage: 'Welcome!',
        isCompleted: false,
        status: 'questioning' as const,
      });

      const { unmount } = render(<ChatPage />);

      // Click on business domain
      const businessCard = screen.getByText('business').closest('button');
      fireEvent.click(businessCard!);

      await waitFor(() => {
        expect(screen.getByText(statusCase.expectedText)).toBeInTheDocument();
      });

      unmount();
    }
  });
});
