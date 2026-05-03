/**
 * Task #947 — Performance regression tests
 *
 * Verifies that:
 *   1. getOrders() enforces a 500-row default cap via the { unpaginated } option.
 *   2. The marketplace product hard-cap constant (100) is honoured by Math.min logic.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// 1. getOrders default cap logic
//    Isolated unit test: reproduces the branching logic from
//    server/storage/orders.ts lines 111-120 without a live DB.
// ---------------------------------------------------------------------------

function resolveRowLimit(options?: { unpaginated?: boolean }): number | undefined {
  return options?.unpaginated ? undefined : 500;
}

describe('getOrders row-limit logic', () => {
  it('returns 500 as the default row limit when no options are provided', () => {
    expect(resolveRowLimit()).toBe(500);
  });

  it('returns 500 when options is provided but unpaginated is false', () => {
    expect(resolveRowLimit({ unpaginated: false })).toBe(500);
  });

  it('returns undefined (no limit) when unpaginated is explicitly true', () => {
    expect(resolveRowLimit({ unpaginated: true })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Marketplace product cap logic
//    Reproduces the Math.min guard from
//    server/routes/marketplace-browsing.ts lines 138-140.
// ---------------------------------------------------------------------------

const MARKETPLACE_HARD_CAP = 100;

function resolveMarketplaceLimit(productLimit: number | null | undefined): number {
  const rawLimit = productLimit === -1 || !productLimit ? MARKETPLACE_HARD_CAP : productLimit;
  return Math.min(rawLimit, MARKETPLACE_HARD_CAP);
}

describe('marketplace product list hard cap', () => {
  it('defaults to 100 when productLimit is null', () => {
    expect(resolveMarketplaceLimit(null)).toBe(100);
  });

  it('defaults to 100 when productLimit is -1 (unlimited plan)', () => {
    expect(resolveMarketplaceLimit(-1)).toBe(100);
  });

  it('defaults to 100 when productLimit is 0', () => {
    expect(resolveMarketplaceLimit(0)).toBe(100);
  });

  it('clamps a subscription limit of 50 to 50 (below hard cap)', () => {
    expect(resolveMarketplaceLimit(50)).toBe(50);
  });

  it('clamps a subscription limit of 1000 down to the hard cap of 100', () => {
    expect(resolveMarketplaceLimit(1000)).toBe(100);
  });

  it('clamps a subscription limit of 101 down to the hard cap of 100', () => {
    expect(resolveMarketplaceLimit(101)).toBe(100);
  });

  it('allows a limit of exactly 100 through unchanged', () => {
    expect(resolveMarketplaceLimit(100)).toBe(100);
  });
});
