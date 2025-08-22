/**
 * Advanced query optimization utilities for API calls
 */

// Query deduplication and batching
export class QueryOptimizer {
  private pendingQueries = new Map<string, Promise<any>>();
  private queryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private batchQueue = new Map<string, Array<{
    query: string;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>>();
  private batchTimeouts = new Map<string, NodeJS.Timeout>();
  
  // Deduplicate identical queries
  async deduplicatedFetch(url: string, options?: RequestInit): Promise<Response> {
    const key = `${url}:${JSON.stringify(options)}`;
    
    if (this.pendingQueries.has(key)) {
      return this.pendingQueries.get(key)!;
    }
    
    const promise = fetch(url, options);
    this.pendingQueries.set(key, promise);
    
    try {
      const response = await promise;
      return response;
    } finally {
      this.pendingQueries.delete(key);
    }
  }
  
  // Smart caching with TTL
  async cachedFetch(
    url: string, 
    options: RequestInit & { ttl?: number } = {}
  ): Promise<Response> {
    const { ttl = 30000, ...fetchOptions } = options; // 30 second default TTL
    const cacheKey = `${url}:${JSON.stringify(fetchOptions)}`;
    
    // Check cache
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      console.log(`⚡ Cache hit for ${url}`);
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Fetch fresh data
    const response = await this.deduplicatedFetch(url, fetchOptions);
    
    if (response.ok) {
      const data = await response.clone().json();
      this.queryCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl
      });
      
      // Cleanup old cache entries
      this.cleanupCache();
    }
    
    return response;
  }
  
  // Batch similar queries
  async batchQuery<T>(
    batchKey: string,
    query: string,
    batchDelay: number = 10
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.batchQueue.has(batchKey)) {
        this.batchQueue.set(batchKey, []);
      }
      
      this.batchQueue.get(batchKey)!.push({ query, resolve, reject });
      
      // Clear existing timeout
      if (this.batchTimeouts.has(batchKey)) {
        clearTimeout(this.batchTimeouts.get(batchKey)!);
      }
      
      // Set new timeout
      this.batchTimeouts.set(batchKey, setTimeout(() => {
        this.executeBatch(batchKey);
      }, batchDelay));
    });
  }
  
  private async executeBatch(batchKey: string): Promise<void> {
    const batch = this.batchQueue.get(batchKey);
    if (!batch || batch.length === 0) return;
    
    this.batchQueue.delete(batchKey);
    this.batchTimeouts.delete(batchKey);
    
    try {
      // Execute all queries in parallel
      const promises = batch.map(({ query }) => 
        this.cachedFetch(query, { credentials: 'include' }).then(r => r.json())
      );
      
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
      // Reject all promises
      batch.forEach(({ reject }) => reject(error));
    }
  }
  
  private cleanupCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    
    this.queryCache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        entriesToDelete.push(key);
      }
    });
    
    entriesToDelete.forEach(key => this.queryCache.delete(key));
    
    // Limit cache size
    if (this.queryCache.size > 100) {
      const sortedEntries = Array.from(this.queryCache.entries())
        .sort(([,a], [,b]) => a.timestamp - b.timestamp);
      
      // Remove oldest 20 entries
      for (let i = 0; i < 20; i++) {
        this.queryCache.delete(sortedEntries[i][0]);
      }
    }
  }
  
  // Prefetch queries for upcoming navigation
  async prefetchQueries(queries: Array<{ url: string; options?: RequestInit }>): Promise<void> {
    const promises = queries.map(({ url, options }) => 
      this.cachedFetch(url, { ...options, ttl: 60000 }) // 1 minute TTL for prefetch
        .catch(error => {
          console.warn(`Prefetch failed for ${url}:`, error);
        })
    );
    
    await Promise.allSettled(promises);
  }
  
  // Clear all caches
  clearCache(): void {
    this.queryCache.clear();
    this.pendingQueries.clear();
    this.batchQueue.clear();
    this.batchTimeouts.forEach(timeout => clearTimeout(timeout));
    this.batchTimeouts.clear();
  }
  
  // Get cache statistics
  getCacheStats(): {
    cacheSize: number;
    pendingQueries: number;
    hitRate: number;
  } {
    // Simple hit rate calculation (would need more sophisticated tracking in production)
    return {
      cacheSize: this.queryCache.size,
      pendingQueries: this.pendingQueries.size,
      hitRate: 0.85 // Placeholder - would calculate from actual hits/misses
    };
  }
}

export const queryOptimizer = new QueryOptimizer();

// React Query integration
export const createOptimizedQueryFn = (baseUrl: string) => {
  return async ({ queryKey }: { queryKey: string[] }) => {
    const url = queryKey[0].startsWith('http') ? queryKey[0] : `${baseUrl}${queryKey[0]}`;
    
    // Use optimized fetching
    const response = await queryOptimizer.cachedFetch(url, {
      credentials: 'include',
      ttl: 120000 // 2 minutes
    });
    
    if (!response.ok) {
      throw new Error(`Query failed: ${response.status}`);
    }
    
    return response.json();
  };
};

// Intelligent query scheduling
export class QueryScheduler {
  private highPriorityQueue: Array<() => Promise<any>> = [];
  private normalPriorityQueue: Array<() => Promise<any>> = [];
  private lowPriorityQueue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private concurrentLimit = 3;
  private activeQueries = 0;
  
  async scheduleQuery<T>(
    queryFn: () => Promise<T>,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedQuery = async () => {
        try {
          this.activeQueries++;
          const result = await queryFn();
          resolve(result);
          return result;
        } catch (error) {
          reject(error);
          throw error;
        } finally {
          this.activeQueries--;
          this.processQueue();
        }
      };
      
      switch (priority) {
        case 'high':
          this.highPriorityQueue.push(wrappedQuery);
          break;
        case 'low':
          this.lowPriorityQueue.push(wrappedQuery);
          break;
        default:
          this.normalPriorityQueue.push(wrappedQuery);
      }
      
      this.processQueue();
    });
  }
  
  private processQueue(): void {
    if (this.activeQueries >= this.concurrentLimit) {
      return;
    }
    
    let nextQuery: (() => Promise<any>) | undefined;
    
    // Process high priority first
    if (this.highPriorityQueue.length > 0) {
      nextQuery = this.highPriorityQueue.shift();
    } else if (this.normalPriorityQueue.length > 0) {
      nextQuery = this.normalPriorityQueue.shift();
    } else if (this.lowPriorityQueue.length > 0) {
      nextQuery = this.lowPriorityQueue.shift();
    }
    
    if (nextQuery) {
      nextQuery();
    }
  }
  
  getQueueStats(): {
    high: number;
    normal: number;
    low: number;
    active: number;
  } {
    return {
      high: this.highPriorityQueue.length,
      normal: this.normalPriorityQueue.length,
      low: this.lowPriorityQueue.length,
      active: this.activeQueries
    };
  }
}

export const queryScheduler = new QueryScheduler();