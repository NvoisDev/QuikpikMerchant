/**
 * Single source of truth for resolving the price a customer sees for a
 * price-list item: a non-empty custom price wins (including 0), then a
 * percentage discount (rounded to 2dp), else the product's standard price.
 *
 * The read-only price-list view in the client mirrors this logic; a parity
 * test (tests/price-list-pricing.test.ts) keeps the two in lockstep.
 */
export function resolveCustomPrice(
  basePrice: string,
  item: { customPrice: string | null; discountPercentage: string | null },
): number {
  const base = parseFloat(basePrice || "0");
  if (item.customPrice) return parseFloat(item.customPrice);
  if (item.discountPercentage) {
    const pct = parseFloat(item.discountPercentage);
    return Math.round(base * (1 - pct / 100) * 100) / 100;
  }
  return base;
}
