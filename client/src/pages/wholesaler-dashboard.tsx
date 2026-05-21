import { useQuery } from "@tanstack/react-query";
import ElephantLoader from "@/components/ui/elephant-loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedCard, AnimatedCardContent, AnimatedCardHeader, AnimatedCardTitle } from "@/components/ui/animated-card";
import { Button } from "@/components/ui/button";
import { AnimatedButton } from "@/components/ui/animated-button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { formatNumber } from "@/lib/utils";
import { formatCurrency } from "@/lib/currencies";
import OnboardingWelcome from "@/components/OnboardingWelcome";
import { WelcomeModal } from "@/components/WelcomeModal";
import { StripeSetupAlert, StripeStatusIndicator } from "@/components/StripeSetupAlert";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import InteractiveActionCard from "@/components/interactive-action-card";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";
import { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";
import { subDays, startOfToday, endOfDay, format, eachDayOfInterval, differenceInDays } from "date-fns";

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
  TrendingDown,
  Users,
  Trophy,
  Share2,
  CreditCard,
  Eye,
  Tag,
  CheckCircle,
  Info,
  Percent
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { DynamicTooltip, HelpTooltip, InfoTooltip } from "@/components/ui/dynamic-tooltip";

// Chart data is now fetched from real backend API instead of fake data generation

interface DashboardStats { totalRevenue?: number; revenueChange?: number; ordersCount?: number; ordersChange?: number; activeProducts?: number; lowStockCount?: number; unpaidAmount?: number; unpaidCount?: number; }
interface BroadcastStats { recipientsReached?: number; }
interface TopProduct { id: number; name: string; description?: string; images?: string[]; totalRevenue?: number; unitsOrdered?: number; revenue?: number; totalQuantitySold?: number; orderCount?: number; price?: number; }
interface StripeConnectStatus { paymentsEnabled?: boolean; accountStatus?: string; }
interface ChartDataPoint { revenue?: number; orders?: number; date?: string; }
interface CustomerInsights { topCustomers?: { id: string; name?: string; businessName?: string; totalSpend?: number; orderCount?: number }[] }

interface MarginSegment {
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
  hasMissingCost: boolean;
}
interface MarginSummary {
  quotes: MarginSegment;
  online: MarginSegment;
  total: MarginSegment;
}

function MarginOverview() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(startOfToday(), 29),
    to: endOfDay(startOfToday()),
    label: "Last 30 days",
  });

  const { data: marginData, isLoading } = useQuery<MarginSummary>({
    queryKey: ["/api/analytics/margin-summary", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        fromDate: dateRange.from.toISOString(),
        toDate: dateRange.to.toISOString(),
      });
      const res = await fetch(`/api/analytics/margin-summary?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch margin summary");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });

  const fmt = (v: number) => formatCurrency(v);
  const pct = (v: number) => `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(1)}%`;
  const hasMissingCost = marginData?.total?.hasMissingCost || marginData?.quotes?.hasMissingCost || marginData?.online?.hasMissingCost;

  const StatTile = ({ label, value, positive }: { label: string; value: string; positive?: boolean }) => (
    <div className="bg-slate-50 rounded-xl p-3 sm:p-4 flex flex-col gap-1">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold ${positive === undefined ? "text-slate-900" : positive ? "text-emerald-600" : "text-red-500"}`}>{value}</p>
    </div>
  );

  const SegmentCard = ({ label, seg, icon }: { label: string; seg: MarginSegment; icon: JSX.Element }) => (
    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-slate-800">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Revenue (excl. fees)</p>
          <p className="text-sm font-medium text-slate-700">{fmt(seg.revenue)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Est. Cost</p>
          <p className="text-sm font-medium text-slate-700">{fmt(seg.cost)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Margin £</p>
          <p className={`text-sm font-semibold ${seg.margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(seg.margin)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Margin %</p>
          <p className={`text-sm font-semibold ${seg.marginPercent >= 0 ? "text-emerald-600" : "text-red-500"}`}>{pct(seg.marginPercent)}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mb-8">
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Percent className="w-5 h-5 text-emerald-500" />
                Margin Overview
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">Estimated gross margin based on batch cost prices</p>
            </div>
            <div className="flex-shrink-0">
              <DateRangePicker value={dateRange} onChange={setDateRange} className="w-full sm:w-auto text-sm" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-slate-50 rounded-xl p-4 animate-pulse">
                    <div className="h-3 bg-slate-200 rounded w-2/3 mb-3" />
                    <div className="h-7 bg-slate-200 rounded w-full" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="h-28 bg-slate-50 rounded-xl animate-pulse" />
                <div className="h-28 bg-slate-50 rounded-xl animate-pulse" />
              </div>
            </div>
          ) : marginData ? (
            <div className="space-y-4">
              {hasMissingCost && (
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Some products have no cost data — those items are excluded from margin totals.</span>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile label="Total Revenue (excl. fees)" value={fmt(marginData.total.revenue)} />
                <StatTile label="Est. Cost" value={fmt(marginData.total.cost)} />
                <StatTile label="Margin (£)" value={fmt(marginData.total.margin)} positive={marginData.total.margin >= 0} />
                <StatTile label="Margin %" value={pct(marginData.total.marginPercent)} positive={marginData.total.marginPercent >= 0} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SegmentCard
                  label="Invoices"
                  seg={marginData.quotes}
                  icon={<TrendingUp className="w-4 h-4 text-purple-500 flex-shrink-0" />}
                />
                <SegmentCard
                  label="Online Orders"
                  seg={marginData.online}
                  icon={<ShoppingCart className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Percent className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>No margin data available for this period</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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
    to: endOfDay(startOfToday()),
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

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<DashboardStats>({
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

  const { data: topProducts, isLoading: productsLoading, error: productsError } = useQuery<TopProduct[]>({
    queryKey: ["/api/analytics/top-products"],
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: false,
    enabled: !!user,
  });

  const { data: broadcastStats, isLoading: broadcastStatsLoading, error: broadcastError } = useQuery<BroadcastStats>({
    queryKey: ["/api/broadcasts/stats"],
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
    enabled: !!user,
  });

  const [notifOpen, setNotifOpen] = useState(false);
  const [, navigate] = useLocation();

  const { data: notifCounts } = useQuery<{ total: number; stockAlerts: number; registrationRequests: number }>({
    queryKey: ["/api/notifications/count"],
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
    enabled: !!user,
  });

  const { data: orderStats, isLoading: orderStatsLoading } = useQuery({
    queryKey: ["/api/orders/stats"],
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
    enabled: !!user,
  });

  const { data: customerInsights, isLoading: customerInsightsLoading } = useQuery<CustomerInsights>({
    queryKey: ["/api/analytics/customers"],
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
    enabled: !!user,
  });

  const { data: promotions } = useQuery<any[]>({
    queryKey: ['/api/promotions'],
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  const activePromotions = (promotions || []).filter((p: any) => {
    if (!p.isActive) return false;
    const now = new Date();
    const start = p.startDate ? new Date(p.startDate) : null;
    const end = p.endDate ? new Date(p.endDate) : null;
    return (!start || start <= now) && (!end || end >= now);
  });

  // Stripe Connect status for payment setup notifications
  const { data: stripeStatus } = useQuery<StripeConnectStatus>({
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
          return [];
        }
        const params = new URLSearchParams({
          fromDate: dateRange.from.toISOString(),
          toDate: dateRange.to.toISOString()
        });
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
      <div className="flex items-center justify-center min-h-screen">
        <ElephantLoader message="Loading your dashboard..." />
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
    // Prefer the custom store slug URL when set — gives a cleaner shareable link
    const storeIdentifier = (user?.role === 'team_member' ? null : user?.storeSlug) || effectiveUserId;
    const customerPortalUrl = `https://quikpik.app/customer/${storeIdentifier}`;
    const businessName = user?.businessName || "My Store";
    
    const shareData = {
      title: `${businessName} - Wholesale Store`,
      url: customerPortalUrl,
    };

    // Try native sharing first (works on mobile devices)
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        toast({
          title: "Store Shared!",
          description: "Store link shared successfully!",
        });
        return;
      } catch (error) {
        // User cancelled sharing or sharing failed
        // Don't show error toast if user just cancelled
        if (!(error instanceof Error && error.name === 'AbortError')) {
          console.warn("Share API error:", error);
        }
      }
    } else {
    }

    // Fallback to clipboard copying — copy just the URL so it opens correctly when pasted
    try {
      await navigator.clipboard.writeText(customerPortalUrl);
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" data-onboarding="dashboard">
      <div className="flex-1">
        {/* Modern Header with Glass Effect */}
        <div className="backdrop-blur-sm bg-white/90 border-slate-200/70 border-b px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-2" data-onboarding="dashboard-header">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">
                  Hello, {user?.firstName || user?.businessName?.split(' ')[0] || 'Wholesaler'} 👋
                </h1>
                <p className="text-base sm:text-lg text-gray-900 opacity-80">
                  Your business performance at a glance
                </p>
              </div>

              
              {/* Header Icons — hidden on mobile (top bar covers them); visible on lg+ */}
              <div className="hidden lg:flex items-center gap-1">
                <Button variant="ghost" size="icon" className="relative hover:bg-gray-100" onClick={handleShareStore}>
                  <Share2 className="h-5 w-5" />
                </Button>
                <Popover open={notifOpen} onOpenChange={setNotifOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative hover:bg-gray-100">
                      <Bell className="h-5 w-5" />
                      {(notifCounts?.total ?? 0) > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                          {(notifCounts!.total > 99) ? "99+" : notifCounts!.total}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-0">
                    <div className="border-b border-gray-100 px-4 py-3">
                      <h3 className="font-semibold text-gray-900">Notifications</h3>
                      {(notifCounts?.total ?? 0) > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5">{notifCounts!.total} item{notifCounts!.total !== 1 ? "s" : ""} need your attention</p>
                      )}
                    </div>
                    {(notifCounts?.total ?? 0) === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                        <p className="text-sm font-medium text-gray-700">You're all caught up!</p>
                        <p className="text-xs text-gray-500 mt-1">No pending items right now</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {(notifCounts?.registrationRequests ?? 0) > 0 && (
                          <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => { setNotifOpen(false); navigate("/customer-registration-requests"); }}>
                            <div className="flex-shrink-0 w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center">
                              <Users className="h-4 w-4 text-purple-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{notifCounts!.registrationRequests} customer{notifCounts!.registrationRequests !== 1 ? "s" : ""} waiting for approval</p>
                              <p className="text-xs text-gray-500">Review and approve or decline requests</p>
                            </div>
                            <span className="flex-shrink-0 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full px-2 py-0.5">{notifCounts!.registrationRequests}</span>
                          </div>
                        )}
                        {(notifCounts?.stockAlerts ?? 0) > 0 && (
                          <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => { setNotifOpen(false); navigate("/stock-alerts"); }}>
                            <div className="flex-shrink-0 w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{notifCounts!.stockAlerts} product{notifCounts!.stockAlerts !== 1 ? "s" : ""} low on stock</p>
                              <p className="text-xs text-gray-500">Review stock levels and restock as needed</p>
                            </div>
                            <span className="flex-shrink-0 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full px-2 py-0.5">{notifCounts!.stockAlerts}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="border-t border-gray-100 px-4 py-2">
                      <p className="text-xs text-gray-400">Checks every 60 seconds · Stock alerts sent daily at 8 AM</p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>

        {/* Priority Setup Alerts */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {user?.role !== 'team_member' && <StripeSetupAlert />}
        </div>

        {/* Dashboard Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8">
          {/* Priority Stripe Setup Notification */}
          {(user?.role === 'wholesaler' && !!stripeStatus && !(stripeStatus?.paymentsEnabled)) && (
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

          {/* Stats Cards Row — 3 per row on large screens */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
            <DynamicTooltip 
              content="Your total revenue from all active orders (paid + outstanding). Excludes cancelled orders."
              type="info"
              placement="top"
            >
              <AnimatedCard 
                className="text-white border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600" 
                hoverScale={true} 
                fadeIn={true} 
                delay={0}
              >
                <AnimatedCardContent className="p-3 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <p className="text-white/80 text-xs sm:text-sm font-medium">Revenue</p>
                        <p className="text-white/50 text-xs">before fees</p>
                      </div>
                      <p className="text-xl sm:text-3xl font-bold">{statsLoading ? '...' : formatCurrency(stats?.totalRevenue || 0)}</p>
                      <p className="text-white/80 text-xs mt-1">
                        {stats?.revenueChange !== undefined 
                          ? `${stats.revenueChange >= 0 ? '+' : ''}${stats.revenueChange.toFixed(1)}% from last month`
                          : 'No change data'}
                      </p>
                    </div>
                    <div className="bg-white/20 p-2 sm:p-3 rounded-full">
                      <DollarSign className="h-4 w-4 sm:h-6 sm:w-6" />
                    </div>
                  </div>
                </AnimatedCardContent>
              </AnimatedCard>
            </DynamicTooltip>

            {/* Amount Owed — amber */}
            <DynamicTooltip
              content="Total outstanding balance across all unpaid invoices and orders."
              type="info"
              placement="top"
            >
              <AnimatedCard
                className="text-white border-0 shadow-lg bg-gradient-to-br from-amber-400 to-amber-500"
                hoverScale={true}
                fadeIn={true}
                delay={50}
              >
                <AnimatedCardContent className="p-3 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-xs sm:text-sm font-medium">Amount Owed</p>
                      <p className="text-xl sm:text-3xl font-bold">{statsLoading ? '...' : formatCurrency(stats?.unpaidAmount || 0)}</p>
                      <p className="text-white/80 text-xs mt-1">
                        {statsLoading ? '' : `${stats?.unpaidCount ?? 0} unpaid invoice${(stats?.unpaidCount ?? 0) !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="bg-white/20 p-2 sm:p-3 rounded-full">
                      <CreditCard className="h-4 w-4 sm:h-6 sm:w-6" />
                    </div>
                  </div>
                </AnimatedCardContent>
              </AnimatedCard>
            </DynamicTooltip>

            <DynamicTooltip 
              content="Total number of orders placed by your customers. Includes all order statuses - pending, paid, and fulfilled."
              type="info"
              placement="top"
            >
              <AnimatedCard 
                className="text-white border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600" 
                hoverScale={true} 
                fadeIn={true} 
                delay={100}
              >
                <AnimatedCardContent className="p-3 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-xs sm:text-sm font-medium">Total Orders</p>
                      <p className="text-xl sm:text-3xl font-bold">{statsLoading ? '...' : formatNumber(stats?.ordersCount || 0)}</p>
                      <p className="text-white/80 text-xs mt-1">
                        {stats?.ordersChange !== undefined 
                          ? `${stats.ordersChange >= 0 ? '+' : ''}${stats.ordersChange.toFixed(1)}% from last month`
                          : 'No change data'}
                      </p>
                    </div>
                    <div className="bg-white/20 p-2 sm:p-3 rounded-full">
                      <ShoppingCart className="h-4 w-4 sm:h-6 sm:w-6" />
                    </div>
                  </div>
                </AnimatedCardContent>
              </AnimatedCard>
            </DynamicTooltip>

            <DynamicTooltip 
              content="Number of products currently available in your catalog. Click on the bell icon to view low stock alerts."
              type="info"
              placement="top"
            >
              <Card className="text-white border-0 shadow-lg bg-gradient-to-br from-purple-500 to-purple-600">
                <CardContent className="p-3 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-xs sm:text-sm font-medium">Active Products</p>
                      <p className="text-xl sm:text-3xl font-bold">{statsLoading ? '...' : formatNumber(stats?.activeProducts || 0)}</p>
                      <p className="text-white/80 text-xs mt-1">
                        {(notifCounts?.stockAlerts ?? 0) > 0 ? `${notifCounts!.stockAlerts} low stock alerts` : 'Stock levels healthy'}
                      </p>
                    </div>
                    <div className="bg-white/20 p-2 sm:p-3 rounded-full">
                      <Package className="h-4 w-4 sm:h-6 sm:w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </DynamicTooltip>

            {/* Low Stock Items */}
            <Card className="border shadow-sm bg-white">
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs sm:text-sm font-medium">Low Stock Items</p>
                    <p className="text-xl sm:text-3xl font-bold text-gray-900">{statsLoading ? '...' : formatNumber(stats?.lowStockCount || 0)}</p>
                    <Link href="/products">
                      <span className="text-xs mt-1 font-medium text-primary cursor-pointer hover:underline">View items</span>
                    </Link>
                  </div>
                  <div className="bg-amber-100 p-2 sm:p-3 rounded-full">
                    <AlertTriangle className="h-4 w-4 sm:h-6 sm:w-6 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="text-white border-0 shadow-lg" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-xs sm:text-sm font-medium">WhatsApp Reach</p>
                    <p className="text-xl sm:text-3xl font-bold">{broadcastStatsLoading ? '...' : formatNumber(broadcastStats?.recipientsReached || 0)}</p>
                    <p className="text-white/80 text-xs mt-1">Customers reached</p>
                  </div>
                  <div className="bg-white/20 p-2 sm:p-3 rounded-full">
                    <MessageSquare className="h-4 w-4 sm:h-6 sm:w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Margin Overview */}
          <MarginOverview />
          
          {/* Interactive Quick Actions Grid */}
          <TooltipProvider>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
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
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-2">
                    <p className="font-semibold">Product Management</p>
                    <p className="text-sm">Create, edit, and organize your product catalog. Upload images, set prices, manage inventory, and configure minimum order quantities.</p>
                    <div className="text-xs text-gray-400">
                      Keyboard shortcut: Ctrl+1 (⌘+1 on Mac)
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <InteractiveActionCard
                      href="/campaigns"
                      icon={MessageSquare}
                      title="Broadcast Soon"
                      description="Messaging tools are coming soon"
                      metric="Coming Soon"
                      colorClass="from-emerald-500 to-emerald-600"
                      gradientFrom="from-emerald-50"
                      gradientTo="to-emerald-100"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-2">
                    <p className="font-semibold">Broadcast Coming Soon</p>
                    <p className="text-sm">Broadcast messaging is paused for now. This shortcut opens the coming-soon page.</p>
                    <div className="text-xs text-gray-400">
                      Keyboard shortcut: Ctrl+2 (⌘+2 on Mac)
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
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
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-2">
                    <p className="font-semibold">Order Management</p>
                    <p className="text-sm">View and manage all customer orders. Process payments, update order status, arrange fulfillment, and track delivery progress.</p>
                    <div className="text-xs text-gray-400">
                      Keyboard shortcut: Ctrl+3 (⌘+3 on Mac)
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <InteractiveActionCard
                      href="/customers?tab=groups"
                      icon={Users}
                      title="Customer Groups"
                      description="Organize your customers"
                      metric="Manage Groups"
                      colorClass="from-orange-500 to-orange-600"
                      gradientFrom="from-orange-50"
                      gradientTo="to-orange-100"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-2">
                    <p className="font-semibold">Customer Organization</p>
                    <p className="text-sm">Create customer groups for targeted marketing. Organize customers by region, purchase volume, or business type for better relationship management.</p>
                    <div className="text-xs text-gray-400">
                      Keyboard shortcut: Ctrl+4 (⌘+4 on Mac)
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          {/* Top Selling Product Section */}
          <div className="mb-8">
            <Card className="bg-white border-slate-200 shadow-sm">
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
                            {formatCurrency(topProducts[0].revenue || 0)}
                          </p>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <p className="text-xs text-blue-600 font-medium">Units Sold</p>
                          <p className="text-lg font-bold text-blue-700">
                            {formatNumber(topProducts[0].totalQuantitySold || 0)}
                          </p>
                        </div>
                        <div className="bg-purple-50 p-3 rounded-lg">
                          <p className="text-xs text-purple-600 font-medium">Orders</p>
                          <p className="text-lg font-bold text-purple-700">
                            {formatNumber(topProducts[0].orderCount || 0)}
                          </p>
                        </div>
                        <div className="bg-orange-50 p-3 rounded-lg">
                          <p className="text-xs text-orange-600 font-medium">Current Price</p>
                          <p className="text-lg font-bold text-orange-700">
                            {formatCurrency(topProducts[0].price || 0)}
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
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardHeader className="flex flex-col gap-3">
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900">Sales Performance</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Revenue trends over time</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="w-fit">
                    <DateRangePicker 
                      value={dateRange} 
                      onChange={setDateRange}
                      className="min-w-48"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Period total</p>
                    <p className="text-lg font-bold text-emerald-600">
                      {chartLoading ? '...' : formatCurrency((chartData as ChartDataPoint[] | undefined)?.reduce((sum: number, d: ChartDataPoint) => sum + (d.revenue || 0), 0) || 0)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {chartLoading || statsLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData || []}>
                        <defs>
                          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
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
                        <RechartsTooltip 
                          formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                          labelStyle={{ color: '#374151' }}
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #e5e7eb',
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#10b981"
                          strokeWidth={2}
                          fill="url(#revenueGradient)"
                          dot={false}
                          activeDot={{ r: 6, stroke: "#10b981", strokeWidth: 2, fill: '#ffffff' }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Orders Chart */}
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardHeader className="flex flex-col gap-3">
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900">Order Volume</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Orders processed over time</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="w-fit">
                    <DateRangePicker 
                      value={dateRange} 
                      onChange={setDateRange}
                      className="min-w-48"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Period total</p>
                    <p className="text-lg font-bold text-blue-600">
                      {chartLoading ? '...' : ((chartData as ChartDataPoint[] | undefined)?.reduce((sum: number, d: ChartDataPoint) => sum + (d.orders || 0), 0) || 0)} orders
                    </p>
                  </div>
                </div>
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
                        <RechartsTooltip 
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

          {/* Top Customers */}
          <div className="mb-8">
            {/* Top Customers */}
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-gray-900 flex items-center">
                  <Users className="w-6 h-6 text-blue-500 mr-2" />
                  Top Customers
                </CardTitle>
                <p className="text-sm text-gray-600">Your best customers by order value</p>
              </CardHeader>
              <CardContent>
                {customerInsightsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : customerInsights && (customerInsights.topCustomers?.length ?? 0) > 0 ? (
                  <div className="space-y-3">
                    {(customerInsights.topCustomers || []).slice(0, 5).map((customer: any, index: number) => (
                      <div key={customer.id || index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-400' : 'bg-blue-400'}`}>
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{customer.name}</p>
                            <p className="text-xs text-gray-500">{customer.orderCount} orders</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">{formatCurrency(customer.totalSpent || 0)}</p>
                          <p className="text-xs text-gray-500">avg {formatCurrency(customer.avgOrderValue || 0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p>No customer data yet</p>
                    <p className="text-sm mt-1">Complete some orders to see your top customers</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Active Promotions */}
          {activePromotions.length > 0 && (
            <div className="mb-8">
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold text-gray-900 flex items-center">
                        <Tag className="w-6 h-6 text-red-500 mr-2" />
                        Active Promotions
                      </CardTitle>
                      <p className="text-sm text-gray-600">{activePromotions.length} promotion{activePromotions.length !== 1 ? 's' : ''} running</p>
                    </div>
                    <Link href="/promotions">
                      <Button variant="outline" size="sm">Manage</Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {activePromotions.slice(0, 6).map((promo: any) => {
                      const typeLabels: Record<string, string> = {
                        percentage_discount: `${promo.discountPercentage}% OFF`,
                        fixed_price: `Now ${formatCurrency(promo.fixedPrice)}`,
                        buy_x_get_y_free: `Buy ${promo.buyQuantity} Get ${promo.getQuantity} Free`,
                        bundle_deal: `${promo.minQuantity}+ @ ${formatCurrency(promo.fixedPrice)}`,
                        clearance: `Clearance ${formatCurrency(promo.fixedPrice)}`,
                      };
                      const typeColors: Record<string, string> = {
                        percentage_discount: 'bg-red-100 text-red-700',
                        fixed_price: 'bg-green-100 text-green-700',
                        buy_x_get_y_free: 'bg-purple-100 text-purple-700',
                        bundle_deal: 'bg-blue-100 text-blue-700',
                        clearance: 'bg-orange-100 text-orange-700',
                      };
                      return (
                        <div key={promo.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">{promo.productName}</p>
                            <Badge className={`text-xs ${typeColors[promo.type] || 'bg-gray-100 text-gray-700'}`}>
                              {typeLabels[promo.type] || promo.type}
                            </Badge>
                            {promo.endDate && (
                              <p className="text-xs text-gray-500 mt-1">Ends {new Date(promo.endDate).toLocaleDateString()}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Recent Orders & Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Orders */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold text-gray-900">Recent Orders</CardTitle>
                    <p className="text-sm text-gray-600">Latest customer orders</p>
                  </div>
                  <Link href="/orders">
                    <button className="text-sm text-green-600 hover:text-green-700 font-medium">View All →</button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse flex items-center space-x-4">
                        <div className="w-12 h-12 bg-slate-200 rounded-lg"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                          <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                        </div>
                        <div className="w-16 h-4 bg-slate-200 rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(Array.isArray(orders) ? orders : []).slice(0, 5).map((order: { id: number; orderNumber?: string; customerName?: string; createdAt?: string; total?: string; status?: string; retailer?: { businessName?: string; firstName?: string; lastName?: string } }) => (
                      <div key={order.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                        <div>
                          <p className="font-medium text-blue-600">{order.orderNumber || `#${order.id}`}</p>
                          <p className="text-sm text-gray-600">{order.retailer?.businessName || (`${order.retailer?.firstName || ''} ${order.retailer?.lastName || ''}`.trim()) || order.customerName || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={({
                            pending: 'bg-amber-100 text-amber-800 border-0',
                            confirmed: 'bg-blue-100 text-blue-800 border-0',
                            processing: 'bg-purple-100 text-purple-800 border-0',
                            paid: 'bg-green-100 text-green-800 border-0',
                            fulfilled: 'bg-emerald-100 text-emerald-800 border-0',
                            cancelled: 'bg-red-100 text-red-800 border-0',
                            ready_for_collection: 'bg-orange-100 text-orange-800 border-0',
                            items_prepared: 'bg-teal-100 text-teal-800 border-0',
                          } as Record<string, string>)[(order.status ?? '')] || 'bg-gray-100 text-gray-800 border-0'}>
                            {(order.status ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </Badge>
                          <Link href={`/orders?id=${order.id}`}>
                            <Button variant="outline" size="sm" className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                    {(Array.isArray(orders) ? orders : []).length === 0 && (
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
                <p className="text-sm text-gray-600">Best performing items · Ranked by units sold</p>
              </CardHeader>
              <CardContent>
                {productsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse flex items-center space-x-4">
                        <div className="w-12 h-12 bg-slate-200 rounded-lg"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                          <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                        </div>
                        <div className="w-16 h-4 bg-slate-200 rounded"></div>
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
                      ((topProducts as any) || []).slice(0, 5).map((product: any) => (
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
                      <p className="font-medium text-gray-900">Broadcast</p>
                      <p className="text-xs text-gray-500">Coming soon</p>
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