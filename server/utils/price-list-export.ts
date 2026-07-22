export interface PriceRow {
  name: string;
  packSize: string;
  unitPrice: number;
  palletPrice: number | '';
  unitsPerPallet: number | '';
  rrp?: string | null;
  rrpMargin?: number | null;
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
}: {
  rows: PriceRow[];
  subtitle: string;
  filename: string;
  logoBuffer?: Buffer;
  logoExtension?: 'png' | 'jpeg' | 'gif';
  businessName: string;
  showRrp?: boolean;
  showRrpMargin?: boolean;
}): Promise<{ wb: any; filename: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Price List');

  const extraCols = (showRrp ? 1 : 0) + (showRrpMargin ? 1 : 0);
  const colCount = 5 + extraCols;

  if (showRrp && showRrpMargin) {
    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 13;
    ws.getColumn(4).width = 13;
    ws.getColumn(5).width = 15;
    ws.getColumn(6).width = 14;
    ws.getColumn(7).width = 16;
  } else if (showRrp) {
    ws.getColumn(1).width = 35;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 14;
    ws.getColumn(5).width = 18;
    ws.getColumn(6).width = 16;
  } else if (showRrpMargin) {
    ws.getColumn(1).width = 35;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 15;
    ws.getColumn(5).width = 18;
    ws.getColumn(6).width = 16;
  } else {
    ws.getColumn(1).width = 35;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 16;
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

  // Logo embedded top-right
  if (logoBuffer && logoExtension) {
    try {
      const imageId = wb.addImage({ buffer: logoBuffer, extension: logoExtension });
      const logoTlCol = showRrp && showRrpMargin ? 5 : (showRrp || showRrpMargin) ? 4 : 3;
      const logoBrCol = logoTlCol + 1.99;
      ws.addImage(imageId, { tl: { col: logoTlCol, row: 0 }, br: { col: logoBrCol, row: 2.99 } } as any);
    } catch {}
  }

  // Row 4: column headers
  let headers: string[];
  if (showRrp && showRrpMargin) {
    headers = ['Product Name', 'Pack Size / Unit', 'Unit Price', 'Unit RRP', 'RRP Margin %', 'Pallet Price', 'Units per Pallet'];
  } else if (showRrp) {
    headers = ['Product Name', 'Pack Size / Unit', 'Unit Price', 'Unit RRP', 'Pallet Price', 'Units per Pallet'];
  } else if (showRrpMargin) {
    headers = ['Product Name', 'Pack Size / Unit', 'Unit Price', 'RRP Margin %', 'Pallet Price', 'Units per Pallet'];
  } else {
    headers = ['Product Name', 'Pack Size / Unit', 'Unit Price', 'Pallet Price', 'Units per Pallet'];
  }

  const headerRow = ws.addRow(headers);
  headerRow.height = 20;
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FF1f2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    cell.alignment = { vertical: 'middle' };
  });

  // Data rows
  rows.forEach(row => {
    let dr: any;
    const marginDisplay = row.rrpMargin != null ? parseFloat(row.rrpMargin.toFixed(1)) : '—';

    if (showRrp && showRrpMargin) {
      dr = ws.addRow([
        row.name,
        row.packSize,
        row.unitPrice,
        row.rrp || '—',
        marginDisplay,
        row.palletPrice,
        row.unitsPerPallet,
      ]);
      dr.height = 18;
      dr.getCell(3).numFmt = '#,##0.00';
      if (row.palletPrice !== '') dr.getCell(6).numFmt = '#,##0.00';
      if (row.rrpMargin != null) dr.getCell(5).numFmt = '0.0"%"';
    } else if (showRrp) {
      dr = ws.addRow([
        row.name,
        row.packSize,
        row.unitPrice,
        row.rrp || '—',
        row.palletPrice,
        row.unitsPerPallet,
      ]);
      dr.height = 18;
      dr.getCell(3).numFmt = '#,##0.00';
      if (row.palletPrice !== '') dr.getCell(5).numFmt = '#,##0.00';
    } else if (showRrpMargin) {
      dr = ws.addRow([
        row.name,
        row.packSize,
        row.unitPrice,
        marginDisplay,
        row.palletPrice,
        row.unitsPerPallet,
      ]);
      dr.height = 18;
      dr.getCell(3).numFmt = '#,##0.00';
      if (row.palletPrice !== '') dr.getCell(5).numFmt = '#,##0.00';
      if (row.rrpMargin != null) dr.getCell(4).numFmt = '0.0"%"';
    } else {
      dr = ws.addRow([
        row.name,
        row.packSize,
        row.unitPrice,
        row.palletPrice,
        row.unitsPerPallet,
      ]);
      dr.height = 18;
      dr.getCell(3).numFmt = '#,##0.00';
      if (row.palletPrice !== '') dr.getCell(4).numFmt = '#,##0.00';
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
}: {
  rows: PriceRow[];
  subtitle: string;
  logoBuffer?: Buffer;
  businessName: string;
  showRrp?: boolean;
  showRrpMargin?: boolean;
}): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width - 100;
    const green = '#16a34a';

    // Logo top-right
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, doc.page.width - 205, 48, { fit: [155, 62] });
      } catch {}
    }

    // Business name + subtitle top-left
    doc.fillColor(green).font('Helvetica-Bold').fontSize(18).text(businessName, 50, 50, { width: 310 });
    doc.fillColor('#6b7280').font('Helvetica').fontSize(9).text(subtitle, 50, 74, { width: 310 });

    // Divider
    const divY = 120;
    doc.strokeColor('#d1d5db').lineWidth(1).moveTo(50, divY).lineTo(doc.page.width - 50, divY).stroke();

    // Column layout
    // Page usable width: 50 to 545 = 495pt
    let cols: Array<{ label: string; x: number; width: number }>;
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

    let y = divY + 14;

    // Column header row
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(8);
    cols.forEach(col => doc.text(col.label, col.x, y, { width: col.width }));
    y += 14;
    doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
    y += 7;

    // Data rows
    doc.font('Helvetica').fontSize(9);
    rows.forEach((row, i) => {
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }

      if (i % 2 === 0) {
        doc.rect(50, y - 2, pageW, 16).fillColor('#f9fafb').fill();
      }

      const priceStr = row.unitPrice.toFixed(2);
      const palletStr = row.palletPrice !== '' ? (row.palletPrice as number).toFixed(2) : '—';
      const marginStr = row.rrpMargin != null ? `${row.rrpMargin.toFixed(1)}%` : '—';

      doc.fillColor('#111827');
      doc.text(row.name,     cols[0]!.x, y, { width: cols[0]!.width, lineBreak: false });
      doc.text(row.packSize, cols[1]!.x, y, { width: cols[1]!.width, lineBreak: false });
      doc.text(priceStr,     cols[2]!.x, y, { width: cols[2]!.width, lineBreak: false });

      if (showRrp && showRrpMargin) {
        const rrpStr = row.rrp || '—';
        doc.text(rrpStr,     cols[3]!.x, y, { width: cols[3]!.width, lineBreak: false });
        doc.text(marginStr,  cols[4]!.x, y, { width: cols[4]!.width, lineBreak: false });
        doc.text(palletStr,  cols[5]!.x, y, { width: cols[5]!.width, lineBreak: false });
      } else if (showRrp) {
        const rrpStr = row.rrp || '—';
        doc.text(rrpStr,    cols[3]!.x, y, { width: cols[3]!.width, lineBreak: false });
        doc.text(palletStr, cols[4]!.x, y, { width: cols[4]!.width, lineBreak: false });
      } else if (showRrpMargin) {
        doc.text(marginStr,  cols[3]!.x, y, { width: cols[3]!.width, lineBreak: false });
        doc.text(palletStr,  cols[4]!.x, y, { width: cols[4]!.width, lineBreak: false });
      } else {
        doc.text(palletStr, cols[3]!.x, y, { width: cols[3]!.width, lineBreak: false });
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
        50,
        doc.page.height - 45,
        { align: 'center', width: pageW },
      );

    doc.end();
  });
}
