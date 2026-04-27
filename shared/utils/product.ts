/**
 * Product field utilities — single source of truth for fields that have
 * legacy dual-naming or require derived calculations.
 */

/**
 * Resolve the pack quantity for a product, handling the dual-field legacy
 * where `packQuantity` (newer) and `quantityInPack` (older) represent the
 * same concept. Returns null when neither field is set.
 *
 * Callers typically use this as:
 *   const pq = getPackQuantity(product);
 *   if (pq && pq > 1 && unitSize && unitOfMeasure) { ... }
 */
export function getPackQuantity(product: {
  packQuantity?: number | string | null;
  quantityInPack?: number | string | null;
}): number | null {
  const raw = product.packQuantity ?? product.quantityInPack;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseFloat(raw) : raw;
  return isNaN(n) ? null : n;
}
