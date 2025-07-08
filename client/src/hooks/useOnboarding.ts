import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  target: string;
  action?: 'click' | 'focus' | 'navigate' | 'type';
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  animation?: 'pulse' | 'bounce' | 'shake' | 'glow' | 'highlight';
  interactive?: boolean;
  customIcon?: React.ReactNode;
  order: number;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to Quikpik Merchant!",
    description: "Let's get you started with adding your first product to your wholesale platform.",
    target: "dashboard-header",
    position: "center",
    animation: "glow",
    order: 1
  },
  {
    id: "add-product",
    title: "Add Your First Product",
    description: "Start by adding your wholesale products. Click this button to create your first product listing with pricing, stock levels, and descriptions.",
    target: "add-product-button", 
    position: "bottom",
    animation: "bounce",
    action: "click",
    interactive: true,
    order: 2
  },
  {
    id: "complete",
    title: "You're All Set!",
    description: "Great! You now know how to add products to your wholesale platform. You can explore other features like customer groups, campaigns, and analytics when you're ready.",
    target: "dashboard-header",
    position: "center",
    animation: "glow",
    order: 3
  }
];

export function useOnboarding() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  const updateOnboardingMutation = useMutation({
    mutationFn: async (data: { completed?: boolean; skipped?: boolean; step?: number }) => {
      return apiRequest("/api/user/onboarding", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  // Auto-start onboarding for first-time users
  useEffect(() => {
    if (user && user.isFirstLogin && !user.onboardingCompleted && !user.onboardingSkipped) {
      setIsActive(true);
    }
  }, [user]);

  const nextStep = () => {
    if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
      const newIndex = currentStepIndex + 1;
      const currentStep = ONBOARDING_STEPS[currentStepIndex];
      
      // Handle click actions for current step
      if (currentStep.action === 'click' && currentStep.interactive) {
        // For interactive steps, just proceed to next step
        // The user will manually interact with the highlighted element
      }
      
      // Standard step progression
      setCurrentStepIndex(newIndex);
      setCompletedSteps(prev => [...prev, currentStep.id]);
      
      // Update backend with current step
      updateOnboardingMutation.mutate({ step: newIndex });
    } else {
      completeOnboarding();
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      const newIndex = currentStepIndex - 1;
      setCurrentStepIndex(newIndex);
      
      // Update backend with current step
      updateOnboardingMutation.mutate({ step: newIndex });
    }
  };

  const skipOnboarding = () => {
    updateOnboardingMutation.mutate({ skipped: true });
    setIsActive(false);
  };

  const completeOnboarding = () => {
    updateOnboardingMutation.mutate({ completed: true });
    setIsActive(false);
  };

  const restartOnboarding = () => {
    setCurrentStepIndex(0);
    setCompletedSteps([]);
    setIsActive(true);
    setIsPlaying(true);
  };

  const pauseResume = () => {
    setIsPlaying(!isPlaying);
  };

  const goToStep = (stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < ONBOARDING_STEPS.length) {
      // Add delay for smooth transition
      setTimeout(() => {
        setCurrentStepIndex(stepIndex);
        updateOnboardingMutation.mutate({ step: stepIndex });
      }, 200);
    }
  };

  return {
    steps: ONBOARDING_STEPS,
    currentStep: ONBOARDING_STEPS[currentStepIndex],
    currentStepIndex,
    totalSteps: ONBOARDING_STEPS.length,
    isActive,
    isPlaying,
    completedSteps,
    nextStep,
    prevStep,
    skipOnboarding,
    completeOnboarding,
    restartOnboarding,
    pauseResume,
    goToStep,
    setIsActive,
  };
}