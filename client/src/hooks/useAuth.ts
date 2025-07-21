import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    enabled: false, // DISABLED to stop infinite authentication loops
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/logout", "POST"),
    onSuccess: () => {
      // Immediately set user query data to null to clear authentication state
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      // Clear all localStorage and sessionStorage to ensure clean state
      localStorage.clear();
      sessionStorage.clear();
      // Force a complete page reload to ensure clean state
      window.location.href = "/";
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
