import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type AuthUser } from "@/hooks/useAuth";

import ProductCard from "@/components/product-card";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import { Plus, Search, Download, Grid, List, Package, Upload, AlertTriangle, Lock, LockOpen, Tag, PackagePlus, Pencil, Copy, Trash2 } from "lucide-react";
import type { Product, PromotionalOffer } from "@shared/schema";
import { formatCurrency } from "@/lib/currencies";
import { useCurrency } from "@/hooks/useCurrency";
import { UNITS } from "@shared/units";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import ElephantLoader from "@/components/ui/elephant-loader";
import PageHeader from "@/components/PageHeader";
import { SubscriptionUpgradeModal } from "@/components/subscription/SubscriptionUpgradeModal";
import { useSidebarContext } from "@/contexts/sidebar-context";
import { formatNumber } from "@shared/utils/currency";
import BulkUploadDialog from "@/components/product/BulkUploadDialog";
import BatchBreakdownPanel from "@/components/product/BatchBreakdownPanel";
import StockManagementDialog from "@/components/product/StockManagementDialog";
import type { BulkUploadRow, ProductBatch, StockMovement } from "@/components/product/types";
import ProductFormDialog, { type ProductFormData } from "@/components/products/ProductFormDialog";
import DownloadProductsModal from "@/components/products/DownloadProductsModal";

type ProductWithBatches = Product & {
  batchCount?: number;
  nearestExpiry?: string | null;
};

export default function ProductManagement() {
  const { formatMoney } = useCurrency();
  const { user } = useAuth();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';
  const [, navigate] = useLocation();
  const { setMobileTopBarActions } = useSidebarContext();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const saved = localStorage.getItem("productsViewMode");
    return saved === "grid" || saved === "list" ? saved : "grid";
  });
  const handleSetViewMode = (mode: "grid" | "list") => {
    localStorage.setItem("productsViewMode", mode);
    setViewMode(mode);
  };

  const [marginSort, setMarginSort] = useState<"asc" | "desc" | "name_asc" | "name_desc">(() => {
    const saved = localStorage.getItem("productsMarginSort");
    const valid = ["asc", "desc", "name_asc", "name_desc"];
    return (valid.includes(saved ?? "") ? saved : "name_asc") as "asc" | "desc" | "name_asc" | "name_desc";
  });
  const handleSetMarginSort = (value: "asc" | "desc" | "name_asc" | "name_desc") => {
    localStorage.setItem("productsMarginSort", value);
    setMarginSort(value);
  };

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [navigateBackTo, setNavigateBackTo] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductWithBatches | null>(null);
  const [duplicateValues, setDuplicateValues] = useState<Partial<ProductFormData> | null>(null);
  const [isBulkUploadDialogOpen, setIsBulkUploadDialogOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<ProductWithBatches | null>(null);
  const [stockAdjustmentType, setStockAdjustmentType] = useState<"increase" | "decrease">("increase");
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [batchExpiry, setBatchExpiry] = useState("");
  const [batchRef, setBatchRef] = useState("");
  const [batchCostPrice, setBatchCostPrice] = useState("");
  const [expandedBatchProductId, setExpandedBatchProductId] = useState<number | null>(null);
  const [editingExpiryBatchId, setEditingExpiryBatchId] = useState<number | null>(null);
  const [editingExpiryValue, setEditingExpiryValue] = useState<string>("");
  const expiryEditCancelledRef = useRef(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [topUpBatchId, setTopUpBatchId] = useState<number | null>(null);
  const [topUpQuantity, setTopUpQuantity] = useState("");
  const [editCostPriceBatchId, setEditCostPriceBatchId] = useState<number | null>(null);
  const [editCostPriceValue, setEditCostPriceValue] = useState("");
  const [uploadedProducts, setUploadedProducts] = useState<BulkUploadRow[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  const { data: products, isLoading } = useQuery<ProductWithBatches[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await fetch(`/api/products`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
    staleTime: 0,
  });

  // Auto-open edit/stock modal when navigated from the product detail page
  useEffect(() => {
    if (!products || products.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    const stockId = params.get('stock');
    const from = params.get('from');
    if (from) setNavigateBackTo(from);
    else setNavigateBackTo(null);
    if (editId) {
      const found = products.find((p) => p.id === parseInt(editId));
      if (found) {
        setEditingProduct(found);
        setIsDialogOpen(true);
        window.history.replaceState({}, '', '/products');
      }
    } else if (stockId) {
      const found = products.find((p) => p.id === parseInt(stockId));
      if (found) {
        setStockProduct(found);
        window.history.replaceState({}, '', '/products');
      }
    }
  }, [products]);

  const { data: alertsData } = useQuery<{ count: number }>({
    queryKey: ['/api/stock-alerts/count'],
    refetchInterval: 30000,
  });

  const { data: planLimits, isLoading: planLimitsLoading } = useQuery<{
    plan: string;
    limits: { products: number; broadcasts: number; teamMembers: number };
    usage: { products: number; broadcasts: number; teamMembers: number };
    cancelAtPeriodEnd: boolean;
    subscriptionPeriodEnd: string | null;
  }>({
    queryKey: ['/api/subscriptions/plan-limits'],
    staleTime: 5 * 60 * 1000,
  });

  const handleFormDialogClose = useCallback(() => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    setDuplicateValues(null);
    if (navigateBackTo) {
      const dest = navigateBackTo;
      setNavigateBackTo(null);
      navigate(dest);
    }
  }, [navigateBackTo, navigate]);

  const handleAddProductClick = useCallback(() => {
    const limit = planLimits?.limits?.products;
    const usage = planLimits?.usage?.products ?? 0;
    if (limit !== undefined && limit !== -1 && usage >= limit) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingProduct(null);
    setDuplicateValues(null);
    setIsDialogOpen(true);
  }, [planLimits]);

  useEffect(() => {
    const effectiveUserId = user?.role === 'team_member' && user?.wholesalerId
      ? user.wholesalerId
      : user?.id;
    setMobileTopBarActions(
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => window.open(`/preview-store/${effectiveUserId}`, '_blank')}
          className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Preview Store"
        >
          <Package className="h-5 w-5" />
        </button>
        {!isViewer && (
          <button
            onClick={handleAddProductClick}
            disabled={planLimitsLoading}
            className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Add Product"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>
    );
    return () => setMobileTopBarActions(null);
  }, [user, isViewer, planLimitsLoading, planLimits, setMobileTopBarActions, handleAddProductClick]);

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => await apiRequest("DELETE", `/api/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Success", description: "Product deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateProductStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "active" | "inactive" | "out_of_stock" }) =>
      await apiRequest("PATCH", `/api/products/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Success", description: "Product status updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = useCallback((product: Product) => {
    setEditingProduct(product);
    setDuplicateValues(null);
    setIsDialogOpen(true);
  }, []);

  const deleteProductMutate = deleteProductMutation.mutate;
  const handleDelete = useCallback((id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProductMutate(id);
    }
  }, [deleteProductMutate]);

  const handleDuplicate = useCallback((product: Product) => {
    setEditingProduct(null);
    setDuplicateValues({
      name: `${product.name} (Copy)`,
      description: product.description || "",
      price: String(product.price || ""),
      currency: product.currency || "GBP",
      moq: String(product.moq || ""),
      stock: String(product.stock || ""),
      category: product.category || "",
      imageUrl: "",
      images: [],
      priceVisible: Boolean(product.priceVisible),
      status: (product.status || "active") as "active" | "inactive" | "out_of_stock",
      packQuantity: String(product.packQuantity || ""),
      unitOfMeasure: product.unitOfMeasure || "",
      unitSize: String(product.unitSize || ""),
      totalPackageWeight: String(product.totalPackageWeight || ""),
      deliveryExcluded: Boolean(product.deliveryExcluded),
      temperatureRequirement: (product.temperatureRequirement || "ambient") as "ambient" | "chilled" | "frozen",
      contentCategory: (product.contentCategory || "general") as "general" | "food" | "pharmaceuticals" | "electronics" | "textiles",
      specialHandling: typeof product.specialHandling === 'object' ? product.specialHandling as Partial<ProductFormData>['specialHandling'] : {},
      shelfLife: String(product.shelfLife || ""),
      expiryDate: product.expiryDate ? String(product.expiryDate).substring(0, 10) : "",
      lowStockThreshold: String(product.lowStockThreshold || "50"),
      sellingFormat: (product.sellingFormat || "units") as "units" | "pallets" | "both",
      unitsPerPallet: String(product.unitsPerPallet || ""),
      palletPrice: String(product.palletPrice || ""),
      palletMoq: String(product.palletMoq || ""),
      palletStock: String(product.palletStock || ""),
      palletWeight: String(product.palletWeight || ""),
      promotionalOffers: Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [],
    });
    setIsDialogOpen(true);
  }, []);

  const updateProductStatusMutate = updateProductStatusMutation.mutate;
  const handleStatusChange = useCallback((id: number, status: "active" | "inactive" | "out_of_stock" | "locked") => {
    if (status === "locked") {
      toast({ title: "Cannot update status", description: "Product is locked and cannot be modified", variant: "destructive" });
      return;
    }
    updateProductStatusMutate({ id, status });
  }, [updateProductStatusMutate, toast]);

  const handleManageStock = useCallback((p: Product) => {
    setStockProduct(p);
    setStockAdjustmentType("increase");
    setStockQuantity("");
    setStockReason("");
    setBatchExpiry("");
    setBatchRef("");
    setBatchCostPrice(p.costPrice ? String(p.costPrice) : "");
  }, []);

  const { data: stockMovements, isLoading: isLoadingMovements } = useQuery({
    queryKey: [`/api/products/${stockProduct?.id}/stock-movements`],
    enabled: !!stockProduct,
  });

  const stockAdjustmentMutation = useMutation({
    mutationFn: async ({ productId, adjustmentType, quantity, reason }: { productId: number; adjustmentType: string; quantity: number; reason: string }) =>
      apiRequest('POST', `/api/products/${productId}/stock-adjustment`, { adjustmentType, quantity, reason }),
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/stock-movements`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/count'] });
      const qty = variables.quantity;
      const newStock = variables.adjustmentType === 'increase'
        ? (stockProduct?.stock ?? 0) + qty
        : Math.max(0, (stockProduct?.stock ?? 0) - qty);
      setStockProduct((prev) => prev ? { ...prev, stock: newStock } : null);
      toast({ title: "Stock updated", description: `Stock ${stockAdjustmentType === 'increase' ? 'increased' : 'decreased'} by ${stockQuantity} units` });
      setStockQuantity("");
      setStockReason("");
    },
    onError: () => { toast({ title: "Error", description: "Failed to update stock", variant: "destructive" }); },
  });

  const { data: productBatches, isLoading: isLoadingBatches } = useQuery({
    queryKey: [`/api/products/${expandedBatchProductId}/batches`],
    enabled: !!expandedBatchProductId,
  });

  const { data: modalBatches, isLoading: isLoadingModalBatches } = useQuery({
    queryKey: [`/api/products/${stockProduct?.id}/batches`],
    enabled: !!stockProduct && (stockProduct.batchCount ?? 0) > 0,
  });

  const removeBatchStockMutation = useMutation({
    mutationFn: async ({ productId, batchId, delta, reason }: { productId: number; batchId: number; delta: number; reason: string }) =>
      apiRequest('PATCH', `/api/products/${productId}/batches/${batchId}`, { delta, reason }),
    onSuccess: (_, variables) => {
      const newStock = Math.max(0, (stockProduct?.stock ?? 0) + variables.delta);
      setStockProduct((prev) => prev ? { ...prev, stock: newStock } : null);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/stock-movements`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/batches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      toast({ title: "Stock removed", description: "Batch updated and stock movement recorded" });
      setStockQuantity("");
      setStockReason("");
      setSelectedBatchId(null);
    },
    onError: () => { toast({ title: "Error", description: "Failed to remove stock from batch", variant: "destructive" }); },
  });

  const createBatchMutation = useMutation({
    mutationFn: async ({ productId, quantity, expiryDate, batchNumber, costPrice }: {
      productId: number; quantity: number; expiryDate?: string; batchNumber?: string; costPrice?: string;
    }) => apiRequest('POST', `/api/products/${productId}/batches`, { quantity, expiryDate: expiryDate || null, batchNumber: batchNumber || null, costPrice: costPrice || null }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/stock-movements`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/batches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      toast({ title: "Batch added", description: "New stock batch recorded successfully" });
      setStockQuantity("");
      setBatchExpiry("");
      setBatchRef("");
      setBatchCostPrice("");
    },
    onError: () => { toast({ title: "Error", description: "Failed to add batch", variant: "destructive" }); },
  });

  const adjustBatchMutation = useMutation({
    mutationFn: async ({ productId, batchId, delta, reason }: { productId: number; batchId: number; delta: number; reason: string }) =>
      apiRequest('PATCH', `/api/products/${productId}/batches/${batchId}`, { delta, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/batches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/stock-movements`] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stock-alerts'] });
      toast({ title: "Batch updated", description: "Batch quantity adjusted" });
    },
    onError: () => { toast({ title: "Error", description: "Failed to adjust batch", variant: "destructive" }); },
  });

  const updateExpiryMutation = useMutation({
    mutationFn: async ({ productId, batchId, expiryDate }: { productId: number; batchId: number; expiryDate: string | null }) =>
      apiRequest('PATCH', `/api/products/${productId}/batches/${batchId}`, { expiryDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      setEditingExpiryBatchId(null);
      toast({ title: "Expiry updated" });
    },
    onError: () => { toast({ title: "Error", description: "Failed to update expiry date", variant: "destructive" }); },
  });

  const updateBatchCostPriceMutation = useMutation({
    mutationFn: async ({ productId, batchId, costPrice }: { productId: number; batchId: number; costPrice: string | null }) =>
      apiRequest('PATCH', `/api/products/${productId}/batches/${batchId}`, { costPrice }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${stockProduct?.id}/batches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      setEditCostPriceBatchId(null);
      toast({ title: "Cost price updated" });
    },
    onError: () => { toast({ title: "Error", description: "Failed to update cost price", variant: "destructive" }); },
  });

  const depleteBatchMutation = useMutation({
    mutationFn: async ({ productId, batchId }: { productId: number; batchId: number }) =>
      apiRequest('DELETE', `/api/products/${productId}/batches/${batchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${expandedBatchProductId}/batches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/batches/expiring-soon'] });
      toast({ title: "Batch depleted", description: "Batch marked as depleted" });
    },
    onError: () => { toast({ title: "Error", description: "Failed to deplete batch", variant: "destructive" }); },
  });

  const handleAddBatch = () => {
    if (!stockProduct || !stockQuantity) return;
    const qty = parseInt(stockQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Invalid quantity", description: "Please enter a positive number", variant: "destructive" });
      return;
    }
    createBatchMutation.mutate({ productId: stockProduct.id, quantity: qty, expiryDate: batchExpiry || undefined, batchNumber: batchRef || undefined, costPrice: batchCostPrice || undefined });
  };

  const handleStockAdjustment = () => {
    if (!stockProduct || !stockQuantity || !stockReason) return;
    const qty = parseInt(stockQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Invalid quantity", description: "Please enter a positive number", variant: "destructive" });
      return;
    }
    if (stockAdjustmentType === "decrease" && qty > stockProduct.stock) {
      toast({ title: "Insufficient stock", description: `Cannot remove more than ${stockProduct.stock} units`, variant: "destructive" });
      return;
    }
    stockAdjustmentMutation.mutate({ productId: stockProduct.id, adjustmentType: stockAdjustmentType, quantity: qty, reason: stockReason });
  };

  const handleBatchRemoval = () => {
    if (!stockProduct || !stockQuantity || !stockReason) return;
    const qty = parseInt(stockQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "Invalid quantity", description: "Please enter a positive number", variant: "destructive" });
      return;
    }
    const selectedBatch = (modalBatches as ProductBatch[])?.find((b: ProductBatch) => b.id === selectedBatchId);
    if (!selectedBatch) {
      toast({ title: "Please select a batch", description: "Tap a batch from the list above", variant: "destructive" });
      setSelectedBatchId(null);
      return;
    }
    if (qty > selectedBatch.quantity) {
      toast({ title: "Insufficient batch stock", description: `This batch only has ${formatNumber(selectedBatch.quantity)} units`, variant: "destructive" });
      return;
    }
    removeBatchStockMutation.mutate({ productId: stockProduct.id, batchId: selectedBatch.id, delta: -qty, reason: stockReason });
  };

  const handleBatchTopUp = () => {
    if (!stockProduct || !topUpBatchId || !topUpQuantity) return;
    const qty = Number(topUpQuantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast({ title: "Invalid quantity", description: "Please enter a positive whole number", variant: "destructive" });
      return;
    }
    adjustBatchMutation.mutate(
      { productId: stockProduct.id, batchId: topUpBatchId, delta: qty, reason: 'Manual top-up' },
      {
        onSuccess: () => {
          setStockProduct((prev) => prev ? { ...prev, stock: (prev.stock ?? 0) + qty } : null);
          setTopUpBatchId(null);
          setTopUpQuantity("");
        },
      }
    );
  };

  const handleStockDialogClose = useCallback(() => {
    setStockProduct(null);
    setSelectedBatchId(null);
    setTopUpBatchId(null);
    setTopUpQuantity("");
    setEditCostPriceBatchId(null);
    setEditCostPriceValue("");
    setStockQuantity("");
    setStockReason("");
    if (navigateBackTo) {
      const dest = navigateBackTo;
      setNavigateBackTo(null);
      navigate(dest);
    }
  }, [navigateBackTo, navigate]);

  const handleSetAdjustmentType = useCallback((type: "increase" | "decrease") => {
    setStockAdjustmentType(type);
    setStockReason("");
    setStockQuantity("");
    setSelectedBatchId(null);
    setTopUpBatchId(null);
    setTopUpQuantity("");
    setEditCostPriceBatchId(null);
    setEditCostPriceValue("");
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const fileType = file.name.split('.').pop()?.toLowerCase();
    if (fileType === 'csv') {
      Papa.parse(file, {
        header: true,
        complete: (results) => { processUploadedData(results.data as Record<string, string>[]); },
        error: (error) => { toast({ title: "Error", description: "Failed to parse CSV file: " + error.message, variant: "destructive" }); }
      });
    } else if (fileType === 'xlsx') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(buffer);
          const ws = wb.worksheets[0];
          const headers: string[] = [];
          const rows: Record<string, string>[] = [];
          ws.eachRow((row, rowNum) => {
            if (rowNum === 1) {
              row.eachCell((cell, colNum) => { headers[colNum] = cell.text; });
            } else {
              const obj: Record<string, string> = {};
              row.eachCell((cell, colNum) => {
                if (headers[colNum]) obj[headers[colNum]] = cell.text || '';
              });
              if (Object.keys(obj).length > 0) rows.push(obj);
            }
          });
          processUploadedData(rows);
        } catch {
          toast({ title: "Error", description: "Failed to parse Excel file", variant: "destructive" });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast({ title: "Error", description: "Please upload a CSV or Excel file", variant: "destructive" });
    }
  };

  const processUploadedData = (data: Record<string, string>[]) => {
    const errors: string[] = [];
    const validProducts: BulkUploadRow[] = [];
    data.forEach((row, index) => {
      const rowNumber = index + 1;
      if (!row.name || !row.price || !row.moq || !row.stock) {
        errors.push(`Row ${rowNumber}: Missing required fields (name, price, moq, stock)`);
        return;
      }
      if (isNaN(Number(row.price)) || isNaN(Number(row.moq)) || isNaN(Number(row.stock))) {
        errors.push(`Row ${rowNumber}: Price, MOQ, and Stock must be numeric`);
        return;
      }
      if (row.unit) {
        const validUnits = UNITS.map(unit => unit.value);
        if (!validUnits.includes(row.unit)) {
          errors.push(`Row ${rowNumber}: Invalid unit '${row.unit}'. See template for valid units.`);
          return;
        }
      }
      if (row.status && !['active', 'inactive', 'out_of_stock'].includes(row.status)) {
        errors.push(`Row ${rowNumber}: Status must be 'active', 'inactive', or 'out_of_stock'`);
        return;
      }
      validProducts.push({
        name: row.name, description: row.description || "", price: row.price,
        promoPrice: row.promoPrice || "", promoActive: row.promoActive === 'true',
        currency: row.currency || user?.preferredCurrency || "GBP",
        moq: row.moq, stock: row.stock, category: row.category || "",
        imageUrl: row.imageUrl || "", priceVisible: row.priceVisible !== 'false',
        status: row.status || "active", unit: row.unit || "units",
        unitFormat: row.unitFormat || "none", sellingFormat: row.sellingFormat || "units",
        unitsPerPallet: row.unitsPerPallet || "", palletPrice: row.palletPrice || "",
        palletMoq: row.palletMoq || "", palletStock: row.palletStock || "",
        palletWeight: row.palletWeight || "", temperatureRequirement: row.temperatureRequirement || "ambient",
        contentCategory: row.contentCategory || "general",
        specialHandling: { fragile: row.specialHandling_fragile === 'true', perishable: row.specialHandling_perishable === 'true', hazardous: row.specialHandling_hazardous === 'true' },
        deliveryOptions: { pickup: row.deliveryOptions_pickup !== 'false', delivery: row.deliveryOptions_delivery !== 'false' },
      });
    });
    setUploadErrors(errors);
    setUploadedProducts(validProducts);
    setIsBulkUploadDialogOpen(true);
  };

  const bulkCreateProductsMutation = useMutation({
    mutationFn: async (products: BulkUploadRow[]) => {
      const results = [];
      for (const product of products) {
        try {
          const productData = {
            ...product, price: parseFloat(product.price),
            promoPrice: product.promoPrice ? parseFloat(product.promoPrice) : null,
            moq: parseInt(product.moq), stock: parseInt(product.stock),
            unitsPerPallet: product.unitsPerPallet ? parseInt(product.unitsPerPallet) : null,
            palletPrice: product.palletPrice ? parseFloat(product.palletPrice) : null,
            palletMoq: product.palletMoq ? parseInt(product.palletMoq) : null,
            palletStock: product.palletStock ? parseInt(product.palletStock) : null,
            unit: product.unit || "units",
            unitFormat: product.unitFormat === "" ? "none" : (product.unitFormat || "none"),
            palletWeight: product.palletWeight || null,
          };
          const result = await apiRequest("POST", "/api/products", productData);
          results.push({ success: true, product: result });
        } catch (error) {
          results.push({ success: false, error: error instanceof Error ? error.message : "Unknown error", product: product.name });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      toast({ title: "Bulk Upload Complete", description: `${successCount} products created successfully${failCount > 0 ? `, ${failCount} failed` : ''}`, variant: successCount > 0 ? "default" : "destructive" });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      setIsBulkUploadDialogOpen(false);
      setUploadedProducts([]);
      setUploadErrors([]);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: "Failed to create products: " + error.message, variant: "destructive" });
    },
  });

  const filteredProducts = (products?.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    if (statusFilter === "expiring") {
      const now = Date.now();
      const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
      const hasExpiryDate = !!product.expiryDate;
      const nearestExpiryTime = product.nearestExpiry ? new Date(product.nearestExpiry).getTime() : null;
      const hasNearestExpirySoon = nearestExpiryTime !== null && nearestExpiryTime >= now && nearestExpiryTime <= thirtyDaysFromNow;
      return matchesSearch && (hasExpiryDate || hasNearestExpirySoon);
    }
    const matchesStatus = statusFilter === "all" || product.status === statusFilter || (statusFilter === "out_of_stock" && (product.stock === 0 || product.stock === null));
    return matchesSearch && matchesStatus;
  }) || []).sort((a, b) => {
    if (marginSort === "name_asc" || marginSort === "name_desc") {
      const nameA = (a.name || "").toLowerCase().trim();
      const nameB = (b.name || "").toLowerCase().trim();
      if (!nameA && !nameB) return 0;
      if (!nameA) return 1;
      if (!nameB) return -1;
      const cmp = nameA.localeCompare(nameB);
      return marginSort === "name_asc" ? cmp : -cmp;
    }
    if (marginSort === "asc" || marginSort === "desc") {
      const getMargin = (p: Product): number | null => {
        const price = parseFloat(String(p.price));
        const cost = parseFloat(String(p.costPrice));
        if (!isFinite(price) || !isFinite(cost) || price <= 0 || p.costPrice === null || p.costPrice === undefined || p.costPrice === "") return null;
        return ((price - cost) / price) * 100;
      };
      const ma = getMargin(a);
      const mb = getMargin(b);
      if (ma === null && mb === null) return 0;
      if (ma === null) return 1;
      if (mb === null) return -1;
      return marginSort === "asc" ? ma - mb : mb - ma;
    }
    if (statusFilter === "expiring") {
      const getExpiryTime = (p: ProductWithBatches): number => {
        const fromExpiryDate = p.expiryDate ? new Date(p.expiryDate).getTime() : Infinity;
        const fromNearestExpiry = p.nearestExpiry ? new Date(p.nearestExpiry).getTime() : Infinity;
        return Math.min(fromExpiryDate, fromNearestExpiry);
      };
      return getExpiryTime(a) - getExpiryTime(b);
    }
    return 0;
  });

  const hasCostPrice = filteredProducts.some(
    (p) => p.costPrice !== null && p.costPrice !== undefined && p.costPrice !== ""
  );

  const calcMarginPct = (price: string | number, costPrice: string | number): number | null => {
    const p = parseFloat(String(price));
    const c = parseFloat(String(costPrice));
    if (!isFinite(p) || !isFinite(c) || p <= 0) return null;
    return ((p - c) / p) * 100;
  };

  return (
    <>
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <PageHeader title="Products" description="Manage your inventory, pricing, and product details.">
        {(alertsData?.count ?? 0) > 0 && (
          <Link href="/stock-alerts">
            <Button variant="outline" size="sm" className="flex items-center gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
              <AlertTriangle className="h-4 w-4" />
              {alertsData?.count} Stock Alert{(alertsData?.count ?? 0) !== 1 ? "s" : ""}
            </Button>
          </Link>
        )}
      </PageHeader>
      <div className="px-4 sm:px-6 py-5">
        {planLimits?.cancelAtPeriodEnd && (planLimits.usage.products > 2) && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              <span className="font-semibold">Downgrade scheduled:</span>{" "}
              Plan moves to Free{planLimits.subscriptionPeriodEnd ? ' on ' + new Date(planLimits.subscriptionPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}.{" "}
              {planLimits.usage.products - 2} of {planLimits.usage.products} products will lock.{" "}
              <a href="/subscription-pricing" className="font-semibold underline hover:text-amber-900">View billing →</a>
            </span>
          </div>
        )}

        {/* Action Buttons Section */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              className="hidden sm:flex gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
              onClick={() => {
                const effectiveUserId = user?.role === 'team_member' && user?.wholesalerId ? user.wholesalerId : user?.id;
                window.open(`/preview-store/${effectiveUserId}`, '_blank');
              }}
            >
              <Package className="h-4 w-4" />
              Preview Store
            </Button>

            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => setIsDownloadModalOpen(true)}
              disabled={!products || products.length === 0}
              title="Download Products"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => setIsBulkUploadDialogOpen(true)}
              title="Bulk Upload"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Bulk Upload</span>
            </Button>
          </div>

          {!isViewer && (
            <div className="flex items-center gap-3">
              {planLimits && planLimits.limits.products !== -1 && (
                <span className="text-xs text-slate-400 hidden sm:block">
                  {planLimits.usage.products}/{planLimits.limits.products} products
                </span>
              )}
              <ContextualHelpBubble
                topic="Products"
                title="Managing Your Products"
                steps={helpContent.productManagement.steps}
              />
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white hidden sm:flex"
                disabled={planLimitsLoading}
                onClick={handleAddProductClick}
                data-onboarding="add-product-button"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Product
              </Button>
            </div>
          )}
        </div>

        {/* Download Modal */}
        <DownloadProductsModal
          open={isDownloadModalOpen}
          onClose={() => setIsDownloadModalOpen(false)}
          products={products}
          isViewer={isViewer}
        />

        {/* Bulk Upload Dialog */}
        <BulkUploadDialog
          open={isBulkUploadDialogOpen}
          onOpenChange={setIsBulkUploadDialogOpen}
          uploadedProducts={uploadedProducts}
          uploadErrors={uploadErrors}
          onFileUpload={handleFileUpload}
          onConfirmUpload={() => bulkCreateProductsMutation.mutate(uploadedProducts)}
          onCancelUpload={() => { setUploadedProducts([]); setUploadErrors([]); }}
          isBulkCreating={bulkCreateProductsMutation.isPending}
        />

        {/* Product Form Dialog */}
        <ProductFormDialog
          open={isDialogOpen}
          onClose={handleFormDialogClose}
          editingProduct={editingProduct}
          initialValues={duplicateValues}
          isViewer={isViewer}
          navigateBackTo={navigateBackTo}
          onNavigateAfterSave={(dest) => { setNavigateBackTo(null); navigate(dest); }}
          onUpgradeRequired={() => setShowUpgradeModal(true)}
          defaultLowStockThreshold={user?.defaultLowStockThreshold || 50}
        />

        {/* Filters and Search */}
        <div className="sticky top-14 lg:top-0 z-10 bg-white border-b border-slate-100 py-2 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-8 border-slate-200 rounded-lg focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 border-slate-200 rounded-lg">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                <SelectItem value="expiring">Expiring Products</SelectItem>
              </SelectContent>
            </Select>
            <Select value={marginSort} onValueChange={(v) => handleSetMarginSort(v as "asc" | "desc" | "name_asc" | "name_desc")}>
              <SelectTrigger className="w-[160px] h-8 border-slate-200 rounded-lg">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                <SelectItem value="asc">Margin (low → high)</SelectItem>
                <SelectItem value="desc">Margin (high → low)</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button variant={viewMode === "grid" ? "default" : "ghost"} size="sm" onClick={() => handleSetViewMode("grid")} className="p-1.5 h-9 w-9">
                <Grid className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => handleSetViewMode("list")} className="p-1.5 h-9 w-9">
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Products Grid/List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <ElephantLoader message="Loading your product inventory..." />
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((product) => (
              <div key={product.id} className="space-y-3">
                <ProductCard product={product} onStatusChange={handleStatusChange} isViewer={isViewer} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProducts.map((product) => (
              <div key={product.id} className="space-y-3">
                <Card
                  className={`transition-all duration-200 ${product.status === 'locked' ? 'opacity-50 grayscale border-gray-200 cursor-not-allowed' : 'hover:shadow-md hover:border-slate-300 cursor-pointer'}`}
                  onClick={() => product.status !== 'locked' && navigate(`/products/${product.id}`)}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <img
                        src={(product.images && product.images.length > 0) ? product.images[0] : (product.imageUrl || "https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&h=100")}
                        alt={product.name}
                        className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {product.status === 'locked'
                            ? <Lock className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                            : <LockOpen className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                          }
                          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 truncate">{product.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <Badge variant={product.status === "active" ? "default" : (product.status === "inactive" ? "secondary" : "destructive")} className="text-xs">
                            {product.status === "active" ? "Active" : (product.status === "inactive" ? "Inactive" : "Out of Stock")}
                          </Badge>
                          {product.stock === 0 && product.status !== "out_of_stock" && (
                            <Badge className="text-xs bg-red-500 text-white">Out of Stock</Badge>
                          )}
                          {product.stock > 0 && product.stock <= (product.lowStockThreshold || 50) && (
                            <Badge className="text-xs bg-amber-500 text-white">Low Stock</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                          {(() => {
                            const effectiveExpiry = (product.batchCount ?? 0) > 0 ? (product.nearestExpiry || product.expiryDate) : product.expiryDate;
                            if (!effectiveExpiry) return null;
                            const expiry = new Date(effectiveExpiry);
                            const now = new Date(); now.setHours(0, 0, 0, 0);
                            const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                            const formatted = expiry.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
                            if (diffDays < 0) return <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">Expired · {formatted}</Badge>;
                            if (diffDays <= 30) return <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">Expiring soon · {formatted}</Badge>;
                            return <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200">Exp: {formatted}</Badge>;
                          })()}
                          {product.packQuantity && product.unitSize && product.unitOfMeasure && (
                            <Badge variant="outline" className="text-blue-600 border-blue-600 text-xs">
                              {product.packQuantity} x {Math.round(parseFloat(product.unitSize))}{product.unitOfMeasure}
                            </Badge>
                          )}
                        </div>
                        {(() => {
                          const now = new Date();
                          const activePromos: PromotionalOffer[] = Array.isArray(product.promotionalOffers)
                            ? product.promotionalOffers.filter((o: PromotionalOffer) => {
                                if (!o.isActive) return false;
                                if (o.startDate && new Date(o.startDate) > now) return false;
                                if (o.endDate && new Date(o.endDate) < now) return false;
                                return true;
                              })
                            : [];
                          if (activePromos.length === 0) return null;
                          return (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {activePromos.map((promo: PromotionalOffer, i: number) => {
                                let label: string;
                                switch (promo.type) {
                                  case "percentage_discount": label = `${promo.discountPercentage}% off`; break;
                                  case "fixed_price": label = `Now ${formatCurrency(promo.fixedPrice)}`; break;
                                  case "clearance": label = `Clearance ${formatCurrency(promo.fixedPrice)}`; break;
                                  case "buy_x_get_y_free": label = `Buy ${promo.buyQuantity} Get ${promo.getQuantity} Free`; break;
                                  case "bundle_deal": label = `${promo.minQuantity}+ at ${formatCurrency(promo.fixedPrice)} each`; break;
                                  default: label = promo.name || "Promo";
                                }
                                return (
                                  <Badge key={i} className="text-xs bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200">
                                    🏷 {label}
                                  </Badge>
                                );
                              })}
                            </div>
                          );
                        })()}
                        {product.description && (
                          <p className="text-gray-600 text-xs sm:text-sm mt-2 line-clamp-2">{product.description}</p>
                        )}
                        <div className={`grid gap-2 sm:gap-4 mt-3 text-xs sm:text-sm ${hasCostPrice ? 'grid-cols-4' : 'grid-cols-3'}`}>
                          <div>
                            <span className="text-gray-500">Price:</span>
                            <div className="font-semibold">
                              {product.priceVisible ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  {product.promoActive && product.promoPrice ? (
                                    <>
                                      <span className="text-green-600">{formatMoney(parseFloat(product.promoPrice))}</span>
                                      <span className="text-gray-500 line-through text-xs">{formatMoney(parseFloat(product.price))}</span>
                                    </>
                                  ) : formatMoney(parseFloat(product.price))}
                                </div>
                              ) : "Hidden"}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-500">MOQ:</span>
                            <div className="font-semibold">{formatNumber(product.moq)} units</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Stock:</span>
                            <div className={`font-semibold ${product.stock > 10 ? 'text-green-600' : product.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {formatNumber(product.stock)} units
                            </div>
                            {(product.batchCount ?? 0) > 0 && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {product.batchCount} batch{(product.batchCount ?? 0) !== 1 ? 'es' : ''}
                                {product.nearestExpiry && (() => {
                                  const exp = new Date(product.nearestExpiry);
                                  const now = new Date(); now.setHours(0, 0, 0, 0);
                                  const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                  const fmt = exp.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
                                  if (diff < 0) return <span className="text-red-600 font-medium"> · Exp: {fmt}</span>;
                                  if (diff <= 30) return <span className="text-amber-600 font-medium"> · Exp: {fmt}</span>;
                                  return <span> · Exp: {fmt}</span>;
                                })()}
                              </div>
                            )}
                          </div>
                          {hasCostPrice && (() => {
                            const margin = (product.costPrice !== null && product.costPrice !== undefined && product.costPrice !== "")
                              ? calcMarginPct(product.price, product.costPrice)
                              : null;
                            if (margin === null) {
                              return <div><span className="text-gray-500">Margin %:</span><div className="text-gray-400 font-semibold">—</div></div>;
                            }
                            const marginColor = margin < 0 ? 'text-red-600' : margin < 15 ? 'text-amber-600' : 'text-green-600';
                            return (
                              <div>
                                <span className="text-gray-500">Margin %:</span>
                                <div className={`font-semibold flex items-center gap-1 ${marginColor}`}>
                                  {margin.toFixed(1)}%
                                  {margin < 0 && <AlertTriangle className="h-3 w-3" />}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        {!isViewer && (
                          <div className="flex items-center gap-0.5 mt-2 -ml-1.5">
                            <Button
                              variant="ghost" size="icon" className={`h-8 w-8 ${product.status === 'locked' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={(e) => { e.stopPropagation(); product.status !== 'locked' && handleEdit(product); }}
                              disabled={product.status === 'locked'} title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className={`h-8 w-8 ${product.status === 'locked' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={(e) => { e.stopPropagation(); if (product.status !== 'locked') { setStockProduct(product); setStockAdjustmentType("increase"); setStockQuantity(""); setStockReason(""); setBatchExpiry(""); setBatchRef(""); setBatchCostPrice(product.costPrice ? String(product.costPrice) : ""); } }}
                              disabled={product.status === 'locked'} title="Manage Stock"
                            >
                              <PackagePlus className="h-4 w-4" />
                            </Button>
                            {(product.batchCount ?? 0) > 0 && (
                              <Button
                                variant="ghost" size="sm" className="h-8 px-2 text-xs text-blue-600 hover:text-blue-700"
                                onClick={(e) => { e.stopPropagation(); setExpandedBatchProductId(prev => prev === product.id ? null : product.id); }}
                              >
                                {expandedBatchProductId === product.id ? 'Hide batches' : `${product.batchCount} batch${(product.batchCount ?? 0) !== 1 ? 'es' : ''}`}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {expandedBatchProductId === product.id && (
                  <BatchBreakdownPanel
                    product={product}
                    productBatches={productBatches as ProductBatch[]}
                    isLoadingBatches={isLoadingBatches}
                    editingExpiryBatchId={editingExpiryBatchId}
                    setEditingExpiryBatchId={setEditingExpiryBatchId}
                    editingExpiryValue={editingExpiryValue}
                    setEditingExpiryValue={setEditingExpiryValue}
                    expiryEditCancelledRef={expiryEditCancelledRef}
                    isViewer={isViewer}
                    onAdjustBatch={(args) => adjustBatchMutation.mutate(args)}
                    onDepleteBatch={(args) => depleteBatchMutation.mutate(args)}
                    onUpdateExpiry={(args) => updateExpiryMutation.mutate(args)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {!isLoading && filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No products found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {statusFilter === "expiring"
                ? "No expiry dates set — add expiry dates to your products to track them here"
                : searchQuery || statusFilter !== "all"
                ? "Try adjusting your search or filters"
                : "Get started by creating your first product"}
            </p>
            {!(searchQuery || statusFilter !== "all") && !isViewer && (
              <div className="mt-6">
                <Button onClick={() => { setEditingProduct(null); setDuplicateValues(null); setIsDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <StockManagementDialog
        open={!!stockProduct}
        onClose={handleStockDialogClose}
        stockProduct={stockProduct}
        isViewer={isViewer}
        stockAdjustmentType={stockAdjustmentType}
        onSetAdjustmentType={handleSetAdjustmentType}
        modalBatches={modalBatches as ProductBatch[] | undefined}
        isLoadingModalBatches={isLoadingModalBatches}
        stockMovements={stockMovements as StockMovement[] | undefined}
        isLoadingMovements={isLoadingMovements}
        stockQuantity={stockQuantity}
        setStockQuantity={setStockQuantity}
        batchExpiry={batchExpiry}
        setBatchExpiry={setBatchExpiry}
        batchRef={batchRef}
        setBatchRef={setBatchRef}
        batchCostPrice={batchCostPrice}
        setBatchCostPrice={setBatchCostPrice}
        onAddBatch={handleAddBatch}
        isAddingBatch={createBatchMutation.isPending}
        selectedBatchId={selectedBatchId}
        setSelectedBatchId={setSelectedBatchId}
        stockReason={stockReason}
        setStockReason={setStockReason}
        onRemoveBatchStock={handleBatchRemoval}
        isRemovingBatchStock={removeBatchStockMutation.isPending}
        onStockAdjustment={handleStockAdjustment}
        isAdjustingStock={stockAdjustmentMutation.isPending}
        topUpBatchId={topUpBatchId}
        setTopUpBatchId={setTopUpBatchId}
        topUpQuantity={topUpQuantity}
        setTopUpQuantity={setTopUpQuantity}
        onBatchTopUp={handleBatchTopUp}
        isTopUpPending={adjustBatchMutation.isPending}
        editCostPriceBatchId={editCostPriceBatchId}
        setEditCostPriceBatchId={setEditCostPriceBatchId}
        editCostPriceValue={editCostPriceValue}
        setEditCostPriceValue={setEditCostPriceValue}
        onUpdateBatchCostPrice={(args) => updateBatchCostPriceMutation.mutate(args)}
        isUpdatingCostPrice={updateBatchCostPriceMutation.isPending}
      />
    </div>

    <SubscriptionUpgradeModal
      open={showUpgradeModal}
      onOpenChange={setShowUpgradeModal}
      feature="more products"
      currentPlan={planLimits?.plan ?? "Free"}
    />
    </>
  );
}
