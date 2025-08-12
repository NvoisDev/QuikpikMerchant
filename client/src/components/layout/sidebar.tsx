import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
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
  Megaphone
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, onboardingId: "dashboard", tabName: "dashboard" },
  { name: "Products", href: "/products", icon: Package, onboardingId: "products-list", tabName: "products" },
  { name: "Customers", href: "/customers", icon: Users, onboardingId: "customer-groups", tabName: "customers" },
  { name: "Orders", href: "/orders", icon: ShoppingCart, onboardingId: "orders", tabName: "orders" },

  { name: "Broadcast", href: "/campaigns", icon: MessageSquare, onboardingId: "campaigns", tabName: "campaigns" },
  { name: "Team Management", href: "/team-management", icon: Contact, tabName: "team-management" },
  { name: "Subscription", href: "/subscription", icon: CreditCard, tabName: "subscription" },
  { name: "Business Performance", href: "/business-performance", icon: TrendingUp, premiumOnly: true, tabName: "analytics" },
  { name: "Advertising", href: "/advertising", icon: Megaphone, premiumOnly: true, tabName: "advertising" },
  { name: "Marketplace", href: "/marketplace", icon: Store, premiumOnly: true, tabName: "marketplace" },
  { name: "Help Hub", href: "/help", icon: HelpCircle, tabName: "settings" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { currentTier } = useSubscription();
  const { checkTabAccess } = useSidebarPermissions();

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="lg:hidden fixed top-4 left-4 z-[60] p-2 bg-white rounded-md shadow-md border"
      >
        {isCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
      </button>

      {/* Mobile Overlay */}
      {!isCollapsed && (
        <div 
          className="lg:hidden fixed inset-0 z-[40] bg-black bg-opacity-50"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "bg-white shadow-lg h-screen fixed left-0 top-0 z-[50] transition-transform duration-300",
        "w-64",
        isCollapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0",
        "lg:translate-x-0 lg:block"
      )}>
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <Logo size="lg" className="mb-2" />
              <p className="text-xs text-gray-600">
                {user?.businessName || "Wholesale Business"}
              </p>
            </div>
            
            {/* Mobile close button */}
            <button
              onClick={() => setIsCollapsed(true)}
              className="lg:hidden p-1 hover:bg-gray-100 rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="mt-6 flex-1 pb-48 overflow-y-auto">
          {navigation.map((item) => {
            const IconComponent = item.icon;
            const isActive = location === item.href;
            const isPremiumFeature = item.premiumOnly;
            const hasPremiumAccess = !isPremiumFeature || currentTier === 'premium';
            
            // Show premium lock for premium features without access
            if (isPremiumFeature && !hasPremiumAccess) {
              return (
                <div key={item.name} className="px-6 py-2">
                  <div className="flex items-center text-sm font-medium text-gray-400 cursor-not-allowed relative">
                    <IconComponent className="mr-3 h-5 w-5" />
                    <span className="flex-1">{item.name}</span>
                    <div className="flex items-center space-x-1 ml-2">
                      <Crown className="h-3 w-3" />
                      <Lock className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={cn(
                    "flex items-center px-6 py-2 text-sm font-medium transition-colors cursor-pointer relative",
                    isActive
                      ? "text-primary bg-blue-50 border-r-4 border-primary"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  )}
                  onClick={() => setIsCollapsed(true)}
                  data-onboarding={item.onboardingId}
                >
                  <IconComponent 
                    className={cn(
                      "mr-3 h-5 w-5 flex-shrink-0",
                      isActive ? "text-primary" : "text-gray-400"
                    )} 
                  />
                  <span className="flex-1">{item.name}</span>
                  {isPremiumFeature && (
                    <Crown className="h-3 w-3 text-yellow-500 ml-2 flex-shrink-0" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
        
        {/* User Profile & Actions */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-white">
                {user?.firstName?.charAt(0) || 'U'}{user?.lastName?.charAt(0) || ''}
              </span>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <Link href="/settings">
              <Button variant="ghost" size="sm" className="w-full justify-start" data-onboarding="settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}