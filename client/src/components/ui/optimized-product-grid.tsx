import React, { useMemo, memo, useCallback } from 'react';
import { VirtualScroller } from '@/utils/performance';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StockIndicator } from '@/components/ui/stock-indicator';
import { Package, Plus } from 'lucide-react';
import { formatCurrency } from '@shared/utils/currency';

interface Product {
  id: number;
  name: string;
  price: string;
  stock: number;
  lowStockThreshold?: number;
  imageUrl?: string;
  moq: number;
  promoActive?: boolean;
  promoPrice?: string;
}

interface OptimizedProductGridProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
  viewMode: 'grid' | 'list';
  isLoading?: boolean;
}

// Memoized product card component
const ProductCard = memo(({ 
  product, 
  onAddToCart,
  isOptimized = false 
}: { 
  product: Product; 
  onAddToCart: (product: Product) => void;
  isOptimized?: boolean;
}) => {
  const handleAddToCart = useCallback(() => {
    onAddToCart(product);
  }, [product, onAddToCart]);

  const effectivePrice = product.promoActive && product.promoPrice 
    ? parseFloat(product.promoPrice) 
    : parseFloat(product.price);

  return (
    <Card className="group hover:shadow-lg transition-shadow duration-200 h-full">
      <CardContent className="p-4 h-full flex flex-col">
        {/* Product Image with lazy loading */}
        <div className="relative aspect-square mb-4 bg-gray-100 rounded-lg overflow-hidden">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading={isOptimized ? "lazy" : "eager"}
              decoding="async"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 text-gray-300" />
            </div>
          )}
          
          {/* Sale badge */}
          {product.promoActive && (
            <Badge variant="destructive" className="absolute top-2 left-2 text-xs">
              SALE
            </Badge>
          )}
        </div>

        {/* Product Info */}
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">
              {product.name}
            </h3>
          </div>

          {/* Stock indicator */}
          <StockIndicator 
            stock={product.stock} 
            lowStockThreshold={product.lowStockThreshold || 50}
            size="sm"
            variant="inline"
          />

          {/* Pricing */}
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold text-gray-900">
                {formatCurrency(effectivePrice)}
              </span>
              {product.promoActive && product.promoPrice && (
                <span className="text-sm text-gray-500 line-through">
                  {formatCurrency(parseFloat(product.price))}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">MOQ: {product.moq} units</p>
          </div>

          {/* Add to cart button */}
          <Button
            onClick={handleAddToCart}
            className="w-full mt-auto"
            size="sm"
            disabled={product.stock === 0}
          >
            <Plus className="h-3 w-3 mr-1" />
            {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

ProductCard.displayName = 'ProductCard';

// Optimized skeleton loader
const ProductSkeleton = memo(() => (
  <Card className="h-full">
    <CardContent className="p-4">
      <div className="space-y-3">
        <div className="aspect-square bg-gray-200 rounded-lg animate-pulse" />
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded animate-pulse" />
          <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
        </div>
        <div className="h-8 bg-gray-200 rounded animate-pulse" />
      </div>
    </CardContent>
  </Card>
));

ProductSkeleton.displayName = 'ProductSkeleton';

export const OptimizedProductGrid: React.FC<OptimizedProductGridProps> = memo(({
  products,
  onAddToCart,
  viewMode,
  isLoading = false
}) => {
  // Memoize grid configuration
  const gridConfig = useMemo(() => {
    const itemsPerRow = viewMode === 'grid' ? 3 : 1;
    const itemHeight = viewMode === 'grid' ? 400 : 120;
    return { itemsPerRow, itemHeight };
  }, [viewMode]);

  // Chunk products for virtual scrolling
  const productChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < products.length; i += gridConfig.itemsPerRow) {
      chunks.push(products.slice(i, i + gridConfig.itemsPerRow));
    }
    return chunks;
  }, [products, gridConfig.itemsPerRow]);

  if (isLoading) {
    return (
      <div className={viewMode === "grid" ? 
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" : 
        "space-y-4"
      }>
        {Array.from({ length: 6 }, (_, i) => (
          <ProductSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className={viewMode === "grid" ? 
      "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" : 
      "space-y-4"
    }>
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          onAddToCart={onAddToCart}
          isOptimized={index > 6} // Lazy load images after first 6 products
        />
      ))}
    </div>
  );
});

OptimizedProductGrid.displayName = 'OptimizedProductGrid';