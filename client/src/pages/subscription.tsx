import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import { 
  Check, 
  CreditCard, 
  Package, 
  Crown, 
  Zap,
  AlertCircle
} from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    interval: "forever",
    description: "Perfect for getting started",
    features: [
      "Up to 3 products",
      "Basic WhatsApp broadcasts",
      "Order management",
      "Basic analytics",
      "Email support"
    ],
    productLimit: 3,
    tier: "free",
    popular: false,
    buttonText: "Current Plan"
  },
  {
    name: "Standard",
    price: "$10.99",
    interval: "per month",
    description: "Great for growing businesses",
    features: [
      "Up to 10 products",
      "Advanced WhatsApp broadcasts",
      "Customer groups",
      "Priority order processing",
      "Advanced analytics",
      "Phone support"
    ],
    productLimit: 10,
    tier: "standard",
    popular: true,
    buttonText: "Upgrade to Standard"
  },
  {
    name: "Premium",
    price: "$19.99",
    interval: "per month",
    description: "For unlimited growth",
    features: [
      "Unlimited products",
      "Custom broadcast templates",
      "Advanced customer segmentation",
      "Real-time inventory alerts",
      "Premium analytics dashboard",
      "Dedicated account manager"
    ],
    productLimit: -1,
    tier: "premium",
    popular: false,
    buttonText: "Upgrade to Premium"
  }
];

export default function Subscription() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isUpgrading, setIsUpgrading] = useState(false);

  const { data: subscriptionStatus, isLoading } = useQuery({
    queryKey: ["/api/subscription/status"],
    queryFn: async () => {
      const response = await fetch("/api/subscription/status", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch subscription status");
      return response.json();
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async (tier: string) => {
      return await apiRequest("POST", "/api/subscription/create", { tier });
    },
    onSuccess: (data) => {
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
        toast({
          title: "Subscription Updated",
          description: "Your subscription has been updated successfully",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Upgrade Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUpgrading(false);
    }
  });

  const handleUpgrade = (tier: string) => {
    if (tier === 'free') return;
    setIsUpgrading(true);
    upgradeMutation.mutate(tier);
  };

  const currentTier = user?.subscriptionTier || 'free';
  const currentLimit = user?.productLimit || 3;
  const currentProducts = subscriptionStatus?.currentProducts || 0;

  const isCurrentPlan = (planTier: string) => planTier === currentTier;
  const canUpgrade = (planTier: string) => {
    const tierOrder = { free: 0, standard: 1, premium: 2 };
    return tierOrder[planTier as keyof typeof tierOrder] > tierOrder[currentTier as keyof typeof tierOrder];
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 ml-64">
        {/* Top Bar */}
        <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Subscription</h1>
              <p className="text-gray-600 mt-1">Manage your plan and billing</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Current Plan Status */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Crown className="h-5 w-5 mr-2 text-yellow-500" />
                  Current Plan: {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
                </CardTitle>
                <Badge variant={currentTier === 'free' ? 'secondary' : 'default'}>
                  {user?.subscriptionStatus === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <Package className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                  <p className="text-sm text-gray-600">Products Used</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {currentProducts} / {currentLimit === -1 ? '∞' : currentLimit}
                  </p>
                </div>
                <div className="text-center">
                  <Zap className="h-8 w-8 mx-auto text-green-500 mb-2" />
                  <p className="text-sm text-gray-600">Features</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {currentTier === 'free' ? 'Basic' : currentTier === 'standard' ? 'Advanced' : 'Premium'}
                  </p>
                </div>
                <div className="text-center">
                  <CreditCard className="h-8 w-8 mx-auto text-purple-500 mb-2" />
                  <p className="text-sm text-gray-600">Monthly Cost</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {currentTier === 'free' ? '$0' : currentTier === 'standard' ? '$10.99' : '$19.99'}
                  </p>
                </div>
              </div>

              {currentProducts >= currentLimit && currentLimit !== -1 && (
                <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
                    <p className="text-sm text-yellow-800">
                      <strong>Product limit reached!</strong> You've used all {currentLimit} product slots. 
                      Upgrade your plan to add more products.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pricing Plans */}
          <div className="mb-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Plan</h2>
              <p className="text-lg text-gray-600">Scale your business with the right features</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {plans.map((plan) => (
                <Card 
                  key={plan.tier} 
                  className={`relative ${plan.popular ? 'border-blue-500 border-2' : ''}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-blue-500 text-white">Most Popular</Badge>
                    </div>
                  )}
                  
                  <CardHeader className="text-center">
                    <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                    <div className="mt-4">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      <span className="text-gray-600 ml-2">{plan.interval}</span>
                    </div>
                    <p className="text-gray-600 mt-2">{plan.description}</p>
                  </CardHeader>
                  
                  <CardContent>
                    <ul className="space-y-3 mb-6">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-center">
                          <Check className="h-4 w-4 text-green-500 mr-3 flex-shrink-0" />
                          <span className="text-sm text-gray-600">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <Button
                      className="w-full"
                      variant={isCurrentPlan(plan.tier) ? "outline" : "default"}
                      disabled={isCurrentPlan(plan.tier) || !canUpgrade(plan.tier) || isUpgrading}
                      onClick={() => handleUpgrade(plan.tier)}
                    >
                      {isUpgrading && upgradeMutation.variables === plan.tier ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Processing...
                        </>
                      ) : (
                        <>
                          {isCurrentPlan(plan.tier) ? (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              Current Plan
                            </>
                          ) : canUpgrade(plan.tier) ? (
                            plan.buttonText
                          ) : (
                            'Downgrade Not Available'
                          )}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* FAQ Section */}
          <Card>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Can I change my plan anytime?</h4>
                <p className="text-sm text-gray-600">
                  Yes, you can upgrade your plan at any time. Changes take effect immediately.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">What happens if I exceed my product limit?</h4>
                <p className="text-sm text-gray-600">
                  You won't be able to add new products until you upgrade your plan or remove existing products.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Is there a free trial?</h4>
                <p className="text-sm text-gray-600">
                  The free plan includes 3 products forever. You can upgrade when you need more features.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">How does billing work?</h4>
                <p className="text-sm text-gray-600">
                  All paid plans are billed monthly. You can cancel anytime and your access continues until the end of your billing period.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}