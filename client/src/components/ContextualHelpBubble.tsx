import { useState, useRef, useEffect } from "react";
import { HelpCircle, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type BubblePlacement,
  type ContextualHelpPosition,
  getContextualHelpOverridePlacement,
  resolveContextualHelpPlacement,
} from "@/lib/contextual-help-placement";

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
  position?: ContextualHelpPosition;
}

export function ContextualHelpBubble({ 
  topic, 
  title, 
  steps, 
  triggerClassName = "",
  position
}: ContextualHelpBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [autoPlacement, setAutoPlacement] = useState<BubblePlacement>('bottom-right');
  const [autoHorizontalOffset, setAutoHorizontalOffset] = useState(0);
  const [autoPointerOffset, setAutoPointerOffset] = useState(12);
  const [autoMaxHeight, setAutoMaxHeight] = useState<number | null>(null);
  const [autoGapOffset, setAutoGapOffset] = useState(8);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const bubbleContentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const updateAutoPlacement = () => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();

    if (!triggerRect) {
      return;
    }

    const measuredBubbleHeight = bubbleContentRef.current?.getBoundingClientRect().height;
    const layout = resolveContextualHelpPlacement({
      triggerRect,
      bubbleHeight: measuredBubbleHeight || 340,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    setAutoHorizontalOffset(layout.horizontalOffset);
    setAutoPointerOffset(layout.pointerOffset);
    setAutoMaxHeight(layout.maxHeight);
    setAutoGapOffset(layout.gapOffset);
    setAutoPlacement(layout.placement);
  };

  useEffect(() => {
    if (!isOpen || position) {
      return;
    }

    updateAutoPlacement();
    window.addEventListener('resize', updateAutoPlacement);
    window.addEventListener('scroll', updateAutoPlacement, true);

    return () => {
      window.removeEventListener('resize', updateAutoPlacement);
      window.removeEventListener('scroll', updateAutoPlacement, true);
    };
  }, [isOpen, position]);

  const handleTriggerClick = () => {
    if (!isOpen && !position) {
      updateAutoPlacement();
    }

    setIsOpen(!isOpen);
  };

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

  const placement = getContextualHelpOverridePlacement(position) ?? autoPlacement;

  const positionClasses: Record<BubblePlacement, string> = {
    'top-left': '',
    'top-right': '',
    'bottom-left': '',
    'bottom-right': '',
    left: 'right-full mr-2',
    right: 'left-full ml-2'
  };

  const overridePositionClasses: Record<BubblePlacement, string> = {
    'top-left': 'bottom-full left-0 mb-2',
    'top-right': 'bottom-full right-0 mb-2',
    'bottom-left': 'top-full left-0 mt-2',
    'bottom-right': 'top-full right-0 mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2'
  };

  const pointerPositionClasses: Record<BubblePlacement, string> = {
    'top-left': 'bottom-0 left-3 -mb-2',
    'top-right': 'bottom-0 right-3 -mb-2',
    'bottom-left': 'top-0 left-3 -mt-2',
    'bottom-right': 'top-0 right-3 -mt-2',
    left: 'right-0 top-4 -mr-2',
    right: 'left-0 top-4 -ml-2'
  };

  const pointerArrowClasses: Record<BubblePlacement, string> = {
    'top-left': 'border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white',
    'top-right': 'border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white',
    'bottom-left': 'border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white',
    'bottom-right': 'border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-white',
    left: 'border-t-8 border-b-8 border-l-8 border-t-transparent border-b-transparent border-l-white',
    right: 'border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-white'
  };

  const hasOverridePlacement = Boolean(position);
  const autoPlacementStyle = hasOverridePlacement ? undefined : {
    left: `${autoHorizontalOffset}px`,
    ...(placement.startsWith('top')
      ? { bottom: `calc(100% + ${autoGapOffset}px)` }
      : { top: `calc(100% + ${autoGapOffset}px)` })
  };
  const autoPointerStyle = hasOverridePlacement ? undefined : { left: `${autoPointerOffset}px`, right: 'auto' };
  const autoCardStyle = !hasOverridePlacement && autoMaxHeight
    ? { maxHeight: `${autoMaxHeight}px` }
    : undefined;
  const resolvedPositionClasses = hasOverridePlacement
    ? overridePositionClasses[placement]
    : positionClasses[placement];

  return (
    <div className="relative inline-block" ref={bubbleRef}>
      {/* Help Trigger Button */}
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        onClick={handleTriggerClick}
        className={`p-1 h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50 ${triggerClassName}`}
        title={`Get help with ${topic}`}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      {/* Help Bubble */}
      {isOpen && (
        <div ref={bubbleContentRef} className={`absolute z-50 ${resolvedPositionClasses}`} style={autoPlacementStyle}>
          <Card className="w-80 max-w-[calc(100vw-2rem)] overflow-y-auto shadow-lg border-blue-200" style={autoCardStyle}>
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
              {steps && steps.length > 1 && (
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
              {steps && steps[currentStep] && (
                <div>
                  <h4 className="font-medium text-gray-900 text-sm mb-2">
                    {steps[currentStep].title}
                  </h4>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {steps[currentStep].content}
                  </p>
                </div>
              )}

              {/* Step Image */}
              {steps && steps[currentStep] && steps[currentStep].image && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <img
                    src={steps[currentStep].image}
                    alt={steps[currentStep].title}
                    className="w-full h-auto rounded border"
                  />
                </div>
              )}

              {/* Tip */}
              {steps && steps[currentStep] && steps[currentStep].tip && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800">
                    <span className="font-medium">💡 Tip:</span> {steps[currentStep].tip}
                  </p>
                </div>
              )}

              {/* Navigation */}
              {steps && steps.length > 1 && (
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
                    disabled={!steps || currentStep === steps.length - 1}
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
          <div className={`absolute ${pointerPositionClasses[placement]}`} style={autoPointerStyle}>
            <div className={`w-0 h-0 ${pointerArrowClasses[placement]}`}></div>
          </div>
        </div>
      )}
    </div>
  );
}