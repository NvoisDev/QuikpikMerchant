import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { apiRequest } from "@/lib/queryClient";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import {
  Plus, Tag, Package, Users, Edit3, Calendar, Lock, ChevronDown, ChevronUp,
  Check, X, Share2, Download, Trash2, MoreHorizontal, AlertTriangle, AlertCircle, Eye, Search,
} from "lucide-react";
import { SubscriptionUpgradeModal } from "@/components/subscription/SubscriptionUpgradeModal";

interface PriceListSummary {
  id: number;
  wholesalerId: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  assignmentCount: number;
}

interface PriceListItemForm {
  productId: number;
  product: { id: number; name: string; price: string; palletPrice?: string | null } | undefined;
  customPrice: string;
  discountPercentage: string;
  customPalletPrice: string;
}

interface PriceListAssignmentForm {
  customerId: string | null;
  customerGroupId: number | null;
}

interface PriceListDetail extends PriceListSummary {
  items: PriceListItemForm[];
  assignments: PriceListAssignmentForm[];
}

interface PLProduct {
  id: number;
  name: string;
  price: string;
  palletPrice?: string | null;
  palletQuantity?: number | null;
  unitsPerPallet?: number | null;
  packQuantity?: number | null;
  unitSize?: string | null;
  unitOfMeasure?: string | null;
  status?: string;
}

interface PriceListFormInput {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface Customer {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phoneNumber: string;
  businessName?: string;
}

interface CustomerGroup {
  id: number;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt: string;
  whatsappGroupId?: string;
}

interface PlanLimits {
  plan: string;
  limits: { products: number; broadcasts: number; teamMembers: number; customGroups: number; priceLists: number };
  usage: { products: number; broadcasts: number; teamMembers: number; priceLists: number };
}

interface PriceListManagementDialogProps {
  customers: Customer[];
  user: { id: string; role?: string } | null;
  customerGroups: CustomerGroup[];
  planLimits: PlanLimits | undefined;
  planLimitsLoading: boolean;
  priceListIdFromUrl: number | null;
  onActivatePriceListsTab: () => void;
  filterCustomer: { id: string; name: string } | null;
  onFilterChange: (filter: { id: string; name: string } | null) => void;
}

export function PriceListManagementDialog({
  customers,
  user,
  customerGroups,
  planLimits,
  planLimitsLoading,
  priceListIdFromUrl,
  onActivatePriceListsTab,
  filterCustomer,
  onFilterChange,
}: PriceListManagementDialogProps) {
  const { formatMoney } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isPriceListModalOpen, setIsPriceListModalOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState<PriceListSummary | null>(null);
  const [isManagePriceListOpen, setIsManagePriceListOpen] = useState(false);
  const [managingPriceList, setManagingPriceList] = useState<PriceListSummary | null>(null);
  const [plProductSearch, setPlProductSearch] = useState("");
  const [priceListItems, setPriceListItems] = useState<PriceListItemForm[]>([]);
  const [incompletePLItems, setIncompletePLItems] = useState<Set<number>>(new Set());
  const [priceListAssignments, setPriceListAssignments] = useState<PriceListAssignmentForm[]>([]);
  const [priceListForm, setPriceListForm] = useState({
    name: "", description: "", startDate: "", endDate: "", isActive: true,
  });
  const [expandedPriceLists, setExpandedPriceLists] = useState<Record<number, boolean>>({});
  const [expandedPriceListSearch, setExpandedPriceListSearch] = useState<Record<number, string>>({});
  const [priceListDetailCache, setPriceListDetailCache] = useState<Record<number, PriceListDetail>>({});
  const [sharingListId, setSharingListId] = useState<number | null>(null);
  const [isSharingCatalogue, setIsSharingCatalogue] = useState<'xlsx' | 'pdf' | null>(null);
  const [showCataloguePreview, setShowCataloguePreview] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleCreatePriceListClick = () => {
    if (planLimits && planLimits.limits.priceLists !== -1 && (planLimits.usage.priceLists ?? 0) >= planLimits.limits.priceLists) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingPriceList(null);
    setPriceListForm({ name: "", description: "", startDate: "", endDate: "", isActive: true });
    setIsPriceListModalOpen(true);
  };
  const autoExpandedRef = useRef(false);

  const { data: fetchedPriceLists = [], isLoading: isLoadingPriceLists } = useQuery<PriceListSummary[]>({
    queryKey: ['/api/price-lists'],
  });

  const { data: priceListCustomerSummary = {} } = useQuery<Record<string, { count: number; names: string[]; ids: number[] }>>({
    queryKey: ['/api/price-lists/customer-summary'],
  });

  const { data: productsForPL = [], isLoading: isLoadingProducts } = useQuery<PLProduct[]>({
    queryKey: ['/api/products'],
  });

  useEffect(() => {
    if (!priceListIdFromUrl || autoExpandedRef.current || isLoadingPriceLists) return;
    const target = fetchedPriceLists.find((pl) => pl.id === priceListIdFromUrl);
    if (!target) return;
    autoExpandedRef.current = true;
    onActivatePriceListsTab();
    setExpandedPriceLists((prev) => ({ ...prev, [priceListIdFromUrl]: true }));
    if (!priceListDetailCache[priceListIdFromUrl]) {
      apiRequest('GET', `/api/price-lists/${priceListIdFromUrl}`)
        .then((res) => res.json())
        .then((detail: PriceListDetail) => {
          setPriceListDetailCache((prev) => ({ ...prev, [priceListIdFromUrl]: detail }));
        })
        .catch((err) => {
          console.error('[PriceListManagementDialog] failed to load price list detail:', err);
          toast({ title: "Couldn't load price list details", description: "Some pricing details failed to load.", variant: "destructive" });
        });
    }
  // priceListDetailCache intentionally omitted: autoExpandedRef guards against re-runs after cache updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceListIdFromUrl, fetchedPriceLists, isLoadingPriceLists]);

  const createPriceListMutation = useMutation({
    mutationFn: (data: PriceListFormInput) => apiRequest('POST', '/api/price-lists', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setIsPriceListModalOpen(false);
      setPriceListForm({ name: "", description: "", startDate: "", endDate: "", isActive: true });
      toast({ title: "Created", description: "Price list created successfully!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updatePriceListMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PriceListFormInput> }) => apiRequest('PATCH', `/api/price-lists/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setIsPriceListModalOpen(false);
      setEditingPriceList(null);
      toast({ title: "Updated", description: "Price list updated!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePriceListMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/price-lists/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setPriceListDetailCache(prev => { const next = { ...prev }; delete next[id]; return next; });
      setExpandedPriceLists(prev => { const next = { ...prev }; delete next[id]; return next; });
      toast({ title: "Deleted", description: "Price list deleted." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const refreshPriceListDetail = async (id: number) => {
    try {
      const res = await apiRequest('GET', `/api/price-lists/${id}`);
      const detail = await res.json() as PriceListDetail;
      setPriceListDetailCache(prev => ({ ...prev, [id]: detail }));
    } catch {
      // silently ignore — summary panel will remain empty
    }
  };

  const savePLItemsMutation = useMutation({
    mutationFn: ({ id, items }: { id: number; items: PriceListItemForm[] }) => apiRequest('PUT', `/api/price-lists/${id}/items`, items),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setPriceListDetailCache(prev => { const next = { ...prev }; delete next[variables.id]; return next; });
      if (expandedPriceLists[variables.id]) {
        refreshPriceListDetail(variables.id);
      }
      toast({ title: "Saved", description: "Products updated!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const savePLAssignmentsMutation = useMutation({
    mutationFn: ({ id, assignments }: { id: number; assignments: PriceListAssignmentForm[] }) => apiRequest('PUT', `/api/price-lists/${id}/assignments`, assignments),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setPriceListDetailCache(prev => { const next = { ...prev }; delete next[variables.id]; return next; });
      if (expandedPriceLists[variables.id]) {
        refreshPriceListDetail(variables.id);
      }
      toast({ title: "Saved", description: "Assignments updated!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleNativeShare = async (listId: number, listName: string) => {
    const portalUrl = `${window.location.origin}/customer/${user?.id}`;

    if (typeof navigator.share !== "function") {
      const a = document.createElement("a");
      a.href = `/api/price-lists/${listId}/export`;
      a.download = `${listName} - Price List.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    setSharingListId(listId);
    try {
      const response = await fetch(`/api/price-lists/${listId}/export`);
      if (!response.ok) throw new Error("Failed to fetch price list");
      const blob = await response.blob();
      const file = new File([blob], `${listName} - Price List.xlsx`, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: listName,
          text: "Your exclusive price list — shop at the link below.",
          url: portalUrl,
          files: [file],
        });
      } else {
        await navigator.share({
          title: listName,
          text: "Your exclusive price list — shop at the link below.",
          url: portalUrl,
        });
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        // nothing to do
      } else if ((err as { name?: string })?.name === "NotAllowedError") {
        const a = document.createElement("a");
        a.href = `/api/price-lists/${listId}/export`;
        a.download = `${listName} - Price List.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        toast({ title: "Could not share", description: (err as { message?: string })?.message || "Something went wrong.", variant: "destructive" });
      }
    } finally {
      setSharingListId(null);
    }
  };

  const handleShareCatalogue = async (format: 'xlsx' | 'pdf') => {
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const url = `/api/products/catalogue-export?format=${format}`;
    const fileName = `Standard Price List.${ext}`;

    if (typeof navigator.share !== 'function') {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    setIsSharingCatalogue(format);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch catalogue');
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: mimeType });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Standard Price List', files: [file] });
      } else {
        await navigator.share({ title: 'Standard Price List', url: window.location.origin });
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        // dismissed by user
      } else if ((err as { name?: string })?.name === 'NotAllowedError') {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        toast({ title: 'Could not share', description: (err as { message?: string })?.message || 'Something went wrong.', variant: 'destructive' });
      }
    } finally {
      setIsSharingCatalogue(null);
    }
  };

  const openManagePriceList = async (list: PriceListSummary) => {
    setIncompletePLItems(new Set());
    setManagingPriceList(list);
    setPriceListForm({
      name: list.name,
      description: list.description || "",
      startDate: list.startDate || "",
      endDate: list.endDate || "",
      isActive: list.isActive,
    });
    try {
      const res = await apiRequest('GET', `/api/price-lists/${list.id}`);
      const detail = await res.json() as PriceListDetail;
      setPriceListItems((detail.items || []).map(item => ({
        ...item,
        customPrice: item.customPrice ?? "",
        discountPercentage: item.discountPercentage ?? "",
        customPalletPrice: item.customPalletPrice ?? "",
      })));
      setPriceListAssignments(detail.assignments || []);
    } catch {
      setPriceListItems([]);
      setPriceListAssignments([]);
      toast({ title: "Could not load price list", description: "Please close and try again.", variant: "destructive" });
    }
    setIsManagePriceListOpen(true);
  };

  const togglePriceListExpanded = async (list: PriceListSummary) => {
    const isOpen = expandedPriceLists[list.id];
    setExpandedPriceLists(prev => ({ ...prev, [list.id]: !isOpen }));
    if (isOpen) {
      setExpandedPriceListSearch(prev => { const next = { ...prev }; delete next[list.id]; return next; });
    }
    if (!isOpen && !priceListDetailCache[list.id]) {
      try {
        const res = await apiRequest('GET', `/api/price-lists/${list.id}`);
        const detail = await res.json() as PriceListDetail;
        setPriceListDetailCache(prev => ({ ...prev, [list.id]: detail }));
      } catch {
        // silently ignore — counts still visible on the card
      }
    }
  };

  const addProductToPL = (product: { id: number; name: string; price: string; palletPrice?: string | null }) => {
    if (priceListItems.some(i => i.productId === product.id)) return;
    setPriceListItems(prev => [...prev, { productId: product.id, product, customPrice: "", discountPercentage: "", customPalletPrice: "" }]);
  };

  const removeProductFromPL = (productId: number) => {
    setPriceListItems(prev => prev.filter(i => i.productId !== productId));
    setIncompletePLItems(prev => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  };

  const updatePLItemPrice = (productId: number, field: 'customPrice' | 'discountPercentage' | 'customPalletPrice', value: string) => {
    setPriceListItems(prev => prev.map(i => i.productId === productId ? { ...i, [field]: value } : i));
    if (value) {
      setIncompletePLItems(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const togglePLCustomerAssignment = (customerId: string) => {
    setPriceListAssignments(prev => {
      const has = prev.some(a => a.customerId === customerId);
      if (has) return prev.filter(a => a.customerId !== customerId);
      return [...prev, { customerId, customerGroupId: null }];
    });
  };

  const togglePLGroupAssignment = (groupId: number) => {
    setPriceListAssignments(prev => {
      const has = prev.some(a => a.customerGroupId === groupId);
      if (has) return prev.filter(a => a.customerGroupId !== groupId);
      return [...prev, { customerId: null, customerGroupId: groupId }];
    });
  };

  const filteredPriceLists = filterCustomer
    ? fetchedPriceLists.filter((list) =>
        (priceListCustomerSummary[filterCustomer.id]?.ids ?? []).includes(list.id)
      )
    : fetchedPriceLists;

  return (
    <>
      {/* Price Lists Tab Content */}
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">Price Lists</h2>
            <p className="text-sm text-muted-foreground">Create custom prices for specific customers or groups</p>
          </div>
          <div className="flex items-center gap-2">
            <ContextualHelpBubble
              topic="Price Lists"
              title="Managing Price Lists"
              steps={helpContent.priceLists.steps}
            />
            <Button
              onClick={handleCreatePriceListClick}
              className={`w-full sm:w-auto ${planLimits && planLimits.limits.priceLists !== -1 && (planLimits.usage.priceLists ?? 0) >= planLimits.limits.priceLists ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {planLimits && planLimits.limits.priceLists !== -1 && (planLimits.usage.priceLists ?? 0) >= planLimits.limits.priceLists
                ? <><Lock className="h-4 w-4 mr-2" />New Price List</>
                : <><Plus className="h-4 w-4 mr-2" />New Price List</>
              }
            </Button>
          </div>
        </div>

        {/* Usage bar — shown when there is a finite plan limit */}
        {planLimits && planLimits.limits.priceLists !== -1 && (() => {
          const used = planLimits.usage.priceLists ?? 0;
          const limit = planLimits.limits.priceLists;
          const pct = Math.min((used / limit) * 100, 100);
          const atLimit = used >= limit;
          const nearLimit = !atLimit && pct >= 80;
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold tabular-nums ${
                  atLimit ? 'text-red-600' : nearLimit ? 'text-amber-600' : 'text-gray-700'
                }`}>
                  {used} / {limit} price lists used
                </span>
                {atLimit && (
                  <span className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Limit reached
                  </span>
                )}
                {nearLimit && (
                  <span className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {limit - used} remaining
                  </span>
                )}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    atLimit ? 'bg-red-500' : nearLimit ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {atLimit && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  You've reached your plan limit. Upgrade to create more price lists.
                </p>
              )}
              {nearLimit && (
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  You're almost at your limit — consider upgrading your plan.
                </p>
              )}
            </div>
          );
        })()}

        {filterCustomer && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <Tag className="h-4 w-4 shrink-0" />
            <span className="flex-1">Showing price lists for <strong>{filterCustomer.name}</strong></span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-blue-700 hover:bg-blue-100"
              onClick={() => onFilterChange(null)}
            >
              <X className="h-3 w-3 mr-1" />
              Clear filter
            </Button>
          </div>
        )}

        {isLoadingPriceLists ? (
          <div className="text-center py-10 text-muted-foreground">Loading price lists...</div>
        ) : (() => {
          if (filteredPriceLists.length === 0 && filterCustomer) {
            return (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Tag className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="font-medium text-lg mb-2">No price lists for {filterCustomer.name}</h3>
                  <p className="text-muted-foreground text-center text-sm max-w-xs mb-4">
                    This customer is not assigned to any price lists yet. Clear the filter to see all lists, or create a new one.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => onFilterChange(null)}>
                      <X className="h-4 w-4 mr-2" /> Clear filter
                    </Button>
                    {(() => {
                      const atLimit = !!(planLimits && planLimits.limits.priceLists !== -1 && (planLimits.usage.priceLists ?? 0) >= planLimits.limits.priceLists);
                      return (
                        <Button
                          size="sm"
                          onClick={handleCreatePriceListClick}
                          className={atLimit ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}
                        >
                          {atLimit
                            ? <><Lock className="h-4 w-4 mr-2" />New Price List</>
                            : <><Plus className="h-4 w-4 mr-2" />Create price list</>
                          }
                        </Button>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            );
          }

          const catalogueCard = (
            <Card className="border-green-100 bg-green-50/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                      <Tag className="h-5 w-5 text-green-700" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">Standard Price List</h3>
                      <p className="text-xs text-muted-foreground">Your full product catalogue at standard prices — with your logo</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-200 text-green-700 hover:bg-green-50 gap-1.5 text-xs"
                      onClick={() => setShowCataloguePreview(true)}
                    >
                      <Eye className="h-3 w-3" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-200 text-green-700 hover:bg-green-50 gap-1.5 text-xs"
                      onClick={() => handleShareCatalogue('xlsx')}
                      disabled={isSharingCatalogue !== null}
                    >
                      {isSharingCatalogue === 'xlsx' ? 'Exporting…' : <><Share2 className="h-3 w-3" /> Excel</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-200 text-green-700 hover:bg-green-50 gap-1.5 text-xs"
                      onClick={() => handleShareCatalogue('pdf')}
                      disabled={isSharingCatalogue !== null}
                    >
                      {isSharingCatalogue === 'pdf' ? 'Exporting…' : <><Share2 className="h-3 w-3" /> PDF</>}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );

          if (fetchedPriceLists.length === 0) {
            return (
              <div className="space-y-4">
                {catalogueCard}
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-10">
                    <Tag className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <h3 className="font-medium text-base mb-1">No custom price lists yet</h3>
                    <p className="text-muted-foreground text-center text-sm max-w-xs mb-4">
                      Create a custom price list to offer specific prices or discounts to particular customers or groups.
                    </p>
                    {(() => {
                      const atLimit = !!(planLimits && planLimits.limits.priceLists !== -1 && (planLimits.usage.priceLists ?? 0) >= planLimits.limits.priceLists);
                      return (
                        <Button
                          onClick={handleCreatePriceListClick}
                          className={atLimit ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}
                        >
                          {atLimit
                            ? <><Lock className="h-4 w-4 mr-2" />New Price List</>
                            : <><Plus className="h-4 w-4 mr-2" />Create First Price List</>
                          }
                        </Button>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            );
          }

          return (
            <div className="space-y-4">
              {catalogueCard}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPriceLists.map((list) => (
                <Card key={list.id} className={`relative hover:shadow-lg transition-shadow border-slate-200 ${list.isLocked ? 'opacity-60 grayscale' : ''}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-slate-900 truncate">{list.name}</h3>
                        {list.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{list.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {list.isLocked ? (
                          <Badge variant="secondary" className="text-xs rounded-full px-2.5 py-1 bg-gray-100 text-gray-500 flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Locked
                          </Badge>
                        ) : (
                          <Badge variant={list.isActive ? "default" : "secondary"} className={list.isActive ? "bg-emerald-100 text-emerald-700 border-0 rounded-full font-semibold text-xs px-2.5 py-1" : "text-xs rounded-full px-2.5 py-1"}>
                            {list.isActive ? "Active" : "Inactive"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {list.itemCount || 0} products</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {list.assignmentCount || 0} assigned</span>
                      </div>
                      <button
                        onClick={() => togglePriceListExpanded(list)}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        {expandedPriceLists[list.id] ? (
                          <><ChevronUp className="h-3 w-3" /> Hide details</>
                        ) : (
                          <><ChevronDown className="h-3 w-3" /> View details</>
                        )}
                      </button>
                    </div>

                    {expandedPriceLists[list.id] && (() => {
                      const detail = priceListDetailCache[list.id];
                      return (
                        <div className="border rounded-md bg-gray-50 p-3 space-y-3 text-xs">
                          <div>
                            <p className="font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                              <Package className="h-3 w-3" /> Products
                            </p>
                            {!detail ? (
                              <p className="text-muted-foreground italic">Loading…</p>
                            ) : detail.items.length === 0 ? (
                              <p className="text-muted-foreground italic">No products added.</p>
                            ) : (
                              <>
                                <div className="relative mb-2">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                                  <Input
                                    placeholder="Search products…"
                                    value={expandedPriceListSearch[list.id] ?? ""}
                                    onChange={e => setExpandedPriceListSearch(prev => ({ ...prev, [list.id]: e.target.value }))}
                                    className="pl-6 h-7 text-xs"
                                  />
                                </div>
                                {(() => {
                                  const searchTerm = (expandedPriceListSearch[list.id] ?? "").toLowerCase();
                                  const filtered = searchTerm
                                    ? detail.items.filter(item => (item.product?.name || "").toLowerCase().includes(searchTerm))
                                    : detail.items;
                                  if (filtered.length === 0) {
                                    return <p className="text-muted-foreground italic">No products match your search.</p>;
                                  }
                                  return (
                                    <div className="space-y-1">
                                      {filtered.map(item => {
                                        const base = parseFloat(item.product?.price || "0");
                                        const hasFixed = !!(item.customPrice && parseFloat(item.customPrice) > 0);
                                        const hasPct = !!(item.discountPercentage && parseFloat(item.discountPercentage) > 0);
                                        return (
                                          <div key={item.productId} className="flex items-center justify-between">
                                            <span className="text-gray-700 truncate max-w-[55%]">{item.product?.name || "Unknown"}</span>
                                            {hasFixed && (
                                              <span className="text-green-700 font-medium">{formatMoney(item.customPrice)}</span>
                                            )}
                                            {hasPct && !hasFixed && (
                                              <span className="text-green-700 font-medium">
                                                {parseFloat(item.discountPercentage).toFixed(0)}% off → {formatMoney(base * (1 - parseFloat(item.discountPercentage) / 100))}
                                              </span>
                                            )}
                                            {!hasFixed && !hasPct && (
                                              <span className="text-muted-foreground italic">standard price</span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </div>

                          <div>
                            <p className="font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                              <Users className="h-3 w-3" /> Assigned to
                            </p>
                            {!detail ? (
                              <p className="text-muted-foreground italic">Loading…</p>
                            ) : detail.assignments.length === 0 ? (
                              <p className="text-muted-foreground italic">No one assigned yet.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {detail.assignments.map((a, idx) => {
                                  if (a.customerId) {
                                    const c = customers.find(x => x.id === a.customerId);
                                    const name = c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : a.customerId;
                                    return <Badge key={idx} variant="secondary" className="text-xs">{name}</Badge>;
                                  }
                                  if (a.customerGroupId) {
                                    const g = customerGroups.find(x => x.id === a.customerGroupId);
                                    return (
                                      <Badge key={idx} variant="outline" className="text-xs border-primary/40 text-primary flex items-center gap-0.5">
                                        <Users className="h-2.5 w-2.5" />{g?.name || `Group ${a.customerGroupId}`}
                                      </Badge>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {(list.startDate || list.endDate) && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {list.startDate || "Now"} – {list.endDate || "Ongoing"}
                      </div>
                    )}

                    {list.isLocked && (
                      <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Locked — <a href="/subscription-pricing" className="underline font-medium">upgrade to unlock</a></span>
                      </div>
                    )}
                    <div className="flex gap-1.5 pt-1">
                      <Button asChild size="sm" variant="outline" className="flex-1 text-xs">
                        <Link href={`/price-lists/${list.id}`}>
                          <Eye className="h-3 w-3 mr-1" /> View
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => !list.isLocked && openManagePriceList(list)} disabled={list.isLocked} title={list.isLocked ? "Upgrade your plan to manage this price list" : undefined}>
                        {list.isLocked ? <Lock className="h-3 w-3 mr-1" /> : <Edit3 className="h-3 w-3 mr-1" />} Manage
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="text-xs px-2" aria-label="More actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => handleNativeShare(list.id, list.name)}
                            disabled={sharingListId === list.id}
                          >
                            <Share2 className="h-4 w-4 mr-2" />
                            {sharingListId === list.id ? "Sharing…" : "Share Excel"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => window.open(`/api/price-lists/${list.id}/export?format=pdf`, '_blank')}
                          >
                            <Share2 className="h-4 w-4 mr-2" />
                            Share PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => window.open(`/api/price-lists/${list.id}/export`, '_blank')}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => window.open(`/api/price-lists/${list.id}/export?format=pdf`, '_blank')}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => { if (confirm("Delete this price list?")) deletePriceListMutation.mutate(list.id); }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Create / Edit Price List Modal */}
      <Dialog open={isPriceListModalOpen} onOpenChange={(open) => { setIsPriceListModalOpen(open); if (!open) setEditingPriceList(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPriceList ? "Edit Price List" : "Create Price List"}</DialogTitle>
            <DialogDescription>Set up a named price list for your customers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input placeholder="e.g. VIP Customers Q2" value={priceListForm.name}
                onChange={e => setPriceListForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea placeholder="Optional notes about this price list..." value={priceListForm.description}
                onChange={e => setPriceListForm(prev => ({ ...prev, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={priceListForm.startDate}
                  onChange={e => setPriceListForm(prev => ({ ...prev, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={priceListForm.endDate}
                  onChange={e => setPriceListForm(prev => ({ ...prev, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={priceListForm.isActive}
                onCheckedChange={val => setPriceListForm(prev => ({ ...prev, isActive: val }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsPriceListModalOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700"
              disabled={!priceListForm.name || createPriceListMutation.isPending || updatePriceListMutation.isPending}
              onClick={() => {
                const payload: PriceListFormInput = {
                  name: priceListForm.name,
                  description: priceListForm.description || "",
                  startDate: priceListForm.startDate || "",
                  endDate: priceListForm.endDate || "",
                  isActive: priceListForm.isActive,
                };
                if (editingPriceList) {
                  updatePriceListMutation.mutate({ id: editingPriceList.id, data: payload });
                } else {
                  createPriceListMutation.mutate(payload);
                }
              }}
            >
              {createPriceListMutation.isPending || updatePriceListMutation.isPending ? "Saving..." : (editingPriceList ? "Update" : "Create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Price List Modal (Products + Assignments) */}
      <Dialog open={isManagePriceListOpen} onOpenChange={(open) => { if (!open) setIncompletePLItems(new Set()); setIsManagePriceListOpen(open); }}>
        <DialogContent className="w-full sm:max-w-2xl max-h-screen sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-green-600" />
              Manage: {managingPriceList?.name}
            </DialogTitle>
            <DialogDescription>
              Add products with custom prices, then assign to customers or groups.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="products" className="mt-2">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details"><Edit3 className="h-4 w-4 mr-1" />Details</TabsTrigger>
              <TabsTrigger value="products"><Package className="h-4 w-4 mr-1" />Products</TabsTrigger>
              <TabsTrigger value="assign"><Users className="h-4 w-4 mr-1" />Assign</TabsTrigger>
              <TabsTrigger value="impact"><Package className="h-4 w-4 mr-1" />Impact</TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="space-y-4 pt-4">
              <div>
                <Label>Name *</Label>
                <Input placeholder="e.g. VIP Customers Q2" value={priceListForm.name}
                  onChange={e => setPriceListForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea placeholder="Optional notes..." value={priceListForm.description}
                  onChange={e => setPriceListForm(prev => ({ ...prev, description: e.target.value }))} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={priceListForm.startDate}
                    onChange={e => setPriceListForm(prev => ({ ...prev, startDate: e.target.value }))} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={priceListForm.endDate}
                    onChange={e => setPriceListForm(prev => ({ ...prev, endDate: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={priceListForm.isActive}
                  onCheckedChange={val => setPriceListForm(prev => ({ ...prev, isActive: val }))} />
              </div>
              <Button className="w-full bg-green-600 hover:bg-green-700"
                disabled={!priceListForm.name || updatePriceListMutation.isPending || !managingPriceList}
                onClick={() => {
                  if (!managingPriceList) return;
                  updatePriceListMutation.mutate({
                    id: managingPriceList.id,
                    data: {
                      name: priceListForm.name,
                      description: priceListForm.description || "",
                      startDate: priceListForm.startDate || "",
                      endDate: priceListForm.endDate || "",
                      isActive: priceListForm.isActive,
                    },
                  });
                  setIsManagePriceListOpen(false);
                }}>
                {updatePriceListMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="space-y-4 pt-4">
              <div>
                <Label className="text-sm font-medium">Add Products</Label>
                <Input placeholder="Search products..." value={plProductSearch}
                  onChange={e => setPlProductSearch(e.target.value)} className="mt-1" />
                {plProductSearch && (
                  <div className="border rounded-md mt-1 max-h-40 overflow-y-auto bg-white shadow-sm">
                    {(() => {
                      const searchResults = productsForPL
                        .filter(p =>
                          p.status === 'active' &&
                          p.name?.toLowerCase().includes(plProductSearch.toLowerCase()) &&
                          !priceListItems.some(i => i.productId === p.id)
                        )
                        .slice(0, 8);
                      return searchResults.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No matching active products to add</div>
                      ) : searchResults.map(p => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                          onClick={() => { addProductToPL(p); setPlProductSearch(""); }}>
                          <span>{p.name}</span>
                          <span className="text-muted-foreground">{formatMoney(p.price || "0")}</span>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {priceListItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No products added yet. Search above to add products.</div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Set a fixed price OR a % discount. Leave both blank to use the standard price.</p>
                  {priceListItems.map((item) => {
                    const product = item.product;
                    const standardPrice = parseFloat(product?.price || "0");
                    return (
                      <div key={item.productId} className={`border rounded-lg p-3 bg-gray-50 ${incompletePLItems.has(item.productId) ? "border-red-500 bg-red-50" : ""}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{product?.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Standard: {formatMoney(standardPrice)}</span>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500"
                              onClick={() => removeProductFromPL(item.productId)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-1.5">Unit price</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Fixed Price (£)</Label>
                            <Input className="h-7 text-xs mt-0.5" placeholder="e.g. 14.99" value={item.customPrice}
                              onChange={e => updatePLItemPrice(item.productId, 'customPrice', e.target.value)}
                              disabled={!!item.discountPercentage} />
                          </div>
                          <div>
                            <Label className="text-xs">Discount (%)</Label>
                            <Input className="h-7 text-xs mt-0.5" placeholder="e.g. 10" value={item.discountPercentage}
                              onChange={e => updatePLItemPrice(item.productId, 'discountPercentage', e.target.value)}
                              disabled={!!item.customPrice} />
                          </div>
                        </div>
                        {item.customPrice && (
                          <p className="text-xs text-green-700 mt-1">
                            Customer price: {formatMoney(parseFloat(item.customPrice) || 0)}
                          </p>
                        )}
                        {item.discountPercentage && !item.customPrice && (
                          <p className="text-xs text-green-700 mt-1">
                            Customer price: {formatMoney(standardPrice * (1 - parseFloat(item.discountPercentage) / 100))}
                          </p>
                        )}
                        {!item.customPrice && !item.discountPercentage && (
                          <p className="text-xs text-muted-foreground mt-1">Standard price will apply</p>
                        )}
                        {product?.palletPrice != null && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-[10px] text-muted-foreground mb-1.5">
                              Pallet price <span className="text-gray-400">(standard: {formatMoney(product.palletPrice)})</span>
                            </p>
                            <div className="w-1/2 pr-1">
                              <Label className="text-xs">Custom Pallet Price (£)</Label>
                              <Input className="h-7 text-xs mt-0.5" placeholder={parseFloat(product.palletPrice).toFixed(2)}
                                value={item.customPalletPrice}
                                onChange={e => updatePLItemPrice(item.productId, 'customPalletPrice', e.target.value)} />
                            </div>
                            {item.customPalletPrice && (
                              <p className="text-xs text-green-700 mt-1">
                                Pallet price: {formatMoney(item.customPalletPrice)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <Button className="w-full bg-green-600 hover:bg-green-700"
                disabled={savePLItemsMutation.isPending || !managingPriceList}
                onClick={() => {
                  setIncompletePLItems(new Set());
                  const items = priceListItems.map(i => ({
                    productId: i.productId,
                    customPrice: i.customPrice?.trim() || null,
                    discountPercentage: i.discountPercentage?.trim() || null,
                    customPalletPrice: i.customPalletPrice?.trim() || null,
                  }));
                  savePLItemsMutation.mutate({ id: managingPriceList!.id, items: items as any });
                }}>
                {savePLItemsMutation.isPending ? "Saving..." : "Save Products"}
              </Button>
            </TabsContent>

            {/* Assign Tab */}
            <TabsContent value="assign" className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">Select which customers or groups get this price list.</p>

              {customerGroups.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Customer Groups</Label>
                  <div className="space-y-1 max-h-36 overflow-y-auto border rounded-md p-2">
                    {customerGroups.map((group) => {
                      const assigned = priceListAssignments.some(a => a.customerGroupId === group.id);
                      return (
                        <div key={group.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer"
                          onClick={() => togglePLGroupAssignment(group.id)}>
                          <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${assigned ? "bg-green-600 border-green-600" : "border-gray-300"}`}>
                            {assigned && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className="text-sm">{group.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium mb-2 block">Individual Customers</Label>
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                  {customers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No customers yet</p>
                  ) : (
                    customers.map((cust) => {
                      const assigned = priceListAssignments.some(a => a.customerId === cust.id);
                      const name = `${cust.firstName || ""} ${cust.lastName || ""}`.trim() || cust.phoneNumber;
                      return (
                        <div key={cust.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer"
                          onClick={() => togglePLCustomerAssignment(cust.id)}>
                          <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${assigned ? "bg-green-600 border-green-600" : "border-gray-300"}`}>
                            {assigned && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className="text-sm">{name}</span>
                          {cust.businessName && <span className="text-xs text-muted-foreground">· {cust.businessName}</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-700"
                  disabled={savePLAssignmentsMutation.isPending || !managingPriceList}
                  onClick={() => savePLAssignmentsMutation.mutate({ id: managingPriceList!.id, assignments: priceListAssignments })}>
                  {savePLAssignmentsMutation.isPending ? "Saving..." : "Save Assignments"}
                </Button>
                <Button variant="outline" className="shrink-0"
                  onClick={() => managingPriceList && window.open(`/api/price-lists/${managingPriceList.id}/export`, '_blank')}
                  disabled={!managingPriceList}
                  title="Download Excel"
                  aria-label="Download Excel price list"
                >
                  <Download className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                  <span className="hidden sm:inline">Download Excel</span>
                  <span className="sm:hidden sr-only">Download Excel</span>
                </Button>
                <Button variant="outline" className="shrink-0 text-green-700 border-green-200 hover:bg-green-50"
                  disabled={sharingListId === managingPriceList?.id || !managingPriceList}
                  onClick={() => managingPriceList && handleNativeShare(managingPriceList.id, managingPriceList.name)}
                  title="Share Now"
                  aria-label="Share price list"
                >
                  <Share2 className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {sharingListId === managingPriceList?.id ? "Preparing…" : "Share Now"}
                  </span>
                  <span className="sm:hidden sr-only">Share Now</span>
                </Button>
              </div>
            </TabsContent>

            {/* Impact Tab */}
            <TabsContent value="impact" className="space-y-4 pt-4">
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const isExpired = !!(priceListForm.endDate && priceListForm.endDate < today);
                const notYetStarted = !!(priceListForm.startDate && priceListForm.startDate > today);
                const outsideDateWindow = isExpired || notYetStarted;
                const isInactive = !priceListForm.isActive || outsideDateWindow;

                return (
                  <>
                    {isInactive && (
                      <Alert className="border-yellow-300 bg-yellow-50">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <AlertDescription className="text-yellow-800 text-sm">
                          {!priceListForm.isActive
                            ? "This price list is inactive. Customers won't see these prices until you activate it on the Details tab."
                            : isExpired
                              ? "This price list has expired. Update the end date on the Details tab to re-activate it."
                              : `This price list doesn't start until ${priceListForm.startDate}. Customers won't see these prices until then.`}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-green-600" />
                        What customers will pay
                      </p>
                      {priceListItems.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-gray-50">
                          Add products on the <span className="font-medium">Products</span> tab to preview prices here.
                        </div>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Product</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Standard</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Their price</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Saving</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {priceListItems.map((item) => {
                                const standard = parseFloat(item.product?.price || "0");
                                const hasFixed = !!(item.customPrice?.trim());
                                const hasPct = !!(item.discountPercentage?.trim());
                                let custom = standard;
                                if (hasFixed) custom = parseFloat(item.customPrice) || 0;
                                else if (hasPct) custom = standard * (1 - (parseFloat(item.discountPercentage) || 0) / 100);
                                const saving = standard - custom;
                                const savingPct = standard > 0 ? (saving / standard) * 100 : 0;
                                const priced = hasFixed || hasPct;
                                return (
                                  <tr key={item.productId} className="bg-white">
                                    <td className="px-3 py-2.5 text-gray-800 max-w-[140px] truncate">
                                      {item.product?.name || "Unknown"}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-muted-foreground line-through text-xs">
                                      {formatMoney(standard)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-semibold text-green-700">
                                      {priced ? formatMoney(custom) : <span className="text-muted-foreground font-normal text-xs italic">standard price</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                      {priced && saving > 0 ? (
                                        <span className="inline-flex items-center bg-green-100 text-green-800 text-xs font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                          {formatMoney(saving)} ({savingPct.toFixed(0)}%)
                                        </span>
                                      ) : priced ? (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      ) : null}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-green-600" />
                        Assigned to
                      </p>
                      {priceListAssignments.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-gray-50">
                          Assign customers on the <span className="font-medium">Assign</span> tab to see who benefits.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {priceListAssignments.map((a, idx) => {
                            if (a.customerId) {
                              const c = customers.find(x => x.id === a.customerId);
                              const name = c ? `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.phoneNumber : a.customerId;
                              return (
                                <Link key={idx} href={`/customers/${a.customerId}`}>
                                  <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-gray-200 transition-colors">
                                    {name}
                                  </Badge>
                                </Link>
                              );
                            }
                            if (a.customerGroupId) {
                              const g = customerGroups.find(x => x.id === a.customerGroupId);
                              return (
                                <Badge key={idx} variant="outline" className="text-xs border-primary/40 text-primary flex items-center gap-0.5">
                                  <Users className="h-2.5 w-2.5" />{g?.name || `Group ${a.customerGroupId}`}
                                </Badge>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Standard Price List preview sheet */}
      <Sheet open={showCataloguePreview} onOpenChange={(open) => { setShowCataloguePreview(open); if (!open) setCatalogueSearch(""); }}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4 text-green-700" />
              Standard Price List
            </SheetTitle>
          </SheetHeader>

          {(() => {
            const activeProducts = productsForPL.filter(p => p.status !== 'inactive' && p.status !== 'archived');

            if (isLoadingProducts) {
              return (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Loading catalogue…</span>
                  </div>
                </div>
              );
            }

            if (activeProducts.length === 0) {
              return (
                <div className="flex-1 flex items-center justify-center text-center px-6">
                  <div>
                    <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="font-medium text-slate-700 mb-1">No products yet</p>
                    <p className="text-sm text-muted-foreground">Add products to your catalogue and they'll appear here.</p>
                  </div>
                </div>
              );
            }

            const searchTerm = catalogueSearch.trim().toLowerCase();
            const filteredProducts = searchTerm
              ? activeProducts.filter(p => p.name.toLowerCase().includes(searchTerm))
              : activeProducts;

            return (
              <>
                <div className="px-4 py-2.5 border-b shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search products…"
                      value={catalogueSearch}
                      onChange={e => setCatalogueSearch(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                      <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
                      <p className="font-medium text-slate-700 mb-1">No products match</p>
                      <p className="text-sm text-muted-foreground">Try a different search term.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white border-b z-10">
                        <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="text-left px-4 py-2.5 font-medium">Product</th>
                          <th className="text-right px-4 py-2.5 font-medium">Unit price</th>
                          <th className="text-right px-4 py-2.5 font-medium pr-5">Pallet price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredProducts.map(p => {
                          const numericSize = p.unitSize != null ? String(parseFloat(String(p.unitSize))) : null;
                          const unitDisplay = numericSize && p.unitOfMeasure
                            ? `${numericSize}${p.unitOfMeasure}`
                            : numericSize || p.unitOfMeasure || null;
                          const packParts = [p.packQuantity, unitDisplay].filter(Boolean);
                          const packSize = packParts.length > 0 ? packParts.join(' x ') : null;

                          return (
                            <tr key={p.id} className="hover:bg-gray-50/60">
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-900 leading-snug">{p.name}</p>
                                {packSize && <p className="text-xs text-muted-foreground mt-0.5">{packSize}</p>}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                                {formatMoney(parseFloat(p.price))}
                              </td>
                              <td className="px-4 py-3 text-right pr-5 text-muted-foreground whitespace-nowrap">
                                {p.palletPrice ? formatMoney(parseFloat(p.palletPrice)) : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <SubscriptionUpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        feature="price lists"
        currentPlan={planLimits?.plan ?? "Free"}
      />
    </>
  );
}
