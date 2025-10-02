'use client'

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lightbulb } from "lucide-react";

interface TerminationSuggestionProps {
  onAccept: () => void;
  onContinue: () => void;
}

/**
 * Component that displays when AI suggests readiness to proceed to generation
 * Allows user to accept the suggestion or continue with more questions
 */
export default function TerminationSuggestion({
  onAccept,
  onContinue,
}: TerminationSuggestionProps) {
  return (
    <Card className="border-l-4 border-l-blue-500 bg-blue-50 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-300">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <Lightbulb className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Ready to Generate Ideas?
            </h3>
            <p className="text-blue-800 text-sm mb-4">
              Based on our conversation, I think we have enough context to generate great ideas. Would you like to proceed to the generation phase, or continue with more questions?
            </p>
            <div className="flex gap-3">
              <Button
                onClick={onAccept}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Yes, Generate Now
              </Button>
              <Button
                onClick={onContinue}
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
                size="sm"
              >
                Continue Asking Questions
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

