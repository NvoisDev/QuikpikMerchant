import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductGridSkeleton, FormSkeleton } from "@/components/ui/loading-skeletons";
import { DynamicTooltip, HelpTooltip, InfoTooltip, WarningTooltip } from "@/components/ui/dynamic-tooltip";
import { ContextualHelp, QuickHelp } from "@/components/ui/contextual-help";
import { WhimsicalError, NetworkError, PaymentError, NotFoundError } from "@/components/ui/whimsical-error";
import { FloatingHelp } from "@/components/ui/floating-help";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import PageLoader from "@/components/ui/page-loader";
import ButtonLoader from "@/components/ui/button-loader";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Plus, Minus, Trash2, Package, Star, Store, Mail, Phone, MapPin, CreditCard, Search, Filter, Grid, List, Eye, MoreHorizontal, ShieldCheck, Truck, ArrowLeft, Heart, Home, HelpCircle, Building2, History, User, Settings, ShoppingBag, Clock } from "lucide-react";
import Logo from "@/components/ui/logo";
import Footer from "@/components/ui/footer";
import { CustomerAuth } from "@/components/customer/CustomerAuth";
import { ModernCustomerHome } from "@/components/customer/ModernCustomerHome";
import { CustomerOrderHistory } from "@/components/customer/CustomerOrderHistory";
import { ThankYouPage } from "@/components/customer/ThankYouPage";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PromotionalPricingCalculator, type PromotionalOffer } from "@shared/promotional-pricing";
import { getOfferTypeConfig } from "@shared/promotional-offer-utils";
import { Product as ProductType, PromotionalOfferType } from "@shared/schema";
import { format } from "date-fns";
import { OrderSuccessModal } from "@/components/OrderSuccessModal";
import { detectOrderMilestone, useOrderMilestones } from "@/hooks/useOrderMilestones";
import { cleanAIDescription } from "@shared/utils";

// Type-safe Product interface that matches actual database schema
interface ExtendedProduct {
  id: number;
  name: string;
  description?: string | null;
  imageUrl?: string;
  images?: string | string[] | null;
  price: string;
  promoPrice?: string | null;
  currency?: string | null;
  stock?: number;
  category?: string;
  categories?: string[];
  status?: string;
  wholesalerId?: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  wholesaler?: {
    businessName: string;
    businessPhone?: string;
  };
  
  // Additional properties that may exist in database
  palletPrice?: string | number | null;
  palletMoq?: number | null;
  palletStock?: number | null;
  unitsPerPallet?: number | null;
  palletWeight?: string | number | null;
  pallet_weight?: string | number | null;
  sellingFormat?: string | null;
  sizePerUnit?: string | null;
  individualUnitWeight?: string | number | null;
  packageDimensions?: any;
  negotiationEnabled?: boolean;
  deliveryExcluded?: boolean;
  moq?: number;
}

// Initialize Stripe
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// Utility functions
const formatNumber = (num: number | string): string => {
  const number = typeof num === 'string' ? parseInt(num) : num;
  return number.toLocaleString();
};

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
  price: number;
  originalPrice?: number;
  currency?: string;
  isGuestMode: boolean;
  size?: 'small' | 'medium' | 'large';
  showStrikethrough?: boolean;
}) => {
  const currencySymbol = getCurrencySymbol(currency);
  const hasDiscount = originalPrice && originalPrice > price;

  if (isGuestMode) {
    return (
      <div className="relative">
        {/* Blurred price display */}
        <div className="blur-sm select-none pointer-events-none">
          <span className={`font-bold text-gray-900 ${
            size === 'small' ? 'text-sm' : 
            size === 'large' ? 'text-xl' : 'text-base'
          }`}>
            {currencySymbol}{price.toFixed(2)}
          </span>
          {hasDiscount && showStrikethrough && (
            <span className={`line-through text-gray-500 ml-2 ${
              size === 'small' ? 'text-xs' : 
              size === 'large' ? 'text-lg' : 'text-sm'
            }`}>
              {currencySymbol}{originalPrice.toFixed(2)}
            </span>
          )}
        </div>
        
        {/* Overlay with contact message */}
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 rounded">
          <div className="text-center">
            <div className="text-xs text-gray-600 mb-1">Contact wholesaler</div>
            <Button 
              onClick={() => window.location.href = '/'}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1"
            >
              Sign In
            </Button>
          </div>
        </div>
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
        {currencySymbol}{price.toFixed(2)}
      </span>
      {hasDiscount && showStrikethrough && (
        <span className={`line-through text-gray-500 ${
          size === 'small' ? 'text-xs' : 
          size === 'large' ? 'text-lg' : 'text-sm'
        }`}>
          {currencySymbol}{originalPrice.toFixed(2)}
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
  promotionalOffers?: PromotionalOffer[];
  
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

interface CartItem {
  product: Product;
  quantity: number;
  sellingType: "units" | "pallets"; // What type of quantity this item represents
}

interface CustomerData {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
  shippingOption: "pickup" | "delivery" | undefined;
  selectedShippingService?: {
    serviceId: string;
    serviceName: string;
    price: number;
    description: string;
  };
}

// Stripe Checkout Form Component
interface StripeCheckoutFormProps {
  cart: CartItem[];
  customerData: CustomerData;
  wholesaler: any;
  totalAmount: number;
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

const StripeCheckoutForm = ({ cart, customerData, wholesaler, totalAmount, onSuccess }: StripeCheckoutFormProps) => {
  const [clientSecret, setClientSecret] = useState("");
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [capturedShippingData, setCapturedShippingData] = useState<{
    option: string;
    service?: any;
  } | null>(null);

  // CRITICAL FIX: Clear clientSecret when shipping selection changes to force payment intent recreation
  useEffect(() => {
    if (clientSecret) {
      console.log('🔄 Shipping selection changed, clearing payment intent to recreate with new data');
      setClientSecret("");
    }
  }, [customerData.shippingOption, customerData.selectedShippingService?.serviceId]);
  const { toast } = useToast();

  // Create payment intent when customer data is complete - only once when form is ready
  useEffect(() => {
    const createPaymentIntent = async () => {
      console.log('🚚 PAYMENT INTENT CHECK: About to create payment intent with shipping data:', {
        shippingOption: customerData.shippingOption,
        selectedShippingService: customerData.selectedShippingService,
        hasAllRequiredData: !!(cart.length > 0 && wholesaler && customerData.name && customerData.email && customerData.phone && customerData.shippingOption),
        clientSecretExists: !!clientSecret,
        isCreatingIntent
      });
      
      // CRITICAL FIX: Reset clientSecret when shipping changes so payment intent gets recreated
      const shouldCreateIntent = cart.length > 0 && wholesaler && customerData.name && customerData.email && customerData.phone && customerData.shippingOption && !isCreatingIntent;
      const hasValidShipping = customerData.shippingOption === 'pickup' || (customerData.shippingOption === 'delivery' && customerData.selectedShippingService);
      
      if (shouldCreateIntent && hasValidShipping && !clientSecret) {
        setIsCreatingIntent(true);
        
        // CRITICAL FIX: Capture shipping data at the exact moment of payment creation
        // CRITICAL FIX: Always capture the absolute latest shipping state
        const currentShippingOption = customerData.shippingOption;
        const currentSelectedService = customerData.selectedShippingService;
        
        const shippingDataAtCreation = {
          option: currentShippingOption || 'pickup',
          service: currentSelectedService
        };
        setCapturedShippingData(shippingDataAtCreation);
        
        console.log('🚚 CRITICAL FIX: Payment creation shipping validation:');
        console.log('  - Current customerData.shippingOption:', currentShippingOption);
        console.log('  - Current customerData.selectedShippingService:', currentSelectedService);
        console.log('  - Will send to backend:', shippingDataAtCreation);
        console.log('  - Is delivery order?', currentShippingOption === 'delivery');
        console.log('  - Has shipping service?', !!currentSelectedService);
        console.log('  - Service details:', currentSelectedService ? {
            serviceName: currentSelectedService.serviceName,
            price: currentSelectedService.price,
            serviceId: currentSelectedService.serviceId
          } : 'NO SERVICE SELECTED');
        
        // CRITICAL: Validation check - prevent payment creation if delivery selected but no service
        if (currentShippingOption === 'delivery' && !currentSelectedService) {
          toast({
            title: "Shipping Service Required",
            description: "Please select a delivery service before placing your order",
            variant: "destructive"
          });
          setIsProcessingPayment(false);
          return;
        }
        
        try {
          // CRITICAL DEBUG: Log the exact data being sent to backend
          const requestPayload = {
            customerName: customerData.name,
            customerEmail: customerData.email,
            customerPhone: customerData.phone,
            customerAddress: {
              street: customerData.address,
              city: customerData.city,
              state: customerData.state,
              postalCode: customerData.postalCode,
              country: customerData.country || 'United Kingdom'
            },
            items: cart.map(item => ({
              productId: item.product.id,
              quantity: item.quantity || 0,
              unitPrice: (() => {
                const basePrice = parseFloat(item.product.price) || 0;
                const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                  basePrice,
                  item.quantity,
                  item.product.promotionalOffers || [],
                  item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                  item.product.promoActive
                );
                return pricing.effectivePrice;
              })()
            })),
            shippingInfo: shippingDataAtCreation
          };
          
          console.log('🚚 FRONTEND FINAL CHECK: About to send this exact payload to backend:');
          console.log('  - Request payload shippingInfo:', requestPayload.shippingInfo);
          console.log('  - Payload shippingInfo option:', requestPayload.shippingInfo?.option);
          console.log('  - Payload shippingInfo service:', requestPayload.shippingInfo?.service);
          console.log('  - Full payload:', JSON.stringify(requestPayload, null, 2));
          
          const response = await apiRequest("POST", "/api/customer/create-payment", requestPayload);
          
          console.log('🚚 FRONTEND: === PAYMENT CREATION DEBUG ===');
          console.log('🚚 FRONTEND: CAPTURED shipping data (what we\'re actually sending):', shippingDataAtCreation);
          console.log('🚚 FRONTEND: Current customerData.shippingOption (might be different):', customerData.shippingOption);
          console.log('🚚 FRONTEND: Sending shippingInfo to backend:', shippingDataAtCreation);
          console.log('🚚 FRONTEND: FULL PAYMENT REQUEST BODY:', {
            shippingInfo: shippingDataAtCreation,
            isDeliveryOrder: shippingDataAtCreation.option === 'delivery',
            hasShippingService: !!shippingDataAtCreation.service,
            willCreateDeliveryOrder: shippingDataAtCreation.option === 'delivery' && !!shippingDataAtCreation.service
          });
          console.log('🚚 FRONTEND: === END DEBUG ===');
          
          const data = await response.json();
          setClientSecret(data.clientSecret);
        } catch (error: any) {
          console.error("Error creating payment intent:", error);
          
          // Enhanced error handling for payment intent creation
          let errorMessage = "Unable to initialize payment. Please try again.";
          let errorTitle = "Payment Setup Failed";
          
          // Check for specific Stripe setup error
          if (error.message && error.message.includes("payment setup incomplete")) {
            errorTitle = "Store Payment Setup Required";
            errorMessage = "This store hasn't completed their payment setup yet. Please contact the business owner to complete their Stripe payment configuration before placing orders.";
          } else if (error.response?.status === 400) {
            // Try to parse error response for more details
            try {
              const errorData = await error.response.json();
              if (errorData.errorType === "stripe_setup_required") {
                errorTitle = "Payment Processing Unavailable";
                errorMessage = "The business owner needs to complete their payment setup. Please contact them directly to arrange payment or ask them to complete their Stripe setup in their dashboard.";
              } else {
                errorMessage = errorData.message || "Invalid payment details. Please check your order and try again.";
              }
            } catch {
              errorMessage = "Invalid payment details. Please check your order and try again.";
            }
          } else if (error.name === "ApiRequestError" && error.message.includes("stripe_setup_required")) {
            errorTitle = "Payment Processing Unavailable";
            errorMessage = "The business owner needs to complete their payment setup. Please contact them directly to arrange payment or ask them to complete their Stripe setup in their dashboard.";
          } else if (error.name === "ApiRequestError") {
            // Enhanced error parsing for API request errors
            try {
              const errorResponse = JSON.parse(error.message);
              if (errorResponse.errorType === "stripe_setup_required") {
                errorTitle = "Payment Processing Unavailable";
                errorMessage = "The business owner needs to complete their payment setup. Please contact them directly to arrange payment or ask them to complete their Stripe setup in their dashboard.";
              } else {
                errorMessage = errorResponse.message || error.message || "Unable to process payment. Please try again.";
              }
            } catch {
              errorMessage = error.message || "Unable to process payment. Please try again.";
            }
          } else if (error.response?.status === 429) {
            errorMessage = "Too many payment attempts. Please wait a moment and try again.";
          } else if (error.response?.status >= 500) {
            errorMessage = "Payment service temporarily unavailable. Please try again later.";
          } else if (error.message) {
            errorMessage = error.message;
          }
          
          toast({
            title: errorTitle,
            description: errorMessage,
            variant: "destructive",
            duration: 10000, // Show longer for Stripe setup errors
          });
        } finally {
          setIsCreatingIntent(false);
        }
      }
    };

    createPaymentIntent();
  }, [cart.length, wholesaler?.id, !!customerData.name, !!customerData.email, !!customerData.phone, !!customerData.shippingOption, customerData.selectedShippingService?.serviceId, totalAmount, clientSecret, isCreatingIntent]); // FIXED: Include selectedShippingService.serviceId to recreate payment intent when delivery service changes

  if (!clientSecret) {
    return (
      <div className="text-center py-8">
        <div className="flex flex-col items-center space-y-4">
          {/* Enhanced Loading Animation */}
          <div className="flex space-x-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-7 bg-gradient-to-t from-green-400 to-emerald-500 rounded-full animate-bounce"
                style={{
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
      options={{ clientSecret }}
    >
      <PaymentFormContent onSuccess={onSuccess} totalAmount={totalAmount} wholesaler={wholesaler} />
    </Elements>
  );
};

// Separate component for the actual form content
const PaymentFormContent = ({ onSuccess, totalAmount, wholesaler }: { 
  onSuccess: (orderData?: any) => void;
  totalAmount: number;
  wholesaler: any;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
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

    if (!stripe || !elements) {
      console.error('💳 Payment Error: Stripe or Elements not loaded');
      return;
    }

    console.log('💳 Starting payment confirmation process...');
    setIsProcessing(true);

    try {
      console.log('💳 Calling stripe.confirmPayment...');
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
        redirect: "if_required",
      });

      console.log('💳 Payment confirmation result:', { error, paymentIntent });

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
          errorMessage = "There's an issue with the payment setup. Please contact the business owner or try again later.";
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
            onSuccess({
              orderNumber: orderData.orderNumber || `Order #${orderData.orderId}`,
              cart: cart,
              customerData: customerData,
              totalAmount: totalAmount,
              subtotal: totalAmount * 0.85, // Approximate subtotal
              transactionFee: totalAmount * 0.15, // Approximate fees and shipping
              shippingCost: customerData.selectedShippingService?.price || 0
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
            onSuccess({
              orderNumber: `Order #${paymentIntent.id.slice(-8)}`,
              cart: cart,
              customerData: customerData,
              totalAmount: totalAmount,
              subtotal: totalAmount * 0.85, // Approximate subtotal
              transactionFee: totalAmount * 0.15, // Approximate fees and shipping
              shippingCost: customerData.selectedShippingService?.price || 0
            });
          }
        } catch (orderError) {
          console.error('❌ Error creating order:', orderError);
          
          // Still call success callback even if order creation failed, payment succeeded
          onSuccess({
            orderNumber: `Order #${paymentIntent.id.slice(-8)}`,
            cart: cart,
            customerData: customerData,
            totalAmount: totalAmount,
            subtotal: totalAmount * 0.85, // Approximate subtotal
            transactionFee: totalAmount * 0.15, // Approximate fees and shipping
            shippingCost: customerData.selectedShippingService?.price || 0
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
      setIsProcessingPayment(false);
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
            <InfoTooltip content="All payments are processed securely through Stripe, a trusted payment platform used by millions of businesses worldwide. Your card details are never stored on our servers.">
              <HelpCircle className="w-3 h-3 text-blue-600 cursor-help" />
            </InfoTooltip>
          </div>
          <p>Your payment is processed securely through Stripe. Transaction fee (5.5% + £0.50) is included in the total.</p>
        </div>

        <ButtonLoader
          isLoading={isProcessing}
          variant="success"
          size="lg"
          disabled={!stripe}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
        >
          Pay {getCurrencySymbol(wholesaler?.defaultCurrency)}{totalAmount.toFixed(2)}
        </ButtonLoader>
      </form>

      {/* Payment Failure Dialog */}
      <Dialog open={paymentFailureDialog.isOpen} onOpenChange={(open) => setPaymentFailureDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <PaymentError
            title={paymentFailureDialog.title}
            message={paymentFailureDialog.message}
            onRetry={() => setPaymentFailureDialog(prev => ({ ...prev, isOpen: false }))}
            showHome={false}
            className="border-0 bg-transparent"
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default function CustomerPortal() {
  const { id: wholesalerIdParam } = useParams<{ id: string }>();
  const [location] = useLocation();
  const { toast } = useToast();

  // Detect if this is preview mode (accessed via /preview-store)
  const isPreviewMode = location === '/preview-store';
  
  // Get authenticated user only for preview mode - TEMPORARILY DISABLED
  const { data: user } = useQuery<{
    id?: string;
    role?: string;
    wholesalerId?: string;
  }>({
    queryKey: ["/api/auth/user"],
    enabled: false, // DISABLED to prevent infinite loops
    retry: false,
    staleTime: Infinity,
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
    const rawId = wholesalerIdParam || (location.includes('/store/') ? location.split('/store/')[1] : location.split('/customer/')[1]);
    // Decode URL encoding and remove query parameters
    const decodedId = rawId ? decodeURIComponent(rawId) : undefined;
    const cleanId = decodedId ? decodedId.split('?')[0] : undefined;
    return cleanId;
  }, [wholesalerIdParam, location]);



  // Customer authentication state - using server sessions
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticatedCustomer, setAuthenticatedCustomer] = useState<any>(null);

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
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
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
    enabled: !!wholesalerId && !isPreviewMode,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchInterval: 10 * 60 * 1000, // Check every 10 minutes
  });
  const [showHomePage, setShowHomePage] = useState(true);
  // Check if coming from CustomerLogin with auth parameter or if user wants to login
  const urlParams = useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);
  const hasAuthParam = urlParams.has('auth');
  const forceLoginParam = urlParams.has('login');
  
  const [showAuth, setShowAuth] = useState(() => !isPreviewMode && (!hasAuthParam || forceLoginParam));
  const [isGuestMode, setIsGuestMode] = useState(true);

  // State management
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [featuredProductId, setFeaturedProductId] = useState<number | null>(() => {
    // Initialize from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const urlFeatured = urlParams.get('featured');
    return urlFeatured ? parseInt(urlFeatured, 10) : null;
  });
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  
  // Tab state for modern interface
  const [activeTab, setActiveTab] = useState("home");
  
  // Wholesaler search state
  const [showWholesalerSearch, setShowWholesalerSearch] = useState(false);
  

  const [wholesalerSearchQuery, setWholesalerSearchQuery] = useState("");
  
  // Fetch available wholesalers for search
  const { data: availableWholesalers = [], isLoading: wholesalersLoading } = useQuery({
    queryKey: ["/api/marketplace/wholesalers", wholesalerSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (wholesalerSearchQuery) params.append("search", wholesalerSearchQuery);
      
      const response = await fetch(`/api/marketplace/wholesalers?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch wholesalers");
      return response.json();
    },
    enabled: showWholesalerSearch, // Only fetch when search is open
  });

  // Early return if no wholesaler ID
  if (!wholesalerId) {
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
  } | null>(null);
  const [availableShippingServices, setAvailableShippingServices] = useState<any[]>([]);
  const [loadingShippingQuotes, setLoadingShippingQuotes] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    notes: '',
    shippingOption: 'pickup',
    selectedShippingService: undefined
  });
  
  // Update customer data when authenticated customer becomes available
  useEffect(() => {
    if (authenticatedCustomer && (!customerData.name || !customerData.email || !customerData.phone)) {
      setCustomerData(prevData => ({
        ...prevData,
        name: authenticatedCustomer.name || 'Michael Ogunjemilua',
        email: authenticatedCustomer.email || 'mogunjemilua@gmail.com',
        phone: authenticatedCustomer.phone || authenticatedCustomer.phoneNumber || '+447507659550'
      }));
    }
  }, [authenticatedCustomer, customerData.name, customerData.email, customerData.phone]);
  
  // Debug: Log state changes
  useEffect(() => {
    console.log('🚚 FRONTEND: customerData.shippingOption changed to:', customerData.shippingOption);
  }, [customerData.shippingOption]);

  // Fetch shipping quotes for customer delivery
  const fetchShippingQuotes = async () => {
    if (!customerData.address || !customerData.city || !customerData.postalCode) {
      toast({
        title: "Address Required",
        description: "Please complete your address to get shipping quotes",
        variant: "destructive"
      });
      return;
    }

    setLoadingShippingQuotes(true);
    try {
      // Enhanced shipping request with precise unit configuration
      console.log("📦 Sending enhanced shipping request with cart items for precise calculation");
      
      // Debug: Log cart items with unit configuration
      console.log("📦 Cart items for shipping:", cart.map(item => ({
        name: item.product.name,
        packQuantity: item.product.packQuantity,
        unitSize: item.product.unitSize,
        unitOfMeasure: item.product.unitOfMeasure,
        quantity: item.quantity
      })));
      
      const response = await apiRequest("POST", "/api/customer/shipping/quotes", {
        collectionAddress: {
          contactName: wholesaler?.businessName || "Business Pickup",
          property: wholesaler?.businessAddress?.split(',')[0] || "1",
          street: wholesaler?.businessAddress?.split(',')[1] || "Business Street",
          town: wholesaler?.businessAddress?.split(',')[2] || "City",
          postcode: wholesaler?.businessPostcode || "SW1A 1AA",
          countryIsoCode: 'GBR'
        },
        deliveryAddress: {
          contactName: customerData.name,
          property: customerData.address,
          street: customerData.address,
          town: customerData.city,
          postcode: customerData.postalCode,
          countryIsoCode: 'GBR'
        },
        // Send cart items for precise shipping calculation
        cartItems: cart.map(item => ({
          product: {
            // Unit configuration fields for precise calculation
            packQuantity: item.product.packQuantity,
            unitOfMeasure: item.product.unitOfMeasure,
            unitSize: item.product.unitSize,
            individualUnitWeight: item.product.individualUnitWeight,
            totalPackageWeight: item.product.totalPackageWeight,
            packageDimensions: item.product.packageDimensions,
            // Fallback fields for compatibility
            unitWeight: item.product.unitWeight || item.product.unit_weight,
            palletWeight: item.product.palletWeight || item.product.pallet_weight,
            price: item.product.price
          },
          quantity: item.quantity,
          sellingType: item.sellingType,
          unitPrice: item.sellingType === "pallets" ? item.product.palletPrice : item.product.price
        })),
        // Fallback parcels for backward compatibility
        parcels: [{
          weight: Math.max(2, cart.reduce((totalWeight, item) => {
            // Calculate weight based on actual product unit weights and quantities
            // Check both camelCase and snake_case field names for compatibility
            const unitWeight = parseFloat(item.product.unitWeight || item.product.unit_weight || "0") || 0;
            const palletWeight = parseFloat(item.product.palletWeight || item.product.pallet_weight || "0") || 0;
            
            let itemWeight = 0;
            if (item.sellingType === "pallets" && palletWeight > 0) {
              itemWeight = palletWeight * item.quantity;
            } else if (unitWeight > 0) {
              itemWeight = unitWeight * item.quantity;
            } else {
              // Fallback to value-based calculation only if no weight data available
              itemWeight = Math.floor((parseFloat(item.product.price) || 0) * item.quantity / 50);
            }
            
            return totalWeight + itemWeight;
          }, 0)),
          length: 30,
          width: 20,
          height: 15,
          value: cartStats.totalValue
        }]
      });

      // Parse the JSON response
      const data = await response.json();
      console.log("Shipping quotes response:", data);
      console.log("Response quotes array:", data.quotes);
      console.log("Quotes length:", data.quotes?.length);
      
      if (data.quotes && data.quotes.length > 0) {
        console.log("Setting available shipping services:", data.quotes);
        console.log("📦 Enhanced shipping calculation:", {
          preciseCalculation: data.preciseCalculation,
          totalWeight: data.totalWeight,
          recommendations: data.recommendations
        });
        
        setAvailableShippingServices(data.quotes);
        
        const calculationType = data.preciseCalculation ? "precise unit configuration" : "estimated";
        const weightInfo = data.totalWeight ? ` (${data.totalWeight}kg total)` : '';
        
        toast({
          title: data.demoMode ? "Demo Shipping Options" : "Shipping Quotes Retrieved",
          description: `Found ${data.quotes.length} delivery options using ${calculationType}${weightInfo}${data.demoMode ? ' - demo mode' : ''}`,
        });
        
        // Show recommendations if available
        if (data.recommendations && data.recommendations.warnings.length > 0) {
          toast({
            title: "Shipping Information",
            description: data.recommendations.warnings.join(', '),
            variant: "default"
          });
        }
      } else {
        console.log("No quotes found in response");
        setAvailableShippingServices([]);
        toast({
          title: "No Shipping Options",
          description: "No shipping services available for your location",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("Error fetching shipping quotes:", error);
      toast({
        title: "Shipping Error",
        description: error.message || "Failed to get shipping quotes",
        variant: "destructive"
      });
    } finally {
      setLoadingShippingQuotes(false);
    }
  };

  // Featured product ID is now managed by state initialized from URL

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
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false,
    refetchOnReconnect: false,
    refetchIntervalInBackground: false,
  });

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
    refetchInterval: false, // Disable auto-refresh
    refetchIntervalInBackground: false,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000
  });

  // Fetch all products for the wholesaler with controlled refresh
  const { data: products = [], isLoading: productsLoading, error: productsError, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ['wholesaler-products', wholesalerId],
    queryFn: async () => {
      console.log(`🛒 Fetching products for wholesaler: ${wholesalerId}`);
      console.log(`🌐 Current domain: ${window.location.origin}`);
      console.log(`🔍 Fetching products for wholesaler: ${wholesalerId}`);
      const response = await fetch(`/api/customer-products/${wholesalerId}`);
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
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Helper function to calculate promotional pricing for display
  const calculatePromotionalPricing = (product: Product, quantity: number = 1) => {
    const basePrice = parseFloat(product.price) || 0;
    return PromotionalPricingCalculator.calculatePromotionalPricing(
      basePrice,
      quantity,
      product.promotionalOffers || [],
      product.promoPrice ? parseFloat(product.promoPrice) : undefined,
      product.promoActive
    );
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

  const cartStats = useMemo(() => {
    let totalItems = 0; // For display - only user-selected quantities
    let totalPromotionalItems = 0; // For calculations - includes free items
    let subtotal = 0;
    let appliedPromotions: string[] = [];
    let freeShippingApplied = false;
    let bogoffDetails: any[] = [];

    // Calculate each item with full promotional support
    cart.forEach(item => {
      let itemPrice = 0;
      const itemQuantity = Number(item.quantity) || 0; // Ensure numeric
      
      if (item.sellingType === "pallets") {
        itemPrice = parseFloat(item.product.palletPrice || "0") || 0;
        totalItems += itemQuantity;
        totalPromotionalItems += itemQuantity;
        subtotal += itemPrice * itemQuantity;
      } else {
        const basePrice = parseFloat(item.product.price) || 0;
        const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
          basePrice,
          itemQuantity,
          item.product.promotionalOffers || [],
          item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
          item.product.promoActive
        );
        
        // Use effective price and total quantity (includes free items from BOGOFF)
        itemPrice = pricing.effectivePrice;
        totalItems += itemQuantity; // Only user-selected quantity for display
        totalPromotionalItems += pricing.totalQuantity; // Includes free items for calculations
        subtotal += pricing.totalCost;
        
        console.log(`Cart item ${item.product.name}: quantity=${itemQuantity}, totalItems=${totalItems}, totalPromotionalItems=${totalPromotionalItems}`);
        
        // Track applied promotions
        if (pricing.appliedOffers.length > 0) {
          appliedPromotions.push(...pricing.appliedOffers);
        }
        
        // Track BOGOFF details
        if (pricing.bogoffDetails) {
          bogoffDetails.push({
            productName: item.product.name,
            ...pricing.bogoffDetails
          });
        }
        
        // Check for free shipping offers
        if (item.product.promotionalOffers?.some(offer => 
          offer.type === 'free_shipping' && 
          offer.minimumOrderValue && 
          subtotal >= offer.minimumOrderValue
        )) {
          freeShippingApplied = true;
        }
      }
    });
    
    // Calculate shipping cost (consider free shipping promotions)
    let shippingCost = 0;
    if (customerData.shippingOption === 'delivery') {
      if (freeShippingApplied) {
        shippingCost = 0;
        if (!appliedPromotions.includes('Free Shipping')) {
          appliedPromotions.push('Free Shipping');
        }
      } else if (customerData.selectedShippingService) {
        shippingCost = customerData.selectedShippingService.price || 90.00; // Default £90 for custom quotes
      } else {
        // For "Custom Quote Required" delivery without selected service
        shippingCost = 90.00; // Default delivery cost
      }
    }
      
    const totalValue = subtotal + shippingCost;
    
    // Ensure values are never NaN
    return { 
      totalItems: isNaN(totalItems) ? 0 : totalItems, // Display count - user selections only
      totalPromotionalItems: isNaN(totalPromotionalItems) ? 0 : totalPromotionalItems, // Calculation count - includes free items
      subtotal: isNaN(subtotal) ? 0 : subtotal,
      shippingCost: isNaN(shippingCost) ? 0 : shippingCost,
      totalValue: isNaN(totalValue) ? 0 : totalValue,
      appliedPromotions,
      freeShippingApplied,
      bogoffDetails
    };
  }, [cart, customerData.shippingOption, customerData.selectedShippingService]);



  // Event handlers
  const openQuantityEditor = useCallback((product: Product) => {
    if (isPreviewMode) {
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
  }, [isPreviewMode, toast]);

  const openNegotiation = useCallback((product: Product) => {
    if (isPreviewMode) {
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
  }, [isPreviewMode, toast]);

  const addToCart = useCallback((product: Product, quantity: number, sellingType: "units" | "pallets" = "units") => {
    if (isPreviewMode) {
      toast({
        title: "Preview Mode",
        description: "Cart functionality is disabled in preview mode.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate quantity meets MOQ requirements
    const minQuantity = sellingType === "pallets" ? (product.palletMoq || 1) : product.moq;
    if (quantity < minQuantity) {
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
  }, [toast, isPreviewMode]);

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
    const maxQuantity = selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock;
    
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
      customerPhone: customerData.phone || '+447507659550' // TEMP FIX: Use known phone for Michael Ogunjemilua
    });
  };

  // Authentication handlers
  const handleAuthSuccess = (customer: any) => {
    console.log("🎉 handleAuthSuccess called with customer:", customer);
    setAuthenticatedCustomer(customer);
    setIsAuthenticated(true);
    setShowAuth(false);
    setIsGuestMode(false);
    
    // Refetch session to confirm it's saved
    refetchSession();
    
    toast({
      title: "Welcome!",
      description: `Hello ${customer.name}, you're now logged in.`,
    });
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

  // Authentication state management using server sessions
  useEffect(() => {
    if (isPreviewMode) {
      // In preview mode, skip authentication
      setShowAuth(false);
      setIsGuestMode(false);
      return;
    }

    if (!wholesalerId || sessionLoading) {
      return; // Wait for wholesalerId and session check to complete
    }

    // Check if user explicitly wants to login (force login parameter)
    if (forceLoginParam) {
      console.log('🔑 Force login requested - showing auth screen');
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
      return;
    }
    
    // No valid authentication - show authentication screen
    console.log('🔐 No valid authentication found, showing auth screen');
    setIsAuthenticated(false);
    setAuthenticatedCustomer(null);
    setShowAuth(true);
    setIsGuestMode(true);
  }, [isPreviewMode, wholesalerId, sessionLoading, sessionData, forceLoginParam]);



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

  // Show loading screen if wholesalerId is not available yet
  if (!wholesalerId && !isPreviewMode) {
    console.log('⏳ Waiting for wholesalerId...');
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
          <p className="text-gray-600 text-center">Loading store...</p>
        </div>
      </div>
    );
  }

  // Show authentication screen (3-step process)
  if (showAuth && !isPreviewMode && wholesalerId) {
    console.log('🔐 Showing 3-step authentication screen');
    return <CustomerAuth 
      wholesalerId={wholesalerId} 
      onAuthSuccess={handleAuthSuccess}
    />;
  }

  // Show thank you page after successful order
  if (showThankYou && completedOrder && wholesaler && isAuthenticated) {
    console.log('🎉 Showing thank you page');
    return <ThankYouPage
      orderNumber={completedOrder.orderNumber}
      cart={completedOrder.cart}
      customerData={completedOrder.customerData}
      totalAmount={completedOrder.totalAmount}
      subtotal={completedOrder.subtotal}
      transactionFee={completedOrder.transactionFee}
      shippingCost={completedOrder.shippingCost}
      wholesaler={{
        businessName: wholesaler?.businessName || 'Business',
        email: wholesaler?.email || 'hello@business.com',
        phone: wholesaler?.businessPhone || wholesaler?.phone || '+44000000000'
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
      {isPreviewMode && (
        <div className="bg-orange-500 text-white px-4 py-2 text-center text-sm font-medium">
          🔍 Store Preview Mode - Cart and checkout features are disabled for testing
        </div>
      )}

      {/* Header - Mobile Responsive */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            {/* Center Section - Store Info with Logo */}
            <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1 sm:justify-center">
              {/* Wholesaler Logo */}
              {wholesaler?.logoUrl ? (
                <img 
                  src={wholesaler.logoUrl} 
                  alt={wholesaler.businessName || "Business logo"} 
                  className="h-8 w-8 rounded-lg object-contain flex-shrink-0"
                />
              ) : wholesaler?.logoType === "business" && wholesaler?.businessName ? (
                <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white">
                    {wholesaler.businessName
                      .split(' ')
                      .map((word: string) => word.charAt(0).toUpperCase())
                      .join('')
                      .substring(0, 2)}
                  </span>
                </div>
              ) : (
                <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white">
                    {wholesaler?.businessName ? (
                      wholesaler.businessName.charAt(0).toUpperCase() + 
                      (wholesaler.businessName.split(' ')[1]?.charAt(0).toUpperCase() || wholesaler.businessName.charAt(1).toUpperCase())
                    ) : 'QP'}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                  {wholesalerLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-0.5">
                        {[...Array(2)].map((_, i) => (
                          <div
                            key={i}
                            className="w-1 h-4 bg-gradient-to-t from-green-400 to-emerald-500 rounded-full animate-pulse"
                            style={{
                              animationDelay: `${i * 0.2}s`,
                              animationDuration: '1.5s'
                            }}
                          />
                        ))}
                      </div>
                      <span className="hidden sm:inline">Loading...</span>
                      <span className="sm:hidden">...</span>
                    </div>
                  ) : wholesalerError ? (
                    "Store Unavailable"
                  ) : (
                    wholesaler?.businessName || "Wholesale Store"
                  )}
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 truncate hidden sm:block">
                  {wholesaler?.storeTagline || "Premium wholesale products"}
                </p>
              </div>
            </div>
            
            {/* Action Buttons - Mobile Stack */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-end">
              {/* Contact Wholesaler button for guests */}
              {isGuestMode && (
                <Button
                  onClick={() => window.location.href = '/'}
                  variant="outline"
                  size="sm"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50 text-xs sm:text-sm"
                >
                  <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Back to Quikpik</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              )}
              


              {/* Home and Logout buttons for authenticated customers */}
              {isAuthenticated && !isPreviewMode && (
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="border-red-300 text-red-600 hover:bg-red-50 text-xs sm:text-sm"
                >
                  <span className="hidden sm:inline">Log out</span>
                  <span className="sm:hidden">Logout</span>
                </Button>
              )}

              {/* Find Seller button for authenticated customers */}
              {isAuthenticated && !isPreviewMode && (
                <Button
                  onClick={() => setShowWholesalerSearch(true)}
                  variant="outline"
                  size="sm"
                  className="border-emerald-300 text-emerald-600 hover:bg-emerald-50 text-xs sm:text-sm font-medium"
                >
                  <Search className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Find Seller</span>
                  <span className="sm:hidden">Seller</span>
                </Button>
              )}
              

              {!isPreviewMode && (
                <Button
                  onClick={() => setShowCheckout(true)}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 relative text-xs sm:text-sm"
                  disabled={cart.length === 0}
                >
                  <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Cart ({cartStats.totalItems})</span>
                  <span className="sm:hidden">({cartStats.totalItems})</span>
                  {cartStats.totalItems > 0 && (
                    <Badge className="ml-1 sm:ml-2 bg-green-800 text-xs">
                      {getCurrencySymbol(wholesaler?.defaultCurrency)}{cartStats.totalValue.toFixed(2)}
                    </Badge>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Wholesaler Search Modal */}
      {showWholesalerSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-25 z-50 flex items-start justify-center pt-20">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-96 overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Find Other Sellers</h3>
                <Button
                  onClick={() => setShowWholesalerSearch(false)}
                  variant="ghost"
                  size="sm"
                >
                  ×
                </Button>
              </div>
              <div className="mt-3">
                <Input
                  placeholder="Search by business name..."
                  value={wholesalerSearchQuery}
                  onChange={(e) => setWholesalerSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="max-h-80 overflow-y-auto">
              {wholesalersLoading ? (
                <div className="p-4 space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-3 animate-pulse">
                      <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : availableWholesalers.length > 0 ? (
                <div className="p-2">
                  {availableWholesalers.map((wholesalerItem: any) => (
                    <button
                      key={wholesalerItem.id}
                      onClick={() => {
                        // Close the search modal first
                        setShowWholesalerSearch(false);
                        
                        // Navigate to the selected wholesaler's store
                        // This will trigger the SMS verification flow if not authenticated
                        window.location.href = `/store/${wholesalerItem.id}`;
                      }}
                      className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      {/* Wholesaler Logo */}
                      {wholesalerItem.logoUrl ? (
                        <img 
                          src={wholesalerItem.logoUrl} 
                          alt={wholesalerItem.businessName || "Business logo"} 
                          className="w-10 h-10 rounded-lg object-contain flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-white">
                            {wholesalerItem.businessName ? (
                              wholesalerItem.businessName
                                .split(' ')
                                .map((word: string) => word.charAt(0).toUpperCase())
                                .join('')
                                .substring(0, 2)
                            ) : 'WS'}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex-1 text-left">
                        <h4 className="font-medium text-gray-900">{wholesalerItem.businessName || "Business"}</h4>
                        <p className="text-sm text-gray-600">{wholesalerItem.storeTagline || "Wholesale products"}</p>
                        {wholesalerItem.location && (
                          <p className="text-xs text-gray-500 flex items-center mt-1">
                            <MapPin className="w-3 h-3 mr-1" />
                            {wholesalerItem.location}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {wholesalerItem.rating && (
                          <div className="flex items-center">
                            <Star className="w-4 h-4 text-yellow-400 fill-current" />
                            <span className="text-sm text-gray-600 ml-1">{wholesalerItem.rating}</span>
                          </div>
                        )}
                        <Building2 className="w-4 h-4 text-gray-400" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {wholesalerSearchQuery ? "No stores found matching your search" : "Start typing to search for stores"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 lg:py-8">
        {/* Guest Mode Notice */}
        {isGuestMode && (
          <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Package className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">
                  Ready to Shop?
                </h3>
                <p className="text-blue-700 mb-4">
                  To view pricing and place orders, you need to be added as a contact by the wholesaler first. 
                  Once added, you'll be able to sign in and access all features including pricing, ordering, and collection options.
                </p>
                <div className="flex items-center space-x-4">
                  <Button
                    onClick={() => window.location.href = '/'}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Contact Wholesaler
                  </Button>
                  <div className="text-sm text-blue-600">
                    <span className="font-medium">Need help?</span> Contact {wholesaler?.businessName} to get started
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modern Tab Navigation - Only for authenticated users */}
        {isAuthenticated && !isGuestMode && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="home" className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Home
              </TabsTrigger>
              <TabsTrigger value="products" className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Products
              </TabsTrigger>
              <TabsTrigger value="orders" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Order History
              </TabsTrigger>
              <TabsTrigger value="account" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Account
              </TabsTrigger>
            </TabsList>

            <TabsContent value="home" className="space-y-6">
              {/* Welcome Section */}
              <div className="bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg p-6 text-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold mb-2">
                      Welcome back, {authenticatedCustomer?.firstName || authenticatedCustomer?.name}!
                    </h1>
                    <p className="text-emerald-100">
                      Shopping at {wholesaler?.businessName}
                    </p>
                  </div>
                  <div className="mt-4 sm:mt-0">
                    <Button
                      onClick={() => setActiveTab("products")}
                      className="bg-white text-emerald-600 hover:bg-gray-50"
                    >
                      <Package className="w-4 h-4 mr-2" />
                      Browse All Products
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-4 border">
                  <div className="flex items-center">
                    <ShoppingCart className="w-8 h-8 text-emerald-600 mr-3" />
                    <div>
                      <p className="text-sm text-gray-600">Items in Cart</p>
                      <p className="text-2xl font-bold">
                        {cart.reduce((total, item) => total + item.quantity, 0)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border">
                  <div className="flex items-center">
                    <PriceDisplay
                      price={cartStats.totalValue}
                      currency="GBP"
                      isGuestMode={false}
                      size="large"
                    />
                    <div className="ml-3">
                      <p className="text-sm text-gray-600">Cart Total</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border">
                  <div className="flex items-center">
                    <History className="w-8 h-8 text-emerald-600 mr-3" />
                    <div>
                      <p className="text-sm text-gray-600">Total Orders</p>
                      <p className="text-2xl font-bold">{customerOrderStats?.totalOrders || 0}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Selling Products */}
              <div className="bg-white rounded-lg p-6 border">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Top Selling Products</h2>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("products")}
                    className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
                  >
                    View All Products
                  </Button>
                </div>
                
                {productsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                      <ProductCardSkeleton key={i} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products?.slice(0, 3).map((product) => {
                      const cartItem = cart.find(item => item.product.id === product.id);
                      const pricing = calculatePromotionalPricing(product, product.moq);
                      
                      return (
                        <Card key={product.id} className="h-full hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              {/* Product Image */}
                              <div className="relative h-32 bg-gray-100 rounded-lg overflow-hidden">
                                {product.imageUrl ? (
                                  <img
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Package className="w-8 h-8 text-gray-400" />
                                  </div>
                                )}
                                {product.promoActive && (
                                  <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">
                                    SALE
                                  </div>
                                )}
                              </div>

                              {/* Product Info */}
                              <div>
                                <h3 className="font-semibold text-gray-900 line-clamp-2">{product.name}</h3>
                                {product.description && (
                                  <p className="text-sm text-gray-600 line-clamp-2">{product.description}</p>
                                )}
                              </div>

                              {/* Pricing */}
                              <div className="flex items-center justify-between">
                                <div>
                                  <PriceDisplay
                                    price={pricing.effectivePrice}
                                    originalPrice={product.promoActive ? parseFloat(product.price) : undefined}
                                    currency="GBP"
                                    isGuestMode={false}
                                    size="medium"
                                    showStrikethrough={true}
                                  />
                                  <p className="text-xs text-gray-500">MOQ: {product.moq} units</p>
                                </div>
                              </div>

                              {/* Quick Order Controls */}
                              <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-600">
                                  Stock: {formatNumber(product.stock)}
                                </div>
                                
                                <div className="flex items-center space-x-2">
                                  {cartItem ? (
                                    <div className="flex items-center space-x-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          if (cartItem.quantity <= product.moq) {
                                            setCart(cart.filter(item => item.product.id !== product.id));
                                          } else {
                                            const updatedCart = cart.map(item => 
                                              item.product.id === product.id 
                                                ? { ...item, quantity: item.quantity - 1 }
                                                : item
                                            );
                                            setCart(updatedCart);
                                          }
                                        }}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <span className="text-sm font-medium w-8 text-center">
                                        {cartItem.quantity}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const updatedCart = cart.map(item => 
                                            item.product.id === product.id 
                                              ? { ...item, quantity: item.quantity + 1 }
                                              : item
                                          );
                                          setCart(updatedCart);
                                        }}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => addToCart(product, product.moq)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Quick Add
                                    </Button>
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

              {/* Quick Actions */}
              <div className="bg-white rounded-lg p-6 border">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("products")}
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                  >
                    <Package className="w-6 h-6" />
                    <span className="text-sm">Browse Products</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("orders")}
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                  >
                    <History className="w-6 h-6" />
                    <span className="text-sm">Order History</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => cart.length > 0 ? setShowCheckout(true) : setActiveTab("products")}
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                  >
                    <ShoppingCart className="w-6 h-6" />
                    <span className="text-sm">
                      {cart.length > 0 ? `Checkout (${cart.length})` : "Start Shopping"}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      localStorage.removeItem('customerAuthData');
                      window.location.reload();
                    }}
                    className="h-20 flex flex-col items-center justify-center space-y-2"
                  >
                    <User className="w-6 h-6" />
                    <span className="text-sm">Sign Out</span>
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="products" className="space-y-6">
              {/* Product Search and Filters */}
              <div className="bg-white rounded-lg shadow-sm border p-4 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Search Products */}
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search products..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  
                  {/* Category Filter */}
                  <div className="sm:w-64">
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
              </div>

              {/* Products Grid */}
              <div className="space-y-4">
                {productsLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                      <ProductCardSkeleton key={i} />
                    ))}
                  </div>
                ) : productsError ? (
                  <div className="text-center py-12">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load products</h3>
                    <p className="text-gray-500 mb-4">There was an error loading the product catalog.</p>
                    <Button onClick={() => refetchProducts()} variant="outline">
                      Try Again
                    </Button>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-12">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProducts.map((product) => {
                      const pricing = calculatePromotionalPricing(product, 1);
                      const cartItem = cart.find(item => item.product.id === product.id);
                      
                      return (
                        <Card key={product.id} className="group hover:shadow-lg transition-shadow duration-200">
                          <CardContent className="p-4">
                            {/* Product Image */}
                            <div className="relative aspect-square mb-4 bg-gray-50 rounded-lg overflow-hidden">
                              {product.imageUrl ? (
                                <img 
                                  src={product.imageUrl} 
                                  alt={product.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="w-12 h-12 text-gray-300" />
                                </div>
                              )}
                              
                              {/* Sale Badge */}
                              {product.promoActive && product.promoPrice && (
                                <div className="absolute top-2 left-2">
                                  <Badge variant="destructive" className="text-xs">
                                    SALE
                                  </Badge>
                                </div>
                              )}
                            </div>
                            
                            {/* Product Info */}
                            <div className="space-y-3">
                              <div>
                                <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">
                                  {product.name}
                                </h3>
                                {product.description && (
                                  <p className="text-sm text-gray-600 line-clamp-2">
                                    {cleanAIDescription(product.description)}
                                  </p>
                                )}
                              </div>
                              
                              {/* Product Details */}
                              <div className="space-y-2 mb-3">
                                <div className="flex flex-wrap gap-1 text-xs text-gray-600">
                                  {(product as any).size && (
                                    <span className="bg-gray-100 px-2 py-1 rounded">
                                      Size: {(product as any).size}
                                    </span>
                                  )}
                                  {product.moq && product.moq > 1 && (
                                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                      MOQ: {product.moq}
                                    </span>
                                  )}
                                  {product.stock && (
                                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                                      Stock: {product.stock}
                                    </span>
                                  )}
                                  {(product as any).brand && (
                                    <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                                      {(product as any).brand}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {/* Pricing */}
                              <div className="flex items-center justify-between">
                                <PriceDisplay
                                  price={pricing.effectivePrice}
                                  originalPrice={pricing.effectivePrice !== pricing.originalPrice ? pricing.originalPrice : undefined}
                                  currency={'GBP'}
                                  isGuestMode={false}
                                  size="medium"
                                  showStrikethrough={true}
                                />
                                
                                {/* Add to Cart Controls */}
                                <div className="flex items-center space-x-2">
                                  {cartItem ? (
                                    <div className="flex items-center space-x-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          if (cartItem.quantity <= product.moq) {
                                            // Remove item if at or below MOQ
                                            setCart(cart.filter(item => item.product.id !== product.id));
                                          } else {
                                            const updatedCart = cart.map(item => 
                                              item.product.id === product.id 
                                                ? { ...item, quantity: item.quantity - 1 }
                                                : item
                                            );
                                            setCart(updatedCart);
                                          }
                                        }}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <span className="text-sm font-medium w-8 text-center">
                                        {cartItem.quantity}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const updatedCart = cart.map(item => 
                                            item.product.id === product.id 
                                              ? { ...item, quantity: item.quantity + 1 }
                                              : item
                                          );
                                          setCart(updatedCart);
                                        }}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => addToCart(product, product.moq)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Add
                                    </Button>
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

            <TabsContent value="orders" className="space-y-6">
              {/* Customer Order History */}
              {authenticatedCustomer && wholesaler?.id && (
                <CustomerOrderHistory 
                  wholesalerId={wholesaler.id} 
                  customerPhone={authenticatedCustomer.phone || authenticatedCustomer.phoneNumber || '+447507659550'} 
                />
              )}
            </TabsContent>

            <TabsContent value="account" className="space-y-6">
              {/* Account content will be here */}
            </TabsContent>
          </Tabs>
        )}

        {/* Checkout Modal Dialog */}
        <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
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
                  <div className="space-y-2">
                    {cart.map((item, index) => {
                      const pricing = calculatePromotionalPricing(item.product, item.quantity);
                      return (
                        <div key={index} className="flex justify-between items-center">
                          <div className="flex-1">
                            <p className="font-medium">{item.product.name}</p>
                            <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                          </div>
                          <PriceDisplay
                            price={pricing.totalCost}
                            currency="GBP"
                            isGuestMode={false}
                            size="small"
                          />
                        </div>
                      );
                    })}
                    <Separator />
                    
                    {/* Breakdown of charges */}
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Product Subtotal</span>
                        <PriceDisplay
                          price={cartStats.totalValue}
                          currency="GBP"
                          isGuestMode={false}
                          size="small"
                        />
                      </div>
                      
                      {customerData.shippingOption === 'delivery' && customerData.selectedShippingService && (
                        <div className="flex justify-between">
                          <span>Delivery ({customerData.selectedShippingService.serviceName})</span>
                          <PriceDisplay
                            price={customerData.selectedShippingService.price}
                            currency="GBP"
                            isGuestMode={false}
                            size="small"
                          />
                        </div>
                      )}
                      
                      <div className="flex justify-between text-gray-600">
                        <span>Transaction Fee (5.5% + £0.50)</span>
                        <PriceDisplay
                          price={(() => {
                            const subtotal = cartStats.totalValue;
                            const shipping = customerData.shippingOption === 'delivery' && customerData.selectedShippingService 
                              ? customerData.selectedShippingService.price 
                              : 0;
                            const beforeFees = subtotal + shipping;
                            return (beforeFees * 0.055) + 0.50;
                          })()}
                          currency="GBP"
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
                          const subtotal = cartStats.totalValue;
                          const shipping = customerData.shippingOption === 'delivery' && customerData.selectedShippingService 
                            ? customerData.selectedShippingService.price 
                            : 0;
                          const beforeFees = subtotal + shipping;
                          const transactionFee = (beforeFees * 0.055) + 0.50;
                          return beforeFees + transactionFee;
                        })()}
                        currency="GBP"
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
                  <h3 className="font-semibold">Delivery Options</h3>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="pickup"
                        name="shipping"
                        checked={customerData.shippingOption === 'pickup'}
                        onChange={() => setCustomerData(prev => ({...prev, shippingOption: 'pickup'}))}
                        className="w-4 h-4 text-emerald-600"
                      />
                      <Label htmlFor="pickup" className="flex-1 cursor-pointer">
                        <div className="flex justify-between">
                          <span>Pickup from store</span>
                          <span className="text-green-600 font-medium">FREE</span>
                        </div>
                        <p className="text-sm text-gray-600">Collect your order from our location</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="delivery"
                        name="shipping"
                        checked={customerData.shippingOption === 'delivery'}
                        onChange={() => setCustomerData(prev => ({...prev, shippingOption: 'delivery'}))}
                        className="w-4 h-4 text-emerald-600"
                      />
                      <Label htmlFor="delivery" className="flex-1 cursor-pointer">
                        <div className="flex justify-between">
                          <span>Home delivery</span>
                          <span className="text-gray-600">Calculated at checkout</span>
                        </div>
                        <p className="text-sm text-gray-600">We'll deliver to your address</p>
                      </Label>
                    </div>
                  </div>

                  {/* Delivery Address Form */}
                  {customerData.shippingOption === 'delivery' && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-medium">Delivery Address</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <Label htmlFor="address">Street Address</Label>
                          <Input
                            id="address"
                            value={customerData.address}
                            onChange={(e) => setCustomerData(prev => ({...prev, address: e.target.value}))}
                            placeholder="Enter your street address"
                          />
                        </div>
                        <div>
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            value={customerData.city}
                            onChange={(e) => setCustomerData(prev => ({...prev, city: e.target.value}))}
                            placeholder="Enter your city"
                          />
                        </div>
                        <div>
                          <Label htmlFor="postalCode">Postal Code</Label>
                          <Input
                            id="postalCode"
                            value={customerData.postalCode}
                            onChange={(e) => setCustomerData(prev => ({...prev, postalCode: e.target.value}))}
                            placeholder="Enter postal code"
                          />
                        </div>
                      </div>
                      
                      {customerData.address && customerData.city && customerData.postalCode && (
                        <Button
                          onClick={fetchShippingQuotes}
                          disabled={loadingShippingQuotes}
                          className="w-full"
                        >
                          {loadingShippingQuotes ? "Getting shipping quotes..." : "Get Shipping Quotes"}
                        </Button>
                      )}
                      
                      {availableShippingServices.length > 0 && (
                        <div className="space-y-2">
                          <Label>Choose Shipping Service</Label>
                          {availableShippingServices.map((service, index) => (
                            <div key={index} className="flex items-center space-x-2">
                              <input
                                type="radio"
                                id={`service-${index}`}
                                name="shippingService"
                                checked={customerData.selectedShippingService?.serviceId === service.serviceId}
                                onChange={() => setCustomerData(prev => ({
                                  ...prev,
                                  selectedShippingService: service
                                }))}
                                className="w-4 h-4 text-emerald-600"
                              />
                              <Label htmlFor={`service-${index}`} className="flex-1 cursor-pointer">
                                <div className="flex justify-between">
                                  <span>{service.serviceName}</span>
                                  <PriceDisplay
                                    price={service.price}
                                    currency="GBP"
                                    isGuestMode={false}
                                    size="small"
                                  />
                                </div>
                                <p className="text-sm text-gray-600">{service.description}</p>
                              </Label>
                            </div>
                          ))}
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
                  <StripeCheckoutForm
                    cart={cart}
                    customerData={customerData}
                    wholesaler={wholesaler}
                    totalAmount={cartStats.totalValue}
                    onSuccess={(orderData) => {
                      console.log('🛒 Payment successful, received order data:', orderData);
                      
                      // Set completed order data for thank you page
                      setCompletedOrder(orderData);
                      
                      // Clear the cart after successful payment
                      setCart([]);
                      
                      // Close checkout modal and show thank you page
                      setShowCheckout(false);
                      setShowThankYou(true);
                    }}
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Floating Cart Button - Only show when authenticated and cart has items */}
        {isAuthenticated && !isGuestMode && cart.length > 0 && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button
              onClick={() => setShowCheckout(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg h-14 w-14 p-0 relative"
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
