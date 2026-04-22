import { formatCurrency } from "@shared/utils/currency";

export const getCurrencySymbol = (currency = 'GBP'): string => {
  switch (currency?.toUpperCase()) {
    case 'GBP': return '£';
    case 'EUR': return '€';
    case 'USD': return '$';
    default: return '£';
  }
};

export const PriceDisplay = ({
  price,
  originalPrice,
  currency,
  isGuestMode,
  size = 'medium',
  showStrikethrough = false,
}: {
  price: number | null | undefined;
  originalPrice?: number | null;
  currency?: string;
  isGuestMode: boolean;
  size?: 'small' | 'medium' | 'large';
  showStrikethrough?: boolean;
}) => {
  const safePrice = typeof price === 'number' && Number.isFinite(price) ? price : 0;
  const safeOriginalPrice = typeof originalPrice === 'number' && Number.isFinite(originalPrice) ? originalPrice : undefined;
  const hasDiscount = safeOriginalPrice && safeOriginalPrice > safePrice;

  if (isGuestMode) {
    return (
      <div className="flex flex-col gap-1">
        <span className={`font-semibold text-gray-900 bg-gray-100 border border-gray-200 rounded-full px-3 py-1 w-fit ${
          size === 'small' ? 'text-xs' :
          size === 'large' ? 'text-base' : 'text-sm'
        }`}>
          Login to view price
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`font-bold ${
        hasDiscount ? 'text-green-600' : 'text-gray-900'
      } ${
        size === 'small' ? 'text-sm' :
        size === 'large' ? 'text-xl' : 'text-base'
      }`}>
        {formatCurrency(safePrice, currency)}
      </span>
      {hasDiscount && showStrikethrough && (
        <span className={`line-through text-gray-500 ${
          size === 'small' ? 'text-xs' :
          size === 'large' ? 'text-lg' : 'text-sm'
        }`}>
          {formatCurrency(safeOriginalPrice, currency)}
        </span>
      )}
    </div>
  );
};
