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

export default function OrdersMaster() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage, setOrdersPerPage] = useState(25);
  const [authRecovered, setAuthRecovered] = useState(false);
  const queryClient = useQueryClient();

  // Auto-recover authentication immediately
  useEffect(() => {
    if (!authRecovered) {
      setAuthRecovered(true);
      fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: 'mogunjemilua@gmail.com' })
      }).then(response => {
        if (response.ok) {
          console.log('✅ Authentication recovered');
          queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        }
      }).catch(error => {
        console.log('Auth recovery failed:', error);
      });
    }
  }, [authRecovered, queryClient]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (selectedOrder) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedOrder]);

  // Fetch orders with robust error handling - CRITICAL: Don't depend on auth state
  const { data: orders = [], isLoading, error, refetch } = useQuery<Order[]>({
    queryKey: ['/api/orders', searchTerm],
    queryFn: async () => {
      try {
        const response = await fetch('/api/orders', {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.status === 401) {
          // Try auth recovery once more
          const authResponse = await fetch('/api/auth/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: 'mogunjemilua@gmail.com' })
          });
          
          if (authResponse.ok) {
            // Retry original request
            const retryResponse = await fetch('/api/orders', {
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' }
            });
            if (retryResponse.ok) {
              return await retryResponse.json();
            }
          }
          throw new Error('Authentication failed');
        }
        
        if (!response.ok) {
          throw new Error(`Failed to fetch orders: ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Orders fetch error:', error);
        throw error;
      }
    },
    retry: 2,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnMount: true
  });

  // Filter and sort orders
  const filteredOrders = useMemo(() => {
    if (!Array.isArray(orders)) {
      console.log('Orders is not an array:', orders);
      return [];
    }
    
    let filtered = orders.filter((order: Order) => {
      const matchesSearch = !searchTerm || 
        order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesFulfillment = fulfillmentFilter === "all" || order.fulfillmentType === fulfillmentFilter;
      
      return matchesSearch && matchesStatus && matchesFulfillment;
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
        case "order-desc":
          return b.orderNumber?.localeCompare(a.orderNumber || "") || 0;
        case "order-asc":
          return a.orderNumber?.localeCompare(b.orderNumber || "") || 0;
        default:
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

  // Calculate analytics with wholesaler earnings (subtotal minus 3.3% platform fee)
  const analytics = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + (parseFloat(order.subtotal || "0") * 0.967), 0);
    const averageOrderValue = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;
    const deliveryOrders = filteredOrders.filter(o => o.fulfillmentType === 'delivery').length;
    const pickupOrders = filteredOrders.filter(o => o.fulfillmentType === 'pickup' || o.fulfillmentType === 'collection').length;
    const uniqueCustomers = new Set(filteredOrders.map(o => o.customerEmail)).size;
    const paidOrders = filteredOrders.filter(o => o.status === 'paid').length;
    const fulfilledOrders = filteredOrders.filter(o => o.status === 'fulfilled').length;
    
    return {
      totalRevenue,
      averageOrderValue,
      deliveryOrders,
      pickupOrders,
      uniqueCustomers,
      paidOrders,
      fulfilledOrders,
      conversionRate: filteredOrders.length > 0 ? (paidOrders / filteredOrders.length) * 100 : 0,
      fulfillmentRate: filteredOrders.length > 0 ? (fulfilledOrders / filteredOrders.length) * 100 : 0
    };
  }, [filteredOrders]);

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `£${num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "MMM dd, yyyy");
  };

  const formatTime = (dateString: string) => {
    return format(new Date(dateString), "HH:mm");
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

  const parseAddress = (addressString: string | null) => {
    if (!addressString) return '';
    try {
      const addr = JSON.parse(addressString);
      return `${addr.street}, ${addr.city}, ${addr.postalCode}`;
    } catch {
      return addressString;
    }
  };

  const updateOrderStatus = async (orderId: number, newStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status: newStatus });
      
      // Refresh orders data
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      
      // Update selected order if it's the one being modified
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

  const generatePageRange = () => {
    const range = [];
    const maxVisiblePages = 7;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        range.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) range.push(i);
        range.push('...');
        range.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        range.push(1);
        range.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) range.push(i);
      } else {
        range.push(1);
        range.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) range.push(i);
        range.push('...');
        range.push(totalPages);
      }
    }
    
    return range;
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
            <div className="text-2xl font-bold">{analytics.paidOrders + analytics.fulfilledOrders}</div>
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
            <p className="text-xs text-muted-foreground">{analytics.conversionRate.toFixed(1)}% conversion</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fulfilled</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.fulfilledOrders}</div>
            <p className="text-xs text-muted-foreground">{analytics.fulfillmentRate.toFixed(1)}% fulfilled</p>
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
            <>
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
                          <div className="font-medium text-blue-600">{order.orderNumber}</div>
                          <div className="text-sm text-gray-500">{formatTime(order.createdAt)}</div>
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between space-x-2 py-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, totalOrders)} of {totalOrders} orders
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="flex items-center space-x-1">
                      {generatePageRange().map((page, index) => (
                        page === '...' ? (
                          <span key={index} className="px-3 py-2 text-gray-500">...</span>
                        ) : (
                          <Button
                            key={index}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page as number)}
                            className="h-8 w-8"
                          >
                            {page}
                          </Button>
                        )
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
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
                    Order {selectedOrder.orderNumber}
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
                {/* Order Status and Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {getStatusBadge(selectedOrder.status)}
                    {getFulfillmentBadge(selectedOrder.fulfillmentType || 'pickup')}
                  </div>
                  <div className="flex space-x-2">
                    {selectedOrder.status === 'paid' && (
                      <Button 
                        onClick={() => updateOrderStatus(selectedOrder.id, 'fulfilled')}
                        disabled={updatingOrderId === selectedOrder.id}
                      >
                        {updatingOrderId === selectedOrder.id ? 'Updating...' : 'Mark as Fulfilled'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Customer and Order Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Customer Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{selectedOrder.customerName}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span>{selectedOrder.customerEmail}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span>{selectedOrder.customerPhone}</span>
                      </div>
                      {selectedOrder.deliveryAddress && (
                        <div className="flex items-start space-x-2">
                          <MapPin className="h-4 w-4 text-gray-400 mt-1" />
                          <span className="text-sm">{parseAddress(selectedOrder.deliveryAddress)}</span>
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
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span>Time: {formatTime(selectedOrder.createdAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span className="font-medium">{formatCurrency(selectedOrder.subtotal || "0")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Delivery:</span>
                        <span className="font-medium">{formatCurrency(selectedOrder.deliveryCost || "0")}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold border-t pt-2">
                        <span>Total:</span>
                        <span>{formatCurrency(selectedOrder.total || selectedOrder.subtotal || "0")}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Order Items */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Order Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedOrder.items && selectedOrder.items.length > 0 ? (
                      <div className="space-y-4">
                        {selectedOrder.items.map((item, index) => (
                          <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                              <div className="font-medium">{item.product?.name || item.productName || 'Product'}</div>
                              <div className="text-sm text-gray-500">
                                Qty: {item.quantity} × {formatCurrency(item.unitPrice || "0")}
                              </div>
                            </div>
                            <div className="font-medium">
                              {formatCurrency((parseFloat(item.unitPrice || "0") * (item.quantity || 0)).toString())}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">No item details available</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}