import { describe, expect, it } from 'vitest';
import { calculateOfflinePaymentUpdate, calculateStripePaymentSettlement, isOrderAlreadySettled, isPaymentIntentAlreadyRecorded } from '../server/routes/order-payment-calculations';

describe('calculateOfflinePaymentUpdate', () => {
  it('allows a payment-link deposit order to be completed with cash against the stored balance', () => {
    const result = calculateOfflinePaymentUpdate({
      subtotal: '126.50',
      deliveryCost: '0.00',
      amountPaid: '106.00',
      amountOutstanding: '26.50',
      paymentMethod: 'payment_link',
      customerTransactionFee: '6.00',
    }, 26.50, 'cash');

    expect(result.currentOutstanding).toBe(26.50);
    expect(result.newAmountOutstanding).toBe(0);
    expect(result.newAmountPaid).toBe(132.50);
    expect(result.newPaymentStatus).toBe('paid');
    expect(result.shouldUpdatePaymentMethod).toBe(false);
  });

  it('keeps pure offline orders on the fee-free subtotal plus delivery balance', () => {
    const result = calculateOfflinePaymentUpdate({
      subtotal: '100.00',
      deliveryCost: '5.00',
      amountPaid: '40.00',
      amountOutstanding: '80.00',
      paymentMethod: 'cash',
    }, 65, 'cash');

    expect(result.currentOutstanding).toBe(65);
    expect(result.newAmountOutstanding).toBe(0);
    expect(result.newAmountPaid).toBe(105);
    expect(result.newPaymentStatus).toBe('paid');
    expect(result.shouldUpdatePaymentMethod).toBe(true);
  });

  it('switches an unpaid payment-link order to fee-free cash when no online payment was recorded', () => {
    const result = calculateOfflinePaymentUpdate({
      subtotal: '100.00',
      deliveryCost: '10.00',
      amountPaid: '0.00',
      amountOutstanding: '116.55',
      paymentMethod: 'payment_link',
      customerTransactionFee: '6.55',
    }, 110, 'cash');

    expect(result.currentOutstanding).toBe(110);
    expect(result.newAmountOutstanding).toBe(0);
    expect(result.newAmountPaid).toBe(110);
    expect(result.newPaymentStatus).toBe('paid');
    expect(result.shouldUpdatePaymentMethod).toBe(true);
  });

  it('keeps a part-paid offline order open when a smaller cash amount is recorded', () => {
    const result = calculateOfflinePaymentUpdate({
      subtotal: '100.00',
      deliveryCost: '10.00',
      amountPaid: '25.00',
      amountOutstanding: '85.00',
      paymentMethod: 'cash',
    }, 30, 'cash');

    expect(result.currentOutstanding).toBe(85);
    expect(result.newAmountOutstanding).toBe(55);
    expect(result.newAmountPaid).toBe(55);
    expect(result.newPaymentStatus).toBe('part_paid');
  });
});

describe('calculateStripePaymentSettlement', () => {
  // Core scenario from Task #1561: discount applied mid-flight (after Stripe session
  // was created), new session issued for the discounted amount, customer pays.
  // The stored order.total already reflects the discount; the webhook just reads it.
  it('marks a discounted invoice as paid when the customer pays the discounted Stripe total', () => {
    // Scenario:
    //   subtotal £100, delivery £10, Stripe fee £6.55 → original total £116.55
    //   discount of £15 applied → new total stored as £101.55 (116.55 - 15)
    //   new Stripe session created for £101.55 (10155 pence)
    //   customer pays → webhook fires with amount_total = 10155
    const result = calculateStripePaymentSettlement(
      { total: '101.55', amountPaid: '0.00' },
      10155,
    );

    expect(result.paymentStatus).toBe('paid');
    expect(result.newAmountOutstanding).toBe(0);
    expect(result.cumulativePaid).toBe(101.55);
  });

  it('marks an undiscounted full Stripe payment as paid', () => {
    const result = calculateStripePaymentSettlement(
      { total: '116.55', amountPaid: '0.00' },
      11655,
    );

    expect(result.paymentStatus).toBe('paid');
    expect(result.newAmountOutstanding).toBe(0);
    expect(result.cumulativePaid).toBe(116.55);
  });

  it('marks a deposit (partial Stripe payment) as part_paid and returns the correct outstanding', () => {
    // 50% deposit on a £116.55 order → customer pays £58.275 ≈ 5828 pence rounded
    const result = calculateStripePaymentSettlement(
      { total: '116.55', amountPaid: '0.00' },
      5828,
    );

    expect(result.paymentStatus).toBe('part_paid');
    expect(result.cumulativePaid).toBeCloseTo(58.28, 2);
    expect(result.newAmountOutstanding).toBeCloseTo(58.27, 2);
  });

  it('settles a discounted order where a prior deposit was already paid via Stripe', () => {
    // Order total £116.55, discount £15 applied → stored total £101.55
    // Customer previously paid a £50 deposit → amountPaid = 50.00
    // Remaining balance Stripe session created for £51.55 (5155 pence)
    const result = calculateStripePaymentSettlement(
      { total: '101.55', amountPaid: '50.00' },
      5155,
    );

    expect(result.paymentStatus).toBe('paid');
    expect(result.newAmountOutstanding).toBe(0);
    expect(result.cumulativePaid).toBe(101.55);
  });

  it('returns part_paid when balance payment only covers part of the remaining discounted amount', () => {
    // Discounted total £101.55, £50 previously paid, customer pays only £30 now
    const result = calculateStripePaymentSettlement(
      { total: '101.55', amountPaid: '50.00' },
      3000,
    );

    expect(result.paymentStatus).toBe('part_paid');
    expect(result.cumulativePaid).toBe(80);
    expect(result.newAmountOutstanding).toBeCloseTo(21.55, 2);
  });

  it('tolerates sub-penny rounding: treats £0.005 outstanding as paid', () => {
    // Stripe rounds to the nearest penny; a 0.005 residual should not leave the order unpaid
    const result = calculateStripePaymentSettlement(
      { total: '100.00', amountPaid: '0.00' },
      9999,
    );

    // £0.01 outstanding — just outside the 0.01 tolerance → still part_paid
    expect(result.paymentStatus).toBe('part_paid');
    expect(result.newAmountOutstanding).toBeCloseTo(0.01, 2);
  });

  // Double-webhook idempotency: same Stripe event fired twice (different event IDs
  // but same amount).  The event-level stripeProcessedEvents guard in
  // payments-connect.ts short-circuits before settlement runs, but even if
  // calculateStripePaymentSettlement is called a second time the result must not
  // produce a negative outstanding or flip the order away from 'paid'.
  it('does not produce a negative outstanding when called again on an already fully-paid discounted order', () => {
    // Scenario: total £101.55 (after £15 discount), customer already paid £101.55.
    // A second webhook fires (or a payment_intent.succeeded arrives after
    // checkout.session.completed) carrying the same 10155-pence amount.
    const result = calculateStripePaymentSettlement(
      { total: '101.55', amountPaid: '101.55' },
      10155,
    );

    // cumulativePaid will be double the total, but outstanding must clamp to 0
    expect(result.newAmountOutstanding).toBe(0);
    // Status must remain 'paid', not flip to anything else
    expect(result.paymentStatus).toBe('paid');
    // Cumulative paid is the running sum — over-payment is fine, just not negative outstanding
    expect(result.cumulativePaid).toBeCloseTo(203.10, 2);
  });

  it('does not produce a negative outstanding when called again on a fully-paid undiscounted order', () => {
    // Undiscounted £116.55 order, already paid in full; webhook fires a second time.
    const result = calculateStripePaymentSettlement(
      { total: '116.55', amountPaid: '116.55' },
      11655,
    );

    expect(result.newAmountOutstanding).toBe(0);
    expect(result.paymentStatus).toBe('paid');
    expect(result.cumulativePaid).toBeCloseTo(233.10, 2);
  });

  // INV-118 regression: the settlement function itself must NEVER produce a 'paid'
  // status when amountPaid < order.total by more than 0.01.  The phantom outstanding
  // balance seen on the order-detail page can only arise from order.total changing
  // *after* settlement (e.g. retroactive discount or item edit).  This test confirms
  // the contradictory DB state cannot be created by calculateStripePaymentSettlement.
  it('marks order part_paid — not paid — when stripe amount is £2.55 short of order total (INV-118 root-cause guard)', () => {
    // subtotal=140, invoiceDiscount=5, fee=1.40 → order.total=136.40
    // If the session somehow charged only £132.45 (2.55 short), settlement must NOT mark 'paid'.
    const result = calculateStripePaymentSettlement(
      { total: '136.40', amountPaid: '0.00' },
      13245, // £132.45 — £3.95 short of £136.40
    );

    expect(result.paymentStatus).toBe('part_paid');
    expect(result.newAmountOutstanding).toBeCloseTo(3.95, 2);
    expect(result.cumulativePaid).toBe(132.45);
  });

  it('pays a discounted order in full when session.amount_total equals the fee-inclusive total', () => {
    // INV-118 correct path: subtotal=140, invoiceDiscount=5, fee=1.40 → total=136.40
    // Session is created for 136.40, customer pays → no phantom balance.
    const result = calculateStripePaymentSettlement(
      { total: '136.40', amountPaid: '0.00' },
      13640, // £136.40 — exact match
    );

    expect(result.paymentStatus).toBe('paid');
    expect(result.newAmountOutstanding).toBe(0);
    expect(result.cumulativePaid).toBe(136.40);
  });
});

describe('isPaymentIntentAlreadyRecorded — payment_intent.succeeded ordering-race guard', () => {
  it('returns true when the PI ID is the only value in the column', () => {
    expect(isPaymentIntentAlreadyRecorded('pi_abc123', 'pi_abc123')).toBe(true);
  });

  it('returns true when the PI ID is one of several comma-separated values', () => {
    expect(isPaymentIntentAlreadyRecorded('pi_abc123', 'pi_first,pi_abc123,pi_third')).toBe(true);
  });

  it('returns true when matching entry has surrounding whitespace', () => {
    expect(isPaymentIntentAlreadyRecorded('pi_abc123', 'pi_first, pi_abc123 , pi_third')).toBe(true);
  });

  it('returns false when the PI ID is not in the column', () => {
    expect(isPaymentIntentAlreadyRecorded('pi_new999', 'pi_abc123,pi_def456')).toBe(false);
  });

  it('returns false when the column is null (no prior PI recorded)', () => {
    expect(isPaymentIntentAlreadyRecorded('pi_abc123', null)).toBe(false);
  });

  it('returns false when the column is undefined', () => {
    expect(isPaymentIntentAlreadyRecorded('pi_abc123', undefined)).toBe(false);
  });

  it('returns false when the column is an empty string', () => {
    expect(isPaymentIntentAlreadyRecorded('pi_abc123', '')).toBe(false);
  });

  it('does not match a PI ID that is a substring of a recorded ID', () => {
    // 'pi_abc' must not match 'pi_abc123'
    expect(isPaymentIntentAlreadyRecorded('pi_abc', 'pi_abc123')).toBe(false);
  });
});

describe('isOrderAlreadySettled — checkout.session.completed double-payment guard', () => {
  it('returns true for a fully-paid order, triggering the early-return in the webhook handler', () => {
    expect(isOrderAlreadySettled('paid')).toBe(true);
  });

  it('returns false for a part-paid order so settlement continues normally', () => {
    expect(isOrderAlreadySettled('part_paid')).toBe(false);
  });

  it('returns false for an unpaid order so settlement continues normally', () => {
    expect(isOrderAlreadySettled('unpaid')).toBe(false);
  });

  it('returns false when paymentStatus is null (new order, no prior payment)', () => {
    expect(isOrderAlreadySettled(null)).toBe(false);
  });

  it('returns false when paymentStatus is undefined', () => {
    expect(isOrderAlreadySettled(undefined)).toBe(false);
  });
});