import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    enabled: true, // Re-enabled to fetch subscription data
    retry: (failureCount, error: any) => {
      // Don't retry if it's a 403 (access denied) error
      if (error?.response?.status === 403) {
        // If user is blocked for being a customer, redirect to customer login
        if (error?.response?.data?.userType === 'retailer' || error?.response?.data?.userType === 'customer') {
          console.log('🚫 Customer detected trying to access wholesaler dashboard, redirecting...');
          window.location.href = '/customer-login';
          return false;
        }
      }
      return failureCount < 3;
    },
    staleTime: 30000, // Cache for 30 seconds instead of infinity
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Refetch on mount to get fresh data
    refetchInterval: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/logout", "POST"),
    onSuccess: () => {
      // Immediately set user query data to null to clear authentication state
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      // Only clear customer-specific localStorage data, not all localStorage
      // This preserves wholesaler authentication while clearing customer sessions
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('customer_auth_')) {
          localStorage.removeItem(key);
        }
      });
      // Clear sessionStorage to ensure clean state
      sessionStorage.clear();
      // Redirect to customer login page (Find Your Store page)
      window.location.href = "/customer-login";
    },
  });

  return {
    user,
    loading: isLoading,
    isLoading,
    isAuthenticated: !!user && !error,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
