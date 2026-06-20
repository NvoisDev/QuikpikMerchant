/**
 * Task #1398 — Wholesaler product list combined-filter regression tests.
 *
 * The product management page (client/src/pages/product-management.tsx) feeds a
 * single `filteredProducts` array from three combinable filters: search text,
 * status, and the category dropdown. That predicate is extracted into
 * `productMatchesFilters` so it can be exercised here without rendering the page.
 *
 * Covered behaviour:
 *   - search matches name OR description, case-insensitively
 *   - "all" category includes uncategorised (null/empty) products; a specific
 *     category excludes products with empty/null category
 *   - "all" status matches everything; specific status matches; out_of_stock
 *     also matches stock === 0 / null
 *   - the "expiring" status branch (expiryDate present OR nearestExpiry within
 *     30 days) still ANDs with search + category
 *   - all three filters combine correctly
 */

import { describe, it, expect } from 'vitest';
import {
  productMatchesFilters,
  type ProductFilterInput,
  type ProductFilterState,
} from '@/pages/product-filters';

const ALL: ProductFilterState = { searchQuery: '', statusFilter: 'all', categoryFilter: 'all' };

function makeProduct(overrides: Partial<ProductFilterInput> = {}): ProductFilterInput {
  return {
    name: 'Generic Widget',
    description: 'A generic widget',
    category: 'Hardware',
    status: 'active',
    stock: 10,
    expiryDate: null,
    nearestExpiry: null,
    ...overrides,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoIn = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

describe('productMatchesFilters — defaults', () => {
  it('matches everything when all filters are at their defaults', () => {
    expect(productMatchesFilters(makeProduct(), ALL)).toBe(true);
    expect(productMatchesFilters(makeProduct({ category: null, status: 'inactive', stock: 0 }), ALL)).toBe(true);
  });
});

describe('productMatchesFilters — search', () => {
  it('matches on name, case-insensitively', () => {
    const p = makeProduct({ name: 'Blue Mug', description: null });
    expect(productMatchesFilters(p, { ...ALL, searchQuery: 'blue' })).toBe(true);
    expect(productMatchesFilters(p, { ...ALL, searchQuery: 'MUG' })).toBe(true);
    expect(productMatchesFilters(p, { ...ALL, searchQuery: 'red' })).toBe(false);
  });

  it('matches on description when the name does not match', () => {
    const p = makeProduct({ name: 'SKU-123', description: 'Ceramic coffee mug' });
    expect(productMatchesFilters(p, { ...ALL, searchQuery: 'coffee' })).toBe(true);
  });

  it('returns false (not undefined) when name misses and description is null', () => {
    const p = makeProduct({ name: 'SKU-123', description: null });
    expect(productMatchesFilters(p, { ...ALL, searchQuery: 'coffee' })).toBe(false);
  });
});

describe('productMatchesFilters — category', () => {
  it('"all" includes a product with a category', () => {
    expect(productMatchesFilters(makeProduct({ category: 'Hardware' }), ALL)).toBe(true);
  });

  it('"all" includes uncategorised products (null or empty string)', () => {
    expect(productMatchesFilters(makeProduct({ category: null }), ALL)).toBe(true);
    expect(productMatchesFilters(makeProduct({ category: '' }), ALL)).toBe(true);
  });

  it('a specific category matches only that exact category', () => {
    const state = { ...ALL, categoryFilter: 'Hardware' };
    expect(productMatchesFilters(makeProduct({ category: 'Hardware' }), state)).toBe(true);
    expect(productMatchesFilters(makeProduct({ category: 'Tools' }), state)).toBe(false);
  });

  it('a specific category excludes products with empty or null category', () => {
    const state = { ...ALL, categoryFilter: 'Hardware' };
    expect(productMatchesFilters(makeProduct({ category: null }), state)).toBe(false);
    expect(productMatchesFilters(makeProduct({ category: '' }), state)).toBe(false);
  });
});

describe('productMatchesFilters — status', () => {
  it('"all" matches any status', () => {
    expect(productMatchesFilters(makeProduct({ status: 'active' }), ALL)).toBe(true);
    expect(productMatchesFilters(makeProduct({ status: 'inactive' }), ALL)).toBe(true);
  });

  it('a specific status matches only that status', () => {
    const state = { ...ALL, statusFilter: 'inactive' };
    expect(productMatchesFilters(makeProduct({ status: 'inactive' }), state)).toBe(true);
    expect(productMatchesFilters(makeProduct({ status: 'active' }), state)).toBe(false);
  });

  it('out_of_stock matches the explicit status, stock 0, and null stock', () => {
    const state = { ...ALL, statusFilter: 'out_of_stock' };
    expect(productMatchesFilters(makeProduct({ status: 'out_of_stock', stock: 5 }), state)).toBe(true);
    expect(productMatchesFilters(makeProduct({ status: 'active', stock: 0 }), state)).toBe(true);
    expect(productMatchesFilters(makeProduct({ status: 'active', stock: null }), state)).toBe(true);
    expect(productMatchesFilters(makeProduct({ status: 'active', stock: 3 }), state)).toBe(false);
  });
});

describe('productMatchesFilters — expiring branch', () => {
  it('matches when an explicit expiryDate is set', () => {
    const state = { ...ALL, statusFilter: 'expiring' };
    expect(productMatchesFilters(makeProduct({ expiryDate: isoIn(120) }), state)).toBe(true);
  });

  it('matches when nearestExpiry falls within the next 30 days', () => {
    const state = { ...ALL, statusFilter: 'expiring' };
    expect(productMatchesFilters(makeProduct({ nearestExpiry: isoIn(10) }), state)).toBe(true);
  });

  it('does not match when nearestExpiry is further than 30 days away and no expiryDate', () => {
    const state = { ...ALL, statusFilter: 'expiring' };
    expect(productMatchesFilters(makeProduct({ nearestExpiry: isoIn(60) }), state)).toBe(false);
  });

  it('does not match an already-expired nearestExpiry (past) with no expiryDate', () => {
    const state = { ...ALL, statusFilter: 'expiring' };
    expect(productMatchesFilters(makeProduct({ nearestExpiry: isoIn(-5) }), state)).toBe(false);
  });

  it('does not match when neither expiryDate nor a soon nearestExpiry is present', () => {
    const state = { ...ALL, statusFilter: 'expiring' };
    expect(productMatchesFilters(makeProduct({ expiryDate: null, nearestExpiry: null }), state)).toBe(false);
  });

  it('still ANDs with category in the expiring branch', () => {
    const state = { ...ALL, statusFilter: 'expiring', categoryFilter: 'Hardware' };
    expect(productMatchesFilters(makeProduct({ category: 'Hardware', expiryDate: isoIn(5) }), state)).toBe(true);
    expect(productMatchesFilters(makeProduct({ category: 'Tools', expiryDate: isoIn(5) }), state)).toBe(false);
    expect(productMatchesFilters(makeProduct({ category: null, expiryDate: isoIn(5) }), state)).toBe(false);
  });

  it('still ANDs with search in the expiring branch', () => {
    const state = { ...ALL, statusFilter: 'expiring', searchQuery: 'milk' };
    expect(productMatchesFilters(makeProduct({ name: 'Fresh Milk', expiryDate: isoIn(5) }), state)).toBe(true);
    expect(productMatchesFilters(makeProduct({ name: 'Fresh Bread', expiryDate: isoIn(5) }), state)).toBe(false);
  });
});

describe('productMatchesFilters — all three combined', () => {
  it('passes only when search AND status AND category all match', () => {
    const state: ProductFilterState = {
      searchQuery: 'organic',
      statusFilter: 'active',
      categoryFilter: 'Food',
    };
    const match = makeProduct({
      name: 'Organic Apples',
      description: 'Crisp and fresh',
      status: 'active',
      category: 'Food',
      stock: 50,
    });
    expect(productMatchesFilters(match, state)).toBe(true);

    // Each single mismatch flips the result to false.
    expect(productMatchesFilters({ ...match, name: 'Apples', description: 'Crisp' }, state)).toBe(false);
    expect(productMatchesFilters({ ...match, status: 'inactive' }, state)).toBe(false);
    expect(productMatchesFilters({ ...match, category: 'Drinks' }, state)).toBe(false);
  });

  it('filters a list down to the rows matching every active filter', () => {
    const state: ProductFilterState = {
      searchQuery: 'pro',
      statusFilter: 'active',
      categoryFilter: 'Hardware',
    };
    const list: ProductFilterInput[] = [
      makeProduct({ name: 'Pro Drill', status: 'active', category: 'Hardware' }), // keep
      makeProduct({ name: 'Pro Drill', status: 'inactive', category: 'Hardware' }), // wrong status
      makeProduct({ name: 'Pro Drill', status: 'active', category: 'Tools' }), // wrong category
      makeProduct({ name: 'Basic Drill', description: 'cheap', status: 'active', category: 'Hardware' }), // no search hit
      makeProduct({ name: 'Pro Saw', status: 'active', category: null }), // uncategorised excluded
    ];
    const kept = list.filter((p) => productMatchesFilters(p, state));
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe('Pro Drill');
  });
});
