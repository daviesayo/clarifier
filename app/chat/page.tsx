'use client';

import React, { useState, useEffect } from 'react';
import { ChatWindow } from '@/components/ChatWindow';
import { useChat, ChatApiError } from '@/lib/hooks/useChat';
import { Domain } from '@/lib/prompts';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, RefreshCw } from 'lucide-react';

export default function ChatPage() {
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [showDomainSelector, setShowDomainSelector] = useState(true);

  const {
    messages,
    sessionId,
    isLoading,
    isGenerating,
    canGenerate,
    questionCount,
    status,
    error,
    sendMessage,
    generateIdeas,
    clearMessages,
    retryLastMessage,
  } = useChat({
    domain: selectedDomain || undefined,
    onError: (error: ChatApiError) => {
      console.error('Chat error:', error);
    },
    onSessionComplete: (finalOutput) => {
      console.log('Session completed with output:', finalOutput);
    },
  });

  // Redirect to login if not authenticated (this would be handled by AuthGuard in a real app)
  useEffect(() => {
    // In a real app, you'd check authentication status here
    // For now, we'll just show the domain selector
  }, []);

  const handleDomainSelect = (domain: Domain) => {
    setSelectedDomain(domain);
    setShowDomainSelector(false);
  };

  const handleStartNewSession = () => {
    clearMessages();
    setShowDomainSelector(true);
    setSelectedDomain(null);
  };

  const handleRetry = () => {
    if (error) {
      retryLastMessage();
    }
  };

  if (showDomainSelector) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Start a Conversation
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Choose a domain to begin exploring your ideas
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['business', 'product', 'creative', 'research', 'coding'] as Domain[]).map((domain) => (
              <button
                key={domain}
                onClick={() => handleDomainSelect(domain)}
                className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-left group"
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-800 transition-colors">
                    <span className="text-blue-600 dark:text-blue-400 font-semibold text-lg">
                      {domain.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                    {domain}
                  </h3>
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {getDomainDescription(domain)}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="h-screen flex flex-col">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm">
                  {selectedDomain?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                  {selectedDomain} Chat
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {status === 'questioning' && `${questionCount} questions asked`}
                  {status === 'generating' && 'Generating ideas...'}
                  {status === 'completed' && 'Session completed'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartNewSession}
                className="text-gray-600 dark:text-gray-400"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                New Session
              </Button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="px-4 py-2">
            <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
              <X className="h-4 w-4 text-red-600 dark:text-red-400" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                <div className="flex items-center justify-between">
                  <span>{error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    className="ml-4 text-red-600 border-red-300 hover:bg-red-100 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
                  >
                    Retry
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Chat Window */}
        <div className="flex-1 overflow-hidden">
          <ChatWindow
            sessionId={sessionId || undefined}
            messages={messages}
            isLoading={isLoading}
            isGenerating={isGenerating}
            canGenerate={canGenerate}
            questionCount={questionCount}
            onSendMessage={sendMessage}
            onGenerateIdeas={generateIdeas}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}

function getDomainDescription(domain: Domain): string {
  const descriptions = {
    business: 'Explore business ideas, strategies, and startup concepts',
    product: 'Develop product features, specifications, and user experiences',
    creative: 'Craft stories, characters, and creative narratives',
    research: 'Design research projects, methodologies, and academic work',
    coding: 'Plan technical projects, architectures, and development strategies',
  };
  return descriptions[domain];
}
