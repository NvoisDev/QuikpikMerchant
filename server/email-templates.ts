import { formatDeliveryAddress, formatDeliveryAddressHTML } from '../shared/utils/address-formatter';
import { formatDateTime } from '../shared/utils/date';
import type { EmailRefundStatus } from '../shared/schema';

/**
 * Escapes characters with special meaning in HTML so user-supplied values
 * cannot inject markup or scripts when interpolated into email bodies.
 * This is the single shared helper used across all email-building code.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPackDescriptor(
  packQuantity: number | null | undefined,
  unitSize: number | string | null | undefined,
  unitOfMeasure: string | null | undefined
): string {
  if (unitSize && unitOfMeasure) {
    const size = `${parseFloat(String(unitSize))}${unitOfMeasure}`;
    return packQuantity && packQuantity > 1 ? `${packQuantity} × ${size}` : size;
  }
  return '';
}

function formatDeliveryAddressForEmail(address: string): string {
  if (!address) return '';
  return formatDeliveryAddressHTML(address);
}

function formatDeliveryAddressPlainText(address: string): string {
  if (!address) return '';
  const addressLines = formatDeliveryAddress(address);
  return addressLines.join('\n');
}

/**
 * Converts a stored wholesaler logo (which may be a base64 data URL) into a
 * publicly-servable URL suitable for use in emails.
 */
export function getEmailLogoUrl(
  wholesalerId: string | undefined | null,
  logoType: string | null | undefined,
  logoUrl: string | null | undefined,
  updatedAt?: Date | string | null
): string | undefined {
  if (!logoUrl) return undefined;
  if (logoType === 'custom' && wholesalerId) {
    const base = `https://quikpik.app/api/logo/${wholesalerId}`;
    if (updatedAt) {
      const ts = Math.floor(new Date(updatedAt).getTime() / 1000);
      return `${base}?v=${ts}`;
    }
    return base;
  }
  if (logoUrl.startsWith('http')) return logoUrl;
  return undefined;
}

export interface EmailBranding {
  businessName: string;
  logoUrl?: string | null;
  accentColor?: string;
}

function buildHeader(branding: EmailBranding): string {
  const hasHostedLogo = branding.logoUrl && branding.logoUrl.startsWith('http');
  const safeName = escapeHtml(branding.businessName);
  const initials = escapeHtml(
    branding.businessName
      .split(' ')
      .map((w: string) => w[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2)
  );
  if (hasHostedLogo) {
    return '<div style="text-align:center;padding:24px 20px 16px">' +
      '<img src="' + escapeHtml(branding.logoUrl) + '" alt="' + safeName + '" style="max-height:60px;max-width:180px;display:block;margin:0 auto">' +
      '<div style="margin-top:10px;font-size:18px;font-weight:bold;color:#1f2937">' + safeName + '</div>' +
      '</div>';
  }
  return '<div style="text-align:center;padding:24px 20px 16px">' +
    '<div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:#10b981;line-height:56px;font-size:22px;font-weight:bold;color:#fff;text-align:center">' + initials + '</div>' +
    '<div style="margin-top:10px;font-size:18px;font-weight:bold;color:#1f2937">' + safeName + '</div>' +
    '</div>';
}

export function wrapCustomerEmail(body: string, branding: EmailBranding, options?: { preheader?: string }): string {
  const ph = options?.preheader ? '<div style="display:none;max-height:0;overflow:hidden">' + escapeHtml(options.preheader) + '</div>' : '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif">' + ph +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:20px 10px">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px">' +
    '<tr><td style="border-bottom:1px solid #eee">' + buildHeader(branding) + '</td></tr>' +
    '<tr><td style="padding:20px 30px;font-size:15px;line-height:1.6;color:#374151">' + body + '</td></tr>' +
    '<tr><td style="padding:16px 30px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#aaa">' +
    'Questions? Contact <b>' + escapeHtml(branding.businessName) + '</b> directly.<br>' +
    '<span style="font-size:11px">Powered by <a href="https://quikpik.co" style="color:#aaa;text-decoration:none">Quikpik Merchant</a></span>' +
    '</td></tr></table></td></tr></table></body></html>';
}


/**
 * Validates a URL for safe use in an email `href`/`src` attribute. Only allows
 * http(s), mailto, tel and relative/anchor links; anything else (e.g.
 * `javascript:`, `data:`, `vbscript:`) is replaced with a harmless `#` so a
 * user-supplied URL can never execute script when a recipient clicks it.
 */
export function sanitizeEmailUrl(url: string | null | undefined): string {
  const raw = (url ?? '').trim();
  if (!raw) return '#';
  if (raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('?')) return raw;
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  return '#';
}

/**
 * Renders a call-to-action button. The visible `text` and the `url` are treated
 * as untrusted leaf values: `text` is HTML-escaped and `url` is validated +
 * attribute-escaped here, so callers may pass raw user-controlled strings
 * safely. `color` is expected to be a developer-controlled style constant.
 */
export function emailButton(text: string, url: string, color?: string): string {
  const bg = color || '#10b981';
  const href = escapeHtml(sanitizeEmailUrl(url));
  return '<div style="text-align:center;margin:20px 0"><a href="' + href + '" style="display:inline-block;padding:12px 28px;background:' + bg + ';color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:bold">' + escapeHtml(text) + '</a></div>';
}

/**
 * Wraps already-composed HTML in a card container. The `content` is interpolated
 * verbatim (NOT escaped) so callers can compose markup — every user-controlled
 * leaf value inside `content` MUST be escaped at the call site.
 */
export function emailCard(content: string, options?: { borderColor?: string; bgColor?: string }): string {
  const border = options?.borderColor || '#e5e7eb';
  const bg = options?.bgColor || '#f9fafb';
  return '<div style="background:' + bg + ';border:1px solid ' + border + ';border-radius:8px;padding:16px 20px;margin:16px 0">' + content + '</div>';
}

export function emailDivider(): string {
  return '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">';
}

/**
 * Renders a heading. The `text` is treated as an untrusted leaf value and is
 * HTML-escaped here, so callers may pass raw user-controlled strings safely.
 */
export function emailHeading(text: string, options?: { color?: string; size?: string }): string {
  const color = options?.color || '#1f2937';
  const size = options?.size || '18px';
  return '<h2 style="margin:0 0 12px;font-size:' + size + ';font-weight:bold;color:' + color + '">' + escapeHtml(text) + '</h2>';
}

/**
 * Renders a table from already-composed HTML cells. Header and cell strings are
 * interpolated verbatim (NOT escaped) so callers can compose markup (links,
 * spans, formatted prices) — every user-controlled leaf value inside a cell MUST
 * be escaped at the call site.
 */
export function emailTable(headers: string[], rows: string[][]): string {
  const ths = headers.map((h, i) => {
    const align = i === 0 ? 'left' : i === headers.length - 1 ? 'right' : 'center';
    return '<th style="padding:8px;text-align:' + align + ';font-size:12px;color:#6b7280;border-bottom:2px solid #e5e7eb">' + h + '</th>';
  }).join('');
  const trs = rows.map(row => {
    const tds = row.map((cell, i) => {
      const align = i === 0 ? 'left' : i === row.length - 1 ? 'right' : 'center';
      return '<td style="padding:10px 8px;text-align:' + align + ';font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6">' + cell + '</td>';
    }).join('');
    return '<tr>' + tds + '</tr>';
  }).join('');
  return '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0"><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>';
}

/**
 * Renders a small pill/badge. The `text` is treated as an untrusted leaf value
 * and is HTML-escaped here, so callers may pass raw user-controlled strings
 * safely.
 */
export function emailBadge(text: string, color?: string): string {
  const bg = color || '#10b981';
  return '<span style="display:inline-block;padding:3px 10px;background:' + bg + ';color:#fff;border-radius:12px;font-size:12px;font-weight:bold">' + escapeHtml(text) + '</span>';
}

export interface ReadyForCollectionEmailData {
  orderNumber: string;
  customerName: string;
  wholesalerName: string;
  wholesalerLogoUrl?: string | null;
  businessPhone?: string;
  businessAddress?: string;
  collectionAddressName?: string;
  deliveryAddress?: string | null;
  fulfillmentType?: string;
  orderTotal: string;
  readyTime: string;
  orderUrl: string;
}

export interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress?: string;
  total: string;
  subtotal: string;
  platformFee: string;
  customerTransactionFee: string;
  wholesalerPlatformFee: string;
  shippingTotal?: string;
  fulfillmentType: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: string;
    total: string;
    sellingType?: string;
    packDescriptor?: string;
    appliedOfferLabel?: string | null;
    freeItems?: number;
  }>;
  wholesaler: {
    id?: string | null;
    businessName: string;
    firstName: string;
    lastName: string;
    email: string;
    logoUrl?: string | null;
    logoType?: string | null;
  };
  orderDate: string;
  paymentMethod?: string;
  collectionAddressName?: string;
  collectionAddress?: string;
}

export function generateWholesalerOrderNotificationEmail(data: OrderEmailData): { subject: string; html: string; text: string } {
  const subject = 'New Order ' + data.orderNumber + ' - ' + data.customerName;

  let pickupHtml = '';
  if (data.fulfillmentType === 'pickup') {
    let addrDetail = '';
    if (data.collectionAddress) {
      const addrLines = escapeHtml(data.collectionAddress).split(', ').join('<br/>');
      addrDetail = '<br/><span style="color:#6b7280;font-size:13px">' +
        (data.collectionAddressName ? '<b>' + escapeHtml(data.collectionAddressName) + '</b><br/>' : '') +
        addrLines + '</span>';
    }
    pickupHtml = emailCard(
      '<p style="margin:0;color:#92400e"><b>Customer Collection</b>' + addrDetail + '</p>',
      { borderColor: '#f59e0b', bgColor: '#fffbeb' }
    );
  }

  const itemRows = data.items.map(item => {
    const promoNote = item.appliedOfferLabel ? ' 🎁 ' + escapeHtml(item.appliedOfferLabel) : '';
    const freeNote = (item.freeItems ?? 0) > 0 ? ' (+' + item.freeItems + ' free)' : '';
    const packBadge = item.packDescriptor
      ? '<br><span style="color:#6b7280;font-size:11px;">' + escapeHtml(item.packDescriptor) + '</span>'
      : '';
    return [
      escapeHtml(item.productName) + packBadge + promoNote + freeNote,
      item.quantity + ' ' + (item.sellingType === 'pallets' ? 'pallet(s)' : 'units'),
      '\u00A3' + item.unitPrice,
      '\u00A3' + item.total
    ];
  });

  const shippingRow = data.shippingTotal && parseFloat(data.shippingTotal) > 0
    ? '<tr><td style="padding:4px 0">Shipping:</td><td style="padding:4px 0;text-align:right">\u00A3' + data.shippingTotal + '</td></tr>' : '';

  const body = emailHeading('New Order Received', { size: '20px', color: '#10b981' }) +
    '<p style="margin:0 0 4px">Order <b>' + data.orderNumber + '</b></p>' +
    '<p style="margin:0 0 16px;font-size:14px;color:#6b7280">' + formatDateTime(data.orderDate) + '</p>' +
    emailCard(
      '<p style="margin:0 0 4px"><b>Customer:</b> ' + escapeHtml(data.customerName) + '</p>' +
      '<p style="margin:0 0 4px"><b>Email:</b> ' + escapeHtml(data.customerEmail) + '</p>' +
      '<p style="margin:0 0 4px"><b>Phone:</b> ' + escapeHtml(data.customerPhone) + '</p>' +
      '<p style="margin:0 0 4px"><b>Fulfillment:</b> ' + (data.fulfillmentType === 'pickup' ? 'Customer Pickup' : 'Delivery') + '</p>' +
      (data.shippingAddress ? '<p style="margin:0"><b>Address:</b> ' + escapeHtml(data.shippingAddress) + '</p>' : ''),
      { borderColor: '#dbeafe', bgColor: '#eff6ff' }
    ) +
    pickupHtml +
    emailTable(['Product', 'Qty', 'Price', 'Total'], itemRows) +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0">' +
    '<tr><td style="padding:4px 0"><b>Subtotal:</b></td><td style="padding:4px 0;text-align:right">\u00A3' + data.subtotal + '</td></tr>' +
    shippingRow +
    '<tr><td style="padding:4px 0">Platform Fee:</td><td style="padding:4px 0;text-align:right">-\u00A3' + (data.wholesalerPlatformFee || data.platformFee || '0.00') + '</td></tr>' +
    '<tr style="border-top:2px solid #e5e7eb"><td style="padding:8px 0;font-size:16px;font-weight:bold">You receive:</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:bold;color:#10b981">\u00A3' + (parseFloat(data.subtotal) + parseFloat(data.shippingTotal || '0') - parseFloat(data.wholesalerPlatformFee || data.platformFee || '0')).toFixed(2) + '</td></tr>' +
    '</table>' +
    emailButton('View Orders', 'https://quikpik.co/orders');

  const html = wrapCustomerEmail(body, {
    businessName: data.wholesaler.businessName,
    logoUrl: getEmailLogoUrl(data.wholesaler.id, data.wholesaler.logoType, data.wholesaler.logoUrl),
  }, { preheader: 'New order ' + data.orderNumber + ' from ' + data.customerName + ' - \u00A3' + data.total });

  const text = 'New Order ' + data.orderNumber + ' - ' + data.customerName + '\n\n' +
    'Order Date: ' + formatDateTime(data.orderDate) + '\n' +
    'Total: \u00A3' + data.total + '\n' +
    'Fulfillment: ' + (data.fulfillmentType === 'pickup' ? 'Customer Pickup' : 'Delivery') + '\n\n' +
    'Customer: ' + data.customerName + '\nEmail: ' + data.customerEmail + '\nPhone: ' + data.customerPhone + '\n' +
    (data.shippingAddress ? 'Address: ' + data.shippingAddress + '\n' : '') + '\n' +
    'Items:\n' + data.items.map(item => '- ' + item.productName + (item.packDescriptor ? ' (' + item.packDescriptor + ')' : '') + ' x ' + item.quantity + ' @ \u00A3' + item.unitPrice + ' = \u00A3' + item.total).join('\n') + '\n\n' +
    'Subtotal: \u00A3' + data.subtotal + '\n' +
    (data.shippingTotal && parseFloat(data.shippingTotal) > 0 ? 'Shipping: \u00A3' + data.shippingTotal + '\n' : '') +
    'Platform Fee: -\u00A3' + (data.wholesalerPlatformFee || data.platformFee || '0.00') + '\n' +
    'You receive: \u00A3' + (parseFloat(data.subtotal) + parseFloat(data.shippingTotal || '0') - parseFloat(data.wholesalerPlatformFee || data.platformFee || '0')).toFixed(2) + '\n\n' +
    'View orders: https://quikpik.co/orders\nPowered by Quikpik';

  return { subject, html, text };
}

export function generateReadyForCollectionEmail(data: ReadyForCollectionEmailData): { subject: string; html: string; text: string } {
  const isDelivery = data.fulfillmentType === 'delivery';

  const subject = isDelivery
    ? 'Your Order ' + data.orderNumber + ' is Ready for Delivery'
    : 'Your Order ' + data.orderNumber + ' is Ready for Collection';

  const badgeLabel = isDelivery ? 'READY FOR DELIVERY' : 'READY TO COLLECT';
  const badgeColor = isDelivery ? '#2563eb' : '#059669';
  const introText = isDelivery
    ? 'your order is ready and will be on its way shortly.'
    : 'your order is ready for collection.';

  const secondCard = isDelivery
    ? emailCard(
        '<p style="margin:0 0 4px"><b>Supplier:</b> ' + escapeHtml(data.wholesalerName) + '</p>' +
        (data.deliveryAddress ? '<p style="margin:0 0 4px"><b>Delivery To:</b> ' + escapeHtml(data.deliveryAddress) + '</p>' : '') +
        (data.businessPhone ? '<p style="margin:0"><b>Phone:</b> <a href="tel:' + escapeHtml(data.businessPhone) + '" style="color:#2563eb">' + escapeHtml(data.businessPhone) + '</a></p>' : ''),
        { borderColor: '#bfdbfe', bgColor: '#eff6ff' }
      )
    : emailCard(
        '<p style="margin:0 0 4px"><b>Collect From:</b> ' + escapeHtml(data.wholesalerName) + '</p>' +
        (data.collectionAddressName ? '<p style="margin:0 0 2px"><b>Location:</b> ' + escapeHtml(data.collectionAddressName) + '</p>' : '') +
        (data.businessAddress ? '<p style="margin:0 0 4px"><b>Address:</b> ' + escapeHtml(data.businessAddress) + '</p>' : '') +
        (data.businessPhone ? '<p style="margin:0"><b>Phone:</b> <a href="tel:' + escapeHtml(data.businessPhone) + '" style="color:#10b981">' + escapeHtml(data.businessPhone) + '</a></p>' : ''),
        { borderColor: '#dbeafe', bgColor: '#eff6ff' }
      );

  const footerText = isDelivery
    ? 'Your order will be dispatched shortly. ' + escapeHtml(data.wholesalerName) + ' will contact you to arrange delivery.'
    : 'Please contact ' + escapeHtml(data.wholesalerName) + ' to arrange a collection time.';

  const body = '<div style="text-align:center;margin-bottom:16px">' + emailBadge(badgeLabel, badgeColor) + '</div>' +
    '<p style="margin:0 0 16px">Dear ' + escapeHtml(data.customerName) + ', ' + introText + '</p>' +
    emailCard(
      '<p style="margin:0 0 4px"><b>Order:</b> ' + data.orderNumber + '</p>' +
      '<p style="margin:0 0 4px"><b>Total:</b> <span style="color:#10b981;font-weight:bold">\u00A3' + parseFloat(data.orderTotal).toFixed(2) + '</span></p>' +
      '<p style="margin:0"><b>Ready Since:</b> ' + data.readyTime + '</p>'
    ) +
    secondCard +
    '<p style="margin:12px 0;font-size:14px;color:#6b7280">' + footerText + '</p>' +
    emailButton('View Order', data.orderUrl);

  const preheader = isDelivery
    ? 'Order ' + data.orderNumber + ' is ready for delivery'
    : 'Order ' + data.orderNumber + ' is ready for collection';

  const html = wrapCustomerEmail(body, {
    businessName: data.wholesalerName,
    logoUrl: data.wholesalerLogoUrl,
  }, { preheader });

  const text = isDelivery
    ? 'Order ' + data.orderNumber + ' Ready for Delivery\n\n' +
      'Dear ' + data.customerName + ',\n\nYour order is ready and will be on its way shortly.\n\n' +
      'Ready Since: ' + data.readyTime + '\nOrder Total: \u00A3' + parseFloat(data.orderTotal).toFixed(2) + '\n' +
      'Supplier: ' + data.wholesalerName + '\n' +
      (data.deliveryAddress ? 'Delivery To: ' + data.deliveryAddress + '\n' : '') +
      (data.businessPhone ? 'Phone: ' + data.businessPhone + '\n' : '') +
      '\nYour order will be dispatched shortly. ' + data.wholesalerName + ' will contact you to arrange delivery.\n\n' +
      'View Order: ' + data.orderUrl + '\nPowered by Quikpik'
    : 'Order ' + data.orderNumber + ' Ready for Collection\n\n' +
      'Dear ' + data.customerName + ',\n\nYour order is ready for collection.\n\n' +
      'Ready Since: ' + data.readyTime + '\nOrder Total: \u00A3' + parseFloat(data.orderTotal).toFixed(2) + '\n' +
      'Collect From: ' + data.wholesalerName + '\n' +
      (data.collectionAddressName ? 'Location: ' + data.collectionAddressName + '\n' : '') +
      (data.businessAddress ? 'Address: ' + data.businessAddress + '\n' : '') +
      (data.businessPhone ? 'Phone: ' + data.businessPhone + '\n' : '') +
      '\nPlease contact ' + data.wholesalerName + ' to arrange a collection time.\n\n' +
      'View Order: ' + data.orderUrl + '\nPowered by Quikpik';

  return { subject, html, text };
}

export interface RefundLineItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  sellingType?: string;
  packDescriptor?: string;
}

export function buildItemisedRefundEmail(options: {
  customerName: string;
  orderNumber: string;
  isFullCancellation: boolean;
  returnedItems: RefundLineItem[];
  retainedItems?: RefundLineItem[];
  refundAmount: number;
  deliveryRefunded?: number;
  refundStatus?: EmailRefundStatus;
  refundTimeline?: string;
  businessName: string;
  businessPhone?: string;
  businessEmail?: string;
}): string {
  const {
    customerName, orderNumber, isFullCancellation,
    returnedItems, retainedItems, refundAmount,
    deliveryRefunded, refundTimeline, businessName,
    businessPhone, businessEmail,
  } = options;
  const refundStatus = options.refundStatus || (refundAmount > 0 ? 'processed' : 'none');

  const heading = isFullCancellation
    ? emailHeading('Order Cancelled', { size: '22px', color: '#DC2626' })
    : emailHeading('Partial Return Processed', { size: '22px', color: '#EA580C' });

  const intro = '<p style="margin:0 0 8px">Hi ' + escapeHtml(customerName || 'there') + ',</p>' +
    '<p style="margin:0 0 20px">' +
    (isFullCancellation
      ? 'Your order <strong>' + orderNumber + '</strong> with ' + escapeHtml(businessName) + ' has been cancelled.'
      : 'A partial return has been processed for your order <strong>' + orderNumber + '</strong> with ' + escapeHtml(businessName) + '.') +
    '</p>';

  const returnRows = returnedItems.map(item => [
    escapeHtml(item.productName) + (item.packDescriptor ? ' (' + escapeHtml(item.packDescriptor) + ')' : ''),
    item.quantity + ' ' + (item.sellingType === 'pallets' ? 'pallet(s)' : 'unit(s)'),
    '\u00A3' + item.unitPrice.toFixed(2),
    '\u00A3' + (item.unitPrice * item.quantity).toFixed(2),
  ]);

  const returnedLabel = isFullCancellation ? 'Cancelled Items' : 'Returned Items';
  const returnedSection = emailHeading(returnedLabel, { size: '16px', color: '#DC2626' }) +
    emailTable(['Item', 'Qty', 'Unit Price', 'Subtotal'], returnRows);

  let summaryRows = '<tr><td style="padding:4px 0">Items refund:</td><td style="padding:4px 0;text-align:right">\u00A3' +
    (refundAmount - (deliveryRefunded || 0)).toFixed(2) + '</td></tr>';
  if (deliveryRefunded && deliveryRefunded > 0) {
    summaryRows += '<tr><td style="padding:4px 0">Delivery refund:</td><td style="padding:4px 0;text-align:right">\u00A3' +
      deliveryRefunded.toFixed(2) + '</td></tr>';
  }
  summaryRows += '<tr style="border-top:2px solid #e5e7eb"><td style="padding:8px 0;font-weight:bold;font-size:16px">Total Refund:</td>' +
    '<td style="padding:8px 0;text-align:right;font-weight:bold;font-size:16px;color:#DC2626">\u00A3' + refundAmount.toFixed(2) + '</td></tr>';

  const refundSummary = emailCard(
    '<table width="100%" cellpadding="0" cellspacing="0">' + summaryRows + '</table>',
    { borderColor: '#FECACA', bgColor: '#FEF2F2' }
  );

  let retainedSection = '';
  if (retainedItems && retainedItems.length > 0) {
    const retainedRows = retainedItems.map(item => [
      escapeHtml(item.productName) + (item.packDescriptor ? ' (' + escapeHtml(item.packDescriptor) + ')' : ''),
      item.quantity + ' ' + (item.sellingType === 'pallets' ? 'pallet(s)' : 'unit(s)'),
      '\u00A3' + item.unitPrice.toFixed(2),
      '\u00A3' + (item.unitPrice * item.quantity).toFixed(2),
    ]);
    retainedSection = emailCard(
      emailHeading('Items You\'re Keeping', { size: '16px', color: '#059669' }) +
      emailTable(['Item', 'Qty', 'Unit Price', 'Subtotal'], retainedRows),
      { borderColor: '#A7F3D0', bgColor: '#ECFDF5' }
    );
  }

  const timeline = refundTimeline || '5-10 business days';
  let processingNote = '';
  if (refundStatus === 'processed') {
    processingNote = emailCard(
      emailHeading('Processing Information', { size: '16px', color: '#0369a1' }) +
      '<p style="margin:0;color:#0369a1">Your refund has been processed and will appear on your original payment method within ' + timeline + '.</p>',
      { borderColor: '#7dd3fc', bgColor: '#f0f9ff' }
    );
  } else if (refundStatus === 'pending') {
    processingNote = emailCard(
      emailHeading('Refund Pending', { size: '16px', color: '#EA580C' }) +
      '<p style="margin:0;color:#EA580C">Your refund is being arranged and will be processed shortly. You will be notified once it has been completed.</p>',
      { borderColor: '#FED7AA', bgColor: '#FFF7ED' }
    );
  } else {
    processingNote = emailCard(
      '<p style="margin:0;color:#6b7280">No payment was taken for this order, so no refund is required.</p>',
      { borderColor: '#e5e7eb', bgColor: '#f9fafb' }
    );
  }

  const contactBlock = '<p style="margin:20px 0 0;font-size:14px;color:#6b7280">If you have any questions, please contact ' + escapeHtml(businessName) + ':</p>' +
    '<ul style="margin:8px 0;padding-left:20px;font-size:14px;color:#6b7280">' +
    (businessPhone ? '<li>Phone: ' + escapeHtml(businessPhone) + '</li>' : '') +
    (businessEmail ? '<li>Email: ' + escapeHtml(businessEmail) + '</li>' : '') +
    '</ul>';

  return heading + intro + returnedSection + refundSummary + retainedSection + processingNote + contactBlock;
}

const QUIKPIK_BRANDING: EmailBranding = { businessName: 'Quikpik Merchant' };
const UPGRADE_URL = 'https://quikpik.app/subscription-pricing';

const FREE_LIMITS_TABLE = emailTable(
  ['Feature', 'Free Plan Limit'],
  [
    ['Products', '2 maximum'],
    ['Price lists', '2 maximum'],
    ['Broadcast tools', 'Coming soon'],
    ['Team members', '1 only (you)'],
    ['Customer groups', '2 maximum'],
  ]
);

const UPGRADE_PLANS_CARD = emailCard(
  emailHeading('Upgrade anytime to unlock more', { size: '16px', color: '#1d4ed8' }) +
  '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0"><tr>' +
  '<td width="50%" valign="top" style="padding-right:8px"><div style="border:1px solid #dbeafe;border-radius:8px;padding:14px 16px;background:#eff6ff">' +
  '<div style="font-weight:bold;font-size:15px;color:#1d4ed8;margin-bottom:4px">Standard</div>' +
  '<div style="font-size:18px;font-weight:bold;color:#1f2937;margin-bottom:8px">\u00A319.99<span style="font-size:13px;color:#6b7280">/mo</span></div>' +
  '<ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.7">' +
  '<li>5 products</li><li>5 price lists</li><li>Broadcast tools coming soon</li><li>3 team members</li><li>5 customer groups</li></ul>' +
  '</div></td>' +
  '<td width="50%" valign="top" style="padding-left:8px"><div style="border:1px solid #d1fae5;border-radius:8px;padding:14px 16px;background:#ecfdf5">' +
  '<div style="font-weight:bold;font-size:15px;color:#059669;margin-bottom:4px">Premium</div>' +
  '<div style="font-size:18px;font-weight:bold;color:#1f2937;margin-bottom:8px">\u00A339.99<span style="font-size:13px;color:#6b7280">/mo</span></div>' +
  '<ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.7">' +
  '<li>Unlimited products</li><li>Unlimited price lists</li><li>Broadcast tools coming soon</li><li>Unlimited team members</li><li>Unlimited groups</li></ul>' +
  '</div></td>' +
  '</tr></table>',
  { borderColor: '#dbeafe', bgColor: '#f8faff' }
);

export interface DowngradeScheduledEmailData {
  firstName: string;
  email: string;
  businessName: string;
  currentPlan: 'standard' | 'premium' | string;
  effectiveDate: Date;
  productsToLock?: number;
  totalProducts?: number;
  teamMembersToSuspend?: number;
  groupsToArchive?: number;
}

export function generateDowngradeScheduledEmail(data: DowngradeScheduledEmailData): { subject: string; html: string; text: string } {
  const planLabel = data.currentPlan === 'premium' ? 'Premium' : 'Standard';
  const isImmediate = data.effectiveDate.getTime() - Date.now() < 60_000; // within 1 minute = immediate
  const dateStr = isImmediate
    ? 'Today'
    : data.effectiveDate.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const subject = 'Your Quikpik subscription is scheduled to downgrade';

  const currentPlanFeaturesRows: string[][] = data.currentPlan === 'premium'
    ? [
        ['Products', 'Unlimited'],
        ['Price lists', 'Unlimited'],
        ['Broadcast tools', 'Coming soon'],
        ['Team members', 'Unlimited'],
        ['Customer groups', 'Unlimited'],
      ]
    : [
        ['Products', '5 maximum'],
        ['Price lists', '5 maximum'],
        ['Broadcast tools', 'Coming soon'],
        ['Team members', '3 maximum'],
        ['Customer groups', '5 maximum'],
      ];

  const currentFeaturesTable = emailTable(['Feature', planLabel + ' Plan (until ' + dateStr + ')'], currentPlanFeaturesRows);

  const untilNote = isImmediate
    ? '<p style="margin:0;font-size:14px;color:#6b7280">Your plan is being downgraded to Free immediately.</p>'
    : '<p style="margin:0;font-size:14px;color:#6b7280">All ' + planLabel + ' features listed above remain fully active until this date.</p>';

  const impactLines: string[] = [];
  if ((data.productsToLock ?? 0) > 0) {
    const total = data.totalProducts ?? (data.productsToLock ?? 0);
    impactLines.push(
      '<li style="margin-bottom:6px"><b>' + data.productsToLock + '</b> of your ' + total + ' products will be locked (Free limit: 2)</li>'
    );
  }
  if ((data.teamMembersToSuspend ?? 0) > 0) {
    impactLines.push(
      '<li style="margin-bottom:6px"><b>' + data.teamMembersToSuspend + '</b> team member' + ((data.teamMembersToSuspend ?? 0) > 1 ? 's' : '') + ' will lose access (Free plan: owner only)</li>'
    );
  }
  if ((data.groupsToArchive ?? 0) > 0) {
    impactLines.push(
      '<li style="margin-bottom:6px"><b>' + data.groupsToArchive + '</b> customer group' + ((data.groupsToArchive ?? 0) > 1 ? 's' : '') + ' will be archived (Free limit: 2)</li>'
    );
  }
  const impactCard = impactLines.length > 0
    ? emailCard(
        '<p style="margin:0 0 8px;font-weight:bold;color:#92400e">What will be affected ' + (isImmediate ? 'now' : 'on ' + dateStr) + ':</p>' +
        '<ul style="margin:0;padding-left:20px;color:#374151">' + impactLines.join('') + '</ul>' +
        '<p style="margin:8px 0 0;font-size:13px;color:#6b7280">Locked products and suspended members are preserved — they\'ll be restored when you upgrade.</p>',
        { borderColor: '#fcd34d', bgColor: '#fffbeb' }
      )
    : '';

  const body =
    emailHeading('Downgrade Scheduled', { size: '22px', color: '#b45309' }) +
    '<p style="margin:0 0 16px">Hi ' + escapeHtml(data.firstName || 'there') + ',</p>' +
    '<p style="margin:0 0 20px">We\'ve received your request to downgrade your <b>' + planLabel + '</b> subscription. ' +
    'Your account will move to the <b>Free</b> plan' + (isImmediate ? ' now.' : ' at the end of your current billing period.') + '</p>' +
    emailCard(
      '<p style="margin:0 0 4px"><b>Downgrade date:</b> ' + dateStr + '</p>' +
      untilNote,
      { borderColor: '#fde68a', bgColor: '#fffbeb' }
    ) +
    impactCard +
    '<p style="margin:16px 0 8px"><b>What you have on your current ' + planLabel + ' plan:</b></p>' +
    currentFeaturesTable +
    '<p style="margin:16px 0 8px"><b>What changes on the Free plan:</b></p>' +
    FREE_LIMITS_TABLE +
    (isImmediate
      ? ''
      : '<p style="margin:16px 0 8px;font-size:14px;color:#6b7280">Changed your mind? Your ' + planLabel + ' plan remains active until ' + dateStr + '. Contact us to reinstate it.</p>') +
    emailDivider() +
    UPGRADE_PLANS_CARD +
    emailButton('View Plan Options', UPGRADE_URL, '#1d4ed8');

  const html = wrapCustomerEmail(body, QUIKPIK_BRANDING, { preheader: 'Your ' + planLabel + ' plan will downgrade to Free' + (isImmediate ? ' now' : ' on ' + dateStr) });

  const currentFeaturesText = data.currentPlan === 'premium'
    ? 'Current Premium features: Unlimited products, unlimited price lists, broadcast tools coming soon, team members, and groups.'
    : 'Current Standard features: 5 products, 5 price lists, broadcast tools coming soon, 3 team members, 5 customer groups.';

  const impactTextLines: string[] = [];
  if ((data.productsToLock ?? 0) > 0) {
    impactTextLines.push('• ' + data.productsToLock + ' of your products will be locked');
  }
  if ((data.teamMembersToSuspend ?? 0) > 0) {
    impactTextLines.push('• ' + data.teamMembersToSuspend + ' team member(s) will lose access');
  }
  if ((data.groupsToArchive ?? 0) > 0) {
    impactTextLines.push('• ' + data.groupsToArchive + ' customer group(s) will be archived');
  }

  const text =
    'Downgrade Scheduled — ' + dateStr + '\n\n' +
    'Hi ' + (data.firstName || 'there') + ',\n\n' +
    'Your ' + planLabel + ' subscription will move to the Free plan on ' + dateStr + '.\n\n' +
    currentFeaturesText + '\n\n' +
    'Free plan limits: 2 products, 2 price lists, broadcast tools coming soon, 1 team member, 2 customer groups.\n\n' +
    (impactTextLines.length > 0
      ? 'What will be affected ' + (isImmediate ? 'now' : 'on ' + dateStr) + ':\n' + impactTextLines.join('\n') + '\n\n'
      : '') +
    (isImmediate ? '' : 'Changed your mind? Contact us to reinstate your ' + planLabel + ' plan before ' + dateStr + '.\n\n') +
    'View plan options: ' + UPGRADE_URL + '\nPowered by Quikpik Merchant';

  return { subject, html, text };
}

export interface DowngradeEffectiveEmailData {
  firstName: string;
  email: string;
  businessName: string;
  productsLocked?: number;
  teamMembersSuspended?: number;
  groupsArchived?: number;
}

export function generateDowngradeEffectiveEmail(data: DowngradeEffectiveEmailData): { subject: string; html: string; text: string } {
  const subject = 'Your Quikpik plan has changed to Free';

  const effectiveImpactLines: string[] = [];
  if ((data.productsLocked ?? 0) > 0) {
    effectiveImpactLines.push(
      '<li style="margin-bottom:6px"><b>' + data.productsLocked + ' product' + ((data.productsLocked ?? 0) > 1 ? 's' : '') + ' locked</b> — preserved and will unlock when you upgrade</li>'
    );
  }
  if ((data.teamMembersSuspended ?? 0) > 0) {
    effectiveImpactLines.push(
      '<li style="margin-bottom:6px"><b>' + data.teamMembersSuspended + ' team member' + ((data.teamMembersSuspended ?? 0) > 1 ? 's' : '') + ' suspended</b> — they can be reactivated after an upgrade</li>'
    );
  }
  if ((data.groupsArchived ?? 0) > 0) {
    effectiveImpactLines.push(
      '<li style="margin-bottom:6px"><b>' + data.groupsArchived + ' customer group' + ((data.groupsArchived ?? 0) > 1 ? 's' : '') + ' archived</b> — restore by upgrading your plan</li>'
    );
  }
  const effectiveImpactCard = effectiveImpactLines.length > 0
    ? emailCard(
        '<p style="margin:0 0 8px;font-weight:bold;color:#374151">Here\'s what changed on your account:</p>' +
        '<ul style="margin:0;padding-left:20px;color:#374151">' + effectiveImpactLines.join('') + '</ul>',
        { borderColor: '#d1d5db', bgColor: '#f9fafb' }
      )
    : '';

  const body =
    emailHeading('Your plan is now Free', { size: '22px', color: '#374151' }) +
    '<p style="margin:0 0 16px">Hi ' + escapeHtml(data.firstName || 'there') + ',</p>' +
    '<p style="margin:0 0 20px">Your Quikpik subscription has ended and your account is now on the <b>Free plan</b>. ' +
    'You can continue using Quikpik within the following limits:</p>' +
    FREE_LIMITS_TABLE +
    effectiveImpactCard +
    emailDivider() +
    '<p style="margin:0 0 12px;font-weight:bold">Ready to grow again?</p>' +
    UPGRADE_PLANS_CARD +
    emailButton('Upgrade My Plan', UPGRADE_URL, '#1a7a3d');

  const html = wrapCustomerEmail(body, QUIKPIK_BRANDING, { preheader: 'Your subscription has ended — you\'re now on the Free plan' });

  const effectiveImpactText: string[] = [];
  if ((data.productsLocked ?? 0) > 0) {
    effectiveImpactText.push('• ' + data.productsLocked + ' product(s) locked — will unlock when you upgrade');
  }
  if ((data.teamMembersSuspended ?? 0) > 0) {
    effectiveImpactText.push('• ' + data.teamMembersSuspended + ' team member(s) suspended — reactivated after an upgrade');
  }
  if ((data.groupsArchived ?? 0) > 0) {
    effectiveImpactText.push('• ' + data.groupsArchived + ' customer group(s) archived — restore by upgrading');
  }

  const text =
    'Your Quikpik plan has changed to Free\n\n' +
    'Hi ' + (data.firstName || 'there') + ',\n\n' +
    'Your subscription has ended and your account is now on the Free plan.\n\n' +
    'Free plan limits: 2 products, 2 price lists, broadcast tools coming soon, 1 team member, 2 customer groups.\n\n' +
    (effectiveImpactText.length > 0
      ? 'What changed on your account:\n' + effectiveImpactText.join('\n') + '\n\n'
      : '') +
    'To unlock more, upgrade at: ' + UPGRADE_URL + '\n\n' +
    'Standard: \u00A319.99/mo — 5 products, 5 price lists, broadcast tools coming soon, 3 team members\n' +
    'Premium: \u00A339.99/mo — Unlimited products, unlimited price lists, team members, and groups; broadcast tools coming soon\n\n' +
    'Powered by Quikpik Merchant';

  return { subject, html, text };
}

export interface ListingLapseReEngagementEmailData {
  firstName: string;
  email: string;
  businessName: string;
  isPastDue?: boolean;
}

export function generateListingLapseReEngagementEmail(data: ListingLapseReEngagementEmailData): { subject: string; html: string; text: string } {
  const subject = data.isPastDue
    ? 'Action needed: your Quikpik Listing subscription payment failed'
    : 'We miss you — reactivate your Quikpik Listing today';

  const listingFeaturesCard = emailCard(
    emailHeading('What you had with Listing', { size: '15px', color: '#065f46' }) +
    '<table width="100%" cellpadding="0" cellspacing="0"><tbody>' +
    '<tr><td style="padding:5px 0;font-size:14px;color:#374151">✓</td><td style="padding:5px 0 5px 8px;font-size:14px;color:#374151">Public supplier profile — get discovered by retailers</td></tr>' +
    '<tr><td style="padding:5px 0;font-size:14px;color:#374151">✓</td><td style="padding:5px 0 5px 8px;font-size:14px;color:#374151">Up to 10 product listings on the marketplace</td></tr>' +
    '<tr><td style="padding:5px 0;font-size:14px;color:#374151">✓</td><td style="padding:5px 0 5px 8px;font-size:14px;color:#374151">Up to 2 price lists for your customers</td></tr>' +
    '<tr><td style="padding:5px 0;font-size:14px;color:#374151">✓</td><td style="padding:5px 0 5px 8px;font-size:14px;color:#374151">Marketplace & search visibility</td></tr>' +
    '<tr><td style="padding:5px 0;font-size:14px;color:#374151">✓</td><td style="padding:5px 0 5px 8px;font-size:14px;color:#374151">Retailer enquiries & leads direct to you</td></tr>' +
    '</tbody></table>',
    { borderColor: '#a7f3d0', bgColor: '#ecfdf5' }
  );

  const mainMessage = data.isPastDue
    ? '<p style="margin:0 0 16px">Hi ' + escapeHtml(data.firstName || 'there') + ',</p>' +
      '<p style="margin:0 0 20px">We weren\'t able to process the payment for your <b>Listing plan</b>. ' +
      'To keep your supplier profile live and stay visible to retailers, please update your payment details.</p>'
    : '<p style="margin:0 0 16px">Hi ' + escapeHtml(data.firstName || 'there') + ',</p>' +
      '<p style="margin:0 0 20px">Your <b>Listing plan</b> subscription has ended and your supplier profile is no longer visible on the Quikpik marketplace. ' +
      'Reactivating takes just a minute — and at <b>\u00A319.99&nbsp;/&nbsp;month</b> it\'s the easiest way to keep retailers finding you.</p>';

  const ctaText = data.isPastDue ? 'Update Payment & Stay Listed' : 'Reactivate My Listing — \u00A319.99/mo';

  const body =
    emailHeading(data.isPastDue ? 'Payment failed — keep your listing live' : 'Your supplier listing has ended', { size: '22px', color: '#065f46' }) +
    mainMessage +
    listingFeaturesCard +
    emailDivider() +
    '<p style="margin:0 0 6px;color:#6b7280;font-size:13px;text-align:center">Reactivate now and your profile goes live immediately.</p>' +
    emailButton(ctaText, UPGRADE_URL, '#10b981');

  const html = wrapCustomerEmail(body, QUIKPIK_BRANDING, {
    preheader: data.isPastDue
      ? 'Update your payment to keep your Quikpik listing active'
      : 'Your Quikpik Listing has ended — reactivate for \u00A319.99/month',
  });

  const text =
    (data.isPastDue ? 'Payment failed — keep your Quikpik listing live\n\n' : 'Your Quikpik Listing has ended — come back anytime\n\n') +
    'Hi ' + (data.firstName || 'there') + ',\n\n' +
    (data.isPastDue
      ? 'We couldn\'t process the payment for your Listing plan. Please update your payment details to keep your supplier profile visible to retailers.\n\n'
      : 'Your Listing plan subscription has ended and your supplier profile is no longer visible on the Quikpik marketplace.\n\n' +
        'Reactivating is quick and easy — just \u00A319.99/month.\n\n') +
    'What you had with Listing:\n' +
    '• Public supplier profile visible to retailers\n' +
    '• Up to 10 product listings\n' +
    '• Up to 2 price lists\n' +
    '• Marketplace & search visibility\n' +
    '• Retailer enquiries & leads\n\n' +
    (data.isPastDue ? 'Update your payment: ' : 'Reactivate your listing: ') + UPGRADE_URL + '\n\n' +
    'Powered by Quikpik Merchant';

  return { subject, html, text };
}

// ── Plan limits shown in upgrade confirmation email ───────────────────────────

/**
 * Maps any plan ID (including annual variants like `standard_annual_intro`,
 * `premium_annual_intro`) to its canonical base tier so label/limits lookups
 * are always correct regardless of billing interval.
 */
function upgradeEmailBaseTier(planId: string): 'starter' | 'standard' | 'premium' | 'listing' {
  if (planId.startsWith('premium'))  return 'premium';
  if (planId.startsWith('standard')) return 'standard';
  if (planId.startsWith('starter'))  return 'starter';
  if (planId.startsWith('listing'))  return 'listing';
  return 'starter'; // safe fallback — unexpected IDs treated as entry tier
}

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter',
  standard: 'Standard',
  premium: 'Premium',
  listing: 'Listing',
};

const TIER_FEATURES: Record<string, { products: string; teamMembers: string; priceLists: string; groups: string }> = {
  starter:  { products: 'Up to 40',    teamMembers: '1 (you only)',  priceLists: 'Up to 5',   groups: 'Up to 5'   },
  standard: { products: 'Up to 60',    teamMembers: 'Up to 3',       priceLists: 'Up to 10',  groups: 'Up to 10'  },
  premium:  { products: 'Unlimited',   teamMembers: 'Unlimited',      priceLists: 'Unlimited', groups: 'Unlimited' },
  listing:  { products: 'Up to 10',    teamMembers: '1 (you only)',  priceLists: 'Up to 2',   groups: 'Up to 2'   },
};

const TIER_COLOR: Record<string, string> = {
  starter:  '#1d4ed8',
  standard: '#059669',
  premium:  '#7c3aed',
  listing:  '#374151',
};

export interface UpgradeConfirmationEmailData {
  firstName: string;
  newPlanId: string;
  nextBillingDate: Date;
}

export function generateUpgradeConfirmationEmail(data: UpgradeConfirmationEmailData): { subject: string; html: string; text: string } {
  const baseTier  = upgradeEmailBaseTier(data.newPlanId);
  const planLabel = TIER_LABELS[baseTier];
  const features  = TIER_FEATURES[baseTier]!;
  const color     = TIER_COLOR[baseTier]!;
  const dateStr   = data.nextBillingDate.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const featuresTable = emailTable(
    ['What you now have', planLabel + ' Plan'],
    [
      ['Products',        features.products],
      ['Team members',    features.teamMembers],
      ['Price lists',     features.priceLists],
      ['Customer groups', features.groups],
    ],
  );

  const subject = 'You\'re now on the ' + planLabel + ' plan — welcome!';

  const body =
    emailHeading('You\'ve upgraded to ' + planLabel + ' 🎉', { size: '22px', color }) +
    '<p style="margin:0 0 16px">Hi ' + escapeHtml(data.firstName || 'there') + ',</p>' +
    '<p style="margin:0 0 20px">Your subscription has been upgraded to the <b>' + escapeHtml(planLabel) + '</b> plan. ' +
    'Everything listed below is available to you right now — no further action needed.</p>' +
    featuresTable +
    emailCard(
      '<p style="margin:0;font-size:14px;color:#374151"><b>Next billing date:</b> ' + escapeHtml(dateStr) + '</p>',
      { borderColor: '#d1fae5', bgColor: '#f0fdf4' },
    ) +
    emailDivider() +
    '<p style="margin:0 0 12px;color:#6b7280;font-size:14px">If you have any questions about your plan, head to your account settings or reply to this email.</p>' +
    emailButton('Go to my dashboard', 'https://quikpik.app/dashboard', color);

  const html = wrapCustomerEmail(body, QUIKPIK_BRANDING, {
    preheader: 'Your account is now on the ' + planLabel + ' plan',
  });

  const text =
    'You\'ve upgraded to ' + planLabel + '\n\n' +
    'Hi ' + (data.firstName || 'there') + ',\n\n' +
    'Your subscription has been upgraded to the ' + planLabel + ' plan.\n\n' +
    'What you now have:\n' +
    '• Products: '        + features.products    + '\n' +
    '• Team members: '    + features.teamMembers  + '\n' +
    '• Price lists: '     + features.priceLists   + '\n' +
    '• Customer groups: ' + features.groups       + '\n\n' +
    'Next billing date: ' + dateStr + '\n\n' +
    'Go to your dashboard: https://quikpik.app/dashboard\n\n' +
    'Powered by Quikpik Merchant';

  return { subject, html, text };
}