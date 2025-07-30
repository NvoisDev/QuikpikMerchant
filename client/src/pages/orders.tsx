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
  Hand,
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
    if (typeof parsed === 'object' && parsed !== null) {
      // Handle comprehensive address object with multiple possible field names
      const addressParts = [
        parsed.street || parsed.property || parsed.address1 || parsed.address,
        parsed.address2,
        parsed.town || parsed.city,
        parsed.county || parsed.state,
        parsed.postcode || parsed.postalCode || parsed.zipCode || parsed.zip,
        parsed.country
      ].filter(part => part && part.trim() !== '');
      
      if (addressParts.length > 0) {
        return addressParts.join(', ');
      }
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
  subtotal?: string; // Add subtotal field
  totalAmount?: string; // Keep for backward compatibility
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  deliveryAddress?: string;
  notes?: string;
  fulfillmentType?: string; // Add fulfillment type field
  orderNumber?: string; // Add order number field
  shippingOption?: string; // Add shipping option field
  shippingService?: string; // Add shipping service field
  shippingCost?: string; // Add shipping cost field
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
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [fulfillingOrders, setFulfillingOrders] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Update order status mutation
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      // Add order to fulfilling set
      setFulfillingOrders(prev => new Set(prev).add(orderId));
      
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
      // Remove order from fulfilling set
      setFulfillingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.orderId);
        return newSet;
      });
      
      toast({
        title: "Order Updated",
        description: `Order #${variables.orderId} has been marked as fulfilled successfully.`,
      });
      
      // Force immediate refresh of orders data
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.refetchQueries({ queryKey: ["/api/orders"] });
      
      setSelectedOrder(null); // Close the modal after successful update
    },
    onError: (error: Error, variables) => {
      // Remove order from fulfilling set on error
      setFulfillingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.orderId);
        return newSet;
      });
      
      toast({
        title: "Update Failed", 
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch orders based on user role with search functionality
  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["/api/orders", user?.role, searchTerm],
    queryFn: async () => {
      const roleParam = user?.role === 'retailer' ? 'customer' : 'wholesaler';
      const searchParam = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : '';
      const response = await fetch(`/api/orders?role=${roleParam}${searchParam}`, {
        credentials: "include",
        cache: 'no-cache', // Force no caching
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (!response.ok) throw new Error("Failed to fetch orders");
      const ordersData = await response.json();
      console.log('📦 Orders fetched:', ordersData.length, 'orders loaded successfully');
      return ordersData;
    },
    enabled: !!user,
    staleTime: 0, // Always fetch fresh data
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes but refetch on component mount
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
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

  // Pagination logic
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm]);

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
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit px-2 py-1">
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
        <div className="flex flex-col items-center space-y-4">
          {/* Enhanced Loading Animation */}
          <div className="flex space-x-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-8 bg-gradient-to-t from-green-400 to-emerald-600 rounded-full animate-pulse"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '1.2s'
                }}
              />
            ))}
          </div>
          <p className="text-sm font-medium text-gray-600 text-center">Loading your orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold">
              {user?.role === 'retailer' ? 'My Orders' : 'Order Management & Shipping'}
            </h1>
            <ContextualHelpBubble
              topic="order management"
              title="Managing Customer Orders"
              steps={helpContent.orders.steps}
              position="right"
            />
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">
            {user?.role === 'retailer' 
              ? 'Track your orders and delivery status'
              : 'Manage orders, shipping settings, and track deliveries'
            }
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="flex-1 sm:flex-none">
            <RefreshCw className="h-4 w-4 mr-2" />
            <span className="hidden xs:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden xs:inline">Export</span>
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
                    className={`${viewMode === "cards" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"} flex items-center gap-2 min-w-[80px]`}
                  >
                    <Grid className="h-4 w-4" />
                    <span className="font-medium">Grid</span>
                  </Button>
                  <Button
                    variant={viewMode === "table" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("table")}
                    className={`${viewMode === "table" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"} flex items-center gap-2 min-w-[80px]`}
                  >
                    <List className="h-4 w-4" />
                    <span className="font-medium">List</span>
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
                            <th className="text-left p-4 font-medium text-gray-900">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedOrders.map((order: any) => (
                            <tr 
                              key={order.id} 
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => setSelectedOrder(order)}
                            >
                              <td className="p-4">
                                <div>
                                  <div className="font-semibold text-gray-900">{order.orderNumber || `#${order.id}`}</div>
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
                              </td>
                              <td className="p-4">
                                <div>
                                  <div className="font-semibold text-gray-900">
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
                                <div className="font-semibold text-gray-900">
                                  {formatCurrency(parseFloat(order.subtotal || order.total), order.wholesaler?.preferredCurrency || 'GBP')}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                  <span className="text-sm font-medium text-gray-700">Paid</span>
                                </div>
                              </td>
                              <td className="p-4">
                                {order.status === 'fulfilled' ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                    <span className="text-sm font-medium text-gray-700">Fulfilled</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                    <span className="text-sm font-medium text-gray-700">Unfulfilled</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-4">
                                <span className="text-sm font-medium text-gray-700">{order.items?.length || 1} item{(order.items?.length || 1) !== 1 ? 's' : ''}</span>
                              </td>
                              <td className="p-4">
                                <div className="text-sm">
                                  {order.fulfillmentType === 'delivery' ? (
                                    <div className="flex items-center gap-1">
                                      <Truck className="h-3 w-3 text-blue-600" />
                                      <span className="font-medium text-gray-700">Delivery</span>
                                    </div>
                                  ) : order.fulfillmentType === 'collection' || order.fulfillmentType === 'pickup' ? (
                                    <div className="flex items-center gap-1">
                                      <Hand className="h-3 w-3 text-green-600" />
                                      <span className="font-medium text-gray-700">Pick up</span>
                                    </div>
                                  ) : (
                                    <span className="font-medium text-gray-500">Not specified</span>
                                  )}
                                  {order.shippingOrderId && (
                                    <div className="text-xs text-gray-500 mt-1">Tracking added</div>
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
                                      disabled={fulfillingOrders.has(order.id)}
                                      className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                      {fulfillingOrders.has(order.id) ? 'Processing...' : 'Fulfill'}
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
                  {paginatedOrders.map((order: any) => (
                <Card key={order.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="font-semibold text-lg">{order.orderNumber || `Order #${order.id}`}</h3>
                          {getStatusBadge(order.status)}
                          
                          {/* Fulfillment Type Tags */}
                          {order.fulfillmentType === 'delivery' && (
                            <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
                              <Truck className="h-3 w-3" />
                              Delivery
                            </Badge>
                          )}
                          {(order.fulfillmentType === 'collection' || order.fulfillmentType === 'pickup') && (
                            <Badge variant="secondary" className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
                              <Hand className="h-3 w-3" />
                              Collection
                            </Badge>
                          )}
                          
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
                              {formatCurrency(parseFloat(order.subtotal || order.total), order.wholesaler?.preferredCurrency || 'GBP')}
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
                            disabled={fulfillingOrders.has(order.id)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {fulfillingOrders.has(order.id) ? 'Processing...' : 'Mark Fulfilled'}
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

          {/* Pagination Controls */}
          {filteredOrders.length > 0 && totalPages > 1 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-600">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length} orders
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    
                    {/* Page numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className="w-8 h-8 p-0 font-medium"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                      
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <>
                          <span className="text-sm font-medium text-gray-500">...</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            className="w-8 h-8 p-0 font-medium"
                          >
                            {totalPages}
                          </Button>
                        </>
                      )}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order Details Dialog */}
          {selectedOrder && (
            <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{selectedOrder.orderNumber || `Order #${selectedOrder.id}`} Details</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold mb-2">Customer Information</h3>
                      <div className="space-y-1 text-sm">
                        <div><strong>Name:</strong> {selectedOrder.retailer ? `${selectedOrder.retailer.firstName} ${selectedOrder.retailer.lastName}` : 'Unknown'}</div>
                        <div><strong>Email:</strong> {selectedOrder.retailer?.email || 'N/A'}</div>
                        <div><strong>Phone:</strong> {selectedOrder.retailer?.phoneNumber || 'N/A'}</div>
                        <div><strong>Order Total:</strong> {formatCurrency(parseFloat(selectedOrder.subtotal || selectedOrder.total), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}</div>
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
                  
                  {/* Order Items */}
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
                    
                    {/* Fulfillment Information moved under Order Items */}
                    {selectedOrder.fulfillmentType === 'delivery' && selectedOrder.deliveryAddress && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Delivery Address
                        </h4>
                        <p className="text-sm text-blue-800">{formatAddress(selectedOrder.deliveryAddress)}</p>
                      </div>
                    )}
                    {(selectedOrder.fulfillmentType === 'collection' || selectedOrder.fulfillmentType === 'pickup') && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                          <Hand className="h-4 w-4" />
                          Collection Information
                        </h4>
                        <p className="text-sm text-green-800">This order is available for collection from your business location.</p>
                      </div>
                    )}
                  </div>

                  <Separator />
                  
                  {/* Enhanced Order Timeline */}
                  <div>
                    <h3 className="font-semibold mb-6 flex items-center gap-2 text-lg">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-blue-600" />
                      </div>
                      Order Progress
                    </h3>
                    
                    {/* Progress Bar */}
                    <div className="mb-8">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-gray-700">Order Status</span>
                        <span className="text-sm text-gray-500">
                          {selectedOrder.status === 'fulfilled' ? '4/4 Complete' : 
                           selectedOrder.status === 'paid' ? '3/4 Complete' :
                           selectedOrder.status === 'confirmed' ? '2/4 Complete' : '1/4 Complete'}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500 ease-out"
                          style={{ 
                            width: selectedOrder.status === 'fulfilled' ? '100%' : 
                                   selectedOrder.status === 'paid' ? '75%' :
                                   selectedOrder.status === 'confirmed' ? '50%' : '25%'
                          }}
                        />
                      </div>
                    </div>

                    {/* Timeline Steps */}
                    <div className="relative">
                      {/* Vertical Line */}
                      <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200" />
                      
                      <div className="space-y-8">
                        {/* Step 1: Order Placed */}
                        <div className="relative flex items-start">
                          <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
                            <CheckCircle className="h-6 w-6 text-white" />
                          </div>
                          <div className="ml-6 flex-1">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-semibold text-green-700 text-base">Order Placed</h4>
                                  <p className="text-sm text-gray-600 mt-1">Customer successfully placed order</p>
                                </div>
                                <div className="text-right">
                                  <div className="inline-flex items-center px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5" />
                                    Automatic
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {new Date(selectedOrder.createdAt).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Step 2: Order Confirmed */}
                        <div className="relative flex items-start">
                          <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
                            <CheckCircle className="h-6 w-6 text-white" />
                          </div>
                          <div className="ml-6 flex-1">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-semibold text-green-700 text-base">Order Confirmed</h4>
                                  <p className="text-sm text-gray-600 mt-1">Order validated and confirmed in system</p>
                                </div>
                                <div className="text-right">
                                  <div className="inline-flex items-center px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5" />
                                    Automatic
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {new Date(selectedOrder.createdAt).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Step 3: Payment Received */}
                        <div className="relative flex items-start">
                          <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center shadow-lg ${
                            selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled'
                              ? 'bg-gradient-to-br from-green-400 to-green-600'
                              : 'bg-gradient-to-br from-gray-300 to-gray-400'
                          }`}>
                            {selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled' ? (
                              <CheckCircle className="h-6 w-6 text-white" />
                            ) : (
                              <Clock className="h-6 w-6 text-white" />
                            )}
                          </div>
                          <div className="ml-6 flex-1">
                            <div className={`bg-white rounded-xl p-4 shadow-sm border ${
                              selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled'
                                ? 'border-green-100'
                                : 'border-gray-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className={`font-semibold text-base ${
                                    selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled'
                                      ? 'text-green-700'
                                      : 'text-gray-600'
                                  }`}>
                                    Payment Received
                                  </h4>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled' 
                                      ? 'Payment processed successfully via Stripe' 
                                      : 'Waiting for payment processing'
                                    }
                                  </p>
                                </div>
                                <div className="text-right">
                                  <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                                    selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                      selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled'
                                        ? 'bg-green-500'
                                        : 'bg-gray-400'
                                    }`} />
                                    Automatic
                                  </div>
                                  {(selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled') && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {new Date(selectedOrder.updatedAt).toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Step 4: Order Fulfilled */}
                        <div className="relative flex items-start">
                          <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center shadow-lg ${
                            selectedOrder.status === 'fulfilled'
                              ? 'bg-gradient-to-br from-green-400 to-green-600'
                              : selectedOrder.status === 'paid'
                                ? 'bg-gradient-to-br from-orange-400 to-orange-600'
                                : 'bg-gradient-to-br from-gray-300 to-gray-400'
                          }`}>
                            {selectedOrder.status === 'fulfilled' ? (
                              <CheckCircle className="h-6 w-6 text-white" />
                            ) : selectedOrder.status === 'paid' ? (
                              <Clock className="h-6 w-6 text-white" />
                            ) : (
                              <Clock className="h-6 w-6 text-white opacity-50" />
                            )}
                          </div>
                          <div className="ml-6 flex-1">
                            <div className={`bg-white rounded-xl p-4 shadow-sm border ${
                              selectedOrder.status === 'fulfilled'
                                ? 'border-green-100'
                                : selectedOrder.status === 'paid'
                                  ? 'border-orange-100'
                                  : 'border-gray-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <h4 className={`font-semibold text-base ${
                                    selectedOrder.status === 'fulfilled'
                                      ? 'text-green-700'
                                      : selectedOrder.status === 'paid'
                                        ? 'text-orange-700'
                                        : 'text-gray-600'
                                  }`}>
                                    Order Fulfilled
                                  </h4>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {selectedOrder.status === 'fulfilled' 
                                      ? 'Order completed and fulfilled by wholesaler' 
                                      : selectedOrder.status === 'paid'
                                        ? 'Ready for fulfillment - action required'
                                        : 'Pending payment completion'
                                    }
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                                      selectedOrder.status === 'fulfilled'
                                        ? 'bg-green-100 text-green-800'
                                        : selectedOrder.status === 'paid'
                                          ? 'bg-orange-100 text-orange-800'
                                          : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                        selectedOrder.status === 'fulfilled'
                                          ? 'bg-green-500'
                                          : selectedOrder.status === 'paid'
                                            ? 'bg-orange-500'
                                            : 'bg-gray-400'
                                      }`} />
                                      Manual
                                    </div>
                                    {selectedOrder.status === 'fulfilled' && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {new Date(selectedOrder.updatedAt).toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Enhanced Fulfill Button */}
                                  {(user?.role === 'wholesaler' || user?.role === 'team_member') && selectedOrder.status === 'paid' && (
                                    <Button
                                      onClick={() => {
                                        updateOrderStatusMutation.mutate({
                                          orderId: selectedOrder.id,
                                          status: 'fulfilled'
                                        });
                                      }}
                                      disabled={fulfillingOrders.has(selectedOrder.id)}
                                      className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-6 py-2"
                                    >
                                      {fulfillingOrders.has(selectedOrder.id) ? (
                                        <>
                                          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                          Processing...
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle className="h-4 w-4 mr-2" />
                                          Mark as Fulfilled
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
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
                        <h3 className="font-semibold mb-2 flex items-center">
                          <Hand className="h-4 w-4 mr-2" />
                          Collection Information
                        </h3>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                            {selectedOrder.fulfillmentType === 'pickup' || selectedOrder.shippingOption === 'pickup' ? (
                              <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1 rounded-full text-sm font-medium">
                                <Hand className="h-4 w-4" />
                                Pickup
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm font-medium">
                                <Truck className="h-4 w-4" />
                                Collection
                              </div>
                            )}
                          </div>
                          <div className="p-3 bg-gray-50 rounded-lg">
                            <h4 className="font-medium text-sm text-gray-700 mb-1">Collection Address:</h4>
                            <p className="text-sm">{formatAddress(selectedOrder.deliveryAddress)}</p>
                          </div>
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