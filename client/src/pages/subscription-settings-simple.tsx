import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Crown, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function SubscriptionSettingsSimple() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  // Get actual product count
  const { data: products = [] } = useQuery({
    queryKey: ['/api/products'],
    enabled: !!user,
  });

  const productCount = Array.isArray(products) ? products.length : 0;

  const handlePlanChangeClick = (planId: string) => {
    if (user?.subscriptionTier === planId) return; // Can't change to same plan
    setSelectedPlan(planId);
    setShowConfirmModal(true);
  };

  const confirmPlanChange = async () => {
    setProcessing(true);
    try {
      const response = await apiRequest("POST", "/api/subscription/change-plan", {
        targetTier: selectedPlan
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Plan change response:`, result);
        
        if (result.url) {
          // This is an upgrade - redirect to Stripe checkout
          toast({
            title: "Redirecting to Payment",
            description: "You'll be redirected to complete your upgrade payment.",
          });
          
          // Redirect to Stripe checkout
          window.location.href = result.url;
        } else if (result.success) {
          // This is a downgrade - show success message
          toast({
            title: "Plan Changed Successfully",
            description: `Your subscription has been updated to ${selectedPlan} plan.`,
          });

          // Refresh the page to show updated plan
          setTimeout(() => window.location.reload(), 1500);
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Plan change failed");
      }
    } catch (error) {
      console.error("Plan change error:", error);
      toast({
        title: "Plan Change Failed",
        description: error instanceof Error ? error.message : "There was an error updating your subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      setShowConfirmModal(false);
    }
  };

  const getPlanChangeAction = (planId: string) => {
    const tierOrder = { free: 0, standard: 1, premium: 2 };
    const currentTierOrder = tierOrder[user?.subscriptionTier as keyof typeof tierOrder] || 0;
    const targetTierOrder = tierOrder[planId as keyof typeof tierOrder] || 0;
    
    if (targetTierOrder > currentTierOrder) {
      return "upgrade";
    } else {
      return "downgrade";
    }
  };

  // Show login message if not authenticated
  if (!user) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Subscription Settings</h1>
          <p className="text-gray-600 mt-2">
            Please log in to view your subscription details
          </p>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-4">Authentication Required</h3>
            <p className="text-gray-600 mb-4">
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            Subscription Management
          </h1>
          <p className="text-lg text-gray-700 max-w-2xl mx-auto">
            Manage your plan and track your usage
          </p>
        </div>

        {/* Current Plan Overview */}
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-green-100 p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-6">
              {user.subscriptionTier === 'premium' && (
                <div className="p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-lg">
                  <Crown className="w-8 h-8 text-white" />
                </div>
              )}
              {user.subscriptionTier === 'standard' && (
                <div className="p-4 bg-gradient-to-r from-green-400 to-teal-500 rounded-2xl shadow-lg">
                  <Crown className="w-8 h-8 text-white" />
                </div>
              )}
              {(user.subscriptionTier === 'free' || !user.subscriptionTier) && (
                <div className="p-4 bg-gradient-to-r from-gray-400 to-gray-600 rounded-2xl shadow-lg">
                  <Crown className="w-8 h-8 text-white" />
                </div>
              )}
              <div>
                <h2 className="text-3xl font-bold capitalize bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent">
                  {user.subscriptionTier || 'free'} Plan
                </h2>
                <p className="text-gray-600 text-lg font-medium">Status: {user.subscriptionStatus || 'active'}</p>
              </div>
            </div>
            <Badge 
              variant={user.subscriptionTier === 'premium' ? 'default' : 'secondary'} 
              className={`px-6 py-3 text-base font-bold rounded-xl ${
                user.subscriptionTier === 'premium' 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg' 
                  : user.subscriptionTier === 'standard'
                  ? 'bg-gradient-to-r from-green-400 to-teal-500 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {user.subscriptionTier === 'premium' ? '👑 Premium Member' : 
               user.subscriptionTier === 'standard' ? '⭐ Standard Member' : 
               '🆓 Free Member'}
            </Badge>
          </div>
          
          {/* Usage Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-200 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-green-900 text-lg">Products Created</h4>
                <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-3xl font-bold text-green-600 mb-2">{productCount}</p>
              <p className="text-sm text-green-700 font-medium">
                of {user.subscriptionTier === 'premium' ? '∞ unlimited' : user.subscriptionTier === 'standard' ? '10' : '3'} allowed
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-6 rounded-2xl border border-emerald-200 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-emerald-900 text-lg">Plan Status</h4>
                <div className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-3xl font-bold text-emerald-600 mb-2 capitalize">{user.subscriptionTier || 'free'}</p>
              <p className="text-sm text-emerald-700 font-medium">{user.subscriptionStatus === 'active' ? 'Active subscription' : 'Free plan'}</p>
            </div>
          </div>
        </div>

        {/* Plan Selection Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Free Plan */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6 text-center space-y-6 hover:shadow-xl transition-all hover:scale-105 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-400 to-gray-600"></div>
            <div className="space-y-4">
              <h4 className="text-3xl font-bold text-gray-800">Free</h4>
              <div className="space-y-2">
                <p className="text-5xl font-bold text-gray-800">£0</p>
                <p className="text-gray-600 font-semibold text-lg">forever</p>
              </div>
            </div>
            
            <ul className="space-y-4 text-left">
              <li className="flex items-start gap-4">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-1">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-semibold text-lg">Up to 3 products</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">3 edits per product</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Up to 2 customer groups</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">5 broadcasts per month</span>
              </li>
            </ul>
            
            <Button 
              variant="outline" 
              className="w-full py-3 rounded-xl font-semibold text-base border-2 hover:bg-gray-50 transition-colors"
              disabled={user.subscriptionTier === 'free'}
              onClick={() => handlePlanChangeClick('free')}
            >
              {user.subscriptionTier === 'free' ? '✓ Current Plan' : 'Downgrade'}
            </Button>
          </div>

          {/* Standard Plan */}
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-green-200 p-10 text-center space-y-8 hover:shadow-2xl transition-all hover:scale-105 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-emerald-500"></div>
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                <h4 className="text-3xl font-bold text-gray-800">Standard</h4>
                <Badge className="bg-green-500 text-white px-3 py-2 text-sm font-bold rounded-xl">POPULAR</Badge>
              </div>
              <div className="space-y-2">
                <p className="text-5xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">£10.99</p>
                <p className="text-gray-600 font-semibold text-lg">per month</p>
              </div>
            </div>
            
            <ul className="space-y-4 text-left">
              <li className="flex items-start gap-4">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-1">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-semibold text-lg">Up to 10 products</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-blue-600" />
                </div>
                <span className="text-gray-700 font-medium">10 product edits per product</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-blue-600" />
                </div>
                <span className="text-gray-700 font-medium">Up to 5 customer groups</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-blue-600" />
                </div>
                <span className="text-gray-700 font-medium">25 broadcasts per month</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-blue-600" />
                </div>
                <span className="text-gray-700 font-medium">Up to 2 team members</span>
              </li>
            </ul>
            
            <Button 
              className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white border-0 shadow-xl hover:shadow-2xl transition-all"
              disabled={user.subscriptionTier === 'standard'}
              onClick={() => handlePlanChangeClick('standard')}
            >
              {user.subscriptionTier === 'standard' ? '✓ Current Plan' : getPlanChangeAction('standard') === 'upgrade' ? 'Upgrade' : 'Downgrade'}
            </Button>
          </div>

          {/* Premium Plan */}
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-green-300 p-10 text-center space-y-8 hover:shadow-3xl transition-all hover:scale-105 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-500 to-emerald-600"></div>
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-5 py-3 font-bold shadow-xl text-base">
                👑 PREMIUM
              </Badge>
            </div>
            
            <div className="space-y-4 pt-6">
              <div className="flex items-center justify-center gap-4">
                <div className="p-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl">
                  <Crown className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-3xl font-bold text-gray-800">Premium</h4>
              </div>
              <div className="space-y-2">
                <p className="text-5xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">£19.99</p>
                <p className="text-gray-600 font-semibold text-lg">per month</p>
              </div>
            </div>
            
            <ul className="space-y-4 text-left">
              <li className="flex items-start gap-4">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-1">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-semibold text-lg">Unlimited products</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-yellow-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-yellow-600" />
                </div>
                <span className="text-gray-700 font-medium">Unlimited product edits</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-yellow-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-yellow-600" />
                </div>
                <span className="text-gray-700 font-medium">Unlimited customer groups</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-yellow-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-yellow-600" />
                </div>
                <span className="text-gray-700 font-medium">Unlimited broadcasts</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-yellow-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-yellow-600" />
                </div>
                <span className="text-gray-700 font-medium">Up to 5 team members</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-yellow-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-yellow-600" />
                </div>
                <span className="text-gray-700 font-medium">Marketplace access</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-yellow-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-yellow-600" />
                </div>
                <span className="text-gray-700 font-medium">Product advertising</span>
              </li>
            </ul>
            
            <Button 
              className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white border-0 shadow-xl hover:shadow-2xl transition-all"
              disabled={user.subscriptionTier === 'premium'}
              onClick={() => handlePlanChangeClick('premium')}
            >
              {user.subscriptionTier === 'premium' ? '✓ Current Plan' : 'Upgrade'}
            </Button>
        </div>

        {/* Billing Information */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-green-100 p-6">
          <h3 className="text-2xl font-bold bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent mb-6">Billing Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-green-900">Current Plan</h4>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <p className="text-2xl font-bold text-green-600 capitalize">{user.subscriptionTier || 'free'} Plan</p>
              <p className="text-sm text-green-700">Status: {user.subscriptionStatus || 'active'}</p>
            </div>
            
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-6 rounded-2xl border border-emerald-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-emerald-900">Next Billing Date</h4>
                <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              </div>
              <p className="text-2xl font-bold text-emerald-600">
                {user.subscriptionTier === 'free' ? 'No billing' : 'August 29, 2025'}
              </p>
              <p className="text-sm text-emerald-700">
                {user.subscriptionTier === 'free' ? 'Free plan' : 'Monthly subscription'}
              </p>
            </div>
          </div>
          
          {user.subscriptionTier !== 'free' && (
            <div className="mt-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200">
              <h4 className="font-bold text-green-900 mb-4">Subscription Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-sm text-green-600 font-medium">Plan</p>
                  <p className="text-lg font-bold text-green-800 capitalize">{user.subscriptionTier}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-green-600 font-medium">Amount</p>
                  <p className="text-lg font-bold text-green-800">
                    {user.subscriptionTier === 'standard' ? '£10.99' : '£19.99'}/month
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-green-600 font-medium">Started</p>
                  <p className="text-lg font-bold text-green-800">July 29, 2025</p>
                </div>
              </div>
            </div>
          )}
        </div>


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