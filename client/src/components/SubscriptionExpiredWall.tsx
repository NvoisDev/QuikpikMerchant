import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Crown, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBaseTier } from "@/lib/planUtils";

interface SubscriptionData {
  user?: {
    currentPlan?: string;
    subscriptionStatus?: string;
    subscriptionPeriodEnd?: string | null;
  };
  subscription?: {
    stripeSubscriptionId?: string | null;
  } | null;
}

function isTrialExpired(data: SubscriptionData | undefined): boolean {
  if (!data?.user) return false;
  const plan = data.user.currentPlan;
  const status = data.user.subscriptionStatus;
  const periodEnd = data.user.subscriptionPeriodEnd;
  const tier = getBaseTier(plan);

  if (tier !== "listing") return false;
  if (status === "active") return false;
  if (data.subscription?.stripeSubscriptionId) return false;

  if (!periodEnd) return false;
  return new Date(periodEnd) < new Date();
}

export default function SubscriptionExpiredWall({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  const { data, isLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscriptions/current"],
    staleTime: 60_000,
  });

  const allowedPaths = ["/subscription-pricing", "/settings", "/logout"];
  const isAllowed = allowedPaths.some((p) => location.startsWith(p));

  if (isLoading || isAllowed || !isTrialExpired(data)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center ring-2 ring-slate-700">
            <Lock className="w-7 h-7 text-slate-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">
          Your free trial has ended
        </h1>
        <p className="text-slate-400 mb-8 leading-relaxed">
          Your 3-month Listing trial has expired. Choose a plan to get back in
          — or stay on Listing for just £19.99/month to keep your products
          discoverable on the marketplace.
        </p>

        <Button
          onClick={() => setLocation("/subscription-pricing")}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 mb-4"
          size="lg"
        >
          <Crown className="w-4 h-4" />
          Choose a plan
          <ArrowRight className="w-4 h-4" />
        </Button>

        <p className="text-xs text-slate-600">
          Need help?{" "}
          <a href="mailto:support@quikpik.app" className="text-slate-400 underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
