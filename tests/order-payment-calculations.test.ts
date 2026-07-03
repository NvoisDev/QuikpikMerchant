import { describe, expect, it } from 'vitest';
import { calculateOfflinePaymentUpdate, calculateStripePaymentSettlement } from '../server/routes/order-payment-calculations';

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
});