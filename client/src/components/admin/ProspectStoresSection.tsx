import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Search, Plus, Pencil, Trash2, MapPin, List, Check, ChevronsUpDown,
  ChevronUp, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GREEN } from "./shared";
import type { WholesalerRow } from "./types";

declare const google: any;

interface ProspectStore {
  id: number;
  name: string;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  openingTime: string | null;
  closingTime: string | null;
  type: string;
  visited: boolean;
  notes: string | null;
  assignedWholesalerIds: string[] | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const VISITED_GREEN = "#1a7a3d";
const UNVISITED_GREY = "#9ca3af";

interface StoreFormState {
  name: string;
  address: string;
  openingTime: string;
  closingTime: string;
  type: "retail" | "wholesale";
  notes: string;
  assignedWholesalerIds: string[];
}

const EMPTY_FORM: StoreFormState = {
  name: "", address: "", openingTime: "", closingTime: "",
  type: "retail", notes: "", assignedWholesalerIds: [],
};

// ─── Google Maps loader (reuses SDK if already loaded by BusinessSearchInput) ─
let gmSdkPromise: Promise<boolean> | null = null;
function loadGoogleMapsSdk(apiKey: string): Promise<boolean> {
  if (gmSdkPromise) return gmSdkPromise;
  gmSdkPromise = new Promise((resolve) => {
    if (typeof google !== "undefined" && google?.maps?.Map) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => { gmSdkPromise = null; resolve(false); };
    document.head.appendChild(script);
  });
  return gmSdkPromise;
}

// ─── Store Form Modal ─────────────────────────────────────────────────────────
function StoreFormModal({
  open, onOpenChange, initial, onSave, saving, wholesalers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: StoreFormState | null;
  onSave: (data: StoreFormState) => void;
  saving: boolean;
  wholesalers: WholesalerRow[];
}) {
  const [form, setForm] = useState<StoreFormState>(initial ?? EMPTY_FORM);
  const set = (k: keyof StoreFormState, v: any) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) setForm(initial ?? EMPTY_FORM);
  }, [open, initial]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.name ? "Edit Store" : "Add Prospect Store"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs text-gray-500 font-medium">Store name *</label>
            <Input className="mt-1 text-sm" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Ali's Grocery" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Address</label>
            <Input className="mt-1 text-sm" value={form.address} onChange={e => set("address", e.target.value)} placeholder="e.g. 42 High Street, Woolwich, SE18 6HE" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">Opening time</label>
              <Input className="mt-1 text-sm" value={form.openingTime} onChange={e => set("openingTime", e.target.value)} placeholder="e.g. 08:00" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Closing time</label>
              <Input className="mt-1 text-sm" value={form.closingTime} onChange={e => set("closingTime", e.target.value)} placeholder="e.g. 20:00" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Store type</label>
            <div className="flex gap-3 mt-1">
              {(["retail", "wholesale"] as const).map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.type === t} onChange={() => set("type", t)} className="accent-green-700" />
                  <span className="text-sm capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Notes</label>
            <Textarea className="mt-1 text-sm min-h-[72px]" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any relevant notes…" />
          </div>
          {wholesalers.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 font-medium">Assign to wholesalers</label>
              <div className="mt-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {wholesalers.map(w => {
                  const checked = form.assignedWholesalerIds.includes(w.id);
                  return (
                    <label key={w.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (checked) set("assignedWholesalerIds", form.assignedWholesalerIds.filter(id => id !== w.id));
                          else set("assignedWholesalerIds", [...form.assignedWholesalerIds, w.id]);
                        }}
                        className="accent-green-700"
                      />
                      <span className="text-xs">{w.businessName || w.email}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" className="text-white" style={{ background: GREEN }} disabled={saving || !form.name.trim()} onClick={() => onSave(form)}>
            {saving ? "Saving…" : "Save store"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Google Maps Tab ───────────────────────────────────────────────────────────
function GoogleMapTab({ stores }: { stores: ProspectStore[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const mapped = useMemo(
    () => stores.filter(s => s.latitude != null && s.longitude != null),
    [stores],
  );

  const toggleVisited = useMutation({
    mutationFn: ({ id, visited }: { id: number; visited: boolean }) =>
      apiRequest("PATCH", `/api/admin/prospect-stores/${id}`, { visited }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/prospect-stores"] }),
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const res = await fetch("/api/config/google-places-key", { credentials: "include" });
        if (!res.ok || cancelled) { setMapError(true); return; }
        const { apiKey } = await res.json();
        if (!apiKey) { setMapError(true); return; }
        const ok = await loadGoogleMapsSdk(apiKey);
        if (!ok || cancelled) { setMapError(true); return; }
        if (!cancelled) setMapReady(true);
      } catch {
        if (!cancelled) setMapError(true);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        center: { lat: 51.5, lng: 0.0 },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      infoWindowRef.current = new google.maps.InfoWindow();
    }
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;

    mapped.forEach(s => {
      const lat = parseFloat(s.latitude!);
      const lng = parseFloat(s.longitude!);
      const pos = { lat, lng };

      const marker = new google.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        title: s.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: s.visited ? VISITED_GREEN : UNVISITED_GREY,
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 2,
        },
      });

      marker.addListener("click", () => {
        const hours = [s.openingTime, s.closingTime].filter(Boolean).join(" – ");
        const content = `
          <div style="min-width:180px;font-family:system-ui,sans-serif">
            <p style="font-weight:700;font-size:13px;margin:0 0 4px">${s.name}</p>
            <p style="font-size:11px;color:#4b5563;margin:0 0 2px">${s.address || "No address"}</p>
            ${hours ? `<p style="font-size:11px;color:#6b7280;margin:0 0 4px">${hours}</p>` : ""}
            <p style="font-size:11px;color:#9ca3af;margin:0 0 8px;text-transform:capitalize">${s.type}</p>
            <button
              id="toggle-visited-${s.id}"
              style="width:100%;font-size:11px;padding:4px 0;border-radius:4px;border:none;cursor:pointer;background:${s.visited ? "#e5e7eb" : VISITED_GREEN};color:${s.visited ? "#374151" : "white"};font-weight:600"
            >${s.visited ? "Mark unvisited" : "Mark visited"}</button>
          </div>`;
        infoWindowRef.current.setContent(content);
        infoWindowRef.current.open(mapInstanceRef.current, marker);
        setTimeout(() => {
          const btn = document.getElementById(`toggle-visited-${s.id}`);
          if (btn) {
            btn.onclick = () => {
              infoWindowRef.current.close();
              toggleVisited.mutate({ id: s.id, visited: !s.visited });
            };
          }
        }, 100);
      });

      markersRef.current.push(marker);
      bounds.extend(pos);
      hasBounds = true;
    });

    if (hasBounds && mapped.length > 1) {
      mapInstanceRef.current.fitBounds(bounds, 40);
    } else if (hasBounds) {
      mapInstanceRef.current.setCenter(bounds.getCenter());
      mapInstanceRef.current.setZoom(14);
    }
  }, [mapReady, mapped, toggleVisited]);

  if (mapError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400 text-sm">
        <MapPin className="h-8 w-8 mb-3 opacity-30" />
        <p className="font-medium text-gray-500">Map unavailable</p>
        <p className="text-xs mt-1">Google Maps could not be loaded. Check that the API key is configured.</p>
      </div>
    );
  }

  if (mapped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400 text-sm">
        <MapPin className="h-8 w-8 mb-3 opacity-30" />
        <p className="font-medium text-gray-500">No stores on the map yet</p>
        <p className="text-xs mt-1">Add stores with addresses and they will appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: VISITED_GREEN }} />Visited
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: UNVISITED_GREY }} />Not visited
        </span>
        <span className="ml-auto">{mapped.length} of {stores.length} store{stores.length !== 1 ? "s" : ""} mapped</span>
      </div>
      <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
        <CardContent className="p-0">
          <div ref={mapRef} style={{ height: 480, background: "#f3f4f6" }}>
            {!mapReady && (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">Loading map…</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────
type SortKey = "name" | "type" | "openingTime" | "closingTime" | "visited";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 text-gray-300 ml-1 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 text-gray-500 ml-1 inline" />
    : <ChevronDown className="h-3 w-3 text-gray-500 ml-1 inline" />;
}

function sortStores(stores: ProspectStore[], key: SortKey, dir: SortDir): ProspectStore[] {
  return [...stores].sort((a, b) => {
    let av: any, bv: any;
    if (key === "visited") { av = a.visited ? 1 : 0; bv = b.visited ? 1 : 0; }
    else { av = (a[key] ?? "").toLowerCase(); bv = (b[key] ?? "").toLowerCase(); }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export function ProspectStoresSection({
  isAdmin, wholesalers,
}: {
  isAdmin: boolean;
  wholesalers: WholesalerRow[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"table" | "map">("table");
  const [searchQ, setSearchQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showForm, setShowForm] = useState(false);
  const [editStore, setEditStore] = useState<ProspectStore | null>(null);
  const [deleteStore, setDeleteStore] = useState<ProspectStore | null>(null);
  const [savingNotes, setSavingNotes] = useState<Record<number, boolean>>({});
  const [localNotes, setLocalNotes] = useState<Record<number, string>>({});

  const { data: stores = [], isLoading } = useQuery<ProspectStore[]>({
    queryKey: ["/api/admin/prospect-stores"],
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data: StoreFormState) => apiRequest("POST", "/api/admin/prospect-stores", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prospect-stores"] });
      setShowForm(false);
      toast({ title: "Store added" });
    },
    onError: () => toast({ title: "Failed to add store", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<StoreFormState> & { id: number }) =>
      apiRequest("PATCH", `/api/admin/prospect-stores/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prospect-stores"] });
      setEditStore(null);
      toast({ title: "Store updated" });
    },
    onError: () => toast({ title: "Failed to update store", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/prospect-stores/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prospect-stores"] });
      setDeleteStore(null);
      toast({ title: "Store deleted" });
    },
    onError: () => toast({ title: "Failed to delete store", variant: "destructive" }),
  });

  const toggleVisited = useCallback((store: ProspectStore) => {
    apiRequest("PATCH", `/api/admin/prospect-stores/${store.id}`, { visited: !store.visited })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/admin/prospect-stores"] }))
      .catch(() => toast({ title: "Failed to update", variant: "destructive" }));
  }, [queryClient, toast]);

  const saveNotes = useCallback(async (store: ProspectStore, notes: string) => {
    if (notes === (store.notes ?? "")) return;
    setSavingNotes(prev => ({ ...prev, [store.id]: true }));
    try {
      await apiRequest("PATCH", `/api/admin/prospect-stores/${store.id}`, { notes });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/prospect-stores"] });
    } catch {
      toast({ title: "Failed to save notes", variant: "destructive" });
    } finally {
      setSavingNotes(prev => ({ ...prev, [store.id]: false }));
    }
  }, [queryClient, toast]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let list = stores;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    return sortStores(list, sortKey, sortDir);
  }, [stores, searchQ, sortKey, sortDir]);

  const visitedCount = stores.filter(s => s.visited).length;

  const formInitial = editStore
    ? {
        name: editStore.name,
        address: editStore.address ?? "",
        openingTime: editStore.openingTime ?? "",
        closingTime: editStore.closingTime ?? "",
        type: (editStore.type === "wholesale" ? "wholesale" : "retail") as "retail" | "wholesale",
        notes: editStore.notes ?? "",
        assignedWholesalerIds: editStore.assignedWholesalerIds ?? [],
      }
    : null;

  const SortTh = ({ col, label }: { col: SortKey; label: string }) => (
    <TableHead
      className="text-xs px-4 cursor-pointer select-none hover:bg-gray-50"
      onClick={() => handleSort(col)}
    >
      {label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Prospect Stores</h2>
          <p className="text-xs text-gray-400">Nigerian retail &amp; wholesale stores in South East England — track visits and assign to wholesalers</p>
        </div>
        <Button size="sm" className="text-white gap-1.5 h-8" style={{ background: GREEN }}
          onClick={() => { setEditStore(null); setShowForm(true); }}>
          <Plus className="h-3.5 w-3.5" />Add store
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xl font-bold" style={{ color: GREEN }}>{stores.length}</p>
          <p className="text-xs text-gray-400">Total</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{visitedCount}</p>
          <p className="text-xs text-gray-400">Visited</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{stores.length - visitedCount}</p>
          <p className="text-xs text-gray-400">Not visited</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([["table", List, "Table"], ["map", MapPin, "Map"]] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {activeTab === "table" && (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search by store name…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              className="pl-8 h-8 text-xs border-gray-200"
            />
          </div>

          {/* Table */}
          <Card className="border-gray-200 shadow-none rounded-xl overflow-hidden">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <p className="font-medium text-gray-500 mb-1">{stores.length === 0 ? "No prospect stores yet" : "No results"}</p>
                  <p className="text-xs">{stores.length === 0 ? "Click \u201cAdd store\u201d to get started." : "Try a different search."}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-100 hover:bg-transparent">
                        <TableHead className="text-xs px-4 w-8 cursor-pointer select-none hover:bg-gray-50"
                          onClick={() => handleSort("visited")} title="Sort by visited">
                          <Check className="h-3 w-3 text-gray-400" />
                          <SortIcon col="visited" sortKey={sortKey} sortDir={sortDir} />
                        </TableHead>
                        <SortTh col="name" label="Name" />
                        <TableHead className="text-xs px-4">Address</TableHead>
                        <SortTh col="openingTime" label="Opens" />
                        <SortTh col="closingTime" label="Closes" />
                        <SortTh col="type" label="Type" />
                        <TableHead className="text-xs px-4 w-48">Notes</TableHead>
                        <TableHead className="text-xs px-4 w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(store => (
                        <TableRow key={store.id} className={`border-gray-50 hover:bg-gray-50/50 ${store.visited ? "opacity-70" : ""}`}>
                          <TableCell className="px-4">
                            <button
                              onClick={() => toggleVisited(store)}
                              title={store.visited ? "Mark unvisited" : "Mark visited"}
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                store.visited
                                  ? "border-emerald-600 bg-emerald-600"
                                  : "border-gray-300 hover:border-emerald-500"
                              }`}
                            >
                              {store.visited && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                            </button>
                          </TableCell>
                          <TableCell className="px-4">
                            <p className="text-xs font-medium text-gray-900">{store.name}</p>
                          </TableCell>
                          <TableCell className="px-4">
                            <p className="text-xs text-gray-600 max-w-[180px] truncate" title={store.address ?? ""}>{store.address || "—"}</p>
                          </TableCell>
                          <TableCell className="px-4">
                            <span className="text-xs text-gray-600">{store.openingTime || <span className="text-gray-300">—</span>}</span>
                          </TableCell>
                          <TableCell className="px-4">
                            <span className="text-xs text-gray-600">{store.closingTime || <span className="text-gray-300">—</span>}</span>
                          </TableCell>
                          <TableCell className="px-4">
                            <Badge variant="outline" className={`text-xs capitalize ${
                              store.type === "wholesale"
                                ? "border-green-200 text-green-700 bg-green-50"
                                : "border-blue-200 text-blue-700 bg-blue-50"
                            }`}>
                              {store.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4">
                            <Textarea
                              className="text-xs min-h-[36px] max-h-[80px] border-gray-200 resize-none"
                              placeholder="Notes…"
                              value={localNotes[store.id] ?? store.notes ?? ""}
                              onChange={e => setLocalNotes(prev => ({ ...prev, [store.id]: e.target.value }))}
                              onBlur={() => {
                                const val = localNotes[store.id] ?? store.notes ?? "";
                                saveNotes(store, val);
                              }}
                              disabled={savingNotes[store.id]}
                            />
                          </TableCell>
                          <TableCell className="px-4">
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-gray-700"
                                onClick={() => { setEditStore(store); setShowForm(false); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-600"
                                onClick={() => setDeleteStore(store)}>
                                <Trash2 className="h-3.5 w-3.5" />
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
        </>
      )}

      {activeTab === "map" && <GoogleMapTab stores={stores} />}

      {/* Add/Edit modal */}
      <StoreFormModal
        open={showForm || editStore !== null}
        onOpenChange={(v) => { if (!v) { setShowForm(false); setEditStore(null); } }}
        initial={formInitial}
        wholesalers={wholesalers}
        saving={createMutation.isPending || updateMutation.isPending}
        onSave={(data) => {
          if (editStore) {
            updateMutation.mutate({ id: editStore.id, ...data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteStore} onOpenChange={(v) => { if (!v) setDeleteStore(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete store?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteStore?.name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteStore && deleteMutation.mutate(deleteStore.id)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
