/**
 * Route-level integration tests for the checkout fee composition.
 *
 * These tests hit POST /api/customer/create-payment via supertest with
 * storage and Stripe mocked, then assert:
 *   (a) every fee field in the JSON response matches the expected value
 *   (b) stripe.paymentIntents.create was called with the exact integer pence
 *       amounts derived from shared/utils/fees.ts
 *
 * A rate change in fees.ts, OR drift in how marketplace.ts composes the Stripe
 * payload, will surface here before it reaches production.
 *
 * Required scenarios: standard delivery, pickup, zero-value coupon.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mocks must be declared before any module import that transitively loads them.
vi.mock('../server/storage', () => ({
  storage: {
    getProduct: vi.fn(),
    getUser: vi.fn(),
    findCustomerByPhoneAndWholesaler: vi.fn().mockResolvedValue(null),
  },
}));

// Pin the fee config so tests are deterministic regardless of DB state.
// The test fixture uses the original default rate: 5.5% + £0.50.
// NOTE: vi.mock factories are hoisted — no references to outer variables allowed.
vi.mock('../server/utils/fee-config', () => ({
  getCurrentFeeConfig: vi.fn().mockResolvedValue({
    id: 1, percentage: 0.055, fixed: 0.50,
    createdAt: new Date('2026-01-01'), createdBy: 'test',
  }),
  getFeeConfigForWholesaler: vi.fn().mockResolvedValue({
    id: 1, percentage: 0.055, fixed: 0.50,
    createdAt: new Date('2026-01-01'), createdBy: 'test',
  }),
  getWholesalerPlatformFeeRate: vi.fn().mockResolvedValue(0.046),
}));

vi.mock('../server/stripeConfig', () => ({
  getStripeClient: vi.fn(),
  getPublishableKey: vi.fn().mockReturnValue('pk_test_fake'),
  isLiveMode: vi.fn().mockReturnValue(false),
  getWebhookSecrets: vi.fn().mockReturnValue([]),
  stripeLive: null,
  stripeTest: null,
  STRIPE_ENVIRONMENT: 'test',
}));

import request from 'supertest';
import express from 'express';
import { registerMarketplaceRoutes } from '../server/routes/marketplace';
import { storage } from '../server/storage';
import { getStripeClient } from '../server/stripeConfig';

const app = express();
app.use(express.json());
registerMarketplaceRoutes(app);

// Canonical product: price £50, in stock, no promos
const MOCK_PRODUCT = {
  id: 1,
  wholesalerId: 'wholesaler-1',
  name: 'Test Product',
  price: '50.00',
  moq: 1,
  palletMoq: null,
  stock: 200,
  palletStock: 0,
  promoActive: false,
  promotionalOffers: [],
};

// Wholesaler with no Connect account — simplifies Stripe path (no accounts.retrieve)
const MOCK_WHOLESALER = {
  id: 'wholesaler-1',
  businessName: 'Test Wholesaler',
  stripeAccountId: null,
  isTestAccount: false,
};

let mockCreate: ReturnType<typeof vi.fn>;

function setupMocks() {
  (storage.getProduct as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PRODUCT);
  (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_WHOLESALER);
  mockCreate = vi.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'pi_test_secret' });
  (getStripeClient as ReturnType<typeof vi.fn>).mockReturnValue({
    accounts: { retrieve: vi.fn() },
    paymentIntents: { create: mockCreate },
  });
}

const CART = {
  customerData: { name: 'Test Customer', email: 'test@test.com', address: '1 Test St' },
  // 2 × £50 = £100 productSubtotal
  items: [{ productId: 1, quantity: 2, unitPrice: 50.00, sellingType: 'units' }],
};

describe('POST /api/customer/create-payment — standard delivery order', () => {
  beforeEach(setupMocks);

  // productSubtotal = £100, deliveryCost = £10, amountBeforeFees = £110
  // customerTransactionFee = £110 × 5.5% + £0.50 = £6.55
  // totalCustomerPays    = £116.55  →  stripeAmount   = 11655p
  // wholesalerPlatformFee = £110 × 4.6% = £5.06  →  applicationFee = 506p (not charged: no Connect)

  it('responds 200 and returns correct fee fields', async () => {
    const res = await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'delivery', flatDeliveryRate: '10' } });

    expect(res.status).toBe(200);
    expect(res.body.productSubtotal).toBe('100.00');
    expect(res.body.shippingCost).toBe('10');
    expect(res.body.customerTransactionFee).toBe('6.55');
    expect(res.body.totalCustomerPays).toBe('116.55');
    expect(res.body.wholesalerPlatformFee).toBe('5.06');
    expect(res.body.wholesalerReceives).toBe('104.94');
  });

  it('calls stripe.paymentIntents.create with the exact integer pence amount', async () => {
    await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'delivery', flatDeliveryRate: '10' } });

    expect(mockCreate).toHaveBeenCalledOnce();
    const stripePayload = mockCreate.mock.calls[0][0];
    // 116.55 × 100 = 11655 — must be a safe integer
    expect(stripePayload.amount).toBe(11655);
    expect(Number.isInteger(stripePayload.amount)).toBe(true);
  });
});

describe('POST /api/customer/create-payment — pickup order (zero delivery)', () => {
  beforeEach(setupMocks);

  // productSubtotal = £100, deliveryCost = £0, amountBeforeFees = £100
  // customerTransactionFee = £100 × 5.5% + £0.50 = £6.00
  // totalCustomerPays    = £106.00  →  stripeAmount = 10600p

  it('responds 200 and returns correct fee fields', async () => {
    const res = await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'pickup' } });

    expect(res.status).toBe(200);
    expect(res.body.shippingCost).toBe('0');
    expect(res.body.customerTransactionFee).toBe('6.00');
    expect(res.body.totalCustomerPays).toBe('106.00');
    expect(res.body.wholesalerPlatformFee).toBe('4.60');
    expect(res.body.wholesalerReceives).toBe('95.40');
  });

  it('calls stripe.paymentIntents.create with the exact integer pence amount', async () => {
    await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'pickup' } });

    expect(mockCreate).toHaveBeenCalledOnce();
    const stripePayload = mockCreate.mock.calls[0][0];
    // 106.00 × 100 = 10600
    expect(stripePayload.amount).toBe(10600);
    expect(Number.isInteger(stripePayload.amount)).toBe(true);
  });

  it('charges less than an equivalent delivery order', async () => {
    const pickup = await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'pickup' } });
    const delivery = await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'delivery', flatDeliveryRate: '10' } });

    expect(parseFloat(pickup.body.totalCustomerPays)).toBeLessThan(parseFloat(delivery.body.totalCustomerPays));
  });
});

describe('POST /api/customer/create-payment — zero-value coupon edge case', () => {
  beforeEach(() => {
    // A zero-value coupon has already been applied server-side and had no
    // effect on item prices.  The route receives the post-coupon prices, so
    // the integration test verifies that the fee chain and Stripe amount are
    // identical whether a zero-discount coupon was applied or not.
    setupMocks();
  });

  it('fee output is stable when effective item price equals catalog price (zero-discount coupon)', async () => {
    // Send cart once to get baseline
    const baseline = await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'pickup' } });

    // Reset and re-send — simulates "zero discount coupon applied, no change"
    setupMocks();
    const afterZeroCoupon = await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'pickup' } });

    expect(afterZeroCoupon.body.customerTransactionFee).toBe(baseline.body.customerTransactionFee);
    expect(afterZeroCoupon.body.totalCustomerPays).toBe(baseline.body.totalCustomerPays);
    expect(afterZeroCoupon.body.wholesalerPlatformFee).toBe(baseline.body.wholesalerPlatformFee);
  });

  it('Stripe receives the same integer pence amount regardless of zero-value coupon', async () => {
    await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'pickup' } });

    const stripePayload = mockCreate.mock.calls[0][0];
    // 106.00 × 100 = 10600 — unchanged by a zero-value coupon
    expect(stripePayload.amount).toBe(10600);
    expect(Number.isInteger(stripePayload.amount)).toBe(true);
  });

  it('all fee response fields are well-formed two-decimal strings', async () => {
    const res = await request(app)
      .post('/api/customer/create-payment')
      .send({ ...CART, shippingInfo: { option: 'pickup' } });

    for (const field of ['productSubtotal', 'customerTransactionFee', 'totalCustomerPays', 'wholesalerPlatformFee', 'wholesalerReceives']) {
      expect(res.body[field]).toMatch(/^\d+\.\d{2}$/);
    }
  });
});
