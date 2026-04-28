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

/**
 * Compute the total pack weight in kg from pack quantity, unit size, and
 * unit of measure. This is the single source of truth for the calculation
 * used by both the product editor (auto-fill) and the product detail display.
 *
 * Returns 0 when any required input is missing or invalid.
 *
 * Examples:
 *   computePackWeightKg(12, 265, 'g')  → 3.18  (12 × 265g)
 *   computePackWeightKg(6, 1.5, 'kg') → 9     (6 × 1.5kg)
 *   computePackWeightKg(24, 330, 'ml') → 7.92  (24 × 330ml)
 */
export function computePackWeightKg(
  packQuantity: number | string | null | undefined,
  unitSize: number | string | null | undefined,
  unitOfMeasure: string | null | undefined,
): number {
  const qty = parseFloat(String(packQuantity ?? '')) || 0;
  const size = parseFloat(String(unitSize ?? '')) || 0;

  if (qty <= 0 || size <= 0 || !unitOfMeasure) return 0;

  let weightInKg = 0;
  switch (unitOfMeasure.toLowerCase()) {
    case 'g':
    case 'grams':
      weightInKg = (qty * size) / 1000;
      break;
    case 'kg':
    case 'kilograms':
      weightInKg = qty * size;
      break;
    case 'ml':
    case 'millilitres':
      weightInKg = (qty * size) / 1000;
      break;
    case 'l':
    case 'litres':
      weightInKg = qty * size;
      break;
    case 'cl':
    case 'centilitres':
      weightInKg = (qty * size) / 100;
      break;
    case 'pieces':
    case 'units':
    case 'cans':
    case 'bottles':
      weightInKg = qty * 0.1;
      break;
    default:
      weightInKg = qty * 0.1;
  }

  return Math.round(weightInKg * 1000) / 1000;
}
