import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { OrderCardSkeleton, TableRowSkeleton } from "@/components/ui/loading-skeletons";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/currencies";

// Helper function to format address from JSON string or regular string
const formatAddress = (addressData?: string): string => {
  if (!addressData) return 'Address not provided';
  
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(addressData);
    if (parsed.street || parsed.address) {
      // Handle different address formats
      const street = parsed.street || parsed.address || '';
      const city = parsed.city || '';
      const state = parsed.state || '';
      const postalCode = parsed.postalCode || '';
      const country = parsed.country || '';
      
      // Build formatted address
      const parts = [street, city, state, postalCode, country].filter(part => part && part.trim());
      return parts.join(', ');
    }
    return addressData;
  } catch {
    // If parsing fails, return as regular string
    return addressData;
  }
};
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
  AlertCircle,
  Search,
  Filter,
  Download,
  Mail,
  TrendingUp,
  TrendingDown,
  MoreHorizontal,
  RefreshCw
} from "lucide-react";

interface Order {
  id: number;
  retailerId: string;
  wholesalerId: string;
  total: string;
  totalAmount?: string; // Keep for backward compatibility
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
    email?: string;
  };
  wholesaler: {
    id: string;
    firstName: string;
    lastName: string;
    businessName?: string;
    preferredCurrency?: string;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
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

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: number; reason?: string }) => {
      const response = await apiRequest("POST", `/api/orders/${orderId}/cancel`, { reason });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Order Cancelled",
        description: "Order has been cancelled successfully and stock has been restored.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSelectedOrder(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Cancel Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Refund order mutation
  const refundOrderMutation = useMutation({
    mutationFn: async ({ orderId, amount, reason }: { orderId: number; amount?: string; reason?: string }) => {
      const response = await apiRequest("POST", `/api/orders/${orderId}/refund`, { amount, reason });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Refund Processed",
        description: data.refund ? 
          `Refund of ${data.refund.amount} has been processed successfully.` :
          "Refund has been processed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSelectedOrder(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Refund Failed",
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

  // Calculate order statistics
  const paidOrders = orders.filter((o: any) => o.status === 'paid' || o.status === 'fulfilled');
  const totalRevenue = paidOrders.reduce((sum: number, order: any) => {
    const amount = parseFloat(order.total || '0');
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);
  
  const orderStats = {
    total: orders.length,
    pending: orders.filter((o: any) => o.status === 'pending' || o.status === 'confirmed').length,
    paid: orders.filter((o: any) => o.status === 'paid').length,
    fulfilled: orders.filter((o: any) => o.status === 'fulfilled').length,
    totalRevenue: totalRevenue,
    avgOrderValue: paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0
  };

  // Enhanced filtering
  const filteredOrders = orders.filter((order: any) => {
    let matchesStatus = statusFilter === "all";
    
    if (statusFilter === "pending") {
      // Match both "pending" and "confirmed" orders for pending filter
      matchesStatus = order.status === "pending" || order.status === "confirmed";
    } else if (statusFilter !== "all") {
      // Exact match for other statuses
      matchesStatus = order.status === statusFilter;
    }
    
    const matchesSearch = !searchTerm || 
      order.id.toString().includes(searchTerm) ||
      (order.retailer?.firstName + ' ' + order.retailer?.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.retailer?.businessName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.wholesaler?.firstName + ' ' + order.wholesaler?.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.wholesaler?.businessName || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  const getOrderTotal = (order: Order) => {
    return order.items.reduce((sum, item) => sum + parseFloat(item.total), 0);
  };

  const getTimelineEvents = (order: Order) => {
    const events = [
      {
        status: 'pending',
        title: 'Order Placed',
        description: 'Customer placed the order (Auto-populated)',
        timestamp: order.createdAt,
        completed: true,
        autoPopulated: true,
        emailSent: false
      },
      {
        status: 'confirmed',
        title: 'Order Confirmed',
        description: 'Order has been confirmed (Auto-populated)',
        timestamp: order.status === 'confirmed' || ['paid', 'fulfilled', 'archived'].includes(order.status) ? order.updatedAt : null,
        completed: order.status === 'confirmed' || ['paid', 'fulfilled', 'archived'].includes(order.status),
        emailSent: true,
        autoPopulated: true
      },
      {
        status: 'paid',
        title: 'Payment Received',
        description: 'Payment has been processed successfully (Auto-populated)',
        timestamp: order.status === 'paid' || ['fulfilled', 'archived'].includes(order.status) ? order.updatedAt : null,
        completed: order.status === 'paid' || ['fulfilled', 'archived'].includes(order.status),
        autoPopulated: true,
        emailSent: false
      },
      {
        status: 'fulfilled',
        title: 'Fulfilled',
        description: 'Order has been completed and fulfilled (Manual action required)',
        timestamp: order.status === 'fulfilled' || order.status === 'archived' ? order.updatedAt : null,
        completed: order.status === 'fulfilled' || order.status === 'archived',
        manualAction: true,
        emailSent: false,
        autoPopulated: false
      }
    ];

    // Handle special statuses
    if (order.status === 'cancelled') {
      events.push({
        status: 'cancelled',
        title: 'Cancelled',
        description: 'Order was cancelled',
        timestamp: order.updatedAt,
        completed: true,
        autoPopulated: false,
        emailSent: false
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
      
      <div className="space-y-8">
        {/* Order Header */}
        <div className="border-b pb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Order #{order.id}</h3>
              <p className="text-sm text-muted-foreground">
                Placed on {new Date(order.createdAt).toLocaleDateString('en-GB', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(parseFloat(order.total), order.wholesaler?.preferredCurrency || 'GBP')}
              </div>
              <div className="flex items-center gap-2 mt-2">
                {getStatusBadge(order.status)}
              </div>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Package className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Items Ordered ({order.items.length})</h3>
          </div>
          <div className="space-y-4">
            {order.items.map((item: any, index: number) => (
              <div key={item.id} className="border border-border/40 rounded-lg p-4 bg-background/50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Package className="h-7 w-7 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground mb-2">{item.product.name}</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Quantity:</span>
                          <span className="ml-2 font-medium">{item.quantity.toLocaleString()} units</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Unit Price:</span>
                          <span className="ml-2 font-medium">{formatCurrency(parseFloat(item.unitPrice), order.wholesaler?.preferredCurrency || 'GBP')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-primary">
                      {formatCurrency(parseFloat(item.total), order.wholesaler?.preferredCurrency || 'GBP')}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Subtotal</div>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Order Total */}
            <div className="border-t pt-4 mt-6">
              <div className="flex justify-between items-center">
                <span className="text-lg font-medium">Order Total</span>
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(parseFloat(order.total), order.wholesaler?.preferredCurrency || 'GBP')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div>
          <div className="flex items-center gap-2 mb-6">
            <User className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Customer Details</h3>
          </div>
          <div className="border border-border/40 rounded-lg p-6 bg-background/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Customer Name</label>
                  <div className="text-base font-medium text-foreground mt-1">
                    {[order.retailer?.firstName, order.retailer?.lastName].filter(Boolean).join(' ') || order.retailer?.businessName || 'Unknown Customer'}
                  </div>
                </div>
                
                {order.retailer?.phoneNumber && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Phone Number</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-base text-foreground">{order.retailer.phoneNumber}</span>
                    </div>
                  </div>
                )}
                
                {order.retailer?.email && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email Address</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-base text-foreground">{order.retailer.email}</span>
                    </div>
                  </div>
                )}
              </div>
              
              {order.deliveryAddress && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Delivery Address</label>
                  <div className="flex items-start gap-2 mt-1">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="text-base text-foreground">{formatAddress(order.deliveryAddress)}</span>
                  </div>
                </div>
              )}
            </div>
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
                  {event.status === 'paid' && <CheckCircle className="h-4 w-4" />}
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
                  
                  {/* Show auto-populated indicator */}
                  {event.autoPopulated && (
                    <div className="mt-1">
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">
                        Auto-populated
                      </span>
                    </div>
                  )}
                  
                  {/* Show manual action required indicator */}
                  {event.manualAction && !event.completed && (
                    <div className="mt-1">
                      <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded">
                        Manual action required
                      </span>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            resendConfirmationMutation.mutate(order.id);
                          }}
                          disabled={resendConfirmationMutation.isPending}
                          className="text-xs h-6"
                        >
                          {resendConfirmationMutation.isPending ? 'Sending...' : 'Resend Email'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order Actions */}
        {user?.role === 'wholesaler' && (order.status === 'paid' || order.status === 'fulfilled') && (
          <div className="flex flex-wrap gap-2 pt-4 border-t">
            <div className="w-full mb-2">
              <h4 className="font-medium text-sm text-muted-foreground">Order Actions</h4>
            </div>
            
            {order.status === 'paid' && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  updateOrderStatusMutation.mutate({
                    orderId: order.id,
                    status: 'fulfilled'
                  });
                }}
                disabled={updateOrderStatusMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {updateOrderStatusMutation.isPending ? 'Processing...' : 'Mark as Fulfilled'}
              </Button>
            )}
            
            {(order.status === 'paid' || order.status === 'fulfilled') && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm('Are you sure you want to cancel this order? Stock will be restored.')) {
                      cancelOrderMutation.mutate({
                        orderId: order.id,
                        reason: 'Cancelled by wholesaler'
                      });
                    }
                  }}
                  disabled={cancelOrderMutation.isPending}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {cancelOrderMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const reason = prompt('Reason for refund (optional):');
                    if (reason !== null) { // User didn't cancel the prompt
                      refundOrderMutation.mutate({
                        orderId: order.id,
                        reason: reason || 'Full refund requested'
                      });
                    }
                  }}
                  disabled={refundOrderMutation.isPending}
                  className="border-orange-200 text-orange-600 hover:bg-orange-50"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {refundOrderMutation.isPending ? 'Processing...' : 'Process Refund'}
                </Button>
              </>
            )}
          </div>
        )}
        
        {user?.role === 'wholesaler' && order.status !== 'paid' && order.status !== 'cancelled' && order.status !== 'fulfilled' && order.status !== 'archived' && (
          <div className="text-sm text-muted-foreground px-3 py-2 bg-muted/30 rounded">
            {order.status === 'pending' && 'Order placed - awaiting confirmation'}
            {order.status === 'confirmed' && 'Order confirmed - awaiting payment'}
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
      {/* Header */}
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
        
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Order Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{orderStats.total}</p>
                <p className="text-sm text-muted-foreground">Total Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{orderStats.pending}</p>
                <p className="text-sm text-muted-foreground">Unfulfilled Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatCurrency(orderStats.totalRevenue, user?.preferredCurrency || 'USD')}
                </p>
                <p className="text-sm text-muted-foreground">Paid Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatCurrency(orderStats.avgOrderValue, user?.preferredCurrency || 'USD')}
                </p>
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders by ID, customer name, or business..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders ({orderStats.total})</SelectItem>
                <SelectItem value="pending">Unfulfilled ({orderStats.pending})</SelectItem>
                <SelectItem value="confirmed">Order Confirmed</SelectItem>
                <SelectItem value="paid">Payment Received ({orderStats.paid})</SelectItem>
                <SelectItem value="fulfilled">Fulfilled ({orderStats.fulfilled})</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            {selectedOrders.length > 0 && (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    toast({
                      title: "Email Feature",
                      description: `Sending emails to ${selectedOrders.length} selected orders...`,
                    });
                  }}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email ({selectedOrders.length})
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    toast({
                      title: "Bulk Actions",
                      description: `Managing ${selectedOrders.length} selected orders...`,
                    });
                  }}
                >
                  <MoreHorizontal className="h-4 w-4 mr-2" />
                  Actions
                </Button>
              </div>
            )}
          </div>
          
          {/* Quick Filter Pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Button 
              variant={statusFilter === "pending" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("pending")}
            >
              Unfulfilled ({orderStats.pending})
            </Button>
            <Button 
              variant={statusFilter === "paid" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("paid")}
            >
              Paid ({orderStats.paid})
            </Button>
            <Button 
              variant={statusFilter === "fulfilled" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("fulfilled")}
            >
              Fulfilled ({orderStats.fulfilled})
            </Button>
            <Button 
              variant={statusFilter === "all" ? "default" : "outline"} 
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              View All
            </Button>
          </div>
        </CardContent>
      </Card>

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
            <Card 
              key={order.id} 
              className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border hover:border-primary/20"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedOrders.includes(order.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedOrders([...selectedOrders, order.id]);
                          } else {
                            setSelectedOrders(selectedOrders.filter(id => id !== order.id));
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Package className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        Order #{order.id}
                        {order.status === 'paid' && (
                          <Badge variant="secondary" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Action Needed
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {user?.role === 'retailer' 
                          ? (order.wholesaler?.businessName || [order.wholesaler?.firstName, order.wholesaler?.lastName].filter(Boolean).join(' '))
                          : ([order.retailer?.firstName, order.retailer?.lastName].filter(Boolean).join(' ') || order.retailer?.businessName || 'Unknown Customer')
                        }
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {order.retailer?.phoneNumber && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {order.retailer.phoneNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* Order Summary */}
                    <div className="text-right">
                      <div className="font-semibold group-hover:text-primary transition-colors">
                        {formatCurrency(parseFloat(order.totalAmount || order.total || 0), user?.preferredCurrency || 'USD')}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 mr-1 inline" />
                        {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.status)}
                      
                      {/* Quick Actions for Wholesalers */}
                      {user?.role === 'wholesaler' && order.status === 'paid' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateOrderStatusMutation.mutate({
                              orderId: order.id,
                              status: 'fulfilled'
                            });
                          }}
                          disabled={updateOrderStatusMutation.isPending}
                          className="text-green-600 border-green-200 hover:bg-green-50"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Mark Fulfilled
                        </Button>
                      )}
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="group-hover:border-primary/50">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <OrderDetailModal order={order} />
                      </Dialog>
                    </div>
                  </div>
                </div>
                
                {/* Order Progress Indicator */}
                <div className="mt-4 pt-3 border-t">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-4">
                      <span className={order.status === 'pending' || order.status === 'confirmed' || order.status === 'paid' || order.status === 'fulfilled' ? 'text-green-600' : ''}>
                        ✓ Order Placed
                      </span>
                      <span className={order.status === 'confirmed' || order.status === 'paid' || order.status === 'fulfilled' ? 'text-green-600' : ''}>
                        ✓ Confirmed
                      </span>
                      <span className={order.status === 'paid' || order.status === 'fulfilled' ? 'text-green-600' : ''}>
                        ✓ Payment Received
                      </span>
                      <span className={order.status === 'fulfilled' ? 'text-green-600' : 'text-muted-foreground'}>
                        {order.status === 'fulfilled' ? '✓' : '○'} Fulfilled
                      </span>
                    </div>
                    
                    {order.deliveryAddress && (
                      <div className="flex items-center gap-1 max-w-xs">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{formatAddress(order.deliveryAddress)}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                  <div className="text-xs">
                    {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}