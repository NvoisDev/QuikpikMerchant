import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, Package, DollarSign, Clock, Users, CheckCircle, X, Truck, MapPin } from "lucide-react";
// Simple currency formatter
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2
  }).format(amount);
};

interface Order {
  id: number;
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  total: string;
  status: string;
  createdAt: string;
  fulfillmentType?: string;
  deliveryAddress?: string;
  subtotal?: string;
  deliveryCost?: string;
  items?: OrderItem[];
}

interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: string;
  total: string;
  product: {
    id: number;
    name: string;
    imageUrl?: string;
    moq?: number;
  };
}

export default function OrdersFresh() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('📦 Loading orders from lightweight endpoint...');
      const response = await fetch('/api/orders-light');
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Loaded ${data.length} orders successfully`);
        setOrders(data);
      } else {
        throw new Error(`Server responded with ${response.status}`);
      }
    } catch (err) {
      console.error('❌ Failed to load orders:', err);
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Load detailed order information for modal
  const loadOrderDetails = async (orderId: number) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      if (response.ok) {
        const orderDetails = await response.json();
        setSelectedOrder(orderDetails);
      }
    } catch (error) {
      console.error('Failed to load order details:', error);
    }
  };

  // Update order status to fulfilled
  const markAsFulfilled = async (orderId: number) => {
    setUpdatingOrderId(orderId);
    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fulfilled' })
      });
      
      if (response.ok) {
        // Update local state
        setOrders(orders.map(order => 
          order.id === orderId ? { ...order, status: 'fulfilled' } : order
        ));
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder({ ...selectedOrder, status: 'fulfilled' });
        }
      }
    } catch (error) {
      console.error('Failed to update order status:', error);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800",
      fulfilled: "bg-blue-100 text-blue-800",
      cancelled: "bg-red-100 text-red-800"
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  // Calculate amounts after platform fee (3.3% for wholesaler)
  const calculateNetAmount = (total: string) => {
    const totalAmount = parseFloat(total || '0');
    const platformFee = totalAmount * 0.033; // 3.3% platform fee
    return totalAmount - platformFee;
  };

  const totalOrders = orders.length;
  const totalValue = orders.reduce((sum, order) => sum + calculateNetAmount(order.total), 0);
  const paidOrders = orders.filter(o => o.status === 'paid').length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">Loading orders...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={loadOrders}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Orders</h1>
        <Button onClick={loadOrders} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground">After platform fees</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Orders</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paidOrders}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingOrders}</div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Net Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.slice(0, 50).map((order) => (
                    <TableRow key={order.id} className="cursor-pointer hover:bg-gray-50" onClick={() => loadOrderDetails(order.id)}>
                      <TableCell className="font-medium">
                        {order.orderNumber || `#${order.id}`}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.customerName || 'Unknown'}</div>
                          <div className="text-sm text-gray-500">{order.customerEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>
                          <div>{formatCurrency(calculateNetAmount(order.total))}</div>
                          <div className="text-xs text-gray-500">After platform fee</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Badge className={getStatusColor(order.status)}>
                            {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                          </Badge>
                          {order.fulfillmentType && (
                            <Badge variant="outline" className="text-xs">
                              {order.fulfillmentType === 'delivery' ? (
                                <><Truck className="w-3 h-3 mr-1" />Delivery</>
                              ) : (
                                <><MapPin className="w-3 h-3 mr-1" />Collection</>
                              )}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.status !== 'fulfilled' ? (
                          <Button 
                            size="sm" 
                            variant="outline"
                            disabled={updatingOrderId === order.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsFulfilled(order.id);
                            }}
                          >
                            {updatingOrderId === order.id ? 'Updating...' : 'Mark Fulfilled'}
                          </Button>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Fulfilled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Details Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-semibold">Order {selectedOrder?.orderNumber || `#${selectedOrder?.id}`}</DialogTitle>
                <p className="text-sm text-gray-500">Order ID: {selectedOrder?.id}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(null)}>
                Close
              </Button>
            </div>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 text-sm">
              {/* Status & Fulfillment */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Status & Fulfillment</h3>
                <div className="flex gap-2">
                  <Badge className="bg-green-100 text-green-800 text-xs px-2 py-1">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Paid
                  </Badge>
                  <Badge variant="outline" className="text-xs px-2 py-1">
                    {selectedOrder.fulfillmentType === 'delivery' ? (
                      <><Truck className="w-3 h-3 mr-1" />Delivery</>
                    ) : (
                      <><MapPin className="w-3 h-3 mr-1" />Collection</>
                    )}
                  </Badge>
                  {selectedOrder.status === 'fulfilled' && (
                    <Badge className="bg-blue-100 text-blue-800 text-xs px-2 py-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Fulfilled
                    </Badge>
                  )}
                </div>
              </div>

              {/* Customer Information */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Customer Information</h3>
                <div className="space-y-1 text-xs">
                  <div><span className="font-medium">Name:</span> {selectedOrder.customerName}</div>
                  <div><span className="font-medium">Email:</span> {selectedOrder.customerEmail}</div>
                  {selectedOrder.customerPhone && (
                    <div><span className="font-medium">Phone:</span> {selectedOrder.customerPhone}</div>
                  )}
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Items ({selectedOrder.items?.length || 0})</h3>
                <div className="space-y-2">
                  {selectedOrder.items?.map((item, index) => (
                    <div key={index} className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.product?.name || 'Unknown Product'}</div>
                        <div className="text-xs text-gray-500">
                          Quantity: {item.quantity} units × {formatCurrency(parseFloat(item.unitPrice))}
                        </div>
                      </div>
                      <div className="font-medium text-sm ml-4">
                        {formatCurrency(parseFloat(item.total))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Summary */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Payment Summary</h3>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(parseFloat(selectedOrder.total))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transaction Fee (5.5% + £0.50):</span>
                    <span>£{((parseFloat(selectedOrder.total) * 0.055) + 0.50).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery Cost:</span>
                    <span>£{(parseFloat(selectedOrder.deliveryCost || '0')).toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-1 mt-2">
                    <div className="flex justify-between font-medium">
                      <span>Total Paid:</span>
                      <span>{formatCurrency(parseFloat(selectedOrder.total))}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Timeline */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Order Timeline</h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5"></div>
                    <div>
                      <div className="text-xs font-medium">Customer payment received</div>
                      <div className="text-xs text-gray-500">
                        {new Date(selectedOrder.createdAt).toLocaleDateString()} at {new Date(selectedOrder.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5"></div>
                    <div>
                      <div className="text-xs font-medium">Order notification received</div>
                      <div className="text-xs text-gray-500">
                        {new Date(selectedOrder.createdAt).toLocaleDateString()} at {new Date(selectedOrder.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5"></div>
                    <div>
                      <div className="text-xs font-medium">Customer confirmation sent</div>
                      <div className="text-xs text-gray-500">
                        {new Date(selectedOrder.createdAt).toLocaleDateString()} at {new Date(selectedOrder.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  {selectedOrder.status !== 'fulfilled' && (
                    <>
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-gray-300 rounded-full mt-1.5"></div>
                        <div>
                          <div className="text-xs text-gray-500">Prepare order items</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-gray-300 rounded-full mt-1.5"></div>
                        <div>
                          <div className="text-xs text-gray-500">Package for {selectedOrder.fulfillmentType === 'delivery' ? 'delivery' : 'collection'}</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-gray-300 rounded-full mt-1.5"></div>
                        <div>
                          <div className="text-xs text-gray-500">Mark as fulfilled when ready</div>
                        </div>
                      </div>
                    </>
                  )}
                  {selectedOrder.status === 'fulfilled' && (
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>
                      <div>
                        <div className="text-xs font-medium">Order fulfilled by you</div>
                        <div className="text-xs text-gray-500">
                          {selectedOrder.fulfillmentType === 'delivery' ? 'Ready for delivery' : 'Ready for customer collection'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {selectedOrder.status !== 'fulfilled' && (
                <div className="flex justify-end pt-2 border-t">
                  <Button 
                    size="sm"
                    onClick={() => markAsFulfilled(selectedOrder.id)}
                    disabled={updatingOrderId === selectedOrder.id}
                  >
                    {updatingOrderId === selectedOrder.id ? 'Updating...' : 'Mark as Fulfilled'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}