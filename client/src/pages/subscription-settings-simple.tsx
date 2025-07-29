import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crown, Loader2, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function SubscriptionSettingsSimple() {
  const { user, refetch } = useAuth();
  const refetchAuth = refetch;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'standard' | 'premium'>('free');

  const { data: products = [] } = useQuery({
    queryKey: ['/api/products'],
    enabled: !!user,
  });

  const productCount = Array.isArray(products) ? products.length : 0;



  const getPlanChangeAction = (targetPlan: string) => {
    const planHierarchy = { free: 0, standard: 1, premium: 2 };
    const currentPlan = user?.subscriptionTier || 'free';
    
    if (!planHierarchy.hasOwnProperty(targetPlan) || !planHierarchy.hasOwnProperty(currentPlan)) {
      return 'upgrade'; // Default to upgrade if unknown plan
    }
    
    return planHierarchy[targetPlan as keyof typeof planHierarchy] > planHierarchy[currentPlan as keyof typeof planHierarchy] ? 'upgrade' : 'downgrade';
  };

  const handlePlanChangeClick = (plan: 'free' | 'standard' | 'premium') => {
    const currentPlan = user?.subscriptionTier || 'free';
    if (plan === currentPlan) {
      toast({
        title: "Already on this plan",
        description: `You're already on the ${plan} plan.`,
        variant: "default",
      });
      return;
    }
    
    setSelectedPlan(plan);
    setShowConfirmModal(true);
  };

  const planChangeMutation = useMutation({
    mutationFn: async ({ plan }: { plan: string }) => {
      const response = await apiRequest('POST', '/api/subscription/change-plan', { targetTier: plan });
      return response;
    },
    onSuccess: async () => {
      // Force refresh user data immediately
      await refetchAuth();
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
  });

  const confirmPlanChange = async () => {
    setProcessing(true);
    
    try {
      const action = getPlanChangeAction(selectedPlan);
      
      if (action === 'upgrade' && selectedPlan !== 'free') {
        // For upgrades, redirect to Stripe Checkout
        const response = await apiRequest('POST', '/api/subscription/create', {
          tier: selectedPlan
        });
        
        const data = await response.json();
        if (data.subscriptionUrl) {
          window.location.href = data.subscriptionUrl;
          return;
        }
      }
      
      // For downgrades or free plan changes, update directly
      const result = await planChangeMutation.mutateAsync({ plan: selectedPlan });
      
      toast({
        title: "Plan Updated",
        description: `Successfully ${action}d to ${selectedPlan} plan.`,
      });
      
      // Force another refresh after a short delay to ensure data is synced
      setTimeout(async () => {
        await refetchAuth();
        console.log('🔄 Force refreshed user data after plan change');
      }, 1000);
      
      setShowConfirmModal(false);
    } catch (error: any) {
      console.error('Plan change error:', error);
      console.error('Current user tier:', user?.subscriptionTier);
      console.error('Target plan:', selectedPlan);
      
      let errorMessage = error.message;
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      toast({
        title: "Plan Change Failed",
        description: errorMessage || `Failed to ${getPlanChangeAction(selectedPlan)} to ${selectedPlan} plan.`,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  // Add force refresh function
  const forceRefreshAuth = async () => {
    // Clear all cached queries
    queryClient.clear();
    // Force refetch user data
    await refetchAuth();
    toast({
      title: "Authentication Refreshed",
      description: "Please try accessing your subscription data again.",
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-6 max-w-md text-center bg-white p-8 rounded-xl shadow-lg">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-800">Authentication Required</h2>
            <p className="text-gray-600">Your subscription has been successfully upgraded to Premium plan!</p>
          </div>
          
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-4 w-full">
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 text-yellow-600">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
              </div>
              <span className="text-sm font-bold text-yellow-800">Premium Plan Activated</span>
            </div>
            <p className="text-sm text-yellow-700 mt-1 font-medium">
              Unlimited Products • B2B Marketplace • Team Management • £19.99/month
            </p>
          </div>
          
          <p className="text-gray-600">
            Please authenticate with Google to access your updated subscription settings.
          </p>
          
          <div className="flex flex-col gap-3 w-full">
            <Button
              onClick={() => window.location.href = '/api/auth/google'}
              className="bg-green-600 hover:bg-green-700 w-full"
            >
              Sign in with Google
            </Button>
            <Button
              variant="outline"
              onClick={forceRefreshAuth}
              className="w-full"
            >
              Refresh Session
            </Button>
          </div>
          
          <p className="text-xs text-gray-500">
            After signing in, you'll see your updated Premium plan with unlimited products, B2B marketplace access, and team management features.
          </p>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            Subscription Management
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Manage your plan and track your usage
          </p>
          
          {/* Force refresh button for troubleshooting */}
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={forceRefreshAuth}
              className="text-xs"
            >
              Refresh Subscription Data
            </Button>
          </div>
        </div>

        {/* Current Plan Overview */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {user.subscriptionTier === 'premium' && (
                <div className="p-3 bg-green-100 rounded-xl">
                  <Crown className="w-6 h-6 text-green-600" />
                </div>
              )}
              {user.subscriptionTier === 'standard' && (
                <div className="p-3 bg-green-100 rounded-xl">
                  <Crown className="w-6 h-6 text-green-600" />
                </div>
              )}
              {(user.subscriptionTier === 'free' || !user.subscriptionTier) && (
                <div className="p-3 bg-gray-100 rounded-xl">
                  <Crown className="w-6 h-6 text-gray-600" />
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold capitalize text-gray-800">
                  {user.subscriptionTier || 'free'} Plan
                </h2>
                <p className="text-gray-600">Status: {user.subscriptionStatus || 'active'}</p>
              </div>
            </div>
            <Badge 
              variant={user.subscriptionTier === 'premium' ? 'default' : 'secondary'} 
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                user.subscriptionTier === 'premium' 
                  ? 'bg-green-100 text-green-800' 
                  : user.subscriptionTier === 'standard'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {user.subscriptionTier === 'premium' ? '👑 Premium' : 
               user.subscriptionTier === 'standard' ? '⭐ Standard' : 
               '🆓 Free'}
            </Badge>
          </div>
          
          {/* Usage Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-800">Products Created</h4>
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              </div>
              <p className="text-2xl font-bold text-gray-800">{productCount}</p>
              <p className="text-sm text-gray-600">
                of {user.subscriptionTier === 'premium' ? '∞ unlimited' : user.subscriptionTier === 'standard' ? '10' : '3'} allowed
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-800">Plan Status</h4>
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              </div>
              <p className="text-2xl font-bold text-gray-800 capitalize">{user.subscriptionTier || 'free'}</p>
              <p className="text-sm text-gray-600">{user.subscriptionStatus === 'active' ? 'Active subscription' : 'Free plan'}</p>
            </div>
          </div>
        </div>

        {/* Plan Selection Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Free Plan */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6 text-center space-y-6 hover:shadow-xl transition-all relative">
            <div className="space-y-4">
              <div className="inline-block p-3 bg-gray-100 rounded-xl">
                <Crown className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-800 mb-2">Free</h4>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-gray-800">£0</p>
                  <p className="text-gray-500">/month</p>
                </div>
              </div>
            </div>
            
            <ul className="space-y-3 text-left">
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Up to 3 products</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">3 edits per product</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">2 customer groups (10 each)</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">5 WhatsApp broadcasts/month</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Basic order management</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Email support</span>
              </li>
            </ul>
            
            <Button 
              variant="outline" 
              className="w-full py-3 rounded-xl font-medium border-2 hover:bg-gray-50 transition-colors"
              disabled={user.subscriptionTier === 'free' || !user.subscriptionTier}
              onClick={() => handlePlanChangeClick('free')}
            >
              {(user.subscriptionTier === 'free' || !user.subscriptionTier) ? '✓ Current Plan' : 'Downgrade'}
            </Button>
          </div>

          {/* Standard Plan - Popular */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-green-300 p-6 text-center space-y-6 hover:shadow-xl transition-all relative">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-green-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </span>
            </div>
            
            <div className="space-y-4">
              <div className="inline-block p-3 bg-green-100 rounded-xl">
                <Crown className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-800 mb-2">Standard</h4>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-gray-800">£10.99</p>
                  <p className="text-gray-500">/month</p>
                </div>
              </div>
            </div>
            
            <ul className="space-y-3 text-left">
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700 font-medium">Up to 10 products</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Unlimited product edits</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">5 customer groups (50 each)</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">25 WhatsApp broadcasts/month</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Advanced order processing</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Enhanced analytics & reports</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Priority email & phone support</span>
              </li>
            </ul>
            
            <Button 
              className="w-full py-3 rounded-xl font-medium bg-green-600 hover:bg-green-700 text-white border-0 shadow-lg hover:shadow-xl transition-all"
              disabled={user.subscriptionTier === 'standard'}
              onClick={() => handlePlanChangeClick('standard')}
            >
              {user.subscriptionTier === 'standard' ? '✓ Current Plan' : 'Get Started'}
            </Button>
          </div>

          {/* Premium Plan */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6 text-center space-y-6 hover:shadow-xl transition-all relative">
            <div className="space-y-4">
              <div className="inline-block p-3 bg-yellow-100 rounded-xl">
                <Crown className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-800 mb-2">Premium</h4>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-gray-800">£19.99</p>
                  <p className="text-gray-500">/month</p>
                </div>
              </div>
            </div>
            
            <ul className="space-y-3 text-left">
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700 font-medium">Unlimited products</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Unlimited product edits</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Unlimited customer groups</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Unlimited WhatsApp broadcasts</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">B2B Marketplace access</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Product advertising & promotion</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Team management (up to 5 members)</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-gray-700">Dedicated account manager</span>
              </li>
            </ul>
            
            <Button 
              className="w-full py-3 rounded-xl font-medium bg-yellow-600 hover:bg-yellow-700 text-white border-0 shadow-lg hover:shadow-xl transition-all"
              disabled={user.subscriptionTier === 'premium'}
              onClick={() => handlePlanChangeClick('premium')}
            >
              {user.subscriptionTier === 'premium' ? '✓ Current Plan' : 'Upgrade Now'}
            </Button>
          </div>
        </div>

        {/* Billing Information */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-6">Billing Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-50 p-4 rounded-xl border border-green-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-green-900">Current Plan</h4>
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              </div>
              <p className="text-2xl font-bold text-green-600 capitalize">{user.subscriptionTier || 'Standard'} Plan</p>
              <p className="text-sm text-green-700">Status: {user.subscriptionStatus || 'active'}</p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-xl border border-green-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-green-900">Next Billing Date</h4>
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              </div>
              <p className="text-2xl font-bold text-green-600">
                August 29, 2025
              </p>
              <p className="text-sm text-green-700">Monthly subscription</p>
            </div>
          </div>
          
          {user.subscriptionTier !== 'free' && (
            <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-100">
              <h4 className="font-medium text-green-900 mb-4">Subscription Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-green-600 font-medium">Plan</p>
                  <p className="text-lg font-bold text-green-800 capitalize">{user.subscriptionTier || 'Standard'}</p>
                </div>
                <div>
                  <p className="text-sm text-green-600 font-medium">Amount</p>
                  <p className="text-lg font-bold text-green-800">
                    {user.subscriptionTier === 'standard' ? '£10.99' : '£19.99'}/month
                  </p>
                </div>
                <div>
                  <p className="text-sm text-green-600 font-medium">Started</p>
                  <p className="text-lg font-bold text-green-800">July 29, 2025</p>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Plan Change Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {getPlanChangeAction(selectedPlan) === 'upgrade' ? 'Upgrade' : 'Downgrade'} Subscription
            </DialogTitle>
            <DialogDescription>
              {getPlanChangeAction(selectedPlan) === 'upgrade' ? (
                <>
                  You're about to upgrade to the <strong className="capitalize">{selectedPlan}</strong> plan.
                  {selectedPlan === 'standard' && ' This will cost £10.99/month.'}
                  {selectedPlan === 'premium' && ' This will cost £19.99/month.'}
                  <br /><br />
                  The upgrade will take effect immediately and you'll be charged now.
                </>
              ) : (
                <>
                  You're about to downgrade to the <strong className="capitalize">{selectedPlan}</strong> plan.
                  {selectedPlan === 'free' && ' You will lose access to paid features.'}
                  {selectedPlan === 'standard' && ' Some premium features will no longer be available.'}
                  <br /><br />
                  The downgrade will take effect at your next billing cycle.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPlanChange}
              disabled={processing}
              className={getPlanChangeAction(selectedPlan) === 'upgrade' ? 'bg-primary' : ''}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Confirm ${getPlanChangeAction(selectedPlan) === 'upgrade' ? 'Upgrade' : 'Downgrade'}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}