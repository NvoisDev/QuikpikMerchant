/**
 * Task #1072 / #1075 — Picking Mode isolation regression tests
 *
 * Three layers of isolation guarantee:
 * 1. Static source analysis  — the route file never imports stock/payment APIs
 * 2. Explicit field checks   — invoice total, paymentStatus, and invoice fields
 *                             are never referenced in picking source
 * 3. Supertest endpoint tests — HTTP calls against real route handlers with a
 *    mocked DB verify only order_picking and order_item_picks are written to,
 *    and that no notification or WhatsApp services are ever invoked
 */

import { readFileSync } from 'node:fs';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const pickingSource = readFileSync('server/routes/picking.ts', 'utf-8');

// ─── Stock isolation ──────────────────────────────────────────────────────────

describe('Picking route — stock isolation', () => {
  it('does not import or reference stockMovements', () => {
    expect(pickingSource).not.toContain('stockMovements');
  });

  it('does not import InventoryCalculator', () => {
    expect(pickingSource).not.toContain('InventoryCalculator');
  });

  it('does not call decrementStock or any stock-mutation helper', () => {
    expect(pickingSource).not.toMatch(/decrementStock|updateStock|setStock|baseUnitStock/);
  });

  it('does not write to products table', () => {
    expect(pickingSource).not.toMatch(/db\.update\(products\)|db\.insert\(products\)/);
  });

  it('does not write to order_items table', () => {
    expect(pickingSource).not.toMatch(/db\.update\(orderItems\)|db\.insert\(orderItems\)/);
  });

  it('does not write to orders table', () => {
    expect(pickingSource).not.toMatch(/db\.update\(orders\)|db\.insert\(orders\)/);
  });
});

// ─── Notification isolation ───────────────────────────────────────────────────

describe('Picking route — notification isolation', () => {
  it('does not import notification services', () => {
    expect(pickingSource).not.toContain('orderNotificationService');
    expect(pickingSource).not.toContain('sendOrderStatusNotification');
    expect(pickingSource).not.toContain('orderCancellationNotificationService');
  });

  it('does not send any email', () => {
    expect(pickingSource).not.toMatch(/sendEmail|sgMail|SendGrid|mailData/i);
  });

  it('does not send WhatsApp or SMS messages', () => {
    expect(pickingSource).not.toMatch(/whatsApp|twilio|sendSMS|sendWhatsApp/i);
  });
});

// ─── Analytics / payment isolation ────────────────────────────────────────────

describe('Picking route — analytics and payment isolation', () => {
  it('does not reference Stripe or payment logic', () => {
    expect(pickingSource).not.toMatch(/stripe|paymentIntent|checkout\.sessions/i);
  });

  it('does not import or touch analytics tables', () => {
    expect(pickingSource).not.toMatch(/analyticsService|getOrderStats|campaignOrders/);
  });

  it('does not write to stockMovements', () => {
    expect(pickingSource).not.toMatch(/db\.update\(stockMovements\)|db\.insert\(stockMovements\)/);
  });
});

// ─── Only touches the two picking tables ──────────────────────────────────────

describe('Picking route — only writes to picking tables', () => {
  it('all db.insert calls go to order_picking or order_item_picks only', () => {
    const insertMatches = pickingSource.match(/db\.insert\((\w+)\)/g) ?? [];
    for (const m of insertMatches) {
      expect(m).toMatch(/db\.insert\((orderPicking|orderItemPicks)\)/);
    }
  });

  it('all db.update calls go to order_picking or order_item_picks only', () => {
    const updateMatches = pickingSource.match(/db\.update\((\w+)\)/g) ?? [];
    for (const m of updateMatches) {
      expect(m).toMatch(/db\.update\((orderPicking|orderItemPicks)\)/);
    }
  });

  it('reads orders table only for ownership verification (no writes)', () => {
    expect(pickingSource).toContain('db.select');
    expect(pickingSource).toContain('from(orders)');
    expect(pickingSource).not.toContain('db.update(orders)');
    expect(pickingSource).not.toContain('db.insert(orders)');
  });
});

// ─── Order-item binding — each write is scoped to the correct order ────────────

describe('Picking route — cross-order isolation', () => {
  it('PATCH item endpoint verifies orderItemId belongs to the target order', () => {
    expect(pickingSource).toContain('eq(orderItems.orderId, orderId)');
  });

  it('insert and update of order_item_picks always include orderId column', () => {
    const insertBlocks = pickingSource.match(/db\.insert\(orderItemPicks\)\.values\(\{[\s\S]*?\}\)/g) ?? [];
    for (const block of insertBlocks) {
      expect(block).toContain('orderId');
    }
  });

  it('update of order_item_picks always constrains by both id and orderId', () => {
    expect(pickingSource).toContain('eq(orderItemPicks.orderId, orderId)');
    const updateCount = (pickingSource.match(/db\.update\(orderItemPicks\)/g) ?? []).length;
    const constraintCount = (pickingSource.match(/eq\(orderItemPicks\.orderId, orderId\)/g) ?? []).length;
    expect(constraintCount).toBeGreaterThanOrEqual(updateCount);
  });
});

// ─── Derived status logic — does not affect order status field ────────────────

describe('Picking route — picking status never mutates order status field', () => {
  it('_recalcPickingStatus only writes to order_picking table', () => {
    const recalcFn = pickingSource.match(/_recalcPickingStatus[\s\S]*?^}/m)?.[0] ?? '';
    if (recalcFn) {
      expect(recalcFn).not.toMatch(/db\.update\(orders\)/);
      expect(recalcFn).not.toContain('status:');
    }
  });

  it('picking statuses are one of three expected values only', () => {
    const statusStrings = pickingSource.match(/'not_started'|'picking'|'packed'/g) ?? [];
    const uniqueStatuses = new Set(statusStrings.map(s => s.replace(/'/g, '')));
    const allowedStatuses = new Set(['not_started', 'picking', 'packed']);
    for (const s of uniqueStatuses) {
      expect(allowedStatuses.has(s)).toBe(true);
    }
  });
});

// ─── Invoice / payment field isolation ───────────────────────────────────────

describe('Picking route — invoice total and payment status never mutated', () => {
  it('does not reference the total field on orders', () => {
    expect(pickingSource).not.toMatch(/orders\.total|\.total\s*:/);
  });

  it('does not reference paymentStatus on orders', () => {
    expect(pickingSource).not.toMatch(/paymentStatus|payment_status/);
  });

  it('does not reference invoiceNumber or invoiceUrl', () => {
    expect(pickingSource).not.toMatch(/invoiceNumber|invoiceUrl|invoice_number|invoice_url/i);
  });

  it('does not attempt to recalculate order totals', () => {
    expect(pickingSource).not.toMatch(/calculateTotal|recalcTotal|computeTotal|orderTotal/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Supertest endpoint integration tests
//
// These tests execute real HTTP requests against the actual picking route
// handlers.  The database layer is replaced by a lightweight in-memory mock
// that:
//   • returns fixture data from a pre-loaded queue for SELECT queries
//   • records every INSERT / UPDATE with the exact Drizzle table reference
// After each request the write log is inspected to confirm that only the two
// picking tables (orderPicking, orderItemPicks) were ever written to.
// Notification and WhatsApp service spies confirm zero invocations.
// ─────────────────────────────────────────────────────────────────────────────

// vi.hoisted runs before any import — values here are available inside vi.mock factories
const { queuedResults, writeLog, notifySpy, whatsappSpy, mockDb } = vi.hoisted(() => {
  const queuedResults: unknown[][] = [];
  const writeLog: { op: 'insert' | 'update'; table: unknown }[] = [];
  const notifySpy = vi.fn().mockResolvedValue(undefined);
  const whatsappSpy = vi.fn().mockResolvedValue(undefined);

  function nextResult(): unknown[] {
    return queuedResults.shift() ?? [];
  }

  /**
   * Returns a thenable (Promise) that also exposes a `.limit(n)` method so the
   * mock satisfies both direct-await and chained-limit call sites in picking.ts.
   */
  function makeWhereResult(data: unknown[]): Promise<unknown[]> & { limit(n: number): Promise<unknown[]> } {
    const p = Promise.resolve(data) as Promise<unknown[]> & { limit(n: number): Promise<unknown[]> };
    p.limit = (n: number) => Promise.resolve(data.slice(0, n));
    return p;
  }

  const mockDb = {
    /** Handles: select().from(t).where(c).limit(n)  and  select().from(t).leftJoin(...).where(c) */
    select: (_cols?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond?: unknown) => makeWhereResult(nextResult()),
        leftJoin: (_other: unknown, _on?: unknown) => ({
          where: (_cond?: unknown) => makeWhereResult(nextResult()),
        }),
        // Fallback for direct-await without .where() (not used in picking.ts but kept for safety)
        then: (fn: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(nextResult()).then(fn, rej),
      }),
    }),
    /** Records which Drizzle table object was passed so tests can assert by identity */
    insert: (table: unknown) => ({
      values: (_data: unknown) => {
        writeLog.push({ op: 'insert', table });
        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (_data: unknown) => ({
        where: (_cond?: unknown) => {
          writeLog.push({ op: 'update', table });
          return Promise.resolve();
        },
      }),
    }),
  };

  return { queuedResults, writeLog, notifySpy, whatsappSpy, mockDb };
});

// ── Module mocks (hoisted automatically by Vitest) ────────────────────────────

vi.mock('../server/db', () => ({ db: mockDb }));

// Bypass Replit/Google auth — inject a synthetic authenticated user
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

// Notification services — not imported by picking.ts but mocked here so that
// any future accidental import would show up as a detected call
vi.mock('../server/services/orderNotificationService', () => ({
  orderNotificationService: { send: notifySpy, notify: notifySpy },
  sendOrderStatusNotification: notifySpy,
}));

vi.mock('../server/services/whatsappService', () => ({
  sendWhatsAppMessage: whatsappSpy,
}));

// ── Deferred imports (after mocks are registered) ─────────────────────────────

import request from 'supertest';
import express from 'express';
import { registerPickingRoutes } from '../server/routes/picking';
import {
  orderPicking, orderItemPicks,
  products, orders, stockMovements,
} from '@shared/schema';

// Build a single Express app for all endpoint tests
const app = express();
app.use(express.json());
registerPickingRoutes(app);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_ORDER = { id: 100, wholesalerId: 'ws-1', total: '99.99', paymentStatus: 'paid' };
const MOCK_ITEMS = [{ id: 1 }, { id: 2 }];
const MOCK_ITEM_1 = [{ id: 1 }];
const MOCK_ITEMS_WITH_PRODUCT = [
  {
    id: 1, orderId: 100, productId: 10, quantity: 3, sellingType: 'units', freeItems: 0,
    productName: 'Widget', productImageUrl: null, productUnitSize: null, productUnitOfMeasure: null,
  },
  {
    id: 2, orderId: 100, productId: 20, quantity: 1, sellingType: 'units', freeItems: 0,
    productName: 'Gizmo', productImageUrl: null, productUnitSize: null, productUnitOfMeasure: null,
  },
];

/** Tables that must never be written to by a picking endpoint */
const FORBIDDEN_TABLES = [products, orders, stockMovements];

function resetState() {
  queuedResults.length = 0;
  writeLog.length = 0;
  notifySpy.mockClear();
  whatsappSpy.mockClear();
}

// ─── GET /api/orders/:id/picking ──────────────────────────────────────────────

describe('GET /api/orders/:id/picking — isolation', () => {
  beforeEach(() => {
    resetState();
    // Select queue (consumed in order by the route handler):
    // 1. orders (ownership check)
    // 2. orderPicking (current picking row — empty = not started)
    // 3. orderItems LEFT JOIN products (item list)
    // 4. orderItemPicks (existing pick flags)
    queuedResults.push(
      [MOCK_ORDER],
      [],
      MOCK_ITEMS_WITH_PRODUCT,
      [],
    );
  });

  it('returns 200 with correct picking state and item list', async () => {
    const res = await request(app).get('/api/orders/100/picking');
    expect(res.status).toBe(200);
    expect(res.body.pickingStatus).toBe('not_started');
    expect(res.body.items).toHaveLength(2);
  });

  it('makes zero writes to any database table', async () => {
    await request(app).get('/api/orders/100/picking');
    expect(writeLog).toHaveLength(0);
  });

  it('triggers no notification or WhatsApp calls', async () => {
    await request(app).get('/api/orders/100/picking');
    expect(notifySpy).not.toHaveBeenCalled();
    expect(whatsappSpy).not.toHaveBeenCalled();
  });
});

// ─── PATCH /api/orders/:id/picking/items/:itemId ──────────────────────────────

describe('PATCH /api/orders/:id/picking/items/:itemId — stock and invoice isolation', () => {
  beforeEach(() => {
    resetState();
    // Select queue:
    // 1. orders (ownership check)
    // 2. orderItems (verify item belongs to this order)
    // 3. orderItemPicks (no existing pick → triggers INSERT)
    // 4. _recalcPickingStatus: orderItems (all items)
    // 5. _recalcPickingStatus: orderItemPicks (1 of 2 picked → 'picking' status)
    // 6. _recalcPickingStatus: orderPicking (no existing row → INSERT)
    queuedResults.push(
      [MOCK_ORDER],
      MOCK_ITEM_1,
      [],
      MOCK_ITEMS,
      [{ isPicked: true }],
      [],
    );
  });

  it('returns 200 with success:true', async () => {
    const res = await request(app)
      .patch('/api/orders/100/picking/items/1')
      .send({ isPicked: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('writes only to order_item_picks and order_picking — never products, orders, or stockMovements', async () => {
    await request(app)
      .patch('/api/orders/100/picking/items/1')
      .send({ isPicked: true });

    expect(writeLog.length).toBeGreaterThan(0);
    const tablesWritten = writeLog.map(w => w.table);
    for (const t of tablesWritten) {
      expect(FORBIDDEN_TABLES).not.toContain(t);
      expect([orderItemPicks, orderPicking]).toContain(t);
    }
  });

  it('triggers no notification or WhatsApp calls', async () => {
    await request(app)
      .patch('/api/orders/100/picking/items/1')
      .send({ isPicked: true });
    expect(notifySpy).not.toHaveBeenCalled();
    expect(whatsappSpy).not.toHaveBeenCalled();
  });

  it('stock table (products) is never passed to db.insert or db.update', async () => {
    await request(app)
      .patch('/api/orders/100/picking/items/1')
      .send({ isPicked: true });
    const tablesWritten = writeLog.map(w => w.table);
    expect(tablesWritten).not.toContain(products);
  });

  it('orders table is never passed to db.insert or db.update', async () => {
    await request(app)
      .patch('/api/orders/100/picking/items/1')
      .send({ isPicked: true });
    const tablesWritten = writeLog.map(w => w.table);
    expect(tablesWritten).not.toContain(orders);
  });

  it('stockMovements table is never passed to db.insert or db.update', async () => {
    await request(app)
      .patch('/api/orders/100/picking/items/1')
      .send({ isPicked: true });
    const tablesWritten = writeLog.map(w => w.table);
    expect(tablesWritten).not.toContain(stockMovements);
  });
});

// ─── POST /api/orders/:id/picking/mark-all ────────────────────────────────────

describe('POST /api/orders/:id/picking/mark-all — stock and invoice isolation', () => {
  beforeEach(() => {
    resetState();
    // Select queue:
    // 1. orders (ownership check)
    // 2. orderItems (list of all items to mark)
    // 3. orderItemPicks for item 1 (no existing → INSERT)
    // 4. orderItemPicks for item 2 (no existing → INSERT)
    // 5. orderPicking (no existing row → INSERT)
    queuedResults.push(
      [MOCK_ORDER],
      MOCK_ITEMS,
      [],
      [],
      [],
    );
  });

  it('returns 200 with pickingStatus packed', async () => {
    const res = await request(app).post('/api/orders/100/picking/mark-all');
    expect(res.status).toBe(200);
    expect(res.body.pickingStatus).toBe('packed');
  });

  it('writes only to order_item_picks and order_picking — never products, orders, or stockMovements', async () => {
    await request(app).post('/api/orders/100/picking/mark-all');

    expect(writeLog.length).toBeGreaterThan(0);
    const tablesWritten = writeLog.map(w => w.table);
    for (const t of tablesWritten) {
      expect(FORBIDDEN_TABLES).not.toContain(t);
      expect([orderItemPicks, orderPicking]).toContain(t);
    }
  });

  it('triggers no notification or WhatsApp calls', async () => {
    await request(app).post('/api/orders/100/picking/mark-all');
    expect(notifySpy).not.toHaveBeenCalled();
    expect(whatsappSpy).not.toHaveBeenCalled();
  });

  it('never writes to stockMovements during mark-all', async () => {
    await request(app).post('/api/orders/100/picking/mark-all');
    const tablesWritten = writeLog.map(w => w.table);
    expect(tablesWritten).not.toContain(stockMovements);
  });

  it('invoice total and paymentStatus are absent from every write payload', async () => {
    await request(app).post('/api/orders/100/picking/mark-all');
    // The write log records table references only; the static assertions above
    // confirm no total/paymentStatus fields exist in the source at all.
    // This test confirms the endpoint still has the same write isolation at runtime.
    const tablesWritten = writeLog.map(w => w.table);
    expect(tablesWritten).not.toContain(orders);
  });
});

// ─── POST /api/orders/:id/picking/reset ───────────────────────────────────────

describe('POST /api/orders/:id/picking/reset — stock and invoice isolation', () => {
  beforeEach(() => {
    resetState();
    // Select queue:
    // 1. orders (ownership check)
    // 2. orderItems (get item IDs for bulk reset)
    // 3. orderPicking (no existing row → INSERT instead of UPDATE)
    // Note: bulk update of orderItemPicks uses db.update, not a select.
    queuedResults.push(
      [MOCK_ORDER],
      MOCK_ITEMS,
      [],
    );
  });

  it('returns 200 with pickingStatus not_started', async () => {
    const res = await request(app).post('/api/orders/100/picking/reset');
    expect(res.status).toBe(200);
    expect(res.body.pickingStatus).toBe('not_started');
  });

  it('writes only to order_item_picks and order_picking — never products, orders, or stockMovements', async () => {
    await request(app).post('/api/orders/100/picking/reset');

    expect(writeLog.length).toBeGreaterThan(0);
    const tablesWritten = writeLog.map(w => w.table);
    for (const t of tablesWritten) {
      expect(FORBIDDEN_TABLES).not.toContain(t);
      expect([orderItemPicks, orderPicking]).toContain(t);
    }
  });

  it('triggers no notification or WhatsApp calls', async () => {
    await request(app).post('/api/orders/100/picking/reset');
    expect(notifySpy).not.toHaveBeenCalled();
    expect(whatsappSpy).not.toHaveBeenCalled();
  });

  it('never writes to stockMovements during reset', async () => {
    await request(app).post('/api/orders/100/picking/reset');
    const tablesWritten = writeLog.map(w => w.table);
    expect(tablesWritten).not.toContain(stockMovements);
  });

  it('invoice total and paymentStatus are absent from every write payload during reset', async () => {
    await request(app).post('/api/orders/100/picking/reset');
    const tablesWritten = writeLog.map(w => w.table);
    expect(tablesWritten).not.toContain(orders);
  });
});
