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
    description: "Let's take a quick tour to help you get started with managing your wholesale business. This will only take a few minutes.",
    target: "dashboard-header",
    position: "center",
    animation: "glow",
    order: 1
  },
  {
    id: "dashboard-overview",
    title: "Your Business Dashboard",
    description: "This is your main dashboard where you can see your business performance, recent orders, and quick stats at a glance.",
    target: "dashboard-stats",
    position: "bottom",
    animation: "pulse",
    action: "focus",
    order: 2
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
    order: 3
  },
  {
    id: "products-navigation",
    title: "Manage Your Products",
    description: "Access your product inventory here. You can edit, update stock levels, set pricing, and manage your entire product catalog.",
    target: "nav-products",
    position: "right",
    animation: "highlight",
    action: "click",
    order: 4
  },
  {
    id: "customer-groups",
    title: "Customer Groups",
    description: "Organize your retail customers into groups for targeted marketing. You can create groups by location, order size, or business type.",
    target: "nav-customers",
    position: "right",
    animation: "pulse",
    action: "navigate",
    order: 5
  },
  {
    id: "broadcast-system",
    title: "Send Product Updates",
    description: "Use our messaging system to send product updates, promotions, and stock alerts to your customer groups instantly.",
    target: "nav-campaigns",
    position: "right",
    animation: "glow",
    action: "navigate",
    order: 6
  },
  {
    id: "orders-management",
    title: "Track Your Orders",
    description: "Monitor incoming orders, process payments, and track order status from pending to delivered. All your sales activity in one place.",
    target: "nav-orders",
    position: "right",
    animation: "bounce",
    action: "navigate",
    order: 7
  },
  {
    id: "business-performance",
    title: "Business Analytics",
    description: "View detailed analytics about your sales performance, customer trends, and business growth metrics to make informed decisions.",
    target: "nav-analytics",
    position: "right",
    animation: "pulse",
    action: "navigate",
    order: 8
  },
  {
    id: "settings-setup",
    title: "Business Settings",
    description: "Configure your business profile, payment methods, messaging settings, and subscription plan in the settings section.",
    target: "nav-settings",
    position: "right",
    animation: "highlight",
    action: "navigate",
    order: 9
  },
  {
    id: "completion",
    title: "You're All Set!",
    description: "Congratulations! You've completed the tour. Start by adding your products and building your customer base. Need help? Check our help section anytime.",
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
      setCurrentStepIndex(newIndex);
      setCompletedSteps(prev => [...prev, ONBOARDING_STEPS[currentStepIndex].id]);
      
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
      setCurrentStepIndex(stepIndex);
      updateOnboardingMutation.mutate({ step: stepIndex });
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