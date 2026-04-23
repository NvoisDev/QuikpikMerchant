import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Edit, PackagePlus, ToggleLeft, ToggleRight, Tag, Copy, Trash2, MoreHorizontal, Package, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";

interface Batch {
  id: number;
  batchNumber: string;
  quantity: number;
  expiryDate: string | null;
  status: "active" | "depleted" | "expired";
  notes?: string | null;
}

const formatMoney = (val: string | number | null | undefined, currency = "GBP") => {
  if (val === null || val === undefined || val === "") return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
};

const calcMarginPct = (price: string | number, costPrice: string | number): number | null => {
  const p = parseFloat(String(price));
  const c = parseFloat(String(costPrice));
  if (!isFinite(p) || !isFinite(c) || p <= 0) return null;
  return ((p - c) / p) * 100;
};

const getBatchExpiryInfo = (expiryDate: string | null) => {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const formatted = expiry.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (diffDays < 0) return { label: `Expired · ${formatted}`, className: "bg-red-100 text-red-700 border-red-200" };
  if (diffDays <= 30) return { label: `Expiring soon · ${formatted}`, className: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: formatted, className: "bg-green-50 text-green-700 border-green-200" };
};

const getActivePromos = (offers: any[]) => {
  if (!Array.isArray(offers)) return [];
  const now = new Date();
  return offers.filter((o) => {
    if (!o.isActive) return false;
    if (o.startDate && new Date(o.startDate) > now) return false;
    if (o.endDate && new Date(o.endDate) < now) return false;
    return true;
  });
};

const formatPromoLabel = (promo: any): string => {
  switch (promo.type) {
    case "percentage_discount": return `${promo.discountPercentage}% off`;
    case "fixed_price": return `Now ${formatMoney(promo.fixedPrice)}`;
    case "clearance": return `Clearance ${formatMoney(promo.fixedPrice)}`;
    case "buy_x_get_y_free": return `Buy ${promo.buyQuantity} Get ${promo.getQuantity} Free`;
    case "bundle_deal": return `${promo.minQuantity}+ at ${formatMoney(promo.fixedPrice)} each`;
    default: return promo.name || "Promotion";
  }
};

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showAllBatches, setShowAllBatches] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const productId = parseInt(id || "0");

  const { data: product, isLoading: productLoading } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) throw new Error("Product not found");
      return res.json();
    },
    enabled: !!productId,
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery<Batch[]>({
    queryKey: ["/api/products", productId, "batches"],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/batches?activeOnly=false`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!productId,
  });

  const statusChangeMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PATCH", `/api/products/${productId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product");
      const { id: _id, createdAt: _c, updatedAt: _u, wholesalerId: _w, ...rest } = product as any;
      return apiRequest("POST", "/api/products", {
        ...rest,
        name: `${product.name} (Copy)`,
        stock: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product duplicated", description: "A copy has been added to your catalogue." });
      navigate("/products");
    },
    onError: () => toast({ title: "Failed to duplicate", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/products/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted" });
      navigate("/products");
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  if (productLoading) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center py-16">
        <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">Product not found</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/products")}>
          Back to products
        </Button>
      </div>
    );
  }

  const currency = (product as any).currency || "GBP";
  const margin = product.costPrice ? calcMarginPct(product.price, product.costPrice) : null;
  const activePromos = getActivePromos((product as any).promotionalOffers || []);
  const isLocked = product.status === "locked";

  const activeBatches = batches.filter(b => b.status === "active" && (!b.expiryDate || new Date(b.expiryDate) >= new Date()));
  const otherBatches = batches.filter(b => !activeBatches.includes(b));
  const displayBatches = showAllBatches ? batches : activeBatches;

  const sellingFormat = (product as any).sellingFormat || "units";
  const totalPackageWeight = (product as any).totalPackageWeight;
  const palletWeight = (product as any).palletWeight;
  const unitsPerPallet = (product as any).unitsPerPallet;
  const palletPrice = (product as any).palletPrice;
  const palletMoq = (product as any).palletMoq;
  const totalBatchStock = (product as any).totalBatchStock;
  const batchCount = (product as any).batchCount ?? 0;
  const nearestExpiry = (product as any).nearestExpiry || (product as any).expiryDate;

  const productImage = ((product as any).images?.length > 0)
    ? (product as any).images[0]
    : (product as any).imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400";

  const statusConfig: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-green-100 text-green-800 border-green-200" },
    inactive: { label: "Inactive", className: "bg-gray-100 text-gray-700 border-gray-200" },
    out_of_stock: { label: "Out of Stock", className: "bg-red-100 text-red-700 border-red-200" },
    locked: { label: "Locked", className: "bg-orange-100 text-orange-700 border-orange-200" },
  };
  const currentStatus = statusConfig[product.status] || statusConfig.active;

  const marginBadgeClass =
    margin === null ? "" :
    margin < 0 ? "bg-red-50 text-red-700 border-red-200" :
    margin < 15 ? "bg-amber-50 text-amber-700 border-amber-200" :
    "bg-green-50 text-green-700 border-green-200";

  return (
    <>
      <div className="max-w-2xl mx-auto pb-16">
        {/* Back bar */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/products")} className="gap-1.5 -ml-1 text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Products
          </Button>
          {/* 3-dot menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={isLocked}>
                <MoreHorizontal className="h-4 w-4" /> Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate(`/products?edit=${productId}`)}>
                <Edit className="h-4 w-4 mr-2" /> Edit product
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/products?stock=${productId}`)}>
                <PackagePlus className="h-4 w-4 mr-2" /> Manage stock
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => statusChangeMutation.mutate(product.status === "active" ? "inactive" : "active")}>
                {product.status === "active"
                  ? <><ToggleLeft className="h-4 w-4 mr-2" /> Set inactive</>
                  : <><ToggleRight className="h-4 w-4 mr-2 text-green-600" /> Set active</>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/promotions?productId=${productId}`)}>
                <Tag className="h-4 w-4 mr-2" /> Promotions
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending}>
                <Copy className="h-4 w-4 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete product
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Hero image */}
        <div className="relative">
          <img
            src={productImage}
            alt={product.name}
            className="w-full h-56 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${currentStatus.className}`}>
                {currentStatus.label}
              </span>
              {(product as any).category && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/90 text-gray-700 border border-white/50">
                  {(product as any).category}
                </span>
              )}
              {margin !== null && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${marginBadgeClass}`}>
                  Margin {margin.toFixed(1)}%
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white drop-shadow">{product.name}</h1>
          </div>
        </div>

        <div className="px-4 pt-4 space-y-4">

          {/* ── Pricing & Margins ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Pricing & Margins</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">
                    {sellingFormat === "pallets" ? "Per pallet" : "Per unit"}
                  </p>
                  <p className="text-xl font-bold text-gray-900">
                    {(product as any).priceVisible !== false ? formatMoney(product.price, currency) : "Hidden"}
                  </p>
                </div>
                {product.costPrice && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Cost price</p>
                    <p className="text-xl font-bold text-gray-900">{formatMoney(product.costPrice, currency)}</p>
                  </div>
                )}
              </div>

              {margin !== null && (
                <div className={`rounded-lg p-3 border ${marginBadgeClass}`}>
                  <p className="text-xs font-medium opacity-70">Gross Margin</p>
                  <p className="text-2xl font-bold">{margin.toFixed(1)}%</p>
                  {product.costPrice && (
                    <p className="text-xs mt-0.5 opacity-70">
                      {formatMoney(parseFloat(String(product.price)) - parseFloat(String(product.costPrice)), currency)} per unit
                    </p>
                  )}
                </div>
              )}

              {activePromos.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Active promotion</p>
                    {activePromos.map((p, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-sm bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-3 py-1">
                        🏷 {formatPromoLabel(p)}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {(sellingFormat === "pallets" || sellingFormat === "both") && palletPrice && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Pallet price</p>
                      <p className="text-lg font-bold text-gray-900">{formatMoney(palletPrice, currency)}</p>
                    </div>
                    {palletMoq && (
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Pallet MOQ</p>
                        <p className="text-lg font-bold text-gray-900">{palletMoq} pallets</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Inventory ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-900">{(totalBatchStock ?? product.stock).toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total stock</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-900">{batchCount}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Active batches</p>
                </div>
                {nearestExpiry ? (
                  <div className={`rounded-lg p-3 border ${getBatchExpiryInfo(nearestExpiry)?.className || "bg-gray-50"}`}>
                    <p className="text-xs font-medium mb-0.5">Nearest expiry</p>
                    <p className="text-xs font-semibold">{getBatchExpiryInfo(nearestExpiry)?.label}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-gray-900">—</p>
                    <p className="text-xs text-gray-500 mt-0.5">No expiry</p>
                  </div>
                )}
              </div>

              {/* Stock alert */}
              {product.stock === 0 && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Out of stock
                </div>
              )}

              {/* Batch table */}
              {!batchesLoading && batches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-600">Batches</p>
                    {otherBatches.length > 0 && (
                      <button
                        onClick={() => setShowAllBatches(v => !v)}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                      >
                        {showAllBatches ? <><ChevronUp className="h-3 w-3" /> Show active only</> : <><ChevronDown className="h-3 w-3" /> Show all ({batches.length})</>}
                      </button>
                    )}
                  </div>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Batch</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Qty</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Expiry</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayBatches.map((batch) => {
                          const expiryInfo = getBatchExpiryInfo(batch.expiryDate);
                          const isExpiredBatch = batch.status === "expired" || (batch.expiryDate && new Date(batch.expiryDate) < new Date());
                          return (
                            <tr key={batch.id} className={isExpiredBatch ? "opacity-50" : ""}>
                              <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[100px]">{batch.batchNumber || `#${batch.id}`}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{batch.quantity.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right">
                                {expiryInfo ? (
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs border ${expiryInfo.className}`}>
                                    {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                                  </span>
                                ) : <span className="text-gray-400">No expiry</span>}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs capitalize ${
                                  batch.status === "active" && !isExpiredBatch ? "bg-green-100 text-green-700"
                                  : batch.status === "depleted" ? "bg-gray-100 text-gray-500"
                                  : "bg-red-100 text-red-600"
                                }`}>
                                  {isExpiredBatch && batch.status !== "depleted" ? "expired" : batch.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Logistics ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Logistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Selling format</span>
                  <span className="font-medium text-gray-800">
                    {sellingFormat === "units" ? "Units only" : sellingFormat === "pallets" ? "Pallets only" : "Units & Pallets"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">MOQ</span>
                  <span className="font-medium text-gray-800">{product.moq} {sellingFormat === "pallets" ? "pallets" : "units"}</span>
                </div>
                {unitsPerPallet && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Units per pallet</span>
                    <span className="font-medium text-gray-800">{unitsPerPallet}</span>
                  </div>
                )}
                {(product as any).packQuantity && (product as any).unitOfMeasure && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pack size</span>
                    <span className="font-medium text-gray-800">
                      {(product as any).packQuantity} × {(product as any).sizePerUnit || ""}{(product as any).unitOfMeasure}
                    </span>
                  </div>
                )}
                {totalPackageWeight && parseFloat(totalPackageWeight) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pack weight</span>
                    <span className="font-medium text-gray-800">{parseFloat(totalPackageWeight).toFixed(2)} kg</span>
                  </div>
                )}
                {palletWeight && parseFloat(palletWeight) > 0 && (sellingFormat === "pallets" || sellingFormat === "both") && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pallet weight</span>
                    <span className="font-medium text-gray-800">{parseFloat(palletWeight).toFixed(2)} kg</span>
                  </div>
                )}
                {(product as any).temperatureRequirement && (product as any).temperatureRequirement !== "ambient" && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Temperature</span>
                    <span className="font-medium text-gray-800 capitalize">{(product as any).temperatureRequirement}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Promotions ── */}
          {activePromos.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Promotions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activePromos.map((promo, i) => (
                  <div key={i} className="flex items-start justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-orange-800">🏷 {formatPromoLabel(promo)}</p>
                      {promo.startDate && promo.endDate && (
                        <p className="text-xs text-orange-600 mt-0.5">
                          {new Date(promo.startDate).toLocaleDateString("en-GB")} – {new Date(promo.endDate).toLocaleDateString("en-GB")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => navigate(`/promotions?productId=${productId}`)}>
                  Manage promotions
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ── Description ── */}
          {(product as any).description && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{(product as any).description}</p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{product.name}</strong> and all its stock history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
