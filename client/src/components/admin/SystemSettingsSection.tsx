import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { formatNumber } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { GREEN, fmt, planBadge } from "./shared";
import type { AdminPlanRow, StripeModeData } from "./types";

export function SystemSettingsSection({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stripeSubId, setStripeSubId] = useState("");
  const [planOverride, setPlanOverride] = useState("");
  const [syncEmail, setSyncEmail] = useState("");
  const [syncPlanOverride, setSyncPlanOverride] = useState("");
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetResult, setResetResult] = useState<{ deleted: Record<string, number>; totalDeleted: number } | null>(null);

  const [feeEditOpen, setFeeEditOpen] = useState(false);
  const [feeEditPct, setFeeEditPct] = useState("");
  const [feeEditFixed, setFeeEditFixed] = useState("");
  const [feeEditPlatformPct, setFeeEditPlatformPct] = useState("");
  const [feeEditNotes, setFeeEditNotes] = useState("");
  const [feeConfirmOpen, setFeeConfirmOpen] = useState(false);
  const PREVIEW_ORDER_SIZE = 100;

  const { data: stripeMode } = useQuery<StripeModeData>({
    queryKey: ["/api/admin/stripe-mode"],
    enabled: isAdmin,
    staleTime: 10 * 60 * 1000,
  });

  const { data: settingsPlansData } = useQuery<{ plans: AdminPlanRow[] }>({
    queryKey: ["/api/admin/plans"],
    enabled: isAdmin,
  });

  type FeeConfigRow = { id: number; customerPercentageFee: string; customerFixedFee: string; platformFeePercentage: string | null; notes: string | null; createdBy: string; createdAt: string };
  const { data: feeConfigData } = useQuery<{ current: { percentage: number; fixed: number; platformFeePercentage: number; id: number | null; createdAt: string | null; createdBy: string | null }; history: FeeConfigRow[] }>({
    queryKey: ["/api/admin/fee-config"],
    enabled: isAdmin,
  });

  const saveFeeConfigMutation = useMutation({
    mutationFn: async (payload: { percentage: number; fixed: number; platformFeePercentage: number; notes: string }) => {
      const res = await apiRequest("POST", "/api/admin/fee-config", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Save failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Fee configuration saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fee-config"] });
      setFeeEditOpen(false);
      setFeeConfirmOpen(false);
      setFeeEditNotes("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const activateSub = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/subscriptions/activate", {
        stripeSubscriptionId: stripeSubId,
        ...(planOverride ? { planId: planOverride } : {}),
      });
      return res.json() as Promise<{ planId?: string; userEmail?: string }>;
    },
    onSuccess: (data: { planId?: string; userEmail?: string }) => {
      toast({ title: `Activated ${data?.planId ?? "plan"} for ${data?.userEmail ?? "user"}` });
      setStripeSubId("");
      setPlanOverride("");
    },
    onError: () => toast({ title: "Activation failed", variant: "destructive" }),
  });

  const syncByEmail = useMutation({
    mutationFn: async () => {
      const identifier = syncEmail.trim();
      const isCustomerId = identifier.startsWith("cus_");
      const body = isCustomerId
        ? { stripeCustomerId: identifier, ...(syncPlanOverride ? { planId: syncPlanOverride } : {}) }
        : { email: identifier.toLowerCase(), ...(syncPlanOverride ? { planId: syncPlanOverride } : {}) };
      const res = await apiRequest("POST", "/api/admin/subscriptions/sync-by-customer", body);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      return data as { planId?: string; userEmail?: string; stripeSubscriptionId?: string; source?: string };
    },
    onSuccess: (data: { planId?: string; userEmail?: string; stripeSubscriptionId?: string; source?: string }) => {
      toast({ title: `Synced ${data?.planId ?? "plan"} for ${data?.userEmail ?? "user"}`, description: data?.stripeSubscriptionId });
      setSyncEmail("");
      setSyncPlanOverride("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const previewQuery = useQuery<{ preview: Record<string, number>; totalRows: number }>({
    queryKey: ["/api/admin/go-live-reset/preview"],
    enabled: resetModalOpen && isAdmin,
    staleTime: 0,
    gcTime: 0,
  });

  const goLiveReset = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/go-live-reset", { confirm: "RESET" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Reset failed"); }
      return res.json() as Promise<{ deleted: Record<string, number>; totalDeleted: number }>;
    },
    onSuccess: (data) => {
      setResetResult(data);
      setResetConfirmText("");
      setResetModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      toast({ title: `Platform reset complete — ${data.totalDeleted} rows wiped` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const isLiveMode = stripeMode?.mode === "live";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">System Settings</h2>
        <p className="text-xs text-gray-400">Platform configuration and admin utilities</p>
      </div>

      {/* Environment */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Environment</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${isLiveMode ? "bg-green-500" : "bg-amber-400"}`} />
            <span className="text-sm font-medium text-gray-800">Stripe: {stripeMode ? (isLiveMode ? "Live mode" : "Test mode") : "—"}</span>
            {stripeMode && <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{stripeMode.keyPrefix}</span>}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-xs text-gray-500">{window.location.hostname}</span>
          </div>
        </CardContent>
      </Card>

      {/* Fee configuration */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">Customer Transaction Fee</CardTitle>
            <Button size="sm" variant="outline" className="text-xs h-7 px-2.5" onClick={() => {
              const cur = feeConfigData?.current;
              setFeeEditPct(cur ? (cur.percentage * 100).toFixed(2) : "1.50");
              setFeeEditFixed(cur ? cur.fixed.toFixed(2) : "0.50");
              setFeeEditPlatformPct(cur ? (cur.platformFeePercentage * 100).toFixed(2) : "1.50");
              setFeeEditNotes("");
              setFeeEditOpen(true);
            }}>Edit</Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Merchant (Platform) Fee</p>
              {feeConfigData?.current ? (
                <p className="text-2xl font-bold text-gray-800">
                  {(feeConfigData.current.platformFeePercentage * 100).toFixed(2)}<span className="text-base font-normal">%</span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-gray-800">1.50<span className="text-base font-normal">%</span></p>
              )}
              <p className="text-xs text-gray-400 mt-1">Charged to wholesaler per order</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Customer Transaction Fee</p>
              {feeConfigData?.current ? (
                <p className="text-2xl font-bold text-gray-800">
                  {(feeConfigData.current.percentage * 100).toFixed(2)}<span className="text-base font-normal">% + £{Number(feeConfigData.current.fixed).toFixed(2)}</span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-gray-800">1.50<span className="text-base font-normal">% + £0.50</span></p>
              )}
              <p className="text-xs text-gray-400 mt-1">Charged to buyer per order</p>
            </div>
          </div>
          {feeConfigData?.current?.createdAt && (
            <p className="text-xs text-gray-400">
              Last updated {new Date(feeConfigData.current.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {feeConfigData.current.createdBy ? ` by ${feeConfigData.current.createdBy}` : ""}
            </p>
          )}
          {feeConfigData?.history && feeConfigData.history.length > 1 && (
            <div className="mt-2 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">Change history</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {feeConfigData.history.map((row) => (
                  <div key={row.id} className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-mono">{(parseFloat(row.customerPercentageFee) * 100).toFixed(2)}% + £{parseFloat(row.customerFixedFee).toFixed(2)}</span>
                    <span className="text-gray-400">{new Date(row.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · {row.createdBy}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fee edit modal */}
      <Dialog open={feeEditOpen} onOpenChange={setFeeEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Platform Fees</DialogTitle>
            <DialogDescription>Changes apply to all new orders immediately. Existing orders retain their snapshotted rates.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Merchant (Platform) Fee</p>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Percentage (%)</label>
                <div className="relative">
                  <input type="number" step="0.01" min="0" max="100" value={feeEditPlatformPct} onChange={e => setFeeEditPlatformPct(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-7 focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="1.50" />
                  <span className="absolute right-2.5 top-2 text-xs text-gray-400">%</span>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Customer Transaction Fee</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Percentage (%)</label>
                  <div className="relative">
                    <input type="number" step="0.01" min="0" max="100" value={feeEditPct} onChange={e => setFeeEditPct(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-7 focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="1.50" />
                    <span className="absolute right-2.5 top-2 text-xs text-gray-400">%</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Fixed fee (£)</label>
                  <div className="relative">
                    <input type="number" step="0.01" min="0" value={feeEditFixed} onChange={e => setFeeEditFixed(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pl-6 focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="0.50" />
                    <span className="absolute left-2.5 top-2 text-xs text-gray-400">£</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Notes (optional)</label>
              <input type="text" value={feeEditNotes} onChange={e => setFeeEditNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. Adjusted to cover Stripe fee increase" />
            </div>
            {(() => {
              const pf = parseFloat(feeEditPlatformPct) / 100 || 0;
              const p = parseFloat(feeEditPct) / 100 || 0;
              const fixed = parseFloat(feeEditFixed) || 0;
              const custFee = parseFloat((PREVIEW_ORDER_SIZE * p + fixed).toFixed(2));
              const custPays = parseFloat((PREVIEW_ORDER_SIZE + custFee).toFixed(2));
              const platFee = parseFloat((PREVIEW_ORDER_SIZE * pf).toFixed(2));
              const youReceive = parseFloat((PREVIEW_ORDER_SIZE - platFee).toFixed(2));
              return (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-medium text-gray-600">Preview — £{PREVIEW_ORDER_SIZE} order</p>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Order subtotal</span><span>£{PREVIEW_ORDER_SIZE.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Customer fee ({(p * 100).toFixed(2)}% + £{fixed.toFixed(2)})</span>
                    <span className="font-medium text-orange-600">+£{custFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-gray-800 border-t border-gray-200 pt-1">
                    <span>Customer pays</span><span>£{custPays.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 border-t border-gray-100 pt-1">
                    <span>Platform fee ({(pf * 100).toFixed(2)}%)</span>
                    <span className="font-medium text-red-500">−£{platFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-green-700">
                    <span>You receive</span><span>£{youReceive.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeEditOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => {
              const pp = parseFloat(feeEditPlatformPct);
              const p = parseFloat(feeEditPct);
              const fixed = parseFloat(feeEditFixed);
              if (isNaN(pp) || pp < 0 || pp > 100) {
                toast({ title: "Invalid platform fee — must be 0–100%", variant: "destructive" });
                return;
              }
              if (isNaN(p) || isNaN(fixed) || p < 0 || p > 100 || fixed < 0) {
                toast({ title: "Invalid customer fee — check percentage (0–100) and fixed fee (≥ 0)", variant: "destructive" });
                return;
              }
              setFeeConfirmOpen(true);
            }}>
              Review & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fee confirmation modal */}
      <Dialog open={feeConfirmOpen} onOpenChange={setFeeConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm fee changes</DialogTitle>
            <DialogDescription>This will apply immediately to all new orders.</DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Platform fee</span><span className="font-medium">{feeEditPlatformPct}%</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Customer fee</span><span className="font-medium">{feeEditPct}% + £{feeEditFixed}</span></div>
            {feeEditNotes && <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">{feeEditNotes}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeConfirmOpen(false)}>Go back</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={saveFeeConfigMutation.isPending}
              onClick={() => saveFeeConfigMutation.mutate({
                percentage: parseFloat(feeEditPct) / 100,
                fixed: parseFloat(feeEditFixed),
                platformFeePercentage: parseFloat(feeEditPlatformPct) / 100,
                notes: feeEditNotes,
              })}>
              {saveFeeConfigMutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscription plans */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Subscription Plans</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(settingsPlansData?.plans ?? []).filter(p => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map(plan => {
              const price = parseFloat(plan.monthlyPrice as string);
              const productLimit = plan.limits?.['products'];
              const productLabel = productLimit === -1 ? "Unlimited products" : productLimit > 0 ? `Up to ${productLimit} products` : "—";
              const isFree = price === 0;
              const isPremium = plan.planId === "premium";
              const isStandard = plan.planId === "standard";
              return (
                <div key={plan.planId} className={`rounded-xl p-4 text-center border ${isPremium ? "bg-green-50 border-green-100" : isStandard ? "bg-blue-50 border-blue-100" : "bg-gray-50 border-gray-200"}`}>
                  <p className={`text-xs font-medium ${isPremium ? "" : isStandard ? "text-blue-600" : "text-gray-500"}`} style={isPremium ? { color: GREEN } : undefined}>{plan.name}</p>
                  <p className={`text-xl font-bold mt-1 ${isPremium ? "" : isStandard ? "text-blue-700" : "text-gray-700"}`} style={isPremium ? { color: GREEN } : undefined}>
                    {isFree ? "£0" : <>{`£${price.toFixed(2)}`}<span className="text-sm font-normal">/mo</span></>}
                  </p>
                  <p className={`text-xs mt-1 ${isPremium ? "" : isStandard ? "text-blue-500" : "text-gray-400"}`} style={isPremium ? { color: GREEN } : undefined}>{productLabel}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Subscription activation */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Subscription Activation Utility</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-500">Manually activate a subscription from a Stripe subscription ID. Use when the webhook was missed or subscription is out of sync.</p>
          <div className="space-y-2">
            <Label className="text-xs text-gray-600">Stripe Subscription ID</Label>
            <Input className="text-xs h-8 font-mono border-gray-200" value={stripeSubId} onChange={e => setStripeSubId(e.target.value)} placeholder="sub_1abc…" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-600">Plan Override (optional)</Label>
            <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white" value={planOverride} onChange={e => setPlanOverride(e.target.value)}>
              <option value="">Auto-detect from price ID</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <Button size="sm" className="text-white text-xs h-8 gap-1.5" style={{ background: GREEN }} disabled={!stripeSubId || activateSub.isPending} onClick={() => activateSub.mutate()}>
            {activateSub.isPending ? "Activating…" : "Activate Subscription"}
          </Button>
        </CardContent>
      </Card>

      {/* Sync by Email */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Sync Subscription from Stripe</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-500">Look up a user by email or Stripe customer ID, find their active Stripe subscription, and sync it to our database.</p>
          <div className="space-y-2">
            <Label className="text-xs text-gray-600">Email or Stripe Customer ID</Label>
            <Input className="text-xs h-8 border-gray-200" value={syncEmail} onChange={e => setSyncEmail(e.target.value)} placeholder="customer@example.com or cus_abc123…" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-600">Plan Override (optional)</Label>
            <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white" value={syncPlanOverride} onChange={e => setSyncPlanOverride(e.target.value)}>
              <option value="">Auto-detect from Stripe price</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <Button size="sm" className="text-white text-xs h-8 gap-1.5" style={{ background: GREEN }} disabled={!syncEmail.trim() || syncByEmail.isPending} onClick={() => syncByEmail.mutate()}>
            {syncByEmail.isPending ? "Syncing…" : "Sync from Stripe"}
          </Button>
        </CardContent>
      </Card>

      {/* Go-Live Reset */}
      <Card className="border-red-200 shadow-none rounded-xl bg-red-50/30">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />Go-Live Reset
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {resetResult ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm font-semibold text-green-800">Platform reset complete</p>
              </div>
              <p className="text-xs text-green-700">{resetResult.totalDeleted} total rows wiped across {Object.keys(resetResult.deleted).length} tables.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-2">
                {Object.entries(resetResult.deleted).filter(([, v]) => v > 0).map(([k, v]) => (
                  <div key={k} className="text-xs bg-white border border-green-100 rounded px-2 py-1 flex justify-between gap-2">
                    <span className="text-gray-500 truncate">{k}</span>
                    <span className="font-bold text-green-700">{v}</span>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" className="text-xs mt-2" onClick={() => setResetResult(null)}>Dismiss</Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-red-700">Permanently deletes <strong>all</strong> wholesalers (except the admin account), all customers, all orders, all stock, all broadcasts, and all analytics. This cannot be undone.</p>
              <p className="text-xs text-gray-500">Use this once before accepting real customers. Back up the database in Replit first.</p>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs h-8 gap-1.5" onClick={() => { setResetConfirmText(""); setResetModalOpen(true); }}>
                <AlertTriangle className="h-3.5 w-3.5" />Go-Live Reset…
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Go-Live Reset confirmation modal */}
      <Dialog open={resetModalOpen} onOpenChange={open => { if (!open) { setResetConfirmText(""); setResetModalOpen(false); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />Confirm Go-Live Reset
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-red-800">The following will be permanently deleted:</p>
              {previewQuery.isLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <RefreshCw className="h-3.5 w-3.5 text-red-400 animate-spin" />
                  <span className="text-xs text-red-500">Calculating…</span>
                </div>
              ) : previewQuery.data ? (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(previewQuery.data.preview).filter(([, v]) => v > 0).map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center bg-white border border-red-100 rounded px-2 py-1">
                        <span className="text-xs text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-xs font-bold text-red-700">{formatNumber(v)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center border-t border-red-200 pt-2 mt-1">
                    <span className="text-xs font-semibold text-red-800">Total rows</span>
                    <span className="text-sm font-bold text-red-700">{formatNumber(previewQuery.data.totalRows)}</span>
                  </div>
                </>
              ) : <p className="text-xs text-red-500">Could not load preview</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-700 font-semibold">Type <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-red-700">RESET</span> to confirm</Label>
              <Input value={resetConfirmText} onChange={e => setResetConfirmText(e.target.value)} placeholder="RESET" className="h-8 text-xs font-mono border-red-200 focus:border-red-400" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => { setResetConfirmText(""); setResetModalOpen(false); }}>Cancel</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs gap-1.5"
              disabled={resetConfirmText !== "RESET" || goLiveReset.isPending || previewQuery.isLoading}
              onClick={() => goLiveReset.mutate()}>
              {goLiveReset.isPending ? "Resetting…" : "Reset platform"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
