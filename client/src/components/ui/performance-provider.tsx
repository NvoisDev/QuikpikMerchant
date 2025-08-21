import React, { createContext, useContext, useMemo } from 'react';
import { createMemoCache } from '@/utils/performance';

interface PerformanceContextType {
  memoizedPricing: (price: number, quantity: number) => number;
  memoizedCurrency: (amount: number) => string;
}

const PerformanceContext = createContext<PerformanceContextType | null>(null);

export function PerformanceProvider({ children }: { children: React.ReactNode }) {
  const contextValue = useMemo(() => {
    // Memoized pricing calculation
    const memoizedPricing = createMemoCache(
      ({ price, quantity }: { price: number; quantity: number }) => price * quantity,
      50
    );

    // Memoized currency formatting
    const memoizedCurrency = createMemoCache(
      (amount: number) => new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2
      }).format(amount),
      100
    );

    return {
      memoizedPricing: (price: number, quantity: number) => 
        memoizedPricing({ price, quantity }),
      memoizedCurrency
    };
  }, []);

  return (
    <PerformanceContext.Provider value={contextValue}>
      {children}
    </PerformanceContext.Provider>
  );
}

export function usePerformance() {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformance must be used within a PerformanceProvider');
  }
  return context;
}