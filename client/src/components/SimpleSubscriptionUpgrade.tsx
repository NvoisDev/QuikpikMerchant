import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

interface SimpleSubscriptionUpgradeProps {
  currentPlan: string;
  onUpgradeSuccess?: () => void;
}

export function SimpleSubscriptionUpgrade({ currentPlan, onUpgradeSuccess }: SimpleSubscriptionUpgradeProps) {
  const [upgrading, setUpgrading] = useState(false);
  const { toast } = useToast();

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "£0",
      period: "forever",
      features: [
        "Up to 3 products",
        "Basic WhatsApp integration",
        "Email support"
      ],
      current: currentPlan === "free"
    },
    {
      id: "premium", 
      name: "Premium",
      price: "£19.99",
      period: "per month",
      popular: true,
      features: [
        "Unlimited products",
        "B2B marketplace access", 
        "Team management",
        "Advanced analytics",
        "Priority support"
      ],
      current: currentPlan === "premium"
    }
  ];

  const handleUpgrade = async (planId: string) => {
    if (planId === currentPlan || upgrading) return;
    
    setUpgrading(true);
    try {
      const response = await apiRequest("POST", "/api/subscription/upgrade", {
        planId
      });
      
      if (response.ok) {
        const { checkoutUrl } = await response.json();
        
        toast({
          title: "Redirecting to payment...",
          description: "Taking you to secure checkout",
        });
        
        // Redirect to Stripe checkout
        window.location.href = checkoutUrl;
      } else {
        throw new Error("Failed to create checkout session");
      }
    } catch (error: any) {
      console.error("Upgrade error:", error);
      
      // Handle authentication errors specifically  
      if (isUnauthorizedError(error) || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        toast({
          title: "Session Expired",
          description: "Please log in again to upgrade your subscription",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      } else {
        toast({
          title: "Upgrade Failed",
          description: "Please try again or contact support",
          variant: "destructive",
        });
      }
      setUpgrading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Choose Your Plan</h2>
        <p className="text-gray-600">Simple, transparent pricing</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {plans.map((plan) => (
          <Card 
            key={plan.id} 
            className={`relative ${plan.popular ? 'border-primary/50 shadow-lg' : ''} ${plan.current ? 'bg-primary/5' : ''}`}
          >
            {plan.popular && (
              <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary">
                Most Popular
              </Badge>
            )}
            
            <CardHeader className="text-center pb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                {plan.id === "premium" && <Crown className="w-5 h-5 text-primary" />}
                <CardTitle>{plan.name}</CardTitle>
                {plan.current && <Badge variant="outline">Current</Badge>}
              </div>
              <div className="text-3xl font-bold">
                {plan.price}
                <span className="text-sm font-normal text-gray-600">/{plan.period}</span>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleUpgrade(plan.id)}
                disabled={plan.current || upgrading}
                className="w-full"
                variant={plan.popular ? "default" : "outline"}
              >
                {upgrading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : plan.current ? (
                  "Current Plan"
                ) : (
                  `Upgrade to ${plan.name}`
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}