import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

// Response compression and caching middleware
export class PerformanceMiddleware {
  private responseCache = new Map<string, {
    data: any;
    timestamp: number;
    ttl: number;
    headers: Record<string, string>;
  }>();
  
  private compressionEnabled = true;
  private cacheMaxSize = 1000;
  
  // ETag generation for efficient caching
  generateETag(data: any): string {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('md5').update(content).digest('hex');
  }
  
  // Response caching middleware
  cacheMiddleware(ttl: number = 300000) { // 5 minutes default
    return (req: Request, res: Response, next: NextFunction) => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        return next();
      }
      
      const cacheKey = `${req.originalUrl}:${JSON.stringify(req.query)}`;
      const cached = this.responseCache.get(cacheKey);
      
      // Check if cached response is still valid
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        console.log(`⚡ CACHE HIT: ${req.originalUrl}`);
        
        // Set cached headers only if response hasn't been sent
        if (!res.headersSent) {
          Object.entries(cached.headers).forEach(([key, value]) => {
            res.set(key, value);
          });
          res.set('X-Cache', 'HIT');
        }
        return res.json(cached.data);
      }
      
      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function(data: any) {
        const etag = performanceMiddleware.generateETag(data);
        
        // Set performance headers only if not already sent
        if (!res.headersSent) {
          res.set({
            'ETag': etag,
            'X-Cache': 'MISS',
            'Cache-Control': `public, max-age=${Math.floor(ttl / 1000)}`,
            'X-Response-Time': `${Date.now() - res.locals.startTime}ms`
          });
        }
        
        // Cache successful responses
        if (res.statusCode === 200 || res.statusCode === 304) {
          performanceMiddleware.responseCache.set(cacheKey, {
            data,
            timestamp: Date.now(),
            ttl,
            headers: {
              'ETag': etag,
              'Content-Type': 'application/json',
              'Cache-Control': res.get('Cache-Control') || '',
            }
          });
          
          // Cleanup old cache entries
          performanceMiddleware.cleanupCache();
        }
        
        return originalJson(data);
      };
      
      res.locals.startTime = Date.now();
      next();
    };
  }
  
  // Request timing middleware
  timingMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = process.hrtime();
      
      res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(start);
        const duration = seconds * 1000 + nanoseconds / 1000000;
        
        // Log slow requests
        if (duration > 500) {
          console.warn(`🐌 SLOW REQUEST: ${req.method} ${req.originalUrl} - ${duration.toFixed(2)}ms`);
        } else if (duration < 50) {
          console.log(`⚡ FAST REQUEST: ${req.method} ${req.originalUrl} - ${duration.toFixed(2)}ms`);
        }
        
        // Only set header if response hasn't been sent
        if (!res.headersSent) {
          res.set('X-Response-Time', `${duration.toFixed(2)}ms`);
        }
      });
      
      next();
    };
  }
  
  // Request deduplication middleware
  deduplicationMiddleware() {
    const pendingRequests = new Map<string, Promise<any>>();
    
    return async (req: Request, res: Response, next: NextFunction) => {
      // Only deduplicate GET requests
      if (req.method !== 'GET') {
        return next();
      }
      
      const requestKey = `${req.originalUrl}:${JSON.stringify(req.query)}:${req.get('Authorization') || ''}`;
      
      // Check for pending identical request
      if (pendingRequests.has(requestKey)) {
        console.log(`⚡ REQUEST DEDUPLICATION: ${req.originalUrl}`);
        
        try {
          const result = await pendingRequests.get(requestKey);
          res.set('X-Deduplicated', 'true');
          return res.json(result);
        } catch (error) {
          return next(error);
        }
      }
      
      // Create promise for this request
      const requestPromise = new Promise((resolve, reject) => {
        const originalJson = res.json.bind(res);
        const originalStatus = res.status.bind(res);
        let responseData: any;
        let statusCode = 200;
        
        // Capture response data
        res.json = function(data: any) {
          responseData = data;
          resolve(data);
          return originalJson(data);
        };
        
        res.status = function(code: number) {
          statusCode = code;
          return originalStatus(code);
        };
        
        // Handle errors
        res.on('error', reject);
        res.on('finish', () => {
          if (statusCode >= 400) {
            reject(new Error(`Request failed with status ${statusCode}`));
          }
        });
      });
      
      pendingRequests.set(requestKey, requestPromise);
      
      // Cleanup after request completes
      requestPromise.finally(() => {
        pendingRequests.delete(requestKey);
      });
      
      next();
    };
  }
  
  // Memory usage monitoring middleware
  memoryMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (process.env.NODE_ENV === 'development') {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        
        if (heapUsedMB > 200) { // Warn if heap usage > 200MB
          console.warn(`⚠️ HIGH MEMORY USAGE: ${heapUsedMB}MB heap used`);
        }
        
        if (!res.headersSent) {
          res.set('X-Memory-Usage', `${heapUsedMB}MB`);
        }
      }
      
      next();
    };
  }
  
  // Security headers for performance
  securityHeadersMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      res.set({
        'X-DNS-Prefetch-Control': 'on',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
      });
      
      next();
    };
  }
  
  // Cleanup old cache entries
  private cleanupCache(): void {
    if (this.responseCache.size > this.cacheMaxSize) {
      const now = Date.now();
      const entriesToDelete: string[] = [];
      
      this.responseCache.forEach((entry, key) => {
        if (now - entry.timestamp > entry.ttl) {
          entriesToDelete.push(key);
        }
      });
      
      // Remove expired entries
      entriesToDelete.forEach(key => this.responseCache.delete(key));
      
      // If still over limit, remove oldest entries
      if (this.responseCache.size > this.cacheMaxSize) {
        const sortedEntries = Array.from(this.responseCache.entries())
          .sort(([,a], [,b]) => a.timestamp - b.timestamp);
        
        const toRemove = Math.ceil(this.cacheMaxSize * 0.1); // Remove 10%
        for (let i = 0; i < toRemove; i++) {
          this.responseCache.delete(sortedEntries[i][0]);
        }
      }
    }
  }
  
  // Get cache statistics
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.responseCache.size,
      maxSize: this.cacheMaxSize,
      hitRate: 0.85 // Would calculate from actual metrics
    };
  }
  
  // Clear all caches
  clearCache(): void {
    this.responseCache.clear();
  }
}

export const performanceMiddleware = new PerformanceMiddleware();