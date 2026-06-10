import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useImpersonation } from "@/contexts/impersonation-context";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Eye, Mail, CreditCard, Building2, Info, FileText, UserCheck,
  ToggleLeft, ToggleRight, UserPlus, Percent, LogIn, Globe, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { formatDateTime } from "@shared/utils/date";
import { useToast } from "@/hooks/use-toast";
import { GREEN, BLUE, AMBER, PURPLE, fmt, planBadge, customPriceDaysRemaining } from "./shared";
import type { WholesalerRow, WholesalerOrderRow, AdminPlanRow } from "./types";

export function WholesalersSection({ wholesalers, wholesalersLoading, isAdmin }: {
  wholesalers: WholesalerRow[]; wholesalersLoading: boolean; isAdmin: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { startImpersonation } = useImpersonation();
  const [planFilter, setPlanFilter] = useState("");
  const [selectedWholesaler, setSelectedWholesaler] = useState<WholesalerRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [impersonateTarget, setImpersonateTarget] = useState<WholesalerRow | null>(null);
  const [changePlanId, setChangePlanId] = useState("");
  const [changePlanConfirm, setChangePlanConfirm] = useState(false);
  const [removeCustomPricingConfirm, setRemoveCustomPricingConfirm] = useState(false);
  const [customPriceId, setCustomPriceId] = useState("");
  const [customPriceNote, setCustomPriceNote] = useState("");
  const [customPriceExpiry, setCustomPriceExpiry] = useState("");
  const [customFeeInput, setCustomFeeInput] = useState("");
  const [customSubPriceInput, setCustomSubPriceInput] = useState({ annual: "", monthly: "" });
  const [customerFeeInput, setCustomerFeeInput] = useState({ percentage: "", fixed: "" });
  const [legalInfoInput, setLegalInfoInput] = useState({ legalBusinessName: "", vatNumber: "", companyRegistrationNumber: "" });
  const [createTesterOpen, setCreateTesterOpen] = useState(false);
  const [testerForm, setTesterForm] = useState({ firstName: "", lastName: "", email: "", password: "" });

  const { data: allPlansData } = useQuery<{ plans: AdminPlanRow[] }>({
    queryKey: ["/api/admin/plans"],
    enabled: isAdmin,
  });
  const activePlans = (allPlansData?.plans ?? []).filter(p => p.isActive);

  const changePlanMutation = useMutation({
    mutationFn: async ({ id, planId, customPriceId, internalNote, customPriceExpiresAt }: { id: string; planId: string; customPriceId?: string; internalNote?: string; customPriceExpiresAt?: string }) => {
      const body: Record<string, string> = { planId };
      if (customPriceId) body.customPriceId = customPriceId;
      if (internalNote) body.internalNote = internalNote;
      if (customPriceExpiresAt) body.customPriceExpiresAt = customPriceExpiresAt;
      const r = await apiRequest("POST", `/api/admin/wholesalers/${id}/change-plan`, body);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: ["/api/admin/wholesalers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      const updated = queryClient.getQueryData<WholesalerRow[]>(["/api/admin/wholesalers"]);
      if (updated) {
        const fresh = updated.find(w => w.id === variables.id);
        if (fresh) setSelectedWholesaler(fresh);
      }
      toast({ title: "Plan changed successfully" });
      setChangePlanConfirm(false);
      setChangePlanId("");
      setCustomPriceId("");
      setCustomPriceNote("");
      setCustomPriceExpiry("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const removeCustomPricingMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/admin/wholesalers/${id}/remove-custom-pricing`, {});
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: async (_data, id) => {
      await queryClient.refetchQueries({ queryKey: ["/api/admin/wholesalers"] });
      const updated = queryClient.getQueryData<WholesalerRow[]>(["/api/admin/wholesalers"]);
      if (updated) {
        const fresh = updated.find(w => w.id === id);
        if (fresh) setSelectedWholesaler(fresh);
      }
      toast({ title: "Custom pricing removed" });
      setRemoveCustomPricingConfirm(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const impersonateMutation = useMutation({
    mutationFn: async (id: string): Promise<{ success: boolean; wholesalerId: string; businessName: string; token: string }> => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${id}`);
      return res.json();
    },
    onSuccess: (data) => {
      setImpersonateTarget(null);
      startImpersonation(data.wholesalerId, data.businessName, data.token);
      queryClient.clear();
      toast({ title: "Impersonation active", description: `Now viewing as ${data.businessName || "wholesaler"}` });
      setLocation("/dashboard");
    },
    onError: () => toast({ title: "Failed to start impersonation", variant: "destructive" }),
  });

  const toggleStatus = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/wholesalers/${id}/toggle-status`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      toast({ title: "Status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const toggleTestAccount = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/wholesalers/${id}/toggle-test-account`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      toast({ title: "Test account status updated" });
    },
    onError: () => toast({ title: "Failed to update test account status", variant: "destructive" }),
  });

  const toggleInactive = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/wholesalers/${id}/toggle-inactive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      toast({ title: "Inactive status updated" });
    },
    onError: () => toast({ title: "Failed to update inactive status", variant: "destructive" }),
  });

  const customerFeeOverrideMutation = useMutation({
    mutationFn: async ({ id, percentage, fixed }: { id: string; percentage: number | null; fixed: number | null }) => {
      const r = await apiRequest("PATCH", `/api/admin/wholesalers/${id}/customer-fee-override`, {
        customerFeePercentage: percentage,
        customerFixedFee: fixed,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: ["/api/admin/wholesalers"] });
      const updated = queryClient.getQueryData<WholesalerRow[]>(["/api/admin/wholesalers"]);
      if (updated) {
        const fresh = updated.find(w => w.id === variables.id);
        if (fresh) setSelectedWholesaler(fresh);
      }
      toast({ title: variables.percentage === null && variables.fixed === null ? "Customer fee override removed" : "Customer fee override saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const customSubPricingMutation = useMutation({
    mutationFn: async ({ id, annual, monthly }: { id: string; annual: number | null; monthly: number | null }) => {
      const r = await apiRequest("PATCH", `/api/admin/wholesalers/${id}/custom-subscription-pricing`, {
        customAnnualPrice: annual,
        customMonthlyPrice: monthly,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: async (_data, variables) => {
      await queryClient.refetchQueries({ queryKey: ["/api/admin/wholesalers"] });
      const updated = queryClient.getQueryData<WholesalerRow[]>(["/api/admin/wholesalers"]);
      if (updated) {
        const fresh = updated.find(w => w.id === variables.id);
        if (fresh) setSelectedWholesaler(fresh);
      }
      toast({ title: variables.annual === null && variables.monthly === null ? "Negotiated prices cleared" : "Negotiated prices saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const customFeeMutation = useMutation({
    mutationFn: async ({ id, fee }: { id: string; fee: number | null }) => {
      const r = await apiRequest("PATCH", `/api/admin/wholesalers/${id}/custom-fee`, { customFeePercentage: fee });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      toast({ title: "Custom fee updated" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const multiProfileMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const r = await apiRequest("PATCH", `/api/admin/users/${id}/enable-multi-profile`, { enableMultiProfile: enabled });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      setSelectedWholesaler(prev => prev ? { ...prev, enableMultiProfile: variables.enabled } : prev);
      toast({ title: variables.enabled ? "Multi-profile enabled" : "Multi-profile disabled" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleShowOnHomepage = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/admin/wholesalers/${id}/toggle-show-on-homepage`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json() as Promise<{ id: string; showOnHomepage: boolean }>;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      setSelectedWholesaler(prev => prev ? { ...prev, showOnHomepage: _data.showOnHomepage } : prev);
      toast({ title: _data.showOnHomepage ? "Added to homepage strip" : "Removed from homepage strip" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const legalInfoMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { legalBusinessName: string; vatNumber: string; companyRegistrationNumber: string } }) => {
      const r = await apiRequest("PATCH", `/api/admin/users/${id}/legal-info`, data);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      setSelectedWholesaler(prev => prev ? { ...prev, legalBusinessName: variables.data.legalBusinessName || null, vatNumber: variables.data.vatNumber || null, companyRegistrationNumber: variables.data.companyRegistrationNumber || null } : prev);
      toast({ title: "Legal info updated" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createTesterMutation = useMutation({
    mutationFn: async (body: { firstName: string; lastName: string; email: string; password: string }) => {
      const r = await apiRequest("POST", "/api/admin/create-test-account", body);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed to create tester"); }
      return r.json() as Promise<{ success: boolean; id: string; email: string; emailSent: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      if (data.emailSent) {
        toast({ title: "Tester account created", description: "An invite email has been sent with their login details." });
      } else {
        toast({ title: "Tester account created", description: "Account ready, but the invite email could not be delivered. Share credentials manually.", variant: "destructive" });
      }
      setCreateTesterOpen(false);
      setTesterForm({ firstName: "", lastName: "", email: "", password: "" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const { data: wholesalerOrders, isLoading: ordersLoading } = useQuery<{ orders: WholesalerOrderRow[] }>({
    queryKey: ["/api/admin/wholesalers", selectedWholesaler?.id, "orders"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/wholesalers/${selectedWholesaler!.id}/orders`, { credentials: "include" });
      return r.json() as Promise<{ orders: WholesalerOrderRow[] }>;
    },
    enabled: !!selectedWholesaler && drawerOpen,
  });

  const filtered = useMemo(() => {
    if (!planFilter) return wholesalers;
    return wholesalers.filter(w => {
      const tier = w.subscriptionTier ?? "free";
      if (planFilter === "listing") return tier === "listing" || tier === "free" || tier.startsWith("listing_");
      if (planFilter === "starter") return tier === "starter" || tier.startsWith("starter_");
      if (planFilter === "standard") return tier === "standard" || tier.startsWith("standard_");
      if (planFilter === "premium") return tier === "premium" || tier.startsWith("premium_");
      return tier === planFilter;
    });
  }, [wholesalers, planFilter]);

  const openDrawer = (w: WholesalerRow) => {
    setSelectedWholesaler(w);
    setCustomFeeInput(w.customFeePercentage !== null && w.customFeePercentage !== undefined ? String(w.customFeePercentage) : "");
    setCustomerFeeInput({
      percentage: w.customerFeePercentage !== null && w.customerFeePercentage !== undefined
        ? (w.customerFeePercentage * 100).toFixed(2) : "",
      fixed: w.customerFixedFee !== null && w.customerFixedFee !== undefined
        ? String(w.customerFixedFee) : "",
    });
    setLegalInfoInput({ legalBusinessName: w.legalBusinessName || "", vatNumber: w.vatNumber || "", companyRegistrationNumber: w.companyRegistrationNumber || "" });
    setChangePlanId("");
    setCustomPriceId("");
    setCustomPriceNote("");
    setCustomPriceExpiry("");
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Wholesalers</h2>
          <p className="text-xs text-gray-400">Manage wholesaler accounts and status</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none focus:border-gray-400 bg-white">
            <option value="">All plans</option>
            <option value="listing">Listing</option>
            <option value="starter">Starter</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
          <Button size="sm" className="text-white text-xs gap-1.5 h-8" style={{ background: PURPLE }} onClick={() => setCreateTesterOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" />Create Tester
          </Button>
        </div>
      </div>

      {/* Global GMV totals strip */}
      {(() => {
        const nonTest = filtered.filter(w => !w.isTestAccount);
        const totalGMVWithFees = nonTest.reduce((s, w) => s + (w.gmvWithFees ?? 0), 0);
        const totalGMVWithoutFees = nonTest.reduce((s, w) => s + (w.gmvWithoutFees ?? 0), 0);
        const totalGMV = nonTest.reduce((s, w) => s + (w.totalGMV ?? 0), 0);
        const totalFees = nonTest.reduce((s, w) => s + (w.totalFeesEarned ?? 0), 0);
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-3" style={{ borderLeftWidth: 3, borderLeftColor: PURPLE }}>
              <p className="text-xs text-gray-400">Total GMV</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: PURPLE }}>{fmt(totalGMV)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3" style={{ borderLeftWidth: 3, borderLeftColor: GREEN }}>
              <p className="text-xs text-gray-400">GMV (with fees)</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: GREEN }}>{fmt(totalGMVWithFees)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3" style={{ borderLeftWidth: 3, borderLeftColor: AMBER }}>
              <p className="text-xs text-gray-400">GMV (no fees)</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: AMBER }}>{fmt(totalGMVWithoutFees)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3" style={{ borderLeftWidth: 3, borderLeftColor: BLUE }}>
              <p className="text-xs text-gray-400">Total Fees Earned</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: BLUE }}>{fmt(totalFees)}</p>
            </div>
          </div>
        );
      })()}

      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">All Wholesalers ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {wholesalersLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-[#f0faf4]">
                    {["Business","Plan","Orders","GMV (with fees)","GMV (no fees)","Total Fees","Last Order","Status",""].map((h, i) => (
                      <TableHead key={i} className="text-xs font-semibold" style={{ color: GREEN }}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(w => (
                    <TableRow key={w.id} className={`hover:bg-green-50/30 cursor-pointer ${w.isTestAccount || w.isInactive ? "opacity-60" : ""}`} onClick={() => openDrawer(w)}>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium text-gray-800">{w.businessName || `${w.firstName || ''} ${w.lastName || ''}`.trim()}</p>
                          {w.isTestAccount && <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-medium">Test</span>}
                          {w.isInactive && <span className="text-xs bg-gray-100 text-gray-500 border border-gray-300 px-1.5 py-0.5 rounded font-medium">Inactive</span>}
                          {w.showOnHomepage && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200 cursor-default">
                                  <Globe className="h-2.5 w-2.5" />Home
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">Shown on homepage logo strip</TooltipContent>
                            </Tooltip>
                          )}
                          {w.showOnHomepage && !w.logoUrl && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 cursor-default">
                                  <AlertTriangle className="h-2.5 w-2.5" />No logo
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">On homepage strip but has no logo uploaded — will render as a blank slot</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{w.email}</p>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {planBadge(w.subscriptionTier)}
                          {w.isCustomPricing && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 cursor-default">Custom</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                {w.internalNote ? w.internalNote : "Custom pricing applied"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {(w.customAnnualPrice || w.customMonthlyPrice) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-default">Deal</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                {[w.customAnnualPrice ? `Annual: £${w.customAnnualPrice.toFixed(2)}/yr` : null, w.customMonthlyPrice ? `Monthly: £${w.customMonthlyPrice.toFixed(2)}/mo` : null].filter(Boolean).join(" · ")}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {w.isCustomPricing && (() => {
                            const days = customPriceDaysRemaining(w.customPriceExpiresAt);
                            if (days === null || days > 30) return null;
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-300 cursor-default">
                                    {days <= 0 ? "Expired" : `${days}d left`}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  {days <= 0 ? "Custom pricing has expired" : `Custom deal expires in ${days} day${days === 1 ? "" : "s"}`}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right text-gray-600">{w.orderCount}</TableCell>
                      <TableCell className="text-xs text-right text-gray-600">{fmt(w.gmvWithFees ?? 0)}</TableCell>
                      <TableCell className="text-xs text-right text-gray-600">{fmt(w.gmvWithoutFees ?? 0)}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-gray-900">{fmt(w.totalFeesEarned)}</TableCell>
                      <TableCell className="text-xs text-gray-400">{w.lastOrderAt ? format(new Date(w.lastOrderAt), "dd MMM yy") : "—"}</TableCell>
                      <TableCell>
                        {w.archived
                          ? <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">Suspended</span>
                          : <span className="text-xs px-2 py-0.5 rounded border bg-[#f0faf4] border-[#bbdfc8]" style={{ color: GREEN }}>Active</span>
                        }
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={toggleStatus.isPending} onClick={() => toggleStatus.mutate(w.id)}>
                            {w.archived ? "Activate" : "Suspend"}
                          </Button>
                          <Button size="sm" variant="outline" className={`h-7 text-xs ${w.isTestAccount ? "border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`} disabled={toggleTestAccount.isPending} onClick={() => toggleTestAccount.mutate(w.id)} title={w.isTestAccount ? "Remove test account flag" : "Mark as test account"}>
                            {w.isTestAccount ? "Remove test" : "Test"}
                          </Button>
                          <Button size="sm" variant="outline" className={`h-7 text-xs ${w.isInactive ? "border-gray-400 text-gray-600 bg-gray-100 hover:bg-gray-200" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`} disabled={toggleInactive.isPending} onClick={() => toggleInactive.mutate(w.id)} title={w.isInactive ? "Remove inactive flag" : "Mark as inactive (excluded from stats)"}>
                            {w.isInactive ? "Set active" : "Inactive"}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-400" onClick={() => openDrawer(w)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" title="Login as this wholesaler" onClick={() => setImpersonateTarget(w)}>
                            <LogIn className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wholesaler detail drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-sm font-semibold">{selectedWholesaler?.businessName || `${selectedWholesaler?.firstName || ''} ${selectedWholesaler?.lastName || ''}`.trim()}</SheetTitle>
          </SheetHeader>
          {selectedWholesaler && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Plan</p>
                  <div className="mt-1">{planBadge(selectedWholesaler.subscriptionTier)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Status</p>
                  <p className="text-sm font-medium mt-1" style={{ color: selectedWholesaler.archived ? "#6b7280" : GREEN }}>
                    {selectedWholesaler.archived ? "Suspended" : "Active"}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Total Orders</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{selectedWholesaler.totalOrderCount ?? selectedWholesaler.orderCount}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedWholesaler.orderCount} completed</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Cancelled</p>
                  <p className="text-sm font-bold mt-1" style={{ color: (selectedWholesaler.cancelledCount ?? 0) > 0 ? "#dc2626" : "#6b7280" }}>{selectedWholesaler.cancelledCount ?? 0}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedWholesaler.cancellationRate ?? 0}% rate</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-gray-400 mb-1.5">GMV Breakdown</p>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Total GMV</span>
                    <span className="text-xs font-bold text-gray-800">{fmt(selectedWholesaler.totalGMV)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">GMV (with fees)</span>
                    <span className="text-xs font-medium" style={{ color: GREEN }}>{fmt(selectedWholesaler.gmvWithFees ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">GMV (no fees)</span>
                    <span className="text-xs font-medium" style={{ color: AMBER }}>{fmt(selectedWholesaler.gmvWithoutFees ?? 0)}</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-gray-400">Platform Earned</p>
                  <p className="text-sm font-bold mt-1" style={{ color: GREEN }}>{fmt(selectedWholesaler.totalFeesEarned)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Joined</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">{selectedWholesaler.createdAt ? format(new Date(selectedWholesaler.createdAt), "dd MMM yyyy") : "—"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Last Active</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">{selectedWholesaler.lastSeenAt ? format(new Date(selectedWholesaler.lastSeenAt), "dd MMM yyyy") : "Never"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-gray-400">Last Real User Activity</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Excludes super admin impersonation activity
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mt-1">
                    {(selectedWholesaler.lastRealUserActivityAt ?? selectedWholesaler.lastSeenAt)
                      ? formatDateTime((selectedWholesaler.lastRealUserActivityAt ?? selectedWholesaler.lastSeenAt)!)
                      : "Never"}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Contact</p>
                <p className="text-xs text-gray-500">{selectedWholesaler.email}</p>
                {selectedWholesaler.phoneNumber && <p className="text-xs text-gray-500">{selectedWholesaler.phoneNumber}</p>}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-3">Recent Orders</p>
                {ordersLoading ? (
                  <div className="text-xs text-gray-400">Loading orders...</div>
                ) : wholesalerOrders?.orders?.length === 0 ? (
                  <div className="text-xs text-gray-400">No orders yet.</div>
                ) : (
                  <div className="space-y-2">
                    {(wholesalerOrders?.orders ?? []).map(o => (
                      <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50">
                        <div>
                          <span className="font-mono text-gray-500">{o.orderNumber}</span>
                          <span className="text-gray-400 ml-2">{o.customerName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">{fmt(parseFloat(o.subtotal || "0"))}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs border ${o.status === "fulfilled" ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-100 border-gray-200 text-gray-500"}`}>
                            {(o.status || "pending").replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Fee Override */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-emerald-500" />Customer Fee Override
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  {(selectedWholesaler.customerFeePercentage !== null || selectedWholesaler.customerFixedFee !== null)
                    ? `Currently: ${selectedWholesaler.customerFeePercentage !== null ? `${(selectedWholesaler.customerFeePercentage * 100).toFixed(2)}%` : "system %"} + ${selectedWholesaler.customerFixedFee !== null ? `£${selectedWholesaler.customerFixedFee.toFixed(2)}` : "system fixed"} (custom)`
                    : "Currently: system-wide default (no override)"}
                </p>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <input type="number" min="0" max="100" step="0.01" placeholder="e.g. 2.00"
                      value={customerFeeInput.percentage}
                      onChange={e => setCustomerFeeInput(p => ({ ...p, percentage: e.target.value }))}
                      className="w-full h-8 text-xs border border-gray-200 rounded-md pl-2 pr-6 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                    <input type="number" min="0" max="99" step="0.01" placeholder="e.g. 0.70"
                      value={customerFeeInput.fixed}
                      onChange={e => setCustomerFeeInput(p => ({ ...p, fixed: e.target.value }))}
                      className="w-full h-8 text-xs border border-gray-200 rounded-md pl-5 pr-2 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                  <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    disabled={customerFeeOverrideMutation.isPending || (customerFeeInput.percentage === "" && customerFeeInput.fixed === "")}
                    onClick={() => {
                      const pct = customerFeeInput.percentage !== "" ? parseFloat(customerFeeInput.percentage) : null;
                      const fixed = customerFeeInput.fixed !== "" ? parseFloat(customerFeeInput.fixed) : null;
                      if (pct !== null && (isNaN(pct) || pct < 0 || pct > 100)) { toast({ title: "Enter a valid percentage (0–100)", variant: "destructive" }); return; }
                      if (fixed !== null && (isNaN(fixed) || fixed < 0 || fixed > 99)) { toast({ title: "Enter a valid fixed fee (0–99)", variant: "destructive" }); return; }
                      customerFeeOverrideMutation.mutate({ id: selectedWholesaler.id, percentage: pct, fixed });
                    }}>Set</Button>
                  {(selectedWholesaler.customerFeePercentage !== null || selectedWholesaler.customerFixedFee !== null) && (
                    <Button size="sm" variant="outline" className="h-8 text-xs border-gray-200"
                      disabled={customerFeeOverrideMutation.isPending}
                      onClick={() => {
                        customerFeeOverrideMutation.mutate({ id: selectedWholesaler.id, percentage: null, fixed: null });
                        setCustomerFeeInput({ percentage: "", fixed: "" });
                      }}>
                      Reset
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Leave a field blank to keep the platform default for that component.</p>
              </div>

              {/* Negotiated Subscription Price */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-indigo-500" />Negotiated Subscription Price
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  {(selectedWholesaler.customAnnualPrice || selectedWholesaler.customMonthlyPrice)
                    ? `${selectedWholesaler.customAnnualPrice ? `Annual: £${selectedWholesaler.customAnnualPrice.toFixed(2)}/yr` : "Annual: standard"}  ${selectedWholesaler.customMonthlyPrice ? `Monthly: £${selectedWholesaler.customMonthlyPrice.toFixed(2)}/mo` : "Monthly: standard"}`
                    : "No override — standard plan prices apply"}
                </p>
                <div className="flex gap-2 items-center mb-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                    <input type="number" min="0" step="0.01" placeholder="Annual price"
                      value={customSubPriceInput.annual}
                      onChange={e => setCustomSubPriceInput(p => ({ ...p, annual: e.target.value }))}
                      className="w-full h-8 text-xs border border-gray-200 rounded-md pl-5 pr-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                    <input type="number" min="0" step="0.01" placeholder="Monthly price"
                      value={customSubPriceInput.monthly}
                      onChange={e => setCustomSubPriceInput(p => ({ ...p, monthly: e.target.value }))}
                      className="w-full h-8 text-xs border border-gray-200 rounded-md pl-5 pr-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <Button size="sm" className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                    disabled={customSubPricingMutation.isPending || (customSubPriceInput.annual === "" && customSubPriceInput.monthly === "")}
                    onClick={() => {
                      const annual = customSubPriceInput.annual !== "" ? parseFloat(customSubPriceInput.annual) : null;
                      const monthly = customSubPriceInput.monthly !== "" ? parseFloat(customSubPriceInput.monthly) : null;
                      if (annual !== null && (isNaN(annual) || annual <= 0)) { toast({ title: "Enter a valid annual price", variant: "destructive" }); return; }
                      if (monthly !== null && (isNaN(monthly) || monthly <= 0)) { toast({ title: "Enter a valid monthly price", variant: "destructive" }); return; }
                      customSubPricingMutation.mutate({ id: selectedWholesaler.id, annual, monthly });
                      setCustomSubPriceInput({ annual: "", monthly: "" });
                    }}>Save</Button>
                  {(selectedWholesaler.customAnnualPrice || selectedWholesaler.customMonthlyPrice) && (
                    <Button size="sm" variant="outline" className="h-8 text-xs border-gray-200"
                      disabled={customSubPricingMutation.isPending}
                      onClick={() => {
                        customSubPricingMutation.mutate({ id: selectedWholesaler.id, annual: null, monthly: null });
                        setCustomSubPriceInput({ annual: "", monthly: "" });
                      }}>Clear</Button>
                  )}
                </div>
                <p className="text-xs text-gray-400">Leave a field blank to keep standard pricing for that interval.</p>
              </div>

              {/* Wholesaler Platform Fee */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-amber-500" />Wholesaler Platform Fee
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  {selectedWholesaler.customFeePercentage !== null
                    ? `Currently: ${selectedWholesaler.customFeePercentage}% (custom)`
                    : "Currently: default rate (no override)"}
                </p>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <input type="number" min="0" max="100" step="0.1" placeholder="e.g. 3.5"
                      value={customFeeInput}
                      onChange={e => setCustomFeeInput(e.target.value)}
                      className="w-full h-8 text-xs border border-gray-200 rounded-md pl-2 pr-6 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                  <Button size="sm" className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white gap-1"
                    disabled={customFeeMutation.isPending || customFeeInput === ""}
                    onClick={() => {
                      const val = parseFloat(customFeeInput);
                      if (isNaN(val) || val < 0 || val > 100) { toast({ title: "Enter a valid percentage (0–100)", variant: "destructive" }); return; }
                      customFeeMutation.mutate({ id: selectedWholesaler.id, fee: val });
                    }}>Set</Button>
                  {selectedWholesaler.customFeePercentage !== null && (
                    <Button size="sm" variant="outline" className="h-8 text-xs border-gray-200"
                      disabled={customFeeMutation.isPending}
                      onClick={() => { customFeeMutation.mutate({ id: selectedWholesaler.id, fee: null }); setCustomFeeInput(""); }}>
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              {/* Change Plan */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" style={{ color: GREEN }} />Change Plan
                </p>
                {selectedWholesaler.isCustomPricing && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">Custom pricing</span>
                    {selectedWholesaler.internalNote && <span className="text-xs text-gray-500 italic">{selectedWholesaler.internalNote}</span>}
                    {selectedWholesaler.customPriceExpiresAt && (() => {
                      const days = customPriceDaysRemaining(selectedWholesaler.customPriceExpiresAt);
                      const dateStr = new Date(selectedWholesaler.customPriceExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                      const isWarning = days !== null && days <= 30;
                      return isWarning ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-300">
                          {days <= 0 ? `Expired ${dateStr}` : `Expires ${dateStr} (${days}d left)`}
                        </span>
                      ) : <span className="text-xs text-gray-400">expires {dateStr}</span>;
                    })()}
                    <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                      disabled={removeCustomPricingMutation.isPending}
                      onClick={() => setRemoveCustomPricingConfirm(true)}>
                      Remove custom pricing
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <select value={changePlanId} onChange={e => setChangePlanId(e.target.value)} className="flex-1 h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none">
                    <option value="">— Select new plan —</option>
                    {activePlans.map(p => (
                      <option key={p.planId} value={p.planId}>
                        {p.name} {parseFloat(p.monthlyPrice) > 0 ? `(£${parseFloat(p.monthlyPrice).toFixed(2)}/${p.billingInterval || "mo"})` : "(Free)"}
                        {p.planId === (selectedWholesaler.currentPlan || "free") ? " ✓ current" : ""}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" className="h-8 text-xs text-white gap-1" style={{ background: GREEN }}
                    disabled={!changePlanId || changePlanId === (selectedWholesaler.currentPlan || "free") || changePlanMutation.isPending}
                    onClick={() => setChangePlanConfirm(true)}>Apply</Button>
                </div>
                {changePlanId && changePlanId === (selectedWholesaler.currentPlan || "free") && (
                  <p className="text-xs text-amber-600 mt-1">This is already their current plan.</p>
                )}
                <div className="mt-2 space-y-1.5">
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Custom Stripe Price ID <span className="text-gray-400">(optional)</span></label>
                    <input type="text" placeholder="e.g. price_1ABC…" value={customPriceId} onChange={e => setCustomPriceId(e.target.value)}
                      className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-green-400 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Internal note <span className="text-gray-400">(optional)</span></label>
                    <input type="text" placeholder="e.g. Discounted annual deal until April 2027" value={customPriceNote} onChange={e => setCustomPriceNote(e.target.value)}
                      className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-green-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Price expires <span className="text-gray-400">(optional)</span></label>
                    <input type="date" value={customPriceExpiry} onChange={e => setCustomPriceExpiry(e.target.value)}
                      className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-green-400" />
                  </div>
                </div>
              </div>

              {/* Multi-Profile Toggle */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" style={{ color: BLUE }} />Enable Multi Profile
                </p>
                <p className="text-xs text-gray-400 mb-2">Allows this wholesaler to create multiple business profiles and choose one per order/quote.</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => multiProfileMutation.mutate({ id: selectedWholesaler.id, enabled: !selectedWholesaler.enableMultiProfile })}
                    disabled={multiProfileMutation.isPending}
                    className="flex items-center gap-2 text-xs font-medium">
                    {selectedWholesaler.enableMultiProfile ? (
                      <ToggleRight className="h-5 w-5" style={{ color: BLUE }} />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={selectedWholesaler.enableMultiProfile ? "text-blue-700" : "text-gray-400"}>
                      {selectedWholesaler.enableMultiProfile ? "Enabled" : "Disabled"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Homepage Logo Strip */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" style={{ color: GREEN }} />Homepage Logo Strip
                </p>
                <p className="text-xs text-gray-400 mb-2">Controls whether this wholesaler's logo appears in the homepage logo strip.</p>
                {selectedWholesaler.showOnHomepage && !selectedWholesaler.logoUrl && (
                  <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 mb-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-amber-700 mb-1.5">This wholesaler is shown on the homepage strip but has no logo uploaded. Their slot will appear blank. Ask them to upload a logo or remove them from the strip.</p>
                      <a
                        href={`mailto:${selectedWholesaler.email}?subject=${encodeURIComponent("Action needed: Upload your logo")}&body=${encodeURIComponent(`Hi ${selectedWholesaler.businessName || "there"},\n\nYour store is currently featured on the homepage logo strip, but you haven't uploaded a logo yet. This means your slot appears blank to visitors.\n\nPlease log in and upload your logo from your store settings so your brand is properly represented.\n\nThanks!`)}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded px-2 py-1 transition-colors"
                      >
                        <Mail className="h-3 w-3" />
                        Contact wholesaler
                      </a>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleShowOnHomepage.mutate(selectedWholesaler.id)}
                    disabled={toggleShowOnHomepage.isPending}
                    className="flex items-center gap-2 text-xs font-medium">
                    {selectedWholesaler.showOnHomepage ? (
                      <ToggleRight className="h-5 w-5" style={{ color: GREEN }} />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={selectedWholesaler.showOnHomepage ? "text-green-700" : "text-gray-400"}>
                      {selectedWholesaler.showOnHomepage ? "Shown on homepage" : "Hidden from homepage"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Legal Business Information */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-gray-500" />Legal Business Information
                </p>
                <p className="text-xs text-gray-400 mb-2">These fields appear on invoices. All optional.</p>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Legal Business Name</label>
                    <input type="text" placeholder="e.g. Acme Trading Ltd" value={legalInfoInput.legalBusinessName}
                      onChange={e => setLegalInfoInput(prev => ({ ...prev, legalBusinessName: e.target.value }))}
                      className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-0.5">VAT Number</label>
                      <input type="text" placeholder="e.g. GB123456789" value={legalInfoInput.vatNumber}
                        onChange={e => setLegalInfoInput(prev => ({ ...prev, vatNumber: e.target.value }))}
                        className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-0.5">Co. Reg No.</label>
                      <input type="text" placeholder="e.g. 12345678" value={legalInfoInput.companyRegistrationNumber}
                        onChange={e => setLegalInfoInput(prev => ({ ...prev, companyRegistrationNumber: e.target.value }))}
                        className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                  </div>
                  <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white w-full"
                    disabled={legalInfoMutation.isPending}
                    onClick={() => legalInfoMutation.mutate({ id: selectedWholesaler.id, data: legalInfoInput })}>
                    {legalInfoMutation.isPending ? "Saving…" : "Save Legal Info"}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => { toggleStatus.mutate(selectedWholesaler.id); setDrawerOpen(false); }}>
                  {selectedWholesaler.archived ? "Activate account" : "Suspend account"}
                </Button>
                <Button size="sm" variant="outline" className={`text-xs flex-1 ${selectedWholesaler.isTestAccount ? "border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`} disabled={toggleTestAccount.isPending} onClick={() => { toggleTestAccount.mutate(selectedWholesaler.id); setDrawerOpen(false); }}>
                  {selectedWholesaler.isTestAccount ? "Remove test flag" : "Mark as test"}
                </Button>
                <Button size="sm" variant="outline" className={`text-xs flex-1 ${selectedWholesaler.isInactive ? "border-gray-400 text-gray-600 bg-gray-100 hover:bg-gray-200" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`} disabled={toggleInactive.isPending} onClick={() => { toggleInactive.mutate(selectedWholesaler.id); setDrawerOpen(false); }}>
                  {selectedWholesaler.isInactive ? "Remove inactive" : "Mark inactive"}
                </Button>
                <a href={`mailto:${selectedWholesaler.email}`} className="flex-1">
                  <Button size="sm" variant="outline" className="w-full text-xs gap-1.5">
                    <Mail className="h-3.5 w-3.5" />Contact
                  </Button>
                </a>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Change Plan Confirmation */}
      <Dialog open={changePlanConfirm} onOpenChange={open => { if (!open) setChangePlanConfirm(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4" style={{ color: GREEN }} />Change Subscription Plan
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-700">
              Change <strong>{selectedWholesaler?.businessName || selectedWholesaler?.email}</strong> from <strong>{selectedWholesaler?.currentPlan && selectedWholesaler.currentPlan !== "free" ? selectedWholesaler.currentPlan : "starter"}</strong> to <strong>{changePlanId}</strong>?
            </p>
            {selectedWholesaler?.stripeSubscriptionId ? (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                This wholesaler has an active Stripe subscription. The plan will be swapped with proration applied immediately.
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
                No active Stripe subscription found. This is an admin override — the plan will be set directly without Stripe billing.
              </div>
            )}
            {customPriceId && (
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-xs text-purple-700 space-y-0.5">
                <p className="font-medium">Custom price will be applied</p>
                <p className="font-mono break-all">{customPriceId}</p>
                {customPriceNote && <p className="text-purple-600">{customPriceNote}</p>}
                {customPriceExpiry && <p className="text-purple-500">Expires: {new Date(customPriceExpiry).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setChangePlanConfirm(false)}>Cancel</Button>
            <Button size="sm" className="text-xs text-white" style={{ background: GREEN }}
              disabled={changePlanMutation.isPending}
              onClick={() => selectedWholesaler && changePlanMutation.mutate({
                id: selectedWholesaler.id, planId: changePlanId,
                customPriceId: customPriceId || undefined,
                internalNote: customPriceNote || undefined,
                customPriceExpiresAt: customPriceExpiry || undefined,
              })}>
              {changePlanMutation.isPending ? "Changing…" : "Confirm change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove custom pricing */}
      <Dialog open={removeCustomPricingConfirm} onOpenChange={open => { if (!open) setRemoveCustomPricingConfirm(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-red-500" />Remove Custom Pricing
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-700">Remove custom pricing from <strong>{selectedWholesaler?.businessName || selectedWholesaler?.email}</strong>?</p>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-700">
              This will clear the custom pricing flag, internal note, and expiry date. The wholesaler will revert to standard billing for their current plan.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setRemoveCustomPricingConfirm(false)}>Cancel</Button>
            <Button size="sm" className="text-xs text-white bg-red-600 hover:bg-red-700"
              disabled={removeCustomPricingMutation.isPending}
              onClick={() => selectedWholesaler && removeCustomPricingMutation.mutate(selectedWholesaler.id)}>
              {removeCustomPricingMutation.isPending ? "Removing…" : "Confirm removal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonation confirmation */}
      <Dialog open={!!impersonateTarget} onOpenChange={open => { if (!open) setImpersonateTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-indigo-600" />Login as Wholesaler
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-gray-700">You are about to view the dashboard as:</p>
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
              <p className="text-sm font-semibold text-indigo-800">{impersonateTarget?.businessName || `${impersonateTarget?.firstName || ''} ${impersonateTarget?.lastName || ''}`.trim()}</p>
              <p className="text-xs text-indigo-600 mt-0.5">{impersonateTarget?.email}</p>
            </div>
            <p className="text-xs text-gray-500">This action is fully audited. You will see the wholesaler dashboard exactly as they do. Click "Exit Impersonation" in the banner to return.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setImpersonateTarget(null)}>Cancel</Button>
            <Button size="sm" className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white" disabled={impersonateMutation.isPending} onClick={() => impersonateTarget && impersonateMutation.mutate(impersonateTarget.id)}>
              {impersonateMutation.isPending ? "Loading..." : "Confirm & View Dashboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Tester */}
      <Dialog open={createTesterOpen} onOpenChange={open => { if (!open) { setCreateTesterOpen(false); setTesterForm({ firstName: "", lastName: "", email: "", password: "" }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4" style={{ color: PURPLE }} />Create Tester Account
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-xs text-gray-500 bg-purple-50 border border-purple-100 rounded-lg p-3">
              Creates a new wholesaler account flagged as a test account. A welcome email with login credentials will be sent to the tester.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600">First name *</Label>
                <Input value={testerForm.firstName} onChange={e => setTesterForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Jane" className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs text-gray-600">Last name *</Label>
                <Input value={testerForm.lastName} onChange={e => setTesterForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Smith" className="h-8 text-xs mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-600">Email *</Label>
                <Input type="email" value={testerForm.email} onChange={e => setTesterForm(f => ({ ...f, email: e.target.value }))} placeholder="tester@example.com" className="h-8 text-xs mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-600">Temporary password *</Label>
                <Input type="password" value={testerForm.password} onChange={e => setTesterForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" className="h-8 text-xs mt-1" autoComplete="new-password" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => { setCreateTesterOpen(false); setTesterForm({ firstName: "", lastName: "", email: "", password: "" }); }}>Cancel</Button>
            <Button size="sm" className="text-xs text-white" style={{ background: PURPLE }}
              disabled={!testerForm.firstName.trim() || !testerForm.lastName.trim() || !testerForm.email.trim() || !testerForm.password || createTesterMutation.isPending}
              onClick={() => createTesterMutation.mutate(testerForm)}>
              {createTesterMutation.isPending ? "Creating…" : "Create tester"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
