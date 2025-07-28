import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Check, Crown, Package, Users, MessageSquare, TrendingUp, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SubscriptionUpgradeModal } from "@/components/SubscriptionUpgradeModal";

export default function SubscriptionSettings() {
  const { user } = useAuth();
  const { subscription, currentTier, isActive } = useSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [canceling, setCanceling] = useState(false);

  // Force cache invalidation on component mount to ensure fresh data
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  }, [queryClient]);

  // Check for success/cancel parameters in URL
  useEffect(() => {
    const handleSuccess = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const success = urlParams.get('success');
      const canceled = urlParams.get('canceled');
      
      if (success === 'true') {
        toast({
          title: "Subscription Updated!",
          description: "Your subscription has been successfully updated. Thank you for upgrading!",
        });
        // Clear the URL parameter
        window.history.replaceState({}, '', window.location.pathname);
        
        // Trigger manual upgrade endpoint to ensure subscription is updated
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session_id');
        
        if (sessionId) {
          try {
            await apiRequest("POST", "/api/subscription/manual-upgrade", {
              planId: 'standard', // Assuming standard plan based on previous upgrade
              stripeSessionId: sessionId
            });
            console.log("🚀 Manual upgrade triggered successfully");
          } catch (error) {
            console.error("Manual upgrade failed:", error);
          }
        }
        
        // Force refresh of all subscription-related data
        queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        
        // Force page refresh to ensure UI updates
        setTimeout(() => window.location.reload(), 1000);
      } else if (canceled === 'true') {
        toast({
          title: "Subscription Canceled",
          description: "Your subscription upgrade was canceled. You can try again anytime.",
          variant: "destructive",
        });
        // Clear the URL parameter
        window.history.replaceState({}, '', window.location.pathname);
      }
    };
    
    handleSuccess();
  }, [toast, queryClient]);

  // Marketplace settings
  const { data: marketplaceSettings } = useQuery<{showPricesToWholesalers: boolean}>({
    queryKey: ["/api/user/marketplace-settings"],
    enabled: currentTier === 'premium'
  });

  const updateMarketplaceSettings = useMutation({
    mutationFn: async (settings: { showPricesToWholesalers: boolean }) => {
      const response = await apiRequest("PATCH", "/api/user/marketplace-settings", settings);
      if (!response.ok) throw new Error("Failed to update settings");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/marketplace-settings"] });
      toast({
        title: "Settings Updated",
        description: "Marketplace price visibility settings have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update marketplace settings. Please try again.",
        variant: "destructive",
      });
    }
  });

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
        "Up to 2 customer groups",
        "5 broadcasts per month",
        "10 customers per group",
        "No team members",
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
        "10 product edits per product",
        "Up to 5 customer groups",
        "25 broadcasts per month", 
        "50 customers per group",
        "Up to 2 team members",
        "Role-based permissions",
        "Advanced WhatsApp features",
        "Basic analytics",
        "Priority email support"
      ],
      limits: {
        products: 10,
        edits: 10
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
        "Unlimited customer groups",
        "Unlimited broadcasts",
        "Unlimited customers per group",
        "Up to 5 team members",
        "Advanced role-based permissions",
        "Team management dashboard",
        "Marketplace access (selling platform)",  
        "Product advertising & promotion",
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

  const handleDowngrade = async (targetPlan: string) => {
    setCanceling(true);
    try {
      const response = await apiRequest("POST", "/api/subscription/downgrade", {
        targetTier: targetPlan
      });
      
      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: "Plan Downgraded",
          description: `Your subscription has been downgraded to ${targetPlan}. Changes will take effect immediately.`,
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to downgrade subscription");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to downgrade subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCanceling(false);
    }
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
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={async () => {
                  try {
                    // Force refresh data from server
                    queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
                    
                    const debugResponse = await apiRequest("GET", "/api/subscription/debug");
                    const debugData = await debugResponse.json();
                    console.log("🐛 Debug data:", debugData);
                    toast({
                      title: "Subscription Updated",
                      description: `Tier: ${debugData.subscriptionTier || 'free'}, Status: ${debugData.subscriptionStatus || 'inactive'}`,
                    });
                    
                    // Force page refresh if needed
                    setTimeout(() => window.location.reload(), 1000);
                  } catch (error) {
                    console.error("Debug failed:", error);
                  }
                }}
              >
                Refresh Data
              </Button>
              <Badge variant={isActive ? "default" : "secondary"}>
                {isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold capitalize">{currentTier} Plan</h3>
              <p className="text-gray-600">
                {(subscription as any)?.productCount || 0} of {(subscription as any)?.productLimit === -1 ? "unlimited" : (subscription as any)?.productLimit} products used
              </p>
              {(subscription as any)?.expiresAt && (
                <p className="text-sm text-gray-500 mt-1">
                  Next billing: {new Date((subscription as any).expiresAt).toLocaleDateString()}
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
                  onClick={() => {
                    if (plan.current) return;
                    
                    const tierOrder = { free: 0, standard: 1, premium: 2 };
                    const currentTierOrder = tierOrder[currentTier as keyof typeof tierOrder] || 0;
                    const targetTierOrder = tierOrder[plan.id as keyof typeof tierOrder] || 0;
                    
                    if (targetTierOrder < currentTierOrder) {
                      // This is a downgrade
                      handleDowngrade(plan.id);
                    } else {
                      // This is an upgrade
                      handleUpgrade(plan.id);
                    }
                  }}
                  disabled={plan.current || canceling}
                  className={`w-full ${plan.popular ? 'bg-primary hover:bg-primary/90' : ''}`}
                  variant={plan.current ? "outline" : plan.popular ? "default" : "outline"}
                >
                  {canceling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : plan.current ? (
                    "Current Plan"
                  ) : (() => {
                    const tierOrder = { free: 0, standard: 1, premium: 2 };
                    const currentTierOrder = tierOrder[currentTier as keyof typeof tierOrder] || 0;
                    const targetTierOrder = tierOrder[plan.id as keyof typeof tierOrder] || 0;
                    
                    if (targetTierOrder < currentTierOrder) {
                      return `Downgrade to ${plan.name}`;
                    } else {
                      return `Upgrade to ${plan.name}`;
                    }
                  })()}
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-800">Products Created</h4>
              <p className="text-2xl font-bold text-primary">
                {(subscription as any)?.productCount || 0}
              </p>
              <p className="text-sm text-gray-600">
                of {(subscription as any)?.productLimit === -1 ? "unlimited" : (subscription as any)?.productLimit} allowed
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-800">Team Members</h4>
              <p className="text-2xl font-bold text-primary">
                {(subscription as any)?.teamMemberCount || 0}
              </p>
              <p className="text-sm text-gray-600">
                of {(subscription as any)?.teamMemberLimit === -1 ? "unlimited" : (subscription as any)?.teamMemberLimit || 0} allowed
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

      {/* Marketplace Settings - Premium Only */}
      {currentTier === 'premium' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Marketplace Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="show-prices" className="text-base font-medium">
                  Show Prices to Other Wholesalers
                </Label>
                <p className="text-sm text-gray-600">
                  Allow other wholesalers in the marketplace to see your product prices. 
                  When disabled, prices are hidden and blurred for privacy.
                </p>
              </div>
              <Switch
                id="show-prices"
                checked={marketplaceSettings?.showPricesToWholesalers || false}
                onCheckedChange={(checked) => 
                  updateMarketplaceSettings.mutate({ showPricesToWholesalers: checked })
                }
                disabled={updateMarketplaceSettings.isPending}
              />
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 rounded-full p-1">
                  {marketplaceSettings?.showPricesToWholesalers ? (
                    <Eye className="w-4 h-4 text-blue-600" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-blue-600" />
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">
                    Current Setting: {marketplaceSettings?.showPricesToWholesalers ? 'Prices Visible' : 'Prices Hidden'}
                  </h4>
                  <p className="text-sm text-blue-700">
                    {marketplaceSettings?.showPricesToWholesalers 
                      ? 'Other wholesalers can see your product prices in the B2B marketplace.'
                      : 'Your product prices are hidden and blurred for other wholesalers in the marketplace.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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