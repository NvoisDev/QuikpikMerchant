import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export function useSimpleSubscription() {
  const { user } = useAuth();

  const { data: subscription, isLoading, refetch } = useQuery({
    queryKey: ["/api/subscription/status"],
    queryFn: async () => {
      const res = await fetch("/api/subscription/status", {
        credentials: "include",
      });
      
      if (!res.ok) {
        console.log("⚠️ Subscription API failed:", res.status, res.statusText);
        // Return safe defaults but log the issue
        return {
          tier: 'free',
          status: 'inactive',
          productCount: 0,
          productLimit: 3
        };
      }
      
      const data = await res.json();
      console.log("✅ Subscription data received:", data);
      return data;
    },
    enabled: !!user,
    staleTime: 5000, // Reduced cache time for more frequent updates
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  const currentTier = subscription?.tier || user?.subscriptionTier || 'free';
  const isActive = subscription?.status === 'active' || user?.subscriptionStatus === 'active';
  const isPremium = currentTier === 'premium';

  return {
    subscription,
    currentTier,
    isActive,
    isPremium,
    isLoading,
    refetch,
    // Feature checks
    canCreateUnlimitedProducts: isPremium,
    productLimit: isPremium ? -1 : 3
  };
}