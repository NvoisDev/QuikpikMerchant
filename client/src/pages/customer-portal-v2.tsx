import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  Search, Package, ShoppingCart, Plus, Minus, Grid, List, 
  Phone, Mail, MapPin, Star, Filter, Store, Truck, 
  CheckCircle, X, ArrowLeft, Heart, Share2, Eye
} from 'lucide-react';

// Types
interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  promoPrice?: string;
  promoActive?: boolean;
  imageUrl?: string;
  images?: string[];
  category?: string;
  stock: number;
  moq: number;
  status: string;
  wholesalerId: string;
  negotiationEnabled?: boolean;
  deliveryExcluded?: boolean;
  palletStock?: number;
  palletMoq?: number;
  sellingFormat?: string;
  wholesaler: {
    id: string;
    businessName: string;
    storeTagline?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
}

interface Customer {
  id: string;
  email: string;
  phone: string;
  name?: string;
  address?: string;
  wholesalerId: string;
}

interface CartItem {
  product: Product;
  quantity: number;
  sellingType: "units" | "pallets";
}

export default function CustomerPortalV2() {
  const [, params] = useRoute('/store/:wholesalerId');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const wholesalerId = params?.wholesalerId;
  const featuredProductId = new URLSearchParams(window.location.search).get('product');
  
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(!featuredProductId);
  
  // Customer authentication state
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Check customer authentication
  const { data: customerAuth, isLoading: authLoading } = useQuery({
    queryKey: ['customer-auth'],
    queryFn: async () => {
      const response = await fetch('/api/customer-auth/verify', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        return data.customer;
      }
      return null;
    },
    retry: false,
    staleTime: 5 * 60 * 1000
  });

  // Fetch wholesaler info
  const { data: wholesaler } = useQuery({
    queryKey: ['wholesaler', wholesalerId],
    queryFn: async () => {
      const response = await fetch(`/api/wholesalers/${wholesalerId}`);
      if (!response.ok) throw new Error('Wholesaler not found');
      return response.json();
    },
    enabled: !!wholesalerId,
    staleTime: 10 * 60 * 1000
  });

  // Fetch products with robust error handling
  const { data: products = [], isLoading: productsLoading, error: productsError, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ['customer-products-v2', wholesalerId],
    queryFn: async () => {
      console.log(`🛒 Fetching products for wholesaler: ${wholesalerId}`);
      
      const response = await fetch(`/api/customer-products/${wholesalerId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include'
      });
      
      console.log(`📡 Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to load products (${response.status})`);
      }
      
      const data = await response.json();
      console.log(`✅ Products loaded: ${data.length} items`);
      return data;
    },
    enabled: !!wholesalerId,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 30 * 1000, // Reduce stale time
    gcTime: 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Reduce unnecessary refetches
    refetchOnReconnect: true
  });

  // Filter products
  const filteredProducts = useMemo(() => {
    console.log(`🔍 Filtering products:`, {
      totalProducts: products.length,
      searchTerm,
      selectedCategory,
      sampleProducts: products.slice(0, 3).map(p => ({ 
        id: p.id, 
        name: p.name, 
        status: p.status, 
        category: p.category 
      }))
    });
    
    const filtered = products.filter(product => {
      const matchesSearch = !searchTerm || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
      const isActive = product.status === 'active';
      
      // Debug logging removed for performance
      
      return matchesSearch && matchesCategory && isActive;
    });
    
    console.log(`✅ Filtered to ${filtered.length} products`);
    return filtered;
  }, [products, searchTerm, selectedCategory]);

  // Get categories
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats);
  }, [products]);

  // Cart calculations
  const cartStats = useMemo(() => {
    let totalItems = 0;
    let subtotal = 0;

    cart.forEach(item => {
      totalItems += item.quantity;
      const price = item.product.promoActive && item.product.promoPrice 
        ? parseFloat(item.product.promoPrice) 
        : parseFloat(item.product.price);
      subtotal += price * item.quantity;
    });

    return { totalItems, subtotal };
  }, [cart]);

  // Add to cart function
  const addToCart = useCallback((product: Product, quantity: number, sellingType: "units" | "pallets" = "units") => {
    if (isGuestMode) {
      toast({
        title: "Contact Required",
        description: "Please contact the wholesaler to be added as a customer before placing orders.",
        variant: "default"
      });
      return;
    }

    setCart(prevCart => {
      const existingItem = prevCart.find(item => 
        item.product.id === product.id && item.sellingType === sellingType
      );
      
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id && item.sellingType === sellingType
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      
      return [...prevCart, { product, quantity, sellingType }];
    });
    
    toast({
      title: "Added to Cart",
      description: `${product.name} (${quantity} ${sellingType}) added to cart`,
    });
  }, [isGuestMode, toast]);

  // Update customer auth state
  useEffect(() => {
    if (customerAuth) {
      setCustomer(customerAuth);
      setIsGuestMode(false);
    } else {
      setIsGuestMode(true);
    }
  }, [customerAuth]);

  // Product Card Component
  const ProductCard = ({ product }: { product: Product }) => {
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
            {product.imageUrl || (product.images && product.images.length > 0) ? (
              <img 
                src={product.imageUrl || (product.images && product.images[0])} 
                alt={product.name}
                className="w-full h-48 object-contain rounded-lg bg-white"
              />
            ) : (
              <div className="w-full h-48 bg-gray-50 rounded-lg flex items-center justify-center">
                <Package className="w-12 h-12 text-gray-300" />
              </div>
            )}
            
            {hasPromo && (
              <Badge className="absolute top-2 left-2 bg-red-500 text-white">
                PROMO
              </Badge>
            )}
          </div>
          
          {/* Product Info */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg text-gray-900 line-clamp-2 group-hover:text-green-700 transition-colors">
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
              {product.negotiationEnabled && (
                <Badge variant="outline" className="text-xs border-orange-200 text-orange-700">
                  💬 Negotiable
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
            
            {/* Actions */}
            <div className="pt-2 space-y-2">
              <Button
                onClick={() => addToCart(product, product.moq)}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                disabled={product.stock < product.moq}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add to Cart
              </Button>
              
              {product.negotiationEnabled && (
                <Button
                  variant="outline"
                  className="w-full border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={() => {
                    toast({
                      title: "Contact Wholesaler",
                      description: "Use the contact information to discuss custom pricing.",
                    });
                  }}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Request Quote
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Debug logging - keep for now
  console.log(`🚀 Portal State: ${products.length} total, ${filteredProducts.length} filtered`);

  // Loading state
  if (authLoading || productsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-600">Loading store...</p>
        </div>
      </div>
    );
  }

  // Error state - only show if we have a real error AND no products
  if (productsError && products.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-4">
            <Package className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900">Unable to Load Store</h2>
            <p className="text-gray-600">
              There was an issue loading this store. Please check your connection and try again.
            </p>
            <p className="text-sm text-red-600">
              {productsError instanceof Error ? productsError.message : 'Unknown error'}
            </p>
            <Button onClick={() => refetchProducts()} className="w-full">
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
                {wholesaler?.storeTagline && (
                  <p className="text-sm text-gray-600">{wholesaler.storeTagline}</p>
                )}
              </div>
            </div>
            
            {/* Cart */}
            <div className="flex items-center space-x-4">
              {!isGuestMode && (
                <Button variant="outline" className="relative">
                  <ShoppingCart className="w-5 h-5" />
                  {cartStats.totalItems > 0 && (
                    <Badge className="absolute -top-2 -right-2 bg-green-600">
                      {cartStats.totalItems}
                    </Badge>
                  )}
                </Button>
              )}
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
            
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full lg:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category || 'unknown'} value={category || ''}>
                    {category || 'Uncategorized'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
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
          
          {/* Results info */}
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>{filteredProducts.length} products found</span>
            {isGuestMode && (
              <Badge variant="outline" className="text-orange-600 border-orange-200">
                Guest Mode - Contact wholesaler to place orders
              </Badge>
            )}
          </div>
        </div>

        {/* Products Grid */}
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

      {/* Contact Info Footer */}
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