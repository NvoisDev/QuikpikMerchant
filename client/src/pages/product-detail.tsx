import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Edit, PackagePlus, ToggleLeft, ToggleRight, Tag, Copy,
  Trash2, MoreHorizontal, Package, AlertTriangle, ChevronDown, ChevronUp,
  Thermometer, Layers, Clock, ShieldAlert, Loader2, CalendarDays, Pencil, Share2, RefreshCw,
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import type { PromotionalOffer } from "@shared/schema";
import { formatNumber } from "@/lib/utils";
import { formatWeight } from "@/lib/currencies";
import { computePackWeightKg } from "@shared/utils/product";
import { InventoryCalculator } from "@shared/inventory-calculator";
import { fetchProductDetail, fetchWithTimeout } from "@/lib/product-detail-fetch";

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
  sellingFormat: "units" | "pallets" | "both";
  palletPrice: string | null;
  palletMoq: number | null;
  palletStock: number | null;
  palletWeight: string | null;
  unitsPerPallet: number | null;
  quantityInPack: number | null;
  totalPackageWeight: string | null;
  packQuantity: number | null;
  unitOfMeasure: string | null;
  sizePerUnit: string | null;
  unitSize?: string | null;
  temperatureRequirement: string | null;
  contentCategory: string | null;
  specialHandling: { fragile?: boolean; perishable?: boolean; hazardous?: boolean } | null;
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
  originalQuantity?: number | null;
  expiryDate: string | null;
  status: "active" | "depleted" | "expired";
  notes: string | null;
  costPrice: string | number | null;
}

interface StockSummary {
  openingStock: number;
  totalPurchases: number;
  totalIncreases: number;
  totalDecreases: number;
  totalAdjustments: number;
  hasAdjustmentMovements: boolean;
  currentStock: number;
}

interface StockMovementEntry {
  id: number;
  movementType: string;
  quantity: number;
  unitType: string;
  stockBefore: number;
  stockAfter: number;
  reason: string | null;
  orderId: number | null;
  customerName: string | null;
  batchId: number | null;
  batchNumber: string | null;
  orderNumber: string | null;
  businessProfileName: string | null;
  createdAt: string;
}

interface PriceHistoryEntry {
  id: number;
  productId: number | null;
  productName: string;
  sellingType: string;
  oldPrice: string;
  newPrice: string;
  orderId: number | null;
  changedAt: string;
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
  const { user } = useAuth();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';

  const productId = parseInt(id || "0");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showAllBatches, setShowAllBatches] = useState(false);
  const [expiryPopoverBatchId, setExpiryPopoverBatchId] = useState<number | null>(null);
  const [expiryInputValue, setExpiryInputValue] = useState<string>("");
  const expiryPopoverRef = useRef<HTMLDivElement>(null);
  const [costPriceEditBatchId, setCostPriceEditBatchId] = useState<number | null>(null);
  const [costPriceInputValue, setCostPriceInputValue] = useState<string>("");
  const [movementHistoryOpen, setMovementHistoryOpen] = useState(false);
  const costPricePopoverRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────

  const {
    data: product,
    isLoading: productLoading,
    isError: productError,
    refetch: refetchProduct,
    isFetching: productFetching,
  } = useQuery<ProductDetail | null>({
    queryKey: ["/api/products", productId],
    queryFn: () => fetchProductDetail<ProductDetail>(productId),
    enabled: !!productId,
    staleTime: 0,
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery<Batch[]>({
    queryKey: ["/api/products", productId, "batches"],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/products/${productId}/batches?activeOnly=false`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!productId,
    staleTime: 0,
  });

  const { data: stockSummary, isLoading: summaryLoading } = useQuery<StockSummary>({
    queryKey: ["/api/products", productId, "stock-summary"],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/products/${productId}/stock-summary`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!productId,
    staleTime: 0,
  });

  const { data: stockMovements = [], isLoading: movementsLoading } = useQuery<StockMovementEntry[]>({
    queryKey: ["/api/products", productId, "stock-movements"],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/products/${productId}/stock-movements`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!productId,
    staleTime: 0,
  });

  const { data: priceHistory = [] } = useQuery<PriceHistoryEntry[]>({
    queryKey: ["/api/products", productId, "price-history"],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/products/${productId}/price-history`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!productId,
    staleTime: 60_000,
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

  const updateExpiryMutation = useMutation({
    mutationFn: ({ batchId, expiryDate }: { batchId: number; expiryDate: string | null }) =>
      apiRequest("PATCH", `/api/products/${productId}/batches/${batchId}`, { expiryDate }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "batches"] });
      setExpiryPopoverBatchId((current) => (current === variables.batchId ? null : current));
      toast({ title: "Expiry date updated" });
    },
    onError: () => toast({ title: "Failed to update expiry date", variant: "destructive" }),
  });

  const updateCostPriceMutation = useMutation({
    mutationFn: ({ batchId, costPrice }: { batchId: number; costPrice: string | null }) =>
      apiRequest("PATCH", `/api/products/${productId}/batches/${batchId}`, { costPrice }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "batches"] });
      setCostPriceEditBatchId((current) => (current === variables.batchId ? null : current));
      toast({ title: "Cost price updated" });
    },
    onError: () => toast({ title: "Failed to update cost price", variant: "destructive" }),
  });

  useEffect(() => {
    if (expiryPopoverBatchId === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (expiryPopoverRef.current && !expiryPopoverRef.current.contains(e.target as Node)) {
        const dateInput = expiryPopoverRef.current.querySelector('input[type="date"]');
        if (dateInput && document.activeElement === dateInput) return;
        setExpiryPopoverBatchId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expiryPopoverBatchId]);

  useEffect(() => {
    if (costPriceEditBatchId === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (costPricePopoverRef.current && !costPricePopoverRef.current.contains(e.target as Node)) {
        setCostPriceEditBatchId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [costPriceEditBatchId]);

  const openExpiryPopover = (batch: Batch) => {
    const val = batch.expiryDate ? batch.expiryDate.substring(0, 10) : "";
    setExpiryInputValue(val);
    setExpiryPopoverBatchId(batch.id);
  };

  const openCostPricePopover = (batch: Batch) => {
    const val = batch.costPrice != null && batch.costPrice !== "" ? String(batch.costPrice) : "";
    setCostPriceInputValue(val);
    setCostPriceEditBatchId(batch.id);
  };

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

  // The product request failed or timed out. Surface a clear error with a retry
  // action instead of leaving the page stuck on a blank/skeleton state.
  if (productError) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center py-16">
        <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">Couldn't load this product</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
          Something went wrong while loading. Please check your connection and try again.
        </p>
        <div className="flex items-center justify-center gap-2 mt-5">
          <Button onClick={() => refetchProduct()} disabled={productFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${productFetching ? "animate-spin" : ""}`} />
            {productFetching ? "Retrying…" : "Try again"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/products")}>
            Back to products
          </Button>
        </div>
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

  const totalStock = stockSummary?.currentStock ?? product.stock;
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
          {!isViewer && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <MoreHorizontal className="h-4 w-4" /> Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={openEditModal} disabled={isLocked}>
                  <Edit className="h-4 w-4 mr-2" /> Edit product
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openStockModal} disabled={isLocked}>
                  <PackagePlus className="h-4 w-4 mr-2" /> Manage stock
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => statusMutation.mutate(product.status === "active" ? "inactive" : "active")}
                  disabled={isLocked}
                >
                  {product.status === "active"
                    ? <><ToggleLeft className="h-4 w-4 mr-2" /> Set inactive</>
                    : <><ToggleRight className="h-4 w-4 mr-2 text-green-600" /> Set active</>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/promotions?productId=${productId}`)} disabled={isLocked}>
                  <Tag className="h-4 w-4 mr-2" /> Promotions
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => duplicateMutation.mutate()} disabled={isLocked || duplicateMutation.isPending}>
                  <Copy className="h-4 w-4 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const url = `https://quikpik.app/product/${productId}`;
                  navigator.clipboard.writeText(url).then(() => {
                    toast({ title: "Link copied", description: "Public product link copied to clipboard." });
                  }).catch(() => {
                    toast({ title: "Copy failed", description: "Could not copy link automatically.", variant: "destructive" });
                  });
                }}>
                  <Share2 className="h-4 w-4 mr-2" /> Copy public link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setTimeout(() => setDeleteDialogOpen(true), 0)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete product
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
                  {(() => {
                    const unitHistory = priceHistory.filter(h => h.sellingType === "units");
                    if (unitHistory.length === 0) return null;
                    const last = unitHistory[0];
                    const pct = ((parseFloat(last.newPrice) - parseFloat(last.oldPrice)) / parseFloat(last.oldPrice)) * 100;
                    const isUp = pct > 0;
                    const dateLabel = new Date(last.changedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                    return (
                      <p className="text-[11px] mt-0.5 text-gray-400">
                        {isUp ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}% on {dateLabel}
                      </p>
                    );
                  })()}
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Inventory</CardTitle>
                {!isViewer && (
                  <button
                    onClick={openStockModal}
                    className="text-xs text-green-700 hover:text-green-900 border border-green-200 hover:border-green-400 rounded px-2 py-1 flex items-center gap-1"
                  >
                    <PackagePlus className="h-3 w-3" /> Manage Stock
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(totalStock)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Remaining stock</p>
                  {(() => {
                    const breakdown = InventoryCalculator.formatStockBreakdown(
                      totalStock ?? 0,
                      product.quantityInPack,
                      product.unitsPerPallet
                    );
                    if (!breakdown) return null;
                    return <p className="text-xs text-gray-400 mt-1 leading-snug">{breakdown.label}</p>;
                  })()}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-900">{batchCountDisplay}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{batchCountDisplay === 1 ? 'Batch' : 'Batches'}</p>
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
                  <div className="rounded-lg border border-gray-200 overflow-visible">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Batch</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Qty</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Cost</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Expiry</th>
                          <th className="hidden md:table-cell text-right px-3 py-2 text-gray-500 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayBatches.map((batch) => {
                          const expiryInfo = getBatchExpiryInfo(batch.expiryDate);
                          const isExpiredBatch =
                            batch.status === "expired" ||
                            (batch.expiryDate != null && new Date(batch.expiryDate) < today);
                          const isThisPopoverOpen = expiryPopoverBatchId === batch.id;
                          const isSavingThisBatch =
                            updateExpiryMutation.isPending &&
                            updateExpiryMutation.variables?.batchId === batch.id;
                          return (
                            <tr key={batch.id} className={isExpiredBatch ? "opacity-50" : ""}>
                              <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[90px]">
                                {batch.batchNumber || `#${batch.id}`}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-700">
                                {formatNumber(batch.quantity)}
                                <span className="text-gray-400 text-xs"> of {formatNumber(batch.originalQuantity ?? batch.quantity)}</span>
                              </td>
                              <td className="px-3 py-2 text-right text-gray-700">
                                {isViewer ? (
                                  batch.costPrice != null && batch.costPrice !== ""
                                    ? fmt(batch.costPrice, currency)
                                    : <span className="text-gray-400">—</span>
                                ) : (
                                  <div className="relative inline-block">
                                    <button
                                      onClick={() => openCostPricePopover(batch)}
                                      disabled={updateCostPriceMutation.isPending && updateCostPriceMutation.variables?.batchId === batch.id}
                                      className="focus:outline-none"
                                      title="Click to edit cost price"
                                    >
                                      {updateCostPriceMutation.isPending && updateCostPriceMutation.variables?.batchId === batch.id ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-gray-200 text-gray-400 bg-gray-50">
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        </span>
                                      ) : batch.costPrice != null && batch.costPrice !== "" ? (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-green-200 bg-green-50 text-green-800 cursor-pointer hover:bg-green-100 hover:border-green-300 transition-colors">
                                          {fmt(batch.costPrice, currency)}
                                          <Pencil className="h-2.5 w-2.5 opacity-60" />
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-dashed border-gray-300 text-gray-400 cursor-pointer hover:border-green-400 hover:text-green-600 transition-colors">
                                          + Add cost
                                        </span>
                                      )}
                                    </button>
                                    {!isMobile && costPriceEditBatchId === batch.id && (
                                      <div
                                        ref={costPricePopoverRef}
                                        className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[180px]"
                                      >
                                        <p className="text-xs font-medium text-gray-600 mb-2">Set cost price</p>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          autoFocus
                                          value={costPriceInputValue}
                                          disabled={updateCostPriceMutation.isPending}
                                          onChange={(e) => setCostPriceInputValue(e.target.value)}
                                          placeholder="0.00"
                                          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500 mb-2 disabled:opacity-50"
                                        />
                                        <div className="flex gap-1.5 justify-end">
                                          {(batch.costPrice != null && batch.costPrice !== "") && (
                                            <button
                                              onClick={() => updateCostPriceMutation.mutate({ batchId: batch.id, costPrice: null })}
                                              disabled={updateCostPriceMutation.isPending}
                                              className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 rounded px-2 py-1.5 disabled:opacity-50"
                                            >
                                              Clear
                                            </button>
                                          )}
                                          <button
                                            onClick={() => setCostPriceEditBatchId(null)}
                                            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1.5"
                                          >
                                            ✕
                                          </button>
                                          <button
                                            onClick={() => {
                                              const val = costPriceInputValue.trim();
                                              if (val === "") return;
                                              updateCostPriceMutation.mutate({ batchId: batch.id, costPrice: val });
                                            }}
                                            disabled={updateCostPriceMutation.isPending || costPriceInputValue.trim() === ""}
                                            className="text-xs text-white bg-green-600 hover:bg-green-700 rounded px-2 py-1.5 disabled:opacity-50"
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {isViewer ? (
                                  expiryInfo ? (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border ${expiryInfo.className}`}>
                                      {batch.expiryDate
                                        ? new Date(batch.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
                                        : "—"}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 text-xs">No expiry</span>
                                  )
                                ) : (
                                  <div className="relative inline-block">
                                    <button
                                      onClick={() => openExpiryPopover(batch)}
                                      disabled={isSavingThisBatch}
                                      className="focus:outline-none"
                                      title="Click to edit expiry date"
                                    >
                                      {isSavingThisBatch ? (
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border ${expiryInfo?.className ?? "bg-gray-50 border-gray-200 text-gray-500"}`}>
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        </span>
                                      ) : expiryInfo ? (
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border cursor-pointer hover:opacity-80 transition-opacity ${expiryInfo.className}`}>
                                          {batch.expiryDate
                                            ? new Date(batch.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
                                            : "—"}
                                          <CalendarDays className="h-2.5 w-2.5 opacity-60" />
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-gray-400 cursor-pointer hover:text-gray-600 transition-colors">
                                          No expiry <CalendarDays className="h-2.5 w-2.5" />
                                        </span>
                                      )}
                                    </button>

                                    {!isMobile && isThisPopoverOpen && (
                                      <div
                                        ref={expiryPopoverRef}
                                        className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]"
                                      >
                                        <p className="text-xs font-medium text-gray-600 mb-2">Set expiry date</p>
                                        <input
                                          type="date"
                                          autoFocus
                                          value={expiryInputValue}
                                          onChange={(e) => setExpiryInputValue(e.target.value)}
                                          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500 mb-2"
                                        />
                                        <div className="flex gap-1.5 justify-end">
                                          <button
                                            onClick={() => {
                                              if (expiryInputValue) {
                                                updateExpiryMutation.mutate(
                                                  { batchId: batch.id, expiryDate: expiryInputValue },
                                                  { onSuccess: () => setExpiryPopoverBatchId(null) }
                                                );
                                              }
                                            }}
                                            disabled={!expiryInputValue || updateExpiryMutation.isPending}
                                            className="text-xs text-white bg-green-600 hover:bg-green-700 rounded px-2 py-1.5 disabled:opacity-50"
                                          >
                                            {updateExpiryMutation.isPending ? "Saving…" : "Save"}
                                          </button>
                                          {batch.expiryDate && (
                                            <button
                                              onClick={() =>
                                                updateExpiryMutation.mutate(
                                                  { batchId: batch.id, expiryDate: null },
                                                  { onSuccess: () => setExpiryPopoverBatchId(null) }
                                                )
                                              }
                                              disabled={updateExpiryMutation.isPending}
                                              className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 rounded px-2 py-1.5 disabled:opacity-50"
                                              title="Remove expiry date"
                                            >
                                              Clear
                                            </button>
                                          )}
                                          <button
                                            onClick={() => setExpiryPopoverBatchId(null)}
                                            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1.5"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="hidden md:table-cell px-3 py-2 text-right">
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

          {/* ── Stock Movement History ── */}
          <Card>
            <CardHeader
              className="pb-3 cursor-pointer select-none"
              onClick={() => setMovementHistoryOpen(o => !o)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Stock Movement History
                  {stockMovements.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-400 normal-case tracking-normal">
                      ({stockMovements.length})
                    </span>
                  )}
                </CardTitle>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${movementHistoryOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
            {movementHistoryOpen && (
              <CardContent>
                {movementsLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : stockMovements.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No stock movements yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {summaryLoading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="text-center space-y-1.5">
                            <div className="h-3 bg-gray-200 rounded animate-pulse mx-auto w-14" />
                            <div className="h-4 bg-gray-200 rounded animate-pulse mx-auto w-10" />
                          </div>
                        ))}
                      </div>
                    ) : stockSummary && (
                      <div className={`grid gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100 ${stockSummary.hasAdjustmentMovements ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}>
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-0.5">Opening Stock</p>
                          <p className="text-sm font-semibold text-gray-700">{stockSummary.openingStock}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-0.5">Stock In</p>
                          <p className="text-sm font-semibold text-green-600">+{stockSummary.totalIncreases}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-0.5">Total Sold</p>
                          <p className="text-sm font-semibold text-red-500">-{stockSummary.totalPurchases}</p>
                        </div>
                        {stockSummary.hasAdjustmentMovements && (
                          <div className="text-center">
                            <p className="text-xs text-gray-400 mb-0.5">Adjustments</p>
                            <p className={`text-sm font-semibold ${
                              stockSummary.totalAdjustments > 0 ? 'text-green-600'
                              : stockSummary.totalAdjustments < 0 ? 'text-red-500'
                              : 'text-gray-500'
                            }`}>
                              {stockSummary.totalAdjustments > 0 ? '+' : ''}{stockSummary.totalAdjustments}
                            </p>
                          </div>
                        )}
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-0.5">Current Stock</p>
                          <p className="text-sm font-semibold text-gray-700">{stockSummary.currentStock}</p>
                        </div>
                      </div>
                    )}
                    {stockMovements.map((m) => {
                      const isIncrease = m.quantity > 0;
                      const typeLabels: Record<string, string> = {
                        purchase: "Sale",
                        manual_increase: "Stock in",
                        manual_decrease: "Adjustment",
                        initial: "Initial stock",
                        return: "Return",
                      };
                      const label = typeLabels[m.movementType] ?? m.movementType;
                      const batchLabel = m.batchId
                        ? m.batchNumber ? `Batch ${m.batchNumber}` : `Batch #${m.batchId}`
                        : null;
                      return (
                        <div key={m.id} className="flex items-start justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isIncrease ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {isIncrease ? "+" : ""}{m.quantity} {m.unitType}
                              </span>
                              <span className="text-xs text-gray-600 font-medium">{label}</span>
                              {batchLabel && (
                                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5">
                                  {batchLabel}
                                </span>
                              )}
                              {m.customerName && (
                                <span className="text-xs text-gray-500 truncate">{m.customerName}</span>
                              )}
                              {m.orderNumber && (
                                <span className="text-xs text-gray-400">#{m.orderNumber}</span>
                              )}
                            </div>
                            {m.reason && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate">{m.reason}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-500">{m.stockAfter} left</p>
                            <p className="text-xs text-gray-400">
                              {new Date(m.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
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
                {product.packQuantity != null && product.unitSize && product.unitOfMeasure && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pack size</span>
                    <span className="font-medium text-gray-800">
                      {product.packQuantity} × {formatWeight(product.unitSize)}{product.unitOfMeasure}
                    </span>
                  </div>
                )}
                {(() => {
                  const computed = computePackWeightKg(
                    product.packQuantity,
                    product.unitSize,
                    product.unitOfMeasure,
                  );
                  const displayWeight = computed > 0
                    ? computed
                    : product.totalPackageWeight != null ? parseFloat(product.totalPackageWeight) : 0;
                  return displayWeight > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pack weight</span>
                      <span className="font-medium text-gray-800">{formatWeight(displayWeight)} kg</span>
                    </div>
                  ) : null;
                })()}
                {product.palletWeight != null &&
                  parseFloat(product.palletWeight) > 0 &&
                  (product.sellingFormat === "pallets" || product.sellingFormat === "both") && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pallet weight</span>
                    <span className="font-medium text-gray-800">{formatWeight(product.palletWeight)} kg</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Shipping Requirements ── */}
          {(() => {
            const temp = product.temperatureRequirement;
            const cat = product.contentCategory;
            const sh = product.specialHandling ?? {};
            const hasTemp = !!temp && temp.toLowerCase() !== "ambient";
            const hasCat = !!cat && cat.toLowerCase() !== "general";
            const hasFlags = !!(sh.fragile || sh.perishable || sh.hazardous);
            if (!hasTemp && !hasCat && !hasFlags) return null;

            const tempLabels: Record<string, string> = {
              frozen: "Frozen (−18 °C or below)",
              chilled: "Chilled (0–8 °C)",
              ambient: "Ambient",
            };
            const catLabels: Record<string, string> = {
              food: "Food",
              pharmaceuticals: "Pharmaceuticals",
              electronics: "Electronics",
              textiles: "Textiles",
              general: "General",
            };

            return (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Shipping Requirements</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5 text-sm">
                    {hasTemp && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-500">
                          <Thermometer className="h-3.5 w-3.5 shrink-0" /> Temperature
                        </span>
                        <span className="font-medium text-gray-800 capitalize">
                          {tempLabels[temp!.toLowerCase()] ?? temp}
                        </span>
                      </div>
                    )}
                    {hasCat && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-500">
                          <Layers className="h-3.5 w-3.5 shrink-0" /> Content category
                        </span>
                        <span className="font-medium text-gray-800">
                          {catLabels[cat!.toLowerCase()] ?? cat}
                        </span>
                      </div>
                    )}
                    {hasFlags && (
                      <div className="flex items-start justify-between">
                        <span className="flex items-center gap-1.5 text-gray-500 shrink-0">
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Special handling
                        </span>
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {sh.fragile && (
                            <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5">
                              <Package className="h-3 w-3" /> Fragile
                            </span>
                          )}
                          {sh.perishable && (
                            <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2.5 py-0.5">
                              <Clock className="h-3 w-3" /> Perishable
                            </span>
                          )}
                          {sh.hazardous && (
                            <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-2.5 py-0.5">
                              <AlertTriangle className="h-3 w-3" /> Hazardous
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

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

      {/* ── Mobile bottom-sheet: Cost Price ── */}
      <Sheet
        open={isMobile && costPriceEditBatchId !== null}
        onOpenChange={(open) => { if (!open) setCostPriceEditBatchId(null); }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle>Set cost price</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={costPriceInputValue}
              disabled={updateCostPriceMutation.isPending}
              onChange={(e) => setCostPriceInputValue(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
            />
            <div className="flex gap-3">
              {costPriceEditBatchId !== null && batches.find(b => b.id === costPriceEditBatchId)?.costPrice != null &&
               batches.find(b => b.id === costPriceEditBatchId)?.costPrice !== "" && (
                <Button
                  variant="outline"
                  className="flex-1 h-12 text-red-600 border-red-200 hover:bg-red-50"
                  disabled={updateCostPriceMutation.isPending}
                  onClick={() => updateCostPriceMutation.mutate({ batchId: costPriceEditBatchId!, costPrice: null })}
                >
                  Clear
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setCostPriceEditBatchId(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white"
                disabled={updateCostPriceMutation.isPending || costPriceInputValue.trim() === ""}
                onClick={() => {
                  const val = costPriceInputValue.trim();
                  if (val === "" || costPriceEditBatchId === null) return;
                  updateCostPriceMutation.mutate({ batchId: costPriceEditBatchId, costPrice: val });
                }}
              >
                {updateCostPriceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Mobile bottom-sheet: Expiry Date ── */}
      <Sheet
        open={isMobile && expiryPopoverBatchId !== null}
        onOpenChange={(open) => { if (!open) setExpiryPopoverBatchId(null); }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle>Set expiry date</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <input
              type="date"
              autoFocus
              value={expiryInputValue}
              onChange={(e) => setExpiryInputValue(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex gap-3">
              {expiryPopoverBatchId !== null && batches.find(b => b.id === expiryPopoverBatchId)?.expiryDate && (
                <Button
                  variant="outline"
                  className="flex-1 h-12 text-red-600 border-red-200 hover:bg-red-50"
                  disabled={updateExpiryMutation.isPending}
                  onClick={() => updateExpiryMutation.mutate({ batchId: expiryPopoverBatchId!, expiryDate: null })}
                >
                  Clear
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setExpiryPopoverBatchId(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white"
                disabled={updateExpiryMutation.isPending || !expiryInputValue}
                onClick={() => {
                  if (!expiryInputValue || expiryPopoverBatchId === null) return;
                  updateExpiryMutation.mutate({ batchId: expiryPopoverBatchId, expiryDate: expiryInputValue });
                }}
              >
                {updateExpiryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
