import { useAuth } from "@/hooks/useAuth";
import Sidebar from "./sidebar";
import Footer from "@/components/ui/footer";
import { SidebarProvider, useSidebarContext } from "@/contexts/sidebar-context";
import Logo from "@/components/ui/logo";
import { Menu, Shield, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import ShareBellControls from "@/components/shared/ShareBellControls";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useImpersonation } from "@/contexts/impersonation-context";

const PAGE_NAMES: { href: string; name: string }[] = [
  { href: "/orders", name: "Orders" },
  { href: "/products", name: "Products" },
  { href: "/promotions", name: "Promotions" },
  { href: "/customers", name: "Customers" },
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

function AppLayoutInner({ children }: AppLayoutProps) {
  const { user, isLoading } = useAuth();
  const { isDesktopCollapsed, openMobileSidebar, mobileTopBarActions } = useSidebarContext();
  const pageName = usePageName();
  const [, setLocation] = useLocation();
  const { impersonation, exitImpersonation } = useImpersonation();

  const isImpersonating = !!impersonation.wholesalerId;

  const exitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/impersonate/exit", {
        wholesalerId: impersonation.wholesalerId,
      }),
    onSuccess: () => {
      exitImpersonation();
      setLocation("/admin");
    },
    onError: () => {
      // Always clear local state even if the server request fails (e.g. expired token)
      // so the banner never stays "stuck" in an irrecoverable state
      exitImpersonation();
      setLocation("/admin");
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
