import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Building2, ShoppingCart, Package, TrendingUp, DollarSign, AlertTriangle, AlertCircle, Star, Info,
} from "lucide-react";
import { formatNumber } from "@/lib/currencies";
import {
  GREEN, BLUE, AMBER, PURPLE, RED, fmt, StatCard, Row,
} from "./shared";
import type { PlatformStats, AlertsData, RevenueData, RevenueTotals, SectionId } from "./types";

export function OverviewSection({ stats, statsLoading, revenueData, revenueLoading, isAdmin, onNavigate }: {
  stats: PlatformStats | undefined; statsLoading: boolean;
  revenueData: RevenueData | undefined; revenueLoading: boolean;
  isAdmin: boolean; onNavigate: (section: SectionId) => void;
}) {
  const subMRR: number = stats?.subscriptionRevenueMRR ?? 0;
  const subBreakdown = stats?.subscriptionBreakdown ?? { listing: { count: 0, mrr: 0 }, starter: { count: 0, mrr: 0 }, standard: { count: 0, mrr: 0 }, premium: { count: 0, mrr: 0 } };
  const revenueTotals = revenueData?.totals ?? ({} as RevenueTotals);

  const { data: alerts } = useQuery<AlertsData>({
    queryKey: ["/api/admin/alerts"],
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Overview</h2>
        <p className="text-xs text-gray-400 mt-0.5">Platform-wide health at a glance</p>
      </div>

      {/* Alerts strip */}
      {alerts && (alerts.stuckOrdersCount > 0 || alerts.expiringBatchesCount > 0 || alerts.failedPaymentsCount > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Needs attention</p>
          <div className="flex items-center gap-2 flex-wrap">
            {alerts.stuckOrdersCount > 0 && (
              <button onClick={() => onNavigate("orders")} className="text-xs bg-amber-100 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium hover:bg-amber-200 transition-colors cursor-pointer">
                {alerts.stuckOrdersCount} stuck order{alerts.stuckOrdersCount !== 1 ? "s" : ""} &gt;24h → view Orders
              </button>
            )}
            {alerts.expiringBatchesCount > 0 && (
              <button onClick={() => onNavigate("products")} className="text-xs bg-orange-100 border border-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-medium hover:bg-orange-200 transition-colors cursor-pointer">
                {alerts.expiringBatchesCount} batch{alerts.expiringBatchesCount !== 1 ? "es" : ""} expiring within 7 days → view Products
              </button>
            )}
            {alerts.failedPaymentsCount > 0 && (
              <button onClick={() => onNavigate("settings")} className="text-xs bg-red-100 border border-red-200 text-red-800 px-2 py-0.5 rounded-full font-medium hover:bg-red-200 transition-colors cursor-pointer">
                {alerts.failedPaymentsCount} subscription payment failure{alerts.failedPaymentsCount !== 1 ? "s" : ""} → view Settings
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-24 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard label="Active Wholesalers"   value={stats?.activeWholesalers ?? 0}  sub={`${stats?.totalWholesalers ?? 0} total`}                          icon={<Building2 className="h-4 w-4" />}    color={GREEN}  />
          <StatCard label="Homepage Featured"    value={stats?.homepageFeaturedWholesalers ?? 0} sub="Featured on homepage"                                       icon={<Star className="h-4 w-4" />}         color={AMBER}  />
          <StatCard label="Orders Today"         value={stats?.todayOrders ?? 0}        sub={fmt(stats?.todayRevenue ?? 0) + " GMV"}                           icon={<ShoppingCart className="h-4 w-4" />}  color={AMBER}  />
          <StatCard label="Orders this Month"    value={stats?.ordersThisMonth ?? 0}    sub={`${stats?.completedOrdersThisMonth ?? 0} completed · ${stats?.cancelledOrdersThisMonth ?? 0} cancelled`} icon={<Package className="h-4 w-4" />} color={BLUE} />
          <StatCard label="Total Orders (All-time)" value={formatNumber(stats?.totalOrders ?? 0)} sub={`${stats?.completedOrders ?? 0} completed · ${stats?.cancelledOrders ?? 0} cancelled`} icon={<ShoppingCart className="h-4 w-4" />} color={BLUE} />
          <StatCard label="All-time GMV"         value={fmt(stats?.totalGMV ?? 0)}      sub="Gross Merchandise Value"                                           icon={<TrendingUp className="h-4 w-4" />}    color={PURPLE} />
          <StatCard label="Sub. MRR"             value={fmt(subMRR)}                    sub="Monthly recurring"                                                 icon={<DollarSign className="h-4 w-4" />}    color={GREEN}  />
          <StatCard label="Failed Payments (30d)" value={alerts?.failedPaymentsCount ?? 0} sub={alerts?.failedPaymentsCount ? "Needs follow-up" : "No failures"} icon={<AlertCircle className="h-4 w-4" />} color={alerts?.failedPaymentsCount ? RED : GREEN} />
        </div>
      )}

      {/* Plan breakdown + revenue */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 p-4 text-center bg-gray-50">
          <p className="text-2xl font-bold text-gray-500">{stats?.wholesalersByPlan?.listing || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Listing</p>
        </div>
        <div className="rounded-xl border border-blue-100 p-4 text-center bg-blue-50">
          <p className="text-2xl font-bold text-blue-700">{stats?.wholesalersByPlan?.starter || 0}</p>
          <p className="text-xs text-blue-600 mt-1">Starter</p>
        </div>
        <div className="rounded-xl border border-emerald-100 p-4 text-center bg-emerald-50">
          <p className="text-2xl font-bold text-emerald-700">{stats?.wholesalersByPlan?.standard || 0}</p>
          <p className="text-xs text-emerald-600 mt-1">Standard</p>
        </div>
        <div className="rounded-xl border border-purple-100 p-4 text-center bg-purple-50">
          <p className="text-2xl font-bold text-purple-700">{stats?.wholesalersByPlan?.premium || 0}</p>
          <p className="text-xs text-purple-600 mt-1">Premium</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-gray-200 shadow-none rounded-xl">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">This Month</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-2.5">
            <Row label="New wholesalers joined" value={stats?.newWholesalersThisMonth || 0} />
            <Row label="Orders placed"          value={stats?.ordersThisMonth || 0} />
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-none rounded-xl">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Revenue (all-time)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-2.5">
            <Row label="Buyer fees"     value={revenueLoading ? "—" : fmt(revenueTotals.totalCustomerFees)}  color={BLUE} />
            <Row label="Merchant fees"  value={revenueLoading ? "—" : fmt(revenueTotals.totalPlatformFees)}  color={AMBER} />
            <Row label="Subscription revenue" value={revenueLoading ? "—" : fmt(revenueTotals.totalSubscriptionRevenue ?? 0)} color={PURPLE} />
            {!revenueLoading && ((revenueTotals.totalDiscountGiven ?? 0) > 0 || (revenueTotals.totalPromoLoss ?? 0) > 0) && (
              <div className="flex items-center justify-between">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm text-amber-600 flex items-center gap-1 cursor-default">
                        Discounts given
                        <Info className="h-3.5 w-3.5 opacity-50" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs space-y-1">
                      {(revenueTotals.totalDiscountGiven ?? 0) > 0 && (
                        <p>Manual invoice discounts: -{fmt(revenueTotals.totalDiscountGiven)}</p>
                      )}
                      {(revenueTotals.totalPromoLoss ?? 0) > 0 && (
                        <p>Promotional offer losses: -{fmt(revenueTotals.totalPromoLoss)}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="text-sm text-amber-600">-{fmt((revenueTotals.totalDiscountGiven ?? 0) + (revenueTotals.totalPromoLoss ?? 0))}</span>
              </div>
            )}
            <div className="pt-1.5 border-t border-gray-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`text-sm font-bold ${GREEN} flex items-center gap-1 cursor-default`}>
                        Gross profit
                        <Info className="h-3.5 w-3.5 opacity-50" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                      After estimated Stripe processing fees (est. 1.4% + £0.20/transaction)
                      {!revenueLoading && revenueTotals.totalStripeProcessingFees
                        ? ` — approx. ${fmt(revenueTotals.totalStripeProcessingFees)} deducted`
                        : ""}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className={`text-sm font-bold ${GREEN}`}>{revenueLoading ? "—" : fmt(revenueTotals.totalGrossProfit || 0)}</span>
              </div>
              <Row label="Total earned (profit + sub revenue)" value={revenueLoading ? "—" : fmt((revenueTotals.totalGrossProfit || 0) + (revenueTotals.totalSubscriptionRevenue ?? 0))} color={GREEN} bold />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription breakdown */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Subscription Revenue</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-xl border p-3 bg-gray-50 border-gray-200">
              <p className="text-xs text-gray-500 font-medium mb-1">Listing</p>
              <p className="text-lg font-bold text-gray-600">{subBreakdown.listing?.count ?? 0} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs text-gray-400 mt-0.5">{fmt(subBreakdown.listing?.mrr ?? 0)}/mo</p>
            </div>
            <div className="rounded-xl border p-3 bg-blue-50 border-blue-100">
              <p className="text-xs text-blue-600 font-medium mb-1">Starter</p>
              <p className="text-lg font-bold text-blue-700">{subBreakdown.starter?.count ?? 0} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs text-blue-500 mt-0.5">{fmt(subBreakdown.starter?.mrr ?? 0)}/mo</p>
            </div>
            <div className="rounded-xl border p-3 bg-emerald-50 border-emerald-100">
              <p className="text-xs text-emerald-600 font-medium mb-1">Standard</p>
              <p className="text-lg font-bold text-emerald-700">{subBreakdown.standard.count} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs text-emerald-500 mt-0.5">{fmt(subBreakdown.standard.mrr)}/mo</p>
            </div>
            <div className="rounded-xl border p-3 bg-purple-50 border-purple-100">
              <p className="text-xs text-purple-600 font-medium mb-1">Premium</p>
              <p className="text-lg font-bold text-purple-700">{subBreakdown.premium.count} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs text-purple-500 mt-0.5">{fmt(subBreakdown.premium.mrr)}/mo</p>
            </div>
            <div className="rounded-xl border p-3 bg-gray-900 border-gray-800 col-span-2 sm:col-span-1">
              <p className="text-xs text-gray-400 font-medium mb-1">Total MRR</p>
              <p className="text-lg font-bold text-white">{fmt(subMRR)}<span className="text-sm font-normal">/mo</span></p>
              <p className="text-xs text-gray-400 mt-0.5">{fmt(subMRR * 12)}/yr est.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
