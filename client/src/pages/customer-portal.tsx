import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Plus, Minus, Trash2, Package, Star, Store, Mail, Phone, MapPin, CreditCard, Search, Filter, Grid, List, Eye, MoreHorizontal } from "lucide-react";
import Logo from "@/components/ui/logo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/currencies";

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || "");

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
  notes?: string;
}

export default function CustomerPortal() {
  const params = useParams<{ id?: string }>();
  const [location] = useLocation();
  const { toast } = useToast();
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showQuantityEditor, setShowQuantityEditor] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string>("");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [negotiationProduct, setNegotiationProduct] = useState<Product | null>(null);
  const [negotiationData, setNegotiationData] = useState({
    quantity: 1,
    offeredPrice: '',
    message: ''
  });
  const [customerData, setCustomerData] = useState<CustomerData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: ''
  });

  // Get featured product ID from URL
  const featuredProductId = params?.id ? parseInt(params.id) : null;

  // Fetch featured product if specified
  const { data: featuredProduct } = useQuery({
    queryKey: [`/api/marketplace/products/${featuredProductId}`],
    enabled: !!featuredProductId
  });

  // Fetch all available products for browsing
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['/api/marketplace/products']
  });

  // Filter out featured product from "other products" list
  const otherProducts = allProducts.filter(p => p.id !== featuredProductId);

  // Get unique categories for filtering
  const categories = ["All Categories", ...Array.from(new Set(allProducts.map(p => p.category).filter(Boolean)))];

  // Filter products based on search and category
  const filteredProducts = allProducts.filter(product => {
    const matchesSearch = !searchTerm || 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.wholesaler.businessName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === "All Categories" || product.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const openQuantityEditor = (product: Product) => {
    setSelectedProduct(product);
    setEditQuantity(product.moq);
    setShowQuantityEditor(true);
  };

  const openNegotiation = (product: Product) => {
    setNegotiationProduct(product);
    setNegotiationData({
      quantity: product.moq,
      offeredPrice: '',
      message: ''
    });
    setShowNegotiation(true);
  };

  const addToCart = (product: Product, quantity: number) => {
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
  };

  const handleAddToCart = () => {
    if (selectedProduct && editQuantity >= selectedProduct.moq) {
      addToCart(selectedProduct, editQuantity);
      setShowQuantityEditor(false);
      setSelectedProduct(null);
    }
  };

  const incrementQuantity = () => {
    setEditQuantity(prev => prev + 1);
  };

  const decrementQuantity = () => {
    if (selectedProduct) {
      setEditQuantity(prev => Math.max(selectedProduct.moq, prev - 1));
    }
  };

  const handleQuantityInput = (value: string) => {
    const numValue = parseInt(value) || 0;
    if (selectedProduct) {
      setEditQuantity(Math.max(selectedProduct.moq, numValue));
    }
  };

  const updateCartQuantity = (productId: number, newQuantity: number) => {
    if (newQuantity === 0) {
      removeFromCart(productId);
      return;
    }
    
    setCart(prevCart =>
      prevCart.map(item =>
        item.product.id === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  };

  const removeFromCart = (productId: number) => {
    setCart(prevCart => prevCart.filter(item => item.product.id !== productId));
    toast({
      title: "Removed from Cart",
      description: "Item removed from your cart",
    });
  };

  const getTotalAmount = () => {
    return cart.reduce((total, item) => {
      return total + (parseFloat(item.product.price) * item.quantity);
    }, 0);
  };

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  // Order submission mutation
  const orderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const response = await apiRequest("POST", "/api/customer/orders", orderData);
      if (!response.ok) {
        throw new Error("Failed to create order");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Order Placed Successfully!",
        description: `Order #${data.orderId} has been created. You'll receive an email confirmation shortly.`,
      });
      setCart([]);
      setShowCheckout(false);
      setCustomerData({
        name: '',
        email: '',
        phone: '',
        address: '',
        notes: ''
      });
    },
    onError: (error: any) => {
      toast({
        title: "Order Failed",
        description: error.message || "Failed to place order. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Create payment intent mutation
  const createPaymentMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const response = await apiRequest("POST", "/api/customer/create-payment", orderData);
      return response.json();
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setShowPayment(true);
      setShowCheckout(false);
    },
    onError: (error: any) => {
      toast({
        title: "Payment Setup Failed",
        description: error.message || "Failed to setup payment. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Create negotiation mutation
  const createNegotiationMutation = useMutation({
    mutationFn: async () => {
      if (!negotiationProduct) throw new Error("No product selected");
      
      const response = await apiRequest("POST", "/api/marketplace/negotiations", {
        productId: negotiationProduct.id,
        retailerId: `customer_${Date.now()}`, // Temporary customer ID
        originalPrice: parseFloat(negotiationProduct.price),
        offeredPrice: parseFloat(negotiationData.offeredPrice),
        quantity: negotiationData.quantity,
        message: negotiationData.message
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Price Quote Requested",
        description: `Your request for ${negotiationProduct?.name} has been sent to ${negotiationProduct?.wholesaler.businessName}. They will respond with their best price.`,
      });
      setShowNegotiation(false);
      setNegotiationProduct(null);
      setNegotiationData({ quantity: 1, offeredPrice: '', message: '' });
    },
    onError: (error: any) => {
      toast({
        title: "Request Failed",
        description: error.message || "Failed to send price request. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleNegotiationSubmit = () => {
    if (!negotiationData.offeredPrice || parseFloat(negotiationData.offeredPrice) <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid price for your request.",
        variant: "destructive"
      });
      return;
    }

    if (negotiationData.quantity < (negotiationProduct?.moq || 1)) {
      toast({
        title: "Quantity Too Low",
        description: `Minimum order quantity is ${negotiationProduct?.moq} units.`,
        variant: "destructive"
      });
      return;
    }

    createNegotiationMutation.mutate();
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({
        title: "Cart Empty",
        description: "Please add items to your cart before checkout",
        variant: "destructive"
      });
      return;
    }

    const orderData = {
      customerName: customerData.name,
      customerEmail: customerData.email,
      customerPhone: customerData.phone,
      customerAddress: customerData.address,
      items: cart.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.product.price,
        total: (parseFloat(item.product.price) * item.quantity).toFixed(2)
      })),
      totalAmount: getTotalAmount().toFixed(2),
      notes: customerData.notes
    };

    createPaymentMutation.mutate(orderData);
  };

  // Use GBP as fallback since it's the default in schema
  const wholesalerCurrency = featuredProduct?.wholesaler?.defaultCurrency || 'GBP';
  const currencySymbol = wholesalerCurrency === 'GBP' ? '£' : 
                        wholesalerCurrency === 'EUR' ? '€' : '$';

  // Payment form component
  const PaymentForm = () => {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);

    const handlePaymentSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!stripe || !elements) {
        return;
      }

      setIsProcessing(true);

      try {
        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/customer/payment-success`,
          },
        });

        if (error) {
          toast({
            title: "Payment Failed",
            description: error.message,
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Payment Error",
          description: "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    };

    return (
      <form onSubmit={handlePaymentSubmit} className="space-y-4">
        <PaymentElement />
        <div className="flex space-x-3">
          <Button 
            type="button"
            variant="outline" 
            onClick={() => {
              setShowPayment(false);
              setShowCheckout(true);
            }}
            className="flex-1"
          >
            Back to Checkout
          </Button>
          <Button 
            type="submit"
            disabled={!stripe || !elements || isProcessing}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                Pay {currencySymbol}{getTotalAmount().toFixed(2)}
              </>
            )}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Customer Portal Header */}
      <div className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Logo size="sm" variant="full" />
              <span className="text-gray-400">|</span>
              <span className="text-sm text-gray-600">Customer Portal</span>
            </div>
            
            {/* Cart Summary */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium">
                  {getTotalItems()} items - {currencySymbol}{getTotalAmount().toFixed(2)}
                </span>
              </div>
              {cart.length > 0 && (
                <Button 
                  onClick={() => setShowCheckout(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Checkout
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Featured Product Section */}
        {featuredProduct && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <span>Featured Product</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Product Image */}
                <div>
                  {featuredProduct.imageUrl ? (
                    <img 
                      src={featuredProduct.imageUrl} 
                      alt={featuredProduct.name}
                      className="w-full h-64 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-64 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Package className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Product Details */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{featuredProduct.name}</h2>
                    {featuredProduct.description && (
                      <p className="text-gray-600 mt-2">{featuredProduct.description}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Price per unit:</span>
                      <span className="font-semibold text-xl">{currencySymbol}{parseFloat(featuredProduct.price).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Minimum order:</span>
                      <span className="font-medium">{featuredProduct.moq} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Available stock:</span>
                      <span className="font-medium">{featuredProduct.stock} units</span>
                    </div>
                  </div>

                  {/* Supplier Info */}
                  <div className="border-t pt-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Store className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">{featuredProduct.wholesaler.businessName}</span>
                    </div>
                    {featuredProduct.wholesaler.businessPhone && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Phone className="w-4 h-4" />
                        <span>{featuredProduct.wholesaler.businessPhone}</span>
                      </div>
                    )}
                  </div>

                  <Button 
                    onClick={() => openQuantityEditor(featuredProduct)}
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="lg"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add to Cart ({featuredProduct.moq} units minimum)
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Package className="w-5 h-5" />
                <span>{featuredProduct ? 'More Products Available' : 'All Products'}</span>
              </CardTitle>
              {featuredProduct && !showAllProducts && (
                <Button 
                  onClick={() => setShowAllProducts(true)}
                  variant="outline"
                  className="border-green-600 text-green-600 hover:bg-green-50"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  See All Products
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Search and Filter Controls */}
            {(showAllProducts || !featuredProduct) && (
              <div className="mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Search Input */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search products, descriptions, or suppliers..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {/* Category Filter */}
                  <div className="sm:w-48">
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* View Mode Toggle */}
                  <div className="flex border rounded-lg">
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

            {/* Products Grid/List */}
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
                
                return productsToShow.map((product) => (
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
                              className="w-full h-32 object-cover rounded"
                            />
                          ) : (
                            <div className="w-full h-32 bg-gray-200 rounded flex items-center justify-center">
                              <Package className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <h3 className="font-semibold text-sm">{product.name}</h3>
                          {product.description && (
                            <p className="text-xs text-gray-600 line-clamp-2">{product.description}</p>
                          )}
                          <div className="text-xs text-gray-600 space-y-1">
                            <div className="flex justify-between">
                              <span>Price:</span>
                              <span className="font-medium">{currencySymbol}{parseFloat(product.price).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>MOQ:</span>
                              <span>{product.moq} units</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Stock:</span>
                              <span className={product.stock < 100 ? "text-red-600" : ""}>{product.stock} units</span>
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
                                  Request Quote
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
                    // List View
                    <Card key={product.id} className="border hover:shadow-lg transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          {/* Product Image */}
                          <div className="w-24 h-24 flex-shrink-0">
                            {product.imageUrl ? (
                              <img 
                                src={product.imageUrl} 
                                alt={product.name}
                                className="w-full h-full object-cover rounded"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center">
                                <Package className="w-6 h-6 text-gray-400" />
                              </div>
                            )}
                          </div>

                          {/* Product Details */}
                          <div className="flex-1 space-y-2">
                            <div>
                              <h3 className="font-semibold">{product.name}</h3>
                              {product.description && (
                                <p className="text-sm text-gray-600 line-clamp-2">{product.description}</p>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <div className="flex items-center space-x-1">
                                <Store className="w-4 h-4" />
                                <span>{product.wholesaler.businessName}</span>
                              </div>
                              {product.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {product.category}
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center space-x-6 text-sm">
                              <div>
                                <span className="text-gray-600">Price: </span>
                                <span className="font-semibold">{currencySymbol}{parseFloat(product.price).toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">MOQ: </span>
                                <span>{product.moq} units</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Stock: </span>
                                <span className={product.stock < 100 ? "text-red-600" : ""}>{product.stock} units</span>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-col space-y-2">
                            {product.negotiationEnabled ? (
                              <>
                                <Button 
                                  onClick={() => openNegotiation(product)}
                                  size="sm"
                                  variant="outline"
                                  className="border-blue-600 text-blue-600 hover:bg-blue-50"
                                >
                                  <Mail className="w-4 h-4 mr-1" />
                                  Request Quote
                                </Button>
                                <Button 
                                  onClick={() => openQuantityEditor(product)}
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  title="Add to cart at listed price"
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Add to Cart
                                </Button>
                              </>
                            ) : (
                              <Button 
                                onClick={() => openQuantityEditor(product)}
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Add to Cart
                              </Button>
                            )}
                            
                            {/* Negotiation Indicator for List View */}
                            {product.negotiationEnabled && (
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 self-start">
                                💬 Price Negotiable
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Checkout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Cart Items */}
              <div>
                <h3 className="font-semibold mb-3">Order Summary</h3>
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.product.name}</div>
                        <div className="text-xs text-gray-600">
                          {currencySymbol}{parseFloat(item.product.price).toFixed(2)} × {item.quantity} units
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-12 text-center text-sm">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeFromCart(item.product.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="w-20 text-right font-medium">
                        {currencySymbol}{(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="my-4" />
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total:</span>
                  <span>{currencySymbol}{getTotalAmount().toFixed(2)}</span>
                </div>
              </div>

              {/* Customer Information */}
              <div>
                <h3 className="font-semibold mb-3">Customer Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customerName">Full Name *</Label>
                    <Input
                      id="customerName"
                      value={customerData.name}
                      onChange={(e) => setCustomerData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="John Doe"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerPhone">Phone Number *</Label>
                    <Input
                      id="customerPhone"
                      value={customerData.phone}
                      onChange={(e) => setCustomerData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+1234567890"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="customerEmail">Email Address *</Label>
                    <Input
                      id="customerEmail"
                      type="email"
                      value={customerData.email}
                      onChange={(e) => setCustomerData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="john@example.com"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="customerAddress">Delivery Address *</Label>
                    <Textarea
                      id="customerAddress"
                      value={customerData.address}
                      onChange={(e) => setCustomerData(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="123 Street Name, City, State, Postal Code"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      value={customerData.notes}
                      onChange={(e) => setCustomerData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Any special instructions..."
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowCheckout(false)}
                  className="flex-1"
                >
                  Continue Shopping
                </Button>
                <Button 
                  onClick={handleCheckout}
                  disabled={createPaymentMutation.isPending || !customerData.name || !customerData.email || !customerData.phone || !customerData.address}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {createPaymentMutation.isPending ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Setting up payment...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Proceed to Payment
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quantity Editor Dialog */}
      <Dialog open={showQuantityEditor} onOpenChange={setShowQuantityEditor}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Quantity</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              {/* Product Info */}
              <div className="border-b pb-3">
                <h3 className="font-semibold">{selectedProduct.name}</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>Price: {currencySymbol}{parseFloat(selectedProduct.price).toFixed(2)} per unit</div>
                  <div>Minimum order: {selectedProduct.moq} units</div>
                  <div>Available stock: {selectedProduct.stock} units</div>
                </div>
              </div>

              {/* Quantity Controls */}
              <div className="space-y-3">
                <Label htmlFor="quantity">Quantity</Label>
                <div className="flex items-center space-x-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={decrementQuantity}
                    disabled={editQuantity <= selectedProduct.moq}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  
                  <Input
                    id="quantity"
                    type="number"
                    value={editQuantity}
                    onChange={(e) => handleQuantityInput(e.target.value)}
                    className="w-24 text-center"
                    min={selectedProduct.moq}
                    max={selectedProduct.stock}
                  />
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={incrementQuantity}
                    disabled={editQuantity >= selectedProduct.stock}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                {editQuantity < selectedProduct.moq && (
                  <p className="text-sm text-red-500">
                    Minimum order quantity is {selectedProduct.moq} units
                  </p>
                )}
              </div>

              {/* Total Calculation */}
              <div className="bg-gray-50 p-3 rounded">
                <div className="flex justify-between items-center font-semibold">
                  <span>Total:</span>
                  <span>{currencySymbol}{(parseFloat(selectedProduct.price) * editQuantity).toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowQuantityEditor(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddToCart}
                  disabled={editQuantity < selectedProduct.moq || editQuantity > selectedProduct.stock}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add to Cart
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Order Summary */}
            <div className="bg-gray-50 p-4 rounded">
              <h3 className="font-semibold mb-2">Order Summary</h3>
              <div className="space-y-2 text-sm">
                {cart.map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span>{item.product.name} × {item.quantity}</span>
                    <span>{currencySymbol}{(parseFloat(item.product.price) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total:</span>
                  <span>{currencySymbol}{getTotalAmount().toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Platform fee (5%):</span>
                  <span>{currencySymbol}{(getTotalAmount() * 0.05).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Stripe Payment Form */}
            {clientSecret && (
              <Elements 
                stripe={stripePromise} 
                options={{ 
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#059669',
                    }
                  }
                }}
              >
                <PaymentForm />
              </Elements>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Negotiation Dialog */}
      <Dialog open={showNegotiation} onOpenChange={setShowNegotiation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Price Quote</DialogTitle>
            <p className="text-sm text-gray-600">
              Request a custom price for {negotiationProduct?.name}
            </p>
          </DialogHeader>
          {negotiationProduct && (
            <div className="space-y-4">
              {/* Product Info */}
              <div className="bg-gray-50 p-3 rounded">
                <div className="flex items-center space-x-3">
                  {negotiationProduct.imageUrl && (
                    <img 
                      src={negotiationProduct.imageUrl} 
                      alt={negotiationProduct.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                  )}
                  <div>
                    <h4 className="font-medium">{negotiationProduct.name}</h4>
                    <p className="text-sm text-gray-600">
                      Listed at {currencySymbol}{negotiationProduct.price}
                    </p>
                    <p className="text-xs text-gray-500">
                      Supplier: {negotiationProduct.wholesaler.businessName}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quantity Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity</label>
                <div className="flex items-center justify-center space-x-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNegotiationData({
                      ...negotiationData,
                      quantity: Math.max(negotiationProduct?.moq || 1, negotiationData.quantity - 1)
                    })}
                    disabled={negotiationData.quantity <= (negotiationProduct?.moq || 1)}
                    className="h-10 w-10 rounded-full p-0 border-2 hover:bg-gray-50"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <div className="flex-1 max-w-20">
                    <input
                      type="number"
                      min={negotiationProduct?.moq || 1}
                      max={negotiationProduct?.stock || 999999}
                      value={negotiationData.quantity}
                      onChange={(e) => {
                        const newQuantity = parseInt(e.target.value) || negotiationProduct?.moq || 1;
                        setNegotiationData({
                          ...negotiationData,
                          quantity: Math.max(negotiationProduct?.moq || 1, Math.min(negotiationProduct?.stock || 999999, newQuantity))
                        });
                      }}
                      className="w-full text-center text-lg font-medium border rounded-lg py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNegotiationData({
                      ...negotiationData,
                      quantity: Math.min(negotiationProduct?.stock || 999999, negotiationData.quantity + 1)
                    })}
                    disabled={negotiationData.quantity >= (negotiationProduct?.stock || 999999)}
                    className="h-10 w-10 rounded-full p-0 border-2 hover:bg-gray-50"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Min: {negotiationProduct?.moq || 1} units | Available: {(negotiationProduct?.stock || 0).toLocaleString()}
                </p>
              </div>

              {/* Offered Price Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Offered Price (per unit)</label>
                <div className="text-xs text-gray-500 mb-1">
                  Enter amount in {wholesalerCurrency === 'GBP' ? 'pounds (e.g., 0.30 for 30p)' : wholesalerCurrency}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-500">{currencySymbol}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={negotiationData.offeredPrice}
                    onChange={(e) => setNegotiationData({
                      ...negotiationData,
                      offeredPrice: e.target.value
                    })}
                    className="w-full pl-8 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={wholesalerCurrency === 'GBP' ? "0.30" : "Enter your desired price"}
                  />
                </div>
                {negotiationData.offeredPrice && (
                  <p className="text-xs text-gray-500">
                    Total: {currencySymbol}{(parseFloat(negotiationData.offeredPrice) * negotiationData.quantity).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Message Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Message (Optional)</label>
                <textarea
                  value={negotiationData.message}
                  onChange={(e) => setNegotiationData({
                    ...negotiationData,
                    message: e.target.value
                  })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add a message to your request..."
                  rows={3}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowNegotiation(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleNegotiationSubmit}
                  disabled={createNegotiationMutation.isPending || !negotiationData.offeredPrice}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {createNegotiationMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Send Request
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="mt-16 bg-white border-t">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center">
          <div className="flex items-center justify-center space-x-2 text-gray-600">
            <span>Powered by</span>
            <Logo size="sm" variant="full" />
          </div>
        </div>
      </div>
    </div>
  );
}