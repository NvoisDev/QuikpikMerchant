import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Store, Search, Package, DollarSign, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import type { Order } from "@shared/schema";

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

export default function OrdersClean() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");
  const queryClient = useQueryClient();

  // Fetch orders only when authenticated
  const { data: orders = [], isLoading, error, refetch } = useQuery<Order[]>({
    queryKey: ['/api/orders'],
    enabled: isAuthenticated,
    retry: 2,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

  // Filter and sort orders
  const filteredOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    
    let filtered = orders.filter((order: Order) => {
      const matchesSearch = !searchTerm || 
        order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });

    // Sort orders
    filtered.sort((a: Order, b: Order) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "date-asc":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "total-desc":
          return parseFloat(b.total || "0") - parseFloat(a.total || "0");
        case "total-asc":
          return parseFloat(a.total || "0") - parseFloat(b.total || "0");
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [orders, searchTerm, statusFilter, sortBy]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + parseFloat(order.subtotal || "0"), 0);
    const paidOrders = filteredOrders.filter(o => o.status === 'paid').length;
    const fulfilledOrders = filteredOrders.filter(o => o.status === 'fulfilled').length;
    
    return {
      totalOrders: filteredOrders.length,
      totalRevenue,
      paidOrders,
      fulfilledOrders
    };
  }, [filteredOrders]);

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `£${num.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "MMM dd, yyyy");
  };

  const getStatusBadge = (status: string) => {
    const colorClass = statusColors[status as keyof typeof statusColors] || "bg-gray-100 text-gray-800";
    return (
      <Badge className={`${colorClass} border-0`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getFulfillmentBadge = (fulfillmentType: string) => {
    const colorClass = fulfillmentColors[fulfillmentType as keyof typeof fulfillmentColors] || "bg-gray-100 text-gray-800";
    const icon = fulfillmentType === 'delivery' ? <Truck className="w-3 h-3 mr-1" /> : <Store className="w-3 h-3 mr-1" />;
    return (
      <Badge className={`${colorClass} border-0 flex items-center`}>
        {icon}
        {fulfillmentType.charAt(0).toUpperCase() + fulfillmentType.slice(1)}
      </Badge>
    );
  };

  const updateOrderStatus = async (orderId: number, newStatus: string) => {
    try {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    } catch (error) {
      console.error('Failed to update order status:', error);
    }
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Authentication required
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 font-medium">Authentication Required</div>
          <p className="text-gray-500 text-sm">Please log in to access orders.</p>
          <Button onClick={() => window.location.href = '/login'}>
            Go to Login
          </Button>
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
          <Button onClick={() => refetch()}>Retry</Button>
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
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Orders</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paidOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fulfilled</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.fulfilledOrders}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search orders..."
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
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest First</SelectItem>
            <SelectItem value="date-asc">Oldest First</SelectItem>
            <SelectItem value="total-desc">Highest Value</SelectItem>
            <SelectItem value="total-asc">Lowest Value</SelectItem>
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
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full"></div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders found matching your criteria
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
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <div className="font-medium">{order.orderNumber}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{order.customerName}</div>
                        <div className="text-sm text-gray-500">{order.customerEmail}</div>
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
                        <div className="flex gap-2">
                          {order.status === 'paid' && (
                            <Button 
                              size="sm" 
                              onClick={() => updateOrderStatus(order.id, 'fulfilled')}
                            >
                              Mark Fulfilled
                            </Button>
                          )}
                          {order.status === 'pending' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => updateOrderStatus(order.id, 'cancelled')}
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
    </div>
  );
}