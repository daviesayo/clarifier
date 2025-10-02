import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '@/components/ChatWindow';
import { sendMessage as apiSendMessage, generateIdeas as apiGenerateIdeas, createSession as apiCreateSession, ChatApiError } from '@/lib/api/chat';
import { ChatResponse } from '@/app/api/chat/route';

// Re-export ChatApiError for backward compatibility
export type { ChatApiError };

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
  intensity: 'basic' | 'deep';
  setIntensity: (intensity: 'basic' | 'deep') => void;
  sendMessage: (message: string) => Promise<void>;
  generateIdeas: () => Promise<void>;
  createSession: (domain: string, intensity?: 'basic' | 'deep') => Promise<void>;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { domain, onError, onSessionComplete } = options;
  
  // Initialize intensity from localStorage or default to 'deep'
  const [intensity, setIntensityState] = useState<'basic' | 'deep'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('clarifier-intensity');
      return (saved === 'basic' || saved === 'deep') ? saved : 'deep';
    }
    return 'deep';
  });
  
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

  // Function to update intensity and persist to localStorage
  const setIntensity = useCallback((newIntensity: 'basic' | 'deep') => {
    setIntensityState(newIntensity);
    if (typeof window !== 'undefined') {
      localStorage.setItem('clarifier-intensity', newIntensity);
    }
  }, []);

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
  ): Promise<ChatResponse> => {
    return apiSendMessage({
      ...(sessionId && { sessionId }),
      message,
      ...(sessionId ? {} : { domain }), // Only send domain for new sessions
      generateNow,
      intensity,
    });
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
      setError(error.message || 'Failed to send message');
      onError?.(error);
      
      // Remove the user message if it failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isGenerating, addMessage, callChatApi, onError, onSessionComplete]);

  const generateIdeas = useCallback(async () => {
    if (!canGenerate || isGenerating || isLoading || !sessionId) return;

    setError(null);
    setIsGenerating(true);

    try {
      const response = await apiGenerateIdeas(sessionId);
      
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
      setError(error.message || 'Failed to generate ideas');
      onError?.(error);
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, isGenerating, isLoading, sessionId, addMessage, onError, onSessionComplete]);

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

  const createSession = useCallback(async (domain: string, sessionIntensity?: 'basic' | 'deep') => {
    if (isLoading || isGenerating) return;

    setError(null);
    setIsLoading(true);

    try {
      const response = await apiCreateSession(domain, sessionIntensity || intensity);
      
      // Update session state
      setSessionId(response.sessionId);
      lastSessionIdRef.current = response.sessionId;
      setCanGenerate(response.canGenerate || false);
      setQuestionCount(response.questionCount || 0);
      setStatus(response.status);

      // Add assistant welcome message
      addMessage({
        role: 'assistant',
        content: response.responseMessage,
      });

    } catch (err) {
      const error = err as ChatApiError;
      setError(error.message || 'Failed to create session');
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isGenerating, intensity, addMessage, onError]);

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
    intensity,
    setIntensity,
    sendMessage,
    generateIdeas,
    createSession,
    clearMessages,
    retryLastMessage,
  };
}
