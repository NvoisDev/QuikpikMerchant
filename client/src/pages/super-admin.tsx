import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  Users,
  ShoppingCart,
  TrendingUp,
  Search,
  LogOut,
  LayoutDashboard,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const ADMIN_EMAILS = ["hello@quikpik.co", "mogunjemilua@gmail.com"];

const fmt = (n: number) =>
  `£${(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const planBadge = (tier: string) => {
  const label = tier === "premium" ? "Premium" : tier === "standard" ? "Standard" : "Free";
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
      {label}
    </span>
  );
};

function AdminLogin() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google?returnTo=/admin");
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gray-900 mb-4">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Quikpik Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Platform administration</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <p className="text-sm text-gray-600 mb-6 text-center">
            Sign in with your Quikpik admin account to continue.
          </p>
          <Button
            className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm h-10"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </span>
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Access restricted to authorised administrators only.
        </p>
      </div>
    </div>
  );
}

function AccessDenied({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gray-100 mb-4">
          <Shield className="h-6 w-6 text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Access restricted</h2>
        <p className="text-sm text-gray-500 mb-1">
          <span className="font-medium text-gray-700">{email}</span> is not an authorised admin account.
        </p>
        <p className="text-sm text-gray-400 mb-6">Contact the platform owner if you believe this is a mistake.</p>
        <Button variant="outline" size="sm" onClick={onSignOut} className="text-gray-600">
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export default function SuperAdmin() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orderSearch, setOrderSearch] = useState("");
  const [revenuePage, setRevenuePage] = useState(1);
  const PAGE_SIZE = 20;

  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email || "");

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/admin/platform-stats"],
    enabled: isAdmin,
  });

  const { data: wholesalers = [], isLoading: wholesalersLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/wholesalers"],
    enabled: isAdmin,
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery<any>({
    queryKey: ["/api/admin/revenue"],
    enabled: isAdmin,
  });

  const toggleStatus = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/admin/wholesalers/${id}/toggle-status`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      toast({ title: "Status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <AdminLogin />;
  if (!isAdmin) return <AccessDenied email={user?.email || ""} onSignOut={logout} />;

  const revenueOrders: any[] = revenueData?.orders || [];
  const revenueTotals = revenueData?.totals || {};

  const wholesalerRevenueSummary = useMemo(() => {
    const map: Record<string, { name: string; tier: string; orders: number; customerFees: number; platformFees: number; total: number }> = {};
    for (const o of revenueOrders) {
      const key = o.wholesalerId || "unknown";
      if (!map[key]) map[key] = { name: o.wholesalerName || "Unknown", tier: "", orders: 0, customerFees: 0, platformFees: 0, total: 0 };
      map[key].orders++;
      map[key].customerFees += Number(o.customerTransactionFee || 0);
      map[key].platformFees += Number(o.platformFee || 0);
      map[key].total += Number(o.customerTransactionFee || 0) + Number(o.platformFee || 0);
    }
    for (const w of wholesalers) {
      if (map[w.id]) map[w.id].tier = w.subscriptionTier || "free";
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [revenueOrders, wholesalers]);

  const filteredOrders = useMemo(() => {
    if (!orderSearch.trim()) return revenueOrders;
    const q = orderSearch.toLowerCase();
    return revenueOrders.filter(
      o =>
        (o.orderNumber || "").toLowerCase().includes(q) ||
        (o.wholesalerName || "").toLowerCase().includes(q) ||
        (o.customerName || "").toLowerCase().includes(q)
    );
  }, [revenueOrders, orderSearch]);

  const revenuePaged = useMemo(() => {
    const start = (revenuePage - 1) * PAGE_SIZE;
    return revenueOrders.slice(start, start + PAGE_SIZE);
  }, [revenueOrders, revenuePage]);
  const revenuePages = Math.ceil(revenueOrders.length / PAGE_SIZE);

  const initials = `${user?.firstName?.charAt(0) || ""}${user?.lastName?.charAt(0) || ""}`.toUpperCase() || "A";
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Admin";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-900">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">Quikpik Admin</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-700">{initials}</span>
              </div>
              <div className="leading-tight">
                <p className="text-xs font-medium text-gray-800">{displayName}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 h-8 px-2"
            >
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline text-xs">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6">

        {/* Stat cards */}
        {statsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-20 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Wholesalers"
              value={stats?.totalWholesalers || 0}
              sub={`${stats?.activeWholesalers || 0} active`}
              icon={<Users className="h-4 w-4 text-gray-400" />}
            />
            <StatCard
              label="Gross Revenue"
              value={fmt(stats?.totalGrossRevenue)}
              sub="All-time"
              icon={<TrendingUp className="h-4 w-4 text-gray-400" />}
            />
            <StatCard
              label="Total Orders"
              value={(stats?.totalOrders || 0).toLocaleString()}
              sub={`${stats?.ordersThisMonth || 0} this month`}
              icon={<ShoppingCart className="h-4 w-4 text-gray-400" />}
            />
            <StatCard
              label="Total GMV"
              value={fmt(stats?.totalGMV)}
              sub="Gross merchandise"
              icon={<LayoutDashboard className="h-4 w-4 text-gray-400" />}
            />
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="bg-white border border-gray-200 rounded-lg p-1 inline-flex gap-0.5 min-w-max">
              <TabsTrigger value="overview" className="text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=inactive]:text-gray-500">Overview</TabsTrigger>
              <TabsTrigger value="wholesalers" className="text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=inactive]:text-gray-500">Wholesalers</TabsTrigger>
              <TabsTrigger value="revenue" className="text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=inactive]:text-gray-500">Revenue</TabsTrigger>
              <TabsTrigger value="orders" className="text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-gray-900 data-[state=active]:text-white data-[state=inactive]:text-gray-500">All Orders</TabsTrigger>
            </TabsList>
          </div>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PlanCard label="Free" count={stats?.wholesalersByPlan?.free || 0} />
              <PlanCard label="Standard" count={stats?.wholesalersByPlan?.standard || 0} />
              <PlanCard label="Premium" count={stats?.wholesalersByPlan?.premium || 0} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="border-gray-200 shadow-none">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm font-medium text-gray-700">This Month</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <Row label="New wholesalers" value={stats?.newWholesalersThisMonth || 0} />
                  <Row label="Orders placed" value={stats?.ordersThisMonth || 0} />
                </CardContent>
              </Card>

              <Card className="border-gray-200 shadow-none">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm font-medium text-gray-700">Revenue Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <Row label="Customer fees (5.5% + £0.50)" value={fmt(stats?.totalCustomerFees)} />
                  <Row label="Wholesaler fees (3.3%)" value={fmt(stats?.totalPlatformFees)} />
                  <div className="pt-1 border-t border-gray-100">
                    <Row label="Total earned" value={fmt(stats?.totalGrossRevenue)} bold />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Wholesalers */}
          <TabsContent value="wholesalers">
            <Card className="border-gray-200 shadow-none">
              <CardHeader className="px-4 pt-4 pb-3">
                <CardTitle className="text-sm font-medium text-gray-700">
                  All Wholesalers ({wholesalers.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {wholesalersLoading ? (
                  <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 hover:bg-gray-50">
                          <TableHead className="text-xs text-gray-500 font-medium">Business</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium">Plan</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium text-right">Orders</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium text-right">GMV</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium text-right">Cust. Fees</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium text-right">Platform Fees</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium text-right">Total Fees</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium">Joined</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium">Status</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {wholesalers.map((w: any) => (
                          <TableRow key={w.id} className="hover:bg-gray-50/50">
                            <TableCell>
                              <div>
                                <p className="text-xs font-medium text-gray-800">{w.businessName || `${w.firstName} ${w.lastName}`}</p>
                                <p className="text-xs text-gray-400">{w.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>{planBadge(w.subscriptionTier)}</TableCell>
                            <TableCell className="text-xs text-right text-gray-600">{w.orderCount}</TableCell>
                            <TableCell className="text-xs text-right text-gray-600">{fmt(w.totalGMV)}</TableCell>
                            <TableCell className="text-xs text-right text-gray-700">{fmt(w.customerFeesEarned)}</TableCell>
                            <TableCell className="text-xs text-right text-gray-700">{fmt(w.platformFeesEarned)}</TableCell>
                            <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(w.totalFeesEarned)}</TableCell>
                            <TableCell className="text-xs text-gray-400">
                              {w.createdAt ? format(new Date(w.createdAt), "dd MMM yy") : "—"}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-block text-xs px-2 py-0.5 rounded border ${w.archived ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                                {w.archived ? "Suspended" : "Active"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-gray-600 border-gray-200 hover:bg-gray-50"
                                disabled={toggleStatus.isPending}
                                onClick={() => toggleStatus.mutate(w.id)}
                              >
                                {w.archived ? "Activate" : "Suspend"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-50 hover:bg-gray-50 border-t-2 border-gray-200">
                          <TableCell colSpan={3} className="text-xs font-semibold text-gray-700">Grand Total</TableCell>
                          <TableCell className="text-xs text-right font-semibold text-gray-700">{fmt(wholesalers.reduce((s: number, w: any) => s + (w.totalGMV || 0), 0))}</TableCell>
                          <TableCell className="text-xs text-right font-semibold text-gray-700">{fmt(wholesalers.reduce((s: number, w: any) => s + (w.customerFeesEarned || 0), 0))}</TableCell>
                          <TableCell className="text-xs text-right font-semibold text-gray-700">{fmt(wholesalers.reduce((s: number, w: any) => s + (w.platformFeesEarned || 0), 0))}</TableCell>
                          <TableCell className="text-xs text-right font-bold text-gray-900">{fmt(wholesalers.reduce((s: number, w: any) => s + (w.totalFeesEarned || 0), 0))}</TableCell>
                          <TableCell colSpan={3} />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Revenue */}
          <TabsContent value="revenue" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Customer Fees" value={fmt(revenueTotals.totalCustomerFees)} sub="5.5% + £0.50 per order" icon={<ChevronRight className="h-4 w-4 text-gray-400" />} />
              <StatCard label="Platform Fees" value={fmt(revenueTotals.totalPlatformFees)} sub="3.3% per order" icon={<ChevronRight className="h-4 w-4 text-gray-400" />} />
              <StatCard label="Gross Revenue" value={fmt(revenueTotals.totalGrossRevenue)} sub="Combined total" icon={<TrendingUp className="h-4 w-4 text-gray-400" />} />
            </div>

            <Card className="border-gray-200 shadow-none">
              <CardHeader className="px-4 pt-4 pb-3">
                <CardTitle className="text-sm font-medium text-gray-700">Fees by Wholesaler</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableHead className="text-xs text-gray-500 font-medium">Wholesaler</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium">Plan</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-right">Orders</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-right">Customer Fees</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-right">Platform Fees</TableHead>
                        <TableHead className="text-xs text-gray-500 font-medium text-right">Total Earned</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wholesalerRevenueSummary.map((w, i) => (
                        <TableRow key={i} className="hover:bg-gray-50/50">
                          <TableCell className="text-xs font-medium text-gray-800">{w.name}</TableCell>
                          <TableCell>{planBadge(w.tier)}</TableCell>
                          <TableCell className="text-xs text-right text-gray-600">{w.orders}</TableCell>
                          <TableCell className="text-xs text-right text-gray-700">{fmt(w.customerFees)}</TableCell>
                          <TableCell className="text-xs text-right text-gray-700">{fmt(w.platformFees)}</TableCell>
                          <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(w.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-none">
              <CardHeader className="px-4 pt-4 pb-3">
                <CardTitle className="text-sm font-medium text-gray-700">
                  Per-Order Breakdown ({revenueOrders.length} orders)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {revenueLoading ? (
                  <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50 hover:bg-gray-50">
                            <TableHead className="text-xs text-gray-500 font-medium">Order #</TableHead>
                            <TableHead className="text-xs text-gray-500 font-medium">Wholesaler</TableHead>
                            <TableHead className="text-xs text-gray-500 font-medium">Customer</TableHead>
                            <TableHead className="text-xs text-gray-500 font-medium text-right">GMV</TableHead>
                            <TableHead className="text-xs text-gray-500 font-medium text-right">Cust. Fee</TableHead>
                            <TableHead className="text-xs text-gray-500 font-medium text-right">Platform Fee</TableHead>
                            <TableHead className="text-xs text-gray-500 font-medium text-right">Total</TableHead>
                            <TableHead className="text-xs text-gray-500 font-medium">Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {revenuePaged.map((o: any) => (
                            <TableRow key={o.id} className="hover:bg-gray-50/50">
                              <TableCell className="font-mono text-xs text-gray-500">{o.orderNumber}</TableCell>
                              <TableCell className="text-xs text-gray-700">{o.wholesalerName || "—"}</TableCell>
                              <TableCell className="text-xs text-gray-600">{o.customerName || "—"}</TableCell>
                              <TableCell className="text-xs text-right text-gray-600">{fmt(o.subtotal)}</TableCell>
                              <TableCell className="text-xs text-right text-gray-700">{fmt(o.customerTransactionFee)}</TableCell>
                              <TableCell className="text-xs text-right text-gray-700">{fmt(o.platformFee)}</TableCell>
                              <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(o.totalQuikpikIncome)}</TableCell>
                              <TableCell className="text-xs text-gray-400">
                                {o.createdAt ? format(new Date(o.createdAt), "dd MMM yy") : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {revenuePages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                        <span className="text-xs text-gray-400">Page {revenuePage} of {revenuePages}</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={revenuePage === 1} onClick={() => setRevenuePage(p => p - 1)}>Prev</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={revenuePage === revenuePages} onClick={() => setRevenuePage(p => p + 1)}>Next</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* All Orders */}
          <TabsContent value="orders">
            <Card className="border-gray-200 shadow-none">
              <CardHeader className="px-4 pt-4 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                  <CardTitle className="text-sm font-medium text-gray-700">
                    All Orders ({revenueOrders.length} recent)
                  </CardTitle>
                  <div className="relative w-full sm:w-56">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      placeholder="Search..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="pl-8 h-8 text-xs border-gray-200"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {revenueLoading ? (
                  <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 hover:bg-gray-50">
                          <TableHead className="text-xs text-gray-500 font-medium">Order #</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium">Wholesaler</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium">Customer</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium text-right">GMV</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium">Status</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium">Payment</TableHead>
                          <TableHead className="text-xs text-gray-500 font-medium">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.slice(0, 200).map((o: any) => (
                          <TableRow key={o.id} className="hover:bg-gray-50/50">
                            <TableCell className="font-mono text-xs text-gray-500">{o.orderNumber}</TableCell>
                            <TableCell className="text-xs text-gray-700">{o.wholesalerName || "—"}</TableCell>
                            <TableCell className="text-xs text-gray-600">{o.customerName || "—"}</TableCell>
                            <TableCell className="text-xs text-right text-gray-700">{fmt(o.subtotal)}</TableCell>
                            <TableCell>
                              <span className="text-xs text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                                {(o.status || "pending").replace(/_/g, " ")}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs px-1.5 py-0.5 rounded border ${o.paymentStatus === "paid" ? "bg-gray-100 text-gray-700 border-gray-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                                {o.paymentStatus || "pending"}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-gray-400">
                              {o.createdAt ? format(new Date(o.createdAt), "dd MMM yy") : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredOrders.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-10 text-sm text-gray-400">No orders found</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        {icon}
      </div>
      <p className="text-lg font-semibold text-gray-900 leading-tight">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function PlanCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-2xl font-semibold text-gray-800">{count}</p>
      <p className="text-xs text-gray-500 mt-1">{label} Plan</p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string | number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}>{value}</span>
    </div>
  );
}
