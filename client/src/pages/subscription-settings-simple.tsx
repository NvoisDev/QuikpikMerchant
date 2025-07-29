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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
        {/* Modern Header */}
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            Subscription Management
          </h1>
          <p className="text-xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
            Manage your plan, track usage, and unlock powerful features for your wholesale business
          </p>
        </div>

        {/* Current Plan Overview - Brand Colors */}
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-green-100 p-12">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-6">
              {user.subscriptionTier === 'premium' && (
                <div className="p-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl shadow-xl">
                  <Crown className="w-12 h-12 text-white" />
                </div>
              )}
              {user.subscriptionTier === 'standard' && (
                <div className="p-6 bg-gradient-to-r from-green-400 to-teal-500 rounded-3xl shadow-xl">
                  <Crown className="w-12 h-12 text-white" />
                </div>
              )}
              {(user.subscriptionTier === 'free' || !user.subscriptionTier) && (
                <div className="p-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded-3xl shadow-xl">
                  <Crown className="w-12 h-12 text-white" />
                </div>
              )}
              <div>
                <h2 className="text-4xl font-bold capitalize bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent">
                  {user.subscriptionTier || 'free'} Plan
                </h2>
                <p className="text-gray-600 text-xl font-medium">Status: {user.subscriptionStatus || 'active'}</p>
              </div>
            </div>
            <Badge 
              variant={user.subscriptionTier === 'premium' ? 'default' : 'secondary'} 
              className={`px-8 py-4 text-lg font-bold rounded-2xl ${
                user.subscriptionTier === 'premium' 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-xl' 
                  : user.subscriptionTier === 'standard'
                  ? 'bg-gradient-to-r from-green-400 to-teal-500 text-white shadow-xl'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {user.subscriptionTier === 'premium' ? '👑 Premium Member' : 
               user.subscriptionTier === 'standard' ? '⭐ Standard Member' : 
               '🆓 Free Member'}
            </Badge>
          </div>
          
          {/* Brand Usage Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-10 rounded-3xl border border-green-200 shadow-lg hover:shadow-xl transition-all hover:scale-105">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-green-900 text-xl">Products Created</h4>
                <div className="w-5 h-5 bg-green-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-5xl font-bold text-green-600 mb-3">0</p>
              <p className="text-base text-green-700 font-semibold">
                of {user.subscriptionTier === 'premium' ? '∞ unlimited' : user.subscriptionTier === 'standard' ? '10' : '3'} allowed
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-10 rounded-3xl border border-emerald-200 shadow-lg hover:shadow-xl transition-all hover:scale-105">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-emerald-900 text-xl">Plan Status</h4>
                <div className="w-5 h-5 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-5xl font-bold text-emerald-600 mb-3 capitalize">{user.subscriptionTier || 'free'}</p>
              <p className="text-base text-emerald-700 font-semibold">{user.subscriptionStatus === 'active' ? 'Active subscription' : 'Free plan'}</p>
            </div>
          </div>
        </div>

        {/* Brand Plan Selection Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 py-8">
          {/* Free Plan */}
          <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200 p-10 text-center space-y-8 hover:shadow-2xl transition-all hover:scale-105 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-gray-400 to-gray-600"></div>
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

        {/* Brand Billing Information */}
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-green-100 p-12">
          <h3 className="text-3xl font-bold bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent mb-10">Billing Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-8 rounded-3xl border border-green-200 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-green-900 text-xl">Current Plan</h4>
                <div className="w-5 h-5 bg-green-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-3xl font-bold text-green-600 capitalize mb-2">{user.subscriptionTier || 'free'} Plan</p>
              <p className="text-base text-green-700 font-semibold">Status: {user.subscriptionStatus || 'active'}</p>
            </div>
            
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-8 rounded-3xl border border-emerald-200 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-bold text-emerald-900 text-xl">Next Billing Date</h4>
                <div className="w-5 h-5 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-3xl font-bold text-emerald-600 mb-2">
                {user.subscriptionTier === 'free' ? 'No billing' : 'August 29, 2025'}
              </p>
              <p className="text-base text-emerald-700 font-semibold">
                {user.subscriptionTier === 'free' ? 'Free plan' : 'Monthly subscription'}
              </p>
            </div>
          </div>
          
          {user.subscriptionTier !== 'free' && (
            <div className="mt-12 p-8 bg-gradient-to-r from-green-50 to-emerald-50 rounded-3xl border border-green-200 shadow-lg">
              <h4 className="font-bold text-green-900 text-xl mb-8">Subscription Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="text-center">
                  <p className="text-base text-green-600 font-semibold mb-2">Plan</p>
                  <p className="text-2xl font-bold text-green-800 capitalize">{user.subscriptionTier}</p>
                </div>
                <div className="text-center">
                  <p className="text-base text-green-600 font-semibold mb-2">Amount</p>
                  <p className="text-2xl font-bold text-green-800">
                    {user.subscriptionTier === 'standard' ? '£10.99' : '£19.99'}/month
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-base text-green-600 font-semibold mb-2">Started</p>
                  <p className="text-2xl font-bold text-green-800">July 29, 2025</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Brand Feature Highlights Section */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl shadow-2xl p-12 text-white">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">Why Choose Quikpik Premium?</h3>
            <p className="text-xl text-green-100 max-w-3xl mx-auto">
              Unlock the full potential of your wholesale business with our comprehensive features
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-bold">Unlimited Products</h4>
              <p className="text-green-100">Create unlimited product listings without restrictions</p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-bold">Advanced Analytics</h4>
              <p className="text-green-100">Track performance with detailed business insights</p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
              <h4 className="text-xl font-bold">Priority Support</h4>
              <p className="text-green-100">Get dedicated support for your business needs</p>
            </div>
          </div>
        </div>

        {/* Brand Trust Section */}
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-green-100 p-12">
          <div className="text-center space-y-8">
            <h3 className="text-3xl font-bold bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent">
              Trusted by 1000+ Businesses
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-8 rounded-3xl border border-green-200">
                <div className="text-4xl font-bold text-green-600 mb-2">99.9%</div>
                <div className="text-lg text-green-700 font-semibold">Uptime</div>
              </div>
              
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-8 rounded-3xl border border-emerald-200">
                <div className="text-4xl font-bold text-emerald-600 mb-2">24/7</div>
                <div className="text-lg text-emerald-700 font-semibold">Support</div>
              </div>
              
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 p-8 rounded-3xl border border-teal-200">
                <div className="text-4xl font-bold text-teal-600 mb-2">1000+</div>
                <div className="text-lg text-teal-700 font-semibold">Happy Customers</div>
              </div>
            </div>
          </div>
        </div>

        {/* Brand Footer Section */}
        <div className="text-center space-y-6 py-8">
          <div className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            Ready to Grow Your Business?
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Join thousands of successful wholesalers using Quikpik to streamline their operations and boost sales.
          </p>
          <div className="flex justify-center space-x-6">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-3 h-3 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
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