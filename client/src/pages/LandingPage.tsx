import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  FileText,
  CheckCircle,
  Shield,
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  ChevronRight,
  Menu,
  X,
  Box,
  ReceiptText,
  UserCheck,
  Wallet,
  Search,
  Store,
  MapPin,
  Package,
  BarChart3,
  Layers,
  Star,
  Truck,
  Globe,
  Building2,
  ShoppingBag,
  Users,
  Zap,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Floating stat card — used in the hero
// ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-xl min-w-[148px]">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <p className="text-white font-bold text-lg leading-none mb-0.5">{value}</p>
      <p className="text-white/60 text-[11px]">{label}</p>
      <p className="text-green-400 text-[10px] mt-1 font-medium">{sub}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dashboard UI mockup — inside the hero
// ─────────────────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full text-gray-900 select-none">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <img src="/quikpik-logo.png" alt="" className="h-5 w-5 object-contain" />
          <span className="font-bold text-sm text-gray-900">Quikpik</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          <div className="w-2 h-2 rounded-full bg-green-400" />
        </div>
      </div>
      <div className="p-4">
        <div className="mb-3">
          <p className="font-semibold text-xs text-gray-900">Good morning, John 👋</p>
          <p className="text-[10px] text-gray-400">Here's your business at a glance</p>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-primary rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/80 text-[10px]">Total Sales</span>
              <TrendingUp className="h-3 w-3 text-white/70" />
            </div>
            <p className="text-white font-bold text-sm">£12,450</p>
            <p className="text-white/70 text-[10px]">+18% this month</p>
          </div>
          <div className="bg-amber-400 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-amber-900/80 text-[10px]">Amount Owed</span>
              <ReceiptText className="h-3 w-3 text-amber-900/60" />
            </div>
            <p className="text-amber-900 font-bold text-sm">£4,820</p>
            <p className="text-amber-900/70 text-[10px]">12 unpaid invoices</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-500 text-[10px]">Total Orders</span>
              <ShoppingCart className="h-3 w-3 text-gray-400" />
            </div>
            <p className="text-gray-900 font-bold text-sm">126</p>
            <p className="text-green-600 text-[10px]">+10% this week</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-500 text-[10px]">Low Stock</span>
              <AlertTriangle className="h-3 w-3 text-amber-400" />
            </div>
            <p className="text-gray-900 font-bold text-sm">6 items</p>
            <p className="text-primary text-[10px]">Reorder needed</p>
          </div>
        </div>
        <div className="space-y-1.5">
          {[
            { id: "INV-051", status: "Paid", color: "text-green-600", date: "10 May" },
            { id: "INV-050", status: "Paid", color: "text-green-600", date: "10 May" },
            { id: "INV-049", status: "Unpaid", color: "text-red-500", date: "9 May" },
          ].map(({ id, status, color, date }) => (
            <div key={id} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-gray-100 rounded flex items-center justify-center">
                  <FileText className="h-2.5 w-2.5 text-gray-400" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-800">#{id}</p>
                  <p className={`text-[9px] ${color}`}>{status}</p>
                </div>
              </div>
              <span className="text-[9px] text-gray-400">{date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Marketplace search — full redesigned section
// ─────────────────────────────────────────────────────────────
interface SearchResult {
  productId: number;
  productName: string;
  category?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  price: string;
  minOrderQuantity?: number | null;
  wholesalerId: string;
  businessName: string;
  storeSlug?: string | null;
  logoUrl?: string | null;
  priceDisplayMode: string;
  city?: string | null;
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
      map.set(r.wholesalerId, { wholesalerId: r.wholesalerId, businessName: r.businessName, storeSlug: r.storeSlug, logoUrl: r.logoUrl, city: r.city, products: [] });
    }
    const g = map.get(r.wholesalerId)!;
    if (!g.products.includes(r.productName)) g.products.push(r.productName);
  }
  return Array.from(map.values()).slice(0, 12);
}

const FIXED_CATEGORIES = ['Drinks', 'African Groceries', 'Frozen Foods', 'Cosmetics', 'Household'];

function MarketplaceSearch() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = async (q: string, cat: string) => {
    if (!q && !cat) { setResults([]); setSearched(false); return; }
    setLoading(true); setSearched(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (cat) params.set('category', cat);
      const res = await fetch(`/api/public/search?${params}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query, selectedCategory), 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, selectedCategory]);

  const wholesalers = groupByWholesaler(results);
  const hasContent = searched || query || selectedCategory;

  return (
    <section className="relative bg-gray-950 py-16 sm:py-24 overflow-hidden" aria-labelledby="discovery-heading">
      {/* subtle green glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(22,163,74,0.12),transparent)]" aria-hidden="true" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 bg-green-900/50 text-green-400 text-xs font-semibold px-4 py-2 rounded-full mb-5 border border-green-800/50">
            <Globe className="h-3.5 w-3.5" /> Wholesale Supplier Discovery
          </span>
          <h2 id="discovery-heading" className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Discover wholesalers and products
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Search products and connect directly with verified UK wholesalers — including FMCG, African food suppliers, and distributors.
          </p>
        </div>

        {/* Search bar */}
        <div className="max-w-2xl mx-auto relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="search"
            placeholder="Search products, categories or suppliers…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 text-sm rounded-2xl bg-white/10 border border-white/20 text-white placeholder-gray-400 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {FIXED_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(c => c === cat ? '' : cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedCategory === cat
                  ? 'bg-primary text-white shadow-lg shadow-primary/30'
                  : 'bg-white/10 text-gray-300 border border-white/20 hover:bg-white/20 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && searched && wholesalers.length === 0 && (
          <div className="text-center py-10">
            <Store className="h-10 w-10 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400 text-sm">No suppliers found — try a different search</p>
          </div>
        )}
        {!loading && wholesalers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wholesalers.map(w => (
              <a
                key={w.wholesalerId}
                href={`/w/${w.storeSlug || w.wholesalerId}${query ? `?q=${encodeURIComponent(query)}` : ''}`}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 hover:border-primary/40 transition-all group flex gap-4 items-start backdrop-blur-sm"
              >
                <div className="flex-shrink-0">
                  {w.logoUrl
                    ? <img src={w.logoUrl} alt={w.businessName} className="h-12 w-12 rounded-xl object-contain bg-white/10 p-1" />
                    : <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center"><span className="text-white font-bold text-sm">{getInitials(w.businessName)}</span></div>
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-white truncate group-hover:text-primary transition-colors">{w.businessName}</p>
                  {w.city && (
                    <div className="flex items-center gap-1 mt-0.5 mb-1.5">
                      <MapPin className="h-3 w-3 text-gray-500 flex-shrink-0" />
                      <span className="text-xs text-gray-400 truncate">{w.city}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {w.products.slice(0, 3).map(name => (
                      <span key={name} className="bg-white/10 text-gray-300 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[120px]">{name}</span>
                    ))}
                    {w.products.length > 3 && (
                      <span className="bg-white/10 text-gray-400 text-[10px] px-2 py-0.5 rounded-full">+{w.products.length - 3} more</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0 self-center group-hover:text-primary transition-colors" />
              </a>
            ))}
          </div>
        )}
        {!hasContent && (
          <p className="text-center text-xs text-gray-500 mt-2">Start typing to search across all public UK wholesale stores</p>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const handleGetStarted = () => { window.location.href = "/signup"; };
  const handleLogin = () => { window.location.href = "/login"; };
  const handleCustomerLogin = () => { window.location.href = "/customer-login"; };
  const handleBookDemo = () => { window.open("https://calendly.com/hello-quikpik/30min", "_blank"); };

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-gray-950/95 backdrop-blur-sm border-b border-white/10" role="navigation" aria-label="Main navigation">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-8 w-8 object-contain" />
            <span className="text-xl font-bold text-white">Quikpik</span>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <a href="/blog" className="text-sm text-gray-400 hover:text-white font-medium px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              QuikTips & Insights
            </a>
            <button onClick={handleCustomerLogin} className="text-sm text-gray-400 hover:text-white font-medium px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              Customer Login
            </button>
            <button onClick={handleLogin} className="text-sm text-gray-400 hover:text-white font-medium px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              Wholesaler Login
            </button>
            <Button onClick={handleGetStarted} className="ml-2 bg-primary hover:bg-primary/90 text-sm px-5 rounded-lg shadow-lg shadow-primary/20">
              Start Free <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
          <button
            className="sm:hidden p-2 rounded-lg text-gray-400 hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-white/10 bg-gray-950 px-4 py-3 flex flex-col gap-1">
            <a href="/blog" className="text-sm text-gray-300 font-medium px-3 py-2.5 rounded-lg hover:bg-white/10 w-full block">QuikTips & Insights</a>
            <button onClick={() => { setMobileMenuOpen(false); handleCustomerLogin(); }} className="text-left text-sm text-gray-300 font-medium px-3 py-2.5 rounded-lg hover:bg-white/10 w-full">Customer Login</button>
            <button onClick={() => { setMobileMenuOpen(false); handleLogin(); }} className="text-left text-sm text-gray-300 font-medium px-3 py-2.5 rounded-lg hover:bg-white/10 w-full">Wholesaler Login</button>
            <Button onClick={handleGetStarted} className="mt-1 w-full bg-primary hover:bg-primary/90">Start Free <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="relative bg-gray-950 overflow-hidden" aria-labelledby="hero-heading">
        {/* Background */}
        <div className="absolute inset-0">
          <img src="/hero-warehouse.jpg" alt="" aria-hidden="true" className="w-full h-full object-cover object-center opacity-30" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-950/80 via-gray-950/60 to-gray-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(22,163,74,0.15),transparent)]" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-8 sm:pt-28 sm:pb-12">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <span className="inline-flex items-center gap-2 bg-green-900/50 text-green-400 text-xs font-semibold px-5 py-2.5 rounded-full border border-green-800/50">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" aria-hidden="true" />
              Built for UK wholesale businesses
            </span>
          </div>

          {/* Headline */}
          <div className="text-center max-w-4xl mx-auto mb-6">
            <h1 id="hero-heading" className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.08] tracking-tight mb-6">
              Run and grow your<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-green-400">wholesale business</span><br />
              in one place
            </h1>
            <p className="text-gray-300 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto">
              Wholesale inventory software, invoicing, order management, and supplier discovery — all unified for modern UK wholesalers.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <Button onClick={handleGetStarted} size="lg" className="text-base px-8 py-6 bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/30 font-semibold">
              Start Free <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button onClick={handleBookDemo} size="lg" variant="outline" className="text-base px-8 py-6 rounded-xl border-2 border-white/25 text-white bg-transparent hover:bg-white/10 hover:border-white/40 font-semibold">
              Book Demo
            </Button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 justify-center text-sm text-gray-400 mb-16">
            <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" /> Built for UK wholesalers</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" /> Used by growing FMCG businesses</span>
          </div>

          {/* Dashboard + floating stats */}
          <div className="relative max-w-3xl mx-auto">
            {/* Floating stat cards — above and on sides */}
            <div className="hidden sm:flex absolute -top-6 -left-8 z-20">
              <StatCard icon={TrendingUp} label="Monthly Revenue" value="£48,200" sub="↑ 22% vs last month" color="bg-primary" />
            </div>
            <div className="hidden sm:flex absolute -top-6 -right-8 z-20">
              <StatCard icon={AlertTriangle} label="Stock Alerts" value="3 items" sub="Needs reorder" color="bg-amber-500" />
            </div>
            <div className="hidden md:flex absolute -bottom-4 -left-6 z-20">
              <StatCard icon={CheckCircle} label="Invoices Paid" value="£6,450" sub="↑ 5 this week" color="bg-blue-500" />
            </div>
            <div className="hidden md:flex absolute -bottom-4 -right-6 z-20">
              <StatCard icon={ShoppingCart} label="Active Orders" value="34" sub="12 pending dispatch" color="bg-purple-500" />
            </div>

            {/* Dashboard mockup */}
            <div className="relative z-10 mx-4 sm:mx-8">
              <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-white/10">
                <DashboardMockup />
              </div>
            </div>
          </div>

          {/* Bottom gradient fade into next section */}
          <div className="h-16 sm:h-24" />
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="bg-white py-20 sm:py-28 border-b border-gray-100" aria-labelledby="features-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 bg-green-50 text-primary text-xs font-semibold px-4 py-2 rounded-full mb-5 border border-green-100">
              <Zap className="h-3.5 w-3.5" /> Platform Features
            </span>
            <h2 id="features-heading" className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              Everything you need to run<br className="hidden sm:block" /> your wholesale business
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              From batch stock management and wholesale invoicing to customer management and order fulfilment — Quikpik is your operating system.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Box,
                color: "bg-blue-50 text-blue-600",
                title: "Inventory & Batch Tracking",
                desc: "Real-time wholesale inventory software with batch tracking, expiry alerts, and automatic stock decrementation on orders. Never oversell or run out of stock again.",
                badge: "Core",
              },
              {
                icon: ReceiptText,
                color: "bg-green-50 text-green-600",
                title: "Invoicing & Payments",
                desc: "Wholesale invoicing software that generates professional invoices instantly, collects Stripe card payments, and tracks outstanding balances automatically.",
                badge: "Popular",
              },
              {
                icon: Truck,
                color: "bg-purple-50 text-purple-600",
                title: "Orders & Fulfilment",
                desc: "Manage wholesale orders from receipt through dispatch with status tracking, multi-location collection, and automated customer notifications.",
                badge: null,
              },
              {
                icon: UserCheck,
                color: "bg-amber-50 text-amber-600",
                title: "Customer Management",
                desc: "Maintain individual customer profiles, custom price lists, order history, and outstanding balances — all in one place for FMCG and wholesale operations.",
                badge: null,
              },
              {
                icon: BarChart3,
                color: "bg-rose-50 text-rose-600",
                title: "Analytics & Revenue",
                desc: "Track revenue, margins, top-selling products, and customer performance with a live business intelligence dashboard designed for wholesale distributors.",
                badge: null,
              },
              {
                icon: Globe,
                color: "bg-teal-50 text-teal-600",
                title: "Wholesale Discovery",
                desc: "List your store on the Quikpik marketplace so retailers, restaurants, and businesses can discover and contact you directly — no cold calling needed.",
                badge: "New",
              },
            ].map(({ icon: Icon, color, title, desc, badge }) => (
              <div key={title} className="group relative bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:border-gray-200 transition-all duration-300">
                {badge && (
                  <span className="absolute top-4 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{badge}</span>
                )}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-gray-900 text-base mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DISCOVERY / MARKETPLACE ── */}
      <MarketplaceSearch />

      {/* ── BUILT FOR WHOLESALERS ── */}
      <section className="bg-gray-50 py-20 sm:py-24 border-b border-gray-100" aria-labelledby="built-for-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 id="built-for-heading" className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Built for every type of wholesaler</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">Whether you're a large distributor or an independent supplier, Quikpik fits the way you work.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { icon: Package, label: "FMCG Wholesalers", desc: "Fast-moving consumer goods at scale" },
              { icon: ShoppingBag, label: "African Food Suppliers", desc: "African & Caribbean groceries, snacks, and drinks" },
              { icon: Layers, label: "Distributors", desc: "Multi-SKU warehouse and distribution operations" },
              { icon: Building2, label: "Cash & Carry", desc: "Bulk sales, walk-in pricing, and order management" },
              { icon: Store, label: "Independent Wholesalers", desc: "Small and growing wholesale businesses" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 text-center hover:shadow-md hover:border-primary/20 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-green-50 group-hover:bg-primary/10 flex items-center justify-center mx-auto mb-4 transition-colors">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">{label}</p>
                <p className="text-gray-400 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="bg-white py-20 sm:py-24 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Up and running in minutes</h2>
          <p className="text-gray-500 text-lg mb-14">No complicated onboarding. No annual contracts.</p>
          <div className="grid sm:grid-cols-3 gap-8 relative">
            <div className="hidden sm:block absolute top-8 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
            {[
              { step: "1", title: "Set up your store", desc: "Add your products, pricing, and delivery options in minutes." },
              { step: "2", title: "Share your link", desc: "Send your store link to customers via WhatsApp, SMS, or email." },
              { step: "3", title: "Receive orders and get paid", desc: "Customers order online. Payments land directly in your account." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="relative z-10 flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-primary text-white text-xl font-extrabold rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-primary/25">{step}</div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="bg-gray-50 py-20 sm:py-24 border-b border-gray-100" aria-label="Customer testimonials">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Trusted by growing UK wholesalers</h2>
            <p className="text-gray-500 text-lg">Real businesses. Real results.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { quote: "Quikpik completely replaced our spreadsheets. Orders, invoices, stock — all in one place. We save hours every week.", name: "M. Okafor", biz: "African Food Distributor, Birmingham", initials: "MO" },
              { quote: "The batch tracking alone was worth switching. We can see exactly what's expiring and reorder before we run out.", name: "S. Patel", biz: "FMCG Wholesaler, London", initials: "SP" },
              { quote: "Customers love that they can see their prices and order directly. It's made our operation so much more professional.", name: "D. Williams", biz: "Cash & Carry, Manchester", initials: "DW" },
            ].map(({ quote, name, biz, initials }) => (
              <div key={name} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-5">"{quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{initials}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{name}</p>
                    <p className="text-xs text-gray-400">{biz}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="py-20 sm:py-24 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Simple, honest pricing</h2>
          <p className="text-gray-500 text-lg mb-12">Start free. Only pay when you get paid.</p>
          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {[
              { icon: CheckCircle, color: "text-green-500", bg: "bg-green-50", title: "£0/month to start", desc: "Full access on the free plan. No credit card needed." },
              { icon: Wallet, color: "text-blue-500", bg: "bg-blue-50", title: "Small fee on card payments", desc: "Only pay on card orders — cash and Pay Later orders are always free." },
              { icon: Shield, color: "text-purple-500", bg: "bg-purple-50", title: "Offline orders are 100% yours", desc: "Cash, Pay Later, and offline orders have no platform fee." },
            ].map(({ icon: Icon, color, bg, title, desc }) => (
              <div key={title} className={`${bg} rounded-2xl p-6 text-left`}>
                <Icon className={`h-8 w-8 ${color} mb-4`} />
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm">{desc}</p>
              </div>
            ))}
          </div>
          <Button onClick={handleGetStarted} size="lg" className="bg-primary hover:bg-primary/90 text-base px-10 py-6 rounded-xl shadow-lg shadow-primary/20">
            Start Free Today <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-xs text-gray-400 mt-4">No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ── VS TABLE ── */}
      <section className="py-20 sm:py-24 bg-gray-50 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Stop paying for tools that don't work</h2>
            <p className="text-gray-500 text-lg">See how Quikpik compares to the old way of running wholesale.</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-3 text-xs sm:text-sm font-semibold border-b border-gray-100">
              <div className="col-span-1 p-3 sm:p-5 text-gray-400" />
              <div className="p-3 sm:p-5 text-center text-gray-400 border-l border-gray-100">Traditional</div>
              <div className="p-3 sm:p-5 text-center text-primary border-l border-gray-100">Quikpik</div>
            </div>
            {[
              { label: "Monthly cost",      old: "£200–£500+",       nw: "Free to start" },
              { label: "Taking orders",     old: "Manual / WhatsApp", nw: "Automated online" },
              { label: "Payments",          old: "Chasing invoices",  nw: "Instant card payments" },
              { label: "Batch tracking",    old: "Spreadsheets",      nw: "Real-time, automatic" },
              { label: "Customer pricing",  old: "Sent manually",     nw: "Custom price lists" },
              { label: "Contracts",         old: "Annual lock-in",    nw: "Cancel anytime" },
            ].map(({ label, old, nw }, i) => (
              <div key={label} className={`grid grid-cols-3 text-xs sm:text-sm border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <div className="p-3 sm:p-5 font-medium text-gray-700">{label}</div>
                <div className="p-3 sm:p-5 text-center text-gray-400 border-l border-gray-100">{old}</div>
                <div className="p-3 sm:p-5 text-center text-primary font-semibold border-l border-gray-100 flex items-center justify-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" /> {nw}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-24 sm:py-32 bg-gradient-to-br from-gray-950 via-green-950 to-gray-950 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(22,163,74,0.2),transparent)]" aria-hidden="true" />
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6 leading-tight">
            Start running your wholesale<br />business smarter
          </h2>
          <p className="text-gray-300 text-lg mb-10 leading-relaxed">
            Join FMCG wholesalers, African food distributors, and independent suppliers already using Quikpik across the UK.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleGetStarted} size="lg" className="bg-primary hover:bg-primary/90 text-base font-semibold px-10 py-6 rounded-xl shadow-xl shadow-primary/30">
              Start Free <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button onClick={handleBookDemo} size="lg" variant="outline" className="text-base font-semibold px-10 py-6 rounded-xl border-2 border-white/25 text-white bg-transparent hover:bg-white/10">
              Book a Demo
            </Button>
          </div>
          <p className="text-gray-400 text-sm mt-6">No credit card required · Free plan available · Cancel anytime</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-10 bg-gray-950 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <img src="/quikpik-logo.png" alt="Quikpik" className="h-7 w-7 object-contain" />
              <span className="text-white font-bold text-lg">Quikpik</span>
            </div>
            <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400" aria-label="Footer navigation">
              <a href="/blog" className="hover:text-white transition-colors">QuikTips & Insights</a>
              <button onClick={handleCustomerLogin} className="hover:text-white transition-colors">Customer Login</button>
              <button onClick={handleLogin} className="hover:text-white transition-colors">Wholesaler Login</button>
              <button onClick={handleGetStarted} className="hover:text-white transition-colors">Sign Up Free</button>
            </nav>
            <p className="text-gray-600 text-xs">© {new Date().getFullYear()} Quikpik. All rights reserved.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
