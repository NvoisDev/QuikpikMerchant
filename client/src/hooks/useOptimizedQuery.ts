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