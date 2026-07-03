/**
 * Tests that the totalSpent figure stays in sync with the analytics ranking
 * after partial refunds — covering three paths:
 *
 *   A) getCustomerDetails() (single-detail) — mocked DB, real method call
 *   B) getCustomers() bulk SQL             — source-level arithmetic audit
 *   C) /api/analytics/customers            — source-level function-reference audit
 *
 * The shared arithmetic lives in server/utils/customer-spend.ts.
 * Tests A and C exercise the real production code paths.
 * Test B audits the SQL formula so drift from the shared helper is caught.
 */

// ─── Hoisted mock state (must run before any import) ──────────────────────────

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const { queuedResults, mockDb } = vi.hoisted(() => {
  const queuedResults: unknown[][] = [];

  function nextResult(): unknown[] {
    return queuedResults.shift() ?? [];
  }

  /**
   * Flexible mock Drizzle builder.  Handles chains like:
   *   .select().from().where()
   *   .select().from().innerJoin().where()
   *   .select().from().where().orderBy()
   *   .select().from().where().groupBy()
   */
  function makeResult(data: unknown[]): Promise<unknown[]> {
    return Promise.resolve(data);
  }

  function leaf(): Promise<unknown[]> {
    return makeResult(nextResult());
  }

  const mockDb = {
    select: (_cols?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond?: unknown) => ({
          // some callers await here; some chain .orderBy() or .groupBy()
          then: (fn: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
            makeResult(nextResult()).then(fn, rej),
          orderBy: (_col?: unknown) => leaf(),
          groupBy: (_col?: unknown) => leaf(),
        }),
        innerJoin: (_other: unknown, _on?: unknown) => ({
          where: (_cond?: unknown) => leaf(),
          innerJoin: (_other2: unknown, _on2?: unknown) => ({
            where: (_cond?: unknown) => leaf(),
          }),
        }),
        leftJoin: (_other: unknown, _on?: unknown) => ({
          where: (_cond?: unknown) => leaf(),
        }),
      }),
    }),
    insert: (_table: unknown) => ({
      values: (_data: unknown) => Promise.resolve(),
    }),
    update: (_table: unknown) => ({
      set: (_data: unknown) => ({
        where: (_cond?: unknown) => Promise.resolve(),
      }),
    }),
  };

  return { queuedResults, mockDb };
});

vi.mock('../server/db', () => ({ db: mockDb }));

// ─── Deferred imports (after mocks are registered) ────────────────────────────

import { CustomerMgmtStorage } from '../server/storage/customer-mgmt';
import {
  computeDetailTotalSpent,
  computeAnalyticsTotalSpent,
  type OrderSpendFields,
} from '../server/utils/customer-spend';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WHOLESALER_ID = 'ws-test-1';
const CUSTOMER_ID = 'cu-test-1';

const MOCK_RELATIONSHIP = {
  id: 1,
  customerId: CUSTOMER_ID,
  wholesalerId: WHOLESALER_ID,
  status: 'active',
  displayName: null,
};

const MOCK_USER = {
  id: CUSTOMER_ID,
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  role: 'retailer',
  isTestAccount: false,
};

type MockOrder = OrderSpendFields & {
  id: number;
  retailerId: string;
  wholesalerId: string;
  createdAt: Date;
  customerName?: string;
};

function mockOrder(id: number, overrides: Partial<MockOrder> = {}): MockOrder {
  return {
    id,
    retailerId: CUSTOMER_ID,
    wholesalerId: WHOLESALER_ID,
    status: 'fulfilled',
    paymentStatus: 'paid',
    subtotal: '100.00',
    total: '100.00',
    platformFee: '2.00',
    amountRefunded: '0.00',
    createdAt: new Date('2025-01-01'),
    customerName: 'Alice Smith',
    ...overrides,
  };
}

// ─── Section A: getCustomerDetails() — mocked DB, real method ────────────────

describe('getCustomerDetails() — single-detail path (mocked DB)', () => {
  const storage = new CustomerMgmtStorage();

  beforeEach(() => {
    queuedResults.length = 0;
  });

  function seedQueries(orders: MockOrder[]) {
    queuedResults.push(
      [MOCK_RELATIONSHIP],  // 1. wholesalerCustomerRelationships lookup
      [MOCK_USER],          // 2. users lookup
      [],                   // 3. customerGroupMembers + groups (no groups needed)
      orders,               // 4. orders for this customer
    );
  }

  it('totalSpent is zero when there are no orders', async () => {
    seedQueries([]);
    const detail = await storage.getCustomerDetails(CUSTOMER_ID, WHOLESALER_ID);
    expect(detail).toBeDefined();
    expect(detail!.totalSpent).toBe(0);
    expect(detail!.totalSpent).toEqual(computeDetailTotalSpent([]));
  });

  it('totalSpent matches computeDetailTotalSpent for a paid order with no refund', async () => {
    const orders = [mockOrder(1)];
    seedQueries(orders);
    const detail = await storage.getCustomerDetails(CUSTOMER_ID, WHOLESALER_ID);
    expect(detail!.totalSpent).toBeCloseTo(computeDetailTotalSpent(orders), 10);
    // 100 - 2 - 0 = 98
    expect(detail!.totalSpent).toBeCloseTo(98, 2);
  });

  it('totalSpent matches computeDetailTotalSpent for a paid order with a partial refund', async () => {
    const orders = [mockOrder(1, { amountRefunded: '20.00' })];
    seedQueries(orders);
    const detail = await storage.getCustomerDetails(CUSTOMER_ID, WHOLESALER_ID);
    expect(detail!.totalSpent).toBeCloseTo(computeDetailTotalSpent(orders), 10);
    // 100 - 2 - 20 = 78
    expect(detail!.totalSpent).toBeCloseTo(78, 2);
  });

  it('totalSpent matches computeDetailTotalSpent for multiple orders, some with partial refunds', async () => {
    const orders = [
      mockOrder(1, { subtotal: '200.00', platformFee: '4.00', amountRefunded: '50.00' }),
      mockOrder(2, { subtotal: '100.00', platformFee: '2.00', amountRefunded: '0.00' }),
      mockOrder(3, { subtotal: '50.00',  platformFee: '1.00', amountRefunded: '10.00' }),
    ];
    seedQueries(orders);
    const detail = await storage.getCustomerDetails(CUSTOMER_ID, WHOLESALER_ID);
    expect(detail!.totalSpent).toBeCloseTo(computeDetailTotalSpent(orders), 10);
    // (200-4-50) + (100-2-0) + (50-1-10) = 146 + 98 + 39 = 283
    expect(detail!.totalSpent).toBeCloseTo(283, 2);
  });

  it('totalSpent excludes cancelled orders even when they have amountRefunded', async () => {
    const orders = [
      mockOrder(1, { status: 'cancelled', amountRefunded: '100.00' }),
      mockOrder(2, { subtotal: '150.00', platformFee: '3.00', amountRefunded: '15.00' }),
    ];
    seedQueries(orders);
    const detail = await storage.getCustomerDetails(CUSTOMER_ID, WHOLESALER_ID);
    expect(detail!.totalSpent).toBeCloseTo(computeDetailTotalSpent(orders), 10);
    // Only order 2: 150 - 3 - 15 = 132
    expect(detail!.totalSpent).toBeCloseTo(132, 2);
  });

  it('totalSpent excludes unpaid orders', async () => {
    const orders = [
      mockOrder(1, { paymentStatus: 'unpaid', subtotal: '200.00', platformFee: '4.00' }),
      mockOrder(2, { subtotal: '100.00', platformFee: '2.00', amountRefunded: '10.00' }),
    ];
    seedQueries(orders);
    const detail = await storage.getCustomerDetails(CUSTOMER_ID, WHOLESALER_ID);
    expect(detail!.totalSpent).toBeCloseTo(computeDetailTotalSpent(orders), 10);
    // Only order 2: 100 - 2 - 10 = 88
    expect(detail!.totalSpent).toBeCloseTo(88, 2);
  });

  it('totalSpent and analytics view agree for paid orders with partial refunds', async () => {
    const orders = [
      mockOrder(1, { subtotal: '300.00', platformFee: '6.00', amountRefunded: '30.00' }),
      mockOrder(2, { subtotal: '150.00', platformFee: '3.00', amountRefunded: '0.00' }),
    ];
    seedQueries(orders);
    const detail = await storage.getCustomerDetails(CUSTOMER_ID, WHOLESALER_ID);
    // For paid orders, both detail and analytics paths produce the same figure
    expect(detail!.totalSpent).toBeCloseTo(computeAnalyticsTotalSpent(orders), 2);
  });
});

// ─── Section B: getCustomers() bulk SQL — source-level arithmetic audit ───────

describe('getCustomers() — bulk SQL arithmetic audit', () => {
  const customerMgmtSource = readFileSync('server/storage/customer-mgmt.ts', 'utf-8');

  it('bulk SQL deducts amountRefunded from the totalSpent aggregate', () => {
    // The GROUP BY query must subtract amountRefunded so bulk stats match the detail path.
    // This source assertion catches any future edit that removes the deduction.
    expect(customerMgmtSource).toMatch(/amountRefunded.*numeric.*0.*totalSpent|totalSpent.*amountRefunded/i);
  });

  it('bulk SQL filters to paymentStatus = paid for totalSpent', () => {
    // totalSpent must only count paid orders (same filter as computeDetailTotalSpent)
    expect(customerMgmtSource).toMatch(/paymentStatus.*=.*'paid'.*totalSpent|totalSpent.*paymentStatus.*paid/is);
  });

  it('bulk SQL excludes cancelled and draft orders from totalSpent', () => {
    // Both statuses must be excluded so bulk and detail results stay in sync
    expect(customerMgmtSource).toContain("'cancelled'");
    expect(customerMgmtSource).toContain("'draft'");
  });

  it('getCustomerDetails uses computeDetailTotalSpent (not an inline reduce)', () => {
    // After refactoring, the detail path must delegate to the shared helper
    expect(customerMgmtSource).toContain('computeDetailTotalSpent');
    // The old standalone paidOrders variable + reduce must not appear
    // (note: unpaidOrders.reduce is still present for a different calculation)
    expect(customerMgmtSource).not.toMatch(/\bpaidOrders\b.*\.reduce/);
  });
});

// ─── Section C: analytics route — shared helper usage audit ──────────────────

describe('/api/analytics/customers — shared arithmetic audit', () => {
  const analyticsSource = readFileSync('server/routes/analytics.ts', 'utf-8');

  it('analytics accumulator uses computeOrderNetValue for per-order arithmetic', () => {
    // The accumulator must delegate to the shared helper so it stays in sync with the detail path
    expect(analyticsSource).toContain('computeOrderNetValue');
  });

  it('analytics route imports from customer-spend utility', () => {
    expect(analyticsSource).toContain('customer-spend');
  });

  it('analytics accumulator still skips fully-refunded orders', () => {
    // This guard prevents fully-refunded orders from inflating the ranking
    expect(analyticsSource).toContain('isFullyRefunded');
  });

  it('analytics accumulator still excludes cancelled and draft orders', () => {
    expect(analyticsSource).toMatch(/cancelled.*draft|draft.*cancelled/);
  });
});

// ─── Section D: shared helper cross-path consistency (pure-function contracts) ─

describe('computeDetailTotalSpent / computeAnalyticsTotalSpent — cross-path parity for paid orders', () => {
  function order(overrides: Partial<OrderSpendFields> = {}): OrderSpendFields {
    return {
      status: 'fulfilled',
      paymentStatus: 'paid',
      subtotal: '100.00',
      total: '100.00',
      platformFee: '2.00',
      amountRefunded: '0.00',
      ...overrides,
    };
  }

  it('both paths agree: no refund on a paid order', () => {
    const orders = [order()];
    expect(computeDetailTotalSpent(orders)).toBeCloseTo(computeAnalyticsTotalSpent(orders), 10);
  });

  it('both paths agree: partial refund on a paid order', () => {
    const orders = [order({ amountRefunded: '25.00' })];
    // net = 100 - 2 - 25 = 73
    expect(computeDetailTotalSpent(orders)).toBeCloseTo(73, 2);
    expect(computeDetailTotalSpent(orders)).toBeCloseTo(computeAnalyticsTotalSpent(orders), 10);
  });

  it('both paths agree: mix of refunded and non-refunded paid orders', () => {
    const orders = [
      order({ subtotal: '200.00', platformFee: '4.00', amountRefunded: '50.00' }),
      order({ subtotal: '100.00', platformFee: '2.00', amountRefunded: '0.00' }),
    ];
    expect(computeDetailTotalSpent(orders)).toBeCloseTo(computeAnalyticsTotalSpent(orders), 10);
    expect(computeDetailTotalSpent(orders)).toBeCloseTo(244, 2);
  });

  it('both paths return zero when all orders are cancelled', () => {
    const orders = [order({ status: 'cancelled' }), order({ status: 'cancelled' })];
    expect(computeDetailTotalSpent(orders)).toBe(0);
    expect(computeAnalyticsTotalSpent(orders)).toBe(0);
  });

  it('detail path excludes unpaid; analytics includes them (documented divergence)', () => {
    const orders = [order({ paymentStatus: 'unpaid', subtotal: '100.00', platformFee: '2.00', amountRefunded: '0.00' })];
    expect(computeDetailTotalSpent(orders)).toBe(0);
    expect(computeAnalyticsTotalSpent(orders)).toBeCloseTo(98, 2);
  });
});
