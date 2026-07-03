import { describe, expect, it } from 'vitest';
import { getOfflinePaymentDefaultAmount, hasRecordedOnlinePayment } from '../client/src/lib/order-payment-balances';

describe('order payment balance helpers', () => {
  it('defaults to stored outstanding when an online payment has already been recorded', () => {
    const order = {
      subtotal: '126.50',
      deliveryCost: '0.00',
      amountPaid: '106.00',
      amountOutstanding: '26.50',
      paymentMethod: 'payment_link',
      customerTransactionFee: '6.00',
    };

    expect(hasRecordedOnlinePayment(order)).toBe(true);
    expect(getOfflinePaymentDefaultAmount(order)).toBe('26.50');
  });

  it('defaults to fee-free cash balance when a payment link exists but no online payment was recorded', () => {
    const order = {
      subtotal: '100.00',
      deliveryCost: '10.00',
      amountPaid: '0.00',
      amountOutstanding: '116.55',
      paymentMethod: 'payment_link',
      customerTransactionFee: '6.55',
    };

    expect(hasRecordedOnlinePayment(order)).toBe(false);
    expect(getOfflinePaymentDefaultAmount(order)).toBe('110.00');
  });

  it('defaults to fee-free remaining balance for pure offline part payments', () => {
    expect(getOfflinePaymentDefaultAmount({
      subtotal: '100.00',
      deliveryCost: '5.00',
      amountPaid: '40.00',
      amountOutstanding: '80.00',
      paymentMethod: 'cash',
    })).toBe('65.00');
  });

  it('subtracts invoiceDiscount from the offline base before pre-filling', () => {
    expect(getOfflinePaymentDefaultAmount({
      subtotal: '100.00',
      deliveryCost: '10.00',
      invoiceDiscount: '15.00',
      amountPaid: '0.00',
      paymentMethod: 'cash',
    })).toBe('95.00');
  });
});