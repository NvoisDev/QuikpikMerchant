import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { debounce, PerformanceMonitor } from '@/utils/performance';
import { cachedApiRequest } from '@/lib/queryClient';

// Performance monitoring hook
export const usePerformanceMonitor = (componentName: string) => {
  const monitor = useRef(new PerformanceMonitor());
  
  useEffect(() => {
    monitor.current.mark(`${componentName}-mount`);
    
    return () => {
      monitor.current.measure(`${componentName}-lifecycle`, `${componentName}-mount`);
      monitor.current.clear();
    };
  }, [componentName]);
  
  const markEvent = useCallback((eventName: string) => {
    monitor.current.mark(`${componentName}-${eventName}`);
  }, [componentName]);
  
  const measureEvent = useCallback((eventName: string, startEvent: string) => {
    return monitor.current.measure(
      `${componentName}-${eventName}`, 
      `${componentName}-${startEvent}`
    );
  }, [componentName]);
  
  return { markEvent, measureEvent };
};

// Optimized search hook with debouncing
export const useOptimizedSearch = (
  searchFn: (query: string) => Promise<any>,
  delay: number = 300
) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      
      setIsSearching(true);
      setError(null);
      
      try {
        const data = await searchFn(searchQuery);
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, delay),
    [searchFn, delay]
  );
  
  useEffect(() => {
    debouncedSearch(query);
  }, [query, debouncedSearch]);
  
  return {
    query,
    setQuery,
    results,
    isSearching,
    error,
    clearResults: () => setResults([])
  };
};

// Optimized data fetching with caching
export const useCachedQuery = <T>(
  queryKey: string,
  endpoint: string,
  options: {
    enabled?: boolean;
    staleTime?: number;
    useCache?: boolean;
  } = {}
) => {
  const { markEvent, measureEvent } = usePerformanceMonitor(`query-${queryKey}`);
  
  return useQuery<T>({
    queryKey: [queryKey],
    queryFn: async () => {
      markEvent('fetch-start');
      
      try {
        const response = await cachedApiRequest('GET', endpoint, undefined, options.useCache);
        const data = await response.json();
        
        measureEvent('fetch-complete', 'fetch-start');
        return data;
      } catch (error) {
        measureEvent('fetch-error', 'fetch-start');
        throw error;
      }
    },
    enabled: options.enabled,
    staleTime: options.staleTime || 5 * 60 * 1000, // 5 minutes default
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 1
  });
};

// Virtual scrolling hook for large lists
export const useVirtualScroll = <T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(startIndex + visibleCount + 2, items.length);
  const visibleItems = items.slice(Math.max(0, startIndex - 1), endIndex);
  
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    setIsScrolling(true);
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set scroll end detection
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, []);
  
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    visibleItems,
    startIndex: Math.max(0, startIndex - 1),
    totalHeight: items.length * itemHeight,
    offsetY: (Math.max(0, startIndex - 1)) * itemHeight,
    handleScroll,
    isScrolling
  };
};

// Image preloading hook
export const useImagePreloader = (urls: string[]) => {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  
  const preloadImages = useCallback(async (imageUrls: string[]) => {
    setIsLoading(true);
    
    const promises = imageUrls.map(url => {
      return new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = () => reject(url);
        img.src = url;
      });
    });
    
    try {
      const results = await Promise.allSettled(promises);
      const successful = results
        .filter((result): result is PromiseFulfilledResult<string> => 
          result.status === 'fulfilled'
        )
        .map(result => result.value);
      
      setLoadedImages(new Set(successful));
    } catch (error) {
      console.error('Image preloading failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    if (urls.length > 0) {
      preloadImages(urls);
    }
  }, [urls, preloadImages]);
  
  return { loadedImages, isLoading, preloadImages };
};

// Component mounting optimization
export const useComponentDidMount = (callback: () => void | (() => void)) => {
  const callbackRef = useRef(callback);
  const hasRun = useRef(false);
  
  useEffect(() => {
    callbackRef.current = callback;
  });
  
  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      const cleanup = callbackRef.current();
      
      return () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      };
    }
  }, []);
};

// Memory usage optimization
export const useMemoryOptimization = (threshold: number = 50) => {
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  useEffect(() => {
    const checkMemory = () => {
      if ('memory' in performance) {
        const usage = (performance as any).memory.usedJSHeapSize / 1024 / 1024; // MB
        setMemoryUsage(usage);
        
        if (usage > threshold && !isOptimizing) {
          setIsOptimizing(true);
          
          // Force garbage collection if available
          if ('gc' in window) {
            (window as any).gc();
          }
          
          setTimeout(() => setIsOptimizing(false), 1000);
        }
      }
    };
    
    const interval = setInterval(checkMemory, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [threshold, isOptimizing]);
  
  return { memoryUsage, isOptimizing };
};