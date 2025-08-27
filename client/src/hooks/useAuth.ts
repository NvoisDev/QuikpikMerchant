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
          // Not authenticated - check if this is a session issue vs new user
          const currentPath = window.location.pathname;
          const isOnDashboard = currentPath.includes('dashboard') || currentPath === '/' || 
                               currentPath.includes('products') || currentPath.includes('orders') ||
                               currentPath.includes('customers') || currentPath.includes('analytics');
          
          if (isOnDashboard) {
            // User was trying to access dashboard but auth failed - likely session expired
            console.log('🔄 Authentication expired while on dashboard, redirecting to login');
            window.location.href = '/login?expired=true';
          }
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
    mutationFn: async () => {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        throw new Error("Logout failed");
      }
      return response.json();
    },
    onSuccess: () => {
      // Clear all authentication data
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      localStorage.clear();
      sessionStorage.clear();
      // Force redirect to login
      window.location.href = "/login";
    },
    onError: (error) => {
      console.error("Logout error:", error);
      // Force logout even if API fails
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/login";
    }
  });

  const backToHomeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        throw new Error("Logout failed");
      }
      return response.json();
    },
    onSuccess: () => {
      // Clear all authentication data
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      localStorage.clear();
      sessionStorage.clear();
      // Force redirect to landing page instead of login
      window.location.href = "/landing";
    },
    onError: (error) => {
      console.error("Back to home error:", error);
      // Force logout even if API fails and go to landing
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/landing";
    }
  });

  return {
    user,
    loading: isLoading,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    backToHome: backToHomeMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
