import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";

// Core UI Components - loaded immediately
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// Icons - grouped for better tree shaking
import { 
  ShoppingCart, Plus, Minus, Trash2, Package, Store, Search, 
  Grid, List, Home, User, Settings, ShoppingBag, CheckCircle,
  Building2, History, Clock, Truck, CreditCard, Palette, TrendingUp, Banknote, ChevronRight,
  Eye, ShieldCheck, ArrowLeft, ArrowRight, Heart,
  HelpCircle, Building, Star, Mail, Phone, MapPin, Filter, FileText,
  X, Check, Loader2, Download, Share2, Lock, ChevronDown
} from "lucide-react";

// Optimized imports and lazy loading
import { LazyOrderHistory, LazyThankYouPage, ComponentLoader } from "@/components/LazyComponents";
import Logo from "@/components/ui/logo";
import { CustomerAuth } from "@/components/customer/CustomerAuth";
import CustomerHelp from "@/components/customer/CustomerHelp";
import { format } from "date-fns";
import {
  Order,
  getStatusColor,
  getStatusIcon,
  getStatusLabel,
  getPaymentStatusColor,
  getPaymentStatusLabel,
  OrderDetailsModal,
  OrderActionsDropdown,
  PayBalanceButton,
} from "@/components/customer/CustomerOrderHistory";
import { DeliveryAddressManager } from "@/components/customer/DeliveryAddressManager";
import { FirstTimeAddressSetup } from "@/components/customer/FirstTimeAddressSetup";
import { AddressSelector } from "@/components/customer/AddressSelector";
import { useOptimizedQuery, useCriticalQuery } from "@/hooks/useOptimizedQuery";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ProductGridSkeleton } from "@/components/ui/loading-skeletons";
import { ThemeSwitcher, useCustomerTheme } from "@/components/ui/theme-switcher";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Shared utilities and types
import { Product as ProductType, PromotionalOfferType } from "@shared/schema";
import { cleanAIDescription } from "@shared/utils";

import { formatCurrency, formatNumber } from "@shared/utils/currency";
import { QuikpikFooter } from "@/components/ui/quikpik-footer";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { debounce } from "@/utils/performance";
import { StockIndicator } from "@/components/ui/stock-indicator";
import { Package2, Hash } from "lucide-react";
import { getGuestStockRows, getSellingFormatLabel } from "@/lib/guest-catalogue";

// Extended Product type that includes all schema fields for customer portal
type ExtendedProduct = ProductType & {
  wholesaler?: {
    id: string;
    businessName?: string | null;
    logoUrl?: string | null;
  };
  palletMoq?: number | null;
  palletStock?: number | null;
  palletPrice?: string | null;
  unitsPerPallet?: number | null;
  palletWeight?: string | null;
};

// Cart item type
// Unified CartItem type
type CartItem = {
  product: ExtendedProduct;
  quantity: number;
  sellingType: "units" | "pallets";
};

// Initialize Stripe
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// Utility functions

const getCurrencySymbol = (currency = 'GBP'): string => {
  switch (currency?.toUpperCase()) {
    case 'GBP': return '£';
    case 'EUR': return '€';
    case 'USD': return '$';
    default: return '£';
  }
};

// Price display component that hides pricing for guests
const PriceDisplay = ({ 
  price, 
  originalPrice, 
  currency, 
  isGuestMode, 
  size = 'medium',
  showStrikethrough = false 
}: {
  price: number | null | undefined;
  originalPrice?: number | null;
  currency?: string;
  isGuestMode: boolean;
  size?: 'small' | 'medium' | 'large';
  showStrikethrough?: boolean;
}) => {
  const currencySymbol = getCurrencySymbol(currency);
  const safePrice = typeof price === 'number' && Number.isFinite(price) ? price : 0;
  const safeOriginalPrice = typeof originalPrice === 'number' && Number.isFinite(originalPrice) ? originalPrice : undefined;
  const hasDiscount = safeOriginalPrice && safeOriginalPrice > safePrice;

  if (isGuestMode) {
    return (
      <div className="flex flex-col gap-1">
        <span className={`font-semibold text-gray-900 bg-gray-100 border border-gray-200 rounded-full px-3 py-1 w-fit ${
          size === 'small' ? 'text-xs' : 
          size === 'large' ? 'text-base' : 'text-sm'
        }`}>
          Login to view price
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`font-bold ${
        hasDiscount ? 'text-green-600' : 'text-gray-900'
      } ${
        size === 'small' ? 'text-sm' : 
        size === 'large' ? 'text-xl' : 'text-base'
      }`}>
{formatCurrency(safePrice, currency)}
      </span>
      {hasDiscount && showStrikethrough && (
        <span className={`line-through text-gray-500 ${
          size === 'small' ? 'text-xs' : 
          size === 'large' ? 'text-lg' : 'text-sm'
        }`}>
{formatCurrency(safeOriginalPrice, currency)}
        </span>
      )}
    </div>
  );
};

// Loading skeleton components
const ProductCardSkeleton = () => (
  <Card className="h-full">
    <CardContent className="p-4">
      <div className="space-y-3">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex space-x-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-12" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const FeaturedProductSkeleton = () => (
  <Card className="mb-8">
    <CardContent className="p-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </CardContent>
  </Card>
);

// Types
interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  moq: number;
  stock: number;
  category?: string;
  imageUrl?: string;
  status: string;
  priceVisible: boolean;
  negotiationEnabled: boolean;
  minimumBidPrice?: string;
  promoPrice?: string;
  promoActive?: boolean;
  deliveryExcluded?: boolean; // New field for delivery exclusion
  
  // Pallet support fields
  palletPrice?: string;
  palletMoq?: number;
  palletStock?: number;
  sellingFormat?: "units" | "pallets" | "both";
  lowStockThreshold?: number;
  
  // Flexible unit system
  packQuantity?: number;
  unitOfMeasure?: string;
  unitSize?: string;
  unitWeight?: string;
  totalPackageWeight?: string;
  
  // Weight fields for backward compatibility
  unit_weight?: string;
  total_package_weight?: string;
  
  // Promotional offers
  promotionalOffers?: any[];

  // Price list custom pricing (injected by server when customer has active price list)
  customPrice?: string;
  standardPrice?: string;
  hasPriceList?: boolean;
  
  wholesaler: {
    id: string;
    businessName: string;
    businessPhone?: string;
    businessAddress?: string;
    profileImageUrl?: string;
    defaultCurrency?: string;
    pickupAddress?: string;
    pickupInstructions?: string;
  };
}



interface CustomerData {
  name: string;
  email: string;
  phone: string;
  businessName?: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
  shippingOption: "pickup" | "delivery" | undefined;
  selectedDeliveryAddress?: any;
  selectedShippingService?: any;
}

// Stripe Checkout Form Component
interface StripeCheckoutFormProps {
  cart: CartItem[];
  customerData: CustomerData;
  wholesaler: any;
  totalAmount: number;
  clientSecret: string;
  onSuccess: (orderData: {
    orderNumber: string;
    cart: CartItem[];
    customerData: any;
    totalAmount: number;
    subtotal: number;
    transactionFee: number;
    shippingCost: number;
  }) => void;
}

const StripeCheckoutForm = ({ cart, customerData, wholesaler, totalAmount, clientSecret, onSuccess }: StripeCheckoutFormProps) => {
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Note: Shipping handled directly by supplier - no payment intent recreation needed for shipping changes
  const { toast } = useToast();

  // Payment intent creation is now handled by parent component
  // This component only handles the Stripe payment form with provided clientSecret
  useEffect(() => {
    console.log('🚚 STRIPE FORM: Client secret provided:', !!clientSecret);
  }, [clientSecret]);

  if (!clientSecret) {
    return (
      <div className="text-center py-8">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex space-x-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-7 rounded-full animate-bounce"
                style={{
                  background: 'var(--theme-primary)',
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '1.2s'
                }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-600">Preparing payment...</p>
        </div>
      </div>
    );
  }

  return (
    <Elements 
      stripe={stripePromise} 
      options={{ 
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#22C55E', // Use brand green color
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          },
        },
        // Add default locale for consistency
        locale: 'en'
      }}
    >
      <PaymentFormContent 
        onSuccess={onSuccess} 
        totalAmount={totalAmount} 
        wholesaler={wholesaler}
      />
    </Elements>
  );
};

// Separate component for the actual form content
const PaymentFormContent = ({ 
  onSuccess, 
  totalAmount, 
  wholesaler
}: { 
  onSuccess: (orderData?: any) => void;
  totalAmount: number;
  wholesaler: any;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [paymentFailureDialog, setPaymentFailureDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || isProcessing || paymentSubmitted) {
      console.error('💳 Payment Error: Stripe/Elements not loaded or payment already in progress');
      return;
    }

    setIsProcessing(true);
    setPaymentSubmitted(true); // Prevent multiple submissions

    try {
      
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
        redirect: "if_required",
      });

      console.log('💳 Payment confirmation result:', { 
        hasError: !!error, 
        errorType: error?.type,
        errorCode: error?.code,
        errorMessage: error?.message,
        paymentIntentId: paymentIntent?.id,
        paymentIntentStatus: paymentIntent?.status 
      });

      if (error) {
        // Enhanced payment failure handling with detailed error messages
        let errorMessage = "Payment failed. Please try again.";
        let errorTitle = "Payment Failed";
        
        // Handle specific error types
        if (error.type === 'card_error') {
          switch (error.code) {
            case 'card_declined':
              errorMessage = "Your card was declined. Please try a different payment method or contact your bank.";
              break;
            case 'insufficient_funds':
              errorMessage = "Insufficient funds. Please check your account balance or try a different card.";
              break;
            case 'expired_card':
              errorMessage = "Your card has expired. Please use a different payment method.";
              break;
            case 'incorrect_cvc':
              errorMessage = "The security code (CVC) is incorrect. Please check and try again.";
              break;
            case 'processing_error':
              errorMessage = "Payment processing error. Please try again in a few moments.";
              break;
            default:
              errorMessage = error.message || "Card payment failed. Please check your card details.";
          }
        } else if (error.type === 'validation_error') {
          errorMessage = "Invalid payment details. Please check your information and try again.";
        } else if (error.type === 'api_error') {
          // Check if this might be a Stripe account issue
          if (error.message && (error.message.includes('account') || error.message.includes('setup') || error.message.includes('onboarding'))) {
            errorTitle = "Store Payment Setup Issue";
            errorMessage = "The business owner may need to complete their payment setup. Please contact them directly or try again later.";
          } else {
            errorMessage = "Payment service temporarily unavailable. Please try again later.";
          }
        } else if (error.type === 'invalid_request_error') {
          // This could indicate Stripe account setup issues
          errorTitle = "Payment Configuration Issue";
          
          // Provide more helpful error messages based on specific error codes
          if (error.code === 'payment_intent_invalid_parameter' || error.code === 'payment_intent_creation_failed') {
            errorMessage = "The payment setup has an issue. Please try again, or contact the business owner if the problem persists.";
          } else if (error.code === 'account_invalid' || error.message?.includes('account')) {
            errorMessage = "The business payment account needs attention. Please contact the business owner to resolve this issue.";
          } else if (error.code === 'setup_intent_invalid' || error.code === 'payment_method_invalid') {
            errorMessage = "Payment method configuration issue. Please try refreshing the page and attempting payment again.";
          } else {
            errorMessage = "There's an issue with the payment setup. Please contact the business owner or try again later.";
          }
          
          // Log detailed error for debugging
          console.error('💳 INVALID REQUEST ERROR Details:', {
            code: error.code,
            message: error.message,
            type: error.type,
            decline_code: error.decline_code
          });
        } else {
          errorMessage = error.message || "An unexpected payment error occurred. Please try again.";
        }
        
        // Show both toast notification and dialog popup
        toast({
          title: errorTitle,
          description: errorMessage,
          variant: "destructive",
        });
        
        // Show prominent dialog popup for payment failure
        setPaymentFailureDialog({
          isOpen: true,
          title: errorTitle,
          message: errorMessage
        });
        
        // Reset payment submitted on error to allow retry
        setPaymentSubmitted(false);

      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Payment succeeded - immediately create order to ensure it saves to database
        console.log('✅ Payment succeeded! PaymentIntent:', paymentIntent.id);
        console.log('💾 Creating order immediately to ensure it saves to database');
        
        try {
          // Call the order creation endpoint directly to ensure order is saved
          const response = await fetch("/api/marketplace/create-order", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              paymentIntentId: paymentIntent.id
            })
          });
          
          if (response.ok) {
            const orderData = await response.json();
            console.log('✅ Order created successfully:', orderData);
            
            // Success callback with order data for thank you page
            // Get accurate values from payment intent metadata
            const metadata = (paymentIntent as any).metadata || {};
            const actualSubtotal = parseFloat(metadata.productSubtotal || '0');
            const actualShipping = parseFloat(metadata.shippingCost || '0');
            const actualTransactionFee = parseFloat(metadata.customerTransactionFee || '0');
            const actualTotal = parseFloat(metadata.totalCustomerPays || '0');
            
            onSuccess({
              orderNumber: orderData.orderNumber || `Order #${orderData.orderId}`,
              cart: [],
              customerData: {},  
              totalAmount: actualTotal,
              subtotal: actualSubtotal,
              transactionFee: actualTransactionFee,
              shippingCost: actualShipping
            });
            
            toast({
              title: "Payment Successful!",
              description: `Order #${orderData.orderNumber || orderData.id} has been placed successfully. You'll receive a confirmation email shortly.`,
            });
          } else {
            console.error('❌ Order creation failed:', response.status);
            toast({
              title: "Payment Successful!",
              description: "Payment processed successfully. If you don't receive a confirmation email within 5 minutes, please contact the wholesaler.",
            });
            
            // Still call success callback even if order creation failed, payment succeeded
            // Get accurate values from payment intent metadata
            const metadata = (paymentIntent as any).metadata || {};
            const actualSubtotal = parseFloat(metadata.productSubtotal || '0');
            const actualShipping = parseFloat(metadata.shippingCost || '0');
            const actualTransactionFee = parseFloat(metadata.customerTransactionFee || '0');
            const actualTotal = parseFloat(metadata.totalCustomerPays || '0');
            
            onSuccess({
              orderNumber: `Order #${paymentIntent.id.slice(-8)}`,
              cart: [],
              customerData: {},
              totalAmount: actualTotal,
              subtotal: actualSubtotal,
              transactionFee: actualTransactionFee,
              shippingCost: actualShipping
            });
          }
        } catch (orderError) {
          console.error('❌ Error creating order:', orderError);
          
          // Still call success callback even if order creation failed, payment succeeded
          // Get accurate values from payment intent metadata
          const metadata = (paymentIntent as any).metadata || {};
          const actualSubtotal = parseFloat(metadata.productSubtotal || '0');
          const actualShipping = parseFloat(metadata.shippingCost || '0');
          const actualTransactionFee = parseFloat(metadata.customerTransactionFee || '0');
          const actualTotal = parseFloat(metadata.totalCustomerPays || '0');
          
          onSuccess({
            orderNumber: `Order #${paymentIntent.id.slice(-8)}`,
            cart: [],
            customerData: {},
            totalAmount: actualTotal,
            subtotal: actualSubtotal,
            transactionFee: actualTransactionFee,
            shippingCost: actualShipping
          });
          
          toast({
            title: "Payment Successful!",
            description: "Payment processed successfully. If you don't receive a confirmation email within 5 minutes, please contact the wholesaler.",
          });
        }
      } else {
        console.log('⚠️ Unexpected payment result:', { error, paymentIntent });
      }
    } catch (error: any) {
      console.error('Unexpected payment error:', error);
      
      // Enhanced error handling for unexpected payment errors
      let errorMessage = "An unexpected error occurred during payment. Please try again.";
      let errorTitle = "Payment Error";
      
      if (error.name === 'NetworkError') {
        errorMessage = "Network connection failed. Please check your internet connection and try again.";
      } else if (error.name === 'TimeoutError') {
        errorMessage = "Payment request timed out. Please try again.";
      } else if (error.message) {
        errorMessage = `Payment error: ${error.message}. Please try again.`;
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-4 border rounded-lg">
          <PaymentElement />
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <div className="flex items-center space-x-2 mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-semibold">Secure Payment Processing</span>
            <HelpCircle className="w-3 h-3 text-blue-600 cursor-help" />
          </div>
          <p>Your payment is processed securely through Stripe. Transaction fee (5.5% + £0.50) is included in the total.</p>
        </div>

        <Button
          type="submit"
          disabled={!stripe || isProcessing || paymentSubmitted}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
        >
          {isProcessing ? "Processing..." : paymentSubmitted ? "Payment Submitted..." : `Pay ${formatCurrency(totalAmount, wholesaler?.defaultCurrency)}`}
        </Button>
      </form>

      {/* Payment Failure Dialog */}
      <Dialog open={paymentFailureDialog.isOpen} onOpenChange={(open) => setPaymentFailureDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-red-600 mb-2">{paymentFailureDialog.title}</h3>
            <p className="text-gray-700 mb-4">{paymentFailureDialog.message}</p>
            <Button onClick={() => setPaymentFailureDialog(prev => ({ ...prev, isOpen: false }))} variant="outline">
              Try Again
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

function RecentOrdersSection({ wholesalerId, customerPhone, onViewAllOrders, defaultCurrency }: { wholesalerId: string; customerPhone: string; onViewAllOrders: () => void; defaultCurrency?: string }) {
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<number | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);

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

  const { data: recentOrders = [] } = useQuery({
    queryKey: [`/api/customer-orders`, wholesalerId, customerPhone, 'recent'],
    queryFn: async () => {
      const encodedPhone = encodeURIComponent(customerPhone);
      const response = await fetch(`/api/customer-orders/${wholesalerId}/${encodedPhone}?limit=3`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!wholesalerId && !!customerPhone,
  });

  if (recentOrders.length === 0) return null;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/customer-orders`, wholesalerId, customerPhone, 'recent'] });
  };

  return (
    <div className="bg-white rounded-lg p-6 border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Recent Orders</h2>
        <Button
          variant="outline"
          onClick={onViewAllOrders}
          className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
        >
          View All Orders
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recentOrders.map((order: Order) => (
          <div key={order.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-sm pt-0.5">{order.orderNumber}</span>
              <div className="flex flex-col items-end gap-1">
                {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
                  <PayBalanceButton order={order} customerPhone={customerPhone} />
                )}
                <span className="text-xs text-gray-400">
                  {order.createdAt ? format(new Date(order.createdAt), 'dd/MM/yyyy') : ''}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`${getStatusColor(order.status)} text-xs`}>
                {getStatusIcon(order.status)}
                <span className="ml-1">{getStatusLabel(order.status || '')}</span>
              </Badge>
              {order.paymentStatus && order.status !== 'cancelled' && (
                <Badge className={`${getPaymentStatusColor(order.paymentStatus)} text-xs`}>
                  {getPaymentStatusLabel(order.paymentStatus)}
                </Badge>
              )}
              <Badge variant="outline" className={`text-xs ${order.isQuote ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
                {order.isQuote ? <><FileText className="h-3 w-3 mr-1" /> Quote</> : <><ShoppingCart className="h-3 w-3 mr-1" /> Online</>}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-600">
              {order.fulfillmentType === 'delivery' ? (
                <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Delivery</span>
              ) : (
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Collection</span>
              )}
              <span className="font-medium text-gray-900">{formatCurrency(parseFloat(order.total || order.subtotal), defaultCurrency || 'GBP')}</span>
              {order.items && order.items.length > 0 && (
                <span>{order.items.length} item{order.items.length > 1 ? 's' : ''}</span>
              )}
            </div>

            <div className="flex justify-end pt-1.5 border-t border-gray-100">
              <OrderActionsDropdown
                order={order}
                onViewDetails={() => setSelectedOrderForDetails(order)}
                customerPhone={customerPhone}
                onSuccess={handleRefresh}
                currency={defaultCurrency || 'GBP'}
                downloadingInvoiceId={downloadingInvoiceId}
                onDownloadInvoice={() => downloadInvoice(order)}
              />
            </div>
          </div>
        ))}
      </div>

      {selectedOrderForDetails && (
        <Dialog open={!!selectedOrderForDetails} onOpenChange={(o) => { if (!o) setSelectedOrderForDetails(null); }}>
          <OrderDetailsModal
            order={selectedOrderForDetails}
            wholesalerId={wholesalerId}
            customerPhone={customerPhone}
          />
        </Dialog>
      )}
    </div>
  );
}

// VERSION MARKER – logs once at module load to confirm deployed bundle identity.
// Root cause of "wholesaler is not defined" crash:
//   A conditional early-return (if !wholesalerId) was placed in the MIDDLE of hook
//   declarations, with `const { data: wholesaler } = useQuery(...)` after it. On renders
//   where wholesalerId was falsy the hook was skipped, causing a React hooks-count mismatch
//   on the next render (where it was truthy). The resulting error was caught by ErrorBoundary
//   as "wholesaler is not defined". Fixed in task109 by moving the early-return to AFTER all
//   hooks. This module-level log confirms the fix is deployed.
const CUSTOMER_PORTAL_VERSION = 'task110-fix-2026-04-13';
console.log(`[CustomerPortal ${CUSTOMER_PORTAL_VERSION}] module loaded`);

export default function CustomerPortal() {
  const { id: wholesalerIdParam } = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Theme system
  const { theme, changeTheme } = useCustomerTheme();

  // Detect if this is preview mode (accessed via /preview-store or wholesaler viewing own store)
  const isPreviewMode = location === '/preview-store' || location.startsWith('/preview-store/');
  
  // Get authenticated user to check if wholesaler is viewing their own store
  const { data: user } = useQuery<{
    id?: string;
    role?: string;
    wholesalerId?: string;
    firstName?: string;
    lastName?: string;
  }>({
    queryKey: ["/api/auth/user"],
    enabled: isPreviewMode || !!wholesalerIdParam, // Enable for preview mode or when viewing store with ID
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false,
  });
  
  // Static wholesaler ID calculation to prevent infinite re-renders
  const wholesalerId = useMemo(() => {
    // Check for WhatsApp pre-selection parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const whatsappWholesaler = urlParams.get('store');
    
    if (whatsappWholesaler) {
      return whatsappWholesaler;
    }
    
    // Always prioritize URL parameter extraction for customer portal
    const rawId = wholesalerIdParam || 
                  (location.includes('/store/') ? location.split('/store/')[1] : 
                   location.includes('/preview-store/') ? location.split('/preview-store/')[1] :
                   location.split('/customer/')[1]);
    // Decode URL encoding and remove query parameters
    const decodedId = rawId ? decodeURIComponent(rawId) : undefined;
    const cleanId = decodedId ? decodedId.split('?')[0] : undefined;
    return cleanId;
  }, [wholesalerIdParam, location]);
  
  // Check if current user is a wholesaler viewing their own store
  const isWholesalerOwnStore = useMemo(() => {
    if (!user || user.role !== 'wholesaler') return false;
    if (!wholesalerId) return false;
    
    // Check if the wholesaler ID matches the current user's ID
    return user.id === wholesalerId || user.wholesalerId === wholesalerId;
  }, [user, wholesalerId]);
  
  // Enhanced preview mode that includes wholesaler own store access
  const isEnhancedPreviewMode = isPreviewMode || isWholesalerOwnStore;



  // Customer authentication state - using server sessions
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticatedCustomer, setAuthenticatedCustomer] = useState<any>(null);
  const [showFirstTimeAddressSetup, setShowFirstTimeAddressSetup] = useState(false);
  const [isSwitchingWholesaler, setIsSwitchingWholesaler] = useState(false);
  const [showStoreSwitcher, setShowStoreSwitcher] = useState(false);

  // Dedicated query for the store switcher — only fires when the sheet is open
  const { data: switcherStores = [], isLoading: switcherStoresLoading } = useQuery({
    queryKey: ["/api/customer-accessible-wholesalers/switcher", authenticatedCustomer?.phone],
    queryFn: async () => {
      const phoneNumber = encodeURIComponent(authenticatedCustomer!.phone);
      const res = await fetch(`/api/customer-accessible-wholesalers/${phoneNumber}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showStoreSwitcher && !!authenticatedCustomer?.phone,
    staleTime: 60 * 1000, // 1 minute — fine for switcher
  });

  // Customer order statistics query
  const { data: customerOrderStats } = useQuery({
    queryKey: ["/api/customer-orders/stats", wholesalerId, authenticatedCustomer?.phone],
    queryFn: async () => {
      if (!wholesalerId || !authenticatedCustomer?.phone) return null;
      
      const response = await fetch(`/api/customer-orders/stats/${wholesalerId}/${encodeURIComponent(authenticatedCustomer.phone)}`, {
        credentials: "include",
      });
      
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!wholesalerId && !!authenticatedCustomer?.phone && isAuthenticated,
    staleTime: 0, // CRITICAL FIX: No cache to prevent cross-customer contamination
    refetchOnMount: true, // Always fetch fresh data on component mount
    refetchInterval: 30000, // silently re-poll every 30 s
    refetchIntervalInBackground: false, // pause when tab is hidden
  });

  // Check for existing customer session on load
  const { data: sessionData, isLoading: sessionLoading, refetch: refetchSession } = useQuery({
    queryKey: ["/api/customer-auth/check", wholesalerId],
    queryFn: async () => {
      if (!wholesalerId) throw new Error("No wholesaler ID");
      
      const response = await fetch(`/api/customer-auth/check/${wholesalerId}`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Session expired or doesn't exist
          return null;
        }
        throw new Error("Failed to check authentication");
      }
      
      return response.json();
    },
    enabled: !!wholesalerId && !isEnhancedPreviewMode,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchInterval: 10 * 60 * 1000, // Check every 10 minutes
  });
  const [showHomePage, setShowHomePage] = useState(true);
  // Check if coming from CustomerLogin with auth parameter or if user wants to login
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const hasAuthParam = urlParams.has('auth');
  const forceLoginParam = urlParams.has('login');
  const forceGuestParam = urlParams.get('guest') === 'true';
  const [showAuth, setShowAuth] = useState(() => {
    const isPreviewModeCheck = location === '/preview-store' || location.startsWith('/preview-store/');
    const hasAuthParamCheck = new URLSearchParams(window.location.search).has('auth');
    const forceLoginParamCheck = new URLSearchParams(window.location.search).has('login');
    const forceGuestParamCheck = new URLSearchParams(window.location.search).get('guest') === 'true';
    return !isPreviewModeCheck && !forceGuestParamCheck && (!hasAuthParamCheck || forceLoginParamCheck);
  });
  const [isGuestMode, setIsGuestMode] = useState(true);
  const [showGuestSignInModal, setShowGuestSignInModal] = useState(false);
  const [openRequestAccessOnAuth, setOpenRequestAccessOnAuth] = useState(false);
  const hasCustomerSession = isAuthenticated && !!authenticatedCustomer;
  const isTrueGuestMode = isGuestMode && !hasCustomerSession && !isEnhancedPreviewMode;
  const shouldFetchGuestSafeProducts = !hasCustomerSession && !isEnhancedPreviewMode;

  // State management
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [productImageIndexes, setProductImageIndexes] = useState<Record<number, number>>({});
  const carouselTouchStartX = useRef<number>(0);
  
  // State for enhanced unit/pallet selection modal
  const [showUnitSelectionModal, setShowUnitSelectionModal] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<ExtendedProduct | null>(null);
  const [modalStep, setModalStep] = useState<'type' | 'quantity'>('type');
  const [selectedModalType, setSelectedModalType] = useState<'units' | 'pallets' | null>(null);
  const [modalQuantity, setModalQuantity] = useState(1);
  const [quantityInputValues, setQuantityInputValues] = useState<Record<number, string>>({});
  const [editableQuantities, setEditableQuantities] = useState<Record<string, string>>({});

  // Payment intent creation state
  const [clientSecret, setClientSecret] = useState("");
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [lastUsedShippingOption, setLastUsedShippingOption] = useState<'pickup' | 'delivery' | null>(null);
  const [showMOQWarnings, setShowMOQWarnings] = useState<Record<number, boolean>>({});
  const [showQuantityHints, setShowQuantityHints] = useState<Record<number, boolean>>({});
  const [activeQuantityInput, setActiveQuantityInput] = useState<number | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  
  // Welcome microinteraction states
  const [showWelcomeAnimation, setShowWelcomeAnimation] = useState(false);
  const [personalizedMessage, setPersonalizedMessage] = useState("");
  
  const [featuredProductId, setFeaturedProductId] = useState<number | null>(() => {
    // Initialize from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const urlFeatured = urlParams.get('featured');
    return urlFeatured ? parseInt(urlFeatured, 10) : null;
  });
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  
  // Tab state for modern interface — reads ?tab= URL param so email "View Order" links deep-link to Orders tab
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    return tabParam === 'orders' || tabParam === 'products' || tabParam === 'account' ? tabParam : 'home';
  });
  
  // Wholesaler search state
  const [showWholesalerSearch, setShowWholesalerSearch] = useState(false);
  
  // Profile editing states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedProfile, setEditedProfile] = useState({
    name: '',
    email: '',
    phone: '',
    businessName: ''
  });
  

  const [wholesalerSearchQuery, setWholesalerSearchQuery] = useState("");
  
  // Request access handler for new wholesalers
  const handleRequestAccess = async (wholesaler: any) => {
    if (!authenticatedCustomer?.phone) return;
    
    try {
      const response = await fetch('/api/customer/request-wholesaler-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          wholesalerId: wholesaler.id,
          customerPhone: authenticatedCustomer.phone,
          customerName: authenticatedCustomer.name,
          customerEmail: authenticatedCustomer.email,
          requestMessage: `I would like to access your wholesale products. Customer: ${authenticatedCustomer.name}`
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "Request Sent Successfully",
          description: `Your access request has been sent to ${wholesaler.businessName}. You'll be notified once they approve your request.`,
          variant: "default"
        });
      } else {
        toast({
          title: "Request Failed",
          description: data.error || "Failed to send access request",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Request Failed", 
        description: "Network error - please try again",
        variant: "destructive"
      });
    }
  };
  
  // Fetch available wholesalers for search - registration-aware for authenticated customers
  const { data: availableWholesalers = [], isLoading: wholesalersLoading } = useQuery({
    queryKey: [
      authenticatedCustomer?.phone ? "/api/customer-accessible-wholesalers" : "/api/marketplace/wholesalers", 
      authenticatedCustomer?.phone, 
      wholesalerSearchQuery
    ],
    queryFn: async () => {
      let response;
      
      // For authenticated customers, fetch both accessible and discoverable wholesalers
      if (authenticatedCustomer?.phone) {
        // First get accessible wholesalers
        const phoneNumber = encodeURIComponent(authenticatedCustomer.phone);
        const accessibleResponse = await fetch(`/api/customer-accessible-wholesalers/${phoneNumber}`, {
          credentials: "include",
        });
        if (!accessibleResponse.ok) throw new Error("Failed to fetch accessible wholesalers");
        const accessibleWholesalers = await accessibleResponse.json();
        const accessibleIds = accessibleWholesalers.map((w: any) => w.id);
        
        // Then get all marketplace wholesalers for discovery
        const params = new URLSearchParams();
        if (wholesalerSearchQuery) params.append("search", wholesalerSearchQuery);
        const marketplaceResponse = await fetch(`/api/marketplace/wholesalers?${params}`, {
          credentials: "include",
        });
        if (!marketplaceResponse.ok) throw new Error("Failed to fetch marketplace wholesalers");
        const allWholesalers = await marketplaceResponse.json();
        
        // Combine and mark accessibility status
        const combinedWholesalers = allWholesalers.map((wholesaler: any) => ({
          ...wholesaler,
          isAccessible: accessibleIds.includes(wholesaler.id),
          canRequestAccess: !accessibleIds.includes(wholesaler.id)
        }));
        
        // Sort: accessible first, then by business name
        combinedWholesalers.sort((a: any, b: any) => {
          if (a.isAccessible && !b.isAccessible) return -1;
          if (!a.isAccessible && b.isAccessible) return 1;
          return (a.businessName || '').localeCompare(b.businessName || '');
        });
        
        return combinedWholesalers;
      } else {
        // For guests, use the general marketplace API
        const params = new URLSearchParams();
        if (wholesalerSearchQuery) params.append("search", wholesalerSearchQuery);
        
        response = await fetch(`/api/marketplace/wholesalers?${params}`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to fetch wholesalers");
        const wholesalers = await response.json();
        return wholesalers.map((w: any) => ({ ...w, isAccessible: false, canRequestAccess: false }));
      }
    },
    enabled: showWholesalerSearch, // Only fetch when search is open
  });

  // Cache invalidation when wholesaler ID changes
  useEffect(() => {
    if (wholesalerId) {
      console.log('🧹 Cache invalidation: Wholesaler ID changed to:', wholesalerId);
      // Clear all relevant caches when switching wholesalers
      queryClient.invalidateQueries({ queryKey: ['wholesaler'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-auth/check'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    }
  }, [wholesalerId]);

  // Auto-refresh state - enable polling after orders
  const [enableAutoRefresh, setEnableAutoRefresh] = useState(false);
  
  // Modal states
  const [showQuantityEditor, setShowQuantityEditor] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [selectedSellingType, setSelectedSellingType] = useState<"units" | "pallets">("units");
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [negotiationProduct, setNegotiationProduct] = useState<Product | null>(null);
  const [negotiationData, setNegotiationData] = useState({
    quantity: 1,
    offeredPrice: '',
    message: ''
  });
  const [showCheckout, setShowCheckout] = useState(false);
  const [payLaterMode, setPayLaterMode] = useState(false);
  const [isPlacingPayLaterOrder, setIsPlacingPayLaterOrder] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [orderSuccessData, setOrderSuccessData] = useState<{
    orderNumber: string;
    total: string;
    items: Array<{ name: string; quantity: number }>;
    milestone?: {
      type: 'first_order' | 'tenth_order' | 'big_order' | 'repeat_customer';
      message: string;
      description?: string;
    };
  } | null>(null);
  const [completedOrder, setCompletedOrder] = useState<{
    orderNumber: string;
    cart: CartItem[];
    customerData: any;
    totalAmount: number;
    subtotal: number;
    transactionFee: number;
    shippingCost: number;
    payLater?: boolean;
  } | null>(null);
  // Shipping handled directly by supplier - no API integration needed
  const [customerData, setCustomerData] = useState<CustomerData>({
    name: '',
    email: '',
    phone: '',
    businessName: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    notes: '',
    shippingOption: undefined // Customer must explicitly choose pickup or delivery
  });
  
  // Update customer data when authenticated customer becomes available
  useEffect(() => {
    if (authenticatedCustomer && (!customerData.name || !customerData.email || !customerData.phone || !customerData.businessName)) {
      console.log('🚚 CRITICAL: Updating customer data from authenticated customer, preserving existing shippingOption:', customerData.shippingOption);
      setCustomerData(prevData => ({
        ...prevData, // CRITICAL: This preserves the shippingOption and all other fields
        name: authenticatedCustomer.name || '',
        email: authenticatedCustomer.email || '',
        phone: authenticatedCustomer.phone || authenticatedCustomer.phoneNumber || '',
        businessName: authenticatedCustomer.businessName || '',
        // CRITICAL FIX: Preserve shipping selection - don't default to pickup
        shippingOption: prevData.shippingOption
      }));
    }
  }, [authenticatedCustomer]); // CRITICAL FIX: Remove customerData fields from dependency array to prevent loops
  
  // Debug: Log state changes
  useEffect(() => {
    console.log('🚚 FRONTEND: customerData.shippingOption changed to:', customerData.shippingOption);
  }, [customerData.shippingOption]);

  // Auto-create payment intent when checkout opens with pre-selected shipping (skip in pay-later mode)
  useEffect(() => {
    if (showCheckout && !payLaterMode && customerData.shippingOption && !clientSecret && !isCreatingIntent && cart.length > 0) {
      console.log('🚚 AUTO-CREATING: Payment intent on checkout open with pre-selected shipping:', customerData.shippingOption);
      createPaymentIntentForCheckout(customerData.shippingOption);
    }
  }, [showCheckout, payLaterMode, customerData.shippingOption, clientSecret, isCreatingIntent, cart.length]);



  // CRITICAL FIX: Clear all customer data when authenticated customer changes
  useEffect(() => {
    if (authenticatedCustomer?.phone) {
      console.log('🧹 Customer changed - clearing all customer data cache for:', authenticatedCustomer.name);
      queryClient.invalidateQueries({ queryKey: ["/api/customer-orders/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-orders"] });
      queryClient.removeQueries({ queryKey: ["/api/customer-orders/stats"] });
      queryClient.removeQueries({ queryKey: ["/api/customer-orders"] });
    }
  }, [authenticatedCustomer?.phone, authenticatedCustomer?.id]);

  // Fetch wholesaler data with proper caching
  const { data: wholesaler, isLoading: wholesalerLoading, error: wholesalerError } = useQuery({
    queryKey: ['wholesaler', wholesalerId],
    queryFn: async () => {
      console.log(`Fetching wholesaler data for ID: ${wholesalerId}`);
      const response = await fetch(`/api/marketplace/wholesaler/${wholesalerId}`);
      if (!response.ok) {
        console.error(`Wholesaler fetch failed: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch wholesaler: ${response.status}`);
      }
      const data = await response.json();
      console.log('Wholesaler data received:', data);
      return data;
    },
    enabled: !!wholesalerId,
    retry: 1,
    staleTime: 0, // No cache to prevent logo confusion
    gcTime: 0, // No cache to prevent logo confusion
    refetchOnWindowFocus: true, // Refresh when window regains focus
    refetchOnMount: true, // Refresh on component mount
    refetchInterval: false,
    refetchOnReconnect: false,
    refetchIntervalInBackground: false,
  });

  // Personalized welcome microinteraction effect
  useEffect(() => {
    if (authenticatedCustomer && customerOrderStats && isAuthenticated) {
      console.log('🎯 Generating welcome message for:', authenticatedCustomer.name, 'with stats:', customerOrderStats);
      
      const generatePersonalizedMessage = () => {
        const orders = customerOrderStats.totalOrders || 0;
        const spent = customerOrderStats.totalSpent || 0;
        
        if (orders === 0) {
          return "Welcome to your first shopping experience! 🎉";
        } else if (orders < 5) {
          return `Great to see you back! Order #${orders + 1} coming up 🛍️`;
        } else if (orders < 10) {
          return `Welcome back, valued customer! ${orders} orders and counting ⭐`;
        } else {
          return `Welcome back, loyal customer! ${formatCurrency(spent, wholesaler?.defaultCurrency || 'GBP')} in total spending 🏆`;
        }
      };
      
      setPersonalizedMessage(generatePersonalizedMessage());
      setShowWelcomeAnimation(true);
      
      // Hide animation after 4 seconds
      const timer = setTimeout(() => {
        setShowWelcomeAnimation(false);
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [authenticatedCustomer, customerOrderStats, isAuthenticated, wholesaler]);


  // Sync editableQuantities map whenever cart changes (used by checkout item rows)
  useEffect(() => {
    setEditableQuantities(prev => {
      const next: Record<string, string> = {};
      cart.forEach(i => {
        const k = `${i.product.id}_${i.sellingType}`;
        next[k] = prev[k] !== undefined ? prev[k] : String(i.quantity);
      });
      return next;
    });
  }, [cart]);

  // Restore saved cart from localStorage when customer authenticates
  useEffect(() => {
    if (!wholesalerId || !authenticatedCustomer?.id) return;
    const key = `quikpik_cart_${wholesalerId}_${authenticatedCustomer.id}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as CartItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
        }
      }
    } catch {
      // ignore parse errors (corrupt or incompatible data)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wholesalerId, authenticatedCustomer?.id]);

  // Save cart to localStorage whenever it changes (only while authenticated)
  useEffect(() => {
    if (!wholesalerId || !authenticatedCustomer?.id) return;
    const key = `quikpik_cart_${wholesalerId}_${authenticatedCustomer.id}`;
    try {
      localStorage.setItem(key, JSON.stringify(cart));
    } catch {
      // ignore storage errors (e.g. private browsing mode with full storage)
    }
  }, [cart, wholesalerId, authenticatedCustomer?.id]);

  // Featured product ID is now managed by state initialized from URL

  // Fetch featured product if specified with auto-refresh
  const { data: featuredProduct, isLoading: featuredLoading, refetch: refetchFeaturedProduct } = useQuery({
    queryKey: ['featured-product', featuredProductId],
    queryFn: async () => {
      console.log(`🌟 Fetching featured product: ${featuredProductId}`);
      const response = await fetch(`/api/marketplace/products/${featuredProductId}`);
      if (!response.ok) throw new Error("Failed to fetch featured product");
      const data = await response.json();
      console.log(`✅ Featured product received:`, { id: data.id, name: data.name, status: data.status });
      return data;
    },
    enabled: !!featuredProductId,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  // Fetch all products for the wholesaler with controlled refresh
  const { data: products = [], isLoading: productsLoading, error: productsError, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ['wholesaler-products', wholesalerId, hasCustomerSession, shouldFetchGuestSafeProducts],
    queryFn: async () => {
      console.log(`🛒 Fetching products for wholesaler: ${wholesalerId}`);
      console.log(`🌐 Current domain: ${window.location.origin}`);
      console.log(`🔍 Fetching products for wholesaler: ${wholesalerId}`);
      const guestParam = shouldFetchGuestSafeProducts ? '?guest=true' : '';
      const response = await fetch(`/api/customer-products/${wholesalerId}${guestParam}`);
      console.log(`📡 API Response status: ${response.status}`);
      console.log(`📡 API Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const responseText = await response.text();
        console.error(`❌ Products fetch failed: ${response.status} ${response.statusText}`);
        console.error(`❌ Response body:`, responseText.substring(0, 500));
        throw new Error(`Failed to fetch products: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`✅ Products received: ${data.length} items`);
      console.log(`📦 Product sample:`, data.slice(0, 2).map((p: any) => ({ id: p.id, name: p.name, status: p.status })));
      return data;
    },
    enabled: !!wholesalerId,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    retry: 3,
    retryDelay: 1000,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const calculatePromotionalPricing = (product: Product, quantity: number = 1) => {
    // Use custom price list price if the customer has one assigned
    const hasCustomPrice = !!product.customPrice;
    const basePrice = hasCustomPrice
      ? parseFloat(product.customPrice!) || 0
      : parseFloat(product.price) || 0;
    const standardPrice = hasCustomPrice
      ? parseFloat(product.standardPrice || product.price) || 0
      : basePrice;
    const result = {
      originalPrice: standardPrice,
      effectivePrice: basePrice,
      totalCost: basePrice * quantity,
      totalDiscount: 0,
      discountPercentage: 0,
      appliedOffers: [] as string[],
      freeItems: 0,
      totalQuantity: quantity,
      promoType: '' as string,
      promoLabel: '' as string,
    };

    // Price list and promotions are mutually exclusive.
    // If the customer has a negotiated price list price, return it as-is.
    // Promotions only apply to customers on standard pricing.
    if (hasCustomPrice) return result;

    const offers = Array.isArray((product as any).promotionalOffers) ? (product as any).promotionalOffers : [];
    const now = new Date();

    for (const offer of offers) {
      if (!offer.isActive) continue;
      const start = offer.startDate ? new Date(offer.startDate) : null;
      const end = offer.endDate ? new Date(offer.endDate) : null;
      if (start && start > now) continue;
      if (end && end < now) continue;

      if (offer.type === 'percentage_discount' && offer.discountPercentage) {
        const discount = offer.discountPercentage / 100;
        result.effectivePrice = Math.round(basePrice * (1 - discount) * 100) / 100;
        result.totalCost = result.effectivePrice * quantity;
        result.totalDiscount = (basePrice - result.effectivePrice) * quantity;
        result.discountPercentage = offer.discountPercentage;
        const detailText = `${offer.discountPercentage}% off`;
        result.appliedOffers.push(offer.name ? `${offer.name} - ${detailText}` : detailText);
        result.promoType = 'percentage_discount';
        result.promoLabel = `${offer.discountPercentage}% OFF`;
        break;
      } else if (offer.type === 'fixed_price' && offer.fixedPrice) {
        result.effectivePrice = offer.fixedPrice;
        result.totalCost = offer.fixedPrice * quantity;
        result.totalDiscount = (basePrice - offer.fixedPrice) * quantity;
        result.discountPercentage = Math.round(((basePrice - offer.fixedPrice) / basePrice) * 100);
        const fixedDetail = `£${offer.fixedPrice.toFixed(2)} each`;
        result.appliedOffers.push(offer.name ? `${offer.name} - ${fixedDetail}` : fixedDetail);
        result.promoType = 'fixed_price';
        result.promoLabel = 'SPECIAL PRICE';
        break;
      } else if (offer.type === 'buy_x_get_y_free' && offer.buyQuantity && offer.getQuantity) {
        const sets = Math.floor(quantity / offer.buyQuantity);
        const freeItems = sets * offer.getQuantity;
        result.freeItems = freeItems;
        result.totalQuantity = quantity + freeItems;
        result.totalCost = basePrice * quantity;
        const bogofDetail = `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free`;
        result.appliedOffers.push(offer.name ? `${offer.name} - ${bogofDetail}` : bogofDetail);
        result.promoType = 'buy_x_get_y_free';
        result.promoLabel = `BUY ${offer.buyQuantity} GET ${offer.getQuantity} FREE`;
        break;
      } else if (offer.type === 'bundle_deal' && offer.minQuantity && offer.fixedPrice) {
        if (quantity >= offer.minQuantity) {
          result.effectivePrice = offer.fixedPrice;
          result.totalCost = offer.fixedPrice * quantity;
          result.totalDiscount = (basePrice - offer.fixedPrice) * quantity;
          result.discountPercentage = Math.round(((basePrice - offer.fixedPrice) / basePrice) * 100);
          const bundleDetail = `${offer.minQuantity}+ for £${offer.fixedPrice.toFixed(2)} each`;
          result.appliedOffers.push(offer.name ? `${offer.name} - ${bundleDetail}` : bundleDetail);
          result.promoType = 'bundle_deal';
          result.promoLabel = `${offer.minQuantity}+ DEAL`;
          break;
        }
        continue;
      } else if (offer.type === 'clearance' && offer.fixedPrice) {
        result.effectivePrice = offer.fixedPrice;
        result.totalCost = offer.fixedPrice * quantity;
        result.totalDiscount = (basePrice - offer.fixedPrice) * quantity;
        result.discountPercentage = Math.round(((basePrice - offer.fixedPrice) / basePrice) * 100);
        const clearanceDetail = `£${offer.fixedPrice.toFixed(2)} each`;
        result.appliedOffers.push(offer.name ? `${offer.name} - ${clearanceDetail}` : `Clearance - ${clearanceDetail}`);
        result.promoType = 'clearance';
        result.promoLabel = 'CLEARANCE';
        break;
      }
    }

    return result;
  };

  // Memoized calculations
  const filteredProducts = useMemo(() => {
    console.log('🔍 filteredProducts calculation:', {
      totalProducts: products.length,
      searchTerm,
      selectedCategory,
      productsStatus: products.map(p => ({ id: p.id, name: p.name, status: p.status }))
    });
    
    const filtered = products.filter((product: Product) => {
      const matchesSearch = !searchTerm || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || selectedCategory === "All Categories" || 
        product.category === selectedCategory;
      
      const isActive = product.status === 'active';
      
      console.log(`Product ${product.name}: search=${matchesSearch}, category=${matchesCategory}, active=${isActive}`);
      
      return matchesSearch && matchesCategory && isActive;
    });
    
    console.log('🔍 Filtered products result:', filtered.length);
    return filtered;
  }, [products, searchTerm, selectedCategory]);

  const otherProducts = useMemo(() => {
    console.log('🔍 otherProducts calculation:', {
      featuredProduct: featuredProduct?.name || 'none',
      filteredProductsCount: filteredProducts.length,
      featuredProductId,
      showAllProducts,
      productsLoading,
      products: products.length
    });
    if (!featuredProduct) return filteredProducts;
    return filteredProducts.filter(p => p.id !== featuredProduct.id);
  }, [filteredProducts, featuredProduct, featuredProductId]);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p: Product) => p.category).filter(Boolean));
    return Array.from(cats);
  }, [products]);

  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const cartStats = useMemo(() => {
    let totalItems = 0; // For display - only user-selected quantities
    let totalPromotionalItems = 0; // For calculations - includes free items
    let subtotal = 0;
    let appliedPromotions: string[] = [];
    let bogoffDetails: any[] = [];

    cart.forEach(item => {
      let itemPrice = 0;
      const itemQuantity = Number(item.quantity) || 0;
      
      if (item.sellingType === "pallets") {
        itemPrice = parseFloat((item.product as any).palletPrice || "0") || 0;
        totalItems += itemQuantity;
        totalPromotionalItems += itemQuantity;
        subtotal += itemPrice * itemQuantity;
      } else {
        const pricing = calculatePromotionalPricing(item.product, itemQuantity);
        itemPrice = pricing.effectivePrice;
        totalItems += itemQuantity;
        totalPromotionalItems += pricing.totalQuantity;
        subtotal += pricing.totalCost;
        if (pricing.appliedOffers.length > 0) {
          appliedPromotions.push(...pricing.appliedOffers);
        }
        if (pricing.freeItems > 0) {
          bogoffDetails.push({ productName: item.product.name, freeItems: pricing.freeItems });
        }
      }
    });
    
    // No shipping cost calculation needed - delivery arranged directly by supplier
    const shippingCost = 0;
    const totalValue = subtotal; // Pure product cost only
    
    // Ensure values are never NaN
    return { 
      totalItems: isNaN(totalItems) ? 0 : totalItems, // Display count - user selections only
      totalPromotionalItems: isNaN(totalPromotionalItems) ? 0 : totalPromotionalItems, // Calculation count - includes free items
      subtotal: isNaN(subtotal) ? 0 : subtotal, // PURE product subtotal (no shipping)
      shippingCost: 0, // No shipping cost - handled directly by supplier
      totalValue: isNaN(totalValue) ? 0 : totalValue, // Total product cost only
      appliedPromotions,
      bogoffDetails
    };
  }, [cart]); // Simplified dependencies - no shipping calculations needed



  // Event handlers
  const openQuantityEditor = useCallback((product: Product) => {
    if (isEnhancedPreviewMode) {
      toast({
        title: "Preview Mode",
        description: "Cart functionality is disabled in preview mode.",
        variant: "default"
      });
      return;
    }
    setSelectedProduct(product);
    // Set default selling type based on product configuration
    const defaultSellingType = product.sellingFormat === "pallets" ? "pallets" : "units";
    setSelectedSellingType(defaultSellingType);
    
    // Set initial quantity based on selling type
    if (defaultSellingType === "pallets") {
      setEditQuantity(product.palletMoq || 1);
    } else {
      setEditQuantity(product.moq);
    }
    
    setShowQuantityEditor(true);
  }, [isEnhancedPreviewMode, toast]);

  const openNegotiation = useCallback((product: Product) => {
    if (isEnhancedPreviewMode) {
      toast({
        title: "Preview Mode",
        description: "Negotiation functionality is disabled in preview mode.",
        variant: "default"
      });
      return;
    }
    setNegotiationProduct(product);
    setNegotiationData({
      quantity: product.moq,
      offeredPrice: '',
      message: ''
    });
    setShowNegotiation(true);
  }, [isEnhancedPreviewMode, toast]);

  const addToCart = useCallback((product: ExtendedProduct, quantity: number, sellingType: "units" | "pallets" = "units") => {
    if (isEnhancedPreviewMode) {
      toast({
        title: "Preview Mode",
        description: "Cart functionality is disabled in preview mode.",
        variant: "destructive",
      });
      return;
    }
    if (!hasCustomerSession) {
      setShowGuestSignInModal(true);
      return;
    }
    
    // Validate quantity meets MOQ requirements (unless stock is less than MOQ)
    const minQuantity = sellingType === "pallets" ? ((product as any).palletMoq || 1) : (product.moq || 1);
    const availableStock = sellingType === "pallets" 
      ? ((product as any).palletStock || 0)
      : (product.stock || 0);
    
    // Allow purchasing remaining stock if it's less than MOQ
    if (quantity < minQuantity && availableStock >= minQuantity) {
      toast({
        title: "Minimum Order Required",
        description: `Minimum order for ${product.name} is ${minQuantity} ${sellingType === "pallets" ? "pallets" : "units"}`,
        variant: "destructive",
      });
      return;
    }

    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id && item.sellingType === sellingType);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id && item.sellingType === sellingType
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prevCart, { product, quantity, sellingType }];
    });
    
    const unitLabel = sellingType === "pallets" ? "pallets" : "units";
    
    // Standard toast message for all products
    toast({
      title: "Added to Cart",
      description: `${product.name} (${quantity} ${unitLabel}) added to your cart`,
    });
  }, [toast, isEnhancedPreviewMode, hasCustomerSession]);

  // Simple payment intent creation - use explicit shipping option from radio buttons
  const createPaymentIntentForCheckout = useCallback(async (explicitShippingOption?: 'pickup' | 'delivery') => {
    // CRITICAL FIX: Use explicit shipping option only - no auto-detection
    let shippingOption = explicitShippingOption || customerData.shippingOption;
    
    console.log('🚚 PAYMENT INTENT: Input values:', {
      explicitShippingOption,
      customerDataShippingOption: customerData.shippingOption,
      finalShippingOption: shippingOption
    });
    
    // CRITICAL FIX: Don't allow undefined shipping option
    if (!shippingOption) {
      console.error('🚚 ERROR: No shipping option provided - this should not happen');
      toast({
        title: "Please select delivery option",
        description: "You must choose pickup or delivery before checkout",
        variant: "destructive",
      });
      setIsCreatingIntent(false);
      return;
    }
    
    // CRITICAL VALIDATION: Ensure delivery orders have a selected address with complete data
    if (shippingOption === 'delivery') {
      if (!customerData.selectedDeliveryAddress) {
        console.log('🚚 ERROR: Delivery selected but no delivery address provided');
        toast({
          title: "Delivery address required",
          description: "Please select a delivery address to continue with delivery option",
          variant: "destructive",
        });
        setIsCreatingIntent(false);
        return;
      }
      
      // Additional validation: Ensure address has required fields
      const addr = customerData.selectedDeliveryAddress;
      if (!addr.addressLine1 || !addr.city || !addr.postalCode) {
        console.log('🚚 ERROR: Selected delivery address is missing required fields:', {
          hasAddressLine1: !!addr.addressLine1,
          hasCity: !!addr.city,
          hasPostalCode: !!addr.postalCode
        });
        toast({
          title: "Address incomplete",
          description: "Please select a complete delivery address",
          variant: "destructive",
        });
        setIsCreatingIntent(false);
        return;
      }
      
      console.log('✅ VALIDATION PASSED: Complete delivery address available:', addr.addressLine1);
    }
    
    console.log('🚚 SIMPLIFIED CHECKOUT: Creating payment intent');
    console.log('🚚 CRITICAL FIX: Using explicit shipping option:', explicitShippingOption, 'or current state:', customerData.shippingOption);
    console.log('🚚 AUTO-DETECT: Final shipping option after detection:', shippingOption);
    console.log('🚚 DEBUG: Full customerData at payment creation:', JSON.stringify({
      name: customerData.name,
      phone: customerData.phone,
      shippingOption: shippingOption,
      selectedDeliveryAddress: customerData.selectedDeliveryAddress,
      hasSelectedDeliveryAddress: !!customerData.selectedDeliveryAddress,
      addressKeys: customerData.selectedDeliveryAddress ? Object.keys(customerData.selectedDeliveryAddress) : 'none'
    }, null, 2));
    
    // CRITICAL FIX: Check if shipping option changed - if so, create new payment intent
    const shippingOptionChanged = clientSecret && lastUsedShippingOption && lastUsedShippingOption !== shippingOption;
    
    if (shippingOptionChanged) {
      console.log('🚚 SHIPPING CHANGED: Creating new payment intent because shipping option changed from', lastUsedShippingOption, 'to', shippingOption);
      setClientSecret(''); // Clear existing payment intent
      setLastUsedShippingOption(shippingOption as 'pickup' | 'delivery'); // Update tracking
    }
    
    if ((isCreatingIntent || clientSecret) && !shippingOptionChanged) {
      console.log('🚚 Payment intent already exists or is being created - SKIPPING (no shipping change)');
      return;
    }
    
    if (!wholesaler) {
      console.log('🚚 No wholesaler data - SKIPPING');
      return;
    }

    setIsCreatingIntent(true);
    
    try {
      // Calculate total amount for cart using promotional pricing
      const totalAmount = cart.reduce((total, item) => {
        if (item.sellingType === 'pallets') {
          const palletPrice = parseFloat((item.product as any).palletPrice || "0") || 0;
          return total + (palletPrice * item.quantity);
        } else {
          const pricing = calculatePromotionalPricing(item.product, item.quantity);
          return total + pricing.totalCost;
        }
      }, 0);

      // CRITICAL: Validate address data before payment intent creation
      console.log('🏰 PAYMENT VALIDATION: Address data check:', {
        shippingOption,
        hasSelectedAddress: !!customerData.selectedDeliveryAddress,
        addressLine1: customerData.selectedDeliveryAddress?.addressLine1,
        addressCity: customerData.selectedDeliveryAddress?.city
      });
      
      const requestPayload = {
        customerData: {
          name: customerData.name,
          email: customerData.email,
          phone: customerData.phone,
          // BEST PRACTICE: Use selectedDeliveryAddress as primary source for delivery orders
          address: customerData.selectedDeliveryAddress?.addressLine1 || customerData.address,
          city: customerData.selectedDeliveryAddress?.city || customerData.city,
          state: customerData.selectedDeliveryAddress?.state || customerData.state,
          postalCode: customerData.selectedDeliveryAddress?.postalCode || customerData.postalCode,
          country: customerData.selectedDeliveryAddress?.country || customerData.country || 'United Kingdom',
          // CRITICAL: Include complete address object for Stripe metadata
          selectedDeliveryAddress: customerData.selectedDeliveryAddress,
          selectedDeliveryAddressId: customerData.selectedDeliveryAddress?.id
        },
        items: cart.map(item => {
          if (item.sellingType === 'pallets') {
            return {
              productId: item.product.id,
              productName: item.product.name,
              quantity: item.quantity || 0,
              unitPrice: parseFloat((item.product as any).palletPrice || "0") || 0,
              sellingType: item.sellingType
            };
          } else {
            const pricing = calculatePromotionalPricing(item.product, item.quantity || 0);
            return {
              productId: item.product.id,
              productName: item.product.name,
              quantity: item.quantity || 0,
              unitPrice: pricing.effectivePrice,
              sellingType: item.sellingType,
              appliedOfferLabel: pricing.appliedOffers.length > 0 ? pricing.appliedOffers[0] : undefined,
              freeItems: pricing.freeItems || 0
            };
          }
        }),
        shippingInfo: {
          option: shippingOption,
          ...(shippingOption === 'delivery' && wholesaler?.deliveryFlatRate
            ? { flatDeliveryRate: wholesaler.deliveryFlatRate }
            : {})
        }
      };
      
      // CRITICAL: Log detailed address data being sent to backend
      console.log('🚚 PAYMENT REQUEST: Creating payment intent with validated data:');
      console.log('🚚 SHIPPING OPTION:', shippingOption);
      console.log('🚚 ADDRESS DATA:', requestPayload.customerData.selectedDeliveryAddress);
      console.log('🚚 FULL PAYLOAD:', JSON.stringify(requestPayload, null, 2));
      
      const response = await apiRequest("POST", "/api/customer/create-payment", requestPayload);
      
      if (response.ok) {
        const data = await response.json();
        
        // Validate client secret format before using it
        if (!data.clientSecret || !data.clientSecret.startsWith('pi_')) {
          console.error('💳 Invalid client secret format received:', data.clientSecret);
          throw new Error('Invalid payment setup received from server');
        }
        
        console.log('✅ Valid client secret received:', data.clientSecret?.substring(0, 10) + '...');
        setClientSecret(data.clientSecret);
        setLastUsedShippingOption(shippingOption as 'pickup' | 'delivery'); // Track the shipping option for this payment intent
        console.log('🚚 SIMPLIFIED: Payment intent created successfully with shipping option:', shippingOption);
        toast({
          title: "Payment Ready",
          description: "You can now complete your payment",
        });
      } else {
        const errorText = await response.text();
        console.error('🚚 API request failed:', response.status, errorText);
        
        // Handle specific payment configuration errors
        let userMessage = "Unable to set up payment. Please try again.";
        if (response.status === 500 && errorText.includes('payment_config_error')) {
          userMessage = "There's an issue with the payment setup. Please contact the business owner.";
        } else if (response.status === 400 && errorText.includes('calculation_error')) {
          userMessage = "Payment amount calculation error. Please refresh and try again.";
        }
        
        toast({
          title: "Payment Setup Failed",
          description: userMessage,
          variant: "destructive",
        });
        throw new Error(`Failed to create payment intent: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('🚚 Error creating payment intent:', error);
      toast({
        title: "Payment Setup Failed",
        description: "Unable to set up payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingIntent(false);
    }
  }, [isCreatingIntent, clientSecret, wholesaler, customerData, cart, toast]);

  // Helper function to create payment intent with custom customer data (fixes race condition)
  const createPaymentIntentWithCustomData = useCallback(async (customData: typeof customerData, shippingOption: 'pickup' | 'delivery') => {
    if (isCreatingIntent || clientSecret) {
      console.log('🚚 Payment intent already exists or is being created - SKIPPING');
      return;
    }
    
    if (!wholesaler) {
      console.log('🚚 No wholesaler data - SKIPPING');
      return;
    }

    setIsCreatingIntent(true);
    
    try {
      // Calculate total amount for cart using promotional pricing
      const totalAmount = cart.reduce((total, item) => {
        if (item.sellingType === 'pallets') {
          const palletPrice = parseFloat((item.product as any).palletPrice || "0") || 0;
          return total + (palletPrice * item.quantity);
        } else {
          const pricing = calculatePromotionalPricing(item.product, item.quantity);
          return total + pricing.totalCost;
        }
      }, 0);

      const requestPayload = {
        customerData: {
          name: customData.name,
          email: customData.email,
          phone: customData.phone,
          address: customData.selectedDeliveryAddress?.addressLine1 || customData.address,
          city: customData.selectedDeliveryAddress?.city || customData.city,
          state: customData.selectedDeliveryAddress?.state || customData.state,
          postalCode: customData.selectedDeliveryAddress?.postalCode || customData.postalCode,
          country: customData.selectedDeliveryAddress?.country || customData.country || 'United Kingdom',
          selectedDeliveryAddress: customData.selectedDeliveryAddress,
          selectedDeliveryAddressId: customData.selectedDeliveryAddress?.id
        },
        items: cart.map(item => {
          if (item.sellingType === 'pallets') {
            return {
              productId: item.product.id,
              productName: item.product.name,
              quantity: item.quantity || 0,
              unitPrice: parseFloat((item.product as any).palletPrice || "0") || 0,
              sellingType: item.sellingType
            };
          } else {
            const pricing = calculatePromotionalPricing(item.product, item.quantity || 0);
            return {
              productId: item.product.id,
              productName: item.product.name,
              quantity: item.quantity || 0,
              unitPrice: pricing.effectivePrice,
              sellingType: item.sellingType,
              appliedOfferLabel: pricing.appliedOffers.length > 0 ? pricing.appliedOffers[0] : undefined,
              freeItems: pricing.freeItems || 0
            };
          }
        }),
        shippingInfo: {
          option: shippingOption,
          ...(shippingOption === 'delivery' && wholesaler?.deliveryFlatRate
            ? { flatDeliveryRate: wholesaler.deliveryFlatRate }
            : {})
        }
      };
      
      console.log('🚚 CUSTOM DATA PAYMENT: Creating with fresh address data');
      console.log('🚚 FRESH ADDRESS:', requestPayload.customerData.selectedDeliveryAddress);
      
      const response = await apiRequest("POST", "/api/customer/create-payment", requestPayload);
      
      if (response.ok) {
        const data = await response.json();
        setClientSecret(data.clientSecret);
        setLastUsedShippingOption(shippingOption);
        console.log('✅ Payment intent created with fresh address data');
        toast({
          title: "Payment Ready",
          description: "Your delivery address has been confirmed",
        });
      } else {
        const errorText = await response.text();
        console.error('🚚 API request failed:', response.status, errorText);
        throw new Error(`Failed to create payment intent: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('🚚 Error creating payment intent with custom data:', error);
      toast({
        title: "Payment Setup Failed",
        description: "Unable to set up payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingIntent(false);
    }
  }, [isCreatingIntent, clientSecret, wholesaler, cart, toast]);

  // Helper function to generate quantity suggestions
  const getQuantitySuggestions = useCallback((product: ExtendedProduct, currentQuantity?: number) => {
    const suggestions = [];
    const moq = product.moq || 1;
    const stock = product.stock || 100;
    
    // Always include MOQ
    if (moq > 1) {
      suggestions.push({ value: moq, label: `${moq} (minimum)`, type: 'moq' });
    }
    
    // Add common bulk quantities based on MOQ
    const bulkMultipliers = [2, 3, 5, 10];
    bulkMultipliers.forEach(multiplier => {
      const bulkQty = moq * multiplier;
      if (bulkQty <= stock && bulkQty !== moq) {
        const savings = multiplier >= 5 ? ' 💰' : multiplier >= 3 ? ' 📦' : '';
        suggestions.push({ 
          value: bulkQty, 
          label: `${bulkQty}${savings}`, 
          type: 'bulk',
          description: multiplier >= 5 ? 'Bulk savings' : multiplier >= 3 ? 'Good quantity' : 'Double order'
        });
      }
    });
    
    // Add stock-based suggestions
    if (stock <= 50) {
      suggestions.push({ value: stock, label: `${stock} (all stock)`, type: 'stock' });
    } else if (stock > 50) {
      const quarterStock = Math.floor(stock * 0.25);
      const halfStock = Math.floor(stock * 0.5);
      if (quarterStock >= moq) {
        suggestions.push({ value: quarterStock, label: `${quarterStock} (¼ stock)`, type: 'stock' });
      }
      if (halfStock >= moq && halfStock !== quarterStock) {
        suggestions.push({ value: halfStock, label: `${halfStock} (½ stock)`, type: 'stock' });
      }
    }
    
    // Remove duplicates and sort
    const uniqueSuggestions = suggestions
      .filter((suggestion, index, self) => 
        index === self.findIndex(s => s.value === suggestion.value)
      )
      .sort((a, b) => a.value - b.value)
      .slice(0, 6); // Limit to 6 suggestions
    
    return uniqueSuggestions;
  }, []);

  // Function to clean up cart items that don't meet MOQ
  const cleanUpCart = useCallback(() => {
    setCart(prevCart => {
      const validItems = prevCart.filter(item => {
        const minQuantity = item.sellingType === "pallets" ? (item.product.palletMoq || 1) : item.product.moq;
        return item.quantity >= minQuantity;
      });
      
      if (validItems.length !== prevCart.length) {
        const removedItems = prevCart.length - validItems.length;
        toast({
          title: "Cart Updated",
          description: `${removedItems} item(s) removed for not meeting minimum order quantities`,
          variant: "default",
        });
      }
      
      return validItems;
    });
  }, [toast]);

  // Handle add to cart from quantity editor
  const handleAddToCart = () => {
    if (!selectedProduct) return;
    
    const minQuantity = selectedSellingType === "pallets" ? (selectedProduct.palletMoq || 1) : selectedProduct.moq;
    const maxQuantity = selectedSellingType === "pallets" ? ((selectedProduct as any).palletStock || 0) : selectedProduct.stock;
    
    if (editQuantity >= minQuantity && editQuantity <= maxQuantity) {
      addToCart(selectedProduct, editQuantity, selectedSellingType);
      setShowQuantityEditor(false);
      setSelectedProduct(null);
    }
  };

  // Handle negotiation submission
  const submitNegotiation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/marketplace/negotiations", data);
    },
    onSuccess: () => {
      toast({
        title: "Quote Request Sent",
        description: "Your custom quote request has been sent to the supplier. You'll receive an email response within 24 hours.",
      });
      setShowNegotiation(false);
      setNegotiationProduct(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send quote request. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (profileData: typeof editedProfile) => {
      const response = await apiRequest('PUT', '/api/customer-profile/update', profileData);
      return response.json();
    },
    onSuccess: (_data, variables) => {
      setIsEditingProfile(false);
      setCustomerData(prevData => ({
        ...prevData,
        name: variables.name ?? prevData.name,
        email: variables.email ?? prevData.email,
        phone: variables.phone ?? prevData.phone,
        businessName: variables.businessName ?? prevData.businessName,
      }));
      queryClient.invalidateQueries({ queryKey: ['/api/customer-auth/check', wholesalerId] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Initialize edit form with current data
  const initializeEditForm = () => {
    setEditedProfile({
      name: customerData?.name || '',
      email: customerData?.email || '',
      phone: customerData?.phone || '',
      businessName: customerData?.businessName || '' // Use customer's business name, not wholesaler's
    });
    setIsEditingProfile(true);
  };

  // Handle profile save
  const handleSaveProfile = () => {
    updateProfileMutation.mutate(editedProfile);
  };

  const handleNegotiationSubmit = () => {
    if (!negotiationProduct) return;
    
    submitNegotiation.mutate({
      productId: negotiationProduct.id,
      wholesalerId: wholesalerId,
      quantity: negotiationData.quantity,
      offeredPrice: negotiationData.offeredPrice,
      message: negotiationData.message,
      customerName: customerData.name,
      customerEmail: customerData.email,
      customerPhone: customerData.phone
    });
  };

  // Authentication handlers
  const handleAuthSuccess = (customer: any) => {
    console.log("🎉 handleAuthSuccess called with customer:", customer);
    clearGuestParam();
    setOpenRequestAccessOnAuth(false);
    setShowGuestSignInModal(false);
    setAuthenticatedCustomer(customer);
    setIsAuthenticated(true);
    setShowAuth(false);
    setIsGuestMode(false);
    
    // Show first-time address setup after a short delay
    setTimeout(() => {
      setShowFirstTimeAddressSetup(true);
    }, 1000);
    
    // Refetch session to confirm it's saved
    refetchSession();
    // Re-fetch products with the now-active session so the backend can inject
    // price list prices (customPrice / customPalletPrice). Without this, the
    // product list served before login has no customPrice, causing
    // calculatePromotionalPricing to fall through to the promo price instead.
    refetchProducts();
    
    toast({
      title: "Welcome!",
      description: `Hello ${customer.name}, you're now logged in.`,
    });
  };

  // Handle guest browse - skip authentication
  const handleSkipAuth = () => {
    setOpenRequestAccessOnAuth(false);
    setShowGuestSignInModal(false);
    setShowAuth(false);
    setIsGuestMode(true);
    setIsAuthenticated(false);
    setAuthenticatedCustomer(null);
    setCart([]);
    setSearchTerm("");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('auth');
    nextUrl.searchParams.delete('login');
    nextUrl.searchParams.set('guest', 'true');
    window.history.replaceState({}, '', nextUrl.toString());
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      const response = await fetch('/api/customer-auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        // Clear localStorage and sessionStorage
        localStorage.removeItem(`customer_auth_${wholesalerId}`);
        localStorage.clear();
        sessionStorage.clear();
        
        // Update state
        setIsAuthenticated(false);
        setAuthenticatedCustomer(null);
        setShowAuth(true);
        setIsGuestMode(true);
        
        toast({
          title: "Logged out",
          description: "You have been successfully logged out.",
        });
        
        // Redirect to customer-login page
        window.location.href = '/customer-login';
      }
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        title: "Logout Error",
        description: "There was an issue logging out. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Authentication is now required - no guest mode allowed;

  const handleViewAllProducts = () => {
    setShowHomePage(false);
    setShowAllProducts(true);
  };

  const handleViewFeaturedProduct = () => {
    setShowHomePage(false);
    setShowAllProducts(false);
  };

  const clearGuestParam = () => {
    const nextUrl = new URL(window.location.href);
    if (nextUrl.searchParams.has('guest')) {
      nextUrl.searchParams.delete('guest');
      window.history.replaceState({}, '', nextUrl.toString());
    }
  };

  const openCustomerSignIn = () => {
    clearGuestParam();
    setOpenRequestAccessOnAuth(false);
    setIsGuestMode(false);
    setShowAuth(true);
  };

  const openCustomerRequestAccess = () => {
    clearGuestParam();
    setOpenRequestAccessOnAuth(true);
    setIsGuestMode(false);
    setShowAuth(true);
  };

  // Authentication state management using server sessions
  useEffect(() => {
    if (isEnhancedPreviewMode) {
      // In preview mode (including wholesaler own store), skip customer authentication
      setShowAuth(false);
      setIsGuestMode(false);
      setIsAuthenticated(true); // Set as authenticated for preview mode
      if (isWholesalerOwnStore && user) {
        // If wholesaler is viewing their own store, set them as a mock customer for display purposes
        setAuthenticatedCustomer({
          id: 'preview-customer',
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'Store Preview',
          email: 'preview@store.com',
          phone: '+1234567890',
          businessName: 'Store Preview Mode'
        });
      }
      return;
    }

    if (!wholesalerId || sessionLoading) {
      return; // Wait for wholesalerId and session check to complete
    }

    // Check if user explicitly wants to login (force login parameter)
    if (forceLoginParam) {
      console.log('🔑 Force login requested - showing auth screen');
      setOpenRequestAccessOnAuth(false);
      setIsAuthenticated(false);
      setAuthenticatedCustomer(null);
      setShowAuth(true);
      setIsGuestMode(true);
      return;
    }

    // Check if we have a valid server session
    if (sessionData?.authenticated && sessionData?.customer) {
      console.log('✅ Valid server session found for:', sessionData.customer.name);
      setIsAuthenticated(true);
      setAuthenticatedCustomer(sessionData.customer);
      setShowAuth(false);
      setIsGuestMode(false);
      setShowGuestSignInModal(false);
      setIsSwitchingWholesaler(false); // Clear switching state now that new store auth is confirmed
      clearGuestParam();
      return;
    }

    if (forceGuestParam) {
      console.log('🛍️ Guest browse requested');
      setIsAuthenticated(false);
      setAuthenticatedCustomer(null);
      setShowAuth(false);
      setIsGuestMode(true);
      return;
    }
    
    // No valid authentication - show authentication screen only if not switching wholesalers
    if (!isSwitchingWholesaler) {
      console.log('🔐 No valid authentication found, showing auth screen');
      setIsAuthenticated(false);
      setAuthenticatedCustomer(null);
      setShowAuth(true);
      setIsGuestMode(true);
    } else {
      // Session check resolved with no auth while switching — clear switching state and show auth
      console.log('🔄 Switching wholesaler: session check resolved with no auth, clearing switch state');
      setIsSwitchingWholesaler(false);
      setIsAuthenticated(false);
      setAuthenticatedCustomer(null);
      setShowAuth(true);
      setIsGuestMode(true);
    }
  }, [isEnhancedPreviewMode, isWholesalerOwnStore, user, wholesalerId, sessionLoading, sessionData, forceLoginParam, forceGuestParam, isSwitchingWholesaler]);



  // Debug output temporarily disabled to reduce noise
  // console.log('🔄 Customer Portal Render State:', {
  //   wholesalerId,
  //   showAuth,
  //   isPreviewMode,
  //   isAuthenticated,
  //   showHomePage,
  //   showAllProducts,
  //   featuredProductId,
  //   featuredLoading,
  //   wholesalerLoading
  // });

  // Show store not found if no wholesaler ID in URL
  if (!wholesalerId && !isEnhancedPreviewMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Store Not Found</h1>
          <p className="text-gray-600">The requested store could not be found.</p>
        </div>
      </div>
    );
  }

  // Show switching wholesaler loading state
  if (isSwitchingWholesaler) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          {/* Enhanced Loading Animation */}
          <div className="flex space-x-1">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-6 bg-gradient-to-t from-green-400 to-emerald-500 rounded-full animate-pulse"
                style={{
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: '1.6s'
                }}
              />
            ))}
          </div>
          <p className="text-gray-600 text-center">Switching to new store...</p>
        </div>
      </div>
    );
  }

  // Show authentication screen (3-step process) - but not during wholesaler switching or session loading
  if (showAuth && !isEnhancedPreviewMode && wholesalerId && !isSwitchingWholesaler && !sessionLoading) {
    console.log('🔐 Showing 3-step authentication screen');
    return <CustomerAuth 
      wholesalerId={wholesalerId} 
      onAuthSuccess={handleAuthSuccess}
      onSkipAuth={handleSkipAuth}
      openRequestAccess={openRequestAccessOnAuth}
    />;
  }

  // Show loading while wholesaler data is being fetched - prevents rendering with undefined wholesaler
  if (wholesalerLoading && wholesalerId && !isEnhancedPreviewMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex space-x-1">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-6 bg-gradient-to-t from-green-400 to-emerald-500 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1.6s' }}
              />
            ))}
          </div>
          <p className="text-gray-600 text-center">Loading store...</p>
        </div>
      </div>
    );
  }

  // Show thank you page after successful order
  if (showThankYou && completedOrder && wholesaler && isAuthenticated) {
    console.log('🎉 Showing thank you page');
    return <LazyThankYouPage
      orderNumber={completedOrder.orderNumber}
      cart={completedOrder.cart}
      customerData={completedOrder.customerData}
      totalAmount={completedOrder.totalAmount}
      subtotal={completedOrder.subtotal}
      transactionFee={completedOrder.transactionFee}
      shippingCost={completedOrder.shippingCost}
      payLater={completedOrder.payLater}
      wholesaler={{
        businessName: wholesaler?.businessName || 'Business',
        email: wholesaler?.email || 'hello@business.com',
        phone: wholesaler?.businessPhone || wholesaler?.phone || '+44000000000',
        currency: wholesaler?.defaultCurrency || 'GBP'
      }}
      onContinueShopping={() => {
        // Clear cart and order data
        setCart([]);
        setCompletedOrder(null);
        setShowThankYou(false);
        // Navigate back to products
        setShowAllProducts(true);
        setShowHomePage(false);
      }}
      onViewOrders={() => {
        // Clear cart and order data
        setCart([]);
        setCompletedOrder(null);
        setShowThankYou(false);
        // Navigate to order history tab
        setActiveTab("orders");
        setShowHomePage(true);
        setShowAllProducts(false);
      }}
    />;
  }

  // This logic has been moved to useEffect to prevent re-render loops

  // Early loading state only for authenticated users with featured products
  if (featuredProductId && featuredLoading && isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8 space-y-8">
          <FeaturedProductSkeleton />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Preview Mode Banner */}
      {isEnhancedPreviewMode && (
        <div className="bg-orange-500 text-white px-4 py-2 text-center text-sm font-medium">
          🔍 Store Preview Mode{isWholesalerOwnStore ? ' (Viewing Your Store)' : ''} - Cart and checkout features are disabled for testing
        </div>
      )}

      {/* Header - Single-row on all viewports */}
      <div className="bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Left — Store Logo + Name */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {wholesaler?.logoUrl ? (
                <img 
                  src={wholesaler.logoUrl} 
                  alt={wholesaler.businessName || "Business logo"} 
                  className="h-10 w-10 rounded-xl object-contain flex-shrink-0 shadow-sm"
                />
              ) : wholesaler?.logoType === "business" && wholesaler?.businessName ? (
                <div className="h-10 w-10 rounded-xl bg-theme-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-sm font-bold text-white">
                    {wholesaler.businessName
                      .split(' ')
                      .map((word: string) => word.charAt(0).toUpperCase())
                      .join('')
                      .substring(0, 2)}
                  </span>
                </div>
              ) : (
                <div className="h-10 w-10 rounded-xl bg-theme-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-sm font-bold text-white">
                    {wholesaler?.businessName ? (
                      wholesaler.businessName.charAt(0).toUpperCase() + 
                      (wholesaler.businessName.split(' ')[1]?.charAt(0).toUpperCase() || wholesaler.businessName.charAt(1).toUpperCase())
                    ) : 'QP'}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-base font-bold text-gray-900 truncate leading-tight">
                  {wholesalerLoading ? (
                    <span className="text-gray-400">Loading...</span>
                  ) : wholesalerError ? (
                    "Store Unavailable"
                  ) : (
                    wholesaler?.businessName || "Wholesale Store"
                  )}
                </h1>
                <p className="text-xs text-gray-500 truncate leading-tight hidden sm:block">
                  {wholesaler?.storeTagline || "Premium wholesale products"}
                </p>
              </div>
            </div>

            {/* Right — Action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Guest: Back to Quikpik */}
              {isTrueGuestMode && (
                <Button
                  onClick={async () => {
                    try {
                      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
                      setTimeout(() => { window.location.href = '/landing'; }, 100);
                    } catch { window.location.href = '/landing'; }
                  }}
                  variant="outline"
                  size="sm"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50 text-xs px-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Back</span>
                </Button>
              )}

              {/* Explore pill */}
              {isAuthenticated && !isPreviewMode && (
                <button
                  onClick={() => setShowWholesalerSearch(true)}
                  className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 text-gray-400 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <Search className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-xs font-medium text-gray-500">Explore</span>
                </button>
              )}

              {/* Theme Switcher */}
              <ThemeSwitcher currentTheme={theme} onThemeChange={changeTheme} />

            </div>
          </div>
        </div>
      </div>

      {/* Guest browse conversion banner */}
      {isTrueGuestMode && (
        <div className="sticky top-0 z-30 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">
              Register to view prices and place orders
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <button
              onClick={openCustomerRequestAccess}
              className="bg-white text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-green-50 transition-colors whitespace-nowrap"
            >
              Request Access
            </button>
            <button
              onClick={openCustomerSignIn}
              className="text-white/70 hover:text-white text-xs underline whitespace-nowrap"
            >
              Sign in
            </button>
          </div>
        </div>
      )}

      {/* Explore — Full-screen wholesaler search */}
      {showWholesalerSearch && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <button
              onClick={() => { setShowWholesalerSearch(false); setWholesalerSearchQuery(""); }}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Heading + search field */}
          <div className="px-6 pt-6 pb-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-5">
              Hi, what are you looking for?
            </h1>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search for a seller or business name"
                value={wholesalerSearchQuery}
                onChange={(e) => setWholesalerSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3.5 bg-gray-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-y-auto px-4 pb-28">
            {wholesalersLoading ? (
              <div className="space-y-3 mt-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-3 animate-pulse p-3">
                    <div className="w-12 h-12 bg-gray-200 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (() => {
              const accessibleSellers = availableWholesalers.filter((w: any) => w.isAccessible);
              const discoverSellers = availableWholesalers.filter((w: any) => !w.isAccessible);
              const isSearching = wholesalerSearchQuery.trim().length > 0;

              const WholesalerCard = ({ wholesalerItem }: { wholesalerItem: any }) => (
                <div
                  key={wholesalerItem.id}
                  className="flex items-center space-x-3 p-3 rounded-xl transition-colors hover:bg-gray-50 cursor-pointer active:bg-gray-100"
                  onClick={async () => {
                    setShowWholesalerSearch(false);
                    setWholesalerSearchQuery("");
                    if (wholesalerItem.isAccessible) {
                      setIsSwitchingWholesaler(true);
                      try {
                        await fetch('/api/customer-auth/switch-wholesaler', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ targetWholesalerId: wholesalerItem.id })
                        });
                      } catch {
                        // continue even if switch-wholesaler fails — session check will handle auth
                      }
                      // Keep isSwitchingWholesaler=true through navigation so the switching
                      // screen persists until the new store session check resolves
                      setLocation(`/store/${wholesalerItem.id}`);
                    }
                  }}
                >
                  <Logo
                    size="md"
                    variant="icon-only"
                    className="flex-shrink-0 w-12 h-12 rounded-xl"
                    user={{
                      logoType: wholesalerItem.logoType || 'business',
                      logoUrl: wholesalerItem.logoUrl,
                      businessName: wholesalerItem.businessName,
                      firstName: wholesalerItem.firstName,
                      lastName: wholesalerItem.lastName
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 text-sm">{wholesalerItem.businessName || "Business"}</h4>
                    <p className="text-xs text-gray-500 truncate">{wholesalerItem.storeTagline || "Wholesale products"}</p>
                    {wholesalerItem.location && (
                      <p className="text-xs text-gray-400 flex items-center mt-0.5">
                        <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                        {wholesalerItem.location}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {wholesalerItem.canRequestAccess ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 px-3"
                        onClick={(e) => { e.stopPropagation(); handleRequestAccess(wholesalerItem); }}
                      >
                        Request Access
                      </Button>
                    ) : wholesalerItem.isAccessible ? (
                      <div className="flex items-center text-green-600">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        <span className="text-xs font-medium">Access</span>
                      </div>
                    ) : (
                      <Building2 className="w-4 h-4 text-gray-300" />
                    )}
                  </div>
                </div>
              );

              if (isSearching) {
                return availableWholesalers.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 px-3 mb-2">{availableWholesalers.length} result{availableWholesalers.length !== 1 ? 's' : ''}</p>
                    {availableWholesalers.map((w: any) => <WholesalerCard key={w.id} wholesalerItem={w} />)}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center pt-16 text-center px-6">
                    <Building2 className="w-14 h-14 text-gray-200 mb-4" />
                    <p className="font-semibold text-gray-700">No sellers found</p>
                    <p className="text-sm text-gray-400 mt-1">Try a different name or contact a seller to get registered.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-6 mt-2">
                  {/* Your Sellers */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 px-3 mb-1">Your Sellers</h3>
                    {accessibleSellers.length > 0 ? (
                      accessibleSellers.map((w: any) => <WholesalerCard key={w.id} wholesalerItem={w} />)
                    ) : (
                      <p className="text-sm text-gray-400 px-3 py-4">You haven't been added to any stores yet.</p>
                    )}
                  </div>

                  {/* Discover New Sellers */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 px-3 mb-1">Discover New Sellers</h3>
                    {discoverSellers.length > 0 ? (
                      discoverSellers.map((w: any) => <WholesalerCard key={w.id} wholesalerItem={w} />)
                    ) : (
                      <p className="text-sm text-gray-400 px-3 py-4">
                        No new sellers found. Contact a seller to get registered with their store.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Sticky search button */}
          <div className="fixed bottom-0 left-0 right-0 px-4 py-4 bg-white border-t border-gray-100">
            <button
              className="w-full py-4 btn-theme-primary rounded-2xl text-base font-semibold"
              onClick={() => {
                if (!wholesalerSearchQuery.trim()) {
                  document.querySelector<HTMLInputElement>('input[placeholder="Search for a seller or business name"]')?.focus();
                }
              }}
            >
              Search
            </button>
          </div>

        </div>
      )}

      {/* Store Switcher Bottom Sheet */}
      {showStoreSwitcher && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowStoreSwitcher(false)}
          />
          {/* Sheet */}
          <div className="relative bg-white rounded-t-3xl shadow-xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Customer header */}
            <div className="px-5 pt-3 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-theme-secondary flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-theme-primary">
                    {(() => {
                      const name = authenticatedCustomer?.firstName || authenticatedCustomer?.name || '';
                      return name.split(' ').map((w: string) => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
                    })()}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {authenticatedCustomer?.firstName
                      ? `${authenticatedCustomer.firstName}${authenticatedCustomer.lastName ? ' ' + authenticatedCustomer.lastName : ''}`
                      : authenticatedCustomer?.name || 'My Account'}
                  </p>
                  <p className="text-xs text-gray-500">{authenticatedCustomer?.phone || ''}</p>
                </div>
              </div>
            </div>

            {/* Stores list */}
            <div className="overflow-y-auto flex-1 px-4 py-3">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">Your Stores</p>
              {switcherStores
                .map((w: any) => {
                  const isActive = w.id === wholesalerId;
                  return (
                    <button
                      key={w.id}
                      onClick={async () => {
                        if (isActive) { setShowStoreSwitcher(false); return; }
                        setShowStoreSwitcher(false);
                        setIsSwitchingWholesaler(true);
                        try {
                          await fetch('/api/customer-auth/switch-wholesaler', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ targetWholesalerId: w.id })
                          });
                        } catch {
                          // continue even if switch-wholesaler fails — session check will handle auth
                        }
                        // Keep isSwitchingWholesaler=true through navigation so the switching
                        // screen persists until the new store session check resolves
                        setLocation(`/store/${w.id}`);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl mb-1 transition-colors text-left ${isActive ? 'bg-theme-secondary' : 'hover:bg-gray-50 active:bg-gray-100'}`}
                    >
                      <Logo
                        size="md"
                        variant="icon-only"
                        className="flex-shrink-0 w-11 h-11 rounded-xl"
                        user={{
                          logoType: w.logoType || 'business',
                          logoUrl: w.logoUrl,
                          businessName: w.businessName,
                          firstName: w.firstName,
                          lastName: w.lastName
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm ${isActive ? 'text-theme-primary' : 'text-gray-900'}`}>
                          {w.businessName || 'Business'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{w.storeTagline || 'Wholesale products'}</p>
                      </div>
                      {isActive && (
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-theme-primary flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              {switcherStoresLoading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-gray-500 animate-spin" />
                </div>
              ) : switcherStores.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No stores available</p>
              )}
            </div>

            {/* Safe area bottom padding */}
            <div className="h-6" />
          </div>
        </div>
      )}

      <div className="container mx-auto px-3 sm:px-4 pt-4 sm:pt-6 lg:pt-8 pb-24">

        {isTrueGuestMode && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 sm:p-7 overflow-hidden relative">
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-green-50 rounded-full" />
              <div className="relative z-10">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-700 mb-1">
                    {timeGreeting} — browse {wholesaler?.businessName || 'this wholesale store'}
                  </p>
                  <p className="text-gray-500 mt-1 max-w-2xl">
                    {wholesaler?.storeTagline || 'Browse available wholesale products. Sign in or request access to unlock prices and place orders.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Products</h3>
                  <p className="text-sm text-gray-500">Prices and ordering unlock after registration.</p>
                </div>
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search products"
                    className="pl-9 rounded-full"
                  />
                </div>
              </div>

              {productsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, index) => (
                    <ProductCardSkeleton key={index} />
                  ))}
                </div>
              ) : productsError ? (
                <div className="text-center py-14">
                  <Package className="w-14 h-14 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to load products</h3>
                  <p className="text-gray-500 mb-4">There was an error loading this catalogue.</p>
                  <Button onClick={() => refetchProducts()} variant="outline">Try again</Button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-14">
                  <Package className="w-14 h-14 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No products found</h3>
                  <p className="text-gray-500">
                    {searchTerm ? "Try a different search term." : "This store doesn't have products available yet."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map((product) => {
                    const extraImages = "images" in product && Array.isArray(product.images) ? product.images : [];
                    const image = product.imageUrl || extraImages.find(Boolean);
                    const guestStockRows = getGuestStockRows(product);
                    return (
                      <Card key={product.id} className="rounded-2xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow bg-white">
                        <CardContent className="p-0">
                          <div className="aspect-[4/3] bg-gray-50 border-b border-gray-100 flex items-center justify-center overflow-hidden">
                            {image ? (
                              <img src={image} alt={product.name} className="w-full h-full object-contain p-3" />
                            ) : (
                              <Package className="w-12 h-12 text-gray-300" />
                            )}
                          </div>
                          <div className="p-4 space-y-3">
                            <div>
                              <h4 className="font-semibold text-gray-900 line-clamp-2">{product.name}</h4>
                              {product.description && (
                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                  {cleanAIDescription(product.description)}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-xs bg-green-50 text-green-700 border border-green-100 rounded-full px-2 py-1">
                                {getSellingFormatLabel(product.sellingFormat)}
                              </span>
                              {product.category && (
                                <span className="text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-1">{product.category}</span>
                              )}
                              {product.moq && product.moq > 1 && (
                                <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-1">MOQ {product.moq}</span>
                              )}
                            </div>
                            <div className="space-y-1 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                              {guestStockRows.map((row) => {
                                const Icon = row.type === "units" ? Hash : Package2;
                                return (
                                  <div
                                    key={row.type}
                                    className={`flex items-center gap-2 text-xs font-medium ${row.available ? row.type === "units" ? "text-green-700" : "text-blue-700" : "text-amber-700"}`}
                                  >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span>{row.text}</span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex items-center justify-between gap-3 pt-1">
                              <PriceDisplay price={null} currency={wholesaler?.defaultCurrency || 'GBP'} isGuestMode={true} size="medium" />
                              <Button
                                size="sm"
                                onClick={() => setShowGuestSignInModal(true)}
                                className="rounded-full bg-green-600 hover:bg-green-700 text-white"
                              >
                                View price
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modern Tab Navigation - Only for authenticated users */}
        {hasCustomerSession && !isTrueGuestMode && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Fixed bottom navigation bar */}
            <TabsList className="bottom-nav-list fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 h-16 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
              <TabsTrigger value="home" className="tab-theme-active flex flex-col items-center justify-center gap-0.5 h-full rounded-none border-0 px-0 py-2">
                <Home className="w-5 h-5 flex-shrink-0" />
                <span className="text-[11px] font-medium leading-none">Home</span>
              </TabsTrigger>
              <TabsTrigger value="products" className="tab-theme-active flex flex-col items-center justify-center gap-0.5 h-full rounded-none border-0 px-0 py-2">
                <Store className="w-5 h-5 flex-shrink-0" />
                <span className="text-[11px] font-medium leading-none">Products</span>
              </TabsTrigger>
              <TabsTrigger value="orders" className="tab-theme-active flex flex-col items-center justify-center gap-0.5 h-full rounded-none border-0 px-0 py-2">
                <History className="w-5 h-5 flex-shrink-0" />
                <span className="text-[11px] font-medium leading-none">Orders</span>
              </TabsTrigger>
              <TabsTrigger value="account" className="tab-theme-active flex flex-col items-center justify-center gap-0.5 h-full rounded-none border-0 px-0 py-2">
                <User className="w-5 h-5 flex-shrink-0" />
                <span className="text-[11px] font-medium leading-none">Account</span>
              </TabsTrigger>
              <TabsTrigger value="help" className="tab-theme-active flex flex-col items-center justify-center gap-0.5 h-full rounded-none border-0 px-0 py-2">
                <HelpCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-[11px] font-medium leading-none">Help</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="home" className="space-y-5 mb-16 pb-6">
              {/* Quick Actions strip */}
              <div className="flex items-center justify-around px-1 py-1">
                <button onClick={() => setActiveTab("products")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><Store className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Shop</span>
                </button>
                <button onClick={() => setActiveTab("orders")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><History className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Orders</span>
                </button>
                <button onClick={async () => { if (cart.length > 0) { setShowCheckout(true); } else { setActiveTab("products"); } }} disabled={isCreatingIntent} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 relative">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary relative">
                    <ShoppingCart className="w-4 h-4 text-theme-primary" />
                    {cart.length > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center bg-theme-primary">{cart.length}</span>}
                  </div>
                  <span className="text-[10px] font-medium text-gray-600">{cart.length > 0 ? "Checkout" : "Cart"}</span>
                </button>
                <button onClick={handleLogout} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-50"><X className="w-4 h-4 text-red-400" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Sign Out</span>
                </button>
              </div>
              {/* Welcome Hero Banner */}
              <div className="rounded-2xl px-6 py-7 text-white relative overflow-hidden animate-fade-in gradient-theme-banner">
                {/* Subtle decorative circles */}
                <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white opacity-5 pointer-events-none" />
                <div className="absolute -bottom-10 -left-6 w-32 h-32 rounded-full bg-white opacity-5 pointer-events-none" />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between relative z-10 gap-4">
                  <div>
                    <h1 className="text-3xl font-extrabold mb-1 leading-tight tracking-tight">
                      Hi, {authenticatedCustomer?.firstName || (authenticatedCustomer?.name?.split(' ')[0])} 👋
                    </h1>
                    <button
                      onClick={() => setShowStoreSwitcher(true)}
                      className="flex items-center gap-1.5 mt-0.5 opacity-80 hover:opacity-100 transition-opacity text-sm text-white"
                    >
                      <span>Shopping at</span>
                      <span className="font-semibold opacity-100 bg-white/20 hover:bg-white/30 transition-colors px-2 py-0.5 rounded-full flex items-center gap-1">
                        {wholesaler?.businessName}
                        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                      </span>
                    </button>
                    {customerOrderStats && customerOrderStats.totalOrders > 0 && (
                      <div className="mt-3 flex items-center gap-4 text-sm opacity-90">
                        <span className="flex items-center gap-1">
                          <ShoppingBag className="w-3.5 h-3.5" />
                          {customerOrderStats.totalOrders} orders
                        </span>
                        <span className="flex items-center gap-1">
                          <Banknote className="w-3.5 h-3.5" />
                          {formatCurrency(customerOrderStats.totalSpent || 0, wholesaler?.defaultCurrency || 'GBP')} spent
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => setActiveTab("products")}
                    className="bg-white hover:bg-gray-50 border-0 rounded-full px-5 font-semibold shadow-sm flex-shrink-0 self-start sm:self-auto text-theme-primary"
                  >
                    <Store className="w-4 h-4 mr-2" />
                    Browse Products
                  </Button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2">
                {/* Cart Items */}
                <div
                  className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => { if (!isPreviewMode && cart.length > 0) { setShowCheckout(true); } }}
                >
                  <div className="flex flex-col items-center text-center gap-0.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
                      <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                    </div>
                    <p className="text-lg sm:text-xl font-extrabold leading-none text-theme-primary">
                      {cart.reduce((total, item) => total + item.quantity, 0)}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium">In Cart</p>
                    {cart.length > 0 && (
                      <p className="text-[10px] text-gray-400 leading-none">Tap to checkout</p>
                    )}
                  </div>
                </div>

                {/* Cart Value */}
                <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm">
                  <div className="flex flex-col items-center text-center gap-0.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
                      <Banknote className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                    </div>
                    <div className="font-extrabold leading-none text-theme-primary">
                      <PriceDisplay
                        price={cartStats.totalValue}
                        currency={wholesaler?.defaultCurrency || 'GBP'}
                        isGuestMode={false}
                        size="medium"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium">Cart Total</p>
                  </div>
                </div>

                {/* Total Orders */}
                <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm cursor-pointer" onClick={() => setActiveTab("orders")}>
                  <div className="flex flex-col items-center text-center gap-0.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
                      <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                    </div>
                    <p className="text-lg sm:text-xl font-extrabold leading-none text-theme-primary">
                      {customerOrderStats?.totalOrders || 0}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium">Orders</p>
                    {(customerOrderStats?.totalOrders || 0) > 0 && (
                      <p className="text-[10px] text-gray-400 leading-none">Tap to view</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Orders */}
              {authenticatedCustomer?.phone && wholesalerId && (
                <RecentOrdersSection
                  wholesalerId={wholesalerId}
                  customerPhone={authenticatedCustomer.phone}
                  onViewAllOrders={() => setActiveTab("orders")}
                  defaultCurrency={wholesaler?.defaultCurrency}
                />
              )}

              {/* Top Selling Products */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-theme-primary" />
                    Top Selling
                  </h2>
                  <button
                    onClick={() => setActiveTab("products")}
                    className="text-sm font-medium flex items-center gap-1 hover:underline text-theme-primary"
                  >
                    View All <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                
                {productsLoading ? (
                  <ProductGridSkeleton />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products?.slice(0, 3).map((product) => {
                      const cartItemUnitsHome = cart.find(item => item.product.id === product.id && item.sellingType === 'units');
                      const cartItemPalletsHome = cart.find(item => item.product.id === product.id && item.sellingType === 'pallets');
                      const cartItem = cartItemUnitsHome || cartItemPalletsHome;
                      const hasPalletPricingHome = !!(product as any).palletPrice && parseFloat((product as any).palletPrice?.toString() || '0') > 0;
                      const pricing = calculatePromotionalPricing(product, product.moq);
                      
                      return (
                        <Card key={product.id} className="h-full personalized-card animate-fade-in group cursor-pointer rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow" 
                              style={{animationDelay: `${Math.random() * 0.3}s`}}>
                          <CardContent className="p-0">
                            <div className="space-y-0">
                              {/* Product Image */}
                              <div className="relative h-44 bg-gray-100 overflow-hidden group-hover:shadow-inner transition-all duration-300">
                                {product.imageUrl ? (
                                  <img
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Package className="w-8 h-8 text-gray-400 group-hover:scale-110 transition-transform duration-300" />
                                  </div>
                                )}
                                {pricing.promoLabel && (
                                  <div className={`absolute top-2 left-2 text-white px-2 py-1 rounded text-xs font-bold ${pricing.promoType === 'clearance' ? 'bg-orange-500' : pricing.promoType === 'buy_x_get_y_free' ? 'bg-purple-500' : pricing.promoType === 'bundle_deal' ? 'bg-blue-500' : 'bg-red-500'}`}>
                                    {pricing.promoType === 'clearance' ? '🏷️' : '🔥'} {pricing.promoLabel}
                                  </div>
                                )}
                                {/* Hover overlay for interaction hint */}
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-300 flex items-center justify-center">
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white text-xs font-medium">
                                    Quick View
                                  </div>
                                </div>
                              </div>

                              {/* Product Info */}
                              <div className="p-4 space-y-3">
                                <div>
                                  <h3 className="font-semibold text-gray-900 line-clamp-1 group-hover:text-theme-primary transition-colors duration-300">
                                    {product.name}
                                  </h3>
                                  <div className="flex items-center justify-between mt-1">
                                    <PriceDisplay
                                      price={pricing.effectivePrice}
                                      originalPrice={pricing.effectivePrice !== pricing.originalPrice ? pricing.originalPrice : undefined}
                                      currency={wholesaler?.defaultCurrency || 'GBP'}
                                      isGuestMode={isTrueGuestMode}
                                      size="medium"
                                      showStrikethrough={true}
                                    />
                                    <span className="text-xs text-gray-400">MOQ: {product.moq}</span>
                                  </div>
                                  {hasPalletPricingHome && !cartItemUnitsHome && !cartItemPalletsHome && (
                                    <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                                      <span>🚛</span>
                                      <span>Pallet: £{parseFloat((product as any).palletPrice?.toString() || '0').toFixed(2)} / pallet — Min {(product as any).palletMoq || 1}</span>
                                    </p>
                                  )}
                                </div>

                                {/* Stock Availability Indicator */}
                                <div className="flex items-center gap-3">
                                  {product.sellingFormat === 'units' && (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-2 h-2 rounded-full bg-green-500" />
                                      <span className="font-medium text-green-700 text-xs">
                                        <Hash className="w-3 h-3 inline mr-1" />
                                        {product.stock || 0} packs
                                      </span>
                                    </div>
                                  )}
                                  {product.sellingFormat === 'pallets' && (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                                      <span className="font-medium text-blue-700 text-xs">
                                        <Package2 className="w-3 h-3 inline mr-1" />
                                        {(product as any).palletStock || 0} pallets
                                      </span>
                                    </div>
                                  )}
                                  {product.sellingFormat === 'both' && (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                        <span className="font-medium text-green-700 text-xs">
                                          <Hash className="w-3 h-3 inline mr-1" />
                                          {product.stock || 0} packs
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                        <span className="font-medium text-blue-700 text-xs">
                                          <Package2 className="w-3 h-3 inline mr-1" />
                                          {(product as any).palletStock || 0} pallets
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>

                                {/* Quick Order Controls */}
                                {cartItem ? (
                                  <div className="space-y-2">
                                    {/* Type badge + Change for home tab */}
                                    {hasPalletPricingHome && (cartItemUnitsHome || cartItemPalletsHome) && !(cartItemUnitsHome && cartItemPalletsHome) && (
                                      <div className="flex items-center justify-between">
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cartItemUnitsHome ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                          {cartItemUnitsHome ? '📦 Units ✓' : '🚛 Pallets ✓'}
                                        </span>
                                        <button
                                          onClick={() => {
                                            setCart(cart.filter(item => item.product.id !== product.id));
                                            setSelectedProductForModal(product);
                                            setModalStep('type');
                                            setSelectedModalType(null);
                                            setModalQuantity(product.moq || 1);
                                            setShowUnitSelectionModal(true);
                                          }}
                                          className="text-xs text-gray-400 hover:text-gray-600 underline"
                                        >
                                          Change type
                                        </button>
                                      </div>
                                    )}
                                  <div className="flex items-center justify-between gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (cartItem.quantity <= product.moq) {
                                          setCart(cart.filter(item => item.product.id !== product.id));
                                        } else {
                                          setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity - 1 } : item));
                                        }
                                      }}
                                      className="h-8 w-8 p-0 flex-shrink-0"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <div className="relative flex-1">
                                      <Input
                                        type="number"
                                        value={quantityInputValues[product.id] !== undefined ? quantityInputValues[product.id] : cartItem.quantity}
                                        onChange={(e) => {
                                          const inputValue = e.target.value;
                                          setQuantityInputValues(prev => ({ ...prev, [product.id]: inputValue }));
                                          const parsedValue = parseInt(inputValue) || 0;
                                          setShowMOQWarnings(prev => ({ ...prev, [product.id]: parsedValue > 0 && parsedValue < product.moq }));
                                        }}
                                        onFocus={() => {
                                          setActiveQuantityInput(product.id);
                                          setShowQuantityHints(prev => ({ ...prev, [product.id]: true }));
                                        }}
                                        onBlur={() => {
                                          const inputValue = quantityInputValues[product.id];
                                          const parsedValue = parseInt(inputValue) || 0;
                                          if (parsedValue === 0) {
                                            setCart(cart.filter(item => item.product.id !== product.id));
                                          } else {
                                            const validQuantity = Math.max(product.moq, parsedValue);
                                            const maxQuantity = Math.min(validQuantity, product.stock);
                                            setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: maxQuantity } : item));
                                          }
                                          setQuantityInputValues(prev => { const s = { ...prev }; delete s[product.id]; return s; });
                                          setShowMOQWarnings(prev => ({ ...prev, [product.id]: false }));
                                          setShowQuantityHints(prev => ({ ...prev, [product.id]: false }));
                                          setActiveQuantityInput(null);
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                        min={0}
                                        max={product.stock}
                                        className={`w-full h-8 text-center text-sm ${showMOQWarnings[product.id] ? 'border-amber-400 bg-amber-50' : activeQuantityInput === product.id ? 'border-blue-400 bg-blue-50' : ''}`}
                                        placeholder={product.moq.toString()}
                                      />
                                      {showMOQWarnings[product.id] && (
                                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-amber-100 border border-amber-300 rounded-md px-2 py-1 text-xs text-amber-800 whitespace-nowrap shadow-sm">
                                          Min: {product.moq} units
                                          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-amber-100 border-l border-t border-amber-300 rotate-45"></div>
                                        </div>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))}
                                      className="h-8 w-8 p-0 flex-shrink-0"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  </div>
                                ) : (
                                  <div>
                                    <Button
                                      className="w-full rounded-full font-semibold text-white bg-theme-primary"
                                      onClick={() => {
                                        if (hasPalletPricingHome) {
                                          setSelectedProductForModal(product);
                                          setModalStep('type');
                                          setSelectedModalType(null);
                                          setModalQuantity(product.moq || 1);
                                          setShowUnitSelectionModal(true);
                                        } else {
                                          addToCart(product, product.moq, 'units');
                                        }
                                      }}
                                      onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.9'; }}
                                      onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
                                    >
                                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                                      {hasPalletPricingHome ? 'Add to Cart →' : 'Add to Cart'}
                                    </Button>
                                    {hasPalletPricingHome && (
                                      <p className="text-xs text-gray-500 text-center mt-1">Choose type: units or pallets</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

            </TabsContent>

            <TabsContent value="products" className="space-y-6 mb-16 pb-6">
              {/* Quick Actions strip */}
              <div className="flex items-center justify-around px-1 py-1">
                <button onClick={() => setActiveTab("products")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><Store className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Shop</span>
                </button>
                <button onClick={() => setActiveTab("orders")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><History className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Orders</span>
                </button>
                <button onClick={async () => { if (cart.length > 0) { setShowCheckout(true); } else { setActiveTab("products"); } }} disabled={isCreatingIntent} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 relative">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary relative">
                    <ShoppingCart className="w-4 h-4 text-theme-primary" />
                    {cart.length > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center bg-theme-primary">{cart.length}</span>}
                  </div>
                  <span className="text-[10px] font-medium text-gray-600">{cart.length > 0 ? "Checkout" : "Cart"}</span>
                </button>
                <button onClick={handleLogout} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-50"><X className="w-4 h-4 text-red-400" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Sign Out</span>
                </button>
              </div>
              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-2">
                {/* Cart Items */}
                <div
                  className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => { if (!isPreviewMode && cart.length > 0) { setShowCheckout(true); } }}
                >
                  <div className="flex flex-col items-center text-center gap-0.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
                      <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                    </div>
                    <p className="text-lg sm:text-xl font-extrabold leading-none text-theme-primary">
                      {cart.reduce((total, item) => total + item.quantity, 0)}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium">In Cart</p>
                    {cart.length > 0 && (
                      <p className="text-[10px] text-gray-400 leading-none">Tap to checkout</p>
                    )}
                  </div>
                </div>

                {/* Cart Value */}
                <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm">
                  <div className="flex flex-col items-center text-center gap-0.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
                      <Banknote className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                    </div>
                    <div className="font-extrabold leading-none text-theme-primary">
                      <PriceDisplay
                        price={cartStats.totalValue}
                        currency={wholesaler?.defaultCurrency || 'GBP'}
                        isGuestMode={false}
                        size="medium"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium">Cart Total</p>
                  </div>
                </div>

                {/* Total Orders */}
                <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm cursor-pointer" onClick={() => setActiveTab("orders")}>
                  <div className="flex flex-col items-center text-center gap-0.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
                      <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                    </div>
                    <p className="text-lg sm:text-xl font-extrabold leading-none text-theme-primary">
                      {customerOrderStats?.totalOrders || 0}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium">Orders</p>
                    {(customerOrderStats?.totalOrders || 0) > 0 && (
                      <p className="text-[10px] text-gray-400 leading-none">Tap to view</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Product Search and Filters */}
              {/* Sticky search + filter toolbar */}
              <div className="sticky top-16 z-30 bg-white -mx-4 px-4 pt-2 pb-3 border-b border-gray-100 space-y-3 sm:mx-0 sm:px-4 sm:border sm:rounded-xl sm:shadow-sm sm:border-gray-100">
                {/* Row 1: Search + view toggle */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-11 rounded-full border-gray-200"
                    />
                  </div>
                  {/* View toggle — icon-only */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? '' : 'hover:bg-gray-100'}`}
                      style={viewMode === 'grid' ? {backgroundColor: 'var(--theme-secondary)'} : {}}
                    >
                      <Grid className="w-4 h-4" style={viewMode === 'grid' ? {color: 'var(--theme-primary)'} : {color: '#6b7280'}} />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? '' : 'hover:bg-gray-100'}`}
                      style={viewMode === 'list' ? {backgroundColor: 'var(--theme-secondary)'} : {}}
                    >
                      <List className="w-4 h-4" style={viewMode === 'list' ? {color: 'var(--theme-primary)'} : {color: '#6b7280'}} />
                    </button>
                  </div>
                </div>

                {/* Row 2: Category pills (horizontal scroll) */}
                <div className="flex overflow-x-auto gap-2 pb-1" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === 'all' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    style={selectedCategory === 'all' ? {backgroundColor: 'var(--theme-primary)'} : {}}
                  >
                    All
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category || '')}
                      className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === category ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                      style={selectedCategory === category ? {backgroundColor: 'var(--theme-primary)'} : {}}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                {/* Hidden fallback Select (preserves state management) */}
                <div className="hidden">
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category || ''}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Product count */}
              {!productsLoading && !productsError && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm text-gray-500">
                    {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
                    {(searchTerm || selectedCategory !== 'all') && ' found'}
                  </p>
                </div>
              )}

              {/* Products Display */}
              <div className="space-y-4">
                {productsLoading ? (
                  <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" : "space-y-4"}>
                    {[...Array(6)].map((_, i) => (
                      <ProductCardSkeleton key={i} />
                    ))}
                  </div>
                ) : productsError ? (
                  <div className="text-center py-16">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load products</h3>
                    <p className="text-gray-500 mb-4">There was an error loading the product catalog.</p>
                    <Button onClick={() => refetchProducts()} variant="outline">
                      Try Again
                    </Button>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-16">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
                    <p className="text-gray-500">
                      {searchTerm || selectedCategory !== "all" 
                        ? "Try adjusting your search or filters"
                        : "This store doesn't have any products available yet."
                      }
                    </p>
                  </div>
                ) : (
                  <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" : "space-y-4"}>
                    {filteredProducts.map((product) => {
                      const pricing = calculatePromotionalPricing(product, 1);
                      const cartItemUnits = cart.find(item => item.product.id === product.id && item.sellingType === 'units');
                      const cartItemPallets = cart.find(item => item.product.id === product.id && item.sellingType === 'pallets');
                      const cartItem = cartItemUnits || cartItemPallets;
                      const hasPalletPricing = !!(product.palletPrice && parseFloat(product.palletPrice.toString()) > 0);
                      
                      return viewMode === "grid" ? (
                        <Card key={product.id} className="group rounded-2xl overflow-hidden border border-gray-100 hover:border-[var(--theme-primary)] hover:shadow-lg transition-all duration-200 bg-white">
                          <CardContent className="p-0">
                            {/* Product Image Gallery */}
                            <div className="relative aspect-[4/3] bg-white overflow-hidden border-b border-gray-100">
                              {(() => {
                                // Get all available images (primary imageUrl + additional images array)
                                const allImages = [
                                  ...(product.imageUrl ? [product.imageUrl] : []),
                                  ...((product as any).images || []).filter((img: string) => img !== product.imageUrl)
                                ].filter(Boolean);
                                
                                const currentImageIndex = productImageIndexes[product.id] || 0;
                                
                                if (allImages.length === 0) {
                                  return (
                                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                      <Package className="w-12 h-12 text-gray-300" />
                                    </div>
                                  );
                                }
                                
                                if (allImages.length === 1) {
                                  return (
                                    <img 
                                      src={allImages[0]} 
                                      alt={product.name}
                                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200 p-2"
                                    />
                                  );
                                }
                                
                                // Multiple images - show carousel with indicators
                                return (
                                  <div
                                    className="relative w-full h-full"
                                    onTouchStart={(e) => { carouselTouchStartX.current = e.touches[0].clientX; }}
                                    onTouchEnd={(e) => {
                                      const diff = carouselTouchStartX.current - e.changedTouches[0].clientX;
                                      if (Math.abs(diff) >= 40) {
                                        setProductImageIndexes(prev => ({
                                          ...prev,
                                          [product.id]: diff > 0
                                            ? (currentImageIndex === allImages.length - 1 ? 0 : currentImageIndex + 1)
                                            : (currentImageIndex === 0 ? allImages.length - 1 : currentImageIndex - 1)
                                        }));
                                      }
                                    }}
                                  >
                                    <img 
                                      src={allImages[currentImageIndex]} 
                                      alt={`${product.name} - Image ${currentImageIndex + 1}`}
                                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200 p-2"
                                    />
                                    
                                    {/* Image Navigation Arrows */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setProductImageIndexes(prev => ({
                                          ...prev,
                                          [product.id]: currentImageIndex === 0 ? allImages.length - 1 : currentImageIndex - 1
                                        }));
                                      }}
                                      className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-1 transition-opacity opacity-0 group-hover:opacity-100"
                                    >
                                      <ArrowLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setProductImageIndexes(prev => ({
                                          ...prev,
                                          [product.id]: currentImageIndex === allImages.length - 1 ? 0 : currentImageIndex + 1
                                        }));
                                      }}
                                      className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-1 transition-opacity opacity-0 group-hover:opacity-100"
                                    >
                                      <ArrowRight className="w-4 h-4" />
                                    </button>
                                    
                                    {/* Image Indicators */}
                                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
                                      {allImages.map((_, index) => (
                                        <button
                                          key={index}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setProductImageIndexes(prev => ({
                                              ...prev,
                                              [product.id]: index
                                            }));
                                          }}
                                          className={`w-2 h-2 rounded-full transition-all ${
                                            index === currentImageIndex 
                                              ? 'bg-white shadow-md' 
                                              : 'bg-white bg-opacity-50'
                                          }`}
                                        />
                                      ))}
                                    </div>
                                    
                                    {/* Multiple Images Badge */}
                                    <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded-full">
                                      {currentImageIndex + 1}/{allImages.length}
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {/* Promo Badge */}
                              {pricing.promoLabel && (
                                <div className="absolute top-2 left-2">
                                  <Badge className={`text-xs text-white ${pricing.promoType === 'clearance' ? 'bg-orange-500' : pricing.promoType === 'buy_x_get_y_free' ? 'bg-purple-500' : pricing.promoType === 'bundle_deal' ? 'bg-blue-500' : 'bg-red-500'}`}>
                                    {pricing.promoLabel}
                                  </Badge>
                                </div>
                              )}
                            </div>
                            
                            {/* Product Info */}
                            <div className="p-4 space-y-2">
                              <div>
                                <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 mb-1">
                                  {product.name}
                                </h3>
                                {product.description && (
                                  <p className="text-xs text-gray-500 line-clamp-2">
                                    {cleanAIDescription(product.description)}
                                  </p>
                                )}
                              </div>
                              
                              {/* Product Details */}
                              <div className="space-y-2 mb-3">
                                <div className="flex flex-wrap gap-1 text-xs text-gray-600">
                                  {/* Product Weight/Size Tag */}
                                  {(() => {
                                    const packQuantity = (product as any).packQuantity || 1;
                                    const unitSize = (product as any).unitSize;
                                    const unitOfMeasure = (product as any).unitOfMeasure;
                                    
                                    if (unitSize && unitOfMeasure) {
                                      return (
                                        <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-medium">
                                          {packQuantity} x {Math.round(parseFloat(unitSize))}{unitOfMeasure}
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                  
                                  {/* Product Type Tags - Units or Pallets or Both */}
                                  {(product.palletPrice && parseFloat(product.palletPrice.toString()) > 0) ? (
                                    <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded font-medium">
                                      Units & Pallets
                                    </span>
                                  ) : (
                                    <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">
                                      Individual Units
                                    </span>
                                  )}
                                  
                                  {(product as any).size && (
                                    <span className="bg-gray-100 px-2 py-1 rounded">
                                      Size: {(product as any).size}
                                    </span>
                                  )}
                                  {product.moq && product.moq > 1 && (
                                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium" title={`Minimum order: ${product.moq} units required`}>
                                      Min: {product.moq} units
                                    </span>
                                  )}
                                  {/* Stock indicator replaced with enhanced component */}
                                  {(product as any).brand && (
                                    <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                                      {(product as any).brand}
                                    </span>
                                  )}
                                </div>
                                {/* Stock Availability Indicator */}
                                <div className="mb-2 flex items-center gap-3">
                                  {/* Dynamic Stock Indicator Based on Selling Format */}
                                  {product.sellingFormat === 'units' && (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-2 h-2 rounded-full bg-green-500" />
                                      <span className="font-medium text-green-700 text-xs">
                                        <Hash className="w-3 h-3 inline mr-1" />
                                        {product.stock || 0} packs
                                      </span>
                                    </div>
                                  )}
                                  {product.sellingFormat === 'pallets' && (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                                      <span className="font-medium text-blue-700 text-xs">
                                        <Package2 className="w-3 h-3 inline mr-1" />
                                        {(product as any).palletStock || 0} pallets
                                      </span>
                                    </div>
                                  )}
                                  {product.sellingFormat === 'both' && (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                        <span className="font-medium text-green-700 text-xs">
                                          <Hash className="w-3 h-3 inline mr-1" />
                                          {product.stock || 0} packs
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                        <span className="font-medium text-blue-700 text-xs">
                                          <Package2 className="w-3 h-3 inline mr-1" />
                                          {(product as any).palletStock || 0} pallets
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                                
                                {/* MOQ Helper Message */}
                                {product.moq && product.moq > 1 && (
                                  <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200 inline-block">
                                    {product.stock < product.moq ? (
                                      <>💡 Last {product.stock} units available (normally {product.moq} min)</>
                                    ) : (
                                      <>💡 Minimum order: {product.moq} units required to add to cart</>
                                    )}
                                  </div>
                                )}
                              </div>
                              
                              {/* Pricing */}
                              <div className="flex items-end justify-between mt-2">
                                <div className="w-full">
                                  <PriceDisplay
                                    price={pricing.effectivePrice}
                                    originalPrice={pricing.effectivePrice !== pricing.originalPrice ? pricing.originalPrice : undefined}
                                    currency={'GBP'}
                                    isGuestMode={isTrueGuestMode}
                                    size="medium"
                                    showStrikethrough={true}
                                  />
                                  {product.moq && product.moq > 1 && !cartItem && (
                                    <p className="text-xs text-gray-500 mt-0.5">Min {product.moq} units</p>
                                  )}
                                  {hasPalletPricing && !cartItemUnits && !cartItemPallets && (
                                    <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                                      <span>🚛</span>
                                      <span>Pallet: £{parseFloat((product as any).palletPrice?.toString() || '0').toFixed(2)} / pallet — Min {(product as any).palletMoq || 1}</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Add to Cart Controls */}
                              <div className="mt-2 space-y-2">
                                {/* Type badge + Change link (single type in cart) */}
                                {hasPalletPricing && (cartItemUnits || cartItemPallets) && !(cartItemUnits && cartItemPallets) && (
                                  <div className="flex items-center justify-between">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cartItemUnits ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                      {cartItemUnits ? '📦 Units ✓' : '🚛 Pallets ✓'}
                                    </span>
                                    <button
                                      onClick={() => {
                                        setCart(cart.filter(item => item.product.id !== product.id));
                                        setSelectedProductForModal(product);
                                        setModalStep('type');
                                        setSelectedModalType(null);
                                        setModalQuantity(product.moq || 1);
                                        setShowUnitSelectionModal(true);
                                      }}
                                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                                    >
                                      Change type
                                    </button>
                                  </div>
                                )}
                                {/* Units stepper */}
                                {cartItemUnits && (
                                  <div>
                                    {cartItemPallets && <p className="text-xs font-medium text-emerald-700 text-center mb-1">📦 Units</p>}
                                    <div className="flex items-center justify-center gap-2">
                                      <Button size="sm" variant="outline" onClick={() => {
                                        if (cartItemUnits.quantity <= product.moq) {
                                          setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'units')));
                                        } else {
                                          setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: item.quantity - 1} : item));
                                        }
                                      }} className="rounded-full h-8 w-8 p-0">
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <div className="relative">
                                        <Input type="number"
                                          value={quantityInputValues[product.id] !== undefined ? quantityInputValues[product.id] : cartItemUnits.quantity}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setQuantityInputValues(prev => ({...prev, [product.id]: v}));
                                            const p = parseInt(v) || 0;
                                            setShowMOQWarnings(prev => ({...prev, [product.id]: p > 0 && p < product.moq}));
                                          }}
                                          onFocus={() => { setActiveQuantityInput(product.id); setShowQuantityHints(prev => ({...prev, [product.id]: true})); }}
                                          onBlur={() => {
                                            const v = quantityInputValues[product.id];
                                            const p = parseInt(v) || 0;
                                            if (p === 0) {
                                              setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'units')));
                                            } else {
                                              const qty = Math.min(Math.max(product.moq, p), product.stock);
                                              setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: qty} : item));
                                            }
                                            setQuantityInputValues(prev => { const s = {...prev}; delete s[product.id]; return s; });
                                            setShowMOQWarnings(prev => ({...prev, [product.id]: false}));
                                            setShowQuantityHints(prev => ({...prev, [product.id]: false}));
                                            setActiveQuantityInput(null);
                                          }}
                                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                          min={0} max={product.stock}
                                          className={`w-14 h-8 text-center rounded-lg text-sm ${showMOQWarnings[product.id] ? 'border-amber-400 bg-amber-50' : activeQuantityInput === product.id ? 'border-blue-400 bg-blue-50' : ''}`}
                                          placeholder={product.moq.toString()}
                                        />
                                        {showMOQWarnings[product.id] && (
                                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-amber-100 border border-amber-300 rounded-md px-2 py-1 text-xs text-amber-800 whitespace-nowrap shadow-sm">
                                            Min: {product.moq} units
                                            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-amber-100 border-l border-t border-amber-300 rotate-45"></div>
                                          </div>
                                        )}
                                        {showQuantityHints[product.id] && activeQuantityInput === product.id && (
                                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg p-2 min-w-[200px]">
                                            <div className="text-xs text-gray-600 mb-2 font-medium">Quick Add:</div>
                                            <div className="grid grid-cols-3 gap-1">
                                              {getQuantitySuggestions(product, cartItemUnits.quantity).map((suggestion, index) => (
                                                <button key={index} onClick={(e) => {
                                                  e.preventDefault(); e.stopPropagation();
                                                  setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: suggestion.value} : item));
                                                  setShowQuantityHints(prev => ({...prev, [product.id]: false}));
                                                  setActiveQuantityInput(null);
                                                }} className={`text-xs px-2 py-1 rounded border text-center hover:bg-gray-50 ${suggestion.type === 'moq' ? 'border-blue-300 text-blue-700 bg-blue-50' : suggestion.type === 'bulk' ? 'text-white border-0' : 'border-gray-300 text-gray-700'}`} style={suggestion.type === 'bulk' ? {backgroundColor: 'var(--theme-primary)'} : {}} title={suggestion.description}>
                                                  {suggestion.label}
                                                </button>
                                              ))}
                                            </div>
                                            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white border-l border-t border-gray-200 rotate-45"></div>
                                          </div>
                                        )}
                                      </div>
                                      <Button size="sm" variant="outline" onClick={() => setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: item.quantity + 1} : item))} className="rounded-full h-8 w-8 p-0">
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* Pallets stepper */}
                                {cartItemPallets && hasPalletPricing && (
                                  <div>
                                    {cartItemUnits && <p className="text-xs font-medium text-blue-700 text-center mb-1">🚛 Pallets</p>}
                                    <div className="flex items-center justify-center gap-2">
                                      <Button size="sm" variant="outline" onClick={() => {
                                        const palMoq = (product as any).palletMoq || 1;
                                        if (cartItemPallets.quantity <= palMoq) {
                                          setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'pallets')));
                                        } else {
                                          setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: item.quantity - 1} : item));
                                        }
                                      }} className="rounded-full h-8 w-8 p-0">
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <Input type="number"
                                        value={quantityInputValues[`${product.id}_pal`] !== undefined ? quantityInputValues[`${product.id}_pal`] : cartItemPallets.quantity}
                                        onChange={(e) => { setQuantityInputValues(prev => ({...prev, [`${product.id}_pal`]: e.target.value})); }}
                                        onBlur={() => {
                                          const v = quantityInputValues[`${product.id}_pal`];
                                          const p = parseInt(v) || 0;
                                          const palMoq = (product as any).palletMoq || 1;
                                          if (p === 0) {
                                            setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'pallets')));
                                          } else {
                                            const palStock = (product as any).palletStock || 0;
                                            const qty = Math.min(Math.max(palMoq, p), palStock || p);
                                            setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: qty} : item));
                                          }
                                          setQuantityInputValues(prev => { const s = {...prev}; delete s[`${product.id}_pal`]; return s; });
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                        min={1}
                                        className="w-14 h-8 text-center rounded-lg text-sm"
                                        placeholder={((product as any).palletMoq || 1).toString()}
                                      />
                                      <Button size="sm" variant="outline" onClick={() => setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: item.quantity + 1} : item))} className="rounded-full h-8 w-8 p-0">
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* Secondary "Also add" buttons */}
                                {cartItemUnits && !cartItemPallets && hasPalletPricing && (
                                  <button onClick={() => addToCart(product, (product as any).palletMoq || 1, 'pallets')} className="w-full text-xs py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors">
                                    + Also Add Pallets
                                  </button>
                                )}
                                {cartItemPallets && !cartItemUnits && (
                                  <button onClick={() => addToCart(product, product.moq || 1, 'units')} className="w-full text-xs py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors">
                                    + Also Add Units
                                  </button>
                                )}

                                {/* Initial add button */}
                                {!cartItemUnits && !cartItemPallets && (
                                  <div>
                                    <Button
                                      onClick={() => {
                                        if (hasPalletPricing) {
                                          setSelectedProductForModal(product);
                                          setModalStep('type');
                                          setSelectedModalType(null);
                                          setModalQuantity(product.moq || 1);
                                          setShowUnitSelectionModal(true);
                                        } else {
                                          addToCart(product, product.moq, 'units');
                                        }
                                      }}
                                      disabled={product.stock === 0 && ((product as any).palletStock || 0) === 0}
                                      className="w-full rounded-xl font-semibold text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
                                      style={{background: (product.stock === 0 && ((product as any).palletStock || 0) === 0) ? 'rgb(156, 163, 175)' : 'var(--theme-primary)'}}
                                    >
                                      <ShoppingCart className="h-4 w-4 mr-2" />
                                      {(product.stock === 0 && ((product as any).palletStock || 0) === 0) ? 'Out of Stock' : hasPalletPricing ? 'Add to Cart →' : 'Add to Cart'}
                                    </Button>
                                    {hasPalletPricing && product.stock > 0 && (
                                      <p className="text-xs text-gray-500 text-center mt-1">Choose type: units or pallets</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        // List View
                        <Card key={product.id} className="group rounded-xl border border-gray-100 hover:shadow-md bg-white transition-all">
                          <CardContent className="p-3 sm:p-4">
                            <div className="flex gap-3 sm:gap-4">
                              {/* Product Image Gallery */}
                              <div className="relative w-24 h-24 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-gray-100">
                                {(() => {
                                  // Get all available images (primary imageUrl + additional images array)
                                  const allImages = [
                                    ...(product.imageUrl ? [product.imageUrl] : []),
                                    ...((product as any).images || []).filter((img: string) => img !== product.imageUrl)
                                  ].filter(Boolean);
                                  
                                  const currentImageIndex = productImageIndexes[product.id] || 0;
                                  
                                  if (allImages.length === 0) {
                                    return (
                                      <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                        <Package className="w-8 h-8 text-gray-300" />
                                      </div>
                                    );
                                  }
                                  
                                  if (allImages.length === 1) {
                                    return (
                                      <img 
                                        src={allImages[0]} 
                                        alt={product.name}
                                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200 p-1"
                                      />
                                    );
                                  }
                                  
                                  // Multiple images - show carousel with indicators
                                  return (
                                    <div
                                      className="relative w-full h-full"
                                      onTouchStart={(e) => { carouselTouchStartX.current = e.touches[0].clientX; }}
                                      onTouchEnd={(e) => {
                                        const diff = carouselTouchStartX.current - e.changedTouches[0].clientX;
                                        if (Math.abs(diff) >= 40) {
                                          setProductImageIndexes(prev => ({
                                            ...prev,
                                            [product.id]: diff > 0
                                              ? (currentImageIndex === allImages.length - 1 ? 0 : currentImageIndex + 1)
                                              : (currentImageIndex === 0 ? allImages.length - 1 : currentImageIndex - 1)
                                          }));
                                        }
                                      }}
                                    >
                                      <img 
                                        src={allImages[currentImageIndex]} 
                                        alt={`${product.name} - Image ${currentImageIndex + 1}`}
                                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200 p-1"
                                      />
                                      
                                      {/* Small Navigation Arrows */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setProductImageIndexes(prev => ({
                                            ...prev,
                                            [product.id]: currentImageIndex === 0 ? allImages.length - 1 : currentImageIndex - 1
                                          }));
                                        }}
                                        className="absolute left-0.5 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-0.5 transition-opacity opacity-0 group-hover:opacity-100"
                                      >
                                        <ArrowLeft className="w-2 h-2" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setProductImageIndexes(prev => ({
                                            ...prev,
                                            [product.id]: currentImageIndex === allImages.length - 1 ? 0 : currentImageIndex + 1
                                          }));
                                        }}
                                        className="absolute right-0.5 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-0.5 transition-opacity opacity-0 group-hover:opacity-100"
                                      >
                                        <ArrowRight className="w-2 h-2" />
                                      </button>
                                      
                                      {/* Multiple Images Badge */}
                                      <div className="absolute top-0.5 right-0.5 bg-black bg-opacity-70 text-white text-xs px-1 py-0 rounded-full leading-none" style={{fontSize: '0.625rem'}}>
                                        {currentImageIndex + 1}/{allImages.length}
                                      </div>
                                    </div>
                                  );
                                })()}
                                
                                {/* Promo Badge */}
                                {pricing.promoLabel && (
                                  <div className="absolute top-1 left-1">
                                    <Badge className={`text-xs px-1 py-0 text-white ${pricing.promoType === 'clearance' ? 'bg-orange-500' : pricing.promoType === 'buy_x_get_y_free' ? 'bg-purple-500' : pricing.promoType === 'bundle_deal' ? 'bg-blue-500' : 'bg-red-500'}`}>
                                      {pricing.promoLabel}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                              
                              {/* Product Info */}
                              <div className="flex flex-col flex-1 py-1 min-w-0">
                                <div>
                                  <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 mb-1">
                                    {product.name}
                                  </h3>
                                  {product.description && (
                                    <p className="text-xs text-gray-500 line-clamp-1">
                                      {cleanAIDescription(product.description)}
                                    </p>
                                  )}
                                </div>
                                
                                {/* Product Details */}
                                <div className="mb-2">
                                  <div className="flex flex-wrap gap-1 text-xs text-gray-600">
                                    {/* Product Weight/Size Tag */}
                                    {(() => {
                                      const packQuantity = (product as any).packQuantity || 1;
                                      const unitSize = (product as any).unitSize;
                                      const unitOfMeasure = (product as any).unitOfMeasure;
                                      
                                      if (unitSize && unitOfMeasure) {
                                        return (
                                          <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">
                                            {packQuantity} x {Math.round(parseFloat(unitSize))}{unitOfMeasure}
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                    
                                    {/* Product Type Tags - Units or Pallets or Both */}
                                    {(product.palletPrice && parseFloat(product.palletPrice.toString()) > 0) ? (
                                      <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-medium">
                                        Units & Pallets
                                      </span>
                                    ) : (
                                      <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">
                                        Individual Units
                                      </span>
                                    )}
                                    
                                    {(product as any).size && (
                                      <span className="bg-gray-100 px-2 py-0.5 rounded">
                                        Size: {(product as any).size}
                                      </span>
                                    )}
                                    {product.moq && product.moq > 1 && (
                                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium" title={`Minimum order: ${product.moq} units required`}>
                                        Min: {product.moq} units
                                      </span>
                                    )}
                                    {product.stock && (
                                      <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                        Stock: {product.stock}
                                      </span>
                                    )}
                                    {(product as any).brand && (
                                      <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                                        {(product as any).brand}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Price */}
                                <div className="mt-1.5">
                                  <PriceDisplay
                                    price={pricing.effectivePrice}
                                    originalPrice={pricing.effectivePrice !== pricing.originalPrice ? pricing.originalPrice : undefined}
                                    currency={wholesaler?.defaultCurrency || 'GBP'}
                                    isGuestMode={isTrueGuestMode}
                                    size="medium"
                                    showStrikethrough={true}
                                  />
                                  {hasPalletPricing && !cartItemUnits && !cartItemPallets && (
                                    <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                                      <span>🚛</span>
                                      <span>Pallet: £{parseFloat((product as any).palletPrice?.toString() || '0').toFixed(2)} / pallet — Min {(product as any).palletMoq || 1}</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Add to Cart Controls — pinned top-right */}
                              <div className="flex-shrink-0 self-start flex flex-col items-end pt-1">
                                <div className="space-y-2">
                                  {/* Type badge + Change link (single type in cart) */}
                                  {hasPalletPricing && (cartItemUnits || cartItemPallets) && !(cartItemUnits && cartItemPallets) && (
                                    <div className="flex items-center justify-between">
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cartItemUnits ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {cartItemUnits ? '📦 Units ✓' : '🚛 Pallets ✓'}
                                      </span>
                                      <button
                                        onClick={() => {
                                          setCart(cart.filter(item => item.product.id !== product.id));
                                          setSelectedProductForModal(product);
                                          setModalStep('type');
                                          setSelectedModalType(null);
                                          setModalQuantity(product.moq || 1);
                                          setShowUnitSelectionModal(true);
                                        }}
                                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                                      >
                                        Change type
                                      </button>
                                    </div>
                                  )}
                                  {/* Units stepper */}
                                  {cartItemUnits && (
                                    <div className="flex flex-col items-end">
                                      {cartItemPallets && <p className="text-xs font-medium text-emerald-700 mb-1">📦 Units</p>}
                                      <div className="flex items-center gap-2">
                                        <Button size="sm" variant="outline" onClick={() => {
                                          if (cartItemUnits.quantity <= product.moq) {
                                            setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'units')));
                                          } else {
                                            setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: item.quantity - 1} : item));
                                          }
                                        }} className="rounded-full h-8 w-8 p-0">
                                          <Minus className="h-3 w-3" />
                                        </Button>
                                        <div className="relative">
                                          <Input
                                            type="number"
                                            value={quantityInputValues[product.id] !== undefined ? quantityInputValues[product.id] : cartItemUnits.quantity}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              setQuantityInputValues(prev => ({...prev, [product.id]: v}));
                                              const p = parseInt(v) || 0;
                                              setShowMOQWarnings(prev => ({...prev, [product.id]: p > 0 && p < product.moq}));
                                            }}
                                            onFocus={() => { setActiveQuantityInput(product.id); setShowQuantityHints(prev => ({...prev, [product.id]: true})); }}
                                            onBlur={() => {
                                              const v = quantityInputValues[product.id];
                                              const p = parseInt(v) || 0;
                                              if (p === 0) {
                                                setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'units')));
                                              } else {
                                                const qty = Math.min(Math.max(product.moq, p), product.stock);
                                                setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: qty} : item));
                                              }
                                              setQuantityInputValues(prev => { const s = {...prev}; delete s[product.id]; return s; });
                                              setShowMOQWarnings(prev => ({...prev, [product.id]: false}));
                                              setShowQuantityHints(prev => ({...prev, [product.id]: false}));
                                              setActiveQuantityInput(null);
                                            }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                            min={0} max={product.stock}
                                            className={`w-14 h-8 text-center rounded-lg text-sm ${showMOQWarnings[product.id] ? 'border-amber-400 bg-amber-50' : activeQuantityInput === product.id ? 'border-blue-400 bg-blue-50' : ''}`}
                                            placeholder={product.moq.toString()}
                                          />
                                          {showMOQWarnings[product.id] && (
                                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-amber-100 border border-amber-300 rounded-md px-2 py-1 text-xs text-amber-800 whitespace-nowrap shadow-sm">
                                              Min: {product.moq} units
                                              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-amber-100 border-l border-t border-amber-300 rotate-45"></div>
                                            </div>
                                          )}
                                          {showQuantityHints[product.id] && activeQuantityInput === product.id && (
                                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg p-2 min-w-[200px]">
                                              <div className="text-xs text-gray-600 mb-2 font-medium">Quick Add:</div>
                                              <div className="grid grid-cols-3 gap-1">
                                                {getQuantitySuggestions(product, cartItemUnits.quantity).map((suggestion, index) => (
                                                  <button key={index} onClick={(e) => {
                                                    e.preventDefault(); e.stopPropagation();
                                                    setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: suggestion.value} : item));
                                                    setShowQuantityHints(prev => ({...prev, [product.id]: false}));
                                                    setActiveQuantityInput(null);
                                                  }} className={`text-xs px-2 py-1 rounded border text-center hover:bg-gray-50 ${suggestion.type === 'moq' ? 'border-blue-300 text-blue-700 bg-blue-50' : suggestion.type === 'bulk' ? 'text-white border-0' : 'border-gray-300 text-gray-700'}`} style={suggestion.type === 'bulk' ? {backgroundColor: 'var(--theme-primary)'} : {}} title={suggestion.description}>
                                                    {suggestion.label}
                                                  </button>
                                                ))}
                                              </div>
                                              <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white border-l border-t border-gray-200 rotate-45"></div>
                                            </div>
                                          )}
                                        </div>
                                        <Button size="sm" variant="outline" onClick={() => setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: item.quantity + 1} : item))} className="rounded-full h-8 w-8 p-0">
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </div>
                                      {cartItemUnits && <div className="text-xs text-gray-500 mt-1">Total: <PriceDisplay price={pricing.effectivePrice * cartItemUnits.quantity} currency={wholesaler?.defaultCurrency || 'GBP'} isGuestMode={false} size="small" /></div>}
                                    </div>
                                  )}

                                  {/* Pallets stepper */}
                                  {cartItemPallets && hasPalletPricing && (
                                    <div className="flex flex-col items-end">
                                      {cartItemUnits && <p className="text-xs font-medium text-blue-700 mb-1">🚛 Pallets</p>}
                                      <div className="flex items-center gap-2">
                                        <Button size="sm" variant="outline" onClick={() => {
                                          const palMoq = (product as any).palletMoq || 1;
                                          if (cartItemPallets.quantity <= palMoq) {
                                            setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'pallets')));
                                          } else {
                                            setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: item.quantity - 1} : item));
                                          }
                                        }} className="rounded-full h-8 w-8 p-0">
                                          <Minus className="h-3 w-3" />
                                        </Button>
                                        <Input type="number"
                                          value={quantityInputValues[`${product.id}_pal`] !== undefined ? quantityInputValues[`${product.id}_pal`] : cartItemPallets.quantity}
                                          onChange={(e) => { setQuantityInputValues(prev => ({...prev, [`${product.id}_pal`]: e.target.value})); }}
                                          onBlur={() => {
                                            const v = quantityInputValues[`${product.id}_pal`];
                                            const p = parseInt(v) || 0;
                                            const palMoq = (product as any).palletMoq || 1;
                                            if (p === 0) {
                                              setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'pallets')));
                                            } else {
                                              const palStock = (product as any).palletStock || 0;
                                              const qty = Math.min(Math.max(palMoq, p), palStock || p);
                                              setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: qty} : item));
                                            }
                                            setQuantityInputValues(prev => { const s = {...prev}; delete s[`${product.id}_pal`]; return s; });
                                          }}
                                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                          min={1}
                                          className="w-14 h-8 text-center rounded-lg text-sm"
                                          placeholder={((product as any).palletMoq || 1).toString()}
                                        />
                                        <Button size="sm" variant="outline" onClick={() => setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: item.quantity + 1} : item))} className="rounded-full h-8 w-8 p-0">
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </div>
                                      <div className="text-xs text-gray-500 mt-1">Total: <PriceDisplay price={parseFloat((product as any).palletPrice?.toString() || '0') * cartItemPallets.quantity} currency={wholesaler?.defaultCurrency || 'GBP'} isGuestMode={false} size="small" /> <span className="ml-1">({cartItemPallets.quantity} pallet{cartItemPallets.quantity > 1 ? 's' : ''} × {(product as any).unitsPerPallet} units)</span></div>
                                    </div>
                                  )}

                                  {/* Secondary "Also add" buttons */}
                                  {cartItemUnits && !cartItemPallets && hasPalletPricing && (
                                    <button onClick={() => addToCart(product, (product as any).palletMoq || 1, 'pallets')} className="w-full text-xs py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors">
                                      + Also Add Pallets
                                    </button>
                                  )}
                                  {cartItemPallets && !cartItemUnits && (
                                    <button onClick={() => addToCart(product, product.moq || 1, 'units')} className="w-full text-xs py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors">
                                      + Also Add Units
                                    </button>
                                  )}

                                  {/* Initial add button */}
                                  {!cartItemUnits && !cartItemPallets && (
                                    <div className="flex flex-col items-center gap-1">
                                      {(() => {
                                        const isOutOfStock = product.stock === 0 && ((product as any).palletStock || 0) === 0;
                                        const handleAdd = () => {
                                          if (hasPalletPricing) {
                                            setSelectedProductForModal(product);
                                            setModalStep('type');
                                            setSelectedModalType(null);
                                            setModalQuantity(product.moq || 1);
                                            setShowUnitSelectionModal(true);
                                          } else {
                                            addToCart(product, product.moq || 1, 'units');
                                          }
                                        };
                                        return (
                                          <>
                                            {/* Mobile: compact "+" circle */}
                                            <button
                                              onClick={handleAdd}
                                              disabled={isOutOfStock}
                                              className="sm:hidden w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-bold disabled:cursor-not-allowed flex-shrink-0"
                                              style={{background: isOutOfStock ? 'rgb(156, 163, 175)' : 'var(--theme-primary)'}}
                                              aria-label={isOutOfStock ? 'Out of stock' : 'Add to cart'}
                                            >
                                              <Plus className="h-5 w-5" />
                                            </button>
                                            {/* Desktop: full button */}
                                            <Button
                                              onClick={handleAdd}
                                              disabled={isOutOfStock}
                                              size="sm"
                                              className="hidden sm:flex rounded-xl font-semibold text-white disabled:bg-gray-400 disabled:cursor-not-allowed px-4"
                                              style={{background: isOutOfStock ? 'rgb(156, 163, 175)' : 'var(--theme-primary)'}}
                                            >
                                              <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                                              {isOutOfStock ? 'Out of Stock' : hasPalletPricing ? 'Add to Cart →' : 'Add to Cart'}
                                            </Button>
                                          </>
                                        );
                                      })()}
                                      {hasPalletPricing && product.stock > 0 && (
                                        <p className="text-xs text-gray-500 text-center">units or pallets</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="orders" className="space-y-6 pb-6">
              {/* Quick Actions strip */}
              <div className="flex items-center justify-around px-1 py-1">
                <button onClick={() => setActiveTab("products")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><Store className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Shop</span>
                </button>
                <button onClick={() => setActiveTab("orders")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><History className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Orders</span>
                </button>
                <button onClick={async () => { if (cart.length > 0) { setShowCheckout(true); } else { setActiveTab("products"); } }} disabled={isCreatingIntent} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 relative">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary relative">
                    <ShoppingCart className="w-4 h-4 text-theme-primary" />
                    {cart.length > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center bg-theme-primary">{cart.length}</span>}
                  </div>
                  <span className="text-[10px] font-medium text-gray-600">{cart.length > 0 ? "Checkout" : "Cart"}</span>
                </button>
                <button onClick={handleLogout} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-50"><X className="w-4 h-4 text-red-400" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Sign Out</span>
                </button>
              </div>
              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-2">
                {/* Cart Items */}
                <div
                  className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => { if (!isPreviewMode && cart.length > 0) { setShowCheckout(true); } }}
                >
                  <div className="flex flex-col items-center text-center gap-0.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
                      <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                    </div>
                    <p className="text-lg sm:text-xl font-extrabold leading-none text-theme-primary">
                      {cart.reduce((total, item) => total + item.quantity, 0)}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium">In Cart</p>
                    {cart.length > 0 && (
                      <p className="text-[10px] text-gray-400 leading-none">Tap to checkout</p>
                    )}
                  </div>
                </div>

                {/* Cart Value */}
                <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm">
                  <div className="flex flex-col items-center text-center gap-0.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
                      <Banknote className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                    </div>
                    <div className="font-extrabold leading-none text-theme-primary">
                      <PriceDisplay
                        price={cartStats.totalValue}
                        currency={wholesaler?.defaultCurrency || 'GBP'}
                        isGuestMode={false}
                        size="medium"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium">Cart Total</p>
                  </div>
                </div>

                {/* Total Orders */}
                <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm">
                  <div className="flex flex-col items-center text-center gap-0.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
                      <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                    </div>
                    <p className="text-lg sm:text-xl font-extrabold leading-none text-theme-primary">
                      {customerOrderStats?.totalOrders || 0}
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium">Orders</p>
                  </div>
                </div>
              </div>

              {/* Customer Order History */}
              {authenticatedCustomer && wholesaler?.id && (
                <Suspense fallback={<ComponentLoader />}>
                  <LazyOrderHistory 
                    wholesalerId={wholesaler.id} 
                    customerPhone={authenticatedCustomer.phone || authenticatedCustomer.phoneNumber || '+447507659550'}
                    currency={wholesaler?.defaultCurrency || 'GBP'}
                  />
                </Suspense>
              )}
            </TabsContent>

            <TabsContent value="account" className="space-y-6 pb-6">
              {/* Quick Actions strip */}
              <div className="flex items-center justify-around px-1 py-1">
                <button onClick={() => setActiveTab("products")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><Store className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Shop</span>
                </button>
                <button onClick={() => setActiveTab("orders")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><History className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Orders</span>
                </button>
                <button onClick={async () => { if (cart.length > 0) { setShowCheckout(true); } else { setActiveTab("products"); } }} disabled={isCreatingIntent} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 relative">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary relative">
                    <ShoppingCart className="w-4 h-4 text-theme-primary" />
                    {cart.length > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center bg-theme-primary">{cart.length}</span>}
                  </div>
                  <span className="text-[10px] font-medium text-gray-600">{cart.length > 0 ? "Checkout" : "Cart"}</span>
                </button>
                <button onClick={handleLogout} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-50"><X className="w-4 h-4 text-red-400" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Sign Out</span>
                </button>
              </div>
              {isEnhancedPreviewMode ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
                  <User className="w-12 h-12 mb-4 text-gray-300" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-1">Account Settings</h3>
                  <p className="text-sm text-gray-400">This section is not available in preview mode.<br />Customers manage their details when logged into their own session.</p>
                </div>
              ) : (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">Account Settings</h2>
                
                {/* User Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Profile Information
                      </div>
                      {!isEditingProfile ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={initializeEditForm}
                          className="gap-2"
                        >
                          <Settings className="h-4 w-4" />
                          Edit
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setIsEditingProfile(false)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                          <Button 
                            size="sm"
                            onClick={handleSaveProfile}
                            disabled={updateProfileMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            {updateProfileMutation.isPending ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!isEditingProfile ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium">Name</Label>
                          <div className="mt-1 p-3 bg-gray-50 rounded-md">
                            {customerData.name || 'Not provided'}
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Email</Label>
                          <div className="mt-1 p-3 bg-gray-50 rounded-md">
                            {customerData.email || 'Not provided'}
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Phone</Label>
                          <div className="mt-1 p-3 bg-gray-50 rounded-md">
                            {customerData.phone || 'Not provided'}
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Business</Label>
                          <div className="mt-1 p-3 bg-gray-50 rounded-md">
                            {customerData?.businessName || 'Not provided'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium">Name</Label>
                          <Input
                            value={editedProfile.name}
                            onChange={(e) => setEditedProfile({...editedProfile, name: e.target.value})}
                            placeholder="Enter your name"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Email</Label>
                          <Input
                            value={editedProfile.email}
                            onChange={(e) => setEditedProfile({...editedProfile, email: e.target.value})}
                            placeholder="Enter your email"
                            type="email"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Phone</Label>
                          <Input
                            value={editedProfile.phone}
                            onChange={(e) => setEditedProfile({...editedProfile, phone: e.target.value})}
                            placeholder="Enter your phone"
                            type="tel"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Business Name</Label>
                          <Input
                            value={editedProfile.businessName}
                            onChange={(e) => setEditedProfile({...editedProfile, businessName: e.target.value})}
                            placeholder="Enter business name"
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Delivery Addresses */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Delivery Addresses
                    </CardTitle>
                    <p className="text-sm text-gray-600">
                      Manage your delivery addresses for faster checkout
                    </p>
                  </CardHeader>
                  <CardContent>
                    {wholesaler?.id && (
                      <DeliveryAddressManager
                        wholesalerId={wholesaler.id}
                        showAddButton={true}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Theme Preferences */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Palette className="h-5 w-5" />
                      Theme Preferences
                    </CardTitle>
                    <p className="text-sm text-gray-600">
                      Customize your shopping experience with different color themes
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ThemeSwitcher />
                  </CardContent>
                </Card>

                {/* Quick Stats */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Your Shopping Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <div className="text-2xl font-bold text-theme-primary">
                          {customerOrderStats?.totalOrders || 0}
                        </div>
                        <div className="text-sm text-gray-600">Total Orders</div>
                      </div>
                      <div className="text-center p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <div className="text-2xl font-bold text-theme-primary">
                          {formatCurrency(customerOrderStats?.totalSpent || 0, wholesaler?.defaultCurrency || 'GBP')}
                        </div>
                        <div className="text-sm text-gray-600">Total Spent</div>
                      </div>
                      <div className="text-center p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <div className="text-2xl font-bold text-theme-primary">{cart.length}</div>
                        <div className="text-sm text-gray-600">Items in Cart</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Support Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HelpCircle className="h-5 w-5" />
                      Need Help?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">Email: {wholesaler?.email || 'hello@quikpik.co'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">Phone: {wholesaler?.businessPhone || wholesaler?.phoneNumber}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Building className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">Business: {wholesaler?.businessName || 'Surulere Foods Wholesale'}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
              )}
            </TabsContent>

            <TabsContent value="help" className="pb-6">
              {/* Quick Actions strip */}
              <div className="flex items-center justify-around px-1 py-1">
                <button onClick={() => setActiveTab("products")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><Store className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Shop</span>
                </button>
                <button onClick={() => setActiveTab("orders")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><History className="w-4 h-4 text-theme-primary" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Orders</span>
                </button>
                <button onClick={async () => { if (cart.length > 0) { setShowCheckout(true); } else { setActiveTab("products"); } }} disabled={isCreatingIntent} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 relative">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary relative">
                    <ShoppingCart className="w-4 h-4 text-theme-primary" />
                    {cart.length > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center bg-theme-primary">{cart.length}</span>}
                  </div>
                  <span className="text-[10px] font-medium text-gray-600">{cart.length > 0 ? "Checkout" : "Cart"}</span>
                </button>
                <button onClick={handleLogout} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-50"><X className="w-4 h-4 text-red-400" /></div>
                  <span className="text-[10px] font-medium text-gray-600">Sign Out</span>
                </button>
              </div>
              <CustomerHelp wholesaler={wholesaler ? {
                businessName: wholesaler.businessName,
                phoneNumber: wholesaler.phoneNumber,
                businessPhone: wholesaler.businessPhone,
                email: wholesaler.email,
              } : undefined} />
            </TabsContent>
          </Tabs>
        )}

        {/* Checkout Modal Dialog */}
        <Dialog open={showCheckout} onOpenChange={(open) => { setShowCheckout(open); if (!open) setPayLaterMode(false); }}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Complete Your Order</DialogTitle>
              <DialogDescription>
                Review your items and complete your purchase
              </DialogDescription>
            </DialogHeader>
            
            {cart.length > 0 && wholesaler && (
              <div className="space-y-6">
                {/* Order Summary with Fee Breakdown */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3">Order Summary</h3>
                  <div className="space-y-3">
                    {cart.map((item, index) => {
                      let itemPrice;
                      let totalCost;
                      let cartPricing: any = null;
                      
                      if (item.sellingType === 'pallets') {
                        itemPrice = parseFloat((item.product as any).palletPrice?.toString() || '0');
                        totalCost = itemPrice * item.quantity;
                      } else {
                        cartPricing = calculatePromotionalPricing(item.product, item.quantity);
                        itemPrice = cartPricing.effectivePrice;
                        totalCost = cartPricing.totalCost;
                      }

                      const moq = item.sellingType === 'pallets' ? ((item.product as any).palletMoq || 1) : (item.product.moq || 1);
                      const availableStock = item.sellingType === 'pallets'
                        ? ((item.product as any).palletStock || 999)
                        : (item.product.stock || 999);
                      const eqKey = `${item.product.id}_${item.sellingType}`;
                      const currentEditVal = editableQuantities[eqKey] ?? String(item.quantity);

                      const commitQty = (rawVal: string) => {
                        const parsed = parseInt(rawVal, 10);
                        const clamped = isNaN(parsed) || parsed < moq ? moq : Math.min(parsed, availableStock);
                        setEditableQuantities(prev => ({ ...prev, [eqKey]: String(clamped) }));
                        setCart(cart.map(c => c.product.id === item.product.id && c.sellingType === item.sellingType ? { ...c, quantity: clamped } : c));
                      };

                      const handleShare = async () => {
                        const shareText = `${item.product.name} — £${itemPrice.toFixed(2)}/${item.sellingType === 'pallets' ? 'pallet' : 'unit'}`;
                        if (navigator.share) {
                          try { await navigator.share({ title: item.product.name, text: shareText, url: window.location.href }); } catch {}
                        } else {
                          await navigator.clipboard.writeText(`${shareText} — ${window.location.href}`);
                          toast({ title: "Link copied!", description: "Product link copied to clipboard." });
                        }
                      };
                      
                      return (
                        <div key={index} className="bg-white rounded-lg border border-gray-200 p-3">
                          {/* Row: image + details + price */}
                          <div className="flex gap-3">
                            {/* Product thumbnail */}
                            <div className="flex-shrink-0">
                              {(item.product.imageUrl || (item.product as any).images?.[0]) ? (
                                <img
                                  src={item.product.imageUrl || (item.product as any).images?.[0]}
                                  alt={item.product.name}
                                  className="w-16 h-16 object-cover rounded-md border border-gray-100"
                                />
                              ) : (
                                <div className="w-16 h-16 bg-gray-100 rounded-md flex items-center justify-center">
                                  <Package className="h-7 w-7 text-gray-400" />
                                </div>
                              )}
                            </div>

                            {/* Name, badges, price */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-sm leading-snug">{item.product.name}</p>
                                <div className="text-right flex-shrink-0">
                                  {cartPricing && cartPricing.effectivePrice !== cartPricing.originalPrice && (
                                    <div className="text-xs text-gray-400 line-through">
                                      £{(cartPricing.originalPrice * item.quantity).toFixed(2)}
                                    </div>
                                  )}
                                  <PriceDisplay
                                    price={totalCost}
                                    currency={wholesaler?.defaultCurrency || 'GBP'}
                                    isGuestMode={false}
                                    size="small"
                                  />
                                </div>
                              </div>

                              {/* Type + promo badges */}
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.sellingType === 'pallets' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {item.sellingType === 'pallets' ? 'Pallets' : 'Units'}
                                </span>
                                {cartPricing && cartPricing.promoLabel && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                                    {cartPricing.promoLabel}
                                  </span>
                                )}
                                {cartPricing && cartPricing.appliedOffers?.length > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                    🎁 {cartPricing.appliedOffers[0]}
                                  </span>
                                )}
                                {cartPricing && cartPricing.freeItems > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                    +{cartPricing.freeItems} free
                                  </span>
                                )}
                                {item.sellingType === 'pallets' && (
                                  <span className="text-xs text-gray-500">
                                    ({item.quantity * ((item.product as any).unitsPerPallet || 1)} units total)
                                  </span>
                                )}
                              </div>

                              {/* Unit price line */}
                              <p className="text-xs text-gray-500 mt-1">
                                £{itemPrice.toFixed(2)} / {item.sellingType === 'pallets' ? 'pallet' : 'unit'}
                                {cartPricing && cartPricing.effectivePrice !== cartPricing.originalPrice && (
                                  <span className="ml-1 text-gray-400 line-through">£{cartPricing.originalPrice.toFixed(2)}</span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Controls row: qty stepper + Delete + Share */}
                          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                            {/* − qty + */}
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  if (item.quantity <= moq) {
                                    setCart(cart.filter(c => !(c.product.id === item.product.id && c.sellingType === item.sellingType)));
                                  } else {
                                    const next = item.quantity - 1;
                                    setEditableQuantities(prev => ({ ...prev, [eqKey]: String(next) }));
                                    setCart(cart.map(c => c.product.id === item.product.id && c.sellingType === item.sellingType ? { ...c, quantity: next } : c));
                                  }
                                }}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <input
                                type="number"
                                value={currentEditVal}
                                onChange={e => setEditableQuantities(prev => ({ ...prev, [item.product.id]: e.target.value }))}
                                onBlur={e => commitQty(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitQty((e.target as HTMLInputElement).value); }}
                                className="w-14 text-center border border-gray-300 rounded px-1 py-0.5 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  const next = Math.min(item.quantity + 1, availableStock);
                                  setEditableQuantities(prev => ({ ...prev, [eqKey]: String(next) }));
                                  setCart(cart.map(c => c.product.id === item.product.id && c.sellingType === item.sellingType ? { ...c, quantity: next } : c));
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>

                            {/* Delete */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 h-7 text-xs px-2"
                              onClick={() => setCart(cart.filter(c => !(c.product.id === item.product.id && c.sellingType === item.sellingType)))}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>

                            {/* Share */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2"
                              onClick={handleShare}
                            >
                              <Share2 className="h-3 w-3 mr-1" />
                              Share
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    <Separator />
                    
                    {/* Breakdown of charges */}
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Product Subtotal</span>
                        <PriceDisplay
                          price={cartStats.subtotal}
                          currency={wholesaler?.defaultCurrency || 'GBP'}
                          isGuestMode={false}
                          size="small"
                        />
                      </div>
                      
                      {customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate && parseFloat(wholesaler.deliveryFlatRate) > 0 && (
                      <div className="flex justify-between text-blue-700">
                        <span>Delivery</span>
                        <PriceDisplay
                          price={parseFloat(wholesaler.deliveryFlatRate)}
                          currency={wholesaler?.defaultCurrency || 'GBP'}
                          isGuestMode={false}
                          size="small"
                        />
                      </div>
                      )}
                      
                      <div className="flex justify-between text-gray-600">
                        <span>Transaction Fee (5.5% + £0.50)</span>
                        <PriceDisplay
                          price={(() => {
                            const subtotal = cartStats.subtotal;
                            const shipping = customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                            const beforeFees = subtotal + shipping;
                            return (beforeFees * 0.055) + 0.50;
                          })()}
                          currency={wholesaler?.defaultCurrency || 'GBP'}
                          isGuestMode={false}
                          size="small"
                        />
                      </div>
                    </div>
                    
                    <Separator />
                    <div className="flex justify-between items-center font-semibold text-lg">
                      <span>Total to Pay</span>
                      <PriceDisplay
                        price={(() => {
                          const subtotal = cartStats.subtotal;
                          const shipping = customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                          const beforeFees = subtotal + shipping;
                          const transactionFee = (beforeFees * 0.055) + 0.50;
                          return beforeFees + transactionFee;
                        })()}
                        currency={wholesaler?.defaultCurrency || 'GBP'}
                        isGuestMode={false}
                        size="medium"
                      />
                    </div>
                  </div>
                  
                  {/* Transaction Fee Notice */}
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start">
                      <svg className="w-4 h-4 text-blue-600 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <div className="text-sm text-blue-800">
                        <p className="font-medium">Payment Processing Fee</p>
                        <p>A transaction fee of 5.5% + £0.50 is applied to cover secure payment processing and platform services.</p>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Note from Wholesaler */}
                  {wholesaler?.deliveryNote && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM3 4h14l-1.68 8.39A2 2 0 0113.35 14H6.65a2 2 0 01-1.97-1.61L3 4z" />
                        </svg>
                        <div className="text-sm text-amber-800">
                          <p className="font-medium mb-0.5">Delivery Information</p>
                          <p>{wholesaler.deliveryNote}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Customer Information Form */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Customer Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="customer-name">Full Name</Label>
                      <Input
                        id="customer-name"
                        value={customerData.name}
                        onChange={(e) => setCustomerData(prev => ({...prev, name: e.target.value}))}
                        placeholder="Enter your full name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer-email">Email</Label>
                      <Input
                        id="customer-email"
                        type="email"
                        value={customerData.email}
                        onChange={(e) => setCustomerData(prev => ({...prev, email: e.target.value}))}
                        placeholder="Enter your email"
                      />
                    </div>
                    <div>
                      <Label htmlFor="customer-phone">Phone</Label>
                      <Input
                        id="customer-phone"
                        value={customerData.phone}
                        onChange={(e) => setCustomerData(prev => ({...prev, phone: e.target.value}))}
                        placeholder="Enter your phone number"
                      />
                    </div>
                  </div>
                </div>

                {/* Shipping Options */}
                <div className="space-y-4">
                  <h3 className="font-semibold">
                    Delivery Options 
                    {!customerData.shippingOption && (
                      <span className="text-red-500 ml-2 text-sm">*Required</span>
                    )}
                  </h3>
                  <div className="space-y-3">
                    <div className={`flex items-center space-x-2 p-2 rounded-lg border-2 transition-colors ${customerData.shippingOption === 'pickup' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                      <input
                        type="radio"
                        id="pickup"
                        name="shipping"
                        value="pickup"
                        checked={customerData.shippingOption === 'pickup'}
                        onChange={async () => {
                          console.log('🚚 PICKUP RADIO: User clicked pickup option');
                          console.log('🚚 DEBUG: Current shippingOption before change:', customerData.shippingOption);
                          
                          try {
                            // First, update the state immediately
                            setCustomerData(prev => {
                              console.log('🚚 STATE UPDATE: Setting shippingOption to pickup');
                              return {...prev, shippingOption: 'pickup'};
                            });
                            
                            // Then save to backend if authenticated
                            if (authenticatedCustomer?.id) {
                              console.log('🚚 BACKEND SAVE: Saving pickup choice for authenticated user');
                              const response = await apiRequest("POST", "/api/customer/shipping-choice", {
                                customerId: authenticatedCustomer.id,
                                shippingChoice: 'pickup'
                              });
                              if (response.ok) {
                                console.log('🚚 SUCCESS: Pickup choice saved to backend');
                              } else {
                                console.error('🚚 ERROR: Failed to save pickup choice to backend');
                              }
                            } else {
                              console.log('🚚 GUEST USER: No backend save needed');
                            }
                            
                            // Create payment intent after successful state update
                            console.log('🚚 PAYMENT INTENT: Creating for pickup option');
                            await createPaymentIntentForCheckout('pickup');
                            
                          } catch (error) {
                            console.error('🚚 PICKUP SELECTION ERROR:', error);
                          }
                        }}
                        className="w-4 h-4 text-emerald-600"
                      />
                      <Label htmlFor="pickup" className="flex-1 cursor-pointer">
                        <div className="flex justify-between">
                          <span>Pickup from store</span>
                          <span className="text-green-600 font-medium">FREE</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {wholesaler?.pickupAddress || wholesaler?.businessAddress || 
                           (wholesaler?.streetAddress && wholesaler?.city 
                             ? `${wholesaler.streetAddress}, ${wholesaler.city}${wholesaler.postalCode ? `, ${wholesaler.postalCode}` : ''}`
                             : 'Collect your order from our location')}
                        </p>
                        {wholesaler?.pickupInstructions && (
                          <p className="text-xs text-gray-500 mt-1">{wholesaler.pickupInstructions}</p>
                        )}
                      </Label>
                    </div>
                    {(wholesaler?.enableDelivery !== false) && (
                    <div className={`flex items-center space-x-2 p-2 rounded-lg border-2 transition-colors ${customerData.shippingOption === 'delivery' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                      <input
                        type="radio"
                        id="delivery"
                        name="shipping"
                        value="delivery"
                        checked={customerData.shippingOption === 'delivery'}
                        onChange={async () => {
                          console.log('🚚 DELIVERY RADIO: User clicked delivery option');
                          
                          // STEP 1: Update shipping option to delivery (no payment intent yet)
                          setCustomerData(prev => ({
                            ...prev, 
                            shippingOption: 'delivery',
                            // Clear any existing payment intent to force recreation with address
                            clientSecret: null
                          }));
                          
                          // STEP 2: Clear any existing payment intent to start fresh
                          setClientSecret('');
                          
                          // STEP 3: Save preference to backend if authenticated
                          if (authenticatedCustomer?.id) {
                            try {
                              await apiRequest("POST", "/api/customer/shipping-choice", {
                                customerId: authenticatedCustomer.id,
                                shippingChoice: 'delivery'
                              });
                              console.log('✅ Delivery preference saved to backend');
                            } catch (error) {
                              console.error('❌ Failed to save delivery preference:', error);
                            }
                          }
                          
                          console.log('🚚 DELIVERY SELECTED: Waiting for address selection to create payment intent');
                        }}
                        className="w-4 h-4 text-emerald-600"
                      />
                      <Label htmlFor="delivery" className="flex-1 cursor-pointer">
                        <div className="flex justify-between">
                          <span>Home delivery</span>
                          <span className="text-blue-600 font-medium">
                            {wholesaler?.deliveryFlatRate ? `£${parseFloat(wholesaler.deliveryFlatRate).toFixed(2)}` : 'Arranged by supplier'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {wholesaler?.deliveryFlatRate
                            ? `Flat delivery fee of £${parseFloat(wholesaler.deliveryFlatRate).toFixed(2)} added at checkout`
                            : 'The supplier will contact you to arrange delivery and discuss costs'}
                        </p>
                      </Label>
                    </div>
                    )}
                  </div>

                  {/* Delivery Address Selector - Always show when delivery is selected */}
                  {customerData.shippingOption === 'delivery' && wholesaler?.id && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Choose Delivery Address</h4>
                        {customerData.selectedDeliveryAddress && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              console.log('🏠 CHANGE ADDRESS: User clicked change address button');
                              console.log('🏠 CURRENT ADDRESS: Before clearing:', customerData.selectedDeliveryAddress?.addressLine1);
                              
                              // Set a flag to indicate user explicitly cleared address
                              setCustomerData(prev => {
                                const newData = {
                                  ...prev,
                                  selectedDeliveryAddress: null,
                                  // Add a flag to track explicit user clearing
                                  addressExplicitlyCleared: true
                                };
                                console.log('🏠 ADDRESS CLEARED: selectedDeliveryAddress set to null with explicit flag');
                                return newData;
                              });
                            }}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            Change Address
                          </Button>
                        )}
                      </div>
                      
                      {/* Always show AddressSelector when delivery is selected - let it handle display logic */}
                      <AddressSelector
                        wholesalerId={wholesaler.id}
                        selectedAddress={customerData.selectedDeliveryAddress}
                        addressExplicitlyCleared={customerData.addressExplicitlyCleared || false}
                        onAddressSelect={(address) => {
                          console.log('🏠 Address selected in checkout:', address);
                          console.log('🏠 Address object keys:', address ? Object.keys(address) : 'no address');
                          console.log('🏠 Address data:', JSON.stringify(address, null, 2));
                          // Update customer data with selected address and save full address object
                          setCustomerData(prev => {
                            const newData = {
                              ...prev,
                              address: address ? `${address.addressLine1}${address.addressLine2 ? ', ' + address.addressLine2 : ''}` : '',
                              city: address?.city || '',
                              postalCode: address?.postalCode || '',
                              state: address?.state || '',
                              country: address?.country || '',
                              // Save complete delivery address object for order
                              selectedDeliveryAddress: address,
                              // Reset the cleared flag when user selects an address
                              addressExplicitlyCleared: false,
                              // Keep current shipping option - don't override user's explicit choice
                              shippingOption: 'delivery' // Ensure delivery stays selected when address is chosen
                            };
                            console.log('🏠 ADDRESS STATE UPDATE: Complete address data saved');
                            console.log('🏠 ADDRESS VALIDATION:', {
                              hasAddressLine1: !!newData.selectedDeliveryAddress?.addressLine1,
                              hasCity: !!newData.selectedDeliveryAddress?.city,
                              hasPostalCode: !!newData.selectedDeliveryAddress?.postalCode,
                              addressLine1: newData.selectedDeliveryAddress?.addressLine1
                            });
                            return newData;
                          });
                          
                          // CRITICAL: Create payment intent immediately with fresh address data
                          if (address) {
                            console.log('🚚 ADDRESS SELECTED: Creating payment intent with fresh address:', address.addressLine1);
                            
                            // CRITICAL FIX: Clear existing payment intent first to force recreation with new address
                            console.log('🚚 CLEARING STALE PAYMENT: Clearing existing payment intent to force fresh creation with new address');
                            setClientSecret('');
                            
                            // IMPORTANT: Create custom payment intent with fresh address data directly
                            // Don't rely on state update - use the fresh address from callback parameter
                            const updatedCustomerData = {
                              ...customerData,
                              address: `${address.addressLine1}${address.addressLine2 ? ', ' + address.addressLine2 : ''}`,
                              city: address.city,
                              postalCode: address.postalCode,
                              state: address.state || '',
                              country: address.country || '',
                              selectedDeliveryAddress: address,
                              shippingOption: 'delivery' as const
                            };
                            
                            console.log('🚚 FRESH ADDRESS DATA: Creating payment with immediately available address data');
                            console.log('🚚 FRESH ADDRESS VALIDATION:', {
                              addressLine1: address.addressLine1,
                              city: address.city,
                              postalCode: address.postalCode
                            });
                            
                            // Create payment intent with fresh data immediately
                            createPaymentIntentWithCustomData(updatedCustomerData, 'delivery');
                          }
                        }}
                        compact={true}
                      />
                      
                      {/* Delivery Information Note - only show when no flat rate is set */}
                      {(!wholesaler?.deliveryFlatRate || parseFloat(wholesaler.deliveryFlatRate) === 0) && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <h5 className="font-medium text-blue-800 mb-1">Delivery Arrangement</h5>
                        <p className="text-sm text-blue-700">
                          The supplier will contact you within 24 hours to discuss delivery options, 
                          timing, and costs based on your location and order size.
                        </p>
                      </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Order Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Order Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={customerData.notes}
                    onChange={(e) => setCustomerData(prev => ({...prev, notes: e.target.value}))}
                    placeholder="Add any special instructions for your order"
                    rows={3}
                  />
                </div>

                {/* Payment Form */}
                <div className="border-t pt-6">
                  {/* Pay Now / Pay Later toggle */}
                  {customerData.shippingOption && (
                    <div className="mb-5">
                      <h3 className="font-semibold mb-2">Payment Method</h3>
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setPayLaterMode(false);
                            if (customerData.shippingOption && !clientSecret && !isCreatingIntent) {
                              createPaymentIntentForCheckout(customerData.shippingOption);
                            }
                          }}
                          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                            !payLaterMode
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          💳 Pay Now
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPayLaterMode(true);
                            setClientSecret('');
                          }}
                          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                            payLaterMode
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          📋 Pay Later
                        </button>
                      </div>
                      {payLaterMode && (
                        <p className="text-xs text-blue-700 mt-1.5">
                          Your order will be placed now. The supplier will contact you to arrange payment.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Debug current shipping option when checkout modal opens */}
                  {console.log('🚚 CHECKOUT MODAL: Opening with shipping option:', customerData.shippingOption)}
                  {console.log('🚚 CHECKOUT MODAL: Client secret exists:', !!clientSecret)}

                  {/* Pay Later — place order directly */}
                  {payLaterMode && customerData.shippingOption ? (
                    <div className="space-y-3">
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800 font-medium">Pay Later — No payment required now</p>
                        <p className="text-sm text-blue-700 mt-1">
                          Your order total of{' '}
                          <strong>
                            {(() => {
                              const subtotal = cartStats.subtotal;
                              const shipping = customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate
                                ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                              const beforeFees = subtotal + shipping;
                              const transactionFee = (beforeFees * 0.055) + 0.50;
                              return `£${(beforeFees + transactionFee).toFixed(2)}`;
                            })()}
                          </strong>{' '}
                          will be due on invoice. The supplier will be notified of your order.
                        </p>
                      </div>
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        disabled={isPlacingPayLaterOrder || !customerData.shippingOption || (customerData.shippingOption === 'delivery' && !customerData.selectedDeliveryAddress)}
                        onClick={async () => {
                          if (!wholesaler?.id) return;
                          setIsPlacingPayLaterOrder(true);
                          try {
                            const cartItems = cart.map(cartItem => ({
                              productId: cartItem.product.id,
                              quantity: cartItem.quantity,
                              sellingType: cartItem.sellingType,
                            }));
                            const response = await fetch('/api/marketplace/create-order-pay-later', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                cart: cartItems,
                                customerData: {
                                  name: customerData.name,
                                  email: customerData.email,
                                  phone: customerData.phone,
                                },
                                shippingOption: customerData.shippingOption,
                                wholesalerId: wholesaler.id,
                                notes: customerData.notes || null,
                                selectedDeliveryAddress: customerData.selectedDeliveryAddress || null,
                                selectedDeliveryAddressId: customerData.selectedDeliveryAddress?.id || null,
                              }),
                            });
                            if (!response.ok) {
                              const errData = await response.json().catch(() => ({}));
                              throw new Error(errData.message || 'Failed to place order');
                            }
                            const orderData = await response.json();
                            const currentShippingOption = customerData.shippingOption;
                            const computedSubtotal = cartStats.subtotal;
                            const computedShipping = currentShippingOption === 'delivery' && wholesaler?.deliveryFlatRate
                              ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                            const computedBeforeFees = computedSubtotal + computedShipping;
                            const computedTransactionFee = (computedBeforeFees * 0.055) + 0.50;
                            const computedTotal = computedBeforeFees + computedTransactionFee;
                            setCompletedOrder({
                              orderNumber: orderData.orderNumber || `Order #${orderData.orderId}`,
                              cart: cart.map(cartItem => ({
                                product: cartItem.product,
                                quantity: cartItem.quantity,
                                sellingType: cartItem.sellingType,
                              })),
                              customerData: {
                                ...customerData,
                                shippingOption: currentShippingOption,
                                selectedDeliveryAddress: customerData.selectedDeliveryAddress,
                              },
                              subtotal: computedSubtotal,
                              transactionFee: computedTransactionFee,
                              shippingCost: computedShipping,
                              totalAmount: computedTotal,
                              payLater: true,
                            });
                            setCart([]);
                            setPayLaterMode(false);
                            setClientSecret('');
                            setLastUsedShippingOption(null);
                            setCustomerData(prev => ({
                              ...prev,
                              shippingOption: undefined,
                              selectedDeliveryAddress: null,
                              addressExplicitlyCleared: false,
                              selectedShippingService: undefined,
                            }));
                            refetchProducts();
                            if (featuredProductId) refetchFeaturedProduct();
                            queryClient.invalidateQueries({ queryKey: ["/api/customer-orders/stats"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/customer-orders"] });
                            setShowCheckout(false);
                            setShowThankYou(true);
                            toast({
                              title: "Order Placed!",
                              description: `${orderData.orderNumber} — Pay Later order confirmed. The supplier will contact you.`,
                            });
                          } catch (err: unknown) {
                            toast({
                              title: "Order Failed",
                              description: err instanceof Error ? err.message : "Failed to place order. Please try again.",
                              variant: "destructive",
                            });
                          } finally {
                            setIsPlacingPayLaterOrder(false);
                          }
                        }}
                      >
                        {isPlacingPayLaterOrder ? 'Placing Order...' : 'Place Order (Pay Later)'}
                      </Button>
                    </div>
                  ) : (
                  <>
                  {/* Persistent address required banner — shows without needing clientSecret */}
                  {customerData.shippingOption === 'delivery' && !customerData.selectedDeliveryAddress ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
                      <h4 className="font-medium text-amber-800 mb-1">Delivery address needed</h4>
                      <p className="text-sm text-amber-700">
                        Please add or select a delivery address above to continue with your order.
                      </p>
                    </div>
                  ) : customerData.shippingOption ? (
                    <StripeCheckoutForm
                    cart={cart}
                    customerData={customerData}
                    wholesaler={wholesaler}
                    clientSecret={clientSecret}
                    totalAmount={(() => {
                      const subtotal = cartStats.subtotal;
                      const shipping = customerData.shippingOption === 'delivery' && wholesaler?.deliveryFlatRate
                        ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                      const beforeFees = subtotal + shipping;
                      const transactionFee = (beforeFees * 0.055) + 0.50;
                      return beforeFees + transactionFee;
                    })()}
                    onSuccess={(orderData) => {
                      console.log('🛒 Payment successful, received order data:', orderData);
                      
                      // CRITICAL FIX: Map cart to backend-compatible order items with correct selling types
                      const orderItems = cart.map(cartItem => {
                        let computedTotal: number;
                        let promoLabel: string | undefined;
                        if (cartItem.sellingType === 'pallets') {
                          computedTotal = parseFloat((cartItem.product as any).palletPrice || '0') * cartItem.quantity;
                        } else {
                          const pricing = calculatePromotionalPricing(cartItem.product, cartItem.quantity);
                          computedTotal = pricing.totalCost;
                          promoLabel = pricing.appliedOffers.length > 0 ? pricing.appliedOffers[0] : undefined;
                        }
                        return {
                          product: {
                            ...cartItem.product,
                            id: cartItem.product.id,
                            name: cartItem.product.name,
                            price: cartItem.product.price,
                            image: cartItem.product.image,
                            promoPrice: cartItem.product.promoPrice,
                            promoActive: cartItem.product.promoActive,
                            promotionalOffers: cartItem.product.promotionalOffers,
                            palletPrice: (cartItem.product as any).palletPrice
                          },
                          quantity: cartItem.quantity,
                          sellingType: cartItem.sellingType,
                          computedTotal,
                          promoLabel
                        };
                      });
                      
                      // CRITICAL FIX: Capture current shipping option before resetting
                      const currentShippingOption = customerData.shippingOption;
                      
                      const orderDataWithCart = {
                        ...orderData,
                        cart: orderItems, // Use properly formatted order items instead of raw cart
                        customerData: {
                          ...customerData,
                          // Ensure ThankYou page gets the correct shipping option and delivery address
                          shippingOption: currentShippingOption,
                          selectedDeliveryAddress: customerData.selectedDeliveryAddress
                        },
                        wholesaler: wholesaler,
                        ...(() => {
                          const computedSubtotal = cartStats.subtotal;
                          const computedShipping = currentShippingOption === 'delivery' && wholesaler?.deliveryFlatRate
                            ? parseFloat(wholesaler.deliveryFlatRate) : 0;
                          const computedBeforeFees = computedSubtotal + computedShipping;
                          const computedTransactionFee = (computedBeforeFees * 0.055) + 0.50;
                          const computedTotal = computedBeforeFees + computedTransactionFee;
                          return {
                            subtotal: computedSubtotal,
                            transactionFee: computedTransactionFee,
                            shippingCost: computedShipping,
                            totalAmount: computedTotal
                          };
                        })()
                      };
                      setCompletedOrder(orderDataWithCart);
                      
                      // Clear the cart after successful payment
                      setCart([]);
                      
                      // 🔄 RESET FOR NEXT ORDER: Clear selection but preserve address data
                      console.log('🚚 Resetting for next order - customer will choose delivery/pickup explicitly...');
                      setCustomerData(prev => ({
                        ...prev,
                        // Reset to no selection - customer chooses explicitly
                        shippingOption: undefined,
                        // CRITICAL FIX: Clear selected delivery address to force fresh selection for next order
                        selectedDeliveryAddress: null,
                        // Reset address clearing flag to allow normal auto-selection for next order
                        addressExplicitlyCleared: false,
                        // Keep selectedDeliveryAddress available but don't auto-select delivery
                        selectedShippingService: undefined
                      }));
                      
                      // 🔄 CRITICAL FIX: Reset payment state for next order
                      setClientSecret('');
                      setLastUsedShippingOption(null);
                      console.log('💳 Payment state reset - next order will create fresh payment intent');
                      
                      // 🔄 REFRESH PRODUCT DATA: Fetch updated stock levels after order completion
                      console.log('🔄 Refreshing product data to show updated stock levels...');
                      refetchProducts();
                      
                      // Also refresh featured product if it exists
                      if (featuredProductId) {
                        refetchFeaturedProduct();
                      }
                      
                      // Close checkout modal and show thank you page
                      queryClient.invalidateQueries({ queryKey: ["/api/customer-orders/stats"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/customer-orders"] });
                      setShowCheckout(false);
                      setShowThankYou(true);
                    }}
                  />
                  ) : null}
                  </>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>


        {/* Enhanced Unit/Pallet Selection Modal with Quantity Adjustment */}
        {showUnitSelectionModal && selectedProductForModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              {modalStep === 'type' ? (
                // Step 1: Choose Purchase Type
                <>
                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Choose Purchase Option
                    </h3>
                    <p className="text-gray-600">
                      How would you like to purchase {selectedProductForModal.name}?
                    </p>
                  </div>

                  <div className="space-y-4 mb-6">
                    {/* Individual Units Option */}
                    {(() => {
                      const moq = selectedProductForModal.moq || 1;
                      const promoPricing = calculatePromotionalPricing(selectedProductForModal as any, moq);
                      const hasDiscount = promoPricing.effectivePrice !== promoPricing.originalPrice;
                      return (
                    <div 
                      className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors border-emerald-500 bg-emerald-50"
                      onClick={() => {
                        setSelectedModalType('units');
                        const availableStock = selectedProductForModal.stock || 0;
                        const minQuantity = selectedProductForModal.moq || 1;
                        setModalQuantity(availableStock < minQuantity ? availableStock : minQuantity);
                        setModalStep('quantity');
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-medium text-gray-900">Individual Units</h4>
                          <p className="text-sm text-gray-600">
                            {hasDiscount ? (
                              <>
                                <span className="line-through text-gray-400 mr-1">£{promoPricing.originalPrice.toFixed(2)}</span>
                                <span className="text-emerald-600 font-semibold">£{promoPricing.effectivePrice.toFixed(2)}</span> per unit
                              </>
                            ) : (
                              <>£{promoPricing.effectivePrice.toFixed(2)} per unit</>
                            )}
                          </p>
                          {hasDiscount && promoPricing.promoLabel && (
                            <span className="inline-block text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full mt-1">
                              {promoPricing.promoLabel}
                            </span>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            Minimum: {moq} units
                          </p>
                        </div>
                        <div className="text-right">
                          {hasDiscount && (
                            <div className="text-xs text-gray-400 line-through">
                              £{(promoPricing.originalPrice * moq).toFixed(2)}
                            </div>
                          )}
                          <div className="text-lg font-semibold text-emerald-600">
                            £{promoPricing.totalCost.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">
                            for {moq} units
                          </div>
                        </div>
                      </div>
                    </div>
                      );
                    })()}

                    {/* Pallet Option */}
                    <div 
                      className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors border-blue-500 bg-blue-50"
                      onClick={() => {
                        setSelectedModalType('pallets');
                        // Set quantity to available stock if it's less than MOQ, otherwise use MOQ
                        const availableStock = (selectedProductForModal as any).palletStock || 0;
                        const minQuantity = (selectedProductForModal as any).palletMoq || 1;
                        setModalQuantity(availableStock < minQuantity ? availableStock : minQuantity);
                        setModalStep('quantity');
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-medium text-gray-900">Full Pallets</h4>
                          <p className="text-sm text-gray-600">
                            £{parseFloat((selectedProductForModal as any).palletPrice?.toString() || '0').toFixed(2)} per pallet
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {(selectedProductForModal as any).unitsPerPallet} units per pallet
                            {(selectedProductForModal as any).palletMoq && (selectedProductForModal as any).palletMoq > 1 && 
                              ` • Minimum: ${(selectedProductForModal as any).palletMoq} pallets`
                            }
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-blue-600">
                            £{(parseFloat((selectedProductForModal as any).palletPrice?.toString() || '0') * ((selectedProductForModal as any).palletMoq || 1)).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">
                            for {(selectedProductForModal as any).palletMoq || 1} pallet{((selectedProductForModal as any).palletMoq || 1) > 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Both Option */}
                    <div
                      className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors border-purple-400 bg-purple-50"
                      onClick={() => {
                        const unitMoq = selectedProductForModal.moq || 1;
                        const palMoq = (selectedProductForModal as any).palletMoq || 1;
                        addToCart(selectedProductForModal, unitMoq, 'units');
                        addToCart(selectedProductForModal, palMoq, 'pallets');
                        setShowUnitSelectionModal(false);
                        setSelectedProductForModal(null);
                        setModalStep('type');
                        setSelectedModalType(null);
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-medium text-gray-900">Both Units & Pallets</h4>
                          <p className="text-sm text-gray-600">Order individual units and full pallets together</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {selectedProductForModal.moq || 1} units + {(selectedProductForModal as any).palletMoq || 1} pallet{((selectedProductForModal as any).palletMoq || 1) > 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="text-purple-600 text-2xl">+</div>
                      </div>
                    </div>
                  </div>

                  {/* Cancel Button */}
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowUnitSelectionModal(false);
                        setSelectedProductForModal(null);
                        setModalStep('type');
                        setSelectedModalType(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                // Step 2: Quantity Selection
                <>
                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {selectedModalType === 'units' ? '📦 Individual Units' : '🚛 Full Pallets'} Selected
                    </h3>
                    <p className="text-gray-600">
                      Adjust quantity for {selectedProductForModal.name}
                    </p>
                    <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600">
                      <span>Want to switch?</span>
                      <button
                        onClick={() => {
                          setModalStep('type');
                          setSelectedModalType(null);
                          // Reset to initial appropriate quantity
                          const availableStock = selectedProductForModal.stock || 0;
                          const minQuantity = selectedProductForModal.moq || 1;
                          setModalQuantity(availableStock < minQuantity ? availableStock : minQuantity);
                        }}
                        className="text-blue-600 hover:text-blue-800 font-medium underline"
                      >
                        Change selection
                      </button>
                    </div>
                  </div>

                  {/* Product Info */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {selectedModalType === 'units' ? 'Individual Units' : 'Full Pallets'}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {selectedModalType === 'units' 
                            ? (() => {
                                const qtyPricing = calculatePromotionalPricing(selectedProductForModal as any, 1);
                                const hasPromo = qtyPricing.effectivePrice !== qtyPricing.originalPrice;
                                if (hasPromo) {
                                  return (
                                    <>
                                      <span className="line-through text-gray-400 mr-1">£{qtyPricing.originalPrice.toFixed(2)}</span>
                                      <span className="text-emerald-600 font-semibold">£{qtyPricing.effectivePrice.toFixed(2)}</span> per unit
                                    </>
                                  );
                                }
                                return `£${qtyPricing.effectivePrice.toFixed(2)} per unit`;
                              })()
                            : `£${parseFloat((selectedProductForModal as any).palletPrice?.toString() || '0').toFixed(2)} per pallet`
                          }
                        </p>
                        {selectedModalType === 'units' && (() => {
                          const qtyPricing = calculatePromotionalPricing(selectedProductForModal as any, 1);
                          if (qtyPricing.promoLabel && qtyPricing.effectivePrice !== qtyPricing.originalPrice) {
                            return (
                              <span className="inline-block text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full mt-1">
                                {qtyPricing.promoLabel}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">
                          Minimum: {selectedModalType === 'units' 
                            ? `${selectedProductForModal.moq} units`
                            : `${(selectedProductForModal as any).palletMoq || 1} pallets`
                          }
                        </div>
                        {selectedModalType === 'pallets' && (
                          <div className="text-xs text-gray-500">
                            {(selectedProductForModal as any).unitsPerPallet} units per pallet
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quantity Controls - Free Type Input */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-center space-x-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const minQuantity = selectedModalType === 'units' 
                              ? (selectedProductForModal.moq || 1)
                              : ((selectedProductForModal as any).palletMoq || 1);
                            if (modalQuantity > minQuantity) {
                              setModalQuantity(modalQuantity - 1);
                            }
                          }}
                          disabled={modalQuantity <= (selectedModalType === 'units' 
                            ? (selectedProductForModal.moq || 1)
                            : ((selectedProductForModal as any).palletMoq || 1))}
                          className="h-10 w-10 p-0"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const availableStock = selectedModalType === 'units' 
                              ? selectedProductForModal.stock 
                              : ((selectedProductForModal as any).palletStock || 0);
                            if (modalQuantity < availableStock) {
                              setModalQuantity(modalQuantity + 1);
                            }
                          }}
                          disabled={(() => {
                            const availableStock = selectedModalType === 'units' 
                              ? selectedProductForModal.stock 
                              : ((selectedProductForModal as any).palletStock || 0);
                            return modalQuantity >= availableStock;
                          })()}
                          className="h-10 w-10 p-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      {/* Free Text Input */}
                      <div className="text-center space-y-2">
                        <Label htmlFor="quantity-input" className="text-sm font-medium">
                          Quantity ({selectedModalType === 'units' ? 'units' : 'pallets'})
                        </Label>
                        <Input
                          id="quantity-input"
                          type="number"
                          step="0.1"
                          value={modalQuantity}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            const availableStock = selectedModalType === 'units' 
                              ? selectedProductForModal.stock 
                              : ((selectedProductForModal as any).palletStock || 0);
                            
                            // Cap quantity at available stock
                            if (value >= 0 || e.target.value === '') {
                              setModalQuantity(Math.min(value, availableStock));
                            }
                          }}
                          className="text-center text-xl font-bold max-w-[120px] mx-auto"
                          placeholder="Enter quantity"
                        />
                        
                        {/* MOQ Information - Always visible */}
                        <div className="text-xs text-center space-y-1">
                          <div className="flex justify-center space-x-4 text-gray-600 font-medium">
                            <span>
                              Minimum: {selectedModalType === 'units' 
                                ? `${selectedProductForModal.moq || 1} units`
                                : `${(selectedProductForModal as any).palletMoq || 1} pallets`}
                            </span>
                            <span>
                              Available: {(() => {
                                const availableStock = selectedModalType === 'units' 
                                  ? selectedProductForModal.stock 
                                  : ((selectedProductForModal as any).palletStock || 0);
                                return `${availableStock} ${selectedModalType === 'units' ? 'units' : 'pallets'}`;
                              })()}
                            </span>
                          </div>
                          
                          {(() => {
                            const minQuantity = selectedModalType === 'units' 
                              ? (selectedProductForModal.moq || 1)
                              : ((selectedProductForModal as any).palletMoq || 1);
                            const availableStock = selectedModalType === 'units' 
                              ? selectedProductForModal.stock 
                              : ((selectedProductForModal as any).palletStock || 0);
                            
                            // Case 1: Stock is less than MOQ - allow purchasing remaining stock
                            if (availableStock < minQuantity) {
                              return (
                                <p className="text-amber-600 font-medium">
                                  ⭐ Last {availableStock} units available! (normally {minQuantity} minimum)
                                </p>
                              );
                            }
                            
                            // Case 2: Quantity exceeds available stock
                            if (modalQuantity > availableStock) {
                              return (
                                <p className="text-red-600 font-medium">
                                  ⚠️ Quantity exceeds available stock ({availableStock})
                                </p>
                              );
                            }
                            
                            // Case 3: Below MOQ but stock is sufficient
                            if (modalQuantity > 0 && modalQuantity < minQuantity) {
                              return (
                                <p className="text-amber-600 font-medium">
                                  ⚠️ Below minimum - will be adjusted to {minQuantity}
                                </p>
                              );
                            }
                            
                            // Case 4: Everything is good
                            if (modalQuantity >= minQuantity && modalQuantity <= availableStock) {
                              return (
                                <p className="text-green-600 font-medium">
                                  ✅ Meets requirements
                                </p>
                              );
                            }
                            
                            return null;
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Total Price */}
                    <div className="text-center mt-4 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">Total</div>
                      {(() => {
                        if (selectedModalType === 'units') {
                          const totalPricing = calculatePromotionalPricing(selectedProductForModal as any, modalQuantity);
                          const hasPromo = totalPricing.effectivePrice !== totalPricing.originalPrice;
                          return (
                            <>
                              {hasPromo && (
                                <div className="text-sm text-gray-400 line-through">
                                  £{(totalPricing.originalPrice * modalQuantity).toFixed(2)}
                                </div>
                              )}
                              <div className="text-2xl font-bold text-emerald-600">
                                £{totalPricing.totalCost.toFixed(2)}
                              </div>
                              {hasPromo && totalPricing.promoLabel && (
                                <div className="text-xs text-green-600 mt-1">
                                  {totalPricing.promoLabel} applied
                                </div>
                              )}
                            </>
                          );
                        }
                        return (
                          <div className="text-2xl font-bold text-emerald-600">
                            £{(parseFloat((selectedProductForModal as any).palletPrice?.toString() || '0') * modalQuantity).toFixed(2)}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setModalStep('type');
                        setSelectedModalType(null);
                        // Reset quantity to available stock if less than MOQ, otherwise MOQ
                        const availableStock = selectedModalType === 'units' 
                          ? selectedProductForModal.stock 
                          : ((selectedProductForModal as any).palletStock || 0);
                        const minQuantity = selectedModalType === 'units' 
                          ? (selectedProductForModal.moq || 1)
                          : ((selectedProductForModal as any).palletMoq || 1);
                        setModalQuantity(availableStock < minQuantity ? availableStock : minQuantity);
                      }}
                      className="flex-1"
                    >
                      ← Change Selection
                    </Button>
                    <Button
                      onClick={() => {
                        const minQuantity = selectedModalType === 'units' 
                          ? (selectedProductForModal.moq || 1)
                          : ((selectedProductForModal as any).palletMoq || 1);
                        const availableStock = selectedModalType === 'units' 
                          ? selectedProductForModal.stock 
                          : ((selectedProductForModal as any).palletStock || 0);
                        
                        // Check if we're editing an existing cart item of the same type
                        const existingCartItem = cart.find(item => item.product.id === selectedProductForModal.id && item.sellingType === selectedModalType);
                        
                        if (existingCartItem) {
                          // Update existing cart item of same type
                          const requestedQuantity = Math.max(modalQuantity || minQuantity, minQuantity);
                          const finalQuantity = Math.min(requestedQuantity, availableStock);
                          
                          setCart(prevCart => 
                            prevCart.map(item =>
                              item.product.id === selectedProductForModal.id && item.sellingType === selectedModalType
                                ? { ...item, quantity: finalQuantity }
                                : item
                            )
                          );
                          
                          toast({
                            title: "Cart Updated",
                            description: `${selectedProductForModal.name} updated to ${finalQuantity} ${selectedModalType === 'pallets' ? 'pallets' : 'units'}`,
                          });
                        } else {
                          // Add new item to cart
                          if (availableStock < minQuantity) {
                            // Stock is less than MOQ - allow purchasing all remaining stock
                            const finalQuantity = availableStock;
                            addToCart(selectedProductForModal, finalQuantity, selectedModalType!);
                            toast({
                              title: "Last Units Added!",
                              description: `Added all remaining ${finalQuantity} ${selectedModalType === 'pallets' ? 'pallets' : 'units'} of ${selectedProductForModal.name}`,
                            });
                          } else {
                            // Normal case - enforce MOQ
                            const requestedQuantity = Math.max(modalQuantity || minQuantity, minQuantity);
                            const finalQuantity = Math.min(requestedQuantity, availableStock);
                            addToCart(selectedProductForModal, finalQuantity, selectedModalType!);
                          }
                        }
                        
                        setShowUnitSelectionModal(false);
                        setSelectedProductForModal(null);
                        setModalStep('type');
                        setSelectedModalType(null);
                        setModalQuantity(1);
                      }}
                      disabled={(() => {
                        const availableStock = selectedModalType === 'units' 
                          ? selectedProductForModal.stock 
                          : ((selectedProductForModal as any).palletStock || 0);
                        return availableStock <= 0;
                      })()}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-400"
                    >
                      {(() => {
                        const minQuantity = selectedModalType === 'units' 
                          ? (selectedProductForModal.moq || 1)
                          : ((selectedProductForModal as any).palletMoq || 1);
                        const availableStock = selectedModalType === 'units' 
                          ? selectedProductForModal.stock 
                          : ((selectedProductForModal as any).palletStock || 0);
                        
                        const existingCartItem = cart.find(item => item.product.id === selectedProductForModal.id && item.sellingType === selectedModalType);
                        
                        if (availableStock <= 0) {
                          return "Out of Stock";
                        } else if (availableStock < minQuantity) {
                          return existingCartItem ? "Update Cart" : `Add ${availableStock} (All Available)`;
                        } else {
                          return existingCartItem ? "Update Cart" : "Add to Cart";
                        }
                      })()}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* First Time Address Setup Popup */}
        {wholesaler?.id && (
          <FirstTimeAddressSetup
            wholesalerId={wholesaler.id}
            isOpen={showFirstTimeAddressSetup}
            onClose={() => setShowFirstTimeAddressSetup(false)}
            onSuccess={() => {
              setShowFirstTimeAddressSetup(false);
              toast({
                title: "Address Setup Complete",
                description: "Your delivery address has been saved successfully!",
              });
            }}
          />
        )}

        {/* Guest sign-in modal — triggered when guest tries to add to cart */}
        {showGuestSignInModal && !hasCustomerSession && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <ShoppingCart className="w-6 h-6 text-green-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Sign in to add items</h2>
                <p className="text-sm text-gray-500">
                  You need to be a registered customer of{' '}
                  <span className="font-medium text-gray-700">{wholesaler?.businessName || 'this store'}</span>{' '}
                  to add items to your cart and place orders.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowGuestSignInModal(false);
                  openCustomerSignIn();
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Sign in to {wholesaler?.businessName || 'this store'}
              </button>
              <button
                onClick={() => {
                  setShowGuestSignInModal(false);
                  openCustomerRequestAccess();
                }}
                className="w-full border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 font-semibold py-3 rounded-xl transition-colors"
              >
                Request access instead
              </button>
              <button
                onClick={() => setShowGuestSignInModal(false)}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors"
              >
                Continue browsing
              </button>
            </div>
          </div>
        )}

        {/* Floating Cart Button - Only show when authenticated and cart has items */}
        {hasCustomerSession && !isTrueGuestMode && cart.length > 0 && (
          <div className="fixed bottom-20 right-4 z-50">
            <Button
              onClick={() => setShowCheckout(true)}
              className="rounded-full shadow-lg h-14 w-14 p-0 relative quick-action-pulse bg-theme-primary text-white"
            >
              <ShoppingCart className="h-6 w-6" />
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold">
                  {cart.reduce((total, item) => total + item.quantity, 0)}
                </span>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
