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
// import { SubscriptionUpgradeModal } from "@/components/SubscriptionUpgradeModal";
// import { SubscriptionDebugger } from "@/components/SubscriptionDebugger";
// import { DowngradeConfirmationModal } from "@/components/DowngradeConfirmationModal";

export default function SubscriptionSettings() {
  const { user } = useAuth();
  const { subscription, currentTier, isActive, isLoading: subscriptionLoading } = useSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [downgradeModalOpen, setDowngradeModalOpen] = useState(false);
  const [targetDowngradePlan, setTargetDowngradePlan] = useState("");

  // Debug logging to see what data we're getting
  console.log("🐛 Subscription page data:", {
    user: user ? {
      id: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      productLimit: user.productLimit
    } : null,
    subscription: subscription || {},
    currentTier,
    isActive
  });

  // Ensure subscription is never undefined - provide safe defaults
  const safeSubscription = subscription || {
    tier: 'free',
    status: 'inactive',
    productCount: 0
  };

  // Show login message if not authenticated
  if (!user) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Subscription Settings</h1>
          <p className="text-muted-foreground mt-2">
            Please log in to view your subscription details
          </p>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-4">Authentication Required</h3>
            <p className="text-muted-foreground mb-4">
              You need to log in to access your subscription settings
            </p>
            <Button onClick={() => window.location.href = '/login'}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state while subscription data is being fetched
  if (subscriptionLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Subscription Settings</h1>
          <p className="text-muted-foreground mt-2">Loading your subscription details...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

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
            // Get the plan from URL params if available
            const urlParams = new URLSearchParams(window.location.search);
            const planId = urlParams.get('plan') || 'premium'; // Default to premium if no plan specified
            
            await apiRequest("POST", "/api/subscription/manual-upgrade", {
              planId: planId,
              stripeSessionId: sessionId
            });
            console.log(`🚀 Manual upgrade triggered successfully for ${planId} plan`);
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

  // Marketplace settings - temporarily disabled to prevent React errors
  const marketplaceSettings = { showPricesToWholesalers: false }; // Default fallback
  
  const updateMarketplaceSettings = {
    mutate: () => {},
    isPending: false
  };

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

  // Remove the old handleUpgrade function that opens modal

  const handleDowngrade = async (targetPlan: string) => {
    // Show confirmation modal instead of immediate downgrade
    setTargetDowngradePlan(targetPlan);
    setDowngradeModalOpen(true);
  };

  const confirmDowngrade = async () => {
    setCanceling(true);
    try {
      console.log(`🔽 Initiating downgrade to: ${targetDowngradePlan}`);
      
      const response = await apiRequest("POST", "/api/subscription/downgrade", {
        targetTier: targetDowngradePlan
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Downgrade successful:`, result);
        
        queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        
        toast({
          title: "Plan Downgrade Scheduled",
          description: `Your plan will be downgraded to ${targetDowngradePlan} at the end of your current billing period. You'll keep all current features until then.`,
        });
        
        setDowngradeModalOpen(false);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to downgrade subscription plan");
      }
    } catch (error: any) {
      console.error('Downgrade error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to downgrade subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCanceling(false);
    }
  };

  const handleUpgrade = async (targetPlan: string) => {
    setCanceling(true);
    try {
      console.log(`🔼 Initiating upgrade to: ${targetPlan}`);
      
      if (targetPlan === 'free') {
        // Free tier is a downgrade, not upgrade
        return handleDowngrade(targetPlan);
      }
      
      const response = await apiRequest("POST", "/api/subscription/upgrade", {
        targetTier: targetPlan
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Upgrade checkout created:`, result);
        
        // Redirect to Stripe checkout
        if (result.checkoutUrl) {
          toast({
            title: "Redirecting to Payment",
            description: `Taking you to secure payment for ${targetPlan} plan upgrade.`,
          });
          
          // Redirect to Stripe checkout
          window.location.href = result.checkoutUrl;
        } else {
          throw new Error("No checkout URL received");
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create upgrade payment session");
      }
    } catch (error: any) {
      console.error('Upgrade error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to start upgrade process. Please try again.",
        variant: "destructive",
      });
      setCanceling(false);
    }
    // Don't reset canceling here since we're redirecting to Stripe
  };

  const handlePlanChange = (targetPlan: string) => {
    // Determine if it's an upgrade or downgrade
    const tierOrder = { free: 0, standard: 1, premium: 2 };
    const currentTierOrder = tierOrder[currentTier as keyof typeof tierOrder] || 0;
    const targetTierOrder = tierOrder[targetPlan as keyof typeof tierOrder] || 0;
    
    if (targetTierOrder > currentTierOrder) {
      // This is an upgrade - requires payment
      handleUpgrade(targetPlan);
    } else {
      // This is a downgrade - free
      handleDowngrade(targetPlan);
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

      {/* Current Plan Status - Modernized */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex items-center justify-center w-16 h-16 rounded-full ${
                currentTier === 'premium' ? 'bg-gradient-to-br from-yellow-400 to-orange-500' :
                currentTier === 'standard' ? 'bg-blue-500' : 'bg-gray-500'
              } text-white shadow-lg`}>
                {currentTier === 'premium' && <Crown className="w-8 h-8" />}
                {currentTier === 'standard' && <Package className="w-8 h-8" />}
                {currentTier === 'free' && <Users className="w-8 h-8" />}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-3xl font-bold capitalize">{currentTier} Plan</h2>
                  <Badge variant={isActive ? "default" : "destructive"} className={`
                    ${currentTier === 'premium' ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white' : ''}
                    ${currentTier === 'standard' ? 'bg-blue-500' : ''}
                  `}>
                    {isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-2xl font-semibold text-foreground">
                    {plans.find(p => p.id === currentTier)?.price || "£0"}
                  </span>
                  <span>/ {plans.find(p => p.id === currentTier)?.period || "forever"}</span>
                </div>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={async () => {
                try {
                  queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
                  toast({
                    title: "Data Refreshed",
                    description: "Subscription data has been updated from server",
                  });
                } catch (error) {
                  console.error("Refresh failed:", error);
                }
              }}
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Usage Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-background/60 rounded-lg p-4 text-center border">
              <div className="text-3xl font-bold text-primary mb-1">
                {currentTier === 'premium' ? '∞' : 
                 currentTier === 'standard' ? '10' : '3'}
              </div>
              <div className="text-sm text-muted-foreground">Products Limit</div>
              <div className="text-xs text-muted-foreground mt-1">
                {(safeSubscription as any)?.productCount || 0} used
              </div>
            </div>
            <div className="bg-background/60 rounded-lg p-4 text-center border">
              <div className="text-3xl font-bold text-primary mb-1">
                {currentTier === 'premium' ? '∞' : 
                 currentTier === 'standard' ? '10' : '3'}
              </div>
              <div className="text-sm text-muted-foreground">Edits per Product</div>
            </div>
            <div className="bg-background/60 rounded-lg p-4 text-center border">
              <div className="text-3xl font-bold text-primary mb-1">
                {currentTier === 'premium' ? '∞' : 
                 currentTier === 'standard' ? '5' : '2'}
              </div>
              <div className="text-sm text-muted-foreground">Customer Groups</div>
            </div>
            <div className="bg-background/60 rounded-lg p-4 text-center border">
              <div className="text-3xl font-bold text-primary mb-1">
                {currentTier === 'premium' ? '∞' : 
                 currentTier === 'standard' ? '25' : '5'}
              </div>
              <div className="text-sm text-muted-foreground">Broadcasts/Month</div>
            </div>
          </div>

          {/* Plan Features Preview */}
          <div className="space-y-3">
            <h4 className="font-semibold text-lg">Your Plan Includes:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {plans.find(p => p.id === currentTier)?.features?.slice(0, 8)?.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              )) || []}
            </div>
            {(plans.find(p => p.id === currentTier)?.features?.length || 0) > 8 && (
              <p className="text-sm text-muted-foreground">
                +{(plans.find(p => p.id === currentTier)?.features?.length || 0) - 8} more features included
              </p>
            )}
          </div>

          {/* Billing Information */}
          {user?.subscriptionEndsAt && (
            <div className="bg-secondary/20 rounded-lg p-4 border border-secondary/40">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Billing Information</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Next billing date: {new Date(user.subscriptionEndsAt).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          )}
          
          {/* Plan Management Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            {currentTier !== "free" && (
              <>
                <Button 
                  variant="outline"
                  onClick={handleCancelSubscription}
                  disabled={canceling}
                  className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
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
                
                {currentTier === "premium" && (
                  <Button 
                    variant="outline"
                    onClick={() => handlePlanChange("standard")}
                    disabled={canceling}
                    className="text-blue-600 hover:text-blue-700 border-blue-200 hover:border-blue-300"
                  >
                    Change to Standard
                  </Button>
                )}
                
                {(currentTier === "premium" || currentTier === "standard") && (
                  <Button 
                    variant="outline"
                    onClick={() => handlePlanChange("free")}
                    disabled={canceling}
                    className="text-gray-600 hover:text-gray-700 border-gray-200 hover:border-gray-300"
                  >
                    Change to Free
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Downgrade Section for Testing */}
      {currentTier !== "free" && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="text-orange-800">Quick Plan Management</CardTitle>
            <p className="text-orange-600 text-sm">Change your subscription level instantly</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {currentTier !== "free" && (
                <Button 
                  variant="outline"
                  onClick={() => handlePlanChange("free")}
                  disabled={canceling}
                  className="border-gray-300 hover:bg-gray-50"
                >
                  Switch to Free
                </Button>
              )}
              {currentTier !== "standard" && (
                <Button 
                  variant="outline"
                  onClick={() => handlePlanChange("standard")}
                  disabled={canceling}
                  className="border-blue-300 hover:bg-blue-50"
                >
                  Switch to Standard
                </Button>
              )}
              {currentTier !== "premium" && (
                <Button 
                  variant="outline"
                  onClick={() => handlePlanChange("premium")}
                  disabled={canceling}
                  className="border-yellow-300 hover:bg-yellow-50"
                >
                  Switch to Premium
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Changes take effect immediately. Downgrades may lock products that exceed new plan limits.
            </p>
          </CardContent>
        </Card>
      )}

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
                    
                    // Use the universal plan change function
                    handlePlanChange(plan.id);
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
                {(safeSubscription as any)?.productCount || 0}
              </p>
              <p className="text-sm text-gray-600">
                of {(safeSubscription as any)?.productLimit === -1 ? "unlimited" : (safeSubscription as any)?.productLimit || 'N/A'} allowed
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-800">Team Members</h4>
              <p className="text-2xl font-bold text-primary">
                {(safeSubscription as any)?.teamMemberCount || 0}
              </p>
              <p className="text-sm text-gray-600">
                of {(safeSubscription as any)?.teamMemberLimit === -1 ? "unlimited" : (safeSubscription as any)?.teamMemberLimit || 'N/A'} allowed
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

      {/* Marketplace Settings - Temporarily disabled to prevent React errors */}
      {/* {currentTier === 'premium' && (
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
      )} */}

      {/* Subscription Upgrade Modal - Temporarily disabled */}
      {/* <SubscriptionUpgradeModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        reason="general"
        currentPlan={currentTier}
      /> */}

      {/* Downgrade Confirmation Modal - Temporarily disabled */}
      {/* <DowngradeConfirmationModal
        open={downgradeModalOpen}
        onOpenChange={setDowngradeModalOpen}
        currentPlan={currentTier}
        targetPlan={targetDowngradePlan}
        onConfirm={confirmDowngrade}
        isLoading={canceling}
      /> */}
    </div>
  );
}