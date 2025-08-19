import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { 
  Package, TrendingUp, Clock, ShoppingCart, Plus, X, Search, 
  Zap, Phone, Mail, CheckCircle 
} from "lucide-react";
import Logo from "@/components/ui/logo";

// Quick Order Component
function QuickOrder({ wholesalerId }: { wholesalerId: string }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<any[]>([]);
  const { toast } = useToast();

  const { data: products = [] } = useQuery({
    queryKey: [`/api/customer-products`, wholesalerId],
    queryFn: async () => {
      const response = await fetch(`/api/customer-products/${wholesalerId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!wholesalerId,
  });

  const filteredProducts = products.filter((product: any) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product: any) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item => 
        item.id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
    toast({ title: "Added to cart", description: `${product.name} added to your quick order` });
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.id !== productId));
      return;
    }
    setCart(cart.map(item => 
      item.id === productId 
        ? { ...item, quantity }
        : item
    ));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Zap className="h-5 w-5 text-blue-600" />
          <span>Quick Order</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search products for quick order..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Quick Product List */}
        {searchTerm && (
          <div className="max-h-40 overflow-y-auto space-y-2">
            {filteredProducts.slice(0, 5).map((product: any) => (
              <div key={product.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-sm">{product.name}</div>
                  <div className="text-xs text-gray-600">£{product.price}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addToCart(product)}
                  className="h-8 px-2"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Cart Summary */}
        {cart.length > 0 && (
          <div className="border-t pt-4">
            <h4 className="font-medium text-sm mb-2">Quick Order Cart</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="flex-1 truncate">{item.name}</span>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="h-6 w-6 p-0"
                    >
                      -
                    </Button>
                    <span className="w-8 text-center">{item.quantity}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="h-6 w-6 p-0"
                    >
                      +
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeFromCart(item.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-3 pt-2 border-t">
              <span className="font-medium">Total: £{cartTotal.toFixed(2)}</span>
              <Button size="sm" className="bg-green-600 hover:bg-green-700">
                <ShoppingCart className="h-3 w-3 mr-1" />
                Place Order
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Customer Statistics Component
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
  const pendingOrders = orders.filter((order: any) => order.status === 'pending').length;

  const formatCurrency = (amount: number) => {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Total Orders */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Orders</p>
              <p className="text-2xl font-bold text-blue-600">{totalOrders}</p>
            </div>
            <Package className="h-8 w-8 text-blue-600" />
          </div>
        </CardContent>
      </Card>

      {/* Total Spent */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Spent</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalSpent)}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
        </CardContent>
      </Card>

      {/* Pending Orders */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Orders</p>
              <p className="text-2xl font-bold text-orange-600">{pendingOrders}</p>
            </div>
            <Clock className="h-8 w-8 text-orange-600" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ModernCustomerHomeProps {
  wholesaler: any;
  customerData: any;
  onViewAllProducts: () => void;
  onLogout?: () => void;
}

export function ModernCustomerHome({ 
  wholesaler, 
  customerData, 
  onViewAllProducts,
  onLogout 
}: ModernCustomerHomeProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modern Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Logo className="h-10 w-auto" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {wholesaler?.businessName || 'Wholesale Partner'}
                </h1>
                <p className="text-sm text-gray-600">
                  {wholesaler?.tagline || 'Premium wholesale products'}
                </p>
              </div>
            </div>
            
            {/* Customer Welcome & Logout */}
            {customerData && (
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    Welcome back, {customerData.name}!
                  </div>
                  <div className="text-xs text-gray-600">
                    Customer Portal
                  </div>
                </div>
                {onLogout && (
                  <Button
                    onClick={onLogout}
                    variant="outline"
                    size="sm"
                  >
                    Log out
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Customer Statistics */}
        {customerData && (
          <CustomerStats 
            wholesalerId={wholesaler?.id} 
            customerPhone={customerData.phone || customerData.phoneNumber}
          />
        )}

        {/* Quick Order and Recent Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Order */}
          <QuickOrder wholesalerId={wholesaler?.id} />
          
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span>Quick Actions</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                onClick={onViewAllProducts}
                className="w-full justify-start h-12 bg-blue-600 hover:bg-blue-700"
              >
                <Package className="h-4 w-4 mr-3" />
                Browse All Products
              </Button>
              
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-10">
                  <Phone className="h-4 w-4 mr-2" />
                  Contact
                </Button>
                <Button variant="outline" className="h-10">
                  <Mail className="h-4 w-4 mr-2" />
                  Support
                </Button>
              </div>
              
              {/* Wholesaler Contact Info */}
              {wholesaler && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">Contact Information</h4>
                  <div className="space-y-1 text-xs text-gray-600">
                    {wholesaler.businessPhone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="h-3 w-3" />
                        <span>{wholesaler.businessPhone}</span>
                      </div>
                    )}
                    {wholesaler.businessEmail && (
                      <div className="flex items-center space-x-2">
                        <Mail className="h-3 w-3" />
                        <span>{wholesaler.businessEmail}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}