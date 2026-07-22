/**
 * Pure helper for the catalogue-export rrpMargin calculation.
 *
 * Extracted so the fallback chain (packQuantity → quantityInPack → 1) and the
 * margin formula can be unit-tested independently of the full route handler.
 */

export interface RrpMarginInput {
  packQuantity?: number | string | null;
  quantityInPack?: number | string | null;
  unitPrice: number;
  rrp: number | null;
}

/**
 * Compute the RRP margin percentage for a single catalogue row.
 *
 * Returns null when:
 * - rrp is null / not provided
 * - the resolved pack quantity is not a finite positive number
 * - rrp × qty is not a finite positive number (guards against NaN / Infinity)
 *
 * Formula: ((rrp × qty − unitPrice) / (rrp × qty)) × 100
 */
export function computeRrpMargin(input: RrpMarginInput): number | null {
  const { unitPrice, rrp } = input;
  if (rrp == null) return null;

  const qty = Number(input.packQuantity ?? input.quantityInPack ?? 1);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const rrpPack = rrp * qty;
  if (!Number.isFinite(rrpPack) || rrpPack <= 0) return null;

  return ((rrpPack - unitPrice) / rrpPack) * 100;
}
