/**
 * Regression test — public storefront stock output.
 *
 * Guards GET /api/public/wholesaler/:slug against the bug where the public
 * store falsely showed products as out of stock because the API returned a
 * stale stock field. These tests hit the real route handler via supertest
 * with a mocked DB and assert that:
 *   - the product payload includes the live `stock` and `palletStock` fields
 *   - both are nulled when the wholesaler hides stock (stockVisible=false)
 *   - both are present (and not corrupted) when stock is shown
 *   - the availability edge case where unit stock is 0 but pallet stock is
 *     positive is preserved (0 and >0 both round-trip, so the item is still
 *     orderable by the pallet)
 *
 * If a future change drops, renames, or overwrites these fields in the public
 * payload, one of these assertions fails before it can reach production.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mock state (available inside vi.mock factories) ──────────────────
const { queuedResults, mockDb } = vi.hoisted(() => {
  const queuedResults: unknown[][] = [];

  function nextResult(): unknown[] {
    return queuedResults.shift() ?? [];
  }

  /**
   * A thenable that also exposes `.orderBy()` so the mock satisfies both the
   * direct-await wholesaler query and the `.orderBy(...)`-chained product query.
   */
  function makeWhereResult(data: unknown[]): Promise<unknown[]> & { orderBy(c?: unknown): Promise<unknown[]> } {
    const p = Promise.resolve(data) as Promise<unknown[]> & { orderBy(c?: unknown): Promise<unknown[]> };
    p.orderBy = (_c?: unknown) => Promise.resolve(data);
    return p;
  }

  const mockDb = {
    select: (_cols?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond?: unknown) => makeWhereResult(nextResult()),
      }),
    }),
  };

  return { queuedResults, mockDb };
});

// ── Module mocks (hoisted automatically by Vitest) ──────────────────────────
vi.mock('../server/db', () => ({ db: mockDb }));

// SendGrid throws at import time unless SENDGRID_API_KEY is set; stub it out.
vi.mock('../server/sendgrid-service', () => ({ sendEmail: vi.fn() }));

// Bypass auth — the public route is unauthenticated, but the module imports it.
vi.mock('../server/googleAuth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../server/shortPaymentLink', () => ({
  resolveShortPaymentLink: vi.fn(),
}));

// ── Deferred imports (after mocks are registered) ───────────────────────────
import request from 'supertest';
import express from 'express';
import { registerPublicStoreRoutes } from '../server/routes/public-store';

const app = express();
app.use(express.json());
registerPublicStoreRoutes(app);

// ── Fixtures ────────────────────────────────────────────────────────────────
function makeWholesaler(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ws-1',
    businessName: 'Acme Wholesale',
    logoUrl: null,
    logoType: null,
    storeTagline: null,
    storeDescription: null,
    storeSlug: 'acme',
    storeVisibility: 'public',
    priceDisplayMode: 'shown',
    moqVisible: true,
    stockVisible: true,
    packSizeVisible: true,
    deliveryRegions: null,
    city: null,
    country: null,
    enableDelivery: true,
    enablePickup: true,
    deliveryNote: null,
    preferredCurrency: 'GBP',
    isInactive: false,
    ...overrides,
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Widget',
    description: 'A widget',
    price: '9.99',
    palletPrice: '199.00',
    category: 'Hardware',
    imageUrl: null,
    images: null,
    unitsPerPack: 12,
    unitsPerPallet: 240,
    stock: 42,
    palletStock: 5,
    minOrderQuantity: 1,
    unitWeightKg: '1.0',
    totalPackageWeight: '12.0',
    packQuantity: 1,
    ...overrides,
  };
}

beforeEach(() => {
  queuedResults.length = 0;
});

describe('GET /api/public/wholesaler/:slug — stock output', () => {
  it('includes live stock and palletStock when the wholesaler shows stock', async () => {
    queuedResults.push(
      [makeWholesaler({ stockVisible: true })],
      [makeProduct({ stock: 42, palletStock: 5 })],
    );

    const res = await request(app).get('/api/public/wholesaler/acme');

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    const product = res.body.products[0];
    expect(product).toHaveProperty('stock', 42);
    expect(product).toHaveProperty('palletStock', 5);
  });

  it('nulls both stock and palletStock when the wholesaler hides stock', async () => {
    queuedResults.push(
      [makeWholesaler({ stockVisible: false })],
      [makeProduct({ stock: 42, palletStock: 5 })],
    );

    const res = await request(app).get('/api/public/wholesaler/acme');

    expect(res.status).toBe(200);
    const product = res.body.products[0];
    expect(product.stock).toBeNull();
    expect(product.palletStock).toBeNull();
  });

  it('treats stockVisible null as hidden (defaults closed)', async () => {
    queuedResults.push(
      [makeWholesaler({ stockVisible: null })],
      [makeProduct({ stock: 42, palletStock: 5 })],
    );

    const res = await request(app).get('/api/public/wholesaler/acme');

    expect(res.status).toBe(200);
    const product = res.body.products[0];
    expect(product.stock).toBeNull();
    expect(product.palletStock).toBeNull();
  });

  it('treats stockVisible undefined as hidden (defaults closed)', async () => {
    queuedResults.push(
      [makeWholesaler({ stockVisible: undefined })],
      [makeProduct({ stock: 42, palletStock: 5 })],
    );

    const res = await request(app).get('/api/public/wholesaler/acme');

    expect(res.status).toBe(200);
    const product = res.body.products[0];
    expect(product.stock).toBeNull();
    expect(product.palletStock).toBeNull();
  });

  it('preserves the edge case where unit stock is 0 but pallet stock is positive (still available)', async () => {
    queuedResults.push(
      [makeWholesaler({ stockVisible: true })],
      [makeProduct({ stock: 0, palletStock: 3 })],
    );

    const res = await request(app).get('/api/public/wholesaler/acme');

    expect(res.status).toBe(200);
    const product = res.body.products[0];
    // 0 must round-trip as the number 0 — not be coerced to null/undefined,
    // which is exactly the stale-stock bug this test guards against.
    expect(product.stock).toBe(0);
    expect(product.palletStock).toBe(3);
    // The item is still orderable because pallet stock remains positive.
    expect(product.palletStock).toBeGreaterThan(0);
  });

  it('returns 404 when no matching public store is found', async () => {
    queuedResults.push([]); // no wholesaler row

    const res = await request(app).get('/api/public/wholesaler/missing');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/public/wholesaler/:slug — costPrice not leaked', () => {
  it('strips costPrice from the product payload even if the DB row exposes it', async () => {
    queuedResults.push(
      [makeWholesaler({ stockVisible: true, priceDisplayMode: 'shown' })],
      [makeProduct({ costPrice: '5.00' })],
    );

    const res = await request(app).get('/api/public/wholesaler/acme');

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    const product = res.body.products[0];
    expect(product).not.toHaveProperty('costPrice');
    expect(product).not.toHaveProperty('cost_price');
  });
});
