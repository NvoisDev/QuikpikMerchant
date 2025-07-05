import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/currencies";
import { 
  Package, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Truck,
  User,
  Phone,
  MapPin,
  Calendar,
  Eye,
  DollarSign,
  ShoppingCart,
  AlertCircle
} from "lucide-react";

interface Order {
  id: number;
  retailerId: string;
  wholesalerId: string;
  totalAmount: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  deliveryAddress?: string;
  notes?: string;
  retailer: {
    id: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    businessName?: string;
  };
  wholesaler: {
    id: string;
    firstName: string;
    lastName: string;
    businessName?: string;
  };
  items: Array<{
    id: number;
    productId: number;
    quantity: number;
    unitPrice: string;
    total: string;
    product: {
      id: number;
      name: string;
      imageUrl?: string;
      moq: number;
    };
  }>;
}

export default function Orders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Fetch orders based on user role
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["/api/orders", user?.role],
    queryFn: async () => {
      const roleParam = user?.role === 'retailer' ? 'customer' : 'wholesaler';
      const response = await fetch(`/api/orders?role=${roleParam}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch orders");
      return response.json();
    },
    enabled: !!user,
  });

  // Update order status mutation (for wholesalers)
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Order Updated",
        description: "Order status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Resend confirmation email mutation
  const resendConfirmationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const response = await apiRequest("POST", `/api/orders/${orderId}/resend-confirmation`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email Sent",
        description: "Order confirmation email has been resent successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Email Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: "secondary" as const, icon: Clock, label: "Pending" },
      unfulfilled: { variant: "destructive" as const, icon: AlertCircle, label: "Unfulfilled" },
      confirmed: { variant: "default" as const, icon: CheckCircle, label: "Confirmed" },
      paid: { variant: "default" as const, icon: DollarSign, label: "Paid" },
      processing: { variant: "default" as const, icon: Package, label: "Processing" },
      shipped: { variant: "default" as const, icon: Truck, label: "Shipped" },
      delivered: { variant: "default" as const, icon: CheckCircle, label: "Delivered" },
      fulfilled: { variant: "default" as const, icon: CheckCircle, label: "Fulfilled" },
      archived: { variant: "secondary" as const, icon: Package, label: "Archived" },
      cancelled: { variant: "destructive" as const, icon: XCircle, label: "Cancelled" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const filteredOrders = orders.filter((order: any) => 
    statusFilter === "all" || order.status === statusFilter
  );

  const getOrderTotal = (order: Order) => {
    return order.items.reduce((sum, item) => sum + parseFloat(item.total), 0);
  };

  const getTimelineEvents = (order: Order) => {
    const events = [
      {
        status: 'pending',
        title: 'Order Placed',
        description: 'Customer placed the order',
        timestamp: order.createdAt,
        completed: true
      },
      {
        status: 'confirmed',
        title: 'Order Confirmed',
        description: 'Order has been confirmed by wholesaler',
        timestamp: order.status === 'confirmed' || ['paid', 'processing', 'shipped', 'delivered'].includes(order.status) ? order.updatedAt : null,
        completed: order.status === 'confirmed' || ['paid', 'processing', 'shipped', 'delivered'].includes(order.status),
        emailSent: true
      },
      {
        status: 'paid',
        title: 'Payment Received',
        description: 'Payment has been processed successfully',
        timestamp: order.status === 'paid' || ['processing', 'shipped', 'delivered'].includes(order.status) ? order.updatedAt : null,
        completed: order.status === 'paid' || ['processing', 'shipped', 'delivered'].includes(order.status)
      },
      {
        status: 'processing',
        title: 'Processing',
        description: 'Order is being prepared for shipment',
        timestamp: order.status === 'processing' || ['shipped', 'delivered'].includes(order.status) ? order.updatedAt : null,
        completed: order.status === 'processing' || ['shipped', 'delivered'].includes(order.status)
      },
      {
        status: 'shipped',
        title: 'Shipped',
        description: 'Order has been shipped to customer',
        timestamp: order.status === 'shipped' || order.status === 'delivered' ? order.updatedAt : null,
        completed: order.status === 'shipped' || order.status === 'delivered'
      },
      {
        status: 'delivered',
        title: 'Delivered',
        description: 'Order has been delivered successfully',
        timestamp: order.status === 'delivered' || ['fulfilled', 'archived'].includes(order.status) ? order.updatedAt : null,
        completed: order.status === 'delivered' || ['fulfilled', 'archived'].includes(order.status)
      },
      {
        status: 'fulfilled',
        title: 'Fulfilled',
        description: 'Order has been completed and fulfilled',
        timestamp: order.status === 'fulfilled' || order.status === 'archived' ? order.updatedAt : null,
        completed: order.status === 'fulfilled' || order.status === 'archived'
      }
    ];

    // Handle special statuses
    if (order.status === 'unfulfilled') {
      events.push({
        status: 'unfulfilled',
        title: 'Unfulfilled',
        description: 'Order could not be fulfilled',
        timestamp: order.updatedAt,
        completed: true
      });
    }

    if (order.status === 'cancelled') {
      events.push({
        status: 'cancelled',
        title: 'Cancelled',
        description: 'Order was cancelled',
        timestamp: order.updatedAt,
        completed: true
      });
    }

    return events;
  };

  const OrderDetailModal = ({ order }: { order: Order }) => (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Order #{order.id} Details
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-6">
        {/* Order Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">#{order.id}</div>
            <div className="text-sm text-muted-foreground">Order ID</div>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold">{formatCurrency(parseFloat(order.total), user?.currency || 'USD')}</div>
            <div className="text-sm text-muted-foreground">Total Amount</div>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold">{order.items.length}</div>
            <div className="text-sm text-muted-foreground">Items</div>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            {getStatusBadge(order.status)}
            <div className="text-sm text-muted-foreground mt-1">Status</div>
          </div>
        </div>

        {/* Customer Information */}
        <div className="bg-muted/30 p-4 rounded-lg">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <User className="h-4 w-4" />
            Customer Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="font-medium">
                {order.retailer?.businessName || `${order.retailer?.firstName} ${order.retailer?.lastName}`}
              </div>
              {order.retailer?.phoneNumber && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {order.retailer.phoneNumber}
                </div>
              )}
            </div>
            {order.deliveryAddress && (
              <div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {order.deliveryAddress}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Timeline */}
        <div>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Order Timeline
          </h3>
          <div className="space-y-4">
            {getTimelineEvents(order).map((event, index) => (
              <div key={event.status} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  event.completed ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  {event.status === 'pending' && <ShoppingCart className="h-4 w-4" />}
                  {event.status === 'confirmed' && <CheckCircle className="h-4 w-4" />}
                  {event.status === 'processing' && <Package className="h-4 w-4" />}
                  {event.status === 'shipped' && <Truck className="h-4 w-4" />}
                  {event.status === 'delivered' && <CheckCircle className="h-4 w-4" />}
                  {event.status === 'fulfilled' && <CheckCircle className="h-4 w-4" />}
                  {event.status === 'cancelled' && <XCircle className="h-4 w-4" />}
                  {event.status === 'unfulfilled' && <AlertCircle className="h-4 w-4" />}
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${event.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {event.title}
                  </div>
                  <div className="text-sm text-muted-foreground">{event.description}</div>
                  {event.timestamp && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleString()}
                    </div>
                  )}
                  {/* Show email notification for confirmed orders */}
                  {event.status === 'confirmed' && event.completed && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                        ✓ Confirmation email sent automatically
                      </div>
                      {user?.role === 'wholesaler' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resendConfirmationMutation.mutate(order.id)}
                          disabled={resendConfirmationMutation.isPending}
                          className="text-xs h-6"
                        >
                          Resend Email
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order Items */}
        <div>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Package className="h-4 w-4" />
            Order Items
          </h3>
          <div className="space-y-3">
            {order.items.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium">{item.product.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Quantity: {item.quantity} × {formatCurrency(parseFloat(item.unitPrice), user?.currency || 'USD')}
                    </div>
                  </div>
                </div>
                <div className="font-semibold">
                  {formatCurrency(parseFloat(item.total), user?.currency || 'USD')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order Actions */}
        {user?.role === 'wholesaler' && order.status !== 'delivered' && order.status !== 'cancelled' && (
          <div className="flex gap-2">
            <Select
              value={order.status}
              onValueChange={(newStatus) => {
                updateOrderStatusMutation.mutate({
                  orderId: order.id,
                  status: newStatus
                });
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="unfulfilled">Unfulfilled</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="fulfilled">Fulfilled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </DialogContent>
  );

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {user?.role === 'retailer' ? 'My Orders' : 'Order Management'}
          </h1>
          <p className="text-muted-foreground">
            {user?.role === 'retailer' 
              ? 'Track your orders and delivery status'
              : 'Manage incoming orders from your customers'
            }
          </p>
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="unfulfilled">Unfulfilled</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="fulfilled">Fulfilled</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Orders Found</h3>
            <p className="text-muted-foreground">
              {statusFilter === "all" 
                ? "You haven't received any orders yet." 
                : `No orders with status "${statusFilter}".`
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredOrders.map((order: any) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold">Order #{order.id}</div>
                      <div className="text-sm text-muted-foreground">
                        {user?.role === 'retailer' 
                          ? (order.wholesaler?.businessName || `${order.wholesaler?.firstName} ${order.wholesaler?.lastName}`)
                          : (order.retailer?.businessName || `${order.retailer?.firstName} ${order.retailer?.lastName}`)
                        }
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold">
                        {formatCurrency(parseFloat(order.total), user?.currency || 'USD')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.status)}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <OrderDetailModal order={order} />
                      </Dialog>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                  {order.deliveryAddress && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate max-w-xs">{order.deliveryAddress}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}