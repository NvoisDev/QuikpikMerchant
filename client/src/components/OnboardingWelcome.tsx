import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOnboarding } from "@/hooks/useOnboarding";
import { Play, X, CheckCircle, Star } from "lucide-react";

export function OnboardingWelcome() {
  const { user, startOnboarding, skipOnboarding, isLoading } = useOnboarding();

  return (
    <Card className="onboarding-welcome border-2 border-green-200 bg-green-50" style={{ zIndex: 100001 }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg text-green-800">
              Welcome to Quikpik Merchant!
            </CardTitle>
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              New User
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={skipOnboarding}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          <p className="text-green-700">
            We're excited to have you on board! Let us show you around your new wholesale platform 
            and help you get started with managing your business.
          </p>
          
          <div className="bg-white p-4 rounded-lg border border-green-200">
            <h4 className="font-medium text-green-800 mb-2">What you'll learn:</h4>
            <ul className="text-sm text-green-700 space-y-1">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-green-600" />
                How to add and manage your products
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-green-600" />
                Setting up customer groups and broadcasts
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-green-600" />
                Managing orders and payments
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-green-600" />
                Understanding your business analytics
              </li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={startOnboarding}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="mr-2 h-4 w-4" />
              Start Tour
            </Button>
            <Button
              variant="outline"
              onClick={skipOnboarding}
              disabled={isLoading}
              className="border-green-300 text-green-700 hover:bg-green-100"
            >
              Skip for Now
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default OnboardingWelcome;