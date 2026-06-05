import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Menu,
  X,
  Box,
  ReceiptText,
  UserCheck,
  Wallet,
  Search,
  Store,
  MapPin,
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

function MarketplaceSearch() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = async (q: string, cat: string) => {
    if (!q && !cat) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (cat) params.set('category', cat);
      const res = await fetch(`/api/public/search?${params}`);
      const data = await res.json();
      setResults(data.results || []);
      if (data.categories?.length) setCategories(data.categories);
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
    <section className="bg-gray-50 border-b border-gray-100 py-10 sm:py-14">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Find wholesale suppliers</h2>
          <p className="text-sm text-gray-500 mt-1">Search products from verified UK wholesalers</p>
        </div>

        {/* Search bar */}
        <div className="max-w-xl mx-auto relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search products, categories or suppliers…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-10 pr-4 py-5 text-sm rounded-xl border-gray-200 shadow-sm bg-white"
          />
        </div>

        {/* Category chips (once populated) */}
        {categories.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {categories.slice(0, 12).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(c => c === cat ? '' : cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-primary/40'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && searched && wholesalers.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            <Store className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            No suppliers found — try a different search
          </div>
        )}

        {!loading && wholesalers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wholesalers.map(w => (
              <a
                key={w.wholesalerId}
                href={`/w/${w.storeSlug || w.wholesalerId}`}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-primary/20 transition-all group flex gap-4 items-start"
              >
                {/* Logo / initials */}
                <div className="flex-shrink-0">
                  {w.logoUrl
                    ? <img src={w.logoUrl} alt={w.businessName} className="h-12 w-12 rounded-lg object-contain bg-gray-50 p-1 border border-gray-100" />
                    : (
                      <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{getInitials(w.businessName)}</span>
                      </div>
                    )
                  }
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900 truncate group-hover:text-primary transition-colors">{w.businessName}</p>
                  {w.city && (
                    <div className="flex items-center gap-1 mt-0.5 mb-2">
                      <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-400 truncate">{w.city}</span>
                    </div>
                  )}
                  {/* Matching products */}
                  {w.products.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {w.products.slice(0, 3).map(name => (
                        <span key={name} className="inline-block bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[130px]">
                          {name}
                        </span>
                      ))}
                      {w.products.length > 3 && (
                        <span className="inline-block bg-gray-100 text-gray-400 text-[10px] px-2 py-0.5 rounded-full">
                          +{w.products.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 self-center group-hover:text-primary transition-colors" />
              </a>
            ))}
          </div>
        )}

        {!hasContent && (
          <div className="text-center mt-4">
            <p className="text-xs text-gray-400">Start typing to search across all public wholesale stores</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const handleGetStarted = () => { window.location.href = "/signup"; };
  const handleLogin = () => { window.location.href = "/login"; };
  const handleCustomerLogin = () => { window.location.href = "/customer-login"; };
  const handleBookDemo = () => { window.open("https://calendly.com/hello-quikpik/30min", "_blank"); };

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-8 w-8 object-contain" />
            <span className="text-xl font-bold text-primary">Quikpik</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop nav links */}
            <a href="/blog" className="hidden sm:inline-flex text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              QuikTips & Insights
            </a>
            <Button variant="ghost" onClick={handleCustomerLogin} className="hidden sm:inline-flex text-sm text-gray-600">
              Customer Login
            </Button>
            <Button variant="ghost" onClick={handleLogin} className="hidden sm:inline-flex text-sm text-gray-600">
              Wholesaler Login
            </Button>
            <Button onClick={handleGetStarted} className="bg-primary hover:bg-primary/90 text-sm px-4">
              Start Free <ArrowRight className="ml-1 h-4 w-4" />
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
            <a href="/blog" onClick={() => setMobileMenuOpen(false)} className="flex items-center text-sm text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-100 w-full">
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

      {/* ── HERO ── */}
      <section className="relative bg-gray-950 overflow-hidden min-h-[620px] flex items-center">
        {/* Warehouse background photo — right half */}
        <div className="absolute inset-y-0 right-0 w-full sm:w-[65%] lg:w-[58%]">
          <img
            src="/hero-warehouse.jpg"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-[65%_center]"
            loading="eager"
          />
          {/* left-to-right gradient so text stays readable */}
          <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/70 sm:via-gray-950/50 to-transparent" />
          {/* subtle bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-gray-950/60 to-transparent" />
        </div>

        {/* Content row */}
        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:pl-0 sm:pr-6 lg:pr-8 py-16 sm:py-20">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">

            {/* Copy — now the only child of the hero flex row */}
            <div className="flex-1 max-w-lg">
              <div className="inline-flex items-center gap-2 bg-green-900/50 text-green-400 text-xs font-semibold px-4 py-2 rounded-full mb-8 border border-green-800/50">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                Built for wholesale businesses
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-white leading-tight tracking-tight mb-6">
                Run your<br />
                wholesale business<br />
                <span className="text-primary">without the chaos</span>
              </h1>

              <p className="text-gray-300 text-lg mb-10 leading-relaxed">
                Manage stock, send invoices, track payments,<br className="hidden sm:block" />
                and grow faster with Quikpik.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <Button
                  onClick={handleGetStarted}
                  size="lg"
                  className="text-base px-8 py-4 sm:py-6 bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/30"
                >
                  Start Free <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  onClick={handleBookDemo}
                  size="lg"
                  variant="outline"
                  className="text-base px-8 py-4 sm:py-6 rounded-xl border-2 border-white/30 text-white bg-transparent hover:bg-white/10 hover:border-white/50"
                >
                  Book Demo
                </Button>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-green-500" /> Setup in minutes
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-green-500" /> No credit card required
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-green-500" /> Cancel anytime
                </span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── MARKETPLACE SEARCH STRIP ── */}
      <MarketplaceSearch />

      {/* ── FEATURE CARDS STRIP ── */}
      <section className="bg-white border-b border-gray-100 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">

            {/* Left — dashboard mockup */}
            <div className="w-full max-w-xs sm:max-w-sm lg:max-w-md flex-shrink-0 mx-auto lg:mx-0">
              <DashboardMockup />
            </div>

            {/* Right — 2×2 feature grid (single col on mobile) */}
            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: Box,         title: "Inventory Management",  desc: "Track stock in real time and never run out again." },
                { icon: ReceiptText, title: "Invoicing",             desc: "Create and send professional invoices in seconds." },
                { icon: UserCheck,   title: "Customer Management",   desc: "Manage customers, balances and order history easily." },
                { icon: Wallet,      title: "Payment Tracking",      desc: "Track payments and get paid faster, every time." },
              ].map(({ icon: Icon, title, desc }, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 p-5 sm:p-6 rounded-xl border border-gray-100 group hover:bg-green-50/50 hover:border-green-100 transition-colors duration-200"
                >
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 group-hover:bg-green-200 transition-colors">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm sm:text-base mb-1">{title}</h3>
                    <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="py-16 sm:py-20 bg-gray-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">
            Still running your wholesale business like this?
          </h2>
          <p className="text-gray-400 text-lg mb-12">Sound familiar? You're not alone.</p>

          <div className="grid sm:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
            {[
              { icon: MessageSquare, text: "Taking orders over WhatsApp and writing them down manually" },
              { icon: CreditCard,    text: "Chasing payments long after goods have left the door" },
              { icon: Package,       text: "Managing stock levels in a spreadsheet (that's always out of date)" },
              { icon: Users,         text: "Sending individual price lists to every single customer" },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-4 bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="h-5 w-5 text-red-400" />
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          <p className="mt-12 text-gray-400 text-base">
            There's a better way. <span className="text-white font-semibold">Quikpik handles all of it for you.</span>
          </p>
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Everything you need to run your wholesale business
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              One platform replaces the calls, the spreadsheets, and the back-and-forth.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: ShoppingBag,
                color: "bg-blue-50 text-blue-600",
                title: "Instant Online Ordering",
                desc: "Customers browse your live catalogue and place orders any time — no calls, no messages, no manual entry.",
              },
              {
                icon: CreditCard,
                color: "bg-green-50 text-green-600",
                title: "Custom Pricing Per Customer",
                desc: "Set different price lists for different customers. Each buyer sees their own personalised rates automatically.",
              },
              {
                icon: FileText,
                color: "bg-purple-50 text-purple-600",
                title: "Quotes → Payment in One Flow",
                desc: "Create a quote, send a payment link, and get paid instantly. No follow-up calls needed.",
              },
              {
                icon: Package,
                color: "bg-orange-50 text-orange-600",
                title: "Real-Time Stock Control",
                desc: "Inventory updates automatically with every order. Low-stock alerts stop you overselling.",
              },
              {
                icon: Lock,
                color: "bg-rose-50 text-rose-600",
                title: "Pay Now or Pay Later",
                desc: "Offer trusted customers the option to buy on account while everyone else pays by card.",
              },
              {
                icon: Phone,
                color: "bg-teal-50 text-teal-600",
                title: "SMS & WhatsApp Ready",
                desc: "Send order confirmations and payment links via SMS and WhatsApp — the channels your customers already use.",
              },
            ].map(({ icon: Icon, color, title, desc }, i) => (
              <Card key={i} className="p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Up and running in minutes
          </h2>
          <p className="text-gray-500 text-lg mb-14">Three steps. No technical setup required.</p>

          <div className="grid sm:grid-cols-3 gap-8 relative">
            <div className="hidden sm:block absolute top-8 left-1/4 right-1/4 h-0.5 bg-green-200 z-0"></div>
            {[
              { step: "1", title: "Set up your store", desc: "Add your products, pricing, and delivery options in minutes." },
              { step: "2", title: "Share your link", desc: "Send your store link to customers via WhatsApp, SMS, or email." },
              { step: "3", title: "Receive orders and get paid", desc: "Customers order online. Payments land directly in your account." },
            ].map(({ step, title, desc }, i) => (
              <div key={i} className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-primary text-white text-2xl font-extrabold rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-primary/20">
                  {step}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Start free. Only pay when you get paid.
          </h2>
          <p className="text-gray-500 text-lg mb-12">Simple, honest pricing with no surprises.</p>

          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: CheckCircle,
                color: "text-green-500",
                bg: "bg-green-50",
                title: "£0/month to start",
                desc: "Full access on the free plan. No credit card needed.",
              },
              {
                icon: CreditCard,
                color: "text-blue-500",
                bg: "bg-blue-50",
                title: "Small fee on card payments",
                desc: "Only pay on card orders — cash and Pay Later orders are always free.",
              },
              {
                icon: Shield,
                color: "text-purple-500",
                bg: "bg-purple-50",
                title: "Offline orders are 100% yours",
                desc: "Cash, Pay Later, and offline orders have no platform fee.",
              },
            ].map(({ icon: Icon, color, bg, title, desc }, i) => (
              <div key={i} className={`${bg} rounded-2xl p-6 text-left`}>
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

      {/* ── COMPARISON ── */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Stop paying for tools that don't work
            </h2>
            <p className="text-gray-500 text-lg">See how Quikpik stacks up against the old way.</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-3 text-xs sm:text-sm font-semibold border-b border-gray-100">
              <div className="col-span-1 p-2 sm:p-4 text-gray-500"></div>
              <div className="p-2 sm:p-4 text-center text-gray-500 border-l border-gray-100">Traditional</div>
              <div className="p-2 sm:p-4 text-center text-primary border-l border-gray-100">Quikpik</div>
            </div>
            {[
              { label: "Monthly cost",     old: "£200–£500+",       new: "Free to start" },
              { label: "Taking orders",    old: "Manual",           new: "Automated online" },
              { label: "Payments",         old: "Chasing invoices", new: "Instant card payments" },
              { label: "Stock tracking",   old: "Spreadsheets",     new: "Real-time, automatic" },
              { label: "Customer pricing", old: "Sent manually",    new: "Custom price lists" },
              { label: "Contracts",        old: "Annual lock-in",   new: "Cancel anytime" },
            ].map(({ label, old, new: newVal }, i) => (
              <div key={i} className={`grid grid-cols-3 text-xs sm:text-sm border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <div className="p-2 sm:p-4 font-medium text-gray-700">{label}</div>
                <div className="p-2 sm:p-4 text-center text-gray-400 border-l border-gray-100">{old}</div>
                <div className="p-2 sm:p-4 text-center text-primary font-semibold border-l border-gray-100 flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" /> {newVal}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-20 sm:py-28 bg-gradient-to-br from-primary to-green-600 text-white text-center">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6 leading-tight">
            Start taking orders today
          </h2>
          <p className="text-green-100 text-lg mb-10">
            Join wholesalers already using Quikpik to run their business smarter.
          </p>
          <Button
            onClick={handleGetStarted}
            size="lg"
            className="bg-white text-primary hover:bg-gray-50 text-base font-semibold px-10 py-6 rounded-xl shadow-xl"
          >
            Start Free <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-green-200 text-sm mt-5">No credit card required · Free plan available · Cancel anytime</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-8 bg-gray-950 text-gray-500 text-center text-sm">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/quikpik-logo.png" alt="Quikpik" className="h-6 w-6 object-contain" />
            <span className="text-white font-bold">Quikpik</span>
          </div>
          <p>© {new Date().getFullYear()} Quikpik. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="/blog" className="hover:text-white transition-colors">QuikTips & Insights</a>
            <button onClick={handleCustomerLogin} className="hover:text-white transition-colors">Customer Login</button>
            <button onClick={handleLogin} className="hover:text-white transition-colors">Wholesaler Login</button>
            <button onClick={handleGetStarted} className="hover:text-white transition-colors">Sign Up Free</button>
          </div>
        </div>
      </footer>

    </div>
  );
}
