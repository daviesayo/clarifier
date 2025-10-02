'use client'

import { MessageSquare, Sparkles, CheckCircle2 } from "lucide-react";

interface SessionStatusBadgeProps {
  status: 'questioning' | 'generating' | 'completed';
  questionCount?: number;
}

/**
 * Badge component that displays the current session status/phase
 * Provides visual indication of questioning, generating, or completed state
 */
export default function SessionStatusBadge({ status, questionCount }: SessionStatusBadgeProps) {
  const statusConfig = {
    questioning: {
      icon: MessageSquare,
      label: 'Questioning Phase',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
      borderColor: 'border-blue-300',
    },
    generating: {
      icon: Sparkles,
      label: 'Generating Ideas',
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-800',
      borderColor: 'border-purple-300',
    },
    completed: {
      icon: CheckCircle2,
      label: 'Completed',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      borderColor: 'border-green-300',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${config.bgColor} ${config.textColor} ${config.borderColor}`}>
      <Icon className="h-4 w-4" />
      <span className="font-medium text-sm">{config.label}</span>
      {status === 'questioning' && questionCount !== undefined && (
        <span className="ml-1 text-xs opacity-75">
          ({questionCount} questions)
        </span>
      )}
    </div>
  );
}

