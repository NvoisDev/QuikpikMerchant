import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Calendar, ChevronRight, ChevronDown, Mail } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { GREEN, fmt, pct, PRESETS, presetToDates } from "./shared";
import type { Preset } from "./shared";
import type { RevenueData, RevenueOrder, RevenueTotals, WholesalerRow, AdminOrderItem } from "./types";

export function fmtPackAdmin(quantityInPack: string | null | undefined, unitSize: string | null | undefined, unitOfMeasure: string | null | undefined): string {
  const qty = quantityInPack ? parseInt(quantityInPack) : null;
  if (!qty || qty <= 1) return '';
  const size = unitSize || '';
  const uom = unitOfMeasure || '';
  return size ? `${qty} × ${size}${uom}` : `${qty} units`;
}

export function OrderItemsPanel({ orderId }: { orderId: number }) {
  const { data, isLoading } = useQuery<{ items: AdminOrderItem[] }>({
    queryKey: ["/api/admin/orders", orderId, "items"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/orders/${orderId}/items`, { credentials: "include" });
      return r.json() as Promise<{ items: AdminOrderItem[] }>;
    },
  });
  if (isLoading) return <div className="px-4 py-3 text-xs text-gray-400">Loading items…</div>;
  const items = data?.items ?? [];
  if (!items.length) return <div className="px-4 py-3 text-xs text-gray-400">No items found.</div>;
  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-1.5">
      {items.map((item, i) => {
        const packDesc = fmtPackAdmin(item.quantityInPack, item.unitSize, item.unitOfMeasure);
        const sellingType = item.sellingType || 'units';
        const unitPrice = parseFloat(item.unitPrice || '0');
        const total = parseFloat(item.total || '0');
        return (
          <div key={item.id ?? i} className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-xs text-gray-700 font-medium">{item.productName || 'Product'}</span>
              {packDesc && <span className="ml-1.5 text-xs text-gray-400">({packDesc})</span>}
              {item.appliedOfferLabel && (
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-100">{item.appliedOfferLabel}</span>
              )}
              <span className="ml-2 text-xs text-gray-400">{item.quantity} {sellingType} × £{unitPrice.toFixed(2)}</span>
            </div>
            <span className="text-xs font-medium text-gray-700 flex-shrink-0">£{total.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function OrdersSection({ revenueData, revenueLoading, wholesalers, isAdmin, highlightedId }: {
  revenueData: RevenueData | undefined; revenueLoading: boolean;
  wholesalers: WholesalerRow[]; isAdmin: boolean; highlightedId?: number;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [wholesalerFilter, setWholesalerFilter] = useState("");
  const [preset, setPreset] = useState<Preset>("all_time");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const PAGE_SIZE = 25;

  const dateRange = useMemo(() => {
    if (customFrom || customTo) return { from: customFrom || undefined, to: customTo || undefined };
    return presetToDates(preset) || {};
  }, [preset, customFrom, customTo]);

  const revenueParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dateRange.from) p.set("from", dateRange.from);
    if (dateRange.to) p.set("to", dateRange.to);
    if (wholesalerFilter) p.set("wholesalerId", wholesalerFilter);
    return p.toString();
  }, [dateRange, wholesalerFilter]);

  const { data: orderData, isLoading: ordersLoading } = useQuery<{ orders: RevenueOrder[]; totals: RevenueTotals }>({
    queryKey: ["/api/admin/revenue", revenueParams],
    queryFn: async () => {
      const url = `/api/admin/revenue${revenueParams ? `?${revenueParams}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      return r.json() as Promise<{ orders: RevenueOrder[]; totals: RevenueTotals }>;
    },
    enabled: isAdmin,
  });

  const resendInvoice = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/orders/${id}/resend-invoice`),
    onSuccess: () => toast({ title: "Invoice resent successfully" }),
    onError: () => toast({ title: "Failed to resend invoice", variant: "destructive" }),
  });

  const allOrders: RevenueOrder[] = orderData?.orders ?? [];

  // Scroll to and highlight order when navigated from global search
  useEffect(() => {
    if (!highlightedId || !allOrders.length) return;
    const idx = allOrders.findIndex(o => o.id === highlightedId);
    if (idx !== -1) {
      setSearch("");
      setStatusFilter("");
      const targetPage = Math.ceil((idx + 1) / PAGE_SIZE);
      setPage(targetPage);
      setTimeout(() => {
        const el = document.getElementById(`record-order-${highlightedId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [highlightedId, allOrders.length]);

  const filtered = useMemo(() => {
    let list = allOrders;
    if (statusFilter) list = list.filter(o => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.orderNumber || "").toLowerCase().includes(q) ||
        (o.wholesalerName || "").toLowerCase().includes(q) ||
        (o.customerName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allOrders, statusFilter, search]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const uniqueStatuses = useMemo(() => Array.from(new Set(allOrders.map(o => o.status).filter(Boolean))), [allOrders]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">All Orders</h2>
        <p className="text-xs text-gray-400">Platform-wide order management</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => { setPreset(p.id); setCustomFrom(""); setCustomTo(""); setPage(1); }}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${preset === p.id && !customFrom && !customTo ? "text-white border-transparent" : "text-gray-500 border-gray-200 hover:border-gray-300 bg-white"}`}
                style={preset === p.id && !customFrom && !customTo ? { background: GREEN } : {}}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPreset("all_time"); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400" />
          <span className="text-xs text-gray-400">–</span>
          <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPreset("all_time"); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input placeholder="Search orders…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-8 h-7 text-xs border-gray-200" />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400 bg-white">
            <option value="">All statuses</option>
            {uniqueStatuses.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <select value={wholesalerFilter} onChange={e => { setWholesalerFilter(e.target.value); setPage(1); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400 bg-white">
            <option value="">All wholesalers</option>
            {wholesalers.map(w => <option key={w.id} value={w.id}>{w.businessName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`}</option>)}
          </select>
        </div>
      </div>

      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">
            {ordersLoading ? "Loading…" : `${filtered.length} order${filtered.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ordersLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No orders found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-amber-50">
                      {["Order #","Wholesaler","Customer","GMV","Take Rate","Status","Payment","Date",""].map((h, i) => (
                        <TableHead key={i} className="text-xs font-semibold text-amber-700">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map(o => {
                      const isExpanded = expandedOrderId === o.id;
                      return (
                        <Fragment key={o.id}>
                          <TableRow id={`record-order-${o.id}`}
                            className={`hover:bg-amber-50/30 cursor-pointer ${highlightedId === o.id ? "ring-2 ring-inset ring-amber-400 bg-amber-50/40" : ""}`}
                            onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}>
                            <TableCell className="font-mono text-xs text-gray-500">
                              <span className="inline-flex items-center gap-1">
                                {isExpanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-300" />}
                                {o.orderNumber}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-gray-700">{o.wholesalerName ?? "—"}</TableCell>
                            <TableCell className="text-xs text-gray-600">{o.customerName ?? "—"}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-gray-700">{o.status === "cancelled" ? <span className="text-gray-400">£0.00</span> : fmt(parseFloat(o.subtotal || "0"))}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-indigo-600">{o.status === "cancelled" ? <span className="text-gray-400">—</span> : pct(o.totalQuikpikIncome, parseFloat(o.subtotal || "0"))}</TableCell>
                            <TableCell>
                              <span className="text-xs text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">{(o.status || "pending").replace(/_/g, " ")}</span>
                            </TableCell>
                            <TableCell>
                              {o.paymentStatus === "paid" && (o.refundedAt || (parseFloat(o.refundAmount || '0') > 0))
                                ? <span className="text-xs px-1.5 py-0.5 rounded border bg-purple-50 border-purple-200 text-purple-700">refunded</span>
                                : o.paymentStatus === "paid"
                                  ? <span className="text-xs px-1.5 py-0.5 rounded border bg-[#f0faf4] border-[#bbdfc8]" style={{ color: GREEN }}>paid</span>
                                  : <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">{o.paymentStatus || "pending"}</span>
                              }
                            </TableCell>
                            <TableCell className="text-xs text-gray-400">{o.createdAt ? format(new Date(o.createdAt), "dd MMM yy") : "—"}</TableCell>
                            <TableCell onClick={e => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-400 hover:text-blue-600" title="Resend invoice"
                                onClick={() => resendInvoice.mutate(String(o.id))} disabled={resendInvoice.isPending}>
                                <Mail className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <tr key={`items-${o.id}`}>
                              <td colSpan={9} className="p-0">
                                <OrderItemsPanel orderId={o.id} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">Page {page} of {totalPages} ({filtered.length} orders)</span>
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
