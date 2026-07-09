import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useSidebarPermissions } from "@/hooks/useSidebarPermissions";
import { Plus, Pencil, Trash2, Tag, Percent, Package, ShoppingCart, Flame, Calendar, ToggleLeft, ToggleRight, TrendingUp, Clock, AlertCircle, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/PageHeader";
import { useCurrency } from "@/hooks/useCurrency";

const PROMOTION_TYPES = [
  { value: "percentage_discount", label: "Percentage Discount", icon: Percent, color: "bg-blue-100 text-blue-800" },
  { value: "fixed_price", label: "Fixed Price", icon: Tag, color: "bg-green-100 text-green-800" },
  { value: "buy_x_get_y_free", label: "Buy X Get Y Free", icon: ShoppingCart, color: "bg-purple-100 text-purple-800" },
  { value: "bundle_deal", label: "Bundle Deal", icon: Package, color: "bg-orange-100 text-orange-800" },
  { value: "clearance", label: "Clearance", icon: Flame, color: "bg-red-100 text-red-800" },
] as const;

type PromotionType = typeof PROMOTION_TYPES[number]["value"];

interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  discountPercentage?: number;
  fixedPrice?: number;
  buyQuantity?: number;
  getQuantity?: number;
  minQuantity?: number;
  description?: string;
  productId: number;
  productName: string;
  productPrice: number;
  productImage?: string;
  productStock: number;
  createdAt: string;
  updatedAt: string;
}

interface Product {
  id: number;
  name: string;
  price: string | number;
  imageUrl?: string;
  stock: number;
}

interface FormState {
  productId: string;
  name: string;
  type: PromotionType | "";
  startDate: string;
  endDate: string;
  discountPercentage: string;
  fixedPrice: string;
  buyQuantity: string;
  getQuantity: string;
  minQuantity: string;
  description: string;
}

const emptyForm: FormState = {
  productId: "",
  name: "",
  type: "",
  startDate: "",
  endDate: "",
  discountPercentage: "",
  fixedPrice: "",
  buyQuantity: "",
  getQuantity: "",
  minQuantity: "",
  description: "",
};

function getPromotionStatus(promo: Promotion): "active" | "scheduled" | "expired" {
  const now = new Date();
  if (!promo.isActive) return "expired";
  if (promo.endDate && new Date(promo.endDate) < now) return "expired";
  if (promo.startDate && new Date(promo.startDate) > now) return "scheduled";
  return "active";
}

function getStatusBadge(status: "active" | "scheduled" | "expired") {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
    case "scheduled":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Scheduled</Badge>;
    case "expired":
      return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">Expired</Badge>;
  }
}

function getTypeBadge(type: string) {
  const t = PROMOTION_TYPES.find((pt) => pt.value === type);
  if (!t) return <Badge variant="outline">{type}</Badge>;
  return <Badge className={`${t.color} hover:${t.color}`}>{t.label}</Badge>;
}

function formatPromoValue(promo: Promotion, fmt: (v: number) => string): string {
  switch (promo.type) {
    case "percentage_discount":
      return `${promo.discountPercentage}% off`;
    case "fixed_price":
      return `Now ${fmt(promo.fixedPrice ?? 0)}`;
    case "buy_x_get_y_free":
      return `Buy ${promo.buyQuantity} Get ${promo.getQuantity} Free`;
    case "bundle_deal":
      return `${promo.minQuantity}+ at ${fmt(promo.fixedPrice ?? 0)} each`;
    case "clearance":
      return `Clearance ${fmt(promo.fixedPrice ?? 0)}`;
    default:
      return "";
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function Promotions() {
  const { formatMoney } = useCurrency();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { checkTabAccess, permissionsLoading } = useSidebarPermissions();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';
  const search = useSearch();

  useEffect(() => {
    if (permissionsLoading) return;
    if (user?.role === 'team_member' && !checkTabAccess('promotions')) {
      toast({
        title: "Access restricted",
        description: "You don't have permission to view the Promotions page.",
        variant: "destructive",
      });
      setLocation('/');
    }
  }, [user, permissionsLoading, checkTabAccess, toast, setLocation]);

  const urlProductId = new URLSearchParams(search).get("productId") || "";
  const [filter, setFilter] = useState<"all" | "active" | "scheduled" | "expired">("all");
  const [productFilter, setProductFilter] = useState<string>(urlProductId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm, productId: urlProductId });

  const { data: promotions = [], isLoading: promosLoading } = useQuery<Promotion[]>({
    queryKey: ["/api/promotions"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  useEffect(() => {
    if (!urlProductId || promosLoading || products.length === 0) return;
    setProductFilter(urlProductId);
    if (isViewer) {
      setIsDialogOpen(false); // ensure dialog stays closed even if auth resolves late
      return;
    }
    const existingPromos = promotions.filter((p) => String(p.productId) === urlProductId);
    if (existingPromos.length === 0) {
      setEditingPromo(null);
      setForm({ ...emptyForm, productId: urlProductId });
      setIsDialogOpen(true);
    } else if (existingPromos.length === 1) {
      openEdit(existingPromos[0]!);
    }
    // 2+ promos: just show filtered list, no dialog
  }, [urlProductId, promosLoading, products.length, promotions.length, isViewer]);

  const createMutation = useMutation({
    mutationFn: async (data: { productId: string; body: Record<string, unknown> }) => {
      await apiRequest("POST", `/api/products/${data.productId}/promotions`, data.body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Promotion Created", description: "Your promotion has been created successfully." });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { productId: number; promoId: string; body: Record<string, unknown> }) => {
      await apiRequest("PATCH", `/api/products/${data.productId}/promotions/${data.promoId}`, data.body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Promotion Updated", description: "Your promotion has been updated successfully." });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (data: { productId: number; promoId: string }) => {
      await apiRequest("DELETE", `/api/products/${data.productId}/promotions/${data.promoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Promotion Deleted", description: "The promotion has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (data: { productId: number; promoId: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/products/${data.productId}/promotions/${data.promoId}`, {
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Promotion Updated", description: "Promotion status has been toggled." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setIsDialogOpen(false);
    setEditingPromo(null);
    setForm({ ...emptyForm, productId: productFilter });
  }

  function openCreate() {
    setEditingPromo(null);
    setForm({ ...emptyForm, productId: productFilter });
    setIsDialogOpen(true);
  }

  function openEdit(promo: Promotion) {
    setEditingPromo(promo);
    setForm({
      productId: String(promo.productId),
      name: promo.name,
      type: promo.type,
      startDate: promo.startDate ? promo.startDate.split("T")[0]! : "",
      endDate: promo.endDate ? promo.endDate.split("T")[0]! : "",
      discountPercentage: promo.discountPercentage != null ? String(promo.discountPercentage) : "",
      fixedPrice: promo.fixedPrice != null ? String(promo.fixedPrice) : "",
      buyQuantity: promo.buyQuantity != null ? String(promo.buyQuantity) : "",
      getQuantity: promo.getQuantity != null ? String(promo.getQuantity) : "",
      minQuantity: promo.minQuantity != null ? String(promo.minQuantity) : "",
      description: promo.description || "",
    });
    setIsDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.type) {
      toast({ title: "Error", description: "Please select a promotion type.", variant: "destructive" });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: "Error", description: "Please enter a promotion name.", variant: "destructive" });
      return;
    }

    const body: Record<string, unknown> = {
      name: form.name,
      type: form.type,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      description: form.description || undefined,
    };

    if (form.type === "percentage_discount") {
      body.discountPercentage = Number(form.discountPercentage);
    }
    if (form.type === "fixed_price" || form.type === "clearance") {
      body.fixedPrice = Number(form.fixedPrice);
    }
    if (form.type === "buy_x_get_y_free") {
      body.buyQuantity = Number(form.buyQuantity);
      body.getQuantity = Number(form.getQuantity);
    }
    if (form.type === "bundle_deal") {
      body.minQuantity = Number(form.minQuantity);
      body.fixedPrice = Number(form.fixedPrice);
    }

    if (editingPromo) {
      updateMutation.mutate({ productId: editingPromo.productId, promoId: editingPromo.id, body });
    } else {
      if (!form.productId) {
        toast({ title: "Error", description: "Please select a product.", variant: "destructive" });
        return;
      }
      createMutation.mutate({ productId: form.productId, body });
    }
  }

  const promoStatuses = promotions.map((p) => ({ ...p, status: getPromotionStatus(p) }));
  const activeCount = promoStatuses.filter((p) => p.status === "active").length;
  const scheduledCount = promoStatuses.filter((p) => p.status === "scheduled").length;
  const expiredCount = promoStatuses.filter((p) => p.status === "expired").length;

  const statusFiltered = filter === "all" ? promoStatuses : promoStatuses.filter((p) => p.status === filter);
  const filtered = productFilter ? statusFiltered.filter((p) => String(p.productId) === productFilter) : statusFiltered;
  const filteredProductName = productFilter ? (products as Product[]).find((p) => String(p.id) === productFilter)?.name : undefined;

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <PageHeader title="Promotions" description="Manage promotional offers across your products" />
    <div className="px-4 sm:px-6 py-5 max-w-6xl mx-auto">

      {!isViewer && (
        <div className="flex items-center justify-end gap-3 mb-5">
          <Button size="sm" onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Create Promotion</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </div>
      )}

      <div className="flex gap-2 mb-5">
        <div className="flex-1 flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0" />
          <span className="text-xs text-green-700 font-medium">Active</span>
          <span className="ml-auto text-base font-bold text-green-800">{activeCount}</span>
        </div>
        <div className="flex-1 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <Clock className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span className="text-xs text-blue-700 font-medium">Scheduled</span>
          <span className="ml-auto text-base font-bold text-blue-800">{scheduledCount}</span>
        </div>
        <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 text-gray-500 flex-shrink-0" />
          <span className="text-xs text-gray-600 font-medium">Expired</span>
          <span className="ml-auto text-base font-bold text-gray-700">{expiredCount}</span>
        </div>
      </div>

      <div className="sticky top-14 lg:top-0 z-10 bg-white border-b border-slate-100 py-2 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as "all" | "active" | "scheduled" | "expired")}>
            <SelectTrigger className="w-[150px] h-8 border-slate-200 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Promotions</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          {filteredProductName && (
            <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-full px-3 py-1 text-sm text-green-800">
              <Tag className="h-3.5 w-3.5" />
              <span className="font-medium">{filteredProductName}</span>
              <button
                onClick={() => setProductFilter("")}
                className="ml-1 text-green-600 hover:text-green-900 font-bold leading-none"
                aria-label="Clear product filter"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      {promosLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-16 bg-gray-200 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Tag className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No promotions found</h3>
            <p className="text-sm text-gray-500 mb-4">
              {filter === "all"
                ? "Create your first promotion to attract more customers."
                : `No ${filter} promotions at the moment.`}
            </p>
            {filter === "all" && !isViewer && (
              <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Promotion
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((promo) => {
            const status = promo.status;
            return (
              <Card key={promo.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {promo.productImage ? (
                      <img
                        src={promo.productImage}
                        alt={promo.productName}
                        className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Package className="h-6 w-6 text-gray-400" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="font-semibold text-gray-900 leading-tight">{promo.name}</h3>
                        {!isViewer && (
                          <div className="flex items-center gap-0.5 flex-shrink-0 -mt-1 -mr-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                toggleMutation.mutate({
                                  productId: promo.productId,
                                  promoId: promo.id,
                                  isActive: !promo.isActive,
                                })
                              }
                              title={promo.isActive ? "Deactivate" : "Activate"}
                            >
                              {promo.isActive ? (
                                <ToggleRight className="h-5 w-5 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-5 w-5 text-gray-400" />
                              )}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4 text-gray-500" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem onClick={() => openEdit(promo)}>
                                  <Pencil className="h-4 w-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => deleteMutation.mutate({ productId: promo.productId, promoId: promo.id })}
                                  disabled={deleteMutation.isPending}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {getTypeBadge(promo.type)}
                        {getStatusBadge(status)}
                      </div>
                      <p className="text-sm text-gray-500 mb-1.5">{promo.productName}</p>
                      <div className="flex items-center gap-3 text-sm mb-1.5">
                        <span className="text-gray-400 line-through">{formatMoney(promo.productPrice)}</span>
                        <span className="font-semibold text-green-700">{formatPromoValue(promo, formatMoney)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span>{formatDate(promo.startDate)} — {formatDate(promo.endDate)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPromo ? "Edit Promotion" : "Create Promotion"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {!editingPromo && (
              <div>
                <Label>Product</Label>
                <Select value={form.productId} onValueChange={(v) => setForm({ ...form, productId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} — {formatMoney(p.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Promotion Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Summer Sale 20% Off"
              />
            </div>

            <div>
              <Label>Promotion Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PromotionType })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {PROMOTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.type === "percentage_discount" && (
              <div>
                <Label>Discount Percentage (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={form.discountPercentage}
                  onChange={(e) => setForm({ ...form, discountPercentage: e.target.value })}
                  placeholder="e.g. 20"
                />
              </div>
            )}

            {(form.type === "fixed_price" || form.type === "clearance") && (
              <div>
                <Label>{form.type === "clearance" ? "Clearance Price (£)" : "Promotional Price (£)"}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.fixedPrice}
                  onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })}
                  placeholder="e.g. 3.50"
                />
              </div>
            )}

            {form.type === "buy_x_get_y_free" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Buy Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.buyQuantity}
                    onChange={(e) => setForm({ ...form, buyQuantity: e.target.value })}
                    placeholder="e.g. 10"
                  />
                </div>
                <div>
                  <Label>Get Free</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.getQuantity}
                    onChange={(e) => setForm({ ...form, getQuantity: e.target.value })}
                    placeholder="e.g. 2"
                  />
                </div>
              </div>
            )}

            {form.type === "bundle_deal" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Minimum Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.minQuantity}
                    onChange={(e) => setForm({ ...form, minQuantity: e.target.value })}
                    placeholder="e.g. 5"
                  />
                </div>
                <div>
                  <Label>Price Each (£)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.fixedPrice}
                    onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })}
                    placeholder="e.g. 4.00"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe this promotion..."
                rows={3}
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isSaving ? "Saving..." : editingPromo ? "Update Promotion" : "Create Promotion"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
