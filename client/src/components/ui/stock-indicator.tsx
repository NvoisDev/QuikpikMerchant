import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StockIndicatorProps {
  stock: number;
  lowStockThreshold: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  variant?: 'badge' | 'inline' | 'full';
}

export function StockIndicator({ 
  stock, 
  lowStockThreshold, 
  className,
  size = 'md',
  showText = true,
  variant = 'inline'
}: StockIndicatorProps) {
  const getStockStatus = () => {
    if (stock === 0) return 'out_of_stock';
    if (stock <= lowStockThreshold) return 'low_stock';
    if (stock <= lowStockThreshold * 2) return 'moderate_stock';
    return 'in_stock';
  };

  const status = getStockStatus();

  const getStatusConfig = () => {
    switch (status) {
      case 'out_of_stock':
        return {
          icon: XCircle,
          text: 'Out of Stock',
          shortText: 'Out of Stock',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          dotColor: 'bg-red-500'
        };
      case 'low_stock':
        return {
          icon: AlertTriangle,
          text: `Low Stock (${stock} left)`,
          shortText: `${stock} left`,
          color: 'text-orange-600',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200',
          dotColor: 'bg-orange-500'
        };
      case 'moderate_stock':
        return {
          icon: Clock,
          text: `Limited Stock (${stock} available)`,
          shortText: `${stock} units`,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          dotColor: 'bg-yellow-500'
        };
      default:
        return {
          icon: CheckCircle,
          text: `In Stock (${stock} available)`,
          shortText: `${stock} units`,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          dotColor: 'bg-green-500'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  if (variant === 'badge') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-full border',
        config.bgColor,
        config.borderColor,
        config.color,
        sizeClasses[size],
        className
      )}>
        <Icon className={iconSizes[size]} />
        {showText && (
          <span className="font-medium">
            {size === 'sm' ? config.shortText : config.text}
          </span>
        )}
      </span>
    );
  }

  if (variant === 'full') {
    return (
      <div className={cn(
        'flex items-center justify-between p-3 rounded-lg border',
        config.bgColor,
        config.borderColor,
        className
      )}>
        <div className="flex items-center gap-2">
          <Icon className={cn(iconSizes[size], config.color)} />
          {showText && (
            <span className={cn('font-medium', config.color, sizeClasses[size])}>
              {config.text}
            </span>
          )}
        </div>
        {status === 'low_stock' || status === 'moderate_stock' ? (
          <div className="text-right">
            <div className={cn('text-xs', config.color)}>
              Threshold: {lowStockThreshold}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // Default inline variant
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className={cn('w-2 h-2 rounded-full', config.dotColor)} />
      {showText && (
        <span className={cn('font-medium', config.color, sizeClasses[size])}>
          {size === 'sm' ? config.shortText : config.text}
        </span>
      )}
    </div>
  );
}

// Hook for getting stock status info
export function useStockStatus(stock: number, lowStockThreshold: number) {
  const getStockStatus = () => {
    if (stock === 0) return 'out_of_stock';
    if (stock <= lowStockThreshold) return 'low_stock';
    if (stock <= lowStockThreshold * 2) return 'moderate_stock';
    return 'in_stock';
  };

  const status = getStockStatus();
  
  return {
    status,
    isOutOfStock: status === 'out_of_stock',
    isLowStock: status === 'low_stock',
    isModerateStock: status === 'moderate_stock',
    isInStock: status === 'in_stock',
    needsAttention: status === 'out_of_stock' || status === 'low_stock',
    stockPercentage: lowStockThreshold > 0 ? (stock / (lowStockThreshold * 3)) * 100 : 100
  };
}