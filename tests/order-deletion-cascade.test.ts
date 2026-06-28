/**
 * Order deletion with campaign_orders cascade regression tests
 *
 * The campaign_orders.order_id FK was upgraded to ON DELETE CASCADE via a
 * startup migration.  These tests guard against two failure modes:
 *
 *   1. Schema drift — onDelete:'cascade' removed from campaignOrders in schema.ts
 *   2. Runtime breakage — deleting an orders row (as the draft/bulk-delete routes
 *      both do) no longer cascades to campaign_orders, leaving orphaned rows
 *
 * Three layers of coverage:
 *   a) Static schema analysis — campaignOrders FK carries onDelete:'cascade'
 *   b) Static source analysis — the two deletion routes handle campaign_orders
 *      correctly (cascade for draft-delete; explicit cleanup for bulk-delete)
 *   c) Real DB integration — inserts a draft order + campaign_orders link, deletes
 *      the order row, and asserts both rows are absent (proves the cascade fires)
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../server/db';
import { users, orders, orderItems, campaignOrders } from '@shared/schema';

// ─── Shared test state ────────────────────────────────────────────────────────

let wholesalerId: string;
let customerId: string;
const createdOrderIds: number[] = [];

const lifecycleSource = readFileSync('server/routes/orders-lifecycle.ts', 'utf-8');
const schemaSource = readFileSync('shared/schema.ts', 'utf-8');

/**
 * Fully remove all test rows created by this file, in FK-safe order.
 * Called in beforeAll (to clear leftovers from a prior crashed run) and afterAll.
 */
async function cleanup() {
  if (createdOrderIds.length === 0) return;
  await db.delete(campaignOrders).where(inArray(campaignOrders.orderId, createdOrderIds));
  await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
  await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  createdOrderIds.length = 0;
}

beforeAll(async () => {
  // Borrow the first two real users from the DB — orders.wholesalerId and
  // orders.retailerId are both NOT NULL FKs to users, so we need real rows.
  const result = await db.select({ id: users.id }).from(users).limit(2);
  if (result.length < 2) {
    throw new Error('Need at least 2 rows in users table to run cascade tests');
  }
  wholesalerId = result[0].id;
  customerId = result[1].id;

  // Remove any left-over rows from a previously failed run.
  // We identify them via orderNumber prefix.
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(sql`${orders.orderNumber} LIKE 'zz_cascade_test_%'`);
  if (stale.length > 0) {
    const staleIds = stale.map((r) => r.id);
    await db.delete(campaignOrders).where(inArray(campaignOrders.orderId, staleIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, staleIds));
    await db.delete(orders).where(inArray(orders.id, staleIds));
  }
});

afterAll(cleanup);

// ─── Helper ───────────────────────────────────────────────────────────────────

async function insertDraftOrder(): Promise<number> {
  const [row] = await db
    .insert(orders)
    .values({
      orderNumber: `zz_cascade_test_${Date.now()}_${Math.floor(Math.random() * 100_000)}`,
      wholesalerId,
      retailerId: customerId,
      customerName: 'zz_cascade Test Customer',
      status: 'draft',
      paymentStatus: 'unpaid',
      paymentMethod: 'cash',
      fulfillmentType: 'pickup',
      subtotal: '0.00',
      platformFee: '0.00',
      total: '0.00',
      amountOutstanding: '0.00',
      deliveryCost: '0.00',
    })
    .returning({ id: orders.id });
  createdOrderIds.push(row.id);
  return row.id;
}

// ─── 1. Schema static analysis ────────────────────────────────────────────────

describe('campaignOrders schema — FK cascade declaration', () => {
  it('campaignOrders table definition exists in schema.ts', () => {
    expect(schemaSource).toContain('campaignOrders');
  });

  it('orderId FK references orders.id with onDelete cascade', () => {
    // Extract the campaignOrders pgTable block and confirm both the FK target
    // and the cascade option are present.
    const campaignOrdersBlock = schemaSource.match(
      /export const campaignOrders\s*=\s*pgTable\([\s\S]*?\}\s*\)\s*;/,
    )?.[0];
    expect(campaignOrdersBlock).toBeTruthy();
    expect(campaignOrdersBlock).toContain('references(() => orders.id');
    expect(campaignOrdersBlock).toContain('onDelete');
    expect(campaignOrdersBlock).toContain('cascade');
  });
});

// ─── 2. Source static analysis ────────────────────────────────────────────────

describe('orders-lifecycle source — deletion paths', () => {
  it('draft-delete does NOT explicitly delete campaignOrders (relies on DB cascade)', () => {
    const draftBlock = lifecycleSource.match(
      /DELETE \/api\/orders\/:id\/draft[\s\S]*?res\.json\(\{ success: true \}\)/,
    )?.[0];
    expect(draftBlock).toBeTruthy();
    expect(draftBlock).toContain('db.delete(orderItems)');
    expect(draftBlock).toContain('db.delete(orders)');
    expect(draftBlock).not.toContain('db.delete(campaignOrders)');
  });

  it('bulk-delete explicitly removes campaignOrders before the delete transaction', () => {
    const bulkAnchorIdx = lifecycleSource.indexOf('// DELETE /api/orders/bulk-delete');
    expect(bulkAnchorIdx).toBeGreaterThan(-1);

    const campaignDeleteIdx = lifecycleSource.indexOf('db.delete(campaignOrders)', bulkAnchorIdx);
    const transactionIdx = lifecycleSource.indexOf('db.transaction(async (trx)', bulkAnchorIdx);
    expect(campaignDeleteIdx).toBeGreaterThan(-1);
    expect(transactionIdx).toBeGreaterThan(-1);
    expect(campaignDeleteIdx).toBeLessThan(transactionIdx);
  });

  it('bulk-delete campaignOrders deletion is wrapped in its own try/catch (tolerates missing rows)', () => {
    expect(lifecycleSource).toContain('campaignOrders rows may not exist');
  });
});

// ─── 3. Real DB integration — cascade verification ────────────────────────────
//
// These tests insert actual rows into the database and verify the FK cascade
// fires when the orders row is deleted.  This is the same deletion call the
// draft-delete route makes: db.delete(orders).where(eq(orders.id, id)).
// ─────────────────────────────────────────────────────────────────────────────

describe('campaign_orders FK cascade — real database', () => {
  it('deleting an orders row also removes its linked campaign_orders row (cascade fires)', async () => {
    // 1. Create a draft order.
    const orderId = await insertDraftOrder();

    // 2. Link it to a campaign_orders row (campaignId is nullable, so no
    //    templateCampaigns row is required).
    await db.insert(campaignOrders).values({ orderId, campaignId: null, templateId: null });

    // 3. Confirm the campaign_orders row exists before deletion.
    const before = await db
      .select({ id: campaignOrders.id })
      .from(campaignOrders)
      .where(eq(campaignOrders.orderId, orderId));
    expect(before).toHaveLength(1);

    // 4. Delete the order — the same statement the draft-delete route executes.
    //    The DB cascade should remove the campaign_orders row automatically.
    await db.delete(orders).where(eq(orders.id, orderId));
    // Remove from tracking so afterAll cleanup doesn't attempt a second delete.
    const idx = createdOrderIds.indexOf(orderId);
    if (idx !== -1) createdOrderIds.splice(idx, 1);

    // 5. Assert the orders row is gone.
    const orderAfter = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId));
    expect(orderAfter).toHaveLength(0);

    // 6. Assert the campaign_orders row is also gone (cascade fired).
    const campaignOrderAfter = await db
      .select({ id: campaignOrders.id })
      .from(campaignOrders)
      .where(eq(campaignOrders.orderId, orderId));
    expect(campaignOrderAfter).toHaveLength(0);
  });

  it('campaign_orders row is absent after deleting the order even when no orderItems exist', async () => {
    // Variant: draft order with no items — ensures no FK on orderItems causes the
    // test to behave differently from a bare cascade check.
    const orderId = await insertDraftOrder();

    await db.insert(campaignOrders).values({ orderId, campaignId: null, templateId: null });

    // Delete child rows then the order (mirrors the draft-delete route code path).
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));

    const idx = createdOrderIds.indexOf(orderId);
    if (idx !== -1) createdOrderIds.splice(idx, 1);

    const remaining = await db
      .select({ id: campaignOrders.id })
      .from(campaignOrders)
      .where(eq(campaignOrders.orderId, orderId));
    expect(remaining).toHaveLength(0);
  });

  it('multiple campaign_orders rows linked to one order are all removed on delete', async () => {
    const orderId = await insertDraftOrder();

    // Insert two campaign_orders rows for the same order.
    await db.insert(campaignOrders).values([
      { orderId, campaignId: null, templateId: null },
      { orderId, campaignId: null, templateId: null },
    ]);

    const before = await db
      .select({ id: campaignOrders.id })
      .from(campaignOrders)
      .where(eq(campaignOrders.orderId, orderId));
    expect(before).toHaveLength(2);

    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));

    const idx = createdOrderIds.indexOf(orderId);
    if (idx !== -1) createdOrderIds.splice(idx, 1);

    const after = await db
      .select({ id: campaignOrders.id })
      .from(campaignOrders)
      .where(eq(campaignOrders.orderId, orderId));
    expect(after).toHaveLength(0);
  });
});
