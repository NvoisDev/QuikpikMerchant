import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ChevronLeft, X, Plus, Minus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { computeBaseUnits } from "@shared/quote-units";

interface EditItem {
  productId: number;
  productName: string;
  quantity: number;
  customPrice: number;
  sellingType: 'units' | 'pallets';
  imageUrl?: string;
  stock?: number;
  palletStock?: number;
  quantityInPack?: number;
  unitsPerPallet?: number;
  sellingFormat?: string;
  palletPrice?: number;
  unitPrice?: number;
  palletMoq?: number;
}

interface SimpleProduct {
  id: number;
  name: string;
  price: string;
  palletPrice?: string;
  stock: number;
  palletStock?: number;
  imageUrl?: string;
  sellingFormat?: string;
  quantityInPack?: number;
  unitsPerPallet?: number;
  palletMoq?: number;
}

interface OrderForEdit {
  id: number;
  orderNumber?: string;
  deliveryCost?: string;
}

interface EditQuoteViewProps {
  order: OrderForEdit;
  editItems: EditItem[];
  setEditItems: React.Dispatch<React.SetStateAction<EditItem[]>>;
  editPaymentMethod: string;
  setEditPaymentMethod: (m: string) => void;
  editProductDialogOpen: boolean;
  setEditProductDialogOpen: (v: boolean) => void;
  editProductSearch: string;
  setEditProductSearch: (v: string) => void;
  editProducts: SimpleProduct[];
  formatMoney: (n: number) => string;
  onCancel: () => void;
  onSaved: (updatedOrder: any) => void;
}

export function EditQuoteView({
  order,
  editItems,
  setEditItems,
  editPaymentMethod,
  setEditPaymentMethod,
  editProductDialogOpen,
  setEditProductDialogOpen,
  editProductSearch,
  setEditProductSearch,
  editProducts,
  formatMoney,
  onCancel,
  onSaved,
}: EditQuoteViewProps) {
  const { toast } = useToast();
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [editSaveError, setEditSaveError] = useState<string | null>(null);
  const [packMode, setPackMode] = useState<Record<string, boolean>>({});
  const [packInputs, setPackInputs] = useState<Record<string, string>>({});
  const [editDeliveryCost, setEditDeliveryCost] = useState(
    parseFloat(order.deliveryCost || '0').toFixed(2)
  );
  // Session price baselines: the price each line had when the editor opened, or when
  // the line was added / its selling type switched. We only offer a price-scope choice
  // for lines whose price the wholesaler has *manually changed this session*, so a
  // previously-saved custom price doesn't keep nagging. Ref because reads happen during
  // render; writes are paired with the matching setEditItems call.
  const priceBaselineRef = useRef<Record<string, number> | null>(null);
  if (priceBaselineRef.current === null) {
    priceBaselineRef.current = Object.fromEntries(
      editItems.map(it => [`${it.productId}-${it.sellingType}`, it.customPrice])
    );
  }
  const setBaseline = (productId: number, sellingType: 'units' | 'pallets', price: number) => {
    if (priceBaselineRef.current) priceBaselineRef.current[`${productId}-${sellingType}`] = price;
  };
  // Per-line chosen scope for a manual price change. Default 'all' (update base catalog).
  const [priceScopes, setPriceScopes] = useState<Record<string, 'invoice' | 'customer' | 'all'>>({});
  const isPriceChanged = (item: EditItem) => {
    const baseline = priceBaselineRef.current?.[getItemKey(item)];
    return baseline !== undefined && Math.abs(item.customPrice - baseline) > 0.001;
  };

  const editSubtotal = editItems.reduce((sum, item) => sum + item.customPrice * item.quantity, 0);
  const deliveryCostVal = parseFloat(editDeliveryCost) || 0;
  const filteredEditProducts = editProducts.filter(p =>
    p.name.toLowerCase().includes(editProductSearch.toLowerCase())
  );
  const hasInvalidItems = editItems.some(item =>
    item.customPrice <= 0 || item.quantity < 1 ||
    (item.sellingType === 'pallets' && !!item.palletMoq && item.palletMoq > 1 && item.quantity < item.palletMoq)
  );

  const getItemKey = (item: EditItem) => `${item.productId}-${item.sellingType}`;

  const togglePackMode = (index: number) => {
    const item = editItems[index];
    const qip = item.quantityInPack ?? 1;
    if (qip <= 1 || item.sellingType === 'pallets') return;
    const key = getItemKey(item);
    const nowPacks = !packMode[key];
    if (nowPacks) {
      // Round to nearest pack and immediately commit aligned base units so save is
      // always correct even if the user doesn't interact with the qty field again.
      const packCount = Math.max(1, Math.round(item.quantity / qip));
      const alignedBaseUnits = packCount * qip;
      const updated = [...editItems];
      updated[index] = { ...updated[index], quantity: alignedBaseUnits };
      setEditItems(updated);
      setPackInputs(prev => ({ ...prev, [key]: packCount.toString() }));
    } else {
      // Back to units — quantity already in base units, just update display input.
      setPackInputs(prev => ({ ...prev, [key]: item.quantity.toString() }));
    }
    setPackMode(prev => ({ ...prev, [key]: nowPacks }));
  };

  const commitQty = (index: number, raw: string) => {
    const item = editItems[index];
    const qip = item.quantityInPack ?? 1;
    const key = getItemKey(item);
    const isPacks = packMode[key];
    const val = parseInt(raw, 10);
    const displayVal = !isNaN(val) && val >= 1 ? val : 1;
    const baseUnits = isPacks ? displayVal * qip : displayVal;
    const updated = [...editItems];
    updated[index] = { ...updated[index], quantity: Math.max(1, baseUnits) };
    setEditItems(updated);
    setPackInputs(prev => ({ ...prev, [key]: displayVal.toString() }));
  };

  const switchEditItemMode = (index: number, mode: 'units' | 'packs' | 'pallets') => {
    const item = editItems[index];
    const qip = item.quantityInPack ?? 1;
    if (mode === 'pallets') {
      if (!item.palletPrice || item.sellingType === 'pallets') return;
      const palletQty = Math.max(1, item.palletMoq ?? 1);
      const updated = [...editItems];
      updated[index] = { ...updated[index], sellingType: 'pallets', customPrice: item.palletPrice, quantity: palletQty };
      setEditItems(updated);
      // Switching is not a manual price change — baseline the new key to its catalog price.
      setBaseline(item.productId, 'pallets', item.palletPrice);
      const newKey = `${item.productId}-pallets`;
      setPackInputs(prev => ({ ...prev, [newKey]: palletQty.toString() }));
      setPackMode(prev => ({ ...prev, [newKey]: false }));
    } else if (mode === 'units') {
      if (item.sellingType === 'units' && !packMode[getItemKey(item)]) return;
      if (!item.unitPrice) return;
      // Packs → Units: item.quantity is already in base units, preserve it.
      // Pallets → Units: different price context, reset to 1.
      const preservedQty = item.sellingType === 'pallets' ? 1 : item.quantity;
      const updated = [...editItems];
      updated[index] = { ...updated[index], sellingType: 'units', customPrice: item.unitPrice, quantity: preservedQty };
      setEditItems(updated);
      // Switching is not a manual price change — baseline the new key to its catalog price.
      setBaseline(item.productId, 'units', item.unitPrice);
      const newKey = `${item.productId}-units`;
      setPackInputs(prev => ({ ...prev, [newKey]: preservedQty.toString() }));
      setPackMode(prev => ({ ...prev, [newKey]: false }));
    } else if (mode === 'packs') {
      if (item.sellingType === 'pallets' || qip <= 1) return;
      togglePackMode(index);
    }
  };

  const handleSaveQuote = async () => {
    const moqViolation = editItems.find(item =>
      item.sellingType === 'pallets' && item.palletMoq && item.palletMoq > 1 && item.quantity < item.palletMoq
    );
    if (moqViolation) {
      const msg = `"${moqViolation.productName}" requires a minimum of ${moqViolation.palletMoq} pallets`;
      setEditSaveError(msg);
      toast({ title: 'Minimum Pallet Order', description: msg, variant: 'destructive' });
      return;
    }
    setIsSavingQuote(true);
    setEditSaveError(null);
    try {
      const response = await fetch(`/api/quotes/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: editItems.map(item => ({
            productId: item.productId,
            customPrice: item.customPrice,
            quantity: item.quantity,
            sellingType: item.sellingType,
            // Only send a propagating scope for lines whose price changed this session;
            // unchanged lines stay 'invoice' so nothing leaks to catalog / customer lists.
            priceScope: isPriceChanged(item) ? (priceScopes[getItemKey(item)] || 'all') : 'invoice',
          })),
          paymentMethod: editPaymentMethod,
          deliveryCost: deliveryCostVal,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const warningText = data.warnings?.length ? ` Note: ${data.warnings.join('; ')}` : '';
        toast({
          title: data.warnings?.length ? 'Invoice updated (with warnings)' : 'Invoice updated successfully',
          description: `Products total: ${formatMoney(parseFloat(data.order?.subtotal ?? data.total))} (fees may apply).${warningText}`,
        });
        setEditSaveError(null);
        onSaved(data.order);
      } else {
        const errorMsg = data.error || 'Failed to update invoice';
        setEditSaveError(errorMsg);
        toast({ title: data.errorType === 'OUT_OF_STOCK' ? 'Stock Unavailable' : 'Error', description: errorMsg, variant: 'destructive' });
      }
    } catch {
      const msg = 'Network error — please try again';
      setEditSaveError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsSavingQuote(false);
    }
  };

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Edit Invoice {order.orderNumber || `#${order.id}`}</h1>
            <p className="text-xs text-gray-500">Adjust items, quantities, and prices</p>
          </div>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-medium mb-2">Items</h3>
            {editItems.length === 0 ? (
              <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed text-gray-500 text-sm">
                No items — add a product below
              </div>
            ) : (
              <div className="space-y-3">
                {editItems.map((item, index) => {
                  const key = getItemKey(item);
                  const qip = item.quantityInPack ?? 1;
                  const isPacks = (packMode[key] ?? false) && qip > 1 && item.sellingType !== 'pallets';
                  const activeMode = item.sellingType === 'pallets' ? 'pallets' : isPacks ? 'packs' : 'units';
                  const showUnits = item.sellingFormat !== 'pallets' && !!item.unitPrice;
                  const showPacks = qip > 1 && item.sellingFormat !== 'pallets' && item.sellingFormat !== 'units';
                  const showPallets = !!item.palletPrice && item.sellingFormat !== 'units';
                  const showModeSelector = (showPacks || showPallets) && (showUnits || showPacks || showPallets);
                  const displayedQty = isPacks
                    ? (packInputs[key] ?? Math.max(1, Math.round(item.quantity / qip)).toString())
                    : (packInputs[key] ?? item.quantity.toString());
                  const packsPreview = isPacks ? computeBaseUnits(parseInt(displayedQty) || 1, 'packs', qip) : undefined;
                  const palletPreview = item.sellingType === 'pallets' && item.unitsPerPallet
                    ? computeBaseUnits(parseInt(displayedQty) || 1, 'pallets', item.quantityInPack ?? 1, item.unitsPerPallet)
                    : undefined;
                  const unitLabel = item.sellingType === 'pallets' ? 'pallet' : isPacks ? 'pack' : 'unit';
                  // Price is per base-unit except for pallet items (which use palletPrice)
                  const priceLabel = item.sellingType === 'pallets' ? 'pallet' : 'unit';
                  const palletMoqViolation = item.sellingType === 'pallets' && item.palletMoq && item.palletMoq > 1 && item.quantity < item.palletMoq;

                  return (
                  <div key={key} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-medium text-sm">{item.productName}</span>
                      <button
                        onClick={() => setEditItems(editItems.filter((_, i) => i !== index))}
                        className="text-red-400 hover:text-red-600 flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Mode selector */}
                    {showModeSelector && (
                      <div className="flex rounded overflow-hidden border border-gray-200 text-xs mb-2 w-fit">
                        {showUnits && (
                          <button type="button" onClick={() => switchEditItemMode(index, 'units')}
                            className={`px-2.5 py-1 transition-colors ${activeMode === 'units' ? 'bg-gray-700 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                            Units
                          </button>
                        )}
                        {showPacks && (
                          <button type="button" onClick={() => switchEditItemMode(index, 'packs')}
                            className={`px-2.5 py-1 border-l transition-colors ${activeMode === 'packs' ? 'bg-blue-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                            Packs
                          </button>
                        )}
                        {showPallets && (
                          <button type="button" onClick={() => switchEditItemMode(index, 'pallets')}
                            className={`px-2.5 py-1 border-l transition-colors ${activeMode === 'pallets' ? 'bg-blue-700 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                            Pallets
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-500 flex items-baseline gap-1 flex-wrap">
                          <span>Qty ({item.sellingType === 'pallets' ? 'pallets' : isPacks ? 'packs' : 'units'})</span>
                          {isPacks && packsPreview !== undefined && (
                            <span className="text-blue-500 font-normal">= {packsPreview} units</span>
                          )}
                          {item.sellingType === 'pallets' && palletPreview !== undefined && (
                            <span className="text-blue-500 font-normal">= {palletPreview} units</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline" size="sm" className="h-7 w-7 p-0"
                            onClick={() => {
                              const current = parseInt(displayedQty) || 1;
                              if (current <= 1) return;
                              const newDisplay = current - 1;
                              const newBase = isPacks ? newDisplay * qip : newDisplay;
                              const updated = [...editItems];
                              updated[index] = { ...updated[index], quantity: Math.max(1, newBase) };
                              setEditItems(updated);
                              setPackInputs(prev => ({ ...prev, [key]: newDisplay.toString() }));
                            }}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <input
                            type="number"
                            min="1"
                            value={displayedQty}
                            onChange={(e) => {
                              setPackInputs(prev => ({ ...prev, [key]: e.target.value }));
                            }}
                            onBlur={(e) => commitQty(index, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className={`w-14 text-center text-sm font-medium border rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${palletMoqViolation ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                          />
                          <Button
                            variant="outline" size="sm" className="h-7 w-7 p-0"
                            onClick={() => {
                              const current = parseInt(displayedQty) || 1;
                              const newDisplay = current + 1;
                              const newBase = isPacks ? newDisplay * qip : newDisplay;
                              const updated = [...editItems];
                              updated[index] = { ...updated[index], quantity: newBase };
                              setEditItems(updated);
                              setPackInputs(prev => ({ ...prev, [key]: newDisplay.toString() }));
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        {item.quantity < 1 && (
                          <p className="text-xs text-red-600">Quantity must be at least 1</p>
                        )}
                        {palletMoqViolation && (
                          <p className="text-xs text-red-600">Min {item.palletMoq} pallets</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 text-xs">£</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.customPrice}
                            onChange={(e) => {
                              const updated = [...editItems];
                              updated[index] = { ...updated[index], customPrice: parseFloat(e.target.value) || 0 };
                              setEditItems(updated);
                            }}
                            className={`w-20 p-1 border rounded text-sm text-right ${item.customPrice <= 0 ? 'border-red-400 bg-red-50' : ''}`}
                          />
                          <span className="text-xs text-gray-500">/{priceLabel}</span>
                        </div>
                        {item.customPrice <= 0 && (
                          <p className="text-xs text-red-600">Price must be greater than £0</p>
                        )}
                        {isPriceChanged(item) && (
                          <select
                            value={priceScopes[getItemKey(item)] || 'all'}
                            onChange={(e) => {
                              const key = getItemKey(item);
                              setPriceScopes(prev => ({ ...prev, [key]: e.target.value as 'invoice' | 'customer' | 'all' }));
                            }}
                            className="mt-0.5 text-xs border rounded p-0.5 bg-white max-w-[10rem]"
                            title="Where should this new price apply?"
                          >
                            <option value="all">Update for all customers</option>
                            <option value="customer">This customer only</option>
                            <option value="invoice">This invoice only</option>
                          </select>
                        )}
                        {isPriceChanged(item) &&
                          (priceScopes[getItemKey(item)] || 'all') === 'all' &&
                          item.sellingType !== 'pallets' &&
                          !!item.palletPrice && (
                            <p className="text-xs text-amber-600 max-w-[10rem]">
                              Pallet price will scale to match.
                            </p>
                          )}
                      </div>
                      <span className="text-sm font-medium text-green-700 ml-auto">
                        {formatMoney(item.customPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          <Button variant="outline" className="w-full border-dashed" onClick={() => setEditProductDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Cost</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">£</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editDeliveryCost}
                onChange={(e) => setEditDeliveryCost(e.target.value)}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  setEditDeliveryCost(isFinite(val) && val >= 0 ? val.toFixed(2) : '0.00');
                }}
                onFocus={(e) => e.target.select()}
                className="w-28 border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Method of Payment</label>
            <select
              value={editPaymentMethod}
              onChange={(e) => setEditPaymentMethod(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card Payment</option>
              <option value="cheque">Cheque</option>
              <option value="payment_link">Payment Link</option>
              <option value="pay_later">Pay Later</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="border-t pt-3 space-y-1">
            <div className="flex justify-between text-gray-600">
              <span>Products</span>
              <span>{formatMoney(editSubtotal)}</span>
            </div>
            {deliveryCostVal > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Delivery</span>
                <span>{formatMoney(deliveryCostVal)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span>{formatMoney(editSubtotal + deliveryCostVal)}</span>
            </div>
          </div>

          {editSaveError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {editSaveError}
            </div>
          )}

          {hasInvalidItems && (
            <p className="text-xs text-red-600 text-center">
              All items must have a price greater than £0 and a quantity of at least 1 before saving.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isSavingQuote}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={handleSaveQuote}
              disabled={isSavingQuote || hasInvalidItems || editItems.length === 0}
            >
              {isSavingQuote ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={editProductDialogOpen} onOpenChange={setEditProductDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Product to Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={editProductSearch}
                onChange={(e) => setEditProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {filteredEditProducts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No products found</p>
              ) : filteredEditProducts.map(product => {
                const hasUnits = !product.sellingFormat || product.sellingFormat === 'units' || product.sellingFormat === 'both';
                const hasPallets = (product.sellingFormat === 'pallets' || product.sellingFormat === 'both') && !!product.palletPrice;
                return (
                  <div key={product.id} className="border rounded-lg p-3">
                    <div className="font-medium text-sm mb-2">{product.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {hasUnits && parseFloat(product.price) > 0 && (
                        <button
                          onClick={() => {
                            const existing = editItems.findIndex(i => i.productId === product.id && i.sellingType === 'units');
                            if (existing >= 0) {
                              const updated = [...editItems];
                              const existingItem = updated[existing];
                              // If item is in pack display mode, add a full pack worth of base units
                              const itemKey = getItemKey(existingItem);
                              const increment = packMode[itemKey] ? (existingItem.quantityInPack ?? 1) : 1;
                              updated[existing] = { ...existingItem, quantity: existingItem.quantity + increment };
                              setEditItems(updated);
                            } else {
                              setEditItems(prev => [...prev, {
                                productId: product.id,
                                productName: product.name,
                                quantity: 1,
                                customPrice: parseFloat(product.price),
                                sellingType: 'units',
                                imageUrl: product.imageUrl,
                                stock: product.stock,
                                quantityInPack: (product.quantityInPack ?? 1) > 1 ? product.quantityInPack : undefined,
                                unitsPerPallet: product.unitsPerPallet,
                                sellingFormat: product.sellingFormat,
                                palletPrice: product.palletPrice ? parseFloat(product.palletPrice) : undefined,
                                unitPrice: parseFloat(product.price),
                                palletMoq: product.palletMoq,
                              }]);
                              setBaseline(product.id, 'units', parseFloat(product.price));
                            }
                            setEditProductDialogOpen(false);
                            setEditProductSearch('');
                          }}
                          className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded hover:bg-green-100"
                        >
                          + Units — £{parseFloat(product.price).toFixed(2)} ({product.stock} in stock)
                        </button>
                      )}
                      {hasPallets && product.palletPrice && (
                        <button
                          onClick={() => {
                            const existing = editItems.findIndex(i => i.productId === product.id && i.sellingType === 'pallets');
                            if (existing >= 0) {
                              const updated = [...editItems];
                              updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 };
                              setEditItems(updated);
                            } else {
                              const initPalletQty = Math.max(1, product.palletMoq ?? 1);
                              setEditItems(prev => [...prev, {
                                productId: product.id,
                                productName: `${product.name} (Pallet)`,
                                quantity: initPalletQty,
                                customPrice: parseFloat(product.palletPrice!),
                                sellingType: 'pallets',
                                imageUrl: product.imageUrl,
                                palletStock: product.palletStock,
                                unitsPerPallet: product.unitsPerPallet,
                                sellingFormat: product.sellingFormat,
                                palletPrice: parseFloat(product.palletPrice!),
                                unitPrice: parseFloat(product.price),
                                palletMoq: product.palletMoq,
                              }]);
                              setBaseline(product.id, 'pallets', parseFloat(product.palletPrice!));
                            }
                            setEditProductDialogOpen(false);
                            setEditProductSearch('');
                          }}
                          className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded hover:bg-blue-100"
                        >
                          + Pallet — £{parseFloat(product.palletPrice).toFixed(2)} ({product.palletStock || 0} in stock)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
