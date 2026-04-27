/**
 * Integration tests for the checkout fee composition used by the marketplace
 * payment route (server/routes/marketplace.ts).
 *
 * The route delegates all monetary arithmetic to calculateCheckoutTotals,
 * so these tests exercise the same logic path and will catch any silent
 * breakage when rates change in shared/utils/fees.ts.
 *
 * Required scenarios: standard delivery order, pickup order, zero-value coupon.
 */

import { describe, expect, it } from 'vitest';
import { calculateCheckoutTotals } from '../server/routes/checkout-fee-calculations';
import { CUSTOMER_FEE_RATE, CUSTOMER_FEE_FIXED, PLATFORM_FEE_RATE } from '../shared/utils/fees';

describe('checkout fee composition — standard delivery order', () => {
  // £100 products + £10 delivery
  const result = calculateCheckoutTotals({ productSubtotal: 100, deliveryCost: 10 });

  it('amountBeforeFees combines subtotal and delivery', () => {
    expect(result.amountBeforeFees).toBe(110);
  });

  it('customer fee is 5.5% of £110 plus £0.50 fixed', () => {
    expect(result.customerTransactionFee).toBeCloseTo(110 * CUSTOMER_FEE_RATE + CUSTOMER_FEE_FIXED, 6);
  });

  it('total customer pays is amountBeforeFees plus the customer fee', () => {
    expect(result.totalCustomerPays).toBeCloseTo(110 + 110 * CUSTOMER_FEE_RATE + CUSTOMER_FEE_FIXED, 6);
  });

  it('wholesaler platform fee is 4.6% of £110', () => {
    expect(result.wholesalerPlatformFee).toBeCloseTo(110 * PLATFORM_FEE_RATE, 6);
  });

  it('wholesalerReceives is amountBeforeFees minus platform fee', () => {
    expect(result.wholesalerReceives).toBeCloseTo(110 - 110 * PLATFORM_FEE_RATE, 6);
  });

  it('stripeAmountPence is totalCustomerPays converted to integer pence', () => {
    expect(result.stripeAmountPence).toBe(Math.round(result.totalCustomerPays * 100));
    expect(Number.isInteger(result.stripeAmountPence)).toBe(true);
  });

  it('stripeApplicationFeePence is wholesalerPlatformFee converted to integer pence', () => {
    expect(result.stripeApplicationFeePence).toBe(Math.round(result.wholesalerPlatformFee * 100));
    expect(Number.isInteger(result.stripeApplicationFeePence)).toBe(true);
  });
});

describe('checkout fee composition — pickup order (zero delivery)', () => {
  // £50 products, customer collects — no delivery charge
  const result = calculateCheckoutTotals({ productSubtotal: 50, deliveryCost: 0 });

  it('amountBeforeFees equals productSubtotal when deliveryCost is zero', () => {
    expect(result.amountBeforeFees).toBe(50);
  });

  it('customer fee is 5.5% of £50 plus £0.50 fixed', () => {
    expect(result.customerTransactionFee).toBeCloseTo(50 * CUSTOMER_FEE_RATE + CUSTOMER_FEE_FIXED, 6);
  });

  it('total customer pays is £50 plus the customer fee', () => {
    expect(result.totalCustomerPays).toBeCloseTo(50 + 50 * CUSTOMER_FEE_RATE + CUSTOMER_FEE_FIXED, 6);
  });

  it('wholesaler platform fee is 4.6% of £50', () => {
    expect(result.wholesalerPlatformFee).toBeCloseTo(50 * PLATFORM_FEE_RATE, 6);
  });

  it('stripeAmountPence is a positive integer', () => {
    expect(result.stripeAmountPence).toBeGreaterThan(0);
    expect(Number.isInteger(result.stripeAmountPence)).toBe(true);
  });

  it('pickup order charges less than an equivalent delivery order', () => {
    const delivery = calculateCheckoutTotals({ productSubtotal: 50, deliveryCost: 10 });
    expect(result.stripeAmountPence).toBeLessThan(delivery.stripeAmountPence);
  });
});

describe('checkout fee composition — zero-value coupon edge case', () => {
  // Coupon applied but has zero face value — should produce identical output to no coupon
  const withZeroCoupon = calculateCheckoutTotals({ productSubtotal: 80, deliveryCost: 5, couponDiscount: 0 });
  const noCoupon = calculateCheckoutTotals({ productSubtotal: 80, deliveryCost: 5 });

  it('a zero-value coupon does not change amountBeforeFees', () => {
    expect(withZeroCoupon.amountBeforeFees).toBe(noCoupon.amountBeforeFees);
  });

  it('a zero-value coupon does not change the customer fee', () => {
    expect(withZeroCoupon.customerTransactionFee).toBe(noCoupon.customerTransactionFee);
  });

  it('a zero-value coupon does not change the Stripe pence amount', () => {
    expect(withZeroCoupon.stripeAmountPence).toBe(noCoupon.stripeAmountPence);
  });

  it('a zero-value coupon does not change the platform fee', () => {
    expect(withZeroCoupon.wholesalerPlatformFee).toBe(noCoupon.wholesalerPlatformFee);
  });

  it('stripeAmountPence is still a positive integer with a zero-value coupon', () => {
    expect(withZeroCoupon.stripeAmountPence).toBeGreaterThan(0);
    expect(Number.isInteger(withZeroCoupon.stripeAmountPence)).toBe(true);
  });
});
