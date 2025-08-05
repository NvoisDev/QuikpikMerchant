import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/user", {
          credentials: "include",
        });
        
        if (res.status === 401) {
          // Not authenticated - this is expected, return null
          return null;
        }
        
        if (res.status === 403) {
          // Access denied - likely a customer trying to access wholesaler dashboard
          const data = await res.json().catch(() => ({}));
          if (data.userType === 'retailer' || data.userType === 'customer') {
            console.log('🚫 Customer detected trying to access wholesaler dashboard, redirecting...');
            window.location.href = '/customer-login';
            return null;
          }
        }
        
        if (!res.ok) {
          throw new Error(`${res.status}: ${res.statusText}`);
        }
        
        return await res.json();
      } catch (error) {
        // Don't throw errors for authentication issues - return null instead
        console.log('Authentication check failed:', error);
        return null;
      }
    },
    enabled: true,
    retry: false, // Don't retry authentication failures
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
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
      // Redirect to wholesaler login page
      window.location.href = "/login";
    },
  });

  return {
    user,
    loading: isLoading,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
