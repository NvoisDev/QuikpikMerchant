import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Percent } from "lucide-react";

interface QuoteItem {
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
}

interface QuoteItemCardProps {
  item: QuoteItem;
  index: number;
  inputValues: Record<string, { price: string; qty: string }>;
  costValues: Record<string, string>;
  setInputValues: React.Dispatch<React.SetStateAction<Record<string, { price: string; qty: string }>>>;
  setCostValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateItemPrice: (index: number, val: number) => void;
  updateItemQuantity: (index: number, val: number) => void;
  updateItemCost: (index: number, val: number) => void;
  removeItem: (index: number) => void;
  formatCurrency: (n: number) => string;
  formatWeight: (n: number | string) => string;
}

export function QuoteItemCard({
  item,
  index,
  inputValues,
  costValues,
  setInputValues,
  setCostValues,
  updateItemPrice,
  updateItemQuantity,
  updateItemCost,
  removeItem,
  formatCurrency,
  formatWeight,
}: QuoteItemCardProps) {
  const sk = `${item.productId}-${item.sellingType}`;

  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      {/* Product name and original price */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate flex items-center gap-2">
            {item.productName}
            {item.sellingType === 'pallets' && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                Pallet
              </Badge>
            )}
          </div>
          <div className="text-sm text-gray-500">
            Original: {formatCurrency(item.originalPrice)}{item.sellingType === 'pallets' ? '/pallet' : '/unit'}
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
              {item.stockCount} {item.sellingType === 'pallets' ? 'pallet' : 'unit'}{item.stockCount !== 1 ? 's' : ''} in stock
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

      {/* Price, Qty, Total row */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label className="text-xs text-gray-500">Price</Label>
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
        </div>
        <div className="w-16">
          <Label className="text-xs text-gray-500">Qty</Label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={inputValues[sk]?.qty ?? item.quantity.toString()}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || /^\d*$/.test(val)) {
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], qty: val } }));
              }
            }}
            onBlur={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= 1) {
                updateItemQuantity(index, val);
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], qty: val.toString() } }));
              } else {
                updateItemQuantity(index, 1);
                setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], qty: '1' } }));
              }
            }}
            className={`h-8 ${item.quantity < 1 ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
          />
          {item.quantity < 1 && (
            <p className="text-xs text-red-500 mt-0.5">Min qty 1</p>
          )}
        </div>
        <div className="w-20 text-right">
          <Label className="text-xs text-gray-500">Total</Label>
          <div className="font-semibold">
            {formatCurrency(item.customPrice * item.quantity)}
          </div>
        </div>
      </div>

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
              <Label className="text-xs text-gray-400">Margin / unit</Label>
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
