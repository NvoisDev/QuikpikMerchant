import { useMemo } from 'react';
import { useVirtualization } from '@/hooks/useVirtualization';
import { Card, CardContent } from '@/components/ui/card';
import { OptimizedImage } from '@/components/ui/optimized-image';

interface Product {
  id: number;
  name: string;
  price: string;
  imageUrl?: string;
  description?: string;
}

interface VirtualProductGridProps {
  products: Product[];
  containerHeight: number;
  itemHeight: number;
  onProductClick: (product: Product) => void;
}

export function VirtualProductGrid({ 
  products, 
  containerHeight, 
  itemHeight,
  onProductClick 
}: VirtualProductGridProps) {
  const { visibleItems, totalHeight, offsetY, handleScroll } = useVirtualization(
    products,
    { itemHeight, containerHeight }
  );

  const gridItems = useMemo(() => 
    visibleItems.map((product, index) => (
      <div 
        key={product.id} 
        style={{ height: itemHeight }}
        className="px-2 pb-4"
      >
        <Card 
          className="h-full cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onProductClick(product)}
        >
          <CardContent className="p-3">
            <div className="aspect-square mb-3 rounded-lg overflow-hidden">
              <OptimizedImage
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full"
                lazy={true}
              />
            </div>
            <h3 className="font-semibold text-sm line-clamp-2 mb-2">
              {product.name}
            </h3>
            <p className="text-lg font-bold text-green-600">
              £{product.price}
            </p>
          </CardContent>
        </Card>
      </div>
    )),
    [visibleItems, itemHeight, onProductClick]
  );

  return (
    <div 
      className="overflow-auto"
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div 
          style={{ 
            transform: `translateY(${offsetY}px)`,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '1rem'
          }}
        >
          {gridItems}
        </div>
      </div>
    </div>
  );
}