import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Percent, AlertTriangle } from "lucide-react";
import { computeBaseUnits } from "@shared/quote-units";

interface QuoteItem {
  stableId: string;
  productId: number;
  productName: string;
  originalPrice: number;
  customPrice: number;
  quantity: number;
  sellingType: 'units' | 'pallets';
  unitsPerPallet?: number;
  promotionalOffers?: any[];
  costPrice: number;
  weightKg: number;
  packQuantity?: number;
  unitSize?: string;
  unitOfMeasure?: string;
  stockCount?: number;
  quantityInPack?: number;
  displayUnit?: 'units' | 'packs';
  sellingFormat?: string;
  palletPrice?: number;
  unitPrice?: number;
  palletMoq?: number;
  unitStockCount?: number;
  palletStockCount?: number;
  priceScope?: 'invoice' | 'customer' | 'all';
}

interface QuoteItemCardProps {
  item: QuoteItem;
  index: number;
  inputValues: Record<string, { price: string; qty: string }>;
  costValues: Record<string, string>;
  setInputValues: React.Dispatch<React.SetStateAction<Record<string, { price: string; qty: string }>>>;
  setCostValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateItemPrice: (index: number, val: number) => void;
  updateItemPriceScope: (index: number, scope: 'invoice' | 'customer' | 'all') => void;
  updateItemQuantity: (index: number, val: number) => void;
  updateItemCost: (index: number, val: number) => void;
  removeItem: (index: number) => void;
  formatCurrency: (n: number) => string;
  formatWeight: (n: number | string) => string;
  onSwitchMode?: (mode: 'units' | 'packs' | 'pallets') => void;
}

export function QuoteItemCard({
  item,
  index,
  inputValues,
  costValues,
  setInputValues,
  setCostValues,
  updateItemPrice,
  updateItemPriceScope,
  updateItemQuantity,
  updateItemCost,
  removeItem,
  formatCurrency,
  formatWeight,
  onSwitchMode,
}: QuoteItemCardProps) {
  const sk = item.stableId;
  const qip = item.quantityInPack ?? 1;
  const isPacks = item.displayUnit === 'packs' && qip > 1 && item.sellingType !== 'pallets';

  const activeMode: 'units' | 'packs' | 'pallets' =
    item.sellingType === 'pallets' ? 'pallets' : isPacks ? 'packs' : 'units';

  const showUnits = item.sellingFormat !== 'pallets' && !!item.unitPrice;
  const showPacks = qip > 1 && item.sellingFormat !== 'pallets' && item.sellingFormat !== 'units';
  const showPallets = !!item.palletPrice && item.sellingFormat !== 'units';
  const showModeSelector = (showPacks || showPallets) && (showUnits || showPacks || showPallets);

  const liveDisplayQty = parseInt(inputValues[sk]?.qty ?? '') || (
    isPacks ? Math.max(1, Math.round(item.quantity / qip)) : item.quantity
  );
  const liveBaseQty = computeBaseUnits(liveDisplayQty, isPacks ? 'packs' : 'units', qip);

  const unitLabel = item.sellingType === 'pallets' ? 'pallet' : isPacks ? 'pack' : 'unit';
  // Price is always per base-unit except for pallet items (which use palletPrice)
  const priceLabel = item.sellingType === 'pallets' ? 'pallet' : 'unit';
  const stockUnitLabel = item.sellingType === 'pallets' ? 'pallet' : 'unit';

  const palletMoqViolation =
    item.sellingType === 'pallets' && item.palletMoq && item.palletMoq > 1 && liveDisplayQty < item.palletMoq;

  // The price was manually changed from the price this line was added at. When true,
  // the wholesaler can choose where the new price applies (this order / this customer
  // / all customers), mirroring the edit-invoice screen.
  const priceChanged = Math.abs(item.customPrice - item.originalPrice) > 0.001;
  const priceScope = item.priceScope || 'all';

  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      {/* Product name and original price */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate flex items-center gap-2">
            {item.productName}
            {item.sellingType === 'pallets' && !showModeSelector && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                Pallet
              </Badge>
            )}
          </div>
          <div className="text-sm text-gray-500">
            Original: {formatCurrency(item.originalPrice)}/{priceLabel}
            {item.customPrice < item.originalPrice && (
              <Badge variant="secondary" className="ml-2 text-green-600">
                <Percent className="h-3 w-3 mr-1" />
                {((1 - item.customPrice / item.originalPrice) * 100).toFixed(0)}% off
              </Badge>
            )}
          </div>
          {item.packQuantity && item.unitSize && item.unitOfMeasure && (
            <span className="text-xs text-gray-400">
              {item.packQuantity} × {formatWeight(item.unitSize)}{item.unitOfMeasure}
            </span>
          )}
          {item.weightKg > 0 && (
            <span className="text-xs text-gray-400">
              {formatWeight(item.weightKg)} kg/{item.sellingType === 'pallets' ? 'pallet' : item.packQuantity && item.packQuantity > 1 ? 'pack' : 'unit'}
            </span>
          )}
          {item.stockCount !== undefined && (
            <Badge variant="secondary" className="text-xs text-gray-500 bg-gray-100">
              {item.stockCount} {stockUnitLabel}{item.stockCount !== 1 ? 's' : ''} in stock
            </Badge>
          )}
          {item.promotionalOffers && item.promotionalOffers.length > 0 && item.sellingType !== 'pallets' && (() => {
            const now = new Date();
            const activeOffers = item.promotionalOffers.filter((o: any) => {
              if (o.isActive === false) return false;
              if (o.startDate && new Date(o.startDate) > now) return false;
              if (o.endDate && new Date(o.endDate) < now) return false;
              return true;
            });
            if (activeOffers.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1 mt-1">
                {activeOffers.map((offer: any, oi: number) => (
                  <Badge key={oi} variant="secondary" className={
                    offer.type === 'percentage_discount' ? 'bg-red-100 text-red-700 text-xs' :
                    offer.type === 'fixed_price' ? 'bg-green-100 text-green-700 text-xs' :
                    offer.type === 'buy_x_get_y_free' ? 'bg-purple-100 text-purple-700 text-xs' :
                    offer.type === 'bundle_deal' ? 'bg-blue-100 text-blue-700 text-xs' :
                    offer.type === 'clearance' ? 'bg-orange-100 text-orange-700 text-xs' :
                    'bg-purple-100 text-purple-700 text-xs'
                  }>
                    {offer.type === 'percentage_discount' ? `${offer.discountPercentage}% Off` :
                     offer.type === 'fixed_price' ? `${formatCurrency(offer.fixedPrice)} each` :
                     offer.type === 'buy_x_get_y_free' ? `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free` :
                     offer.type === 'bundle_deal' ? `${offer.minQuantity}+ @ ${formatCurrency(offer.fixedPrice)} each` :
                     offer.type === 'clearance' ? `Clearance ${formatCurrency(offer.fixedPrice)}` :
                     offer.name || 'Promo Active'}
                  </Badge>
                ))}
                <p className="text-[11px] text-gray-400 mt-0.5 italic">
                  Promo shown for reference — price & qty are entered manually
                </p>
              </div>
            );
          })()}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0 -mt-1 -mr-1"
          onClick={() => removeItem(index)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Unit mode selector */}
      {showModeSelector && onSwitchMode && (
        <div className="flex rounded overflow-hidden border border-gray-200 text-xs mb-3 w-fit">
          {showUnits && (
            <button
              type="button"
              onClick={() => onSwitchMode('units')}
              className={`px-2.5 py-1 transition-colors ${activeMode === 'units' ? 'bg-gray-700 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Units
            </button>
          )}
          {showPacks && (
            <button
              type="button"
              onClick={() => onSwitchMode('packs')}
              className={`px-2.5 py-1 border-l transition-colors ${activeMode === 'packs' ? 'bg-blue-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Packs
            </button>
          )}
          {showPallets && (
            <button
              type="button"
              onClick={() => onSwitchMode('pallets')}
              className={`px-2.5 py-1 border-l transition-colors ${activeMode === 'pallets' ? 'bg-blue-700 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Pallets
            </button>
          )}
        </div>
      )}

      {/* Price, Qty, Total row */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
        <div className="flex-1">
          <Label className="text-xs text-gray-500">Price / {priceLabel}</Label>
          <Input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            value={inputValues[sk]?.price ?? item.customPrice.toString()}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], price: val } }));
              }
            }}
            onBlur={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val >= 0) {
                updateItemPrice(index, val);
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], price: val.toString() } }));
              } else {
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], price: item.customPrice.toString() } }));
              }
            }}
            className={`h-8 ${item.customPrice <= 0 ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
          />
          {item.customPrice <= 0 && (
            <p className="text-xs text-red-500 mt-0.5">Price must be &gt; £0</p>
          )}
          {priceChanged && (
            <select
              value={priceScope}
              onChange={(e) => updateItemPriceScope(index, e.target.value as 'invoice' | 'customer' | 'all')}
              className="mt-1 text-xs border rounded p-1 bg-white w-full max-w-[12rem]"
              title="Where should this new price apply?"
            >
              <option value="all">Update for all customers</option>
              <option value="customer">This customer only</option>
              <option value="invoice">This invoice only</option>
            </select>
          )}
          {priceChanged && priceScope === 'all' && item.sellingType !== 'pallets' && !!item.palletPrice && (
            <p className="text-xs text-amber-600 mt-0.5 max-w-[12rem]">Pallet price will scale to match.</p>
          )}
        </div>
        <div className="flex items-end gap-2 sm:gap-3">
          <div className="flex-1 sm:w-28 sm:flex-none">
            <Label className="text-xs text-gray-500 flex items-baseline gap-1 flex-wrap">
              <span>Qty ({item.sellingType === 'pallets' ? 'pallets' : isPacks ? 'packs' : 'units'})</span>
              {isPacks && liveBaseQty > 0 && (
                <span className="text-blue-500 font-normal">= {liveBaseQty} units</span>
              )}
              {item.sellingType === 'pallets' && item.unitsPerPallet && (
                <span className="text-blue-500 font-normal">= {computeBaseUnits(liveDisplayQty, 'pallets', item.quantityInPack ?? 1, item.unitsPerPallet)} units</span>
              )}
            </Label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputValues[sk]?.qty ?? (isPacks ? Math.max(1, Math.round(item.quantity / qip)).toString() : item.quantity.toString())}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*$/.test(val)) {
                  setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], qty: val } }));
                }
              }}
              onBlur={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1) {
                  const baseUnits = computeBaseUnits(val, isPacks ? 'packs' : 'units', qip);
                  updateItemQuantity(index, baseUnits);
                  setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], qty: val.toString() } }));
                } else {
                  const defaultBase = computeBaseUnits(1, isPacks ? 'packs' : 'units', qip);
                  updateItemQuantity(index, defaultBase);
                  setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], qty: '1' } }));
                }
              }}
              className={`h-8 ${item.quantity < 1 || palletMoqViolation ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {item.quantity < 1 && (
              <p className="text-xs text-red-500 mt-0.5">Min qty 1</p>
            )}
            {palletMoqViolation && (
              <p className="text-xs text-red-500 mt-0.5">Min {item.palletMoq} pallets</p>
            )}
          </div>
          <div className="w-20 text-right">
            <Label className="text-xs text-gray-500">Total</Label>
            <div className="font-semibold">
              {formatCurrency(item.customPrice * item.quantity)}
            </div>
          </div>
        </div>
      </div>

      {/* Stock warning */}
      {item.stockCount !== undefined && (() => {
        const compareQty = item.sellingType === 'pallets' ? liveDisplayQty : liveBaseQty;
        if (compareQty <= item.stockCount) return null;
        return (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
            <span>Only {item.stockCount} {stockUnitLabel}{item.stockCount !== 1 ? 's' : ''} available — you have {compareQty}</span>
          </div>
        );
      })()}

      {/* Cost + Margin row */}
      {(() => {
        const costVal = costValues[sk] ?? item.costPrice.toString();
        const costNum = parseFloat(costVal) || 0;
        const livePrice = parseFloat(inputValues[sk]?.price ?? item.customPrice.toString()) || item.customPrice;
        const marginAmt = livePrice - costNum;
        const marginPct = livePrice > 0 ? (marginAmt / livePrice) * 100 : 0;
        const isNegative = marginAmt < 0;
        return (
          <div className="flex items-end gap-3 mt-2 pt-2 border-t border-dashed border-gray-200">
            <div className="w-24">
              <Label className="text-xs text-gray-400">Cost (£)</Label>
              <Input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                value={costVal}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setCostValues(prev => ({ ...prev, [sk]: val }));
                  }
                }}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  const newCost = !isNaN(val) && val >= 0 ? val : 0;
                  updateItemCost(index, newCost);
                  setCostValues(prev => ({ ...prev, [sk]: newCost.toString() }));
                }}
                className="h-8 text-xs"
                placeholder="0.00"
              />
            </div>
            <div className="flex-1 text-xs">
              <Label className="text-xs text-gray-400">Margin / {priceLabel}</Label>
              <div className={`font-medium mt-1.5 ${isNegative ? 'text-red-600' : 'text-green-700'}`}>
                {formatCurrency(marginAmt)} ({marginPct.toFixed(1)}%)
              </div>
            </div>
            {item.weightKg > 0 && (
              <div className="text-xs text-gray-400 text-right">
                <Label className="text-xs text-gray-400">Weight</Label>
                <div className="mt-1.5">{formatWeight(item.weightKg * item.quantity)} kg</div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
