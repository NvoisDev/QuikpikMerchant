import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, ShoppingCart, Package, TrendingUp, DollarSign, AlertTriangle, Star, Info,
  TrendingDown, Minus,
} from "lucide-react";
import { formatNumber } from "@/lib/currencies";
import {
  GREEN, BLUE, AMBER, PURPLE, fmt, StatCard, Row,
} from "./shared";
import type { PlatformStats, RevenueData, RevenueTotals, SectionId } from "./types";

export function OverviewSection({ stats, statsLoading, revenueData, revenueLoading, isAdmin, onNavigate }: {
  stats: PlatformStats | undefined; statsLoading: boolean;
  revenueData: RevenueData | undefined; revenueLoading: boolean;
  isAdmin: boolean; onNavigate: (section: SectionId) => void;
}) {
  const subMRR: number = stats?.subscriptionRevenueMRR ?? 0;
  const subBreakdown = stats?.subscriptionBreakdown ?? { listing: { count: 0, mrr: 0, collected: 0 }, starter: { count: 0, mrr: 0, collected: 0 }, standard: { count: 0, mrr: 0, collected: 0 }, premium: { count: 0, mrr: 0, collected: 0 } };
  const revenueTotals = revenueData?.totals ?? ({} as RevenueTotals);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Overview</h2>
        <p className="text-xs text-gray-400 mt-0.5">Platform-wide health at a glance</p>
      </div>

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
            {!revenueLoading && (revenueTotals.totalSubscriptionDiscount ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm text-amber-600 flex items-center gap-1 cursor-default">
                        Subscription discounts
                        <Info className="h-3.5 w-3.5 opacity-50" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-xs">
                      Subscribers who paid less than the plan list price (e.g. a Stripe coupon was applied).
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="text-sm text-amber-600">-{fmt(revenueTotals.totalSubscriptionDiscount)}</span>
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

      {/* Unmatched invoices warning */}
      {!statsLoading && stats?.unmatchedInvoices && stats.unmatchedInvoices.count > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-orange-700">Unmatched subscription payments</p>
            <p className="text-xs text-orange-600 mt-0.5">
              {stats.unmatchedInvoices.count} paid invoice{stats.unmatchedInvoices.count !== 1 ? "s" : ""} totalling{" "}
              <span className="font-semibold">{fmt(stats.unmatchedInvoices.total)}</span> could not be attributed to a plan tier.
              The price ID on these invoices doesn't match any entry in the subscription plans table — they may be custom charges or invoices for a deleted plan.
            </p>
          </div>
        </div>
      )}

      {/* Subscription breakdown */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Subscription Revenue</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-xl border p-3 bg-gray-50 border-gray-200">
              <p className="text-xs text-gray-500 font-medium mb-1">Listing</p>
              <p className="text-lg font-bold text-gray-600">{subBreakdown.listing?.count ?? 0} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs text-gray-400 mt-0.5">{fmt(subBreakdown.listing?.mrr ?? 0)}/mo</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{fmt(subBreakdown.listing?.collected ?? 0)} collected</p>
            </div>
            <div className="rounded-xl border p-3 bg-blue-50 border-blue-100">
              <p className="text-xs text-blue-600 font-medium mb-1">Starter</p>
              <p className="text-lg font-bold text-blue-700">{subBreakdown.starter?.count ?? 0} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs text-blue-500 mt-0.5">{fmt(subBreakdown.starter?.mrr ?? 0)}/mo</p>
              <p className="text-xs text-blue-600 mt-1 font-medium">{fmt(subBreakdown.starter?.collected ?? 0)} collected</p>
            </div>
            <div className="rounded-xl border p-3 bg-emerald-50 border-emerald-100">
              <p className="text-xs text-emerald-600 font-medium mb-1">Standard</p>
              <p className="text-lg font-bold text-emerald-700">{subBreakdown.standard.count} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs text-emerald-500 mt-0.5">{fmt(subBreakdown.standard.mrr)}/mo</p>
              <p className="text-xs text-emerald-600 mt-1 font-medium">{fmt(subBreakdown.standard.collected ?? 0)} collected</p>
            </div>
            <div className="rounded-xl border p-3 bg-purple-50 border-purple-100">
              <p className="text-xs text-purple-600 font-medium mb-1">Premium</p>
              <p className="text-lg font-bold text-purple-700">{subBreakdown.premium.count} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs text-purple-500 mt-0.5">{fmt(subBreakdown.premium.mrr)}/mo</p>
              <p className="text-xs text-purple-600 mt-1 font-medium">{fmt(subBreakdown.premium.collected ?? 0)} collected</p>
            </div>
            <div className="rounded-xl border p-3 bg-gray-900 border-gray-800 col-span-2 sm:col-span-1">
              <p className="text-xs text-gray-400 font-medium mb-1">Total MRR</p>
              <p className="text-lg font-bold text-white">{fmt(subMRR)}<span className="text-sm font-normal">/mo</span></p>
              <p className="text-xs text-gray-400 mt-0.5">{fmt(subMRR * 12)}/yr est.</p>
              <p className="text-xs text-gray-300 mt-1 font-medium">{fmt((subBreakdown.listing?.collected ?? 0) + (subBreakdown.starter?.collected ?? 0) + (subBreakdown.standard.collected ?? 0) + (subBreakdown.premium.collected ?? 0))} total</p>
            </div>
          </div>

          {/* Monthly collected breakdown table */}
          <SubscriptionMonthlyTable rows={stats?.subscriptionMonthlyBreakdown ?? []} loading={statsLoading} />
        </CardContent>
      </Card>
    </div>
  );
}

type RangeOption = "3" | "6" | "12" | "all";

function SubscriptionMonthlyTable({ rows, loading }: { rows: Array<{ month: string; listing: number; starter: number; standard: number; premium: number; total: number }>; loading: boolean }) {
  const [range, setRange] = useState<RangeOption>("all");

  const fmtMonth = (ym: string) => {
    const [y, m] = ym.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };

  if (loading) {
    return <div className="h-24 animate-pulse bg-gray-50 rounded-lg" />;
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="text-xs text-gray-400 text-center py-3">No subscription payments recorded yet.</p>
    );
  }

  const filteredRows = (() => {
    if (range === "all") return rows;
    const n = Number(range);
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
    return rows.filter(r => r.month >= cutoffStr);
  })();

  const maxTotal = Math.max(...filteredRows.map(r => r.total), 1);

  const getTrend = (month: string, currTotal: number): { pct: number | null; dir: "up" | "down" | "flat" } => {
    const idx = rows.findIndex(r => r.month === month);
    const priorRow = rows[idx + 1];
    if (!priorRow) return { pct: null, dir: "flat" };
    const prev = priorRow.total;
    if (prev === 0) return { pct: null, dir: "flat" };
    const pct = ((currTotal - prev) / prev) * 100;
    if (Math.abs(pct) < 0.05) return { pct: 0, dir: "flat" };
    return { pct, dir: pct > 0 ? "up" : "down" };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500">Monthly Collected (by tier)</p>
        <Select value={range} onValueChange={(v) => setRange(v as RangeOption)}>
          <SelectTrigger className="h-6 text-xs w-36 border-gray-200 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {filteredRows.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">No data for the selected period.</p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left pb-1.5 font-medium text-gray-400 pr-3 w-20">Month</th>
              <th className="text-right pb-1.5 font-medium text-gray-400 px-2">Listing</th>
              <th className="text-right pb-1.5 font-medium text-blue-400 px-2">Starter</th>
              <th className="text-right pb-1.5 font-medium text-emerald-500 px-2">Standard</th>
              <th className="text-right pb-1.5 font-medium text-purple-500 px-2">Premium</th>
              <th className="text-right pb-1.5 font-medium text-gray-700 pl-2">Total</th>
              <th className="pl-3 pb-1.5 w-24 hidden sm:table-cell"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredRows.map(r => {
              const trend = getTrend(r.month, r.total);
              return (
                <tr key={r.month} className="hover:bg-gray-50/60 transition-colors">
                  <td className="py-1.5 pr-3 font-medium text-gray-600 whitespace-nowrap">{fmtMonth(r.month)}</td>
                  <td className="py-1.5 px-2 text-right text-gray-400">{r.listing > 0 ? fmt(r.listing) : <span className="text-gray-200">—</span>}</td>
                  <td className="py-1.5 px-2 text-right text-blue-600">{r.starter > 0 ? fmt(r.starter) : <span className="text-gray-200">—</span>}</td>
                  <td className="py-1.5 px-2 text-right text-emerald-600">{r.standard > 0 ? fmt(r.standard) : <span className="text-gray-200">—</span>}</td>
                  <td className="py-1.5 px-2 text-right text-purple-600">{r.premium > 0 ? fmt(r.premium) : <span className="text-gray-200">—</span>}</td>
                  <td className="py-1.5 pl-2 text-right font-semibold text-gray-800 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 justify-end">
                      {fmt(r.total)}
                      {trend.dir === "up" && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium">
                          <TrendingUp className="h-3 w-3" />
                          <span>{trend.pct!.toFixed(1)}%</span>
                        </span>
                      )}
                      {trend.dir === "down" && (
                        <span className="inline-flex items-center gap-0.5 text-red-500 font-medium">
                          <TrendingDown className="h-3 w-3" />
                          <span>{Math.abs(trend.pct!).toFixed(1)}%</span>
                        </span>
                      )}
                      {trend.dir === "flat" && trend.pct !== null && (
                        <span className="inline-flex items-center text-gray-400">
                          <Minus className="h-3 w-3" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 pl-3 hidden sm:table-cell">
                    <div className="flex items-center">
                      <div
                        className="h-1.5 rounded-full bg-emerald-400"
                        style={{ width: `${Math.round((r.total / maxTotal) * 96)}px`, minWidth: r.total > 0 ? "3px" : "0" }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
