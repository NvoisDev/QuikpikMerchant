/**
 * Performance optimization utilities
 */

// Debounce function for search inputs
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// Throttle function for scroll events
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

// Image lazy loading with intersection observer
export class LazyImageLoader {
  private observer: IntersectionObserver;
  private images = new Set<HTMLImageElement>();

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              this.observer.unobserve(img);
              this.images.delete(img);
            }
          }
        });
      },
      { rootMargin: '50px' }
    );
  }

  observe(img: HTMLImageElement) {
    this.images.add(img);
    this.observer.observe(img);
  }

  disconnect() {
    this.observer.disconnect();
    this.images.clear();
  }
}

// Memory-efficient array chunking
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Memoization with size limit
export function createMemoCache<T, R>(
  fn: (arg: T) => R,
  maxSize: number = 100
): (arg: T) => R {
  const cache = new Map<T, R>();
  
  return (arg: T): R => {
    const cached = cache.get(arg);
    if (cached !== undefined) {
      return cached;
    }
    
    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }
    
    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
}

// Performance monitoring utilities
export class PerformanceMonitor {
  private marks = new Map<string, number>();
  
  mark(name: string) {
    this.marks.set(name, performance.now());
  }
  
  measure(name: string, startMark: string): number {
    const start = this.marks.get(startMark);
    if (!start) return 0;
    
    const duration = performance.now() - start;
    console.log(`⚡ ${name}: ${duration.toFixed(2)}ms`);
    return duration;
  }
  
  clear() {
    this.marks.clear();
  }
}

// Advanced image optimization
export const optimizeImageUrl = (url: string, options: {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
} = {}): string => {
  if (!url) return '';
  
  // If it's already optimized or a local asset, return as-is
  if (url.includes('?') || url.startsWith('data:') || url.startsWith('/')) {
    return url;
  }
  
  // Basic optimization params
  const params = new URLSearchParams();
  if (options.width) params.set('w', options.width.toString());
  if (options.height) params.set('h', options.height.toString());
  if (options.quality) params.set('q', options.quality.toString());
  if (options.format) params.set('f', options.format);
  
  return `${url}${params.toString() ? '?' + params.toString() : ''}`;
};

// Virtual scrolling helper for large lists
export class VirtualScroller {
  private container: HTMLElement;
  private itemHeight: number;
  private visibleCount: number;
  private totalCount: number;
  private scrollTop = 0;
  
  constructor(
    container: HTMLElement,
    itemHeight: number,
    visibleCount: number,
    totalCount: number
  ) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.visibleCount = visibleCount;
    this.totalCount = totalCount;
  }
  
  getVisibleRange(): { start: number; end: number } {
    const start = Math.floor(this.scrollTop / this.itemHeight);
    const end = Math.min(start + this.visibleCount + 2, this.totalCount); // +2 for buffer
    return { start: Math.max(0, start - 1), end }; // -1 for buffer
  }
  
  updateScrollTop(scrollTop: number) {
    this.scrollTop = scrollTop;
  }
  
  getTotalHeight(): number {
    return this.totalCount * this.itemHeight;
  }
}

// Bundle splitting utilities
import React from 'react';

export const loadComponentAsync = <T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.ComponentType<React.ComponentProps<T>> => {
  return React.lazy(importFn);
};

// Critical CSS detection
export const isCriticalCSS = (selector: string): boolean => {
  // Define critical selectors that should load immediately
  const criticalSelectors = [
    'body', 'html', '.container', '.header', '.nav',
    '.btn', '.card', '.form', '.loading', '.error'
  ];
  
  return criticalSelectors.some(critical => selector.includes(critical));
};

// Preload important resources
export const preloadResource = (href: string, as: 'script' | 'style' | 'image' | 'font') => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.as = as;
  if (as === 'font') {
    link.crossOrigin = 'anonymous';
  }
  document.head.appendChild(link);
};

// Service Worker cache strategy
export const setupServiceWorkerCache = () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  }
};