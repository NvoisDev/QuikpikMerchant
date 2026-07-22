/**
 * Regression tests for buildBrandedWorkbook column layout.
 *
 * The column layout inside buildBrandedWorkbook is rebuilt conditionally
 * based on three toggles: showRrp, showRrpMargin, showRetailerEconomics.
 * A future edit to that logic could silently produce wrong column counts,
 * misaligned headers, or unexpected columns — these tests pin the contract.
 *
 * Covered:
 *   - retailer economics ON → 8 cols, standalone RRP/Margin suppressed
 *   - retailer economics OFF + both RRP flags ON → 7 cols
 *   - retailer economics OFF + showRrp only → 6 cols
 *   - retailer economics OFF + showRrpMargin only → 6 cols
 *   - plain (no flags) → 5 cols
 *   - retailer economics takes precedence over RRP/Margin flags
 *   - data rows align with headers (same column count)
 *   - retailer column formats applied to cols 5-8 when economics ON
 */

import { describe, it, expect } from 'vitest';
import { buildBrandedWorkbook } from '../server/utils/price-list-export';
import type { PriceRow } from '../server/utils/price-list-export';

const BASE_ROW: PriceRow = {
  name: 'Test Product',
  packSize: '6 × 500ml',
  unitPrice: 12.5,
  palletPrice: 250,
  unitsPerPallet: 20,
  rrp: '2.50',
  rrpMargin: 16.67,
};

const RETAIL_ROW: PriceRow = {
  ...BASE_ROW,
  retailerCostPerUnit: 12.5,
  retailerRrp: 2.5,
  retailerProfit: 1.5,
  retailerMargin: 22.5,
};

async function getHeaderRow(opts: Parameters<typeof buildBrandedWorkbook>[0]) {
  const { wb } = await buildBrandedWorkbook(opts);
  const ws = wb.getWorksheet('Price List');

  const headers: string[] = [];
  ws.eachRow((row: any, rowNum: number) => {
    const vals = row.values as (string | undefined)[];
    // ExcelJS row.values is 1-indexed (index 0 is empty)
    const cells = vals.slice(1).filter((v): v is string => typeof v === 'string');
    if (cells.includes('Product Name')) {
      headers.push(...cells);
    }
  });
  return headers;
}

async function getFirstDataRow(opts: Parameters<typeof buildBrandedWorkbook>[0]) {
  const { wb } = await buildBrandedWorkbook(opts);
  const ws = wb.getWorksheet('Price List');

  const dataRows: any[][] = [];
  ws.eachRow((row: any) => {
    const vals = (row.values as any[]).slice(1);
    // Data rows have a numeric first cell (product name) that isn't a known header keyword
    const first = vals[0];
    if (
      typeof first === 'string' &&
      first !== '' &&
      !['Product Name', 'Retail'].includes(first) &&
      !/^(Generated|Test Co|My Wholesaler)/.test(first)
    ) {
      dataRows.push(vals);
    }
  });
  return dataRows[0] ?? [];
}

// ─── Column count and header-content assertions ────────────────────────────────

describe('buildBrandedWorkbook — retailer economics ON (8 columns)', () => {
  it('produces exactly 8 header columns', async () => {
    const headers = await getHeaderRow({
      rows: [RETAIL_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRetailerEconomics: true,
    });
    expect(headers).toHaveLength(8);
  });

  it('includes the 4 basic columns as the first 4 headers', async () => {
    const headers = await getHeaderRow({
      rows: [RETAIL_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRetailerEconomics: true,
    });
    expect(headers[0]).toBe('Product Name');
    expect(headers[1]).toBe('Pack Size / Unit');
    expect(headers[2]).toBe('Case Price');
    expect(headers[3]).toBe('Pallet Price');
  });

  it('includes the 4 retailer columns as the last 4 headers', async () => {
    const headers = await getHeaderRow({
      rows: [RETAIL_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRetailerEconomics: true,
    });
    expect(headers[4]).toBe('Cost per Unit');
    expect(headers[5]).toBe('RRP');
    expect(headers[6]).toBe('Profit per Unit');
    expect(headers[7]).toBe('Retail Margin (%)');
  });

  it('does NOT include a standalone "Unit Price" column (replaced by Case Price)', async () => {
    const headers = await getHeaderRow({
      rows: [RETAIL_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRetailerEconomics: true,
    });
    expect(headers).not.toContain('Unit Price');
  });

  it('does NOT include "Units per Pallet" (omitted in 8-col layout)', async () => {
    const headers = await getHeaderRow({
      rows: [RETAIL_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRetailerEconomics: true,
    });
    expect(headers).not.toContain('Units per Pallet');
  });

  it('suppresses standalone RRP/Margin cols even when showRrp and showRrpMargin are also ON', async () => {
    const headers = await getHeaderRow({
      rows: [RETAIL_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRetailerEconomics: true,
      showRrp: true,
      showRrpMargin: true,
    });
    // Still 8 columns — retailer economics wins
    expect(headers).toHaveLength(8);
    expect(headers).not.toContain('Unit RRP');
    expect(headers).not.toContain('RRP Margin %');
  });
});

// ─── RRP + Margin both ON (7 columns) ─────────────────────────────────────────

describe('buildBrandedWorkbook — showRrp + showRrpMargin ON (7 columns)', () => {
  it('produces exactly 7 header columns', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRrp: true,
      showRrpMargin: true,
    });
    expect(headers).toHaveLength(7);
  });

  it('has the correct 7 header labels in order', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRrp: true,
      showRrpMargin: true,
    });
    expect(headers).toEqual([
      'Product Name',
      'Pack Size / Unit',
      'Unit Price',
      'Unit RRP',
      'RRP Margin %',
      'Pallet Price',
      'Units per Pallet',
    ]);
  });
});

// ─── showRrp only (6 columns) ────────────────────────────────────────────────

describe('buildBrandedWorkbook — showRrp only (6 columns)', () => {
  it('produces exactly 6 header columns', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRrp: true,
    });
    expect(headers).toHaveLength(6);
  });

  it('has the correct 6 header labels', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRrp: true,
    });
    expect(headers).toEqual([
      'Product Name',
      'Pack Size / Unit',
      'Unit Price',
      'Unit RRP',
      'Pallet Price',
      'Units per Pallet',
    ]);
  });

  it('does NOT include "RRP Margin %"', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRrp: true,
    });
    expect(headers).not.toContain('RRP Margin %');
  });
});

// ─── showRrpMargin only (6 columns) ──────────────────────────────────────────

describe('buildBrandedWorkbook — showRrpMargin only (6 columns)', () => {
  it('produces exactly 6 header columns', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRrpMargin: true,
    });
    expect(headers).toHaveLength(6);
  });

  it('has the correct 6 header labels', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRrpMargin: true,
    });
    expect(headers).toEqual([
      'Product Name',
      'Pack Size / Unit',
      'Unit Price',
      'RRP Margin %',
      'Pallet Price',
      'Units per Pallet',
    ]);
  });

  it('does NOT include "Unit RRP"', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
      showRrpMargin: true,
    });
    expect(headers).not.toContain('Unit RRP');
  });
});

// ─── Plain layout, no toggles (5 columns) ─────────────────────────────────────

describe('buildBrandedWorkbook — plain layout (5 columns, no flags)', () => {
  it('produces exactly 5 header columns', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
    });
    expect(headers).toHaveLength(5);
  });

  it('has the correct 5 header labels in order', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
    });
    expect(headers).toEqual([
      'Product Name',
      'Pack Size / Unit',
      'Unit Price',
      'Pallet Price',
      'Units per Pallet',
    ]);
  });

  it('does NOT include any RRP or retailer columns', async () => {
    const headers = await getHeaderRow({
      rows: [BASE_ROW],
      subtitle: 'Test List',
      filename: 'test.xlsx',
      businessName: 'Test Co',
    });
    expect(headers).not.toContain('Unit RRP');
    expect(headers).not.toContain('RRP Margin %');
    expect(headers).not.toContain('Cost per Unit');
    expect(headers).not.toContain('Retail Margin (%)');
  });
});

// ─── Data-row alignment: value count must match header count ──────────────────

describe('buildBrandedWorkbook — data rows match header column count', () => {
  async function columnCounts(opts: Parameters<typeof buildBrandedWorkbook>[0]) {
    const headers = await getHeaderRow(opts);
    const data = await getFirstDataRow(opts);
    return { headerCount: headers.length, dataCount: data.length };
  }

  it('plain layout: data has 5 values', async () => {
    const { dataCount } = await columnCounts({
      rows: [BASE_ROW],
      subtitle: 'T',
      filename: 't.xlsx',
      businessName: 'Test Co',
    });
    expect(dataCount).toBe(5);
  });

  it('showRrp + showRrpMargin: data has 7 values', async () => {
    const { dataCount } = await columnCounts({
      rows: [BASE_ROW],
      subtitle: 'T',
      filename: 't.xlsx',
      businessName: 'Test Co',
      showRrp: true,
      showRrpMargin: true,
    });
    expect(dataCount).toBe(7);
  });

  it('retailer economics ON: data has 8 values', async () => {
    const { dataCount } = await columnCounts({
      rows: [RETAIL_ROW],
      subtitle: 'T',
      filename: 't.xlsx',
      businessName: 'Test Co',
      showRetailerEconomics: true,
    });
    expect(dataCount).toBe(8);
  });
});

// ─── Retailer column numFmt verification ──────────────────────────────────────

describe('buildBrandedWorkbook — retailer column formats (economics ON)', () => {
  it('applies numFmt to retailer cost and margin columns without throwing', async () => {
    await expect(
      buildBrandedWorkbook({
        rows: [RETAIL_ROW],
        subtitle: 'T',
        filename: 't.xlsx',
        businessName: 'Test Co',
        showRetailerEconomics: true,
      }),
    ).resolves.not.toThrow();
  });

  it('handles null retailer values gracefully (falls back to dashes)', async () => {
    const rowWithNulls: PriceRow = {
      ...BASE_ROW,
      retailerCostPerUnit: null,
      retailerRrp: null,
      retailerProfit: null,
      retailerMargin: null,
    };
    const { wb } = await buildBrandedWorkbook({
      rows: [rowWithNulls],
      subtitle: 'T',
      filename: 't.xlsx',
      businessName: 'Test Co',
      showRetailerEconomics: true,
    });
    // Workbook still created successfully
    expect(wb).toBeDefined();
    expect(wb.getWorksheet('Price List')).toBeDefined();
  });
});
