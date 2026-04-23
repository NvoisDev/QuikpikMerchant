import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarPermissions } from "@/hooks/useSidebarPermissions";
import { Button } from "@/components/ui/button";
import Logo from "@/components/ui/logo";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  MessageSquare,
  Settings,
  LogOut,
  Store,
  X,
  HelpCircle,
  Crown,
  Contact,
  Tag,
  Puzzle,
  Banknote,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useSidebarContext } from "@/contexts/sidebar-context";

interface NavigationItem {
  name: string;
  href: string;
  icon: any;
  onboardingId?: string;
  tabName: string;
  premiumOnly?: boolean;
  comingSoon?: boolean;
  soonBadge?: boolean;
}

const navigation: NavigationItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, onboardingId: "dashboard", tabName: "dashboard" },
  { name: "Orders", href: "/orders", icon: ShoppingCart, onboardingId: "orders", tabName: "orders" },
  { name: "Products", href: "/products", icon: Package, onboardingId: "products-list", tabName: "products" },
  { name: "Promotions", href: "/promotions", icon: Tag, tabName: "products" },
  { name: "Customers", href: "/customers", icon: Users, onboardingId: "customer-groups", tabName: "customers" },
  { name: "Broadcast", href: "/campaigns", icon: MessageSquare, onboardingId: "campaigns", tabName: "campaigns", soonBadge: true },
  { name: "Marketplace", href: "/marketplace", icon: Store, tabName: "marketplace", soonBadge: true },
  { name: "Integrations", href: "/integrations", icon: Puzzle, tabName: "integrations" },
  { name: "Team Management", href: "/team-management", icon: Contact, tabName: "team-management" },
  { name: "Finance", href: "/financials", icon: Banknote, tabName: "finance" },
  { name: "Subscription", href: "/subscription-pricing", icon: Crown, tabName: "subscription" },
  { name: "Help Hub", href: "/help", icon: HelpCircle, tabName: "settings" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { isDesktopCollapsed, toggleDesktopCollapsed, isMobileOpen, closeMobileSidebar } = useSidebarContext();
  const { checkTabAccess } = useSidebarPermissions();

  const { data: subscriptionData } = useQuery({
    queryKey: ["/api/subscriptions/current"],
    enabled: !!user,
  });

  const { data: pendingOrderData } = useQuery<{ count: number }>({
    queryKey: ["/api/orders/pending-count"],
    enabled: !!user && checkTabAccess("orders"),
    refetchInterval: 60_000,
    staleTime: 0,
  });
  const pendingOrderCount = pendingOrderData?.count ?? 0;

  const isPremiumUser = subscriptionData?.user?.currentPlan === "premium";
  const isStandardUser = subscriptionData?.user?.currentPlan === "standard";
  const isFreeUser = !isPremiumUser && !isStandardUser;

  // collapsed = icon-rail only (desktop); "dc" is shorthand below
  const dc = isDesktopCollapsed;

  return (
    <TooltipProvider delayDuration={400}>
      <>
        {/* Mobile backdrop — z-[48] sits above the top bar (z-[45]) so it dims correctly */}
        {isMobileOpen && (
          <div
            className="lg:hidden fixed inset-0 z-[48] bg-black/60 backdrop-blur-sm"
            onClick={closeMobileSidebar}
          />
        )}

        {/* Sidebar panel */}
        <div
          className={cn(
            "bg-slate-900 h-screen fixed left-0 top-0 z-[50] flex flex-col",
            "transition-[width,transform] duration-200 ease-in-out",
            // Mobile: full width drawer that slides in/out
            "w-64",
            isMobileOpen ? "translate-x-0" : "-translate-x-full",
            // Desktop: always visible, width based on collapse state
            dc ? "lg:translate-x-0 lg:w-14" : "lg:translate-x-0 lg:w-64"
          )}
        >
          <div className={cn(
            "border-b border-slate-700/60 flex-shrink-0",
            dc ? "lg:px-2 lg:py-4 px-5 py-5" : "px-5 py-5"
          )}>
            <div className="flex items-center justify-between gap-2">
              {/* Logo + business name */}
              <div className={cn("flex flex-col gap-1 min-w-0 flex-1", dc && "lg:hidden")}>
                {!!user ? (
                  <Logo size="lg" />
                ) : (
                  <img src="/quikpik-logo.png" alt="Quikpik" className="h-12 w-12 object-contain" />
                )}
                <p className="text-xs text-slate-400 font-medium truncate max-w-[170px]">
                  {user?.businessName || "Wholesale Business"}
                </p>
              </div>

              {/* Icon-only logo shown on desktop when collapsed */}
              {dc && (
                <div className="hidden lg:flex w-full justify-center">
                  {!!user ? (
                    <Logo size="lg" variant="icon-only" />
                  ) : (
                    <img src="/quikpik-logo.png" alt="Quikpik" className="h-8 w-8 object-contain" />
                  )}
                </div>
              )}

              {/* Mobile close */}
              <button
                onClick={closeMobileSidebar}
                className="lg:hidden p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Desktop collapse toggle */}
              <button
                onClick={toggleDesktopCollapsed}
                title={dc ? "Expand sidebar" : "Collapse sidebar"}
                className={cn(
                  "hidden lg:flex p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors flex-shrink-0",
                  dc && "w-full justify-center mt-1"
                )}
              >
                {dc ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <nav className="flex-1 py-3 overflow-y-auto">
            <div className={cn("space-y-0.5", dc ? "lg:px-1 px-3" : "px-3")}>
              {navigation.map((item) => {
                const IconComponent = item.icon;
                const isActive = location === item.href && item.href !== "#";
                const isLocked = item.premiumOnly && isFreeUser;
                const isComingSoon = item.comingSoon;
                const showSoonBadge = item.comingSoon || item.soonBadge;
                if (!checkTabAccess(item.tabName)) return null;

                const isOrders = item.name === "Orders";
                const showOrderBadge = isOrders && pendingOrderCount > 0;

                const itemContent = (
                  <Link
                    href={isComingSoon ? "#" : isLocked ? "/subscription-pricing" : item.href}
                  >
                    <div
                      className={cn(
                        "flex items-center rounded-lg text-sm font-medium transition-all cursor-pointer",
                        // Centred icon rail on desktop when collapsed; normal row otherwise
                        dc ? "lg:justify-center lg:px-2 lg:py-2.5 px-3 py-2.5 justify-between" : "px-3 py-2.5 justify-between",
                        isActive
                          ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20"
                          : isComingSoon
                          ? "text-slate-600 cursor-default"
                          : isLocked
                          ? "text-slate-600"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
                      )}
                      onClick={(e) => {
                        if (isComingSoon) { e.preventDefault(); return; }
                        closeMobileSidebar();
                      }}
                      data-onboarding={item.onboardingId}
                    >
                      <div className={cn("flex items-center min-w-0", !dc && "flex-1")}>
                        {/* Icon — wrap in relative container for Orders dot indicator */}
                        <span className="relative flex-shrink-0">
                          <IconComponent
                            className={cn(
                              "h-4 w-4",
                              dc ? "lg:mr-0 mr-3" : "mr-3",
                              isActive ? "text-emerald-400" : (isLocked || isComingSoon) ? "text-slate-600" : "text-slate-500"
                            )}
                          />
                          {/* Dot indicator — collapsed mode (desktop icon-rail + mobile when sidebar is icon-only) */}
                          {showOrderBadge && dc && (
                            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />
                          )}
                        </span>
                        {/* Label: always visible on mobile, hidden on desktop when collapsed */}
                        <span className={cn("flex-1 truncate", dc && "lg:hidden")}>
                          {item.name}
                        </span>
                      </div>

                      {/* Badges: hidden on desktop when collapsed */}
                      {!dc && (
                        <>
                          {showOrderBadge && (
                            <span className="ml-auto text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center leading-4">
                              {pendingOrderCount > 99 ? "99+" : pendingOrderCount}
                            </span>
                          )}
                          {isLocked && <Crown className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                          {showSoonBadge && (
                            <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-medium border border-slate-700">
                              Soon
                            </span>
                          )}
                        </>
                      )}
                      {/* On mobile when dc=true, still show badges */}
                      {dc && (
                        <span className="lg:hidden flex items-center gap-1.5">
                          {showOrderBadge && (
                            <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center leading-4">
                              {pendingOrderCount > 99 ? "99+" : pendingOrderCount}
                            </span>
                          )}
                          {isLocked && <Crown className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                          {showSoonBadge && (
                            <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-medium border border-slate-700">
                              Soon
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </Link>
                );

                // On desktop, wrap in Tooltip when collapsed so icons are discoverable
                return dc ? (
                  <Tooltip key={item.name}>
                    <TooltipTrigger asChild>
                      {itemContent}
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="hidden lg:block bg-slate-800 text-slate-100 border-slate-700"
                    >
                      {item.name}
                      {showSoonBadge ? " (Coming soon)" : ""}
                      {showOrderBadge ? ` — ${pendingOrderCount} active` : ""}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div key={item.name}>{itemContent}</div>
                );
              })}
            </div>
          </nav>

          <div className={cn(
            "flex-shrink-0 border-t border-slate-700/60 space-y-2",
            dc ? "lg:p-2 p-4" : "p-4"
          )}>
            {/* Avatar + name row */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-3 px-1 mb-1",
                  dc && "lg:justify-center lg:px-0"
                )}>
                  <div className="w-8 h-8 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-emerald-400">
                      {user?.firstName?.charAt(0) || "U"}{user?.lastName?.charAt(0) || ""}
                    </span>
                  </div>
                  <div className={cn("flex-1 min-w-0", dc && "lg:hidden")}>
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                </div>
              </TooltipTrigger>
              {dc && (
                <TooltipContent side="right" className="hidden lg:block bg-slate-800 text-slate-100 border-slate-700">
                  <p className="font-medium">{user?.firstName} {user?.lastName}</p>
                  {user?.email && <p className="text-slate-400 text-xs">{user.email}</p>}
                </TooltipContent>
              )}
            </Tooltip>

            {/* Settings */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/settings">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-full text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 h-9",
                      dc ? "lg:justify-center lg:px-0 justify-start" : "justify-start"
                    )}
                    data-onboarding="settings"
                  >
                    <Settings className={cn("h-4 w-4", dc ? "lg:mr-0 mr-2.5" : "mr-2.5")} />
                    <span className={cn(dc && "lg:hidden")}>Settings</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              {dc && (
                <TooltipContent side="right" className="hidden lg:block bg-slate-800 text-slate-100 border-slate-700">
                  Settings
                </TooltipContent>
              )}
            </Tooltip>

            {/* Logout */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 h-9",
                    dc ? "lg:justify-center lg:px-0 justify-start" : "justify-start"
                  )}
                  onClick={logout}
                >
                  <LogOut className={cn("h-4 w-4", dc ? "lg:mr-0 mr-2.5" : "mr-2.5")} />
                  <span className={cn(dc && "lg:hidden")}>Logout</span>
                </Button>
              </TooltipTrigger>
              {dc && (
                <TooltipContent side="right" className="hidden lg:block bg-slate-800 text-slate-100 border-slate-700">
                  Logout
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>
      </>
    </TooltipProvider>
  );
}
