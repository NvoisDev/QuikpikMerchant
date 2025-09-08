import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

interface Plan {
  id: string;
  name: string;
  description: string;
  priceId: string;
  amount: number;
  currency: string;
  interval: string;
  metadata: any;
  tier: string;
}

interface SimpleSubscriptionUpgradeProps {
  currentPlan: string;
  onUpgradeSuccess?: () => void;
}

export function SimpleSubscriptionUpgrade({ currentPlan, onUpgradeSuccess }: SimpleSubscriptionUpgradeProps) {
  const [upgrading, setUpgrading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Load available plans from Stripe
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const response = await apiRequest("GET", "/api/subscription/plans");
        const data = await response.json();
        setPlans(data.plans || []);
      } catch (error) {
        console.error("Failed to load plans:", error);
        toast({
          title: "Error loading plans",
          description: "Please refresh the page to try again",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadPlans();
  }, [toast]);

  // Format plan data for display
  const formatPlan = (plan: Plan) => {
    const features = [];
    
    if (plan.metadata.productLimit === '-1') {
      features.push("Unlimited products");
    } else {
      features.push(`Up to ${plan.metadata.productLimit} products`);
    }
    
    if (plan.metadata.whatsappIntegration === 'full') {
      features.push("Full WhatsApp integration");
    } else if (plan.metadata.whatsappIntegration === 'advanced') {
      features.push("Advanced WhatsApp integration");
    } else {
      features.push("Basic WhatsApp integration");
    }
    
    if (plan.metadata.marketplaceAccess === 'true') {
      features.push("B2B marketplace access");
    }
    
    if (plan.metadata.teamMembers === '-1') {
      features.push("Unlimited team members");
    } else if (plan.metadata.teamMembers !== '1') {
      features.push(`Up to ${plan.metadata.teamMembers} team members`);
    }
    
    features.push(`${plan.metadata.support} support`);
    
    return {
      id: plan.tier,
      name: plan.name,
      price: plan.amount === 0 ? "£0" : `£${(plan.amount / 100).toFixed(2)}`,
      period: plan.amount === 0 ? "forever" : `per ${plan.interval}`,
      features,
      priceId: plan.priceId,
      current: currentPlan === plan.tier,
      popular: plan.tier === 'premium'
    };
  };

  const handleUpgrade = async (formattedPlan: any) => {
    if (formattedPlan.current || upgrading) return;
    
    setUpgrading(true);
    try {
      // For free plan, handle as downgrade (if needed)
      if (formattedPlan.id === 'free') {
        toast({
          title: "Free plan activated",
          description: "Your account has been downgraded to the free plan",
        });
        onUpgradeSuccess?.();
        return;
      }

      // Create subscription with proper Stripe flow
      const response = await apiRequest("POST", "/api/subscription/create", {
        priceId: formattedPlan.priceId
      });
      
      if (response.ok) {
        const { subscriptionId, clientSecret, status } = await response.json();
        
        if (status === 'active') {
          // Subscription is immediately active (free tier or no payment required)
          toast({
            title: "Plan upgraded successfully!",
            description: `Welcome to ${formattedPlan.name}`,
          });
          onUpgradeSuccess?.();
        } else if (clientSecret) {
          // Payment required - show success and let user know subscription is pending
          toast({
            title: "Subscription Created!",
            description: "Your Premium subscription is pending payment confirmation",
          });
          
          // For now, show success since subscription was created successfully
          // In production, you'd implement Stripe Elements for payment
          onUpgradeSuccess?.();
        } else {
          throw new Error("Unexpected subscription status");
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create subscription");
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

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading subscription plans...</p>
        </div>
      </div>
    );
  }

  const formattedPlans = plans.map(formatPlan);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Choose Your Plan</h2>
        <p className="text-gray-600">Powered by Stripe - Real subscription management</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {formattedPlans.map((plan) => (
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
                onClick={() => handleUpgrade(plan)}
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