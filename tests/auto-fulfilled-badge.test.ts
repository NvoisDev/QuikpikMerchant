/**
 * Task #1862 — Auto-fulfilled badge regression tests
 *
 * Covers:
 *   1. Source-code analysis — confirms the batch query for `auto_fulfilled`
 *      activity logs exists in both the paginated endpoint and the storage layer.
 *   2. Unit tests — the `autoFulfilledIds.has()` flag logic in isolation.
 *   3. Supertest integration — GET /api/orders-paginated returns
 *      `isAutoFulfilled: true` for an order that has an `auto_fulfilled` log
 *      entry and `isAutoFulfilled: false` for one that does not.
 */

import { readFileSync } from 'node:fs';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── 1. Source-code analysis ──────────────────────────────────────────────────

const ordersReadSource = readFileSync('server/routes/orders-read.ts', 'utf-8');
const ordersStorageSource = readFileSync('server/storage/orders.ts', 'utf-8');
const paymentRemindersSource = readFileSync('server/payment-reminders.ts', 'utf-8');

describe('Auto-fulfilled badge — source-code analysis (orders-read.ts)', () => {
  it('imports quoteActivityLogs from shared', () => {
    expect(ordersReadSource).toContain('quoteActivityLogs');
  });

  it('queries quoteActivityLogs for auto_fulfilled actionType', () => {
    expect(ordersReadSource).toContain("'auto_fulfilled'");
    expect(ordersReadSource).toContain('quoteActivityLogs.actionType');
  });

  it('builds a Set of auto-fulfilled order IDs', () => {
    expect(ordersReadSource).toContain('autoFulfilledIds');
    expect(ordersReadSource).toContain('new Set(');
  });

  it('attaches isAutoFulfilled to each order in the response', () => {
    expect(ordersReadSource).toContain('isAutoFulfilled: autoFulfilledIds.has(order.id)');
  });

  it('scopes the activity log query to the current page\'s order IDs', () => {
    // Must use inArray to avoid a full-table scan
    expect(ordersReadSource).toContain('inArray(quoteActivityLogs.quoteId, orderIds)');
  });
});

describe('Auto-fulfilled badge — source-code analysis (storage/orders.ts)', () => {
  it('also batches the auto_fulfilled query in getOrders()', () => {
    expect(ordersStorageSource).toContain('autoFulfilledIds');
    expect(ordersStorageSource).toContain("'auto_fulfilled'");
  });

  it('attaches isAutoFulfilled in the getOrders() result map', () => {
    expect(ordersStorageSource).toContain('isAutoFulfilled: autoFulfilledIds.has(order.id)');
  });
});

describe('Auto-fulfilled badge — source-code analysis (payment-reminders.ts)', () => {
  it('runAutoFulfilJob logs actionType auto_fulfilled after fulfilling an order', () => {
    expect(paymentRemindersSource).toContain("actionType: 'auto_fulfilled'");
  });

  it('logs to quoteActivityLogs using logQuoteActivity helper', () => {
    expect(paymentRemindersSource).toContain('logQuoteActivity');
    expect(paymentRemindersSource).toContain('auto_fulfilled');
  });
});

// ─── 2. Pure-logic unit tests ─────────────────────────────────────────────────

/**
 * Mirrors the flag-building logic from orders-read.ts / storage/orders.ts:
 *
 *   autoFulfilledIds = new Set(rows.map(r => r.quoteId))
 *   isAutoFulfilled  = autoFulfilledIds.has(order.id)
 */
function buildIsAutoFulfilled(
  orders: { id: number }[],
  activityLogRows: { quoteId: number }[],
): Record<number, boolean> {
  const autoFulfilledIds = new Set(activityLogRows.map(r => r.quoteId));
  return Object.fromEntries(orders.map(o => [o.id, autoFulfilledIds.has(o.id)]));
}

describe('Auto-fulfilled flag logic — unit tests', () => {
  it('marks an order as auto-fulfilled when an auto_fulfilled log row exists', () => {
    const result = buildIsAutoFulfilled(
      [{ id: 42 }],
      [{ quoteId: 42 }],
    );
    expect(result[42]).toBe(true);
  });

  it('returns false when no auto_fulfilled log row exists for the order', () => {
    const result = buildIsAutoFulfilled(
      [{ id: 42 }],
      [], // no log entries
    );
    expect(result[42]).toBe(false);
  });

  it('returns false for an order not in the activity log even when other orders are', () => {
    const result = buildIsAutoFulfilled(
      [{ id: 1 }, { id: 2 }],
      [{ quoteId: 1 }], // only order 1 was auto-fulfilled
    );
    expect(result[1]).toBe(true);
    expect(result[2]).toBe(false);
  });

  it('handles multiple auto-fulfilled orders in a single batch', () => {
    const result = buildIsAutoFulfilled(
      [{ id: 10 }, { id: 20 }, { id: 30 }],
      [{ quoteId: 10 }, { quoteId: 30 }],
    );
    expect(result[10]).toBe(true);
    expect(result[20]).toBe(false);
    expect(result[30]).toBe(true);
  });

  it('returns false for every order when the activity log query returns an empty array', () => {
    const result = buildIsAutoFulfilled(
      [{ id: 5 }, { id: 6 }],
      [],
    );
    expect(result[5]).toBe(false);
    expect(result[6]).toBe(false);
  });

  it('ignores duplicate log entries for the same order (Set deduplication)', () => {
    const result = buildIsAutoFulfilled(
      [{ id: 99 }],
      [{ quoteId: 99 }, { quoteId: 99 }],
    );
    expect(result[99]).toBe(true);
  });
});

// ─── 3. Supertest integration tests ──────────────────────────────────────────
//
// A mocked DB is injected via vi.mock so no real database connection is needed.
// The mock's select queue is consumed in the exact order the route executes its
// queries (see trace in comments below each test).
// ─────────────────────────────────────────────────────────────────────────────

const { queuedResults, mockDb } = vi.hoisted(() => {
  const queuedResults: unknown[][] = [];

  function nextResult(): unknown[] {
    return queuedResults.shift() ?? [];
  }

  /**
   * Builds a fully-chainable result object that resolves to `data`.
   * Supports: .where() .orderBy() .limit() .offset()
   */
  function makeResult(data: unknown[]): any {
    const obj: any = Promise.resolve(data);

    obj.orderBy = (..._a: unknown[]) => {
      const r: any = Promise.resolve(data);
      r.limit = (n: number) => {
        const r2: any = Promise.resolve(data.slice(0, n));
        r2.offset = (_off: number) => Promise.resolve(data.slice(0, n));
        return r2;
      };
      return r;
    };

    obj.limit = (n: number) => {
      const r: any = Promise.resolve(data.slice(0, n));
      r.offset = (_off: number) => Promise.resolve(data.slice(0, n));
      return r;
    };

    return obj;
  }

  const mockDb = {
    select: (_cols?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond?: unknown) => makeResult(nextResult()),
        leftJoin: (_j: unknown, _on?: unknown) => ({
          where: (_cond?: unknown) => makeResult(nextResult()),
        }),
        orderBy: (..._a: unknown[]) => {
          // For queries that orderBy without a prior where (not used here,
          // but kept for completeness)
          const r: any = Promise.resolve(nextResult());
          r.limit = (n: number) => {
            const r2: any = Promise.resolve([]);
            r2.offset = () => Promise.resolve([]);
            return r2;
          };
          return r;
        },
      }),
    }),
  };

  return { queuedResults, mockDb };
});

vi.mock('../server/db', () => ({ db: mockDb }));

vi.mock('../server/googleAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'ws-1', claims: { sub: 'ws-1' } };
    next();
  },
  getGoogleAuthUrl: vi.fn(),
  verifyGoogleToken: vi.fn(),
  createOrUpdateUser: vi.fn(),
  GoogleAuthBlockedError: class extends Error {},
}));

vi.mock('../server/utils/resolveWholesalerId', () => ({
  resolveWholesalerId: () => 'ws-1',
}));

// Stub out heavy services that the route module imports transitively
vi.mock('../server/storage', () => ({
  storage: {},
  db: mockDb,
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'ws-1', claims: { sub: 'ws-1' } };
    next();
  },
  requireNotViewer: (_req: any, _res: any, next: any) => next(),
  requireMemberPermission: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../server/invoicePdf', () => ({ buildInvoicePdf: vi.fn() }));
vi.mock('../server/stripeConfig', () => ({
  getStripeClient: vi.fn(),
  isLiveMode: vi.fn(() => false),
}));
vi.mock('../server/services/analyticsService', () => ({
  getOrderStats: vi.fn().mockResolvedValue({ revenue: 0, orders: 0 }),
}));

// ── Deferred imports (after mocks are registered) ─────────────────────────────
import request from 'supertest';
import express from 'express';
import { registerOrderReadRoutes } from '../server/routes/orders-read';

// Shared schema objects (real, used for table identity checks)
import {
  orders,
  quoteActivityLogs,
  orderCancellationRequests,
  businessProfiles,
} from '@shared/schema';

const app = express();
app.use(express.json());
registerOrderReadRoutes(app);

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A fulfilled+paid (archived) order with NO auto-fulfilled log entry */
const MANUAL_ORDER = {
  id: 200,
  wholesalerId: 'ws-1',
  retailerId: null,
  businessProfileId: null,
  status: 'fulfilled',
  paymentStatus: 'paid',
  orderNumber: 'ORD-200',
  customerName: 'Manual Customer',
  customerEmail: 'manual@example.com',
  customerPhone: null,
  createdAt: new Date('2024-03-01').toISOString(),
  updatedAt: new Date('2024-03-15').toISOString(),
  total: '100.00',
  subtotal: '100.00',
  platformFee: '0.00',
  amountPaid: '100.00',
  amountOutstanding: '0.00',
  amountRefunded: null,
  fulfillmentType: 'delivery',
  collectionAddressId: null,
  chaserPaused: false,
};

/** A fulfilled+paid (archived) order WITH an auto-fulfilled log entry */
const AUTO_ORDER = { ...MANUAL_ORDER, id: 201, orderNumber: 'ORD-201' };

// Stats responses shared across both tests
const COUNT_ONE = [{ count: 1 }];
const TAB_STATS = [{ paidOrdersCount: 1, pendingOrdersCount: 0, totalRevenue: 100 }];
const BASE_STATS = [{ activeCount: 0, archivedCount: 1 }];
const EMPTY = [];

function resetQueue() {
  queuedResults.length = 0;
}

/**
 * Loads the mock DB queue for a single-order paginated request.
 *
 * Query execution order for /api/orders-paginated with 1 result and no
 * businessProfileId / retailerId on the order:
 *
 *   0  Promise.all[0] — count(*)          → COUNT_ONE
 *   1  Promise.all[1] — orders page       → [order]
 *   2  Promise.all[2] — tab stats         → TAB_STATS
 *   3  Promise.all[3] — base stats        → BASE_STATS
 *   4  cancellationRequests               → EMPTY
 *   5  businessProfiles (skipped — no profileIds)
 *   6  orderPicking (dynamic import)      → EMPTY
 *   7  quoteActivityLogs auto_fulfilled   → autoFulfilledRows
 *   8  Promise.all[0] retailer users      → EMPTY (no retailerId)
 *      (display names skipped — no retailerIds)
 */
function loadQueue(order: typeof MANUAL_ORDER, autoFulfilledRows: unknown[]) {
  resetQueue();
  queuedResults.push(
    COUNT_ONE,           // 0 – count
    [order],             // 1 – orders page
    TAB_STATS,           // 2 – tab stats
    BASE_STATS,          // 3 – base stats
    EMPTY,               // 4 – cancellation requests
    EMPTY,               // 5 – orderPicking
    autoFulfilledRows,   // 6 – quoteActivityLogs
  );
  // retailerIds will be [] (no retailerId on order) → no further selects
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/orders-paginated — isAutoFulfilled flag', () => {
  beforeEach(() => resetQueue());

  it('returns isAutoFulfilled: true for an order with an auto_fulfilled activity log entry', async () => {
    loadQueue(AUTO_ORDER, [{ quoteId: AUTO_ORDER.id }]);

    const res = await request(app)
      .get('/api/orders-paginated')
      .query({ archiveTab: 'archived', page: '1', limit: '20' });

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].id).toBe(AUTO_ORDER.id);
    expect(res.body.orders[0].isAutoFulfilled).toBe(true);
  });

  it('returns isAutoFulfilled: false for a manually fulfilled order with no activity log entry', async () => {
    loadQueue(MANUAL_ORDER, []); // empty auto-fulfilled rows

    const res = await request(app)
      .get('/api/orders-paginated')
      .query({ archiveTab: 'archived', page: '1', limit: '20' });

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].id).toBe(MANUAL_ORDER.id);
    expect(res.body.orders[0].isAutoFulfilled).toBe(false);
  });
});
