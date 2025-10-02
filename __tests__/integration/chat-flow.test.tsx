import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useChat } from '@/lib/hooks/useChat';
import { ChatWindow } from '@/components/ChatWindow';

// Mock fetch
global.fetch = jest.fn();

// Mock the utils function
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
}));

// Test component that uses the useChat hook
function TestChatComponent() {
  const {
    messages,
    isLoading,
    isGenerating,
    canGenerate,
    questionCount,
    error,
    sendMessage,
    generateIdeas,
  } = useChat({
    domain: 'business',
    onError: (error) => console.error('Chat error:', error),
  });

  return (
    <div>
      <ChatWindow
        messages={messages}
        isLoading={isLoading}
        isGenerating={isGenerating}
        canGenerate={canGenerate}
        questionCount={questionCount}
        onSendMessage={sendMessage}
        onGenerateIdeas={generateIdeas}
      />
      {error && <div data-testid="error">{error}</div>}
    </div>
  );
}

describe('Chat Flow Integration', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('handles successful message sending', async () => {
    const mockResponse = {
      sessionId: 'test-session-123',
      responseMessage: 'Hello! How can I help you today?',
      isCompleted: false,
      status: 'questioning' as const,
      questionCount: 1,
      canGenerate: false,
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<TestChatComponent />);

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Start a conversation')).toBeInTheDocument();
    });

    // Send a message
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Wait for API call and response
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: undefined,
          message: 'Hello',
          domain: 'business',
          generateNow: false,
          intensity: 'deep',
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Hello! How can I help you today?')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    const mockError = {
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Upgrade to Pro for unlimited sessions',
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => mockError,
    });

    render(<TestChatComponent />);

    // Send a message
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Rate limit exceeded');
    });
  });

  it('handles generation flow', async () => {
    const mockResponse = {
      sessionId: 'test-session-123',
      responseMessage: 'Here are your generated ideas...',
      isCompleted: true,
      status: 'completed' as const,
      questionCount: 3,
      canGenerate: true,
      finalOutput: {
        brief: 'Test brief',
        generatedIdeas: { ideas: ['Idea 1', 'Idea 2'] },
      },
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<TestChatComponent />);

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Start a conversation')).toBeInTheDocument();
    });

    // Send a message to get to generation state
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Wait for response and generation button to appear
    await waitFor(() => {
      expect(screen.getByText('Generate Ideas Now')).toBeInTheDocument();
    });

    // Click generate button
    const generateButton = screen.getByText('Generate Ideas Now');
    fireEvent.click(generateButton);

    // Wait for generation API call
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: 'test-session-123',
          message: '',
          domain: undefined, // Should not send domain for existing session
          generateNow: true,
          intensity: 'deep',
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Here are your generated ideas...')).toBeInTheDocument();
    });
  });

  it('handles network errors', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<TestChatComponent />);

    // Send a message
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Failed to send message');
    });
  });

  it('maintains session state across multiple messages', async () => {
    const mockResponse1 = {
      sessionId: 'test-session-123',
      responseMessage: 'First response',
      isCompleted: false,
      status: 'questioning' as const,
      questionCount: 1,
      canGenerate: false,
    };

    const mockResponse2 = {
      sessionId: 'test-session-123',
      responseMessage: 'Second response',
      isCompleted: false,
      status: 'questioning' as const,
      questionCount: 2,
      canGenerate: false,
    };

    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse1,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse2,
      });

    render(<TestChatComponent />);

    // Send first message
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'First message' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('First response')).toBeInTheDocument();
    });

    // Send second message
    fireEvent.change(input, { target: { value: 'Second message' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Second response')).toBeInTheDocument();
    });

    // Verify both messages are displayed
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });

  it('handles loading states correctly', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    (fetch as jest.Mock).mockReturnValueOnce(promise);

    render(<TestChatComponent />);

    // Send a message
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('AI is thinking...')).toBeInTheDocument();
    });

    // Resolve the promise
    resolvePromise!({
      ok: true,
      json: async () => ({
        sessionId: 'test-session-123',
        responseMessage: 'Response',
        isCompleted: false,
        status: 'questioning' as const,
        questionCount: 1,
        canGenerate: false,
      }),
    });

    // Loading state should disappear
    await waitFor(() => {
      expect(screen.queryByText('AI is thinking...')).not.toBeInTheDocument();
    });
  });
});
