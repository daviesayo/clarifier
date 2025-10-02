import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageBubble } from '@/components/MessageBubble';
import { ChatMessage } from '@/components/ChatWindow';

// Mock the utils function
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
}));

describe('MessageBubble', () => {
  const mockMessage: ChatMessage = {
    id: '1',
    role: 'user',
    content: 'Hello, this is a test message',
    timestamp: new Date('2024-01-15T10:30:00Z'),
  };

  const mockAssistantMessage: ChatMessage = {
    id: '2',
    role: 'assistant',
    content: 'This is an assistant response',
    timestamp: new Date('2024-01-15T10:31:00Z'),
  };

  it('renders user message correctly', () => {
    render(<MessageBubble message={mockMessage} />);
    
    expect(screen.getByText('Hello, this is a test message')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'user message');
  });

  it('renders assistant message correctly', () => {
    render(<MessageBubble message={mockAssistantMessage} />);
    
    expect(screen.getByText('This is an assistant response')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'assistant message');
  });

  it('shows timestamp on hover', () => {
    render(<MessageBubble message={mockMessage} />);
    
    const messageContainer = screen.getByRole('article');
    fireEvent.mouseEnter(messageContainer);
    
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText(/Today at/)).toBeInTheDocument();
  });

  it('hides timestamp on mouse leave', () => {
    render(<MessageBubble message={mockMessage} />);
    
    const messageContainer = screen.getByRole('article');
    fireEvent.mouseEnter(messageContainer);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    
    fireEvent.mouseLeave(messageContainer);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('handles long messages with expand/collapse', () => {
    const longMessage: ChatMessage = {
      ...mockMessage,
      content: 'This is a very long message that should be truncated because it exceeds the character limit for display. '.repeat(10),
    };

    render(<MessageBubble message={longMessage} />);
    
    expect(screen.getByText(/Show more/)).toBeInTheDocument();
    expect(screen.getByText(/This is a very long message/)).toBeInTheDocument();
    expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
  });

  it('expands and collapses long messages', () => {
    const longMessage: ChatMessage = {
      ...mockMessage,
      content: 'This is a very long message that should be truncated because it exceeds the character limit for display. '.repeat(10),
    };

    render(<MessageBubble message={longMessage} />);
    
    const expandButton = screen.getByText(/Show more/);
    fireEvent.click(expandButton);
    
    expect(screen.getByText(/Show less/)).toBeInTheDocument();
    expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
  });

  it('applies correct styling for user messages', () => {
    render(<MessageBubble message={mockMessage} />);
    
    const messageContainer = screen.getByRole('article');
    expect(messageContainer).toHaveClass('justify-end');
  });

  it('applies correct styling for assistant messages', () => {
    render(<MessageBubble message={mockAssistantMessage} />);
    
    const messageContainer = screen.getByRole('article');
    expect(messageContainer).toHaveClass('justify-start');
  });

  it('includes screen reader text for accessibility', () => {
    render(<MessageBubble message={mockMessage} />);
    
    expect(screen.getByText('You said')).toBeInTheDocument();
  });

  it('includes screen reader text for assistant messages', () => {
    render(<MessageBubble message={mockAssistantMessage} />);
    
    expect(screen.getByText('Assistant said')).toBeInTheDocument();
  });

  it('formats timestamps correctly for today', () => {
    const todayMessage: ChatMessage = {
      ...mockMessage,
      timestamp: new Date(), // Today
    };

    render(<MessageBubble message={todayMessage} />);
    
    const messageContainer = screen.getByRole('article');
    fireEvent.mouseEnter(messageContainer);
    
    expect(screen.getByText(/Today at/)).toBeInTheDocument();
  });

  it('formats timestamps correctly for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const yesterdayMessage: ChatMessage = {
      ...mockMessage,
      timestamp: yesterday,
    };

    render(<MessageBubble message={yesterdayMessage} />);
    
    const messageContainer = screen.getByRole('article');
    fireEvent.mouseEnter(messageContainer);
    
    expect(screen.getByText(/Yesterday at/)).toBeInTheDocument();
  });

  it('handles custom className prop', () => {
    render(<MessageBubble message={mockMessage} className="custom-class" />);
    
    const messageContainer = screen.getByRole('article');
    expect(messageContainer).toHaveClass('custom-class');
  });
});
