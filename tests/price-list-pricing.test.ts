/**
 * Task #1427 — Price-list view always shows the correct customer price.
 *
 * The read-only price-list page (client/src/pages/price-list-detail.tsx) derives
 * the price a customer sees via `resolvePriceListRow` / `resolveUnitPrice`
 * (client/src/pages/price-list-pricing.ts). That MUST stay in lockstep with the
 * server's source of truth, `resolveCustomPrice`
 * (server/utils/price-resolution.ts).
 *
 * Covered behaviour:
 *   - a fixed custom price wins, including a custom price of 0
 *   - a percentage discount is applied and rounded to 2 decimal places
 *   - with neither, the standard product price is used
 *   - a missing/deleted product renders "—" (not £0)
 *   - the client resolver never diverges from the server resolver
 */

import { describe, it, expect } from 'vitest';
import {
  resolveUnitPrice,
  resolvePriceListRow,
  type PricingItem,
} from '@/pages/price-list-pricing';
import { resolveCustomPrice } from '../server/utils/price-resolution';

function item(overrides: Partial<PricingItem> = {}): PricingItem {
  return {
    customPrice: null,
    discountPercentage: null,
    product: { price: '10.00' },
    ...overrides,
  };
}

describe('resolveUnitPrice (client price resolution)', () => {
  it('uses a fixed custom price, overriding the standard price', () => {
    expect(resolveUnitPrice(item({ customPrice: '7.50' }))).toBe(7.5);
  });

  it('treats a custom price of 0 as a real price (free), not a fallback', () => {
    expect(resolveUnitPrice(item({ customPrice: '0' }))).toBe(0);
  });

  it('lets a fixed custom price win even when a discount is also set', () => {
    expect(
      resolveUnitPrice(item({ customPrice: '6.00', discountPercentage: '50' })),
    ).toBe(6);
  });

  it('applies a percentage discount when there is no fixed price', () => {
    expect(resolveUnitPrice(item({ discountPercentage: '10' }))).toBe(9);
  });

  it('rounds a percentage discount to 2 decimal places', () => {
    // 9.99 * (1 - 15/100) = 8.4915 -> 8.49
    expect(
      resolveUnitPrice(item({ product: { price: '9.99' }, discountPercentage: '15' })),
    ).toBe(8.49);
  });

  it('falls back to the standard price when neither is set', () => {
    expect(resolveUnitPrice(item())).toBe(10);
  });

  it('returns 0 for a missing product (display layer renders "—")', () => {
    expect(resolveUnitPrice(item({ product: null }))).toBe(0);
  });
});

describe('resolvePriceListRow (row display rules)', () => {
  it('flags a fixed custom price as a custom price', () => {
    const row = resolvePriceListRow(item({ customPrice: '7.50' }));
    expect(row).toMatchObject({
      productMissing: false,
      isCustom: true,
      hasFixed: true,
      hasPct: false,
      unitPrice: 7.5,
    });
  });

  it('treats a custom price of 0 as a custom price (not standard)', () => {
    const row = resolvePriceListRow(item({ customPrice: '0' }));
    expect(row.isCustom).toBe(true);
    expect(row.unitPrice).toBe(0);
  });

  it('flags a percentage discount and exposes hasPct for the "% off" badge', () => {
    const row = resolvePriceListRow(item({ discountPercentage: '10' }));
    expect(row).toMatchObject({ isCustom: true, hasFixed: false, hasPct: true, unitPrice: 9 });
  });

  it('marks a plain standard-price row as not custom', () => {
    const row = resolvePriceListRow(item());
    expect(row).toMatchObject({ isCustom: false, hasFixed: false, hasPct: false, base: 10 });
  });

  it('marks a missing product so the cell renders "—" instead of £0', () => {
    const row = resolvePriceListRow(item({ product: null, customPrice: '5.00' }));
    expect(row.productMissing).toBe(true);
    expect(row.base).toBe(0);
  });
});

describe('client/server parity: resolveUnitPrice mirrors resolveCustomPrice', () => {
  const bases = ['10.00', '9.99', '0', '100', '3.33', ''];
  const customPrices: (string | null)[] = [null, '0', '7.50', '12.345'];
  const discounts: (string | null)[] = [null, '0', '10', '15', '33.33', '100'];

  for (const base of bases) {
    for (const customPrice of customPrices) {
      for (const discountPercentage of discounts) {
        it(`base=${base || '∅'} custom=${customPrice ?? '∅'} pct=${discountPercentage ?? '∅'}`, () => {
          const clientPrice = resolveUnitPrice(
            item({ product: { price: base }, customPrice, discountPercentage }),
          );
          const serverPrice = resolveCustomPrice(base, { customPrice, discountPercentage });
          expect(clientPrice).toBe(serverPrice);
        });
      }
    }
  }
});
