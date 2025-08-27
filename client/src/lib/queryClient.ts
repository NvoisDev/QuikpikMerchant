import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Cache-Control': 'no-cache',
  };
  
  if (data) {
    headers['Content-Type'] = 'application/json';
  }
  
  // For POST requests, add additional headers to ensure session persistence
  if (method.toUpperCase() === 'POST') {
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-cache",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }), // Changed to returnNull to prevent errors
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes - balances performance and data freshness
      gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
      retry: 1, // Only retry once for faster failure detection
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 3000), // Exponential backoff with 3s max
    },
    mutations: {
      retry: false,
    },
  },
});

// Performance-optimized API request with caching
const requestCache = new Map<string, { data: any; timestamp: number; }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

export async function cachedApiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  useCache: boolean = true
): Promise<Response> {
  const cacheKey = `${method}:${url}:${data ? JSON.stringify(data) : ''}`;
  
  // Check cache for GET requests
  if (method === 'GET' && useCache) {
    const cached = requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  const res = await apiRequest(method, url, data);
  
  // Cache successful GET responses
  if (method === 'GET' && res.ok && useCache) {
    const responseData = await res.clone().json();
    requestCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    });
    
    // Clean old cache entries
    if (requestCache.size > 100) {
      const cutoff = Date.now() - CACHE_DURATION;
      for (const [key, value] of requestCache.entries()) {
        if (value.timestamp < cutoff) {
          requestCache.delete(key);
        }
      }
    }
  }
  
  return res;
}

// Batch API requests to reduce network overhead
export class APIBatcher {
  private batches = new Map<string, Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
    endpoint: string;
    data?: any;
  }>>();
  private timeouts = new Map<string, NodeJS.Timeout>();
  
  async batchRequest(endpoint: string, data?: any): Promise<any> {
    const batchKey = `${endpoint.split('/').slice(0, 3).join('/')}`;
    
    return new Promise((resolve, reject) => {
      if (!this.batches.has(batchKey)) {
        this.batches.set(batchKey, []);
      }
      
      this.batches.get(batchKey)!.push({ resolve, reject, endpoint, data });
      
      // Clear existing timeout
      if (this.timeouts.has(batchKey)) {
        clearTimeout(this.timeouts.get(batchKey)!);
      }
      
      // Set new timeout to execute batch
      this.timeouts.set(batchKey, setTimeout(() => {
        this.executeBatch(batchKey);
      }, 50)); // 50ms batch window
    });
  }
  
  private async executeBatch(batchKey: string) {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0) return;
    
    this.batches.delete(batchKey);
    this.timeouts.delete(batchKey);
    
    try {
      // Execute requests in parallel
      const promises = batch.map(async ({ endpoint, data }) => {
        const response = await apiRequest('GET', endpoint, data);
        return response.json();
      });
      
      const results = await Promise.allSettled(promises);
      
      // Resolve individual promises
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          batch[index].resolve(result.value);
        } else {
          batch[index].reject(result.reason);
        }
      });
    } catch (error) {
      // Reject all promises on batch failure
      batch.forEach(({ reject }) => reject(error));
    }
  }
}

export const apiBatcher = new APIBatcher();
