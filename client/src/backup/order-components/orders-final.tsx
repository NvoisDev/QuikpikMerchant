import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Eye, Package, Phone, Mail, Truck, Store, TrendingUp, Users, DollarSign, MapPin, CheckCircle2, XCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { format } from "date-fns";

interface OrderItem {
  id: number;
  quantity: number;
  unitPrice: string;
  total: string;
  product: {
    id: number;
    name: string;
    imageUrl?: string;
  };
}

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  total: string;
  subtotal: string;
  platformFee: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  fulfillmentType: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  itemCount: number;
}

const statusColors = {
  paid: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800", 
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-teal-100 text-teal-800",
  cancelled: "bg-red-100 text-red-800"
};

const fulfillmentColors = {
  delivery: "bg-blue-100 text-blue-800",
  pickup: "bg-orange-100 text-orange-800",
  collection: "bg-orange-100 text-orange-800"
};

export default function OrdersFinal() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage, setOrdersPerPage] = useState(25);
  const queryClient = useQueryClient();

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (selectedOrder) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedOrder]);

  const { data: orders = [], isLoading, error } = useQuery<Order[]>({
    queryKey: ['/api/orders', searchTerm],
    enabled: isAuthenticated, // Only fetch when authenticated
    retry: 1,
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });

  // Filter and sort orders
  const filteredOrders = useMemo(() => {
    let filtered = (orders as Order[]).filter((order: Order) => {
      const matchesSearch = !searchTerm || 
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerEmail.toLowerCase().includes(searchTerm.toLowerCase());
      
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
          return parseFloat(b.total) - parseFloat(a.total);
        case "total-asc":
          return parseFloat(a.total) - parseFloat(b.total);
        case "order-desc":
          return b.orderNumber.localeCompare(a.orderNumber);
        case "order-asc":
          return a.orderNumber.localeCompare(b.orderNumber);
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

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getPaginationRange = () => {
    const range = [];
    const maxVisiblePages = 5;
    
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

  const formatCurrency = (amount: string) => {
    return `£${parseFloat(amount).toFixed(2)}`;
  };

  // Handle authentication loading
  if (authLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-600">Authenticating...</p>
          </div>
        </div>
      </div>
    );
  }

  // Handle authentication required
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 font-medium">Authentication Required</div>
          <p className="text-gray-500 text-sm">
            Please log in to access your orders dashboard.
          </p>
          <div className="space-x-2">
            <Button onClick={() => window.location.href = '/login'}>
              Go to Login
            </Button>
            <Button 
              variant="outline"
              onClick={async () => {
                try {
                  const response = await fetch('/api/auth/recover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'mogunjemilua@gmail.com' })
                  });
                  if (response.ok) {
                    window.location.reload();
                  }
                } catch (error) {
                  console.error('Auth recovery failed:', error);
                  window.location.reload();
                }
              }}
            >
              Quick Auth Fix
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    console.error('Orders fetch error:', error);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 font-medium">Failed to load orders</div>
          <p className="text-gray-500 text-sm">
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </p>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

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

  // Calculate analytics - using wholesaler earnings (subtotal minus 3.3% platform fee)
  const analytics = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + (parseFloat(order.subtotal) * 0.967), 0);
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
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/status`, { 
        status: newStatus
      });

      
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
      alert("Failed to update order status. Please try again.");
    } finally {
      setUpdatingOrderId(null);
    }
  };



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

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200">
          <CardContent className="py-8">
            <div className="text-center text-red-600">
              <h3 className="font-semibold">Error loading orders</h3>
              <p>{String(error)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <p className="text-gray-600">
          View and manage your orders ({filteredOrders.length} of {orders.length} orders)
        </p>
      </div>

      {/* Analytics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(analytics.totalRevenue.toString())}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Average Order</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(analytics.averageOrderValue.toString())}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Unique Customers</p>
                <p className="text-2xl font-bold text-purple-600">{analytics.uniqueCustomers}</p>
              </div>
              <Users className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Fulfillment Rate</p>
                <p className="text-2xl font-bold text-teal-600">{analytics.fulfillmentRate.toFixed(1)}%</p>
              </div>
              <Package className="w-8 h-8 text-teal-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fulfillment Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Fulfillment Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-500" />
                  <span>Delivery Orders</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{analytics.deliveryOrders}</span>
                  <Badge className="bg-blue-100 text-blue-800">
                    {filteredOrders.length > 0 ? Math.round((analytics.deliveryOrders / filteredOrders.length) * 100) : 0}%
                  </Badge>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-orange-500" />
                  <span>Pickup Orders</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{analytics.pickupOrders}</span>
                  <Badge className="bg-orange-100 text-orange-800">
                    {filteredOrders.length > 0 ? Math.round((analytics.pickupOrders / filteredOrders.length) * 100) : 0}%
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" size="sm">
                <Package className="w-4 h-4 mr-2" />
                Export Orders
              </Button>
              <Button variant="outline" className="w-full justify-start" size="sm">
                <Mail className="w-4 h-4 mr-2" />
                Send Customer Updates
              </Button>
              <Button variant="outline" className="w-full justify-start" size="sm">
                <TrendingUp className="w-4 h-4 mr-2" />
                View Analytics
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by order number, customer name, or email..."
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
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="fulfilled">Fulfilled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by fulfillment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
                <SelectItem value="pickup">Pickup</SelectItem>
                <SelectItem value="collection">Collection</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Date (Newest)</SelectItem>
                <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                <SelectItem value="total-desc">Total (Highest)</SelectItem>
                <SelectItem value="total-asc">Total (Lowest)</SelectItem>
                <SelectItem value="order-desc">Order # (Z-A)</SelectItem>
                <SelectItem value="order-asc">Order # (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Orders List
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Showing {startIndex + 1}-{Math.min(endIndex, totalOrders)} of {totalOrders} orders
              </div>
              <Select value={ordersPerPage.toString()} onValueChange={(value) => {
                setOrdersPerPage(parseInt(value));
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No orders found matching your criteria</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status & Type</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Date & Location</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentOrders.map((order: Order) => (
                    <TableRow key={order.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.orderNumber}</div>
                          <div className="text-sm text-gray-500">ID: {order.id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.customerName}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {order.customerEmail}
                          </div>
                          {order.customerPhone && (
                            <div className="text-sm text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {order.customerPhone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {getStatusBadge(order.status)}
                          {getFulfillmentBadge(order.fulfillmentType)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {order.itemCount} item{order.itemCount !== 1 ? 's' : ''}
                        </div>
                        {order.items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="text-xs text-gray-500">
                            {item.quantity}x {item.product.name}
                          </div>
                        ))}
                        {order.itemCount > 2 && (
                          <div className="text-xs text-gray-500">
                            +{order.itemCount - 2} more...
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{formatCurrency((parseFloat(order.subtotal) * 0.967).toFixed(2))}</div>
                        <div className="text-sm text-gray-500">
                          Subtotal: {formatCurrency(order.subtotal)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{formatDate(order.createdAt)}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {order.deliveryAddress ? parseAddress(order.deliveryAddress).split(',')[1]?.trim() || 'Unknown' : 'No address'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedOrder(order)}
                            className="flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </Button>
                          {order.status !== 'fulfilled' && (
                            <Button 
                              size="sm"
                              onClick={() => updateOrderStatus(order.id, 'fulfilled')}
                              disabled={updatingOrderId === order.id}
                              className="bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1 text-xs"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Mark Fulfilled
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(1)}
                      disabled={currentPage === 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    {getPaginationRange().map((page, index) => (
                      page === '...' ? (
                        <span key={`ellipsis-${index}`} className="px-2 text-gray-400">
                          ...
                        </span>
                      ) : (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(page as number)}
                          className="h-8 w-8 p-0"
                        >
                          {page}
                        </Button>
                      )
                    ))}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(totalPages)}
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    {totalOrders} total orders
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedOrder(null);
            }
          }}
        >
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Order {selectedOrder.orderNumber}</CardTitle>
                  <CardDescription>Order ID: {selectedOrder.id}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {selectedOrder.status !== 'fulfilled' && (
                    <Button 
                      size="sm"
                      onClick={() => updateOrderStatus(selectedOrder.id, 'fulfilled')}
                      disabled={updatingOrderId === selectedOrder.id}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Mark Fulfilled
                    </Button>
                  )}
                  {selectedOrder.status === 'fulfilled' && (
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => updateOrderStatus(selectedOrder.id, 'delivered')}
                      disabled={updatingOrderId === selectedOrder.id}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Mark Unfulfilled
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedOrder(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Order Status */}
              <div>
                <h3 className="font-semibold mb-2">Status & Fulfillment</h3>
                <div className="flex gap-2">
                  {getStatusBadge(selectedOrder.status)}
                  {getFulfillmentBadge(selectedOrder.fulfillmentType)}
                </div>
              </div>

              {/* Customer Info */}
              <div>
                <h3 className="font-medium mb-1 text-sm">Customer Information</h3>
                <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                  <div className="text-xs"><strong>Name:</strong> {selectedOrder.customerName}</div>
                  <div className="text-xs"><strong>Email:</strong> {selectedOrder.customerEmail}</div>
                  <div className="text-xs"><strong>Phone:</strong> {selectedOrder.customerPhone}</div>
                  <div className="text-xs"><strong>Address:</strong> {parseAddress(selectedOrder.deliveryAddress)}</div>
                </div>
              </div>

              {/* Order Items - Show ALL items without truncation */}
              <div>
                <h3 className="font-medium mb-1 text-sm">Items ({selectedOrder.items.length})</h3>
                <div className="space-y-2">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-xs">{item.product.name}</div>
                        <div className="text-xs text-gray-600">
                          Quantity: {item.quantity} × {formatCurrency(item.unitPrice)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-xs">{formatCurrency(item.total)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary - Correct calculation: subtotal - platform fee = total */}
              <div>
                <h3 className="font-medium mb-1 text-sm">Order Summary</h3>
                <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(selectedOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Platform Fee (3.3%):</span>
                    <span>-{formatCurrency((parseFloat(selectedOrder.subtotal) * 0.033).toFixed(2))}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1 text-sm">
                    <span>Total (Your Earnings):</span>
                    <span>{formatCurrency((parseFloat(selectedOrder.subtotal) * 0.967).toFixed(2))}</span>
                  </div>
                </div>
              </div>

              {/* Order Timeline - Platform-specific events */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Order Timeline</h3>
                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  <div className="flex items-center space-x-2 text-xs">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">{format(new Date(selectedOrder.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                    <span className="font-medium">Payment received from customer</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">{format(new Date(selectedOrder.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                    <span className="font-medium">Order notification sent to you</span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">{format(new Date(selectedOrder.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                    <span className="font-medium">Customer confirmation email sent</span>
                  </div>
                  {selectedOrder.status === 'confirmed' || selectedOrder.status === 'processing' || selectedOrder.status === 'fulfilled' ? (
                    <div className="flex items-center space-x-2 text-xs">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600">{format(new Date(selectedOrder.updatedAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                      <span className="font-medium">Order confirmed by you</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-xs">
                      <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                      <span className="text-gray-400">Awaiting your confirmation</span>
                    </div>
                  )}
                  {selectedOrder.status === 'processing' || selectedOrder.status === 'fulfilled' ? (
                    <div className="flex items-center space-x-2 text-xs">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600">{format(new Date(selectedOrder.updatedAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                      <span className="font-medium">Order being prepared</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-xs">
                      <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                      <span className="text-gray-400">Order preparation pending</span>
                    </div>
                  )}
                  {selectedOrder.status === 'fulfilled' ? (
                    <div className="flex items-center space-x-2 text-xs">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600">{format(new Date(selectedOrder.updatedAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                      <span className="font-medium">Order marked as fulfilled</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-xs">
                      <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                      <span className="text-gray-400">Fulfillment pending</span>
                    </div>
                  )}
                </div>
                
                {/* Order Metadata */}
                <div className="mt-2 pt-2 border-t">
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div><strong>Created:</strong> {format(new Date(selectedOrder.createdAt), "MMM d, h:mm a")}</div>
                    <div><strong>Updated:</strong> {format(new Date(selectedOrder.updatedAt), "MMM d, h:mm a")}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}