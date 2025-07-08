import { useState, useRef, useEffect } from "react";
import { HelpCircle, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HelpStep {
  title: string;
  content: string;
  image?: string;
  tip?: string;
}

interface ContextualHelpBubbleProps {
  topic: string;
  title: string;
  steps: HelpStep[];
  triggerClassName?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function ContextualHelpBubble({ 
  topic, 
  title, 
  steps, 
  triggerClassName = "",
  position = 'right'
}: ContextualHelpBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (bubbleRef.current && !bubbleRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2'
  };

  return (
    <div className="relative inline-block" ref={bubbleRef}>
      {/* Help Trigger Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1 h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50 ${triggerClassName}`}
        title={`Get help with ${topic}`}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      {/* Help Bubble */}
      {isOpen && (
        <div className={`absolute z-50 ${positionClasses[position]}`}>
          <Card className="w-80 max-w-sm shadow-lg border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-blue-900">
                  {title}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              
              {/* Step Indicator */}
              {steps.length > 1 && (
                <div className="flex items-center gap-1 mt-2">
                  {steps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-1.5 w-6 rounded-full ${
                        index === currentStep ? 'bg-blue-500' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                  <span className="text-xs text-gray-500 ml-2">
                    {currentStep + 1} of {steps.length}
                  </span>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Current Step Content */}
              <div>
                <h4 className="font-medium text-gray-900 text-sm mb-2">
                  {steps[currentStep].title}
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {steps[currentStep].content}
                </p>
              </div>

              {/* Step Image */}
              {steps[currentStep].image && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <img
                    src={steps[currentStep].image}
                    alt={steps[currentStep].title}
                    className="w-full h-auto rounded border"
                  />
                </div>
              )}

              {/* Tip */}
              {steps[currentStep].tip && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800">
                    <span className="font-medium">💡 Tip:</span> {steps[currentStep].tip}
                  </p>
                </div>
              )}

              {/* Navigation */}
              {steps.length > 1 && (
                <div className="flex justify-between pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prevStep}
                    disabled={currentStep === 0}
                    className="text-xs h-7"
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextStep}
                    disabled={currentStep === steps.length - 1}
                    className="text-xs h-7"
                  >
                    Next
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Arrow pointer */}
          <div className={`absolute ${position === 'right' ? 'left-0 top-4 -ml-2' : 
                                     position === 'left' ? 'right-0 top-4 -mr-2' :
                                     position === 'bottom' ? 'top-0 left-4 -mt-2' :
                                     'bottom-0 left-4 -mb-2'}`}>
            <div className={`w-0 h-0 ${
              position === 'right' ? 'border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-white' :
              position === 'left' ? 'border-t-8 border-b-8 border-l-8 border-t-transparent border-b-transparent border-l-white' :
              position === 'bottom' ? 'border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white' :
              'border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white'
            }`}></div>
          </div>
        </div>
      )}
    </div>
  );
}