import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSidebarPermissions } from "@/hooks/useSidebarPermissions";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Store,
  Package,
  Users,
  TrendingUp,
  Eye,
  ShieldCheck,
  CheckIcon,
  StarIcon,
  CrownIcon,
  ArrowRight,
  Clock,
} from "lucide-react";
import clsx from "clsx";
import PageHeader from "@/components/PageHeader";

interface SubscriptionPlan {
  id: string;
  name: string;
  planId: string;
  stripePriceId: string | null;
  monthlyPrice: string;
  currency: string;
  description: string;
  features: string[];
  limits: {
    products: number;
    broadcasts: number;
    teamMembers: number;
    customGroups: number;
  };
  sortOrder: number;
}

interface CurrentSubscription {
  user: any;
  subscription: any;
  plan: SubscriptionPlan | null;
  currentPlan: string;
  subscriptionStatus: string;
}

const marketplaceHighlights = [
  {
    icon: Package,
    title: "Browse Wholesale Products",
    description: "Discover products from verified UK wholesalers across every category.",
  },
  {
    icon: Users,
    title: "Connect with Suppliers",
    description: "Build direct relationships with like-minded wholesale businesses.",
  },
  {
    icon: Eye,
    title: "Flexible Price Visibility",
    description: "Control exactly who sees your prices and apply your own pricing tiers.",
  },
  {
    icon: TrendingUp,
    title: "Grow Your Sourcing",
    description: "Expand your product range and find better deals without leaving the platform.",
  },
  {
    icon: ShieldCheck,
    title: "Verified Businesses Only",
    description: "Every supplier on the marketplace is vetted and verified before listing.",
  },
  {
    icon: Store,
    title: "List Your Own Products",
    description: "Put your own catalogue in front of other wholesalers who are ready to buy.",
  },
];

function getPlanIcon(planId: string) {
  switch (planId) {
    case "free":
      return <CheckIcon className="w-5 h-5" />;
    case "standard":
      return <StarIcon className="w-5 h-5" />;
    case "premium":
      return <CrownIcon className="w-5 h-5" />;
    default:
      return <CheckIcon className="w-5 h-5" />;
  }
}

function getPlanAccentColor(planId: string) {
  switch (planId) {
    case "free":
      return { icon: "bg-gray-100 text-gray-600", ring: "border-gray-200", btn: "bg-gray-700 hover:bg-gray-800" };
    case "standard":
      return { icon: "bg-blue-100 text-blue-600", ring: "border-blue-200", btn: "bg-blue-600 hover:bg-blue-700" };
    case "premium":
      return { icon: "bg-purple-100 text-purple-600", ring: "border-purple-200", btn: "bg-purple-600 hover:bg-purple-700" };
    default:
      return { icon: "bg-gray-100 text-gray-600", ring: "border-gray-200", btn: "bg-gray-700 hover:bg-gray-800" };
  }
}

function formatLimit(limit: number) {
  return limit === -1 ? "Unlimited" : limit.toString();
}

function formatPlanFeature(feature: string) {
  return feature.toLowerCase().includes("broadcast") ? "Broadcast tools (coming soon)" : feature;
}

export default function Marketplace() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { checkTabAccess, permissionsLoading } = useSidebarPermissions();

  useEffect(() => {
    if (permissionsLoading) return;
    if (user?.role === 'team_member' && !checkTabAccess('marketplace')) {
      toast({
        title: "Access restricted",
        description: "You don't have permission to view the Marketplace page.",
        variant: "destructive",
      });
      setLocation('/');
    }
  }, [user, permissionsLoading, checkTabAccess, toast, setLocation]);

  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);

  const { data: plans = [], isLoading: plansLoading, isError: plansError } = useQuery<SubscriptionPlan[]>({
    queryKey: ["/api/subscriptions/plans"],
  });

  const { data: currentSubscription } = useQuery<CurrentSubscription>({
    queryKey: ["/api/subscriptions/current"],
    enabled: !!user,
  });

  const createCheckoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest("POST", "/api/subscriptions/create-checkout-session", { priceId });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        setProcessingPlanId(null);
      }
    },
    onError: (error: any) => {
      console.error("Checkout error:", error);
      toast({
        title: "Payment Error",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
      setProcessingPlanId(null);
    },
    onSettled: () => {
      setTimeout(() => setProcessingPlanId(null), 3000);
    },
  });

  const currentPlan = currentSubscription?.currentPlan || "free";

  const isCurrentPlan = (planId: string) => currentPlan === planId;

  const handlePlanSelection = (plan: SubscriptionPlan) => {
    if (isCurrentPlan(plan.planId)) {
      toast({ title: "Current Plan", description: `You're already on the ${plan.name} plan.` });
      return;
    }
    const hierarchy: Record<string, number> = { free: 0, standard: 1, premium: 2 };
    const currentLevel = hierarchy[currentPlan] ?? 0;
    const targetLevel = hierarchy[plan.planId] ?? 0;
    if (targetLevel < currentLevel) {
      toast({
        title: "Manage your subscription",
        description: "To downgrade your plan, visit the Subscription page.",
        action: undefined,
      });
      return;
    }
    if (!plan.stripePriceId) {
      toast({ title: "Free Plan", description: "You're currently on a paid plan. Visit Subscription to downgrade." });
      return;
    }
    setProcessingPlanId(plan.planId);
    createCheckoutMutation.mutate(plan.stripePriceId);
  };

  return (
    <div className="bg-white min-h-screen">
      <PageHeader title="Marketplace" description="B2B wholesale marketplace — coming soon" />

      <div className="max-w-5xl mx-auto px-4 pb-16">

        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white px-6 py-12 sm:px-10 sm:py-16 mb-12 text-center">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white text-sm font-medium px-4 py-1.5 rounded-full mb-5">
              <Clock className="w-4 h-4" />
              Coming Soon
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              The B2B Wholesale Marketplace
            </h1>
            <p className="text-emerald-100 text-base sm:text-lg max-w-2xl mx-auto mb-6">
              Source from verified UK wholesalers, list your own products, and grow your business — all inside Quikpik.
            </p>
            <div className="inline-flex items-center gap-2 text-white/80 text-sm">
              <ShieldCheck className="w-4 h-4" />
              Verified wholesalers only &nbsp;·&nbsp; Flexible pricing controls &nbsp;·&nbsp; Direct connections
            </div>
          </div>
          {/* Decorative circles */}
          <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 -left-12 w-64 h-64 rounded-full bg-white/5" />
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
          {marketplaceHighlights.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-4 p-5 rounded-xl border border-gray-100 bg-gray-50">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm mb-1">{item.title}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Plans heading */}
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose the right plan</h2>
          <p className="text-gray-500">
            Marketplace access unlocks as part of your Quikpik subscription.{" "}
            <Link href="/subscription-pricing" className="text-emerald-600 hover:underline font-medium">
              Manage your current subscription <ArrowRight className="inline w-3 h-3" />
            </Link>
          </p>
        </div>

        {/* Plan cards */}
        {plansLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
          </div>
        ) : plansError ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-sm">Could not load plans right now. Please refresh the page to try again.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {plans.map((plan) => {
              const colors = getPlanAccentColor(plan.planId);
              const isCurrent = isCurrentPlan(plan.planId);
              const hierarchy: Record<string, number> = { free: 0, standard: 1, premium: 2 };
              const isDowngrade = (hierarchy[plan.planId] ?? 0) < (hierarchy[currentPlan] ?? 0);

              return (
                <Card
                  key={plan.id}
                  className={clsx(
                    "relative transition-all duration-200 border-2",
                    colors.ring,
                    {
                      "ring-4 ring-emerald-500 bg-emerald-50 border-emerald-300 scale-[1.02] shadow-lg": isCurrent,
                      "scale-105 shadow-lg hover:scale-[1.07]": !isCurrent && plan.planId === "standard",
                      "hover:scale-[1.02]": !isCurrent && plan.planId !== "standard",
                    }
                  )}
                >
                  {isCurrent && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-emerald-600 text-white px-3 py-1 text-xs font-semibold">
                        ✅ Current Plan
                      </Badge>
                    </div>
                  )}
                  {!isCurrent && plan.planId === "standard" && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-blue-600 text-white px-3 py-1 text-xs font-semibold">
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="text-center pt-8">
                    <div className={clsx("mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center", colors.icon)}>
                      {getPlanIcon(plan.planId)}
                    </div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription className="text-sm mt-1">{plan.description}</CardDescription>
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-gray-900">
                        £{parseFloat(plan.monthlyPrice).toFixed(0)}
                      </span>
                      {parseFloat(plan.monthlyPrice) > 0 && (
                        <span className="text-gray-500 text-sm ml-1">/mo</span>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <ul className="space-y-2.5 mb-6">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-600">{formatPlanFeature(feature)}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="text-xs text-gray-500 space-y-1.5 mb-5 border-t pt-4">
                      <div className="flex justify-between">
                        <span>Products</span>
                        <span className="font-medium text-gray-700">{formatLimit(plan.limits.products)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Team members</span>
                        <span className="font-medium text-gray-700">{formatLimit(plan.limits.teamMembers)}</span>
                      </div>
                    </div>

                    {isCurrent ? (
                      <Button disabled variant="outline" className="w-full">
                        Current Plan
                      </Button>
                    ) : isDowngrade ? (
                      <Link href="/subscription-pricing">
                        <Button variant="outline" className="w-full">
                          Manage subscription
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        onClick={() => handlePlanSelection(plan)}
                        disabled={processingPlanId === plan.planId}
                        className={clsx("w-full whitespace-normal h-auto py-2 text-white", colors.btn)}
                      >
                        {processingPlanId === plan.planId
                          ? "Processing..."
                          : plan.planId === "free"
                          ? "Get Started Free"
                          : `Upgrade to ${plan.name}`}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Footer nudge */}
        <p className="text-center text-sm text-gray-400">
          Need to cancel or downgrade?{" "}
          <Link href="/subscription-pricing" className="text-emerald-600 hover:underline">
            Manage your subscription
          </Link>
        </p>
      </div>
    </div>
  );
}
