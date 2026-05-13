/**
 * Unit tests for getFeeConfigForWholesaler fallback chain.
 *
 * We mock the DB layer so the logic can be verified without a live database.
 * Fallback chain under test:
 *   1. Per-wholesaler override columns (customerFeePercentage / customerFixedFee)
 *   2. System-wide platformFeeConfigs table (mocked to return 2.00% + £0.70)
 *   3. Hardcoded constants (5.5% + £0.50) — only reached when DB table is empty
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock drizzle db before importing the module under test ────────────────────
// We intercept db.select() chains so we can return controlled data.
let mockUserRow: { customerFeePercentage: string | null; customerFixedFee: string | null } | null = null;
let mockFeeConfigRow: { customerPercentageFee: string; customerFixedFee: string } | null = {
  customerPercentageFee: '0.0200',
  customerFixedFee: '0.70',
};

vi.mock('../server/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({ limit: () => Promise.resolve(mockUserRow ? [mockUserRow] : []) }),
        orderBy: () => ({ limit: () => Promise.resolve(mockFeeConfigRow ? [mockFeeConfigRow] : []) }),
      }),
    }),
  },
}));

// Mock schema so the import resolves (we don't exercise the real Drizzle query builder)
vi.mock('../shared/schema', () => ({
  platformFeeConfigs: {},
  users: {},
}));

// Import after mocks are in place
import { getCurrentFeeConfig, getFeeConfigForWholesaler } from '../server/utils/fee-config';

beforeEach(() => {
  mockUserRow = null;
  mockFeeConfigRow = { customerPercentageFee: '0.0200', customerFixedFee: '0.70' };
});

describe('getCurrentFeeConfig', () => {
  it('returns system-wide config from DB', async () => {
    const cfg = await getCurrentFeeConfig();
    expect(cfg.percentage).toBeCloseTo(0.02, 4);
    expect(cfg.fixed).toBeCloseTo(0.70, 2);
  });

  it('falls back to hardcoded defaults when DB table is empty', async () => {
    mockFeeConfigRow = null;
    const cfg = await getCurrentFeeConfig();
    // Hardcoded fallback: 1.5% + £0.50
    expect(cfg.percentage).toBeCloseTo(0.015, 4);
    expect(cfg.fixed).toBeCloseTo(0.50, 2);
  });
});

describe('getFeeConfigForWholesaler', () => {
  it('returns system config when no override is set (both null)', async () => {
    mockUserRow = { customerFeePercentage: null, customerFixedFee: null };
    const cfg = await getFeeConfigForWholesaler('ws-001');
    expect(cfg.percentage).toBeCloseTo(0.02, 4);
    expect(cfg.fixed).toBeCloseTo(0.70, 2);
  });

  it('returns system config when wholesaler not found', async () => {
    mockUserRow = null;
    const cfg = await getFeeConfigForWholesaler('nonexistent');
    expect(cfg.percentage).toBeCloseTo(0.02, 4);
    expect(cfg.fixed).toBeCloseTo(0.70, 2);
  });

  it('applies percentage override only, keeps system fixed fee', async () => {
    mockUserRow = { customerFeePercentage: '0.0150', customerFixedFee: null };
    const cfg = await getFeeConfigForWholesaler('ws-002');
    expect(cfg.percentage).toBeCloseTo(0.015, 4);
    expect(cfg.fixed).toBeCloseTo(0.70, 2);   // system fixed
  });

  it('applies fixed fee override only, keeps system percentage', async () => {
    mockUserRow = { customerFeePercentage: null, customerFixedFee: '0.50' };
    const cfg = await getFeeConfigForWholesaler('ws-003');
    expect(cfg.percentage).toBeCloseTo(0.02, 4);  // system pct
    expect(cfg.fixed).toBeCloseTo(0.50, 2);
  });

  it('applies both overrides when both are set', async () => {
    mockUserRow = { customerFeePercentage: '0.0300', customerFixedFee: '1.00' };
    const cfg = await getFeeConfigForWholesaler('ws-004');
    expect(cfg.percentage).toBeCloseTo(0.03, 4);
    expect(cfg.fixed).toBeCloseTo(1.00, 2);
  });

  it('handles zero percentage override (0% fee) — fixed is also zeroed so the total fee is £0', async () => {
    mockUserRow = { customerFeePercentage: '0.0000', customerFixedFee: null };
    const cfg = await getFeeConfigForWholesaler('ws-005');
    expect(cfg.percentage).toBe(0);
    expect(cfg.fixed).toBe(0);  // 0% means zero total fee; system fixed must NOT bleed in
  });

  it('handles zero fixed fee override', async () => {
    mockUserRow = { customerFeePercentage: null, customerFixedFee: '0.00' };
    const cfg = await getFeeConfigForWholesaler('ws-006');
    expect(cfg.percentage).toBeCloseTo(0.02, 4);  // system pct unchanged
    expect(cfg.fixed).toBe(0);
  });

  it('handles both overrides set to zero', async () => {
    mockUserRow = { customerFeePercentage: '0.0000', customerFixedFee: '0.00' };
    const cfg = await getFeeConfigForWholesaler('ws-007');
    expect(cfg.percentage).toBe(0);
    expect(cfg.fixed).toBe(0);
  });

  it('regression: totals unchanged for a no-override wholesaler', async () => {
    mockUserRow = { customerFeePercentage: null, customerFixedFee: null };
    const cfg = await getFeeConfigForWholesaler('ws-regression');
    // Must match exactly what getCurrentFeeConfig returns
    const systemCfg = await getCurrentFeeConfig();
    expect(cfg.percentage).toBe(systemCfg.percentage);
    expect(cfg.fixed).toBe(systemCfg.fixed);
  });
});
