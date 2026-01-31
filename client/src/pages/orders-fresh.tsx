import { useState, useEffect, useMemo } from "react";
import { useOptimizedQuery } from "@/hooks/useOptimizedQuery";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, Package, DollarSign, Clock, Users, CheckCircle, X, Truck, MapPin, Camera, Image as ImageIcon, RefreshCw, Eye, FileText } from "lucide-react";
import { Link } from "wouter";
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
  isQuote?: boolean;
  depositPercentage?: number;
  amountPaid?: string;
  amountOutstanding?: string;
  paymentStatus?: string;
  stripePaymentLinkUrl?: string;
  wholesalerBusinessName?: string;
  amountRefunded?: string;
  refundReason?: string;
  refundedAt?: string;
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
      <h6 className="font-medium text-blue-900 mb-2 text-sm flex items-center gap-2">
        {getAddressIcon(address?.label || 'other')}
        Delivery Address:
      </h6>
      <div className="text-sm text-gray-700 space-y-1">
        {address?.addressLine1 && (
          <div>{address.addressLine1}</div>
        )}
        {address?.addressLine2 && (
          <div>{address.addressLine2}</div>
        )}
        {address?.city && (
          <div>{address.city}</div>
        )}
        {address?.postalCode && (
          <div>{address.postalCode}</div>
        )}
        {address?.country && (
          <div>{address.country}</div>
        )}
      </div>
      
      {address?.label && (
        <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit mt-2">
          {address.label.charAt(0).toUpperCase() + address.label.slice(1)}
        </div>
      )}
      {address?.instructions && (
        <div className="text-xs text-gray-600 bg-amber-50 px-2 py-1 rounded border border-amber-200 mt-2">
          <span className="font-medium">Instructions:</span> {address.instructions}
        </div>
      )}
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
  
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonCategory, setCancelReasonCategory] = useState('');
  const [processRefund, setProcessRefund] = useState(false);
  const [refundType, setRefundType] = useState<'card' | 'credit' | 'later'>('card');
  const [restockInventory, setRestockInventory] = useState(true);
  const [sendNotification, setSendNotification] = useState(true);
  const [staffNote, setStaffNote] = useState('');
  const [returnItems, setReturnItems] = useState<Array<{ productId: number; quantity: number; sellingType: string; maxQty: number }>>([]);
  const [isCancelling, setIsCancelling] = useState(false);
  
  const cancellationReasons = [
    { value: 'out_of_stock', label: 'Out of Stock' },
    { value: 'customer_request', label: 'Customer Request' },
    { value: 'wrong_order', label: 'Wrong Order / Items' },
    { value: 'damaged_goods', label: 'Damaged Goods' },
    { value: 'pricing_error', label: 'Pricing Error' },
    { value: 'duplicate_order', label: 'Duplicate Order' },
    { value: 'delivery_issue', label: 'Delivery Issue' },
    { value: 'other', label: 'Other' }
  ];

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

  const cancelOrder = async () => {
    if (!selectedOrder) return;
    setIsCancelling(true);
    
    console.log('🚫 Attempting to cancel order:', selectedOrder.id);
    
    try {
      const itemsToReturn = returnItems.filter(item => item.quantity > 0);
      const reasonLabel = cancellationReasons.find(r => r.value === cancelReasonCategory)?.label || cancelReasonCategory;
      const fullReason = cancelReason ? `${reasonLabel}: ${cancelReason}` : reasonLabel;
      
      console.log('📦 Items to return:', itemsToReturn);
      console.log('💳 Process refund:', processRefund, 'Type:', refundType);
      console.log('📝 Cancel reason:', fullReason);
      
      const response = await fetch(`/api/orders/${selectedOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reason: fullReason,
          reasonCategory: cancelReasonCategory,
          processRefund: processRefund && refundType !== 'later',
          refundType: processRefund && refundType !== 'later' ? refundType : undefined,
          returnedItems: itemsToReturn.length > 0 ? itemsToReturn : undefined,
          restockInventory,
          sendNotification,
          staffNote: staffNote || undefined
        })
      });

      console.log('📡 Cancel response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Order cancelled successfully:', data);
        
        const refundMessage = processRefund && refundType !== 'later'
          ? refundType === 'card' 
            ? ' A refund has been initiated and will appear on the customer\'s statement within 5-10 business days.'
            : ' Store credit has been applied to the customer\'s account.'
          : refundType === 'later' ? ' Refund will be processed separately.' : '';
        
        toast({
          title: "Order Cancelled",
          description: `The order has been successfully cancelled.${refundMessage}`,
        });
        setOrders(orders.map(order => 
          order.id === selectedOrder.id ? { ...order, status: 'cancelled' } : order
        ));
        setSelectedOrder({ ...selectedOrder, status: 'cancelled' });
        setShowCancelDialog(false);
        setCancelReason('');
        setCancelReasonCategory('');
        setProcessRefund(false);
        setRefundType('card');
        setReturnItems([]);
        setRestockInventory(true);
        setSendNotification(true);
        setStaffNote('');
        loadOrders(currentPage, statusFilter || searchQuery);
      } else {
        const errorData = await response.json();
        console.error('❌ Cancel failed:', errorData);
        toast({
          title: "Error",
          description: errorData.message || errorData.error || "Failed to cancel order",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('❌ Failed to cancel order:', error);
      toast({
        title: "Error",
        description: "Failed to cancel order - network error",
        variant: "destructive"
      });
    } finally {
      setIsCancelling(false);
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

  // Mark order as ready for collection
  const markReadyForCollection = async (orderId: number) => {
    setUpdatingOrderId(orderId);
    try {
      const response = await fetch(`/api/orders/${orderId}/ready-for-collection`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (response.ok) {
        // Update local state
        setOrders(orders.map(order => 
          order.id === orderId ? { ...order, status: 'ready_for_collection' } : order
        ));
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder({ ...selectedOrder, status: 'ready_for_collection' });
        }
        
        toast({
          title: "Order marked as ready for collection",
          description: "Customer has been notified via email that their order is ready to collect",
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to mark order as ready for collection');
      }
    } catch (error) {
      console.error('Failed to mark order as ready for collection:', error);
      toast({
        title: "Failed to mark as ready",
        description: error instanceof Error ? error.message : "Unable to mark order as ready for collection",
        variant: "destructive",
      });
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
      fulfilled: "bg-blue-100 text-blue-800",
      cancelled: "bg-red-100 text-red-800",
      ready_for_collection: "bg-orange-100 text-orange-800"
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getPaymentStatusColor = (paymentStatus: string) => {
    const colors: Record<string, string> = {
      unpaid: "bg-red-100 text-red-800",
      part_paid: "bg-amber-100 text-amber-800",
      paid: "bg-green-100 text-green-800"
    };
    return colors[paymentStatus] || "bg-gray-100 text-gray-800";
  };

  const getPaymentStatusLabel = (paymentStatus: string) => {
    const labels: Record<string, string> = {
      unpaid: "Unpaid",
      part_paid: "Part Paid",
      paid: "Paid"
    };
    return labels[paymentStatus] || paymentStatus;
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
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header - stacks on mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold">Orders</h1>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {displayedOrders} of {totalOrders}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => loadOrders(currentPage, searchQuery)} variant="outline" size="sm" className="text-xs">
            Refresh
          </Button>
          <Link href="/quick-quote">
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              <FileText className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Quick Quote</span>
              <span className="sm:hidden">Quote</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Search and Filter - stacks on mobile */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by name, phone, or order..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="flex gap-2">
          <select 
            className="flex-1 sm:flex-none px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
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
              className="text-sm whitespace-nowrap"
            >
              Clear
            </Button>
          )}
        </div>
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
                        <div className="flex gap-1 flex-wrap">
                          {order.status === 'cancelled' ? (
                            <Badge className="bg-red-100 text-red-800 text-xs">
                              <X className="w-2 h-2 mr-1" />
                              Cancelled
                            </Badge>
                          ) : order.isQuote && order.paymentStatus ? (
                            <Badge className={getPaymentStatusColor(order.paymentStatus) + " text-xs"}>
                              {getPaymentStatusLabel(order.paymentStatus)}
                            </Badge>
                          ) : (
                            <Badge className={getStatusColor(order.status) + " text-xs"}>
                              {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                            </Badge>
                          )}
                          {order.isQuote && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                              Quote
                            </Badge>
                          )}
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
                        {order.status === 'cancelled' ? (
                          <span className="text-red-600 text-xs">-</span>
                        ) : order.status !== 'fulfilled' ? (
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
                        {order.status === 'cancelled' ? (
                          <Badge className="bg-red-100 text-red-800 text-xs">
                            <X className="w-2 h-2 mr-1" />
                            Cancelled
                          </Badge>
                        ) : order.isQuote && order.paymentStatus ? (
                          <Badge className={getPaymentStatusColor(order.paymentStatus) + " text-xs"}>
                            {getPaymentStatusLabel(order.paymentStatus)}
                          </Badge>
                        ) : (
                          <Badge className={getStatusColor(order.status) + " text-xs"}>
                            {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                          </Badge>
                        )}
                        {order.isQuote && (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                            Quote
                          </Badge>
                        )}
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
                      
                      {order.status !== 'fulfilled' && order.status !== 'cancelled' && (
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
                  {selectedOrder.status === 'cancelled' ? (
                    <Badge className="bg-red-100 text-red-800 text-xs px-2 py-1">
                      <X className="w-3 h-3 mr-1" />
                      Cancelled
                    </Badge>
                  ) : selectedOrder.isQuote ? (
                    <Badge className={`${getPaymentStatusColor(selectedOrder.paymentStatus || 'unpaid')} text-xs px-2 py-1`}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {getPaymentStatusLabel(selectedOrder.paymentStatus || 'unpaid')}
                    </Badge>
                  ) : (
                    <Badge className={`${getStatusColor(selectedOrder.status)} text-xs px-2 py-1`}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {selectedOrder.status?.charAt(0).toUpperCase() + selectedOrder.status?.slice(1)}
                    </Badge>
                  )}
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
                          // FIXED: Prioritize complete address lookup over incomplete stored text
                          if (selectedOrder.deliveryAddressId) {
                            return <WholesalerDeliveryAddressDisplay addressId={selectedOrder.deliveryAddressId} />;
                          } else if (selectedOrder.deliveryAddress) {
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

              {/* Payment Status Section for Quotes - Shows product values (excludes customer transaction fees) */}
              {selectedOrder.isQuote && (() => {
                const productTotal = parseFloat(selectedOrder.subtotal || selectedOrder.total || '0');
                const customerTotal = parseFloat(selectedOrder.total || '0');
                const paymentRatio = customerTotal > 0 ? parseFloat(selectedOrder.amountPaid || '0') / customerTotal : 0;
                const wholesalerPaid = productTotal * paymentRatio;
                const wholesalerOutstanding = productTotal - wholesalerPaid;
                
                return (
                <div>
                  <h3 className="font-medium mb-2 text-sm flex items-center">
                    <DollarSign className="h-4 w-4 mr-2 text-green-600" />
                    Payment Status
                  </h3>
                  <div className="bg-gray-50 p-3 rounded text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Order Total:</span>
                      <span className="font-medium">{formatCurrency(productTotal)}</span>
                    </div>
                    {selectedOrder.depositPercentage && selectedOrder.depositPercentage < 100 && (
                      <div className="flex justify-between text-amber-700">
                        <span>Deposit ({selectedOrder.depositPercentage}%):</span>
                        <span>{formatCurrency(productTotal * (selectedOrder.depositPercentage / 100))}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-green-600">
                      <span>Amount Paid:</span>
                      <span className="font-medium">{formatCurrency(wholesalerPaid)}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>Outstanding Balance:</span>
                      <span className="font-medium">{formatCurrency(wholesalerOutstanding)}</span>
                    </div>
                    <div className="pt-2 border-t flex flex-wrap gap-2">
                      <Badge className={getPaymentStatusColor(selectedOrder.paymentStatus || 'unpaid')}>
                        {getPaymentStatusLabel(selectedOrder.paymentStatus || 'unpaid')}
                      </Badge>
                      {parseFloat(selectedOrder.amountRefunded || '0') > 0 && (
                        <Badge className="bg-purple-100 text-purple-800">
                          Refunded: {formatCurrency(parseFloat(selectedOrder.amountRefunded || '0'))}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Send Payment Link Buttons - only show if there's an outstanding balance (using wholesaler-perspective value) */}
                    {wholesalerOutstanding > 0.01 && (
                      <div className="pt-2 border-t mt-2 space-y-2">
                        <Button 
                          size="sm" 
                          className="w-full bg-green-600 hover:bg-green-700 text-xs"
                          onClick={async () => {
                            try {
                              const response = await fetch(`/api/orders/${selectedOrder.id}/generate-balance-link`, {
                                method: 'POST',
                                credentials: 'include',
                              });
                              const data = await response.json();
                              if (data.success && data.paymentLink) {
                                try {
                                  await navigator.clipboard.writeText(data.paymentLink);
                                } catch (clipErr) {
                                  console.log('Clipboard write failed, showing link instead');
                                }
                                
                                if (data.order) {
                                  setSelectedOrder({
                                    ...selectedOrder,
                                    ...data.order,
                                    stripePaymentLinkUrl: data.paymentLink
                                  });
                                }
                                loadOrders(currentPage, statusFilter || searchQuery);
                                
                                const smsStatus = data.smsSent 
                                  ? `SMS sent to ${data.customerPhone}` 
                                  : 'SMS not sent (no phone number)';
                                
                                toast({
                                  title: data.smsSent ? "Payment Link Sent!" : "Payment Link Generated",
                                  description: data.smsSent 
                                    ? `Customer has been texted the payment link for £${data.amount}. Link also copied to clipboard.`
                                    : `Payment link created and copied to clipboard. Share it with your customer.`
                                });
                              } else {
                                toast({
                                  title: "Error",
                                  description: data.error || "Failed to generate payment link",
                                  variant: "destructive"
                                });
                              }
                            } catch (error) {
                              toast({
                                title: "Error",
                                description: "Failed to generate payment link",
                                variant: "destructive"
                              });
                            }
                          }}
                        >
                          Send Payment Link to Customer
                        </Button>
                        
                        {selectedOrder.stripePaymentLinkUrl && (
                          <div className="bg-gray-50 p-2 rounded border">
                            <p className="text-xs text-gray-600 mb-1">Payment Link (tap to copy):</p>
                            <div 
                              className="text-xs text-blue-600 break-all cursor-pointer hover:bg-gray-100 p-1 rounded"
                              onClick={() => {
                                navigator.clipboard.writeText(selectedOrder.stripePaymentLinkUrl || '');
                                toast({ title: "Link copied!" });
                              }}
                            >
                              {selectedOrder.stripePaymentLinkUrl}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
              })()}

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

              {/* Order Timeline - Payment-aware flow */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Order Timeline</h3>
                <div className="space-y-2">
                  {/* Step 1: Initial Payment - Shows deposit details if partial payment */}
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${parseFloat(selectedOrder.amountPaid || '0') > 0 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <div>
                      <div className={`text-xs ${parseFloat(selectedOrder.amountPaid || '0') > 0 ? 'font-medium' : 'text-gray-500'}`}>
                        {(selectedOrder as any).depositPercentage && (selectedOrder as any).depositPercentage < 100 
                          ? `Deposit received (${(selectedOrder as any).depositPercentage}%)`
                          : 'Payment received'}
                      </div>
                      {parseFloat(selectedOrder.amountPaid || '0') > 0 && (
                        <div className="text-xs text-gray-500">
                          {(selectedOrder as any).depositPercentage && (selectedOrder as any).depositPercentage < 100 
                            ? `£${parseFloat((parseFloat(selectedOrder.total || '0') * ((selectedOrder as any).depositPercentage / 100)).toFixed(2)).toLocaleString()}`
                            : `£${parseFloat(selectedOrder.total || '0').toLocaleString()}`}
                          {' • '}{new Date(selectedOrder.createdAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Balance Payment - Only show if there was a deposit */}
                  {(selectedOrder as any).depositPercentage && (selectedOrder as any).depositPercentage < 100 && (
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${(selectedOrder.paymentStatus === 'paid' || parseFloat(selectedOrder.amountOutstanding || '0') <= 0) ? 'bg-green-500' : 'bg-orange-400'}`}></div>
                      <div>
                        <div className={`text-xs ${(selectedOrder.paymentStatus === 'paid' || parseFloat(selectedOrder.amountOutstanding || '0') <= 0) ? 'font-medium' : 'text-orange-600'}`}>
                          {(selectedOrder.paymentStatus === 'paid' || parseFloat(selectedOrder.amountOutstanding || '0') <= 0) 
                            ? 'Balance payment received'
                            : `Balance outstanding: £${parseFloat(selectedOrder.amountOutstanding || '0').toLocaleString()}`}
                        </div>
                        {(selectedOrder.paymentStatus === 'paid' || parseFloat(selectedOrder.amountOutstanding || '0') <= 0) && (
                          <div className="text-xs text-gray-500">
                            £{(parseFloat(selectedOrder.total || '0') - parseFloat((parseFloat(selectedOrder.total || '0') * ((selectedOrder as any).depositPercentage / 100)).toFixed(2))).toLocaleString()} • Full payment complete
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 3: Ready for Collection/Delivery */}
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${['ready_for_collection', 'fulfilled'].includes(selectedOrder.status) ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <div>
                      <div className={`text-xs ${['ready_for_collection', 'fulfilled'].includes(selectedOrder.status) ? 'font-medium' : 'text-gray-500'}`}>
                        {selectedOrder.fulfillmentType === 'pickup' ? 'Ready for Collection' : 'Ready for Delivery'}
                      </div>
                      {(selectedOrder as any).readyToCollectAt && (
                        <div className="text-xs text-gray-500">
                          {new Date((selectedOrder as any).readyToCollectAt).toLocaleDateString()} at {new Date((selectedOrder as any).readyToCollectAt).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 4: Collected/Delivered */}
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${selectedOrder.status === 'fulfilled' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <div>
                      <div className={`text-xs ${selectedOrder.status === 'fulfilled' ? 'font-medium' : 'text-gray-500'}`}>
                        {selectedOrder.fulfillmentType === 'pickup' ? 'Collected' : 'Delivered'}
                      </div>
                      {selectedOrder.status === 'fulfilled' && (selectedOrder as any).fulfilledAt && (
                        <div className="text-xs text-gray-500">
                          {new Date((selectedOrder as any).fulfilledAt).toLocaleDateString()} at {new Date((selectedOrder as any).fulfilledAt).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Refund Entry - Show if refund was processed */}
                  {parseFloat(selectedOrder.amountRefunded || '0') > 0 && (
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full mt-1.5 bg-purple-500"></div>
                      <div>
                        <div className="text-xs font-medium text-purple-700">
                          Refund processed
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatCurrency(parseFloat(selectedOrder.amountRefunded || '0'))} refunded
                          {(selectedOrder as any).refundedAt && (
                            <span> • {new Date((selectedOrder as any).refundedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cancellation Entry - Show if order was cancelled */}
                  {selectedOrder.status === 'cancelled' && (
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full mt-1.5 bg-red-500"></div>
                      <div>
                        <div className="text-xs font-medium text-red-700">
                          Order Cancelled
                        </div>
                        {selectedOrder.refundReason && (
                          <div className="text-xs text-gray-500">
                            {selectedOrder.refundReason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons or Cancelled Notice */}
              {selectedOrder.status === 'cancelled' ? (
                <div className="flex items-center justify-center py-3 border-t bg-red-50 rounded-b-lg">
                  <div className="flex items-center gap-2 text-red-700">
                    <X className="w-5 h-5" />
                    <span className="font-semibold">Order Cancelled</span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between pt-2 border-t gap-3">
                  {/* Cancel Button - Left side */}
                  {selectedOrder.status !== 'fulfilled' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (selectedOrder.items) {
                          setReturnItems(selectedOrder.items.map(item => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            sellingType: 'unit',
                            maxQty: item.quantity
                          })));
                        }
                        setShowCancelDialog(true);
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                  
                  <div className="flex gap-3 ml-auto">
                    {/* Ready for Collection Button - Only for pickup orders that aren't ready yet */}
                    {selectedOrder.fulfillmentType === 'pickup' && 
                     selectedOrder.status !== 'ready_for_collection' && 
                     selectedOrder.status !== 'fulfilled' && (
                      <Button 
                        size="sm"
                        onClick={() => markReadyForCollection(selectedOrder.id)}
                        disabled={updatingOrderId === selectedOrder.id}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        <Clock className="h-4 w-4 mr-1" />
                        {updatingOrderId === selectedOrder.id ? '...' : 'Ready for Collection'}
                      </Button>
                    )}

                    {/* Mark as Fulfilled Button */}
                    {selectedOrder.status !== 'fulfilled' && (
                      <Button 
                        size="sm"
                        onClick={() => markAsFulfilled(selectedOrder.id)}
                        disabled={updatingOrderId === selectedOrder.id}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {updatingOrderId === selectedOrder.id ? '...' : 'Fulfilled'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cancel Order {selectedOrder?.orderNumber || `#${selectedOrder?.id}`}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Cancellation Reason Dropdown */}
            <div>
              <label className="text-sm font-medium">Reason for cancellation *</label>
              <Select value={cancelReasonCategory} onValueChange={setCancelReasonCategory}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {cancellationReasons.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Additional Notes (Optional) */}
            <div>
              <label className="text-sm font-medium">Additional notes (optional)</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Add any additional details..."
                className="w-full mt-1 p-2 border rounded-md text-sm min-h-[60px]"
              />
            </div>

            {selectedOrder?.items && selectedOrder.items.length > 0 && (
              <div>
                <label className="text-sm font-medium">Items to return (adjust quantities if partial return)</label>
                <div className="mt-2 space-y-2 max-h-[150px] overflow-y-auto">
                  {returnItems.map((item, index) => {
                    const orderItem = selectedOrder.items?.find(oi => oi.productId === item.productId);
                    return (
                      <div key={item.productId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm truncate max-w-[150px]">{orderItem?.product?.name || `Product ${item.productId}`}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newItems = [...returnItems];
                              newItems[index].quantity = Math.max(0, newItems[index].quantity - 1);
                              setReturnItems(newItems);
                            }}
                          >
                            -
                          </Button>
                          <span className="text-sm w-8 text-center">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newItems = [...returnItems];
                              newItems[index].quantity = Math.min(item.maxQty, newItems[index].quantity + 1);
                              setReturnItems(newItems);
                            }}
                          >
                            +
                          </Button>
                          <span className="text-xs text-gray-500">/ {item.maxQty}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Refund Payments - Shopify Style */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Refund payments</h3>
              
              {/* Original Payment Method Option */}
              <label 
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                  refundType === 'card' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => { setRefundType('card'); setProcessRefund(true); }}
              >
                <input
                  type="radio"
                  name="refundType"
                  checked={refundType === 'card'}
                  onChange={() => { setRefundType('card'); setProcessRefund(true); }}
                  className="w-4 h-4 text-green-600 border-gray-300"
                />
                <div className="ml-3 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">Original payment method</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-600">
                      Refund {formatCurrency(parseFloat(selectedOrder?.amountPaid || selectedOrder?.total || '0'))} GBP
                    </span>
                    <div className="flex items-center gap-1">
                      <div className="w-8 h-5 bg-gradient-to-r from-red-500 to-yellow-500 rounded text-white text-[8px] font-bold flex items-center justify-center">MC</div>
                    </div>
                  </div>
                </div>
              </label>

              {/* Store Credit Option */}
              <label 
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                  refundType === 'credit' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => { setRefundType('credit'); setProcessRefund(true); }}
              >
                <input
                  type="radio"
                  name="refundType"
                  checked={refundType === 'credit'}
                  onChange={() => { setRefundType('credit'); setProcessRefund(true); }}
                  className="w-4 h-4 text-green-600 border-gray-300"
                />
                <div className="ml-3">
                  <span className="text-sm font-medium text-gray-900">Store credit</span>
                  <p className="text-xs text-gray-500 mt-0.5">Applied immediately to customer's account</p>
                </div>
              </label>

              {/* Later Option */}
              <label 
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                  refundType === 'later' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => { setRefundType('later'); setProcessRefund(false); }}
              >
                <input
                  type="radio"
                  name="refundType"
                  checked={refundType === 'later'}
                  onChange={() => { setRefundType('later'); setProcessRefund(false); }}
                  className="w-4 h-4 text-green-600 border-gray-300"
                />
                <div className="ml-3">
                  <span className="text-sm font-medium text-gray-900">Later</span>
                  <p className="text-xs text-gray-500 mt-0.5">Process refund at a different time</p>
                </div>
              </label>

              {/* Refund Timeline Info */}
              {refundType === 'card' && (
                <div className="p-2 bg-blue-50 rounded text-xs text-blue-700 flex items-center gap-2">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  Refunds typically take 5-10 business days to appear on the customer's statement.
                </div>
              )}
              
              {refundType === 'credit' && (
                <div className="p-2 bg-green-50 rounded text-xs text-green-700 flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  Store credit will be applied immediately and can be used on future orders.
                </div>
              )}
            </div>

            {/* Staff Note */}
            <div>
              <label className="text-sm font-medium">Staff note</label>
              <textarea
                value={staffNote}
                onChange={(e) => setStaffNote(e.target.value)}
                placeholder="Add internal notes (not visible to customer)..."
                className="w-full mt-1 p-2 border rounded-md text-sm min-h-[50px]"
              />
              <p className="text-xs text-gray-500 mt-1">Only you and other staff can see this note.</p>
            </div>

            {/* Checkboxes */}
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restockInventory}
                  onChange={(e) => setRestockInventory(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600"
                />
                <span className="text-sm text-gray-700">Restock inventory</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendNotification}
                  onChange={(e) => setSendNotification(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600"
                />
                <span className="text-sm text-gray-700">
                  Send a <span className="text-green-600">notification</span> to the customer
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-2 pt-3 border-t">
              <Button
                variant="destructive"
                className="w-full"
                onClick={cancelOrder}
                disabled={isCancelling || !cancelReasonCategory}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel order'}
              </Button>
              <Button 
                variant="ghost" 
                className="w-full text-gray-500"
                onClick={() => {
                  setShowCancelDialog(false);
                  setCancelReasonCategory('');
                  setCancelReason('');
                  setProcessRefund(false);
                  setRefundType('card');
                  setRestockInventory(true);
                  setSendNotification(true);
                  setStaffNote('');
                }}
              >
                Keep order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}