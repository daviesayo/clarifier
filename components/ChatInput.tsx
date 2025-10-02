import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { ChatInputProps } from './ChatWindow';

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "Type your message...",
  maxLength = 10000,
  className
}) => {
  const [message, setMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 120; // Maximum height in pixels
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled && !isComposing) {
      onSendMessage(message);
      setMessage('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= maxLength) {
      setMessage(value);
    }
  };

  const isMessageEmpty = !message.trim();
  const isNearLimit = message.length > maxLength * 0.9;
  const isAtLimit = message.length >= maxLength;

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col space-y-2", className)}>
      {/* Character count indicator */}
      {isNearLimit && (
        <div className="flex justify-end">
          <span
            className={cn(
              "text-xs transition-colors",
              isAtLimit
                ? "text-red-500 font-medium"
                : "text-gray-500 dark:text-gray-400"
            )}
            role="status"
            aria-live="polite"
          >
            {message.length} / {maxLength.toLocaleString()}
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end space-x-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            rows={1}
            className={cn(
              "w-full min-h-[44px] max-h-[120px] px-4 py-3 pr-12",
              "border border-gray-300 dark:border-gray-600 rounded-2xl",
              "bg-white dark:bg-gray-800 text-gray-900 dark:text-white",
              "placeholder-gray-500 dark:placeholder-gray-400",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "resize-none overflow-hidden",
              "transition-all duration-200",
              isAtLimit && "border-red-300 dark:border-red-600"
            )}
            aria-label="Message input"
            aria-describedby={isNearLimit ? "character-count" : undefined}
            aria-invalid={isAtLimit}
          />
          
          {/* Send button inside textarea */}
          <Button
            type="submit"
            size="icon"
            disabled={isMessageEmpty || disabled || isComposing}
            className={cn(
              "absolute right-2 bottom-2 h-8 w-8 rounded-full",
              "transition-all duration-200",
              "hover:scale-105 active:scale-95",
              isMessageEmpty || disabled
                ? "opacity-50 cursor-not-allowed"
                : "opacity-100"
            )}
            aria-label="Send message"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </Button>
        </div>
      </div>

      {/* Help text */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-4">
          <span>Press Enter to send, Shift+Enter for new line</span>
        </div>
        {isAtLimit && (
          <span className="text-red-500 font-medium" id="character-count">
            Character limit reached
          </span>
        )}
      </div>
    </form>
  );
};

export default ChatInput;
