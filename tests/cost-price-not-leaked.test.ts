/**
 * Regression guard — costPrice must never appear in customer-facing product responses.
 *
 * ProductCard renders a "Margin X%" badge whenever `product.costPrice` is non-null.
 * That badge is wholesaler-only information and must never reach customer or public
 * store payloads.
 *
 * Two layers of coverage:
 *   1. Integration test: calls GET /api/customer-products/:wholesalerId via supertest
 *      with a mocked DB row that deliberately includes `cost_price`, then asserts the
 *      JSON response does not include `costPrice`.
 *   2. Source-pinning: reads the route source and asserts the SQL SELECT and the
 *      explicit formattedProducts map never reference cost_price/costPrice, catching
 *      any future accidental addition at the source level.
 *
 * The public-store endpoint is covered by the integration test in
 * public-store-stock.test.ts together with the explicit `costPrice: undefined` strip
 * added to its sanitizedProducts map.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// ── Hoisted mock state ────────────────────────────────────────────────────────
const { queuedExecResults, mockDb } = vi.hoisted(() => {
  const queuedExecResults: Array<{ rows: unknown[] }> = [];

  function nextExecResult(): { rows: unknown[] } {
    return queuedExecResults.shift() ?? { rows: [] };
  }

  const mockDb = {
    execute: vi.fn(async () => nextExecResult()),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    }),
  };

  return { queuedExecResults, mockDb };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock the shared route module entirely to avoid Stripe / Twilio / OpenAI
// transitive imports triggering at module-load time.
vi.mock('../server/routes/shared', async () => {
  const drizzle = await import('drizzle-orm');
  return {
    db: mockDb,
    getUserPlanLimits: vi.fn().mockResolvedValue({ limits: { products: -1 } }),
    sql: drizzle.sql,
    inArray: drizzle.inArray,
    storage: {},
    priceListItems: { priceListId: 'priceListId' },
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  };
});

vi.mock('../server/utils/guest-products', () => ({
  stripGuestPricingDataFromProducts: vi.fn(),
}));

vi.mock('../server/utils/fee-config', () => ({
  getFeeConfigForWholesaler: vi.fn(),
}));

vi.mock('../server/routes/marketplace-price-lists', () => ({
  computeEffectivePrice: vi.fn(),
  resolveActivePriceListIds: vi.fn().mockResolvedValue([]),
  resolveCustomerProductPrice: vi.fn(),
}));

// ── Deferred imports (after mocks) ────────────────────────────────────────────
import request from 'supertest';
import express from 'express';
import { registerBrowsingRoutes } from '../server/routes/marketplace-browsing';

const app = express();
app.use(express.json());
registerBrowsingRoutes(app);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePublicStoreRow(): { rows: unknown[] } {
  return { rows: [{ store_visibility: 'public', is_inactive: false }] };
}

function makeProductRow(overrides: Record<string, unknown> = {}): { rows: unknown[] } {
  return {
    rows: [
      {
        id: 1,
        wholesaler_id: 'user_ws1',
        name: 'Widget',
        description: null,
        price: '9.99',
        currency: 'GBP',
        moq: 1,
        stock: 50,
        image_url: null,
        images: null,
        category: 'Hardware',
        price_visible: true,
        pack_quantity: 12,
        unit_of_measure: null,
        unit_size: null,
        selling_format: 'units',
        delivery_excluded: false,
        units_per_pallet: null,
        pallet_price: null,
        pallet_moq: null,
        pallet_stock: null,
        pallet_weight: null,
        rrp: null,
        promo_price: null,
        promo_active: false,
        promotional_offers: null,
        business_name: 'Acme Wholesale',
        rrp_visible: false,
        nearest_expiry: null,
        created_at: new Date().toISOString(),
        // Deliberately include the internal cost field to simulate a row that
        // somehow has it — the endpoint must not forward it.
        cost_price: '5.00',
        ...overrides,
      },
    ],
  };
}

beforeEach(() => {
  queuedExecResults.length = 0;
  vi.clearAllMocks();
  // Re-apply the default getUserPlanLimits mock after clearAllMocks
  const shared = vi.mocked(
    (globalThis as unknown as Record<string, unknown>).__mocked_shared ?? {}
  );
  void shared;
});

// ── Integration tests ─────────────────────────────────────────────────────────

describe('GET /api/customer-products/:wholesalerId — costPrice never in response', () => {
  it('does not include costPrice in the product payload even if the DB row has cost_price', async () => {
    queuedExecResults.push(
      makePublicStoreRow(),
      makeProductRow({ cost_price: '5.00' }),
    );

    const res = await request(app).get('/api/customer-products/user_ws1');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const product = res.body[0];
    expect(product).not.toHaveProperty('costPrice');
    expect(product).not.toHaveProperty('cost_price');
  });
});

// ── Source-pinning guard ──────────────────────────────────────────────────────

const src = readFileSync('server/routes/marketplace-browsing.ts', 'utf8');

describe('/api/customer-products/:wholesalerId — source-level costPrice guard', () => {
  it('raw SQL SELECT does not include cost_price', () => {
    const sqlStart = src.indexOf('SELECT p.id, p.name');
    const sqlEnd = src.indexOf('FROM products p', sqlStart);
    expect(sqlStart).toBeGreaterThan(-1);
    expect(sqlEnd).toBeGreaterThan(sqlStart);

    const sqlColumns = src.slice(sqlStart, sqlEnd);
    expect(sqlColumns).not.toContain('cost_price');
    expect(sqlColumns).not.toContain('costPrice');
  });

  it('formattedProducts explicit object map does not include costPrice', () => {
    const mapStart = src.indexOf('return ({');
    const mapEnd = src.indexOf('}) as {', mapStart);
    expect(mapStart).toBeGreaterThan(-1);
    expect(mapEnd).toBeGreaterThan(mapStart);

    const returnBlock = src.slice(mapStart, mapEnd);
    expect(returnBlock).not.toContain('costPrice');
    expect(returnBlock).not.toContain('cost_price');
  });
});
