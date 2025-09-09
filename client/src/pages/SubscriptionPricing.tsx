import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckIcon, X, StarIcon, CrownIcon } from 'lucide-react';
import { DowngradeConfirmationModal } from '@/components/subscription/DowngradeConfirmationModal';
import { useAuth } from '@/hooks/useAuth';
import clsx from 'clsx';

interface SubscriptionPlan {
  id: string;
  name: string;
  planId: string;
  stripePriceId: string | null;
  monthlyPrice: string;
  currency: string;
  description: string;
  features: string[];
  limits: {
    products: number;
    broadcasts: number;
    teamMembers: number;
    customGroups: number;
  };
  sortOrder: number;
}

interface CurrentSubscription {
  user: any;
  subscription: any;
  plan: SubscriptionPlan | null;
  currentPlan: string;
  subscriptionStatus: string;
}

export default function SubscriptionPricing() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [targetDowngradePlan, setTargetDowngradePlan] = useState<string>('free');
  // Handle success/cancel URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isSuccess = urlParams.get('success') === 'true';
    const isCancelled = urlParams.get('cancelled') === 'true';
    
    if (isSuccess) {
      toast({
        title: "🎉 Payment Successful!",
        description: "Your subscription has been upgraded successfully. Welcome to your new plan!",
        variant: "default",
      });
      // Clean the URL
      window.history.replaceState({}, '', window.location.pathname);
      // Refresh subscription data
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/plan-limits'] });
    } else if (isCancelled) {
      toast({
        title: "Payment Cancelled",
        description: "Your subscription upgrade was cancelled. No charges were made.",
        variant: "default",
      });
      // Clean the URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast, queryClient]);

  // Get available plans
  const { data: plans = [], isLoading: plansLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/subscriptions/plans'],
  });

  // Get current subscription
  const { data: currentSubscription, isLoading: subscriptionLoading } = useQuery<CurrentSubscription>({
    queryKey: ['/api/subscriptions/current'],
    enabled: !!user,
  });

  // Get plan limits and usage
  const { data: planLimits, isLoading: limitsLoading } = useQuery<{
    usage: { products: number; broadcasts: number; teamMembers: number };
    limits: { products: number; broadcasts: number; teamMembers: number };
    percentUsed: { products: number; broadcasts: number; teamMembers: number };
    plan: string;
  }>({
    queryKey: ['/api/subscriptions/plan-limits'],
    enabled: !!user,
  });

  // Create checkout session mutation
  const createCheckoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest('POST', '/api/subscriptions/create-checkout-session', {
        priceId
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      console.error('Checkout error:', error);
      toast({
        title: "Payment Error",
        description: "Failed to start checkout process. Please try again.",
        variant: "destructive",
      });
    }
  });


  // Cancel subscription mutation (now triggered through downgrade modal)
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/subscriptions/cancel');
      return response.json();
    },
    onSuccess: (data) => {
      // Format the cancellation date properly
      let cancellationMessage = "Your subscription has been canceled and will remain active until the end of your current billing period.";
      
      if (data.currentPeriodEnd) {
        const endDate = new Date(data.currentPeriodEnd * 1000);
        const today = new Date();
        const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        cancellationMessage = `Your subscription will be canceled on ${endDate.toLocaleDateString('en-GB', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })} (${daysRemaining} days remaining). You'll keep all ${currentSubscription?.currentPlan || 'current'} features until then, then automatically switch to Free plan.`;
      }
      
      toast({
        title: "Subscription Canceled", 
        description: cancellationMessage,
        duration: 8000,
      });
      // Refresh subscription data
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
    },
    onError: (error: any) => {
      console.error('Cancel error:', error);
      toast({
        title: "Cancellation Failed",
        description: error.message || "Failed to cancel subscription. Please try again.",
        variant: "destructive",
      });
    }
  });

  const downgradeSubscriptionMutation = useMutation({
    mutationFn: async (targetPlan: string) => {
      const response = await apiRequest('POST', '/api/subscriptions/downgrade', {
        targetPlan
      });
      return response.json();
    },
    onSuccess: (data) => {
      const message = data?.type === 'downgrade_scheduled'
        ? `Your plan will be downgraded to ${targetDowngradePlan} at the end of your current billing period. You'll keep all current features until then.`
        : `Your subscription has been successfully downgraded to ${targetDowngradePlan}.`;
        
      toast({
        title: "Plan Downgrade Scheduled",
        description: message,
        duration: 8000,
      });
      // Refresh subscription data
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
      setShowDowngradeModal(false);
    },
    onError: (error: any) => {
      console.error('Downgrade error:', error);
      toast({
        title: "Downgrade Failed", 
        description: error.message || "Failed to downgrade subscription. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handlePlanSelection = async (plan: SubscriptionPlan) => {
    const currentPlan = currentSubscription?.currentPlan || 'free';
    
    // Check if user is selecting their current plan
    if (isCurrentPlan(plan.planId)) {
      toast({
        title: "Current Plan",
        description: `You're already subscribed to the ${plan.name} plan.`,
      });
      return;
    }
    
    // Define plan hierarchy for upgrade/downgrade detection
    const planHierarchy = { 'free': 0, 'standard': 1, 'premium': 2 };
    const currentPlanLevel = planHierarchy[currentPlan as keyof typeof planHierarchy] || 0;
    const targetPlanLevel = planHierarchy[plan.planId as keyof typeof planHierarchy] || 0;
    
    // Handle downgrades (moving to a lower tier)
    if (targetPlanLevel < currentPlanLevel) {
      setTargetDowngradePlan(plan.planId);
      setShowDowngradeModal(true);
      return;
    }
    
    // Handle free plan selection for users already on free
    if (!plan.stripePriceId && currentPlan === 'free') {
      toast({
        title: "Free Plan Active",
        description: "You're already on the free plan with basic features.",
      });
      return;
    }
    
    // Handle upgrades - proceed with checkout/subscription update
    if (plan.stripePriceId) {
      createCheckoutMutation.mutate(plan.stripePriceId);
    }
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'free': return <CheckIcon className="w-6 h-6" />;
      case 'standard': return <StarIcon className="w-6 h-6" />;
      case 'premium': return <CrownIcon className="w-6 h-6" />;
      default: return <CheckIcon className="w-6 h-6" />;
    }
  };

  const getPlanColor = (planId: string) => {
    switch (planId) {
      case 'free': return 'bg-gray-50 border-gray-200';
      case 'standard': return 'bg-blue-50 border-blue-200';
      case 'premium': return 'bg-purple-50 border-purple-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const formatLimit = (limit: number) => {
    return limit === -1 ? 'Unlimited' : limit.toString();
  };

  const isCurrentPlan = (planId: string) => {
    return currentSubscription?.currentPlan === planId;
  };

  if (plansLoading || subscriptionLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-gray-600">Loading subscription plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Choose Your Subscription Plan
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Scale your wholesale business with the right features for your needs. 
          Upgrade or downgrade anytime.
        </p>
      </div>

      {/* Current Plan Status */}
      {currentSubscription && (
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-full">
            <CheckIcon className="w-4 h-4" />
            Current Plan: {currentSubscription.currentPlan?.toUpperCase() || 'FREE'}
          </div>
        </div>
      )}

      {/* Usage Overview */}
      {planLimits && (
        <div className="mb-8 p-6 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Your Current Usage</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {planLimits.usage.products}
              </div>
              <div className="text-sm text-gray-600">
                Products ({formatLimit(planLimits.limits.products)} limit)
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: `${Math.min(planLimits.percentUsed.products, 100)}%` }}
                />
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {planLimits.usage.broadcasts}
              </div>
              <div className="text-sm text-gray-600">
                Broadcasts this month ({formatLimit(planLimits.limits.broadcasts)} limit)
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ width: `${Math.min(planLimits.percentUsed.broadcasts, 100)}%` }}
                />
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {planLimits.usage.teamMembers}
              </div>
              <div className="text-sm text-gray-600">
                Team Members ({formatLimit(planLimits.limits.teamMembers)} limit)
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full" 
                  style={{ width: `${Math.min(planLimits.percentUsed.teamMembers, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        {plans.map((plan: SubscriptionPlan) => (
          <Card 
            key={plan.id} 
            className={clsx(
              'relative transition-all duration-200',
              getPlanColor(plan.planId),
              {
                // Current plan styling - prominent green highlighting
                'ring-4 ring-green-500 bg-green-50 scale-[1.02] shadow-lg border-green-200': isCurrentPlan(plan.planId),
                // Standard plan gets special treatment when not current plan
                'scale-105 shadow-lg hover:scale-[1.07]': !isCurrentPlan(plan.planId) && plan.planId === 'standard',
                // Default hover effect for non-current plans
                'hover:scale-[1.02]': !isCurrentPlan(plan.planId) && plan.planId !== 'standard'
              }
            )}
          >
            {isCurrentPlan(plan.planId) && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-green-600 text-white px-3 py-1 text-sm font-semibold">
                  ✅ Current Plan
                </Badge>
              </div>
            )}
            {!isCurrentPlan(plan.planId) && plan.planId === 'standard' && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
              </div>
            )}

            <CardHeader className="text-center">
              <div className={`mx-auto mb-4 p-3 rounded-full ${
                plan.planId === 'free' ? 'bg-gray-200 text-gray-600' :
                plan.planId === 'standard' ? 'bg-blue-200 text-blue-600' :
                'bg-purple-200 text-purple-600'
              }`}>
                {getPlanIcon(plan.planId)}
              </div>
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription className="text-base">
                {plan.description}
              </CardDescription>
              <div className="mt-4">
                <div className="text-4xl font-bold">
                  £{parseFloat(plan.monthlyPrice).toFixed(2)}
                </div>
                <div className="text-gray-600">per month</div>
              </div>
            </CardHeader>

            <CardContent>
              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <CheckIcon className="w-4 h-4 text-green-500 mt-1 mr-3 flex-shrink-0" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2 mb-6 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Products:</span>
                  <span className="font-medium">{formatLimit(plan.limits.products)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Monthly Broadcasts:</span>
                  <span className="font-medium">{formatLimit(plan.limits.broadcasts)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Team Members:</span>
                  <span className="font-medium">{formatLimit(plan.limits.teamMembers)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => handlePlanSelection(plan)}
                  disabled={createCheckoutMutation.isPending || isCurrentPlan(plan.planId)}
                  className={`w-full ${
                    plan.planId === 'standard' ? 'bg-blue-600 hover:bg-blue-700' :
                    plan.planId === 'premium' ? 'bg-purple-600 hover:bg-purple-700' :
                    'bg-gray-600 hover:bg-gray-700'
                  }`}
                  variant={isCurrentPlan(plan.planId) ? "outline" : "default"}
                >
                  {isCurrentPlan(plan.planId) ? (
                    'Current Plan'
                  ) : createCheckoutMutation.isPending ? (
                    'Processing...'
                  ) : plan.planId === 'free' ? (
                    'Get Started Free'
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </Button>


                {/* Cancel/Downgrade Button - Only show for current paid plans */}
                {isCurrentPlan(plan.planId) && plan.planId !== 'free' && (
                  <Button
                    onClick={() => {
                      setTargetDowngradePlan('free');
                      setShowDowngradeModal(true);
                    }}
                    disabled={cancelSubscriptionMutation.isPending}
                    variant="outline"
                    className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    {cancelSubscriptionMutation.isPending ? (
                      'Processing...'
                    ) : (
                      'Cancel Subscription'
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FAQ Section */}
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2">Can I change plans anytime?</h3>
            <p className="text-gray-600">
              Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, 
              and we'll handle pro-rated billing automatically.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">What happens if I exceed my limits?</h3>
            <p className="text-gray-600">
              You'll be notified when approaching limits. If you exceed your plan's limits, 
              you'll need to upgrade to continue using those features.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Is there a long-term commitment?</h3>
            <p className="text-gray-600">
              No, all plans are month-to-month with no long-term commitment. 
              Cancel anytime and keep access until the end of your billing period.
            </p>
          </div>
        </div>
      </div>

      {/* Downgrade Confirmation Modal */}
      <DowngradeConfirmationModal
        open={showDowngradeModal}
        onOpenChange={setShowDowngradeModal}
        currentPlan={currentSubscription?.currentPlan || 'free'}
        targetPlan={targetDowngradePlan}
        onConfirmDowngrade={() => {
          if (targetDowngradePlan === 'free') {
            cancelSubscriptionMutation.mutate();
          } else {
            downgradeSubscriptionMutation.mutate(targetDowngradePlan);
          }
        }}
        isLoading={cancelSubscriptionMutation.isPending || downgradeSubscriptionMutation.isPending}
        billingInfo={{
          currentPeriodEnd: currentSubscription?.subscription?.current_period_end,
          daysRemaining: currentSubscription?.subscription?.current_period_end 
            ? Math.ceil((currentSubscription.subscription.current_period_end * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
            : undefined
        }}
      />
    </div>
  );
}