/**
 * DOM optimization utilities for faster rendering and interactions
 */

// Efficient DOM manipulation utilities
export class DOMOptimizer {
  private observerPool: IntersectionObserver[] = [];
  private mutationObservers: MutationObserver[] = [];
  
  // Optimized element creation with reuse
  createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    attributes?: Partial<HTMLElementTagNameMap[K]>,
    children?: (Node | string)[]
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tagName);
    
    // Apply attributes efficiently
    if (attributes) {
      Object.assign(element, attributes);
    }
    
    // Append children in batch
    if (children && children.length > 0) {
      const fragment = document.createDocumentFragment();
      children.forEach(child => {
        fragment.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
      element.appendChild(fragment);
    }
    
    return element;
  }
  
  // Batch DOM updates to minimize reflows
  batchDOMUpdates(updates: (() => void)[]): void {
    // Use requestAnimationFrame for optimal timing
    requestAnimationFrame(() => {
      const startTime = performance.now();
      
      // Execute all updates in a single frame
      updates.forEach(update => {
        try {
          update();
        } catch (error) {
          console.warn('DOM update failed:', error);
        }
      });
      
      const duration = performance.now() - startTime;
      if (duration > 16) { // More than one frame
        console.warn(`DOM updates took ${duration.toFixed(2)}ms (>16ms)`);
      }
    });
  }
  
  // Optimized scroll event handling
  optimizeScrollHandling(
    element: HTMLElement,
    callback: (scrollTop: number, scrollLeft: number) => void,
    throttleMs: number = 16
  ): () => void {
    let ticking = false;
    let lastScrollTop = element.scrollTop;
    let lastScrollLeft = element.scrollLeft;
    
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentScrollTop = element.scrollTop;
          const currentScrollLeft = element.scrollLeft;
          
          // Only call callback if scroll position actually changed
          if (currentScrollTop !== lastScrollTop || currentScrollLeft !== lastScrollLeft) {
            callback(currentScrollTop, currentScrollLeft);
            lastScrollTop = currentScrollTop;
            lastScrollLeft = currentScrollLeft;
          }
          
          ticking = false;
        });
        ticking = true;
      }
    };
    
    element.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }
  
  // Efficient intersection observer with pooling
  createIntersectionObserver(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ): IntersectionObserver {
    const observer = new IntersectionObserver(callback, {
      rootMargin: '50px', // Default root margin for better UX
      threshold: [0, 0.25, 0.5, 0.75, 1], // Multiple thresholds for granular control
      ...options
    });
    
    this.observerPool.push(observer);
    return observer;
  }
  
  // Optimized resize observer
  createResizeObserver(
    callback: (entries: ResizeObserverEntry[]) => void
  ): ResizeObserver {
    let resizeTimer: number;
    
    const throttledCallback = (entries: ResizeObserverEntry[]) => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        callback(entries);
      }, 100); // Throttle to 100ms
    };
    
    return new ResizeObserver(throttledCallback);
  }
  
  // Efficient style updates
  updateStyles(
    element: HTMLElement,
    styles: Partial<CSSStyleDeclaration>
  ): void {
    // Batch style updates
    Object.assign(element.style, styles);
  }
  
  // Optimize focus management
  manageFocus(container: HTMLElement): {
    trapFocus: () => void;
    restoreFocus: () => void;
    cleanup: () => void;
  } {
    let previousActiveElement: Element | null = null;
    let focusableElements: HTMLElement[] = [];
    
    const updateFocusableElements = () => {
      const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      focusableElements = Array.from(container.querySelectorAll(selector)) as HTMLElement[];
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        updateFocusableElements();
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    
    return {
      trapFocus: () => {
        previousActiveElement = document.activeElement;
        updateFocusableElements();
        
        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        }
        
        document.addEventListener('keydown', handleKeyDown);
      },
      
      restoreFocus: () => {
        if (previousActiveElement && 'focus' in previousActiveElement) {
          (previousActiveElement as HTMLElement).focus();
        }
      },
      
      cleanup: () => {
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
  }
  
  // Cleanup all observers
  cleanup(): void {
    this.observerPool.forEach(observer => observer.disconnect());
    this.observerPool = [];
    
    this.mutationObservers.forEach(observer => observer.disconnect());
    this.mutationObservers = [];
  }
}

export const domOptimizer = new DOMOptimizer();

// CSS optimization utilities
export class CSSOptimizer {
  private dynamicStyles = new Map<string, HTMLStyleElement>();
  
  // Inject critical CSS
  injectCriticalCSS(css: string, id: string = 'critical-css'): void {
    if (document.getElementById(id)) return;
    
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    
    // Insert before other stylesheets for highest priority
    const firstLink = document.querySelector('link[rel="stylesheet"]');
    if (firstLink) {
      document.head.insertBefore(style, firstLink);
    } else {
      document.head.appendChild(style);
    }
  }
  
  // Dynamic style injection with cleanup
  injectDynamicCSS(css: string, id: string): () => void {
    const existingStyle = this.dynamicStyles.get(id);
    if (existingStyle) {
      existingStyle.textContent = css;
      return () => this.removeDynamicCSS(id);
    }
    
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
    
    this.dynamicStyles.set(id, style);
    
    return () => this.removeDynamicCSS(id);
  }
  
  private removeDynamicCSS(id: string): void {
    const style = this.dynamicStyles.get(id);
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
      this.dynamicStyles.delete(id);
    }
  }
  
  // Optimize animations
  optimizeAnimations(): void {
    // Reduce animations on low-end devices
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isLowEndDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
    
    if (prefersReducedMotion || isLowEndDevice) {
      this.injectDynamicCSS(`
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      `, 'reduced-motion');
    }
  }
  
  // Cleanup all dynamic styles
  cleanup(): void {
    this.dynamicStyles.forEach((style, id) => {
      this.removeDynamicCSS(id);
    });
  }
}

export const cssOptimizer = new CSSOptimizer();

// Image optimization utilities
export class ImageOptimizer {
  private loadedImages = new Set<string>();
  private imageCache = new Map<string, HTMLImageElement>();
  
  // Preload images efficiently
  preloadImages(urls: string[], priority: 'high' | 'normal' | 'low' = 'normal'): Promise<void[]> {
    const promises = urls.map(url => this.preloadImage(url, priority));
    return Promise.all(promises);
  }
  
  private preloadImage(url: string, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<void> {
    if (this.loadedImages.has(url)) {
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      // Set loading priority
      if ('loading' in img) {
        img.loading = priority === 'low' ? 'lazy' : 'eager';
      }
      
      img.onload = () => {
        this.loadedImages.add(url);
        this.imageCache.set(url, img);
        resolve();
      };
      
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      
      img.src = url;
    });
  }
  
  // Get optimized image URL
  getOptimizedImageUrl(
    originalUrl: string,
    options: {
      width?: number;
      height?: number;
      quality?: number;
      format?: 'webp' | 'avif' | 'jpeg' | 'png';
    } = {}
  ): string {
    if (!originalUrl || originalUrl.startsWith('data:')) return originalUrl;
    
    // Check for WebP support
    const supportsWebP = this.supportsWebP();
    const supportsAVIF = this.supportsAVIF();
    
    let format = options.format;
    if (!format) {
      if (supportsAVIF) format = 'avif';
      else if (supportsWebP) format = 'webp';
      else format = 'jpeg';
    }
    
    // Build optimized URL (this would integrate with your image service)
    const params = new URLSearchParams();
    if (options.width) params.set('w', options.width.toString());
    if (options.height) params.set('h', options.height.toString());
    if (options.quality) params.set('q', options.quality.toString());
    params.set('f', format);
    
    const separator = originalUrl.includes('?') ? '&' : '?';
    return `${originalUrl}${separator}${params.toString()}`;
  }
  
  private supportsWebP(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  }
  
  private supportsAVIF(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    try {
      return canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0;
    } catch {
      return false;
    }
  }
  
  // Clear image cache
  clearCache(): void {
    this.loadedImages.clear();
    this.imageCache.clear();
  }
}

export const imageOptimizer = new ImageOptimizer();

// Initialize optimizations
export const initializeDOMOptimizations = () => {
  // Set up CSS optimizations
  cssOptimizer.optimizeAnimations();
  
  // Preload critical images
  const criticalImages = Array.from(document.querySelectorAll('img[data-critical]'))
    .map(img => (img as HTMLImageElement).src)
    .filter(Boolean);
  
  if (criticalImages.length > 0) {
    imageOptimizer.preloadImages(criticalImages, 'high');
  }
  
  // Set up cleanup on page unload
  window.addEventListener('beforeunload', () => {
    domOptimizer.cleanup();
    cssOptimizer.cleanup();
    imageOptimizer.clearCache();
  });
};