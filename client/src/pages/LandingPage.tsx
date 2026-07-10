import { useState, useEffect, useRef } from "react";
import { useCanonical } from "@/hooks/useCanonical";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  MessageSquare,
  Users,
  CreditCard,
  Package,
  Phone,
  Lock,
  ShoppingBag,
  FileText,
  CheckCircle,
  Shield,
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Box,
  ReceiptText,
  UserCheck,
  Wallet,
  Search,
  Store,
  MapPin,
  Handshake,
} from "lucide-react";

function DashboardMockup() {
  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-sm text-gray-900 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <img src="/quikpik-logo.png" alt="" className="h-5 w-5 object-contain" />
          <span className="font-bold text-sm text-gray-900">Quikpik</span>
        </div>
        <Menu className="h-4 w-4 text-gray-400" />
      </div>

      <div className="p-4">
        {/* Greeting */}
        <div className="mb-4">
          <p className="font-semibold text-sm text-gray-900">Good morning, John 👋</p>
          <p className="text-xs text-gray-400">Here's what's happening in your business.</p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {/* Total Sales */}
          <div className="bg-primary rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/80 text-xs">Total Sales</span>
              <TrendingUp className="h-3.5 w-3.5 text-white/70" />
            </div>
            <p className="text-white font-bold text-base">12,450</p>
            <p className="text-white/70 text-xs">+18% from last month</p>
          </div>

          {/* Amount Owed */}
          <div className="bg-amber-400 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-amber-900/80 text-xs">Amount Owed</span>
              <TrendingUp className="h-3.5 w-3.5 text-amber-900/60" />
            </div>
            <p className="text-amber-900 font-bold text-base">4,820</p>
            <p className="text-amber-900/70 text-xs">12 unpaid invoices</p>
          </div>

          {/* Total Orders */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-500 text-xs">Total Orders</span>
              <ShoppingCart className="h-3.5 w-3.5 text-gray-400" />
            </div>
            <p className="text-gray-900 font-bold text-base">126</p>
            <p className="text-green-600 text-xs">+10% this week</p>
          </div>

          {/* Low Stock */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-500 text-xs">Low Stock Items</span>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <p className="text-gray-900 font-bold text-base">6</p>
            <p className="text-primary text-xs cursor-pointer">View items</p>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">Recent Activity</span>
            <span className="text-xs text-primary">View all</span>
          </div>
          <div className="space-y-1.5">
            {[
              { id: "INV-051", status: "Paid",   color: "text-green-600", date: "10 May, 2024" },
              { id: "INV-050", status: "Paid",   color: "text-green-600", date: "10 May, 2024" },
              { id: "INV-049", status: "Unpaid", color: "text-red-500",   date: "9 May, 2024"  },
            ].map(({ id, status, color, date }) => (
              <div key={id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
                    <FileText className="h-3 w-3 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-800">Invoice #{id}</p>
                    <p className={`text-xs ${color}`}>{status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">{date}</span>
                  <ChevronRight className="h-3 w-3 text-gray-300" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RetailerProductsMockup() {
  const products = [
    { name: "Shea Butter (Raw)",     supplier: "GhanaGold Ltd", price: "$18.00", unit: "/ cs",  moq: 24, bg: "bg-yellow-100", ic: "text-yellow-600" },
    { name: "Arabica Coffee Beans", supplier: "EthioBean Co",  price: "$9.50",  unit: "/ kg",  moq: 12, bg: "bg-amber-100",  ic: "text-amber-600"  },
    { name: "Natural Honey Jars",   supplier: "HiveHarvest NG",price: "$22.00", unit: "/ doz", moq: 6,  bg: "bg-green-100",  ic: "text-green-600"  },
    { name: "Argan Oil (Organic)",  supplier: "MarocProduce",  price: "$28.50", unit: "/ cs",  moq: 12, bg: "bg-orange-100", ic: "text-orange-600" },
  ];
  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-sm text-gray-900 select-none">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <span className="font-bold text-sm text-gray-900">Wholesale Products</span>
        </div>
        <span className="text-xs text-primary font-medium">500+ suppliers</span>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-3">
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-400">Search products, brands or categories…</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {products.map(({ name, supplier, price, unit, moq, bg, ic }) => (
            <div key={name} className="bg-white border border-gray-100 rounded-xl p-2.5 hover:border-primary/20 transition-colors">
              <div className={`${bg} rounded-lg h-14 flex items-center justify-center mb-2`}>
                <Package className={`h-5 w-5 ${ic}`} />
              </div>
              <p className="text-xs font-semibold text-gray-900 leading-tight mb-0.5 truncate">{name}</p>
              <p className="text-[10px] text-gray-400 mb-1.5 truncate">{supplier}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">{price} <span className="font-normal text-gray-400">{unit}</span></span>
                <span className="text-[10px] bg-gray-50 border border-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">MOQ {moq}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-4 text-left gap-4 group"
      >
        <span className="text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors">{question}</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="text-sm text-gray-500 leading-relaxed pb-4">{answer}</p>}
    </div>
  );
}

interface SearchResult {
  productId: number;
  productName: string;
  category?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  price: string;
  minOrderQuantity?: number | null;
  unitsPerPack?: number | null;
  stock?: number | null;
  wholesalerId: string;
  businessName: string;
  storeSlug?: string | null;
  logoUrl?: string | null;
  priceDisplayMode: string;
  city?: string | null;
  stockVisible?: boolean | null;
  packSizeVisible?: boolean | null;
}

interface WholesalerGroup {
  wholesalerId: string;
  businessName: string;
  storeSlug?: string | null;
  logoUrl?: string | null;
  city?: string | null;
  products: string[];
}

function getInitials(name: string) {
  return name.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function groupByWholesaler(results: SearchResult[]): WholesalerGroup[] {
  const map = new Map<string, WholesalerGroup>();
  for (const r of results) {
    if (!map.has(r.wholesalerId)) {
      map.set(r.wholesalerId, {
        wholesalerId: r.wholesalerId,
        businessName: r.businessName,
        storeSlug: r.storeSlug,
        logoUrl: r.logoUrl,
        city: r.city,
        products: [],
      });
    }
    const group = map.get(r.wholesalerId)!;
    if (!group.products.includes(r.productName)) {
      group.products.push(r.productName);
    }
  }
  return Array.from(map.values()).slice(0, 12);
}

function splitResults(results: SearchResult[], query: string): {
  supplierGroups: WholesalerGroup[];
  productHits: SearchResult[];
} {
  if (!query) {
    return { supplierGroups: [], productHits: results };
  }
  const q = query.toLowerCase();
  const supplierIds = new Set<string>();
  for (const r of results) {
    if (r.businessName.toLowerCase().includes(q)) {
      supplierIds.add(r.wholesalerId);
    }
  }
  const supplierHits: SearchResult[] = [];
  const productHits: SearchResult[] = [];
  for (const r of results) {
    if (supplierIds.has(r.wholesalerId)) {
      supplierHits.push(r);
    } else {
      productHits.push(r);
    }
  }
  return { supplierGroups: groupByWholesaler(supplierHits), productHits };
}

interface SupplierMatch {
  wholesalerId: string;
  businessName: string;
  storeSlug?: string | null;
  logoUrl?: string | null;
  city?: string | null;
}

function MarketplaceSearch() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [supplierMatches, setSupplierMatches] = useState<SupplierMatch[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = async (q: string, cat: string, stockOnly: boolean) => {
    if (!q && !cat && !stockOnly) { setResults([]); setSupplierMatches([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (cat) params.set('category', cat);
      if (stockOnly) params.set('inStockOnly', 'true');
      const res = await fetch(`/api/public/search?${params}`);
      const data = await res.json();
      setResults(data.results || []);
      setSupplierMatches(data.supplierMatches || []);
      if (data.categories?.length) setCategories(data.categories);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query, selectedCategory, inStockOnly), 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, selectedCategory, inStockOnly]);

  // Merge product-derived supplier groups with direct supplier-only matches
  const { supplierGroups: productSupplierGroups, productHits } = splitResults(results, query);
  const extraSupplierGroups: WholesalerGroup[] = supplierMatches.map(s => ({
    wholesalerId: s.wholesalerId,
    businessName: s.businessName,
    storeSlug: s.storeSlug,
    logoUrl: s.logoUrl,
    city: s.city,
    products: [],
  }));
  const supplierGroups = [...productSupplierGroups, ...extraSupplierGroups];
  const hasContent = searched || query || selectedCategory || inStockOnly;
  const hasBoth = supplierGroups.length > 0 && productHits.length > 0;

  return (
    <section
      className="relative border-b border-gray-100 py-12 sm:py-16 pb-16 sm:pb-20 overflow-hidden"
    >
      {/* Optimised background image — WebP with JPEG fallback */}
      <picture>
        <source
          type="image/webp"
          srcSet="/hero-buyer-bg-800w.webp 800w, /hero-buyer-bg-1280w.webp 1280w, /hero-buyer-bg-1920w.webp 1920w"
          sizes="100vw"
        />
        <img
          src="/hero-buyer-bg-1280w.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 30%' }}
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      {/* Dark overlay for contrast */}
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-2 drop-shadow-sm">Garri, beans, spices &amp; more</h2>
          <p className="text-base text-white/80 mb-4">Source products from verified African wholesale suppliers</p>
          {/* Trust badges */}
          <div className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-white/70">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              Verified wholesalers
            </span>
            <span className="text-white/30">·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              Trade pricing
            </span>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400 pointer-events-none" style={{ width: 18, height: 18 }} />
          <input
            type="text"
            placeholder="Search products, categories or suppliers…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-11 pr-5 py-3.5 text-sm bg-gray-50 border border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:border-primary/50 focus:bg-white focus:ring-2 focus:ring-primary/10 placeholder:text-gray-400 transition-all"
          />
        </div>

        {/* Filter chips — "In stock only" always visible; category chips once populated */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          <button
            onClick={() => setInStockOnly(v => !v)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              inStockOnly
                ? 'bg-green-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-green-500/40 hover:text-green-700'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full inline-block flex-shrink-0 ${inStockOnly ? 'bg-white' : 'bg-green-500'}`} />
            In stock only
          </button>
          {categories.slice(0, 12).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(c => c === cat ? '' : cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedCategory === cat
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-primary/40 hover:text-primary'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && searched && supplierGroups.length === 0 && productHits.length === 0 && (
          <div className="text-center py-10">
            <Store className="h-9 w-9 mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-400">No results found — try a different search</p>
          </div>
        )}

        {!loading && (supplierGroups.length > 0 || productHits.length > 0) && (
          <div className="space-y-5">
            {/* ── Suppliers section ── */}
            {supplierGroups.length > 0 && (
              <div>
                {hasBoth && (
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2 px-1">Suppliers</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {supplierGroups.map(w => (
                    <a
                      key={w.wholesalerId}
                      href={`/w/${w.storeSlug || w.wholesalerId}`}
                      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-primary/25 transition-all group flex gap-3.5 items-start"
                    >
                      {/* Logo / initials */}
                      <div className="flex-shrink-0">
                        {w.logoUrl
                          ? <img src={w.logoUrl} alt={w.businessName} className="h-11 w-11 rounded-xl object-contain bg-gray-50 p-1 border border-gray-100" />
                          : (
                            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center">
                              <span className="text-white font-bold text-sm">{getInitials(w.businessName)}</span>
                            </div>
                          )
                        }
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-gray-900 truncate group-hover:text-primary transition-colors mb-0.5">{w.businessName}</p>
                        {w.city && (
                          <div className="flex items-center gap-1 mb-1.5">
                            <MapPin className="h-3 w-3 text-gray-300 flex-shrink-0" />
                            <span className="text-xs text-gray-400 truncate">{w.city}</span>
                          </div>
                        )}
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                          View Store <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>

                      <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 self-center group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── Products section ── */}
            {productHits.length > 0 && (
              <div>
                {hasBoth && (
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2 px-1">Products</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {productHits.slice(0, 12).map(p => {
                    const storeUrl = query.trim()
                      ? `/w/${p.storeSlug || p.wholesalerId}?q=${encodeURIComponent(query)}`
                      : `/w/${p.storeSlug || p.wholesalerId}`;
                    const thumb = (p.images as string[] | null)?.[0] || p.imageUrl;
                    return (
                      <a
                        key={p.productId}
                        href={storeUrl}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 hover:shadow-md hover:border-primary/25 transition-all group flex gap-3 items-center"
                      >
                        {/* Thumbnail */}
                        <div className="flex-shrink-0 h-10 w-10 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center">
                          {thumb
                            ? <img src={thumb} alt={p.productName} className="h-full w-full object-cover" />
                            : <Package className="h-4 w-4 text-gray-300" />
                          }
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-gray-900 truncate group-hover:text-primary transition-colors leading-tight">{p.productName}</p>
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">{p.businessName}</p>
                          {/* Pack size + stock row */}
                          {(p.packSizeVisible !== false && p.unitsPerPack) || (p.stockVisible === true && p.stock != null) ? (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {p.packSizeVisible !== false && p.unitsPerPack ? (
                                <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-full">
                                  {p.unitsPerPack} units/pack
                                </span>
                              ) : null}
                              {p.stockVisible === true && p.stock != null ? (
                                p.stock > 10 ? (
                                  <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded-full">
                                    In stock
                                  </span>
                                ) : p.stock > 0 ? (
                                  <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                                    {p.stock} left
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                                    Out of stock
                                  </span>
                                )
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </section>
  );
}

interface HomepageWholesaler {
  id: string;
  businessName: string | null;
  logoUrl: string | null;
  logoType: string | null;
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeAudience, setActiveAudience] = useState<'retailer' | 'wholesaler'>('retailer');
  const [homepageWholesalers, setHomepageWholesalers] = useState<HomepageWholesaler[]>([]);

  useCanonical("/");

  const handleGetStarted = () => { window.location.href = "/signup"; };
  const handleLogin = () => { window.location.href = "/login"; };
  const handleCustomerLogin = () => { window.location.href = "/customer-login"; };
  const handleBookDemo = () => { window.open("https://calendly.com/hello-quikpik/30min", "_blank"); };

  useEffect(() => {
    fetch('/api/public/homepage-wholesalers')
      .then(r => r.ok ? r.json() : [])
      .then(data => setHomepageWholesalers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── ANNOUNCEMENT BAR ── */}
      <div className="bg-gray-950 text-gray-300 text-xs py-2.5 px-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
          <span className="flex items-center gap-1.5">
            <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0" />
            Free to set up — no monthly fees to start
          </span>
          <span className="hidden sm:flex items-center gap-1.5">
            <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0" />
            Built for African wholesale businesses
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0" />
            Cancel anytime
          </span>
        </div>
      </div>

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-8 w-8 object-contain" />
            <span className="text-xl font-bold text-primary tracking-tight">Quikpik</span>
          </div>

          {/* Audience toggle — desktop center */}
          <div className="flex-1 flex justify-center">
            <div className="hidden sm:flex rounded-xl bg-gray-100 p-0.5">
              {(['retailer', 'wholesaler'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveAudience(key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    activeAudience === key
                      ? 'bg-white text-gray-950 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {key === 'retailer' ? "I'm a Buyer" : "I'm a Wholesaler"}
                </button>
              ))}
            </div>
          </div>

          {/* Right nav links */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <a href="/blog" className="hidden sm:inline-flex text-sm text-gray-500 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              QuikTips & Insights
            </a>
            <Button variant="ghost" onClick={handleCustomerLogin} className="hidden sm:inline-flex text-sm text-gray-500 hover:text-gray-900 px-3">
              Customer Login
            </Button>
            <Button variant="ghost" onClick={handleLogin} className="hidden sm:inline-flex text-sm text-gray-500 hover:text-gray-900 px-3">
              Wholesaler Login
            </Button>
            <Button onClick={handleGetStarted} className="bg-gray-950 hover:bg-gray-800 text-white text-sm px-5 rounded-lg font-semibold shadow-sm ml-1">
              Start Free <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
            {/* Mobile hamburger */}
            <button
              className="sm:hidden ml-1 p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              onClick={() => setMobileMenuOpen(o => !o)}
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-2">
            {/* Audience toggle — mobile */}
            <div className="flex rounded-xl bg-gray-100 p-0.5 mb-1">
              {(['retailer', 'wholesaler'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => { setActiveAudience(key); setMobileMenuOpen(false); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activeAudience === key ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {key === 'retailer' ? "I'm a Buyer" : "I'm a Wholesaler"}
                </button>
              ))}
            </div>
            <a href="/blog" onClick={() => setMobileMenuOpen(false)} className="flex items-center text-sm text-gray-700 font-medium px-3 py-2.5 rounded-lg hover:bg-gray-50 w-full">
              QuikTips & Insights
            </a>
            <Button variant="ghost" onClick={() => { setMobileMenuOpen(false); handleCustomerLogin(); }} className="justify-start text-sm text-gray-700 w-full">
              Customer Login
            </Button>
            <Button variant="ghost" onClick={() => { setMobileMenuOpen(false); handleLogin(); }} className="justify-start text-sm text-gray-700 w-full">
              Wholesaler Login
            </Button>
          </div>
        )}
      </nav>

      {/* ── MARKETPLACE SEARCH STRIP — buyer only ── */}
      {activeAudience === 'retailer' && (
        <div id="marketplace-search">
          <MarketplaceSearch />
        </div>
      )}

      {/* ── HERO ── */}
      <section className={`overflow-hidden relative flex items-center ${activeAudience === 'wholesaler' ? 'bg-[#0f172a] min-h-[640px]' : 'bg-[#f7f6f2]'}`}>

        {/* Full-bleed warehouse photo — wholesaler only */}
        {activeAudience === 'wholesaler' && (
          <div className="absolute inset-y-0 right-0 w-full sm:w-[58%]">
            <img
              src="/wholesaler-nudge.jpg"
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover object-[center_15%]"
              loading="eager"
            />
            {/* Gradient: solid dark on left → transparent on right */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0f172a] via-[#0f172a]/60 to-transparent" />
            {/* Mobile: extra dark overlay so text above stays legible */}
            <div className="absolute inset-0 sm:hidden bg-[#0f172a]/70" />
          </div>
        )}

        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">

          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

            {activeAudience === 'retailer' ? (
              <>
                {/* RETAILER — Left copy */}
                <div className="flex-1 max-w-xl">
                  <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-7 border border-green-100 tracking-wide uppercase">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Source products from verified African wholesale suppliers
                  </div>

                  <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-gray-950 leading-[1.15] tracking-tight mb-5">
                    Source trade products<br />
                    <span className="text-primary">for your business</span>
                  </h1>

                  <p className="text-gray-500 text-lg mb-8 leading-relaxed max-w-md">
                    Browse thousands of wholesale products from verified African suppliers. Trade prices, low minimums, continent-wide delivery.
                  </p>

                  <div className="flex items-stretch w-fit border border-gray-200 rounded-xl overflow-hidden bg-white mb-8 shadow-sm">
                    {[
                      { value: "100+", label: "Verified suppliers" },
                      { value: "1,000+", label: "Orders processed" },
                      { value: "Free",  label: "To browse" },
                    ].map(({ value, label }, i) => (
                      <div key={i} className={`px-5 py-3 text-left ${i > 0 ? 'border-l border-gray-200' : ''}`}>
                        <p className="text-xl font-extrabold text-gray-950 leading-none mb-0.5">{value}</p>
                        <p className="text-xs text-gray-500">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 mb-7">
                    <Button
                      onClick={() => document.getElementById('marketplace-search')?.scrollIntoView({ behavior: 'smooth' })}
                      size="lg"
                      className="text-base px-8 py-6 bg-gray-950 hover:bg-gray-800 text-white rounded-lg font-semibold"
                    >
                      Browse Suppliers <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                    <Button
                      onClick={handleCustomerLogin}
                      size="lg"
                      variant="outline"
                      className="text-base px-8 py-6 rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 font-medium"
                    >
                      Sign in
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> Free to browse
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> Verified African suppliers
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> Trade prices
                    </span>
                  </div>
                </div>

                {/* BUYER — Right photo */}
                <div className="flex-shrink-0 w-full max-w-xs sm:max-w-sm lg:max-w-md mx-auto lg:mx-0">
                  <div className="relative rounded-2xl overflow-hidden shadow-2xl aspect-[4/5]">
                    <picture>
                      <source
                        type="image/webp"
                        srcSet="/hero-buyer-400w.webp 400w, /hero-buyer-800w.webp 800w"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 384px, 448px"
                      />
                      <img
                        src="/hero-buyer-800w.jpg"
                        alt="Buyer browsing wholesale products"
                        className="w-full h-full object-cover object-center"
                        width="448"
                        height="560"
                        fetchPriority="high"
                        decoding="async"
                      />
                    </picture>
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-950/30 via-transparent to-transparent" />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* WHOLESALER — Left copy */}
                <div className="flex-1 max-w-xl">
                  <div className="inline-flex items-center gap-2 bg-green-900/60 text-green-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-7 border border-green-800/60 tracking-wide uppercase">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Built for African businesses
                  </div>

                  <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-white leading-[1.15] tracking-tight mb-5">
                    Run your wholesale business<br />
                    <span className="text-primary">without the chaos</span>
                  </h1>

                  <p className="text-gray-300 text-lg mb-8 leading-relaxed max-w-md">
                    Manage stock, send invoices, track payments, and grow faster — all in one place.
                  </p>

                  <div className="flex items-stretch w-fit border border-white/20 rounded-xl overflow-hidden bg-white mb-8 shadow-sm">
                    {[
                      { value: "100+", label: "African wholesalers" },
                      { value: "1,000+", label: "Orders processed" },
                      { value: "Free", label: "To get started" },
                    ].map(({ value, label }, i) => (
                      <div key={i} className={`px-5 py-3 text-left ${i > 0 ? 'border-l border-gray-200' : ''}`}>
                        <p className="text-xl font-extrabold text-gray-950 leading-none mb-0.5">{value}</p>
                        <p className="text-xs text-gray-500">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 mb-7">
                    <Button
                      onClick={handleGetStarted}
                      size="lg"
                      className="text-base px-8 py-6 bg-primary hover:bg-primary/90 text-white rounded-lg font-semibold shadow-lg shadow-primary/30"
                    >
                      Start Free <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                    <Button
                      onClick={handleBookDemo}
                      size="lg"
                      variant="outline"
                      className="text-base px-8 py-6 rounded-lg border-2 border-white/25 text-white bg-transparent hover:bg-white/10 hover:border-white/40 font-medium"
                    >
                      Book a Demo
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> Free to start
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> No credit card
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> Cancel anytime
                    </span>
                  </div>
                </div>

              </>
            )}

          </div>
        </div>
      </section>

      {/* ── WHOLESALER SECTIONS ── */}
      {activeAudience === 'wholesaler' && (
        <section className="bg-white border-b border-gray-100 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">

              {/* Left — dashboard mockup */}
              <div className="flex-shrink-0 w-full max-w-sm mx-auto lg:mx-0">
                <DashboardMockup />
              </div>

              {/* Right — heading + feature cards */}
              <div className="flex-1 w-full">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 tracking-tight">Everything in one dashboard</h2>
                <p className="text-gray-500 text-sm mb-8">No more juggling apps. Run your whole business from one place.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { icon: Box,         title: "Inventory Management",  desc: "Track stock in real time and never oversell." },
                    { icon: ReceiptText, title: "Invoicing",             desc: "Create and send professional invoices in seconds." },
                    { icon: UserCheck,   title: "Customer Management",   desc: "Manage customers, balances and order history." },
                    { icon: Wallet,      title: "Payment Tracking",      desc: "Track payments and get paid faster, every time." },
                  ].map(({ icon: Icon, title, desc }, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-4 p-5 rounded-2xl bg-gray-50 border border-gray-100 group hover:bg-white hover:shadow-sm hover:border-gray-200 transition-all duration-200"
                    >
                      <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 group-hover:border-gray-300 transition-colors">
                        <Icon className="text-gray-500" style={{ width: 17, height: 17 }} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{title}</h3>
                        <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </section>
      )}

      {/* ── WHOLESALER-ONLY SECTIONS ── */}
      {activeAudience === 'wholesaler' && (
        <>
          {/* ── PROBLEM ── */}
          <section className="py-16 sm:py-24 bg-gray-50">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 tracking-tight">
                Still running your business like this?
              </h2>
              <p className="text-gray-500 text-lg mb-12">Sound familiar? You're not alone.</p>
              <div className="grid sm:grid-cols-2 gap-3 text-left max-w-2xl mx-auto">
                {[
                  { icon: MessageSquare, text: "Taking orders over WhatsApp and writing them down manually" },
                  { icon: CreditCard,    text: "Chasing payments long after goods have left the door" },
                  { icon: Package,       text: "Managing stock levels in a spreadsheet that's always out of date" },
                  { icon: Users,         text: "Sending individual price lists to every single customer by hand" },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-start gap-4 bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm transition-all">
                    <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="h-4.5 w-4.5 text-red-400" style={{ width: 18, height: 18 }} />
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
              <p className="mt-10 text-gray-500 text-base">
                There's a better way. <span className="text-gray-900 font-semibold">Quikpik handles all of it for you.</span>
              </p>
            </div>
          </section>

          {/* ── BENEFITS ── */}
          <section className="py-16 sm:py-24 bg-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="text-center mb-12">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
                  Everything you need to run your wholesale business
                </h2>
                <p className="text-gray-500 text-lg max-w-xl mx-auto leading-relaxed">
                  One platform replaces the calls, the spreadsheets, and the back-and-forth.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[
                  { icon: ShoppingBag, color: "bg-blue-50 text-blue-600",   title: "Instant Online Ordering",      desc: "Customers browse your live catalogue and place orders any time — no calls, no manual entry." },
                  { icon: CreditCard,  color: "bg-green-50 text-green-600", title: "Custom Pricing Per Customer",  desc: "Set different price lists for different buyers. Each customer sees their own personalised rates." },
                  { icon: FileText,    color: "bg-purple-50 text-purple-600", title: "Quotes → Payment in One Flow", desc: "Create a quote, send a payment link, and get paid instantly. No follow-up calls needed." },
                  { icon: Package,     color: "bg-orange-50 text-orange-600", title: "Real-Time Stock Control",     desc: "Inventory updates automatically with every order. Low-stock alerts stop you overselling." },
                  { icon: Lock,        color: "bg-rose-50 text-rose-600",    title: "Pay Now or Pay Later",         desc: "Offer trusted customers the option to buy on account while others pay by card." },
                  { icon: Phone,       color: "bg-teal-50 text-teal-600",    title: "SMS & WhatsApp Ready",         desc: "Send confirmations and payment links via the channels your customers already use." },
                ].map(({ icon: Icon, color, title, desc }, i) => (
                  <Card key={i} className="p-7 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* ── HOW IT WORKS ── */}
          <section className="py-16 sm:py-24 bg-gray-50">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
                Up and running in minutes
              </h2>
              <p className="text-gray-500 text-lg mb-14">Three steps. No technical setup required.</p>
              <div className="grid sm:grid-cols-3 gap-6 sm:gap-10 relative">
                <div className="hidden sm:block absolute top-7 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px bg-gray-200 z-0" />
                {[
                  { step: "1", title: "Set up your store",          desc: "Add your products, pricing, and delivery options in minutes." },
                  { step: "2", title: "Share your link",             desc: "Send your store link to customers via WhatsApp, SMS, or email." },
                  { step: "3", title: "Receive orders and get paid", desc: "Customers order online. Payments land directly in your account." },
                ].map(({ step, title, desc }, i) => (
                  <div key={i} className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-14 h-14 bg-gray-950 text-white text-xl font-extrabold rounded-2xl flex items-center justify-center mb-5 ring-4 ring-gray-50">
                      {step}
                    </div>
                    <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── PRICING ── */}
          <section className="py-16 sm:py-24 bg-white">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
                Start free. Only pay when you get paid.
              </h2>
              <p className="text-gray-500 text-lg mb-12">Simple, honest pricing with no surprises.</p>
              <div className="grid sm:grid-cols-3 gap-4 mb-10">
                {[
                  { icon: CheckCircle, color: "text-green-600",  bg: "bg-green-50",  border: "border-green-100",  title: "Free to start",                  desc: "Full access on the free plan. No credit card needed." },
                  { icon: CreditCard,  color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-100",   title: "Small fee on card payments",    desc: "Only pay on card orders — cash and Pay Later are always free." },
                  { icon: Shield,      color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100", title: "Offline orders are 100% yours", desc: "Cash, Pay Later, and offline orders have no platform fee." },
                ].map(({ icon: Icon, color, bg, border, title, desc }, i) => (
                  <div key={i} className={`${bg} border ${border} rounded-2xl p-6 text-left`}>
                    <Icon className={`h-7 w-7 ${color} mb-4`} />
                    <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
              <Button onClick={handleGetStarted} size="lg" className="bg-primary hover:bg-primary/90 text-base px-10 py-6 rounded-xl shadow-lg shadow-primary/25 font-semibold">
                Start Free Today <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-xs text-gray-400 mt-4">No credit card required · Cancel anytime</p>
            </div>
          </section>

          {/* ── COMPARISON ── */}
          <section className="py-16 sm:py-24 bg-gray-50">
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
              <div className="text-center mb-12">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
                  Stop paying for tools that don't work
                </h2>
                <p className="text-gray-500 text-lg">See how Quikpik stacks up against the old way.</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="grid grid-cols-3 text-xs sm:text-sm font-semibold border-b border-gray-100 bg-gray-50/60">
                  <div className="col-span-1 p-3 sm:p-4 text-gray-400" />
                  <div className="p-3 sm:p-4 text-center text-gray-400 border-l border-gray-100">Old way</div>
                  <div className="p-3 sm:p-4 text-center text-primary font-bold border-l border-gray-100">Quikpik</div>
                </div>
                {[
                  { label: "Monthly cost",     old: "200–500+/month",   new: "Free to start" },
                  { label: "Taking orders",    old: "Manual",           new: "Automated online" },
                  { label: "Payments",         old: "Chasing invoices", new: "Instant card payments" },
                  { label: "Stock tracking",   old: "Spreadsheets",     new: "Real-time, automatic" },
                  { label: "Customer pricing", old: "Sent manually",    new: "Custom price lists" },
                  { label: "Contracts",        old: "Annual lock-in",   new: "Cancel anytime" },
                ].map(({ label, old, new: newVal }, i) => (
                  <div key={i} className={`grid grid-cols-3 text-xs sm:text-sm border-b border-gray-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <div className="p-3 sm:p-4 font-medium text-gray-600">{label}</div>
                    <div className="p-3 sm:p-4 text-center text-gray-400 border-l border-gray-100">{old}</div>
                    <div className="p-3 sm:p-4 text-center text-primary font-semibold border-l border-gray-100 flex items-center justify-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" /> {newVal}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── FINAL CTA ── */}
          <section className="py-20 sm:py-28 bg-gradient-to-br from-primary to-green-600 text-white text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.08),transparent_60%)]" />
            <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-5 leading-tight tracking-tight">
                Start taking orders today
              </h2>
              <p className="text-green-100 text-lg mb-10 leading-relaxed">
                Join African wholesale businesses already using Quikpik to run smarter.
              </p>
              <Button
                onClick={handleGetStarted}
                size="lg"
                className="bg-white text-primary hover:bg-gray-50 text-base font-bold px-10 py-6 rounded-xl shadow-2xl"
              >
                Start Free <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-green-200/80 text-sm mt-5">No credit card required · Free plan available · Cancel anytime</p>
            </div>
          </section>
        </>
      )}

      {/* ── RETAILER-ONLY SECTIONS ── */}
      {activeAudience === 'retailer' && (
        <>
          {/* ── HOW TO ORDER ── */}
          <section className="py-16 sm:py-24 bg-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
                How to order
              </h2>
              <p className="text-gray-500 text-lg mb-14">Five simple steps from browse to delivery.</p>
              <div className="grid sm:grid-cols-5 gap-6 sm:gap-6 relative">
                <div className="hidden sm:block absolute top-7 left-[calc(10%+1.5rem)] right-[calc(10%+1.5rem)] h-px bg-gray-200 z-0" />
                {[
                  { icon: Search,       step: "STEP 1", title: "Request access",            desc: "Find your supplier's store and submit a quick registration request to join." },
                  { icon: ShoppingCart, step: "STEP 2", title: "Get approved",              desc: "Your supplier reviews your request and approves your account — usually within hours." },
                  { icon: ShoppingBag,  step: "STEP 3", title: "Order or get invoiced",     desc: "Browse the catalogue and place your own order — or your supplier can create and send you an invoice directly." },
                  { icon: Wallet,       step: "STEP 4", title: "Pay your way",              desc: "Settle by card at checkout, bank transfer, or via a payment link sent by your supplier. Pay Later available if offered." },
                  { icon: Package,      step: "STEP 5", title: "Supplier delivers",         desc: "Your supplier confirms and arranges delivery or collection to you." },
                ].map(({ icon: Icon, step, title, desc }, i) => (
                  <div key={i} className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4 ring-4 ring-white">
                      <Icon className="h-6 w-6 text-gray-500" />
                    </div>
                    <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">{step}</p>
                    <h3 className="text-sm font-extrabold text-gray-900 mb-2 tracking-tight">{title}</h3>
                    <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── FAQ ── */}
          <section className="py-16 sm:py-24 bg-gray-50">
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
              <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
                {/* Left label */}
                <div className="lg:w-56 flex-shrink-0">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight leading-tight mb-3">
                    Frequently asked questions
                  </h2>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Can't find what you're looking for? <button onClick={handleCustomerLogin} className="text-primary font-medium hover:underline">Sign in</button> to reach your supplier directly.
                  </p>
                </div>
                {/* Right accordion */}
                <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm px-6 divide-y divide-gray-100">
                  {[
                    { q: "How does the ordering process work?",       a: "It depends on how your supplier has set up their store. If prices are shown: browse products, add to your cart, and request your order — the wholesaler confirms and sends you an invoice to pay. If no prices are shown: add items to your cart to request a trade price quote, and the wholesaler will follow up with a personalised offer. Either way, prices displayed are indicative and subject to final confirmation by the wholesaler." },
                    { q: "Where will my goods come from?",            a: "Your order is fulfilled directly by the African wholesaler whose store you're shopping from. Suppliers ship across the continent — delivery areas are confirmed at checkout." },
                    { q: "Do prices include tax?",                    a: "Prices shown are trade prices. Any applicable taxes or duties vary by country and are shown clearly at checkout before you confirm your order." },
                    { q: "What is a minimum order quantity (MOQ)?",   a: "Some products require a minimum number of units per order. The MOQ is shown on each product card and is set by the supplier." },
                    { q: "Can I order from multiple suppliers?",      a: "Yes — you can browse and place orders with any supplier on the Quikpik network. Each order is processed separately per supplier." },
                    { q: "What if I have an issue with my order?",    a: "Contact your supplier directly through the store, or reach Quikpik support. We aim to resolve all order issues within 24 hours." },
                  ].map(({ q, a }) => (
                    <FAQItem key={q} question={q} answer={a} />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── TRUSTED BY LOGO STRIP ── */}
          <section className="py-8 bg-[#f7f8fa] border-t border-gray-100">
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">
                Trusted by growing wholesalers
              </p>
              <div className="flex items-center justify-center gap-6 flex-wrap">
                {homepageWholesalers.length > 0 ? (
                  homepageWholesalers.map(w => (
                    <div key={w.id} className="flex flex-col items-center gap-1.5">
                      {w.logoUrl ? (
                        <img
                          src={w.logoUrl}
                          alt={w.businessName || 'Wholesaler'}
                          className="w-16 h-16 rounded-xl object-contain"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-primary/10 ring-2 ring-white shadow-sm flex items-center justify-center">
                          <span className="text-primary text-lg font-bold">
                            {(w.businessName || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="text-xs text-gray-500 font-medium">{w.businessName || 'Wholesaler'}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-1.5">
                      <img
                        src="/wholesaler-banner.jpg"
                        alt="Plota Foods"
                        className="w-16 h-16 rounded-xl object-contain"
                      />
                      <span className="text-xs text-gray-500 font-medium">Plota Foods</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 opacity-40 select-none">
                      <div className="w-16 h-16 rounded-full bg-gray-200 ring-2 ring-white shadow-sm flex items-center justify-center">
                        <span className="text-gray-400 text-lg font-bold">+</span>
                      </div>
                      <span className="text-xs text-gray-400 font-medium">Your brand</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* ── WHOLESALER NUDGE ── */}
          <section className="py-12 bg-[#f7f8fa]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                {/* Warehouse photo — above on mobile, left on desktop */}
                <div className="lg:w-2/5 flex-shrink-0 rounded-2xl overflow-hidden">
                  <img
                    src="/wholesaler-nudge.jpg"
                    alt="Wholesaler warehouse"
                    className="w-full h-64 lg:h-full object-cover object-[center_15%]"
                  />
                </div>
                {/* Banner card */}
                <div className="flex-1 flex items-center gap-4 bg-white border border-gray-200 rounded-2xl shadow-sm px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-base">Are you a wholesale supplier?</p>
                    <p className="text-gray-500 text-base leading-snug">List your products, manage orders, and reach more buyers — free to get started.</p>
                  </div>
                  <Button
                    onClick={handleGetStarted}
                    variant="outline"
                    className="flex-shrink-0 border-gray-300 text-gray-800 hover:border-gray-400 text-sm font-semibold px-5 rounded-xl"
                  >
                    Start selling <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ── FOOTER ── */}
      <footer className="py-8 bg-gray-950 text-gray-500 text-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-6 w-6 object-contain" />
            <span className="text-white font-bold tracking-tight">Quikpik</span>
          </div>
          <p className="text-gray-600">© {new Date().getFullYear()} Quikpik. All rights reserved.</p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <a href="/blog" className="hover:text-gray-300 transition-colors">QuikTips & Insights</a>
            <button onClick={handleCustomerLogin} className="hover:text-gray-300 transition-colors">Customer Login</button>
            <button onClick={handleLogin} className="hover:text-gray-300 transition-colors">Wholesaler Login</button>
            <button onClick={handleGetStarted} className="hover:text-white text-gray-400 transition-colors font-medium">Sign Up Free</button>
          </div>
        </div>
      </footer>

    </div>
  );
}
