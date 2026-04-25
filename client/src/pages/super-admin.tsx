import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useImpersonation } from "@/contexts/impersonation-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Users, ShoppingCart, TrendingUp, Search, LogOut, LayoutDashboard, Shield,
  Calendar, MapPin, AlertTriangle, RefreshCw, Package, DollarSign, Settings,
  ChevronRight, Menu, X, Flag, AlertCircle, CheckCircle, Mail, Phone,
  Building2, Eye, ToggleLeft, ToggleRight, Star, CreditCard,
  Activity, LogIn, Terminal, Clock, UserCheck, Zap, PlusCircle, Archive,
  BadgeCheck,
} from "lucide-react";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import logoSrc from "@assets/Quikpik_1773118173684.png";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ADMIN_EMAILS = ["hello@quikpik.co", "mogunjemilua@gmail.com"];

const GREEN  = "#1a7a3d";
const BLUE   = "#1d4ed8";
const AMBER  = "#b45309";
const PURPLE = "#7c3aed";
const RED    = "#dc2626";

const fmt = (n: number) =>
  `£${(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (num: number, denom: number) =>
  denom > 0 ? `${((num / denom) * 100).toFixed(1)}%` : "—";

const toISODate = (d: Date) => d.toISOString().split("T")[0];

const planBadge = (tier: string | null) => {
  if (tier === "premium")
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-800 border border-green-200">Premium</span>;
  if (tier === "standard")
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">Standard</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">Free</span>;
};

type SectionId = "overview" | "wholesalers" | "customers" | "orders" | "products" | "financials" | "settings" | "plans" | "map" | "logs";

// ── Shared data interfaces ────────────────────────────────────────────────────
interface PlatformStats {
  activeWholesalers: number; totalWholesalers: number; suspendedWholesalers: number;
  wholesalersByPlan: { free: number; standard: number; premium: number };
  totalOrders: number; ordersThisMonth: number; todayOrders: number; todayRevenue: number;
  totalGMV: number; totalCustomerFees: number; totalPlatformFees: number; totalGrossRevenue: number;
  newWholesalersThisMonth: number; subscriptionRevenueMRR: number;
  subscriptionBreakdown: { standard: { count: number; mrr: number }; premium: { count: number; mrr: number } };
}
interface AlertsData {
  stuckOrders: Array<{ id: number; orderNumber: string; wholesalerName: string | null; createdAt: string }>;
  stuckOrdersCount: number;
  expiringBatches: Array<{ id: number; productId: number; expiryDate: string; batchCode: string | null; quantity: number | null }>;
  expiringBatchesCount: number;
  failedPayments: Array<{ id: number; userId: string; createdAt: string }>;
  failedPaymentsCount: number;
}
interface WholesalerRow {
  id: string; email: string; firstName: string | null; lastName: string | null;
  businessName: string | null; phoneNumber: string | null;
  subscriptionTier: string | null; subscriptionStatus: string | null;
  currentPlan: string | null; stripeSubscriptionId: string | null;
  archived: boolean; createdAt: string;
  orderCount: number; totalGMV: number; totalFeesEarned: number; lastOrderAt: string | null;
}
interface RevenueTotals {
  totalCustomerFees: number; totalPlatformFees: number; totalGrossRevenue: number; totalGMV: number;
}
interface RevenueOrder {
  id: number; orderNumber: string; wholesalerId: string; wholesalerName: string | null;
  customerName: string | null; subtotal: string; platformFee: string | null;
  customerTransactionFee: string | null; totalQuikpikIncome: number; status: string;
  paymentStatus: string | null; createdAt: string;
}
interface RevenueData { orders: RevenueOrder[]; totals: RevenueTotals; }
interface PayoutStatusData {
  available: number; pending: number; currency: string;
  lastPayout: { amount: number; status: string; arrivalDate: string } | null;
}
interface StripeModeData { mode: 'live' | 'test'; keyPrefix: string; }
interface CustomerRow {
  id: string; name: string; businessName: string | null; email: string | null;
  phoneNumber: string | null; postalCode: string | null; wholesalerName: string | null;
  subscriptionTier: string | null; isSuspicious: boolean | null; isTestAccount: boolean | null;
  orderCount: number | null; customerType: string | null;
}
interface ProductRow {
  id: number; name: string; category: string | null; wholesalerName: string | null;
  wholesalerId: string; costPrice: number | null; sellingPrice: number | null;
  price: number | null; baseUnitStock: number | null;
  margin: number | null; stockAlert: boolean | null; status: string;
  hasMissingCost: boolean; hasLowMargin: boolean; hasZeroStock: boolean;
}
interface WholesalerRevenueSummary {
  name: string; tier: string; orders: number; gmv: number;
  buyerFees: number; merchantFees: number; total: number;
}
interface WholesalerOrderRow {
  id: number; orderNumber: string; customerName: string | null; wholesalerName: string | null;
  subtotal: string; platformFee: string | null; status: string; createdAt: string;
  refundedAt: string | null; refundAmount: string | null; paymentStatus: string | null;
}

const SECTIONS: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview",    label: "Overview",         icon: LayoutDashboard },
  { id: "wholesalers", label: "Wholesalers",       icon: Building2 },
  { id: "customers",   label: "Customers",         icon: Users },
  { id: "orders",      label: "Orders",            icon: ShoppingCart },
  { id: "products",    label: "Products",          icon: Package },
  { id: "financials",  label: "Financials",        icon: TrendingUp },
  { id: "settings",    label: "System Settings",   icon: Settings },
  { id: "plans",       label: "Plans",             icon: CreditCard },
  { id: "map",         label: "Customer Map",      icon: MapPin },
  { id: "logs",        label: "Support & Logs",    icon: Activity },
];

type Preset = "this_month" | "last_month" | "last_3_months" | "all_time";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "this_month",    label: "This month" },
  { id: "last_month",    label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "all_time",      label: "All time" },
];

function presetToDates(p: Preset): { from: string; to: string } | null {
  const now = new Date();
  if (p === "this_month")    return { from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) };
  if (p === "last_month")    { const m = subMonths(now, 1); return { from: toISODate(startOfMonth(m)), to: toISODate(endOfMonth(m)) }; }
  if (p === "last_3_months") return { from: toISODate(startOfMonth(subMonths(now, 2))), to: toISODate(endOfDay(now)) };
  return null;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub: string; icon: React.ReactNode; color: string;
}) {
  const bgMap: Record<string, string> = {
    [GREEN]:  "#f0faf4", [BLUE]: "#eff6ff", [AMBER]: "#fffbeb", [PURPLE]: "#f5f3ff", [RED]: "#fef2f2",
  };
  const bg = bgMap[color] || "#f9fafb";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bg, color }}>{icon}</div>
      </div>
      <p className="text-xl font-bold leading-tight" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string | number; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs ${bold ? "font-bold" : "font-medium"}`} style={{ color: color || "#374151" }}>{value}</span>
    </div>
  );
}

// ── Plans Section ─────────────────────────────────────────────────────────────
interface AdminPlanRow {
  id: number; name: string; planId: string; monthlyPrice: string;
  billingInterval: string | null; version: number | null;
  isActive: boolean; sortOrder: number; subscriberCount: number; mrr: number;
  features: string[]; limits: Record<string, number>;
  stripeProductId: string | null; stripePriceId: string | null;
  createdAt: string;
}

function PlansSection({ isAdmin }: { isAdmin: boolean }) {
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
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setNewPlanOpen(false)}>Cancel</Button>
            <Button size="sm" className="text-xs text-white" style={{ background: GREEN }}
              disabled={!form.name.trim() || !form.price.trim() || createPlan.isPending}
              onClick={handleCreate}>
              {createPlan.isPending ? "Creating…" : "Create plan"}
            </Button>
          </DialogFooter>
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

// ── Customer Map (preserved from original) ─────────────────────────────────────
interface MapCustomer {
  id: string; name: string; businessName: string | null; phoneNumber: string | null;
  postalCode: string | null; customerType: string | null; latitude: number | null;
  longitude: number | null; geocodeStatus: string | null; wholesalerName: string; orderCount: number;
}
const TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  retail:     { label: "Retailer",   color: BLUE,      dot: "#1d4ed8" },
  wholesale:  { label: "Wholesaler", color: GREEN,     dot: "#1a7a3d" },
  individual: { label: "Individual", color: "#d97706", dot: "#f59e0b" },
  unknown:    { label: "Unknown",    color: "#6b7280", dot: "#9ca3af" },
};
function typeDot(t: string | null) { return TYPE_CONFIG[t || "unknown"]?.dot ?? "#9ca3af"; }
function typeColor(t: string | null) { return TYPE_CONFIG[t || "unknown"]?.color ?? "#6b7280"; }
function typeLabel(t: string | null) { return TYPE_CONFIG[t || "unknown"]?.label ?? "Unknown"; }
function makeIcon(type: string | null) {
  const dot = typeDot(type);
  return L.divIcon({ className: "", html: `<div style="width:14px;height:14px;border-radius:50%;background:${dot};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
}
function MarkerPopupContent({ customer, onSave, saving }: { customer: MapCustomer; onSave: (id: string, customerType: string) => void; saving: boolean }) {
  const [selectedType, setSelectedType] = useState<string>(customer.customerType || "");
  const dirty = selectedType !== (customer.customerType || "");
  return (
    <div style={{ minWidth: 190 }}>
      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{customer.name}</p>
      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{customer.postalCode || "No postcode"}</p>
      {customer.wholesalerName && <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>via {customer.wholesalerName}</p>}
      <p style={{ fontSize: 11, color: "#374151", marginBottom: 8 }}>{customer.orderCount} order{customer.orderCount !== 1 ? "s" : ""}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <label style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>Type:</label>
        <select style={{ fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px", background: "white", flex: 1 }} value={selectedType} onChange={e => setSelectedType(e.target.value)}>
          <option value="">Unknown</option>
          <option value="retail">Retailer</option>
          <option value="wholesale">Wholesaler</option>
          <option value="individual">Individual</option>
        </select>
      </div>
      <button disabled={!dirty || saving} onClick={() => onSave(customer.id, selectedType)} style={{ width: "100%", fontSize: 11, padding: "4px 0", borderRadius: 4, border: "none", cursor: dirty && !saving ? "pointer" : "not-allowed", background: dirty && !saving ? "#1a7a3d" : "#e5e7eb", color: dirty && !saving ? "white" : "#9ca3af", fontWeight: 600 }}>
        {saving ? "Saving…" : "Save type"}
      </button>
    </div>
  );
}

// ── Login ────────────────────────────────────────────────────────────────────
function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google?returnTo=/admin");
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
      else setLoading(false);
    } catch { setLoading(false); }
  };
  return (
    <div className="min-h-screen flex flex-col">
      <div className="h-1.5 w-full" style={{ background: GREEN }} />
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <img src={logoSrc} alt="Quikpik" className="h-16 w-auto mx-auto mb-5" />
            <h1 className="text-xl font-bold" style={{ color: GREEN }}>Control Centre</h1>
            <p className="text-sm text-gray-500 mt-1">Platform administration</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <p className="text-sm text-gray-500 mb-5 text-center">Sign in with your Quikpik admin account to continue.</p>
            <Button className="w-full text-white text-sm h-11 rounded-xl font-medium" style={{ background: GREEN }} onClick={handleGoogleLogin} disabled={loading}>
              {loading ? <span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Signing in...</span>
                : <span className="flex items-center gap-2"><svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Continue with Google</span>}
            </Button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-5">Access restricted to authorised administrators only.</p>
        </div>
      </div>
    </div>
  );
}

function AccessDenied({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <img src={logoSrc} alt="Quikpik" className="h-12 w-auto mx-auto mb-5 opacity-40" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Access restricted</h2>
        <p className="text-sm text-gray-500 mb-1"><span className="font-medium text-gray-700">{email}</span> is not an authorised admin account.</p>
        <p className="text-sm text-gray-400 mb-6">Contact the platform owner if you believe this is a mistake.</p>
        <Button variant="outline" size="sm" onClick={onSignOut} className="text-gray-600"><LogOut className="h-4 w-4 mr-2" />Sign out</Button>
      </div>
    </div>
  );
}

// ── Overview Section ──────────────────────────────────────────────────────────
function OverviewSection({ stats, statsLoading, revenueData, revenueLoading, isAdmin, onNavigate }: {
  stats: PlatformStats | undefined; statsLoading: boolean;
  revenueData: RevenueData | undefined; revenueLoading: boolean;
  isAdmin: boolean; onNavigate: (section: SectionId) => void;
}) {
  const subMRR: number = stats?.subscriptionRevenueMRR ?? 0;
  const subBreakdown = stats?.subscriptionBreakdown ?? { standard: { count: 0, mrr: 0 }, premium: { count: 0, mrr: 0 } };
  const revenueTotals = revenueData?.totals ?? ({} as RevenueTotals);

  const { data: alerts } = useQuery<AlertsData>({
    queryKey: ["/api/admin/alerts"],
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Overview</h2>
        <p className="text-xs text-gray-400 mt-0.5">Platform-wide health at a glance</p>
      </div>

      {/* Alerts strip */}
      {alerts && (alerts.stuckOrdersCount > 0 || alerts.expiringBatchesCount > 0 || alerts.failedPaymentsCount > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Needs attention</p>
          <div className="flex items-center gap-2 flex-wrap">
            {alerts.stuckOrdersCount > 0 && (
              <button onClick={() => onNavigate("orders")} className="text-xs bg-amber-100 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium hover:bg-amber-200 transition-colors cursor-pointer">
                {alerts.stuckOrdersCount} stuck order{alerts.stuckOrdersCount !== 1 ? "s" : ""} &gt;24h → view Orders
              </button>
            )}
            {alerts.expiringBatchesCount > 0 && (
              <button onClick={() => onNavigate("products")} className="text-xs bg-orange-100 border border-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-medium hover:bg-orange-200 transition-colors cursor-pointer">
                {alerts.expiringBatchesCount} batch{alerts.expiringBatchesCount !== 1 ? "es" : ""} expiring within 7 days → view Products
              </button>
            )}
            {alerts.failedPaymentsCount > 0 && (
              <button onClick={() => onNavigate("settings")} className="text-xs bg-red-100 border border-red-200 text-red-800 px-2 py-0.5 rounded-full font-medium hover:bg-red-200 transition-colors cursor-pointer">
                {alerts.failedPaymentsCount} subscription payment failure{alerts.failedPaymentsCount !== 1 ? "s" : ""} → view Settings
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-24 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard label="Active Wholesalers"   value={stats?.activeWholesalers ?? 0}  sub={`${stats?.totalWholesalers ?? 0} total`}                          icon={<Building2 className="h-4 w-4" />}    color={GREEN}  />
          <StatCard label="Orders Today"         value={stats?.todayOrders ?? 0}        sub={fmt(stats?.todayRevenue ?? 0) + " GMV"}                           icon={<ShoppingCart className="h-4 w-4" />}  color={AMBER}  />
          <StatCard label="Orders this Month"    value={stats?.ordersThisMonth ?? 0}    sub={`${(stats?.totalOrders ?? 0).toLocaleString()} all-time`}          icon={<Package className="h-4 w-4" />}      color={BLUE}   />
          <StatCard label="All-time GMV"         value={fmt(stats?.totalGMV ?? 0)}      sub="Gross Merchandise Value"                                           icon={<TrendingUp className="h-4 w-4" />}    color={PURPLE} />
          <StatCard label="Sub. MRR"             value={fmt(subMRR)}                    sub="Monthly recurring"                                                 icon={<DollarSign className="h-4 w-4" />}    color={GREEN}  />
          <StatCard label="Failed Payments (30d)" value={alerts?.failedPaymentsCount ?? 0} sub={alerts?.failedPaymentsCount ? "Needs follow-up" : "No failures"} icon={<AlertCircle className="h-4 w-4" />} color={alerts?.failedPaymentsCount ? RED : GREEN} />
        </div>
      )}

      {/* Plan breakdown + revenue */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 p-4 text-center bg-gray-50">
          <p className="text-2xl font-bold text-gray-500">{stats?.wholesalersByPlan?.free || 0}</p>
          <p className="text-xs text-gray-500 mt-1">Free Plan</p>
        </div>
        <div className="rounded-xl border border-blue-100 p-4 text-center bg-blue-50">
          <p className="text-2xl font-bold text-blue-700">{stats?.wholesalersByPlan?.standard || 0}</p>
          <p className="text-xs text-blue-600 mt-1">Standard Plan</p>
        </div>
        <div className="rounded-xl border border-green-100 p-4 text-center bg-green-50">
          <p className="text-2xl font-bold" style={{ color: GREEN }}>{stats?.wholesalersByPlan?.premium || 0}</p>
          <p className="text-xs mt-1" style={{ color: GREEN }}>Premium Plan</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-gray-200 shadow-none rounded-xl">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">This Month</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-2.5">
            <Row label="New wholesalers joined" value={stats?.newWholesalersThisMonth || 0} />
            <Row label="Orders placed"          value={stats?.ordersThisMonth || 0} />
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-none rounded-xl">
          <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Revenue (all-time)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 space-y-2.5">
            <Row label="Buyer fees (5.5% + £0.50)"  value={revenueLoading ? "—" : fmt(revenueTotals.totalCustomerFees)}  color={BLUE} />
            <Row label="Merchant fees (4.6%)"        value={revenueLoading ? "—" : fmt(revenueTotals.totalPlatformFees)}  color={AMBER} />
            <Row label="Subscription MRR"            value={fmt(subMRR)} color={PURPLE} />
            <div className="pt-1.5 border-t border-gray-100">
              <Row label="Total earned (fees + MRR)" value={revenueLoading ? "—" : fmt((revenueTotals.totalGrossRevenue || 0) + subMRR)} color={GREEN} bold />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription breakdown */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Subscription Revenue</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border p-3 bg-blue-50 border-blue-100">
              <p className="text-xs text-blue-600 font-medium mb-1">Standard Plan</p>
              <p className="text-lg font-bold text-blue-700">{subBreakdown.standard.count} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs text-blue-500 mt-0.5">{fmt(subBreakdown.standard.mrr)}/mo</p>
            </div>
            <div className="rounded-xl border p-3 bg-green-50 border-green-100">
              <p className="text-xs font-medium mb-1" style={{ color: GREEN }}>Premium Plan</p>
              <p className="text-lg font-bold" style={{ color: GREEN }}>{subBreakdown.premium.count} <span className="text-sm font-normal">active</span></p>
              <p className="text-xs mt-0.5" style={{ color: GREEN }}>{fmt(subBreakdown.premium.mrr)}/mo</p>
            </div>
            <div className="rounded-xl border p-3 bg-purple-50 border-purple-100">
              <p className="text-xs text-purple-600 font-medium mb-1">Total MRR</p>
              <p className="text-lg font-bold text-purple-700">{fmt(subMRR)}<span className="text-sm font-normal">/mo</span></p>
              <p className="text-xs text-purple-500 mt-0.5">{fmt(subMRR * 12)}/yr est.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Wholesalers Section ───────────────────────────────────────────────────────
function WholesalersSection({ wholesalers, wholesalersLoading, isAdmin }: {
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

  const { data: allPlansData } = useQuery<{ plans: AdminPlanRow[] }>({
    queryKey: ["/api/admin/plans"],
    enabled: isAdmin,
  });
  const activePlans = (allPlansData?.plans ?? []).filter(p => p.isActive);

  const changePlanMutation = useMutation({
    mutationFn: async ({ id, planId }: { id: string; planId: string }) => {
      const r = await apiRequest("POST", `/api/admin/wholesalers/${id}/change-plan`, { planId });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wholesalers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-stats"] });
      toast({ title: "Plan changed successfully" });
      setChangePlanConfirm(false);
      setChangePlanId("");
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
    return wholesalers.filter(w => (w.subscriptionTier ?? "free") === planFilter);
  }, [wholesalers, planFilter]);

  const openDrawer = (w: WholesalerRow) => { setSelectedWholesaler(w); setDrawerOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Wholesalers</h2>
          <p className="text-xs text-gray-400">Manage wholesaler accounts and status</p>
        </div>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none focus:border-gray-400 bg-white">
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </select>
      </div>

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
                    {["Business","Plan","Orders","GMV","Total Fees","Last Order","Status",""].map((h, i) => (
                      <TableHead key={i} className="text-xs font-semibold" style={{ color: GREEN }}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(w => (
                    <TableRow key={w.id} className="hover:bg-green-50/30 cursor-pointer" onClick={() => openDrawer(w)}>
                      <TableCell>
                        <p className="text-xs font-medium text-gray-800">{w.businessName || `${w.firstName} ${w.lastName}`}</p>
                        <p className="text-xs text-gray-400">{w.email}</p>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>{planBadge(w.subscriptionTier)}</TableCell>
                      <TableCell className="text-xs text-right text-gray-600">{w.orderCount}</TableCell>
                      <TableCell className="text-xs text-right text-gray-600">{fmt(w.totalGMV)}</TableCell>
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
            <SheetTitle className="text-sm font-semibold">{selectedWholesaler?.businessName || `${selectedWholesaler?.firstName} ${selectedWholesaler?.lastName}`}</SheetTitle>
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
                  <p className="text-sm font-bold text-gray-800 mt-1">{selectedWholesaler.orderCount}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Total GMV</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{fmt(selectedWholesaler.totalGMV)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Platform Earned</p>
                  <p className="text-sm font-bold mt-1" style={{ color: GREEN }}>{fmt(selectedWholesaler.totalFeesEarned)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Joined</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">{selectedWholesaler.createdAt ? format(new Date(selectedWholesaler.createdAt), "dd MMM yyyy") : "—"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Last Active</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">{selectedWholesaler.lastOrderAt ? format(new Date(selectedWholesaler.lastOrderAt), "dd MMM yyyy") : "No orders yet"}</p>
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
              {/* Change Plan */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" style={{ color: GREEN }} />Change Plan
                </p>
                <div className="flex gap-2">
                  <select
                    value={changePlanId}
                    onChange={e => setChangePlanId(e.target.value)}
                    className="flex-1 h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none"
                  >
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
                    onClick={() => setChangePlanConfirm(true)}>
                    Apply
                  </Button>
                </div>
                {changePlanId && changePlanId === (selectedWholesaler.currentPlan || "free") && (
                  <p className="text-xs text-amber-600 mt-1">This is already their current plan.</p>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => { toggleStatus.mutate(selectedWholesaler.id); setDrawerOpen(false); }}>
                  {selectedWholesaler.archived ? "Activate account" : "Suspend account"}
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

      {/* Change Plan Confirmation Dialog */}
      <Dialog open={changePlanConfirm} onOpenChange={open => { if (!open) { setChangePlanConfirm(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4" style={{ color: GREEN }} />Change Subscription Plan
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-700">
              Change <strong>{selectedWholesaler?.businessName || selectedWholesaler?.email}</strong> from <strong>{selectedWholesaler?.currentPlan || "free"}</strong> to <strong>{changePlanId}</strong>?
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
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setChangePlanConfirm(false)}>Cancel</Button>
            <Button size="sm" className="text-xs text-white" style={{ background: GREEN }}
              disabled={changePlanMutation.isPending}
              onClick={() => selectedWholesaler && changePlanMutation.mutate({ id: selectedWholesaler.id, planId: changePlanId })}>
              {changePlanMutation.isPending ? "Changing…" : "Confirm change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonation confirmation dialog */}
      <Dialog open={!!impersonateTarget} onOpenChange={open => { if (!open) setImpersonateTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-indigo-600" />
              Login as Wholesaler
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-gray-700">
              You are about to view the dashboard as:
            </p>
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
              <p className="text-sm font-semibold text-indigo-800">{impersonateTarget?.businessName || `${impersonateTarget?.firstName} ${impersonateTarget?.lastName}`}</p>
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
    </div>
  );
}

// ── Customers Section ─────────────────────────────────────────────────────────
function CustomersSection({ isAdmin, highlightedId }: { isAdmin: boolean; highlightedId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery<{ customers: CustomerRow[] }>({
    queryKey: ["/api/admin/customers", debouncedQ],
    queryFn: async () => {
      const url = `/api/admin/customers${debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      return r.json() as Promise<{ customers: CustomerRow[] }>;
    },
    enabled: isAdmin,
  });

  const { data: customerOrders, isLoading: ordersLoading } = useQuery<{ orders: WholesalerOrderRow[] }>({
    queryKey: ["/api/admin/customers", selectedCustomer?.id, "orders"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/customers/${selectedCustomer!.id}/orders`, { credentials: "include" });
      return r.json() as Promise<{ orders: WholesalerOrderRow[] }>;
    },
    enabled: !!selectedCustomer && drawerOpen,
  });

  // Open customer detail when navigated from global search
  useEffect(() => {
    if (!highlightedId || !data?.customers?.length) return;
    const match = data.customers.find(c => c.id === highlightedId);
    if (match) {
      setSelectedCustomer(match);
      setDrawerOpen(true);
      setTimeout(() => {
        const el = document.getElementById(`record-customer-${highlightedId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [highlightedId, data?.customers]);

  const flagMutation = useMutation({
    mutationFn: ({ id, isSuspicious }: { id: string; isSuspicious: boolean }) =>
      apiRequest("PATCH", `/api/admin/customers/${id}/flag`, { isSuspicious }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      toast({ title: "Customer flag updated" });
    },
    onError: () => toast({ title: "Failed to update flag", variant: "destructive" }),
  });

  const customers = data?.customers || [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Customers</h2>
        <p className="text-xs text-gray-400">Search across all customers by name or phone number</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name, phone, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm border-gray-200"
        />
      </div>

      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">
            {isLoading ? "Loading…" : `${customers.length} customer${customers.length !== 1 ? "s" : ""}${debouncedQ ? ` matching "${debouncedQ}"` : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Searching...</div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">
              <Users className="h-8 w-8 mx-auto mb-3 text-gray-200" />
              <p>{debouncedQ ? "No customers found." : "Search to find customers."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-indigo-50">
                    {["Customer","Phone","Wholesaler","Orders","Type","Flags",""].map((h, i) => (
                      <TableHead key={i} className="text-xs font-semibold text-indigo-700">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map(c => (
                    <TableRow id={`record-customer-${c.id}`} key={c.id} className={`hover:bg-indigo-50/20 cursor-pointer ${c.isSuspicious ? "bg-red-50/30" : ""} ${highlightedId === c.id ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50/40" : ""}`} onClick={() => { setSelectedCustomer(c); setDrawerOpen(true); }}>
                      <TableCell>
                        <p className="text-xs font-medium text-gray-800">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.email || "—"}</p>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-gray-600">{c.phoneNumber || "—"}</TableCell>
                      <TableCell className="text-xs text-gray-600">{c.wholesalerName}</TableCell>
                      <TableCell className="text-xs text-right text-gray-600">{c.orderCount}</TableCell>
                      <TableCell>
                        {c.customerType ? (
                          <span className="text-xs px-2 py-0.5 rounded border" style={{ background: typeDot(c.customerType) + "22", color: typeColor(c.customerType), borderColor: typeDot(c.customerType) + "55" }}>
                            {typeLabel(c.customerType)}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {c.isTestAccount && <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-medium w-fit">Test</span>}
                          {c.isSuspicious && <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-1 w-fit"><Flag className="h-3 w-3" />Suspicious</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-400" onClick={e => { e.stopPropagation(); setSelectedCustomer(c); setDrawerOpen(true); }}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer detail drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-sm font-semibold flex items-center gap-2">
              {selectedCustomer?.name}
              {selectedCustomer?.isTestAccount && (
                <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-medium">Test</span>
              )}
            </SheetTitle>
          </SheetHeader>
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Wholesaler</p>
                  <p className="text-sm font-medium text-gray-800 mt-1">{selectedCustomer.wholesalerName}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Orders</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{selectedCustomer.orderCount}</p>
                </div>
                {selectedCustomer.phoneNumber && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Phone</p>
                    <p className="text-sm font-mono text-gray-800 mt-1">{selectedCustomer.phoneNumber}</p>
                  </div>
                )}
                {selectedCustomer.postalCode && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Postcode</p>
                    <p className="text-sm font-mono text-gray-800 mt-1">{selectedCustomer.postalCode}</p>
                  </div>
                )}
              </div>

              {/* Flag control */}
              <div className="border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-700">Flag as suspicious</p>
                  <p className="text-xs text-gray-400 mt-0.5">Marks this customer for review</p>
                </div>
                <Button size="sm" variant={selectedCustomer.isSuspicious ? "destructive" : "outline"} className="text-xs h-7 gap-1.5" disabled={flagMutation.isPending}
                  onClick={() => flagMutation.mutate({ id: selectedCustomer.id, isSuspicious: !selectedCustomer.isSuspicious })}>
                  <Flag className="h-3.5 w-3.5" />
                  {selectedCustomer.isSuspicious ? "Remove flag" : "Flag"}
                </Button>
              </div>

              {/* Order history */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-3">Order History</p>
                {ordersLoading ? <p className="text-xs text-gray-400">Loading...</p>
                  : customerOrders?.orders?.length === 0 ? <p className="text-xs text-gray-400">No orders yet.</p>
                  : (
                    <div className="space-y-2">
                      {(customerOrders?.orders ?? []).map(o => (
                        <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50">
                          <div>
                            <span className="font-mono text-gray-500">{o.orderNumber}</span>
                            <span className="text-gray-400 ml-2 text-xs">{o.wholesalerName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">{fmt(parseFloat(o.subtotal || "0"))}</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs border ${o.paymentStatus === "paid" ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-100 border-gray-200 text-gray-500"}`}>
                              {o.paymentStatus || "pending"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Orders Section ────────────────────────────────────────────────────────────
function OrdersSection({ revenueData, revenueLoading, wholesalers, isAdmin, highlightedId }: {
  revenueData: RevenueData | undefined; revenueLoading: boolean;
  wholesalers: WholesalerRow[]; isAdmin: boolean; highlightedId?: number;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [wholesalerFilter, setWholesalerFilter] = useState("");
  const [preset, setPreset] = useState<Preset>("all_time");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const dateRange = useMemo(() => {
    if (customFrom || customTo) return { from: customFrom || undefined, to: customTo || undefined };
    return presetToDates(preset) || {};
  }, [preset, customFrom, customTo]);

  const revenueParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dateRange.from) p.set("from", dateRange.from);
    if (dateRange.to) p.set("to", dateRange.to);
    if (wholesalerFilter) p.set("wholesalerId", wholesalerFilter);
    return p.toString();
  }, [dateRange, wholesalerFilter]);

  const { data: orderData, isLoading: ordersLoading } = useQuery<{ orders: RevenueOrder[]; totals: RevenueTotals }>({
    queryKey: ["/api/admin/revenue", revenueParams],
    queryFn: async () => {
      const url = `/api/admin/revenue${revenueParams ? `?${revenueParams}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      return r.json() as Promise<{ orders: RevenueOrder[]; totals: RevenueTotals }>;
    },
    enabled: isAdmin,
  });

  const resendInvoice = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/orders/${id}/resend-invoice`),
    onSuccess: () => toast({ title: "Invoice resent successfully" }),
    onError: () => toast({ title: "Failed to resend invoice", variant: "destructive" }),
  });

  const allOrders: RevenueOrder[] = orderData?.orders ?? [];

  // Scroll to and highlight order when navigated from global search
  useEffect(() => {
    if (!highlightedId || !allOrders.length) return;
    const idx = allOrders.findIndex(o => o.id === highlightedId);
    if (idx !== -1) {
      setSearch("");
      setStatusFilter("");
      // Navigate to the exact page that contains this record (after filters cleared)
      const targetPage = Math.ceil((idx + 1) / PAGE_SIZE);
      setPage(targetPage);
      setTimeout(() => {
        const el = document.getElementById(`record-order-${highlightedId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [highlightedId, allOrders.length]);

  const filtered = useMemo(() => {
    let list = allOrders;
    if (statusFilter) list = list.filter(o => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.orderNumber || "").toLowerCase().includes(q) ||
        (o.wholesalerName || "").toLowerCase().includes(q) ||
        (o.customerName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allOrders, statusFilter, search]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const uniqueStatuses = useMemo(() => Array.from(new Set(allOrders.map(o => o.status).filter(Boolean))), [allOrders]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">All Orders</h2>
        <p className="text-xs text-gray-400">Platform-wide order management</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => { setPreset(p.id); setCustomFrom(""); setCustomTo(""); setPage(1); }}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${preset === p.id && !customFrom && !customTo ? "text-white border-transparent" : "text-gray-500 border-gray-200 hover:border-gray-300 bg-white"}`}
                style={preset === p.id && !customFrom && !customTo ? { background: GREEN } : {}}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPreset("all_time"); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400" />
          <span className="text-xs text-gray-400">–</span>
          <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPreset("all_time"); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input placeholder="Search orders…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-8 h-7 text-xs border-gray-200" />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400 bg-white">
            <option value="">All statuses</option>
            {uniqueStatuses.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <select value={wholesalerFilter} onChange={e => { setWholesalerFilter(e.target.value); setPage(1); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400 bg-white">
            <option value="">All wholesalers</option>
            {wholesalers.map(w => <option key={w.id} value={w.id}>{w.businessName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`}</option>)}
          </select>
        </div>
      </div>

      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">
            {ordersLoading ? "Loading…" : `${filtered.length} order${filtered.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ordersLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">No orders found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-amber-50">
                      {["Order #","Wholesaler","Customer","GMV","Take Rate","Status","Payment","Date",""].map((h, i) => (
                        <TableHead key={i} className="text-xs font-semibold text-amber-700">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map(o => (
                      <TableRow id={`record-order-${o.id}`} key={o.id} className={`hover:bg-amber-50/30 ${highlightedId === o.id ? "ring-2 ring-inset ring-amber-400 bg-amber-50/40" : ""}`}>
                        <TableCell className="font-mono text-xs text-gray-500">{o.orderNumber}</TableCell>
                        <TableCell className="text-xs text-gray-700">{o.wholesalerName ?? "—"}</TableCell>
                        <TableCell className="text-xs text-gray-600">{o.customerName ?? "—"}</TableCell>
                        <TableCell className="text-xs text-right font-medium text-gray-700">{fmt(parseFloat(o.subtotal || "0"))}</TableCell>
                        <TableCell className="text-xs text-right font-medium text-indigo-600">{pct(o.totalQuikpikIncome, parseFloat(o.subtotal || "0"))}</TableCell>
                        <TableCell>
                          <span className="text-xs text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">{(o.status || "pending").replace(/_/g, " ")}</span>
                        </TableCell>
                        <TableCell>
                          {o.paymentStatus === "paid"
                            ? <span className="text-xs px-1.5 py-0.5 rounded border bg-[#f0faf4] border-[#bbdfc8]" style={{ color: GREEN }}>paid</span>
                            : <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">{o.paymentStatus || "pending"}</span>
                          }
                        </TableCell>
                        <TableCell className="text-xs text-gray-400">{o.createdAt ? format(new Date(o.createdAt), "dd MMM yy") : "—"}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-400 hover:text-blue-600" title="Resend invoice"
                            onClick={() => resendInvoice.mutate(String(o.id))} disabled={resendInvoice.isPending}>
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">Page {page} of {totalPages} ({filtered.length} orders)</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Products Oversight Section ─────────────────────────────────────────────────
function ProductsSection({ isAdmin, highlightedId }: { isAdmin: boolean; highlightedId?: number }) {
  const [sort, setSort] = useState("margin_asc");
  const [wholesalerFilter, setWholesalerFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery<{ products: ProductRow[] }>({
    queryKey: ["/api/admin/products", sort],
    queryFn: async () => {
      const r = await fetch(`/api/admin/products?sort=${sort}`, { credentials: "include" });
      return r.json() as Promise<{ products: ProductRow[] }>;
    },
    enabled: isAdmin,
  });

  const products: ProductRow[] = data?.products ?? [];

  // Scroll to and highlight product when navigated from global search
  useEffect(() => {
    if (!highlightedId || !products.length) return;
    const idx = products.findIndex(p => p.id === highlightedId);
    if (idx !== -1) {
      setWholesalerFilter("");
      setFlagFilter("");
      // Navigate to the exact page that contains this record (after filters cleared)
      const targetPage = Math.ceil((idx + 1) / PAGE_SIZE);
      setPage(targetPage);
      setTimeout(() => {
        const el = document.getElementById(`record-product-${highlightedId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [highlightedId, products.length]);

  const filtered = useMemo(() => {
    let list = products;
    if (wholesalerFilter) list = list.filter(p => p.wholesalerName === wholesalerFilter);
    if (flagFilter === "no_cost") list = list.filter(p => p.hasMissingCost);
    if (flagFilter === "low_margin") list = list.filter(p => p.hasLowMargin);
    if (flagFilter === "zero_stock") list = list.filter(p => p.hasZeroStock);
    return list;
  }, [products, wholesalerFilter, flagFilter]);

  useEffect(() => { setPage(1); }, [wholesalerFilter, flagFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const wholesalerNames = useMemo(() => Array.from(new Set(products.map(p => p.wholesalerName).filter((n): n is string => !!n))).sort(), [products]);

  const flagCounts = useMemo(() => ({
    noCost: products.filter(p => p.hasMissingCost).length,
    lowMargin: products.filter(p => p.hasLowMargin).length,
    zeroStock: products.filter(p => p.hasZeroStock).length,
  }), [products]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Products Oversight</h2>
        <p className="text-xs text-gray-400">Cross-wholesaler product health — missing costs, low margins, zero stock</p>
      </div>

      {/* Alert flags */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setFlagFilter(flagFilter === "no_cost" ? "" : "no_cost")}
          className={`rounded-xl border p-3 text-left transition-all ${flagFilter === "no_cost" ? "border-gray-400 bg-gray-100" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
          <p className="text-xs text-gray-500">Missing cost price</p>
          <p className="text-xl font-bold text-gray-700 mt-1">{flagCounts.noCost}</p>
        </button>
        <button onClick={() => setFlagFilter(flagFilter === "low_margin" ? "" : "low_margin")}
          className={`rounded-xl border p-3 text-left transition-all ${flagFilter === "low_margin" ? "border-red-400 bg-red-50" : "border-red-100 bg-red-50/50 hover:bg-red-50"}`}>
          <p className="text-xs text-red-600">Low margin (&lt;10%)</p>
          <p className="text-xl font-bold text-red-700 mt-1">{flagCounts.lowMargin}</p>
        </button>
        <button onClick={() => setFlagFilter(flagFilter === "zero_stock" ? "" : "zero_stock")}
          className={`rounded-xl border p-3 text-left transition-all ${flagFilter === "zero_stock" ? "border-amber-400 bg-amber-50" : "border-amber-100 bg-amber-50/50 hover:bg-amber-50"}`}>
          <p className="text-xs text-amber-600">Zero stock</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{flagCounts.zeroStock}</p>
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={sort} onChange={e => setSort(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white">
          <option value="margin_asc">Sort: Margin low → high</option>
          <option value="default">Sort: Newest first</option>
        </select>
        <select value={wholesalerFilter} onChange={e => setWholesalerFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white">
          <option value="">All wholesalers</option>
          {wholesalerNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        {flagFilter && <button onClick={() => setFlagFilter("")} className="text-xs text-gray-400 hover:text-gray-600 underline">Clear filter</button>}
      </div>

      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">{isLoading ? "Loading…" : `${filtered.length} product${filtered.length !== 1 ? "s" : ""}`}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-gray-400">Loading products...</div> : (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-slate-50">
                    {["Product","Wholesaler","Sale Price","Cost Price","Margin","Stock","Flags"].map((h, i) => (
                      <TableHead key={i} className="text-xs font-semibold text-slate-600">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(p => (
                    <TableRow id={`record-product-${p.id}`} key={p.id} className={`${p.hasMissingCost || p.hasLowMargin ? "bg-red-50/20" : ""} hover:bg-slate-50/50 ${highlightedId === p.id ? "ring-2 ring-inset ring-purple-400 bg-purple-50/30" : ""}`}>
                      <TableCell>
                        <p className="text-xs font-medium text-gray-800 max-w-[180px] truncate">{p.name}</p>
                        {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">{p.wholesalerName || "—"}</TableCell>
                      <TableCell className="text-xs font-medium text-gray-800">{p.price !== null ? fmt(p.price) : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {p.costPrice !== null ? (
                          <span className="font-medium text-gray-700">{fmt(p.costPrice)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.margin !== null ? (
                          <span className={`font-bold ${p.hasLowMargin ? "text-red-600" : p.margin < 20 ? "text-amber-600" : "text-green-700"}`}>
                            {p.margin.toFixed(1)}%
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={p.hasZeroStock ? "text-amber-600 font-medium" : "text-gray-600"}>{p.baseUnitStock ?? 0}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {p.hasMissingCost && <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded">No cost</span>}
                          {p.hasLowMargin && <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">Low margin</span>}
                          {p.hasZeroStock && <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">No stock</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-sm text-gray-400">No products match the current filters</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
                <span className="text-xs text-gray-400">Page {page} of {totalPages} ({filtered.length} products)</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Financials Section ─────────────────────────────────────────────────────────
function FinancialsSection({ wholesalers, isAdmin }: { wholesalers: WholesalerRow[]; isAdmin: boolean }) {
  const [preset, setPreset] = useState<Preset>("all_time");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [wholesalerFilter, setWholesalerFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const dateRange = useMemo(() => {
    if (customFrom || customTo) return { from: customFrom || undefined, to: customTo || undefined };
    return presetToDates(preset) ?? {};
  }, [preset, customFrom, customTo]);

  const revenueParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dateRange.from) p.set("from", dateRange.from);
    if (dateRange.to) p.set("to", dateRange.to);
    if (wholesalerFilter) p.set("wholesalerId", wholesalerFilter);
    return p.toString();
  }, [dateRange, wholesalerFilter]);

  const { data: revenueData, isLoading } = useQuery<RevenueData>({
    queryKey: ["/api/admin/revenue", revenueParams],
    queryFn: async () => {
      const url = `/api/admin/revenue${revenueParams ? `?${revenueParams}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      return r.json() as Promise<RevenueData>;
    },
    enabled: isAdmin,
  });

  const { data: payoutStatus } = useQuery<PayoutStatusData>({
    queryKey: ["/api/admin/payout-status"],
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const revenueOrders: RevenueOrder[] = revenueData?.orders ?? [];
  const revenueTotals: RevenueTotals = revenueData?.totals ?? { totalCustomerFees: 0, totalPlatformFees: 0, totalGrossRevenue: 0, totalGMV: 0 };

  const wholesalerRevenueSummary = useMemo(() => {
    const map: Record<string, WholesalerRevenueSummary> = {};
    for (const o of revenueOrders) {
      const key = o.wholesalerId ?? "unknown";
      if (!map[key]) map[key] = { name: o.wholesalerName ?? "Unknown", tier: "", orders: 0, gmv: 0, buyerFees: 0, merchantFees: 0, total: 0 };
      map[key].orders++;
      map[key].gmv += Number(o.subtotal || 0);
      map[key].buyerFees += Number(o.customerTransactionFee || 0);
      map[key].merchantFees += Number(o.platformFee || 0);
      map[key].total += Number(o.customerTransactionFee || 0) + Number(o.platformFee || 0);
    }
    for (const w of wholesalers) { if (map[w.id]) map[w.id].tier = w.subscriptionTier || "free"; }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [revenueOrders, wholesalers]);

  const paged = revenueOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(revenueOrders.length / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Financials</h2>
        <p className="text-xs text-gray-400">Revenue breakdown across all wholesalers</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => { setPreset(p.id); setCustomFrom(""); setCustomTo(""); setPage(1); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${preset === p.id && !customFrom && !customTo ? "text-white border-transparent" : "text-gray-500 border-gray-200 hover:border-gray-300 bg-white"}`}
              style={preset === p.id && !customFrom && !customTo ? { background: GREEN } : {}}>
              {p.label}
            </button>
          ))}
          <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPreset("all_time"); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none" />
          <span className="text-xs text-gray-400">–</span>
          <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPreset("all_time"); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none" />
          <select value={wholesalerFilter} onChange={e => { setWholesalerFilter(e.target.value); setPage(1); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none bg-white">
            <option value="">All wholesalers</option>
            {wholesalers.map(w => <option key={w.id} value={w.id}>{w.businessName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`}</option>)}
          </select>
        </div>
      </div>

      {/* Stripe payout status card */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <CreditCard className="h-4 w-4 text-gray-400" />Stripe Platform Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Available (GBP)</p>
              <p className="text-xl font-bold text-gray-900">{payoutStatus ? fmt(payoutStatus.available) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Pending</p>
              <p className="text-xl font-bold text-gray-700">{payoutStatus ? fmt(payoutStatus.pending) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Last Payout</p>
              {payoutStatus?.lastPayout ? (
                <div>
                  <p className="text-sm font-bold text-gray-700">{fmt(payoutStatus.lastPayout.amount)}</p>
                  <p className="text-xs text-gray-400 capitalize">{payoutStatus.lastPayout.status} · {new Date(payoutStatus.lastPayout.arrivalDate).toLocaleDateString("en-GB")}</p>
                </div>
              ) : <p className="text-sm text-gray-400">No payouts yet</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Buyer Fees"    value={isLoading ? "…" : fmt(revenueTotals.totalCustomerFees)}  sub="5.5% + £0.50 per order" icon={<TrendingUp className="h-4 w-4" />} color={BLUE} />
        <StatCard label="Merchant Fees" value={isLoading ? "…" : fmt(revenueTotals.totalPlatformFees)}  sub="4.6% per order"         icon={<TrendingUp className="h-4 w-4" />} color={AMBER} />
        <StatCard label="Order Revenue" value={isLoading ? "…" : fmt(revenueTotals.totalGrossRevenue)}  sub="Buyer + merchant fees"  icon={<TrendingUp className="h-4 w-4" />} color={GREEN} />
        <StatCard label="Period GMV"    value={isLoading ? "…" : fmt(revenueTotals.totalGMV)}           sub="Gross merchandise value" icon={<DollarSign className="h-4 w-4" />} color={PURPLE} />
      </div>

      {/* Take rate */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardContent className="px-4 py-3 flex flex-wrap gap-6">
          <div><p className="text-xs text-gray-400">Overall Take Rate</p><p className="text-sm font-bold text-indigo-600">{pct(revenueTotals.totalGrossRevenue || 0, revenueTotals.totalGMV || 0)}</p></div>
          <div><p className="text-xs text-gray-400">Orders in period</p><p className="text-sm font-bold text-gray-800">{revenueOrders.length.toLocaleString()}</p></div>
          <div><p className="text-xs text-gray-400">Avg. order value</p><p className="text-sm font-bold text-gray-800">{revenueOrders.length > 0 ? fmt((revenueTotals.totalGMV || 0) / revenueOrders.length) : "—"}</p></div>
        </CardContent>
      </Card>

      {/* By wholesaler */}
      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">Fees by Wholesaler</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-blue-50">
                  {["Wholesaler","Plan","Orders","GMV","Buyer Fees","Merchant Fees","Total Earned","Take Rate"].map((h, i) => (
                    <TableHead key={i} className="text-xs font-semibold text-blue-700">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {wholesalerRevenueSummary.map((w, i) => (
                  <TableRow key={i} className="hover:bg-blue-50/30">
                    <TableCell className="text-xs font-medium text-gray-800">{w.name}</TableCell>
                    <TableCell>{planBadge(w.tier)}</TableCell>
                    <TableCell className="text-xs text-right text-gray-600">{w.orders}</TableCell>
                    <TableCell className="text-xs text-right text-gray-600">{fmt(w.gmv)}</TableCell>
                    <TableCell className="text-xs text-right font-medium" style={{ color: BLUE }}>{fmt(w.buyerFees)}</TableCell>
                    <TableCell className="text-xs text-right font-medium" style={{ color: AMBER }}>{fmt(w.merchantFees)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(w.total)}</TableCell>
                    <TableCell className="text-xs text-right font-medium text-indigo-600">{pct(w.total, w.gmv)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Per-order breakdown */}
      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">Per-Order Breakdown ({revenueOrders.length} orders)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-sm text-gray-400">Loading...</div> : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-blue-50">
                      {["Order #","Wholesaler","Customer","GMV","Buyer Fee","Merchant Fee","Total","Take Rate","Date"].map((h, i) => (
                        <TableHead key={i} className="text-xs font-semibold text-blue-700">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map(o => (
                      <TableRow key={o.id} className="hover:bg-blue-50/30">
                        <TableCell className="font-mono text-xs text-gray-500">{o.orderNumber}</TableCell>
                        <TableCell className="text-xs text-gray-700">{o.wholesalerName ?? "—"}</TableCell>
                        <TableCell className="text-xs text-gray-600">{o.customerName ?? "—"}</TableCell>
                        <TableCell className="text-xs text-right text-gray-600">{fmt(parseFloat(o.subtotal || "0"))}</TableCell>
                        <TableCell className="text-xs text-right font-medium" style={{ color: BLUE }}>{fmt(parseFloat(o.customerTransactionFee || "0"))}</TableCell>
                        <TableCell className="text-xs text-right font-medium" style={{ color: AMBER }}>{fmt(parseFloat(o.platformFee || "0"))}</TableCell>
                        <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(o.totalQuikpikIncome)}</TableCell>
                        <TableCell className="text-xs text-right font-medium text-indigo-600">{pct(o.totalQuikpikIncome, parseFloat(o.subtotal || "0"))}</TableCell>
                        <TableCell className="text-xs text-gray-400">{o.createdAt ? format(new Date(o.createdAt), "dd MMM yy") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">Page {page} of {totalPages} ({revenueOrders.length} orders)</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── System Settings Section ────────────────────────────────────────────────────
function SystemSettingsSection({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stripeSubId, setStripeSubId] = useState("");
  const [planOverride, setPlanOverride] = useState("");
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetResult, setResetResult] = useState<{ deleted: Record<string, number>; totalDeleted: number } | null>(null);

  const { data: stripeMode } = useQuery<StripeModeData>({
    queryKey: ["/api/admin/stripe-mode"],
    enabled: isAdmin,
    staleTime: 10 * 60 * 1000,
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

  const previewQuery = useQuery<{ preview: Record<string, number>; totalRows: number }>({
    queryKey: ["/api/admin/go-live-reset/preview"],
    enabled: resetModalOpen && isAdmin,
    staleTime: 0,
    gcTime: 0,
  });

  const goLiveReset = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/go-live-reset", { confirm: "RESET", deleteProducts: true });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Reset failed"); }
      return res.json() as Promise<{ deleted: Record<string, number>; totalDeleted: number }>;
    },
    onSuccess: (data) => {
      setResetResult(data);
      setResetConfirmText("");
      setResetModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
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

      {/* Fee configuration (read-only) */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            Platform Fee Configuration
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">read-only</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Merchant (Platform) Fee</p>
              <p className="text-2xl font-bold text-gray-800">4.6<span className="text-base font-normal">%</span></p>
              <p className="text-xs text-gray-400 mt-1">Charged to wholesaler per order</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Customer Transaction Fee</p>
              <p className="text-2xl font-bold text-gray-800">5.5<span className="text-base font-normal">% + £0.50</span></p>
              <p className="text-xs text-gray-400 mt-1">Charged to buyer per order</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">To change fee configuration, update the server-side constants and redeploy.</p>
        </CardContent>
      </Card>

      {/* Subscription plans */}
      <Card className="border-gray-200 shadow-none rounded-xl">
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold text-gray-700">Subscription Plans</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-gray-500">Free</p>
              <p className="text-xl font-bold text-gray-700 mt-1">£0</p>
              <p className="text-xs text-gray-400 mt-1">10 products</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-blue-600">Standard</p>
              <p className="text-xl font-bold text-blue-700 mt-1">£19.99<span className="text-sm font-normal">/mo</span></p>
              <p className="text-xs text-blue-500 mt-1">50 products</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
              <p className="text-xs font-medium" style={{ color: GREEN }}>Premium</p>
              <p className="text-xl font-bold mt-1" style={{ color: GREEN }}>£39.99<span className="text-sm font-normal">/mo</span></p>
              <p className="text-xs mt-1" style={{ color: GREEN }}>Unlimited products</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription activation utility */}
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
            {/* Live preview counts */}
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
                    {Object.entries(previewQuery.data.preview)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center bg-white border border-red-100 rounded px-2 py-1">
                          <span className="text-xs text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <span className="text-xs font-bold text-red-700">{v.toLocaleString()}</span>
                        </div>
                      ))}
                  </div>
                  <div className="flex justify-between items-center border-t border-red-200 pt-2 mt-1">
                    <span className="text-xs font-semibold text-red-800">Total rows</span>
                    <span className="text-sm font-bold text-red-700">{previewQuery.data.totalRows.toLocaleString()}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-red-500">Could not load preview</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-700 font-semibold">Type <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-red-700">RESET</span> to confirm</Label>
              <Input
                value={resetConfirmText}
                onChange={e => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="h-8 text-xs font-mono border-red-200 focus:border-red-400"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => { setResetConfirmText(""); setResetModalOpen(false); }}>Cancel</Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white text-xs gap-1.5"
              disabled={resetConfirmText !== "RESET" || goLiveReset.isPending || previewQuery.isLoading}
              onClick={() => goLiveReset.mutate()}
            >
              {goLiveReset.isPending ? "Resetting…" : "Reset platform"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Customer Map Section ───────────────────────────────────────────────────────
function FlaggedCustomersTable({ customers, onFix, fixing }: { customers: MapCustomer[]; onFix: (id: string, postalCode: string) => void; fixing: boolean }) {
  const flagged = customers.filter(c => c.geocodeStatus === "flagged");
  const [edits, setEdits] = useState<Record<string, string>>({});
  if (flagged.length === 0) return null;

  return (
    <Card className="border-red-100 shadow-none rounded-xl">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />{flagged.length} customer{flagged.length !== 1 ? "s" : ""} with invalid postcode
        </CardTitle>
        <p className="text-xs text-red-500 mt-0.5">These customers could not be located. Correct their postcode and save to place them on the map.</p>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow className="border-red-100 hover:bg-transparent">
              <TableHead className="text-xs px-4">Customer</TableHead>
              <TableHead className="text-xs px-4">Wholesaler</TableHead>
              <TableHead className="text-xs px-4">Current postcode</TableHead>
              <TableHead className="text-xs px-4">Corrected postcode</TableHead>
              <TableHead className="text-xs px-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {flagged.map(c => (
              <TableRow key={c.id} className="border-red-50 hover:bg-red-50/30">
                <TableCell className="text-xs px-4 font-medium">{c.name}</TableCell>
                <TableCell className="text-xs px-4 text-gray-500">{c.wholesalerName}</TableCell>
                <TableCell className="text-xs px-4 text-red-600 font-mono">{c.postalCode || "—"}</TableCell>
                <TableCell className="text-xs px-4">
                  <Input
                    className="h-7 text-xs font-mono border-red-200 w-28"
                    placeholder="e.g. SW1A 1AA"
                    value={edits[c.id] ?? ""}
                    onChange={e => setEdits(prev => ({ ...prev, [c.id]: e.target.value.toUpperCase() }))}
                  />
                </TableCell>
                <TableCell className="text-xs px-4">
                  <Button size="sm" className="h-7 text-xs text-white" style={{ background: GREEN }} disabled={fixing || !edits[c.id]?.trim()}
                    onClick={() => { if (edits[c.id]?.trim()) onFix(c.id, edits[c.id].trim()); }}>
                    Save & re-locate
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CustomerMapSection({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const autoGeocodeTriggered = useRef(false);

  const { data: mapData, isLoading } = useQuery<{ customers: MapCustomer[] }>({
    queryKey: ["/api/admin/customers/map"],
    enabled: isAdmin,
  });

  const geocodeAll = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/customers/geocode-all");
      return res.json() as Promise<{ processed: number; success: number; flagged: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers/map"] });
      toast({ title: `Geocoded ${data?.processed ?? 0} customers (${data?.success ?? 0} located, ${data?.flagged ?? 0} flagged)` });
    },
    onError: () => toast({ title: "Geocoding failed", variant: "destructive" }),
  });

  const updateCustomer = useMutation({
    mutationFn: ({ id, customerType, postalCode }: { id: string; customerType: string; postalCode?: string }) =>
      apiRequest("PATCH", `/api/admin/customers/${id}/type`, { customerType, ...(postalCode !== undefined ? { postalCode } : {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers/map"] });
      toast({ title: "Customer updated" });
    },
    onError: () => toast({ title: "Failed to update customer", variant: "destructive" }),
  });

  const customers: MapCustomer[] = mapData?.customers || [];
  const geocoded = customers.filter(c => c.geocodeStatus === "success" && c.latitude != null && c.longitude != null);
  const pending = customers.filter(c => !c.geocodeStatus && !c.latitude);

  useEffect(() => {
    if (!isLoading && pending.length > 0 && !autoGeocodeTriggered.current && !geocodeAll.isPending) {
      autoGeocodeTriggered.current = true;
      geocodeAll.mutate();
    }
  }, [isLoading, pending.length]);

  const filtered = useMemo(() => {
    let list = geocoded;
    if (typeFilter) list = list.filter(c => (c.customerType || "unknown") === typeFilter);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      list = list.filter(c => (c.name || "").toLowerCase().includes(q) || (c.postalCode || "").toLowerCase().includes(q) || (c.wholesalerName || "").toLowerCase().includes(q));
    }
    return list;
  }, [geocoded, typeFilter, searchQ]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { retail: 0, wholesale: 0, individual: 0, unknown: 0 };
    for (const c of customers) {
      const t = c.customerType || "unknown";
      if (t in counts) counts[t]++;
      else counts.unknown++;
    }
    return counts;
  }, [customers]);

  const ukCenter: [number, number] = [52.8, -1.8];
  if (isLoading) return <div className="p-12 text-center text-sm text-gray-400">Loading customer map…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Customer Map</h2>
        <p className="text-xs text-gray-400">Geographic view of customers across all wholesalers</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["retail", "wholesale", "individual", "unknown"] as const).map(t => {
          const cfg = TYPE_CONFIG[t];
          const active = typeFilter === t;
          return (
            <div key={t} className="bg-white rounded-xl border p-3 flex items-center gap-3 cursor-pointer hover:shadow-sm transition-shadow"
              style={{ borderColor: active ? cfg.dot : "#e5e7eb", boxShadow: active ? `0 0 0 2px ${cfg.dot}33` : undefined }}
              onClick={() => setTypeFilter(active ? "" : t)}>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: cfg.color }}>{typeCounts[t]}</p>
                <p className="text-xs text-gray-400">{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input placeholder="Search name, postcode, wholesaler…" value={searchQ} onChange={e => setSearchQ(e.target.value)} className="pl-8 h-8 text-xs border-gray-200" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-8 text-gray-600 focus:outline-none bg-white">
          <option value="">All types</option>
          <option value="retail">Retailer</option>
          <option value="wholesale">Wholesaler</option>
          <option value="individual">Individual</option>
          <option value="unknown">Unknown</option>
        </select>
        <Button size="sm" variant="outline" className="h-8 text-xs border-gray-200 gap-1.5" onClick={() => geocodeAll.mutate()} disabled={geocodeAll.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 ${geocodeAll.isPending ? "animate-spin" : ""}`} />
          Re-geocode ({pending.length} remaining)
        </Button>
      </div>
      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100 flex-row items-center justify-between gap-2 flex flex-wrap">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="h-4 w-4" style={{ color: GREEN }} />Customer Map ({filtered.length} shown)
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            {(["retail", "wholesale", "individual", "unknown"] as const).map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TYPE_CONFIG[t].dot }} />
                <span className="text-xs text-gray-500">{TYPE_CONFIG[t].label}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div style={{ height: 440 }}>
            <MapContainer center={ukCenter} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {filtered.map((c) => (
                <Marker key={c.id} position={[c.latitude as number, c.longitude as number]} icon={makeIcon(c.customerType)}>
                  <Popup>
                    <MarkerPopupContent customer={c} onSave={(id, customerType) => updateCustomer.mutate({ id, customerType })} saving={updateCustomer.isPending} />
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Flagged customers — postcode remediation */}
      <FlaggedCustomersTable customers={customers} onFix={(id, postalCode) => updateCustomer.mutate({ id, customerType: customers.find(c => c.id === id)?.customerType || "", postalCode })} fixing={updateCustomer.isPending} />
    </div>
  );
}

// ── Quick Actions modal ────────────────────────────────────────────────────────
interface RefundResult { success: boolean; totalRefunded?: number; remaining?: number; error?: string; }

function QuickActionsModal({ open, onOpenChange, wholesalers }: {
  open: boolean; onOpenChange: (v: boolean) => void; wholesalers: WholesalerRow[];
}) {
  const [mode, setMode] = useState<"refund" | "contact">("refund");
  const [refundWholesaler, setRefundWholesaler] = useState<WholesalerRow | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundResult, setRefundResult] = useState<RefundResult | null>(null);
  const [contactWholesaler, setContactWholesaler] = useState<WholesalerRow | null>(null);
  const { toast } = useToast();

  const { data: wholesalerOrdersData, isLoading: ordersLoading } = useQuery<{ orders: WholesalerOrderRow[] }>({
    queryKey: ["/api/admin/wholesalers", refundWholesaler?.id, "orders"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/wholesalers/${refundWholesaler!.id}/orders`, { credentials: "include" });
      return r.json() as Promise<{ orders: WholesalerOrderRow[] }>;
    },
    enabled: !!refundWholesaler,
  });
  const wholesalerOrders = wholesalerOrdersData?.orders ?? [];
  const selectedOrder = wholesalerOrders.find(o => String(o.id) === selectedOrderId) ?? null;

  const issueRefund = useMutation({
    mutationFn: async () => {
      const body: Record<string, number> = {};
      if (refundAmount) body.amountPounds = parseFloat(refundAmount);
      const res = await apiRequest("POST", `/api/admin/orders/${selectedOrderId}/issue-refund`, body);
      return res.json() as Promise<RefundResult>;
    },
    onSuccess: (data: RefundResult) => {
      setRefundResult(data);
      if (data?.success) toast({ title: `Refund of £${data.totalRefunded?.toFixed(2)} processed` });
      else toast({ title: data?.error ?? "Refund failed", variant: "destructive" });
    },
    onError: () => toast({ title: "Refund failed", variant: "destructive" }),
  });

  const handleClose = (v: boolean) => {
    if (!v) {
      setRefundWholesaler(null); setSelectedOrderId(""); setRefundAmount("");
      setRefundResult(null); setContactWholesaler(null);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm font-semibold">Quick Actions</DialogTitle></DialogHeader>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode("refund")} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${mode === "refund" ? "border-transparent text-white" : "border-gray-200 text-gray-500 bg-white"}`} style={mode === "refund" ? { background: GREEN } : {}}>Issue Refund</button>
          <button onClick={() => setMode("contact")} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${mode === "contact" ? "border-transparent text-white" : "border-gray-200 text-gray-500 bg-white"}`} style={mode === "contact" ? { background: BLUE } : {}}>Contact Wholesaler</button>
        </div>
        {mode === "refund" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-600">Step 1 — Select wholesaler</Label>
              <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white mt-1"
                value={refundWholesaler?.id ?? ""}
                onChange={e => { setRefundWholesaler(wholesalers.find(w => w.id === e.target.value) ?? null); setSelectedOrderId(""); setRefundResult(null); }}>
                <option value="">Select wholesaler…</option>
                {wholesalers.map(w => <option key={w.id} value={w.id}>{w.businessName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`}</option>)}
              </select>
            </div>
            {refundWholesaler && (
              <div>
                <Label className="text-xs text-gray-600">Step 2 — Pick an order</Label>
                <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white mt-1"
                  value={selectedOrderId}
                  onChange={e => { setSelectedOrderId(e.target.value); setRefundResult(null); }}
                  disabled={ordersLoading}>
                  <option value="">{ordersLoading ? "Loading orders…" : "Select order…"}</option>
                  {wholesalerOrders.filter(o => o.paymentStatus === "paid" && o.status !== "refunded").map(o => (
                    <option key={o.id} value={String(o.id)}>#{o.orderNumber} — {o.customerName ?? "Customer"} — £{parseFloat(o.subtotal).toFixed(2)} ({o.status})</option>
                  ))}
                </select>
                {wholesalerOrders.length === 0 && !ordersLoading && (
                  <p className="text-xs text-gray-400 mt-1">No refundable orders found for this wholesaler.</p>
                )}
              </div>
            )}
            {selectedOrder && (
              <div>
                <Label className="text-xs text-gray-600">Step 3 — Amount (£) — blank = full refund of £{parseFloat(selectedOrder.subtotal).toFixed(2)}</Label>
                <Input className="text-xs h-8 mt-1 border-gray-200" type="number" step="0.01" min="0.01"
                  max={parseFloat(selectedOrder.subtotal)}
                  value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder={`e.g. ${parseFloat(selectedOrder.subtotal).toFixed(2)}`} />
              </div>
            )}
            {refundResult?.success && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <p className="text-xs text-green-700 font-medium">Refund processed: £{refundResult.totalRefunded?.toFixed(2)}</p>
                {(refundResult.remaining ?? 0) > 0 && <p className="text-xs text-green-600">£{refundResult.remaining?.toFixed(2)} could not be refunded (check Stripe dashboard)</p>}
              </div>
            )}
            <Button size="sm" className="w-full text-xs text-white h-8" style={{ background: GREEN }}
              disabled={!selectedOrderId || issueRefund.isPending}
              onClick={() => issueRefund.mutate()}>
              {issueRefund.isPending ? "Processing…" : "Issue Refund"}
            </Button>
          </div>
        )}
        {mode === "contact" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Select a wholesaler to open a pre-filled email.</p>
            <select className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 h-8 text-gray-600 focus:outline-none bg-white" onChange={e => setContactWholesaler(wholesalers.find(w => w.id === e.target.value) ?? null)}>
              <option value="">Select wholesaler…</option>
              {wholesalers.map(w => <option key={w.id} value={w.id}>{w.businessName ?? `${w.firstName ?? ""} ${w.lastName ?? ""}`}</option>)}
            </select>
            {contactWholesaler && (
              <a href={`mailto:${contactWholesaler.email}?subject=Re: Your Quikpik account&body=Hi ${contactWholesaler.firstName},`}>
                <Button size="sm" className="w-full text-xs text-white h-8" style={{ background: BLUE }}>
                  <Mail className="h-3.5 w-3.5 mr-1.5" />Open email to {contactWholesaler.email}
                </Button>
              </a>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Support & Logs Section ────────────────────────────────────────────────────
interface ActivityEvent {
  timestamp: string; type: string; description: string; wholesalerName: string; actorName: string;
}
interface ErrorEntry {
  id: string; errorType: string; message: string; severity: string;
  wholesalerName: string | null; timestamp: string; source: string;
}

const PAGE_SIZE = 25;

function SupportLogsSection({ isAdmin, wholesalers }: { isAdmin: boolean; wholesalers: WholesalerRow[] }) {
  const [tab, setTab] = useState<"activity" | "errors">("activity");
  const [wholesalerFilter, setWholesalerFilter] = useState<string>("");
  const [activityLimit, setActivityLimit] = useState(PAGE_SIZE);
  const [errorsLimit, setErrorsLimit] = useState(PAGE_SIZE);

  const activityUrl = `/api/admin/activity?limit=${activityLimit}${wholesalerFilter ? `&wholesalerId=${wholesalerFilter}` : ""}`;
  const errorsUrl = `/api/admin/errors?limit=${errorsLimit}`;

  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity } = useQuery<{ events: ActivityEvent[]; total: number }>({
    queryKey: ["/api/admin/activity", activityLimit, wholesalerFilter],
    queryFn: async () => {
      const r = await fetch(activityUrl, { credentials: "include" });
      return r.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const { data: errorsData, isLoading: errorsLoading, refetch: refetchErrors } = useQuery<{ errors: ErrorEntry[]; total: number }>({
    queryKey: ["/api/admin/errors", errorsLimit],
    queryFn: async () => {
      const r = await fetch(errorsUrl, { credentials: "include" });
      return r.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const severityBadge = (s: string) => {
    if (s === "critical") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Critical</span>;
    if (s === "error") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Error</span>;
    if (s === "warning") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Warning</span>;
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Info</span>;
  };

  const typeIcon = (type: string) => {
    if (type === "payment_failure") return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    if (type === "subscription_event") return <CreditCard className="h-3.5 w-3.5 text-blue-400" />;
    if (type === "order") return <ShoppingCart className="h-3.5 w-3.5 text-amber-400" />;
    if (type === "stock_movement") return <Package className="h-3.5 w-3.5 text-green-500" />;
    return <Zap className="h-3.5 w-3.5 text-indigo-500" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Support & Logs</h2>
          <p className="text-xs text-gray-400">Platform activity feed and error log</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs border-gray-200 gap-1.5" onClick={() => tab === "activity" ? refetchActivity() : refetchErrors()}>
          <RefreshCw className="h-3.5 w-3.5" />Refresh
        </Button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab("activity")} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${tab === "activity" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Activity Feed</span>
        </button>
        <button onClick={() => setTab("errors")} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${tab === "errors" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <span className="flex items-center gap-1.5"><Terminal className="h-3.5 w-3.5" />Error Log</span>
        </button>
      </div>

      {tab === "activity" && (
        <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
          <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-semibold text-gray-700">
                Platform Activity
                <span className="ml-2 text-xs font-normal text-gray-400">{activityData?.total ?? 0} total</span>
              </CardTitle>
              <select
                value={wholesalerFilter}
                onChange={e => { setWholesalerFilter(e.target.value); setActivityLimit(PAGE_SIZE); }}
                className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
              >
                <option value="">All wholesalers</option>
                {wholesalers.map(w => (
                  <option key={w.id} value={w.id}>{w.businessName || `${w.firstName || ""} ${w.lastName || ""}`.trim() || w.email}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {activityLoading ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading activity...</div>
            ) : !activityData?.events?.length ? (
              <div className="p-8 text-center">
                <Activity className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No activity recorded yet</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {activityData.events.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50">
                      <div className="w-7 h-7 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        {typeIcon(item.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800">{item.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.wholesalerName} · {item.actorName}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                        {format(new Date(item.timestamp), "dd MMM, HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
                {activityData.events.length < activityData.total && (
                  <div className="px-4 py-3 border-t border-gray-50 flex justify-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-gray-500 h-7"
                      onClick={() => setActivityLimit(prev => prev + PAGE_SIZE)}
                    >
                      Load more ({activityData.total - activityData.events.length} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "errors" && (
        <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
          <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">
              Error Log
              <span className="ml-2 text-xs font-normal text-gray-400">{errorsData?.total ?? 0} total</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {errorsLoading ? (
              <div className="p-8 text-center text-sm text-gray-400">Loading errors...</div>
            ) : !errorsData?.errors?.length ? (
              <div className="p-8 text-center">
                <CheckCircle className="h-8 w-8 text-green-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No errors recorded — all clear</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {errorsData.errors.map(item => (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50">
                      <div className="w-7 h-7 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-medium text-gray-800 truncate">{item.errorType.replace(/_/g, " ")}</p>
                          {severityBadge(item.severity)}
                          <span className="text-xs text-gray-300">{item.source}</span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">{item.message}</p>
                        {item.wholesalerName && <p className="text-xs text-gray-400 mt-0.5">{item.wholesalerName}</p>}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                        {format(new Date(item.timestamp), "dd MMM, HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
                {errorsData.errors.length < errorsData.total && (
                  <div className="px-4 py-3 border-t border-gray-50 flex justify-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-gray-500 h-7"
                      onClick={() => setErrorsLimit(prev => prev + PAGE_SIZE)}
                    >
                      Load more ({errorsData.total - errorsData.errors.length} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Global Search Bar ─────────────────────────────────────────────────────────
interface SearchResult {
  type: "wholesaler" | "customer" | "order" | "product";
  id: string | number; label: string; sub: string; section: SectionId;
}

interface RawSearchResponse {
  orders: Array<{ id: number; orderNumber: string | null; customerName: string | null; wholesalerName: string | null; status: string | null }>;
  customers: Array<{ id: string; name: string; phoneNumber: string | null; email: string | null; wholesalerName: string }>;
  products: Array<{ id: number; name: string | null; category: string | null; wholesalerName: string | null; status: string | null; price: number }>;
}

interface SearchGroup {
  label: string;
  section: SectionId;
  icon: JSX.Element;
  items: SearchResult[];
}

function buildSearchGroups(raw: RawSearchResponse): SearchGroup[] {
  const groups: SearchGroup[] = [];
  if (raw.orders?.length) {
    groups.push({
      label: "Orders",
      section: "orders",
      icon: <ShoppingCart className="h-3.5 w-3.5 text-amber-500" />,
      items: raw.orders.map(o => ({
        type: "order" as const,
        id: o.id,
        label: o.orderNumber || `Order #${o.id}`,
        sub: `${o.customerName || "Unknown"} · ${o.wholesalerName || ""}`,
        section: "orders" as SectionId,
      })),
    });
  }
  if (raw.customers?.length) {
    groups.push({
      label: "Customers",
      section: "customers",
      icon: <Users className="h-3.5 w-3.5 text-green-500" />,
      items: raw.customers.map(c => ({
        type: "customer" as const,
        id: c.id,
        label: c.name,
        sub: `${c.phoneNumber || c.email || ""} · ${c.wholesalerName}`,
        section: "customers" as SectionId,
      })),
    });
  }
  if (raw.products?.length) {
    groups.push({
      label: "Products",
      section: "products",
      icon: <Package className="h-3.5 w-3.5 text-purple-500" />,
      items: raw.products.map(p => ({
        type: "product" as const,
        id: p.id,
        label: p.name || "Product",
        sub: `${p.category || ""} · ${p.wholesalerName || ""}`,
        section: "products" as SectionId,
      })),
    });
  }
  return groups;
}

function GlobalSearchBar({ onNavigate }: { onNavigate: (section: SectionId, id?: string | number) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const openSearch = () => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); };
  const closeSearch = () => { setOpen(false); setQuery(""); };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = ["INPUT", "TEXTAREA"].includes(tag) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "/" && !isEditable) || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
        e.preventDefault();
        openSearch();
      }
      if (e.key === "Escape") closeSearch();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { data: rawResults, isLoading } = useQuery<RawSearchResponse>({
    queryKey: ["/api/admin/search", debouncedQ],
    queryFn: async () => {
      if (!debouncedQ.trim()) return { orders: [], customers: [], products: [] };
      const r = await fetch(`/api/admin/search?q=${encodeURIComponent(debouncedQ)}`, { credentials: "include" });
      return r.json();
    },
    enabled: open && !!debouncedQ.trim(),
  });

  const groups = rawResults ? buildSearchGroups(rawResults) : [];
  const totalResults = groups.reduce((n, g) => n + g.items.length, 0);

  if (!open) {
    return (
      <button onClick={openSearch}
        className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-400 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors min-w-[140px] max-w-[200px]">
        <Search className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">Search</span>
        <span className="ml-auto text-gray-300 font-mono text-xs leading-none px-1 py-0.5 bg-white border border-gray-200 rounded">/</span>
      </button>
    );
  }

  return (
    <div className="relative flex-1 max-w-sm">
      <div className="flex items-center border border-gray-300 rounded-lg bg-white shadow-sm overflow-hidden px-2.5">
        <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onBlur={() => { if (!query) setOpen(false); }}
          placeholder="Search orders, customers, products…"
          className="flex-1 px-2 py-2 text-xs bg-transparent outline-none text-gray-900 placeholder:text-gray-400 min-w-0"
          autoFocus
        />
        <button onClick={closeSearch} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
      </div>
      {open && (query || isLoading) && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-3 text-xs text-gray-400">Searching…</div>
          ) : totalResults === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-400">No results for "{query}"</div>
          ) : (
            <div>
              {groups.map(group => (
                <div key={group.section}>
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-0">
                    {group.icon}
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group.label}</span>
                    <span className="ml-auto text-xs text-gray-400">{group.items.length}</span>
                  </div>
                  {group.items.map((r, i) => (
                    <button
                      key={i}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors border-b border-gray-50 last:border-0"
                      onClick={() => { onNavigate(r.section, r.id); closeSearch(); }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{r.label}</p>
                        <p className="text-xs text-gray-400 truncate">{r.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [highlightedRecord, setHighlightedRecord] = useState<{ section: SectionId; id: string | number } | null>(null);

  const handleNavigate = useCallback((section: SectionId, id?: string | number) => {
    setActiveSection(section);
    setHighlightedRecord(id !== undefined ? { section, id } : null);
  }, []);

  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email || "");

  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/platform-stats"], enabled: isAdmin,
  });
  const { data: wholesalers = [], isLoading: wholesalersLoading } = useQuery<WholesalerRow[]>({
    queryKey: ["/api/admin/wholesalers"], enabled: isAdmin,
  });
  const { data: revenueData, isLoading: revenueLoading } = useQuery<RevenueData>({
    queryKey: ["/api/admin/revenue", ""],
    queryFn: async () => {
      const r = await fetch("/api/admin/revenue", { credentials: "include" });
      return r.json() as Promise<RevenueData>;
    },
    enabled: isAdmin,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <AdminLogin />;
  if (!isAdmin) return <AccessDenied email={user?.email || ""} onSignOut={logout} />;

  const initials = `${user?.firstName?.charAt(0) || ""}${user?.lastName?.charAt(0) || ""}`.toUpperCase() || "A";
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Admin";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-gray-900 flex flex-col shadow-xl transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        {/* Logo area */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-gray-700/60 flex-shrink-0">
          <Shield className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Control Centre</p>
            <p className="text-xs text-gray-400 leading-tight">Quikpik Admin</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto p-1 text-gray-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-2 space-y-0.5">
            {SECTIONS.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button key={section.id} onClick={() => { setActiveSection(section.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${isActive ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20" : "text-gray-400 hover:text-gray-100 hover:bg-gray-800/70"}`}>
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-emerald-400" : "text-gray-500"}`} />
                  <span className="truncate">{section.label}</span>
                  {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </nav>

        {/* User + logout */}
        <div className="flex-shrink-0 border-t border-gray-700/60 p-3 space-y-2">
          <div className="flex items-center gap-2 px-1">
            <div className="w-7 h-7 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-emerald-400">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{displayName}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => logout()} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut className="h-3.5 w-3.5" />Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-56 min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-3 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0 hidden sm:block">
            <h1 className="text-sm font-semibold text-gray-900 truncate">
              {SECTIONS.find(s => s.id === activeSection)?.label}
            </h1>
          </div>
          <GlobalSearchBar onNavigate={handleNavigate} />
          <Button size="sm" variant="outline" className="text-xs h-7 border-gray-200 gap-1.5 hidden sm:flex" onClick={() => setQuickActionsOpen(true)}>
            <Star className="h-3.5 w-3.5" />Quick Actions
          </Button>
          <button onClick={() => setQuickActionsOpen(true)} className="sm:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0">
            <Star className="h-4 w-4" />
          </button>
        </header>

        {/* Section content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-screen-xl w-full mx-auto">
          {activeSection === "overview" && (
            <OverviewSection stats={stats} statsLoading={statsLoading} revenueData={revenueData} revenueLoading={revenueLoading} isAdmin={isAdmin} onNavigate={setActiveSection} />
          )}
          {activeSection === "wholesalers" && (
            <WholesalersSection wholesalers={wholesalers} wholesalersLoading={wholesalersLoading} isAdmin={isAdmin} />
          )}
          {activeSection === "customers" && (
            <CustomersSection
              isAdmin={isAdmin}
              highlightedId={highlightedRecord?.section === "customers" ? String(highlightedRecord.id) : undefined}
            />
          )}
          {activeSection === "orders" && (
            <OrdersSection
              revenueData={revenueData}
              revenueLoading={revenueLoading}
              wholesalers={wholesalers}
              isAdmin={isAdmin}
              highlightedId={highlightedRecord?.section === "orders" ? Number(highlightedRecord.id) : undefined}
            />
          )}
          {activeSection === "products" && (
            <ProductsSection
              isAdmin={isAdmin}
              highlightedId={highlightedRecord?.section === "products" ? Number(highlightedRecord.id) : undefined}
            />
          )}
          {activeSection === "financials" && (
            <FinancialsSection wholesalers={wholesalers} isAdmin={isAdmin} />
          )}
          {activeSection === "settings" && (
            <SystemSettingsSection isAdmin={isAdmin} />
          )}
          {activeSection === "plans" && (
            <PlansSection isAdmin={isAdmin} />
          )}
          {activeSection === "logs" && (
            <SupportLogsSection isAdmin={isAdmin} wholesalers={wholesalers} />
          )}
          {activeSection === "map" && (
            <CustomerMapSection isAdmin={isAdmin} />
          )}
        </main>
      </div>

      <QuickActionsModal open={quickActionsOpen} onOpenChange={setQuickActionsOpen} wholesalers={wholesalers} />
    </div>
  );
}
