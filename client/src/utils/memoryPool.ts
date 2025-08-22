/**
 * Advanced memory management and object pooling for performance optimization
 */

// Object pool for reusing expensive objects
export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn?: (obj: T) => void;
  private maxSize: number;

  constructor(createFn: () => T, resetFn?: (obj: T) => void, maxSize: number = 50) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      const obj = this.pool.pop()!;
      return obj;
    }
    return this.createFn();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      if (this.resetFn) {
        this.resetFn(obj);
      }
      this.pool.push(obj);
    }
  }

  clear(): void {
    this.pool = [];
  }

  get size(): number {
    return this.pool.length;
  }
}

// Memory-efficient data structures
export class LRUCache<K, V> {
  private capacity: number;
  private cache = new Map<K, V>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    if (this.cache.has(key)) {
      const value = this.cache.get(key)!;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Efficient string interning for memory optimization
class StringInterner {
  private strings = new Map<string, string>();
  
  intern(str: string): string {
    const existing = this.strings.get(str);
    if (existing) return existing;
    
    this.strings.set(str, str);
    return str;
  }
  
  clear(): void {
    this.strings.clear();
  }
  
  get size(): number {
    return this.strings.size;
  }
}

export const stringInterner = new StringInterner();

// Memory monitoring and cleanup utilities
export class MemoryMonitor {
  private threshold: number;
  private cleanupCallbacks: (() => void)[] = [];
  
  constructor(thresholdMB: number = 100) {
    this.threshold = thresholdMB * 1024 * 1024; // Convert to bytes
  }
  
  addCleanupCallback(callback: () => void): void {
    this.cleanupCallbacks.push(callback);
  }
  
  checkMemoryUsage(): boolean {
    if ('memory' in performance) {
      const used = (performance as any).memory.usedJSHeapSize;
      return used > this.threshold;
    }
    return false;
  }
  
  performCleanup(): void {
    console.log('🧹 Performing memory cleanup...');
    this.cleanupCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.warn('Memory cleanup callback failed:', error);
      }
    });
    
    // Force garbage collection if available
    if ('gc' in window) {
      (window as any).gc();
    }
  }
  
  startMonitoring(intervalMs: number = 10000): () => void {
    const interval = setInterval(() => {
      if (this.checkMemoryUsage()) {
        this.performCleanup();
      }
    }, intervalMs);
    
    return () => clearInterval(interval);
  }
}

export const memoryMonitor = new MemoryMonitor();

// Efficient array operations
export const ArrayUtils = {
  // Fast array deduplication
  deduplicate<T>(arr: T[], keyFn?: (item: T) => any): T[] {
    if (!keyFn) {
      return [...new Set(arr)];
    }
    
    const seen = new Set();
    return arr.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },
  
  // Memory-efficient chunking
  chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  },
  
  // Fast array intersection
  intersect<T>(arr1: T[], arr2: T[]): T[] {
    const set2 = new Set(arr2);
    return arr1.filter(item => set2.has(item));
  },
  
  // Efficient array sorting with memory optimization
  sortInPlace<T>(arr: T[], compareFn?: (a: T, b: T) => number): T[] {
    return arr.sort(compareFn);
  }
};

// Cleanup registration for component unmounting
export class ComponentCleanup {
  private cleanupFunctions = new Set<() => void>();
  
  register(cleanupFn: () => void): void {
    this.cleanupFunctions.add(cleanupFn);
  }
  
  unregister(cleanupFn: () => void): void {
    this.cleanupFunctions.delete(cleanupFn);
  }
  
  cleanup(): void {
    this.cleanupFunctions.forEach(fn => {
      try {
        fn();
      } catch (error) {
        console.warn('Cleanup function failed:', error);
      }
    });
    this.cleanupFunctions.clear();
  }
}