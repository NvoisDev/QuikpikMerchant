export interface PriceRow {
  name: string;
  packSize: string;
  unitPrice: number;
  palletPrice: number | '';
  unitsPerPallet: number | '';
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
}: {
  rows: PriceRow[];
  subtitle: string;
  filename: string;
  logoBuffer?: Buffer;
  logoExtension?: 'png' | 'jpeg' | 'gif';
  businessName: string;
}): Promise<{ wb: any; filename: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Price List');

  ws.getColumn(1).width = 35;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 16;

  // Row 1: business name
  const r1 = ws.addRow([businessName, '', '', '', '']);
  r1.height = 28;
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF16a34a' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  // Row 2: subtitle
  const r2 = ws.addRow([subtitle, '', '', '', '']);
  r2.height = 16;
  r2.getCell(1).font = { size: 9, color: { argb: 'FF6b7280' } };

  // Row 3: spacer
  const r3 = ws.addRow(['', '', '', '', '']);
  r3.height = 8;

  // Logo embedded top-right (rows 0–2, cols 3–4)
  if (logoBuffer && logoExtension) {
    try {
      const imageId = wb.addImage({ buffer: logoBuffer, extension: logoExtension });
      ws.addImage(imageId, { tl: { col: 3, row: 0 }, br: { col: 4.99, row: 2.99 } } as any);
    } catch {}
  }

  // Row 4: column headers
  const headerRow = ws.addRow([
    'Product Name',
    'Pack Size / Unit',
    'Unit Price',
    'Pallet Price',
    'Units per Pallet',
  ]);
  headerRow.height = 20;
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FF1f2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    cell.alignment = { vertical: 'middle' };
  });

  // Data rows
  rows.forEach(row => {
    const dr = ws.addRow([
      row.name,
      row.packSize,
      row.unitPrice,
      row.palletPrice,
      row.unitsPerPallet,
    ]);
    dr.height = 18;
    dr.getCell(3).numFmt = '#,##0.00';
    if (row.palletPrice !== '') dr.getCell(4).numFmt = '#,##0.00';
  });

  return { wb, filename };
}

export async function buildBrandedPdf({
  rows,
  subtitle,
  logoBuffer,
  businessName,
}: {
  rows: PriceRow[];
  subtitle: string;
  logoBuffer?: Buffer;
  businessName: string;
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

    const cols = [
      { label: 'Product Name', x: 50, width: 195 },
      { label: 'Pack Size / Unit', x: 255, width: 108 },
      { label: 'Unit Price', x: 373, width: 80 },
      { label: 'Pallet Price', x: 463, width: 82 },
    ];

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

      doc.fillColor('#111827');
      doc.text(row.name, cols[0]!.x, y, { width: cols[0]!.width, lineBreak: false });
      doc.text(row.packSize, cols[1]!.x, y, { width: cols[1]!.width, lineBreak: false });
      doc.text(priceStr, cols[2]!.x, y, { width: cols[2]!.width, lineBreak: false });
      doc.text(palletStr, cols[3]!.x, y, { width: cols[3]!.width, lineBreak: false });

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
