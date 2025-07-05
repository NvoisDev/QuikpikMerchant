import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Plus, Minus, Trash2, Package, Star, Store, Mail, Phone, MapPin, CreditCard, Search, Filter, Grid, List, Eye, MoreHorizontal, ShieldCheck, Truck, ArrowLeft, Heart, Share2 } from "lucide-react";
import Logo from "@/components/ui/logo";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Utility functions
const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num) : num;
  return number.toLocaleString();
};

const getCurrencySymbol = (currency = 'GBP'): string => {
  switch (currency?.toUpperCase()) {
    case 'GBP': return '£';
    case 'EUR': return '€';
    case 'USD': return '$';
    default: return '£';
  }
};

// Loading skeleton components
const ProductCardSkeleton = () => (
  <Card className="h-full">
    <CardContent className="p-4">
      <div className="space-y-3">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex space-x-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-12" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const FeaturedProductSkeleton = () => (
  <Card className="mb-8">
    <CardContent className="p-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </CardContent>
  </Card>
);

// Types
interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  moq: number;
  stock: number;
  category?: string;
  imageUrl?: string;
  status: string;
  priceVisible: boolean;
  negotiationEnabled: boolean;
  minimumBidPrice?: string;
  wholesaler: {
    id: string;
    businessName: string;
    businessPhone?: string;
    businessAddress?: string;
    profileImageUrl?: string;
    defaultCurrency?: string;
  };
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface CustomerData {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

export default function CustomerPortal() {
  const { id: wholesalerId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // State management
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showAllProducts, setShowAllProducts] = useState(false);
  
  // Modal states
  const [showQuantityEditor, setShowQuantityEditor] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [negotiationProduct, setNegotiationProduct] = useState<Product | null>(null);
  const [negotiationData, setNegotiationData] = useState({
    quantity: 1,
    offeredPrice: '',
    message: ''
  });
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: ''
  });

  // Check if this is preview mode
  const isPreviewMode = window.location.pathname.includes('/preview-store');
  
  // Get featured product ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const featuredProductId = urlParams.get('featured');

  // Fetch wholesaler data
  const { data: wholesaler } = useQuery({
    queryKey: ['/api/marketplace/wholesaler', wholesalerId],
    queryFn: async () => {
      const response = await fetch(`/api/marketplace/wholesaler/${wholesalerId}`);
      if (!response.ok) throw new Error("Failed to fetch wholesaler");
      return response.json();
    },
    enabled: !!wholesalerId
  });

  // Fetch featured product if specified
  const { data: featuredProduct, isLoading: featuredLoading } = useQuery({
    queryKey: ['/api/marketplace/products', featuredProductId],
    queryFn: async () => {
      const response = await fetch(`/api/marketplace/products/${featuredProductId}`);
      if (!response.ok) throw new Error("Failed to fetch featured product");
      return response.json();
    },
    enabled: !!featuredProductId
  });

  // Fetch all products for the wholesaler
  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['/api/marketplace/products', { wholesalerId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (wholesalerId) params.append('wholesalerId', wholesalerId);
      const response = await fetch(`/api/marketplace/products?${params}`);
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
    enabled: !!wholesalerId
  });

  // Memoized calculations
  const filteredProducts = useMemo(() => {
    return products.filter((product: Product) => {
      const matchesSearch = !searchTerm || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || 
        product.category === selectedCategory;
      
      return matchesSearch && matchesCategory && product.status === 'active';
    });
  }, [products, searchTerm, selectedCategory]);

  const otherProducts = useMemo(() => {
    if (!featuredProduct) return filteredProducts;
    return filteredProducts.filter(p => p.id !== featuredProduct.id);
  }, [filteredProducts, featuredProduct]);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p: Product) => p.category).filter(Boolean));
    return Array.from(cats);
  }, [products]);

  const cartStats = useMemo(() => {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = cart.reduce((sum, item) => {
      const price = parseFloat(item.product.price);
      return sum + (price * item.quantity);
    }, 0);
    return { totalItems, totalValue };
  }, [cart]);

  // Event handlers
  const openQuantityEditor = useCallback((product: Product) => {
    if (isPreviewMode) {
      toast({
        title: "Preview Mode",
        description: "Cart functionality is disabled in preview mode.",
        variant: "default"
      });
      return;
    }
    setSelectedProduct(product);
    setEditQuantity(product.moq);
    setShowQuantityEditor(true);
  }, [isPreviewMode, toast]);

  const openNegotiation = useCallback((product: Product) => {
    if (isPreviewMode) {
      toast({
        title: "Preview Mode",
        description: "Negotiation functionality is disabled in preview mode.",
        variant: "default"
      });
      return;
    }
    setNegotiationProduct(product);
    setNegotiationData({
      quantity: product.moq,
      offeredPrice: '',
      message: ''
    });
    setShowNegotiation(true);
  }, [isPreviewMode, toast]);

  const addToCart = useCallback((product: Product, quantity: number) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prevCart, { product, quantity }];
    });
    
    toast({
      title: "Added to Cart",
      description: `${product.name} (${quantity} units) added to your cart`,
    });
  }, [toast]);

  // Handle add to cart from quantity editor
  const handleAddToCart = () => {
    if (selectedProduct && editQuantity >= selectedProduct.moq) {
      addToCart(selectedProduct, editQuantity);
      setShowQuantityEditor(false);
      setSelectedProduct(null);
    }
  };

  // Handle negotiation submission
  const submitNegotiation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/marketplace/negotiations", data);
    },
    onSuccess: () => {
      toast({
        title: "Quote Request Sent",
        description: "Your custom quote request has been sent to the supplier. You'll receive an email response within 24 hours.",
      });
      setShowNegotiation(false);
      setNegotiationProduct(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send quote request. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleNegotiationSubmit = () => {
    if (!negotiationProduct) return;
    
    submitNegotiation.mutate({
      productId: negotiationProduct.id,
      wholesalerId: wholesalerId,
      quantity: negotiationData.quantity,
      offeredPrice: negotiationData.offeredPrice,
      message: negotiationData.message,
      customerName: customerData.name,
      customerEmail: customerData.email,
      customerPhone: customerData.phone
    });
  };

  // Early loading state
  if (featuredProductId && featuredLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8 space-y-8">
          <FeaturedProductSkeleton />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <div className="bg-orange-500 text-white px-4 py-2 text-center text-sm font-medium">
          🔍 Store Preview Mode - Cart and checkout features are disabled for testing
        </div>
      )}

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Logo variant="icon-only" size="sm" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {wholesaler?.businessName || "Loading..."}
                </h1>
                <p className="text-sm text-gray-600">Premium wholesale products</p>
              </div>
            </div>
            
            {!isPreviewMode && (
              <Button
                onClick={() => setShowCheckout(true)}
                className="bg-green-600 hover:bg-green-700 relative"
                disabled={cart.length === 0}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Cart ({cartStats.totalItems})
                {cartStats.totalItems > 0 && (
                  <Badge className="ml-2 bg-green-800">
                    {getCurrencySymbol(wholesaler?.defaultCurrency)}{cartStats.totalValue.toFixed(2)}
                  </Badge>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Featured Product */}
        {featuredProduct && (
          <Card className="mb-8 bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Star className="w-5 h-5 text-yellow-500 fill-current" />
                <CardTitle className="text-green-800">Featured Product</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  {featuredProduct.imageUrl ? (
                    <img 
                      src={featuredProduct.imageUrl} 
                      alt={featuredProduct.name}
                      className="w-full h-64 object-cover rounded-lg shadow-md"
                    />
                  ) : (
                    <div className="w-full h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Package className="w-20 h-20 text-gray-400" />
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{featuredProduct.name}</h2>
                    {featuredProduct.description && (
                      <p className="text-gray-600 mt-2">{featuredProduct.description}</p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Price:</span>
                      <div className="font-semibold text-lg text-green-600">
                        {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(featuredProduct.price).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-600">Min Order:</span>
                      <div className="font-semibold">{formatNumber(featuredProduct.moq)} units</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Stock:</span>
                      <div className="font-semibold">{formatNumber(featuredProduct.stock)} units</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Supplier:</span>
                      <div className="font-semibold text-sm">{featuredProduct.wholesaler.businessName}</div>
                    </div>
                  </div>

                  {/* Negotiation Badge for Featured Product */}
                  {featuredProduct.negotiationEnabled && (
                    <div className="mb-4">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 px-3 py-1">
                        💬 Price Negotiable - Request Custom Quote Available!
                      </Badge>
                      {featuredProduct.minimumBidPrice && (
                        <p className="text-sm text-gray-600 mt-2">
                          💡 Minimum acceptable price: {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(featuredProduct.minimumBidPrice).toFixed(2)}
                        </p>
                      )}
                    </div>
                  )}
                  
                  <div className="flex space-x-3">
                    {featuredProduct.negotiationEnabled ? (
                      <>
                        <Button
                          onClick={() => openNegotiation(featuredProduct)}
                          variant="outline"
                          className="flex-1 border-blue-600 text-blue-600 hover:bg-blue-50"
                        >
                          <Mail className="w-4 h-4 mr-2" />
                          Request Custom Quote
                        </Button>
                        <Button
                          onClick={() => openQuantityEditor(featuredProduct)}
                          className="px-6 bg-green-600 hover:bg-green-700"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add to Cart
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={() => openQuantityEditor(featuredProduct)}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add to Cart
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search and Filters */}
        {(!featuredProduct || showAllProducts) && (
          <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex space-x-2">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-40">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("grid")}
                    className="rounded-r-none"
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className="rounded-l-none"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Results Summary */}
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                {showAllProducts || !featuredProduct 
                  ? `${filteredProducts.length} products found`
                  : `Showing ${Math.min(otherProducts.length, 6)} of ${otherProducts.length} products`
                }
              </span>
              {showAllProducts && featuredProduct && (
                <Button 
                  onClick={() => setShowAllProducts(false)}
                  variant="ghost"
                  size="sm"
                  className="text-green-600 hover:text-green-700"
                >
                  Show Less
                </Button>
              )}
            </div>
          </div>
        )}

        {/* More Products Available Section */}
        {featuredProduct && !showAllProducts && otherProducts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">More Products Available</h2>
              <Button
                onClick={() => setShowAllProducts(true)}
                variant="outline"
                size="sm"
                className="text-green-600 border-green-600 hover:bg-green-50"
              >
                View All Products ({otherProducts.length})
              </Button>
            </div>
          </div>
        )}

        {/* Products Grid */}
        {productsLoading ? (
          <div className={`${viewMode === "grid" 
            ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" 
            : "space-y-4"
          }`}>
            {[...Array(6)].map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : (
          <div className={`${viewMode === "grid" 
            ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" 
            : "space-y-4"
          }`}>
            {(() => {
              let productsToShow;
              if (showAllProducts || !featuredProduct) {
                productsToShow = filteredProducts;
              } else {
                productsToShow = otherProducts.slice(0, 6);
              }
              
              if (productsToShow.length === 0) {
                return (
                  <div className="col-span-full text-center py-12">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
                    <p className="text-gray-500">
                      {searchTerm ? 'Try adjusting your search terms' : 'No products available at the moment'}
                    </p>
                  </div>
                );
              }
              
              return productsToShow.map((product: Product) => (
                viewMode === "grid" ? (
                  // Grid View
                  <Card key={product.id} className="border hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      {/* Product Image */}
                      <div className="mb-3">
                        {product.imageUrl ? (
                          <img 
                            src={product.imageUrl} 
                            alt={product.name}
                            className="w-full h-32 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                            <Package className="w-16 h-16 text-gray-400" />
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <h3 className="font-semibold text-lg truncate">{product.name}</h3>
                          {product.description && (
                            <p className="text-sm text-gray-600 line-clamp-2">{product.description}</p>
                          )}
                        </div>
                        
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Price:</span>
                            <span className="font-semibold">{getCurrencySymbol(wholesaler?.defaultCurrency || "GBP")}{parseFloat(product.price).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Min order:</span>
                            <span>{formatNumber(product.moq)} units</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Stock:</span>
                            <span className={product.stock < 100 ? "text-red-600" : ""}>{formatNumber(product.stock)} units</span>
                          </div>
                        </div>
                        
                        <div className="text-xs text-gray-500 flex items-center">
                          <Store className="w-3 h-3 mr-1" />
                          {product.wholesaler.businessName}
                        </div>
                        
                        {/* Negotiation Indicator */}
                        {product.negotiationEnabled && (
                          <div className="mb-2">
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                              💬 Price Negotiable
                            </Badge>
                          </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="flex space-x-2 pt-2">
                          {product.negotiationEnabled ? (
                            <>
                              <Button 
                                onClick={() => openNegotiation(product)}
                                size="sm"
                                variant="outline"
                                className="flex-1 border-blue-600 text-blue-600 hover:bg-blue-50"
                              >
                                <Mail className="w-3 h-3 mr-1" />
                                Quote
                              </Button>
                              <Button 
                                onClick={() => openQuantityEditor(product)}
                                size="sm"
                                className="px-3 bg-green-600 hover:bg-green-700"
                                title="Add to cart at listed price"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </>
                          ) : (
                            <Button 
                              onClick={() => openQuantityEditor(product)}
                              size="sm"
                              className="w-full bg-green-600 hover:bg-green-700"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add to Cart
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  // List View - Optimized horizontal layout
                  <Card key={product.id} className="border hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-4">
                        {/* Small Product Image on Left */}
                        <div className="flex-shrink-0">
                          {product.imageUrl ? (
                            <img 
                              src={product.imageUrl} 
                              alt={product.name}
                              className="w-16 h-16 object-cover rounded-lg border"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center border">
                              <Package className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                        </div>
                        
                        {/* Product Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-lg text-gray-900 truncate">{product.name}</h3>
                              {product.category && (
                                <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded-md mt-1">
                                  {product.category}
                                </span>
                              )}
                              {product.description && (
                                <p className="text-sm text-gray-600 mt-1 line-clamp-1">{product.description}</p>
                              )}
                            </div>
                            
                            {/* Price and Action Buttons */}
                            <div className="flex-shrink-0 text-right ml-4">
                              <div className="text-lg font-bold text-gray-900 mb-2">
                                {getCurrencySymbol(wholesaler?.defaultCurrency || "GBP")}{parseFloat(product.price).toFixed(2)}
                              </div>
                              
                              {/* Action Buttons */}
                              <div className="flex space-x-2">
                                {product.negotiationEnabled ? (
                                  <>
                                    <Button 
                                      onClick={() => openNegotiation(product)}
                                      size="sm"
                                      variant="outline"
                                      className="border-blue-600 text-blue-600 hover:bg-blue-50"
                                    >
                                      <Mail className="w-3 h-3 mr-1" />
                                      Quote
                                    </Button>
                                    <Button 
                                      onClick={() => openQuantityEditor(product)}
                                      size="sm"
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      Add
                                    </Button>
                                  </>
                                ) : (
                                  <Button 
                                    onClick={() => openQuantityEditor(product)}
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    <Plus className="w-3 h-3 mr-1" />
                                    Add to Cart
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Product Stats */}
                          <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                            <div>
                              <span className="text-gray-500">MOQ:</span>
                              <div className="font-medium text-gray-900">{formatNumber(product.moq)} units</div>
                            </div>
                            <div>
                              <span className="text-gray-500">Stock:</span>
                              <div className={`font-medium ${product.stock < 100 ? "text-red-600" : "text-green-600"}`}>
                                {formatNumber(product.stock)} units
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-500">Supplier:</span>
                              <div className="font-medium text-gray-900 truncate flex items-center">
                                <Store className="w-3 h-3 mr-1" />
                                {product.wholesaler.businessName}
                              </div>
                            </div>
                          </div>
                          
                          {/* Negotiation Indicator */}
                          {product.negotiationEnabled && (
                            <div className="mt-2">
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                                💬 Price Negotiable
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              ));
            })()}
          </div>
        )}
      </div>

      {/* Modals and dialogs would go here... */}
      {/* Quantity Editor Modal */}
      {showQuantityEditor && selectedProduct && (
        <Dialog open={showQuantityEditor} onOpenChange={setShowQuantityEditor}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add {selectedProduct.name} to Cart</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                <p>Minimum order: {selectedProduct.moq} units</p>
                <p>Available stock: {formatNumber(selectedProduct.stock)} units</p>
                <p>Price per unit: {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(selectedProduct.price).toFixed(2)}</p>
              </div>
              
              <div className="flex items-center space-x-3">
                <Label>Quantity:</Label>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditQuantity(Math.max(selectedProduct.moq, editQuantity - 1))}
                    disabled={editQuantity <= selectedProduct.moq}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    type="number"
                    value={editQuantity}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || selectedProduct.moq;
                      setEditQuantity(Math.max(selectedProduct.moq, value));
                    }}
                    className="w-20 text-center"
                    min={selectedProduct.moq}
                    max={selectedProduct.stock}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditQuantity(Math.min(selectedProduct.stock, editQuantity + 1))}
                    disabled={editQuantity >= selectedProduct.stock}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="text-lg font-semibold">
                Total: {getCurrencySymbol(wholesaler?.defaultCurrency)}{(parseFloat(selectedProduct.price) * editQuantity).toFixed(2)}
              </div>
              
              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => setShowQuantityEditor(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleAddToCart} className="flex-1 bg-green-600 hover:bg-green-700">
                  Add to Cart
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Powered by Quikpik Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center text-sm text-gray-500">
            <span className="mr-2">Powered by</span>
            <Logo variant="full" size="sm" />
          </div>
        </div>
      </footer>
    </div>
  );
}