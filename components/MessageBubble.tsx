import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { MessageBubbleProps } from './ChatWindow';

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, className }) => {
  const [showTimestamp, setShowTimestamp] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const isUser = message.role === 'user';
  const isLongMessage = message.content.length > 200;
  const shouldTruncate = isLongMessage && !isExpanded;
  const displayContent = shouldTruncate 
    ? message.content.substring(0, 200) + '...' 
    : message.content;

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = date.toDateString() === new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString();
    
    if (isToday) {
      return `Today at ${formatTimestamp(date)}`;
    } else if (isYesterday) {
      return `Yesterday at ${formatTimestamp(date)}`;
    } else {
      return date.toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
  };

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
        className
      )}
      role="article"
      aria-label={`${message.role} message`}
    >
      <div
        className={cn(
          "relative max-w-[80%] lg:max-w-[70%] group",
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
        )}
        onMouseEnter={() => setShowTimestamp(true)}
        onMouseLeave={() => setShowTimestamp(false)}
      >
        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 shadow-sm",
            "transition-all duration-200 hover:shadow-md",
            isUser
              ? "bg-blue-500 text-white ml-12"
              : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white mr-12"
          )}
        >
          {/* Message content */}
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p className="whitespace-pre-wrap break-words m-0">
              {displayContent}
            </p>
          </div>

          {/* Expand/collapse button for long messages */}
          {isLongMessage && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "mt-2 text-xs font-medium underline hover:no-underline transition-all",
                isUser
                  ? "text-blue-100 hover:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              )}
              aria-label={isExpanded ? "Show less" : "Show more"}
            >
              {isExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        {/* Timestamp tooltip */}
        {showTimestamp && (
          <div
            className={cn(
              "absolute z-10 px-2 py-1 text-xs text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg",
              "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
              isUser ? "bottom-full right-0 mb-1" : "bottom-full left-0 mb-1"
            )}
            role="tooltip"
            aria-label={`Message sent at ${formatDate(message.timestamp)}`}
          >
            {formatDate(message.timestamp)}
            <div
              className={cn(
                "absolute w-2 h-2 bg-gray-900 dark:bg-gray-700 transform rotate-45",
                isUser ? "right-2 -bottom-1" : "left-2 -bottom-1"
              )}
            />
          </div>
        )}

        {/* Message role indicator for screen readers */}
        <div className="sr-only">
          {isUser ? "You said" : "Assistant said"}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
