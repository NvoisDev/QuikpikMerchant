import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSidebarPermissions } from '@/hooks/useSidebarPermissions';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckIcon, AlertTriangleIcon, CreditCard, Loader2 } from 'lucide-react';
import { DowngradeConfirmationModal } from '@/components/subscription/DowngradeConfirmationModal';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import clsx from 'clsx';
import PageHeader from '@/components/PageHeader';
import { getBaseTier } from '@/lib/planUtils';

interface SubscriptionPlan {
  id: string;
  name: string;
  planId: string;
  stripePriceId: string | null;
  monthlyPrice: string;
  currency: string;
  description: string;
  features: string[];
  billingInterval: string | null;
  limits: {
    products: number;
    broadcasts: number;
    teamMembers: number;
    customGroups: number;
    priceLists: number;
  };
  sortOrder: number;
}

interface CurrentSubscription {
  user: any;
  subscription: any;
  plan: SubscriptionPlan | null;
  currentPlan: string;
  subscriptionStatus: string;
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
}

export default function SubscriptionPricing() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { checkTabAccess, permissionsLoading } = useSidebarPermissions();
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [targetDowngradePlan, setTargetDowngradePlan] = useState<string>('free');
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [showUpgradeWarningModal, setShowUpgradeWarningModal] = useState(false);
  const [pendingUpgrade, setPendingUpgrade] = useState<{ priceId: string; planName: string; planId: string } | null>(null);
  const [billingMode, setBillingMode] = useState<'monthly' | 'annual'>('monthly');
  const [isBillingPortalLoading, setIsBillingPortalLoading] = useState(false);

  const openBillingPortal = async () => {
    setIsBillingPortalLoading(true);
    try {
      const response = await apiRequest('POST', '/api/subscriptions/billing-portal');
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch {
      toast({ title: 'Error', description: 'Could not open billing portal. Please try again.', variant: 'destructive' });
      setIsBillingPortalLoading(false);
    }
  };

  useEffect(() => {
    if (permissionsLoading) return;
    if (user?.role === 'team_member' && !checkTabAccess('subscription')) {
      toast({
        title: "Access restricted",
        description: "You don't have permission to view the Subscription page.",
        variant: "destructive",
      });
      setLocation('/');
    }
  }, [user, permissionsLoading, checkTabAccess, toast, setLocation]);

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

  // Get plan limits and usage — always fresh so limits reflect the current plan immediately
  const { data: planLimits, isLoading: limitsLoading } = useQuery<{
    usage: { products: number; broadcasts: number; teamMembers: number; priceLists: number };
    limits: { products: number; broadcasts: number; teamMembers: number; priceLists: number };
    percentUsed: { products: number; broadcasts: number; teamMembers: number; priceLists: number };
    plan: string;
  }>({
    queryKey: ['/api/subscriptions/plan-limits'],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: true,
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
        window.location.href = data.url;
      } else if (data.type === 'upgrade' && data.success) {
        const planName = data.newPlan
          ? data.newPlan.charAt(0).toUpperCase() + data.newPlan.slice(1)
          : 'new';
        const hadCancellation = !!pendingUpgrade;
        toast({
          title: "Plan Upgraded!",
          description: hadCancellation
            ? `You're now on the ${planName} plan. Your scheduled cancellation has been removed and your new features are active immediately.`
            : `You're now on the ${planName} plan. Your new features are active immediately.`,
          duration: hadCancellation ? 8000 : 5000,
        });
        setPendingUpgrade(null);
        queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
        queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/plan-limits'] });
        setProcessingPlanId(null);
      } else {
        setProcessingPlanId(null);
      }
    },
    onError: (error) => {
      console.error('Checkout error:', error);
      toast({
        title: "Payment Error",
        description: "There was an issue processing your payment. Please check your payment method and try again, or contact support.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always clear after a short delay — handles the case where navigation fails
      // after a successful redirect URL response so the button never stays stuck
      setTimeout(() => setProcessingPlanId(null), 3000);
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
      // Refresh subscription data — invalidate both so plan badge AND usage bars update immediately
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/plan-limits'] });
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
      const message = `Your subscription has been successfully downgraded to ${targetDowngradePlan}. Changes are active immediately and any unused time has been credited to your account.`;
        
      toast({
        title: "Plan Downgraded Successfully",
        description: message,
        duration: 8000,
      });
      // Refresh subscription data — invalidate both so plan badge AND usage bars update immediately
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/plan-limits'] });
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
    
    // Plan hierarchy for upgrade/downgrade detection
    const planHierarchy: Record<string, number> = {
      'listing': 0, 'listing_annual_intro': 0, 'listing_annual': 0,
      'free': 1, 'starter': 1, 'starter_annual_intro': 1, 'starter_annual': 1,
      'standard': 2, 'standard_annual_intro': 2, 'standard_annual': 2,
      'premium': 3, 'premium_annual_intro': 3, 'premium_annual': 3,
    };
    const currentPlanLevel = planHierarchy[currentPlan] ?? 1;
    const targetPlanLevel = planHierarchy[plan.planId] ?? 1;
    
    // Handle downgrades (moving to a lower tier)
    if (targetPlanLevel < currentPlanLevel) {
      setTargetDowngradePlan(plan.planId);
      setShowDowngradeModal(true);
      return;
    }
    
    // Handle plans with no Stripe price (Listing or legacy free)
    if (!plan.stripePriceId && (currentPlan === 'free' || currentPlan === 'listing')) {
      toast({
        title: "Current Plan Active",
        description: `You're already on the ${plan.name} plan.`,
      });
      return;
    }
    
    // Handle upgrades - proceed with checkout/subscription update
    if (plan.stripePriceId) {
      if (isCancellationScheduled) {
        setPendingUpgrade({ priceId: plan.stripePriceId, planName: plan.name, planId: plan.planId });
        setShowUpgradeWarningModal(true);
        return;
      }
      setProcessingPlanId(plan.planId);
      createCheckoutMutation.mutate(plan.stripePriceId);
    }
  };

  const handleConfirmUpgrade = () => {
    if (!pendingUpgrade) return;
    setShowUpgradeWarningModal(false);
    setProcessingPlanId(pendingUpgrade.planId);
    createCheckoutMutation.mutate(pendingUpgrade.priceId);
  };

  // Derive the base tier from a planId (strips _annual_intro / _annual suffix) — uses shared helper
  const getPlanBaseTier = (planId: string) => getBaseTier(planId);

  const getPlanIcon = (planId: string) => {
    const tier = getPlanBaseTier(planId);
    if (tier === 'listing') return (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="20" cy="20" r="18" stroke="#6b7280" strokeWidth="1.5"/>
        <path d="M14 20h12M20 14v12" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="20" cy="20" r="4" stroke="#6b7280" strokeWidth="1.5"/>
      </svg>
    );
    if (tier === 'starter') return (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M20 34V20" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M20 20C20 20 14 16 14 10C14 10 20 8 24 14C24 14 26 10 30 11C30 11 30 16 24 18" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20 26C20 26 16 23 12 24" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
    if (tier === 'standard') return (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M20 34V16" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M20 16C20 16 13 11 12 6C12 6 19 4 22 10" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20 24C20 24 25 20 29 22" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M20 20C20 20 15 16 11 18" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M20 16C20 16 25 12 29 9" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
    return (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M10 28H30" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M10 28L8 16L15 20L20 10L25 20L32 16L30 28" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="8" cy="16" r="2" stroke="#f59e0b" strokeWidth="1.5"/>
        <circle cx="20" cy="10" r="2" stroke="#f59e0b" strokeWidth="1.5"/>
        <circle cx="32" cy="16" r="2" stroke="#f59e0b" strokeWidth="1.5"/>
      </svg>
    );
  };

  // Annual savings vs monthly equivalent
  const getAnnualSavings = (plan: SubscriptionPlan): { pct: number; amount: number } | null => {
    if (plan.billingInterval !== 'yearly') return null;
    const tier = getPlanBaseTier(plan.planId);
    const monthlyEquivMap: Record<string, number> = {
      listing: 19.99,
      starter: 29.99,
      standard: 49.99,
      premium: 99.99,
    };
    const monthlyEquiv = monthlyEquivMap[tier] ?? null;
    if (!monthlyEquiv) return null;
    const monthlyTotal = monthlyEquiv * 12;
    const annualPrice = parseFloat(plan.monthlyPrice);
    const amount = monthlyTotal - annualPrice;
    const pct = Math.round((amount / monthlyTotal) * 100);
    return { pct, amount };
  };

  // Plans to show depending on billing mode.
  // Monthly: listing, starter, standard, premium (exclude legacy 'free' from display)
  // Annual:  annual variants of the four tiers
  const visiblePlans = plans.filter((p: SubscriptionPlan) => {
    const isAnnual = p.billingInterval === 'yearly';
    if (p.planId === 'free') return false; // legacy — never shown on pricing page
    if (billingMode === 'monthly') return !isAnnual;
    if (billingMode === 'annual') return isAnnual;
    return true;
  });

  const formatLimit = (limit: number) => {
    return limit === -1 ? 'Unlimited' : limit.toString();
  };

  const formatPlanFeature = (feature: string) => {
    return feature.toLowerCase().includes('broadcast') ? 'Broadcast tools coming soon' : feature;
  };

  const isCurrentPlan = (planId: string) => {
    return currentSubscription?.currentPlan === planId;
  };

  const isCancellationScheduled = !!currentSubscription?.subscription?.cancelAtPeriodEnd;
  const cancellationEndDate = currentSubscription?.user?.subscriptionPeriodEnd
    ? new Date(currentSubscription.user.subscriptionPeriodEnd)
    : null;

  if (plansLoading || subscriptionLoading) {
    return (
      <div className="bg-white min-h-screen">
        <PageHeader title="Subscription" description="Manage your plan and billing" />
        <div className="px-4 py-8 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-gray-600">Loading subscription plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <PageHeader title="Subscription" description="Manage your plan and billing" />
      <div className="px-4 py-6 max-w-4xl mx-auto">

      {/* Current Plan Status */}
      {currentSubscription && (
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-full">
            <CheckIcon className="w-4 h-4" />
            Current Plan: {currentSubscription.currentPlan === 'free'
              ? 'STARTER'
              : (currentSubscription.currentPlan?.toUpperCase() || 'LISTING')}
          </div>
        </div>
      )}

      {/* Billing Information Section — shown for paid plans */}
      {currentSubscription && currentSubscription.currentPlan !== 'free' && currentSubscription.currentPlan !== 'listing' && (
        <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 0V5a2 2 0 012-2h0a2 2 0 012 2v2M8 7V5a2 2 0 012-2h0a2 2 0 012 2v2m-6 0h8m-8 0H6a2 2 0 00-2 2v0a2 2 0 002 2v0M16 7h2a2 2 0 012 2v0a2 2 0 01-2 2v0" />
            </svg>
            Billing Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Next Billing Date */}
            {currentSubscription.user?.subscriptionPeriodEnd && !currentSubscription.subscription?.cancelAtPeriodEnd && (
              <div className="bg-white p-4 rounded-lg border border-blue-100">
                <div className="text-sm text-blue-600 font-medium mb-1">Next Billing Date</div>
                <div className="text-lg font-semibold text-gray-900">
                  {new Date(currentSubscription.user.subscriptionPeriodEnd).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {(() => {
                    const nextBilling = new Date(currentSubscription.user.subscriptionPeriodEnd);
                    const today = new Date();
                    const daysUntil = Math.ceil((nextBilling.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    return daysUntil > 0 ? `${daysUntil} days away` : 'Today';
                  })()}
                </div>
              </div>
            )}

            {/* Current Period */}
            {currentSubscription.user?.subscriptionPeriodStart && currentSubscription.user?.subscriptionPeriodEnd && (
              <div className="bg-white p-4 rounded-lg border border-blue-100">
                <div className="text-sm text-blue-600 font-medium mb-1">Current Billing Period</div>
                <div className="text-sm text-gray-700">
                  {new Date(currentSubscription.user.subscriptionPeriodStart).toLocaleDateString('en-GB', {
                    month: 'short',
                    day: 'numeric'
                  })} – {new Date(currentSubscription.user.subscriptionPeriodEnd).toLocaleDateString('en-GB', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {currentSubscription.plan?.billingInterval === 'yearly' ? 'Annual subscription' : 'Monthly subscription'}
                  {currentSubscription.subscription?.isCustomPricing && (
                    <span className="ml-2 inline-flex items-center bg-violet-100 text-violet-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      Custom pricing
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Payment method + Manage Billing */}
          {(() => {
            const pm = currentSubscription.paymentMethod;
            const isPastDue = currentSubscription.subscriptionStatus === 'past_due';
            const isExpiringSoon = pm
              ? new Date(pm.expYear, pm.expMonth - 1) <= new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
              : false;
            return (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  {pm ? (
                    <p className="text-sm text-gray-600 flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-gray-400" />
                      <span className="capitalize">{pm.brand}</span> ending in {pm.last4}
                      &nbsp;·&nbsp;expires {pm.expMonth}/{pm.expYear}
                      {isExpiringSoon && (
                        <Badge variant="outline" className="ml-1 text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">
                          Expiring soon
                        </Badge>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" /> Payment method on file
                    </p>
                  )}
                  {isPastDue && (
                    <p className="text-sm text-red-600 flex items-center gap-1.5">
                      <AlertTriangleIcon className="h-3.5 w-3.5" />
                      Payment failed — update your card to avoid interruption
                    </p>
                  )}
                </div>
                {user?.role === 'team_member' ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0 border border-gray-200 rounded-md px-3 py-1.5">
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                    Owner only
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openBillingPortal}
                    disabled={isBillingPortalLoading}
                    className="text-sm font-medium shrink-0"
                  >
                    {isBillingPortalLoading ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Opening…</>
                    ) : (
                      <><CreditCard className="h-3.5 w-3.5 mr-1.5" />Manage Billing</>
                    )}
                  </Button>
                )}
              </div>
            );
          })()}

          {/* Downgrade pending — subscription ends at period end */}
          {currentSubscription.subscription?.cancelAtPeriodEnd && currentSubscription.user?.subscriptionPeriodEnd && (
            <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0">
                  <svg fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-orange-800 mb-1">Downgrade Scheduled</div>
                  <div className="text-sm text-orange-700">
                    Your {currentSubscription.currentPlan} plan ends on{' '}
                    <strong>
                      {new Date(currentSubscription.user.subscriptionPeriodEnd).toLocaleDateString('en-GB', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </strong>
                    {(() => {
                      const endDate = new Date(currentSubscription.user.subscriptionPeriodEnd);
                      const daysRemaining = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      return daysRemaining > 0 ? ` — ${daysRemaining} days remaining` : '';
                    })()}
                  </div>
                  <div className="text-xs text-orange-600 mt-2">
                    You keep all {currentSubscription.currentPlan} features until then, then your account automatically switches to the Listing plan.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Free/Listing plan — billing card */}
      {currentSubscription && (currentSubscription.currentPlan === 'free' || currentSubscription.currentPlan === 'listing') && (
        <div className="mb-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gray-500" />
            Billing
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {currentSubscription.currentPlan === 'free'
              ? "You're on the Starter plan (grandfathered). Upgrade to Standard or Premium to unlock more products, team members, and advanced tools."
              : "You're on the Listing plan. Upgrade to Starter or above to unlock invoices, payments, order management, and customer tools."}
          </p>
          {currentSubscription.user?.subscriptionPeriodEnd && (
            <div className="mb-4 p-3 bg-white border border-gray-200 rounded-md flex items-start gap-2.5 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              <span>
                Your paid subscription ended on{' '}
                <strong>
                  {new Date(currentSubscription.user.subscriptionPeriodEnd).toLocaleDateString('en-GB', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                  })}
                </strong>
                . Upgrade any time to restore full access.
              </span>
            </div>
          )}
          {user?.role === 'team_member' ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 border border-gray-200 rounded-md px-3 py-1.5 w-fit">
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
              Only the account owner can upgrade
            </div>
          ) : (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                const firstPaidPlan = document.getElementById('plan-grid');
                firstPaidPlan?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              View plans
            </Button>
          )}
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
                {planLimits.usage.priceLists}
              </div>
              <div className="text-sm text-gray-600">
                Price Lists ({formatLimit(planLimits.limits.priceLists)} limit)
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ width: `${Math.min(planLimits.percentUsed.priceLists, 100)}%` }}
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

      {/* Billing Mode Toggle */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center bg-gray-100 rounded-full p-1 gap-1">
          <button
            onClick={() => setBillingMode('monthly')}
            className={clsx(
              'px-5 py-2 rounded-full text-sm font-medium transition-all',
              billingMode === 'monthly'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingMode('annual')}
            className={clsx(
              'px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2',
              billingMode === 'annual'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Annual
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              Save 16%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Plans */}
      <div id="plan-grid" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-12 items-start">
        {visiblePlans.map((plan: SubscriptionPlan) => {
          const savings = getAnnualSavings(plan);
          const isAnnual = plan.billingInterval === 'yearly';
          const price = parseFloat(plan.monthlyPrice);
          const tier = getPlanBaseTier(plan.planId);
          const isCurrent = isCurrentPlan(plan.planId) ||
            (plan.planId === 'starter' && (currentSubscription?.currentPlan === 'free'));
          const isMostPopular = !isCurrent && (plan.planId === 'standard' || plan.planId === 'standard_annual_intro' || plan.planId === 'standard_annual');
          const isListingTier = tier === 'listing';

          // Tier accent colours
          const accentColor = isCurrent
            ? 'bg-green-500'
            : tier === 'listing'
              ? 'bg-gray-300'
              : tier === 'starter'
                ? 'bg-blue-400'
                : tier === 'standard'
                  ? 'bg-emerald-500'
                  : 'bg-amber-400';

          const ctaColor = isCurrent
            ? ''
            : tier === 'listing'
              ? 'bg-gray-700 hover:bg-gray-800 text-white'
              : tier === 'starter'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : tier === 'standard'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white';

          return (
            <Card
              key={plan.id}
              className={clsx(
                'relative flex flex-col border transition-all duration-200 overflow-hidden',
                {
                  'border-green-400 shadow-md bg-green-50': isCurrent,
                  'border-emerald-300 shadow-md': isMostPopular && !isCurrent,
                  'border-gray-200 hover:shadow-md': !isCurrent && !isMostPopular,
                }
              )}
            >
              {/* Coloured top accent bar */}
              <div className={`h-1 w-full ${accentColor}`} />

              {/* Status / popularity ribbon */}
              {(isCurrent || isMostPopular || isListingTier) && (
                <div className="flex justify-center pt-3">
                  {isCurrent ? (
                    <Badge className="bg-green-600 text-white px-3 py-0.5 text-xs font-semibold">
                      ✅ Current Plan
                    </Badge>
                  ) : isMostPopular ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-0.5 text-xs font-semibold">
                      Most Popular
                    </Badge>
                  ) : isListingTier ? (
                    <Badge className="bg-green-100 text-green-700 border border-green-200 px-3 py-0.5 text-xs font-semibold">
                      🎉 Free for 3 months
                    </Badge>
                  ) : null}
                </div>
              )}

              <CardContent className={clsx('flex flex-col flex-1 px-5 pb-6', isCurrent || isMostPopular || isListingTier ? 'pt-3' : 'pt-6')}>
                {/* 1. Illustrated icon */}
                <div className="mb-3">
                  {getPlanIcon(plan.planId)}
                </div>

                {/* 2. Plan name + description */}
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-gray-900">{plan.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{plan.description}</p>
                </div>

                {/* 3. Price */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-gray-900">
                      £{price.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-gray-400 text-xs ml-1">
                      {isAnnual ? '/ year' : '/ month'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {isAnnual && savings
                      ? `Save £${savings.amount.toFixed(0)} vs monthly`
                      : isListingTier
                        ? 'Free intro — then £19.99/mo'
                        : 'Billed monthly'}
                  </p>
                </div>

                {/* 4. CTA Button */}
                <div className="space-y-2 mb-5">
                  <Button
                    onClick={() => handlePlanSelection(plan)}
                    disabled={processingPlanId === plan.planId || isCurrent}
                    className={clsx('w-full whitespace-normal h-auto py-2 text-sm font-medium', ctaColor)}
                    variant={isCurrent ? 'outline' : 'default'}
                  >
                    {isCurrent
                      ? 'Current Plan'
                      : processingPlanId === plan.planId
                        ? 'Processing...'
                        : isListingTier
                          ? 'Get Listed Free'
                          : `Upgrade to ${plan.name}`}
                  </Button>

                  {/* Cancel/Downgrade — only shown on the current paid plan card */}
                  {isCurrent && plan.planId !== 'free' && plan.planId !== 'listing' && (
                    isCancellationScheduled ? (
                      <div className="space-y-1.5">
                        <Button
                          disabled
                          variant="outline"
                          className="w-full text-amber-700 border-amber-300 bg-amber-50 cursor-not-allowed opacity-100 text-xs"
                        >
                          ✓ Cancellation Scheduled
                        </Button>
                        {cancellationEndDate && (
                          <p className="text-xs text-center text-amber-700 leading-snug">
                            Listing plan begins{' '}
                            <strong>
                              {cancellationEndDate.toLocaleDateString('en-GB', {
                                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                              })}
                            </strong>
                          </p>
                        )}
                      </div>
                    ) : (
                      <Button
                        onClick={() => {
                          setTargetDowngradePlan('listing');
                          setShowDowngradeModal(true);
                        }}
                        disabled={cancelSubscriptionMutation.isPending}
                        variant="outline"
                        className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs"
                      >
                        {cancelSubscriptionMutation.isPending ? 'Processing...' : 'Cancel Subscription'}
                      </Button>
                    )
                  )}
                </div>

                {/* 5. Feature list */}
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <svg className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="text-xs text-gray-600 leading-snug">{formatPlanFeature(feature)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
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

      {/* Upgrade Warning Modal — shown when a cancellation is scheduled */}
      <Dialog open={showUpgradeWarningModal} onOpenChange={(open) => {
        setShowUpgradeWarningModal(open);
        if (!open) setPendingUpgrade(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangleIcon className="h-5 w-5 text-amber-500" />
              Upgrade Will Remove Scheduled Cancellation
            </DialogTitle>
            <DialogDescription>
              You currently have a cancellation scheduled for the end of your billing period. Upgrading to the{' '}
              <strong>{pendingUpgrade?.planName}</strong> plan will remove that cancellation and recommit you to your subscription.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">What happens when you upgrade:</p>
            <ul className="space-y-1 text-xs">
              <li>• Your scheduled cancellation will be cancelled immediately</li>
              <li>• You will move to the {pendingUpgrade?.planName} plan straight away</li>
              <li>• Your subscription will continue to renew each billing period</li>
            </ul>
          </div>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowUpgradeWarningModal(false);
                setPendingUpgrade(null);
              }}
              className="flex-1"
            >
              Keep Cancellation
            </Button>
            <Button
              onClick={handleConfirmUpgrade}
              disabled={createCheckoutMutation.isPending}
              className="flex-1"
            >
              {createCheckoutMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Processing...
                </div>
              ) : (
                `Upgrade to ${pendingUpgrade?.planName}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}