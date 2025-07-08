import React, { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  X, 
  ArrowLeft, 
  ArrowRight, 
  Play, 
  Pause,
  SkipForward, 
  MousePointer,
  Sparkles,
  Target,
  Zap
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  target: string;
  action?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  animation?: 'pulse' | 'bounce' | 'shake' | 'glow';
  interactive?: boolean;
  customIcon?: React.ReactNode;
}

interface AnimatedOnboardingTooltipProps {
  step: OnboardingStep;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onClose: () => void;
  isPlaying?: boolean;
  onPlayPause?: () => void;
}

const stepAnimations = {
  pulse: {
    scale: [1, 1.1, 1],
    transition: { duration: 1.5, repeat: Infinity }
  },
  bounce: {
    y: [0, -10, 0],
    transition: { duration: 1, repeat: Infinity }
  },
  shake: {
    x: [-2, 2, -2, 2, 0],
    transition: { duration: 0.5, repeat: Infinity, repeatDelay: 2 }
  },
  glow: {
    boxShadow: [
      "0 0 5px rgba(34, 197, 94, 0.5)",
      "0 0 20px rgba(34, 197, 94, 0.8)",
      "0 0 5px rgba(34, 197, 94, 0.5)"
    ],
    transition: { duration: 2, repeat: Infinity }
  }
};

export function AnimatedOnboardingTooltip({
  step,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  onClose,
  isPlaying = true,
  onPlayPause
}: AnimatedOnboardingTooltipProps) {
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [showPointer, setShowPointer] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Find and highlight target element
  useEffect(() => {
    const findTarget = () => {
      const element = document.querySelector(`[data-onboarding="${step.target}"]`) as HTMLElement;
      if (element) {
        setTargetElement(element);
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'center'
        });
        
        // Add highlight class
        element.classList.add('onboarding-highlight');
        
        // Show animated pointer
        setTimeout(() => setShowPointer(true), 500);
        
        return element;
      }
      return null;
    };

    const target = findTarget();
    
    return () => {
      if (target) {
        target.classList.remove('onboarding-highlight');
      }
      setShowPointer(false);
    };
  }, [step.target]);

  // Calculate tooltip position
  useEffect(() => {
    if (targetElement && tooltipRef.current) {
      const updatePosition = () => {
        const targetRect = targetElement.getBoundingClientRect();
        const tooltipRect = tooltipRef.current!.getBoundingClientRect();
        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight
        };

        let top = 0;
        let left = 0;

        // Calculate position based on preferred position
        switch (step.position) {
          case 'top':
            top = targetRect.top - tooltipRect.height - 20;
            left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
            break;
          case 'bottom':
            top = targetRect.bottom + 20;
            left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
            break;
          case 'left':
            top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
            left = targetRect.left - tooltipRect.width - 20;
            break;
          case 'right':
            top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
            left = targetRect.right + 20;
            break;
          default:
            // Center in viewport if no position specified
            top = (viewport.height - tooltipRect.height) / 2;
            left = (viewport.width - tooltipRect.width) / 2;
        }

        // Ensure tooltip stays within viewport
        if (left < 10) left = 10;
        if (left + tooltipRect.width > viewport.width - 10) {
          left = viewport.width - tooltipRect.width - 10;
        }
        if (top < 10) top = 10;
        if (top + tooltipRect.height > viewport.height - 10) {
          top = viewport.height - tooltipRect.height - 10;
        }

        setTooltipPosition({ top, left });
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition);
      };
    }
  }, [targetElement, step.position]);

  const progressPercentage = ((currentStepIndex + 1) / totalSteps) * 100;

  const getStepIcon = () => {
    if (step.customIcon) return step.customIcon;
    
    switch (step.action) {
      case 'click':
        return <MousePointer className="h-5 w-5" />;
      case 'focus':
        return <Target className="h-5 w-5" />;
      case 'navigate':
        return <ArrowRight className="h-5 w-5" />;
      default:
        return <Sparkles className="h-5 w-5" />;
    }
  };

  return (
    <>
      {/* Overlay */}
      <motion.div
        ref={overlayRef}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      />

      {/* Spotlight effect for target element */}
      {targetElement && (
        <motion.div
          className="fixed pointer-events-none z-[9999]"
          style={{
            top: targetElement.getBoundingClientRect().top - 8,
            left: targetElement.getBoundingClientRect().left - 8,
            width: targetElement.getBoundingClientRect().width + 16,
            height: targetElement.getBoundingClientRect().height + 16,
          }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ 
            scale: 1, 
            opacity: 1,
            boxShadow: "0 0 0 4px rgba(34, 197, 94, 0.3), 0 0 0 9999px rgba(0, 0, 0, 0.5)"
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      )}

      {/* Animated pointer */}
      <AnimatePresence>
        {showPointer && targetElement && (
          <motion.div
            className="fixed pointer-events-none z-[10001]"
            style={{
              top: targetElement.getBoundingClientRect().top - 30,
              left: targetElement.getBoundingClientRect().left - 15,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ 
              opacity: 1, 
              scale: 1,
              ...stepAnimations[step.animation || 'bounce']
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="bg-primary text-white p-2 rounded-full shadow-lg">
              <MousePointer className="h-4 w-4" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip */}
      <motion.div
        ref={tooltipRef}
        className="fixed z-[10000]"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        transition={{ 
          type: "spring",
          stiffness: 300,
          damping: 30
        }}
      >
        <Card className="w-96 max-w-[90vw] shadow-2xl border-2 border-primary/20 bg-white">
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <motion.div 
                  className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary"
                  whileHover={{ scale: 1.1, rotate: 10 }}
                  transition={{ type: "spring", stiffness: 400 }}
                >
                  {getStepIcon()}
                </motion.div>
                <div>
                  <h3 className="font-semibold text-lg">{step.title}</h3>
                  <Badge variant="secondary" className="text-xs">
                    Step {currentStepIndex + 1} of {totalSteps}
                  </Badge>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <X className="h-5 w-5" />
              </motion.button>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>Progress</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
              <Progress 
                value={progressPercentage} 
                className="h-2"
              />
            </div>

            {/* Content */}
            <div className="mb-6">
              <p className="text-gray-700 leading-relaxed">{step.description}</p>
              
              {step.action && (
                <motion.div
                  className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex items-center space-x-2 text-primary">
                    <Zap className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {step.action === 'click' && 'Click the highlighted element'}
                      {step.action === 'focus' && 'Focus on the highlighted area'}
                      {step.action === 'navigate' && 'Navigate to the next section'}
                    </span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {onPlayPause && (
                  <motion.button
                    onClick={onPlayPause}
                    className="flex items-center space-x-1 text-sm text-gray-600 hover:text-primary transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    <span>{isPlaying ? 'Pause' : 'Play'}</span>
                  </motion.button>
                )}
                
                <motion.button
                  onClick={onSkip}
                  className="flex items-center space-x-1 text-sm text-gray-600 hover:text-primary transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <SkipForward className="h-4 w-4" />
                  <span>Skip Tour</span>
                </motion.button>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPrev}
                  disabled={currentStepIndex === 0}
                  className="transition-all hover:scale-105"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    size="sm"
                    onClick={onNext}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {currentStepIndex === totalSteps - 1 ? 'Finish' : 'Next'}
                    {currentStepIndex !== totalSteps - 1 && <ArrowRight className="h-4 w-4 ml-1" />}
                  </Button>
                </motion.div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Custom CSS for highlighting */}
      <style jsx global>{`
        .onboarding-highlight {
          position: relative;
          z-index: 9999 !important;
          animation: onboarding-pulse 2s infinite;
        }
        
        @keyframes onboarding-pulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
      `}</style>
    </>
  );
}