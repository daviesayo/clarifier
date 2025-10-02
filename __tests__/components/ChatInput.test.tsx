import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatInput } from '@/components/ChatInput';

// Mock the utils function
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
}));

describe('ChatInput', () => {
  const mockOnSendMessage = jest.fn();

  beforeEach(() => {
    mockOnSendMessage.mockClear();
  });

  it('renders input field with placeholder', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onSendMessage when form is submitted', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const input = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: /send message/i });
    
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('calls onSendMessage when Enter key is pressed', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const input = screen.getByRole('textbox');
    
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('does not send message when Shift+Enter is pressed', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const input = screen.getByRole('textbox');
    
    fireEvent.change(input, { target: { value: 'Test message\n' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: true });
    
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('clears input after sending message', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    expect(input.value).toBe('');
  });

  it('disables send button when input is empty', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when input has content', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const input = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: /send message/i });
    
    fireEvent.change(input, { target: { value: 'Test message' } });
    
    expect(sendButton).not.toBeDisabled();
  });

  it('respects disabled prop', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} disabled />);
    
    const input = screen.getByRole('textbox');
    const sendButton = screen.getByRole('button', { name: /send message/i });
    
    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });

  it('shows custom placeholder when provided', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} placeholder="Custom placeholder" />);
    
    expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
  });

  it('enforces character limit', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} maxLength={10} />);
    
    const input = screen.getByRole('textbox');
    
    fireEvent.change(input, { target: { value: 'This is a very long message that exceeds the limit' } });
    
    expect(input.value).toHaveLength(10);
  });

  it('shows character count when near limit', async () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} maxLength={100} />);
    
    const input = screen.getByRole('textbox');
    
    fireEvent.change(input, { target: { value: 'A'.repeat(95) } });
    
    await waitFor(() => {
      expect(screen.getByText(/95 \/ 100/)).toBeInTheDocument();
    });
  });

  it('shows error state when at character limit', async () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} maxLength={10} />);
    
    const input = screen.getByRole('textbox');
    
    fireEvent.change(input, { target: { value: 'A'.repeat(10) } });
    
    await waitFor(() => {
      expect(screen.getByText('Character limit reached')).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('auto-resizes textarea based on content', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    fireEvent.change(input, { target: { value: 'Line 1\nLine 2\nLine 3' } });
    
    // The textarea should have its height adjusted
    expect(input.style.height).not.toBe('auto');
  });

  it('handles composition events correctly', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const input = screen.getByRole('textbox');
    
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    // Should not send message during composition
    expect(mockOnSendMessage).not.toHaveBeenCalled();
    
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    // Should send message after composition ends
    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('shows help text', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    expect(screen.getByText(/Press Enter to send, Shift\+Enter for new line/)).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} className="custom-class" />);
    
    const form = screen.getByRole('form');
    expect(form).toHaveClass('custom-class');
  });

  it('has proper accessibility attributes', () => {
    render(<ChatInput onSendMessage={mockOnSendMessage} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-label', 'Message input');
  });
});
