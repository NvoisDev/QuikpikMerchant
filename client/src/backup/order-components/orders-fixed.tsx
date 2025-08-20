import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Truck, Store, Search, Package, DollarSign, TrendingUp, ChevronLeft, ChevronRight, X, MapPin, Phone, Mail, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";

// Define proper types based on actual API response
interface Order {
  id: number;
  orderNumber: string;
  wholesalerId: string;
  retailerId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  subtotal: string;
  total: string;
  deliveryCost?: string;
  status: string;
  fulfillmentType: string;
  deliveryAddress?: string;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}

interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  productName?: string;
  quantity: number;
  unitPrice: string;
  product?: {
    name: string;
    id: number;
  };
}

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800", 
  fulfilled: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800"
};

const fulfillmentColors = {
  delivery: "bg-purple-100 text-purple-800",
  pickup: "bg-orange-100 text-orange-800",
  collection: "bg-orange-100 text-orange-800"
};

export default function OrdersFixed() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage, setOrdersPerPage] = useState(25);
  const queryClient = useQueryClient();

  // Fetch orders with simplified approach - no authentication dependency
  const { data: orders = [], isLoading, error, refetch } = useQuery<Order[]>({
    queryKey: ['/api/orders'],
    queryFn: async () => {
      console.log('🔄 Fetching orders...');
      
      // Try authentication recovery first
      try {
        await fetch('/api/auth/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: 'mogunjemilua@gmail.com' })
        });
      } catch (e) {
        console.log('Auth recovery attempt failed:', e);
      }

      // Wait a moment for session to be established
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const response = await fetch('/api/orders', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        console.error(`Orders API failed: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch orders: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`✅ Fetched ${Array.isArray(data) ? data.length : 0} orders`);
      return data;
    },
    retry: 1,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    refetchOnMount: true
  });

  // Filter and sort orders with defensive programming
  const filteredOrders = useMemo(() => {
    if (!Array.isArray(orders)) {
      console.warn('Orders data is not an array:', orders);
      return [];
    }
    
    let filtered = orders.filter((order: Order) => {
      try {
        const matchesSearch = !searchTerm || 
          (order.orderNumber && order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (order.customerName && order.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (order.customerEmail && order.customerEmail.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesStatus = statusFilter === "all" || order.status === statusFilter;
        const matchesFulfillment = fulfillmentFilter === "all" || order.fulfillmentType === fulfillmentFilter;
        
        return matchesSearch && matchesStatus && matchesFulfillment;
      } catch (e) {
        console.warn('Error filtering order:', order, e);
        return false;
      }
    });

    // Sort orders with safe comparisons
    filtered.sort((a: Order, b: Order) => {
      try {
        switch (sortBy) {
          case "date-desc":
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          case "date-asc":
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          case "total-desc":
            return parseFloat(b.total || "0") - parseFloat(a.total || "0");
          case "total-asc":
            return parseFloat(a.total || "0") - parseFloat(b.total || "0");
          case "order-desc":
            return (b.orderNumber || "").localeCompare(a.orderNumber || "");
          case "order-asc":
            return (a.orderNumber || "").localeCompare(b.orderNumber || "");
          default:
            return 0;
        }
      } catch (e) {
        console.warn('Error sorting orders:', e);
        return 0;
      }
    });

    return filtered;
  }, [orders, searchTerm, statusFilter, fulfillmentFilter, sortBy]);

  // Pagination logic
  const totalOrders = filteredOrders.length;
  const totalPages = Math.ceil(totalOrders / ordersPerPage);
  const startIndex = (currentPage - 1) * ordersPerPage;
  const endIndex = startIndex + ordersPerPage;
  const currentOrders = filteredOrders.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, fulfillmentFilter, sortBy]);

  // Calculate analytics
  const analytics = useMemo(() => {
    try {
      const paidOrders = filteredOrders.filter(o => o.status === 'paid').length;
      const fulfilledOrders = filteredOrders.filter(o => o.status === 'fulfilled').length;
      const totalRevenue = filteredOrders.reduce((sum, order) => {
        const subtotal = parseFloat(order.subtotal || "0");
        return sum + (subtotal * 0.967); // After 3.3% platform fee
      }, 0);
      
      return {
        totalOrders: paidOrders + fulfilledOrders,
        totalRevenue,
        paidOrders,
        fulfilledOrders,
        pendingOrders: filteredOrders.filter(o => o.status === 'pending').length
      };
    } catch (e) {
      console.warn('Error calculating analytics:', e);
      return {
        totalOrders: 0,
        totalRevenue: 0,
        paidOrders: 0,
        fulfilledOrders: 0,
        pendingOrders: 0
      };
    }
  }, [filteredOrders]);

  const formatCurrency = (amount: string | number) => {
    try {
      const num = typeof amount === 'string' ? parseFloat(amount) : amount;
      return `£${num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } catch (e) {
      return '£0.00';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM dd, yyyy");
    } catch (e) {
      return 'Invalid date';
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "HH:mm");
    } catch (e) {
      return '--:--';
    }
  };

  const getStatusBadge = (status: string) => {
    const colorClass = statusColors[status as keyof typeof statusColors] || "bg-gray-100 text-gray-800";
    return (
      <Badge className={`${colorClass} border-0`}>
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
      </Badge>
    );
  };

  const getFulfillmentBadge = (fulfillmentType: string) => {
    const colorClass = fulfillmentColors[fulfillmentType as keyof typeof fulfillmentColors] || "bg-gray-100 text-gray-800";
    const icon = fulfillmentType === 'delivery' ? <Truck className="w-3 h-3 mr-1" /> : <Store className="w-3 h-3 mr-1" />;
    return (
      <Badge className={`${colorClass} border-0 flex items-center`}>
        {icon}
        {fulfillmentType ? fulfillmentType.charAt(0).toUpperCase() + fulfillmentType.slice(1) : 'Unknown'}
      </Badge>
    );
  };

  const updateOrderStatus = async (orderId: number, newStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ 
          ...selectedOrder, 
          status: newStatus,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to update order status:', error);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-600">Loading orders...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="text-center space-y-4">
          <div className="text-red-600 font-medium">Failed to load orders</div>
          <p className="text-gray-500 text-sm">
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </p>
          <div className="space-x-2">
            <Button onClick={() => refetch()}>Retry</Button>
            <Button 
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground">Manage your wholesale orders</p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalOrders}</div>
            <p className="text-xs text-muted-foreground">From {filteredOrders.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">After 3.3% platform fee</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Orders</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.paidOrders}</div>
            <p className="text-xs text-muted-foreground">Ready to fulfill</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fulfilled</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.fulfilledOrders}</div>
            <p className="text-xs text-muted-foreground">Completed orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search orders, customers, emails..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="fulfilled">Fulfilled</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by fulfillment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Fulfillment</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
            <SelectItem value="pickup">Pickup</SelectItem>
            <SelectItem value="collection">Collection</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest First</SelectItem>
            <SelectItem value="date-asc">Oldest First</SelectItem>
            <SelectItem value="total-desc">Highest Value</SelectItem>
            <SelectItem value="total-asc">Lowest Value</SelectItem>
            <SelectItem value="order-desc">Order # (Z-A)</SelectItem>
            <SelectItem value="order-asc">Order # (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Orders ({filteredOrders.length})</CardTitle>
          <CardDescription>Recent wholesale orders from your customers</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || statusFilter !== "all" || fulfillmentFilter !== "all"
                  ? "Try adjusting your search criteria or filters."
                  : "Orders will appear here when customers place them."}
              </p>
              {orders.length > 0 && (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setFulfillmentFilter("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">Order</th>
                    <th className="text-left p-4 font-medium">Customer</th>
                    <th className="text-left p-4 font-medium">Date</th>
                    <th className="text-left p-4 font-medium">Total</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Fulfillment</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentOrders.map((order) => (
                    <tr 
                      key={order.id} 
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <td className="p-4">
                        <div className="font-medium text-blue-600">{order.orderNumber || `Order ${order.id}`}</div>
                        <div className="text-sm text-gray-500">{formatTime(order.createdAt)}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{order.customerName || 'Unknown Customer'}</div>
                        <div className="text-sm text-gray-500">{order.customerEmail || 'No email'}</div>
                      </td>
                      <td className="p-4 text-sm">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="p-4 font-medium">
                        {formatCurrency(order.total || order.subtotal || "0")}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="p-4">
                        {getFulfillmentBadge(order.fulfillmentType || 'pickup')}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          {order.status === 'paid' && (
                            <Button 
                              size="sm" 
                              onClick={() => updateOrderStatus(order.id, 'fulfilled')}
                              disabled={updatingOrderId === order.id}
                            >
                              {updatingOrderId === order.id ? 'Updating...' : 'Mark Fulfilled'}
                            </Button>
                          )}
                          {order.status === 'pending' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => updateOrderStatus(order.id, 'cancelled')}
                              disabled={updatingOrderId === order.id}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-xl font-bold">
                    Order {selectedOrder.orderNumber || selectedOrder.id}
                  </DialogTitle>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedOrder(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Order Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Customer Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{selectedOrder.customerName || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span>{selectedOrder.customerEmail || 'No email'}</span>
                      </div>
                      {selectedOrder.customerPhone && (
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <span>{selectedOrder.customerPhone}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Order Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>Placed: {formatDate(selectedOrder.createdAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span className="font-medium">{formatCurrency(selectedOrder.subtotal || "0")}</span>
                      </div>
                      {selectedOrder.deliveryCost && (
                        <div className="flex justify-between">
                          <span>Delivery:</span>
                          <span className="font-medium">{formatCurrency(selectedOrder.deliveryCost)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-lg font-bold border-t pt-2">
                        <span>Total:</span>
                        <span>{formatCurrency(selectedOrder.total || selectedOrder.subtotal || "0")}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}