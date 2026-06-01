/**
 * Shared unit-conversion helpers for quote line items.
 *
 * These formulas mirror the same conversion factors used by InventoryCalculator,
 * but are designed for frontend display/validation use (preview hints, submit
 * validation) rather than DB-level stock decrements.
 *
 * Conversion chain (matches InventoryCalculator spec):
 *   base units ← packs × quantityInPack
 *   base units ← pallets × unitsPerPallet × quantityInPack
 */

export type DisplayUnit = 'units' | 'packs' | 'pallets';

/**
 * Convert a display quantity in the chosen unit mode to base units.
 *
 * @param displayQty   - quantity as entered by the user (packs, pallets, or units)
 * @param mode         - which display unit is active
 * @param quantityInPack - base units per pack (default 1)
 * @param unitsPerPallet - packs per pallet (default 1)
 * @returns equivalent number of base units
 */
export function computeBaseUnits(
  displayQty: number,
  mode: DisplayUnit,
  quantityInPack = 1,
  unitsPerPallet = 1,
): number {
  if (mode === 'pallets') return displayQty * unitsPerPallet * quantityInPack;
  if (mode === 'packs') return displayQty * quantityInPack;
  return displayQty;
}
