import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, ShoppingCart, TrendingUp, Search, LogOut, LayoutDashboard, Shield, Calendar, MapPin, AlertTriangle, RefreshCw,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import logoSrc from "@assets/Quikpik_1773118173684.png";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const ADMIN_EMAILS = ["hello@quikpik.co", "mogunjemilua@gmail.com"];

const GREEN  = "#1a7a3d";
const BLUE   = "#1d4ed8";
const AMBER  = "#b45309";
const INDIGO = "#4338ca";
const PURPLE = "#7c3aed";

const fmt = (n: number) =>
  `£${(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (num: number, denom: number) =>
  denom > 0 ? `${((num / denom) * 100).toFixed(1)}%` : "—";

const toISODate = (d: Date) => d.toISOString().split("T")[0];

const planBadge = (tier: string) => {
  if (tier === "premium")
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-800 border border-green-200">Premium</span>;
  if (tier === "standard")
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">Standard</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">Free</span>;
};

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

// ── Customer map types ─────────────────────────────────────────────────────────
interface MapCustomer {
  id: string;
  name: string;
  businessName: string | null;
  phoneNumber: string | null;
  postalCode: string | null;
  customerType: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string | null;
  wholesalerName: string;
  orderCount: number;
}

interface MapApiResponse {
  customers: MapCustomer[];
}

interface CustomerUpdatePayload {
  id: string;
  customerType: string;
  postalCode?: string;
}

// ── Customer type config ───────────────────────────────────────────────────────
// Legend: blue=Retailer, green=Wholesaler, orange=Individual, grey=Untagged
const TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  retail:     { label: "Retailer",   color: BLUE,      dot: "#1d4ed8" },
  wholesale:  { label: "Wholesaler", color: GREEN,     dot: "#1a7a3d" },
  individual: { label: "Individual", color: "#d97706", dot: "#f59e0b" },
  unknown:    { label: "Unknown",    color: "#6b7280", dot: "#9ca3af" },
};

function typeLabel(t: string | null): string {
  return TYPE_CONFIG[t || "unknown"]?.label ?? "Unknown";
}

function typeDot(t: string | null): string {
  return TYPE_CONFIG[t || "unknown"]?.dot ?? "#9ca3af";
}

function typeColor(t: string | null): string {
  return TYPE_CONFIG[t || "unknown"]?.color ?? "#6b7280";
}

function makeIcon(type: string | null) {
  const dot = typeDot(type);
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${dot};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Popup content with controlled select + explicit Save action
function MarkerPopupContent({
  customer,
  onSave,
  saving,
}: {
  customer: MapCustomer;
  onSave: (id: string, customerType: string) => void;
  saving: boolean;
}) {
  const [selectedType, setSelectedType] = useState<string>(customer.customerType || "");
  const dirty = selectedType !== (customer.customerType || "");
  return (
    <div style={{ minWidth: 190 }}>
      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{customer.name}</p>
      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{customer.postalCode || "No postcode"}</p>
      {customer.wholesalerName && (
        <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>via {customer.wholesalerName}</p>
      )}
      <p style={{ fontSize: 11, color: "#374151", marginBottom: 8 }}>
        {customer.orderCount} order{customer.orderCount !== 1 ? "s" : ""}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <label style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>Type:</label>
        <select
          style={{ fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 6px", background: "white", flex: 1 }}
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
        >
          <option value="">Unknown</option>
          <option value="retail">Retailer</option>
          <option value="wholesale">Wholesaler</option>
          <option value="individual">Individual</option>
        </select>
      </div>
      <button
        disabled={!dirty || saving}
        onClick={() => onSave(customer.id, selectedType)}
        style={{
          width: "100%", fontSize: 11, padding: "4px 0", borderRadius: 4, border: "none",
          cursor: dirty && !saving ? "pointer" : "not-allowed",
          background: dirty && !saving ? "#1a7a3d" : "#e5e7eb",
          color: dirty && !saving ? "white" : "#9ca3af",
          fontWeight: 600,
        }}
      >
        {saving ? "Saving…" : "Save type"}
      </button>
    </div>
  );
}

// Dialog-based edit for each flagged customer — satisfies "direct link to edit"
function EditCustomerDialog({
  customer,
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  customer: MapCustomer;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (id: string, customerType: string, postalCode?: string) => void;
  saving: boolean;
}) {
  const [selectedType, setSelectedType] = useState<string>(customer.customerType || "");
  const [postcode, setPostcode] = useState<string>(customer.postalCode || "");

  const handleSave = () => {
    onSave(customer.id, selectedType, postcode !== customer.postalCode ? postcode : undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Edit Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs font-medium text-gray-900">{customer.name}</p>
            <p className="text-xs text-gray-400">{customer.wholesalerName}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Customer type</Label>
            <select
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-gray-400"
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
            >
              <option value="">Unknown</option>
              <option value="retail">Retailer</option>
              <option value="wholesale">Wholesaler</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Postcode (re-geocodes on save)</Label>
            <Input
              className="text-xs font-mono h-8 border-gray-200"
              value={postcode}
              onChange={e => setPostcode(e.target.value.toUpperCase())}
              placeholder="e.g. SW1A 1AA"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button size="sm" variant="outline" className="text-xs" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="text-xs text-white" style={{ background: GREEN }} disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save & re-geocode"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlaggedRow({
  customer,
  onSave,
  saving,
}: {
  customer: MapCustomer;
  onSave: (id: string, customerType: string, postalCode?: string) => void;
  saving: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <TableRow className="hover:bg-amber-50/30">
        <TableCell className="text-xs font-medium text-gray-800">{customer.name}</TableCell>
        <TableCell className="text-xs text-gray-500 font-mono">{customer.postalCode || "—"}</TableCell>
        <TableCell className="text-xs text-gray-500">{customer.wholesalerName || "—"}</TableCell>
        <TableCell>
          <span className="text-xs px-2 py-0.5 rounded border" style={{
            background: typeDot(customer.customerType) + "22",
            color: typeColor(customer.customerType),
            borderColor: typeDot(customer.customerType) + "55",
          }}>
            {typeLabel(customer.customerType)}
          </span>
        </TableCell>
        <TableCell>
          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
            {customer.geocodeStatus || "pending"}
          </span>
        </TableCell>
        <TableCell>
          <button
            className="text-xs font-medium underline flex items-center gap-1"
            style={{ color: BLUE }}
            onClick={() => setDialogOpen(true)}
          >
            Edit customer
          </button>
        </TableCell>
      </TableRow>
      <EditCustomerDialog
        customer={customer}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={onSave}
        saving={saving}
      />
    </>
  );
}

// ── CustomerMapTab ─────────────────────────────────────────────────────────────
function CustomerMapTab({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const autoGeocodeTriggered = useRef(false);

  const { data: mapData, isLoading } = useQuery<MapApiResponse>({
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
    mutationFn: ({ id, customerType, postalCode }: CustomerUpdatePayload) =>
      apiRequest("PATCH", `/api/admin/customers/${id}/type`, { customerType, ...(postalCode !== undefined ? { postalCode } : {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers/map"] });
      toast({ title: "Customer updated" });
    },
    onError: () => toast({ title: "Failed to update customer", variant: "destructive" }),
  });

  const customers: MapCustomer[] = mapData?.customers || [];
  const geocoded = customers.filter(c => c.geocodeStatus === "success" && c.latitude != null && c.longitude != null);
  const flagged   = customers.filter(c => c.geocodeStatus === "flagged" || (c.geocodeStatus !== "success" && !!c.postalCode));
  const pending   = customers.filter(c => !c.geocodeStatus && !c.latitude);

  // Auto-geocode ungeocoded customers on first data load
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
      list = list.filter(c =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.postalCode || "").toLowerCase().includes(q) ||
        (c.wholesalerName || "").toLowerCase().includes(q)
      );
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

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-gray-400">Loading customer map…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["retail", "wholesale", "individual", "unknown"] as const).map(t => {
          const cfg = TYPE_CONFIG[t];
          const active = typeFilter === t;
          return (
            <div
              key={t}
              className="bg-white rounded-xl border p-3 flex items-center gap-3 cursor-pointer hover:shadow-sm transition-shadow"
              style={{ borderColor: active ? cfg.dot : "#e5e7eb", boxShadow: active ? `0 0 0 2px ${cfg.dot}33` : undefined }}
              onClick={() => setTypeFilter(active ? "" : t)}
            >
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: cfg.color }}>{typeCounts[t]}</p>
                <p className="text-xs text-gray-400">{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input placeholder="Search name, postcode, wholesaler…" value={searchQ} onChange={e => setSearchQ(e.target.value)} className="pl-8 h-8 text-xs border-gray-200" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-8 text-gray-600 focus:outline-none focus:border-gray-400 bg-white">
          <option value="">All types</option>
          <option value="retail">Retailer</option>
          <option value="wholesale">Wholesaler</option>
          <option value="individual">Individual</option>
          <option value="unknown">Unknown</option>
        </select>
        <Button
          size="sm" variant="outline" className="h-8 text-xs border-gray-200 gap-1.5"
          onClick={() => geocodeAll.mutate()} disabled={geocodeAll.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${geocodeAll.isPending ? "animate-spin" : ""}`} />
          Re-geocode ({pending.length + flagged.length} remaining)
        </Button>
      </div>

      {/* Map */}
      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100 flex-row items-center justify-between gap-2 flex flex-wrap">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="h-4 w-4" style={{ color: GREEN }} />
            Customer Map ({filtered.length} shown)
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
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {filtered.map((c) => (
                <Marker
                  key={c.id}
                  position={[c.latitude as number, c.longitude as number]}
                  icon={makeIcon(c.customerType)}
                >
                  <Popup>
                    <MarkerPopupContent
                      customer={c}
                      onSave={(id, customerType) => updateCustomer.mutate({ id, customerType })}
                      saving={updateCustomer.isPending}
                    />
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Flagged customers */}
      {flagged.length > 0 && (
        <Card className="border-amber-200 shadow-none rounded-xl overflow-hidden">
          <CardHeader className="px-4 pt-4 pb-3 border-b border-amber-100 bg-amber-50/50">
            <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Flagged — address could not be geocoded ({flagged.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-amber-50">
                    {["Name","Postcode","Wholesaler","Type","Status",""].map((h, i) => (
                      <TableHead key={i} className="text-xs font-semibold text-amber-700">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flagged.map((c) => (
                    <FlaggedRow
                      key={c.id}
                      customer={c}
                      onSave={(id, customerType, postalCode) => updateCustomer.mutate({ id, customerType, postalCode })}
                      saving={updateCustomer.isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {customers.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">
          <MapPin className="h-8 w-8 mx-auto mb-3 text-gray-200" />
          <p>No customers found.</p>
        </div>
      )}
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
            <h1 className="text-xl font-bold" style={{ color: GREEN }}>Admin Portal</h1>
            <p className="text-sm text-gray-500 mt-1">Platform administration</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <p className="text-sm text-gray-500 mb-5 text-center">Sign in with your Quikpik admin account to continue.</p>
            <Button className="w-full text-white text-sm h-11 rounded-xl font-medium" style={{ background: GREEN }} onClick={handleGoogleLogin} disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>Continue with Google
                </span>
              )}
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

// ── Main ─────────────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter state
  const [preset, setPreset] = useState<Preset>("all_time");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [wholesalerFilter, setWholesalerFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [revenuePage, setRevenuePage] = useState(1);
  const [activeTab, setActiveTab] = useState("overview");
  const PAGE_SIZE = 25;

  // Compute effective date range
  const dateRange = useMemo(() => {
    if (customFrom || customTo) return { from: customFrom || undefined, to: customTo || undefined };
    return presetToDates(preset) || {};
  }, [preset, customFrom, customTo]);

  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email || "");

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/admin/platform-stats"], enabled: isAdmin,
  });
  const { data: wholesalers = [], isLoading: wholesalersLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/wholesalers"], enabled: isAdmin,
  });

  // Revenue query — re-fetches when filters change
  const revenueParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dateRange.from) p.set("from", dateRange.from);
    if (dateRange.to)   p.set("to",   dateRange.to);
    if (wholesalerFilter) p.set("wholesalerId", wholesalerFilter);
    return p.toString();
  }, [dateRange, wholesalerFilter]);

  const { data: revenueData, isLoading: revenueLoading } = useQuery<any>({
    queryKey: ["/api/admin/revenue", revenueParams],
    queryFn: async () => {
      const url = `/api/admin/revenue${revenueParams ? `?${revenueParams}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: isAdmin,
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

  const revenueOrders: any[] = revenueData?.orders || [];
  const revenueTotals = revenueData?.totals || {};
  const subMRR: number = stats?.subscriptionRevenueMRR || 0;
  const subBreakdown = stats?.subscriptionBreakdown || { standard: { count: 0, mrr: 0 }, premium: { count: 0, mrr: 0 } };
  const breakdownLabel = preset === "all_time" && !customFrom && !customTo
    ? "All-time"
    : (PRESETS.find(p => p.id === preset)?.label ?? "Custom range");
  const planMRR = (tier: string) => tier === "premium" ? 39.99 : tier === "standard" ? 19.99 : 0;

  const wholesalerRevenueSummary = useMemo(() => {
    const map: Record<string, { name: string; tier: string; orders: number; gmv: number; buyerFees: number; merchantFees: number; total: number }> = {};
    for (const o of revenueOrders) {
      const key = o.wholesalerId || "unknown";
      if (!map[key]) map[key] = { name: o.wholesalerName || "Unknown", tier: "", orders: 0, gmv: 0, buyerFees: 0, merchantFees: 0, total: 0 };
      map[key].orders++;
      map[key].gmv        += Number(o.subtotal || 0);
      map[key].buyerFees  += Number(o.customerTransactionFee || 0);
      map[key].merchantFees += Number(o.platformFee || 0);
      map[key].total      += Number(o.customerTransactionFee || 0) + Number(o.platformFee || 0);
    }
    for (const w of wholesalers) {
      if (map[w.id]) map[w.id].tier = w.subscriptionTier || "free";
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [revenueOrders, wholesalers]);

  const filteredWholesalers = useMemo(() => {
    if (!planFilter) return wholesalers;
    return wholesalers.filter((w: any) => (w.subscriptionTier || "free") === planFilter);
  }, [wholesalers, planFilter]);

  const filteredOrders = useMemo(() => {
    if (!orderSearch.trim()) return revenueOrders;
    const q = orderSearch.toLowerCase();
    return revenueOrders.filter(o =>
      (o.orderNumber || "").toLowerCase().includes(q) ||
      (o.wholesalerName || "").toLowerCase().includes(q) ||
      (o.customerName || "").toLowerCase().includes(q)
    );
  }, [revenueOrders, orderSearch]);

  const revenuePaged = useMemo(() => {
    const start = (revenuePage - 1) * PAGE_SIZE;
    return revenueOrders.slice(start, start + PAGE_SIZE);
  }, [revenueOrders, revenuePage]);
  const revenuePages = Math.ceil(revenueOrders.length / PAGE_SIZE);

  const initials = `${user?.firstName?.charAt(0) || ""}${user?.lastName?.charAt(0) || ""}`.toUpperCase() || "A";
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Admin";

  const handlePreset = (p: Preset) => {
    setPreset(p);
    setCustomFrom("");
    setCustomTo("");
    setRevenuePage(1);
  };
  const handleCustomDate = (field: "from" | "to", val: string) => {
    if (field === "from") setCustomFrom(val);
    else setCustomTo(val);
    setPreset("all_time");
    setRevenuePage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-20" style={{ background: GREEN }}>
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-white opacity-90" />
            <span className="text-white font-bold text-sm tracking-wide">Quikpik</span>
            <span className="text-white/60 text-sm font-normal">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-xs font-bold text-white">{initials}</span>
              </div>
              <div className="leading-tight">
                <p className="text-xs font-medium text-white">{displayName}</p>
                <p className="text-xs text-white/60">{user?.email}</p>
              </div>
            </div>
            <button onClick={logout} className="flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-medium transition-colors px-2 py-1.5 rounded-lg hover:bg-white/10">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6">

        <div className="mb-5">
          <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Platform-wide data across all wholesalers</p>
        </div>

        {/* Stat cards */}
        {statsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-20 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Wholesalers"   value={stats?.totalWholesalers || 0}               sub={`${stats?.activeWholesalers || 0} active`}  icon={<Users className="h-4 w-4" />}          color={GREEN} />
            <StatCard label="Gross Revenue" value={fmt(stats?.totalGrossRevenue)}               sub="All-time order fees"                         icon={<TrendingUp className="h-4 w-4" />}      color={BLUE} />
            <StatCard label="Total Orders"  value={(stats?.totalOrders || 0).toLocaleString()}  sub={`${stats?.ordersThisMonth || 0} this month`} icon={<ShoppingCart className="h-4 w-4" />}    color={AMBER} />
            <StatCard label="Sub. MRR"      value={fmt(subMRR)}                                 sub="Monthly recurring"                           icon={<LayoutDashboard className="h-4 w-4" />} color={PURPLE} />
          </div>
        )}

        {/* ── Filter bar ── */}
        {activeTab !== "overview" && <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {/* Preset pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePreset(p.id)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    preset === p.id && !customFrom && !customTo
                      ? "text-white border-transparent"
                      : "text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700 bg-white"
                  }`}
                  style={preset === p.id && !customFrom && !customTo ? { background: GREEN, borderColor: GREEN } : {}}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom date range */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={e => handleCustomDate("from", e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400"
                placeholder="From"
              />
              <span className="text-xs text-gray-400">–</span>
              <input
                type="date"
                value={customTo}
                onChange={e => handleCustomDate("to", e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400"
                placeholder="To"
              />
            </div>

            {/* Wholesaler dropdown */}
            <select
              value={wholesalerFilter}
              onChange={e => { setWholesalerFilter(e.target.value); setRevenuePage(1); }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400 bg-white"
            >
              <option value="">All wholesalers</option>
              {wholesalers.map((w: any) => (
                <option key={w.id} value={w.id}>{w.businessName || `${w.firstName} ${w.lastName}`}</option>
              ))}
            </select>

            {/* Plan filter (affects wholesalers tab) */}
            <select
              value={planFilter}
              onChange={e => setPlanFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 h-7 text-gray-600 focus:outline-none focus:border-gray-400 bg-white"
            >
              <option value="">All plans</option>
              <option value="free">Free</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>

            {/* Active filter indicator */}
            {(dateRange.from || dateRange.to || wholesalerFilter || planFilter) && (
              <button
                onClick={() => { setPreset("all_time"); setCustomFrom(""); setCustomTo(""); setWholesalerFilter(""); setPlanFilter(""); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline ml-auto"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Active filter summary */}
          {(dateRange.from || dateRange.to) && (
            <p className="text-xs text-gray-400 mt-2 pl-5">
              Showing: {dateRange.from ? format(new Date(dateRange.from), "d MMM yyyy") : "start"} — {dateRange.to ? format(new Date(dateRange.to), "d MMM yyyy") : "today"}
              {wholesalerFilter && ` · ${wholesalers.find((w: any) => w.id === wholesalerFilter)?.businessName || "selected wholesaler"}`}
            </p>
          )}
        </div>}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="bg-white border border-gray-200 rounded-xl p-1 inline-flex gap-0.5 min-w-max shadow-sm">
              {(["overview", "wholesalers", "revenue", "orders", "customers"] as const).map((tab) => (
                <TabsTrigger key={tab} value={tab}
                  className="text-xs px-4 py-1.5 rounded-lg data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:bg-[#1a7a3d]"
                >
                  {tab === "orders" ? "All Orders" : tab === "customers" ? "Customer Map" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PlanCard label="Free"     count={stats?.wholesalersByPlan?.free || 0}     color="#6b7280" bg="#f9fafb" />
              <PlanCard label="Standard" count={stats?.wholesalersByPlan?.standard || 0} color={BLUE}    bg="#eff6ff" />
              <PlanCard label="Premium"  count={stats?.wholesalersByPlan?.premium || 0}  color={GREEN}   bg="#f0faf4" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="border-gray-200 shadow-none rounded-xl">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-gray-700">This Month</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2.5">
                  <Row label="New wholesalers joined" value={stats?.newWholesalersThisMonth || 0} />
                  <Row label="Orders placed"          value={stats?.ordersThisMonth || 0} />
                </CardContent>
              </Card>

              <Card className="border-gray-200 shadow-none rounded-xl">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-gray-700">Revenue Breakdown ({breakdownLabel})</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2.5">
                  <Row label="Buyer fees (5.5% + £0.50)"  value={fmt(revenueTotals.totalCustomerFees)}  color={BLUE} />
                  <Row label="Merchant fees (5%)"          value={fmt(revenueTotals.totalPlatformFees)}  color={AMBER} />
                  <Row label="Subscription MRR"            value={fmt(subMRR)}                           color={PURPLE} />
                  <div className="pt-1.5 border-t border-gray-100">
                    <Row label="Total earned (fees + MRR)" value={fmt((revenueTotals.totalGrossRevenue || 0) + subMRR)} color={GREEN} bold />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Subscription breakdown */}
            <Card className="border-gray-200 shadow-none rounded-xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-gray-700">Subscription Revenue</CardTitle>
              </CardHeader>
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
          </TabsContent>

          {/* ── Wholesalers ── */}
          <TabsContent value="wholesalers">
            <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
              <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
                <CardTitle className="text-sm font-semibold text-gray-700">
                  All Wholesalers ({filteredWholesalers.length}{planFilter ? ` on ${planFilter}` : ""})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {wholesalersLoading ? (
                  <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent bg-[#f0faf4]">
                          {["Business","Plan","Orders","GMV","Buyer Fees","Merchant Fees","Sub. Revenue","Total Fees","Take Rate","Joined","Status",""].map((h, i) => (
                            <TableHead key={i} className="text-xs font-semibold" style={{ color: GREEN }}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWholesalers.map((w: any) => (
                          <TableRow key={w.id} className="hover:bg-green-50/30">
                            <TableCell>
                              <p className="text-xs font-medium text-gray-800">{w.businessName || `${w.firstName} ${w.lastName}`}</p>
                              <p className="text-xs text-gray-400">{w.email}</p>
                            </TableCell>
                            <TableCell>{planBadge(w.subscriptionTier)}</TableCell>
                            <TableCell className="text-xs text-right text-gray-600">{w.orderCount}</TableCell>
                            <TableCell className="text-xs text-right text-gray-600">{fmt(w.totalGMV)}</TableCell>
                            <TableCell className="text-xs text-right font-medium" style={{ color: BLUE }}>{fmt(w.customerFeesEarned)}</TableCell>
                            <TableCell className="text-xs text-right font-medium" style={{ color: AMBER }}>{fmt(w.platformFeesEarned)}</TableCell>
                            <TableCell className="text-xs text-right font-medium" style={{ color: PURPLE }}>{planMRR(w.subscriptionTier || "free") > 0 ? `${fmt(planMRR(w.subscriptionTier || "free"))}/mo` : "—"}</TableCell>
                            <TableCell className="text-xs text-right font-bold text-gray-900">{fmt(w.totalFeesEarned)}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-indigo-600">{pct(w.totalFeesEarned, w.totalGMV)}</TableCell>
                            <TableCell className="text-xs text-gray-400">{w.createdAt ? format(new Date(w.createdAt), "dd MMM yy") : "—"}</TableCell>
                            <TableCell>
                              {w.archived
                                ? <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">Suspended</span>
                                : <span className="text-xs px-2 py-0.5 rounded border bg-[#f0faf4] border-[#bbdfc8]" style={{ color: GREEN }}>Active</span>
                              }
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200 hover:bg-gray-50" disabled={toggleStatus.isPending} onClick={() => toggleStatus.mutate(w.id)}>
                                {w.archived ? "Activate" : "Suspend"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="hover:bg-transparent bg-[#f0faf4] border-t-2 border-gray-200">
                          <TableCell colSpan={3} className="text-xs font-bold" style={{ color: GREEN }}>Grand Total</TableCell>
                          <TableCell className="text-xs text-right font-semibold text-gray-700">{fmt(filteredWholesalers.reduce((s: number, w: any) => s + (w.totalGMV || 0), 0))}</TableCell>
                          <TableCell className="text-xs text-right font-semibold" style={{ color: BLUE }}>{fmt(filteredWholesalers.reduce((s: number, w: any) => s + (w.customerFeesEarned || 0), 0))}</TableCell>
                          <TableCell className="text-xs text-right font-semibold" style={{ color: AMBER }}>{fmt(filteredWholesalers.reduce((s: number, w: any) => s + (w.platformFeesEarned || 0), 0))}</TableCell>
                          <TableCell className="text-xs text-right font-bold text-gray-900">{fmt(filteredWholesalers.reduce((s: number, w: any) => s + (w.totalFeesEarned || 0), 0))}</TableCell>
                          <TableCell className="text-xs text-right font-medium text-indigo-600">
                            {pct(
                              filteredWholesalers.reduce((s: number, w: any) => s + (w.totalFeesEarned || 0), 0),
                              filteredWholesalers.reduce((s: number, w: any) => s + (w.totalGMV || 0), 0)
                            )}
                          </TableCell>
                          <TableCell colSpan={3} />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Revenue ── */}
          <TabsContent value="revenue" className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Buyer Fees"    value={fmt(revenueTotals.totalCustomerFees)}  sub="5.5% + £0.50 per order" icon={<TrendingUp className="h-4 w-4" />}   color={BLUE} />
              <StatCard label="Merchant Fees" value={fmt(revenueTotals.totalPlatformFees)}  sub="5% per order"           icon={<TrendingUp className="h-4 w-4" />}   color={AMBER} />
              <StatCard label="Order Revenue" value={fmt(revenueTotals.totalGrossRevenue)}  sub="Buyer + merchant fees"  icon={<TrendingUp className="h-4 w-4" />}   color={GREEN} />
              <StatCard label="Sub. MRR"      value={fmt(subMRR)}                           sub="Monthly recurring"      icon={<LayoutDashboard className="h-4 w-4" />} color={PURPLE} />
            </div>

            {/* Take rate overview */}
            <Card className="border-gray-200 shadow-none rounded-xl">
              <CardContent className="px-4 py-3 flex flex-wrap gap-6">
                <div>
                  <p className="text-xs text-gray-400">Period GMV</p>
                  <p className="text-sm font-bold text-gray-800">{fmt(revenueTotals.totalGMV || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Overall Take Rate</p>
                  <p className="text-sm font-bold text-indigo-600">{pct(revenueTotals.totalGrossRevenue || 0, revenueTotals.totalGMV || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Orders in period</p>
                  <p className="text-sm font-bold text-gray-800">{revenueOrders.length.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Avg. order value</p>
                  <p className="text-sm font-bold text-gray-800">{revenueOrders.length > 0 ? fmt((revenueTotals.totalGMV || 0) / revenueOrders.length) : "—"}</p>
                </div>
              </CardContent>
            </Card>

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

            <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
              <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
                <CardTitle className="text-sm font-semibold text-gray-700">Per-Order Breakdown ({revenueOrders.length} orders)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {revenueLoading ? (
                  <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
                ) : (
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
                          {revenuePaged.map((o: any) => (
                            <TableRow key={o.id} className="hover:bg-blue-50/30">
                              <TableCell className="font-mono text-xs text-gray-500">{o.orderNumber}</TableCell>
                              <TableCell className="text-xs text-gray-700">{o.wholesalerName || "—"}</TableCell>
                              <TableCell className="text-xs text-gray-600">{o.customerName || "—"}</TableCell>
                              <TableCell className="text-xs text-right text-gray-600">{fmt(o.subtotal)}</TableCell>
                              <TableCell className="text-xs text-right font-medium" style={{ color: BLUE }}>{fmt(o.customerTransactionFee)}</TableCell>
                              <TableCell className="text-xs text-right font-medium" style={{ color: AMBER }}>{fmt(o.platformFee)}</TableCell>
                              <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(o.totalQuikpikIncome)}</TableCell>
                              <TableCell className="text-xs text-right font-medium text-indigo-600">{pct(o.totalQuikpikIncome, o.subtotal)}</TableCell>
                              <TableCell className="text-xs text-gray-400">{o.createdAt ? format(new Date(o.createdAt), "dd MMM yy") : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {revenuePages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                        <span className="text-xs text-gray-400">Page {revenuePage} of {revenuePages} ({revenueOrders.length} orders)</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={revenuePage === 1} onClick={() => setRevenuePage(p => p - 1)}>Prev</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-200" disabled={revenuePage === revenuePages} onClick={() => setRevenuePage(p => p + 1)}>Next</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── All Orders ── */}
          <TabsContent value="orders">
            <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
              <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-700">All Orders ({filteredOrders.length} results)</CardTitle>
                  <div className="relative w-full sm:w-56">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input placeholder="Search orders..." value={orderSearch} onChange={e => setOrderSearch(e.target.value)} className="pl-8 h-8 text-xs border-gray-200" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {revenueLoading ? (
                  <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent bg-amber-50">
                          {["Order #","Wholesaler","Customer","GMV","Take Rate","Status","Payment","Date"].map((h, i) => (
                            <TableHead key={i} className="text-xs font-semibold text-amber-700">{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOrders.slice(0, 200).map((o: any) => (
                          <TableRow key={o.id} className="hover:bg-amber-50/30">
                            <TableCell className="font-mono text-xs text-gray-500">{o.orderNumber}</TableCell>
                            <TableCell className="text-xs text-gray-700">{o.wholesalerName || "—"}</TableCell>
                            <TableCell className="text-xs text-gray-600">{o.customerName || "—"}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-gray-700">{fmt(o.subtotal)}</TableCell>
                            <TableCell className="text-xs text-right font-medium text-indigo-600">{pct(o.totalQuikpikIncome, o.subtotal)}</TableCell>
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
                          </TableRow>
                        ))}
                        {filteredOrders.length === 0 && (
                          <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">No orders found</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Customer Map ── */}
          <TabsContent value="customers">
            <CustomerMapTab isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub: string; icon: React.ReactNode; color: string;
}) {
  const bgMap: Record<string, string> = {
    [GREEN]:  "#f0faf4",
    [BLUE]:   "#eff6ff",
    [AMBER]:  "#fffbeb",
    [INDIGO]: "#eef2ff",
    [PURPLE]: "#f5f3ff",
  };
  const bg = bgMap[color] || "#f9fafb";
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bg, color }}>{icon}</div>
      </div>
      <p className="text-lg font-bold leading-tight" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function PlanCard({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 text-center" style={{ background: bg }}>
      <p className="text-2xl font-bold" style={{ color }}>{count}</p>
      <p className="text-xs text-gray-500 mt-1">{label} Plan</p>
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
