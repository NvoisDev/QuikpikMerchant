import { Store, ShoppingCart, Banknote, History, TrendingUp, ChevronRight, ChevronDown, ShoppingBag, Minus, Plus, Package } from "lucide-react";
import { InstallBanner } from "@/components/InstallBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Package2, Hash } from "lucide-react";
import { ProductGridSkeleton } from "@/components/ui/loading-skeletons";
import { RecentOrdersSection } from "@/components/customer/RecentOrdersSection";
import { PriceDisplay } from "@/components/customer/PriceDisplay";
import { TabQuickActions } from "./TabQuickActions";
import type { CartItem, ExtendedProduct, Product, WholesalerPortal, AuthenticatedCustomer, CustomerOrderStats, PromotionalPricing } from "@/components/customer/portal-types";
import { formatCurrency } from "@/lib/currencies";

interface HomeTabProps {
  setActiveTab: (tab: string) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setShowCheckout: (show: boolean) => void;
  isCreatingIntent: boolean;
  handleLogout: () => void;
  isPreviewMode: boolean;
  isTrueGuestMode: boolean;
  cartStats: { totalValue: number };
  wholesaler: WholesalerPortal | null;
  wholesalerId: string | undefined;
  customerOrderStats: CustomerOrderStats | null;
  authenticatedCustomer: AuthenticatedCustomer | null;
  productsLoading: boolean;
  products: Product[];
  calculatePromotionalPricing: (product: Product, quantity: number) => PromotionalPricing;
  addToCart: (product: ExtendedProduct, quantity: number, sellingType: "units" | "pallets") => void;
  quantityInputValues: Record<number, string>;
  setQuantityInputValues: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  showMOQWarnings: Record<number, boolean>;
  setShowMOQWarnings: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  showQuantityHints: Record<number, boolean>;
  setShowQuantityHints: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  activeQuantityInput: number | null;
  setActiveQuantityInput: (v: number | null) => void;
  setSelectedProductForModal: (p: ExtendedProduct | null) => void;
  setModalStep: (s: 'type' | 'quantity') => void;
  setSelectedModalType: (t: 'units' | 'pallets' | null) => void;
  setModalQuantity: (q: number) => void;
  setShowUnitSelectionModal: (v: boolean) => void;
  setShowStoreSwitcher: (v: boolean) => void;
}

export function HomeTab({
  setActiveTab,
  cart,
  setCart,
  setShowCheckout,
  isCreatingIntent,
  handleLogout,
  isPreviewMode,
  isTrueGuestMode,
  cartStats,
  wholesaler,
  wholesalerId,
  customerOrderStats,
  authenticatedCustomer,
  productsLoading,
  products,
  calculatePromotionalPricing,
  addToCart,
  quantityInputValues,
  setQuantityInputValues,
  showMOQWarnings,
  setShowMOQWarnings,
  showQuantityHints,
  setShowQuantityHints,
  activeQuantityInput,
  setActiveQuantityInput,
  setSelectedProductForModal,
  setModalStep,
  setSelectedModalType,
  setModalQuantity,
  setShowUnitSelectionModal,
  setShowStoreSwitcher,
}: HomeTabProps) {
  return (
    <>
      <TabQuickActions
        setActiveTab={setActiveTab}
        cart={cart}
        setShowCheckout={setShowCheckout}
        isCreatingIntent={isCreatingIntent}
        handleLogout={handleLogout}
      />

      <InstallBanner />

      {/* Welcome Hero Banner */}
      <div className="rounded-2xl px-6 py-7 text-white relative overflow-hidden animate-fade-in gradient-theme-banner">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white opacity-5 pointer-events-none" />
        <div className="absolute -bottom-10 -left-6 w-32 h-32 rounded-full bg-white opacity-5 pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between relative z-10 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold mb-1 leading-tight tracking-tight">
              Hi, {authenticatedCustomer?.firstName || (authenticatedCustomer?.name?.split(' ')[0])} 👋
            </h1>
            <button
              onClick={() => setShowStoreSwitcher(true)}
              className="flex items-center gap-1.5 mt-0.5 opacity-80 hover:opacity-100 transition-opacity text-sm text-white"
            >
              <span>Shopping at</span>
              <span className="font-semibold opacity-100 bg-white/20 hover:bg-white/30 transition-colors px-2 py-0.5 rounded-full flex items-center gap-1">
                {wholesaler?.businessName}
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
              </span>
            </button>
            {customerOrderStats && customerOrderStats.totalOrders > 0 && (
              <div className="mt-3 flex items-center gap-4 text-sm opacity-90">
                <span className="flex items-center gap-1">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  {customerOrderStats.totalOrders} orders
                </span>
                <span className="flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5" />
                  {formatCurrency(customerOrderStats.totalSpent || 0, wholesaler?.defaultCurrency || 'GBP')} spent
                </span>
              </div>
            )}
          </div>
          <Button
            onClick={() => setActiveTab("products")}
            className="bg-white hover:bg-gray-50 border-0 rounded-full px-5 font-semibold shadow-sm flex-shrink-0 self-start sm:self-auto text-theme-primary"
          >
            <Store className="w-4 h-4 mr-2" />
            Browse Products
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
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
        <div className="bg-white rounded-xl p-2 sm:p-3 border border-gray-100 shadow-sm cursor-pointer" onClick={() => setActiveTab("orders")}>
          <div className="flex flex-col items-center text-center gap-0.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-theme-secondary">
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
            </div>
            <p className="text-lg sm:text-xl font-extrabold leading-none text-theme-primary">
              {customerOrderStats?.totalOrders || 0}
            </p>
            <p className="text-[10px] text-gray-500 font-medium">Orders</p>
            {(customerOrderStats?.totalOrders || 0) > 0 && (
              <p className="text-[10px] text-gray-400 leading-none">Tap to view</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      {authenticatedCustomer?.phone && wholesalerId && (
        <RecentOrdersSection
          wholesalerId={wholesalerId}
          customerPhone={authenticatedCustomer.phone}
          onViewAllOrders={() => setActiveTab("orders")}
          defaultCurrency={wholesaler?.defaultCurrency}
        />
      )}

      {/* Top Selling Products */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-extrabold text-gray-950 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-theme-primary" />
            Top Selling
          </h2>
          <button
            onClick={() => setActiveTab("products")}
            className="text-sm font-medium flex items-center gap-1 hover:underline text-theme-primary"
          >
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {productsLoading ? (
          <ProductGridSkeleton />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products?.slice(0, 3).map((product) => {
              const cartItemUnitsHome = cart.find(item => item.product.id === product.id && item.sellingType === 'units');
              const cartItemPalletsHome = cart.find(item => item.product.id === product.id && item.sellingType === 'pallets');
              const cartItem = cartItemUnitsHome || cartItemPalletsHome;
              const hasPalletPricingHome = !!product.palletPrice && parseFloat(product.palletPrice?.toString() || '0') > 0;
              const pricing = calculatePromotionalPricing(product, product.moq);

              return (
                <Card key={product.id} className="h-full animate-fade-in group cursor-pointer rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 bg-white"
                      style={{animationDelay: `${Math.random() * 0.3}s`}}>
                  <CardContent className="p-0">
                    <div className="space-y-0">
                      {/* Product Image */}
                      <div className="relative h-44 bg-gray-50 overflow-hidden">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-8 h-8 text-gray-300" />
                          </div>
                        )}
                        {pricing.promoLabel && (
                          <div className={`absolute top-2 left-2 text-white px-2 py-1 rounded text-xs font-bold ${pricing.promoType === 'clearance' ? 'bg-orange-500' : pricing.promoType === 'buy_x_get_y_free' ? 'bg-purple-500' : pricing.promoType === 'bundle_deal' ? 'bg-blue-500' : 'bg-red-500'}`}>
                            {pricing.promoType === 'clearance' ? '🏷️' : '🔥'} {pricing.promoLabel}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-300 flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white text-xs font-medium">
                            Quick View
                          </div>
                        </div>
                      </div>

                      {/* Product Info */}
                      <div className="p-4 space-y-3">
                        <div>
                          <h3 className="font-bold text-gray-900 text-sm line-clamp-1 tracking-tight group-hover:text-theme-primary transition-colors duration-300">
                            {product.name}
                          </h3>
                          <div className="flex items-center justify-between mt-1">
                            <PriceDisplay
                              price={pricing.effectivePrice}
                              originalPrice={pricing.effectivePrice !== pricing.originalPrice ? pricing.originalPrice : undefined}
                              currency={wholesaler?.defaultCurrency || 'GBP'}
                              isGuestMode={isTrueGuestMode}
                              size="medium"
                              showStrikethrough={true}
                            />
                            <span className="text-xs text-gray-400">MOQ: {product.moq}</span>
                          </div>
                          {hasPalletPricingHome && !cartItemUnitsHome && !cartItemPalletsHome && (
                            <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                              <span>🚛</span>
                              <span>Pallet: {formatCurrency(product.palletPrice || 0)} / pallet — Min {product.palletMoq || 1}</span>
                            </p>
                          )}
                        </div>

                        {/* Stock Availability Indicator */}
                        <div className="flex items-center gap-3">
                          {product.sellingFormat === 'units' && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="font-medium text-green-700 text-xs">
                                <Hash className="w-3 h-3 inline mr-1" />
                                {product.stock || 0} packs
                              </span>
                            </div>
                          )}
                          {product.sellingFormat === 'pallets' && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-blue-500" />
                              <span className="font-medium text-blue-700 text-xs">
                                <Package2 className="w-3 h-3 inline mr-1" />
                                {product.palletStock || 0} pallets
                              </span>
                            </div>
                          )}
                          {product.sellingFormat === 'both' && (
                            <>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="font-medium text-green-700 text-xs">
                                  <Hash className="w-3 h-3 inline mr-1" />
                                  {product.stock || 0} packs
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <span className="font-medium text-blue-700 text-xs">
                                  <Package2 className="w-3 h-3 inline mr-1" />
                                  {product.palletStock || 0} pallets
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Quick Order Controls */}
                        {cartItem ? (
                          <div className="space-y-2">
                            {hasPalletPricingHome && (cartItemUnitsHome || cartItemPalletsHome) && !(cartItemUnitsHome && cartItemPalletsHome) && (
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cartItemUnitsHome ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {cartItemUnitsHome ? '📦 Units ✓' : '🚛 Pallets ✓'}
                                </span>
                                <button
                                  onClick={() => {
                                    setCart(cart.filter(item => item.product.id !== product.id));
                                    setSelectedProductForModal(product as ExtendedProduct);
                                    setModalStep('type');
                                    setSelectedModalType(null);
                                    setModalQuantity(product.moq || 1);
                                    setShowUnitSelectionModal(true);
                                  }}
                                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                                >
                                  Change type
                                </button>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (cartItem.quantity <= product.moq) {
                                    setCart(cart.filter(item => item.product.id !== product.id));
                                  } else {
                                    setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity - 1 } : item));
                                  }
                                }}
                                className="h-8 w-8 p-0 flex-shrink-0"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <div className="relative flex-1">
                                <Input
                                  type="number"
                                  value={quantityInputValues[product.id] !== undefined ? quantityInputValues[product.id] : cartItem.quantity}
                                  onChange={(e) => {
                                    const inputValue = e.target.value;
                                    setQuantityInputValues(prev => ({ ...prev, [product.id]: inputValue }));
                                    const parsedValue = parseInt(inputValue) || 0;
                                    setShowMOQWarnings(prev => ({ ...prev, [product.id]: parsedValue > 0 && parsedValue < product.moq }));
                                  }}
                                  onFocus={() => {
                                    setActiveQuantityInput(product.id);
                                    setShowQuantityHints(prev => ({ ...prev, [product.id]: true }));
                                  }}
                                  onBlur={() => {
                                    const inputValue = quantityInputValues[product.id];
                                    const parsedValue = parseInt(inputValue) || 0;
                                    if (parsedValue === 0) {
                                      setCart(cart.filter(item => item.product.id !== product.id));
                                    } else {
                                      const validQuantity = Math.max(product.moq, parsedValue);
                                      const maxQuantity = Math.min(validQuantity, product.stock);
                                      setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: maxQuantity } : item));
                                    }
                                    setQuantityInputValues(prev => { const s = { ...prev }; delete s[product.id]; return s; });
                                    setShowMOQWarnings(prev => ({ ...prev, [product.id]: false }));
                                    setShowQuantityHints(prev => ({ ...prev, [product.id]: false }));
                                    setActiveQuantityInput(null);
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                  min={0}
                                  max={product.stock}
                                  className={`w-full h-8 text-center text-sm ${showMOQWarnings[product.id] ? 'border-amber-400 bg-amber-50' : activeQuantityInput === product.id ? 'border-blue-400 bg-blue-50' : ''}`}
                                  placeholder={product.moq.toString()}
                                />
                                {showMOQWarnings[product.id] && (
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-amber-100 border border-amber-300 rounded-md px-2 py-1 text-xs text-amber-800 whitespace-nowrap shadow-sm">
                                    Min: {product.moq} units
                                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-amber-100 border-l border-t border-amber-300 rotate-45"></div>
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))}
                                className="h-8 w-8 p-0 flex-shrink-0"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <Button
                              className="w-full rounded-full font-semibold text-white bg-theme-primary"
                              onClick={() => {
                                if (hasPalletPricingHome) {
                                  setSelectedProductForModal(product as ExtendedProduct);
                                  setModalStep('type');
                                  setSelectedModalType(null);
                                  setModalQuantity(product.moq || 1);
                                  setShowUnitSelectionModal(true);
                                } else {
                                  addToCart(product as ExtendedProduct, product.moq, 'units');
                                }
                              }}
                              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.9'; }}
                              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1.5" />
                              {hasPalletPricingHome ? 'Add to Cart →' : 'Add to Cart'}
                            </Button>
                            {hasPalletPricingHome && (
                              <p className="text-xs text-gray-500 text-center mt-1">Choose type: units or pallets</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
