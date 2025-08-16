import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, ShoppingBag, User, Phone, Mail, MapPin, ArrowRight, Search } from "lucide-react";
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
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div className="text-center p-4 bg-white rounded-lg border">
        <div className="text-2xl font-bold text-gray-900">{totalOrders}</div>
        <div className="text-sm text-gray-500">Total Orders</div>
      </div>
      
      <div className="text-center p-4 bg-white rounded-lg border">
        <div className="text-2xl font-bold text-green-600">£{totalSpent.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
        <div className="text-sm text-gray-500">Total Spent</div>
      </div>
      
      <div className="text-center p-4 bg-white rounded-lg border">
        <div className="text-2xl font-bold text-blue-600">{recentOrders}</div>
        <div className="text-sm text-gray-500">This Month</div>
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
      {/* Simple Clean Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Business Logo/Initial */}
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">
                  {wholesaler?.businessName?.charAt(0) || 'S'}
                </span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {wholesaler?.businessName || "Surulere Foods"}
                </h1>
                <p className="text-gray-600">Premium wholesale marketplace</p>
              </div>
            </div>
            
            {/* User Info & Logout */}
            <div className="flex items-center space-x-4">
              {customerData && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <User className="w-4 h-4" />
                  <span>Welcome, {customerData.name}</span>
                </div>
              )}
              {onLogout && (
                <Button onClick={onLogout} variant="outline" size="sm">
                  Sign Out
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Customer Statistics */}
        {customerData && wholesaler?.id && (
          <CustomerStats 
            wholesalerId={wholesaler.id} 
            customerPhone={customerData.phone || customerData.phoneNumber}
          />
        )}

        {/* Featured Product - Clean Layout */}
        {featuredProduct && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="md:flex">
                {/* Product Image */}
                <div className="md:w-1/3 bg-gray-50 p-8 flex items-center justify-center">
                  {featuredProduct.imageUrl ? (
                    <img 
                      src={featuredProduct.imageUrl} 
                      alt={featuredProduct.name}
                      className="max-w-full h-48 object-contain"
                    />
                  ) : (
                    <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
                
                {/* Product Details */}
                <div className="md:w-2/3 p-8">
                  <Badge className="mb-3 bg-green-100 text-green-800">Featured Product</Badge>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">
                    {featuredProduct.name}
                  </h2>
                  
                  {featuredProduct.description && (
                    <p className="text-gray-600 mb-4 leading-relaxed">
                      {featuredProduct.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold text-green-600 mb-1">
                        £{parseFloat(featuredProduct.price).toFixed(2)}
                      </div>
                      {featuredProduct.moq && (
                        <div className="text-sm text-gray-500">
                          Minimum order: {featuredProduct.moq} units
                        </div>
                      )}
                    </div>
                    
                    <Button
                      onClick={onViewFeaturedProduct}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      View Details
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions - Simple Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onViewAllProducts}>
            <CardContent className="p-6 text-center">
              <Package className="w-8 h-8 mx-auto mb-4 text-blue-600" />
              <h3 className="font-semibold text-gray-900 mb-2">Browse Products</h3>
              <p className="text-sm text-gray-600">View our complete catalog</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6 text-center">
              <Clock className="w-8 h-8 mx-auto mb-4 text-green-600" />
              <h3 className="font-semibold text-gray-900 mb-2">Order History</h3>
              <p className="text-sm text-gray-600">Track your past orders</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setShowWholesalerSearch(true)}>
            <CardContent className="p-6 text-center">
              <Search className="w-8 h-8 mx-auto mb-4 text-purple-600" />
              <h3 className="font-semibold text-gray-900 mb-2">Find Sellers</h3>
              <p className="text-sm text-gray-600">Discover new suppliers</p>
            </CardContent>
          </Card>
        </div>

        {/* Order History Section */}
        {customerData && wholesaler?.id && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Your Recent Orders</h2>
            <CustomerOrderHistory 
              wholesalerId={wholesaler.id} 
              customerPhone={customerData.phone || customerData.phoneNumber || '+447507659550'} 
            />
          </div>
        )}

        {/* Contact Information - Clean Layout */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              {wholesaler?.businessPhone && (
                <div className="flex items-center space-x-3">
                  <Phone className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="text-sm text-gray-500">Phone</div>
                    <div className="font-medium">{wholesaler.businessPhone}</div>
                  </div>
                </div>
              )}
              
              {wholesaler?.businessEmail && (
                <div className="flex items-center space-x-3">
                  <Mail className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-sm text-gray-500">Email</div>
                    <div className="font-medium">{wholesaler.businessEmail}</div>
                  </div>
                </div>
              )}
              
              {wholesaler?.businessAddress && (
                <div className="flex items-center space-x-3">
                  <MapPin className="w-5 h-5 text-purple-600" />
                  <div>
                    <div className="text-sm text-gray-500">Address</div>
                    <div className="font-medium">{wholesaler.businessAddress}</div>
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