import React, { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { IntensitySelector } from './IntensitySelector';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

// TypeScript interfaces for chat components
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  questionType?: 'basic' | 'deep' | undefined;
}

export interface ChatWindowProps {
  sessionId?: string;
  messages: ChatMessage[];
  isLoading?: boolean;
  isGenerating?: boolean;
  canGenerate?: boolean;
  questionCount?: number;
  intensity?: 'basic' | 'deep';
  onIntensityChange?: (intensity: 'basic' | 'deep') => void;
  onSendMessage: (message: string) => void;
  onGenerateIdeas: () => void;
  className?: string;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  questionType?: 'basic' | 'deep' | undefined;
  className?: string;
}

export interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

export interface TypingIndicatorProps {
  className?: string;
}

export interface GenerateIdeasButtonProps {
  onGenerate: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  questionCount?: number;
  minQuestions?: number;
  className?: string;
}

// Typing indicator component
export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ className }) => {
  return (
    <div className={cn("flex items-center space-x-1 px-4 py-2", className)}>
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-sm text-gray-500 ml-2">AI is thinking...</span>
    </div>
  );
};

// Generate Ideas button component
export const GenerateIdeasButton: React.FC<GenerateIdeasButtonProps> = ({
  onGenerate,
  disabled = false,
  isGenerating = false,
  questionCount = 0,
  minQuestions = 3,
  className
}) => {
  const isDisabled = disabled || questionCount < minQuestions;
  const remainingQuestions = Math.max(0, minQuestions - questionCount);

  return (
    <div className={cn("flex flex-col items-center space-y-2", className)}>
      <Button
        onClick={onGenerate}
        disabled={isDisabled}
        size="lg"
        className="w-full max-w-md"
        aria-label={isDisabled ? `Answer ${remainingQuestions} more question${remainingQuestions !== 1 ? 's' : ''} to generate ideas` : 'Generate ideas now'}
      >
        {isGenerating ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            Generating Ideas...
          </>
        ) : (
          'Generate Ideas Now'
        )}
      </Button>
      {isDisabled && questionCount < minQuestions && (
        <p className="text-sm text-gray-500 text-center">
          Answer {remainingQuestions} more question{remainingQuestions !== 1 ? 's' : ''} to generate ideas
        </p>
      )}
    </div>
  );
};

// Main ChatWindow component
export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  isLoading = false,
  isGenerating = false,
  canGenerate = false,
  questionCount = 0,
  intensity = 'deep',
  onIntensityChange,
  onSendMessage,
  onGenerateIdeas,
  className
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isAutoScrollEnabled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAutoScrollEnabled]);

  // Handle scroll events to detect if user has scrolled up
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAutoScrollEnabled(isAtBottom);
  };

  const handleSendMessage = (message: string) => {
    if (message.trim() && !isLoading && !isGenerating) {
      onSendMessage(message.trim());
    }
  };

  const handleGenerateIdeas = () => {
    if (canGenerate && !isGenerating) {
      onGenerateIdeas();
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-white dark:bg-gray-900", className)}>
      {/* Messages container */}
      <div 
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        onScroll={handleScroll}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Start a conversation
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
              Ask me anything about your idea, and I&apos;ll help you explore it through thoughtful questions.
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                questionType={message.questionType}
                className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
              />
            ))}
            {isLoading && <TypingIndicator />}
            {isGenerating && (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Generating your ideas...
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    This may take a few moments
                  </p>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        {/* Intensity Selector */}
        {onIntensityChange && (
          <div className="mb-4">
            <IntensitySelector
              intensity={intensity}
              onIntensityChange={onIntensityChange}
              disabled={isLoading || isGenerating}
            />
          </div>
        )}
        
        {canGenerate && !isGenerating && (
          <div className="mb-4">
            <GenerateIdeasButton
              onGenerate={handleGenerateIdeas}
              disabled={!canGenerate || isGenerating}
              isGenerating={isGenerating}
              questionCount={questionCount}
              minQuestions={3}
            />
          </div>
        )}
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isLoading || isGenerating}
          placeholder={isGenerating ? "Generating ideas..." : "Type your message..."}
          maxLength={10000}
        />
      </div>
    </div>
  );
};

export default ChatWindow;
