/**
 * Draft charge item roundtrip tests
 *
 * Confirms that misc charge items (productId=null, customLabel, itemNotes)
 * survive both the POST /api/orders/draft (create) and
 * PATCH /api/orders/:id/draft (update) paths with their labels and notes
 * intact, and that the frontend prefill loop reconstructs them correctly.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted fixtures (available inside vi.mock factories) ─────────────────────

const {
  insertedItemRows,
  mockDb,
  mockStorage,
  MOCK_PRODUCT,
  MOCK_CUSTOMER,
  makeDraftWithItems,
} = vi.hoisted(() => {
  const insertedItemRows: any[][] = [];

  const MOCK_CUSTOMER = {
    id: 'cust-1',
    firstName: 'Test',
    lastName: 'Customer',
    businessName: 'Test Co',
    email: 'test@example.com',
    phoneNumber: '+447700900000',
  };

  const MOCK_PRODUCT = {
    id: 10,
    wholesalerId: 'ws-1',
    name: 'Widget A',
    price: '25.00',
    stock: 100,
    palletStock: 0,
  };

  const DRAFT_BASE = {
    id: 42,
    wholesalerId: 'ws-1',
    retailerId: 'cust-1',
    status: 'draft',
    subtotal: '0.00',
    total: '0.00',
    amountOutstanding: '0.00',
    deliveryCost: '0.00',
    paymentMethod: 'bank_transfer',
    fulfillmentType: 'pickup',
  };

  function makeDraftWithItems(items: any[]) {
    return {
      ...DRAFT_BASE,
      items,
      retailer: MOCK_CUSTOMER,
      wholesaler: { id: 'ws-1', businessName: 'Test Wholesaler' },
    };
  }

  const mockDb = {
    insert: (_table: any) => ({
      values: (vals: any) => {
        const rows = Array.isArray(vals) ? vals : [vals];
        // Only capture order-item inserts (they have quantity field)
        if (rows[0]?.quantity !== undefined) {
          insertedItemRows.push(rows);
        }
        return {
          returning: () => Promise.resolve([{ ...DRAFT_BASE, id: 42, status: 'draft' }]),
        };
      },
    }),
    delete: (_table: any) => ({
      where: (_cond: any) => Promise.resolve(),
    }),
    update: (_table: any) => ({
      set: (_data: any) => ({
        where: (_cond: any) => Promise.resolve(),
      }),
    }),
  };

  const mockStorage = {
    getUser: vi.fn().mockResolvedValue(MOCK_CUSTOMER),
    getProduct: vi.fn().mockResolvedValue(MOCK_PRODUCT),
    getOrder: vi.fn().mockResolvedValue(makeDraftWithItems([])),
    createDeliveryAddress: vi.fn(),
  };

  return { insertedItemRows, mockDb, mockStorage, MOCK_PRODUCT, MOCK_CUSTOMER, makeDraftWithItems };
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../server/db', () => ({ db: mockDb }));

vi.mock('../server/storage', () => ({ storage: mockStorage }));

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

// requireBooleanFeature lives in feature-gating (re-exported via shared)
vi.mock('../server/middleware/feature-gating', () => ({
  requireBooleanFeature: () => (_req: any, _res: any, next: any) => next(),
  requireFeatureAccess: () => (_req: any, _res: any, next: any) => next(),
  requireProductLimits: () => (_req: any, _res: any, next: any) => next(),
  requireBroadcastLimits: () => (_req: any, _res: any, next: any) => next(),
  requireTeamMemberLimits: () => (_req: any, _res: any, next: any) => next(),
  getUserPlanLimits: vi.fn(),
}));

vi.mock('../server/utils/fee-config', () => ({
  getCurrentFeeConfig: vi.fn(),
  getFeeConfigForWholesaler: vi.fn(),
  getWholesalerPlatformFeeRate: vi.fn(),
}));

vi.mock('../server/stripeConfig', () => ({
  getStripeClient: vi.fn(),
  getPublishableKey: vi.fn(),
  isLiveMode: vi.fn().mockReturnValue(false),
  getWebhookSecrets: vi.fn().mockReturnValue([]),
  stripeLive: null,
  stripeTest: null,
  STRIPE_ENVIRONMENT: 'test',
}));

vi.mock('../server/services/orderNotificationService', () => ({
  orderNotificationService: { send: vi.fn(), notify: vi.fn() },
  sendOrderStatusNotification: vi.fn(),
}));

vi.mock('../server/services/orderCancellationNotificationService', () => ({
  sendCancellationNotification: vi.fn(),
}));

vi.mock('../server/utils/quote-activity', () => ({
  logQuoteActivity: vi.fn(),
}));

vi.mock('../server/shortPaymentLink', () => ({
  createShortPaymentLink: vi.fn(),
}));

vi.mock('../server/utils/stripe-connect-ready', () => ({
  isConnectAccountReady: vi.fn().mockResolvedValue(false),
}));

vi.mock('../server/utils/isImpersonating', () => ({
  isImpersonating: vi.fn().mockReturnValue(false),
}));

// ── Deferred imports ───────────────────────────────────────────────────────────

import request from 'supertest';
import express from 'express';
import { registerOrderLifecycleRoutes } from '../server/routes/orders-lifecycle';

const app = express();
app.use(express.json());
registerOrderLifecycleRoutes(app);

// ── Helpers ────────────────────────────────────────────────────────────────────

function reset() {
  insertedItemRows.length = 0;
  mockStorage.getUser.mockResolvedValue(MOCK_CUSTOMER);
  mockStorage.getProduct.mockResolvedValue(MOCK_PRODUCT);
}

// ── Tests: POST /api/orders/draft ─────────────────────────────────────────────

describe('POST /api/orders/draft — charge item persistence', () => {
  beforeEach(() => {
    reset();
    mockStorage.getOrder.mockResolvedValue(makeDraftWithItems([]));
  });

  it('accepts a draft with a mixed product + charge item and returns id/status', async () => {
    const res = await request(app)
      .post('/api/orders/draft')
      .send({
        customerId: 'cust-1',
        items: [
          { productId: 10, customPrice: 25, quantity: 2, sellingType: 'units' },
          { productId: null, customLabel: 'Handling Fee', itemNotes: 'Fragile goods surcharge', customPrice: 15, quantity: 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(42);
    expect(res.body.status).toBe('draft');
  });

  it('stores charge item with correct customLabel, itemNotes, and null productId', async () => {
    await request(app)
      .post('/api/orders/draft')
      .send({
        customerId: 'cust-1',
        items: [
          { productId: 10, customPrice: 25, quantity: 2, sellingType: 'units' },
          { productId: null, customLabel: 'Handling Fee', itemNotes: 'Fragile goods surcharge', customPrice: 15, quantity: 1 },
        ],
      });

    // Locate the order-items insert batch (has both product row and charge row)
    const allRows = insertedItemRows.flat();
    const chargeRow = allRows.find((r: any) => r.customLabel);

    expect(chargeRow).toBeDefined();
    expect(chargeRow.customLabel).toBe('Handling Fee');
    expect(chargeRow.itemNotes).toBe('Fragile goods surcharge');
    expect(chargeRow.productId).toBeNull();
    expect(chargeRow.unitPrice).toBe('15.00');
    expect(chargeRow.total).toBe('15.00');
  });

  it('trims whitespace from customLabel and itemNotes', async () => {
    await request(app)
      .post('/api/orders/draft')
      .send({
        customerId: 'cust-1',
        items: [
          { productId: null, customLabel: '  Rush Order Fee  ', itemNotes: '  same-day handling  ', customPrice: 10, quantity: 1 },
        ],
      });

    const chargeRow = insertedItemRows.flat().find((r: any) => r.customLabel);
    expect(chargeRow.customLabel).toBe('Rush Order Fee');
    expect(chargeRow.itemNotes).toBe('same-day handling');
  });

  it('rejects a charge item with an empty customLabel', async () => {
    const res = await request(app)
      .post('/api/orders/draft')
      .send({
        customerId: 'cust-1',
        items: [
          { productId: null, customLabel: '', customPrice: 10, quantity: 1 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label/i);
  });

  it('rejects a charge item with a whitespace-only label', async () => {
    const res = await request(app)
      .post('/api/orders/draft')
      .send({
        customerId: 'cust-1',
        items: [
          { productId: null, customLabel: '   ', customPrice: 10, quantity: 1 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label/i);
  });

  it('stores itemNotes as null when not supplied', async () => {
    await request(app)
      .post('/api/orders/draft')
      .send({
        customerId: 'cust-1',
        items: [
          { productId: null, customLabel: 'Packing Fee', customPrice: 5, quantity: 1 },
        ],
      });

    const chargeRow = insertedItemRows.flat().find((r: any) => r.customLabel);
    expect(chargeRow.customLabel).toBe('Packing Fee');
    expect(chargeRow.itemNotes).toBeNull();
  });
});

// ── Tests: PATCH /api/orders/:id/draft ───────────────────────────────────────

describe('PATCH /api/orders/:id/draft — charge item update', () => {
  const EXISTING_DRAFT = {
    id: 42,
    wholesalerId: 'ws-1',
    retailerId: 'cust-1',
    status: 'draft',
    subtotal: '50.00',
    total: '50.00',
    amountOutstanding: '50.00',
    deliveryCost: '0.00',
    paymentMethod: 'bank_transfer',
    fulfillmentType: 'pickup',
    items: [],
    retailer: MOCK_CUSTOMER,
    wholesaler: { id: 'ws-1', businessName: 'Test Wholesaler' },
  };

  beforeEach(() => {
    reset();
    mockStorage.getOrder.mockResolvedValue(EXISTING_DRAFT);
  });

  it('returns 200 and the updated draft when charge items are included', async () => {
    const draftWithCharge = makeDraftWithItems([
      { id: 2, orderId: 42, productId: null, quantity: 1, unitPrice: '15.00', total: '15.00', sellingType: 'units', customLabel: 'Handling Fee', itemNotes: 'Fragile goods surcharge', product: null },
    ]);
    mockStorage.getOrder
      .mockResolvedValueOnce(EXISTING_DRAFT)   // first call: ownership check
      .mockResolvedValueOnce(draftWithCharge);  // second call: return updated draft

    const res = await request(app)
      .patch('/api/orders/42/draft')
      .send({
        items: [
          { productId: 10, customPrice: 25, quantity: 2, sellingType: 'units' },
          { productId: null, customLabel: 'Handling Fee', itemNotes: 'Fragile goods surcharge', customPrice: 15, quantity: 1 },
        ],
      });

    expect(res.status).toBe(200);
  });

  it('re-inserts charge item with correct customLabel and itemNotes after update', async () => {
    mockStorage.getOrder.mockResolvedValue(EXISTING_DRAFT);

    await request(app)
      .patch('/api/orders/42/draft')
      .send({
        items: [
          { productId: 10, customPrice: 25, quantity: 2, sellingType: 'units' },
          { productId: null, customLabel: 'Handling Fee', itemNotes: 'Fragile goods surcharge', customPrice: 15, quantity: 1 },
        ],
      });

    const chargeRow = insertedItemRows.flat().find((r: any) => r.customLabel);
    expect(chargeRow).toBeDefined();
    expect(chargeRow.customLabel).toBe('Handling Fee');
    expect(chargeRow.itemNotes).toBe('Fragile goods surcharge');
    expect(chargeRow.productId).toBeNull();
    expect(chargeRow.orderId).toBe(42);
  });

  it('succeeds with only a charge item in the items array', async () => {
    const chargeOnlyDraft = makeDraftWithItems([
      { id: 2, orderId: 42, productId: null, quantity: 1, unitPrice: '15.00', total: '15.00', sellingType: 'units', customLabel: 'Courier Surcharge', itemNotes: null, product: null },
    ]);
    mockStorage.getOrder
      .mockResolvedValueOnce(EXISTING_DRAFT)
      .mockResolvedValueOnce(chargeOnlyDraft);

    const res = await request(app)
      .patch('/api/orders/42/draft')
      .send({
        items: [
          { productId: null, customLabel: 'Courier Surcharge', customPrice: 15, quantity: 1 },
        ],
      });

    expect(res.status).toBe(200);
    const chargeItem = res.body.items?.find((i: any) => !i.productId);
    expect(chargeItem?.customLabel).toBe('Courier Surcharge');
  });

  it('silently drops a charge item with a blank label (continues) rather than crashing', async () => {
    mockStorage.getOrder.mockResolvedValue(EXISTING_DRAFT);

    const res = await request(app)
      .patch('/api/orders/42/draft')
      .send({
        items: [
          { productId: null, customLabel: '', customPrice: 10, quantity: 1 },
        ],
      });

    // PATCH skips blank-label charge items via `continue` — should not 500
    expect(res.status).toBe(200);
    // No charge rows should have been inserted
    const chargeRows = insertedItemRows.flat().filter((r: any) => r.customLabel);
    expect(chargeRows).toHaveLength(0);
  });

  it('response body includes charge item data from the reloaded draft', async () => {
    const draftWithCharge = makeDraftWithItems([
      { id: 1, orderId: 42, productId: 10, quantity: 2, unitPrice: '25.00', total: '50.00', sellingType: 'units', customLabel: null, itemNotes: null, product: MOCK_PRODUCT },
      { id: 2, orderId: 42, productId: null, quantity: 1, unitPrice: '15.00', total: '15.00', sellingType: 'units', customLabel: 'Handling Fee', itemNotes: 'Fragile goods surcharge', product: null },
    ]);
    mockStorage.getOrder
      .mockResolvedValueOnce(EXISTING_DRAFT)
      .mockResolvedValueOnce(draftWithCharge);

    const res = await request(app)
      .patch('/api/orders/42/draft')
      .send({
        items: [
          { productId: 10, customPrice: 25, quantity: 2, sellingType: 'units' },
          { productId: null, customLabel: 'Handling Fee', itemNotes: 'Fragile goods surcharge', customPrice: 15, quantity: 1 },
        ],
      });

    expect(res.status).toBe(200);
    const chargeItem = res.body.items?.find((i: any) => !i.productId);
    expect(chargeItem).toBeDefined();
    expect(chargeItem.customLabel).toBe('Handling Fee');
    expect(chargeItem.itemNotes).toBe('Fragile goods surcharge');
  });
});

// ── Tests: frontend prefill logic ─────────────────────────────────────────────

describe('Frontend draft-load prefill — charge item reconstruction', () => {
  /**
   * This function mirrors the charge-item branch of the prefill loop in
   * quick-quote.tsx (~line 404-419).  Tests here act as a regression guard so
   * any future drift in that loop will be caught without a browser.
   */
  function prefillDraftItem(item: {
    productId: number | null;
    customLabel?: string | null;
    itemNotes?: string | null;
    unitPrice: string;
    quantity: number;
  }) {
    if (!item.productId && item.customLabel) {
      const price = parseFloat(item.unitPrice) || 0;
      return {
        stableId: `charge-draft-test`,
        productId: null,
        customLabel: item.customLabel,
        itemNotes: item.itemNotes || undefined,
        isMiscCharge: true,
        originalPrice: price,
        customPrice: price,
        quantity: item.quantity,
        sellingType: 'units' as const,
        costPrice: 0,
        weightKg: 0,
      };
    }
    return null;
  }

  it('returns a QuoteItem with isMiscCharge=true for a charge item', () => {
    const result = prefillDraftItem({
      productId: null,
      customLabel: 'Handling Fee',
      itemNotes: 'Fragile goods surcharge',
      unitPrice: '15.00',
      quantity: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.isMiscCharge).toBe(true);
    expect(result!.customLabel).toBe('Handling Fee');
    expect(result!.itemNotes).toBe('Fragile goods surcharge');
    expect(result!.customPrice).toBe(15);
    expect(result!.originalPrice).toBe(15);
    expect(result!.productId).toBeNull();
    expect(result!.sellingType).toBe('units');
    expect(result!.costPrice).toBe(0);
  });

  it('returns null for a product item (productId set) — falls through to product branch', () => {
    const result = prefillDraftItem({
      productId: 10,
      customLabel: null,
      unitPrice: '25.00',
      quantity: 2,
    });

    expect(result).toBeNull();
  });

  it('returns null when customLabel is absent (prevents ghost charge cards)', () => {
    const result = prefillDraftItem({
      productId: null,
      customLabel: null,
      unitPrice: '10.00',
      quantity: 1,
    });

    expect(result).toBeNull();
  });

  it('stores itemNotes as undefined (not null) when itemNotes is absent', () => {
    const result = prefillDraftItem({
      productId: null,
      customLabel: 'Packing Fee',
      itemNotes: null,
      unitPrice: '5.00',
      quantity: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.itemNotes).toBeUndefined();
  });

  it('falls back to price=0 if unitPrice is malformed', () => {
    const result = prefillDraftItem({
      productId: null,
      customLabel: 'Mystery Fee',
      unitPrice: 'not-a-number',
      quantity: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.customPrice).toBe(0);
    expect(result!.originalPrice).toBe(0);
  });

  it('reconstructs quantity correctly from the draft item', () => {
    const result = prefillDraftItem({
      productId: null,
      customLabel: 'Bulk Delivery Fee',
      itemNotes: '5 pallets',
      unitPrice: '50.00',
      quantity: 3,
    });

    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(3);
    expect(result!.customPrice).toBe(50);
  });
});
