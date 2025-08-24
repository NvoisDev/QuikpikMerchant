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
    title: "Welcome to Quikpik Merchant! 🎉",
    description: "Let's take a quick tour to help you get started with your wholesale platform. We'll show you the key features and how to set up your business for success.",
    target: "dashboard-header",
    position: "center",
    animation: "glow",
    order: 1
  },
  {
    id: "orders",
    title: "Orders Management",
    description: "Monitor and manage all your customer orders here. You can view order details, update fulfillment status, and track your sales performance.",
    target: "orders",
    position: "right",
    animation: "bounce",
    action: "focus",
    order: 2
  },
  {
    id: "products",
    title: "Products & Catalog",
    description: "Build your product catalog here. Add products with pricing, stock levels, images, and descriptions to create an attractive wholesale offering for your customers.",
    target: "products-list",
    position: "right",
    animation: "bounce",
    action: "focus",
    order: 3
  },
  {
    id: "customers",
    title: "Customer Management",
    description: "Manage your wholesale customers here. You can organize customers into groups, set different pricing tiers, and track their order history.",
    target: "customer-groups",
    position: "right",
    animation: "pulse",
    action: "focus",
    order: 4
  },
  {
    id: "campaigns",
    title: "Marketing & Campaigns",
    description: "Create WhatsApp campaigns and promotional messages to engage your customers. Send product updates, special offers, and order notifications directly to their WhatsApp.",
    target: "campaigns",
    position: "right",
    animation: "pulse",
    action: "focus",
    order: 5
  },
  {
    id: "add-product",
    title: "Add Your First Product",
    description: "Ready to add your first product? Click this button to create your first product listing. You'll be able to set wholesale pricing, minimum order quantities, and upload product images.",
    target: "add-product-button",
    position: "bottom",
    animation: "bounce",
    action: "click",
    interactive: true,
    order: 6
  },
  {
    id: "complete",
    title: "You're All Set! 🚀",
    description: "Congratulations! You've completed the tour. Start by adding your first products, then invite customers to place orders through your personalized customer portal. Need help? Check the Help section anytime.",
    target: "dashboard-header",
    position: "center",
    animation: "glow",
    order: 10
  }
];

export function useOnboarding() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  
  const queryClient = useQueryClient();

  const { data: user } = useQuery<{
    onboardingCompleted?: boolean;
    onboardingSkipped?: boolean;
    onboardingStep?: number;
    [key: string]: any;
  }>({
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

  // Auto-start onboarding for new users
  useEffect(() => {
    if (user && !user.onboardingCompleted && !user.onboardingSkipped) {
      // Start onboarding with a small delay to ensure the page is fully loaded
      setTimeout(() => {
        setIsActive(true);
      }, 1000);
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

  const startOnboarding = () => {
    setCurrentStepIndex(0);
    setCompletedSteps([]);
    setIsActive(true);
    setIsPlaying(true);
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
    startOnboarding,
    skipOnboarding,
    completeOnboarding,
    restartOnboarding,
    pauseResume,
    goToStep,
    setIsActive,
    user,
    isLoading: updateOnboardingMutation.isPending,
  };
}