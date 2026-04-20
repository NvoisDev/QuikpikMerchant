import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarPermissions } from "@/hooks/useSidebarPermissions";
import { Button } from "@/components/ui/button";
import Logo from "@/components/ui/logo";
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingCart, 
  MessageSquare, 
  BarChart3,
  PieChart,
  TrendingUp,
  Package2,
  CreditCard,
  Settings,
  LogOut,
  Store,
  Menu,
  X,
  Lock,
  HelpCircle,
  FileText,
  Crown,
  AlertTriangle,
  Truck,
  Book,
  Contact,
  Megaphone,
  Badge,
  Tag,
  Puzzle,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface NavigationItem {
  name: string;
  href: string;
  icon: any;
  onboardingId?: string;
  tabName: string;
  premiumOnly?: boolean;
  comingSoon?: boolean;
}

const navigation: NavigationItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, onboardingId: "dashboard", tabName: "dashboard" },
  { name: "Orders", href: "/orders", icon: ShoppingCart, onboardingId: "orders", tabName: "orders" },
  { name: "Products", href: "/products", icon: Package, onboardingId: "products-list", tabName: "products" },
  { name: "Promotions", href: "/promotions", icon: Tag, tabName: "products" },
  { name: "Customers", href: "/customers", icon: Users, onboardingId: "customer-groups", tabName: "customers" },
  { name: "Broadcast", href: "/campaigns", icon: MessageSquare, onboardingId: "campaigns", tabName: "campaigns" },
  { name: "Marketplace", href: "#", icon: Store, tabName: "marketplace", comingSoon: true },
  { name: "Integrations", href: "/integrations", icon: Puzzle, tabName: "integrations" },
  { name: "Team Management", href: "/team-management", icon: Contact, tabName: "team-management" },
  { name: "Finance", href: "/financials", icon: Banknote, tabName: "finance" },
  { name: "Subscription", href: "/subscription-pricing", icon: Crown, tabName: "subscription" },
  { name: "Help Hub", href: "/help", icon: HelpCircle, tabName: "settings" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { checkTabAccess } = useSidebarPermissions();

  // Get current subscription to check for premium features
  const { data: subscriptionData } = useQuery({
    queryKey: ['/api/subscriptions/current'],
    enabled: !!user,
  });

  const isPremiumUser = subscriptionData?.user?.currentPlan === 'premium';
  const isStandardUser = subscriptionData?.user?.currentPlan === 'standard';
  const isFreeUser = !isPremiumUser && !isStandardUser;

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      {/* Mobile Menu Button - only show when sidebar is closed */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="lg:hidden fixed top-4 left-4 z-[60] p-2 bg-slate-900 text-white rounded-md shadow-md border border-slate-700"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Mobile Overlay */}
      {!isCollapsed && (
        <div 
          className="lg:hidden fixed inset-0 z-[40] bg-black bg-opacity-60 backdrop-blur-sm"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "bg-slate-900 h-screen fixed left-0 top-0 z-[50] transition-transform duration-300 flex flex-col",
        "w-64",
        isCollapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0",
        "lg:translate-x-0 lg:block"
      )}>
        {/* Header / Logo */}
        <div className="px-5 py-5 border-b border-slate-700/60 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <Logo size="lg" />
              <p className="text-xs text-slate-400 font-medium truncate max-w-[170px]">
                {user?.businessName || "Wholesale Business"}
              </p>
            </div>
            
            {/* Mobile close button */}
            <button
              onClick={() => setIsCollapsed(true)}
              className="lg:hidden p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-3 space-y-0.5">
            {navigation.map((item) => {
              const IconComponent = item.icon;
              const isActive = location === item.href && item.href !== "#";
              const isPremiumFeature = item.premiumOnly;
              const isLocked = isPremiumFeature && isFreeUser;
              const isComingSoon = item.comingSoon;
              const hasAccess = checkTabAccess(item.tabName);
              if (!hasAccess) return null;

              return (
                <Link key={item.name} href={isComingSoon ? "#" : isLocked ? "/subscription-pricing" : item.href}>
                  <div
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
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
                      setIsCollapsed(true);
                    }}
                    data-onboarding={item.onboardingId}
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      <IconComponent 
                        className={cn(
                          "mr-3 h-4 w-4 flex-shrink-0",
                          isActive ? "text-emerald-400" : (isLocked || isComingSoon) ? "text-slate-600" : "text-slate-500"
                        )} 
                      />
                      <span className="flex-1 truncate">{item.name}</span>
                    </div>
                    {isLocked && (
                      <Crown className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    )}
                    {isComingSoon && (
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-medium border border-slate-700">
                        Soon
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
        
        {/* User Profile & Actions */}
        <div className="flex-shrink-0 border-t border-slate-700/60 p-4 space-y-2">
          <div className="flex items-center gap-3 px-1 mb-1">
            <div className="w-8 h-8 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-emerald-400">
                {user?.firstName?.charAt(0) || 'U'}{user?.lastName?.charAt(0) || ''}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <Link href="/settings">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 h-9"
              data-onboarding="settings"
            >
              <Settings className="mr-2.5 h-4 w-4" />
              Settings
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start text-slate-500 hover:text-red-400 hover:bg-red-500/10 h-9"
            onClick={handleLogout}
          >
            <LogOut className="mr-2.5 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </>
  );
}
