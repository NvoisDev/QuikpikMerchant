import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fmt } from "./shared";
import { fmtPackAdmin } from "./OrdersSection";
import type { ProductRow } from "./types";

export function ProductsSection({ isAdmin, highlightedId }: { isAdmin: boolean; highlightedId?: number }) {
  const [sort, setSort] = useState("margin_asc");
  const [wholesalerFilter, setWholesalerFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery<{ products: ProductRow[] }>({
    queryKey: ["/api/admin/products", sort],
    queryFn: async () => {
      const r = await fetch(`/api/admin/products?sort=${sort}`, { credentials: "include" });
      return r.json() as Promise<{ products: ProductRow[] }>;
    },
    enabled: isAdmin,
  });

  const products: ProductRow[] = data?.products ?? [];

  // Scroll to and highlight product when navigated from global search
  useEffect(() => {
    if (!highlightedId || !products.length) return;
    const idx = products.findIndex(p => p.id === highlightedId);
    if (idx !== -1) {
      setWholesalerFilter("");
      setFlagFilter("");
      const targetPage = Math.ceil((idx + 1) / PAGE_SIZE);
      setPage(targetPage);
      setTimeout(() => {
        const el = document.getElementById(`record-product-${highlightedId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [highlightedId, products.length]);

  const filtered = useMemo(() => {
    let list = products;
    if (wholesalerFilter) list = list.filter(p => p.wholesalerName === wholesalerFilter);
    if (flagFilter === "no_cost") list = list.filter(p => p.hasMissingCost);
    if (flagFilter === "low_margin") list = list.filter(p => p.hasLowMargin);
    if (flagFilter === "zero_stock") list = list.filter(p => p.hasZeroStock);
    return list;
  }, [products, wholesalerFilter, flagFilter]);

  useEffect(() => { setPage(1); }, [wholesalerFilter, flagFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const wholesalerNames = useMemo(() => Array.from(new Set(products.map(p => p.wholesalerName).filter((n): n is string => !!n))).sort(), [products]);

  const flagCounts = useMemo(() => ({
    noCost: products.filter(p => p.hasMissingCost).length,
    lowMargin: products.filter(p => p.hasLowMargin).length,
    zeroStock: products.filter(p => p.hasZeroStock).length,
  }), [products]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Products Oversight</h2>
        <p className="text-xs text-gray-400">Cross-wholesaler product health — missing costs, low margins, zero stock</p>
      </div>

      {/* Alert flags */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setFlagFilter(flagFilter === "no_cost" ? "" : "no_cost")}
          className={`rounded-xl border p-3 text-left transition-all ${flagFilter === "no_cost" ? "border-gray-400 bg-gray-100" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
          <p className="text-xs text-gray-500">Missing cost price</p>
          <p className="text-xl font-bold text-gray-700 mt-1">{flagCounts.noCost}</p>
        </button>
        <button onClick={() => setFlagFilter(flagFilter === "low_margin" ? "" : "low_margin")}
          className={`rounded-xl border p-3 text-left transition-all ${flagFilter === "low_margin" ? "border-red-400 bg-red-50" : "border-red-100 bg-red-50/50 hover:bg-red-50"}`}>
          <p className="text-xs text-red-600">Low margin (&lt;10%)</p>
          <p className="text-xl font-bold text-red-700 mt-1">{flagCounts.lowMargin}</p>
        </button>
        <button onClick={() => setFlagFilter(flagFilter === "zero_stock" ? "" : "zero_stock")}
          className={`rounded-xl border p-3 text-left transition-all ${flagFilter === "zero_stock" ? "border-amber-400 bg-amber-50" : "border-amber-100 bg-amber-50/50 hover:bg-amber-50"}`}>
          <p className="text-xs text-amber-600">Zero stock</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{flagCounts.zeroStock}</p>
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={sort} onChange={e => setSort(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white">
          <option value="margin_asc">Sort: Margin low → high</option>
          <option value="default">Sort: Newest first</option>
        </select>
        <select value={wholesalerFilter} onChange={e => setWholesalerFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white">
          <option value="">All wholesalers</option>
          {wholesalerNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        {flagFilter && <button onClick={() => setFlagFilter("")} className="text-xs text-gray-400 hover:text-gray-600 underline">Clear filter</button>}
      </div>

      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">{isLoading ? "Loading…" : `${filtered.length} product${filtered.length !== 1 ? "s" : ""}`}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-gray-400">Loading products...</div> : (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-slate-50">
                    {["Product","Wholesaler","Sale Price","Cost Price","Margin","Stock","Flags"].map((h, i) => (
                      <TableHead key={i} className="text-xs font-semibold text-slate-600">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(p => (
                    <TableRow id={`record-product-${p.id}`} key={p.id} className={`${p.hasMissingCost || p.hasLowMargin ? "bg-red-50/20" : ""} hover:bg-slate-50/50 ${highlightedId === p.id ? "ring-2 ring-inset ring-purple-400 bg-purple-50/30" : ""}`}>
                      <TableCell>
                        <p className="text-xs font-medium text-gray-800 max-w-[180px] truncate">{p.name}</p>
                        {fmtPackAdmin(String(p.quantityInPack ?? ''), p.unitSize, p.unitOfMeasure) && (
                          <p className="text-xs text-gray-400">{fmtPackAdmin(String(p.quantityInPack ?? ''), p.unitSize, p.unitOfMeasure)}</p>
                        )}
                        {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">{p.wholesalerName || "—"}</TableCell>
                      <TableCell className="text-xs font-medium text-gray-800">{p.price !== null ? fmt(p.price) : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {p.costPrice !== null ? (
                          <span className="font-medium text-gray-700">{fmt(p.costPrice)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.margin !== null ? (
                          <span className={`font-bold ${p.hasLowMargin ? "text-red-600" : p.margin < 20 ? "text-amber-600" : "text-green-700"}`}>
                            {p.margin.toFixed(1)}%
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={p.hasZeroStock ? "text-amber-600 font-medium" : "text-gray-600"}>{p.baseUnitStock ?? 0}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {p.hasMissingCost && <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded">No cost</span>}
                          {p.hasLowMargin && <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">Low margin</span>}
                          {p.hasZeroStock && <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">No stock</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-sm text-gray-400">No products match the current filters</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
                <span className="text-xs text-gray-400">Page {page} of {totalPages} ({filtered.length} products)</span>
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
