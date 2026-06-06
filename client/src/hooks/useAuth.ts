import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export type AuthUser = User & {
  isTeamMember?: boolean;
  teamMemberRole?: 'admin' | 'member' | 'viewer';
};

function clearSwApiCache() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/user", {
          credentials: "include",
        });
        
        if (res.status === 401) {
          // Not authenticated - check if this is a session issue vs new user
          const currentPath = window.location.pathname;
          
          // CRITICAL FIX: Exclude customer portal routes from wholesaler dashboard authentication
          const isCustomerPortal = currentPath.startsWith('/store/') || 
                                 currentPath.startsWith('/customer-login') ||
                                 currentPath.includes('/preview-store');
          
          const isOnDashboard = !isCustomerPortal && (
            currentPath.includes('dashboard') || 
            currentPath.includes('products') || currentPath.includes('orders') ||
            currentPath.includes('customers') || currentPath.includes('analytics')
          );
          
          if (isOnDashboard) {
            // User was trying to access dashboard but auth failed - likely session expired
            window.location.href = '/login?expired=true';
          }
          return null;
        }
        
        if (res.status === 403) {
          // Access denied - likely a customer trying to access wholesaler dashboard
          const data = await res.json().catch(() => ({}));
          if (data.userType === 'retailer' || data.userType === 'customer') {
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
      clearSwApiCache();
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
      clearSwApiCache();
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
      clearSwApiCache();
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/";
    },
    onError: (error) => {
      console.error("Back to home error:", error);
      clearSwApiCache();
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/";
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
