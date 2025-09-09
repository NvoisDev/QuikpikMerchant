import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckIcon, XMarkIcon, StarIcon, CrownIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

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
  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['/api/subscriptions/plans'],
  });

  // Get current subscription
  const { data: currentSubscription, isLoading: subscriptionLoading } = useQuery<CurrentSubscription>({
    queryKey: ['/api/subscriptions/current'],
    enabled: !!user,
  });

  // Get plan limits and usage
  const { data: planLimits, isLoading: limitsLoading } = useQuery({
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

  const handlePlanSelection = async (plan: SubscriptionPlan) => {
    const currentPlan = currentSubscription?.currentPlan || 'free';
    
    if (!plan.stripePriceId) {
      // Free plan - check if user is already on free or downgrading
      if (currentPlan === 'free') {
        toast({
          title: "Free Plan Active",
          description: "You're already on the free plan with basic features.",
        });
        return;
      } else {
        // User is on Standard/Premium trying to downgrade to Free
        toast({
          title: "Downgrade to Free Plan",
          description: "To downgrade to Free, please cancel your current subscription first. Contact support for assistance.",
          variant: "default",
        });
        return;
      }
    }

    // Check if user is selecting their current plan
    if (isCurrentPlan(plan.planId)) {
      toast({
        title: "Current Plan",
        description: `You're already subscribed to the ${plan.name} plan.`,
      });
      return;
    }

    // Use mutation's built-in loading state and error handling
    createCheckoutMutation.mutate(plan.stripePriceId);
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
            className={`relative ${getPlanColor(plan.planId)} ${
              isCurrentPlan(plan.planId) ? 'ring-2 ring-primary' : ''
            } ${plan.planId === 'standard' ? 'scale-105 shadow-lg' : ''}`}
          >
            {plan.planId === 'standard' && (
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
    </div>
  );
}