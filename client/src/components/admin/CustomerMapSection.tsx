import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, MapPin, RefreshCw, AlertTriangle } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useToast } from "@/hooks/use-toast";
import { GREEN, BLUE } from "./shared";
import type { MapCustomer } from "./types";

const TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  retail:     { label: "Retailer",   color: BLUE,      dot: "#1d4ed8" },
  wholesale:  { label: "Wholesaler", color: GREEN,     dot: "#1a7a3d" },
  individual: { label: "Individual", color: "#d97706", dot: "#f59e0b" },
  unknown:    { label: "Unknown",    color: "#6b7280", dot: "#9ca3af" },
};

export function typeDot(t: string | null) { return TYPE_CONFIG[t || "unknown"]?.dot ?? "#9ca3af"; }
export function typeColor(t: string | null) { return TYPE_CONFIG[t || "unknown"]?.color ?? "#6b7280"; }
export function typeLabel(t: string | null) { return TYPE_CONFIG[t || "unknown"]?.label ?? "Unknown"; }

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

function FlaggedCustomersTable({ customers, onFix, fixing }: { customers: MapCustomer[]; onFix: (id: string, postalCode: string) => void; fixing: boolean }) {
  const flagged = customers.filter(c => c.geocodeStatus === "flagged");
  const [edits, setEdits] = useState<Record<string, string>>({});
  if (flagged.length === 0) return null;

  return (
    <Card className="border-red-100 shadow-none rounded-xl">
      <CardHeader className="pb-2 pt-4 px-4">
        <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />{flagged.length} customer{flagged.length !== 1 ? "s" : ""} with invalid postcode
        </p>
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

export function CustomerMapSection({ isAdmin }: { isAdmin: boolean }) {
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
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="h-4 w-4" style={{ color: GREEN }} />Customer Map ({filtered.length} shown)
          </p>
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
