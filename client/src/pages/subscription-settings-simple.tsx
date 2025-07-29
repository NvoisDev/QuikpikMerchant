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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-16 space-y-16">
        {/* Header */}
        <div className="text-center space-y-6 mb-20">
          <h1 className="text-5xl font-bold text-gray-800">
            Subscription Management
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Transparent and flexible pricing plans for your wholesale business
          </p>
        </div>

        {/* Current Plan Overview */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-4 mb-6">
              <div className={`p-4 rounded-2xl ${
                user.subscriptionTier === 'premium' ? 'bg-indigo-100' :
                user.subscriptionTier === 'standard' ? 'bg-blue-100' : 'bg-gray-100'
              }`}>
                <Crown className={`w-10 h-10 ${
                  user.subscriptionTier === 'premium' ? 'text-indigo-600' :
                  user.subscriptionTier === 'standard' ? 'text-blue-600' : 'text-gray-600'
                }`} />
              </div>
              <div className="text-left">
                <h2 className="text-4xl font-bold capitalize text-gray-800 mb-2">
                  {user.subscriptionTier || 'free'} Plan
                </h2>
                <p className="text-lg text-gray-600">Status: {user.subscriptionStatus || 'active'}</p>
              </div>
            </div>
            <Badge 
              className={`px-8 py-3 text-lg font-semibold rounded-full ${
                user.subscriptionTier === 'premium' 
                  ? 'bg-indigo-100 text-indigo-800 border-indigo-200' 
                  : user.subscriptionTier === 'standard'
                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                  : 'bg-gray-100 text-gray-800 border-gray-200'
              }`}
            >
              {user.subscriptionTier === 'premium' ? '👑 Premium Member' : 
               user.subscriptionTier === 'standard' ? '⭐ Standard Member' : 
               '🆓 Free Member'}
            </Badge>
          </div>
          
          {/* Usage Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-gray-800 text-xl">Products Created</h4>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <p className="text-4xl font-bold text-gray-800 mb-3">{productCount}</p>
              <p className="text-gray-600">
                of {user.subscriptionTier === 'premium' ? '∞ unlimited' : user.subscriptionTier === 'standard' ? '10' : '3'} allowed
              </p>
            </div>
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-gray-800 text-xl">Plan Status</h4>
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              </div>
              <p className="text-4xl font-bold text-gray-800 mb-3 capitalize">{user.subscriptionTier || 'free'}</p>
              <p className="text-gray-600">{user.subscriptionStatus === 'active' ? 'Active subscription' : 'Free plan'}</p>
            </div>
          </div>
        </div>

        {/* Plan Selection Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Free Plan */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 p-6 text-center space-y-6 hover:shadow-xl transition-all hover:scale-105 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-400 to-gray-600"></div>
            <ul className="space-y-4 text-left">
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Full library access</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">3 products / mo</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Regular updates</span>
              </li>
              <li className="flex items-center gap-3 opacity-50">
                <div className="w-5 h-5 rounded text-gray-400">✕</div>
                <span className="text-gray-400">Advanced features</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Premium support</span>
              </li>
            </ul>
            
            <Button 
              variant="outline" 
              className="w-full py-4 rounded-2xl font-semibold text-lg border-2 hover:bg-gray-50 transition-colors"
              disabled={user.subscriptionTier === 'free'}
              onClick={() => handlePlanChangeClick('free')}
            >
              {user.subscriptionTier === 'free' ? '✓ Current Plan' : 'Join now'}
            </Button>
          </div>

          {/* Standard Plan */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center space-y-8 hover:shadow-xl transition-all hover:scale-105 relative">
            <div className="space-y-6">
              <div className="inline-block p-3 bg-blue-100 rounded-2xl">
                <Crown className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h4 className="text-2xl font-bold text-gray-800 mb-2">Pro</h4>
                <div className="space-y-1">
                  <p className="text-5xl font-bold text-gray-800">£12</p>
                  <p className="text-gray-500">/mo</p>
                  <p className="text-sm text-gray-500">Per user</p>
                </div>
              </div>
            </div>
            
            <ul className="space-y-4 text-left">
              <li className="flex items-start gap-4">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-1">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700 font-semibold text-lg">Up to 10 products</span>
              </li>

              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Full library access</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">20 assets / mo</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Regular updates</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Desktop and mobile</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Premium support</span>
              </li>
            </ul>
            
            <Button 
              className="w-full py-4 rounded-2xl font-semibold text-lg bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-lg hover:shadow-xl transition-all"
              disabled={user.subscriptionTier === 'standard'}
              onClick={() => handlePlanChangeClick('standard')}
            >
              {user.subscriptionTier === 'standard' ? '✓ Current Plan' : 'Start for free'}
            </Button>
          </div>

          {/* Premium Plan */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center space-y-8 hover:shadow-xl transition-all hover:scale-105 relative">
            <div className="space-y-6">
              <div className="inline-block p-3 bg-yellow-100 rounded-2xl">
                <Crown className="w-8 h-8 text-yellow-600" />
              </div>
              <div>
                <h4 className="text-2xl font-bold text-gray-800 mb-2">Company</h4>
                <div className="space-y-1">
                  <p className="text-5xl font-bold text-gray-800">£32</p>
                  <p className="text-gray-500">/mo</p>
                  <p className="text-sm text-gray-500">Per user</p>
                </div>
              </div>
            </div>
            
            <ul className="space-y-4 text-left">
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Full library access</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">30 assets / mo</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Regular updates</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Desktop and mobile</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-gray-700">Premium support</span>
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
              className="w-full py-4 rounded-2xl font-semibold text-lg bg-yellow-600 hover:bg-yellow-700 text-white border-0 shadow-lg hover:shadow-xl transition-all"
              disabled={user.subscriptionTier === 'premium'}
              onClick={() => handlePlanChangeClick('premium')}
            >
              {user.subscriptionTier === 'premium' ? '✓ Current Plan' : 'Start for free'}
            </Button>
        </div>

        {/* Billing Information */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12">
          <h3 className="text-3xl font-bold text-gray-800 mb-12">Billing Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-gray-800 text-xl">Current Plan</h4>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <p className="text-3xl font-bold text-gray-800 capitalize mb-2">{user.subscriptionTier || 'Standard'} Plan</p>
              <p className="text-gray-600">Status: {user.subscriptionStatus || 'active'}</p>
            </div>
            
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-gray-800 text-xl">Next Billing Date</h4>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <p className="text-3xl font-bold text-gray-800 mb-2">
                August 29, 2025
              </p>
              <p className="text-gray-600">Monthly subscription</p>
            </div>
          </div>
          
          {user.subscriptionTier !== 'free' && (
            <div className="mt-12 p-8 bg-gray-50 rounded-2xl border border-gray-100">
              <h4 className="font-bold text-gray-800 text-xl mb-8">Subscription Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                <div>
                  <p className="text-gray-600 font-medium mb-2">Plan</p>
                  <p className="text-2xl font-bold text-gray-800 capitalize">{user.subscriptionTier || 'Standard'}</p>
                </div>
                <div>
                  <p className="text-gray-600 font-medium mb-2">Amount</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {user.subscriptionTier === 'standard' ? '£10.99' : '£19.99'}/month
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 font-medium mb-2">Started</p>
                  <p className="text-2xl font-bold text-gray-800">July 29, 2025</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Payment Security Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-gray-800 mb-4">Secure Payments</h3>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Payments secured by industry-leading encryption and compliance standards
            </p>
          </div>
          
          <div className="flex justify-center items-center space-x-12 opacity-60">
            <div className="text-2xl font-bold text-gray-600">PayPal</div>
            <div className="text-2xl font-bold text-gray-600">afterpay</div>
            <div className="text-2xl font-bold text-gray-600">VISA</div>
            <div className="text-2xl font-bold text-gray-600">💳</div>
          </div>
          
          <div className="text-center mt-8">
            <p className="text-gray-500">Payments secured by Lemon Squeezy</p>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12">
          <h3 className="text-3xl font-bold text-gray-800 mb-12 text-center">Frequently Asked Questions</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-xl font-bold text-gray-800">Can I change plans anytime?</h4>
              <p className="text-gray-600 leading-relaxed">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately and billing is prorated.
              </p>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-xl font-bold text-gray-800">What happens to my data?</h4>
              <p className="text-gray-600 leading-relaxed">
                Your data remains safe when changing plans. Premium features may be restricted on lower tiers but never deleted.
              </p>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-xl font-bold text-gray-800">Is there a free trial?</h4>
              <p className="text-gray-600 leading-relaxed">
                Yes, start with our free plan and upgrade when you need more features. No credit card required to begin.
              </p>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-xl font-bold text-gray-800">How secure are payments?</h4>
              <p className="text-gray-600 leading-relaxed">
                All payments are processed securely through Stripe with industry-standard encryption and PCI compliance.
              </p>
            </div>
          </div>
        </div>

        {/* Support Section */}
        <div className="bg-gray-100 rounded-2xl p-12 text-center">
          <h3 className="text-3xl font-bold text-gray-800 mb-4">Need Help?</h3>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Our support team is here to help you get the most out of Quikpik
          </p>
          <div className="flex justify-center space-x-6">
            <Button className="px-8 py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-2xl font-semibold">
              Contact Support
            </Button>
            <Button variant="outline" className="px-8 py-3 border-2 border-gray-300 hover:bg-gray-50 rounded-2xl font-semibold">
              View Documentation
            </Button>
          </div>
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