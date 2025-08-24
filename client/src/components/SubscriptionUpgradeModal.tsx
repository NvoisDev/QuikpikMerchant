import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Crown, Zap, Package, Users, MessageSquare, TrendingUp, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SubscriptionUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: "product_limit" | "edit_limit" | "customer_group_limit" | "broadcast_limit" | "team_member_limit" | "general";
  currentPlan: string;
}

export function SubscriptionUpgradeModal({ 
  open, 
  onOpenChange, 
  reason,
  currentPlan 
}: SubscriptionUpgradeModalProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { toast } = useToast();

  const handleUpgrade = async (planId: string) => {
    if (loadingPlan) return; // Prevent multiple simultaneous requests
    
    setLoadingPlan(planId);
    try {
      const response = await apiRequest("POST", "/api/subscription/create", {
        planId
      });
      
      if (response.ok) {
        const { subscriptionUrl } = await response.json();
        window.location.href = subscriptionUrl;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create subscription");
      }
    } catch (error: any) {
      console.error("Subscription error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to start subscription process. Please try again.",
        variant: "destructive",
      });
      setLoadingPlan(null); // Reset loading state on error
    }
    // Note: We don't reset loading on success since we're redirecting
  };

  const getReasonMessage = () => {
    switch (reason) {
      case "product_limit":
        return "You've reached your product limit. Upgrade to add more products.";
      case "edit_limit":
        return "You've reached the edit limit for this product. Upgrade for unlimited edits.";
      case "customer_group_limit":
        return "You've reached your customer group limit. Upgrade to create more groups.";
      case "broadcast_limit":
        return "You've reached your monthly broadcast limit. Upgrade for more WhatsApp messages.";
      case "team_member_limit":
        return "You've reached your team member limit. Upgrade to add more team members.";
      default:
        return "Unlock more features with a premium plan.";
    }
  };

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "£0",
      period: "forever",
      current: currentPlan === "free",
      features: [
        "Up to 3 products",
        "3 edits per product",
        "2 customer groups (10 customers each)",
        "5 WhatsApp broadcasts per month",
        "Basic analytics dashboard",
        "Email support"
      ],
      limits: {
        products: 3,
        edits: 3,
        groups: 2,
        broadcasts: 5
      },
      popular: false,
      disabled: true,
      color: "gray"
    },
    {
      id: "standard",
      name: "Standard",
      price: "£10.99",
      period: "per month",
      current: currentPlan === "standard",
      features: [
        "Up to 10 products",
        "10 product edits per product",
        "5 customer groups (50 customers each)",
        "25 WhatsApp broadcasts per month",
        "Enhanced analytics & reports",
        "Priority email & phone support"
      ],
      limits: {
        products: 10,
        edits: 10,
        groups: 5,
        broadcasts: 25
      },
      popular: true,
      disabled: false,
      color: "blue"
    },
    {
      id: "premium",
      name: "Premium",
      price: "£19.99",
      period: "per month",
      current: currentPlan === "premium",
      features: [
        "Unlimited products",
        "Unlimited product edits",
        "Unlimited customer groups",
        "Unlimited WhatsApp broadcasts",
        "B2B Marketplace access",
        "Premium analytics dashboard",
        "Team management (up to 5 members)",
        "Dedicated account manager"
      ],
      limits: {
        products: "unlimited",
        edits: "unlimited",
        groups: "unlimited",
        broadcasts: "unlimited"
      },
      popular: false,
      disabled: false,
      color: "purple"
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-10"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            Upgrade Your Plan
          </DialogTitle>
          <p className="text-center text-gray-600 mt-2">
            {getReasonMessage()}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {plans.map((plan) => (
            <Card 
              key={plan.id}
              className={`relative ${plan.popular ? 'border-primary shadow-lg' : 'border-gray-200'} ${plan.current ? 'bg-gray-50' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-white px-3 py-1">
                    <Crown className="w-3 h-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-primary">{plan.price}</span>
                  <span className="text-gray-600 ml-1">/{plan.period}</span>
                </div>
              </CardHeader>

              <CardContent className="pt-2">
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={plan.disabled || plan.current || loadingPlan === plan.id}
                  className={`w-full ${plan.popular ? 'bg-primary hover:bg-primary/90' : ''}`}
                  variant={plan.current ? "outline" : plan.popular ? "default" : "outline"}
                >
                  {plan.current ? (
                    "Current Plan"
                  ) : plan.disabled ? (
                    "Current Plan"
                  ) : loadingPlan === plan.id ? (
                    <div className="flex items-center">
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Processing...
                    </div>
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 text-sm font-bold">i</span>
              </div>
            </div>
            <div className="flex-1">
              <h4 className="text-blue-800 font-medium mb-1">Secure Payment with Stripe</h4>
              <p className="text-blue-700 text-sm">
                Your subscription is securely processed by Stripe. You can cancel anytime from your account settings.
                All payments are in British Pounds (£) and billed monthly.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}