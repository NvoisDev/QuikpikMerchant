import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Edit, PackagePlus, ToggleLeft, ToggleRight, Tag, Copy,
  Trash2, MoreHorizontal, Package, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PromotionalOffer } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductDetail {
  id: number;
  name: string;
  description: string | null;
  price: string;
  costPrice: string | null;
  currency: string;
  moq: number;
  stock: number;
  imageUrl: string | null;
  images: string[];
  category: string | null;
  status: "active" | "inactive" | "out_of_stock" | "locked";
  priceVisible: boolean;
  negotiationEnabled: boolean;
  sellingFormat: "units" | "pallets" | "both";
  palletPrice: string | null;
  palletMoq: number | null;
  palletStock: number | null;
  palletWeight: string | null;
  unitsPerPallet: number | null;
  totalPackageWeight: string | null;
  packQuantity: number | null;
  unitOfMeasure: string | null;
  sizePerUnit: string | null;
  temperatureRequirement: string | null;
  promotionalOffers: PromotionalOffer[];
  totalBatchStock: number | null;
  batchCount: number;
  nearestExpiry: string | null;
  expiryDate: string | null;
}

interface Batch {
  id: number;
  batchNumber: string;
  quantity: number;
  expiryDate: string | null;
  status: "active" | "depleted" | "expired";
  notes: string | null;
}

interface StockSummary {
  currentStock: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (val: string | number | null | undefined, currency = "GBP") => {
  if (val === null || val === undefined || val === "") return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
};

const calcMarginPct = (price: string, costPrice: string): number | null => {
  const p = parseFloat(price);
  const c = parseFloat(costPrice);
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

const getActivePromos = (offers: PromotionalOffer[]): PromotionalOffer[] => {
  if (!Array.isArray(offers)) return [];
  const now = new Date();
  return offers.filter((o) => {
    if (!o.isActive) return false;
    if (o.startDate && new Date(o.startDate) > now) return false;
    if (o.endDate && new Date(o.endDate) < now) return false;
    return true;
  });
};

const formatPromoLabel = (promo: PromotionalOffer): string => {
  switch (promo.type) {
    case "percentage_discount": return `${promo.discountPercentage}% off`;
    case "fixed_price": return `Now ${fmt(promo.fixedPrice)}`;
    case "clearance": return `Clearance ${fmt(promo.fixedPrice)}`;
    case "buy_x_get_y_free": return `Buy ${promo.buyQuantity} Get ${promo.getQuantity} Free`;
    case "bundle_deal": return `${promo.minQuantity}+ at ${fmt(promo.fixedPrice)} each`;
    default: return promo.name || "Promotion";
  }
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const productId = parseInt(id || "0");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showAllBatches, setShowAllBatches] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: product, isLoading: productLoading } = useQuery<ProductDetail>({
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

  const { data: stockSummary } = useQuery<StockSummary>({
    queryKey: ["/api/products", productId, "stock-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/stock-summary`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!productId,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const invalidateProduct = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/products/${productId}`, { status }),
    onSuccess: () => { invalidateProduct(); toast({ title: "Status updated" }); },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product");
      return apiRequest("POST", "/api/products", {
        name: `${product.name} (Copy)`,
        description: product.description,
        price: product.price,
        currency: product.currency,
        moq: product.moq,
        stock: 0,
        category: product.category,
        imageUrl: product.imageUrl,
        images: product.images,
        priceVisible: product.priceVisible,
        negotiationEnabled: product.negotiationEnabled,
        sellingFormat: product.sellingFormat,
        palletPrice: product.palletPrice,
        palletMoq: product.palletMoq,
        unitsPerPallet: product.unitsPerPallet,
        totalPackageWeight: product.totalPackageWeight,
        palletWeight: product.palletWeight,
        costPrice: product.costPrice,
        status: "active",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product duplicated" });
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

  // Navigate to product-management opening the exact existing modal, then return here
  const openEditModal = () => navigate(`/products?edit=${productId}&from=${encodeURIComponent(`/products/${productId}`)}`);
  const openStockModal = () => navigate(`/products?stock=${productId}&from=${encodeURIComponent(`/products/${productId}`)}`);

  // ── Loading / not found ───────────────────────────────────────────────────

  if (productLoading) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {[0, 1, 2, 3].map((i) => (
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

  // ── Derived values ────────────────────────────────────────────────────────

  const currency = product.currency || "GBP";
  const margin = product.costPrice ? calcMarginPct(product.price, product.costPrice) : null;
  const activePromos = getActivePromos(product.promotionalOffers || []);
  const isLocked = product.status === "locked";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeBatches = batches.filter(
    (b) => b.status === "active" && (!b.expiryDate || new Date(b.expiryDate) >= today)
  );
  const otherBatches = batches.filter((b) => !activeBatches.includes(b));
  const displayBatches = showAllBatches ? batches : activeBatches;

  const totalStock = stockSummary?.currentStock ?? product.totalBatchStock ?? product.stock;
  const batchCountDisplay = product.batchCount ?? activeBatches.length;
  const nearestExpiry = product.nearestExpiry || product.expiryDate;

  const productImage =
    (product.images?.length > 0 ? product.images[0] : null) ||
    product.imageUrl ||
    "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400";

  const statusConfig: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-green-100 text-green-800 border-green-200" },
    inactive: { label: "Inactive", className: "bg-gray-100 text-gray-700 border-gray-200" },
    out_of_stock: { label: "Out of Stock", className: "bg-red-100 text-red-700 border-red-200" },
    locked: { label: "Locked", className: "bg-orange-100 text-orange-700 border-orange-200" },
  };
  const currentStatus = statusConfig[product.status] ?? statusConfig.active;

  const marginBadgeClass =
    margin === null ? "" :
    margin < 0 ? "bg-red-50 text-red-700 border-red-200" :
    margin < 15 ? "bg-amber-50 text-amber-700 border-amber-200" :
    "bg-green-50 text-green-700 border-green-200";

  return (
    <>
      <div className="max-w-2xl mx-auto pb-16">

        {/* ── Back bar + 3-dot menu ── */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/products")} className="gap-1.5 -ml-1 text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Products
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={isLocked}>
                <MoreHorizontal className="h-4 w-4" /> Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={openEditModal}>
                <Edit className="h-4 w-4 mr-2" /> Edit product
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openStockModal}>
                <PackagePlus className="h-4 w-4 mr-2" /> Manage stock
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => statusMutation.mutate(product.status === "active" ? "inactive" : "active")}>
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

        {/* ── Hero image ── */}
        <div className="relative">
          <img src={productImage} alt={product.name} className="w-full h-56 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${currentStatus.className}`}>
                {currentStatus.label}
              </span>
              {product.category && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/90 text-gray-700 border border-white/50">
                  {product.category}
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
                    {product.sellingFormat === "pallets" ? "Per pallet" : "Per unit"}
                  </p>
                  <p className="text-xl font-bold text-gray-900">
                    {product.priceVisible ? fmt(product.price, currency) : "Hidden"}
                  </p>
                </div>
                {product.costPrice && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Cost price</p>
                    <p className="text-xl font-bold text-gray-900">{fmt(product.costPrice, currency)}</p>
                  </div>
                )}
              </div>

              {margin !== null && (
                <div className={`rounded-lg p-3 border ${marginBadgeClass}`}>
                  <p className="text-xs font-medium opacity-70">Gross Margin</p>
                  <p className="text-2xl font-bold">{margin.toFixed(1)}%</p>
                  {product.costPrice && (
                    <p className="text-xs mt-0.5 opacity-70">
                      {fmt(parseFloat(product.price) - parseFloat(product.costPrice), currency)} per unit
                    </p>
                  )}
                </div>
              )}

              {activePromos.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Active promotion</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activePromos.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-sm bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-3 py-1">
                          🏷 {formatPromoLabel(p)}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {(product.sellingFormat === "pallets" || product.sellingFormat === "both") && product.palletPrice && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Pallet price</p>
                      <p className="text-lg font-bold text-gray-900">{fmt(product.palletPrice, currency)}</p>
                    </div>
                    {product.palletMoq && (
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Pallet MOQ</p>
                        <p className="text-lg font-bold text-gray-900">{product.palletMoq} pallets</p>
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
                  <p className="text-2xl font-bold text-gray-900">{totalStock.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total stock</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-900">{batchCountDisplay}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Active batches</p>
                </div>
                {nearestExpiry ? (
                  <div className={`rounded-lg p-3 border text-left ${getBatchExpiryInfo(nearestExpiry)?.className ?? "bg-gray-50"}`}>
                    <p className="text-xs font-medium mb-0.5 opacity-70">Nearest expiry</p>
                    <p className="text-xs font-semibold leading-tight">{getBatchExpiryInfo(nearestExpiry)?.label}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-gray-900">—</p>
                    <p className="text-xs text-gray-500 mt-0.5">No expiry</p>
                  </div>
                )}
              </div>

              {totalStock === 0 && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Out of stock
                </div>
              )}

              {!batchesLoading && batches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-600">Batches</p>
                    {otherBatches.length > 0 && (
                      <button
                        onClick={() => setShowAllBatches((v) => !v)}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                      >
                        {showAllBatches
                          ? <><ChevronUp className="h-3 w-3" /> Active only</>
                          : <><ChevronDown className="h-3 w-3" /> All ({batches.length})</>}
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
                          const isExpiredBatch =
                            batch.status === "expired" ||
                            (batch.expiryDate != null && new Date(batch.expiryDate) < today);
                          return (
                            <tr key={batch.id} className={isExpiredBatch ? "opacity-50" : ""}>
                              <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[90px]">
                                {batch.batchNumber || `#${batch.id}`}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-700">{batch.quantity.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right">
                                {expiryInfo ? (
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs border ${expiryInfo.className}`}>
                                    {batch.expiryDate
                                      ? new Date(batch.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
                                      : "—"}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">No expiry</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs capitalize ${
                                  isExpiredBatch && batch.status !== "depleted"
                                    ? "bg-red-100 text-red-600"
                                    : batch.status === "depleted"
                                      ? "bg-gray-100 text-gray-500"
                                      : "bg-green-100 text-green-700"
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
                    {product.sellingFormat === "units" ? "Units only"
                      : product.sellingFormat === "pallets" ? "Pallets only"
                      : "Units & Pallets"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">MOQ</span>
                  <span className="font-medium text-gray-800">
                    {product.moq} {product.sellingFormat === "pallets" ? "pallets" : "units"}
                  </span>
                </div>
                {product.unitsPerPallet != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Units per pallet</span>
                    <span className="font-medium text-gray-800">{product.unitsPerPallet}</span>
                  </div>
                )}
                {product.packQuantity != null && product.unitOfMeasure && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pack size</span>
                    <span className="font-medium text-gray-800">
                      {product.packQuantity} × {product.sizePerUnit ?? ""}{product.unitOfMeasure}
                    </span>
                  </div>
                )}
                {product.totalPackageWeight != null && parseFloat(product.totalPackageWeight) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pack weight</span>
                    <span className="font-medium text-gray-800">{parseFloat(product.totalPackageWeight).toFixed(2)} kg</span>
                  </div>
                )}
                {product.palletWeight != null &&
                  parseFloat(product.palletWeight) > 0 &&
                  (product.sellingFormat === "pallets" || product.sellingFormat === "both") && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pallet weight</span>
                    <span className="font-medium text-gray-800">{parseFloat(product.palletWeight).toFixed(2)} kg</span>
                  </div>
                )}
                {product.temperatureRequirement && product.temperatureRequirement !== "ambient" && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Temperature</span>
                    <span className="font-medium text-gray-800 capitalize">{product.temperatureRequirement}</span>
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
                  <div key={i} className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
                    <p className="text-sm font-semibold text-orange-800">🏷 {formatPromoLabel(promo)}</p>
                    {promo.startDate && promo.endDate && (
                      <p className="text-xs text-orange-600 mt-0.5">
                        {new Date(promo.startDate).toLocaleDateString("en-GB")} – {new Date(promo.endDate).toLocaleDateString("en-GB")}
                      </p>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => navigate(`/promotions?productId=${productId}`)}>
                  Manage promotions
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ── Description ── */}
          {product.description && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{product.description}</p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* ── Delete confirmation ── */}
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
