/**
 * Validation error tests — QuoteItemCard compact row layout
 *
 * Verifies that the inline expansion zone in the compact invoice row
 * shows the correct error/warning messages when:
 *   1. Quantity is below 1 ("Min qty 1")
 *   2. Price is zero or below ("Price must be > 0")
 *   3. Quantity exceeds available stock (over-stock warning)
 *   4. Pallet quantity falls below the minimum order quantity (MOQ)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { QuoteItemCard } from '../components/orders/QuoteItemCard';

// QuoteItemCard has no external deps that need mocking — all validation
// logic is derived directly from the props passed in.

// ─── Shared helpers ──────────────────────────────────────────────────────────

const noOp = vi.fn();

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    stableId: 'test-item-1',
    productId: 1,
    productName: 'Test Widget',
    originalPrice: 10,
    customPrice: 10,
    quantity: 5,
    sellingType: 'units' as const,
    unitsPerPallet: undefined,
    promotionalOffers: [],
    costPrice: 5,
    weightKg: 0,
    packQuantity: undefined,
    unitSize: undefined,
    unitOfMeasure: undefined,
    stockCount: undefined,
    quantityInPack: 1,
    displayUnit: 'units' as const,
    sellingFormat: 'units',
    palletPrice: undefined,
    unitPrice: 10,
    palletMoq: undefined,
    unitStockCount: undefined,
    palletStockCount: undefined,
    priceScope: 'invoice' as const,
    ...overrides,
  };
}

function renderCard(itemOverrides: Record<string, unknown> = {}) {
  const item = baseItem(itemOverrides);
  const sk = item.stableId;

  return render(
    React.createElement(QuoteItemCard, {
      item,
      index: 0,
      inputValues: { [sk]: { price: item.customPrice.toString(), qty: item.quantity.toString() } },
      costValues: { [sk]: item.costPrice.toString() },
      setInputValues: noOp,
      setCostValues: noOp,
      updateItemPrice: noOp,
      updateItemPriceScope: noOp,
      updateItemQuantity: noOp,
      updateItemCost: noOp,
      removeItem: noOp,
      formatCurrency: (n: number) => `£${n.toFixed(2)}`,
      formatWeight: (n: number | string) => String(n),
      onSwitchMode: noOp,
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Quantity below 1 → "Min qty 1"
// ─────────────────────────────────────────────────────────────────────────────
describe('QuoteItemCard — quantity validation', () => {
  it('shows "Min qty 1" error when quantity is 0', () => {
    renderCard({ quantity: 0 });
    expect(screen.getByText('Min qty 1')).toBeInTheDocument();
  });

  it('does not show min-qty error when quantity is 1', () => {
    renderCard({ quantity: 1 });
    expect(screen.queryByText('Min qty 1')).not.toBeInTheDocument();
  });

  it('does not show min-qty error when quantity is greater than 1', () => {
    renderCard({ quantity: 10 });
    expect(screen.queryByText('Min qty 1')).not.toBeInTheDocument();
  });

  it('highlights the qty input in red when quantity is 0', () => {
    renderCard({ quantity: 0 });
    const qtyInput = Array.from(document.querySelectorAll('input[type="text"]')).find(
      (el) => (el as HTMLInputElement).value === '0',
    );
    expect(qtyInput?.className).toMatch(/border-red-500/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Price at or below zero → "Price must be > 0"
// ─────────────────────────────────────────────────────────────────────────────
describe('QuoteItemCard — price validation', () => {
  it('shows "Price must be > 0" error when customPrice is 0', () => {
    renderCard({ customPrice: 0 });
    expect(screen.getByText(/price must be/i)).toBeInTheDocument();
    expect(screen.getByText(/price must be/i).textContent).toBe('Price must be > 0');
  });

  it('shows "Price must be > 0" when customPrice is negative', () => {
    renderCard({ customPrice: -1 });
    expect(screen.getByText(/price must be/i)).toBeInTheDocument();
  });

  it('does not show price error when customPrice is positive', () => {
    renderCard({ customPrice: 5 });
    expect(screen.queryByText(/price must be/i)).not.toBeInTheDocument();
  });

  it('highlights the price input in red when price is 0', () => {
    renderCard({ customPrice: 0 });
    const priceInput = Array.from(document.querySelectorAll('input[type="text"]')).find(
      (el) => (el as HTMLInputElement).value === '0',
    );
    expect(priceInput?.className).toMatch(/border-red-500/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Quantity exceeds stock → over-stock warning
// ─────────────────────────────────────────────────────────────────────────────
describe('QuoteItemCard — over-stock warning', () => {
  it('shows over-stock warning when qty exceeds stockCount', () => {
    renderCard({ quantity: 10, stockCount: 5 });
    expect(screen.getByText(/only 5 units? available/i)).toBeInTheDocument();
  });

  it('uses singular "unit" when stockCount is exactly 1', () => {
    renderCard({ quantity: 2, stockCount: 1 });
    expect(screen.getByText(/only 1 unit available/i)).toBeInTheDocument();
  });

  it('uses plural "units" when stockCount is more than 1', () => {
    renderCard({ quantity: 10, stockCount: 3 });
    expect(screen.getByText(/only 3 units available/i)).toBeInTheDocument();
  });

  it('does not show over-stock warning when qty equals stockCount', () => {
    renderCard({ quantity: 5, stockCount: 5 });
    expect(screen.queryByText(/only.*available/i)).not.toBeInTheDocument();
  });

  it('does not show over-stock warning when qty is within stock', () => {
    renderCard({ quantity: 3, stockCount: 10 });
    expect(screen.queryByText(/only.*available/i)).not.toBeInTheDocument();
  });

  it('does not show over-stock warning when stockCount is undefined', () => {
    renderCard({ quantity: 100, stockCount: undefined });
    expect(screen.queryByText(/only.*available/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Pallet MOQ violation → "Min X pallets"
// ─────────────────────────────────────────────────────────────────────────────
describe('QuoteItemCard — pallet MOQ validation', () => {
  it('shows "Min X pallets" when pallet qty is below palletMoq', () => {
    renderCard({
      sellingType: 'pallets',
      quantity: 2,
      palletMoq: 5,
      customPrice: 100,
      originalPrice: 100,
      unitPrice: undefined,
      sellingFormat: 'pallets',
    });
    expect(screen.getByText('Min 5 pallets')).toBeInTheDocument();
  });

  it('does not show MOQ error when pallet qty meets palletMoq exactly', () => {
    renderCard({
      sellingType: 'pallets',
      quantity: 5,
      palletMoq: 5,
      customPrice: 100,
      originalPrice: 100,
      unitPrice: undefined,
      sellingFormat: 'pallets',
    });
    expect(screen.queryByText(/min \d+ pallets/i)).not.toBeInTheDocument();
  });

  it('does not show MOQ error when pallet qty exceeds palletMoq', () => {
    renderCard({
      sellingType: 'pallets',
      quantity: 10,
      palletMoq: 5,
      customPrice: 100,
      originalPrice: 100,
      unitPrice: undefined,
      sellingFormat: 'pallets',
    });
    expect(screen.queryByText(/min \d+ pallets/i)).not.toBeInTheDocument();
  });

  it('does not show MOQ error when palletMoq is 1 (no meaningful MOQ)', () => {
    renderCard({
      sellingType: 'pallets',
      quantity: 1,
      palletMoq: 1,
      customPrice: 100,
      originalPrice: 100,
      unitPrice: undefined,
      sellingFormat: 'pallets',
    });
    expect(screen.queryByText(/min \d+ pallets/i)).not.toBeInTheDocument();
  });

  it('does not show MOQ error for unit-mode items even if palletMoq is set', () => {
    renderCard({
      sellingType: 'units',
      quantity: 2,
      palletMoq: 5,
    });
    expect(screen.queryByText(/min \d+ pallets/i)).not.toBeInTheDocument();
  });

  it('highlights the qty input red when pallet MOQ is violated', () => {
    renderCard({
      sellingType: 'pallets',
      quantity: 2,
      palletMoq: 5,
      customPrice: 100,
      originalPrice: 100,
      unitPrice: undefined,
      sellingFormat: 'pallets',
    });
    const qtyInput = Array.from(document.querySelectorAll('input[type="text"]')).find(
      (el) => (el as HTMLInputElement).value === '2',
    );
    expect(qtyInput?.className).toMatch(/border-red-500/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Multiple errors can appear simultaneously
// ─────────────────────────────────────────────────────────────────────────────
describe('QuoteItemCard — multiple simultaneous errors', () => {
  it('shows both min-qty and price errors together when both are invalid', () => {
    renderCard({ quantity: 0, customPrice: 0 });
    expect(screen.getByText('Min qty 1')).toBeInTheDocument();
    expect(screen.getByText(/price must be/i)).toBeInTheDocument();
  });

  it('shows both over-stock and price errors together', () => {
    renderCard({ quantity: 10, stockCount: 3, customPrice: 0 });
    expect(screen.getByText(/only 3 units available/i)).toBeInTheDocument();
    expect(screen.getByText(/price must be/i)).toBeInTheDocument();
  });
});
