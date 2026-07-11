import { Input } from "@/components/ui/input";
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

  const priceLabel = item.sellingType === 'pallets' ? 'pallet' : 'unit';
  const stockUnitLabel = item.sellingType === 'pallets' ? 'pallet' : 'unit';

  const palletMoqViolation =
    item.sellingType === 'pallets' && item.palletMoq && item.palletMoq > 1 && liveDisplayQty < item.palletMoq;

  const priceChanged = Math.abs(item.customPrice - item.originalPrice) > 0.001;
  const priceScope = item.priceScope || 'all';

  const hasDiscount = item.customPrice < item.originalPrice;
  const discountPct = hasDiscount
    ? ((1 - item.customPrice / item.originalPrice) * 100).toFixed(0)
    : null;

  const activePromos = (() => {
    if (!item.promotionalOffers?.length || item.sellingType === 'pallets') return [];
    const now = new Date();
    return item.promotionalOffers.filter((o: any) => {
      if (o.isActive === false) return false;
      if (o.startDate && new Date(o.startDate) > now) return false;
      if (o.endDate && new Date(o.endDate) < now) return false;
      return true;
    });
  })();

  const costVal = costValues[sk] ?? item.costPrice.toString();
  const costNum = parseFloat(costVal) || 0;
  const livePrice = parseFloat(inputValues[sk]?.price ?? item.customPrice.toString()) || item.customPrice;
  const marginAmt = livePrice - costNum;
  const marginPct = livePrice > 0 ? (marginAmt / livePrice) * 100 : 0;
  const isNegativeMargin = marginAmt < 0;

  const compareQty = item.sellingType === 'pallets' ? liveDisplayQty : liveBaseQty;
  const isOverStock = item.stockCount !== undefined && compareQty > item.stockCount;

  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
      {/* ── Main compact row ── */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate leading-tight">
              {item.productName}
            </span>
            {item.sellingType === 'pallets' && !showModeSelector && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[10px] px-1 py-0 leading-tight h-4">
                Pallet
              </Badge>
            )}
            {discountPct && (
              <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px] px-1 py-0 leading-tight h-4 flex items-center gap-0.5">
                <Percent className="h-2.5 w-2.5" />{discountPct}% off
              </Badge>
            )}
          </div>
          {/* Secondary meta: original price + pack/weight/stock */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0 mt-0.5">
            <span className="text-[11px] text-gray-400">
              {formatCurrency(item.originalPrice)}/{priceLabel}
            </span>
            {item.packQuantity && item.unitSize && item.unitOfMeasure && (
              <span className="text-[11px] text-gray-400">
                {item.packQuantity}×{formatWeight(item.unitSize)}{item.unitOfMeasure}
              </span>
            )}
            {item.weightKg > 0 && (
              <span className="text-[11px] text-gray-400">
                {formatWeight(item.weightKg)}kg/{item.sellingType === 'pallets' ? 'pallet' : item.packQuantity && item.packQuantity > 1 ? 'pack' : 'unit'}
              </span>
            )}
            {item.stockCount !== undefined && (
              <span className={`text-[11px] font-medium ${isOverStock ? 'text-red-500' : 'text-gray-400'}`}>
                {item.stockCount} {stockUnitLabel}{item.stockCount !== 1 ? 's' : ''} in stock
              </span>
            )}
          </div>
        </div>

        {/* Mode selector (compact pill strip) */}
        {showModeSelector && onSwitchMode && (
          <div className="flex rounded overflow-hidden border border-gray-200 text-[10px] shrink-0">
            {showUnits && (
              <button
                type="button"
                onClick={() => onSwitchMode('units')}
                className={`px-1.5 py-0.5 transition-colors ${activeMode === 'units' ? 'bg-gray-700 text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                U
              </button>
            )}
            {showPacks && (
              <button
                type="button"
                onClick={() => onSwitchMode('packs')}
                className={`px-1.5 py-0.5 border-l transition-colors ${activeMode === 'packs' ? 'bg-blue-600 text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                Pk
              </button>
            )}
            {showPallets && (
              <button
                type="button"
                onClick={() => onSwitchMode('pallets')}
                className={`px-1.5 py-0.5 border-l transition-colors ${activeMode === 'pallets' ? 'bg-blue-700 text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                Pl
              </button>
            )}
          </div>
        )}

        {/* Qty input */}
        <div className="w-16 shrink-0">
          <div className="text-[10px] text-gray-400 mb-0.5 text-center">
            {item.sellingType === 'pallets' ? 'Pallets' : isPacks ? 'Packs' : 'Qty'}
          </div>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={inputValues[sk]?.qty ?? (isPacks ? Math.max(1, Math.round(item.quantity / qip)).toString() : item.quantity.toString())}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || /^\d*$/.test(val)) {
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk]!, qty: val } }));
              }
            }}
            onBlur={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= 1) {
                const baseUnits = computeBaseUnits(val, isPacks ? 'packs' : 'units', qip);
                updateItemQuantity(index, baseUnits);
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk]!, qty: val.toString() } }));
              } else {
                const defaultBase = computeBaseUnits(1, isPacks ? 'packs' : 'units', qip);
                updateItemQuantity(index, defaultBase);
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk]!, qty: '1' } }));
              }
            }}
            className={`h-7 text-xs text-center px-1 ${item.quantity < 1 || palletMoqViolation ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
          />
        </div>

        {/* Price input */}
        <div className="w-20 shrink-0">
          <div className="text-[10px] text-gray-400 mb-0.5 text-center">Price/{priceLabel}</div>
          <Input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            value={inputValues[sk]?.price ?? item.customPrice.toString()}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk]!, price: val } }));
              }
            }}
            onBlur={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val >= 0) {
                updateItemPrice(index, val);
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk]!, price: val.toString() } }));
              } else {
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk]!, price: item.customPrice.toString() } }));
              }
            }}
            className={`h-7 text-xs text-center px-1 ${item.customPrice <= 0 ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
          />
        </div>

        {/* Total */}
        <div className="w-16 shrink-0 text-right">
          <div className="text-[10px] text-gray-400 mb-0.5">Total</div>
          <div className="text-sm font-semibold text-gray-900 leading-7">
            {formatCurrency(item.customPrice * item.quantity)}
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={() => removeItem(index)}
          className="text-gray-300 hover:text-red-500 transition-colors shrink-0 p-0.5 rounded"
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* ── Inline expansion row (validation errors, pack/pallet hints, price scope) ── */}
      {(item.quantity < 1 || palletMoqViolation || item.customPrice <= 0 ||
        (isPacks && liveBaseQty > 0) ||
        (item.sellingType === 'pallets' && item.unitsPerPallet) ||
        priceChanged || isOverStock || activePromos.length > 0) && (
        <div className="px-2.5 pb-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {item.quantity < 1 && (
            <span className="text-[11px] text-red-500">Min qty 1</span>
          )}
          {palletMoqViolation && (
            <span className="text-[11px] text-red-500">Min {item.palletMoq} pallets</span>
          )}
          {item.customPrice <= 0 && (
            <span className="text-[11px] text-red-500">Price must be &gt; 0</span>
          )}
          {isPacks && liveBaseQty > 0 && (
            <span className="text-[11px] text-blue-500">= {liveBaseQty} units</span>
          )}
          {item.sellingType === 'pallets' && item.unitsPerPallet && (
            <span className="text-[11px] text-blue-500">
              = {computeBaseUnits(liveDisplayQty, 'pallets', item.quantityInPack ?? 1, item.unitsPerPallet)} units
            </span>
          )}
          {isOverStock && (
            <span className="flex items-center gap-0.5 text-[11px] text-yellow-700">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Only {item.stockCount} {stockUnitLabel}{item.stockCount !== 1 ? 's' : ''} available
            </span>
          )}
          {priceChanged && (
            <select
              value={priceScope}
              onChange={(e) => updateItemPriceScope(index, e.target.value as 'invoice' | 'customer' | 'all')}
              className="text-[11px] border rounded px-1 py-0.5 bg-white text-gray-600"
              title="Where should this new price apply?"
            >
              <option value="all">Update for all customers</option>
              <option value="customer">This customer only</option>
              <option value="invoice">This invoice only</option>
            </select>
          )}
          {priceChanged && priceScope === 'all' && item.sellingType !== 'pallets' && !!item.palletPrice && (
            <span className="text-[11px] text-amber-600">Pallet price will scale to match.</span>
          )}
          {activePromos.map((offer: any, oi: number) => (
            <Badge key={oi} variant="secondary" className={`text-[10px] px-1 py-0 h-4 leading-tight
              ${offer.type === 'percentage_discount' ? 'bg-red-100 text-red-700' :
                offer.type === 'fixed_price' ? 'bg-green-100 text-green-700' :
                offer.type === 'buy_x_get_y_free' ? 'bg-purple-100 text-purple-700' :
                offer.type === 'bundle_deal' ? 'bg-blue-100 text-blue-700' :
                offer.type === 'clearance' ? 'bg-orange-100 text-orange-700' :
                'bg-purple-100 text-purple-700'}`}
            >
              {offer.type === 'percentage_discount' ? `${offer.discountPercentage}% Off` :
               offer.type === 'fixed_price' ? `${formatCurrency(offer.fixedPrice)} each` :
               offer.type === 'buy_x_get_y_free' ? `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free` :
               offer.type === 'bundle_deal' ? `${offer.minQuantity}+ @ ${formatCurrency(offer.fixedPrice)} each` :
               offer.type === 'clearance' ? `Clearance ${formatCurrency(offer.fixedPrice)}` :
               offer.name || 'Promo'}
            </Badge>
          ))}
        </div>
      )}

      {/* ── Cost + Margin footer ── */}
      <div className="flex items-center gap-3 px-2.5 py-1 border-t border-dashed border-gray-100 bg-gray-50">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-400">Cost</span>
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
            className="h-6 w-16 text-xs text-center px-1"
            placeholder="0.00"
          />
        </div>
        <span className="text-[11px] text-gray-400">Margin</span>
        <span className={`text-[11px] font-medium ${isNegativeMargin ? 'text-red-600' : 'text-green-700'}`}>
          {formatCurrency(marginAmt)} ({marginPct.toFixed(1)}%)
        </span>
        {item.weightKg > 0 && (
          <span className="text-[11px] text-gray-400 ml-auto">
            {formatWeight(item.weightKg * item.quantity)} kg
          </span>
        )}
      </div>
    </div>
  );
}
