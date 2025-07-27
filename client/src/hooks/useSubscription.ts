import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

export function useSubscription() {
  const { user } = useAuth();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["/api/subscription/status"],
    enabled: !!user,
    retry: false,
  });

  const canCreateProduct = () => {
    if (!user || !subscription) return false;
    
    const productCount = subscription.productCount || 0;
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