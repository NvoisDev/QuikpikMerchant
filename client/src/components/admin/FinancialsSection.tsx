import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Calendar, TrendingUp, DollarSign, CreditCard, Users, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { formatNumber } from "@/lib/currencies";
import {
  GREEN, BLUE, AMBER, PURPLE, RED, fmt, pct, StatCard, PRESETS, presetToDates, planBadge,
} from "./shared";
import type { Preset } from "./shared";
import type {
  RevenueData, RevenueOrder, RevenueTotals, WholesalerRow,
  WholesalerRevenueSummary, PayoutStatusData,
} from "./types";

export function FinancialsSection({ wholesalers, isAdmin }: { wholesalers: WholesalerRow[]; isAdmin: boolean }) {
  const [preset, setPreset] = useState<Preset>("all_time");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [wholesalerFilter, setWholesalerFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const { toast } = useToast();

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/subscriptions/backfill-stripe"),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({
        title: "Backfill complete",
        description: `${data.inserted} new payment${data.inserted !== 1 ? "s" : ""} inserted, ${data.skipped} already existed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
    },
    onError: () => {
      toast({ title: "Backfill failed", description: "Could not fetch historical payments from Stripe.", variant: "destructive" });
    },
  });

  const dateRange = useMemo(() => {
    if (customFrom || customTo) return { from: customFrom || undefined, to: customTo || undefined };
    return presetToDates(preset) ?? {};
  }, [preset, customFrom, customTo]);

  const revenueParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dateRange.from) p.set("from", dateRange.from);
    if (dateRange.to) p.set("to", dateRange.to);
    if (wholesalerFilter) p.set("wholesalerId", wholesalerFilter);
    return p.toString();
  }, [dateRange, wholesalerFilter]);

  const { data: revenueData, isLoading } = useQuery<RevenueData>({
    queryKey: ["/api/admin/revenue", revenueParams],
    queryFn: async () => {
      const url = `/api/admin/revenue${revenueParams ? `?${revenueParams}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      return r.json() as Promise<RevenueData>;
    },
    enabled: isAdmin,
  });

  const { data: payoutStatus } = useQuery<PayoutStatusData>({
    queryKey: ["/api/admin/payout-status", revenueParams],
    queryFn: async () => {
      const url = `/api/admin/payout-status${revenueParams ? `?${revenueParams}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      return r.json() as Promise<PayoutStatusData>;
    },
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const revenueOrders: RevenueOrder[] = revenueData?.orders ?? [];
  const revenueTotals: RevenueTotals = revenueData?.totals ?? { totalCustomerFees: 0, totalPlatformFees: 0, totalGrossRevenue: 0, totalGMV: 0, totalStripeProcessingFees: 0, totalGrossProfit: 0, grossMarginPct: 0, totalSubscriptionRevenue: 0, subscriptionPaymentCount: 0 };

  const orderCount = revenueOrders.length;
  const avgBuyerFee = orderCount > 0 ? revenueTotals.totalCustomerFees / orderCount : null;
  const avgMerchantFee = orderCount > 0 ? revenueTotals.totalPlatformFees / orderCount : null;

  const totalSubRevenue = revenueTotals.totalSubscriptionRevenue ?? 0;
  const subPayCount = revenueTotals.subscriptionPaymentCount ?? 0;
  const subSub = subPayCount > 0
    ? `${subPayCount} payment${subPayCount !== 1 ? 's' : ''} in period`
    : "No payments in period";

  const subRevenueByWholesaler = revenueData?.subRevenueByWholesaler ?? {};

  const wholesalerRevenueSummary = useMemo(() => {
    const map: Record<string, WholesalerRevenueSummary> = {};
    for (const o of revenueOrders) {
      if (o.status === "cancelled") continue;
      const key = o.wholesalerId ?? "unknown";
      if (!map[key]) map[key] = { name: o.wholesalerName ?? "Unknown", tier: "", orders: 0, gmv: 0, buyerFees: 0, merchantFees: 0, total: 0, stripeFees: 0, grossProfit: 0, subRevenue: 0 };
      map[key].orders++;
      map[key].gmv += Number(o.subtotal || 0);
      map[key].buyerFees += Number(o.customerTransactionFee || 0);
      map[key].merchantFees += Number(o.platformFee || 0);
      map[key].total += Number(o.customerTransactionFee || 0) + Number(o.platformFee || 0);
      map[key].stripeFees += Number(o.stripeProcessingFee || 0);
      map[key].grossProfit += Number(o.grossProfit || 0);
    }
    for (const w of wholesalers) {
      if (map[w.id]) {
        map[w.id]!.tier = w.subscriptionTier || "free";
        map[w.id]!.subRevenue = subRevenueByWholesaler[w.id] ?? 0;
      }
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [revenueOrders, wholesalers, subRevenueByWholesaler]);

  const paged = revenueOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(revenueOrders.length / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Financials</h2>
          <p className="text-xs text-gray-400">Revenue breakdown across all wholesalers</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-gray-200 flex items-center gap-1.5 flex-shrink-0"
          disabled={backfillMutation.isPending}
          onClick={() => backfillMutation.mutate()}
        >
          <RefreshCw className={`h-3 w-3 ${backfillMutation.isPending ? "animate-spin" : ""}`} />
          {backfillMutation.isPending ? "Backfilling…" : "Backfill Stripe payments"}
        </Button>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => { setPreset(p.id); setCustomFrom(""); setCustomTo(""); setPage(1); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${preset === p.id && !customFrom && !customTo ? "text-white border-transparent" : "text-gray-500 border-gray-200 hover:border-gray-300 bg-white"}`}
              style={preset === p.id && !customFrom && !customTo ? { background: GREEN } : {}}>
              {p.label}
            </button>
          ))}
          <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPreset("all_time"); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none" />
          <span className="text-xs text-gray-400">–</span>
          <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPreset("all_time"); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none" />
          <select value={wholesalerFilter} onChange={e => { setWholesalerFilter(e.target.value); setPage(1); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none bg-white">
            <option value="">All wholesalers</option>
            {wholesalers.map(w => <option key={w.id} value={w.id}>{w.businessName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`}</option>)}
          </select>
        </div>
      </div>

      {/* Stripe payout status card */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <CreditCard className="h-4 w-4 text-gray-400" />Stripe Platform Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Available (GBP)</p>
              <p className="text-xl font-bold text-gray-900">{payoutStatus ? fmt(payoutStatus.available) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Pending</p>
              <p className="text-xl font-bold text-gray-700">{payoutStatus ? fmt(payoutStatus.pending) : "—"}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              {payoutStatus?.hasPeriodFilter ? (
                <>
                  <p className="text-xs text-gray-500 mb-1">Payouts in period</p>
                  {payoutStatus.periodPayoutCount > 0 ? (
                    <div className="space-y-1">
                      <div>
                        <p className="text-xl font-bold text-gray-900">{fmt(payoutStatus.periodPayoutTotal)}</p>
                        <p className="text-xs text-gray-400">{payoutStatus.periodPayoutCount} payout{payoutStatus.periodPayoutCount !== 1 ? "s" : ""} in period</p>
                      </div>
                      <div className="mt-2 space-y-1">
                        {payoutStatus.periodPayouts.map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                            <span className="font-medium">{fmt(p.amount)}</span>
                            <span className={`capitalize px-1.5 py-0.5 rounded text-[10px] font-medium ${p.status === "paid" ? "bg-green-100 text-green-700" : p.status === "in_transit" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-600"}`}>{p.status.replace(/_/g, " ")}</span>
                            <span className="text-gray-400">{new Date(p.arrivalDate).toLocaleDateString("en-GB")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xl font-bold text-gray-400">—</p>
                      <p className="text-xs text-gray-400">No payouts in period</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-0.5">Last Payout</p>
                  {payoutStatus?.lastPayout ? (
                    <div>
                      <p className="text-sm font-bold text-gray-700">{fmt(payoutStatus.lastPayout.amount)}</p>
                      <p className="text-xs text-gray-400 capitalize">{payoutStatus.lastPayout.status} · {new Date(payoutStatus.lastPayout.arrivalDate).toLocaleDateString("en-GB")}</p>
                    </div>
                  ) : <p className="text-sm text-gray-400">No payouts yet</p>}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Buyer Fees"        value={isLoading ? "…" : fmt(revenueTotals.totalCustomerFees)}  sub={avgBuyerFee != null ? `Avg. ${fmt(avgBuyerFee)} per order` : "—"} icon={<TrendingUp className="h-4 w-4" />} color={BLUE} />
        <StatCard label="Merchant Fees"     value={isLoading ? "…" : fmt(revenueTotals.totalPlatformFees)}  sub={avgMerchantFee != null ? `Avg. ${fmt(avgMerchantFee)} per order` : "—"} icon={<TrendingUp className="h-4 w-4" />} color={AMBER} />
        <StatCard label="Order Revenue"     value={isLoading ? "…" : fmt(revenueTotals.totalGrossRevenue)}  sub="Buyer + merchant fees"  icon={<TrendingUp className="h-4 w-4" />} color={GREEN} />
        <StatCard label="Period GMV"        value={isLoading ? "…" : fmt(revenueTotals.totalGMV)}           sub="Gross merchandise value" icon={<DollarSign className="h-4 w-4" />} color={PURPLE} />
        <StatCard label="Subscriptions"      value={isLoading ? "…" : fmt(totalSubRevenue)}               sub={subSub}                  icon={<Users className="h-4 w-4" />}    color="#4f46e5" />
      </div>

      {/* Gross profit cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Stripe Fees"  value={isLoading ? "…" : fmt(revenueTotals.totalStripeProcessingFees)}  sub="Actual · est. 1.4%+£0.20 fallback"  icon={<CreditCard className="h-4 w-4" />}  color={RED} />
        <StatCard label="Gross Profit"         value={isLoading ? "…" : fmt(revenueTotals.totalGrossProfit)}           sub="Revenue minus Stripe fees" icon={<TrendingUp className="h-4 w-4" />}  color={GREEN} />
        <StatCard label="Gross Margin"         value={isLoading ? "…" : `${revenueTotals.grossMarginPct ?? 0}%`}       sub="Profit / order revenue"    icon={<TrendingUp className="h-4 w-4" />}  color={PURPLE} />
      </div>

      {/* Take rate */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardContent className="px-4 py-3 flex flex-wrap gap-6">
          <div><p className="text-xs text-gray-400">Overall Take Rate</p><p className="text-sm font-bold text-indigo-600">{pct(revenueTotals.totalGrossRevenue || 0, revenueTotals.totalGMV || 0)}</p></div>
          <div><p className="text-xs text-gray-400">Orders in period</p><p className="text-sm font-bold text-gray-800">{formatNumber(revenueOrders.length)}</p></div>
          <div><p className="text-xs text-gray-400">Avg. order value</p><p className="text-sm font-bold text-gray-800">{revenueOrders.length > 0 ? fmt((revenueTotals.totalGMV || 0) / revenueOrders.length) : "—"}</p></div>
        </CardContent>
      </Card>

      {/* By wholesaler */}
      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">Fees by Wholesaler</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-blue-50">
                  {["Wholesaler","Plan","Orders","GMV","Buyer Fees","Merchant Fees","Total Earned","Sub Revenue","Stripe Fees","Gross Profit","Take Rate"].map((h, i) => (
                    <TableHead key={i} className={`text-xs font-semibold text-blue-700${[1,2,3,4,5,7,8,9,10].includes(i) ? " hidden sm:table-cell" : ""}`}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {wholesalerRevenueSummary.map((w, i) => (
                  <TableRow key={i} className="hover:bg-blue-50/30">
                    <TableCell className="text-xs font-medium text-gray-800">{w.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{planBadge(w.tier)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-right text-gray-600">{w.orders}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-right text-gray-600">{fmt(w.gmv)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-right font-medium" style={{ color: BLUE }}>{fmt(w.buyerFees)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-right font-medium" style={{ color: AMBER }}>{fmt(w.merchantFees)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(w.total)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-right font-medium" style={{ color: "#4f46e5" }}>{w.subRevenue > 0 ? fmt(w.subRevenue) : "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-right font-medium" style={{ color: RED }}>-{fmt(w.stripeFees)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-right font-semibold" style={{ color: GREEN }}>{fmt(w.grossProfit)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-right font-medium text-indigo-600">{pct(w.total, w.gmv)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Per-order breakdown */}
      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">Per-Order Breakdown ({revenueOrders.length} orders)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-gray-400">Loading...</div> : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-blue-50">
                      {["Order #","Wholesaler","Customer","GMV","Buyer Fee","Merchant Fee","Total","Stripe Fee","Gross Profit","Take Rate","Date"].map((h, i) => (
                        <TableHead key={i} className={`text-xs font-semibold text-blue-700${[1,2,4,5,7,8,9,10].includes(i) ? " hidden sm:table-cell" : ""}`}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map(o => (
                      <TableRow key={o.id} className="hover:bg-blue-50/30">
                        <TableCell className="font-mono text-xs text-gray-500">{o.orderNumber}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-gray-700">{o.wholesalerName ?? "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-gray-600">{o.customerName ?? "—"}</TableCell>
                        <TableCell className="text-xs text-right text-gray-600">{fmt(parseFloat(o.subtotal || "0"))}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-right font-medium" style={{ color: BLUE }}>{fmt(parseFloat(o.customerTransactionFee || "0"))}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-right font-medium" style={{ color: AMBER }}>{fmt(parseFloat(o.platformFee || "0"))}</TableCell>
                        <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(o.totalQuikpikIncome)}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-right font-medium" style={{ color: RED }}>
                          -{fmt(o.stripeProcessingFee ?? 0)}{o.stripeFeIsEstimated && <span className="text-gray-400 font-normal ml-0.5">(est.)</span>}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-right font-semibold" style={{ color: GREEN }}>{fmt(o.grossProfit ?? 0)}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-right font-medium text-indigo-600">{pct(o.totalQuikpikIncome, parseFloat(o.subtotal || "0"))}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-gray-400">{o.createdAt ? format(new Date(o.createdAt), "dd MMM yy") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">Page {page} of {totalPages} ({revenueOrders.length} orders)</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
