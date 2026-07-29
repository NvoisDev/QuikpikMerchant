import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Package, TrendingUp, DollarSign, BarChart3, Search, ChevronUp, ChevronDown, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/hooks/useCurrency";
import { formatNumber } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface InventoryProduct {
  id: number;
  name: string;
  stock: number;
  costPrice: number;
  price: number;
  inventoryCostValue: number;
  inventorySalesValue: number;
  grossProfitValue: number;
}

interface InventorySummary {
  productsInStock: number;
  totalUnits: number;
  inventoryCostValue: number;
  potentialSalesValue: number;
  potentialGrossProfit: number;
}

interface InventoryData {
  asAt: string | null;
  summary: InventorySummary;
  products: InventoryProduct[];
}

type SortKey = "costValue_desc" | "costValue_asc" | "qty_desc" | "qty_asc" | "name_asc";
type DatePreset = "current" | "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "asAt";

function toYMD(d: Date) {
  return d.toISOString().split("T")[0];
}

function presetToAsAt(preset: DatePreset, customAsAt: string): string | undefined {
  const now = new Date();
  if (preset === "current") return undefined;
  if (preset === "today") return toYMD(now);
  if (preset === "yesterday") {
    const d = new Date(now); d.setDate(d.getDate() - 1); return toYMD(d);
  }
  if (preset === "7d") {
    const d = new Date(now); d.setDate(d.getDate() - 7); return toYMD(d);
  }
  if (preset === "30d") {
    const d = new Date(now); d.setDate(d.getDate() - 30); return toYMD(d);
  }
  if (preset === "this_month") {
    return toYMD(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  if (preset === "last_month") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return toYMD(d);
  }
  if (preset === "asAt") return customAsAt || toYMD(now);
  return undefined;
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${accent}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
          <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
          {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sort helpers ─────────────────────────────────────────────────────────────

function sortProducts(products: InventoryProduct[], sort: SortKey): InventoryProduct[] {
  return [...products].sort((a, b) => {
    switch (sort) {
      case "costValue_desc": return b.inventoryCostValue - a.inventoryCostValue;
      case "costValue_asc":  return a.inventoryCostValue - b.inventoryCostValue;
      case "qty_desc":       return b.stock - a.stock;
      case "qty_asc":        return a.stock - b.stock;
      case "name_asc":       return (a.name || "").localeCompare(b.name || "");
    }
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventorySummary() {
  const { formatMoney } = useCurrency();

  const [preset, setPreset] = useState<DatePreset>("current");
  const [customAsAt, setCustomAsAt] = useState<string>(() => toYMD(new Date()));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("costValue_desc");

  const asAt = presetToAsAt(preset, customAsAt);

  const queryUrl = asAt
    ? `/api/inventory/summary?asAt=${asAt}`
    : "/api/inventory/summary";

  const { data, isLoading, isError } = useQuery<InventoryData>({
    queryKey: ["/api/inventory/summary", asAt ?? "current"],
    queryFn: async () => {
      const r = await fetch(queryUrl, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load inventory");
      return r.json();
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const base = data?.products ?? [];
    const q = search.toLowerCase();
    const matched = q ? base.filter(p => p.name.toLowerCase().includes(q)) : base;
    return sortProducts(matched, sort);
  }, [data?.products, search, sort]);

  const s = data?.summary;

  const gpPct =
    s && s.potentialSalesValue > 0
      ? ((s.potentialGrossProfit / s.potentialSalesValue) * 100).toFixed(1)
      : null;

  function SortBtn({ id, label }: { id: SortKey; label: string }) {
    const active = sort === id;
    return (
      <button
        onClick={() => setSort(id)}
        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
          active
            ? "bg-teal-600 text-white"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Back bar */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-1 text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Button>
        </Link>
      </div>

      <div className="p-4 space-y-5">
        {/* Header + date picker */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-teal-600" />
            Inventory Summary
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {preset === "current"
              ? "Current live stock position"
              : asAt
              ? `Stock position as at ${asAt}`
              : ""}
          </p>
        </div>

        {/* Date selector */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "current",    label: "Current" },
              { id: "today",      label: "Today" },
              { id: "yesterday",  label: "Yesterday" },
              { id: "7d",         label: "Last 7 Days" },
              { id: "30d",        label: "Last 30 Days" },
              { id: "this_month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "asAt",       label: "As at Date" },
            ] as { id: DatePreset; label: string }[]
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setPreset(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                preset === id
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-700"
              }`}
            >
              {label}
            </button>
          ))}
          {preset === "asAt" && (
            <input
              type="date"
              value={customAsAt}
              max={toYMD(new Date())}
              onChange={e => setCustomAsAt(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-500"
            />
          )}
        </div>

        {/* Historical cost note */}
        {preset !== "current" && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Stock quantities reflect the position on that date. Cost and selling prices use current values.</span>
          </div>
        )}

        {/* KPI tiles */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-12 text-gray-500 text-sm">Could not load inventory data.</div>
        ) : s ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiTile label="Products in Stock" value={formatNumber(s.productsInStock)} icon={Package} accent="bg-teal-600" />
            <KpiTile label="Total Units" value={formatNumber(s.totalUnits)} icon={BarChart3} accent="bg-slate-600" />
            <KpiTile
              label="Inventory Cost Value"
              value={formatMoney(s.inventoryCostValue)}
              sub="at cost price"
              icon={DollarSign}
              accent="bg-indigo-600"
            />
            <KpiTile
              label="Potential Sales Value"
              value={formatMoney(s.potentialSalesValue)}
              sub="at selling price"
              icon={TrendingUp}
              accent="bg-green-600"
            />
            <KpiTile
              label="Potential Gross Profit"
              value={formatMoney(s.potentialGrossProfit)}
              sub={gpPct ? `${gpPct}% margin` : undefined}
              icon={TrendingUp}
              accent="bg-emerald-500"
            />
          </div>
        ) : null}

        {/* Product breakdown */}
        {!isLoading && !isError && filtered !== undefined && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                Product Breakdown
                {data?.products?.length ? (
                  <span className="text-gray-400 font-normal ml-1">({data.products.length})</span>
                ) : null}
              </h2>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <Input
                  placeholder="Search products…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm w-full sm:w-56"
                />
              </div>
            </div>

            {/* Sort controls */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-400 self-center">Sort:</span>
              <SortBtn id="costValue_desc" label="Highest Value" />
              <SortBtn id="costValue_asc"  label="Lowest Value" />
              <SortBtn id="qty_desc"       label="Most Stock" />
              <SortBtn id="qty_asc"        label="Least Stock" />
              <SortBtn id="name_asc"       label="Name A–Z" />
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-8">
                {search ? "No products match your search." : "No products in stock."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 bg-gray-50">
                      <th className="px-3 py-2.5">Product</th>
                      <th className="px-3 py-2.5 text-right">Stock</th>
                      <th className="px-3 py-2.5 text-right">Cost/unit</th>
                      <th className="px-3 py-2.5 text-right">Sell/unit</th>
                      <th className="px-3 py-2.5 text-right">Cost Value</th>
                      <th className="px-3 py-2.5 text-right">Sales Value</th>
                      <th className="px-3 py-2.5 text-right">GP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const gpPctRow =
                        p.inventorySalesValue > 0
                          ? ((p.grossProfitValue / p.inventorySalesValue) * 100).toFixed(0)
                          : null;
                      return (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                          <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[180px] truncate">
                            {p.name}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                            {formatNumber(p.stock)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                            {p.costPrice > 0 ? formatMoney(p.costPrice) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                            {formatMoney(p.price)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-indigo-700">
                            {p.costPrice > 0 ? formatMoney(p.inventoryCostValue) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-green-700">
                            {formatMoney(p.inventorySalesValue)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {p.costPrice > 0 ? (
                              <span className={p.grossProfitValue >= 0 ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>
                                {formatMoney(p.grossProfitValue)}
                                {gpPctRow && (
                                  <span className="text-xs text-gray-400 ml-1">({gpPctRow}%)</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filtered.length > 1 && s && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200 text-xs font-semibold text-gray-700">
                        <td className="px-3 py-2.5" colSpan={4}>Total ({filtered.length} products)</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-indigo-700">
                          {formatMoney(filtered.reduce((acc, p) => acc + p.inventoryCostValue, 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-green-700">
                          {formatMoney(filtered.reduce((acc, p) => acc + p.inventorySalesValue, 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                          {formatMoney(filtered.reduce((acc, p) => acc + p.grossProfitValue, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
