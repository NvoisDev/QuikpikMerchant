import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
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
  Store
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Products", href: "/products", icon: Package },
  { name: "Marketplace", href: "/marketplace", icon: Store },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Broadcasts", href: "/broadcasts", icon: MessageSquare },
  { name: "Subscription", href: "/subscription", icon: CreditCard },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [location] = useLocation();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="w-64 bg-white shadow-lg h-screen fixed left-0 top-0 z-40">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-primary">Quikpik Merchant</h2>
        <p className="text-sm text-gray-600 mt-1">
          {user?.businessName || "Wholesale Business"}
        </p>
      </div>
      
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
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
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
  );
}
