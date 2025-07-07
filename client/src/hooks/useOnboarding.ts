import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  position: "top" | "bottom" | "left" | "right";
  action?: () => void;
  skipable?: boolean;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to Quikpik!",
    description: "Let's take a quick tour to get you started with managing your wholesale business.",
    targetSelector: "[data-onboarding='dashboard']",
    position: "bottom",
    skipable: true,
  },
  {
    id: "add-product",
    title: "Add Your First Product",
    description: "Start by adding products to your inventory. Click here to create your first product.",
    targetSelector: "[data-onboarding='add-product']",
    position: "bottom",
    action: () => {
      const addProductBtn = document.querySelector("[data-onboarding='add-product']") as HTMLElement;
      addProductBtn?.click();
    },
  },
  {
    id: "products-page",
    title: "Manage Your Products",
    description: "Here you can view, edit, and manage all your products. You can also upload products in bulk using CSV files.",
    targetSelector: "[data-onboarding='products-list']",
    position: "top",
  },
  {
    id: "customer-groups",
    title: "Organize Your Customers",
    description: "Create customer groups to organize your contacts and send targeted product broadcasts.",
    targetSelector: "[data-onboarding='customer-groups']",
    position: "right",
  },
  {
    id: "campaigns",
    title: "Send Product Campaigns",
    description: "Use campaigns to broadcast your products to customer groups via WhatsApp and other channels.",
    targetSelector: "[data-onboarding='campaigns']",
    position: "right",
  },
  {
    id: "orders",
    title: "Track Your Orders",
    description: "Monitor incoming orders, process payments, and track order fulfillment all in one place.",
    targetSelector: "[data-onboarding='orders']",
    position: "right",
  },
  {
    id: "settings",
    title: "Configure Your Business",
    description: "Set up your business information, payment settings, and WhatsApp integration in Settings.",
    targetSelector: "[data-onboarding='settings']",
    position: "right",
  },
  {
    id: "preview-store",
    title: "Preview Your Store",
    description: "See how your products look to customers by previewing your store anytime.",
    targetSelector: "[data-onboarding='preview-store']",
    position: "left",
  },
];

export function useOnboarding() {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  const updateOnboardingMutation = useMutation({
    mutationFn: async (data: { step?: number; completed?: boolean; skipped?: boolean }) => {
      return apiRequest("PATCH", `/api/auth/user/onboarding`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  useEffect(() => {
    if (user && !user.onboardingCompleted && !user.onboardingSkipped) {
      setIsActive(true);
      setCurrentStep(user.onboardingStep || 0);
    }
  }, [user]);

  const getCurrentStep = () => {
    return ONBOARDING_STEPS[currentStep];
  };

  const nextStep = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      const nextStepIndex = currentStep + 1;
      setCurrentStep(nextStepIndex);
      updateOnboardingMutation.mutate({ step: nextStepIndex });
    } else {
      completeOnboarding();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      const prevStepIndex = currentStep - 1;
      setCurrentStep(prevStepIndex);
      updateOnboardingMutation.mutate({ step: prevStepIndex });
    }
  };

  const skipOnboarding = () => {
    setIsActive(false);
    updateOnboardingMutation.mutate({ skipped: true });
  };

  const completeOnboarding = () => {
    setIsActive(false);
    updateOnboardingMutation.mutate({ completed: true });
  };

  const restartOnboarding = () => {
    setCurrentStep(0);
    setIsActive(true);
    updateOnboardingMutation.mutate({ step: 0, completed: false, skipped: false });
  };

  const startOnboarding = () => {
    setCurrentStep(0);
    setIsActive(true);
    updateOnboardingMutation.mutate({ step: 0 });
  };

  const updateTooltipPosition = (targetSelector: string) => {
    const element = document.querySelector(targetSelector);
    if (element) {
      const rect = element.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      setTooltipPosition({
        top: rect.top + scrollTop,
        left: rect.left + scrollLeft,
      });
    }
  };

  return {
    isActive,
    currentStep,
    totalSteps: ONBOARDING_STEPS.length,
    getCurrentStep,
    nextStep,
    prevStep,
    skipOnboarding,
    completeOnboarding,
    startOnboarding,
    restartOnboarding,
    updateTooltipPosition,
    tooltipPosition,
    isLoading: updateOnboardingMutation.isPending,
    user,
  };
}