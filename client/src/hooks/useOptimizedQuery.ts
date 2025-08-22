import { useQuery, UseQueryOptions } from '@tanstack/react-query';

/**
 * Optimized query hook with performance-focused defaults
 * Use this for critical data that needs fast loading
 */
export function useOptimizedQuery<TData = unknown, TError = Error>(
  options: UseQueryOptions<TData, TError>
) {
  return useQuery({
    staleTime: 2 * 60 * 1000, // 2 minutes for critical data
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 1,
    ...options,
  });
}

/**
 * Background query hook for non-critical data
 * Use this for data that can be stale without user impact
 */
export function useBackgroundQuery<TData = unknown, TError = Error>(
  options: UseQueryOptions<TData, TError>
) {
  return useQuery({
    staleTime: 10 * 60 * 1000, // 10 minutes for background data
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 0, // No retries for background queries
    ...options,
  });
}

/**
 * Critical path query hook for essential data
 * Use this for data that must load fast for core functionality
 */
export function useCriticalQuery<TData = unknown, TError = Error>(
  options: UseQueryOptions<TData, TError>
) {
  return useQuery({
    staleTime: 30 * 1000, // 30 seconds - very fresh data
    gcTime: 2 * 60 * 1000, // 2 minutes garbage collection
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 2, // Retry twice for critical queries
    retryDelay: 100, // Fast retry for critical data
    ...options,
  });
}

/**
 * Prefetch hook for warming up data before it's needed
 */
export function usePrefetchQuery<TData = unknown>(
  queryKey: string,
  endpoint: string,
  enabled: boolean = true
) {
  return useQuery<TData>({
    queryKey: [queryKey],
    queryFn: async () => {
      const response = await fetch(endpoint, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to prefetch');
      return response.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 0, // Don't retry prefetch queries
  });
}