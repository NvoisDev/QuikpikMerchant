/**
 * Regression tests for the cancellation-guard and partial-refund-guard inside
 * sendPaymentChasers() and runAutoFulfilJob() (server/payment-reminders.ts).
 *
 * Both functions share the same two guards:
 *   1. NOT EXISTS (pending cancellation_request) — skip orders with an open dispute
 *   2. amountRefunded <= 0 OR paymentStatus = 'refunded' — skip partial-refund-in-progress orders
 *
 * These tests exercise those guards end-to-end against the real database so that
 * if either guard is accidentally removed from one of the functions, a test breaks.
 *
 * All test rows use the "zz_test_chasergrd_" namespace and are cleaned up in afterAll.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { orders, users, orderCancellationRequests } from '@shared/schema';

// ── Mocks — must be declared before the module under test is imported ─────────

vi.mock('../server/sendgrid-service', () => ({
  sendChaserEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../server/sms-service', () => ({
  ReliableSMSService: {
    sendMarketingSMS: vi.fn().mockResolvedValue({ success: false }),
  },
}));

vi.mock('../server/shortPaymentLink', () => ({
  createShortPaymentLink: vi.fn().mockResolvedValue(''),
}));

vi.mock('../server/utils/quote-activity', () => ({
  logQuoteActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../server/stripeConfig', () => ({
  getStripeClient: vi.fn().mockReturnValue(null),
}));

vi.mock('../server/utils/stripe-connect-ready', () => ({
  isConnectAccountReady: vi.fn().mockReturnValue(false),
}));

vi.mock('../server/storage', () => ({
  storage: {
    updateOrderStatus: vi.fn().mockResolvedValue(undefined),
  },
}));

import { sendChaserEmail } from '../server/sendgrid-service';
import { ReliableSMSService } from '../server/sms-service';
import { storage } from '../server/storage';
import { sendPaymentChasers, runAutoFulfilJob } from '../server/payment-reminders';

// ── Test namespace ─────────────────────────────────────────────────────────────

const WHOLESALER_ID = 'zz_test_chasergrd_wholesaler';
const CUSTOMER_ID = 'zz_test_chasergrd_customer';

const createdOrderIds: number[] = [];
const createdCancellationIds: number[] = [];

// ── Helpers ────────────────────────────────────────────────────────────────────

async function seedUsers() {
  await db
    .insert(users)
    .values({
      id: WHOLESALER_ID,
      role: 'wholesaler',
      email: 'zz_test_chasergrd_ws@example.com',
      // chaserEnabled + interval 1 day so every overdue day fires
      notificationPreferences: {
        chaserEnabled: true,
        chaserIntervalDays: 1,
        chaserChannel: 'email',
        chaserMaxDays: null,
        chaserGraceDays: 0,
        // auto-fulfil config (used by runAutoFulfilJob tests)
        autoFulfilEnabled: true,
        autoFulfilDays: 1,
      },
    })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values({
      id: CUSTOMER_ID,
      role: 'customer',
      email: 'zz_test_chasergrd_cust@example.com',
    })
    .onConflictDoNothing();
}

/** Create an overdue order that would normally be picked up by sendPaymentChasers. */
async function makeOverdueOrder(overrides: Partial<{
  amountRefunded: string;
  paymentStatus: string;
}> = {}): Promise<number> {
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `ZZCHASE-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      wholesalerId: WHOLESALER_ID,
      retailerId: CUSTOMER_ID,
      customerName: 'zz_test Customer',
      customerEmail: 'zz_test_chasergrd_cust@example.com',
      status: 'pending',
      paymentStatus: overrides.paymentStatus ?? 'unpaid',
      fulfillmentType: 'pickup',
      subtotal: '100.00',
      platformFee: '0.00',
      total: '100.00',
      deliveryCost: '0.00',
      amountOutstanding: '100.00',
      amountPaid: '0.00',
      amountRefunded: overrides.amountRefunded ?? '0.00',
      chaserPaused: false,
      balanceDueDays: 1, // due 1 day after creation → already overdue
      createdAt: tenDaysAgo,
    })
    .returning({ id: orders.id });

  createdOrderIds.push(order.id);
  return order.id;
}

/** Create a paid order old enough for runAutoFulfilJob to target. */
async function makePaidOldOrder(overrides: Partial<{
  amountRefunded: string;
  paymentStatus: string;
}> = {}): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 - 1000);

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `ZZFULFIL-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      wholesalerId: WHOLESALER_ID,
      retailerId: CUSTOMER_ID,
      customerName: 'zz_test Customer',
      status: 'paid',
      paymentStatus: overrides.paymentStatus ?? 'paid',
      fulfillmentType: 'pickup',
      subtotal: '100.00',
      platformFee: '0.00',
      total: '100.00',
      deliveryCost: '0.00',
      amountOutstanding: '0.00',
      amountPaid: '100.00',
      amountRefunded: overrides.amountRefunded ?? '0.00',
      createdAt: thirtyDaysAgo,
    })
    .returning({ id: orders.id });

  createdOrderIds.push(order.id);
  return order.id;
}

async function addPendingCancellationRequest(orderId: number): Promise<number> {
  const [row] = await db
    .insert(orderCancellationRequests)
    .values({
      orderId,
      customerId: CUSTOMER_ID,
      wholesalerId: WHOLESALER_ID,
      reasonCategory: 'changed_mind',
      status: 'pending',
    })
    .returning({ id: orderCancellationRequests.id });

  createdCancellationIds.push(row.id);
  return row.id;
}

async function cleanup() {
  if (createdCancellationIds.length > 0) {
    await db
      .delete(orderCancellationRequests)
      .where(inArray(orderCancellationRequests.id, [...createdCancellationIds]));
    createdCancellationIds.length = 0;
  }
  if (createdOrderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, [...createdOrderIds]));
    createdOrderIds.length = 0;
  }
}

async function cleanupUsers() {
  await db.delete(users).where(inArray(users.id, [WHOLESALER_ID, CUSTOMER_ID]));
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('sendPaymentChasers — cancellation guards', () => {
  beforeAll(async () => {
    await seedUsers();
  });

  afterAll(async () => {
    await cleanup();
    await cleanupUsers();
  });

  beforeEach(async () => {
    await cleanup();
    vi.clearAllMocks();
  });

  it('sends a chaser email for a normal overdue order (control — guard is NOT active)', async () => {
    await makeOverdueOrder();

    await sendPaymentChasers();

    expect(sendChaserEmail).toHaveBeenCalledOnce();
  });

  it('skips an order that has a pending cancellation request — no email sent', async () => {
    const orderId = await makeOverdueOrder();
    await addPendingCancellationRequest(orderId);

    await sendPaymentChasers();

    expect(sendChaserEmail).not.toHaveBeenCalled();
  });

  it('skips an order with amountRefunded > 0 when paymentStatus is not "refunded" — no email sent', async () => {
    // Partial refund in progress: some money back but order is not fully refunded
    await makeOverdueOrder({ amountRefunded: '25.00', paymentStatus: 'part_paid' });

    await sendPaymentChasers();

    expect(sendChaserEmail).not.toHaveBeenCalled();
  });

  it('does NOT skip when cancellation request is approved (only pending requests block chasers)', async () => {
    const orderId = await makeOverdueOrder();
    // Insert an already-approved cancellation request — should not block the chaser
    const [row] = await db
      .insert(orderCancellationRequests)
      .values({
        orderId,
        customerId: CUSTOMER_ID,
        wholesalerId: WHOLESALER_ID,
        reasonCategory: 'changed_mind',
        status: 'approved',
      })
      .returning({ id: orderCancellationRequests.id });
    createdCancellationIds.push(row.id);

    await sendPaymentChasers();

    // Approved request does not block the chaser
    expect(sendChaserEmail).toHaveBeenCalledOnce();
  });

  it('does not send SMS when the order has a pending cancellation request', async () => {
    const orderId = await makeOverdueOrder();
    await addPendingCancellationRequest(orderId);

    await sendPaymentChasers();

    expect(ReliableSMSService.sendMarketingSMS).not.toHaveBeenCalled();
  });
});

describe('runAutoFulfilJob — cancellation guards', () => {
  beforeAll(async () => {
    await seedUsers();
  });

  afterAll(async () => {
    await cleanup();
    await cleanupUsers();
  });

  beforeEach(async () => {
    await cleanup();
    vi.clearAllMocks();
  });

  it('auto-fulfils a qualifying paid order (control — guard is NOT active)', async () => {
    await makePaidOldOrder();

    await runAutoFulfilJob();

    expect(storage.updateOrderStatus).toHaveBeenCalled();
  });

  it('skips a paid order that has a pending cancellation request — updateOrderStatus not called', async () => {
    const orderId = await makePaidOldOrder();
    await addPendingCancellationRequest(orderId);

    await runAutoFulfilJob();

    expect(storage.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('skips a paid order with amountRefunded > 0 when paymentStatus is not "refunded"', async () => {
    // Represents a partial refund in progress on an otherwise-paid order
    await makePaidOldOrder({ amountRefunded: '20.00', paymentStatus: 'paid' });

    await runAutoFulfilJob();

    expect(storage.updateOrderStatus).not.toHaveBeenCalled();
  });
});
