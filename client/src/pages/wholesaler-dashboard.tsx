import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { formatNumber } from "@/lib/utils";
import { formatCurrency } from "@/lib/currencies";
import OnboardingWelcome from "@/components/OnboardingWelcome";
import { WelcomeModal } from "@/components/WelcomeModal";
import { WhatsAppSetupAlert, WhatsAppStatusIndicator } from "@/components/WhatsAppSetupAlert";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import InteractiveActionCard from "@/components/interactive-action-card";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";
import { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { subDays, startOfToday, format, eachDayOfInterval, differenceInDays } from "date-fns";

import StatsCard from "@/components/stats-card";
import { AnalyticsCardSkeleton, OrderCardSkeleton, ProductCardSkeleton } from "@/components/ui/loading-skeletons";
import { 
  DollarSign, 
  ShoppingCart, 
  Package, 
  MessageSquare,
  Plus,
  Bell,
  TrendingUp,
  Users,
  Trophy,
  Share2,
  CreditCard
} from "lucide-react";
import { Link } from "wouter";

// Chart data is now fetched from real backend API instead of fake data generation

export default function WholesalerDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  // Early return if auth is still loading
  if (authLoading || !user) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <AnalyticsCardSkeleton />
          <AnalyticsCardSkeleton />
          <AnalyticsCardSkeleton />
          <AnalyticsCardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <OrderCardSkeleton />
          <ProductCardSkeleton />
        </div>
      </div>
    );
  }
  const { isActive } = useOnboarding();
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(startOfToday(), 29),
    to: startOfToday(),
    label: "Last 30 days"
  });

  // Check for welcome message on component mount
  useEffect(() => {
    const welcomeMessage = sessionStorage.getItem('welcomeMessage');
    if (welcomeMessage) {
      setShowWelcomeModal(true);
    }
  }, []);

  // Keyboard shortcuts functionality
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            window.location.href = '/products';
            break;
          case '2':
            e.preventDefault();
            window.location.href = '/campaigns';
            break;
          case '3':
            e.preventDefault();
            window.location.href = '/orders';
            break;
          case '4':
            e.preventDefault();
            window.location.href = '/customer-groups';
            break;
          case 'k':
            e.preventDefault();
            setShowFloatingMenu(!showFloatingMenu);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showFloatingMenu]);

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ["/api/analytics/stats"],
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
    enabled: !!user,
  });

  const { data: orders, isLoading: ordersLoading, error: ordersError } = useQuery({
    queryKey: ["/api/orders"],
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    enabled: !!user,
  });

  const { data: topProducts, isLoading: productsLoading, error: productsError } = useQuery({
    queryKey: ["/api/analytics/top-products"],
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: false,
    enabled: !!user,
  });

  const { data: broadcastStats, isLoading: broadcastStatsLoading, error: broadcastError } = useQuery({
    queryKey: ["/api/broadcasts/stats"],
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
    enabled: !!user,
  });

  const { data: alertsData, error: alertsError } = useQuery({
    queryKey: ["/api/stock-alerts/count"],
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    enabled: !!user,
  });

  // Stripe Connect status for payment setup notifications
  const { data: stripeStatus } = useQuery({
    queryKey: ["/api/stripe/connect-status"],
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: false,
    enabled: !!user && user.role === 'wholesaler',
  });

  // Chart data query with real data from backend
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["/api/analytics/chart-data", dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      try {
        if (!dateRange?.from || !dateRange?.to) {
          console.log('Missing date range:', { from: dateRange?.from, to: dateRange?.to });
          return [];
        }
        const params = new URLSearchParams({
          fromDate: dateRange.from.toISOString(),
          toDate: dateRange.to.toISOString()
        });
        console.log('Fetching chart data with params:', params.toString());
        const response = await fetch(`/api/analytics/chart-data?${params}`, {
          credentials: 'include'
        });
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Chart data fetch failed:', errorText);
          // Return empty array instead of throwing to prevent breaking the UI
          return [];
        }
        const data = await response.json();
        console.log('Chart data received:', data);
        return data || [];
      } catch (error) {
        console.error('Chart data query error:', error);
        // Return empty array instead of throwing to prevent breaking the UI
        return [];
      }
    },
    enabled: !!dateRange?.from && !!dateRange?.to && !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  // Show loading screen while user data is being fetched
  if (!user || statsLoading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <AnalyticsCardSkeleton />
          <AnalyticsCardSkeleton />
          <AnalyticsCardSkeleton />
          <AnalyticsCardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <OrderCardSkeleton />
          <ProductCardSkeleton />
        </div>
      </div>
    );
  }

  // If there are authentication errors, show a simplified dashboard
  if (statsError || ordersError || productsError) {
    console.warn('Dashboard API errors:', { statsError, ordersError, productsError });
  }

  // Share store functionality
  const handleShareStore = async () => {
    // Use team member's parent wholesaler ID if user is team member
    const effectiveUserId = user?.role === 'team_member' && user?.wholesalerId ? user.wholesalerId : user?.id;
    const customerPortalUrl = `https://quikpik.app/customer/${effectiveUserId}`;
    const businessName = user?.businessName || "My Store";
    
    const shareData = {
      title: `${businessName} - Wholesale Store`,
      text: `Check out ${businessName}! Browse our wholesale products and place orders directly.`,
      url: customerPortalUrl,
    };

    // Try native sharing first (works on mobile devices)
    if (navigator.share) {
      try {
        console.log("🔗 Attempting native share with data:", shareData);
        await navigator.share(shareData);
        toast({
          title: "Store Shared!",
          description: "Store link shared successfully!",
        });
        return;
      } catch (error) {
        // User cancelled sharing or sharing failed
        console.log("Native sharing cancelled or failed:", error);
        // Don't show error toast if user just cancelled
        if (error.name !== 'AbortError') {
          console.warn("Share API error:", error);
        }
      }
    } else {
      console.log("🔗 Native sharing not available, falling back to clipboard");
    }

    // Fallback to clipboard copying
    try {
      await navigator.clipboard.writeText(`${businessName}\n${customerPortalUrl}\n\nCheck out ${businessName} - browse our wholesale products and place orders directly!`);
      toast({
        title: "Store Link Copied!",
        description: "Store link copied to clipboard. Paste it anywhere to share!",
      });
    } catch (error) {
      toast({
        title: "Share Store",
        description: `Copy this link: ${customerPortalUrl}`,
        variant: "default",
        duration: 8000,
      });
    }
  };

  return (
    <div className="bg-white min-h-screen" data-onboarding="dashboard">
      <div className="flex-1">
        {/* Modern Header with Glass Effect */}
        <div className="backdrop-blur-sm bg-white/80 border-gray-200/50 border-b px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6">
              <div className="space-y-2" data-onboarding="dashboard-header">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">
                  Hello, {user?.firstName || user?.businessName?.split(' ')[0] || 'Wholesaler'} 👋
                </h1>
                <p className="text-base sm:text-lg text-gray-900 opacity-80">
                  Your business performance at a glance
                </p>
              </div>

              
              {/* Stock Alerts */}
              <div className="flex items-center gap-3">
                <Link href="/stock-alerts">
                  <Button variant="ghost" size="icon" className="relative hover:bg-gray-100">
                    <Bell className="h-5 w-5" />
                    {alertsData?.count > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {alertsData.count}
                      </span>
                    )}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Setup Priority Alert */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <WhatsAppSetupAlert />
        </div>

        {/* Quick Actions Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link href="/products">
              <Button size="sm" className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25 flex-1 sm:flex-none" data-onboarding="add-product-button">
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden xs:inline">Add Product</span>
                <span className="xs:hidden">Product</span>
              </Button>
            </Link>
            <Link href="/campaigns">
              <Button size="sm" variant="outline" className="border-2 border-blue-200 hover:bg-blue-50 hover:text-blue-800 text-blue-700 flex-1 sm:flex-none">
                <MessageSquare className="h-4 w-4 mr-2" />
                <span className="hidden xs:inline">Create Campaign</span>
                <span className="xs:hidden">Campaign</span>
              </Button>
            </Link>
            <Link href="/customer-groups">
              <Button size="sm" variant="outline" className="border-2 border-purple-200 hover:bg-purple-50 hover:text-purple-800 text-purple-700 flex-1 sm:flex-none">
                <Users className="h-4 w-4 mr-2" />
                <span className="hidden xs:inline">Add Customers</span>
                <span className="xs:hidden">Customers</span>
              </Button>
            </Link>
            <Link href="/preview-store">
              <Button 
                size="sm"
                variant="outline" 
                className="border-2 border-green-200 hover:bg-green-50 hover:text-green-800 text-green-700 flex-1 sm:flex-none"
                data-onboarding="preview-store"
              >
                <Package className="h-4 w-4 mr-2" />
                <span className="hidden xs:inline">Preview Store</span>
                <span className="xs:hidden">Preview</span>
              </Button>
            </Link>
            <Button 
              size="sm"
              variant="outline" 
              onClick={handleShareStore}
              className="border-2 border-green-200 hover:bg-green-50 hover:text-green-800 text-green-700 flex-1 sm:flex-none"
              title="Copy customer portal link to clipboard"
            >
              <Share2 className="h-4 w-4 mr-2" />
              <span className="hidden xs:inline">Share Store</span>
              <span className="xs:hidden">Share</span>
            </Button>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8">
          {/* Priority Stripe Setup Notification */}
          {user?.role === 'wholesaler' && stripeStatus && !stripeStatus.paymentsEnabled && (
            <div className="mb-6 sm:mb-8">
              <div className="bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-400 rounded-lg p-4 sm:p-6 shadow-lg">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-8 h-8 bg-red-500 rounded-full">
                      <CreditCard className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <div className="ml-4 flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-red-900">
                          🚨 Payment Setup Required - Priority Action
                        </h3>
                        <p className="mt-1 text-red-800">
                          Your customers cannot complete purchases until you set up payment processing. 
                          This is preventing order completion and lost sales.
                        </p>
                        <div className="mt-2 text-sm text-red-700">
                          <p>• Customer payments are currently failing</p>
                          <p>• All order attempts show "payment setup incomplete" error</p>
                          <p>• Takes only 2-3 minutes to complete setup</p>
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <Link href="/settings">
                          <Button className="bg-red-600 hover:bg-red-700 text-white shadow-lg">
                            <CreditCard className="h-4 w-4 mr-2" />
                            Complete Setup Now
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stats Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <Card className="text-white border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-sm font-medium">Total Revenue</p>
                    <p className="text-3xl font-bold">{statsLoading ? '...' : formatCurrency(stats?.totalRevenue || 0)}</p>
                    <p className="text-white/80 text-xs mt-1">
                      {stats?.revenueChange !== undefined 
                        ? `${stats.revenueChange >= 0 ? '+' : ''}${stats.revenueChange.toFixed(1)}% from last month`
                        : 'No change data'}
                    </p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full">
                    <DollarSign className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="text-white border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-sm font-medium">Total Orders</p>
                    <p className="text-3xl font-bold">{statsLoading ? '...' : formatNumber(stats?.ordersCount || 0)}</p>
                    <p className="text-white/80 text-xs mt-1">
                      {stats?.ordersChange !== undefined 
                        ? `${stats.ordersChange >= 0 ? '+' : ''}${stats.ordersChange.toFixed(1)}% from last month`
                        : 'No change data'}
                    </p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="text-white border-0 shadow-lg bg-gradient-to-br from-purple-500 to-purple-600">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-sm font-medium">Active Products</p>
                    <p className="text-3xl font-bold">{statsLoading ? '...' : formatNumber(stats?.activeProducts || 0)}</p>
                    <p className="text-white/80 text-xs mt-1">
                      {alertsData?.count > 0 ? `${alertsData.count} low stock alerts` : 'Stock levels healthy'}
                    </p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full">
                    <Package className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="text-white border-0 shadow-lg" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-sm font-medium">WhatsApp Reach</p>
                    <p className="text-3xl font-bold">{broadcastStatsLoading ? '...' : formatNumber(broadcastStats?.recipientsReached || 0)}</p>
                    <p className="text-white/80 text-xs mt-1">Customers reached</p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-full">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Interactive Quick Actions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <InteractiveActionCard
              href="/products"
              icon={Package}
              title="Manage Products"
              description="Add, edit and organize your inventory"
              metric={`${formatNumber(stats?.activeProducts || 0)} Active`}
              colorClass="from-blue-500 to-blue-600"
              gradientFrom="from-blue-50"
              gradientTo="to-blue-100"
            />
            
            <InteractiveActionCard
              href="/campaigns"
              icon={MessageSquare}
              title="Send Campaigns"
              description="Broadcast to your customers"
              metric={`${formatNumber(broadcastStats?.recipientsReached || 0)} Reached`}
              colorClass="from-emerald-500 to-emerald-600"
              gradientFrom="from-emerald-50"
              gradientTo="to-emerald-100"
            />
            
            <InteractiveActionCard
              href="/orders"
              icon={ShoppingCart}
              title="View Orders"
              description="Track customer purchases"
              metric={`${formatNumber(stats?.ordersCount || 0)} Orders`}
              colorClass="from-purple-500 to-purple-600"
              gradientFrom="from-purple-50"
              gradientTo="to-purple-100"
            />
            
            <InteractiveActionCard
              href="/customer-groups"
              icon={Users}
              title="Customer Groups"
              description="Organize your customers"
              metric="Manage Groups"
              colorClass="from-orange-500 to-orange-600"
              gradientFrom="from-orange-50"
              gradientTo="to-orange-100"
            />
          </div>

          {/* Top Selling Product Section */}
          <div className="mb-8">
            <Card className="bg-white border-gray-200 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-gray-900 flex items-center">
                  <Trophy className="w-6 h-6 text-yellow-500 mr-2" />
                  Top Selling Product
                </CardTitle>
                <p className="text-sm text-gray-600">Your best performing product this period</p>
              </CardHeader>
              <CardContent>
                {productsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : topProducts && topProducts.length > 0 ? (
                  <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
                    {/* Product Image */}
                    <div className="flex-shrink-0">
                      <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200">
                        {topProducts[0].images && topProducts[0].images.length > 0 ? (
                          <img 
                            src={topProducts[0].images[0]} 
                            alt={topProducts[0].name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                            <Package className="w-8 h-8 text-gray-400" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Product Details */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{topProducts[0].name}</h3>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{topProducts[0].description}</p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-green-50 p-3 rounded-lg">
                          <p className="text-xs text-green-600 font-medium">Total Sales</p>
                          <p className="text-lg font-bold text-green-700">
                            £{topProducts[0].revenue?.toLocaleString() || '0'}
                          </p>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <p className="text-xs text-blue-600 font-medium">Units Sold</p>
                          <p className="text-lg font-bold text-blue-700">
                            {topProducts[0].totalQuantitySold?.toLocaleString() || '0'}
                          </p>
                        </div>
                        <div className="bg-purple-50 p-3 rounded-lg">
                          <p className="text-xs text-purple-600 font-medium">Orders</p>
                          <p className="text-lg font-bold text-purple-700">
                            {topProducts[0].orderCount?.toLocaleString() || '0'}
                          </p>
                        </div>
                        <div className="bg-orange-50 p-3 rounded-lg">
                          <p className="text-xs text-orange-600 font-medium">Current Price</p>
                          <p className="text-lg font-bold text-orange-700">
                            £{topProducts[0].price ? parseFloat(topProducts[0].price.toString()).toFixed(2) : '0.00'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p>No sales data available yet</p>
                    <p className="text-sm mt-1">Start selling to see your top performing products</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Sales Performance Chart */}
            <Card className="bg-white border-gray-200 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900">Sales Performance</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Revenue trends over time</p>
                </div>
                <DateRangePicker 
                  value={dateRange} 
                  onChange={setDateRange}
                  className="min-w-48"
                />
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {chartLoading || statsLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData || []}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                          tickFormatter={(value) => `${formatCurrency(value)}`}
                        />
                        <Tooltip 
                          formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                          labelStyle={{ color: '#374151' }}
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#10b981" 
                          strokeWidth={3}
                          dot={{ fill: "#10b981", strokeWidth: 2, r: 5 }}
                          activeDot={{ r: 7, stroke: "#10b981", strokeWidth: 2, fill: '#ffffff' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Orders Chart */}
            <Card className="bg-white border-gray-200 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900">Order Volume</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Orders processed over time</p>
                </div>
                <DateRangePicker 
                  value={dateRange} 
                  onChange={setDateRange}
                  className="min-w-48"
                />
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {chartLoading || statsLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData || []}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#6b7280' }}
                          axisLine={false}
                        />
                        <Tooltip 
                          formatter={(value: any) => [value, 'Orders']}
                          labelStyle={{ color: '#374151' }}
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                        <Bar 
                          dataKey="orders" 
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders & Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Orders */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-gray-900">Recent Orders</CardTitle>
                <p className="text-sm text-gray-600">Latest customer orders</p>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gray-300 rounded-lg"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                        </div>
                        <div className="w-16 h-4 bg-gray-300 rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(orders || []).slice(0, 5).map((order: any) => (
                      <Link key={order.id} href={`/orders?id=${order.id}`}>
                        <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                          <div>
                            <p className="font-medium text-gray-900">Order #{order.id}</p>
                            <p className="text-sm text-gray-600">{order.customerName}</p>
                          </div>
                          <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                            {order.status}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                    {(orders || []).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No orders yet</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Products */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-gray-900">Top Selling Products</CardTitle>
                <p className="text-sm text-gray-600">Best performing items</p>
              </CardHeader>
              <CardContent>
                {productsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gray-300 rounded-lg"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                        </div>
                        <div className="w-16 h-4 bg-gray-300 rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(topProducts || []).length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No sales data yet</p>
                        <p className="text-sm">Add products and start selling to see your top performers here</p>
                      </div>
                    ) : (
                      (topProducts || []).slice(0, 5).map((product: any) => (
                        <div key={product.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                              <Package className="h-5 w-5 text-gray-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{product.name}</p>
                              <p className="text-sm text-gray-600">Stock: {formatNumber(product.stock || 0)} units</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{formatCurrency(product.price)}</p>
                            <p className="text-sm text-emerald-600 font-medium">{formatNumber(product.totalQuantitySold || 0)} sold</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Floating Quick Action Menu */}
        {showFloatingMenu && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
               onClick={() => setShowFloatingMenu(false)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 transform animate-in zoom-in-50 duration-300"
                 onClick={(e) => e.stopPropagation()}>
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Quick Actions</h3>
                <p className="text-sm text-gray-600">Use keyboard shortcuts for faster navigation</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Link href="/products" onClick={() => setShowFloatingMenu(false)}>
                  <div className="flex items-center p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all duration-200 group hover:scale-105">
                    <Package className="h-5 w-5 text-blue-600 mr-3 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Products</p>
                      <p className="text-xs text-gray-500">Ctrl+1</p>
                    </div>
                  </div>
                </Link>
                
                <Link href="/campaigns" onClick={() => setShowFloatingMenu(false)}>
                  <div className="flex items-center p-3 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-all duration-200 group hover:scale-105">
                    <MessageSquare className="h-5 w-5 text-emerald-600 mr-3 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Campaigns</p>
                      <p className="text-xs text-gray-500">Ctrl+2</p>
                    </div>
                  </div>
                </Link>
                
                <Link href="/orders" onClick={() => setShowFloatingMenu(false)}>
                  <div className="flex items-center p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-all duration-200 group hover:scale-105">
                    <ShoppingCart className="h-5 w-5 text-purple-600 mr-3 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Orders</p>
                      <p className="text-xs text-gray-500">Ctrl+3</p>
                    </div>
                  </div>
                </Link>
                
                <Link href="/customer-groups" onClick={() => setShowFloatingMenu(false)}>
                  <div className="flex items-center p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-all duration-200 group hover:scale-105">
                    <Users className="h-5 w-5 text-orange-600 mr-3 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Customers</p>
                      <p className="text-xs text-gray-500">Ctrl+4</p>
                    </div>
                  </div>
                </Link>
              </div>
              
              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  Press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+K</kbd> to toggle this menu
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Floating Action Button */}
        <div className="fixed bottom-6 right-6 z-40">
          <Button 
            onClick={() => setShowFloatingMenu(!showFloatingMenu)}
            className="rounded-full w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 active:scale-95"
          >
            <Plus className={`h-6 w-6 text-white transition-transform duration-300 ${showFloatingMenu ? 'rotate-45' : ''}`} />
          </Button>
        </div>
      </div>
      {isActive && <OnboardingWelcome />}
      <WelcomeModal 
        open={showWelcomeModal} 
        onClose={() => setShowWelcomeModal(false)} 
      />
    </div>
  );
}