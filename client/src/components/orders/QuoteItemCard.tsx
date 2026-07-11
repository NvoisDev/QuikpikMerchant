import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Percent, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
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
  const showModeSelector = [showUnits, showPacks, showPallets].filter(Boolean).length > 1;

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

  const hasPackDims = !!(item.packQuantity && item.unitSize && item.unitOfMeasure);
  const hasWeight = item.weightKg > 0;

  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="text-gray-300 hover:text-gray-600 transition-colors shrink-0 p-0.5 rounded"
            aria-label="Expand item"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate leading-tight">
            {item.productName}
          </span>
          <span className="text-sm text-gray-500 shrink-0">
            {isPacks
              ? `${Math.max(1, Math.round(item.quantity / qip))} pk`
              : item.sellingType === 'pallets'
              ? `${item.quantity} pl`
              : `${item.quantity}`}
          </span>
          <span className="w-16 text-sm font-semibold text-gray-900 text-right shrink-0">
            {formatCurrency(item.customPrice * item.quantity)}
          </span>
          <button
            onClick={() => removeItem(index)}
            className="text-gray-300 hover:text-red-500 transition-colors shrink-0 p-0.5 rounded"
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
      {/* ── Main area: stacked on mobile, single flex row on desktop ── */}
      <div className="px-2.5 py-1.5 sm:flex sm:items-start sm:gap-1.5">

        {/* ─ Name row ─ */}
        <div className="flex items-start gap-1.5 sm:flex-1 sm:min-w-0">
          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="text-gray-300 hover:text-gray-600 transition-colors shrink-0 p-0.5 rounded mt-0.5"
            aria-label="Collapse item"
          >
            <ChevronUp className="h-4 w-4" />
          </button>

          {/* Name + two-line meta */}
          <div className="flex-1 min-w-0">
            {/* Name + badges */}
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

            {/* Meta line 1: price · stock (+ inline mode label for single-mode products on mobile) */}
            <div className="flex items-center gap-1 mt-0.5">
              {!showModeSelector && (
                <span className="text-[11px] text-gray-500 font-medium sm:hidden">
                  {item.sellingType === 'pallets' ? 'Pallets' : isPacks ? 'Packs' : 'Units'}
                  <span className="text-gray-300 ml-1">·</span>
                </span>
              )}
              <span className="text-[11px] text-gray-400">
                {formatCurrency(item.originalPrice)}/{priceLabel}
              </span>
              {item.stockCount !== undefined && (
                <>
                  <span className="text-[11px] text-gray-300">·</span>
                  <span className={`text-[11px] font-medium ${isOverStock ? 'text-red-500' : 'text-gray-400'}`}>
                    {item.stockCount} {stockUnitLabel}{item.stockCount !== 1 ? 's' : ''} in stock
                  </span>
                </>
              )}
            </div>

            {/* Meta line 2: dimensions · weight (only when both are present) */}
            {(hasPackDims && hasWeight) && (
              <div className="flex items-center gap-1">
                {hasPackDims && (
                  <span className="text-[11px] text-gray-400">
                    {item.packQuantity}×{formatWeight(item.unitSize!)}{item.unitOfMeasure}
                  </span>
                )}
                {hasPackDims && hasWeight && (
                  <span className="text-[11px] text-gray-300">·</span>
                )}
                {hasWeight && (
                  <span className="text-[11px] text-gray-400">
                    {formatWeight(item.weightKg)}kg/{item.sellingType === 'pallets' ? 'pallet' : item.packQuantity && item.packQuantity > 1 ? 'pack' : 'unit'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Delete — mobile only */}
          <button
            onClick={() => removeItem(index)}
            className="sm:hidden text-gray-300 hover:text-red-500 transition-colors shrink-0 p-0.5 rounded mt-0.5"
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* ─ Toggle zone — only rendered when multiple selling modes are available ─ */}
        {showModeSelector && onSwitchMode && (
          <div className="flex mt-2 pl-7 sm:pl-0 sm:mt-0">
            <div className="flex flex-1 sm:flex-none rounded-md border border-gray-200 overflow-hidden min-h-[44px] sm:min-h-0">
              {showUnits && (
                <button
                  type="button"
                  onClick={() => onSwitchMode('units')}
                  className={`flex-1 sm:flex-none sm:px-1.5 sm:py-0.5 flex items-center justify-center transition-colors font-medium text-sm sm:text-[10px]
                    ${activeMode === 'units' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Units
                </button>
              )}
              {showPacks && (
                <button
                  type="button"
                  onClick={() => onSwitchMode('packs')}
                  className={`flex-1 sm:flex-none sm:px-1.5 sm:py-0.5 flex items-center justify-center border-l transition-colors font-medium text-sm sm:text-[10px]
                    ${activeMode === 'packs' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Packs
                </button>
              )}
              {showPallets && (
                <button
                  type="button"
                  onClick={() => onSwitchMode('pallets')}
                  className={`flex-1 sm:flex-none sm:px-1.5 sm:py-0.5 flex items-center justify-center border-l transition-colors font-medium text-sm sm:text-[10px]
                    ${activeMode === 'pallets' ? 'bg-blue-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Pallets
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─ Inputs row (indented on mobile to align under name; inline on desktop) ─ */}
        <div className="flex items-center gap-1.5 mt-1 sm:mt-0 pl-7 sm:pl-0">
          {/* Qty input */}
          <div className="w-14 sm:w-16 shrink-0">
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
              className={`h-11 sm:h-7 text-xs text-center px-1 ${item.quantity < 1 || palletMoqViolation ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
          </div>

          {/* Price input */}
          <div className="w-16 sm:w-20 shrink-0">
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
              className={`h-11 sm:h-7 text-xs text-center px-1 ${item.customPrice <= 0 ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
          </div>

          {/* Total + weight stacked */}
          <div className="w-14 sm:w-16 shrink-0 text-right">
            <div className="text-[10px] text-gray-400 mb-0.5">Total</div>
            <div className="text-sm font-semibold text-gray-900 leading-none">
              {formatCurrency(item.customPrice * item.quantity)}
            </div>
            {hasWeight && (
              <div className="text-[10px] text-gray-400 mt-1 leading-none">
                {formatWeight(item.weightKg * item.quantity)} kg
              </div>
            )}
          </div>

          {/* Delete — desktop only */}
          <button
            onClick={() => removeItem(index)}
            className="hidden sm:block text-gray-300 hover:text-red-500 transition-colors shrink-0 p-0.5 rounded"
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
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

      {/* ── Cost + Margin footer (weight removed — now stacked under Total) ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-2 border-t border-dashed border-gray-100 bg-gray-50">
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
      </div>
    </div>
  );
}
