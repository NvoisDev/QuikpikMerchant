/**
 * Pure pricing helpers for the read-only price-list view, extracted so they can
 * be unit-tested without rendering the page (mirrors the product-filters.ts
 * pattern).
 *
 * These mirror the server's `resolveCustomPrice`
 * (server/utils/price-resolution.ts), which is the source of truth: a non-empty
 * custom price wins (including 0), then a percentage discount (rounded to 2dp),
 * else the product's standard price. A parity test keeps the two in lockstep.
 */

export interface PricingItem {
  customPrice: string | null;
  discountPercentage: string | null;
  product: { price: string } | null;
}

/** Resolve the unit price a customer sees for a price-list item. */
export function resolveUnitPrice(item: PricingItem): number {
  const base = parseFloat(item.product?.price || "0");
  if (item.customPrice) return parseFloat(item.customPrice);
  if (item.discountPercentage) {
    return Math.round(base * (1 - parseFloat(item.discountPercentage) / 100) * 100) / 100;
  }
  return base;
}

export interface PriceListRow {
  /** The referenced product no longer exists / wasn't returned. */
  productMissing: boolean;
  /** The product's standard price (0 when the product is missing). */
  base: number;
  /** The resolved customer-facing unit price. */
  unitPrice: number;
  /** A fixed custom price is set (wins over any discount). */
  hasFixed: boolean;
  /** A percentage discount applies (only when there's no fixed price). */
  hasPct: boolean;
  /** Either a fixed price or a percentage discount applies. */
  isCustom: boolean;
}

/** Derive everything a product row needs to render its price cells. */
export function resolvePriceListRow(item: PricingItem): PriceListRow {
  const productMissing = !item.product;
  const base = parseFloat(item.product?.price || "0");
  const hasFixed = !!item.customPrice;
  const hasPct = !hasFixed && !!item.discountPercentage;
  return {
    productMissing,
    base,
    unitPrice: resolveUnitPrice(item),
    hasFixed,
    hasPct,
    isCustom: hasFixed || hasPct,
  };
}
