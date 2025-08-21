import { lazy } from 'react';

// Lazy load heavy components to improve initial loading performance
export const LazyOrderHistory = lazy(() => 
  import('@/components/customer/CustomerOrderHistory').then(module => ({
    default: module.CustomerOrderHistory
  }))
);

export const LazyThankYouPage = lazy(() => 
  import('@/components/customer/ThankYouPage').then(module => ({
    default: module.ThankYouPage
  }))
);

export const LazyPaymentElement = lazy(() => 
  import('@stripe/react-stripe-js').then(module => ({
    default: module.PaymentElement
  }))
);

// Loading fallback component for lazy loading
export const ComponentLoader = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
  </div>
);