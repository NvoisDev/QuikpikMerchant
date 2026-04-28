/**
 * marketplace-price-lists.ts
 *
 * Shared price-list helpers used by marketplace browsing and order routes.
 * Extracted from marketplace.ts — behaviour is unchanged.
 */
import {
  and, db, eq, inArray, or, priceLists, priceListAssignments, priceListItems,
  customerGroupMembers, sql,
} from "./shared";

/** Compute effective price from a price list item row (lowest price wins). */
export function computeEffectivePrice(
  base: number,
  item: { customPrice: string | null; discountPercentage: string | null },
): number {
  if (item.customPrice) return parseFloat(item.customPrice);
  if (item.discountPercentage) {
    const pct = parseFloat(item.discountPercentage);
    return Math.round(base * (1 - pct / 100) * 100) / 100;
  }
  return base;
}

/**
 * Resolve active price list IDs for a customer/wholesaler pair.
 * Uses Drizzle ORM queries — no raw SQL string interpolation.
 */
export async function resolveActivePriceListIds(
  wholesalerId: string,
  customerId: string,
): Promise<number[]> {
  const today = new Date().toISOString().slice(0, 10);

  const memberRows = await db
    .select({ groupId: customerGroupMembers.groupId })
    .from(customerGroupMembers)
    .where(eq(customerGroupMembers.customerId, customerId));
  const groupIds = memberRows.map((r) => r.groupId);

  const directRows = await db
    .select({ id: priceLists.id })
    .from(priceLists)
    .innerJoin(priceListAssignments, eq(priceListAssignments.priceListId, priceLists.id))
    .where(
      and(
        eq(priceLists.wholesalerId, wholesalerId),
        eq(priceLists.isActive, true),
        or(
          sql`${priceLists.startDate} IS NULL`,
          sql`${priceLists.startDate} <= ${today}`,
        ),
        or(
          sql`${priceLists.endDate} IS NULL`,
          sql`${priceLists.endDate} >= ${today}`,
        ),
        eq(priceListAssignments.customerId, customerId),
      ),
    );

  let groupRows: Array<{ id: number }> = [];
  if (groupIds.length > 0) {
    groupRows = await db
      .select({ id: priceLists.id })
      .from(priceLists)
      .innerJoin(priceListAssignments, eq(priceListAssignments.priceListId, priceLists.id))
      .where(
        and(
          eq(priceLists.wholesalerId, wholesalerId),
          eq(priceLists.isActive, true),
          or(
            sql`${priceLists.startDate} IS NULL`,
            sql`${priceLists.startDate} <= ${today}`,
          ),
          or(
            sql`${priceLists.endDate} IS NULL`,
            sql`${priceLists.endDate} >= ${today}`,
          ),
          inArray(priceListAssignments.customerGroupId, groupIds),
        ),
      );
  }

  const allIds = [...new Set([...directRows, ...groupRows].map((r) => r.id))];
  return allIds;
}

/**
 * Resolve a customer's best (lowest) custom price for a single product.
 * Returns null when no active price list override applies.
 * Consistent "lowest price wins" strategy — identical to the list endpoint.
 */
export async function resolveCustomerProductPrice(opts: {
  wholesalerId: string;
  customerId: string;
  productId: number;
  standardPrice: string;
}): Promise<{ customPrice: string; standardPrice: string; hasPriceList: true } | null> {
  try {
    const listIds = await resolveActivePriceListIds(opts.wholesalerId, opts.customerId);
    if (listIds.length === 0) return null;

    const itemRows = await db
      .select({ customPrice: priceListItems.customPrice, discountPercentage: priceListItems.discountPercentage })
      .from(priceListItems)
      .where(
        and(
          inArray(priceListItems.priceListId, listIds),
          eq(priceListItems.productId, opts.productId),
        ),
      );
    if (itemRows.length === 0) return null;

    const base = parseFloat(opts.standardPrice || '0');
    const bestPrice = itemRows.reduce<number>((best, row) => {
      const effective = computeEffectivePrice(base, row);
      return effective < best ? effective : best;
    }, Infinity);

    if (bestPrice === Infinity || bestPrice === base) return null;

    return {
      customPrice: bestPrice.toFixed(2),
      standardPrice: base.toFixed(2),
      hasPriceList: true,
    };
  } catch (err) {
    console.error('⚠️ resolveCustomerProductPrice failed (non-fatal):', err);
    return null;
  }
}
