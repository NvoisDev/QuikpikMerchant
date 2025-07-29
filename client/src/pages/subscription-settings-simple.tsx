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
  const { user, refetch: refetchAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'standard' | 'premium'>('free');

  const { data: products = [] } = useQuery({
    queryKey: ['/api/products'],
    enabled: !!user,
  });

  const productCount = products.length;

  const getPlanChangeAction = (targetPlan: string) => {
    const planHierarchy = { free: 0, standard: 1, premium: 2 };
    const currentPlan = user?.subscriptionTier || 'free';
    
    if (!planHierarchy.hasOwnProperty(targetPlan) || !planHierarchy.hasOwnProperty(currentPlan)) {
      return 'upgrade'; // Default to upgrade if unknown plan
    }
    
    return planHierarchy[targetPlan as keyof typeof planHierarchy] > planHierarchy[currentPlan as keyof typeof planHierarchy] ? 'upgrade' : 'downgrade';
  };

  const handlePlanChangeClick = (plan: 'free' | 'standard' | 'premium') => {
    if (plan === (user?.subscriptionTier || 'free')) {
      return; // Same plan, do nothing
    }
    
    setSelectedPlan(plan);
    setShowConfirmModal(true);
  };

  const planChangeMutation = useMutation({
    mutationFn: async ({ plan }: { plan: string }) => {
      const response = await apiRequest('POST', '/api/subscription/change-plan', { plan });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
      refetchAuth();
    },
  });

  const confirmPlanChange = async () => {
    setProcessing(true);
    
    try {
      const action = getPlanChangeAction(selectedPlan);
      
      if (action === 'upgrade' && selectedPlan !== 'free') {
        // For upgrades, redirect to Stripe Checkout
        const response = await apiRequest('POST', '/api/create-subscription', {
          plan: selectedPlan
        });
        
        if (response.url) {
          window.location.href = response.url;
          return;
        }
      }
      
      // For downgrades or free plan changes, update directly
      await planChangeMutation.mutateAsync({ plan: selectedPlan });
      
      toast({
        title: "Plan Updated",
        description: `Successfully ${action}d to ${selectedPlan} plan.`,
      });
      
      setShowConfirmModal(false);
    } catch (error: any) {
      console.error('Plan change error:', error);
      toast({
        title: "Plan Change Failed",
        description: error.message || `Failed to ${getPlanChangeAction(selectedPlan)} to ${selectedPlan} plan.`,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
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