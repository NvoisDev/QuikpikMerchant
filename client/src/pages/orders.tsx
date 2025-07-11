import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { OrderCardSkeleton, TableRowSkeleton } from "@/components/ui/loading-skeletons";
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
  AlertCircle,
  Search,
  Filter,
  Download,
  Mail,
  TrendingUp,
  CreditCard,
  TrendingDown,
  MoreHorizontal,
  RefreshCw,
  Grid,
  List,
  ArrowUpDown
} from "lucide-react";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import ShippingIntegration from "@/components/shipping-integration";
import ShippingQuoteModal from "@/components/shipping-quote-modal";
import ShippingSettings from "@/pages/shipping-settings";
import ShippingTracking from "@/pages/shipping-tracking";

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
  // Shipping fields
  shippingOrderId?: string;
  shippingHash?: string;
  shippingTotal?: string;
  shippingStatus?: string;
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
  const [shippingModalOrder, setShippingModalOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState("orders");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Update order status mutation
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update order" }));
        throw new Error(errorData.message || `Failed to update order: ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Order Updated",
        description: `Order #${variables.orderId} has been marked as fulfilled successfully.`,
      });
      
      // Force immediate refresh of orders data
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.refetchQueries({ queryKey: ["/api/orders"] });
      
      setSelectedOrder(null); // Close the modal after successful update
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed", 
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch orders based on user role
  const { data: orders = [], isLoading, error } = useQuery({
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
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // Fetch user business address for shipping collection address
  const { data: businessAddress } = useQuery({
    queryKey: ["/api/auth/user", "business-address"],
    queryFn: async () => {
      const response = await fetch("/api/auth/user", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch user data");
      const userData = await response.json();
      return {
        streetAddress: userData.streetAddress || '',
        city: userData.city || '',
        postalCode: userData.postalCode || '',
        country: userData.country || 'United Kingdom'
      };
    },
    enabled: !!user,
  });

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
      matchesStatus = order.status === statusFilter;
    }
    
    const matchesSearch = searchTerm === "" || 
      order.id.toString().includes(searchTerm) ||
      (order.retailer?.firstName + " " + order.retailer?.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.retailer?.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.retailer?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
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
      refunded: { variant: "destructive" as const, icon: RefreshCw, label: "Refunded" },
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

  // Add notification when new orders arrive or fulfillment status changes
  const previousOrderCount = useRef(orders.length);
  const previousFulfilledCount = useRef(orders.filter((o: any) => o.status === 'fulfilled').length);
  
  useEffect(() => {
    // Notify for new orders
    if (orders.length > previousOrderCount.current && previousOrderCount.current > 0) {
      toast({
        title: "New Order Received!",
        description: `You have ${orders.length - previousOrderCount.current} new order(s)`,
      });
    }
    
    // Notify for fulfilled orders
    const currentFulfilledCount = orders.filter((o: any) => o.status === 'fulfilled').length;
    if (currentFulfilledCount > previousFulfilledCount.current && previousFulfilledCount.current > 0) {
      toast({
        title: "Order Fulfilled",
        description: `${currentFulfilledCount - previousFulfilledCount.current} order(s) marked as fulfilled`,
      });
    }
    
    previousOrderCount.current = orders.length;
    previousFulfilledCount.current = currentFulfilledCount;
  }, [orders.length, orders, toast]);

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
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">
              {user?.role === 'retailer' ? 'My Orders' : 'Order Management & Shipping'}
            </h1>
            <ContextualHelpBubble
              topic="order management"
              title="Managing Customer Orders"
              steps={helpContent.orders.steps}
              position="right"
            />
          </div>
          <p className="text-muted-foreground">
            {user?.role === 'retailer' 
              ? 'Track your orders and delivery status'
              : 'Manage orders, shipping settings, and track deliveries'
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

      {/* Tabs for Orders, Shipping Settings, and Shipping Tracking */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="shipping-settings" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Shipping Settings
          </TabsTrigger>
          <TabsTrigger value="shipping-tracking" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Shipping Tracking
          </TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-6">
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
                
                {/* View Mode Toggle */}
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                  <Button
                    variant={viewMode === "cards" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("cards")}
                    className={`${viewMode === "cards" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"} flex items-center gap-2`}
                  >
                    <Grid className="h-4 w-4" />
                    <span>Grid</span>
                  </Button>
                  <Button
                    variant={viewMode === "table" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("table")}
                    className={`${viewMode === "table" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"} flex items-center gap-2`}
                  >
                    <List className="h-4 w-4" />
                    <span>List</span>
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[200px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Orders</SelectItem>
                      <SelectItem value="pending">Unfulfilled</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="fulfilled">Fulfilled</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Order List */}
          {filteredOrders.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No orders found</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? 'Try adjusting your search criteria' : 'Orders will appear here when customers place them'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Table View */}
              {viewMode === "table" ? (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left p-4 font-medium text-gray-900">
                              <div className="flex items-center gap-2">
                                <Checkbox />
                                Order
                                <ArrowUpDown className="h-4 w-4 text-gray-400" />
                              </div>
                            </th>
                            <th className="text-left p-4 font-medium text-gray-900">Customer</th>
                            <th className="text-left p-4 font-medium text-gray-900">Channel</th>
                            <th className="text-left p-4 font-medium text-gray-900">Total</th>
                            <th className="text-left p-4 font-medium text-gray-900">Payment Status</th>
                            <th className="text-left p-4 font-medium text-gray-900">Fulfillment Status</th>
                            <th className="text-left p-4 font-medium text-gray-900">Items</th>
                            <th className="text-left p-4 font-medium text-gray-900">Delivery Method</th>
                            <th className="text-left p-4 font-medium text-gray-900">Tags</th>
                            <th className="text-left p-4 font-medium text-gray-900">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOrders.map((order: any) => (
                            <tr 
                              key={order.id} 
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => setSelectedOrder(order)}
                            >
                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  <Checkbox />
                                  <div>
                                    <div className="font-medium">#{order.id}</div>
                                    <div className="text-sm text-gray-500">
                                      {new Date(order.createdAt).toLocaleDateString('en-GB', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                      })} at {new Date(order.createdAt).toLocaleTimeString('en-GB', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <div>
                                  <div className="font-medium">
                                    {order.retailer ? `${order.retailer.firstName} ${order.retailer.lastName}` : 'Unknown Customer'}
                                  </div>
                                  {order.retailer?.businessName && (
                                    <div className="text-sm text-gray-500">{order.retailer.businessName}</div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <span className="text-sm text-gray-600">Online Store</span>
                              </td>
                              <td className="p-4">
                                <div className="font-medium">
                                  {formatCurrency(parseFloat(order.total), order.wholesaler?.preferredCurrency || 'GBP')}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                  <span className="text-sm">Paid</span>
                                </div>
                              </td>
                              <td className="p-4">
                                {order.status === 'fulfilled' ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                    <span className="text-sm">Fulfilled</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                    <span className="text-sm">Unfulfilled</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-4">
                                <span className="text-sm">{order.items?.length || 1} item{(order.items?.length || 1) !== 1 ? 's' : ''}</span>
                              </td>
                              <td className="p-4">
                                <div className="text-sm">
                                  {order.shippingOrderId ? (
                                    <div className="flex items-center gap-1">
                                      <Truck className="h-3 w-3" />
                                      <span>Express</span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-500">Express</span>
                                  )}
                                  {order.shippingOrderId && (
                                    <div className="text-xs text-gray-500 mt-1">Tracking added</div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-1">
                                  {order.retailer?.businessName && (
                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">Business</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrder(order);
                                    }}
                                    className="flex items-center gap-1"
                                  >
                                    <Eye className="h-4 w-4" />
                                    View
                                  </Button>
                                  {/* Quick fulfill button - only show for paid orders */}
                                  {(user?.role === 'wholesaler' || user?.role === 'team_member') && order.status === 'paid' && (
                                    <Button 
                                      variant="default" 
                                      size="sm" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateOrderStatusMutation.mutate({
                                          orderId: order.id,
                                          status: 'fulfilled'
                                        });
                                      }}
                                      disabled={updateOrderStatusMutation.isPending}
                                      className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                      Fulfill
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                /* Cards View */
                <div className="space-y-4">
                  {filteredOrders.map((order: any) => (
                <Card key={order.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="font-semibold text-lg">Order #{order.id}</h3>
                          {getStatusBadge(order.status)}
                          
                          {/* Show shipping status */}
                          {(user?.role === 'wholesaler' || user?.role === 'team_member') && (
                            <>
                              {/* Customer selected delivery option */}
                              {order.shippingOption === 'delivery' && order.shippingService ? (
                                <Badge variant="default" className="ml-2">
                                  <Truck className="h-3 w-3 mr-1" />
                                  {order.shippingService} - £{order.shippingCost}
                                </Badge>
                              ) : order.shippingOption === 'pickup' ? (
                                <Badge variant="secondary" className="ml-2">
                                  <Package className="h-3 w-3 mr-1" />
                                  Pickup
                                </Badge>
                              ) : order.status === 'paid' && !order.shippingOrderId && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setShippingModalOrder(order)}
                                  className="ml-2"
                                >
                                  <Truck className="h-4 w-4 mr-1" />
                                  Add Shipping
                                </Button>
                              )}
                              
                              {/* Show tracking info if available */}
                              {order.shippingOrderId && (
                                <Badge variant="secondary" className="ml-2">
                                  <Truck className="h-3 w-3 mr-1" />
                                  Tracking Added
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Customer:</span>
                            <div className="font-medium">
                              {order.retailer ? `${order.retailer.firstName} ${order.retailer.lastName}` : 'Unknown Customer'}
                            </div>
                            {order.retailer?.businessName && (
                              <div className="text-xs text-muted-foreground">{order.retailer.businessName}</div>
                            )}
                          </div>
                          
                          <div>
                            <span className="text-muted-foreground">Total:</span>
                            <div className="font-medium text-lg">
                              {formatCurrency(parseFloat(order.total), order.wholesaler?.preferredCurrency || 'GBP')}
                            </div>
                          </div>
                          
                          <div>
                            <span className="text-muted-foreground">Date:</span>
                            <div className="font-medium">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-3 border-t">
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
                            <div className="flex items-center gap-1 max-w-xs mt-2">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate text-sm text-muted-foreground">{formatAddress(order.deliveryAddress)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="ml-4 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                        {/* Quick fulfill button - only show for paid orders */}
                        {(user?.role === 'wholesaler' || user?.role === 'team_member') && order.status === 'paid' && (
                          <Button 
                            variant="default" 
                            size="sm" 
                            onClick={(e) => {
                              e.stopPropagation();
                              updateOrderStatusMutation.mutate({
                                orderId: order.id,
                                status: 'fulfilled'
                              });
                            }}
                            disabled={updateOrderStatusMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {updateOrderStatusMutation.isPending ? 'Processing...' : 'Mark Fulfilled'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
                </div>
              )}
            </>
          )}

          {/* Order Details Dialog */}
          {selectedOrder && (
            <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Order #{selectedOrder.id} Details</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold mb-2">Customer Information</h3>
                      <div className="space-y-1 text-sm">
                        <div><strong>Name:</strong> {selectedOrder.retailer ? `${selectedOrder.retailer.firstName} ${selectedOrder.retailer.lastName}` : 'Unknown'}</div>
                        <div><strong>Email:</strong> {selectedOrder.retailer?.email || 'N/A'}</div>
                        <div><strong>Phone:</strong> {selectedOrder.retailer?.phoneNumber || 'N/A'}</div>
                        <div><strong>Order Total:</strong> {formatCurrency(parseFloat(selectedOrder.total), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}</div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Order Information</h3>
                      <div className="space-y-1 text-sm">
                        <div><strong>Status:</strong> {getStatusBadge(selectedOrder.status)}</div>
                        <div><strong>Date:</strong> {new Date(selectedOrder.createdAt).toLocaleString()}</div>
                        <div><strong>Items:</strong> {selectedOrder.items.length}</div>
                      </div>
                    </div>
                  </div>

                  <Separator />
                  
                  {/* Order Timeline */}
                  <div>
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Order Timeline
                    </h3>
                    <div className="space-y-4">
                      {/* Automatic Steps */}
                      <div className="text-sm">
                        <div className="font-medium text-muted-foreground mb-2">Automatic Steps:</div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </div>
                            <div>
                              <div className="font-medium text-green-600">✅ Order Placed (Automatic)</div>
                              <div className="text-xs text-muted-foreground">When customer places order</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </div>
                            <div>
                              <div className="font-medium text-green-600">✅ Confirmed (Automatic)</div>
                              <div className="text-xs text-muted-foreground">When order is validated</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                              selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled' 
                                ? 'bg-green-100' : 'bg-gray-100'
                            }`}>
                              <CheckCircle className={`h-4 w-4 ${
                                selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled'
                                  ? 'text-green-600' : 'text-gray-400'
                              }`} />
                            </div>
                            <div>
                              <div className={`font-medium ${
                                selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled'
                                  ? 'text-green-600' : 'text-gray-400'
                              }`}>
                                {selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled' ? '✅' : '⚪'} Payment Received (Automatic)
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled' 
                                  ? 'Payment successfully processed by Stripe' 
                                  : 'When Stripe payment succeeds'
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Manual Step */}
                      <div className="text-sm">
                        <div className="font-medium text-muted-foreground mb-2">Manual Step (Wholesaler Action Required):</div>
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            selectedOrder.status === 'fulfilled' 
                              ? 'bg-green-100' : 'bg-orange-100'
                          }`}>
                            {selectedOrder.status === 'fulfilled' ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <Clock className="h-4 w-4 text-orange-600" />
                            )}
                          </div>
                          <div>
                            <div className={`font-medium ${
                              selectedOrder.status === 'fulfilled'
                                ? 'text-green-600' : 'text-orange-600'
                            }`}>
                              {selectedOrder.status === 'fulfilled' ? '✅' : '⚪'} Fulfilled (Manual)
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {selectedOrder.status === 'fulfilled' 
                                ? 'Completed manually by wholesaler' 
                                : 'Must be clicked manually by wholesaler'
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {selectedOrder.deliveryAddress && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-semibold mb-2">Delivery Address</h3>
                        <div className="text-sm p-3 bg-gray-50 rounded-lg">
                          {formatAddress(selectedOrder.deliveryAddress)}
                        </div>
                      </div>
                    </>
                  )}
                  
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Order Items</h3>
                    <div className="space-y-3">
                      {selectedOrder.items.map((item: any) => (
                        <div key={item.id} className="border rounded-lg p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium">{item.product.name}</h4>
                              <div className="text-sm text-muted-foreground">
                                Quantity: {item.quantity} | Unit Price: {formatCurrency(parseFloat(item.unitPrice), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">
                                {formatCurrency(parseFloat(item.total), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Actions */}
                  {(user?.role === 'wholesaler' || user?.role === 'team_member') && selectedOrder.status === 'paid' && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="font-semibold mb-3">Order Actions</h3>
                        <div className="flex gap-3">
                          <Button
                            onClick={() => {
                              updateOrderStatusMutation.mutate({
                                orderId: selectedOrder.id,
                                status: 'fulfilled'
                              });
                            }}
                            disabled={updateOrderStatusMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {updateOrderStatusMutation.isPending ? 'Processing...' : 'Mark as Fulfilled'}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Shipping Quote Modal */}
          {shippingModalOrder && businessAddress && (
            <ShippingQuoteModal
              isOpen={!!shippingModalOrder}
              onClose={() => setShippingModalOrder(null)}
              order={{
                id: shippingModalOrder.id,
                customerName: [shippingModalOrder.retailer?.firstName, shippingModalOrder.retailer?.lastName].filter(Boolean).join(' ') || 'Unknown Customer',
                customerEmail: shippingModalOrder.retailer?.email || '',
                deliveryAddress: shippingModalOrder.deliveryAddress || '',
                total: parseFloat(shippingModalOrder.total)
              }}
              businessAddress={businessAddress}
            />
          )}
        </TabsContent>

        {/* Shipping Settings Tab */}
        <TabsContent value="shipping-settings">
          <ShippingSettings />
        </TabsContent>

        {/* Shipping Tracking Tab */}
        <TabsContent value="shipping-tracking">
          <ShippingTracking />
        </TabsContent>

      </Tabs>
    </div>
  );
}