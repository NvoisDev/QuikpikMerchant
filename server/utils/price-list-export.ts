export interface PriceRow {
  name: string;
  packSize: string;
  unitPrice: number;
  palletPrice: number | '';
  unitsPerPallet: number | '';
  rrp?: string | null;
  rrpMargin?: number | null;
  // Retailer economics columns (when showRetailerEconomics is true)
  retailerRrp?: number | null;
  retailerProfit?: number | null;
  retailerMargin?: number | null;
  bulkBuy?: number | null;
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

  const extraCols = (showRrp ? 1 : 0) + (showRrpMargin ? 1 : 0);
  const retailerCols = showRetailerEconomics ? 5 : 0;
  const colCount = 5 + extraCols + retailerCols;

  // Column widths — preserved exactly from pre-feature state so toggle-off output is unchanged
  if (showRrp && showRrpMargin) {
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
  if (showRetailerEconomics) {
    const base = 5 + extraCols;
    ws.getColumn(base + 1).width = 18; // Total Cost per Unit (Retailer)
    ws.getColumn(base + 2).width = 14; // RRP (Retailer)
    ws.getColumn(base + 3).width = 14; // Profit (Retailer)
    ws.getColumn(base + 4).width = 14; // Retail Margin
    ws.getColumn(base + 5).width = 14; // Bulk Buy
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

  // Logo embedded top-right (anchored to rows 1-3, safe regardless of header rows below)
  if (logoBuffer && logoExtension) {
    try {
      const imageId = wb.addImage({ buffer: logoBuffer, extension: logoExtension });
      const logoTlCol = showRrp && showRrpMargin ? 5 : (showRrp || showRrpMargin) ? 4 : 3;
      const logoBrCol = logoTlCol + 1.99;
      ws.addImage(imageId, { tl: { col: logoTlCol, row: 0 }, br: { col: logoBrCol, row: 2.99 } } as any);
    } catch {}
  }

  // Row 4 (optional): "Retail" group header row spanning the 5 retailer columns
  if (showRetailerEconomics) {
    const firstRetailCol = 5 + extraCols + 1; // 1-indexed
    const lastRetailCol = firstRetailCol + 4;
    const retailGroupRow = ws.addRow(emptyCells);
    retailGroupRow.height = 16;
    // Fill retailer cells with light-green background
    for (let c = firstRetailCol; c <= lastRetailCol; c++) {
      const cell = retailGroupRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf0fdf4' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF86efac' } } };
    }
    // Merge and label
    ws.mergeCells(retailGroupRow.number, firstRetailCol, retailGroupRow.number, lastRetailCol);
    const labelCell = retailGroupRow.getCell(firstRetailCol);
    labelCell.value = 'Retail';
    labelCell.font = { bold: true, size: 9, color: { argb: 'FF16a34a' } };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Column headers
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
  const headers = showRetailerEconomics
    ? [...baseHeaders, 'Total Cost per Unit (Retailer)', 'RRP (Retailer)', 'Profit (Retailer)', 'Retail Margin', 'Bulk Buy']
    : baseHeaders;

  const headerRow = ws.addRow(headers);
  headerRow.height = 20;
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FF1f2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    cell.alignment = { vertical: 'middle' };
  });
  // Shade the retailer header cells green
  if (showRetailerEconomics) {
    const firstRetailCol = 5 + extraCols + 1;
    for (let c = firstRetailCol; c <= firstRetailCol + 4; c++) {
      const cell = headerRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdcfce7' } };
    }
  }

  // Data rows
  rows.forEach(row => {
    const marginDisplay = row.rrpMargin != null ? parseFloat(row.rrpMargin.toFixed(1)) : '—';
    let baseValues: any[];

    if (showRrp && showRrpMargin) {
      baseValues = [row.name, row.packSize, row.unitPrice, row.rrp || '—', marginDisplay, row.palletPrice, row.unitsPerPallet];
    } else if (showRrp) {
      baseValues = [row.name, row.packSize, row.unitPrice, row.rrp || '—', row.palletPrice, row.unitsPerPallet];
    } else if (showRrpMargin) {
      baseValues = [row.name, row.packSize, row.unitPrice, marginDisplay, row.palletPrice, row.unitsPerPallet];
    } else {
      baseValues = [row.name, row.packSize, row.unitPrice, row.palletPrice, row.unitsPerPallet];
    }

    const retailValues = showRetailerEconomics ? [
      row.unitPrice,
      row.retailerRrp != null ? row.retailerRrp : '—',
      row.retailerProfit != null ? row.retailerProfit : '—',
      row.retailerMargin != null ? parseFloat(row.retailerMargin.toFixed(1)) : '—',
      row.bulkBuy != null ? row.bulkBuy : '—',
    ] : [];

    const dr = ws.addRow([...baseValues, ...retailValues]);
    dr.height = 18;
    dr.getCell(3).numFmt = '#,##0.00';

    // Pallet price format
    const palletCol = showRrp && showRrpMargin ? 6 : (showRrp || showRrpMargin) ? 5 : 4;
    if (baseValues[palletCol - 1] !== '') dr.getCell(palletCol).numFmt = '#,##0.00';

    // RRP margin format
    if (showRrpMargin && row.rrpMargin != null) {
      const marginCol = showRrp ? 5 : 4;
      dr.getCell(marginCol).numFmt = '0.0"%"';
    }

    // Retailer column formats
    if (showRetailerEconomics) {
      const base = 5 + extraCols;
      dr.getCell(base + 1).numFmt = '#,##0.00'; // Total Cost
      if (row.retailerRrp != null) dr.getCell(base + 2).numFmt = '#,##0.00'; // RRP
      if (row.retailerProfit != null) dr.getCell(base + 3).numFmt = '#,##0.00'; // Profit
      if (row.retailerMargin != null) dr.getCell(base + 4).numFmt = '0.0"%"'; // Margin
      if (row.bulkBuy != null) dr.getCell(base + 5).numFmt = '#,##0.00'; // Bulk Buy
      // Light background on retailer cells
      for (let c = base + 1; c <= base + 5; c++) {
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

  // Use landscape when retailer economics are shown — adds ~250pt usable width
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

    // Logo top-right
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, doc.page.width - 205, 48, { fit: [155, 62] });
      } catch {}
    }

    // Business name + subtitle top-left
    doc.fillColor(green).font('Helvetica-Bold').fontSize(18).text(businessName, margin, 50, { width: 310 });
    doc.fillColor('#6b7280').font('Helvetica').fontSize(9).text(subtitle, margin, 74, { width: 310 });

    // Divider
    const divY = 120;
    doc.strokeColor('#d1d5db').lineWidth(1)
      .moveTo(margin, divY).lineTo(doc.page.width - margin, divY).stroke();

    // Column layout — portrait: 50..545 = 495pt  landscape: 50..791 = 741pt
    let cols: Array<{ label: string; x: number; width: number }>;

    if (showRetailerEconomics) {
      // Landscape layout — base wholesale cols + 5 retailer cols
      if (showRrp && showRrpMargin) {
        cols = [
          { label: 'Product Name',         x: 50,  width: 120 },
          { label: 'Pack Size / Unit',      x: 175, width: 70  },
          { label: 'Unit Price',            x: 250, width: 52  },
          { label: 'Unit RRP',              x: 307, width: 52  },
          { label: 'RRP Margin %',          x: 364, width: 52  },
          { label: 'Pallet Price',          x: 421, width: 52  },
          { label: 'Cost per Unit',         x: 478, width: 58  },
          { label: 'RRP (Retailer)',        x: 541, width: 52  },
          { label: 'Profit per Unit',       x: 598, width: 52  },
          { label: 'Retail Margin',         x: 655, width: 52  },
          { label: 'Bulk Buy',              x: 712, width: 54  },
        ];
      } else if (showRrp) {
        cols = [
          { label: 'Product Name',         x: 50,  width: 130 },
          { label: 'Pack Size / Unit',      x: 185, width: 75  },
          { label: 'Unit Price',            x: 265, width: 55  },
          { label: 'Unit RRP',              x: 325, width: 55  },
          { label: 'Pallet Price',          x: 385, width: 55  },
          { label: 'Cost per Unit',         x: 445, width: 62  },
          { label: 'RRP (Retailer)',        x: 512, width: 56  },
          { label: 'Profit per Unit',       x: 573, width: 56  },
          { label: 'Retail Margin',         x: 634, width: 54  },
          { label: 'Bulk Buy',              x: 693, width: 58  },
        ];
      } else if (showRrpMargin) {
        cols = [
          { label: 'Product Name',         x: 50,  width: 130 },
          { label: 'Pack Size / Unit',      x: 185, width: 75  },
          { label: 'Unit Price',            x: 265, width: 55  },
          { label: 'RRP Margin %',          x: 325, width: 55  },
          { label: 'Pallet Price',          x: 385, width: 55  },
          { label: 'Cost per Unit',         x: 445, width: 62  },
          { label: 'RRP (Retailer)',        x: 512, width: 56  },
          { label: 'Profit per Unit',       x: 573, width: 56  },
          { label: 'Retail Margin',         x: 634, width: 54  },
          { label: 'Bulk Buy',              x: 693, width: 58  },
        ];
      } else {
        cols = [
          { label: 'Product Name',         x: 50,  width: 155 },
          { label: 'Pack Size / Unit',      x: 210, width: 85  },
          { label: 'Unit Price',            x: 300, width: 60  },
          { label: 'Pallet Price',          x: 365, width: 60  },
          { label: 'Cost per Unit',         x: 430, width: 65  },
          { label: 'RRP (Retailer)',        x: 500, width: 58  },
          { label: 'Profit per Unit',       x: 563, width: 58  },
          { label: 'Retail Margin',         x: 626, width: 58  },
          { label: 'Bulk Buy',              x: 689, width: 62  },
        ];
      }
    } else {
      // Portrait layout — original columns
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

    // Optional "Retail" section label above the retailer columns
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
      const palletStr = row.palletPrice !== '' ? (row.palletPrice as number).toFixed(2) : '—';
      const marginStr = row.rrpMargin != null ? `${row.rrpMargin.toFixed(1)}%` : '—';

      doc.fillColor('#111827');

      if (showRetailerEconomics) {
        const [c0, c1, c2, c3, c4] = [cols[0]!, cols[1]!, cols[2]!, cols[3]!, cols[4]!];
        doc.text(row.name,     c0.x, y, { width: c0.width, lineBreak: false });
        doc.text(row.packSize, c1.x, y, { width: c1.width, lineBreak: false });
        doc.text(priceStr,     c2.x, y, { width: c2.width, lineBreak: false });

        if (showRrp && showRrpMargin) {
          doc.text(row.rrp || '—', c3.x, y, { width: c3.width, lineBreak: false });
          doc.text(marginStr, c4.x, y, { width: c4.width, lineBreak: false });
          doc.text(palletStr, cols[5]!.x, y, { width: cols[5]!.width, lineBreak: false });
          const retailBase = 6;
          doc.text(priceStr, cols[retailBase]!.x, y, { width: cols[retailBase]!.width, lineBreak: false });
          doc.text(row.retailerRrp != null ? row.retailerRrp.toFixed(2) : '—', cols[retailBase+1]!.x, y, { width: cols[retailBase+1]!.width, lineBreak: false });
          doc.text(row.retailerProfit != null ? row.retailerProfit.toFixed(2) : '—', cols[retailBase+2]!.x, y, { width: cols[retailBase+2]!.width, lineBreak: false });
          doc.text(row.retailerMargin != null ? `${row.retailerMargin.toFixed(1)}%` : '—', cols[retailBase+3]!.x, y, { width: cols[retailBase+3]!.width, lineBreak: false });
          doc.text(row.bulkBuy != null ? row.bulkBuy.toFixed(2) : '—', cols[retailBase+4]!.x, y, { width: cols[retailBase+4]!.width, lineBreak: false });
        } else if (showRrp || showRrpMargin) {
          doc.text(showRrp ? (row.rrp || '—') : marginStr, c3.x, y, { width: c3.width, lineBreak: false });
          doc.text(palletStr, c4.x, y, { width: c4.width, lineBreak: false });
          const retailBase = 5;
          doc.text(priceStr, cols[retailBase]!.x, y, { width: cols[retailBase]!.width, lineBreak: false });
          doc.text(row.retailerRrp != null ? row.retailerRrp.toFixed(2) : '—', cols[retailBase+1]!.x, y, { width: cols[retailBase+1]!.width, lineBreak: false });
          doc.text(row.retailerProfit != null ? row.retailerProfit.toFixed(2) : '—', cols[retailBase+2]!.x, y, { width: cols[retailBase+2]!.width, lineBreak: false });
          doc.text(row.retailerMargin != null ? `${row.retailerMargin.toFixed(1)}%` : '—', cols[retailBase+3]!.x, y, { width: cols[retailBase+3]!.width, lineBreak: false });
          doc.text(row.bulkBuy != null ? row.bulkBuy.toFixed(2) : '—', cols[retailBase+4]!.x, y, { width: cols[retailBase+4]!.width, lineBreak: false });
        } else {
          doc.text(palletStr, c3.x, y, { width: c3.width, lineBreak: false });
          const retailBase = 4;
          doc.text(priceStr, cols[retailBase]!.x, y, { width: cols[retailBase]!.width, lineBreak: false });
          doc.text(row.retailerRrp != null ? row.retailerRrp.toFixed(2) : '—', cols[retailBase+1]!.x, y, { width: cols[retailBase+1]!.width, lineBreak: false });
          doc.text(row.retailerProfit != null ? row.retailerProfit.toFixed(2) : '—', cols[retailBase+2]!.x, y, { width: cols[retailBase+2]!.width, lineBreak: false });
          doc.text(row.retailerMargin != null ? `${row.retailerMargin.toFixed(1)}%` : '—', cols[retailBase+3]!.x, y, { width: cols[retailBase+3]!.width, lineBreak: false });
          doc.text(row.bulkBuy != null ? row.bulkBuy.toFixed(2) : '—', cols[retailBase+4]!.x, y, { width: cols[retailBase+4]!.width, lineBreak: false });
        }
      } else {
        // Portrait — original rendering
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

    // Footer
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
