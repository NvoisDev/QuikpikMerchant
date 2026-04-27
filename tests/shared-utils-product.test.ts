import { describe, expect, it } from 'vitest';
import { getPackQuantity } from '../shared/utils/product';

describe('getPackQuantity', () => {
  it('returns packQuantity when present as a number', () => {
    expect(getPackQuantity({ packQuantity: 6, quantityInPack: 12 })).toBe(6);
  });

  it('returns packQuantity when present as a numeric string', () => {
    expect(getPackQuantity({ packQuantity: '4', quantityInPack: 10 })).toBe(4);
  });

  it('falls back to quantityInPack when packQuantity is null', () => {
    expect(getPackQuantity({ packQuantity: null, quantityInPack: 12 })).toBe(12);
  });

  it('falls back to quantityInPack when packQuantity is undefined', () => {
    expect(getPackQuantity({ quantityInPack: 8 })).toBe(8);
  });

  it('falls back to quantityInPack as a numeric string', () => {
    expect(getPackQuantity({ quantityInPack: '3' })).toBe(3);
  });

  it('returns null when both fields are null', () => {
    expect(getPackQuantity({ packQuantity: null, quantityInPack: null })).toBeNull();
  });

  it('returns null when both fields are undefined', () => {
    expect(getPackQuantity({})).toBeNull();
  });

  it('returns zero when packQuantity is explicitly 0', () => {
    expect(getPackQuantity({ packQuantity: 0, quantityInPack: 5 })).toBe(0);
  });

  it('returns zero when quantityInPack is explicitly 0 and packQuantity is null', () => {
    expect(getPackQuantity({ packQuantity: null, quantityInPack: 0 })).toBe(0);
  });

  it('returns null for a non-numeric string', () => {
    expect(getPackQuantity({ packQuantity: 'abc' })).toBeNull();
  });
});
