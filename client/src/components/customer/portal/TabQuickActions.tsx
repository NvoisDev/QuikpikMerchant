import { Store, History, ShoppingCart, X, Tag } from "lucide-react";
import type { CartItem } from "@/components/customer/portal-types";

interface TabQuickActionsProps {
  setActiveTab: (tab: string) => void;
  cart: CartItem[];
  setShowCheckout: (show: boolean) => void;
  isCreatingIntent: boolean;
  handleLogout: () => void;
  priceDisplayMode?: string;
  onRequestQuote?: () => void;
}

export function TabQuickActions({
  setActiveTab,
  cart,
  setShowCheckout,
  isCreatingIntent,
  handleLogout,
  priceDisplayMode,
  onRequestQuote,
}: TabQuickActionsProps) {
  const pricesHidden = priceDisplayMode !== 'shown';

  const handleCartAction = async () => {
    if (cart.length === 0) {
      setActiveTab("products");
      return;
    }
    if (pricesHidden && onRequestQuote) {
      onRequestQuote();
    } else {
      setShowCheckout(true);
    }
  };

  return (
    <div className="flex items-center justify-around px-1 py-1">
      <button onClick={() => setActiveTab("products")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><Store className="w-4 h-4 text-theme-primary" /></div>
        <span className="text-[10px] font-medium text-gray-600">Shop</span>
      </button>
      <button onClick={() => setActiveTab("orders")} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary"><History className="w-4 h-4 text-theme-primary" /></div>
        <span className="text-[10px] font-medium text-gray-600">Orders</span>
      </button>
      <button
        onClick={handleCartAction}
        disabled={isCreatingIntent}
        className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 relative"
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-theme-secondary relative">
          {pricesHidden && cart.length > 0 ? (
            <Tag className="w-4 h-4 text-theme-primary" />
          ) : (
            <ShoppingCart className="w-4 h-4 text-theme-primary" />
          )}
          {cart.length > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center bg-theme-primary">{cart.length}</span>}
        </div>
        <span className="text-[10px] font-medium text-gray-600">
          {cart.length > 0 ? (pricesHidden ? "Request" : "Checkout") : "Cart"}
        </span>
      </button>
      <button onClick={handleLogout} className="flex flex-col items-center gap-1.5 px-4 py-1 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors">
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-50"><X className="w-4 h-4 text-red-400" /></div>
        <span className="text-[10px] font-medium text-gray-600">Sign Out</span>
      </button>
    </div>
  );
}
