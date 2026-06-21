import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Package, Users, Calendar, Tag, AlertTriangle, RefreshCw, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/hooks/useCurrency";
import { resolvePriceListRow } from "./price-list-pricing";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PLProduct {
  id: number;
  name: string;
  price: string;
  palletPrice?: string | null;
}

interface PLItem {
  id: number;
  productId: number;
  customPrice: string | null;
  discountPercentage: string | null;
  customPalletPrice: string | null;
  product: PLProduct | null;
}

interface PLAssignment {
  customerId: string | null;
  customerGroupId: number | null;
}

interface PriceListDetail {
  id: number;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  isLocked: boolean;
  items: PLItem[];
  assignments: PLAssignment[];
}

interface Customer {
  id: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
}

interface CustomerGroup {
  id: number;
  name: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PriceListDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { formatMoney } = useCurrency();
  const priceListId = Number(id);

  const backToList = () => navigate("/customers?tab=price-lists");

  const {
    data: list,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery<PriceListDetail>({
    queryKey: ["/api/price-lists", priceListId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/price-lists/${priceListId}`);
      return res.json();
    },
    enabled: Number.isFinite(priceListId) && priceListId > 0,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: customerGroups = [] } = useQuery<CustomerGroup[]>({
    queryKey: ["/api/customer-groups"],
  });

  // ── Loading / error / not found ───────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-center py-16">
        <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">Couldn't load this price list</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
          Something went wrong while loading. Please check your connection and try again.
        </p>
        <div className="flex items-center justify-center gap-2 mt-5">
          <Button onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Retrying…" : "Try again"}
          </Button>
          <Button variant="outline" onClick={backToList}>
            Back to price lists
          </Button>
        </div>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-center py-16">
        <Tag className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">Price list not found</h2>
        <Button variant="outline" className="mt-4" onClick={backToList}>
          Back to price lists
        </Button>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const items = list.items || [];
  const assignments = list.assignments || [];
  const showPalletColumn = items.some((i) => i.product?.palletPrice != null);

  return (
    <div className="max-w-3xl mx-auto pb-16">
      {/* ── Back bar ── */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={backToList} className="gap-1.5 -ml-1 text-gray-600">
          <ArrowLeft className="h-4 w-4" /> Price lists
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Header ── */}
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-900 break-words">{list.name}</h1>
                {list.description && (
                  <p className="text-sm text-muted-foreground mt-1">{list.description}</p>
                )}
              </div>
              {list.isLocked ? (
                <Badge variant="secondary" className="shrink-0 rounded-full px-2.5 py-1 bg-gray-100 text-gray-500 flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Locked
                </Badge>
              ) : (
                <Badge
                  variant={list.isActive ? "default" : "secondary"}
                  className={list.isActive
                    ? "shrink-0 bg-emerald-100 text-emerald-700 border-0 rounded-full font-semibold px-2.5 py-1"
                    : "shrink-0 rounded-full px-2.5 py-1"}
                >
                  {list.isActive ? "Active" : "Inactive"}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Package className="h-4 w-4" /> {items.length} {items.length === 1 ? "product" : "products"}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {assignments.length} assigned
              </span>
              {(list.startDate || list.endDate) && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {list.startDate || "Now"} – {list.endDate || "Ongoing"}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Products ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-green-700" /> Products
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic px-4 sm:px-5 pb-4">No products added to this price list.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2 text-right">Standard</th>
                      <th className="px-4 py-2 text-right">Customer price</th>
                      {showPalletColumn && <th className="px-4 py-2 text-right">Pallet price</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const { productMissing, base, unitPrice, hasPct, isCustom } =
                        resolvePriceListRow(item);

                      const hasPallets = item.product?.palletPrice != null;
                      const basePallet = hasPallets ? parseFloat(item.product!.palletPrice as string) : null;
                      const customPallet = item.customPalletPrice != null ? parseFloat(item.customPalletPrice) : null;
                      const resolvedPallet = customPallet ?? basePallet;

                      return (
                        <tr key={item.productId} className="border-b border-gray-50 last:border-0">
                          <td className="px-4 py-2.5 font-medium text-gray-800">
                            {item.product?.name || "Unknown product"}
                            {!productMissing && hasPct && (
                              <Badge variant="outline" className="ml-2 text-[11px] border-green-200 text-green-700 align-middle">
                                {parseFloat(item.discountPercentage as string).toFixed(0)}% off
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                            {productMissing ? "—" : formatMoney(base)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {productMissing ? (
                              <span className="text-muted-foreground">—</span>
                            ) : isCustom ? (
                              <span className="font-semibold text-green-700">{formatMoney(unitPrice)}</span>
                            ) : (
                              <span className="text-muted-foreground">Standard</span>
                            )}
                          </td>
                          {showPalletColumn && (
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {!productMissing && resolvedPallet != null ? (
                                <span className={customPallet != null ? "font-semibold text-green-700" : "text-muted-foreground"}>
                                  {formatMoney(resolvedPallet)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Assigned to ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-green-700" /> Assigned to
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No customers or groups assigned yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assignments.map((a, idx) => {
                  if (a.customerId) {
                    const c = customers.find((x) => x.id === a.customerId);
                    const name = c
                      ? (c.businessName || `${c.firstName || ""} ${c.lastName || ""}`.trim() || a.customerId)
                      : a.customerId;
                    return <Badge key={idx} variant="secondary">{name}</Badge>;
                  }
                  if (a.customerGroupId) {
                    const g = customerGroups.find((x) => x.id === a.customerGroupId);
                    return (
                      <Badge key={idx} variant="outline" className="border-primary/40 text-primary flex items-center gap-1">
                        <Users className="h-3 w-3" /> {g?.name || `Group ${a.customerGroupId}`}
                      </Badge>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
