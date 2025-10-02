'use client'

import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface GenerateIdeasButtonProps {
  canGenerate: boolean;
  questionCount: number;
  minQuestionsRequired: number;
  isGenerating: boolean;
  onGenerate: () => void;
}

/**
 * Button component for triggering the generation phase
 * Enforces minimum question threshold and provides visual feedback
 */
export default function GenerateIdeasButton({
  canGenerate,
  questionCount,
  minQuestionsRequired,
  isGenerating,
  onGenerate,
}: GenerateIdeasButtonProps) {
  const questionsRemaining = Math.max(0, minQuestionsRequired - questionCount);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        onClick={onGenerate}
        disabled={!canGenerate || isGenerating}
        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        size="lg"
      >
        <Sparkles className="mr-2 h-5 w-5" />
        {isGenerating ? 'Generating...' : 'Generate Ideas Now'}
      </Button>
      
      {!canGenerate && questionsRemaining > 0 && (
        <p className="text-sm text-gray-600">
          Answer {questionsRemaining} more question{questionsRemaining !== 1 ? 's' : ''} to unlock generation
        </p>
      )}
      
      {canGenerate && (
        <p className="text-sm text-green-600 font-medium">
          ✓ Ready to generate! ({questionCount} questions answered)
        </p>
      )}
    </div>
  );
}

