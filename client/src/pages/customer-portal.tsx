import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

// Core UI Components - loaded immediately
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { VerifiedBadge } from "@/components/VerifiedBadge";
import Logo from "@/components/ui/logo";
import { CustomerAuth } from "@/components/customer/CustomerAuth";
import CustomerHelp from "@/components/customer/CustomerHelp";
import { format } from "date-fns";
import { DeliveryAddressManager } from "@/components/customer/DeliveryAddressManager";
import { FirstTimeAddressSetup } from "@/components/customer/FirstTimeAddressSetup";
import { AddressSelector } from "@/components/customer/AddressSelector";
import { ProductGridSkeleton } from "@/components/ui/loading-skeletons";
import { ThemeSwitcher, useCustomerTheme } from "@/components/ui/theme-switcher";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Shared utilities and types
import { cleanAIDescription } from "@shared/utils";

import { formatCurrency } from "@/lib/currencies";
import { Package2, Hash } from "lucide-react";
import { getGuestBackTarget, getGuestStockRows, getSellingFormatLabel } from "@/lib/guest-catalogue";

// Customer portal types and shared components (extracted from this file)
import type { ExtendedProduct, CartItem, Product, CustomerData, AuthenticatedCustomer } from "@/components/customer/portal-types";
import { PriceDisplay } from "@/components/customer/PriceDisplay";
import { CustomerProductCardSkeleton, CustomerFeaturedProductSkeleton } from "@/components/customer/CustomerPortalSkeletons";
import { StripeCheckoutForm } from "@/components/customer/StripeCheckoutForm";
import { RecentOrdersSection } from "@/components/customer/RecentOrdersSection";

// Tab components (Phase 2 extraction)
import { HomeTab } from "@/components/customer/portal/HomeTab";
import { ProductsTab } from "@/components/customer/portal/ProductsTab";
import { OrdersTab } from "@/components/customer/portal/OrdersTab";
import { AccountTab } from "@/components/customer/portal/AccountTab";
import { HelpTab } from "@/components/customer/portal/HelpTab";

// Overlay components (Phase 3 extraction)
import { StoreSwitcher } from "@/components/customer/portal/StoreSwitcher";
import { CheckoutDialog } from "@/components/customer/portal/CheckoutDialog";
import { UnitSelectionModal } from "@/components/customer/portal/UnitSelectionModal";

// VERSION MARKER – logs once at module load to confirm deployed bundle identity.
// Root cause of "wholesaler is not defined" crash:
//   A conditional early-return (if !wholesalerId) was placed in the MIDDLE of hook
//   declarations, with `const { data: wholesaler } = useQuery(...)` after it. On renders
//   where wholesalerId was falsy the hook was skipped, causing a React hooks-count mismatch
//   on the next render (where it was truthy). The resulting error was caught by ErrorBoundary
//   as "wholesaler is not defined". Fixed in task109 by moving the early-return to AFTER all
//   hooks. This module-level log confirms the fix is deployed.
const CUSTOMER_PORTAL_VERSION = 'task110-fix-2026-04-13';

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
  const [authenticatedCustomer, setAuthenticatedCustomer] = useState<AuthenticatedCustomer | null>(null);
  const [showFirstTimeAddressSetup, setShowFirstTimeAddressSetup] = useState(false);
  const [isSwitchingWholesaler, setIsSwitchingWholesaler] = useState(false);
  const [showStoreSwitcher, setShowStoreSwitcher] = useState(false);

  // Dedicated query for the store switcher — only fires when the sheet is open
  const { data: switcherStores = [], isLoading: switcherStoresLoading } = useQuery({
    queryKey: ["/api/customer-accessible-wholesalers/switcher", authenticatedCustomer?.phone],
    queryFn: async () => {
      const phoneNumber = encodeURIComponent(authenticatedCustomer!.phone ?? '');
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
  const [openRequestAccessOnAuth, setOpenRequestAccessOnAuth] = useState(false);
  const [showRequestAccessDialog, setShowRequestAccessDialog] = useState(false);
  const [requestAccessTarget, setRequestAccessTarget] = useState<{id: string; businessName: string} | null>(null);
  const [requestAccessMessage, setRequestAccessMessage] = useState("");
  const [requestAccessName, setRequestAccessName] = useState("");
  const [requestAccessPhone, setRequestAccessPhone] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
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
  const [publishableKey, setPublishableKey] = useState("");
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
  
  // Request access handler for new wholesalers — opens message prompt dialog
  const handleRequestAccess = (wholesaler: { id: string; businessName: string }) => {
    if (!authenticatedCustomer?.phone) return;
    setRequestAccessTarget({ id: wholesaler.id, businessName: wholesaler.businessName });
    setRequestAccessMessage("");
    setShowRequestAccessDialog(true);
  };

  // Submit the access request (used by both flows)
  const handleSubmitRequestAccess = async () => {
    if (!requestAccessTarget) return;
    const customerPhone = isTrueGuestMode ? requestAccessPhone.trim() : authenticatedCustomer?.phone;
    const customerName = isTrueGuestMode ? requestAccessName.trim() : authenticatedCustomer?.name;
    if (!customerPhone || !customerName) return;

    setIsSubmittingRequest(true);
    try {
      const response = await fetch('/api/customer/request-wholesaler-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          wholesalerId: requestAccessTarget.id,
          customerPhone,
          customerName,
          customerEmail: authenticatedCustomer?.email || null,
          requestMessage: requestAccessMessage.trim() || null,
        })
      });

      const data = await response.json();

      if (response.ok) {
        setShowRequestAccessDialog(false);
        setRequestAccessMessage("");
        setRequestAccessName("");
        setRequestAccessPhone("");
        toast({
          title: "Request Sent",
          description: `Your request has been sent to ${requestAccessTarget.businessName}. You'll be notified once they respond.`,
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
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // Fetch available wholesalers for search - registration-aware for authenticated customers
  const { data: availableWholesalers = [], isLoading: wholesalersLoading } = useQuery<{ id: string; businessName?: string; firstName?: string; lastName?: string; logoType?: string; logoUrl?: string; storeTagline?: string; location?: string; isAccessible?: boolean; canRequestAccess?: boolean; isVerified?: boolean }[]>({
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
        const accessibleIds = accessibleWholesalers.map((w: { id: string }) => w.id);
        
        // Then get all marketplace wholesalers for discovery
        const params = new URLSearchParams();
        if (wholesalerSearchQuery) params.append("search", wholesalerSearchQuery);
        const marketplaceResponse = await fetch(`/api/marketplace/wholesalers?${params}`, {
          credentials: "include",
        });
        if (!marketplaceResponse.ok) throw new Error("Failed to fetch marketplace wholesalers");
        const allWholesalers = await marketplaceResponse.json();
        
        // Combine and mark accessibility status
        const combinedWholesalers = allWholesalers.map((wholesaler: { id: string; businessName?: string; isAccessible?: boolean; canRequestAccess?: boolean; [key: string]: unknown }) => ({
          ...wholesaler,
          isAccessible: accessibleIds.includes(wholesaler.id),
          canRequestAccess: !accessibleIds.includes(wholesaler.id)
        }));
        
        // Sort: accessible first, then by business name
        combinedWholesalers.sort((a: { businessName?: string; isAccessible?: boolean }, b: { businessName?: string; isAccessible?: boolean }) => {
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
        return wholesalers.map((w: { id: string; businessName?: string; [key: string]: unknown }) => ({ ...w, isAccessible: false, canRequestAccess: false }));
      }
    },
    enabled: showWholesalerSearch, // Only fetch when search is open
  });

  // Cache invalidation when wholesaler ID changes
  useEffect(() => {
    if (wholesalerId) {
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
  const [showCheckout, setShowCheckout] = useState(false);
  const [showPortalQuoteModal, setShowPortalQuoteModal] = useState(false);
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
    customerData: CustomerData;
    totalAmount: number;
    subtotal: number;
    customerTransactionFee: number;
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
  }, [customerData.shippingOption]);

  // Auto-create payment intent when checkout opens with pre-selected shipping (skip in pay-later mode)
  useEffect(() => {
    if (showCheckout && !payLaterMode && customerData.shippingOption && !clientSecret && !isCreatingIntent && cart.length > 0) {
      createPaymentIntentForCheckout(customerData.shippingOption);
    }
  }, [showCheckout, payLaterMode, customerData.shippingOption, clientSecret, isCreatingIntent, cart.length]);



  // CRITICAL FIX: Clear all customer data when authenticated customer changes
  useEffect(() => {
    if (authenticatedCustomer?.phone) {
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
      const response = await fetch(`/api/marketplace/wholesaler/${wholesalerId}`);
      if (!response.ok) {
        console.error(`Wholesaler fetch failed: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch wholesaler: ${response.status}`);
      }
      const data = await response.json();
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

  // Reset payLaterMode if wholesaler doesn't support it (e.g. toggled off between sessions)
  useEffect(() => {
    if (wholesaler && !wholesaler.allowPayLater && payLaterMode) {
      setPayLaterMode(false);
    }
  }, [wholesaler, payLaterMode]);

  // Personalized welcome microinteraction effect
  useEffect(() => {
    if (authenticatedCustomer && customerOrderStats && isAuthenticated) {
      
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
          return `Welcome back, loyal customer! ${formatCurrency(spent, wholesaler?.preferredCurrency || wholesaler?.defaultCurrency || 'GBP')} in total spending 🏆`;
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
      const response = await fetch(`/api/marketplace/products/${featuredProductId}`);
      if (!response.ok) throw new Error("Failed to fetch featured product");
      const data = await response.json();
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
      const guestParam = shouldFetchGuestSafeProducts ? '?guest=true' : '';
      const response = await fetch(`/api/customer-products/${wholesalerId}${guestParam}`);
      
      if (!response.ok) {
        const responseText = await response.text();
        console.error(`❌ Products fetch failed: ${response.status} ${response.statusText}`);
        console.error(`❌ Response body:`, responseText.substring(0, 500));
        throw new Error(`Failed to fetch products: ${response.status}`);
      }
      
      const data = await response.json();
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

  // Auto-remove out-of-stock items from cart whenever the product list refreshes
  useEffect(() => {
    if (!products.length || !cart.length) return;
    const productMap = new Map(products.map((p: Product) => [p.id, p]));
    const removedNames: string[] = [];
    const updatedCart = cart.filter(item => {
      const fresh = productMap.get(item.product.id);
      if (!fresh) return true; // product not found in list — keep it
      const outOfStock =
        item.sellingType === "pallets"
          ? (fresh.palletStock ?? 0) <= 0
          : (fresh.stock ?? 0) <= 0;
      if (outOfStock) {
        removedNames.push(item.product.name);
        return false;
      }
      return true;
    });
    if (removedNames.length > 0) {
      setCart(updatedCart);
      toast({
        title: "Items removed from cart",
        description: `${removedNames.join(", ")} ${removedNames.length === 1 ? "is" : "are"} now out of stock and ${removedNames.length === 1 ? "has" : "have"} been removed from your cart.`,
        variant: "destructive",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Central, platform-managed category list (shared list, ordered consistently everywhere).
  const { data: centralCategories = [] } = useQuery<{ id: number; name: string; productCount: number }[]>({
    queryKey: ["/api/categories"],
  });

  const calculatePromotionalPricing = (product: Product | ExtendedProduct, quantity: number = 1) => {
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

    const offers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
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
        const fixedDetail = `${formatCurrency(offer.fixedPrice)} each`;
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
        const clearanceDetail = `${formatCurrency(offer.fixedPrice)} each`;
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
    const filtered = products.filter((product: Product) => {
      const matchesSearch = !searchTerm || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || selectedCategory === "All Categories" || 
        product.category === selectedCategory;
      
      const isActive = product.status === 'active';
      
      
      return matchesSearch && matchesCategory && isActive;
    });
    
    return filtered;
  }, [products, searchTerm, selectedCategory]);

  const otherProducts = useMemo(() => {
    if (!featuredProduct) return filteredProducts;
    return filteredProducts.filter(p => p.id !== featuredProduct.id);
  }, [filteredProducts, featuredProduct, featuredProductId]);

  const categories = useMemo(() => {
    const presentCats = new Set(products.map((p: Product) => p.category).filter(Boolean) as string[]);
    const centralNames = centralCategories.map(c => c.name);
    return [
      ...centralNames.filter(name => presentCats.has(name)),
      ...Array.from(presentCats).filter(name => !centralNames.includes(name)).sort(),
    ];
  }, [products, centralCategories]);

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
    let bogoffDetails: { productName: string; freeItems: number }[] = [];

    cart.forEach(item => {
      let itemPrice = 0;
      const itemQuantity = Number(item.quantity) || 0;
      
      if (item.sellingType === "pallets") {
        itemPrice = parseFloat(item.product.palletPrice || "0") || 0;
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
      openCustomerSignIn();
      return;
    }
    
    // Validate quantity meets MOQ requirements (unless stock is less than MOQ)
    const minQuantity = sellingType === "pallets" ? (product.palletMoq || 1) : (product.moq || 1);
    const availableStock = sellingType === "pallets" 
      ? (product.palletStock || 0)
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
    
    if (!shippingOption) {
      console.error('No shipping option provided');
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
        toast({
          title: "Address incomplete",
          description: "Please select a complete delivery address",
          variant: "destructive",
        });
        setIsCreatingIntent(false);
        return;
      }
      
    }
    
    // CRITICAL FIX: Check if shipping option changed - if so, create new payment intent
    const shippingOptionChanged = clientSecret && lastUsedShippingOption && lastUsedShippingOption !== shippingOption;
    
    if (shippingOptionChanged) {
      setClientSecret(''); // Clear existing payment intent
      setPublishableKey(''); // Clear stale publishable key — new intent will supply a fresh one
      setLastUsedShippingOption(shippingOption as 'pickup' | 'delivery'); // Update tracking
    }
    
    if ((isCreatingIntent || clientSecret) && !shippingOptionChanged) {
      return;
    }
    
    if (!wholesaler) {
      return;
    }

    setIsCreatingIntent(true);
    
    try {
      // Calculate total amount for cart using promotional pricing
      const totalAmount = cart.reduce((total, item) => {
        if (item.sellingType === 'pallets') {
          const palletPrice = parseFloat(item.product.palletPrice || "0") || 0;
          return total + (palletPrice * item.quantity);
        } else {
          const pricing = calculatePromotionalPricing(item.product, item.quantity);
          return total + pricing.totalCost;
        }
      }, 0);

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
              unitPrice: parseFloat(item.product.palletPrice || "0") || 0,
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
      
      const response = await apiRequest("POST", "/api/customer/create-payment", requestPayload);
      
      if (response.ok) {
        const data = await response.json();
        
        // Validate client secret format before using it
        if (!data.clientSecret || !data.clientSecret.startsWith('pi_')) {
          throw new Error('Invalid payment setup received from server');
        }
        
        setClientSecret(data.clientSecret);
        if (data.publishableKey) setPublishableKey(data.publishableKey);
        setLastUsedShippingOption(shippingOption as 'pickup' | 'delivery');
      } else {
        const errorText = await response.text();

        // Parse the server error message (API returns { message: "..." })
        let serverMessage: string | null = null;
        try {
          const parsed = JSON.parse(errorText);
          serverMessage = parsed.message || parsed.error || null;
        } catch {
          serverMessage = errorText || null;
        }

        // Map server messages to friendly user-facing copy
        let userMessage = "Unable to set up payment. Please try again.";
        if (response.status === 500 && errorText.includes('payment_config_error')) {
          userMessage = "There's an issue with the payment setup. Please contact the business owner.";
        } else if (response.status === 400 && errorText.includes('calculation_error')) {
          userMessage = "Payment amount calculation error. Please refresh and try again.";
        } else if (response.status === 409 && errorText.includes('idempotency_conflict')) {
          userMessage = "Your previous payment session expired. Please refresh the page and try again.";
        } else if (serverMessage && /insufficient stock|out of stock/i.test(serverMessage)) {
          const match = serverMessage.match(/Insufficient stock for (.+?)\./i);
          const productName = match ? match[1] : 'an item';
          userMessage = `${productName} is out of stock. Please remove it from your basket and try again.`;
        } else if (response.status === 400 && serverMessage) {
          userMessage = serverMessage;
        }

        toast({
          title: "Payment Setup Failed",
          description: userMessage,
          variant: "destructive",
        });
        console.error('Payment setup failed:', response.status, errorText);
        return; // return early — don't throw, which would double-toast via the catch block below
      }
    } catch (error) {
      console.error('Error creating payment intent:', error);
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
      return;
    }
    
    if (!wholesaler) {
      return;
    }

    setIsCreatingIntent(true);
    
    try {
      // Calculate total amount for cart using promotional pricing
      const totalAmount = cart.reduce((total, item) => {
        if (item.sellingType === 'pallets') {
          const palletPrice = parseFloat(item.product.palletPrice || "0") || 0;
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
              unitPrice: parseFloat(item.product.palletPrice || "0") || 0,
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
      
      const response = await apiRequest("POST", "/api/customer/create-payment", requestPayload);
      
      if (response.ok) {
        const data = await response.json();
        setClientSecret(data.clientSecret);
        if (data.publishableKey) setPublishableKey(data.publishableKey);
        setLastUsedShippingOption(shippingOption);
      } else {
        const errorText = await response.text();

        let serverMessage: string | null = null;
        try {
          const parsed = JSON.parse(errorText);
          serverMessage = parsed.message || parsed.error || null;
        } catch {
          serverMessage = errorText || null;
        }

        let userMessage = "Unable to set up payment. Please try again.";
        if (serverMessage && /insufficient stock|out of stock/i.test(serverMessage)) {
          const match = serverMessage.match(/Insufficient stock for (.+?)\./i);
          const productName = match ? match[1] : 'an item';
          userMessage = `${productName} is out of stock. Please remove it from your basket and try again.`;
        } else if (response.status === 400 && serverMessage) {
          userMessage = serverMessage;
        }

        toast({
          title: "Payment Setup Failed",
          description: userMessage,
          variant: "destructive",
        });
        console.error('Payment setup failed with custom data:', response.status, errorText);
        return;
      }
    } catch (error) {
      console.error('Error creating payment intent with custom data:', error);
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
    const maxQuantity = selectedSellingType === "pallets" ? (selectedProduct.palletStock || 0) : selectedProduct.stock;
    
    if (editQuantity >= minQuantity && editQuantity <= maxQuantity) {
      addToCart(selectedProduct as unknown as ExtendedProduct, editQuantity, selectedSellingType);
      setShowQuantityEditor(false);
      setSelectedProduct(null);
    }
  };

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

  // Authentication handlers
  const handleAuthSuccess = (customer: AuthenticatedCustomer) => {
    clearGuestParam();
    setOpenRequestAccessOnAuth(false);
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

  const enterGuestMode = () => {
    setOpenRequestAccessOnAuth(false);
    setShowAuth(false);
    setIsGuestMode(true);
    setIsAuthenticated(false);
    setAuthenticatedCustomer(null);
    setCart([]);
    setSearchTerm("");
  };

  // Handle guest browse - skip authentication
  const handleSkipAuth = () => {
    enterGuestMode();
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
        // Clear SW API cache on logout so no cached data persists across sessions
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
        }
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
        
        // Redirect to customer-login page — ?loggedOut=1 suppresses session-resume check
        window.location.href = '/customer-login?loggedOut=1';
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
    if (nextUrl.searchParams.has('guest') || nextUrl.searchParams.has('guestFrom')) {
      nextUrl.searchParams.delete('guest');
      nextUrl.searchParams.delete('guestFrom');
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
    setRequestAccessTarget({
      id: wholesalerId || '',
      businessName: wholesaler?.businessName || 'this wholesaler'
    });
    setRequestAccessMessage("");
    setRequestAccessName("");
    setRequestAccessPhone("");
    setShowRequestAccessDialog(true);
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
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Store Preview',
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
      setOpenRequestAccessOnAuth(false);
      setIsAuthenticated(false);
      setAuthenticatedCustomer(null);
      setShowAuth(true);
      setIsGuestMode(true);
      return;
    }

    // Check if we have a valid server session
    if (sessionData?.authenticated && sessionData?.customer) {
      setIsAuthenticated(true);
      setAuthenticatedCustomer(sessionData.customer);
      setShowAuth(false);
      setIsGuestMode(false);
      setIsSwitchingWholesaler(false); // Clear switching state now that new store auth is confirmed
      clearGuestParam();
      return;
    }

    if (forceGuestParam) {
      setIsAuthenticated(false);
      setAuthenticatedCustomer(null);
      setShowAuth(false);
      setIsGuestMode(true);
      return;
    }
    
    // No valid authentication - show authentication screen only if not switching wholesalers
    if (!isSwitchingWholesaler) {
      setIsAuthenticated(false);
      setAuthenticatedCustomer(null);
      setShowAuth(true);
      setIsGuestMode(true);
    } else {
      // Session check resolved with no auth while switching — clear switching state and show auth
      setIsSwitchingWholesaler(false);
      setIsAuthenticated(false);
      setAuthenticatedCustomer(null);
      setShowAuth(true);
      setIsGuestMode(true);
    }
  }, [isEnhancedPreviewMode, isWholesalerOwnStore, user, wholesalerId, sessionLoading, sessionData, forceLoginParam, forceGuestParam, isSwitchingWholesaler]);




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
    return <CustomerAuth 
      wholesalerId={wholesalerId} 
      onAuthSuccess={handleAuthSuccess}
      onSkipAuth={handleSkipAuth}
      openRequestAccess={openRequestAccessOnAuth}
    />;
  }

  // Show loading while wholesaler data is being fetched - prevents rendering with undefined wholesaler
  if ((wholesalerLoading || (productsLoading && products.length === 0)) && wholesalerId && !isEnhancedPreviewMode) {
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
    return <LazyThankYouPage
      orderNumber={completedOrder.orderNumber}
      cart={completedOrder.cart}
      customerData={completedOrder.customerData}
      totalAmount={completedOrder.totalAmount}
      subtotal={completedOrder.subtotal}
      customerTransactionFee={completedOrder.customerTransactionFee}
      shippingCost={completedOrder.shippingCost}
      payLater={completedOrder.payLater}
      wholesaler={{
        businessName: wholesaler?.businessName || 'Business',
        email: wholesaler?.email || 'hello@business.com',
        phone: wholesaler?.businessPhone || wholesaler?.phone || '+44000000000',
        currency: wholesaler?.preferredCurrency || wholesaler?.defaultCurrency || 'GBP'
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
          <CustomerFeaturedProductSkeleton />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <CustomerProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      {/* Preview Mode Banner */}
      {isEnhancedPreviewMode && (
        <div className="bg-orange-500 text-white px-4 py-2 text-center text-sm font-medium">
          🔍 Store Preview Mode{isWholesalerOwnStore ? ' (Viewing Your Store)' : ''} - Cart and checkout features are disabled for testing
        </div>
      )}

      {/* Header - Single-row on all viewports */}
      <div className="bg-[#f7f6f2] border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* Left — Store Logo + Name */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {wholesaler?.logoUrl ? (
                <img 
                  src={wholesaler.logoUrl} 
                  alt={wholesaler.businessName || "Business logo"} 
                  className="h-10 w-10 rounded-xl object-contain flex-shrink-0 bg-white border border-gray-200 p-0.5"
                />
              ) : wholesaler?.logoType === "business" && wholesaler?.businessName ? (
                <div className="h-10 w-10 rounded-xl bg-theme-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white">
                    {wholesaler.businessName
                      .split(' ')
                      .map((word: string) => word.charAt(0).toUpperCase())
                      .join('')
                      .substring(0, 2)}
                  </span>
                </div>
              ) : (
                <div className="h-10 w-10 rounded-xl bg-theme-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white">
                    {wholesaler?.businessName ? (
                      wholesaler.businessName.charAt(0).toUpperCase() + 
                      (wholesaler.businessName.split(' ')[1]?.charAt(0).toUpperCase() || wholesaler.businessName.charAt(1).toUpperCase())
                    ) : 'QP'}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base font-extrabold text-gray-950 truncate leading-tight tracking-tight">
                    {wholesalerLoading ? (
                      <span className="text-gray-400">Loading...</span>
                    ) : wholesalerError ? (
                      "Store Unavailable"
                    ) : (
                      wholesaler?.businessName || "Wholesale Store"
                    )}
                  </h1>
                  {wholesaler?.isVerified && <VerifiedBadge />}
                </div>
                {wholesaler?.storeTagline && (
                  <p className="text-xs text-gray-500 truncate leading-tight hidden sm:block">
                    {wholesaler.storeTagline}
                  </p>
                )}
              </div>
            </div>

            {/* Right — Action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Guest: Back */}
              {isTrueGuestMode && (
                <Button
                  onClick={async () => {
                    const guestBackTarget = getGuestBackTarget(window.location.search);
                    if (guestBackTarget.type === "store") {
                      setOpenRequestAccessOnAuth(false);
                      setIsGuestMode(false);
                      setShowAuth(false);
                      setShowWholesalerSearch(false);
                      setWholesalerSearchQuery("");
                      setCart([]);
                      setIsSwitchingWholesaler(true);
                      setLocation(`/store/${encodeURIComponent(guestBackTarget.wholesalerId)}`);
                      return;
                    }
                    if (guestBackTarget.type === "seller-selection") {
                      setOpenRequestAccessOnAuth(false);
                      setIsAuthenticated(false);
                      setAuthenticatedCustomer(null);
                      setCart([]);
                      setShowAuth(false);
                      setWholesalerSearchQuery("");
                      setShowWholesalerSearch(true);
                      return;
                    }
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
              const accessibleSellers = availableWholesalers.filter((w) => w.isAccessible);
              const discoverSellers = availableWholesalers.filter((w) => !w.isAccessible);
              const isSearching = wholesalerSearchQuery.trim().length > 0;

              const WholesalerCard = ({ wholesalerItem }: { wholesalerItem: typeof availableWholesalers[number] }) => (
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-semibold text-gray-900 text-sm">{wholesalerItem.businessName || "Business"}</h4>
                      {wholesalerItem.isVerified && <VerifiedBadge />}
                    </div>
                    {wholesalerItem.storeTagline && <p className="text-xs text-gray-500 truncate">{wholesalerItem.storeTagline}</p>}
                    {wholesalerItem.location && (
                      <p className="text-xs text-gray-400 flex items-center mt-0.5">
                        <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                        {wholesalerItem.location}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {wholesalerItem.canRequestAccess ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 px-3"
                          onClick={(e) => { e.stopPropagation(); handleRequestAccess({ id: wholesalerItem.id, businessName: wholesalerItem.businessName || '' }); }}
                        >
                          Request Access
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-8 px-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowWholesalerSearch(false);
                            setWholesalerSearchQuery("");
                            const guestFrom = hasCustomerSession && wholesalerId ? `store:${encodeURIComponent(wholesalerId)}` : "selection";
                            enterGuestMode();
                            setLocation(`/store/${wholesalerItem.id}?guest=true&guestFrom=${guestFrom}`);
                          }}
                        >
                          View as Guest
                        </Button>
                      </div>
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
                    {availableWholesalers.map((w) => <WholesalerCard key={w.id} wholesalerItem={w} />)}
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
                      accessibleSellers.map((w) => <WholesalerCard key={w.id} wholesalerItem={w} />)
                    ) : (
                      <p className="text-sm text-gray-400 px-3 py-4">You haven't been added to any stores yet.</p>
                    )}
                  </div>

                  {/* Discover New Sellers */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 px-3 mb-1">Discover New Sellers</h3>
                    {discoverSellers.length > 0 ? (
                      discoverSellers.map((w) => <WholesalerCard key={w.id} wholesalerItem={w} />)
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
      <StoreSwitcher
        showStoreSwitcher={showStoreSwitcher}
        setShowStoreSwitcher={setShowStoreSwitcher}
        authenticatedCustomer={authenticatedCustomer}
        switcherStores={switcherStores}
        switcherStoresLoading={switcherStoresLoading}
        wholesalerId={wholesalerId || ''}
        setIsSwitchingWholesaler={setIsSwitchingWholesaler}
        setLocation={setLocation}
      />

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
                  {wholesaler?.storeTagline && (
                    <p className="text-gray-500 mt-1 max-w-2xl">
                      {wholesaler.storeTagline}
                    </p>
                  )}
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
                    <CustomerProductCardSkeleton key={index} />
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
                              <PriceDisplay price={null} currency={wholesaler?.preferredCurrency || wholesaler?.defaultCurrency || 'GBP'} isGuestMode={true} size="medium" />
                              <Button
                                size="sm"
                                onClick={openCustomerSignIn}
                                className="rounded-full bg-green-600 hover:bg-green-700 text-white"
                              >
                                Sign in to view
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
              <SectionErrorBoundary sectionName="Home">
              <HomeTab
                setActiveTab={setActiveTab}
                cart={cart}
                setCart={setCart}
                setShowCheckout={setShowCheckout}
                isCreatingIntent={isCreatingIntent}
                handleLogout={handleLogout}
                isPreviewMode={isPreviewMode}
                isTrueGuestMode={isTrueGuestMode}
                cartStats={cartStats}
                wholesaler={wholesaler}
                wholesalerId={wholesalerId}
                customerOrderStats={customerOrderStats}
                authenticatedCustomer={authenticatedCustomer}
                productsLoading={productsLoading}
                products={products}
                calculatePromotionalPricing={calculatePromotionalPricing}
                addToCart={addToCart}
                quantityInputValues={quantityInputValues as Record<number, string>}
                setQuantityInputValues={setQuantityInputValues}
                showMOQWarnings={showMOQWarnings}
                setShowMOQWarnings={setShowMOQWarnings}
                showQuantityHints={showQuantityHints}
                setShowQuantityHints={setShowQuantityHints}
                activeQuantityInput={activeQuantityInput}
                setActiveQuantityInput={setActiveQuantityInput}
                setSelectedProductForModal={setSelectedProductForModal}
                setModalStep={setModalStep}
                setSelectedModalType={setSelectedModalType}
                setModalQuantity={setModalQuantity}
                setShowUnitSelectionModal={setShowUnitSelectionModal}
                setShowStoreSwitcher={setShowStoreSwitcher}
                priceDisplayMode={wholesaler?.priceDisplayMode || 'hidden'}
                onRequestQuote={() => setShowPortalQuoteModal(true)}
              />
              </SectionErrorBoundary>
            </TabsContent>
            <TabsContent value="products" className="space-y-6 mb-16 pb-6">
              <SectionErrorBoundary sectionName="Products">
              <ProductsTab
                setActiveTab={setActiveTab}
                cart={cart}
                setCart={setCart}
                setShowCheckout={setShowCheckout}
                isCreatingIntent={isCreatingIntent}
                handleLogout={handleLogout}
                isPreviewMode={isPreviewMode}
                isTrueGuestMode={isTrueGuestMode}
                cartStats={cartStats}
                wholesaler={wholesaler}
                customerOrderStats={customerOrderStats}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                categories={categories as string[]}
                viewMode={viewMode}
                setViewMode={setViewMode}
                productImageIndexes={productImageIndexes}
                setProductImageIndexes={setProductImageIndexes}
                carouselTouchStartX={carouselTouchStartX}
                productsLoading={productsLoading}
                productsError={productsError}
                refetchProducts={refetchProducts}
                filteredProducts={filteredProducts}
                quantityInputValues={quantityInputValues as Record<string, string>}
                setQuantityInputValues={setQuantityInputValues as React.Dispatch<React.SetStateAction<Record<string, string>>>}
                showMOQWarnings={showMOQWarnings}
                setShowMOQWarnings={setShowMOQWarnings}
                showQuantityHints={showQuantityHints}
                setShowQuantityHints={setShowQuantityHints}
                activeQuantityInput={activeQuantityInput}
                setActiveQuantityInput={setActiveQuantityInput}
                getQuantitySuggestions={getQuantitySuggestions}
                calculatePromotionalPricing={calculatePromotionalPricing}
                addToCart={addToCart}
                setSelectedProductForModal={setSelectedProductForModal}
                setModalStep={setModalStep}
                setSelectedModalType={setSelectedModalType}
                setModalQuantity={setModalQuantity}
                setShowUnitSelectionModal={setShowUnitSelectionModal}
                priceDisplayMode={wholesaler?.priceDisplayMode || 'hidden'}
                authenticatedCustomer={authenticatedCustomer}
                wholesalerId={wholesalerId}
                showQuoteModal={showPortalQuoteModal}
                setShowQuoteModal={setShowPortalQuoteModal}
              />
              </SectionErrorBoundary>
            </TabsContent>
            <TabsContent value="orders" className="space-y-6 pb-6">
              <SectionErrorBoundary sectionName="Order history">
              <OrdersTab
                setActiveTab={setActiveTab}
                cart={cart}
                setShowCheckout={setShowCheckout}
                isCreatingIntent={isCreatingIntent}
                handleLogout={handleLogout}
                isPreviewMode={isPreviewMode}
                cartStats={cartStats}
                wholesaler={wholesaler}
                customerOrderStats={customerOrderStats}
                authenticatedCustomer={authenticatedCustomer}
              />
              </SectionErrorBoundary>
            </TabsContent>
            <TabsContent value="account" className="space-y-6 pb-6">
              <SectionErrorBoundary sectionName="Account">
              <AccountTab
                setActiveTab={setActiveTab}
                cart={cart}
                setShowCheckout={setShowCheckout}
                isCreatingIntent={isCreatingIntent}
                handleLogout={handleLogout}
                isEnhancedPreviewMode={isEnhancedPreviewMode}
                isEditingProfile={isEditingProfile}
                editedProfile={editedProfile}
                setEditedProfile={setEditedProfile}
                initializeEditForm={initializeEditForm}
                setIsEditingProfile={setIsEditingProfile}
                handleSaveProfile={handleSaveProfile}
                updateProfileMutation={updateProfileMutation}
                customerData={customerData}
                wholesaler={wholesaler}
                customerOrderStats={customerOrderStats}
              />
              </SectionErrorBoundary>
            </TabsContent>
            <TabsContent value="help" className="pb-6">
              <SectionErrorBoundary sectionName="Help">
              <HelpTab
                wholesaler={wholesaler}
                setActiveTab={setActiveTab}
                cart={cart}
                setShowCheckout={setShowCheckout}
                isCreatingIntent={isCreatingIntent}
                handleLogout={handleLogout}
              />
              </SectionErrorBoundary>
            </TabsContent>
          </Tabs>
        )}

        {/* Checkout Modal Dialog */}
        <SectionErrorBoundary sectionName="Checkout">
        <CheckoutDialog
          showCheckout={showCheckout && (wholesaler?.priceDisplayMode || 'hidden') === 'shown'}
          setShowCheckout={setShowCheckout}
          payLaterMode={payLaterMode}
          setPayLaterMode={setPayLaterMode}
          cart={cart}
          setCart={setCart}
          cartStats={cartStats}
          editableQuantities={editableQuantities}
          setEditableQuantities={setEditableQuantities}
          calculatePromotionalPricing={calculatePromotionalPricing}
          customerData={customerData}
          setCustomerData={setCustomerData}
          wholesaler={wholesaler}
          wholesalerId={wholesalerId || ''}
          clientSecret={clientSecret}
          setClientSecret={setClientSecret}
          publishableKey={publishableKey}
          isCreatingIntent={isCreatingIntent}
          authenticatedCustomer={authenticatedCustomer}
          createPaymentIntentForCheckout={createPaymentIntentForCheckout}
          createPaymentIntentWithCustomData={createPaymentIntentWithCustomData}
          isPlacingPayLaterOrder={isPlacingPayLaterOrder}
          setIsPlacingPayLaterOrder={setIsPlacingPayLaterOrder}
          setCompletedOrder={setCompletedOrder}
          refetchProducts={refetchProducts}
          featuredProductId={featuredProductId}
          refetchFeaturedProduct={refetchFeaturedProduct}
          lastUsedShippingOption={lastUsedShippingOption}
          setLastUsedShippingOption={setLastUsedShippingOption}
          setShowThankYou={setShowThankYou}
        />
        </SectionErrorBoundary>


        {/* Enhanced Unit/Pallet Selection Modal with Quantity Adjustment */}
        <UnitSelectionModal
          showUnitSelectionModal={showUnitSelectionModal}
          setShowUnitSelectionModal={setShowUnitSelectionModal}
          selectedProductForModal={selectedProductForModal}
          setSelectedProductForModal={setSelectedProductForModal}
          modalStep={modalStep}
          setModalStep={setModalStep}
          selectedModalType={selectedModalType}
          setSelectedModalType={setSelectedModalType}
          modalQuantity={modalQuantity}
          setModalQuantity={setModalQuantity}
          calculatePromotionalPricing={calculatePromotionalPricing}
          addToCart={addToCart}
          setCart={setCart}
          cart={cart}
          priceDisplayMode={wholesaler?.priceDisplayMode || 'hidden'}
          currency={wholesaler?.preferredCurrency || wholesaler?.defaultCurrency || 'GBP'}
        />

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

        {/* Request Access Dialog — shared by Explore and guest-banner flows */}
        <Dialog
          open={showRequestAccessDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowRequestAccessDialog(false);
              setRequestAccessMessage("");
              setRequestAccessName("");
              setRequestAccessPhone("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Request Access</DialogTitle>
              <DialogDescription>
                Send a request to <strong>{requestAccessTarget?.businessName}</strong> to access their wholesale catalogue. They'll be notified and can approve or decline.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {isTrueGuestMode && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="req-name">Your name <span className="text-red-500">*</span></Label>
                    <Input
                      id="req-name"
                      placeholder="Full name or business name"
                      value={requestAccessName}
                      onChange={(e) => setRequestAccessName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="req-phone">Phone number <span className="text-red-500">*</span></Label>
                    <Input
                      id="req-phone"
                      type="tel"
                      placeholder="+44 7700 900000"
                      value={requestAccessPhone}
                      onChange={(e) => setRequestAccessPhone(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="req-message">
                  Message{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="req-message"
                  placeholder="Introduce yourself or let them know what you're looking for…"
                  value={requestAccessMessage}
                  onChange={(e) => setRequestAccessMessage(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                onClick={() => setShowRequestAccessDialog(false)}
                disabled={isSubmittingRequest}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitRequestAccess}
                disabled={
                  isSubmittingRequest ||
                  (isTrueGuestMode &&
                    (!requestAccessName.trim() || !requestAccessPhone.trim()))
                }
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isSubmittingRequest ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send Request"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Floating Cart Button - Only show when authenticated and cart has items */}
        {hasCustomerSession && !isTrueGuestMode && cart.length > 0 && (() => {
          const hasOutOfStockInCart = cart.some(item => {
            const fresh = (products as Product[]).find(p => p.id === item.product.id);
            if (!fresh) return false;
            return item.sellingType === 'pallets'
              ? (fresh.palletStock || 0) < item.quantity
              : (fresh.stock || 0) < item.quantity;
          });
          return (
            <div className="fixed bottom-20 right-4 z-50">
              <Button
                onClick={() => {
                  const pricesHidden = (wholesaler?.priceDisplayMode || 'hidden') !== 'shown';
                  if (pricesHidden) { setShowPortalQuoteModal(true); } else { setShowCheckout(true); }
                }}
                className="rounded-full shadow-lg h-14 w-14 p-0 relative quick-action-pulse bg-theme-primary text-white"
              >
                <ShoppingCart className="h-6 w-6" />
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold">
                  {cart.reduce((total, item) => total + item.quantity, 0)}
                </span>
                {hasOutOfStockInCart && (
                  <span className="absolute -top-2 -left-2 bg-amber-400 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold shadow">
                    !
                  </span>
                )}
              </Button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
