import { useEffect } from "react";
import { useSimpleSubscription } from "@/hooks/useSimpleSubscription";
import { useAuth } from "@/hooks/useAuth";
import { SimpleSubscriptionUpgrade } from "@/components/SimpleSubscriptionUpgrade";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function SimpleSubscription() {
  const { user } = useAuth();
  const { subscription, currentTier, isActive, isLoading } = useSimpleSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Handle successful payment return
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const plan = urlParams.get('plan');

    if (success === 'true' && plan) {
      toast({
        title: "🎉 Subscription Upgraded!",
        description: `Welcome to ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan!`,
        duration: 5000,
      });

      // Refresh subscription data
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast, queryClient]);

  if (!user) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold">Please sign in to view subscription settings</h1>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4">Loading subscription data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Subscription</h1>
        <p className="text-gray-600">Manage your plan and billing</p>
      </div>

      {/* Current Status */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {currentTier === 'premium' && <Crown className="w-5 h-5 text-primary" />}
            Current Plan: {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
            <Badge variant={isActive ? "default" : "secondary"}>
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Plan Features</h4>
              <ul className="space-y-1">
                {currentTier === 'free' ? (
                  <>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="w-3 h-3 text-green-600" />
                      Up to 3 products
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="w-3 h-3 text-green-600" />
                      Basic WhatsApp integration
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="w-3 h-3 text-green-600" />
                      Email support
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="w-3 h-3 text-green-600" />
                      Unlimited products
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="w-3 h-3 text-green-600" />
                      B2B marketplace access
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="w-3 h-3 text-green-600" />
                      Team management
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="w-3 h-3 text-green-600" />
                      Priority support
                    </li>
                  </>
                )}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Usage</h4>
              <p className="text-sm text-gray-600">
                Products: {subscription?.productCount || 0}
                {currentTier === 'free' ? ' / 3' : ' (unlimited)'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Options */}
      <SimpleSubscriptionUpgrade currentPlan={currentTier} />
    </div>
  );
}