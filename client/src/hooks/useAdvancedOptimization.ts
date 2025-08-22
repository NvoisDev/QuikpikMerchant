import { useEffect, useRef, useCallback, useMemo } from 'react';
import { ObjectPool, LRUCache, memoryMonitor, ComponentCleanup, stringInterner } from '@/utils/memoryPool';
import { debounce, throttle } from '@/utils/performance';

// Advanced React performance hooks

// Optimized state management with memory pooling
export const useObjectPool = <T>(
  createFn: () => T,
  resetFn?: (obj: T) => void,
  maxSize: number = 20
) => {
  const poolRef = useRef<ObjectPool<T>>();
  
  if (!poolRef.current) {
    poolRef.current = new ObjectPool(createFn, resetFn, maxSize);
  }
  
  useEffect(() => {
    return () => {
      poolRef.current?.clear();
    };
  }, []);
  
  return {
    acquire: () => poolRef.current!.acquire(),
    release: (obj: T) => poolRef.current!.release(obj),
    poolSize: poolRef.current.size
  };
};

// LRU cache hook for expensive computations
export const useLRUCache = <K, V>(capacity: number = 50) => {
  const cacheRef = useRef<LRUCache<K, V>>();
  
  if (!cacheRef.current) {
    cacheRef.current = new LRUCache<K, V>(capacity);
  }
  
  useEffect(() => {
    return () => {
      cacheRef.current?.clear();
    };
  }, []);
  
  const memoizedGet = useCallback((key: K) => {
    return cacheRef.current!.get(key);
  }, []);
  
  const memoizedSet = useCallback((key: K, value: V) => {
    cacheRef.current!.set(key, value);
  }, []);
  
  return {
    get: memoizedGet,
    set: memoizedSet,
    clear: () => cacheRef.current!.clear(),
    size: cacheRef.current.size
  };
};

// Optimized event handlers with automatic cleanup
export const useOptimizedHandlers = () => {
  const cleanupRef = useRef<ComponentCleanup>();
  
  if (!cleanupRef.current) {
    cleanupRef.current = new ComponentCleanup();
  }
  
  useEffect(() => {
    return () => {
      cleanupRef.current?.cleanup();
    };
  }, []);
  
  const createDebouncedHandler = useCallback(<T extends (...args: any[]) => void>(
    handler: T,
    delay: number
  ) => {
    const debouncedHandler = debounce(handler, delay);
    cleanupRef.current!.register(() => {
      // Cleanup any pending timeouts
    });
    return debouncedHandler;
  }, []);
  
  const createThrottledHandler = useCallback(<T extends (...args: any[]) => void>(
    handler: T,
    delay: number
  ) => {
    const throttledHandler = throttle(handler, delay);
    return throttledHandler;
  }, []);
  
  return {
    debounced: createDebouncedHandler,
    throttled: createThrottledHandler
  };
};

// Memory-efficient list virtualization
export const useVirtualizedList = <T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) => {
  const [startIndex, endIndex] = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const start = Math.max(0, 0 - overscan); // Assuming scrollTop = 0 for simplification
    const end = Math.min(items.length, start + visibleCount + overscan * 2);
    
    return [start, end];
  }, [items.length, itemHeight, containerHeight, overscan]);
  
  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, index) => ({
      item,
      index: startIndex + index,
      style: {
        position: 'absolute' as const,
        top: (startIndex + index) * itemHeight,
        height: itemHeight,
        width: '100%'
      }
    }));
  }, [items, startIndex, endIndex, itemHeight]);
  
  return {
    visibleItems,
    totalHeight: items.length * itemHeight,
    startIndex,
    endIndex
  };
};

// Optimized form state management
export const useOptimizedFormState = <T extends Record<string, any>>(
  initialState: T,
  validationFn?: (state: T) => Record<keyof T, string | null>
) => {
  const stateRef = useRef<T>(initialState);
  const { get: getCachedValidation, set: setCachedValidation } = useLRUCache<string, Record<keyof T, string | null>>(10);
  
  const updateField = useCallback(<K extends keyof T>(
    field: K,
    value: T[K]
  ) => {
    stateRef.current = { ...stateRef.current, [field]: value };
  }, []);
  
  const validate = useCallback(() => {
    if (!validationFn) return {};
    
    const stateKey = JSON.stringify(stateRef.current);
    const cached = getCachedValidation(stateKey);
    if (cached) return cached;
    
    const errors = validationFn(stateRef.current);
    setCachedValidation(stateKey, errors);
    return errors;
  }, [validationFn, getCachedValidation, setCachedValidation]);
  
  return {
    state: stateRef.current,
    updateField,
    validate,
    reset: () => {
      stateRef.current = initialState;
    }
  };
};

// Component-level memory monitoring
export const useMemoryMonitor = (componentName: string) => {
  useEffect(() => {
    const cleanup = () => {
      console.log(`🧹 Cleaning up ${componentName} component memory`);
    };
    
    memoryMonitor.addCleanupCallback(cleanup);
    
    return () => {
      cleanup();
    };
  }, [componentName]);
  
  const forceCleanup = useCallback(() => {
    memoryMonitor.performCleanup();
  }, []);
  
  return { forceCleanup };
};

// String optimization hook
export const useStringOptimization = () => {
  const internString = useCallback((str: string) => {
    return stringInterner.intern(str);
  }, []);
  
  return { internString };
};

// Batch processing hook for heavy operations
export const useBatchProcessor = <T, R>(
  processFn: (batch: T[]) => Promise<R[]>,
  batchSize: number = 10,
  delay: number = 50
) => {
  const queueRef = useRef<T[]>([]);
  const processingRef = useRef<boolean>(false);
  const callbacksRef = useRef<Map<T, (result: R) => void>>(new Map());
  
  const processBatch = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) {
      return;
    }
    
    processingRef.current = true;
    const batch = queueRef.current.splice(0, batchSize);
    
    try {
      const results = await processFn(batch);
      
      batch.forEach((item, index) => {
        const callback = callbacksRef.current.get(item);
        if (callback && results[index]) {
          callback(results[index]);
          callbacksRef.current.delete(item);
        }
      });
    } catch (error) {
      console.error('Batch processing failed:', error);
    } finally {
      processingRef.current = false;
      
      // Process next batch if queue is not empty
      if (queueRef.current.length > 0) {
        setTimeout(processBatch, delay);
      }
    }
  }, [processFn, batchSize, delay]);
  
  const addToBatch = useCallback((item: T): Promise<R> => {
    return new Promise((resolve) => {
      queueRef.current.push(item);
      callbacksRef.current.set(item, resolve);
      
      // Start processing if not already processing
      if (!processingRef.current) {
        setTimeout(processBatch, delay);
      }
    });
  }, [processBatch, delay]);
  
  return { addToBatch, queueSize: queueRef.current.length };
};