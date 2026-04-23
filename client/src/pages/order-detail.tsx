import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DollarSign, Clock, CheckCircle, X, Truck, MapPin, Camera, Image as ImageIcon,
  RefreshCw, FileText, Loader2, Share2, Package, ChevronLeft, Home, Building, Warehouse
} from "lucide-react";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/useCurrency";
import { getOfflinePaymentDefaultAmount } from "@/lib/order-payment-balances";

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
  };
  appliedOfferLabel?: string | null;
  freeItems?: number;
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
  wholesalerBusinessName?: string;
  amountRefunded?: string;
  refundReason?: string;
  refundedAt?: string;
  stripePaymentIntentId?: string;
  notes?: string;
  cancelledAt?: string;
  stockRestored?: boolean;
  stockRestoredCount?: number;
  readyToCollectAt?: string;
  fulfilledAt?: string;
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

const isStripePayment = (order: Order): boolean =>
  order.paymentMethod === 'payment_link' ||
  !!order.stripePaymentIntentId ||
  !!order.stripePaymentLinkUrl;

const calculateNetAmount = (order: Order) => {
  const subtotal = parseFloat(order.subtotal || '0');
  const deliveryCost = parseFloat(order.deliveryCost || '0');
  // Offline payments: no platform fee deducted — wholesaler keeps the full amount
  if (!isStripePayment(order)) return subtotal + deliveryCost;
  const actualPlatformFee = parseFloat(order.platformFee || '0');
  const feeToDeduct = actualPlatformFee > 0 ? actualPlatformFee : (subtotal + deliveryCost) * 0.046;
  return (subtotal + deliveryCost) - feeToDeduct;
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';
  const { formatMoney } = useCurrency();
  const { toast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonCategory, setCancelReasonCategory] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetryingRefund, setIsRetryingRefund] = useState(false);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [isSharingInvoice, setIsSharingInvoice] = useState(false);
  const [processRefund, setProcessRefund] = useState(true);
  const [refundType, setRefundType] = useState<'card' | 'later'>('card');
  const [restockInventory, setRestockInventory] = useState(true);
  const [sendNotification, setSendNotification] = useState(true);
  const [staffNote, setStaffNote] = useState('');
  const [refundDelivery, setRefundDelivery] = useState(false);
  const [returnItems, setReturnItems] = useState<Array<{ productId: number; quantity: number; sellingType: string; maxQty: number }>>([]);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [pendingCancellationRequestId, setPendingCancellationRequestId] = useState<number | null>(null);

  const [isMarkAsPaidOpen, setIsMarkAsPaidOpen] = useState(false);
  const [markAsPaidAmount, setMarkAsPaidAmount] = useState('');
  const [markAsPaidMethod, setMarkAsPaidMethod] = useState('cash');
  const [markAsPaidNote, setMarkAsPaidNote] = useState('');
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

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
        if (params.get('action') === 'cancel' && data.items) {
          setReturnItems(data.items.map((item: OrderItem) => ({
            productId: item.productId,
            quantity: item.quantity,
            sellingType: (item as Record<string, unknown>).sellingType as string || 'units',
            maxQty: item.quantity
          })));
          setCancelReasonCategory('customer_request');
          setShowCancelForm(true);
          const requestId = params.get('requestId');
          if (requestId) {
            setPendingCancellationRequestId(parseInt(requestId, 10));
          }
        }
      })
      .catch(() => setLoading(false));
  }, [id]);

  const buildShareMessage = (o: Order): string => {
    const orderRef = o.orderNumber || `#${o.id}`;
    const customerFirstName = o.customerName?.split(' ')[0] || 'there';
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
      if (o.stripePaymentLinkUrl) {
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
      const docType = order.isQuote ? 'Quote' : 'Invoice';

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
          processRefund: processRefund && refundType !== 'later',
          refundType: processRefund && refundType !== 'later' ? refundType : undefined,
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
          }).catch(() => {});
          setPendingCancellationRequestId(null);
        }

        if (data.refundFailed) {
          toast({
            title: "Order Cancelled",
            description: `Order cancelled but the card refund failed — use "Retry Refund" to resend it to Stripe.`,
            variant: "destructive",
          });
        } else {
          const refundMessage = processRefund && refundType !== 'later'
            ? ' A refund has been initiated.'
            : refundType === 'later' ? ' Refund will be processed separately.' : '';
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

  if (showCancelForm) {
    const totalPaid = parseFloat(order.amountPaid || '0');
    const deliveryCostValue = parseFloat(order.deliveryCost || '0');
    const itemsRefund = returnItems.length > 0
      ? returnItems.reduce((sum, ri) => {
          const oi = order.items?.find(i => i.productId === ri.productId);
          return sum + (ri.quantity * parseFloat(oi?.unitPrice || '0'));
        }, 0)
      : totalPaid;
    const calculatedRefund = Math.min(
      itemsRefund + (returnItems.length > 0 && refundDelivery ? deliveryCostValue : 0),
      totalPaid
    );
    const isPartial = returnItems.some(ri => ri.quantity < ri.maxQty);

    return (
      <div className="bg-white min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setShowCancelForm(false)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold">Cancel Order {order.orderNumber || `#${order.id}`}</h1>
          </div>

          <div className="space-y-4 text-sm">
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

            <div>
              <label className="text-sm font-medium">Additional notes (optional)</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Add any additional details..."
                className="w-full mt-1 p-2 border rounded-md text-sm min-h-[60px]"
              />
            </div>

            {order.items && order.items.length > 0 && (
              <div>
                <label className="text-sm font-medium">Items to return (adjust for partial return)</label>
                <div className="mt-2 space-y-2">
                  {returnItems.map((item, index) => {
                    const orderItem = order.items?.find(oi => oi.productId === item.productId);
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

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Refund payments</h3>
              {returnItems.length > 0 && deliveryCostValue > 0 && returnItems.some(ri => ri.quantity < ri.maxQty) && (
                <label className="flex items-center gap-2 cursor-pointer p-2 border rounded-lg bg-gray-50">
                  <input type="checkbox" checked={refundDelivery} onChange={(e) => setRefundDelivery(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-600" />
                  <span className="text-sm text-gray-700">Include delivery charge refund ({formatMoney(deliveryCostValue)})</span>
                </label>
              )}
              <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${refundType === 'card' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`} onClick={() => { setRefundType('card'); setProcessRefund(true); }}>
                <input type="radio" name="refundType" checked={refundType === 'card'} onChange={() => { setRefundType('card'); setProcessRefund(true); }} className="w-4 h-4 text-green-600" />
                <div className="ml-3 flex-1">
                  <span className="text-sm font-medium">Original payment method</span>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-gray-500">Refund {formatMoney(calculatedRefund)} to card</p>
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

            <div>
              <label className="text-sm font-medium">Staff note (optional)</label>
              <textarea value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder="Internal notes — not visible to customer..." className="w-full mt-1 p-2 border rounded-md text-sm min-h-[50px]" />
            </div>

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
                setRefundDelivery(false);
                setRestockInventory(true);
                setSendNotification(true);
                setStaffNote('');
              }}>
                ← Back to order
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4 text-sm">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/orders')} className="p-2">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Order {order.orderNumber || `#${order.id}`}</h1>
            <p className="text-xs text-gray-500">Order ID: {order.id}</p>
          </div>
        </div>

        {/* Status & Fulfillment */}
        <div>
          <h3 className="font-medium mb-2 text-sm">Status & Fulfillment</h3>
          <div className="flex gap-2 flex-wrap">
            {(order.paymentStatus || '').toLowerCase() === 'paid' ? (
              <Badge className="bg-green-100 text-green-800 text-xs px-2 py-1">Paid</Badge>
            ) : (order.paymentStatus || '').toLowerCase() === 'part_paid' ? (
              <Badge className="bg-orange-100 text-orange-800 text-xs px-2 py-1">Part Paid</Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 text-xs px-2 py-1">Unpaid</Badge>
            )}
            {order.status === 'fulfilled' ? (
              <Badge className="bg-blue-100 text-blue-800 text-xs px-2 py-1">Fulfilled</Badge>
            ) : order.status === 'ready_for_collection' ? (
              <Badge className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1">Ready</Badge>
            ) : order.status === 'cancelled' ? (
              <Badge className="bg-red-100 text-red-800 text-xs px-2 py-1">Cancelled</Badge>
            ) : (
              <Badge className="bg-gray-100 text-gray-800 text-xs px-2 py-1">Unfulfilled</Badge>
            )}
            {parseFloat(order.amountRefunded || '0') > 0 && (() => {
              const refAmt = parseFloat(order.amountRefunded || '0');
              const paidAmt = parseFloat(order.amountPaid || '0');
              const isFullRefund = paidAmt > 0 && refAmt >= paidAmt * 0.99;
              if (!order.refundedAt) {
                return <Badge className="bg-amber-100 text-amber-800 text-xs px-2 py-1">Refund Pending</Badge>;
              }
              return isFullRefund
                ? <Badge className="bg-purple-100 text-purple-800 text-xs px-2 py-1">Refunded</Badge>
                : <Badge className="bg-amber-100 text-amber-800 text-xs px-2 py-1">Partial Refund</Badge>;
            })()}
            {order.fulfillmentType && (
              <Badge variant="outline" className="text-xs px-2 py-1">
                {order.fulfillmentType === 'delivery' ? (
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
            <div><span className="font-medium">Name:</span> {order.customerName}</div>
            <div><span className="font-medium">Email:</span> {order.customerEmail}</div>
            {order.customerPhone && (
              <div><span className="font-medium">Phone:</span> {order.customerPhone}</div>
            )}
          </div>
        </div>

        {/* Delivery / Collection Address */}
        {order.fulfillmentType === 'delivery' ? (
          <div>
            <h3 className="font-medium mb-3 text-sm">Delivery Address</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <MapPin className="h-4 w-4 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm text-gray-700">
                  {order.deliveryAddressId ? (
                    <WholesalerDeliveryAddressDisplay addressId={order.deliveryAddressId} />
                  ) : order.deliveryAddress ? (
                    (() => {
                      try {
                        const parsed = JSON.parse(order.deliveryAddress);
                        if (parsed && typeof parsed === 'object') {
                          return (
                            <div>
                              <div className="font-medium text-gray-900">{parsed.addressLine1}</div>
                              {parsed.addressLine2 && <div className="text-gray-700">{parsed.addressLine2}</div>}
                              <div className="text-gray-700">{parsed.city}</div>
                              <div className="text-gray-700">{parsed.postalCode}</div>
                              {parsed.country && <div className="text-gray-700">{parsed.country}</div>}
                            </div>
                          );
                        }
                      } catch {
                        return <div className="text-gray-700">{order.deliveryAddress}</div>;
                      }
                      return <div className="text-gray-700">{order.deliveryAddress}</div>;
                    })()
                  ) : (
                    <div className="text-gray-500 italic">No delivery address information available</div>
                  )}
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
                    {order.wholesalerBusinessName || 'Business Location'}
                  </div>
                  {(() => {
                    const pickupAddr = (user as AuthUser)?.pickupAddress?.trim();
                    const bizAddr = (user as AuthUser)?.businessAddress?.trim();
                    const resolvedAddr = pickupAddr || bizAddr;
                    if (resolvedAddr) {
                      return (
                        <div className="flex items-start mt-2 gap-1">
                          <MapPin className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                          <span className="text-orange-700 text-xs">{resolvedAddr}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="text-orange-600 text-xs mt-2">
                        Please contact the business to arrange collection time and get the exact address.
                      </div>
                    );
                  })()}
                  {(user as AuthUser)?.businessPhone && (
                    <div className="text-orange-600 text-xs mt-1">
                      Phone: {(user as AuthUser).businessPhone}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order Items */}
        <div>
          <h3 className="font-medium mb-2 text-sm">Items ({order.items?.length || 0})</h3>
          <div className="space-y-2">
            {order.items?.map((item, index) => (
              <div key={index} className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-medium text-sm">{item.product?.name || 'Unknown Product'}</div>
                  <div className="text-xs text-gray-500">
                    Quantity: {item.quantity} {item.sellingType === 'pallets' ? 'pallets' : 'units'} × {formatMoney(parseFloat(item.unitPrice))}
                  </div>
                  {item.appliedOfferLabel && (
                    <span className="inline-flex items-center text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full mt-0.5">
                      🎁 {item.appliedOfferLabel}
                    </span>
                  )}
                  {(item.freeItems || 0) > 0 && (
                    <span className="inline-flex items-center text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full mt-0.5 ml-1">
                      +{item.freeItems} free
                    </span>
                  )}
                </div>
                <div className="font-medium text-sm ml-4">
                  {formatMoney(parseFloat(item.total))}
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
              <span>{formatMoney(parseFloat(order.subtotal || '0'))}</span>
            </div>
            {parseFloat(order.deliveryCost || '0') > 0 && (
              <div className="flex justify-between text-blue-700">
                <span>Delivery:</span>
                <span>{formatMoney(parseFloat(order.deliveryCost || '0'))}</span>
              </div>
            )}
            {isStripePayment(order) && (
              <div className="flex justify-between text-red-600">
                <span>Platform Fee (4.6%):</span>
                <span>-{formatMoney(parseFloat(order.platformFee || '0') || (parseFloat(order.subtotal || '0') + parseFloat(order.deliveryCost || '0')) * 0.046)}</span>
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
                      <span>{isPartialRefund ? 'Partial Refund:' : 'Refunded:'}</span>
                      {refundDateStr && <span className="text-xs text-purple-400 ml-1">· {refundDateStr}</span>}
                    </div>
                    <span>-{formatMoney(wholesalerRefund)}</span>
                  </div>
                  {isPartialRefund && retained > 0 && (
                    <div className="flex justify-between text-gray-500 text-xs mt-0.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span>Retained by customer:</span>
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
            {order.paymentMethod && (
              <div className="flex justify-between text-gray-600 text-xs mt-1">
                <span>Method:</span>
                <span className="font-medium">{getPaymentMethodLabel(order.paymentMethod)}</span>
              </div>
            )}
            <div className="border-t pt-1 mt-2">
              <div className="flex justify-between font-medium text-green-600">
                <span>Your Net Amount:</span>
                <span>{formatMoney((() => {
                  if (order.status === 'cancelled' && parseFloat(order.amountRefunded || '0') > 0) return 0;
                  const wholesalerTotal = calculateNetAmount(order);
                  const amountPaid = parseFloat(order.amountPaid || '0');
                  const amountRefunded = parseFloat(order.amountRefunded || '0');
                  const refundProportion = amountPaid > 0 ? Math.min(amountRefunded / amountPaid, 1) : 0;
                  return Math.max(0, wholesalerTotal * (1 - refundProportion));
                })())}</span>
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-1">{isStripePayment(order) ? 'Amount you receive after platform fee deduction' : 'Amount you receive (no platform fee for offline payments)'}</div>
          </div>
        </div>

        {/* Mark as Paid */}
        {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && !isViewer && (
          <Button size="sm" variant="outline" className="w-full border-green-600 text-green-700 hover:bg-green-50 text-xs" onClick={openMarkAsPaid}>
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Mark as Paid (offline)
          </Button>
        )}

        {/* Download Invoice */}
        <Button size="sm" variant="outline" className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 text-xs" onClick={downloadInvoice} disabled={isDownloadingInvoice}>
          {isDownloadingInvoice ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1.5" />}
          {isDownloadingInvoice ? 'Generating PDF...' : 'Download Invoice'}
        </Button>

        {/* Share Invoice */}
        {!isViewer && (
          <Button size="sm" variant="outline" className="w-full border-green-300 text-green-700 hover:bg-green-50 text-xs" onClick={shareInvoice} disabled={isSharingInvoice}>
            {isSharingInvoice ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
            {isSharingInvoice ? 'Sending...' : 'Share Invoice with Customer'}
          </Button>
        )}

        {/* Payment Status Section for Quotes */}
        {order.isQuote && (() => {
          const productTotal = parseFloat(order.subtotal || '0') + parseFloat(order.deliveryCost || '0');
          const amountPaidRaw = parseFloat(order.amountPaid || '0');
          // For Stripe payments amountPaid includes customer fee, so use ratio to derive wholesaler amount.
          // For offline payments amountPaid IS the wholesale amount — use it directly.
          const wholesalerPaid = isStripePayment(order)
            ? (() => {
                const customerTotal = parseFloat(order.total || '0');
                const paymentRatio = customerTotal > 0 ? amountPaidRaw / customerTotal : 0;
                return productTotal * paymentRatio;
              })()
            : Math.min(amountPaidRaw, productTotal);
          const wholesalerOutstanding = order.status === 'cancelled' ? 0 : Math.max(0, productTotal - wholesalerPaid);

          return (
            <div>
              <h3 className="font-medium mb-2 text-sm flex items-center">
                <DollarSign className="h-4 w-4 mr-2 text-green-600" />
                Payment Status
              </h3>
              <div className="bg-gray-50 p-3 rounded text-sm space-y-2">
                <div className="flex justify-between">
                  <span>Order Total:</span>
                  <span className="font-medium">{formatMoney(productTotal)}</span>
                </div>
                {order.depositPercentage && order.depositPercentage > 0 && order.depositPercentage < 100 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Deposit ({order.depositPercentage}%):</span>
                    <span>{formatMoney(productTotal * (order.depositPercentage / 100))}</span>
                  </div>
                )}
                <div className="flex justify-between text-green-600">
                  <span>Amount Paid:</span>
                  <span className="font-medium">{formatMoney(wholesalerPaid)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Outstanding Balance:</span>
                  <span className="font-medium">{formatMoney(wholesalerOutstanding)}</span>
                </div>
                {order.balanceDueDays !== undefined && order.balanceDueDays > 0 && wholesalerOutstanding > 0 && (
                  <div className="flex justify-between text-red-700 font-medium">
                    <span>Balance Due By:</span>
                    <span>{new Date(new Date(order.createdAt).getTime() + (order.balanceDueDays * 24 * 60 * 60 * 1000)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                )}
                <div className="pt-2 border-t flex flex-wrap gap-2">
                  {parseFloat(order.amountRefunded || '0') > 0 ? (() => {
                    const refAmt = parseFloat(order.amountRefunded || '0');
                    const paidAmt = parseFloat(order.amountPaid || '0');
                    const isFullRefund = paidAmt > 0 && refAmt >= paidAmt * 0.99;
                    if (order.refundedAt) {
                      return isFullRefund
                        ? <Badge className="bg-purple-600 text-white">Refunded</Badge>
                        : <Badge className="bg-amber-100 text-amber-800">Partial Refund</Badge>;
                    }
                    return <Badge className="bg-amber-100 text-amber-800">Refund Pending</Badge>;
                  })() : (
                    <Badge className={getPaymentStatusColor(order.paymentStatus || 'unpaid')}>
                      {getPaymentStatusLabel(order.paymentStatus || 'unpaid')}
                    </Badge>
                  )}
                </div>
                {order.paymentMethod && (
                  <div className="flex justify-between text-gray-600 text-xs mt-1">
                    <span>Method:</span>
                    <span className="font-medium">{getPaymentMethodLabel(order.paymentMethod)}</span>
                  </div>
                )}

                {wholesalerOutstanding > 0.01 && (
                  <div className="pt-2 border-t mt-2 space-y-2">
                    <Button
                      size="sm"
                      className="w-full bg-green-600 hover:bg-green-700 text-xs"
                      onClick={async () => {
                        try {
                          const response = await fetch(`/api/orders/${order.id}/generate-balance-link`, {
                            method: 'POST',
                            credentials: 'include',
                          });
                          const data = await response.json();
                          if (data.success && data.paymentLink) {
                            try { await navigator.clipboard.writeText(data.paymentLink); } catch {}
                            if (data.order) setOrder({ ...order, ...data.order, stripePaymentLinkUrl: data.paymentLink });
                            toast({
                              title: data.smsSent ? "Payment Link Sent!" : "Payment Link Generated",
                              description: data.smsSent
                                ? `Customer has been texted the payment link for £${data.amount}. Link also copied to clipboard.`
                                : `Payment link created and copied to clipboard.`
                            });
                          } else {
                            toast({ title: "Error", description: data.error || "Failed to generate payment link", variant: "destructive" });
                          }
                        } catch {
                          toast({ title: "Error", description: "Failed to generate payment link", variant: "destructive" });
                        }
                      }}
                    >
                      Send Payment Link to Customer
                    </Button>

                    {order.stripePaymentLinkUrl && (
                      <div className="bg-gray-50 p-2 rounded border">
                        <p className="text-xs text-gray-600 mb-1">
                          {order.paymentStatus === 'part_paid' ? 'Balance Payment Link (tap to copy):' : 'Payment Link (tap to copy):'}
                        </p>
                        <div
                          className="text-xs text-blue-600 break-all cursor-pointer hover:bg-gray-100 p-1 rounded"
                          onClick={() => { navigator.clipboard.writeText(order.stripePaymentLinkUrl || ''); toast({ title: "Link copied!" }); }}
                        >
                          {order.stripePaymentLinkUrl}
                        </div>
                        {order.paymentStatus === 'part_paid' && (
                          <p className="text-xs text-orange-600 mt-1">Note: Click "Send Payment Link" above to generate a fresh link if this one has expired.</p>
                        )}
                      </div>
                    )}
                    {!order.stripePaymentLinkUrl && order.paymentStatus === 'part_paid' && (
                      <p className="text-xs text-gray-500 mt-1">Click the button above to generate a payment link for the outstanding balance.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Order Photos */}
        <div>
          <h3 className="font-medium mb-2 text-sm flex items-center">
            <Camera className="h-4 w-4 mr-2 text-green-600" />
            Order Photos
          </h3>
          <div className="space-y-3">
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
                className="w-full text-xs bg-green-600 hover:bg-green-700 text-white"
                onClick={() => document.getElementById(`order-photo-upload-${order.id}`)?.click()}
              >
                <Camera className="h-3 w-3 mr-2" />
                Add Photo
              </Button>
            </div>

            {order.orderImages && order.orderImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {order.orderImages.map((image) => (
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
                    <div className="text-xs text-gray-500 mt-1 truncate">{image.filename}</div>
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
        <div className="bg-transparent">
          <h3 className="font-medium mb-2 text-sm">Order Timeline</h3>
          <div className="space-y-2">
            {(() => {
              const hasPaid = parseFloat(order.amountPaid || '0') > 0;
              const hasDeposit = order.depositPercentage && order.depositPercentage > 0 && order.depositPercentage < 100;
              const pTotal = parseFloat(order.subtotal || '0') + parseFloat(order.deliveryCost || '0');
              return (
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${hasPaid ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <div>
                    <div className={`text-xs ${hasPaid ? 'font-medium' : 'text-gray-500'}`}>
                      {hasDeposit
                        ? (hasPaid ? `Deposit received (${order.depositPercentage}%)` : `Awaiting deposit payment (${order.depositPercentage}%)`)
                        : (hasPaid ? 'Payment received' : 'Awaiting payment')}
                    </div>
                    {hasPaid && (
                      <div className="text-xs text-gray-500">
                        {hasDeposit
                          ? formatMoney(pTotal * ((order.depositPercentage || 0) / 100))
                          : formatMoney(pTotal)}
                        {' • '}{new Date(order.createdAt).toLocaleDateString()}
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
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${isFullyPaid ? 'bg-green-500' : 'bg-orange-400'}`}></div>
                  <div>
                    <div className={`text-xs ${isFullyPaid ? 'font-medium' : 'text-orange-600'}`}>
                      {isFullyPaid
                        ? 'Balance payment received'
                        : `Balance outstanding: ${formatMoney(wOutstanding)}`}
                    </div>
                    {isFullyPaid && (
                      <div className="text-xs text-gray-500">
                        {formatMoney(prodTotal - depositAmt)} • Full payment complete
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {order.status !== 'cancelled' && (
              <div className="flex items-start gap-2">
                <div className={`w-2 h-2 rounded-full mt-1.5 ${['ready_for_collection', 'fulfilled'].includes(order.status) ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <div>
                  <div className={`text-xs ${['ready_for_collection', 'fulfilled'].includes(order.status) ? 'font-medium' : 'text-gray-500'}`}>
                    {order.fulfillmentType === 'pickup' ? 'Ready for Collection' : 'Ready for Delivery'}
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
                <div className={`w-2 h-2 rounded-full mt-1.5 ${order.status === 'fulfilled' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <div>
                  <div className={`text-xs ${order.status === 'fulfilled' ? 'font-medium' : 'text-gray-500'}`}>
                    {order.fulfillmentType === 'pickup' ? 'Collected' : 'Delivered'}
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
                <div className={`w-2 h-2 rounded-full mt-1.5 ${order.cancellationRequest.status === 'pending' ? 'bg-orange-500' : 'bg-orange-400'}`}></div>
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
                <div className="w-2 h-2 rounded-full mt-1.5 bg-green-500"></div>
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
                <div className="w-2 h-2 rounded-full mt-1.5 bg-red-400"></div>
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
              const canRetry = !isProcessed && !!order.stripePaymentIntentId;
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
                      {label}
                    </div>
                    <div className="text-xs text-gray-500">
                      {isProcessed
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
                      <button
                        onClick={retryRefund}
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

            {order.status === 'cancelled' && (
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full mt-1.5 bg-red-500"></div>
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
        </div>

        {/* Action Buttons */}
        {order.status === 'cancelled' ? (
          <div className="flex items-center justify-center py-3 border-t bg-red-50 rounded-b-lg">
            <div className="flex items-center gap-2 text-red-700">
              <X className="w-5 h-5" />
              <span className="font-semibold">Order Cancelled</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap pt-2 border-t gap-2">
            {order.status !== 'fulfilled' && !isViewer && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (order.items) {
                    setReturnItems(order.items.map(item => ({
                      productId: item.productId,
                      quantity: item.quantity,
                      sellingType: (item as Record<string, unknown>).sellingType as string || 'units',
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
              {order.fulfillmentType === 'pickup' &&
               order.status !== 'ready_for_collection' &&
               order.status !== 'fulfilled' &&
               !isViewer && (
                <Button
                  size="sm"
                  onClick={markReadyForCollection}
                  disabled={updatingOrderId === order.id}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Clock className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">{updatingOrderId === order.id ? '...' : 'Ready for Collection'}</span>
                  <span className="sm:hidden">{updatingOrderId === order.id ? '...' : 'Ready to Collect'}</span>
                </Button>
              )}

              {order.status !== 'fulfilled' && !isViewer && (
                <Button
                  size="sm"
                  onClick={markAsFulfilled}
                  disabled={updatingOrderId === order.id}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {updatingOrderId === order.id ? '...' : 'Fulfilled'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mark as Paid Dialog */}
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
                {formatMoney(isStripePayment(order)
                  ? parseFloat(order.amountOutstanding || '0')
                  : Math.max(0, parseFloat(order.subtotal || '0') + parseFloat(order.deliveryCost || '0') - parseFloat(order.amountPaid || '0')))}
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
    </div>
  );
}
