import { useState, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Shield, ChevronRight, LogOut, Menu, X, Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logoSrc from "@assets/Quikpik_1773118173684.png";
import { SECTIONS } from "@/components/admin/shared";
import type { SectionId, PlatformStats, RevenueData, WholesalerRow } from "@/components/admin/types";
import { OverviewSection } from "@/components/admin/OverviewSection";
import { WholesalersSection } from "@/components/admin/WholesalersSection";
import { CustomersSection } from "@/components/admin/CustomersSection";
import { OrdersSection } from "@/components/admin/OrdersSection";
import { ProductsSection } from "@/components/admin/ProductsSection";
import { FinancialsSection } from "@/components/admin/FinancialsSection";
import { SystemSettingsSection } from "@/components/admin/SystemSettingsSection";
import { PlansSection } from "@/components/admin/PlansSection";
import { CustomerMapSection } from "@/components/admin/CustomerMapSection";
import { SupportLogsSection } from "@/components/admin/SupportLogsSection";
import { ProspectStoresSection } from "@/components/admin/ProspectStoresSection";
import { QuickActionsModal } from "@/components/admin/QuickActionsModal";
import { GlobalSearchBar } from "@/components/admin/GlobalSearchBar";

const ADMIN_EMAILS = ["hello@quikpik.co", "mogunjemilua@gmail.com"];
const GREEN = "#1a7a3d";

const VALID_SECTIONS = new Set<SectionId>(["overview","wholesalers","customers","orders","products","financials","settings","plans","logs","map","prospects"]);

function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google?returnTo=/super-admin");
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
              {loading
                ? <span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Signing in...</span>
                : <span className="flex items-center gap-2"><svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Continue with Google</span>
              }
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

export default function SuperAdmin() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [highlightedRecord, setHighlightedRecord] = useState<{ section: SectionId; id: string | number } | null>(null);

  const rawSection = new URLSearchParams(search).get("section") || "overview";
  const activeSection = (VALID_SECTIONS.has(rawSection as SectionId) ? rawSection : "overview") as SectionId;

  const navigateToSection = useCallback((section: SectionId) => {
    setLocation(`/super-admin?section=${section}`);
    setSidebarOpen(false);
  }, [setLocation]);

  const handleNavigate = useCallback((section: SectionId, id?: string | number) => {
    setLocation(`/super-admin?section=${section}`);
    setHighlightedRecord(id !== undefined ? { section, id } : null);
  }, [setLocation]);

  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email || "");

  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/platform-stats"],
    enabled: isAdmin,
  });

  const { data: wholesalers = [], isLoading: wholesalersLoading } = useQuery<WholesalerRow[]>({
    queryKey: ["/api/admin/wholesalers"],
    enabled: isAdmin,
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
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-gray-700/60 flex-shrink-0">
          <Shield className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Control Centre</p>
            <p className="text-xs text-gray-400 leading-tight">Quikpik Admin</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto p-1 text-gray-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-2 space-y-0.5">
            {SECTIONS.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button key={section.id} onClick={() => navigateToSection(section.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${isActive ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20" : "text-gray-400 hover:text-gray-100 hover:bg-gray-800/70"}`}>
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-emerald-400" : "text-gray-500"}`} />
                  <span className="truncate">{section.label}</span>
                  {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </nav>

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
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-3 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-screen-xl w-full mx-auto">
          {activeSection === "overview" && (
            <OverviewSection stats={stats} statsLoading={statsLoading} revenueData={revenueData} revenueLoading={revenueLoading} isAdmin={isAdmin} onNavigate={(s) => navigateToSection(s as SectionId)} />
          )}
          {activeSection === "wholesalers" && (
            <WholesalersSection wholesalers={wholesalers} wholesalersLoading={wholesalersLoading} isAdmin={isAdmin} />
          )}
          {activeSection === "customers" && (
            <CustomersSection isAdmin={isAdmin} highlightedId={highlightedRecord?.section === "customers" ? String(highlightedRecord.id) : undefined} />
          )}
          {activeSection === "orders" && (
            <OrdersSection revenueData={revenueData} revenueLoading={revenueLoading} wholesalers={wholesalers} isAdmin={isAdmin} highlightedId={highlightedRecord?.section === "orders" ? Number(highlightedRecord.id) : undefined} />
          )}
          {activeSection === "products" && (
            <ProductsSection isAdmin={isAdmin} highlightedId={highlightedRecord?.section === "products" ? Number(highlightedRecord.id) : undefined} />
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
          {activeSection === "prospects" && (
            <ProspectStoresSection isAdmin={isAdmin} wholesalers={wholesalers} />
          )}
        </main>
      </div>

      <QuickActionsModal open={quickActionsOpen} onOpenChange={setQuickActionsOpen} wholesalers={wholesalers} />
    </div>
  );
}
