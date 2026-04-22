import { useRef } from "react";
import { ShoppingCart, Banknote, History, Search, Grid, List, Package, ArrowLeft, ArrowRight, Minus, Plus } from "lucide-react";
import { Package2, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerProductCardSkeleton } from "@/components/customer/CustomerPortalSkeletons";
import { PriceDisplay } from "@/components/customer/PriceDisplay";
import { TabQuickActions } from "./TabQuickActions";
import type { CartItem, ExtendedProduct, Product } from "@/components/customer/portal-types";
import { cleanAIDescription } from "@shared/utils";

interface ProductsTabProps {
  setActiveTab: (tab: string) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setShowCheckout: (show: boolean) => void;
  isCreatingIntent: boolean;
  handleLogout: () => void;
  isPreviewMode: boolean;
  isTrueGuestMode: boolean;
  cartStats: { totalValue: number };
  wholesaler: any;
  customerOrderStats: any;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedCategory: string;
  setSelectedCategory: (v: string) => void;
  categories: string[];
  viewMode: "grid" | "list";
  setViewMode: (v: "grid" | "list") => void;
  productImageIndexes: Record<number, number>;
  setProductImageIndexes: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  carouselTouchStartX: React.MutableRefObject<number>;
  productsLoading: boolean;
  productsError: any;
  refetchProducts: () => void;
  filteredProducts: Product[];
  quantityInputValues: Record<string, string>;
  setQuantityInputValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showMOQWarnings: Record<number, boolean>;
  setShowMOQWarnings: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  showQuantityHints: Record<number, boolean>;
  setShowQuantityHints: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  activeQuantityInput: number | null;
  setActiveQuantityInput: (v: number | null) => void;
  getQuantitySuggestions: (product: ExtendedProduct, currentQuantity?: number) => any[];
  calculatePromotionalPricing: (product: Product, quantity: number) => any;
  addToCart: (product: ExtendedProduct, quantity: number, sellingType: "units" | "pallets") => void;
  setSelectedProductForModal: (p: ExtendedProduct | null) => void;
  setModalStep: (s: 'type' | 'quantity') => void;
  setSelectedModalType: (t: 'units' | 'pallets' | null) => void;
  setModalQuantity: (q: number) => void;
  setShowUnitSelectionModal: (v: boolean) => void;
}

export function ProductsTab({
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
  customerOrderStats,
  searchTerm,
  setSearchTerm,
  selectedCategory,
  setSelectedCategory,
  categories,
  viewMode,
  setViewMode,
  productImageIndexes,
  setProductImageIndexes,
  carouselTouchStartX,
  productsLoading,
  productsError,
  refetchProducts,
  filteredProducts,
  quantityInputValues,
  setQuantityInputValues,
  showMOQWarnings,
  setShowMOQWarnings,
  showQuantityHints,
  setShowQuantityHints,
  activeQuantityInput,
  setActiveQuantityInput,
  getQuantitySuggestions,
  calculatePromotionalPricing,
  addToCart,
  setSelectedProductForModal,
  setModalStep,
  setSelectedModalType,
  setModalQuantity,
  setShowUnitSelectionModal,
}: ProductsTabProps) {
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

      {/* Sticky search + filter toolbar */}
      <div className="sticky top-16 z-30 bg-white -mx-4 px-4 pt-2 pb-3 border-b border-gray-100 space-y-3 sm:mx-0 sm:px-4 sm:border sm:rounded-xl sm:shadow-sm sm:border-gray-100">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 rounded-full border-gray-200"
            />
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? '' : 'hover:bg-gray-100'}`}
              style={viewMode === 'grid' ? {backgroundColor: 'var(--theme-secondary)'} : {}}
            >
              <Grid className="w-4 h-4" style={viewMode === 'grid' ? {color: 'var(--theme-primary)'} : {color: '#6b7280'}} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? '' : 'hover:bg-gray-100'}`}
              style={viewMode === 'list' ? {backgroundColor: 'var(--theme-secondary)'} : {}}
            >
              <List className="w-4 h-4" style={viewMode === 'list' ? {color: 'var(--theme-primary)'} : {color: '#6b7280'}} />
            </button>
          </div>
        </div>

        {/* Category pills */}
        <div className="flex overflow-x-auto gap-2 pb-1" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
          <button
            onClick={() => setSelectedCategory("all")}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === 'all' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            style={selectedCategory === 'all' ? {backgroundColor: 'var(--theme-primary)'} : {}}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category || '')}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === category ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              style={selectedCategory === category ? {backgroundColor: 'var(--theme-primary)'} : {}}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Hidden fallback Select */}
        <div className="hidden">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category || ''}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Product count */}
      {!productsLoading && !productsError && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-gray-500">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
            {(searchTerm || selectedCategory !== 'all') && ' found'}
          </p>
        </div>
      )}

      {/* Products Display */}
      <div className="space-y-4">
        {productsLoading ? (
          <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" : "space-y-4"}>
            {[...Array(6)].map((_, i) => (
              <CustomerProductCardSkeleton key={i} />
            ))}
          </div>
        ) : productsError ? (
          <div className="text-center py-16">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load products</h3>
            <p className="text-gray-500 mb-4">There was an error loading the product catalog.</p>
            <Button onClick={() => refetchProducts()} variant="outline">
              Try Again
            </Button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
            <p className="text-gray-500">
              {searchTerm || selectedCategory !== "all"
                ? "Try adjusting your search or filters"
                : "This store doesn't have any products available yet."
              }
            </p>
          </div>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" : "space-y-4"}>
            {filteredProducts.map((product) => {
              const pricing = calculatePromotionalPricing(product, 1);
              const cartItemUnits = cart.find(item => item.product.id === product.id && item.sellingType === 'units');
              const cartItemPallets = cart.find(item => item.product.id === product.id && item.sellingType === 'pallets');
              const cartItem = cartItemUnits || cartItemPallets;
              const hasPalletPricing = !!(product.palletPrice && parseFloat(product.palletPrice.toString()) > 0);

              return viewMode === "grid" ? (
                <Card key={product.id} className="group rounded-2xl overflow-hidden border border-gray-100 hover:border-[var(--theme-primary)] hover:shadow-lg transition-all duration-200 bg-white">
                  <CardContent className="p-0">
                    {/* Product Image Gallery */}
                    <div className="relative aspect-[4/3] bg-white overflow-hidden border-b border-gray-100">
                      {(() => {
                        const allImages = [
                          ...(product.imageUrl ? [product.imageUrl] : []),
                          ...((product as any).images || []).filter((img: string) => img !== product.imageUrl)
                        ].filter(Boolean);
                        const currentImageIndex = productImageIndexes[product.id] || 0;

                        if (allImages.length === 0) {
                          return (
                            <div className="w-full h-full flex items-center justify-center bg-gray-50">
                              <Package className="w-12 h-12 text-gray-300" />
                            </div>
                          );
                        }
                        if (allImages.length === 1) {
                          return (
                            <img
                              src={allImages[0]}
                              alt={product.name}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200 p-2"
                            />
                          );
                        }
                        return (
                          <div
                            className="relative w-full h-full"
                            onTouchStart={(e) => { carouselTouchStartX.current = e.touches[0].clientX; }}
                            onTouchEnd={(e) => {
                              const diff = carouselTouchStartX.current - e.changedTouches[0].clientX;
                              if (Math.abs(diff) >= 40) {
                                setProductImageIndexes(prev => ({
                                  ...prev,
                                  [product.id]: diff > 0
                                    ? (currentImageIndex === allImages.length - 1 ? 0 : currentImageIndex + 1)
                                    : (currentImageIndex === 0 ? allImages.length - 1 : currentImageIndex - 1)
                                }));
                              }
                            }}
                          >
                            <img
                              src={allImages[currentImageIndex]}
                              alt={`${product.name} - Image ${currentImageIndex + 1}`}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200 p-2"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductImageIndexes(prev => ({
                                  ...prev,
                                  [product.id]: currentImageIndex === 0 ? allImages.length - 1 : currentImageIndex - 1
                                }));
                              }}
                              className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-1 transition-opacity opacity-0 group-hover:opacity-100"
                            >
                              <ArrowLeft className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductImageIndexes(prev => ({
                                  ...prev,
                                  [product.id]: currentImageIndex === allImages.length - 1 ? 0 : currentImageIndex + 1
                                }));
                              }}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-1 transition-opacity opacity-0 group-hover:opacity-100"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </button>
                            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
                              {allImages.map((_, index) => (
                                <button
                                  key={index}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProductImageIndexes(prev => ({ ...prev, [product.id]: index }));
                                  }}
                                  className={`w-2 h-2 rounded-full transition-all ${index === currentImageIndex ? 'bg-white shadow-md' : 'bg-white bg-opacity-50'}`}
                                />
                              ))}
                            </div>
                            <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded-full">
                              {currentImageIndex + 1}/{allImages.length}
                            </div>
                          </div>
                        );
                      })()}
                      {pricing.promoLabel && (
                        <div className="absolute top-2 left-2">
                          <Badge className={`text-xs text-white ${pricing.promoType === 'clearance' ? 'bg-orange-500' : pricing.promoType === 'buy_x_get_y_free' ? 'bg-purple-500' : pricing.promoType === 'bundle_deal' ? 'bg-blue-500' : 'bg-red-500'}`}>
                            {pricing.promoLabel}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-4 space-y-2">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 mb-1">
                          {product.name}
                        </h3>
                        {product.description && (
                          <p className="text-xs text-gray-500 line-clamp-2">
                            {cleanAIDescription(product.description)}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 mb-3">
                        <div className="flex flex-wrap gap-1 text-xs text-gray-600">
                          {(() => {
                            const packQuantity = (product as any).packQuantity || 1;
                            const unitSize = (product as any).unitSize;
                            const unitOfMeasure = (product as any).unitOfMeasure;
                            if (unitSize && unitOfMeasure) {
                              return (
                                <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-medium">
                                  {packQuantity} x {Math.round(parseFloat(unitSize))}{unitOfMeasure}
                                </span>
                              );
                            }
                            return null;
                          })()}
                          {(product.palletPrice && parseFloat(product.palletPrice.toString()) > 0) ? (
                            <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded font-medium">Units & Pallets</span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">Individual Units</span>
                          )}
                          {(product as any).size && (
                            <span className="bg-gray-100 px-2 py-1 rounded">Size: {(product as any).size}</span>
                          )}
                          {product.moq && product.moq > 1 && (
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium" title={`Minimum order: ${product.moq} units required`}>
                              Min: {product.moq} units
                            </span>
                          )}
                          {(product as any).brand && (
                            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">{(product as any).brand}</span>
                          )}
                        </div>

                        {/* Stock Indicator */}
                        <div className="mb-2 flex items-center gap-3">
                          {product.sellingFormat === 'units' && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="font-medium text-green-700 text-xs">
                                <Hash className="w-3 h-3 inline mr-1" />{product.stock || 0} packs
                              </span>
                            </div>
                          )}
                          {product.sellingFormat === 'pallets' && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-blue-500" />
                              <span className="font-medium text-blue-700 text-xs">
                                <Package2 className="w-3 h-3 inline mr-1" />{(product as any).palletStock || 0} pallets
                              </span>
                            </div>
                          )}
                          {product.sellingFormat === 'both' && (
                            <>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="font-medium text-green-700 text-xs">
                                  <Hash className="w-3 h-3 inline mr-1" />{product.stock || 0} packs
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <span className="font-medium text-blue-700 text-xs">
                                  <Package2 className="w-3 h-3 inline mr-1" />{(product as any).palletStock || 0} pallets
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        {product.moq && product.moq > 1 && (
                          <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200 inline-block">
                            {product.stock < product.moq ? (
                              <>💡 Last {product.stock} units available (normally {product.moq} min)</>
                            ) : (
                              <>💡 Minimum order: {product.moq} units required to add to cart</>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Pricing */}
                      <div className="flex items-end justify-between mt-2">
                        <div className="w-full">
                          <PriceDisplay
                            price={pricing.effectivePrice}
                            originalPrice={pricing.effectivePrice !== pricing.originalPrice ? pricing.originalPrice : undefined}
                            currency={'GBP'}
                            isGuestMode={isTrueGuestMode}
                            size="medium"
                            showStrikethrough={true}
                          />
                          {product.moq && product.moq > 1 && !cartItem && (
                            <p className="text-xs text-gray-500 mt-0.5">Min {product.moq} units</p>
                          )}
                          {hasPalletPricing && !cartItemUnits && !cartItemPallets && (
                            <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                              <span>🚛</span>
                              <span>Pallet: £{parseFloat((product as any).palletPrice?.toString() || '0').toFixed(2)} / pallet — Min {(product as any).palletMoq || 1}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Add to Cart Controls */}
                      <div className="mt-2 space-y-2">
                        {hasPalletPricing && (cartItemUnits || cartItemPallets) && !(cartItemUnits && cartItemPallets) && (
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cartItemUnits ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                              {cartItemUnits ? '📦 Units ✓' : '🚛 Pallets ✓'}
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

                        {/* Units stepper */}
                        {cartItemUnits && (
                          <div>
                            {cartItemPallets && <p className="text-xs font-medium text-emerald-700 text-center mb-1">📦 Units</p>}
                            <div className="flex items-center justify-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => {
                                if (cartItemUnits.quantity <= product.moq) {
                                  setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'units')));
                                } else {
                                  setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: item.quantity - 1} : item));
                                }
                              }} className="rounded-full h-8 w-8 p-0">
                                <Minus className="h-3 w-3" />
                              </Button>
                              <div className="relative">
                                <Input type="number"
                                  value={quantityInputValues[product.id] !== undefined ? quantityInputValues[product.id] : cartItemUnits.quantity}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setQuantityInputValues(prev => ({...prev, [product.id]: v}));
                                    const p = parseInt(v) || 0;
                                    setShowMOQWarnings(prev => ({...prev, [product.id]: p > 0 && p < product.moq}));
                                  }}
                                  onFocus={() => { setActiveQuantityInput(product.id); setShowQuantityHints(prev => ({...prev, [product.id]: true})); }}
                                  onBlur={() => {
                                    const v = quantityInputValues[product.id];
                                    const p = parseInt(v) || 0;
                                    if (p === 0) {
                                      setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'units')));
                                    } else {
                                      const qty = Math.min(Math.max(product.moq, p), product.stock);
                                      setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: qty} : item));
                                    }
                                    setQuantityInputValues(prev => { const s = {...prev}; delete s[product.id]; return s; });
                                    setShowMOQWarnings(prev => ({...prev, [product.id]: false}));
                                    setShowQuantityHints(prev => ({...prev, [product.id]: false}));
                                    setActiveQuantityInput(null);
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                  min={0} max={product.stock}
                                  className={`w-14 h-8 text-center rounded-lg text-sm ${showMOQWarnings[product.id] ? 'border-amber-400 bg-amber-50' : activeQuantityInput === product.id ? 'border-blue-400 bg-blue-50' : ''}`}
                                  placeholder={product.moq.toString()}
                                />
                                {showMOQWarnings[product.id] && (
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-amber-100 border border-amber-300 rounded-md px-2 py-1 text-xs text-amber-800 whitespace-nowrap shadow-sm">
                                    Min: {product.moq} units
                                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-amber-100 border-l border-t border-amber-300 rotate-45"></div>
                                  </div>
                                )}
                                {showQuantityHints[product.id] && activeQuantityInput === product.id && (
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg p-2 min-w-[200px]">
                                    <div className="text-xs text-gray-600 mb-2 font-medium">Quick Add:</div>
                                    <div className="grid grid-cols-3 gap-1">
                                      {getQuantitySuggestions(product as ExtendedProduct, cartItemUnits.quantity).map((suggestion, index) => (
                                        <button key={index} onClick={(e) => {
                                          e.preventDefault(); e.stopPropagation();
                                          setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: suggestion.value} : item));
                                          setShowQuantityHints(prev => ({...prev, [product.id]: false}));
                                          setActiveQuantityInput(null);
                                        }} className={`text-xs px-2 py-1 rounded border text-center hover:bg-gray-50 ${suggestion.type === 'moq' ? 'border-blue-300 text-blue-700 bg-blue-50' : suggestion.type === 'bulk' ? 'text-white border-0' : 'border-gray-300 text-gray-700'}`} style={suggestion.type === 'bulk' ? {backgroundColor: 'var(--theme-primary)'} : {}} title={suggestion.description}>
                                          {suggestion.label}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white border-l border-t border-gray-200 rotate-45"></div>
                                  </div>
                                )}
                              </div>
                              <Button size="sm" variant="outline" onClick={() => setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: item.quantity + 1} : item))} className="rounded-full h-8 w-8 p-0">
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            {cartItemUnits && <div className="text-xs text-gray-500 mt-1 text-center">Total: <PriceDisplay price={pricing.effectivePrice * cartItemUnits.quantity} currency={wholesaler?.defaultCurrency || 'GBP'} isGuestMode={false} size="small" /></div>}
                          </div>
                        )}

                        {/* Pallets stepper */}
                        {cartItemPallets && hasPalletPricing && (
                          <div>
                            {cartItemUnits && <p className="text-xs font-medium text-blue-700 text-center mb-1">🚛 Pallets</p>}
                            <div className="flex items-center justify-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => {
                                const palMoq = (product as any).palletMoq || 1;
                                if (cartItemPallets.quantity <= palMoq) {
                                  setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'pallets')));
                                } else {
                                  setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: item.quantity - 1} : item));
                                }
                              }} className="rounded-full h-8 w-8 p-0">
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input type="number"
                                value={quantityInputValues[`${product.id}_pal`] !== undefined ? quantityInputValues[`${product.id}_pal`] : cartItemPallets.quantity}
                                onChange={(e) => { setQuantityInputValues(prev => ({...prev, [`${product.id}_pal`]: e.target.value})); }}
                                onBlur={() => {
                                  const v = quantityInputValues[`${product.id}_pal`];
                                  const p = parseInt(v) || 0;
                                  const palMoq = (product as any).palletMoq || 1;
                                  if (p === 0) {
                                    setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'pallets')));
                                  } else {
                                    const palStock = (product as any).palletStock || 0;
                                    const qty = Math.min(Math.max(palMoq, p), palStock || p);
                                    setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: qty} : item));
                                  }
                                  setQuantityInputValues(prev => { const s = {...prev}; delete s[`${product.id}_pal`]; return s; });
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                min={1}
                                className="w-14 h-8 text-center rounded-lg text-sm"
                                placeholder={((product as any).palletMoq || 1).toString()}
                              />
                              <Button size="sm" variant="outline" onClick={() => setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: item.quantity + 1} : item))} className="rounded-full h-8 w-8 p-0">
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="text-xs text-gray-500 mt-1 text-center">Total: <PriceDisplay price={parseFloat((product as any).palletPrice?.toString() || '0') * cartItemPallets.quantity} currency={wholesaler?.defaultCurrency || 'GBP'} isGuestMode={false} size="small" /> <span className="ml-1">({cartItemPallets.quantity} pallet{cartItemPallets.quantity > 1 ? 's' : ''} × {(product as any).unitsPerPallet} units)</span></div>
                          </div>
                        )}

                        {/* Secondary "Also add" buttons */}
                        {cartItemUnits && !cartItemPallets && hasPalletPricing && (
                          <button onClick={() => addToCart(product as ExtendedProduct, (product as any).palletMoq || 1, 'pallets')} className="w-full text-xs py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors">
                            + Also Add Pallets
                          </button>
                        )}
                        {cartItemPallets && !cartItemUnits && (
                          <button onClick={() => addToCart(product as ExtendedProduct, product.moq || 1, 'units')} className="w-full text-xs py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors">
                            + Also Add Units
                          </button>
                        )}

                        {/* Initial add button */}
                        {!cartItemUnits && !cartItemPallets && (
                          <div>
                            <Button
                              onClick={() => {
                                if (hasPalletPricing) {
                                  setSelectedProductForModal(product as ExtendedProduct);
                                  setModalStep('type');
                                  setSelectedModalType(null);
                                  setModalQuantity(product.moq || 1);
                                  setShowUnitSelectionModal(true);
                                } else {
                                  addToCart(product as ExtendedProduct, product.moq, 'units');
                                }
                              }}
                              disabled={product.stock === 0 && ((product as any).palletStock || 0) === 0}
                              className="w-full rounded-xl font-semibold text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
                              style={{background: (product.stock === 0 && ((product as any).palletStock || 0) === 0) ? 'rgb(156, 163, 175)' : 'var(--theme-primary)'}}
                            >
                              <ShoppingCart className="h-4 w-4 mr-2" />
                              {(product.stock === 0 && ((product as any).palletStock || 0) === 0) ? 'Out of Stock' : hasPalletPricing ? 'Add to Cart →' : 'Add to Cart'}
                            </Button>
                            {hasPalletPricing && product.stock > 0 && (
                              <p className="text-xs text-gray-500 text-center mt-1">Choose type: units or pallets</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                // List View
                <Card key={product.id} className="group rounded-xl border border-gray-100 hover:shadow-md bg-white transition-all">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex gap-3 sm:gap-4">
                      {/* Product Image */}
                      <div className="relative w-24 h-24 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-gray-100">
                        {(() => {
                          const allImages = [
                            ...(product.imageUrl ? [product.imageUrl] : []),
                            ...((product as any).images || []).filter((img: string) => img !== product.imageUrl)
                          ].filter(Boolean);
                          const currentImageIndex = productImageIndexes[product.id] || 0;

                          if (allImages.length === 0) {
                            return (
                              <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                <Package className="w-8 h-8 text-gray-300" />
                              </div>
                            );
                          }
                          if (allImages.length === 1) {
                            return (
                              <img
                                src={allImages[0]}
                                alt={product.name}
                                className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200 p-1"
                              />
                            );
                          }
                          return (
                            <div
                              className="relative w-full h-full"
                              onTouchStart={(e) => { carouselTouchStartX.current = e.touches[0].clientX; }}
                              onTouchEnd={(e) => {
                                const diff = carouselTouchStartX.current - e.changedTouches[0].clientX;
                                if (Math.abs(diff) >= 40) {
                                  setProductImageIndexes(prev => ({
                                    ...prev,
                                    [product.id]: diff > 0
                                      ? (currentImageIndex === allImages.length - 1 ? 0 : currentImageIndex + 1)
                                      : (currentImageIndex === 0 ? allImages.length - 1 : currentImageIndex - 1)
                                  }));
                                }
                              }}
                            >
                              <img
                                src={allImages[currentImageIndex]}
                                alt={`${product.name} - Image ${currentImageIndex + 1}`}
                                className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200 p-1"
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setProductImageIndexes(prev => ({
                                    ...prev,
                                    [product.id]: currentImageIndex === 0 ? allImages.length - 1 : currentImageIndex - 1
                                  }));
                                }}
                                className="absolute left-0.5 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-0.5 transition-opacity opacity-0 group-hover:opacity-100"
                              >
                                <ArrowLeft className="w-2 h-2" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setProductImageIndexes(prev => ({
                                    ...prev,
                                    [product.id]: currentImageIndex === allImages.length - 1 ? 0 : currentImageIndex + 1
                                  }));
                                }}
                                className="absolute right-0.5 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-0.5 transition-opacity opacity-0 group-hover:opacity-100"
                              >
                                <ArrowRight className="w-2 h-2" />
                              </button>
                              <div className="absolute top-0.5 right-0.5 bg-black bg-opacity-70 text-white text-xs px-1 py-0 rounded-full leading-none" style={{fontSize: '0.625rem'}}>
                                {currentImageIndex + 1}/{allImages.length}
                              </div>
                            </div>
                          );
                        })()}
                        {pricing.promoLabel && (
                          <div className="absolute top-1 left-1">
                            <Badge className={`text-xs px-1 py-0 text-white ${pricing.promoType === 'clearance' ? 'bg-orange-500' : pricing.promoType === 'buy_x_get_y_free' ? 'bg-purple-500' : pricing.promoType === 'bundle_deal' ? 'bg-blue-500' : 'bg-red-500'}`}>
                              {pricing.promoLabel}
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex flex-col flex-1 py-1 min-w-0">
                        <div>
                          <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 mb-1">{product.name}</h3>
                          {product.description && (
                            <p className="text-xs text-gray-500 line-clamp-1">{cleanAIDescription(product.description)}</p>
                          )}
                        </div>
                        <div className="mb-2">
                          <div className="flex flex-wrap gap-1 text-xs text-gray-600">
                            {(() => {
                              const packQuantity = (product as any).packQuantity || 1;
                              const unitSize = (product as any).unitSize;
                              const unitOfMeasure = (product as any).unitOfMeasure;
                              if (unitSize && unitOfMeasure) {
                                return (
                                  <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">
                                    {packQuantity} x {Math.round(parseFloat(unitSize))}{unitOfMeasure}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                            {(product.palletPrice && parseFloat(product.palletPrice.toString()) > 0) ? (
                              <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-medium">Units & Pallets</span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">Individual Units</span>
                            )}
                            {(product as any).size && (
                              <span className="bg-gray-100 px-2 py-0.5 rounded">Size: {(product as any).size}</span>
                            )}
                            {product.moq && product.moq > 1 && (
                              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium" title={`Minimum order: ${product.moq} units required`}>
                                Min: {product.moq} units
                              </span>
                            )}
                            {product.stock && (
                              <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">Stock: {product.stock}</span>
                            )}
                            {(product as any).brand && (
                              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded">{(product as any).brand}</span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <PriceDisplay
                            price={pricing.effectivePrice}
                            originalPrice={pricing.effectivePrice !== pricing.originalPrice ? pricing.originalPrice : undefined}
                            currency={wholesaler?.defaultCurrency || 'GBP'}
                            isGuestMode={isTrueGuestMode}
                            size="medium"
                            showStrikethrough={true}
                          />
                          {hasPalletPricing && !cartItemUnits && !cartItemPallets && (
                            <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                              <span>🚛</span>
                              <span>Pallet: £{parseFloat((product as any).palletPrice?.toString() || '0').toFixed(2)} / pallet — Min {(product as any).palletMoq || 1}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Add to Cart Controls — pinned top-right */}
                      <div className="flex-shrink-0 self-start flex flex-col items-end pt-1">
                        <div className="space-y-2">
                          {hasPalletPricing && (cartItemUnits || cartItemPallets) && !(cartItemUnits && cartItemPallets) && (
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cartItemUnits ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                {cartItemUnits ? '📦 Units ✓' : '🚛 Pallets ✓'}
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

                          {/* Units stepper (list view) */}
                          {cartItemUnits && (
                            <div className="flex flex-col items-end">
                              {cartItemPallets && <p className="text-xs font-medium text-emerald-700 mb-1">📦 Units</p>}
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => {
                                  if (cartItemUnits.quantity <= product.moq) {
                                    setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'units')));
                                  } else {
                                    setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: item.quantity - 1} : item));
                                  }
                                }} className="rounded-full h-8 w-8 p-0">
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <div className="relative">
                                  <Input type="number"
                                    value={quantityInputValues[product.id] !== undefined ? quantityInputValues[product.id] : cartItemUnits.quantity}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setQuantityInputValues(prev => ({...prev, [product.id]: v}));
                                      const p = parseInt(v) || 0;
                                      setShowMOQWarnings(prev => ({...prev, [product.id]: p > 0 && p < product.moq}));
                                    }}
                                    onFocus={() => { setActiveQuantityInput(product.id); setShowQuantityHints(prev => ({...prev, [product.id]: true})); }}
                                    onBlur={() => {
                                      const v = quantityInputValues[product.id];
                                      const p = parseInt(v) || 0;
                                      if (p === 0) {
                                        setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'units')));
                                      } else {
                                        const qty = Math.min(Math.max(product.moq, p), product.stock);
                                        setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: qty} : item));
                                      }
                                      setQuantityInputValues(prev => { const s = {...prev}; delete s[product.id]; return s; });
                                      setShowMOQWarnings(prev => ({...prev, [product.id]: false}));
                                      setShowQuantityHints(prev => ({...prev, [product.id]: false}));
                                      setActiveQuantityInput(null);
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    min={0} max={product.stock}
                                    className={`w-14 h-8 text-center rounded-lg text-sm ${showMOQWarnings[product.id] ? 'border-amber-400 bg-amber-50' : activeQuantityInput === product.id ? 'border-blue-400 bg-blue-50' : ''}`}
                                    placeholder={product.moq.toString()}
                                  />
                                  {showMOQWarnings[product.id] && (
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-amber-100 border border-amber-300 rounded-md px-2 py-1 text-xs text-amber-800 whitespace-nowrap shadow-sm">
                                      Min: {product.moq} units
                                      <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-amber-100 border-l border-t border-amber-300 rotate-45"></div>
                                    </div>
                                  )}
                                  {showQuantityHints[product.id] && activeQuantityInput === product.id && (
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg p-2 min-w-[200px]">
                                      <div className="text-xs text-gray-600 mb-2 font-medium">Quick Add:</div>
                                      <div className="grid grid-cols-3 gap-1">
                                        {getQuantitySuggestions(product as ExtendedProduct, cartItemUnits.quantity).map((suggestion, index) => (
                                          <button key={index} onClick={(e) => {
                                            e.preventDefault(); e.stopPropagation();
                                            setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: suggestion.value} : item));
                                            setShowQuantityHints(prev => ({...prev, [product.id]: false}));
                                            setActiveQuantityInput(null);
                                          }} className={`text-xs px-2 py-1 rounded border text-center hover:bg-gray-50 ${suggestion.type === 'moq' ? 'border-blue-300 text-blue-700 bg-blue-50' : suggestion.type === 'bulk' ? 'text-white border-0' : 'border-gray-300 text-gray-700'}`} style={suggestion.type === 'bulk' ? {backgroundColor: 'var(--theme-primary)'} : {}} title={suggestion.description}>
                                            {suggestion.label}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white border-l border-t border-gray-200 rotate-45"></div>
                                    </div>
                                  )}
                                </div>
                                <Button size="sm" variant="outline" onClick={() => setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'units' ? {...item, quantity: item.quantity + 1} : item))} className="rounded-full h-8 w-8 p-0">
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                              {cartItemUnits && <div className="text-xs text-gray-500 mt-1">Total: <PriceDisplay price={pricing.effectivePrice * cartItemUnits.quantity} currency={wholesaler?.defaultCurrency || 'GBP'} isGuestMode={false} size="small" /></div>}
                            </div>
                          )}

                          {/* Pallets stepper (list view) */}
                          {cartItemPallets && hasPalletPricing && (
                            <div className="flex flex-col items-end">
                              {cartItemUnits && <p className="text-xs font-medium text-blue-700 mb-1">🚛 Pallets</p>}
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => {
                                  const palMoq = (product as any).palletMoq || 1;
                                  if (cartItemPallets.quantity <= palMoq) {
                                    setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'pallets')));
                                  } else {
                                    setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: item.quantity - 1} : item));
                                  }
                                }} className="rounded-full h-8 w-8 p-0">
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input type="number"
                                  value={quantityInputValues[`${product.id}_pal`] !== undefined ? quantityInputValues[`${product.id}_pal`] : cartItemPallets.quantity}
                                  onChange={(e) => { setQuantityInputValues(prev => ({...prev, [`${product.id}_pal`]: e.target.value})); }}
                                  onBlur={() => {
                                    const v = quantityInputValues[`${product.id}_pal`];
                                    const p = parseInt(v) || 0;
                                    const palMoq = (product as any).palletMoq || 1;
                                    if (p === 0) {
                                      setCart(cart.filter(item => !(item.product.id === product.id && item.sellingType === 'pallets')));
                                    } else {
                                      const palStock = (product as any).palletStock || 0;
                                      const qty = Math.min(Math.max(palMoq, p), palStock || p);
                                      setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: qty} : item));
                                    }
                                    setQuantityInputValues(prev => { const s = {...prev}; delete s[`${product.id}_pal`]; return s; });
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                  min={1}
                                  className="w-14 h-8 text-center rounded-lg text-sm"
                                  placeholder={((product as any).palletMoq || 1).toString()}
                                />
                                <Button size="sm" variant="outline" onClick={() => setCart(cart.map(item => item.product.id === product.id && item.sellingType === 'pallets' ? {...item, quantity: item.quantity + 1} : item))} className="rounded-full h-8 w-8 p-0">
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">Total: <PriceDisplay price={parseFloat((product as any).palletPrice?.toString() || '0') * cartItemPallets.quantity} currency={wholesaler?.defaultCurrency || 'GBP'} isGuestMode={false} size="small" /> <span className="ml-1">({cartItemPallets.quantity} pallet{cartItemPallets.quantity > 1 ? 's' : ''} × {(product as any).unitsPerPallet} units)</span></div>
                            </div>
                          )}

                          {cartItemUnits && !cartItemPallets && hasPalletPricing && (
                            <button onClick={() => addToCart(product as ExtendedProduct, (product as any).palletMoq || 1, 'pallets')} className="w-full text-xs py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors">
                              + Also Add Pallets
                            </button>
                          )}
                          {cartItemPallets && !cartItemUnits && (
                            <button onClick={() => addToCart(product as ExtendedProduct, product.moq || 1, 'units')} className="w-full text-xs py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors">
                              + Also Add Units
                            </button>
                          )}

                          {!cartItemUnits && !cartItemPallets && (
                            <div className="flex flex-col items-center gap-1">
                              {(() => {
                                const isOutOfStock = product.stock === 0 && ((product as any).palletStock || 0) === 0;
                                const handleAdd = () => {
                                  if (hasPalletPricing) {
                                    setSelectedProductForModal(product as ExtendedProduct);
                                    setModalStep('type');
                                    setSelectedModalType(null);
                                    setModalQuantity(product.moq || 1);
                                    setShowUnitSelectionModal(true);
                                  } else {
                                    addToCart(product as ExtendedProduct, product.moq || 1, 'units');
                                  }
                                };
                                return (
                                  <>
                                    <button
                                      onClick={handleAdd}
                                      disabled={isOutOfStock}
                                      className="sm:hidden w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-bold disabled:cursor-not-allowed flex-shrink-0"
                                      style={{background: isOutOfStock ? 'rgb(156, 163, 175)' : 'var(--theme-primary)'}}
                                      aria-label={isOutOfStock ? 'Out of stock' : 'Add to cart'}
                                    >
                                      <Plus className="h-5 w-5" />
                                    </button>
                                    <Button
                                      onClick={handleAdd}
                                      disabled={isOutOfStock}
                                      size="sm"
                                      className="hidden sm:flex rounded-xl font-semibold text-white disabled:bg-gray-400 disabled:cursor-not-allowed px-4"
                                      style={{background: isOutOfStock ? 'rgb(156, 163, 175)' : 'var(--theme-primary)'}}
                                    >
                                      <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                                      {isOutOfStock ? 'Out of Stock' : hasPalletPricing ? 'Add to Cart →' : 'Add to Cart'}
                                    </Button>
                                  </>
                                );
                              })()}
                              {hasPalletPricing && product.stock > 0 && (
                                <p className="text-xs text-gray-500 text-center">units or pallets</p>
                              )}
                            </div>
                          )}
                        </div>
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
