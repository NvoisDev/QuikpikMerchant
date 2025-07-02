import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import OrderSummaryModal from "@/components/modals/order-summary-modal";
import { 
  Search, 
  ShoppingCart, 
  Heart,
  Plus,
  Minus,
  MessageSquare,
  Sprout,
  Droplet,
  Flame,
  Pizza
} from "lucide-react";
import { Link } from "wouter";

export default function RetailerInterface() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [cart, setCart] = useState<Array<{
    productId: number;
    quantity: number;
    product: any;
    wholesalerId: string;
  }>>([]);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedWholesaler, setSelectedWholesaler] = useState<string | null>(null);

  // Fetch marketplace products (from all wholesalers)
  const { data: products, isLoading } = useQuery({
    queryKey: ["/api/marketplace/products", { search: searchQuery, category: categoryFilter, sortBy }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (sortBy) params.append('sortBy', sortBy);
      
      const response = await fetch(`/api/marketplace/products?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
  });

  // Fetch customer's order history
  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders", "customer"],
    queryFn: async () => {
      const response = await fetch("/api/orders?role=customer", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch orders");
      return response.json();
    },
    enabled: !!user,
  });

  // Place order mutation
  const placeOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const response = await apiRequest("POST", "/api/orders", orderData);
      return response.json();
    },
    onSuccess: () => {
      setCart([]);
      setIsOrderModalOpen(false);
      toast({
        title: "Order Placed",
        description: "Your order has been sent to the wholesaler for confirmation.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Order Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: async (item: { productId: number; quantity: number; product: any; wholesalerId: string }) => {
      return item;
    },
    onSuccess: (item) => {
      const existingItem = cart.find(cartItem => cartItem.productId === item.productId);
      if (existingItem) {
        setCart(cart.map(cartItem => 
          cartItem.productId === item.productId 
            ? { ...cartItem, quantity: cartItem.quantity + item.quantity }
            : cartItem
        ));
      } else {
        const product = products?.find((p: any) => p.id === item.productId);
        setCart([...cart, { ...item, product }]);
      }
      toast({
        title: "Added to Cart",
        description: "Product added to cart successfully",
      });
    },
  });

  // Helper functions for cart management
  const addToCart = (product: any, quantity: number) => {
    addToCartMutation.mutate({
      productId: product.id,
      quantity,
      product,
      wholesalerId: product.wholesaler.id
    });
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const updateCartQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item => 
      item.productId === productId ? { ...item, quantity } : item
    ));
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => {
      return total + (parseFloat(item.product.price) * item.quantity);
    }, 0);
  };

  const getCartItemCount = () => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  };

  // Place order
  const handlePlaceOrder = () => {
    if (cart.length === 0) {
      toast({
        title: "Cart Empty",
        description: "Please add items to your cart before placing an order.",
        variant: "destructive",
      });
      return;
    }

    // Group cart items by wholesaler
    const ordersByWholesaler = cart.reduce((acc, item) => {
      if (!acc[item.wholesalerId]) {
        acc[item.wholesalerId] = [];
      }
      acc[item.wholesalerId].push(item);
      return acc;
    }, {} as Record<string, typeof cart>);

    // For simplicity, let's handle single wholesaler orders first
    const wholesalerIds = Object.keys(ordersByWholesaler);
    if (wholesalerIds.length > 1) {
      toast({
        title: "Multiple Wholesalers",
        description: "Please place separate orders for different wholesalers.",
        variant: "destructive",
      });
      return;
    }

    const orderData = {
      wholesalerId: wholesalerIds[0],
      items: cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.product.price,
        total: (parseFloat(item.product.price) * item.quantity).toString()
      })),
      totalAmount: getCartTotal().toString(),
      deliveryAddress: "Customer delivery address", // This would come from a form
      notes: "Order placed through marketplace"
    };

    placeOrderMutation.mutate(orderData);
  };

  const categories = [
    { id: "grains", name: "Grains & Rice", icon: Sprout, color: "text-yellow-600", count: 24 },
    { id: "oils", name: "Oils & Fats", icon: Droplet, color: "text-orange-600", count: 12 },
    { id: "spices", name: "Spices", icon: Flame, color: "text-red-600", count: 18 },
    { id: "dairy", name: "Dairy", icon: Pizza, color: "text-blue-600", count: 8 },
  ];

  const filteredProducts = products?.filter((product: any) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || 
                           product.category?.toLowerCase().includes(categoryFilter.toLowerCase());
    const isActive = product.status === "active";
    
    return matchesSearch && matchesCategory && isActive;
  }).sort((a: any, b: any) => {
    switch (sortBy) {
      case "price-low":
        return parseFloat(a.price) - parseFloat(b.price);
      case "price-high":
        return parseFloat(b.price) - parseFloat(a.price);
      case "popular":
        // Would need view/order count data
        return 0;
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  }) || [];

  const handleAddToCart = (product: any, quantity: number) => {
    if (quantity < product.moq) {
      toast({
        title: "Minimum Order Quantity",
        description: `Minimum order quantity for ${product.name} is ${product.moq}`,
        variant: "destructive",
      });
      return;
    }
    addToCartMutation.mutate({ productId: product.id, quantity });
  };

  const getTotalCartItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const formatCurrency = (amount: number | string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary">Quikpik Merchant</h1>
              <span className="ml-4 text-sm text-gray-600">Wholesale Marketplace</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Button variant="ghost" size="icon" onClick={() => setIsOrderModalOpen(true)}>
                  <ShoppingCart className="h-5 w-5" />
                  {getTotalCartItems() > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {getTotalCartItems()}
                    </span>
                  )}
                </Button>
              </div>
              <div className="flex items-center">
                <img 
                  src={user?.profileImageUrl || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=40&h=40"} 
                  alt="Profile" 
                  className="w-8 h-8 rounded-full object-cover"
                />
                <span className="ml-2 text-sm font-medium text-gray-900">
                  {user?.businessName || `${user?.firstName} ${user?.lastName}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Banner */}
        <div className="gradient-primary rounded-xl p-8 text-white mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Welcome to the Wholesale Marketplace</h2>
              <p className="text-blue-100">Browse premium wholesale products and place your orders with ease.</p>
            </div>
            <div className="hidden md:block">
              <img 
                src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&h=150" 
                alt="Mobile commerce and online ordering" 
                className="rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>

        {/* Product Categories */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {categories.map((category) => {
            const IconComponent = category.icon;
            return (
              <Card 
                key={category.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setCategoryFilter(category.id)}
              >
                <CardContent className="p-6 text-center">
                  <div className={`w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-3`}>
                    <IconComponent className={`${category.color} text-xl`} size={24} />
                  </div>
                  <h3 className="font-medium text-gray-900">{category.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{category.count} products</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Search and Filters */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
              <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="grains">Grains & Rice</SelectItem>
                    <SelectItem value="oils">Oils & Fats</SelectItem>
                    <SelectItem value="spices">Spices</SelectItem>
                    <SelectItem value="dairy">Dairy Products</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                    <SelectItem value="popular">Most Popular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="w-full h-48 bg-gray-300 rounded-t-lg"></div>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-300 rounded w-full"></div>
                    <div className="h-3 bg-gray-300 rounded w-5/6"></div>
                    <div className="h-8 bg-gray-300 rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product: any) => (
              <ProductRetailerCard
                key={product.id}
                product={product}
                onAddToCart={handleAddToCart}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
        )}

        {!isLoading && filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <ShoppingCart className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No products found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>

      <OrderSummaryModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        cartItems={cart}
        formatCurrency={formatCurrency}
      />
    </div>
  );
}

// Product Card Component for Retailer View
function ProductRetailerCard({ 
  product, 
  onAddToCart, 
  formatCurrency 
}: { 
  product: any; 
  onAddToCart: (product: any, quantity: number) => void;
  formatCurrency: (amount: number | string) => string;
}) {
  const [quantity, setQuantity] = useState(product.moq || 1);

  const handleQuantityChange = (delta: number) => {
    const newQuantity = Math.max(product.moq || 1, quantity + delta);
    setQuantity(newQuantity);
  };

  const getStockStatus = () => {
    if (product.stock === 0) return { label: "Out of Stock", color: "bg-red-100 text-red-800" };
    if (product.stock < 10) return { label: "Low Stock", color: "bg-yellow-100 text-yellow-800" };
    return { label: "In Stock", color: "bg-green-100 text-green-800" };
  };

  const stockStatus = getStockStatus();
  const total = parseFloat(product.price) * quantity;

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <div className="relative">
        <img 
          src={product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"} 
          alt={product.name}
          className="w-full h-48 object-cover rounded-t-lg"
        />
        <div className="absolute top-3 right-3">
          <Button variant="ghost" size="icon" className="bg-white rounded-full shadow-sm hover:shadow-md">
            <Heart className="h-4 w-4 text-gray-400 hover:text-red-400" />
          </Button>
        </div>
        <div className="absolute bottom-3 left-3">
          <Badge className={stockStatus.color}>
            {stockStatus.label}
          </Badge>
        </div>
      </div>
      <CardContent className="p-6">
        <h3 className="font-semibold text-gray-900 text-lg mb-2">{product.name}</h3>
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{product.description}</p>
        
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Price per unit:</span>
            <span className="font-bold text-lg text-gray-900">
              {product.priceVisible ? formatCurrency(product.price) : "Request Quote"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Minimum order:</span>
            <span className="text-sm text-gray-900">{product.moq} units</span>
          </div>
        </div>
        
        {product.priceVisible && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleQuantityChange(-1)}
                  disabled={quantity <= product.moq}
                  className="h-8 w-8"
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleQuantityChange(1)}
                  disabled={quantity >= product.stock}
                  className="h-8 w-8"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Total:</p>
                <p className="font-bold text-lg text-gray-900">{formatCurrency(total)}</p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Button 
                className="flex-1" 
                onClick={() => onAddToCart(product, quantity)}
                disabled={product.stock === 0}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Add to Cart
              </Button>
              {product.negotiationEnabled && (
                <Button variant="outline" size="icon">
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
        )}

        {!product.priceVisible && (
          <div className="space-y-2">
            <Button className="w-full" variant="outline">
              <MessageSquare className="mr-2 h-4 w-4" />
              Request Quote
            </Button>
            <Button className="w-full">
              Contact Supplier
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
