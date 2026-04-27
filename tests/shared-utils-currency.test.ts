import { describe, expect, it } from 'vitest';
import { formatCurrency, getCurrencySymbol, formatNumber } from '../shared/utils/currency';

describe('formatCurrency', () => {
  it('formats a whole number in GBP by default', () => {
    expect(formatCurrency(10)).toBe('£10.00');
  });

  it('formats a decimal amount in GBP', () => {
    expect(formatCurrency(9.99)).toBe('£9.99');
  });

  it('formats a numeric string', () => {
    expect(formatCurrency('25.50')).toBe('£25.50');
  });

  it('formats amounts over 1000 with comma separators', () => {
    expect(formatCurrency(1234.56)).toBe('£1,234.56');
  });

  it('formats amounts over 1 million with comma separators', () => {
    expect(formatCurrency(1000000)).toBe('£1,000,000.00');
  });

  it('returns £0.00 for zero', () => {
    expect(formatCurrency(0)).toBe('£0.00');
  });

  it('returns £0.00 for the string "0"', () => {
    expect(formatCurrency('0')).toBe('£0.00');
  });

  it('returns £0.00 for an empty string', () => {
    expect(formatCurrency('')).toBe('£0.00');
  });

  it('returns £0.00 for NaN input', () => {
    expect(formatCurrency('not-a-number')).toBe('£0.00');
  });

  it('formats USD correctly', () => {
    expect(formatCurrency(10, 'USD')).toBe('US$10.00');
  });

  it('formats EUR correctly', () => {
    expect(formatCurrency(10, 'EUR')).toBe('€10.00');
  });
});

describe('getCurrencySymbol', () => {
  it('returns £ for GBP (default)', () => {
    expect(getCurrencySymbol()).toBe('£');
  });

  it('returns £ for explicit GBP', () => {
    expect(getCurrencySymbol('GBP')).toBe('£');
  });

  it('returns a symbol for USD', () => {
    const symbol = getCurrencySymbol('USD');
    expect(typeof symbol).toBe('string');
    expect(symbol.length).toBeGreaterThan(0);
  });

  it('returns a symbol for EUR', () => {
    const symbol = getCurrencySymbol('EUR');
    expect(typeof symbol).toBe('string');
    expect(symbol.length).toBeGreaterThan(0);
  });

  it('returns £ when called with an empty string (fallback)', () => {
    expect(getCurrencySymbol('')).toBe('£');
  });
});

describe('formatNumber', () => {
  it('formats a small integer', () => {
    expect(formatNumber(42)).toBe('42');
  });

  it('formats a number over 1000 with commas', () => {
    expect(formatNumber(1500)).toBe('1,500');
  });

  it('formats a number over 1 million with commas', () => {
    expect(formatNumber(1000000)).toBe('1,000,000');
  });

  it('parses and formats a numeric string', () => {
    expect(formatNumber('2500')).toBe('2,500');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
});
