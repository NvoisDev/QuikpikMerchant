import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, DollarSign, TrendingUp, AlertCircle, RefreshCw, Search, Eye, Filter, Mail, Phone, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/currencies";

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
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  total: string;
  subtotal: string;
  status: string;
  fulfillmentType?: string;
  deliveryAddress?: string;
  createdAt: string;
  items?: OrderItem[];
}

export default function OrdersFinal() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const fetchOrdersSimple = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Direct fetch from orders endpoint...');
      
      // Try main endpoint first
      try {
        const response = await fetch(`/api/orders${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        console.log(`Main endpoint response: ${response.status}`);
        
        if (response.ok) {
          const ordersData = await response.json();
          console.log(`✅ Main endpoint success: ${ordersData.length} orders`);
          setOrders(Array.isArray(ordersData) ? ordersData : []);
          setLoading(false);
          return;
        }
      } catch (mainError) {
        console.log('Main endpoint failed, trying backup...');
      }
      
      // Try public endpoint as backup
      try {
        const response = await fetch(`/api/public-orders${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        console.log(`Public endpoint response: ${response.status}`);
        
        if (response.ok) {
          const responseData = await response.json();
          const ordersData = Array.isArray(responseData) ? responseData : (responseData.orders || []);
          console.log(`✅ Public endpoint success: ${ordersData.length} orders`);
          setOrders(ordersData);
          setLoading(false);
          return;
        }
      } catch (publicError) {
        console.error('Public endpoint also failed:', publicError);
      }
      
      throw new Error('Both endpoints failed');
      
    } catch (err) {
      console.error('❌ All endpoints failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load orders');
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto-start on component mount
    fetchOrdersSimple();
  }, []);

  // Refresh when search/filter changes
  useEffect(() => {
    if (searchTerm !== "" || statusFilter !== "all") {
      const timer = setTimeout(fetchOrdersSimple, 500);
      return () => clearTimeout(timer);
    }
  }, [searchTerm, statusFilter]);



  const getStatusBadge = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800", 
      fulfilled: "bg-blue-100 text-blue-800",
      cancelled: "bg-red-100 text-red-800"
    };
    const colorClass = colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
    return (
      <Badge className={`${colorClass} border-0`}>
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
      </Badge>
    );
  };

  // Filter orders
  const filteredOrders = orders.filter(order => {
    const matchesSearch = !searchTerm || 
      order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Stats
  const stats = {
    total: filteredOrders.length,
    paid: filteredOrders.filter(o => o.status === 'paid').length,
    fulfilled: filteredOrders.filter(o => o.status === 'fulfilled').length,
    revenue: filteredOrders.reduce((sum, order) => sum + parseFloat(order.subtotal || order.total || '0'), 0)
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full"></div>
            <div className="text-center">
              <p className="text-lg font-medium text-gray-700">Loading Your Orders</p>
              <p className="text-sm text-gray-500 mt-1">Fetching your 282 wholesale orders...</p>
              <div className="mt-3 text-xs text-gray-400">
                <p>✓ Connecting to orders database</p>
                <p>✓ Processing order data...</p>
                <p>✓ Preparing order display...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center space-y-4">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <div className="text-red-600 font-medium">Unable to load orders</div>
          <p className="text-gray-500 text-sm">{error}</p>
          <Button onClick={fetchOrdersSimple} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            Manage your wholesale orders and fulfillment
          </p>
        </div>
        <Button onClick={fetchOrdersSimple} variant="outline" size="sm" className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search orders, customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
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
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Filtered results</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.revenue)}</div>
            <p className="text-xs text-muted-foreground">Total earnings</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paid}</div>
            <p className="text-xs text-muted-foreground">Paid orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fulfilled</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.fulfilled}</div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Orders ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || statusFilter !== "all" 
                  ? "Try adjusting your search or filter" 
                  : "Orders will appear here once customers place them"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">Order</th>
                    <th className="text-left p-4 font-medium">Customer</th>
                    <th className="text-left p-4 font-medium">Total</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Type</th>
                    <th className="text-left p-4 font-medium">Date</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.slice(0, 25).map((order) => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <div className="font-medium text-blue-600">
                          {order.orderNumber || `#${order.id}`}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{order.customerName || 'Unknown'}</div>
                        <div className="text-sm text-gray-500">{order.customerEmail || 'No email'}</div>
                      </td>
                      <td className="p-4 font-medium">
                        {formatCurrency(parseFloat(order.total || "0"))}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="p-4 text-sm">
                        {order.fulfillmentType || 'standard'}
                      </td>
                      <td className="p-4 text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedOrder(order)}
                          className="flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredOrders.length > 25 && (
                <div className="text-center p-4 text-sm text-gray-500">
                  Showing first 25 of {filteredOrders.length} orders
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold">Order Information</h4>
                  <p className="text-sm">Order: {selectedOrder.orderNumber || `#${selectedOrder.id}`}</p>
                  <p className="text-sm">Status: {getStatusBadge(selectedOrder.status)}</p>
                  <p className="text-sm">Type: {selectedOrder.fulfillmentType || 'standard'}</p>
                  <p className="text-sm">Date: {new Date(selectedOrder.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Customer Information</h4>
                  <p className="text-sm flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {selectedOrder.customerEmail || 'No email'}
                  </p>
                  <p className="text-sm flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedOrder.customerPhone || 'No phone'}
                  </p>
                  {selectedOrder.deliveryAddress && (
                    <p className="text-sm flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedOrder.deliveryAddress}
                    </p>
                  )}
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold">Financial Summary</h4>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <p className="text-sm">Subtotal: {formatCurrency(parseFloat(selectedOrder.subtotal || "0"))}</p>
                  <p className="text-sm font-medium">Total: {formatCurrency(parseFloat(selectedOrder.total || "0"))}</p>
                </div>
              </div>

              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <h4 className="font-semibold">Order Items</h4>
                  <div className="space-y-2 mt-2">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <div>
                          <p className="font-medium">{item.product.name}</p>
                          <p className="text-sm text-gray-500">Qty: {item.quantity} × {formatCurrency(parseFloat(item.unitPrice))}</p>
                        </div>
                        <p className="font-medium">{formatCurrency(parseFloat(item.total))}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}