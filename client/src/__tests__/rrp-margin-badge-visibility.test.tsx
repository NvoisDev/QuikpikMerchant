/**
 * RRP margin badge visibility tests
 *
 * The RRP margin badge is internal-only (wholesaler + team members).
 * These tests confirm:
 *   1. ProductCard never renders the badge when rrpMarginVisible is false or omitted
 *   2. ProductCard renders the badge when rrpMarginVisible is true and RRP data is valid
 *   3. ProductCard hides the badge when rrpMarginVisible is true but RRP data is missing
 *   4. Customer-facing components (ProductsTab, public-store-page) do not reference
 *      rrpMarginVisible and therefore cannot surface the badge
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Mock dependencies required by ProductCard ───────────────────────────────

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  useParams: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
}));

vi.mock('@/lib/near-depletion', () => ({
  useNearDepletionThreshold: () => ({ threshold: 10, setThreshold: vi.fn() }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ─── Set up useCurrency before each test ─────────────────────────────────────

beforeEach(async () => {
  const { useCurrency } = await import('@/hooks/useCurrency');
  (useCurrency as ReturnType<typeof vi.fn>).mockReturnValue({
    formatMoney: (v: number) => `£${v.toFixed(2)}`,
    symbol: '£',
    code: 'GBP',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Minimal product fixture ──────────────────────────────────────────────────

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test Product',
    price: '10.00',
    moq: 1,
    stock: 100,
    status: 'active',
    priceVisible: true,
    // Valid RRP data: rrp per unit × quantityInPack gives rrpTotal > wholesale price
    rrp: '5.00',
    quantityInPack: 4, // rrpTotal = 5 × 4 = 20, margin = (20−10)/20 = 50 %
    ...overrides,
  };
}

// ─── ProductCard tests ────────────────────────────────────────────────────────

describe('ProductCard — RRP margin badge visibility', () => {
  it('does not render the RRP margin badge when rrpMarginVisible is not passed (default false)', async () => {
    const ProductCard = (await import('@/components/product-card')).default;
    render(React.createElement(ProductCard, { product: makeProduct() }));
    expect(screen.queryByText(/RRP margin/i)).toBeNull();
  });

  it('does not render the RRP margin badge when rrpMarginVisible is explicitly false', async () => {
    const ProductCard = (await import('@/components/product-card')).default;
    render(React.createElement(ProductCard, { product: makeProduct(), rrpMarginVisible: false }));
    expect(screen.queryByText(/RRP margin/i)).toBeNull();
  });

  it('renders the RRP margin badge when rrpMarginVisible is true and RRP data is valid', async () => {
    const ProductCard = (await import('@/components/product-card')).default;
    render(React.createElement(ProductCard, { product: makeProduct(), rrpMarginVisible: true }));
    // rrpTotal = 5 × 4 = 20, wholesale = 10 → margin = 50 %
    expect(screen.getByText(/RRP margin 50\.0% per pack/i)).toBeTruthy();
  });

  it('does not render the RRP margin badge when rrpMarginVisible is true but rrp is missing', async () => {
    const ProductCard = (await import('@/components/product-card')).default;
    render(
      React.createElement(ProductCard, {
        product: makeProduct({ rrp: null }),
        rrpMarginVisible: true,
      }),
    );
    expect(screen.queryByText(/RRP margin/i)).toBeNull();
  });

  it('does not render the RRP margin badge when rrpMarginVisible is true but rrp is zero', async () => {
    const ProductCard = (await import('@/components/product-card')).default;
    render(
      React.createElement(ProductCard, {
        product: makeProduct({ rrp: '0' }),
        rrpMarginVisible: true,
      }),
    );
    expect(screen.queryByText(/RRP margin/i)).toBeNull();
  });
});

// ─── Customer-facing component structural checks ──────────────────────────────
//
// ProductsTab and public-store-page have their own inline product-rendering
// logic (they do not use ProductCard). The tests below assert that neither
// file references rrpMarginVisible — which would be required to accidentally
// surface the badge in a customer-facing context.

describe('ProductsTab — does not reference rrpMarginVisible', () => {
  it('source file contains no reference to rrpMarginVisible', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'client/src/components/customer/portal/ProductsTab.tsx'),
      'utf8',
    );
    expect(src).not.toContain('rrpMarginVisible');
    expect(src).not.toContain('RRP margin');
  });

  it('ProductsTabProps interface does not include rrpMarginVisible', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'client/src/components/customer/portal/ProductsTab.tsx'),
      'utf8',
    );
    // The props interface block ends before any rrpMarginVisible property
    const propsBlock = src.match(/interface ProductsTabProps\s*\{[^}]+\}/s)?.[0] ?? '';
    expect(propsBlock).not.toContain('rrpMarginVisible');
  });
});

describe('public-store-page — does not reference rrpMarginVisible', () => {
  it('source file contains no reference to rrpMarginVisible', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'client/src/pages/public-store-page.tsx'),
      'utf8',
    );
    expect(src).not.toContain('rrpMarginVisible');
    expect(src).not.toContain('RRP margin');
  });

  it('PublicProduct interface does not include rrpMarginVisible', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'client/src/pages/public-store-page.tsx'),
      'utf8',
    );
    const propsBlock = src.match(/interface PublicProduct\s*\{[^}]+\}/s)?.[0] ?? '';
    expect(propsBlock).not.toContain('rrpMarginVisible');
  });
});
