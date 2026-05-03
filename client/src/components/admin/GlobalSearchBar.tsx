import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ShoppingCart, Users, Package } from "lucide-react";
import type { SectionId, RawSearchResponse, SearchResult, SearchGroup } from "./types";

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

export function GlobalSearchBar({ onNavigate }: { onNavigate: (section: SectionId, id?: string | number) => void }) {
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
