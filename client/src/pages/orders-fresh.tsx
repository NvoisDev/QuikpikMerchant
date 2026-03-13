import { useState, useEffect, useMemo, useRef, Fragment } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Package, DollarSign, Clock, Users, CheckCircle, X, Truck, MapPin, Camera, Image as ImageIcon, RefreshCw, Eye, FileText, UserPen, ShoppingCart, Loader2, MoreVertical } from "lucide-react";
import ElephantLoader from "@/components/ui/elephant-loader";
import PageHeader from "@/components/PageHeader";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { DynamicTooltip } from "@/components/ui/dynamic-tooltip";
import { useToast } from "@/hooks/use-toast";
import { Home, Building, Warehouse, ChevronLeft, ChevronRight } from "lucide-react";
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
  balanceDueDays?: number;
  amountPaid?: string;
  amountOutstanding?: string;
  paymentStatus?: string;
  stripePaymentLinkUrl?: string;
  wholesalerBusinessName?: string;
  amountRefunded?: string;
  refundReason?: string;
  refundedAt?: string;
  stripePaymentIntentId?: string;
  cancelledAt?: string;
  cancellationRequest?: {
    id: number;
    status: 'pending' | 'approved' | 'rejected';
    reasonCategory: string;
    reasonNotes?: string;
    requestedAt: string;
    respondedAt?: string;
    responseMessage?: string;
    refundType?: string;
  };
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
  const [isSearching, setIsSearching] = useState(false);
  const [customerIdFilter, setCustomerIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [archiveTab, setArchiveTab] = useState<'active' | 'archived' | 'all'>('active');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState('');
  const [orderStats, setOrderStats] = useState<{
    ordersCount: number;
    totalRevenue: number;
    paidOrdersCount: number;
    pendingOrdersCount: number;
    activeCount: number;
    archivedCount: number;
  } | null>(null);
  const ordersPerPage = 20;
  const { toast } = useToast();
  
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonCategory, setCancelReasonCategory] = useState('');
  const [processRefund, setProcessRefund] = useState(true);
  const [refundType, setRefundType] = useState<'card' | 'credit' | 'later'>('card');
  const [restockInventory, setRestockInventory] = useState(true);
  const [sendNotification, setSendNotification] = useState(true);
  const [staffNote, setStaffNote] = useState('');
  const [returnItems, setReturnItems] = useState<Array<{ productId: number; quantity: number; sellingType: string; maxQty: number }>>([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetryingRefund, setIsRetryingRefund] = useState(false);
  
  // Cancellation requests state
  const [cancellationRequests, setCancellationRequests] = useState<any[]>([]);
  const [showCancellationRequests, setShowCancellationRequests] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [pendingCancellationRequestId, setPendingCancellationRequestId] = useState<number | null>(null);
  
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

  const loadOrderStats = async (tab: 'active' | 'archived' | 'all' = 'active') => {
    try {
      const response = await fetch(`/api/orders/stats?archiveTab=${tab}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const stats = await response.json();
        console.log(`📊 Loaded order stats for ${tab} tab:`, stats);
        setOrderStats(stats);
      } else {
        console.error('❌ Stats API returned non-OK status:', response.status);
      }
    } catch (err) {
      console.error('❌ Failed to load order stats:', err);
    }
  };

  const customerIdRef = useRef(customerIdFilter);
  customerIdRef.current = customerIdFilter;
  const deliveryTypeRef = useRef('');
  const paymentStatusRef = useRef('');
  const statusFilterRef = useRef('');

  const loadOrders = async (page = 1, search = '', tab = archiveTab) => {
    setLoading(true);
    setError(null);
    
    try {
      const custId = customerIdRef.current;
      const params = new URLSearchParams({
        page: page.toString(),
        limit: ordersPerPage.toString(),
        archiveTab: tab,
        ...(search && { search }),
        ...(custId && { customerId: custId }),
        ...(deliveryTypeRef.current && { fulfillmentType: deliveryTypeRef.current }),
        ...(paymentStatusRef.current && { paymentStatus: paymentStatusRef.current }),
        ...(statusFilterRef.current && { status: statusFilterRef.current }),
      });
      const response = await fetch(`/api/orders-paginated?${params}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Loaded ${data.orders.length} orders successfully (page ${page} of ${data.totalPages})`);
        // Log order statuses for debugging
        const statusCounts: Record<string, number> = {};
        data.orders.forEach((o: any) => {
          const status = o.status || 'null';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        console.log(`📋 Order statuses on this page:`, statusCounts);
        
        setOrders(data.orders);
        setTotalOrders(data.total);
        setTotalPages(data.totalPages);
        setCurrentPage(page);
        // Use stats from paginated response (more reliable than separate API call)
        if (data.stats) {
          console.log(`📊 Got stats from paginated response:`, data.stats);
          setOrderStats(data.stats);
        }
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
    const urlParams = new URLSearchParams(window.location.search);

    const customerIdParam = urlParams.get('customerId');
    const searchParam = urlParams.get('search');

    const initialTab = customerIdParam ? 'all' : 'active';
    if (customerIdParam) {
      setCustomerIdFilter(customerIdParam);
      customerIdRef.current = customerIdParam;
      setArchiveTab('all');
    }
    if (searchParam) {
      setSearchQuery(searchParam);
    }

    const orderId = urlParams.get('id');
    if (orderId) {
      fetch(`/api/orders/${orderId}`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })
        .then(response => response.ok ? response.json() : null)
        .then(orderData => {
          if (orderData) {
            setSelectedOrder(orderData);
          }
        })
        .catch(err => console.error('Failed to load order from URL:', err));
    }

    loadCancellationRequests();
    if (!customerIdParam) {
      loadOrderStats(initialTab as any);
    }
    loadOrders(1, searchParam || '', initialTab as any);
  }, []);

  const isInitialMount = useRef(true);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(() => {
      loadOrders(1, searchQuery).finally(() => setIsSearching(false));
    }, 400);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Load cancellation requests
  const loadCancellationRequests = async () => {
    try {
      const response = await fetch('/api/cancellation-requests?status=pending', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        setCancellationRequests(data);
      }
    } catch (error) {
      console.error('Failed to load cancellation requests:', error);
    }
  };

  // Approve cancellation request - opens the cancel dialog for refund selection
  const approveCancellationRequest = (requestId: number) => {
    const request = cancellationRequests.find(r => r.id === requestId);
    if (!request) return;
    
    // Find the order for this request
    const order = orders.find(o => o.id === request.orderId);
    if (!order) {
      // Need to load the order first
      fetch(`/api/orders/${request.orderId}`, {
        credentials: 'include'
      })
        .then(res => res.json())
        .then(orderData => {
          setupCancellationDialog(orderData, request, requestId);
        })
        .catch(() => {
          toast({
            title: "Error",
            description: "Could not load order details",
            variant: "destructive"
          });
        });
    } else {
      setupCancellationDialog(order, request, requestId);
    }
  };

  // Helper to setup the cancel dialog from a cancellation request
  const setupCancellationDialog = (order: Order, request: any, requestId: number) => {
    setSelectedOrder(order);
    setPendingCancellationRequestId(requestId);
    
    // Pre-fill the reason from customer's request
    setCancelReasonCategory('customer_request');
    setCancelReason(`Customer request: ${request.reasonCategory.replace(/_/g, ' ')}${request.reasonNotes ? ` - ${request.reasonNotes}` : ''}`);
    
    // Set up return items if order has items
    if (order.items && order.items.length > 0) {
      setReturnItems(order.items.map((item: OrderItem) => ({
        productId: item.productId,
        quantity: item.quantity,
        sellingType: (item as any).sellingType || 'units',
        maxQty: item.quantity
      })));
    }
    
    // Default refund settings
    setProcessRefund(true);
    setRefundType('card');
    setRestockInventory(true);
    setSendNotification(true);
    
    // Open the cancel form
    setShowCancelForm(true);
  };

  // Reject cancellation request
  const rejectCancellationRequest = async (requestId: number, reason: string) => {
    setProcessingRequestId(requestId);
    try {
      const response = await fetch(`/api/cancellation-requests/${requestId}/respond`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: false, responseMessage: reason })
      });
      
      if (response.ok) {
        toast({
          title: "Request Rejected",
          description: "The customer will be notified.",
        });
        loadCancellationRequests();
        setShowRejectDialog(false);
        setRejectReason('');
        setSelectedRequestId(null);
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || "Failed to reject request",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to reject request:', error);
      toast({
        title: "Error",
        description: "Failed to process request",
        variant: "destructive"
      });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    statusFilterRef.current = status;
    setCurrentPage(1);
    loadOrders(1, searchQuery);
  };

  const handlePageChange = (newPage: number) => {
    loadOrders(newPage, searchQuery);
  };

  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [];
    if (currentPage <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(totalPages);
    } else if (currentPage >= totalPages - 3) {
      pages.push(1);
      pages.push('...');
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push('...');
      pages.push(currentPage - 1);
      pages.push(currentPage);
      pages.push(currentPage + 1);
      pages.push('...');
      pages.push(totalPages);
    }
    return pages;
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
        
        // If this was from a pending cancellation request, mark it as approved
        if (pendingCancellationRequestId) {
          try {
            await fetch(`/api/cancellation-requests/${pendingCancellationRequestId}/respond`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                approved: true, 
                refundType: processRefund && refundType !== 'later' ? refundType : 'later',
                responseMessage: 'Order cancelled and processed via wholesaler dashboard'
              })
            });
            loadCancellationRequests();
          } catch (e) {
            console.log('Note: Could not update cancellation request status');
          }
        }

        if (data.refundFailed) {
          toast({
            title: pendingCancellationRequestId ? "Cancellation Approved" : "Order Cancelled",
            description: `Order cancelled but the card refund failed — use "Retry Refund" in the order detail to resend it to Stripe.`,
            variant: "destructive",
          });
        } else {
          const refundMessage = processRefund && refundType !== 'later'
            ? refundType === 'card' 
              ? ' A refund has been initiated and will appear on the customer\'s statement within 5-10 business days.'
              : ' Store credit has been applied to the customer\'s account.'
            : refundType === 'later' ? ' Refund will be processed separately.' : '';
          toast({
            title: pendingCancellationRequestId ? "Cancellation Approved" : "Order Cancelled",
            description: `The order has been successfully cancelled.${refundMessage}`,
          });
        }
        const updatedOrder = data.order || { ...selectedOrder, status: 'cancelled' };
        setOrders(orders.map(order => 
          order.id === selectedOrder.id ? { ...order, ...updatedOrder } : order
        ));
        setSelectedOrder(updatedOrder);
        setShowCancelForm(false);
        setCancelReason('');
        setCancelReasonCategory('');
        setProcessRefund(true);
        setRefundType('card');
        setReturnItems([]);
        setRestockInventory(true);
        setSendNotification(true);
        setStaffNote('');
        setPendingCancellationRequestId(null);
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

  // Retry a pending Stripe refund
  const retryRefund = async (orderId: number) => {
    setIsRetryingRefund(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/retry-refund`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: "Refund Sent", description: data.message });
        if (data.order) {
          setSelectedOrder(data.order);
          setOrders(orders.map(o => o.id === orderId ? { ...o, ...data.order } : o));
        }
        loadOrders(currentPage, statusFilter || searchQuery);
      } else {
        toast({
          title: "Refund Failed",
          description: data.error || data.message || "Stripe refund failed — check Stripe dashboard",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({ title: "Error", description: "Network error — please try again", variant: "destructive" });
    } finally {
      setIsRetryingRefund(false);
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

  // Quick-open the cancel form from the dropdown (without a full modal fetch)
  const openCancelForm = (order: Order) => {
    setSelectedOrder(order);
    setCancelReasonCategory('');
    setCancelReason('');
    setProcessRefund(false);
    setRestockInventory(true);
    setSendNotification(true);
    setReturnItems([]);
    setShowCancelForm(true);
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
    const deliveryCost = parseFloat(order.deliveryCost || '0');
    const actualPlatformFee = parseFloat(order.platformFee || '0');
    // Use the actual platform fee from database if available, otherwise calculate 3.3% of subtotal + delivery
    const feeToDeduct = actualPlatformFee > 0 ? actualPlatformFee : (subtotal + deliveryCost) * 0.033;
    return (subtotal + deliveryCost) - feeToDeduct;
  };

  // Helper function to determine if an order should be archived
  // Archived = cancelled OR (fulfilled AND fully paid)
  // Active = everything else (including part paid fulfilled orders with outstanding balance)
  const isArchivedOrder = (order: Order) => {
    const status = (order.status || '').toLowerCase();
    const paymentStatus = (order.paymentStatus || '').toLowerCase();
    
    // Cancelled orders are always archived
    if (status === 'cancelled') return true;
    
    // Fulfilled orders are archived ONLY if fully paid
    if (status === 'fulfilled' && paymentStatus === 'paid') return true;
    
    // Everything else stays in active (including part paid fulfilled orders)
    return false;
  };
  
  // Orders are already filtered by active/archived tab on the server
  // Apply status filter client-side if selected - with null safety
  const UNFULFILLED_STATUSES = ['pending', 'paid', 'confirmed', 'processing'];
  const filteredByStatus = statusFilter
    ? orders.filter(o => {
        const s = (o.status || '').toLowerCase();
        if (statusFilter === 'unfulfilled') return UNFULFILLED_STATUSES.includes(s);
        return s === statusFilter.toLowerCase();
      })
    : orders;
  
  // Payment and delivery type filters are now applied server-side via loadOrders params
  const filteredByPayment = filteredByStatus;
  const filteredByDelivery = filteredByPayment;
  
  // Apply date range filter (archive tab only)
  const filteredByDate = dateRangeFilter
    ? filteredByDelivery.filter(o => {
        if (!o.createdAt) return true;
        const orderDate = new Date(o.createdAt);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
        switch (dateRangeFilter) {
          case '7': return daysDiff <= 7;
          case '30': return daysDiff <= 30;
          case '90': return daysDiff <= 90;
          default: return true;
        }
      })
    : filteredByDelivery;
  
  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const orderDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - orderDay.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-GB', { weekday: 'long' });
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const displayedOrders = filteredByDate.length;
  // Net Revenue excludes cancelled orders (they represent £0 actual revenue) - with null safety
  const totalValue = filteredByDate
    .filter(o => (o.status || '').toLowerCase() !== 'cancelled')
    .reduce((sum, order) => sum + calculateNetAmount(order), 0);
  // Stats reflect the current tab's orders - with null safety
  const paidOrders = filteredByDate.filter(o => (o.status || '') === 'paid').length;
  const unfulfilledOrders = filteredByDate.filter(o => UNFULFILLED_STATUSES.includes((o.status || '').toLowerCase())).length;
  
  // Tab badge counts come from server stats (accurate across all pages)
  const activeCount = orderStats?.activeCount ?? 0;
  const archivedCount = orderStats?.archivedCount ?? 0;

  // Show full-screen loading only on the very first page load (no orders yet)
  if (authLoading || (loading && orders.length === 0 && !searchQuery)) {
    return (
      <div className="flex items-center justify-center h-64">
        <ElephantLoader message="Loading your orders..." />
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
    <div className="bg-white min-h-screen">
    <PageHeader title="Orders" description="View and manage all your customer orders">
      <span className="text-xs text-gray-500 whitespace-nowrap hidden sm:inline">
        {statusFilter ? (
          <>Showing {displayedOrders} {statusFilter}</>
        ) : (
          <>Showing {totalOrders} {archiveTab === 'archived' ? 'archived ' : archiveTab === 'all' ? '' : 'active '}orders</>
        )}
      </span>
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
    </PageHeader>
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* Archive Tabs */}
      <div className="flex border-b border-gray-200">
        {customerIdFilter && (
          <button
            onClick={() => { setArchiveTab('all'); deliveryTypeRef.current = ''; paymentStatusRef.current = ''; statusFilterRef.current = ''; setStatusFilter(''); setPaymentStatusFilter(''); setDeliveryTypeFilter(''); setDateRangeFilter(''); loadOrders(1, searchQuery, 'all'); if (!customerIdFilter) loadOrderStats('all'); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              archiveTab === 'all'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            All Orders
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
              {orderStats ? (orderStats.activeCount + orderStats.archivedCount) : '...'}
            </span>
          </button>
        )}
        <button
          onClick={() => { setArchiveTab('active'); deliveryTypeRef.current = ''; paymentStatusRef.current = ''; statusFilterRef.current = ''; setStatusFilter(''); setPaymentStatusFilter(''); setDeliveryTypeFilter(''); setDateRangeFilter(''); loadOrders(1, searchQuery, 'active'); if (!customerIdFilter) loadOrderStats('active'); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            archiveTab === 'active'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Active Orders
          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
            {orderStats?.activeCount ?? '...'}
          </span>
        </button>
        <button
          onClick={() => { setArchiveTab('archived'); deliveryTypeRef.current = ''; paymentStatusRef.current = ''; statusFilterRef.current = ''; setStatusFilter(''); setPaymentStatusFilter(''); setDeliveryTypeFilter(''); setDateRangeFilter(''); loadOrders(1, searchQuery, 'archived'); if (!customerIdFilter) loadOrderStats('archived'); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            archiveTab === 'archived'
              ? 'border-green-600 text-green-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Archived
          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
            {orderStats?.archivedCount ?? '...'}
          </span>
        </button>
      </div>

      {/* Search and Filter - stacks on mobile */}
      <div className="flex flex-col gap-2 sm:gap-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, phone, or order..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                setIsSearching(true);
                loadOrders(1, searchQuery).finally(() => setIsSearching(false));
              }
            }}
            className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 pr-8"
          />
          {isSearching && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 animate-spin" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select 
            className="flex-1 min-w-[120px] sm:flex-none px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            {archiveTab === 'active' ? (
              <>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="ready_for_collection">Ready for Collection</option>
              </>
            ) : (
              <>
                <option value="cancelled">Cancelled</option>
                <option value="fulfilled">Fulfilled</option>
              </>
            )}
          </select>
          
          <select 
            className="flex-1 min-w-[110px] sm:flex-none px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            value={paymentStatusFilter}
            onChange={(e) => { paymentStatusRef.current = e.target.value; setPaymentStatusFilter(e.target.value); loadOrders(1, searchQuery); }}
          >
            <option value="">All Payment</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="part_paid">Part-paid</option>
          </select>
          
          <select 
            className="flex-1 min-w-[100px] sm:flex-none px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            value={deliveryTypeFilter}
            onChange={(e) => { deliveryTypeRef.current = e.target.value; setDeliveryTypeFilter(e.target.value); loadOrders(1, searchQuery); }}
          >
            <option value="">All Type</option>
            <option value="pickup">Collection</option>
            <option value="delivery">Delivery</option>
          </select>
          
          <select 
            className="flex-1 min-w-[110px] sm:flex-none px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            value={dateRangeFilter}
            onChange={(e) => setDateRangeFilter(e.target.value)}
          >
            <option value="">All Time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          
          {(searchQuery || statusFilter || paymentStatusFilter || deliveryTypeFilter || dateRangeFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                deliveryTypeRef.current = '';
                paymentStatusRef.current = '';
                statusFilterRef.current = '';
                handleSearch('');
                setStatusFilter('');
                setPaymentStatusFilter('');
                setDeliveryTypeFilter('');
                setDateRangeFilter('');
                loadOrders(1, '');
              }}
              className="text-sm whitespace-nowrap"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards - only show on Active tab */}
      {archiveTab === 'active' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {user?.role !== 'team_member' && (
            <div className="rounded-lg bg-green-50 px-3 py-2">
              <p className="text-[11px] font-medium text-green-700">Net Revenue</p>
              <p className="text-sm font-bold text-green-800">{formatCurrency(orderStats?.totalRevenue ?? totalValue)}</p>
            </div>
          )}
          {user?.role !== 'team_member' && (
            <div className="rounded-lg bg-blue-50 px-3 py-2">
              <p className="text-[11px] font-medium text-blue-700">Paid Orders</p>
              <p className="text-sm font-bold text-blue-800">{orderStats?.paidOrdersCount ?? paidOrders}</p>
            </div>
          )}
          <div className="rounded-lg bg-yellow-50 px-3 py-2">
            <p className="text-[11px] font-medium text-yellow-700">Active Orders</p>
            <p className="text-sm font-bold text-yellow-800">{orderStats?.ordersCount ?? displayedOrders}</p>
          </div>
          <div className="rounded-lg bg-orange-50 px-3 py-2">
            <p className="text-[11px] font-medium text-orange-700">Unfulfilled</p>
            <p className="text-sm font-bold text-orange-800">{unfulfilledOrders}</p>
          </div>
        </div>
      )}

      {/* Cancellation Requests Alert */}
      {cancellationRequests.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-orange-800">
                <Clock className="h-4 w-4" />
                {cancellationRequests.length} Pending Cancellation Request{cancellationRequests.length > 1 ? 's' : ''}
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowCancellationRequests(!showCancellationRequests)}
                className="text-orange-700 border-orange-300 hover:bg-orange-100"
              >
                {showCancellationRequests ? 'Hide' : 'Review Requests'}
              </Button>
            </div>
          </CardHeader>
          {showCancellationRequests && (
            <CardContent className="pt-0">
              <div className="space-y-3">
                {cancellationRequests.map((request) => (
                  <div key={request.id} className="bg-white rounded-lg p-4 border border-orange-200">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-gray-900">
                            Order {request.order?.orderNumber || `#${request.orderId}`}
                          </span>
                          <Badge className="bg-orange-100 text-orange-800 text-xs">
                            {formatCurrency(parseFloat(request.order?.total || '0'))}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p><span className="font-medium">Customer:</span> {request.customer?.firstName} {request.customer?.lastName || request.customer?.phoneNumber}</p>
                          <p><span className="font-medium">Reason:</span> {request.reasonCategory?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</p>
                          {request.reasonNotes && (
                            <p><span className="font-medium">Notes:</span> {request.reasonNotes}</p>
                          )}
                          <p className="text-xs text-gray-500">
                            Requested: {new Date(request.requestedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                          disabled={processingRequestId === request.id}
                          onClick={() => {
                            setSelectedRequestId(request.id);
                            setShowRejectDialog(true);
                          }}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          disabled={processingRequestId === request.id}
                          onClick={() => approveCancellationRequest(request.id)}
                        >
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Review & Approve
                          </>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Reject Cancellation Request Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Cancellation Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-600">
              Please provide a reason for rejecting this cancellation request. The customer will be notified.
            </p>
            <textarea
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full min-h-[100px] p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setShowRejectDialog(false);
                setRejectReason('');
                setSelectedRequestId(null);
              }}>
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={!rejectReason.trim() || processingRequestId !== null}
                onClick={() => selectedRequestId && rejectCancellationRequest(selectedRequestId, rejectReason)}
              >
                Reject Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredByDate.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">
                {archiveTab === 'archived' 
                  ? 'No archived orders found' 
                  : 'No active orders found'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {archiveTab === 'archived' 
                  ? 'Cancelled and fulfilled orders will appear here' 
                  : 'Orders that are pending, processing, or shipped will appear here'}
              </p>
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
                  {filteredByDate.slice(0, 50).map((order, index, arr) => {
                    const currentLabel = order.createdAt ? getDateLabel(order.createdAt) : '';
                    const prevLabel = index > 0 && arr[index - 1].createdAt ? getDateLabel(arr[index - 1].createdAt) : '';
                    const showSeparator = index === 0 || currentLabel !== prevLabel;
                    return (
                      <Fragment key={order.id}>
                        {showSeparator && (
                          <TableRow className="bg-gray-50 hover:bg-gray-50">
                            <TableCell colSpan={6} className="py-2 px-4">
                              <span className="text-xs font-semibold text-gray-500">{currentLabel}</span>
                            </TableCell>
                          </TableRow>
                        )}
                    <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => loadOrderDetails(order)}>
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
                          {(() => {
                            const refAmt = parseFloat(order.amountRefunded || '0');
                            const paidAmt = parseFloat(order.amountPaid || '0');
                            if (refAmt > 0 && (order.status === 'cancelled' || refAmt >= paidAmt)) {
                              return <Badge className="bg-purple-100 text-purple-800 text-xs">{order.refundedAt ? 'Refunded' : 'Refund Pending'}</Badge>;
                            } else if (refAmt > 0 && refAmt < paidAmt) {
                              return <Badge className="bg-amber-100 text-amber-800 text-xs">{order.refundedAt ? 'Partial Refund' : 'Partial Refund Pending'}</Badge>;
                            } else if ((order.paymentStatus || '').toLowerCase() === 'paid') {
                              return <Badge className="bg-green-100 text-green-800 text-xs">Paid</Badge>;
                            } else if ((order.paymentStatus || '').toLowerCase() === 'part_paid') {
                              return <Badge className="bg-orange-100 text-orange-800 text-xs">Part Paid</Badge>;
                            } else {
                              return <Badge className="bg-red-100 text-red-800 text-xs">Unpaid</Badge>;
                            }
                          })()}
                          {order.status === 'fulfilled' ? (
                            <Badge className="bg-blue-100 text-blue-800 text-xs">Fulfilled</Badge>
                          ) : order.status === 'ready_for_collection' ? (
                            <Badge className="bg-yellow-100 text-yellow-800 text-xs">Ready</Badge>
                          ) : order.status === 'cancelled' ? (
                            <Badge className="bg-red-100 text-red-800 text-xs">Cancelled</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800 text-xs">Unfulfilled</Badge>
                          )}
                          {order.isQuote ? (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200" title="Quote Order (created by you)">
                              <UserPen className="w-3 h-3" />
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200" title="Online Order (placed by customer)">
                              <ShoppingCart className="w-3 h-3" />
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
                        {(() => {
                          const refAmt = parseFloat(order.amountRefunded || '0');
                          const paidAmt = parseFloat(order.amountPaid || '0');
                          if (refAmt > 0 && (order.status === 'cancelled' || refAmt >= paidAmt)) {
                            return <Badge className="bg-purple-100 text-purple-800 text-xs"><CheckCircle className="w-2 h-2 mr-1" />{order.refundedAt ? 'Refunded' : 'Refund Pending'}</Badge>;
                          } else if (refAmt > 0 && refAmt < paidAmt) {
                            return <Badge className="bg-amber-100 text-amber-800 text-xs"><CheckCircle className="w-2 h-2 mr-1" />{order.refundedAt ? 'Partial Refund' : 'Partial Refund Pending'}</Badge>;
                          }
                          return null;
                        })()}
                        {order.status === 'fulfilled' ? (
                          <Badge className="bg-blue-100 text-blue-800 text-xs">
                            <CheckCircle className="w-2 h-2 mr-1" />
                            Fulfilled
                          </Badge>
                        ) : order.status === 'cancelled' ? (
                          <span className="text-red-400 text-xs">—</span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={updatingOrderId === order.id}
                                onClick={(e) => e.stopPropagation()}
                                className="h-7 w-7 p-0"
                              >
                                {updatingOrderId === order.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <MoreVertical className="h-3 w-3" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {order.status !== 'ready_for_collection' && (
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); markReadyForCollection(order.id); }}
                                  className="text-orange-600 focus:text-orange-700 cursor-pointer"
                                >
                                  <CheckCircle className="h-3.5 w-3.5 mr-2" />
                                  Mark Ready
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); markAsFulfilled(order.id); }}
                                className="text-blue-600 focus:text-blue-700 cursor-pointer"
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-2" />
                                Mark Fulfilled
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); openCancelForm(order); }}
                                className="text-red-600 focus:text-red-700 cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5 mr-2" />
                                Cancel Order
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        <div className="flex items-center justify-between">
                          <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                          <Eye className="h-4 w-4 text-gray-400" />
                        </div>
                      </TableCell>
                    </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
              
              {/* Mobile Cards */}
              <div className="lg:hidden space-y-3">
                {filteredByStatus.slice(0, 50).map((order, index, arr) => {
                  const currentLabel = order.createdAt ? getDateLabel(order.createdAt) : '';
                  const prevLabel = index > 0 && arr[index - 1].createdAt ? getDateLabel(arr[index - 1].createdAt) : '';
                  const showSeparator = index === 0 || currentLabel !== prevLabel;
                  return (
                    <div key={order.id}>
                      {showSeparator && (
                        <div className="py-2 px-1 border-b border-gray-200 mb-3">
                          <span className="text-xs font-semibold text-gray-500">{currentLabel}</span>
                        </div>
                      )}
                  <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadOrderDetails(order)}>
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
                        {(() => {
                          const refAmt = parseFloat(order.amountRefunded || '0');
                          const paidAmt = parseFloat(order.amountPaid || '0');
                          if (refAmt > 0 && (order.status === 'cancelled' || refAmt >= paidAmt)) {
                            return <Badge className="bg-purple-100 text-purple-800 text-xs">{order.refundedAt ? 'Refunded' : 'Refund Pending'}</Badge>;
                          } else if (refAmt > 0 && refAmt < paidAmt) {
                            return <Badge className="bg-amber-100 text-amber-800 text-xs">{order.refundedAt ? 'Partial Refund' : 'Partial Refund Pending'}</Badge>;
                          } else if ((order.paymentStatus || '').toLowerCase() === 'paid') {
                            return <Badge className="bg-green-100 text-green-800 text-xs">Paid</Badge>;
                          } else if ((order.paymentStatus || '').toLowerCase() === 'part_paid') {
                            return <Badge className="bg-orange-100 text-orange-800 text-xs">Part Paid</Badge>;
                          } else {
                            return <Badge className="bg-red-100 text-red-800 text-xs">Unpaid</Badge>;
                          }
                        })()}
                        {order.status === 'fulfilled' ? (
                          <Badge className="bg-blue-100 text-blue-800 text-xs">Fulfilled</Badge>
                        ) : order.status === 'ready_for_collection' ? (
                          <Badge className="bg-yellow-100 text-yellow-800 text-xs">Ready</Badge>
                        ) : order.status === 'cancelled' ? (
                          <Badge className="bg-red-100 text-red-800 text-xs">Cancelled</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-800 text-xs">Unfulfilled</Badge>
                        )}
                        {order.isQuote ? (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200" title="Quote Order (created by you)">
                            <UserPen className="w-3 h-3" />
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200" title="Online Order (placed by customer)">
                            <ShoppingCart className="w-3 h-3" />
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingOrderId === order.id}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs w-full flex items-center justify-center gap-1.5"
                            >
                              {updatingOrderId === order.id
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Updating...</>
                                : <><MoreVertical className="h-3 w-3" /> Actions</>}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {order.status !== 'ready_for_collection' && (
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); markReadyForCollection(order.id); }}
                                className="text-orange-600 focus:text-orange-700 cursor-pointer"
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-2" />
                                Mark Ready
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); markAsFulfilled(order.id); }}
                              className="text-blue-600 focus:text-blue-700 cursor-pointer"
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-2" />
                              Mark Fulfilled
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); openCancelForm(order); }}
                              className="text-red-600 focus:text-red-700 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5 mr-2" />
                              Cancel Order
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </CardContent>
                  </Card>
                    </div>
                  );
                })}
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col items-center gap-2 px-4 py-3 border-t">
                  <div className="text-xs text-gray-500">
                    Page {currentPage} of {totalPages} • {totalOrders} total orders
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {getPageNumbers().map((page, idx) =>
                      page === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-1 text-gray-400 text-sm select-none">...</span>
                      ) : (
                        <Button
                          key={page}
                          size="sm"
                          variant={page === currentPage ? 'default' : 'outline'}
                          onClick={() => handlePageChange(page as number)}
                          className={`h-8 w-8 p-0 text-xs ${page === currentPage ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : ''}`}
                        >
                          {page}
                        </Button>
                      )
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Order Details Modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => { setSelectedOrder(null); setShowCancelForm(false); }}>
        <DialogContent className="order-detail-mobile-fullscreen sm:max-w-lg sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 [&>button]:hidden">
          <DialogHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                {showCancelForm ? (
                  <DialogTitle className="text-lg font-semibold">Cancel Order {selectedOrder?.orderNumber || `#${selectedOrder?.id}`}</DialogTitle>
                ) : (
                  <>
                    <DialogTitle className="text-lg font-semibold">Order {selectedOrder?.orderNumber || `#${selectedOrder?.id}`}</DialogTitle>
                    <p className="text-sm text-gray-500">Order ID: {selectedOrder?.id}</p>
                  </>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedOrder(null); setShowCancelForm(false); }}>
                Close
              </Button>
            </div>
          </DialogHeader>

          {selectedOrder && (
            showCancelForm ? (
              <div className="space-y-4 text-sm">
                {/* Cancellation Reason */}
                <div>
                  <label className="text-sm font-medium">Reason for cancellation *</label>
                  <select
                    value={cancelReasonCategory}
                    onChange={(e) => setCancelReasonCategory(e.target.value)}
                    className="w-full mt-1 p-2 border rounded-md text-sm bg-white"
                  >
                    <option value="">Select a reason...</option>
                    {cancellationReasons.map((reason) => (
                      <option key={reason.value} value={reason.value}>{reason.label}</option>
                    ))}
                  </select>
                  {!cancelReasonCategory && (
                    <p className="text-xs text-amber-600 mt-1">Please select a reason to continue</p>
                  )}
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="text-sm font-medium">Additional notes (optional)</label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Add any additional details..."
                    className="w-full mt-1 p-2 border rounded-md text-sm min-h-[60px]"
                  />
                </div>

                {/* Items to return */}
                {selectedOrder?.items && selectedOrder.items.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Items to return (adjust for partial return)</label>
                    <div className="mt-2 space-y-2">
                      {returnItems.map((item, index) => {
                        const orderItem = selectedOrder.items?.find(oi => oi.productId === item.productId);
                        return (
                          <div key={item.productId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <span className="text-sm truncate max-w-[140px]">{orderItem?.product?.name || `Product ${item.productId}`}</span>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => {
                                const newItems = [...returnItems];
                                newItems[index].quantity = Math.max(0, newItems[index].quantity - 1);
                                setReturnItems(newItems);
                              }}>-</Button>
                              <span className="text-sm w-8 text-center">{item.quantity}</span>
                              <Button variant="outline" size="sm" onClick={() => {
                                const newItems = [...returnItems];
                                newItems[index].quantity = Math.min(item.maxQty, newItems[index].quantity + 1);
                                setReturnItems(newItems);
                              }}>+</Button>
                              <span className="text-xs text-gray-500">/ {item.maxQty}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Refund payments */}
                {(() => {
                  const totalPaid = parseFloat(selectedOrder?.amountPaid || '0');
                  const calculatedRefund = returnItems.length > 0
                    ? Math.min(
                        returnItems.reduce((sum, ri) => {
                          const oi = selectedOrder?.items?.find(i => i.productId === ri.productId);
                          return sum + (ri.quantity * parseFloat(oi?.unitPrice || '0'));
                        }, 0),
                        totalPaid
                      )
                    : totalPaid;
                  const isPartial = returnItems.some(ri => ri.quantity < ri.maxQty);
                  return (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">Refund payments</h3>
                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${refundType === 'card' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`} onClick={() => { setRefundType('card'); setProcessRefund(true); }}>
                    <input type="radio" name="refundType" checked={refundType === 'card'} onChange={() => { setRefundType('card'); setProcessRefund(true); }} className="w-4 h-4 text-green-600" />
                    <div className="ml-3 flex-1">
                      <span className="text-sm font-medium">Original payment method</span>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-gray-500">Refund {formatCurrency(calculatedRefund)} GBP to card</p>
                        {isPartial && <span className="text-xs text-amber-600 font-medium">(partial refund)</span>}
                      </div>
                    </div>
                  </label>
                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${refundType === 'later' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`} onClick={() => { setRefundType('later'); setProcessRefund(false); }}>
                    <input type="radio" name="refundType" checked={refundType === 'later'} onChange={() => { setRefundType('later'); setProcessRefund(false); }} className="w-4 h-4 text-green-600" />
                    <div className="ml-3">
                      <span className="text-sm font-medium">Later</span>
                      <p className="text-xs text-gray-500 mt-0.5">Process refund at a different time</p>
                    </div>
                  </label>
                </div>
                  );
                })()}

                {/* Staff Note */}
                <div>
                  <label className="text-sm font-medium">Staff note (optional)</label>
                  <textarea value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder="Internal notes — not visible to customer..." className="w-full mt-1 p-2 border rounded-md text-sm min-h-[50px]" />
                </div>

                {/* Checkboxes */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={restockInventory} onChange={(e) => setRestockInventory(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-600" />
                    <span className="text-sm text-gray-700">Restock inventory</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={sendNotification} onChange={(e) => setSendNotification(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-600" />
                    <span className="text-sm text-gray-700">Send a <span className="text-green-600">notification</span> to the customer</span>
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-3 border-t">
                  <Button variant="destructive" className="w-full" onClick={cancelOrder} disabled={isCancelling || !cancelReasonCategory}>
                    {isCancelling ? 'Cancelling...' : 'Cancel order'}
                  </Button>
                  <Button variant="ghost" className="w-full text-gray-500" onClick={() => {
                    setShowCancelForm(false);
                    setCancelReasonCategory('');
                    setCancelReason('');
                    setProcessRefund(false);
                    setRefundType('card');
                    setRestockInventory(true);
                    setSendNotification(true);
                    setStaffNote('');
                    setPendingCancellationRequestId(null);
                  }}>
                    ← Back to order
                  </Button>
                </div>
              </div>
            ) : (
            <div className="space-y-4 text-sm">
              {/* Status & Fulfillment */}
              <div>
                <h3 className="font-medium mb-2 text-sm">Status & Fulfillment</h3>
                <div className="flex gap-2 flex-wrap">
                  {(selectedOrder.paymentStatus || '').toLowerCase() === 'paid' ? (
                    <Badge className="bg-green-100 text-green-800 text-xs px-2 py-1">Paid</Badge>
                  ) : (selectedOrder.paymentStatus || '').toLowerCase() === 'part_paid' ? (
                    <Badge className="bg-orange-100 text-orange-800 text-xs px-2 py-1">Part Paid</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800 text-xs px-2 py-1">Unpaid</Badge>
                  )}
                  {selectedOrder.status === 'fulfilled' ? (
                    <Badge className="bg-blue-100 text-blue-800 text-xs px-2 py-1">Fulfilled</Badge>
                  ) : selectedOrder.status === 'ready_for_collection' ? (
                    <Badge className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1">Ready</Badge>
                  ) : selectedOrder.status === 'cancelled' ? (
                    <Badge className="bg-red-100 text-red-800 text-xs px-2 py-1">Cancelled</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-800 text-xs px-2 py-1">Unfulfilled</Badge>
                  )}
                  {parseFloat(selectedOrder.amountRefunded || '0') > 0 && selectedOrder.status !== 'cancelled' && (
                    selectedOrder.refundedAt
                      ? <Badge className="bg-purple-100 text-purple-800 text-xs px-2 py-1">Partially Refunded</Badge>
                      : <Badge className="bg-amber-100 text-amber-800 text-xs px-2 py-1">Refund Pending</Badge>
                  )}
                  {parseFloat(selectedOrder.amountRefunded || '0') > 0 && selectedOrder.status === 'cancelled' && (
                    selectedOrder.refundedAt
                      ? <Badge className="bg-purple-100 text-purple-800 text-xs px-2 py-1">Refunded</Badge>
                      : <Badge className="bg-amber-100 text-amber-800 text-xs px-2 py-1">Refund Pending</Badge>
                  )}
                  {selectedOrder.fulfillmentType && (
                    <Badge variant="outline" className="text-xs px-2 py-1">
                      {selectedOrder.fulfillmentType === 'delivery' ? (
                        <><Truck className="w-3 h-3 mr-1" />Delivery</>
                      ) : (
                        <><MapPin className="w-3 h-3 mr-1" />Collection</>
                      )}
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
                        {(item as any).appliedOfferLabel && (
                          <span className="inline-flex items-center text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full mt-0.5">
                            🎁 {(item as any).appliedOfferLabel}
                          </span>
                        )}
                        {((item as any).freeItems || 0) > 0 && (
                          <span className="inline-flex items-center text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full mt-0.5 ml-1">
                            +{(item as any).freeItems} free
                          </span>
                        )}
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
                    <span>Products:</span>
                    <span>{formatCurrency(parseFloat(selectedOrder.subtotal || '0'))}</span>
                  </div>
                  {parseFloat(selectedOrder.deliveryCost || '0') > 0 && (
                    <div className="flex justify-between text-blue-700">
                      <span>Delivery:</span>
                      <span>{formatCurrency(parseFloat(selectedOrder.deliveryCost || '0'))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-red-600">
                    <span>Platform Fee (3.3%):</span>
                    <span>-{formatCurrency(parseFloat(selectedOrder.platformFee || '0') || (parseFloat(selectedOrder.subtotal || '0') + parseFloat(selectedOrder.deliveryCost || '0')) * 0.033)}</span>
                  </div>
                  {parseFloat(selectedOrder.amountRefunded || '0') > 0 && (() => {
                    const wholesalerTotal = calculateNetAmount(selectedOrder);
                    const amountPaid = parseFloat(selectedOrder.amountPaid || '0');
                    const amountRefunded = parseFloat(selectedOrder.amountRefunded || '0');
                    const refundProportion = amountPaid > 0 ? Math.min(amountRefunded / amountPaid, 1) : 1;
                    const wholesalerRefund = wholesalerTotal * refundProportion;
                    const isPartialRefund = refundProportion < 0.999;
                    return (
                      <div className="flex justify-between text-purple-600">
                        <span>{isPartialRefund ? 'Partial Refund:' : 'Refunded:'}</span>
                        <span>-{formatCurrency(wholesalerRefund)}</span>
                      </div>
                    );
                  })()}
                  <div className="border-t pt-1 mt-2">
                    <div className="flex justify-between font-medium text-green-600">
                      <span>Your Net Amount:</span>
                      <span>{formatCurrency((() => {
                        const wholesalerTotal = calculateNetAmount(selectedOrder);
                        const amountPaid = parseFloat(selectedOrder.amountPaid || '0');
                        const amountRefunded = parseFloat(selectedOrder.amountRefunded || '0');
                        const refundProportion = amountPaid > 0 ? Math.min(amountRefunded / amountPaid, 1) : 0;
                        return Math.max(0, wholesalerTotal * (1 - refundProportion));
                      })())}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Amount you receive after platform fee deduction
                  </div>
                </div>
              </div>

              {/* Payment Status Section for Quotes - Shows product values (excludes customer transaction fees) */}
              {selectedOrder.isQuote && (() => {
                const productTotal = parseFloat(selectedOrder.subtotal || '0') + parseFloat(selectedOrder.deliveryCost || '0');
                const customerTotal = parseFloat(selectedOrder.total || '0');
                const paymentRatio = customerTotal > 0 ? parseFloat(selectedOrder.amountPaid || '0') / customerTotal : 0;
                const wholesalerPaid = productTotal * paymentRatio;
                // For cancelled orders, outstanding balance should be £0.00
                const wholesalerOutstanding = selectedOrder.status === 'cancelled' ? 0 : productTotal - wholesalerPaid;
                
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
                    {selectedOrder.balanceDueDays !== undefined && selectedOrder.balanceDueDays > 0 && wholesalerOutstanding > 0 && (
                      <div className="flex justify-between text-red-700 font-medium">
                        <span>Balance Due By:</span>
                        <span>{new Date(new Date(selectedOrder.createdAt).getTime() + (selectedOrder.balanceDueDays * 24 * 60 * 60 * 1000)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t flex flex-wrap gap-2">
                      {parseFloat(selectedOrder.amountRefunded || '0') > 0 ? (
                        selectedOrder.refundedAt ? (
                          <Badge className="bg-purple-600 text-white">Refunded</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800">Refund Pending</Badge>
                        )
                      ) : (
                        <Badge className={getPaymentStatusColor(selectedOrder.paymentStatus || 'unpaid')}>
                          {getPaymentStatusLabel(selectedOrder.paymentStatus || 'unpaid')}
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
                        
                        {/* Show payment link if available */}
                        {selectedOrder.stripePaymentLinkUrl && (
                          <div className="bg-gray-50 p-2 rounded border">
                            <p className="text-xs text-gray-600 mb-1">
                              {selectedOrder.paymentStatus === 'part_paid' 
                                ? 'Balance Payment Link (tap to copy):' 
                                : 'Payment Link (tap to copy):'}
                            </p>
                            <div 
                              className="text-xs text-blue-600 break-all cursor-pointer hover:bg-gray-100 p-1 rounded"
                              onClick={() => {
                                navigator.clipboard.writeText(selectedOrder.stripePaymentLinkUrl || '');
                                toast({ title: "Link copied!" });
                              }}
                            >
                              {selectedOrder.stripePaymentLinkUrl}
                            </div>
                            {selectedOrder.paymentStatus === 'part_paid' && (
                              <p className="text-xs text-orange-600 mt-1">
                                Note: Click "Send Payment Link" above to generate a fresh link if this one has expired.
                              </p>
                            )}
                          </div>
                        )}
                        {/* For part_paid orders without a link, show helper text */}
                        {!selectedOrder.stripePaymentLinkUrl && selectedOrder.paymentStatus === 'part_paid' && (
                          <p className="text-xs text-gray-500 mt-1">
                            Click the button above to generate a payment link for the outstanding balance.
                          </p>
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
                  {/* Upload Button - Direct file input to avoid nested dialog issues on mobile */}
                  <div>
                    <input
                      type="file"
                      id={`order-photo-upload-${selectedOrder.id}`}
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        for (const file of files) {
                          if (file.size > 10485760) {
                            toast({ title: "File too large", description: `${file.name} exceeds 10MB`, variant: "destructive" });
                            continue;
                          }
                          try {
                            const { url } = await handlePhotoUpload();
                            const uploadResponse = await fetch(url, {
                              method: 'PUT',
                              body: file,
                              headers: { 'Content-Type': file.type },
                            });
                            if (uploadResponse.ok) {
                              await handlePhotoComplete({ successful: [{ url: url.split('?')[0], name: file.name }] });
                            } else {
                              toast({ title: "Upload Failed", description: `Failed to upload ${file.name}`, variant: "destructive" });
                            }
                          } catch (err) {
                            // error toast already shown by handlePhotoUpload
                          }
                        }
                        e.target.value = '';
                      }}
                    />
                    <Button
                      className="w-full text-xs bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => document.getElementById(`order-photo-upload-${selectedOrder.id}`)?.click()}
                    >
                      <Camera className="h-3 w-3 mr-2" />
                      Add Photo
                    </Button>
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
                  {(() => {
                    const hasPaid = parseFloat(selectedOrder.amountPaid || '0') > 0;
                    const hasDeposit = (selectedOrder as any).depositPercentage && (selectedOrder as any).depositPercentage < 100;
                    const pTotal = parseFloat(selectedOrder.subtotal || '0') + parseFloat(selectedOrder.deliveryCost || '0');
                    return (
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${hasPaid ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <div>
                        <div className={`text-xs ${hasPaid ? 'font-medium' : 'text-gray-500'}`}>
                          {hasDeposit
                            ? (hasPaid ? `Deposit received (${(selectedOrder as any).depositPercentage}%)` : `Awaiting deposit payment (${(selectedOrder as any).depositPercentage}%)`)
                            : (hasPaid ? 'Payment received' : 'Awaiting payment')}
                        </div>
                        {hasPaid && (
                          <div className="text-xs text-gray-500">
                            {hasDeposit
                              ? formatCurrency(pTotal * ((selectedOrder as any).depositPercentage / 100))
                              : formatCurrency(pTotal)}
                            {' • '}{new Date(selectedOrder.createdAt).toLocaleDateString()}
                          </div>
                        )}
                        {!hasPaid && hasDeposit && (
                          <div className="text-xs text-gray-500">
                            {formatCurrency(pTotal * ((selectedOrder as any).depositPercentage / 100))} deposit required
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                  {/* Step 2: Balance Payment - Only show if there was a deposit and order is NOT cancelled */}
                  {(selectedOrder as any).depositPercentage && (selectedOrder as any).depositPercentage < 100 && selectedOrder.status !== 'cancelled' && (() => {
                    const prodTotal = parseFloat(selectedOrder.subtotal || '0') + parseFloat(selectedOrder.deliveryCost || '0');
                    const custTotal = parseFloat(selectedOrder.total || '0');
                    const paidRatio = custTotal > 0 ? parseFloat(selectedOrder.amountPaid || '0') / custTotal : 0;
                    const wPaid = prodTotal * paidRatio;
                    const wOutstanding = selectedOrder.status === 'cancelled' ? 0 : prodTotal - wPaid;
                    const isFullyPaid = parseFloat(selectedOrder.amountPaid || '0') >= custTotal;
                    const depositAmt = prodTotal * ((selectedOrder as any).depositPercentage / 100);
                    return (
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${isFullyPaid ? 'bg-green-500' : 'bg-orange-400'}`}></div>
                      <div>
                        <div className={`text-xs ${isFullyPaid ? 'font-medium' : 'text-orange-600'}`}>
                          {isFullyPaid
                            ? 'Balance payment received'
                            : `Balance outstanding: ${formatCurrency(wOutstanding)}`}
                        </div>
                        {isFullyPaid && (
                          <div className="text-xs text-gray-500">
                            {formatCurrency(prodTotal - depositAmt)} • Full payment complete
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

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

                  {/* Cancellation Requested Entry - Show if customer requested cancellation */}
                  {selectedOrder.cancellationRequest && (
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 ${selectedOrder.cancellationRequest.status === 'pending' ? 'bg-orange-500' : 'bg-orange-400'}`}></div>
                      <div>
                        <div className={`text-xs font-medium ${selectedOrder.cancellationRequest.status === 'pending' ? 'text-orange-700' : 'text-orange-600'}`}>
                          Cancellation Requested
                          {selectedOrder.cancellationRequest.status === 'pending' && (
                            <span className="ml-1 text-orange-500">(Pending Review)</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(selectedOrder.cancellationRequest.requestedAt).toLocaleDateString()} at {new Date(selectedOrder.cancellationRequest.requestedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                        <div className="text-xs text-gray-500">
                          Reason: {selectedOrder.cancellationRequest.reasonCategory.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          {selectedOrder.cancellationRequest.reasonNotes && ` - ${selectedOrder.cancellationRequest.reasonNotes}`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cancellation Approved/Rejected Entry */}
                  {selectedOrder.cancellationRequest?.status === 'approved' && (
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full mt-1.5 bg-green-500"></div>
                      <div>
                        <div className="text-xs font-medium text-green-700">
                          Cancellation Approved
                        </div>
                        {selectedOrder.cancellationRequest.respondedAt && (
                          <div className="text-xs text-gray-500">
                            {new Date(selectedOrder.cancellationRequest.respondedAt).toLocaleDateString()} at {new Date(selectedOrder.cancellationRequest.respondedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedOrder.cancellationRequest?.status === 'rejected' && (
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full mt-1.5 bg-red-400"></div>
                      <div>
                        <div className="text-xs font-medium text-red-600">
                          Cancellation Declined
                        </div>
                        {selectedOrder.cancellationRequest.respondedAt && (
                          <div className="text-xs text-gray-500">
                            {new Date(selectedOrder.cancellationRequest.respondedAt).toLocaleDateString()}
                          </div>
                        )}
                        {selectedOrder.cancellationRequest.responseMessage && (
                          <div className="text-xs text-gray-500">
                            {selectedOrder.cancellationRequest.responseMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Refund Entry - Show if refund amount is recorded */}
                  {parseFloat(selectedOrder.amountRefunded || '0') > 0 && (() => {
                    const refundedAmt = parseFloat(selectedOrder.amountRefunded || '0');
                    const paidAmt = parseFloat(selectedOrder.amountPaid || '0');
                    const isPartial = paidAmt > 0 && refundedAmt < paidAmt;
                    const isProcessed = !!selectedOrder.refundedAt;
                    const canRetry = !isProcessed && !!selectedOrder.stripePaymentIntentId;
                    const label = isPartial
                      ? (isProcessed ? 'Partial refund to card' : 'Partial refund pending')
                      : (isProcessed ? 'Refund to card' : 'Refund pending');
                    const dotColor = isProcessed ? 'bg-purple-500' : 'bg-amber-400';
                    const textColor = isProcessed ? 'text-purple-700' : 'text-amber-700';
                    return (
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 ${dotColor}`}></div>
                        <div>
                          <div className={`text-xs font-medium ${textColor}`}>
                            {label}: {formatCurrency(refundedAmt)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {isProcessed
                              ? new Date(selectedOrder.refundedAt!).toLocaleDateString()
                              : 'Not yet sent to Stripe'}
                          </div>
                          {selectedOrder.refundReason && !selectedOrder.cancellationRequest && (
                            <div className="text-xs text-gray-400 mt-0.5">{selectedOrder.refundReason}</div>
                          )}
                          {canRetry && (
                            <button
                              onClick={() => retryRefund(selectedOrder.id)}
                              disabled={isRetryingRefund}
                              className="mt-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-2.5 py-1 rounded-md transition-colors"
                            >
                              {isRetryingRefund ? 'Sending...' : 'Retry Refund to Card'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Order Cancelled Entry - Show if order was cancelled */}
                  {selectedOrder.status === 'cancelled' && (
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full mt-1.5 bg-red-500"></div>
                      <div>
                        <div className="text-xs font-medium text-red-700">
                          Order Cancelled
                        </div>
                        {selectedOrder.cancelledAt && (
                          <div className="text-xs text-gray-500">
                            {new Date(selectedOrder.cancelledAt).toLocaleDateString()} at {new Date(selectedOrder.cancelledAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        )}
                        {selectedOrder.refundReason && !selectedOrder.cancellationRequest && (
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
                <div className="flex flex-wrap pt-2 border-t gap-2">
                  {/* Cancel Button */}
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
                        setShowCancelForm(true);
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                  
                  <div className="flex gap-2 ml-auto flex-wrap">
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
                        <span className="hidden sm:inline">{updatingOrderId === selectedOrder.id ? '...' : 'Ready for Collection'}</span>
                        <span className="sm:hidden">{updatingOrderId === selectedOrder.id ? '...' : 'Ready to Collect'}</span>
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
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}