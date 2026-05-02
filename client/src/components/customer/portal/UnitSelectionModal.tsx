import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatWeight } from "@shared/utils/currency";
import { getPackQuantity, computePackWeightKg } from "@shared/utils/product";
import type { ExtendedProduct, CartItem, PromotionalPricing } from "@/components/customer/portal-types";

interface UnitSelectionModalProps {
  showUnitSelectionModal: boolean;
  setShowUnitSelectionModal: (v: boolean) => void;
  selectedProductForModal: ExtendedProduct | null;
  setSelectedProductForModal: (p: ExtendedProduct | null) => void;
  modalStep: 'type' | 'quantity';
  setModalStep: (s: 'type' | 'quantity') => void;
  selectedModalType: 'units' | 'pallets' | null;
  setSelectedModalType: (t: 'units' | 'pallets' | null) => void;
  modalQuantity: number;
  setModalQuantity: (q: number) => void;
  calculatePromotionalPricing: (product: ExtendedProduct, quantity: number) => PromotionalPricing;
  addToCart: (product: ExtendedProduct, quantity: number, sellingType: 'units' | 'pallets') => void;
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  cart: CartItem[];
}

export function UnitSelectionModal({
  showUnitSelectionModal,
  setShowUnitSelectionModal,
  setCart,
  selectedProductForModal,
  setSelectedProductForModal,
  modalStep,
  setModalStep,
  selectedModalType,
  setSelectedModalType,
  modalQuantity,
  setModalQuantity,
  calculatePromotionalPricing,
  addToCart,
  cart,
}: UnitSelectionModalProps) {
  const { toast } = useToast();

  if (!showUnitSelectionModal || !selectedProductForModal) return null;

  const closeModal = () => {
    setShowUnitSelectionModal(false);
    setSelectedProductForModal(null);
    setModalStep('type');
    setSelectedModalType(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        {modalStep === 'type' ? (
          <>
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Choose Purchase Option
              </h3>
              <p className="text-gray-600">
                How would you like to purchase {selectedProductForModal.name}?
              </p>
            </div>

            <div className="space-y-4 mb-6">
              {/* Individual Units Option */}
              {(() => {
                const moq = selectedProductForModal.moq || 1;
                const promoPricing = calculatePromotionalPricing(selectedProductForModal!, moq);
                const hasDiscount = promoPricing.effectivePrice !== promoPricing.originalPrice;
                return (
                  <div
                    className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors border-emerald-500 bg-emerald-50"
                    onClick={() => {
                      setSelectedModalType('units');
                      const availableStock = selectedProductForModal.stock || 0;
                      const minQuantity = selectedProductForModal.moq || 1;
                      setModalQuantity(availableStock < minQuantity ? availableStock : minQuantity);
                      setModalStep('quantity');
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium text-gray-900">Individual Units</h4>
                        <p className="text-sm text-gray-600">
                          {hasDiscount ? (
                            <>
                              <span className="line-through text-gray-400 mr-1">{formatCurrency(promoPricing.originalPrice)}</span>
                              <span className="text-emerald-600 font-semibold">{formatCurrency(promoPricing.effectivePrice)}</span> per unit
                            </>
                          ) : (
                            <>{formatCurrency(promoPricing.effectivePrice)} per unit</>
                          )}
                        </p>
                        {hasDiscount && promoPricing.promoLabel && (
                          <span className="inline-block text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full mt-1">
                            {promoPricing.promoLabel}
                          </span>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Minimum: {moq} units
                        </p>
                        {(() => {
                          const pq = getPackQuantity(selectedProductForModal);
                          const us = selectedProductForModal.unitSize;
                          const um = selectedProductForModal.unitOfMeasure;
                          if (pq && pq > 1 && us && um) return <p className="text-xs text-gray-400">{pq} × {parseFloat(String(us))}{um}</p>;
                          return null;
                        })()}
                        {(() => {
                          const pw = computePackWeightKg(selectedProductForModal.packQuantity, selectedProductForModal.unitSize, selectedProductForModal.unitOfMeasure)
                            || (selectedProductForModal.totalPackageWeight ? parseFloat(selectedProductForModal.totalPackageWeight) : 0);
                          if (pw > 0) return <p className="text-xs text-gray-400">{formatWeight(pw)} kg/pack</p>;
                          return null;
                        })()}
                      </div>
                      <div className="text-right">
                        {hasDiscount && (
                          <div className="text-xs text-gray-400 line-through">
                            {formatCurrency(promoPricing.originalPrice * moq)}
                          </div>
                        )}
                        <div className="text-lg font-semibold text-emerald-600">
                          {formatCurrency(promoPricing.totalCost)}
                        </div>
                        <div className="text-xs text-gray-500">
                          for {moq} units
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Pallet Option */}
              <div
                className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors border-blue-500 bg-blue-50"
                onClick={() => {
                  setSelectedModalType('pallets');
                  const availableStock = selectedProductForModal?.palletStock || 0;
                  const minQuantity = selectedProductForModal?.palletMoq || 1;
                  setModalQuantity(availableStock < minQuantity ? availableStock : minQuantity);
                  setModalStep('quantity');
                }}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium text-gray-900">Full Pallets</h4>
                    <p className="text-sm text-gray-600">
                      {formatCurrency(selectedProductForModal?.palletPrice || 0)} per pallet
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedProductForModal?.unitsPerPallet} units per pallet
                      {selectedProductForModal?.palletMoq && selectedProductForModal?.palletMoq > 1 &&
                        ` • Minimum: ${selectedProductForModal?.palletMoq} pallets`
                      }
                    </p>
                    {(() => {
                      const palw = selectedProductForModal.palletWeight ? parseFloat(String(selectedProductForModal.palletWeight)) : 0;
                      if (palw > 0) return <p className="text-xs text-gray-400">{formatWeight(palw)} kg/pallet</p>;
                      return null;
                    })()}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-blue-600">
                      {formatCurrency(parseFloat(selectedProductForModal?.palletPrice?.toString() || '0') * (selectedProductForModal?.palletMoq || 1))}
                    </div>
                    <div className="text-xs text-gray-500">
                      for {selectedProductForModal?.palletMoq || 1} pallet{(selectedProductForModal?.palletMoq || 1) > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Both Option */}
              <div
                className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors border-purple-400 bg-purple-50"
                onClick={() => {
                  const unitMoq = selectedProductForModal.moq || 1;
                  const palMoq = selectedProductForModal?.palletMoq || 1;
                  addToCart(selectedProductForModal, unitMoq, 'units');
                  addToCart(selectedProductForModal, palMoq, 'pallets');
                  closeModal();
                }}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium text-gray-900">Both Units & Pallets</h4>
                    <p className="text-sm text-gray-600">Order individual units and full pallets together</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedProductForModal.moq || 1} units + {selectedProductForModal?.palletMoq || 1} pallet{(selectedProductForModal?.palletMoq || 1) > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-purple-600 text-2xl">+</div>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {selectedModalType === 'units' ? '📦 Individual Units' : '🚛 Full Pallets'} Selected
              </h3>
              <p className="text-gray-600">
                Adjust quantity for {selectedProductForModal.name}
              </p>
              <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600">
                <span>Want to switch?</span>
                <button
                  onClick={() => {
                    setModalStep('type');
                    setSelectedModalType(null);
                    const availableStock = selectedProductForModal.stock || 0;
                    const minQuantity = selectedProductForModal.moq || 1;
                    setModalQuantity(availableStock < minQuantity ? availableStock : minQuantity);
                  }}
                  className="text-blue-600 hover:text-blue-800 font-medium underline"
                >
                  Change selection
                </button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-gray-900">
                    {selectedModalType === 'units' ? 'Individual Units' : 'Full Pallets'}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {selectedModalType === 'units'
                      ? (() => {
                          const qtyPricing = calculatePromotionalPricing(selectedProductForModal!, 1);
                          const hasPromo = qtyPricing.effectivePrice !== qtyPricing.originalPrice;
                          if (hasPromo) {
                            return (
                              <>
                                <span className="line-through text-gray-400 mr-1">{formatCurrency(qtyPricing.originalPrice)}</span>
                                <span className="text-emerald-600 font-semibold">{formatCurrency(qtyPricing.effectivePrice)}</span> per unit
                              </>
                            );
                          }
                          return `${formatCurrency(qtyPricing.effectivePrice)} per unit`;
                        })()
                      : `${formatCurrency(selectedProductForModal?.palletPrice || 0)} per pallet`
                    }
                  </p>
                  {selectedModalType === 'units' && (() => {
                    const qtyPricing = calculatePromotionalPricing(selectedProductForModal!, 1);
                    if (qtyPricing.promoLabel && qtyPricing.effectivePrice !== qtyPricing.originalPrice) {
                      return (
                        <span className="inline-block text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full mt-1">
                          {qtyPricing.promoLabel}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">
                    Minimum: {selectedModalType === 'units'
                      ? `${selectedProductForModal.moq} units`
                      : `${selectedProductForModal?.palletMoq || 1} pallets`
                    }
                  </div>
                  {selectedModalType === 'pallets' && (
                    <div className="text-xs text-gray-500">
                      {selectedProductForModal?.unitsPerPallet} units per pallet
                    </div>
                  )}
                  {(() => {
                    if (selectedModalType === 'units') {
                      const pw = computePackWeightKg(selectedProductForModal.packQuantity, selectedProductForModal.unitSize, selectedProductForModal.unitOfMeasure)
                        || (selectedProductForModal.totalPackageWeight ? parseFloat(selectedProductForModal.totalPackageWeight) : 0);
                      if (pw > 0) return <div className="text-xs text-gray-400">{formatWeight(pw)} kg/pack</div>;
                    } else {
                      const palw = selectedProductForModal.palletWeight ? parseFloat(String(selectedProductForModal.palletWeight)) : 0;
                      if (palw > 0) return <div className="text-xs text-gray-400">{formatWeight(palw)} kg/pallet</div>;
                    }
                    return null;
                  })()}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const minQuantity = selectedModalType === 'units'
                        ? (selectedProductForModal.moq || 1)
                        : (selectedProductForModal?.palletMoq || 1);
                      if (modalQuantity > minQuantity) {
                        setModalQuantity(modalQuantity - 1);
                      }
                    }}
                    disabled={modalQuantity <= (selectedModalType === 'units'
                      ? (selectedProductForModal.moq || 1)
                      : (selectedProductForModal?.palletMoq || 1))}
                    className="h-10 w-10 p-0"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const availableStock = selectedModalType === 'units'
                        ? selectedProductForModal.stock
                        : (selectedProductForModal?.palletStock || 0);
                      if (modalQuantity < availableStock) {
                        setModalQuantity(modalQuantity + 1);
                      }
                    }}
                    disabled={(() => {
                      const availableStock = selectedModalType === 'units'
                        ? selectedProductForModal.stock
                        : (selectedProductForModal?.palletStock || 0);
                      return modalQuantity >= availableStock;
                    })()}
                    className="h-10 w-10 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                <div className="text-center space-y-2">
                  <Label htmlFor="quantity-input" className="text-sm font-medium">
                    Quantity ({selectedModalType === 'units' ? 'units' : 'pallets'})
                  </Label>
                  <Input
                    id="quantity-input"
                    type="number"
                    step="0.1"
                    value={modalQuantity}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      const availableStock = selectedModalType === 'units'
                        ? selectedProductForModal.stock
                        : (selectedProductForModal?.palletStock || 0);
                      if (value >= 0 || e.target.value === '') {
                        setModalQuantity(Math.min(value, availableStock));
                      }
                    }}
                    className="text-center text-xl font-bold max-w-[120px] mx-auto"
                    placeholder="Enter quantity"
                  />

                  <div className="text-xs text-center space-y-1">
                    <div className="flex justify-center space-x-4 text-gray-600 font-medium">
                      <span>
                        Minimum: {selectedModalType === 'units'
                          ? `${selectedProductForModal.moq || 1} units`
                          : `${selectedProductForModal?.palletMoq || 1} pallets`}
                      </span>
                      <span>
                        Available: {(() => {
                          const availableStock = selectedModalType === 'units'
                            ? selectedProductForModal.stock
                            : (selectedProductForModal?.palletStock || 0);
                          return `${availableStock} ${selectedModalType === 'units' ? 'units' : 'pallets'}`;
                        })()}
                      </span>
                    </div>

                    {(() => {
                      const minQuantity = selectedModalType === 'units'
                        ? (selectedProductForModal.moq || 1)
                        : (selectedProductForModal?.palletMoq || 1);
                      const availableStock = selectedModalType === 'units'
                        ? selectedProductForModal.stock
                        : (selectedProductForModal?.palletStock || 0);

                      if (availableStock < minQuantity) {
                        return (
                          <p className="text-amber-600 font-medium">
                            ⭐ Last {availableStock} units available! (normally {minQuantity} minimum)
                          </p>
                        );
                      }
                      if (modalQuantity > availableStock) {
                        return (
                          <p className="text-red-600 font-medium">
                            ⚠️ Quantity exceeds available stock ({availableStock})
                          </p>
                        );
                      }
                      if (modalQuantity > 0 && modalQuantity < minQuantity) {
                        return (
                          <p className="text-amber-600 font-medium">
                            ⚠️ Below minimum - will be adjusted to {minQuantity}
                          </p>
                        );
                      }
                      if (modalQuantity >= minQuantity && modalQuantity <= availableStock) {
                        return (
                          <p className="text-green-600 font-medium">
                            ✅ Meets requirements
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>

              <div className="text-center mt-4 pt-3 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-1">Total</div>
                {(() => {
                  if (selectedModalType === 'units') {
                    const totalPricing = calculatePromotionalPricing(selectedProductForModal!, modalQuantity);
                    const hasPromo = totalPricing.effectivePrice !== totalPricing.originalPrice;
                    return (
                      <>
                        {hasPromo && (
                          <div className="text-sm text-gray-400 line-through">
                            {formatCurrency(totalPricing.originalPrice * modalQuantity)}
                          </div>
                        )}
                        <div className="text-2xl font-bold text-emerald-600">
                          {formatCurrency(totalPricing.totalCost)}
                        </div>
                        {hasPromo && totalPricing.promoLabel && (
                          <div className="text-xs text-green-600 mt-1">
                            {totalPricing.promoLabel} applied
                          </div>
                        )}
                      </>
                    );
                  }
                  return (
                    <div className="text-2xl font-bold text-emerald-600">
                      {formatCurrency(parseFloat(selectedProductForModal?.palletPrice?.toString() || '0') * modalQuantity)}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setModalStep('type');
                  setSelectedModalType(null);
                  const availableStock = selectedModalType === 'units'
                    ? selectedProductForModal.stock
                    : (selectedProductForModal?.palletStock || 0);
                  const minQuantity = selectedModalType === 'units'
                    ? (selectedProductForModal.moq || 1)
                    : (selectedProductForModal?.palletMoq || 1);
                  setModalQuantity(availableStock < minQuantity ? availableStock : minQuantity);
                }}
                className="flex-1"
              >
                ← Change Selection
              </Button>
              <Button
                onClick={() => {
                  const minQuantity = selectedModalType === 'units'
                    ? (selectedProductForModal.moq || 1)
                    : (selectedProductForModal?.palletMoq || 1);
                  const availableStock = selectedModalType === 'units'
                    ? selectedProductForModal.stock
                    : (selectedProductForModal?.palletStock || 0);

                  const existingCartItem = cart.find(item => item.product.id === selectedProductForModal.id && item.sellingType === selectedModalType);

                  if (existingCartItem) {
                    const requestedQuantity = Math.max(modalQuantity || minQuantity, minQuantity);
                    const finalQuantity = Math.min(requestedQuantity, availableStock);
                    setCart(prevCart =>
                      prevCart.map(item =>
                        item.product.id === selectedProductForModal.id && item.sellingType === selectedModalType
                          ? { ...item, quantity: finalQuantity }
                          : item
                      )
                    );
                    toast({
                      title: "Cart Updated",
                      description: `${selectedProductForModal.name} updated to ${finalQuantity} ${selectedModalType === 'pallets' ? 'pallets' : 'units'}`,
                    });
                  } else {
                    if (availableStock < minQuantity) {
                      const finalQuantity = availableStock;
                      addToCart(selectedProductForModal, finalQuantity, selectedModalType!);
                      toast({
                        title: "Last Units Added!",
                        description: `Added all remaining ${finalQuantity} ${selectedModalType === 'pallets' ? 'pallets' : 'units'} of ${selectedProductForModal.name}`,
                      });
                    } else {
                      const requestedQuantity = Math.max(modalQuantity || minQuantity, minQuantity);
                      const finalQuantity = Math.min(requestedQuantity, availableStock);
                      addToCart(selectedProductForModal, finalQuantity, selectedModalType!);
                    }
                  }

                  setShowUnitSelectionModal(false);
                  setSelectedProductForModal(null);
                  setModalStep('type');
                  setSelectedModalType(null);
                  setModalQuantity(1);
                }}
                disabled={(() => {
                  const availableStock = selectedModalType === 'units'
                    ? selectedProductForModal.stock
                    : (selectedProductForModal?.palletStock || 0);
                  return availableStock <= 0;
                })()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-400"
              >
                {(() => {
                  const minQuantity = selectedModalType === 'units'
                    ? (selectedProductForModal.moq || 1)
                    : (selectedProductForModal?.palletMoq || 1);
                  const availableStock = selectedModalType === 'units'
                    ? selectedProductForModal.stock
                    : (selectedProductForModal?.palletStock || 0);

                  const existingCartItem = cart.find(item => item.product.id === selectedProductForModal.id && item.sellingType === selectedModalType);

                  if (availableStock <= 0) {
                    return "Out of Stock";
                  } else if (availableStock < minQuantity) {
                    return existingCartItem ? "Update Cart" : `Add ${availableStock} (All Available)`;
                  } else {
                    return existingCartItem ? "Update Cart" : "Add to Cart";
                  }
                })()}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
