import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Crown, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function SubscriptionSettingsSimple() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Modern Header */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Subscription Management
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Manage your plan, track usage, and unlock powerful features for your business
          </p>
        </div>

        {/* Current Plan Overview - Modern Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-6">
              {user.subscriptionTier === 'premium' && (
                <div className="p-4 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl shadow-lg">
                  <Crown className="w-10 h-10 text-white" />
                </div>
              )}
              {user.subscriptionTier === 'standard' && (
                <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl shadow-lg">
                  <Crown className="w-10 h-10 text-white" />
                </div>
              )}
              {(user.subscriptionTier === 'free' || !user.subscriptionTier) && (
                <div className="p-4 bg-gradient-to-r from-gray-400 to-gray-600 rounded-2xl shadow-lg">
                  <Crown className="w-10 h-10 text-white" />
                </div>
              )}
              <div>
                <h2 className="text-3xl font-bold capitalize bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                  {user.subscriptionTier || 'free'} Plan
                </h2>
                <p className="text-gray-500 text-lg">Status: {user.subscriptionStatus || 'active'}</p>
              </div>
            </div>
            <Badge 
              variant={user.subscriptionTier === 'premium' ? 'default' : 'secondary'} 
              className={`px-6 py-3 text-base font-bold rounded-xl ${
                user.subscriptionTier === 'premium' 
                  ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg' 
                  : user.subscriptionTier === 'standard'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {user.subscriptionTier === 'premium' ? '👑 Premium Member' : 
               user.subscriptionTier === 'standard' ? '⭐ Standard Member' : 
               '🆓 Free Member'}
            </Badge>
          </div>
          
          {/* Modern Usage Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-2xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-blue-900 text-lg">Products Created</h4>
                <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-4xl font-bold text-blue-600 mb-2">0</p>
              <p className="text-sm text-blue-700 font-medium">
                of {user.subscriptionTier === 'premium' ? '∞ unlimited' : user.subscriptionTier === 'standard' ? '10' : '3'} allowed
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-8 rounded-2xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-emerald-900 text-lg">Plan Status</h4>
                <div className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-4xl font-bold text-emerald-600 mb-2 capitalize">{user.subscriptionTier || 'free'}</p>
              <p className="text-sm text-emerald-700 font-medium">{user.subscriptionStatus === 'active' ? 'Active subscription' : 'Free plan'}</p>
            </div>
          </div>
        </div>

        {/* Modern Plan Selection Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Free Plan */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-8 text-center space-y-6 hover:shadow-xl transition-all hover:scale-105 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-400 to-gray-600"></div>
            <div className="space-y-3">
              <h4 className="text-2xl font-bold text-gray-800">Free</h4>
              <div className="space-y-1">
                <p className="text-4xl font-bold text-gray-800">£0</p>
                <p className="text-gray-500 font-medium">forever</p>
              </div>
            </div>
            
            <ul className="space-y-3 text-left">
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <span className="text-gray-700 font-medium">Up to 3 products</span>
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
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-blue-200 p-8 text-center space-y-6 hover:shadow-xl transition-all hover:scale-105 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600"></div>
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <h4 className="text-2xl font-bold text-gray-800">Standard</h4>
                <Badge className="bg-green-100 text-green-700 px-2 py-1 text-xs font-bold">POPULAR</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">£10.99</p>
                <p className="text-gray-500 font-medium">per month</p>
              </div>
            </div>
            
            <ul className="space-y-3 text-left">
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-blue-600" />
                </div>
                <span className="text-gray-700 font-medium">Up to 10 products</span>
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
              className="w-full py-3 rounded-xl font-semibold text-base bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl transition-all"
              disabled={user.subscriptionTier === 'standard'}
              onClick={() => handlePlanChangeClick('standard')}
            >
              {user.subscriptionTier === 'standard' ? '✓ Current Plan' : getPlanChangeAction('standard') === 'upgrade' ? 'Upgrade' : 'Downgrade'}
            </Button>
          </div>

          {/* Premium Plan */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-yellow-200 p-8 text-center space-y-6 hover:shadow-2xl transition-all hover:scale-105 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 to-orange-500"></div>
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 font-bold shadow-lg">
                👑 PREMIUM
              </Badge>
            </div>
            
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-center gap-3">
                <div className="p-2 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <h4 className="text-2xl font-bold text-gray-800">Premium</h4>
              </div>
              <div className="space-y-1">
                <p className="text-4xl font-bold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">£19.99</p>
                <p className="text-gray-500 font-medium">per month</p>
              </div>
            </div>
            
            <ul className="space-y-3 text-left">
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 bg-yellow-100 rounded-full flex items-center justify-center mt-0.5">
                  <Check className="w-3 h-3 text-yellow-600" />
                </div>
                <span className="text-gray-700 font-medium">Unlimited products</span>
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
              className="w-full py-3 rounded-xl font-semibold text-base bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white border-0 shadow-lg hover:shadow-xl transition-all"
              disabled={user.subscriptionTier === 'premium'}
              onClick={() => handlePlanChangeClick('premium')}
            >
              {user.subscriptionTier === 'premium' ? '✓ Current Plan' : 'Upgrade'}
            </Button>
        </div>

        {/* Modern Billing Information */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
          <h3 className="text-2xl font-bold text-gray-800 mb-6">Billing Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-purple-900 text-lg">Current Plan</h4>
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              </div>
              <p className="text-2xl font-bold text-purple-600 capitalize">{user.subscriptionTier || 'free'} Plan</p>
              <p className="text-sm text-purple-700">Status: {user.subscriptionStatus || 'active'}</p>
            </div>
            
            <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-6 rounded-2xl border border-orange-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-orange-900 text-lg">Next Billing Date</h4>
                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              </div>
              <p className="text-2xl font-bold text-orange-600">
                {user.subscriptionTier === 'free' ? 'No billing' : 'August 29, 2025'}
              </p>
              <p className="text-sm text-orange-700">
                {user.subscriptionTier === 'free' ? 'Free plan' : 'Monthly subscription'}
              </p>
            </div>
          </div>
          
          {user.subscriptionTier !== 'free' && (
            <div className="mt-8 p-6 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100">
              <h4 className="font-bold text-indigo-900 text-lg mb-4">Subscription Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-sm text-indigo-600 font-medium">Plan</p>
                  <p className="text-xl font-bold text-indigo-800 capitalize">{user.subscriptionTier}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-indigo-600 font-medium">Amount</p>
                  <p className="text-xl font-bold text-indigo-800">
                    {user.subscriptionTier === 'standard' ? '£10.99' : '£19.99'}/month
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-indigo-600 font-medium">Started</p>
                  <p className="text-xl font-bold text-indigo-800">July 29, 2025</p>
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