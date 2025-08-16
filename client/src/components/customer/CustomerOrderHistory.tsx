import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Clock, Eye, Search, Calendar, ShoppingBag, MapPin, CreditCard, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";

interface CustomerOrderHistoryProps {
  wholesalerId: string;
  customerPhone: string;
}

interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

interface Order {
  id: number;
  orderNumber: string;
  date: string;
  status: string;
  total: string;
  subtotal: string;
  items: OrderItem[];
  wholesaler: {
    businessName: string;
  };
  fulfillmentType: string;
  deliveryCarrier: string;
  deliveryCost?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  paymentMethod?: string;
  createdAt: string;
}

function CustomerOrderHistory({ wholesalerId, customerPhone }: CustomerOrderHistoryProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: [`/api/customer-orders`, wholesalerId, customerPhone],
    queryFn: async () => {
      const encodedPhone = encodeURIComponent(customerPhone);
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied - not in customer list');
        }
        throw new Error('Failed to fetch orders');
      }
      
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!wholesalerId && !!customerPhone,
  });

  // Filter orders based on search term
  const filteredOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    
    if (!searchTerm.trim()) return orders;
    
    return orders.filter((order: Order) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        order.orderNumber?.toLowerCase().includes(searchLower) ||
        order.status?.toLowerCase().includes(searchLower) ||
        order.items?.some((item: OrderItem) => 
          item.productName?.toLowerCase().includes(searchLower)
        )
      );
    });
  }, [orders, searchTerm]);

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'fulfilled': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="w-5 h-5" />
            <span>Order History</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 border rounded-lg animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-3 bg-gray-200 rounded w-32"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Package className="w-8 h-8 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <ShoppingBag className="w-5 h-5" />
            <span>Order History</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
          <p className="text-gray-600">Your order history will appear here once you make your first purchase.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <ShoppingBag className="w-5 h-5" />
            <span>Order History</span>
            <Badge variant="outline">{orders.length}</Badge>
          </CardTitle>
          
          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {filteredOrders.slice(0, 5).map((order: Order) => (
            <div key={order.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h4 className="font-semibold text-gray-900">{order.orderNumber}</h4>
                    <Badge className={getStatusColor(order.status)}>
                      {order.status}
                    </Badge>
                  </div>
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(order.createdAt).toLocaleDateString('en-GB')}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Package className="w-4 h-4" />
                      <span>{order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">
                    £{parseFloat(order.total).toFixed(2)}
                  </div>
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="mt-2">
                        <Eye className="w-4 h-4 mr-1" />
                        View Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
                      <div className="p-6 pb-0">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-semibold">Order {order.orderNumber}</DialogTitle>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                            <span className="text-sm text-gray-500">
                              {new Date(order.createdAt).toLocaleDateString('en-GB')}
                            </span>
                          </div>
                        </DialogHeader>
                      </div>
                      
                      <Tabs defaultValue="delivery" className="mt-4">
                        <div className="border-b bg-gray-50">
                          <TabsList className="grid w-full grid-cols-2 bg-transparent h-auto rounded-none border-0">
                            <TabsTrigger 
                              value="delivery" 
                              className="text-gray-600 data-[state=active]:text-black data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-black rounded-none border-b-2 border-transparent py-4 px-6 font-medium"
                            >
                              Delivery information
                            </TabsTrigger>
                            <TabsTrigger 
                              value="summary" 
                              className="text-gray-600 data-[state=active]:text-black data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-black rounded-none border-b-2 border-transparent py-4 px-6 font-medium"
                            >
                              Order summary
                            </TabsTrigger>
                          </TabsList>
                        </div>
                        
                        <TabsContent value="delivery" className="mt-0 p-6 space-y-6">
                          {/* Delivery to Address */}
                          <div className="space-y-4">
                            <div className="flex items-start space-x-3">
                              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mt-1">
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900 text-sm">Delivery to</h4>
                                <div className="text-gray-600 text-sm mt-1">
                                  <div className="font-medium">{order.customerName || 'Customer Name'}</div>
                                  <div>{order.deliveryAddress || 'Dhaka, Bangladesh. Block B, Road 3, California, USA'}</div>
                                </div>
                              </div>
                              <button className="text-green-600 text-sm font-medium ml-auto">Edit</button>
                            </div>
                          </div>

                          {/* Review item by store */}
                          <div className="space-y-4">
                            <h4 className="font-medium text-gray-900">Review item by store</h4>
                            
                            {/* Store Item */}
                            <div className="border rounded-lg">
                              <div className="flex items-center justify-between p-4 bg-gray-50">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">S</span>
                                  </div>
                                  <div>
                                    <h5 className="font-medium text-gray-900">Surulere Foods market</h5>
                                    <p className="text-sm text-gray-600">Delivery in 15 minutes</p>
                                  </div>
                                </div>
                                <button className="text-gray-400">
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414L11.414 12l3.293 3.293a1 1 0 01-1.414 1.414L10 13.414l-3.293 3.293a1 1 0 01-1.414-1.414L8.586 12 5.293 8.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                              
                              {/* Items in this store */}
                              <div className="p-4 space-y-3">
                                {order.items?.map((item: OrderItem, index: number) => (
                                  <div key={index} className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <Package className="w-6 h-6 text-gray-400" />
                                      </div>
                                      <div>
                                        <h6 className="font-medium text-gray-900 text-sm">{item.productName}</h6>
                                        <p className="text-xs text-gray-500">{item.quantity} unit</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                      <span className="text-sm font-medium">£{parseFloat(item.total).toFixed(2)}</span>
                                      <div className="flex items-center space-x-2">
                                        <button className="w-6 h-6 border rounded-full flex items-center justify-center text-gray-500">-</button>
                                        <span className="text-sm font-medium">{item.quantity}</span>
                                        <button className="w-6 h-6 border rounded-full flex items-center justify-center text-gray-500">+</button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              
                              <div className="px-4 pb-4">
                                <button className="text-green-600 text-sm font-medium flex items-center space-x-1">
                                  <span>Replace with</span>
                                  <Package className="w-4 h-4" />
                                  <span>Loblaws</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="summary" className="mt-0 p-6">
                          <div className="space-y-6">
                            {/* Payment Methods */}
                            <div className="space-y-4">
                              <div className="flex items-center space-x-3 p-3 bg-orange-50 rounded-lg">
                                <div className="w-6 h-6 bg-orange-500 rounded flex items-center justify-center">
                                  <CreditCard className="w-3 h-3 text-white" />
                                </div>
                                <span className="text-sm font-medium text-orange-800">Online Payment</span>
                              </div>
                              
                              <div className="flex items-center space-x-3 p-3 rounded-lg border">
                                <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
                                  <Truck className="w-3 h-3 text-gray-500" />
                                </div>
                                <span className="text-sm text-gray-600">Cash on delivery</span>
                              </div>
                              
                              <div className="flex items-center space-x-3 p-3 rounded-lg border">
                                <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
                                  <Package className="w-3 h-3 text-gray-500" />
                                </div>
                                <span className="text-sm text-gray-600">Pick up delivery</span>
                              </div>
                            </div>

                            {/* Promo Code */}
                            <div className="space-y-2">
                              <div className="flex space-x-2">
                                <Input placeholder="Add Promo" className="flex-1" />
                                <Button className="bg-green-600 hover:bg-green-700 text-white">Apply</Button>
                              </div>
                            </div>

                            {/* Order Summary */}
                            <div className="space-y-3 pt-4 border-t">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Subtotal</span>
                                <span className="font-medium">£ {parseFloat(order.subtotal || order.total).toFixed(2)}</span>
                              </div>
                              
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Delivery fee</span>
                                <span className="font-medium">£ {order.deliveryCost ? parseFloat(order.deliveryCost).toFixed(2) : '5.00'}</span>
                              </div>
                              
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Coupon Discount</span>
                                <span className="font-medium text-red-500">-£ 4.60</span>
                              </div>
                              
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Taxes</span>
                                <span className="font-medium">£ 10.00</span>
                              </div>
                              
                              <div className="flex justify-between text-lg font-bold pt-3 border-t">
                                <span>Total</span>
                                <span>£ {parseFloat(order.total).toFixed(2)}</span>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-3 pt-4">
                              <Button className="w-full bg-red-500 hover:bg-red-600 text-white">
                                Continue with Klarna
                              </Button>
                              <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                                Confirm order
                              </Button>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          ))}
          
          {filteredOrders.length > 5 && (
            <div className="text-center pt-4">
              <p className="text-sm text-gray-600">
                Showing 5 of {filteredOrders.length} orders
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { CustomerOrderHistory };