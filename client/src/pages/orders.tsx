import { useState, useEffect, useMemo } from "react";
import { useOptimizedQuery } from "@/hooks/useOptimizedQuery";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, Package, DollarSign, Clock, Users, CheckCircle, X, Truck, MapPin, Camera, Image as ImageIcon, RefreshCw, Eye, Hand } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { DynamicTooltip } from "@/components/ui/dynamic-tooltip";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import { Home, Building, Warehouse } from "lucide-react";
// Simple currency formatter
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2
  }).format(amount);
};

interface Order {
  id: number;
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  total: string;
  platformFee?: string;
  status: string;
  createdAt: string;
  readyToCollectAt?: string;
  fulfillmentType?: string;
  deliveryAddress?: string;
  deliveryAddressId?: number;
  subtotal?: string;
  deliveryCost?: string;
  items?: OrderItem[];
  orderImages?: Array<{
    id: string;
    url: string;
    filename: string;
    uploadedAt: string;
    description?: string;
  }>;
}

interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: string;
  total: string;
  product: {
    id: number;
    name: string;
    imageUrl?: string;
    moq?: number;
  };
}

// Component to fetch and display delivery address details by ID for wholesaler
const WholesalerDeliveryAddressDisplay = ({ addressId }: { addressId: number }) => {
  console.log('🏠 WholesalerDeliveryAddressDisplay rendering for addressId:', addressId);
  
  const { data: address, isLoading, error } = useQuery<{
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postalCode: string;
    country?: string;
    label?: string;
    instructions?: string;
  }>({
    queryKey: [`/api/wholesaler/delivery-address/${addressId}`],
    retry: false,
  });

  console.log('🏠 Address query state:', { isLoading, error: error?.message, address });

  if (isLoading) {
    return (
      <div className="text-xs text-gray-500 flex items-center gap-2">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Loading address...
      </div>
    );
  }

  if (error || !address) {
    return (
      <div className="text-xs text-red-500">
        Unable to load delivery address
      </div>
    );
  }

  const getAddressIcon = (label: string) => {
    switch (label?.toLowerCase()) {
      case 'home': return <Home className="h-4 w-4 text-green-600" />;
      case 'office': case 'work': return <Building className="h-4 w-4 text-blue-600" />;
      case 'warehouse': return <Warehouse className="h-4 w-4 text-purple-600" />;
      default: return <MapPin className="h-4 w-4 text-gray-600" />;
    }
  };

  const Icon = getAddressIcon(address?.label || '');
  
  return (
    <div className="bg-white p-3 rounded border border-blue-200 mt-3">
      <h6 className="font-medium text-blue-900 mb-2 text-sm">Delivery Address:</h6>
      <div className="text-sm text-gray-700">
        <div>{address?.addressLine1}</div>
        {address?.addressLine2 && (
          <div>{address.addressLine2}</div>
        )}
        <div>{address?.city}</div>
        <div>{address?.postalCode}</div>
        {address?.country && (
          <div>{address.country}</div>
        )}
      </div>
    </div>
  );
};

export default function OrdersFresh() {
  const { user, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const ordersPerPage = 20;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Ready for Collection mutation
  const readyForCollectionMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const response = await fetch(`/api/orders/${orderId}/ready-for-collection`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to mark order as ready for collection');
      }
      
      return response.json();
    },
    onSuccess: (data, orderId) => {
      toast({
        title: "Order marked as ready for collection",
        description: "Customer has been notified via email that their order is ready to collect",
      });
      
      // Update the selected order status
      if (selectedOrder && selectedOrder.id === orderId) {
        const updatedOrder = {
          ...selectedOrder,
          status: 'ready_for_collection',
          readyToCollectAt: new Date().toISOString()
        };
        setSelectedOrder(updatedOrder);
      }
      
      // Refresh orders list
      loadOrders(currentPage, searchQuery);
    },
    onError: (error) => {
      toast({
        title: "Failed to mark as ready",
        description: error instanceof Error ? error.message : "Unable to mark order as ready for collection",
        variant: "destructive"
      });
    }
  });

  // Resend ready for collection notification mutation
  const resendReadyNotification = useMutation({
    mutationFn: async (orderId: number) => {
      const response = await fetch(`/api/orders/${orderId}/resend-ready-notification`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resend notification');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Notification Sent",
        description: "Ready to collect notification has been resent to the customer.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resend notification",
        variant: "destructive"
      });
    }
  });

  // Mark order items as prepared mutation
  const itemsPreparedMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const response = await fetch(`/api/orders/${orderId}/items-prepared`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to mark items as prepared');
      }
      
      return response.json();
    },
    onSuccess: (data, orderId) => {
      toast({
        title: "Items Prepared",
        description: "Order items have been marked as prepared and ready for next step.",
      });
      
      // Update the selected order status
      if (selectedOrder && selectedOrder.id === orderId) {
        const updatedOrder = {
          ...selectedOrder,
          status: 'items_prepared'
        };
        setSelectedOrder(updatedOrder);
      }
      
      // Refresh orders list
      loadOrders(currentPage, searchQuery);
    },
    onError: (error) => {
      toast({
        title: "Failed to mark items as prepared",
        description: error instanceof Error ? error.message : "Unable to mark items as prepared",
        variant: "destructive"
      });
    }
  });

  const loadOrders = async (page = 1, search = '') => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: ordersPerPage.toString(),
        ...(search && { search })
      });
      const response = await fetch(`/api/orders-paginated?${params}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Loaded ${data.orders.length} orders successfully (page ${page} of ${data.totalPages})`);
        setOrders(data.orders);
        setTotalOrders(data.total);
        setTotalPages(data.totalPages);
        setCurrentPage(page);
      } else {
        throw new Error(`Server responded with ${response.status}`);
      }
    } catch (err) {
      console.error('❌ Failed to load orders:', err);
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders(1, searchQuery);
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    loadOrders(1, query);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
    const searchTerm = status || searchQuery;
    loadOrders(1, searchTerm);
  };

  const handlePageChange = (newPage: number) => {
    const searchTerm = statusFilter || searchQuery;
    loadOrders(newPage, searchTerm);
  };

  // Fetch detailed order information with items
  const loadOrderDetails = async (order: Order) => {
    try {
      console.log(`🔍 Fetching detailed order information for order ${order.id}`);
      
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const orderWithItems = await response.json();
        console.log(`✅ Loaded order ${order.id} with ${orderWithItems.items?.length || 0} items`);
        setSelectedOrder(orderWithItems);
      } else {
        console.error(`❌ Failed to fetch order details: ${response.status}`);
        // Fall back to basic order data without items
        setSelectedOrder(order);
      }
    } catch (error) {
      console.error(`❌ Error fetching order details:`, error);
      // Fall back to basic order data without items
      setSelectedOrder(order);
    }
  };

  // Update order status to fulfilled
  const markAsFulfilled = async (orderId: number) => {
    setUpdatingOrderId(orderId);
    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fulfilled' })
      });
      
      if (response.ok) {
        // Update local state
        setOrders(orders.map(order => 
          order.id === orderId ? { ...order, status: 'fulfilled' } : order
        ));
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder({ ...selectedOrder, status: 'fulfilled' });
        }
      }
    } catch (error) {
      console.error('Failed to update order status:', error);
    } finally {
      setUpdatingOrderId(null);
    }
  };


  // Upload photo function
  const handlePhotoUpload = async (): Promise<{ method: "PUT"; url: string }> => {
    if (!selectedOrder) {
      throw new Error('No order selected for photo upload');
    }
    
    try {
      const response = await fetch(`/api/orders/${selectedOrder.id}/upload-image`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }
      
      const data = await response.json();
      return { method: "PUT" as const, url: data.uploadURL };
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to prepare photo upload",
        variant: "destructive"
      });
      throw error;
    }
  };

  // Save uploaded photo
  const handlePhotoComplete = async (result: { successful: Array<{ url: string; name: string }> }) => {
    if (!selectedOrder || !result.successful.length) return;
    
    try {
      const uploadedImage = result.successful[0];
      const response = await fetch(`/api/orders/${selectedOrder.id}/save-image`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: uploadedImage.url,
          filename: uploadedImage.name,
          description: 'Order photo'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save photo');
      }
      
      const data = await response.json();
      
      // Update selected order with new image
      if (data.image) {
        const updatedOrder = {
          ...selectedOrder,
          orderImages: [...(selectedOrder.orderImages || []), data.image]
        };
        setSelectedOrder(updatedOrder);
        
        toast({
          title: "Photo Added",
          description: "Order photo uploaded successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save photo to order",
        variant: "destructive"
      });
    }
  };

  // Delete photo function
  const handleDeletePhoto = async (imageId: string) => {
    if (!selectedOrder) return;
    
    try {
      const response = await fetch(`/api/orders/${selectedOrder.id}/delete-image/${imageId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete photo');
      }
      
      // Update selected order by removing the image
      const updatedOrder = {
        ...selectedOrder,
        orderImages: selectedOrder.orderImages?.filter(img => img.id !== imageId) || []
      };
      setSelectedOrder(updatedOrder);
      
      toast({
        title: "Photo Deleted",
        description: "Photo removed successfully"
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Failed to delete photo",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800",
      items_prepared: "bg-blue-100 text-blue-800", 
      ready_for_collection: "bg-orange-100 text-orange-800",
      fulfilled: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800"
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pending",
      paid: "Payment Received", 
      items_prepared: "Items Prepared",
      ready_for_collection: "Ready for Collection",
      fulfilled: "Fulfilled",
      cancelled: "Cancelled"
    };
    return labels[status] || status;
  };

  // Get timeline steps based on order type and status
  const getTimelineSteps = (order: Order) => {
    const isPickup = order.fulfillmentType === 'pickup';
    
    return [
      {
        id: 'payment_received',
        title: 'Order Received',
        description: 'Payment successfully processed',
        completed: ['paid', 'items_prepared', 'ready_for_collection', 'fulfilled'].includes(order.status)
      },
      {
        id: 'items_prepared', 
        title: 'Order Items Prepared',
        description: 'Items have been prepared and packaged',
        completed: ['items_prepared', 'ready_for_collection', 'fulfilled'].includes(order.status),
        current: order.status === 'paid'
      },
      {
        id: 'ready_for_collection',
        title: isPickup ? 'Ready for Collection' : 'Ready for Delivery',
        description: isPickup ? 'Customer notified order is ready to collect' : 'Order packaged and ready for delivery',
        completed: ['ready_for_collection', 'fulfilled'].includes(order.status),
        current: order.status === 'items_prepared'
      },
      {
        id: 'fulfilled',
        title: 'Order Fulfilled',
        description: isPickup ? 'Customer has collected the order' : 'Order has been delivered',
        completed: order.status === 'fulfilled',
        current: order.status === 'ready_for_collection'
      }
    ];
  };

  // Calculate amounts after platform fee using actual database platform fees
  const calculateNetAmount = (order: Order) => {
    const subtotal = parseFloat(order.subtotal || '0');
    const actualPlatformFee = parseFloat(order.platformFee || '0');
    // Use the actual platform fee from database if available, otherwise calculate 3.3% of subtotal
    const feeToDeduct = actualPlatformFee > 0 ? actualPlatformFee : subtotal * 0.033;
    return subtotal - feeToDeduct;
  };

  const displayedOrders = orders.length;
  const totalValue = orders.reduce((sum, order) => sum + calculateNetAmount(order), 0);
  const paidOrders = orders.filter(o => o.status === 'paid').length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;

  // Show loading state for auth or orders loading
  if (authLoading || loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">Loading orders...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!authLoading && !user) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Authentication Required</h3>
              <p className="text-gray-600 mb-4">Please log in to view your orders.</p>
              <Button onClick={() => window.location.href = '/api/auth/google'}>
                Sign in with Google
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={() => loadOrders()}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-500">
            Showing {displayedOrders} of {totalOrders} orders
          </div>
          <Button onClick={() => loadOrders(currentPage, searchQuery)} variant="outline" size="sm" className="text-xs">
            Refresh
          </Button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search orders by customer name, phone, or order number..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select 
          className="px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          value={statusFilter}
          onChange={(e) => handleStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="pending">Pending</option>
        </select>
        {(searchQuery || statusFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              handleSearch('');
              setStatusFilter('');
            }}
            className="text-sm"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Total Orders</CardTitle>
            <Package className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{totalOrders}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Net Revenue</CardTitle>
            <DollarSign className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground">After platform fees</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Paid Orders</CardTitle>
            <Users className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{paidOrders}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Pending</CardTitle>
            <Clock className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{pendingOrders}</div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No orders found</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Order #</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Net Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.slice(0, 50).map((order) => (
                    <TableRow key={order.id} className="cursor-pointer hover:bg-gray-50" onClick={() => loadOrderDetails(order)}>
                      <TableCell className="font-medium text-xs">
                        {order.orderNumber || `#${order.id}`}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>
                          <div className="font-medium">{order.customerName || 'Unknown'}</div>
                          <div className="text-xs text-gray-500">{order.customerEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-xs">
                        <div>
                          <div>{formatCurrency(calculateNetAmount(order))}</div>
                          <div className="text-xs text-gray-500">After platform fee</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex gap-1">
                          <Badge className={getStatusColor(order.status) + " text-xs"}>
                            {getStatusLabel(order.status)}
                          </Badge>
                          {order.fulfillmentType && (
                            <Badge variant="outline" className="text-xs">
                              {order.fulfillmentType === 'delivery' ? (
                                <><Truck className="w-2 h-2 mr-1" />Delivery</>
                              ) : (
                                <><MapPin className="w-2 h-2 mr-1" />Collection</>
                              )}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {order.status !== 'fulfilled' ? (
                          <Button 
                            size="sm" 
                            variant="outline"
                            disabled={updatingOrderId === order.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsFulfilled(order.id);
                            }}
                            className="text-xs"
                          >
                            {updatingOrderId === order.id ? 'Updating...' : 'Mark Fulfilled'}
                          </Button>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-800 text-xs">
                            <CheckCircle className="w-2 h-2 mr-1" />
                            Fulfilled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        <div className="flex items-center justify-between">
                          <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                          <Eye className="h-4 w-4 text-gray-400" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
              
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {orders.slice(0, 50).map((order) => (
                  <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadOrderDetails(order)}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-medium text-sm">{order.orderNumber || `#${order.id}`}</div>
                          <div className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <div className="font-medium text-sm">{formatCurrency(calculateNetAmount(order))}</div>
                            <div className="text-xs text-gray-500">After platform fee</div>
                          </div>
                          <Eye className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <div className="font-medium text-xs">{order.customerName || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">{order.customerEmail}</div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge className={getStatusColor(order.status) + " text-xs"}>
                          {getStatusLabel(order.status)}
                        </Badge>
                        {order.fulfillmentType && (
                          <Badge variant="outline" className="text-xs">
                            {order.fulfillmentType === 'delivery' ? (
                              <><Truck className="w-2 h-2 mr-1" />Delivery</>
                            ) : (
                              <><MapPin className="w-2 h-2 mr-1" />Collection</>
                            )}
                          </Badge>
                        )}
                      </div>
                      
                      {order.status !== 'fulfilled' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          disabled={updatingOrderId === order.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsFulfilled(order.id);
                          }}
                          className="text-xs w-full"
                        >
                          {updatingOrderId === order.id ? 'Updating...' : 'Mark Fulfilled'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    Page {currentPage} of {totalPages} • {totalOrders} total orders
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="text-xs"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="text-xs"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Order Details Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto [&>button]:hidden">
          <DialogHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-semibold">Order {selectedOrder?.orderNumber || `#${selectedOrder?.id}`}</DialogTitle>
                <p className="text-sm text-gray-500">Order ID: {selectedOrder?.id}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(null)}>
                Close
              </Button>
            </div>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 text-sm">
              {/* Status & Fulfillment */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Status & Fulfillment</h3>
                <div className="flex gap-2">
                  <Badge className="bg-green-100 text-green-800 text-xs px-2 py-1">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Paid
                  </Badge>
                  <Badge variant="outline" className="text-xs px-2 py-1">
                    {selectedOrder.fulfillmentType === 'delivery' ? (
                      <><Truck className="w-3 h-3 mr-1" />Delivery</>
                    ) : (
                      <><MapPin className="w-3 h-3 mr-1" />Collection</>
                    )}
                  </Badge>
                  {selectedOrder.status === 'fulfilled' && (
                    <Badge className="bg-blue-100 text-blue-800 text-xs px-2 py-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Fulfilled
                    </Badge>
                  )}
                </div>
              </div>

              {/* Customer Information */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Customer Information</h3>
                <div className="space-y-1 text-xs">
                  <div><span className="font-medium">Name:</span> {selectedOrder.customerName}</div>
                  <div><span className="font-medium">Email:</span> {selectedOrder.customerEmail}</div>
                  {selectedOrder.customerPhone && (
                    <div><span className="font-medium">Phone:</span> {selectedOrder.customerPhone}</div>
                  )}
                </div>
              </div>

              {/* Delivery Address / Collection Info */}
              {selectedOrder.fulfillmentType === 'delivery' ? (
                <div>
                  <h3 className="font-medium mb-3 text-sm">Delivery Address</h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <MapPin className="h-4 w-4 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="text-sm text-gray-700">
                        {(() => {
                          // FIXED: Prioritize stored text address over database ID lookup (same fix as customer portal)
                          if (selectedOrder.deliveryAddress) {
                            try {
                              const parsedAddress = JSON.parse(selectedOrder.deliveryAddress);
                              if (parsedAddress && typeof parsedAddress === 'object') {
                                return (
                                  <div>
                                    <div className="font-medium text-gray-900">{parsedAddress.addressLine1}</div>
                                    {parsedAddress.addressLine2 && (
                                      <div className="text-gray-700">{parsedAddress.addressLine2}</div>
                                    )}
                                    <div className="text-gray-700">{parsedAddress.city}</div>
                                    <div className="text-gray-700">{parsedAddress.postalCode}</div>
                                    {parsedAddress.country && (
                                      <div className="text-gray-700">{parsedAddress.country}</div>
                                    )}
                                  </div>
                                );
                              }
                            } catch (e) {
                              // JSON parsing failed, treat as plain text
                              return <div className="text-gray-700">{selectedOrder.deliveryAddress}</div>;
                            }
                          } else if (selectedOrder.deliveryAddressId) {
                            return <WholesalerDeliveryAddressDisplay addressId={selectedOrder.deliveryAddressId} />;
                          }
                          
                          return (
                            <div className="text-gray-500 italic">
                              No delivery address information available
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="font-medium mb-3 text-sm">Collection Address</h3>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <Package className="h-4 w-4 text-orange-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="text-sm">
                        <div className="font-medium text-orange-800">Collect from business</div>
                        <div className="text-orange-700 font-medium mt-1">
                          {selectedOrder.wholesalerBusinessName || 'Business Location'}
                        </div>
                        <div className="text-orange-600 text-xs mt-2">
                          Please contact the business to arrange collection time and get the exact address.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Order Items */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Items ({selectedOrder.items?.length || 0})</h3>
                <div className="space-y-2">
                  {selectedOrder.items?.map((item, index) => (
                    <div key={index} className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.product?.name || 'Unknown Product'}</div>
                        <div className="text-xs text-gray-500">
                          Quantity: {item.quantity} units × {formatCurrency(parseFloat(item.unitPrice))}
                        </div>
                      </div>
                      <div className="font-medium text-sm ml-4">
                        {formatCurrency(parseFloat(item.total))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Summary */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Payment Summary</h3>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Order Total:</span>
                    <span>{formatCurrency(parseFloat(selectedOrder.subtotal || '0'))}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Platform Fee (3.3%):</span>
                    <span>-{formatCurrency(parseFloat(selectedOrder.subtotal || '0') * 0.033)}</span>
                  </div>
                  <div className="border-t pt-1 mt-2">
                    <div className="flex justify-between font-medium text-green-600">
                      <span>Your Net Amount:</span>
                      <span>{formatCurrency(calculateNetAmount(selectedOrder))}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Amount you receive after platform fee deduction
                  </div>
                </div>
              </div>

              {/* Order Photos Section */}
              <div>
                <h3 className="font-medium mb-2 text-sm flex items-center">
                  <Camera className="h-4 w-4 mr-2 text-green-600" />
                  Order Photos
                </h3>
                
                <div className="space-y-3">
                  {/* Upload Button */}
                  <div>
                    <ObjectUploader
                      maxNumberOfFiles={5}
                      maxFileSize={10485760}
                      onGetUploadParameters={handlePhotoUpload}
                      onComplete={handlePhotoComplete}
                      buttonClassName="w-full text-xs"
                    >
                      <Camera className="h-3 w-3 mr-2" />
                      Add Photo
                    </ObjectUploader>
                  </div>
                  
                  {/* Display existing photos */}
                  {selectedOrder.orderImages && selectedOrder.orderImages.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedOrder.orderImages.map((image) => (
                        <div key={image.id} className="relative group">
                          <img
                            src={image.url}
                            alt={image.filename}
                            className="w-full h-20 object-cover rounded border cursor-pointer hover:opacity-90"
                            onClick={() => window.open(image.url, '_blank')}
                          />
                          <button
                            onClick={() => handleDeletePhoto(image.id)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            title="Delete photo"
                          >
                            ×
                          </button>
                          <div className="text-xs text-gray-500 mt-1 truncate">
                            {image.filename}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded border border-dashed">
                      <div className="flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 mr-2 text-gray-400" />
                        No photos uploaded yet
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Timeline */}
              <div>
                <h3 className="font-medium mb-3 text-sm">Order Timeline</h3>
                <div className="space-y-3">
                  {getTimelineSteps(selectedOrder).map((step, index) => (
                    <div key={step.id} className="flex items-start gap-3">
                      <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                        step.completed ? 'bg-green-500' : 
                        step.current ? 'bg-blue-500' : 'bg-gray-300'
                      }`}></div>
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${
                          step.completed ? 'text-green-700' : 
                          step.current ? 'text-blue-700' : 'text-gray-500'
                        }`}>
                          {step.title}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {step.description}
                        </div>
                        {step.completed && index === 0 && (
                          <div className="text-xs text-gray-400 mt-1">
                            {new Date(selectedOrder.createdAt).toLocaleDateString()} at {new Date(selectedOrder.createdAt).toLocaleTimeString()}
                          </div>
                        )}
                        {step.id === 'ready_for_collection' && step.completed && selectedOrder.readyToCollectAt && (
                          <div className="text-xs text-orange-600 mt-1 font-medium">
                            Ready notification sent: {new Date(selectedOrder.readyToCollectAt).toLocaleDateString()} at {new Date(selectedOrder.readyToCollectAt).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                
                {/* Items Prepared Button - Only for paid orders */}
                {selectedOrder.status === 'paid' && (
                  <Button 
                    size="sm"
                    onClick={() => itemsPreparedMutation.mutate(selectedOrder.id)}
                    disabled={itemsPreparedMutation.isPending}
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    <Package className="h-4 w-4 mr-1" />
                    {itemsPreparedMutation.isPending ? 'Marking Prepared...' : 'Items Prepared'}
                  </Button>
                )}
                
                {/* Ready for Collection/Delivery Button - For orders that have items prepared */}
                {selectedOrder.status === 'items_prepared' && (
                  <Button 
                    size="sm"
                    onClick={() => readyForCollectionMutation.mutate(selectedOrder.id)}
                    disabled={readyForCollectionMutation.isPending}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    <Clock className="h-4 w-4 mr-1" />
                    {readyForCollectionMutation.isPending ? 'Marking Ready...' : 
                     selectedOrder.fulfillmentType === 'pickup' ? 'Ready for Collection' : 'Ready for Delivery'}
                  </Button>
                )}

                {/* Ready for Collection/Delivery Status Display */}
                {selectedOrder.status === 'ready_for_collection' && (
                  <div className="text-right">
                    <p className="text-sm text-orange-600 font-medium">
                      {selectedOrder.fulfillmentType === 'pickup' ? 'Ready to collect sent' : 'Ready for delivery sent'}
                    </p>
                    {selectedOrder.readyToCollectAt && (
                      <p className="text-xs text-orange-500">
                        Sent: {new Date(selectedOrder.readyToCollectAt).toLocaleString()}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 text-xs border-orange-300 text-orange-700 hover:bg-orange-100"
                      onClick={() => resendReadyNotification.mutate(selectedOrder.id)}
                      disabled={resendReadyNotification.isPending}
                    >
                      {resendReadyNotification.isPending ? 'Sending...' : 'Resend'}
                    </Button>
                  </div>
                )}

                {/* Mark as Fulfilled Button */}
                {(selectedOrder.status === 'items_prepared' || selectedOrder.status === 'ready_for_collection') && (
                  <Button 
                    size="sm"
                    onClick={() => markAsFulfilled(selectedOrder.id)}
                    disabled={updatingOrderId === selectedOrder.id}
                  >
                    {updatingOrderId === selectedOrder.id ? 'Updating...' : 'Mark as Fulfilled'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}