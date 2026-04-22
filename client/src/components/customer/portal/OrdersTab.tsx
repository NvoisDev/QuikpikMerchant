import { Suspense } from "react";
import { ShoppingCart, Banknote, History } from "lucide-react";
import { LazyOrderHistory, ComponentLoader } from "@/components/LazyComponents";
import { PriceDisplay } from "@/components/customer/PriceDisplay";
import { TabQuickActions } from "./TabQuickActions";
import type { CartItem } from "@/components/customer/portal-types";

interface OrdersTabProps {
  setActiveTab: (tab: string) => void;
  cart: CartItem[];
  setShowCheckout: (show: boolean) => void;
  isCreatingIntent: boolean;
  handleLogout: () => void;
  isPreviewMode: boolean;
  cartStats: { totalValue: number };
  wholesaler: any;
  customerOrderStats: any;
  authenticatedCustomer: any;
}

export function OrdersTab({
  setActiveTab,
  cart,
  setShowCheckout,
  isCreatingIntent,
  handleLogout,
  isPreviewMode,
  cartStats,
  wholesaler,
  customerOrderStats,
  authenticatedCustomer,
}: OrdersTabProps) {
  return (
    <>
      <TabQuickActions
        setActiveTab={setActiveTab}
        cart={cart}
        setShowCheckout={setShowCheckout}
        isCreatingIntent={isCreatingIntent}
        handleLogout={handleLogout}
      />

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-2">
        {/* Cart Items */}
        <div
          className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => { if (!isPreviewMode && cart.length > 0) { setShowCheckout(true); } }}
        >
          <div className="flex flex-col items-center text-center gap-0.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
            </div>
            <p className="text-lg sm:text-xl font-extrabold leading-none text-theme-primary">
              {cart.reduce((total, item) => total + item.quantity, 0)}
            </p>
            <p className="text-[10px] text-gray-500 font-medium">In Cart</p>
            {cart.length > 0 && (
              <p className="text-[10px] text-gray-400 leading-none">Tap to checkout</p>
            )}
          </div>
        </div>

        {/* Cart Value */}
        <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm">
          <div className="flex flex-col items-center text-center gap-0.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
              <Banknote className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
            </div>
            <div className="font-extrabold leading-none text-theme-primary">
              <PriceDisplay
                price={cartStats.totalValue}
                currency={wholesaler?.defaultCurrency || 'GBP'}
                isGuestMode={false}
                size="medium"
              />
            </div>
            <p className="text-[10px] text-gray-500 font-medium">Cart Total</p>
          </div>
        </div>

        {/* Total Orders */}
        <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm">
          <div className="flex flex-col items-center text-center gap-0.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
            </div>
            <p className="text-lg sm:text-xl font-extrabold leading-none text-theme-primary">
              {customerOrderStats?.totalOrders || 0}
            </p>
            <p className="text-[10px] text-gray-500 font-medium">Orders</p>
          </div>
        </div>
      </div>

      {/* Customer Order History */}
      {authenticatedCustomer && wholesaler?.id && (
        <Suspense fallback={<ComponentLoader />}>
          <LazyOrderHistory
            wholesalerId={wholesaler.id}
            customerPhone={authenticatedCustomer.phone || authenticatedCustomer.phoneNumber || '+447507659550'}
            currency={wholesaler?.defaultCurrency || 'GBP'}
          />
        </Suspense>
      )}
    </>
  );
}
