import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { calculatePlatformFee } from "@shared/utils/fees";
import { FeatureLock, isListingTier } from "@/components/FeatureLock";
import { useOptimizedQuery } from "@/hooks/useOptimizedQuery";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Package, DollarSign, Clock, Users, CheckCircle, X, Truck, MapPin, Camera, Image as ImageIcon, RefreshCw, Eye, FileText, UserPen, ShoppingCart, Loader2, MoreVertical, Share2, PackageCheck, RotateCcw, Bot } from "lucide-react";
import { PickingStatusBadge } from "@/components/orders/PickingMode";
import ElephantLoader from "@/components/ui/elephant-loader";
import PageHeader from "@/components/PageHeader";
import { Link, useLocation } from "wouter";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { DynamicTooltip } from "@/components/ui/dynamic-tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Home, Building, Warehouse, ChevronLeft, ChevronRight } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { useSidebarContext } from "@/contexts/sidebar-context";
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
  businessProfileId?: number | null;
  businessProfileName?: string | null;
  amountRefunded?: string;
  refundReason?: string;
  refundedAt?: string;
  stripePaymentIntentId?: string;
  paymentMethod?: string;
  notes?: string;
  cancelledAt?: string;
  stockRestored?: boolean;
  stockRestoredCount?: number;
  retailer?: { firstName?: string | null; lastName?: string | null; businessName?: string | null; phoneNumber?: string | null; [key: string]: unknown };
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
  pickingStatus?: string;
  orderSource?: string;
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
  const { isDesktopCollapsed } = useSidebarContext();
  const [, navigate] = useLocation();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';
  const [mobileDraft, setMobileDraft] = useState<{ selectedCustomer?: { businessName?: string; firstName?: string }; savedAt?: number } | null>(null);
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
  const [archiveTab, setArchiveTab] = useState<'active' | 'archived' | 'all' | 'drafts'>('active');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState('');
  const [pickingStatusFilter, setPickingStatusFilter] = useState(() => localStorage.getItem('orders_pickingStatusFilter') ?? '');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [orderStats, setOrderStats] = useState<{
    ordersCount: number;
    totalRevenue: number;
    paidOrdersCount: number;
    pendingOrdersCount: number;
    activeCount: number;
    archivedCount: number;
  } | null>(null);
  const ordersPerPage = 20;

  // Draft orders
  const { data: draftOrders = [], refetch: refetchDrafts } = useQuery<any[]>({
    queryKey: ['/api/orders/drafts'],
  });

  const { data: planLimits } = useQuery<{ plan: string }>({
    queryKey: ['/api/subscriptions/plan-limits'],
    enabled: !!user,
  });
  const [isDeletingDraft, setIsDeletingDraft] = useState<number | null>(null);
  const [isApprovingDraft, setIsApprovingDraft] = useState<number | null>(null);
  const [duplicateInvoiceWarning, setDuplicateInvoiceWarning] = useState<{
    draftId: number;
    orderNumber: string | null;
    total: string;
    createdAt: string;
  } | null>(null);
  const [isSharingDraft, setIsSharingDraft] = useState<number | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!user?.id) return;
    const stored = localStorage.getItem(`quikpik_unfulfilled_reminder_${user.id}`);
    if (stored && Date.now() < parseInt(stored)) setReminderDismissed(true);
  }, [user?.id]);
  
  // Persist picking status filter to localStorage
  useEffect(() => {
    if (pickingStatusFilter) {
      localStorage.setItem('orders_pickingStatusFilter', pickingStatusFilter);
    } else {
      localStorage.removeItem('orders_pickingStatusFilter');
    }
  }, [pickingStatusFilter]);

  // Mobile draft banner
  useEffect(() => {
    if (!user?.id) {
      setMobileDraft(null);
      return;
    }
    try {
      const raw = localStorage.getItem(`quikpik_qq_draft_${user.id}`);
      if (!raw) {
        setMobileDraft(null);
        return;
      }
      const draft = JSON.parse(raw);
      if (draft.selectedCustomer || draft.quoteItems?.length > 0) {
        setMobileDraft(draft);
      } else {
        setMobileDraft(null);
      }
    } catch {
      setMobileDraft(null);
    }
  }, [user?.id]);

  // Mark as Paid (offline) dialog state
  const [isMarkAsPaidOpen, setIsMarkAsPaidOpen] = useState(false);
  const [markAsPaidOrder, setMarkAsPaidOrder] = useState<Order | null>(null);
  const [markAsPaidAmount, setMarkAsPaidAmount] = useState('');
  const [markAsPaidMethod, setMarkAsPaidMethod] = useState('cash');
  const [markAsPaidNote, setMarkAsPaidNote] = useState('');
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  const [isMarkAsUnpaidOpen, setIsMarkAsUnpaidOpen] = useState(false);
  const [markAsUnpaidOrder, setMarkAsUnpaidOrder] = useState<Order | null>(null);
  const [isMarkingUnpaid, setIsMarkingUnpaid] = useState(false);

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
        setOrderStats(stats);
      } else {
        console.error('❌ Stats API returned non-OK status:', response.status);
      }
    } catch (err) {
      console.error('❌ Failed to load order stats:', err);
    }
  };

  const [staleFilterActive, setStaleFilterActive] = useState(false);
  const customerIdRef = useRef(customerIdFilter);
  customerIdRef.current = customerIdFilter;
  const deliveryTypeRef = useRef('');
  const paymentStatusRef = useRef('');
  const statusFilterRef = useRef('');
  const staleFilterRef = useRef(false);
  const isFilterInitialized = useRef(false);

  const handleShareDraft = async (draftId: number) => {
    const pdfUrl = `/api/orders/${draftId}/invoice`;
    setIsSharingDraft(draftId);
    try {
      if (typeof navigator.share === 'function') {
        try {
          const resp = await fetch(pdfUrl);
          const blob = await resp.blob();
          const file = new File([blob], `draft-invoice-${draftId}.pdf`, { type: 'application/pdf' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Draft Invoice' });
          } else {
            await navigator.share({ url: window.location.origin + pdfUrl, title: 'Draft Invoice' });
          }
        } catch (shareErr: any) {
          if (shareErr?.name !== 'AbortError') {
            window.open(pdfUrl, '_blank');
          }
        }
      } else {
        window.open(pdfUrl, '_blank');
      }
    } finally {
      setIsSharingDraft(null);
    }
  };

  const handleDeleteDraft = async (draftId: number) => {
    if (!window.confirm('Delete this draft invoice?')) return;
    setIsDeletingDraft(draftId);
    try {
      await apiRequest('DELETE', `/api/orders/${draftId}/draft`);
      refetchDrafts();
      if (user?.id) localStorage.removeItem(`quikpik_qq_draft_${user.id}`);
      setMobileDraft(null);
      toast({ title: 'Draft deleted' });
    } catch {
      toast({ title: 'Failed to delete draft', variant: 'destructive' } as any);
    } finally {
      setIsDeletingDraft(null);
    }
  };

  const handleApproveDraft = async (draftId: number, confirmDuplicate?: boolean) => {
    setIsApprovingDraft(draftId);
    try {
      await apiRequest('POST', `/api/orders/${draftId}/approve`, confirmDuplicate ? { confirmDuplicate: true } : {});
      refetchDrafts();
      if (user?.id) localStorage.removeItem(`quikpik_qq_draft_${user.id}`);
      setMobileDraft(null);
      queryClient.invalidateQueries({ queryKey: ['/api/orders-paginated'] });
      setArchiveTab('active');
      loadOrders(1, '', 'active');
      toast({ title: 'Invoice approved!', description: 'Order is now active and customer notified.' });
    } catch (err: any) {
      if (err?.errorType === 'DUPLICATE_INVOICE' && err.conflictingOrder) {
        setDuplicateInvoiceWarning({ draftId, ...err.conflictingOrder });
      } else if (err?.errorType === 'OUT_OF_STOCK') {
        toast({
          title: 'Stock Unavailable',
          description: err.available != null && err.requested != null
            ? `Only ${err.available} units of "${err.productName || 'this product'}" are in stock — you requested ${err.requested}. Please edit the draft to reduce the quantity.`
            : err.message || 'Insufficient stock to approve this draft.',
          variant: 'destructive',
        } as any);
      } else {
        toast({ title: 'Failed to approve', description: 'Failed to approve draft', variant: 'destructive' } as any);
      }
    } finally {
      setIsApprovingDraft(null);
    }
  };

  const loadOrders = async (page = 1, search = '', tab = archiveTab) => {
    if (tab === 'drafts') return;
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
        ...(staleFilterRef.current && { stale: '1' }),
      });
      const response = await fetch(`/api/orders-paginated?${params}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Log order statuses for debugging
        const statusCounts: Record<string, number> = {};
        data.orders.forEach((o: any) => {
          const status = o.status || 'null';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        setOrders(data.orders);
        setSelectedOrderIds(new Set());
        setTotalOrders(data.total);
        setTotalPages(data.totalPages);
        setCurrentPage(page);
        // Use stats from paginated response (more reliable than separate API call)
        if (data.stats) {
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
    const statusParam = urlParams.get('status');
    const staleParam = urlParams.get('stale');
    const hasUrlParams = !!(customerIdParam || searchParam || statusParam || staleParam);

    let effectiveTab: 'active' | 'archived' | 'all' | 'drafts' = 'active';
    let effectiveSearch = '';

    if (!hasUrlParams) {
      // Restore saved filter state when returning from an order detail (back-navigation)
      try {
        const saved = sessionStorage.getItem('orders_filter_state');
        if (saved) {
          const s = JSON.parse(saved);
          if (s.searchQuery) { setSearchQuery(s.searchQuery); effectiveSearch = s.searchQuery; }
          if (s.customerIdFilter) { setCustomerIdFilter(s.customerIdFilter); customerIdRef.current = s.customerIdFilter; }
          if (s.statusFilter) { setStatusFilter(s.statusFilter); statusFilterRef.current = s.statusFilter; }
          if (s.archiveTab) { setArchiveTab(s.archiveTab); effectiveTab = s.archiveTab; }
          if (s.paymentStatusFilter) { setPaymentStatusFilter(s.paymentStatusFilter); paymentStatusRef.current = s.paymentStatusFilter; }
          if (s.deliveryTypeFilter) { setDeliveryTypeFilter(s.deliveryTypeFilter); deliveryTypeRef.current = s.deliveryTypeFilter; }
          if (s.dateRangeFilter) setDateRangeFilter(s.dateRangeFilter);
          if (s.pickingStatusFilter) setPickingStatusFilter(s.pickingStatusFilter);
          if (s.staleFilterActive) { setStaleFilterActive(true); staleFilterRef.current = true; }
        }
      } catch { /* sessionStorage unavailable */ }
    } else {
      // URL params — existing logic (explicit link / deep link)
      if (customerIdParam) {
        setCustomerIdFilter(customerIdParam);
        customerIdRef.current = customerIdParam;
        setArchiveTab('all');
        effectiveTab = 'all';
      }
      if (staleParam) {
        staleFilterRef.current = true;
        setStaleFilterActive(true);
        setArchiveTab('all');
        effectiveTab = 'all';
      }
      if (searchParam) { setSearchQuery(searchParam); effectiveSearch = searchParam; }
      if (statusParam) { setStatusFilter(statusParam); statusFilterRef.current = statusParam; }
    }

    const orderId = urlParams.get('id');
    if (orderId) {
      navigate(`/orders/${orderId}`);
    }

    loadCancellationRequests();
    if (!customerIdRef.current) {
      loadOrderStats(effectiveTab as 'active' | 'archived' | 'all');
    }
    loadOrders(1, effectiveSearch, effectiveTab as 'active' | 'archived' | 'all');
    isFilterInitialized.current = true;
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

  // Persist filter state to sessionStorage so it survives back-navigation
  useEffect(() => {
    if (!isFilterInitialized.current) return;
    try {
      sessionStorage.setItem('orders_filter_state', JSON.stringify({
        searchQuery, customerIdFilter, statusFilter, archiveTab,
        paymentStatusFilter, deliveryTypeFilter, dateRangeFilter,
        pickingStatusFilter, staleFilterActive,
      }));
    } catch { /* sessionStorage unavailable */ }
  }, [searchQuery, customerIdFilter, statusFilter, archiveTab, paymentStatusFilter, deliveryTypeFilter, dateRangeFilter, pickingStatusFilter, staleFilterActive]);

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

  // Bulk picking status update
  const handleBulkPickingUpdate = async (action: 'picking' | 'packed' | 'reset') => {
    if (selectedOrderIds.size === 0) return;
    setIsBulkUpdating(true);
    try {
      const response = await fetch('/api/orders/bulk-picking', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: Array.from(selectedOrderIds), action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update');
      const label = action === 'picking' ? 'Picking' : action === 'packed' ? 'Packed' : 'Reset';
      toast({ title: `${data.updatedCount} order${data.updatedCount !== 1 ? 's' : ''} marked as ${label}` });
      setSelectedOrderIds(new Set());
      await loadOrders(currentPage, searchQuery);
    } catch (err: any) {
      toast({ title: 'Bulk update failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsBulkUpdating(false);
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
          description: `${formatMoney(parsed)} via ${markAsPaidMethod.replace('_', ' ')} has been recorded.`,
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

  const handleMarkAsUnpaid = async () => {
    if (!markAsUnpaidOrder) return;
    setIsMarkingUnpaid(true);
    try {
      const response = await fetch(`/api/orders/${markAsUnpaidOrder.id}/mark-as-unpaid`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setOrders(orders.map(o => o.id === markAsUnpaidOrder.id ? {
          ...o,
          amountPaid: data.order.amountPaid,
          amountOutstanding: data.order.amountOutstanding,
          paymentStatus: data.order.paymentStatus,
          status: data.order.status,
        } : o));
        setIsMarkAsUnpaidOpen(false);
        toast({ title: 'Payment undone', description: 'The payment record has been reset to unpaid.' });
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to undo payment', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to undo payment', variant: 'destructive' });
    } finally {
      setIsMarkingUnpaid(false);
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

  // Calculate net amount: only deduct the actual stored platform fee — never fall back to a default rate
  const OFFLINE_PAYMENT_METHODS_LOCAL = ['cash', 'bank_transfer', 'cheque', 'pay_later', 'other'];
  // Stripe-aware offline check: an order is truly offline only when it has no Stripe payment signals
  const isOfflineOrderLocal = (order: Order): boolean =>
    OFFLINE_PAYMENT_METHODS_LOCAL.includes(order.paymentMethod || '') &&
    !order.stripePaymentIntentId && !order.stripePaymentLinkUrl;
  const calculateNetAmount = (order: Order) => {
    const subtotal = parseFloat(order.subtotal || '0');
    const deliveryCost = parseFloat(order.deliveryCost || '0');
    if (isOfflineOrderLocal(order)) return subtotal + deliveryCost;
    const actualPlatformFee = parseFloat(order.platformFee || '0');
    if (actualPlatformFee <= 0) return subtotal + deliveryCost;
    return (subtotal + deliveryCost) - actualPlatformFee;
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

  // Apply picking status filter client-side
  const filteredByPicking = pickingStatusFilter
    ? filteredByDate.filter(o => (o.pickingStatus || 'not_started') === pickingStatusFilter)
    : filteredByDate;

  // Counts per picking state (from all currently loaded orders, before picking filter)
  const pickingCounts = {
    not_started: orders.filter(o => (o.pickingStatus || 'not_started') === 'not_started').length,
    picking: orders.filter(o => o.pickingStatus === 'picking').length,
    packed: orders.filter(o => o.pickingStatus === 'packed').length,
  };

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const ukParts = (d: Date) => {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      return { year: +p.find(x => x.type === 'year')!.value, month: +p.find(x => x.type === 'month')!.value - 1, day: +p.find(x => x.type === 'day')!.value };
    };
    const ukNow = ukParts(now);
    const ukDate = ukParts(date);
    const today = new Date(ukNow.year, ukNow.month, ukNow.day);
    const orderDay = new Date(ukDate.year, ukDate.month, ukDate.day);
    const diffDays = Math.floor((today.getTime() - orderDay.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/London' });
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London', year: ukDate.year !== ukNow.year ? 'numeric' : undefined });
  };

  const displayedOrders = filteredByPicking.length;
  // Net Revenue excludes cancelled orders (they represent £0 actual revenue) - with null safety
  const totalValue = filteredByPicking
    .filter(o => (o.status || '').toLowerCase() !== 'cancelled')
    .reduce((sum, order) => sum + calculateNetAmount(order), 0);
  // Stats reflect the current tab's orders - with null safety
  const paidOrders = filteredByPicking.filter(o => (o.paymentStatus || '') === 'paid').length;
  const unfulfilledOrders = filteredByPicking.filter(o => UNFULFILLED_STATUSES.includes((o.status || '').toLowerCase())).length;

  const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
  const staleUnfulfilledCount = useMemo(() =>
    (archiveTab === 'active' || archiveTab === 'all')
      ? orders.filter(o =>
          UNFULFILLED_STATUSES.includes((o.status || '').toLowerCase()) &&
          new Date(o.createdAt).getTime() < fifteenDaysAgo
        ).length
      : 0,
  [orders, archiveTab]);

  const dismissReminder = () => {
    if (user?.id) localStorage.setItem(`quikpik_unfulfilled_reminder_${user.id}`, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setReminderDismissed(true);
  };

  const showUnfulfilledReminder = staleUnfulfilledCount > 0 && !reminderDismissed;

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

  if (isListingTier(planLimits?.plan)) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <FeatureLock
          feature="Order Management"
          description="Creating and managing orders is available on the Starter plan and above."
        />
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
            <span className="hidden sm:inline">Raise Invoice</span>
            <span className="sm:hidden">Invoice</span>
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
            Raise Invoice
          </Button>
        </Link>
      )}
    </div>
    {/* Mobile-only unsaved draft banner */}
    {mobileDraft && (
      <div className="lg:hidden mx-4 mt-2 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 flex-1">
          You have an unsent invoice{mobileDraft.selectedCustomer?.businessName || mobileDraft.selectedCustomer?.firstName
            ? ` for ${mobileDraft.selectedCustomer.businessName || mobileDraft.selectedCustomer.firstName}`
            : ''} saved {mobileDraft.savedAt ? `on ${new Date(mobileDraft.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'earlier'}.
        </p>
        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" onClick={() => navigate('/quick-quote?resume=1')}>
          Resume
        </Button>
        <Button size="sm" variant="ghost" className="text-amber-600 hover:bg-amber-100 shrink-0 p-1" onClick={() => {
          if (user?.id) localStorage.removeItem(`quikpik_qq_draft_${user.id}`);
          setMobileDraft(null);
        }}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    )}
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* Archive Tabs */}
      <div className="flex border-b border-slate-200">
        {customerIdFilter && (
          <button
            onClick={() => { setArchiveTab('all'); deliveryTypeRef.current = ''; paymentStatusRef.current = ''; statusFilterRef.current = ''; setStatusFilter(''); setPaymentStatusFilter(''); setDeliveryTypeFilter(''); setDateRangeFilter(''); setPickingStatusFilter(''); loadOrders(1, searchQuery, 'all'); if (!customerIdFilter) loadOrderStats('all'); }}
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
          onClick={() => { setArchiveTab('active'); deliveryTypeRef.current = ''; paymentStatusRef.current = ''; statusFilterRef.current = ''; setStatusFilter(''); setPaymentStatusFilter(''); setDeliveryTypeFilter(''); setDateRangeFilter(''); setPickingStatusFilter(''); loadOrders(1, searchQuery, 'active'); if (!customerIdFilter) loadOrderStats('active'); }}
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
          onClick={() => setArchiveTab('drafts')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            archiveTab === 'drafts'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          Drafts
          {draftOrders.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700">
              {draftOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setArchiveTab('archived'); deliveryTypeRef.current = ''; paymentStatusRef.current = ''; statusFilterRef.current = ''; setStatusFilter(''); setPaymentStatusFilter(''); setDeliveryTypeFilter(''); setDateRangeFilter(''); setPickingStatusFilter(''); loadOrders(1, searchQuery, 'archived'); if (!customerIdFilter) loadOrderStats('archived'); }}
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

      {staleFilterActive && (
        <div className="mx-4 md:mx-6 mt-3 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm">
          <Clock className="h-4 w-4 text-orange-600 shrink-0" />
          <p className="flex-1 text-orange-800 font-medium">Showing orders unfulfilled for 15+ days</p>
          <button
            className="shrink-0 text-orange-500 hover:text-orange-700 transition-colors text-xs underline"
            onClick={() => {
              staleFilterRef.current = false;
              setStaleFilterActive(false);
              setArchiveTab('active');
              loadOrders(1, searchQuery, 'active');
            }}
          >
            Clear filter
          </button>
        </div>
      )}

      {showUnfulfilledReminder && !staleFilterActive && (
        <div className="mx-4 md:mx-6 mt-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-amber-800">
              {staleUnfulfilledCount === 1
                ? 'You have 1 order over 15 days old that hasn\'t been marked as fulfilled.'
                : `You have ${staleUnfulfilledCount} orders over 15 days old that haven't been marked as fulfilled.`}
            </p>
            <p className="text-amber-700 mt-0.5">
              Open any order's <span className="font-medium">⋮ menu</span> and tap <span className="font-medium">Mark Fulfilled</span> once it's been dispatched or collected.
            </p>
          </div>
          <button onClick={dismissReminder} className="shrink-0 text-amber-500 hover:text-amber-700 transition-colors" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {archiveTab !== 'drafts' && (
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

          <select
            className="flex-1 min-w-[130px] sm:flex-none px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white"
            value={pickingStatusFilter}
            onChange={(e) => setPickingStatusFilter(e.target.value)}
          >
            <option value="">All Picking</option>
            <option value="not_started">Not Started ({pickingCounts.not_started})</option>
            <option value="picking">Picking ({pickingCounts.picking})</option>
            <option value="packed">Packed ({pickingCounts.packed})</option>
          </select>
          
          {(searchQuery || statusFilter || paymentStatusFilter || deliveryTypeFilter || dateRangeFilter || pickingStatusFilter) && (
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
                setPickingStatusFilter('');
                try { sessionStorage.removeItem('orders_filter_state'); } catch {}
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
      )}

      {/* Drafts list - shown when Drafts tab is active */}
      {archiveTab === 'drafts' && (
        <div className="space-y-3">
          {draftOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Clock className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium">No draft invoices</p>
              <p className="text-xs text-slate-400 mt-1">Save a quote as draft from the invoice form to continue it later.</p>
              <Button size="sm" className="mt-4" variant="outline" onClick={() => { window.location.href = '/quick-quote'; }}>
                Create Invoice
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {draftOrders.map((draft: any) => (
                <div key={draft.id} className={`bg-white border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm ${draft.hasStockIssue ? 'border-yellow-300' : 'border-amber-100'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Draft · Not Sent</span>
                      {draft.hasStockIssue && (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-300 flex items-center gap-1"
                          title={draft.stockIssues?.map((i: any) => `${i.productName}: ${i.available} available, ${i.requested} needed`).join('\n')}
                        >
                          ⚠ Stock issue
                        </span>
                      )}
                      <span className="font-semibold text-slate-800 truncate">{draft.customerName || 'Unknown Customer'}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{formatMoney(parseFloat(draft.total || draft.subtotal || '0'))}</span>
                      {draft.paymentMethod && (
                        <span className="text-xs text-slate-500 capitalize">{draft.paymentMethod.replace(/_/g, ' ')}</span>
                      )}
                      <span className="text-xs text-slate-500">{draft.fulfillmentType === 'pickup' ? 'Collection' : 'Delivery'}</span>
                      <span className="text-xs text-slate-400">{new Date(draft.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    {draft.hasStockIssue && draft.stockIssues?.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {draft.stockIssues.map((issue: any, idx: number) => (
                          <p key={idx} className="text-xs text-yellow-700">
                            <span className="font-medium">{issue.productName}</span>: {issue.available} available, {issue.requested} needed
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { window.location.href = `/quick-quote?draftId=${draft.id}`; }}
                      className="text-slate-600 border-slate-200 hover:bg-slate-50"
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSharingDraft === draft.id}
                      onClick={() => handleShareDraft(draft.id)}
                      className="text-blue-600 border-blue-200 hover:bg-blue-50"
                      title="Share draft PDF"
                    >
                      {isSharingDraft === draft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isDeletingDraft === draft.id}
                      onClick={() => handleDeleteDraft(draft.id)}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      {isDeletingDraft === draft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      disabled={isApprovingDraft === draft.id}
                      onClick={() => handleApproveDraft(draft.id)}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isApprovingDraft === draft.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      )}
                      <span className="hidden sm:inline">Approve &amp; Send</span>
                      <span className="sm:hidden">Approve</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
      {cancellationRequests.length > 0 && !isViewer && (
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

      {/* Bulk Picking Toolbar */}
      {selectedOrderIds.size > 0 && !isViewer && (
        <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50 px-4 py-3 ${isDesktopCollapsed ? "lg:left-14" : "lg:left-64"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">
              {selectedOrderIds.size} order{selectedOrderIds.size !== 1 ? 's' : ''} selected
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={isBulkUpdating}
              onClick={() => setSelectedOrderIds(new Set())}
              className="text-slate-400 hover:text-slate-600 h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={isBulkUpdating}
              onClick={() => handleBulkPickingUpdate('picking')}
              className="flex-1 min-w-0 text-blue-600 border-blue-200 hover:bg-blue-50 min-h-[44px] px-2 sm:px-4 whitespace-normal text-center flex-col sm:flex-row gap-1 text-xs sm:text-sm"
            >
              {isBulkUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4 shrink-0" />}
              <span className="sm:hidden leading-tight">Picking</span>
              <span className="hidden sm:inline">Mark as Picking</span>
            </Button>
            <Button
              variant="outline"
              disabled={isBulkUpdating}
              onClick={() => handleBulkPickingUpdate('packed')}
              className="flex-1 min-w-0 text-emerald-600 border-emerald-200 hover:bg-emerald-50 min-h-[44px] px-2 sm:px-4 whitespace-normal text-center flex-col sm:flex-row gap-1 text-xs sm:text-sm"
            >
              {isBulkUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4 shrink-0" />}
              <span className="sm:hidden leading-tight">Packed</span>
              <span className="hidden sm:inline">Mark as Packed</span>
            </Button>
            <Button
              variant="outline"
              disabled={isBulkUpdating}
              onClick={() => handleBulkPickingUpdate('reset')}
              className="flex-1 min-w-0 text-slate-600 border-slate-200 hover:bg-slate-50 min-h-[44px] px-2 sm:px-4 whitespace-normal text-center flex-col sm:flex-row gap-1 text-xs sm:text-sm"
            >
              {isBulkUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 shrink-0" />}
              <span>Reset</span>
            </Button>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredByPicking.length === 0 ? (
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
                    {!isViewer && (
                      <TableHead className="w-8 pr-0">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 accent-emerald-600 cursor-pointer"
                          checked={filteredByPicking.length > 0 && filteredByPicking.every(o => selectedOrderIds.has(o.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedOrderIds(new Set(filteredByPicking.map(o => o.id)));
                            } else {
                              setSelectedOrderIds(new Set());
                            }
                          }}
                          title="Select all"
                        />
                      </TableHead>
                    )}
                    <TableHead className="text-xs">Order #</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Net Amount</TableHead>
                    <TableHead className="text-xs">Expiration date</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredByPicking.slice(0, 50).map((order, index, arr) => {
                    const currentLabel = order.createdAt ? getDateLabel(order.createdAt) : '';
                    const prevLabel = index > 0 && arr[index - 1]!.createdAt ? getDateLabel(arr[index - 1]!.createdAt) : '';
                    const showSeparator = index === 0 || currentLabel !== prevLabel;
                    return (
                      <Fragment key={order.id}>
                        {showSeparator && (
                          <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableCell colSpan={!isViewer ? 6 : 5} className="py-2 px-4">
                              <span className="text-xs font-semibold text-gray-500">{currentLabel}</span>
                            </TableCell>
                          </TableRow>
                        )}
                    <TableRow className={`cursor-pointer transition-colors ${order.status === 'cancelled' ? 'bg-gray-50 hover:bg-gray-100 opacity-70' : `hover:bg-slate-50 ${selectedOrderIds.has(order.id) ? 'bg-emerald-50/50' : ''}`}`} onClick={() => loadOrderDetails(order)}>
                      {!isViewer && (
                        <TableCell className="w-8 pr-0" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 accent-emerald-600 cursor-pointer"
                            checked={selectedOrderIds.has(order.id)}
                            onChange={(e) => {
                              const next = new Set(selectedOrderIds);
                              if (e.target.checked) next.add(order.id); else next.delete(order.id);
                              setSelectedOrderIds(next);
                            }}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium text-xs">
                        <div>{order.orderNumber || `#${order.id}`}</div>
                        {order.businessProfileName && (
                          <div className="mt-0.5">
                            <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-normal px-1.5 py-0" variant="outline">
                              {order.businessProfileName}
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>
                          <div className="font-medium">{order.retailer?.businessName || (`${order.retailer?.firstName || ''} ${order.retailer?.lastName || ''}`.trim()) || order.customerName || 'Unknown'}</div>
                          <div className="text-xs text-gray-500">{order.customerEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-xs">
                        <div>
                          <div className={order.status === 'cancelled' ? 'line-through text-gray-400' : ''}>{formatMoney(calculateNetAmount(order))}</div>
                          <div className="text-xs text-gray-500">{parseFloat(order.platformFee || '0') > 0 && !isOfflineOrderLocal(order) ? 'After platform fee' : 'No platform fee'}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex gap-1 flex-wrap">
                          {(() => {
                            const refAmt = parseFloat(order.amountRefunded || '0');
                            const paidAmt = parseFloat(order.amountPaid || '0');
                            const isOffline = !order.stripePaymentIntentId;
                            if (refAmt > 0 && (order.status === 'cancelled' || refAmt >= paidAmt)) {
                              return <Badge className="bg-purple-100 text-purple-800 text-xs">{(order.refundedAt || isOffline) ? 'Refunded' : 'Refund Pending'}</Badge>;
                            } else if (refAmt > 0 && refAmt < paidAmt) {
                              return <Badge className="bg-amber-100 text-amber-800 text-xs">{(order.refundedAt || isOffline) ? 'Partial Refund' : 'Partial Refund Pending'}</Badge>;
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
                          {(order as any).isAutoFulfilled && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200" title="Automatically fulfilled and archived by the system">
                              <Bot className="w-3 h-3 mr-1" />Auto-fulfilled
                            </Badge>
                          )}
                          {(order.isQuote || order.orderSource === 'wholesaler') ? (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200" title="Invoice Order (created by you)">
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
                          {order.pickingStatus && (
                            <PickingStatusBadge status={order.pickingStatus} />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          const refAmt = parseFloat(order.amountRefunded || '0');
                          const paidAmt = parseFloat(order.amountPaid || '0');
                          const isOffline = !order.stripePaymentIntentId;
                          if (refAmt > 0 && (order.status === 'cancelled' || refAmt >= paidAmt)) {
                            return <Badge className="bg-purple-100 text-purple-800 text-xs"><CheckCircle className="w-2 h-2 mr-1" />{(order.refundedAt || isOffline) ? 'Refunded' : 'Refund Pending'}</Badge>;
                          } else if (refAmt > 0 && refAmt < paidAmt) {
                            return <Badge className="bg-amber-100 text-amber-800 text-xs"><CheckCircle className="w-2 h-2 mr-1" />{(order.refundedAt || isOffline) ? 'Partial Refund' : 'Partial Refund Pending'}</Badge>;
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
                              {order.paymentStatus !== 'unpaid' && !(order as any).stripePaymentIntentId && order.status !== 'cancelled' && (
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); setMarkAsUnpaidOrder(order); setIsMarkAsUnpaidOpen(true); }}
                                  className="text-red-600 focus:text-red-700 cursor-pointer"
                                >
                                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                                  Undo Payment
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
                              {order.status !== 'fulfilled' && (
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); markAsFulfilled(order.id); }}
                                  className="text-blue-600 focus:text-blue-700 cursor-pointer"
                                >
                                  <CheckCircle className="h-3.5 w-3.5 mr-2" />
                                  Mark Fulfilled
                                </DropdownMenuItem>
                              )}
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
              <div className={`lg:hidden space-y-3 ${selectedOrderIds.size > 0 && !isViewer ? 'pb-28' : ''}`}>
                {filteredByPicking.slice(0, 50).map((order, index, arr) => {
                  const currentLabel = order.createdAt ? getDateLabel(order.createdAt) : '';
                  const prevLabel = index > 0 && arr[index - 1]!.createdAt ? getDateLabel(arr[index - 1]!.createdAt) : '';
                  const showSeparator = index === 0 || currentLabel !== prevLabel;
                  return (
                    <div key={order.id}>
                      {showSeparator && (
                        <div className="py-2 px-1 border-b border-gray-200 mb-3">
                          <span className="text-xs font-semibold text-gray-500">{currentLabel}</span>
                        </div>
                      )}
                  <Card className={`cursor-pointer transition-shadow ${order.status === 'cancelled' ? 'bg-gray-50 border-gray-200 opacity-70 hover:shadow-sm' : `hover:shadow-md ${selectedOrderIds.has(order.id) ? 'ring-2 ring-emerald-400' : ''}`}`} onClick={() => loadOrderDetails(order)}>
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-start gap-2">
                          {!isViewer && (
                            <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 accent-emerald-600 cursor-pointer"
                                checked={selectedOrderIds.has(order.id)}
                                onChange={(e) => {
                                  const next = new Set(selectedOrderIds);
                                  if (e.target.checked) next.add(order.id); else next.delete(order.id);
                                  setSelectedOrderIds(next);
                                }}
                              />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-xs">{order.orderNumber || `#${order.id}`}</div>
                            <div className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString('en-GB', { timeZone: 'Europe/London' })}</div>
                            {(() => { const due = getBalanceDueDate(order); return due ? <div className="text-xs text-amber-600 font-medium">Due {due.toLocaleDateString('en-GB')}</div> : null; })()}
                            {order.businessProfileName && (
                              <Badge className="mt-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-normal px-1.5 py-0" variant="outline">
                                {order.businessProfileName}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <div className={`font-semibold text-sm ${order.status === 'cancelled' ? 'line-through text-gray-400' : ''}`}>{formatMoney(calculateNetAmount(order))}</div>
                            <div className="text-xs text-gray-500">{isStripePayment(order) ? 'After fee' : 'No fee'}</div>
                          </div>
                          <Eye className="h-3.5 w-3.5 text-gray-400" />
                        </div>
                      </div>

                      <div className="mb-2">
                        <div className="font-medium text-xs">{order.retailer?.businessName || (`${order.retailer?.firstName || ''} ${order.retailer?.lastName || ''}`.trim()) || order.customerName || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">{order.customerEmail}</div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(() => {
                          const refAmt = parseFloat(order.amountRefunded || '0');
                          const paidAmt = parseFloat(order.amountPaid || '0');
                          const isOffline = !order.stripePaymentIntentId;
                          if (refAmt > 0 && (order.status === 'cancelled' || refAmt >= paidAmt)) {
                            return <Badge className="bg-purple-100 text-purple-800 text-xs">{(order.refundedAt || isOffline) ? 'Refunded' : 'Refund Pending'}</Badge>;
                          } else if (refAmt > 0 && refAmt < paidAmt) {
                            return <Badge className="bg-amber-100 text-amber-800 text-xs">{(order.refundedAt || isOffline) ? 'Partial Refund' : 'Partial Refund Pending'}</Badge>;
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
                        {(order as any).isAutoFulfilled && (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200" title="Automatically fulfilled and archived by the system">
                            <Bot className="w-3 h-3 mr-1" />Auto-fulfilled
                          </Badge>
                        )}
                        {(order.isQuote || order.orderSource === 'wholesaler') ? (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                            <UserPen className="w-3 h-3 mr-1" />Invoice
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
                        {order.pickingStatus && (
                          <PickingStatusBadge status={order.pickingStatus} />
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
                            {order.status !== 'fulfilled' && (
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); markAsFulfilled(order.id); }}
                                className="text-blue-600 focus:text-blue-700 cursor-pointer"
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Mark Fulfilled
                              </DropdownMenuItem>
                            )}
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

      {/* Undo Payment Confirmation Dialog */}
      <Dialog open={isMarkAsUnpaidOpen} onOpenChange={setIsMarkAsUnpaidOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-red-500" />
              Undo Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {markAsUnpaidOrder && (
              <p className="text-sm text-gray-600">
                This will reset the payment record for order{' '}
                <span className="font-medium text-gray-900">
                  {markAsUnpaidOrder.orderNumber || `#${markAsUnpaidOrder.id}`}
                </span>{' '}
                back to unpaid. Any partial payments recorded will also be cleared.
              </p>
            )}
            <p className="text-xs text-gray-400">
              Only use this if the payment was recorded by mistake. You can re-record the correct payment afterwards.
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setIsMarkAsUnpaidOpen(false)} disabled={isMarkingUnpaid}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleMarkAsUnpaid}
                disabled={isMarkingUnpaid}
              >
                {isMarkingUnpaid ? 'Undoing...' : 'Undo Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!duplicateInvoiceWarning} onOpenChange={(open) => { if (!open) setDuplicateInvoiceWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Similar invoice created moments ago</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateInvoiceWarning && (
                <>
                  You already created invoice {duplicateInvoiceWarning.orderNumber || `#${duplicateInvoiceWarning.draftId}`} for {formatMoney(parseFloat(duplicateInvoiceWarning.total))} to this customer at{' '}
                  {new Date(duplicateInvoiceWarning.createdAt).toLocaleTimeString()}. Are you sure you want to approve this draft as another order?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateInvoiceWarning(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const draftId = duplicateInvoiceWarning?.draftId;
                setDuplicateInvoiceWarning(null);
                if (draftId != null) handleApproveDraft(draftId, true);
              }}
            >
              Approve Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </div>
  );
}