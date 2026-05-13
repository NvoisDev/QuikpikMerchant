import { describe, expect, it } from 'vitest';
import { calculateCustomerFee, calculatePlatformFee, CUSTOMER_FEE_RATE, CUSTOMER_FEE_FIXED, PLATFORM_FEE_RATE, PLATFORM_FEE_FIXED } from '../shared/utils/fees';

describe('calculateCustomerFee', () => {
  it('calculates fee for a typical order with delivery', () => {
    const fee = calculateCustomerFee(100, 10);
    expect(fee).toBeCloseTo((110 * CUSTOMER_FEE_RATE) + CUSTOMER_FEE_FIXED, 10);
  });

  it('calculates fee for a pickup order (zero delivery)', () => {
    const fee = calculateCustomerFee(50, 0);
    expect(fee).toBeCloseTo((50 * CUSTOMER_FEE_RATE) + CUSTOMER_FEE_FIXED, 10);
  });

  it('returns only the fixed charge for a zero subtotal and zero delivery', () => {
    const fee = calculateCustomerFee(0, 0);
    expect(fee).toBeCloseTo(CUSTOMER_FEE_FIXED, 10);
  });

  it('applies the percentage to the combined subtotal and delivery', () => {
    const fee = calculateCustomerFee(200, 15);
    expect(fee).toBeCloseTo((215 * CUSTOMER_FEE_RATE) + CUSTOMER_FEE_FIXED, 10);
  });

  it('handles fractional penny amounts without throwing', () => {
    expect(() => calculateCustomerFee(99.99, 4.99)).not.toThrow();
  });
});

describe('calculatePlatformFee', () => {
  it('calculates the platform fee for a typical subtotal', () => {
    const fee = calculatePlatformFee(100);
    expect(fee).toBeCloseTo(100 * PLATFORM_FEE_RATE + PLATFORM_FEE_FIXED, 10);
  });

  it('returns only the fixed charge for a zero subtotal', () => {
    expect(calculatePlatformFee(0)).toBeCloseTo(PLATFORM_FEE_FIXED, 10);
  });

  it('scales correctly with larger subtotals', () => {
    const fee = calculatePlatformFee(500);
    expect(fee).toBeCloseTo(500 * PLATFORM_FEE_RATE + PLATFORM_FEE_FIXED, 10);
  });

  it('handles fractional subtotals without throwing', () => {
    expect(() => calculatePlatformFee(123.45)).not.toThrow();
  });
});
