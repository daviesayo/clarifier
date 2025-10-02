'use client';

import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Copy, ChevronDown, ChevronRight, RefreshCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Props for the GenerationOutput component
 */
export interface GenerationOutputProps {
  /** The domain for which the output was generated */
  domain: string;
  /** The synthesized brief from the questioning phase */
  brief: string;
  /** The generated output (structured JSON or raw text) */
  output: Record<string, unknown> | string;
  /** Whether the component is in a loading state */
  isLoading?: boolean;
  /** Callback when user wants to start a new session */
  onStartNewSession?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Internal state for the component
 */
interface ComponentState {
  isBriefExpanded: boolean;
  copyStates: Record<string, 'idle' | 'copying' | 'success' | 'error'>;
}

/**
 * GenerationOutput component displays generated ideas in a beautiful, readable format
 * with markdown rendering, copy functionality, and user actions.
 */
export default function GenerationOutput({
  domain,
  brief,
  output,
  isLoading = false,
  onStartNewSession,
  className
}: GenerationOutputProps) {
  const [state, setState] = useState<ComponentState>({
    isBriefExpanded: false,
    copyStates: {}
  });

  /**
   * Handle copying content to clipboard
   */
  const handleCopy = useCallback(async (content: string, sectionId: string) => {
    setState(prev => ({
      ...prev,
      copyStates: { ...prev.copyStates, [sectionId]: 'copying' }
    }));

    try {
      await navigator.clipboard.writeText(content);
      setState(prev => ({
        ...prev,
        copyStates: { ...prev.copyStates, [sectionId]: 'success' }
      }));
      
      // Reset to idle after 2 seconds
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          copyStates: { ...prev.copyStates, [sectionId]: 'idle' }
        }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setState(prev => ({
        ...prev,
        copyStates: { ...prev.copyStates, [sectionId]: 'error' }
      }));
      
      // Reset to idle after 3 seconds
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          copyStates: { ...prev.copyStates, [sectionId]: 'idle' }
        }));
      }, 3000);
    }
  }, []);

  /**
   * Toggle brief section visibility
   */
  const toggleBrief = useCallback(() => {
    setState(prev => ({
      ...prev,
      isBriefExpanded: !prev.isBriefExpanded
    }));
  }, []);

  /**
   * Parse structured output and render with hierarchy
   */
  const renderStructuredOutput = (structuredOutput: Record<string, unknown>) => {
    if (!structuredOutput || typeof structuredOutput !== 'object') {
      return null;
    }

    const sections = Object.entries(structuredOutput).map(([key, value]) => {
      const sectionId = `section-${key}`;
      const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      const copyState = state.copyStates[sectionId] || 'idle';

      return (
        <Card key={key} className="mb-4 print:shadow-none print:border print:border-gray-300 print:mb-6">
          <CardHeader className="pb-3 print:pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold capitalize print:text-base print:text-black">
                {key.replace(/_/g, ' ')}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(content, sectionId)}
                disabled={copyState === 'copying'}
                className="ml-2 print:hidden"
              >
                {copyState === 'copying' && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                {copyState === 'success' && <Check className="w-4 h-4 mr-2 text-green-600" />}
                {copyState === 'error' && <Copy className="w-4 h-4 mr-2 text-red-600" />}
                {copyState === 'idle' && <Copy className="w-4 h-4 mr-2" />}
                {copyState === 'success' ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="print:px-0">
            <div className="prose prose-sm max-w-none dark:prose-invert print:prose-gray print:text-black">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      );
    });

    return <div className="space-y-4">{sections}</div>;
  };

  /**
   * Render raw text output with markdown
   */
  const renderRawOutput = (rawOutput: string) => {
    const sectionId = 'raw-output';
    const copyState = state.copyStates[sectionId] || 'idle';

    return (
      <Card className="print:shadow-none print:border print:border-gray-300">
        <CardHeader className="pb-3 print:pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold print:text-base print:text-black">Generated Ideas</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(rawOutput, sectionId)}
              disabled={copyState === 'copying'}
              className="ml-2 print:hidden"
            >
              {copyState === 'copying' && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {copyState === 'success' && <Check className="w-4 h-4 mr-2 text-green-600" />}
              {copyState === 'error' && <Copy className="w-4 h-4 mr-2 text-red-600" />}
              {copyState === 'idle' && <Copy className="w-4 h-4 mr-2" />}
              {copyState === 'success' ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="print:px-0">
          <div className="prose prose-sm max-w-none dark:prose-invert print:prose-gray print:text-black">
            <ReactMarkdown>{rawOutput}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    );
  };

  /**
   * Skeleton loader component
   */
  const SkeletonLoader = () => (
    <div className="space-y-4 animate-pulse">
      <Card>
        <CardHeader>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  /**
   * Determine output type and render accordingly
   */
  const renderOutput = () => {
    if (!output) {
      return (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No output available
        </div>
      );
    }

    // Try to parse as structured output first
    if (typeof output === 'object' && output !== null) {
      return renderStructuredOutput(output);
    }

    // Fall back to raw text
    const rawText = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    return renderRawOutput(rawText);
  };

  return (
    <div className={cn("w-full max-w-4xl mx-auto p-6 space-y-6 print:p-4", className)}>
      {/* Header */}
      <div className="text-center space-y-2 print:mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white print:text-2xl print:text-black">
          {domain.charAt(0).toUpperCase() + domain.slice(1)} Ideas Generated
        </h1>
        <p className="text-gray-600 dark:text-gray-400 print:text-gray-700">
          Your personalized ideas based on our conversation
        </p>
      </div>

      {/* Loading State */}
      {isLoading && <SkeletonLoader />}

      {/* Output Content */}
      {!isLoading && (
        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 print:animate-none">
          {renderOutput()}
        </div>
      )}

      {/* Brief Section */}
      {!isLoading && brief && (
        <Card className="print:shadow-none print:border print:border-gray-300">
          <Collapsible open={state.isBriefExpanded} onOpenChange={(open) => setState(prev => ({ ...prev, isBriefExpanded: open }))}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between p-4 h-auto print:hidden"
                onClick={toggleBrief}
              >
                <span className="font-semibold">Synthesized Brief</span>
                {state.isBriefExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4 print:block print:px-0 print:pb-0">
              <div className="prose prose-sm max-w-none dark:prose-invert text-gray-700 dark:text-gray-300 print:text-black print:prose-gray">
                <ReactMarkdown>{brief}</ReactMarkdown>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Actions */}
      {!isLoading && (
        <div className="flex flex-col sm:flex-row gap-4 justify-center print:hidden">
          <Button
            variant="outline"
            onClick={() => {
              const allContent = typeof output === 'string' 
                ? output 
                : JSON.stringify(output, null, 2);
              handleCopy(allContent, 'all-content');
            }}
            className="flex items-center"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy All Content
          </Button>
          {onStartNewSession && (
            <Button
              onClick={onStartNewSession}
              className="flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Start New Session
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
