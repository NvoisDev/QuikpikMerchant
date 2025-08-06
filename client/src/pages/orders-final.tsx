import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Search, Filter, Eye, Package, Phone, Mail, Truck, Store, TrendingUp, Users, DollarSign, Clock, MapPin } from "lucide-react";
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
  cancelled: "bg-red-100 text-red-800"
};

const fulfillmentColors = {
  delivery: "bg-blue-100 text-blue-800",
  pickup: "bg-orange-100 text-orange-800",
  collection: "bg-orange-100 text-orange-800"
};

export default function OrdersFinal() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading, error } = useQuery<Order[]>({
    queryKey: ['/api/public-orders'],
    retry: 1,
    staleTime: 30000
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

  const formatCurrency = (amount: string) => {
    return `£${parseFloat(amount).toFixed(2)}`;
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

  // Calculate analytics
  const analytics = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
    const averageOrderValue = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;
    const deliveryOrders = filteredOrders.filter(o => o.fulfillmentType === 'delivery').length;
    const pickupOrders = filteredOrders.filter(o => o.fulfillmentType === 'pickup' || o.fulfillmentType === 'collection').length;
    const uniqueCustomers = new Set(filteredOrders.map(o => o.customerEmail)).size;
    const paidOrders = filteredOrders.filter(o => o.status === 'paid').length;
    
    return {
      totalRevenue,
      averageOrderValue,
      deliveryOrders,
      pickupOrders,
      uniqueCustomers,
      paidOrders,
      conversionRate: filteredOrders.length > 0 ? (paidOrders / filteredOrders.length) * 100 : 0
    };
  }, [filteredOrders]);

  const parseAddress = (addressString: string) => {
    try {
      const addr = JSON.parse(addressString);
      return `${addr.street}, ${addr.city}, ${addr.postalCode}`;
    } catch {
      return addressString;
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
                <p className="text-sm text-gray-600">Conversion Rate</p>
                <p className="text-2xl font-bold text-orange-600">{analytics.conversionRate.toFixed(1)}%</p>
              </div>
              <Clock className="w-8 h-8 text-orange-500" />
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
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Orders List
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No orders found matching your criteria</p>
            </div>
          ) : (
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
                  {filteredOrders.map((order: Order) => (
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
                        <div className="font-medium">{formatCurrency(order.total)}</div>
                        <div className="text-sm text-gray-500">
                          Subtotal: {formatCurrency(order.subtotal)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{formatDate(order.createdAt)}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {parseAddress(order.deliveryAddress).split(',')[1]?.trim() || 'Unknown'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedOrder(order)}
                          className="flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Order {selectedOrder.orderNumber}</CardTitle>
                  <CardDescription>Order ID: {selectedOrder.id}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedOrder(null)}
                >
                  Close
                </Button>
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
                <h3 className="font-semibold mb-2">Customer Information</h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div><strong>Name:</strong> {selectedOrder.customerName}</div>
                  <div><strong>Email:</strong> {selectedOrder.customerEmail}</div>
                  <div><strong>Phone:</strong> {selectedOrder.customerPhone}</div>
                  <div><strong>Address:</strong> {parseAddress(selectedOrder.deliveryAddress)}</div>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h3 className="font-semibold mb-2">Items ({selectedOrder.itemCount})</h3>
                <div className="space-y-3">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{item.product.name}</div>
                        <div className="text-sm text-gray-600">
                          Quantity: {item.quantity} × {formatCurrency(item.unitPrice)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(item.total)}</div>
                      </div>
                    </div>
                  ))}
                  {selectedOrder.itemCount > selectedOrder.items.length && (
                    <div className="text-center text-gray-500 text-sm">
                      ... and {selectedOrder.itemCount - selectedOrder.items.length} more items
                    </div>
                  )}
                </div>
              </div>

              {/* Order Summary */}
              <div>
                <h3 className="font-semibold mb-2">Order Summary</h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(selectedOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform Fee:</span>
                    <span>{formatCurrency(selectedOrder.platformFee)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-2">
                    <span>Total:</span>
                    <span>{formatCurrency(selectedOrder.total)}</span>
                  </div>
                </div>
              </div>

              {/* Order Dates */}
              <div>
                <h3 className="font-semibold mb-2">Order Timeline</h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                  <div><strong>Created:</strong> {format(new Date(selectedOrder.createdAt), "PPpp")}</div>
                  <div><strong>Updated:</strong> {format(new Date(selectedOrder.updatedAt), "PPpp")}</div>
                  <div><strong>Fulfillment:</strong> {selectedOrder.fulfillmentType}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}