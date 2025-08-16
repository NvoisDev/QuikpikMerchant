import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Package, ArrowRight, Phone, Mail, MapPin, Edit2, X, Search, Building2, ShoppingBag, Clock, Truck, Shield, Award, TrendingUp } from "lucide-react";
import Logo from "@/components/ui/logo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CustomerOrderHistory } from "./CustomerOrderHistory";

// Enhanced Customer Statistics Component
function CustomerStats({ wholesalerId, customerPhone }: { wholesalerId: string; customerPhone: string }) {
  const { data: orders = [] } = useQuery({
    queryKey: [`/api/customer-orders`, wholesalerId, customerPhone],
    queryFn: async () => {
      const encodedPhone = encodeURIComponent(customerPhone);
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}`, {
        credentials: 'include',
      });
      
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!wholesalerId && !!customerPhone,
  });

  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum: number, order: any) => sum + parseFloat(order.total || '0'), 0);
  const recentOrders = orders.filter((order: any) => {
    const orderDate = new Date(order.createdAt);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return orderDate >= thirtyDaysAgo;
  }).length;

  // Format currency with commas for amounts over 1,000
  const formatCurrency = (amount: number) => {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500 rounded-lg">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-blue-600 font-medium">Total Orders</p>
              <p className="text-2xl font-bold text-blue-900">{totalOrders}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-gradient-to-br from-green-50 to-emerald-100 border-green-200">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-500 rounded-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-green-600 font-medium">Total Spent</p>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(totalSpent)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-500 rounded-lg">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-purple-600 font-medium">Recent Orders</p>
              <p className="text-2xl font-bold text-purple-900">{recentOrders}</p>
              <p className="text-xs text-purple-600">Last 30 days</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface CustomerHomeProps {
  wholesaler: any;
  featuredProduct?: any;
  onViewAllProducts: () => void;
  onViewFeaturedProduct?: () => void;
  customerData?: any;
  onLogout?: () => void;
  onFindSeller?: () => void;
}

const businessNameSchema = z.object({
  businessName: z.string().min(1, "Business name is required").max(100, "Business name too long"),
});

export function CustomerHome({ 
  wholesaler, 
  featuredProduct, 
  onViewAllProducts, 
  onViewFeaturedProduct,
  customerData,
  onLogout,
  onFindSeller
}: CustomerHomeProps) {
  const [isEditBusinessNameOpen, setIsEditBusinessNameOpen] = useState(false);
  const [showWholesalerSearch, setShowWholesalerSearch] = useState(false);
  const [wholesalerSearchQuery, setWholesalerSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available wholesalers for search
  const { data: availableWholesalers = [], isLoading: wholesalersLoading } = useQuery({
    queryKey: ["/api/marketplace/wholesalers", wholesalerSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (wholesalerSearchQuery) params.append("search", wholesalerSearchQuery);
      
      const response = await fetch(`/api/marketplace/wholesalers?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch wholesalers");
      return response.json();
    },
    enabled: showWholesalerSearch, // Only fetch when search is open
  });

  const businessNameForm = useForm<z.infer<typeof businessNameSchema>>({
    resolver: zodResolver(businessNameSchema),
    defaultValues: {
      businessName: wholesaler?.businessName || "",
    },
  });

  const updateBusinessNameMutation = useMutation({
    mutationFn: async (data: z.infer<typeof businessNameSchema>) => {
      const response = await apiRequest("PATCH", "/api/settings", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Business name updated successfully",
      });
      setIsEditBusinessNameOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/wholesaler"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update business name",
        variant: "destructive",
      });
    },
  });

  const onUpdateBusinessName = (data: z.infer<typeof businessNameSchema>) => {
    updateBusinessNameMutation.mutate(data);
  };
  
  const getCurrencySymbol = (currency?: string) => {
    switch (currency) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return '£';
    }
  };

  const formatPromotionalPrice = (product: any) => {
    if (!product.promoActive || !product.promoPrice) return null;
    
    const originalPrice = parseFloat(product.price);
    const promoPrice = parseFloat(product.promoPrice);
    const currency = getCurrencySymbol(wholesaler?.defaultCurrency);
    
    return {
      original: `${currency}${originalPrice.toFixed(2)}`,
      promotional: `${currency}${promoPrice.toFixed(2)}`
    };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            {/* Find Seller Button - Left Side */}
            <div className="absolute top-4 left-4">
              <Button
                onClick={() => setShowWholesalerSearch(true)}
                variant="outline"
                className="border-emerald-300 text-emerald-600 hover:bg-emerald-50 font-medium"
                size="sm"
              >
                <Search className="w-4 h-4 mr-2" />
                Find Seller
              </Button>
            </div>
            
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center mb-4">
                <Logo 
                  size="lg" 
                  variant="full" 
                  user={wholesaler}
                  className="mr-4"
                />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {wholesaler?.businessName || "Wholesale Store"}
              </h1>
              <p className="text-gray-600">
                Premium wholesale products with Love
              </p>
              {customerData && (
                <div className="mt-4 space-y-2">
                  <div className="text-lg text-green-600 font-medium">
                    Welcome back, {customerData.name}!
                  </div>
                  {/* Customer Statistics */}
                  <CustomerStats 
                    wholesalerId={wholesaler?.id} 
                    customerPhone={customerData.phone || customerData.phoneNumber}
                  />
                </div>
              )}
            </div>
            
            {/* Logout Button */}
            {onLogout && (
              <div className="absolute top-4 right-4">
                <Button
                  onClick={onLogout}
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  size="sm"
                >
                  Log out
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Featured Product Section */}
        {featuredProduct && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Featured Product</h2>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                ⭐ FEATURED
              </Badge>
            </div>
            
            <Card className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-0">
                <div className="grid lg:grid-cols-2">
                  {/* Product Image */}
                  <div className="relative bg-white flex items-center justify-center p-8">
                    {featuredProduct.imageUrl || (featuredProduct.images && featuredProduct.images.length > 0) ? (
                      <img 
                        src={featuredProduct.imageUrl || featuredProduct.images[0]} 
                        alt={featuredProduct.name}
                        className="w-full max-w-md h-auto object-contain rounded-lg"
                      />
                    ) : (
                      <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                        <Package className="w-16 h-16 text-gray-400" />
                      </div>
                    )}
                    
                    {/* Product badges */}
                    <div className="absolute top-4 left-4 space-y-2">
                      {featuredProduct.promotionalOffers && featuredProduct.promotionalOffers.length > 0 && (
                        <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                          🎉 Special Offers
                        </Badge>
                      )}
                      
                      {featuredProduct.packQuantity && featuredProduct.unitOfMeasure && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          📦 {featuredProduct.packQuantity} x {featuredProduct.unitSize}{featuredProduct.unitOfMeasure}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Product Details */}
                  <div className="p-8 flex flex-col justify-center">
                    <div className="space-y-4">
                      <h3 className="text-3xl font-bold text-gray-900">
                        {featuredProduct.name}
                      </h3>
                      
                      {featuredProduct.description && (
                        <p className="text-gray-600 text-lg leading-relaxed">
                          {featuredProduct.description}
                        </p>
                      )}

                      {/* Pricing */}
                      <div className="space-y-2">
                        {(() => {
                          const pricing = formatPromotionalPrice(featuredProduct);
                          if (pricing) {
                            return (
                              <div className="flex items-center space-x-3">
                                <span className="text-3xl font-bold text-green-600">
                                  {pricing.promotional}
                                </span>
                                <span className="text-xl text-gray-500 line-through">
                                  {pricing.original}
                                </span>
                                <Badge className="bg-red-100 text-red-800">
                                  SALE
                                </Badge>
                              </div>
                            );
                          } else {
                            return (
                              <div className="text-3xl font-bold text-green-600">
                                {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(featuredProduct.price).toFixed(2)}
                              </div>
                            );
                          }
                        })()}
                        
                        {featuredProduct.moq && (
                          <p className="text-sm text-gray-500">
                            Minimum order: {featuredProduct.moq} units
                          </p>
                        )}
                      </div>

                      {/* Product Features */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center space-x-2 text-green-600">
                          <Shield className="w-4 h-4" />
                          <span>Quality Guaranteed</span>
                        </div>
                        <div className="flex items-center space-x-2 text-blue-600">
                          <Truck className="w-4 h-4" />
                          <span>Fast Delivery</span>
                        </div>
                        <div className="flex items-center space-x-2 text-purple-600">
                          <Award className="w-4 h-4" />
                          <span>Premium Product</span>
                        </div>
                        <div className="flex items-center space-x-2 text-orange-600">
                          <ShoppingBag className="w-4 h-4" />
                          <span>Bulk Orders</span>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <div className="pt-4">
                        <Button
                          onClick={onViewFeaturedProduct}
                          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 text-lg"
                          size="lg"
                        >
                          View Product Details
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Action Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-0 bg-gradient-to-br from-blue-50 to-blue-100" onClick={onViewAllProducts}>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Package className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Browse Products</h3>
              <p className="text-sm text-blue-600">Explore our full product catalog</p>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-0 bg-gradient-to-br from-green-50 to-emerald-100">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-green-900 mb-2">Order History</h3>
              <p className="text-sm text-green-600">View your past orders</p>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-0 bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Phone className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-purple-900 mb-2">Contact Support</h3>
              <p className="text-sm text-purple-600">Get help with your orders</p>
            </CardContent>
          </Card>

          <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-0 bg-gradient-to-br from-orange-50 to-orange-100" onClick={() => setShowWholesalerSearch(true)}>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Search className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-orange-900 mb-2">Find Sellers</h3>
              <p className="text-sm text-orange-600">Discover new suppliers</p>
            </CardContent>
          </Card>
        </div>

        {/* Trust & Safety Section */}
        <Card className="bg-gradient-to-r from-gray-50 to-gray-100 border-0">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Why Choose Us?</h2>
              <p className="text-gray-600">Your trusted wholesale partner</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Secure Payments</h3>
                <p className="text-gray-600">All transactions are processed securely through Stripe</p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Truck className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Fast Delivery</h3>
                <p className="text-gray-600">Quick and reliable delivery to your location</p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Quality Products</h3>
                <p className="text-gray-600">Premium wholesale products you can trust</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card className="border-0 bg-white shadow-lg">
          <CardHeader>
            <h2 className="text-xl font-bold text-gray-900">Get in Touch</h2>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              {wholesaler?.businessPhone && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Phone className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium text-gray-900">{wholesaler.businessPhone}</p>
                  </div>
                </div>
              )}
              
              {wholesaler?.businessEmail && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium text-gray-900">{wholesaler.businessEmail}</p>
                  </div>
                </div>
              )}
              
              {wholesaler?.businessAddress && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="font-medium text-gray-900">{wholesaler.businessAddress}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Wholesaler Search Modal */}
      {showWholesalerSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-25 z-50 flex items-start justify-center pt-20">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-96 overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Find Other Sellers</h3>
                <Button
                  onClick={() => setShowWholesalerSearch(false)}
                  variant="ghost"
                  size="sm"
                >
                  ×
                </Button>
              </div>
              <div className="mt-3">
                <Input
                  placeholder="Search by business name..."
                  value={wholesalerSearchQuery}
                  onChange={(e) => setWholesalerSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="max-h-80 overflow-y-auto">
              {wholesalersLoading ? (
                <div className="p-4 space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-3 animate-pulse">
                      <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : availableWholesalers.length > 0 ? (
                <div className="p-2">
                  {availableWholesalers.map((wholesalerItem: any) => (
                    <button
                      key={wholesalerItem.id}
                      onClick={() => {
                        // Close the search modal first
                        setShowWholesalerSearch(false);
                        
                        // Navigate to the selected wholesaler's store
                        // This will trigger the SMS verification flow if not authenticated
                        window.location.href = `/store/${wholesalerItem.id}`;
                      }}
                      className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      {/* Wholesaler Logo */}
                      {wholesalerItem.logoUrl ? (
                        <img 
                          src={wholesalerItem.logoUrl} 
                          alt={wholesalerItem.businessName || "Business logo"} 
                          className="w-10 h-10 rounded-lg object-contain flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-white">
                            {wholesalerItem.businessName ? (
                              wholesalerItem.businessName
                                .split(' ')
                                .map((word: string) => word.charAt(0).toUpperCase())
                                .join('')
                                .substring(0, 2)
                            ) : 'WS'}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex-1 text-left">
                        <h4 className="font-medium text-gray-900">{wholesalerItem.businessName || "Business"}</h4>
                        <p className="text-sm text-gray-600">{wholesalerItem.storeTagline || "Wholesale products"}</p>
                        {wholesalerItem.location && (
                          <p className="text-xs text-gray-500 flex items-center mt-1">
                            <MapPin className="w-3 h-3 mr-1" />
                            {wholesalerItem.location}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {wholesalerItem.rating && (
                          <div className="flex items-center">
                            <Star className="w-4 h-4 text-yellow-400 fill-current" />
                            <span className="text-sm text-gray-600 ml-1">{wholesalerItem.rating}</span>
                          </div>
                        )}
                        <Building2 className="w-4 h-4 text-gray-400" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {wholesalerSearchQuery ? "No stores found matching your search" : "Start typing to search for stores"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}