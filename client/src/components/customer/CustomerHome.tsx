import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, ShoppingBag, User, Phone, Mail, MapPin, ArrowRight, Search, Star, ShoppingCart, Heart, Filter } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CustomerOrderHistory } from "./CustomerOrderHistory";

interface CustomerHomeProps {
  wholesaler: any;
  featuredProduct?: any;
  onViewAllProducts: () => void;
  onViewFeaturedProduct?: () => void;
  customerData?: any;
  onLogout?: () => void;
}

// Clean Customer Statistics Component
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

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-blue-900">{totalOrders}</div>
            <div className="text-sm text-blue-600">Orders</div>
          </div>
          <ShoppingBag className="w-8 h-8 text-blue-500" />
        </div>
      </div>
      
      <div className="bg-gradient-to-r from-green-50 to-emerald-100 p-4 rounded-xl border border-green-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-green-900">£{totalSpent.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
            <div className="text-sm text-green-600">Spent</div>
          </div>
          <Package className="w-8 h-8 text-green-500" />
        </div>
      </div>
      
      <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-purple-900">{recentOrders}</div>
            <div className="text-sm text-purple-600">This Month</div>
          </div>
          <Clock className="w-8 h-8 text-purple-500" />
        </div>
      </div>
    </div>
  );
}

export function CustomerHome({ 
  wholesaler, 
  featuredProduct, 
  onViewAllProducts, 
  onViewFeaturedProduct,
  customerData,
  onLogout
}: CustomerHomeProps) {
  const [showWholesalerSearch, setShowWholesalerSearch] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modern Header with Gradient */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Business Logo/Initial */}
              <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center border border-white/30">
                <span className="text-white font-bold text-2xl">
                  {wholesaler?.businessName?.charAt(0) || 'S'}
                </span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">
                  {wholesaler?.businessName || "Surulere Foods"}
                </h1>
                <p className="text-green-100 text-lg">Fresh • Premium • Wholesale</p>
              </div>
            </div>
            
            {/* User Info & Actions */}
            <div className="flex items-center space-x-4">
              {customerData && (
                <div className="bg-white/10 backdrop-blur px-4 py-2 rounded-full border border-white/20">
                  <div className="flex items-center space-x-2 text-white">
                    <User className="w-4 h-4" />
                    <span className="font-medium">{customerData.name}</span>
                  </div>
                </div>
              )}
              {onLogout && (
                <Button onClick={onLogout} variant="outline" className="border-white text-white hover:bg-white hover:text-green-600">
                  Sign Out
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Customer Statistics */}
        {customerData && wholesaler?.id && (
          <CustomerStats 
            wholesalerId={wholesaler.id} 
            customerPhone={customerData.phone || customerData.phoneNumber}
          />
        )}

        {/* Featured Product - Modern Grocery Style */}
        {featuredProduct && (
          <Card className="overflow-hidden shadow-lg border-0 rounded-2xl">
            <CardContent className="p-0">
              <div className="md:flex bg-gradient-to-r from-orange-50 to-amber-50">
                {/* Product Image */}
                <div className="md:w-2/5 relative p-8 flex items-center justify-center">
                  <div className="absolute top-4 left-4">
                    <Badge className="bg-red-500 text-white px-3 py-1 text-sm font-bold">
                      ⭐ FEATURED
                    </Badge>
                  </div>
                  <div className="absolute top-4 right-4">
                    <Button variant="outline" size="sm" className="rounded-full p-2 bg-white/80 backdrop-blur">
                      <Heart className="w-4 h-4" />
                    </Button>
                  </div>
                  {featuredProduct.imageUrl ? (
                    <img 
                      src={featuredProduct.imageUrl} 
                      alt={featuredProduct.name}
                      className="max-w-full h-64 object-contain drop-shadow-lg"
                    />
                  ) : (
                    <div className="w-48 h-48 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                      <Package className="w-16 h-16 text-gray-300" />
                    </div>
                  )}
                </div>
                
                {/* Product Details */}
                <div className="md:w-3/5 p-8 bg-white">
                  <div className="flex items-center space-x-2 mb-3">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Fresh & Premium
                    </Badge>
                    <div className="flex items-center space-x-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      ))}
                      <span className="text-sm text-gray-500 ml-1">(4.9)</span>
                    </div>
                  </div>
                  
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">
                    {featuredProduct.name}
                  </h2>
                  
                  {featuredProduct.description && (
                    <p className="text-gray-600 mb-6 leading-relaxed text-lg">
                      {featuredProduct.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="text-4xl font-bold text-green-600 mb-1">
                        £{parseFloat(featuredProduct.price).toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-500">per unit</div>
                      {featuredProduct.moq && (
                        <div className="text-sm text-orange-600 mt-1 font-medium">
                          Min. order: {featuredProduct.moq} units
                        </div>
                      )}
                    </div>
                    
                    <div className="flex space-x-3">
                      <Button
                        onClick={onViewFeaturedProduct}
                        className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-full text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                      >
                        <ShoppingCart className="w-5 h-5 mr-2" />
                        View Product
                      </Button>
                    </div>
                  </div>
                  
                  {/* Quick Stats */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-sm text-gray-500">In Stock</div>
                      <div className="font-bold text-gray-900">{featuredProduct.stock || '100+'}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-sm text-gray-500">Category</div>
                      <div className="font-bold text-gray-900">{featuredProduct.category || 'Food'}</div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-sm text-gray-500">Quality</div>
                      <div className="font-bold text-green-600">Premium</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Modern Action Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-0 bg-gradient-to-br from-blue-50 to-blue-100 hover:scale-105" onClick={onViewAllProducts}>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-600 transition-colors shadow-lg">
                <Package className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-blue-900 mb-2">Browse Products</h3>
              <p className="text-blue-700">Explore our premium catalog</p>
              <ArrowRight className="w-5 h-5 mx-auto mt-3 text-blue-600 group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-green-50 to-emerald-100 hover:scale-105">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-green-600 transition-colors shadow-lg">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-green-900 mb-2">Order History</h3>
              <p className="text-green-700">Track your purchases</p>
              <ArrowRight className="w-5 h-5 mx-auto mt-3 text-green-600 group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>

          <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-0 bg-gradient-to-br from-purple-50 to-purple-100 hover:scale-105" onClick={() => setShowWholesalerSearch(true)}>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-purple-600 transition-colors shadow-lg">
                <Search className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-purple-900 mb-2">Find Sellers</h3>
              <p className="text-purple-700">Discover suppliers</p>
              <ArrowRight className="w-5 h-5 mx-auto mt-3 text-purple-600 group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </div>

        {/* Order History Section - Enhanced */}
        {customerData && wholesaler?.id && (
          <div className="bg-white rounded-2xl p-6 shadow-lg border-0">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Your Recent Orders</h2>
              <Badge className="bg-gray-100 text-gray-700 px-3 py-1">
                Latest Activity
              </Badge>
            </div>
            <CustomerOrderHistory 
              wholesalerId={wholesaler.id} 
              customerPhone={customerData.phone || customerData.phoneNumber || '+447507659550'} 
            />
          </div>
        )}

        {/* Contact Information - Modern Style */}
        <Card className="bg-gradient-to-r from-gray-900 to-gray-800 text-white border-0 rounded-2xl shadow-xl">
          <CardHeader>
            <h2 className="text-2xl font-bold text-white">Get in Touch</h2>
            <p className="text-gray-300">We're here to help with your wholesale needs</p>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              {wholesaler?.businessPhone && (
                <div className="bg-white/10 backdrop-blur p-4 rounded-xl border border-white/20">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center">
                      <Phone className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-300">Phone</div>
                      <div className="font-semibold text-white">{wholesaler.businessPhone}</div>
                    </div>
                  </div>
                </div>
              )}
              
              {wholesaler?.businessEmail && (
                <div className="bg-white/10 backdrop-blur p-4 rounded-xl border border-white/20">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                      <Mail className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-300">Email</div>
                      <div className="font-semibold text-white">{wholesaler.businessEmail}</div>
                    </div>
                  </div>
                </div>
              )}
              
              {wholesaler?.businessAddress && (
                <div className="bg-white/10 backdrop-blur p-4 rounded-xl border border-white/20">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center">
                      <MapPin className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-300">Address</div>
                      <div className="font-semibold text-white">{wholesaler.businessAddress}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}