import { Skeleton } from "./skeleton";

// Product card skeleton for product lists
export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <Skeleton className="h-40 w-full" /> {/* Product image */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-3/4" /> {/* Product name */}
        <Skeleton className="h-4 w-1/2" /> {/* Category */}
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-20" /> {/* Price */}
          <Skeleton className="h-4 w-16" /> {/* Stock */}
        </div>
        <Skeleton className="h-8 w-full" /> {/* Button */}
      </div>
    </div>
  );
}

// Order card skeleton
export function OrderCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" /> {/* Order ID */}
          <Skeleton className="h-4 w-32" /> {/* Customer name */}
        </div>
        <Skeleton className="h-6 w-20" /> {/* Status badge */}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" /> {/* Date */}
        <Skeleton className="h-5 w-20" /> {/* Total */}
      </div>
    </div>
  );
}

// Table row skeleton
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-b">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

// Customer card skeleton
export function CustomerCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center space-x-3">
        <Skeleton className="h-10 w-10 rounded-full" /> {/* Avatar */}
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-24" /> {/* Name */}
          <Skeleton className="h-3 w-32" /> {/* Phone */}
        </div>
      </div>
      <Skeleton className="h-3 w-40" /> {/* Email */}
    </div>
  );
}

// Analytics card skeleton
export function AnalyticsCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" /> {/* Title */}
        <Skeleton className="h-5 w-5 rounded" /> {/* Icon */}
      </div>
      <Skeleton className="h-8 w-16" /> {/* Value */}
      <Skeleton className="h-3 w-24" /> {/* Description */}
    </div>
  );
}

// Dashboard skeleton
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <AnalyticsCardSkeleton key={i} />
        ))}
      </div>
      
      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <Skeleton className="h-8 w-8 rounded" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <OrderCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Page loading skeleton with sidebar
export function PageLoadingSkeleton() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar skeleton */}
      <div className="w-64 bg-white border-r border-gray-200 p-4 space-y-4">
        <Skeleton className="h-8 w-32" /> {/* Logo */}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      
      {/* Main content skeleton */}
      <div className="flex-1 p-6">
        <DashboardSkeleton />
      </div>
    </div>
  );
}

// Product grid skeleton
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

// Form skeleton
export function FormSkeleton() {
  return (
    <div className="space-y-6 bg-white p-6 rounded-lg border border-gray-200">
      <Skeleton className="h-6 w-48" /> {/* Form title */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Input */}
          </div>
        ))}
      </div>
      <div className="flex space-x-4">
        <Skeleton className="h-10 w-24" /> {/* Button */}
        <Skeleton className="h-10 w-24" /> {/* Button */}
      </div>
    </div>
  );
}