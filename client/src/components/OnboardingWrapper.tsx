import React from "react";
import { AnimatePresence } from "framer-motion";
import { AnimatedOnboardingTooltip } from "./AnimatedOnboardingTooltip";
import { useOnboarding } from "@/hooks/useOnboarding";

export function OnboardingWrapper() {
  const {
    currentStep,
    currentStepIndex,
    totalSteps,
    isActive,
    isPlaying,
    nextStep,
    prevStep,
    skipOnboarding,
    completeOnboarding,
    pauseResume,
  } = useOnboarding();

  if (!isActive) return null;

  return (
    <AnimatePresence>
      <AnimatedOnboardingTooltip
        step={currentStep}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        onNext={nextStep}
        onPrev={prevStep}
        onSkip={skipOnboarding}
        onClose={completeOnboarding}
        isPlaying={isPlaying}
        onPlayPause={pauseResume}
      />
    </AnimatePresence>
  );
}