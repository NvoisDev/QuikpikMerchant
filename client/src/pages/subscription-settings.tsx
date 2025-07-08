import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Package, Users, MessageSquare, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SubscriptionUpgradeModal } from "@/components/SubscriptionUpgradeModal";

export default function SubscriptionSettings() {
  const { user } = useAuth();
  const { subscription, currentTier, isActive } = useSubscription();
  const { toast } = useToast();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [canceling, setCanceling] = useState(false);

  const handleCancelSubscription = async () => {
    setCanceling(true);
    try {
      const response = await apiRequest("POST", "/api/subscription/cancel");
      if (response.ok) {
        toast({
          title: "Subscription Cancelled",
          description: "Your subscription will be cancelled at the end of the current billing period.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCanceling(false);
    }
  };

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "£0",
      period: "forever",
      features: [
        "Up to 3 products",
        "3 edits per product",
        "Basic WhatsApp integration",
        "Email support"
      ],
      limits: {
        products: 3,
        edits: 3
      },
      current: currentTier === "free"
    },
    {
      id: "standard",
      name: "Standard",
      price: "£10.99",
      period: "per month",
      popular: true,
      features: [
        "Up to 10 products",
        "Unlimited product edits",
        "Advanced WhatsApp features", 
        "Customer group management",
        "Basic analytics",
        "Priority email support"
      ],
      limits: {
        products: 10,
        edits: "Unlimited"
      },
      current: currentTier === "standard"
    },
    {
      id: "premium",
      name: "Premium",
      price: "£19.99",
      period: "per month",
      features: [
        "Unlimited products",
        "Unlimited product edits",
        "Advanced WhatsApp & automation",
        "Advanced customer segmentation",
        "Detailed analytics & reports",
        "Priority support & phone calls",
        "Custom branding options"
      ],
      limits: {
        products: "Unlimited",
        edits: "Unlimited"
      },
      current: currentTier === "premium"
    }
  ];

  const handleUpgrade = (planId: string) => {
    setSelectedPlan(planId);
    setUpgradeModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Subscription & Billing</h1>
        <p className="text-gray-600 mt-2">
          Manage your subscription plan and billing information
        </p>
      </div>

      {/* Current Plan Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Current Plan
            <Badge variant={isActive ? "default" : "secondary"}>
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold capitalize">{currentTier} Plan</h3>
              <p className="text-gray-600">
                {subscription?.productCount || 0} of {subscription?.productLimit === -1 ? "unlimited" : subscription?.productLimit} products used
              </p>
              {subscription?.expiresAt && (
                <p className="text-sm text-gray-500 mt-1">
                  Next billing: {new Date(subscription.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {plans.find(p => p.id === currentTier)?.price || "£0"}
              </p>
              <p className="text-gray-600">
                {plans.find(p => p.id === currentTier)?.period || "forever"}
              </p>
            </div>
          </div>
          
          {currentTier !== "free" && (
            <div className="mt-4 pt-4 border-t">
              <Button 
                variant="outline"
                onClick={handleCancelSubscription}
                disabled={canceling}
                className="text-red-600 hover:text-red-700"
              >
                {canceling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  "Cancel Subscription"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">Plan Limits</h4>
                  <div className="space-y-1 text-sm text-blue-700">
                    <div className="flex justify-between">
                      <span>Products:</span>
                      <span className="font-medium">{plan.limits.products}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Product Edits:</span>
                      <span className="font-medium">{plan.limits.edits}</span>
                    </div>
                  </div>
                </div>

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
                  disabled={plan.current || plan.id === "free"}
                  className={`w-full ${plan.popular ? 'bg-primary hover:bg-primary/90' : ''}`}
                  variant={plan.current ? "outline" : plan.popular ? "default" : "outline"}
                >
                  {plan.current ? (
                    "Current Plan"
                  ) : plan.id === "free" ? (
                    "Downgrade Not Available"
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Usage Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="w-5 h-5 mr-2" />
            Current Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-800">Products Created</h4>
              <p className="text-2xl font-bold text-primary">
                {subscription?.productCount || 0}
              </p>
              <p className="text-sm text-gray-600">
                of {subscription?.productLimit === -1 ? "unlimited" : subscription?.productLimit} allowed
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-800">Plan Status</h4>
              <p className="text-2xl font-bold text-primary capitalize">
                {currentTier}
              </p>
              <p className="text-sm text-gray-600">
                {isActive ? "Active subscription" : "Free plan"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Upgrade Modal */}
      <SubscriptionUpgradeModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        reason="general"
        currentPlan={currentTier}
      />
    </div>
  );
}