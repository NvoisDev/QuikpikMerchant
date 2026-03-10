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
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Crown,
  Search,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const ADMIN_EMAILS = ["hello@quikpik.co", "mogunjemilua@gmail.com"];

const fmt = (n: number) =>
  `£${(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const planBadge = (tier: string) => {
  if (tier === "premium") return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Premium</Badge>;
  if (tier === "standard") return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Standard</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Free</Badge>;
};

export default function SuperAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orderSearch, setOrderSearch] = useState("");
  const [revenuePage, setRevenuePage] = useState(1);
  const PAGE_SIZE = 20;

  const isAdmin = user && ADMIN_EMAILS.includes(user.email || "");

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/admin/platform-stats"],
    enabled: !!isAdmin,
  });

  const { data: wholesalers = [], isLoading: wholesalersLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/wholesalers"],
    enabled: !!isAdmin,
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery<any>({
    queryKey: ["/api/admin/revenue"],
    enabled: !!isAdmin,
  });

  const toggleStatus = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/admin/wholesalers/${id}/toggle-status`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      toast({ title: "Wholesaler status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="max-w-sm w-full text-center p-8">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">This page is restricted to Quikpik platform administrators.</p>
        </Card>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mb-8 flex items-center gap-4">
        <div className="p-3 bg-purple-600 rounded-xl">
          <Shield className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Quikpik Admin</h1>
          <p className="text-gray-500 text-sm">Platform-wide oversight and revenue analytics</p>
        </div>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6 h-24 animate-pulse bg-gray-100 rounded-lg" /></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Wholesalers</p>
                <Users className="h-4 w-4 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalWholesalers || 0}</p>
              <p className="text-xs text-gray-500 mt-1">{stats?.activeWholesalers} active · {stats?.suspendedWholesalers} suspended</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Gross Revenue</p>
                <DollarSign className="h-4 w-4 text-green-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmt(stats?.totalGrossRevenue)}</p>
              <p className="text-xs text-gray-500 mt-1">All-time Quikpik earnings</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Orders</p>
                <ShoppingCart className="h-4 w-4 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{(stats?.totalOrders || 0).toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{stats?.ordersThisMonth} this month</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total GMV</p>
                <TrendingUp className="h-4 w-4 text-orange-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmt(stats?.totalGMV)}</p>
              <p className="text-xs text-gray-500 mt-1">Gross merchandise value</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="wholesalers">Wholesalers</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="orders">All Orders</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <Crown className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-4xl font-bold text-gray-700">{stats?.wholesalersByPlan?.free || 0}</p>
                <p className="text-sm text-gray-500 mt-1">Free Plan</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <Crown className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                <p className="text-4xl font-bold text-blue-600">{stats?.wholesalersByPlan?.standard || 0}</p>
                <p className="text-sm text-gray-500 mt-1">Standard Plan</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <Crown className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                <p className="text-4xl font-bold text-purple-600">{stats?.wholesalersByPlan?.premium || 0}</p>
                <p className="text-sm text-gray-500 mt-1">Premium Plan</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">This Month</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-gray-600">New Wholesalers Joined</span>
                  <span className="font-bold text-gray-900">{stats?.newWholesalersThisMonth || 0}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Orders Placed</span>
                  <span className="font-bold text-gray-900">{stats?.ordersThisMonth || 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Revenue Breakdown (All Time)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <div>
                    <span className="text-sm text-gray-700">Customer Fees</span>
                    <span className="ml-2 text-xs text-gray-400">5.5% + £0.50</span>
                  </div>
                  <span className="font-bold text-green-600">{fmt(stats?.totalCustomerFees)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <div>
                    <span className="text-sm text-gray-700">Wholesaler Fees</span>
                    <span className="ml-2 text-xs text-gray-400">3.3%</span>
                  </div>
                  <span className="font-bold text-blue-600">{fmt(stats?.totalPlatformFees)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-semibold text-gray-800">Total Earned</span>
                  <span className="font-bold text-gray-900">{fmt(stats?.totalGrossRevenue)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Wholesalers */}
        <TabsContent value="wholesalers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Wholesalers ({wholesalers.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {wholesalersLoading ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead>Business</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">GMV</TableHead>
                        <TableHead className="text-right">Cust. Fees</TableHead>
                        <TableHead className="text-right">Platform Fees</TableHead>
                        <TableHead className="text-right">Total Fees</TableHead>
                        <TableHead>Last Order</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wholesalers.map((w: any) => (
                        <TableRow key={w.id} className={w.archived ? "bg-red-50 opacity-70" : ""}>
                          <TableCell className="font-medium">{w.businessName || `${w.firstName} ${w.lastName}`}</TableCell>
                          <TableCell className="text-xs text-gray-500">{w.email}</TableCell>
                          <TableCell>{planBadge(w.subscriptionTier)}</TableCell>
                          <TableCell className="text-right">{w.orderCount}</TableCell>
                          <TableCell className="text-right text-gray-600">{fmt(w.totalGMV)}</TableCell>
                          <TableCell className="text-right text-green-700">{fmt(w.customerFeesEarned)}</TableCell>
                          <TableCell className="text-right text-blue-700">{fmt(w.platformFeesEarned)}</TableCell>
                          <TableCell className="text-right font-bold text-gray-900">{fmt(w.totalFeesEarned)}</TableCell>
                          <TableCell className="text-xs text-gray-500">
                            {w.lastOrderAt ? format(new Date(w.lastOrderAt), "dd MMM yy") : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-gray-500">
                            {w.createdAt ? format(new Date(w.createdAt), "dd MMM yy") : "—"}
                          </TableCell>
                          <TableCell>
                            {w.archived
                              ? <Badge className="bg-red-100 text-red-700">Suspended</Badge>
                              : <Badge className="bg-green-100 text-green-700">Active</Badge>}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant={w.archived ? "default" : "outline"}
                              className={w.archived
                                ? "text-xs bg-green-600 hover:bg-green-700 text-white"
                                : "text-xs text-red-600 border-red-200 hover:bg-red-50"}
                              disabled={toggleStatus.isPending}
                              onClick={() => toggleStatus.mutate(w.id)}
                            >
                              {w.archived ? "Activate" : "Suspend"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-50 font-bold border-t-2 border-gray-300">
                        <TableCell colSpan={4} className="text-gray-700">Grand Total</TableCell>
                        <TableCell className="text-right">{fmt(wholesalers.reduce((s: number, w: any) => s + (w.totalGMV || 0), 0))}</TableCell>
                        <TableCell className="text-right text-green-700">{fmt(wholesalers.reduce((s: number, w: any) => s + (w.customerFeesEarned || 0), 0))}</TableCell>
                        <TableCell className="text-right text-blue-700">{fmt(wholesalers.reduce((s: number, w: any) => s + (w.platformFeesEarned || 0), 0))}</TableCell>
                        <TableCell className="text-right text-gray-900">{fmt(wholesalers.reduce((s: number, w: any) => s + (w.totalFeesEarned || 0), 0))}</TableCell>
                        <TableCell colSpan={4} />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue */}
        <TabsContent value="revenue" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Customer Fees</p>
                <p className="text-2xl font-bold text-green-700">{fmt(revenueTotals.totalCustomerFees)}</p>
                <p className="text-xs text-gray-400 mt-1">5.5% + £0.50 per order</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Platform Fees</p>
                <p className="text-2xl font-bold text-blue-700">{fmt(revenueTotals.totalPlatformFees)}</p>
                <p className="text-xs text-gray-400 mt-1">3.3% per order from wholesalers</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Gross Revenue</p>
                <p className="text-2xl font-bold text-purple-700">{fmt(revenueTotals.totalGrossRevenue)}</p>
                <p className="text-xs text-gray-400 mt-1">All Quikpik income combined</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Fees by Wholesaler</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Wholesaler</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Customer Fees</TableHead>
                      <TableHead className="text-right">Platform Fees</TableHead>
                      <TableHead className="text-right">Total Earned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wholesalerRevenueSummary.map((w, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell>{planBadge(w.tier)}</TableCell>
                        <TableCell className="text-right">{w.orders}</TableCell>
                        <TableCell className="text-right text-green-700">{fmt(w.customerFees)}</TableCell>
                        <TableCell className="text-right text-blue-700">{fmt(w.platformFees)}</TableCell>
                        <TableCell className="text-right font-bold text-gray-900">{fmt(w.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-Order Revenue ({revenueOrders.length} recent orders)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {revenueLoading ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead>Order #</TableHead>
                          <TableHead>Wholesaler</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">GMV</TableHead>
                          <TableHead className="text-right">Cust. Fee</TableHead>
                          <TableHead className="text-right">Platform Fee</TableHead>
                          <TableHead className="text-right">Total Income</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {revenuePaged.map((o: any) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                            <TableCell className="text-sm">{o.wholesalerName || "—"}</TableCell>
                            <TableCell className="text-sm">{o.customerName || "—"}</TableCell>
                            <TableCell className="text-right text-gray-600">{fmt(o.subtotal)}</TableCell>
                            <TableCell className="text-right text-green-700">{fmt(o.customerTransactionFee)}</TableCell>
                            <TableCell className="text-right text-blue-700">{fmt(o.platformFee)}</TableCell>
                            <TableCell className="text-right font-bold text-gray-900">{fmt(o.totalQuikpikIncome)}</TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {o.createdAt ? format(new Date(o.createdAt), "dd MMM yy") : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {revenuePages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <span className="text-xs text-gray-500">Page {revenuePage} of {revenuePages}</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={revenuePage === 1} onClick={() => setRevenuePage(p => p - 1)}>Prev</Button>
                        <Button size="sm" variant="outline" disabled={revenuePage === revenuePages} onClick={() => setRevenuePage(p => p + 1)}>Next</Button>
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base">All Orders ({revenueOrders.length} recent)</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by order, wholesaler, customer..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="pl-9 h-8 text-sm"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {revenueLoading ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead>Order #</TableHead>
                        <TableHead>Wholesaler</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">GMV</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.slice(0, 200).map((o: any) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                          <TableCell className="text-sm">{o.wholesalerName || "—"}</TableCell>
                          <TableCell className="text-sm">{o.customerName || "—"}</TableCell>
                          <TableCell className="text-right">{fmt(o.subtotal)}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${
                              o.status === "fulfilled" ? "bg-green-100 text-green-700"
                              : o.status === "cancelled" ? "bg-red-100 text-red-700"
                              : o.status === "ready_for_collection" ? "bg-orange-100 text-orange-700"
                              : o.status === "processing" ? "bg-indigo-100 text-indigo-700"
                              : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {(o.status || "pending").replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={o.paymentStatus === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                              {o.paymentStatus || "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-gray-500">
                            {o.createdAt ? format(new Date(o.createdAt), "dd MMM yy") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredOrders.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-gray-400">No orders found</TableCell>
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
    </div>
  );
}
