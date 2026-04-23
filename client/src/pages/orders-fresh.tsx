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
import { Search, Package, DollarSign, Clock, Users, CheckCircle, X, Truck, MapPin, Camera, Image as ImageIcon, RefreshCw, Eye, FileText, UserPen, ShoppingCart, Loader2, MoreVertical, Share2 } from "lucide-react";
import ElephantLoader from "@/components/ui/elephant-loader";
import PageHeader from "@/components/PageHeader";
import { Link, useLocation } from "wouter";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { DynamicTooltip } from "@/components/ui/dynamic-tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Home, Building, Warehouse, ChevronLeft, ChevronRight } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { formatCurrency } from "@/lib/currencies";
import { getOfflinePaymentDefaultAmount } from "@/lib/order-payment-balances";

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
  customerTransactionFee?: string;
  wholesalerBusinessName?: string;
  amountRefunded?: string;
  refundReason?: string;
  refundedAt?: string;
  stripePaymentIntentId?: string;
  paymentMethod?: string;
  notes?: string;
  cancelledAt?: string;
  stockRestored?: boolean;
  stockRestoredCount?: number;
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
  appliedOfferLabel?: string | null;
  freeItems?: number;
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
  const { formatMoney } = useCurrency();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  
  // Mark as Paid (offline) dialog state
  const [isMarkAsPaidOpen, setIsMarkAsPaidOpen] = useState(false);
  const [markAsPaidOrder, setMarkAsPaidOrder] = useState<Order | null>(null);
  const [markAsPaidAmount, setMarkAsPaidAmount] = useState('');
  const [markAsPaidMethod, setMarkAsPaidMethod] = useState('cash');
  const [markAsPaidNote, setMarkAsPaidNote] = useState('');
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  
  // Cancellation requests state
  const [cancellationRequests, setCancellationRequests] = useState<any[]>([]);
  const [showCancellationRequests, setShowCancellationRequests] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
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
      navigate(`/orders/${orderId}`);
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

  // Navigate to order detail page with cancel form open for a cancellation request
  const setupCancellationDialog = (order: Order, _request: { reasonCategory: string; reasonNotes?: string }, requestId: number) => {
    navigate(`/orders/${order.id}?action=cancel&requestId=${requestId}`);
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

  // Navigate to the order detail page
  const loadOrderDetails = (order: Order) => {
    navigate(`/orders/${order.id}`);
  };

  // Retry a pending Stripe refund
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
      }
    } catch (error) {
      console.error('Failed to update order status:', error);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Navigate to the order detail page with cancel form open
  const openCancelForm = (order: Order) => {
    navigate(`/orders/${order.id}?action=cancel`);
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

  // Open the Mark as Paid dialog
  const openMarkAsPaid = (order: Order) => {
    setMarkAsPaidOrder(order);
    setMarkAsPaidAmount(getOfflinePaymentDefaultAmount(order));
    setMarkAsPaidMethod('cash');
    setMarkAsPaidNote('');
    setIsMarkAsPaidOpen(true);
  };

  // Submit offline payment record
  const handleMarkAsPaid = async () => {
    if (!markAsPaidOrder) return;
    const parsed = parseFloat(markAsPaidAmount);
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: 'Invalid amount', description: 'Please enter an amount greater than 0', variant: 'destructive' });
      return;
    }
    setIsMarkingPaid(true);
    try {
      const response = await fetch(`/api/orders/${markAsPaidOrder.id}/mark-as-paid`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsed, method: markAsPaidMethod, note: markAsPaidNote }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const updatedFields = {
          amountPaid: data.order.amountPaid,
          amountOutstanding: data.order.amountOutstanding,
          paymentStatus: data.order.paymentStatus,
          status: data.order.status,
        };
        setOrders(orders.map(o => o.id === markAsPaidOrder.id ? { ...o, ...updatedFields } : o));
        setIsMarkAsPaidOpen(false);
        toast({
          title: 'Payment recorded',
          description: `${formatCurrency(parsed)} via ${markAsPaidMethod.replace('_', ' ')} has been recorded.`,
        });
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to record payment', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to record payment', variant: 'destructive' });
    } finally {
      setIsMarkingPaid(false);
    }
  };

  // Upload a photo by sending it through our own server as multipart/form-data.
  // This avoids CORS issues with direct browser PUT to GCS signed URLs, and
  // uses true binary transfer (no base64 overhead) so the full 10 MB limit is honoured.
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

  // Returns true for Stripe-paid orders (transaction fee applies); false for offline orders (no fee)
  const isStripePayment = (order: Order) =>
    order.paymentMethod === 'payment_link' ||
    !!order.stripePaymentIntentId ||
    !!order.stripePaymentLinkUrl;

  // Compute payment balance due date from order creation + balanceDueDays; returns null when not applicable
  const getBalanceDueDate = (order: Order): Date | null => {
    if (!order.balanceDueDays || order.balanceDueDays === 0 || order.paymentStatus === 'paid') return null;
    const due = new Date(order.createdAt);
    due.setDate(due.getDate() + order.balanceDueDays);
    return due;
  };

  // Calculate net amount: offline orders keep full subtotal+delivery; Stripe orders deduct platform fee
  const calculateNetAmount = (order: Order) => {
    const subtotal = parseFloat(order.subtotal || '0');
    const deliveryCost = parseFloat(order.deliveryCost || '0');
    if (!isStripePayment(order)) return subtotal + deliveryCost;
    const actualPlatformFee = parseFloat(order.platformFee || '0');
    const feeToDeduct = actualPlatformFee > 0 ? actualPlatformFee : (subtotal + deliveryCost) * 0.046;
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <PageHeader title="Orders" description="View and manage all your customer orders">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <MoreVertical className="h-4 w-4" />
            <span className="hidden sm:inline">More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => loadOrders(currentPage, searchQuery)}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-xs text-slate-500">
            {statusFilter ? (
              <>Showing {displayedOrders} {statusFilter}</>
            ) : (
              <>Showing {totalOrders} {archiveTab === 'archived' ? 'archived ' : archiveTab === 'all' ? '' : 'active '}orders</>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {!isViewer && (
        <Link href="/quick-quote">
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
            <FileText className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Quick Quote</span>
            <span className="sm:hidden">Quote</span>
          </Button>
        </Link>
      )}
    </PageHeader>
    {/* Mobile-only action bar — PageHeader is hidden below lg breakpoint */}
    <div className="lg:hidden flex items-center justify-end gap-2 px-4 pt-3 pb-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <MoreVertical className="h-4 w-4" />
            <span>More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => loadOrders(currentPage, searchQuery)}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-xs text-slate-500">
            {statusFilter ? (
              <>Showing {displayedOrders} {statusFilter}</>
            ) : (
              <>Showing {totalOrders} {archiveTab === 'archived' ? 'archived ' : archiveTab === 'all' ? '' : 'active '}orders</>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {!isViewer && (
        <Link href="/quick-quote">
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
            <FileText className="w-4 h-4" />
            Quick Quote
          </Button>
        </Link>
      )}
    </div>
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* Archive Tabs */}
      <div className="flex border-b border-slate-200">
        {customerIdFilter && (
          <button
            onClick={() => { setArchiveTab('all'); deliveryTypeRef.current = ''; paymentStatusRef.current = ''; statusFilterRef.current = ''; setStatusFilter(''); setPaymentStatusFilter(''); setDeliveryTypeFilter(''); setDateRangeFilter(''); loadOrders(1, searchQuery, 'all'); if (!customerIdFilter) loadOrderStats('all'); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              archiveTab === 'all'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            All Orders
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
              {orderStats ? (orderStats.activeCount + orderStats.archivedCount) : '...'}
            </span>
          </button>
        )}
        <button
          onClick={() => { setArchiveTab('active'); deliveryTypeRef.current = ''; paymentStatusRef.current = ''; statusFilterRef.current = ''; setStatusFilter(''); setPaymentStatusFilter(''); setDeliveryTypeFilter(''); setDateRangeFilter(''); loadOrders(1, searchQuery, 'active'); if (!customerIdFilter) loadOrderStats('active'); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            archiveTab === 'active'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          Active Orders
          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700">
            {orderStats?.activeCount ?? '...'}
          </span>
        </button>
        <button
          onClick={() => { setArchiveTab('archived'); deliveryTypeRef.current = ''; paymentStatusRef.current = ''; statusFilterRef.current = ''; setStatusFilter(''); setPaymentStatusFilter(''); setDeliveryTypeFilter(''); setDateRangeFilter(''); loadOrders(1, searchQuery, 'archived'); if (!customerIdFilter) loadOrderStats('archived'); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            archiveTab === 'archived'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          Archived
          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
            {orderStats?.archivedCount ?? '...'}
          </span>
        </button>
      </div>

      {/* Search and Filter - sticky */}
      <div className="sticky top-14 lg:top-0 z-10 bg-white border-b border-slate-100 py-2 -mx-4 md:-mx-6 px-4 md:px-6 mb-2">
      <div className="flex flex-col gap-2">
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
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white pr-8"
          />
          {isSearching && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 animate-spin" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select 
            className="flex-1 min-w-[120px] sm:flex-none px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white"
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
            className="flex-1 min-w-[110px] sm:flex-none px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white"
            value={paymentStatusFilter}
            onChange={(e) => { paymentStatusRef.current = e.target.value; setPaymentStatusFilter(e.target.value); loadOrders(1, searchQuery); }}
          >
            <option value="">All Payment</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="part_paid">Part-paid</option>
          </select>
          
          <select 
            className="flex-1 min-w-[100px] sm:flex-none px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white"
            value={deliveryTypeFilter}
            onChange={(e) => { deliveryTypeRef.current = e.target.value; setDeliveryTypeFilter(e.target.value); loadOrders(1, searchQuery); }}
          >
            <option value="">All Type</option>
            <option value="pickup">Collection</option>
            <option value="delivery">Delivery</option>
          </select>
          
          <select 
            className="flex-1 min-w-[110px] sm:flex-none px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white"
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
      </div>

      {/* Statistics Cards - only show on Active tab */}
      {archiveTab === 'active' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {user?.role !== 'team_member' && (
            <div className="rounded-lg bg-green-50 px-3 py-2">
              <p className="text-[11px] font-medium text-green-700">Net Revenue</p>
              <p className="text-sm font-bold text-green-800">{formatMoney(orderStats?.totalRevenue ?? totalValue)}</p>
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
                            {formatMoney(parseFloat(request.order?.total || '0'))}
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
                          <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableCell colSpan={5} className="py-2 px-4">
                              <span className="text-xs font-semibold text-gray-500">{currentLabel}</span>
                            </TableCell>
                          </TableRow>
                        )}
                    <TableRow className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => loadOrderDetails(order)}>
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
                          <div>{formatMoney(calculateNetAmount(order))}</div>
                          <div className="text-xs text-gray-500">{isStripePayment(order) ? 'After platform fee' : 'No platform fee'}</div>
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
                            } else if (order.status === 'cancelled' && paidAmt === 0) {
                              return null;
                            } else if ((order.paymentStatus || '').toLowerCase() === 'paid') {
                              return <Badge className="bg-emerald-100 text-emerald-800 text-xs">Paid</Badge>;
                            } else if ((order.paymentStatus || '').toLowerCase() === 'part_paid') {
                              return <Badge className="bg-amber-100 text-amber-800 text-xs">Part Paid</Badge>;
                            } else {
                              return <Badge className="bg-red-100 text-red-700 text-xs">Unpaid</Badge>;
                            }
                          })()}
                          {order.status === 'fulfilled' ? (
                            <Badge className="bg-emerald-100 text-emerald-800 text-xs">Fulfilled</Badge>
                          ) : order.status === 'ready_for_collection' ? (
                            <Badge className="bg-amber-100 text-amber-800 text-xs">Ready</Badge>
                          ) : order.status === 'cancelled' ? (
                            <Badge className="bg-red-100 text-red-700 text-xs">Cancelled</Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-700 text-xs">Unfulfilled</Badge>
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
                        {order.status === 'fulfilled' ? null
                        : order.status === 'cancelled' ? (
                          <span className="text-red-400 text-xs">—</span>
                        ) : !isViewer ? (
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
                              {order.paymentStatus !== 'paid' && (
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); openMarkAsPaid(order); }}
                                  className="text-green-600 focus:text-green-700 cursor-pointer"
                                >
                                  <DollarSign className="h-3.5 w-3.5 mr-2" />
                                  Mark as Paid
                                </DropdownMenuItem>
                              )}
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
                        ) : null}
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
                          <div className="font-semibold text-sm">{order.orderNumber || `#${order.id}`}</div>
                          <div className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</div>
                          {(() => { const due = getBalanceDueDate(order); return due ? <div className="text-xs text-amber-600 font-medium">Due {due.toLocaleDateString('en-GB')}</div> : null; })()}
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <div className="font-semibold">{formatMoney(calculateNetAmount(order))}</div>
                            <div className="text-xs text-gray-500">{isStripePayment(order) ? 'After fee' : 'No fee'}</div>
                          </div>
                          <Eye className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>

                      <div className="mb-2">
                        <div className="font-medium text-sm">{order.customerName || 'Unknown'}</div>
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
                          } else if (order.status === 'cancelled' && paidAmt === 0) {
                            return null;
                          } else if ((order.paymentStatus || '').toLowerCase() === 'paid') {
                            return <Badge className="bg-emerald-100 text-emerald-800 text-xs">Paid</Badge>;
                          } else if ((order.paymentStatus || '').toLowerCase() === 'part_paid') {
                            return <Badge className="bg-amber-100 text-amber-800 text-xs">Part Paid</Badge>;
                          } else {
                            return <Badge className="bg-red-100 text-red-700 text-xs">Unpaid</Badge>;
                          }
                        })()}
                        {order.status === 'fulfilled' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 text-xs">Fulfilled</Badge>
                        ) : order.status === 'ready_for_collection' ? (
                          <Badge className="bg-amber-100 text-amber-800 text-xs">Ready</Badge>
                        ) : order.status === 'cancelled' ? (
                          <Badge className="bg-red-100 text-red-700 text-xs">Cancelled</Badge>
                        ) : order.status === 'paid' ? (
                          <Badge className="bg-slate-100 text-slate-700 text-xs">Confirmed</Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-700 text-xs">Unfulfilled</Badge>
                        )}
                        {order.isQuote ? (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                            <UserPen className="w-3 h-3 mr-1" />Quote
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            <ShoppingCart className="w-3 h-3 mr-1" />Order
                          </Badge>
                        )}
                        {order.fulfillmentType && (
                          <Badge variant="outline" className="text-xs">
                            {order.fulfillmentType === 'delivery' ? (
                              <><Truck className="w-3 h-3 mr-1" />Delivery</>
                            ) : (
                              <><MapPin className="w-3 h-3 mr-1" />Collection</>
                            )}
                          </Badge>
                        )}
                      </div>

                      {order.status !== 'fulfilled' && order.status !== 'cancelled' && !isViewer && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingOrderId === order.id}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs w-full flex items-center justify-center gap-2 h-8"
                            >
                              {updatingOrderId === order.id
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Updating...</>
                                : <><MoreVertical className="h-3 w-3" /> Actions</>}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {order.paymentStatus !== 'paid' && (
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); openMarkAsPaid(order); }}
                                className="text-green-600 focus:text-green-700 cursor-pointer"
                              >
                                <DollarSign className="h-4 w-4 mr-2" />
                                Mark as Paid
                              </DropdownMenuItem>
                            )}
                            {order.status !== 'ready_for_collection' && (
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); markReadyForCollection(order.id); }}
                                className="text-orange-600 focus:text-orange-700 cursor-pointer"
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Mark Ready
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); markAsFulfilled(order.id); }}
                              className="text-blue-600 focus:text-blue-700 cursor-pointer"
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Mark Fulfilled
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); openCancelForm(order); }}
                              className="text-red-600 focus:text-red-700 cursor-pointer"
                            >
                              <X className="h-4 w-4 mr-2" />
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


      {/* Mark as Paid (offline) Dialog */}
      <Dialog open={isMarkAsPaidOpen} onOpenChange={setIsMarkAsPaidOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Record Offline Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {markAsPaidOrder && (
              <p className="text-sm text-gray-500">
                Order {markAsPaidOrder.orderNumber || `#${markAsPaidOrder.id}`} — outstanding{' '}
                <span className="font-medium text-gray-800">
                  {formatMoney(parseFloat(markAsPaidOrder.amountOutstanding || '0'))}
                </span>
              </p>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount received (£)</label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={markAsPaidAmount}
                onChange={(e) => setMarkAsPaidAmount(e.target.value)}
                placeholder="0.00"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Payment method</label>
              <select
                value={markAsPaidMethod}
                onChange={(e) => setMarkAsPaidMethod(e.target.value)}
                className="w-full p-2 border rounded-md text-sm bg-white"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Internal note (optional)</label>
              <textarea
                value={markAsPaidNote}
                onChange={(e) => setMarkAsPaidNote(e.target.value)}
                placeholder="e.g. Paid in full at delivery"
                className="w-full p-2 border rounded-md text-sm min-h-[60px] resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsMarkAsPaidOpen(false)}
                disabled={isMarkingPaid}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleMarkAsPaid}
                disabled={isMarkingPaid || !markAsPaidAmount}
              >
                {isMarkingPaid ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}