/**
 * Regression tests for the RRP margin calculation used by the catalogue-export
 * route (GET /api/products/catalogue-export).
 *
 * Both the export spreadsheet/PDF and the product-card badge derive their
 * margin from the same packQuantity → quantityInPack → 1 fallback chain.
 * These tests pin that contract so a future edit to either path cannot
 * silently diverge.
 *
 * Covered in the unit-test suite:
 *   - only quantityInPack is set (no packQuantity) — fallback must be used
 *   - packQuantity takes precedence over quantityInPack when both are present
 *   - correct formula: ((rrp × qty − unitPrice) / (rrp × qty)) × 100
 *   - null rrp → null margin
 *   - zero / negative qty → null margin (guard against divide-by-zero)
 *   - zero rrp × qty → null margin
 *   - NaN qty (malformed string) → null (not NaN)
 *
 * Covered in the route-level suite:
 *   - GET /api/products/catalogue-export passes rrpMargin rows correctly
 *     when only quantityInPack is set
 *   - packQuantity takes precedence over quantityInPack at the route level
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Route-level mocks (hoisted so they apply before any import) ──────────────

vi.mock('../server/googleAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'test-wholesaler', role: 'wholesaler' };
    next();
  },
  getGoogleAuthUrl: vi.fn(),
  verifyGoogleToken: vi.fn(),
  createOrUpdateUser: vi.fn(),
  GoogleAuthBlockedError: class extends Error {},
}));

vi.mock('../server/storage', () => ({
  storage: {
    getProducts: vi.fn(),
    getUser: vi.fn(),
  },
}));

vi.mock('../server/utils/price-list-export', () => ({
  fetchLogoBuffer: vi.fn().mockResolvedValue(null),
  buildBrandedWorkbook: vi.fn(),
  buildBrandedPdf: vi.fn(),
}));

vi.mock('../server/email-templates', () => ({
  getEmailLogoUrl: vi.fn().mockReturnValue(null),
}));

// ─── Imports after mocks ───────────────────────────────────────────────────────

import request from 'supertest';
import express from 'express';
import { computeRrpMargin } from '../server/routes/catalogue-export-margin';
import { storage } from '../server/storage';
import { buildBrandedWorkbook } from '../server/utils/price-list-export';
import { registerProductRoutes } from '../server/routes/products';

const app = express();
app.use(express.json());
registerProductRoutes(app);

// ─── Shared mock product factory ───────────────────────────────────────────────

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    wholesalerId: 'test-wholesaler',
    name: 'Test Product',
    status: 'active',
    price: '10.00',
    rrp: '2.00',
    palletPrice: null,
    unitsPerPallet: null,
    unitSize: null,
    unitOfMeasure: null,
    packQuantity: null,
    quantityInPack: null,
    ...overrides,
  };
}

// Wholesaler with rrpMarginVisible = true so the route computes margins.
const MOCK_WHOLESALER = {
  id: 'test-wholesaler',
  businessName: 'Test Co',
  rrpVisible: true,
  rrpMarginVisible: true,
  logoType: null,
  logoUrl: null,
  updatedAt: null,
};

// Minimal xlsx workbook stub that produces a valid Buffer.
function makeWorkbookStub(rows: unknown[]) {
  return {
    wb: { xlsx: { writeBuffer: vi.fn().mockResolvedValue(Buffer.from('xlsx')) } },
    filename: 'test.xlsx',
    capturedRows: rows,
  };
}

// ─── Unit tests: computeRrpMargin helper ──────────────────────────────────────

describe('computeRrpMargin — packQuantity fallback chain', () => {
  it('uses quantityInPack when packQuantity is absent', () => {
    // unitPrice = £10, rrp = £2, qty = 6 (from quantityInPack)
    // rrpPack = 2 × 6 = 12; margin = (12 − 10) / 12 × 100 ≈ 16.666…
    const result = computeRrpMargin({
      packQuantity: null,
      quantityInPack: 6,
      unitPrice: 10,
      rrp: 2,
    });
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(((12 - 10) / 12) * 100, 6);
  });

  it('uses quantityInPack when packQuantity is undefined', () => {
    const result = computeRrpMargin({
      quantityInPack: 4,
      unitPrice: 8,
      rrp: 3,
    });
    // rrpPack = 3 × 4 = 12; margin = (12 − 8) / 12 × 100 ≈ 33.333…
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(((12 - 8) / 12) * 100, 6);
  });

  it('gives packQuantity precedence over quantityInPack when both are present', () => {
    // packQuantity = 12, quantityInPack = 6 — must use 12, not 6
    // unitPrice = £10, rrp = £2
    // rrpPack = 2 × 12 = 24; margin = (24 − 10) / 24 × 100 ≈ 58.333…
    const withPack = computeRrpMargin({
      packQuantity: 12,
      quantityInPack: 6,
      unitPrice: 10,
      rrp: 2,
    });
    const withQip = computeRrpMargin({
      packQuantity: null,
      quantityInPack: 6,
      unitPrice: 10,
      rrp: 2,
    });
    expect(withPack).not.toBeNull();
    expect(withQip).not.toBeNull();
    expect(withPack).not.toBeCloseTo(withQip!, 6);
    expect(withPack!).toBeCloseTo(((24 - 10) / 24) * 100, 6);
  });

  it('falls back to a quantity of 1 when both packQuantity and quantityInPack are absent', () => {
    // qty = 1; rrpPack = 5 × 1 = 5; margin = (5 − 3) / 5 × 100 = 40
    const result = computeRrpMargin({ unitPrice: 3, rrp: 5 });
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(40, 6);
  });
});

describe('computeRrpMargin — null / edge-case guards', () => {
  it('returns null when rrp is null', () => {
    expect(computeRrpMargin({ unitPrice: 10, rrp: null, quantityInPack: 6 })).toBeNull();
  });

  it('returns null when qty resolves to zero', () => {
    expect(
      computeRrpMargin({ packQuantity: 0, quantityInPack: 0, unitPrice: 10, rrp: 2 }),
    ).toBeNull();
  });

  it('returns null when rrp × qty is zero (rrp = 0)', () => {
    expect(computeRrpMargin({ unitPrice: 10, rrp: 0, quantityInPack: 6 })).toBeNull();
  });

  it('returns null (not NaN) when packQuantity is a non-numeric string', () => {
    const result = computeRrpMargin({
      packQuantity: 'bad-data',
      quantityInPack: null,
      unitPrice: 10,
      rrp: 2,
    });
    expect(result).toBeNull();
  });
});

describe('computeRrpMargin — formula correctness', () => {
  it('matches the inline formula from the catalogue-export route', () => {
    const packQuantity = 24;
    const unitPrice = 12;
    const rrp = 0.89;
    const rrpPack = rrp * packQuantity;
    const expected = ((rrpPack - unitPrice) / rrpPack) * 100;

    const result = computeRrpMargin({ packQuantity, unitPrice, rrp });
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(expected, 10);
  });
});

// ─── Route-level tests: GET /api/products/catalogue-export ────────────────────

describe('GET /api/products/catalogue-export — rrpMargin rows', () => {
  let capturedRows: any[] = [];

  beforeEach(() => {
    capturedRows = [];
    vi.mocked(storage.getUser).mockResolvedValue(MOCK_WHOLESALER as any);
    vi.mocked(buildBrandedWorkbook).mockImplementation(async (opts: any) => {
      capturedRows = opts.rows ?? [];
      return makeWorkbookStub(capturedRows) as any;
    });
  });

  it('uses quantityInPack for rrpMargin when packQuantity is absent', async () => {
    // product: price=£10, rrp=£2, quantityInPack=6, packQuantity=null
    // expected rrpMargin = (2×6 - 10) / (2×6) × 100 ≈ 16.666…
    vi.mocked(storage.getProducts).mockResolvedValue([
      makeProduct({ quantityInPack: 6, packQuantity: null }) as any,
    ]);

    await request(app).get('/api/products/catalogue-export').expect(200);

    expect(capturedRows).toHaveLength(1);
    const margin = capturedRows[0].rrpMargin as number;
    expect(margin).not.toBeNull();
    expect(margin).toBeCloseTo(((12 - 10) / 12) * 100, 4);
  });

  it('uses packQuantity (not quantityInPack) for rrpMargin when both are present', async () => {
    // packQuantity=12, quantityInPack=6 — must use 12
    // rrpPack = 2×12=24; margin = (24-10)/24×100 ≈ 58.333…
    vi.mocked(storage.getProducts).mockResolvedValue([
      makeProduct({ packQuantity: 12, quantityInPack: 6 }) as any,
    ]);

    await request(app).get('/api/products/catalogue-export').expect(200);

    expect(capturedRows).toHaveLength(1);
    const margin = capturedRows[0].rrpMargin as number;
    expect(margin).not.toBeNull();
    // Must NOT equal the quantityInPack-only result (≈ 16.666)
    expect(margin).not.toBeCloseTo(((12 - 10) / 12) * 100, 1);
    expect(margin).toBeCloseTo(((24 - 10) / 24) * 100, 4);
  });
});
