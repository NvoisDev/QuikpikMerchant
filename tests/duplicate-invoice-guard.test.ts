/**
 * Regression tests for `findRecentDuplicateOrder` (server/routes/shared.ts).
 *
 * This helper guards against a wholesaler accidentally raising the same
 * invoice twice — e.g. approving a draft, then also creating a fresh Quick
 * Quote for the same customer/amount moments later. It is a best-effort,
 * short recent-history check (not a hard uniqueness constraint), so these
 * tests exercise the exact matching conditions directly against the real
 * database: same wholesaler + retailer + subtotal, within the time window,
 * excluding draft/cancelled orders and any explicitly excluded order id.
 *
 * All test rows use the "zz_test_" id/name namespace and are cleaned up in
 * afterAll.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { orders, orderItems, users } from '@shared/schema';
import { findRecentDuplicateOrder } from '../server/routes/shared';

const WHOLESALER_ID = 'zz_test_dup_wholesaler';
const RETAILER_ID = 'zz_test_dup_retailer';
const OTHER_RETAILER_ID = 'zz_test_dup_other_retailer';

const createdOrderIds: number[] = [];

async function seedUsers() {
  await db.insert(users).values({ id: WHOLESALER_ID, role: 'wholesaler', email: 'zz_test_dup_ws@example.com' }).onConflictDoNothing();
  await db.insert(users).values({ id: RETAILER_ID, role: 'customer', email: 'zz_test_dup_cust@example.com' }).onConflictDoNothing();
  await db.insert(users).values({ id: OTHER_RETAILER_ID, role: 'customer', email: 'zz_test_dup_cust2@example.com' }).onConflictDoNothing();
}

async function cleanup() {
  const allOrderRows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.wholesalerId, WHOLESALER_ID));
  const allOrderIds = allOrderRows.map((r) => r.id);
  if (allOrderIds.length > 0) {
    await db.delete(orderItems).where(inArray(orderItems.orderId, allOrderIds));
    await db.delete(orders).where(inArray(orders.id, allOrderIds));
  }
  createdOrderIds.length = 0;
}

async function cleanupUsers() {
  await db.delete(users).where(inArray(users.id, [WHOLESALER_ID, RETAILER_ID, OTHER_RETAILER_ID]));
}

async function makeOrder(opts: {
  retailerId?: string;
  subtotal: string;
  status?: string;
  createdAt?: Date;
}): Promise<number> {
  const [order] = await db.insert(orders).values({
    orderNumber: `ZZTEST-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    wholesalerId: WHOLESALER_ID,
    retailerId: opts.retailerId ?? RETAILER_ID,
    customerName: 'zz_test Customer',
    status: opts.status ?? 'pending',
    paymentStatus: 'unpaid',
    fulfillmentType: 'pickup',
    subtotal: opts.subtotal,
    platformFee: '0.00',
    total: opts.subtotal,
    deliveryCost: '0.00',
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  }).returning({ id: orders.id });
  createdOrderIds.push(order.id);
  return order.id;
}

async function setCreatedAt(orderId: number, createdAt: Date) {
  await db.update(orders).set({ createdAt }).where(eq(orders.id, orderId));
}

describe('findRecentDuplicateOrder', () => {
  beforeAll(async () => {
    await seedUsers();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await cleanupUsers();
  });

  beforeEach(async () => {
    await cleanup();
  });

  it('finds a matching recent order for same wholesaler/retailer/subtotal', async () => {
    const orderId = await makeOrder({ subtotal: '123.45' });

    const result = await findRecentDuplicateOrder({
      wholesalerId: WHOLESALER_ID,
      retailerId: RETAILER_ID,
      subtotal: 123.45,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(orderId);
  });

  it('does not match a different subtotal', async () => {
    await makeOrder({ subtotal: '50.00' });

    const result = await findRecentDuplicateOrder({
      wholesalerId: WHOLESALER_ID,
      retailerId: RETAILER_ID,
      subtotal: 75.00,
    });

    expect(result).toBeNull();
  });

  it('does not match a different retailer', async () => {
    await makeOrder({ subtotal: '99.99', retailerId: OTHER_RETAILER_ID });

    const result = await findRecentDuplicateOrder({
      wholesalerId: WHOLESALER_ID,
      retailerId: RETAILER_ID,
      subtotal: 99.99,
    });

    expect(result).toBeNull();
  });

  it('excludes the order passed via excludeOrderId (self-match when editing/approving)', async () => {
    const orderId = await makeOrder({ subtotal: '200.00' });

    const result = await findRecentDuplicateOrder({
      wholesalerId: WHOLESALER_ID,
      retailerId: RETAILER_ID,
      subtotal: 200.00,
      excludeOrderId: orderId,
    });

    expect(result).toBeNull();
  });

  it('skips draft orders', async () => {
    await makeOrder({ subtotal: '80.00', status: 'draft' });

    const result = await findRecentDuplicateOrder({
      wholesalerId: WHOLESALER_ID,
      retailerId: RETAILER_ID,
      subtotal: 80.00,
    });

    expect(result).toBeNull();
  });

  it('skips cancelled orders', async () => {
    await makeOrder({ subtotal: '60.00', status: 'cancelled' });

    const result = await findRecentDuplicateOrder({
      wholesalerId: WHOLESALER_ID,
      retailerId: RETAILER_ID,
      subtotal: 60.00,
    });

    expect(result).toBeNull();
  });

  it('skips orders created outside the time window', async () => {
    const orderId = await makeOrder({ subtotal: '150.00' });
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await setCreatedAt(orderId, tenMinutesAgo);

    const result = await findRecentDuplicateOrder({
      wholesalerId: WHOLESALER_ID,
      retailerId: RETAILER_ID,
      subtotal: 150.00,
      windowMinutes: 5,
    });

    expect(result).toBeNull();
  });

  it('matches an order created just inside a custom window', async () => {
    const orderId = await makeOrder({ subtotal: '175.00' });
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    await setCreatedAt(orderId, twoMinutesAgo);

    const result = await findRecentDuplicateOrder({
      wholesalerId: WHOLESALER_ID,
      retailerId: RETAILER_ID,
      subtotal: 175.00,
      windowMinutes: 5,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(orderId);
  });
});
