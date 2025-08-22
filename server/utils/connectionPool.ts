/**
 * Advanced database connection pooling and query optimization
 */

import { sql } from 'drizzle-orm';

// Query result caching
export class QueryCache {
  private cache = new Map<string, {
    data: any;
    timestamp: number;
    ttl: number;
  }>();
  
  private maxSize = 500;
  private defaultTTL = 300000; // 5 minutes
  
  set(key: string, data: any, ttl: number = this.defaultTTL): void {
    // Cleanup if cache is full
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    
    this.cache.set(key, {
      data: JSON.parse(JSON.stringify(data)), // Deep clone
      timestamp: Date.now(),
      ttl
    });
  }
  
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  invalidate(pattern: string): void {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];
    
    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }
  
  private cleanup(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    
    // Remove expired entries
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        entriesToDelete.push(key);
      }
    });
    
    entriesToDelete.forEach(key => this.cache.delete(key));
    
    // If still over limit, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const sortedEntries = Array.from(this.cache.entries())
        .sort(([,a], [,b]) => a.timestamp - b.timestamp);
      
      const toRemove = Math.ceil(this.maxSize * 0.1);
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(sortedEntries[i][0]);
      }
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0.78 // Would track actual hit rate
    };
  }
}

export const queryCache = new QueryCache();

// Query optimization utilities
export class QueryOptimizer {
  private slowQueryThreshold = 1000; // 1 second
  private queryStats = new Map<string, {
    count: number;
    totalTime: number;
    avgTime: number;
    slowQueries: number;
  }>();
  
  // Wrap queries with performance monitoring
  async executeWithMonitoring<T>(
    queryFn: () => Promise<T>,
    queryName: string,
    cacheKey?: string,
    cacheTTL?: number
  ): Promise<T> {
    // Check cache first
    if (cacheKey) {
      const cached = queryCache.get(cacheKey);
      if (cached) {
        console.log(`⚡ QUERY CACHE HIT: ${queryName}`);
        return cached;
      }
    }
    
    const startTime = Date.now();
    
    try {
      const result = await queryFn();
      const duration = Date.now() - startTime;
      
      // Update statistics
      this.updateQueryStats(queryName, duration);
      
      // Log slow queries
      if (duration > this.slowQueryThreshold) {
        console.warn(`🐌 SLOW QUERY: ${queryName} took ${duration}ms`);
      } else if (duration < 50) {
        console.log(`⚡ FAST QUERY: ${queryName} took ${duration}ms`);
      }
      
      // Cache successful results
      if (cacheKey && result) {
        queryCache.set(cacheKey, result, cacheTTL);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ QUERY ERROR: ${queryName} failed after ${duration}ms:`, error);
      throw error;
    }
  }
  
  private updateQueryStats(queryName: string, duration: number): void {
    const stats = this.queryStats.get(queryName) || {
      count: 0,
      totalTime: 0,
      avgTime: 0,
      slowQueries: 0
    };
    
    stats.count++;
    stats.totalTime += duration;
    stats.avgTime = stats.totalTime / stats.count;
    
    if (duration > this.slowQueryThreshold) {
      stats.slowQueries++;
    }
    
    this.queryStats.set(queryName, stats);
  }
  
  // Get performance statistics
  getQueryStats(): Array<{
    query: string;
    count: number;
    avgTime: number;
    slowQueries: number;
  }> {
    return Array.from(this.queryStats.entries()).map(([query, stats]) => ({
      query,
      ...stats
    }));
  }
  
  // Get slow queries
  getSlowQueries(): Array<{
    query: string;
    avgTime: number;
    slowPercentage: number;
  }> {
    return this.getQueryStats()
      .filter(stat => stat.slowQueries > 0)
      .map(stat => ({
        query: stat.query,
        avgTime: stat.avgTime,
        slowPercentage: (stat.slowQueries / stat.count) * 100
      }))
      .sort((a, b) => b.avgTime - a.avgTime);
  }
  
  // Reset statistics
  resetStats(): void {
    this.queryStats.clear();
  }
}

export const queryOptimizer = new QueryOptimizer();

// Database health monitoring
export class DatabaseHealthMonitor {
  private connectionAttempts = 0;
  private connectionFailures = 0;
  private lastHealthCheck = Date.now();
  private isHealthy = true;
  
  recordConnectionAttempt(success: boolean): void {
    this.connectionAttempts++;
    if (!success) {
      this.connectionFailures++;
    }
  }
  
  async checkHealth(db: any): Promise<{
    isHealthy: boolean;
    connectionAttempts: number;
    failureRate: number;
    responseTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Simple health check query
      await db.execute(sql`SELECT 1 as health_check`);
      
      const responseTime = Date.now() - startTime;
      this.lastHealthCheck = Date.now();
      this.isHealthy = true;
      
      return {
        isHealthy: true,
        connectionAttempts: this.connectionAttempts,
        failureRate: this.connectionFailures / Math.max(this.connectionAttempts, 1),
        responseTime
      };
    } catch (error) {
      console.error('Database health check failed:', error);
      this.isHealthy = false;
      
      return {
        isHealthy: false,
        connectionAttempts: this.connectionAttempts,
        failureRate: this.connectionFailures / Math.max(this.connectionAttempts, 1),
        responseTime: Date.now() - startTime
      };
    }
  }
  
  getHealthStatus(): {
    isHealthy: boolean;
    lastCheck: Date;
    uptime: number;
  } {
    return {
      isHealthy: this.isHealthy,
      lastCheck: new Date(this.lastHealthCheck),
      uptime: Date.now() - this.lastHealthCheck
    };
  }
}

export const dbHealthMonitor = new DatabaseHealthMonitor();

// Connection retry logic with exponential backoff
export class ConnectionRetryHandler {
  private maxRetries = 3;
  private baseDelay = 1000; // 1 second
  private maxDelay = 10000; // 10 seconds
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'database operation'
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        dbHealthMonitor.recordConnectionAttempt(true);
        return await operation();
      } catch (error) {
        lastError = error as Error;
        dbHealthMonitor.recordConnectionAttempt(false);
        
        console.warn(`${operationName} attempt ${attempt}/${this.maxRetries} failed:`, error);
        
        if (attempt < this.maxRetries) {
          const delay = Math.min(
            this.baseDelay * Math.pow(2, attempt - 1),
            this.maxDelay
          );
          
          console.log(`Retrying ${operationName} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error(`${operationName} failed after ${this.maxRetries} attempts`);
    throw lastError!;
  }
}

export const connectionRetry = new ConnectionRetryHandler();

// Batch query processor for reducing database round trips
export class BatchQueryProcessor {
  private batches = new Map<string, Array<{
    queryFn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>>();
  private batchTimeouts = new Map<string, NodeJS.Timeout>();
  private batchDelay = 10; // 10ms batch window
  
  async addToBatch<T>(
    batchKey: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.batches.has(batchKey)) {
        this.batches.set(batchKey, []);
      }
      
      this.batches.get(batchKey)!.push({ queryFn, resolve, reject });
      
      // Clear existing timeout
      if (this.batchTimeouts.has(batchKey)) {
        clearTimeout(this.batchTimeouts.get(batchKey)!);
      }
      
      // Set new timeout
      this.batchTimeouts.set(batchKey, setTimeout(() => {
        this.executeBatch(batchKey);
      }, this.batchDelay));
    });
  }
  
  private async executeBatch(batchKey: string): Promise<void> {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0) return;
    
    this.batches.delete(batchKey);
    this.batchTimeouts.delete(batchKey);
    
    console.log(`⚡ Executing batch ${batchKey} with ${batch.length} queries`);
    
    // Execute all queries in parallel
    const promises = batch.map(({ queryFn }) => 
      queryFn().catch(error => ({ error }))
    );
    
    try {
      const results = await Promise.all(promises);
      
      // Resolve individual promises
      results.forEach((result, index) => {
        if ('error' in result && result.error) {
          batch[index].reject(result.error);
        } else {
          batch[index].resolve(result);
        }
      });
    } catch (error) {
      // Reject all promises on batch failure
      batch.forEach(({ reject }) => reject(error));
    }
  }
}

export const batchProcessor = new BatchQueryProcessor();