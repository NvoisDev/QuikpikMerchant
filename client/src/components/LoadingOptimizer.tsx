import React, { Suspense, lazy, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { preloadResource, setupServiceWorkerCache } from '@/utils/performance';

// Critical resources to preload
const CRITICAL_RESOURCES = [
  '/api/auth/user',
  '/api/products',
  '/api/customer-auth/check'
];

// Optimized loading component
const LoadingFallback = ({ variant = 'default' }: { variant?: 'default' | 'grid' | 'card' }) => {
  switch (variant) {
    case 'grid':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      );
    case 'card':
      return (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      );
  }
};

// Performance optimization wrapper
export const LoadingOptimizer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    // Preload critical resources
    CRITICAL_RESOURCES.forEach(resource => {
      preloadResource(resource, 'script');
    });
    
    // Setup service worker for caching
    setupServiceWorkerCache();
    
    // Preload critical CSS
    const criticalCSS = document.createElement('link');
    criticalCSS.rel = 'preload';
    criticalCSS.as = 'style';
    criticalCSS.href = '/src/index.css';
    document.head.appendChild(criticalCSS);
    
    // Optimize font loading
    const fontLink = document.createElement('link');
    fontLink.rel = 'preload';
    fontLink.as = 'font';
    fontLink.type = 'font/woff2';
    fontLink.crossOrigin = 'anonymous';
    fontLink.href = '/fonts/inter-var.woff2';
    document.head.appendChild(fontLink);
    
  }, []);
  
  return <>{children}</>;
};

// Lazy-loaded component wrapper with error boundary
export const LazyComponentWrapper = <T extends React.ComponentType<any>>({
  component: Component,
  fallback,
  errorFallback,
  ...props
}: {
  component: T;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
} & React.ComponentProps<T>) => {
  const [hasError, setHasError] = React.useState(false);
  
  React.useEffect(() => {
    setHasError(false);
  }, [Component]);
  
  if (hasError) {
    return errorFallback || <div>Something went wrong loading this component.</div>;
  }
  
  return (
    <Suspense fallback={fallback || <LoadingFallback />}>
      <ErrorBoundary onError={() => setHasError(true)}>
        <Component {...props} />
      </ErrorBoundary>
    </Suspense>
  );
};

// Simple error boundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  
  componentDidCatch() {
    this.props.onError();
  }
  
  render() {
    if (this.state.hasError) {
      return null;
    }
    
    return this.props.children;
  }
}

// Progressive image loading component
export const ProgressiveImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  quality?: number;
}> = ({ src, alt, className, placeholder, quality = 75 }) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [error, setError] = React.useState(false);
  
  const optimizedSrc = React.useMemo(() => {
    if (!src) return '';
    
    // Add optimization parameters
    const url = new URL(src, window.location.origin);
    url.searchParams.set('q', quality.toString());
    url.searchParams.set('f', 'webp');
    
    return url.toString();
  }, [src, quality]);
  
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Placeholder */}
      {!isLoaded && !error && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
          {placeholder && (
            <img
              src={placeholder}
              alt=""
              className="w-full h-full object-cover opacity-30"
            />
          )}
        </div>
      )}
      
      {/* Main image */}
      {!error && (
        <img
          src={optimizedSrc}
          alt={alt}
          className={`transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${className}`}
          onLoad={() => setIsLoaded(true)}
          onError={() => setError(true)}
          loading="lazy"
          decoding="async"
        />
      )}
      
      {/* Error fallback */}
      {error && (
        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
          <span className="text-gray-400 text-sm">Failed to load image</span>
        </div>
      )}
    </div>
  );
};

export { LoadingFallback };