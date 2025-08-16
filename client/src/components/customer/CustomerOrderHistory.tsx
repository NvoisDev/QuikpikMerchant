import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Package, Clock, Eye, Search, Calendar, ShoppingBag } from "lucide-react";
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
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Order {order.orderNumber}</DialogTitle>
                      </DialogHeader>
                      
                      <div className="space-y-6">
                        {/* Order Summary */}
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium text-gray-900 mb-2">Order Information</h4>
                            <div className="space-y-1 text-sm">
                              <div>Date: {new Date(order.createdAt).toLocaleDateString('en-GB')}</div>
                              <div>Status: <Badge className={getStatusColor(order.status)}>{order.status}</Badge></div>
                              <div>Payment: {order.paymentMethod || 'Card Payment'}</div>
                            </div>
                          </div>
                          
                          <div>
                            <h4 className="font-medium text-gray-900 mb-2">Delivery</h4>
                            <div className="space-y-1 text-sm">
                              <div>Type: {order.fulfillmentType || 'Standard'}</div>
                              {order.deliveryCarrier && <div>Carrier: {order.deliveryCarrier}</div>}
                              {order.deliveryCost && <div>Cost: £{parseFloat(order.deliveryCost).toFixed(2)}</div>}
                            </div>
                          </div>
                        </div>

                        {/* Items */}
                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">Items Ordered</h4>
                          <div className="space-y-2">
                            {order.items?.map((item: OrderItem, index: number) => (
                              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                                <div>
                                  <div className="font-medium">{item.productName}</div>
                                  <div className="text-sm text-gray-600">
                                    {item.quantity} × £{parseFloat(item.unitPrice).toFixed(2)}
                                  </div>
                                </div>
                                <div className="font-medium">
                                  £{parseFloat(item.total).toFixed(2)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Order Total */}
                        <div className="border-t pt-4">
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-semibold">Total</span>
                            <span className="text-xl font-bold text-green-600">
                              £{parseFloat(order.total).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
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