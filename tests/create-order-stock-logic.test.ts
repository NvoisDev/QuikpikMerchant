/**
 * Task #947 — createOrder stock allocation unit tests
 *
 * These tests exercise the pure in-memory FEFO batch-allocation logic that was
 * extracted from createOrder during the Phase 2 batch-update refactor.  They
 * validate stock outcomes without a live database.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal types mirroring the shapes used in server/storage/orders.ts
// ---------------------------------------------------------------------------

interface Batch {
  id: number;
  productId: number;
  quantity: number;
  status: string;
  expiryDate?: Date | null;
}

interface OrderItem {
  productId: number;
  quantity: number;
  sellingType?: string;
}

interface Product {
  id: number;
  name: string;
  stock: number;
  palletStock: number;
  unitsPerPallet?: number;
  quantityInPack?: number;
}

interface BatchUpdate {
  id: number;
  newQty: number;
  newStatus: string;
}

// ---------------------------------------------------------------------------
// Re-implementation of the in-memory FEFO allocation extracted from
// server/storage/orders.ts (lines 460-538) — isolated for unit testing.
// ---------------------------------------------------------------------------

function allocateStockFefo(
  items: OrderItem[],
  productMap: Map<number, Product>,
  batchesByProduct: Map<number, Batch[]>,
): {
  batchUpdates: BatchUpdate[];
  productStockFinal: Map<number, { stock: number; palletStock: number }>;
  dedupedBatchUpdates: BatchUpdate[];
} {
  const batchQty = new Map<number, number>();
  for (const [, batches] of batchesByProduct) {
    for (const b of batches) batchQty.set(b.id, b.quantity);
  }

  const batchUpdates: BatchUpdate[] = [];
  const productStockFinal = new Map<number, { stock: number; palletStock: number }>();

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) throw new Error(`Product ${item.productId} not found`);

    const activeBatches = batchesByProduct.get(item.productId) ?? [];
    if (activeBatches.length === 0) throw new Error(`No active batches for product ${item.productId}`);

    const sellingType = item.sellingType ?? 'units';
    const unitsPerPallet = product.unitsPerPallet ?? 1;
    const quantityInPack = product.quantityInPack ?? 1;
    const baseUnitsNeeded = sellingType === 'pallets'
      ? item.quantity * unitsPerPallet * quantityInPack
      : item.quantity;

    const totalAvailable = activeBatches.reduce((acc, b) => acc + (batchQty.get(b.id) ?? 0), 0);
    if (totalAvailable < baseUnitsNeeded) {
      throw new Error(`Insufficient stock for product ${item.productId}`);
    }

    let remaining = baseUnitsNeeded;
    for (const batch of activeBatches) {
      if (remaining <= 0) break;
      const currentQty = batchQty.get(batch.id) ?? 0;
      if (currentQty <= 0) continue;
      const deduct = Math.min(remaining, currentQty);
      const newQty = currentQty - deduct;
      batchQty.set(batch.id, newQty);
      batchUpdates.push({ id: batch.id, newQty, newStatus: newQty === 0 ? 'depleted' : 'active' });
      remaining -= deduct;
    }

    const newStock = activeBatches.reduce((acc, b) => acc + (batchQty.get(b.id) ?? 0), 0);
    const newPalletStock = (quantityInPack > 0 && unitsPerPallet > 0)
      ? Math.floor(Math.floor(newStock / quantityInPack) / unitsPerPallet)
      : 0;
    productStockFinal.set(item.productId, { stock: newStock, palletStock: newPalletStock });
  }

  // Deduplication — mirrors server/storage/orders.ts lines 544-548
  const deduped = new Map<number, BatchUpdate>();
  for (const upd of batchUpdates) deduped.set(upd.id, upd);
  const dedupedBatchUpdates = Array.from(deduped.values());

  return { batchUpdates, productStockFinal, dedupedBatchUpdates };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createOrder in-memory FEFO stock allocation', () => {
  it('deducts the correct quantity from the first (oldest) batch (FEFO)', () => {
    const batches: Batch[] = [
      { id: 1, productId: 10, quantity: 20, status: 'active' },
      { id: 2, productId: 10, quantity: 30, status: 'active' },
    ];
    const productMap = new Map([[10, { id: 10, name: 'Widget', stock: 50, palletStock: 0, unitsPerPallet: 1, quantityInPack: 1 }]]);
    const batchesByProduct = new Map([[10, batches]]);

    const { dedupedBatchUpdates, productStockFinal } = allocateStockFefo(
      [{ productId: 10, quantity: 25 }],
      productMap,
      batchesByProduct,
    );

    // Batch 1 fully depleted (20 units), batch 2 loses 5
    const b1 = dedupedBatchUpdates.find(u => u.id === 1)!;
    const b2 = dedupedBatchUpdates.find(u => u.id === 2)!;
    expect(b1.newQty).toBe(0);
    expect(b1.newStatus).toBe('depleted');
    expect(b2.newQty).toBe(25);
    expect(b2.newStatus).toBe('active');

    expect(productStockFinal.get(10)!.stock).toBe(25);
  });

  it('marks a batch as depleted when its quantity reaches zero', () => {
    const batches: Batch[] = [{ id: 5, productId: 20, quantity: 10, status: 'active' }];
    const productMap = new Map([[20, { id: 20, name: 'Gizmo', stock: 10, palletStock: 0, unitsPerPallet: 1, quantityInPack: 1 }]]);
    const batchesByProduct = new Map([[20, batches]]);

    const { dedupedBatchUpdates } = allocateStockFefo(
      [{ productId: 20, quantity: 10 }],
      productMap,
      batchesByProduct,
    );

    expect(dedupedBatchUpdates[0].newQty).toBe(0);
    expect(dedupedBatchUpdates[0].newStatus).toBe('depleted');
  });

  it('correctly accumulates stock deductions across two items sharing the same product', () => {
    const batches: Batch[] = [{ id: 7, productId: 30, quantity: 100, status: 'active' }];
    const productMap = new Map([[30, { id: 30, name: 'Thingamajig', stock: 100, palletStock: 0, unitsPerPallet: 1, quantityInPack: 1 }]]);
    const batchesByProduct = new Map([[30, batches]]);

    const { dedupedBatchUpdates, batchUpdates, productStockFinal } = allocateStockFefo(
      [
        { productId: 30, quantity: 40 },
        { productId: 30, quantity: 30 },
      ],
      productMap,
      batchesByProduct,
    );

    // Raw updates: 2 entries for the same batch; deduplicated to 1
    expect(batchUpdates.length).toBe(2);
    expect(dedupedBatchUpdates.length).toBe(1);

    // Final state: 100 - 40 - 30 = 30 remaining
    expect(dedupedBatchUpdates[0].newQty).toBe(30);
    expect(dedupedBatchUpdates[0].newStatus).toBe('active');
    expect(productStockFinal.get(30)!.stock).toBe(30);
  });

  it('throws when there is insufficient stock across all batches', () => {
    const batches: Batch[] = [{ id: 9, productId: 40, quantity: 5, status: 'active' }];
    const productMap = new Map([[40, { id: 40, name: 'LowStock', stock: 5, palletStock: 0, unitsPerPallet: 1, quantityInPack: 1 }]]);
    const batchesByProduct = new Map([[40, batches]]);

    expect(() =>
      allocateStockFefo([{ productId: 40, quantity: 10 }], productMap, batchesByProduct),
    ).toThrow('Insufficient stock');
  });

  it('converts pallet orders to base units before deducting from batches', () => {
    // Product: 6 units/pack, 4 packs/pallet → 1 pallet = 24 base units
    const batches: Batch[] = [{ id: 11, productId: 50, quantity: 100, status: 'active' }];
    const productMap = new Map([[50, { id: 50, name: 'PalletProd', stock: 100, palletStock: 4, unitsPerPallet: 4, quantityInPack: 6 }]]);
    const batchesByProduct = new Map([[50, batches]]);

    const { dedupedBatchUpdates, productStockFinal } = allocateStockFefo(
      [{ productId: 50, quantity: 2, sellingType: 'pallets' }],
      productMap,
      batchesByProduct,
    );

    // 2 pallets × 4 packs × 6 units = 48 base units deducted
    expect(dedupedBatchUpdates[0].newQty).toBe(52);
    expect(productStockFinal.get(50)!.stock).toBe(52);
  });
});
