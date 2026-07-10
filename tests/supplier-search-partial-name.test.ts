/**
 * Regression tests — /api/public/search supplier-directory results.
 *
 * Guards the secondary DB query that surfaces wholesalers in `supplierMatches`
 * even when every one of their products is hidden from the public storefront
 * (`hiddenFromPublic=true`).  Without that query a search by business name
 * returns zero results, which is the bug this covers.
 *
 * Two key behaviours are asserted:
 *  1. A partial or full business-name query returns the supplier in
 *     `supplierMatches` even when their product list is empty (all hidden).
 *  2. A supplier who already appears in `results` (via a visible product) is
 *     NOT also included in `supplierMatches` — no duplication.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mock state ───────────────────────────────────────────────────────
const { queuedResults, mockDb } = vi.hoisted(() => {
  const queuedResults: unknown[][] = [];

  function nextResult(): unknown[] {
    return queuedResults.shift() ?? [];
  }

  /**
   * Builds a chainable thenable that satisfies every method combination used
   * by the search route:
   *   - .where(…)
   *   - .where(…).orderBy(…)
   *   - .where(…).orderBy(…).limit(…)
   *   - .where(…).orderBy(…).limit(…).offset(…)
   */
  function chainable(data: unknown[]): any {
    const obj: any = {
      then(resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) {
        return Promise.resolve(data).then(resolve, reject);
      },
      orderBy: (_: unknown) => chainable(data),
      limit:   (_: unknown) => chainable(data),
      offset:  (_: unknown) => chainable(data),
    };
    return obj;
  }

  const mockDb = {
    select: (_cols?: unknown) => ({
      from: (_table: unknown) => ({
        innerJoin: (_joinTable: unknown, _on?: unknown) => ({
          where: (_cond?: unknown) => chainable(nextResult()),
        }),
        where: (_cond?: unknown) => chainable(nextResult()),
      }),
    }),
    selectDistinct: (_cols?: unknown) => ({
      from: (_table: unknown) => ({
        innerJoin: (_joinTable: unknown, _on?: unknown) => ({
          where: (_cond?: unknown) => chainable(nextResult()),
        }),
        where: (_cond?: unknown) => chainable(nextResult()),
      }),
    }),
  };

  return { queuedResults, mockDb };
});

// ── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('../server/db', () => ({ db: mockDb }));
vi.mock('../server/sendgrid-service', () => ({ sendEmail: vi.fn() }));
vi.mock('../server/googleAuth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../server/shortPaymentLink', () => ({
  resolveShortPaymentLink: vi.fn(),
}));

// ── Deferred imports ─────────────────────────────────────────────────────────
import request from 'supertest';
import express from 'express';
import { registerPublicStoreRoutes } from '../server/routes/public-store';

const app = express();
app.use(express.json());
registerPublicStoreRoutes(app);

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeSupplierRow(overrides: Record<string, unknown> = {}) {
  return {
    wholesalerId: 'ws-hidden-all',
    businessName: 'Fresh Goods Ltd',
    storeSlug: 'fresh-goods',
    logoUrl: null,
    city: 'Manchester',
    ...overrides,
  };
}

function makeProductRow(overrides: Record<string, unknown> = {}) {
  return {
    productId: 1,
    productName: 'Visible Widget',
    category: 'Hardware',
    imageUrl: null,
    images: null,
    price: '9.99',
    minOrderQuantity: 1,
    unitsPerPack: 6,
    wholesalerId: 'ws-with-products',
    businessName: 'Parts Direct',
    storeSlug: 'parts-direct',
    logoUrl: null,
    priceDisplayMode: 'shown',
    city: 'Leeds',
    ...overrides,
  };
}

beforeEach(() => {
  queuedResults.length = 0;
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/public/search — supplier-directory results', () => {
  it('returns a supplier in supplierMatches when a partial name is typed and all their products are hidden', async () => {
    // Query 1: product search — empty (all products hidden from public)
    queuedResults.push([]);
    // Query 2: category distinct — empty (no visible products)
    queuedResults.push([]);
    // Query 3: supplier directory lookup — the wholesaler with all-hidden products
    queuedResults.push([makeSupplierRow()]);

    const res = await request(app).get('/api/public/search?q=Fresh');

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
    expect(res.body.supplierMatches).toHaveLength(1);
    expect(res.body.supplierMatches[0]).toMatchObject({
      wholesalerId: 'ws-hidden-all',
      businessName: 'Fresh Goods Ltd',
      storeSlug: 'fresh-goods',
    });
  });

  it('returns the supplier in supplierMatches when the full business name is typed', async () => {
    // Query 1: product search — empty
    queuedResults.push([]);
    // Query 2: categories — empty
    queuedResults.push([]);
    // Query 3: supplier lookup — full-name match
    queuedResults.push([makeSupplierRow()]);

    const res = await request(app).get('/api/public/search?q=Fresh+Goods+Ltd');

    expect(res.status).toBe(200);
    expect(res.body.supplierMatches).toHaveLength(1);
    expect(res.body.supplierMatches[0].businessName).toBe('Fresh Goods Ltd');
  });

  it('does NOT duplicate a supplier that already appears via a visible product', async () => {
    const productRow = makeProductRow({ wholesalerId: 'ws-with-products', businessName: 'Parts Direct' });
    // Query 1: product search — supplier appears here via a visible product
    queuedResults.push([productRow]);
    // Query 2: categories
    queuedResults.push([{ category: 'Hardware' }]);
    // Query 3: supplier directory — same supplier returned from the users query
    queuedResults.push([
      { wholesalerId: 'ws-with-products', businessName: 'Parts Direct', storeSlug: 'parts-direct', logoUrl: null, city: 'Leeds' },
    ]);

    const res = await request(app).get('/api/public/search?q=Parts');

    expect(res.status).toBe(200);
    // The supplier is present in results (via their product)
    expect(res.body.results).toHaveLength(1);
    // But must NOT also appear in supplierMatches — that would be a duplicate
    expect(res.body.supplierMatches).toHaveLength(0);
  });

  it('returns an empty supplierMatches list when no query string is provided', async () => {
    // Query 1: all products (no q filter)
    queuedResults.push([makeProductRow()]);
    // Query 2: categories
    queuedResults.push([{ category: 'Hardware' }]);
    // No query 3 — the route skips the supplier lookup when q is empty

    const res = await request(app).get('/api/public/search');

    expect(res.status).toBe(200);
    expect(res.body.supplierMatches).toHaveLength(0);
  });
});
