import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Check, 
  CreditCard, 
  Package, 
  Crown, 
  Zap,
  AlertCircle,
  Users,
  MessageSquare,
  TrendingUp,
  Shield,
  Star,
  Infinity
} from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "£0",
    interval: "forever",
    description: "Perfect for getting started",
    features: [
      "Up to 3 products",
      "3 edits per product",
      "2 customer groups (10 customers each)",
      "5 WhatsApp broadcasts per month",
      "Basic order management",
      "Basic analytics dashboard",
      "Email support"
    ],
    detailedFeatures: {
      products: "3 products maximum",
      edits: "3 edits per product",
      customers: "2 customer groups with 10 customers each",
      broadcasts: "5 WhatsApp broadcasts per month",
      analytics: "Basic sales and order analytics",
      support: "Email support during business hours"
    },
    productLimit: 3,
    editLimit: 3,
    customerGroupLimit: 2,
    broadcastLimit: 5,
    tier: "free",
    popular: false,
    buttonText: "Current Plan",
    color: "gray"
  },
  {
    name: "Standard",
    price: "£10.99",
    interval: "per month",
    description: "Great for growing businesses",
    features: [
      "Up to 10 products",
      "Unlimited product edits",
      "5 customer groups (50 customers each)",
      "25 WhatsApp broadcasts per month",
      "Advanced order processing",
      "Enhanced analytics & reports",
      "Priority email & phone support"
    ],
    detailedFeatures: {
      products: "10 products maximum",
      edits: "Unlimited product edits",
      customers: "5 customer groups with 50 customers each",
      broadcasts: "25 WhatsApp broadcasts per month",
      analytics: "Advanced analytics with detailed reports",
      support: "Priority email and phone support"
    },
    productLimit: 10,
    editLimit: -1,
    customerGroupLimit: 5,
    broadcastLimit: 25,
    tier: "standard",
    popular: true,
    buttonText: "Upgrade to Standard",
    color: "blue"
  },
  {
    name: "Premium",
    price: "£19.99",
    interval: "per month",
    description: "For unlimited growth and B2B marketplace access",
    features: [
      "Unlimited products",
      "Unlimited product edits",
      "Unlimited customer groups",
      "Unlimited WhatsApp broadcasts",
      "B2B Marketplace access",
      "Product advertising & promotion",
      "Real-time stock alerts",
      "Premium analytics dashboard",
      "Team management (up to 5 members)",
      "Dedicated account manager"
    ],
    detailedFeatures: {
      products: "Unlimited products",
      edits: "Unlimited product edits",
      customers: "Unlimited customer groups and customers",
      broadcasts: "Unlimited WhatsApp broadcasts",
      marketplace: "Full B2B marketplace access",
      advertising: "Product advertising and promotion campaigns",
      analytics: "Premium analytics with predictive insights",
      support: "Dedicated account manager with 24/7 support"
    },
    productLimit: -1,
    editLimit: -1,
    customerGroupLimit: -1,
    broadcastLimit: -1,
    tier: "premium",
    popular: false,
    buttonText: "Upgrade to Premium",
    color: "purple"
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
    onSuccess: (data: any) => {
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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription</h1>
          <p className="text-gray-600 mt-1">Manage your plan and billing</p>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
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
              {plans.map((plan) => {
                const isPlanCurrent = isCurrentPlan(plan.tier);
                const canUpgradePlan = canUpgrade(plan.tier);
                
                const getColorClasses = (color: string, isPopular: boolean, isCurrent: boolean) => {
                  if (isCurrent) return 'bg-green-50 border-green-500 border-2';
                  if (isPopular) return 'border-2 border-blue-500 shadow-lg scale-105';
                  
                  switch(color) {
                    case 'blue': return 'border border-blue-200 hover:border-blue-400 hover:shadow-lg';
                    case 'purple': return 'border border-purple-200 hover:border-purple-400 hover:shadow-lg';
                    default: return 'border border-gray-200 hover:border-gray-300 hover:shadow-lg';
                  }
                };
                
                const getIconComponent = () => {
                  switch(plan.name) {
                    case "Free": return <Package className="h-8 w-8 text-gray-500" />;
                    case "Standard": return <Zap className="h-8 w-8 text-blue-500" />;
                    case "Premium": return <Crown className="h-8 w-8 text-purple-500" />;
                    default: return <Package className="h-8 w-8 text-gray-500" />;
                  }
                };
                
                return (
                  <Card 
                    key={plan.tier} 
                    className={`relative transition-all duration-300 ${getColorClasses(plan.color, plan.popular, isPlanCurrent)} bg-white`}
                  >
                    {plan.popular && (
                      <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-1 shadow-lg">
                        <Star className="w-3 h-3 mr-1" />
                        Most Popular
                      </Badge>
                    )}
                    {isPlanCurrent && (
                      <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-1 shadow-lg">
                        <Shield className="w-3 h-3 mr-1" />
                        Current Plan
                      </Badge>
                    )}
                    
                    <CardHeader className="text-center pb-4">
                      <div className="flex items-center justify-center mb-3">
                        {getIconComponent()}
                      </div>
                      <CardTitle className="text-2xl font-bold text-gray-900">{plan.name}</CardTitle>
                      <div className="text-4xl font-bold mt-3 text-gray-900">
                        {plan.price}
                        <span className="text-lg font-normal text-gray-500 ml-2">
                          {plan.interval}
                        </span>
                      </div>
                      <p className="text-gray-600 mt-3 text-sm leading-relaxed">{plan.description}</p>
                    </CardHeader>
                    
                    <CardContent>
                      {/* Key Features */}
                      <div className="mb-6">
                        <h4 className="font-semibold text-gray-900 mb-3 text-sm">Key Features:</h4>
                        <ul className="space-y-2">
                          {plan.features.slice(0, 6).map((feature, index) => (
                            <li key={index} className="flex items-start">
                              <Check className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                              <span className="text-sm text-gray-700">{feature}</span>
                            </li>
                          ))}
                          {plan.features.length > 6 && (
                            <li className="text-xs text-gray-500 italic ml-6">
                              +{plan.features.length - 6} more features
                            </li>
                          )}
                        </ul>
                      </div>

                      {/* Limits Summary */}
                      <div className="mb-6 p-3 bg-gray-50 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase tracking-wide">Plan Limits:</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center">
                            <Package className="h-3 w-3 text-gray-400 mr-1" />
                            <span>{plan.productLimit === -1 ? '∞' : plan.productLimit} products</span>
                          </div>
                          <div className="flex items-center">
                            <Users className="h-3 w-3 text-gray-400 mr-1" />
                            <span>{plan.customerGroupLimit === -1 ? '∞' : plan.customerGroupLimit} groups</span>
                          </div>
                          <div className="flex items-center">
                            <MessageSquare className="h-3 w-3 text-gray-400 mr-1" />
                            <span>{plan.broadcastLimit === -1 ? '∞' : plan.broadcastLimit} broadcasts</span>
                          </div>
                          <div className="flex items-center">
                            <TrendingUp className="h-3 w-3 text-gray-400 mr-1" />
                            <span>{plan.editLimit === -1 ? '∞' : plan.editLimit} edits</span>
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        className={`w-full transition-all duration-200 ${
                          isPlanCurrent 
                            ? 'bg-green-500 hover:bg-green-600 text-white' 
                            : canUpgradePlan
                            ? `${plan.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : plan.color === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-600 hover:bg-gray-700'} text-white`
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        disabled={isPlanCurrent || !canUpgradePlan || isUpgrading}
                        onClick={() => canUpgradePlan && handleUpgrade(plan.tier)}
                      >
                        {isUpgrading && upgradeMutation.variables === plan.tier ? (
                          <>
                            <CreditCard className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <CreditCard className="mr-2 h-4 w-4" />
                            {isPlanCurrent ? "Current Plan" : canUpgradePlan ? plan.buttonText : 'Downgrade Not Available'}
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
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
  );
}