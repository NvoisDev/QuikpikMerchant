import { useState, useEffect, useRef, useCallback } from "react";
import { calculatePlatformFee } from "@shared/utils/fees";
import { formatWeight } from "@shared/utils/currency";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign, Clock, CheckCircle, X, Truck, MapPin, Camera, Image as ImageIcon,
  RefreshCw, FileText, Loader2, Share2, Package, ChevronLeft, Home, Building, Warehouse, Building2,
  Pencil, Plus, Minus, Search, MessageCircle, MoreHorizontal, Copy, Link, ClipboardList
} from "lucide-react";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/useCurrency";
import { getOfflinePaymentDefaultAmount } from "@/lib/order-payment-balances";
import { QuoteActivityLog } from "@/components/orders/QuoteActivityLog";
import { EditQuoteView } from "@/components/orders/EditQuoteView";
import { CancelOrderView } from "@/components/orders/CancelOrderView";
import { useSidebarContext } from "@/contexts/sidebar-context";
import { PickingMode } from "@/components/orders/PickingMode";

interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: string;
  total: string;
  sellingType?: 'units' | 'pallets';
  product: {
    id: number;
    name: string;
    imageUrl?: string;
    moq?: number;
    packQuantity?: number;
    unitSize?: string | null;
    unitOfMeasure?: string | null;
    costPrice?: string | null;
  };
  appliedOfferLabel?: string | null;
  freeItems?: number;
}

interface EditItem {
  productId: number;
  productName: string;
  quantity: number;
  customPrice: number;
  sellingType: 'units' | 'pallets';
  imageUrl?: string;
  stock?: number;
  palletStock?: number;
}

interface SimpleProduct {
  id: number;
  name: string;
  price: string;
  palletPrice?: string;
  stock: number;
  palletStock?: number;
  imageUrl?: string;
  sellingFormat?: string;
  unitsPerPallet?: number;
}

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
  paymentMethod?: string;
  stripePaymentLinkUrl?: string;
  customerTransactionFee?: string;
  vatAmount?: string;
  vatRateApplied?: string;
  wholesalerBusinessName?: string;
  businessProfileId?: number | null;
  businessProfileName?: string | null;
  amountRefunded?: string;
  refundReason?: string;
  refundedAt?: string;
  stripePaymentIntentId?: string;
  notes?: string;
  cancelledAt?: string;
  retailer?: { phoneNumber?: string | null; businessName?: string | null; firstName?: string | null; lastName?: string | null; name?: string | null };
  stockRestored?: boolean;
  stockRestoredCount?: number;
  readyToCollectAt?: string;
  fulfilledAt?: string;
  collectionAddressId?: number | null;
  collectionAddress?: {
    id: number;
    name: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postcode: string;
    country: string;
    isDefault: boolean;
    isActive: boolean;
  } | null;
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
    return <div className="text-xs text-red-500">Unable to load delivery address</div>;
  }

  const getAddressIcon = (label: string) => {
    switch (label?.toLowerCase()) {
      case 'home': return <Home className="h-4 w-4 text-green-600" />;
      case 'office': case 'work': return <Building className="h-4 w-4 text-blue-600" />;
      case 'warehouse': return <Warehouse className="h-4 w-4 text-purple-600" />;
      default: return <MapPin className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="bg-white p-3 rounded border border-blue-200 mt-3">
      <h6 className="font-medium text-blue-900 mb-2 text-sm flex items-center gap-2">
        {getAddressIcon(address.label || 'other')}
        Delivery Address:
      </h6>
      <div className="text-sm text-gray-700 space-y-1">
        {address.addressLine1 && <div>{address.addressLine1}</div>}
        {address.addressLine2 && <div>{address.addressLine2}</div>}
        {address.city && <div>{address.city}</div>}
        {address.postalCode && <div>{address.postalCode}</div>}
        {address.country && <div>{address.country}</div>}
      </div>
      {address.label && (
        <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit mt-2">
          {address.label.charAt(0).toUpperCase() + address.label.slice(1)}
        </div>
      )}
      {address.instructions && (
        <div className="text-xs text-gray-600 bg-amber-50 px-2 py-1 rounded border border-amber-200 mt-2">
          <span className="font-medium">Instructions:</span> {address.instructions}
        </div>
      )}
    </div>
  );
};

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

const getPaymentMethodLabel = (method: string): string => {
  const labels: Record<string, string> = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    payment_link: 'Payment Link',
    pay_later: 'Pay Later',
    card: 'Card Payment',
    cheque: 'Cheque',
    other: 'Other',
  };
  return labels[method] || method;
};

const OFFLINE_PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'pay_later', 'other'];

const isStripePayment = (order: Order): boolean => {
  // A Stripe payment intent means Stripe was actually used, even if the payment method
  // field says "bank_transfer" (e.g. quote created offline but customer paid via link)
  if (order.stripePaymentIntentId || order.stripePaymentLinkUrl) return true;
  if (OFFLINE_PAYMENT_METHODS.includes(order.paymentMethod || '')) return false;
  return order.paymentMethod === 'payment_link';
};

const isOfflineOrder = (order: Order): boolean =>
  OFFLINE_PAYMENT_METHODS.includes(order.paymentMethod || '') && !isStripePayment(order);

const calculateNetAmount = (order: Order) => {
  const subtotal = parseFloat(order.subtotal || '0');
  const deliveryCost = parseFloat(order.deliveryCost || '0');
  // Truly offline orders (no Stripe payment signals) never incur a platform fee
  if (isOfflineOrder(order)) return subtotal + deliveryCost;
  // Only deduct what is actually stored — never fall back to a default rate
  const actualPlatformFee = parseFloat(order.platformFee || '0');
  if (actualPlatformFee <= 0) return subtotal + deliveryCost;
  return (subtotal + deliveryCost) - actualPlatformFee;
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';
  const { formatMoney } = useCurrency();
  const { toast } = useToast();
  const { isDesktopCollapsed } = useSidebarContext();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonCategory, setCancelReasonCategory] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetryingRefund, setIsRetryingRefund] = useState(false);
  const [isMarkingRefunded, setIsMarkingRefunded] = useState(false);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [isSharingInvoice, setIsSharingInvoice] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [processRefund, setProcessRefund] = useState(true);
  const [refundType, setRefundType] = useState<'card'>('card');
  const [restockInventory, setRestockInventory] = useState(true);
  const [sendNotification, setSendNotification] = useState(true);
  const [staffNote, setStaffNote] = useState('');
  const [refundDelivery, setRefundDelivery] = useState(false);
  const [returnItems, setReturnItems] = useState<Array<{ productId: number; quantity: number; sellingType: string; maxQty: number }>>([]);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [pendingCancellationRequestId, setPendingCancellationRequestId] = useState<number | null>(null);

  const [isMarkAsPaidOpen, setIsMarkAsPaidOpen] = useState(false);
  const [isFulfillConfirmOpen, setIsFulfillConfirmOpen] = useState(false);
  const [isPickingWarningOpen, setIsPickingWarningOpen] = useState(false);
  const [pendingFulfillAction, setPendingFulfillAction] = useState<'mark_fulfilled' | 'ready_for_collection' | null>(null);
  const [markAsPaidAmount, setMarkAsPaidAmount] = useState('');
  const [markAsPaidMethod, setMarkAsPaidMethod] = useState('cash');
  const [markAsPaidNote, setMarkAsPaidNote] = useState('');
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  const [showEditMode, setShowEditMode] = useState(false);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>('bank_transfer');
  const [editProductDialogOpen, setEditProductDialogOpen] = useState(false);
  const [editProductSearch, setEditProductSearch] = useState('');
  const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false);
  const [showPickingMode, setShowPickingMode] = useState(false);

  const swipeTouchStartX = useRef<number | null>(null);
  const swipeTouchStartY = useRef<number | null>(null);
  const [swipeDx, setSwipeDx] = useState(0);
  const SWIPE_EDGE_THRESHOLD = 40;
  const SWIPE_COMPLETE_THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX <= SWIPE_EDGE_THRESHOLD) {
      swipeTouchStartX.current = touch.clientX;
      swipeTouchStartY.current = touch.clientY;
    } else {
      swipeTouchStartX.current = null;
      swipeTouchStartY.current = null;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeTouchStartX.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - swipeTouchStartX.current;
    const dy = Math.abs(touch.clientY - (swipeTouchStartY.current ?? 0));
    if (dy > dx) {
      swipeTouchStartX.current = null;
      setSwipeDx(0);
      return;
    }
    if (dx > 0) {
      setSwipeDx(dx);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeDx >= SWIPE_COMPLETE_THRESHOLD) {
      navigate('/orders');
    }
    swipeTouchStartX.current = null;
    swipeTouchStartY.current = null;
    setSwipeDx(0);
  }, [swipeDx, navigate]);

  const handleTouchCancel = useCallback(() => {
    swipeTouchStartX.current = null;
    swipeTouchStartY.current = null;
    setSwipeDx(0);
  }, []);

  const { data: editProducts = [] } = useQuery<SimpleProduct[]>({
    queryKey: ['/api/products'],
    enabled: showEditMode,
  });

  const { data: stripeConnectStatus } = useQuery<{ isConnected: boolean }>({
    queryKey: ['/api/stripe/connect/status'],
  });
  const stripeReady = stripeConnectStatus?.isConnected === true;
  const isOfflinePayment = OFFLINE_PAYMENT_METHODS.includes(order?.paymentMethod || '');
  const canUsePaymentLink = !isOfflinePayment && stripeReady;

  const { data: pickingStateData } = useQuery<{
    pickingStatus: 'not_started' | 'picking' | 'packed';
    items: Array<{ orderItemId: number; isPicked: boolean }>;
  }>({
    queryKey: [`/api/orders/${order?.id}/picking`],
    enabled: !!order?.id,
  });
  const isFullyPicked = pickingStateData?.pickingStatus === 'packed';

  useEffect(() => {
    if (!id) return;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) return;

    setLoading(true);
    fetch(`/api/orders/${orderId}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        setOrder(data);
        setLoading(false);
        const params = new URLSearchParams(window.location.search);
        if (params.get('action') === 'cancel' && data.items && data.status !== 'cancelled') {
          setReturnItems(data.items.map((item: OrderItem) => ({
            productId: item.productId,
            quantity: item.quantity,
            sellingType: (item as unknown as Record<string, unknown>).sellingType as string || 'units',
            maxQty: item.quantity
          })));
          setCancelReasonCategory('customer_request');
          setShowCancelForm(true);
          const requestId = params.get('requestId');
          if (requestId) {
            setPendingCancellationRequestId(parseInt(requestId, 10));
          }
        } else if (params.get('action') === 'cancel' && data.status === 'cancelled') {
          window.history.replaceState({}, '', window.location.pathname);
        }
      })
      .catch((err) => {
        console.error('[order-detail] failed to load order:', err);
        setLoading(false);
        toast({
          title: "Couldn't load order",
          description: "Something went wrong loading this order. Please refresh the page.",
          variant: "destructive",
        });
      });
  }, [id]);

  const buildShareMessage = (o: Order): string => {
    const orderRef = o.orderNumber || `#${o.id}`;
    const liveRetailerName = o.retailer
      ? (`${o.retailer?.firstName || ''} ${o.retailer?.lastName || ''}`.trim() || o.retailer?.businessName || '')
      : '';
    const customerFirstName = (liveRetailerName || o.customerName || 'there').split(' ')[0] || 'there';
    const businessName =
      (user as AuthUser)?.businessName ||
      o.wholesalerBusinessName ||
      ((user as AuthUser)?.firstName ? `${(user as AuthUser).firstName} ${(user as AuthUser).lastName || ''}`.trim() : null) ||
      'Your supplier';

    const lines: string[] = [];
    lines.push(`Hi ${customerFirstName} 👋`);
    lines.push('');
    lines.push(`Here's your invoice from ${businessName}.`);
    lines.push('');
    lines.push(`📋 Invoice: ${orderRef}`);

    const anyPromos = (o.items || []).some(item => item.appliedOfferLabel || (item.freeItems || 0) > 0);
    if (o.items && o.items.length > 0) {
      const shown = o.items.slice(0, 3).map(item => {
        const name = item.product?.name || 'item';
        const label = item.appliedOfferLabel;
        const free = item.freeItems || 0;
        let suffix = '';
        if (label && free > 0) suffix = ` (${label}, +${free} free)`;
        else if (label) suffix = ` (${label})`;
        else if (free > 0) suffix = ` (+${free} free)`;
        return `${item.quantity}× ${name}${suffix}`;
      });
      const extra = o.items.length > 3 ? ` + ${o.items.length - 3} more` : '';
      lines.push(`🛍️ ${shown.join(', ')}${extra}`);
    }

    const total = parseFloat(o.total || '0');
    if (total > 0) lines.push(`💰 Total: ${formatMoney(total)}`);

    if (o.fulfillmentType === 'pickup' || o.fulfillmentType === 'collection') {
      lines.push(`📦 Collection from your store`);
    } else if (o.deliveryAddress) {
      lines.push(`📦 Delivery to: ${o.deliveryAddress}`);
    }

    const outstanding = parseFloat(o.amountOutstanding || '0');
    if (outstanding > 0) {
      lines.push('');
      lines.push(`💳 Balance due: ${formatMoney(outstanding)}`);
      if (o.stripePaymentLinkUrl && stripeReady) {
        lines.push(`Pay here → ${o.stripePaymentLinkUrl}`);
      }
    }

    if (anyPromos) {
      lines.push('');
      lines.push(`🏷️ Promotional pricing applied — see your invoice for full details.`);
    }

    lines.push('');
    lines.push(`Thank you for your order! 🙏`);
    lines.push(businessName);

    return lines.join('\n');
  };

  const downloadInvoice = async () => {
    if (!order) return;
    setIsDownloadingInvoice(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/invoice`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to generate invoice');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${order.orderNumber || order.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Error', description: 'Could not generate the invoice. Please try again.', variant: 'destructive' });
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  const shareInvoice = async () => {
    if (!order) return;
    setIsSharingInvoice(true);
    try {
      const filename = `invoice-${order.orderNumber || order.id}.pdf`;
      const orderRef = order.orderNumber || `#${order.id}`;
      const docType = 'Invoice';

      let nativeShareSucceeded = false;
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
        try {
          const response = await fetch(`/api/orders/${order.id}/invoice/customer`, { credentials: 'include' });
          if (response.ok) {
            const blob = await response.blob();
            const file = new File([blob], filename, { type: 'application/pdf' });
            if (navigator.canShare({ files: [file] })) {
              const shareMessage = buildShareMessage(order);
              await navigator.share({ title: `${docType} ${orderRef}`, text: shareMessage, files: [file] });
              nativeShareSucceeded = true;
              return;
            }
          }
        } catch (shareErr: unknown) {
          if (shareErr instanceof DOMException && (shareErr.name === 'AbortError' || shareErr.name === 'NotAllowedError')) return;
        }
      }

      if (!nativeShareSucceeded) {
        await apiRequest('POST', `/api/orders/${order.id}/share-invoice`);
        toast({ title: 'Invoice sent', description: 'The invoice has been emailed to the customer.' });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      const message = err instanceof Error ? err.message : '';
      if (message.includes('400')) {
        toast({ title: 'No email on file', description: 'This customer has no email address on record.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: 'Could not share the invoice. Please try again.', variant: 'destructive' });
      }
    } finally {
      setIsSharingInvoice(false);
    }
  };

  const sendInvoiceWhatsApp = async () => {
    if (!order) return;
    setIsSendingWhatsApp(true);
    try {
      await apiRequest('POST', `/api/orders/${order.id}/share-invoice-whatsapp`);
      toast({ title: 'SMS sent', description: 'The invoice has been sent to the customer via SMS.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('400')) {
        toast({ title: 'No phone number on file', description: 'This customer has no phone number on record.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: 'Could not send the SMS. Please try again.', variant: 'destructive' });
      }
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const sendInvoiceNativeShare = async () => {
    if (!order) return;
    setIsSendingWhatsApp(true);
    try {
      const orderRef = order.orderNumber || `#${order.id}`;
      if (typeof navigator !== 'undefined' && navigator.share) {
        const shareMessage = buildShareMessage(order);
        try {
          await navigator.share({ title: `Invoice ${orderRef}`, text: shareMessage });
          return;
        } catch (shareErr: unknown) {
          if (shareErr instanceof DOMException &&
              (shareErr.name === 'AbortError' || shareErr.name === 'NotAllowedError')) return;
        }
      }
      await apiRequest('POST', `/api/orders/${order.id}/share-invoice-whatsapp`);
      toast({ title: 'SMS sent', description: 'The invoice has been sent to the customer via SMS.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('400')) {
        toast({ title: 'No phone number on file', description: 'This customer has no phone number on record.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: 'Could not share the invoice. Please try again.', variant: 'destructive' });
      }
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const cancelOrder = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      const itemsToReturn = returnItems.filter(item => item.quantity > 0);
      const reasonLabel = cancellationReasons.find(r => r.value === cancelReasonCategory)?.label || cancelReasonCategory;
      const fullReason = cancelReason ? `${reasonLabel}: ${cancelReason}` : reasonLabel;

      const response = await fetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reason: fullReason,
          reasonCategory: cancelReasonCategory,
          processRefund: processRefund,
          refundType: processRefund ? refundType : undefined,
          returnedItems: itemsToReturn.length > 0 ? itemsToReturn : undefined,
          refundDelivery: refundDelivery && itemsToReturn.length > 0,
          restockInventory,
          sendNotification,
          staffNote: staffNote || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        const updatedOrder = data.order || { ...order, status: 'cancelled' };
        setOrder(updatedOrder);
        setShowCancelForm(false);
        window.history.replaceState({}, '', window.location.pathname);
        setCancelReason('');
        setCancelReasonCategory('');
        setProcessRefund(true);
        setRefundType('card');
        setReturnItems([]);
        setRefundDelivery(false);
        setRestockInventory(true);
        setSendNotification(true);
        setStaffNote('');

        if (pendingCancellationRequestId) {
          await fetch(`/api/cancellation-requests/${pendingCancellationRequestId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ approved: true })
          }).catch((err) => {
            console.error('[order-detail] failed to acknowledge cancellation request:', err);
            toast({ title: "Acknowledgement failed", description: "Cancellation was processed but the request acknowledgement failed.", variant: "destructive" });
          });
          setPendingCancellationRequestId(null);
        }

        if (data.refundFailed) {
          toast({
            title: "Order Cancelled",
            description: `Order cancelled but the card refund failed — use "Retry Refund" to resend it to Stripe.`,
            variant: "destructive",
          });
        } else {
          const refundMessage = processRefund ? ' A refund has been initiated.' : '';
          toast({
            title: "Order Cancelled",
            description: `The order has been successfully cancelled.${refundMessage}`,
          });
        }
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || errorData.error || "Failed to cancel order",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to cancel order - network error", variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  const retryRefund = async () => {
    if (!order) return;
    setIsRetryingRefund(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/retry-refund`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: "Refund Sent", description: data.message });
        if (data.order) setOrder(data.order);
      } else {
        toast({
          title: "Refund Failed",
          description: data.error || data.message || "Stripe refund failed — check Stripe dashboard",
          variant: "destructive"
        });
      }
    } catch {
      toast({ title: "Error", description: "Network error — please try again", variant: "destructive" });
    } finally {
      setIsRetryingRefund(false);
    }
  };

  const markAsRefunded = async () => {
    if (!order) return;
    setIsMarkingRefunded(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/mark-refunded`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: "Marked as Refunded", description: data.message });
        if (data.order) setOrder(data.order);
      } else {
        toast({
          title: "Failed",
          description: data.error || data.message || "Could not mark order as refunded",
          variant: "destructive"
        });
      }
    } catch {
      toast({ title: "Error", description: "Network error — please try again", variant: "destructive" });
    } finally {
      setIsMarkingRefunded(false);
    }
  };

  const markAsFulfilled = async () => {
    if (!order) return;
    setUpdatingOrderId(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fulfilled' })
      });
      if (response.ok) setOrder({ ...order, status: 'fulfilled' });
    } catch (error) {
      console.error('Failed to update order status:', error);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const markReadyForCollection = async () => {
    if (!order) return;
    setUpdatingOrderId(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}/ready-for-collection`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (response.ok) {
        setOrder({ ...order, status: 'ready_for_collection' });
        toast({
          title: "Order marked as ready for collection",
          description: "Customer has been notified via email",
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to mark order as ready');
      }
    } catch (error) {
      toast({
        title: "Failed to mark as ready",
        description: error instanceof Error ? error.message : "Unable to mark order as ready for collection",
        variant: "destructive",
      });
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const generateAndCopyPaymentLink = async () => {
    if (!order) return;
    setIsGeneratingPaymentLink(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/generate-balance-link`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success && data.paymentLink) {
        if (data.order) setOrder({ ...order, ...data.order, stripePaymentLinkUrl: data.paymentLink });
        const orderRef = order.orderNumber || `#${order.id}`;
        const shareTitle = `Payment for Order ${orderRef}`;
        const shareText = `Hi, here is your payment link for order ${orderRef}:`;

        if (navigator.share) {
          // Try to attach the invoice PDF to the share sheet
          let pdfFile: File | null = null;
          try {
            const pdfRes = await fetch(`/api/orders/${order.id}/invoice/customer`, { credentials: 'include' });
            if (pdfRes.ok) {
              const blob = await pdfRes.blob();
              pdfFile = new File([blob], `invoice-${orderRef}.pdf`, { type: 'application/pdf' });
            }
          } catch { /* non-fatal — share without PDF */ }

          const shareWithFile = pdfFile && navigator.canShare?.({ files: [pdfFile] });
          const shareData = shareWithFile
            ? { title: shareTitle, text: shareText, url: data.paymentLink, files: [pdfFile!] }
            : { title: shareTitle, text: shareText, url: data.paymentLink };

          try {
            await navigator.share(shareData);
          } catch (err: any) {
            if (err?.name !== 'AbortError' && err?.name !== 'NotAllowedError') {
              try { await navigator.clipboard.writeText(data.paymentLink); } catch {}
              toast({ title: "Link Copied", description: "Payment link copied to clipboard." });
            }
          }
        } else {
          try { await navigator.clipboard.writeText(data.paymentLink); } catch {}
          toast({ title: "Payment Link Copied", description: "Payment link copied to clipboard." });
        }
      } else {
        toast({ title: "Error", description: data.error || "Failed to generate payment link", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate payment link", variant: "destructive" });
    } finally {
      setIsGeneratingPaymentLink(false);
    }
  };

  const uploadOrderPhoto = async (file: File) => {
    if (!order) throw new Error('No order loaded');
    const formData = new FormData();
    formData.append('photo', file);
    const response = await fetch(`/api/orders/${order.id}/upload-photo`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed (${response.status})`);
    }
    const data = await response.json();
    if (data.image) {
      setOrder(prev => prev ? { ...prev, orderImages: [...(prev.orderImages || []), data.image] } : prev);
      toast({ title: "Photo Added", description: "Order photo uploaded successfully" });
    }
  };

  const handleDeletePhoto = async (imageId: string) => {
    if (!order) return;
    try {
      const response = await fetch(`/api/orders/${order.id}/delete-image/${imageId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete photo');
      setOrder({ ...order, orderImages: order.orderImages?.filter(img => img.id !== imageId) || [] });
      toast({ title: "Photo Deleted", description: "Photo removed successfully" });
    } catch {
      toast({ title: "Delete Failed", description: "Failed to delete photo", variant: "destructive" });
    }
  };

  const openMarkAsPaid = () => {
    if (!order) return;
    setMarkAsPaidAmount(getOfflinePaymentDefaultAmount(order));
    setMarkAsPaidMethod('cash');
    setMarkAsPaidNote('');
    setIsMarkAsPaidOpen(true);
  };

  const handleMarkAsPaid = async () => {
    if (!order) return;
    const parsed = parseFloat(markAsPaidAmount);
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: 'Invalid amount', description: 'Please enter an amount greater than 0', variant: 'destructive' });
      return;
    }
    setIsMarkingPaid(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/mark-as-paid`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsed, method: markAsPaidMethod, note: markAsPaidNote }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setOrder({
          ...order,
          amountPaid: data.order.amountPaid,
          amountOutstanding: data.order.amountOutstanding,
          paymentStatus: data.order.paymentStatus,
          status: data.order.status,
        });
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

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="bg-white min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Order not found.</p>
        <Button variant="outline" onClick={() => navigate('/orders')}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Orders
        </Button>
      </div>
    );
  }

  if (showEditMode && order) {
    return (
      <EditQuoteView
        order={order}
        editItems={editItems}
        setEditItems={setEditItems}
        editPaymentMethod={editPaymentMethod}
        setEditPaymentMethod={setEditPaymentMethod}
        editProductDialogOpen={editProductDialogOpen}
        setEditProductDialogOpen={setEditProductDialogOpen}
        editProductSearch={editProductSearch}
        setEditProductSearch={setEditProductSearch}
        editProducts={editProducts}
        formatMoney={formatMoney}
        onCancel={() => setShowEditMode(false)}
        onSaved={(updatedOrder) => {
          if (updatedOrder) setOrder(updatedOrder);
          setShowEditMode(false);
        }}
      />
    );
  }

  if (showCancelForm) {
    return (
      <CancelOrderView
        order={order}
        returnItems={returnItems}
        setReturnItems={setReturnItems}
        cancelReasonCategory={cancelReasonCategory}
        setCancelReasonCategory={setCancelReasonCategory}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        processRefund={processRefund}
        setProcessRefund={setProcessRefund}
        refundType={refundType}
        setRefundType={setRefundType}
        refundDelivery={refundDelivery}
        setRefundDelivery={setRefundDelivery}
        restockInventory={restockInventory}
        setRestockInventory={setRestockInventory}
        sendNotification={sendNotification}
        setSendNotification={setSendNotification}
        staffNote={staffNote}
        setStaffNote={setStaffNote}
        isCancelling={isCancelling}
        formatMoney={formatMoney}
        onBack={() => {
          setShowCancelForm(false);
          setCancelReasonCategory('');
          setCancelReason('');
          setProcessRefund(false);
          setRefundType('card');
          setRefundDelivery(false);
          setRestockInventory(true);
          setSendNotification(true);
          setStaffNote('');
        }}
        onConfirm={cancelOrder}
      />
    );
  }

  // ─── Sticky action bar logic ───────────────────────────────────────────────
  const isPaid = order.paymentStatus === 'paid';
  const isCancelled = order.status === 'cancelled';
  const isFulfilled = order.status === 'fulfilled';
  const isReadyForCollection = order.status === 'ready_for_collection';
  const isPickup = order.fulfillmentType === 'pickup' || order.fulfillmentType === 'collection';

  type PrimaryAction = 'send_payment_link' | 'record_payment' | 'ready_for_collection' | 'mark_fulfilled' | null;

  const getPrimaryAction = (): PrimaryAction => {
    if (isViewer || isCancelled) return null;
    if (!isPaid) {
      const canSendLink = ((order.isQuote || order.paymentMethod === 'payment_link') && canUsePaymentLink);
      return canSendLink ? 'send_payment_link' : 'record_payment';
    }
    if (isFulfilled) return null;
    if (isPickup && !isReadyForCollection) return 'ready_for_collection';
    return 'mark_fulfilled';
  };

  const primaryAction = getPrimaryAction();

  const primaryActionConfig: Record<NonNullable<PrimaryAction>, { label: string; color: string; icon: React.ReactNode; onClick: () => void; loading?: boolean }> = {
    send_payment_link: {
      label: 'Send Payment Link',
      color: 'bg-blue-600 hover:bg-blue-700',
      icon: <Link className="h-4 w-4 mr-2" />,
      onClick: generateAndCopyPaymentLink,
      loading: isGeneratingPaymentLink,
    },
    record_payment: {
      label: 'Record Payment',
      color: 'bg-green-600 hover:bg-green-700',
      icon: <DollarSign className="h-4 w-4 mr-2" />,
      onClick: openMarkAsPaid,
    },
    ready_for_collection: {
      label: 'Ready for Collection',
      color: 'bg-orange-500 hover:bg-orange-600',
      icon: <Clock className="h-4 w-4 mr-2" />,
      onClick: () => {
        if (!isFullyPicked) {
          setPendingFulfillAction('ready_for_collection');
          setIsPickingWarningOpen(true);
        } else {
          markReadyForCollection();
        }
      },
      loading: updatingOrderId === order.id,
    },
    mark_fulfilled: {
      label: 'Mark as Fulfilled',
      color: 'bg-green-600 hover:bg-green-700',
      icon: <CheckCircle className="h-4 w-4 mr-2" />,
      onClick: () => {
        if (!isFullyPicked) {
          setPendingFulfillAction('mark_fulfilled');
          setIsPickingWarningOpen(true);
        } else {
          setIsFulfillConfirmOpen(true);
        }
      },
      loading: updatingOrderId === order.id,
    },
  };

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <div
      className="bg-gray-50 min-h-screen relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {swipeDx > 0 && (
        <div
          className="fixed inset-y-0 left-0 z-50 flex items-center pointer-events-none"
          style={{ width: `${Math.min(swipeDx, 80)}px` }}
        >
          <div
            className="absolute inset-0 bg-white"
            style={{ opacity: Math.min(swipeDx / SWIPE_COMPLETE_THRESHOLD, 1) * 0.35 }}
          />
          {swipeDx >= SWIPE_COMPLETE_THRESHOLD * 0.4 && (
            <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white shadow ml-2"
              style={{ opacity: Math.min((swipeDx - SWIPE_COMPLETE_THRESHOLD * 0.4) / (SWIPE_COMPLETE_THRESHOLD * 0.6), 1) }}>
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </div>
          )}
        </div>
      )}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-3 pb-28 text-sm">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/orders')} className="p-2 -ml-2">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">Order {order.orderNumber || `#${order.id}`}</h1>
            <p className="text-xs text-gray-400">
              {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {order.isQuote && order.status === 'pending' && order.paymentStatus !== 'paid' && !isViewer && (
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:bg-blue-50 text-xs h-9 px-3"
                onClick={() => {
                  const items: EditItem[] = (order.items || []).map(item => ({
                    productId: item.productId,
                    productName: item.product?.name || `Product #${item.productId}`,
                    quantity: item.quantity,
                    customPrice: parseFloat(item.unitPrice || '0'),
                    sellingType: (item.sellingType as 'units' | 'pallets') || 'units',
                    imageUrl: item.product?.imageUrl,
                    quantityInPack: item.product?.quantityInPack,
                    sellingFormat: item.product?.sellingFormat,
                    unitsPerPallet: item.product?.unitsPerPallet,
                    palletPrice: item.product?.palletPrice ? parseFloat(String(item.product.palletPrice)) : undefined,
                    unitPrice: item.product?.price ? parseFloat(String(item.product.price)) : undefined,
                    palletMoq: item.product?.palletMoq,
                  }));
                  setEditItems(items);
                  const defaultMethod = order.paymentMethod || (stripeReady ? 'payment_link' : 'bank_transfer');
                  setEditPaymentMethod(defaultMethod);
                  setShowEditMode(true);
                }}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Edit
              </Button>
            )}
            {order.status !== 'cancelled' && order.status !== 'fulfilled' && !isViewer && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {order.paymentStatus !== 'paid' && (
                    <DropdownMenuItem
                      className="text-green-600 focus:text-green-600"
                      onClick={() => setIsMarkAsPaidOpen(true)}
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Mark as Paid
                    </DropdownMenuItem>
                  )}
                  {!['ready_for_collection', 'fulfilled', 'cancelled'].includes(order.status) && (
                    <DropdownMenuItem
                      className="text-orange-600 focus:text-orange-600"
                      onClick={markReadyForCollection}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Mark Ready
                    </DropdownMenuItem>
                  )}
                  {order.status !== 'fulfilled' && (
                    <DropdownMenuItem
                      className="text-blue-600 focus:text-blue-600"
                      onClick={markAsFulfilled}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Mark Fulfilled
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {order.status !== 'fulfilled' && (
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onClick={() => {
                        if (order.items) {
                          setReturnItems(order.items.map(item => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            sellingType: (item as unknown as Record<string, unknown>).sellingType as string || 'units',
                            maxQty: item.quantity
                          })));
                        }
                        setShowCancelForm(true);
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel Order
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {order.status === 'cancelled' && (
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={downloadInvoice} disabled={isDownloadingInvoice} title="Download Invoice">
                {isDownloadingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* ── Status badges ──────────────────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardContent className="p-3">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap items-center">
              {(order.paymentStatus || '').toLowerCase() === 'paid' ? (
                <Badge className="bg-green-100 text-green-800 border-0 text-xs">Paid</Badge>
              ) : (order.paymentStatus || '').toLowerCase() === 'part_paid' ? (
                <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">Part Paid</Badge>
              ) : (
                <Badge className="bg-red-100 text-red-800 border-0 text-xs">Unpaid</Badge>
              )}
              {order.status === 'fulfilled' ? (
                <Badge className="bg-blue-100 text-blue-800 border-0 text-xs">Fulfilled</Badge>
              ) : order.status === 'ready_for_collection' ? (
                <Badge className="bg-yellow-100 text-yellow-800 border-0 text-xs">Ready for Collection</Badge>
              ) : order.status === 'cancelled' ? (
                <Badge className="bg-red-100 text-red-800 border-0 text-xs">Cancelled</Badge>
              ) : (
                <Badge className="bg-gray-100 text-gray-600 border-0 text-xs">Unfulfilled</Badge>
              )}
              {parseFloat(order.amountRefunded || '0') > 0 && (() => {
                const refAmt = parseFloat(order.amountRefunded || '0');
                const paidAmt = parseFloat(order.amountPaid || '0');
                const isFullRefund = paidAmt > 0 && refAmt >= paidAmt * 0.99;
                const isOffline = !order.stripePaymentIntentId;
                if (!order.refundedAt && !isOffline) {
                  return <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">Refund Pending</Badge>;
                }
                return isFullRefund
                  ? <Badge className="bg-purple-100 text-purple-800 border-0 text-xs">Refunded</Badge>
                  : <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">Partial Refund</Badge>;
              })()}
              {order.fulfillmentType && (
                <Badge variant="outline" className="text-xs">
                  {order.fulfillmentType === 'delivery'
                    ? <><Truck className="w-3 h-3 mr-1" />Delivery</>
                    : <><MapPin className="w-3 h-3 mr-1" />Collection</>}
                </Badge>
              )}
              </div>
              {!isViewer && order.status !== 'cancelled' && (
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1.5 text-gray-600 border-gray-300"
                    onClick={downloadInvoice}
                    disabled={isDownloadingInvoice}
                  >
                    {isDownloadingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1.5 text-gray-600 border-gray-300"
                    onClick={shareInvoice}
                    disabled={isSharingInvoice}
                  >
                    {isSharingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                    Share
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1.5 text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100"
                    onClick={() => setShowPickingMode(true)}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Pick
                  </Button>
                </div>
              )}
            </div>
            {order.businessProfileName && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                <Building2 className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                <div>
                  <span className="text-xs text-blue-500">Trading As </span>
                  <span className="text-xs font-semibold text-blue-900">{order.businessProfileName}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Customer + Fulfillment card ────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Customer</h2>
            <div className="space-y-1 text-xs text-gray-700">
              {(() => {
                const r = order.retailer;
                const businessName = r?.businessName || '';
                // Person name: first+last from live retailer, or legacy "name" field, never fall back to customerName when retailer exists
                const personName = r
                  ? (`${r.firstName || ''} ${r.lastName || ''}`.trim() || r.name || '')
                  : (order.customerName || '');
                return (
                  <>
                    {businessName && <div className="font-medium text-sm text-gray-900">{businessName}</div>}
                    {personName && <div className={businessName ? 'text-xs text-gray-600' : 'font-medium text-sm text-gray-900'}>{personName}</div>}
                    {!businessName && !personName && order.customerName && (
                      <div className="font-medium text-sm text-gray-900">{order.customerName}</div>
                    )}
                  </>
                );
              })()}
              {order.customerEmail && <div>{order.customerEmail}</div>}
              {(order.customerPhone || order.retailer?.phoneNumber) && (
                <div>{order.customerPhone || order.retailer?.phoneNumber}</div>
              )}
            </div>

            {order.fulfillmentType === 'delivery' ? (
              <div className="pt-2 border-t">
                <div className="flex items-center gap-1.5 mb-2">
                  <Truck className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-900">Delivery Address</span>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <div className="text-xs text-gray-700">
                    {order.deliveryAddressId ? (
                      <WholesalerDeliveryAddressDisplay addressId={order.deliveryAddressId} />
                    ) : order.deliveryAddress ? (
                      (() => {
                        try {
                          const parsed = JSON.parse(order.deliveryAddress);
                          if (parsed && typeof parsed === 'object') {
                            return (
                              <div className="space-y-0.5">
                                <div className="font-medium text-gray-900">{parsed.addressLine1}</div>
                                {parsed.addressLine2 && <div>{parsed.addressLine2}</div>}
                                <div>{parsed.city}</div>
                                <div>{parsed.postalCode}</div>
                                {parsed.country && <div>{parsed.country}</div>}
                              </div>
                            );
                          }
                        } catch {
                          return <div>{order.deliveryAddress}</div>;
                        }
                        return <div>{order.deliveryAddress}</div>;
                      })()
                    ) : (
                      <span className="text-gray-400 italic">No delivery address</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t">
                <div className="flex items-center gap-1.5 mb-2">
                  <Package className="h-3.5 w-3.5 text-orange-600" />
                  <span className="text-xs font-semibold text-gray-900">Collection</span>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                  <div className="text-xs font-medium text-orange-900">
                    {order.wholesalerBusinessName || 'Business Location'}
                  </div>
                  {(() => {
                    if (order.collectionAddress) {
                      const ca = order.collectionAddress;
                      return (
                        <div className="flex items-start mt-1 gap-1">
                          <MapPin className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                          <div className="text-xs text-orange-800">
                            <span className="font-medium">{ca.name}</span>
                            <span className="ml-1 text-orange-700">— {[ca.addressLine1, ca.addressLine2, ca.city, ca.postcode].filter(Boolean).join(', ')}</span>
                          </div>
                        </div>
                      );
                    }
                    const pickupAddr = (user as AuthUser)?.pickupAddress?.trim();
                    const bizAddr = (user as AuthUser)?.businessAddress?.trim();
                    const resolvedAddr = pickupAddr || bizAddr;
                    if (resolvedAddr) {
                      return (
                        <div className="flex items-start mt-1 gap-1">
                          <MapPin className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-orange-700">{resolvedAddr}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="text-xs text-orange-600 mt-1">
                        Contact the business to arrange collection time and address.
                      </div>
                    );
                  })()}
                  {(user as AuthUser)?.businessPhone && (
                    <div className="text-xs text-orange-600 mt-1">
                      Phone: {(user as AuthUser).businessPhone}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Items card ────────────────────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Items ({order.items?.length || 0})</h2>
            <div className="space-y-3">
              {order.items?.map((item, index) => (
                <div key={index} className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900">{item.product?.name || 'Unknown Product'}</div>
                    {item.product?.unitSize && item.product.unitOfMeasure && (
                      <div className="text-xs text-gray-400">
                        {item.product.packQuantity && item.product.packQuantity > 1
                          ? `${item.product.packQuantity} × ${parseFloat(item.product.unitSize)}${item.product.unitOfMeasure}`
                          : `${parseFloat(item.product.unitSize)}${item.product.unitOfMeasure}`}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-0.5">
                      {item.quantity} {item.sellingType === 'pallets' ? 'pallets' : 'units'} × {formatMoney(parseFloat(item.unitPrice))}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.appliedOfferLabel && (
                        <span className="inline-flex items-center text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                          🎁 {item.appliedOfferLabel}
                        </span>
                      )}
                      {(item.freeItems || 0) > 0 && (
                        <span className="inline-flex items-center text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                          +{item.freeItems} free
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="font-semibold text-sm text-gray-900 flex-shrink-0">
                    {formatMoney(parseFloat(item.total))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Payment Summary card ──────────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Payment Summary</h2>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Products</span>
                <span>{formatMoney(parseFloat(order.subtotal || '0'))}</span>
              </div>
              {(() => {
                const totalWeight = (order.items ?? []).reduce((sum: number, item: any) => {
                  const product = item.product;
                  if (!product) return sum;
                  let weightPerUnit = 0;
                  if (item.sellingType === 'pallets') {
                    weightPerUnit = parseFloat(product.palletWeight ?? '0') || 0;
                  } else {
                    const totalPkgWeight = parseFloat(product.totalPackageWeight ?? '0') || 0;
                    if (totalPkgWeight > 0) {
                      weightPerUnit = totalPkgWeight;
                    } else {
                      const uw = parseFloat(product.unitWeight ?? '0') || 0;
                      const pq = product.packQuantity || product.quantityInPack || 1;
                      weightPerUnit = uw * pq;
                    }
                  }
                  return sum + weightPerUnit * item.quantity;
                }, 0);
                if (totalWeight <= 0) return null;
                return (
                  <div className="flex justify-between text-gray-500">
                    <span>Total Weight</span>
                    <span>{formatWeight(totalWeight)} kg</span>
                  </div>
                );
              })()}
              {parseFloat(order.deliveryCost || '0') > 0 && (
                <div className="flex justify-between text-blue-700">
                  <span>Delivery</span>
                  <span>{formatMoney(parseFloat(order.deliveryCost || '0'))}</span>
                </div>
              )}
              {parseFloat(order.vatAmount || '0') > 0 && (() => {
                const vat = parseFloat(order.vatAmount || '0');
                const storedRate = parseFloat(order.vatRateApplied || '0');
                const sub = parseFloat(order.subtotal || '0');
                const vatPct = storedRate > 0
                  ? Math.round(storedRate * 100)
                  : (sub > 0 ? Math.round((vat / sub) * 100) : 0);
                return (
                  <div className="flex justify-between text-gray-700">
                    <span>VAT ({vatPct}%)</span>
                    <span>{formatMoney(vat)}</span>
                  </div>
                );
              })()}
              {parseFloat(order.platformFee || '0') > 0 && !isOfflinePayment && (
                <div className="flex justify-between text-red-600">
                  <span>Less platform fee</span>
                  <span>-{formatMoney(parseFloat(order.platformFee || '0'))}</span>
                </div>
              )}
              {order.paymentMethod && (
                <div className="flex justify-between text-gray-500">
                  <span>Method</span>
                  <span className="font-medium">{getPaymentMethodLabel(order.paymentMethod)}</span>
                </div>
              )}
              {parseFloat(order.amountRefunded || '0') > 0 && (() => {
                const wholesalerTotal = calculateNetAmount(order);
                const amountPaid = parseFloat(order.amountPaid || '0');
                const amountRefunded = parseFloat(order.amountRefunded || '0');
                const refundProportion = amountPaid > 0 ? Math.min(amountRefunded / amountPaid, 1) : 1;
                const wholesalerRefund = wholesalerTotal * refundProportion;
                const isPartialRefund = refundProportion < 0.99;
                const refundDateStr = order.refundedAt
                  ? new Date(order.refundedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : ((order.notes || '').includes('Stripe refund:') || (order.notes || '').includes('Stripe retry refund submitted:')
                    ? 'pending confirmation'
                    : null);
                const retained = wholesalerTotal - wholesalerRefund;
                return (
                  <>
                    <div className="flex justify-between text-purple-600">
                      <div>
                        <span>{isPartialRefund ? 'Partial Refund' : 'Refunded'}</span>
                        {refundDateStr && <span className="text-purple-400 ml-1">· {refundDateStr}</span>}
                      </div>
                      <span>-{formatMoney(wholesalerRefund)}</span>
                    </div>
                    {isPartialRefund && retained > 0 && (
                      <div className="flex justify-between text-gray-500">
                        <div className="flex flex-wrap items-center gap-1">
                          <span>Retained by customer</span>
                          {refundDateStr && <span className="text-gray-400">· {refundDateStr}</span>}
                          {order.stockRestored && order.stockRestoredCount && order.stockRestoredCount > 0 && (
                            <span className="text-green-600">· {order.stockRestoredCount} unit{order.stockRestoredCount !== 1 ? 's' : ''} restocked</span>
                          )}
                        </div>
                        <span>{formatMoney(retained)}</span>
                      </div>
                    )}
                  </>
                );
              })()}
              {(() => {
                const itemsWithCost = (order.items || []).filter(i => i.product?.costPrice && parseFloat(i.product.costPrice) > 0);
                const itemsWithoutCost = (order.items || []).length - itemsWithCost.length;
                if (itemsWithCost.length === 0) return null;
                const totalCost = itemsWithCost.reduce((sum, i) => sum + parseFloat(i.product.costPrice!) * i.quantity, 0);
                const revenueForCostedItems = itemsWithCost.reduce((sum, i) => sum + parseFloat(i.unitPrice) * i.quantity, 0);
                const grossProfit = revenueForCostedItems - totalCost;
                const marginPct = revenueForCostedItems > 0 ? (grossProfit / revenueForCostedItems) * 100 : 0;
                const profitColor = grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600';
                return (
                  <div className="border-t pt-2 mt-1 space-y-1">
                    <div className="flex justify-between text-gray-500">
                      <span>Cost of goods</span>
                      <span>{formatMoney(totalCost)}</span>
                    </div>
                    <div className={`flex justify-between font-medium ${profitColor}`}>
                      <span>Gross profit</span>
                      <span>{grossProfit >= 0 ? '' : '-'}{formatMoney(Math.abs(grossProfit))} <span className="font-normal text-xs opacity-75">({marginPct.toFixed(1)}%)</span></span>
                    </div>
                    {itemsWithoutCost > 0 && (
                      <div className="text-[10px] text-gray-400 italic">
                        {itemsWithoutCost} item{itemsWithoutCost !== 1 ? 's' : ''} excluded — no cost price set
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="border-t pt-2 mt-1">
                <div className="flex justify-between font-semibold text-green-700 text-sm">
                  <span>Your Net Amount</span>
                  <span>{formatMoney((() => {
                    if (order.status === 'cancelled' && parseFloat(order.amountRefunded || '0') > 0) return 0;
                    const wholesalerTotal = calculateNetAmount(order);
                    const amountPaid = parseFloat(order.amountPaid || '0');
                    const amountRefunded = parseFloat(order.amountRefunded || '0');
                    const refundProportion = amountPaid > 0 ? Math.min(amountRefunded / amountPaid, 1) : 0;
                    return Math.max(0, wholesalerTotal * (1 - refundProportion));
                  })())}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {parseFloat(order.platformFee || '0') > 0 && !isOfflineOrder(order) ? 'After platform fee' : isStripePayment(order) ? 'No platform fee charged' : 'No platform fee for offline payments'}
                </div>
              </div>
            </div>

            {/* Offline payment — mark as paid */}
            {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && !isViewer && (
              <Button
                size="sm"
                variant="outline"
                className="w-full border-green-600 text-green-700 hover:bg-green-50 min-h-[44px]"
                onClick={openMarkAsPaid}
              >
                <DollarSign className="h-4 w-4 mr-1.5" />
                Record Offline Payment
              </Button>
            )}

            {/* Quote payment status + payment link */}
            {order.isQuote && (() => {
              const productTotal = parseFloat(order.subtotal || '0') + parseFloat(order.deliveryCost || '0');
              const amountPaidRaw = parseFloat(order.amountPaid || '0');
              const wholesalerPaid = isStripePayment(order)
                ? (() => {
                    const customerTotal = parseFloat(order.total || '0');
                    const paymentRatio = customerTotal > 0 ? amountPaidRaw / customerTotal : 0;
                    return productTotal * paymentRatio;
                  })()
                : Math.min(amountPaidRaw, productTotal);
              const wholesalerOutstanding = order.status === 'cancelled' ? 0 : Math.max(0, productTotal - wholesalerPaid);

              return (
                <div className="border-t pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded p-2">
                      <div className="text-gray-500">Order Total</div>
                      <div className="font-semibold text-gray-900 text-sm">{formatMoney(productTotal)}</div>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <div className="text-gray-500">Amount Paid</div>
                      <div className="font-semibold text-green-700 text-sm">{formatMoney(wholesalerPaid)}</div>
                    </div>
                    {wholesalerOutstanding > 0.01 && (
                      <div className="bg-red-50 rounded p-2 col-span-2">
                        <div className="text-red-500">Outstanding Balance</div>
                        <div className="font-bold text-red-700 text-sm">{formatMoney(wholesalerOutstanding)}</div>
                        {order.balanceDueDays !== undefined && order.balanceDueDays > 0 && (
                          <div className="text-red-400 mt-0.5">
                            Due by {new Date(new Date(order.createdAt).getTime() + (order.balanceDueDays * 24 * 60 * 60 * 1000)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-1">
                    {parseFloat(order.amountRefunded || '0') > 0 ? (() => {
                      const refAmt = parseFloat(order.amountRefunded || '0');
                      const paidAmt = parseFloat(order.amountPaid || '0');
                      const isFullRefund = paidAmt > 0 && refAmt >= paidAmt * 0.99;
                      const isOffline = !order.stripePaymentIntentId;
                      if (order.refundedAt || isOffline) {
                        return isFullRefund
                          ? <Badge className="bg-purple-100 text-purple-800 border-0">Refunded</Badge>
                          : <Badge className="bg-amber-100 text-amber-800 border-0">Partial Refund</Badge>;
                      }
                      return <Badge className="bg-amber-100 text-amber-800 border-0">Refund Pending</Badge>;
                    })() : (
                      <Badge className={getPaymentStatusColor(order.paymentStatus || 'unpaid') + ' border-0'}>
                        {getPaymentStatusLabel(order.paymentStatus || 'unpaid')}
                      </Badge>
                    )}
                  </div>

                  {wholesalerOutstanding > 0.01 && !isViewer && (
                    <div className="space-y-2">
                      {canUsePaymentLink && (
                        <Button
                          size="sm"
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
                          onClick={generateAndCopyPaymentLink}
                          disabled={isGeneratingPaymentLink}
                        >
                          {isGeneratingPaymentLink
                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                            : <><Copy className="h-4 w-4 mr-2" />Copy Payment Link</>}
                        </Button>
                      )}
                      {(order.customerPhone || order.retailer?.phoneNumber) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full border-green-500 text-green-700 hover:bg-green-50 min-h-[44px]"
                          onClick={shareInvoice}
                          disabled={isSharingInvoice}
                        >
                          {isSharingInvoice
                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sharing...</>
                            : <><Share2 className="h-4 w-4 mr-2" />Share Invoice</>}
                        </Button>
                      )}
                      {canUsePaymentLink && order.stripePaymentLinkUrl && (
                        <div
                          className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(order.stripePaymentLinkUrl || '');
                            toast({ title: "Link copied!" });
                          }}
                        >
                          <Link className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                          <span className="text-xs text-blue-600 truncate">{order.stripePaymentLinkUrl}</span>
                          <Copy className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 ml-auto" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* ── Order Photos card ─────────────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <Camera className="h-4 w-4 text-gray-500" />
              Order Photos
            </h2>
            <div className="space-y-3">
              {!isViewer && (
                <div>
                  <input
                    type="file"
                    id={`order-photo-upload-${order.id}`}
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
                          await uploadOrderPhoto(file);
                        } catch (err) {
                          const message = err instanceof Error ? err.message : 'Please try again.';
                          toast({ title: "Upload Failed", description: message, variant: "destructive" });
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed min-h-[44px]"
                    onClick={() => document.getElementById(`order-photo-upload-${order.id}`)?.click()}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Add Photo
                  </Button>
                </div>
              )}
              {order.orderImages && order.orderImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {order.orderImages.map((image) => (
                    <div key={image.id} className="relative group">
                      <img
                        src={image.url}
                        alt={image.filename}
                        className="w-full h-24 object-cover rounded-lg border cursor-pointer hover:opacity-90"
                        onClick={() => window.open(image.url, '_blank')}
                      />
                      {!isViewer && (
                        <button
                          onClick={() => handleDeletePhoto(image.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                          title="Delete photo"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-4 text-xs text-gray-400">
                  <ImageIcon className="h-4 w-4 mr-2" />
                  No photos yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Order Timeline card ───────────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Order Timeline</h2>
            <div className="space-y-2.5">
              {(() => {
                const hasPaid = parseFloat(order.amountPaid || '0') > 0;
                const hasDeposit = order.depositPercentage && order.depositPercentage > 0 && order.depositPercentage < 100;
                const pTotal = parseFloat(order.subtotal || '0') + parseFloat(order.deliveryCost || '0');
                return (
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${hasPaid ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <div>
                      <div className={`text-xs ${hasPaid ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                        {hasDeposit
                          ? (hasPaid ? `Deposit received (${order.depositPercentage}%)` : `Awaiting deposit (${order.depositPercentage}%)`)
                          : (hasPaid ? 'Payment received' : 'Awaiting payment')}
                      </div>
                      {hasPaid && (
                        <div className="text-xs text-gray-500">
                          {hasDeposit
                            ? formatMoney(pTotal * ((order.depositPercentage || 0) / 100))
                            : formatMoney(pTotal)}
                          {' · '}{new Date(order.createdAt).toLocaleDateString()}
                        </div>
                      )}
                      {!hasPaid && !hasDeposit && order.balanceDueDays !== undefined && order.balanceDueDays > 0 && (
                        <div className="text-xs text-red-400 mt-0.5">
                          Due by {new Date(new Date(order.createdAt).getTime() + (order.balanceDueDays * 24 * 60 * 60 * 1000)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {order.depositPercentage && order.depositPercentage > 0 && order.depositPercentage < 100 && order.status !== 'cancelled' && (() => {
                const prodTotal = parseFloat(order.subtotal || '0') + parseFloat(order.deliveryCost || '0');
                const custTotal = parseFloat(order.total || '0');
                const paidRatio = custTotal > 0 ? parseFloat(order.amountPaid || '0') / custTotal : 0;
                const wPaid = prodTotal * paidRatio;
                const wOutstanding = prodTotal - wPaid;
                const isFullyPaid = parseFloat(order.amountPaid || '0') >= custTotal;
                const depositAmt = prodTotal * (order.depositPercentage / 100);
                return (
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${isFullyPaid ? 'bg-green-500' : 'bg-orange-400'}`}></div>
                    <div>
                      <div className={`text-xs ${isFullyPaid ? 'font-medium text-gray-900' : 'text-orange-600'}`}>
                        {isFullyPaid
                          ? 'Balance payment received'
                          : `Balance outstanding: ${formatMoney(wOutstanding)}`}
                      </div>
                      {isFullyPaid && (
                        <div className="text-xs text-gray-500">
                          {formatMoney(prodTotal - depositAmt)} · Full payment complete
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {order.status !== 'cancelled' && (
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${['ready_for_collection', 'fulfilled'].includes(order.status) ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <div>
                    <div className={`text-xs ${['ready_for_collection', 'fulfilled'].includes(order.status) ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                      {isPickup ? 'Ready for Collection' : 'Ready for Delivery'}
                    </div>
                    {order.readyToCollectAt && (
                      <div className="text-xs text-gray-500">
                        {new Date(order.readyToCollectAt).toLocaleDateString()} at {new Date(order.readyToCollectAt).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {order.status !== 'cancelled' && (
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${order.status === 'fulfilled' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <div>
                    <div className={`text-xs ${order.status === 'fulfilled' ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                      {isPickup ? 'Collected' : 'Delivered'}
                    </div>
                    {order.status === 'fulfilled' && order.fulfilledAt && (
                      <div className="text-xs text-gray-500">
                        {new Date(order.fulfilledAt).toLocaleDateString()} at {new Date(order.fulfilledAt).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {order.cancellationRequest && (
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${order.cancellationRequest.status === 'pending' ? 'bg-orange-500' : 'bg-orange-400'}`}></div>
                  <div>
                    <div className={`text-xs font-medium ${order.cancellationRequest.status === 'pending' ? 'text-orange-700' : 'text-orange-600'}`}>
                      Cancellation Requested
                      {order.cancellationRequest.status === 'pending' && <span className="ml-1 text-orange-500">(Pending Review)</span>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(order.cancellationRequest.requestedAt).toLocaleDateString()} at {new Date(order.cancellationRequest.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-xs text-gray-500">
                      Reason: {order.cancellationRequest.reasonCategory.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      {order.cancellationRequest.reasonNotes && ` - ${order.cancellationRequest.reasonNotes}`}
                    </div>
                  </div>
                </div>
              )}

              {order.cancellationRequest?.status === 'approved' && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-green-500"></div>
                  <div>
                    <div className="text-xs font-medium text-green-700">Cancellation Approved</div>
                    {order.cancellationRequest.respondedAt && (
                      <div className="text-xs text-gray-500">
                        {new Date(order.cancellationRequest.respondedAt).toLocaleDateString()} at {new Date(order.cancellationRequest.respondedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {order.cancellationRequest?.status === 'rejected' && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-red-400"></div>
                  <div>
                    <div className="text-xs font-medium text-red-600">Cancellation Declined</div>
                    {order.cancellationRequest.respondedAt && (
                      <div className="text-xs text-gray-500">{new Date(order.cancellationRequest.respondedAt).toLocaleDateString()}</div>
                    )}
                    {order.cancellationRequest.responseMessage && (
                      <div className="text-xs text-gray-500">{order.cancellationRequest.responseMessage}</div>
                    )}
                  </div>
                </div>
              )}

              {parseFloat(order.amountRefunded || '0') > 0 && (() => {
                const refundedAmt = parseFloat(order.amountRefunded || '0');
                const paidAmt = parseFloat(order.amountPaid || '0');
                const isPartial = paidAmt > 0 && refundedAmt < paidAmt;
                const isProcessed = !!order.refundedAt;
                const isOffline = !order.stripePaymentIntentId || (order.notes || '').includes('Offline refund:');
                const canRetry = !isProcessed && !!order.stripePaymentIntentId && !isOffline;
                const label = isPartial
                  ? (isOffline ? 'Partial refund (offline)' : isProcessed ? 'Partial refund to card' : 'Partial refund pending')
                  : (isOffline ? 'Refund (offline)' : isProcessed ? 'Refund to card' : 'Refund pending');
                const dotColor = (isProcessed || isOffline) ? 'bg-purple-500' : 'bg-amber-400';
                const textColor = (isProcessed || isOffline) ? 'text-purple-700' : 'text-amber-700';
                return (
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`}></div>
                    <div>
                      <div className={`text-xs font-medium ${textColor}`}>{label}</div>
                      <div className="text-xs text-gray-500">
                        {isOffline
                          ? (isProcessed ? new Date(order.refundedAt!).toLocaleDateString() : 'Handled offline — no Stripe required')
                          : isProcessed
                            ? new Date(order.refundedAt!).toLocaleDateString()
                            : (order.notes || '').includes('Refund failed:')
                              ? 'Sent to Stripe but failed — use Retry'
                              : (order.notes || '').includes('Stripe refund:') || (order.notes || '').includes('Stripe retry refund submitted:')
                                ? 'Refund pending Stripe confirmation'
                                : 'Not yet sent to Stripe'}
                      </div>
                      {order.refundReason && !order.cancellationRequest && (
                        <div className="text-xs text-gray-400 mt-0.5">{order.refundReason}</div>
                      )}
                      {canRetry && !isViewer && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <button
                            onClick={retryRefund}
                            disabled={isRetryingRefund || isMarkingRefunded}
                            className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 px-2.5 py-1 rounded-md transition-colors"
                          >
                            {isRetryingRefund ? 'Sending...' : 'Retry Refund to Card'}
                          </button>
                          {order.status === 'cancelled' && (
                            <button
                              onClick={markAsRefunded}
                              disabled={isMarkingRefunded || isRetryingRefund}
                              className="text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 px-2.5 py-1 rounded-md transition-colors"
                            >
                              {isMarkingRefunded ? 'Saving...' : 'Mark Refunded'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {order.status === 'cancelled' && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-red-500"></div>
                  <div>
                    <div className="text-xs font-medium text-red-700">Order Cancelled</div>
                    {order.cancelledAt && (
                      <div className="text-xs text-gray-500">
                        {new Date(order.cancelledAt).toLocaleDateString()} at {new Date(order.cancelledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {order.refundReason && !order.cancellationRequest && (
                      <div className="text-xs text-gray-500">{order.refundReason}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Activity & History ────────────────────────────────────────── */}
        {order.isQuote && (
          <Card className="border shadow-sm">
            <CardContent className="px-4 py-3">
              <QuoteActivityLog orderId={order.id} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Sticky action bar ─────────────────────────────────────────────── */}
      {primaryAction && (
        <div className={`fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-4 py-3 z-50 ${isDesktopCollapsed ? "lg:left-14" : "lg:left-64"}`}>
          <div className="max-w-lg mx-auto flex items-center gap-3">
            {/* Order context — gives mobile users reference even when scrolled down */}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500 leading-tight truncate">
                {order.orderNumber || `#${order.id}`}
              </p>
              <span className={`inline-block text-xs font-medium rounded px-1.5 py-0.5 mt-0.5 ${
                order.status === 'fulfilled'            ? 'bg-blue-100 text-blue-800'   :
                order.status === 'ready_for_collection' ? 'bg-yellow-100 text-yellow-800' :
                order.status === 'cancelled'            ? 'bg-red-100 text-red-800'    :
                order.status === 'picking'              ? 'bg-purple-100 text-purple-800' :
                order.status === 'packed'               ? 'bg-indigo-100 text-indigo-800' :
                'bg-gray-100 text-gray-600'
              }`}>
                {order.status === 'fulfilled'            ? 'Fulfilled'  :
                 order.status === 'ready_for_collection' ? 'Ready'      :
                 order.status === 'cancelled'            ? 'Cancelled'  :
                 order.status === 'picking'              ? 'Picking'    :
                 order.status === 'packed'               ? 'Packed'     :
                 'Unfulfilled'}
              </span>
            </div>
            <Button
              className={`shrink-0 text-white min-h-[44px] rounded-xl text-sm font-semibold whitespace-nowrap ${primaryActionConfig[primaryAction].color} disabled:opacity-50`}
              onClick={primaryActionConfig[primaryAction].onClick}
              disabled={!!(primaryActionConfig[primaryAction].loading) || updatingOrderId === order.id}
            >
              {primaryActionConfig[primaryAction].loading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Working...</>
                : <>{primaryActionConfig[primaryAction].icon}{primaryActionConfig[primaryAction].label}</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Picking Warning Dialog ────────────────────────────────────────── */}
      <Dialog open={isPickingWarningOpen} onOpenChange={setIsPickingWarningOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-amber-500" />
              Order Not Fully Picked
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 pt-1">
            This order hasn't been fully picked yet. Continue anyway?
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setIsPickingWarningOpen(false);
                setPendingFulfillAction(null);
              }}
            >
              Go Back
            </Button>
            <Button
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => {
                setIsPickingWarningOpen(false);
                if (pendingFulfillAction === 'mark_fulfilled') {
                  setIsFulfillConfirmOpen(true);
                } else if (pendingFulfillAction === 'ready_for_collection') {
                  markReadyForCollection();
                }
                setPendingFulfillAction(null);
              }}
            >
              Continue Anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fulfill Confirmation Dialog ───────────────────────────────────── */}
      <Dialog open={isFulfillConfirmOpen} onOpenChange={setIsFulfillConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Mark as Fulfilled
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 pt-1">
            Mark this order as fulfilled? This cannot be undone.
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsFulfillConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                setIsFulfillConfirmOpen(false);
                markAsFulfilled();
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Mark as Paid Dialog ───────────────────────────────────────────── */}
      <Dialog open={isMarkAsPaidOpen} onOpenChange={setIsMarkAsPaidOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Record Offline Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-gray-500">
              Order {order.orderNumber || `#${order.id}`} — outstanding{' '}
              <span className="font-medium text-gray-800">
                {formatMoney(parseFloat(getOfflinePaymentDefaultAmount(order)))}
              </span>
            </p>
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount received</label>
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
              <Button variant="outline" className="flex-1" onClick={() => setIsMarkAsPaidOpen(false)} disabled={isMarkingPaid}>
                Cancel
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleMarkAsPaid} disabled={isMarkingPaid || !markAsPaidAmount}>
                {isMarkingPaid ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Picking Mode overlay ─────────────────────────────────────────────── */}
      {showPickingMode && order && (
        <PickingMode
          orderId={order.id}
          orderNumber={order.orderNumber}
          onClose={() => setShowPickingMode(false)}
        />
      )}
    </div>
  );
}
