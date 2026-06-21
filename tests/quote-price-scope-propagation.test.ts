/**
 * Task #1408 — Invoice price-change scope propagation regression tests.
 *
 * Task #1407 added a per-line choice when a wholesaler changes a price while
 * editing an invoice (PATCH /api/quotes/:id). Each changed line can be applied
 * to one of three scopes:
 *   - 'invoice'  → this order only (the line's unitPrice), no propagation
 *   - 'customer' → a personal price list assigned ONLY to the addressed customer
 *   - 'all'      → the product's base catalog price
 *
 * Pricing is money-sensitive, so these tests run against the REAL database via
 * the actual route handler (supertest), with only auth, the feature gate, and
 * the Stripe client mocked. This genuinely exercises the propagation SQL rather
 * than re-asserting hand-fed mock returns, catching regressions such as leaking
 * a per-customer price to everyone or overwriting the wrong column.
 *
 * Covered behaviour (server/routes/payments-quotes.ts, propagation block 7c-bis):
 *   - 'invoice' touches only the order item; product + price lists untouched
 *   - 'customer' writes a personal (isPersonal) list assigned to just that customer
 *   - 'all' updates the product base price (unit or pallet column, in isolation)
 *   - unit vs pallet stay separate (customPrice vs customPalletPrice)
 *   - no propagation when the typed price equals the catalog price ('all' no-op)
 *   - reverting a line to its original price with scope 'invoice' → no propagation
 *
 * All test rows use the "zz_test_" prefix / id namespace and are cleaned up.
 */

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Mutable auth state — the mocked requireAuth injects this user on every request.
const authState = vi.hoisted(() => ({
  user: { id: 'zz_test_wholesaler' } as { id: string; role?: string; wholesalerId?: string },
}));

// Bypass Google/Replit auth. shared.ts re-exports requireAuth from googleAuth and
// payments-quotes imports it from shared, so this mock reaches the route.
vi.mock('../server/googleAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = authState.user;
    next();
  },
  getGoogleAuthUrl: vi.fn(),
  verifyGoogleToken: vi.fn(),
  createOrUpdateUser: vi.fn(),
  GoogleAuthBlockedError: class extends Error {},
}));

// Bypass the subscription/plan feature gate so we don't have to provision a plan.
// All six functions shared.ts imports from this module are provided as pass-throughs.
vi.mock('../server/middleware/feature-gating', () => {
  const passFactory = () => (_req: any, _res: any, next: any) => next();
  return {
    requireBooleanFeature: passFactory,
    requireFeatureAccess: passFactory,
    requireProductLimits: passFactory,
    requireBroadcastLimits: passFactory,
    requireTeamMemberLimits: passFactory,
    getUserPlanLimits: vi.fn().mockResolvedValue({}),
  };
});

// Stub Stripe entirely — the offline ('cash') quotes in these tests never create
// or expire a session, but getStripeClient is called unconditionally in the route.
vi.mock('../server/stripeConfig', () => ({
  getStripeClient: vi.fn().mockReturnValue({
    accounts: { retrieve: vi.fn() },
    checkout: { sessions: { create: vi.fn(), expire: vi.fn() } },
  }),
  getPublishableKey: vi.fn().mockReturnValue('pk_test_fake'),
  isLiveMode: vi.fn().mockReturnValue(false),
  getWebhookSecrets: vi.fn().mockReturnValue([]),
  stripeLive: null,
  stripeTest: null,
  STRIPE_ENVIRONMENT: 'test',
}));

import request from 'supertest';
import express from 'express';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import {
  users, orders, orderItems, products,
  priceLists, priceListItems, priceListAssignments,
  stockMovements, quoteActivityLogs,
} from '@shared/schema';
import { registerQuoteRoutes } from '../server/routes/payments-quotes';

const WHOLESALER_ID = 'zz_test_wholesaler';
const CUSTOMER_ID = 'zz_test_customer';

const app = express();
app.use(express.json());
registerQuoteRoutes(app);

// Track created product/order ids so dependent rows can be removed in FK-safe order.
const createdProductIds: number[] = [];
const createdOrderIds: number[] = [];

async function cleanup() {
  if (createdOrderIds.length > 0) {
    await db.delete(quoteActivityLogs).where(inArray(quoteActivityLogs.quoteId, createdOrderIds));
    await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
  }
  if (createdProductIds.length > 0) {
    await db.delete(stockMovements).where(inArray(stockMovements.productId, createdProductIds));
  }
  // Personal price lists owned by the test wholesaler (assignments cascade on list delete).
  const lists = await db.select({ id: priceLists.id }).from(priceLists).where(eq(priceLists.wholesalerId, WHOLESALER_ID));
  const listIds = lists.map((l) => l.id);
  if (listIds.length > 0) {
    await db.delete(priceListItems).where(inArray(priceListItems.priceListId, listIds));
    await db.delete(priceListAssignments).where(inArray(priceListAssignments.priceListId, listIds));
    await db.delete(priceLists).where(inArray(priceLists.id, listIds));
  }
  if (createdOrderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    createdOrderIds.length = 0;
  }
  if (createdProductIds.length > 0) {
    await db.delete(products).where(inArray(products.id, createdProductIds));
    createdProductIds.length = 0;
  }
}

async function makeProduct(opts: { price: string; palletPrice?: string }): Promise<number> {
  const [row] = await db.insert(products).values({
    wholesalerId: WHOLESALER_ID,
    name: 'zz_test_product',
    price: opts.price,
    palletPrice: opts.palletPrice ?? null,
    // High, simple stock so edits never trip the stock-availability guard.
    stock: 100000,
    baseUnitStock: 100000,
    palletStock: 100000,
    quantityInPack: 1,
    unitsPerPallet: 1,
  }).returning({ id: products.id });
  createdProductIds.push(row.id);
  return row.id;
}

/**
 * Create a pending, offline ('cash') quote with a single line item.
 * Offline payment keeps the route on the no-Stripe, no-email path.
 */
async function makeQuote(opts: {
  productId: number;
  quantity: number;
  unitPrice: string;
  sellingType?: 'units' | 'pallets';
}): Promise<number> {
  const lineTotal = (parseFloat(opts.unitPrice) * opts.quantity).toFixed(2);
  const [order] = await db.insert(orders).values({
    orderNumber: `zz_test_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    wholesalerId: WHOLESALER_ID,
    retailerId: CUSTOMER_ID,
    customerName: 'zz_test Customer',
    status: 'pending',
    isQuote: true,
    paymentStatus: 'unpaid',
    paymentMethod: 'cash',
    fulfillmentType: 'pickup',
    subtotal: lineTotal,
    platformFee: '0.00',
    total: lineTotal,
    amountOutstanding: lineTotal,
    deliveryCost: '0.00',
  }).returning({ id: orders.id });
  createdOrderIds.push(order.id);

  await db.insert(orderItems).values({
    orderId: order.id,
    productId: opts.productId,
    quantity: opts.quantity,
    unitPrice: opts.unitPrice,
    total: lineTotal,
    sellingType: opts.sellingType ?? 'units',
  });
  return order.id;
}

function patchQuote(orderId: number, items: any[]) {
  return request(app).patch(`/api/quotes/${orderId}`).send({ items });
}

async function getPersonalLists() {
  return db.select().from(priceLists).where(and(eq(priceLists.wholesalerId, WHOLESALER_ID), eq(priceLists.isPersonal, true)));
}

/**
 * Pre-seed an existing personal price list for CUSTOMER_ID with a single override
 * row, mimicking a customer who already has a "this customer only" special price.
 */
async function seedPersonalList(opts: {
  productId: number;
  customPrice?: string | null;
  customPalletPrice?: string | null;
}): Promise<{ listId: number; itemId: number }> {
  const [list] = await db.insert(priceLists).values({
    wholesalerId: WHOLESALER_ID,
    customerId: CUSTOMER_ID,
    name: 'Personal prices — zz_test Customer',
    isActive: true,
    isPersonal: true,
  }).returning({ id: priceLists.id });
  await db.insert(priceListAssignments).values({ priceListId: list.id, customerId: CUSTOMER_ID });
  const [item] = await db.insert(priceListItems).values({
    priceListId: list.id,
    productId: opts.productId,
    customPrice: opts.customPrice ?? null,
    customPalletPrice: opts.customPalletPrice ?? null,
  }).returning({ id: priceListItems.id });
  return { listId: list.id, itemId: item.id };
}

beforeAll(async () => {
  authState.user = { id: WHOLESALER_ID };
  // Wholesaler + customer rows must exist (orders FK to users; storage.getUser is real).
  await db.insert(users).values({ id: WHOLESALER_ID, role: 'wholesaler', email: 'zz_test_ws@example.com' }).onConflictDoNothing();
  await db.insert(users).values({ id: CUSTOMER_ID, role: 'customer', email: 'zz_test_cust@example.com' }).onConflictDoNothing();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await db.delete(users).where(inArray(users.id, [WHOLESALER_ID, CUSTOMER_ID]));
});

beforeEach(async () => {
  await cleanup();
});

describe("PATCH /api/quotes/:id — scope 'invoice'", () => {
  it('updates only the order line; product price and price lists are untouched', async () => {
    const productId = await makeProduct({ price: '10.00' });
    const orderId = await makeQuote({ productId, quantity: 2, unitPrice: '10.00' });

    const res = await patchQuote(orderId, [
      { productId, quantity: 2, customPrice: 8.5, sellingType: 'units', priceScope: 'invoice' },
    ]);
    expect(res.status).toBe(200);

    // Order line carries the new price.
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    expect(line.unitPrice).toBe('8.50');

    // Product base price unchanged.
    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.price).toBe('10.00');

    // No personal price list was created.
    expect((await getPersonalLists()).length).toBe(0);
  });

  it("defaults to no propagation when priceScope is omitted", async () => {
    const productId = await makeProduct({ price: '10.00' });
    const orderId = await makeQuote({ productId, quantity: 1, unitPrice: '10.00' });

    const res = await patchQuote(orderId, [
      { productId, quantity: 1, customPrice: 7, sellingType: 'units' },
    ]);
    expect(res.status).toBe(200);

    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.price).toBe('10.00');
    expect((await getPersonalLists()).length).toBe(0);
  });
});

describe("PATCH /api/quotes/:id — scope 'customer'", () => {
  it('writes a personal price list assigned ONLY to the addressed customer (unit price)', async () => {
    const productId = await makeProduct({ price: '10.00' });
    const orderId = await makeQuote({ productId, quantity: 3, unitPrice: '10.00' });

    const res = await patchQuote(orderId, [
      { productId, quantity: 3, customPrice: 9, sellingType: 'units', priceScope: 'customer' },
    ]);
    expect(res.status).toBe(200);

    // Exactly one personal list exists, and it belongs to this wholesaler.
    const lists = await getPersonalLists();
    expect(lists.length).toBe(1);
    expect(lists[0].isPersonal).toBe(true);

    // Assigned to the customer only (one assignment, to CUSTOMER_ID, not a group).
    const assignments = await db.select().from(priceListAssignments).where(eq(priceListAssignments.priceListId, lists[0].id));
    expect(assignments.length).toBe(1);
    expect(assignments[0].customerId).toBe(CUSTOMER_ID);
    expect(assignments[0].customerGroupId).toBeNull();

    // Item stores the unit override in customPrice; pallet column stays null.
    const itemRows = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, lists[0].id));
    expect(itemRows.length).toBe(1);
    expect(itemRows[0].productId).toBe(productId);
    expect(itemRows[0].customPrice).toBe('9.00');
    expect(itemRows[0].customPalletPrice).toBeNull();

    // The shared catalog price is NOT touched — the per-customer price must not leak.
    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.price).toBe('10.00');
  });

  it('writes the pallet override into customPalletPrice, leaving customPrice null', async () => {
    const productId = await makeProduct({ price: '10.00', palletPrice: '100.00' });
    const orderId = await makeQuote({ productId, quantity: 2, unitPrice: '100.00', sellingType: 'pallets' });

    const res = await patchQuote(orderId, [
      { productId, quantity: 2, customPrice: 90, sellingType: 'pallets', priceScope: 'customer' },
    ]);
    expect(res.status).toBe(200);

    const lists = await getPersonalLists();
    expect(lists.length).toBe(1);
    const itemRows = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, lists[0].id));
    expect(itemRows.length).toBe(1);
    // Pallet vs unit columns stay separate.
    expect(itemRows[0].customPalletPrice).toBe('90.00');
    expect(itemRows[0].customPrice).toBeNull();

    // Catalog pallet + unit prices both unchanged.
    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.palletPrice).toBe('100.00');
    expect(prod.price).toBe('10.00');
  });
});

describe("PATCH /api/quotes/:id — scope 'customer' with an EXISTING personal override", () => {
  it('is a no-op when the customer is already pinned to the typed price (no extra write)', async () => {
    const productId = await makeProduct({ price: '10.00' });
    // Customer already has a "this customer only" price of £9.
    const { listId, itemId } = await seedPersonalList({ productId, customPrice: '9.00' });
    const orderId = await makeQuote({ productId, quantity: 3, unitPrice: '9.00' });

    // Wholesaler types the SAME £9 again with scope 'customer'.
    const res = await patchQuote(orderId, [
      { productId, quantity: 3, customPrice: 9, sellingType: 'units', priceScope: 'customer' },
    ]);
    expect(res.status).toBe(200);

    // No second personal list was created — the existing one is reused.
    const lists = await getPersonalLists();
    expect(lists.length).toBe(1);
    expect(lists[0].id).toBe(listId);

    // The single override row is untouched: same id, same value, no duplicate row.
    const itemRows = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, listId));
    expect(itemRows.length).toBe(1);
    expect(itemRows[0].id).toBe(itemId);
    expect(itemRows[0].customPrice).toBe('9.00');

    // Catalog price stays put.
    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.price).toBe('10.00');
  });

  it('OVERWRITES a stale override even when the typed price equals the catalog price', async () => {
    const productId = await makeProduct({ price: '10.00' });
    // Stale "this customer only" price of £7 (cheaper than the £10 catalog price).
    const { listId, itemId } = await seedPersonalList({ productId, customPrice: '7.00' });
    const orderId = await makeQuote({ productId, quantity: 2, unitPrice: '7.00' });

    // Wholesaler edits the line back UP to the catalog price (£10) with scope 'customer'.
    // This must NOT be skipped as an "equals catalog" no-op — it must overwrite the £7
    // override so the customer is re-pinned to £10 (not silently left on the stale £7).
    const res = await patchQuote(orderId, [
      { productId, quantity: 2, customPrice: 10, sellingType: 'units', priceScope: 'customer' },
    ]);
    expect(res.status).toBe(200);

    // Same list, same row id — updated in place, not duplicated.
    const lists = await getPersonalLists();
    expect(lists.length).toBe(1);
    expect(lists[0].id).toBe(listId);

    const itemRows = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, listId));
    expect(itemRows.length).toBe(1);
    expect(itemRows[0].id).toBe(itemId);
    // The stale £7 override is overwritten with the catalog £10.
    expect(itemRows[0].customPrice).toBe('10.00');

    // Catalog price itself is left alone — 'customer' scope never touches the product.
    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.price).toBe('10.00');
  });

  it('reuses the SAME personal list for a second product on the same invoice', async () => {
    const productA = await makeProduct({ price: '10.00' });
    const productB = await makeProduct({ price: '20.00' });
    // Quote starts with only product A on the line.
    const orderId = await makeQuote({ productId: productA, quantity: 1, unitPrice: '10.00' });

    // Edit applies a 'customer' price to BOTH products (B is newly added to the invoice).
    const res = await patchQuote(orderId, [
      { productId: productA, quantity: 1, customPrice: 9, sellingType: 'units', priceScope: 'customer' },
      { productId: productB, quantity: 1, customPrice: 18, sellingType: 'units', priceScope: 'customer' },
    ]);
    expect(res.status).toBe(200);

    // find-or-create is memoised once per request → exactly ONE personal list, with
    // ONE assignment, holding BOTH product overrides.
    const lists = await getPersonalLists();
    expect(lists.length).toBe(1);

    const assignments = await db.select().from(priceListAssignments).where(eq(priceListAssignments.priceListId, lists[0].id));
    expect(assignments.length).toBe(1);
    expect(assignments[0].customerId).toBe(CUSTOMER_ID);

    const itemRows = await db.select().from(priceListItems).where(eq(priceListItems.priceListId, lists[0].id));
    expect(itemRows.length).toBe(2);
    const byProduct = new Map(itemRows.map((r) => [r.productId, r.customPrice]));
    expect(byProduct.get(productA)).toBe('9.00');
    expect(byProduct.get(productB)).toBe('18.00');
  });
});

describe("PATCH /api/quotes/:id — scope 'all'", () => {
  it('updates the product base UNIT price and leaves the pallet price + price lists alone', async () => {
    const productId = await makeProduct({ price: '10.00', palletPrice: '100.00' });
    const orderId = await makeQuote({ productId, quantity: 2, unitPrice: '10.00' });

    const res = await patchQuote(orderId, [
      { productId, quantity: 2, customPrice: 12, sellingType: 'units', priceScope: 'all' },
    ]);
    expect(res.status).toBe(200);

    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.price).toBe('12.00');
    // Pallet column must stay separate.
    expect(prod.palletPrice).toBe('100.00');

    // 'all' must not create a personal price list.
    expect((await getPersonalLists()).length).toBe(0);
  });

  it('updates the product base PALLET price and leaves the unit price alone', async () => {
    const productId = await makeProduct({ price: '10.00', palletPrice: '100.00' });
    const orderId = await makeQuote({ productId, quantity: 1, unitPrice: '100.00', sellingType: 'pallets' });

    const res = await patchQuote(orderId, [
      { productId, quantity: 1, customPrice: 110, sellingType: 'pallets', priceScope: 'all' },
    ]);
    expect(res.status).toBe(200);

    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.palletPrice).toBe('110.00');
    expect(prod.price).toBe('10.00');
    expect((await getPersonalLists()).length).toBe(0);
  });

  it('is a no-op when the typed price equals the catalog price', async () => {
    const productId = await makeProduct({ price: '10.00' });
    const orderId = await makeQuote({ productId, quantity: 2, unitPrice: '10.00' });

    const res = await patchQuote(orderId, [
      // Same price as catalog, but still flagged 'all'.
      { productId, quantity: 2, customPrice: 10, sellingType: 'units', priceScope: 'all' },
    ]);
    expect(res.status).toBe(200);

    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.price).toBe('10.00');
    // No personal list, and no base-price-update activity was logged.
    expect((await getPersonalLists()).length).toBe(0);
  });
});

describe("PATCH /api/quotes/:id — revert to original price", () => {
  it("sends 'invoice' on revert → no propagation to catalog or price lists", async () => {
    const productId = await makeProduct({ price: '10.00' });
    const orderId = await makeQuote({ productId, quantity: 2, unitPrice: '10.00' });

    // Wholesaler reverts the line back to the catalog price; the client sends 'invoice'.
    const res = await patchQuote(orderId, [
      { productId, quantity: 2, customPrice: 10, sellingType: 'units', priceScope: 'invoice' },
    ]);
    expect(res.status).toBe(200);

    const [prod] = await db.select().from(products).where(eq(products.id, productId));
    expect(prod.price).toBe('10.00');
    expect((await getPersonalLists()).length).toBe(0);
  });
});
