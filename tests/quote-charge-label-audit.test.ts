/**
 * Unit tests for the charge-item audit diff logic.
 *
 * When a wholesaler edits a quote and renames a charge item (e.g.
 * "Pallt Delivery" → "Pallet Delivery"), the audit trail should report
 * "Updated charge: Pallet Delivery (label: Pallt Delivery→Pallet Delivery)"
 * rather than the misleading "Removed charge: Pallt Delivery; Added charge:
 * Pallet Delivery" pair that the old label-only matching produced.
 *
 * All tests call buildChargeAuditEntries() directly — no route or DB mocks
 * needed.
 */

import { describe, it, expect } from 'vitest';
import { buildChargeAuditEntries, AuditOldCharge, AuditNewCharge } from '../server/utils/quote-audit-diff';

const fmt = (v: number) => v.toFixed(2);

// ── Label rename detection ────────────────────────────────────────────────────

describe('buildChargeAuditEntries — label rename (same position)', () => {
  it('reports "Updated charge" when only the label changes', () => {
    const old: AuditOldCharge[] = [{ quantity: 1, unitPrice: '10.00', customLabel: 'Pallt Delivery' }];
    const next: AuditNewCharge[] = [{ quantity: 1, customPrice: 10, customLabel: 'Pallet Delivery' }];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/Updated charge: Pallet Delivery/);
    expect(result[0]).toContain('label: Pallt Delivery→Pallet Delivery');
    expect(result[0]).not.toContain('Removed');
    expect(result[0]).not.toContain('Added');
  });

  it('includes qty and price changes alongside a label rename', () => {
    const old: AuditOldCharge[] = [{ quantity: 1, unitPrice: '10.00', customLabel: 'Pallt Delivery' }];
    const next: AuditNewCharge[] = [{ quantity: 2, customPrice: 15, customLabel: 'Pallet Delivery' }];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('label: Pallt Delivery→Pallet Delivery');
    expect(result[0]).toContain('qty 1→2');
    expect(result[0]).toContain('price £10.00→£15.00');
  });

  it('is case-insensitive when deciding whether a label truly changed', () => {
    const old: AuditOldCharge[] = [{ quantity: 1, unitPrice: '5.00', customLabel: 'handling fee' }];
    const next: AuditNewCharge[] = [{ quantity: 1, customPrice: 5, customLabel: 'Handling Fee' }];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result).toHaveLength(0);
  });

  it('produces no entry when nothing changes on a same-position charge', () => {
    const old: AuditOldCharge[] = [{ quantity: 2, unitPrice: '20.00', customLabel: 'Courier' }];
    const next: AuditNewCharge[] = [{ quantity: 2, customPrice: 20, customLabel: 'Courier' }];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result).toHaveLength(0);
  });

  it('correctly handles multiple charges all renamed in one edit', () => {
    const old: AuditOldCharge[] = [
      { quantity: 1, unitPrice: '10.00', customLabel: 'Deliv' },
      { quantity: 1, unitPrice: '5.00', customLabel: 'Handlng' },
    ];
    const next: AuditNewCharge[] = [
      { quantity: 1, customPrice: 10, customLabel: 'Delivery' },
      { quantity: 1, customPrice: 5, customLabel: 'Handling' },
    ];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result).toHaveLength(2);
    expect(result[0]).toContain('label: Deliv→Delivery');
    expect(result[1]).toContain('label: Handlng→Handling');
  });
});

// ── Same-position qty / price changes (no label change) ──────────────────────

describe('buildChargeAuditEntries — qty / price changes, same label', () => {
  it('reports qty change without "label" when label is unchanged', () => {
    const old: AuditOldCharge[] = [{ quantity: 1, unitPrice: '10.00', customLabel: 'Delivery' }];
    const next: AuditNewCharge[] = [{ quantity: 3, customPrice: 10, customLabel: 'Delivery' }];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('qty 1→3');
    expect(result[0]).not.toContain('label');
  });

  it('reports price change without "label" when label is unchanged', () => {
    const old: AuditOldCharge[] = [{ quantity: 1, unitPrice: '10.00', customLabel: 'Delivery' }];
    const next: AuditNewCharge[] = [{ quantity: 1, customPrice: 25, customLabel: 'Delivery' }];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('price £10.00→£25.00');
    expect(result[0]).not.toContain('label');
  });
});

// ── Count mismatch — falls back to label-based add / remove ──────────────────

describe('buildChargeAuditEntries — count mismatch (add / remove fallback)', () => {
  it('reports "Removed charge" when a charge is deleted', () => {
    const old: AuditOldCharge[] = [
      { quantity: 1, unitPrice: '10.00', customLabel: 'Delivery' },
      { quantity: 1, unitPrice: '5.00', customLabel: 'Handling' },
    ];
    const next: AuditNewCharge[] = [
      { quantity: 1, customPrice: 10, customLabel: 'Delivery' },
    ];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Removed charge: Handling');
  });

  it('reports "Added charge" when a new charge is added', () => {
    const old: AuditOldCharge[] = [{ quantity: 1, unitPrice: '10.00', customLabel: 'Delivery' }];
    const next: AuditNewCharge[] = [
      { quantity: 1, customPrice: 10, customLabel: 'Delivery' },
      { quantity: 1, customPrice: 5, customLabel: 'Handling' },
    ];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Added charge: Handling × 1 @ £5.00');
  });

  it('reports both Removed and Added when one charge is replaced (count differs)', () => {
    // 3 old, 2 new → count mismatch → label-based matching
    const old: AuditOldCharge[] = [
      { quantity: 1, unitPrice: '10.00', customLabel: 'Old Fee' },
      { quantity: 1, unitPrice: '5.00', customLabel: 'Delivery' },
      { quantity: 1, unitPrice: '3.00', customLabel: 'Packing' },
    ];
    const next: AuditNewCharge[] = [
      { quantity: 1, customPrice: 5, customLabel: 'Delivery' },
      { quantity: 1, customPrice: 8, customLabel: 'New Fee' },
    ];

    const result = buildChargeAuditEntries(old, next, fmt);

    expect(result.some((e) => e.startsWith('Removed charge: Old Fee'))).toBe(true);
    expect(result.some((e) => e.startsWith('Removed charge: Packing'))).toBe(true);
    expect(result.some((e) => e.startsWith('Added charge: New Fee'))).toBe(true);
  });

  it('returns empty array when both old and new charge lists are empty', () => {
    expect(buildChargeAuditEntries([], [], fmt)).toEqual([]);
  });
});
