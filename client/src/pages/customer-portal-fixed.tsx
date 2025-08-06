import { useState, useEffect, useMemo } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  Search, Package, ShoppingCart, Plus, Minus, Grid, List, 
  Phone, Mail, MapPin, Star, Filter, Store, Truck, 
  CheckCircle, X, ArrowLeft, Heart, Share2, Eye, LogIn
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

export default function CustomerPortalFixed() {
  const [, params] = useRoute('/store/:wholesalerId');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const wholesalerId = params?.wholesalerId;
  const featuredProductId = new URLSearchParams(window.location.search).get('product');
  
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState<'all' | 'under-10' | '10-50' | 'over-50'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'featured'>('featured');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(!featuredProductId);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  
  // Customer authentication state
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authStep, setAuthStep] = useState<'phone' | 'verify'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

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
    queryKey: ['customer-products-fixed', wholesalerId],
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
    staleTime: 30 * 1000,
    gcTime: 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true
  });

  // Featured product
  const featuredProduct = useMemo(() => {
    if (!featuredProductId) return null;
    return products.find(p => p.id === parseInt(featuredProductId));
  }, [products, featuredProductId]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(product => {
      const matchesSearch = !searchTerm || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
      
      const price = parseFloat(product.promoActive && product.promoPrice ? product.promoPrice : product.price);
      const matchesPrice = priceRange === "all" || 
        (priceRange === "under-10" && price < 10) ||
        (priceRange === "10-50" && price >= 10 && price <= 50) ||
        (priceRange === "over-50" && price > 50);
      
      const isActive = product.status === 'active';
      
      return matchesSearch && matchesCategory && matchesPrice && isActive;
    });

    // Sort products
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'price':
          const priceA = parseFloat(a.promoActive && a.promoPrice ? a.promoPrice : a.price);
          const priceB = parseFloat(b.promoActive && b.promoPrice ? b.promoPrice : b.price);
          return priceA - priceB;
        case 'featured':
        default:
          return 0; // Keep original order for featured
      }
    });

    return filtered;
  }, [products, searchTerm, selectedCategory, priceRange, sortBy]);

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

  // SMS Authentication mutations
  const sendVerificationMutation = useMutation({
    mutationFn: async (phone: string) => {
      const response = await apiRequest("POST", "/api/customer-auth/send-verification", { 
        phone, 
        wholesalerId 
      });
      return response.json();
    },
    onSuccess: () => {
      setAuthStep('verify');
      toast({
        title: "Verification Code Sent",
        description: "Please check your phone for the verification code.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification code",
        variant: "destructive",
      });
    }
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async ({ phone, code }: { phone: string; code: string }) => {
      const response = await apiRequest("POST", "/api/customer-auth/verify-code", { 
        phone, 
        code, 
        wholesalerId 
      });
      return response.json();
    },
    onSuccess: (data) => {
      setCustomer(data.customer);
      setIsGuestMode(false);
      setShowAuthModal(false);
      queryClient.invalidateQueries({ queryKey: ['customer-auth'] });
      toast({
        title: "Welcome!",
        description: "You're now logged in and can place orders.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid verification code",
        variant: "destructive",
      });
    }
  });

  // Add to cart function
  const addToCart = (product: Product, quantity: number, sellingType: "units" | "pallets" = "units") => {
    if (isGuestMode) {
      setShowAuthModal(true);
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
  };

  // Remove from cart
  const removeFromCart = (productId: number, sellingType: "units" | "pallets") => {
    setCart(prevCart => prevCart.filter(item => 
      !(item.product.id === productId && item.sellingType === sellingType)
    ));
  };

  // Update cart quantity
  const updateCartQuantity = (productId: number, sellingType: "units" | "pallets", newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId, sellingType);
      return;
    }

    setCart(prevCart => prevCart.map(item =>
      item.product.id === productId && item.sellingType === sellingType
        ? { ...item, quantity: newQuantity }
        : item
    ));
  };

  // Update customer auth state
  useEffect(() => {
    if (customerAuth) {
      setCustomer(customerAuth);
      setIsGuestMode(false);
    } else {
      setIsGuestMode(true);
    }
  }, [customerAuth]);

  // Featured product effect
  useEffect(() => {
    if (featuredProduct) {
      setSelectedProduct(featuredProduct);
      setShowProductModal(true);
    }
  }, [featuredProduct]);

  // Product Card Component
  const ProductCard = ({ product, isFeatureView = false }: { product: Product; isFeatureView?: boolean }) => {
    const price = product.promoActive && product.promoPrice 
      ? parseFloat(product.promoPrice) 
      : parseFloat(product.price);
    
    const originalPrice = parseFloat(product.price);
    const hasPromo = product.promoActive && product.promoPrice && price < originalPrice;

    const cardSize = isFeatureView ? "large" : viewMode === "grid" ? "normal" : "list";

    return (
      <Card className={`group hover:shadow-lg transition-all duration-200 border-0 shadow-md ${
        cardSize === "large" ? "col-span-full max-w-2xl mx-auto" : 
        cardSize === "list" ? "flex" : ""
      }`}>
        <CardContent className={`p-4 ${cardSize === "list" ? "flex gap-4 w-full" : ""}`}>
          {/* Product Image */}
          <div className={`relative ${
            cardSize === "large" ? "mb-6" : cardSize === "list" ? "w-32 h-32 flex-shrink-0" : "mb-4"
          }`}>
            {product.imageUrl || (product.images && product.images.length > 0) ? (
              <img 
                src={product.imageUrl || (product.images && product.images[0])} 
                alt={product.name}
                className={`object-contain rounded-lg bg-white cursor-pointer ${
                  cardSize === "large" ? "w-full h-80" : 
                  cardSize === "list" ? "w-full h-full" : "w-full h-48"
                }`}
                onClick={() => {
                  setSelectedProduct(product);
                  setShowProductModal(true);
                }}
              />
            ) : (
              <div className={`bg-gray-50 rounded-lg flex items-center justify-center cursor-pointer ${
                cardSize === "large" ? "w-full h-80" : 
                cardSize === "list" ? "w-full h-full" : "w-full h-48"
              }`}
                onClick={() => {
                  setSelectedProduct(product);
                  setShowProductModal(true);
                }}
              >
                <Package className="w-12 h-12 text-gray-300" />
              </div>
            )}
            
            {hasPromo && (
              <Badge className="absolute top-2 left-2 bg-red-500 text-white">
                PROMO
              </Badge>
            )}
            
            <div className="absolute top-2 right-2 flex gap-1">
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 p-0 bg-white/80 hover:bg-white"
                onClick={() => {
                  setSelectedProduct(product);
                  setShowProductModal(true);
                }}
              >
                <Eye className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {/* Product Info */}
          <div className={`space-y-3 ${cardSize === "list" ? "flex-1" : ""}`}>
            <h3 className={`font-semibold text-gray-900 line-clamp-2 group-hover:text-green-700 transition-colors ${
              cardSize === "large" ? "text-2xl" : "text-lg"
            }`}>
              {product.name}
            </h3>
            
            {product.description && (
              <p className={`text-gray-600 line-clamp-2 ${
                cardSize === "large" ? "text-base" : "text-sm"
              }`}>
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
              {product.deliveryExcluded && (
                <Badge variant="outline" className="text-xs border-blue-200 text-blue-700">
                  📍 Collection Only
                </Badge>
              )}
            </div>
            
            {/* Pricing */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`font-bold text-green-600 ${
                  cardSize === "large" ? "text-3xl" : "text-2xl"
                }`}>
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
              {product.palletMoq && (
                <p className="text-sm text-blue-600">
                  Pallet Option: MOQ {product.palletMoq} pallets • Stock: {product.palletStock}
                </p>
              )}
            </div>
            
            {/* Actions */}
            <div className={`pt-2 space-y-2 ${cardSize === "list" ? "flex flex-col justify-end" : ""}`}>
              <Button
                onClick={() => addToCart(product, product.moq)}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                disabled={product.stock < product.moq}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add to Cart (MOQ: {product.moq})
              </Button>
              
              {product.palletMoq && (
                <Button
                  onClick={() => addToCart(product, product.palletMoq, "pallets")}
                  variant="outline"
                  className="w-full border-blue-200 text-blue-600 hover:bg-blue-50"
                  disabled={!product.palletStock || product.palletStock < product.palletMoq}
                >
                  <Package className="w-4 h-4 mr-2" />
                  Add Pallet (MOQ: {product.palletMoq})
                </Button>
              )}
              
              {product.negotiationEnabled && (
                <Button
                  variant="outline"
                  className="w-full border-orange-200 text-orange-600 hover:bg-orange-50"
                  onClick={() => {
                    toast({
                      title: "Contact Wholesaler",
                      description: "Use the contact information below to discuss custom pricing.",
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
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
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
            
            {/* Header Actions */}
            <div className="flex items-center space-x-4">
              {isGuestMode ? (
                <Button 
                  onClick={() => setShowAuthModal(true)}
                  variant="outline"
                  size="sm"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Login to Order
                </Button>
              ) : (
                <>
                  <div className="text-sm text-gray-600">
                    Welcome, {customer?.name || customer?.phone}
                  </div>
                  <Button variant="outline" className="relative">
                    <ShoppingCart className="w-5 h-5" />
                    {cartStats.totalItems > 0 && (
                      <Badge className="absolute -top-2 -right-2 bg-green-600">
                        {cartStats.totalItems}
                      </Badge>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Featured Product Section */}
      {featuredProduct && (
        <section className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Featured Product</h2>
              <p className="text-gray-600">Special showcase from our collection</p>
            </div>
            <ProductCard product={featuredProduct} isFeatureView />
            <div className="text-center mt-6">
              <Button 
                onClick={() => setShowAllProducts(true)}
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
              >
                View All Products
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Main Content */}
      {showAllProducts && (
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
              
              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger className="w-full lg:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Prices</SelectItem>
                  <SelectItem value="under-10">Under £10</SelectItem>
                  <SelectItem value="10-50">£10 - £50</SelectItem>
                  <SelectItem value="over-50">Over £50</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full lg:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                  <SelectItem value="price">Price Low-High</SelectItem>
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
                  Login to place orders
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
      )}

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

      {/* Authentication Modal */}
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Login to Place Orders</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {authStep === 'phone' ? (
              <>
                <p className="text-sm text-gray-600">
                  Enter your phone number to receive a verification code.
                </p>
                <Input
                  placeholder="Phone number (e.g., +44 7123 456789)"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
                <Button 
                  onClick={() => sendVerificationMutation.mutate(phoneNumber)}
                  disabled={!phoneNumber || sendVerificationMutation.isPending}
                  className="w-full"
                >
                  {sendVerificationMutation.isPending ? "Sending..." : "Send Verification Code"}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Enter the verification code sent to {phoneNumber}.
                </p>
                <Input
                  placeholder="Verification code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      setAuthStep('phone');
                      setVerificationCode('');
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button 
                    onClick={() => verifyCodeMutation.mutate({ phone: phoneNumber, code: verificationCode })}
                    disabled={!verificationCode || verifyCodeMutation.isPending}
                    className="flex-1"
                  >
                    {verifyCodeMutation.isPending ? "Verifying..." : "Verify"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Modal */}
      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedProduct.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Product Image */}
                {selectedProduct.imageUrl || (selectedProduct.images && selectedProduct.images.length > 0) ? (
                  <img 
                    src={selectedProduct.imageUrl || (selectedProduct.images && selectedProduct.images[0])} 
                    alt={selectedProduct.name}
                    className="w-full h-64 object-contain rounded-lg bg-white"
                  />
                ) : (
                  <div className="w-full h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                    <Package className="w-16 h-16 text-gray-300" />
                  </div>
                )}
                
                {/* Product Details */}
                <div className="space-y-4">
                  {selectedProduct.description && (
                    <p className="text-gray-600">{selectedProduct.description}</p>
                  )}
                  
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-bold text-green-600">
                      £{(selectedProduct.promoActive && selectedProduct.promoPrice 
                        ? parseFloat(selectedProduct.promoPrice) 
                        : parseFloat(selectedProduct.price)).toFixed(2)}
                    </span>
                    {selectedProduct.promoActive && selectedProduct.promoPrice && (
                      <span className="text-xl text-gray-500 line-through">
                        £{parseFloat(selectedProduct.price).toFixed(2)}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">MOQ:</span> {selectedProduct.moq} units
                    </div>
                    <div>
                      <span className="font-medium">Stock:</span> {selectedProduct.stock}
                    </div>
                    {selectedProduct.category && (
                      <div>
                        <span className="font-medium">Category:</span> {selectedProduct.category}
                      </div>
                    )}
                    {selectedProduct.palletMoq && (
                      <div>
                        <span className="font-medium">Pallet MOQ:</span> {selectedProduct.palletMoq}
                      </div>
                    )}
                  </div>
                  
                  {/* Add to Cart Actions */}
                  <div className="space-y-2 pt-4">
                    <Button
                      onClick={() => {
                        addToCart(selectedProduct, selectedProduct.moq);
                        setShowProductModal(false);
                      }}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      disabled={selectedProduct.stock < selectedProduct.moq}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add to Cart (MOQ: {selectedProduct.moq})
                    </Button>
                    
                    {selectedProduct.palletMoq && (
                      <Button
                        onClick={() => {
                          addToCart(selectedProduct, selectedProduct.palletMoq, "pallets");
                          setShowProductModal(false);
                        }}
                        variant="outline"
                        className="w-full border-blue-200 text-blue-600 hover:bg-blue-50"
                        disabled={!selectedProduct.palletStock || selectedProduct.palletStock < selectedProduct.palletMoq}
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Add Pallet (MOQ: {selectedProduct.palletMoq})
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}