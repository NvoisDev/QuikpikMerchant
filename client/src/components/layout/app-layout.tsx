import { useAuth } from "@/hooks/useAuth";
import Sidebar from "./sidebar";
import Footer from "@/components/ui/footer";
import { SidebarProvider, useSidebarContext } from "@/contexts/sidebar-context";
import Logo from "@/components/ui/logo";
import { Menu, Shield, LogOut, Clock, RefreshCw, CreditCard } from "lucide-react";
import { useLocation } from "wouter";
import ShareBellControls from "@/components/shared/ShareBellControls";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useImpersonation } from "@/contexts/impersonation-context";
import InstallPromptBanner from "@/components/shared/InstallPromptBanner";
import { useEffect } from "react";

const PAGE_NAMES: { href: string; name: string }[] = [
  { href: "/orders", name: "Orders" },
  { href: "/products", name: "Products" },
  { href: "/promotions", name: "Promotions" },
  { href: "/customers", name: "Customers" },
  { href: "/leads", name: "Leads" },
  { href: "/campaigns", name: "Broadcast" },
  { href: "/marketplace", name: "Marketplace" },
  { href: "/integrations", name: "Integrations" },
  { href: "/team-management", name: "Team Management" },
  { href: "/financials", name: "Finance" },
  { href: "/subscription-pricing", name: "Subscription" },
  { href: "/help", name: "Help Hub" },
  { href: "/settings", name: "Settings" },
  { href: "/", name: "Dashboard" },
];

function usePageName() {
  const [location] = useLocation();
  const match = PAGE_NAMES.find((p) =>
    p.href === "/" ? location === "/" : location.startsWith(p.href)
  );
  return match?.name ?? "Dashboard";
}

interface AppLayoutProps {
  children: React.ReactNode;
}

function PendingPaymentGate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Poll every 10 s — Stripe webhook will flip status to 'active' once payment clears
  useQuery({
    queryKey: ["/api/auth/user"],
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  const handleLogout = async () => {
    await apiRequest("POST", "/api/auth/logout", {});
    queryClient.clear();
    window.location.href = "/login";
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
        {/* Icon */}
        <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Clock className="h-8 w-8 text-amber-500" />
        </div>

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src="/quikpik-logo.png" alt="Quikpik" className="h-6 w-6 object-contain" />
          <span className="text-lg font-bold text-primary">Quikpik</span>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">Payment pending confirmation</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          Your subscription payment is being verified by our payment provider.
          This usually completes within a few minutes — this page checks automatically.
        </p>

        {/* Auto-check indicator */}
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-2.5 mb-8">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
          Checking every 10 seconds…
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleRefresh}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Check now
          </button>
          <a
            href="/subscription-pricing"
            className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium px-4 py-3 rounded-xl transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            Manage payment
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 text-sm px-4 py-2 rounded-xl transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        <p className="mt-6 text-xs text-gray-400">
          Need help?{" "}
          <a href="mailto:hello@quikpik.io" className="text-primary hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}

function AppLayoutInner({ children }: AppLayoutProps) {
  const { user, isLoading } = useAuth();
  const { isDesktopCollapsed, openMobileSidebar, mobileTopBarActions } = useSidebarContext();
  const pageName = usePageName();
  const [, setLocation] = useLocation();
  const { impersonation, exitImpersonation } = useImpersonation();
  const queryClient = useQueryClient();

  const isImpersonating = !!impersonation.wholesalerId;

  const exitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/impersonate/exit", {
        wholesalerId: impersonation.wholesalerId,
      }),
    onSuccess: () => {
      exitImpersonation();
      // Wipe the full cache so no impersonated data lingers after returning
      // to the admin panel. Everything re-fetches fresh as the real admin.
      queryClient.clear();
      setLocation("/super-admin");
    },
    onError: () => {
      // Always clear local state even if the server request fails (e.g. expired token)
      // so the banner never stays "stuck" in an irrecoverable state
      exitImpersonation();
      queryClient.clear();
      setLocation("/super-admin");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex space-x-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-8 bg-gradient-to-t from-primary/60 to-primary rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.1}s`, animationDuration: "1.3s" }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-500 text-center">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  // Block dashboard access when Stripe subscription payment hasn't cleared yet.
  // Admins impersonating a wholesaler are allowed through so they can investigate.
  if (user?.subscriptionStatus === 'incomplete' && !isImpersonating) {
    return <PendingPaymentGate />;
  }

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col">
      {/* Admin impersonation banner */}
      {isImpersonating && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] bg-indigo-600 text-white px-4 py-2 flex items-center justify-between gap-3 shadow-md"
          style={{ height: 44 }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="h-4 w-4 flex-shrink-0 text-indigo-200" />
            <span className="text-xs font-medium truncate">
              Admin view —{" "}
              <span className="font-bold">{impersonation.businessName || "Wholesaler"}</span>
            </span>
          </div>
          <button
            onClick={() => {
              if (window.confirm("Exit impersonation mode and return to the admin panel?")) {
                exitMutation.mutate();
              }
            }}
            disabled={exitMutation.isPending}
            className="flex items-center gap-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 px-3 py-1 rounded-md transition-colors flex-shrink-0 disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5" />
            {exitMutation.isPending ? "Exiting…" : "Exit Impersonation"}
          </button>
        </div>
      )}
      {user && <Sidebar />}

      {/* Mobile-only top header bar */}
      {user && (
        <header
          className={`lg:hidden fixed left-0 right-0 h-14 z-[45] bg-slate-900 border-b border-slate-700/60 flex items-center px-3 gap-3 ${
            isImpersonating ? "top-11" : "top-0"
          }`}
        >
          <button
            onClick={openMobileSidebar}
            className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex-1 text-white font-semibold text-base truncate">{pageName}</span>
          {mobileTopBarActions}
          <ShareBellControls variant="dark" />
          <Logo size="sm" />
        </header>
      )}

      <div
        className={`flex-1 flex flex-col transition-[margin] duration-200 ${
          user ? (isDesktopCollapsed ? "lg:ml-14" : "lg:ml-64") : ""
        } ${user ? (isImpersonating ? "pt-[100px] lg:pt-11" : "pt-14 lg:pt-0") : ""}`}
      >
        <main className="flex-1 p-2 sm:p-4 lg:p-6 xl:p-8">{children}</main>
        <Footer />
      </div>
      {user && <InstallPromptBanner />}
    </div>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SidebarProvider>
  );
}
