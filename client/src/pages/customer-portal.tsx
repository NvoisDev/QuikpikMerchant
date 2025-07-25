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
import { ShoppingCart, Plus, Minus, Trash2, Package, Star, Store, Mail, Phone, MapPin, CreditCard, Search, Filter, Grid, List, Eye, MoreHorizontal, ShieldCheck, Truck, ArrowLeft, Heart, Share2, Home, HelpCircle } from "lucide-react";
import Logo from "@/components/ui/logo";
import Footer from "@/components/ui/footer";
import { CustomerAuth } from "@/components/customer/CustomerAuth";
import { CustomerHome } from "@/components/customer/CustomerHome";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PromotionalPricingCalculator, type PromotionalOffer } from "@shared/promotional-pricing";
import { getOfferTypeConfig } from "@shared/promotional-offer-utils";

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
  shippingOption: "pickup" | "collection";
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
  onSuccess: () => void;
}

const StripeCheckoutForm = ({ cart, customerData, wholesaler, totalAmount, onSuccess }: StripeCheckoutFormProps) => {
  const [clientSecret, setClientSecret] = useState("");
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const { toast } = useToast();

  // Create payment intent when customer data is complete - only once when form is ready
  useEffect(() => {
    const createPaymentIntent = async () => {
      if (cart.length > 0 && wholesaler && customerData.name && customerData.email && customerData.phone && !clientSecret && !isCreatingIntent) {
        setIsCreatingIntent(true);
        try {
          const response = await apiRequest("POST", "/api/marketplace/create-payment-intent", {
            items: cart.map(item => ({
              productId: item.product.id,
              quantity: item.quantity || 0,
              unitPrice: (() => {
                if (item.sellingType === "pallets") {
                  return parseFloat(item.product.palletPrice || "0") || 0;
                } else {
                  const basePrice = parseFloat(item.product.price) || 0;
                  const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                    basePrice,
                    item.quantity,
                    item.product.promotionalOffers || [],
                    item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                    item.product.promoActive
                  );
                  return pricing.effectivePrice;
                }
              })()
            })),
            customerData,
            wholesalerId: wholesaler.id,
            totalAmount: cart.reduce((total, item) => {
              if (item.sellingType === "pallets") {
                return total + (parseFloat(item.product.palletPrice || "0") * item.quantity);
              } else {
                const basePrice = parseFloat(item.product.price) || 0;
                const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                  basePrice,
                  item.quantity,
                  item.product.promotionalOffers || [],
                  item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                  item.product.promoActive
                );
                return total + pricing.totalCost;
              }
            }, 0), // Send ONLY product subtotal - backend will add transaction fees
            shippingInfo: {
              option: customerData.shippingOption,
              service: customerData.selectedShippingService
            }
          });
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
  }, [cart.length, wholesaler?.id, !!customerData.name, !!customerData.email, !!customerData.phone, totalAmount, clientSecret, isCreatingIntent]);

  if (!clientSecret) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p>Preparing payment...</p>
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
  onSuccess: () => void;
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
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
        redirect: "if_required",
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
        // Payment succeeded - webhook automatically handles order creation and emails
        toast({
          title: "Payment Successful!",
          description: "Your order has been placed successfully. You'll receive a confirmation email shortly.",
        });
        onSuccess();
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
          type="submit"
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
    // Always prioritize URL parameter extraction for customer portal
    const rawId = wholesalerIdParam || (location.includes('/store/') ? location.split('/store/')[1] : location.split('/customer/')[1]);
    // Decode URL encoding and remove query parameters
    const decodedId = rawId ? decodeURIComponent(rawId) : undefined;
    const cleanId = decodedId ? decodedId.split('?')[0] : undefined;
    console.log('🆔 Wholesaler ID calculated:', { rawId, decodedId, cleanId, location, wholesalerIdParam });
    return cleanId;
  }, [wholesalerIdParam, location]);



  // Customer authentication state - simpler initialization
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticatedCustomer, setAuthenticatedCustomer] = useState<any>(null);
  const [showHomePage, setShowHomePage] = useState(true);
  // Check if coming from CustomerLogin with auth parameter
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const hasAuthParam = urlParams.has('auth');
  
  const [showAuth, setShowAuth] = useState(!isPreviewMode && !hasAuthParam);
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
      const response = await apiRequest("POST", "/api/marketplace/shipping/quotes", {
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
            sizePerUnit: item.product.sizePerUnit,
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
      const params = new URLSearchParams();
      if (wholesalerId) params.append('wholesalerId', wholesalerId);
      
      console.log(`Fetching products for wholesaler: ${wholesalerId}`);
      const response = await fetch(`/api/marketplace/products?${params}`);
      if (!response.ok) {
        console.error(`Products fetch failed: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch products: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Products received: ${data.length} items`);
      return data;
    },
    enabled: !!wholesalerId,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    retry: 1,
    retryDelay: 500,
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
    if (customerData.shippingOption === 'collection' && customerData.selectedShippingService) {
      if (freeShippingApplied) {
        shippingCost = 0;
        if (!appliedPromotions.includes('Free Shipping')) {
          appliedPromotions.push('Free Shipping');
        }
      } else {
        shippingCost = customerData.selectedShippingService.price || 0;
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

  // Handle sharing the store
  const handleShare = useCallback(async () => {
    // Ensure we have a valid wholesaler ID
    if (!wholesalerId) {
      toast({
        title: "Unable to Share",
        description: "Store information is still loading. Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }

    // Always use customer portal URL format for sharing
    const customerPortalUrl = `https://quikpik.app/customer/${wholesalerId}`;
    const storeName = wholesaler?.businessName || "Wholesale Store";
    const shareText = `${storeName}\n${customerPortalUrl}\nCheck out ${storeName} - ${wholesaler?.storeTagline || "Premium wholesale products"} available now!`;
    
    console.log("🔗 Share Store Debug:", {
      wholesalerId,
      isPreviewMode,
      customerPortalUrl,
      storeName,
      shareText,
      userRole: user?.role,
      userWholesalerId: user?.wholesalerId,
      userId: user?.id
    });

    // Always use clipboard-only approach to ensure we control the exact URL being shared
    // The Web Share API sometimes adds the current page URL automatically, so we'll bypass it
    try {
      await navigator.clipboard.writeText(shareText);
      toast({
        title: "Store Link Copied!",
        description: `Customer portal link copied: ${customerPortalUrl}`,
      });
      
      console.log("✅ Successfully copied to clipboard:", shareText);
    } catch (error) {
      console.error("❌ Clipboard failed:", error);
      // Fallback: Show the link in toast for manual copying
      toast({
        title: "Share Store",
        description: "Copy this link to share: " + customerPortalUrl,
        duration: 8000,
      });
    }
  }, [wholesalerId, wholesaler?.businessName, wholesaler?.storeTagline, toast, isPreviewMode, user]);

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
      customerPhone: customerData.phone
    });
  };

  // Authentication handlers
  const handleAuthSuccess = (customer: any) => {
    console.log("🎉 handleAuthSuccess called with customer:", customer);
    setAuthenticatedCustomer(customer);
    setIsAuthenticated(true);
    setShowAuth(false);
    setIsGuestMode(false);
    
    toast({
      title: "Welcome!",
      description: `Hello ${customer.name}, you're now logged in.`,
    });
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

  // Single authentication state management effect - prevents infinite loops
  useEffect(() => {
    if (isPreviewMode) {
      // In preview mode, skip authentication
      setShowAuth(false);
      setIsGuestMode(false);
      return;
    }

    if (!wholesalerId) {
      return; // Wait for wholesalerId to be available
    }

    if (isAuthenticated && authenticatedCustomer) {
      // User is authenticated - show main content and save state
      setShowAuth(false);
      setIsGuestMode(false);
      // Save authentication state to localStorage for session persistence
      localStorage.setItem(`customer_auth_${wholesalerId}`, JSON.stringify({
        isAuthenticated: true,
        customer: authenticatedCustomer,
        timestamp: Date.now()
      }));
      return;
    }

    // Check for saved authentication state first
    const savedAuth = localStorage.getItem(`customer_auth_${wholesalerId}`);
    if (savedAuth) {
      try {
        const authData = JSON.parse(savedAuth);
        // Check if auth is less than 24 hours old
        const isRecent = Date.now() - authData.timestamp < 24 * 60 * 60 * 1000;
        
        if (authData.isAuthenticated && authData.customer && isRecent) {
          console.log('🔄 Restoring authentication from localStorage');
          setIsAuthenticated(true);
          setAuthenticatedCustomer(authData.customer);
          setShowAuth(false);
          setIsGuestMode(false);
          return;
        } else if (!isRecent) {
          console.log('🕐 Authentication expired in portal, clearing and redirecting');
          localStorage.removeItem(`customer_auth_${wholesalerId}`);
          // Redirect to customer login page
          window.location.href = '/customer-login';
          return;
        }
      } catch (error) {
        console.error('Error parsing saved auth:', error);
        localStorage.removeItem(`customer_auth_${wholesalerId}`);
      }
    }
    
    // No valid saved auth - show authentication screen
    console.log('🔐 No valid saved authentication, showing auth screen');
    setShowAuth(true);
    setIsGuestMode(true);
  }, [isAuthenticated, isPreviewMode, wholesalerId]); // Removed authenticatedCustomer to prevent infinite loop



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
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading store...</p>
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

  // Show home page
  if (showHomePage && !showAllProducts && !isPreviewMode && isAuthenticated) {
    console.log('🏠 Showing customer home page');
    return <CustomerHome 
      wholesaler={wholesaler}
      featuredProduct={featuredProduct}
      onViewAllProducts={handleViewAllProducts}
      onViewFeaturedProduct={handleViewFeaturedProduct}
      customerData={authenticatedCustomer}
      onLogout={() => {
        setIsAuthenticated(false);
        setAuthenticatedCustomer(null);
        setShowAuth(true);
        setIsGuestMode(true);
        toast({
          title: "Logged out",
          description: "You have been successfully logged out.",
        });
        // Redirect to customer login page (Find Your Store)
        window.location.href = "/customer-login";
        // Redirect to customer login page (Find Your Store)
        window.location.href = "/customer-login";
      }}
    />;
  }

  // Early loading state only for authenticated users with featured products
  if (featuredProductId && featuredLoading && isAuthenticated) {
    console.log('📦 Loading featured product...');
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
            {/* Store Info - Mobile Optimized */}
            <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
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
                      <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
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
                <>
                  <Button
                    onClick={() => {
                      // Smart back navigation based on current view state
                      if (featuredProductId) {
                        // If viewing a featured product, go back to home page
                        setFeaturedProductId(null);
                        setShowHomePage(true);
                        setShowAllProducts(false);
                      } else if (showAllProducts) {
                        // If viewing all products, go back to home page
                        setShowHomePage(true);
                        setShowAllProducts(false);
                      } else {
                        // Already on home page, just ensure state is correct
                        setShowHomePage(true);
                        setShowAllProducts(false);
                        setFeaturedProductId(null);
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-600 hover:bg-gray-50 text-xs sm:text-sm"
                  >
                    <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    {featuredProductId ? 'Back' : (showAllProducts ? 'Home' : 'Home')}
                  </Button>
                  <Button
                    onClick={() => {
                      // Clear localStorage
                      localStorage.removeItem(`customer_auth_${wholesalerId}`);
                      localStorage.clear();
                      sessionStorage.clear();
                      
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
                    }}
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-600 hover:bg-red-50 text-xs sm:text-sm"
                  >
                    <span className="hidden sm:inline">Log out</span>
                    <span className="sm:hidden">Logout</span>
                  </Button>
                </>
              )}
              
              {!isPreviewMode && (
                <Button
                  onClick={handleShare}
                  variant="outline"
                  size="sm"
                  className="border-green-600 text-green-600 hover:bg-green-50 text-xs sm:text-sm"
                >
                  <Share2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Share Store</span>
                  <span className="sm:hidden">Share</span>
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
        
        {/* Featured Product - Mobile Responsive Design */}
        {featuredProduct && (
          <div className="mb-8 sm:mb-12">
            <Card className="overflow-hidden border-0 shadow-lg">
              <CardContent className="p-0">
                <div className="grid lg:grid-cols-2">
                  {/* Product Image - Mobile Optimized */}
                  <div className="relative bg-white flex items-center justify-center p-4 sm:p-6 lg:p-8">
                    {featuredProduct.imageUrl || (featuredProduct.images && featuredProduct.images.length > 0) ? (
                      <img 
                        src={featuredProduct.imageUrl || featuredProduct.images[0]} 
                        alt={featuredProduct.name}
                        className="w-full max-w-sm sm:max-w-md h-auto object-contain"
                      />
                    ) : (
                      <div className="w-full h-60 sm:h-80 lg:h-96 bg-gray-50 flex items-center justify-center rounded-lg">
                        <Package className="w-16 h-16 sm:w-24 sm:h-24 text-gray-300" />
                      </div>
                    )}
                    
                    {/* Sale Badge - Mobile Responsive */}
                    {featuredProduct.promoActive && featuredProduct.promoPrice && (
                      <div className="absolute top-3 left-3 sm:top-6 sm:left-6">
                        <div className="bg-red-500 text-white px-2 py-1 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium">
                          SALE
                        </div>
                      </div>
                    )}
                    
                    {/* Negotiable Badge - Mobile Responsive */}
                    {featuredProduct.negotiationEnabled && (
                      <div className="absolute top-3 right-3 sm:top-6 sm:right-6">
                        <div className="bg-blue-500 text-white px-2 py-1 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium">
                          Negotiable
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Product Details - Mobile Responsive */}
                  <div className="p-4 sm:p-6 lg:p-8 xl:p-12 bg-white">
                    <div className="space-y-4 sm:space-y-6">
                      {/* Title and Category */}
                      <div>
                        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 sm:mb-3">
                          {featuredProduct.name}
                        </h1>
                        {/* Product Tags */}
                        <div className="flex flex-wrap gap-3 mb-4">
                          <span className="inline-block bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-bold">
                            ⭐ FEATURED
                          </span>
                          {featuredProduct.category && (
                            <span className="inline-block bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-medium">
                              {featuredProduct.category}
                            </span>
                          )}
                          {/* Promotional Offers Badges for Featured Product */}
                          {(() => {
                            const badges = [];
                            
                            // Show specific offer badges for promotional offers (only if promo is active)
                            if (featuredProduct.promotionalOffers && Array.isArray(featuredProduct.promotionalOffers) && featuredProduct.promoActive) {
                              featuredProduct.promotionalOffers.forEach((offer, index) => {
                                if (offer.isActive) {
                                  const config = getOfferTypeConfig(offer.type);
                                  badges.push(
                                    <span key={`featured-offer-${index}`} className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${config.color} animate-pulse`}>
                                      {config.emoji} {config.label}
                                    </span>
                                  );
                                }
                              });
                            }
                            
                            // Show general promotional badge if there are promotional prices but no specific badges
                            const pricing = calculatePromotionalPricing(featuredProduct);
                            if (pricing.appliedOffers.length > 0 && badges.length === 0) {
                              badges.push(
                                <span key="featured-general-promo" className="inline-block bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-bold animate-pulse">
                                  🎁 SPECIAL OFFER!
                                </span>
                              );
                            }
                            
                            return badges;
                          })()}
                          {/* Product Size Information */}
                          {featuredProduct.packQuantity && featuredProduct.unitOfMeasure && featuredProduct.unitSize && (
                            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                              📦 {featuredProduct.packQuantity} x {Math.round(parseFloat(featuredProduct.unitSize))}{featuredProduct.unitOfMeasure}
                            </span>
                          )}
                          {featuredProduct.deliveryExcluded && (
                            <span className="inline-block bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                              🚚 Pickup Only
                            </span>
                          )}
                        </div>
                        {featuredProduct.description && (
                          <p className="text-gray-600 text-lg leading-relaxed">
                            {featuredProduct.description}
                          </p>
                        )}
                      </div>
                      
                      {/* Price */}
                      <div className="border-t border-b py-6">
                        {(() => {
                          const pricing = calculatePromotionalPricing(featuredProduct);
                          const hasDiscounts = pricing.effectivePrice < pricing.originalPrice;
                          
                          if (isGuestMode) {
                            return (
                              <div>
                                <PriceDisplay 
                                  price={pricing.effectivePrice}
                                  originalPrice={hasDiscounts ? pricing.originalPrice : undefined}
                                  currency={wholesaler?.defaultCurrency}
                                  isGuestMode={isGuestMode}
                                  size="large"
                                  showStrikethrough={true}
                                />
                                <div className="text-sm text-gray-500 mt-1">Price per unit</div>
                              </div>
                            );
                          }
                          
                          return hasDiscounts ? (
                            <div>
                              <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-4xl font-bold text-green-600">
                                  {getCurrencySymbol(wholesaler?.defaultCurrency)}{pricing.effectivePrice.toFixed(2)}
                                </span>
                                <span className="text-2xl text-gray-400 line-through">
                                  {getCurrencySymbol(wholesaler?.defaultCurrency)}{pricing.originalPrice.toFixed(2)}
                                </span>
                                <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm font-bold">
                                  PROMO
                                </span>
                              </div>
                              <div className="text-sm text-green-600 font-medium mb-2">
                                Save {getCurrencySymbol(wholesaler?.defaultCurrency)}{pricing.totalDiscount.toFixed(2)} ({Math.round(pricing.discountPercentage)}% off)
                              </div>
                              {pricing.appliedOffers.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {pricing.appliedOffers.map((offer, index) => (
                                    <span key={index} className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-medium">
                                      🔥 {offer}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-4xl font-bold text-gray-900">
                              {getCurrencySymbol(wholesaler?.defaultCurrency)}{pricing.originalPrice.toFixed(2)}
                            </div>
                          );
                        })()}
                        {!isGuestMode && <div className="text-sm text-gray-500 mt-1">Price per unit</div>}
                      </div>
                      
                      {/* Product Stats - Hidden for Guests */}
                      {!isGuestMode && (
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <div className="text-sm text-gray-500 mb-1">Minimum Order</div>
                            <div className="text-xl font-semibold text-gray-900">
                              {formatNumber(featuredProduct.moq)} units
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500 mb-1">In Stock</div>
                            <div className="text-xl font-semibold text-gray-900">
                              {formatNumber(featuredProduct.stock)} units
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Negotiation Info - Hidden for Guests */}
                      {!isGuestMode && featuredProduct.negotiationEnabled && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                              <div className="font-medium text-blue-900 mb-1">Price Negotiable</div>
                              <p className="text-sm text-blue-700">
                                Request a custom quote based on your quantity needs.
                              </p>
                              {featuredProduct.minimumBidPrice && (
                                <p className="text-sm text-blue-600 mt-2">
                                  Minimum price: {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(featuredProduct.minimumBidPrice).toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons - Hidden for Guests */}
                      {!isGuestMode && (
                        <div className="space-y-3">
                          <Button
                            onClick={() => openQuantityEditor(featuredProduct)}
                            size="lg"
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 text-lg"
                          >
                            <Plus className="w-5 h-5 mr-3" />
                            Add to Cart
                          </Button>
                          
                          {featuredProduct.negotiationEnabled && (
                            <Button 
                              onClick={() => openNegotiation(featuredProduct)}
                              variant="outline"
                              size="lg"
                              className="w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-4 text-lg"
                            >
                              <Mail className="w-5 h-5 mr-3" />
                              Request Custom Quote
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Guest Call-to-Action */}
                      {isGuestMode && (
                        <div className="space-y-3">
                          <Button
                            onClick={() => {
                              toast({
                                title: "Contact Wholesaler Required",
                                description: "Please contact the wholesaler to be added as a customer before you can place orders.",
                                action: (
                                  <Button
                                    onClick={() => window.location.href = '/'}
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    Contact Wholesaler
                                  </Button>
                                ),
                                variant: "default",
                              });
                            }}
                            size="lg"
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 text-lg"
                          >
                            <Plus className="w-5 h-5 mr-3" />
                            Add to Cart
                          </Button>
                          
                          {featuredProduct.negotiationEnabled && (
                            <Button 
                              onClick={() => {
                                toast({
                                  title: "Contact Wholesaler Required",
                                  description: "Please contact the wholesaler to be added as a customer before you can place orders.",
                                  action: (
                                    <Button
                                      onClick={() => window.location.href = '/'}
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                      Contact Wholesaler
                                    </Button>
                                  ),
                                  variant: "default",
                                });
                              }}
                              variant="outline"
                              size="lg"
                              className="w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-4 text-lg"
                            >
                              <Mail className="w-5 h-5 mr-3" />
                              Request Custom Quote
                            </Button>
                          )}
                        </div>
                      )}
                      
                      {/* Supplier Info */}
                      <div className="border-t pt-6">
                        <div className="flex items-center gap-3 text-gray-600">
                          <Store className="w-5 h-5" />
                          <span className="text-sm">
                            Supplied by <span className="font-semibold text-gray-900">{featuredProduct.wholesaler.businessName}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search and Filters - Mobile Optimized */}
        {(!featuredProduct || showAllProducts) && (
          <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
            <div className="flex flex-col gap-3">
              {/* Search Bar - Full Width on Mobile */}
              <div className="w-full relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 sm:h-11 text-sm sm:text-base"
                />
              </div>
              
              {/* Filters and View Toggle - Mobile Optimized */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="flex-1 sm:max-w-xs">
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-full h-11 text-sm sm:text-base">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* View Toggle - Improved Design */}
                <div className="flex gap-2 w-full sm:w-auto shrink-0">
                  <Button
                    variant={viewMode === "grid" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("grid")}
                    className={`flex-1 sm:flex-none px-4 py-2 text-sm h-10 min-w-[90px] font-medium ${
                      viewMode === "grid" 
                        ? "bg-white border-gray-300 shadow-sm text-gray-900" 
                        : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Grid className="w-4 h-4 mr-2" />
                    <span>Grid</span>
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className={`flex-1 sm:flex-none px-4 py-2 text-sm h-10 min-w-[90px] font-medium ${
                      viewMode === "list" 
                        ? "bg-white border-gray-300 shadow-sm text-gray-900" 
                        : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <List className="w-4 h-4 mr-2" />
                    <span>List</span>
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Results Summary */}
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                {showAllProducts || !featuredProduct 
                  ? `${filteredProducts.length} products found`
                  : `Showing ${Math.min(otherProducts.length, 6)} of ${otherProducts.length} products`
                }
              </span>
              {showAllProducts && featuredProduct && (
                <Button 
                  onClick={() => setShowAllProducts(false)}
                  variant="ghost"
                  size="sm"
                  className="text-green-600 hover:text-green-700"
                >
                  Show Less
                </Button>
              )}
            </div>
          </div>
        )}

        {/* See All Products Section */}
        {featuredProduct && !showAllProducts && otherProducts.length > 0 && (
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-6 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">See All Products</h2>
              <Button
                onClick={() => setShowAllProducts(true)}
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50 font-medium w-full sm:w-auto"
              >
                View All ({otherProducts.length})
              </Button>
            </div>
            
            {/* Preview of Products - Mobile Responsive Grid */}
            <div className={`${viewMode === "grid" 
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" 
              : "space-y-3 sm:space-y-4"
            }`}>
              {otherProducts.slice(0, 6).map((product: Product) => (
                viewMode === "grid" ? (
                  // Grid View - Mobile Responsive
                  <Card key={product.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                    <CardContent className="p-3 sm:p-4 lg:p-6">
                      {/* Product Image - Mobile Optimized */}
                      <div className="mb-3 sm:mb-4">
                        {product.imageUrl || (product.images && product.images.length > 0) ? (
                          <img 
                            src={product.imageUrl || product.images[0]} 
                            alt={product.name}
                            className="w-full h-32 sm:h-36 lg:h-40 object-contain rounded-lg bg-white"
                          />
                        ) : (
                          <div className="w-full h-32 sm:h-36 lg:h-40 bg-gray-50 rounded-lg flex items-center justify-center">
                            <Package className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 text-gray-300" />
                          </div>
                        )}
                      </div>
                      
                      {/* Product Info - Mobile Responsive */}
                      <div className="space-y-2 sm:space-y-3">
                        <h3 className="font-semibold text-sm sm:text-base lg:text-lg text-gray-900 line-clamp-2">{product.name}</h3>
                        
                        {/* Product Tags */}
                        <div className="flex flex-wrap gap-2">
                          {product.category && (
                            <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded-md">
                              {product.category}
                            </span>
                          )}
                          {product.negotiationEnabled && (
                            <span className="inline-block bg-orange-100 text-orange-800 px-2 py-1 rounded-md text-xs font-medium">
                              💬 Negotiable
                            </span>
                          )}
                          {product.deliveryExcluded && (
                            <span className="inline-block bg-red-100 text-red-800 px-2 py-1 rounded-md text-xs font-medium">
                              🚚 Pickup Only
                            </span>
                          )}
                          {/* Promotional Offers Badges */}
                          {(() => {
                            const badges = [];
                            
                            // Only show badges if product has promotional offers AND they're active
                            if (product.promotionalOffers && Array.isArray(product.promotionalOffers) && product.promoActive) {
                              product.promotionalOffers.forEach((offer, index) => {
                                if (offer.isActive) {
                                  const config = getOfferTypeConfig(offer.type);
                                  badges.push(
                                    <span key={`grid-offer-${index}`} className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${config.color}`}>
                                      {config.emoji} {config.label}
                                    </span>
                                  );
                                }
                              });
                            }
                            
                            return badges;
                          })()}
                          {/* Flexible Unit Display */}
                          {product.packQuantity && product.unitOfMeasure && product.unitSize && (
                            <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-medium">
                              📦 {product.packQuantity} x {Math.round(parseFloat(product.unitSize))}{product.unitOfMeasure}
                            </span>
                          )}
                        </div>
                        
                        {/* Sale Tag */}
                        {(() => {
                          const pricing = calculatePromotionalPricing(product);
                          const hasDiscounts = pricing.effectivePrice < pricing.originalPrice;
                          
                          return hasDiscounts && !isGuestMode ? (
                            <div className="mb-2">
                              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
                                SALE
                              </span>
                            </div>
                          ) : null;
                        })()}
                        
                        {/* Price */}
                        <div className="flex items-baseline gap-2">
                          {(() => {
                            const pricing = calculatePromotionalPricing(product);
                            const hasDiscounts = pricing.effectivePrice < pricing.originalPrice;
                            
                            return (
                              <PriceDisplay 
                                price={pricing.effectivePrice}
                                originalPrice={hasDiscounts ? pricing.originalPrice : undefined}
                                currency={wholesaler?.defaultCurrency}
                                isGuestMode={isGuestMode}
                                size="medium"
                                showStrikethrough={true}
                              />
                            );
                          })()}
                        </div>
                        
                        {/* Action Buttons - Mobile Responsive */}
                        {!isGuestMode && (
                          <div className="flex flex-col sm:flex-row justify-end gap-2 mt-3 sm:mt-4">
                            <Button 
                              onClick={() => openQuantityEditor(product)}
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs sm:text-sm"
                            >
                              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                              <span className="hidden sm:inline">Add to Cart</span>
                              <span className="sm:hidden">Add</span>
                            </Button>
                            {product.negotiationEnabled && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => openNegotiation(product)}
                                className="px-2 sm:px-3 border-green-600 text-green-600 hover:bg-green-50 rounded-xl text-xs sm:text-sm"
                              >
                                💬
                                <span className="hidden sm:inline ml-1">Quote</span>
                              </Button>
                            )}
                          </div>
                        )}
                        
                        {/* Guest Call-to-Action - Mobile Responsive */}
                        {isGuestMode && (
                          <div className="flex justify-end mt-3 sm:mt-4">
                            <Button 
                              onClick={() => {
                                toast({
                                  title: "Contact Wholesaler Required",
                                  description: "Please contact the wholesaler to be added as a customer before you can place orders.",
                                  action: (
                                    <Button
                                      onClick={() => window.location.href = '/'}
                                      size="sm"
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                      Contact Wholesaler
                                    </Button>
                                  ),
                                  variant: "default",
                                });
                              }}
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs sm:text-sm"
                            >
                              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                              <span className="hidden sm:inline">Add to Cart</span>
                              <span className="sm:hidden">Add</span>
                            </Button>
                          </div>
                        )}
                        
                        {/* Quick Stats */}
                        {!isGuestMode && (
                          <div className="flex justify-between text-sm text-gray-600 mt-3">
                            <span>MOQ: {formatNumber(product.moq)}</span>
                            <span>Stock: {formatNumber(product.stock)}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  // List View - Mobile Responsive Layout
                  <Card key={product.id} className="border hover:shadow-lg transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start space-x-3 sm:space-x-4">
                        {/* Product Image - Mobile Optimized */}
                        <div className="flex-shrink-0">
                          {product.imageUrl || (product.images && product.images.length > 0) ? (
                            <img 
                              src={product.imageUrl || product.images[0]} 
                              alt={product.name}
                              className="w-12 h-12 sm:w-16 sm:h-16 object-contain rounded-lg border bg-white"
                            />
                          ) : (
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-200 rounded-lg flex items-center justify-center border">
                              <Package className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
                            </div>
                          )}
                        </div>
                        
                        {/* Product Details - Mobile Responsive */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex-1 min-w-0 mb-2 sm:mb-0">
                              <h3 className="font-semibold text-sm sm:text-base lg:text-lg text-gray-900 truncate">{product.name}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                {product.category && (
                                  <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded-md">
                                    {product.category}
                                  </span>
                                )}
                                {product.negotiationEnabled && (
                                  <span className="inline-block bg-orange-100 text-orange-800 px-2 py-1 rounded-md text-xs font-medium">
                                    💬 Negotiable
                                  </span>
                                )}
                                {/* Promotional Offers Badges for List View */}
                                {(() => {
                                  const badges = [];
                                  
                                  // Only show badges if product has promotional offers AND they're active
                                  if (product.promotionalOffers && Array.isArray(product.promotionalOffers) && product.promoActive) {
                                    product.promotionalOffers.forEach((offer, index) => {
                                      if (offer.isActive) {
                                        const config = getOfferTypeConfig(offer.type);
                                        badges.push(
                                          <span key={`list-offer-${index}`} className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${config.color}`}>
                                            {config.emoji} {config.label}
                                          </span>
                                        );
                                      }
                                    });
                                  }
                                  
                                  return badges;
                                })()}
                                {/* Product Size Information */}
                                {product.packQuantity && product.unitOfMeasure && product.unitSize && (
                                  <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-medium">
                                    📦 {product.packQuantity} x {Math.round(parseFloat(product.unitSize))}{product.unitOfMeasure}
                                  </span>
                                )}
                                {product.deliveryExcluded && (
                                  <span className="inline-block bg-red-100 text-red-800 px-2 py-1 rounded-md text-xs font-medium">
                                    🚚 Pickup Only
                                  </span>
                                )}
                              </div>
                              {product.description && (
                                <p className="text-sm text-gray-600 mt-1 line-clamp-1">{product.description}</p>
                              )}
                            </div>
                            
                            {/* Price and Action Buttons - Mobile Responsive */}
                            <div className="flex flex-col sm:flex-row sm:items-start sm:text-right ml-2 sm:ml-4 space-y-2 sm:space-y-0 sm:space-x-2">
                              <div className="sm:flex-1">
                                <div className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2">
                                  {(() => {
                                    const pricing = calculatePromotionalPricing(product);
                                    const hasDiscounts = pricing.effectivePrice < pricing.originalPrice;
                                    
                                    return (
                                      <PriceDisplay 
                                        price={pricing.effectivePrice}
                                        originalPrice={hasDiscounts ? pricing.originalPrice : undefined}
                                        currency={wholesaler?.defaultCurrency}
                                        isGuestMode={isGuestMode}
                                        size="medium"
                                        showStrikethrough={true}
                                      />
                                    );
                                  })()}
                                </div>
                              </div>
                              
                              {/* Action Buttons - Mobile Stacked */}
                              {!isGuestMode && (
                                <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
                                  {product.negotiationEnabled ? (
                                    <>
                                      <Button 
                                        onClick={() => openNegotiation(product)}
                                        size="sm"
                                        variant="outline"
                                        className="border-blue-600 text-blue-600 hover:bg-blue-50 text-xs sm:text-sm"
                                      >
                                        <Mail className="w-3 h-3 mr-1" />
                                        <span className="hidden sm:inline">Quote</span>
                                        <span className="sm:hidden">💬</span>
                                      </Button>
                                      <Button 
                                        onClick={() => openQuantityEditor(product)}
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                                      >
                                        <Plus className="w-3 h-3 mr-1" />
                                        <span className="hidden sm:inline">Add</span>
                                        <span className="sm:hidden">+</span>
                                      </Button>
                                    </>
                                  ) : (
                                    <Button 
                                      onClick={() => openQuantityEditor(product)}
                                      size="sm"
                                      className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      <span className="hidden sm:inline">Add to Cart</span>
                                      <span className="sm:hidden">Add</span>
                                    </Button>
                                  )}
                                </div>
                              )}
                              
                              {/* Guest Call-to-Action - Mobile Responsive */}
                              {isGuestMode && (
                                <Button 
                                  onClick={() => {
                                    toast({
                                      title: "Contact Wholesaler Required",
                                      description: "Please contact the wholesaler to be added as a customer before you can place orders.",
                                      action: (
                                        <Button
                                          onClick={() => window.location.href = '/'}
                                          size="sm"
                                          className="bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                          Contact Wholesaler
                                        </Button>
                                      ),
                                      variant: "default",
                                    });
                                  }}
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm"
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Add to Cart</span>
                                  <span className="sm:hidden">Add</span>
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {/* Product Stats - Hidden for Guests */}
                          {!isGuestMode && (
                            <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                              <div>
                                <span className="text-gray-500">MOQ:</span>
                                <div className="font-medium text-gray-900">{formatNumber(product.moq)} units</div>
                              </div>
                              <div>
                                <span className="text-gray-500">Stock:</span>
                                <div className={`font-medium ${product.stock < 100 ? "text-red-600" : "text-green-600"}`}>
                                  {formatNumber(product.stock)} units
                                </div>
                              </div>
                              <div>
                                <span className="text-gray-500">Supplier:</span>
                                <div className="font-medium text-gray-900 truncate flex items-center">
                                  <Store className="w-3 h-3 mr-1" />
                                  {product.wholesaler.businessName}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              ))}
            </div>
          </div>
        )}

        {/* All Products View - Shown when no featured product OR when "View All" is clicked */}
        {(!featuredProduct || showAllProducts) && (
          console.log('🎯 Showing All Products View:', { 
            featuredProduct: !!featuredProduct, 
            showAllProducts, 
            filteredProductsCount: filteredProducts.length,
            actualProducts: products.length,
            productsLoading,
            productsError: productsError?.message
          }) || 
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {featuredProduct ? "All Products" : "Available Products"}
              </h2>
              {featuredProduct && showAllProducts && (
                <Button
                  onClick={() => setShowAllProducts(false)}
                  variant="outline"
                  className="text-gray-600 border-gray-300 hover:bg-gray-50"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Featured
                </Button>
              )}
            </div>
            
            {productsLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, index) => (
                  <ProductCardSkeleton key={index} />
                ))}
              </div>
            ) : (
              <div className={`${viewMode === "grid" 
                ? "grid md:grid-cols-2 lg:grid-cols-3 gap-6" 
                : "space-y-4"
              }`}>
                {(() => {
                  console.log('🛒 Product List Render:', {
                    filteredCount: filteredProducts.length,
                    showingProducts: filteredProducts.map(p => ({ id: p.id, name: p.name, status: p.status }))
                  });
                  return filteredProducts.length === 0;
                })() ? (
                  <div className="col-span-full text-center py-12">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
                    <p className="text-gray-500">No products available at the moment</p>
                  </div>
                ) : (
                  filteredProducts.map((product: Product) => (
                    viewMode === "grid" ? (
                      // Grid View
                      <Card key={product.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                        <CardContent className="p-6">
                          {/* Product Image */}
                          <div className="mb-4">
                            {product.imageUrl || (product.images && product.images.length > 0) ? (
                              <img 
                                src={product.imageUrl || product.images[0]} 
                                alt={product.name}
                                className="w-full h-40 object-contain rounded-lg bg-white"
                              />
                            ) : (
                              <div className="w-full h-40 bg-gray-50 rounded-lg flex items-center justify-center">
                                <Package className="w-12 h-12 text-gray-300" />
                              </div>
                            )}
                          </div>
                          
                          {/* Product Info */}
                          <div className="space-y-3">
                            <h3 className="font-semibold text-lg text-gray-900 line-clamp-2">{product.name}</h3>
                            
                            {/* Product Tags */}
                            <div className="flex flex-wrap gap-2">
                              {product.category && (
                                <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded-md">
                                  {product.category}
                                </span>
                              )}
                              {product.negotiationEnabled && (
                                <span className="inline-block bg-orange-100 text-orange-800 px-2 py-1 rounded-md text-xs font-medium">
                                  💬 Negotiable
                                </span>
                              )}
                              {product.deliveryExcluded && (
                                <span className="inline-block bg-red-100 text-red-800 px-2 py-1 rounded-md text-xs font-medium">
                                  🚚 Pickup Only
                                </span>
                              )}
                              {/* Flexible Unit Display */}
                              {product.packQuantity && product.unitOfMeasure && product.unitSize && (
                                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-medium">
                                  📦 {product.packQuantity} x {Math.round(parseFloat(product.unitSize))}{product.unitOfMeasure}
                                </span>
                              )}
                              {/* Promotional Offers Badges for Grid View */}
                              {(() => {
                                const badges = [];
                                
                                // Show specific offer badges for promotional offers
                                if (product.promotionalOffers && Array.isArray(product.promotionalOffers)) {
                                  product.promotionalOffers.forEach((offer, index) => {
                                    if (offer.isActive) {
                                      const config = getOfferTypeConfig(offer.type);
                                      badges.push(
                                        <span key={`grid-offer-${index}`} className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${config.color}`}>
                                          {config.emoji} {config.label}
                                        </span>
                                      );
                                    }
                                  });
                                }
                                
                                return badges;
                              })()}
                            </div>
                            
                            {/* Sale Tag */}
                            {product.promoActive && product.promoPrice && (
                              <div className="mb-2">
                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
                                  SALE
                                </span>
                              </div>
                            )}
                            
                            {/* Price */}
                            <div className="flex items-baseline gap-2">
                              {product.promoActive && product.promoPrice ? (
                                <>
                                  <span className="text-xl font-bold text-green-600">
                                    {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(product.promoPrice).toFixed(2)}
                                  </span>
                                  <span className="text-sm text-gray-400 line-through">
                                    {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(product.price).toFixed(2)}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xl font-bold text-gray-900">
                                  {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(product.price).toFixed(2)}
                                </span>
                              )}
                            </div>
                            
                            {/* Quick Stats */}
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>MOQ: {formatNumber(product.moq)}</span>
                              <span>Stock: {formatNumber(product.stock)}</span>
                            </div>
                            
                            {/* Add to Cart Button */}
                            <div className="flex justify-end mt-4">
                              <Button
                                onClick={() => openQuantityEditor(product)}
                                className="bg-green-600 hover:bg-green-700"
                                size="sm"
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Add to Cart
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      // List View - Horizontal layout
                      <Card key={product.id} className="border hover:shadow-lg transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-4">
                            {/* Product Image */}
                            <div className="flex-shrink-0">
                              {product.imageUrl || (product.images && product.images.length > 0) ? (
                                <img 
                                  src={product.imageUrl || product.images[0]} 
                                  alt={product.name}
                                  className="w-16 h-16 object-contain rounded-lg border bg-white"
                                />
                              ) : (
                                <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center border">
                                  <Package className="w-8 h-8 text-gray-400" />
                                </div>
                              )}
                            </div>
                            
                            {/* Product Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-lg text-gray-900 truncate">{product.name}</h3>
                                  <div className="flex items-center gap-2 mt-1">
                                    {product.category && (
                                      <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded-md">
                                        {product.category}
                                      </span>
                                    )}
                                    {product.negotiationEnabled && (
                                      <span className="inline-block bg-orange-100 text-orange-800 px-2 py-1 rounded-md text-xs font-medium">
                                        💬 Negotiable
                                      </span>
                                    )}
                                    {product.deliveryExcluded && (
                                      <span className="inline-block bg-red-100 text-red-800 px-2 py-1 rounded-md text-xs font-medium">
                                        🚚 Pickup Only
                                      </span>
                                    )}
                                    {/* Flexible Unit Display */}
                                    {product.packQuantity && product.unitOfMeasure && product.unitSize && (
                                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs font-medium">
                                        📦 {product.packQuantity} x {Math.round(parseFloat(product.unitSize))}{product.unitOfMeasure}
                                      </span>
                                    )}
                                    {/* Promotional Offers Badges for List View */}
                                    {(() => {
                                      const badges = [];
                                      
                                      // Show specific offer badges for promotional offers
                                      if (product.promotionalOffers && Array.isArray(product.promotionalOffers)) {
                                        product.promotionalOffers.forEach((offer, index) => {
                                          if (offer.isActive) {
                                            const config = getOfferTypeConfig(offer.type);
                                            badges.push(
                                              <span key={`list-offer-${index}`} className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${config.color}`}>
                                                {config.emoji} {config.label}
                                              </span>
                                            );
                                          }
                                        });
                                      }
                                      
                                      return badges;
                                    })()}
                                  </div>
                                  {product.description && (
                                    <p className="text-sm text-gray-600 mt-1 line-clamp-1">{product.description}</p>
                                  )}
                                </div>
                                
                                {/* Price and Action Buttons */}
                                <div className="flex-shrink-0 text-right ml-4">
                                  {(() => {
                                    const pricing = calculatePromotionalPricing(product);
                                    const hasDiscounts = pricing.effectivePrice < pricing.originalPrice;
                                    
                                    return hasDiscounts ? (
                                      <div className="mb-2">
                                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
                                          SALE
                                        </span>
                                      </div>
                                    ) : null;
                                  })()}
                                  
                                  <div className="text-lg font-bold text-gray-900 mb-2">
                                    {(() => {
                                      const pricing = calculatePromotionalPricing(product);
                                      const hasDiscounts = pricing.effectivePrice < pricing.originalPrice;
                                      
                                      return hasDiscounts ? (
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                          <span className="text-green-600">
                                            {getCurrencySymbol(wholesaler?.defaultCurrency)}{pricing.effectivePrice.toFixed(2)}
                                          </span>
                                          <span className="text-gray-500 line-through text-sm">
                                            {getCurrencySymbol(wholesaler?.defaultCurrency)}{pricing.originalPrice.toFixed(2)}
                                          </span>
                                        </div>
                                      ) : (
                                        <span>
                                          {getCurrencySymbol(wholesaler?.defaultCurrency)}{pricing.originalPrice.toFixed(2)}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  
                                  {/* Action Buttons */}
                                  <div className="flex space-x-2">
                                    {product.negotiationEnabled ? (
                                      <>
                                        <Button 
                                          onClick={() => openNegotiation(product)}
                                          size="sm"
                                          variant="outline"
                                          className="border-blue-600 text-blue-600 hover:bg-blue-50"
                                        >
                                          <Mail className="w-3 h-3 mr-1" />
                                          Quote
                                        </Button>
                                        <Button 
                                          onClick={() => openQuantityEditor(product)}
                                          size="sm"
                                          className="bg-green-600 hover:bg-green-700"
                                        >
                                          <Plus className="w-3 h-3 mr-1" />
                                          Add
                                        </Button>
                                      </>
                                    ) : (
                                      <Button 
                                        onClick={() => openQuantityEditor(product)}
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700"
                                      >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Add to Cart
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Product Stats */}
                              <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                                <div>
                                  <span className="text-gray-500">MOQ:</span>
                                  <div className="font-medium text-gray-900">{formatNumber(product.moq)} units</div>
                                </div>
                                <div>
                                  <span className="text-gray-500">Stock:</span>
                                  <div className={`font-medium ${product.stock < 100 ? "text-red-600" : "text-green-600"}`}>
                                    {formatNumber(product.stock)} units
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-500">Supplier:</span>
                                  <div className="font-medium text-gray-900 truncate flex items-center">
                                    <Store className="w-3 h-3 mr-1" />
                                    {product.wholesaler.businessName}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals and dialogs would go here... */}
      {/* Quantity Editor Modal */}
      {showQuantityEditor && selectedProduct && (
        <Dialog open={showQuantityEditor} onOpenChange={setShowQuantityEditor}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add {selectedProduct.name} to Cart</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Selling Format Selection */}
              {selectedProduct?.sellingFormat === "both" && (
                <div className="space-y-2">
                  <Label>Purchase Format:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={selectedSellingType === "units" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedSellingType("units");
                        setEditQuantity(selectedProduct.moq);
                      }}
                      className="w-full"
                    >
                      Individual Units
                    </Button>
                    <Button
                      variant={selectedSellingType === "pallets" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedSellingType("pallets");
                        setEditQuantity(selectedProduct.palletMoq || 1);
                      }}
                      className="w-full"
                    >
                      Pallets
                    </Button>
                  </div>
                </div>
              )}
              
              <div className="text-sm text-gray-600">
                {selectedSellingType === "pallets" ? (
                  <>
                    <p>Minimum order: {selectedProduct.palletMoq || 1} pallets</p>
                    <p>Available stock: {formatNumber(selectedProduct.palletStock || 0)} pallets</p>
                    <p>Price per pallet: {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(selectedProduct.palletPrice || "0").toFixed(2)}</p>
                    {selectedProduct.unitsPerPallet && (
                      <p className="text-xs text-blue-600">Each pallet contains {selectedProduct.unitsPerPallet} units</p>
                    )}
                  </>
                ) : (
                  <>
                    <p>Minimum order: {selectedProduct.moq} units</p>
                    <p>Available stock: {formatNumber(selectedProduct.stock)} units</p>
                    <p>
                      Price per unit: {(() => {
                        const basePrice = parseFloat(selectedProduct.price) || 0;
                        const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                          basePrice,
                          parseFloat(editQuantity) || 1,
                          selectedProduct.promotionalOffers || [],
                          selectedProduct.promoPrice ? parseFloat(selectedProduct.promoPrice) : undefined,
                          selectedProduct.promoActive
                        );
                        
                        if (pricing.effectivePrice < basePrice) {
                          return (
                            <>
                              <span className="text-green-600 font-medium">
                                {getCurrencySymbol(wholesaler?.defaultCurrency)}{pricing.effectivePrice.toFixed(2)}
                              </span>
                              <span className="text-gray-400 line-through ml-1 text-sm">
                                {getCurrencySymbol(wholesaler?.defaultCurrency)}{basePrice.toFixed(2)}
                              </span>
                            </>
                          );
                        } else {
                          return `${getCurrencySymbol(wholesaler?.defaultCurrency)}${basePrice.toFixed(2)}`;
                        }
                      })()}
                    </p>
                  </>
                )}
              </div>
              
              {/* Collection Exclusion Warning */}
              {selectedProduct.deliveryExcluded && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start space-x-2">
                    <div className="bg-red-100 rounded-full p-1">
                      <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-red-800 text-sm">🚚 Pickup Only Product</h4>
                      <p className="text-red-700 text-sm mt-1">
                        This product requires pickup from the supplier location. Collection is not available for this item.
                      </p>
                    </div>
                  </div>
                  
                  {wholesaler?.pickupAddress && (
                    <div className="bg-white rounded border border-red-200 p-3">
                      <h5 className="font-medium text-gray-900 text-sm mb-2">📍 Pickup Location:</h5>
                      <p className="text-gray-700 text-sm">{wholesaler.pickupAddress}</p>
                      {wholesaler.pickupInstructions && (
                        <div className="mt-2">
                          <p className="font-medium text-gray-900 text-sm">Instructions:</p>
                          <p className="text-gray-700 text-sm">{wholesaler.pickupInstructions}</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {wholesaler?.businessPhone && (
                    <div className="bg-white rounded border border-red-200 p-3">
                      <h5 className="font-medium text-gray-900 text-sm mb-1">📞 Contact for Pickup:</h5>
                      <p className="text-gray-700 text-sm">{wholesaler.businessPhone}</p>
                    </div>
                  )}
                  
                  <div className="text-xs text-red-600 bg-red-100 rounded p-2">
                    💡 <strong>Next Steps:</strong> After placing your order, please contact the supplier to arrange pickup time and location.
                  </div>
                </div>
              )}
              
              <div className="flex items-center space-x-3">
                <Label>Quantity:</Label>
                <div className="flex items-center space-x-2 flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditQuantity(Math.max(1, editQuantity - 1));
                    }}
                    disabled={editQuantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    type="number"
                    value={editQuantity}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      // Allow any input during typing - validation happens on blur
                      setEditQuantity(inputValue === '' ? '' : inputValue);
                    }}
                    onBlur={(e) => {
                      const value = parseInt(e.target.value);
                      const maxQty = selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock;
                      
                      // Only enforce that quantity is positive and not more than stock
                      if (isNaN(value) || value <= 0) {
                        setEditQuantity(1); // Default to 1 if invalid
                      } else if (value > maxQty) {
                        setEditQuantity(maxQty);
                      }
                    }}
                    className="w-24 text-center"
                    min={1}
                    max={selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock}
                    placeholder={`1-${selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock}`}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const maxQty = selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock;
                      setEditQuantity(Math.min(maxQty, editQuantity + 1));
                    }}
                    disabled={editQuantity >= (selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {/* Stock limit warning */}
              {selectedSellingType === "pallets" ? (
                parseFloat(editQuantity) >= (selectedProduct.palletStock || 0) && (
                  <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                    ⚠️ Quantity limited to available stock ({formatNumber(selectedProduct.palletStock || 0)} pallets)
                  </div>
                )
              ) : (
                parseFloat(editQuantity) >= selectedProduct.stock && (
                  <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                    ⚠️ Quantity limited to available stock ({formatNumber(selectedProduct.stock)} units)
                  </div>
                )
              )}
              
              {/* MOQ information when below minimum - just informational, not blocking */}
              {selectedSellingType === "pallets" ? (
                parseFloat(editQuantity) > 0 && parseFloat(editQuantity) < (selectedProduct.palletMoq || 1) && (
                  <div className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md p-2">
                    ℹ️ Note: Typical minimum order is {formatNumber(selectedProduct.palletMoq || 1)} pallets, but you can order any quantity.
                  </div>
                )
              ) : (
                parseFloat(editQuantity) > 0 && parseFloat(editQuantity) < selectedProduct.moq && (
                  <div className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md p-2">
                    ℹ️ Note: Typical minimum order is {formatNumber(selectedProduct.moq)} units, but you can order any quantity.
                  </div>
                )
              )}
              
              {/* MOQ reminder */}
              {selectedSellingType === "pallets" ? (
                editQuantity === (selectedProduct.palletMoq || 1) && (selectedProduct.palletMoq || 1) > 1 && (
                  <div className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md p-2">
                    ℹ️ Minimum order quantity is {formatNumber(selectedProduct.palletMoq || 1)} pallets
                  </div>
                )
              ) : (
                editQuantity === selectedProduct.moq && selectedProduct.moq > 1 && (
                  <div className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md p-2">
                    ℹ️ Minimum order quantity is {formatNumber(selectedProduct.moq)} units
                  </div>
                )
              )}
              
              <div className="text-lg font-semibold">
                Total: {getCurrencySymbol(wholesaler?.defaultCurrency)}{(() => {
                  const quantity = parseFloat(editQuantity) || 0;
                  
                  if (selectedSellingType === "pallets") {
                    const unitPrice = parseFloat(selectedProduct.palletPrice || "0");
                    return (unitPrice * quantity).toFixed(2);
                  } else {
                    const basePrice = parseFloat(selectedProduct.price) || 0;
                    const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                      basePrice,
                      quantity,
                      selectedProduct.promotionalOffers || [],
                      selectedProduct.promoPrice ? parseFloat(selectedProduct.promoPrice) : undefined,
                      selectedProduct.promoActive
                    );
                    return (pricing.totalCost || (pricing.effectivePrice * quantity) || (basePrice * quantity)).toFixed(2);
                  }
                })()}
              </div>
              
              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => setShowQuantityEditor(false)} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddToCart} 
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  disabled={
                    editQuantity === '' || parseFloat(editQuantity) <= 0 ||
                    (selectedSellingType === "pallets" 
                      ? parseFloat(editQuantity) > (selectedProduct.palletStock || 0)
                      : parseFloat(editQuantity) > selectedProduct.stock)
                  }
                >
                  Add to Cart
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Checkout Modal with Stripe Integration */}
      {showCheckout && (
        <Dialog open={showCheckout} onOpenChange={(open) => {
          setShowCheckout(open);
          // When checkout dialog closes, ensure user returns to products view instead of auth screen
          if (!open) {
            setShowAllProducts(true);
            setShowHomePage(false);
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5" />
                <span>Checkout</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Cart Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Order Summary</h3>
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={`${item.product.id}-${item.sellingType}`} className="flex justify-between items-center py-2">
                      <div className="flex-1">
                        <span className="font-medium">{item.product.name}</span>
                        {/* Product Size Information */}
                        {(item.product.packQuantity && item.product.unitSize && item.product.unitOfMeasure) && (
                          <div className="text-sm text-blue-600 font-medium mt-1">
                            <span className="inline-flex items-center bg-blue-100 px-2 py-1 rounded-full">
                              📦 {item.product.packQuantity} x {item.product.unitSize}{item.product.unitOfMeasure}
                            </span>
                          </div>
                        )}
                        <div className="text-sm text-gray-500">
                          {item.sellingType === "pallets" ? (
                            <>
                              {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(item.product.palletPrice || "0").toFixed(2)} per pallet
                              {item.product.unitsPerPallet && (
                                <span className="text-blue-600"> ({item.product.unitsPerPallet} units/pallet)</span>
                              )}
                            </>
                          ) : (
                            <>
                              {(() => {
                                const basePrice = parseFloat(item.product.price) || 0;
                                const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                                  basePrice,
                                  item.quantity,
                                  item.product.promotionalOffers || [],
                                  item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                                  item.product.promoActive
                                );
                                
                                if (pricing.effectivePrice < basePrice) {
                                  return (
                                    <>
                                      <span className="text-green-600 font-medium">
                                        {getCurrencySymbol(wholesaler?.defaultCurrency)}{pricing.effectivePrice.toFixed(2)} per unit
                                      </span>
                                      <span className="text-gray-400 line-through ml-1">
                                        {getCurrencySymbol(wholesaler?.defaultCurrency)}{basePrice.toFixed(2)}
                                      </span>
                                    </>
                                  );
                                } else {
                                  return (
                                    <>
                                      {getCurrencySymbol(wholesaler?.defaultCurrency)}{basePrice.toFixed(2)} per unit
                                    </>
                                  );
                                }
                              })()}
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Quantity Editor */}
                      <div className="flex items-center space-x-2 mx-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newQuantity = Math.max(1, item.quantity - 1);
                            if (newQuantity !== item.quantity) {
                              setCart(cart.map(cartItem => 
                                cartItem.product.id === item.product.id && cartItem.sellingType === item.sellingType
                                  ? { ...cartItem, quantity: newQuantity }
                                  : cartItem
                              ));
                            }
                          }}
                          disabled={item.quantity <= 1}
                          className="w-8 h-8 p-0"
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        
                        <div className="text-center min-w-[80px]">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const inputValue = e.target.value;
                              // Allow any input during typing - validation happens on blur
                              const newQuantity = inputValue === '' ? 1 : (parseInt(inputValue) || item.quantity);
                              setCart(cart.map(cartItem => 
                                cartItem.product.id === item.product.id && cartItem.sellingType === item.sellingType
                                  ? { ...cartItem, quantity: newQuantity }
                                  : cartItem
                              ));
                            }}
                            onBlur={(e) => {
                              const maxQty = item.sellingType === "pallets" ? (item.product.palletStock || 0) : item.product.stock;
                              const newQuantity = parseInt(e.target.value) || 1;
                              
                              // Only enforce stock limit, not MOQ in checkout
                              const validQuantity = newQuantity > maxQty ? maxQty : (newQuantity < 1 ? 1 : newQuantity);
                              setCart(cart.map(cartItem => 
                                cartItem.product.id === item.product.id && cartItem.sellingType === item.sellingType
                                  ? { ...cartItem, quantity: validQuantity }
                                  : cartItem
                              ));
                            }}
                            min={1}
                            max={item.sellingType === "pallets" ? (item.product.palletStock || 0) : item.product.stock}
                            placeholder={`1-${item.sellingType === "pallets" ? (item.product.palletStock || 0) : item.product.stock}`}
                            className="h-8 text-center text-sm"
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            {item.sellingType === "pallets" ? "pallets" : "units"}
                          </div>
                          {/* Stock validation warning - only show for stock exceeded */}
                          {(() => {
                            const maxQty = item.sellingType === "pallets" ? (item.product.palletStock || 0) : item.product.stock;
                            const minQty = item.sellingType === "pallets" ? (item.product.palletMoq || 1) : item.product.moq;
                            
                            if (item.quantity > maxQty) {
                              return (
                                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mt-1">
                                  ❌ Exceeds stock ({maxQty} available)
                                </div>
                              );
                            } else if (item.quantity < minQty) {
                              return (
                                <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1 mt-1">
                                  ℹ️ Below typical minimum ({minQty})
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const maxQty = item.sellingType === "pallets" ? (item.product.palletStock || 0) : item.product.stock;
                            const newQuantity = Math.min(maxQty, item.quantity + 1);
                            if (newQuantity !== item.quantity) {
                              setCart(cart.map(cartItem => 
                                cartItem.product.id === item.product.id && cartItem.sellingType === item.sellingType
                                  ? { ...cartItem, quantity: newQuantity }
                                  : cartItem
                              ));
                            }
                          }}
                          disabled={item.quantity >= (item.sellingType === "pallets" ? (item.product.palletStock || 0) : item.product.stock)}
                          className="w-8 h-8 p-0"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      
                      <div className="text-right flex items-center space-x-2">
                        <span className="font-semibold">
                          {getCurrencySymbol(wholesaler?.defaultCurrency)}{(() => {
                            if (item.sellingType === "pallets") {
                              const price = parseFloat(item.product.palletPrice || "0");
                              return (price * item.quantity).toFixed(2);
                            } else {
                              // Use promotional pricing for units
                              const basePrice = parseFloat(item.product.price) || 0;
                              const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                                basePrice,
                                item.quantity,
                                item.product.promotionalOffers || [],
                                item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                                item.product.promoActive
                              );
                              return pricing.totalCost.toFixed(2);
                            }
                          })()}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCart(cart.filter(cartItem => 
                              !(cartItem.product.id === item.product.id && cartItem.sellingType === item.sellingType)
                            ));
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 w-8 h-8 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="my-3" />
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{getCurrencySymbol(wholesaler?.defaultCurrency)}{(() => {
                      const subtotal = cart.reduce((total, item) => {
                        if (item.sellingType === "pallets") {
                          return total + (parseFloat(item.product.palletPrice || "0") * item.quantity);
                        } else {
                          const basePrice = parseFloat(item.product.price) || 0;
                          const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                            basePrice,
                            item.quantity,
                            item.product.promotionalOffers || [],
                            item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                            item.product.promoActive
                          );
                          return total + pricing.totalCost;
                        }
                      }, 0);
                      return subtotal.toFixed(2);
                    })()}</span>
                  </div>
                  
                  {/* Promotional Offers Summary */}
                  {cartStats.appliedPromotions && cartStats.appliedPromotions.length > 0 && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 my-3 shadow-sm">
                      <div className="flex items-center mb-3">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-3">
                          <span className="text-white text-lg">🎉</span>
                        </div>
                        <h4 className="font-semibold text-green-800 text-base">Active Promotional Offers</h4>
                      </div>
                      <div className="space-y-3">
                        {cartStats.appliedPromotions.map((offer, index) => (
                          <div key={index} className="flex items-center text-sm bg-white rounded-lg px-3 py-2 border border-green-100">
                            <div className="w-2 h-2 bg-green-500 rounded-full mr-3 flex-shrink-0"></div>
                            <span className="text-green-700 font-medium">{offer}</span>
                          </div>
                        ))}
                        {cartStats.bogoffDetails && cartStats.bogoffDetails.length > 0 && (
                          cartStats.bogoffDetails.map((bogoff, index) => (
                            <div key={`bogoff-${index}`} className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-lg px-3 py-2">
                              <div className="flex items-start space-x-2">
                                <span className="text-orange-500 text-lg mt-0.5">🎁</span>
                                <div className="flex-1">
                                  <div className="text-sm font-semibold text-orange-800">{bogoff.productName}</div>
                                  <div className="text-sm text-orange-700">{bogoff.offerName}</div>
                                  <div className="text-sm text-orange-600 font-medium bg-orange-100 rounded px-2 py-1 mt-1 inline-block">
                                    +{bogoff.freeItemsAdded} FREE items added to your order!
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                        {cartStats.freeShippingApplied && (
                          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg px-3 py-2">
                            <div className="flex items-center space-x-2">
                              <span className="text-blue-500 text-lg">🚚</span>
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-blue-800">Free Shipping Applied!</div>
                                <div className="text-sm text-blue-700">Collection cost waived for this order</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Weight Information */}
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Total Weight:</span>
                    <span className="font-medium">
                      {(() => {
                        const totalWeight = cart.reduce((total, item) => {
                          const unitWeight = parseFloat(item.product.unitWeight || item.product.unit_weight || "0") || 0;
                          const palletWeight = parseFloat(item.product.palletWeight || item.product.pallet_weight || "0") || 0;
                          
                          console.log('Weight calculation debug:', {
                            productName: item.product.name,
                            quantity: item.quantity,
                            sellingType: item.sellingType,
                            unitWeight,
                            palletWeight,
                            rawUnitWeight: item.product.unitWeight,
                            rawUnit_weight: item.product.unit_weight,
                            rawPalletWeight: item.product.palletWeight,
                            rawPallet_weight: item.product.pallet_weight,
                            price: item.product.price
                          });
                          
                          let itemWeight = 0;
                          if (item.sellingType === "pallets" && palletWeight > 0) {
                            itemWeight = palletWeight * item.quantity;
                            console.log(`Using pallet weight: ${palletWeight} kg x ${item.quantity} = ${itemWeight} kg`);
                          } else if (item.product.totalPackageWeight && parseFloat(item.product.totalPackageWeight) > 0) {
                            // Use precise unit configuration weight
                            itemWeight = parseFloat(item.product.totalPackageWeight) * item.quantity;
                            console.log(`Using total package weight: ${item.product.totalPackageWeight} kg x ${item.quantity} = ${itemWeight} kg`);
                          } else if (item.product.packQuantity && item.product.unitOfMeasure) {
                            // Calculate weight from unit configuration
                            const packQuantity = parseFloat(item.product.packQuantity) || 0;
                            // Use unitSize field (the correct database field)
                            let sizePerUnit = parseFloat(item.product.unitSize || item.product.sizePerUnit) || 0;
                            const unitOfMeasure = item.product.unitOfMeasure;
                            
                            console.log(`Unit configuration data:`, {
                              packQuantity,
                              unitSize: item.product.unitSize,
                              sizePerUnit: item.product.sizePerUnit,
                              unitOfMeasure,
                              calculatedSizePerUnit: sizePerUnit
                            });
                            
                            let packageWeight = 0;
                            if (unitOfMeasure === 'g') {
                              packageWeight = (packQuantity * sizePerUnit) / 1000; // Convert grams to kg
                            } else if (unitOfMeasure === 'kg') {
                              packageWeight = packQuantity * sizePerUnit;
                            } else if (unitOfMeasure === 'ml' || unitOfMeasure === 'l' || unitOfMeasure === 'cl') {
                              // Assume liquid density of 1g/ml
                              let totalMl = 0;
                              if (unitOfMeasure === 'ml') totalMl = packQuantity * sizePerUnit;
                              else if (unitOfMeasure === 'l') totalMl = packQuantity * sizePerUnit * 1000;
                              else if (unitOfMeasure === 'cl') totalMl = packQuantity * sizePerUnit * 10;
                              packageWeight = totalMl / 1000; // Convert ml to kg (assuming 1g/ml)
                            } else if (unitOfMeasure === 'pieces' || unitOfMeasure === 'cans' || unitOfMeasure === 'bottles') {
                              // Estimate weight for countable items
                              packageWeight = packQuantity * 0.1; // 100g per piece estimate
                            }
                            
                            itemWeight = packageWeight * item.quantity;
                            console.log(`Calculated from unit config: ${packQuantity} x ${sizePerUnit}${unitOfMeasure} = ${packageWeight} kg x ${item.quantity} = ${itemWeight} kg`);
                          } else if (unitWeight > 0) {
                            itemWeight = unitWeight * item.quantity;
                            console.log(`Using unit weight fallback: ${unitWeight} kg x ${item.quantity} = ${itemWeight} kg`);
                          } else {
                            // Fallback: If no weight data, use 1kg per unit as a reasonable default
                            itemWeight = 1 * item.quantity;
                            console.log(`FALLBACK: No weight data found, using 1kg per unit: 1 kg x ${item.quantity} = ${itemWeight} kg`);
                          }
                          
                          console.log('Final itemWeight:', itemWeight);
                          return total + itemWeight;
                        }, 0);
                        
                        return `${totalWeight.toLocaleString()} kg`;
                      })()}
                    </span>
                  </div>
                  
                  {/* Weight Warning for Heavy Orders */}
                  {(() => {
                    const totalWeight = cart.reduce((total, item) => {
                      const unitWeight = parseFloat(item.product.unitWeight || item.product.unit_weight || "0") || 0;
                      const palletWeight = parseFloat(item.product.palletWeight || item.product.pallet_weight || "0") || 0;
                      
                      let itemWeight = 0;
                      if (item.sellingType === "pallets" && palletWeight > 0) {
                        itemWeight = palletWeight * item.quantity;
                      } else if (item.product.totalPackageWeight && parseFloat(item.product.totalPackageWeight) > 0) {
                        // Use precise unit configuration weight
                        itemWeight = parseFloat(item.product.totalPackageWeight) * item.quantity;
                      } else if (item.product.packQuantity && item.product.unitOfMeasure) {
                        // Calculate weight from unit configuration
                        const packQuantity = parseFloat(item.product.packQuantity) || 0;
                        // Use unitSize field (the correct database field)
                        let sizePerUnit = parseFloat(item.product.unitSize || item.product.sizePerUnit) || 0;
                        const unitOfMeasure = item.product.unitOfMeasure;
                        
                        let packageWeight = 0;
                        if (unitOfMeasure === 'g') {
                          packageWeight = (packQuantity * sizePerUnit) / 1000; // Convert grams to kg
                        } else if (unitOfMeasure === 'kg') {
                          packageWeight = packQuantity * sizePerUnit;
                        } else if (unitOfMeasure === 'ml' || unitOfMeasure === 'l' || unitOfMeasure === 'cl') {
                          // Assume liquid density of 1g/ml
                          let totalMl = 0;
                          if (unitOfMeasure === 'ml') totalMl = packQuantity * sizePerUnit;
                          else if (unitOfMeasure === 'l') totalMl = packQuantity * sizePerUnit * 1000;
                          else if (unitOfMeasure === 'cl') totalMl = packQuantity * sizePerUnit * 10;
                          packageWeight = totalMl / 1000; // Convert ml to kg (assuming 1g/ml)
                        } else if (unitOfMeasure === 'pieces' || unitOfMeasure === 'cans' || unitOfMeasure === 'bottles') {
                          // Estimate weight for countable items
                          packageWeight = packQuantity * 0.1; // 100g per piece estimate
                        }
                        
                        itemWeight = packageWeight * item.quantity;
                      } else if (unitWeight > 0) {
                        itemWeight = unitWeight * item.quantity;
                      } else {
                        itemWeight = 1 * item.quantity; // Fallback
                      }
                      return total + itemWeight;
                    }, 0);
                    
                    if (totalWeight > 70) {
                      return (
                        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                          ⚠️ {totalWeight > 1000 
                            ? "Orders over 1 tonne require pallet collection service" 
                            : "Heavy order - specialized shipping required"}
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  {customerData.shippingOption === 'collection' && customerData.selectedShippingService && (
                    <div className="flex justify-between">
                      <span>Shipping ({customerData.selectedShippingService.serviceName}):</span>
                      <span>{getCurrencySymbol(wholesaler?.defaultCurrency)}{cartStats.shippingCost.toFixed(2)}</span>
                    </div>
                  )}
                  {customerData.shippingOption === 'pickup' && (
                    <div className="flex justify-between">
                      <span>Shipping (Pickup):</span>
                      <span className="text-green-600">FREE</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Transaction Fee (5.5% + £0.50):</span>
                    <span>{getCurrencySymbol(wholesaler?.defaultCurrency)}{(() => {
                      const subtotal = cart.reduce((total, item) => {
                        if (item.sellingType === "pallets") {
                          return total + (parseFloat(item.product.palletPrice || "0") * item.quantity);
                        } else {
                          const basePrice = parseFloat(item.product.price) || 0;
                          const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                            basePrice,
                            item.quantity,
                            item.product.promotionalOffers || [],
                            item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                            item.product.promoActive
                          );
                          return total + pricing.totalCost;
                        }
                      }, 0);
                      return (subtotal * 0.055 + 0.50).toFixed(2);
                    })()}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total Amount:</span>
                    <span>{getCurrencySymbol(wholesaler?.defaultCurrency)}{(() => {
                      const subtotal = cart.reduce((total, item) => {
                        if (item.sellingType === "pallets") {
                          return total + (parseFloat(item.product.palletPrice || "0") * item.quantity);
                        } else {
                          const basePrice = parseFloat(item.product.price) || 0;
                          const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                            basePrice,
                            item.quantity,
                            item.product.promotionalOffers || [],
                            item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                            item.product.promoActive
                          );
                          return total + pricing.totalCost;
                        }
                      }, 0);
                      const transactionFee = subtotal * 0.055 + 0.50;
                      return (subtotal + transactionFee).toFixed(2);
                    })()}</span>
                  </div>
                </div>
              </div>

              {/* Collection Exclusion Alert for Cart Items */}
              {(() => {
                const deliveryExcludedItems = cart.filter(item => item.product.deliveryExcluded);
                if (deliveryExcludedItems.length > 0) {
                  return (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-start space-x-2">
                        <div className="bg-red-100 rounded-full p-1 mt-0.5">
                          <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-red-800">🚚 Pickup Required for Some Items</h4>
                          <p className="text-red-700 text-sm mt-1">
                            The following {deliveryExcludedItems.length === 1 ? 'item requires' : 'items require'} pickup from the supplier location:
                          </p>
                          <ul className="mt-2 space-y-1">
                            {deliveryExcludedItems.map((item, index) => (
                              <li key={index} className="text-red-700 text-sm flex items-center space-x-2">
                                <span className="w-1 h-1 bg-red-600 rounded-full"></span>
                                <span className="font-medium">{item.product.name}</span>
                                <span className="text-red-600">({item.quantity} {item.sellingType})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      
                      {wholesaler?.pickupAddress && (
                        <div className="bg-white rounded border border-red-200 p-3">
                          <h5 className="font-medium text-gray-900 text-sm mb-2">📍 Pickup Location:</h5>
                          <p className="text-gray-700 text-sm">{wholesaler.pickupAddress}</p>
                          {wholesaler.pickupInstructions && (
                            <div className="mt-2">
                              <p className="font-medium text-gray-900 text-sm">Instructions:</p>
                              <p className="text-gray-700 text-sm">{wholesaler.pickupInstructions}</p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {wholesaler?.businessPhone && (
                        <div className="bg-white rounded border border-red-200 p-3">
                          <h5 className="font-medium text-gray-900 text-sm mb-1">📞 Contact for Pickup:</h5>
                          <p className="text-gray-700 text-sm">{wholesaler.businessPhone}</p>
                        </div>
                      )}
                      
                      <div className="text-xs text-red-600 bg-red-100 rounded p-2">
                        💡 <strong>Important:</strong> After completing your order, please contact the supplier to arrange pickup time for these items. Other items in your order may still be eligible for collection.
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Customer Information Form */}
              <div className="space-y-4">
                <h3 className="font-semibold">Customer Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customerName">Full Name *</Label>
                    <Input
                      id="customerName"
                      value={customerData.name}
                      onChange={(e) => setCustomerData({...customerData, name: e.target.value})}
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerEmail">Email Address *</Label>
                    <Input
                      id="customerEmail"
                      type="email"
                      value={customerData.email}
                      onChange={(e) => setCustomerData({...customerData, email: e.target.value})}
                      placeholder="your.email@example.com"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerPhone">Phone Number *</Label>
                    <Input
                      id="customerPhone"
                      value={customerData.phone}
                      onChange={(e) => setCustomerData({...customerData, phone: e.target.value})}
                      placeholder="+44 7700 900000"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="customerAddress">Street Address *</Label>
                    <Input
                      id="customerAddress"
                      value={customerData.address}
                      onChange={(e) => setCustomerData({...customerData, address: e.target.value})}
                      placeholder="123 Main Street"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="customerCity">City *</Label>
                    <Input
                      id="customerCity"
                      value={customerData.city}
                      onChange={(e) => setCustomerData({...customerData, city: e.target.value})}
                      placeholder="London"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerState">State/County *</Label>
                    <Input
                      id="customerState"
                      value={customerData.state}
                      onChange={(e) => setCustomerData({...customerData, state: e.target.value})}
                      placeholder="Greater London"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerPostalCode">Postal Code *</Label>
                    <Input
                      id="customerPostalCode"
                      value={customerData.postalCode}
                      onChange={(e) => setCustomerData({...customerData, postalCode: e.target.value})}
                      placeholder="SW1A 1AA"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customerCountry">Country *</Label>
                    <Input
                      id="customerCountry"
                      value={customerData.country}
                      onChange={(e) => setCustomerData({...customerData, country: e.target.value})}
                      placeholder="United Kingdom"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="customerNotes">Order Notes (Optional)</Label>
                  <Textarea
                    id="customerNotes"
                    value={customerData.notes}
                    onChange={(e) => setCustomerData({...customerData, notes: e.target.value})}
                    placeholder="Any special collection instructions or notes..."
                    className="min-h-[80px]"
                  />
                </div>
              </div>

              {/* Shipping Options Section */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center space-x-2">
                  <Truck className="w-4 h-4" />
                  <span>Shipping Options</span>
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div 
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      customerData.shippingOption === 'pickup' 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setCustomerData({
                      ...customerData, 
                      shippingOption: 'pickup',
                      selectedShippingService: undefined
                    })}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        customerData.shippingOption === 'pickup' 
                          ? 'border-green-500 bg-green-500' 
                          : 'border-gray-300'
                      }`} />
                      <div>
                        <h4 className="font-medium">Pickup</h4>
                        <p className="text-sm text-gray-600">Collect from supplier location</p>
                        <p className="text-sm font-medium text-green-600">FREE</p>
                      </div>
                    </div>
                  </div>

                  <div 
                    className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                      customerData.shippingOption === 'collection' 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                    onClick={() => {
                      setCustomerData({...customerData, shippingOption: 'collection'});
                      if (customerData.address && customerData.city && customerData.postalCode) {
                        fetchShippingQuotes();
                      }
                    }}
                    title="Click to refresh delivery options and get updated shipping quotes"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        customerData.shippingOption === 'collection' 
                          ? 'border-green-500 bg-green-500' 
                          : 'border-gray-300'
                      }`} />
                      <div>
                        <h4 className="font-medium flex items-center gap-2">
                          Delivery
                          <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Click to refresh
                          </div>
                        </h4>
                        <p className="text-sm text-gray-600">Courier delivery service to your address</p>
                        <p className="text-sm font-medium text-blue-600">Select service below</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping Services Selection */}
                {customerData.shippingOption === 'collection' && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Choose Delivery Service</h4>
                    
                    {loadingShippingQuotes ? (
                      <div className="text-center py-4">
                        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Getting shipping quotes...</p>
                      </div>
                    ) : availableShippingServices.length > 0 ? (
                      availableShippingServices.map((service) => (
                        <div
                          key={service.serviceId}
                          className={`p-3 border rounded-lg cursor-pointer transition-all ${
                            customerData.selectedShippingService?.serviceId === service.serviceId
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => setCustomerData({
                            ...customerData,
                            selectedShippingService: service
                          })}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-3 h-3 rounded-full border-2 ${
                                customerData.selectedShippingService?.serviceId === service.serviceId
                                  ? 'border-green-500 bg-green-500'
                                  : 'border-gray-300'
                              }`} />
                              <div>
                                <h5 className="font-medium">{service.serviceName}</h5>
                                <p className="text-sm text-gray-600">{service.description}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-green-600">
                                {getCurrencySymbol(wholesaler?.defaultCurrency)}{service.price.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-500">Inc. VAT</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : customerData.address && customerData.city && customerData.postalCode ? (
                      <div className="text-center py-4">
                        <Button
                          onClick={fetchShippingQuotes}
                          variant="outline"
                          className="text-sm"
                        >
                          Get Shipping Quotes
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        <p className="text-sm">Complete your address to see shipping options</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Section */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center space-x-2">
                  <CreditCard className="w-4 h-4" />
                  <span>Payment Information</span>
                </h3>
                
                {cart.length > 0 && customerData.name && customerData.email && customerData.phone && customerData.address && customerData.city && customerData.state && customerData.postalCode && customerData.country ? (
                  <StripeCheckoutForm 
                    cart={cart}
                    customerData={customerData}
                    wholesaler={wholesaler}
                    totalAmount={(() => {
                      // Calculate the total amount that customer will pay (including transaction fees)
                      const subtotal = cart.reduce((total, item) => {
                        if (item.sellingType === "pallets") {
                          return total + (parseFloat(item.product.palletPrice || "0") * item.quantity);
                        } else {
                          const basePrice = parseFloat(item.product.price) || 0;
                          const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                            basePrice,
                            item.quantity,
                            item.product.promotionalOffers || [],
                            item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                            item.product.promoActive
                          );
                          return total + pricing.totalCost;
                        }
                      }, 0);
                      const transactionFee = subtotal * 0.055 + 0.50;
                      const shippingCost = cartStats.shippingCost || 0;
                      return subtotal + transactionFee + shippingCost;
                    })()}
                    onSuccess={() => {
                      setCart([]);
                      setShowCheckout(false);
                      // Preserve authentication state and navigate to products view
                      setShowAllProducts(true);
                      setShowHomePage(false);
                      toast({
                        title: "Order Placed Successfully!",
                        description: "You will receive an email confirmation shortly.",
                      });
                    }}
                  />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>Please complete all required customer information to proceed with payment</p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Powered by Quikpik Footer */}
      <Footer className="mt-12" />
      
      {/* Floating Help */}
      <FloatingHelp context="customer-portal" />
    </div>
  );
}