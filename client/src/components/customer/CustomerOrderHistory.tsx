import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Clock, Check, Eye, Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Calendar, ShoppingBag, MapPin, Home, Building, Truck, Camera, Image as ImageIcon, Warehouse, X, AlertCircle, FileText, ShoppingCart, Download, Loader2, ArrowLeft } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState, useMemo, useEffect } from "react";
import { formatCurrency, formatWeight } from "@shared/utils/currency";
import { formatDateTime } from "@shared/utils/date";
import { QuikpikFooter } from "@/components/ui/quikpik-footer";
import { formatDeliveryAddress } from "@shared/utils/address-formatter";
import { DeliveryAddressDisplay } from "@/components/shared/DeliveryAddressDisplay";
import { DynamicDeliveryAddressDisplay } from "@/components/shared/DynamicDeliveryAddressDisplay";
import { useToast } from "@/hooks/use-toast";

export interface CustomerOrderHistoryProps {
  wholesalerId: string;
  customerPhone: string;
  currency?: string;
}

export interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: string;
  total: string;
  sellingType?: 'units' | 'pallets';
  appliedOfferLabel?: string | null;
  freeItems?: number;
  packQuantity?: number;
  unitSize?: string;
  unitOfMeasure?: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  date: string;
  status: string;
  total: string;
  platformFee: string;
  subtotal: string;
  items: OrderItem[];
  wholesaler: {
    businessName: string;
    firstName: string;
    lastName: string;
    businessPhone?: string;
    businessAddress?: string;
    deliveryNote?: string | null;
    city?: string;
    postalCode?: string;
    country?: string;
    legalBusinessName?: string | null;
    vatNumber?: string | null;
    companyRegistrationNumber?: string | null;
  };
  fulfillmentType: string;
  deliveryCarrier: string;
  deliveryCost?: string;
  customerTransactionFee?: string;
  shippingTotal: string;
  shippingStatus: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryAddress?: string;
  deliveryAddressId?: number;
  orderNotes?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  amountPaid?: string;
  amountOutstanding?: string;
  amountRefunded?: string;
  refundReason?: string;
  refundedAt?: string;
  cancelledAt?: string;
  depositPercentage?: number;
  balanceDueDays?: number;
  stripePaymentLinkUrl?: string;
  stripePaymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
  readyToCollectAt?: string;
  isQuote?: boolean;
  notes?: string;
  lastEditedAt?: string | null;
  orderImages?: Array<{
    id: string;
    url: string;
    filename: string;
    uploadedAt: string;
    description?: string;
  }>;
}

// Helper function to format address from JSON string or regular string
const formatAddress = (addressData?: string): string => {
  if (!addressData) return 'Address not provided';
  
  const addressLines = formatDeliveryAddress(addressData);
  // Additional filtering to remove any "undefined" strings
  const cleanedLines = addressLines.filter(line => line && line.trim() && line !== 'undefined');
  return cleanedLines.length > 0 ? cleanedLines.join(', ') : 'Address not provided';
};

const parseDeliveryAddress = (address: string | undefined): any => {
  if (!address) return null;
  try {
    const parsed = JSON.parse(address);
    return typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const getLabelIcon = (label?: string) => {
  switch (label?.toLowerCase()) {
    case 'home': return Home;
    case 'office': return Building;
    case 'warehouse': return Truck;
    default: return MapPin;
  }
};

export const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'confirmed':
    case 'paid':
      return 'bg-blue-100 text-blue-800';
    case 'processing':
      return 'bg-purple-100 text-purple-800';
    case 'items_prepared':
      return 'bg-green-100 text-green-800';
    case 'fulfilled':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'ready_for_collection':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
      return <Clock className="h-3 w-3" />;
    case 'confirmed':
    case 'paid':
      return <Check className="h-3 w-3" />;
    case 'processing':
      return <Package className="h-3 w-3" />;
    case 'items_prepared':
      return <Check className="h-3 w-3" />;
    case 'fulfilled':
      return <ShoppingBag className="h-3 w-3" />;
    case 'ready_for_collection':
      return <Warehouse className="h-3 w-3" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
};

export const getStatusLabel = (status: string): string => {
  switch ((status || '').toLowerCase()) {
    case 'pending':
      return 'Pending';
    case 'confirmed':
    case 'paid':
      return 'Confirmed';
    case 'processing':
      return 'Processing';
    case 'items_prepared':
      return 'Preparing';
    case 'ready_for_collection':
      return 'Ready to Collect';
    case 'fulfilled':
      return 'Fulfilled';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  }
};

export const getPaymentStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'bg-teal-100 text-teal-800';
    case 'part_paid':
      return 'bg-orange-100 text-orange-800';
    case 'unpaid':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const getPaymentStatusLabel = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'Paid';
    case 'part_paid':
      return 'Part Paid';
    case 'unpaid':
      return 'Unpaid';
    default:
      return status || 'Unknown';
  }
};

export const getPaymentMethodLabel = (order: Order): string | null => {
  const method = order.paymentMethod;
  const labels: Record<string, string> = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    payment_link: 'Card / Payment Link',
    pay_later: 'Pay Later',
    card: 'Card / Payment Link',
    cheque: 'Cheque',
    other: 'Other',
  };
  if (method && labels[method]) return labels[method];
  if (!method && order.stripePaymentIntentId) return 'Card / Payment Link';
  return null;
};

export const isOnlinePayment = (order: Order): boolean =>
  order.paymentMethod === 'payment_link' ||
  order.paymentMethod === 'card' ||
  (!order.paymentMethod && !!order.stripePaymentIntentId);

export const isQuoteEdited = (order: Order): boolean =>
  !!order.isQuote && !!order.lastEditedAt;

export const PayBalanceButton = ({ order, customerPhone }: { order: Order, customerPhone: string }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const { toast } = useToast();

  const storedLink = order.isQuote ? order.stripePaymentLinkUrl : undefined;

  const handlePayNow = async () => {
    if (storedLink) {
      window.location.href = storedLink;
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/customer/orders/${order.id}/payment-link/${encodeURIComponent(customerPhone)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.paymentLink) {
          window.location.href = data.paymentLink;
        } else {
          alert('Could not generate payment link. Please try again.');
          setIsLoading(false);
        }
      } else {
        alert('Could not generate payment link. Please try again.');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error generating payment link:', error);
      alert('Something went wrong. Please check your connection and try again.');
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!storedLink) return;
    navigator.clipboard.writeText(storedLink).then(() => {
      setCopiedLink(true);
      toast({ title: 'Link copied!' });
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch(() => {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    });
  };

  return (
    <div className="mt-2 space-y-2">
      <button
        onClick={handlePayNow}
        disabled={isLoading}
        className="inline-flex items-center justify-center btn-theme-primary disabled:opacity-50 font-medium py-1.5 px-3 rounded-lg text-xs transition-colors self-start"
      >
        {isLoading ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Generating Link...
          </>
        ) : (
          <>💳 Pay Now</>
        )}
      </button>
      {storedLink && (
        <div className="bg-white border border-gray-200 rounded p-2">
          <p className="text-xs text-gray-500 mb-1">Payment link{isQuoteEdited(order) ? ' (updated)' : ''}:</p>
          <div
            className="text-xs text-blue-600 break-all cursor-pointer hover:bg-blue-50 p-1 rounded flex items-start gap-1"
            onClick={handleCopyLink}
            title="Tap to copy"
          >
            <span className="flex-1 break-all">{storedLink}</span>
            <span className="flex-shrink-0 text-gray-400">{copiedLink ? '✓' : '⎘'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

interface ReorderPreview {
  orderNumber: string;
  fulfillmentType: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: string;
    total: string;
    sellingType: string;
    inStock: boolean;
    totalPackageWeight?: string | null;
    palletWeight?: string | null;
    packQuantity?: number | null;
    unitSize?: string | null;
    unitOfMeasure?: string | null;
  }>;
  subtotal: string;
  customerTransactionFee: string;
  deliveryCost: string;
  shippingTotal: string;
  total: string;
}

export const ReorderButton = ({ order, customerPhone, onSuccess, currency = 'GBP', open: externalOpen, onOpenChange: externalOnOpenChange }: { order: Order, customerPhone: string, onSuccess?: () => void, currency?: string, open?: boolean, onOpenChange?: (v: boolean) => void }) => {
  const fmt = (amount: string | number) => formatCurrency(amount, currency);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const isOpen = isControlled ? externalOpen : internalOpen;
  const setIsOpen = (v: boolean) => { if (!isControlled) setInternalOpen(v); externalOnOpenChange?.(v); };
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState<ReorderPreview | null>(null);
  const { toast } = useToast();

  const loadPreview = async () => {
    setIsLoadingPreview(true);
    try {
      const response = await fetch(`/api/customer/orders/${order.id}/reorder-preview/${encodeURIComponent(customerPhone)}`);
      if (response.ok) {
        const data = await response.json();
        setPreview(data);
      } else {
        toast({
          title: "Error",
          description: "Could not load order details. Please try again.",
          variant: "destructive"
        });
        setIsOpen(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
      setIsOpen(false);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConfirmReorder = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/customer/orders/${order.id}/reorder/${encodeURIComponent(customerPhone)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.paymentLink) {
          window.location.href = data.paymentLink;
        } else {
          toast({
            title: "Reorder Created",
            description: `Order ${data.orderNumber} has been created.`,
          });
          setIsOpen(false);
          onSuccess?.();
        }
      } else {
        const error = await response.json();
        toast({
          title: "Reorder Failed",
          description: error.error || "Could not place reorder. Please try again.",
          variant: "destructive"
        });
        setIsSubmitting(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen && !preview && !isLoadingPreview) {
      loadPreview();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (open && !preview) {
        loadPreview();
      }
    }}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 px-3 flex-1 sm:flex-none text-green-600 border-green-200 hover:bg-green-50"
          >
            <ShoppingBag className="h-3 w-3 mr-1" />
            <span className="text-xs">Reorder</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" style={{ zIndex: 9999 }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-green-600" />
            Reorder {order.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Review your items before proceeding to payment
          </DialogDescription>
        </DialogHeader>

        {isLoadingPreview ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading order details...</span>
          </div>
        ) : preview ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              {preview.items.map((item, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                    {item.packQuantity && item.packQuantity > 1 && item.unitSize && item.unitOfMeasure && (
                      <p className="text-xs text-gray-400 leading-tight">{item.packQuantity} × {parseFloat(String(item.unitSize))}{item.unitOfMeasure}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      {item.quantity} {item.sellingType} x {fmt(item.unitPrice)}
                    </p>
                    {(() => {
                      if (item.sellingType === 'pallets') {
                        const palw = item.palletWeight ? parseFloat(String(item.palletWeight)) : 0;
                        if (palw > 0) return <p className="text-xs text-gray-400">{formatWeight(palw)} kg/pallet</p>;
                      } else {
                        const pw = item.totalPackageWeight ? parseFloat(String(item.totalPackageWeight)) : 0;
                        if (pw > 0) return <p className="text-xs text-gray-400">{formatWeight(pw)} kg/pack</p>;
                      }
                      return null;
                    })()}
                    {!item.inStock && (
                      <p className="text-xs text-orange-600 mt-0.5">Stock may have changed</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{fmt(item.total)}</p>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>{fmt(preview.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Service Fee</span>
                <span>{fmt(preview.customerTransactionFee)}</span>
              </div>
              {parseFloat(preview.deliveryCost) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery</span>
                  <span>{fmt(preview.deliveryCost)}</span>
                </div>
              )}
              {parseFloat(preview.shippingTotal || '0') > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Shipping</span>
                  <span>{fmt(preview.shippingTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t pt-2">
                <span>Total</span>
                <span className="text-green-600">{fmt(preview.total)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs text-gray-500 bg-gray-50 p-2 rounded">
              <span>{preview.fulfillmentType === 'pickup' ? '📦 Collection' : '🚚 Delivery'}</span>
              <span>Same as original order</span>
            </div>

            <p className="text-xs text-center text-gray-500">
              Want to add items or change delivery method?{' '}
              <a href={`/store/${order.wholesalerId}`} className="text-green-600 underline hover:text-green-700">
                Visit the store
              </a>{' '}
              to place a new order.
            </p>

            <div className="flex gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline" className="flex-1">
                  Cancel
                </Button>
              </DialogClose>
              <Button 
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleConfirmReorder}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    💳 Pay & Reorder
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

// Cancellation reasons for customer requests
const customerCancellationReasons = [
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'ordered_wrong', label: 'Ordered wrong items' },
  { value: 'found_better_price', label: 'Found better price elsewhere' },
  { value: 'no_longer_needed', label: 'No longer needed' },
  { value: 'duplicate_order', label: 'Duplicate order' },
  { value: 'other', label: 'Other reason' },
];

export const CancellationRequestButton = ({ order, customerPhone, onSuccess, open: externalOpen, onOpenChange: externalOnOpenChange }: { order: Order, customerPhone: string, onSuccess?: () => void, open?: boolean, onOpenChange?: (v: boolean) => void }) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const isOpen = isControlled ? externalOpen : internalOpen;
  const setIsOpen = (v: boolean) => { if (!isControlled) setInternalOpen(v); externalOnOpenChange?.(v); };
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canCancel, setCanCancel] = useState<boolean | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [hoursRemaining, setHoursRemaining] = useState<number>(0);
  const [reasonCategory, setReasonCategory] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && canCancel === null) {
      checkCancellationEligibility();
    }
  }, [isOpen]);

  const checkCancellationEligibility = async () => {
    setIsChecking(true);
    try {
      const response = await fetch(`/api/customer/orders/${order.id}/can-cancel?customerPhone=${encodeURIComponent(customerPhone)}`);
      const data = await response.json();
      setCanCancel(data.canCancel);
      setHoursRemaining(data.hoursRemaining || 0);
      setCancelReason(data.canCancel ? null : data.reason);
    } catch (error) {
      setCanCancel(false);
      setCancelReason('Unable to check cancellation eligibility');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!reasonCategory) {
      toast({
        title: "Error",
        description: "Please select a reason for cancellation",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/customer/orders/${order.id}/request-cancellation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone,
          reasonCategory,
          reasonNotes: reasonNotes || undefined
        })
      });

      if (response.ok) {
        toast({
          title: "Request Submitted",
          description: "Your cancellation request has been sent to the seller for review.",
        });
        setIsOpen(false);
        setReasonCategory('');
        setReasonNotes('');
        onSuccess?.();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to submit cancellation request",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit cancellation request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isControlled && (order.status === 'cancelled' || order.status === 'fulfilled' || order.status === 'completed')) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50">
            <X className="h-3 w-3 mr-1" />
            <span className="text-xs">Cancel Order</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <X className="h-5 w-5 text-red-500" />
            Request Order Cancellation
          </DialogTitle>
          <DialogDescription>
            Order {order.orderNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isChecking ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Checking eligibility...</span>
            </div>
          ) : canCancel === false ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-900">Cannot Cancel</h4>
                  <p className="text-sm text-red-700 mt-1">
                    {cancelReason === 'pending_request' 
                      ? 'A cancellation request is already pending for this order.'
                      : cancelReason || 'This order cannot be cancelled.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {hoursRemaining > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-800">
                    <Clock className="h-4 w-4 inline-block mr-1" />
                    You have <strong>{hoursRemaining.toFixed(1)} hours</strong> remaining to request cancellation.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason for cancellation *
                  </label>
                  <Select value={reasonCategory} onValueChange={setReasonCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customerCancellationReasons.map((reason) => (
                        <SelectItem key={reason.value} value={reason.value}>
                          {reason.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional notes (optional)
                  </label>
                  <Textarea
                    value={reasonNotes}
                    onChange={(e) => setReasonNotes(e.target.value)}
                    placeholder="Any additional details..."
                    className="h-20"
                  />
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <p>Your request will be reviewed by the seller. You'll receive a notification once they respond.</p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
          {canCancel && (
            <Button 
              onClick={handleSubmitRequest} 
              disabled={isSubmitting || !reasonCategory}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const OrderActionsDropdown = ({ order, onViewDetails, customerPhone, onSuccess, currency, downloadingInvoiceId, onDownloadInvoice }: { order: Order, onViewDetails: () => void, customerPhone: string, onSuccess: () => void, currency: string, downloadingInvoiceId: number | null, onDownloadInvoice: () => void }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const canCancel = order.status !== 'cancelled' && order.status !== 'fulfilled' && order.status !== 'completed';

  const handleAction = (action: () => void) => {
    setMenuOpen(false);
    // Defer until after the dropdown has fully closed to avoid stuck hover states
    setTimeout(action, 50);
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-3 border-theme-primary text-theme-primary hover-bg-theme-secondary">
            Actions <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-48">
          <DropdownMenuItem onClick={() => handleAction(onViewDetails)}>
            <Eye className="h-4 w-4 mr-2" /> View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction(() => setReorderOpen(true))}>
            <ShoppingBag className="h-4 w-4 mr-2" /> Reorder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction(onDownloadInvoice)} disabled={downloadingInvoiceId === order.id}>
            {downloadingInvoiceId === order.id
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Download className="h-4 w-4 mr-2" />}
            {downloadingInvoiceId === order.id ? 'Generating...' : order.status === 'cancelled' ? 'Void Invoice' : 'Invoice'}
          </DropdownMenuItem>
          {canCancel && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => handleAction(() => setCancelOpen(true))}>
                <X className="h-4 w-4 mr-2" /> Cancel Order
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReorderButton
        order={order}
        customerPhone={customerPhone}
        onSuccess={onSuccess}
        currency={currency}
        open={reorderOpen}
        onOpenChange={setReorderOpen}
      />
      <CancellationRequestButton
        order={order}
        customerPhone={customerPhone}
        onSuccess={onSuccess}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </>
  );
};

export const OrderDetailsModal = ({ order, wholesalerId, customerPhone, currency = 'GBP' }: { order: Order, wholesalerId: string, customerPhone: string, currency?: string }) => {
  const fmt = (amount: string | number) => formatCurrency(amount, currency);
  const queryClient = useQueryClient();
  // Use stored values from order data
  const subtotal = parseFloat(order.subtotal || '0');
  const online = isOnlinePayment(order);
  const transactionFee = online ? parseFloat(order.customerTransactionFee ?? "0.00") : 0;
  const deliveryCost = parseFloat(order.deliveryCost || '0'); // Use stored delivery cost
  const totalPaid = parseFloat(order.total || '0');
  const paymentMethodLabel = getPaymentMethodLabel(order);
  
  // Calculate what the total should be for verification
  const calculatedTotal = subtotal + transactionFee + deliveryCost;
  
  return (
    <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto">
      <DialogHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div className="flex-1">
            <DialogTitle className="text-base sm:text-lg">Order {order.orderNumber}</DialogTitle>
            <DialogDescription className="text-sm">Order ID: {order.id}</DialogDescription>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                Close
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogHeader>
      
      <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
        {/* Order Status */}
        <div>
          <h3 className="font-semibold mb-2 text-sm sm:text-base">Status & Fulfillment</h3>
          <div className="flex flex-wrap gap-2">
            <Badge className={`${getStatusColor(order.status)} text-xs`}>
              {getStatusIcon(order.status)}
              <span className="ml-1 capitalize">{order.status}</span>
            </Badge>
            <Badge variant="outline" className="text-xs">
              {order.fulfillmentType === 'delivery' ? '🚚 Delivery' : '📦 Collection'}
            </Badge>
            {/* Show Refunded badge if refund was processed, otherwise show payment status */}
            {order.amountRefunded && parseFloat(order.amountRefunded) > 0 ? (
              <Badge className="bg-purple-100 text-purple-800 text-xs">
                Refunded
              </Badge>
            ) : (
              <Badge className={`${getPaymentStatusColor(order.paymentStatus || 'paid')} text-xs`}>
                {getPaymentStatusLabel(order.paymentStatus || 'paid')}
              </Badge>
            )}
            <Badge variant="outline" className={`text-xs ${order.isQuote ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
              {order.isQuote ? <><FileText className="h-3 w-3 mr-1" /> Invoice</> : <><ShoppingCart className="h-3 w-3 mr-1" /> Online Order</>}
            </Badge>
            {isQuoteEdited(order) && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                <RefreshCw className="h-3 w-3 mr-1" /> Invoice updated
              </Badge>
            )}
          </div>
        </div>

        {/* Outstanding Balance Alert - Show if there's money owed (not for cancelled orders) */}
        {parseFloat(order.amountOutstanding || '0') > 0 && order.status !== 'cancelled' && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-start">
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mr-3">
                <span className="text-lg">💳</span>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-orange-900 text-sm">Outstanding Balance</h4>
                <p className="text-orange-800 text-xs mt-1">
                  You have an outstanding balance of <span className="font-bold">{fmt(order.amountOutstanding || '0')}</span> on this order.
                </p>
                {isQuoteEdited(order) && (
                  <p className="text-amber-700 text-xs mt-1 flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 flex-shrink-0" />
                    This invoice was updated by the seller. The payment link below reflects the latest total.
                  </p>
                )}
                <div className="mt-2 bg-white rounded p-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Order Total:</span>
                    <span className="font-medium">{fmt(order.total)}</span>
                  </div>
                  {order.depositPercentage && order.depositPercentage < 100 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Deposit Required ({order.depositPercentage}%):</span>
                      <span className="font-medium">{fmt((parseFloat(order.total) * (order.depositPercentage / 100)).toFixed(2))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-green-700">
                    <span>Amount Paid:</span>
                    <span className="font-medium">{fmt(order.amountPaid || '0')}</span>
                  </div>
                  <div className="flex justify-between text-orange-700 font-semibold border-t pt-1">
                    <span>Outstanding:</span>
                    <span>{fmt(order.amountOutstanding || '0')}</span>
                  </div>
                  {order.balanceDueDays !== undefined && order.balanceDueDays > 0 && parseFloat(order.amountOutstanding || '0') > 0 && (
                    <div className="flex justify-between text-red-700 font-medium mt-1">
                      <span>Balance Due By:</span>
                      <span>{new Date(new Date(order.createdAt).getTime() + (order.balanceDueDays * 24 * 60 * 60 * 1000)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  )}
                </div>
                <PayBalanceButton order={order} customerPhone={customerPhone} />
              </div>
            </div>
          </div>
        )}

        {/* Ready for Collection Alert - Show prominently for pickup orders */}
        {order.fulfillmentType === 'pickup' && order.status === 'ready_for_collection' && (
          <div>
            <div className="bg-orange-50 border-l-4 border-orange-400 p-3 sm:p-4 rounded-r-lg">
              <div className="flex items-center">
                <Warehouse className="h-5 w-5 text-orange-600 mr-3" />
                <div>
                  <h3 className="font-semibold text-orange-900 text-sm sm:text-base">📦 Your Order is Ready for Collection!</h3>
                  <p className="text-orange-800 text-xs sm:text-sm mt-1">
                    Great news! Your order is prepared and waiting for you to collect.
                  </p>
                  {order.readyToCollectAt && (
                    <p className="text-orange-700 text-xs mt-2">
                      Ready since: {formatDateTime(order.readyToCollectAt)}
                    </p>
                  )}
                  <div className="mt-3 text-xs sm:text-sm text-orange-800">
                    <p className="font-medium">Next Steps:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Contact {order.wholesaler?.businessName} to arrange collection time</li>
                      <li>Bring a copy of this order or your order number</li>
                      <li>Collect during business hours</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Your Information */}
        <div>
          <h3 className="font-medium mb-1 text-sm sm:text-base">Your Information</h3>
          <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-1">
            <div className="text-xs break-words"><strong>Name:</strong> {order.customerName || 'Not available'}</div>
            <div className="text-xs break-all"><strong>Email:</strong> {order.customerEmail || 'Not available'}</div>
            <div className="text-xs"><strong>Phone:</strong> {order.customerPhone || 'Not available'}</div>
            {order.customerAddress && (
              <div className="text-xs break-words"><strong>Address:</strong> {formatAddress(order.customerAddress)}</div>
            )}
          </div>
        </div>

        {/* Seller Information */}
        {order.wholesaler && (order.wholesaler.legalBusinessName || order.wholesaler.vatNumber || order.wholesaler.companyRegistrationNumber) && (
          <div>
            <h3 className="font-medium mb-1 text-sm sm:text-base">Seller Information</h3>
            <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-1">
              <div className="text-xs break-words"><strong>{order.wholesaler.businessName}</strong></div>
              {order.wholesaler.legalBusinessName && (
                <div className="text-xs text-gray-600">Trading as: {order.wholesaler.legalBusinessName}</div>
              )}
              {order.wholesaler.vatNumber && (
                <div className="text-xs text-gray-600">VAT No: {order.wholesaler.vatNumber}</div>
              )}
              {order.wholesaler.companyRegistrationNumber && (
                <div className="text-xs text-gray-600">Co. Reg: {order.wholesaler.companyRegistrationNumber}</div>
              )}
            </div>
          </div>
        )}

        {/* Address Information */}
        <div>
          {order.fulfillmentType === 'pickup' ? (
            /* Collection Address - Show business address */
            <div>
              <h3 className="font-medium mb-1 text-sm sm:text-base">Collection Address</h3>
              <div className="bg-gray-50 p-2 sm:p-3 rounded-lg border border-gray-200">
                <div className="flex items-start space-x-2">
                  <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs">📦</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-600 mb-1">Collect from business</div>
                    <div className="font-medium text-sm break-words">{order.wholesaler?.businessName || 'Business'}</div>
                    {/* Business Address */}
                    {(order.wholesaler?.businessAddress || order.wholesaler?.city) && (
                      <div className="text-xs text-gray-700 mt-2 bg-white border rounded p-2">
                        <div className="font-medium text-gray-900 mb-1">Collection Address:</div>
                        <div>{order.wholesaler.businessAddress}</div>
                        {order.wholesaler.city && (
                          <div>{order.wholesaler.city} {order.wholesaler.postalCode}</div>
                        )}
                        {order.wholesaler.country && (
                          <div>{order.wholesaler.country}</div>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-gray-600 mt-1">
                      {order.status === 'ready_for_collection' 
                        ? 'Your order is ready! Contact the business to arrange collection time.'
                        : 'Contact the business to arrange collection time.'
                      }
                    </div>
                    {order.wholesaler?.businessPhone && (
                      <div className="text-xs text-gray-600 mt-1">
                        <strong>Phone:</strong> {order.wholesaler.businessPhone}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Delivery Address - Dynamic display with address change capability */
            (order.deliveryAddress || order.deliveryAddressId) && (
              <DynamicDeliveryAddressDisplay
                orderId={order.id}
                orderStatus={order.status}
                wholesalerId={wholesalerId}
                staticAddress={order.deliveryAddress}
                addressId={order.deliveryAddressId}
                className="bg-gray-50 border-gray-200"
                onAddressChanged={() => {
                  // Refresh the order data when address is changed
                  queryClient.invalidateQueries({ 
                    queryKey: ['/api/customer-orders', wholesalerId, encodeURIComponent(customerPhone)] 
                  });
                }}
              />
            )
          )}
        </div>

        {/* Order Items */}
        <div>
          <h3 className="font-medium mb-1 text-sm sm:text-base">Items ({order.items.length})</h3>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-2 bg-gray-50 rounded-lg gap-1 sm:gap-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs break-words">{item.productName}</div>
                  {item.unitSize && item.unitOfMeasure && (
                    <div className="text-xs text-gray-400">
                      {item.packQuantity && item.packQuantity > 1
                        ? `${item.packQuantity} × ${formatWeight(item.unitSize)}${item.unitOfMeasure}`
                        : `${formatWeight(item.unitSize)}${item.unitOfMeasure}`}
                    </div>
                  )}
                  {item.appliedOfferLabel && (() => {
                    const parts = item.appliedOfferLabel.split(' - ');
                    const promoName = parts[0];
                    const discountDetail = parts.length > 1 ? parts.slice(1).join(' - ') : null;
                    return (
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="inline-block bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">
                          🎁 {promoName}
                        </span>
                        {discountDetail && (
                          <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                            {discountDetail}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <div className="text-xs text-gray-600">
                    Quantity: {item.quantity} {item.sellingType === 'pallets' ? 'pallets' : 'units'} × {fmt(item.unitPrice)}
                    {(item.freeItems ?? 0) > 0 && (
                      <span className="ml-1 text-green-700 font-medium">+{item.freeItems} free</span>
                    )}
                  </div>
                </div>
                <div className="text-left sm:text-right flex-shrink-0">
                  <div className="font-medium text-xs">{fmt(parseFloat(item.unitPrice) * item.quantity)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Summary */}
        <div>
          <h3 className="font-medium mb-1 text-sm sm:text-base">Payment Summary</h3>
          <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-1">
            {paymentMethodLabel && (
              <div className="flex justify-between text-xs">
                <span className="break-words text-gray-500">Payment Method:</span>
                <span className="font-medium">{paymentMethodLabel}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="break-words">Subtotal:</span>
              <span className="font-medium">{fmt(subtotal)}</span>
            </div>
            {transactionFee > 0 && (
              <div className="flex justify-between text-xs">
                <span className="break-words">Service Fee (5.5% + £0.50):</span>
                <span className="font-medium">{fmt(transactionFee)}</span>
              </div>
            )}
            {deliveryCost > 0 && (
              <div className="flex justify-between text-xs">
                <span className="break-words">Delivery Cost:</span>
                <span className="font-medium">{fmt(deliveryCost)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-1 text-sm">
              <span>Order Total:</span>
              <span>{fmt(totalPaid)}</span>
            </div>
            {order.wholesaler?.deliveryNote && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-1.5">
                <span className="text-amber-600 text-xs mt-0.5">📦</span>
                <p className="text-xs text-amber-800">{order.wholesaler.deliveryNote}</p>
              </div>
            )}
            
            {/* Deposit and payment breakdown */}
            {order.depositPercentage && order.depositPercentage < 100 && (
              <div className="flex justify-between text-xs text-amber-700">
                <span>Deposit ({order.depositPercentage}%):</span>
                <span className="font-medium">{fmt(totalPaid * (order.depositPercentage / 100))}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-green-600">
              <span>Amount Paid:</span>
              <span className="font-medium">{fmt(order.amountPaid || '0')}</span>
            </div>
            
            {/* Outstanding balance - show £0.00 for cancelled orders */}
            {order.status === 'cancelled' ? (
              <div className="flex justify-between text-xs text-gray-600 border-t pt-1">
                <span>Outstanding Balance:</span>
                <span className="font-medium">{fmt(0)} - Nothing to pay</span>
              </div>
            ) : parseFloat(order.amountOutstanding || '0') > 0 ? (
              <div className="flex justify-between text-xs text-red-600 border-t pt-1">
                <span>Outstanding Balance:</span>
                <span className="font-medium">{fmt(order.amountOutstanding || '0')}</span>
              </div>
            ) : (
              <div className="flex justify-between text-xs text-green-600 border-t pt-1">
                <span>Outstanding Balance:</span>
                <span className="font-medium">{fmt(0)} - Fully paid</span>
              </div>
            )}
            
            {/* Refund info if applicable */}
            {order.amountRefunded && parseFloat(order.amountRefunded) > 0 && (
              <div className="flex justify-between text-xs text-purple-700 bg-purple-50 p-2 rounded mt-1">
                <span>Refunded:</span>
                <span className="font-medium">{fmt(order.amountRefunded)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Order Timeline */}
        <div>
          <h3 className="font-medium mb-2 text-sm sm:text-base">Order Timeline</h3>
          <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-2">
            <div className="flex items-start space-x-2 text-xs">
              <div className={`w-2 h-2 ${parseFloat(order.amountPaid || '0') > 0 ? 'bg-green-500' : 'bg-orange-400'} rounded-full mt-1 flex-shrink-0`}></div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-600 block">{format(new Date(order.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                <span className="font-medium break-words">
                  {parseFloat(order.amountPaid || '0') > 0
                    ? 'Payment processed successfully'
                    : order.isQuote
                      ? 'Invoice received - awaiting payment'
                      : 'Order placed - awaiting payment'}
                </span>
              </div>
            </div>
            <div className="flex items-start space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-600 block">{format(new Date(order.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                <span className="font-medium break-words">Order confirmation sent to you</span>
              </div>
            </div>
            <div className="flex items-start space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-600 block">{format(new Date(order.createdAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                <span className="font-medium break-words">Wholesaler notified of your order</span>
              </div>
            </div>
            
            {/* Ready for Collection Timeline Event */}
            {order.status === 'ready_for_collection' && order.fulfillmentType === 'pickup' && order.readyToCollectAt && (
              <div className="flex items-start space-x-2 text-xs">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600 block">{format(new Date(order.readyToCollectAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                  <span className="font-medium break-words text-orange-700">📦 Order ready for collection</span>
                </div>
              </div>
            )}

            {/* Refund Timeline Event */}
            {order.amountRefunded && parseFloat(order.amountRefunded) > 0 && (
              <div className="flex items-start space-x-2 text-xs">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600 block">
                    {order.refundedAt 
                      ? format(new Date(order.refundedAt), 'MMM d, yyyy')
                      : order.cancelledAt 
                        ? format(new Date(order.cancelledAt), 'MMM d, yyyy')
                        : 'Processing'}
                  </span>
                  <span className="font-medium break-words text-purple-700">
                    Refunded: {fmt(parseFloat(order.amountRefunded))}
                  </span>
                </div>
              </div>
            )}

            {/* Cancelled Timeline Event */}
            {order.status === 'cancelled' && (
              <div className="flex items-start space-x-2 text-xs">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600 block">
                    {order.cancelledAt 
                      ? format(new Date(order.cancelledAt), 'MMM d, yyyy \'at\' h:mm a')
                      : format(new Date(order.updatedAt), 'MMM d, yyyy \'at\' h:mm a')}
                  </span>
                  <span className="font-medium break-words text-red-700">Order Cancelled</span>
                  {order.refundReason && (
                    <span className="text-gray-500 block">{order.refundReason}</span>
                  )}
                </div>
              </div>
            )}

            {order.status === 'fulfilled' ? (
              <div className="flex items-start space-x-2 text-xs">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600 block">{format(new Date(order.updatedAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                  <span className="font-medium break-words">Order fulfilled - ready for {order.fulfillmentType}</span>
                </div>
              </div>
            ) : (
              <>
                {/* Show different pending steps based on current status and fulfillment type */}
                {order.status !== 'ready_for_collection' && (
                  <>
                    <div className="flex items-start space-x-2 text-xs">
                      <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                      <span className="text-gray-400 break-words">Awaiting wholesaler confirmation</span>
                    </div>
                    <div className="flex items-start space-x-2 text-xs">
                      <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                      <span className="text-gray-400 break-words">Order preparation pending</span>
                    </div>
                    {order.fulfillmentType === 'pickup' && (
                      <div className="flex items-start space-x-2 text-xs">
                        <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                        <span className="text-gray-400 break-words">Ready for collection notification pending</span>
                      </div>
                    )}
                  </>
                )}
                
                {/* Show final step as pending */}
                <div className="flex items-start space-x-2 text-xs">
                  <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                  <span className="text-gray-400 break-words">
                    {order.fulfillmentType === 'pickup' ? 'Collection completion pending' : 'Delivery completion pending'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Product Images Section */}
        {order.orderImages && order.orderImages.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h3 className="font-medium text-gray-900 mb-2 flex items-center text-sm sm:text-base">
              <Camera className="h-4 w-4 mr-2 text-green-600" />
              Product Photos ({order.orderImages.length})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {order.orderImages.map((image, index) => (
                <div 
                  key={image.id || index} 
                  className="relative cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => window.open(image.url, '_blank')}
                >
                  <img
                    src={image.url}
                    alt={image.filename || `Order photo ${index + 1}`}
                    className="w-full h-20 object-cover rounded border border-gray-200 hover:scale-105 transition-transform"
                    onError={(e) => {
                      console.error('🖼️ Image failed to load:', image.url);
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-1 rounded-b">
                    <div className="truncate">{image.description || image.filename || `Photo ${index + 1}`}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Click photos to view full size • Photos from {order.wholesaler?.businessName || 'your wholesaler'}
            </p>
          </div>
        )}
      </div>
    </DialogContent>
  );
};

// Component to fetch and display delivery address details by ID  
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
    queryKey: [`/api/delivery-address/${addressId}`],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="text-xs text-gray-500 mt-2 flex items-center gap-2">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Loading address...
      </div>
    );
  }

  if (error || !address) {
    return (
      <div className="text-xs text-red-500 mt-2">
        Unable to load delivery address
      </div>
    );
  }

  const Icon = getLabelIcon(address?.label);
  
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

function CustomerOrderDetailContent({ order, wholesalerId, customerPhone, currency = 'GBP', onBack }: {
  order: Order; wholesalerId: string; customerPhone: string; currency?: string; onBack: () => void;
}) {
  const fmt = (amount: string | number) => formatCurrency(amount, currency);
  const queryClient = useQueryClient();
  const subtotal = parseFloat(order.subtotal || '0');
  const online = isOnlinePayment(order);
  const transactionFee = online ? parseFloat(order.customerTransactionFee ?? "0.00") : 0;
  const deliveryCost = parseFloat(order.deliveryCost || '0');
  const totalPaid = parseFloat(order.total || '0');
  const paymentMethodLabel = getPaymentMethodLabel(order);

  return (
    <div className="bg-white min-h-screen w-full">
      {/* Sticky header with back button */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3 shadow-sm">
        <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1 text-gray-600">
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold truncate">Order {order.orderNumber}</h2>
          <p className="text-xs text-gray-500">Order ID: {order.id}</p>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
        {/* Order Status */}
        <div>
          <h3 className="font-semibold mb-2 text-sm sm:text-base">Status & Fulfillment</h3>
          <div className="flex flex-wrap gap-2">
            <Badge className={`${getStatusColor(order.status)} text-xs`}>
              {getStatusIcon(order.status)}
              <span className="ml-1 capitalize">{order.status}</span>
            </Badge>
            <Badge variant="outline" className="text-xs">
              {order.fulfillmentType === 'delivery' ? '🚚 Delivery' : '📦 Collection'}
            </Badge>
            {order.amountRefunded && parseFloat(order.amountRefunded) > 0 ? (
              <Badge className="bg-purple-100 text-purple-800 text-xs">Refunded</Badge>
            ) : (
              <Badge className={`${getPaymentStatusColor(order.paymentStatus || 'paid')} text-xs`}>
                {getPaymentStatusLabel(order.paymentStatus || 'paid')}
              </Badge>
            )}
            <Badge variant="outline" className={`text-xs ${order.isQuote ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
              {order.isQuote ? <><FileText className="h-3 w-3 mr-1" /> Invoice</> : <><ShoppingCart className="h-3 w-3 mr-1" /> Online Order</>}
            </Badge>
            {isQuoteEdited(order) && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                <RefreshCw className="h-3 w-3 mr-1" /> Invoice updated
              </Badge>
            )}
          </div>
        </div>

        {/* Outstanding Balance Alert */}
        {parseFloat(order.amountOutstanding || '0') > 0 && order.status !== 'cancelled' && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-start">
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mr-3">
                <span className="text-lg">💳</span>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-orange-900 text-sm">Outstanding Balance</h4>
                <p className="text-orange-800 text-xs mt-1">
                  You have an outstanding balance of <span className="font-bold">{fmt(order.amountOutstanding || '0')}</span> on this order.
                </p>
                {isQuoteEdited(order) && (
                  <p className="text-amber-700 text-xs mt-1 flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 flex-shrink-0" />
                    This invoice was updated by the seller. The payment link below reflects the latest total.
                  </p>
                )}
                <div className="mt-2 bg-white rounded p-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Order Total:</span>
                    <span className="font-medium">{fmt(order.total)}</span>
                  </div>
                  {order.depositPercentage && order.depositPercentage < 100 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Deposit Required ({order.depositPercentage}%):</span>
                      <span className="font-medium">{fmt((parseFloat(order.total) * (order.depositPercentage / 100)).toFixed(2))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-green-700">
                    <span>Amount Paid:</span>
                    <span className="font-medium">{fmt(order.amountPaid || '0')}</span>
                  </div>
                  <div className="flex justify-between text-orange-700 font-semibold border-t pt-1">
                    <span>Outstanding:</span>
                    <span>{fmt(order.amountOutstanding || '0')}</span>
                  </div>
                  {order.balanceDueDays !== undefined && order.balanceDueDays > 0 && parseFloat(order.amountOutstanding || '0') > 0 && (
                    <div className="flex justify-between text-red-700 font-medium mt-1">
                      <span>Balance Due By:</span>
                      <span>{new Date(new Date(order.createdAt).getTime() + (order.balanceDueDays * 24 * 60 * 60 * 1000)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  )}
                </div>
                <PayBalanceButton order={order} customerPhone={customerPhone} />
              </div>
            </div>
          </div>
        )}

        {/* Ready for Collection Alert */}
        {order.fulfillmentType === 'pickup' && order.status === 'ready_for_collection' && (
          <div className="bg-orange-50 border-l-4 border-orange-400 p-3 sm:p-4 rounded-r-lg">
            <div className="flex items-center">
              <Warehouse className="h-5 w-5 text-orange-600 mr-3" />
              <div>
                <h3 className="font-semibold text-orange-900 text-sm sm:text-base">📦 Your Order is Ready for Collection!</h3>
                <p className="text-orange-800 text-xs sm:text-sm mt-1">Great news! Your order is prepared and waiting for you to collect.</p>
                {order.readyToCollectAt && (
                  <p className="text-orange-700 text-xs mt-2">Ready since: {formatDateTime(order.readyToCollectAt)}</p>
                )}
                <div className="mt-3 text-xs sm:text-sm text-orange-800">
                  <p className="font-medium">Next Steps:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Contact {order.wholesaler?.businessName} to arrange collection time</li>
                    <li>Bring a copy of this order or your order number</li>
                    <li>Collect during business hours</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Your Information */}
        <div>
          <h3 className="font-medium mb-1 text-sm sm:text-base">Your Information</h3>
          <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-1">
            <div className="text-xs break-words"><strong>Name:</strong> {order.customerName || 'Not available'}</div>
            <div className="text-xs break-all"><strong>Email:</strong> {order.customerEmail || 'Not available'}</div>
            <div className="text-xs"><strong>Phone:</strong> {order.customerPhone || 'Not available'}</div>
            {order.customerAddress && (
              <div className="text-xs break-words"><strong>Address:</strong> {formatAddress(order.customerAddress)}</div>
            )}
          </div>
        </div>

        {/* Seller Information */}
        {order.wholesaler && (order.wholesaler.legalBusinessName || order.wholesaler.vatNumber || order.wholesaler.companyRegistrationNumber) && (
          <div>
            <h3 className="font-medium mb-1 text-sm sm:text-base">Seller Information</h3>
            <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-1">
              <div className="text-xs break-words"><strong>{order.wholesaler.businessName}</strong></div>
              {order.wholesaler.legalBusinessName && (
                <div className="text-xs text-gray-600">Trading as: {order.wholesaler.legalBusinessName}</div>
              )}
              {order.wholesaler.vatNumber && (
                <div className="text-xs text-gray-600">VAT No: {order.wholesaler.vatNumber}</div>
              )}
              {order.wholesaler.companyRegistrationNumber && (
                <div className="text-xs text-gray-600">Co. Reg: {order.wholesaler.companyRegistrationNumber}</div>
              )}
            </div>
          </div>
        )}

        {/* Address Information */}
        <div>
          {order.fulfillmentType === 'pickup' ? (
            <div>
              <h3 className="font-medium mb-1 text-sm sm:text-base">Collection Address</h3>
              <div className="bg-gray-50 p-2 sm:p-3 rounded-lg border border-gray-200">
                <div className="flex items-start space-x-2">
                  <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs">📦</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-600 mb-1">Collect from business</div>
                    <div className="font-medium text-sm break-words">{order.wholesaler?.businessName || 'Business'}</div>
                    {(order.wholesaler?.businessAddress || order.wholesaler?.city) && (
                      <div className="text-xs text-gray-700 mt-2 bg-white border rounded p-2">
                        <div className="font-medium text-gray-900 mb-1">Collection Address:</div>
                        <div>{order.wholesaler?.businessAddress}</div>
                        {order.wholesaler?.city && (
                          <div>{order.wholesaler.city} {order.wholesaler.postalCode}</div>
                        )}
                        {order.wholesaler?.country && <div>{order.wholesaler.country}</div>}
                      </div>
                    )}
                    <div className="text-xs text-gray-600 mt-1">
                      {order.status === 'ready_for_collection'
                        ? 'Your order is ready! Contact the business to arrange collection time.'
                        : 'Contact the business to arrange collection time.'}
                    </div>
                    {order.wholesaler?.businessPhone && (
                      <div className="text-xs text-gray-600 mt-1"><strong>Phone:</strong> {order.wholesaler.businessPhone}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            (order.deliveryAddress || order.deliveryAddressId) && (
              <DynamicDeliveryAddressDisplay
                orderId={order.id}
                orderStatus={order.status}
                wholesalerId={wholesalerId}
                staticAddress={order.deliveryAddress}
                addressId={order.deliveryAddressId}
                className="bg-gray-50 border-gray-200"
                onAddressChanged={() => {
                  queryClient.invalidateQueries({
                    queryKey: ['/api/customer-orders', wholesalerId, encodeURIComponent(customerPhone)]
                  });
                }}
              />
            )
          )}
        </div>

        {/* Order Items */}
        <div>
          <h3 className="font-medium mb-1 text-sm sm:text-base">Items ({order.items.length})</h3>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-2 bg-gray-50 rounded-lg gap-1 sm:gap-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs break-words">{item.productName}</div>
                  {item.unitSize && item.unitOfMeasure && (
                    <div className="text-xs text-gray-400">
                      {item.packQuantity && item.packQuantity > 1
                        ? `${item.packQuantity} × ${formatWeight(item.unitSize)}${item.unitOfMeasure}`
                        : `${formatWeight(item.unitSize)}${item.unitOfMeasure}`}
                    </div>
                  )}
                  {item.appliedOfferLabel && (() => {
                    const parts = item.appliedOfferLabel.split(' - ');
                    const promoName = parts[0];
                    const discountDetail = parts.length > 1 ? parts.slice(1).join(' - ') : null;
                    return (
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="inline-block bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">
                          🎁 {promoName}
                        </span>
                        {discountDetail && (
                          <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                            {discountDetail}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <div className="text-xs text-gray-600">
                    Quantity: {item.quantity} {item.sellingType === 'pallets' ? 'pallets' : 'units'} × {fmt(item.unitPrice)}
                    {(item.freeItems ?? 0) > 0 && (
                      <span className="ml-1 text-green-700 font-medium">+{item.freeItems} free</span>
                    )}
                  </div>
                </div>
                <div className="text-left sm:text-right flex-shrink-0">
                  <div className="font-medium text-xs">{fmt(parseFloat(item.unitPrice) * item.quantity)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Summary */}
        <div>
          <h3 className="font-medium mb-1 text-sm sm:text-base">Payment Summary</h3>
          <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-1">
            {paymentMethodLabel && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Payment Method:</span>
                <span className="font-medium">{paymentMethodLabel}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span>Subtotal:</span>
              <span className="font-medium">{fmt(subtotal)}</span>
            </div>
            {transactionFee > 0 && (
              <div className="flex justify-between text-xs">
                <span>Service Fee (5.5% + £0.50):</span>
                <span className="font-medium">{fmt(transactionFee)}</span>
              </div>
            )}
            {deliveryCost > 0 && (
              <div className="flex justify-between text-xs">
                <span>Delivery Cost:</span>
                <span className="font-medium">{fmt(deliveryCost)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-1 text-sm">
              <span>Order Total:</span>
              <span>{fmt(totalPaid)}</span>
            </div>
            {order.wholesaler?.deliveryNote && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-1.5">
                <span className="text-amber-600 text-xs mt-0.5">📦</span>
                <p className="text-xs text-amber-800">{order.wholesaler.deliveryNote}</p>
              </div>
            )}
            {order.depositPercentage && order.depositPercentage < 100 && (
              <div className="flex justify-between text-xs text-amber-700">
                <span>Deposit ({order.depositPercentage}%):</span>
                <span className="font-medium">{fmt(totalPaid * (order.depositPercentage / 100))}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-green-600">
              <span>Amount Paid:</span>
              <span className="font-medium">{fmt(order.amountPaid || '0')}</span>
            </div>
            {order.status === 'cancelled' ? (
              <div className="flex justify-between text-xs text-gray-600 border-t pt-1">
                <span>Outstanding Balance:</span>
                <span className="font-medium">{fmt(0)} - Nothing to pay</span>
              </div>
            ) : parseFloat(order.amountOutstanding || '0') > 0 ? (
              <div className="flex justify-between text-xs text-red-600 border-t pt-1">
                <span>Outstanding Balance:</span>
                <span className="font-medium">{fmt(order.amountOutstanding || '0')}</span>
              </div>
            ) : (
              <div className="flex justify-between text-xs text-green-600 border-t pt-1">
                <span>Outstanding Balance:</span>
                <span className="font-medium">{fmt(0)} - Fully paid</span>
              </div>
            )}
            {order.amountRefunded && parseFloat(order.amountRefunded) > 0 && (
              <div className="flex justify-between text-xs text-purple-700 bg-purple-50 p-2 rounded mt-1">
                <span>Refunded:</span>
                <span className="font-medium">{fmt(order.amountRefunded)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Order Timeline */}
        <div>
          <h3 className="font-medium mb-2 text-sm sm:text-base">Order Timeline</h3>
          <div className="bg-gray-50 p-2 sm:p-3 rounded-lg space-y-2">
            <div className="flex items-start space-x-2 text-xs">
              <div className={`w-2 h-2 ${parseFloat(order.amountPaid || '0') > 0 ? 'bg-green-500' : 'bg-orange-400'} rounded-full mt-1 flex-shrink-0`}></div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-600 block">{format(new Date(order.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                <span className="font-medium break-words">
                  {parseFloat(order.amountPaid || '0') > 0
                    ? 'Payment processed successfully'
                    : order.isQuote ? 'Invoice received - awaiting payment' : 'Order placed - awaiting payment'}
                </span>
              </div>
            </div>
            <div className="flex items-start space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-600 block">{format(new Date(order.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                <span className="font-medium break-words">Order confirmation sent to you</span>
              </div>
            </div>
            <div className="flex items-start space-x-2 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <span className="text-gray-600 block">{format(new Date(order.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                <span className="font-medium break-words">Wholesaler notified of your order</span>
              </div>
            </div>
            {order.status === 'ready_for_collection' && order.fulfillmentType === 'pickup' && order.readyToCollectAt && (
              <div className="flex items-start space-x-2 text-xs">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600 block">{format(new Date(order.readyToCollectAt), "MMM d, yyyy 'at' h:mm a")}</span>
                  <span className="font-medium break-words text-orange-700">📦 Order ready for collection</span>
                </div>
              </div>
            )}
            {order.amountRefunded && parseFloat(order.amountRefunded) > 0 && (
              <div className="flex items-start space-x-2 text-xs">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600 block">
                    {order.refundedAt ? format(new Date(order.refundedAt), 'MMM d, yyyy')
                      : order.cancelledAt ? format(new Date(order.cancelledAt), 'MMM d, yyyy') : 'Processing'}
                  </span>
                  <span className="font-medium break-words text-purple-700">Refunded: {fmt(parseFloat(order.amountRefunded))}</span>
                </div>
              </div>
            )}
            {order.status === 'cancelled' && (
              <div className="flex items-start space-x-2 text-xs">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600 block">
                    {order.cancelledAt
                      ? format(new Date(order.cancelledAt), "MMM d, yyyy 'at' h:mm a")
                      : format(new Date(order.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                  <span className="font-medium break-words text-red-700">Order Cancelled</span>
                  {order.refundReason && <span className="text-gray-500 block">{order.refundReason}</span>}
                </div>
              </div>
            )}
            {order.status === 'fulfilled' ? (
              <div className="flex items-start space-x-2 text-xs">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-600 block">{format(new Date(order.updatedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                  <span className="font-medium break-words">Order fulfilled - ready for {order.fulfillmentType}</span>
                </div>
              </div>
            ) : (
              <>
                {order.status !== 'ready_for_collection' && (
                  <>
                    <div className="flex items-start space-x-2 text-xs">
                      <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                      <span className="text-gray-400 break-words">Awaiting wholesaler confirmation</span>
                    </div>
                    <div className="flex items-start space-x-2 text-xs">
                      <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                      <span className="text-gray-400 break-words">Order preparation pending</span>
                    </div>
                    {order.fulfillmentType === 'pickup' && (
                      <div className="flex items-start space-x-2 text-xs">
                        <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                        <span className="text-gray-400 break-words">Ready for collection notification pending</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-start space-x-2 text-xs">
                  <div className="w-2 h-2 bg-gray-300 rounded-full mt-1 flex-shrink-0"></div>
                  <span className="text-gray-400 break-words">
                    {order.fulfillmentType === 'pickup' ? 'Collection completion pending' : 'Delivery completion pending'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Product Images */}
        {order.orderImages && order.orderImages.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h3 className="font-medium text-gray-900 mb-2 flex items-center text-sm sm:text-base">
              <Camera className="h-4 w-4 mr-2 text-green-600" />
              Product Photos ({order.orderImages.length})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {order.orderImages.map((image, index) => (
                <div key={image.id || index} className="relative cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.open(image.url, '_blank')}>
                  <img
                    src={image.url}
                    alt={image.filename || `Order photo ${index + 1}`}
                    className="w-full h-20 object-cover rounded border border-gray-200 hover:scale-105 transition-transform"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs p-1 rounded-b">
                    <div className="truncate">{image.description || image.filename || `Photo ${index + 1}`}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Click photos to view full size • Photos from {order.wholesaler?.businessName || 'your wholesaler'}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <ReorderButton order={order} customerPhone={customerPhone} currency={currency} />
          <CancellationRequestButton order={order} customerPhone={customerPhone} />
        </div>
      </div>

      <QuikpikFooter />
    </div>
  );
}

export function CustomerOrderHistory({ wholesalerId, customerPhone, currency = 'GBP' }: CustomerOrderHistoryProps) {
  const fmt = (amount: string | number) => formatCurrency(amount, currency);
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const ordersPerPage = 10;
  const queryClient = useQueryClient();

  const downloadInvoice = async (order: Order) => {
    setDownloadingInvoiceId(order.id);
    try {
      const encodedPhone = encodeURIComponent(customerPhone);
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}/${order.id}/invoice`);
      if (!response.ok) throw new Error('Failed');
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
      alert('Could not generate the invoice. Please try again.');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const { data: orders, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [`/api/customer-orders`, wholesalerId, customerPhone], // Fixed query key
    queryFn: async () => {
      // Encode the phone number properly for URL
      const encodedPhone = encodeURIComponent(customerPhone);
      console.log('🔄 Fetching customer orders:', { wholesalerId, customerPhone, encodedPhone, timestamp: new Date().toLocaleTimeString() });
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}?t=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store', // Force fresh request every time
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      console.log('📡 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You must be added to this wholesaler\'s customer list to view orders');
        }
        throw new Error('Failed to fetch order history');
      }
      const data = await response.json();
      
      // Ensure we always return an array
      const ordersArray = Array.isArray(data) ? data : [];
      
      console.log('📦 Customer orders loaded:', { 
        totalOrders: ordersArray.length,
        orderIds: ordersArray.map((o: any) => o.id),
        mostRecentOrder: ordersArray[0] ? `#${ordersArray[0].id} - ${ordersArray[0].total}` : 'none',
        timestamp: new Date().toLocaleTimeString(),
        isArray: Array.isArray(ordersArray),
        dataType: typeof data
      });
      return ordersArray;
    },
    enabled: !!wholesalerId && !!customerPhone,
    refetchInterval: false, // Disable auto-refetch to prevent conflicts
    refetchIntervalInBackground: false,
    staleTime: 0, // Always consider data stale - fetch fresh every time
    gcTime: 0, // Don't cache results
    refetchOnWindowFocus: false, // Disable to prevent conflicts
    refetchOnMount: true // Enable refetch on component mount to show fresh orders
  });

  // Debug logging for orders state
  console.log('🎯 CustomerOrderHistory render - orders data:', { isLoading, error });
  console.log('🎯 CustomerOrderHistory render - orders type:', typeof orders);
  console.log('🎯 CustomerOrderHistory render - orders length:', Array.isArray(orders) ? orders.length : 'Not an array');

  // Filter orders based on search term
  const filteredOrders = useMemo(() => {
    console.log('🔍 FilteredOrders - input data:', { orders, isArray: Array.isArray(orders), length: orders?.length });
    
    if (!orders || !Array.isArray(orders)) {
      console.log('❌ FilteredOrders - returning empty array due to invalid orders data');
      return [];
    }
    
    if (!searchTerm) return orders;
    
    return orders.filter((order: Order) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        order.orderNumber.toLowerCase().includes(searchLower) ||
        order.status.toLowerCase().includes(searchLower) ||
        order.wholesaler?.businessName?.toLowerCase().includes(searchLower) ||
        order.items.some(item => item.productName.toLowerCase().includes(searchLower)) ||
        order.total.toString().includes(searchTerm) ||
        format(new Date(order.date), 'MMM d, yyyy').toLowerCase().includes(searchLower)
      );
    });
  }, [orders, searchTerm]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
  const startIndex = (currentPage - 1) * ordersPerPage;
  const endIndex = startIndex + ordersPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Clear cache and force fresh fetch
      queryClient.invalidateQueries({ queryKey: [`/api/customer-orders`, wholesalerId, customerPhone] });
      queryClient.removeQueries({ queryKey: [`/api/customer-orders`, wholesalerId, customerPhone] });
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (selectedOrder) {
    return (
      <CustomerOrderDetailContent
        order={selectedOrder}
        wholesalerId={wholesalerId}
        customerPhone={customerPhone}
        currency={currency}
        onBack={() => setSelectedOrder(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Order History</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center space-y-4 py-8">
            {/* Enhanced Loading Animation */}
            <div className="flex space-x-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-6 bg-gradient-to-t from-blue-400 to-indigo-500 rounded-full animate-pulse"
                  style={{
                    animationDelay: `${i * 0.2}s`,
                    animationDuration: '1.8s'
                  }}
                />
              ))}
            </div>
            <p className="text-sm text-gray-500">Loading order history...</p>
            
            {/* Skeleton Cards */}
            <div className="w-full space-y-4 mt-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const isAccessDenied = error.message.includes('customer list');
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Order History</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            {isAccessDenied ? (
              <div className="space-y-3">
                <div className="text-amber-600 bg-amber-50 p-4 rounded-lg border border-amber-200">
                  <p className="font-medium mb-2">Access Required</p>
                  <p className="text-sm">
                    You need to be added to this wholesaler's customer list to view your order history. 
                    Please contact them to register your account.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">
                Unable to load order history. Please try again later.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  console.log('🎯 CustomerOrderHistory render - orders data:', { orders, isLoading, error });
  console.log('🎯 CustomerOrderHistory render - orders type:', typeof orders);
  console.log('🎯 CustomerOrderHistory render - orders length:', Array.isArray(orders) ? orders.length : 'Not an array');
  console.log('🎯 CustomerOrderHistory render - filteredOrders length:', filteredOrders?.length || 0);
  console.log('🎯 CustomerOrderHistory render - paginatedOrders length:', paginatedOrders?.length || 0);
  console.log('🎯 CustomerOrderHistory render - currentPage:', currentPage);
  console.log('🎯 CustomerOrderHistory render - totalPages:', totalPages);
  console.log('🎯 CustomerOrderHistory render - orders first item:', Array.isArray(orders) && orders.length > 0 ? orders[0] : 'No first item');
  console.log('🎯 CustomerOrderHistory render - recent orders with delivery info:', Array.isArray(orders) && orders.length > 0 ? orders.slice(0, 3).map(o => ({ id: o.id, orderNumber: o.orderNumber, fulfillmentType: o.fulfillmentType, deliveryCarrier: o.deliveryCarrier, deliveryCost: o.deliveryCost })) : 'No orders');
  
  if (!orders || orders.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Order History</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <ShoppingBag className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg mb-2">No orders yet</p>
            <p className="text-gray-400">Your order history will appear here once you place your first order.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 sm:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span className="text-lg font-semibold">Order History</span>

            {isFetching && (
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">Updating...</span>
              </div>
            )}
          </div>
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={isRefreshing || isFetching}
            className="h-8 px-2 w-full sm:w-auto"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing || isFetching ? 'animate-spin' : ''}`} />
            <span className="text-xs">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>


        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 h-10 text-base"
            />
          </div>
        </div>

        {/* Orders List */}
        {filteredOrders.length === 0 && searchTerm ? (
          <div className="text-center py-8">
            <Search className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg mb-2">No orders found</p>
            <p className="text-gray-400">Try adjusting your search terms.</p>
          </div>
        ) : (
        <div className="space-y-2">
          {paginatedOrders.map((order: Order, index: number) => {
            console.log(`Rendering order ${index}:`, order);
            return (
            <Card key={order.id} className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
              <CardContent className="p-3 sm:p-4">
                <div className="space-y-3">
                  {/* Order header with badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">{order.orderNumber}</div>
                    <Badge className={`${getStatusColor(order.status)} text-xs`}>
                      {getStatusIcon(order.status)}
                      <span className="ml-1">{getStatusLabel(order.status)}</span>
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${order.fulfillmentType === 'delivery' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}
                    >
                      {order.fulfillmentType === 'delivery' ? '🚚 Delivery' : '📦 Collection'}
                    </Badge>
                    {order.amountRefunded && parseFloat(order.amountRefunded) > 0 ? (
                      <Badge className="bg-purple-100 text-purple-800 text-xs">
                        Refunded
                      </Badge>
                    ) : order.status !== 'cancelled' ? (
                      <Badge className={`${getPaymentStatusColor(order.paymentStatus || 'unpaid')} text-xs`}>
                        {getPaymentStatusLabel(order.paymentStatus || 'unpaid')}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className={`text-xs ${order.isQuote ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
                      {order.isQuote ? <><FileText className="h-3 w-3 mr-1" /> Invoice</> : <><ShoppingCart className="h-3 w-3 mr-1" /> Online Order</>}
                    </Badge>
                    {isQuoteEdited(order) && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                        <RefreshCw className="h-3 w-3 mr-1" /> Invoice updated
                      </Badge>
                    )}
                  </div>

                  {/* Wholesaler info */}
                  <div className="text-xs text-gray-600 flex flex-wrap items-center gap-2">
                    <span>From</span>
                    <Badge variant="outline" className="text-xs px-2 py-0.5 break-words">
                      {order.wholesaler?.businessName || 'Unknown Business'}
                    </Badge>
                  </div>
                  
                  {/* Mobile-friendly summary layout */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span>{format(new Date(order.date), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="text-sm font-semibold text-green-600">
                        {fmt(parseFloat(order.total))}
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex justify-end">
                      <OrderActionsDropdown
                        order={order}
                        onViewDetails={() => setSelectedOrder(order)}
                        customerPhone={customerPhone}
                        onSuccess={() => handleRefresh()}
                        currency={currency}
                        downloadingInvoiceId={downloadingInvoiceId}
                        onDownloadInvoice={() => downloadInvoice(order)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
        )}

        {/* Pagination Controls */}
        {filteredOrders.length > ordersPerPage && (
          <div className="mt-6 space-y-3 sm:space-y-4">
            {/* Order count - mobile friendly */}
            <div className="text-sm text-gray-600 text-center">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length} orders
            </div>
            
            {/* Pagination controls - mobile optimized */}
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="h-8 px-2 sm:px-3"
              >
                <ChevronLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              
              {/* Page numbers - simplified on mobile */}
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  // Show first page, last page, current page, and pages around current
                  const showPage = page === 1 || page === totalPages || 
                    (page >= currentPage - 1 && page <= currentPage + 1);
                  
                  if (!showPage && page === 2 && currentPage > 4) {
                    return <span key={page} className="px-2 text-gray-400">...</span>;
                  }
                  if (!showPage && page === totalPages - 1 && currentPage < totalPages - 3) {
                    return <span key={page} className="px-2 text-gray-400">...</span>;
                  }
                  if (!showPage) return null;
                  
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="h-8 w-8 p-0"
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>

              {/* Mobile page indicator */}
              <div className="sm:hidden flex items-center">
                <span className="text-sm text-gray-600 px-3">
                  Page {currentPage} of {totalPages}
                </span>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="h-8 px-2 sm:px-3"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4 sm:ml-1" />
              </Button>
            </div>
          </div>
        )}
        
        {/* Quikpik Footer */}
        <QuikpikFooter />
      </CardContent>
    </Card>
  );
}