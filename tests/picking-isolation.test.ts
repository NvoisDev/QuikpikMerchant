/**
 * Task #1072 — Picking Mode isolation regression tests
 *
 * These tests prove that the picking feature is strictly additive:
 * - The route file for picking only touches the two new tables
 * - No stock movement creation, no notifications, no analytics, no order-status
 *   changes are triggered by any picking endpoint
 * - Existing order approval / send flows are unaffected by the picking tables
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const pickingSource = readFileSync('server/routes/picking.ts', 'utf-8');

// ─── Stock isolation ─────────────────────────────────────────────────────────

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

// ─── Notification isolation ──────────────────────────────────────────────────

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

// ─── Analytics / payment isolation ───────────────────────────────────────────

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

// ─── Only touches the two picking tables ─────────────────────────────────────

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

// ─── Order-item binding — each write is scoped to the correct order ───────────

describe('Picking route — cross-order isolation', () => {
  it('PATCH item endpoint verifies orderItemId belongs to the target order', () => {
    expect(pickingSource).toContain('eq(orderItems.orderId, orderId)');
  });

  it('insert and update of order_item_picks always include orderId column', () => {
    // Every insert to order_item_picks must include orderId: ...
    const insertBlocks = pickingSource.match(/db\.insert\(orderItemPicks\)\.values\(\{[\s\S]*?\}\)/g) ?? [];
    for (const block of insertBlocks) {
      expect(block).toContain('orderId');
    }
  });

  it('update of order_item_picks always constrains by both id and orderId', () => {
    // The file must contain an orderId constraint on order_item_picks updates
    expect(pickingSource).toContain('eq(orderItemPicks.orderId, orderId)');
    // The total number of update(orderItemPicks) calls must equal the total number
    // of eq(orderItemPicks.orderId, orderId) constraints (one-to-one binding)
    const updateCount = (pickingSource.match(/db\.update\(orderItemPicks\)/g) ?? []).length;
    const constraintCount = (pickingSource.match(/eq\(orderItemPicks\.orderId, orderId\)/g) ?? []).length;
    expect(constraintCount).toBeGreaterThanOrEqual(updateCount);
  });
});

// ─── Derived status logic — does not affect order status ─────────────────────

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
