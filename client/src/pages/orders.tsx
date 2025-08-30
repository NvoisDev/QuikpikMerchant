import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { OrderCardSkeleton, TableRowSkeleton } from "@/components/ui/loading-skeletons";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/currencies";
import { 
  Package, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Truck,
  Hand,
  User,
  Phone,
  MapPin,
  Calendar,
  Eye,
  DollarSign,
  ShoppingCart,
  AlertCircle,
  Search,
  Filter,
  Download,
  Mail,
  TrendingUp,
  CreditCard,
  TrendingDown,
  MoreHorizontal,
  RefreshCw,
  Grid,
  List,
  ArrowUpDown,
  Home,
  Building
} from "lucide-react";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import ShippingIntegration from "@/components/shipping-integration";
import ShippingQuoteModal from "@/components/shipping-quote-modal";
import ShippingSettings from "@/pages/shipping-settings";
import ShippingTracking from "@/pages/shipping-tracking";

// Helper function to format address from JSON string or regular string
const formatAddress = (addressData?: string): string => {
  if (!addressData) return 'Address not provided';
  
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(addressData);
    if (typeof parsed === 'object' && parsed !== null) {
      // Handle comprehensive address object with multiple possible field names
      const addressParts = [
        parsed.street || parsed.property || parsed.address1 || parsed.address,
        parsed.address2,
        parsed.town || parsed.city,
        parsed.county || parsed.state,
        parsed.postcode || parsed.postalCode || parsed.zipCode || parsed.zip,
        parsed.country
      ].filter(part => part && part.trim() !== '');
      
      if (addressParts.length > 0) {
        return addressParts.join(', ');
      }
    }
    return addressData;
  } catch {
    // If parsing fails, return as regular string
    return addressData;
  }
};

// Helper function to format delivery address object
const formatDeliveryAddress = (address: any): string => {
  if (!address) return 'No delivery address';
  
  const parts = [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.state,
    address.postalCode,
    address.country
  ].filter(part => part && part.trim() !== '');
  
  return parts.join(', ');
};

// Helper function to parse delivery address JSON
const parseDeliveryAddress = (address: string | undefined): any => {
  if (!address) return null;
  try {
    const parsed = JSON.parse(address);
    return typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

// Helper function to get appropriate icon for address label
const getLabelIcon = (label?: string) => {
  switch (label?.toLowerCase()) {
    case 'home': return Home;
    case 'office': return Building;
    case 'warehouse': return Truck;
    default: return MapPin;
  }
};

interface Order {
  id: number;
  retailerId: string;
  wholesalerId: string;
  total: string;
  subtotal?: string; // Add subtotal field
  totalAmount?: string; // Keep for backward compatibility
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  deliveryAddress?: string;
  deliveryAddressId?: number;
  notes?: string;
  fulfillmentType?: string; // Add fulfillment type field
  orderNumber?: string; // Add order number field
  shippingOption?: string; // Add shipping option field
  shippingService?: string; // Add shipping service field
  shippingCost?: string; // Add shipping cost field
  // Shipping fields
  shippingOrderId?: string;
  shippingHash?: string;
  shippingTotal?: string;
  shippingStatus?: string;
  // Customer fields for order detail modal
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  // Platform fee fields
  platformFee?: string;
  customerTransactionFee?: string;
  retailer: {
    id: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    businessName?: string;
    email?: string;
  };
  wholesaler: {
    id: string;
    firstName: string;
    lastName: string;
    businessName?: string;
    preferredCurrency?: string;
  };
  items: Array<{
    id: number;
    productId: number;
    quantity: number;
    unitPrice: string;
    total: string;
    product: {
      id: number;
      name: string;
      imageUrl?: string;
      moq: number;
    };
  }>;
}

export default function Orders() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [customerDeliveryAddress, setCustomerDeliveryAddress] = useState<any>(null);
  const [shippingModalOrder, setShippingModalOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState("orders");
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [fulfillingOrders, setFulfillingOrders] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Function to handle order click and parse delivery address from saved order data
  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    
    // Parse delivery address from the order data (saved when order was created)
    if (order.deliveryAddress) {
      try {
        // If it's already a parsed object, use it directly
        if (typeof order.deliveryAddress === 'object') {
          setCustomerDeliveryAddress(order.deliveryAddress);
          return;
        }
        
        // If it's a JSON string, parse it
        const parsed = JSON.parse(order.deliveryAddress);
        console.log('📍 Parsed delivery address:', parsed);
        
        // Handle different possible address formats
        if (parsed.addressLine1 || parsed.street || parsed.line1) {
          // Standard format: { addressLine1, addressLine2, city, state, postalCode, country, label, instructions }
          setCustomerDeliveryAddress({
            addressLine1: parsed.addressLine1 || parsed.street || parsed.line1,
            addressLine2: parsed.addressLine2 || parsed.line2,
            city: parsed.city || parsed.town,
            state: parsed.state || parsed.county || parsed.region,
            postalCode: parsed.postalCode || parsed.postcode || parsed.zipCode || parsed.zip,
            country: parsed.country,
            label: parsed.label || parsed.name,
            instructions: parsed.instructions || parsed.notes
          });
        } else if (typeof parsed === 'string') {
          // If the parsed result is still a string
          setCustomerDeliveryAddress({ addressLine1: parsed });
        } else {
          // If it's an object but doesn't have expected fields, try to extract any useful info
          const addressText = parsed.address || parsed.fullAddress || Object.values(parsed).join(', ');
          setCustomerDeliveryAddress({ addressLine1: addressText });
        }
      } catch (error) {
        console.log('Could not parse delivery address JSON, treating as plain text:', order.deliveryAddress);
        // Fallback: treat as plain address string
        setCustomerDeliveryAddress({ addressLine1: order.deliveryAddress });
      }
    } else {
      setCustomerDeliveryAddress(null);
    }
  };

  // Update order status mutation
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      // Add order to fulfilling set
      setFulfillingOrders(prev => new Set(prev).add(orderId));
      
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update order" }));
        throw new Error(errorData.message || `Failed to update order: ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Remove order from fulfilling set
      setFulfillingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.orderId);
        return newSet;
      });
      
      toast({
        title: "Order Updated",
        description: `Order #${variables.orderId} has been marked as fulfilled successfully.`,
      });
      
      // Force immediate refresh of orders data
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.refetchQueries({ queryKey: ["/api/orders"] });
      
      setSelectedOrder(null); // Close the modal after successful update
    },
    onError: (error: Error, variables) => {
      // Remove order from fulfilling set on error
      setFulfillingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.orderId);
        return newSet;
      });
      
      toast({
        title: "Update Failed", 
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch overall order statistics separately to avoid pagination limits
  const { data: overallStats } = useQuery({
    queryKey: ["/api/orders/stats"],
    queryFn: async () => {
      const response = await fetch(`/api/orders/stats`);
      if (!response.ok) return null;
      return response.json();
    }
  });

  // Fetch orders without authentication (ecommerce-style)
  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["/api/orders", searchTerm],
    queryFn: async () => {
      try {
        console.log('🔍 Starting orders fetch request...');
        const searchParam = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
        const cacheBuster = `${searchParam ? '&' : '?'}t=${Date.now()}`;
        const url = `/api/orders${searchParam}${cacheBuster}`;
        console.log('🔍 Fetching from URL:', url);
        
        const response = await fetch(url, {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
        console.log('🔍 Response status:', response.status, response.statusText);
        console.log('🔍 Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Response not OK:', {
            status: response.status,
            statusText: response.statusText,
            errorText
          });
          throw new Error(`Failed to fetch orders (${response.status}): ${errorText}`);
        }
        
        const ordersData = await response.json();
        console.log('✅ Orders fetched successfully:', {
          count: ordersData.length,
          isArray: Array.isArray(ordersData),
          firstOrder: ordersData[0] ? { id: ordersData[0].id, orderNumber: ordersData[0].orderNumber } : 'No orders'
        });
        
        return ordersData;
      } catch (fetchError: any) {
        console.error('❌ Fetch error details:', {
          message: fetchError?.message || 'Unknown error',
          stack: fetchError?.stack || 'No stack trace',
          name: fetchError?.name || 'Unknown error type'
        });
        throw fetchError;
      }
    },
    staleTime: 0, 
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });

  // Default business address for Surulere Foods
  const businessAddress = {
    streetAddress: 'Surulere Foods Wholesale',
    city: 'London',
    postalCode: 'E1 6AN',
    country: 'United Kingdom'
  };

  // Use overall statistics from backend API instead of calculating from paginated data
  const orderStats = {
    total: overallStats?.ordersCount || 0,
    pending: overallStats?.pendingOrdersCount || 0, // Use overall pending count
    paid: overallStats?.paidOrdersCount || 0, // Use overall paid count
    fulfilled: orders.filter((o: any) => o.status === 'fulfilled').length, // Current page fulfilled count for visual reference
    totalRevenue: overallStats?.totalRevenue || 0, // Use overall net revenue from backend
    avgOrderValue: overallStats?.avgOrderValue || 0 // Use pre-calculated average from backend
  };
  
  console.log('📊 Order Statistics Using Overall Stats:', {
    overallStatsFromAPI: overallStats,
    calculatedStats: orderStats,
    currentPageOrdersLength: orders.length
  });

  // Enhanced filtering
  const filteredOrders = orders.filter((order: any) => {
    let matchesStatus = statusFilter === "all";
    
    if (statusFilter === "pending") {
      // Match both "pending" and "confirmed" orders for pending filter
      matchesStatus = order.status === "pending" || order.status === "confirmed";
    } else if (statusFilter !== "all") {
      matchesStatus = order.status === statusFilter;
    }
    
    const matchesSearch = searchTerm === "" || 
      order.id.toString().includes(searchTerm) ||
      (order.retailer?.firstName + " " + order.retailer?.lastName).toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.retailer?.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.retailer?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: "secondary" as const, icon: Clock, label: "Pending" },
      unfulfilled: { variant: "destructive" as const, icon: AlertCircle, label: "Unfulfilled" },
      confirmed: { variant: "default" as const, icon: CheckCircle, label: "Confirmed" },
      paid: { variant: "default" as const, icon: DollarSign, label: "Paid" },
      processing: { variant: "default" as const, icon: Package, label: "Processing" },
      shipped: { variant: "default" as const, icon: Truck, label: "Shipped" },
      delivered: { variant: "default" as const, icon: CheckCircle, label: "Delivered" },
      fulfilled: { variant: "default" as const, icon: CheckCircle, label: "Fulfilled" },
      archived: { variant: "secondary" as const, icon: Package, label: "Archived" },
      cancelled: { variant: "destructive" as const, icon: XCircle, label: "Cancelled" },
      refunded: { variant: "destructive" as const, icon: RefreshCw, label: "Refunded" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit px-2 py-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  // Add notification when new orders arrive or fulfillment status changes
  const previousOrderCount = useRef(orders.length);
  const previousFulfilledCount = useRef(orders.filter((o: any) => o.status === 'fulfilled').length);
  
  useEffect(() => {
    // Notify for new orders
    if (orders.length > previousOrderCount.current && previousOrderCount.current > 0) {
      toast({
        title: "New Order Received!",
        description: `You have ${orders.length - previousOrderCount.current} new order(s)`,
      });
    }
    
    // Notify for fulfilled orders
    const currentFulfilledCount = orders.filter((o: any) => o.status === 'fulfilled').length;
    if (currentFulfilledCount > previousFulfilledCount.current && previousFulfilledCount.current > 0) {
      toast({
        title: "Order Fulfilled",
        description: `${currentFulfilledCount - previousFulfilledCount.current} order(s) marked as fulfilled`,
      });
    }
    
    previousOrderCount.current = orders.length;
    previousFulfilledCount.current = currentFulfilledCount;
  }, [orders.length, orders, toast]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          {/* Enhanced Loading Animation */}
          <div className="flex space-x-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-8 bg-gradient-to-t from-green-400 to-emerald-600 rounded-full animate-pulse"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '1.2s'
                }}
              />
            ))}
          </div>
          <p className="text-sm font-medium text-gray-600 text-center">Loading your orders...</p>
        </div>
      </div>
    );
  }

  // Show error state if there's an error
  if (error) {
    console.error('❌ Orders Error Details:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: error.cause
    });
    
    // Check if it's an authentication error
    const isAuthError = error.message.includes('(401)') || error.message.includes('(400)') || 
                       error.message.includes('Authentication required') || 
                       error.message.includes('Invalid user context');
    
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          </div>
          
          {isAuthError ? (
            <>
              <p className="text-red-600 font-medium">Authentication Required</p>
              <p className="text-gray-500 text-sm mt-2">
                Please log in with Google OAuth to access your wholesale orders dashboard.
              </p>
              <div className="mt-4 space-y-2">
                <Button onClick={() => window.location.href = '/login'} className="mr-2">
                  Go to Login
                </Button>
                <Button 
                  variant="outline" 
                  onClick={async () => {
                    // Try authentication recovery first
                    try {
                      const response = await fetch('/api/auth/recover', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: 'mogunjemilua@gmail.com' })
                      });
                      if (response.ok) {
                        window.location.reload();
                      } else {
                        throw new Error('Recovery failed');
                      }
                    } catch (error) {
                      console.error('Auth recovery failed:', error);
                      window.location.reload();
                    }
                  }}
                >
                  Quick Auth Fix
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                If the issue persists, try logging out completely and signing in again with Google.
              </p>
            </>
          ) : (
            <>
              <p className="text-red-600 font-medium">Failed to load orders</p>
              <p className="text-gray-500 text-sm mt-2">{error.message}</p>
              <div className="mt-4 space-y-2">
                <Button onClick={() => window.location.reload()} className="mr-2">
                  Retry
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    // Force clear cache and retry
                    queryClient.removeQueries({ queryKey: ["/api/orders"] });
                    window.location.reload();
                  }}
                >
                  Clear Cache & Retry
                </Button>
              </div>
            </>
          )}
          
          <details className="mt-4 text-left">
            <summary className="text-xs text-gray-400 cursor-pointer">Debug Info</summary>
            <pre className="text-xs text-gray-400 mt-2 bg-gray-100 dark:bg-gray-800 p-2 rounded">
              {JSON.stringify({ 
                error: error.message, 
                name: error.name,
                isAuthError: isAuthError 
              }, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold">
              {user?.role === 'retailer' ? 'My Orders' : 'Order Management & Shipping'}
            </h1>
            <ContextualHelpBubble
              topic="order management"
              title="Managing Customer Orders"
              steps={helpContent.orders.steps}
              position="right"
            />
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">
            {user?.role === 'retailer' 
              ? 'Track your orders and delivery status'
              : 'Manage orders, shipping settings, and track deliveries'
            }
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">

          <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="flex-1 sm:flex-none">
            <RefreshCw className="h-4 w-4 mr-2" />
            <span className="hidden xs:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden xs:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Tabs for Orders, Shipping Settings, and Shipping Tracking */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="shipping-settings" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Shipping Settings
          </TabsTrigger>
          <TabsTrigger value="shipping-tracking" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Shipping Tracking
          </TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-6">
          {/* Order Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <ShoppingCart className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{orderStats.total || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Orders</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{orderStats.pending || 0}</p>
                    <p className="text-sm text-muted-foreground">Unfulfilled Orders</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(orderStats.totalRevenue || 0, 'GBP')}
                    </p>
                    <p className="text-sm text-muted-foreground">Net Revenue</p>
                    <p className="text-xs text-muted-foreground">After platform fees</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(orderStats.avgOrderValue || 0, 'GBP')}
                    </p>
                    <p className="text-sm text-muted-foreground">Avg Order Value</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Filters and Search */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search orders by ID, customer name, or business..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                {/* View Mode Toggle */}
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                  <Button
                    variant={viewMode === "cards" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("cards")}
                    className={`${viewMode === "cards" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"} flex items-center gap-2 min-w-[80px]`}
                  >
                    <Grid className="h-4 w-4" />
                    <span className="font-medium">Grid</span>
                  </Button>
                  <Button
                    variant={viewMode === "table" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("table")}
                    className={`${viewMode === "table" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"} flex items-center gap-2 min-w-[80px]`}
                  >
                    <List className="h-4 w-4" />
                    <span className="font-medium">List</span>
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[200px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Orders</SelectItem>
                      <SelectItem value="pending">Unfulfilled</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="fulfilled">Fulfilled</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Order List */}
          {filteredOrders.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No orders found</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? 'Try adjusting your search criteria' : 'Orders will appear here when customers place them'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Table View */}
              {viewMode === "table" ? (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left p-4 font-medium text-gray-900">
                              <div className="flex items-center gap-2">
                                Order
                                <ArrowUpDown className="h-4 w-4 text-gray-400" />
                              </div>
                            </th>
                            <th className="text-left p-4 font-medium text-gray-900">Customer</th>
                            <th className="text-left p-4 font-medium text-gray-900">Channel</th>
                            <th className="text-left p-4 font-medium text-gray-900">Total</th>
                            <th className="text-left p-4 font-medium text-gray-900">Payment Status</th>
                            <th className="text-left p-4 font-medium text-gray-900">Fulfillment Status</th>
                            <th className="text-left p-4 font-medium text-gray-900">Items</th>
                            <th className="text-left p-4 font-medium text-gray-900">Delivery Method</th>
                            <th className="text-left p-4 font-medium text-gray-900">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedOrders.map((order: any) => (
                            <tr 
                              key={order.id} 
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => handleOrderClick(order)}
                            >
                              <td className="p-4">
                                <div>
                                  <div className="font-semibold text-gray-900">{order.orderNumber || `#${order.id}`}</div>
                                  <div className="text-sm text-gray-500">
                                    {new Date(order.createdAt).toLocaleDateString('en-GB', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })} at {new Date(order.createdAt).toLocaleTimeString('en-GB', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <div>
                                  <div className="font-semibold text-gray-900">
                                    {order.retailer ? `${order.retailer.firstName} ${order.retailer.lastName}` : 'Unknown Customer'}
                                  </div>
                                  {order.retailer?.businessName && (
                                    <div className="text-sm text-gray-500">{order.retailer.businessName}</div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <span className="text-sm text-gray-600">Online Store</span>
                              </td>
                              <td className="p-4">
                                <div className="font-semibold text-gray-900">
                                  {formatCurrency(parseFloat(order.subtotal || order.total), order.wholesaler?.preferredCurrency || 'GBP')}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                  <span className="text-sm font-medium text-gray-700">Paid</span>
                                </div>
                              </td>
                              <td className="p-4">
                                {order.status === 'fulfilled' ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                    <span className="text-sm font-medium text-gray-700">Fulfilled</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                    <span className="text-sm font-medium text-gray-700">Unfulfilled</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-4">
                                <span className="text-sm font-medium text-gray-700">{order.items?.length || 1} item{(order.items?.length || 1) !== 1 ? 's' : ''}</span>
                              </td>
                              <td className="p-4">
                                <div className="text-sm">
                                  {order.fulfillmentType === 'delivery' ? (
                                    <div className="flex items-center gap-1">
                                      <Truck className="h-3 w-3 text-blue-600" />
                                      <span className="font-medium text-gray-700">Delivery</span>
                                    </div>
                                  ) : order.fulfillmentType === 'pickup' ? (
                                    <div className="flex items-center gap-1">
                                      <Hand className="h-3 w-3 text-green-600" />
                                      <span className="font-medium text-gray-700">Collection</span>
                                    </div>
                                  ) : (
                                    <span className="font-medium text-gray-500">Not specified</span>
                                  )}
                                  {order.shippingOrderId && (
                                    <div className="text-xs text-gray-500 mt-1">Tracking added</div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOrderClick(order);
                                    }}
                                    className="flex items-center gap-1"
                                  >
                                    <Eye className="h-4 w-4" />
                                    View
                                  </Button>
                                  {/* Quick fulfill button - only show for paid orders */}
                                  {(user?.role === 'wholesaler' || user?.role === 'team_member') && order.status === 'paid' && (
                                    <Button 
                                      variant="default" 
                                      size="sm" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateOrderStatusMutation.mutate({
                                          orderId: order.id,
                                          status: 'fulfilled'
                                        });
                                      }}
                                      disabled={fulfillingOrders.has(order.id)}
                                      className="bg-green-600 hover:bg-green-700 flex items-center gap-1"
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                      {fulfillingOrders.has(order.id) ? 'Processing...' : 'Fulfill'}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                /* Cards View */
                <div className="space-y-4">
                  {paginatedOrders.map((order: any) => (
                <Card key={order.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="font-semibold text-lg">{order.orderNumber || `Order #${order.id}`}</h3>
                          {getStatusBadge(order.status)}
                          
                          {/* Fulfillment Type Tags */}
                          {order.fulfillmentType === 'delivery' && (
                            <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
                              <Truck className="h-3 w-3" />
                              Delivery
                            </Badge>
                          )}
                          {order.fulfillmentType === 'pickup' && (
                            <Badge variant="secondary" className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
                              <Hand className="h-3 w-3" />
                              Collection
                            </Badge>
                          )}

                          
                          {/* Show shipping status */}
                          {(user?.role === 'wholesaler' || user?.role === 'team_member') && (
                            <>
                              {/* Customer selected delivery option */}
                              {order.shippingOption === 'delivery' && order.shippingService ? (
                                <Badge variant="default" className="ml-2">
                                  <Truck className="h-3 w-3 mr-1" />
                                  {order.shippingService} - £{order.shippingCost}
                                </Badge>
                              ) : order.shippingOption === 'pickup' ? (
                                <Badge variant="secondary" className="ml-2">
                                  <Package className="h-3 w-3 mr-1" />
                                  Pickup
                                </Badge>
                              ) : order.status === 'paid' && !order.shippingOrderId && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setShippingModalOrder(order)}
                                  className="ml-2"
                                >
                                  <Truck className="h-4 w-4 mr-1" />
                                  Add Shipping
                                </Button>
                              )}
                              
                              {/* Show tracking info if available */}
                              {order.shippingOrderId && (
                                <Badge variant="secondary" className="ml-2">
                                  <Truck className="h-3 w-3 mr-1" />
                                  Tracking Added
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Customer:</span>
                            <div className="font-medium">
                              {order.retailer ? `${order.retailer.firstName} ${order.retailer.lastName}` : 'Unknown Customer'}
                            </div>
                            {order.retailer?.businessName && (
                              <div className="text-xs text-muted-foreground">{order.retailer.businessName}</div>
                            )}
                          </div>
                          
                          <div>
                            <span className="text-muted-foreground">Total:</span>
                            <div className="font-medium text-lg">
                              {formatCurrency(parseFloat(order.subtotal || order.total), order.wholesaler?.preferredCurrency || 'GBP')}
                            </div>
                          </div>
                          
                          <div>
                            <span className="text-muted-foreground">Date:</span>
                            <div className="font-medium">
                              {new Date(order.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-3 border-t">
                          <div className="flex items-center gap-4">
                            <span className={order.status === 'pending' || order.status === 'confirmed' || order.status === 'paid' || order.status === 'fulfilled' ? 'text-green-600' : ''}>
                              ✓ Order Placed
                            </span>
                            <span className={order.status === 'confirmed' || order.status === 'paid' || order.status === 'fulfilled' ? 'text-green-600' : ''}>
                              ✓ Confirmed
                            </span>
                            <span className={order.status === 'paid' || order.status === 'fulfilled' ? 'text-green-600' : ''}>
                              ✓ Payment Received
                            </span>
                            <span className={order.status === 'fulfilled' ? 'text-green-600' : 'text-muted-foreground'}>
                              {order.status === 'fulfilled' ? '✓' : '○'} Fulfilled
                            </span>
                          </div>
                          
                          {order.deliveryAddress && (
                            <div className="flex items-center gap-1 max-w-xs mt-2">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate text-sm text-muted-foreground">{formatAddress(order.deliveryAddress)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="ml-4 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleOrderClick(order)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                        {/* Quick fulfill button - only show for paid orders */}
                        {(user?.role === 'wholesaler' || user?.role === 'team_member') && order.status === 'paid' && (
                          <Button 
                            variant="default" 
                            size="sm" 
                            onClick={(e) => {
                              e.stopPropagation();
                              updateOrderStatusMutation.mutate({
                                orderId: order.id,
                                status: 'fulfilled'
                              });
                            }}
                            disabled={fulfillingOrders.has(order.id)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {fulfillingOrders.has(order.id) ? 'Processing...' : 'Mark Fulfilled'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
                </div>
              )}
            </>
          )}

          {/* Pagination Controls */}
          {filteredOrders.length > 0 && totalPages > 1 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-600">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredOrders.length)} of {filteredOrders.length} orders
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    
                    {/* Page numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className="w-8 h-8 p-0 font-medium"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                      
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <>
                          <span className="text-sm font-medium text-gray-500">...</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            className="w-8 h-8 p-0 font-medium"
                          >
                            {totalPages}
                          </Button>
                        </>
                      )}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order Details Dialog */}
          {selectedOrder && (
            <Dialog open={!!selectedOrder} onOpenChange={(open) => {
              if (!open) {
                setSelectedOrder(null);
                setCustomerDeliveryAddress(null);
              }
            }}>
              <OrderDetailsModal order={selectedOrder} />
            </Dialog>
          )}
        </div>
      )}
    </div>
  );
}

// Separate OrderDetailsModal component
function OrderDetailsModal({ order }: { order: Order }) {
  const [customerDeliveryAddress, setCustomerDeliveryAddress] = useState<any>(null);

  // CRITICAL: Fetch EXACT delivery address used for this specific order
  useEffect(() => {
    const fetchDeliveryAddress = async () => {
      if (order && order.fulfillmentType === 'delivery') {
        try {
          // If order has a specific delivery address ID, fetch that exact address
          if (order.deliveryAddressId) {
            console.log(`🎯 Fetching exact delivery address for order ${order.id}: address ID ${order.deliveryAddressId}`);
            const response = await fetch(`/api/delivery-address/${order.deliveryAddressId}`, {
              credentials: 'include'
            });
            if (response.ok) {
              const exactAddress = await response.json();
              setCustomerDeliveryAddress(exactAddress);
              return;
            }
          }
          
          // Fallback to current method for older orders without delivery address IDs
          console.log(`📦 Fallback: Using current default address for order ${order.id} (no specific address ID stored)`);
          const customerId = order.retailerId || order.retailer?.id;
          if (customerId) {
            const response = await fetch(`/api/wholesaler/customer-delivery-addresses/${customerId}/${order.wholesalerId}`, {
              credentials: 'include'
            });
            if (response.ok) {
              const addresses = await response.json();
              // Get default address or first available address
              const defaultAddress = addresses.find((addr: any) => addr.isDefault) || addresses[0];
              setCustomerDeliveryAddress(defaultAddress || null);
            }
          }
        } catch (error) {
          console.error('Failed to fetch delivery address:', error);
          setCustomerDeliveryAddress(null);
        }
      }
    };
    fetchDeliveryAddress();
  }, [order]);

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order.orderNumber || `Order #${order.id}`} Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Enhanced Header Section */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Information */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h3 className="font-semibold mb-3 flex items-center text-gray-900">
                  <User className="h-4 w-4 mr-2 text-blue-600" />
                  Customer Information
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center">
                    <span className="text-gray-600 w-16">Email:</span>
                    <span className="font-medium text-gray-900">
                      {(order.customerEmail || order.retailer?.email) || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-600 w-16">Phone:</span>
                    <span className="font-medium text-gray-900">
                      {(order.customerPhone || order.retailer?.phoneNumber) || 'N/A'}
                    </span>
                  </div>
                  {/* Delivery Address Section - Using direct lookup */}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-start">
                      <MapPin className="h-4 w-4 mr-2 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 block mb-1">Delivery Address</span>
                        {customerDeliveryAddress ? (
                          <div className="space-y-1">
                            {(() => {
                              const Icon = getLabelIcon(customerDeliveryAddress.label);
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-green-600" />
                                    <div className="text-sm">
                                      <div className="font-medium">{customerDeliveryAddress.addressLine1}</div>
                                      {customerDeliveryAddress.addressLine2 && (
                                        <div>{customerDeliveryAddress.addressLine2}</div>
                                      )}
                                      <div>
                                        {customerDeliveryAddress.city}
                                        {customerDeliveryAddress.state && `, ${customerDeliveryAddress.state}`}
                                        {customerDeliveryAddress.postalCode && ` ${customerDeliveryAddress.postalCode}`}
                                      </div>
                                      {customerDeliveryAddress.country && (
                                        <div className="font-medium">{customerDeliveryAddress.country}</div>
                                      )}
                                    </div>
                                  </div>
                                  {customerDeliveryAddress.label && (
                                    <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
                                      {customerDeliveryAddress.label}
                                    </div>
                                  )}
                                  {customerDeliveryAddress.instructions && (
                                    <div className="text-xs text-gray-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                      <span className="font-medium">Instructions:</span> {customerDeliveryAddress.instructions}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : order.fulfillmentType === 'delivery' ? (
                          <div className="text-sm text-gray-500 italic">Loading delivery address...</div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">Collection order - no delivery address needed</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Information */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h3 className="font-semibold mb-3 flex items-center text-gray-900">
                  <Package className="h-4 w-4 mr-2 text-blue-600" />
                  Order Information
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Status:</span>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Date:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Items:</span>
                    <span className="font-medium text-gray-900">{order.items.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Fulfillment:</span>
                    <div className="flex items-center gap-1">
                      {order.fulfillmentType === 'pickup' ? (
                        <Hand className="h-3 w-3 text-blue-600" />
                      ) : (
                        <Truck className="h-3 w-3 text-green-600" />
                      )}
                      <span className="font-medium text-gray-900 capitalize">
                        {order.fulfillmentType || 'Pickup'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />
          
          {/* Enhanced Order Items Section */}
          <div>
            <h3 className="font-medium mb-3 text-base">Items ({order.items.length})</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              {order.items.map((item: any, index: number) => (
                <div key={item.id || index} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 text-sm mb-1">{item.product?.name || 'Unknown Product'}</h4>
                      <div className="flex items-center gap-4 text-xs text-gray-600">
                        <span>Quantity: <strong>{item.quantity}</strong> × {formatCurrency(parseFloat(item.unitPrice), order.wholesaler?.preferredCurrency || 'GBP')}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm text-gray-900">
                        {formatCurrency(parseFloat(item.total), order.wholesaler?.preferredCurrency || 'GBP')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Order Summary */}
              <div className="border-t border-gray-200 pt-3 mt-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(parseFloat(order.subtotal || order.total), order.wholesaler?.preferredCurrency || 'GBP')}
                    </span>
                  </div>
                  
                  {/* Platform Fee */}
                  {order.platformFee && parseFloat(order.platformFee) > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Platform Fee:</span>
                      <span className="text-gray-900">
                        -{formatCurrency(parseFloat(order.platformFee), order.wholesaler?.preferredCurrency || 'GBP')}
                      </span>
                    </div>
                  )}

                  {/* Customer Transaction Fee (if applicable) */}
                  {order.customerTransactionFee && parseFloat(order.customerTransactionFee) > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Transaction Fee:</span>
                      <span className="text-gray-900">
                        {formatCurrency(parseFloat(order.customerTransactionFee), order.wholesaler?.preferredCurrency || 'GBP')}
                      </span>
                    </div>
                  )}

                  {/* Your Net Amount (What wholesaler receives after platform fee) */}
                  {order.platformFee && parseFloat(order.platformFee) > 0 && (
                    <div className="border-t border-gray-300 pt-2 flex justify-between items-center text-sm">
                      <span className="text-green-600 font-medium">Your Net Amount:</span>
                      <span className="font-bold text-green-600">
                        {formatCurrency(
                          parseFloat(order.subtotal || order.total) - parseFloat(order.platformFee), 
                          order.wholesaler?.preferredCurrency || 'GBP'
                        )}
                      </span>
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-1">Amount you receive after platform fee deduction</p>
                </div>
              </div>
            </div>
          </div>

          {/* Order Timeline */}
          <div>
            <h3 className="font-medium mb-3 text-base">Order Timeline</h3>
            <div className="space-y-3">
              <TimelineItem
                icon={CreditCard}
                title="Customer payment received"
                time={new Date(order.createdAt).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                completed={true}
              />
              <TimelineItem
                icon={Mail}
                title="Order notification received"
                time={new Date(order.createdAt).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                completed={true}
              />
              <TimelineItem
                icon={CheckCircle}
                title="Customer confirmation sent"
                time={new Date(order.createdAt).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                completed={true}
              />
              <TimelineItem
                icon={Package}
                title="Prepare order items"
                completed={false}
                current={order.status === 'confirmed' || order.status === 'pending'}
              />
              <TimelineItem
                icon={order.fulfillmentType === 'pickup' ? Hand : Truck}
                title={order.fulfillmentType === 'pickup' ? 'Package for collection' : 'Package for delivery'}
                completed={false}
              />
              <TimelineItem
                icon={CheckCircle}
                title="Mark as fulfilled when ready"
                completed={order.status === 'fulfilled'}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center mt-6">
          <Button
            onClick={() => {
              // Implementation for marking order as fulfilled
            }}
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={order.status === 'fulfilled'}
          >
            {order.status === 'fulfilled' ? 'Order Fulfilled' : 'Mark as Fulfilled'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{selectedOrder.orderNumber || `Order #${selectedOrder.id}`} Details</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Enhanced Header Section */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Customer Information */}
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <h3 className="font-semibold mb-3 flex items-center text-gray-900">
                          <User className="h-4 w-4 mr-2 text-blue-600" />
                          Customer Information
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center">
                            <span className="text-gray-600 w-16">Email:</span>
                            <span className="font-medium text-gray-900">
                              {(selectedOrder.customerEmail || selectedOrder.retailer?.email) || 'N/A'}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-gray-600 w-16">Phone:</span>
                            <span className="font-medium text-gray-900">
                              {(selectedOrder.customerPhone || selectedOrder.retailer?.phoneNumber) || 'N/A'}
                            </span>
                          </div>
                          {/* Delivery Address Section */}
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-start">
                              <MapPin className="h-4 w-4 mr-2 text-green-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-900 block mb-1">Delivery Address</span>
                                {customerDeliveryAddress ? (
                                  <div className="space-y-1">
                                    <div className="text-sm text-gray-700">
                                      <div className="font-medium">{customerDeliveryAddress.addressLine1}</div>
                                      {customerDeliveryAddress.addressLine2 && (
                                        <div>{customerDeliveryAddress.addressLine2}</div>
                                      )}
                                      <div>
                                        {customerDeliveryAddress.city}
                                        {customerDeliveryAddress.state && `, ${customerDeliveryAddress.state}`}
                                        {customerDeliveryAddress.postalCode && ` ${customerDeliveryAddress.postalCode}`}
                                      </div>
                                      {customerDeliveryAddress.country && (
                                        <div className="font-medium">{customerDeliveryAddress.country}</div>
                                      )}
                                    </div>
                                    {customerDeliveryAddress.label && (
                                      <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
                                        {customerDeliveryAddress.label}
                                      </div>
                                    )}
                                    {customerDeliveryAddress.instructions && (
                                      <div className="text-xs text-gray-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                        <span className="font-medium">Instructions:</span> {customerDeliveryAddress.instructions}
                                      </div>
                                    )}
                                  </div>
                                ) : (() => {
                                  const deliveryAddr = parseDeliveryAddress(selectedOrder.deliveryAddress);
                                  if (deliveryAddr) {
                                    const Icon = getLabelIcon(deliveryAddr.label);
                                    return (
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <Icon className="h-4 w-4 text-green-600" />
                                          <div className="text-sm">
                                            <div className="font-medium">{deliveryAddr.addressLine1}</div>
                                            {deliveryAddr.addressLine2 && (
                                              <div>{deliveryAddr.addressLine2}</div>
                                            )}
                                            <div>
                                              {deliveryAddr.city}
                                              {deliveryAddr.state && `, ${deliveryAddr.state}`}
                                              {deliveryAddr.postalCode && ` ${deliveryAddr.postalCode}`}
                                            </div>
                                            {deliveryAddr.country && (
                                              <div className="font-medium">{deliveryAddr.country}</div>
                                            )}
                                          </div>
                                        </div>
                                        {deliveryAddr.label && (
                                          <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
                                            {deliveryAddr.label}
                                          </div>
                                        )}
                                        {deliveryAddr.instructions && (
                                          <div className="text-xs text-gray-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                            <span className="font-medium">Instructions:</span> {deliveryAddr.instructions}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  } else {
                                    // FALLBACK: For orders without specific delivery address ID, show default customer address
                                    return (
                                      <div className="text-sm text-gray-500 italic">
                                        Address not tracked for this order. 
                                        <br />
                                        <span className="text-xs">Contact customer for delivery details.</span>
                                      </div>
                                    );
                                  }
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Order Information */}
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <h3 className="font-semibold mb-3 flex items-center text-gray-900">
                          <Package className="h-4 w-4 mr-2 text-blue-600" />
                          Order Information
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Status:</span>
                            {getStatusBadge(selectedOrder.status)}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Date:</span>
                            <span className="font-medium text-gray-900">
                              {new Date(selectedOrder.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Items:</span>
                            <span className="font-medium text-gray-900">{selectedOrder.items.length}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Fulfillment:</span>
                            <div className="flex items-center gap-1">
                              {selectedOrder.fulfillmentType === 'pickup' ? (
                                <Hand className="h-3 w-3 text-blue-600" />
                              ) : (
                                <Truck className="h-3 w-3 text-green-600" />
                              )}
                              <span className="font-medium text-gray-900">
                                {selectedOrder.fulfillmentType === 'pickup' ? 'Collection' : 'Delivery'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />
                  
                  {/* Enhanced Order Items Section */}
                  <div>
                    <h3 className="font-medium mb-3 text-base">Items ({selectedOrder.items.length})</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      {selectedOrder.items.map((item: any, index: number) => (
                        <div key={item.id || index} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 text-sm mb-1">{item.product?.name || 'Unknown Product'}</h4>
                              <div className="flex items-center gap-4 text-xs text-gray-600">
                                <span>Quantity: <strong>{item.quantity}</strong> × {formatCurrency(parseFloat(item.unitPrice), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-sm text-gray-900">
                                {formatCurrency(parseFloat(item.total), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Order Summary */}
                      <div className="border-t border-gray-200 pt-3 mt-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Subtotal:</span>
                            <span className="font-medium text-gray-900">
                              {formatCurrency(parseFloat(selectedOrder.subtotal || selectedOrder.total), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}
                            </span>
                          </div>
                          
                          {/* Platform Fee */}
                          {selectedOrder.platformFee && parseFloat(selectedOrder.platformFee) > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Platform Fee:</span>
                              <span className="text-gray-900">
                                -{formatCurrency(parseFloat(selectedOrder.platformFee), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}
                              </span>
                            </div>
                          )}

                          {/* Customer Transaction Fee (if applicable) */}
                          {selectedOrder.customerTransactionFee && parseFloat(selectedOrder.customerTransactionFee) > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Transaction Fee:</span>
                              <span className="text-gray-900">
                                {formatCurrency(parseFloat(selectedOrder.customerTransactionFee), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}
                              </span>
                            </div>
                          )}

                          {/* Shipping/Delivery Cost */}
                          {selectedOrder.shippingTotal && parseFloat(selectedOrder.shippingTotal) > 0 && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">
                                {selectedOrder.fulfillmentType === 'delivery' ? 'Delivery:' : 'Shipping:'}
                              </span>
                              <span className="text-gray-900">
                                {formatCurrency(parseFloat(selectedOrder.shippingTotal), selectedOrder.wholesaler?.preferredCurrency || 'GBP')}
                              </span>
                            </div>
                          )}

                          <div className="border-t border-gray-200 pt-2">
                            <div className="flex justify-between items-center text-base font-semibold">
                              <span className="text-gray-900">Total:</span>
                              <span className="text-gray-900">
                                {formatCurrency(
                                  parseFloat(selectedOrder.total), 
                                  selectedOrder.wholesaler?.preferredCurrency || 'GBP'
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  <Separator />

                  {/* Order Timeline Section */}
                  <div>
                    <h3 className="font-medium mb-3 text-base">Order Timeline</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="space-y-3">
                        
                        {/* Order Placed */}
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900 text-sm">Order Placed</span>
                              <span className="text-xs text-gray-500">
                                {new Date(selectedOrder.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                              Customer placed order via the platform
                            </p>
                          </div>
                        </div>

                        {/* Email Confirmation */}
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900 text-sm">Email Confirmation Sent</span>
                              <span className="text-xs text-gray-500">
                                {new Date(selectedOrder.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                              Order confirmation sent to {(selectedOrder.customerEmail || selectedOrder.retailer?.email) || 'customer'}
                            </p>
                          </div>
                        </div>

                        {/* Payment Processing */}
                        {(selectedOrder.status === 'paid' || selectedOrder.status === 'fulfilled') && (
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900 text-sm">Payment Received</span>
                                <span className="text-xs text-gray-500">
                                  {new Date(selectedOrder.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mt-1">
                                Payment of {formatCurrency(parseFloat(selectedOrder.total), selectedOrder.wholesaler?.preferredCurrency || 'GBP')} processed via Stripe
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Order Fulfilled */}
                        {selectedOrder.status === 'fulfilled' ? (
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900 text-sm">Order Fulfilled</span>
                                <span className="text-xs text-gray-500">
                                  {new Date(selectedOrder.updatedAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mt-1">
                                Order completed and fulfilled by wholesaler
                              </p>
                            </div>
                          </div>
                        ) : selectedOrder.status === 'paid' && (
                          <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-orange-400 rounded-full mt-1.5 flex-shrink-0"></div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-medium text-gray-900 text-sm">Ready for Fulfillment</span>
                                  <p className="text-xs text-gray-600 mt-1">
                                    Order ready to be fulfilled by wholesaler
                                  </p>
                                </div>
                                {(user?.role === 'wholesaler' || user?.role === 'team_member') && (
                                  <Button
                                    onClick={() => {
                                      updateOrderStatusMutation.mutate({
                                        orderId: selectedOrder.id,
                                        status: 'fulfilled'
                                      });
                                    }}
                                    disabled={fulfillingOrders.has(selectedOrder.id)}
                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-xs"
                                  >
                                    {fulfillingOrders.has(selectedOrder.id) ? (
                                      <>
                                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                        Fulfilling...
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        Mark Fulfilled
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                    
                    {/* Fulfillment Information moved under Order Items */}
                    {selectedOrder.fulfillmentType === 'delivery' && selectedOrder.deliveryAddress && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Delivery Address
                        </h4>
                        <p className="text-sm text-blue-800">{formatAddress(selectedOrder.deliveryAddress)}</p>
                      </div>
                    )}
                    {(selectedOrder.fulfillmentType === 'collection' || selectedOrder.fulfillmentType === 'pickup') && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                          <Hand className="h-4 w-4" />
                          Collection Information
                        </h4>
                        <p className="text-sm text-green-800">This order is available for collection from your business location.</p>
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Shipping Quote Modal */}
          {shippingModalOrder && businessAddress && (
            <ShippingQuoteModal
              isOpen={!!shippingModalOrder}
              onClose={() => setShippingModalOrder(null)}
              order={{
                id: shippingModalOrder.id,
                customerName: [shippingModalOrder.retailer?.firstName, shippingModalOrder.retailer?.lastName].filter(Boolean).join(' ') || 'Unknown Customer',
                customerEmail: shippingModalOrder.retailer?.email || '',
                deliveryAddress: shippingModalOrder.deliveryAddress || '',
                total: parseFloat(shippingModalOrder.total)
              }}
              businessAddress={businessAddress}
            />
          )}
        </TabsContent>

        {/* Shipping Settings Tab */}
        <TabsContent value="shipping-settings">
          <ShippingSettings />
        </TabsContent>

        {/* Shipping Tracking Tab */}
        <TabsContent value="shipping-tracking">
          <ShippingTracking />
        </TabsContent>

      </Tabs>
    </div>
  );
}
