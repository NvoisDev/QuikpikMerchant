import { describe, expect, it } from 'vitest';
import { calculateOfflinePaymentUpdate } from '../server/routes/order-payment-calculations';

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