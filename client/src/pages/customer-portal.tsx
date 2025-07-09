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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductGridSkeleton, FormSkeleton } from "@/components/ui/loading-skeletons";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ShoppingCart, Plus, Minus, Trash2, Package, Star, Store, Mail, Phone, MapPin, CreditCard, Search, Filter, Grid, List, Eye, MoreHorizontal, ShieldCheck, Truck, ArrowLeft, Heart, Share2 } from "lucide-react";
import Logo from "@/components/ui/logo";
import Footer from "@/components/ui/footer";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  
  // Pallet/Unit selling options
  sellingFormat: "units" | "pallets" | "both";
  unitsPerPallet?: number;
  palletPrice?: string;
  palletMoq?: number;
  palletStock?: number;
  
  wholesaler: {
    id: string;
    businessName: string;
    businessPhone?: string;
    businessAddress?: string;
    profileImageUrl?: string;
    defaultCurrency?: string;
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
  shippingOption: "pickup" | "delivery";
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
                  const promoPrice = item.product.promoActive && item.product.promoPrice 
                    ? parseFloat(item.product.promoPrice) || 0
                    : 0;
                  const regularPrice = parseFloat(item.product.price) || 0;
                  return promoPrice > 0 ? promoPrice : regularPrice;
                }
              })()
            })),
            customerData,
            wholesalerId: wholesaler.id,
            totalAmount: totalAmount || 0,
            shippingInfo: {
              option: customerData.shippingOption,
              service: customerData.selectedShippingService
            }
          });
          const data = await response.json();
          setClientSecret(data.clientSecret);
        } catch (error: any) {
          console.error("Error creating payment intent:", error);
          toast({
            title: "Payment Error",
            description: error.message || "Unable to initialize payment. Please try again.",
            variant: "destructive",
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
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Payment succeeded, now create the order
        try {
          const response = await apiRequest("POST", "/api/marketplace/create-order", {
            paymentIntentId: paymentIntent.id
          });
          const orderResult = await response.json();
          
          toast({
            title: "Payment Successful!",
            description: `Order #${orderResult.orderId} created successfully. ${orderResult.platformFeeCollected ? '5% platform fee collected.' : 'Order processed via direct payment.'}`,
          });
          onSuccess();
        } catch (orderError: any) {
          console.error('Error creating order:', orderError);
          toast({
            title: "Payment Successful",
            description: "Payment completed but order creation failed. Please contact support.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      toast({
        title: "Payment Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg">
        <PaymentElement />
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <div className="flex items-center space-x-2 mb-2">
          <ShieldCheck className="w-4 h-4" />
          <span className="font-semibold">Secure Payment Processing</span>
        </div>
        <p>Your payment is processed securely through Stripe. A 5% platform fee is included in the total.</p>
      </div>

      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
      >
        {isProcessing ? (
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Processing Payment...</span>
          </div>
        ) : (
          `Pay ${getCurrencySymbol(wholesaler?.defaultCurrency)}${totalAmount.toFixed(2)}`
        )}
      </Button>
    </form>
  );
};

export default function CustomerPortal() {
  const { id: wholesalerIdParam } = useParams<{ id: string }>();
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // Detect if this is preview mode (accessed via /preview-store)
  const isPreviewMode = location === '/preview-store';
  
  // Use authenticated user's ID in preview mode, otherwise use URL parameter
  // Handle cases where ID might be undefined or empty
  const wholesalerId = isPreviewMode ? user?.id : (wholesalerIdParam || location.split('/customer/')[1]?.split('?')[0]);



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

  // State management
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showAllProducts, setShowAllProducts] = useState(false);
  
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
      const response = await apiRequest("POST", "/api/shipping/quotes", {
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
        parcels: [{
          weight: Math.max(2, Math.floor(cartStats.totalValue / 50)),
          length: 30,
          width: 20,
          height: 15,
          value: cartStats.totalValue
        }]
      });

      console.log("Shipping quotes response:", response);
      
      if (response.quotes && response.quotes.length > 0) {
        setAvailableShippingServices(response.quotes);
        toast({
          title: response.demoMode ? "Demo Shipping Options" : "Shipping Quotes Retrieved",
          description: `Found ${response.quotes.length} delivery options for your location${response.demoMode ? ' (demo mode)' : ''}`,
        });
      } else {
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

  // Get featured product ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const featuredProductId = urlParams.get('featured');

  // Fetch wholesaler data
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
    retry: 1
  });

  // Fetch featured product if specified with auto-refresh
  const { data: featuredProduct, isLoading: featuredLoading, refetch: refetchFeaturedProduct } = useQuery({
    queryKey: ['featured-product', featuredProductId],
    queryFn: async () => {
      const response = await fetch(`/api/marketplace/products/${featuredProductId}`);
      if (!response.ok) throw new Error("Failed to fetch featured product");
      return response.json();
    },
    enabled: !!featuredProductId,
    refetchInterval: enableAutoRefresh ? 30000 : false,
    refetchIntervalInBackground: true
  });

  // Fetch all products for the wholesaler with auto-refresh
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
    refetchInterval: enableAutoRefresh ? 30000 : false,
    refetchIntervalInBackground: true,
    retry: 1, // Reduced retries for faster failure
    retryDelay: 500, // Faster retry
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000 // Keep in cache for 10 minutes
  });

  // Memoized calculations - removed excessive logging for performance
  const filteredProducts = useMemo(() => {
    return products.filter((product: Product) => {
      const matchesSearch = !searchTerm || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || 
        product.category === selectedCategory;
      
      return matchesSearch && matchesCategory && product.status === 'active';
    });
  }, [products, searchTerm, selectedCategory]);

  const otherProducts = useMemo(() => {
    if (!featuredProduct) return filteredProducts;
    return filteredProducts.filter(p => p.id !== featuredProduct.id);
  }, [filteredProducts, featuredProduct]);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p: Product) => p.category).filter(Boolean));
    return Array.from(cats);
  }, [products]);

  const cartStats = useMemo(() => {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => {
      let price = 0;
      if (item.sellingType === "pallets") {
        price = parseFloat(item.product.palletPrice || "0") || 0;
      } else {
        const promoPrice = item.product.promoActive && item.product.promoPrice 
          ? parseFloat(item.product.promoPrice) || 0
          : 0;
        const regularPrice = parseFloat(item.product.price) || 0;
        price = promoPrice > 0 ? promoPrice : regularPrice;
      }
      // Ensure we never add NaN values
      const itemTotal = (price || 0) * (item.quantity || 0);
      return sum + (isNaN(itemTotal) ? 0 : itemTotal);
    }, 0);
    
    // Add shipping cost if delivery is selected
    const shippingCost = customerData.shippingOption === 'delivery' && customerData.selectedShippingService 
      ? customerData.selectedShippingService.price || 0 
      : 0;
      
    const totalValue = subtotal + shippingCost;
    
    // Ensure totalValue is never NaN
    return { 
      totalItems, 
      subtotal: isNaN(subtotal) ? 0 : subtotal,
      shippingCost: isNaN(shippingCost) ? 0 : shippingCost,
      totalValue: isNaN(totalValue) ? 0 : totalValue 
    };
  }, [cart, customerData.shippingOption, customerData.selectedShippingService]);

  // Handle sharing the store
  const handleShare = useCallback(async () => {
    const currentUrl = window.location.href;
    const storeName = wholesaler?.businessName || "Wholesale Store";
    const shareText = `Check out ${storeName} - ${wholesaler?.storeTagline || "Premium wholesale products"} available now!`;

    // Check if native sharing is available (mobile devices)
    if (navigator.share) {
      try {
        await navigator.share({
          title: storeName,
          text: shareText,
          url: currentUrl,
        });
        toast({
          title: "Store Shared",
          description: "Thank you for sharing this store!",
        });
      } catch (error) {
        // User cancelled sharing or sharing failed
        console.log("Sharing cancelled or failed:", error);
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(`${shareText} ${currentUrl}`);
        toast({
          title: "Link Copied",
          description: "Store link copied to clipboard. Share it with others!",
        });
      } catch (error) {
        // Fallback fallback: Show share options
        toast({
          title: "Share Store",
          description: "Copy this link to share: " + currentUrl,
        });
      }
    }
  }, [wholesaler?.businessName, toast]);

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

  // Early loading state
  if (featuredProductId && featuredLoading) {
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

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Logo variant="icon-only" size="sm" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {wholesalerLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading...</span>
                    </div>
                  ) : wholesalerError ? (
                    "Store Unavailable"
                  ) : (
                    wholesaler?.businessName || "Wholesale Store"
                  )}
                </h1>
                <p className="text-sm text-gray-600">
                  {wholesaler?.storeTagline || "Premium wholesale products"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleShare}
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share Store
              </Button>
              {!isPreviewMode && (
                <Button
                  onClick={() => setShowCheckout(true)}
                  className="bg-green-600 hover:bg-green-700 relative"
                  disabled={cart.length === 0}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Cart ({cartStats.totalItems})
                  {cartStats.totalItems > 0 && (
                    <Badge className="ml-2 bg-green-800">
                      {getCurrencySymbol(wholesaler?.defaultCurrency)}{cartStats.totalValue.toFixed(2)}
                    </Badge>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Featured Product - Clean Modern Design */}
        {featuredProduct && (
          <div className="mb-12">
            <Card className="overflow-hidden border-0 shadow-lg">
              <CardContent className="p-0">
                <div className="grid lg:grid-cols-2">
                  {/* Product Image */}
                  <div className="relative bg-white">
                    {featuredProduct.imageUrl ? (
                      <img 
                        src={featuredProduct.imageUrl} 
                        alt={featuredProduct.name}
                        className="w-full h-80 lg:h-96 object-cover"
                      />
                    ) : (
                      <div className="w-full h-80 lg:h-96 bg-gray-50 flex items-center justify-center">
                        <Package className="w-24 h-24 text-gray-300" />
                      </div>
                    )}
                    
                    {/* Sale Badge */}
                    {featuredProduct.promoActive && featuredProduct.promoPrice && (
                      <div className="absolute top-6 left-6">
                        <div className="bg-red-500 text-white px-4 py-2 rounded-full text-sm font-medium">
                          SALE
                        </div>
                      </div>
                    )}
                    
                    {/* Negotiable Badge */}
                    {featuredProduct.negotiationEnabled && (
                      <div className="absolute top-6 right-6">
                        <div className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium">
                          Negotiable
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Product Details */}
                  <div className="p-8 lg:p-12 bg-white">
                    <div className="space-y-6">
                      {/* Title and Category */}
                      <div>
                        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-3">
                          {featuredProduct.name}
                        </h1>
                        {featuredProduct.category && (
                          <div className="inline-block bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-medium mb-4">
                            {featuredProduct.category}
                          </div>
                        )}
                        {featuredProduct.description && (
                          <p className="text-gray-600 text-lg leading-relaxed">
                            {featuredProduct.description}
                          </p>
                        )}
                      </div>
                      
                      {/* Price */}
                      <div className="border-t border-b py-6">
                        {featuredProduct.promoActive && featuredProduct.promoPrice ? (
                          <div>
                            <div className="flex items-baseline gap-4 mb-2">
                              <span className="text-4xl font-bold text-green-600">
                                {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(featuredProduct.promoPrice).toFixed(2)}
                              </span>
                              <span className="text-2xl text-gray-400 line-through">
                                {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(featuredProduct.price).toFixed(2)}
                              </span>
                            </div>
                            <div className="text-sm text-green-600 font-medium">
                              Save {getCurrencySymbol(wholesaler?.defaultCurrency)}{(parseFloat(featuredProduct.price) - parseFloat(featuredProduct.promoPrice)).toFixed(2)} ({Math.round((1 - parseFloat(featuredProduct.promoPrice) / parseFloat(featuredProduct.price)) * 100)}% off)
                            </div>
                          </div>
                        ) : (
                          <div className="text-4xl font-bold text-gray-900">
                            {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(featuredProduct.price).toFixed(2)}
                          </div>
                        )}
                        <div className="text-sm text-gray-500 mt-1">Price per unit</div>
                      </div>
                      
                      {/* Product Stats */}
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

                      {/* Negotiation Info */}
                      {featuredProduct.negotiationEnabled && (
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

                      {/* Action Buttons */}
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

        {/* Search and Filters */}
        {(!featuredProduct || showAllProducts) && (
          <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex space-x-2">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-40">
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
                
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("grid")}
                    className="rounded-r-none"
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className="rounded-l-none"
                  >
                    <List className="w-4 h-4" />
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">See All Products</h2>
              <Button
                onClick={() => setShowAllProducts(true)}
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50 font-medium"
              >
                View All ({otherProducts.length})
              </Button>
            </div>
            
            {/* Preview of Products */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {otherProducts.slice(0, 6).map((product: Product) => (
                <Card key={product.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    {/* Product Image */}
                    <div className="mb-4">
                      {product.imageUrl ? (
                        <img 
                          src={product.imageUrl} 
                          alt={product.name}
                          className="w-full h-40 object-cover rounded-lg"
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
                            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
                              SALE
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
                      <Button
                        onClick={() => openQuantityEditor(product)}
                        className="w-full bg-green-600 hover:bg-green-700 mt-4"
                        size="sm"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add to Cart
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* All Products View - Only shown when "View All" is clicked */}
        {showAllProducts && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">All Products</h2>
              <Button
                onClick={() => setShowAllProducts(false)}
                variant="outline"
                className="text-gray-600 border-gray-300 hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Featured
              </Button>
            </div>
            
            {productsLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, index) => (
                  <ProductCardSkeleton key={index} />
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
                    <p className="text-gray-500">No products available at the moment</p>
                  </div>
                ) : (
                  filteredProducts.map((product: Product) => (
                    <Card key={product.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                      <CardContent className="p-6">
                        {/* Product Image */}
                        <div className="mb-4">
                          {product.imageUrl ? (
                            <img 
                              src={product.imageUrl} 
                              alt={product.name}
                              className="w-full h-40 object-cover rounded-lg"
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
                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
                                  SALE
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
                          <Button
                            onClick={() => openQuantityEditor(product)}
                            className="w-full bg-green-600 hover:bg-green-700 mt-4"
                            size="sm"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add to Cart
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
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
                    <p>Price per unit: {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(selectedProduct.price).toFixed(2)}</p>
                  </>
                )}
              </div>
              
              <div className="flex items-center space-x-3">
                <Label>Quantity:</Label>
                <div className="flex items-center space-x-2 flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const minQty = selectedSellingType === "pallets" ? (selectedProduct.palletMoq || 1) : selectedProduct.moq;
                      setEditQuantity(Math.max(minQty, editQuantity - 1));
                    }}
                    disabled={editQuantity <= (selectedSellingType === "pallets" ? (selectedProduct.palletMoq || 1) : selectedProduct.moq)}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    type="number"
                    value={editQuantity}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      // Allow empty input for typing
                      if (inputValue === '') {
                        setEditQuantity(0);
                        return;
                      }
                      
                      const value = parseInt(inputValue);
                      // Allow typing any number, validation happens on blur
                      if (!isNaN(value)) {
                        setEditQuantity(value);
                      }
                    }}
                    onBlur={(e) => {
                      const value = parseInt(e.target.value);
                      const minQty = selectedSellingType === "pallets" ? (selectedProduct.palletMoq || 1) : selectedProduct.moq;
                      const maxQty = selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock;
                      
                      if (isNaN(value) || value < minQty) {
                        setEditQuantity(minQty);
                      } else if (value > maxQty) {
                        setEditQuantity(maxQty);
                      }
                    }}
                    className="w-24 text-center"
                    min={selectedSellingType === "pallets" ? (selectedProduct.palletMoq || 1) : selectedProduct.moq}
                    max={selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock}
                    placeholder={`${selectedSellingType === "pallets" ? (selectedProduct.palletMoq || 1) : selectedProduct.moq}-${selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock}`}
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
                editQuantity >= (selectedProduct.palletStock || 0) && (
                  <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                    ⚠️ Quantity limited to available stock ({formatNumber(selectedProduct.palletStock || 0)} pallets)
                  </div>
                )
              ) : (
                editQuantity >= selectedProduct.stock && (
                  <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                    ⚠️ Quantity limited to available stock ({formatNumber(selectedProduct.stock)} units)
                  </div>
                )
              )}
              
              {/* MOQ warning when below minimum */}
              {selectedSellingType === "pallets" ? (
                editQuantity > 0 && editQuantity < (selectedProduct.palletMoq || 1) && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                    ❌ Quantity must be at least {formatNumber(selectedProduct.palletMoq || 1)} pallets (minimum order quantity)
                  </div>
                )
              ) : (
                editQuantity > 0 && editQuantity < selectedProduct.moq && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                    ❌ Quantity must be at least {formatNumber(selectedProduct.moq)} units (minimum order quantity)
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
                  const unitPrice = selectedSellingType === "pallets" 
                    ? parseFloat(selectedProduct.palletPrice || "0")
                    : parseFloat(selectedProduct.price);
                  return (unitPrice * editQuantity).toFixed(2);
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
                    selectedSellingType === "pallets" 
                      ? (editQuantity < (selectedProduct.palletMoq || 1) || editQuantity > (selectedProduct.palletStock || 0))
                      : (editQuantity < selectedProduct.moq || editQuantity > selectedProduct.stock)
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
        <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
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
                              {getCurrencySymbol(wholesaler?.defaultCurrency)}{parseFloat(item.product.price).toFixed(2)} per unit
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
                            const minQty = item.sellingType === "pallets" ? (item.product.palletMoq || 1) : item.product.moq;
                            const newQuantity = Math.max(minQty, item.quantity - 1);
                            if (newQuantity !== item.quantity) {
                              setCart(cart.map(cartItem => 
                                cartItem.product.id === item.product.id && cartItem.sellingType === item.sellingType
                                  ? { ...cartItem, quantity: newQuantity }
                                  : cartItem
                              ));
                            }
                          }}
                          disabled={item.quantity <= (item.sellingType === "pallets" ? (item.product.palletMoq || 1) : item.product.moq)}
                          className="w-8 h-8 p-0"
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        
                        <div className="text-center min-w-[80px]">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const newQuantity = parseInt(e.target.value) || 0;
                              const minQty = item.sellingType === "pallets" ? (item.product.palletMoq || 1) : item.product.moq;
                              const maxQty = item.sellingType === "pallets" ? (item.product.palletStock || 0) : item.product.stock;
                              
                              if (newQuantity >= minQty && newQuantity <= maxQty) {
                                setCart(cart.map(cartItem => 
                                  cartItem.product.id === item.product.id && cartItem.sellingType === item.sellingType
                                    ? { ...cartItem, quantity: newQuantity }
                                    : cartItem
                                ));
                              }
                            }}
                            onBlur={(e) => {
                              const minQty = item.sellingType === "pallets" ? (item.product.palletMoq || 1) : item.product.moq;
                              const maxQty = item.sellingType === "pallets" ? (item.product.palletStock || 0) : item.product.stock;
                              const newQuantity = parseInt(e.target.value) || minQty;
                              const validQuantity = Math.min(Math.max(newQuantity, minQty), maxQty);
                              setCart(cart.map(cartItem => 
                                cartItem.product.id === item.product.id && cartItem.sellingType === item.sellingType
                                  ? { ...cartItem, quantity: validQuantity }
                                  : cartItem
                              ));
                            }}
                            min={item.sellingType === "pallets" ? (item.product.palletMoq || 1) : item.product.moq}
                            max={item.sellingType === "pallets" ? (item.product.palletStock || 0) : item.product.stock}
                            className="h-8 text-center text-sm"
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            {item.sellingType === "pallets" ? "pallets" : "units"}
                          </div>
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
                            const price = item.sellingType === "pallets" 
                              ? parseFloat(item.product.palletPrice || "0")
                              : parseFloat(item.product.price);
                            return (price * item.quantity).toFixed(2);
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
                    <span>{getCurrencySymbol(wholesaler?.defaultCurrency)}{cartStats.subtotal.toFixed(2)}</span>
                  </div>
                  {customerData.shippingOption === 'delivery' && customerData.selectedShippingService && (
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
                  <Separator className="my-2" />
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total:</span>
                    <span>{getCurrencySymbol(wholesaler?.defaultCurrency)}{cartStats.totalValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

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
                    placeholder="Any special delivery instructions or notes..."
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
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      customerData.shippingOption === 'delivery' 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => {
                      setCustomerData({...customerData, shippingOption: 'delivery'});
                      if (customerData.address && customerData.city && customerData.postalCode) {
                        fetchShippingQuotes();
                      }
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        customerData.shippingOption === 'delivery' 
                          ? 'border-green-500 bg-green-500' 
                          : 'border-gray-300'
                      }`} />
                      <div>
                        <h4 className="font-medium">Delivery</h4>
                        <p className="text-sm text-gray-600">Courier delivery to your address</p>
                        <p className="text-sm font-medium text-blue-600">Select service below</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping Services Selection */}
                {customerData.shippingOption === 'delivery' && (
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
                    totalAmount={cartStats.totalValue}
                    onSuccess={() => {
                      setCart([]);
                      setShowCheckout(false);
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
    </div>
  );
}