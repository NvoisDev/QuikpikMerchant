import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface StockProgressProps {
  stock: number;
  lowStockThreshold: number;
  maxStock?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
}

export function StockProgress({ 
  stock, 
  lowStockThreshold,
  maxStock,
  className,
  size = 'md',
  showLabels = true
}: StockProgressProps) {
  // Calculate max stock intelligently if not provided
  const calculatedMaxStock = maxStock || Math.max(stock, lowStockThreshold * 3, 100);
  
  const percentage = Math.min((stock / calculatedMaxStock) * 100, 100);
  
  const getProgressColor = () => {
    if (stock === 0) return 'bg-red-500';
    if (stock <= lowStockThreshold) return 'bg-orange-500';
    if (stock <= lowStockThreshold * 2) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getProgressBg = () => {
    if (stock === 0) return 'bg-red-100';
    if (stock <= lowStockThreshold) return 'bg-orange-100';
    if (stock <= lowStockThreshold * 2) return 'bg-yellow-100';
    return 'bg-green-100';
  };

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className={cn('space-y-2', className)}>
      {showLabels && (
        <div className={cn('flex justify-between items-center', textSizes[size])}>
          <span className="text-gray-600">Stock Level</span>
          <span className="font-medium">
            {stock} / {calculatedMaxStock} units
          </span>
        </div>
      )}
      
      <div className="relative">
        <Progress 
          value={percentage} 
          className={cn(
            'w-full',
            sizeClasses[size],
            getProgressBg()
          )}
        />
        
        {/* Low stock threshold indicator */}
        {lowStockThreshold > 0 && (
          <div 
            className="absolute top-0 w-0.5 bg-red-400 opacity-60"
            style={{ 
              left: `${(lowStockThreshold / calculatedMaxStock) * 100}%`,
              height: '100%'
            }}
          />
        )}
      </div>
      
      {showLabels && lowStockThreshold > 0 && (
        <div className={cn('flex justify-between text-gray-500', textSizes[size])}>
          <span>Low Stock: {lowStockThreshold}</span>
          {stock <= lowStockThreshold && (
            <span className="text-orange-600 font-medium">
              Reorder needed
            </span>
          )}
        </div>
      )}
    </div>
  );
}