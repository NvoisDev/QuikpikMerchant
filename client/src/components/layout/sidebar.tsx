import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Logo from "@/components/ui/logo";
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingCart, 
  MessageSquare, 
  BarChart3,
  CreditCard,
  Settings,
  LogOut,
  Store,
  Menu,
  X,
  Lock,
  HelpCircle,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Products", href: "/products", icon: Package },
  { name: "Customer Groups", href: "/customer-groups", icon: Users },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Broadcast", href: "/campaigns", icon: MessageSquare },
  { name: "Subscription", href: "/subscription", icon: CreditCard },
  { name: "Business Performance", href: "/business-performance", icon: BarChart3 },
  { name: "Marketplace (coming soon)", href: "/marketplace", icon: Store },
  { name: "Help Hub", href: "/help", icon: HelpCircle },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md border"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile Overlay */}
      {!isCollapsed && (
        <div 
          className="lg:hidden fixed inset-0 z-30 bg-black bg-opacity-50"
          onClick={() => setIsCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "bg-white shadow-lg h-screen fixed left-0 top-0 z-40 transition-transform duration-300",
        "w-64",
        isCollapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0",
        "lg:translate-x-0 lg:block"
      )}>
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
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
        <nav className="mt-6 flex-1">
          {navigation.map((item) => {
            const IconComponent = item.icon;
            const isActive = location === item.href;
            
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={cn(
                    "flex items-center px-6 py-3 text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "text-primary bg-blue-50 border-r-4 border-primary"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  )}
                  onClick={() => setIsCollapsed(true)} // Close mobile menu on click
                >
                  <IconComponent 
                    className={cn(
                      "mr-3 h-5 w-5",
                      isActive ? "text-primary" : "text-gray-400"
                    )} 
                  />
                  <span>{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>
        
        {/* User Profile & Actions */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex items-center mb-4">
            <img 
              src={user?.profileImageUrl || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=50&h=50"} 
              alt="Profile" 
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Link href="/settings">
              <Button variant="ghost" size="sm" className="w-full justify-start">
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