import React, { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OnboardingWrapper } from "./OnboardingWrapper";

interface OnboardingContextType {
  isOnboardingActive: boolean;
  startOnboarding: () => void;
  canStartOnboarding: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function useOnboardingContext() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboardingContext must be used within OnboardingProvider");
  }
  return context;
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);
  const [canStartOnboarding, setCanStartOnboarding] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  useEffect(() => {
    if (user) {
      // Check if user can start onboarding - only for first-time users
      const shouldStartOnboarding = user.isFirstLogin && !user.onboardingCompleted && !user.onboardingSkipped;
      setCanStartOnboarding(true);
      
      if (shouldStartOnboarding) {
        // Start onboarding automatically for first-time users only
        setIsOnboardingActive(true);
      }
    }
  }, [user]);

  const startOnboarding = () => {
    if (canStartOnboarding) {
      setIsOnboardingActive(true);
    }
  };

  return (
    <OnboardingContext.Provider
      value={{
        isOnboardingActive,
        startOnboarding,
        canStartOnboarding,
      }}
    >
      {children}
      <OnboardingWrapper />
    </OnboardingContext.Provider>
  );
}