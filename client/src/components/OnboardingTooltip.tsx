import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, ArrowLeft, ArrowRight, Play, SkipForward } from "lucide-react";
import { useOnboarding, OnboardingStep } from "@/hooks/useOnboarding";

interface TooltipProps {
  step: OnboardingStep;
  position: { top: number; left: number };
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onClose: () => void;
}

function Tooltip({ step, position, currentStepIndex, totalSteps, onNext, onPrev, onSkip, onClose }: TooltipProps) {
  const getTooltipStyle = () => {
    const element = document.querySelector(step.targetSelector);
    if (!element) return {};

    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    const tooltipWidth = 320;
    const tooltipHeight = 200;
    const offset = 20;

    let top = rect.top + scrollTop;
    let left = rect.left + scrollLeft;

    switch (step.position) {
      case "top":
        top -= tooltipHeight + offset;
        left += rect.width / 2 - tooltipWidth / 2;
        break;
      case "bottom":
        top += rect.height + offset;
        left += rect.width / 2 - tooltipWidth / 2;
        break;
      case "left":
        top += rect.height / 2 - tooltipHeight / 2;
        left -= tooltipWidth + offset;
        break;
      case "right":
        top += rect.height / 2 - tooltipHeight / 2;
        left += rect.width + offset;
        break;
    }

    // Ensure tooltip stays within viewport
    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;
    if (top < 10) top = 10;
    if (top + tooltipHeight > window.innerHeight + scrollTop - 10) top = window.innerHeight + scrollTop - tooltipHeight - 10;

    return {
      position: "absolute" as const,
      top: `${top}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
      zIndex: 10000,
    };
  };

  return (
    <Card className="shadow-2xl border-2 border-primary" style={getTooltipStyle()}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            Step {currentStepIndex + 1} of {totalSteps}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardTitle className="text-lg">{step.title}</CardTitle>
        <CardDescription className="text-sm">{step.description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {currentStepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={onPrev}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            {step.skipable && (
              <Button variant="ghost" size="sm" onClick={onSkip}>
                <SkipForward className="h-4 w-4 mr-1" />
                Skip Tour
              </Button>
            )}
          </div>
          <Button
            onClick={() => {
              if (step.action) {
                step.action();
              }
              onNext();
            }}
            size="sm"
            className="ml-2"
          >
            {step.action ? (
              <>
                <Play className="h-4 w-4 mr-1" />
                {currentStepIndex === totalSteps - 1 ? "Finish" : "Try It"}
              </>
            ) : (
              <>
                {currentStepIndex === totalSteps - 1 ? "Finish" : "Next"}
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function OnboardingTooltip() {
  const {
    isActive,
    currentStep,
    totalSteps,
    getCurrentStep,
    nextStep,
    prevStep,
    skipOnboarding,
    completeOnboarding,
    updateTooltipPosition,
  } = useOnboarding();

  const [highlightedElement, setHighlightedElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const step = getCurrentStep();
    if (!step) return;

    const updatePosition = () => {
      const element = document.querySelector(step.targetSelector) as HTMLElement;
      if (element) {
        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        setTooltipPosition({
          top: rect.top + scrollTop,
          left: rect.left + scrollLeft,
        });

        // Highlight the target element
        setHighlightedElement(element);
        element.style.position = "relative";
        element.style.zIndex = "9999";
        element.style.boxShadow = "0 0 0 4px rgba(34, 197, 94, 0.5)";
        element.style.borderRadius = "8px";
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    // Wait for DOM to be ready
    setTimeout(updatePosition, 100);
    
    // Update position on resize
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
      
      // Remove highlight
      if (highlightedElement) {
        highlightedElement.style.position = "";
        highlightedElement.style.zIndex = "";
        highlightedElement.style.boxShadow = "";
        highlightedElement.style.borderRadius = "";
      }
    };
  }, [isActive, currentStep, getCurrentStep]);

  if (!isActive || !tooltipPosition) return null;

  const step = getCurrentStep();
  if (!step) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9998]"
        style={{ pointerEvents: "none" }}
      />
      
      {/* Tooltip */}
      <Tooltip
        step={step}
        position={tooltipPosition}
        currentStepIndex={currentStep}
        totalSteps={totalSteps}
        onNext={nextStep}
        onPrev={prevStep}
        onSkip={skipOnboarding}
        onClose={completeOnboarding}
      />
    </>
  );
}