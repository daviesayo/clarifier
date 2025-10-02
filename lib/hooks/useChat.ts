import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '@/components/ChatWindow';

// API response types matching the chat route
export interface ChatApiResponse {
  sessionId: string;
  responseMessage: string;
  isCompleted: boolean;
  status: 'questioning' | 'generating' | 'completed';
  questionCount?: number;
  canGenerate?: boolean;
  suggestedTermination?: boolean;
  finalOutput?: {
    brief: string;
    generatedIdeas: Record<string, unknown>;
  };
  error?: string;
}

export interface ChatApiError {
  error: string;
  code?: string;
  details?: string;
  message?: string;
  remaining?: number;
  limit?: number;
  tier?: string;
}

export interface UseChatOptions {
  domain?: string;
  intensity?: 'basic' | 'deep';
  onError?: (error: ChatApiError) => void;
  onSessionComplete?: (finalOutput: { brief: string; generatedIdeas: Record<string, unknown> }) => void;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  sessionId: string | null;
  isLoading: boolean;
  isGenerating: boolean;
  canGenerate: boolean;
  questionCount: number;
  status: 'questioning' | 'generating' | 'completed';
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  generateIdeas: () => Promise<void>;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { domain, intensity = 'deep', onError, onSessionComplete } = options;
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [canGenerate, setCanGenerate] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const [status, setStatus] = useState<'questioning' | 'generating' | 'completed'>('questioning');
  const [error, setError] = useState<string | null>(null);
  
  const lastMessageRef = useRef<string>('');
  const lastSessionIdRef = useRef<string | null>(null);

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const callChatApi = useCallback(async (
    message: string, 
    generateNow: boolean = false
  ): Promise<ChatApiResponse> => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: sessionId || undefined,
        message,
        domain: sessionId ? undefined : domain, // Only send domain for new sessions
        generateNow,
        intensity,
      }),
    });

    if (!response.ok) {
      const errorData: ChatApiError = await response.json();
      throw errorData;
    }

    return response.json();
  }, [sessionId, domain, intensity]);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading || isGenerating) return;

    setError(null);
    setIsLoading(true);
    lastMessageRef.current = message;

    try {
      // Add user message immediately
      addMessage({
        role: 'user',
        content: message,
      });

      const response = await callChatApi(message, false);
      
      // Update session state
      setSessionId(response.sessionId);
      lastSessionIdRef.current = response.sessionId;
      setCanGenerate(response.canGenerate || false);
      setQuestionCount(response.questionCount || 0);
      setStatus(response.status);

      // Add assistant response
      addMessage({
        role: 'assistant',
        content: response.responseMessage,
      });

      // Handle session completion
      if (response.isCompleted && response.finalOutput) {
        onSessionComplete?.(response.finalOutput);
      }

    } catch (err) {
      const error = err as ChatApiError;
      setError(error.message || error.error || 'Failed to send message');
      onError?.(error);
      
      // Remove the user message if it failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isGenerating, addMessage, callChatApi, onError, onSessionComplete]);

  const generateIdeas = useCallback(async () => {
    if (!canGenerate || isGenerating || isLoading) return;

    setError(null);
    setIsGenerating(true);

    try {
      const response = await callChatApi('', true); // Empty message for generation
      
      // Update session state
      setSessionId(response.sessionId);
      lastSessionIdRef.current = response.sessionId;
      setStatus(response.status);

      // Add generation response
      addMessage({
        role: 'assistant',
        content: response.responseMessage,
      });

      // Handle session completion
      if (response.isCompleted && response.finalOutput) {
        onSessionComplete?.(response.finalOutput);
      }

    } catch (err) {
      const error = err as ChatApiError;
      setError(error.message || error.error || 'Failed to generate ideas');
      onError?.(error);
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, isGenerating, isLoading, callChatApi, addMessage, onError, onSessionComplete]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setCanGenerate(false);
    setQuestionCount(0);
    setStatus('questioning');
    setError(null);
    lastMessageRef.current = '';
    lastSessionIdRef.current = null;
  }, []);

  const retryLastMessage = useCallback(async () => {
    if (!lastMessageRef.current) return;
    
    // Remove the last assistant message if it exists
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage?.role === 'assistant') {
        return prev.slice(0, -1);
      }
      return prev;
    });

    // Retry the last user message
    await sendMessage(lastMessageRef.current);
  }, [sendMessage]);

  return {
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
  };
}
