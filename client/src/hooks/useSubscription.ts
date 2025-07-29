import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

export function useSubscription() {
  const { user } = useAuth();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["/api/subscription/status"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/subscription/status", {
          credentials: "include",
        });
        
        if (res.status === 401) {
          // Not authenticated - return null
          return null;
        }
        
        if (!res.ok) {
          console.warn(`Subscription status failed: ${res.status}`);
          // Return a default subscription object for unauthenticated users
          return {
            tier: 'free',
            status: 'inactive',
            productCount: 0
          };
        }
        
        return await res.json();
      } catch (error) {
        console.warn('Subscription query failed:', error);
        // Return safe defaults on error
        return {
          tier: 'free',
          status: 'inactive',
          productCount: 0
        };
      }
    },
    enabled: !!user,
    retry: false,
  });

  const canCreateProduct = () => {
    if (!user || !subscription) return false;
    
    const productCount = (subscription as any)?.productCount || 0;
    const limit = getProductLimit(user.subscriptionTier || 'free');
    
    return limit === -1 || productCount < limit;
  };

  const canEditProduct = (editCount: number) => {
    if (!user) return false;
    
    const tier = user.subscriptionTier || 'free';
    const editLimit = getEditLimit(tier);
    
    if (editLimit === -1) {
      return true; // Unlimited for premium
    }
    
    return editCount < editLimit;
  };

  const canAccessAdvertising = () => {
    if (!user) return false;
    return user.subscriptionTier === 'premium';
  };

  const getProductLimit = (tier: string) => {
    switch (tier) {
      case 'free':
        return 3;
      case 'standard':
        return 10;
      case 'premium':
        return -1; // Unlimited
      default:
        return 3;
    }
  };

  const getEditLimit = (tier: string) => {
    switch (tier) {
      case 'free':
        return 3;
      case 'standard':
        return 10; // 10 edits for standard
      case 'premium':
        return -1; // Unlimited for premium only
      default:
        return 3;
    }
  };

  return {
    subscription,
    isLoading,
    canCreateProduct,
    canEditProduct,
    canAccessAdvertising,
    getProductLimit,
    getEditLimit,
    currentTier: user?.subscriptionTier || 'free',
    isActive: user?.subscriptionStatus === 'active'
  };
}