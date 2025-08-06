import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Search, Package, ShoppingCart, Plus, Store, 
  Phone, Mail, MapPin, Grid, List, Filter
} from 'lucide-react';

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  promoPrice?: string;
  promoActive?: boolean;
  imageUrl?: string;
  category?: string;
  stock: number;
  moq: number;
  status: string;
  wholesaler: {
    businessName: string;
    email?: string;
    phone?: string;
    address?: string;
  };
}

export default function CustomerStore() {
  const [, params] = useRoute('/store/:wholesalerId');
  const wholesalerId = params?.wholesalerId;
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Load products
  useEffect(() => {
    if (!wholesalerId) return;
    
    const loadProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log(`Loading products for: ${wholesalerId}`);
        
        const response = await fetch(`/api/customer-products/${wholesalerId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to load products: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Loaded ${data.length} products`);
        
        setProducts(data);
      } catch (err) {
        console.error('Error loading products:', err);
        setError(err instanceof Error ? err.message : 'Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    
    loadProducts();
  }, [wholesalerId]);
  
  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = !searchTerm || 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const isActive = product.status === 'active';
    
    return matchesSearch && matchesCategory && isActive;
  });
  
  // Get categories
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  
  // Get wholesaler info from first product
  const wholesaler = products[0]?.wholesaler;
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-600">Loading store...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <Package className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900">Unable to Load Store</h2>
            <p className="text-gray-600">
              There was an issue loading this store. Please check your connection and try again.
            </p>
            <p className="text-sm text-red-600">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Store className="w-8 h-8 text-green-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {wholesaler?.businessName || 'Wholesale Store'}
                </h1>
                <p className="text-sm text-gray-600">Browse our products</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="text-green-600 border-green-200">
                {filteredProducts.length} products
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            
            <div className="flex bg-gray-100 rounded-lg p-1">
              <Button
                onClick={() => setViewMode("grid")}
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => setViewMode("list")}
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Products */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No products found</h3>
            <p className="text-gray-600">Try adjusting your search or filter criteria.</p>
          </div>
        ) : (
          <div className={`${
            viewMode === "grid" 
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" 
              : "space-y-4"
          }`}>
            {filteredProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>

      {/* Contact Footer */}
      {wholesaler && (
        <footer className="bg-white border-t mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Contact Wholesaler</h3>
              <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600">
                {wholesaler.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    <a href={`mailto:${wholesaler.email}`} className="hover:text-green-600">
                      {wholesaler.email}
                    </a>
                  </div>
                )}
                {wholesaler.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <a href={`tel:${wholesaler.phone}`} className="hover:text-green-600">
                      {wholesaler.phone}
                    </a>
                  </div>
                )}
                {wholesaler.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>{wholesaler.address}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const price = product.promoActive && product.promoPrice 
    ? parseFloat(product.promoPrice) 
    : parseFloat(product.price);
  
  const originalPrice = parseFloat(product.price);
  const hasPromo = product.promoActive && product.promoPrice && price < originalPrice;

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 border-0 shadow-md">
      <CardContent className="p-4">
        {/* Product Image */}
        <div className="mb-4 relative">
          {product.imageUrl ? (
            <img 
              src={product.imageUrl} 
              alt={product.name}
              className="w-full h-48 object-contain rounded-lg bg-white"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          
          <div className={`w-full h-48 bg-gray-50 rounded-lg flex items-center justify-center ${product.imageUrl ? 'hidden' : ''}`}>
            <Package className="w-12 h-12 text-gray-300" />
          </div>
          
          {hasPromo && (
            <Badge className="absolute top-2 left-2 bg-red-500 text-white">
              PROMO
            </Badge>
          )}
        </div>
        
        {/* Product Info */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg text-gray-900 group-hover:text-green-700 transition-colors">
            {product.name}
          </h3>
          
          {product.description && (
            <p className="text-sm text-gray-600 line-clamp-2">
              {product.description}
            </p>
          )}
          
          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {product.category && (
              <Badge variant="secondary" className="text-xs">
                {product.category}
              </Badge>
            )}
          </div>
          
          {/* Pricing */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-green-600">
                £{price.toFixed(2)}
              </span>
              {hasPromo && (
                <span className="text-lg text-gray-500 line-through">
                  £{originalPrice.toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">
              MOQ: {product.moq} units • Stock: {product.stock}
            </p>
          </div>
          
          {/* Contact Button */}
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => {
              const email = product.wholesaler.email;
              const subject = `Inquiry about ${product.name}`;
              const body = `Hello,\n\nI'm interested in purchasing ${product.name}.\n\nPlease provide more information about pricing and availability.\n\nThank you!`;
              
              if (email) {
                window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
              } else {
                alert('Please contact the wholesaler directly for pricing information.');
              }
            }}
          >
            <Mail className="w-4 h-4 mr-2" />
            Contact for Pricing
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}