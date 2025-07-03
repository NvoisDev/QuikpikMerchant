import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Calendar
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

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: "secondary" as const, icon: Clock, label: "Pending" },
      confirmed: { variant: "default" as const, icon: CheckCircle, label: "Confirmed" },
      processing: { variant: "default" as const, icon: Package, label: "Processing" },
      shipped: { variant: "default" as const, icon: Truck, label: "Shipped" },
      delivered: { variant: "default" as const, icon: CheckCircle, label: "Delivered" },
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
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
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
        <div className="grid gap-6">
          {filteredOrders.map((order: any) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <CardTitle className="text-lg">Order #{order.id}</CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {formatCurrency(getOrderTotal(order))}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Customer/Wholesaler Info */}
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">
                      {user?.role === 'retailer' 
                        ? (order.wholesaler.businessName || `${order.wholesaler.firstName} ${order.wholesaler.lastName}`)
                        : (order.retailer.businessName || `${order.retailer.firstName} ${order.retailer.lastName}`)
                      }
                    </div>
                    {user?.role !== 'retailer' && order.retailer.phoneNumber && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {order.retailer.phoneNumber}
                      </div>
                    )}
                  </div>
                </div>

                {/* Order Items */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Order Items:</h4>
                  {order.items.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-3">
                        {item.product.imageUrl && (
                          <img 
                            src={item.product.imageUrl} 
                            alt={item.product.name}
                            className="h-10 w-10 object-cover rounded"
                          />
                        )}
                        <div>
                          <div className="font-medium">{item.product.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Qty: {item.quantity} × {formatCurrency(parseFloat(item.unitPrice))}
                          </div>
                        </div>
                      </div>
                      <div className="font-medium">
                        {formatCurrency(parseFloat(item.total))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delivery Address */}
                {order.deliveryAddress && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="font-medium">Delivery Address:</div>
                      <div className="text-muted-foreground">{order.deliveryAddress}</div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {order.notes && (
                  <div className="text-sm">
                    <div className="font-medium">Notes:</div>
                    <div className="text-muted-foreground">{order.notes}</div>
                  </div>
                )}

                {/* Actions for wholesalers */}
                {user?.role === 'wholesaler' && order.status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: 'confirmed' })}
                      disabled={updateOrderStatusMutation.isPending}
                    >
                      Confirm Order
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: 'cancelled' })}
                      disabled={updateOrderStatusMutation.isPending}
                    >
                      Cancel Order
                    </Button>
                  </div>
                )}

                {user?.role === 'wholesaler' && order.status === 'confirmed' && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: 'processing' })}
                      disabled={updateOrderStatusMutation.isPending}
                    >
                      Start Processing
                    </Button>
                  </div>
                )}

                {user?.role === 'wholesaler' && order.status === 'processing' && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: 'shipped' })}
                      disabled={updateOrderStatusMutation.isPending}
                    >
                      Mark as Shipped
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}