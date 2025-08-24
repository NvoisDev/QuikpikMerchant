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
        // Return safe defaults
        return {
          tier: 'free',
          status: 'inactive',
          productCount: 0,
          productLimit: 3
        };
      }
      
      return res.json();
    },
    enabled: !!user,
    staleTime: 30000, // Cache for 30 seconds
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