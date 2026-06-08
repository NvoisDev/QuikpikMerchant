import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PlusCircle, Archive, AlertTriangle, BadgeCheck, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GREEN, fmt, planBadge } from "./shared";
import type { AdminPlanRow } from "./types";

const TIER_SUMMARY = [
  {
    planId: "listing",
    label: "Listing",
    price: "£19.99/mo",
    color: "gray",
    note: null,
    limits: "Up to 10 products · 1 team seat · No broadcasts",
  },
  {
    planId: "starter",
    label: "Starter",
    price: "£29.99/mo",
    color: "blue",
    note: null,
    limits: "Up to 20 products · 1 team seat · 10 broadcasts/mo",
  },
  {
    planId: "standard",
    label: "Standard",
    price: "£49.99/mo",
    color: "emerald",
    note: null,
    limits: "Up to 50 products · 3 team seats · 25 broadcasts/mo",
  },
  {
    planId: "premium",
    label: "Premium",
    price: "£99.99/mo",
    color: "purple",
    note: null,
    limits: "Unlimited products · Unlimited seats · Unlimited broadcasts",
  },
] as const;

export function PlansSection({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AdminPlanRow | null>(null);
  const [form, setForm] = useState({
    name: "", price: "", billingInterval: "monthly",
    description: "", featuresRaw: "", limitsProducts: "", limitsTeamMembers: "",
    limitsPriceLists: "", limitsCustomGroups: "", limitsBroadcasts: "",
  });

  const { data, isLoading } = useQuery<{ plans: AdminPlanRow[] }>({
    queryKey: ["/api/admin/plans"],
    enabled: isAdmin,
  });
  const plans = data?.plans ?? [];

  const createPlan = useMutation({
    mutationFn: async (body: object) => {
      const r = await apiRequest("POST", "/api/admin/plans", body);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plan created" });
      setNewPlanOpen(false);
      setForm({ name: "", price: "", billingInterval: "monthly", description: "", featuresRaw: "", limitsProducts: "", limitsTeamMembers: "", limitsPriceLists: "", limitsCustomGroups: "", limitsBroadcasts: "" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const archivePlan = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("PATCH", `/api/admin/plans/${id}/archive`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plan archived — hidden from new signups" });
      setArchiveTarget(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    const featuresList = form.featuresRaw.split("\n").map(s => s.trim()).filter(Boolean);
    const toLimit = (v: string) => v.trim() === "" || v.trim() === "∞" || v.trim() === "-1" ? -1 : parseInt(v) || 0;
    const limits: Record<string, number> = {};
    if (form.limitsProducts.trim())     limits.products     = toLimit(form.limitsProducts);
    if (form.limitsTeamMembers.trim())  limits.teamMembers  = toLimit(form.limitsTeamMembers);
    if (form.limitsPriceLists.trim())   limits.priceLists   = toLimit(form.limitsPriceLists);
    if (form.limitsCustomGroups.trim()) limits.customGroups = toLimit(form.limitsCustomGroups);
    if (form.limitsBroadcasts.trim())   limits.broadcasts   = toLimit(form.limitsBroadcasts);
    createPlan.mutate({ name: form.name, price: form.price, billingInterval: form.billingInterval, description: form.description, features: featuresList, limits });
  };

  const colorMap = {
    gray:    { card: "bg-gray-50 border-gray-200", badge: "bg-gray-100 text-gray-600", price: "text-gray-700", limits: "text-gray-500" },
    blue:    { card: "bg-blue-50 border-blue-100",   badge: "bg-blue-100 text-blue-700", price: "text-blue-700", limits: "text-blue-500" },
    emerald: { card: "bg-emerald-50 border-emerald-100", badge: "bg-emerald-100 text-emerald-700", price: "text-emerald-700", limits: "text-emerald-500" },
    purple:  { card: "bg-purple-50 border-purple-100", badge: "bg-purple-100 text-purple-700", price: "text-purple-700", limits: "text-purple-500" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Subscription Plans</h2>
          <p className="text-xs text-gray-400">Manage plan tiers, pricing, and limits. Existing plans are immutable — create new versions instead.</p>
        </div>
        <Button size="sm" className="text-white text-xs gap-1.5" style={{ background: GREEN }} onClick={() => setNewPlanOpen(true)}>
          <PlusCircle className="h-3.5 w-3.5" />New Plan
        </Button>
      </div>

      {/* Four-tier reference overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {TIER_SUMMARY.map(tier => {
          const c = colorMap[tier.color];
          return (
            <div key={tier.planId} className={`rounded-xl border p-4 ${c.card}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${c.badge}`}>{tier.label}</span>
                <span className={`text-sm font-bold ${c.price}`}>{tier.price}</span>
              </div>
              <p className={`text-xs mt-1 ${c.limits}`}>{tier.limits}</p>
              {tier.note && (
                <div className="flex items-start gap-1 mt-2 bg-white/70 rounded-md px-2 py-1.5">
                  <Info className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-medium">{tier.note}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading plans…</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-[#f0faf4]">
                    {["Plan","Price","Interval","Subscribers","MRR","Status",""].map((h, i) => (
                      <TableHead key={i} className="text-xs font-semibold" style={{ color: GREEN }}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map(p => (
                    <TableRow key={p.id} className={p.isActive ? "hover:bg-green-50/30" : "opacity-50 bg-gray-50"}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-gray-800">{p.name}</p>
                          {p.version && p.version > 1 && <span className="text-xs text-gray-400">v{p.version}</span>}
                        </div>
                        {p.planId && <p className="text-xs text-gray-400 font-mono">{p.planId}</p>}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-gray-800">
                        {parseFloat(p.monthlyPrice) === 0 ? "Free" : `£${parseFloat(p.monthlyPrice).toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500 capitalize">{p.billingInterval || "monthly"}</TableCell>
                      <TableCell className="text-xs text-right text-gray-700 font-medium">{p.subscriberCount}</TableCell>
                      <TableCell className="text-xs text-right font-bold" style={{ color: GREEN }}>
                        {p.mrr > 0 ? fmt(p.mrr) : "—"}
                      </TableCell>
                      <TableCell>
                        {p.isActive
                          ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 border border-green-200" style={{ color: GREEN }}><BadgeCheck className="h-3 w-3" />Active</span>
                          : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500"><Archive className="h-3 w-3" />Archived</span>
                        }
                      </TableCell>
                      <TableCell>
                        {p.isActive && p.planId !== 'free' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200"
                            onClick={() => setArchiveTarget(p)}>
                            Archive
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Plan Modal */}
      <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <PlusCircle className="h-4 w-4" style={{ color: GREEN }} />Create New Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg p-3">
              Creating a new plan does <strong>not</strong> affect existing subscribers. A new Stripe Product + Price will be created automatically for paid plans.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs text-gray-600">Plan name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Growth" className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs text-gray-600">Price (£) *</Label>
                <Input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0 for free" type="number" min="0" step="0.01" className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs text-gray-600">Billing interval</Label>
                <select value={form.billingInterval} onChange={e => setForm(f => ({ ...f, billingInterval: e.target.value }))} className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 mt-1 bg-white focus:outline-none">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-600">Description</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description shown to wholesalers" className="h-8 text-xs mt-1" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-600">Features (one per line)</Label>
                <textarea value={form.featuresRaw} onChange={e => setForm(f => ({ ...f, featuresRaw: e.target.value }))}
                  placeholder={"Up to 10 products\nUnlimited price lists\nPriority support"} rows={4}
                  className="w-full text-xs border border-gray-200 rounded-md px-3 py-2 mt-1 focus:outline-none resize-none" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">Limits <span className="text-gray-400 font-normal">(leave blank = inherit default, -1 or ∞ = unlimited)</span></p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { field: "limitsProducts" as const, label: "Products" },
                  { field: "limitsTeamMembers" as const, label: "Team members" },
                  { field: "limitsPriceLists" as const, label: "Price lists" },
                  { field: "limitsCustomGroups" as const, label: "Customer groups" },
                  { field: "limitsBroadcasts" as const, label: "Broadcasts/mo" },
                ].map(({ field, label }) => (
                  <div key={field}>
                    <Label className="text-xs text-gray-500">{label}</Label>
                    <Input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder="—" className="h-7 text-xs mt-0.5" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setNewPlanOpen(false)}>Cancel</Button>
            <Button size="sm" className="text-xs text-white" style={{ background: GREEN }}
              disabled={!form.name.trim() || !form.price.trim() || createPlan.isPending}
              onClick={handleCreate}>
              {createPlan.isPending ? "Creating…" : "Create plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation dialog */}
      <Dialog open={!!archiveTarget} onOpenChange={open => { if (!open) setArchiveTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Archive className="h-4 w-4 text-amber-600" />Archive plan
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-700">Archive <strong>{archiveTarget?.name}</strong>?</p>
            {(archiveTarget?.subscriberCount ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                <strong>{archiveTarget?.subscriberCount}</strong> wholesaler{archiveTarget?.subscriberCount !== 1 ? "s" : ""} currently on this plan. They will remain on it and continue to be billed — archiving only hides it from new signups.
              </div>
            )}
            <p className="text-xs text-gray-500">This plan will no longer appear on the pricing page for new wholesalers.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setArchiveTarget(null)}>Cancel</Button>
            <Button size="sm" className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
              disabled={archivePlan.isPending}
              onClick={() => archiveTarget && archivePlan.mutate(archiveTarget.id)}>
              {archivePlan.isPending ? "Archiving…" : "Archive plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
