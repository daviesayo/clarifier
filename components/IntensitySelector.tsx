import React from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { cn } from '@/lib/utils';
import { HelpCircle } from 'lucide-react';

export interface IntensitySelectorProps {
  intensity: 'basic' | 'deep';
  onIntensityChange: (intensity: 'basic' | 'deep') => void;
  className?: string;
  disabled?: boolean;
}

export const IntensitySelector: React.FC<IntensitySelectorProps> = ({
  intensity,
  onIntensityChange,
  className,
  disabled = false
}) => {
  const [showHelp, setShowHelp] = React.useState(false);

  const handleIntensityChange = (newIntensity: 'basic' | 'deep') => {
    if (!disabled && newIntensity !== intensity) {
      onIntensityChange(newIntensity);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <Card className="p-3 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Questioning Style:
            </span>
            <div className="flex rounded-lg bg-white dark:bg-gray-700 p-1 shadow-sm">
              <Button
                variant={intensity === 'basic' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleIntensityChange('basic')}
                disabled={disabled}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-all duration-200",
                  intensity === 'basic'
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                Basic
              </Button>
              <Button
                variant={intensity === 'deep' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleIntensityChange('deep')}
                disabled={disabled}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-all duration-200",
                  intensity === 'deep'
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                Deep
              </Button>
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Toggle help information"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Help tooltip */}
        {showHelp && (
          <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
            <div className="space-y-2">
              <div>
                <span className="font-medium text-blue-600 dark:text-blue-400">Basic:</span>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Gentle, single-focus questions without calculations or complex analysis
                </p>
              </div>
              <div>
                <span className="font-medium text-purple-600 dark:text-purple-400">Deep:</span>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Thorough exploration with detailed questions, analysis, and multi-step reasoning
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default IntensitySelector;
