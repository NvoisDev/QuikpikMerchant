import React from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle, Play } from "lucide-react";
import { useOnboarding } from "@/hooks/useOnboarding";

interface OnboardingRestartButtonProps {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function OnboardingRestartButton({ 
  variant = "outline", 
  size = "sm",
  className = ""
}: OnboardingRestartButtonProps) {
  const { restartOnboarding, isLoading } = useOnboarding();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={restartOnboarding}
      disabled={isLoading}
      className={className}
    >
      <Play className="mr-2 h-4 w-4" />
      Take Tour
    </Button>
  );
}

export default OnboardingRestartButton;