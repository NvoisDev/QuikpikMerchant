export interface PriceRow {
  name: string;
  packSize: string;
  unitPrice: number;
  palletPrice: number | '';
  unitsPerPallet: number | '';
  rrp?: string | null;
  rrpMargin?: number | null;
  // Retailer economics columns (when showRetailerEconomics is true)
  retailerCostPerUnit?: number | null;
  retailerRrp?: number | null;
  retailerProfit?: number | null;
  retailerMargin?: number | null;
}

export async function fetchLogoBuffer(
  url: string,
): Promise<{ buffer: Buffer; extension: 'png' | 'jpeg' | 'gif' } | null> {
  try {
    const { safeFetch } = await import('./safeFetch.js');
    const res = await safeFetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    const extension: 'png' | 'jpeg' | 'gif' = ct.includes('png')
      ? 'png'
      : ct.includes('gif')
      ? 'gif'
      : 'jpeg';
    const buf = await res.arrayBuffer();
    return { buffer: Buffer.from(buf), extension };
  } catch {
    return null;
  }
}

export async function buildBrandedWorkbook({
  rows,
  subtitle,
  filename,
  logoBuffer,
  logoExtension,
  businessName,
  showRrp = false,
  showRrpMargin = false,
  showRetailerEconomics = false,
}: {
  rows: PriceRow[];
  subtitle: string;
  filename: string;
  logoBuffer?: Buffer;
  logoExtension?: 'png' | 'jpeg' | 'gif';
  businessName: string;
  showRrp?: boolean;
  showRrpMargin?: boolean;
  showRetailerEconomics?: boolean;
}): Promise<{ wb: any; filename: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Price List');

  // When retailer economics is ON: suppress standalone RRP/Margin cols — RETAIL section covers them.
  // Layout: 4 basic (Name, Pack, CasePrice, PalletPrice) + 4 retail = 8 cols (no Units/Pallet).
  const extraCols = showRetailerEconomics ? 0 : (showRrp ? 1 : 0) + (showRrpMargin ? 1 : 0);
  const colCount = showRetailerEconomics ? 8 : 5 + extraCols;

  // Column widths
  if (showRetailerEconomics) {
    // Unified 8-column retail economics layout
    ws.getColumn(1).width = 35; ws.getColumn(2).width = 18; ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 18; ws.getColumn(5).width = 18; ws.getColumn(6).width = 14;
    ws.getColumn(7).width = 14; ws.getColumn(8).width = 16;
  } else if (showRrp && showRrpMargin) {
    ws.getColumn(1).width = 30; ws.getColumn(2).width = 18; ws.getColumn(3).width = 13;
    ws.getColumn(4).width = 13; ws.getColumn(5).width = 15; ws.getColumn(6).width = 14;
    ws.getColumn(7).width = 16;
  } else if (showRrp) {
    ws.getColumn(1).width = 35; ws.getColumn(2).width = 18; ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 14; ws.getColumn(5).width = 18; ws.getColumn(6).width = 16;
  } else if (showRrpMargin) {
    ws.getColumn(1).width = 35; ws.getColumn(2).width = 18; ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 15; ws.getColumn(5).width = 18; ws.getColumn(6).width = 16;
  } else {
    ws.getColumn(1).width = 35; ws.getColumn(2).width = 18; ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 18; ws.getColumn(5).width = 16;
  }

  const emptyCells = Array(colCount).fill('');

  // Row 1: business name
  const r1 = ws.addRow([businessName, ...emptyCells.slice(1)]);
  r1.height = 28;
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF16a34a' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  // Row 2: subtitle
  const r2 = ws.addRow([subtitle, ...emptyCells.slice(1)]);
  r2.height = 16;
  r2.getCell(1).font = { size: 9, color: { argb: 'FF6b7280' } };

  // Row 3: spacer
  const r3 = ws.addRow(emptyCells);
  r3.height = 8;

  // Logo embedded top-right (anchored to rows 1-3)
  if (logoBuffer && logoExtension) {
    try {
      const imageId = wb.addImage({ buffer: logoBuffer, extension: logoExtension });
      const logoTlCol = showRetailerEconomics
        ? 3
        : (showRrp && showRrpMargin ? 5 : (showRrp || showRrpMargin) ? 4 : 3);
      const logoBrCol = logoTlCol + 1.99;
      ws.addImage(imageId, { tl: { col: logoTlCol, row: 0 }, br: { col: logoBrCol, row: 2.99 } } as any);
    } catch {}
  }

  // Row 4 (optional): "Retail" group header spanning the 4 retailer columns
  if (showRetailerEconomics) {
    const firstRetailCol = 5; // always col 5 in the 8-column layout
    const lastRetailCol = 8;  // 4 retail cols
    const retailGroupRow = ws.addRow(emptyCells);
    retailGroupRow.height = 16;
    for (let c = firstRetailCol; c <= lastRetailCol; c++) {
      const cell = retailGroupRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0fdf4' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF86efac' } } };
    }
    ws.mergeCells(retailGroupRow.number, firstRetailCol, retailGroupRow.number, lastRetailCol);
    const labelCell = retailGroupRow.getCell(firstRetailCol);
    labelCell.value = 'Retail';
    labelCell.font = { bold: true, size: 9, color: { argb: 'FF16a34a' } };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Column headers
  let headers: string[];
  if (showRetailerEconomics) {
    // 4 basic + 4 retail — standalone RRP/Margin suppressed (covered by RETAIL section)
    headers = [
      'Product Name', 'Pack Size / Unit', 'Case Price', 'Pallet Price',
      'Cost per Unit', 'RRP', 'Profit per Unit', 'Retail Margin (%)',
    ];
  } else {
    let baseHeaders: string[];
    if (showRrp && showRrpMargin) {
      baseHeaders = ['Product Name', 'Pack Size / Unit', 'Unit Price', 'Unit RRP', 'RRP Margin %', 'Pallet Price', 'Units per Pallet'];
    } else if (showRrp) {
      baseHeaders = ['Product Name', 'Pack Size / Unit', 'Unit Price', 'Unit RRP', 'Pallet Price', 'Units per Pallet'];
    } else if (showRrpMargin) {
      baseHeaders = ['Product Name', 'Pack Size / Unit', 'Unit Price', 'RRP Margin %', 'Pallet Price', 'Units per Pallet'];
    } else {
      baseHeaders = ['Product Name', 'Pack Size / Unit', 'Unit Price', 'Pallet Price', 'Units per Pallet'];
    }
    headers = baseHeaders;
  }

  const headerRow = ws.addRow(headers);
  headerRow.height = 20;
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FF1f2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    cell.alignment = { vertical: 'middle' };
  });
  // Shade the 4 retailer header cells green
  if (showRetailerEconomics) {
    for (let c = 5; c <= 8; c++) {
      const cell = headerRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdcfce7' } };
    }
  }

  // Data rows
  rows.forEach(row => {
    const marginDisplay = row.rrpMargin != null ? parseFloat(row.rrpMargin.toFixed(1)) : '—';
    let baseValues: any[];

    if (showRetailerEconomics) {
      // 4-col basic: Name, Pack, CasePrice, PalletPrice (no Units/Pallet in this layout)
      baseValues = [row.name, row.packSize, row.unitPrice, row.palletPrice];
    } else if (showRrp && showRrpMargin) {
      baseValues = [row.name, row.packSize, row.unitPrice, row.rrp || '—', marginDisplay, row.palletPrice, row.unitsPerPallet];
    } else if (showRrp) {
      baseValues = [row.name, row.packSize, row.unitPrice, row.rrp || '—', row.palletPrice, row.unitsPerPallet];
    } else if (showRrpMargin) {
      baseValues = [row.name, row.packSize, row.unitPrice, marginDisplay, row.palletPrice, row.unitsPerPallet];
    } else {
      baseValues = [row.name, row.packSize, row.unitPrice, row.palletPrice, row.unitsPerPallet];
    }

    const retailValues = showRetailerEconomics ? [
      row.retailerCostPerUnit != null ? row.retailerCostPerUnit : row.unitPrice,
      row.retailerRrp != null ? row.retailerRrp : '—',
      row.retailerProfit != null ? row.retailerProfit : '—',
      row.retailerMargin != null ? parseFloat(row.retailerMargin.toFixed(1)) : '—',
    ] : [];

    const dr = ws.addRow([...baseValues, ...retailValues]);
    dr.height = 18;
    dr.getCell(3).numFmt = '#,##0.00'; // price col always at position 3

    // Pallet price format
    const palletCol = showRetailerEconomics
      ? 4
      : (showRrp && showRrpMargin ? 6 : (showRrp || showRrpMargin) ? 5 : 4);
    if (baseValues[palletCol - 1] !== '') dr.getCell(palletCol).numFmt = '#,##0.00';

    // RRP margin % format (only in non-retailer-economics layout)
    if (!showRetailerEconomics && showRrpMargin && row.rrpMargin != null) {
      const marginCol = showRrp ? 5 : 4;
      dr.getCell(marginCol).numFmt = '0.0"%"';
    }

    // Retailer column formats
    if (showRetailerEconomics) {
      const base = 4; // cols 1-4 are basic in this layout
      dr.getCell(base + 1).numFmt = '#,##0.00'; // Cost per Unit
      if (row.retailerRrp != null)    dr.getCell(base + 2).numFmt = '#,##0.00'; // RRP
      if (row.retailerProfit != null) dr.getCell(base + 3).numFmt = '#,##0.00'; // Profit
      if (row.retailerMargin != null) dr.getCell(base + 4).numFmt = '0.0"%"';   // Margin
      for (let c = base + 1; c <= base + 4; c++) {
        dr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf9fefb' } };
      }
    }
  });

  return { wb, filename };
}

export async function buildBrandedPdf({
  rows,
  subtitle,
  logoBuffer,
  businessName,
  showRrp = false,
  showRrpMargin = false,
  showRetailerEconomics = false,
}: {
  rows: PriceRow[];
  subtitle: string;
  logoBuffer?: Buffer;
  businessName: string;
  showRrp?: boolean;
  showRrpMargin?: boolean;
  showRetailerEconomics?: boolean;
}): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;

  const landscape = showRetailerEconomics;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: landscape ? 'landscape' : 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = 50;
    const pageW = doc.page.width - margin * 2;
    const green = '#16a34a';

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, doc.page.width - 205, 48, { fit: [155, 62] });
      } catch {}
    }

    doc.fillColor(green).font('Helvetica-Bold').fontSize(18).text(businessName, margin, 50, { width: 310 });
    doc.fillColor('#6b7280').font('Helvetica').fontSize(9).text(subtitle, margin, 74, { width: 310 });

    const divY = 120;
    doc.strokeColor('#d1d5db').lineWidth(1)
      .moveTo(margin, divY).lineTo(doc.page.width - margin, divY).stroke();

    // Column layout — portrait: 50..545 = 495pt  landscape: 50..791 = 741pt
    let cols: Array<{ label: string; x: number; width: number }>;

    if (showRetailerEconomics) {
      // Single 8-column landscape layout — standalone RRP/Margin suppressed regardless of toggles
      cols = [
        { label: 'Product Name',      x: 50,  width: 150 },
        { label: 'Pack Size / Unit',  x: 205, width: 80  },
        { label: 'Case Price',        x: 290, width: 62  },
        { label: 'Pallet Price',      x: 357, width: 62  },
        { label: 'Cost per Unit',     x: 424, width: 68  },
        { label: 'RRP',               x: 497, width: 65  },
        { label: 'Profit per Unit',   x: 567, width: 65  },
        { label: 'Retail Margin (%)', x: 637, width: 70  },
      ];
    } else {
      // Portrait layout — original columns, completely unchanged
      if (showRrp && showRrpMargin) {
        cols = [
          { label: 'Product Name',    x: 50,  width: 145 },
          { label: 'Pack Size / Unit', x: 200, width: 80  },
          { label: 'Unit Price',       x: 285, width: 58  },
          { label: 'Unit RRP',         x: 348, width: 58  },
          { label: 'RRP Margin %',     x: 411, width: 58  },
          { label: 'Pallet Price',     x: 474, width: 71  },
        ];
      } else if (showRrp) {
        cols = [
          { label: 'Product Name',    x: 50,  width: 165 },
          { label: 'Pack Size / Unit', x: 220, width: 88  },
          { label: 'Unit Price',       x: 313, width: 68  },
          { label: 'Unit RRP',         x: 386, width: 68  },
          { label: 'Pallet Price',     x: 459, width: 86  },
        ];
      } else if (showRrpMargin) {
        cols = [
          { label: 'Product Name',    x: 50,  width: 165 },
          { label: 'Pack Size / Unit', x: 220, width: 88  },
          { label: 'Unit Price',       x: 313, width: 68  },
          { label: 'RRP Margin %',     x: 386, width: 68  },
          { label: 'Pallet Price',     x: 459, width: 86  },
        ];
      } else {
        cols = [
          { label: 'Product Name',    x: 50,  width: 195 },
          { label: 'Pack Size / Unit', x: 255, width: 108 },
          { label: 'Unit Price',       x: 373, width: 80  },
          { label: 'Pallet Price',     x: 463, width: 82  },
        ];
      }
    }

    let y = divY + 14;

    // Optional "RETAIL" section label above the retailer columns
    if (showRetailerEconomics) {
      const retailStartIdx = cols.findIndex(c => c.label === 'Cost per Unit');
      if (retailStartIdx >= 0) {
        const rx = cols[retailStartIdx]!.x - 4;
        const lastCol = cols[cols.length - 1]!;
        const rw = lastCol.x + lastCol.width - rx;
        doc.rect(rx, y - 2, rw, 14).fillColor('#f0fdf4').fill();
        doc.fillColor(green).font('Helvetica-Bold').fontSize(7)
          .text('RETAIL', rx + 2, y, { width: rw, align: 'center', lineBreak: false });
        y += 14;
      }
    }

    // Column header row
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(8);
    cols.forEach(col => doc.text(col.label, col.x, y, { width: col.width, lineBreak: false }));
    y += 14;
    doc.strokeColor('#e5e7eb').lineWidth(0.5)
      .moveTo(margin, y).lineTo(doc.page.width - margin, y).stroke();
    y += 7;

    // Data rows
    doc.font('Helvetica').fontSize(9);
    rows.forEach((row, i) => {
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }

      if (i % 2 === 0) {
        doc.rect(margin, y - 2, pageW, 16).fillColor('#f9fafb').fill();
      }

      const priceStr = row.unitPrice.toFixed(2);
      const retailCostStr = row.retailerCostPerUnit != null ? row.retailerCostPerUnit.toFixed(2) : priceStr;
      const palletStr = row.palletPrice !== '' ? (row.palletPrice as number).toFixed(2) : '—';
      const marginStr = row.rrpMargin != null ? `${row.rrpMargin.toFixed(1)}%` : '—';

      doc.fillColor('#111827');

      if (showRetailerEconomics) {
        // 8-column layout — fixed indices, no standalone RRP/Margin cols
        const [c0, c1, c2, c3, c4, c5, c6, c7] = cols;
        doc.text(row.name,      c0!.x, y, { width: c0!.width, lineBreak: false });
        doc.text(row.packSize,  c1!.x, y, { width: c1!.width, lineBreak: false });
        doc.text(priceStr,      c2!.x, y, { width: c2!.width, lineBreak: false });
        doc.text(palletStr,     c3!.x, y, { width: c3!.width, lineBreak: false });
        doc.text(retailCostStr, c4!.x, y, { width: c4!.width, lineBreak: false });
        doc.text(row.retailerRrp    != null ? row.retailerRrp.toFixed(2)    : '—', c5!.x, y, { width: c5!.width, lineBreak: false });
        doc.text(row.retailerProfit != null ? row.retailerProfit.toFixed(2) : '—', c6!.x, y, { width: c6!.width, lineBreak: false });
        doc.text(row.retailerMargin != null ? `${row.retailerMargin.toFixed(1)}%` : '—', c7!.x, y, { width: c7!.width, lineBreak: false });
      } else {
        // Portrait — original rendering, completely unchanged
        doc.text(row.name,     cols[0]!.x, y, { width: cols[0]!.width, lineBreak: false });
        doc.text(row.packSize, cols[1]!.x, y, { width: cols[1]!.width, lineBreak: false });
        doc.text(priceStr,     cols[2]!.x, y, { width: cols[2]!.width, lineBreak: false });

        if (showRrp && showRrpMargin) {
          doc.text(row.rrp || '—', cols[3]!.x, y, { width: cols[3]!.width, lineBreak: false });
          doc.text(marginStr,       cols[4]!.x, y, { width: cols[4]!.width, lineBreak: false });
          doc.text(palletStr,       cols[5]!.x, y, { width: cols[5]!.width, lineBreak: false });
        } else if (showRrp) {
          doc.text(row.rrp || '—', cols[3]!.x, y, { width: cols[3]!.width, lineBreak: false });
          doc.text(palletStr,       cols[4]!.x, y, { width: cols[4]!.width, lineBreak: false });
        } else if (showRrpMargin) {
          doc.text(marginStr,  cols[3]!.x, y, { width: cols[3]!.width, lineBreak: false });
          doc.text(palletStr,  cols[4]!.x, y, { width: cols[4]!.width, lineBreak: false });
        } else {
          doc.text(palletStr, cols[3]!.x, y, { width: cols[3]!.width, lineBreak: false });
        }
      }

      y += 18;
    });

    doc
      .fillColor('#9ca3af')
      .font('Helvetica')
      .fontSize(7)
      .text(
        `Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · Prices subject to change`,
        margin,
        doc.page.height - 45,
        { align: 'center', width: pageW },
      );

    doc.end();
  });
}
